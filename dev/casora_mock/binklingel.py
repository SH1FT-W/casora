"""A made-up Reolink-style doorbell whose press is an on/off binary sensor (device class doorbell).

The Reolink mock (klingel.py) has the press as binary_sensor.testklingel_visitor without a device
class; the mock house had no binary sensor with device class doorbell at all, so the camera alert
could not be tried for that style. This device fills the gap:
  camera.testbinklingel_sub        – the camera of the device, door view as a still image (kamerabild.py)
  binary_sensor.testbinklingel_ding – the button: on while pressed, device class doorbell (a made-up
                                     combination: HA has no binary-sensor class "doorbell", the mock
                                     stores the string as it is)
Test service casora_mock.binklingel_druecken: the button on for a moment (like a real press), then
off again – the same way klingel.py rings its doorbell. No translation_key "visitor" on the button,
so the Reolink community card (24-klingel.js) does not pick this camera up as a second doorbell.
Device, names made up.
"""
from __future__ import annotations

DEV = "testbinklingel"
UID = "9527000TESTBLK"
NAME = "Testbinklingel"
CAM = f"camera.{DEV}_sub"
BELL = f"binary_sensor.{DEV}_ding"


def _e(dom, key, state, name, attrs=None, tk=None, dc=None, **more):
    a = {"friendly_name": f"{NAME} {name}", **(attrs or {})}
    if dc:
        a["device_class"] = dc
    e = {"entity_id": f"{dom}.{DEV}_{key}", "state": state, "attributes": a, "platform": "casora_mock",
         "device": DEV, "area": None, "original_name": name, "name": None, "icon": None, "device_class": dc,
         "unit": None, "hidden": False, "translation_key": tk, "entity_category": None,
         "unique_id": f"{UID}_0_{key}"}
    e.update(more)
    return e


def extra(now) -> dict:
    ents = [
        # The camera of the device, like Reolink "<device> sub" but without a stream function, so the
        # Test HA shows a still image. tuer: the door view of kamerabild.py (a placeholder picture would
        # mask the camera alert in a hand check).
        _e("camera", "sub", "idle", "Fluent", {"supported_features": 0}, tk="sub", tuer=True),
        # The doorbell press: on while pressed, device class doorbell (made up, see the module docstring).
        _e("binary_sensor", "ding", "off", "Ding", dc="doorbell"),
    ]
    return {
        "devices": [{"key": DEV, "name": NAME, "manufacturer": "Reolink",
                     "model": "Video Doorbell WiFi", "area": None}],
        "entities": ents,
    }


def setup(hass, mock) -> None:
    from homeassistant.helpers.event import async_call_later

    async def druecken(call) -> None:
        # Button pressed: on for a few seconds only, like a real press (klingel.py's visitor button).
        mock.set(BELL, "on")

        async def los(_now) -> None:
            mock.set(BELL, "off")

        async_call_later(hass, float(call.data.get("dauer", 2)), los)

    hass.services.async_register("casora_mock", "binklingel_druecken", druecken)
