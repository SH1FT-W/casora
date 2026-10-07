"""Casora Mock – Test-Integration für das Docker-Test-HA.

Legt aus fixture.json (anonymisierter Schnappschuss) Räume, Geräte und
Entitäten an, reagiert auf die üblichen Dienste (Licht, Jalousie, Schloss …)
und bietet Szenarien zum Nachstellen typischer Zustände.

Nur für Tests – gehört nie in ein Release.
"""
from __future__ import annotations

import json
import logging
from datetime import timedelta
from pathlib import Path

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.core import Event, HomeAssistant, ServiceCall, callback
from homeassistant.helpers import area_registry as ar
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_change
from homeassistant.util import dt as dt_util

from .entity import PLATFORMS, build_classes

DOMAIN = "casora_mock"
_LOGGER = logging.getLogger(__name__)
HERE = Path(__file__).parent

CONFIG_SCHEMA = vol.Schema({DOMAIN: vol.Schema({}, extra=vol.ALLOW_EXTRA)}, extra=vol.ALLOW_EXTRA)


def _skip_list() -> list[str]:
    f = HERE / "skip.txt"
    return f.read_text(encoding="utf-8").split() if f.exists() else []


def _load(name: str):
    return json.loads((HERE / name).read_text(encoding="utf-8"))


def _load_optional(name: str) -> dict:
    # scenarios.json ist privat (Testhaus); ohne sie gibt es eben keine Szenarien.
    return _load(name) if (HERE / name).exists() else {}


def _merge(fixture: dict, extra: dict, label: str = "Stresshaus aktiv") -> None:
    """Zusätzliche Räume/Geräte/Entitäten anhängen; Vorhandenes gewinnt."""
    fixture["areas"] = list(fixture["areas"]) + [a for a in extra.get("areas", []) if a not in fixture["areas"]]
    keys = {d["key"] for d in fixture["devices"]}
    fixture["devices"] = list(fixture["devices"]) + [d for d in extra.get("devices", []) if d["key"] not in keys]
    ids = {e["entity_id"] for e in fixture["entities"]}
    fixture["entities"] = list(fixture["entities"]) + [e for e in extra.get("entities", []) if e["entity_id"] not in ids]
    fixture.setdefault("_buttons", {}).update(extra.get("_buttons", {}))
    _LOGGER.warning("Casora Mock: %s (+%s Entitäten)", label, len(extra.get("entities", [])))


def _vacuum_map(fixture: dict) -> None:
    """Saugroboter ohne Karte bekommt eine (image.<sauger>_map, Bild aus entity.MAP_PNG),
    damit das Popup die automatische Kartensuche zeigt."""
    ents = fixture["entities"]
    for v in [e for e in ents if e["entity_id"].startswith("vacuum.") and e.get("device")]:
        if any(e["entity_id"].startswith("image.") and e.get("device") == v["device"] for e in ents):
            continue
        name = (v.get("attributes") or {}).get("friendly_name") or "Saugroboter"
        ents.append({"entity_id": "image." + v["entity_id"].split(".", 1)[1] + "_map", "state": "2026-10-07T08:00:00+00:00",
                     "attributes": {"friendly_name": name + " Karte"}, "platform": "casora_mock", "device": v["device"],
                     "area": None, "original_name": "Karte", "name": None, "icon": None, "device_class": None,
                     "unit": None, "hidden": False, "translation_key": "map", "entity_category": "diagnostic"})


async def async_setup(hass: HomeAssistant, config) -> bool:
    if DOMAIN in config and not hass.config_entries.async_entries(DOMAIN):
        hass.async_create_task(
            hass.config_entries.flow.async_init(DOMAIN, context={"source": SOURCE_IMPORT}, data={})
        )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    fixture = await hass.async_add_executor_job(_load, "fixture.json")
    scenarios = await hass.async_add_executor_job(_load_optional, "scenarios.json")
    # Stresshaus (dev/stress/stress_fixture.py): nur im Zustand „stress“ vorhanden, sonst nichts.
    stress = await hass.async_add_executor_job(_load_optional, "stress.json")
    if stress:
        _merge(fixture, stress)
    # Zwei neutrale Waschmaschinen (WashData-artig und Home-Connect-artig), siehe waesche.py.
    from .waesche import extra as waesche_extra
    _merge(fixture, waesche_extra(dt_util.utcnow()), "Waschmaschinen A/B")
    # Ein erfundener Team-Tracker-Sensor (Fußball-Kachel), siehe fussball.py.
    from .fussball import extra as fussball_extra
    _merge(fixture, fussball_extra(dt_util.utcnow()), "Team-Tracker-Sensor")
    _vacuum_map(fixture)
    fixture["_skip"] = await hass.async_add_executor_job(_skip_list)
    mock = CasoraMock(hass, entry, fixture, scenarios)
    hass.data[DOMAIN] = mock
    mock.classes = await hass.async_add_import_executor_job(build_classes, hass)
    mock.build_registry()
    mock.apply_fixture()
    platforms = sorted({eid.split(".")[0] for eid in mock.store} & set(PLATFORMS))
    platforms.append("ai_task")  # Test-KI für den Geräte-Assistenten
    await hass.config_entries.async_forward_entry_setups(entry, platforms)
    mock.register_services()
    mock.register_websocket()
    mock.track_derived()
    mock.backfill_history()
    _LOGGER.warning(
        "Casora Mock: %s Entitäten, %s Geräte geladen (nur Test!)",
        len(fixture["entities"]), len(fixture["devices"]),
    )
    return True


class CasoraMock:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, fixture: dict, scenarios: dict) -> None:
        self.hass = hass
        self.entry = entry
        self.fixture = fixture
        self.scenarios = scenarios
        skip = set(fixture.get("_skip", []))
        # Entitäten, die im Test-HA echt existieren (Helfer/Skripte aus Paketen), auslassen.
        self.entities = {e["entity_id"]: e for e in fixture["entities"] if e["entity_id"] not in skip}
        fixture["entities"] = list(self.entities.values())
        self.store: dict[str, list] = {}
        self.objs: dict = {}
        self.classes: dict = {}

    # ── Registry ────────────────────────────────────────────────────────
    def build_registry(self) -> None:
        areas = ar.async_get(self.hass)
        area_ids = {name: areas.async_get_or_create(name).id for name in self.fixture["areas"] if name}
        devices = dr.async_get(self.hass)
        dev_ids: dict[str, str] = {}
        for d in self.fixture["devices"]:
            dev = devices.async_get_or_create(
                config_entry_id=self.entry.entry_id,
                identifiers={(DOMAIN, d["key"])},
                name=d.get("name") or d["key"],
                manufacturer=d.get("manufacturer"),
                model=d.get("model"),
                sw_version=d.get("sw_version"),
            )
            if d.get("area") in area_ids and dev.area_id != area_ids[d["area"]]:
                devices.async_update_device(dev.id, area_id=area_ids[d["area"]])
            dev_ids[d["key"]] = dev.id
        # Geräteverknüpfung (z. B. AMS hängt am Drucker) wie im echten System.
        for d in self.fixture["devices"]:
            if d.get("via") in dev_ids:
                devices.async_update_device(dev_ids[d["key"]], via_device_id=dev_ids[d["via"]])

        ents = er.async_get(self.hass)
        for e in self.fixture["entities"]:
            domain, object_id = e["entity_id"].split(".", 1)
            if domain in ("input_boolean", "input_select", "input_number", "input_text",
                          "input_datetime", "sun", "automation"):
                continue  # echte Helfer/Kern-Entitäten, siehe configuration.yaml
            entry = ents.async_get_or_create(
                domain, DOMAIN, e["entity_id"],
                suggested_object_id=object_id,
                config_entry=self.entry,
                device_id=dev_ids.get(e.get("device")),
                original_name=e.get("original_name"),
                original_device_class=e.get("device_class"),
                unit_of_measurement=e.get("unit"),
                translation_key=e.get("translation_key"),
            )
            if entry.entity_id != e["entity_id"]:
                _LOGGER.warning("Entitäts-ID weicht ab: %s → %s", e["entity_id"], entry.entity_id)
            upd = {}
            if e.get("area") in area_ids and entry.area_id != area_ids[e["area"]]:
                upd["area_id"] = area_ids[e["area"]]
            if e.get("icon") and entry.icon != e["icon"]:
                upd["icon"] = e["icon"]
            if e.get("name") and entry.name != e["name"]:
                upd["name"] = e["name"]
            if upd:
                ents.async_update_entity(entry.entity_id, **upd)

    # ── Zustände ────────────────────────────────────────────────────────
    def apply_fixture(self) -> None:
        for eid, e in self.entities.items():
            if eid.split(".")[0] in ("input_boolean", "input_select", "input_number",
                                     "input_text", "input_datetime", "sun", "automation"):
                continue
            self.store[eid] = [e["state"], dict(e["attributes"])]
            if eid in self.objs:
                self.objs[eid].async_write_ha_state()
            elif eid.split(".")[0] not in PLATFORMS:
                self.hass.states.async_set(eid, e["state"], dict(e["attributes"]))

    def set(self, eid: str, state: str | None = None, **attrs) -> None:
        if eid not in self.store:
            return
        cur = self.store[eid]
        if state is not None:
            cur[0] = state
        cur[1].update({k: v for k, v in attrs.items() if v is not None})
        if eid in self.objs:
            self.objs[eid].async_write_ha_state()
        else:
            self.hass.states.async_set(eid, cur[0], dict(cur[1]))

    # ── Dienste ─────────────────────────────────────────────────────────
    @staticmethod
    def _targets(call: ServiceCall) -> list[str]:
        ids = call.data.get("entity_id", [])
        if isinstance(ids, str):
            ids = [i.strip() for i in ids.split(",")]
        return [i for i in ids if i.startswith(call.domain + ".") or call.domain == "homeassistant"]

    def register_services(self) -> None:
        h = self.hass
        reg = h.services.async_register

        async def generic(call: ServiceCall) -> None:
            self.handle(call.domain, call.service, self._targets(call), dict(call.data))

        # Kern-Domains (light, switch …) beantworten die echten Entitätsklassen.
        # Hier nur Dienste fremder Integrationen, die unsere Popups aufrufen.
        services = {
            "ha_washdata": ["pause_cycle", "resume_cycle", "end_cycle", "set_program"],
        }
        for domain, names in services.items():
            for name in names:
                if not h.services.has_service(domain, name):
                    reg(domain, name, generic)

        # Test-Handy: Push-Meldungen landen in /config/notify_test.log (eine JSON-Zeile je Meldung).
        async def notify(call: ServiceCall) -> None:
            line = json.dumps({"target": call.service, **call.data}, ensure_ascii=False, default=str)
            path = h.config.path("notify_test.log")
            await h.async_add_executor_job(lambda: open(path, "a", encoding="utf-8").write(line + "\n"))

        if not h.services.has_service("notify", "mobile_app_testhandy"):
            reg("notify", "mobile_app_testhandy", notify)

        async def scenario(call: ServiceCall) -> None:
            self.run_scenario(call.data.get("name", ""))

        async def reset(call: ServiceCall) -> None:
            self.apply_fixture()

        reg(DOMAIN, "scenario", scenario, vol.Schema({vol.Required("name"): vol.In([k for k in self.scenarios if not k.startswith("_")])}))
        reg(DOMAIN, "reset", reset)

    def handle(self, domain: str, service: str, targets: list[str], data: dict) -> None:
        _LOGGER.info("Casora Mock: %s.%s für %s", domain, service, targets)

    # ── Drucker-Tasten wirken auf den Druckstatus ──────────────────────
    # IDs aus scenarios.json → "_drucker" (privat, wie die Fixture): status, step,
    # effective, pause, resume, stop.
    @property
    def printer(self) -> dict:
        return self.scenarios.get("_drucker", {})

    def on_button(self, eid: str) -> None:
        for target, state in self.fixture.get("_buttons", {}).get(eid, {}).items():
            self.set(target, state)
        p = self.printer
        if not p:
            return
        if eid == p.get("pause"):
            self.set(p["status"], "pause")
            self.set(p["step"], "paused_user")
            self.set(p["resume"], "unknown")
        elif eid == p.get("resume"):
            self.set(p["status"], "running")
            self.set(p["step"], "printing")
            self.set(p["resume"], "unavailable")
        elif eid == p.get("stop"):
            self.run_scenario("drucker_abgebrochen")

    # ── Abgeleitete Werte (in echt Template-Helfer) ────────────────────
    def track_derived(self) -> None:
        p = self.printer

        @callback
        def printer(_event: Event) -> None:
            status = self.hass.states.get(p["status"])
            step = self.hass.states.get(p["step"])
            if not status or not step:
                return
            active = status.state in ("running", "pause", "prepare", "init", "slicing")
            keep = step.state in ("offline", "unavailable", "unknown")
            self.set(p["effective"], step.state if (active or keep) else "idle")

        if p.get("status") and p.get("step") and p.get("effective"):
            self.entry.async_on_unload(async_track_state_change_event(
                self.hass, [p["status"], p["step"]], printer))

        @callback
        def tick(now) -> None:
            # sensor.time / sensor.date laufen im echten HA über time_date.
            local = dt_util.as_local(now)
            self.set("sensor.time", local.strftime("%H:%M"))
            self.set("sensor.date", local.strftime("%Y-%m-%d"))

        tick(dt_util.utcnow())
        self.entry.async_on_unload(async_track_time_change(self.hass, tick, second=0))

    # ── Verlauf fürs Demo-Haus ──────────────────────────────────────────
    # Mock-Werte stehen still, Diagramme in Popups wären flache Linien. Die Demo-Fixture
    # (dev/demo/demo_fixture.py) legt unter „_history“ je Entität eine Tageskurve fest;
    # beim Start schreibt der Mock daraus vergangene Zustände in den Recorder – nur die
    # Lücke seit dem letzten gespeicherten Wert (höchstens 48 h), also kein Doppeln bei
    # Neustarts. Die Kurve endet beim Wert der Fixture.
    #   {"sensor.x": {"base": 21.5, "day": 0.9, "peak": 16, "wave": 0.25, "noise": 0.05,
    #                 "bumps": [[7.5, 6, 0.7]], "digits": 1}}
    # day: Tagesschwankung um base (Höchstwert zur Stunde peak), wave: langsame Welle,
    # bumps: [Stunde, Höhe, Breite in h] (z. B. Duschen am Morgen), noise: Rauschen.
    def backfill_history(self) -> None:
        spec = self.fixture.get("_history") or {}
        if not spec or "recorder" not in self.hass.config.components:
            return
        import math
        import random

        from homeassistant.helpers.start import async_at_started

        boot = dt_util.utcnow().timestamp()
        step, span = 600, 48 * 3600

        def curve(eid: str, cfg: dict):
            rnd = random.Random(eid)
            def raw(ts: float) -> float:
                h = dt_util.as_local(dt_util.utc_from_timestamp(ts))
                hour = h.hour + h.minute / 60
                v = cfg.get("base", 0) + cfg.get("day", 0) * math.cos(2 * math.pi * (hour - cfg.get("peak", 15)) / 24)
                v += cfg.get("wave", 0) * math.sin(2 * math.pi * ts / (4.7 * 3600))
                for at, height, width in cfg.get("bumps", []):
                    d = min(abs(hour - at), 24 - abs(hour - at))
                    v += height * math.exp(-(d / width) ** 2)
                return v
            try:
                end = float(self.store[eid][0])
            except (KeyError, TypeError, ValueError):
                end = raw(boot)
            shift = end - raw(boot)
            lo, hi = cfg.get("min"), cfg.get("max")
            out = []
            for ts in range(int(boot - span), int(boot), step):
                v = raw(ts) + shift + rnd.gauss(0, cfg.get("noise", 0))
                if lo is not None:
                    v = max(lo, v)
                if hi is not None:
                    v = min(hi, v)
                out.append((float(ts), round(v, cfg.get("digits", 1))))
            return out

        async def run(_hass) -> None:
            from sqlalchemy import func
            from homeassistant.components.recorder import get_instance
            from homeassistant.components.recorder.db_schema import States, StatesMeta
            from homeassistant.helpers.recorder import session_scope

            inst = get_instance(self.hass)
            if not await inst.async_db_ready:
                return
            await inst.async_block_till_done()  # Startzustände sind gespeichert → StatesMeta gibt es
            series = {eid: curve(eid, cfg) for eid, cfg in spec.items() if eid in self.store}

            def job() -> int:
                n = 0
                with session_scope(session=inst.get_session()) as s:
                    for eid, pts in series.items():
                        meta = s.query(StatesMeta.metadata_id).filter(StatesMeta.entity_id == eid).scalar()
                        if meta is None:
                            continue
                        last = s.query(func.max(States.last_updated_ts)).filter(
                            States.metadata_id == meta, States.last_updated_ts < boot - 5).scalar() or 0
                        rows = [States(metadata_id=meta, state=str(v), last_updated_ts=ts, last_changed_ts=ts,
                                       origin_idx=0) for ts, v in pts if ts > last]
                        s.add_all(rows)
                        n += len(rows)
                return n

            import asyncio
            for attempt in range(3):  # SQLite kann kurz gesperrt sein, während der Recorder schreibt
                try:
                    n = await inst.async_add_executor_job(job)
                    _LOGGER.warning("Casora Mock: Demo-Verlauf ergänzt (%s Werte)", n)
                    return
                except Exception as err:  # noqa: BLE001 – nur Demo-Schmuck, darf den Start nie stören
                    _LOGGER.warning("Casora Mock: Demo-Verlauf nicht geschrieben (Versuch %s): %s", attempt + 1, err)
                    await asyncio.sleep(5)

        self.entry.async_on_unload(async_at_started(self.hass, run))

    def run_scenario(self, name: str) -> None:
        for eid, state in self.scenarios.get(name, {}).items():
            self.set(eid, state)
        _LOGGER.info("Casora Mock: Szenario %s", name)

    # ── WebSocket-Attrappen ─────────────────────────────────────────────
    def register_websocket(self) -> None:
        base = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA

        def cmd(kind: str, fn):
            schema = base.extend({vol.Required("type"): kind}, extra=vol.ALLOW_EXTRA)

            @callback
            def handler(hass, connection, msg):
                connection.send_result(msg["id"], fn(msg))

            websocket_api.async_register_command(self.hass, kind, handler, schema)

        now = dt_util.utcnow()

        def cycles(_msg):
            # Wie ha_washdata/get_device_cycles: neueste zuerst, Energie in Wh.
            progs = ["Baumwolle 40", "Eco 40-60", "Baumwolle 40", "Pflegeleicht", None, "Baumwolle 40",
                     "Schnell 30", "Eco 40-60", "Baumwolle 40", "Pflegeleicht", "Eco 40-60", "Baumwolle 40"]
            out = []
            for i, name in enumerate(progs):
                start = now - timedelta(days=i * 1.6 + 0.3, hours=3)
                minutes = {"Baumwolle 40": 98, "Eco 40-60": 165, "Pflegeleicht": 72, "Schnell 30": 31}.get(name, 84) + (i % 3) * 4
                out.append({
                    "id": f"mock-{i}", "start_time": start.isoformat(),
                    "end_time": (start + timedelta(minutes=minutes)).isoformat(),
                    "duration": minutes * 60, "status": "interrupted" if i == 4 else "completed",
                    "profile_name": name,
                    "energy_wh": {"Baumwolle 40": 820, "Eco 40-60": 610, "Pflegeleicht": 540, "Schnell 30": 230}.get(name, 700) + i * 9,
                })
            return {"cycles": out, "total": len(out), "has_more": False}

        def maint(_msg):
            # Wie ha_washdata/get_maintenance_log: fällig, Erinnerungen, Durchgänge seit dem letzten Mal.
            return {
                "log": [{"type": "descale", "timestamp": (now - timedelta(days=95)).isoformat()}],
                "due": ["filter_clean"],
                "event_types": ["descale", "filter_clean", "drum_clean", "bearing_service", "other"],
                "reminders": {"descale": 60, "filter_clean": 20, "drum_clean": 30},
                "cycles_since": {"descale": 41, "filter_clean": 23, "drum_clean": 12},
                "lifetime_cycle_count": 214,
            }

        cmd("ha_washdata/get_device_cycles", cycles)
        cmd("ha_washdata/get_maintenance_log", maint)
        cmd("ha_washdata/add_maintenance_event", lambda m: {"ok": True})
