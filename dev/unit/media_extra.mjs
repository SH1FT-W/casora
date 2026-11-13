// @deckt: custom_components/casora/scripts/local/47-media-extra.js#_casoraMediaGroup,_casoraCamTimeline,_casoraMediaExtra
// Media popup grouping and the camera timeline (47-media-extra.js): which speakers can play together and how a row
// joins/unjoins, that a player without grouping keeps its popup, which sensors feed a camera's timeline and how the
// history answer becomes today's events. Also checks the test house (dev/casora_mock/medien.py).
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
const G = win._casoraMediaGroup, C = win._casoraCamTimeline, X = win._casoraMediaExtra;
assert.ok(G && C && X, 'module loads without a document');
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'47-media-extra'"), 'module in MODULES');

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

// A player without grouping (a TV) gets no extra card: the popup stays as before.
const tvh = { states: { 'media_player.tv': { entity_id: 'media_player.tv', state: 'playing', attributes: { supported_features: 1 | 4 | 16384, device_class: 'tv' } },
  'remote.tv': { entity_id: 'remote.tv', state: 'on', attributes: {} } },
  entities: { 'media_player.tv': { platform: 'androidtv_remote', device_id: 'd1' }, 'remote.tv': { platform: 'androidtv_remote', device_id: 'd1' } },
  devices: { d1: {} }, areas: {} };
assert.equal(X.has(tvh, 'media_player.tv'), false);
assert.equal(X.sec({ entity_id: 'media_player.tv' }, tvh), '');
deq(X.ids(tvh, 'media_player.tv'), ['media_player.tv']);
assert.equal(win._casoraMediaRemote, undefined, 'no TV remote (maintainer, 13.11.2026)');

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
deq(C.sources(ch, 'camera.flur'), [], 'no sensor on the device: no timeline, never the room\'s sensors (maintainer, 13.11.2026)');
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
assert.equal(X.has(mh, 'media_player.testfernseher'), false, 'test TV: no grouping, no extra card');
const sl = G.list(mh, 'media_player.testlautsprecher_wohnzimmer');
assert.ok(sl.length >= 3 && sl[0].id === 'media_player.testlautsprecher_kueche' && sl[0].on, 'test speakers group');
deq(C.sources(mh, 'camera.testgarten').map((x) => x.kind).sort(), ['motion', 'person', 'ring']);

console.log('media_extra: ok');
