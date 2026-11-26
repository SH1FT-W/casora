// Welcome screen (Prüfrunde u01-10): with three Hemma dashboards found, the line said "Casora hat ein Dashboard von
// Hemma gefunden". The line follows the number now, and every language translates the plural line.
//   node dev/unit/willkommen_hemma_anzahl.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#hemmaFoundText
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/panel/casora-panel.js');
const m = /^const hemmaFoundText = [\s\S]*?\);\n/m.exec(src);
assert.ok(m, 'hemmaFoundText');
const hemmaFoundText = new Function(m[0] + 'return hemmaFoundText;')();
assert.ok(/feat\(\["import"[^\n]*hemmaFoundText\(moves\.length\)/.test(src), 'welcome line uses the number found');

const one = hemmaFoundText(1), three = hemmaFoundText(3);
assert.ok(/a dashboard/.test(one), 'one: singular');
assert.ok(/ 3 dashboards/.test(three), 'three: plural with the number');

const dir = new URL('../../custom_components/casora/translations/panel/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
  const t = JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8'));
  assert.ok(t.exact[one], f + ': singular line');
  const hit = (t.patterns || []).find(([re]) => new RegExp(re).test(three));
  assert.ok(hit, f + ': plural line has a pattern');
  const out = three.replace(new RegExp(hit[0]), hit[1].replace(/\{(\d+)\}/g, '$$$1'));
  assert.ok(out.includes('3') && out !== three, f + ': plural translated with the number');
}
console.log('ok willkommen_hemma_anzahl');
