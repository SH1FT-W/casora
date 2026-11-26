// Back from a tile in the desktop Studio clears the veil over the preview (Prüfrunde u02-12).
//   node dev/unit/zurueck_ohne_schleier.mjs
// The back arrow set _sel to null but left _group on "tiles": _focusPreview kept the preview dimmed with nothing
// selected, through a dashboard switch and „Verwerfen“. Same rule as removing the selected tile (r160 ds-10).
// @deckt: casora-panel.js#_popRow,_focusPreview
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('\n  _popRow() {');
const body = src.slice(a, src.indexOf('\n  }\n', a) + 4).trim();
const popRow = new Function('GROUPS', 'return { ' + body.replace(/^_popRow/, 'f: function') + ' }.f;')([{ id: 'rooms' }, { id: 'tiles' }]);
const panel = (...cls) => ({ classList: { contains: (c) => cls.includes(c) }, _sel: { group: 'tiles', key: 'k' }, _group: 'tiles', _renderForm() {} });

const desk = panel('bmode');
popRow.call(desk);
assert.equal(desk._sel, null);
assert.equal(desk._group, 'rooms', 'desktop: back to the room, no veil');
const phone = panel('bmode', 'phone');
popRow.call(phone);
assert.equal(phone._group, 'tiles', 'phone: stays in the tile list');
const classic = panel();
popRow.call(classic);
assert.equal(classic._group, 'tiles', 'classic editor: unchanged');
console.log('zurueck_ohne_schleier: ok');
