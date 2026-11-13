"""Made-up media devices and a garden camera for the media and camera popups (grouping, timeline).

- Testfernseher: a TV without grouping (its media popup stays as before).
- Four test speakers with MediaPlayerEntityFeature.GROUPING and group_members (the kitchen joined the living room;
  both play only in the demo house), so media_player.join / media_player.unjoin work in the test house (entity.py MMedia).
- Testgarten: a camera with a motion sensor, a person sensor (occupancy) and a doorbell event on the same device,
  with today's movements and one ring in the history (timeline of the general camera popup).

Names, devices and pictures are made up.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from urllib.parse import quote

TV = "testfernseher"
SPEAKERS = [("testlautsprecher_wohnzimmer", "Testlautsprecher Wohnzimmer", "Wohnzimmer", "Living Room"),
            ("testlautsprecher_kueche", "Testlautsprecher Küche", "Küche", "Kitchen"),
            ("testlautsprecher_bad", "Testlautsprecher Bad", "Badezimmer", "Bathroom"),
            ("testlautsprecher_buero", "Testlautsprecher Büro", "Büro", "Office")]
CAM = "testgarten"
# Today's events (minutes back): motion, person, ring. Earlier than midnight does not show (timeline = today).
MOTION = [9, 41, 44, 118, 192, 196, 305, 410, 520]
PERSON = [41, 192, 410]
RING = [42]

# media_player features: PAUSE 1, VOLUME_SET 4, VOLUME_MUTE 8, PREVIOUS 16, NEXT 32, TURN_ON 128, TURN_OFF 256,
# VOLUME_STEP 1024, SELECT_SOURCE 2048, STOP 4096, PLAY 16384, GROUPING 524288.
TV_FEATURES = 1 | 4 | 8 | 16 | 32 | 128 | 256 | 1024 | 2048 | 4096 | 16384
SPEAKER_FEATURES = 1 | 4 | 8 | 16 | 32 | 128 | 256 | 1024 | 4096 | 16384 | 524288


def _svg(body: str, w: int, h: int) -> str:
    return "data:image/svg+xml;utf8," + quote(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}">{body}</svg>')


# Abstract covers: no real title, logo or person.
TV_ART = _svg('<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e3b43"/>'
              '<stop offset="1" stop-color="#2d8f85"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/>'
              '<path d="M0 270 Q160 200 320 250 T640 230 V360 H0Z" fill="#0a2a30"/><circle cx="470" cy="110" r="46" fill="#f3d9a4"/>',
              640, 360)
SONG_ART = _svg('<rect width="300" height="300" fill="#5b3a8c"/><circle cx="150" cy="150" r="96" fill="#e9a65b"/>'
                '<circle cx="150" cy="150" r="40" fill="#5b3a8c"/>', 300, 300)


def _e(eid: str, state: str, dev: str, name: str, attrs: dict | None = None, area: str | None = None, **extra) -> dict:
    a = {"friendly_name": name, **(attrs or {})}
    e = {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": dev, "area": area,
         "original_name": name, "name": None, "icon": a.get("icon"), "device_class": a.get("device_class"),
         "unit": None, "hidden": False, "translation_key": None, "entity_category": None}
    e.update(extra)
    return e


def extra(now: datetime, demo: bool = False) -> dict:
    """Devices and entities; demo: the demo house's English area names."""
    room = (lambda de, en: en if demo else de)
    ents = [
        _e(f"media_player.{TV}", "playing", TV, "Testfernseher", {
            "device_class": "tv", "supported_features": TV_FEATURES, "volume_level": 0.24, "is_volume_muted": False,
            "source_list": ["Live-TV", "YouTube", "Mediathek", "HDMI 1"], "source": "Mediathek", "app_name": "Mediathek",
            "media_content_type": "video", "media_title": "Abendlicht am Fjord", "media_series_title": "Testreihe Natur",
            "media_duration": 2640, "media_position": 780, "media_position_updated_at": now.isoformat(),
            "entity_picture": TV_ART}, room("Wohnzimmer", "Living Room")),
    ]
    leader, joined = SPEAKERS[0][0], SPEAKERS[1][0]
    for key, name, de, en in SPEAKERS:
        group = [f"media_player.{leader}", f"media_player.{joined}"] if key in (leader, joined) else [f"media_player.{key}"]
        # Only the demo house plays (screenshots): in the test houses nothing new may play, since many gate tests
        # measure the home page and the Now Playing list with their own players (26.11.27 gate: 14 red).
        playing = demo and key in (leader, joined)
        a = {"device_class": "speaker", "supported_features": SPEAKER_FEATURES, "volume_level": 0.3 if playing else 0.2,
             "is_volume_muted": False, "group_members": group}
        if playing:
            a.update({"media_content_type": "music", "media_title": "Morgenlicht", "media_artist": "Testensemble",
                      "media_album_name": "Ruhige Räume", "media_duration": 214, "media_position": 61,
                      "entity_picture": SONG_ART})
        ents.append(_e(f"media_player.{key}", "playing" if playing else "idle", key, name, a, room(de, en)))
    cam_area = room("Garten", "Garden")
    ents += [
        _e(f"camera.{CAM}", "idle", CAM, "Testgarten", {"supported_features": 0}, cam_area, hof=True),
        _e(f"binary_sensor.{CAM}_bewegung", "off", CAM, "Testgarten Bewegung", {"device_class": "motion"}, cam_area),
        _e(f"binary_sensor.{CAM}_person", "off", CAM, "Testgarten Person", {"device_class": "occupancy"}, cam_area,
           translation_key="person"),
        _e(f"event.{CAM}_klingel", (now - timedelta(minutes=RING[0])).isoformat(), CAM, "Testgarten Klingel",
           {"device_class": "doorbell", "event_types": ["ring"], "event_type": "ring"}, cam_area),
    ]
    hist: dict = {}
    for eid, mins, dur in ((f"binary_sensor.{CAM}_bewegung", MOTION, 1.5), (f"binary_sensor.{CAM}_person", PERSON, 1.0)):
        steps = []
        for m in sorted(mins, reverse=True):
            steps += [[m / 60, "on"], [max((m - dur) / 60, 0.001), "off"]]
        hist[eid] = {"steps": steps}
    hist[f"event.{CAM}_klingel"] = {"steps": [[m / 60, (now - timedelta(minutes=m)).isoformat()] for m in sorted(RING, reverse=True)]}
    devices = [{"key": TV, "name": "Testfernseher", "manufacturer": "Beispiel", "model": "Android TV", "area": room("Wohnzimmer", "Living Room")}]
    devices += [{"key": k, "name": n, "manufacturer": "Beispiel", "model": "Testlautsprecher", "area": room(de, en)}
                for k, n, de, en in SPEAKERS]
    devices.append({"key": CAM, "name": "Testgarten", "manufacturer": "Beispiel", "model": "Gartenkamera", "area": cam_area})
    return {"devices": devices, "entities": ents, "_history": hist}
