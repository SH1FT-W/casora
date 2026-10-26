// Checkup 10/2026 (Prod): Kachel „1 Problem“, Popup ohne Zeile. Einziges Problem war „prüfen“ wegen
// schwacher Batterie – das gehört unter „Batterie“ (rechts), dieser Abschnitt entstand aber nur, wenn
// auch ein Gerät „beobachten“ war. Erwartet: Abschnitte nach Inhalt. Geräte und Namen erfunden.
//   node dev/unit/checkup_pulse_nur_batterie.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/14-pulse.js', import.meta.url), 'utf8'))();
const P = window._casoraPulse;

const entities = {}, states = {};
const add = (id, key, device, state, attributes = {}) => {
  entities[id] = { entity_id: id, platform: 'pulse', translation_key: key, device_id: device };
  states[id] = { entity_id: id, state, attributes };
};
add('sensor.a_status', 'status', 'd_a', 'check', { reason_key: 'battery_low_flag' });
add('sensor.b_status', 'status', 'd_b', 'ok', {});
add('sensor.c_status', 'status', 'd_c', 'ok', {});
const hass = { entities, states, devices: { d_a: { name: 'Heizkörper Test' }, d_b: { name: 'B' }, d_c: { name: 'C' } }, areas: {} };

const s = P.scan(hass, states);
assert.equal(s.problems, 1, 'zählt als Problem (Kachel „1 Problem“)');
assert.equal(s.soon, 0, 'nichts „beobachten“');

// Popup-Gerüst: welche Abschnitte entstehen?
const made = [];
window._casoraSoftKit = { secCard: (w, code) => { made.push(code); return {}; }, layout: (o) => o };
// Since 26.10. the sections follow Pulse's status (Ausgefallen/Prüfen/Beobachten): the row is under „Prüfen“.
window._casoraUI = { group: (rows) => '[' + rows.map((r) => r.label).join(',') + ']', line: () => '', more: () => '' };
const lay = P.popup(states, hass);
assert.ok(lay.fields.check, 'Abschnitt „Prüfen“ wird angelegt');
assert.ok(!lay.fields.failed && !lay.fields.watch, 'keine leeren Abschnitte');
const sec = P.sec('check', null, states, hass);
assert.ok(sec.includes('>Prüfen</div>') && sec.includes('[Heizkörper Test]'), 'Zeile unter „Prüfen“');
console.log('ok pulse_nur_batterie');

// Kachel vor dem Laden des Moduls: Aktiv nach der Kachel-Entität (Pulse „Probleme“), nicht erst hinten.
{
  const tpl = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8'));
  const code = tpl.templates.casora_pulse.state[0].value.replace(/^\s*\[\[\[|\]\]\]\s*$/g, '');
  const run = (P, state) => { const w = { _casoraPulse: P }; return new Function('window', 'entity', 'hass', 'states', code)(w, { state }, {}, {}); };
  assert.equal(run(undefined, '1'), true, 'ohne Modul: 1 Problem → aktiv');
  assert.equal(run(undefined, '0'), false, 'ohne Modul: 0 → nicht aktiv');
  assert.equal(run(undefined, 'unavailable'), false, 'ohne Modul: nicht verfügbar → nicht aktiv');
  assert.equal(run({ active: () => true, scan: () => ({}) }, '0'), true, 'mit Modul entscheidet das Modul');
  console.log('ok pulse_ohne_modul');
}
