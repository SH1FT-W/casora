# HA-Annahmen

<!-- Vorlage aus repo-vorlagen/vorlagen/ha-annahmen.md. Liegt im Repo als docs/ha-annahmen.md.
     Der HA-Beta-Bericht (repo-vorlagen/ha-beta-bericht.md) gleicht diese Liste jeden Monat mit den
     Neuerungen der HA-Beta ab. Nur festhalten, was bei einer Änderung in HA still kaputtginge. -->

Worauf sich dieses Repo bei Home Assistant verlässt. Bei jeder Änderung am Code mitpflegen.

**Getestet mit:** HA 2026.10.1 (Gate), 2026.10.2 · **Mindestversion:** siehe `hacs.json` / `manifest.json`

Anlass: Issue #25. Jeder `device_tracker` ist in HA „diagnostic“ (`BaseTrackerEntity`), Casora blendete
Diagnose-Entitäten in Gerätelisten aus, das Feld „Tier“ blieb leer. Das Testhaus (`dev/casora_mock`) baute
alle Geräte auf der schlichten `Entity` auf und zeigte es nicht. Seitdem erben die Testgeräte von den echten
Plattform-Basisklassen (siehe `dev/casora_mock/entity.py`), und die Annahmen unten laufen gegen das echte
`homeassistant`-Paket.

## Annahmen

| Annahme | Wo im Code | Abgesichert durch |
|---|---|---|
| Jeder `device_tracker` hat `entity_category: diagnostic` (`BaseTrackerEntity`, schon in 2026.9.4) | `panel/casora-panel.js` `listCategory()`, `isPetTracker()`; `scripts/local/26-haustier.js` | `dev/unit/ha_annahmen_test.py`: `Categories.test_device_tracker_is_diagnostic` |
| Sensoren/Binärsensoren haben keine eigene Kategorie | Raum-/Gerätelisten filtern jede Kategorie: `casora-panel-basis.js`, `casora-panel-b-plus.js`, `scripts/casora-core.js` (Leistungssensoren), `raumklima.py` | `dev/unit/ha_annahmen_test.py`: `Categories.test_sensor_has_no_default_category` |
| `update`: config mit INSTALL, sonst diagnostic | Studio-Vorschläge (`casora-panel-basis.js`) bieten Updates deshalb nie an; Testhaus erbt es | `dev/unit/ha_annahmen_test.py`: `Categories.test_update_default_category` |
| `hass.entities` kommt aus `config/entity_registry/list_for_display` mit `ei, pl, di, ai, tk, ec` (Index in `entity_categories`), `hb, en, dp, lb, ic` | alles, was `hass.entities` liest: Kategorie/hidden (Raumlisten), `translation_key`/`platform` (`scripts/local/00-finder.js` `casoraDevice`, `byKey`, `casoraLaundryFind`), `display_precision` (Vorlagen) | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_display_fields` |
| Das Frontend übersetzt diese Schlüssel in `entity_id, device_id, area_id, translation_key, platform, entity_category, name, hidden, display_precision` | wie oben | `dev/unit/ha_annahmen_test.py`: `Frontend.test_hass_entities_mapping` (braucht `hass_frontend`) |
| Deaktivierte Entitäten fehlen in `hass.entities` (`disabled_by` dort nur Sicherheitsnetz) | `casora-panel-basis.js` u. a.; Python filtert selbst (`tanken.py`, `raumklima.py`) | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_disabled_entities_not_listed` |
| `hass.entities[id].name` ist nur der eigene Namensteil: Benutzername, sonst Name ohne Gerät | „Registry-Name zuerst“: `casora-panel-b-ux.js` (Geräteliste), `casora-panel-types.js`, `casora-panel-b-plus.js`, `casora-panel-b-mehr.js` | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_name_is_entity_part_only` |
| Tracker ohne eigenen Namen (`has_entity_name`, Name None) hat kein `name` in `hass.entities` | `casora-panel.js` `petName()` nimmt `name` als vom Nutzer vergebenen Tiernamen | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_unnamed_tracker_has_no_name` |
| Temperatur in °C ohne Vorgabe der Integration bekommt `display_precision` 1 | Zahlenformat der Vorlagen (`display_precision`) | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_temperature_default_display_precision` |
| `friendly_name` = Gerätename (`name_by_user` zuerst) + Entitätsname, ohne Entitätsname nur der Gerätename | `scripts/local/00-finder.js` `wasteLabel()` (#27), Zeilennamen in Popups | `dev/unit/ha_annahmen_test.py`: `FriendlyName.test_device_name_in_front` |
| Vom Nutzer vergebener Entitätsname steht allein, ohne Gerät davor | `wasteLabel()` | `dev/unit/ha_annahmen_test.py`: `FriendlyName.test_user_name_without_device` |
| Ohne `has_entity_name` an einem Gerät: Gerätename + eigener Name, außer der Name beginnt schon mit dem Gerät | wie oben; Testhaus (alle Mock-Entitäten sind so benannt) | `dev/unit/ha_annahmen_test.py`: `FriendlyName.test_legacy_name_gets_device_prefix` |
| `translation_key`s der Kern-Integrationen, nach denen Casora sucht (Liste `KEYS` im Test) | siehe „Fremde Integrationen“ | `dev/unit/ha_annahmen_test.py`: `ForeignKeys.test_translation_keys_exist` |
| Tractive: Gerät „Tracker <id>“ (Geräteübersetzung `tracker`), Tier-Gerät hängt per `via_device` daran | `casora-panel.js` `isPetTracker()`/`petName()`, `26-haustier.js` `P.find` | `dev/unit/ha_annahmen_test.py`: `ForeignKeys.test_tractive_layout` |
| HA-Dialoge: `ha-dialog` → (Shadow) `wa-dialog` → (Shadow) natives `<dialog>`, geöffnet mit `showModal()` | `scripts/casora-core.js` Dialog-Chrome (`patchShowModal`, `CSS_BY_HOST`) | `dev/unit/dialog_offset_fullscreen.mjs` (nur Casora-Seite) |
| HA zeigt Standard-Dialoge bei `max-width: 450px` oder `max-height: 500px` bildschirmfüllend (`min-height: 100dvh`); Casora setzt seinen Versatz nur außerhalb davon (`min-width: 451px and min-height: 501px`) | `scripts/casora-core.js` `CSS_BY_HOST['wa-dialog']` | `dev/unit/dialog_offset_fullscreen.mjs` (Grenze von Hand gegen `src/components/ha-dialog.ts` geprüft) |
| Vollbild-Dialoge tragen am `ha-dialog` das Attribut `fullscreen` bzw. `width="full"` | `scripts/casora-core.js` `wantsOffset()` | `dev/unit/dialog_offset_fullscreen.mjs` |
| `document.querySelector('home-assistant').hass.panels[hass.panelUrl].component_name` ist `lovelace` für Dashboards | `scripts/casora-core.js` `wantsOffset()` | `dev/unit/dialog_offset_fullscreen.mjs` (Attrappe) |
| Theme-Variable `--dialog-surface-margin-top` verschiebt HA-Dialoge (am Handy setzt HA sie selbst auf 0) | `theme.yaml` (`dialog-surface-margin-top`) | keiner |
| Lovelace-Ressourcen unter `hass.data["lovelace"].resources` (früher Dict-Schlüssel) mit `async_items`, `async_load`/`loaded`, `async_create_item`, `async_update_item`, `async_delete_item`; im yaml-Modus ohne `async_create_item` | `__init__.py` `_lovelace_resources`, `_sync_script_resources`, `_remove_script_resources` | `dev/unit/hemma_entfernen_test.py`, `dev/unit/remove_entry_resources_test.py` (Attrappen) |
| `async_remove_entry` läuft beim Löschen des Config-Eintrags | `__init__.py` | keiner |
| Themes: `hass.data["frontend_themes"]`, `["frontend_themes_store"]`, `["frontend_default_theme"]`, `["frontend_default_dark_theme"]`, Ereignis `themes_updated`, Dienst `frontend.set_theme` | `helfer.py` `_setup_theme`, `_inject_theme` | `dev/unit/theme_frueh_test.py`, `dev/unit/theme_hemma_umstellung_test.py` |
| `hass.formatEntityState(stateObj)` gibt den Zustand in der Sprache des Nutzers aus, auch übersetzte Zustände von Integrationen über `translation_key` (z. B. Dreame-Fehlercode `forward_suffocate` → Satz, ggf. mehrzeilig) | `scripts/local/02-devices.js` `errText` (Saugroboter-Fehler, #33) | `dev/unit/vacuum_error_text.mjs` (Attrappe; Rückfall ohne die Funktion: der Code) |
| Entitäten-Registry im Frontend (`hass.entities`) trägt `translation_key` und `device_id`; Geräte werden darüber sprachunabhängig gefunden (Roborock `vacuum_error`, Dreame `error`) | `scripts/local/00-finder.js` `entities`/`map`, `02-devices.js` `VFIND` | `dev/unit/vacuum_error_text.mjs` |
| Home Connect (HA-Kern) beim Geschirrspüler: `translation_key` `program_finish_time` (Sensor, `device_class: timestamp`, Endzeit statt Restdauer), `program_progress`, `active_program`/`selected_program` (Select, Programm-IDs mit Unterstrichen wie `…_eco_50`), `door` (Enum-Sensor `open`/`closed`/`locked`), Knopf `stop_program` | `scripts/local/02-devices.js` `_casoraDish` (`resolve`, `minutes`, `progName`, `isOpen`), `panel/casora-panel-types.js` Felder `casora_dishwasher` | `dev/unit/spueler_home_connect_core.mjs` (Schlüssel von Hand gegen `homeassistant/components/home_connect` 2026.10 geprüft) |
| Gerät-Registry im Frontend (`hass.devices[id].model`, `name`) und `device_class` der Nachbar-Sensoren (`energy`, `voltage`, `power_factor`, `frequency`) unterscheiden eine Messklemme von einer Steckdose (#44) | `panel/casora-panel-basis.js` `meterDevice`, `scripts/local/01-basis.js` `_casoraHousePower` | `dev/unit/house_power.mjs` (Fall 8b) |
| Kamera-WebRTC über `camera/webrtc/offer` (go2rtc): die Antwort auf ein Angebot mit Mikrofonspur (`sendrecv`) liefert auch die Tonspur der Kamera zurück; `ha-camera-stream` baut seinen Player bei `muted` ohne Tonspur neu (#23) | `scripts/local/24-klingel.js` `P._talk` (`ontrack`), `P._applyAudio`, `P._talkStop` | `dev/unit/klingel.mjs` (Attrappen; echte Klingel nicht im Test) |
| KI-Aufgaben (`ai_task.*`): das Modell steht im Unterzugang der Integration unter `chat_model` (Anthropic, OpenAI, Google) bzw. `model` (OpenRouter, Ollama); OpenRouter mit Anbieter davor (`anthropic/claude-sonnet-4.5`) | `ki.py` `ai_models`, `model_rank` | `dev/unit/ki_modell_gateway_test.py` (Attrappe; Schlüssel von Hand gegen `homeassistant/components/open_router` 2026.10 geprüft) |
| In HA versteckte Entitäten tragen in `hass.entities` `hidden: true` (Anzeige-Eintrag; `hidden_by` nur zur Sicherheit mitgeprüft); HAs eigener Kalender blendet sie aus, Casoras Kalender-Automatik ebenso (#38) | `scripts/local/06-kalender.js` `autoCals` | `dev/unit/kalender_versteckt.mjs` (Attrappe) |
| Anzeige-Einträge in `hass.entities` tragen `platform` (keine `unique_id`): eine Pflanze von Pflanzenmonitor Plus ist im Browser `sensor.*` mit `platform` `pflanzenmonitor_plus` und `translation_key` `status` | `scripts/casora-core.js` `casoraIsPlant`, `panel/casora-panel.js` `isPlantEntity` | `dev/unit/plant_plus.mjs` (Attrappe) |
| Entitäten-Registry (Python): die Pflanze von Pflanzenmonitor Plus hat `platform` `pflanzenmonitor_plus`, Domain `sensor`, `unique_id` „`<Pflanze>-status`“ | `ki.py` `is_plant`, `plant_devices` (auch `raumklima.py`) | `dev/unit/plant_plus_test.py` (Attrappe) |
| Jinja `integration_entities('pflanzenmonitor_plus')` gibt ohne die Integration eine leere Liste (kein Fehler) | `ki/pflanzen.yaml` `room_lux` | keiner |

Nur im Testhaus, kein Test: `async_update_entity(area_id=…)` lehnt seit 2026.10 einen eigenen Bereich für
Entitäten ohne eigenen Namen ab (`dev/casora_mock/__init__.py` `build_registry`, fängt den `ValueError` ab).

## Fremde Integrationen

Kern-Integrationen (Schlüssel im Test geprüft):

- `tractive`: Tracker, Akku, Status, Live/Summer/LED, Aktivität und Schlaf (`26-haustier.js`)
- `reolink`: Kamera-Streams `main`/`sub`/`snapshots_*`, Klingel-Sensoren, Schnellantworten, Lautstärken
  (`casora-core.js` `casoraCamStill`, `24-klingel.js`, `casora-panel-b-ux.js`)
- `roborock`: Status, Raum, Verbrauchsteile, Nicht-stören, Modi, Karte (`02-devices.js`, `00-finder.js`,
  `live_finder.py`)
- `home_connect`, `miele`, `smartthings`, `lg_thinq`, `whirlpool`: Wäsche/Spüler (`00-finder.js`
  `casoraLaundryFind`, `live_finder.py`), Home Connect auch Kaffee
- `cookidoo` (Rezept, `03-popups.js`, `ki.py`), `backup` (`03-popups.js`), `proximity` (`15-person.js`),
  `unifi` (Netzwerk, `00-finder.js`), `lamarzocco` (Kaffee, `25-kaffee.js`), `tankerkoenig` (nur `platform`,
  `tanken.py`)

Nicht im Kern-Paket prüfbar (HACS), Casora liest `platform`/`translation_key`:
`waste_collection_schedule`, `frigate`, `ha_washdata`, `home_connect_alt`/`homeconnect_ws`, `bambu_lab`,
`anker_solix`, `pulse`, `teamtracker`, `bosch_ebike`, `powercalc`, `browser_mod`, `hacs`, Kaffee-Integrationen
(De'Longhi, Jura, Melitta), Auto-Integrationen.

Bekannt wacklig (Stand 2026.10.1, nicht im Test, weil es Rückfälle bzw. HACS-Schlüssel sind):

- `reolink`: Kamera `clear`, `fluent`, `balanced` und Auswahl `day_night` gibt es im Kern nicht (nur Rückfall).
- `mobile_app` setzt keine `translation_key`s; `15-person.js` findet Akku/WLAN nur über die Entitäts-ID.
- Bosch-Raumklima-Schlüssel (`call_for_heat`, `summer_mode` …) gibt es nur in einer HACS-Variante;
  `ki.py` (`call_for_heat`) hat keinen Rückfall.
- `main_switch` (Fußbodenheizung) und `warnings` (Wetterwarnung) gibt es in keiner Kern-Integration.

## Prüfbefehl

Befehl, der die Annahmen gegen eine bestimmte HA-Version prüft:

```sh
dev/qa/ha-annahmen.sh                   # neueste stabile Version + neueste Beta (ohne Beta: übersprungen)
HA_VERSION=beta dev/qa/ha-annahmen.sh   # nur die Beta
dev/qa/ha-annahmen.sh standard          # Standardversion des Gates (läuft auch im Gate, Schritt unit)
```
