// Akku-Hinweise auf Geräte-Kacheln (battery_hints: auto|always|never).  node dev/unit/akku_hinweise.mjs
// Gemeldet 06.10.2026: Die Aquarium-Kachel wurde wegen eines schwachen Lecksensor-Akkus orange und
// rückte nach vorn, obwohl auf derselben Startseite schon die Batterien-Kachel „1 Schwach“ zeigte.
// auto = Akku-Hinweise zählen nur, wenn das Dashboard keine Batterien-Kachel hat. Ein ausgelöstes
// Leck oder eine Temperaturwarnung bleibt immer.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > -1 && j > i, 'Block fehlt: ' + a); return src.slice(i, j); };
const window = {};
new Function('window', cut(core, '// casora-battery:start', '// casora-battery:end'))(window);
new Function('window', cut(core, '// casora-battery-hints:start', '// casora-battery-hints:end'))(window);
const H = window.casoraBatteryHints;

const geraete = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-geraete.js', import.meta.url), 'utf8');
const evSrc = cut(geraete, '  window._casoraAqEval = function', '  /* Aquarium-Doktor');
new Function('window', evSrc)(window);
const ev = window._casoraAqEval;

const tile = (tpl, extra) => Object.assign({ type: 'custom:button-card', template: tpl }, extra || {});
const withBat = { views: [{ path: 'home', cards: [{ type: 'custom:smart-row', cards: [tile(['casora_battery']), tile('casora_aquarium_tank')] }] }] };
const ohneBat = { views: [{ path: 'home', cards: [tile('casora_aquarium_tank')] }] };
const batAus = { views: [{ cards: [tile('casora_battery', { variables: { enabled: false } })] }] };
// Nur die Vorlage in der Sammlung zählt nicht als Kachel.
const nurVorlage = { button_card_templates: { x: { template: 'casora_battery' } }, views: [{ cards: [] }] };
const tiefImRaum = { views: [{ path: 'home', cards: [] }, { path: 'wohnzimmer', sections: [{ cards: [{ card: tile('casora_battery') }] }] }] };

// 1) Entscheidung
assert.equal(H.mode(undefined), 'auto');
assert.equal(H.mode('Never'), 'never');
assert.equal(H.mode('quatsch'), 'auto');
assert.equal(H.hasTile(withBat), true);
assert.equal(H.hasTile(ohneBat), false);
assert.equal(H.hasTile(batAus), false);
assert.equal(H.hasTile(nurVorlage), false);
assert.equal(H.hasTile(tiefImRaum), true);
assert.equal(H.hasTile(null), false);
assert.equal(H.on('auto', withBat), false);
assert.equal(H.on('auto', ohneBat), true);
assert.equal(H.on(undefined, withBat), false);
assert.equal(H.on('always', withBat), true);
assert.equal(H.on('never', ohneBat), false);
// Dashboard unbekannt (z. B. Studio-Vorschau): wie bisher, Hinweis zählt.
assert.equal(H.on('auto', null), true);

// 2) Aquarium-Kachel
const S = {
  'sensor.becken_temp': { entity_id: 'sensor.becken_temp', state: '25.1', attributes: {} },
  'binary_sensor.leck': { entity_id: 'binary_sensor.leck', state: 'off', attributes: {} },
  'sensor.leck_akku': { entity_id: 'sensor.leck_akku', state: '18', attributes: { device_class: 'battery' } },
};
const V = { leak_entity: 'binary_sensor.leck', leak_battery: 'sensor.leck_akku' };
const run = (cfg, vars, states) => { window._casoraLovelaceCfg = () => cfg; return ev(states.__ent || states['sensor.becken_temp'], Object.assign({}, V, vars), states, null); };

let r = run(ohneBat, {}, S);
assert.equal(r.level, 1);
assert.equal(r.text, 'Prüfen · Akku Lecksensor 18 %');

r = run(withBat, {}, S);
assert.equal(r.level, 0, 'Batterien-Kachel vorhanden: Aquarium bleibt ruhig');
assert.equal(r.text, 'Alles ok');

r = run(withBat, { battery_hints: 'always' }, S);
assert.equal(r.level, 1);
r = run(ohneBat, { battery_hints: 'never' }, S);
assert.equal(r.level, 0);

// Ausgelöstes Leck ist kein Akku-Hinweis – bleibt Alarm, auch mit Batterien-Kachel.
const nass = Object.assign({}, S, { 'binary_sensor.leck': { entity_id: 'binary_sensor.leck', state: 'on', attributes: {} } });
r = run(withBat, {}, nass);
assert.equal(r.level, 2);
assert.equal(r.text, 'Alarm · Wasser erkannt');
// Lecksensor offline bleibt ein Hinweis.
const weg = Object.assign({}, S, { 'binary_sensor.leck': { entity_id: 'binary_sensor.leck', state: 'unavailable', attributes: {} } });
r = run(withBat, { battery_hints: 'never' }, weg);
assert.equal(r.level, 1);
assert.equal(r.text, 'Prüfen · Lecksensor offline');

// 3) Vorlage kennt die Variable mit Standard auto.
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
assert.equal(tpl.casora_aquarium_tank.variables.battery_hints, 'auto');

console.log('akku_hinweise: ok');
