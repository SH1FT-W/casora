// _hpPlantShow (01-basis.js) notes the chosen reading in window._hpShown only for the dashboard's popup. A choice in
// the Studio's popup preview (casoraPopup.shown = preview, 2829b746) must not carry over into a later dashboard popup:
// the battery list (08-weich-kompakt.js B.tap) reads _hpShown as its current row.
//   node dev/unit/plant_show_preview.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
const a = src.indexOf('    window._hpPlantShow = function (eid, row, noScroll) {');
const b = src.indexOf('    // Erstes Diagramm einhängen', a);
assert.ok(a > 0 && b > a, '_hpPlantShow found');
const block = src.slice(a, b);

const popup = () => {
  const slot = { kind: 'slot' };
  return { slot, shadowRoot: { querySelector: () => null } };
};
const find = (root, sel) => {
  const pop = [dash, prev].find((p) => p.shadowRoot === root);
  return sel === '.hp-chart-slot' && pop ? [pop.slot] : [];
};
let dash = popup(), prev = popup(), shown = null;
const mounted = [];
const run = (window) => new Function('window', 'find', 'popRoot', 'mount', block)(window, find, () => shown, (slot, cfg) => mounted.push([slot, cfg.k]));
const cfg = { 'sensor.qa_battery_a': { k: 'a' }, 'sensor.qa_battery_b': { k: 'b' } };

// Dashboard popup on screen: the choice is noted.
let w = { _hpPlantCfg: cfg, casoraPopup: { element: dash, current: { title: 'x' } } };
run(w);
shown = dash;
assert.equal(w._hpPlantShow('sensor.qa_battery_a', null, true), true);
assert.equal(w._hpShown, 'sensor.qa_battery_a', 'dashboard popup: _hpShown set');
assert.equal(w.casoraPopup.current._hpEid, 'sensor.qa_battery_a');

// Studio preview on screen (dashboard popup closed): the chart mounts in the preview, _hpShown stays as it was.
w = { _hpPlantCfg: cfg, casoraPopup: { element: dash, current: null } };
run(w);
shown = prev;
mounted.length = 0;
assert.equal(w._hpPlantShow('sensor.qa_battery_b', null, true), true, 'preview: chart shown');
assert.equal(mounted[0][0], prev.slot, 'preview: mounted into the preview slot');
assert.equal(w._hpShown, undefined, 'preview: _hpShown not set');
w._hpShown = 'sensor.qa_battery_a';
w._hpPlantShow('sensor.qa_battery_b', null, true);
assert.equal(w._hpShown, 'sensor.qa_battery_a', 'preview: an earlier dashboard choice is kept');

// Without casoraPopup (popRoot's fallback walk) the popup found is the one on screen: noted as before.
w = { _hpPlantCfg: cfg };
run(w);
shown = dash;
w._hpPlantShow('sensor.qa_battery_b', null, true);
assert.equal(w._hpShown, 'sensor.qa_battery_b', 'no casoraPopup: _hpShown set');
console.log('ok plant_show_preview');
