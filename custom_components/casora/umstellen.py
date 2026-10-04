"""Dienst casora.umstellen: bestehende Dashboards von Hemma- auf Casora-Namen umstellen.

Gleiche Regel wie der Import im Studio (panel/casora-panel-types.js, casoraRename):
  • „hemma“ → „casora“ in Vorlagen, Karten, CSS-Variablen und JS der Vorlagen,
  • Entitäten nur, wenn sie Casora gehören (panel/umbenennung.json) – Sensoren aus
    eigenen Paketen bleiben,
  • eigene Dateien unter /local/hemma/ und Dashboard-Adressen bleiben.
Nur Dashboards im UI-Modus (Speicher). Vor dem Schreiben wird jedes Dashboard nach
/config/casora_sicherungen/umstellen_<Zeit>/ gesichert. Mit probelauf: true wird
nur gezählt. Veraltete Registry-Einträge früherer Casora-Sensoren werden entfernt.
"""
from __future__ import annotations

import json
import logging
import os
import re

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

DOMAINS = set((
    "sensor binary_sensor input_boolean input_text input_select input_number input_datetime input_button script "
    "automation switch light climate cover media_player camera calendar todo select number button fan vacuum lock "
    "alarm_control_panel scene update weather plant person zone device_tracker counter timer event image text time "
    "date humidifier water_heater valve lawn_mower siren remote"
).split())
ENTITY = re.compile(r"\b([a-z_]+)\.(hemma_[a-z0-9_]*)")
LOCAL = re.compile(r"/local/hemma/")
PATH = re.compile(r"""(["'(\s])(/[a-z0-9-]*hemma[a-z0-9-]*)(?=[/"'?#])""")
WORD = re.compile(r"hemma", re.IGNORECASE)


def load_names(base: str) -> tuple[set[str], list[str]]:
    with open(os.path.join(base, "panel", "umbenennung.json"), encoding="utf-8") as fh:
        data = json.load(fh)
    return set(data.get("eigene", [])), list(data.get("praefixe", []))


def rename_text(text: str, own: set[str], prefixes: list[str]) -> tuple[str, int]:
    keep: list[str] = []

    def hold(s: str) -> str:
        keep.append(s)
        return f"\x01{len(keep) - 1}\x01"

    def ent(m: re.Match) -> str:
        new = "casora_" + m.group(2)[len("hemma_"):]
        mine = new in own or any(new.startswith(p) for p in prefixes)
        return hold(m.group(0)) if m.group(1) in DOMAINS and not mine else m.group(0)

    studio = text.count("/hemma-studio")
    text = text.replace("/hemma-studio", "/casora-studio")  # Studio-Seite heißt jetzt so
    text = ENTITY.sub(ent, text)
    text = LOCAL.sub(lambda m: hold(m.group(0)), text)
    text = PATH.sub(lambda m: m.group(1) + hold(m.group(2)), text)
    count = studio

    def word(m: re.Match) -> str:
        nonlocal count
        count += 1
        w = m.group(0)
        return "CASORA" if w.isupper() else ("Casora" if w[0].isupper() else "casora")

    text = WORD.sub(word, text)
    return re.sub(r"\x01(\d+)\x01", lambda m: keep[int(m.group(1))], text), count


def rename_config(cfg, own, prefixes):
    text, n = rename_text(json.dumps(cfg, ensure_ascii=False), own, prefixes)
    return (json.loads(text) if n else cfg), n


async def async_setup_umstellen(hass: HomeAssistant) -> None:
    base = os.path.dirname(__file__)

    async def handle(call: ServiceCall) -> ServiceResponse:
        dry = call.data.get("probelauf", False)
        own, prefixes = await hass.async_add_executor_job(load_names, base)
        from homeassistant.components.lovelace.const import LOVELACE_DATA

        dashboards = hass.data[LOVELACE_DATA].dashboards
        stamp = dt_util.now().strftime("%Y-%m-%d_%H%M%S")
        backup = hass.config.path("casora_sicherungen", f"umstellen_{stamp}")
        result: dict = {"dashboards": {}, "entfernt": []}
        for url, dash in dashboards.items():
            if getattr(dash, "mode", None) != "storage":
                continue
            try:
                cfg = await dash.async_load(False)
            except Exception:  # noqa: BLE001 – leeres/ungültiges Dashboard
                continue
            new, n = rename_config(cfg, own, prefixes)
            if not n:
                continue
            result["dashboards"][url or "lovelace"] = n
            if dry:
                continue

            def _save_backup(u=url, c=cfg):
                os.makedirs(backup, exist_ok=True)
                with open(os.path.join(backup, f"{u or 'lovelace'}.json"), "w", encoding="utf-8") as fh:
                    json.dump(c, fh, ensure_ascii=False, indent=1)

            await hass.async_add_executor_job(_save_backup)
            await dash.async_save(new)
        # Registry-Einträge der Casora-Sensoren aus der Zeit vor der Umbenennung.
        reg = er.async_get(hass)
        for entry in list(reg.entities.values()):
            if entry.platform == DOMAIN and entry.unique_id.startswith(f"{DOMAIN}_hemma_"):
                result["entfernt"].append(entry.entity_id)
                if not dry:
                    reg.async_remove(entry.entity_id)
        if not dry and result["dashboards"]:
            result["sicherung"] = backup
            _LOGGER.info("Casora: Dashboards umgestellt %s, Sicherung in %s", result["dashboards"], backup)
        return result

    hass.services.async_register(
        DOMAIN, "umstellen", handle,
        schema=vol.Schema({vol.Optional("probelauf", default=False): cv.boolean}),
        supports_response=SupportsResponse.OPTIONAL,
    )
