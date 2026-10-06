"""Kleine Robustheits-Fehler der Python-Seite (B-PY-…) ohne HA-Kern.

  uv run --python 3.14 --with homeassistant python dev/unit/python_robust_test.py

B-PY-04: zwei gleichzeitige Auffrisch-Läufe (Start + Karten-Update) laufen nacheinander.
B-PY-05: Konfigurieren-Dialog: „Ungültige Zeit“ nur unter Zeitplan-Feldern.
B-PY-06: unpassende KI-Änderung beim Umzug („Vorlage anpassen“) → verständliche Meldung statt Absturz.
SEC-02:  casora.umstellen und casora.einrichten nur für Admins.
B-PY-07: beim Entladen/Entfernen verschwinden casora.einrichten und casora.umstellen.
B-PY-08: Neustart-Schalter: die Liste der Abmelder wächst nicht mit jedem Einschalten.
B-PY-13: ein gelöschter Karten-Update-Anhang blockiert die übrigen Karten-Updates nicht.
B-PY-14: Kamera-/Pflanzen-KI ohne eingerichtete KI → Fehler mit Grund, kein Aufruf mit „None“.
B-PY-15: Heizungs-Coach nennt die Temperatur-Einheit von HA (°F), nicht fest °C.
B-PY-17: zwei gleichzeitige Vorlagen-Abrufe schreiben nicht in dieselbe .tmp-Datei.
B-PY-18: HACS' Liste im Speicher wird im Event-Loop gelesen, nicht in einem Hintergrund-Thread.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import config_flow, options, template_refresh  # noqa: E402

fails: list[str] = []


def check(name, cond, info=""):
    print(("ok   " if cond else "FAIL ") + name + ("" if cond else f"  {info}"))
    if not cond:
        fails.append(name)


async def t_py04():
    hass = SimpleNamespace(data={})
    log = []

    async def inner(h):
        log.append("start")
        await asyncio.sleep(0.01)
        log.append("ende")
        return 1

    real = template_refresh._async_refresh_dashboards
    template_refresh._async_refresh_dashboards = inner
    try:
        await asyncio.gather(template_refresh.async_refresh_dashboards(hass),
                             template_refresh.async_refresh_dashboards(hass))
    finally:
        template_refresh._async_refresh_dashboards = real
    check("B-PY-04: Auffrischen läuft nacheinander", log == ["start", "ende", "start", "ende"], repr(log))


async def t_py05():
    got = {}
    flow = object.__new__(config_flow.CasoraOptionsFlow)
    flow.hass = None
    type(flow).config_entry = property(lambda self: SimpleNamespace(options={}))
    flow.async_show_form = lambda **k: got.update(k["errors"]) or k
    real_b, real_s = config_flow.build_options, config_flow.options_schema
    config_flow.options_schema = lambda *a: None
    try:
        for path in ("strompreis", options.PLAN_KEYS[0]):
            got.clear()
            config_flow.build_options = lambda *a, p=path: (_ for _ in ()).throw(options.OptionsError("x", p))
            await flow.async_step_init({"x": 1})
            want = "invalid_plan" if path in options.PLAN_KEYS else "invalid"
            check(f"B-PY-05: Feld {path} → {want}", got == {path: want}, repr(got))
    finally:
        config_flow.build_options, config_flow.options_schema = real_b, real_s


async def t_py06():
    from custom_components.casora import ki, settings

    sent = {}
    conn = SimpleNamespace(user=SimpleNamespace(is_admin=True), send_error=lambda i, code, text: sent.update(code=code, text=text),
                           send_result=lambda i, r: sent.update(code="ok"))
    hass = SimpleNamespace(config_entries=SimpleNamespace(async_entries=lambda d: [object()]),
                           config=SimpleNamespace(language="de"))
    jobs = []
    hass.async_create_background_task = lambda coro, *a, **k: jobs.append(coro)

    async def ask(*a, **k):
        return {"ops": '[{"op": "set", "path": "variables/liste/0/stil/farbe", "value": "rot"}]', "changes": []}

    real = ki.ai_models, ki.ask_ai
    ki.ai_models = lambda h: [{"ok": True, "entity_id": "ai_task.x"}]
    ki.ask_ai = ask
    try:
        settings.ws_merge_template(hass, conn, {
            "id": 1, "name": "t", "mine": {}, "casora": {"variables": {"liste": ["text"]}}})
        for j in jobs:
            try:
                await j
            except Exception as err:  # noqa: BLE001
                sent.update(code="absturz", text=repr(err))
    finally:
        ki.ai_models, ki.ask_ai = real
    check("B-PY-06: Meldung „passen nicht zur Vorlage“", sent.get("code") == "bad_ops", repr(sent))


async def t_sec02():
    import inspect

    from custom_components.casora import helfer, umstellen

    got = []
    real = umstellen.async_register_admin_service
    umstellen.async_register_admin_service = lambda hass, dom, name, *a, **k: got.append(name)
    try:
        await umstellen.async_setup_umstellen(SimpleNamespace(services=SimpleNamespace(
            async_register=lambda *a, **k: got.append("OHNE-ADMIN:" + a[1]), has_service=lambda *a: False)))
    finally:
        umstellen.async_register_admin_service = real
    check("SEC-02: umstellen als Admin-Dienst", got == ["umstellen"], repr(got))
    src = inspect.getsource(helfer)
    check("SEC-02: einrichten als Admin-Dienst", 'async_register_admin_service(hass, DOMAIN, "einrichten"' in src
          and 'hass.services.async_register(DOMAIN, "einrichten"' not in src)


async def t_py07():
    import custom_components.casora as integ

    removed = []

    async def _unload_platforms(entry, platforms):
        return True

    hass = SimpleNamespace(data={"casora": {}}, services=SimpleNamespace(async_remove=lambda d, n: removed.append(n)),
                           config_entries=SimpleNamespace(async_unload_platforms=_unload_platforms))
    real = integ.async_remove_panel
    integ.async_remove_panel = lambda *a, **k: None
    try:
        await integ.async_unload_entry(hass, SimpleNamespace(entry_id="e1"))
    finally:
        integ.async_remove_panel = real
    check("B-PY-07: Dienste beim Entladen entfernt", {"einrichten", "umstellen"} <= set(removed), repr(removed))


async def t_py08():
    from custom_components.casora import helfer

    handlers, cancelled, scheduled = [], [], []
    hass = SimpleNamespace(bus=SimpleNamespace(async_listen=lambda ev, cb: handlers.append(cb) or (lambda: None)))
    real = helfer._legacy_automation, helfer._any_playing, helfer.async_call_later
    helfer._legacy_automation = lambda *a: False
    helfer._any_playing = lambda h: False

    def later(h, delay, fn):
        scheduled.append(fn)
        return lambda: cancelled.append(fn)

    helfer.async_call_later = later
    runtime = {"unsub": []}
    try:
        helfer._setup_automatik(hass, runtime)
        n0 = len(runtime["unsub"])
        eid = helfer.RESTART_DONE[0]
        for _ in range(5):
            handlers[0](SimpleNamespace(data={"entity_id": eid, "new_state": SimpleNamespace(state="on")}))
    finally:
        helfer._legacy_automation, helfer._any_playing, helfer.async_call_later = real
    check("B-PY-08: Abmelder-Liste wächst nicht", len(runtime["unsub"]) == n0, f"{n0} → {len(runtime['unsub'])}")
    check("B-PY-08: alter Zeitgeber wird ersetzt", len(scheduled) == 5 and len(cancelled) == 4)
    for u in runtime["unsub"]:
        u()
    check("B-PY-08: Entladen bricht den offenen Zeitgeber ab", len(cancelled) == 5)


async def t_py13():
    import hashlib
    import json

    from custom_components.casora import card_updates, update_source

    good = json.dumps({"id": "karten-2", "format": 1, "items": []}).encode()
    rels = [{"tag": "karten-3", "url": "u3", "package": {"stamp": "3:a", "size": 10, "id": 3}},
            {"tag": "karten-2", "url": "u2", "package": {"stamp": "2:a", "size": len(good), "id": 2,
                                                         "sha256": hashlib.sha256(good).hexdigest()}}]

    async def releases(h, prefix):
        return rels

    async def download(h, asset, limit):
        if asset["id"] == 3:
            raise update_source.UpdateSourceError("not_found", 404)
        return good

    cu = object.__new__(card_updates.CardUpdates)
    cu.hass = None
    cu._data = {"auto": False, "applied": [], "packages": {}, "rejected": {}}

    async def _load():
        return cu._data

    cu._load = _load
    real = card_updates.fetch_card_releases, card_updates.download_card
    card_updates.fetch_card_releases, card_updates.download_card = releases, download
    try:
        await cu._fetch({})
        err = None
    except Exception as e:  # noqa: BLE001
        err = e
    finally:
        card_updates.fetch_card_releases, card_updates.download_card = real
    check("B-PY-13: kein Abbruch der ganzen Abfrage", err is None, repr(err))
    check("B-PY-13: gültiges Paket trotzdem geladen", "karten-2" in cu._data["packages"], repr(cu._data))
    check("B-PY-13: kaputtes Release abgelehnt", "karten-3" in cu._data["rejected"])


async def t_py14():
    from custom_components.casora import ki

    fired, ran = [], []
    runner = object.__new__(ki.KiRunner)
    runner.hass = SimpleNamespace(bus=SimpleNamespace(async_fire=lambda ev, data: fired.append((ev, data))))
    runner.entry = SimpleNamespace(options={})
    runner._bg = lambda coro: (ran.append(1), coro.close())
    real = ki.ai_entity
    ki.ai_entity = lambda *a, **k: None
    try:
        await runner._camera(SimpleNamespace(data={"entity_id": "camera.x"}))
        await runner._plant(SimpleNamespace(data={"plant": "plant.y"}))
    finally:
        ki.ai_entity = real
    check("B-PY-14: kein KI-Ablauf gestartet", not ran)
    check("B-PY-14: Kamera-Fehler mit Grund", fired and fired[0] == ("casora_cam_ai_result", {
        "entity_id": "camera.x", "status": "error", "error": ki.NO_AI}), repr(fired[:1]))
    check("B-PY-14: Pflanzen-Fehler mit Grund", len(fired) == 2 and fired[1][1].get("error") == ki.NO_AI
          and fired[1][1].get("plant") == "plant.y", repr(fired[1:]))


async def t_py15():
    from custom_components.casora import ki

    clim = SimpleNamespace(state="heat", attributes={"temperature": 70, "current_temperature": 68})
    hass = SimpleNamespace(config=SimpleNamespace(units=SimpleNamespace(temperature_unit="°F")),
                           states=SimpleNamespace(get=lambda eid: clim if eid == "climate.a" else None))

    async def none(*a, **k):
        return {}

    real = ki.heating_rooms, ki.heating_hours, ki._stats, ki._outdoor
    ki.heating_rooms = lambda h: [{"id": "climate.a", "n": "Bad", "t": None, "win": []}]
    ki.heating_hours, ki._stats = none, none
    ki._outdoor = lambda *a: None
    try:
        text, _ = await ki.heating_context(hass, SimpleNamespace(options={}))
    finally:
        ki.heating_rooms, ki.heating_hours, ki._stats, ki._outdoor = real
    check("B-PY-15: Soll/Ist in °F", "Soll 70 °F, Ist 68 °F" in text and "°C" not in text, text)


def t_py17():
    import json
    import tempfile
    import threading
    import time

    from custom_components.casora import templates

    cfg = tempfile.mkdtemp()
    for rel in (templates.SOURCE, templates.SOURCE_MOBILE):
        os.makedirs(os.path.dirname(os.path.join(cfg, rel)), exist_ok=True)
        open(os.path.join(cfg, rel), "w").write("x")
    os.makedirs(os.path.join(cfg, templates.TEMPLATE_DIR), exist_ok=True)
    os.makedirs(os.path.dirname(os.path.join(cfg, templates.BUNDLE)), exist_ok=True)
    big = {"templates": {f"t{i}": {"x": "y" * 200} for i in range(3000)}, "scaffold": {"a": 1}, "mobile": {}}
    real_build, real_dump = templates._build, templates.json.dump

    def slow_dump(obj, fh, **k):
        # Halb schreiben, warten, Rest schreiben – so überschneiden sich zwei Läufe sicher.
        text = json.dumps(obj, **k)
        fh.write(text[: len(text) // 2])
        fh.flush()
        time.sleep(0.05)
        fh.write(text[len(text) // 2:])

    templates._build = lambda *a: big
    templates.json.dump = slow_dump
    errs = []

    def run():
        try:
            templates.rebuild_if_stale(cfg)
        except Exception as e:  # noqa: BLE001
            errs.append(e)

    try:
        ts = [threading.Thread(target=run) for _ in range(2)]
        for t in ts:
            t.start()
        for t in ts:
            t.join()
    finally:
        templates._build, templates.json.dump = real_build, real_dump
    try:
        ok = len(json.load(open(os.path.join(cfg, templates.BUNDLE)))["templates"]) == 3000
    except ValueError as e:
        ok, errs = False, errs + [e]
    left = [f for f in os.listdir(os.path.dirname(os.path.join(cfg, templates.BUNDLE))) if f.endswith(".tmp")]
    check("B-PY-17: Bundle nach zwei gleichzeitigen Abrufen heil", ok and not errs and not left, repr((errs, left)))


async def t_py18():
    import threading

    from custom_components.casora import hemma_cleanup

    seen = []

    class Repos:
        @property
        def list_all(self):
            seen.append(threading.current_thread() is threading.main_thread())
            return [SimpleNamespace(data=SimpleNamespace(full_name="willsanderson/Hemma", id=5, installed=True, domain="hemma"))]

    loop = asyncio.get_running_loop()
    hass = SimpleNamespace(data={"hacs": SimpleNamespace(repositories=Repos())},
                           async_add_executor_job=lambda fn, *a: loop.run_in_executor(None, fn, *a))
    got = await hemma_cleanup.async_hacs_repo(hass, "/nirgends")
    check("B-PY-18: HACS-Liste im Event-Loop gelesen", seen == [True] and got and got["id"] == "5", repr((seen, got)))


async def main():
    await t_py18()
    t_py17()
    await t_py15()
    await t_py14()
    await t_py13()
    await t_py08()
    await t_py07()
    await t_sec02()
    await t_py06()
    await t_py04()
    await t_py05()


asyncio.run(main())
print("\nALLES OK" if not fails else f"\n{len(fails)} FEHLER")
sys.exit(1 if fails else 0)
