"""Tanken im Auto-Popup (1.2, tanken.py): Abruf-Takt, Schlüssel nie im Log/Zustand, Variante 1
(vorhandene Tankerkönig-Integration), Lernphase, Kraftstoff je Auto.

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest -q

Keine echten Abrufe: aioclient_mock beantwortet list.php mit erfundenen Stationen.
"""

from __future__ import annotations

import logging
import random
from datetime import timedelta

from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from test_setup import _setup, http, panel  # noqa: F401 – Fixtures für den vollen Start

DOMAIN = "casora"
KEY = "12345678-abcd-4ef0-9876-0123456789ab"
OTHER = "87654321-dcba-4fe0-6789-ba9876543210"


class Clock:
    def __init__(self) -> None:
        self.t = 1_800_000_000.0

    def __call__(self) -> float:
        return self.t


def _answer(lat: float = 50.0, lng: float = 8.0) -> dict:
    """Erfundene Stationen rund um den Standort (wie list.php mit type=all)."""
    return {"ok": True, "status": "ok", "stations": [
        {"id": "a", "name": "Tankstelle Am Feld", "brand": "Freie", "lat": lat + 0.01, "lng": lng, "dist": 1.1,
         "e5": 1.789, "e10": 1.729, "diesel": 1.659, "isOpen": True},
        {"id": "b", "name": "Autohof Testweg", "brand": "Autohof", "lat": lat, "lng": lng + 0.02, "dist": 1.4,
         "e5": 1.769, "e10": 1.709, "diesel": 1.689, "isOpen": True},
        {"id": "c", "name": "Nachttankstelle", "brand": "", "lat": lat - 0.01, "lng": lng, "dist": 1.1,
         "e5": 1.699, "e10": 1.649, "diesel": 1.599, "isOpen": False},
    ]}


def _car(hass: HomeAssistant, name: str, diesel: bool = False, tracker: bool = False) -> str:
    """Auto-Gerät mit Tankfüllstand (und optional AdBlue-Reichweite bzw. Standort)."""
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    dev = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", name)}, name=name)
    reg = er.async_get(hass)
    slug = name.lower().replace(" ", "_")
    reg.async_get_or_create("sensor", "test", f"{slug}_fuel", device_id=dev.id, suggested_object_id=f"{slug}_tankfullstand")
    reg.async_get_or_create("sensor", "test", f"{slug}_range", device_id=dev.id, suggested_object_id=f"{slug}_reichweite_kombiniert")
    if diesel:
        reg.async_get_or_create("sensor", "test", f"{slug}_scr", device_id=dev.id, suggested_object_id=f"{slug}_scr_reichweite")
    if tracker:
        reg.async_get_or_create("device_tracker", "test", f"{slug}_pos", device_id=dev.id, suggested_object_id=f"{slug}_position")
    return dev.id


async def _tanken(hass: HomeAssistant, clock: Clock | None = None):
    from custom_components.casora.tanken import Tanken  # noqa: PLC0415

    hass.config.latitude, hass.config.longitude = 50.0, 8.0
    tk = Tanken(hass, now=clock or Clock(), rnd=random.Random(1))
    await tk.async_load()
    return tk


# ── Abruf-Takt ───────────────────────────────────────────────────────────────

async def test_takt_hoechstens_eine_abfrage_je_5_minuten(hass: HomeAssistant, aioclient_mock) -> None:
    from custom_components.casora.tanken import API_URL, JITTER, MIN_INTERVAL, TARGET_INTERVAL, Tanken  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    clock = Clock()
    car = _car(hass, "Testauto")
    tk = await _tanken(hass, clock)
    await tk.async_set({"key": KEY, "cars": {car: "e10"}})

    await tk.async_tick()
    assert aioclient_mock.call_count == 1
    # Abfrage mit Umkreis ≤ 25 km und allen Kraftstoffen in einem Rutsch
    url = aioclient_mock.mock_calls[0][1]
    assert url.query["type"] == "all" and float(url.query["rad"]) <= 25

    # Danach jede Minute ein Takt: frühestens nach 10 Minuten (+ Zufallsversatz) wieder.
    asked = [clock.t]
    for _ in range(40):
        clock.t += 60
        await tk.async_tick()
        if aioclient_mock.call_count > len(asked):
            asked.append(clock.t)
    gaps = [b - a for a, b in zip(asked, asked[1:])]
    assert gaps, "kein zweiter Abruf in 40 Minuten"
    assert all(TARGET_INTERVAL <= g <= TARGET_INTERVAL + JITTER + 60 for g in gaps), gaps
    assert all(g >= MIN_INTERVAL for g in gaps)

    # Neustart: die Pause gilt weiter (letzte Abfrage steht im Speicher).
    tk2 = Tanken(hass, now=clock, rnd=random.Random(2))
    await tk2.async_load()
    clock.t = asked[-1] + 30
    assert not tk2.may_request()
    n = aioclient_mock.call_count
    await tk2.async_tick()
    assert aioclient_mock.call_count == n


async def test_takt_zwei_standorte_nie_schneller(hass: HomeAssistant, aioclient_mock) -> None:
    """Ein Auto unterwegs, eins zu Hause: zwei Standorte, trotzdem höchstens 1 Abfrage je 5 Minuten."""
    from custom_components.casora.tanken import API_URL, MIN_INTERVAL  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    clock = Clock()
    a = _car(hass, "Auto Eins", tracker=True)
    b = _car(hass, "Auto Zwei")
    hass.states.async_set("device_tracker.auto_eins_position", "not_home", {"latitude": 50.3, "longitude": 8.4})
    tk = await _tanken(hass, clock)
    await tk.async_set({"key": KEY, "cars": {a: "e10", b: "diesel"}})
    assert tk.origin(tk.cars()[0])[0] == "car"
    asked = []
    for _ in range(60):
        n = aioclient_mock.call_count
        await tk.async_tick()
        if aioclient_mock.call_count > n:
            asked.append(clock.t)
        clock.t += 60
    assert len(asked) >= 4
    assert all(y - x >= MIN_INTERVAL for x, y in zip(asked, asked[1:])), asked
    lats = {round(float(c[1].query["lat"]), 1) for c in aioclient_mock.mock_calls}
    assert lats == {50.0, 50.3}, lats


async def test_test_abruf_ohne_extra_abfrage(hass: HomeAssistant, aioclient_mock) -> None:
    """Test-Abruf: mit gespeichertem Schlüssel innerhalb von 5 Minuten aus dem letzten Ergebnis."""
    from custom_components.casora.tanken import API_URL  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    clock = Clock()
    car = _car(hass, "Testauto")
    tk = await _tanken(hass, clock)
    await tk.async_set({"key": KEY, "cars": {car: "e10"}})
    r = await tk.async_test(None)
    assert r["ok"] and r["count"] == 3 and r["cheapest"]["e10"] == 1.709
    assert aioclient_mock.call_count == 1
    clock.t += 60
    r = await tk.async_test(None)
    assert r["ok"] and r["cached"]
    await tk.async_tick()
    assert aioclient_mock.call_count == 1
    assert (await tk.async_test("kein-schluessel"))["code"] == "format"


# ── Schlüssel nie im Log oder Zustand ────────────────────────────────────────

async def _ws(hass: HomeAssistant, handler, msg: dict):
    """WebSocket-Befehl mit nachgebildeter Verbindung (Admin) – Ergebnis bzw. Fehler."""
    from unittest.mock import MagicMock  # noqa: PLC0415

    conn = MagicMock()
    conn.user.is_admin = True
    handler(hass, conn, {"id": 1, **msg})
    await hass.async_block_till_done()
    if conn.send_result.call_args:
        return conn.send_result.call_args.args[1]
    return {"error": conn.send_error.call_args.args[1:]}


async def test_schluessel_nie_im_log_oder_zustand(hass: HomeAssistant, http, panel, aioclient_mock, caplog) -> None:  # noqa: F811
    from custom_components.casora import settings, tanken  # noqa: PLC0415

    caplog.set_level(logging.DEBUG)
    aioclient_mock.get(tanken.API_URL, json={"ok": False, "status": "error",
                                             "message": f"apikey {KEY} nicht angegeben, falsch, oder im falschen Format"})
    hass.config.latitude, hass.config.longitude = 50.0, 8.0
    car = _car(hass, "Testauto")
    await _setup(hass)
    res = await _ws(hass, tanken.ws_set, {"type": "casora/tanken/set", "key": KEY, "cars": {car: "e10"}})
    assert res["key_set"] is True and "key" not in res
    await hass.data[DOMAIN]["tanken"].async_tick()
    await hass.async_block_till_done()
    test = await _ws(hass, tanken.ws_test, {"type": "casora/tanken/test", "key": OTHER})
    assert test["ok"] is False and test["code"] == "key"
    got = await _ws(hass, tanken.ws_get, {"type": "casora/tanken/get"})

    # Fehler kommt an, aber ohne Schlüssel
    st = hass.states.get("sensor.casora_tanken_testauto_e10")
    assert st is not None and st.attributes["error"]
    # Log ohne den Speicher-Nachbau des Test-Frameworks (der schreibt .storage-Inhalte ins Debug-Log).
    log = "\n".join(r.getMessage() for r in caplog.records if not r.name.startswith("pytest_homeassistant"))
    blob = repr([s.as_dict() for s in hass.states.async_all()]) + repr(got) + repr(test) + log
    assert KEY not in blob and OTHER not in blob
    assert "Abruf fehlgeschlagen" in log
    # Auch die Einstellungen, die jeder Nutzer lesen darf, enthalten ihn nicht.
    assert KEY not in repr(await _ws(hass, settings.ws_get, {"type": "casora/settings/get"}))


# ── Variante 1: vorhandene Tankerkönig-Integration ───────────────────────────

async def test_variante_1_nutzt_vorhandene_sensoren(hass: HomeAssistant, aioclient_mock) -> None:
    car = _car(hass, "Testauto")
    entry = MockConfigEntry(domain="tankerkoenig")
    entry.add_to_hass(hass)
    reg = er.async_get(hass)
    devs = dr.async_get(hass)
    for sid, name, e10, is_open, lat in (("s1", "Station Eins", 1.719, "on", 50.01), ("s2", "Station Zwei", 1.689, "off", 50.02)):
        dev = devs.async_get_or_create(config_entry_id=entry.entry_id, identifiers={("tankerkoenig", sid)}, name=name)
        e = reg.async_get_or_create("sensor", "tankerkoenig", f"{sid}_e10", device_id=dev.id, suggested_object_id=f"{sid}_super_e10")
        hass.states.async_set(e.entity_id, str(e10), {"fuel_type": "e10", "station_name": name, "brand": "Marke",
                                                      "latitude": lat, "longitude": 8.0, "unit_of_measurement": "EUR"})
        b = reg.async_get_or_create("binary_sensor", "tankerkoenig", f"{sid}_status", device_id=dev.id, suggested_object_id=f"{sid}_status")
        hass.states.async_set(b.entity_id, is_open)
    tk = await _tanken(hass)
    assert tk.source == "integration"
    await tk.async_set({"cars": {car: "e10"}})
    await tk.async_tick()
    assert aioclient_mock.call_count == 0, "mit Integration fragt Casora nicht selbst"
    d = tk.data_for(tk.wanted()[0])
    assert d["source"] == "integration"
    assert [s["n"] for s in d["stations"]] == ["Station Eins", "Station Zwei"]   # geschlossene ans Ende
    assert d["price"] == 1.719 and d["stations"][1]["o"] is False
    assert d["stations"][0]["d"] == 1.1
    p = tk.payload()
    assert p["source"] == "integration" and p["integration"]["stations"] == 2


async def test_ohne_einrichtung_keine_sensoren(hass: HomeAssistant) -> None:
    _car(hass, "Testauto")
    tk = await _tanken(hass)
    assert tk.source is None and tk.wanted() == []
    added = []
    tk.attach(added.extend)
    assert added == []


# ── Lernphase ────────────────────────────────────────────────────────────────

async def test_lernphase_bis_genug_tage(hass: HomeAssistant) -> None:
    from custom_components.casora.tanken import MIN_DAYS, add_sample, typical_day  # noqa: PLC0415

    now = dt_util.now().replace(hour=12, minute=0, second=0, microsecond=0)
    hist: dict = {}
    for d in range(3):
        for h in range(24):
            add_sample(hist, now - timedelta(days=d, hours=h), 1.70 + (0.05 if 6 <= h <= 12 else 0))
    t = typical_day(hist, now)
    assert t["days"] in (3, 4) and t["learn_days_left"] == MIN_DAYS - t["days"]
    for d in range(3, 10):
        add_sample(hist, now - timedelta(days=d), 1.70)
    t = typical_day(hist, now)
    assert t["learn_days_left"] == 0
    assert len(t["typical"]) == 24 and t["low"] == 1.7 and t["high"] >= 1.75
    # Älter als 14 Tage zählt nicht
    old: dict = {}
    for d in range(20, 30):
        add_sample(old, now - timedelta(days=d), 1.6)
    assert typical_day(old, now)["days"] == 0


async def test_messwerte_hoechstens_alle_10_minuten(hass: HomeAssistant, aioclient_mock) -> None:
    from custom_components.casora.tanken import API_URL  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    clock = Clock()
    car = _car(hass, "Testauto")
    tk = await _tanken(hass, clock)
    await tk.async_set({"key": KEY, "cars": {car: "e10"}})
    await tk.async_tick()
    for _ in range(5):
        tk.data_for(tk.wanted()[0])
    hist = tk.hist[f"{car}_e10"]
    assert sum(n for _s, n in hist.values()) == 1
    d = tk.data_for(tk.wanted()[0])
    assert d["learn_days_left"] > 0 and d["price"] == 1.709


# ── Kraftstoff je Auto ───────────────────────────────────────────────────────

async def test_kraftstoff_je_auto(hass: HomeAssistant, aioclient_mock) -> None:
    from custom_components.casora.tanken import API_URL  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    benzin = _car(hass, "Kleinwagen")
    diesel = _car(hass, "Kombi", diesel=True)
    tk = await _tanken(hass)
    cars = {c["device_id"]: c for c in tk.cars()}
    assert cars[diesel]["fuel_auto"] == "diesel" and cars[benzin]["fuel_auto"] == "e10"
    await tk.async_set({"key": KEY})
    added: list = []
    tk.attach(added.extend)
    assert sorted(s.car["fuel"] for s in added) == ["diesel", "e10"]
    await tk.async_tick()
    by = {c["device_id"]: tk.data_for(c) for c in tk.wanted()}
    assert by[diesel]["price"] == 1.659 and by[benzin]["price"] == 1.709   # geschlossene zählt nicht
    # Umstellen: Kleinwagen tankt E5, Kombi gar nicht.
    await tk.async_set({"cars": {benzin: "e5", diesel: "off"}})
    want = {c["device_id"]: c["fuel"] for c in tk.wanted()}
    assert want == {benzin: "e5"}
    assert set(tk.sensors) == {f"{DOMAIN}_tanken_{benzin}_e5"}
    assert tk.data_for(tk.wanted()[0])["price"] == 1.769


async def test_umkreis_begrenzt_und_schluessel_geprueft(hass: HomeAssistant) -> None:
    from custom_components.casora.tanken import TankenError, clamp_radius  # noqa: PLC0415

    assert clamp_radius(80) == 25 and clamp_radius(0) == 1 and clamp_radius("x") == 5
    tk = await _tanken(hass)
    try:
        await tk.async_set({"key": "abc"})
        raise AssertionError("ungültiger Schlüssel angenommen")
    except TankenError as err:
        assert err.code == "format"
    await tk.async_set({"key": KEY, "radius": 40})
    assert tk.cfg["radius"] == 25
    await tk.async_set({"key": ""})
    assert tk.source is None
