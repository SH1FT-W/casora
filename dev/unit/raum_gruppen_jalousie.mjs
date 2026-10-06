// B-COVER: Handy-Raumseite nach Kategorien – Jalousien/Rollläden stehen nicht unter „Klima“,
// Garagen- und Hoftore unter „Sicherheit“.
//   node dev/unit/raum_gruppen_jalousie.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
const a = src.indexOf('  const ROOM_GROUP_ORDER');
const b = src.indexOf('  function _roomGroupOn(cfg)');
const states = { 'cover.garage': { attributes: { device_class: 'garage' } }, 'cover.rollo': { attributes: { device_class: 'shutter' } } };
const document = { querySelector: () => ({ hass: { states } }) };
const G = new Function('document', src.slice(a, b) + ' return { of: _roomGroupOf, ORDER: ROOM_GROUP_ORDER, LABEL: ROOM_GROUP_LABEL };')(document);
assert.equal(G.of({ template: 'casora_cover', entity: 'cover.rollo' }), 'covers');
assert.equal(G.of({ entity: 'cover.rollo' }), 'covers');
assert.equal(G.of({ template: 'casora_cover', entity: 'cover.garage' }), 'security');
assert.equal(G.of({ template: 'casora_thermostat', entity: 'climate.bad' }), 'climate');
assert.equal(G.LABEL.covers, 'Jalousien');
assert.ok(G.ORDER.indexOf('covers') === G.ORDER.indexOf('climate') + 1, 'Jalousien direkt nach Klima');
console.log('ok raum_gruppen_jalousie');
