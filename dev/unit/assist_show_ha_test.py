"""Assist shows the matching Casora popup (assist_show.py): HA's own agent and LLM agents, against the real HA package.

  uv run --python 3.14 --with homeassistant --with hassil --with home-assistant-intents --with gazetteer-matcher python dev/unit/assist_show_ha_test.py

HA assumptions (docs/ha-annahmen.md "Assist zeigt das passende Popup"): a "conversation" sentence trigger set up
through helpers.trigger (async_validate_trigger_config + async_initialize_triggers) is matched by HA's default agent
before its own intents; the trigger variables carry id, slots (wildcards), sentence and user_input (language,
context.user_id); a ScriptRunResult the action returns is the spoken answer. llm.async_register_api registers an
API whose tool gets llm_context.context and .language. Casora's chat then fetches the target with
casora/assist/take, once. A small real HA: registries, conversation set up without http (no server, no pip).

Review fixes: answers only see entities exposed to Assist (homeassistant.async_should_expose, "conversation"), a
request without a user (a satellite) included; the sentences follow the dashboards' switch (re-read on
lovelace_updated; the dashboards themselves are dashboards_state(), tested in assist_show_test.py); "lights in the
house" is one trigger; no Casora sentence is one HA's own intents understand ("show me the weather" stays HA's); a
broken part of the setup never fails Casora's setup.
"""

from __future__ import annotations

import logging
import os
import sys
import tempfile
import unittest
import warnings
from types import SimpleNamespace
from unittest.mock import MagicMock

warnings.simplefilter("ignore")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from homeassistant import bootstrap, config_entries, loader  # noqa: E402
from homeassistant.const import __version__ as HA_VERSION  # noqa: E402
from homeassistant.core import Context, HomeAssistant  # noqa: E402
from homeassistant.helpers import area_registry as ar  # noqa: E402
from homeassistant.helpers import entity_registry as er  # noqa: E402
from homeassistant.helpers import llm  # noqa: E402
from homeassistant.setup import async_setup_component  # noqa: E402

from custom_components.casora import assist_show as A  # noqa: E402

logging.basicConfig(level=logging.CRITICAL)


class AssistShow(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        hass = self.hass = HomeAssistant(self._dir.name)
        loader.async_setup(hass)
        hass.config_entries = config_entries.ConfigEntries(hass, {})
        await bootstrap.async_load_base_functionality(hass)
        hass.config.skip_pip = True
        hass.config.language = "de"
        # conversation needs http only for its REST view: a stand-in, no server.
        hass.http = MagicMock()
        hass.config.components.add("http")
        self.assertTrue(await async_setup_component(hass, "homeassistant", {}))
        self.assertTrue(await async_setup_component(hass, "conversation", {}))
        areg, ereg = ar.async_get(hass), er.async_get(hass)
        bad, wohn, garten = areg.async_create("Badezimmer"), areg.async_create("Wohnzimmer"), areg.async_create("Garten")
        for uid, area, value in (("t_bad", bad, "23.4"), ("t_wohn", wohn, "21.0"), ("t_garten", garten, "30.0")):
            e = ereg.async_get_or_create("sensor", "test", uid, suggested_object_id=uid)
            ereg.async_update_entity(e.entity_id, area_id=area.id)
            hass.states.async_set(e.entity_id, value, {"device_class": "temperature", "unit_of_measurement": "°C",
                                                       "friendly_name": uid})
        for uid, state in (("deckenlicht", "on"), ("stehlampe", "off")):
            e = ereg.async_get_or_create("light", "test", uid, suggested_object_id=uid)
            ereg.async_update_entity(e.entity_id, area_id=wohn.id)
            hass.states.async_set(e.entity_id, state, {"friendly_name": uid.capitalize()})
        hass.states.async_set("camera.haustuer", "idle", {"friendly_name": "Haustür"})
        # Cameras are not exposed to Assist by default; this one is (Settings > Voice assistants > Expose).
        from homeassistant.components.homeassistant.exposed_entities import async_expose_entity

        async_expose_entity(hass, "conversation", "camera.haustuer", True)
        self.expose = lambda eid, on=True: async_expose_entity(hass, "conversation", eid, on)
        # The dashboards (Lovelace is not set up here): what dashboards_state() would say.
        self.dash = (True, {})

        async def dashboards(_hass):
            return self.dash

        self._orig_dash = getattr(A, "_async_dashboards", None)
        A._async_dashboards = dashboards
        await A.async_setup_assist_show(hass, None)
        await hass.async_block_till_done()
        self.user = "user-1"
        self.ctx = Context(user_id=self.user)

    async def asyncTearDown(self) -> None:
        A._async_dashboards = self._orig_dash
        A.async_unload_assist_show(self.hass)
        await self.hass.async_stop(force=True)
        self._dir.cleanup()

    async def say(self, text: str, lang: str = "de", ctx: Context | None = None) -> str:
        from homeassistant.components import conversation

        res = await conversation.async_converse(self.hass, text, None, ctx or self.ctx, language=lang)
        return res.response.speech.get("plain", {}).get("speech", "")

    def take(self):
        """casora/assist/take as the chat calls it, for self.user."""
        out = {}
        conn = SimpleNamespace(user=SimpleNamespace(id=self.user), send_result=lambda i, r: out.update(r=r))
        handler = self.hass.data["websocket_api"]["casora/assist/take"][0]
        handler(self.hass, conn, {"id": 1, "type": "casora/assist/take"})
        return out["r"]["target"]

    async def test_warmest_room(self) -> None:
        # The garden (outdoors) does not count; the bathroom with 23.4 °C is the warmest room.
        self.assertEqual(await self.say("Wo ist es gerade am wärmsten?"),
                         "Am wärmsten ist es gerade im Raum Badezimmer mit 23,4 °C.")
        t = self.take()
        self.assertEqual((t["view"], t["area"], t["entity_id"]), ("climate", "Badezimmer", "sensor.t_bad"))
        self.assertIsNone(self.take(), "taken once")
        self.assertEqual(await self.say("which room is the coldest", "en"),
                         "The coldest room right now is Wohnzimmer at 21 °C.")

    async def test_lights_and_camera(self) -> None:
        self.assertEqual(await self.say("Zeig mir die Lichter im Wohnzimmer"), "Im Raum Wohnzimmer sind 1 von 2 Lichtern an.")
        self.assertEqual(self.take()["view"], "lights")
        self.assertEqual(await self.say("Zeig mir alle Lichter"), "1 von 2 Lichtern sind an.")
        self.assertEqual(self.take(), {"view": "lights"})
        self.assertEqual(await self.say("Zeig mir die Kamera an der Haustür"), "Hier ist die Kamera Haustür.")
        self.assertEqual(self.take(), {"view": "camera", "entity_id": "camera.haustuer"})

    async def test_lights_in_the_house_one_trigger(self) -> None:
        # Review: "Lichter im Haus" also fit the room sentence ("Ich kenne keinen Raum „Haus“"), and a room
        # "Gartenhaus" answered instead. One trigger, the house words decide.
        ar.async_get(self.hass).async_create("Gartenhaus")
        for text in ("Zeig mir die Lichter im Haus", "zeig mir die lichter im ganzen haus"):
            self.assertEqual(await self.say(text), "1 von 2 Lichtern sind an.", text)
            self.assertEqual(self.take(), {"view": "lights"}, text)
        self.assertEqual(await self.say("show me the lights in the whole house", "en"), "1 of 2 lights are on.")

    def test_no_sentence_fits_two_triggers(self) -> None:
        # HA runs every trigger whose sentence matches; Casora's must not overlap (hassil, as HA's default agent).
        from hassil import Intents, WildcardSlotList, recognize_all

        intents = Intents.from_dict({"language": "de", "intents": {
            k: {"data": [{"sentences": v}]} for k, v in A.SENTENCES.items()}})
        intents.slot_lists.update({n: WildcardSlotList(n) for n in ("area", "name")})
        for text in ("zeig mir die lichter im haus", "zeig mir alle lichter im wohnzimmer", "zeig mir die lichter im bad",
                     "show me the lights in the house", "show me all lights", "zeig mir die haustür kamera",
                     "zeig mir die kamera an der haustür", "zeig mir das raumklima im bad", "zeig mir den raum bad",
                     "was hat die waschmaschine heute verbraucht", "ist alles zu", "zeig mir das wetter",
                     "wo ist es gerade am wärmsten", "show me the climate in the kitchen"):
            hits = {r.intent.name for r in recognize_all(text, intents)}
            self.assertEqual(len(hits), 1, f"{text}: {hits}")

    async def test_only_exposed_entities(self) -> None:
        # Review: locks and cameras are not exposed by default; a satellite (no user) asking "ist alles zu" must
        # not learn which door is unlocked, nor the LLM.
        hass = self.hass
        hass.states.async_set("lock.haustuer", "unlocked", {"friendly_name": "Haustür"})
        e = er.async_get(hass).async_get_or_create("binary_sensor", "test", "fenster", suggested_object_id="fenster")
        hass.states.async_set(e.entity_id, "on", {"device_class": "window", "friendly_name": "Küchenfenster"})
        await hass.async_block_till_done()
        satellite = Context()
        self.assertEqual(await self.say("ist alles zu", ctx=satellite), "1 offen: Küchenfenster.")
        self.assertEqual(await self.say("is everything locked", "en", ctx=satellite), "1 open: Küchenfenster.")
        self.expose("lock.haustuer")
        self.assertEqual(await self.say("ist alles zu", ctx=satellite), "2 offen: Küchenfenster, Haustür.")
        self.expose("camera.haustuer", False)
        self.assertEqual(await self.say("Zeig mir die Kamera an der Haustür"), "Ich finde keine Kamera „Haustür“.")
        self.assertIsNone(self.take())
        # Temperatures too: an unexposed sensor does not count.
        self.expose("sensor.t_bad", False)
        self.assertEqual(await self.say("Wo ist es gerade am wärmsten?"),
                         "Am wärmsten ist es gerade im Raum Wohnzimmer mit 21 °C.")
        ctx = llm.LLMContext(platform="test", context=satellite, language="en", assistant="conversation", device_id=None)
        api = await llm.async_get_api(hass, A.API_ID, ctx)
        out = await api.async_call_tool(llm.ToolInput(tool_name="casora_show", tool_args={"view": "camera", "name": "haustür"}))
        self.assertEqual(getattr(out, "data", out)["shown"], False, "the LLM gets no unexposed camera")

    async def test_who_sees_this(self) -> None:
        # Casora's "Who sees this?" of a tile limits the answer too.
        self.dash = (True, {"light.deckenlicht": {"someone-else"}})
        self.hass.bus.async_fire("lovelace_updated", {"url_path": "casora"})
        await self.hass.async_block_till_done()
        self.assertEqual(await self.say("Zeig mir alle Lichter"), "0 von 1 Lichtern sind an.")

    async def test_switch_turns_sentences_off(self) -> None:
        # Review: the Studio switch (or no Casora dashboard with the Assist button) removes the sentences from HA's
        # Assist for everyone; switching it on again (a dashboard save) brings them back.
        self.dash = (False, {})
        self.hass.bus.async_fire("lovelace_updated", {"url_path": "casora"})
        await self.hass.async_block_till_done()
        self.assertNotEqual(await self.say("Wo ist es gerade am wärmsten?"),
                            "Am wärmsten ist es gerade im Raum Badezimmer mit 23,4 °C.")
        self.assertIsNone(self.take())
        self.dash = (True, {})
        self.hass.bus.async_fire("lovelace_updated", {"url_path": "casora"})
        await self.hass.async_block_till_done()
        self.assertEqual(await self.say("Wo ist es gerade am wärmsten?"),
                         "Am wärmsten ist es gerade im Raum Badezimmer mit 23,4 °C.")

    async def test_weather_stays_ha(self) -> None:
        # "show me the weather" is HA's HassGetWeather: Casora does not take it over.
        self.assertTrue(await async_setup_component(self.hass, "weather", {}))
        self.hass.states.async_set("weather.home", "sunny", {"temperature": 10, "friendly_name": "Home"})
        self.assertFalse((await self.say("show me the weather", "en")).startswith("It is"))
        self.assertIsNone(self.take())

    async def test_setup_never_fails(self) -> None:
        # Review: a change in HA under any part (llm dataclasses, schema, websocket) only costs this feature.
        A.async_unload_assist_show(self.hass)
        orig = A._api

        def broken(_hass):
            raise TypeError("llm.API changed")

        A._api = broken
        try:
            await A.async_setup_assist_show(self.hass, None)
            self.assertEqual(await self.say("Zeig mir alle Lichter"), "1 von 2 Lichtern sind an.", "sentences still work")
            orig_ws = A._register_ws
            A._register_ws = broken
            self.hass.data["casora"].pop("assist_ws", None)
            try:
                await A.async_setup_assist_show(self.hass, None)   # does not raise
            finally:
                A._register_ws = orig_ws
                self.hass.data["casora"]["assist_ws"] = True
        finally:
            A._api = orig

    async def test_other_requests_stay_ha(self) -> None:
        await self.say("Wie spät ist es?")
        self.assertIsNone(self.take())

    async def test_llm_tool(self) -> None:
        ctx = llm.LLMContext(platform="test", context=self.ctx, language="en", assistant="conversation", device_id=None)
        api = await llm.async_get_api(self.hass, A.API_ID, ctx)
        self.assertEqual([t.name for t in api.tools], ["casora_show"])
        out = await api.async_call_tool(llm.ToolInput(tool_name="casora_show",
                                                      tool_args={"view": "lights", "area": "wohnzimmer"}))
        data = getattr(out, "data", out)
        self.assertEqual(data, {"answer": "1 of 2 lights are on in Wohnzimmer.", "shown": True})
        self.assertEqual(self.take()["area"], "Wohnzimmer")

    async def test_unload_removes_sentences(self) -> None:
        A.async_unload_assist_show(self.hass)
        await self.say("Wo ist es gerade am wärmsten?")
        self.assertIsNone(self.take())
        await A.async_setup_assist_show(self.hass, None)


if __name__ == "__main__":
    print(f"HA {HA_VERSION}", flush=True)
    ok = unittest.main(verbosity=2, exit=False).result.wasSuccessful()
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0 if ok else 1)
