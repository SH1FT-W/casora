// Energie-Badge je Raum: Summe aller Geräte, ehrlich gerechnet (06.10.2026).
//   node dev/unit/raum_energie_summe.mjs
// - Geräte zählen nach device_id, nie nach Namen (zwei gleich benannte Spots = zwei Verbraucher).
// - Mehrere Messungen je Gerät, wenn sie Verschiedenes messen (Last-Kanal + powercalc-Eigenverbrauch).
// - Altfeld energy_power_entity = Liste mit einem Eintrag; stehen beide da, gilt die Liste.
// - energy_exclude bleibt beim Neu-Erzeugen draußen; von Hand veränderte Listen bleiben.
// - Summe: nur Leistung, kW → W, unknown/unavailable übersprungen und gezählt, energy_parent nicht doppelt.
// Alle IDs erfunden.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const panel = src('custom_components/casora/panel/casora-panel.js');
const from = panel.indexOf('const ENERGY_VAR = ');
const fillRoomEnergy = new Function(panel.slice(from, panel.indexOf('\nfunction deriveEnergyRooms(', from)) + '\nreturn fillRoomEnergy;')();
const core = src('custom_components/casora/scripts/casora-core.js');
const c0 = core.indexOf('// 06.10.2026: Leistung eines Raums');
new Function(core.slice(c0, core.indexOf('})();', c0) + 5))();
const B = window.casoraBasis;

function house() {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, name] of [['ku', 'Küche'], ['bad', 'Bad'], ['wz', 'Wohnzimmer']]) h.areas[id] = { area_id: id, name };
  const dev = (id, area, name) => { h.devices[id] = { id, area_id: area, name }; };
  const ent = (eid, { dev: d = null, area = null, dc = 'power', unit = 'W', name, state = '0', platform } = {}) => {
    h.entities[eid] = { entity_id: eid, device_id: d, area_id: area, platform: platform || (d ? 'zha' : 'template') };
    h.states[eid] = { entity_id: eid, state, attributes: { device_class: dc, unit_of_measurement: unit, friendly_name: name || eid } };
  };
  // Küche: zwei Spots, die als Gerät gleich heißen; eine Jalousie am Zweikanal-Shelly mit
  // Motor-Messkanal (Plattform shelly) und Eigenverbrauch (powercalc, *_device_power).
  dev('d_spot_a', 'ku', 'Spot GU10'); dev('d_spot_b', 'ku', 'Spot GU10');
  ent('sensor.spot_a_power', { dev: 'd_spot_a', name: 'Spot A', state: '4.5' });
  ent('sensor.spot_b_power', { dev: 'd_spot_b', name: 'Spot B', state: '4.5' });
  dev('d_cover', 'ku', 'Jalousie Beispiel');
  ent('sensor.jalousie_beispiel_power', { dev: 'd_cover', name: 'Jalousie Beispiel', state: '0', platform: 'shelly' });
  ent('sensor.shelly_beispiel_device_power', { dev: 'd_cover', name: 'Shelly Beispiel Eigenverbrauch', state: '0.68', platform: 'powercalc' });
  // Bad: zwei gleich benannte Spots, einer gerade nicht erreichbar.
  dev('d_spot_c', 'bad', 'Spot GU10'); dev('d_spot_d', 'bad', 'Spot GU10');
  ent('sensor.spot_c_power', { dev: 'd_spot_c', name: 'Spot C', state: '5' });
  ent('sensor.spot_d_power', { dev: 'd_spot_d', name: 'Spot D', state: 'unavailable' });
  // Bad: Jalousie, deren powercalc-Eigenverbrauch weder Gerät noch Bereich hat – nur source_entity.
  dev('d_cover_bad', 'bad', 'Jalousie Bad Beispiel');
  h.entities['cover.jalousie_bad_beispiel'] = { entity_id: 'cover.jalousie_bad_beispiel', device_id: 'd_cover_bad', platform: 'shelly' };
  h.states['cover.jalousie_bad_beispiel'] = { entity_id: 'cover.jalousie_bad_beispiel', state: 'open', attributes: {} };
  ent('sensor.jalousie_bad_beispiel_power', { dev: 'd_cover_bad', name: 'Jalousie Bad', state: '0', platform: 'shelly' });
  ent('sensor.shelly_bad_beispiel_device_power', { name: 'Shelly Bad Eigenverbrauch', state: '0.68', platform: 'powercalc' });
  h.states['sensor.shelly_bad_beispiel_device_power'].attributes.source_entity = 'cover.jalousie_bad_beispiel';
  // Wohnzimmer: Spots-Kanal (aus, 0 W), Fernseher 30 W, Stehlampe 0,009 kW.
  dev('d_sp', 'wz', 'Spots Kanal'); dev('d_tv', 'wz', 'Fernseher'); dev('d_lamp', 'wz', 'Stehlampe');
  ent('sensor.spots_kanal_power', { dev: 'd_sp', name: 'Spots Kanal', state: '0' });
  ent('sensor.fernseher_power', { dev: 'd_tv', name: 'Fernseher', state: '30' });
  ent('sensor.fernseher_power_mittel', { dev: 'd_tv', name: 'Fernseher Leistung Mittel', state: '28' });
  ent('sensor.stehlampe_power', { dev: 'd_lamp', unit: 'kW', name: 'Stehlampe', state: '0.009' });
  return h;
}
const hass = house();
const rooms = (list) => [{ name: 'Home', path: 'home', variables: {} }].concat(list);
const sorted = (a) => a.slice().sort();

// 1. Gleichnamige Geräte: beide Spots (Küche und Bad).
{
  const t = [{ name: 'Küche', vars: {} }, { name: 'Bad', vars: {} }];
  B.fillBadges(hass, t);
  assert.ok(t[0].vars.energy_entities.includes('sensor.spot_a_power') && t[0].vars.energy_entities.includes('sensor.spot_b_power'), 'Küche: beide Spots');
  assert.ok(t[1].vars.energy_entities.includes('sensor.spot_c_power') && t[1].vars.energy_entities.includes('sensor.spot_d_power'), 'Bad: beide Spots');
  assert.ok(t[1].vars.energy_entities.includes('sensor.shelly_bad_beispiel_device_power'), 'powercalc ohne Bereich: Raum der Quelle');
  assert.equal(t[1].vars.energy_entities.length, 4);
  // 2. Jalousie: Messkanal und Eigenverbrauch.
  assert.ok(t[0].vars.energy_entities.includes('sensor.jalousie_beispiel_power'), 'Jalousie: Motor-Messkanal');
  assert.ok(t[0].vars.energy_entities.includes('sensor.shelly_beispiel_device_power'), 'Jalousie: Eigenverbrauch (powercalc)');
  assert.equal(t[0].vars.energy_entities.length, 4);
}

// 6. Robuste Summe.
{
  const S = hass.states;
  const kitchen = B.energyProbe(hass, 'Küche').list;
  const r = window._casoraPowerSum({ energy_entities: kitchen }, S);
  assert.equal(Math.round(r.sum * 100) / 100, 9.68, 'Küche: 4,5 + 4,5 + 0 + 0,68 W');
  const bad = window._casoraPowerSum({ energy_entities: ['sensor.spot_c_power', 'sensor.spot_d_power'] }, S);
  assert.equal(bad.sum, 5, 'nicht erreichbar zählt nicht mit');
  assert.equal(bad.skipped, 1, '… wird aber gezählt');
  assert.equal(bad.items.find((x) => x.id === 'sensor.spot_d_power').skip, 'off');
  const kw = window._casoraPowerSum({ energy_entities: ['sensor.stehlampe_power', 'sensor.fernseher_power'] }, S);
  assert.equal(kw.sum, 39, 'kW → W');
  const S2 = { ...S, 'sensor.zaehler_energie': { state: '12', attributes: { device_class: 'energy', unit_of_measurement: 'kWh' } } };
  const np = window._casoraPowerSum({ energy_entities: ['sensor.fernseher_power', 'sensor.zaehler_energie'] }, S2);
  assert.equal(np.sum, 30, 'kWh ist keine Leistung');
  assert.equal(np.items[1].skip, 'nopower');
  const dup = window._casoraPowerSum({ energy_entities: ['sensor.fernseher_power', 'sensor.fernseher_power'] }, S);
  assert.equal(dup.sum, 30, 'doppelte entity_id zählt einmal');
  const ex = window._casoraPowerSum({ energy_entities: ['sensor.fernseher_power', 'sensor.spots_kanal_power'], energy_exclude: ['sensor.fernseher_power'] }, S);
  assert.deepEqual(ex.ids, ['sensor.spots_kanal_power'], 'ausgeschlossen zählt nie');
  const par = window._casoraPowerSum({ energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'],
    energy_parent: { 'sensor.stehlampe_power': 'sensor.fernseher_power' } }, S);
  assert.equal(par.sum, 30, 'Gerät hinter der Messsteckdose zählt nicht doppelt');
  assert.equal(par.items[1].skip, 'parent');
  const none = window._casoraPowerSum({ energy_entities: ['sensor.spot_d_power'] }, S);
  assert.ok(Number.isNaN(none.sum), 'nichts messbar: kein Wert (Strich), nicht 0 W');
  // Altfeld allein = Liste mit einem Eintrag; beide da = die Liste gilt.
  assert.deepEqual(window._casoraPowerIds({ energy_power_entity: 'sensor.spots_kanal_power' }), ['sensor.spots_kanal_power']);
  assert.deepEqual(window._casoraPowerIds({ energy_power_entity: 'sensor.spots_kanal_power', energy_entities: ['sensor.fernseher_power'] }), ['sensor.fernseher_power']);
}

// 3. Raum nur mit Altfeld (bis 1.0.11 automatisch eingetragen) → beim Laden im Studio die ganze Liste.
{
  const R = rooms([{ name: 'Wohnzimmer', path: 'wz', variables: { energy_power_entity: 'sensor.spots_kanal_power', casora_energy_auto: true } }]);
  assert.equal(fillRoomEnergy(hass, R), 1);
  const V = R[1].variables;
  assert.equal(V.energy_power_entity, undefined, 'Altfeld weg');
  assert.deepEqual(sorted(V.energy_entities), ['sensor.fernseher_power', 'sensor.spots_kanal_power', 'sensor.stehlampe_power']);
  assert.equal(window._casoraPowerSum(V, hass.states).sum, 39, 'zeigt 39 W statt 0 W');
  assert.equal(V.casora_energy_auto, 2);
  // Auch wenn das Altfeld ein Sensor ist, den die Automatik heute nicht mehr wählt (z. B. ein Mittelwert).
  const R2 = rooms([{ name: 'Wohnzimmer', path: 'wz', variables: { energy_power_entity: 'sensor.fernseher_power_mittel', casora_energy_auto: true } }]);
  fillRoomEnergy(hass, R2);
  assert.deepEqual(sorted(R2[1].variables.energy_entities), ['sensor.fernseher_power', 'sensor.spots_kanal_power', 'sensor.stehlampe_power']);
  // Von Hand gesetztes Altfeld ohne weitere Geräte desselben Geräts: wird Liste mit einem Eintrag.
  const M = rooms([{ name: 'Bad', path: 'bad', variables: { energy_power_entity: 'sensor.spot_c_power', casora_energy_sum: true } }]);
  fillRoomEnergy(hass, M);
  assert.deepEqual(M[1].variables.energy_entities, ['sensor.spot_c_power']);
}

// 7. Unveränderte alte Automatik-Liste (gleichnamige Spots als eins) wird neu gewählt.
{
  const old = B.energyProbe(hass, 'Küche').old;
  assert.equal(old.filter((id) => /spot_/.test(id)).length, 1, 'bis 1.0.11: nur ein Spot');
  const R = rooms([{ name: 'Küche', path: 'ku', variables: { energy_entities: old.slice(), casora_energy_auto: true } }]);
  assert.equal(fillRoomEnergy(hass, R), 1);
  assert.equal(R[1].variables.energy_entities.length, 4, 'jetzt beide Spots und beide Jalousie-Messungen');
}

// 4. Ausgeschlossen bleibt draußen – auch beim erneuten automatischen Erzeugen.
{
  const R = rooms([{ name: 'Küche', path: 'ku', variables: { energy_entities: ['sensor.spot_a_power', 'sensor.spot_b_power', 'sensor.jalousie_beispiel_power'],
    energy_exclude: ['sensor.shelly_beispiel_device_power'], casora_energy_auto: 2 } }]);
  fillRoomEnergy(hass, R);
  assert.ok(!R[1].variables.energy_entities.includes('sensor.shelly_beispiel_device_power'), 'Ausgeschlossener kommt nicht wieder');
  assert.equal(fillRoomEnergy(hass, R), 0, 'nichts Neues');
  // Neuer Raum mit Ausschlussliste: auch die Erstbefüllung lässt ihn draußen.
  const N = rooms([{ name: 'Küche', path: 'ku', variables: { energy_exclude: ['sensor.spot_b_power'] } }]);
  fillRoomEnergy(hass, N);
  assert.ok(!N[1].variables.energy_entities.includes('sensor.spot_b_power'));
  assert.equal(N[1].variables.casora_energy_auto, 2);
  // Alte Automatik-Liste unverändert, mit Ausschluss: neu gewählt ohne den Ausgeschlossenen.
  const O = rooms([{ name: 'Bad', path: 'bad', variables: { energy_entities: B.energyProbe(hass, 'Bad').old, energy_exclude: ['sensor.spot_d_power'], casora_energy_auto: true } }]);
  fillRoomEnergy(hass, O);
  assert.equal(O[1].variables.energy_entities.length, 3);
  assert.ok(!O[1].variables.energy_entities.includes('sensor.spot_d_power'));
}

// 5. Von Hand angepasste Listen bleiben unverändert.
{
  const own = ['sensor.fernseher_power'];
  const R = rooms([
    { name: 'Wohnzimmer', path: 'wz', variables: { energy_entities: own.slice() } },
    { name: 'Küche', path: 'ku', variables: { energy_entities: ['sensor.spot_a_power'], casora_energy_auto: true } },
    { name: 'Bad', path: 'bad', variables: { energy_entities: ['sensor.spot_c_power'], casora_energy_auto: false } },
  ]);
  assert.equal(fillRoomEnergy(hass, R), 0);
  assert.deepEqual(R[1].variables.energy_entities, own, 'eigene Liste ohne Markierung');
  assert.deepEqual(R[2].variables.energy_entities, ['sensor.spot_a_power'], 'alte Automatik-Liste, von Hand gekürzt');
  assert.equal(R[2].variables.casora_energy_auto, false, '… gilt ab jetzt als eigene Liste');
  assert.deepEqual(R[3].variables.energy_entities, ['sensor.spot_c_power']);
  assert.equal(fillRoomEnergy(hass, R), 0, 'auch beim nächsten Laden');
}

// Vorlagen: casora_room gibt die Liste (ohne Ausgeschlossene) ans Badge; die Liste gilt vor dem Altfeld.
{
  const T = JSON.parse(src('dashboards/casora/button_card_templates.json'));
  const body = (v) => String(v).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const rc = T.casora_room.custom_fields.badges.card.cards.find((c) => c.template === 'casora_badge_energy_group');
  const ev = (expr, variables) => new Function('states', 'hass', 'variables', body(expr))(hass.states, hass, variables);
  const both = { energy_power_entity: 'sensor.spots_kanal_power', energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power', 'sensor.fernseher_power'],
    energy_exclude: ['sensor.stehlampe_power'] };
  assert.deepEqual(ev(rc.variables.power_entities, both), ['sensor.fernseher_power'], 'ohne Ausgeschlossene und Doppelte');
  assert.equal(ev(rc.variables.power_entity, both), undefined, 'Altfeld zählt nicht, wenn die Liste da ist');
  assert.equal(ev(rc.variables.entity_power, both), undefined);
  assert.equal(ev(rc.variables.home_power_entity, both), undefined);
  assert.equal(ev(rc.entity, both), undefined);
  assert.equal(ev(rc.variables.power_entity, { energy_power_entity: 'sensor.spots_kanal_power' }), 'sensor.spots_kanal_power', 'Altfeld allein zählt weiter');
  // Badge-Text: Summe über _casoraPowerSum (unavailable übersprungen, kW → W).
  const nameFn = new Function('states', 'hass', 'variables', body(T.casora_badge_energy_group.name));
  const sub = (vars) => /badge-sub">([^<]*)</.exec(nameFn(hass.states, { locale: { language: 'de' } }, vars))[1];
  assert.equal(sub({ power_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power', 'sensor.spot_d_power'] }), '39 W');
  assert.equal(sub({ power_entities: ['sensor.spot_d_power'] }), '–', 'nichts messbar: Strich');
  assert.equal(sub({ power_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power'], power_parent: { 'sensor.stehlampe_power': 'sensor.fernseher_power' } }), '30 W', 'energy_parent');
  // Handy-Raumbadges folgen casora_room.
  const mc = T.casora_mobile_sensor_chips.custom_fields.rooms_row.card.cards.find((c) => c.template === 'casora_badge_energy_group');
  assert.ok(/energy_exclude/.test(mc.variables.power_entities) && /energy_parent/.test(mc.variables.power_parent), 'Handy wie Desktop');
}

// Weich-Popup: Summanden mit Einzelwerten, Übersprungene markiert.
{
  const rowsOut = [];
  window._casoraUI = { label: (t) => '[' + t + ']', group: (rows) => { rowsOut.push(rows); return 'G'; }, more: () => '', hero: (o) => 'H:' + o.value + '|' + (o.sub || '') };
  window.addEventListener = () => {};
  new Function(src('custom_components/casora/scripts/local/05-weich-mehr.js'))();
  const C = { sum: { energy_entities: ['sensor.fernseher_power', 'sensor.stehlampe_power', 'sensor.spot_d_power'] } };
  const out = window._casoraSoftEnergy.sec('parts', C, hass.states, hass);
  assert.ok(out.startsWith('[In der Summe · 2 von 3]'), out);
  const rows = rowsOut.pop();
  assert.deepEqual(rows.map((r) => r.value), ['30 W', '9 W', 'Nicht erreichbar']);
  assert.equal(rows[2].sub, 'Nicht in der Summe');
  const hero = window._casoraSoftEnergy.sec('hero', C, hass.states, hass);
  assert.ok(hero.startsWith('H:39 W|1 Gerät ohne Wert'), hero);
}
console.log('ok raum_energie_summe');
