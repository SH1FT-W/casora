"""The cards' actions as services of the integration (actions.py), without a running HA.

  uv run --python 3.14 --with homeassistant python dev/unit/actions_test.py

HACS review (hacs/default#12143): Casora appended four scripts to scripts.yaml on every start. They are
casora.* services now. Same behaviour as the scripts: smart light toggle (remember the lamps that were on,
group members one by one, restore or plain on), the two overlay toggles (open, close on the same card,
switch to another card, taps dropped for 400 ms), the restart toggle (confirm, press, done, dismiss).
The caller's context is passed on; schemas refuse entities of the wrong domain.
"""

from __future__ import annotations

import asyncio
import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import actions  # noqa: E402

FAILS: list[str] = []


def check(cond, msg):
    if not cond:
        FAILS.append(msg)
        print("FAIL:", msg)


class Hass:
    def __init__(self, states):
        self._states = dict(states)
        self.calls = []
        self.registered = {}
        outer = self

        class Services:
            async def async_call(self, domain, service, data, blocking=False, context=None):
                outer.calls.append((domain, service, data, context))
                eid = data.get("entity_id")
                if (domain, service) == ("scene", "create"):
                    outer.set("scene." + data["scene_id"], "scening")
                elif service == "turn_off" and eid:
                    outer.set(eid, "off")
                elif service == "turn_on" and eid and not eid.startswith("scene."):
                    outer.set(eid, "on")
                elif (domain, service) == ("input_text", "set_value"):
                    outer.set(eid, data["value"])

            def has_service(self, domain, service):
                return (domain, service) in outer.registered

            def async_register(self, domain, service, handler, schema=None):
                outer.registered[(domain, service)] = (handler, schema)

        self.services = Services()
        self.states = SimpleNamespace(get=lambda e: self._states.get(e))

    def set(self, eid, state, **attrs):
        self._states[eid] = SimpleNamespace(state=state, attributes=attrs)


def st(state, **attrs):
    return SimpleNamespace(state=state, attributes=attrs)


CTX = object()


def call(**data):
    return SimpleNamespace(data=data, context=CTX)


def short(calls):
    return [(d, s, x) for d, s, x, _c in calls]


# Registration and schemas
h = Hass({})
actions.async_setup_actions(h)
check({s for _, s in h.registered} == set(actions.SERVICES), f"services: {h.registered}")
check(actions.FORMER_SCRIPTS == ("script.casora_light_smart_toggle", "script.casora_thermostat_overlay_toggle",
                                 "script.casora_actions_overlay_toggle", "script.casora_restart_toggle"),
      "former script names")


def refused(schema, data):
    try:
        schema(data)
    except Exception:  # noqa: BLE001 - vol.Invalid (probatio in HA 2026.10)
        return True
    return False


check(refused(actions.LIGHT_SCHEMA, {"light_entity": "switch.x"}), "light toggle only for lights")
check(not refused(actions.LIGHT_SCHEMA, {"light_entity": "light.kitchen"}), "light accepted")
check(refused(actions.RESTART_SCHEMA, {"button_entity": "switch.x", "helper_entity": "input_boolean.a"}),
      "restart only presses buttons")
check(not refused(actions.RESTART_SCHEMA, {"button_entity": "button.r", "helper_entity": "input_boolean.a",
                                           "done_entity": None}), "done_entity may be empty (card sends null)")
check(refused(actions.THERMOSTAT_SCHEMA, {"thermostat_entity_id": "x" * 300}), "overlay key fits input_text")


# Light: on → snapshot + off; off → restore the snapshot
h = Hass({"light.kitchen": st("on")})
a = actions.Actions(h)
asyncio.run(a.light_toggle(call(light_entity="light.kitchen")))
check(short(h.calls) == [("scene", "create", {"scene_id": "casora_restore_light_kitchen", "snapshot_entities": ["light.kitchen"]}),
                         ("light", "turn_off", {"entity_id": "light.kitchen"})], f"off: {short(h.calls)}")
check(all(c[3] is CTX for c in h.calls), "caller's context passed on")
h.calls.clear()
asyncio.run(a.light_toggle(call(light_entity="light.kitchen")))
check(short(h.calls) == [("scene", "turn_on", {"entity_id": "scene.casora_restore_light_kitchen"})], f"restore: {short(h.calls)}")

# Group: each member is remembered on its own
h = Hass({"light.room": st("on", entity_id=["light.a", "light.b"])})
asyncio.run(actions.Actions(h).light_toggle(call(light_entity="light.room")))
check(h.calls[0][2]["snapshot_entities"] == ["light.a", "light.b"], "group members snapshotted")

# Off without snapshot: plain on
h = Hass({"light.hall": st("off")})
asyncio.run(actions.Actions(h).light_toggle(call(light_entity="light.hall")))
check(short(h.calls) == [("light", "turn_on", {"entity_id": "light.hall"})], f"plain on: {short(h.calls)}")


# Queued like the script (mode queued, max 5): calls run one after the other, more than 5 waiting are dropped
async def queue():
    h = Hass({f"light.l{i}": st("off") for i in range(8)})
    a = actions.Actions(h)
    gate = asyncio.Event()
    real = a._light_toggle

    async def slow(c, light):
        await gate.wait()
        await real(c, light)

    a._light_toggle = slow
    tasks = [asyncio.ensure_future(a.light_toggle(call(light_entity=f"light.l{i}"))) for i in range(8)]
    await asyncio.sleep(0)
    gate.set()
    await asyncio.gather(*tasks)
    return h


h = asyncio.run(queue())
check(len(h.calls) == actions.LIGHT_QUEUE_MAX, f"at most 5 queued: {len(h.calls)}")


# Overlay toggles: open, close on the same card, switch to another, drop taps within 400 ms
def overlay(kind, field, boolean, text):
    h = Hass({boolean: st("off"), text: st("")})
    a = actions.Actions(h)
    fn = getattr(a, kind)
    asyncio.run(fn(call(**{field: "climate.a"})))
    check(h._states[boolean].state == "on" and h._states[text].state == "climate.a", f"{kind}: opens")
    n = len(h.calls)
    asyncio.run(fn(call(**{field: "climate.a"})))
    check(len(h.calls) == n, f"{kind}: second tap within 400 ms dropped")
    a._overlay_until.clear()
    asyncio.run(fn(call(**{field: "climate.b"})))
    check(h._states[boolean].state == "on" and h._states[text].state == "climate.b", f"{kind}: switches card")
    a._overlay_until.clear()
    asyncio.run(fn(call(**{field: "climate.b"})))
    check(h._states[boolean].state == "off", f"{kind}: same card closes")


overlay("thermostat_toggle", "thermostat_entity_id", *actions.THERMOSTAT_OVERLAY)
overlay("actions_toggle", "actions_entity_id", *actions.ACTIONS_OVERLAY)

# Restart: confirm → press + done → dismiss
h = Hass({"input_boolean.c": st("off"), "input_boolean.d": st("off")})
a = actions.Actions(h)
data = {"button_entity": "button.r", "helper_entity": "input_boolean.c", "done_entity": "input_boolean.d"}
asyncio.run(a.restart_toggle(call(**data)))
check(short(h.calls) == [("input_boolean", "turn_on", {"entity_id": "input_boolean.c"})], "first tap: confirm")
h.calls.clear()
asyncio.run(a.restart_toggle(call(**data)))
check(short(h.calls) == [("button", "press", {"entity_id": "button.r"}),
                         ("input_boolean", "turn_on", {"entity_id": "input_boolean.d"}),
                         ("input_boolean", "turn_off", {"entity_id": "input_boolean.c"})], f"second tap: {short(h.calls)}")
h.calls.clear()
asyncio.run(a.restart_toggle(call(**data)))
check(short(h.calls) == [("input_boolean", "turn_off", {"entity_id": "input_boolean.d"})], "tap on done: dismiss")
# Without done helper
h = Hass({"input_boolean.c": st("on")})
asyncio.run(actions.Actions(h).restart_toggle(call(button_entity="button.r", helper_entity="input_boolean.c", done_entity=None)))
check(short(h.calls) == [("button", "press", {"entity_id": "button.r"}),
                         ("input_boolean", "turn_off", {"entity_id": "input_boolean.c"})], "without done helper")

print("OK" if not FAILS else f"{len(FAILS)} failures")
sys.exit(1 if FAILS else 0)
