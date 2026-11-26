// „Raum löschen?“ offers „Lieber nur ausblenden“ only for a room that is not hidden yet (Prüfrunde u02-11).
//   node dev/unit/raum_loeschen_ausgeblendet.mjs
// @deckt: casora-panel-b-ux.js#_roomMenuAction
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-ux.js', import.meta.url), 'utf8');
const a = src.indexOf('    wrap("_roomMenuAction", (orig) => async function (id, i) {');
assert.ok(a > 0);
const body = src.slice(a, src.indexOf('\n    });\n', a) + 9);
let wrapped = null;
const rooms = [{ path: 'home' }, { path: 'keller', name: 'Keller', variables: {} }, { path: 'garten', name: 'Garten', variables: { casora_hidden: true } }];
new Function('wrap', 'rooms$', 'on', 'W', 'fill', 'tr', body)(
  (_n, f) => { wrapped = f; }, () => rooms, () => true, { __casoraPanelInternals: { isHomeRoom: (r) => r === rooms[0] } },
  (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k]), (x) => x);
const run = async (i) => {
  const asked = [];
  const P = {
    _mHideRoom() {}, _roomDeleteBlock: () => false, _roomLabel: (r) => r.name,
    _ask: async (o) => { asked.push(o); return null; },
  };
  let plain = 0;
  await wrapped(async function () { plain++; }).call(P, 'delete', i);
  return { asked, plain };
};
const visible = await run(1);
assert.equal(visible.asked[0].confirmLabel, 'Just hide it', 'a visible room: hiding is offered first');
const hidden = await run(2);
assert.equal(hidden.asked.length, 0, 'a hidden room: no „Just hide it“');
assert.equal(hidden.plain, 1, 'the plain delete question asks instead');
console.log('raum_loeschen_ausgeblendet: ok');
