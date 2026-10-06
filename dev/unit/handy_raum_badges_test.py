"""Raum-Badges am Handy vom Desktop-Raum (phone_badges.py) – ohne HA, ohne pytest.

  python3 dev/unit/handy_raum_badges_test.py

Das Handy fragt zur Laufzeit (WS casora/phone_room_badges) die Badge-Variablen der Desktop-Räume
ab, je Filter-Schlüssel der Raumseite. Geprüft: Zuordnung wie linkPair im Studio (Übersicht ↔
Favoriten, Name, Pfad nach Umbenennen, gemeinsame Kacheln), Schlüssel wie phoneRoomKeys
(filter_category übernommener Hemma-Overlays), nur Badge-Variablen, Desktop-URL des Paars.
"""

from __future__ import annotations

import importlib.util
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
spec = importlib.util.spec_from_file_location(
    "phone_badges", os.path.join(ROOT, "custom_components/casora/phone_badges.py"))
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)

FAILS: list[str] = []


def check(ok: bool, msg: str) -> None:
    if not ok:
        FAILS.append(msg)
        print("  FEHLER:", msg)


def view(path, name, variables, tiles):
    return {"path": path, "cards": [
        {"type": "custom:button-card", "template": "casora_room", "name": name, "variables": variables},
        {"type": "vertical-stack", "cards": []},
        {"type": "custom:casora-smart-row", "cards": tiles},
    ]}


LIGHT = {"type": "custom:button-card", "template": "casora_light", "entity": "light.beispiel_buero"}
desktop = {"views": [
    view("home", "Home", {"show_scenes": True, "temp_sensor_1": "sensor.beispiel_aussen"}, []),
    view("kueche", "Küche", {
        "temp_sensor_1": "sensor.beispiel_kueche_temp", "security_entity_2": "binary_sensor.beispiel_fenster",
        "energy_power_entity": "sensor.beispiel_kueche_leistung", "show_security_inline": True,
        "notify_doors": True, "image": "/x.webp", "scene_order": ["scene.a"], "media_player_2": None,
    }, []),
    # umbenannt: Pfad noch vom alten Namen, Handy-Abschnitt heißt noch „Wohnen“
    view("wohnen", "Wohnzimmer", {"light_group_entity": "light.beispiel_wohnen"}, []),
    # Name und Pfad passen nicht – gemeinsame Kachel
    view("arbeit", "Büro", {"presence_entity_1": "person.beispiel"}, [LIGHT]),
    view("bad", "Bad", {"humidity_sensor": "sensor.beispiel_bad"}, []),
]}


def header(name, **v):
    c = {"type": "custom:button-card", "template": "casora_mobile_header", "name": name}
    if v:
        c["variables"] = v
    return c


def row(*tiles):
    return {"type": "custom:casora-smart-row", "cards": list(tiles)}


mobile = {"views": [{"path": "home", "cards": [
    {"type": "custom:button-card", "template": "casora_mobile_bg"},
    {"type": "custom:casora-smart-row", "cards": [
        {"type": "custom:button-card", "template": "casora_mobile_sensor_chips"},
        {"type": "custom:casora-filter-overlay", "room": "Küche", "filter_category": "room_kueche"},
        {"type": "custom:casora-filter-overlay", "room": "Wohnen"},
        {"type": "custom:casora-filter-overlay", "room": "Arbeitszimmer"},
        {"type": "custom:casora-filter-overlay", "room": "Scenes"},
        header("Favoriten"), row(),
        header("Küche"), row(),
        header("Wohnen"), row(),
        header("Arbeitszimmer"), row(dict(LIGHT)),
    ]},
]}]}

print("Zuordnung und Schlüssel")
got = pb.room_badges(desktop, mobile)
check(set(got) == {"room_kueche", "room_wohnen", "room_arbeitszimmer"}, f"Schlüssel: {sorted(got)}")
k = got.get("room_kueche", {})
check(k.get("name") == "Küche" and k.get("path") == "kueche", f"Küche: {k}")
check(k.get("vars", {}).get("security_entity_2") == "binary_sensor.beispiel_fenster", "Kontakt der Küche")
check(k.get("vars", {}).get("energy_power_entity") == "sensor.beispiel_kueche_leistung", "Energie der Küche")
check(k.get("vars", {}).get("show_security_inline") is True, "Einzel-Anzeige kommt mit")
for drop in ("notify_doors", "image", "scene_order", "media_player_2"):
    check(drop not in k.get("vars", {}), f"{drop} gehört nicht zur Badge-Reihe")
check(got.get("room_wohnen", {}).get("name") == "Wohnzimmer", "umbenannter Raum über den Pfad")
check(got.get("room_arbeitszimmer", {}).get("vars", {}).get("presence_entity_1") == "person.beispiel",
      "über gemeinsame Kachel zugeordnet")
check("room_bad" not in got, "Raum ohne Handy-Abschnitt fehlt")
check(not any(v.get("name") == "Home" for v in got.values()), "Übersicht ist keine Raumseite")

print("Grenzfälle")
check(pb.desktop_url_of("qa-haus-mobile") == "qa-haus", "Desktop-URL")
check(pb.desktop_url_of("dashboard-beispiel_mobile") == "dashboard-beispiel", "Desktop-URL mit _mobile")
check(pb.room_badges({"views": []}, mobile) == {}, "ohne Desktop-Räume leer")
check(pb.room_badges(desktop, {"views": []}) == {}, "ohne Handy-Layout leer")
check(pb.room_key_of(" Wohn Zimmer ") == "room_wohnzimmer", "roomKeyOf")
check(pb.slug("Büro & Küche") == "buero-kueche", "slug")
check(pb.is_mobile(mobile) and not pb.is_mobile(desktop), "is_mobile")

if FAILS:
    print(f"handy_raum_badges_test: {len(FAILS)} Fehler")
    sys.exit(1)
print("handy_raum_badges_test: ok")
