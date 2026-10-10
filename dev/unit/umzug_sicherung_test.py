"""settings.read_umzug_phones und ws_backup ohne HA: Umzugs-Sicherungen lesen und schreiben.

  uv run --python 3.14 --with homeassistant python dev/unit/umzug_sicherung_test.py

Das Studio holt daraus einmalig die Kachelgrößen am Handy für Dashboards, die vor 1.0.3
umgezogen sind. Prüft: je Quelle die neueste Sicherung, nur mit Handy-Layout, ohne
button_card_templates, Filter nach Quelle, kaputte Dateien und fremde Dateien werden übersprungen.
ws_backup (10.10.2026): Lässt sich die Sicherung nicht schreiben, kommt der Fehlercode backup_failed
(das Studio meldet dann verständlich, was zu tun ist) statt „Unknown error“.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

import asyncio  # noqa: E402

from custom_components.casora.settings import read_umzug_phones, ws_backup  # noqa: E402

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


mobile = {"button_card_templates": {"hemma_x": {"variables": {"size": "small"}}},
          "views": [{"path": "home", "cards": [{"type": "custom:button-card", "variables": {"size": "large"}}]}]}
with tempfile.TemporaryDirectory() as folder:
    def put(name, data):
        with open(os.path.join(folder, name), "w", encoding="utf-8") as fh:
            fh.write(data if isinstance(data, str) else json.dumps(data))

    put("umzug_2026-10-03_101500_dashboard-hemma.json", {"url_path": "dashboard-hemma", "title": "Alt", "config": {}, "mobile": mobile})
    put("umzug_2026-10-03_120000_dashboard-hemma.json", {"url_path": "dashboard-hemma", "title": "Neu", "config": {}, "mobile": mobile})
    put("umzug_2026-10-02_090000_ohne-handy.json", {"url_path": "ohne-handy", "config": {}, "mobile": None})
    put("umzug_2026-10-01_090000_kaputt.json", "{nicht json")
    put("umstellen_2026-10-01_090000.json", {"url_path": "x", "mobile": mobile})
    put("umzug_2026-09-30_080000_zweites.json", {"url_path": "zweites", "config": {}, "mobile": mobile})

    out = read_umzug_phones(folder)
    check("je Quelle eine, nur mit Handy " + repr([b["url_path"] for b in out]),
          [b["url_path"] for b in out] == ["dashboard-hemma", "zweites"])
    check("die neueste", out[0]["title"] == "Neu" and out[0]["time"] == "2026-10-03_120000")
    check("ohne button_card_templates", "button_card_templates" not in out[0]["mobile"] and out[0]["mobile"]["views"])
    check("Filter nach Quelle", [b["url_path"] for b in read_umzug_phones(folder, ["zweites"])] == ["zweites"])
    check("Grenze", len(read_umzug_phones(folder, None, 1)) == 1)
check("fehlender Ordner: leer", read_umzug_phones("/nicht/vorhanden") == [])



class FakeConn:
    user = type("U", (), {"is_admin": True, "id": "x"})()

    def __init__(self):
        self.out = []

    def send_result(self, mid, result=None):
        self.out.append(("result", result))

    def send_error(self, mid, code, message=None, *a, **k):
        self.out.append(("error", code, message))

    def async_handle_exception(self, msg, err):  # so meldet HA eine unbehandelte Ausnahme: „Unknown error“
        self.out.append(("error", "unknown_error", str(err)))


class FakeHass:
    def __init__(self, root):
        self.config = type("C", (), {"config_dir": root, "path": lambda _s, *p: os.path.join(root, *p)})()

    async def async_add_executor_job(self, fn, *a):
        return fn(*a)

    def async_create_background_task(self, coro, *a, **k):
        self.task = coro


def handler(hass, conn, msg):
    """ws_backup wie HA es aufruft (async_response legt eine Hintergrundaufgabe an)."""
    async def run():
        ws_backup(hass, conn, msg)
        await hass.task
    return run()

with tempfile.TemporaryDirectory() as root:
    msg = {"id": 1, "type": "casora/backup/dashboard", "name": "Hemma Neu", "data": {"url_path": "x", "config": {"views": []}}}
    conn = FakeConn()
    asyncio.run(handler(FakeHass(root), conn, dict(msg)))
    check("Sicherung geschrieben " + repr(conn.out), conn.out and conn.out[0][0] == "result"
          and os.path.exists(os.path.join(root, conn.out[0][1]["path"])))
with tempfile.TemporaryDirectory() as root:
    open(os.path.join(root, "casora_sicherungen"), "w").close()  # Datei statt Ordner: nicht beschreibbar
    conn = FakeConn()
    asyncio.run(handler(FakeHass(root), conn, dict(msg)))
    check("nicht beschreibbar: backup_failed " + repr(conn.out), conn.out and conn.out[0][:2] == ("error", "backup_failed"))

sys.exit(1 if fails else 0)
