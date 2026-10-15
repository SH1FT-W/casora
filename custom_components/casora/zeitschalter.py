"""Zeitschalter fürs Halten-Schnellmenü („Aus in 30 Min.“, „An für 1 Std.“).

Dienste casora.set_timer / casora.cancel_timer. Je Entität höchstens ein Timer; ein neuer
ersetzt den alten. Beim Ablauf schaltet Casora die Entität (homeassistant.turn_off/turn_on,
Rollläden close_cover/open_cover) und löscht den Eintrag. Schaltet jemand vorher von Hand in
den Zielzustand, verfällt der Timer – sonst schaltete Casora später ein zweites Mal.

Die Einträge stehen in .storage (casora_timers) und überleben Neustarts. Ist ein Timer
während des Neustarts abgelaufen, schaltet Casora nach dem Start nach, wenn der Ablauf
höchstens zehn Minuten her ist; ältere verfallen. Das Frontend liest sensor.casora_timers
(Attribut timers: {entity_id: {at, action, start}} – start = Zeitpunkt des Setzens für den Ring
auf der Kachel; ältere Einträge ohne start bleiben gültig).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Callable

_LOGGER = logging.getLogger(__name__)

STORAGE_KEY = "casora_timers"
STORAGE_VERSION = 1
GONE = ("unavailable", "unknown")
ACTIONS = ("turn_off", "turn_on")
# Schlösser, Alarm und Kameras nie per Zeitschalter.
BLOCKED = ("lock", "alarm_control_panel", "camera")
GRACE = timedelta(minutes=10)
MAX_MINUTES = 1440
OFF_STATES = {"cover": ("closed", "closing"), "valve": ("closed", "closing")}
ON_STATES = {"cover": ("open", "opening"), "valve": ("open", "opening")}


def domain_of(entity_id: str) -> str:
    return entity_id.split(".", 1)[0]


def allowed(entity_id: str) -> bool:
    return domain_of(entity_id) not in BLOCKED


def due_at(now: datetime, minutes: int) -> datetime:
    """Ablaufzeitpunkt (UTC-aware now erwartet)."""
    return now + timedelta(minutes=minutes)


def service_for(entity_id: str, action: str) -> tuple[str, str]:
    """(Domain, Dienst), mit dem der Timer beim Ablauf schaltet."""
    d = domain_of(entity_id)
    if d == "cover":
        return "cover", "close_cover" if action == "turn_off" else "open_cover"
    if d == "valve":
        return "valve", "close_valve" if action == "turn_off" else "open_valve"
    return "homeassistant", action


def in_target(entity_id: str, action: str, state: str | None) -> bool:
    """Ist der Zustand schon der, in den der Timer schalten würde?"""
    if state is None or state in GONE:
        return False
    d = domain_of(entity_id)
    if action == "turn_off":
        return state in OFF_STATES.get(d, ("off",))
    if d in ON_STATES:
        return state in ON_STATES[d]
    return state != "off"


def reached_by_hand(entity_id: str, action: str, old: str | None, new: str | None) -> bool:
    """Wechsel in den Zielzustand vor Ablauf (dann verfällt der Timer).

    Rückkehr aus unavailable/unknown zählt nicht – das ist kein Schalten, sondern z. B. ein Neustart.
    """
    if old is None or old in GONE:
        return False
    return not in_target(entity_id, action, old) and in_target(entity_id, action, new)


def on_restart(at: datetime, now: datetime, grace: timedelta = GRACE) -> str:
    """Nach dem Start: „keep“ (noch offen), „run“ (gerade verpasst, nachholen) oder „drop“."""
    if at > now:
        return "keep"
    return "run" if now - at <= grace else "drop"


def parse_entry(value: Any) -> tuple[datetime, str] | None:
    """Gespeicherter Eintrag {at, action} → (Ablauf, Aktion); kaputte Einträge → None."""
    if not isinstance(value, dict) or value.get("action") not in ACTIONS:
        return None
    try:
        at = datetime.fromisoformat(str(value.get("at")))
    except ValueError:
        return None
    return (at, value["action"]) if at.tzinfo else None


def parse_start(value: Any) -> datetime | None:
    """Startzeitpunkt eines Eintrags (für den Ring auf der Kachel); fehlt oder kaputt → None."""
    if not isinstance(value, dict) or not value.get("start"):
        return None
    try:
        start = datetime.fromisoformat(str(value["start"]))
    except ValueError:
        return None
    return start if start.tzinfo else None


class TimerTracker:
    """Hält die Timer, plant sie ein, speichert sie und meldet Änderungen."""

    def __init__(self, hass, store=None) -> None:
        self.hass = hass
        if store is None:
            from homeassistant.helpers.storage import Store

            store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.store = store
        self.timers: dict[str, dict[str, str]] = {}
        self.listeners: list[Callable[[], None]] = []
        self._cancel: dict[str, Callable[[], None]] = {}
        self._unsub: list[Callable[[], None]] = []
        self._started: Callable[[], None] | None = None

    async def async_start(self) -> None:
        from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, EVENT_STATE_CHANGED
        from homeassistant.core import CoreState, callback
        from homeassistant.util import dt as dt_util

        data = await self.store.async_load()
        now = dt_util.utcnow()
        late: list[tuple[str, str]] = []
        for eid, raw in ((data or {}).get("timers") or {}).items():
            parsed = parse_entry(raw)
            if not parsed or not allowed(eid):
                continue
            at, action = parsed
            verdict = on_restart(at, now)
            if verdict == "keep":
                self._add(eid, at, action, parse_start(raw))
            elif verdict == "run":
                late.append((eid, action))
        self._save()

        if late:
            def _run_late(_event=None) -> None:
                self._started = None
                for eid, action in late:
                    self.hass.async_create_task(self._switch(eid, action))

            # Erst wenn HA läuft – sonst gibt es die Entität vielleicht noch nicht.
            if self.hass.state is CoreState.running:
                _run_late()
            else:
                self._started = self.hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, callback(_run_late))

        @callback
        def _changed(event) -> None:
            eid = event.data.get("entity_id", "")
            entry = self.timers.get(eid)
            if entry is None:
                return
            old = event.data.get("old_state")
            new = event.data.get("new_state")
            if new is None or reached_by_hand(eid, entry["action"], old.state if old else None, new.state):
                # Entität entfernt oder von Hand geschaltet: Timer verfällt.
                self.remove(eid)

        self._unsub.append(self.hass.bus.async_listen(EVENT_STATE_CHANGED, _changed))
        self._register_services()

    def _register_services(self) -> None:
        import voluptuous as vol

        from homeassistant.exceptions import ServiceValidationError
        from homeassistant.helpers import config_validation as cv
        from homeassistant.util import dt as dt_util

        from .const import DOMAIN

        def _check(eid: str) -> None:
            if not allowed(eid):
                raise ServiceValidationError(f"Zeitschalter ist für {domain_of(eid)} nicht erlaubt: {eid}")
            if self.hass.states.get(eid) is None:
                raise ServiceValidationError(f"Entität nicht gefunden: {eid}")

        async def _set(call) -> None:
            eid = call.data["entity_id"]
            _check(eid)
            now = dt_util.utcnow()
            self.set(eid, due_at(now, call.data["minutes"]), call.data["action"], now)

        async def _cancel(call) -> None:
            self.remove(call.data["entity_id"])

        self.hass.services.async_register(DOMAIN, "set_timer", _set, schema=vol.Schema({
            vol.Required("entity_id"): cv.entity_id,
            vol.Required("minutes"): vol.All(vol.Coerce(int), vol.Range(min=1, max=MAX_MINUTES)),
            vol.Optional("action", default="turn_off"): vol.In(ACTIONS),
        }))
        self.hass.services.async_register(DOMAIN, "cancel_timer", _cancel, schema=vol.Schema({
            vol.Required("entity_id"): cv.entity_id,
        }))

    def _add(self, eid: str, at: datetime, action: str, start: datetime | None = None) -> None:
        from homeassistant.core import callback
        from homeassistant.helpers.event import async_track_point_in_utc_time

        if eid in self._cancel:
            self._cancel.pop(eid)()
        self.timers[eid] = {"at": at.isoformat(), "action": action}
        if start is not None and start < at:
            self.timers[eid]["start"] = start.isoformat()

        @callback
        def _due(_now) -> None:
            self._cancel.pop(eid, None)
            if self.timers.get(eid, {}).get("at") != at.isoformat():
                return
            self.remove(eid)
            self.hass.async_create_task(self._switch(eid, action))

        self._cancel[eid] = async_track_point_in_utc_time(self.hass, _due, at)

    def set(self, eid: str, at: datetime, action: str, start: datetime | None = None) -> None:
        """Timer setzen; ersetzt einen bestehenden derselben Entität."""
        self._add(eid, at, action, start)
        self._save()
        self._notify()

    def remove(self, eid: str) -> None:
        cancel = self._cancel.pop(eid, None)
        if cancel:
            cancel()
        if self.timers.pop(eid, None) is not None:
            self._save()
            self._notify()

    async def _switch(self, eid: str, action: str) -> None:
        domain, service = service_for(eid, action)
        try:
            await self.hass.services.async_call(domain, service, {"entity_id": eid}, blocking=True)
        except Exception as err:  # noqa: BLE001
            _LOGGER.warning("Zeitschalter für %s fehlgeschlagen (%s.%s): %s", eid, domain, service, err)

    def _save(self) -> None:
        # Kurz verzögert, beim Herunterfahren sicher geschrieben (Store final write).
        self.store.async_delay_save(lambda: {"timers": dict(self.timers)}, 1)

    def _notify(self) -> None:
        for fn in list(self.listeners):
            fn()

    def stop(self) -> None:
        from .const import DOMAIN

        for cancel in self._cancel.values():
            cancel()
        self._cancel.clear()
        for u in self._unsub:
            u()
        self._unsub.clear()
        if self._started:
            self._started()
            self._started = None
        for name in ("set_timer", "cancel_timer"):
            self.hass.services.async_remove(DOMAIN, name)
        # Sofort sichern: ein Neuladen kurz nach set_timer läse sonst den alten Stand (verzögertes Speichern).
        self.hass.async_create_task(self.store.async_save({"timers": dict(self.timers)}))
