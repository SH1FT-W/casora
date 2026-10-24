"""Made-up coffee machines for the test house (coffee machine card, always there), names invented.

* "Testbarista" – as Home Connect (core) creates it: power, operation state, active/selected program, progress,
  program finish, stop program, remote start, options (strength, temperature, amount), cup counters (diagnostic) and
  some of the warnings (disabled by default in reality – enabled here: water tank, beans, drip tray,
  "descaling in 10 cups", descaling due; the others are missing like disabled entities).
* "Morgenbohne" – like De'Longhi over Bluetooth (delonghi_primadonna): status sensor "device_status" (state or – with an
  alarm bit set – its name), power, drink select "make_beverage" (choosing starts, the state stays "none"),
  "dispensing" (attribute percentage), descaling/filter, counters (total_coffee, total_coffee_with_milk, total_water in L).
  No cancel button (the integration has none).
* "Bohnenwerk" – like the power-curve integrations delonghi/krups: drinks recognized from the power curve (state
  off/ready/running, last program, drinks today/total, cups per drink), maintenance as sensors with attribute "due",
  power switch. No drink select (only the machine starts drinks).
* "Kaffeeinsel" – like Home Connect Local (homeconnect_ws): keys sensor_operation_state, switch_power_state,
  select_program (program keys lower-cased, CamelCase not split) + button_start_program/button_abort_program, process
  phase, water tank and drip tray as enum sensors, beans as binary sensor, countdown to descaling, counters sensor_count_*.
* "Espressobar" – a plain smart plug (switch + power sensor, no translation keys) on a device named like a coffee
  machine: the generic fallback. "Kaffeemühle" – a grinder on a plug, which is no coffee machine.

Everything runs under casora_mock; Casora recognizes the integration by the translation_keys.
Test services:
  casora_mock.kaffee_beziehen {getraenk, geraet: testbarista|morgenbohne|bohnenwerk|kaffeeinsel|espressobar, dauer}
      – brew with progress (~30 s), counter +1 at the end
  casora_mock.kaffee_warnung {art: wasser|bohnen|schale|satz|entkalken|aus, geraet} – set a warning or clear all
Also home_connect.set_program_and_options answers (if Home Connect is not loaded); choosing the active program or the
drink select starts a brew like on the real machine, and so does the start button of Kaffeeinsel (selected program).
"""
from __future__ import annotations

from datetime import timedelta

HC = "testbarista"
DL = "morgenbohne"
SW = "bohnenwerk"
WS = "kaffeeinsel"
PL = "espressobar"
GR = "kaffeemuehle"
SW_DRINKS = ("Espresso", "Espresso 2x", "Kaffee", "Cappuccino")
P = "consumer_products_coffee_maker_program_"
PROGRAMS = [P + x for x in (
    "beverage_ristretto", "beverage_espresso", "beverage_espresso_doppio", "beverage_coffee", "beverage_x_l_coffee",
    "beverage_cappuccino", "beverage_latte_macchiato", "beverage_caffe_latte", "beverage_espresso_macchiato",
    "coffee_world_flat_white", "coffee_world_americano", "beverage_milk_froth", "beverage_hot_water",
    "my_coffee_my_coffee_1", "cleaning_modes_rinsing", "cleaning_modes_descaling")]
OPS = ["inactive", "ready", "delayedstart", "run", "pause", "actionrequired", "finished", "error", "aborting"]
BEAN = ["consumer_products_coffee_maker_enum_type_bean_amount_" + x for x in (
    "very_mild", "mild", "mild_plus", "normal", "normal_plus", "strong", "strong_plus", "very_strong", "very_strong_plus",
    "extra_strong", "double_shot", "double_shot_plus", "double_shot_plus_plus")]
TEMP = ["consumer_products_coffee_maker_enum_type_coffee_temperature_" + x for x in ("88_c", "90_c", "92_c", "94_c", "95_c", "96_c")]
WARN_OPTS = ["confirmed", "off", "present"]
# As delonghi_primadonna: "none" plus the recipe names from MachinesModels.json.
DL_DRINKS = ["none", "Espresso Coffee", "Coffee", "Long", "Doppio+", "Americano", "Cappuccino", "Latte Macchiato", "Flat White", "Hot Water"]
DL_MILK = ("Cappuccino", "Latte Macchiato", "Flat White")
# homeconnect_ws: program keys lower-cased with "_" for ".", CamelCase not split.
WSP = "consumerproducts_coffeemaker_program_"
WS_PROGRAMS = [WSP + x for x in ("beverage_espresso", "beverage_coffee", "beverage_cappuccino", "beverage_lattemacchiato",
                                 "beverage_hotwater", "cleaning_descaling")]
# Program end → counter (sensor_count_<x>).
WS_COUNT = {"espresso": "ristretto_espresso", "coffee": "coffee", "cappuccino": "coffee_milk", "lattemacchiato": "coffee_milk",
            "hotwater": "hot_water_cups"}
WS_PHASES = ("grinding", "coffeebrewing", "milkfroth")
# Power switch per machine (the plug's switch has its own name).
POWER = {HC: f"switch.{HC}_power", DL: f"switch.{DL}_power", SW: f"switch.{SW}_einschalter", WS: f"switch.{WS}_power",
         PL: f"switch.{PL}_steckdose"}


def _e(eid, state, key, device, name, attrs=None, dc=None, unit=None, cat=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": cat}


def extra(now) -> dict:
    h = HC
    ents = [
        _e(f"switch.{h}_power", "on", "power", h, "Testbarista Strom", {"icon": "mdi:power"}),
        _e(f"sensor.{h}_operation_state", "ready", "operation_state", h, "Testbarista Betriebszustand", {"options": OPS}, dc="enum"),
        _e(f"select.{h}_active_program", "unknown", "active_program", h, "Testbarista Aktives Programm", {"options": PROGRAMS}),
        _e(f"select.{h}_selected_program", P + "beverage_cappuccino", "selected_program", h, "Testbarista Ausgewähltes Programm",
           {"options": PROGRAMS}),
        _e(f"sensor.{h}_program_progress", "unknown", "program_progress", h, "Testbarista Programmfortschritt", unit="%"),
        _e(f"sensor.{h}_program_finish_time", "unknown", "program_finish_time", h, "Testbarista Programmende", dc="timestamp"),
        _e(f"button.{h}_stop_program", "unknown", "stop_program", h, "Testbarista Programm beenden"),
        _e(f"binary_sensor.{h}_remote_start", "on", "remote_start", h, "Testbarista Fernstart"),
        _e(f"select.{h}_bean_amount", BEAN[5], "bean_amount", h, "Testbarista Bohnenmenge", {"options": BEAN}),
        _e(f"select.{h}_coffee_temperature", TEMP[2], "coffee_temperature", h, "Testbarista Kaffeetemperatur", {"options": TEMP}),
        _e(f"number.{h}_fill_quantity", "120", "fill_quantity", h, "Testbarista Füllmenge", {"min": 60, "max": 250, "step": 10}, unit="ml"),
        # Counters (diagnostic, total_increasing) – keys as Home Connect (core); no total counter.
        _e(f"sensor.{h}_coffees", "418", "coffee_counter", h, "Testbarista Kaffees", {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_ristretto_espresso_counter", "236", "ristretto_espresso_counter", h, "Testbarista Ristretto/Espresso",
           {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_coffee_and_milk_counter", "655", "coffee_and_milk_counter", h, "Testbarista Kaffee und Milch",
           {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_frothy_milk_counter", "37", "frothy_milk_counter", h, "Testbarista Milchschaum", {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_hot_water_cups_counter", "22", "hot_water_cups_counter", h, "Testbarista Heißwasser Tassen",
           {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_hot_water_counter", "4600", "hot_water_counter", h, "Testbarista Heißwasser", dc="volume", unit="mL", cat="diagnostic"),
        # Warnings (enum present/confirmed/off) – only some of them enabled.
        _e(f"sensor.{h}_water_tank_empty", "off", "water_tank_empty", h, "Testbarista Wassertank leer", {"options": WARN_OPTS}, dc="enum"),
        _e(f"sensor.{h}_bean_container_empty", "off", "bean_container_empty", h, "Testbarista Bohnenbehälter leer", {"options": WARN_OPTS}, dc="enum"),
        _e(f"sensor.{h}_drip_tray_full", "off", "drip_tray_full", h, "Testbarista Tropfschale voll", {"options": WARN_OPTS}, dc="enum"),
        _e(f"sensor.{h}_descaling_in_10_cups", "present", "descaling_in_10_cups", h, "Testbarista Entkalken in 10 Tassen",
           {"options": WARN_OPTS}, dc="enum"),
        _e(f"sensor.{h}_device_should_be_descaled", "off", "device_should_be_descaled", h, "Testbarista Entkalken fällig",
           {"options": WARN_OPTS}, dc="enum"),
    ]
    d = DL
    ents += [
        # device_status: diagnostic, no enum (ready, heating, brewing … or the name of the lowest alarm bit).
        _e(f"sensor.{d}_device_status", "ready", "device_status", d, "Morgenbohne Status", cat="diagnostic"),
        _e(f"switch.{d}_power", "on", "power", d, "Morgenbohne Strom"),
        _e(f"select.{d}_make_beverage", "none", "make_beverage", d, "Morgenbohne Getränk", {"options": DL_DRINKS}),
        _e(f"binary_sensor.{d}_enabled", "on", "enabled", d, "Morgenbohne Eingeschaltet", dc="running"),
        _e(f"binary_sensor.{d}_dispensing", "off", "dispensing", d, "Morgenbohne Gibt aus", {"percentage": 0}, dc="running"),
        _e(f"binary_sensor.{d}_descaling", "off", "descaling", d, "Morgenbohne Entkalken nötig", dc="problem"),
        _e(f"binary_sensor.{d}_filter", "off", "filter", d, "Morgenbohne Filter wechseln", dc="problem"),
        _e(f"sensor.{d}_total_coffee", "1204", "total_coffee", d, "Morgenbohne Kaffee gesamt", {"state_class": "total_increasing"}),
        _e(f"sensor.{d}_total_coffee_with_milk", "512", "total_coffee_with_milk", d, "Morgenbohne Milchgetränke gesamt",
           {"state_class": "total_increasing"}),
        _e(f"sensor.{d}_total_water", "86.4", "total_water", d, "Morgenbohne Wasser gesamt", {"state_class": "total_increasing"}, unit="L"),
    ]
    w = SW
    ents += [
        _e(f"sensor.{w}_status", "ready", "status", w, "Bohnenwerk Betriebszustand",
           {"options": ["off", "ready", "running"], "power_w": 2.0}, dc="enum"),
        _e(f"switch.{w}_einschalter", "on", "power", w, "Bohnenwerk Einschalter"),
        _e(f"sensor.{w}_letztes_programm", "Cappuccino", "last_program", w, "Bohnenwerk Letztes Programm",
           {"start": (now - timedelta(minutes=40)).isoformat()}),
        _e(f"sensor.{w}_angelernte_programme", "4", "learning", w, "Bohnenwerk Angelernte Programme", cat="diagnostic"),
        _e(f"sensor.{w}_bezuge_heute", "2", "drinks_today", w, "Bohnenwerk Bezüge heute", {"state_class": "total_increasing"}),
        _e(f"sensor.{w}_bezuge_gesamt", "86", "drinks_total", w, "Bohnenwerk Bezüge gesamt", {"state_class": "total_increasing"}),
        *(_e(f"sensor.{w}_{n.lower().replace(' ', '_')}", str(c), "cups", w, f"Bohnenwerk {n}", {"state_class": "total_increasing"},
             unit="cups", cat="diagnostic") for n, c in zip(SW_DRINKS, (31, 6, 22, 27))),
        _e(f"sensor.{w}_entkalken_in", "42.5", "descale", w, "Bohnenwerk Entkalken in", {"due": False}, dc="volume", unit="L"),
        _e(f"sensor.{w}_filterwechsel_in", "12", "filter", w, "Bohnenwerk Filterwechsel in", {"due": False}, dc="duration", unit="d"),
        _e(f"sensor.{w}_bruhgruppe_ausspulen_in", "3", "brew_unit", w, "Bohnenwerk Brühgruppe ausspülen in", {"due": False},
           dc="duration", unit="d"),
        _e(f"sensor.{w}_trester_leeren_in", "6", "grounds_in", w, "Bohnenwerk Trester leeren in", {"due": False}, unit="drinks"),
        _e(f"sensor.{w}_wassertank", "1100", "tank", w, "Bohnenwerk Wassertank", {"due": False}, dc="volume_storage", unit="mL"),
        _e(f"sensor.{w}_bohnen", "70", "beans", w, "Bohnenwerk Bohnen", {"due": False}, unit="%"),
        _e(f"binary_sensor.{w}_milchsystem_reinigen", "off", "milk", w, "Bohnenwerk Milchsystem reinigen", dc="problem"),
        _e(f"binary_sensor.{w}_wartung_fallig", "off", "maintenance_due", w, "Bohnenwerk Wartung fällig", {"tasks": []}, dc="problem"),
    ]
    k = WS
    ents += [
        _e(f"switch.{k}_power", "on", "switch_power_state", k, "Kaffeeinsel Gerätestatus"),
        _e(f"sensor.{k}_operation_state", "ready", "sensor_operation_state", k, "Kaffeeinsel Betriebszustand", {"options": OPS}, dc="enum"),
        _e(f"select.{k}_program", WSP + "beverage_cappuccino", "select_program", k, "Kaffeeinsel Programm", {"options": WS_PROGRAMS}),
        _e(f"sensor.{k}_active_program", "unknown", "sensor_active_program", k, "Kaffeeinsel Aktives Programm"),
        _e(f"button.{k}_start", "unknown", "button_start_program", k, "Kaffeeinsel Programm starten"),
        _e(f"button.{k}_abort", "unknown", "button_abort_program", k, "Kaffeeinsel Programm abbrechen"),
        _e(f"sensor.{k}_program_progress", "unknown", "sensor_program_progress", k, "Kaffeeinsel Programmfortschritt", unit="%"),
        _e(f"sensor.{k}_remaining_program_time", "unknown", "sensor_remaining_program_time", k, "Kaffeeinsel Restzeit",
           dc="duration", unit="s"),
        _e(f"sensor.{k}_process_phase", "none", "sensor_coffeemaker_process_phase", k, "Kaffeeinsel Prozessphase",
           {"options": ["none", *WS_PHASES]}, dc="enum"),
        _e(f"binary_sensor.{k}_remote_start", "on", "binary_remote_start_allowed", k, "Kaffeeinsel Fernstart erlaubt"),
        _e(f"select.{k}_bean_amount", "normal", "select_bean_amount", k, "Kaffeeinsel Bohnenmenge",
           {"options": ["verymild", "mild", "normal", "strong", "verystrong"]}),
        _e(f"select.{k}_coffee_temperature", "92c", "select_coffee_temperature", k, "Kaffeeinsel Kaffeetemperatur",
           {"options": ["88c", "90c", "92c", "94c"]}),
        _e(f"sensor.{k}_water_tank", "full", "sensor_water_tank", k, "Kaffeeinsel Wassertank",
           {"options": ["empty", "nearly_empty", "not_inserted", "full"]}, dc="enum"),
        _e(f"sensor.{k}_drip_tray", "ok", "sensor_drip_tray", k, "Kaffeeinsel Tropfschale", {"options": ["full", "not_inserted", "ok"]}, dc="enum"),
        _e(f"binary_sensor.{k}_bean_container_empty", "off", "binary_sensor_bean_container_empty", k,
           "Kaffeeinsel Bohnenbehälter leer", dc="problem"),
        _e(f"sensor.{k}_countdown_descaling", "35", "sensor_countdown_descaling", k, "Kaffeeinsel Entkalken in"),
        *(_e(f"sensor.{k}_count_{n}", str(c), f"sensor_count_{n}", k, f"Kaffeeinsel Anzahl {n}", {"state_class": "total_increasing"})
          for n, c in (("ristretto_espresso", 64), ("coffee", 120), ("coffee_milk", 210), ("hot_water_cups", 9))),
    ]
    # Generic plug on a device named like a coffee machine, and a grinder on a plug (no coffee machine).
    ents += [
        _e(f"switch.{PL}_steckdose", "on", None, PL, "Espressobar Steckdose"),
        _e(f"sensor.{PL}_leistung", "4.0", None, PL, "Espressobar Leistung", {"state_class": "measurement"}, dc="power", unit="W"),
        _e(f"sensor.{PL}_energie", "12.4", None, PL, "Espressobar Energie", {"state_class": "total_increasing"}, dc="energy", unit="kWh"),
        _e(f"switch.{GR}_steckdose", "off", None, GR, "Kaffeemühle Steckdose"),
        _e(f"sensor.{GR}_leistung", "0.0", None, GR, "Kaffeemühle Leistung", {"state_class": "measurement"}, dc="power", unit="W"),
    ]
    # Counter history: three coffees fewer early today – "Heute 3" in the popup.
    hist = {}
    for eid, base in ((f"sensor.{h}_coffees", 418), (f"sensor.{h}_coffee_and_milk_counter", 655), (f"sensor.{d}_total_coffee", 1204),
                      (f"sensor.{k}_count_coffee", 120)):
        hist[eid] = {"steps": [[20, str(base - 3)], [0.4, str(base - 2)], [0.1, str(base - 1)]]}
    return {
        "devices": [
            {"key": HC, "name": "Testbarista", "manufacturer": "Bosch", "model": "Vollautomat 9", "area": None},
            {"key": DL, "name": "Morgenbohne", "manufacturer": "De'Longhi", "model": "Bluetooth", "area": None},
            {"key": SW, "name": "Bohnenwerk", "manufacturer": "De'Longhi", "model": "Stromerkennung", "area": None},
            {"key": WS, "name": "Kaffeeinsel", "manufacturer": "Siemens", "model": "Vollautomat lokal", "area": None},
            {"key": PL, "name": "Espressobar", "manufacturer": "Steckwerk", "model": "Zwischenstecker", "area": None},
            {"key": GR, "name": "Kaffeemühle", "manufacturer": "Steckwerk", "model": "Zwischenstecker", "area": None},
        ],
        "entities": ents,
        "_history": hist,
    }


# ── Brewing, warnings, test services ──────────────────────────────────────────
def _counter(prog: str) -> tuple[str, int]:
    """Which Testbarista counter counts (entity, ml for hot water)."""
    k = prog.rsplit("_program_", 1)[-1]
    if any(x in k for x in ("ristretto", "espresso_doppio")) or k.endswith("_espresso"):
        return f"sensor.{HC}_ristretto_espresso_counter", 0
    if any(x in k for x in ("cappuccino", "latte", "macchiato", "flat_white")):
        return f"sensor.{HC}_coffee_and_milk_counter", 0
    if "milk_froth" in k:
        return f"sensor.{HC}_frothy_milk_counter", 0
    if "hot_water" in k:
        return f"sensor.{HC}_hot_water_cups_counter", 200
    if "cleaning" in k:
        return "", 0
    return f"sensor.{HC}_coffees", 0


def setup(hass, mock) -> None:
    import voluptuous as vol
    from homeassistant.core import callback
    from homeassistant.helpers.event import async_call_later, async_track_state_change_event
    from homeassistant.util import dt as dt_util

    run = {HC: None, DL: None, SW: None, WS: None, PL: None}

    def bump(eid: str, by: int = 1) -> None:
        st = hass.states.get(eid)
        try:
            mock.set(eid, str(int(float(st.state)) + by))
        except (AttributeError, ValueError, TypeError):
            pass

    def stop(dev: str, done: bool) -> None:
        job = run.get(dev)
        if job:
            for cancel in job["timers"]:
                cancel()
        run[dev] = None
        if dev == SW:
            # Only after the brew the drink is known (like the power-curve recognition).
            if done and job:
                mock.set(f"sensor.{SW}_letztes_programm", job["prog"], start=job["t0"].isoformat())
                bump(f"sensor.{SW}_bezuge_heute")
                bump(f"sensor.{SW}_bezuge_gesamt")
                bump(f"sensor.{SW}_{job['prog'].lower().replace(' ', '_')}")
            mock.set(f"sensor.{SW}_status", "ready", power_w=2.0)
        elif dev == HC:
            if done and job:
                cid, ml = _counter(job["prog"])
                if cid:
                    bump(cid)
                if ml:
                    bump(f"sensor.{HC}_hot_water_counter", ml)
            mock.set(f"sensor.{HC}_operation_state", "finished" if done else "ready")
            mock.set(f"select.{HC}_active_program", "unknown")
            mock.set(f"sensor.{HC}_program_progress", "unknown")
            mock.set(f"sensor.{HC}_program_finish_time", "unknown")
            if done:
                @callback
                def ready(_now) -> None:
                    if run[HC] is None and hass.states.is_state(f"sensor.{HC}_operation_state", "finished"):
                        mock.set(f"sensor.{HC}_operation_state", "ready")
                async_call_later(hass, 4, ready)
        elif dev == WS:
            if done and job:
                n = WS_COUNT.get(job["prog"].rsplit("_", 1)[-1])
                if n:
                    bump(f"sensor.{WS}_count_{n}")
            mock.set(f"sensor.{WS}_operation_state", "ready")
            mock.set(f"sensor.{WS}_active_program", "unknown")
            mock.set(f"sensor.{WS}_program_progress", "unknown")
            mock.set(f"sensor.{WS}_remaining_program_time", "unknown")
            mock.set(f"sensor.{WS}_process_phase", "none")
        elif dev == PL:
            mock.set(f"sensor.{PL}_leistung", "4.0" if hass.states.is_state(POWER[PL], "on") else "0.0")
        else:
            # Counter +1 only at the end of the brew (like the machine).
            if done and job:
                bump(f"sensor.{DL}_total_coffee_with_milk" if job["prog"] in DL_MILK else f"sensor.{DL}_total_coffee")
            mock.set(f"binary_sensor.{DL}_dispensing", "off", percentage=0)
            mock.set(f"sensor.{DL}_device_status", "ready")

    def brew(dev: str, prog: str, dauer: float = 30.0) -> None:
        if run.get(dev):
            return
        if not hass.states.is_state(POWER[dev], "on"):
            mock.set(POWER[dev], "on")
        job = run[dev] = {"prog": prog, "timers": [], "t0": dt_util.utcnow()}
        steps = 10
        if dev == SW:
            mock.set(f"sensor.{SW}_status", "running", power_w=1420.0)
        elif dev == HC:
            mock.set(f"sensor.{HC}_operation_state", "run")
            mock.set(f"select.{HC}_active_program", prog)
            mock.set(f"sensor.{HC}_program_progress", "0")
            mock.set(f"sensor.{HC}_program_finish_time", (job["t0"] + timedelta(seconds=dauer)).isoformat())
        elif dev == WS:
            mock.set(f"sensor.{WS}_operation_state", "run")
            mock.set(f"sensor.{WS}_active_program", prog)
            mock.set(f"sensor.{WS}_program_progress", "0")
            mock.set(f"sensor.{WS}_remaining_program_time", str(int(dauer)))
            mock.set(f"sensor.{WS}_process_phase", WS_PHASES[0])
        elif dev == PL:
            mock.set(f"sensor.{PL}_leistung", "1350.0")
        else:
            mock.set(f"sensor.{DL}_device_status", "brewing")
            mock.set(f"binary_sensor.{DL}_dispensing", "on", percentage=0)
        for i in range(1, steps + 1):
            @callback
            def tick(_now, i=i) -> None:
                if run.get(dev) is not job:
                    return
                if i == steps:
                    stop(dev, True)
                elif dev in (SW, PL):
                    pass
                elif dev == HC:
                    mock.set(f"sensor.{HC}_program_progress", str(i * 100 // steps))
                elif dev == WS:
                    mock.set(f"sensor.{WS}_program_progress", str(i * 100 // steps))
                    mock.set(f"sensor.{WS}_remaining_program_time", str(int(dauer * (steps - i) / steps)))
                    mock.set(f"sensor.{WS}_process_phase", WS_PHASES[min(len(WS_PHASES) - 1, i * len(WS_PHASES) // steps)])
                else:
                    mock.set(f"binary_sensor.{DL}_dispensing", "on", percentage=i * 100 // steps)
            job["timers"].append(async_call_later(hass, dauer * i / steps, tick))

    async def beziehen(call) -> None:
        dev = call.data.get("geraet", HC)
        g = str(call.data.get("getraenk", "cappuccino"))
        dauer = float(call.data.get("dauer", 30))
        if dev == SW:
            brew(SW, next((x for x in SW_DRINKS if x.lower() == g.lower()), "Cappuccino"), dauer)
        elif dev == HC:
            prog = g if g.startswith(P) else next((p for p in PROGRAMS if p.endswith("_" + g)), P + "beverage_cappuccino")
            brew(HC, prog, dauer)
        elif dev == WS:
            prog = g if g.startswith(WSP) else next((p for p in WS_PROGRAMS if p.endswith("_" + g)), WSP + "beverage_cappuccino")
            brew(WS, prog, dauer)
        elif dev == PL:
            brew(PL, "power", dauer)
        else:
            brew(DL, next((x for x in DL_DRINKS if x.lower().replace(" ", "_") == g.lower()), g), dauer)

    WARN = {"wasser": "water_tank_empty", "bohnen": "bean_container_empty", "schale": "drip_tray_full", "entkalken": "device_should_be_descaled"}
    DL_WARN = {"wasser": "empty_water_tank", "bohnen": "coffee_beans_empty", "schale": "empty_drip_tray", "satz": "coffee_waste_container_full"}

    async def warnung(call) -> None:
        dev = call.data.get("geraet", HC)
        art = str(call.data.get("art", "wasser"))
        if dev == SW:
            # Power-curve integration: maintenance through the attribute "due" (value 0 = due now).
            for a, k in (("wasser", "wassertank"), ("bohnen", "bohnen"), ("satz", "trester_leeren_in"), ("entkalken", "entkalken_in")):
                if art == "aus" or a == art:
                    eid = f"sensor.{SW}_{k}"
                    back = {"wassertank": "1100", "bohnen": "70", "trester_leeren_in": "6", "entkalken_in": "42.5"}[k]
                    mock.set(eid, back if art == "aus" else "0", due=art != "aus")
        elif dev == HC:
            for a, k in WARN.items():
                if art == "aus" or a == art:
                    mock.set(f"sensor.{HC}_{k}", "off" if art == "aus" else "present")
        elif dev == WS:
            if art in ("aus", "wasser"):
                mock.set(f"sensor.{WS}_water_tank", "full" if art == "aus" else "empty")
            if art in ("aus", "schale"):
                mock.set(f"sensor.{WS}_drip_tray", "ok" if art == "aus" else "full")
            if art in ("aus", "bohnen"):
                mock.set(f"binary_sensor.{WS}_bean_container_empty", "off" if art == "aus" else "on")
            if art in ("aus", "entkalken"):
                mock.set(f"sensor.{WS}_countdown_descaling", "35" if art == "aus" else "0")
        elif dev == DL:
            if art == "aus":
                mock.set(f"sensor.{DL}_device_status", "ready")
                mock.set(f"binary_sensor.{DL}_descaling", "off")
            elif art == "entkalken":
                mock.set(f"binary_sensor.{DL}_descaling", "on")
            elif art in DL_WARN:
                mock.set(f"sensor.{DL}_device_status", DL_WARN[art])

    devs = [HC, DL, SW, WS, PL]
    hass.services.async_register("casora_mock", "kaffee_beziehen", beziehen, vol.Schema({
        vol.Optional("getraenk"): str, vol.Optional("geraet"): vol.In(devs), vol.Optional("dauer"): vol.Coerce(float)}))
    hass.services.async_register("casora_mock", "kaffee_warnung", warnung, vol.Schema({
        vol.Required("art"): vol.In(["wasser", "bohnen", "schale", "satz", "entkalken", "aus"]), vol.Optional("geraet"): vol.In(devs)}))

    # As Home Connect: start a program with its options (only when the real integration is missing).
    async def set_program(call) -> None:
        prog = call.data.get("program")
        if call.data.get("affects_to") == "active_program" and prog in PROGRAMS:
            brew(HC, prog)
        elif prog in PROGRAMS:
            mock.set(f"select.{HC}_selected_program", prog)

    if not hass.services.has_service("home_connect", "set_program_and_options"):
        hass.services.async_register("home_connect", "set_program_and_options", set_program)

    # Choosing starts a brew like on the machine – also the same drink again (hence the service call, not the state
    # change): HC "active_program" (only with remote start), De'Longhi BT "make_beverage" (state stays "none").
    @callback
    def called(event) -> None:
        d = event.data
        if d.get("domain") != "select" or d.get("service") != "select_option":
            return
        data = d.get("service_data") or {}
        ids = data.get("entity_id") or []
        ids = [ids] if isinstance(ids, str) else list(ids)
        opt = data.get("option")
        if f"select.{HC}_active_program" in ids and opt in PROGRAMS and hass.states.is_state(f"binary_sensor.{HC}_remote_start", "on"):
            brew(HC, opt)
        if f"select.{DL}_make_beverage" in ids and opt in DL_DRINKS and opt != "none":
            brew(DL, opt)

    hass.bus.async_listen("call_service", called)

    @callback
    def changed(event) -> None:
        eid = event.data.get("entity_id")
        new = event.data.get("new_state")
        if new is None:
            return
        if eid == f"button.{HC}_stop_program" and run[HC]:
            stop(HC, False)
        elif eid == f"button.{WS}_abort" and run[WS]:
            stop(WS, False)
        elif eid == f"button.{WS}_start" and hass.states.is_state(f"binary_sensor.{WS}_remote_start", "on"):
            sel = hass.states.get(f"select.{WS}_program")
            if sel and sel.state in WS_PROGRAMS:
                brew(WS, sel.state)
        elif eid == f"switch.{HC}_power" and new.state == "off":
            stop(HC, False)
            mock.set(f"sensor.{HC}_operation_state", "inactive")
        elif eid == f"switch.{HC}_power" and new.state == "on" and hass.states.is_state(f"sensor.{HC}_operation_state", "inactive"):
            mock.set(f"sensor.{HC}_operation_state", "ready")
        elif eid == f"switch.{WS}_power":
            if new.state == "off":
                stop(WS, False)
            mock.set(f"sensor.{WS}_operation_state", "inactive" if new.state == "off" else "ready")
        elif eid == POWER[PL]:
            if new.state == "off":
                stop(PL, False)
            mock.set(f"sensor.{PL}_leistung", "0.0" if new.state == "off" else "4.0")
        elif eid == f"switch.{SW}_einschalter":
            if new.state == "off":
                stop(SW, False)
            mock.set(f"sensor.{SW}_status", "off" if new.state == "off" else "ready", power_w=0.0 if new.state == "off" else 2.0)
        elif eid == f"switch.{DL}_power":
            if new.state == "off":
                stop(DL, False)
            mock.set(f"sensor.{DL}_device_status", "turned_off" if new.state == "off" else "ready")

    async_track_state_change_event(hass, [f"button.{HC}_stop_program", f"switch.{HC}_power", f"switch.{DL}_power",
                                         f"switch.{SW}_einschalter", f"button.{WS}_start", f"button.{WS}_abort",
                                         f"switch.{WS}_power", POWER[PL]], changed)
