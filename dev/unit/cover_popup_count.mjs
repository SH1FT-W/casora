// #177 (tester's report on b13): the popup head said „12 von 17 geöffnet“, the dial under it „13 von 17“. The dial
// counted by state alone, so a garage door at 1 % inside its „Gilt als geschlossen bis“ value still counted as open.
// The dial now takes the same count as the head (casoraCoverSummary). Popup evaluated with stand-ins.
//   node dev/unit/cover_popup_count.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_popup_cover,casora_cover
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));

// The real summary from casora-core.js, with the door's threshold at 1 % as in the report.
const core = read('custom_components/casora/scripts/casora-core.js');
const from = core.indexOf('  window.casoraCoverSummary = function');
const to = core.indexOf('  // The words for a summary', from);
assert.ok(from > 0 && to > from, 'casoraCoverSummary found');
const w = { casoraCoverClosedUpTo: (id) => (id === 'cover.qa_tor' ? 1 : 0) };
vm.runInNewContext(core.slice(from, to), { window: w });

const cov = (state, pos) => ({ state, attributes: { current_position: pos, supported_features: 15 } });
const states = { 'cover.qa_tor': cov('open', 1), 'cover.qa_r1': cov('open', 100), 'cover.qa_r2': cov('closed', 0) };
const covers = Object.keys(states);
assert.equal(w.casoraCoverSummary(states, covers).open, 1, 'head: only the blind at 100 % is open');

for (const name of ['casora_popup_cover', 'casora_cover']) {
  const src = tpl[name].tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  let dial = null;
  const any = () => '';
  const UI = new Proxy({ stage: (kind, o) => { if (kind === 'position') dial = o; return 'STAGE'; }, segments: () => 'SEG', soft: () => true,
    group: () => 'GROUP', label: (t) => t, popupNames: () => (x) => x }, { get: (o, k) => (k in o ? o[k] : any) });
  const window = Object.assign({}, w, { _casoraUI: UI, innerWidth: 1200,
    casoraCoverControls: () => ({ shown: (v) => v, flip: false, attr: 'current_position', open: 'Auf', close: 'Zu', shade: null, scope: 'Gilt für alle 3', closedWord: '' }),
    casoraCoverRowWords: (W) => W, casoraCoverKind: () => ({ key: 'blind', label: 'Jalousien', open: 'a', closed: 'b' }),
    casoraCoverSummaryText: () => ({ full: '', short: '' }) });
  globalThis.localStorage = { getItem: () => 'v3' };
  new Function('window', 'states', 'hass', 'variables', 'entity', 'user', src)(window, states, { entities: {} }, { covers }, null, {});
  assert.ok(dial, name + ': dial drawn');
  assert.ok(dial.word.startsWith('1 von 3 geöffnet'), name + ': dial counts like the head, got „' + dial.word + '“');
}
console.log('cover_popup_count ok');
