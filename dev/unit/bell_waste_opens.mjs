// @deckt: custom_components/casora/scripts/local/01-basis.js#standing
// Owner (beta 26.11.28b6, phone): the bell's waste row („Abfall morgen · Restabfall“) could not be tapped, every other
// row opens its popup. Cause: the row had neither opens nor entity, so the bell drew it as not tappable. Expected: the
// row names the waste tile's template, whose tap opens the waste popup (casora_trash, tap_action.casora_popup).
//   node dev/unit/bell_waste_opens.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const bs = basis.indexOf('(function () {\n  if (window._casoraNotifyLocal) return;');
assert.ok(bs > 0, 'notify extension (01-basis) found');
const mod = basis.slice(bs, basis.indexOf('\n})();', bs) + 6);

globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {} }), body: { appendChild() {} } };
globalThis.addEventListener = () => {};
globalThis.setInterval = () => 0;
globalThis.setTimeout = () => 0;
window.CASORA_NOTIFY_EXTENSIONS = [];
// Both rows at any hour of the test run.
window.CASORA_NOTIFY_LOCAL = { waste_from_hour: 0, waste_until_hour: 24 };
window.casoraDevice = { waste: () => ({ bins: [{ label: 'Bio', days: 0 }, { label: 'Restabfall', days: 1 }], duty: null }) };
new Function(mod)();
const ext = window.CASORA_NOTIFY_EXTENSIONS[0];

const rows = ext.standing({ states: {}, entities: {}, devices: {}, areas: {} }, [], { nameOf: () => '' });
const waste = rows.filter((r) => String(r.id).indexOf('casora:waste:') === 0);
assert.equal(waste.length, 2, 'waste rows today and tomorrow');

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
for (const r of waste) {
  // The bell draws a row as tappable with entity or opens (casora-core.js, tappable).
  assert.ok(r.opens && r.opens.length, r.label + ': row has a tap target');
  const names = [].concat(r.opens);
  assert.ok(names.includes('casora_trash'), r.label + ': opens the waste tile');
  for (const n of names) assert.ok(tpl[n] && tpl[n].tap_action && tpl[n].tap_action.casora_popup, n + ': template with a Casora popup');
}
console.log('bell_waste_opens: ok');
