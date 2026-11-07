"""AI jobs for your own assistant over MCP (ai_jobs.py, issue #131) in a real HA core, without an ai_task.

  uv run --python 3.14 --with homeassistant python dev/unit/ai_jobs_test.py

With the AI option "mcp" ki.generate() queues a job instead of calling ai_task.generate_data, fires
casora_ai_job and waits; casora.ai_jobs lists it readably, casora.ai_answer checks and resolves it,
casora.ai_cancel drops it. Duplicates share a job, the queue is capped, no answer ends in a clear error.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import os
import sys
import tempfile
import unittest
import warnings
from datetime import timedelta
from types import MappingProxyType, SimpleNamespace

warnings.simplefilter("ignore")
try:
    import homeassistant  # noqa: F401
except ImportError:
    print("ai_jobs_test: homeassistant is not installed - run it with uv (see above)")
    sys.exit(2)

from homeassistant import bootstrap, config_entries, loader
from homeassistant.core import HomeAssistant, SupportsResponse, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from custom_components.casora import ai_jobs, ki, options, sensor  # noqa: E402

logging.basicConfig(level=logging.CRITICAL)

PLANT = ("Casora Pflanzen-Doktor Ficus", "Prüfe die Pflanze.", {
    "zustand": {"required": True, "selector": {"select": {"options": ["gut", "beobachten", "handeln"]}}},
    "fazit": {"required": True, "selector": {"text": {}}},
    "tipps": {"selector": {"text": {"multiple": True}}},
})


def _entry(domain: str, opts: dict | None = None) -> config_entries.ConfigEntry:
    vals = {"domain": domain, "title": domain, "data": {}, "options": opts or {}, "source": "user", "version": 1,
            "minor_version": 1, "unique_id": None, "discovery_keys": MappingProxyType({}), "subentries_data": None}
    sig = inspect.signature(config_entries.ConfigEntry)
    return config_entries.ConfigEntry(**{n: vals.get(n) for n, p in sig.parameters.items()
                                         if p.kind == p.KEYWORD_ONLY and p.default is inspect.Parameter.empty})


class Answers(unittest.TestCase):
    """validate_answer and the readable schema, without HA."""

    def test_required_and_options(self):
        _, errors = ai_jobs.validate_answer(PLANT[2], {"zustand": "super"})
        self.assertEqual(errors, ["zustand must be one of gut, beobachten, handeln", "fazit is required"])

    def test_clean(self):
        out, errors = ai_jobs.validate_answer(PLANT[2], {"zustand": "gut", "fazit": "Passt.", "tipps": "Gießen",
                                                         "extra": 1})
        self.assertEqual(errors, [])
        self.assertEqual(out, {"zustand": "gut", "fazit": "Passt.", "tipps": ["Gießen"]}, "unknown keys dropped")

    def test_types(self):
        st = {"ok": {"required": True, "selector": {"boolean": {}}}, "n": {"selector": {"number": {}}}}
        self.assertEqual(ai_jobs.validate_answer(st, {"ok": "yes"})[1], ["ok must be true or false"])
        self.assertEqual(ai_jobs.validate_answer(st, {"ok": False, "n": "30"})[0], {"ok": False, "n": 30.0})
        self.assertEqual(ai_jobs.validate_answer(st, {"ok": True, "n": "lang"})[1], ["n must be a number"])
        self.assertEqual(ai_jobs.validate_answer(st, {"ok": True, "n": "nan"})[1], ["n must be a number"])
        self.assertEqual(ai_jobs.validate_answer(st, {"ok": True, "n": "inf"})[1], ["n must be a number"])
        self.assertEqual(ai_jobs.validate_answer(st, ["x"])[1], ["data must be an object"])

    def test_whitespace_is_missing(self):
        _, errors = ai_jobs.validate_answer(PLANT[2], {"zustand": "gut", "fazit": "   "})
        self.assertEqual(errors, ["fazit is required"])

    def test_free_text(self):
        self.assertEqual(ai_jobs.validate_answer(None, {"text": "Hallo"}), ("Hallo", []))
        self.assertTrue(ai_jobs.validate_answer(None, {"x": 1})[1])

    def test_readable(self):
        f = ai_jobs.readable_fields(PLANT[2])
        self.assertEqual(f["zustand"], {"type": "one of", "required": True, "options": ["gut", "beobachten", "handeln"]})
        self.assertEqual(f["tipps"], {"type": "text list", "required": False})
        att = ai_jobs.readable_attachments([{"media_content_id": "media-source://camera/camera.door",
                                             "media_content_type": "image/jpeg"}])
        self.assertEqual(att[0]["camera_entity"], "camera.door")
        self.assertIn("camera", att[0]["hint"])

    def test_restart_turns_running_into_error(self):
        out = sensor.lost_jobs({"status": "running", "pflanzen": [{"id": "plant.a", "status": "running"},
                                                                    {"id": "plant.b", "status": "done"}]})
        self.assertEqual((out["status"], out["fehler"]), ("error", ai_jobs.LOST))
        self.assertEqual([p["status"] for p in out["pflanzen"]], ["error", "done"])


class Real(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self._dir.name)
        loader.async_setup(self.hass)
        self.hass.config_entries = config_entries.ConfigEntries(self.hass, {})
        await bootstrap.async_load_base_functionality(self.hass)
        self.casora = _entry("casora", {"ai_task_entity": ai_jobs.AI_MCP})
        self.hass.config_entries._entries[self.casora.entry_id] = self.casora
        self.ai_calls: list = []

        async def generate(call):  # an ai_task that must not be asked in MCP mode
            self.ai_calls.append(dict(call.data))
            return {"data": {}}

        self.hass.services.async_register("ai_task", "generate_data", generate, supports_response=SupportsResponse.ONLY)
        self.hass.states.async_set("ai_task.claude", "unknown", {"supported_features": 1})
        self.events: list = []
        self.hass.bus.async_listen(ai_jobs.EVENT_JOB, callback(lambda ev: self.events.append(dict(ev.data))))
        ki.register_ai_generate(self.hass)
        ai_jobs.async_setup_ai_jobs(self.hass)
        # Python 3.14 logs "exception in shielded future" through the loop handler, not the logger:
        # a timed-out or cancelled job must not end up there (it is expected, not a crash).
        self.loop_errors: list = []
        self.hass.loop.set_exception_handler(lambda loop, ctx: self.loop_errors.append(ctx))

    async def asyncTearDown(self) -> None:
        await self.hass.async_stop(force=True)
        self._dir.cleanup()

    async def svc(self, name: str, data: dict | None = None) -> dict:
        return await self.hass.services.async_call("casora", name, data or {}, blocking=True, return_response=True)

    async def wait_jobs(self, n: int = 1) -> list:
        for _ in range(50):
            jobs = (await self.svc("ai_jobs"))["jobs"]
            if len(jobs) >= n:
                return jobs
            await asyncio.sleep(0.01)
        self.fail("no job queued")

    async def test_available_without_ai_task(self):
        self.hass.states.async_remove("ai_task.claude")
        self.assertTrue(ki.ai_available(self.hass, self.casora))
        self.assertEqual(ki.ai_entity(self.hass, self.casora, web=True), ai_jobs.AI_MCP, "web features too")

    async def test_ask_waits_for_answer(self):
        task = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        jobs = await self.wait_jobs()
        self.assertEqual((jobs[0]["task_name"], jobs[0]["instructions"]), PLANT[:2])
        self.assertEqual(jobs[0]["fields"]["zustand"]["options"], ["gut", "beobachten", "handeln"])
        self.assertEqual(self.events[0]["job_id"], jobs[0]["job_id"])
        bad = await self.svc("ai_answer", {"job_id": jobs[0]["job_id"], "data": {"zustand": "gut"}})
        self.assertEqual((bad["ok"], bad["errors"]), (False, ["fazit is required"]))
        self.assertFalse(task.done(), "a wrong answer keeps the job open")
        ok = await self.svc("ai_answer", {"job_id": jobs[0]["job_id"], "data": {"zustand": "gut", "fazit": "Passt."}})
        self.assertTrue(ok["ok"])
        self.assertEqual(await task, {"zustand": "gut", "fazit": "Passt."})
        self.assertEqual(self.ai_calls, [], "no ai_task call in MCP mode")
        self.assertEqual((await self.svc("ai_jobs"))["jobs"], [])
        again = await self.svc("ai_answer", {"job_id": jobs[0]["job_id"], "data": {}})
        self.assertFalse(again["ok"])

    async def test_explicit_ai_task_still_used(self):
        """The Studio's own AI steps pass the strongest ai_task explicitly: no job, the AI task answers."""
        await ki.ask_ai(self.hass, self.casora, "T", "I", {}, entity="ai_task.claude")
        self.assertEqual(len(self.ai_calls), 1)
        self.assertEqual(ai_jobs.jobs_for(self.hass).jobs, {})

    async def test_duplicate_shares_job(self):
        a = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        await self.wait_jobs()
        b = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        await asyncio.sleep(0.01)
        jobs = (await self.svc("ai_jobs"))["jobs"]
        self.assertEqual(len(jobs), 1)
        await self.svc("ai_answer", {"job_id": jobs[0]["job_id"], "data": {"zustand": "handeln", "fazit": "Gießen."}})
        self.assertEqual((await a)["zustand"], "handeln")
        self.assertEqual((await b)["zustand"], "handeln")
        self.assertEqual(len(self.events), 1)

    async def test_queue_cap(self):
        ai_jobs.jobs_for(self.hass).limit = 2
        tasks = [asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, "T", f"I{i}", PLANT[2])) for i in range(2)]
        await self.wait_jobs(2)
        with self.assertRaises(HomeAssistantError) as ctx:
            await ki.ask_ai(self.hass, self.casora, "T", "I9", PLANT[2])
        self.assertEqual(str(ctx.exception), ai_jobs.FULL)
        for t in tasks:
            t.cancel()

    async def test_timeout(self):
        ai_jobs.jobs_for(self.hass).timeout = timedelta(seconds=0.05)
        with self.assertRaises(HomeAssistantError) as ctx:
            await ki.ask_ai(self.hass, self.casora, *PLANT)
        self.assertEqual(str(ctx.exception), ai_jobs.TIMEOUT)
        self.assertEqual(ai_jobs.jobs_for(self.hass).jobs, {})
        for _ in range(3):
            await asyncio.sleep(0)
        self.assertEqual(self.loop_errors, [], "a timeout is expected, no loop error")

    async def test_cancelled_caller_logs_no_loop_error(self):
        task = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        await self.wait_jobs()
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        for _ in range(3):
            await asyncio.sleep(0)
        self.assertEqual(self.loop_errors, [], "a cancelled caller is expected, no loop error")
        self.assertEqual(ai_jobs.jobs_for(self.hass).jobs, {}, "nobody waits any more: the job goes")

    async def test_duplicate_survives_first_cancel(self):
        """The second caller of a shared job keeps waiting when the first one is stopped."""
        a = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        await self.wait_jobs()
        b = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        await asyncio.sleep(0.01)
        a.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await a
        jobs = (await self.svc("ai_jobs"))["jobs"]
        self.assertEqual(len(jobs), 1, "the job stays for the second caller")
        await self.svc("ai_answer", {"job_id": jobs[0]["job_id"], "data": {"zustand": "gut", "fazit": "Ok."}})
        self.assertEqual((await b)["zustand"], "gut")

    async def test_cancel(self):
        task = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        jobs = await self.wait_jobs()
        self.assertTrue((await self.svc("ai_cancel", {"job_id": jobs[0]["job_id"]}))["ok"])
        with self.assertRaises(HomeAssistantError):
            await task
        self.assertFalse((await self.svc("ai_cancel", {"job_id": "nope"}))["ok"])

    async def test_feature_reports_timeout(self):
        """A Python feature (aquarium doctor) reports the timeout as its error, like any other AI error."""
        ai_jobs.jobs_for(self.hass).timeout = timedelta(seconds=0.05)
        self.hass.states.async_set("sensor.tank", "25.1", {"unit_of_measurement": "°C"})
        fired = []
        self.hass.bus.async_listen("casora_aquarium_ai_result", callback(lambda ev: fired.append(dict(ev.data))))

        async def ctx(hass, data):
            return "Becken: Test"

        orig = ki.aquarium_context
        ki.aquarium_context = ctx
        try:
            await ki.run_aquarium(self.hass, self.casora, {"temp": "sensor.tank"})
        finally:
            ki.aquarium_context = orig
        await self.hass.async_block_till_done()
        self.assertEqual([f["status"] for f in fired], ["running", "error"])
        self.assertEqual(fired[-1]["error"], ai_jobs.TIMEOUT)

    async def test_yaml_flow(self):
        """A ki/*.yaml flow (recipe) waits in HA's script engine for the answer, with entity_id "mcp"."""
        from homeassistant.helpers.script import Script

        fired = []
        self.hass.bus.async_listen("casora_recipe_result", callback(lambda ev: fired.append(dict(ev.data))))
        seqs = await ki._load_sequences(self.hass)
        script = Script(self.hass, seqs["rezept"], "test", "casora", script_mode="parallel")
        run = asyncio.ensure_future(script.async_run(run_variables={
            "weather_entity": "", "idea_sensor": "", "cookidoo": False, "hinweise": "", "sprache": "Deutsch",
            "ai_web_entity": ki.ai_entity(self.hass, self.casora, web=True)}, context=None))
        jobs = await self.wait_jobs()
        self.assertEqual(jobs[0]["task_name"], "Casora Rezept der Woche")
        self.assertEqual(jobs[0]["fields"]["minutes"]["type"], "number")
        res = await self.svc("ai_answer", {"job_id": jobs[0]["job_id"],
                                           "data": {"name": "Kürbissuppe", "minutes": 40, "reason": "Herbst"}})
        self.assertTrue(res["ok"], res)
        await run
        await self.hass.async_block_till_done()
        self.assertEqual(fired[-1]["status"], "done")
        self.assertEqual(fired[-1]["result"]["name"], "Kürbissuppe")
        self.assertEqual(self.ai_calls, [])

    async def test_yaml_flow_timeout(self):
        """No answer: casora.ai_generate raises a HomeAssistantError, continue_on_error lets the flow report error."""
        from homeassistant.helpers.script import Script

        ai_jobs.jobs_for(self.hass).timeout = timedelta(seconds=0.05)
        fired = []
        self.hass.bus.async_listen("casora_recipe_result", callback(lambda ev: fired.append(dict(ev.data))))
        seqs = await ki._load_sequences(self.hass)
        script = Script(self.hass, seqs["rezept"], "test", "casora", script_mode="parallel")
        await script.async_run(run_variables={"weather_entity": "", "idea_sensor": "", "cookidoo": False,
                                              "hinweise": "", "sprache": "Deutsch", "ai_web_entity": "mcp"},
                               context=None)
        await self.hass.async_block_till_done()
        self.assertEqual([f["status"] for f in fired], ["running", "error"])

    async def test_services_admin_response_only(self):
        for name in ai_jobs.SERVICES:
            self.assertEqual(self.hass.services.supports_response("casora", name), SupportsResponse.ONLY, name)
        src = inspect.getsource(ai_jobs.async_setup_ai_jobs)
        self.assertEqual(src.count("async_register_admin_service("), 3)

    async def test_unload_keeps_jobs_remove_fails_them(self):
        """Any unload may be a reload (also the integrations page's Reload): the jobs stay.
        Only removing Casora (async_remove_entry) fails them."""
        task = asyncio.ensure_future(ki.ask_ai(self.hass, self.casora, *PLANT))
        await self.wait_jobs()
        ai_jobs.async_unload_ai_jobs(self.hass)
        await asyncio.sleep(0.01)
        self.assertFalse(task.done(), "an unload (reload) keeps the job")
        ai_jobs.async_remove_ai_jobs(self.hass)
        with self.assertRaises(HomeAssistantError) as ctx:
            await task
        self.assertEqual(str(ctx.exception), ai_jobs.GONE)

    # ── Options ──────────────────────────────────────────────────────────────────────────────────────
    async def test_options(self):
        out = options.build_options(self.hass, {}, {"ai_task_entity": "mcp"})
        self.assertEqual(out, {"ai_task_entity": "mcp"})
        self.assertEqual(options.build_options(self.hass, {}, {"ai_task_web_entity": "ai_task.claude"}),
                         {"ai_task_web_entity": "ai_task.claude"})
        self.assertEqual(options.build_options(self.hass, {"ai_task_entity": "ai_task.gone"},
                                               {"ai_task_entity": "ai_task.gone"}),
                         {"ai_task_entity": "ai_task.gone"}, "a stored AI task stays valid while it is missing")
        for bad in ("sensor.x", "openai"):
            with self.assertRaises(options.OptionsError):
                options.build_options(self.hass, {}, {"ai_task_entity": bad})

    async def test_options_dialog_serializable(self):
        """HA's options dialog sends the schema to the frontend: the menu with "mcp" must serialize."""
        schema = options.options_schema(self.hass, {"ai_task_entity": "mcp"})
        try:  # HA 2026.11: probatio (helpers/data_entry_flow.py), before: voluptuous_serialize
            from probatio import to_field_list
        except ImportError:
            from voluptuous_serialize import convert as to_field_list
        ser = to_field_list(schema, custom_serializer=cv.custom_serializer)
        field = next(f for f in ser if f["name"] == "ai_task_entity")
        sel = field["selector"]["select"]
        self.assertEqual(sel["translation_key"], "ai_choice")
        self.assertEqual([o["value"] for o in sel["options"]], ["mcp", "ai_task.claude"])

    async def test_sensor_flag(self):
        s = sensor.KiSensor("pflanzen", SimpleNamespace(options={"ai_task_entity": "mcp"}))
        self.assertEqual(s.extra_state_attributes.get("assistent"), "mcp")
        web = sensor.KiSensor("rezept", SimpleNamespace(options={"ai_task_entity": "mcp",
                                                                 "ai_task_web_entity": "ai_task.claude"}))
        self.assertNotIn("assistent", web.extra_state_attributes)


if __name__ == "__main__":
    unittest.main(verbosity=1)
