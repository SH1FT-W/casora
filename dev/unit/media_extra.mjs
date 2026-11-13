// @deckt: custom_components/casora/scripts/local/47-media-extra.js#_casoraMediaRemote,_casoraMediaGroup,_casoraCamTimeline,_casoraMediaExtra
// Media popup extras and the camera timeline (47-media-extra.js): which players get a remote and with which command
// names, which speakers can play together and how a row joins/unjoins, which sensors feed a camera's timeline and how
// the history answer becomes today's events. Also checks the test house (dev/casora_mock/medien.py) shows all three.
//   node dev/unit/media_extra.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

// Arrays from the vm context are of another realm: compare as JSON.
const J = (x) => JSON.parse(JSON.stringify(x));
const deq = (a, b, m) => assert.deepEqual(J(a), J(b), m);
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = {};
const box = { window: win, console, Date, Math, JSON, String, Number, Array, Object, isFinite, encodeURIComponent };
vm.createContext(box);
vm.runInContext(read('custom_components/casora/scripts/local/47-media-extra.js'), box);
const R = win._casoraMediaRemote, G = win._casoraMediaGroup, C = win._casoraCamTimeline, X = win._casoraMediaExtra;
assert.ok(R && G && C && X, 'module loads without a document');
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'47-media-extra'"), 'module in MODULES');

// ── Platform table ─────────────────────────────────────────────────────────────────────────────────────
const KEYS = ['up', 'down', 'left', 'right', 'ok', 'back', 'home', 'play', 'volUp', 'volDown'];
for (const [p, k] of Object.entries(R.KEYS)) {
  for (const key of KEYS) assert.ok(key in k, p + ' names ' + key);
  for (const key of ['up', 'down', 'left', 'right', 'ok', 'back', 'home']) assert.ok(k[key], p + ' has a command for ' + key);
}
assert.equal(R.KEYS.apple_tv.ok, 'select');
assert.equal(R.KEYS.apple_tv.back, 'menu');
assert.equal(R.KEYS.androidtv_remote.up, 'DPAD_UP');
assert.equal(R.KEYS.androidtv_remote.ok, 'DPAD_CENTER');
assert.equal(R.KEYS.samsungtv.ok, 'KEY_ENTER');
assert.equal(R.KEYS.webostv.ok, 'ENTER');
assert.equal(R.KEYS.webostv.player, true, 'webOS steers through the player');

const house = (extra = {}) => ({
  states: {
    'media_player.tv': { entity_id: 'media_player.tv', state: 'playing', attributes: { supported_features: 1 | 4 | 1024 | 16384 } },
    'remote.tv': { entity_id: 'remote.tv', state: 'on', attributes: {} },
    'media_player.box': { entity_id: 'media_player.box', state: 'idle', attributes: { supported_features: 0 } },
    'remote.box_fernbedienung': { entity_id: 'remote.box_fernbedienung', state: 'on', attributes: {} },
    'media_player.pod': { entity_id: 'media_player.pod', state: 'idle', attributes: {} },
    'remote.pod': { entity_id: 'remote.pod', state: 'on', attributes: {} },
    'media_player.lg': { entity_id: 'media_player.lg', state: 'on', attributes: {} },
    'media_player.odd': { entity_id: 'media_player.odd', state: 'on', attributes: {} },
    'remote.odd': { entity_id: 'remote.odd', state: 'on', attributes: {} },
    ...(extra.states || {}),
  },
  entities: {
    'media_player.tv': { platform: 'androidtv_remote', device_id: 'd1' },
    'remote.tv': { platform: 'androidtv_remote', device_id: 'd1' },
    'media_player.box': { platform: 'apple_tv', device_id: 'd2' },
    // Different object id, same device: structured data wins over the name.
    'remote.box_fernbedienung': { platform: 'apple_tv', device_id: 'd2' },
    'media_player.pod': { platform: 'apple_tv', device_id: 'd3' },
    'remote.pod': { platform: 'apple_tv', device_id: 'd3' },
    'media_player.lg': { platform: 'webostv', device_id: 'd4' },
    'media_player.odd': { platform: 'vizio', device_id: 'd5' },
    'remote.odd': { platform: 'vizio', device_id: 'd5' },
    ...(extra.entities || {}),
  },
  devices: { d1: { model: 'Chromecast' }, d2: { model: 'Apple TV 4K' }, d3: { model: 'HomePod mini' }, d4: {}, d5: {} },
  areas: {},
});
let h = house();
let sp = R.find(h, 'media_player.tv');
assert.equal(sp.remote, 'remote.tv');
assert.equal(sp.platform, 'androidtv_remote');
assert.equal(R.find(h, 'media_player.box').remote, 'remote.box_fernbedienung', 'remote on the same device');
assert.equal(R.find(h, 'media_player.pod'), null, 'speaker with a remote entity (HomePod) has nothing to navigate');
assert.equal(R.find(h, 'media_player.odd'), null, 'unknown platform: no remote');
assert.equal(R.find(h, 'media_player.lg').via, 'player', 'webOS: the player navigates itself');
assert.equal(R.find(h, 'light.x'), null);
assert.equal(R.find(null, 'media_player.tv'), null);
// Without a device: a remote with the player's object id (fallback by name).
h = house({ entities: { 'media_player.tv': { platform: 'androidtv_remote' }, 'remote.tv': { platform: 'androidtv_remote' } } });
assert.equal(R.find(h, 'media_player.tv').remote, 'remote.tv');

// Services: navigation over remote.send_command, play and volume through the player when it can.
h = house();
sp = R.find(h, 'media_player.tv');
const st = h.states['media_player.tv'];
deq(((R.svc(sp, 'up', st))),
  { domain: 'remote', service: 'send_command', data: { command: 'DPAD_UP' }, target: { entity_id: 'remote.tv' } });
deq(((R.svc(sp, 'play', st))),
  { domain: 'media_player', service: 'media_play_pause', target: { entity_id: 'media_player.tv' } });
assert.equal(R.svc(sp, 'volUp', st).service, 'volume_up');
const box2 = R.find(h, 'media_player.box');
assert.equal(R.svc(box2, 'play', h.states['media_player.box']).data.command, 'play_pause', 'player without PLAY/PAUSE: remote key');
assert.equal(R.svc(box2, 'volDown', h.states['media_player.box']).data.command, 'volume_down');
const lg = R.find(h, 'media_player.lg');
deq(((R.svc(lg, 'back', h.states['media_player.lg']))),
  { domain: 'webostv', service: 'button', data: { button: 'BACK' }, target: { entity_id: 'media_player.lg' } });
const adb = { platform: 'androidtv', remote: 'remote.a', player: 'media_player.a', keys: R.KEYS.androidtv, via: 'remote' };
assert.equal(R.svc(adb, 'play', { attributes: {} }), null, 'no play key and no player play: no button');

// ── Grouping ───────────────────────────────────────────────────────────────────────────────────────────
assert.equal(G.FLAG, 524288);
assert.equal(G.can({ attributes: { supported_features: 524288 | 1 } }), true);
assert.equal(G.can({ attributes: { supported_features: 1 } }), false);
assert.equal(G.can({ attributes: { group_members: ['media_player.a'] } }), true, 'group_members alone counts');
assert.equal(G.can(null), false);
const gs = (id, extra) => ({ entity_id: id, state: 'idle', attributes: { supported_features: 524288, friendly_name: id.split('.')[1], ...extra } });
const gh = {
  states: {
    'media_player.wz': gs('media_player.wz', { group_members: ['media_player.wz', 'media_player.kue'] }),
    'media_player.kue': gs('media_player.kue', { group_members: ['media_player.wz', 'media_player.kue'] }),
    'media_player.bad': gs('media_player.bad'),
    'media_player.weg': { ...gs('media_player.weg'), state: 'unavailable' },
    'media_player.fremd': gs('media_player.fremd'),
    'media_player.versteckt': gs('media_player.versteckt'),
    'media_player.tv': { entity_id: 'media_player.tv', state: 'on', attributes: { supported_features: 1 } },
  },
  entities: {
    'media_player.wz': { platform: 'sonos', area_id: 'a1' }, 'media_player.kue': { platform: 'sonos', area_id: 'a2' },
    'media_player.bad': { platform: 'sonos' }, 'media_player.weg': { platform: 'sonos' },
    'media_player.fremd': { platform: 'linkplay' }, 'media_player.versteckt': { platform: 'sonos', hidden: true },
    'media_player.tv': { platform: 'sonos' },
  },
  devices: {}, areas: { a1: { name: 'Wohnzimmer' }, a2: { name: 'Küche' } },
};
const gl = G.list(gh, 'media_player.wz');
deq(gl.map((r) => r.id), ['media_player.kue', 'media_player.bad'],
  'joined first; same integration only, no unavailable, hidden or non-grouping player');
assert.equal(gl[0].on, true);
assert.equal(gl[0].area, 'Küche');
deq(G.list(gh, 'media_player.tv'), [], 'a player that cannot group gets no list');
deq(((G.rowSvc('media_player.wz', gl[0]))),
  { domain: 'media_player', service: 'unjoin', target: { entity_id: 'media_player.kue' } });
deq(((G.rowSvc('media_player.wz', gl[1]))),
  { domain: 'media_player', service: 'join', data: { group_members: ['media_player.bad'] }, target: { entity_id: 'media_player.wz' } });
deq(X.ids(gh, 'media_player.wz'), ['media_player.wz', 'media_player.kue', 'media_player.bad']);

// Rows of the section (needs UI.group): selected = highlighted, symbol in device colour, no tick or arrow.
let rows = null, head = null;
win._casoraUI = { group: (r, l) => { rows = r; head = l; return 'G'; }, label: (t) => t };
assert.equal(G.html(gh, 'media_player.wz'), 'G');
assert.equal(head, 'Zusammen abspielen · 2 Lautsprecher');
assert.equal(rows[0].selected, true);
assert.equal(rows[0].iconTone, 'accent');
assert.equal(rows[1].selected, false);
assert.equal(rows[1].iconTone, 'rgba(0,0,0,0)');
assert.ok(rows.every((r) => r.noChev && r.svc));

// Remote section: every key carries its service, the ring has four directions and OK.
const html = R.html(R.find(house(), 'media_player.tv'), house());
assert.equal((html.match(/class="crc-sec"/g) || []).length, 4);
assert.ok(html.includes('class="crc-ok"'));
assert.ok(html.includes('DPAD_CENTER') && html.includes('BACK') && html.includes('HOME'));
assert.ok(/aria-label="Zurück"/.test(html) && /aria-label="Lauter"/.test(html));
assert.ok(!/class="crc dis"/.test(html), 'remote on: usable');
const hOff = house({ states: { 'remote.tv': { entity_id: 'remote.tv', state: 'unavailable', attributes: {} } } });
assert.ok(/class="crc dis"/.test(R.html(R.find(hOff, 'media_player.tv'), hOff)), 'remote unavailable: greyed out');

// ── Camera timeline ────────────────────────────────────────────────────────────────────────────────────
const ch = {
  states: {
    'camera.garten': { state: 'idle', attributes: {} },
    'binary_sensor.garten_bewegung': { state: 'off', attributes: { device_class: 'motion' } },
    'binary_sensor.garten_person': { state: 'off', attributes: { device_class: 'occupancy' } },
    'binary_sensor.garten_tuer': { state: 'off', attributes: { device_class: 'door' } },
    'event.garten_klingel': { state: '2026-11-13T09:00:00Z', attributes: { device_class: 'doorbell' } },
    'event.garten_taste': { state: 'unknown', attributes: { device_class: 'button' } },
    'camera.flur': { state: 'idle', attributes: {} },
    'binary_sensor.flur_praesenz': { state: 'off', attributes: { device_class: 'presence' } },
    'binary_sensor.kueche_bewegung': { state: 'off', attributes: { device_class: 'motion' } },
    'camera.allein': { state: 'idle', attributes: {} },
  },
  entities: {
    'camera.garten': { device_id: 'g', platform: 'reolink' },
    'binary_sensor.garten_bewegung': { device_id: 'g' },
    'binary_sensor.garten_person': { device_id: 'g', translation_key: 'person' },
    'binary_sensor.garten_tuer': { device_id: 'g' },
    'event.garten_klingel': { device_id: 'g' },
    'event.garten_taste': { device_id: 'g' },
    'camera.flur': { device_id: 'f' },
    'binary_sensor.flur_praesenz': { device_id: 'm', area_id: 'flur' },
    'binary_sensor.kueche_bewegung': { device_id: 'k', area_id: 'kueche' },
    'camera.allein': {},
  },
  devices: { f: { area_id: 'flur' }, g: {}, m: {}, k: {} },
  config: { components: ['reolink', 'media_source'] },
};
const src = C.sources(ch, 'camera.garten');
deq(((src)).sort((a, b) => a.id.localeCompare(b.id)), [
  { id: 'binary_sensor.garten_bewegung', kind: 'motion' },
  { id: 'binary_sensor.garten_person', kind: 'person' },
  { id: 'event.garten_klingel', kind: 'ring' },
], 'same device: motion, person (translation_key), doorbell event; no door contact, no button event');
deq(C.sources(ch, 'camera.flur').map((s) => s.id), ['binary_sensor.flur_praesenz'], 'no sensor on the device: same area');
deq(C.sources(ch, 'camera.allein'), [], 'neither device nor area: no timeline');

const start = Date.parse('2026-11-12T23:00:00Z');   // local midnight in Berlin
const s = (x) => Date.parse(x) / 1000;
const raw = {
  'binary_sensor.garten_bewegung': [
    { s: 'on', lu: s('2026-11-12T23:00:00Z') },        // state at the start of the period, not an event
    { s: 'off', lu: s('2026-11-12T23:05:00Z') },
    { s: 'on', lu: s('2026-11-13T06:00:00Z') },
    { s: 'off', lu: s('2026-11-13T06:01:00Z') },
    { s: 'on', lu: s('2026-11-13T06:00:30Z') },         // within a minute of the one before: once
    { s: 'on', lu: s('2026-11-13T08:59:40Z') },         // motion around the ring: the ring stands for it
    { s: 'off', lu: s('2026-11-13T09:01:00Z') },
    { s: 'on', lu: s('2026-11-13T09:30:00Z'), lc: s('2026-11-13T09:30:00Z') },
  ],
  'binary_sensor.garten_person': [
    { s: 'off', lu: s('2026-11-12T23:00:00Z') },
    { s: 'on', lu: s('2026-11-13T09:30:20Z') },         // person beats the motion at the same moment
  ],
  'event.garten_klingel': [
    { s: '2026-11-12T20:00:00Z', lu: s('2026-11-12T23:00:00Z') },   // yesterday's ring at the start: no event
    { s: '2026-11-13T09:00:00Z', lu: s('2026-11-13T09:00:00.2Z') },
  ],
};
const ev = C.parse(raw, src, start);
deq(ev.map((e) => e.kind + '@' + new Date(e.at).toISOString().slice(11, 16)),
  ['person@09:30', 'ring@09:00', 'motion@06:00'], 'newest first, merged by moment');
assert.equal(ev[1].at, Date.parse('2026-11-13T09:00:00Z'), 'ring at the event timestamp');
deq(C.parse({}, src, start), []);
deq(C.parse(null, src, start), []);
assert.equal(C.head(1), 'Heute · 1 Ereignis');
assert.equal(C.head(7), 'Heute · 7 Ereignisse');
assert.equal(C.word('ring'), 'Hat geklingelt');
assert.equal(C.word('person'), 'Person erkannt');
assert.equal(C.word('motion'), 'Bewegung');
assert.equal(C.ago(Date.now() - 20 * 60000), 'vor 20 Min.');

// Recordings: only when the camera's integration has a media source and HA loaded it.
assert.equal(C.media(ch, 'camera.garten'), '/media-browser/browser/' + encodeURIComponent('app,media-source://reolink'));
assert.equal(C.media({ ...ch, config: { components: ['reolink'] } }, 'camera.garten'), null, 'no media_source: time only');
assert.equal(C.media(ch, 'camera.flur'), null, 'platform without recordings: time only');
assert.equal(C.nearest([{ x: 10 }, { x: 50 }, { x: 90 }], 60).x, 50);

// Render: marks at their time of day, readout = newest event, link marker only with recordings.
const now = Date.parse('2026-11-13T11:00:00Z');
const out = C.render({ list: ev }, 'camera.garten', ch, now);
assert.equal((out.match(/class="ctl-m /g) || []).length, 3);
assert.ok(out.includes('Person erkannt') && out.includes('Aufnahmen'));
assert.ok(!C.render({ list: ev }, 'camera.flur', ch, now).includes('Aufnahmen'));
assert.ok(C.render({ list: null }, 'camera.garten', ch, now).includes('aria-busy'), 'loading: plate at full height');

// ── Test house: the media popup and the camera popup have something to show ────────────────────────────
const snap = JSON.parse(execFileSync('python3', [new URL('../casora_mock/haus.py', import.meta.url).pathname, '--public'], { encoding: 'utf8' }));
const ent = Object.fromEntries(Object.entries(snap.entities).map(([id, e]) => [id, { ...e, device_id: e.device_id, area_id: e.area_id }]));
const mh = { states: snap.states, entities: ent, devices: snap.devices, areas: snap.areas, config: { components: [] } };
const tv = R.find(mh, 'media_player.testfernseher');
assert.equal(tv && tv.remote, 'remote.testfernseher', 'test TV has its remote');
assert.equal(tv.platform, 'androidtv_remote');
const sl = G.list(mh, 'media_player.testlautsprecher_wohnzimmer');
assert.ok(sl.length >= 3 && sl[0].id === 'media_player.testlautsprecher_kueche' && sl[0].on, 'test speakers group');
deq(C.sources(mh, 'camera.testgarten').map((x) => x.kind).sort(), ['motion', 'person', 'ring']);

console.log('media_extra: ok');
