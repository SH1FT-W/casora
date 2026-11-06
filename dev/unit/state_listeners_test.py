"""Casora's state_changed listeners on HA's real event bus (no running HA, no config).

  uv run --python 3.14 --with homeassistant python dev/unit/state_listeners_test.py

Every state change in the house passes these listeners. Each one gets an event_filter, so a change
it does not care about never reaches it (HA then neither builds the Event nor runs the job), and
the work it does per relevant event stays small. Behaviour must stay the same.
"""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import warnings

warnings.simplefilter("ignore")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant.const import EVENT_STATE_CHANGED  # noqa: E402
from homeassistant.core import HomeAssistant  # noqa: E402

from custom_components.casora import helfer  # noqa: E402

FAILS: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    print(("ok   " if cond else "FAIL ") + name + (f"  ({detail})" if detail and not cond else ""))
    if not cond:
        FAILS.append(name)


def spy_listen(hass: HomeAssistant) -> list:
    """Live list of (job, event_filter) the bus holds for state_changed (HA's own, read only)."""
    return hass.bus._listeners.setdefault(EVENT_STATE_CHANGED, [])


async def new_hass() -> HomeAssistant:
    return HomeAssistant(tempfile.mkdtemp())


# ── HA: what every filter below relies on ────────────────────────────────────

async def t_bus_filter() -> None:
    """HA assumption: event_filter gets the event data before the listener; False skips the listener."""
    from homeassistant.core import callback

    hass = await new_hass()
    got: list = []
    asked: list = []

    @callback
    def flt(data) -> bool:
        asked.append(data["entity_id"])
        return data["entity_id"].startswith("media_player.")

    @callback
    def listener(event) -> None:
        got.append(event.data["entity_id"])

    unsub = hass.bus.async_listen(EVENT_STATE_CHANGED, listener, event_filter=flt)
    hass.states.async_set("sensor.power", "1")
    hass.states.async_set("media_player.tv", "on")
    await hass.async_block_till_done()
    unsub()
    check("HA: event_filter sees every state change's data", asked == ["sensor.power", "media_player.tv"], repr(asked))
    check("HA: only events the filter accepts reach the listener", got == ["media_player.tv"], repr(got))
    await hass.async_stop(force=True)


# ── helfer.py: restart switches and "expand the media row" ───────────────────

async def t_helfer() -> None:
    hass = await new_hass()
    selected: list = []

    async def select(call):
        selected.append(call.data["option"])

    async def turn_off(call):
        pass

    hass.services.async_register("input_select", "select_option", select)
    hass.services.async_register("input_boolean", "turn_off", turn_off)
    hass.states.async_set(helfer.EXPANDED_ROW, "none", {"options": ["none", "media"]})
    hass.states.async_set("media_player.kitchen", "paused", {"media_position": 1})
    hass.states.async_set("media_player.living", "idle")

    seen = spy_listen(hass)
    real = helfer._legacy_automation, helfer._any_playing
    helfer._legacy_automation = lambda *a: False
    scans: list = []

    def any_playing(h):
        scans.append(1)
        return real[1](h)

    helfer._any_playing = any_playing
    runtime = {"unsub": []}
    try:
        helfer._setup_automatik(hass, runtime)
        check("helfer: one state_changed listener with a filter", len(seen) == 1 and seen[0][1] is not None)
        flt = (seen[0][1] if seen else None) or (lambda d: True)
        check("helfer: filter lets media players and restart switches through",
              flt({"entity_id": "media_player.x"}) and flt({"entity_id": helfer.RESTART_DONE[0]}))
        check("helfer: filter drops everything else",
              not flt({"entity_id": "sensor.power"}) and not flt({"entity_id": "light.kitchen"})
              and not flt({"entity_id": "input_boolean.other"}))

        scans.clear()
        for i in range(20):  # a playing speaker updating its position: attributes only
            hass.states.async_set("media_player.kitchen", "paused", {"media_position": i + 2})
        hass.states.async_set("sensor.power", "12")
        await hass.async_block_till_done()
        check("helfer: attribute-only updates do not scan all players", not scans, f"{len(scans)} scans")
        check("helfer: nothing expanded while nothing plays", selected == [])

        hass.states.async_set("media_player.kitchen", "playing", {"media_position": 30})
        await hass.async_block_till_done()
        check("helfer: start of playback expands the media row", selected == ["media"], repr(selected))

        # Still playing (attributes only), then stops and starts again: expands once more.
        hass.states.async_set(helfer.EXPANDED_ROW, "none", {"options": ["none", "media"]})
        hass.states.async_set("media_player.kitchen", "playing", {"media_position": 31})
        await hass.async_block_till_done()
        check("helfer: no second expand while it keeps playing", selected == ["media"], repr(selected))
        hass.states.async_set("media_player.kitchen", "paused", {"media_position": 32})
        hass.states.async_set("media_player.living", "playing")
        await hass.async_block_till_done()
        check("helfer: another player starting expands again", selected == ["media", "media"], repr(selected))

        # A player that appears already playing counts (old_state None), like before.
        hass.states.async_set("media_player.living", "idle")
        hass.states.async_set(helfer.EXPANDED_ROW, "none", {"options": ["none", "media"]})
        hass.states.async_set("media_player.new", "playing")
        await hass.async_block_till_done()
        check("helfer: a new playing player expands", selected == ["media"] * 3, repr(selected))
    finally:
        helfer._legacy_automation, helfer._any_playing = real
        for u in runtime["unsub"]:
            u()
    await hass.async_stop(force=True)


# ── media_pause.py: "paused since" and "open since" ──────────────────────────

class MemStore:
    def __init__(self) -> None:
        self.data = None

    async def async_load(self):
        return self.data

    def async_delay_save(self, fn, delay) -> None:
        self.data = fn()


async def t_media_pause() -> None:
    from custom_components.casora.media_pause import PauseTracker

    hass = await new_hass()
    seen = spy_listen(hass)
    before = len(seen)
    pause = PauseTracker(hass, MemStore())
    await pause.async_start()
    mine = seen[before:]
    check("media_pause: one state_changed listener with a filter", len(mine) == 1 and mine[0][1] is not None)
    flt = (mine[0][1] if mine else None) or (lambda d: True)
    check("media_pause: filter lets media players and binary sensors through",
          flt({"entity_id": "media_player.tv"}) and flt({"entity_id": "binary_sensor.window"}))
    check("media_pause: filter drops everything else",
          not flt({"entity_id": "sensor.power"}) and not flt({"entity_id": "light.kitchen"}))

    hass.states.async_set("media_player.tv", "playing", {"media_title": "A"})
    hass.states.async_set("media_player.tv", "paused", {"media_title": "A"})
    hass.states.async_set("binary_sensor.window", "off", {"device_class": "window"})
    hass.states.async_set("binary_sensor.window", "on", {"device_class": "window"})
    hass.states.async_set("sensor.power", "5")
    await hass.async_block_till_done()
    check("media_pause: a pause is still remembered", "media_player.tv" in pause.players, repr(pause.players))
    check("media_pause: an open window is still remembered", "binary_sensor.window" in pause.contacts,
          repr(pause.contacts))
    hass.states.async_remove("media_player.tv")
    await hass.async_block_till_done()
    check("media_pause: a removed player is forgotten", "media_player.tv" not in pause.players)
    pause.stop()
    await hass.async_stop(force=True)


async def main() -> None:
    await t_bus_filter()
    await t_helfer()
    await t_media_pause()


asyncio.run(main())
if FAILS:
    print(f"\n{len(FAILS)} failed")
    sys.exit(1)
print("\nall ok")
