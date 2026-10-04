"""Seit wann ein Media-Player wirklich pausiert (04.10.2026).

Pausierte Player blendet das Dashboard nach pause_timeout_minutes aus, gerechnet ab
last_changed. Nach jedem HA-Neustart (oder kurzem Ausfall) geht ein Player aber
paused → unavailable → paused, last_changed beginnt neu und ein seit Stunden
pausierter Player taucht wieder zehn Minuten lang auf.

Hier merkt sich Casora je media_player „pausiert seit“ (Zeitpunkt + Titel) und hält
das über Neustarts in .storage. Kommt der Player aus unavailable/unknown (oder beim
Start ohne alten Zustand) mit gleichem Titel zurück auf paused, bleibt der alte
Zeitpunkt. Das Frontend liest die Werte aus sensor.casora_media_paused
(Attribut players) über window._casoraPausedSince und fällt ohne Eintrag auf
last_changed zurück.
"""

from __future__ import annotations

from typing import Any, Callable

STORAGE_KEY = "casora_media_pause"
STORAGE_VERSION = 1
GONE = ("unavailable", "unknown")


def media_key(attrs: dict[str, Any] | None) -> str:
    """Erkennt „dasselbe Stück“: Titel, sonst content_id."""
    a = attrs or {}
    return str(a.get("media_title") or a.get("media_content_id") or "").strip()


def next_entry(
    entry: dict[str, str] | None,
    old_state: str | None,
    new_state: str | None,
    key: str,
    changed_at: str,
) -> dict[str, str] | None:
    """Neuer Merk-Eintrag für einen Player nach einem Zustandswechsel.

    entry: bisheriger Eintrag {since, title} oder None
    old_state/new_state: Zustände (None = kein Zustand, z. B. Neustart)
    key: media_key des neuen Zustands
    changed_at: last_changed des neuen Zustands (ISO)
    """
    if new_state in GONE or new_state is None:
        # Ausfall: Eintrag behalten, damit die Rückkehr den alten Zeitpunkt übernimmt.
        return entry
    if new_state != "paused":
        return None
    if entry and entry.get("title") == key and (old_state is None or old_state in GONE or old_state == "paused"):
        return entry
    return {"since": changed_at, "title": key}


class PauseTracker:
    """Hält die Einträge, lädt/speichert sie und meldet Änderungen."""

    def __init__(self, hass, store=None) -> None:
        self.hass = hass
        if store is None:
            from homeassistant.helpers.storage import Store

            store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.store = store
        self.players: dict[str, dict[str, str]] = {}
        self.listeners: list[Callable[[], None]] = []
        self._unsub: Callable[[], None] | None = None

    async def async_start(self) -> None:
        data = await self.store.async_load()
        stored = (data or {}).get("players") or {}
        self.players = {k: v for k, v in stored.items() if isinstance(v, dict) and v.get("since")}
        # Stand beim Start: Player, die schon (wieder) pausiert sind, mit dem Gemerkten abgleichen.
        for st in self.hass.states.async_all("media_player"):
            self._apply(st.entity_id, None, st.state, media_key(st.attributes), st.last_changed.isoformat())
        self._save()

        from homeassistant.const import EVENT_STATE_CHANGED
        from homeassistant.core import callback

        @callback
        def _changed(event) -> None:
            eid = event.data.get("entity_id", "")
            if not eid.startswith("media_player."):
                return
            old = event.data.get("old_state")
            new = event.data.get("new_state")
            if new is None:
                # Entität entfernt: nichts mehr merken.
                if self.players.pop(eid, None) is not None:
                    self._save()
                    self._notify()
                return
            if self._apply(eid, old.state if old else None, new.state, media_key(new.attributes),
                           new.last_changed.isoformat()):
                self._save()
                self._notify()

        self._unsub = self.hass.bus.async_listen(EVENT_STATE_CHANGED, _changed)

    def _apply(self, eid: str, old: str | None, new: str | None, key: str, changed_at: str) -> bool:
        before = self.players.get(eid)
        after = next_entry(before, old, new, key, changed_at)
        if after == before:
            return False
        if after is None:
            self.players.pop(eid, None)
        else:
            self.players[eid] = after
        return True

    def _save(self) -> None:
        # Verzögert und beim Herunterfahren sicher geschrieben (Store final write).
        self.store.async_delay_save(lambda: {"players": dict(self.players)}, 5)

    def _notify(self) -> None:
        for fn in list(self.listeners):
            fn()

    def stop(self) -> None:
        if self._unsub:
            self._unsub()
            self._unsub = None
