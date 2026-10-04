// Fahrzeug-Erkennung über Rollen ohne Browser.  node dev/unit/fahrzeug_rollen.mjs
// Gemeldet 02.10.2026: Mit volkswagen_connect (englische IDs, keine translation_keys) fand
// Casora kein Auto, Kachel „Keine Daten“ – die Suche hing an cupra_eu_data_act.
// Erwartet: cupra, volkswagen_connect und ein E-Auto im Tesla-Stil werden erkannt, das Auto ist
// das Gerät mit den meisten Fahrzeug-Rollen (nicht ein Handy mit battery_level).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const b = src.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'Fahrzeug-Block nicht gefunden');
const block = src.slice(a, b + 6);

function load(entities) {
  const window = {};
  const document = { querySelector: () => ({ hass: { entities } }) };
  new Function('window', 'document', block)(window, document);
  return window._casoraCar;
}
const reg = (list) => Object.fromEntries(list.map(([id, dev, tk, pl]) => [id, { entity_id: id, device_id: dev, translation_key: tk || null, platform: pl || null }]));
const st = (pairs) => Object.fromEntries(pairs.map(([id, s, attrs]) => [id, { entity_id: id, state: s, attributes: attrs || {} }]));

// 1) volkswagen_connect: englische IDs, Kilometerstand mit anderem Präfix, Handy mit Akku daneben.
{
  const P = 'auto_x';
  const ids = [
    // Helfer am Auto-Gerät (utility_meter) steht vorn und darf den echten Kilometerstand nicht verdrängen.
    ['sensor.' + P + '_monthly_mileage', 'car', null, 'utility_meter'],
    ['sensor.' + P + '_range_combined', 'car'], ['sensor.' + P + '_range_secondary', 'car'], ['sensor.' + P + '_scr_range', 'car'],
    ['sensor.' + P + '_fuel_level', 'car'], ['sensor.' + P + '_fuel_level_accuracy', 'car'], ['sensor.garage_' + P + '_mileage', 'car'],
    ['sensor.' + P + '_oil_level', 'car'], ['sensor.' + P + '_data_captured', 'car'], ['sensor.' + P + '_boardnetbatteryvoltageindication', 'car'],
    ['binary_sensor.' + P + '_front_left_door', 'car'], ['binary_sensor.' + P + '_front_left_door_lock', 'car'],
    ['binary_sensor.' + P + '_front_right_door_lock', 'car'], ['binary_sensor.' + P + '_tailgate', 'car'], ['binary_sensor.' + P + '_tailgate_lock', 'car'],
    ['binary_sensor.' + P + '_bonnet_lock', 'car'], ['binary_sensor.' + P + '_sunroof', 'car'], ['binary_sensor.' + P + '_parking_brake', 'car'],
    ['sensor.handy_battery_level', 'phone'], ['sensor.handy_battery_state', 'phone'],
  ];
  const C = load(reg(ids));
  const M = C.map(null);
  assert.equal(M.reichweite_kombiniert, 'sensor.' + P + '_range_combined');
  assert.equal(M.tankfullstand, 'sensor.' + P + '_fuel_level');
  assert.equal(M.kilometerstand, 'sensor.garage_' + P + '_mileage');
  assert.equal(M.scr_reichweite, 'sensor.' + P + '_scr_range');
  assert.equal(M.tur_vorne_links, 'binary_sensor.' + P + '_front_left_door');
  assert.equal(M.turschloss_vorne_links, 'binary_sensor.' + P + '_front_left_door_lock');
  assert.equal(M.heckklappe, 'binary_sensor.' + P + '_tailgate');
  assert.equal(M.heckklappenschloss, 'binary_sensor.' + P + '_tailgate_lock');
  assert.equal(M.akku, undefined, 'Handy-Akku gehört nicht zum Auto');
  const S = st([
    ['sensor.' + P + '_range_combined', '810'], ['sensor.' + P + '_fuel_level', '86'], ['sensor.garage_' + P + '_mileage', '7016'],
    ['sensor.' + P + '_data_captured', '2026-10-02T13:42:03+00:00'],
    ['binary_sensor.' + P + '_front_left_door', 'off'], ['binary_sensor.' + P + '_tailgate', 'off'], ['binary_sensor.' + P + '_sunroof', 'off'],
    ['binary_sensor.' + P + '_front_left_door_lock', 'off'], ['binary_sensor.' + P + '_front_right_door_lock', 'off'],
    ['binary_sensor.' + P + '_tailgate_lock', 'off'], ['binary_sensor.' + P + '_bonnet_lock', 'on'], ['binary_sensor.' + P + '_parking_brake', 'on'],
  ]);
  const r = C.read(null, S);
  assert.equal(r.range, 810); assert.equal(r.tank, 86); assert.equal(r.ev, false); assert.equal(r.km, 7016);
  assert.equal(r.locked, true, 'entriegelte Motorhaube zählt nicht als „nicht verriegelt“');
  assert.equal(r.stamp, '2026-10-02T13:42:03+00:00');
  assert.equal(C.tile(null, S), 'Verriegelt');
  S['binary_sensor.' + P + '_tailgate'].state = 'on';
  assert.equal(C.tile(null, S), 'Heckklappe offen');
  assert.equal(C.level(null, S), 2);
  // Kachel-Entität als Anker liefert dasselbe Auto.
  assert.equal(C.map('sensor.' + P + '_fuel_level').reichweite_kombiniert, 'sensor.' + P + '_range_combined');
}

// 2) cupra_eu_data_act: deutsche IDs mit translation_keys, altes Präfix.
{
  const P = 'kombi';
  const ids = [
    ['sensor.' + P + '_reichweite_kombiniert', 'c', 'cruising_range_combined'], ['sensor.' + P + '_tankfullstand', 'c', 'fuel_level_current_level'],
    ['sensor.' + P + '_kilometerstand', 'c', 'mileage'], ['binary_sensor.' + P + '_turschloss_vorne_links', 'c', 'locked_state_front_left_door'],
    ['binary_sensor.' + P + '_tur_vorne_links', 'c', 'open_state_front_left_door'], ['button.' + P + '_jetzt_aktualisieren', 'c', 'refresh'],
  ];
  const C = load(reg(ids));
  assert.equal(C.id(P, 'reichweite_kombiniert', 'sensor'), 'sensor.' + P + '_reichweite_kombiniert');
  assert.equal(C.id(null, 'jetzt_aktualisieren', 'button'), 'button.' + P + '_jetzt_aktualisieren');
  const S = st([['sensor.' + P + '_tankfullstand', '40'], ['binary_sensor.' + P + '_turschloss_vorne_links', 'on']]);
  assert.equal(C.tile(null, S), 'Nicht verriegelt');
}

// 3) E-Auto im Tesla-Stil: Akku statt Tank, Schloss als lock-Entität, Tür „front_driver_door“.
{
  const P = 'model_y';
  const ids = [
    ['sensor.' + P + '_battery_level', 'ev'], ['sensor.' + P + '_battery_range', 'ev'], ['sensor.' + P + '_odometer', 'ev'],
    ['lock.' + P + '_lock', 'ev'], ['binary_sensor.' + P + '_front_driver_door', 'ev'], ['binary_sensor.' + P + '_frunk', 'ev'],
  ];
  const C = load(reg(ids));
  const S = st([['sensor.' + P + '_battery_level', '12'], ['sensor.' + P + '_battery_range', '60'], ['lock.' + P + '_lock', 'unlocked'],
    ['binary_sensor.' + P + '_front_driver_door', 'off'], ['binary_sensor.' + P + '_frunk', 'off']]);
  const r = C.read(null, S);
  assert.equal(r.ev, true); assert.equal(r.tank, 12); assert.equal(r.range, 60); assert.equal(r.locked, false);
  assert.equal(C.tile(null, S), 'Nicht verriegelt');
  S['lock.' + P + '_lock'].state = 'locked';
  assert.equal(C.tile(null, S), 'Verriegelt');
  assert.equal(C.level(null, S), 1, 'Akku 12 % ist ein Hinweis');
}

// 4) Kein Auto: nichts erkannt, kein Absturz.
{
  const C = load(reg([['sensor.handy_battery_level', 'phone'], ['sensor.wetter_temperatur', 'w']]));
  assert.deepEqual(C.map(null), {});
  assert.equal(C.tile(null, {}), 'Keine Daten');
}
console.log('fahrzeug_rollen: ok');
