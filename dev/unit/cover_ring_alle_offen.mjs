// Test round 26.11.2026 (u05-05): six blinds, one at 40 %, the rest at 100 %. The popup's head said „Teilweise geöffnet ·
// Ø 90 %“, the dial right under it „6 von 6 geöffnet“. The count in the dial now stands only where the head counts too
// (some open, some closed); all or none open, the head's words say it.
//   node dev/unit/cover_ring_alle_offen.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_popup_cover,casora_cover
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const core = read('custom_components/casora/scripts/casora-core.js');
const from = core.indexOf('  window.casoraCoverSummary = function');
const to = core.indexOf('  // The words for a summary', from);
const w = { casoraCoverClosedUpTo: () => 0 };
vm.runInNewContext(core.slice(from, to), { window: w });

const cov = (state, pos) => ({ state, attributes: { current_position: pos, supported_features: 15 } });
const dial = (name, states) => {
  const src = tpl[name].tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  let o = null;
  const any = () => '';
  const UI = new Proxy({ stage: (kind, x) => { if (kind === 'position') o = x; return 'STAGE'; }, segments: () => 'SEG', soft: () => true,
    group: () => 'GROUP', label: (t) => t, popupNames: () => (x) => x }, { get: (t, k) => (k in t ? t[k] : any) });
  const window = Object.assign({}, w, { _casoraUI: UI, innerWidth: 1200,
    casoraCoverControls: () => ({ shown: (v) => v, flip: false, attr: 'current_position', open: 'Auf', close: 'Zu', shade: null, scope: 'Gilt für alle', closedWord: '' }),
    casoraCoverRowWords: (W) => W, casoraCoverKind: () => ({ key: 'blind', label: 'Jalousien', open: 'a', closed: 'b' }),
    casoraCoverSummaryText: () => ({ full: '', short: '' }) });
  globalThis.localStorage = { getItem: () => 'v3' };
  new Function('window', 'states', 'hass', 'variables', 'entity', 'user', src)(window, states, { entities: {} }, { covers: Object.keys(states) }, null, {});
  return o.word;
};

for (const name of ['casora_popup_cover', 'casora_cover']) {
  const partly = { 'cover.example_bath': cov('open', 40) };
  for (let i = 1; i <= 5; i++) partly['cover.example_' + i] = cov('open', 100);
  assert.equal(dial(name, partly), 'Gilt für alle', name + ': no „6 von 6 geöffnet“ under „Teilweise geöffnet“');
  const closed = { 'cover.example_a': cov('closed', 0), 'cover.example_b': cov('closed', 0) };
  assert.equal(dial(name, closed), 'Gilt für alle', name + ': no „0 von 2 geöffnet“ under „Alle geschlossen“');
  const some = { 'cover.example_a': cov('open', 100), 'cover.example_b': cov('closed', 0), 'cover.example_c': cov('closed', 0) };
  assert.equal(dial(name, some), '1 von 3 geöffnet · Gilt für alle', name + ': a real count stays (wortliste)');
}
console.log('ok cover dial: no count beside the head\'s words');
