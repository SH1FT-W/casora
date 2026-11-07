// Security badge rework (07.11.2026): Home's „Türen“/„Fenster“ sub-badges (and group helpers) said „Geöffnet“ for one
// open door as for all of them. Expected (wortliste, as groups say it elsewhere): „Alle geschlossen“, „2 geöffnet“,
// „Alle geöffnet“, only tilted ones „2 gekippt“; a single contact keeps „Geöffnet“/„Geschlossen“; offline as before.
//   node dev/unit/security_group_counts.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_badge_contact_group
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
window.CASORA_SETTINGS = {};
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const fn = (src) => new Function('states', 'entity', 'user', 'hass', 'variables', src.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
const nameOf = fn(T.casora_badge_contact_group.name);
const st = (state, dc, extra) => ({ state, attributes: { device_class: dc, ...(extra || {}) } });
const D = ['binary_sensor.d1', 'binary_sensor.d2', 'binary_sensor.d3'];
const sub = (states, ids) => {
  const hass = { states, entities: {}, devices: {}, areas: {} };
  const h = nameOf(states, { entity_id: ids[0], ...states[ids[0]] }, {}, hass, { contacts: ids, contacts_kind: 'door', label: 'Türen', enabled: true });
  return (h.match(/class="badge-sub">([^<]*)</) || [])[1];
};
const doors = (...s) => Object.fromEntries(D.map((id, i) => [id, st(s[i], 'door')]));
assert.equal(sub(doors('off', 'off', 'off'), D), 'Alle geschlossen');
assert.equal(sub(doors('on', 'off', 'off'), D), '1 geöffnet');
assert.equal(sub(doors('on', 'on', 'off'), D), '2 geöffnet');
assert.equal(sub(doors('on', 'on', 'on'), D), 'Alle geöffnet');
const tilted = { ...doors('on', 'on', 'off'), [D[0]]: st('on', 'window', { tilt: true }), [D[1]]: st('on', 'window', { tilt: true }) };
assert.equal(sub(tilted, D), '2 gekippt', 'only tilted ones');
assert.equal(sub({ ...tilted, [D[2]]: st('on', 'door') }, D), '3 geöffnet', 'tilted and open: all counted as open, not „Alle geöffnet“');
assert.equal(sub(doors('on'), [D[0]]), 'Geöffnet', 'a single contact keeps its word');
assert.equal(sub(doors('off'), [D[0]]), 'Geschlossen');
assert.equal(sub({ ...doors('off', 'off', 'off'), [D[1]]: st('unavailable', 'door') }, D), '1 Sensor nicht erreichbar', 'a closed group with a silent member says so');
console.log('ok security_group_counts');
