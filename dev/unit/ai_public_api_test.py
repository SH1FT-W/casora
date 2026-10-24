"""Casora talks to AI only through public HA APIs (HACS review, hacs/default#12143, point 5).

  ~/.cache/ha-venv/<version>/bin/python dev/unit/ai_public_api_test.py
  uv run --python 3.14 --with homeassistant python dev/unit/ai_public_api_test.py

Before, ki.py listed models through the SDK clients in other integrations' runtime_data and created
AI tasks inside their config entries. Now: the model comes from the device registry (or a name the
user typed), the call goes through the service ai_task.generate_data, and without a choice in Casora
HA's preferred AI task answers (entity_id left out).
"""

from __future__ import annotations

import inspect
import logging
import os
import re
import sys
import tempfile
import unittest
import warnings
from types import MappingProxyType

warnings.simplefilter("ignore")
try:
    import homeassistant  # noqa: F401
except ImportError:
    print("ai_public_api_test: homeassistant is not installed - run it with the Python of tools/ha-venv.sh")
    sys.exit(2)

import voluptuous as vol

from homeassistant import bootstrap, config_entries, loader
from homeassistant.core import HomeAssistant, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

import homeassistant.components  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)
from custom_components.casora import ki, options  # noqa: E402

PKG = os.path.join(ROOT, "custom_components", "casora")
COMPONENTS = os.path.dirname(homeassistant.components.__file__)
logging.basicConfig(level=logging.CRITICAL)


def _entry(domain: str, opts: dict | None = None) -> config_entries.ConfigEntry:
    vals = {"domain": domain, "title": domain, "data": {}, "options": opts or {}, "source": "user", "version": 1,
            "minor_version": 1, "unique_id": None, "discovery_keys": MappingProxyType({}), "subentries_data": None}
    sig = inspect.signature(config_entries.ConfigEntry)
    return config_entries.ConfigEntry(**{n: vals.get(n) for n, p in sig.parameters.items()
                                         if p.kind == p.KEYWORD_ONLY and p.default is inspect.Parameter.empty})


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def _py_sources():
    for base, _dirs, files in os.walk(PKG):
        for name in files:
            if name.endswith(".py"):
                path = os.path.join(base, name)
                yield os.path.relpath(path, ROOT), _read(path)


class Static(unittest.TestCase):
    """Grep over the whole integration: nothing reaches into other integrations' objects."""

    def test_no_runtime_data(self):
        hits = [f"{p}:{n}" for p, src in _py_sources() for n, line in enumerate(src.split("\n"), 1)
                if re.search(r"\.runtime_data\b|getattr\([^)]*[\"']runtime_data[\"']", line)]
        self.assertEqual(hits, [], "Casora must not use runtime_data (it has none; other entries' belong to them)")

    def test_no_foreign_ai_internals(self):
        bad = re.compile(r"homeassistant\.components\.(anthropic|openai_conversation|google_generative_ai_conversation"
                         r"|open_router|ollama)\b|ai_task\.const|DATA_PREFERENCES|async_add_subentry|async_update_subentry"
                         r"|\.subentries\b|models\.list\(")
        hits = [f"{p}:{n}: {line.strip()}" for p, src in _py_sources() for n, line in enumerate(src.split("\n"), 1)
                if bad.search(line)]
        self.assertEqual(hits, [])

    def test_ki_hass_data_only_own(self):
        src = _read(os.path.join(PKG, "ki.py"))
        keys = re.findall(r"hass\.data\[([^\]]+)\]", src)
        self.assertTrue(all(k == "DOMAIN" for k in keys), keys)


class HAReality(unittest.TestCase):
    """What the model detection relies on in HA's AI integrations (device registry, OpenRouter titles)."""

    def read(self, *parts):
        return _read(os.path.join(COMPONENTS, *parts))

    def test_device_model_set(self):
        for domain in ("anthropic", "openai_conversation", "google_generative_ai_conversation", "ollama"):
            src = self.read(domain, "entity.py")
            m = re.search(r"DeviceInfo\((.*?)\n\s*\)", src, re.S)
            self.assertIsNotNone(m, domain)
            self.assertIn("model=", m.group(1), domain)

    def test_open_router_title_is_model_name(self):
        self.assertIn("title=self.models[user_input[CONF_MODEL]].name", self.read("open_router", "config_flow.py"))

    def test_no_preferred_error_text(self):
        """ki.ask_ai retries with the first AI task on exactly this error (no choice, no HA preference)."""
        self.assertIn("no preferred entity set", self.read("ai_task", "task.py"))

    def test_generate_data_feature_bit(self):
        """ki._first_ai_task picks AI tasks with supported_features bit 1 (public state attribute)."""
        from homeassistant.components.ai_task import AITaskEntityFeature
        self.assertEqual(int(AITaskEntityFeature.GENERATE_DATA), 1)

    def test_generate_data_entity_optional(self):
        self.assertRegex(self.read("ai_task", "services.py"), r"Optional\(ATTR_ENTITY_ID\)")


class Real(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.hass = HomeAssistant(self._dir.name)
        loader.async_setup(self.hass)
        self.hass.config_entries = config_entries.ConfigEntries(self.hass, {})
        await bootstrap.async_load_base_functionality(self.hass)
        self.casora = _entry("casora")
        self.hass.config_entries._entries[self.casora.entry_id] = self.casora
        self.calls: list[dict] = []
        self.preferred: str | None = None

        async def generate(call):
            data = dict(call.data)
            self.calls.append(data)
            if "entity_id" not in data and not self.preferred:
                raise HomeAssistantError("No entity_id provided and no preferred entity set")
            return {"data": {"name": "Suppe", "minutes": 30, "reason": "kalt"}, "conversation_id": "x"}

        # Same contract as HA's service: entity_id optional, a single entity id.
        schema = vol.Schema({vol.Required("task_name"): cv.string, vol.Optional("entity_id"): cv.entity_id,
                             vol.Required("instructions"): cv.string, vol.Optional("structure"): dict,
                             vol.Optional("attachments"): list})
        self.hass.services.async_register("ai_task", "generate_data", generate, schema=schema,
                                          supports_response=SupportsResponse.ONLY)

    async def asyncTearDown(self) -> None:
        await self.hass.async_stop(force=True)
        self._dir.cleanup()

    def ai_task(self, platform: str, uid: str, *, model=None, model_id=None, name="AI Task") -> str:
        ce = _entry(platform)
        self.hass.config_entries._entries[ce.entry_id] = ce
        dev = dr.async_get(self.hass).async_get_or_create(
            config_entry_id=ce.entry_id, identifiers={(platform, uid)}, name=name, model=model, model_id=model_id,
            entry_type=dr.DeviceEntryType.SERVICE)
        ent = er.async_get(self.hass).async_get_or_create("ai_task", platform, uid, device_id=dev.id,
                                                          config_entry=ce, suggested_object_id=uid)
        self.hass.states.async_set(ent.entity_id, "unknown", {"friendly_name": name, "supported_features": 1})
        return ent.entity_id

    def opts(self, **kw):
        self.hass.config_entries.async_update_entry(self.casora, options=kw)

    # ── Model detection ─────────────────────────────────────────────────────────────────────────────
    async def test_model_from_device(self):
        a = self.ai_task("anthropic", "claude", model="Claude Sonnet 4.5", model_id="claude-sonnet-4-5")
        g = self.ai_task("google_generative_ai_conversation", "gem", model="gemini-2.5-flash")
        models = {m["entity_id"]: m for m in ki.ai_models(self.hass)}
        self.assertTrue(models[a]["ok"])
        self.assertEqual((models[a]["model"], models[a]["source"]), ("claude-sonnet-4-5", "device"))
        self.assertFalse(models[g]["ok"])
        self.assertEqual(models[g]["model"], "gemini-2.5-flash")

    async def test_model_from_open_router_title(self):
        e = self.ai_task("open_router", "or1", name="Anthropic: Claude Sonnet 4.5")
        m = ki.ai_models(self.hass)[0]
        self.assertEqual((m["entity_id"], m["ok"], m["source"], m["label"]), (e, True, "title", "Claude Sonnet 4.5"))

    async def test_model_by_name(self):
        """Device tells nothing: weak until the user types the model name (Studio → Settings → AI)."""
        e = self.ai_task("open_router", "or2", name="My AI")
        self.assertFalse(ki.ai_models(self.hass)[0]["ok"])
        self.opts(ai_task_models={e: "openai/gpt-5"})
        m = ki.ai_models(self.hass)[0]
        self.assertEqual((m["ok"], m["source"], m["typed"], m["model"]), (True, "typed", "openai/gpt-5", "openai/gpt-5"))

    async def test_casora_ki_from_before_still_found(self):
        """An AI task the old "Set up Casora AI" button created stays an ordinary AI task with its device model."""
        self.ai_task("anthropic", "weak", model="Claude Haiku 4.5", model_id="claude-haiku-4-5", name="Claude")
        e = self.ai_task("anthropic", "casora", model="Claude Sonnet 4.5", model_id="claude-sonnet-4-5", name="Casora KI")
        best = next(m for m in ki.ai_models(self.hass) if m["ok"])
        self.assertEqual(best["entity_id"], e)

    # ── Options (migration of what is stored) ───────────────────────────────────────────────────────
    async def test_options_keep_and_clean(self):
        cur = {"ai_task_entity": "ai_task.claude"}
        out = options.build_options(self.hass, cur, {"ai_task_entity": "ai_task.claude"})
        self.assertEqual(out, {"ai_task_entity": "ai_task.claude"}, "the old setting stays as it is")
        out = options.build_options(self.hass, cur, {**cur, "ai_task_models": {"ai_task.x": "  openai/gpt-5 ",
                                                                              "sensor.y": "z", "ai_task.e": ""}})
        self.assertEqual(out["ai_task_models"], {"ai_task.x": "openai/gpt-5"})
        kept = options.build_options(self.hass, out, {"ai_task_entity": "ai_task.claude"})
        self.assertEqual(kept["ai_task_models"], {"ai_task.x": "openai/gpt-5"}, "HA's dialog does not send it")
        cleared = options.build_options(self.hass, out, {**cur, "ai_task_models": {}})
        self.assertNotIn("ai_task_models", cleared)
        with self.assertRaises(options.OptionsError):
            options.build_options(self.hass, cur, {"ai_task_models": "gpt-5"})

    async def test_typed_models_need_no_reload(self):
        from custom_components.casora import live_only
        self.assertTrue(live_only({}, {"ai_task_models": {"ai_task.x": "gpt-5"}}))

    # ── Calls through ai_task.generate_data ─────────────────────────────────────────────────────────
    async def test_ask_chosen(self):
        self.ai_task("anthropic", "a")
        b = self.ai_task("anthropic", "b")
        self.opts(ai_task_entity=b)
        res = await ki.ask_ai(self.hass, self.casora, "T", "I", {})
        self.assertEqual(self.calls[-1]["entity_id"], b)
        self.assertEqual(res["name"], "Suppe")

    async def test_ask_single(self):
        a = self.ai_task("ollama", "only")
        await ki.ask_ai(self.hass, self.casora, "T", "I", {})
        self.assertEqual(self.calls[-1]["entity_id"], a)

    async def test_ask_preferred(self):
        """Several AI tasks, no choice: entity_id stays out, HA's preferred one answers."""
        self.ai_task("anthropic", "a")
        self.ai_task("anthropic", "b")
        self.preferred = "ai_task.b"
        await ki.ask_ai(self.hass, self.casora, "T", "I", {})
        self.assertEqual(len(self.calls), 1)
        self.assertNotIn("entity_id", self.calls[0])

    async def test_ask_no_preference_falls_back(self):
        a = self.ai_task("anthropic", "a")
        self.ai_task("anthropic", "b")
        await ki.ask_ai(self.hass, self.casora, "T", "I", {})
        self.assertEqual([c.get("entity_id") for c in self.calls], [None, a])

    async def test_ask_without_ai(self):
        with self.assertRaises(ValueError):
            await ki.ask_ai(self.hass, self.casora, "T", "I", {})
        self.assertFalse(ki.ai_available(self.hass, self.casora))

    async def run_flow(self, name: str, variables: dict) -> list:
        """A ki/*.yaml flow through HA's script engine with Casora's service casora.ai_generate."""
        from homeassistant.helpers.script import Script

        ki.register_ai_generate(self.hass)
        fired = []
        self.hass.bus.async_listen("casora_recipe_result", lambda ev: fired.append(dict(ev.data)))
        seqs = await ki._load_sequences(self.hass)
        script = Script(self.hass, seqs[name], "test", "casora", script_mode="parallel")
        await script.async_run(run_variables=variables, context=None)
        await self.hass.async_block_till_done()
        return fired

    BASE = {"weather_entity": "", "idea_sensor": "", "cookidoo": False, "hinweise": "", "sprache": "Deutsch"}

    async def test_yaml_flow_chosen(self):
        self.ai_task("anthropic", "a")
        b = self.ai_task("anthropic", "b")
        fired = await self.run_flow("rezept", {**self.BASE, "ai_web_entity": b})
        self.assertEqual([c.get("entity_id") for c in self.calls], [b])
        call = self.calls[-1]
        self.assertEqual(call["task_name"], "Casora Rezept der Woche")
        self.assertIn("Antworte auf Deutsch", call["instructions"])
        self.assertIn("ingredients", call["structure"])
        self.assertEqual(fired[-1]["status"], "done")
        self.assertEqual(fired[-1]["result"]["name"], "Suppe")

    async def test_yaml_flow_preferred(self):
        """No AI chosen in Casora: entity_id stays out, HA's preferred AI task answers."""
        self.ai_task("anthropic", "a")
        self.ai_task("anthropic", "b")
        self.preferred = "ai_task.b"
        fired = await self.run_flow("rezept", {**self.BASE, "ai_web_entity": None})
        self.assertEqual([c.get("entity_id") for c in self.calls], [None])
        self.assertEqual(fired[-1]["status"], "done")

    async def test_yaml_flow_no_preference_first_ai_task(self):
        """Neither Casora nor HA name an AI: the first suitable AI task, as before (not an error)."""
        weak = self.ai_task("anthropic", "a0_no_data")
        self.hass.states.async_set(weak, "unknown", {"supported_features": 0})  # cannot generate data
        a = self.ai_task("anthropic", "b1")
        self.ai_task("anthropic", "c2")
        fired = await self.run_flow("rezept", {**self.BASE, "ai_web_entity": None})
        self.assertEqual([c.get("entity_id") for c in self.calls], [None, a])
        self.assertEqual(fired[-1]["status"], "done")

    async def test_yaml_flow_without_ai(self):
        fired = await self.run_flow("rezept", {**self.BASE, "ai_web_entity": None})
        self.assertEqual(self.calls, [])
        self.assertEqual(fired[-1]["status"], "error")

    def test_flows_use_casora_service(self):
        """Every AI call in ki/*.yaml goes through casora.ai_generate (same fallback as ask_ai)."""
        base = os.path.join(PKG, "ki")
        for name in os.listdir(base):
            if name.endswith(".yaml"):
                src = _read(os.path.join(base, name))
                self.assertNotIn("action: ai_task.generate_data", src, name)

if __name__ == "__main__":
    unittest.main(verbosity=1)
