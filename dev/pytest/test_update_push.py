"""Casora-Updates über HACS (1.1.2): Update-Entität finden, Studio-Übersicht, Push je neuer Version.

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest -q

Gemeldet: „Installieren“ unter Studio › Updates tat nichts – das Studio nahm die eigene, mit HACS
nicht mehr geladene Update-Entität (nicht verfügbar), HA übersprang den Aufruf still.
Erwartet: HACS' Update-Entität für das Casora-Repo (Plattform hacs, unique_id = Repo-ID).
"""

from __future__ import annotations

import json
from unittest.mock import patch

from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import entity_registry as er

DOMAIN = "casora"
REPO_ID = "424242"


def _bump(v: str, n: int = 1) -> str:
    a, b, c = (int(x) for x in v.split("-")[0].split(".")[:3])
    return f"{a}.{b}.{c + n}"


def _entry(hass: HomeAssistant, options: dict | None = None) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, title="Casora", data={}, options=options or {}, version=1, minor_version=2)
    entry.add_to_hass(hass)
    return entry


def _hacs(hass: HomeAssistant, entity_id: str = "update.casora_update", unique_id: str = REPO_ID) -> str:
    """Registereintrag wie HACS ihn anlegt (Plattform hacs, unique_id = GitHub-ID des Repos)."""
    from custom_components.casora.update import DATA_HACS, DATA_HACS_ID  # noqa: PLC0415

    hass.data.setdefault(DOMAIN, {}).update({DATA_HACS: True, DATA_HACS_ID: REPO_ID})
    ent = er.async_get(hass).async_get_or_create("update", "hacs", unique_id, suggested_object_id=entity_id.split(".")[1])
    return ent.entity_id


def _notify(hass: HomeAssistant, name: str = "mobile_app_testphone") -> list[ServiceCall]:
    calls: list[ServiceCall] = []

    async def handler(call: ServiceCall) -> None:
        calls.append(call)

    hass.services.async_register("notify", name, handler)
    return calls


def _state(hass, eid, latest, installed, state=None, **attrs):
    from custom_components.casora.release_notes import newer  # noqa: PLC0415

    hass.states.async_set(eid, state or ("on" if newer(latest, installed) else "off"),
                          {"latest_version": "v" + latest, "installed_version": "v" + installed,
                           "in_progress": False, "release_url": "https://github.com/SH1FT-W/casora/releases/v" + latest,
                           **attrs})


# ── Update-Entität finden ────────────────────────────────────────────────────

async def test_findet_hacs_entitaet_per_unique_id(hass: HomeAssistant) -> None:
    from custom_components.casora.update import casora_update_entity  # noqa: PLC0415

    entry = _entry(hass)
    # Alte eigene Entität (vor HACS) im Register: darf nicht gewählt werden.
    er.async_get(hass).async_get_or_create("update", DOMAIN, f"{entry.entry_id}_update", suggested_object_id="casora")
    eid = _hacs(hass)
    assert casora_update_entity(hass, entry) == (eid, "hacs")


async def test_findet_hacs_entitaet_ueber_release_url(hass: HomeAssistant) -> None:
    from custom_components.casora.update import casora_update_entity  # noqa: PLC0415

    entry = _entry(hass)
    reg = er.async_get(hass)
    other = reg.async_get_or_create("update", "hacs", "1", suggested_object_id="other_update").entity_id
    hass.states.async_set(other, "on", {"release_url": "https://github.com/someone/other/releases/v2"})
    eid = _hacs(hass, unique_id="999")  # Repo-ID passt nicht (andere HACS-Liste)
    _state(hass, eid, "9.0.0", "1.0.0")
    assert casora_update_entity(hass, entry) == (eid, "hacs")


async def test_ohne_hacs_eigene_entitaet(hass: HomeAssistant) -> None:
    from custom_components.casora.update import casora_update_entity  # noqa: PLC0415

    entry = _entry(hass)
    own = er.async_get(hass).async_get_or_create("update", DOMAIN, f"{entry.entry_id}_update",
                                                 suggested_object_id="casora").entity_id
    assert casora_update_entity(hass, entry) == (own, "casora")


async def test_mit_hacs_alte_eigene_entitaet_weg(hass: HomeAssistant, tmp_path) -> None:
    from custom_components.casora import update  # noqa: PLC0415

    hass.config.config_dir = str(tmp_path)
    (tmp_path / ".storage").mkdir()
    (tmp_path / ".storage" / "hacs.repositories").write_text(json.dumps({"data": {
        REPO_ID: {"id": REPO_ID, "full_name": "SH1FT-W/casora", "installed": True}}}))
    entry = _entry(hass)
    reg = er.async_get(hass)
    reg.async_get_or_create("update", DOMAIN, f"{entry.entry_id}_update", suggested_object_id="casora")
    added = []
    await update.async_setup_entry(hass, entry, lambda ents, **k: added.extend(ents))
    assert added == []
    assert reg.async_get_entity_id("update", DOMAIN, f"{entry.entry_id}_update") is None
    assert hass.data[DOMAIN][update.DATA_HACS_ID] == REPO_ID


# ── Studio-Übersicht mit HACS ─────────────────────────────────────────────────

async def _overview(hass):
    from custom_components.casora import updates  # noqa: PLC0415

    with patch.object(updates, "fetch_releases", return_value=[]):
        return await updates.async_updates_overview(hass, force=True, lang="de")


async def test_uebersicht_hacs_installieren_und_neustart(hass: HomeAssistant) -> None:
    from custom_components.casora.const import VERSION  # noqa: PLC0415

    _entry(hass)
    eid = _hacs(hass)
    new = _bump(VERSION)
    _state(hass, eid, new, VERSION)
    d = await _overview(hass)
    assert d["entity_id"] == eid and d["install_via"] == "hacs" and d["entity_ready"]
    assert d["update_available"] and d["latest"] == new and d["install_version"] is None
    assert not d["own_check"] and "token" not in d
    # HACS hat installiert, Casora läuft bis zum Neustart noch alt.
    _state(hass, eid, new, new)
    d = await _overview(hass)
    assert d["pending_restart"] == new and not d["update_available"]


async def test_uebersicht_hacs_noch_nicht_aktuell(hass: HomeAssistant) -> None:
    """GitHub kennt schon eine neuere Version als HACS: gezielt diesen Tag installieren."""
    from custom_components.casora import updates  # noqa: PLC0415
    from custom_components.casora.const import VERSION  # noqa: PLC0415

    _entry(hass)
    eid = _hacs(hass)
    _state(hass, eid, VERSION, VERSION)
    newer = _bump(VERSION, 2)
    rel = {"tag_name": "v" + newer, "prerelease": False, "draft": False, "body": "", "html_url": "",
           "published_at": "2026-10-08T08:00:00Z"}
    with patch.object(updates, "fetch_releases", return_value=[rel]):
        d = await updates.async_updates_overview(hass, force=True, lang="de")
    assert d["update_available"] and d["latest"] == newer and d["install_version"] == "v" + newer


async def test_uebersicht_hacs_ohne_entitaet(hass: HomeAssistant) -> None:
    from custom_components.casora.update import DATA_HACS  # noqa: PLC0415

    _entry(hass)
    hass.data.setdefault(DOMAIN, {})[DATA_HACS] = True
    d = await _overview(hass)
    assert d["hacs"] and d["entity_id"] is None and d["install_via"] is None


# ── Push je neuer Version ────────────────────────────────────────────────────

async def _push(hass, entry):
    from custom_components.casora.update_push import UpdatePush  # noqa: PLC0415

    p = UpdatePush(hass, entry)
    await p.async_start()
    return p


async def test_push_einmal_je_version_und_nach_neustart(hass: HomeAssistant, hass_storage) -> None:
    from custom_components.casora.const import VERSION  # noqa: PLC0415
    from custom_components.casora.update_push import STORE_KEY  # noqa: PLC0415

    entry = _entry(hass, {"update_push": ["notify.mobile_app_testphone"]})
    calls = _notify(hass)
    eid = _hacs(hass)
    _state(hass, eid, VERSION, VERSION)
    p = await _push(hass, entry)
    await hass.async_block_till_done()
    assert calls == []  # nichts Neues

    new = _bump(VERSION)
    _state(hass, eid, new, VERSION, release_summary="**Neue Karten** – <b>schneller</b> [mehr](https://x.test)")
    await hass.async_block_till_done()
    assert len(calls) == 1
    c = calls[0].data
    assert c["title"] == f"Casora {new} is here" or c["title"] == f"Casora {new} ist da"
    assert c["message"] == "Neue Karten, schneller mehr"
    assert c["data"]["url"] == "/casora-studio?updates=1" and c["data"]["clickAction"] == "/casora-studio?updates=1"

    # Dieselbe Version erneut gemeldet (anderes Attribut): kein zweiter Push.
    _state(hass, eid, new, VERSION, release_summary="anders")
    await hass.async_block_till_done()
    assert len(calls) == 1
    await hass.async_block_till_done()
    assert new in hass_storage[STORE_KEY]["data"]["notified"]

    # „Neustart“: neue Instanz liest den Speicher – dieselbe Version kommt nicht noch einmal.
    p.stop()
    p2 = await _push(hass, entry)
    p2.check()
    _state(hass, eid, new, VERSION, release_summary="nach Neustart")
    await hass.async_block_till_done()
    assert len(calls) == 1

    # Nächste Version: wieder genau ein Push, ohne Kurzfassung mit festem Text.
    newer = _bump(VERSION, 2)
    _state(hass, eid, newer, VERSION)
    _state(hass, eid, newer, VERSION, in_progress=False, title="x")
    await hass.async_block_till_done()
    assert len(calls) == 2
    assert calls[1].data["message"] in ("Neue Version verfügbar", "New version available")
    p2.stop()


async def test_push_nicht_wenn_installiert_oder_aus(hass: HomeAssistant, hass_storage) -> None:
    from custom_components.casora.const import VERSION  # noqa: PLC0415

    new = _bump(VERSION)
    # Ohne Empfänger (Standard): kein Push.
    entry = _entry(hass)
    calls = _notify(hass)
    eid = _hacs(hass)
    p = await _push(hass, entry)
    _state(hass, eid, new, VERSION)
    await hass.async_block_till_done()
    assert calls == []
    p.stop()

    # Mit Empfänger, aber schon installiert (wartet auf Neustart, Zustand off): kein Push.
    _state(hass, eid, new, new)
    hass.config_entries.async_update_entry(entry, options={"update_push": ["notify.mobile_app_testphone"]})
    p = await _push(hass, entry)
    _state(hass, eid, new, new, release_summary="Restart required")
    await hass.async_block_till_done()
    assert calls == []
    # Übersprungene Version (HA: Zustand off) ebenso.
    _state(hass, eid, _bump(VERSION, 3), VERSION, state="off", skipped_version="v" + _bump(VERSION, 3))
    await hass.async_block_till_done()
    assert calls == []
    # Andere Update-Entität mit neuer Version: geht Casora nichts an.
    _state(hass, "update.something_else", "9.9.9", "1.0.0", release_url="https://github.com/someone/other/releases/x")
    await hass.async_block_till_done()
    assert calls == []
    p.stop()


async def test_kurzfassung_schlicht() -> None:
    from custom_components.casora.update_push import plain_summary  # noqa: PLC0415

    assert plain_summary("<ha-alert alert-type='error'>Restart required</ha-alert>") == "Restart required"
    assert plain_summary("## Neu\n- **A** · B") == "Neu A · B"
    long = plain_summary("wort " * 80)
    assert len(long) <= 140 and long.endswith("…")
    assert "–" not in plain_summary("Eins – zwei — drei")
