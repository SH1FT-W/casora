"""AI task model detection for gateways (forum 23.10.2026: OpenRouter with Claude Sonnet 4.5 counted as no AI).

  uv run --python 3.14 --with homeassistant python dev/unit/ki_modell_gateway_test.py

OpenRouter puts the vendor in front of the model. Its AI task device names no model, but the
subentry title (= device name) is the model name; ai_public_api_test.py checks that against HA.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import ki  # noqa: E402

assert ki.model_rank("open_router", "anthropic/claude-sonnet-4.5") == (245, "Claude Sonnet 4.5")
assert ki.model_rank("open_router", "openai/gpt-5")[0] > 0
assert ki.model_rank("open_router", "openai/gpt-5-mini")[0] == 0
assert ki.model_rank("open_router", "anthropic/claude-sonnet-4")[0] == 0
assert ki.model_rank("anthropic", "claude-sonnet-4-5")[0] == 245
# Review 23.10.2026: gpt-oss is a small open model; its "20b"/"120b" is no GPT version.
assert ki.model_rank("ollama", "gpt-oss:20b")[0] == 0
assert ki.model_rank("open_router", "openai/gpt-oss-120b")[0] == 0
assert ki.model_rank("openai_conversation", "gpt-5")[0] == 200
print("ok model_rank with vendor prefix")

# The model comes from the device registry (public API), never from the integration's config entry.
# OpenRouter's device has no model; its title is the model name ("Anthropic: Claude Sonnet 4.5").
ent = SimpleNamespace(platform="open_router", device_id="d1")
dev = SimpleNamespace(model=None, model_id=None, name="Anthropic: Claude Sonnet 4.5", name_by_user=None)
hass = SimpleNamespace(
    states=SimpleNamespace(async_entity_ids=lambda d: ["ai_task.openrouter"],
                           get=lambda e: SimpleNamespace(attributes={"friendly_name": "OpenRouter"})),
)
real_er, real_dr = ki.er.async_get, ki.dr.async_get
ki.er.async_get = lambda h: SimpleNamespace(async_get=lambda e: ent)
ki.dr.async_get = lambda h: SimpleNamespace(async_get=lambda d: dev)
try:
    models = ki.ai_models(hass)
finally:
    ki.er.async_get, ki.dr.async_get = real_er, real_dr
assert models[0]["ok"] and models[0]["source"] == "title" and models[0]["label"] == "Claude Sonnet 4.5", models
print("ok OpenRouter model from the device name")
