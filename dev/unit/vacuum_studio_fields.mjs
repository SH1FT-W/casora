// Studio fields of the vacuum tile (find.vac) use the card's own field table (casoraDevice.vacuumFields), so a
// key added for one integration (Dreame, issue #33) also fills the Studio's "Automatic: …". All entities invented.
//   node dev/unit/vacuum_studio_fields.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const window = {};
new Function('window', 'document', read('scripts/local/00-finder.js'))(window, { querySelector: () => null });
const CD = window.casoraDevice;
assert.ok(CD && CD.vacuumFields, 'casoraDevice.vacuumFields');

// Every Studio vacuum field names a field of the table.
const panel = read('panel/casora-panel.js');
const studio = [...panel.matchAll(/find: \{ vac: "([A-Za-z]+)" \}/g)].map((m) => m[1]);
assert.deepEqual(studio, ['status', 'room', 'progress', 'area', 'battery', 'dnd', 'drying'], 'Studio vacuum fields');
studio.forEach((n) => assert.ok(CD.vacuumFields[n], 'table knows ' + n));

// The card no longer keeps its own copy.
assert.doesNotMatch(read('scripts/local/02-devices.js'), /var VFIND = \{/, 'no second vacuum table in 02-devices.js');

// Lookup as the Studio does it (casora-panel-types.js found(): map with siblings): Dreame keys and the dock.
const hass = { devices: { robot: { id: 'robot', name: 'Robot' }, dock: { id: 'dock', name: 'Robot Dock', via_device_id: 'robot' } },
  entities: {}, states: {} };
const reg = (dev, domain, key, state) => {
  const id = `${domain}.example_${dev}_${key}`;
  hass.entities[id] = { entity_id: id, device_id: dev, translation_key: key };
  hass.states[id] = { entity_id: id, state, attributes: {} };
  return id;
};
hass.entities['vacuum.example_robot'] = { entity_id: 'vacuum.example_robot', device_id: 'robot' };
hass.states['vacuum.example_robot'] = { entity_id: 'vacuum.example_robot', state: 'docked', attributes: {} };
const pct = reg('robot', 'sensor', 'cleaning_progress', '40');
const dnd = reg('robot', 'switch', 'dnd', 'on');
const area = reg('robot', 'sensor', 'cleaned_area', '12');
const find = (n) => CD.map(hass, 'vacuum.example_robot', { x: CD.vacuumFields[n] }, { siblings: true }).x || null;
assert.equal(find('progress'), pct, 'Dreame progress');
assert.equal(find('dnd'), dnd, 'Dreame do-not-disturb');
assert.equal(find('area'), area, 'Dreame cleaned area');
assert.equal(find('room'), null, 'nothing invented');
console.log('ok vacuum_studio_fields');
