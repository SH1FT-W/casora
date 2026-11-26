// Help › "How do I …?" (Prüfrunde u01-06): the confirm button read "Offen" in German, because it used the key "Open",
// which the Studio translates as the state ("open" door). The button is a verb: its key must not be a state word.
//   node dev/unit/hilfe_themen_knopf.mjs
// @deckt: custom_components/casora/panel/casora-panel-b-mehr.js#_helpTopics
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/panel/casora-panel-b-mehr.js');
const at = src.indexOf('P._helpTopics = ');
assert.ok(at > 0, '_helpTopics');
const body = src.slice(at, src.indexOf('};', at));
const m = /confirmLabel:\s*tr\("([^"]+)"\)/.exec(body);
assert.ok(m, 'confirm label');
const langs = fs.readdirSync(new URL('../../custom_components/casora/translations/panel/', import.meta.url)).filter((f) => f.endsWith('.json'));
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
assert.notEqual(de[m[1]], 'Offen', 'German button is not the state word "Offen"');
for (const f of langs) {
  if (f === 'en.json') continue;
  const ex = JSON.parse(read('custom_components/casora/translations/panel/' + f)).exact;
  assert.ok(ex[m[1]], f + ' translates the button');
}
console.log('ok hilfe_themen_knopf');
