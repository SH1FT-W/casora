"""Eine erfundene Reolink-Türklingel für das Testhaus (Community-Karte „Reolink-Türklingel“, immer dabei).

Nachgebaut wie die Reolink-Integration sie anlegt: alles am Gerät der Klingel, Schlüssel über translation_key
(Casora sucht nur darüber, nie über die Entity-ID), unique_id wie Reolink „<uid>_<kanal>_<key>“:
  camera <gerät>_sub (Fluent; hier ohne Stream-Funktion, damit das Live-Bild im Test-HA als Standbild kommt)
  binary_sensor visitor (Klingeldruck, nur Sekunden an, ohne device_class) · motion (ohne translation_key)
    · person / vehicle / pet / package (device_class motion)
  select play_quick_reply_message (Optionen = aufgenommene Nachrichten, Auswahl spielt ab) ·
    auto_quick_reply_message · doorbell_led · number volume / volume_speak / volume_doorbell / auto_quick_reply_time
  switch doorbell_button_sound / record_audio / privacy_mode (Kamera dann nicht verfügbar) / ir_lights
  siren siren · sensor wifi_signal (dBm) / day_night_state
Dazu der Testdienst casora_mock.klingel_druecken: Klingelknopf kurz an (wie echt nur Sekunden), dazu eine
Person vor der Tür – beides landet im Verlauf. Einige Klingeldrücke und Erkennungen der letzten Tage stehen
schon im Verlauf. Gerät, Namen und Nachrichten erfunden.
"""
from __future__ import annotations

DEV = "testklingel"
UID = "9527000TESTKL"
NAME = "Testklingel"
CAM = f"camera.{DEV}_sub"
REPLIES = ["Bin gleich da", "Bitte vor die Tür legen", "Gerade nicht zu Hause"]
# Verlauf: (Minuten zurück, Art) – Klingeln mit Person davor, ein Paket, eine Katze.
PAST = [(38, "visitor"), (39, "person"), (190, "visitor"), (192, "person"), (600, "person"),
        (1490, "package"), (1500, "visitor"), (1502, "person"), (2210, "pet"), (2900, "visitor"), (2901, "person")]


def _e(dom, key, state, name, attrs=None, tk=None, dc=None, unit=None, cat=None, **extra):
    a = {"friendly_name": f"{NAME} {name}", **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    e = {"entity_id": f"{dom}.{DEV}_{key}", "state": state, "attributes": a, "platform": "casora_mock", "device": DEV,
         "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc, "unit": unit,
         "hidden": False, "translation_key": tk, "entity_category": cat, "unique_id": f"{UID}_0_{key}"}
    e.update(extra)
    return e


def extra(now) -> dict:
    vol = {"min": 0, "max": 100, "step": 1, "mode": "slider"}
    ents = [
        _e("camera", "sub", "idle", "Fluent", {"supported_features": 0}, tk="sub", klingel=True),
        _e("binary_sensor", "visitor", "off", "Visitor", tk="visitor"),
        _e("binary_sensor", "motion", "off", "Motion", dc="motion"),
        _e("binary_sensor", "person", "off", "Person", tk="person", dc="motion"),
        _e("binary_sensor", "vehicle", "off", "Vehicle", tk="vehicle", dc="motion"),
        _e("binary_sensor", "pet", "off", "Pet", tk="pet", dc="motion"),
        _e("binary_sensor", "package", "off", "Package", tk="package", dc="motion"),
        _e("select", "play_quick_reply_message", "unknown", "Play quick reply message", {"options": REPLIES},
           tk="play_quick_reply_message"),
        _e("select", "auto_quick_reply_message", "off", "Auto quick reply message", {"options": ["off"] + REPLIES},
           tk="auto_quick_reply_message", cat="config"),
        _e("number", "auto_quick_reply_time", "15", "Auto quick reply time", {"min": 1, "max": 60, "step": 1},
           tk="auto_quick_reply_time", unit="s", cat="config"),
        _e("number", "volume", "80", "Volume", vol, tk="volume", cat="config"),
        _e("number", "volume_speak", "70", "Speak volume", vol, tk="volume_speak", cat="config"),
        _e("number", "volume_doorbell", "60", "Doorbell volume", vol, tk="volume_doorbell", cat="config"),
        _e("switch", "doorbell_button_sound", "on", "Doorbell button sound", tk="doorbell_button_sound", cat="config"),
        _e("switch", "record_audio", "on", "Record audio", tk="record_audio", cat="config"),
        _e("switch", "privacy_mode", "off", "Privacy mode", tk="privacy_mode", cat="config"),
        _e("switch", "ir_lights", "on", "Infrared lights in night mode", tk="ir_lights", cat="config"),
        # Wie Reolink: Auswahl Tag/Nacht-Modus neben Schalter ir_lights und Sensor day_night_state (#23).
        _e("select", "day_night", "auto", "Day night mode", {"options": ["auto", "color", "blackwhite"]},
           tk="day_night", cat="config"),
        _e("select", "status_led", "auto", "Doorbell LED", {"options": ["stayoff", "auto", "alwaysonatnight"]},
           tk="doorbell_led", cat="config"),
        _e("siren", "siren", "off", "Siren", {"supported_features": 27}, tk="siren"),
        _e("sensor", "wifi_signal", "-58", "Wi-Fi signal", {"state_class": "measurement"}, tk="wifi_signal",
           dc="signal_strength", unit="dBm", cat="diagnostic"),
        _e("sensor", "day_night_state", "day", "Day night state", {"options": ["day", "night", "led_day"]},
           tk="day_night_state", dc="enum", cat="diagnostic"),
    ]
    # Verlauf: an zum Zeitpunkt, nach wenigen Sekunden (Klingel) bzw. einer halben Minute (Erkennung) wieder aus.
    hist: dict = {}
    for m, kind in sorted(PAST, key=lambda x: -x[0]):
        steps = hist.setdefault(f"binary_sensor.{DEV}_{kind}", {"steps": []})["steps"]
        dur = 3 if kind == "visitor" else 30
        steps += [[m / 60, "on"], [max(m / 60 - dur / 3600, 0.001), "off"]]
    return {
        "devices": [{"key": DEV, "name": NAME, "manufacturer": "Reolink", "model": "Video Doorbell WiFi", "area": None}],
        "entities": ents,
        "_history": hist,
    }


# ── Bild: fertige Zeichnung je Stimmung (Tag/Dämmerung/Nacht, kamerabild.py) ─────────
def picture(st: str, person: bool, stamp: str, w: int = 1280, h: int = 960) -> bytes | None:
    """Weitwinkel der Klingel vor die Tür: Stufen, Weg, Gartentor, Briefkasten, Paket; mit Person, solange sie
    erkannt wird."""
    from .kamerabild import bild
    return bild(st, "tuer", "tuer_person" if person else "tuer", w, h, stamp)


def setup(hass, mock) -> None:
    from homeassistant.core import callback
    from homeassistant.helpers.event import async_call_later, async_track_state_change_event

    async def druecken(call) -> None:
        # Klingelknopf wie echt nur Sekunden an; Person und Bewegung etwas länger.
        mock.set(f"binary_sensor.{DEV}_person", "on")
        mock.set(f"binary_sensor.{DEV}_motion", "on")
        mock.set(f"binary_sensor.{DEV}_visitor", "on")

        async def los(_now) -> None:
            mock.set(f"binary_sensor.{DEV}_visitor", "off")

        async def weg(_now) -> None:
            mock.set(f"binary_sensor.{DEV}_person", "off")
            mock.set(f"binary_sensor.{DEV}_motion", "off")

        async_call_later(hass, float(call.data.get("dauer", 2)), los)
        async_call_later(hass, float(call.data.get("person", 25)), weg)

    hass.services.async_register("casora_mock", "klingel_druecken", druecken)

    # Privatsphäre an → Kamera nicht verfügbar (wie Reolink); Sirene endet nach ihrer Dauer.
    @callback
    def privat(event) -> None:
        st = event.data.get("new_state")
        if st is not None and st.state in ("on", "off"):
            mock.set(CAM, "unavailable" if st.state == "on" else "idle")

    async_track_state_change_event(hass, [f"switch.{DEV}_privacy_mode"], privat)

    @callback
    def sirene(event) -> None:
        st = event.data.get("new_state")
        if st is None or st.state != "on":
            return

        async def aus(_now) -> None:
            mock.set(f"siren.{DEV}_siren", "off")

        async_call_later(hass, 10, aus)

    async_track_state_change_event(hass, [f"siren.{DEV}_siren"], sirene)
