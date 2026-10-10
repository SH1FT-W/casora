// Glocke: Neustart-Filter (06-kalender.js) warf bei jedem Aufbau der Mitteilungen
// „Casora notify extension (standing): ReferenceError: HIDE is not defined“ (Konsole, 1.3).
// Erwartet: standing() läuft ohne Fehler, setzt den Pflanzen-Zeitpunkt und gibt die Zeilen zurück.
//   node dev/unit/glocke_standing_pflanzen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/06-kalender.js', import.meta.url), 'utf8');
const start = src.indexOf('(function () {\n  if (window._casoraRestartGuard) return;');
assert.ok(start > 0, 'Neustart-Filter gefunden');
const mod = src.slice(start, src.indexOf('\n})();', start) + 6);

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
window.CASORA_NOTIFY_EXTENSIONS = [];
new Function(mod)();
const guard = window.CASORA_NOTIFY_EXTENSIONS[0];
assert.equal(typeof guard.standing, 'function');

let calls = 0;
const hass = {
  states: { 'plant.a': { state: 'problem', last_changed: new Date().toISOString() } },
  callWS: () => { calls++; return Promise.resolve({}); },
};
const rows = [
  { id: 'casora:plant:plant.a', entity: 'plant.a', seen: 1 },
  { id: 'casora:open:binary_sensor.tuer', entity: 'binary_sensor.tuer' },
];
const out = guard.standing(hass, rows);
assert.ok(Array.isArray(out), 'gibt Zeilen zurück (wirft nicht)');
assert.equal(out.length, 2, 'keine Zeile verloren');
assert.ok(out[0].when > 0 && out[0].seen === undefined, 'Pflanzen-Zeitpunkt gesetzt, Sichtungs-Merker weg');
assert.equal(calls, 1, 'Verlauf einmal abgefragt');
console.log('glocke_standing_pflanzen: ok');
