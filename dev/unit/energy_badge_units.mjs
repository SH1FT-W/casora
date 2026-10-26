// Energy audit (b7): the energy badges read every power unit and sign alike.
//   node dev/unit/energy_badge_units.mjs
// Before: a negative value (a grid meter as house sensor while feeding in, a battery charging) stayed in watts
// ("-1500 W") while the popup said "1,5 kW"; the sub-badge's colour compared a kW sensor's raw number with the
// watt thresholds (1,5 kW stayed green). Expected: kW from 1000 W either sign, colour thresholds in watts.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
globalThis.window = globalThis;
const run = (expr, ctx) => new Function('states', 'entity', 'variables', 'hass', 'user',
  expr.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(ctx.states, ctx.entity, ctx.variables, ctx.hass || { locale: { language: 'de' } }, {});
const P = (v, u = 'W') => ({ entity_id: 'sensor.x', state: String(v), attributes: { device_class: 'power', unit_of_measurement: u } });
const sub = (html) => (/<div class="badge-sub">([^<]*)<\/div>/.exec(html) || [])[1] || null;

// House / room badge (casora_badge_energy_group).
{
  const G = T.casora_badge_energy_group;
  const val = (st, unit = 'W') => sub(run(G.name, { states: { 'sensor.h': P(st, unit) }, variables: { power_entity: 'sensor.h' } }));
  assert.equal(val(850), '850 W');
  assert.equal(val(1.85, 'kW'), '1,9 kW');
  assert.equal(val(-1500), '-1,5 kW', 'feed-in in kW like the popup');
  assert.equal(val(-0.4, 'kW'), '-400 W');
  // Sum of a list in mixed units.
  window._casoraPowerSum = null;
  const s = sub(run(G.name, { states: { 'sensor.a': P(1.2, 'kW'), 'sensor.b': P(12.5) }, variables: { power_entities: ['sensor.a', 'sensor.b'] } }));
  assert.equal(s, '1,2 kW');
  const colour = (st, unit) => run(G.styles.card.find((c) => c['--casora-badge-icon-color'])['--casora-badge-icon-color'],
    { states: { 'sensor.h': P(st, unit) }, variables: { power_entity: 'sensor.h' } });
  assert.ok(/very-high/.test(colour(3.2, 'kW')), 'house badge: 3,2 kW is very high');
}

// Sub-badge (casora_badge_energy).
{
  const B = T.casora_badge_energy;
  const val = (st, unit = 'W') => sub(run(B.name, { states: {}, entity: P(st, unit), variables: { unit: 'auto' } }));
  assert.equal(val(2400), '2,4 kW');
  assert.equal(val(-2500), '-2,5 kW', 'battery charging / feed-in in kW');
  assert.equal(val(-600), '-600 W');
  const colour = (st, unit) => run(B.styles.card.find((c) => c['--casora-badge-icon-color'])['--casora-badge-icon-color'],
    { states: { 'sensor.x': P(st, unit) }, entity: P(st, unit), variables: { entity_power: 'sensor.x' } });
  assert.ok(/high-color/.test(colour(1.5, 'kW')) && !/very/.test(colour(1.5, 'kW')), '1,5 kW is high: ' + colour(1.5, 'kW'));
  assert.ok(/high-color/.test(colour(1500, 'W')), '1500 W is high');
  assert.ok(/low-color/.test(colour(150, 'W')), '150 W is low');
}
// Phone start page (#78): the energy badge hands the popup the desktop Home's sensor as entity_power, like the
// desktop room badge does; without it a single house sensor opened an empty popup ("—").
{
  const M = T.casora_mobile_filter_badges.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_energy_group');
  const ep = (hv) => run(M.variables.entity_power, { states: {}, variables: { casora_hv: hv } });
  assert.equal(ep({ energy_power_entity: 'sensor.meter' }), 'sensor.meter');
  assert.equal(ep({ energy_power_entity: 'sensor.meter', energy_entities: ['sensor.a', 'sensor.b'] }), undefined, 'a list counts before the sensor');
}
console.log('ok energy_badge_units');
