"""Assist shows the matching Casora popup (assist_show.py): HA's own agent and LLM agents, against the real HA package.

  uv run --python 3.14 --with homeassistant --with hassil --with home-assistant-intents --with gazetteer-matcher python dev/unit/assist_show_ha_test.py

HA assumptions (docs/ha-annahmen.md "Assist zeigt das passende Popup"): a "conversation" sentence trigger set up
through helpers.trigger (async_validate_trigger_config + async_initialize_triggers) is matched by HA's default agent
before its own intents; the trigger variables carry id, slots (wildcards), sentence and user_input (language,
context.user_id); a ScriptRunResult the action returns is the spoken answer. llm.async_register_api registers an
API whose tool gets llm_context.context and .language. Casora's chat then fetches the target with
casora/assist/take, once. A small real HA: registries, conversation set up without http (no server, no pip).
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
        await A.async_setup_assist_show(hass, None)
        await hass.async_block_till_done()
        self.user = "user-1"
        self.ctx = Context(user_id=self.user)

    async def asyncTearDown(self) -> None:
        A.async_unload_assist_show(self.hass)
        await self.hass.async_stop(force=True)
        self._dir.cleanup()

    async def say(self, text: str, lang: str = "de") -> str:
        from homeassistant.components import conversation

        res = await conversation.async_converse(self.hass, text, None, self.ctx, language=lang)
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
