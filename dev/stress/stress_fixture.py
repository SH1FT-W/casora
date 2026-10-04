#!/usr/bin/env python3
"""Stresshaus für den QA-Rundgang (dev/qa/alles.mjs): viele Räume, Szenen, Lichter, lange Namen.

    python3 dev/stress/stress_fixture.py <ziel/stress.json>

Erfunden und neutral – nichts aus dem echten Testhaus. Die Mock-Integration
(dev/casora_mock) liest stress.json nur, wenn die Datei neben fixture.json liegt;
das macht allein `dev/haus.sh stress`. In arbeit/frisch/demo gibt es sie nicht.

Enthält: 15 Räume (lange Namen, Umlaute), 36 Szenen (einige mit langen Namen, per
Bereich einem Raum zugeordnet), 30 Lichter, Schlösser, Tür-/Fensterkontakte, Kameras
(eine nicht erreichbar), Medienplayer mit langen Titeln, Geräte mit sehr langen Namen
und Entitäten ohne Gerät oder ohne Raum.
"""
import json
import re
import sys
from datetime import datetime, timedelta, timezone

AREAS = [
    "Wohnzimmer mit Galerie und Leseecke",
    "Küche & Essbereich",
    "Schlafzimmer Dachgeschoss",
    "Kinderzimmer Süd",
    "Arbeitszimmer / Gästezimmer",
    "Bad Obergeschoss mit Wanne",
    "Gäste-WC",
    "Flur & Treppenhaus",
    "Hauswirtschaftsraum",
    "Wintergarten",
    "Garage & Werkstatt",
    "Terrasse Süd",
    "Ankleidezimmer",
    "Dachboden über der Garage",
    "Keller – Vorräte & Getränke",
]

LIGHT_NAMES = [
    "Deckenleuchte", "Stehlampe", "Leselampe am Sessel", "LED-Streifen hinter dem Fernseher",
    "Pendelleuchte über dem großen Esstisch am Fenster", "Spots Decke", "Nachttischlampe links",
    "Nachttischlampe rechts", "Wandleuchte", "Unterschrankbeleuchtung Arbeitsplatte",
]

SCENES = [
    "Hell", "Gedimmt", "Aus", "Lesen", "Kochen", "Essen", "Film", "Party", "Nacht", "Morgen",
    "Gemütlicher Filmabend mit gedimmtem Licht und geschlossenen Jalousien",
    "Konzentriertes Arbeiten am Schreibtisch mit kaltweißem Licht",
    "Sonntagsfrühstück", "Hausaufgaben", "Vorlesen", "Aufräumen", "Putzen – alles hell",
    "Abendessen mit Gästen im Wintergarten", "Entspannen", "Wecklicht sanft",
    "Nachtlicht Flur", "Urlaubsmodus Anwesenheitssimulation", "Grillabend", "Spieleabend",
    "Yoga", "Meditation", "Weihnachtsbeleuchtung", "Gartenparty", "Ankommen", "Verlassen",
    "Kino", "Konzert", "Fußball schauen", "Candle-Light-Dinner", "Ruhe", "Kinder schlafen",
]

MEDIA = [
    ("Lautsprecher Wohnzimmer", "Ein außergewöhnlich langer Titel eines Hörbuchkapitels, der garantiert nicht in eine Zeile passt – Teil 17",
     "Erzählerin mit einem ebenfalls ziemlich langen Künstlernamen", "Sammelband der gesammelten Geschichten"),
    ("Fernseher Schlafzimmer", "Dokumentation: Die Geheimnisse der Tiefsee und ihrer leuchtenden Bewohner", "Wissenskanal", ""),
    ("Küchenradio", "Morgenmagazin mit Nachrichten, Wetter und Verkehr", "Regionalsender", "Live"),
]


def slug(s: str) -> str:
    s = s.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        s = s.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")[:40]


def build() -> dict:
    now = datetime.now(timezone.utc)
    areas = list(AREAS)
    devices: list[dict] = []
    ents: list[dict] = []

    def dev(key, name, area, model="Stressgerät", manufacturer="Musterfirma"):
        devices.append({"key": key, "name": name, "manufacturer": manufacturer, "model": model, "area": area,
                        "sw_version": "1.0"})
        return key

    def ent(eid, state, attrs, area=None, device=None, **kw):
        e = {"entity_id": eid, "state": state, "attributes": attrs, "area": area, "device": device,
             "platform": "casora_mock", "name": None, "original_name": attrs.get("friendly_name"),
             "device_class": attrs.get("device_class"), "unit": attrs.get("unit_of_measurement"),
             "icon": attrs.get("icon"), "entity_category": None, "hidden": False}
        e.update(kw)
        ents.append(e)

    # Lichter: 30, zwei je Raum, die ersten an.
    n = 0
    for ai, area in enumerate(areas):
        for k in range(2):
            name = LIGHT_NAMES[(ai + k) % len(LIGHT_NAMES)]
            key = dev(f"stress_light_{n}", f"{name} {area}", area, model="Leuchte")
            on = n % 3 != 2
            ent(f"light.stress_{slug(area)}_{k + 1}", "on" if on else "off", {
                "friendly_name": f"{name} ({area})", "supported_color_modes": ["brightness"],
                "color_mode": "brightness" if on else None, "brightness": 40 + (n * 13) % 215 if on else None,
                "supported_features": 0,
            }, area=area, device=key)
            n += 1

    # Szenen: 36, reihum den Räumen zugeordnet (über den Bereich), einige zuletzt aktiviert.
    for i, name in enumerate(SCENES):
        area = areas[i % len(areas)]
        ts = (now - timedelta(hours=i * 7 + 1)).isoformat() if i % 4 else "unknown"
        ent(f"scene.stress_{slug(name)}", ts, {"friendly_name": name, "icon": "mdi:palette", "id": f"stress{i}",
                                              "entity_id": [f"light.stress_{slug(area)}_1"]}, area=area)

    # Schlösser, eins klemmt, eins nicht erreichbar.
    for i, (area, st) in enumerate([(areas[7], "locked"), (areas[10], "unlocked"), (areas[11], "jammed"), (areas[8], "unavailable")]):
        key = dev(f"stress_lock_{i}", f"Türschloss {area}", area, model="Schloss")
        ent(f"lock.stress_schloss_{i + 1}", st, {"friendly_name": f"Türschloss {area}", "supported_features": 0},
            area=area, device=key)

    # Kontakte: Türen und Fenster, einige offen.
    for i, area in enumerate(areas[:10]):
        dc = "door" if i % 2 else "window"
        key = dev(f"stress_contact_{i}", f"{'Tür' if dc == 'door' else 'Fenster'}kontakt {area}", area, model="Kontakt")
        ent(f"binary_sensor.stress_kontakt_{i + 1}", "on" if i % 3 == 0 else "off",
            {"friendly_name": f"{'Tür' if dc == 'door' else 'Fenster'} {area}", "device_class": dc}, area=area, device=key)

    # Kameras: eine nicht erreichbar.
    for i, (area, st) in enumerate([(areas[7], "idle"), (areas[10], "unavailable"), (areas[11], "streaming")]):
        key = dev(f"stress_cam_{i}", f"Kamera {area}", area, model="Kamera")
        ent(f"camera.stress_kamera_{i + 1}", st, {"friendly_name": f"Kamera {area}", "supported_features": 0},
            area=area, device=key)

    # Medien: spielen mit langen Titeln.
    for i, (name, title, artist, album) in enumerate(MEDIA):
        area = areas[[0, 2, 1][i]]
        key = dev(f"stress_media_{i}", name, area, model="Lautsprecher")
        ent(f"media_player.stress_medien_{i + 1}", "playing", {
            "friendly_name": name, "device_class": "tv" if "Fernseher" in name else "speaker",
            "media_title": title, "media_artist": artist, "media_album_name": album,
            "media_content_type": "music" if i != 1 else "video", "volume_level": 0.35, "is_volume_muted": False,
            "media_duration": 3600, "media_position": 1234, "media_position_updated_at": now.isoformat(),
            "supported_features": 24509,
        }, area=area, device=key)

    # Sehr lange Namen, fehlende Geräte, kein Raum.
    ent("sensor.stress_sehr_langer_name", "21.5", {
        "friendly_name": "Temperatur- und Luftfeuchtigkeitssensor im hinteren Teil des Wohnzimmers neben dem Bücherregal",
        "device_class": "temperature", "unit_of_measurement": "°C", "state_class": "measurement"}, area=areas[0])
    ent("sensor.stress_ohne_geraet", "48", {"friendly_name": "Luftfeuchte ohne Gerät", "device_class": "humidity",
                                            "unit_of_measurement": "%"}, area=areas[5])
    ent("light.stress_ohne_raum", "on", {"friendly_name": "Lichterkette ohne Raum", "supported_color_modes": ["onoff"],
                                         "color_mode": "onoff", "supported_features": 0})
    ent("switch.stress_ohne_geraet", "off", {"friendly_name": "Steckdose, deren Gerät gelöscht wurde"},
        area=areas[3])
    for i, area in enumerate(areas[:6]):
        key = dev(f"stress_long_{i}", f"Multifunktionsgerät mit einem wirklich sehr langen Gerätenamen Nummer {i + 1}", area)
        ent(f"switch.stress_langer_name_{i + 1}", "on" if i % 2 else "off",
            {"friendly_name": f"Schaltbare Steckdose für die Dekoration im Bereich {area}"}, area=area, device=key)

    return {"version": 1, "note": "Stresshaus – erfunden, dev/stress/stress_fixture.py", "areas": areas,
            "devices": devices, "entities": ents}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    data = build()
    with open(sys.argv[1], "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"stress.json: {len(data['areas'])} Räume, {len(data['devices'])} Geräte, {len(data['entities'])} Entitäten")
