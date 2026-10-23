// The "why" line in the Studio (#44): when Casora picked a value on its own, a hint under the field says why,
// so a wrong pick shows ("Netzbezugs-Spitze heute" as the house was only found by guessing).
//   node dev/unit/auto_why.mjs
// - casoraBasis.housePowerWhy agrees with housePower: the sensor it picks has a reason, the reason's stage is the
//   first stage that takes any sensor, the word is what the name (or else the entity ID) contains; a sensor the
//   search never takes (peak, period value, inverter, a plug's total) has none.
// - casoraBasis.homeEnergyWhy per marker: "prefs" (energy settings), "house" (name search), 2 (sum of the rooms);
//   the user's own choice (false) and an unmarked Home get no line.
// - casoraFieldWhy (tile fields the device finder fills): same device, same room, the plug; integration names.
// - Every text the Studio can show has its German translation, and the panel shows the lines as hints.
// All IDs made up.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: noop, head: { appendChild: noop }, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(noop), get: () => null, define: noop };
globalThis.addEventListener = noop;
globalThis.location = { pathname: '/casora/home' };
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/scripts/local/00-finder.js'))();
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
const types = src('custom_components/casora/panel/casora-panel-types.js');
const e0 = types.indexOf('// Editor helpers for Casora tiles');
new Function(types.slice(e0, types.indexOf('\n})();', e0) + 6))();
assert.equal(typeof window.casoraFieldWhy, 'function', 'casoraFieldWhy loaded');

function house() {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, name] of [['wz', 'Wohnzimmer'], ['ku', 'Küche'], ['hw', 'Hauswirtschaft']]) h.areas[id] = { area_id: id, name };
  const dev = (id, area, name, extra) => { h.devices[id] = { id, area_id: area, name, ...(extra || {}) }; };
  const ent = (eid, { dev: d = null, area = null, name, state = '0', dc = 'power', platform } = {}) => {
    h.entities[eid] = { entity_id: eid, device_id: d, area_id: area, platform: platform || (d ? 'zha' : 'template') };
    h.states[eid] = { entity_id: eid, state, attributes: { device_class: dc, unit_of_measurement: 'W', friendly_name: name || eid } };
  };
  return { h, dev, ent };
}
const STAGES = ['house', 'total', 'grid'];
// housePower rebuilt from the reasons: the first sensor (registry order) of the lowest stage.
const fromWhy = (h) => {
  const all = Object.keys(h.states).map((id) => [id, B.housePowerWhy(h, id)]).filter(([, w]) => w);
  if (!all.length) return null;
  const low = Math.min(...all.map(([, w]) => STAGES.indexOf(w.stage)));
  return all.find(([, w]) => STAGES.indexOf(w.stage) === low)[0];
};
const agree = (h, msg) => {
  const pick = B.housePower(h);
  assert.equal(fromWhy(h), pick, msg + ': reasons rebuild the pick');
  if (pick) assert.ok(B.housePowerWhy(h, pick), msg + ': the pick has a reason');
  return pick;
};

// 1. Issue #44 (Westerloer): PV statistics with a peak, base load and surplus, an SMA inverter and a Tasmota reader
//    whose name says nothing ("Wirkleistung (W)") – the entity ID has the meter word.
{
  const { h, dev, ent } = house();
  dev('d_pv', null, 'PV-Anlage');
  ent('sensor.pv_anlage_netzbezugs_spitze_heute', { dev: 'd_pv', name: 'Netzbezugs-Spitze heute', state: '1.7', platform: 'pv_stats' });
  ent('sensor.pv_anlage_grundlast', { dev: 'd_pv', name: 'Grundlast', state: '0.3', platform: 'pv_stats' });
  dev('d_inv', null, 'STP 8000TL-20');
  ent('sensor.stp_8000tl_20_grid_power', { dev: 'd_inv', name: 'STP 8000TL-20 Grid power', state: '2400', platform: 'sma' });
  dev('d_ir', null, 'Lesekopf');
  ent('sensor.stromzahler_emh_power_curr', { dev: 'd_ir', name: 'Wirkleistung (W)', state: '424', platform: 'tasmota' });
  assert.equal(agree(h, '#44'), 'sensor.stromzahler_emh_power_curr');
  assert.equal(B.housePowerWhy(h, 'sensor.pv_anlage_netzbezugs_spitze_heute'), null, 'a peak is never the house');
  assert.equal(B.housePowerWhy(h, 'sensor.stp_8000tl_20_grid_power'), null, "the inverter's output is never the house");
  assert.deepEqual(B.housePowerWhy(h, 'sensor.stromzahler_emh_power_curr'), { stage: 'grid', word: 'stromzahler', in: 'id' });
  const V = { energy_power_entity: 'sensor.stromzahler_emh_power_curr', casora_energy_auto: 'house' };
  assert.deepEqual(B.homeEnergyWhy(h, V, 'energy_power_entity'),
    { text: 'Chosen automatically: the entity ID contains “{word}”.', word: 'stromzahler' });
  // The old pick (before the fix) as Casora's: the line says what it went by, so the user sees it is a peak value.
  assert.equal(B.homeEnergyWhy(h, { energy_power_entity: 'sensor.pv_anlage_netzbezugs_spitze_heute', casora_energy_auto: 'house' },
    'energy_power_entity').text, 'Chosen automatically by its name.', 'a pick the search no longer takes: generic line');
  console.log('ok #44 house');
}

// 2. Name stages: a house consumption name before a grid name; the friendly name's word as written.
{
  const { h, dev, ent } = house();
  ent('sensor.netz', { name: 'Netzbezug', state: '300' });
  ent('sensor.verbrauch', { name: 'Hausverbrauch aktuell', state: '500' });
  assert.equal(agree(h, 'stages'), 'sensor.verbrauch');
  assert.deepEqual(B.housePowerWhy(h, 'sensor.verbrauch'), { stage: 'house', word: 'Hausverbrauch', in: 'name' });
  assert.deepEqual(B.housePowerWhy(h, 'sensor.netz'), { stage: 'grid', word: 'Netzbezug', in: 'name' });
  assert.deepEqual(B.homeEnergyWhy(h, { energy_power_entity: 'sensor.netz', casora_energy_auto: 'house' }, 'energy_power_entity'),
    { text: 'Chosen automatically: the name contains “{word}”.', word: 'Netzbezug' });
  // A three phase meter's total: stage "total"; a plug's total in a room: no reason.
  dev('d_em', 'hw', 'Shelly 3EM', { model: 'Shelly 3EM' });
  ent('sensor.em_total', { dev: 'd_em', name: 'Shelly 3EM Total power', state: '700', platform: 'shelly' });
  ent('sensor.em_phase_a', { dev: 'd_em', name: 'Shelly 3EM Phase A power', state: '200', platform: 'shelly' });
  dev('d_tv', 'wz', 'Fernseher');
  ent('sensor.tv_total', { dev: 'd_tv', name: 'Fernseher Total power', state: '60' });
  ent('switch.tv', { dev: 'd_tv', name: 'Fernseher', dc: null, state: 'on' });
  assert.equal(B.housePowerWhy(h, 'sensor.em_total').stage, 'total');
  assert.equal(B.housePowerWhy(h, 'sensor.tv_total'), null, "a plug's total is no house");
  assert.equal(agree(h, 'stages with meter'), 'sensor.verbrauch');
  delete h.states['sensor.verbrauch'];
  assert.equal(agree(h, 'meter total before grid'), 'sensor.em_total');
  assert.deepEqual(B.homeEnergyWhy(h, { energy_power_entity: 'sensor.em_total', casora_energy_auto: 'house' }, 'energy_power_entity'),
    { text: 'Chosen automatically: the total of a power meter.' });
  delete h.states['sensor.em_total'];
  delete h.states['sensor.netz'];
  assert.equal(agree(h, 'nothing left'), null);
  console.log('ok stages');
}

// 3. homeEnergyWhy per marker and field.
{
  const { h, ent } = house();
  ent('sensor.netz', { name: 'Netzbezug', state: '300' });
  const why = (V, k) => { const w = B.homeEnergyWhy(h, V, k); return w ? w.text : null; };
  assert.equal(why({ energy_power_entity: 'sensor.netz', casora_energy_auto: 'prefs' }, 'energy_power_entity'),
    'Chosen automatically: your grid power from the Energy dashboard.');
  assert.equal(why({ energy_entities: ['sensor.a', 'sensor.b'], casora_energy_auto: 'prefs' }, 'energy_entities'),
    'Chosen automatically: grid, solar and battery from the Energy dashboard, added up.');
  assert.match(why({ energy_entities: ['sensor.a'], casora_energy_auto: 2 }, 'energy_entities'),
    /^Chosen automatically: the sum of the rooms – no sensor for the whole house found\./);
  // The user's choice, an unmarked Home, an empty field, a hidden badge: no line.
  assert.equal(why({ energy_power_entity: 'sensor.netz', casora_energy_auto: false }, 'energy_power_entity'), null);
  assert.equal(why({ energy_power_entity: 'sensor.netz' }, 'energy_power_entity'), null);
  assert.equal(why({ energy_entities: ['sensor.a'], casora_energy_auto: false }, 'energy_entities'), null);
  assert.equal(why({ casora_energy_auto: 2 }, 'energy_entities'), null);
  assert.equal(why({ casora_energy_auto: 'house' }, 'energy_power_entity'), null);
  assert.equal(why({ energy_power_entity: 'sensor.netz', casora_energy_auto: 'house', show_energy: false }, 'energy_power_entity'), null);
  // A sensor beside the list: the sensor counts, the list gets no "sum" line.
  assert.equal(why({ energy_power_entity: 'sensor.netz', energy_entities: ['sensor.a'], casora_energy_auto: 2 }, 'energy_entities'), null);
  // The "house" line under the sensor only, never under the list.
  assert.equal(why({ energy_power_entity: 'sensor.netz', casora_energy_auto: 'house' }, 'energy_entities'), null);
  console.log('ok markers');
}

// 4. Tile fields: same device (also robot and dock), same room, the plug; integration names.
{
  const { h, dev, ent } = house();
  dev('d_wm', 'hw', 'Waschmaschine');
  ent('sensor.wm_state', { dev: 'd_wm', name: 'Waschmaschine Status', dc: null, state: 'run', platform: 'miele' });
  ent('sensor.wm_left', { dev: 'd_wm', name: 'Waschmaschine Restzeit', dc: 'duration', state: '30', platform: 'miele' });
  dev('d_dock', 'hw', 'Dock', { via_device_id: 'd_wm' });
  ent('sensor.dock_power', { dev: 'd_dock', name: 'Dock', state: '3', platform: 'home_connect_alt' });
  dev('d_room', 'hw', 'Lüfter');
  ent('sensor.room_power', { dev: 'd_room', name: 'Lüfter', state: '9', platform: 'some_thing' });
  dev('d_far', 'ku', 'Kühlschrank');
  ent('sensor.far_power', { dev: 'd_far', name: 'Kühlschrank', state: '80', platform: 'ha_washdata' });
  const CD = window.casoraDevice;
  let got = null;
  window.casoraDevice = { ...CD, map: () => ({ x: got }), companionPlug: () => ({ switch: got }) };
  const tile = { entity: 'sensor.wm_state' };
  const f = { key: 'x', domains: ['sensor'], find: { dc: 'power' } };
  const at = (id, fld) => { got = id; return window.casoraFieldWhy(fld || f, tile, h); };
  assert.deepEqual(at('sensor.wm_left'), { id: 'sensor.wm_left', text: 'Found automatically on the same device ({source}).', source: 'Miele' });
  assert.deepEqual(at('sensor.dock_power'), { id: 'sensor.dock_power', text: 'Found automatically on the same device ({source}).',
    source: 'Home Connect Alt' }, 'a linked device (dock) counts as the same device');
  assert.deepEqual(at('sensor.room_power'), { id: 'sensor.room_power', text: 'Found automatically in the same room ({source}).', source: 'Some Thing' });
  assert.deepEqual(at('sensor.far_power'), { id: 'sensor.far_power', text: 'Found automatically ({source}).', source: 'WashData' });
  assert.equal(at('sensor.far_power', { key: 'plug_entity', domains: ['switch'], find: { plug: 'switch' } }).text,
    'Found automatically: the plug named after this device ({source}).');
  assert.equal(at(null), null, 'nothing found, no line');
  // HA's own integration title wins when it is loaded.
  h.localize = (k) => (k === 'component.miele.title' ? 'Miele Cloud' : '');
  assert.equal(at('sensor.wm_left').source, 'Miele Cloud');
  window.casoraDevice = CD;
  console.log('ok tile fields');
}

// 5. Every text has its German translation; the panel shows both lines as hints, translated before {word}/{source}.
{
  const de = JSON.parse(src('custom_components/casora/translations/panel/de.json')).exact;
  const basis = src('custom_components/casora/panel/casora-panel-basis.js');
  const texts = [...basis.matchAll(/text: "(Chosen automatically[^"]*)"/g)].map((m) => m[1]);
  assert.ok(texts.length >= 7, 'energy texts found');
  for (const w of ['', ' on the same device', ' in the same room', ': the plug named after this device'])
    for (const s of [' ({source}).', '.']) texts.push('Found automatically' + w + s);
  for (const t of texts) assert.ok(de[t], 'German for: ' + t);
  for (const t of texts) assert.ok(!/\bSie\b/.test(de[t]), 'du form: ' + t);
  const panel = src('custom_components/casora/panel/casora-panel.js');
  assert.match(panel, /B\.homeEnergyWhy\(this\._hass, room\.variables, f\.key\)/, 'badge fields ask for the reason');
  assert.equal((panel.match(/addHint\(\);\n\s+addWhy\(\);/g) || []).length, 2, 'both energy fields (sensor and list) show the line');
  assert.match(panel, /trLabel\(w\.text\)\.replace\("\{word\}"/, 'energy line translated before the word goes in');
  assert.match(panel, /window\.casoraFieldWhy\(f, tile, this\._hass\)/, 'tile fields ask for the reason');
  assert.match(panel, /trLabel\(why\.text\)\.replace\("\{source\}"/, 'tile line translated before the name goes in');
  console.log('ok texts');
}
console.log('auto_why: ok');
