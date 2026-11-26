// Choose your rooms › Add Room (Prüfrunde u01-13): typing a name that is already there ("wohnzimmer" next to
// "Wohnzimmer") closed the dialog and nothing happened. Now the existing room is ticked and shown, and the flow says
// "A room with this name already exists."; a new name is added as before.
//   node dev/unit/raum_doppelt_hinzufuegen.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_createForm,sameNameRoom
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const a = src.indexOf('    adder.onclick = async () => {');
assert.ok(a > 0, 'adder handler');
const b = src.indexOf('\n    };\n', a);
const handler = src.slice(a, b + 7);
const helper = /^const sameNameRoom = .*$/m.exec(src);
assert.ok(helper, 'sameNameRoom');

const tile = (name, on) => ({ dataset: { name }, attrs: { 'aria-checked': on }, scrolled: false, focused: false,
  setAttribute(k, v) { this.attrs[k] = v; }, scrollIntoView() { this.scrolled = true; }, focus() { this.focused = true; } });
const run = async (answer, list) => {
  const added = [], errors = [];
  const self = { _ask: async () => ({ value: answer }), _flowError: (m) => errors.push(m) };
  const fn = new Function('tiles', 'addRoom', 'count', 'adder', helper[0] + '\nlet dupNote = false;\n' + handler + '\nreturn adder.onclick;');
  const adder = {};
  await fn.call(self, () => list, (n, on) => added.push([n, on]), () => {}, adder).call(self);
  return { added, errors };
};

const living = tile('Wohnzimmer', 'false');
let r = await run('wohnzimmer', [living, tile('Küche', 'true')]);
assert.deepEqual(r.added, [], 'no second Wohnzimmer');
assert.equal(living.attrs['aria-checked'], 'true', 'existing room ticked');
assert.ok(living.scrolled && living.focused, 'existing room shown');
assert.deepEqual(r.errors, ['A room with this name already exists.'], 'the flow says why');

r = await run('Garage', [living]);
assert.deepEqual(r.added, [['Garage', true]], 'new name added');
assert.deepEqual(r.errors, [], 'no message for a new name');
console.log('ok raum_doppelt_hinzufuegen');
