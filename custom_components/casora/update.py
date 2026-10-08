"""Casora-Updates ohne HACS – direkt aus den Releases des öffentlichen GitHub-Repos.

Casora fragt selbst und anonym bei GitHub (update_source.py) nach neuen Releases und
bietet sie unter Einstellungen → Updates an, wie jede andere Integration. Verwaltet HACS
Casora schon, übernimmt HACS das – dann legt Casora keine eigene Update-Entität an,
sonst stünde dieselbe Version doppelt unter Updates.
„Installieren“ lädt das Release, sichert die laufende Fassung nach /config/casora_sicherungen/ und legt die neue
in einen Wartebereich (/config/casora_update_neu). Erst wenn Home Assistant beendet wird, tauscht
Casora den Ordner custom_components/casora – so passen Oberfläche und Server-Code bis zum Neustart
zusammen. Den Neustart löst Casora nicht selbst aus, sondern meldet ihn als Reparatur-Hinweis.
"""
from __future__ import annotations

import errno
import io
import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import timedelta
from typing import Any

from homeassistant.components.update import UpdateEntity, UpdateEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STOP
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN, UPDATE_REPO, VERSION
from .release_notes import (
    changelog_file,
    ha_markdown,
    is_prerelease,
    latest_casora,
    newer,
    norm_version,
    notes_lang,
    parse_changelog,
    pick_notes,
    summarize,
)
from .update_source import (  # noqa: F401 – error_code: frühere Importstelle
    OPT_BETA,
    download_release,
    UpdateSourceError,
    error_code,
    error_text,
    fetch_releases,
)

_LOGGER = logging.getLogger(__name__)

SCAN_INTERVAL = timedelta(hours=6)
# Wann zuletzt geprüft wurde, und wartet eine installierte Version auf den Neustart?
# (Studio → „Updates“, updates.py)
DATA_LAST_CHECK = "update_last_check"
DATA_PENDING = "update_pending"
DATA_LAST_ERROR = "update_last_error"
DATA_HACS = "update_via_hacs"
# GitHub-ID des Casora-Repos in HACS (= unique_id von HACS' Update-Entität), wenn HACS Casora verwaltet.
DATA_HACS_ID = "update_hacs_repo_id"
DATA_STAGE_LISTENER = "update_stage_listener"
STAGE_DIR = "casora_update_neu"
HISTORY_KEY = f"{DOMAIN}.update_history"


def _history_store(hass: HomeAssistant) -> Store:
    data = hass.data.setdefault(DOMAIN, {})
    if "update_history" not in data:
        data["update_history"] = Store(hass, 1, HISTORY_KEY)
    return data["update_history"]


async def async_load_history(hass: HomeAssistant) -> list[dict]:
    """Installationen über das Studio/Updates: [{version, ts, from}], älteste zuerst."""
    raw = await _history_store(hass).async_load() or {}
    return [x for x in raw.get("installs", []) if isinstance(x, dict) and x.get("version")]


async def async_record_install(hass: HomeAssistant, version: str, previous: str) -> None:
    items = await async_load_history(hass)
    items.append({"version": version, "ts": dt_util.utcnow().isoformat(), "from": previous})
    await _history_store(hass).async_save({"installs": items[-100:]})


def install_zip(data: bytes, target: str, backups: str, backup_name: str) -> None:
    """Release-Archiv auspacken: custom_components/casora daraus nach target, alte Fassung als Zip sichern."""
    staged = target + ".neu"
    stage_zip(data, target, backups, backup_name, staged)
    swap_in(staged, target)


def stage_zip(data: bytes, target: str, backups: str, backup_name: str, staged: str) -> None:
    """Wie install_zip, legt die neue Fassung aber nur fertig nach staged (Tausch später mit swap_in)."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        # Das Archiv hat einen Wurzelordner „<owner>-<repo>-<sha>/“.
        prefix = next((n.split("custom_components/")[0] for n in zf.namelist()
                       if n.endswith("custom_components/casora/manifest.json")), None)
        if prefix is None:
            raise RuntimeError("Im Release fehlt custom_components/casora")
        src = prefix + "custom_components/casora/"
        with tempfile.TemporaryDirectory() as tmp:
            new = os.path.join(tmp, "casora")
            for name in zf.namelist():
                if not name.startswith(src) or name.endswith("/"):
                    continue
                dest = os.path.normpath(os.path.join(new, name[len(src):]))
                if not dest.startswith(new + os.sep):
                    raise RuntimeError("Ungültiger Pfad im Release")
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                with zf.open(name) as fsrc, open(dest, "wb") as fdst:
                    shutil.copyfileobj(fsrc, fdst)
            if not os.path.exists(os.path.join(new, "manifest.json")):
                raise RuntimeError("Release unvollständig")
            # Der Studio-Lader panel/casora-studio.js entsteht erst beim Start (__init__._write_loader,
            # nicht im Repo) – mitnehmen, sonst gibt das Studio bis zum Neustart 404.
            loader = os.path.join("panel", "casora-studio.js")
            if os.path.isfile(os.path.join(target, loader)) and not os.path.exists(os.path.join(new, loader)):
                os.makedirs(os.path.join(new, "panel"), exist_ok=True)
                shutil.copy2(os.path.join(target, loader), os.path.join(new, loader))
            # Laufende Fassung sichern, dann ersetzen.
            os.makedirs(backups, exist_ok=True)
            if os.path.isdir(target):
                shutil.make_archive(os.path.join(backups, backup_name), "zip", target)
            # Erst vollständig neben das Ziel kopieren (Speicher voll, Rechte …: das Ziel bleibt
            # unberührt), dann nur noch umbenennen.
            shutil.rmtree(staged, ignore_errors=True)
            try:
                shutil.copytree(new, staged)
            except BaseException:
                shutil.rmtree(staged, ignore_errors=True)
                raise


def swap_in(staged: str, target: str) -> None:
    """Fertig kopierte Fassung an die Stelle von target setzen; scheitert das, kommt die alte zurück."""
    old = target + ".alt"
    shutil.rmtree(old, ignore_errors=True)
    had = os.path.isdir(target)
    if had:
        os.replace(target, old)
    try:
        try:
            os.replace(staged, target)
        except OSError as err:
            if err.errno != errno.EXDEV:
                raise
            # Wartebereich auf einem anderen Laufwerk (eigene Docker-Einbindung): kopieren.
            try:
                shutil.copytree(staged, target)
            except BaseException:
                shutil.rmtree(target, ignore_errors=True)
                raise
            shutil.rmtree(staged, ignore_errors=True)
    except BaseException:
        if had and not os.path.exists(target):
            os.replace(old, target)
        raise
    shutil.rmtree(old, ignore_errors=True)


def _hacs_repo_id(path: str) -> str | None:
    """GitHub-ID von UPDATE_REPO in HACS' Liste, wenn dort installiert (.storage/hacs.repositories).

    HACS nimmt diese ID als unique_id seiner Update-Entität."""
    try:
        with open(path, encoding="utf-8") as fh:
            repos = (json.load(fh) or {}).get("data") or {}
    except (OSError, ValueError, AttributeError):
        return None
    want = UPDATE_REPO.lower()
    for key, r in (repos.items() if isinstance(repos, dict) else []):
        if isinstance(r, dict) and str(r.get("full_name") or "").lower() == want and r.get("installed"):
            return str(r.get("id") or key)
    return None


def _read_hacs(path: str) -> bool:
    """Steht UPDATE_REPO in HACS' Liste als installiert? (.storage/hacs.repositories)"""
    return _hacs_repo_id(path) is not None


def beta_enabled(entry: ConfigEntry | None) -> bool:
    """Option „Beta-Versionen“ an? Standard aus."""
    return bool(entry is not None and (entry.options or {}).get(OPT_BETA, False))


def pick_latest(releases: list[dict], installed: str, beta: bool) -> tuple[dict | None, str]:
    """Release und angebotene Version → (Release, latest_version).

    Mit beta zählen Vorabversionen mit, die höchste Version gewinnt. Ohne beta nur
    stabile; wer eine Beta installiert hat, bekommt erst die nächste höhere stabile
    angeboten, nie eine ältere (kein Zurückstufen).
    """
    rel = latest_casora(releases, beta=beta)
    if rel is None:
        return None, installed
    latest = str(rel.get("tag_name") or "").lstrip("v") or installed
    return rel, (latest if newer(latest, installed) else installed)


async def async_hacs_managed(hass: HomeAssistant) -> bool:
    """Verwaltet HACS Casora? Aus der gespeicherten Liste – HACS muss dafür noch nicht geladen sein.

    Merkt sich dabei die Repo-ID (DATA_HACS_ID), über die casora_update_entity HACS' Eintrag findet."""
    rid = await hass.async_add_executor_job(_hacs_repo_id, hass.config.path(".storage", "hacs.repositories"))
    hass.data.setdefault(DOMAIN, {})[DATA_HACS_ID] = rid
    return rid is not None


def _own_unique_id(entry) -> str:
    return f"{entry.entry_id}_update"


@callback
def casora_update_entity(hass: HomeAssistant, entry) -> tuple[str | None, str | None]:
    """Update-Entität, über die Casora aktualisiert wird → (entity_id, "hacs" | "casora").

    Mit HACS: HACS' Update-Entität für das Casora-Repo – gefunden über Plattform hacs und die
    Repo-ID als unique_id; fehlt die (HACS-Liste anders aufgebaut), über die release_url, die
    auf UPDATE_REPO zeigt. Ohne HACS die eigene (update.py). Nichts gefunden → (None, Quelle).
    """
    data = hass.data.get(DOMAIN, {})
    reg = er.async_get(hass)
    if data.get(DATA_HACS):
        rid = data.get(DATA_HACS_ID)
        eid = reg.async_get_entity_id("update", "hacs", str(rid)) if rid else None
        if eid is None:
            repo = "/" + UPDATE_REPO.lower() + "/"
            hits = []
            for e in list(reg.entities.values()):
                if e.domain != "update" or e.platform == DOMAIN:
                    continue
                st = hass.states.get(e.entity_id)
                url = str((st.attributes.get("release_url") if st else "") or "").lower()
                if repo in url + "/":
                    hits.append((e.platform != "hacs", e.entity_id))
            eid = min(hits)[1] if hits else None
        return eid, "hacs"
    if entry is None:
        return None, None
    return reg.async_get_entity_id("update", DOMAIN, _own_unique_id(entry)), "casora"


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    # Mit HACS meldet HACS neue Versionen – eine zweite Update-Entität wäre doppelt.
    hacs = await async_hacs_managed(hass)
    data = hass.data.setdefault(DOMAIN, {})
    data[DATA_HACS] = hacs
    if hacs:
        # Eigene Update-Entität aus der Zeit vor HACS: bliebe sonst als „nicht verfügbar“ stehen,
        # und das Studio fand sie statt HACS' Eintrag (Installieren tat dann nichts).
        try:
            reg = er.async_get(hass)
            old = reg.async_get_entity_id("update", DOMAIN, _own_unique_id(entry))
            if old:
                reg.async_remove(old)
        except Exception as err:  # noqa: BLE001 – Aufräumen darf den Start nie stören
            _LOGGER.debug("Casora: alte Update-Entität nicht entfernt: %s", err)
    if not data.get(DATA_PENDING):
        # Reste eines Wartebereichs, der beim letzten Beenden nicht mehr eingespielt wurde (Absturz,
        # Stromausfall): verwerfen – das Update wird dann einfach wieder angeboten.
        await hass.async_add_executor_job(shutil.rmtree, hass.config.path(STAGE_DIR), True)
    if not hacs:
        # Nicht update_before_add: ohne Internet würde das den Start von Casora bis zu 20 s aufhalten.
        async_add_entities([CasoraUpdate(hass, entry)])


class CasoraUpdate(UpdateEntity):
    """Neue Casora-Version aus den Releases des öffentlichen Repos."""

    _attr_has_entity_name = True
    _attr_title = "Casora"
    _attr_supported_features = UpdateEntityFeature.INSTALL | UpdateEntityFeature.RELEASE_NOTES
    _attr_should_poll = True

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self._entry = entry
        self._attr_unique_id = _own_unique_id(entry)
        self._attr_name = "Casora"
        self._attr_installed_version = VERSION
        self._attr_latest_version = VERSION
        self._release: dict[str, Any] | None = None
        # Schon installiert, aber noch nicht neu gestartet? Das merkt sich hass.data über ein
        # Neuladen der Integration (Optionen geändert) hinweg – sonst böte HA dieselbe Version wieder an.
        pending = (hass.data.get(DOMAIN) or {}).get(DATA_PENDING)
        self._installed_new: str | None = pending if pending and pending != VERSION else None
        if self._installed_new:
            self._attr_installed_version = self._attr_latest_version = self._installed_new

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        # Erste Prüfung im Hintergrund, danach wie gewohnt alle SCAN_INTERVAL.
        self.hass.async_create_background_task(self._async_first_check(), "casora_update_first_check")

    async def _async_first_check(self) -> None:
        await self.async_update()
        self.async_write_ha_state()

    async def async_update(self) -> None:
        data = self.hass.data.setdefault(DOMAIN, {})
        data[DATA_LAST_CHECK] = dt_util.utcnow().isoformat()
        try:
            # Nicht /releases/latest: das könnte ein Karten-Update („karten-…“) sein.
            rels = await fetch_releases(self.hass)
        except Exception as err:  # noqa: BLE001 – offline oder GitHub-Limit: später wieder
            _LOGGER.debug("Casora: Update-Prüfung fehlgeschlagen: %s", err)
            data[DATA_LAST_ERROR] = error_code(err)
            return
        data[DATA_LAST_ERROR] = None
        # Nach der Installation, bis zum Neustart: die neue Version gilt als installiert.
        installed = self._installed_new or VERSION
        rel, latest = pick_latest(rels, installed, beta_enabled(self._entry))
        # Eine Beta heißt in HAs Update-Liste „Casora Beta“ (die Version trägt „-beta.N“).
        self._attr_title = "Casora Beta" if is_prerelease(latest) else "Casora"
        if rel is None:
            # Noch kein Casora-Release: nichts anbieten.
            self._release = None
            self._attr_latest_version = self._attr_installed_version
            self._attr_release_summary = None
            return
        self._release = rel
        self._attr_installed_version = installed
        self._attr_latest_version = latest
        url = str(rel.get("html_url") or "")
        self._attr_release_url = (url if url.startswith("https://")
                                  else f"https://github.com/{UPDATE_REPO}/releases/tag/{rel.get('tag_name')}")
        # Kurzfassung (HA erlaubt höchstens 255 Zeichen): die fetten Anfänge der ersten Punkte.
        # Im Dashboard-Popup die zweite Zeile unter „Casora“; die ganzen Hinweise kommen
        # über async_release_notes.
        self._attr_release_summary = (summarize(await self._notes_md(), limit=2) or None)
        if self._attr_release_summary and len(self._attr_release_summary) > 255:
            self._attr_release_summary = self._attr_release_summary[:254] + "…"

    async def _notes_md(self) -> str:
        """Text des Releases in der Sprache von Home Assistant (Deutsch-Block im Release,
        sonst Englisch); fehlt er oder gibt es die Sprache nur in der mitgelieferten
        CHANGELOG(.de).md, der Abschnitt von dort."""
        rel = self._release or {}
        lang = notes_lang(getattr(self.hass.config, "language", None))
        notes, got = pick_notes(str(rel.get("body") or ""), lang)
        notes = notes.strip()
        if notes and got == lang:
            return notes
        want = norm_version(rel.get("tag_name"))

        def read() -> list[tuple[str, str]]:
            out = []
            for code in dict.fromkeys((lang, "en")):
                try:
                    with open(os.path.join(os.path.dirname(__file__), changelog_file(code)), encoding="utf-8") as fh:
                        out.append((code, fh.read()))
                except OSError:
                    pass
            return out

        for code, text in await self.hass.async_add_executor_job(read):
            if notes and code != lang:
                break  # Englisch aus dem Release ist so gut wie die englische CHANGELOG
            for e in parse_changelog(text, code):
                if e["version"] == want and e.get("notes_md"):
                    return e["notes_md"]
        return notes

    async def async_release_notes(self) -> str | None:
        # HAs Dialog rendert Markdown: harte Umbrüche der CHANGELOG zusammenziehen, <…> als Text.
        return ha_markdown(await self._notes_md()) or None

    async def async_install(self, version: str | None, backup: bool, **kwargs: Any) -> None:
        rel = self._release
        if not rel:
            raise RuntimeError("Kein Casora-Release gefunden")
        tag = str(rel.get("tag_name") or "")
        try:
            data = await download_release(self.hass, tag)
        except UpdateSourceError as err:
            raise HomeAssistantError(f"Casora {tag} nicht geladen: {error_text(err.code)}") from err
        target = self.hass.config.path("custom_components", DOMAIN)
        backups = self.hass.config.path("casora_sicherungen")
        stamp = dt_util.now().strftime("%Y-%m-%d_%H%M%S")

        staged = self.hass.config.path(STAGE_DIR)
        await self.hass.async_add_executor_job(stage_zip, data, target, backups, f"casora_{VERSION}_{stamp}", staged)
        _swap_on_stop(self.hass, staged, target)
        self._installed_new = str(tag).lstrip("v")
        # Für „installiert am …“ im Studio; läuft bis zum Neustart noch die alte Fassung.
        await async_record_install(self.hass, self._installed_new, VERSION)
        self.hass.data.setdefault(DOMAIN, {})[DATA_PENDING] = self._installed_new
        self._attr_installed_version = self._installed_new
        self._attr_latest_version = self._installed_new
        ir.async_create_issue(
            self.hass, DOMAIN, "restart_after_update", is_fixable=False, is_persistent=False,
            severity=ir.IssueSeverity.WARNING, translation_key="restart_after_update",
            translation_placeholders={"version": self._installed_new},
        )
        self.async_write_ha_state()


def _swap_on_stop(hass: HomeAssistant, staged: str, target: str) -> None:
    """Die neue Fassung erst beim Beenden von HA einspielen – bis dahin liefert Casora weiter die
    Oberfläche aus, die zum laufenden Server-Code passt. Einmal je Lauf anmelden."""
    data = hass.data.setdefault(DOMAIN, {})
    if data.get(DATA_STAGE_LISTENER):
        return

    async def _apply(_event: Event) -> None:
        if not await hass.async_add_executor_job(os.path.isdir, staged):
            return
        try:
            await hass.async_add_executor_job(swap_in, staged, target)
        except OSError as err:
            _LOGGER.error("Casora: neue Fassung nicht eingespielt (%s) – die bisherige bleibt aktiv", err)

    data[DATA_STAGE_LISTENER] = hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STOP, _apply)
