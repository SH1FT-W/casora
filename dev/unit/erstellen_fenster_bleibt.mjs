// "Create dashboard…" from the Studio (Prüfrunde u01-08): step 1 opened as a sheet with X, step 2 ("Fill Your Rooms")
// forced the full page, and after "Back" step 1 stayed a full page without X (and Escape did nothing). No step of the
// rooms part forces the full page now: the frame chosen at the start (sheet from the Studio, full page in the first
// run without a dashboard) stays for all three steps.
//   node dev/unit/erstellen_fenster_bleibt.mjs
// @deckt: custom_components/casora/panel/casora-panel-basis.js#_fillStep,_fillPreview
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const basis = rd('custom_components/casora/panel/casora-panel-basis.js');
const panel = rd('custom_components/casora/panel/casora-panel.js');
const screenOpts = (src, title) => {
  const t = src.indexOf('title: "' + title + '"');
  assert.ok(t > 0, title);
  const a = src.lastIndexOf('this._flowScreen({', t);
  return src.slice(a, src.indexOf('});', t));
};
for (const [src, title] of [[panel, 'Choose Your Rooms'], [basis, 'Fill Your Rooms'], [basis, 'Your Rooms']]) {
  assert.ok(!/full:\s*true/.test(screenOpts(src, title)), title + ': does not force the full page');
}
// The frame rule itself: full only on request, without a dashboard, or when already full.
const want = /const want = (.*);/.exec(panel.slice(panel.indexOf('  _flowScreen(opts) {')))[1];
const frame = new Function('opts', 'self', 'return ' + want.replace(/this\./g, 'self.'));
assert.equal(frame({}, { _state: {}, _flowMode: 'sheet' }), 'sheet', 'from the Studio: sheet');
assert.equal(frame({}, { _state: null, _flowMode: null }), 'full', 'first run: full page');
console.log('ok erstellen_fenster_bleibt');
