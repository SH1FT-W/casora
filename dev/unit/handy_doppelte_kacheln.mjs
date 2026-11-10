// GitHub issue 158: a Universal tile without a device did not reach the phone when the room already had one. The pair
// sync matched tiles by kind + device only, so two tiles with the same key (two Universal tiles without a device, two
// tiles of one kind on one device) counted as one: the second was never copied, and it came and went with its device.
// Now each phone tile takes a room tile of its own (assignTwins): the one that reads the same first, the rest in order;
// a copy too many on the phone follows its twin out, and Casora's copy of one of several is the room tile, whole.
// @deckt: custom_components/casora/panel/casora-panel.js#syncPairTiles,assignTwins,tileTwinSig,rebuildTwinCopy
//   node dev/unit/handy_doppelte_kacheln.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/panel/', import.meta.url);
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const noop = () => {};
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = { addEventListener: noop, location: { pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => null, define: noop, whenDefined: () => new Promise(() => {}) };
globalThis.document = stub();
globalThis.localStorage = { getItem: () => null, setItem: noop };
const log = console.info;
console.info = noop;
new Function(fix(fs.readFileSync(new URL('casora-panel-types.js', dir), 'utf8')))();
new Function(fix(fs.readFileSync(new URL('casora-panel.js', dir), 'utf8')))();
console.info = log;
const I = window.__casoraPanelInternals;
assert.ok(I && I.syncPairTiles, 'Bausteine fehlen');

const tile = (template, entity, name, vars) => ({ type: 'custom:button-card', template, entity, name, ...(vars ? { variables: vars } : {}) });
const free = (entity, name, vars) => tile('casora_free', entity, name, { size: 'auto', ...(vars || {}) });
const pairOf = (desk, phone) => ({
  desktop: { compact: { rooms: [{ name: 'Home', path: 'home', tiles: desk }] } },
  mobile: { compact: { rooms: [{ name: 'Favorites', tiles: phone }] } },
  link: { links: [{ room: 0, section: 0, overview: true }] },
});
const phone = (p) => p.mobile.compact.rooms[0].tiles;
const names = (p) => phone(p).map((t) => t.name);

// The report: a second Universal tile without a device.
{
  const a = free('', 'Alt'), b = free('', 'Neu');
  const p = pairOf([a, b], []);
  let r = I.syncPairTiles(p);
  assert.deepEqual(names(p), ['Alt', 'Neu'], 'both tiles without a device reach the phone');
  assert.equal(r.added, 2);
  r = I.syncPairTiles(p);
  assert.deepEqual(names(p), ['Alt', 'Neu'], 'saving again adds nothing');
  assert.equal(r.added, 0); assert.equal(r.dropped, 0); assert.equal(r.synced, 2);
  // It no longer comes and goes with its device.
  b.entity = 'person.qa_probe';
  I.syncPairTiles(p);
  assert.deepEqual(phone(p).map((t) => [t.name, t.entity]), [['Alt', ''], ['Neu', 'person.qa_probe']], 'with a device: one each, no copy left behind');
  b.entity = '';
  I.syncPairTiles(p);
  assert.deepEqual(names(p), ['Alt', 'Neu'], 'device removed again: still on the phone');
}

// One tile on the phone already (a dashboard saved before the fix): the second follows, each with its own content.
{
  const a = free('', 'Alt', { free_values: ['sensor.qa_a'] }), b = free('', 'Neu', { free_values: ['sensor.qa_b'] });
  const p = pairOf([a, b], [free('', 'Alt', { free_values: ['sensor.qa_a'], casora_from_room: true, mobile_filter_category: 'other' })]);
  const r = I.syncPairTiles(p);
  assert.equal(r.added, 1);
  assert.deepEqual(phone(p).map((t) => t.variables.free_values[0]), ['sensor.qa_a', 'sensor.qa_b']);
  assert.equal(phone(p)[0].variables.mobile_filter_category, 'other', 'the phone\'s own value of the first stays');
  assert.equal(phone(p)[1].variables.casora_from_room, true, 'the new one is marked as Casora\'s copy');
}

// Two tiles of one kind on one device.
{
  const p = pairOf([tile('casora_light', 'light.qa_lampe', 'L1'), tile('casora_light', 'light.qa_lampe', 'L2')], []);
  I.syncPairTiles(p);
  assert.deepEqual(names(p), ['L1', 'L2']);
  // One of the two deleted in the room: Casora's copy goes with it, the other keeps the remaining tile's content.
  p.desktop.compact.rooms[0].tiles.splice(0, 1);
  const r = I.syncPairTiles(p);
  assert.deepEqual(names(p), ['L2'], 'the copy too many is removed');
  assert.equal(r.dropped, 1);
}

// More on the phone than in the room without Casora's marker (placed by hand, or from before the marker): they stay.
{
  const p = pairOf([tile('casora_light', 'light.qa_lampe', 'L1')],
    [tile('casora_light', 'light.qa_lampe', 'L1'), tile('casora_light', 'light.qa_lampe', 'Von Hand')]);
  const r = I.syncPairTiles(p);
  assert.equal(phone(p).length, 2, 'unmarked tiles are not removed');
  assert.equal(r.dropped, 0); assert.equal(r.added, 0);
}

// A single tile behaves as before: copied once, kept in step, never doubled.
{
  const p = pairOf([free('', 'Einzeln'), tile('casora_light', 'light.qa_lampe', 'Licht')], []);
  I.syncPairTiles(p); I.syncPairTiles(p);
  assert.deepEqual(names(p), ['Einzeln', 'Licht']);
}

// A tile nobody finished (no device, and its kind needs one) still stays off the phone, however many there are.
{
  const p = pairOf([tile('casora_light', '', 'Leer 1'), tile('casora_light', '', 'Leer 2')], []);
  I.syncPairTiles(p);
  assert.deepEqual(names(p), []);
}

// ── Which copy belongs to which room tile (adversarial review, 10.11.2026): the one that reads the same, not the k-th ──
const cat = (p) => phone(p).map((t) => [t.name, (t.variables || {}).mobile_filter_category || null]);
const setCat = (p, i, c) => { phone(p)[i].variables = { ...(phone(p)[i].variables || {}), mobile_filter_category: c }; };

// The first of two equal-keyed tiles is deleted: its copy goes, the other keeps its own phone value.
{
  const p = pairOf([free('', 'Alt'), free('', 'Neu')], []);
  I.syncPairTiles(p);
  setCat(p, 0, 'security'); setCat(p, 1, 'lights');
  p.desktop.compact.rooms[0].tiles.splice(0, 1);
  const r = I.syncPairTiles(p);
  assert.deepEqual(cat(p), [['Neu', 'lights']], 'the deleted tile\'s copy is the one that goes');
  assert.equal(r.dropped, 1);
}
// The two change places in the room: the phone follows, each with its own phone value.
{
  const p = pairOf([free('', 'Alt'), free('', 'Neu')], []);
  I.syncPairTiles(p);
  setCat(p, 0, 'security'); setCat(p, 1, 'lights');
  p.desktop.compact.rooms[0].tiles.reverse();
  const r = I.syncPairTiles(p);
  assert.deepEqual(cat(p), [['Neu', 'lights'], ['Alt', 'security']]);
  assert.equal(r.added, 0); assert.equal(r.dropped, 0);
}
// Hosted cards without a title share a key too: deleting the first leaves the second, with its own card.
{
  const host = (text) => I.wrapCustomCard({ type: 'markdown', content: text });
  const p = pairOf([host('EINS'), host('ZWEI')], []);
  I.syncPairTiles(p);
  assert.equal(phone(p).length, 2, 'both hosted cards reach the phone');
  p.desktop.compact.rooms[0].tiles.splice(0, 1);
  I.syncPairTiles(p);
  assert.equal(phone(p).length, 1);
  assert.match(JSON.stringify(phone(p)[0]), /ZWEI/, 'the card still in the room is the one on the phone');
  assert.doesNotMatch(JSON.stringify(phone(p)[0]), /EINS/);
}
// An unmarked tile of Casora's shape next to Casora's copy of the same key, one room tile: the room tile shows once,
// the copy with its phone value stays (the unmarked one is the leftover of a deleted twin from before the marker).
{
  const p = pairOf([tile('casora_light', 'light.qa_lampe', 'Licht')],
    [tile('casora_light', 'light.qa_lampe', 'Alt'), tile('casora_light', 'light.qa_lampe', 'Licht', { casora_from_room: true, mobile_filter_category: 'lights' })]);
  I.syncPairTiles(p);
  assert.deepEqual(cat(p), [['Licht', 'lights']]);
  const again = JSON.stringify(phone(p));
  I.syncPairTiles(p);
  assert.equal(JSON.stringify(phone(p)), again, 'and it stays that way');
}
// A user's own card (not Casora's shape) placed by hand next to Casora's copy with the same key stays.
{
  const own = () => ({ type: 'custom:button-card', template: 'qa_eigene_vorlage', entity: 'light.qa_lampe', name: 'Eigene' });
  const p = pairOf([own()], [{ ...own(), name: 'Von Hand' }, { ...own(), variables: { casora_from_room: true } }]);
  const r = I.syncPairTiles(p);
  assert.equal(phone(p).length, 2);
  assert.equal(r.dropped, 0);
}
// A dashboard from before the marker (the phone tile carries none): the second tile comes across; deleting the first
// in the room leaves the room tile once on the phone, not twice.
{
  const p = pairOf([tile('casora_light', 'light.qa_lampe', 'L1'), tile('casora_light', 'light.qa_lampe', 'L2')],
    [tile('casora_light', 'light.qa_lampe', 'L1', { mobile_filter_category: 'mine' })]);
  I.syncPairTiles(p);
  assert.deepEqual(names(p), ['L1', 'L2']);
  p.desktop.compact.rooms[0].tiles.splice(0, 1);
  I.syncPairTiles(p);
  assert.deepEqual(names(p), ['L2'], 'once, not twice');
}
// Two tiles that read exactly the same (the Studio's "Duplicate"): each phone tile has a room tile of its own, and a
// second sync changes nothing, not even the order.
{
  const p = pairOf([free('', 'Gleich'), free('', 'Gleich')], [free('', 'Gleich')]);
  I.syncPairTiles(p);
  assert.equal(phone(p).length, 2);
  const once = JSON.stringify(phone(p));
  const r = I.syncPairTiles(p);
  assert.equal(JSON.stringify(phone(p)), once, 'idempotent');
  assert.equal(r.moved, 0);
  const d = p.desktop.compact.rooms[0].tiles;
  const a = I.assignTwins(d, [0, 1], phone(p)).at;
  assert.deepEqual(phone(p).map((t) => a.get(t)), [0, 1], 'the preview opens the second tile for the second copy');
}
// A hosted card changed in the room: Casora's copy of one of several is the room tile again, so the change arrives,
// and deleting the other one afterwards removes the right copy.
{
  const host = (text) => I.wrapCustomCard({ type: 'markdown', content: text });
  const p = pairOf([host('EINS'), host('ZWEI')], []);
  I.syncPairTiles(p);
  p.desktop.compact.rooms[0].tiles[1].custom_fields.card.content = 'ZWEI-neu';
  I.syncPairTiles(p);
  assert.match(JSON.stringify(phone(p)[1]), /ZWEI-neu/, 'the changed card reaches the phone');
  p.desktop.compact.rooms[0].tiles.splice(0, 1);
  I.syncPairTiles(p);
  assert.equal(phone(p).length, 1);
  assert.match(JSON.stringify(phone(p)[0]), /ZWEI-neu/);
}
// One of two hosted cards loses its condition: the phone shows both cards, each its own.
{
  const host = (text) => I.wrapCustomCard({ type: 'markdown', content: text });
  const wrap = (card) => ({ type: 'conditional', conditions: [{ condition: 'state', entity: 'input_boolean.qa_gast', state: 'on' }], card });
  const p = pairOf([host('EINS'), wrap(host('ZWEI'))], []);
  I.syncPairTiles(p);
  const d = p.desktop.compact.rooms[0].tiles;
  d[1] = d[1].card;
  I.syncPairTiles(p);
  assert.equal(phone(p).length, 2);
  assert.match(JSON.stringify(phone(p)[0]), /EINS/); assert.match(JSON.stringify(phone(p)[1]), /ZWEI/);
  assert.ok(phone(p).every((t) => t.type !== 'conditional'));
}
// Only one of two equal tiles gets a condition: its copy takes the new shape and keeps its phone value.
{
  const wrap = (card) => ({ type: 'conditional', conditions: [{ condition: 'state', entity: 'input_boolean.qa_gast', state: 'on' }], card });
  const p = pairOf([tile('casora_light', 'light.qa_lampe', 'L1'), tile('casora_light', 'light.qa_lampe', 'L2')], []);
  I.syncPairTiles(p);
  setCat(p, 0, 'eins'); setCat(p, 1, 'zwei');
  const d = p.desktop.compact.rooms[0].tiles;
  d[0] = wrap(d[0]);
  const r = I.syncPairTiles(p);
  assert.deepEqual(phone(p).map((t) => { const v = t.card || t; return [t.type === 'conditional', v.name, v.variables.mobile_filter_category]; }),
    [[true, 'L1', 'eins'], [false, 'L2', 'zwei']]);
  assert.equal(r.added, 0); assert.equal(r.dropped, 0);
}
// Both of two equal tiles get a condition in the room: both phone copies take the new shape and keep their value.
{
  const wrap = (card) => ({ type: 'conditional', conditions: [{ condition: 'state', entity: 'input_boolean.qa_gast', state: 'on' }], card });
  const p = pairOf([tile('casora_light', 'light.qa_lampe', 'L1'), tile('casora_light', 'light.qa_lampe', 'L2')], []);
  I.syncPairTiles(p);
  setCat(p, 0, 'eins'); setCat(p, 1, 'zwei');
  const d = p.desktop.compact.rooms[0].tiles;
  d[0] = wrap(d[0]); d[1] = wrap(d[1]);
  const r = I.syncPairTiles(p);
  assert.deepEqual(phone(p).map((t) => [t.type, t.card.name, t.card.variables.mobile_filter_category]), [['conditional', 'L1', 'eins'], ['conditional', 'L2', 'zwei']]);
  assert.equal(r.added, 0); assert.equal(r.dropped, 0);
}

// Tiles from before the marker that no longer read like their room tile (the sync never carried a symbol across): they
// keep their places, sync after sync (adversarial review, round 3: they took turns at the second room tile).
{
  const p = pairOf([{ ...tile('casora_light', 'light.qa_lampe', 'Lampe'), icon: 'mdi:lamp' }, tile('casora_light', 'light.qa_lampe', 'Lampe')],
    [tile('casora_light', 'light.qa_lampe', 'Lampe', { mobile_filter_category: 'c1' }), tile('casora_light', 'light.qa_lampe', 'Lampe')]);
  I.syncPairTiles(p);
  const first = JSON.stringify(phone(p));
  for (let n = 0; n < 4; n++) {
    const r = I.syncPairTiles(p);
    assert.equal(JSON.stringify(phone(p)), first, 'run ' + (n + 2) + ' changes nothing');
    assert.equal(r.moved, 0);
  }
}
// "Duplicate" of a hosted card whose phone tile is from before the marker and still shows the old text: the new copy
// comes after it and stays there.
{
  const host = (text) => I.wrapCustomCard({ type: 'markdown', content: text });
  const old = host('alter Text');
  const p = pairOf([host('neuer Text'), host('neuer Text')], [old]);
  I.syncPairTiles(p);
  assert.equal(phone(p).length, 2);
  const first = JSON.stringify(phone(p));
  const r = I.syncPairTiles(p);
  assert.equal(JSON.stringify(phone(p)), first, 'the second sync does not reorder');
  assert.equal(r.moved, 0);
}

console.log('ok – handy_doppelte_kacheln');
