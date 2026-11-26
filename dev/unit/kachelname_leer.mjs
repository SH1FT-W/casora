// Emptying a tile's name field gives the tile the name its placeholder shows (Prüfrunde u02-08).
//   node dev/unit/kachelname_leer.mjs
// The placeholder said „Waschmaschine“, but name: "" made the dashboard fall back to the entity („Waschmaschine
// Zustand“). Leaving the empty field now fills in the placeholder; while typing the field stays empty.
// @deckt: casora-panel.js#_tileCard
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('    nameIn.onchange = (');
assert.ok(a > 0, 'the name field reads its change event');
const handler = src.slice(a, src.indexOf('\n    };\n', a) + 7);
const make = (name) => {
  const tile = { type: 'custom:button-card', name, entity: 'sensor.wm' };
  const nameIn = { value: name, placeholder: 'Waschmaschine' };
  const nameEl = {};
  const self = { _syncPreview() {} };
  new Function('nameIn', 'tile', 'nameEl', 'type', handler).call(self, nameIn, tile, nameEl, { label: 'Washing machine' });
  return { tile, nameIn, nameEl };
};

let x = make('Waschmaschine Zustand');
x.nameIn.value = '';
x.nameIn.onchange({ type: 'change' });
assert.equal(x.tile.name, 'Waschmaschine', 'the tile is called what the placeholder promised');
assert.equal(x.nameIn.value, 'Waschmaschine', 'and the field shows it');
assert.equal(x.nameEl.textContent, 'Waschmaschine ');

x = make('Alt');
x.nameIn.value = '';
x.nameIn.onchange();
assert.equal(x.nameIn.value, '', 'while typing (timer) the field stays empty');
assert.equal(x.tile.name, 'Waschmaschine', 'the preview already shows the placeholder name');

x = make('Alt');
x.nameIn.placeholder = '';
x.nameIn.value = ' ';
x.nameIn.onchange({});
assert.equal('name' in x.tile, false, 'no placeholder: no name key instead of ""');
console.log('kachelname_leer: ok');
