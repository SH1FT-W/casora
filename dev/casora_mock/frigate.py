"""Eine erfundene Frigate-Kamera für das Testhaus (Community-Karte „Frigate“, immer dabei).

Nachgebaut wie die Frigate-Integration (blakeblackshear/frigate-hass-integration 5.x) sie anlegt – ohne
translation_key, Namen englisch, alles am Gerät der Kamera:
  camera.<cam> (Attribute camera_name, client_id, device_class „camera“; Zustand recording/streaming;
    hier ohne Stream-Funktion, damit das Live-Bild im Test-HA als MJPEG-Standbild kommt)
  binary_sensor.<cam>_<objekt>_occupancy · sensor.<cam>_<objekt>_count / _active_count (Einheit „objects“)
  image.<cam>_<objekt> (letzter Schnappschuss, Zustand = Zeitpunkt) · binary_sensor.<cam>_motion
  switch.<cam>_detect / _motion / _recordings / _snapshots / _review_alerts / _review_detections
  sensor.<cam>_review_status · am Server-Gerät „Frigate“: sensor.frigate_status, sensor.frigate_uptime
Dazu, was sonst nur Frigate selbst kann: WebSocket „frigate/events/get“ (Ereignisliste als JSON-Text wie
die Integration), Bilder unter /api/frigate/<instanz>/thumbnail|snapshot/<id> und
/api/frigate/<instanz>/notifications/<id>/<datei> (Clips gibt es hier nicht → 404) sowie den Testdienst
casora_mock.frigate_erkennung {label}, der eine neue Erkennung auslöst. Kamera-Name erfunden.
"""
from __future__ import annotations

import io
import json
import random
from datetime import timedelta

CAM = "testhof"
DEV = "frigate_testhof"
SRV = "frigate_server"
INST = "frigate"
OBJECTS = ["person", "car", "cat"]
# Erkennungen der letzten Tage: (Minuten zurück, Objekt, Treffer, Dauer s, Zonen)
EVENTS = [(3, "person", 0.87, 42, ["einfahrt"]), (47, "car", 0.91, 95, ["einfahrt"]), (132, "person", 0.79, 31, []),
          (290, "cat", 0.72, 18, ["garten"]), (610, "person", 0.84, 64, ["einfahrt"]), (1460, "car", 0.88, 120, []),
          (1530, "person", 0.81, 27, ["garten"]), (2900, "person", 0.9, 55, ["einfahrt"])]


def _e(eid, state, device, name, attrs=None, dc=None, unit=None, cat=None, **extra):
    a = {"friendly_name": name, **(attrs or {})}
    if dc:
        a["device_class"] = dc
    if unit:
        a["unit_of_measurement"] = unit
    e = {"entity_id": eid, "state": state, "attributes": a, "platform": "casora_mock", "device": device,
         "area": None, "original_name": name, "name": None, "icon": a.get("icon"), "device_class": dc,
         "unit": unit, "hidden": False, "translation_key": None, "entity_category": cat}
    e.update(extra)
    return e


def _ago(now, minutes):
    return (now - timedelta(minutes=minutes)).isoformat()


def extra(now) -> dict:
    last = {o: next((m for m, ob, *_ in EVENTS if ob == o), None) for o in OBJECTS}
    icons = {"person": "mdi:human", "car": "mdi:car", "cat": "mdi:cat"}
    ents = [
        _e(f"camera.{CAM}", "recording", DEV, "Testhof",
           {"camera_name": CAM, "client_id": INST, "motion_detection": True, "supported_features": 0}, dc="camera",
           frigate=True),
        _e(f"binary_sensor.{CAM}_motion", "off", DEV, "Testhof Motion", dc="motion"),
        _e(f"binary_sensor.{CAM}_all_occupancy", "off", DEV, "Testhof All occupancy", {"icon": "mdi:home-outline"}, dc="occupancy"),
        _e(f"sensor.{CAM}_all_count", "0", DEV, "Testhof All count", {"icon": "mdi:home", "state_class": "measurement"}, unit="objects"),
        _e(f"sensor.{CAM}_all_active_count", "0", DEV, "Testhof All Active Count", {"icon": "mdi:home", "state_class": "measurement"}, unit="objects"),
        _e(f"sensor.{CAM}_review_status", "NONE", DEV, "Testhof Review Status", {"icon": "mdi:eye-check"}),
    ]
    for o in OBJECTS:
        n = o.capitalize()
        ents += [
            _e(f"binary_sensor.{CAM}_{o}_occupancy", "off", DEV, f"Testhof {n} occupancy", {"icon": icons[o]}, dc="occupancy"),
            _e(f"sensor.{CAM}_{o}_count", "0", DEV, f"Testhof {n} count", {"icon": icons[o], "state_class": "measurement"}, unit="objects"),
            _e(f"sensor.{CAM}_{o}_active_count", "0", DEV, f"Testhof {n} Active Count", {"icon": icons[o], "state_class": "measurement"}, unit="objects"),
            _e(f"image.{CAM}_{o}", _ago(now, last[o]) if last[o] is not None else "unknown", DEV, f"Testhof {n}",
               frigate_label=o, ago_min=last[o]),
        ]
    for sw, icon, on in (("detect", "mdi:motion-sensor", "on"), ("motion", "mdi:motion-sensor", "on"),
                         ("recordings", "mdi:filmstrip-box-multiple", "on"), ("snapshots", "mdi:image-multiple", "on"),
                         ("review_alerts", "mdi:bell-alert", "on"), ("review_detections", "mdi:eye-check", "on")):
        nm = {"detect": "Detect", "motion": "Motion", "recordings": "Recordings", "snapshots": "Snapshots",
              "review_alerts": "Review Alerts", "review_detections": "Review Detections"}[sw]
        ents.append(_e(f"switch.{CAM}_{sw}", on, DEV, f"Testhof {nm}", {"icon": icon}, cat="config"))
    ents += [
        _e("sensor.frigate_status", "running", SRV, "Frigate Status", {"icon": "mdi:server"}, cat="diagnostic"),
        _e("sensor.frigate_uptime", "93784", SRV, "Frigate Uptime", {"icon": "mdi:clock-time-five"}, dc="duration", unit="s", cat="diagnostic"),
    ]
    # Belegung der letzten Tage für den Verlauf (an zur Erkennung, nach der Dauer wieder aus).
    hist = {}
    for o in OBJECTS:
        steps = []
        for m, ob, _s, dur, _z in sorted(EVENTS, key=lambda x: -x[0]):
            if ob != o:
                continue
            steps += [[m / 60, "on"], [max(m / 60 - dur / 3600, 0.001), "off"]]
        if steps:
            hist[f"binary_sensor.{CAM}_{o}_occupancy"] = {"steps": steps}
    return {
        "devices": [{"key": SRV, "name": "Frigate", "manufacturer": "Frigate", "model": "0.16.2", "area": None},
                    {"key": DEV, "name": "Testhof", "manufacturer": "Frigate", "model": "0.16.2/Generic", "area": None, "via": SRV}],
        "entities": ents,
        "_history": hist,
    }


# ── Bilder (Pillow liegt im HA-Image; ohne Pillow das Platzhalterbild) ─────────
def _scene(label: str | None, seed: int, w: int, h: int, stamp: str, box: bool) -> bytes | None:
    try:
        from PIL import Image, ImageDraw
    except Exception:  # noqa: BLE001
        return None
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h))
    d = ImageDraw.Draw(im)
    # Himmel, Rasen, Einfahrt, Haus, Hecke – Dämmerlicht wie eine Hofkamera.
    for y in range(h):
        t = y / h
        if t < 0.42:
            c = (int(120 + 60 * t), int(150 + 70 * t), int(185 + 40 * t))
        else:
            c = (int(70 + 30 * (t - .42)), int(100 + 25 * (t - .42)), int(62 + 10 * (t - .42)))
        d.line([(0, y), (w, y)], fill=c)
    d.polygon([(w * .38, h * .42), (w * .62, h * .42), (w * .95, h), (w * .05, h)], fill=(128, 124, 118))
    d.rectangle([w * .06, h * .16, w * .34, h * .44], fill=(196, 182, 160))
    d.polygon([(w * .03, h * .18), (w * .2, h * .04), (w * .37, h * .18)], fill=(130, 70, 56))
    d.rectangle([w * .16, h * .28, w * .23, h * .44], fill=(92, 64, 48))
    d.rectangle([w * .68, h * .30, w * 1.0, h * .45], fill=(46, 82, 50))
    for i in range(7):
        x = w * (.70 + i * .045)
        d.ellipse([x - w * .03, h * .25, x + w * .03, h * .35], fill=(52, 94, 56))
    bx = None
    if label:
        cx = w * (.45 + rnd.random() * .12)
        if label == "person":
            bw, bh = w * .07, h * .34
            x0, y0 = cx - bw / 2, h * .5
            d.ellipse([x0 + bw * .28, y0, x0 + bw * .72, y0 + bh * .2], fill=(222, 186, 160))
            d.rounded_rectangle([x0 + bw * .1, y0 + bh * .2, x0 + bw * .9, y0 + bh * .62], radius=6, fill=(48, 72, 120))
            d.rectangle([x0 + bw * .2, y0 + bh * .62, x0 + bw * .45, y0 + bh], fill=(40, 40, 46))
            d.rectangle([x0 + bw * .55, y0 + bh * .62, x0 + bw * .8, y0 + bh], fill=(40, 40, 46))
        elif label == "car":
            bw, bh = w * .3, h * .2
            x0, y0 = cx - bw / 2, h * .62
            d.rounded_rectangle([x0, y0 + bh * .3, x0 + bw, y0 + bh * .82], radius=10, fill=(150, 36, 40))
            d.rounded_rectangle([x0 + bw * .2, y0, x0 + bw * .78, y0 + bh * .42], radius=10, fill=(130, 30, 34))
            d.rectangle([x0 + bw * .27, y0 + bh * .08, x0 + bw * .71, y0 + bh * .34], fill=(170, 196, 214))
            for wx in (x0 + bw * .2, x0 + bw * .8):
                d.ellipse([wx - bh * .18, y0 + bh * .64, wx + bh * .18, y0 + bh], fill=(24, 24, 26))
        else:
            bw, bh = w * .07, h * .09
            x0, y0 = cx - bw / 2, h * .78
            d.ellipse([x0, y0 + bh * .3, x0 + bw * .8, y0 + bh], fill=(196, 120, 52))
            d.ellipse([x0 + bw * .6, y0, x0 + bw, y0 + bh * .45], fill=(196, 120, 52))
        bx = (x0 - 6, y0 - 6, x0 + bw + 6, y0 + bh + 6)
    if box and bx:
        d.rectangle(bx, outline=(255, 210, 0), width=max(2, w // 320))
        tag = f"{label} {int(70 + rnd.random() * 25)}%"
        d.rectangle([bx[0], bx[1] - h * .05, bx[0] + len(tag) * w * .012, bx[1]], fill=(255, 210, 0))
        d.text((bx[0] + 4, bx[1] - h * .045), tag, fill=(0, 0, 0))
    if stamp:
        d.text((w * .015, h * .02), stamp, fill=(255, 255, 255))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=82)
    return buf.getvalue()


_CACHE: dict = {}


def picture(label: str | None, seed: int = 1, w: int = 1280, h: int = 720, stamp: str = "", box: bool = True) -> bytes | None:
    key = (label, seed, w, h, stamp, box)
    if key not in _CACHE:
        if len(_CACHE) > 64:
            _CACHE.clear()
        _CACHE[key] = _scene(label, seed, w, h, stamp, box)
    return _CACHE[key]


# ── Ereignisse, WebSocket, Bilder-Adressen, Testdienst ─────────────────────────
def setup(hass, mock) -> None:
    from aiohttp import web
    import voluptuous as vol
    from homeassistant.components import websocket_api
    from homeassistant.components.http import HomeAssistantView
    from homeassistant.core import callback
    from homeassistant.util import dt as dt_util

    now = dt_util.utcnow().timestamp()
    events = []
    for i, (m, label, score, dur, zones) in enumerate(EVENTS):
        start = now - m * 60
        events.append({"id": f"{start:.6f}-mock{i}", "camera": CAM, "label": label, "sub_label": None,
                       "start_time": start, "end_time": start + dur, "has_clip": True, "has_snapshot": True,
                       "zones": zones, "top_score": score, "false_positive": None, "retain_indefinitely": False,
                       "data": {"score": score, "top_score": score, "type": "object"}})
    hass.data["casora_mock_frigate"] = events

    base = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA

    @callback
    def ws_events(hass_, connection, msg):
        # Wie die Integration (decode_json=False): die Antwort ist der JSON-Text von Frigates /api/events.
        out = sorted(hass.data["casora_mock_frigate"], key=lambda e: -e["start_time"])
        if msg.get("cameras"):
            out = [e for e in out if e["camera"] in msg["cameras"]]
        if msg.get("labels"):
            out = [e for e in out if e["label"] in msg["labels"]]
        if msg.get("after") is not None:
            out = [e for e in out if e["start_time"] >= msg["after"]]
        if msg.get("before") is not None:
            out = [e for e in out if e["start_time"] <= msg["before"]]
        out = out[: int(msg.get("limit") or 50)]
        connection.send_result(msg["id"], json.dumps(out))

    websocket_api.async_register_command(hass, "frigate/events/get", ws_events,
                                         base.extend({vol.Required("type"): "frigate/events/get"}, extra=vol.ALLOW_EXTRA))

    def find(eid):
        return next((e for e in hass.data["casora_mock_frigate"] if e["id"] == eid), None)

    def jpg(eid, w, h, box):
        e = find(eid)
        if not e:
            return web.Response(status=404)
        stamp = dt_util.as_local(dt_util.utc_from_timestamp(e["start_time"])).strftime("%d.%m.%Y %H:%M:%S")
        body = picture(e["label"], int(e["start_time"]) % 997, w, h, stamp, box)
        return web.Response(body=body, content_type="image/jpeg") if body else web.Response(status=404)

    class Thumb(HomeAssistantView):
        url = "/api/frigate/{inst}/thumbnail/{eid}"
        name = "api:casora_mock:frigate_thumb"

        async def get(self, request, inst, eid):
            return await hass.async_add_executor_job(jpg, eid, 320, 180, False)

    class Snap(HomeAssistantView):
        url = "/api/frigate/{inst}/snapshot/{eid}"
        name = "api:casora_mock:frigate_snap"

        async def get(self, request, inst, eid):
            return await hass.async_add_executor_job(jpg, eid, 1280, 720, True)

    class Notif(HomeAssistantView):
        url = "/api/frigate/{inst}/notifications/{eid}/{path:.*}"
        name = "api:casora_mock:frigate_notif"

        async def get(self, request, inst, eid, path):
            if path == "thumbnail.jpg":
                return await hass.async_add_executor_job(jpg, eid, 320, 180, False)
            if path == "snapshot.jpg":
                return await hass.async_add_executor_job(jpg, eid, 1280, 720, True)
            return web.Response(status=404)  # Clips gibt es im Testhaus nicht

    for v in (Thumb, Snap, Notif):
        hass.http.register_view(v())

    async def erkennung(call) -> None:
        # Neue Erkennung: Belegung an, Zähler 1, Schnappschuss neu, Ereignis vorn; nach 30 s wieder ruhig.
        label = call.data.get("label", "person")
        if label not in OBJECTS:
            return
        t = dt_util.utcnow()
        hass.data["casora_mock_frigate"].append({
            "id": f"{t.timestamp():.6f}-mockneu", "camera": CAM, "label": label, "sub_label": None,
            "start_time": t.timestamp(), "end_time": None, "has_clip": True, "has_snapshot": True, "zones": ["einfahrt"],
            "top_score": 0.86, "false_positive": None, "retain_indefinitely": False,
            "data": {"score": 0.86, "top_score": 0.86, "type": "object"}})
        img = mock.objs.get(f"image.{CAM}_{label}")
        if img is not None:
            img._attr_image_last_updated = t
        mock.set(f"image.{CAM}_{label}", t.isoformat())
        for eid, st in ((f"binary_sensor.{CAM}_{label}_occupancy", "on"), (f"sensor.{CAM}_{label}_count", "1"),
                        (f"sensor.{CAM}_{label}_active_count", "1"), (f"binary_sensor.{CAM}_all_occupancy", "on"),
                        (f"sensor.{CAM}_all_count", "1"), (f"binary_sensor.{CAM}_motion", "on"),
                        (f"sensor.{CAM}_review_status", "ALERT")):
            mock.set(eid, st)

        async def ruhig(_now) -> None:
            ev = hass.data["casora_mock_frigate"][-1]
            if ev.get("end_time") is None:
                ev["end_time"] = ev["start_time"] + 30
            for eid, st in ((f"binary_sensor.{CAM}_{label}_occupancy", "off"), (f"sensor.{CAM}_{label}_count", "0"),
                            (f"sensor.{CAM}_{label}_active_count", "0"), (f"binary_sensor.{CAM}_all_occupancy", "off"),
                            (f"sensor.{CAM}_all_count", "0"), (f"binary_sensor.{CAM}_motion", "off"),
                            (f"sensor.{CAM}_review_status", "NONE")):
                mock.set(eid, st)

        from homeassistant.helpers.event import async_call_later
        async_call_later(hass, float(call.data.get("dauer", 30)), ruhig)

    hass.services.async_register("casora_mock", "frigate_erkennung", erkennung)

    # Aufnahme aus → Kamera „streaming“ wie bei Frigate (Zustand folgt dem Aufnahme-Schalter).
    from homeassistant.helpers.event import async_track_state_change_event

    @callback
    def rec(event) -> None:
        st = event.data.get("new_state")
        if st is not None and st.state in ("on", "off"):
            mock.set(f"camera.{CAM}", "recording" if st.state == "on" else "streaming")

    async_track_state_change_event(hass, [f"switch.{CAM}_recordings"], rec)
