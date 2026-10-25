// Frigate streams (#61, 23-frigate.js) without HA: the camera's go2rtc streams from the integration's proxy
// (go2rtc/api/streams), labels, which stream plays where (desktop/phone, tile/popup, session choice), the list
// cache per instance, the popup's live card and the Studio choices (casora-panel-types.js dynOptions).
// Cameras and stream names made up.   node dev/unit/frigate_streams.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
let phone = false;
globalThis.matchMedia = () => ({ matches: phone });
globalThis.location = { pathname: '/casora/home', href: 'http://ha.local:8123/casora/home' };
const store = {};
globalThis.sessionStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(read('custom_components/casora/scripts/local/23-frigate.js'))();
const F = window._casoraFrigate;
assert.ok(F && F.parseStreams && F.pickStream && F.streamList && F.streamChoices, 'module loaded');

// 1) Stream list: only the camera's own streams (name + separator), other cameras and the main name left out.
const go2 = { gartentor: { producers: [] }, gartentor_sub: {}, 'gartentor-hd': {}, gartentorx: {}, einfahrt: {}, einfahrt_sub: {}, Gartentor_low: {} };
assert.deepEqual(F.parseStreams(go2, 'gartentor'), ['gartentor_sub', 'gartentor-hd', 'Gartentor_low']);
assert.deepEqual(F.parseStreams(JSON.stringify(go2), 'einfahrt'), ['einfahrt_sub'], 'JSON text as from the proxy');
assert.deepEqual(F.parseStreams([{ name: 'hof_sub' }, 'hof_2', 'hof'], 'hof'), ['hof_sub', 'hof_2'], 'array form');
assert.deepEqual(F.parseStreams(null, 'hof'), []);
assert.deepEqual(F.parseStreams('kaputt', 'hof'), []);
assert.deepEqual(F.parseStreams(go2, ''), []);

// 2) Kinds and labels.
assert.equal(F.streamKind('gartentor', 'gartentor_sub'), 'sub');
assert.equal(F.streamKind('gartentor', 'Gartentor_low'), 'sub');
assert.equal(F.streamKind('gartentor', 'gartentor-hd'), 'main');
assert.equal(F.streamKind('gartentor', 'gartentor_cam2'), null);
assert.equal(F.streamLabel('gartentor', F.STD), 'Standard');
assert.equal(F.streamLabel('gartentor', 'gartentor_sub', ['gartentor_sub']), 'Unterstream');
assert.equal(F.streamLabel('gartentor', 'gartentor-hd', ['gartentor-hd']), 'Hauptstream');
assert.equal(F.streamLabel('gartentor', 'gartentor_cam2', ['gartentor_cam2']), 'cam2');
// Two sub streams: their names tell them apart.
assert.equal(F.streamLabel('gartentor', 'gartentor_sub', ['gartentor_sub', 'gartentor_sub2']), 'sub');
assert.equal(F.subStream('gartentor', ['gartentor-hd', 'gartentor_sub']), 'gartentor_sub');
assert.equal(F.subStream('gartentor', ['gartentor-hd']), null);

// 3) Which stream: '' = Standard (HA's own stream), else the go2rtc name.
const L = ['gartentor_sub', 'gartentor-hd'];
const pick = (v, where, ph, sess) => F.pickStream('gartentor', L, v, where, ph, sess);
assert.equal(pick({}, 'popup', false), '', 'desktop default: Standard');
assert.equal(pick({}, 'popup', true), 'gartentor_sub', 'phone default: the sub stream');
assert.equal(F.pickStream('gartentor', ['gartentor-hd'], {}, 'popup', true), '', 'phone without sub stream: as desktop');
assert.equal(F.pickStream('gartentor', ['gartentor-hd'], { stream_popup: 'gartentor-hd' }, 'popup', true), 'gartentor-hd', 'phone without sub: desktop field');
assert.equal(pick({ stream_popup: 'gartentor-hd' }, 'popup', false), 'gartentor-hd');
assert.equal(pick({ stream_popup_phone: 'standard' }, 'popup', true), '', 'phone set to Standard');
assert.equal(pick({ stream_popup_phone: 'gartentor-hd' }, 'popup', true), 'gartentor-hd');
assert.equal(pick({ stream_tile: 'gartentor_sub' }, 'tile', false), 'gartentor_sub', 'tile field');
assert.equal(pick({ stream_tile: 'gartentor_sub' }, 'popup', false), '', 'tile field does not touch the popup');
assert.equal(pick({}, 'popup', false, 'gartentor_sub'), 'gartentor_sub', 'session choice wins in the popup');
assert.equal(pick({}, 'popup', true, 'standard'), '', 'session choice Standard on a phone');
assert.equal(pick({}, 'tile', true, 'standard'), 'gartentor_sub', 'session choice is popup only');
assert.equal(pick({ stream_popup: 'weg_sub' }, 'popup', false), '', 'stream gone: Standard');
assert.equal(pick({}, 'popup', false, 'weg_sub'), '', 'stale session choice: default');
assert.equal(F.pickStream('gartentor', null, {}, 'popup', true), '', 'no list: Standard');

// 4) Phone detection: narrow screen or the phone dashboard (…-mobile).
phone = false; assert.equal(F.isPhone(), false);
phone = true; assert.equal(F.isPhone(), true);
phone = false; location.pathname = '/casora-mobile/home'; assert.equal(F.isPhone(), true);
location.pathname = '/casora/home';

// 5) Session choice per camera, kept in sessionStorage.
assert.equal(F.sessionStream('camera.gartentor'), '');
F.sessionStream('camera.gartentor', 'gartentor_sub');
assert.equal(F.sessionStream('camera.gartentor'), 'gartentor_sub');
assert.equal(store['casora-frigate-stream:camera.gartentor'], 'gartentor_sub');
assert.equal(F.sessionStream('camera.einfahrt'), '', 'per camera');

// 6) List cache per instance: one request (with HA's fetchWithAuth), null until it is there, done() afterwards.
const states = {
  'camera.gartentor': { entity_id: 'camera.gartentor', state: 'recording', attributes: { camera_name: 'gartentor', client_id: 'frigate', device_class: 'camera', supported_features: 2 } },
  'camera.einfahrt': { entity_id: 'camera.einfahrt', state: 'recording', attributes: { camera_name: 'einfahrt', client_id: 'frigate', device_class: 'camera', supported_features: 0 } },
  'camera.carport': { entity_id: 'camera.carport', state: 'recording', attributes: { camera_name: 'carport', client_id: 'frigate', device_class: 'camera', supported_features: 0 } },
};
const entities = { 'camera.gartentor': { entity_id: 'camera.gartentor', platform: 'frigate', device_id: 'd1' },
  'camera.einfahrt': { entity_id: 'camera.einfahrt', platform: 'frigate', device_id: 'd2' },
  'camera.carport': { entity_id: 'camera.carport', platform: 'frigate', device_id: 'd3' } };
const asked = [];
let answer = { ok: true, json: async () => go2 };
const hass = { states, entities, devices: {}, areas: {}, config: { components: ['frigate'] },
  fetchWithAuth: async (p) => { asked.push(p); return answer; } };
F._streamsReset();
const c = F.find(hass, 'camera.gartentor');
let called = 0;
assert.equal(F.streamList(hass, c, () => called++), null, 'not known yet');
assert.equal(F.streamList(hass, F.find(hass, 'camera.einfahrt')), null, 'same instance: same request');
await new Promise((r) => setTimeout(r, 10));
assert.deepEqual(asked, ['/api/frigate/frigate/go2rtc/api/streams'], 'one request, the integration proxy');
assert.equal(called, 1, 'done() once');
assert.deepEqual(F.streamList(hass, c), ['gartentor_sub', 'gartentor-hd', 'Gartentor_low']);
assert.deepEqual(F.streamList(hass, F.find(hass, 'camera.einfahrt')), ['einfahrt_sub']);
assert.equal(asked.length, 1, 'cached');
// Integration without the go2rtc proxy (404): no streams, nothing breaks.
F._streamsReset();
answer = { ok: false, status: 404, json: async () => ({}) };
F.streamList(hass, c);
await new Promise((r) => setTimeout(r, 10));
assert.deepEqual(F.streamList(hass, c), []);
// No fetchWithAuth: signed path (auth/sign_path) instead.
F._streamsReset();
const signed = [];
const hass2 = { ...hass, fetchWithAuth: undefined, hassUrl: (p) => 'http://ha.local:8123' + p,
  callWS: async (m) => { signed.push(m); return { path: m.path + '?authSig=x' }; } };
const realFetch = globalThis.fetch;
const fetched = [];
globalThis.fetch = async (u) => { fetched.push(u); return { ok: true, json: async () => go2 }; };
F.streamList(hass2, c);
await new Promise((r) => setTimeout(r, 10));
globalThis.fetch = realFetch;
assert.equal(signed[0].type, 'auth/sign_path');
assert.equal(fetched[0], 'http://ha.local:8123/api/frigate/frigate/go2rtc/api/streams?authSig=x');
assert.deepEqual(F.streamList(hass2, c), ['gartentor_sub', 'gartentor-hd', 'Gartentor_low']);

// 7) Popup live card: own card with stream switch when the camera streams or has extra streams; only the
// popup's fields go along; without both the old picture card (null).
answer = { ok: true, json: async () => go2 };
F._streamsReset();
F.streamList(hass, c);
await new Promise((r) => setTimeout(r, 10));
assert.deepEqual(F.liveCard(hass, 'camera.gartentor', { stream_popup: 'gartentor-hd', stream_tile: 'gartentor_sub', live_tile: true }),
  { type: 'custom:casora-frigate-live', entity: 'camera.gartentor', vars: { stream_popup: 'gartentor-hd' } });
assert.equal(F.liveCard(hass, 'camera.einfahrt', {}).type, 'custom:casora-frigate-live', 'no HA stream, but a sub stream');
assert.equal(F.liveCard(hass, 'camera.carport', {}), null, 'neither: picture card as before');
assert.deepEqual(F.liveCard(hass, 'camera.gartentor', null, 'gartentor_sub', true),
  { type: 'custom:casora-frigate-live', entity: 'camera.gartentor', vars: {}, src: 'gartentor_sub', big: true }, 'big view keeps the stream');
assert.equal(F.liveCard(hass, 'camera.weg', {}), null);

// 8) Player ways: MSE over the integration's websocket proxy (old and new path), WebRTC as the last way.
assert.deepEqual(F.streamWays({}, true).map((w) => w.join(':')), ['mse:mse/api/ws', 'mse:go2rtc/ws/api/ws', 'webrtc:webrtc/api/ws']);
assert.deepEqual(F.streamWays(null, true).map((w) => w[0]), ['webrtc'], 'iPhone without MSE');
assert.deepEqual(F.streamWays(null, false), []);
assert.equal(F.wsUrl({ hassUrl: (p) => 'https://ha.example' + p }, '/api/frigate/frigate/mse/api/ws?src=a&authSig=x'), 'wss://ha.example/api/frigate/frigate/mse/api/ws?src=a&authSig=x');
assert.equal(F.mseCodecs({ isTypeSupported: (t) => /avc1\.640029|opus/.test(t) }), 'avc1.640029,opus');
assert.equal(F.mseCodecs(null), '');

// 9) Studio: the four fields of the Frigate card, choices from the camera's streams.
const tsrc = read('custom_components/casora/panel/casora-panel-types.js');
const w = { _casoraFrigate: F, casoraI18n: { t: (s) => ({ 'Sub stream': 'Unterstream', Automatic: 'Automatisch' }[s] || s) } };
new Function('window', tsrc.slice(0, tsrc.indexOf('\n];\n', tsrc.indexOf('window.CASORA_TILE_TYPES = [')) + 4))(w);
const frig = w.CASORA_TILE_TYPES.find((t) => t.id === 'casora_frigate');
const fld = Object.fromEntries(frig.fields.map((f) => [f.key, f]));
['stream_tile', 'stream_tile_phone', 'stream_popup', 'stream_popup_phone'].forEach((k) => {
  assert.equal(fld[k] && fld[k].type, 'select', k);
  assert.equal(typeof fld[k].dynOptions, 'function', k);
});
assert.equal(fld.stream_tile.when({}), false, 'tile stream only with live on the tile');
assert.equal(fld.stream_tile.when({ live_tile: true }), true);
assert.equal(fld.stream_popup.when, undefined, 'popup stream always');
const dDesk = fld.stream_popup.dynOptions(hass, 'camera.gartentor', () => {});
assert.deepEqual(dDesk.options, ['', 'gartentor_sub', 'gartentor-hd', 'Gartentor_low'], 'desktop: Standard = default');
// Two sub streams (gartentor_sub, Gartentor_low): names instead of the kind word.
assert.equal(dDesk.labels.gartentor_sub, 'gartentor_sub');
assert.equal(dDesk.labels['gartentor-hd'], 'Main stream · gartentor-hd');
const dPh = fld.stream_popup_phone.dynOptions(hass, 'camera.einfahrt', () => {});
assert.deepEqual(dPh.options, ['', 'standard', 'einfahrt_sub'], 'phone: Automatic, Standard, streams');
assert.equal(dPh.labels[''], 'Automatisch · Unterstream · einfahrt_sub');
assert.equal(dPh.labels.einfahrt_sub, 'Unterstream · einfahrt_sub');
const dNone = fld.stream_popup_phone.dynOptions(hass, 'camera.carport', () => {});
assert.deepEqual(dNone.options, ['', 'standard'], 'no extra streams');
assert.equal(dNone.labels[''], 'Same as desktop');
assert.equal(fld.stream_popup.dynOptions(hass, 'camera.unbekannt', () => {}), null, 'not a Frigate camera: fixed options');

console.log('frigate_streams: ok');
