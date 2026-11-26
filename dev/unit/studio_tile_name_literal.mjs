// A tile name someone gave is not a Studio word (Prüfrunde u02-01).   node dev/unit/studio_tile_name_literal.mjs
// The car tile is named „Auto“ by default. The Studio's word list maps the option word „Auto“ to „Automatisch“, so the
// tile list, the inspector head and the preview showed „Automatisch“. Names stay as typed (shownRoomName rule): the
// head marks such a label literal and every place that paints it sets data-no-i18n.
// @deckt: casora-panel.js#_headFor,_syncPreview,_tileCard,_paintTile
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('\n  _headFor(g, room) {');
assert.ok(a > 0, '_headFor');
const body = src.slice(a, src.indexOf('\n  }\n', a) + 4);
const headFor = new Function('tileView', 'tileTypeAny', 'TILE_ICON', 'TILE_COLOR', 'TILE_TINT', 'customTileName', 'SECTIONS', 'secName',
  'return { ' + body.trim().replace(/^_headFor/, '_headFor: function') + ' }._headFor;');
const types = { car: { id: 'car', label: 'Car', blurb: '' }, custom: { id: 'custom', label: 'Custom card' } };
const hf = headFor((t) => t, (t) => types[t.type], {}, {}, '#000', (t) => (t.title ? { name: t.title } : null), [], (x) => x);
const ctx = (tile) => ({ _sel: { group: 'tiles', key: 'k' }, _tileKey: () => 'k', _hass: { states: {} } });
const g = { id: 'tiles', label: 'Tiles', icon: 'tile' };
const run = (tile) => hf.call(ctx(tile), g, { tiles: [tile] });

assert.deepEqual([run({ type: 'car', name: 'Auto' }).label, run({ type: 'car', name: 'Auto' }).literal], ['Auto', true], 'own name: literal');
assert.deepEqual([run({ type: 'car' }).label, !!run({ type: 'car' }).literal], ['Car', false], 'type label: translated');
assert.deepEqual([run({ type: 'car', name: '  ' }).label, !!run({ type: 'car', name: '  ' }).literal], ['Car', false]);
assert.equal(run({ type: 'custom', title: 'Mein Graph' }).literal, true, 'name read from the card');
assert.equal(run({ type: 'unknown-x', name: 'Auto' }).literal, true, 'unknown template keeps its name');

// Every place that paints the head honours the flag.
assert.match(src, /gt\.textContent = H\.label;\n\s+if \(H\.literal\) gt\.setAttribute\("data-no-i18n", ""\);/, 'group head');
assert.match(src, /h3\.textContent = \(H && H\.label\) \|\| this\._sel\.label \|\| home;\n\s+if \(H && H\.label && H\.literal\) h3\.setAttribute\("data-no-i18n", ""\);/, 'detail bar');
assert.match(src, /h3\.toggleAttribute\("data-no-i18n", !!H\.literal\);\n\s+h3\.textContent = lab;/, 'head after a rename');
// Tile list row and preview tile.
assert.match(src, /else if \(!isCustom && !contDesc && !carousel && tile\.name && tile\.name\.trim\(\)\) nameEl\.setAttribute\("data-no-i18n", ""\);/, 'tile list');
assert.match(src, /if \(own \|\| nm\) el\.querySelector\("\.mname"\)\.setAttribute\("data-no-i18n", ""\);/, 'preview tile');
console.log('studio_tile_name_literal: ok');
