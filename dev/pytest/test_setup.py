"""Setup, Unload und Migration der Casora-Integration (T-04, 06.10.2026)."""

from __future__ import annotations

import os
import shutil
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

DOMAIN = "casora"


@pytest.fixture
async def http(hass: HomeAssistant, tmp_path):
    """HTTP-Schicht nur nachgebildet: die Ansichten werden gezählt, nicht ausgeliefert."""
    hass.http = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    # frontend/http/lovelace gelten als geladen (frontend bräuchte das große hass_frontend-Paket);
    # input_* und script richtet HA selbst ein.
    hass.config.components.update({"frontend", "http", "lovelace"})
    # Own config folder with a copy of the integration, so the check below sees any write into it
    # (Casora writes nothing there; the Studio loader and the template bundle come from memory).
    src = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "custom_components", DOMAIN)
    shutil.copytree(src, tmp_path / "custom_components" / DOMAIN, ignore=shutil.ignore_patterns("__pycache__", "rooms"))
    hass.config.config_dir = str(tmp_path)
    # Casora meldet fertig eingerichtete Helfer per Benachrichtigung.
    assert await async_setup_component(hass, "persistent_notification", {})
    return hass.http


@pytest.fixture
def panel():
    import custom_components.casora  # noqa: F401, PLC0415 - vor dem Patchen laden

    with patch("custom_components.casora.async_register_built_in_panel") as reg, \
         patch("custom_components.casora.async_remove_panel") as rem:
        yield reg, rem


async def _setup(hass: HomeAssistant, **kw) -> MockConfigEntry:
    entry = MockConfigEntry(domain=DOMAIN, title="Casora", data={}, options={}, version=1, minor_version=2, **kw)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_setup_registriert_panel_und_ansichten(hass: HomeAssistant, http, panel) -> None:
    reg, _ = panel
    entry = await _setup(hass)
    assert entry.state is ConfigEntryState.LOADED
    # Panel in der Seitenleiste, Lader mit Versions-Stempel
    kwargs = reg.call_args.kwargs
    assert kwargs["frontend_url_path"] == "casora-studio"
    url = kwargs["config"]["_panel_custom"]["module_url"]
    assert url.startswith("/casora_panel/casora-studio.js?v=")
    # Eigene Ansichten (Assets, Skripte, Studio, Bilder, Schriften, Raumsymbole, Vorlagen)
    names = {c.args[0].name for c in http.register_view.call_args_list}
    for n in ("casora:assets", "casora:scripts", "casora:panel", "api:casora:templates", "api:casora:images"):
        assert n in names, names
    # Keine statische Route mehr für das Studio (kam ungepackt und ohne Cache-Control)
    http.async_register_static_paths.assert_not_called()


async def test_unload_entfernt_panel_und_dienste(hass: HomeAssistant, http, panel) -> None:
    _, rem = panel
    entry = await _setup(hass)
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.NOT_LOADED
    assert any(c.args[1] == "casora-studio" for c in rem.call_args_list)
    assert "ki" not in hass.data.get(DOMAIN, {})
    assert "raumklima" not in hass.data.get(DOMAIN, {})


async def test_neu_laden_nach_optionsaenderung(hass: HomeAssistant, http, panel) -> None:
    """Optionen ändern lädt neu – danach wieder geladen, Ansichten nur einmal registriert."""
    entry = await _setup(hass)
    views = http.register_view.call_count
    hass.config_entries.async_update_entry(entry, options={"x_test": 1})
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert http.register_view.call_count == views


async def test_migration_ki_auto(hass: HomeAssistant, http, panel) -> None:
    from custom_components.casora.ki import OPT_PLAN_UPDATE  # noqa: PLC0415

    entry = MockConfigEntry(domain=DOMAIN, title="Casora", data={}, options={"ki_auto": False}, version=1, minor_version=1)
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.minor_version == 2
    assert "ki_auto" not in entry.options
    # ki_auto aus → Update-Check nur auf Knopfdruck
    assert entry.options[OPT_PLAN_UPDATE] == "manual"


def _tree(root) -> dict:
    out = {}
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d != "__pycache__"]
        for f in files:
            st = os.stat(os.path.join(base, f))
            out[os.path.relpath(os.path.join(base, f), root)] = (st.st_size, st.st_mtime_ns)
    return out


async def test_setup_schreibt_nichts_in_den_integrationsordner(hass: HomeAssistant, http, panel) -> None:
    """HACS review: no runtime writes into the package (Studio loader and template bundle come from memory)."""
    root = os.path.join(hass.config.config_dir, "custom_components", DOMAIN)
    before = _tree(root)
    entry = await _setup(hass)
    hass.config_entries.async_update_entry(entry, options={"x_test": 1})
    await hass.async_block_till_done()
    assert _tree(root) == before
    assert not os.path.exists(os.path.join(root, "panel", "casora-studio.js"))
    assert "casora-panel.js?v=" in hass.data[DOMAIN]["studio_loader"]
