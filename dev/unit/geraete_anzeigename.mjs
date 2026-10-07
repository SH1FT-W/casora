// Nutzertest 2 (T7): Der Anzeigename aus der Entitäten-Registry gilt überall – Suche, Kachelname,
// Geräteauswahl, Szenen-Dialog („Stehlampe“ statt „Lightstrip“). Und „Neu in <Raum> – noch ohne
// Kachel“ zeigt auch Entitäten ohne Gerät, die selbst einem Bereich zugeordnet sind.
//   node dev/unit/geraete_anzeigename.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + p, import.meta.url), 'utf8');
const ux = read('casora-panel-b-ux.js');
// Geräteliste des „+“-Blatts: Name = Registry-Name, sonst Vorschlag, sonst friendly_name; beide suchbar.
const push = ux.slice(ux.indexOf('const push = (id, name, suggested) => {'), ux.indexOf('sugg.forEach((x) => push('));
assert.ok(/const own = e && typeof e\.name === "string" && e\.name\.trim\(\);/.test(push) && push.includes('name: own || name ||'), 'Registry-Name zuerst');
assert.ok(push.includes('((S[id].attributes || {}).friendly_name || "")'), 'friendly_name bleibt suchbar');
assert.ok(push.includes('loose: !!(e && !e.device_id && e.area_id)') && ux.includes('c.fresh && (c.suggested || c.loose)'), 'Entität ohne Gerät mit Bereich ist „neu“');
// Das Verhalten an einer nachgebauten push-Funktion
const S = { 'light.c2': { attributes: { friendly_name: 'Lightstrip' } }, 'light.x': { attributes: { friendly_name: 'X' } } };
const R = { 'light.c2': { name: 'Stehlampe', area_id: 'schlafzimmer' }, 'light.x': { device_id: 'd1' } };
const out = [];
const mk = new Function('S', 'R', 'out', 'used', 'typeFor', 'label', 'areaOf', 'roomOfArea', 'A', 'WORDS', 'seen', 'typeIds',
  'return ' + push.replace('const push = ', '').replace(/;\s*$/, '').trim());
const p = mk.call({ _room: 0 }, S, R, out, new Set(), () => 'light', (x) => x, (id) => (R[id] || {}).area_id || null, new Map([['schlafzimmer', 0]]), { schlafzimmer: { name: 'Schlafzimmer' } }, {}, new Set(), []);
p('light.c2', '', null); p('light.x', '', null);
assert.equal(out[0].name, 'Stehlampe');
assert.ok(out[0].loose && out[0].fresh && out[0].roomIndex === 0, 'neu in Schlafzimmer');
assert.ok(/lightstrip/i.test(out[0].words));
assert.equal(out[1].loose, false, 'mit Gerät: wie bisher über die Vorschläge');
// Weitere Stellen
assert.ok(read('casora-panel-types.js').includes('return (r && r.name) || (s && s.attributes && s.attributes.friendly_name) || id;'), 'Kachelarten');
assert.ok(read('casora-panel-b-plus.js').includes('b.textContent = (reg && reg.name) ||'), 'Szenen-Dialog');
assert.ok(read('casora-panel-b-mehr.js').includes('const alias = [(reg && reg.name) || ""'), '⌘K-Suche');
console.log('geraete_anzeigename: ok');
