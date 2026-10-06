// B-JS-10: FBH-Popup – liefert ein Sensor Text statt Zahl („none“), bleibt der Abschnitt da
// (vorher warf fmt(null) und der ganze Bereich „Raum“ fehlte).
//   node dev/unit/fbh_textwerte.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraFbh) return;');
const b = src.indexOf('\n})();', a);
const groups = [];
const w = {
  addEventListener() {},
  _casoraUI: { tokens: { font: 'x', ink: '#000', ink2: '#111', ink3: '#222' }, group: (rows, title) => { groups.push({ rows, title }); return 'G'; } },
};
const doc = { querySelector: () => ({ hass: { config: { unit_system: { temperature: '°C' } } } }) };
new Function('window', 'document', src.slice(a, b + 6))(w, doc);
const F = w._casoraFbh;
const states = {
  'climate.bad': { state: 'heat', attributes: { temperature: 21 } },
  'sensor.next': { state: 'none', attributes: {} },
  'number.dip': { state: 'aus', attributes: {} },
  'switch.dip': { state: 'on', attributes: {} },
};
let out;
assert.doesNotThrow(() => { out = F.sec('det', { id: 'climate.bad', next: 'sensor.next', dip: 'switch.dip', dipVal: 'number.dip' }, states, {}); });
const rows = groups.flatMap((g) => g.rows);
assert.ok(!rows.some((r) => r.label === 'Nächste Solltemperatur'), 'Text-Wert: Zeile weggelassen');
states['sensor.next'].state = '19.5';
groups.length = 0;
F.sec('det', { id: 'climate.bad', next: 'sensor.next' }, states, {});
assert.ok(groups.flatMap((g) => g.rows).some((r) => r.label === 'Nächste Solltemperatur' && r.value === '19,5 °C'), 'Zahl: Zeile da');
console.log('ok fbh_textwerte');
