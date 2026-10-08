"""options.py ohne laufendes HA: casora/options/get und /set gegen einen Attrappen-Eintrag.

  uv run --python 3.14 --with homeassistant python dev/unit/optionen_ws_test.py

Echte HA-Selektoren (Paket homeassistant), aber kein Kern: hass, Config-Eintrag und
WebSocket-Verbindung sind Attrappen. Prüft: set prüft mit demselben Schema wie der
Optionen-Dialog (config_flow.py), leere Felder fallen weg, Fehler ändern nichts, und
async_update_entry läuft wie beim Dialog (Update-Listener → Neuladen). Optionen des
früheren Update-Servers (update_key/update_server/update_token) stören nicht: get
zeigt sie nicht, set lässt sie still weg – auch die alten Felder key/token.
"""

from __future__ import annotations

import os
import sys
from types import SimpleNamespace

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, ROOT)

from custom_components.casora import config_flow, options  # noqa: E402
from custom_components.casora.options import build_options, options_schema  # noqa: E402

TOKEN = "unit-test-token-value"  # nur ein Platzhalter, kein echter Token
KEY = "csk_" + "k" * 43  # Platzhalter, kein echter Schlüssel
LEGACY = {"update_token": TOKEN, "update_key": KEY, "update_server": "https://updates.example.test"}


class States:
    def __init__(self, ids):
        self.ids = ids

    def async_entity_ids(self, domain=None):
        return [i for i in self.ids if not domain or i.startswith(domain + ".")]

    def async_all(self, domain=None):
        return []


class Entries:
    def __init__(self, entry):
        self.entry = entry
        self.updates = []

    def async_entries(self, domain):
        return [self.entry]

    def async_update_entry(self, entry, options):
        if dict(options) == dict(entry.options):
            return False
        self.updates.append(dict(options))
        entry.options = dict(options)
        return True


class Conn:
    def __init__(self):
        self.user = SimpleNamespace(is_admin=True)
        self.results, self.errors = [], []

    def send_result(self, mid, result):
        self.results.append(result)

    def send_error(self, mid, code, message, *a, **k):
        self.errors.append((code, message))


# Ein Eintrag, wie ihn eine ältere Casora-Version hinterlassen hat (mit Update-Zugang).
entry = SimpleNamespace(entry_id="abc", options={"ai_task_entity": "ai_task.claude", "ki_auto": True, **LEGACY})
hass = SimpleNamespace(
    data={},
    states=States(["ai_task.claude", "ai_task.web"]),
    services=SimpleNamespace(async_services_for_domain=lambda d: {"mobile_app_phone": 1, "send_message": 1, "persistent_notification": 1}),
    config_entries=Entries(entry),
)

fails = []


def check(name, cond):
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails.append(name)


# Dialog und Studio teilen das Schema.
check("config_flow nutzt options_schema", config_flow.options_schema is options_schema)
keys = {str(k) for k in options_schema(hass, entry.options).schema}
check("Schema hat alle 16 Optionen, keine Update-Felder, kein ki_auto mehr", keys == {
    "ai_task_entity", "ai_task_web_entity", "outdoor_temperature", "outdoor_humidity", "rezept_liste",
    "price_kwh", "ki_hinweise", "lueften_push", "lueften_personen", "update_push", "beta_updates",
    "ki_plan_energie", "ki_plan_heizung", "ki_plan_lueftung", "ki_plan_rezept", "ki_plan_update"})
check("Dialog speichert alte Update-Optionen nicht mit",
      options.clean_options({"ai_task_entity": "ai_task.web", **LEGACY}) == {"ai_task_entity": "ai_task.web"})

# get
c = Conn()
options.ws_get(hass, c, {"id": 1, "type": "casora/options/get"})
r = c.results[-1]
check("get: alte Update-Optionen unsichtbar", TOKEN not in repr(r) and KEY not in repr(r)
      and not set(LEGACY) & set(r["options"]) and "key" not in r and "token" not in r)
check("get: notify-Dienste ohne send_message", r["notify_services"] == ["notify.mobile_app_phone"])
check("get: Standard-KI als Automatik", r["auto"]["ai_task_entity"] == "ai_task.claude")


def ws_set(msg):
    c = Conn()
    msg = options.ws_set._ws_schema({"id": 2, "type": "casora/options/set", **msg})
    options.ws_set(hass, c, msg)
    return c


# set: leere Felder fallen weg, Zahl/Listen geprüft, alte Update-Optionen werden mit entfernt
c = ws_set({"options": {"ai_task_entity": "ai_task.web", "ki_hinweise": "", "price_kwh": 0.31,
                        "lueften_push": ["notify.mobile_app_phone"], "lueften_personen": ["person.a"], "ki_auto": False,
                        "ki_plan_energie": "auto", "ki_plan_heizung": "off", "ki_plan_rezept": "Sun 6:30",
                        "ki_plan_update": "manual", "outdoor_temperature": ""}})
check("set ok " + repr(c.errors), not c.errors and c.results and c.results[-1]["changed"] is True)
check("set: alte Update-Optionen entfernt", not set(LEGACY) & set(entry.options))
check("set: leere Felder weg", "ki_hinweise" not in entry.options and "outdoor_temperature" not in entry.options)
check("set: Werte übernommen", entry.options["ai_task_entity"] == "ai_task.web" and entry.options["price_kwh"] == 0.31)
check("set: ki_auto (älteres Studio) still weg", "ki_auto" not in entry.options)
check("set: Zeitpläne übernommen, aus = nicht gespeichert, eigene Zeit vereinheitlicht",
      entry.options.get("ki_plan_energie") == "auto" and "ki_plan_heizung" not in entry.options
      and entry.options.get("ki_plan_rezept") == "sun 06:30" and entry.options.get("ki_plan_update") == "manual")
check("set: Antwort ohne Token-Wert", TOKEN not in repr(c.results[-1]))

# gleiche Eingabe → nichts geändert, kein Neuladen
n = len(hass.config_entries.updates)
c = ws_set({"options": dict(entry.options)})
check("set unverändert: changed False", c.results and c.results[-1]["changed"] is False and len(hass.config_entries.updates) == n)

# Zeitpläne fehlen → aus (kein Standard „an“ mehr wie früher bei ki_auto)
plans_before = {k: v for k, v in entry.options.items() if k.startswith("ki_plan_")}
c = ws_set({"options": {k: v for k, v in entry.options.items() if not k.startswith("ki_plan_")}})
check("ohne Zeitpläne: alles aus", not any(k.startswith("ki_plan_") for k in entry.options))
c = ws_set({"options": {**entry.options, **plans_before}})

# Fehler: falsche Domain, Preis außerhalb, unbekanntes Feld
before = dict(entry.options)
for bad in ({"ai_task_entity": "sensor.x"}, {"price_kwh": 5}, {"foo": 1},
            {"outdoor_temperature": "light.lampe"}, {"lueften_personen": ["light.x"]},
            {"ki_plan_energie": "sonntags"}, {"ki_plan_lueftung": "sun 25:00"}, {"ki_plan_update": "hourly"}):
    c = ws_set({"options": bad})
    check(f"Fehler für {list(bad)[0]}", c.errors and c.errors[0][0] == "invalid_format" and not c.results)
check("Fehler ändern nichts", entry.options == before)

# Ein älteres, noch offenes Studio schickt alte Update-Optionen oder key/token: still ignoriert.
n = len(hass.config_entries.updates)
c = ws_set({"options": {**entry.options, **LEGACY}, "key": KEY, "token": TOKEN})
check("set mit alten Feldern: kein Fehler " + repr(c.errors), not c.errors and c.results)
check("set mit alten Feldern: nichts gespeichert", not set(LEGACY) & set(entry.options)
      and c.results[-1]["changed"] is False and len(hass.config_entries.updates) == n)
c = ws_set({"options": {}, "key": None, "token": None})
check("set mit key/token null: kein Fehler", not c.errors and c.results)

# Beta-Versionen (Studio → Updates): Standard aus, an/aus über set, die Einstellungen-Seite
# schickt den Schlüssel nicht mit und lässt ihn damit stehen.
check("get: Beta-Versionen anfangs nicht gesetzt", "beta_updates" not in entry.options)
c = ws_set({"options": {**entry.options, "beta_updates": True}})
check("set: Beta an " + repr(c.errors), not c.errors and entry.options.get("beta_updates") is True
      and c.results[-1]["options"].get("beta_updates") is True)
c = ws_set({"options": {k: v for k, v in entry.options.items() if k != "beta_updates"}})
check("set ohne beta_updates: bleibt an", not c.errors and entry.options.get("beta_updates") is True
      and c.results[-1]["changed"] is False)
c = ws_set({"options": {**entry.options, "beta_updates": False}})
check("set: Beta aus → nicht gespeichert", not c.errors and "beta_updates" not in entry.options
      and c.results[-1]["changed"] is True)
c = ws_set({"options": {**entry.options, "beta_updates": "ja"}})
check("set: Beta kein bool → Fehler", c.errors and c.errors[0][0] == "invalid_format" and "beta_updates" not in entry.options)
check("Dialog: Beta aus wird nicht gespeichert", options.clean_options({"beta_updates": False}) == {}
      and options.clean_options({"beta_updates": True}) == {"beta_updates": True})

# build_options direkt: gleiche Bereinigung wie der Dialog
check("clean wie Dialog", build_options(hass, {}, {"lueften_push": [], "ki_hinweise": None}) == {})
check("ki_auto still weg", build_options(hass, {}, {"ki_auto": True}) == {})
check("tägliche eigene Zeit", build_options(hass, {}, {"ki_plan_energie": "7:05"}) == {"ki_plan_energie": "07:05"})

print("\n" + ("ALLES OK" if not fails else f"{len(fails)} FEHLER"))
sys.exit(1 if fails else 0)
