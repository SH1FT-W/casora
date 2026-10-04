"""The Casora integration."""

from __future__ import annotations

import logging
import os

from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .assets import CasoraAssetsView
from .scripts_view import CasoraScriptsView
from .helfer import async_setup_helfer, async_unload_helfer
from .lueften_push import async_start as async_start_lueften_push
from .raumklima import async_start as async_start_raumklima
from .settings import async_setup_settings
from .kachelart import async_setup_kachelart
from .versions import async_setup_versions
from .updates import async_setup_updates
from .options import async_setup_options
from .template_refresh import async_setup_template_refresh
from .card_updates import async_setup_card_updates, async_unload_card_updates
from .update_source import LEGACY_OPTIONS
from .ki import KiRunner
from .umstellen import async_setup_umstellen
from .hemma_cleanup import async_hemma_present, async_keep_own_modules, async_setup_hemma_cleanup, is_own_module
from .fonts import CasoraFontsView
from .images import CasoraImagesView
from .room_icons import CasoraRoomIconsView
from .templates import CasoraTemplatesView, rebuild_if_stale
from .const import (
    ASSETS_DIR,
    DOMAIN,
    PANEL_ICON,
    PANEL_TITLE,
    LEGACY_PANEL_URL,
    LEGACY_RESOURCES,
    LEGACY_SCRIPT_BASES,
    LOCAL_LOADER,
    LOCAL_MODULES_DIR,
    PANEL_URL,
    SCRIPTS_DIR,
    SCRIPTS_URL_BASE,
    SHARED_SCRIPTS,
    URL_BASE,
    VERSION,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor", "binary_sensor", "update"]


def _lovelace_resources(hass: HomeAssistant):
    """Lovelace's resource collection, or None.

    Read only. The shape has moved between HA versions - a dict in older ones,
    a dataclass now - and resources are read-only when Lovelace runs in yaml
    mode, so every access is defensive: a wrong guess here must never stop the
    integration loading.
    """
    try:
        data = hass.data.get("lovelace")
        if data is None:
            return None
        res = getattr(data, "resources", None)
        if res is None and isinstance(data, dict):
            res = data.get("resources")
        return res if hasattr(res, "async_items") else None
    except Exception:  # noqa: BLE001 - never break setup over a log line
        return None


async def _sync_script_resources(hass: HomeAssistant, scripts_dir: str, keep_hemma: bool = False) -> None:
    """Point Lovelace at the scripts this integration serves.

    Resources are read-only in yaml mode, so there the URLs are reported and
    the user adds them. An entry still loading from /local is repointed rather
    than duplicated: two entries for one script run it twice.

    keep_hemma: Hemma ist noch installiert – dann bleiben seine Ressourcen
    (/hemma_scripts/…), sonst trägt Hemma sie bei jedem Start wieder ein und
    Casora löscht sie wieder. Entfernen: Studio → Einstellungen → Hemma.
    """
    def _present() -> dict[str, int]:
        found = {}
        for n in SHARED_SCRIPTS:
            path = os.path.join(scripts_dir, n)
            if os.path.isfile(path):
                found[n] = int(os.path.getmtime(path))
        # Der Lader reicht seine Version an die Module weiter: jüngste Änderung zählt.
        mod_dir = os.path.join(scripts_dir, LOCAL_MODULES_DIR)
        if LOCAL_LOADER in found and os.path.isdir(mod_dir):
            for m in os.listdir(mod_dir):
                if m.endswith(".js"):
                    found[LOCAL_LOADER] = max(found[LOCAL_LOADER], int(os.path.getmtime(os.path.join(mod_dir, m))))
        return found

    stamps = await hass.async_add_executor_job(_present)
    names = list(stamps)
    if not names:
        _LOGGER.warning(
            "Casora: no shared scripts found in %s; the dashboard needs them",
            scripts_dir,
        )
        return

    wanted = {n: f"{SCRIPTS_URL_BASE}/{n}?v={stamps[n]}" for n in names}
    res = _lovelace_resources(hass)

    if res is None or not hasattr(res, "async_create_item"):
        _LOGGER.warning(
            "Casora: Lovelace resources are not writable (yaml mode). Add these "
            "under lovelace: resources: as type module: %s",
            ", ".join(wanted[n] for n in names),
        )
        return

    try:
        if not getattr(res, "loaded", False):
            await res.async_load()
            res.loaded = True
    except Exception:  # noqa: BLE001 - a resource list must never block setup
        _LOGGER.exception("Casora: could not read the Lovelace resource list")
        return

    items = list(res.async_items())
    # Auch Casora-Skripte, die es nicht mehr gibt (z. B. swipe-card-patch.js ab 0.3),
    # sonst lädt der Browser sie weiter und meldet 404.
    gone = [i for i in items if str(i.get("url", "")).startswith(SCRIPTS_URL_BASE + "/")
            and str(i.get("url", "")).partition("?")[0].rsplit("/", 1)[-1] not in SHARED_SCRIPTS]
    # Eigene Module des Nutzers unter Hemmas Adresse (/hemma_scripts/mein-modul.js) bleiben – ohne
    # Hemma auf eine Adresse umgestellt, die weiter lädt (hemma_cleanup.async_keep_own_modules).
    legacy = [] if keep_hemma else [
        i for i in items if (str(i.get("url", "")).partition("?")[0] in LEGACY_RESOURCES
        or str(i.get("url", "")).startswith(LEGACY_SCRIPT_BASES)) and not is_own_module(i.get("url"))]
    if not keep_hemma:
        try:
            await async_keep_own_modules(hass, res, [i for i in items if is_own_module(i.get("url"))])
        except Exception:  # noqa: BLE001 - nie den Start aufhalten
            _LOGGER.exception("Casora: eigene Module nicht umgestellt")
    for item in legacy + gone:
        try:
            await res.async_delete_item(item["id"])
            _LOGGER.info("Casora: alte Ressource %s entfernt", item.get("url"))
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Casora: konnte %s nicht entfernen", item.get("url"))
    items = list(res.async_items())
    by_url = {str(i.get("url", "")): i for i in items}

    added: list[str] = []
    moved: list[str] = []
    for name, url in wanted.items():
        if url in by_url:
            continue
        existing = next(
            (
                i
                for i in items
                if str(i.get("url", "")).partition("?")[0].endswith("/" + name)
                and (
                    str(i.get("url", "")).startswith("/local/")
                    or str(i.get("url", "")).startswith(SCRIPTS_URL_BASE + "/")
                )
            ),
            None,
        )
        try:
            if existing is not None:
                await res.async_update_item(existing["id"], {"url": url})
                moved.append(name)
            else:
                await res.async_create_item({"res_type": "module", "url": url})
                added.append(name)
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Casora: could not register %s", url)

    orphans = [
        str(i.get("url", ""))
        for i in items
        if str(i.get("url", "")).startswith("/local/hemma/scripts/")
        and not any(str(i.get("url", "")).partition("?")[0].endswith("/" + n) for n in names)
    ]
    if orphans:
        _LOGGER.warning(
            "Casora: these resources point at scripts Casora no longer ships. "
            "Remove them under Settings > Dashboards > Resources: %s",
            ", ".join(sorted(orphans)),
        )

    if added or moved:
        _LOGGER.info(
            "Casora: registered %d and repointed %d dashboard resource(s); "
            "refresh the browser once to load them (the ?v= stamp is the file's "
            "mtime, so an edited script gets a URL no cache can answer)",
            len(added),
            len(moved),
        )


async def async_migrate_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """1.0.3: ki_auto → KI-Zeitpläne je Funktion (bestehende Installationen behalten ihr Verhalten)."""
    if entry.version == 1 and entry.minor_version < 2:
        from .ki import migrate_options

        hass.config_entries.async_update_entry(entry, options=migrate_options(dict(entry.options)), minor_version=2)
        _LOGGER.info("Casora: KI-Zeitpläne aus ki_auto übernommen")
    return entry.version == 1


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Register the panel assets and the sidebar entry."""
    # Optionen des früheren Update-Servers (Schlüssel/Adresse/Token) still entfernen – vor dem
    # Update-Listener, damit das kein Neuladen auslöst.
    if any(k in entry.options for k in LEGACY_OPTIONS):
        hass.config_entries.async_update_entry(
            entry, options={k: v for k, v in entry.options.items() if k not in LEGACY_OPTIONS})
    panel_dir = hass.config.path(f"custom_components/{DOMAIN}/panel")

    # The bundle is derived from the template tree, so rebuild before the panel loads.
    await hass.async_add_executor_job(rebuild_if_stale, hass.config.config_dir)

    scripts_dir = hass.config.path(SCRIPTS_DIR)

    try:
        await hass.http.async_register_static_paths(
            [StaticPathConfig(URL_BASE, panel_dir, False)]
        )
    except RuntimeError:
        _LOGGER.debug("Casora: %s is already served", URL_BASE)

    await _sync_script_resources(hass, scripts_dir, keep_hemma=await async_hemma_present(hass))

    def _stamp() -> int:
        # Jüngste Änderung von Panel, Übersetzung und Lader – sonst liefert der Cache Altes.
        stamps = []
        for name in ("casora-panel.js", "casora-panel-i18n.js", "casora-panel-addons.js", "casora-panel-types.js", "casora-panel-import.js", "casora-panel-assist.js", "casora-panel-welcome.js", "casora-panel-personal.js", "casora-panel-umzug.js", "casora-panel-basis.js", "casora-panel-versions.js", "casora-panel-updates.js", "casora-panel-settings.js", "casora-panel-popups.js", "casora-panel-kachelart.js", "casora-panel-b.js"):
            try:
                stamps.append(int(os.path.getmtime(os.path.join(panel_dir, name))))
            except OSError:
                pass
        return max(stamps, default=0)

    stamp = await hass.async_add_executor_job(_stamp)

    def _write_loader() -> None:
        # Statische Imports (siehe Kommentar in der Datei) – die Version steckt
        # im Pfad, damit Browser nach einem Update nie alte Teile aus dem Cache nehmen.
        v = f"{VERSION}.{stamp}"
        body = (
            "// Von der Casora-Integration beim Start erzeugt – nicht von Hand bearbeiten.\n"
            "// Lädt zuerst die Übersetzung, dann das (unveränderte) Casora-Panel. Statische\n"
            "// Imports, weil HA das Element sonst vor seiner Definition anlegt.\n"
            f'import "./casora-panel-i18n.js?v={v}";\n'
            f'import "./casora-panel-types.js?v={v}";\n'
            f'import "./casora-panel.js?v={v}";\n'
            f'import "./casora-panel-import.js?v={v}";\n'
            f'import "./casora-panel-assist.js?v={v}";\n'
            f'import "./casora-panel-personal.js?v={v}";\n'
            f'import "./casora-panel-umzug.js?v={v}";\n'
            f'import "./casora-panel-basis.js?v={v}";\n'
            f'import "./casora-panel-versions.js?v={v}";\n'
            f'import "./casora-panel-updates.js?v={v}";\n'
            f'import "./casora-panel-settings.js?v={v}";\n'
            f'import "./casora-panel-popups.js?v={v}";\n'
            f'import "./casora-panel-kachelart.js?v={v}";\n'
            f'import "./casora-panel-addons.js?v={v}";\n'
            f'import "./casora-panel-welcome.js?v={v}";\n'
            f'import "./casora-panel-b.js?v={v}";\n'
        )
        path = os.path.join(panel_dir, "casora-studio.js")
        try:
            with open(path, encoding="utf-8") as f:
                if f.read() == body:
                    return
        except OSError:
            pass
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)

    await hass.async_add_executor_job(_write_loader)

    if not hass.data.get(f"{DOMAIN}_views"):
        hass.http.register_view(CasoraAssetsView(hass.config.path(ASSETS_DIR)))
        # Skripte gepackt und mit Cache (scripts_view.py) statt HAs statischer Route.
        hass.http.register_view(CasoraScriptsView(scripts_dir))
        hass.http.register_view(CasoraImagesView())
        hass.http.register_view(CasoraFontsView())
        hass.http.register_view(CasoraRoomIconsView())
        hass.http.register_view(CasoraTemplatesView())
        hass.data[f"{DOMAIN}_views"] = True

    # Remove first so a version bump re-registers cleanly instead of being skipped.
    async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)
    async_remove_panel(hass, LEGACY_PANEL_URL, warn_if_unknown=False)
    async_register_built_in_panel(
        hass=hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL,
        require_admin=True,
        config={
            "_panel_custom": {
                "name": "casora-panel",
                "embed_iframe": False,
                "trust_external": False,
                "module_url": f"{URL_BASE}/casora-studio.js?v={VERSION}.{stamp}",
            }
        },
    )
    _LOGGER.debug("Registered Casora panel at /%s", PANEL_URL)

    # Casora-KI: Coaches, Kamera/Pflanzen, Update-Analyse, Rezept (ki.py, sensor.py).
    runner = KiRunner(hass, entry)
    await runner.async_setup()
    await async_setup_umstellen(hass)
    # Helfer, Skripte, Automatik und Theme – früher Paket + Theme-Ordner von Hand.
    await async_setup_helfer(hass)
    hass.data.setdefault(DOMAIN, {})["ki"] = runner
    # Lüften + Solar-Tipp (raumklima.py) – Sensoren entstehen, sobald Quellen gefunden sind.
    # Persönliche Einstellungen (Studio → „Persönliches“) über den WebSocket.
    async_setup_settings(hass)
    async_setup_kachelart(hass)
    async_setup_versions(hass)
    # Studio → „Updates“: Versionen und Versionshinweise (updates.py).
    async_setup_updates(hass)
    # Studio → „Einstellungen“: die Optionen der Integration auch im Studio (options.py).
    async_setup_options(hass)
    # Studio → „Einstellungen“ → Hemma: alte Integration entfernen, Dateien übernehmen.
    async_setup_hemma_cleanup(hass)
    # Nach einem Update: unveränderte Vorlagen der Dashboards erneuern (template_refresh.py).
    async_setup_template_refresh(hass)
    # Karten-Updates: Vorlagen-Fixes aus „karten-…“-Releases (card_updates.py).
    async_setup_card_updates(hass)
    hass.data[DOMAIN]["raumklima"] = rk = async_start_raumklima(hass, entry)
    async_start_lueften_push(hass, entry, rk)
    # Pausiert seit: überlebt Neustarts, damit alte Pausen nicht wieder auftauchen (media_pause.py).
    from .media_pause import PauseTracker

    hass.data[DOMAIN]["media_pause"] = pause = PauseTracker(hass)
    await pause.async_start()
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_options_changed))

    return True


async def _options_changed(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the sidebar entry."""
    async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)
    async_unload_helfer(hass)
    async_unload_card_updates(hass)
    runner = hass.data.get(DOMAIN, {}).pop("ki", None)
    if runner:
        await runner.async_unload()
    rk = hass.data.get(DOMAIN, {}).pop("raumklima", None)
    if rk:
        rk.stop()
    pause = hass.data.get(DOMAIN, {}).pop("media_pause", None)
    if pause:
        pause.stop()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
