"""The Casora integration."""

from __future__ import annotations

import logging
import os

from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .assets import CasoraAssetsView
from .scripts_view import STUDIO_LOADER, STUDIO_LOADER_KEY, CasoraPanelView, CasoraScriptsView, studio_loader, studio_stamp
from .actions import SERVICES as ACTION_SERVICES, async_setup_actions
from .helfer import async_setup_helfer, async_unload_helfer
from .theme import async_setup_theme, async_unload_theme, remove_old_theme_file
from .lueften_push import async_start as async_start_lueften_push
from .update_push import async_start as async_start_update_push
from .raumklima import async_start as async_start_raumklima
from .settings import async_setup_settings
from .kachelart import async_setup_kachelart
from .versions import async_setup_versions
from .frontend_version import async_setup_frontend_version, set_frontend_stamp
from .updates import async_setup_updates
from .options import async_setup_options
from .template_refresh import async_setup_template_refresh
from .phone_badges import async_setup_phone_badges
from .update_source import LEGACY_OPTIONS
from .ki import KiRunner
from .umstellen import async_setup_umstellen
from .hemma_cleanup import async_hemma_present, async_keep_own_modules, async_setup_hemma_cleanup, is_own_module
from .fonts import CasoraFontsView
from .images import CasoraImagesView, CasoraPhotoView, async_migrate_rooms, async_setup_photos_ws
from .room_icons import CasoraRoomIconsView
from .templates import CasoraTemplatesView
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
        # Seit 1.0.5 auch die der übrigen Casora-Skripte – so steht im ?v= des Laders der
        # Stand des ganzen Dashboard-Codes, und der Hinweis „Casora wurde aktualisiert“
        # (casora-core.js) vergleicht nur diese eine Zahl (frontend_version.py).
        mod_dir = os.path.join(scripts_dir, LOCAL_MODULES_DIR)
        if LOCAL_LOADER in found:
            found[LOCAL_LOADER] = max(found.values())
            if os.path.isdir(mod_dir):
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
    # Stand für casora/version. Im yaml-Modus trägt der Nutzer die Adressen selbst ein,
    # dort gäbe der Hinweis nach „Neu laden“ keine Ruhe – also keiner.
    writable = res is not None and hasattr(res, "async_create_item")
    set_frontend_stamp(hass, stamps.get(LOCAL_LOADER) if writable else None)

    if not writable:
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
        and not is_own_module(i.get("url"))  # eigene Module bleiben bewusst dort (Hemma entfernen)
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
    # Designs first: the frontend is running, and an open dashboard reconnects while Casora
    # still loads. Without the design it would draw in the wrong look that long.
    try:
        await async_setup_theme(hass)
    except Exception:  # noqa: BLE001 - must never stop loading
        _LOGGER.exception("Casora: designs not set up")
    # The cards' actions (formerly scripts in scripts.yaml).
    async_setup_actions(hass)
    # Optionen des früheren Update-Servers (Schlüssel/Adresse/Token) still entfernen – vor dem
    # Update-Listener, damit das kein Neuladen auslöst.
    if any(k in entry.options for k in LEGACY_OPTIONS):
        hass.config_entries.async_update_entry(
            entry, options={k: v for k, v in entry.options.items() if k not in LEGACY_OPTIONS})
    panel_dir = hass.config.path(f"custom_components/{DOMAIN}/panel")

    # Room photos out of www (public /local) into the private folder; once, idempotent (images.py).
    await async_migrate_rooms(hass)
    async_setup_photos_ws(hass)

    scripts_dir = hass.config.path(SCRIPTS_DIR)

    await _sync_script_resources(hass, scripts_dir, keep_hemma=await async_hemma_present(hass))

    # Studio loader: generated in memory and served by CasoraPanelView, nothing is written into the package.
    stamp = await hass.async_add_executor_job(studio_stamp, panel_dir)
    hass.data.setdefault(DOMAIN, {})[STUDIO_LOADER_KEY] = studio_loader(f"{VERSION}.{stamp}")

    if not hass.data.get(f"{DOMAIN}_views"):
        hass.http.register_view(CasoraAssetsView(hass.config.path(ASSETS_DIR)))
        # Skripte gepackt und mit Cache (scripts_view.py) statt HAs statischer Route.
        hass.http.register_view(CasoraScriptsView(scripts_dir))
        # Studio ebenso (statt statischer Route ohne gzip/Cache-Control).
        hass.http.register_view(CasoraPanelView(panel_dir))
        hass.http.register_view(CasoraImagesView())
        hass.http.register_view(CasoraPhotoView())
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
                "module_url": f"{URL_BASE}/{STUDIO_LOADER}?v={VERSION}.{stamp}",
            }
        },
    )
    _LOGGER.debug("Registered Casora panel at /%s", PANEL_URL)

    # Casora-KI: Coaches, Kamera/Pflanzen, Update-Analyse, Rezept (ki.py, sensor.py).
    runner = KiRunner(hass, entry)
    await runner.async_setup()
    await async_setup_umstellen(hass)
    # Helpers and automatic behaviour - formerly a package copied by hand.
    await async_setup_helfer(hass)
    hass.data.setdefault(DOMAIN, {})["ki"] = runner
    # Lüften + Solar-Tipp (raumklima.py) – Sensoren entstehen, sobald Quellen gefunden sind.
    # Persönliche Einstellungen (Studio → „Persönliches“) über den WebSocket.
    async_setup_settings(hass)
    async_setup_kachelart(hass)
    async_setup_versions(hass)
    async_setup_frontend_version(hass)
    # Studio → „Updates“: Versionen und Versionshinweise (updates.py).
    async_setup_updates(hass)
    # Studio → „Einstellungen“: die Optionen der Integration auch im Studio (options.py).
    async_setup_options(hass)
    # Studio → „Einstellungen“ → Hemma: alte Integration entfernen, Dateien übernehmen.
    async_setup_hemma_cleanup(hass)
    # Nach einem Update: unveränderte Vorlagen der Dashboards erneuern (template_refresh.py).
    async_setup_template_refresh(hass)
    # Handy-Raumseite: Raum-Badges wie am Desktop, Variablen zur Laufzeit (phone_badges.py).
    async_setup_phone_badges(hass)
    hass.data[DOMAIN]["raumklima"] = rk = async_start_raumklima(hass, entry)
    async_start_lueften_push(hass, entry, rk)
    # Pausiert seit: überlebt Neustarts, damit alte Pausen nicht wieder auftauchen (media_pause.py).
    from .media_pause import PauseTracker

    hass.data[DOMAIN]["media_pause"] = pause = PauseTracker(hass)
    await pause.async_start()
    # Zeitschalter fürs Halten-Menü: Dienste set_timer/cancel_timer, überleben Neustarts (zeitschalter.py).
    from .zeitschalter import TimerTracker

    hass.data[DOMAIN]["timers"] = timers = TimerTracker(hass)
    await timers.async_start()
    # Tanken im Auto-Popup (tanken.py): Sensoren je Auto/Kraftstoff, Abruf nur mit Einrichtung.
    from .tanken import async_setup_tanken

    await async_setup_tanken(hass)
    # Live-Aktivitäten auf dem Handy (live_activity.py): Geräte wie die Kacheln finden, Store statt Optionen.
    from .live_activity import async_setup_live

    await async_setup_live(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # Push bei neuen Casora-Versionen (update_push.py) – erst jetzt steht fest, ob HACS Casora verwaltet.
    hass.data[DOMAIN]["update_push"] = await async_start_update_push(hass, entry)
    entry.async_on_unload(entry.add_update_listener(_options_changed))
    hass.data[DOMAIN]["options_seen"] = dict(entry.options)

    return True


# Options read at run time (lueften_push.py and update_push.py read entry.options on every check,
# ki.ai_models the typed model names on every call): saving them needs no reload of the integration.
LIVE_OPTIONS = frozenset({"lueften_push", "lueften_personen", "update_push", "ai_task_models"})


def live_only(old: dict, new: dict) -> bool:
    """True, wenn sich nur Optionen geändert haben, die ohne Neuladen wirken."""
    keys = {k for k in set(old) | set(new) if old.get(k) != new.get(k)}
    return bool(keys) and keys <= LIVE_OPTIONS


async def _options_changed(hass: HomeAssistant, entry: ConfigEntry) -> None:
    data = hass.data.setdefault(DOMAIN, {})
    seen = data.get("options_seen")
    data["options_seen"] = dict(entry.options)
    if seen is not None and live_only(seen, dict(entry.options)):
        return
    # Beim Neuladen bleibt die Studio-Seite registriert: Wer gerade im Studio „Speichern“ drückt,
    # landete sonst auf einem anderen Dashboard (HA entfernt die Seite kurz).
    data["reloading"] = True
    try:
        await hass.config_entries.async_reload(entry.entry_id)
    finally:
        hass.data.setdefault(DOMAIN, {}).pop("reloading", None)


async def _remove_script_resources(hass: HomeAssistant) -> None:
    """Drop the Lovelace resources pointing at /casora_scripts/.

    Left behind, every page keeps requesting them, and an app that cached the
    script keeps running it after Casora is gone.
    """
    res = _lovelace_resources(hass)
    if res is None or not hasattr(res, "async_delete_item"):
        return
    try:
        if not getattr(res, "loaded", False):
            await res.async_load()
            res.loaded = True
        items = list(res.async_items())
    except Exception:  # noqa: BLE001 - removal must not fail over the resource list
        _LOGGER.exception("Casora: could not read the Lovelace resource list")
        return
    for item in items:
        url = str(item.get("url", ""))
        if not url.startswith(SCRIPTS_URL_BASE + "/"):
            continue
        try:
            await res.async_delete_item(item["id"])
        except Exception:  # noqa: BLE001
            _LOGGER.exception("Casora: could not remove %s", url)


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Integration removed: drop the former theme copy in the theme folder and the script resources."""
    await hass.async_add_executor_job(remove_old_theme_file, hass.config.config_dir)
    await _remove_script_resources(hass)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Remove the sidebar entry."""
    if not hass.data.get(DOMAIN, {}).get("reloading"):
        async_remove_panel(hass, PANEL_URL, warn_if_unknown=False)
    async_unload_helfer(hass)
    async_unload_theme(hass)
    # Otherwise they stay callable until the restart, even after removing Casora.
    for name in ("einrichten", "umstellen", *ACTION_SERVICES):
        hass.services.async_remove(DOMAIN, name)
    runner = hass.data.get(DOMAIN, {}).pop("ki", None)
    if runner:
        await runner.async_unload()
    rk = hass.data.get(DOMAIN, {}).pop("raumklima", None)
    if rk:
        rk.stop()
    pause = hass.data.get(DOMAIN, {}).pop("media_pause", None)
    if pause:
        pause.stop()
    timers = hass.data.get(DOMAIN, {}).pop("timers", None)
    if timers:
        timers.stop()
    upush = hass.data.get(DOMAIN, {}).pop("update_push", None)
    if upush:
        upush.stop()
    tk = hass.data.get(DOMAIN, {}).pop("tanken", None)
    if tk:
        tk.stop()
    live = hass.data.get(DOMAIN, {}).pop("live", None)
    if live:
        live.stop()
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
