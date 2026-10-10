"""Englisches Demo-Haus ohne deutsche Mock-Werte.

    python3 dev/unit/demo_englisch_test.py

Personas 10.10.2026 (per-21): im englischen Demo standen „Beispiel-Titel“/„Beispiel-Künstler“ im Player
und Entitäten wie „Wärmeanforderung“, „Heizpause“, „Belegung“, „Identifizieren“, „Nachhaltiges Ventilation“.
Prüft dev/demo/demo_fixture.py an einer kleinen erfundenen Fixture (die echte liegt nicht im Repo).
"""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def ent(eid, name, state="on", **attrs):
    return {"entity_id": eid, "state": state, "attributes": dict(friendly_name=name, **attrs), "platform": "demo",
            "device": None, "area": None, "original_name": name, "name": None}


fix = {"version": 1, "areas": ["Badezimmer"], "devices": [], "entities": [
    ent("media_player.qa_player", "QA Player", "playing", media_title="Beispiel-Titel", media_artist="Beispiel-Künstler",
        media_album_name="Beispiel-Album", app_name="Beispiel"),
    ent("sensor.qa_ki", "QA KI", "Beispieltext", fazit="Beispieltext für den Test. Hier stünde die KI-Auswertung.",
        zutaten=["1 Knoblauchzehe", "200 g Rundkornreis"]),
    ent("binary_sensor.qa_w", "Badezimmer Wärmeanforderung"),
    ent("switch.qa_p", "Badezimmer Heizpause"),
    ent("switch.qa_l", "Badezimmer Nachhaltiges Lüften"),
    ent("binary_sensor.qa_b", "Präsenzmelder Bad Belegung"),
    ent("button.qa_i", "Kontaktsensor Haustür Identifizieren (1)"),
]}

with tempfile.TemporaryDirectory() as tmp:
    src, dst = os.path.join(tmp, "in.json"), os.path.join(tmp, "out.json")
    json.dump(fix, open(src, "w", encoding="utf-8"), ensure_ascii=False)
    env = dict(os.environ, CASORA_MOCK_FIXTURE=src, CASORA_DEMO_PRIVAT=os.path.join(tmp, "fehlt.json"))
    subprocess.run([sys.executable, os.path.join(ROOT, "dev/demo/demo_fixture.py"), dst], check=True, env=env,
                   cwd=tmp, capture_output=True)
    out = json.load(open(dst, encoding="utf-8"))

by = {e["entity_id"]: e for e in out["entities"]}
a = by["media_player.qa_player"]["attributes"]
assert (a["media_title"], a["media_artist"], a["media_album_name"], a["app_name"]) == (
    "Sample Track", "Sample Artist", "Sample Album", "Sample"), a
k = by["sensor.qa_ki"]
assert k["state"] == "Sample text" and k["attributes"]["fazit"].startswith("Sample text"), k
assert k["attributes"]["zutaten"] == ["1 garlic clove", "200 g short-grain rice"], k
names = {e["entity_id"]: e["attributes"]["friendly_name"] for e in out["entities"]}
assert names["binary_sensor.qa_w"] == "Bathroom Heat Demand", names
assert names["switch.qa_p"] == "Bathroom Heating Pause", names
assert names["switch.qa_l"] == "Bathroom Eco Ventilation", names
assert names["binary_sensor.qa_b"] == "Presence Sensor Bath Occupancy", names
assert names["button.qa_i"] == "Contact Sensor Front Door Identify (1)", names
text = json.dumps(out, ensure_ascii=False)
for w in ("Beispiel", "Wärmeanforderung", "Heizpause", "Belegung", "Identifizieren", "Nachhaltig", "Knoblauch"):
    assert w not in text, w
print("demo_englisch: ok")
