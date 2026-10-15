// Checkup 10/2026: Fahrzeug-Wartung – ein reines Datum („2028-09-02“) las new Date() als UTC-Mitternacht;
// westlich von UTC stand dann der Vortag im Popup. Erwartet: lokaler Tag. Werte erfunden.
//   node dev/unit/checkup_scripts_wartung_datum.mjs
process.env.TZ = 'America/New_York';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraCar) return;');
const b = src.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'Fahrzeug-Block gefunden');
const window = {};
const document = { querySelector: () => ({ hass: { entities: {}, states: {} } }) };
new Function('window', 'document', src.slice(a, b + 6))(window, document);
const C = window._casoraCar;
assert.equal(new Date('2028-09-02').getDate(), 1, 'Testvoraussetzung: Zeitzone westlich von UTC');

const d = C.toDate({ state: '2028-09-02', attributes: { device_class: 'date' } });
assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate()], [2028, 8, 2], 'lokaler Tag');
// Zeitstempel und Resttage wie bisher.
const ts = C.toDate({ state: '2028-09-02T10:00:00+00:00', attributes: { device_class: 'timestamp' } });
assert.equal(ts.getTime(), Date.UTC(2028, 8, 2, 10));
const rest = C.toDate({ state: '10', attributes: { unit_of_measurement: 'd' } });
assert.ok(Math.abs(rest - (Date.now() + 10 * 864e5)) < 5000, 'Resttage');
assert.equal(C.toDate({ state: 'unknown', attributes: {} }), null);
console.log('ok wartung_datum');
