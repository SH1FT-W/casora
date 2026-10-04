// Aquarium-Kachel: Dosierpumpe und Lichtsteuerung aus frei gewählten Feldern, ältere Kacheln
// mit den Präfixen dosing_prefix / helialux weiter wie bisher.  node dev/unit/aquarium_felder.mjs
// 1.0.3: Casora wird öffentlich; die festen Namen (sensor.dosierpumpe_<präfix>_…, select.<präfix>_profil)
// gelten nur noch für umgezogene Kacheln, neue wählen die Entitäten im Studio.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-geraete.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraAqParts) return;');
const b = src.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'Aquarium-Teile-Block nicht gefunden');
const window = {};
new Function('window', src.slice(a, b + 6))(window);
const parts = window._casoraAqParts;
const st = (ids) => Object.fromEntries(ids.map((id) => [id, { entity_id: id, state: '1', attributes: {} }]));

// 1) Alte Kachel: Präfix + Beschriftungen, Kanal 3 fehlt im Haus – Beschriftungen zählen wie früher über die vorhandenen.
{
  const P = 'reef';
  const S = st(['button.reef_dose_pump_1', 'button.reef_dose_pump_2', 'button.reef_dose_pump_4']);
  const r = parts({ dosing_prefix: P, dosing_labels: ['KH', 'Ca', 'Mg'], helialux: 'helia' }, S);
  assert.deepEqual(r.dose.map((d) => d.btn), ['button.reef_dose_pump_1', 'button.reef_dose_pump_2', 'button.reef_dose_pump_4']);
  assert.deepEqual(r.dose.map((d) => d.n), [1, 2, 4]);
  assert.deepEqual(r.dose.map((d) => d.label), ['KH', 'Ca', 'Mg']);
  assert.equal(r.dose[2].today, 'sensor.reef_pump_4_dosed_today');
  assert.equal(r.dose[2].total, 'sensor.dosierpumpe_reef_pump_4_total_ml');
  assert.equal(r.dose[2].vol, 'number.reef_pump_4_dose_volume');
  assert.deepEqual(r.light, { sw: 'switch.helia_manual_color_simulation', sel: 'select.helia_profil', legacy: true });
}

// 2) Neue Kachel: frei gewählte Entitäten, keine Präfixe, Namen je Knopf.
{
  const S = st(['button.pumpe_a', 'button.pumpe_b', 'number.menge_a', 'sensor.heute_a', 'sensor.summe_b']);
  const r = parts({
    dosing_buttons: ['button.pumpe_a', 'button.pumpe_b'],
    dosing_volume: { 'button.pumpe_a': 'number.menge_a' },
    dosing_today: { 'button.pumpe_a': 'sensor.heute_a' },
    dosing_total: { 'button.pumpe_b': 'sensor.summe_b' },
    dosing_names: { 'button.pumpe_b': 'Spurenelemente' },
    light_profile: 'select.lampe_programm', light_schedule_switch: 'switch.lampe_automatik',
  }, S);
  assert.deepEqual(r.dose, [
    { n: 1, btn: 'button.pumpe_a', today: 'sensor.heute_a', total: null, vol: 'number.menge_a', label: null },
    { n: 2, btn: 'button.pumpe_b', today: null, total: 'sensor.summe_b', vol: null, label: 'Spurenelemente' },
  ]);
  assert.deepEqual(r.light, { sw: 'switch.lampe_automatik', sel: 'select.lampe_programm', legacy: false });
}

// 3) Umzug ins neue Feld: Knöpfe im alten Muster finden ihre Werte weiter, gewählte Zuordnung geht vor.
{
  const S = st(['button.reef_dose_pump_1', 'sensor.reef_pump_1_dosed_today', 'sensor.dosierpumpe_reef_pump_1_total_ml',
    'number.reef_pump_1_dose_volume', 'number.eigene_menge']);
  const r = parts({ dosing_prefix: 'alt', dosing_buttons: ['button.reef_dose_pump_1'],
    dosing_volume: { 'button.reef_dose_pump_1': 'number.eigene_menge' }, dosing_labels: ['KH'] }, S);
  assert.deepEqual(r.dose, [{ n: 1, btn: 'button.reef_dose_pump_1', today: 'sensor.reef_pump_1_dosed_today',
    total: 'sensor.dosierpumpe_reef_pump_1_total_ml', vol: 'number.eigene_menge', label: 'KH' }]);
}

// 4) Nur ein Lichtfeld; neues Feld schlägt den alten Präfix; ohne alles: nichts.
{
  assert.deepEqual(parts({ light_profile: 'select.p' }, {}).light, { sw: null, sel: 'select.p', legacy: false });
  assert.deepEqual(parts({ helialux: 'h', light_schedule_switch: 'switch.s' }, {}).light,
    { sw: 'switch.s', sel: 'select.h_profil', legacy: false });
  assert.deepEqual(parts({}, {}), { dose: [], light: null });
  assert.deepEqual(parts(null, null), { dose: [], light: null });
  assert.deepEqual(parts({ dosing_buttons: 'kaputt', dosing_volume: ['x'] }, {}).dose, []);
}

// 5) Studio: die alten Präfix-Felder erscheinen nur bei Kacheln, die sie noch haben; die Übersicht mit drei
//    festen Becken bleibt versteckt (nur zum Bearbeiten umgezogener Kacheln).
{
  const tsrc = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-types.js', import.meta.url), 'utf8');
  const w = {};
  // Nur die Typenliste (die Datei lädt danach im Browser noch umbenennung.json).
  new Function('window', tsrc.slice(0, tsrc.indexOf('\n];\n', tsrc.indexOf('window.CASORA_TILE_TYPES = [')) + 4))(w);
  const T = w.CASORA_TILE_TYPES;
  const aq = T.find((t) => t.id === 'casora_aquarium');
  const f = (k) => aq.fields.find((x) => x.key === k);
  for (const k of ['light_profile', 'light_schedule_switch', 'dosing_buttons', 'dosing_volume', 'dosing_today', 'dosing_total', 'dosing_names']) {
    assert.ok(f(k) && f(k).advanced, 'Feld fehlt oder nicht erweitert: ' + k);
  }
  assert.equal(f('helialux').when({}), false);
  assert.equal(f('helialux').when({ helialux: 'x' }), true);
  assert.equal(f('dosing_prefix').when({ dosing_prefix: 'x' }), true);
  assert.equal(f('dosing_volume').when({}), false);
  assert.equal(f('dosing_volume').when({ dosing_buttons: ['button.a'] }), true);
  assert.ok(!aq.fields.some((x) => x.type === 'text' && /prefix/i.test(x.placeholder || '') && !x.when), 'Präfix-Feld ohne when');
  assert.equal(T.find((t) => t.id === 'casora_aquariums').hidden, true);
}

console.log('aquarium_felder: ok');
