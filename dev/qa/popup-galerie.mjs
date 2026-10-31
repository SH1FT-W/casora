#!/usr/bin/env node
// Popup gallery for the test HA (casora-test, state "arbeit"): one dashboard "popup-galerie" with exactly one opener
// per popup kind – tiles, badges (in room headers), menus – grouped by the waves of the v3 rework
// (docs/handbuch/popup-rework-v3-auftrag.md §5), each with a label. For walking through all popups by hand.
//
//   node dev/qa/popup-galerie.mjs anlegen            builds (or rebuilds) the dashboard /popup-galerie
//   node dev/qa/popup-galerie.mjs pruefen [--handy] [--nur <regex>] [--md <file>] [--json <file>]
//                                                    taps every opener (Playwright) and lists: opens / does not open / device missing
//
// Like dev/qa/matrix-bilder.mjs --vorbereiten: cards are taken from the house's own dashboards (the Studio's output) when a
// card with the template and existing entities is there, otherwise built like the Studio builds a tile (template + entity
// + variables); templates and theme come from the house's Casora desktop dashboard (qa-arbeit), so the gallery renders
// and refreshes like every Casora dashboard. Writes only the dashboard popup-galerie. CASORA_URL as in ws.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { tokens, ws } from './ws.mjs';

const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i > 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);
const CMD = argv[2];
const DASH = 'popup-galerie';
if (!['anlegen', 'pruefen'].includes(CMD)) { console.error('Aufruf: popup-galerie.mjs anlegen | pruefen [--handy] [--nur <regex>] [--md <datei>] [--json <datei>]'); process.exit(2); }

// ── Popup kinds ─────────────────────────────────────────────────────────
// w: wave (§5), 6 = popups outside the table, 7 = menus that stay. tpl: opener template (tile); badge: template of a
// badge inside a room header (room: which header, parent: group badge to tap first); menu: how the check opens it.
// pick(card, S): predicate for example cards; guess(S): entity for a built card; vars(e, S): its variables.
const isGroup = (dom) => (c, S) => { const s = S[c.entity]; return !!s && c.entity.startsWith(dom + '.') && Array.isArray(s.attributes.entity_id) && s.attributes.entity_id.length > 1; };
const notGroup = (dom) => (c, S) => { const s = S[c.entity]; return !!s && c.entity.startsWith(dom + '.') && !Array.isArray(s.attributes.entity_id); };
const climGroup = (c, S) => { const a = (S[c.entity] || {}).attributes || {}; return Array.isArray(a.member_entities) || Array.isArray(a.entity_id); };
const first = (S, re, pred = () => true) => Object.keys(S).sort().find((id) => re.test(id) && pred(S[id]));
const dc = (d) => (s) => (s.attributes || {}).device_class === d;
const name = (S, e, d) => ((S[e] || {}).attributes || {}).friendly_name || d;
// Tank tile variables for the made-up tanks of dev/casora_mock/aquarium.py (tanks()), as the Studio stores them.
const TANK = 'sensor.testpflanzen';
const tankVars = (e) => {
  if (!/^sensor\.testpflanzen_/.test(e || '')) return { tank_name: 'Becken' };
  const btn = [1, 2, 3, 4].map((n) => `button.testdosierpumpe_pumpe_${n}_dosieren`);
  const by = (to, end) => Object.fromEntries(btn.map((b) => [b, b.replace('button.', to + '.').replace('_dosieren', end)]));
  return { tank_name: 'Testpflanzenbecken', status_entity: TANK + '_temperaturstatus', temp_battery: TANK + '_temperatur_battery',
    leak_entity: 'binary_sensor.testpflanzen_lecksensor_wasserleck', leak_battery: TANK + '_lecksensor_batterie', chart_color: '#30D158',
    temp_min: 24, temp_max: 26, light_entity: 'light.testpflanzen_lampe_licht', light_profile: 'select.testpflanzen_lampe_profil',
    light_schedule_switch: 'switch.testpflanzen_lampe_manual_color_simulation',
    devices: [{ entity: 'switch.testpflanzen_technik', label: 'Pumpe & Technik', icon: 'mdi:pump', alarm: true, confirm: true }],
    dosing_buttons: btn, dosing_volume: by('number', '_dosiermenge'), dosing_today: by('sensor', '_heute'), dosing_total: by('sensor', '_gesamt') };
};
// Energy tile variables for the made-up solar system of dev/casora_mock/energie.py.
const SOLAR = Object.fromEntries(Object.entries({ entity_power: 'testsolarbank_hausbedarf', entity_usage_today: 'testenergie_hausbedarf_heute',
  entity_usage_month: 'testenergie_hausbedarf_monat', entity_cost_today: 'testenergie_stromkosten_heute', entity_cost_month: 'testenergie_stromkosten_monat',
  entity_solar_power: 'testsolarbank_solarleistung', entity_solar_today: 'testenergie_solarertrag_heute', entity_solar_month: 'testenergie_solarertrag_monat',
  entity_battery_power: 'testsolarbank_akkuleistung', entity_battery_soc: 'testsolarbank_ladestand', entity_battery_today: 'testenergie_akku_entladen_heute',
  entity_battery_month: 'testenergie_akku_entladen_monat', entity_netz_power: 'teststromzaehler_leistung', entity_netz_today: 'testenergie_netzbezug_heute',
  entity_netz_month: 'testenergie_netzbezug_monat' }).map(([k, v]) => [k, 'sensor.' + v]));
SOLAR.room_name = 'Zuhause';

const ITEMS = [
  // Welle 1 – Pilot
  { w: 1, id: 'licht-raum', popup: 'Licht – Raum/Gruppe', stage: 'S1 Helligkeit', tpl: 'casora_light', pick: isGroup('light') },
  { w: 1, id: 'licht-haus', popup: 'Licht – Haus (Badge Licht)', stage: 'S1', badge: 'casora_badge_light_group', room: 'haus' },
  { w: 1, id: 'licht-badge', popup: 'Licht – Badge einer Leuchte', stage: 'S1', badge: 'casora_badge_light', room: 'haus', parent: 'casora_badge_light_group' },
  { w: 1, id: 'fbh-haus', popup: 'Fußbodenheizung – Haus', stage: 'S2 Ziel aller Räume', tpl: 'casora_popup_fbh', pick: climGroup,
    guess: (S) => first(S, /^climate\./, (s) => Array.isArray(s.attributes.member_entities) || Array.isArray(s.attributes.entity_id)), tplList: ['casora_thermostat', 'casora_popup_fbh'] },
  { w: 1, id: 'fbh-raum', popup: 'Fußbodenheizung – Raum', stage: 'S2 Ziel des Raums', tpl: 'casora_popup_fbh', pick: (c, S) => !climGroup(c, S),
    guess: (S) => first(S, /^climate\./, (s) => !Array.isArray(s.attributes.member_entities) && !Array.isArray(s.attributes.entity_id)), tplList: ['casora_thermostat', 'casora_popup_fbh'] },
  { w: 1, id: 'jalousien-raum', popup: 'Jalousien – Raum/Gruppe', stage: 'S3 Position', tpl: 'casora_popup_cover', pick: isGroup('cover') },
  { w: 1, id: 'jalousien-badge', popup: 'Jalousien – Badge (Klima › Jalousien)', stage: 'S3', badge: 'casora_badge_climate_covers', room: 'haus', parent: 'casora_badge_climate_group' },
  { w: 1, id: 'jalousie-badge', popup: 'Jalousie – Badge (einzeln stehend)', stage: 'S3', tpl: 'casora_badge_cover',
    guess: (S) => first(S, /^cover\.testjalousie$/) || first(S, /^cover\./, (s) => !Array.isArray(s.attributes.entity_id)) },
  // Welle 2 – Geräte mit Bedienung
  { w: 2, id: 'leuchte', popup: 'Leuchte (einzeln)', stage: 'S1, Weißton; Farbe ›', tpl: 'casora_light', pick: notGroup('light') },
  { w: 2, id: 'thermostat', popup: 'Thermostat', stage: 'S2', tpl: 'casora_thermostat', pick: (c) => ![].concat(c.template).includes('casora_popup_fbh') },
  { w: 2, id: 'klima-raum', popup: 'Klima (Raum) – Badge Temperatur', stage: 'S2/S6', badge: 'casora_badge_temp', room: 'haus', parent: 'casora_badge_climate_group' },
  { w: 2, id: 'klima-feuchte', popup: 'Klima (Raum) – Badge Feuchte', stage: 'S2/S6', badge: 'casora_badge_humidity', room: 'haus', parent: 'casora_badge_climate_group' },
  { w: 2, id: 'klima-luft', popup: 'Klima (Raum) – Badge Luftqualität', stage: 'S6', badge: 'casora_badge_air_quality', room: 'raum' },
  { w: 2, id: 'velair', popup: 'Klimaanlage Velair', stage: 'S2', tpl: 'casora_velair', guess: (S) => first(S, /^climate\.testklimaanlage$/) || first(S, /^climate\./) },
  { w: 2, id: 'luefter', popup: 'Lüfter', stage: 'S1 Stufe', tpl: 'casora_fan' },
  { w: 2, id: 'luftreiniger', popup: 'Luftreiniger', stage: 'S6 Luftqualität', tpl: 'casora_air_purifier', pick: (c) => /testluftreiniger/.test(c.entity || ''),
    guess: (S) => first(S, /^fan\.testluftreiniger$/) || first(S, /^fan\..*(luftrein|purifier)/) },
  { w: 2, id: 'befeuchter', popup: 'Luftbefeuchter', stage: 'S2 Zielfeuchte', tpl: 'casora_humidifier', guess: (S) => first(S, /^humidifier\./) },
  { w: 2, id: 'schalter', popup: 'Schalter', stage: 'S7', tpl: 'casora_switch', pick: (c, S) => /^switch\./.test(c.entity || ''),
    guess: (S) => first(S, /^switch\.teststeckdose$/) || first(S, /^switch\.test/) || first(S, /^switch\./) },
  { w: 2, id: 'jalousie', popup: 'Jalousie (einzeln)', stage: 'S3', tpl: 'casora_cover', pick: (c, S) => notGroup('cover')(c, S) && ![].concat(c.template).includes('casora_popup_cover') },
  { w: 2, id: 'medien', popup: 'Medien-Player', stage: 'S5 Cover + Wiedergabe', tpl: 'casora_media', pick: (c) => [].concat(c.template).slice(-1)[0] === 'casora_media' },
  { w: 2, id: 'now-playing', popup: 'Now Playing (Desktop: Welle oben rechts; Handy: Wiedergabe oben)', stage: 'S5', badge: 'casora_now_playing_primary', room: 'sicherheit' },
  { w: 2, id: 'medien-badge', popup: 'Medien-Badge', stage: 'S5', badge: 'casora_badge_media_group', room: 'medien' },
  { w: 2, id: 'medien-player-badge', popup: 'Medien – Badge eines Players', stage: 'S5', badge: 'casora_badge_media_player', room: 'medien', parent: 'casora_badge_media_group', absent: 'im Weich-Design ersetzt Now Playing die Medien-Pillen (09-weich-wiedergabe.js)' },
  { w: 2, id: 'geraet', popup: 'Gerät allgemein', stage: 'Rückfallregel S7', tpl: 'casora_entity_actions',
    pick: (c) => !(c.variables || {}).tap_run && !/^(button|script|scene|input_button)\./.test(c.entity || ''), guess: (S) => first(S, /^switch\.test/) || first(S, /^switch\./) },
  // Welle 3 – Programme und Geräte mit Ablauf
  { w: 3, id: 'waschmaschine', popup: 'Waschmaschine', stage: 'S4', tpl: 'casora_waschmaschine' },
  { w: 3, id: 'trockner', popup: 'Trockner', stage: 'S4', tpl: 'casora_trockner' },
  { w: 3, id: 'geraet-ablauf', popup: 'Gerät mit Ablauf (casora_appliance)', stage: 'S4', tpl: 'casora_appliance', guess: (S) => first(S, /^sensor\..*(waschmaschine|wasch).*(status|zustand|state)/) || first(S, /^sensor\.waschmaschine/) },
  { w: 3, id: 'geschirrspueler', popup: 'Geschirrspüler', stage: 'S4', tpl: 'casora_geschirrspueler' },
  { w: 3, id: 'drucker', popup: '3D-Drucker', stage: 'S4', tpl: 'casora_3d_printer' },
  { w: 3, id: 'sauger', popup: 'Saugroboter', stage: 'S4', tpl: 'casora_vacuum' },
  { w: 3, id: 'maeher', popup: 'Mähroboter', stage: 'S4', tpl: 'casora_lawn_mower', guess: (S) => first(S, /^lawn_mower\.testmaeher/) || first(S, /^lawn_mower\./) },
  { w: 3, id: 'kaffee', popup: 'Kaffeevollautomat', stage: 'S8 Getränke', tpl: 'casora_coffee', guess: (S) => first(S, /^sensor\.testbarista_operation_state$/) || first(S, /^sensor\.testbarista/) },
  { w: 3, id: 'kuehlschrank', popup: 'Kühlschrank', stage: 'S2 Kühlen', tpl: 'casora_fridge', guess: (S) => first(S, /^sensor\..*_top_zone$/) || first(S, /^sensor\..*(kuehl|fridge)/) },
  { w: 3, id: 'wasserkocher', popup: 'Wasserkocher', stage: '–', tpl: 'casora_kettle' },
  // Aquariums: the three complete tanks of dev/casora_mock/aquarium.py (tanks()), as the Studio stores them.
  { w: 3, id: 'aquarium', popup: 'Aquarium (Übersicht)', stage: 'S6 Wassertemperatur', tpl: 'casora_aquarium',
    pick: (c, S) => (S[TANK + '_temperatur_temperature'] ? (c.variables || {}).entity_saltwater === 'sensor.testriff_temperatur_temperature' : !!S[(c.variables || {}).entity_freshwater]),
    guess: (S) => first(S, /^sensor\.testpflanzen_temperatur_temperature$/),
    vars: () => ({ entity_freshwater: 'sensor.testpflanzen_temperatur_temperature', entity_saltwater: 'sensor.testriff_temperatur_temperature',
      entity_turtle: 'sensor.testschildi_temperatur_temperature' }) },
  { w: 3, id: 'becken', popup: 'Aquarium – Becken', stage: 'S6 Wassertemperatur', tpl: 'casora_aquarium_tank',
    pick: (c, S) => !S[TANK + '_temperatur_temperature'] || c.entity === TANK + '_temperatur_temperature',
    guess: (S) => first(S, /^sensor\.testpflanzen_temperatur_temperature$/) || first(S, /^sensor\.testbecken_a_wassertemperatur$/), vars: (e) => tankVars(e) },
  { w: 3, id: 'aquarium-licht', popup: 'Aquarium-Licht (mehrere Kanäle)', stage: 'S1 Licht', tpl: 'casora_aquarium_light',
    pick: (c, S) => !S['light.testriff_lampe_licht'] || c.entity === 'light.testriff_lampe_licht',
    guess: (S) => first(S, /^light\.testriff_lampe_licht$/) || first(S, /^light\.testbecken_a_lampe$/) || first(S, /^light\..*(becken|aquar|tank)/),
    vars: (e, S) => (e === 'light.testriff_lampe_licht' ? { tank_name: 'Testriff', temp_entity: 'sensor.testriff_temperatur_temperature',
      light_reachable: 'binary_sensor.testriff_lampe_erreichbar' } : { tank_name: name(S, e, 'Becken') }) },
  { w: 3, id: 'fahrzeug', popup: 'Fahrzeug', stage: 'S7 Reichweite/Akku', tpl: 'casora_car' },
  { w: 3, id: 'ebike', popup: 'E-Bike', stage: 'S7 Akku', tpl: 'casora_ebike' },
  { w: 3, id: 'haustier', popup: 'Haustier', stage: 'S7', tpl: 'casora_pet' },
  // Welle 4 – Zustand und Sammel-Popups
  { w: 4, id: 'sicherheit-gruppe', popup: 'Sicherheit – Badge (Gruppe)', stage: 'S7', badge: 'casora_badge_security_group', room: 'haus' },
  { w: 4, id: 'sicherheit', popup: 'Sicherheit – Badge (einzeln)', stage: 'S7', badge: 'casora_badge_security', room: 'sicherheit' },
  { w: 4, id: 'kontakte', popup: 'Türen & Fenster', stage: 'S7', badge: 'casora_badge_contact_group', room: 'sicherheit' },
  { w: 4, id: 'sicherheit-jalousien', popup: 'Jalousien in Sicherheit', stage: 'S7', badge: 'casora_badge_security_covers', room: 'sicherheit',
    note: 'nur nachts mit offener Jalousie (Einstellung Sicherheit › Jalousien „nur nachts“)', absent: 'erscheint nur nachts bei offener Jalousie (Einstellung „nur nachts“)' },
  { w: 4, id: 'schloss', popup: 'Schloss (Kachel)', stage: 'S7', tpl: 'casora_lock' },
  { w: 4, id: 'schloss-badge', popup: 'Schloss – Badge', stage: 'S7', badge: 'casora_badge_lock_group', room: 'haus', parent: 'casora_badge_security_group' },
  { w: 4, id: 'alarm', popup: 'Alarmanlage', stage: 'S7', tpl: 'casora_alarm' },
  { w: 4, id: 'updates', popup: 'Updates', stage: 'S7', tpl: 'casora_updates', noEntity: true,
    // Shown even without pending updates (the tile hides itself by default when everything is current).
    pick: (c) => (c.variables || {}).show_when === 'always', vars: () => ({ show_when: 'always' }) },
  { w: 4, id: 'netzwerk', popup: 'Netzwerk', stage: 'S7', tpl: 'casora_network' },
  { w: 4, id: 'person', popup: 'Person (Kachel)', stage: 'S7', tpl: 'casora_presence' },
  { w: 4, id: 'person-badge', popup: 'Person – Badge', stage: 'S7', badge: 'casora_badge_presence', room: 'haus', parent: 'casora_badge_presence_group' },
  { w: 4, id: 'anwesenheit', popup: 'Anwesenheit – Badge (Gruppe)', stage: 'S7', badge: 'casora_badge_presence_group', room: 'haus' },
  { w: 4, id: 'klima-gruppe', popup: 'Klima-Gruppe (Badge)', stage: 'S7', badge: 'casora_badge_climate_group', room: 'haus' },
  { w: 4, id: 'batterien', popup: 'Batterien', stage: 'S7', tpl: 'casora_battery' },
  { w: 4, id: 'wetterwarnung', popup: 'Wetterwarnung', stage: 'S7 in Warnfarbe', tpl: 'casora_weather_warning' },
  { w: 4, id: 'lueften', popup: 'Lüften-Coach', stage: 'S7', tpl: 'casora_vent' },
  { w: 4, id: 'pulse', popup: 'Pulse', stage: 'S7', tpl: 'casora_pulse' },
  // Welle 5 – Verlauf, Bild, Inhalt
  // Energy: the balcony solar system of dev/casora_mock/energie.py (HA's energy settings: dev/qa/testhaus-extras.mjs).
  { w: 5, id: 'energie', popup: 'Energie (Kachel)', stage: 'S6 + Energiefluss', tpl: 'casora_energy',
    pick: (c, S) => !S[SOLAR.entity_power] || c.entity === SOLAR.entity_power, guess: (S) => first(S, /^sensor\.testsolarbank_hausbedarf$/),
    vars: () => ({ ...SOLAR }) },
  { w: 5, id: 'energie-badge', popup: 'Energie – Badge (Gruppe)', stage: 'S6', badge: 'casora_badge_energy_group', room: 'haus' },
  { w: 5, id: 'energie-badge-einzeln', popup: 'Energie – Badge (Gerät)', stage: 'S6', badge: 'casora_badge_energy', room: 'haus', parent: 'casora_badge_energy_group' },
  { w: 5, id: 'diagramm', popup: 'Diagramm-Kachel', stage: 'S6', tpl: 'casora_chart', guess: (S) => first(S, /^sensor\.testserver_processor_temperature$/) || first(S, /^sensor\./, (s) => (s.attributes || {}).state_class === 'measurement') },
  { w: 5, id: 'messwert', popup: 'Messwertseite (Kachel „Messwert“: halten › Details)', stage: 'S6', tpl: 'casora_custom', hold: true, pick: (c) => !!c.entity,
    guess: (S) => first(S, /^sensor\./, dc('temperature')), extra: (e) => ({ custom_fields: { card: { type: 'tile', entity: e } } }) },
  { w: 5, id: 'pflanze', popup: 'Pflanze', stage: 'S6 Feuchte', tpl: 'casora_plant' },
  { w: 5, id: 'wetter', popup: 'Wetter (Raumkopf Startseite)', stage: 'S6 Temperatur', badge: 'casora_weather', room: 'haus' },
  { w: 5, id: 'kamera', popup: 'Kamera', stage: 'S5', tpl: 'casora_camera' },
  { w: 5, id: 'kameras', popup: 'Kameras (mehrere)', stage: 'S5', tpl: 'casora_cameras' },
  { w: 5, id: 'kamera-badge', popup: 'Kamera – Badge', stage: 'S5', badge: 'casora_badge_camera_group', room: 'haus', parent: 'casora_badge_security_group' },
  { w: 5, id: 'klingel', popup: 'Klingel (Kamera)', stage: 'S5', tpl: 'casora_doorbell', guess: (S) => first(S, /^camera\.testklingel/) || first(S, /^camera\./) },
  { w: 5, id: 'reolink', popup: 'Klingel (Reolink)', stage: 'S5 + Verlauf', tpl: 'casora_reolink_doorbell', guess: (S) => first(S, /^camera\.testklingel/) || first(S, /^camera\./) },
  { w: 5, id: 'frigate', popup: 'Frigate', stage: 'S5, Hauptschalter Erkennung', tpl: 'casora_frigate', guess: (S) => first(S, /^camera\./, (s) => (s.attributes || {}).client_id === 'frigate') },
  { w: 5, id: 'kalender', popup: 'Kalender', stage: 'S8', tpl: 'casora_calendar', guess: (S) => first(S, /^calendar\./) },
  { w: 5, id: 'abfall', popup: 'Abfall', stage: 'S8 Monatsraster', tpl: 'casora_trash' },
  { w: 5, id: 'fussball', popup: 'Fußball', stage: 'S8 Tabelle', tpl: 'casora_football' },
  { w: 5, id: 'rezept', popup: 'Rezepte', stage: 'S5 Bild', tpl: 'casora_recipe' },
  { w: 5, id: 'frei', popup: 'Freie Kachel', stage: 'Rückfallregel S7', tpl: 'casora_free', guess: (S) => first(S, /^switch\./),
    vars: (e, S) => ({ free_values: Object.keys(S).filter((x) => /^sensor\./.test(x) && dc('temperature')(S[x])).slice(0, 3), free_chart: true }) },
  { w: 5, id: 'eigenes-badge', popup: 'Eigenes Badge (eigenes Popup)', stage: 'Rückfallregel S7', badge: 'casora_popup_own_badge', room: 'sicherheit' },
  { w: 5, id: 'liste', popup: 'Liste von Entitäten', stage: 'S8', tpl: 'casora_entity_list', noEntity: true,
    vars: (e, S) => ({ list_source: 'pick', list_entities: Object.keys(S).filter((x) => /^(switch|light|number|select)\./.test(x)).slice(0, 8) }) },
  { w: 5, id: 'mehr', popup: '„Mehr“-Kachel', stage: 'S8', tpl: 'casora_more', noEntity: true,
    vars: (e, S) => ({ more_lists: Object.keys(S).filter((x) => /^light\./.test(x) && Array.isArray(S[x].attributes.entity_id)).slice(0, 2),
      more_charts: Object.keys(S).filter((x) => /^sensor\./.test(x) && dc('temperature')(S[x])).slice(0, 2), more_tiles: [first(S, /^cover\./)].filter(Boolean) }) },
  // Outside the table of §5 (own popup templates)
  { w: 6, id: 'einkauf', popup: 'Einkaufsliste (Bring!)', stage: '–', tpl: 'casora_shopping', guess: (S) => first(S, /^todo\.testeinkauf/) || first(S, /^todo\./) },
  { w: 6, id: 'szenen-kachel', popup: 'Szenen-Kachel', stage: '–', tpl: 'casora_scenes', guess: (S) => first(S, /^scene\./) },
  // Casora's own solar tip (binary_sensor.casora_solar_tipp, from HA's energy settings).
  { w: 6, id: 'solar-tipp', popup: 'Solar-Tipp', stage: '–', tpl: 'casora_solar_tip',
    pick: (c, S) => (S['binary_sensor.casora_solar_tipp'] ? c.entity === 'binary_sensor.casora_solar_tipp' : /^binary_sensor\./.test(c.entity || '')),
    guess: (S) => first(S, /^binary_sensor\.casora_solar_tipp$/) || first(S, /^binary_sensor\./, (s) => 'frei_w' in (s.attributes || {})) },
  // A Steam-like account with a running game (dev/casora_mock/game_account.py).
  { w: 6, id: 'spiel', popup: 'Spiel (Medien)', stage: '–', tpl: 'casora_game', pick: (c, S) => !S['sensor.testspielkonto'] || c.entity === 'sensor.testspielkonto',
    guess: (S) => first(S, /^sensor\.testspielkonto$/) || first(S, /^sensor\./, (s) => !!(s.attributes || {}).game) },
  { w: 6, id: 'aktivitaet', popup: 'Aktivität – Badge', stage: '–', badge: 'casora_badge_activity', room: 'medien', parent: 'casora_badge_media_group', absent: 'im Weich-Design ersetzt Now Playing die Medien-Pillen (09-weich-wiedergabe.js); braucht außerdem PSN/Steam/Discord-Quellen' },
  { w: 6, id: 'szene-badge', popup: 'Szenen – Badge', stage: 'Szenen-Blatt', badge: 'casora_badge_scene_group', room: 'haus' },
  // Phone only (popup-galerie-mobile, top of the page)
  { w: 6, id: 'chips-handy', popup: 'Handy: Messwert-Chips', stage: '–', badge: 'casora_mobile_sensor_chips', phone: true, phoneRoom: true, note: 'auf einer Raumseite (Handy-Leiste › Räume)' },
  { w: 6, id: 'np-handy', popup: 'Handy: Now Playing', stage: 'S5', badge: 'casora_mobile_now_playing', phone: true },
  // Menus that stay (no rework, same words)
  { w: 7, id: 'glocke', popup: 'Glocke', stage: 'Menü', menu: 'glocke' },
  { w: 7, id: 'halten', popup: 'Halten-Menü (Kachel gedrückt halten)', stage: 'Menü', menu: 'halten' },
  { w: 7, id: 'szenen-blatt', popup: 'Szenen-Blatt (Raumleiste „Szenen“ / Handy-Palette)', stage: 'Menü', menu: 'szenen' },
  { w: 7, id: 'raeume-menue', popup: 'Räume-Menü (Raumleiste „⋯“ / Handy-Mitte)', stage: 'Menü', menu: 'raeume' },
];
const WAVES = {
  1: 'Welle 1 – Pilot', 2: 'Welle 2 – Geräte mit Bedienung', 3: 'Welle 3 – Programme und Abläufe', 4: 'Welle 4 – Zustand und Sammel-Popups',
  5: 'Welle 5 – Verlauf, Bild, Inhalt', 6: 'Weitere Popups', 7: 'Menüs (bleiben)',
};
// Room headers on the view "badges": haus = the home header of the desktop dashboard (house-wide badges); raum = the room
// header with the most badge variables; medien/sicherheit = like matrix-bilder's room cards (people, media, scenes, security inline).
// Group badges expand their row (input_select.casora_expanded_row) on tap; their sub-badges only show in that row.
const ROW = { casora_badge_light_group: 'lights', casora_badge_climate_group: 'climate', casora_badge_security_group: 'security',
  casora_badge_energy_group: 'energy', casora_badge_presence_group: 'presence', casora_badge_media_group: 'media', casora_badge_scene_group: 'scenes' };
// The house header sits on the view "home": some badges only show there (casoraOnHomeView: blinds in Klima, house-wide security).
const bPath = (r) => (r === 'haus' ? 'home' : 'badges-' + r);
const BADGE_TAB = { haus: 'Haus', raum: 'Raum', medien: 'Medien', sicherheit: 'Sicherheit' };
const ROOMS = { haus: 'Kopf Startseite (Haus)', raum: 'Kopf eines Raums', medien: 'Kopf mit Personen und Medien', sicherheit: 'Kopf mit Sicherheit inline, Now Playing, eigenen Badges' };

const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
const cfgOf = async (u) => { try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } catch (e) { return null; } };
const S = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));

if (CMD === 'anlegen') await anlegen();
c.close();
if (CMD === 'pruefen') await pruefen();

async function anlegen() {
  const isCas = (cfg) => cfg && /casora_room/.test(JSON.stringify(cfg.views || []));
  const cfgs = {};
  for (const d of list) if (d.url_path !== DASH && d.url_path !== DASH + '-mobile' && !/^qa-matrix/.test(d.url_path)) { const cf = await cfgOf(d.url_path); if (cf) cfgs[d.url_path] = cf; }
  const DESK = arg('dash') || ['qa-arbeit', 'test-neu'].find((u) => isCas(cfgs[u])) || Object.keys(cfgs).find((u) => !/-mobile$|^dashboard-hemma/.test(u) && isCas(cfgs[u]));
  if (!DESK) throw new Error('kein Casora-Dashboard im Haus (qa-arbeit fehlt?) – erst dev/qa/stress-setup.mjs --name qa-arbeit --state arbeit');
  const base = cfgs[DESK];
  // Example cards: the desktop dashboard first, then the others (the Hemma fixture last).
  const order = [DESK, ...Object.keys(cfgs).filter((u) => u !== DESK && !/^dashboard-hemma/.test(u)), ...Object.keys(cfgs).filter((u) => /^dashboard-hemma/.test(u))];
  const ENT = /^(light|switch|sensor|binary_sensor|climate|cover|lock|media_player|fan|camera|vacuum|update|person|calendar|weather|alarm_control_panel|scene|humidifier|device_tracker|todo|select|number|event|image|lawn_mower|plant|water_heater)\./;
  const entsOk = (card) => (JSON.stringify(card).match(/"[a-z_]+\.[A-Za-z0-9_]+"/g) || []).map((x) => x.slice(1, -1)).filter((x) => ENT.test(x)).every((x) => S[x]);
  const examples = [];
  for (const u of order) (function w(o) { if (Array.isArray(o)) return o.forEach(w); if (!o || typeof o !== 'object') return;
    if (o.type === 'custom:button-card' && o.template && !o.button_card_templates) examples.push({ u, card: o });
    Object.values(o).forEach(w); })(cfgs[u].views || []);
  const report = [];
  const tileOf = (it) => {
    const has = (card) => { const t = [].concat(card.template); return it.tplList ? it.tplList.every((x) => t.includes(x)) : t.includes(it.tpl) && (t.slice(-1)[0] === it.tpl || /^casora_popup_/.test(t.slice(-1)[0])); };
    const ex = examples.find((x) => has(x.card) && entsOk(x.card) && (!it.pick || (x.card.entity ? it.pick(x.card, S) : false)));
    if (ex) { report.push(`${it.id}: Karte aus ${ex.u}`); return JSON.parse(JSON.stringify(ex.card)); }
    const e = it.guess ? it.guess(S) : null;
    if (!e && !it.noEntity) { report.push(`${it.id}: KEIN Gerät im Haus`); return null; }
    report.push(`${it.id}: erzeugt${e ? ' mit ' + e.split('.')[0] + '.…' : ''}`);
    return { type: 'custom:button-card', template: it.tplList || it.tpl, ...(e ? { entity: e } : {}), ...(it.vars ? { variables: it.vars(e, S) } : {}), ...(it.extra ? it.extra(e) : {}) };
  };

  // View skeleton from a room view of the desktop dashboard (grid layout, header card, tablet navigation).
  const roomView = base.views.find((v, i) => i > 0 && (v.cards || []).some((x) => x.template === 'casora_room')) || base.views[0];
  const homeView = base.views[0];
  const homeCard = (homeView.cards || []).find((x) => x.template === 'casora_room');
  const roomCards = base.views.slice(1).map((v) => (v.cards || []).find((x) => x.template === 'casora_room')).filter(Boolean);
  const richRoom = roomCards.sort((a, b) => Object.keys(b.variables || {}).length - Object.keys(a.variables || {}).length)[0] || homeCard;
  const navOf = (v) => (v.cards || []).find((x) => x.type === 'vertical-stack');
  // One room header per view: a header's hero and chrome layers are fixed and would cover a second header's badges.
  // The house header (view "home") comes first like in every Casora dashboard: the phone dashboard takes its badges and
  // scenes from the partner's first view.
  const VIEWS = [{ path: 'home', title: ROOMS.haus, room: 'haus' }, { path: 'start', title: 'Popup-Galerie' }, ...[1, 2, 3, 4, 5, 6, 7].map((w) => ({ path: 'welle-' + w, title: WAVES[w], w })),
    ...Object.keys(ROOMS).filter((r) => r !== 'haus').map((r) => ({ path: bPath(r), title: ROOMS[r], room: r }))];
  const routes = VIEWS.map((v) => ({ url: `/${DASH}/${v.path}`, label: v.path === 'start' ? 'Übersicht' : v.room ? 'Badges ' + BADGE_TAB[v.room] : v.w === 7 ? 'Menüs' : v.w === 6 ? 'Weitere' : 'Welle ' + v.w, icon: 'mdi:home-variant' }));
  const setRoutes = (o) => { if (Array.isArray(o)) return o.forEach(setRoutes); if (!o || typeof o !== 'object') return; if (Array.isArray(o.routes)) o.routes = JSON.parse(JSON.stringify(routes)); Object.values(o).forEach(setRoutes); };
  const header = (title, from = homeCard, vars) => {
    const h = JSON.parse(JSON.stringify(from));
    h.name = title;
    // Tile views: a quiet header (image only), so its badges do not mix with the openers below.
    h.variables = vars || { image: (from.variables || {}).image, preload_rooms: [] };
    // Tile views: a low header (room bar only) – the full-height hero hid the openers below the fold.
    if (!vars) h.styles = { ...(h.styles || {}), card: [...(((h.styles || {}).card) || []), { height: '120px' }, { 'min-height': '0' }] };
    return h;
  };
  const md = (text) => ({ type: 'markdown', text_only: true, content: text });
  const grid = (cards) => ({ type: 'custom:layout-card', layout_type: 'custom:grid-layout',
    layout: { 'grid-template-columns': 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', 'grid-gap': '14px', margin: '0 16px 24px', padding: 0 }, cards });
  const mkView = (vdef, cards) => {
    const v = JSON.parse(JSON.stringify(roomView));
    v.path = vdef.path; v.title = vdef.title;
    const nav = navOf(v); if (nav) setRoutes(nav);
    v.cards = [cards[0], ...(nav ? [nav] : []), ...cards.slice(1)];
    return v;
  };
  const cell = (it, card) => ({ type: 'vertical-stack', cards: [md(`**${it.popup}**<br><small>${it.stage} · \`${[].concat(it.tplList || it.tpl).slice(-1)[0]}\`</small>`), card] });
  const missingCell = (it, why) => md(`**${it.popup}**<br><small>${it.stage}</small><br>⚠️ ${why}`);

  const views = [];
  const index = [];
  const phoneTiles = [];
  const links = routes.map((r) => `[${r.label}](${r.url})`).join(' · ');
  for (const vd of VIEWS.filter((x) => x.w)) {
    const items = ITEMS.filter((it) => it.w === vd.w);
    const cells = [];
    for (const it of items) {
      if (it.tpl) {
        const card = tileOf(it);
        if (!card) { cells.push(missingCell(it, 'fehlt Gerät im Testhaus')); index.push([it, vd.path, 'fehlt Gerät']); continue; }
        card.variables = { ...(card.variables || {}), galerie_id: it.id };
        phoneTiles.push([it, card]);
        cells.push(cell(it, card)); index.push([it, vd.path, 'Kachel']);
      } else if (it.badge) {
        cells.push(md(`**${it.popup}**<br><small>${it.stage} · \`${it.badge}\`${it.note ? ' · ' + it.note : ''}</small><br>→ Ansicht <b>Badges ${BADGE_TAB[it.room]}</b>${it.parent ? ` (erst \`${it.parent.replace('casora_badge_', '')}\` antippen)` : ''}`));
        index.push([it, bPath(it.room), ROOMS[it.room] + (it.parent ? ' › ' + it.parent : '')]);
      } else if (it.menu) {
        const how = { glocke: 'Glocke oben rechts im Kopf (jede Ansicht)', halten: 'die Kachel unten gedrückt halten', szenen: 'Raumleiste „Szenen“ (Desktop) bzw. rechte Taste der Handy-Leiste', raeume: 'Pfeil/„⋯“ am Ende der Raumleiste bzw. mittlere Taste der Handy-Leiste' }[it.menu];
        cells.push(md(`**${it.popup}**<br><small>${how}</small>`)); index.push([it, vd.path, how]);
      }
    }
    if (vd.w === 7) {
      // One plain tile to hold for the hold menu.
      const ex = tileOf({ id: 'halten-kachel', tpl: 'casora_light', pick: notGroup('light') });
      if (ex) { ex.variables = { ...(ex.variables || {}), galerie_id: 'halten' }; cells.push({ type: 'vertical-stack', cards: [md('**Halten-Menü**<br><small>diese Kachel gedrückt halten</small>'), ex] }); phoneTiles.push([{ w: 7, popup: 'Halten-Menü (gedrückt halten)', stage: 'Menü' }, ex]); }
    }
    views.push(mkView(vd, [header(vd.title), md(`## ${vd.title}\n${links}\n\nJe Popup-Art ein Öffner: antippen öffnet das Popup. Badges stehen in den Ansichten **Badges …** (je ein Raumkopf).`), grid(cells)]));
  }
  // Badges: room headers with their badges (opened there, as in the real dashboard).
  const ids = (re) => Object.keys(S).filter((id) => re.test(id)).sort();
  const persons = ids(/^person\./), players = ids(/^media_player\./).sort((a, b) => /\.test/.test(b) - /\.test/.test(a)), scenes = ids(/^scene\./), locks = ids(/^lock\./), cams = ids(/^camera\./).filter((x) => !/karte|map/.test(x));
  const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
  const power = ids(/^sensor\./).filter((x) => dc('power')(S[x]));
  const hv = { ...(homeCard.variables || {}) };
  const trackers = ids(/^device_tracker\./);
  const people = [...persons, ...trackers];
  if (!hv.presence_entity_1 && people.length > 1) Object.assign(hv, { presence_entity_1: people[0], presence_entity_2: people[1], presence_entity_3: people[2], show_people: true, show_people_inline: false });
  if (!hv.energy_entity_1 && power.length) Object.assign(hv, { energy_entity_1: power[0], energy_entity_2: power[1], energy_power_entity: hv.energy_power_entity || power[0] });
  // The weather popup with a felt temperature (#56): the test station's weather (apparent_temperature), when the house has it.
  const feelsWx = ids(/^weather\./).find((x) => (S[x].attributes || {}).apparent_temperature != null);
  if (feelsWx) hv.weather_entity = feelsWx;
  const heads = {};
  const legend = (room) => ITEMS.filter((it) => it.badge && it.room === room).map((it) => `- ${it.popup}: \`${it.badge}\`${it.parent ? ` (erst \`${it.parent}\` antippen)` : ''}${it.note ? ' – ' + it.note : ''}`).join('\n');
  heads.haus = header('Haus', homeCard, hv);
  const pm = ids(/^sensor\./).filter((x) => /pm25|aqi/.test((S[x].attributes || {}).device_class || '')).sort((a, b) => /\.test/.test(b) - /\.test/.test(a));
  heads.raum = header(richRoom.name || 'Raum', richRoom, clean({ ...(richRoom.variables || {}), quality_sensor: (richRoom.variables || {}).quality_sensor || pm[0], show_climate_inline: true }));
  // Media badges only show while something plays: start the first (test) player.
  if (players[0] && !['playing', 'paused'].includes(S[players[0]].state)) await c.cmd({ type: 'call_service', domain: 'media_player', service: 'media_play', target: { entity_id: players[0] } }).catch(() => {});
  heads.medien = header('Medien & Personen', homeCard, clean({ image: hv.image, preload_rooms: [],
    presence_entity_1: people[0], presence_entity_2: people[1], presence_entity_3: people[2], show_people: true, show_people_inline: false,
    media_player_1: players[0], media_player_2: players[1], media_player_3: players[2], show_media: true, show_now_playing: false,
    psn_1: players.find((p) => /playstation|ps5/.test(p)) || players[0] }));
  // Own badges (29-eigene-badges.js): one with the Universal tile's popup (tap own_popup), as the Studio stores them.
  const temps = Object.keys(S).filter((x) => /^sensor\./.test(x) && dc('temperature')(S[x])).sort();
  const own = temps[0] ? [{ name: 'Eigenes Badge', icon: 'mdi:star-outline', entity: temps[0], tap: 'own_popup', popup: { free_values: temps.slice(0, 3), free_chart: true } }] : [];
  heads.sicherheit = header('Sicherheit', homeCard, clean({ image: hv.image, preload_rooms: [],
    show_security: true, show_security_inline: true, place: 'home', security_entity_1: locks[0], security_locks: locks.slice(0, 2), security_cameras: cams.slice(0, 2),
    media_player_1: players[0], show_media: true, show_now_playing: true, custom_badges: own }));
  const bViews = Object.keys(ROOMS).map((r) => mkView({ path: bPath(r), title: ROOMS[r] }, [heads[r],
    md(`## ${ROOMS[r]}\n${links}\n\nDie Badges oben im Kopf; Unter-Badges erscheinen nach Antippen ihres Sammel-Badges.\n${legend(r)}`)]));
  // Start: index of all popup kinds with where to open them.
  const rows = index.map(([it, path, how]) => `| ${it.w <= 5 ? it.w : it.w === 6 ? '–' : 'Menü'} | ${it.popup} | ${it.stage} | [${path}](/${DASH}/${path}) | ${how} |`);
  const start = mkView({ path: 'start', title: 'Popup-Galerie' }, [header('Popup-Galerie'), md(
    '# Popup-Galerie\n' + links + '\n\nJede Popup-Art genau einmal, nach den Wellen des v3-Umbaus (Auftrag §5). Oben über die Raumleiste wechseln.\n' +
    'Neu bauen: `node dev/qa/popup-galerie.mjs anlegen`, prüfen: `node dev/qa/popup-galerie.mjs pruefen`.\n\n' +
    '| Welle | Popup | Bühne | Ansicht | Öffner |\n|---|---|---|---|---|\n' + rows.join('\n'))]);
  const cfg = { ...JSON.parse(JSON.stringify(base)), views: [bViews[0], start, ...views, ...bViews.slice(1)] };
  // The desktop room bar reads its routes from this dashboard's casora_room template (written by the Studio): gallery views.
  const nav = (((cfg.button_card_templates || {}).casora_room || {}).custom_fields || {}).navigation;
  if (nav) setRoutes(nav);
  if (!list.some((d) => d.url_path === DASH)) await c.cmd({ type: 'lovelace/dashboards/create', url_path: DASH, title: 'Popup-Galerie', icon: 'mdi:view-gallery-outline', mode: 'storage', show_in_sidebar: true, require_admin: false });
  await c.cmd({ type: 'lovelace/config/save', url_path: DASH, config: cfg });
  // Phone: popup-galerie-mobile from the house's phone dashboard (<desk>-mobile): its top (background, weather, filter
  // badges with the phone popups, sensor chips, Now Playing, scenes) stays, the rooms below become one header + row per popup kind.
  const MOB = DESK + '-mobile';
  if (cfgs[MOB]) {
    const m = JSON.parse(JSON.stringify(cfgs[MOB]));
    const v = m.views[0];
    const row = (v.cards || []).find((x) => x.type === 'custom:casora-smart-row');
    const tplOf = (x) => [].concat(x.template || []);
    const sceneAt = row ? row.cards.findIndex((x) => tplOf(x).includes('casora_scene_row')) : -1;
    const cut = row ? row.cards.findIndex((x, i) => i > sceneAt && tplOf(x).includes('casora_mobile_header')) : -1;
    if (row && cut > 0) {
      const wl = (w) => (w <= 5 ? 'W' + w : w === 6 ? 'Weitere' : 'Menü');
      // The playing test player first (Now Playing, media badge) and people for the presence badge, as in the house header.
      row.cards.slice(0, cut).forEach((x) => { const t = tplOf(x);
        if ((t.includes('casora_mobile_now_playing') || t.includes('casora_mobile_filter_badges')) && players[0]) {
          const v = x.variables = x.variables || {};
          const mine = [players[0], ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => v['media_player_' + n]).filter((p) => p && p !== players[0])].slice(0, 10);
          mine.forEach((p, n) => { v['media_player_' + (n + 1)] = p; });
        }
        if (t.includes('casora_mobile_filter_badges')) Object.assign(x.variables, clean({ presence_entity_1: hv.presence_entity_1, presence_entity_2: hv.presence_entity_2, presence_entity_3: hv.presence_entity_3, show_people: true }));
        // The phone's weather too: the test station with a felt temperature (#56).
        if (feelsWx && (t.includes('casora_mobile_weather') || (x.variables || {}).weather_entity !== undefined)) x.variables = Object.assign({}, x.variables, { weather_entity: feelsWx });
      });
      row.cards = [...row.cards.slice(0, cut), ...phoneTiles.flatMap(([it, card]) => [
        { type: 'custom:button-card', template: 'casora_mobile_header', name: `${wl(it.w)} · ${it.popup}` },
        { type: 'custom:casora-smart-row', scroll_mode: true, cards: [JSON.parse(JSON.stringify(card))] }])];
      if (!list.some((d) => d.url_path === DASH + '-mobile')) await c.cmd({ type: 'lovelace/dashboards/create', url_path: DASH + '-mobile', title: 'Popup-Galerie Handy', icon: 'mdi:cellphone', mode: 'storage', show_in_sidebar: true, require_admin: false });
      await c.cmd({ type: 'lovelace/config/save', url_path: DASH + '-mobile', config: m });
      console.log(`/${DASH}-mobile: ${phoneTiles.length} Kacheln, Kopf aus ${MOB}`);
    } else console.log(`${MOB}: Aufbau unbekannt – keine Handy-Galerie`);
  } else console.log(`${MOB} fehlt – keine Handy-Galerie`);
  console.log(`/${DASH}: ${cfg.views.length} Ansichten, Vorlagen aus ${DESK}`);
  console.log(report.map((r) => '  ' + r).join('\n'));
}

// ── Check: tap every opener ─────────────────────────────────────────────
async function pruefen() {
  await tokens();
  const H = await import('../e2e/harness.mjs');
  const HANDY = flag('handy');
  const NUR = arg('nur') ? new RegExp(arg('nur')) : null;
  const { browser, page: pg } = await H.open(HANDY ? { width: 393, height: 852, mobile: true, safari: true } : { width: 1440, height: 900 });
  const sleep = (ms) => pg.waitForTimeout(ms);
  const tap = async (x, y) => { if (HANDY) await pg.touchscreen.tap(x, y); else await pg.mouse.click(x, y); };
  const popupOpen = () => pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface) || window.__pierce('ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog, ha-more-info-dialog').some((d) => { const r = d.getBoundingClientRect(); return r.width > 80 && r.height > 80; })).catch(() => false);
  const popupInfo = () => pg.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface;
    if (s) { const t = s.querySelector('.ph-title, .hp-title, h1, h2, [class*=title]'); return { art: 'Casora', titel: t ? t.textContent.trim().slice(0, 60) : '', v3: !!s.querySelector('[class*=stage], .cs-stage, .v3') }; }
    const d = window.__pierce('ha-more-info-dialog, ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog').find((x) => x.getBoundingClientRect().width > 80);
    return d ? { art: 'HA-Dialog (' + d.tagName.toLowerCase() + ')', titel: '' } : null; }).catch(() => null);
  const closeAll = async () => { for (let i = 0; i < 4 && await popupOpen(); i++) { await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close()).catch(() => {}); await pg.keyboard.press('Escape').catch(() => {}); await sleep(500); } };
  const waitOpen = async (ms) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) if (await popupOpen()) return true; return false; };
  let at = null;
  const hold = async (b) => { await pg.mouse.move(b.x + b.w / 2, b.y + b.h / 2); await pg.mouse.down(); await sleep(900); await pg.mouse.up(); };
  // --bilder <dir>: one picture per opened popup (review page), after the open animation has settled.
  const snap = async (res, it) => {
    if (!arg('bilder')) return;
    await pg.waitForTimeout(1600);
    res.bild = it.id + (HANDY ? '-handy' : '') + '.png';
    await pg.screenshot({ path: path.join(arg('bilder'), res.bild) }).catch(() => { res.bild = null; });
  };
  const setRow = async (opt) => { await pg.evaluate((o) => { const h = document.querySelector('home-assistant').hass;
    if (h.states['input_select.casora_expanded_row'] && h.states['input_select.casora_expanded_row'].state !== o)
      return h.callService('input_select', 'select_option', { entity_id: 'input_select.casora_expanded_row', option: o }); }, opt).catch(() => {}); await sleep(1600); };
  const go = async (path) => {
    if (at === path) { await closeAll(); return; }
    // Phone: everything sits on the one view of popup-galerie-mobile.
    if (HANDY) path = 'home';
    if (at === path) { await closeAll(); return; }
    await H.ready(pg, HANDY ? `/${DASH}-mobile/home` : `/${DASH}/${path}`, "() => window.__pierce('button-card').length >= 1", 60000);
    await pg.waitForFunction(() => !!window._casoraLocalLoaded, null, { timeout: 20000 }).catch(() => {});
    await sleep(2500); at = path;
  };
  // Box of a button-card: by galerie_id or by template (inside the n-th room header of the view), scrolled into view.
  const boxOf = (sel) => pg.evaluate((sel) => {
    const all = window.__pierce('button-card');
    const vis = (b) => { const r = b.getBoundingClientRect(); return r.width > 8 && r.height > 8 && (!b.checkVisibility || b.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })); };
    let b;
    if (sel.id) b = all.find((x) => ((x._config || {}).variables || {}).galerie_id === sel.id);
    else {
      const rooms = all.filter((x) => [].concat((x._config || {}).template || []).includes('casora_room'));
      const room = rooms[sel.room];
      const inRoom = (x) => { if (!room) return true; let n = x; while (n) { if (n === room) return true; n = n.parentNode || n.host; } return false; };
      b = all.find((x) => { const t = [].concat((x._config || {}).template || []); return t[t.length - 1] === sel.tpl && inRoom(x) && vis(x); })
        || all.find((x) => { const t = [].concat((x._config || {}).template || []); return t.includes(sel.tpl) && inRoom(x) && vis(x); });
    }
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, sel).catch(() => null);
  const out = [];
  for (const it of ITEMS) {
    if (NUR && !NUR.test(it.id)) continue;
    if (it.phone && !HANDY) continue;
    const res = { id: it.id, w: it.w, popup: it.popup, stage: it.stage, opener: it.tpl ? 'Kachel ' + [].concat(it.tplList || it.tpl).slice(-1)[0] : it.badge ? 'Badge ' + it.badge + ' (' + ROOMS[it.room] + ')' : 'Menü' };
    try {
      if (it.tpl) {
        await go('welle-' + it.w);
        const b = await boxOf({ id: it.id });
        if (!b) { res.status = 'fehlt Gerät'; res.grund = 'kein Öffner auf der Ansicht (kein passendes Gerät beim Anlegen)'; }
        else if (b.w < 12) { res.status = 'öffnet nicht'; res.grund = 'Kachel ausgeblendet (Breite ' + Math.round(b.w) + ')'; }
        if (b && b.w >= 12) {
          await sleep(400);
          let ok = false;
          if (it.hold) { // hold opens the hold menu (22-halten.js); its row „Details“ opens the popup (here: the measurement page)
            await hold(b); await sleep(1200);
            const pt = await pg.evaluate(() => { const m = document.querySelector('casora-hold-menu'); const r = m && m.shadowRoot && m.shadowRoot.querySelector('[data-k="popup"], [data-k="main"]');
              if (!r) return null; const q = r.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }).catch(() => null);
            if (pt) { await tap(pt.x, pt.y); res.wie = 'gedrückt halten › Details'; } else res.wie = 'gedrückt halten';
            ok = await waitOpen(4500); }
          else for (const [fx, fy] of [[0.5, 0.5], [0.22, 0.82]]) { const bb = (await boxOf({ id: it.id })) || b; await tap(bb.x + bb.w * fx, bb.y + bb.h * fy); if (await waitOpen(4500)) { ok = true; break; } }
          res.status = ok ? 'öffnet' : 'öffnet nicht';
        }
      } else if (it.badge) {
        await go(bPath(it.room));
        const sel = { tpl: it.badge, room: 0 };
        if (it.phoneRoom) { // the chips belong to a room page: pick the first room with the phone filter
          await pg.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
            const k = n ? n._rooms.map((r) => r.key).filter((x) => /^room_/.test(x) && x !== 'room_scenes')[0] : null;
            if (k && window._casoraFilter) window._casoraFilter.set(k); }).catch(() => {});
          await sleep(3000); at = null; }
        if (HANDY && !it.phone && (it.parent || it.room !== 'haus' || it.badge === 'casora_badge_scene_group')) { res.status = 'nur Desktop';
          res.grund = it.parent ? 'Unter-Badge im Raumkopf; am Handy zeigt das Sammel-Badge die Liste' : 'Raumkopf der Desktop-Galerie (Handy: Startseiten-Badges und Raumseiten)'; out.push(res); console.log(`${res.status.padEnd(12)} W${it.w} ${it.popup}`); continue; }
        // As a person does it: row closed, tap the group badge, wait until the sub-badges are faded in.
        await setRow('none');
        let b = it.parent ? null : await boxOf(sel);
        if (!b && /now_playing/.test(it.badge) && !HANDY) { // desktop: the wave top right opens Now Playing (cover stage)
          const w = await pg.evaluate(() => { if (window.__pierce('.casora-welle-menu').some((m) => m.getBoundingClientRect().height > 30)) return null; // already open
            const h = window.__pierce('button-card[data-casora-welle]').find((x) => x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().top < 140);
            if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }).catch(() => null);
          if (w) { await pg.mouse.click(w.x, w.y); await sleep(1400); res.wie = 'Welle oben rechts, dann Wiedergabe antippen'; }
          res.wie = 'Welle oben rechts, dann Wiedergabe antippen';
        }
        // Soft design: Now Playing draws its own rows (.cnp-host, 09-weich-wiedergabe.js) over the hidden cards.
        if (!b && /now_playing/.test(it.badge)) b = await pg.evaluate(() => { const h = window.__pierce('.casora-welle-menu, .cnp-host').find((x) => x.getBoundingClientRect().height > 30);
          const r0 = h && [...h.querySelectorAll('*')].find((x) => { const r = x.getBoundingClientRect(); return r.height > 40 && r.width > 120; });
          if (!r0) return null; r0.scrollIntoView({ block: 'center' }); const r = r0.getBoundingClientRect(); return { x: r.x, y: r.y, w: Math.min(r.width, 90), h: r.height }; }).catch(() => null);
        if (it.parent) {
          const p = await boxOf({ tpl: it.parent, room: 0 });
          if (p) { await tap(p.x + p.w / 2, p.y + p.h / 2); for (const t0 = Date.now(); !b && Date.now() - t0 < 4000; await sleep(300)) b = await boxOf(sel); }
          if (await popupOpen()) await closeAll();
        }
        if (!b && !it.parent && !HANDY) for (const r of Object.keys(ROOMS).filter((x) => x !== it.room)) { // another header shows it after all
          await go(bPath(r)); b = await boxOf(sel); if (b) { res.wo = 'Badges ' + BADGE_TAB[r]; break; } }
        if (!b) { res.status = it.absent ? 'nicht sichtbar' : 'fehlt Gerät'; res.grund = it.absent || 'Badge erscheint in keinem Raumkopf'; }
        else {
          await sleep(1500); if (!/now_playing/.test(it.badge)) b = (await boxOf(sel)) || b; // the row settles (re-render after the helper changed)
          await tap(b.x + b.w / 2, b.y + b.h / 2);
          let ok = await waitOpen(4000);
          if (!ok && ROW[it.badge]) { // group badges: tap expands the row; some have their popup on hold
            await setRow('none'); const bb = (await boxOf(sel)) || b; await hold(bb);
            ok = await waitOpen(4000); if (ok) res.wie = 'gedrückt halten';
            else res.grund = 'Antippen klappt die Reihe auf' + (HANDY ? '' : '; das Popup dazu gibt es am Handy (35-phone-hub.js)');
          }
          res.status = ok ? 'öffnet' : !HANDY && ROW[it.badge] ? 'klappt auf' : 'öffnet nicht';
          // The picture before the row is closed again (it used to show the bare header, „nothing in the picture“).
          if (ok) await snap(res, it);
        }
        await closeAll(); await setRow('none');
      } else if (it.menu) {
        await go('welle-7');
        let ok = false;
        if (it.menu === 'glocke') {
          const b = await boxOf({ tpl: 'casora_notifications_button' });
          if (b) { await tap(b.x + b.w / 2, b.y + b.h / 2); await sleep(1500); ok = await pg.evaluate(() => window.__pierce('*').some((e) => /glocke|notif|bell/i.test(e.className && e.className.baseVal === undefined ? e.className : '') && e.getBoundingClientRect().height > 120)).catch(() => false) || await popupOpen(); }
          else res.grund = 'Glocke nicht im Kopf';
        } else if (it.menu === 'halten') {
          const b = await boxOf({ id: 'halten' });
          if (b) { await hold(b); await sleep(1200);
            ok = await pg.evaluate(() => { const m = document.querySelector('casora-hold-menu'); const p = m && m.shadowRoot && m.shadowRoot.querySelector('.pane'); return !!p && p.getBoundingClientRect().height > 40; }).catch(() => false);
            await pg.evaluate(() => window._casoraHold && window._casoraHold.close()).catch(() => {}); }
        } else if (it.menu === 'szenen' || it.menu === 'raeume') {
          if (HANDY) {
            const pt = await pg.evaluate((n) => { const b = window.__pierce('.hmn-btn').filter((x) => x.getBoundingClientRect().width > 0).sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)[n]; if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, it.menu === 'raeume' ? 1 : 2).catch(() => null);
            if (pt) { await pg.touchscreen.tap(pt.x, pt.y); await sleep(1400); }
          } else if (it.menu === 'raeume') {
            res.nurHandy = true; // the desktop room bar only scrolls (‹ ›); the rooms menu is the phone bar's middle key
          } else { // desktop: the scenes tile opens the same sheet (casora_popup_scenes)
            await go('welle-6'); const b = await boxOf({ id: 'szenen-kachel' });
            if (b) { await tap(b.x + b.w / 2, b.y + b.h / 2); res.wie = 'Szenen-Kachel (Weitere)'; await waitOpen(4000); }
          }
          ok = await pg.evaluate(() => window.__pierce('*').some((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return (s.position === 'fixed' || s.position === 'absolute') && r.height > 200 && r.width > 200 && /menu|sheet|blatt|overlay|scene|room/i.test(String(e.className && e.className.baseVal === undefined ? e.className : '') + ' ' + e.tagName); })).catch(() => false) || await popupOpen();
        }
        res.status = res.nurHandy ? 'nur Handy' : ok ? 'öffnet' : 'öffnet nicht';
        at = null;
      }
      if (res.status === 'öffnet') { const i = await popupInfo(); if (i) { res.art = i.art; res.titel = i.titel; } }
      if (res.status === 'öffnet' && !res.bild) await snap(res, it);
    } catch (e) { res.status = 'Fehler'; res.grund = String(e.message || e).slice(0, 200); at = null; }
    await closeAll(); await pg.keyboard.press('Escape').catch(() => {});
    out.push(res);
    console.log(`${res.status.padEnd(12)} W${it.w} ${it.popup}${res.art ? ' – ' + res.art : ''}${res.grund ? ' (' + res.grund + ')' : ''}`);
  }
  await browser.close();
  const n = (s) => out.filter((r) => r.status === s).length;
  console.log(`\n${out.length} Popup-Arten: öffnet ${n('öffnet')}, öffnet nicht ${n('öffnet nicht')}, fehlt Gerät ${n('fehlt Gerät')}, Fehler ${n('Fehler')}`);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
  if (arg('md')) {
    const wl = (w) => (w <= 5 ? 'W' + w : w === 6 ? 'weitere' : 'Menü');
    fs.writeFileSync(arg('md'), `| Welle | Popup | Bühne | Öffner | Ergebnis (${HANDY ? 'Handy' : 'Desktop'}) |\n|---|---|---|---|---|\n` +
      out.map((r) => `| ${wl(r.w)} | ${r.popup} | ${r.stage} | ${r.opener}${r.wie ? ', ' + r.wie : ''} | ${r.status}${r.art && r.art !== 'Casora' ? ' (' + r.art + ')' : ''}${r.grund ? ' – ' + r.grund : ''} |`).join('\n') + '\n');
  }
}
