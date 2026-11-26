// Prüfrunde d03-15: a network tile whose download/upload were battery sensors in kWh (an imported dashboard) showed
// „↓ 49,7 Mbit/s“ (the wired rate) while its popup said „Download 0 Mbit/s“ and drew a kWh chart. Only a data rate
// counts as throughput, in the tile and in the popup: a sensor with another unit is passed over for the next one.
// Invented entities.   node dev/unit/netzwerk_nur_datenrate.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_network,casora_popup_network
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const S = (state, unit) => ({ state: String(state), attributes: unit ? { unit_of_measurement: unit } : {} });
const states = {
  'sensor.qa_akku_heute': S(12.4, 'kWh'), 'sensor.qa_akku_monat': S(0, 'kWh'),
  'sensor.qa_lan_down': S(49.7, 'Mbit/s'), 'sensor.qa_lan_up': S(4.1, 'Mbit/s'),
};
const vars = { entity_download: 'sensor.qa_akku_heute', entity_upload: 'sensor.qa_akku_monat',
  entity_stat_1: 'sensor.qa_lan_down', entity_stat_2: 'sensor.qa_lan_up' };
const window = { casoraNum: (x) => String(x).replace('.', ',') };

// Tile: the rate of the wired sensor, never the kWh value (12,4 would win the max otherwise).
const tile = new Function('window', 'states', 'variables', 'entity', body(T.casora_network.state_display));
assert.equal(tile(window, states, vars, { entity_id: 'sensor.qa_akku_heute' }), '↓ 49,7 Mbit/s', 'tile');
states['sensor.qa_akku_heute'] = S(80, 'kWh');
assert.equal(tile(window, states, vars, { entity_id: 'sensor.qa_akku_heute' }), '↓ 49,7 Mbit/s', 'tile: a bigger kWh value does not win');

// Popup: the same sensors for download and upload.
const pop = body(T.casora_popup_network.tap_action.casora_popup.content);
const a = pop.indexOf('/* Entity Resolution */'), b = pop.indexOf('/* Values */');
assert.ok(a > 0 && b > a, 'resolution block found');
const ids = new Function('states', 'variables', 'entity', pop.slice(a, b) + '\nreturn { dlId, ulId };')(states, vars, { entity_id: 'sensor.qa_akku_heute' });
assert.deepEqual(ids, { dlId: 'sensor.qa_lan_down', ulId: 'sensor.qa_lan_up' }, 'popup reads the rates');
// A proper download sensor stays first.
const ok = new Function('states', 'variables', 'entity', pop.slice(a, b) + '\nreturn { dlId, ulId };')(
  { ...states, 'sensor.qa_wan_down': S(120, 'Mbit/s') }, { ...vars, entity_download: 'sensor.qa_wan_down' }, null);
assert.equal(ok.dlId, 'sensor.qa_wan_down');
console.log('netzwerk_nur_datenrate: ok');
