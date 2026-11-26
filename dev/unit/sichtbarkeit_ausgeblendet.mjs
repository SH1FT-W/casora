// A tile switched off says so under „Sichtbarkeit & Halten“ (Prüfrunde u02-07).   node dev/unit/sichtbarkeit_ausgeblendet.mjs
// The preview showed „Ausgeblendet“, the sentence below still „Alle sehen diese Kachel – auf Desktop und Handy.“ and
// the summary „Alle · überall“.
// @deckt: casora-panel-b-ux.js#_uxVisSentence,_uxVisSummary
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-ux.js', import.meta.url), 'utf8');
const cut = (name) => {
  const a = src.indexOf('    P.' + name + ' = function');
  assert.ok(a > 0, name);
  return src.slice(a, src.indexOf('\n    };\n', a) + 7);
};
const usersOf = (shell) => {
  const c = shell && Array.isArray(shell.visibility) ? shell.visibility.find((x) => x && x.condition === 'user') : null;
  return c ? c.users : [];
};
const P = {};
new Function('P', 'tr', 'fill', 'usersOf', cut('_uxVisSentence') + cut('_uxVisSummary'))(
  P, (x) => x, (t, o) => t.replace(/\{(\w+)\}/g, (_, k) => o[k]), usersOf);

const on = { type: 'custom:button-card', variables: {} };
assert.equal(P._uxVisSentence(on), 'Everyone sees this tile – on desktop and phone.');
assert.equal(P._uxVisSummary(on), 'Everyone · everywhere');
const off = { type: 'custom:button-card', variables: { enabled: false } };
assert.equal(P._uxVisSentence(off), 'Hidden – nobody sees this tile on the dashboard.');
assert.equal(P._uxVisSummary(off), 'Hidden');
const condOff = { type: 'conditional', card: { variables: { enabled: false } }, visibility: [{ condition: 'user', users: ['a'] }] };
assert.equal(P._uxVisSummary(condOff), 'Hidden', 'inside a conditional shell too');
console.log('sichtbarkeit_ausgeblendet: ok');
