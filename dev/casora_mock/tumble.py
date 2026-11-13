"""A washer and a dryer as the Tumble integration (platform tumble) creates them, also in the demo house.

Keys, device classes, states and attributes as in Tumble 26.11 (sensor.py, binary_sensor.py, button.py, event.py,
maintenance.py); the appliance type is the device model ("washer"/"dryer", entity.py DeviceInfo). The device
names start with "Tumble" on purpose: Casora must take the dryer role from the model, never from the word
"tumble" in a name or id (scripts/local/00-finder.js casoraLaundryFind, live_finder.py).

* "Tumble Waschmaschine": running for 48 minutes, note "Baumwolle 40", descaling due (31 of 30 cycles).
* "Tumble Trockner": finished, laundry still inside, lint filter due.

Buttons act like Tumble: "Ausgeräumt" turns the status off, a care button counts the task from now.
The text entity "note" holds the user's note on the cycle; Casora shows it as the programme line.
"""
from __future__ import annotations

from datetime import datetime, timedelta

STATUS = ["off", "running", "finished", "anti_crease"]
EVENTS = ["started", "finished", "anti_crease", "unloaded"]
# Tumble's care tasks (maintenance.py DEFAULT_TASKS) with the German names of its sensors and buttons.
TASKS = {
    "washer": [("descale", "entkalken", "Läufe seit Entkalken", "Entkalkt", 30),
               ("filter_clean", "filterreinigung", "Läufe seit Filterreinigung", "Filter gereinigt", 50),
               ("drum_clean", "trommelreinigung", "Läufe seit Trommelreinigung", "Trommel gereinigt", 100)],
    "dryer": [("lint_filter", "flusensieb", "Läufe seit Flusensieb", "Flusensieb gereinigt", 10),
              ("condenser_clean", "kondensatorreinigung", "Läufe seit Kondensatorreinigung", "Kondensator gereinigt", 30)],
}


def _e(eid, state, key, device, name, attrs=None, dc=None, unit=None, category=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": category}


def _appliance(now: datetime, kind: str, dev: str, slug: str, title: str, status: str, count: int, total_kwh: float,
               last: tuple[float, int, float], since: dict[str, int], running_min: int | None,
               note: str | None = None) -> tuple[list, dict]:
    """Entities and button effects of one appliance. last = (hours ago it ended, minutes, kWh)."""
    p = f"tumble_{slug}"
    ago_h, minutes, kwh = last
    due = [t for t, _s, _n, _b, every in TASKS[kind] if since.get(t, 0) >= every]
    ents = [
        _e(f"sensor.{p}_status", status, "status", dev, f"{title} Status", {"options": STATUS, "fast_poll": True}, dc="enum"),
        _e(f"sensor.{p}_gestartet_um",
           (now - timedelta(minutes=running_min)).isoformat() if running_min is not None else "unknown",
           "cycle_start", dev, f"{title} Gestartet um", dc="timestamp"),
        _e(f"sensor.{p}_zuletzt_fertig", (now - timedelta(hours=ago_h)).isoformat(), "last_end", dev,
           f"{title} Zuletzt fertig", dc="timestamp"),
        _e(f"sensor.{p}_letzte_dauer", str(minutes), "last_duration", dev, f"{title} Letzte Dauer", dc="duration", unit="min"),
        _e(f"sensor.{p}_letzter_verbrauch", str(kwh), "last_energy", dev, f"{title} Letzter Verbrauch", dc="energy", unit="kWh"),
        _e(f"sensor.{p}_durchlaufe", str(count), "cycle_count", dev, f"{title} Durchläufe",
           {"state_class": "total_increasing"}, category="diagnostic"),
        _e(f"sensor.{p}_verbrauch_gesamt", str(total_kwh), "total_energy", dev, f"{title} Verbrauch gesamt",
           {"state_class": "total_increasing"}, dc="energy", unit="kWh", category="diagnostic"),
        _e(f"binary_sensor.{p}_lauft", "on" if status == "running" else "off", "running", dev, f"{title} Läuft", dc="running"),
        _e(f"binary_sensor.{p}_wartung_fallig", "on" if due else "off", "maintenance_due", dev, f"{title} Wartung fällig",
           {"tasks": due}, dc="problem"),
        _e(f"button.{p}_ausgeraumt", "unknown", "unload", dev, f"{title} Ausgeräumt"),
        _e(f"event.{p}_durchlauf", "unknown", "cycle", dev, f"{title} Durchlauf", {"event_types": EVENTS}),
        _e(f"text.{p}_notiz", note or "", "note", dev, f"{title} Notiz", {"min": 0, "max": 120, "mode": "text"}),
    ]
    buttons = {f"button.{p}_ausgeraumt": {f"sensor.{p}_status": "off"}}
    for task, s, sname, bname, every in TASKS[kind]:
        n = since.get(task, 0)
        ents.append(_e(f"sensor.{p}_laufe_seit_{s}", str(n), f"maint_{task}", dev, f"{title} {sname}",
                       {"every_cycles": every, "every_days": 0, "last_done": None, "due": task in due}))
        ents.append(_e(f"button.{p}_{s}_erledigt", "unknown", f"maint_{task}_done", dev, f"{title} {bname}"))
        rest = [t for t in due if t != task]
        buttons[f"button.{p}_{s}_erledigt"] = {
            f"sensor.{p}_laufe_seit_{s}": {"state": "0", "attrs": {"due": False, "last_done": now.isoformat()}},
            f"binary_sensor.{p}_wartung_fallig": {"state": "on" if rest else "off", "attrs": {"tasks": rest}},
        }
    return ents, buttons


def extra(now: datetime) -> dict:
    w, t = "mock_tumble_waschmaschine", "mock_tumble_trockner"
    ew, bw = _appliance(now, "washer", w, "waschmaschine", "Tumble Waschmaschine", "running", 214, 131.6,
                        (26, 118, 0.84), {"descale": 31, "filter_clean": 12, "drum_clean": 64}, 48, "Baumwolle 40")
    et, bt = _appliance(now, "dryer", t, "trockner", "Tumble Trockner", "finished", 96, 148.3,
                        (0.4, 132, 1.62), {"lint_filter": 11, "condenser_clean": 9}, None)
    # This month: cycles and their energy as steps of the counters (recorder statistics, see __init__.py).
    days = now.day - 1
    wsteps = [[24 * d + 6, 1] for d in range(1, days, 3)]
    tsteps = [[24 * d + 4, 1] for d in range(2, days, 4)]
    return {
        "areas": ["Waschküche"],
        "devices": [
            {"key": w, "name": "Tumble Waschmaschine", "manufacturer": "Tumble", "model": "washer", "area": "Waschküche"},
            {"key": t, "name": "Tumble Trockner", "manufacturer": "Tumble", "model": "dryer", "area": "Waschküche"},
        ],
        "entities": ew + et,
        "_buttons": {**bw, **bt},
        "_stats_events": {
            "sensor.tumble_waschmaschine_durchlaufe": wsteps,
            "sensor.tumble_waschmaschine_verbrauch_gesamt": [[h, 0.8] for h, _ in wsteps],
            "sensor.tumble_trockner_durchlaufe": tsteps,
            "sensor.tumble_trockner_verbrauch_gesamt": [[h, 1.5] for h, _ in tsteps],
        },
    }
