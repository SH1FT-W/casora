// Pet tracker (community card #25, 26-haustier.js) without HA. As in HA 2026.10: the tracker hardware carries the
// device_tracker, battery, status and switches; the pet device hangs on it via via_device_id (activity, rest, sleep).
// The older layout (device_tracker on the pet device) is checked at the end.  node dev/unit/haustier.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('00-finden.js');
load('15-person.js');
load('26-haustier.js');
const P = window._casoraPet;

const states = {}, entities = {};
const add = (id, state, attrs, reg) => {
  states[id] = { entity_id: id, state, attributes: attrs || {}, last_changed: new Date(Date.now() - 3600000).toISOString() };
  entities[id] = Object.assign({ entity_id: id, platform: 'tractive' }, reg || {});
};
const devices = {
  pet: { id: 'pet', name: 'Wuffi', via_device_id: 'hw', entry_type: 'service' },
  hw: { id: 'hw', name: 'Tracker ABCDEFGH' },
};
add('zone.home', 'zoning', { latitude: 50, longitude: 8 }, { platform: 'zone' });
add('device_tracker.tracker_abcdefgh', 'home', { latitude: 50, longitude: 8, gps_accuracy: 8, source_type: 'gps' }, { device_id: 'hw', translation_key: 'tracker' });
add('sensor.wuffi_activity_time', '72', {}, { device_id: 'pet', translation_key: 'activity_time' });
add('sensor.wuffi_rest_time', '580', {}, { device_id: 'pet', translation_key: 'rest_time' });
add('sensor.wuffi_daily_goal', '90', {}, { device_id: 'pet', translation_key: 'daily_goal' });
add('sensor.wuffi_day_sleep', '185', {}, { device_id: 'pet', translation_key: 'minutes_day_sleep' });
add('sensor.wuffi_night_sleep', '500', {}, { device_id: 'pet', translation_key: 'minutes_night_sleep' });
add('sensor.tracker_battery', '82', { device_class: 'battery' }, { device_id: 'hw' });
add('binary_sensor.tracker_charging', 'off', { device_class: 'battery_charging' }, { device_id: 'hw' });
add('sensor.tracker_status', 'operational', {}, { device_id: 'hw', translation_key: 'tracker_state', entity_category: 'diagnostic' });
add('switch.tracker_live', 'off', {}, { device_id: 'hw', translation_key: 'live_tracking' });
add('switch.tracker_buzzer', 'off', {}, { device_id: 'hw', translation_key: 'tracker_buzzer' });
add('switch.tracker_led', 'off', {}, { device_id: 'hw', translation_key: 'tracker_led' });
const hass = { states, entities, devices };
const ID = 'device_tracker.tracker_abcdefgh';

// Entities of the pet and of its tracker device.
const c = P.find(hass, ID);
assert.deepEqual(c, { tracker: ID, battery: 'sensor.tracker_battery', charging: 'binary_sensor.tracker_charging', state: 'sensor.tracker_status',
  saving: null, live: 'switch.tracker_live', buzzer: 'switch.tracker_buzzer', led: 'switch.tracker_led', active: 'sensor.wuffi_activity_time',
  rest: 'sensor.wuffi_rest_time', goal: 'sensor.wuffi_daily_goal', sleepDay: 'sensor.wuffi_day_sleep', sleepNight: 'sensor.wuffi_night_sleep' });

const of = () => P.of(states[ID], hass);
let s = of();
assert.equal(P.tileState(s), 'Zuhause · 82 %');
assert.ok(P.active(s));
assert.equal(P.color(s), window._casoraPerson.zoneHue('home'));

// Away with live tracking: distance instead of battery.
states[ID].state = 'not_home'; states[ID].attributes.latitude = 50.0126;
states['switch.tracker_live'].state = 'on';
s = of();
assert.match(P.tileState(s), /^Live · Unterwegs · 1,4 km$/);
assert.equal(P.color(s), window._casoraPerson.zoneHue('not_home'));

// Other zone keeps the zone name.
states[ID].state = 'Hundewiese'; states['switch.tracker_live'].state = 'off';
assert.equal(P.tileState(of()), 'Hundewiese · 82 %');

// Low battery (not charging) and a silent tracker need attention.
states['sensor.tracker_battery'].state = '12';
s = of();
assert.equal(P.tileState(s), 'Akku schwach · 12 %');
assert.equal(s.level, 2);
assert.equal(P.color(s), P.COLOR.warn);
states['binary_sensor.tracker_charging'].state = 'on';
assert.equal(of().level, 0, 'charging: no warning');
states['binary_sensor.tracker_charging'].state = 'off'; states['sensor.tracker_battery'].state = '82';
states['sensor.tracker_status'].state = 'not_reporting';
assert.equal(P.tileState(of()), 'Meldet sich nicht');
states['sensor.tracker_status'].state = 'operational';

// Unavailable: calm, no TypeError.
states[ID].state = 'unavailable';
s = of();
assert.equal(P.tileState(s), 'Nicht verfügbar');
assert.ok(!P.active(s));
// Entity gone entirely.
assert.equal(P.tileState(P.of({ entity_id: 'device_tracker.gone' }, hass)), 'Nicht verfügbar');
states[ID].state = 'home';

// Older Tractive without a battery sensor: battery from the tracker attribute.
const noBat = Object.assign({}, c, { battery: null });
states[ID].attributes.battery_level = 55;
assert.equal(P.status(noBat, states, hass).battery, 55);

// Popup parts with a minimal UI kit.
window._casoraUI = {
  tokens: { ink: '#fff', ink2: '#ccc', ink3: '#999', font: 'system-ui' }, esc: (t) => String(t),
  line: (v, rest) => '<line>' + v + ' | ' + rest.join(' | ') + '</line>',
  group: (rows, t) => '<group ' + t + '>' + rows.map((r) => r.label + '=' + (r.value || '') + '/' + (r.sub || '')).join(';') + '</group>',
  label: (t) => '<div>' + t + '</div>',
};
const hero = P.sec('hero', c, states, hass, null);
assert.match(hero, /<line>Zuhause \| seit .* \| Akku 82 %<\/line>/);
assert.match(hero, /Live-Tracking/); assert.match(hero, /Ton/); assert.match(hero, /Licht/);
assert.match(hero, /switch\.tracker_buzzer/);
const info = P.sec('info', c, states, hass, null);
assert.match(info, /Akku=82 %\/Lädt nicht/);
assert.match(info, /Tracker=Aktiv\/GPS · auf 8 m genau/);
const today = P.sec('today', c, states, hass, null);
assert.match(today, />72</); assert.match(today, /Min\. aktiv/);
assert.match(today, /1 Std\. 30 Min\./, 'goal');
assert.match(today, /9 Std\. 40 Min\./, 'rest');
assert.match(today, /8 Std\. 20 Min\./, 'night sleep');
// Power saving (issue #25): Tractive makes the switches unavailable and HA skips the call silently - the keys stay
// visible but dimmed, without an action, with a line saying why.
assert.match(hero, /data-casora-svc/, 'available switches have an action');
assert.ok(!/aria-disabled/.test(hero), 'nothing dimmed while available');
for (const k of ['live', 'buzzer', 'led']) states[c[k]].state = 'unavailable';
const cs = Object.assign({}, c, { saving: 'switch.tracker_power_saving' });
states[cs.saving] = { entity_id: cs.saving, state: 'on', attributes: {} };
const saving = P.sec('hero', cs, states, hass, null);
assert.ok(!/data-casora-svc/.test(saving), 'no action on an unavailable switch');
assert.equal((saving.match(/aria-disabled="true"/g) || []).length, 3, 'three dimmed keys');
assert.match(saving, /Energiesparen ist an/);
states[cs.saving].state = 'off';
assert.match(P.sec('hero', cs, states, hass, null), /nicht erreichbar/, 'unavailable without power saving');
states[c.live].state = 'off'; states[c.buzzer].state = 'off'; states[c.led].state = 'off';
const mixed = P.sec('hero', c, states, hass, null);
assert.equal((mixed.match(/data-casora-svc/g) || []).length, 3, 'back to normal');
assert.ok(!/nicht erreichbar|Energiesparen ist an/.test(mixed), 'no hint when everything works');
// No switches (other tracker model): no buttons.
assert.ok(!/Live-Tracking/.test(P.sec('hero', Object.assign({}, c, { live: null, buzzer: null, led: null }), states, hass, null)));

// Older layout: device_tracker on the pet device, the tracker hardware behind it - same entities found.
entities[ID].device_id = 'pet';
assert.deepEqual(P.find(hass, ID), c, 'older layout');
console.log('haustier: ok');
