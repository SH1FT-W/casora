// Umzug Hemma → Casora: Einstellungen aus Hemma-Helfern (carryPlan in casora-panel-umzug.js).
//   node dev/unit/umzug_helfer.mjs
// Gefunden 10.10.2026 (Umzug-Prüfung 1.3): Hemma 2.1.2 führt die Zieltemperatur in °F (68–75).
// In einem °C-Haus versuchte der Umzug 71 in Casoras 15–30 zu schreiben → Fehler-Toast
// „Invalid value … (range 15.0 - 30.0)“ direkt auf dem Fertig-Bildschirm. Außerdem überschrieb ein
// erneuter Umzug Casora-Einstellungen, die der Nutzer inzwischen geändert hatte, und setzte die
// Glocke („gelesen bis“) auf einen älteren Zeitpunkt zurück (alte Meldungen wieder ungelesen).
// Regel jetzt wie _carry_values in hemma_cleanup.py: nur unberührte Casora-Werte, Zahlen nur im
// Bereich und in derselben Einheit, Glocke nur vorwärts.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-umzug.js', import.meta.url), 'utf8')
  .replace('new URL("./hemma-originals.json", import.meta.url).href', '"x"');
new Function(src)();
const { carryPlan, CARRY_INITIAL } = window.casoraUmzug;

// Ausgangswerte im Panel = helfer.yaml (initial bzw. min bei Zahlen).
const yaml = fs.readFileSync(new URL('../../custom_components/casora/helfer.yaml', import.meta.url), 'utf8');
for (const [k, want] of Object.entries(CARRY_INITIAL)) {
  if (want === null) continue;
  const name = 'casora_' + k.split('.')[1];
  const m = yaml.match(new RegExp('^  ' + name + ':\\n((?:    .*\\n)+)', 'm'));
  assert.ok(m, name + ' fehlt in helfer.yaml');
  if (want === 'min') { assert.match(m[1], /^\s+min:/m, name + ': min'); continue; }
  const init = (m[1].match(/^\s+initial:\s*(.*)$/m) || [])[1];
  assert.ok(init !== undefined, name + ': initial fehlt');
  assert.equal(init.replace(/^"(.*)"$/, '$1'), want, name + ': Ausgangswert');
}

const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });
const base = (over = {}) => {
  const S = {
    'input_boolean.hemma_dashboard_redirect': st('input_boolean.hemma_dashboard_redirect', 'off'),
    'input_boolean.casora_dashboard_redirect': st('input_boolean.casora_dashboard_redirect', 'on'),
    'input_number.hemma_thermostat_target_temperature': st('input_number.hemma_thermostat_target_temperature', '71.0', { min: 68, max: 75, unit_of_measurement: '°F' }),
    'input_number.casora_thermostat_target_temperature': st('input_number.casora_thermostat_target_temperature', '15.0', { min: 15, max: 30, unit_of_measurement: '°C' }),
    'input_select.hemma_thermostat_mode': st('input_select.hemma_thermostat_mode', 'cool'),
    'input_select.casora_thermostat_mode': st('input_select.casora_thermostat_mode', 'heat', { options: ['heat', 'cool'] }),
    'input_datetime.hemma_notifications_read': st('input_datetime.hemma_notifications_read', '2026-10-09 12:34:00'),
    'input_datetime.casora_notifications_read': st('input_datetime.casora_notifications_read', '2026-09-28 18:33:17'),
  };
  return Object.assign(S, over);
};
const by = (plan) => Object.fromEntries(plan.map((c) => [c.data.entity_id, c]));

// Erster Umzug, Hemma 2.1.2 in °F, Casora in °C: Zieltemperatur bleibt (kein Fehler), Rest kommt mit.
{
  const p = by(carryPlan(base()));
  assert.equal(p['input_number.casora_thermostat_target_temperature'], undefined, '°F-Wert nicht in °C-Helfer');
  assert.equal(p['input_boolean.casora_dashboard_redirect'].service, 'turn_off');
  assert.equal(p['input_select.casora_thermostat_mode'].data.option, 'cool');
  assert.equal(p['input_datetime.casora_notifications_read'].data.datetime, '2026-10-09 12:34:00');
}
// Hemma in °C (selbst angepasst) und im Bereich: kommt mit; außerhalb des Bereichs nicht.
{
  const hC = (v) => st('input_number.hemma_thermostat_target_temperature', v, { min: 15, max: 30, unit_of_measurement: '°C' });
  assert.equal(by(carryPlan(base({ 'input_number.hemma_thermostat_target_temperature': hC('21.5') })))['input_number.casora_thermostat_target_temperature'].data.value, 21.5);
  assert.equal(by(carryPlan(base({ 'input_number.hemma_thermostat_target_temperature': st('input_number.hemma_thermostat_target_temperature', '35', {}) })))['input_number.casora_thermostat_target_temperature'], undefined);
}
// Erneuter Umzug: in Casora geänderte Werte bleiben, die Glocke geht nicht zurück.
{
  const p = by(carryPlan(base({
    'input_boolean.hemma_dashboard_redirect': st('input_boolean.hemma_dashboard_redirect', 'on'),
    'input_boolean.casora_dashboard_redirect': st('input_boolean.casora_dashboard_redirect', 'off'),
    'input_select.casora_thermostat_mode': st('input_select.casora_thermostat_mode', 'cool', { options: ['heat', 'cool'] }),
    'input_select.hemma_thermostat_mode': st('input_select.hemma_thermostat_mode', 'heat'),
    'input_number.hemma_thermostat_target_temperature': st('input_number.hemma_thermostat_target_temperature', '19', { min: 15, max: 30, unit_of_measurement: '°C' }),
    'input_number.casora_thermostat_target_temperature': st('input_number.casora_thermostat_target_temperature', '22.5', { min: 15, max: 30, unit_of_measurement: '°C' }),
    'input_datetime.casora_notifications_read': st('input_datetime.casora_notifications_read', '2026-10-10 08:00:00'),
  })));
  assert.deepEqual(Object.keys(p), [], JSON.stringify(p));
}
// Fehlende oder nicht verfügbare Helfer: nichts.
assert.deepEqual(carryPlan({}), []);
assert.deepEqual(carryPlan({ 'input_boolean.hemma_motion_badges': st('input_boolean.hemma_motion_badges', 'unavailable'),
  'input_boolean.casora_motion_badges': st('input_boolean.casora_motion_badges', 'on') }), []);
console.log('PASS umzug_helfer');
