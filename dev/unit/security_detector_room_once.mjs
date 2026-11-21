// @deckt: custom_components/casora/scripts/local/49-security-detectors.js#D.names,noRoom,D.sec
// Issue #225: in the Security popup's detector lists (smoke, water, gas/CO, motion) every row named its room twice:
// in the title („Flur Rauchmelder“) and in the subtitle („Flur“). Whatever the naming: devices „Rauchmelder Flur“
// kept the room after the shared word was cut, and plain „Rauchmelder“ got it back from the twin rule (#116).
// Expected: a row that shows its room as subtitle does not repeat it in the title („Rauchmelder“ / „Flur“), without
// leaving a title empty or two detectors of one room alike.
//   node dev/unit/security_detector_room_once.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
let HASS = null;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' && HASS ? { hass: HASS } : null), addEventListener: () => {} };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
new Function(read('custom_components/casora/scripts/local/49-security-detectors.js'))();
// The real name helpers of the core (casoraDropCommonPrefix, roomForTwins, dropRowPrefix, popupNames); UI.group
// cuts its list as the real one does and hands back the rows it would draw.
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  window.casoraDropCommonPrefix = function');
const b = core.indexOf('  function group(rows, label', a);
assert.ok(a > 0 && b > a, 'helpers found');
const H = new Function('window', 'document', core.slice(a, b) + '\nreturn { dropRowPrefix, popupNames };')(window, document);
let drawn = [];
window._casoraUI = { popupNames: H.popupNames, group: (rows, label) => { drawn.push(...H.dropRowPrefix(rows || [])); return label || ''; } };
window.casoraAgo = () => '';
const D = window._casoraSecDet;

const AREAS = { flur: 'Flur', kind: 'Kinderzimmer', schlaf: 'Schlafzimmer', hwr: 'Hauswirtschaftsraum', og: 'Flur OG' };
// list: [id suffix, friendly name, area key or null] → { id: [title, subtitle] } as the popup's list shows them.
const shown = (list, kind) => {
  const dc = kind === 'motion' ? 'motion' : kind === 'water' ? 'moisture' : 'smoke';
  const S = {}, entities = {};
  list.forEach(([k, name, area]) => {
    S['binary_sensor.' + k] = { state: 'off', attributes: { device_class: dc, friendly_name: name } };
    entities['binary_sensor.' + k] = { area_id: area || null };
  });
  HASS = { states: S, entities, devices: {}, areas: Object.fromEntries(Object.entries(AREAS).map(([k, n]) => [k, { name: n }])) };
  window.CASORA_SETTINGS = { security: { motion: true } };
  drawn = [];
  D.sec('list', { kind: kind || 'smoke', place: 'home' }, S, HASS, null);
  assert.equal(drawn.length, list.length, 'every detector has its row');
  return Object.fromEntries(drawn.map((r) => [r.entity.split('.')[1], [r.label, r.sub || '']]));
};

// ── The report: devices „Rauchmelder <room>“, entity name „Rauchmelder“, four areas ──
let r = shown([['a', 'Rauchmelder Flur Rauchmelder', 'flur'], ['b', 'Rauchmelder Kinderzimmer Rauchmelder', 'kind'],
  ['c', 'Rauchmelder Schlafzimmer Rauchmelder', 'schlaf'], ['d', 'Rauchmelder Hauswirtschaftsraum Rauchmelder', 'hwr']]);
assert.deepEqual(r, { a: ['Rauchmelder', 'Flur'], b: ['Rauchmelder', 'Kinderzimmer'], c: ['Rauchmelder', 'Schlafzimmer'],
  d: ['Rauchmelder', 'Hauswirtschaftsraum'] }, 'room only in the subtitle');

// ── All just „Rauchmelder“: the twin rule (#116) must not put the room in front ──
r = shown([['a', 'Rauchmelder', 'flur'], ['b', 'Rauchmelder', 'kind'], ['c', 'Rauchmelder', 'schlaf'], ['d', 'Rauchmelder', 'hwr']]);
assert.deepEqual(Object.values(r).map((x) => x[0]), ['Rauchmelder', 'Rauchmelder', 'Rauchmelder', 'Rauchmelder'], 'twins: no room in front');
assert.deepEqual(Object.values(r).map((x) => x[1]), ['Flur', 'Kinderzimmer', 'Schlafzimmer', 'Hauswirtschaftsraum']);

// ── The room at the end, with a separator, in brackets, in another case, of two words ──
r = shown([['a', 'Rauchmelder Flur', 'flur'], ['b', 'Rauchmelder - Kinderzimmer', 'kind'], ['c', 'Rauchmelder (SCHLAFZIMMER)', 'schlaf'],
  ['d', 'Hauswirtschaftsraum: Rauchmelder', 'hwr'], ['e', 'Rauchmelder flur og', 'og']]);
assert.deepEqual(Object.fromEntries(Object.entries(r).map(([k, x]) => [k, x[0]])),
  { a: 'Rauchmelder', b: 'Rauchmelder', c: 'Rauchmelder', d: 'Rauchmelder', e: 'Rauchmelder' }, 'room at either end, with separators');
// Only whole words: „Flurlicht“ and „Hausflur“ do not hold the room „Flur“.
r = shown([['a', 'Flurlicht Melder', 'flur'], ['b', 'Melder Hausflur', 'flur']]);
assert.deepEqual([r.a[0], r.b[0]], ['Flurlicht Melder', 'Melder Hausflur'], 'no cut inside a word');

// ── Two detectors of one room keep what tells them apart ──
r = shown([['a', 'Rauchmelder Flur Decke', 'flur'], ['b', 'Rauchmelder Flur Treppe', 'flur'], ['c', 'Rauchmelder Kinderzimmer', 'kind']]);
assert.deepEqual(r, { a: ['Decke', 'Flur'], b: ['Treppe', 'Flur'], c: ['Rauchmelder', 'Kinderzimmer'] }, 'same room: the differing part stays');
// Numbers alone tell nothing: the names stay whole.
r = shown([['a', 'Rauchmelder Flur 1', 'flur'], ['b', 'Rauchmelder Flur 2', 'flur']]);
assert.deepEqual([r.a[0], r.b[0]], ['Rauchmelder Flur 1', 'Rauchmelder Flur 2'], 'never a bare number');
// Two of one room that would read alike without the room keep their names.
r = shown([['a', 'Flur Rauchmelder', 'flur'], ['b', 'Rauchmelder Flur', 'flur'], ['c', 'Rauchmelder', 'kind']]);
assert.notEqual(r.a[0], r.b[0], 'never two alike in one room');
assert.equal(r.c[0], 'Rauchmelder');
// A name that is only the room stays (never empty).
r = shown([['a', 'Flur', 'flur'], ['b', 'Rauchmelder Kinderzimmer', 'kind']]);
assert.deepEqual([r.a, r.b], [['Flur', 'Flur'], ['Rauchmelder', 'Kinderzimmer']], 'never an empty title');

// ── A detector without an area has no subtitle: its title keeps what identifies it ──
r = shown([['a', 'Rauchmelder Flur', 'flur'], ['b', 'Rauchmelder Kinderzimmer', 'kind'], ['c', 'Rauchmelder Garage', null]]);
assert.deepEqual(r, { a: ['Rauchmelder', 'Flur'], b: ['Rauchmelder', 'Kinderzimmer'], c: ['Garage', ''] }, 'no area: the name\'s own place stays');
r = shown([['a', 'Flur Melder', 'flur'], ['b', 'Flur Melder', null]]);
assert.deepEqual(r, { a: ['Melder', 'Flur'], b: ['Flur Melder', ''] }, 'no area: nothing is cut from its name');

// ── The same rule in the water and the motion list ──
r = shown([['a', 'Wassermelder Flur', 'flur'], ['b', 'Wassermelder', 'hwr']], 'water');
assert.deepEqual(r, { a: ['Wassermelder', 'Flur'], b: ['Wassermelder', 'Hauswirtschaftsraum'] }, 'water');
r = shown([['a', 'Flur Bewegungsmelder', 'flur'], ['b', 'Bewegungsmelder', 'kind'], ['c', 'Bewegungsmelder', 'schlaf']], 'motion');
assert.deepEqual(r, { a: ['Bewegungsmelder', 'Flur'], b: ['Bewegungsmelder', 'Kinderzimmer'], c: ['Bewegungsmelder', 'Schlafzimmer'] }, 'motion');
console.log('ok security_detector_room_once');
