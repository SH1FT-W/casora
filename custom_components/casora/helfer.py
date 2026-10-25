"""What Casora sets up by itself: helpers and the small automatic behaviours.

Earlier one had to copy packages/casora_helpers.yaml and themes/casora/ by hand and edit
configuration.yaml. Now:

  • Helpers (input_boolean/text/select/number/datetime) - normal UI helpers, created through the
    storage collection of their integration, exactly like Settings › Helpers does.
  • Actions for the cards - services of the integration (actions.py), nothing in scripts.yaml.
  • Automatic behaviour (reset the restart buttons, expand the media row) - here in Python,
    without automations.
  • Designs - served by the integration and applied in the browser (theme.py), no theme file.

Nothing in the config folder is written. What exists already (e.g. from an old package) is left alone.
Only exception: Casora's own leftovers of earlier versions are removed once (legacy_cleanup.py).
The service casora.einrichten repeats the setup and reports what is missing.
"""

from __future__ import annotations

import inspect
import logging
import os
from typing import Any

import voluptuous as vol

from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, EVENT_STATE_CHANGED, UnitOfTemperature
from homeassistant.core import CoreState, Event, HomeAssistant, ServiceCall, SupportsResponse, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.service import async_register_admin_service
from homeassistant.util.yaml import load_yaml

from .const import DOMAIN
from .legacy_cleanup import async_run as async_legacy_cleanup
from .legacy_cleanup import async_unload as async_unload_legacy_cleanup

_LOGGER = logging.getLogger(__name__)

HELPER_DOMAINS = ("input_boolean", "input_text", "input_select", "input_number", "input_datetime")
EXPANDED_ROW = "input_select.casora_expanded_row"
RESTART_DONE = ("input_boolean.casora_restart_done_1", "input_boolean.casora_restart_done_2")
PLAYING = ("playing", "buffering")

_DIR = os.path.dirname(__file__)


def _read(name: str) -> Any:
    return load_yaml(os.path.join(_DIR, name))


def _collection(hass: HomeAssistant, domain: str):
    """Storage collection of a helper type, via the WebSocket command the helper dialog uses
    (<domain>/create). None when not reachable.

    HA has no public Python API to create UI helpers; this is a known, allowlisted access to another
    integration's internals (dev/unit/no_foreign_internals_test.py, docs/ha-annahmen.md "Fremde Interna")."""
    try:
        handler = hass.data["websocket_api"][f"{domain}/create"][0]
        return inspect.unwrap(handler).__self__.storage_collection
    except Exception:  # noqa: BLE001 - the layout may change between HA versions
        return None


def _exists(hass: HomeAssistant, entity_id: str) -> bool:
    return hass.states.get(entity_id) is not None or er.async_get(hass).async_get(entity_id) is not None


def _adapt(hass: HomeAssistant, domain: str, key: str, conf: dict) -> dict:
    conf = dict(conf)
    if key == "casora_thermostat_target_temperature" and hass.config.units.temperature_unit == UnitOfTemperature.CELSIUS:
        conf.update(min=15, max=30, step=0.5, unit_of_measurement=UnitOfTemperature.CELSIUS)
    if domain == "input_text":
        conf.setdefault("max", 255)
    if domain == "input_boolean" and "initial" in conf:
        conf["initial"] = bool(conf["initial"])
    return conf


async def _add_options(coll, key: str, wanted: list[str]) -> None:
    """Append missing options to a stored select (YAML selects stay untouched)."""
    if coll is None:
        return
    item = (getattr(coll, "data", None) or {}).get(key)
    if not item:
        return
    have = list(item.get("options") or [])
    missing = [o for o in wanted if o not in have]
    if not missing:
        return
    try:
        await coll.async_update_item(key, {**{k: v for k, v in item.items() if k != "id"}, "options": have + missing})
        _LOGGER.info("Casora: input_select.%s um %s ergänzt", key, ", ".join(missing))
    except Exception:  # noqa: BLE001
        _LOGGER.exception("Casora: Optionen für input_select.%s konnten nicht ergänzt werden", key)


async def _ensure_helpers(hass: HomeAssistant, spec: dict) -> tuple[list[str], list[str]]:
    created, failed = [], []
    for domain in HELPER_DOMAINS:
        items = spec.get(domain) or {}
        coll = None
        for key, conf in items.items():
            entity_id = f"{domain}.{key}"
            if _exists(hass, entity_id):
                # Selects Casora created earlier get new options added (e.g. "scenes" for the
                # scene badge); the user's own additions stay.
                if domain == "input_select" and conf.get("options"):
                    coll = coll or _collection(hass, domain)
                    await _add_options(coll, key, list(conf["options"]))
                continue
            coll = coll or _collection(hass, domain)
            if coll is None:
                failed.append(entity_id)
                continue
            conf = _adapt(hass, domain, key, conf)
            try:
                # The id comes from the name: create with the key first, then set the
                # readable name (the entity_id stays).
                item = await coll.async_create_item({**conf, "name": key})
                item_id = item["id"] if isinstance(item, dict) else getattr(item, "id", key)
                await coll.async_update_item(item_id, {**conf, "name": conf.get("name", key)})
                created.append(entity_id)
            except Exception:  # noqa: BLE001
                _LOGGER.exception("Casora: Helfer %s konnte nicht angelegt werden", entity_id)
                failed.append(entity_id)
    return created, failed


# ── Automatic behaviour (formerly automations in the package) ────────────────

def _legacy_automation(hass: HomeAssistant, unique_id: str) -> bool:
    return er.async_get(hass).async_get_entity_id("automation", "automation", unique_id) is not None


def _any_playing(hass: HomeAssistant) -> bool:
    return any(s.state in PLAYING for s in hass.states.async_all("media_player"))


@callback
def _setup_automatik(hass: HomeAssistant, runtime: dict) -> None:
    unsub = runtime["unsub"]
    clear_done = not (_legacy_automation(hass, "casora_auto_clear_restart_done_1")
                      or _legacy_automation(hass, "casora_auto_clear_restart_done_2"))
    expand = not _legacy_automation(hass, "casora_auto_expand_media_row")
    state = {"playing": _any_playing(hass)}
    # At most one timer per restart switch, else unsub would grow with every switch-on.
    timers: dict[str, Any] = {}
    unsub.append(lambda: [t() for t in list(timers.values())])

    def _expand() -> None:
        row = hass.states.get(EXPANDED_ROW)
        if row and row.state == "none" and "media" in (row.attributes.get("options") or []):
            hass.async_create_task(hass.services.async_call(
                "input_select", "select_option", {"entity_id": EXPANDED_ROW, "option": "media"}))

    @callback
    def _changed(event: Event) -> None:
        eid = event.data["entity_id"]
        new = event.data.get("new_state")
        if clear_done and eid in RESTART_DONE and new and new.state == "on":
            # Back after 3 s, like the former automation.
            if (prev := timers.pop(eid, None)) is not None:
                prev()

            @callback
            def _off(_now, e=eid) -> None:
                timers.pop(e, None)
                hass.async_create_task(hass.services.async_call("input_boolean", "turn_off", {"entity_id": e}))

            timers[eid] = async_call_later(hass, 3, _off)
        elif expand and eid.startswith("media_player."):
            now = _any_playing(hass)
            if now and not state["playing"]:
                _expand()
            state["playing"] = now

    unsub.append(hass.bus.async_listen(EVENT_STATE_CHANGED, _changed))
    if expand and state["playing"]:
        _expand()


# ── Entry ────────────────────────────────────────────────────────────────────

async def async_einrichten(hass: HomeAssistant) -> dict[str, Any]:
    spec = await hass.async_add_executor_job(_read, "helfer.yaml")
    created, failed = await _ensure_helpers(hass, spec)
    result = {"angelegt": created, "fehlt": failed}
    if created:
        _LOGGER.info("Casora: %d helpers created: %s", len(created), ", ".join(created))
    if not failed:
        # Everything is there (again): an older notice must not stay behind.
        hass.async_create_task(hass.services.async_call("persistent_notification", "dismiss",
                                                        {"notification_id": "casora_einrichten"}))
        return result
    _LOGGER.warning("Casora: could not create: %s", ", ".join(failed))
    hass.async_create_task(hass.services.async_call("persistent_notification", "create", {
        "notification_id": "casora_einrichten",
        "title": "Casora",
        "message": "Diese Helfer konnte Casora nicht selbst anlegen:\n\n"
                   + "\n".join(f"- `{i}`" for i in failed),
    }))
    return result


async def async_setup_helfer(hass: HomeAssistant) -> None:
    """When the integration loads; once per HA run."""
    runtime = hass.data.setdefault(DOMAIN, {}).setdefault("helfer", {"unsub": []})

    async def _run(_event: Event | None = None) -> None:
        if _event is not None and waiting:
            runtime["unsub"].remove(waiting.pop())
        try:
            await async_einrichten(hass)
        except Exception:  # noqa: BLE001 - must never stop loading
            _LOGGER.exception("Casora: setup failed")
        try:
            # Leftovers of earlier versions (scripts in scripts.yaml, theme file): removed once, then told.
            await async_legacy_cleanup(hass)
        except Exception:  # noqa: BLE001
            _LOGGER.debug("Casora: legacy cleanup failed", exc_info=True)
        _setup_automatik(hass, runtime)

    # Helpers only once HA runs: then all YAML packages are loaded and nothing is created twice.
    waiting: list = []
    if hass.state is CoreState.running:
        await _run()
    else:
        waiting.append(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _run))
        runtime["unsub"].append(waiting[0])

    async def _service(call: ServiceCall) -> dict[str, Any]:
        return await async_einrichten(hass)

    if not hass.services.has_service(DOMAIN, "einrichten"):
        # Admins only: creates helpers.
        async_register_admin_service(hass, DOMAIN, "einrichten", _service, vol.Schema({}, extra=vol.ALLOW_EXTRA),
                                     SupportsResponse.OPTIONAL)


@callback
def async_unload_helfer(hass: HomeAssistant) -> None:
    async_unload_legacy_cleanup(hass)
    runtime = hass.data.get(DOMAIN, {}).pop("helfer", None)
    for u in (runtime or {}).get("unsub", []):
        try:
            u()
        except Exception:  # noqa: BLE001 - already expired
            pass
