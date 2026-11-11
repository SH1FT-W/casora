// #173: blinds with slats (Shelly Plus 2PM in slat mode and every cover that reports a tilt) had no slat control.
// The cover popup now has a row Zu · 25 · 50 · 75 · Offen under the position for the covers that support
// set_cover_tilt_position (feature 128) or report current_tilt_position; covers without a tilt get none, and the row
// moves only the covers with slats. Popup evaluated with stand-ins.   node dev/unit/cover_tilt_popup.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_popup_cover
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = tpl.casora_popup_cover.tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');

const segs = [];
const any = () => '';
const UI = new Proxy({ segments: (items, label, opts) => { segs.push({ items, label, opts }); return 'SEG'; }, soft: () => true,
  stage: () => 'STAGE', group: () => 'GROUP', label: (t) => t, popupNames: () => (x) => x }, { get: (o, k) => (k in o ? o[k] : any) });
const window = { _casoraUI: UI, innerWidth: 1200,
  casoraCoverControls: () => ({ shown: (v) => v, flip: false, attr: 'current_position', open: 'Auf', close: 'Zu', shade: null, scope: '', closedWord: '' }),
  casoraCoverRowWords: (W) => W, casoraCoverKind: () => ({ key: 'blind', label: 'Jalousien', open: 'a', closed: 'b' }) };
globalThis.localStorage = { getItem: () => 'v3' };

const run = (states, variables) => {
  segs.length = 0;
  const out = new Function('window', 'states', 'hass', 'variables', 'entity', 'user', src)(window, states, { entities: {} }, variables, null, {});
  return { out, tilt: segs.find((s) => s.label === 'Lamellenstellung') };
};
const cover = (pos, attrs = {}) => ({ state: pos > 0 ? 'open' : 'closed', attributes: { current_position: pos, supported_features: 15, ...attrs } });

// One blind with slats (feature 128) at 50 %.
let r = run({ 'cover.qa_lamellen': cover(40, { supported_features: 15 | 128 | 16 | 32, current_tilt_position: 50 }) }, { covers: ['cover.qa_lamellen'] });
assert.ok(r.tilt, 'a slat row');
assert.deepEqual(r.tilt.items.map((i) => i.label), ['Zu', '25 %', '50 %', '75 %', 'Offen']);
assert.deepEqual(r.tilt.items.map((i) => i.active), [false, false, true, false, false], 'the slats at 50 % are chosen');
assert.deepEqual(r.tilt.items[1].svc, { domain: 'cover', service: 'set_cover_tilt_position', target: { entity_id: ['cover.qa_lamellen'] }, data: { tilt_position: 25 } });
assert.deepEqual(r.tilt.opts.live, { entities: ['cover.qa_lamellen'], attr: 'current_tilt_position' }, 'follows the live tilt');

// A plain roller shutter: no slat row.
r = run({ 'cover.qa_rollo': cover(100) }, { covers: ['cover.qa_rollo'] });
assert.equal(r.tilt, undefined, 'no tilt, no row');

// A room with both: the row moves only the blind with slats (also when it only reports the attribute).
r = run({ 'cover.qa_rollo': cover(100), 'cover.qa_jalousie': cover(0, { current_tilt_position: 0 }) }, { covers: ['cover.qa_rollo', 'cover.qa_jalousie'] });
assert.ok(r.tilt, 'mixed room: a slat row');
assert.deepEqual(r.tilt.items[4].svc.target.entity_id, ['cover.qa_jalousie'], 'only the blind with slats');
console.log('cover_tilt_popup: ok');
