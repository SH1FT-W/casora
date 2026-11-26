// Setup assistant step counter (Prüfrunde u01-11): look, font and effects said "Schritt 1/2/3 von 6", but after the
// fork "Vorhandene Dashboards gefunden" the move path has no such steps and the counter vanished: the six announced
// steps were not true there. The three steps before the fork carry no total ("Schritt 1"); the new-dashboard path
// keeps "Schritt 4 von 6" for rooms, fill and preview.
//   node dev/unit/einrichtung_schrittzaehler.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#leadStep,setupStep,_flowScreen
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = rd('custom_components/casora/panel/casora-panel.js');
for (const title of ['Choose Your Look', 'Choose Your Font', 'Smooth on Every Screen']) {
  const m = new RegExp('title: "' + title + '", step: ([^,]+(?:\\([^)]*\\))?)').exec(src);
  assert.ok(m, title);
  assert.ok(!/SETUP_STEPS/.test(m[1]), title + ': no total before the fork (' + m[1] + ')');
}
const lead = /^const leadStep = .*$/m.exec(src);
assert.ok(lead, 'leadStep');
assert.deepEqual(new Function(lead[0] + '\nreturn leadStep(2);')(), [2]);
const setup = /^const setupStep = .*$/m.exec(src);
assert.deepEqual(new Function('const SETUP_LEAD = 3, SETUP_STEPS = 6;\n' + setup[0] + '\nreturn setupStep(1, true);')(), [4, 6], 'rooms still 4 of 6');
// The screen writes "Step n" without a total, translated in every language.
assert.ok(/t\("Step \{1\}"\)/.test(src), 'flow screen has the plain step line');
const dir = new URL('../../custom_components/casora/translations/panel/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && x !== 'en.json')) {
  assert.ok(JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')).exact['Step {1}'], f + ': "Step {1}"');
}
console.log('ok einrichtung_schrittzaehler');
