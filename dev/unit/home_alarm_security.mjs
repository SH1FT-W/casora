// V11 (owner, 14.11.2026): the house's alarm panel was in no security group – „Neu beginnen“ put the locks on Home's
// security badge, but an alarm only as a tile, so the family found no „Alarm scharf“ under Sicherheit. Now an
// alarm_control_panel goes into Home's security group (security_entity_N) like the locks; only where nothing is set
// (fillBadges), so the Studio's own pick wins and saved dashboards stay as they are.
//   node dev/unit/home_alarm_security.mjs
// @deckt: custom_components/casora/panel/casora-panel-basis.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)) };
new Function(src('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
// The assistant's suggestions (casora-panel-assist.js) reduced to locks and alarm panels with their room.
const TYPE = { lock: 'lock', alarm_control_panel: 'casora_alarm' };
window.casoraAssist = { suggest: (hass) => Object.keys(hass.states).filter((id) => TYPE[id.split('.')[0]])
  .map((id) => ({ id, type: TYPE[id.split('.')[0]], entity: id, name: id,
    room: hass.entities[id].area_id ? hass.areas[hass.entities[id].area_id].name : null, area: hass.entities[id].area_id })) };

function house(extra) {
  const h = { states: {}, entities: {}, devices: {}, areas: { fl: { area_id: 'fl', name: 'Flur' }, ku: { area_id: 'ku', name: 'Küche' } } };
  const add = (eid, state, attributes, area = null) => {
    h.entities[eid] = { entity_id: eid, device_id: null, area_id: area, platform: 'demo' };
    h.states[eid] = { entity_id: eid, state, attributes };
  };
  add('lock.demo_haustuer', 'locked', { friendly_name: 'Haustür' }, 'fl');
  add('alarm_control_panel.demo_alarm', 'disarmed', { friendly_name: 'Alarmanlage' });
  (extra || (() => {}))(add);
  return h;
}
const secOf = (v) => Array.from({ length: 8 }, (_, i) => v['security_entity_' + (i + 1)]).filter(Boolean);
const fill = (h, homeVars = {}) => {
  const t = { name: 'Home', home: true, vars: homeVars };
  B.fillBadges(h, [t, { name: 'Flur', vars: {} }, { name: 'Küche', vars: {} }]);
  return t.vars;
};

// 1. An alarm panel without a room: on Home's security group, next to the locks (was: locks only).
{
  const v = fill(house());
  assert.deepEqual(v.security_locks, ['lock.demo_haustuer'], 'locks as before');
  assert.deepEqual(secOf(v), ['alarm_control_panel.demo_alarm'], 'alarm on Home\'s security group');
  console.log('ok alarm without a room on Home');
}
// 2. An alarm panel in a room counts for the house too.
{
  const v = fill(house((add) => add('alarm_control_panel.demo_garage', 'armed_away', { friendly_name: 'Garage' }, 'ku')));
  assert.deepEqual(secOf(v).sort(), ['alarm_control_panel.demo_alarm', 'alarm_control_panel.demo_garage']);
  console.log('ok alarm in a room on Home');
}
// 3. The user's own pick wins: a Home security group that lists anything stays as it is.
{
  const own = { security_entity_1: 'lock.demo_haustuer' };
  const v = fill(house(), own);
  assert.deepEqual(secOf(v), ['lock.demo_haustuer'], 'own pick kept');
  assert.equal(v.security_locks, undefined, 'nothing added');
  const off = fill(house(), { show_security: false });
  assert.deepEqual(secOf(off), [], 'switched-off security stays empty');
  console.log('ok own pick wins');
}
// 4. No alarm panel: no slot.
{
  const h = house();
  delete h.states['alarm_control_panel.demo_alarm']; delete h.entities['alarm_control_panel.demo_alarm'];
  assert.deepEqual(secOf(fill(h)), []);
  console.log('ok no alarm, no slot');
}
console.log('ok home_alarm_security');
