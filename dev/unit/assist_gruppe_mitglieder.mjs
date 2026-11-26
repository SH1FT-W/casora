// Device assistant (Prüfrunde u01-01): a light group on a tile already covers its members. Lamps inside a group the
// dashboard shows (light.* or group.* with attributes.entity_id, nested too) are not suggested as missing. Made-up entities.
//   node dev/unit/assist_gruppe_mitglieder.mjs
// @deckt: custom_components/casora/panel/casora-panel-assist.js#usedEntities
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
new Function(src('panel/casora-panel-assist.js'))();
const A = window.casoraAssist;

const st = (attrs = {}) => ({ state: 'on', attributes: attrs });
const hass = {
  states: {
    'light.qa_terrace': st({ entity_id: ['light.qa_spot', 'light.qa_strip', 'group.qa_inner'] }),
    'group.qa_inner': st({ entity_id: ['light.qa_spotlights', 'light.qa_terrace'] }),
    'light.qa_spot': st(), 'light.qa_strip': st(), 'light.qa_spotlights': st(),
    'light.qa_alone': st(),
  },
  entities: {
    'light.qa_spot': { device_id: 'd1' }, 'light.qa_strip': { device_id: 'd2' },
    'light.qa_spotlights': { device_id: 'd3' }, 'light.qa_alone': { device_id: 'd4' },
  },
  devices: {
    d1: { id: 'd1', name: 'Spot', area_id: 'terr' }, d2: { id: 'd2', name: 'Strip', area_id: 'terr' },
    d3: { id: 'd3', name: 'Spotlights', area_id: 'terr' }, d4: { id: 'd4', name: 'Alone', area_id: 'terr' },
  },
  areas: { terr: { name: 'Terrasse' } },
};
const rooms = [{ name: 'Terrasse', tiles: [{ type: 'light', entity: 'light.qa_terrace' }] }];
const used = A.usedEntities(rooms, hass);
for (const id of ['light.qa_terrace', 'light.qa_spot', 'light.qa_strip', 'group.qa_inner', 'light.qa_spotlights'])
  assert.ok(used.has(id), id + ' counts as used');
assert.ok(!used.has('light.qa_alone'), 'a lamp outside the group stays free');
const sugg = A.suggest(hass, rooms, [{ id: 'light', label: 'Light' }]);
assert.deepEqual(sugg.map((s) => s.entity), ['light.qa_alone'], 'only the lamp outside the group is suggested');
console.log('ok assist_gruppe_mitglieder');
