// Owner, 01.11.2026: the single thermostat popup (v3) shows the temperature history under the dial, like the floor
// heating room – from the tile's room sensor, else the thermostat's own current_temperature. Groups keep their popup
// (03-popups.js _casoraFbhPopup), and without any reading there is no empty chart.
//   node dev/unit/thermostat_chart_v3.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const pop = rd('custom_components/casora/scripts/local/03-popups.js');
const a = pop.indexOf('  window._casoraThermoChart = function');
assert.ok(a > 0, 'helper exists');
const helper = pop.slice(a, pop.indexOf('  F.v3 = function', a));

const made = [];
const mkWindow = () => {
  const window = {
    _casoraHH: { on: () => true, chart: (title) => '<div class="hp-ct">' + title + '</div><div class="hp-chart-slot"></div>' },
    _hpChartCfg: (eid, label, span, color, height) => { const c = { span, height, series: [{ entity: eid, name: label, color }] }; made.push(c); return c; },
    _hpChartTitle: () => 'Temperatur · 24 Std.', _hpChartInit: () => {},
    _casoraUI: { soft: () => true, stage: () => '', esc: (x) => x },
  };
  new Function('window', 'num', 'TU', 'plate', helper)(window, (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; }, () => '°C', '');
  return window;
};

const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const run = (code, entity, states, variables = {}) => {
  const body = code.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  return new Function('states', 'entity', 'hass', 'variables', 'window', 'localStorage', body)(states, entity, { entities: {}, areas: {} }, variables, mkWindow(), undefined);
};
const bodyOf = (card) => card.custom_fields && card.custom_fields.body;
const trv = { entity_id: 'climate.example_room', state: 'heat', attributes: { current_temperature: 20.5, temperature: 21, hvac_modes: ['off', 'heat'] } };

for (const k of ['tap_action', 'hold_action']) {
  const code = T.casora_thermostat[k].casora_popup.content;
  made.length = 0;
  const out = run(code, trv, { [trv.entity_id]: trv });
  const at = out.cards.findIndex((c) => /hp-chart-slot/.test(bodyOf(c) || ''));
  assert.ok(at > 0, k + ': a chart card');
  assert.equal(at, out.cards.length - 2, k + ': under the dial, above the rooms/settings part');
  assert.deepEqual([made[0].series[0].entity, made[0].series[0].attribute, made[0].height], ['climate.example_room', 'current_temperature', 120],
    k + ': the thermostat\'s own reading');

  made.length = 0;
  const S = { [trv.entity_id]: trv, 'sensor.example_room_temp': { state: '21.2', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } } };
  run(code, trv, S, { temp_sensor: 'sensor.example_room_temp' });
  assert.equal(made[0].series[0].entity, 'sensor.example_room_temp', k + ': the room sensor first');
  assert.equal(made[0].series[0].attribute, undefined);

  const bare = { ...trv, attributes: { temperature: 21, hvac_modes: ['off', 'heat'] } };
  const out2 = run(code, bare, { [bare.entity_id]: bare });
  assert.ok(!out2.cards.some((c) => /hp-chart-slot/.test(bodyOf(c) || '')), k + ': no reading, no chart');
}
console.log('thermostat_chart_v3: ok');
