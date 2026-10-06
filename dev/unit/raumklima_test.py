"""Lüften + Solar-Tipp (raumklima.py) ohne laufendes HA.

  uv run --python 3.14 --with homeassistant python dev/unit/raumklima_test.py

Prüft evaluate_rooms (CO₂/Feuchte/VOC-Schwellen, Außenluft trockener/feuchter, PM2.5 draußen,
Fenster offen: lüftet/schließen nach Außentemperatur, Hinweisliste) und den Solar-Tipp
(solar_free in beiden Quellen-Arten inkl. kW, Schwellen ≥1200 W bzw. Akku ≥90 % + ≥500 W).
"""

from __future__ import annotations

import os
import sys
from datetime import timedelta
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.util import dt as dt_util  # noqa: E402

from custom_components.casora import raumklima as R  # noqa: E402

fails = 0


def check(label, ok, info=None):
    global fails
    print(("  ok     " if ok else "  FEHLER ") + label + ("" if ok or info is None else f" – {info}"))
    if not ok:
        fails += 1


class States:
    def __init__(self):
        self.d = {}

    def set(self, eid, state, minutes_ago=0, **attrs):
        self.d[eid] = SimpleNamespace(entity_id=eid, state=str(state), attributes=attrs,
                                      last_changed=dt_util.utcnow() - timedelta(minutes=minutes_ago))

    def get(self, eid):
        return self.d.get(eid)


def hass_with(**vals):
    st = States()
    for k, v in vals.items():
        st.set(k.replace("__", "."), v)
    return SimpleNamespace(states=st)


def room(k="bad", w=(), heat=()):
    return {"k": k, "n": k.title(), "rh": [f"sensor.{k}_rh"], "t": [f"sensor.{k}_t"], "co2": [f"sensor.{k}_co2"],
            "voc": [f"sensor.{k}_voc"], "w": list(w), "heat": list(heat)}


def one(h, r=None, out=("sensor.out_t", "sensor.out_rh", "sensor.out_pm")):
    aussen, rooms, alerts = R.evaluate_rooms(h, [r or room()], *out)
    return rooms[0], alerts, aussen


# CO₂
h = hass_with(sensor__bad_co2=1500, sensor__bad_t=21, sensor__bad_rh=45, sensor__out_t=10, sensor__out_rh=80)
r, alerts, _ = one(h)
check("CO₂ 1500 → jetzt", r["status"] == "jetzt" and "CO₂ 1500 ppm" in r["grund"], r)
check("jetzt steht in den Hinweisen", alerts == ["bad|jetzt"], alerts)
h.states.set("sensor.bad_co2", 1100)
check("CO₂ 1100 → bald", one(h)[0]["status"] == "bald")
h.states.set("sensor.bad_co2", 600)
check("alles gut → ok", one(h)[0]["status"] == "ok")
h.states.set("sensor.bad_co2", 2600)
r, alerts, _ = one(h)
check("CO₂ ≥ 2500 kritisch", r["co2_krit"] and "bad|co2krit" in alerts, alerts)

# Feuchte: nur „jetzt“, wenn draußen absolut trockener; sonst „feucht“
h = hass_with(sensor__bad_rh=70, sensor__bad_t=22, sensor__out_t=5, sensor__out_rh=80)
check("Feuchte 70 % und draußen trockener → jetzt", one(h)[0]["status"] == "jetzt")
h = hass_with(sensor__bad_rh=70, sensor__bad_t=18, sensor__out_t=28, sensor__out_rh=90)
r = one(h)[0]
check("Feuchte 70 %, draußen feuchter → feucht", r["status"] == "feucht" and "draußen feuchter" in r["grund"], r)
h = hass_with(sensor__bad_rh=62, sensor__bad_t=18, sensor__out_t=28, sensor__out_rh=90)
check("Feuchte 62 %, draußen feuchter → ok", one(h)[0]["status"] == "ok")
h = hass_with(sensor__bad_voc=700, sensor__bad_t=21, sensor__out_t=10)
check("VOC 700 → bald", one(h)[0]["status"] == "bald")

# Außenluft belastet
h = hass_with(sensor__bad_co2=1500, sensor__out_t=10, sensor__out_pm=40)
r = one(h)[0]
check("PM2.5 40 draußen → draussen statt jetzt", r["status"] == "draussen" and "PM2.5 40" in r["grund"], r)
h.states.set("sensor.out_pm", 10)
check("PM2.5 10 → jetzt", one(h)[0]["status"] == "jetzt")

# Fenster
h = hass_with(sensor__bad_co2=1500, sensor__out_t=8)
h.states.set("binary_sensor.bad_fenster", "on", minutes_ago=3)
r = one(h, room(w=["binary_sensor.bad_fenster"]))[0]
check("Fenster seit 3 Min. offen, 8 °C → lueftet (Ziel 10 Min.)", r["status"] == "lueftet" and r["ziel_min"] == 10 and "noch 7 Min." in r["grund"], r)
h.states.set("binary_sensor.bad_fenster", "on", minutes_ago=12)
r, alerts, _ = one(h, room(w=["binary_sensor.bad_fenster"]))
check("nach 12 Min. bei 8 °C → schliessen", r["status"] == "schliessen" and alerts == ["bad|schliessen"], r)
h.states.set("sensor.out_t", 16)
h.states.set("binary_sensor.bad_fenster", "on", minutes_ago=25)
r = one(h, room(w=["binary_sensor.bad_fenster"]))[0]
check("16 °C draußen, nicht geheizt → bleibt lueftet", r["status"] == "lueftet", r)
h.states.set("climate.bad", "heat", hvac_action="heating")
r = one(h, room(w=["binary_sensor.bad_fenster"], heat=["climate.bad"]))[0]
check("16 °C, aber Heizung läuft → schliessen", r["status"] == "schliessen" and r["heizt"], r)
h.states.set("binary_sensor.bad_fenster", "off")
r = one(h, room(w=["binary_sensor.bad_fenster"]))[0]
check("Fenster zu → fenster False", r["fenster"] is False and r["status"] == "jetzt", r)
check("ohne Kontakt → fenster None", one(h)[0]["fenster"] is None)
h.states.set("sensor.bad_co2", "unavailable")
check("Sensor unavailable zählt nicht", one(h)[0]["status"] == "ok")

# Solar
h = hass_with(sensor__pv=1.5, sensor__home=200, sensor__soc=50)
h.states.set("sensor.pv", 1.5, unit_of_measurement="kW")
src = {"mode": "device", "pv": ["sensor.pv"], "home": "sensor.home", "soc": "sensor.soc"}
check("Solar in kW → W, minus Hausbedarf", R.solar_free(h, src) == (1300.0, 50.0), R.solar_free(h, src))
h.states.set("sensor.home", "unknown")
check("Hausbedarf fehlt → None", R.solar_free(h, src)[0] is None)
h = hass_with(sensor__grid=-800, sensor__bat=-300)
src_e = {"mode": "energy", "grid": ["sensor.grid"], "battery": ["sensor.bat"], "soc": None}
check("Energie-Einstellungen: Einspeisung + Laden = übrig", R.solar_free(h, src_e) == (1100.0, None), R.solar_free(h, src_e))


def tip(free_pv, home, soc):
    h = hass_with(sensor__pv=free_pv, sensor__home=home, sensor__soc=soc)
    rk = R.Raumklima(h, SimpleNamespace(options={}))
    rk.solar_enabled, rk.solar = True, {"mode": "device", "pv": ["sensor.pv"], "home": "sensor.home", "soc": "sensor.soc"}
    rk.compute()
    return rk.solar_state


check("1250 W übrig → Tipp", tip(1500, 250, 20)["raw"])
check("1150 W übrig, Akku 50 % → kein Tipp", not tip(1400, 250, 50)["raw"])
s = tip(800, 250, 92)
check("550 W übrig, Akku 92 % → Tipp", s["raw"] and s["frei_w"] == 550 and s["akku"] == 92, s)
check("450 W übrig, Akku 95 % → kein Tipp", not tip(700, 250, 95)["raw"])
check("Überschuss negativ → frei_w 0", tip(100, 500, 95)["frei_w"] == 0)

print("FEHLER:", fails) if fails else print("alle ok")
sys.exit(1 if fails else 0)
