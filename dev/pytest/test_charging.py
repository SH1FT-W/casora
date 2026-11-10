"""Chargers near the car (issue 168, charging.py): asked only on demand and with a key, one answer per place for
half an hour, the key never in the log, in a state or in an answer, search around the car when it is away.

  uv run --python 3.14 --with pytest-homeassistant-custom-component pytest dev/pytest/test_charging.py -q

No real requests: aioclient_mock answers /v3/poi with invented chargers.
"""

from __future__ import annotations

import logging

from ha_common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from test_setup import _setup, http, panel  # noqa: F401 – fixtures for the full start
from test_tanken import Clock, _ws

DOMAIN = "casora"
KEY = "12345678-abcd-4ef0-9876-0123456789ab"
OTHER = "87654321-dcba-4fe0-6789-ba9876543210"


def _answer(lat: float = 50.0, lng: float = 8.0) -> list:
    """Invented chargers around the place (as /v3/poi with compact=false, verbose=false)."""
    def poi(i, title, dlat, kw, cur):
        return {"ID": i, "StatusTypeID": 50, "NumberOfPoints": 2,
                "AddressInfo": {"Title": title, "AddressLine1": "Teststraße " + str(i), "Town": "Musterstadt",
                                "Latitude": lat + dlat, "Longitude": lng},
                "Connections": [{"ConnectionTypeID": 33, "StatusTypeID": 50, "PowerKW": kw, "CurrentTypeID": cur}]}
    return [poi(1, "Rathaus", 0.01, 22, 20), poi(2, "Autohof", 0.04, 300, 30), poi(3, "Markt", 0.02, 50, 30)]


async def _charging(hass: HomeAssistant, clock: Clock | None = None):
    from custom_components.casora.charging import Charging  # noqa: PLC0415

    hass.config.latitude, hass.config.longitude = 50.0, 8.0
    ch = Charging(hass, now=clock or Clock())
    await ch.async_load()
    return ch


def _car(hass: HomeAssistant, name: str = "Testauto") -> tuple[str, str]:
    """A car device with a battery level and a tracker; returns device id and tracker entity."""
    entry = MockConfigEntry(domain="test")
    entry.add_to_hass(hass)
    dev = dr.async_get(hass).async_get_or_create(config_entry_id=entry.entry_id, identifiers={("test", name)}, name=name)
    reg = er.async_get(hass)
    slug = name.lower()
    reg.async_get_or_create("sensor", "test", f"{slug}_soc", device_id=dev.id, suggested_object_id=f"{slug}_battery_level")
    tr = reg.async_get_or_create("device_tracker", "test", f"{slug}_pos", device_id=dev.id, suggested_object_id=f"{slug}_position")
    return dev.id, tr.entity_id


async def test_without_a_key_nothing_is_asked(hass: HomeAssistant, aioclient_mock) -> None:
    ch = await _charging(hass)
    res = await ch.async_list(None)
    assert res["ready"] is False and res["stations"] == [] and res["error"] is None
    assert aioclient_mock.call_count == 0


async def test_one_request_per_place_then_the_cache(hass: HomeAssistant, aioclient_mock) -> None:
    from custom_components.casora.charging import API_URL, CACHE, MAX_RESULTS  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    clock = Clock()
    ch = await _charging(hass, clock)
    await ch.async_set({"key": KEY, "radius": 15})

    res = await ch.async_list(None)
    assert res["ready"] and res["origin"] == "home" and res["radius"] == 15.0 and res["updated"]
    assert [s["n"] for s in res["stations"]] == ["Rathaus", "Markt", "Autohof"]
    assert aioclient_mock.call_count == 1
    # The key travels in a header, never in the address; the search is limited.
    method, url, _data, headers = aioclient_mock.mock_calls[0]
    assert headers["X-API-Key"] == KEY and KEY not in str(url)
    assert url.query["distance"] == "15" and url.query["distanceunit"] == "KM"
    assert url.query["maxresults"] == str(MAX_RESULTS) and url.query["latitude"] == "50.00000"

    # Every further popup within half an hour reads the cache.
    for _ in range(5):
        clock.t += 60
        await ch.async_list(None)
    assert aioclient_mock.call_count == 1
    clock.t += CACHE
    await ch.async_list(None)
    assert aioclient_mock.call_count == 2


async def test_search_around_the_car_when_it_is_away(hass: HomeAssistant, aioclient_mock) -> None:
    from custom_components.casora.charging import API_URL, MIN_GAP  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer(51.0, 9.0))
    clock = Clock()
    ch = await _charging(hass, clock)
    await ch.async_set({"key": KEY})
    dev, tracker = _car(hass)

    hass.states.async_set(tracker, "home", {"latitude": 50.0, "longitude": 8.0})
    assert (await ch.async_list(dev))["origin"] == "home"
    hass.states.async_set(tracker, "not_home", {"latitude": 51.0, "longitude": 9.0})
    # A second place right after the first: not asked yet, and said so.
    res = await ch.async_list(dev)
    assert res["origin"] == "car" and res["error"] == "wait" and res["stations"] == []
    assert aioclient_mock.call_count == 1
    clock.t += MIN_GAP
    res = await ch.async_list(dev)
    assert res["origin"] == "car" and res["error"] is None and len(res["stations"]) == 3
    assert aioclient_mock.mock_calls[-1][1].query["latitude"] == "51.00000"
    # The answer names chargers, not where the car is.
    assert "51.0" not in repr({k: v for k, v in res.items() if k != "stations"})


async def test_a_failed_request_keeps_the_last_list(hass: HomeAssistant, aioclient_mock) -> None:
    from custom_components.casora.charging import API_URL, CACHE  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    clock = Clock()
    ch = await _charging(hass, clock)
    await ch.async_set({"key": KEY})
    assert len((await ch.async_list(None))["stations"]) == 3
    aioclient_mock.clear_requests()
    aioclient_mock.get(API_URL, status=500)
    clock.t += CACHE + 1
    res = await ch.async_list(None)
    assert len(res["stations"]) == 3 and res["error"] is None
    assert ch.status["ok"] is False and ch.status["code"] == "http"


async def test_key_never_in_log_state_or_answer(hass: HomeAssistant, http, panel, aioclient_mock, caplog) -> None:  # noqa: F811
    from custom_components.casora import charging, settings  # noqa: PLC0415

    caplog.set_level(logging.DEBUG)
    aioclient_mock.get(charging.API_URL, status=403, text="Invalid API key.")
    hass.config.latitude, hass.config.longitude = 50.0, 8.0
    await _setup(hass)
    res = await _ws(hass, charging.ws_set, {"type": "casora/charging/set", "key": KEY})
    assert res["key_set"] is True and "key" not in res
    lst = await _ws(hass, charging.ws_list, {"type": "casora/charging/list"})
    assert lst["ready"] is True and lst["error"] == "key" and lst["stations"] == []
    hass.data[DOMAIN]["charging"]._last_request = 0.0
    test = await _ws(hass, charging.ws_test, {"type": "casora/charging/test", "key": OTHER})
    assert test["ok"] is False and test["code"] == "key"
    got = await _ws(hass, charging.ws_get, {"type": "casora/charging/get"})
    assert got["status"]["ok"] is False

    log = "\n".join(r.getMessage() for r in caplog.records if not r.name.startswith("pytest_homeassistant"))
    blob = repr([s.as_dict() for s in hass.states.async_all()]) + repr(got) + repr(test) + repr(lst) + log
    assert KEY not in blob and OTHER not in blob
    assert "request failed" in log
    assert KEY not in repr(await _ws(hass, settings.ws_get, {"type": "casora/settings/get"}))
    # A wrong format is refused, removing the key turns it off.
    bad = await _ws(hass, charging.ws_set, {"type": "casora/charging/set", "key": "nope"})
    assert "error" in bad
    off = await _ws(hass, charging.ws_set, {"type": "casora/charging/set", "key": ""})
    assert off["key_set"] is False


async def test_test_request_from_the_studio(hass: HomeAssistant, aioclient_mock) -> None:
    from custom_components.casora.charging import API_URL  # noqa: PLC0415

    aioclient_mock.get(API_URL, json=_answer())
    clock = Clock()
    ch = await _charging(hass, clock)
    assert (await ch.async_test("kein-schluessel"))["code"] == "format"
    r = await ch.async_test(KEY)
    assert r["ok"] and r["count"] == 3 and r["nearest"] == 1.1
    # Right again: wait a moment, no second request.
    assert (await ch.async_test(KEY))["code"] == "wait"
    assert aioclient_mock.call_count == 1
