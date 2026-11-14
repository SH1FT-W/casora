// Raw values in lists (owner 14.11.2026, V14): when the integration has no words for a state, Casora's own fallback at
// one place (core _casoraReadableRaw, used by _casoraNiceState and the Universal/list tile word): HA states in the word
// list's words („Tür closed“ → „Geschlossen“), snake_case codes readable without the shared prefix
// („cooking_oven_program_heating_mode_top_bottom_heating“ → „Top bottom heating“). Free text stays as written.
//   node dev/unit/readable_raw_state.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraReadableRaw,_casoraNiceState,_casoraStateText, custom_components/casora/scripts/local/28-free-tile.js#F.word
import assert from 'node:assert/strict';
import { freeTileEnv } from './lib/free_tile_env.mjs';

const { F } = freeTileEnv();
// HA without translations for the mock's states: formatEntityState gives the raw state back.
const hass = { formatEntityState: (e, v) => String(v != null ? v : e.state), states: {}, entities: {} };
const nice = (e) => window._casoraNiceState(hass, e);

const door = { entity_id: 'sensor.testofen_tur', state: 'closed', attributes: { friendly_name: 'Testofen Tür', device_class: 'enum', options: ['open', 'closed', 'locked', 'ajar'] } };
assert.equal(nice(door), 'Geschlossen', 'door sensor: closed in Casora words');
assert.equal(F.word(hass, door), 'Geschlossen', 'list/Universal tile: same word');
assert.equal(nice(Object.assign({}, door, { state: 'open' })), 'Geöffnet');
assert.equal(nice(Object.assign({}, door, { state: 'locked' })), 'Verriegelt');

const P = 'cooking_oven_program_heating_mode_';
const prog = { entity_id: 'select.testbackofen_ausgewahltes_programm', state: P + 'top_bottom_heating',
  attributes: { friendly_name: 'Testbackofen Ausgewähltes Programm', options: ['top_bottom_heating', 'hot_air', 'pizza_setting'].map((x) => P + x) } };
assert.equal(nice(prog), 'Top bottom heating', 'select: shared prefix dropped, readable');
assert.equal(F.word(hass, prog), 'Top bottom heating');
// The list popup asks per option (34-entity-list: state replaced by the option).
assert.equal(nice(Object.assign({}, prog, { state: P + 'hot_air' })), 'Hot air');

// Without options: domain and device name in front dropped.
assert.equal(nice({ entity_id: 'sensor.testofen_status', state: 'testofen_door_open_alarm', attributes: { friendly_name: 'Testofen Status' } }), 'Door open alarm');
assert.equal(nice({ entity_id: 'sensor.x', state: 'sensor_low_water', attributes: { friendly_name: 'X' } }), 'Low water');

// Unchanged: HA's own words, Casora's words, free text, values that are not lower-case codes.
const de = { formatEntityState: (e) => ({ closed: 'Geschlossen (HA)' })[e.state] || e.state };
assert.equal(window._casoraNiceState(de, door), 'Geschlossen (HA)', 'HA translates: its word wins');
assert.equal(nice({ entity_id: 'sensor.a', state: 'ready', attributes: {} }), 'Bereit');
assert.equal(nice({ entity_id: 'input_text.note', state: 'call_mom', attributes: {} }), 'call_mom', 'free text as written');
assert.equal(nice({ entity_id: 'sensor.wifi', state: 'WLAN_5G', attributes: {} }), 'WLAN_5G');
assert.equal(nice({ entity_id: 'sensor.phone', state: 'iPhone 15', attributes: {} }), 'iPhone 15');
assert.equal(nice({ entity_id: 'sensor.t', state: '21.5', attributes: {} }), '21.5');

console.log('readable_raw_state: ok');
