#!/usr/bin/env python3
"""Englisches Demo-Haus für Screenshots: übersetzt Raum-, Geräte- und Entitätsnamen
der Mock-Fixture (dev/casora_mock/fixture.json, nicht im Repo) per Wörterbuch.

    python3 dev/demo/demo_fixture.py <ziel/fixture.json>

Entitäts-IDs bleiben, nur Anzeigenamen ändern sich. Wörter ohne Eintrag bleiben stehen –
für Screenshots zählen nur die sichtbaren Räume und Geräte.
"""
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("CASORA_MOCK_FIXTURE") or os.path.join(HERE, "..", "casora_mock", "fixture.json")

AREAS = {
    "Badezimmer": "Bathroom", "Briefkasten": "Mailbox", "Büro": "Office", "Flur": "Hallway",
    "Garage": "Garage", "Garten": "Garden", "Küche": "Kitchen", "Schlafzimmer": "Bedroom",
    "System": "System", "Terrasse": "Terrace", "Waschküche": "Laundry", "Wohnzimmer": "Living Room",
}

# Längere Ausdrücke zuerst (ganze Wörter, Groß-/Kleinschreibung wie im Original).
WORDS = {
    "Hängender Zwergpfeffer": "Trailing Peperomia", "Rotbart-Korbmarante": "Calathea", "Olea Europaea": "",
    "Olivenbaum": "Olive Tree", "Baumfreund": "Philodendron", "Bogenhanf": "Snake Plant", "Efeutute": "Pothos",
    "Palme": "Palm", "Yucca": "Yucca",
    "Fußbodenheizung": "Floor Heating", "Fussbodenheizung": "Floor Heating", "FBH": "Floor Heating",
    "Hauswirtschaftsraum": "Utility Room", "Wohnzimmer/Küche": "Living Room", "Schlafzimmerfenster": "Bedroom Window",
    "Terrassentür": "Patio Door", "Terrassetür": "Patio Door", "Wohnungstür": "Front Door", "Haustür": "Front Door",
    "Schildkrötenaquarium": "Turtle Tank", "Meerwasseraquarium": "Reef Tank", "Süßwasseraquarium": "Freshwater Tank",
    "Geschirrspüler": "Dishwasher", "Waschmaschine": "Washer", "Trockner": "Dryer", "Luftreiniger": "Air Purifier",
    "Präsenzmelder": "Presence Sensor", "Bewegungsmelder": "Motion Sensor", "Kontaktsensor": "Contact Sensor",
    "Lecksensor": "Leak Sensor", "Stuhlsensor": "Chair Sensor", "Kippsensor": "Tilt Sensor",
    "Wetterstation": "Weather Station", "Heizkörper": "Radiator", "Jalousien": "Blinds", "Jalousie": "Blind",
    "Beleuchtungsstärke": "Illuminance", "Luftfeuchtigkeit": "Humidity", "Temperatur": "Temperature",
    "Bodenfeuchtigkeit": "Soil Moisture", "Bodentemperatur": "Soil Temperature", "Leistung": "Power",
    "Energie": "Energy", "Batterie": "Battery", "Batteriestand": "Battery", "Akku": "Battery", "Spannung": "Voltage",
    "Stromstärke": "Current", "Steckdose": "Plug", "Lüften": "Ventilation", "Luftqualität": "Air Quality",
    "Saugroboter": "Robot Vacuum", "Karte": "Map", "Kamera": "Camera", "Schnappschüsse": "Snapshots",
    "Hochauflösung": "HD", "Fenster": "Window", "Tür": "Door", "Licht": "Light", "Lampen": "Lights",
    "Beleuchtung": "Lights", "Ambiente": "Ambience", "Gute Nacht": "Good Night", "Guten Morgen": "Good Morning",
    "Links": "Left", "Rechts": "Right", "links": "left", "rechts": "right", "Oben": "Top", "Unten": "Bottom",
    "Gefrierschrank": "Freezer", "Pumpe": "Pump", "Abschäumer": "Skimmer", "Wärmelampe": "Heat Lamp",
    "Tageslicht": "Daylight", "Einkaufsliste": "Shopping List", "Müllabfuhr": "Waste Collection",
    "Bad": "Bath", "Büro": "Office", "Küche": "Kitchen", "Schlafzimmer": "Bedroom", "Wohnzimmer": "Living Room",
    "Flur": "Hallway", "Terrasse": "Terrace", "Waschküche": "Laundry", "Badezimmer": "Bathroom", "Garten": "Garden",
    "Bioabfall": "Organic Waste", "Restabfall": "General Waste", "Papierabfall": "Paper", "Gelber Sack": "Recycling",
    "Dreamview An": "Dreamview On", "Dreamview Aus": "Dreamview Off",
    "WZ": "LR", "SZ": "BR", "HWR": "Utility",
}

_KEYS = sorted(WORDS, key=len, reverse=True)
_RE = re.compile(r"(?<![\wÄÖÜäöüß])(" + "|".join(re.escape(k) for k in _KEYS) + r")(?![\wÄÖÜäöüß])")


# Nichts Persönliches auf Screenshots: Ort, Namen, WLAN, Seriennummern. Die Liste liegt in
# dev/demo/privat.json (nicht im Repo) – sie enthält ja genau das, was verschwinden soll.
PRIVAT = os.environ.get("CASORA_DEMO_PRIVAT") or os.path.join(HERE, "privat.json")
PAIRS = json.load(open(PRIVAT, encoding="utf-8"))["ersetzen"] if os.path.exists(PRIVAT) else []
NEUTRAL = [(re.compile(r"Springfield( - Springfield)+"), "Springfield")]


def tr(text):
    if not isinstance(text, str) or not text:
        return text
    out = _RE.sub(lambda m: WORDS[m.group(1)], text)
    for a, b in PAIRS:
        out = out.replace(a, b)
    for rx, rep in NEUTRAL:
        out = rx.sub(rep, out)
    return re.sub(r"\s{2,}", " ", out).strip()


# ── Lebendige Popups für die README ─────────────────────────────────────────
# Die Lichtgruppen je Raum verweisen auf Leuchten, die es in der Mock-Fixture nicht gibt –
# das Licht-Popup wäre leer. Hier bekommen die Räume erfundene Leuchten (neue, neutrale IDs
# light.demo_<raum>_<name>), einige an, in verschiedenen Helligkeiten und Farben.
# Die Raumgruppen findet das Skript über ihren (übersetzten) Namen, nicht über IDs – IDs
# des Testhauses gehören nicht ins Repo. (Name, Helligkeit 0–255 oder None = aus, Farbe)
# Farbe: Kelvin (int) oder RGB (Liste).
ROOM_LIGHTS = {
    "Living Room": [("Ceiling Light", 178, 2900), ("Floor Lamp", 115, [255, 138, 76]),
                    ("Spots", 140, 3200), ("TV Backlight", 204, [96, 110, 255])],
    "Kitchen": [("Ceiling Spots", 255, 4000), ("Pendant", None, 2700), ("Cabinet Strip", 90, [255, 176, 82])],
    "Bedroom": [("Spots", None, 3000), ("Bedside Left", 64, 2200), ("Bedside Right", None, 2200),
                ("Bed Strip", 72, [186, 104, 255])],
    "Office": [("Spots", None, 4000), ("Desk Strip", None, [120, 200, 255]), ("Sideboard Strip", None, [255, 170, 90])],
    "Hallway": [("Spots", None, 3000)],
    "Bathroom": [("Ceiling Spot", None, 4000), ("Mirror Light", None, 4000), ("Light Strip", None, [120, 220, 255])],
    "Utility Room": [("Light Strip", None, 4000)],
}
# Raum → Bereich im Demo-Haus (für die Zuordnung der neuen Leuchten).
LIGHT_AREA = {"Utility Room": "Laundry"}

# Klima-Popup (Temperatur-Badge auf Home): Wert jetzt und Tageskurve für die Diagramme –
# der Mock schreibt die Kurven beim Start als Verlauf in den Recorder (backfill_history).
# Gefunden werden die Sensoren über ihre Art: Temperatur/Luftfeuchte als Gruppen-Sensor
# (Mittel mehrerer Räume), CO₂ über ppm, Feinstaub über device_class pm25.
CLIMATE = {
    "temperature": ("21.8", {"base": 21.6, "day": 0.8, "peak": 17, "wave": 0.2, "noise": 0.04,
                             "bumps": [[7.0, 0.5, 1.0], [19.5, 0.4, 1.2]], "digits": 1}),
    "humidity": ("47", {"base": 49, "day": -3.5, "peak": 16, "wave": 1.2, "noise": 0.4,
                        "bumps": [[7.3, 7, 0.8], [21.0, 3, 1.0]], "digits": 0, "min": 30, "max": 70}),
    "co2": (None, {"base": 620, "day": -120, "peak": 14, "wave": 40, "noise": 12,
                   "bumps": [[20.0, 180, 1.5]], "digits": 0, "min": 410}),
    "pm25": (None, {"base": 3.2, "day": 0.8, "peak": 19, "wave": 0.6, "noise": 0.3,
                    "bumps": [[18.5, 5, 0.6]], "digits": 1, "min": 0.4}),
}


# Energie-Popup: seit 1.2 sucht Casora ohne zugeordnete Verbraucher die fünf größten selbst.
# Im Demo-Haus sollen das Alltagsgeräte sein (TV, Kühlschrank, Saugroboter …), nicht die
# Aquarien des Testhauses. Gefunden wird über den übersetzten Namen, nicht über IDs.
# (Muster im Namen, neuer Name oder None, Watt)
POWER = [
    (r'^55" Neo QLED Power$', "TV Power", 96.4),
    (r"^Roborock Power$", "Robot Vacuum Power", 32.3),
    (r"^JBL BAR 1000 JBL Power power$", "Soundbar Power", 24.1),
    (r"^Air Purifier Core 300S Power$", None, 17.6),
]
# Erfundener Kühlschrank-Zwischenstecker (neutrale ID, Küche).
FRIDGE = ("sensor.demo_fridge_power", "Fridge Power", 48.2, "Kitchen")
# Aquarien-Steckdosen bleiben, ziehen aber nur wenig (sonst stehen sie oben in der Liste).
TANK_MAX_W = 4.0


def demo_power(d):
    ents = d["entities"]
    for e in ents:
        a = e.get("attributes") or {}
        if not e["entity_id"].startswith("sensor.") or a.get("unit_of_measurement") != "W":
            continue
        name = a.get("friendly_name") or ""
        for rx, new, w in POWER:
            if re.search(rx, name):
                e["state"] = str(w)
                if new:
                    a["friendly_name"] = new
                    if e.get("original_name"):
                        e["original_name"] = new
        if re.search(r"\bTank\b", name):
            try:
                if float(e["state"]) > TANK_MAX_W:
                    e["state"] = str(TANK_MAX_W)
            except (TypeError, ValueError):
                pass
    eid, name, w, area = FRIDGE
    if not any(e["entity_id"] == eid for e in ents):
        ents.append({"entity_id": eid, "state": str(w), "platform": "demo", "device": None,
                     "attributes": {"friendly_name": name, "device_class": "power", "unit_of_measurement": "W",
                                    "state_class": "measurement"},
                     "area": area if area in d["areas"] else None, "original_name": name, "name": None,
                     "icon": None, "device_class": "power", "unit": "W", "hidden": False, "entity_category": None})


def _slug(t):
    return re.sub(r"[^a-z0-9]+", "_", t.lower()).strip("_")


def _climate_kind(e):
    a = e.get("attributes") or {}
    if not e["entity_id"].startswith("sensor."):
        return None
    dc = a.get("device_class") or e.get("device_class")
    group = isinstance(a.get("entity_id"), list) and len(a["entity_id"]) > 2
    if dc in ("temperature", "humidity") and group:
        return dc
    if a.get("unit_of_measurement") == "ppm" and a.get("friendly_name") == "CO2":
        return "co2"
    if dc == "pm25":
        return "pm25"
    return None


def _kelvin_rgb(k):
    # Näherung (Tanner Helland), reicht für Farbpunkte im Popup.
    t = k / 100
    r = 255 if t <= 66 else 329.7 * (t - 60) ** -0.1332
    g = 99.47 * math.log(t) - 161.1 if t <= 66 else 288.1 * (t - 60) ** -0.0755
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5 * math.log(t - 10) - 305.0)
    return [int(max(0, min(255, v))) for v in (r, g, b)]


def _light_attrs(name, bri, color):
    import colorsys
    on = bri is not None
    a = {"friendly_name": name, "supported_color_modes": ["color_temp", "rgb"] if isinstance(color, list) else ["color_temp"],
         "min_color_temp_kelvin": 2200, "max_color_temp_kelvin": 6500, "supported_features": 0,
         "brightness": bri, "color_mode": None, "color_temp_kelvin": None, "rgb_color": None, "hs_color": None}
    if on:
        rgb = color if isinstance(color, list) else _kelvin_rgb(color)
        h, s, _ = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
        a.update(color_mode="rgb" if isinstance(color, list) else "color_temp", rgb_color=rgb,
                 hs_color=[round(h * 360, 1), round(s * 100, 1)],
                 color_temp_kelvin=None if isinstance(color, list) else color)
    return a


def enliven(d):
    ents = {e["entity_id"]: e for e in d["entities"]}
    areas = set(d["areas"])
    lights = [e for e in d["entities"] if e["entity_id"].startswith("light.")]
    groups = {(e.get("attributes") or {}).get("friendly_name"): e for e in lights
              if isinstance((e.get("attributes") or {}).get("entity_id"), list)}
    any_on, changed = [], set()
    for room, members in ROOM_LIGHTS.items():
        g = groups.get(room)
        if not g:
            continue
        area = LIGHT_AREA.get(room, room)
        ids, on = [], []
        for name, bri, color in members:
            eid = "light.demo_" + _slug(room) + "_" + _slug(name)
            ids.append(eid)
            a = _light_attrs(name, bri, color)
            e = ents.get(eid)
            if e is None:
                e = {"entity_id": eid, "platform": "demo", "device": None, "original_name": name, "name": None,
                     "icon": None, "device_class": None, "unit": None, "hidden": False, "entity_category": None}
                d["entities"].append(e)
                ents[eid] = e
            e.update(state="on" if bri is not None else "off", attributes=a,
                     area=area if area in areas else None)
            if bri is not None:
                on.append(a)
        ga = g["attributes"]
        ga["entity_id"] = ids
        g["state"] = "on" if on else "off"
        changed.add(g["entity_id"])
        if on:
            ga.update(brightness=round(sum(x["brightness"] for x in on) / len(on)), color_mode=on[0]["color_mode"],
                      rgb_color=on[0]["rgb_color"], hs_color=on[0]["hs_color"], color_temp_kelvin=on[0]["color_temp_kelvin"])
            any_on.extend(on)
        else:
            ga.update(brightness=None, color_mode=None, rgb_color=None, hs_color=None, color_temp_kelvin=None)
    # Gruppe aller Räume (enthält die Raumgruppen): Zustand nachziehen.
    for top in groups.values():
        if set(top["attributes"]["entity_id"]) & changed and top["entity_id"] not in changed:
            top["state"] = "on" if any_on else "off"
            if any_on:
                top["attributes"]["brightness"] = round(sum(x["brightness"] for x in any_on) / len(any_on))
    hist = {}
    for e in d["entities"]:
        kind = _climate_kind(e)
        if kind:
            now, curve = CLIMATE[kind]
            if now is not None:
                e["state"] = now
            hist[e["entity_id"]] = curve
    d["_history"] = hist


def main():
    dst = sys.argv[1]
    d = json.load(open(SRC, encoding="utf-8"))
    d["areas"] = [AREAS.get(a, a) for a in d["areas"]]
    for x in d["devices"]:
        x["name"] = tr(x.get("name"))
        if x.get("area"):
            x["area"] = AREAS.get(x["area"], x["area"])
    for e in d["entities"]:
        if e.get("area"):
            e["area"] = AREAS.get(e["area"], e["area"])
        for k in ("original_name", "name"):
            e[k] = tr(e.get(k))
        a = e.get("attributes") or {}
        if "friendly_name" in a:
            a["friendly_name"] = tr(a["friendly_name"])
    enliven(d)
    demo_power(d)
    # Merker für den Mock: im Demo-Haus keine deutschen Testgeräte (Waschmaschinen A/B, Testbecken).
    d["_demo"] = True
    text = json.dumps(d, ensure_ascii=False)
    # Auch in IDs und Attributen – überall gleich, damit Verweise stimmen.
    # Namen sind oben schon ersetzt; hier geht es um IDs und Attribute. Kleingeschriebene
    # Wörter (mein_wlan_iot) stehen meist in Entitäts-IDs → ID-taugliche Ersetzung (home_iot).
    for a, b in PAIRS:
        if re.fullmatch(r"[a-z0-9_]+", a):
            b = re.sub(r"[^a-z0-9]+", "_", b.lower()).strip("_")
        text = text.replace(a, b)
    # Fahrgestellnummern (17 Zeichen, ohne I/O/Q) – z. B. in Dateinamen von Auto-Integrationen.
    text = re.sub(r"(?<![A-Za-z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Za-z0-9])", "WVWZZZ00000000000", text)
    if not PAIRS:
        print("Achtung: dev/demo/privat.json fehlt – persönliche Wörter bleiben stehen!", file=sys.stderr)
    open(dst, "w", encoding="utf-8").write(text)
    print("geschrieben:", dst, len(d["entities"]), "Entitäten")


if __name__ == "__main__":
    main()
