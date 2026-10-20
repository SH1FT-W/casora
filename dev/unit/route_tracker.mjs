// Tap routing for device trackers (18-ziele.js, issue #25) without HA. HA 2026.10 marks every
// device_tracker as diagnostic; a tracker is still a device: a tap opens its device page, and the
// device page lists it under "Gehört dazu", not "Diagnose". Other diagnostic/config entities keep
// their measurement page and their groups.  node dev/unit/route_tracker.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const states = {}, entities = {};
const add = (id, state, reg) => {
  states[id] = { entity_id: id, state, attributes: { friendly_name: id }, last_changed: new Date().toISOString() };
  entities[id] = Object.assign({ entity_id: id, device_id: 'phone' }, reg || {});
};
add('device_tracker.phone', 'home', { platform: 'mobile_app', entity_category: 'diagnostic' });
add('sensor.phone_battery', '80', { platform: 'mobile_app' });
add('sensor.phone_wifi', 'Home', { platform: 'mobile_app', entity_category: 'diagnostic' });
add('switch.phone_setting', 'on', { platform: 'mobile_app', entity_category: 'config' });
add('button.phone_identify', 'unknown', { platform: 'mobile_app', entity_category: 'config' });
// History is fetched in the background; never answering keeps the test offline.
const hass = { states, entities, devices: { phone: { id: 'phone', name: 'Phone' } }, language: 'de', callApi: () => new Promise(() => {}) };

globalThis.window = globalThis;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null), addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/18-ziele.js', import.meta.url), 'utf8'))();
const Z = window._casoraZiele;

// Record which page a tap opens.
let opened = null;
for (const k of ['openMeasure', 'openDevice', 'openDeviceTile', 'openCamera']) Z[k] = (id) => { opened = [k, id]; return true; };
const route = (id) => { opened = null; window.casoraRoute(id, {}); return opened && opened[0]; };

assert.equal(route('device_tracker.phone'), 'openDevice', 'diagnostic tracker opens its device page');
assert.equal(route('sensor.phone_wifi'), 'openMeasure', 'diagnostic sensor keeps its measurement page');
assert.equal(route('switch.phone_setting'), 'openMeasure', 'config switch keeps its measurement page');
assert.equal(route('sensor.phone_battery'), 'openMeasure', 'plain sensor unchanged');

// Device page: entities grouped by category, the tracker among the main ones.
window._casoraUI = {
  esc: (t) => String(t),
  group: (rows, title) => '<group ' + title + '>' + rows.map((r) => r.entity).join(',') + '</group>',
  more: (key, html, o) => '<more ' + o.label + '>' + html + '</more>',
};
Z.iconOf = Z.iconOf || (() => 'mdi:circle');
const html = Z.sec('d_ents', 'device_tracker.phone', null, states, hass, null);
const main = (html.match(/<group Gehört dazu>([^<]*)<\/group>/) || [])[1] || '';
const diag = (html.match(/<more Diagnose><group null>([^<]*)<\/group>/) || html.match(/<group Diagnose>([^<]*)<\/group>/) || [])[1] || '';
assert.ok(main.split(',').includes('device_tracker.phone'), 'tracker listed under "Gehört dazu": ' + html);
assert.ok(!diag.split(',').includes('device_tracker.phone'), 'tracker not under "Diagnose"');
assert.ok(diag.split(',').includes('sensor.phone_wifi'), 'diagnostic sensor stays under "Diagnose"');
assert.match(html, /<group Einstellungen>[^<]*switch\.phone_setting/, 'config switch stays under "Einstellungen"');
console.log('route_tracker: ok');
