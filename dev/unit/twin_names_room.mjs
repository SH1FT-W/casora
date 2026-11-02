// Issue #116 (owner decision „Variante C“): blinds „Jalousie Links“ / „Jalousie Rechts“ in two rooms read
// „Links · Rechts · Links · Rechts“ in the house popup. A cut name that would appear twice for devices of different
// rooms gets its room in front („Wohnzimmer Links“), unless it names the room already. Unique names (the owner's
// „Jalousie Küche“, „Jalousie Wohnzimmer Links“ …) and a room's own list stay as they are.
//   node dev/unit/twin_names_room.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('  window.casoraDropCommonPrefix = function');
const b = core.indexOf('  function group(rows, label', a);
assert.ok(a > 0 && b > a, 'helpers found');
const hass = { areas: { wz: { name: 'Wohnzimmer' }, sz: { name: 'Schlafzimmer' }, ku: { name: 'Küche' } }, devices: { d1: { area_id: 'sz' } }, entities: {} };
const ent = (id, area, dev) => { hass.entities[id] = { entity_id: id, area_id: area || null, device_id: dev || null }; };
ent('cover.wl', 'wz'); ent('cover.wr', 'wz'); ent('cover.sl', null, 'd1'); ent('cover.sr', 'sz'); ent('cover.k', 'ku'); ent('cover.x');
const W = {};
const document = { querySelector: (q) => (q === 'home-assistant' ? { hass } : null) };
const H = new Function('window', 'document', core.slice(a, b) + '\nreturn { dropRowPrefix, popupNames };')(W, document);
const drop = W.casoraDropCommonPrefix;
const rows = (pairs) => pairs.map(([id, label]) => ({ entity: id, label }));
const labels = (rs) => rs.map((r) => r.label);

// #116: twins in two rooms (the bedroom's left blind has its area through its device)
const twins = [['cover.wl', 'Jalousie Links'], ['cover.wr', 'Jalousie Rechts'], ['cover.sl', 'Jalousie Links'], ['cover.sr', 'Jalousie Rechts']];
assert.deepEqual(labels(H.dropRowPrefix(rows(twins))), ['Wohnzimmer Links', 'Wohnzimmer Rechts', 'Schlafzimmer Links', 'Schlafzimmer Rechts'], 'UI.group: room in front of twins');
const nm = H.popupNames(rows(twins));
assert.deepEqual(rows(twins).map((r) => nm(r).label), ['Wohnzimmer Links', 'Wohnzimmer Rechts', 'Schlafzimmer Links', 'Schlafzimmer Rechts'], 'UI.popupNames: same');
assert.deepEqual(drop(twins.map((t) => t[1]), twins.map((t) => t[0])), ['Wohnzimmer Links', 'Wohnzimmer Rechts', 'Schlafzimmer Links', 'Schlafzimmer Rechts'], 'casoraDropCommonPrefix with ids');
assert.deepEqual(drop(twins.map((t) => t[1])), ['Links', 'Rechts', 'Links', 'Rechts'], 'without ids: as before');

// owner's production names: unique after the cut, unchanged
const prod = [['cover.k', 'Jalousie Küche'], ['cover.sr', 'Jalousie Bad'], ['cover.wl', 'Jalousie Wohnzimmer Links'], ['cover.wr', 'Jalousie Wohnzimmer Rechts']];
assert.deepEqual(labels(H.dropRowPrefix(rows(prod))), ['Küche', 'Bad', 'Wohnzimmer Links', 'Wohnzimmer Rechts'], 'unique names unchanged');

// a room's list: twins in one room keep their names; a name with its room already keeps it
assert.deepEqual(labels(H.dropRowPrefix(rows([['cover.wl', 'Jalousie Links'], ['cover.wr', 'Jalousie Links']]))), ['Jalousie Links', 'Jalousie Links'], 'same room: unchanged');
assert.deepEqual(drop(['Links Wohnzimmer', 'Links Schlafzimmer', 'Links'], ['cover.wl', 'cover.sl', 'cover.x']),
  ['Links Wohnzimmer', 'Links Schlafzimmer', 'Links'], 'no common words, no twins: unchanged');
assert.deepEqual(drop(['Wohnzimmer', 'Wohnzimmer'], ['cover.wl', 'cover.sl']), ['Wohnzimmer', 'Schlafzimmer Wohnzimmer'], 'a name naming its room keeps it');
// a twin without any room: the other gets its room, it stays
assert.deepEqual(drop(['Lampe Links', 'Lampe Links'], ['cover.wl', 'cover.x']), ['Wohnzimmer Lampe Links', 'Lampe Links'], 'twin without a room stays');
console.log('ok twin_names_room');
