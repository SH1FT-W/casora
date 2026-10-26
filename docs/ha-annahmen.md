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
| Das Frontend gibt `hass.entities` bei einer Registry-Änderung als neues Objekt weiter (`_updateHass({ entities })`, nur wenn sich etwas geändert hat, sonst bleibt das alte) und ändert das alte nie an Ort und Stelle; ebenso `hass.devices`, `hass.states` bei jeder Zustandsänderung | Caches je Registry-Objekt: `scripts/local/00-finder.js` `casoraDeviceEntities` (Entitäten je Gerät), `casoraFridgeFind.all` (zusätzlich je `hass.devices`/`hass.states`), dazu die älteren Caches dort (`memo.reg !== R`); Türen/Fenster (`casoraContacts`) und „abwesend“ (`securityAway`) einmal je `hass.states` des `home-assistant`-Elements, E-Bike-Suche (`scripts/local/03-popups.js` `B.bikes`) je Registry und `hass.states` | `dev/unit/finder_performance.mjs` (Attrappe: neues Objekt → neue Antwort), `dev/unit/state_proxy_reads.mjs`, `dev/qa/regress/r341_room_switch_speed.mjs`; im Frontend von HA 2026.10.1 nachgelesen (`app.*.js`, 25.10.2026), nicht automatisch geprüft |
| Deaktivierte Entitäten fehlen in `hass.entities` (`disabled_by` dort nur Sicherheitsnetz) | `casora-panel-basis.js` u. a.; Python filtert selbst (`tanken.py`, `raumklima.py`) | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_disabled_entities_not_listed` |
| `hass.entities[id].name` ist nur der eigene Namensteil: Benutzername, sonst Name ohne Gerät | „Registry-Name zuerst“: `casora-panel-b-ux.js` (Geräteliste), `casora-panel-types.js`, `casora-panel-b-plus.js`, `casora-panel-b-mehr.js` | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_name_is_entity_part_only` |
| Tracker ohne eigenen Namen (`has_entity_name`, Name None) hat kein `name` in `hass.entities` | `casora-panel.js` `petName()` nimmt `name` als vom Nutzer vergebenen Tiernamen | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_unnamed_tracker_has_no_name` |
| Temperatur in °C ohne Vorgabe der Integration bekommt `display_precision` 1 | Zahlenformat der Vorlagen (`display_precision`) | `dev/unit/ha_annahmen_test.py`: `RegistryDisplay.test_temperature_default_display_precision` |
| `friendly_name` = Gerätename (`name_by_user` zuerst) + Entitätsname, ohne Entitätsname nur der Gerätename | `scripts/local/00-finder.js` `wasteLabel()` (#27), Zeilennamen in Popups | `dev/unit/ha_annahmen_test.py`: `FriendlyName.test_device_name_in_front` |
| Vom Nutzer vergebener Entitätsname steht allein, ohne Gerät davor | `wasteLabel()` | `dev/unit/ha_annahmen_test.py`: `FriendlyName.test_user_name_without_device` |
| Ohne `has_entity_name` an einem Gerät: Gerätename + eigener Name, außer der Name beginnt schon mit dem Gerät | wie oben; Testhaus (alle Mock-Entitäten sind so benannt) | `dev/unit/ha_annahmen_test.py`: `FriendlyName.test_legacy_name_gets_device_prefix` |
| `translation_key`s der Kern-Integrationen, nach denen Casora sucht (Liste `KEYS` im Test) | siehe „Fremde Integrationen“ | `dev/unit/ha_annahmen_test.py`: `ForeignKeys.test_translation_keys_exist` |
| Tractive: Gerät „Tracker <id>“ (Geräteübersetzung `tracker`), Tier-Gerät hängt per `via_device` daran | `casora-panel.js` `isPetTracker()`/`petName()`, `26-haustier.js` `P.find` | `dev/unit/ha_annahmen_test.py`: `ForeignKeys.test_tractive_layout` |
| WebSocket `persistent_notification/subscribe` liefert zuerst `type: current` mit allen Benachrichtigungen, danach `added`/`updated`/`removed`, je `notifications: {id: {notification_id, title, message, created_at}}`; der Dienst `persistent_notification.dismiss` (`notification_id`) entfernt eine (#70) | `scripts/casora-core.js` Glocke `watchPn()`, `standing()`, `hideRows()` | `dev/qa/regress/r347_bell_ha_notifications.mjs` (Test-HA) |
| Ab HA 2026.11: `camera/capabilities` liefert `two_way_audio` (nur WebRTC, Labs-Vorschau, Reolink nur bei RTSP); `ha-camera-stream` hat `toggleMicrophone()` und `microphoneState` und meldet `microphone-changed` (`off`/`connecting`/`on`/`denied`); HA schließt dabei seine Verbindung und startet eine mit Bild und Mikrofon. go2rtc gibt den Rückkanal erst frei, wenn diese Verbindung endet (#23) | `scripts/local/24-klingel.js` `_talk`, `_talkNative`, `_talkStop` | `dev/unit/klingel.mjs` (Attrappe von HAs Player); gegen core#184716 und frontend#54660 gelesen, nicht automatisch geprüft |
| HA-Dialoge: `ha-dialog` → (Shadow) `wa-dialog` → (Shadow) natives `<dialog>`, geöffnet mit `showModal()` | `scripts/casora-core.js` Dialog-Chrome (`patchShowModal`, `CSS_BY_HOST`) | `dev/unit/dialog_offset_fullscreen.mjs` (nur Casora-Seite) |
| HA zeigt Standard-Dialoge bei `max-width: 450px` oder `max-height: 500px` bildschirmfüllend (`min-height: 100dvh`); Casora setzt seinen Versatz nur außerhalb davon (`min-width: 451px and min-height: 501px`) | `scripts/casora-core.js` `CSS_BY_HOST['wa-dialog']` | `dev/unit/dialog_offset_fullscreen.mjs` (Grenze von Hand gegen `src/components/ha-dialog.ts` geprüft) |
| Vollbild-Dialoge tragen am `ha-dialog` das Attribut `fullscreen` bzw. `width="full"` | `scripts/casora-core.js` `wantsOffset()` | `dev/unit/dialog_offset_fullscreen.mjs` |
| `document.querySelector('home-assistant').hass.panels[hass.panelUrl].component_name` ist `lovelace` für Dashboards | `scripts/casora-core.js` `wantsOffset()` | `dev/unit/dialog_offset_fullscreen.mjs` (Attrappe) |
| Theme-Variable `--dialog-surface-margin-top` verschiebt HA-Dialoge (am Handy setzt HA sie selbst auf 0) | `theme.yaml` (`dialog-surface-margin-top`) | keiner |
| Lovelace-Ressourcen unter `hass.data["lovelace"].resources` (früher Dict-Schlüssel) mit `async_items`, `async_load`/`loaded`, `async_create_item`, `async_update_item`, `async_delete_item`; im yaml-Modus ohne `async_create_item` | `__init__.py` `_lovelace_resources`, `_sync_script_resources`, `_remove_script_resources` | `dev/unit/hemma_entfernen_test.py`, `dev/unit/remove_entry_resources_test.py` (Attrappen) |
| `async_remove_entry` läuft beim Löschen des Config-Eintrags | `__init__.py` | keiner |
| HACS schlüsselt Gerät (`identifiers {("hacs", <GitHub-ID>)}`) und Update-Entität (`unique_id` = GitHub-ID) eines geladenen Repos nach der GitHub-ID; Casora `1404244036` (`const.UPDATE_REPO_ID`), Hemma `1100856001`. Nur über die Registry erkannt (kein `.storage/hacs.repositories`, keine HACS-Objekte); ein Hemma aus einem Fork (andere ID) gilt als einfacher Ordner | `update.py` `hacs_knows`/`hacs_repo_id`, `hemma_cleanup.py` `hacs_repo` | `dev/unit/update_github_test.py`, `dev/unit/update_report_only_test.py`, `dev/unit/hemma_entfernen_test.py`, `dev/pytest/test_update_push.py` (HACS selbst nicht im Test; Quelle HACS `entity.py`, 24.10.2026) |
| Panels laden ihr Modul per URL ohne Anmeldung; Casoras Studio-Lader `casora-studio.js` entsteht beim Start im Speicher (`scripts_view.studio_loader`) und wird von `CasoraPanelView` (`requires_auth = False`, nur statischer Code) ausgeliefert; das Vorlagen-Bündel liegt fertig im Paket, nur mit Vorlagen-Baum im Config-Ordner (Entwicklung) wird es im Speicher gebaut. Nichts wird zur Laufzeit ins Paket geschrieben | `scripts_view.py`, `templates.py` `bundle_text`, `template_refresh.py` | `dev/unit/auslieferung_test.py`, `dev/unit/no_config_writes_test.py` (6, 7), `dev/pytest/test_setup.py` `test_setup_schreibt_nichts_in_den_integrationsordner` |
| Eine Integration kann keine Themes anmelden (öffentlich nur `configuration.yaml` → `frontend: themes:`); `frontend.add_extra_js_url` lädt ein Modul auf jeder Seite, auch in neu verbundenen Browsern | `theme.py` `async_setup_theme` (lädt `scripts/casora-theme.js`), kein Theme-Ordner, kein `hass.data["frontend_themes"]` mehr | `dev/unit/theme_served_test.py`, `dev/unit/no_config_writes_test.py`, `dev/qa/regress/r327_no_yaml.mjs`, `r333_theme_selection.mjs` |
| HA legt sein Theme inline auf `<html>` (`--name`, für Hex-Farben `--rgb-name`, außer das Theme bringt `rgb-name` selbst mit; Grundwerte, dann `modes.light`/`modes.dark`); Hell/Dunkel steht in `hass.themes.darkMode`. Eine `:root`-Regel mit `!important` gewinnt gegen den Inline-Stil | `scripts/casora-theme.js` `vars()`/`apply()` | `dev/unit/casora_theme_js.mjs` (Attrappe), `r327_no_yaml.mjs` (echtes Frontend) |
| `hass.selectedTheme.theme` = Theme-Wahl im Profil (HA hält sie je Benutzer in den Frontend-Nutzerdaten, Schlüssel `theme`, und im `localStorage` `selectedTheme`); `""` = „Vom Backend ausgewählt“, `"default"` = HAs eingebautes Theme. Casora entscheidet: Casora-Design im Profil > echtes anderes HA-Theme oder bewusst `"default"` („Home Assistant“, kein Casora-Design) > Design der Installation (bei `""`, unbekanntem Namen und alten Casora-Namen) | `casora-theme.js` `browserPick()`/`active()` | `dev/unit/casora_theme_js.mjs` (Fälle 2, 4), `dev/qa/regress/r333_theme_selection.mjs` |
| UIX sucht seine Theme-Stile (`uix-*`, `card-mod-*`) über `--uix-theme` im Namen nach in `hass.themes.themes[name]` (Browser-Kopie) und liest neu bei `document`-Ereignis `uix-update` | `casora-theme.js` `register()` (legt alle Designs in die Browser-Kopie, sendet `uix-update`) | `r333_theme_selection.mjs` (UIX nicht im Kern prüfbar; geprüft gegen UIX-Stand 10/2026) |
| HAs Profil-Theme-Auswahl (`ha-theme-picker`) listet `Object.keys(hass.themes.themes)` (gemerkt je Listen-Objekt) plus „Home Assistant“ (`default`); HA wendet ein dort gewähltes Theme an, indem es den Namen in `hass.themes.themes` nachschlägt. `document.querySelector("home-assistant")._updateHass({themes})` reicht eine neue Liste an alle Teile weiter (Frontend-intern, kein Python); ohne die Methode füllt Casora die Liste an Ort und Stelle (dann sieht nur eine schon offene Auswahl die Designs evtl. nicht). Ein `themes_updated` ersetzt die Liste, Casora legt die Designs wieder hinein. `_updateHass` zeichnet das ganze Frontend neu: Casora reicht eine Liste nur einmal weiter, nie aus dem eigenen Aufruf heraus, höchstens 3× in 10 s (danach an Ort und Stelle) | `casora-theme.js` `register()` | `dev/unit/casora_theme_js.mjs` (Fall 4 und 4b, Attrappe), `r341_room_switch_speed.mjs` (kein `_updateHass` mit `themes` im Leerlauf und beim Raumwechsel), `r333_theme_selection.mjs` (echtes Frontend 20260930) |
| Ereignis `settheme` am Element `home-assistant` (`detail: {theme}`) setzt die Profil-Theme-Wahl wie HAs eigene Auswahl (Browser + Nutzerdaten); `frontend/get_user_data`/`frontend/set_user_data` lesen/schreiben einen eigenen Schlüssel je Benutzer | `casora-theme.js` `setProfile()`, `migrate()` (alte Namen → „Vom Backend ausgewählt“; einmal je Benutzer, Merker `casora_theme_profile`: Profil = Design der Installation oder `"default"` aus 26.10.60b1 → „Vom Backend ausgewählt“), `set()` (Studio-Wahl: Profil folgt der Installation) | `dev/unit/casora_theme_js.mjs` (Fall 4), `r333_theme_selection.mjs` |
| HAs Frontend speichert das Standard-Theme unter `.storage/frontend_theme` (`frontend_default_theme`, `frontend_default_dark_theme`) und behält dort einen unbekannten Namen | `theme.py` `_migrate` (liest einmal beim ersten Start, schreibt nie) | `dev/unit/theme_served_test.py` (Attrappe) |
| Ein Skript, dessen YAML fehlt, steht nur als wiederhergestellter Platzhalter (`restored: true`) in den Zuständen | `legacy_cleanup.py` `_loaded_scripts` (nur geladene alte Skripte gelten als Reste) | `dev/unit/legacy_cleanup_test.py`, `dev/unit/no_config_writes_test.py` |
| Skript-Konfig-API des Skript-Editors: `GET`/`DELETE /api/config/script/config/<object_id>` (nur Admins) liest bzw. löscht einen Eintrag in `scripts.yaml` (404, wenn er dort nicht steht, z. B. in einem Paket); `DELETE` entfernt auch den Registry-Eintrag und damit die Entität. Aus Python gibt es dafür keine öffentliche API | `scripts/casora-legacy-cleanup.js` (einmaliges Aufräumen der vier alten Casora-Skripte im Browser eines Admins); Abgleich mit Casoras Fassung über Alias + Ablauf (`legacy_cleanup.py` `FINGERPRINTS`) | `dev/unit/legacy_cleanup_js.mjs` (Attrappe), `dev/qa/regress/r332_legacy_cleanup.mjs` (echtes HA) |
| `search/related` mit `item_type: "entity"` und `item_id: "script.<id>"` nennt Automationen, Skripte, Szenen, Gruppen und Personen, die die Skript-Entität verwenden (mit `item_type: "script"` kämen nur Dinge, die das Skript selbst verwendet). Direkte Aufrufe `action: script.<id>` erkennt die Suche nicht; dafür liest Casora `automation/config` und `script/config` jeder Automation/jedes Skripts und alle Dashboards (`lovelace/dashboards/list`, `lovelace/config`) als Text | `scripts/casora-legacy-cleanup.js` `usages()` | `dev/unit/legacy_cleanup_js.mjs`, `r332_legacy_cleanup.mjs` |
| Dienst `frontend.reload_themes` liest den Theme-Ordner neu ein (nach dem Löschen von Casoras alter `themes/casora-themes.yaml`) | `legacy_cleanup.py` `async_run` (einmal, nur mit Casoras Kennzeile, Ergebnis in `.storage/casora.legacy_cleanup`) | `dev/unit/legacy_cleanup_test.py` (Attrappe), `r332_legacy_cleanup.mjs` |
| `persistent_notification.async_create(hass, message, title, notification_id)` zeigt eine Mitteilung (Markdown) bis zum Schließen oder Neustart | `legacy_cleanup.py` `_tell` (einmalige Mitteilung „Casora hat aufgeräumt“) | `dev/unit/legacy_cleanup_test.py`, `r332_legacy_cleanup.mjs` (`persistent_notification/get`) |
| `hass.formatEntityState(stateObj)` gibt den Zustand in der Sprache des Nutzers aus, auch übersetzte Zustände von Integrationen über `translation_key` (z. B. Dreame-Fehlercode `forward_suffocate` → Satz, ggf. mehrzeilig) | `scripts/local/02-devices.js` `errText` (Saugroboter-Fehler, #33) | `dev/unit/vacuum_error_text.mjs` (Attrappe; Rückfall ohne die Funktion: der Code) |
| Entitäten-Registry im Frontend (`hass.entities`) trägt `translation_key` und `device_id`; Geräte werden darüber sprachunabhängig gefunden (Roborock `vacuum_error`, Dreame `error`, Ecovacs `stats_area`/`stats_time`) | `scripts/local/00-finder.js` `entities`/`map`/`vacuumFields` (Saugroboter-Karte, Studio-Felder `find.vac`, Glocke `casora-core.js` `vacSide`), Python-Spiegel `live_finder.py` `VACUUM_FIELDS` (Ecovacs-Dauer in Sekunden, angezeigt in Minuten: `live_activity.py` `_seconds` liest die Einheit) | `dev/unit/vacuum_error_text.mjs`, `dev/unit/vacuum_studio_fields.mjs`, `dev/unit/vacuum_bell_fields.mjs`, `dev/unit/live_finder_test.py` (Abgleich JS/Python); Ecovacs-Schlüssel in `ha_annahmen_test.py` (`KEYS`) |
| Bambu Lab (HACS): Drucker = Gerät mit Sensor `print_status` oder `stage`; Felder über `translation_key` (`print_progress`, `remaining_time` in Stunden, `subtask_name`, Kamera `camera`, Licht `chamber_light`, Knöpfe `pause`/`resume`/`stop`), AMS als Untergerät | `scripts/local/00-finder.js` `casoraDevice.printerFields`/`isPrinter` (Karte `02-devices.js` `_casoraPrint`, Studio `find.print` und neue Kachel, Assistent, Kamera-Kachel ohne Druckerkameras), `live_finder.py` `PRINTER_FIELDS`/`is_printer` | `dev/unit/live_finder_test.py` (Abgleich JS/Python), `dev/unit/haeuser.mjs` (`drucker_bambu_kamera.json`); HACS, Schlüssel nicht im Kern prüfbar |
| Home Connect (HA-Kern) beim Geschirrspüler: `translation_key` `program_finish_time` (Sensor, `device_class: timestamp`, Endzeit statt Restdauer), `program_progress`, `active_program`/`selected_program` (Select, Programm-IDs mit Unterstrichen wie `…_eco_50`), `door` (Enum-Sensor `open`/`closed`/`locked`), Knopf `stop_program` | `scripts/local/00-finder.js` `casoraLaundryFind.SOURCES` (`dish` je Quelle, `dish()`), `02-devices.js` `_casoraDish` (`resolve`, `minutes`, `progName`, `isOpen`), `panel/casora-panel-types.js` Felder `casora_dishwasher` (`find.dish`) | `dev/unit/spueler_home_connect_core.mjs`, `dev/unit/dishwasher_sources.mjs`; Schlüssel in `dev/unit/ha_annahmen_test.py` (`KEYS`) |
| Home Connect (HA-Kern) beim Geschirrspüler, Issue #77: Startzeit `number` `start_in_relative` (Sekunden, `min`/`max`/`step` als Attribute, Option des gewählten Programms), Optionen als `switch` (`extra_dry`, `half_load`, `vario_speed_plus`, `silence_on_demand`, `hygiene_plus`, `intensiv_zone`, nur solange das Programm sie anbietet), `power`, Fernstart `binary_sensor` `remote_start`; Salz/Klarspüler/Pflege nur als Ereignis-Sensoren (`salt_nearly_empty`, `salt_lack`, `rinse_aid_…`, `machine_care_reminder` …) mit `present`/`confirmed`/`off`; kein Start-Knopf – gestartet wird mit der Aktion `home_connect.start_selected_program` (`device_id`, `b_s_h_common_option_start_in_relative`, übernimmt die Optionen des gewählten Programms), ohne sie über den Select `active_program`. Deutsche Entitäts-IDs (`…_start_in_relativ`, `…_hygiene`, `…_intensivzone`, `…_fernstart`) nur als Rückfall ohne `translation_key` | `00-finder.js` `SOURCES` `home_connect.dish`, `DISH_NAMES`; `02-devices.js` `_casoraDish` (`resolve`, `startSvc`, `go`, `delayFor`, `numInfo`, `fill`, `onEv`) | `dev/unit/dishwasher_home_connect_77.mjs`; Schlüssel in `ha_annahmen_test.py` (`KEYS`), Aktion und Ereignis-Zustände `ForeignKeys.test_home_connect_start_selected_program` |
| Home Connect (HA-Kern): Backofen, Kaffeevollautomat und Geschirrspüler melden alle `operation_state`; nur die Programm-Optionen (`dishcare_…`, `cooking_oven_…`, `consumer_products_coffee_maker_…`) sagen, was das Gerät ist | `00-finder.js` `casoraLaundryFind.dishwashers` (Rolle aus `SOURCES`), Studio neue Kachel (`casora-panel.js` `TILE_MAIN_FIND.casora_dishwasher`) und Assistent (`casora-panel-assist.js`) | `dev/unit/haeuser.mjs` (`kueche_spueler_ofen_kaffee_es.json`), `dev/unit/live_finder_test.py` (Backofen) |
| Miele (HA-Kern) beim Geschirrspüler: `status`, `program_id`, `program_phase`, `remaining_time`/`finish`, Knöpfe `start`/`stop`, Tür als `binary_sensor` mit `device_class: door` ohne `translation_key`; nur der Spüler hat `salt_level`/`rinse_aid_level`/`power_disk_level` (Rolle, Prozent, nicht als Füllstand gezeigt) | `00-finder.js` `SOURCES` `miele` (`role`, `dish`), `live_finder.py` `_miele_role` | `dev/unit/dishwasher_sources.mjs`, `dev/unit/live_finder_test.py`; Schlüssel in `ha_annahmen_test.py` (`KEYS`) |
| Gerät-Registry im Frontend (`hass.devices[id].model`, `name`) und `device_class` der Nachbar-Sensoren (`energy`, `voltage`, `power_factor`, `frequency`) unterscheiden eine Messklemme von einer Steckdose (#44) | `panel/casora-panel-basis.js` `meterDevice`, `scripts/local/01-basis.js` `_casoraHousePower` | `dev/unit/house_power.mjs` (Fall 8b) |
| Energie-Einstellungen über `energy/get_prefs` (Fehler `not_found`, solange nichts eingerichtet ist): `energy_sources` vom Typ `grid`, `solar`, `battery` tragen ihren Leistungssensor in `stat_rate` (Netz und Akku zusätzlich `power_config`; bei `stat_rate_inverted` bzw. `stat_rate_from`/`stat_rate_to` schreibt HA seinen eigenen Template-Sensor in `stat_rate`; altes Netz-Format `power: [{stat_rate}]`). Vorzeichen: Netz positiv = Bezug, Akku positiv = Entladen, Solar positiv, also Haus = Netz + Solar + Akku (#44). Ein Solar- oder Akku-Sensor daraus, der `unavailable`/`unknown` ist, gilt als schlafender Wechselrichter (0 W) | `scripts/local/00-finder.js` `casoraEnergyPrefs`/`casoraEnergyHouse`, `panel/casora-panel-basis.js` `prefsHouse`, `panel/casora-panel.js` `prefsHomePower`, `scripts/local/01-basis.js` `_casoraHousePowerIds`, `scripts/local/20-energie-fokus.js` `detect`/`peers`/Kopf, `scripts/local/05-weich-mehr.js` Kopf, „Woher kommt der Strom“ und Energiefluss E1 (`E.flowSources`/`E.flowValues`, #62: Netz/Solar/Akku des Haus-Popups, wo die Kachel nichts nennt), `panel/casora-panel.js` `energyBackToAuto` („Zurück auf Automatisch“, #78), Standard-Look des Energie-Popups (`casora_popup_energy` → `E.build` mit `only: 'top'`: Netz/Solar/Akku als Zeilen „Woher kommt der Strom“ mit denselben Vorzeichen, HAs Einzelgeräte, Audit b7), `panel/casora-panel-diagnostics.js` `energyOf` (Diagnose zählt Quellen je `type` inkl. `gas`/`water`, welche einen `stat_rate` haben, und `device_consumption` mit `stat_consumption`/`stat_rate`) | `dev/unit/studio_diagnostics.mjs` (Energie-Teil, auch altes Netz-Format), `dev/unit/ha_annahmen_test.py` (Typen, Schema und `stat_rate`-Erzeugung gegen das installierte HA), `dev/unit/house_power.mjs` (Fälle 12–14), `dev/unit/energie_fokus.mjs`, `dev/unit/energy_flow_e1.mjs` (Fall 13), `dev/unit/energy_standard_list.mjs`, `dev/unit/haeuser/energie_prefs_netz_solar_akku.json`; im Browser (Antwort untergeschoben) `dev/qa/regress/r353_energy_matrix.mjs` |
| Der Kreis „CO₂-neutral“ im Energie-Dashboard kommt aus der Integration CO2 Signal / Electricity Maps (`hass.entities[id].platform === 'co2signal'`), Sensor in `%` = fossiler Anteil des Netzstroms; angezeigt wird 100 − Wert (wie das HA-Frontend: erste Entität in `hass.entities` mit `platform` `co2signal` und Einheit `%`, nachgelesen im Frontend von 2026.10.2) (#62) | `scripts/local/05-weich-mehr.js` `co2Of`, `E.flowValues` | `dev/unit/energy_flow_e1.mjs` (Fall 13, Attrappe); gegen HA nicht automatisch geprüft |
| Kamera-WebRTC über `camera/webrtc/offer` (go2rtc): die Antwort auf ein Angebot mit Mikrofonspur (`sendrecv`) liefert auch die Tonspur der Kamera zurück; `ha-camera-stream` baut seinen Player bei `muted` ohne Tonspur neu (#23) | `scripts/local/24-klingel.js` `P._talk` (`ontrack`), `P._applyAudio`, `P._talkStop` | `dev/unit/klingel.mjs` (Attrappen; echte Klingel nicht im Test) |
| KI-Aufgaben (`ai_task.*`): Casora liest das Modell nur über öffentliche Wege, nie aus `runtime_data`, SDK-Clients oder Config-Einträgen anderer Integrationen (HACS-Review hacs/default#12143, Punkt 5). Das Gerät der KI-Aufgabe trägt das Modell in `model`/`model_id` (Anthropic: Anzeigename + ID, OpenAI, Google, Ollama ohne Tag); OpenRouter setzt kein Modell, sein Unterzugangstitel und damit der Gerätename ist der Modellname („Anthropic: Claude Sonnet 4.5“). Sonst tippt der Nutzer den Modellnamen im Studio (Option `ai_task_models`) | `ki.py` `entity_model`, `ai_models`, `model_rank`; Studio `casora-panel-settings.js` `aiModelGroup` | `dev/unit/ai_public_api_test.py` (`HAReality` gegen das installierte HA, `Real` mit echten Registries), `dev/unit/ki_modell_gateway_test.py` |
| Dienst `ai_task.generate_data`: `entity_id` ist optional (ein einzelner Wert); ohne antwortet HAs bevorzugte KI-Aufgabe, ohne Vorzug kommt der Fehler „No entity_id provided and no preferred entity set“. Antwort mit `return_response` als `{data: …}`. KI-Aufgaben, die Daten erzeugen können, tragen im Zustand `supported_features` mit Bit 1 (`AITaskEntityFeature.GENERATE_DATA`) | `ki.py` `generate` (bei genau diesem Fehler einmal mit der ersten passenden KI-Aufgabe, `_first_ai_task`), `ask_ai`, Dienst `casora.ai_generate` (`register_ai_generate`), den `ki/kamera.yaml`, `pflanzen.yaml`, `rezept.yaml`, `update.yaml` statt `ai_task.generate_data` aufrufen | `dev/unit/ai_public_api_test.py` (`test_no_preferred_error_text`, `test_generate_data_entity_optional`, `test_generate_data_feature_bit`, `test_ask_*`, `test_yaml_flow_*` durch HAs Skript-Engine) |
| Frontend-Befehl `ai_task/preferences/get` liefert `gen_data_entity_id` (HAs bevorzugte KI-Aufgabe) | Studio `casora-panel-settings.js` (Hinweis „Automatisch: …“ bei mehreren KI-Aufgaben ohne Wahl) | keiner (fehlt er, steht nur „Automatisch“) |
| In HA versteckte Entitäten tragen in `hass.entities` `hidden: true` (Anzeige-Eintrag; `hidden_by` nur zur Sicherheit mitgeprüft); HAs eigener Kalender blendet sie aus, Casoras Kalender-Automatik ebenso (#38) | `scripts/local/06-kalender.js` `autoCals` | `dev/unit/kalender_versteckt.mjs` (Attrappe) |
| Anzeige-Einträge in `hass.entities` tragen `platform` (keine `unique_id`): eine Pflanze von Pflanzenmonitor Plus ist im Browser `sensor.*` mit `platform` `pflanzenmonitor_plus` und `translation_key` `status` | `scripts/local/00-finder.js` `casoraIsPlant` (einzige Definition; `casora-core.js`, Vorlagen und `panel/casora-panel.js` `isPlantEntity` fragen sie) | `dev/unit/plant_plus.mjs` (Attrappe) |
| Entitäten-Registry (Python): die Pflanze von Pflanzenmonitor Plus hat `platform` `pflanzenmonitor_plus`, Domain `sensor`, `translation_key` `status` (wie im Browser) und `unique_id` „`<Pflanze>-status`“ | `ki.py` `is_plant`, `plant_devices` (auch `raumklima.py`) | `dev/unit/plant_plus_test.py` (Attrappe, Abgleich mit `casoraIsPlant`) |
| Jinja `integration_entities('pflanzenmonitor_plus')` gibt ohne die Integration eine leere Liste (kein Fehler) | `ki/pflanzen.yaml` `room_lux` | keiner |
| Status-LEDs sind Lichter mit Kategorie „config“: Reolink `status_led`, UniFi `led_control` | „Neu beginnen“ (`casora-panel-basis.js` `plan()`) lässt sie über die Kategorie weg; die Namensregel `isStatusLed` (ID endet auf `status_led`) fängt nur die ohne | `ForeignKeys.test_status_leds_are_config` |
| Dienste `homeassistant.turn_on`/`turn_off`/`toggle` schalten `light`, `switch`, `fan`, `humidifier`, `input_boolean` (und `cover`); `lock.lock`/`unlock`, `cover.open_cover`/`close_cover`/`stop_cover`/`set_cover_position`, `climate.set_temperature`, `media_player.*` samt `supported_features`-Bits (Cover 1/2/4/8, Media 1/16/32/128/256/16384, Vacuum 16/8192, Mäher 1/2/4) | `scripts/local/22-halten.js` `H.model()`; `scripts/local/28-free-tile.js` „Schalten“ und Symbol-Tipp (`casora_entity` `icon_tap_action`) | `dev/unit/halten.mjs`, `dev/unit/freie_kachel.mjs` |
| `sun.sun` ist `below_horizon` zwischen Sonnenuntergang und Sonnenaufgang, sonst `above_horizon`; fehlt die Entität, gilt „immer“. Cover: Zustände `open`/`closed`/`opening`/`closing`, `current_position` 0–100 mit 0 = ganz zu (fehlt bei Covern ohne Position); `cover.close_cover` braucht Feature CLOSE (2), sonst `set_cover_position` mit `position: 0` (SET_POSITION 4); `device_class` `garage`/`gate`/`door` sind Tore (#76, Rollos in „Sicherheit“) | `scripts/local/34-security-covers.js` (`isOpen`, `isNight`, `closeSvc`, `GATE`), Studio-Auswahl in `panel/casora-panel-personal.js` (Abschnitt `security`) | `dev/unit/security_covers.mjs` (Attrappen), `dev/qa/regress/r351_security_covers.mjs` (Test-HA) |
| HA-iOS-App (Live-Aktivität, Stand 10/2026): `notify.mobile_app_*` mit `data.live_update` und `tag`; Sperrbildschirm/Always-On zeigen Titel, bei laufendem `chronometer` die Uhr **statt** `message`, rechts `critical_text`; Dynamic Island kompakt nur Symbol + Uhr. Die App bringt keine eigenen sichtbaren Wörter mit, alles kommt von Casora (`title`, `critical_text`) | `live_activity.py` `build_payload` (Kommentar), `critical_text` nie aus Rohwerten der Integration (`_snap_*`) | `dev/unit/live_activity_test.py` (Kurztext bei unbekannter Phase/Status/Schritt, alle Sprachen); App-Seite nicht im Kern prüfbar |
| Auth-Middleware von `http` nimmt für GET/HEAD auf jeder Route `?authSig=` an, wenn die Signatur aus `async_sign_path(hass, path, expiration, refresh_token_id=…)` (`homeassistant.components.http.auth`) stammt: JWT mit `path` = Anfragepfad und `params` = übrige Query (ohne `authSig`, `width`, `height`) in Reihenfolge, gebunden an den Refresh-Token (Abmelden macht die Adresse ungültig). Damit laden `<img>` und CSS-`url()` private Raumfotos ohne Header. `HomeAssistantView.requires_auth = True` antwortet sonst 401. `/local` (= `www`) liefert ohne Anmeldung, darum liegen hochgeladene Fotos in `/config/casora_photos` | `images.py` `CasoraPhotoView` (`/api/casora/photo/<datei>`), `sign_photo_url` (Signatur mit `?v=` wiederverwendet, solange > 12 h gültig), WS `casora/photos`; Frontend `scripts/casora-core.js` `casoraPhotoUrl`/`casoraPhotoCss` (Block `casora-photos`), Vorlagen `casora_room`, `casora_mobile_bg`, `casora_shared`, `scripts/filter-overlay.js`; `assets.py` liefert unter `rooms/` nur Mitgeliefertes | `dev/unit/photos_private_test.py` (Claims gegen das installierte HA), `dev/unit/photos_signed.mjs`, `dev/qa/regress/r326_photos_signed.mjs` (echte Middleware: 401 ohne/mit falscher Signatur, 200 signiert) |
| Wetter-Entitäten tragen die Werte neben der Vorhersage als Zustandsattribute mit festen Namen: `apparent_temperature` (gefühlte Temperatur, `native_apparent_temperature`), `dew_point`, `humidity`, `wind_speed`, `wind_gust_speed`, `cloud_coverage`, `uv_index`, Einheiten in `temperature_unit`/`wind_speed_unit`; `history/stream` liefert ohne `no_attributes` je Zustand die Attribute (`a`), so wird die gefühlte Temperatur auch ohne eigenen Sensor zur Kurve, mehrere Attribute einer Entität als je eigene Kurve (#56, Auswahl „Im Diagramm“) | `scripts/local/00-finder.js` `casoraDevice.weatherSources`/`weatherChart`/`weatherRows`, Vorlage `casora_weather` (Popup), `scripts/casora-chart.js` (Attribut-Reihe) | `dev/unit/ha_annahmen_test.py`: `WeatherAttributes`, `dev/unit/weather_feels_like.mjs`, `dev/qa/regress/r338_weather_feels_like.mjs` |
| Frigate-Integration (HACS, Stand Quellcode v5.15.6, 25.10.2026): je Frigate-Kamera genau eine `camera.<kamera>`; ihr Stream ist der erste aus Frigates `live.streams` (bzw. der go2rtc-Stream mit dem Kameranamen), STREAM-Funktion nur dann. Weitere Streams (Unterstream) haben keine eigene Entität (#61) | `scripts/local/23-frigate.js` `F.pickStream` („Standard“ = Kamera-Entität über `ha-camera-stream`) | `dev/unit/frigate_streams.mjs`, `dev/qa/regress/r339_frigate_streams.mjs` (Mock) |
| Frigate-Integration: `GET /api/frigate/<instanz>/go2rtc/api/streams` (`Go2RTCAPIProxyView`, ab Frigate 0.18 über Frigates `api/go2rtc/streams`) liefert go2rtc's Streams als Objekt nach Namen; WebSocket-Proxys `/api/frigate/<instanz>/mse/<pfad>` (→ `live/mse/…`, als veraltet markiert), `/go2rtc/ws/<pfad>` und `/webrtc/<pfad>` sprechen go2rtc's `api/ws?src=<stream>` (MSE: `{type: mse}` → MIME, dann fMP4; WebRTC: `webrtc/offer`/`answer`/`candidate`). Anmeldung per signiertem GET (`?authSig=`, Zeile oben), auch beim WebSocket-Upgrade | `23-frigate.js` `F.streamList`, `<casora-frigate-stream>` (Kachel, Popup-Umschalter) | `dev/unit/frigate_streams.mjs` (Pfade, Rückfall ohne Proxy), `r339_frigate_streams.mjs` gegen den Mock (`dev/casora_mock/frigate.py`) – nicht gegen die echte Integration |
| `hass.fetchWithAuth(pfad)` im Frontend schickt den Zugangstoken mit | `23-frigate.js` `F.streamList` (sonst `auth/sign_path` + `fetch`) | `dev/unit/frigate_streams.mjs` (beide Wege, Attrappe) |
| `camera/webrtc/get_client_config` (`entity_id`) liefert `configuration.iceServers` für HAs eigenen WebRTC-Player | `23-frigate.js` `<casora-frigate-stream>` WebRTC-Weg (nur ohne MSE, z. B. ältere iPhones) | keiner (ohne Antwort: keine ICE-Server, im Heimnetz reicht das) |
| Alte Gruppen (`group.*`) tragen ihre Mitglieder in der Reihenfolge der Konfiguration im Attribut `entity_id`; Zustand `on`/`off` bei Schaltern, `homeassistant.toggle` schaltet alle (#59) | `scripts/local/34-entity-list.js` `L.resolve()`, `L.kind()` (Entity-Liste, „Mehr“) | `dev/unit/entity_list.mjs` (Attrappe), `dev/qa/regress/r350_entity_list.mjs` (Gruppe nur im Browser) |
| `hass.entities[id].labels` (aus `lb`) nennt die Label-IDs einer Entität; `config/label_registry/list` liefert `label_id` und `name` (#59) | `34-entity-list.js` `L.resolve()` (Quelle „Label“), `panel/casora-panel-types.js` `haLabels` | `dev/unit/entity_list.mjs` (Attrappe), im Wegwerf-HA 2026.10 nachgeprüft, nicht automatisch |
| `input_datetime` meldet `has_date`/`has_time`, Zustand `HH:MM:SS` bzw. `YYYY-MM-DD`; Dienste `input_datetime.set_datetime` (`time`/`date`), `time.set_value`, `date.set_value`, `input_number.increment`/`decrement` (Grenzen hält HA), `number.set_value`, `input_select`/`select.select_option` (#59) | `34-entity-list.js` `L.kind()`, `L.serviceFor()`, `L.row()` | `dev/unit/entity_list.mjs`, `dev/qa/regress/r350_entity_list.mjs` (`time.set_value`, Aufruf im Browser abgefangen) |
| button-card ab 7 beobachtet jede Entität, die eine Vorlage über ihr `states` liest (Proxy, `_monitoredEntities`), auch ohne `triggers_update`; Gruppen werden dabei aufgelöst | Kacheln ohne eigene Entität: `casora_entity_list`, `casora_more` (`34-entity-list.js` liest jeden Eintrag über das übergebene `states`) | `dev/unit/entity_list.mjs` (liest über einen Proxy), sonst keiner (button-card 7.0.1 im Testhaus nachgelesen) |

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
  `casoraLaundryFind`, `live_finder.py`), Home Connect und Miele auch Kaffee (`25-coffee.js` `SOURCES`: Home Connect
  ohne Start-Knopf, Start über `home_connect.set_program_and_options`, Warn-Sensoren ab Werk deaktiviert; Miele-Kaffee
  ohne Start/Stopp und ohne Fortschritt; Test `dev/unit/coffee_sources.mjs`)
- `dwd_weather_warnings` (#55): Stufensensoren `…_current_warning_level`/`…_advance_warning_level`, Zustand = Stufe
  0–4, Attribute `warning_count`, `region_name`, `last_update` und je Warnung `warning_<n>_name/_level/_headline/
  _description/_instruction/_start/_end` (`01-basis.js` `casoraWarnings`, `casora-panel.js` `isWarningLevelSensor`;
  Test `dev/unit/wetterwarnung_dwd.mjs`, Testhaus `dev/casora_mock/testserver.py`). Erkennung nur über `warning_count`,
  nicht über `translation_key`.
- `cookidoo` (Rezept, `03-popups.js`, `ki.py`), `backup` (`03-popups.js`), `proximity` (`15-person.js`),
  `unifi` (Netzwerk, `00-finder.js`), `lamarzocco` (Kaffee, `25-coffee.js`), `tankerkoenig` (nur `platform`,
  `tanken.py`)

Nicht im Kern-Paket prüfbar (HACS), Casora liest `platform`/`translation_key`:
`waste_collection_schedule`, `frigate`, `ha_washdata`, `home_connect_alt`/`homeconnect_ws`, `bambu_lab`,
`anker_solix`, `pulse`, `teamtracker`, `bosch_ebike`, `velair`, `powercalc`, `browser_mod`, `hacs`, Kaffee-Integrationen
(`delonghi_primadonna`, `delonghi_coffee`, `delonghi_coffeelink`, `jura`, `jura_wifi`, `melitta_barista`, `philips_homeid`;
Schlüssel je Quelle in `25-coffee.js` `SOURCES`, Stand Quellcode 24.10.2026, Test `dev/unit/coffee_sources.mjs`),
Auto-Integrationen.

Wetter-Integrationen (#56), Casora liest Sensoren am Gerät der Wetter-Entität nach `translation_key`
(`00-finder.js` `WX_KEYS`; Test `dev/unit/weather_feels_like.mjs`, Testhaus `dev/casora_mock/wetter.py`):
„Wetter & Warnungen“ (`wetter`, eigene Integration SH1FT-W/wetter-warnungen, Stand Quellcode 25.10.2026) mit
`temperature`, `dew_point`, `wind_gust`, `cloud_cover`, `precipitation` (mm/h), `precipitation_probability`,
`precipitation_probability_today`, `solar` (W/m²); eine gefühlte Temperatur liefert sie noch nicht (weder Sensor
noch `native_apparent_temperature`). Gefühlte Temperatur anderer Quellen: `apparent_temperature`,
`feels_like_temperature`, `feels_like`, `realfeel_temperature`.

HACS-Download (Stand HACS-Quelle 20.10.2026, `repositories/base.py`): `hacs.json` wird für die zu installierende
Version gelesen; mit `"zip_release": true` + `"filename": "casora.zip"` lädt HACS nur
`releases/download/<tag>/casora.zip` und packt es unverändert nach `custom_components/casora` aus (Dateien im
Zip-Root), ohne Rückfall auf das Repo-Archiv. Ältere Releases (ohne diese Schlüssel) laden weiter das Repo-Archiv.
Deshalb hängt `tools/release.sh` an jedes Release `casora.zip` (`tools/build-release-zip.py`). Casora selbst
installiert nichts (HACS-Review hacs/default#12143): die eigene Update-Entität (nur ohne HACS, `update.py`) meldet
neue Versionen und Versionshinweise, ohne `INSTALL`. Mit HACS ruft das Studio HAs öffentlichen Dienst `update.install`
an HACS' Update-Entität für Casora auf (HACS-Quelle `update.py`, 25.10.2026: Funktionen `INSTALL` + `SPECIFIC_VERSION`
+ `PROGRESS`, `version` = Release-Tag `v<version>`, danach `installed_version` = neue Version und Neustart nötig);
eine Beta geht mit ihrem Tag als `version`. „In HACS öffnen“ führt zu `/hacs/repository/<GitHub-ID>`
(GitHub-ID fest in `const.UPDATE_REPO_ID`, HACS-Verwaltung erkannt über HACS' Gerät bzw. Update-Entität in der
Registry, sonst Mehr-Info von HACS' Update-Entität). Tests: `dev/qa/regress/r84_updates_via_hacs.mjs` (Studio-Aufruf, Mock),
`dev/unit/update_release_zip_test.py` (Paketaufbau), `dev/unit/update_report_only_test.py` (kein `INSTALL`, kein
Schreibzugriff auf `custom_components`); HACS selbst und die HACS-Route nicht im Test.

`update.install` mit ausdrücklich genannten Entitäten, die `INSTALL` nicht können, lässt den ganzen Aufruf
scheitern. Das Updates-Popup (`casora_popup_updates`, „Alle aktualisieren“) nimmt deshalb nur Entitäten mit
`supported_features & 1`. Test: `dev/unit/update_report_only_test.py` (Vorlage enthält den Filter); HA-Verhalten
selbst nicht im Test.

Updates-Kachel, -Popup und Glocke: Update-Entität `on` = offen (auch während `in_progress`), `off` bei übersprungener
Version. „Installiert, Neustart fehlt“ = `off`, `installed_version == latest_version` und „restart“ in
`release_summary` (HACS: „Restart of Home Assistant required“) – eine Regel, `scripts/casora-core.js`
`casoraNeedsRestart`. Test: `dev/unit/updates_restart_live.mjs`; der HACS-Text nicht im Kern prüfbar (Testhaus
`dev/casora_mock/entity.py` spielt ihn nach).

Home Connect aus HACS (Wäsche/Spüler: `00-finder.js` `casoraLaundryFind.SOURCES`, `live_finder.py`, Zustand/Programm
`02-devices.js`, `live_activity.py`; Tests `dev/unit/dishwasher_sources.mjs`, `dev/unit/live_finder_test.py`,
`dev/unit/live_activity_test.py`, Häuser `dev/unit/haeuser/hc_*.json`), Stand 23.10.2026:

- `home_connect_alt` (ekutner/home-connect-hass 1.5.0-b1, Commit f74cffd): `translation_key` nur allgemein –
  `statuses`/`settings` (sensor.py `StatusSensor`/`SettingsSensor`), `options`/`programs` (sensor.py, select.py),
  Knöpfe `start_program`/`pause_program`/`resume_program` je Zustand und `stop_program` (button.py
  `StartButton`/`StopButton`), Schalter und Binärsensoren ohne. Die Entitäts-ID setzt die Integration selbst:
  `<domain>.<haid>_<Home-Connect-Schlüssel klein, Punkte als _>` (common.py `EntityBase.__init__`/`unique_id`;
  Programme `…_active_program`/`…_selected_program`, Auswahl `…_programs`, Knöpfe `…_start_pause`/`…_stop`).
  Casora liest deshalb das Ende der Entitäts-ID (nur auf dieser Plattform; `hass.entities` hat keine `unique_id`).
  Gerätetyp: Symbol der Programm-Entitäten (const.py `DEVICE_ICON_MAP`), sonst Programmschlüssel
  (`LaundryCare.Washer.Program.…`). Zustand im Modus „local“ als Schlüssel `BSH.Common.EnumType.OperationState.Run`,
  im Modus „server“ als Text der Cloud (dann ohne Läuft-Erkennung); Restzeit als Zeitpunkt (const.py
  `RemainingProgramTime` `class: timestamp`), Tür als Binärsensor `door`.
- `homeconnect_ws` (chris-mc1/homeconnect_local_hass, Commit f91fd4b): `translation_key` = Schlüssel der
  Beschreibung (entity.py), z. B. `sensor_operation_state`, `sensor_active_program`, `select_program`,
  `sensor_remaining_program_time` (Dauer), `binary_sensor_door_state`, `button_abort_program`
  (entity_descriptions/common.py), Spüler `sensor_program_phase`, `sensor_salt`, `sensor_rinse_aid`,
  `switch_extra_dry_option` (dishcare.py), Wäsche `sensor_laundry_process_phase`/`sensor_dryer_process_phase`
  (laundry_care.py). Entitäts-IDs aus den übersetzten Namen (`has_entity_name`), daher die deutschen Endungen in
  `casoraLaundryFind.dishNames` (translations/de.json).

- `ha_bosch_ebike` (Xunil99/ha-bosch-ebike 1.19.59, Stand 24.10.2026): ein Gerät je Rad (`identifiers (DOMAIN, bike_id)`,
  Name = Antrieb), alle Entitäten daran, `has_entity_name`. Sensoren mit `translation_key` (`odometer`,
  `days_since_last_ride`, `service_due_in_days`/`service_due_in_km`, `total_distance_activities`, `total_duration`,
  `estimated_range_full`, `energy_charged_365d`, …; `number` `battery_capacity`/`service_due_odometer`, `date`
  `service_due_date`) bekommen seit 1.18 (Juni 2026) übersetzte Namen, in deutschem HA also deutsche Entitäts-IDs
  (`…_tage_seit_letzter_fahrt`). Akku (`<Akkumodell> Charge Cycles`/`Wh Lifetime`/`State of Health`), Reichweite je Modus
  (`Reachable Range <Modus>`), `Range Band`, Diebstahl (`Theft Reported`), Software-Update und `Last Known Location`
  haben feste englische Namen ohne Schlüssel. `03-popups.js` (`_casoraBike`) findet das Rad deshalb über das Gerät
  (Plattform oder zwei Rad-Schlüssel oder Diebstahlsensor) und liest je Feld Schlüssel, sonst englische Endung;
  Tests `dev/unit/ebike_zuordnung.mjs`, `dev/qa/regress/r323_ebike_neue_integration.mjs`, Testrad `dev/casora_mock/ebike.py`.
- Mähroboter (Stand 24.10.2026, aus dem Quellcode): `lawn_mower`-Zustände `mowing/docked/paused/returning/error/idle`,
  Funktionen 1/2/4 (8 = STOP ungenutzt). Je Integration liest `16-maeher.js` (`SOURCES`) die Entitäten am selben Gerät über
  `translation_key`, Akku/Laden/Verbindung über `device_class`:
  `husqvarna_automower` (Kern: `error`, `next_start_timestamp`, `mode`, `restricted_reason`, `work_area`,
  `cutting_blade_usage_time`/`total_running_time` in s, `number` `cutting_height` 1–9, `switch` `enable_schedule` = Parken,
  `button` `confirm_error`; Akku ohne Schlüssel), `gardena_smart_system` (HACS: Attribute `activity`/`state`/`last_error_code`
  am Mäher, Fehler `mower_error`, übrige Entitäten ohne Schlüssel und ohne `has_entity_name` → Endung der Entitäts-ID),
  `landroid_cloud` (HACS: eigene Zustände `rain_delayed`, `edgecut`, `starting`, `zoning`, `searching_zone`,
  `escaped_digital_fence`; `battery`, `error`, `rssi` dBm, `next_schedule`, `rain_delay`(`_remaining`), `rain_sensor`,
  `blade_runtime_current` min, `cutting_height` mm, `select` `zone`), `navimow` (HACS, nur `battery` und Attribute),
  `ecovacs` (Kern: `error` mit Attribut `description`, `lifespan_blade` %, `total_stats_time_mower`), `mammotion` (HACS:
  `battery_percent`, `error_1_message` als Satz, `blade_used_time` s, `blade_height`, `rain_detected`, `mqtt_status`).
  `dreame_vacuum` hat keine Mäher. Tests `dev/unit/mower_sources.mjs`, `dev/unit/mower_first_use.mjs`,
  `dev/qa/regress/r325_mower_integrations.mjs`, Testmäher `dev/casora_mock/maeher.py`.
- `velair` (cgonfer/velair 1.8.0, Stand 24.10.2026, Community-Karte „Velair“, #32): Velair ist ein Planer, kein Gerät –
  ein Dienst-Gerät „Velair“ mit `switch` `automatic_scheduling`, `select` `mode`, `sensor` `scheduler_status`/
  `next_climate_event` und je geplantem Klimagerät `zone_control` (Objekt-ID `velair_control_<Klima-Objekt-ID>`),
  `zone_active_target_temperature` (Attribut `entity_id` des Klimageräts, solange ein Block läuft), `zone_override_state`
  u. a. Die Klimageräte selbst gehören anderen Integrationen. Erkannt wird Velair nur über `platform` `velair` in
  `hass.entities`; welche Klimageräte es plant und die Zeitpläne liefert nur seine WebSocket-API: `velair/get_schedule`
  (`configured_entities`, `zones[<id>].schedule[<wochentag>]` = Blöcke `start` „HH:MM“ + `action` `set_temperature`
  (`temperature` oder `target_temp_low`/`_high`, optional `hvac_mode`, `fan_mode` …)/`set_hvac_mode`/`set_climate_options`/
  `turn_off`, `zones[<id>].enabled`, `global.mode` `auto`/`paused`, `active_profile_ids` + `profiles[].zones[<id>].behavior`
  `normal`/`schedule`/`pause`, `zone_runtime[<id>]` mit `state`, `control_mode`, `pause_count`, `until`,
  `temperature_migration.required`, `settings.first_weekday`/`min_temperature`/`max_temperature`) und
  `velair/subscribe_updates` (Ereignis `{loaded, schedule}`), beide ohne Admin. Ein Block gilt bis zum nächsten der Woche,
  auch über Mitternacht und leere Tage. Schreiben nur über Velairs Dienste: `set_daily_schedule` (ersetzt einen Tag des
  Standard-Zeitplans; ein aktives Profil mit eigenem Zeitplan ändert das nicht – Casora zeigt ihn dann nur an),
  `pause_zone` (`action: none`) / `resume_zone` (`resume_all`, `apply_current_schedule`) wie Velairs eigene Karte,
  `resume_automatic_control`. Nie `hass.data`/`runtime_data` von Velair (HACS-Review). Code: `00-finder.js`
  `casoraVelairFind` (Quelltabelle `SOURCE`), `31-velair.js`, `casora-panel.js` `TILE_MAIN_FIND.casora_velair`,
  `casora-panel-b-ux.js`; Tests `dev/unit/velair.mjs`, `dev/unit/community_first_use.mjs`,
  `dev/qa/regress/r331_velair_schedule.mjs`, Testhaus `dev/casora_mock/velair.py` (Entitäten unter `platform` `velair`,
  WebSocket-Befehle und Dienste nachgebaut). HACS, nicht im Kern prüfbar.

Bekannt wacklig (Stand 2026.10.1, nicht im Test, weil es Rückfälle bzw. HACS-Schlüssel sind):

- `reolink`: Kamera `clear`, `fluent`, `balanced` und Auswahl `day_night` gibt es im Kern nicht (nur Rückfall).
- `mobile_app` setzt keine `translation_key`s; `15-person.js` findet Akku/WLAN nur über die Entitäts-ID.
- Bosch-Raumklima-Schlüssel (`call_for_heat`, `summer_mode` …) gibt es nur in einer HACS-Variante;
  `ki.py` (`call_for_heat`) hat keinen Rückfall.
- `main_switch` (Fußbodenheizung) und `warnings` (Wetterwarnung) gibt es in keiner Kern-Integration.

## Fremde Interna (bewusst, mit Grund)

`dev/unit/no_foreign_internals_test.py` prüft den Python-Code auf fremde `hass.data`-Schlüssel, `runtime_data`,
private Importe/Untermodule anderer Integrationen, `inspect.unwrap`/`__self__`, Monkeypatching und fremde
`.storage`-Schlüssel. Was bleibt, steht dort in `ALLOWED` und hier. Für Lovelace und die UI-Helfer bietet HA
keine öffentliche Python-API (nur WebSocket-Befehle, die eine Browser-Verbindung brauchen); eine Brücke über den
Browser wurde am 24.10.2026 verworfen.

| Zugriff | Wo | Grund |
|---|---|---|
| `hass.data["lovelace"]` (Ressourcen) | `__init__.py` `_lovelace_resources` | Casoras Skript-Ressourcen eintragen/umstellen/entfernen, beim Start und beim Entfernen der Integration |
| `LOVELACE_DATA`/`hass.data["lovelace"]` (Dashboards) | `template_refresh.py`, `versions.py`, `umstellen.py`, `phone_badges.py`, `room_icons.py`, `live_activity.py` | Vorlagen nach einem Update auffrischen (beim Start, ohne Browser), Versionen im Studio, `casora.umstellen`, Handy-Badges/Partner-Daten für alle Nutzer (nur lesen), Symbol-Nutzung, Tipp-Ziel der Live-Aktivität (nur lesen) |
| `hass.data["websocket_api"]` + `inspect.unwrap(...).__self__.storage_collection` | `helfer.py` `_collection` | Casoras UI-Helfer beim Start anlegen (keine Python-API für UI-Helfer); dieselbe Sammlung wie Einstellungen › Helfer |
| `hass.data["lovelace"]`, `hass.data["websocket_api"]` (`call_ws`), `hass.data["hacs"]` (Rückfall-Deinstallation), `hass.data["frontend_default_theme"]` | `hemma_cleanup.py` | Admin-Aktion „Hemma entfernen“ im Studio: Ressourcen, Dashboards, HACS-Paket und Theme des Vorgängers wegräumen |
| `homeassistant.components.http.auth.async_sign_path` | `images.py` | öffentliche Hilfe von `http` für signierte Adressen (Kern-Integrationen wie `media_source` nutzen sie genauso); Raumfotos mit Anmeldung (Review Punkt 1) |
| `homeassistant.components.recorder.statistics.statistics_during_period`, `recorder.history` | `ki.py` | dokumentierte Recorder-API für Statistik/Verlauf, nur lesen |
| `homeassistant.components.energy.data.async_get_manager` | `ki.py`, `settings.py`, `raumklima.py` | Energie-Einstellungen, nur lesen; aus Python gibt es keinen WebSocket-Weg, Kern-`analytics` liest sie genauso |
| `homeassistant.components.frontend.storage.async_user_store`, `Store(…, "frontend_theme")` | `theme.py` `_migrate`, `_write_notices` | einmalige Übernahme der Design-Wahl aus der Theme-Zeit (Casora ≤ 26.10.59): liest HAs gespeichertes Standard-Theme einmal (nie geschrieben) und legt je Nutzer einmal einen Hinweis ab; mit der Migration entfernen |

## Prüfbefehl

Befehl, der die Annahmen gegen eine bestimmte HA-Version prüft:

```sh
dev/qa/ha-annahmen.sh                   # neueste stabile Version + neueste Beta (ohne Beta: übersprungen)
HA_VERSION=beta dev/qa/ha-annahmen.sh   # nur die Beta
dev/qa/ha-annahmen.sh standard          # Standardversion des Gates (läuft auch im Gate, Schritt unit)
```
