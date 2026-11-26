// Bell, HA notification opened by a non-admin (Prüfrunde w05-01): with the shared hidden list on (Studio "Removed for
// all users") the only action said "Für mich ausblenden" but removed the notification from every bell, the admin's
// too. The action says what it does: "Für alle ausblenden" with the shared list, "Für mich ausblenden" without.
//   node dev/unit/glocke_ausblenden_geteilt.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#pnHideLabel
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const m = /^  function pnHideLabel\(\) \{[^\n]*\}$/m.exec(core);
assert.ok(m, 'pnHideLabel');
assert.ok(/label: pnHideLabel\(\)/.test(core), 'the popup uses it');
const label = (uid) => new Function('_hid', 'SHARED_UID', m[0] + '\nreturn pnHideLabel();')({ uid }, 'casora:shared');
assert.equal(label('casora:shared'), 'Für alle ausblenden', 'shared list: for everyone');
assert.equal(label('user-1'), 'Für mich ausblenden', 'own list: for me');
assert.equal(label(null), 'Für mich ausblenden');
for (const lang of ['en', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const P = JSON.parse(rd('custom_components/casora/translations/dashboard/phrases/' + lang + '.json'));
  assert.ok(P.exact['Für alle ausblenden'], lang + ' translates "Für alle ausblenden"');
}
console.log('ok glocke_ausblenden_geteilt');
