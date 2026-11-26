// @deckt: custom_components/casora/scripts/local/52-assist-show.js custom_components/casora/scripts/local/01-basis.js#_casoraAssist
// Assist shows the matching popup (52-assist-show.js) without HA: what a target from casora/assist/take opens on the
// open dashboard (the search's index) – a room's lights, its thermostat or temperature page, a camera/weather tile,
// a device's energy (its tile, else its measurement page when the device is on the dashboard), security, a room –
// and nothing for what the dashboard does not show. The Studio switch (assist_popups: false) turns it off; the chat
// asks only after its own answers, and with the switch off it does not even ask.
//   node dev/unit/assist_show_plan.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

let hass = null;
const sent = [];
const timers = [];
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' && hass ? { hass } : null), addEventListener: () => {} };
globalThis.location = { pathname: '/casora/home' };
globalThis.setTimeout = (fn) => { timers.push(fn); return 0; };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/52-assist-show.js', import.meta.url), 'utf8'))();
const X = window._casoraAssistShow;
assert.ok(X && X.plan && X.after, 'module loaded');

hass = {
  entities: {
    'light.decke': { area_id: 'wz' }, 'light.stehlampe': { device_id: 'd_steh' }, 'light.bad': { area_id: 'bad' },
    'climate.wz': { area_id: 'wz' }, 'sensor.t_bad': { area_id: 'bad' },
    'switch.wama': { device_id: 'd_wama' }, 'sensor.wama_energy': { device_id: 'd_wama' }, 'sensor.other_energy': { device_id: 'd_x' },
  },
  devices: { d_steh: { area_id: 'wz' } },
  connection: { sendMessagePromise: (m) => { sent.push(m); return Promise.resolve({ target: next }); } },
  user: { id: 'u' },
};
const idx = {
  rooms: [{ kind: 'room', name: 'Wohnzimmer', url: '/casora/wohnzimmer' }, { kind: 'room', name: 'Bad', url: '/casora/bad' }],
  devices: ['light.decke', 'light.stehlampe', 'light.bad', 'climate.wz', 'camera.tuer', 'weather.home', 'switch.wama']
    .map((id) => ({ kind: 'device', id, name: id, room: null, card: null })),
};

// Lights of a room: by the entity's area or its device's area.
let p = X.plan({ view: 'lights', area_id: 'wz', area: 'Wohnzimmer' }, idx, hass);
assert.deepEqual(p, { how: 'lights', lights: ['light.decke', 'light.stehlampe'], room: 'Wohnzimmer' });
// The whole house: every light the dashboard shows.
assert.equal(X.plan({ view: 'lights' }, idx, hass).lights.length, 3);
// A room without lights on this dashboard: nothing.
assert.equal(X.plan({ view: 'lights', area_id: 'keller', area: 'Keller' }, idx, hass), null);

// Climate: the room's thermostat; else its temperature page when the room is on the dashboard; else nothing.
assert.equal(X.plan({ view: 'climate', area_id: 'wz', area: 'Wohnzimmer', entity_id: 'sensor.t_wz' }, idx, hass).item.id, 'climate.wz');
assert.deepEqual(X.plan({ view: 'climate', area_id: 'bad', area: 'Bad', entity_id: 'sensor.t_bad' }, idx, hass), { how: 'route', id: 'sensor.t_bad' });
assert.equal(X.plan({ view: 'climate', area_id: 'buero', area: 'Büro', entity_id: 'sensor.t_buero' }, idx, hass), null);

// Camera and weather: only their own tile.
assert.equal(X.plan({ view: 'camera', entity_id: 'camera.tuer' }, idx, hass).item.id, 'camera.tuer');
assert.equal(X.plan({ view: 'camera', entity_id: 'camera.garten' }, idx, hass), null);
assert.deepEqual(X.plan({ view: 'weather', entity_id: 'weather.home' }, idx, hass), { how: 'weather', id: 'weather.home' });
// Another weather entity than the dashboard's: the dashboard's weather.
assert.deepEqual(X.plan({ view: 'weather', entity_id: 'weather.other' }, idx, hass), { how: 'weather', id: 'weather.home' });

// Energy: the device is on the dashboard (its switch) → the energy sensor's page; a device that is not → nothing.
assert.deepEqual(X.plan({ view: 'energy', entity_id: 'sensor.wama_energy' }, idx, hass), { how: 'route', id: 'sensor.wama_energy' });
assert.equal(X.plan({ view: 'energy', entity_id: 'sensor.other_energy' }, idx, hass), null);

// Room page (umlauts and case folded), security without an alarm panel → doors & windows.
assert.equal(X.plan({ view: 'room', area: 'wohnzimmer' }, idx, hass).item.url, '/casora/wohnzimmer');
assert.equal(X.plan({ view: 'room', area: 'Keller' }, idx, hass), null);
assert.deepEqual(X.plan({ view: 'security' }, idx, hass), { how: 'contacts' });
assert.equal(X.plan({ view: 'nonsense' }, idx, hass), null);
assert.equal(X.plan(null, idx, hass), null);

// Studio switch: Home's room card or the phone's title card with assist_popups: false.
const cfg = (v) => ({ views: [{ cards: [{ type: 'custom:button-card', template: ['casora_room'], variables: v }] }] });
assert.equal(X.enabled(cfg({})), true);
assert.equal(X.enabled(cfg({ assist_popups: false })), false);
assert.equal(X.enabled({ views: [{ cards: [{ type: 'vertical-stack', cards: [{ template: 'casora_mobile_weather', variables: { assist_popups: false } }] }] }] }), false);

// after(): asks the integration and opens what fits; with the switch off it does not ask.
let next = { view: 'camera', entity_id: 'camera.tuer' };
const opened = [];
let shownCfg = cfg({});
window._casoraSearch = {
  _configNow: () => shownCfg, isCasoraCfg: () => true, index: () => idx,
  _actions: { openDevice: (it) => opened.push(it.id), openRoom: (it) => opened.push(it.url) },
};
window.casoraPopup = { close: () => {} };
X.after();
await new Promise((r) => setImmediate(r));
assert.deepEqual(sent, [{ type: 'casora/assist/take' }]);
timers.splice(0).forEach((f) => f());
assert.deepEqual(opened, ['camera.tuer']);
shownCfg = cfg({ assist_popups: false });
X.after();
await new Promise((r) => setImmediate(r));
assert.equal(sent.length, 1, 'switched off: no question to the integration');
// No target (a question HA answered by itself): nothing opens.
shownCfg = cfg({});
next = null;
X.after();
await new Promise((r) => setImmediate(r));
timers.splice(0).forEach((f) => f());
assert.deepEqual(opened, ['camera.tuer']);

// "Show me the weather" stays HA's own intent (HassGetWeather, not a Casora sentence): its answer names the
// weather entity, and that opens the weather popup.
const haWeather = { response: { response_type: 'query_answer', data: { success: [{ type: 'entity', name: 'Home', id: 'weather.home' }], failed: [] } } };
assert.deepEqual(X.fromHa(haWeather), { view: 'weather', entity_id: 'weather.home' });
assert.equal(X.fromHa({ response: { response_type: 'action_done', data: { success: [{ type: 'entity', id: 'light.decke' }] } } }), null, 'a switched light opens nothing');
assert.equal(X.fromHa({ response: { response_type: 'error', data: { code: 'no_intent_match' } } }), null);
assert.equal(X.fromHa(undefined), null);
window._casoraNotifyOpenViaCard = (_a, _b, card) => opened.push(card.template + ':' + card.entity);
next = null;
X.after(haWeather);
await new Promise((r) => setImmediate(r));
timers.splice(0).forEach((f) => f());
assert.deepEqual(opened, ['camera.tuer', 'casora_weather:weather.home'], 'the weather popup from HA\'s answer');
// Casora's own target wins over HA's answer.
next = { view: 'camera', entity_id: 'camera.tuer' };
X.after(haWeather);
await new Promise((r) => setImmediate(r));
timers.splice(0).forEach((f) => f());
assert.deepEqual(opened, ['camera.tuer', 'casora_weather:weather.home', 'camera.tuer']);

// The chat calls it after each answer (text and voice) with HA's intent output.
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
assert.equal((basis.match(/window\._casoraAssistShow\.after\(o\)/g) || []).length, 2, 'text and voice answer hook');
console.log('assist_show_plan OK');
