// Rechnet Fingerabdrücke und refreshTemplates() mit dem echten Studio-Code, für den
// Abgleich mit custom_components/casora/template_print.py (dev/unit/vorlagen_auto_test.py).
//   node dev/unit/vorlagen_print_js.mjs <eingabe.json> <ausgabe.json>
// Eingabe: {"prints": {name: vorlage}, "whole": [wert, …], "refresh": [{current, bundle, prior}, …]}
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');

function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const code = [
  one(/^const clone = .*$/m),
  grab(/^function stable\(/m),
  grab(/^const hashStr = /m),
  one(/^const SCENE_KEYS = .*$/m),
  grab(/^const omit = /m),
  one(/^const derivedKeysOf = .*$/m),
  grab(/^function withoutDerived\(/m),
  one(/^const templatePrint = .*$/m),
  grab(/^const fingerprintOf = /m),
  grab(/^function derivedFrom\(/m),
  grab(/^function printMatches\(/m),
  grab(/^function refreshTemplates\(/m),
  'return { fingerprintOf, refreshTemplates, hashStr, stable };',
].join('\n');
const { fingerprintOf, refreshTemplates, hashStr, stable } = new Function(code)();

const [inp, outp] = process.argv.slice(2);
const data = JSON.parse(fs.readFileSync(inp, 'utf8'));
const out = {
  prints: fingerprintOf(data.prints || {}),
  whole: (data.whole || []).map((x) => hashStr(stable(x))),
  stable: (data.whole || []).map((x) => stable(x)),
  refresh: (data.refresh || []).map((c) => refreshTemplates(c.current, c.bundle, c.prior)),
};
fs.writeFileSync(outp, JSON.stringify(out));
