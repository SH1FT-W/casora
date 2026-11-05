// @deckt: 02-devices.js#_casoraPrint,_casoraLaundry; 01-basis.js#_hpPlantShow
// Issue 130: the 3D printer popup (v3) makes its smart plug usable. The plug's power is the one Verlauf under the dial
// (richtlinien §7.1) with the range switch 24 Std. · 7 Tage · 30 Tage (each segment a chart key of the shared chart
// slot); the plug section (switch „Strom“ + power now, also in Soft) is the first list on the right. The phone reads
// dial → Verlauf → camera → lists.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.innerWidth = 1400;
globalThis.document = { querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, head: { appendChild: () => {} },
  getElementById: () => null, createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }), documentElement: { style: {} } };
globalThis.customElements = { get: () => null, define: () => {}, whenDefined: () => Promise.resolve() };
globalThis.addEventListener = () => {};
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8');
try { new Function(src('02-devices.js'))(); } catch (e) { /* the rest needs a DOM – H and the printer exist before */ }
const H = window._casoraHH, P = window._casoraPrint;
assert.ok(H && H.layout && P && P.popup, 'layout helper and printer popup loaded');

// Stubs for the parts that need a browser: Soft + v3 on, the shared UI blocks, the chart registry of 01-basis.js.
H.on = () => true;
window._casoraSoft = () => true;
window._casoraDish = Object.assign(window._casoraDish || {}, { v3: () => true });
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
window._casoraUI = Object.assign(window._casoraUI || {}, {
  settings: () => '<div>set</div>', empty: () => '<div>off</div>',
  segments: (items) => '<div class="hui-seg">' + items.map((it) => '<div class="hui-sg' + (it.active ? ' on' : '') + '"'
    + Object.keys(it.attrs || {}).map((k) => ' ' + k + '="' + esc(it.attrs[k]) + '"').join('') + '>' + esc(it.label) + '</div>').join('') + '</div>',
  group: (rows, label) => '<div>' + esc(label || '') + rows.map((r) => typeof r === 'string' ? r : '<div>' + esc(r.label) + ' ' + esc(r.value || '') + '</div>').join('') + '</div>',
  row: Object.assign((window._casoraUI || {}).row || {}, { toggle: (o) => '<div>' + esc(o.label) + (o.on ? ' on' : ' off') + (o.confirm ? ' confirm=' + esc(o.confirm) : '') + '</div>' }),
});
window._hpPlantCfg = {}; window._hpPlantMeta = {};
const SPAN = { '4h': '4 Std.', '24h': '24 Std.', '7d': '7 Tage', '30d': '30 Tage' };
window._hpChartCfg = (eid, label, span, color, height) => {
  window._hpPlantMeta[eid] = [label, span, color];
  return (window._hpPlantCfg[eid] = { type: 'custom:casora-chart', kind: 'line', span, height, series: [{ entity: eid, name: label, color }] });
};
window._hpChartTitle = (eid) => { const m = window._hpPlantMeta[eid]; return m ? m[0] + ' · ' + SPAN[m[1]] : ''; };
window._hpChartInit = () => {};
window._hpBarCfg = () => ({});
window._casoraLaundry.fetch = () => {};

const keysOf = (card) => {
  const g = ((card.styles || {}).grid || []).find((x) => x['grid-template-areas']);
  return g ? g['grid-template-areas'].replace(/"/g, '').split(/\s+/).filter(Boolean) : [];
};
const st = (s, a) => ({ state: s, attributes: a || {} });
const V = { entity_state: 'sensor.p_stage', entity_progress: 'sensor.p_progress', entity_task_name: 'sensor.p_task',
  plug_entity: 'switch.p_plug', entity_power: 'sensor.p_power' };
const states = { 'sensor.p_stage': st('idle'), 'sensor.p_progress': st('0'), 'sensor.p_task': st('Job'),
  'switch.p_plug': st('on'), 'sensor.p_power': st('42.5', { unit_of_measurement: 'W' }) };
const ent = { entity_id: 'sensor.p_stage' };
const hass = { states };
const c = P.resolve(ent, V, states, hass);
assert.equal(c.plug, 'switch.p_plug', 'resolve: plug from plug_entity');
assert.equal(c.power, 'sensor.p_power', 'resolve: power sensor');

const pop = P.popup(ent, V, states, hass);
const leftCard = pop.custom_fields.left.card;
const left = keysOf(leftCard), right = keysOf(pop.custom_fields.right.card);
// The power Verlauf under the dial, the plug right below it (owner: switch near the top; phone reads dial → Verlauf →
// plug → lists), nothing of it on the right.
assert.deepEqual(left, ['stage', 'chart', 'plug3'], 'printer v3: left = dial, power Verlauf, plug (' + left.join(',') + ')');
assert.ok(!right.includes('plug3'), 'printer v3: plug not on the right (' + right.join(',') + ')');
assert.ok(!right.includes('chart'), 'printer v3: no chart on the right');

// The range switch: three segments, each the key of a chart config with its own span, all on the plug's power.
const chartTpl = String(leftCard.custom_fields.chart);
// A template: it mounts the chart again when the column is drawn anew (popup balancing its columns).
assert.match(chartTpl, /^\[\[\[ if \(window\._hpStageChart\) window\._hpStageChart\(this, "sensor\.p_power"\); return /, 'Verlauf: remounts its chart');
const chart = JSON.parse(chartTpl.replace(/^.*?; return /, '').replace(/; \]\]\]$/, ''));
assert.match(chart, /hp-chart-slot/, 'Verlauf: the shared chart slot');
assert.match(chart, /onclick="window\._hpPlantTap/, 'Verlauf: a tap on a segment reaches the chart switch (L.wrap)');
const keys = [...chart.matchAll(/data-hp-metric="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"'));
assert.equal(keys.length, 3, 'Verlauf: three range segments (' + keys.join(',') + ')');
assert.deepEqual(keys.map((k) => window._hpPlantCfg[k] && window._hpPlantCfg[k].span), ['24h', '7d', '30d'], 'Verlauf: 24 Std. · 7 Tage · 30 Tage');
keys.forEach((k) => assert.equal(window._hpPlantCfg[k].series[0].entity, 'sensor.p_power', 'Verlauf: ' + k + ' draws the plug power'));
assert.match(chart, /class="hui-sg on" data-hp-metric="sensor\.p_power"/, 'Verlauf: 24 Std. chosen at first');
assert.match(chart, />24 Std\.<.*>7 Tage<.*>30 Tage</, 'Verlauf: segment words like the reading page');

// The plug section: the switch and the power now, also in Soft (the plug is the printer's only power meter).
const html = window._casoraLaundry.inner('plug', c, states);
assert.match(html, /Strom on/, 'plug section: on/off switch');
// Owner: switching the plug off asks first (a print would be ruined), while printing with „Trotzdem aus“.
assert.match(html, /Strom on confirm=/, 'plug section: switching off asks for confirmation');
assert.match(html, /Leistung/, 'plug section: power now, also in Soft');
assert.match(html, /Leistung 43 W/, 'plug section: the power value (whole watts from 10 W)');

// Without a plug (and no power sensor) nothing is added.
const V2 = Object.assign({}, V); delete V2.plug_entity; delete V2.entity_power;
const pop2 = P.popup(ent, V2, states, hass);
assert.ok(!keysOf(pop2.custom_fields.right.card).includes('plug3') && !keysOf(pop2.custom_fields.left.card).includes('plug3'), 'printer v3 without plug: no plug section');
assert.deepEqual(keysOf(pop2.custom_fields.left.card), ['stage'], 'printer v3 without power: no Verlauf');

// 01-basis.js: choosing a chart key marks its segment „on“ (segments carry data-hp-metric like rows).
const basis = src('01-basis.js');
assert.match(basis, /classList\.contains\('hui-sg'\)\) r\.classList\.toggle\('on', r\.dataset\.hpMetric === eid\)/, '_hpPlantShow: range segment follows the chart');
console.log('printer_plug: ok');
process.exit(0);
