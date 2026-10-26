// #69 (stalakerob): doors and windows the security badge finds by itself could be neither left out nor renamed.
// Settings › Doors and windows now has "Hidden" (contacts.hidden) and "Own name" (contacts.names).
// Expected: a hidden contact drops out of every group (found automatically or own groups), so the badge and
// its popups no longer count or list it; an own name is the row title in the contacts and alarm popups
// (plain and soft), the room stays below.
//   node dev/unit/contacts_hidden_names.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(src('custom_components/casora/scripts/local/00-finder.js'))();

const st = (dc, name) => ({ state: 'off', attributes: { device_class: dc, friendly_name: name } });
const hass = {
  states: { 'binary_sensor.front_door': st('door', 'Front door'), 'binary_sensor.shed_door': st('door', 'Shed door'),
    'binary_sensor.kitchen_window': st('window', 'Kitchen window') },
  entities: {}, devices: {}, areas: {},
};
const members = () => window.casoraContacts(hass).groups.flatMap((g) => g.members);

window.CASORA_SETTINGS = {};
assert.deepEqual(members().sort(), ['binary_sensor.front_door', 'binary_sensor.kitchen_window', 'binary_sensor.shed_door'], 'all found');
window.CASORA_SETTINGS = { contacts: { hidden: ['binary_sensor.shed_door'] } };
assert.deepEqual(members().sort(), ['binary_sensor.front_door', 'binary_sensor.kitchen_window'], 'hidden: left out');
assert.deepEqual(window.casoraHouseContacts(hass).sort(), ['binary_sensor.front_door', 'binary_sensor.kitchen_window'], 'Home badge counts it no more');

hass.states['binary_sensor.doors'] = { state: 'off', attributes: { device_class: 'door', entity_id: ['binary_sensor.front_door', 'binary_sensor.shed_door'] } };
window.CASORA_SETTINGS = { contacts: { groups: [{ id: 'binary_sensor.doors', label: 'Doors' }], hidden: ['binary_sensor.shed_door'] } };
assert.deepEqual(members(), ['binary_sensor.front_door'], 'own group: hidden left out too');

window.CASORA_SETTINGS = { contacts: { names: { 'binary_sensor.kitchen_window': '  Over the sink ' } } };
assert.equal(window.casoraContactName('binary_sensor.kitchen_window'), 'Over the sink');
assert.equal(window.casoraContactName('binary_sensor.front_door'), '');

// A door with two sensors (contact + tilt, merged into a combined sensor): the rows show the combined sensor.
// Hiding or naming either the combined sensor or the single contact works.
hass.states['binary_sensor.patio'] = st('door', 'Patio contact');
hass.states['binary_sensor.patio_tilt'] = st('window', 'Patio tilt');
hass.states['binary_sensor.patio_combined'] = { state: 'off', attributes: { device_class: 'door', friendly_name: 'Patio door' } };
delete hass.states['binary_sensor.doors'];
const merged = { 'binary_sensor.patio_combined': ['binary_sensor.patio', 'binary_sensor.patio_tilt'] };
window.CASORA_SETTINGS = { notify: { contact_merged: merged }, contacts: { hidden: ['binary_sensor.patio_combined'] } };
assert.ok(!members().includes('binary_sensor.patio'), 'hiding the combined sensor hides the door');
window.CASORA_SETTINGS = { notify: { contact_merged: merged }, contacts: { hidden: ['binary_sensor.patio'] } };
assert.ok(!members().includes('binary_sensor.patio'), 'hiding the single contact hides the door');
// The name lookup reads the last shared result (the root hass, as in the dashboard).
globalThis.document = { querySelector: () => ({ hass }) };
window.CASORA_SETTINGS = { notify: { contact_merged: merged }, contacts: { names: { 'binary_sensor.patio': 'Garden door' } } };
window.casoraContacts(hass);
assert.equal(window.casoraContactName('binary_sensor.patio_combined'), 'Garden door', 'name of the single contact shows on the combined row');
window.CASORA_SETTINGS = { notify: { contact_merged: merged }, contacts: { names: { 'binary_sensor.patio_combined': 'Garden door' } } };
assert.equal(window.casoraContactName('binary_sensor.patio_combined'), 'Garden door', 'name of the combined sensor');
globalThis.document = { querySelector: () => null };

// Popup rows: own name as title, the room below.
window.CASORA_SETTINGS = { contacts: { names: { 'binary_sensor.kitchen_window': 'Over the sink' } } };
const tpl = JSON.parse(src('dashboards/casora/button_card_templates.json'));
hass.areas = { ku: { name: 'Kitchen' } };
hass.devices = { d1: { area_id: 'ku', name: 'Kitchen window sensor' } };
hass.entities = { 'binary_sensor.kitchen_window': { device_id: 'd1' } };
const real = window.casoraContacts;
window.casoraContacts = () => ({ groups: [{ label: 'Contacts', members: ['binary_sensor.kitchen_window', 'binary_sensor.front_door'] }], sub: {}, excl: [] });
const rowsOf = (name, soft) => {
  let rows = null;
  window._casoraUI = { soft: () => soft, hero: () => '', group: (r) => { rows = (rows || []).concat(r); return ''; },
    col: () => '', cols: () => '', rows: () => '', label: () => '' };
  const body = tpl[name].tap_action.casora_popup.content.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  try { new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body)(hass.states, { entity_id: 'binary_sensor.front_door' }, {}, hass, {}, null); } catch (e) { /* the rest needs more */ }
  assert.ok(rows, name + ': rows built');
  return Object.fromEntries(rows.filter((r) => r.entity).map((r) => [r.entity, [r.label, r.sub]]));
};
for (const name of ['casora_popup_contacts', 'casora_popup_alarm']) {
  for (const soft of [true, false]) {
    const r = rowsOf(name, soft);
    assert.equal(r['binary_sensor.kitchen_window'][0], 'Over the sink', name + (soft ? ' soft' : '') + ': own name');
    if (soft) assert.equal(r['binary_sensor.kitchen_window'][1], 'Kitchen', name + ': room below');
    assert.notEqual(r['binary_sensor.front_door'][0], 'Over the sink', name + ': others unchanged');
  }
}
window.casoraContacts = real;
console.log('ok contacts_hidden_names');
