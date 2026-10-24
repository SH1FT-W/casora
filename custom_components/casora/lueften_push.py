"""Push-Hinweise zum Lüften – hört auf die Raumbewertung aus raumklima.py.

Nur aktiv, wenn in den Casora-Optionen Empfänger (notify-Dienste) gewählt sind.
  „Jetzt lüften“     erst nach 10 Min. Bestand, 7–22 Uhr, nur wenn jemand zuhause ist
  „Fenster schließen“ erst nach 10 Min. Bestand, 7–23 Uhr
  CO₂ ≥ 2500 ppm     sofort, zu jeder Zeit, als kritische Meldung
Pro Raum und Art höchstens eine Meldung, solange der Zustand anhält, und frühestens
nach 30 Min. wieder. Neue Meldungen ersetzen die alte desselben Raums (collapse-id/tag).
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_HOME
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .raumklima import Raumklima

_LOGGER = logging.getLogger(__name__)

OPT_VENT_NOTIFY = "lueften_push"
OPT_VENT_PERSONS = "lueften_personen"

HOLD = timedelta(minutes=10)
AGAIN = timedelta(minutes=30)
HOURS = {"jetzt": (7, 22), "schliessen": (7, 23)}
NEEDS_HOME = {"jetzt"}

TEXT = {
    "de": {
        "jetzt": ("Lüften: {n}", "{grund} – jetzt kurz lüften."),
        "schliessen": ("Fenster schließen: {n}", "{grund} – kann wieder zu."),
        "co2krit": ("CO₂ kritisch: {n}", "{co2} ppm – bitte sofort lüften."),
    },
    "en": {
        "jetzt": ("Ventilate: {n}", "{grund} – open a window for a few minutes."),
        "schliessen": ("Close window: {n}", "{grund} – you can close it again."),
        "co2krit": ("CO₂ critical: {n}", "{co2} ppm – ventilate right away."),
    },
    "es": {
        "jetzt": ("Ventilar: {n}", "{grund} – abre la ventana unos minutos."),
        "schliessen": ("Cerrar ventana: {n}", "{grund} – ya puedes cerrarla."),
        "co2krit": ("CO₂ crítico: {n}", "{co2} ppm – ventila ahora mismo."),
    },
    "pl": {
        "jetzt": ("Przewietrz: {n}", "{grund} – otwórz okno na kilka minut."),
        "schliessen": ("Zamknij okno: {n}", "{grund} – możesz już zamknąć."),
        "co2krit": ("CO₂ krytyczne: {n}", "{co2} ppm – przewietrz natychmiast."),
    },
    "nl": {
        "jetzt": ("Luchten: {n}", "{grund} – zet een raam een paar minuten open."),
        "schliessen": ("Raam sluiten: {n}", "{grund} – je kunt het weer dichtdoen."),
        "co2krit": ("CO₂ kritiek: {n}", "{co2} ppm – lucht nu meteen."),
    },
    "it": {
        "jetzt": ("Arieggiare: {n}", "{grund} – apri la finestra per qualche minuto."),
        "schliessen": ("Chiudere la finestra: {n}", "{grund} – puoi richiuderla."),
        "co2krit": ("CO₂ critico: {n}", "{co2} ppm – arieggia subito."),
    },
    "fr": {
        "jetzt": ("Aérer : {n}", "{grund} – ouvre la fenêtre quelques minutes."),
        "schliessen": ("Fermer la fenêtre : {n}", "{grund} – tu peux la refermer."),
        "co2krit": ("CO₂ critique : {n}", "{co2} ppm – aère tout de suite."),
    },
}
# Gründe kommen deutsch aus raumklima.py; für Englisch die festen Teile tauschen.
GRUND_EN = (("Feuchte", "Humidity"), ("Fenster seit", "Window open for"), (" offen", ""), ("Std.", "h"), ("Min.", "min"))
GRUND = {"en": GRUND_EN, "es": (("Feuchte", "Humedad"), ("Fenster seit", "Ventana abierta hace"), (" offen", ""),
                                 ("Std.", "h"), ("Min.", "min")),
         "fr": (("Feuchte", "Humidité"), ("Fenster seit", "Fenêtre ouverte depuis"), (" offen", ""), ("Std.", "h"), ("Min.", "min")),
         "it": (("Feuchte", "Umidità"), ("Fenster seit", "Finestra aperta da"), (" offen", ""), ("Std.", "h"), ("Min.", "min")),
         "nl": (("Feuchte", "Vochtigheid"), ("Fenster seit", "Raam open sinds"), (" offen", ""), ("Std.", "u"), ("Min.", "min"))}


def notify_services(hass: HomeAssistant) -> list[str]:
    """Wählbare Empfänger: klassische notify-Dienste (mobile_app_… usw.)."""
    skip = {"send_message", "persistent_notification"}
    return sorted(s for s in hass.services.async_services_for_domain("notify") if s not in skip)


class LueftenPush:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, rk: Raumklima) -> None:
        self.hass, self.entry, self.rk = hass, entry, rk
        self.seen: dict[str, Any] = {}
        self.sent: dict[str, Any] = {}
        self.last: dict[str, Any] = {}

    @property
    def targets(self) -> list[str]:
        return [t.removeprefix("notify.") for t in self.entry.options.get(OPT_VENT_NOTIFY) or []]

    def _home(self) -> bool:
        wanted = self.entry.options.get(OPT_VENT_PERSONS) or [
            s.entity_id for s in self.hass.states.async_all("person")]
        states = [self.hass.states.get(p) for p in wanted]
        states = [s for s in states if s]
        return not states or any(s.state == STATE_HOME for s in states)

    @callback
    def tick(self) -> None:
        if not self.targets or not self.rk.vent_enabled:
            return
        now = dt_util.utcnow()
        local = dt_util.as_local(now)
        rooms = {r["k"]: r for r in self.rk.vent.get("rooms", [])}
        current = set(self.rk.vent.get("alerts", []))
        for key in list(self.seen):
            if key not in current:
                self.seen.pop(key)
                self.sent.pop(key, None)
        for key in current:
            self.seen.setdefault(key, now)
            if key in self.sent:
                continue
            room_k, kind = key.split("|", 1)
            room = rooms.get(room_k)
            if not room:
                continue
            if kind != "co2krit":
                if now - self.seen[key] < HOLD:
                    continue
                lo, hi = HOURS[kind]
                if not lo <= local.hour < hi:
                    continue
                if kind in NEEDS_HOME and not self._home():
                    continue
            if key in self.last and now - self.last[key] < AGAIN:
                continue  # noch zu früh – nach Ablauf senden, falls der Zustand anhält
            self.sent[key] = self.last[key] = now
            self.hass.async_create_task(self._send(kind, room), eager_start=False)

    async def _send(self, kind: str, room: dict) -> None:
        code = str(self.hass.config.language or "")[:2]
        lang = code if code in TEXT else "en"
        grund = room.get("grund") or ""
        for a, b in GRUND.get(lang, ()):
            grund = grund.replace(a, b)
        title, msg = TEXT[lang][kind]
        title = title.format(n=room["n"])
        msg = msg.format(grund=grund, co2=room.get("co2")).lstrip(" –")
        tag = f"casora-lueften-{room['k']}"
        push: dict[str, Any] = {"interruption-level": "time-sensitive"}
        if kind == "co2krit":
            push = {"interruption-level": "critical", "sound": {"name": "default", "critical": 1, "volume": 1.0}}
        data = {"tag": tag, "group": "casora-lueften", "push": push,
                "apns_headers": {"apns-collapse-id": tag}}
        if kind == "co2krit":
            data.update({"ttl": 0, "priority": "high", "channel": "alarm_stream"})
        for target in self.targets:
            try:
                await self.hass.services.async_call(
                    "notify", target, {"title": title, "message": msg, "data": data}, blocking=True)
            except Exception as err:  # noqa: BLE001 – ein kaputter Empfänger soll die anderen nicht stoppen
                _LOGGER.warning("Lüften-Push an notify.%s fehlgeschlagen: %s", target, err)


@callback
def async_start(hass: HomeAssistant, entry: ConfigEntry, rk: Raumklima) -> LueftenPush:
    push = LueftenPush(hass, entry, rk)
    rk.listeners.append(push.tick)
    return push
