"""Eine erfundene Frigate-Kamera für das Testhaus (Community-Karte „Frigate“, immer dabei).

Nachgebaut wie die Frigate-Integration (blakeblackshear/frigate-hass-integration 5.x) sie anlegt – ohne
translation_key, Namen englisch, alles am Gerät der Kamera:
  camera.<cam> (Attribute camera_name, client_id, device_class „camera“; Zustand recording/streaming;
    hier ohne Stream-Funktion, damit das Live-Bild im Test-HA als MJPEG-Standbild kommt)
  binary_sensor.<cam>_<objekt>_occupancy · sensor.<cam>_<objekt>_count / _active_count (Einheit „objects“)
  image.<cam>_<objekt> (letzter Schnappschuss, Zustand = Zeitpunkt) · binary_sensor.<cam>_motion
  switch.<cam>_detect / _motion / _recordings / _snapshots / _review_alerts / _review_detections
  sensor.<cam>_review_status · am Server-Gerät „Frigate“: sensor.frigate_status, sensor.frigate_uptime
Dazu, was sonst nur Frigate selbst kann (Antworten als JSON-Text wie die Integration):
  WebSocket frigate/events/get (auch favorites, zones, sub_labels), frigate/reviews/get (Alarme/Erkennungen,
  einige ungesehen), frigate/reviews/viewed, frigate/event/retain (merkt sich „Behalten“),
  frigate/recordings/summary (Stunden der letzten 3 Tage) und frigate/recordings/get (10-s-Segmente, je Stunde
  eine Lücke ab :20), frigate/events|reviews/subscribe (+ unsubscribe) – neue Erkennungen kommen dort an.
  Proxy /api/frigate/<instanz>/: thumbnail|snapshot/<id>, notifications/<id>/{thumbnail.jpg|snapshot.jpg|clip.mp4|
  <kamera>/review_thumbnail.webp|master.m3u8}, vod/…/master.m3u8 (HLS; streng wie die Integration: Listen nur angemeldet
  bzw. pfadgenau signiert, Segmente mit Signatur aus demselben Verzeichnis), recording/<kamera>/start/<s>/end/<e> (MP4),
  jeweils mit ?download=true als Anhang. Videos: 60 s Testbild, beim ersten Abruf mit dem ffmpeg des HA-Images erzeugt.
  Streams (#61): go2rtc/api/streams (testhof + testhof_sub), mse/api/ws bzw. go2rtc/ws/api/ws (MSE, fragmentiertes MP4).
  Testdienste: casora_mock.frigate_erkennung {label, dauer} löst eine neue Erkennung aus;
  casora_mock.frigate_proxy {notifications, vod, reviews, stream, clips, streams, zuruecksetzen} schaltet Rückfälle
  (Notification-Proxy aus, ohne HLS, Frigate ohne Reviews, Kamera mit Stream-Funktion, ohne Clips-Proxy
  clips/review/thumb-<kamera>-<id>.webp). Kamera- und Gesichtsname erfunden.
"""
from __future__ import annotations

import json
import re
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


# ── Bilder: fertige Zeichnungen je Stimmung (Tag/Dämmerung/Nacht, kamerabild.py) ─────────
def picture(st: str, label: str | None, seed: int = 1, w: int = 1280, h: int = 720, stamp: str = "",
            box: bool = True) -> bytes | None:
    """Hof-Bild: ohne label leer (Live-Bild); person/cat mit Figur, car = das geparkte Auto, andere Tiere
    nehmen das Katzenbild. box = Erkennungsrahmen mit Treffer wie Frigates Schnappschuss."""
    from .kamerabild import bild
    name = {"person": "hof_person", "car": "hof"}.get(label or "", "hof_cat" if label else "hof")
    return bild(st, "hof", name, w, h, stamp, label if box else None, "cat" if name == "hof_cat" else label, seed)


# ── Ereignisse, WebSocket, Bilder-Adressen, Testdienst ─────────────────────────
# ── Testvideo (ffmpeg liegt im HA-Image; ohne ffmpeg gibt es keine Clips → 404) ──
# Erzeugt einmal beim ersten Abruf: Testbild (testsrc2 mit Laufzeit, 320 × 180) als MP4-Clip (60 s) und als HLS über
# eine Stunde (10-s-Stücke). Nur synthetisches Bild, nichts Fremdes; liegt im Container unter /tmp, nicht im Repo.
_MEDIA = "/tmp/casora_mock_frigate_media"


def _media() -> str | None:
    import os
    import shutil
    import subprocess
    ok = os.path.join(_MEDIA, "fertig-2")
    if os.path.exists(ok):
        return _MEDIA
    ff = shutil.which("ffmpeg")
    if not ff:
        return None
    os.makedirs(_MEDIA, exist_ok=True)
    enc = ["-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-an"]
    # Clip 60 s (10 fps); HLS eine ganze Stunde (2 fps), damit die Zeitleiste überall hin springen kann.
    clip = ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=10", "-t", "60", *enc, "-g", "20"]
    hour = ["-f", "lavfi", "-i", "testsrc2=size=320x180:rate=2", "-t", "3600", *enc, "-g", "20"]
    try:
        subprocess.run([ff, "-y", "-loglevel", "error", *clip, "-movflags", "+faststart", os.path.join(_MEDIA, "clip.mp4")],
                       check=True, timeout=60)
        subprocess.run([ff, "-y", "-loglevel", "error", *hour, "-f", "hls", "-hls_time", "10", "-hls_playlist_type", "vod",
                        "-hls_segment_filename", os.path.join(_MEDIA, "seg%03d.ts"), os.path.join(_MEDIA, "index.m3u8")],
                       check=True, timeout=180)
    except Exception:  # noqa: BLE001
        return None
    open(ok, "w").close()
    return _MEDIA


# #61: the camera's go2rtc streams – main (testsrc2, 640 × 360) and sub (testsrc, 320 × 180, other pattern, so a
# screenshot shows which one plays). Fragmented MP4 for MSE, made once per stream and codec on first use.
STREAMS = [CAM, f"{CAM}_sub"]
LIVE_SECONDS = 600
LIVE_MIME = {"h264": 'video/mp4; codecs="avc1.42E01E"', "vp9": 'video/mp4; codecs="vp09.00.10.08"'}


def _live(src: str, kind: str) -> str | None:
    import os
    import shutil
    import subprocess
    ff = shutil.which("ffmpeg")
    if not ff or src not in STREAMS:
        return None
    os.makedirs(_MEDIA, exist_ok=True)
    out = os.path.join(_MEDIA, f"live-{src}-{kind}.mp4")
    if os.path.exists(out + ".ok"):
        return out
    pat = "testsrc=size=320x180:rate=5" if src.endswith("_sub") else "testsrc2=size=640x360:rate=5"
    enc = (["-c:v", "libx264", "-profile:v", "baseline", "-level", "3.0", "-preset", "ultrafast"] if kind == "h264"
           else ["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "300k"])
    try:
        subprocess.run([ff, "-y", "-loglevel", "error", "-f", "lavfi", "-i", pat, "-t", str(LIVE_SECONDS), *enc,
                        "-pix_fmt", "yuv420p", "-g", "10", "-an",
                        "-movflags", "frag_keyframe+empty_moov+default_base_moof", "-f", "mp4", out],
                       check=True, timeout=300)
    except Exception:  # noqa: BLE001
        return None
    open(out + ".ok", "w").close()
    return out


# ── Ereignisse, Reviews, Aufnahmen, WebSocket, Proxy-Adressen, Testdienste ─────
def setup(hass, mock) -> None:
    # asyncio only here: haus.py runs with dev/casora_mock on the path, where select.py shadows the stdlib.
    import asyncio
    import os
    from aiohttp import web
    import voluptuous as vol
    from homeassistant.components import websocket_api
    from homeassistant.components.http import HomeAssistantView
    from homeassistant.core import callback
    from homeassistant.util import dt as dt_util
    from .kamerabild import stimmung

    now = dt_util.utcnow().timestamp()
    events, reviews = [], []
    for i, (m, label, score, dur, zones) in enumerate(EVENTS):
        start = now - m * 60
        eid = f"{start:.6f}-mock{i}"
        # Ein Gesicht (sub_label) an einer Person – erfundener Name.
        sub = FACE if i == 4 else None
        events.append({"id": eid, "camera": CAM, "label": label, "sub_label": sub,
                       "start_time": start, "end_time": start + dur, "has_clip": True, "has_snapshot": True,
                       "zones": zones, "top_score": score, "false_positive": None, "retain_indefinitely": i == 5,
                       "data": {"score": score, "top_score": score, "type": "object"}})
        # Review je Erkennung (Frigate ≥ 0.14): Person/Auto in der Einfahrt = Alarm, sonst Erkennung; die drei
        # neuesten sind ungesehen.
        reviews.append(_review(f"{start:.6f}-rev{i}", start, start + dur, eid, label, zones, sub, i >= 3))
    hass.data["casora_mock_frigate"] = events
    hass.data["casora_mock_frigate_rev"] = reviews
    # Schalter fürs Testen der Rückfälle (Dienst casora_mock.frigate_proxy): Notification-Proxy (Integrations-
    # Option), VOD/HLS, reviews/get (ältere Frigate-Versionen), Stream-Funktion der Kamera.
    flags = hass.data["casora_mock_frigate_flags"] = {"notifications": True, "vod": True, "reviews": True, "stream": False, "clips": True,
                                                   "streams": True}
    subs: dict = {"events": {}, "reviews": {}}

    base = websocket_api.BASE_COMMAND_MESSAGE_SCHEMA

    def reg(name, fn):
        websocket_api.async_register_command(hass, name, fn, base.extend({vol.Required("type"): name}, extra=vol.ALLOW_EXTRA))

    def evs():
        return hass.data["casora_mock_frigate"]

    def revs():
        return hass.data["casora_mock_frigate_rev"]

    @callback
    def ws_events(hass_, connection, msg):
        # Wie die Integration (decode_json=False): die Antwort ist der JSON-Text von Frigates /api/events.
        out = sorted(evs(), key=lambda e: -e["start_time"])
        if msg.get("cameras"):
            out = [e for e in out if e["camera"] in msg["cameras"]]
        if msg.get("labels"):
            out = [e for e in out if e["label"] in msg["labels"]]
        if msg.get("zones"):
            out = [e for e in out if set(e["zones"]) & set(msg["zones"])]
        if msg.get("sub_labels"):
            out = [e for e in out if e.get("sub_label") in msg["sub_labels"]]
        if msg.get("favorites"):
            out = [e for e in out if e.get("retain_indefinitely")]
        if msg.get("after") is not None:
            out = [e for e in out if e["start_time"] >= msg["after"]]
        if msg.get("before") is not None:
            out = [e for e in out if e["start_time"] <= msg["before"]]
        out = out[: int(msg.get("limit") or 50)]
        connection.send_result(msg["id"], json.dumps(out))

    @callback
    def ws_reviews(hass_, connection, msg):
        if not flags["reviews"]:
            connection.send_error(msg["id"], "unknown_command", "Unknown command.")
            return
        out = sorted(revs(), key=lambda r: -r["start_time"])
        if msg.get("cameras"):
            out = [r for r in out if r["camera"] in msg["cameras"]]
        if msg.get("severity"):
            out = [r for r in out if r["severity"] == msg["severity"]]
        if msg.get("labels"):
            out = [r for r in out if set(r["data"]["objects"]) & set(msg["labels"])]
        if msg.get("zones"):
            out = [r for r in out if set(r["data"]["zones"]) & set(msg["zones"])]
        if msg.get("reviewed") is not None:
            out = [r for r in out if bool(r["has_been_reviewed"]) == bool(msg["reviewed"])]
        if msg.get("after") is not None:
            out = [r for r in out if r["start_time"] >= float(msg["after"])]
        if msg.get("before") is not None:
            out = [r for r in out if r["start_time"] <= float(msg["before"])]
        out = out[: int(msg.get("limit") or 100)]
        connection.send_result(msg["id"], json.dumps(out))

    @callback
    def ws_viewed(hass_, connection, msg):
        if not flags["reviews"]:
            connection.send_error(msg["id"], "unknown_command", "Unknown command.")
            return
        ids = set(msg.get("ids") or [])
        for r in revs():
            if r["id"] in ids:
                r["has_been_reviewed"] = bool(msg.get("viewed", True))
        connection.send_result(msg["id"], {"success": True, "message": "Reviewed multiple items"})

    @callback
    def ws_retain(hass_, connection, msg):
        e = next((x for x in evs() if x["id"] == msg.get("event_id")), None)
        if e is None:
            connection.send_error(msg["id"], "frigate_error", "Event not found")
            return
        e["retain_indefinitely"] = bool(msg.get("retain"))
        connection.send_result(msg["id"], json.dumps({"success": True, "message": "Event " + e["id"] + (" retained" if e["retain_indefinitely"] else " un-retained")}))

    def tz_of(msg):
        from zoneinfo import ZoneInfo
        try:
            return ZoneInfo(msg.get("timezone") or "UTC")
        except Exception:  # noqa: BLE001
            return ZoneInfo("UTC")

    @callback
    def ws_rec_summary(hass_, connection, msg):
        # Wie Frigates /api/<kamera>/recordings/summary: je Tag die Stunden mit Aufnahme (Dauer, Erkennungen).
        from datetime import datetime
        tz = tz_of(msg)
        t = datetime.now(tz)
        days = {}
        top = t.replace(minute=0, second=0, microsecond=0)
        for h in range(0, 3 * 24 + 1):
            hs = top - timedelta(hours=h)
            dd = (t.date() - hs.date()).days
            if dd > 2:
                break
            if dd == 2 and hs.hour < 6:  # vorgestern erst ab 6 Uhr
                continue
            a = hs.timestamp()
            dur = min(3600.0, now_ts() - a) - max(0.0, min(now_ts(), a + 1200 + _GAP) - (a + 1200))
            n = sum(1 for e in evs() if a <= e["start_time"] < a + 3600)
            key = hs.strftime("%Y-%m-%d")
            d = days.setdefault(key, {"day": key, "events": 0, "hours": []})
            d["events"] += n
            d["hours"].append({"hour": hs.strftime("%H"), "events": n, "motion": 0, "objects": n, "duration": round(max(dur, 1))})
        out = sorted(days.values(), key=lambda d: d["day"], reverse=True)
        connection.send_result(msg["id"], json.dumps(out))

    @callback
    def ws_rec_get(hass_, connection, msg):
        # Segmente à 10 s wie Frigates /api/<kamera>/recordings; je Stunde fehlen 4 Min. (Lücke ab :20).
        a = float(msg.get("after") or now_ts() - 3600)
        b = min(float(msg.get("before") or now_ts()), now_ts())
        out = []
        s = a - (a % 10)
        while s < b and len(out) < 2000:
            mi = (s % 3600) / 60
            if not (20 <= mi < 24):
                out.append({"id": f"{s:.1f}-seg", "start_time": s, "end_time": s + 10, "segment_size": 0.4,
                            "motion": 0, "objects": 0, "dBFS": 0, "duration": 10})
            s += 10
        connection.send_result(msg["id"], json.dumps(out))

    def ws_sub(kind):
        @callback
        def handler(hass_, connection, msg):
            if kind == "reviews" and not flags["reviews"]:
                connection.send_error(msg["id"], "unknown_command", "Unknown command.")
                return
            sid = msg["id"]
            subs[kind][sid] = connection
            connection.subscriptions[sid] = lambda: subs[kind].pop(sid, None)
            connection.send_result(sid, sid)
        return handler

    def ws_unsub(kind):
        @callback
        def handler(hass_, connection, msg):
            sid = msg.get("subscription_id")
            if subs[kind].pop(sid, None) is None:
                connection.send_error(msg["id"], "not_found", "Subscription not found.")
                return
            connection.subscriptions.pop(sid, None)
            connection.send_result(msg["id"])
        return handler

    def push(kind, payload):
        text = json.dumps(payload)
        for sid, conn in list(subs[kind].items()):
            try:
                conn.send_message(websocket_api.event_message(sid, text))
            except Exception:  # noqa: BLE001
                subs[kind].pop(sid, None)

    hass.data["casora_mock_frigate_subs"] = subs
    reg("frigate/events/get", ws_events)
    reg("frigate/reviews/get", ws_reviews)
    reg("frigate/reviews/viewed", ws_viewed)
    reg("frigate/event/retain", ws_retain)
    reg("frigate/recordings/summary", ws_rec_summary)
    reg("frigate/recordings/get", ws_rec_get)
    reg("frigate/events/subscribe", ws_sub("events"))
    reg("frigate/reviews/subscribe", ws_sub("reviews"))
    reg("frigate/events/unsubscribe", ws_unsub("events"))
    reg("frigate/reviews/unsubscribe", ws_unsub("reviews"))

    def find(eid):
        return next((e for e in evs() if e["id"] == eid), None)

    def disp(request, body, ctype, name):
        r = web.Response(body=body, content_type=ctype)
        if request.query.get("download") == "true":
            r.headers["Content-Disposition"] = f'attachment; filename="{name}"'
        return r

    def jpg(e, st, w, h, box):
        stamp = dt_util.as_local(dt_util.utc_from_timestamp(e["start_time"])).strftime("%d.%m.%Y %H:%M:%S")
        return picture(st, e["label"], int(e["start_time"]) % 997, w, h, stamp, box)

    async def image(request, eid, w, h, box, name):
        # Stimmung zur Zeit der Erkennung (ein Treffer von gestern Nacht bleibt ein Nachtbild).
        e = find(eid)
        st = stimmung(hass, dt_util.utc_from_timestamp(e["start_time"])) if e else None
        body = await hass.async_add_executor_job(jpg, e, st, w, h, box) if e else None
        return disp(request, body, "image/jpeg", name) if body else web.Response(status=404)

    async def media_file(name):
        d = await hass.async_add_executor_job(_media)
        p = d and os.path.join(d, name)
        if not p or not os.path.exists(p):
            return None
        return await hass.async_add_executor_job(lambda: open(p, "rb").read())

    async def mp4(request, name):
        body = await media_file("clip.mp4")
        return disp(request, body, "video/mp4", name) if body else web.Response(status=404)

    async def hls(file, query=""):
        # master → index.m3u8 (relativ) → seg000.ts …; dieselben Stücke für jede Stunde und jede Erkennung.
        if file == "master.m3u8":
            if not await media_file("index.m3u8"):
                return web.Response(status=404)
            body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=200000,CODECS=\"avc1.42c00d\",RESOLUTION=320x180\nindex.m3u8\n"
            return web.Response(text=body, content_type="application/vnd.apple.mpegurl")
        body = await media_file(file)
        if not body:
            return web.Response(status=404)
        if file.endswith(".m3u8") and query:
            # Wie Frigates nginx (secure_token $args): die Anfrage-Parameter (authSig der Unter-Liste) hängen an den Segmenten.
            lines = body.decode().splitlines()
            body = "\n".join(x + "?" + query if x and not x.startswith("#") else x for x in lines).encode() + b"\n"
        ctype = "application/vnd.apple.mpegurl" if file.endswith(".m3u8") else "video/mp2t"
        return web.Response(body=body, content_type=ctype)

    def vod_allowed(request) -> bool:
        # Streng wie die Integration (views.py): Wiedergabelisten (VodProxyView) nur angemeldet – eine Signatur gilt bei HA
        # pfadgenau, die des Masters also nicht für die Unter-Liste; Segmente (VodSegmentProxyView) angemeldet oder mit
        # einer Signatur, deren Pfad im selben Verzeichnis liegt.
        from homeassistant.components.http import KEY_AUTHENTICATED
        if request.get(KEY_AUTHENTICATED):
            return True
        if request.path.endswith(".m3u8"):
            return False
        import jwt
        from homeassistant.components.http.auth import DATA_SIGN_SECRET
        sig = request.query.get("authSig")
        if not sig:
            return False
        try:
            claims = jwt.decode(sig, str(hass.data.get(DATA_SIGN_SECRET)), algorithms=["HS256"], options={"verify_iss": False})
        except jwt.InvalidTokenError:
            return False
        return str(claims.get("path", "")).startswith(request.path.rsplit("/", 1)[0])

    class Thumb(HomeAssistantView):
        url = "/api/frigate/{inst}/thumbnail/{eid}"
        name = "api:casora_mock:frigate_thumb"

        async def get(self, request, inst, eid):
            return await image(request, eid, 320, 180, False, f"{eid}-thumb.jpg")

    class Snap(HomeAssistantView):
        url = "/api/frigate/{inst}/snapshot/{eid}"
        name = "api:casora_mock:frigate_snap"

        async def get(self, request, inst, eid):
            return await image(request, eid, 1280, 720, True, f"{eid}.jpg")

    class Notif(HomeAssistantView):
        url = "/api/frigate/{inst}/notifications/{eid}/{path:.*}"
        name = "api:casora_mock:frigate_notif"
        # Wie die Integration: Segmente laden ohne Anmeldung (die Adresse der Wiedergabeliste ist signiert).
        requires_auth = False

        async def get(self, request, inst, eid, path):
            if not flags["notifications"]:
                return web.Response(status=403)  # Integrations-Option „Notification-Proxy“ aus
            if path == "thumbnail.jpg":
                return await image(request, eid, 320, 180, False, f"{eid}-thumb.jpg")
            if path == "snapshot.jpg":
                return await image(request, eid, 1280, 720, True, f"{eid}.jpg")
            if path.endswith("review_thumbnail.webp"):
                r = next((x for x in revs() if x["id"] == eid), None)
                det = r and (r["data"]["detections"] or [None])[0]
                return await image(request, det, 320, 180, False, f"{eid}.webp") if det else web.Response(status=404)
            if path.endswith("clip.mp4"):
                return await mp4(request, f"{eid}.mp4") if find(eid) else web.Response(status=404)
            if path.endswith((".m3u8", ".ts")):
                return await hls(os.path.basename(path), request.query_string) if flags["vod"] else web.Response(status=404)
            return web.Response(status=404)

    class Clips(HomeAssistantView):
        # Wie ReviewClipsProxyView (neuere Integrationen): Frigates Dateien unter /media/frigate/clips/, angemeldet bzw. signiert.
        url = "/api/frigate/{inst}/clips/{path:.+}"
        name = "api:casora_mock:frigate_clips"

        async def get(self, request, inst, path):
            if not flags["clips"]:
                return web.Response(status=404)  # ältere Integration ohne Clips-Proxy
            m = re.match(rf"review/thumb-{CAM}-(.+)\.webp$", path)
            r = m and next((x for x in revs() if x["id"] == m.group(1)), None)
            det = r and (r["data"]["detections"] or [None])[0]
            return await image(request, det, 320, 180, False, f"{m.group(1)}.webp") if det else web.Response(status=404)

    class Vod(HomeAssistantView):
        url = "/api/frigate/{inst}/vod/{path:.+}"
        name = "api:casora_mock:frigate_vod"
        # Prüft selbst (vod_allowed), wie VodProxyView/VodSegmentProxyView der Integration.
        requires_auth = False

        async def get(self, request, inst, path):
            if not vod_allowed(request):
                return web.Response(status=401)
            if not flags["vod"]:
                return web.Response(status=404)
            return await hls(os.path.basename(path), request.query_string)

    class Rec(HomeAssistantView):
        url = "/api/frigate/{inst}/recording/{cam}/start/{start}/end/{end}"
        name = "api:casora_mock:frigate_rec"

        async def get(self, request, inst, cam, start, end):
            return await mp4(request, f"{cam}-{start}.mp4")

    # #61 streams: go2rtc of the made-up Frigate has the camera's main stream and a sub stream (flag "streams").
    # Like Go2RTCAPIProxyView: …/go2rtc/api/streams lists them; like MSEProxyView / Go2RTCAPIWebsocketProxyView:
    # …/mse/api/ws?src=<stream> speaks go2rtc's MSE protocol ({type: mse, value: codecs} → {type: mse, value: mime},
    # then fragmented MP4) – H.264 when the browser lists avc1, else VP9 (Playwright's Chromium has no H.264).
    async def go2_ws(request, path):
        src = request.query.get("src", "")
        if not flags["streams"] or src not in STREAMS or path.rstrip("/") != "api/ws":
            return web.Response(status=404)
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        try:
            first = await ws.receive(timeout=10)
            want = json.loads(first.data).get("value", "") if first.type == web.WSMsgType.TEXT else ""
        except Exception:  # noqa: BLE001
            await ws.close()
            return ws
        kind = "h264" if "avc1" in want else "vp9"
        name = await hass.async_add_executor_job(_live, src, kind)
        if not name:
            await ws.send_str(json.dumps({"type": "error", "value": "no media"}))
            await ws.close()
            return ws
        await ws.send_str(json.dumps({"type": "mse", "value": LIVE_MIME[kind]}))
        data = await hass.async_add_executor_job(lambda: open(name, "rb").read())
        # Paced like a live stream: two seconds at once, then a quarter second every quarter second.
        per_s = max(1, len(data) // LIVE_SECONDS)
        pos, step = per_s * 2, max(1024, per_s // 4)
        hass.data.setdefault("casora_mock_frigate_live", []).append(src)
        try:
            await ws.send_bytes(data[:pos])
            while pos < len(data) and not ws.closed:
                await asyncio.sleep(0.25)
                await ws.send_bytes(data[pos:pos + step])
                pos += step
        except Exception:  # noqa: BLE001
            pass
        if not ws.closed:
            await ws.close()
        return ws

    class Go2Ws(HomeAssistantView):
        url = "/api/frigate/{inst}/go2rtc/ws/{path:.*}"
        name = "api:casora_mock:frigate_go2rtc_ws"

        async def get(self, request, inst, path):
            return await go2_ws(request, path)

    class Mse(HomeAssistantView):
        url = "/api/frigate/{inst}/mse/{path:.+}"
        name = "api:casora_mock:frigate_mse"

        async def get(self, request, inst, path):
            return await go2_ws(request, path)

    class Go2(HomeAssistantView):
        url = "/api/frigate/{inst}/go2rtc/{path:.*}"
        name = "api:casora_mock:frigate_go2rtc"

        async def get(self, request, inst, path):
            if path.rstrip("/") != "api/streams":
                return web.Response(status=404)
            if not flags["streams"]:
                return web.Response(status=404)  # integration without the go2rtc proxy
            # Shape of go2rtc's /api/streams (producers/consumers per name), no addresses.
            return web.json_response({s: {"producers": [{"url": "rtsp://***"}], "consumers": []} for s in STREAMS})

    # The websocket route first (as the integration registers it), else …/go2rtc/{path} would take it.
    for v in (Thumb, Snap, Notif, Clips, Vod, Rec, Go2Ws, Mse, Go2):
        hass.http.register_view(v())

    def now_ts():
        return dt_util.utcnow().timestamp()

    def rev_of(ev_id):
        return next((r for r in revs() if ev_id in r["data"]["detections"]), None)

    def ev_msg(kind, e):
        return {"type": kind, "before": e, "after": dict(e, current_zones=e["zones"], snapshot={"frame_time": e["start_time"]})}

    async def erkennung(call) -> None:
        # Neue Erkennung: Belegung an, Zähler 1, Schnappschuss neu, Ereignis + Review vorn (Abos bekommen sie);
        # nach „dauer“ s wieder ruhig.
        label = call.data.get("label", "person")
        if label not in OBJECTS:
            return
        t = dt_util.utcnow()
        dauer = float(call.data.get("dauer", 30))
        ev_id = f"{t.timestamp():.6f}-mockneu"
        ev = {"id": ev_id, "camera": CAM, "label": label, "sub_label": None,
              "start_time": t.timestamp(), "end_time": None, "has_clip": True, "has_snapshot": True, "zones": ["einfahrt"],
              "top_score": 0.86, "false_positive": None, "retain_indefinitely": False,
              "data": {"score": 0.86, "top_score": 0.86, "type": "object"}}
        evs().append(ev)
        rv = _review(f"{t.timestamp():.6f}-revneu", t.timestamp(), None, ev_id, label, ["einfahrt"], None, False)
        revs().append(rv)
        push("events", ev_msg("new", ev))
        push("reviews", {"type": "new", "before": rv, "after": rv})
        img = mock.objs.get(f"image.{CAM}_{label}")
        if img is not None:
            img._attr_image_last_updated = t
        mock.set(f"image.{CAM}_{label}", t.isoformat())
        for eid, sv in ((f"binary_sensor.{CAM}_{label}_occupancy", "on"), (f"sensor.{CAM}_{label}_count", "1"),
                        (f"sensor.{CAM}_{label}_active_count", "1"), (f"binary_sensor.{CAM}_all_occupancy", "on"),
                        (f"sensor.{CAM}_all_count", "1"), (f"binary_sensor.{CAM}_motion", "on"),
                        (f"sensor.{CAM}_review_status", "ALERT")):
            mock.set(eid, sv)

        async def ruhig(_now) -> None:
            # Genau dieses Ereignis beenden (bei zwei Erkennungen nacheinander blieb sonst das erste „läuft“).
            e = next((x for x in evs() if x["id"] == ev_id), None)
            if e is not None and e.get("end_time") is None:
                e["end_time"] = e["start_time"] + dauer
                push("events", ev_msg("end", e))
            r = rev_of(ev_id)
            if r is not None and r.get("end_time") is None:
                r["end_time"] = r["start_time"] + dauer
                push("reviews", {"type": "end", "before": r, "after": r})
            for eid, sv in ((f"binary_sensor.{CAM}_{label}_occupancy", "off"), (f"sensor.{CAM}_{label}_count", "0"),
                            (f"sensor.{CAM}_{label}_active_count", "0")):
                mock.set(eid, sv)
            # Haus-weit erst ruhig, wenn kein anderes Objekt mehr im Bild ist.
            if not any(hass.states.is_state(f"binary_sensor.{CAM}_{o}_occupancy", "on") for o in OBJECTS):
                for eid, sv in ((f"binary_sensor.{CAM}_all_occupancy", "off"), (f"sensor.{CAM}_all_count", "0"),
                                (f"binary_sensor.{CAM}_motion", "off"), (f"sensor.{CAM}_review_status", "NONE")):
                    mock.set(eid, sv)

        from homeassistant.helpers.event import async_call_later
        async_call_later(hass, dauer, ruhig)

    hass.services.async_register("casora_mock", "frigate_erkennung", erkennung)

    async def proxy(call) -> None:
        # Rückfälle testen: {notifications, vod, reviews, stream} je true/false (fehlende bleiben).
        for k in flags:
            if k in call.data:
                flags[k] = bool(call.data[k])
        if "stream" in call.data:
            mock.set(f"camera.{CAM}", None, supported_features=2 if flags["stream"] else 0)
        if call.data.get("zuruecksetzen"):
            # Erkennungen aus dem Testdienst weg, Gesehen/Behalten wie beim Start (wiederholbare Tests).
            evs()[:] = [e for e in evs() if not e["id"].endswith("mockneu")]
            revs()[:] = [r for r in revs() if not r["id"].endswith("revneu")]
            for r in revs():
                r["has_been_reviewed"] = not r["id"].endswith(("rev0", "rev1", "rev2"))
            for i, e in enumerate(evs()):
                e["retain_indefinitely"] = e["id"].endswith("mock5")

    hass.services.async_register("casora_mock", "frigate_proxy", proxy)
    # Testvideos gleich im Hintergrund erzeugen (die Stunde braucht ein paar Sekunden).
    hass.async_add_executor_job(_media)

    # Aufnahme aus → Kamera „streaming“ wie bei Frigate (Zustand folgt dem Aufnahme-Schalter).
    from homeassistant.helpers.event import async_track_state_change_event

    @callback
    def rec(event) -> None:
        sv = event.data.get("new_state")
        if sv is not None and sv.state in ("on", "off"):
            mock.set(f"camera.{CAM}", "recording" if sv.state == "on" else "streaming")

    async_track_state_change_event(hass, [f"switch.{CAM}_recordings"], rec)


# Lücke je Stunde in den Test-Aufnahmen (Sekunden, siehe ws_rec_get).
_GAP = 240
FACE = "Robin"


def _review(rid, start, end, ev_id, label, zones, sub, seen):
    return {"id": rid, "camera": CAM, "start_time": start, "end_time": end, "has_been_reviewed": seen,
            "severity": "alert" if label in ("person", "car") and "einfahrt" in zones else "detection",
            "thumb_path": f"/media/frigate/clips/review/thumb-{CAM}-{rid}.webp",
            "data": {"detections": [ev_id], "objects": [label], "sub_labels": [sub] if sub else [], "zones": list(zones), "audio": []}}
