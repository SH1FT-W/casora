"""Push bei neuen Casora-Versionen – hört auf die Update-Entität von Casora.

Nur aktiv, wenn in den Casora-Optionen Empfänger (notify-Dienste, Studio → Einstellungen →
Glocke & Hinweise) gewählt sind; Standard: keine. Die Update-Entität ist HACS' Eintrag für Casora
oder die eigene (update.casora_update_entity). Meldet sie eine neue latest_version, die noch nicht
installiert ist (Zustand „on“, neuer als die laufende Fassung), geht genau ein Push je Version an
die gewählten Geräte. Welche Versionen schon gemeldet wurden, steht im Casora-Speicher und
übersteht so jeden Neustart. Antippen öffnet im Studio die Updates (?updates=1).
"""

from __future__ import annotations

import logging
import re
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_STATE_CHANGED
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.start import async_at_started
from homeassistant.helpers.storage import Store

from .const import DOMAIN, VERSION
from .release_notes import newer, norm_version
from .update import casora_update_entity

_LOGGER = logging.getLogger(__name__)

OPT_UPDATE_PUSH = "update_push"
STORE_KEY = f"{DOMAIN}.update_push"
# Studio, Seite Updates (casora-panel-updates.js liest ?updates).
URL = "/casora-studio?updates=1"
MAX_TEXT = 140

TEXT = {
    "de": ("Casora {v} ist da", "Neue Version verfügbar"),
    "en": ("Casora {v} is here", "New version available"),
}


def plain_summary(text: Any, limit: int = MAX_TEXT) -> str:
    """Kurzfassung einer Update-Entität als schlichter Text: ohne HTML/Markdown, gekürzt."""
    s = str(text or "")
    s = re.sub(r"<[^>]*>", " ", s)
    s = re.sub(r"!?\[([^\]]*)\]\([^)]*\)", r"\1", s)  # [Text](Link) → Text
    s = re.sub(r"(?m)^\s{0,3}(?:#{1,6}\s*|[-*+]\s+|>\s*)", "", s)  # Überschrift, Aufzählung, Zitat
    s = re.sub(r"(\*\*|__|`|~~)", "", s)
    s = re.sub(r"(?<!\w)[*_](\S[^*_]*?)[*_](?!\w)", r"\1", s)  # *kursiv*
    s = re.sub(r"\s+[–—]\s+", ", ", s)  # keine Gedankenstriche
    s = re.sub(r"\s+", " ", s).strip(" ,;·")
    if len(s) > limit:
        cut = s[: limit - 1]
        cut = cut[: cut.rfind(" ")] if " " in cut[limit // 2:] else cut
        s = cut.rstrip(" ,;·.") + "…"
    return s


class UpdatePush:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass, self.entry = hass, entry
        self.store: Store = Store(hass, 1, STORE_KEY)
        self.notified: set[str] = set()
        self.loaded = False
        self._unsubs: list = []

    @property
    def targets(self) -> list[str]:
        return [t.removeprefix("notify.") for t in self.entry.options.get(OPT_UPDATE_PUSH) or []]

    async def async_start(self) -> None:
        raw = await self.store.async_load() or {}
        self.notified = {str(v) for v in raw.get("notified", []) if v}
        self.loaded = True

        @callback
        def _filter(event_data: dict) -> bool:
            return str(event_data.get("entity_id") or "").startswith("update.")

        @callback
        def _changed(event: Event) -> None:
            eid, _ = casora_update_entity(self.hass, self.entry)
            if eid and event.data.get("entity_id") == eid:
                self.check()

        self._unsubs.append(self.hass.bus.async_listen(EVENT_STATE_CHANGED, _changed, event_filter=_filter))
        # Nach dem Start einmal nachsehen (HACS meldet seinen Stand womöglich, bevor Casora zuhört).
        @callback
        def _started(_hass: HomeAssistant) -> None:
            self.check()

        self._unsubs.append(async_at_started(self.hass, _started))

    @callback
    def stop(self) -> None:
        while self._unsubs:
            unsub = self._unsubs.pop()
            try:
                unsub()
            except Exception:  # noqa: BLE001 – schon abgemeldet
                pass

    @callback
    def check(self) -> None:
        if not self.loaded or not self.targets:
            return
        eid, _ = casora_update_entity(self.hass, self.entry)
        st = self.hass.states.get(eid) if eid else None
        if st is None or st.state != "on":
            return
        latest = norm_version(st.attributes.get("latest_version"))
        if not latest or not newer(latest, VERSION) or latest in self.notified:
            return
        if st.attributes.get("in_progress"):
            return
        self.notified.add(latest)
        self.store.async_delay_save(lambda: {"notified": sorted(self.notified)[-50:]}, 0)
        self.hass.async_create_task(self._send(latest, st.attributes), eager_start=False)

    async def _send(self, version: str, attrs: Any) -> None:
        lang = "de" if (self.hass.config.language or "").startswith("de") else "en"
        title_t, fallback = TEXT[lang]
        title = title_t.format(v=version)
        msg = plain_summary(attrs.get("release_summary")) or fallback
        tag = "casora-update"
        data = {"url": URL, "clickAction": URL, "tag": tag, "group": "casora-update",
                "apns_headers": {"apns-collapse-id": tag}}
        for target in self.targets:
            try:
                await self.hass.services.async_call(
                    "notify", target, {"title": title, "message": msg, "data": data}, blocking=True)
            except Exception as err:  # noqa: BLE001 – ein kaputter Empfänger soll die anderen nicht stoppen
                _LOGGER.warning("Update-Push an notify.%s fehlgeschlagen: %s", target, err)


async def async_start(hass: HomeAssistant, entry: ConfigEntry) -> UpdatePush:
    push = UpdatePush(hass, entry)
    await push.async_start()
    return push
