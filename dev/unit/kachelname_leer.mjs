// Emptying a tile's name field gives the tile no name of its own, and the placeholder says which name it then
// shows (Prüfrunde u02-08).
//   node dev/unit/kachelname_leer.mjs
// The placeholder said „Waschmaschine“ (the tile type's name) while name: "" made the dashboard show the entity's
// name („Waschmaschine Zustand“). The first fix stored the placeholder as the name: a tile could then never go back
// to its device's name (#f9), and the Studio translation had already turned a placeholder like „Auto“ into
// „Automatisch“, which got stored. Now: empty = no name key; the placeholder is the name the tile falls back to
// (casoraTileName, as in the preview) and is never run through the Studio word list.
// @deckt: casora-panel.js#_tileCard
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('    const nameIn = document.createElement("input");');
assert.ok(a > 0, 'the tile form builds its name field');
const b = src.indexOf('    nameIn.onchange = (', a);
assert.ok(b > a, 'the name field reads its change event');
const block = src.slice(a, src.indexOf('\n    };\n', b) + 7) + '\nreturn nameIn;';

// The Studio translation (casora-panel-i18n.js) rewrites placeholders of elements without data-no-i18n.
const STUDIO_WORDS = { Auto: 'Automatisch' };
const i18n = (el) => {
  if (!('data-no-i18n' in el.attrs) && STUDIO_WORDS[el.placeholder]) el.placeholder = STUDIO_WORDS[el.placeholder];
};

const make = ({ name, own, label = 'Car', defName = 'Auto' }) => {
  const tile = { type: 'custom:button-card', template: ['casora_entity'], entity: 'sensor.p1s' };
  if (name !== undefined) tile.name = name;
  const document = {
    createElement: () => ({
      attrs: {}, value: '', placeholder: '',
      setAttribute(k, v) { this.attrs[k] = v; },
    }),
  };
  const window = { casoraTileName: (t) => (t.name ? null : own) };
  const self = {
    _hass: { states: { 'sensor.p1s': { state: 'idle', attributes: {} } } },
    _state: { templates: {} },
    _tileEnt: (t) => t.entity,
    _syncPreview() {},
  };
  const nameEl = {};
  const nameIn = new Function('document', 'window', 'tile', 'type', 'newTile', 'nameEl', 'isCustom', block)
    .call(self, document, window, tile, { label }, () => ({ name: defName }), nameEl, false);
  i18n(nameIn);
  return { tile, nameIn, nameEl };
};

// The reviewer's case: a German car tile, the type's own name „Auto“ must not become „Automatisch“.
let x = make({ name: 'Mein Wagen', own: null });
assert.equal(x.nameIn.placeholder, 'Auto', 'the placeholder is not run through the Studio word list');
x.nameIn.value = '';
x.nameIn.onchange({ type: 'change' });
assert.equal('name' in x.tile, false, 'an emptied name stores no name (not the placeholder, not "")');

// A tile without its own name shows its device's name (#f9): the placeholder says so and emptying goes back to it.
x = make({ name: 'Drucker', own: 'P1S' });
assert.equal(x.nameIn.placeholder, 'P1S', 'the placeholder is the name the tile falls back to');
assert.ok('data-no-i18n' in x.nameIn.attrs, 'a device name is not a Studio word');
x.nameIn.value = '  ';
x.nameIn.onchange();
assert.equal('name' in x.tile, false, 'while typing (timer) the emptied field already drops the name');
assert.equal(x.nameIn.value, '  ', 'and the field is not filled in under the cursor');
assert.equal(x.nameIn.placeholder, 'P1S');

// A typed name is kept as typed.
x = make({ own: 'P1S' });
x.nameIn.value = ' Drucker ';
x.nameIn.onchange({ type: 'change' });
assert.equal(x.tile.name, 'Drucker');
console.log('kachelname_leer: ok');
