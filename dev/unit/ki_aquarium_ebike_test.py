"""ki.py/sensor.py ohne laufendes HA: Aquarium-Doktor und Rad-Check.

  uv run --python 3.14 --with homeassistant python dev/unit/ki_aquarium_ebike_test.py

hass, Zustände, Statistik, Verlauf und KI sind Attrappen. Prüft: beide Funktionen sind
vollständig verdrahtet (FEATURES, LEGACY, Sensor-Namen, Dienste, services.yaml,
Übersetzungen, Umbenennungsliste), die Dienst-Schemas nehmen genau das an, was die
Popups schicken, der Prompt enthält die übergebenen Werte (keine festen Entitäten),
Events tragen Status und Ergebnis, und die Sensoren legen das Ergebnis so ab, wie die
Popups es lesen (becken je Temperaturfühler bzw. flache Attribute).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import yaml  # noqa: E402

from custom_components.casora import ki, sensor  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FEHLER:", msg)


class St(SimpleNamespace):
    pass


def state(eid, value, **attrs):
    return St(entity_id=eid, state=value, attributes=attrs,
              last_changed=datetime.now(timezone.utc) - timedelta(days=8))


class States:
    def __init__(self, items):
        self.items = {s.entity_id: s for s in items}

    def get(self, eid):
        return self.items.get(eid)

    def async_entity_ids(self, domain=None):
        return [i for i in self.items if not domain or i.startswith(domain + ".")]

    def async_all(self, domain=None):
        return [s for i, s in self.items.items() if not domain or i.startswith(domain + ".")]


class Bus:
    def __init__(self):
        self.events = []

    def async_fire(self, ev, data):
        self.events.append((ev, data))

    def async_listen(self, ev, fn):
        return lambda: None


class Services:
    def __init__(self):
        self.reg = {}

    def async_register(self, domain, name, fn, schema=None):
        self.reg[name] = schema

    def async_remove(self, domain, name):
        self.reg.pop(name, None)


def fake_hass(items):
    async def job(fn, *a):
        return fn(*a)
    return SimpleNamespace(states=States(items), bus=Bus(), services=Services(), data={},
                           async_add_executor_job=job)


# ── Verdrahtung ───────────────────────────────────────────────────────────────
for key, svc in (("aquarium", "aquarium_doktor"), ("ebike", "ebike_check")):
    check(ki.FEATURES.get(key, {}).get("service") == svc, f"FEATURES[{key}] fehlt/falsch")
    check(ki.FEATURES[key]["object"] == f"casora_{key}_ki", f"Sensorname {key}")
    check(key in ki.LEGACY and ki.LEGACY[key][0] == f"hemma_{key}_ki", f"LEGACY[{key}] fehlt")
    check(key in sensor.NAMES, f"sensor.NAMES[{key}] fehlt")
    check(hasattr(sensor.KiSensor, "_on_" + key), f"Sensor-Handler _on_{key} fehlt")
base = os.path.join(ROOT, "custom_components", "casora")
services = yaml.safe_load(open(os.path.join(base, "services.yaml"), encoding="utf-8"))
umb = json.load(open(os.path.join(base, "panel", "umbenennung.json"), encoding="utf-8"))["eigene"]
for key, f in ki.FEATURES.items():
    check(f["service"] in services, f"services.yaml ohne {f['service']}")
    check(f["object"] in umb, f"umbenennung.json ohne {f['object']}")
    for lang in ("de", "en"):
        tr = json.load(open(os.path.join(base, "translations", lang + ".json"), encoding="utf-8"))
        check(f["service"] in tr["services"], f"{lang}.json: Dienst {f['service']} fehlt")
        check(key in tr["entity"]["sensor"], f"{lang}.json: Sensor {key} fehlt")

# Dienst-Schemas: genau das, was die Popups schicken
hass = fake_hass([])
entry = SimpleNamespace(options={"ki_auto": False})
runner = ki.KiRunner(hass, entry)
import logging  # noqa: E402
logging.getLogger(ki.__name__).setLevel(logging.CRITICAL)  # Abläufe aus ki/*.yaml brauchen echtes HA
asyncio.run(runner.async_setup())
aq_schema, eb_schema = hass.services.reg.get("aquarium_doktor"), hass.services.reg.get("ebike_check")
check(aq_schema is not None and eb_schema is not None, "Dienste nicht registriert")
popup_aq = {"temp": "sensor.becken_temperatur", "name": "Becken", "devices": [
    {"label": "Pumpe", "entity": "switch.becken_pumpe", "power": "sensor.becken_pumpe_power"},
    {"label": "Heizer", "entity": "switch.becken_heizer", "power": None}],
    "light": "light.becken", "leak": None, "status": None, "leak_battery": None, "temp_battery": None}
try:
    out = aq_schema(popup_aq)
    check(out["devices"][0]["entity"] == "switch.becken_pumpe", "Aquarium-Schema verliert Geräte")
except Exception as err:  # noqa: BLE001
    check(False, f"Aquarium-Schema lehnt Popup-Daten ab: {err}")
try:
    out = eb_schema({"entities": ["sensor.rad_odometer", "binary_sensor.rad_theft_reported"]})
    check(len(out["entities"]) == 2, "E-Bike-Schema verliert Entitäten")
except Exception as err:  # noqa: BLE001
    check(False, f"E-Bike-Schema lehnt Popup-Daten ab: {err}")
try:
    eb_schema({})
    check(False, "E-Bike-Schema ohne Entitäten angenommen")
except Exception:  # noqa: BLE001
    pass
asyncio.run(runner.async_unload())
check("aquarium_doktor" not in hass.services.reg and "ebike_check" not in hass.services.reg, "Dienste nicht entfernt")

# ── Aquarium-Doktor: Prompt und Events ────────────────────────────────────────
items = [
    state("sensor.becken_temperatur", "25.2", unit_of_measurement="°C", friendly_name="Becken Temperatur"),
    state("switch.becken_pumpe", "on", friendly_name="Pumpe"),
    state("sensor.becken_pumpe_power", "12.5", unit_of_measurement="W"),
    state("switch.becken_heizer", "off", friendly_name="Heizer"),
    state("light.becken", "on", brightness=128, friendly_name="Licht"),
]
hass = fake_hass(items)
asked = {}


async def fake_stats(h, ids, start, period, types, units=None):
    if period == "day":
        return {"sensor.becken_temperatur": [{"start": datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp(),
                                              "mean": 25.1, "min": 24.8, "max": 25.6}]}
    return {}


async def fake_history(h, ids, start, attrs=False):
    return {"switch.becken_heizer": [state("switch.becken_heizer", "off")]}


async def fake_ask(h, e, task, instructions, structure, **kw):
    asked["task"], asked["text"], asked["structure"] = task, instructions, structure
    return {"zustand": "gut", "fazit": "Passt.", "punkte": ["a"], "tipps": []}


ki._stats, ki._history, ki.ask_ai = fake_stats, fake_history, fake_ask
asyncio.run(ki.run_aquarium(hass, entry, aq_schema(popup_aq)))
ev = [e for e in hass.bus.events if e[0] == "casora_aquarium_ai_result"]
check([e[1]["status"] for e in ev] == ["running", "done"], f"Aquarium-Events: {ev}")
check(all(e[1].get("temp") == "sensor.becken_temperatur" for e in ev), "Aquarium-Event ohne Becken-Schlüssel")
t = asked.get("text", "")
for frag in ("Becken", "25.2 °C", "25,10/24,80/25,60", "Pumpe: on", "12.5 W", "Heizer: off", "in 7 Tagen aus 168,0 h", "Beckenlicht: on (50 %)"):
    check(frag in t, f"Aquarium-Prompt ohne „{frag}“")
check("punkte" in asked.get("structure", {}), "Aquarium-Struktur ohne punkte")


async def fail_ask(*a, **kw):
    raise ValueError("Keine KI eingerichtet")


ki.ask_ai = fail_ask
hass.bus.events.clear()
asyncio.run(ki.run_aquarium(hass, entry, aq_schema(popup_aq)))
check(hass.bus.events[-1][1].get("status") == "error" and "Keine KI" in hass.bus.events[-1][1].get("error", ""),
      "Aquarium-Fehler nicht gemeldet")

# ── Rad-Check: Prompt und Events ──────────────────────────────────────────────
items = [
    state("sensor.rad_odometer", "1192", unit_of_measurement="km", friendly_name="Rad Kilometerstand"),
    state("binary_sensor.rad_theft_reported", "off", friendly_name="Rad Diebstahl"),
    state("sensor.rad_soc", "unavailable", friendly_name="Rad Akku"),
    state("button.rad_sync", "unknown", friendly_name="Rad Sync"),
    state("date.rad_service_due_date", "2026-07-03", friendly_name="Rad Service fällig"),
]
hass = fake_hass(items)
ctx = ki.ebike_context(hass, [s.entity_id for s in items])
check("Rad Kilometerstand: 1192 km" in ctx, "E-Bike-Prompt ohne Kilometer")
check("Rad Diebstahl: nein" in ctx, "E-Bike: binary_sensor nicht als ja/nein")
check("Rad Akku" not in ctx and "Rad Sync" not in ctx, "E-Bike: ungültige Werte/Knöpfe im Prompt")
check("2026-07-03" in ctx, "E-Bike-Prompt ohne Service-Datum")
check(ki.ebike_context(hass, ["sensor.rad_soc"]) is None, "E-Bike ohne Werte sollte None liefern")
ki.ask_ai = fake_ask
asyncio.run(ki.run_ebike(hass, entry, {"entities": [s.entity_id for s in items]}))
ev = [e[1] for e in hass.bus.events if e[0] == "casora_ebike_ai_result"]
check([e["status"] for e in ev] == ["running", "done"], f"E-Bike-Events: {ev}")
hass.bus.events.clear()
asyncio.run(ki.run_ebike(hass, entry, {"entities": ["sensor.rad_soc"]}))
check(hass.bus.events[-1][1].get("status") == "error", "E-Bike ohne Werte: kein Fehler-Event")

# Nur Bosch-Integration (1.0.3: keine Bridge-Felder wie Ladegerät oder Akku live)
bosch = [
    state("sensor.drive_unit_x_odometer", "1191.6", unit_of_measurement="km", friendly_name="Drive Unit Kilometerstand"),
    state("sensor.drive_unit_x_powertube_750_charge_cycles", "9.7", friendly_name="PowerTube Ladezyklen"),
    state("sensor.drive_unit_x_service_due_in_days", "-85.5", unit_of_measurement="d", friendly_name="Service fällig in"),
]
hass = fake_hass(bosch)
ctx = ki.ebike_context(hass, [s.entity_id for s in bosch])
check(ctx and "PowerTube Ladezyklen: 9.7" in ctx and "Kilometerstand: 1191.6 km" in ctx, f"E-Bike nur Bosch: {ctx}")
captured = {}
async def capture_ask(_h, _e, _t, prompt, _s):
    captured["p"] = prompt
    return {"zustand": "handeln", "fazit": "Service.", "punkte": [], "tipps": []}
ki.ask_ai = capture_ask
hass.bus.events.clear()
asyncio.run(ki.run_ebike(hass, entry, {"entities": [s.entity_id for s in bosch]}))
check(hass.bus.events[-1][1].get("status") == "done", "E-Bike nur Bosch: kein done-Event")
check("Ladestand" not in captured.get("p", ""), "Rad-Check-Prompt verlangt noch einen Live-Ladestand")
ki.ask_ai = fake_ask

# ── Sensoren: Ablage wie von den Popups gelesen ──────────────────────────────
s = sensor.KiSensor("aquarium")
s._on_aquarium(SimpleNamespace(data={"temp": "sensor.becken_temperatur", "status": "done",
                                     "result": {"zustand": "gut", "fazit": "Passt.", "punkte": ["x"], "tipps": ["y"]}}))
b = s._attrs.get("becken") or []
check(len(b) == 1 and b[0]["id"] == "sensor.becken_temperatur" and b[0]["zustand"] == "gut" and b[0]["at"],
      f"Aquarium-Sensor: {b}")
s._on_aquarium(SimpleNamespace(data={"temp": "sensor.becken_temperatur", "status": "running"}))
check(len(s._attrs["becken"]) == 1 and s._attrs["becken"][0]["status"] == "running", "Aquarium-Sensor ersetzt nicht")
s = sensor.KiSensor("ebike")
s._on_ebike(SimpleNamespace(data={"status": "done", "result": {"zustand": "handeln", "fazit": "Service.",
                                                                "punkte": ["p"], "tipps": ["t"]}}))
a = s._attrs
check(a.get("fazit") == "Service." and a.get("zustand") == "handeln" and a.get("punkte") == ["p"] and a.get("erstellt"),
      f"E-Bike-Sensor: {a}")
s._on_ebike(SimpleNamespace(data={"status": "error", "error": "kaputt"}))
check(s._attrs.get("fazit") == "Service." and s._attrs.get("fehler") == "kaputt", "E-Bike-Fehler überschreibt Fazit")

print("ki_aquarium_ebike: " + ("ok" if not FAILS else f"{len(FAILS)} Fehler"))
sys.exit(1 if FAILS else 0)
