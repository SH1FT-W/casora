// Prüfrunde u08-02: a popup row on a select („Modus · Automatik ›“ of Smart Heating, „Velair-Modus · Standard ›“) opens
// the select's page (18-ziele.js). It said the raw option („auto · Modus“, „default“) and offered no way to choose – a
// dead end behind ›. Now the page says the row's word and shows the options as moons; a tap calls select_option.
//   node dev/unit/select_seite_auswahl.mjs
// @deckt: custom_components/casora/scripts/local/18-ziele.js#optionWord,optionMoons,stateWord custom_components/casora/scripts/local/51-smart-heating.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const states = {}, entities = {};
const add = (id, state, attrs, reg) => {
  states[id] = { entity_id: id, state, attributes: Object.assign({ friendly_name: id }, attrs || {}), last_changed: new Date(Date.now() - 3600000).toISOString() };
  entities[id] = Object.assign({ entity_id: id, platform: 'demo' }, reg || {});
};
// HA without translations for these custom integrations: formatEntityState gives the raw option back.
const hass = { states, entities, devices: {}, language: 'de', formatEntityState: (st) => st.state,
  callApi: () => Promise.resolve([[]]) };
const MODE = 'select.qa_house_mode', VEL = 'select.qa_velair_mode';
add(MODE, 'auto', { options: ['auto', 'away', 'vacation', 'off', 'summer'] }, { platform: 'advanced_climate', translation_key: 'mode' });
add(VEL, 'default', { options: ['default', 'manual'] }, { platform: 'velair' });

let stages = [];
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
window._casoraUI = {
  stage: (kind, o) => { stages.push({ kind, o }); return ''; }, line: () => '', segments: () => '', label: (t) => t,
  group: () => '', quick: () => '', esc: String, tokens: {}, soft: () => true,
};
// Casora's word for raw codes, as casora-core.js has it.
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('  var RAW = { ready:'), b = core.indexOf('\n  };', core.indexOf('  window._casoraReadableRaw = function')) + 5;
new Function(core.slice(a, b))();
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
new Function(read('18-ziele.js'))();
new Function(read('51-smart-heating.js'))();
const Z = window._casoraZiele;

const stageOf = (id) => { stages = []; Z.sec('m_stage', id, '24h', states, hass, null); return stages[0] && stages[0].o; };

// Smart Heating's house mode: the row's word, every option as a moon, the chosen one marked.
let o = stageOf(MODE);
assert.ok(o, 'status stage');
assert.equal(o.text, 'Automatik', 'the row\'s word, not „auto“');
assert.ok(Array.isArray(o.moons), 'options to choose from');
assert.deepEqual(o.moons.map((m) => m.text), ['Automatik', 'Abwesend', 'Urlaub', 'Aus', 'Sommer'], 'Smart Heating\'s own words');
assert.deepEqual(o.moons.map((m) => m.active), [true, false, false, false, false]);
assert.deepEqual(o.moons[1].svc, { domain: 'select', service: 'select_option', data: { option: 'away' }, target: { entity_id: MODE } });

// Velair's mode: Casora's word for the raw code („Standard“, as the row says).
o = stageOf(VEL);
assert.equal(o.text, 'Standard');
assert.deepEqual(o.moons.map((m) => m.text), ['Standard', 'Manuell']);

// A sensor keeps its page without moons.
add('sensor.qa_text', 'connected', {});
o = stageOf('sensor.qa_text');
assert.ok(!o.moons, 'no choice for a sensor');
console.log('select_seite_auswahl: ok');
