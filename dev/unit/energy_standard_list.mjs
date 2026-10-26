// Energy audit (b7): the Standard look's energy popup lists consumers like the Casora look.
//   node dev/unit/energy_standard_list.mjs
// Before, casora_popup_energy (Standard, non-soft) listed only sensors above 0 W (#79: a room whose devices draw
// nothing showed no consumer at all), read kW sensors as W ("Heizlüfter 1,2 W", sorted below a 12 W light) and
// showed neither HA's individual devices nor the sources of HA's energy settings on Home (#44). Now the template asks
// _casoraSoftEnergy.build({ only: 'top' }) for the list card: a room lists every device (0 W too) with kW in watts,
// Home from HA's energy settings lists its sources as rows (no E1 flow in Standard) and HA's devices.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const core = rd('custom_components/casora/scripts/casora-core.js');
for (const [from, to] of [['// 06.10.2026: Leistung eines Raums', '})();'], ['// 07.10.2026: Größte Verbraucher', '// ── Performance mode']]) {
  const a = core.indexOf(from), b = core.indexOf(to, a);
  assert.ok(a > 0 && b > a, 'core part missing: ' + from);
  new Function(core.slice(a, b + (to === '})();' ? 5 : 0)))();
}
globalThis.document = { querySelector: () => null };
new Function(rd('custom_components/casora/scripts/local/00-finder.js').split('// ── Is this entity a plant?')[0])();
const groups = [];
window._casoraUI = {
  label: (t) => '[' + t + ']', group: (rows) => { groups.push(rows); return 'G' + rows.length; },
  more: (id, html, o) => 'M(' + (o && o.label) + ')', hero: () => 'H', soft: () => false,
};
window.casoraVisibleIdsNow = (ids) => ids;
new Function(rd('custom_components/casora/scripts/local/05-weich-mehr.js'))();
const E = window._casoraSoftEnergy;

const P = (v, u = 'W', name) => ({ state: String(v), attributes: { device_class: 'power', unit_of_measurement: u, friendly_name: name } });
// Runs the card's own template code (custom_fields.c) the way button-card does.
const render = (card, hass) => {
  const code = card.card.custom_fields.c.replace(/^\[\[\[\n/, '').replace(/\n\]\]\]$/, '');
  return new Function('states', 'hass', code)(hass.states, hass);
};

// 1. A room whose devices draw nothing, one in kW: every device listed, kW read as W, the drawing one first.
{
  const hass = { states: {
    'sensor.r_light': P(0, 'W', 'Deckenlicht Leistung'), 'sensor.r_cover': P(0, 'W', 'Rollladen Leistung'),
    'sensor.r_heater': P(1.2, 'kW', 'Heizlüfter Leistung'), 'sensor.r_lamp': P(12.5, 'W', 'Stehlampe Leistung'),
  }, entities: {}, devices: {}, areas: {} };
  const v = { power_entities: ['sensor.r_light', 'sensor.r_cover', 'sensor.r_heater', 'sensor.r_lamp'] };
  const card = E.build({ hass, states: hass.states, variables: v, powerId: null, only: 'top' });
  assert.ok(card && card.card && card.do_not_eval, 'a list card for the Standard look');
  const out = render(card, hass);
  assert.ok(out.startsWith('[In der Summe]'), out);
  const rows = groups.pop();
  assert.deepEqual(rows.map((r) => r.label), ['Heizlüfter', 'Stehlampe', 'Deckenlicht', 'Rollladen']);
  assert.equal(rows[0].value, '1,2 kW');
  assert.equal(rows[0].sub, '99 % der Summe');
  assert.deepEqual(rows.slice(2).map((r) => r.value), ['0 W', '0 W'], 'devices at 0 W stay in the list (#79)');
  // Nobody draws: still all of them.
  hass.states['sensor.r_heater'] = P(0, 'kW', 'Heizlüfter Leistung'); hass.states['sensor.r_lamp'] = P(0, 'W', 'Stehlampe Leistung');
  render(card, hass);
  assert.equal(groups.pop().length, 4, 'a room at 0 W lists every device');
}

// 2. Home from HA's energy settings: sources as rows (Standard has no E1 flow) and HA's individual devices.
{
  const hass = { states: {
    'sensor.h_grid': P(300), 'sensor.h_pv': P(1.5, 'kW'), 'sensor.h_bat': P(-600),
    'sensor.h_wm': P(2100, 'W', 'Waschmaschine Leistung'), 'sensor.h_wm_energy': { state: '3', attributes: { unit_of_measurement: 'kWh', device_class: 'energy' } },
  }, entities: {}, devices: {}, areas: {}, callWS: () => Promise.resolve({
    energy_sources: [{ type: 'grid', stat_rate: 'sensor.h_grid' }, { type: 'solar', stat_rate: 'sensor.h_pv' }, { type: 'battery', stat_rate: 'sensor.h_bat' }],
    device_consumption: [{ stat_consumption: 'sensor.h_wm_energy', stat_rate: 'sensor.h_wm', name: 'Waschmaschine' }],
  }) };
  await window.casoraEnergyPrefs.load(hass, true);
  const v = { power_entities: ['sensor.h_grid', 'sensor.h_pv', 'sensor.h_bat'], room_name: 'Zuhause' };
  const card = E.build({ hass, states: hass.states, variables: v, powerId: null, only: 'top' });
  assert.ok(card && card.card, 'Home gets a list card');
  groups.length = 0;
  const out = render(card, hass);
  assert.ok(out.startsWith('[Woher kommt der Strom]G3[Verbraucher]'), out);
  const src = groups.find((g) => g[0] && g[0].label === 'Netz'), cons = groups.find((g) => g[0] && g[0].label === 'Waschmaschine');
  assert.deepEqual(src.map((r) => [r.label, r.value]), [['Netz', '300 W'], ['Solar', '1,5 kW'], ['Akku', '600 W']]);
  assert.equal(src[2].sub, 'Lädt', 'HA sign: battery below 0 charges');
  assert.deepEqual(cons.map((r) => [r.label, r.value]), [['Waschmaschine', '2,1 kW']]);
  // The Casora look keeps the flow instead of the source rows.
  const soft = E.build({ hass, states: hass.states, variables: v, powerId: null, metricCard: null });
  assert.ok(soft, 'Casora look still builds');
}

// 3. Without a power sensor or list there is nothing to list (the template keeps its old path).
{
  const hass = { states: {}, entities: {}, devices: {}, areas: {} };
  assert.equal(E.build({ hass, states: {}, variables: {}, powerId: null, only: 'top' }), null);
}

// 4. The template asks the builder in the Standard look, in the tap and in the hold popup.
{
  const T = JSON.parse(rd('dashboards/casora/button_card_templates.json')).casora_popup_energy;
  for (const k of ['tap_action', 'hold_action']) {
    const c = T[k].casora_popup.content;
    assert.ok(/_casoraSoftEnergy\.build\(\{[^}]*only: 'top' \}\)/.test(c), k + ': Standard asks the builder for the list');
    assert.ok(/if \(_std\) add\('top', _std\);/.test(c), k + ': and shows it');
  }
}
console.log('ok energy_standard_list');
