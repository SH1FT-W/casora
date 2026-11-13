"""Erfundene Testgeräte für das Halten-Schnellmenü (immer dabei, außer im Demo-Haus).

Je Kachelart ein Gerät mit genau den Fähigkeiten, die das Menü (scripts/local/22-halten.js) auswertet:
Licht dimmbar mit Farbtemperatur, Klima mit Ein/Aus-Bits und Zieltemperatur, Jalousie mit Position und Stopp,
Lautsprecher mit Wiedergabe/Lautstärke/Titel, Schloss mit Öffnen, Sauger mit Start/Station/Pause, Ventilator
und Luftreiniger mit Prozent und preset „auto“, zwei Alarmanlagen (ohne Code, mit Zahlencode), ein
Bambu-artiger 3D-Drucker mit Pause-/Fortsetzen-Tasten, Bauraumlicht und Kamera, Kameras, Steckdose sowie
Messwerte für Energie, Netzwerk, Spiel und Unwetterwarnung. Mähroboter, Befeuchter und Aquarien kommen aus
maeher.py, befeuchter.py und aquarium.py. Keine Räume – den Raum „Halten-Test“ baut man im Studio.
Alle Namen erfunden. Die Dienste ändern den Zustand über die Klassen in entity.py; die Drucker-Tasten über
„_buttons“ (Druckstatus und Arbeitsschritt wie bei Bambu Lab: Pause → pause/paused_user).
Zahlencode der Alarmanlage „Testalarm Code“: 1234 (siehe entity.MAlarm).
"""
from __future__ import annotations

from datetime import datetime, timedelta


def _e(eid, state, device, name, attrs=None, dc=None, unit=None, key=None):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    return {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
            "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
            "unit": unit, "hidden": False, "translation_key": key, "entity_category": None}


def _dev(key, name, manufacturer, model, via=None):
    d = {"key": key, "name": name, "manufacturer": manufacturer, "model": model, "area": None}
    if via:
        d["via"] = via
    return d


# Medien: Pause 1, Lautstärke 4, Zurück 16, Weiter 32, An 128, Aus 256, Lautstärke-Schritt 1024, Stopp 4096, Abspielen 16384
MEDIA_FEATURES = 1 | 4 | 16 | 32 | 128 | 256 | 1024 | 4096 | 16384
# Sauger: Pause 4, Stopp 8, Station 16, Akku 64, Zustand 4096, Start 8192
VACUUM_FEATURES = 4 | 8 | 16 | 64 | 4096 | 8192
# Alarm: Zuhause 1, Abwesend 2, Nacht 4, Auslösen 8, Urlaub 32
ALARM_FEATURES = 1 | 2 | 4 | 8 | 32


def _printer_details(P: str, now: datetime) -> list:
    """The rest of a Bambu-like printer (translation_keys as ha-bambulab): what the popup's temperatures, filament,
    print and device sections read. The AMS is a sub device; humidity_index like ha-bambulab since 2024 (1 dry, 5 wet)."""
    A = f"{P}_ams"
    start = (now - timedelta(minutes=45)).isoformat()
    end = (now + timedelta(minutes=75)).isoformat()

    def tray(n, name, typ, color, remain, active=False, empty=False):
        return _e(f"sensor.{P}_ams_slot_{n}", "Leer" if empty else name, A, f"Testdrucker AMS Slot {n}",
                  {"slot": n, "active": active, "empty": empty, "name": None if empty else name, "type": "" if empty else typ,
                   "color": color, "remain": remain, "remain_enabled": remain >= 0}, key="tray")

    fan = {"percentage_step": 1.0, "preset_mode": None, "preset_modes": None, "supported_features": 49}
    return [
        _e(f"sensor.{P}_zieltemperatur_duese", "220", P, "Testdrucker Zieltemperatur Düse", dc="temperature", unit="°C",
           key="target_nozzle_temp"),
        _e(f"sensor.{P}_zieltemperatur_bett", "60", P, "Testdrucker Zieltemperatur Bett", dc="temperature", unit="°C",
           key="target_bed_temp"),
        _e(f"sensor.{P}_druckraumtemperatur", "34", P, "Testdrucker Druckraumtemperatur", dc="temperature", unit="°C",
           key="chamber_temp"),
        _e(f"fan.{P}_kuehlluefter", "on", P, "Testdrucker Kühllüfter", {"percentage": 80, **fan}, key="cooling_fan"),
        _e(f"fan.{P}_zusatzluefter", "on", P, "Testdrucker Zusatzlüfter", {"percentage": 40, **fan}, key="aux_fan"),
        _e(f"fan.{P}_druckraumluefter", "on", P, "Testdrucker Druckraumlüfter", {"percentage": 30, **fan}, key="chamber_fan"),
        _e(f"select.{P}_druckgeschwindigkeit", "standard", P, "Testdrucker Druckgeschwindigkeit",
           {"options": ["silent", "standard", "sport", "ludicrous"]}, key="printing_speed"),
        _e(f"sensor.{P}_geschwindigkeitsprofil", "standard", P, "Testdrucker Geschwindigkeitsprofil",
           {"options": ["silent", "standard", "sport", "ludicrous"], "modifier": 100}, dc="enum", key="speed_profile"),
        _e(f"sensor.{P}_startzeit", start, P, "Testdrucker Startzeit", dc="timestamp", key="start_time"),
        _e(f"sensor.{P}_endzeit", end, P, "Testdrucker Endzeit", dc="timestamp", key="end_time"),
        _e(f"sensor.{P}_druckgewicht", "76.6", P, "Testdrucker Druckgewicht", dc="weight", unit="g", key="print_weight"),
        _e(f"sensor.{P}_drucklaenge", "25.6", P, "Testdrucker Drucklänge", unit="m", key="print_length"),
        _e(f"sensor.{P}_druckbetttyp", "textured_plate", P, "Testdrucker Druckbetttyp", key="print_bed_type"),
        _e(f"sensor.{P}_druckbare_objekte", "4", P, "Testdrucker Druckbare Objekte",
           {"objects": {"11": "Würfel A", "12": "Würfel B", "13": "Würfel C", "14": "Würfel D"}}, key="printable_objects"),
        _e(f"sensor.{P}_uebersprungene_objekte", "1", P, "Testdrucker Übersprungene Objekte",
           {"objects": [13]}, key="skipped_objects"),
        _e(f"image.{P}_titelbild", now.isoformat(), P, "Testdrucker Titelbild", key="cover_image"),
        _e(f"sensor.{P}_duesendurchmesser", "0.4", P, "Testdrucker Düsendurchmesser", unit="mm", key="nozzle_diameter"),
        _e(f"sensor.{P}_duesentyp", "hardened_steel", P, "Testdrucker Düsentyp", key="nozzle_type"),
        _e(f"sensor.{P}_betriebsstunden", "512.3", P, "Testdrucker Betriebsstunden", dc="duration", unit="h",
           key="total_usage_hours"),
        _e(f"binary_sensor.{P}_online", "on", P, "Testdrucker Online", dc="connectivity", key="online"),
        _e(f"binary_sensor.{P}_hms_fehler", "off", P, "Testdrucker HMS-Fehler", {"Count": 0}, dc="problem", key="hms_errors"),
        _e(f"binary_sensor.{P}_druckfehler", "off", P, "Testdrucker Druckfehler", dc="problem", key="print_error"),
        _e(f"update.{P}_firmware", "off", P, "Testdrucker Firmware",
           {"installed_version": "1.2.3", "latest_version": "1.2.3", "auto_update": False, "in_progress": False,
            "supported_features": 5}, dc="firmware", key="firmware_update"),
        _e(f"sensor.{P}_aktiver_slot", "Testfilament PLA", P, "Testdrucker Aktiver Slot",
           {"color": "#2A9D8F", "type": "PLA", "name": "Testfilament PLA", "remain": 62, "tray_index": 1}, key="active_tray"),
        tray(1, "Testfilament PLA", "PLA", "#2A9D8FFF", 62, active=True),
        tray(2, "Testfilament PETG", "PETG", "#E9C46AFF", 12),
        tray(3, "Testfilament Weiß", "PLA", "#FFFFFFFF", -1),
        tray(4, "", "", "#00000000", -1, empty=True),
        _e(f"sensor.{P}_ams_luftfeuchtigkeit", "31", A, "Testdrucker AMS Luftfeuchtigkeit", dc="humidity", unit="%",
           key="humidity"),
        _e(f"sensor.{P}_ams_feuchteindex", "2", A, "Testdrucker AMS Feuchteindex", key="humidity_index"),
        _e(f"sensor.{P}_ams_temperatur", "27.5", A, "Testdrucker AMS Temperatur", dc="temperature", unit="°C", key="ams_temp"),
        _e(f"sensor.{P}_externe_spule", "Leer", P, "Testdrucker Externe Spule",
           {"active": False, "empty": True, "name": None, "type": "", "color": "#00000000", "remain": -1}, key="external_spool"),
    ]


def extra(now: datetime) -> dict:
    P = "testdrucker"
    pr = f"sensor.{P}_druckstatus"
    stage = f"sensor.{P}_aktueller_arbeitsschritt"
    ents = [
        # Licht: dimmbar, Farbtemperatur 2200–6500 K
        _e("light.testleuchte", "on", "testleuchte", "Testleuchte",
           {"supported_color_modes": ["color_temp", "hs"], "color_mode": "color_temp", "brightness": 128,
            "color_temp_kelvin": 3000, "min_color_temp_kelvin": 2200, "max_color_temp_kelvin": 6500,
            "supported_features": 32}),
        # Klima: Zieltemperatur 1 | Einschalten 128 | Ausschalten 256
        _e("climate.testklima", "heat", "testklima", "Testklima",
           {"hvac_modes": ["off", "heat"], "hvac_action": "heating", "temperature": 21, "current_temperature": 20.5,
            "min_temp": 5, "max_temp": 30, "target_temp_step": 0.5, "supported_features": 1 | 128 | 256}),
        # Jalousie: Auf 1 | Zu 2 | Position 4 | Stopp 8
        _e("cover.testjalousie", "open", "testjalousie", "Testjalousie",
           {"current_position": 60, "supported_features": 15}, dc="shutter"),
        _e("media_player.testlautsprecher", "playing", "testlautsprecher", "Testlautsprecher",
           {"volume_level": 0.4, "is_volume_muted": False, "media_content_type": "music",
            "media_title": "Testlied 1", "media_artist": "Testband", "media_album_name": "Testalbum",
            "media_track": 1, "supported_features": MEDIA_FEATURES}, dc="speaker"),
        # Schloss mit Öffnen (1)
        _e("lock.testschloss", "locked", "testschloss", "Testschloss", {"supported_features": 1}),
        _e("vacuum.testsauger", "docked", "testsauger", "Testsauger",
           {"battery_level": 90, "supported_features": VACUUM_FEATURES}),
        _e("sensor.testsauger_akku", "90", "testsauger", "Testsauger Akku", dc="battery", unit="%"),
        # Ventilator/Luftreiniger: Stufe 1 | preset 8 | Aus 16 | An 32
        _e("fan.testventilator", "on", "testventilator", "Testventilator",
           {"percentage": 50, "percentage_step": 1, "preset_modes": ["auto", "natur"], "preset_mode": None,
            "supported_features": 57}),
        _e("fan.testluftreiniger", "on", "testluftreiniger", "Testluftreiniger",
           {"percentage": 40, "percentage_step": 1, "preset_modes": ["auto", "sleep"], "preset_mode": "auto",
            "supported_features": 57}),
        _e("sensor.testluftreiniger_pm2_5", "7", "testluftreiniger", "Testluftreiniger PM2.5", dc="pm25", unit="µg/m³"),
        # Alarm ohne Code (wie Alarmo ohne Code) und mit Zahlencode zum Scharf- und Unscharfschalten
        _e("alarm_control_panel.testalarm", "disarmed", "testalarm", "Testalarm",
           {"code_format": None, "code_arm_required": False, "supported_features": ALARM_FEATURES}),
        _e("alarm_control_panel.testalarm_code", "disarmed", "testalarm_code", "Testalarm Code",
           {"code_format": "number", "code_arm_required": True, "supported_features": ALARM_FEATURES}),
        # 3D-Drucker (Bambu-artig, translation_keys wie die Integration): druckt gerade
        _e(pr, "running", P, "Testdrucker Druckstatus", key="print_status"),
        _e(stage, "printing", P, "Testdrucker Aktueller Arbeitsschritt", key="stage"),
        _e(f"sensor.{P}_druckfortschritt", "42", P, "Testdrucker Druckfortschritt", unit="%", key="print_progress"),
        _e(f"sensor.{P}_verbleibende_zeit", "75", P, "Testdrucker Verbleibende Zeit", dc="duration", unit="min",
           key="remaining_time"),
        _e(f"sensor.{P}_aufgabenname", "Testwürfel", P, "Testdrucker Aufgabenname", key="subtask_name"),
        _e(f"sensor.{P}_aktuelle_schicht", "120", P, "Testdrucker Aktuelle Schicht", key="current_layer"),
        _e(f"sensor.{P}_schichten_gesamt", "300", P, "Testdrucker Schichten gesamt", key="total_layers"),
        _e(f"sensor.{P}_duesentemperatur", "220", P, "Testdrucker Düsentemperatur", dc="temperature", unit="°C",
           key="nozzle_temp"),
        _e(f"sensor.{P}_betttemperatur", "60", P, "Testdrucker Betttemperatur", dc="temperature", unit="°C",
           key="bed_temp"),
        _e(f"button.{P}_pause", "unknown", P, "Testdrucker Pause", key="pause"),
        _e(f"button.{P}_fortsetzen", "unknown", P, "Testdrucker Fortsetzen", key="resume"),
        _e(f"button.{P}_stopp", "unknown", P, "Testdrucker Stopp", key="stop"),
        _e(f"light.{P}_druckraumbeleuchtung", "on", P, "Testdrucker Druckraumbeleuchtung",
           {"supported_color_modes": ["onoff"], "color_mode": "onoff", "supported_features": 0}, key="chamber_light"),
        _e(f"camera.{P}_kamera", "idle", P, "Testdrucker Kamera", {"supported_features": 0}, key="camera"),
        # Printer popup content (owner 04.11.2026): targets, chamber, fans, speed, job details, cover image, device
        # data and an AMS (own device below the printer, like ha-bambulab) with four slots.
        *_printer_details(P, now),
        # Kameras
        _e("camera.testkamera", "idle", "testkamera", "Testkamera", {"supported_features": 0}),
        _e("camera.testkamera_garten", "idle", "testkamera_garten", "Testkamera Garten", {"supported_features": 0}),
        # A robot vacuum map as a camera without a device (Map Extractor-like, only its id says map): no surveillance
        # camera, the screensaver's "Automatic" leaves it out (owner 13.11.2026). No area, so no room counts change.
        {**_e("camera.testkehrer_karte", "idle", None, "Testkehrer Karte", {"supported_features": 0}), "karte": True},
        # Steckdose mit Leistung
        _e("switch.teststeckdose", "on", "teststeckdose", "Teststeckdose", dc="outlet"),
        _e("sensor.teststeckdose_leistung", "35.2", "teststeckdose", "Teststeckdose Leistung",
           {"state_class": "measurement"}, dc="power", unit="W"),
        # Energie, Netzwerk, Spiel, Unwetterwarnung (nur Anzeige)
        _e("sensor.testzaehler_leistung", "812", "testzaehler", "Testzähler Leistung",
           {"state_class": "measurement"}, dc="power", unit="W"),
        _e("sensor.testzaehler_energie_heute", "6.4", "testzaehler", "Testzähler Energie heute",
           {"state_class": "total_increasing"}, dc="energy", unit="kWh"),
        _e("sensor.testrouter_download", "84.2", "testrouter", "Testrouter Download",
           {"state_class": "measurement"}, dc="data_rate", unit="Mbit/s"),
        _e("sensor.testrouter_upload", "12.5", "testrouter", "Testrouter Upload",
           {"state_class": "measurement"}, dc="data_rate", unit="Mbit/s"),
        _e("binary_sensor.testrouter_internet", "on", "testrouter", "Testrouter Internet", dc="connectivity"),
        _e("sensor.testspieler", "online", "testspieler", "Testspieler", {"game": "Beispielspiel"}),
        _e("binary_sensor.testwarnung", "on", "testwarnung", "Testwarnung",
           {"headline": "Sturmböen (Test)", "severity": "Moderate", "sender": "Testwetterdienst"}, dc="safety"),
    ]
    return {
        "devices": [
            _dev("testleuchte", "Testleuchte", "Beispiel", "Leuchte CT"),
            _dev("testklima", "Testklima", "Beispiel", "Thermostat"),
            _dev("testjalousie", "Testjalousie", "Beispiel", "Rollladen"),
            _dev("testlautsprecher", "Testlautsprecher", "Beispiel", "Lautsprecher"),
            _dev("testschloss", "Testschloss", "Beispiel", "Türschloss"),
            _dev("testsauger", "Testsauger", "Beispiel", "Saugroboter"),
            _dev("testventilator", "Testventilator", "Beispiel", "Ventilator"),
            _dev("testluftreiniger", "Testluftreiniger", "Beispiel", "Luftreiniger"),
            _dev("testalarm", "Testalarm", "Beispiel", "Alarmanlage"),
            _dev("testalarm_code", "Testalarm Code", "Beispiel", "Alarmanlage mit Code"),
            _dev(P, "Testdrucker", "Beispiel", "3D-Drucker"),
            _dev(f"{P}_ams", "Testdrucker AMS", "Beispiel", "AMS", via=P),
            _dev("testkamera", "Testkamera", "Beispiel", "Kamera"),
            _dev("testkamera_garten", "Testkamera Garten", "Beispiel", "Kamera"),
            _dev("teststeckdose", "Teststeckdose", "Beispiel", "Zwischenstecker"),
            _dev("testzaehler", "Testzähler", "Beispiel", "Stromzähler"),
            _dev("testrouter", "Testrouter", "Beispiel", "Router"),
            _dev("testspieler", "Testspieler", "Beispiel", "Spielkonto"),
            _dev("testwarnung", "Testwarnung", "Beispiel", "Unwetterwarnung"),
        ],
        "entities": ents,
        # Drucker-Tasten wie Bambu Lab: Pause → pause/paused_user, Fortsetzen → running/printing, Stopp → Leerlauf.
        "_buttons": {
            f"button.{P}_pause": {pr: "pause", stage: "paused_user"},
            f"button.{P}_fortsetzen": {pr: "running", stage: "printing"},
            f"button.{P}_stopp": {pr: "idle", stage: "idle"},
        },
    }
