"""Zwei erfundene Kaffeevollautomaten für das Testhaus (Community-Karte „Kaffeevollautomat“, immer dabei).

* „Testbarista“ – wie Home Connect (Core) ihn anlegt: Strom, Betriebszustand, aktives/gewähltes Programm,
  Fortschritt, Programmende, Programm beenden, Fernstart, Optionen (Stärke, Temperatur, Menge), Tassen-Zähler
  (Diagnose) und ein Teil der Warnungen (in echt ab Werk aus – hier aktiviert: Wassertank, Bohnen, Schale,
  „Entkalken in 10 Tassen“, Entkalken fällig; die übrigen fehlen wie deaktivierte Entitäten).
* „Morgenbohne“ – wie De'Longhi über Bluetooth (delonghi_primadonna): ein Status-Sensor (Zustand oder Alarm),
  Strom, Getränke-Auswahl (startet sofort), „Gibt aus“, Entkalken/Filter, Zähler.

Im Testhaus läuft alles unter casora_mock; Casora erkennt die Integration an den translation_keys.
Testdienste:
  casora_mock.kaffee_beziehen {getraenk, geraet: testbarista|morgenbohne, dauer}  – Bezug mit Fortschritt (~30 s), Zähler +1
  casora_mock.kaffee_warnung {art: wasser|bohnen|schale|entkalken|aus, geraet}      – Warnung setzen bzw. alle zurücknehmen
Dazu antwortet home_connect.set_program_and_options (falls Home Connect nicht geladen ist) und die Auswahl des
aktiven Programms bzw. der Getränke-Auswahl startet einen Bezug wie an der echten Maschine. Namen erfunden.
"""
from __future__ import annotations

from datetime import timedelta

HC = "testbarista"
DL = "morgenbohne"
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
DL_DRINKS = ["espresso", "coffee", "long", "doppio_plus", "americano", "cappuccino", "latte_macchiato", "flat_white", "hot_water"]
DL_STATES = ["turned_off", "heating", "ready", "brewing", "rinsing", "descaling", "empty_water_tank", "coffee_beans_empty",
             "coffee_waste_container_full", "empty_drip_tray", "descale_alarm"]


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
        # Zähler (Diagnose, total_increasing) – Home Connect hat keinen Gesamtzähler.
        _e(f"sensor.{h}_coffees", "418", "coffee_counter", h, "Testbarista Kaffees", {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_ristretto_espresso_cups", "236", "ristretto_espresso_cups", h, "Testbarista Ristretto/Espresso",
           {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_coffee_and_milk_cups", "655", "coffee_and_milk_cups", h, "Testbarista Kaffee und Milch",
           {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_frothy_milk_cups", "37", "frothy_milk_cups", h, "Testbarista Milchschaum", {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_hot_water_cups_counter", "22", "hot_water_cups_counter", h, "Testbarista Heißwasser Tassen",
           {"state_class": "total_increasing"}, cat="diagnostic"),
        _e(f"sensor.{h}_hot_water_counter", "4600", "hot_water_counter", h, "Testbarista Heißwasser", {"state_class": "total_increasing"},
           unit="ml", cat="diagnostic"),
        # Warnungen (enum present/confirmed/off) – nur ein Teil „aktiviert“.
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
        _e(f"sensor.{d}_status", "ready", "machine_status", d, "Morgenbohne Status", {"options": DL_STATES}, dc="enum"),
        _e(f"switch.{d}_power", "on", "power", d, "Morgenbohne Strom"),
        _e(f"select.{d}_beverage", "espresso", "beverage", d, "Morgenbohne Getränk", {"options": DL_DRINKS}),
        _e(f"binary_sensor.{d}_dispensing", "off", "dispensing", d, "Morgenbohne Gibt aus", dc="running"),
        _e(f"binary_sensor.{d}_descaling", "off", "descaling", d, "Morgenbohne Entkalken nötig", dc="problem"),
        _e(f"binary_sensor.{d}_filter", "off", "filter", d, "Morgenbohne Filter wechseln", dc="problem"),
        _e(f"sensor.{d}_total_coffee", "1204", "total_coffee", d, "Morgenbohne Kaffee gesamt", {"state_class": "total_increasing"}),
        _e(f"sensor.{d}_total_coffee_with_milk", "512", "total_coffee_with_milk", d, "Morgenbohne Milchgetränke gesamt",
           {"state_class": "total_increasing"}),
    ]
    # Verlauf der Zähler: heute früh drei Kaffees weniger – „Heute 3“ im Popup.
    hist = {}
    for eid, base in ((f"sensor.{h}_coffees", 418), (f"sensor.{h}_coffee_and_milk_cups", 655), (f"sensor.{d}_total_coffee", 1204)):
        hist[eid] = {"steps": [[20, str(base - 3)], [0.4, str(base - 2)], [0.1, str(base - 1)]]}
    return {
        "devices": [
            {"key": HC, "name": "Testbarista", "manufacturer": "Bosch", "model": "Vollautomat 9", "area": None},
            {"key": DL, "name": "Morgenbohne", "manufacturer": "De'Longhi", "model": "Bluetooth", "area": None},
        ],
        "entities": ents,
        "_history": hist,
    }


# ── Bezug, Warnungen, Testdienste ────────────────────────────────────────────
def _counter(prog: str) -> tuple[str, int]:
    """Welcher Zähler des Testbarista zählt (Entität, ml für Heißwasser)."""
    k = prog.rsplit("_program_", 1)[-1]
    if any(x in k for x in ("ristretto", "espresso_doppio")) or k.endswith("_espresso"):
        return f"sensor.{HC}_ristretto_espresso_cups", 0
    if any(x in k for x in ("cappuccino", "latte", "macchiato", "flat_white")):
        return f"sensor.{HC}_coffee_and_milk_cups", 0
    if "milk_froth" in k:
        return f"sensor.{HC}_frothy_milk_cups", 0
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

    run = {HC: None, DL: None}

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
        if dev == HC:
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
        else:
            if done and job:
                bump(f"sensor.{DL}_total_coffee_with_milk" if any(x in job["prog"] for x in ("cappuccino", "latte", "flat_white"))
                     else f"sensor.{DL}_total_coffee")
            mock.set(f"binary_sensor.{DL}_dispensing", "off")
            mock.set(f"sensor.{DL}_status", "ready")

    def brew(dev: str, prog: str, dauer: float = 30.0) -> None:
        if run.get(dev):
            return
        if not hass.states.is_state(f"switch.{dev}_power", "on"):
            mock.set(f"switch.{dev}_power", "on")
        job = run[dev] = {"prog": prog, "timers": [], "t0": dt_util.utcnow()}
        steps = 10
        if dev == HC:
            mock.set(f"sensor.{HC}_operation_state", "run")
            mock.set(f"select.{HC}_active_program", prog)
            mock.set(f"sensor.{HC}_program_progress", "0")
            mock.set(f"sensor.{HC}_program_finish_time", (job["t0"] + timedelta(seconds=dauer)).isoformat())
        else:
            mock.set(f"sensor.{DL}_status", "brewing")
            mock.set(f"binary_sensor.{DL}_dispensing", "on")
        for i in range(1, steps + 1):
            @callback
            def tick(_now, i=i) -> None:
                if run.get(dev) is not job:
                    return
                if i == steps:
                    stop(dev, True)
                elif dev == HC:
                    mock.set(f"sensor.{HC}_program_progress", str(i * 100 // steps))
                elif i == 2:
                    mock.set(f"sensor.{DL}_status", "brewing")
            job["timers"].append(async_call_later(hass, dauer * i / steps, tick))

    async def beziehen(call) -> None:
        dev = call.data.get("geraet", HC)
        g = str(call.data.get("getraenk", "cappuccino"))
        dauer = float(call.data.get("dauer", 30))
        if dev == HC:
            prog = g if g.startswith(P) else next((p for p in PROGRAMS if p.endswith("_" + g)), P + "beverage_cappuccino")
            brew(HC, prog, dauer)
        else:
            brew(DL, g, dauer)

    WARN = {"wasser": "water_tank_empty", "bohnen": "bean_container_empty", "schale": "drip_tray_full", "entkalken": "device_should_be_descaled"}
    DL_WARN = {"wasser": "empty_water_tank", "bohnen": "coffee_beans_empty", "schale": "empty_drip_tray", "satz": "coffee_waste_container_full"}

    async def warnung(call) -> None:
        dev = call.data.get("geraet", HC)
        art = str(call.data.get("art", "wasser"))
        if dev == HC:
            for a, k in WARN.items():
                if art == "aus" or a == art:
                    mock.set(f"sensor.{HC}_{k}", "off" if art == "aus" else "present")
        else:
            if art == "aus":
                mock.set(f"sensor.{DL}_status", "ready")
                mock.set(f"binary_sensor.{DL}_descaling", "off")
            elif art == "entkalken":
                mock.set(f"binary_sensor.{DL}_descaling", "on")
            elif art in DL_WARN:
                mock.set(f"sensor.{DL}_status", DL_WARN[art])

    hass.services.async_register("casora_mock", "kaffee_beziehen", beziehen, vol.Schema({
        vol.Optional("getraenk"): str, vol.Optional("geraet"): vol.In([HC, DL]), vol.Optional("dauer"): vol.Coerce(float)}))
    hass.services.async_register("casora_mock", "kaffee_warnung", warnung, vol.Schema({
        vol.Required("art"): vol.In(["wasser", "bohnen", "schale", "satz", "entkalken", "aus"]), vol.Optional("geraet"): vol.In([HC, DL])}))

    # Wie Home Connect: Programm samt Optionen starten (nur, wenn die echte Integration fehlt).
    async def set_program(call) -> None:
        prog = call.data.get("program")
        if call.data.get("affects_to") == "active_program" and prog in PROGRAMS:
            brew(HC, prog)
        elif prog in PROGRAMS:
            mock.set(f"select.{HC}_selected_program", prog)

    if not hass.services.has_service("home_connect", "set_program_and_options"):
        hass.services.async_register("home_connect", "set_program_and_options", set_program)

    # Auswahl startet einen Bezug wie an der Maschine – auch dieselbe Sorte noch einmal (darum der Dienstaufruf,
    # nicht der Zustandswechsel): HC „active_program“ (nur mit Fernstart), De'Longhi BT „beverage“.
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
        if f"select.{DL}_beverage" in ids and opt in DL_DRINKS:
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
        elif eid == f"switch.{HC}_power" and new.state == "off":
            stop(HC, False)
            mock.set(f"sensor.{HC}_operation_state", "inactive")
        elif eid == f"switch.{HC}_power" and new.state == "on" and hass.states.is_state(f"sensor.{HC}_operation_state", "inactive"):
            mock.set(f"sensor.{HC}_operation_state", "ready")
        elif eid == f"switch.{DL}_power":
            if new.state == "off":
                stop(DL, False)
            mock.set(f"sensor.{DL}_status", "turned_off" if new.state == "off" else "ready")

    async_track_state_change_event(hass, [f"button.{HC}_stop_program", f"switch.{HC}_power", f"switch.{DL}_power"], changed)
