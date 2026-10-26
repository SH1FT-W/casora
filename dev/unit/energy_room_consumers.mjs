// #79: the consumer list of a room's energy popup must not depend on what the other consumers draw.
//   node dev/unit/energy_room_consumers.mjs
// Rule: every consumer of the room is listed, whatever it draws: drawing ones by power, then the ones at 0 W in the
// list's order (pale icon), then power sensors measured in the room's HA area that the list does not add up (pale,
// "Nicht in der Summe"), last the ones without a value. Five, the rest behind "Alle N anzeigen". A room with a room
// sensor and no list (Casora's own finder) lists all devices of its area too, also at 0 W; the house keeps "Top N"
// (only drawing ones). #78: the phone's start page energy badge reads the desktop Home's list and opens the popup when
// there is no energy tile to filter. All ids made up.
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
const groups = [];
window._casoraUI = {
  label: (t) => '[' + t + ']', group: (rows) => { groups.push(rows); return 'G' + rows.length; },
  more: (id, html, o) => 'M(' + o.label + ')', hero: () => 'H',
};
window.casoraVisibleIdsNow = (ids) => ids;
new Function(rd('custom_components/casora/scripts/local/05-weich-mehr.js'))();
const E = window._casoraSoftEnergy;
for (const f of ['consOrder', 'consRank', 'listArea', 'roomExtras']) assert.equal(typeof E[f], 'function', f + ' missing');

// A bathroom like in #79: cover and light, each with its own power sensor; a plug that is not in the list.
const hass = { states: {}, entities: {}, devices: {}, areas: { bad: { area_id: 'bad', name: 'Bad' }, buero: { area_id: 'buero', name: 'Büro' } } };
const dev = (id, area) => { hass.devices[id] = { id, area_id: area, name: id }; };
const ent = (eid, d, state, name, extra = {}) => {
  hass.entities[eid] = { entity_id: eid, device_id: d, platform: extra.platform || 'shelly', area_id: extra.area || null };
  hass.states[eid] = { entity_id: eid, state: String(state), attributes: { device_class: 'power', unit_of_measurement: 'W', friendly_name: name, ...(extra.attrs || {}) } };
};
dev('d_cover', 'bad'); ent('sensor.cover_bad_power', 'd_cover', 0, 'Rollladen Bad Leistung');
dev('d_light', 'bad'); ent('sensor.light_bad_power', 'd_light', 0, 'Badlicht Leistung');
dev('d_fan', 'bad'); ent('sensor.fan_bad_power', 'd_fan', 0, 'Lüfter Bad Leistung');
dev('d_plug', 'bad'); ent('sensor.plug_bad_power', 'd_plug', 0, 'Steckdose Bad Leistung');
dev('d_desk', 'buero'); ent('sensor.desk_power', 'd_desk', 45, 'Schreibtisch Leistung');
const S = hass.states;
const set = (id, w) => { S[id] = { ...S[id], state: String(w) }; };
const labels = () => groups.pop().map((r) => r.label);

// 1. The order alone: drawing by power, 0 W in list order, outside the sum, without a value.
{
  const o = E.consOrder([{ id: 'a', w: 0 }, { id: 'b', w: 12 }, { id: 'c', w: null, skip: 'off' }, { id: 'd', w: 0 },
    { id: 'e', w: 3, out: true }, { id: 'f', w: 40 }, { id: 'g', w: 9, out: true }]);
  assert.deepEqual(o.map((x) => x.id), ['f', 'b', 'a', 'd', 'g', 'e', 'c']);
  assert.deepEqual(o.map(E.consRank), [0, 0, 1, 1, 2, 2, 3]);
}

// 2. Room with a list (cover + light, fan left out): nobody draws → both listed, the plug as "not added up".
const C = { sum: { energy_entities: ['sensor.cover_bad_power', 'sensor.light_bad_power'] }, area: 'bad', exclude: ['sensor.fan_bad_power'] };
{
  const out = E.sec('parts', C, S, hass);
  assert.ok(out.startsWith('[In der Summe · 2 von 3]G3'), out);
  const rows = groups.pop();
  assert.deepEqual(rows.map((r) => r.entity), ['sensor.cover_bad_power', 'sensor.light_bad_power', 'sensor.plug_bad_power']);
  assert.deepEqual(rows.map((r) => r.value), ['0 W', '0 W', '0 W']);
  assert.ok(rows.every((r) => /dim/.test(r.iconTone || '')), 'nothing draws: every icon pale');
  assert.equal(rows[2].sub, 'Nicht in der Summe');
  assert.ok(!rows.some((r) => r.entity === 'sensor.fan_bad_power'), 'left out (energy_exclude) stays out');
}
// 3. One consumer draws: the same consumers, the drawing one first with its share; nobody disappears.
{
  set('sensor.light_bad_power', 18);
  E.sec('parts', C, S, hass);
  const rows = groups.pop();
  assert.deepEqual(rows.map((r) => r.entity), ['sensor.light_bad_power', 'sensor.cover_bad_power', 'sensor.plug_bad_power']);
  assert.deepEqual(rows.map((r) => r.value), ['18 W', '0 W', '0 W']);
  assert.equal(rows[0].sub, '100 % der Summe');
  assert.equal(rows[0].iconTone, null, 'drawing: icon in colour');
  set('sensor.cover_bad_power', 'unavailable');
  E.sec('parts', C, S, hass);
  assert.deepEqual(labels(), ['Badlicht Leistung', 'Steckdose Bad Leistung', 'Rollladen Bad Leistung'].map((x) => x.replace(/ Leistung$/, '')),
    'unreachable: still listed, at the end');
  set('sensor.cover_bad_power', 0); set('sensor.light_bad_power', 0);
}
// 4. Without an area (Home's sum over several rooms): only the list, no further consumers.
{
  assert.equal(E.listArea(hass, {}, ['sensor.cover_bad_power', 'sensor.desk_power']), null, 'several areas: none');
  assert.equal(E.listArea(hass, {}, ['sensor.cover_bad_power', 'sensor.light_bad_power']), 'bad');
  assert.equal(E.listArea(hass, { room_name: 'Büro' }, ['sensor.cover_bad_power']), 'buero', 'room named like an area first');
  E.sec('parts', { sum: C.sum }, S, hass);
  assert.equal(groups.pop().length, 2);
}
// 5. A device already in the list (a second channel or powercalc) is not listed again.
{
  ent('sensor.light_bad_selfuse', 'd_light', 0.5, 'Badlicht Eigenverbrauch', { platform: 'powercalc' });
  E.sec('parts', C, S, hass);
  assert.ok(!groups.pop().some((r) => r.entity === 'sensor.light_bad_selfuse'));
}
// 6. Room sensor without a list: Casora's finder lists every device of the area, also at 0 W, in the same order.
{
  const A = { auto: { area: 'bad', zero: true, max: 99, exclude: [] }, home: null };
  let out = E.sec('auto', A, S, hass);
  assert.ok(out.startsWith('[Verbraucher]G'), out);
  const ids0 = groups.pop().map((r) => r.entity).sort();
  set('sensor.plug_bad_power', 230);
  out = E.sec('auto', A, S, hass);
  const rows = groups.pop();
  assert.deepEqual(rows.map((r) => r.entity).sort(), ids0, 'same consumers whether one draws or not');
  assert.equal(rows[0].entity, 'sensor.plug_bad_power');
  assert.ok(rows.slice(1).every((r) => /dim/.test(r.iconTone || '')));
  set('sensor.plug_bad_power', 0);
  // The house keeps its top list: only drawing ones.
  set('sensor.desk_power', 45);
  E.sec('auto', { auto: { exclude: [], max: 5 } }, S, hass);
  assert.deepEqual(groups.pop().map((r) => r.entity), ['sensor.desk_power']);
}
// 7. More than five: five, the rest behind "Alle N anzeigen".
{
  for (let i = 0; i < 4; i++) { dev('d_x' + i, 'bad'); ent('sensor.x' + i + '_power', 'd_x' + i, i, 'Gerät ' + i); }
  const out = E.sec('parts', C, S, hass);
  assert.match(out, /^\[In der Summe · 2 von 7\]G5<div[^>]*>M\(Alle 7 anzeigen\)<\/div>$/);
}
// 8. The finder itself: zero keeps 0 W and devices without a value, the default stays "above 0 W".
{
  const pick = window._casoraAutoConsumers;
  set('sensor.cover_bad_power', 'unavailable');
  const z = pick(hass, S, { area: 'bad', zero: true, max: 99 }).top;
  assert.ok(z.some((x) => x.id === 'sensor.cover_bad_power' && x.w === null), 'unreachable kept with zero');
  assert.equal(z[z.length - 1].w, null, 'without a value last');
  assert.ok(!pick(hass, S, { area: 'bad', max: 99 }).top.some((x) => !(x.w > 0)), 'default: only above 0 W');
  // powercalc without an area of its own: the area of its source.
  hass.entities['light.bad'] = { entity_id: 'light.bad', device_id: 'd_light', platform: 'shelly' };
  ent('sensor.light_bad_virtual', null, 7, 'Badlicht virtuell', { platform: 'powercalc', attrs: { source_entity: 'light.bad' } });
  assert.ok(pick(hass, S, { area: 'bad', zero: true, max: 99 }).top.some((x) => x.id === 'sensor.light_bad_virtual'));
}

// 9. Template: the room badge hands the left-out sensors to the popup (desktop and phone).
{
  const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
  const body = (v) => String(v).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const rc = T.casora_room.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_energy_group');
  const ev = (expr, variables) => new Function('states', 'hass', 'variables', body(expr))(S, hass, variables);
  assert.deepEqual(ev(rc.variables.power_exclude, { energy_exclude: ['sensor.fan_bad_power', ''] }), ['sensor.fan_bad_power']);
  assert.equal(ev(rc.variables.power_exclude, {}), undefined);
  const mc = T.casora_mobile_sensor_chips.custom_fields.rooms_row.card.cards.find((c) => c.template === 'casora_badge_energy_group');
  assert.ok(/energy_exclude/.test(mc.variables.power_exclude), 'phone like desktop');
  // #78: the phone's start page badge reads the desktop Home's list (casora_hv) and opens the popup when the
  // start page has no energy tile to filter (it said "Hier gibt es noch keine Geräte").
  const hb = T.casora_mobile_filter_badges.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_energy_group');
  const hv = { casora_hv: { energy_entities: ['sensor.grid', 'sensor.pv', 'sensor.bat', 'sensor.old'], energy_exclude: ['sensor.old'], energy_power_entity: 'sensor.total' } };
  assert.deepEqual(ev(hb.variables.power_entities, hv), ['sensor.grid', 'sensor.pv', 'sensor.bat']);
  assert.equal(ev(hb.variables.power_entity, hv), undefined, 'the list counts before the sensor');
  assert.equal(ev(hb.variables.power_entity, { casora_hv: { energy_power_entity: 'sensor.total' } }), 'sensor.total');
  const act = (has) => { window._casoraFilterHas = () => has; window.casoraPopupAction = () => 'fire-dom-event:popup';
    return new Function('states', 'hass', 'variables', body(hb.tap_action.action))(S, hass, {}); };
  assert.equal(act(false), 'fire-dom-event:popup', 'no energy tile: popup');
  assert.equal(act(true), 'fire-dom-event', 'energy tiles: filter as before');
  assert.equal(act(null), 'fire-dom-event', 'config unknown: filter as before');
  // The helper: a casora_energy tile (or mobile_filter_category energy) anywhere in the views.
  delete window._casoraFilterHas;
  window.CASORA_FILTER_CATEGORIES = { casora_energy: 'energy', casora_light: 'lights' };
  const basis = rd('custom_components/casora/scripts/local/01-basis.js');
  const a = basis.indexOf('/* #78: does the open dashboard'), b = basis.indexOf('/* Szenenfarbe aus dem Studio', a);
  new Function(basis.slice(a, b))();
  let cfg = { views: [{ sections: [{ cards: [{ template: 'casora_light' }] }] }] };
  window._casoraLovelaceCfg = () => cfg;
  assert.equal(window._casoraFilterHas('energy'), false);
  cfg = { views: [{ cards: [{ type: 'vertical-stack', cards: [{ template: ['casora_energy'] }] }] }] };
  assert.equal(window._casoraFilterHas('energy'), true);
  cfg = { views: [{ cards: [{ template: 'casora_light', variables: { mobile_filter_category: 'energy' } }] }] };
  assert.equal(window._casoraFilterHas('energy'), true);
  window._casoraLovelaceCfg = () => null;
  assert.equal(window._casoraFilterHas('energy'), null);
}
console.log('ok energy_room_consumers');
