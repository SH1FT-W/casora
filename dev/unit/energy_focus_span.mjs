// @deckt: custom_components/casora/scripts/local/20-energie-fokus.js#build,sec,stage3,span,setSpan,chartCfg,spanHtml
// Energy sub-badge pages (#195): the charts switch between 4 h and 24 h. Solar/house open on 4 h, battery/grid on
// 24 h; a tap sets the range for all four pages together, for the session.
//   node dev/unit/energy_focus_span.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const win = { innerWidth: 1440 };
const ctx = vm.createContext({ window: win, console, JSON, Object, setTimeout });
vm.runInContext(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/20-energie-fokus.js', import.meta.url), 'utf8'), ctx);
const F = win._casoraEnergyFocus;

// The chart config helpers as in 01-basis.js (_hpChartCfg / _hpSmooth).
win._hpPlantCfg = {}; win._hpPlantMeta = {};
win._hpChartCfg = (eid, label, span, color, height) => {
  win._hpPlantMeta[eid] = [label, span, color];
  return (win._hpPlantCfg[eid] = { type: 'custom:casora-chart', kind: 'line', span, height, series: [{ entity: eid, name: label, color }] });
};
win._hpSmooth = (eid, dur) => { win._hpPlantCfg[eid].bucket = dur; };
win._hpChartInit = () => {};
win._hpChartTitle = (eid) => win._hpPlantMeta[eid].join(' · ');
win.casoraEsc = (t) => String(t);
let v3 = true;
win._casoraUI = {
  v3: () => v3,
  esc: (t) => String(t),
  stage: (type, o) => o,
  hero: (o) => o,
  group: () => 'G',
  segments: (items) => '<div class="hui-seg">' + items.map((i) => '<div class="hui-sg' + (i.active ? ' on' : '') + '">' + i.label + '</div>').join('') + '</div>',
};
win._casoraSoftEnergy = { kit: {
  secCard: (watch, code) => ({ code }),
  layout: (o) => o,
  chartCard: (mc, extra) => ({ mc, extra }),
  call: () => '',
} };

const st = (state, unit, dc, name) => ({ state: String(state), attributes: { unit_of_measurement: unit, device_class: dc, friendly_name: name } });
const states = {
  'sensor.pv': st(432, 'W', 'power', 'Solarleistung'),
  'sensor.akku': st(-120, 'W', 'power', 'Akkuleistung'),
  'sensor.haus': st(569, 'W', 'power', 'Hausbedarf'),
  'sensor.netz': st(149, 'W', 'power', 'Netzleistung'),
};
const entities = {
  'sensor.pv': { platform: 'anker_solix', translation_key: 'input_power' },
  'sensor.akku': { platform: 'anker_solix', translation_key: 'battery_power_signed' },
  'sensor.haus': { platform: 'anker_solix', translation_key: 'home_load_power' },
  'sensor.netz': { platform: 'anker_solix', translation_key: 'grid_power_signed' },
};
const hass = { states, entities };
const V = { energy_entity_1: 'sensor.pv', energy_entity_2: 'sensor.akku', energy_entity_3: 'sensor.haus', energy_entity_4: 'sensor.netz' };
const peers = F.peers(hass, V);
const build = (focus, extra) => F.build(Object.assign({ hass, states, variables: { energy_focus: focus, energy_peers: peers } }, extra || {}));
const MAIN = { solar: 'sensor.pv', battery: 'sensor.akku', home: 'sensor.haus', grid: 'sensor.netz' };
// The stage's C as the page wrote it into its card.
const stageC = (out) => JSON.parse(out.fields.stage.card.code.match(/"stage3", (\{.*\}), states, hass\)/)[1]);
const stageHtml = (out) => F.sec.call({ shadowRoot: null, isConnected: true }, 'stage3', stageC(out), states, hass);

assert.equal(typeof F.setSpan, 'function', 'the energy pages have a range switch');

// Defaults per page as before: solar/house 4 h raw, battery/grid 24 h averaged to 15 min.
for (const [focus, sp] of [['solar', '4h'], ['home', '4h'], ['battery', '24h'], ['grid', '24h']]) {
  assert.equal(F.span(focus), sp, focus + ' opens on ' + sp);
  build(focus);
  const c = win._hpPlantCfg['ef3:' + MAIN[focus]];
  assert.equal(c.span, sp, focus + ' chart ' + sp);
  assert.equal(c.bucket, sp === '24h' ? '15min' : undefined);
  assert.equal(c.readout, 'hero');
  assert.equal(c.series[0].entity, MAIN[focus]);
}

// The stage carries the switch, the page's range chosen.
const solar = build('solar');
let s = stageHtml(solar);
assert.match(s.extra, /data-casora-efspan="4h" class="hui-sg on"/);
assert.match(s.extra, /data-casora-efspan="24h" class="hui-sg"/);
assert.match(s.extra, /role="tablist"/);
assert.match(s.extra, /role="tab" aria-selected="true" data-casora-efspan="4h"/);
assert.ok(s.chart, 'chart slot on the stage');

// A tap on 24 h: every page shows 24 h, also the pages built before (their configs are rewritten).
F.setSpan('24h');
for (const focus of ['solar', 'home', 'battery', 'grid']) {
  assert.equal(F.span(focus), '24h');
  assert.equal(win._hpPlantCfg['ef3:' + MAIN[focus]].span, '24h', focus + ' config follows the choice');
  assert.equal(win._hpPlantCfg['ef3:' + MAIN[focus]].bucket, '15min');
  assert.equal(win._hpPlantCfg['ef3:' + MAIN[focus]].readout, 'hero', 'the rewritten config keeps its readout');
}
s = stageHtml(solar);
assert.match(s.extra, /data-casora-efspan="24h" class="hui-sg on"/);
// And 4 h for grid too (the reporter's case: grid and solar over the same time).
F.setSpan('4h');
build('grid');
assert.equal(win._hpPlantCfg['ef3:sensor.netz'].span, '4h');
assert.equal(win._hpPlantCfg['ef3:sensor.netz'].bucket, undefined, '4 h stays unaveraged');
assert.match(stageHtml(build('grid')).extra, /data-casora-efspan="4h" class="hui-sg on"/);
// A config changed elsewhere is put right when the stage draws.
win._hpPlantCfg['ef3:sensor.pv'].span = '24h';
stageHtml(solar);
assert.equal(win._hpPlantCfg['ef3:sensor.pv'].span, '4h');
// Unknown ranges are ignored.
F.setSpan('7d');
assert.equal(F.span('solar'), '4h');

// Classic popup (no v3): the switch is a live card inside the chart's plate; the title names the range.
v3 = false;
const mc = { styles: {}, custom_fields: {} };
const cl = build('battery', { metricCard: mc });
assert.equal(win._hpPlantCfg['sensor.akku'].span, '4h');
assert.equal(win._hpChartTitle('sensor.akku'), 'Akkuleistung · 4h · c1');
const spanCode = cl.fields.chart.card.extra.card.code;
const spanC = JSON.parse(spanCode.match(/"span", (\{.*\}), states, hass\)/)[1]);
const el = { shadowRoot: null, isConnected: true };
let shown = null;
win._hpPlantShow = (eid) => { shown = eid; return true; };
assert.match(F.sec.call(el, 'span', spanC, states, hass), /data-casora-efspan="4h" class="hui-sg on"/);
assert.equal(shown, null, 'first draw: the chart is mounted by the popup');
F.setSpan('24h');
assert.match(F.sec.call(el, 'span', spanC, states, hass), /data-casora-efspan="24h" class="hui-sg on"/);
assert.equal(shown, 'sensor.akku', 'after a switch the static chart is mounted again');
assert.equal(win._hpPlantCfg['sensor.akku'].span, '24h');

console.log('energy_focus_span: ok');
