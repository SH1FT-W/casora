// Owner, 06.11.2026: „Heizung hat gar kein Diagramm“. The v3 heating popups (floor heating and thermostat group:
// _casoraFbhPopup, 03-popups.js) show the temperature history under the dial like the single thermostat
// (richtlinien §7.1: Verlauf 120 high, temperature orange, readout in its own head):
//   - the group: the house sensor set on the tile, else the group's own reading (current_temperature, a climate
//     group's mean) – before, the v3 group had no chart at all;
//   - a room: its sensor, else the thermostat's current_temperature – before, a room without a sensor had none.
// Without any reading there is no empty chart.
//   node dev/unit/heating_chart_v3.mjs
// @deckt: custom_components/casora/scripts/local/03-popups.js#_casoraFbhPopup
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraFbh) return;');
const b = src.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'floor heating module found');

const run = (entity, states, variables = {}) => {
  const made = [], inits = [];
  let lay = null;
  const w = {
    addEventListener() {},
    _casoraSoft: () => true,
    _casoraUI: { soft: () => true, stage: () => 'STAGE', tokens: { font: 'x', ink: '#000', ink2: '#111', ink3: '#222' }, group: () => 'G', hero: () => 'H' },
    _casoraHH: { on: () => true, chart: (t) => '<div class="hp-ct">' + t + '</div><div class="hp-chart-slot"></div>',
      layout: (o) => { lay = o; return { type: 'layout' }; }, more: () => '', moreCard: () => ({}) },
    _hpChartCfg: (eid, label, span, color, height) => { const c = { span, height, series: [{ entity: eid, name: label, color }] }; made.push(c); return c; },
    _hpChartTitle: () => 'Temperatur · 24 Std.', _hpChartInit: (k) => inits.push(k), _hpSmooth: () => {},
  };
  const doc = { querySelector: () => ({ hass: { config: { unit_system: { temperature: '°C' } } } }) };
  new Function('window', 'document', 'localStorage', src.slice(a, b + 6))(w, doc, { getItem: () => null });
  w._casoraFbhPopup(entity, variables, states, { entities: {}, devices: {}, areas: {} });
  return { lay, made, inits };
};
const room = (id, cur) => ({ entity_id: id, state: 'heat', attributes: Object.assign({ temperature: 21, hvac_modes: ['off', 'heat'] }, cur == null ? {} : { current_temperature: cur }) });

// Group without a house sensor: the group's own reading, under the dial (left), 120 high, orange step.
{
  const g = { entity_id: 'climate.example_house', state: 'heat', attributes: { member_entities: ['climate.example_a', 'climate.example_b'], current_temperature: 20.8, temperature: 21 } };
  const S = { [g.entity_id]: g, 'climate.example_a': room('climate.example_a', 20.5), 'climate.example_b': room('climate.example_b', 21.1) };
  const r = run(g, S);
  assert.ok(r.lay && r.lay.fields.chart, 'group v3: a Verlauf');
  assert.deepEqual(r.lay.left, ['chart'], 'group v3: under the dial');
  assert.deepEqual([r.made[0].series[0].entity, r.made[0].series[0].attribute, r.made[0].height, r.made[0].series[0].color],
    ['climate.example_house', 'current_temperature', 120, 'c2'], 'group v3: the group\'s reading');
  assert.deepEqual(r.inits, ['climate.example_house'], 'chart mounted');

  // With a house sensor on the tile: that one.
  const S2 = Object.assign({}, S, { 'sensor.example_house_temp': { state: '20.9', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } } });
  const r2 = run(g, S2, { temp_sensor: 'sensor.example_house_temp' });
  assert.equal(r2.made[0].series[0].entity, 'sensor.example_house_temp', 'group v3: the house sensor first');
  assert.equal(r2.made[0].series[0].attribute, undefined);

  // No reading anywhere: no chart, no empty plate.
  const bare = { ...g, attributes: { member_entities: g.attributes.member_entities, temperature: 21 } };
  const r3 = run(bare, Object.assign({}, S, { [g.entity_id]: bare }));
  assert.ok(!r3.lay.fields.chart, 'group v3 without a reading: no chart');
  assert.deepEqual(r3.lay.left, [], 'nothing under the dial');
}
// One room without a sensor of its own: the thermostat's current_temperature.
{
  const t = room('climate.example_room', 20.4);
  const r = run(t, { [t.entity_id]: t });
  assert.ok(r.lay.fields.chart, 'room v3: a Verlauf');
  assert.deepEqual([r.made[0].series[0].entity, r.made[0].series[0].attribute, r.made[0].height],
    ['climate.example_room', 'current_temperature', 120], 'room v3: the thermostat\'s reading');
  const bare = room('climate.example_room', null);
  assert.ok(!run(bare, { [bare.entity_id]: bare }).lay.fields.chart, 'room v3 without a reading: no chart');
}
console.log('heating_chart_v3: ok');
