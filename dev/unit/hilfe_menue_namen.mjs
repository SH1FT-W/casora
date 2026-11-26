// Help menu (Prüfrunde u01-15): the ⋯ menu's "Kurze Einführung" (Studio tour) and Help's "Einführung in Casora"
// (the welcome screen) were two names for two different things, and the Help submenu had no icons while the ⋯ menu
// had. Now: "Studio tour" and "Welcome screen", clearly apart in every language, and every Help entry has an icon.
//   node dev/unit/hilfe_menue_namen.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_helpMenu
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = rd('custom_components/casora/panel/casora-panel.js');
const a = src.indexOf('  _helpMenu(anchor) {');
assert.ok(a > 0, '_helpMenu');
const body = src.slice(a, src.indexOf('], (id) =>', a));
const items = [...body.matchAll(/\{ id: "([a-zA-Z]+)", label: "([^"]+)"([^}]*)\}/g)];
assert.ok(items.length >= 5, 'help items');
for (const [, id, , rest] of items) {
  const m = /icon: "([a-z]+)"/.exec(rest);
  assert.ok(m, id + ' has an icon');
  assert.ok(new RegExp('^  "' + m[1] + '": ', 'm').test(src), id + ': icon "' + m[1] + '" exists in MENU_ICONS');
}
const welcome = items.find((x) => x[1] === 'welcome')[2];
const plus = rd('custom_components/casora/panel/casora-panel-b-plus.js');
const tour = /id: "bintro", label: "([^"]+)"/.exec(plus)[1];
const dir = new URL('../../custom_components/casora/translations/panel/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
  const ex = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')).exact;
  assert.ok(ex[welcome] && ex[tour], f + ': both translated');
  const w = ex[welcome].toLowerCase(), t = ex[tour].toLowerCase();
  // Not two "introductions": no shared word longer than three letters.
  const shared = w.split(/[\s-]+/).filter((x) => x.length > 3 && t.split(/[\s-]+/).includes(x));
  assert.deepEqual(shared, [], `${f}: "${ex[welcome]}" and "${ex[tour]}" are clearly apart`);
}
console.log('ok hilfe_menue_namen');
