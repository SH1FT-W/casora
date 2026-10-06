// Einheiten aus dem Sensor statt fest eingebaut (Runde 06.10.2026).
//   node dev/unit/einheiten.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const strings = (o) => typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : [];
const tpl = (name) => strings(T[name]).join('\n');
const mod = (p) => read('custom_components/casora/scripts/local/' + p);
const st = (state, unit) => ({ state: String(state), attributes: unit ? { unit_of_measurement: unit } : {} });

// B-JS-02: „Einspeisung gesamt“ – Zähler in kWh nicht noch einmal durch 1000 (Standard + Weich).
{
  const m = tpl('casora_popup_energy').match(/expTot = (num\(C\.exportTotal\) == null \? null : [^;]+);/);
  assert.ok(m, 'Standard: Umrechnung vorhanden');
  const run = (s) => new Function('num', 'C', 'states', 'return ' + m[1])((id) => parseFloat(s.state), { exportTotal: 'x' }, { x: s }) / 1000;
  assert.equal(run(st(1234, 'kWh')), 1234, 'Standard: 1234 kWh bleibt 1234 kWh');
  assert.equal(run(st(1500, 'Wh')), 1.5, 'Standard: 1500 Wh → 1,5 kWh');
  assert.equal(run(st(2, 'MWh')), 2000, 'Standard: 2 MWh → 2000 kWh');
  const w = mod('05-weich-mehr.js').match(/if \(expTot != null\) (expTot \*= [^;]+);/);
  assert.ok(w, 'Weich: Umrechnung vorhanden');
  const runW = (s) => new Function('expTot', 'C', 'states', w[1] + '; return expTot')(parseFloat(s.state), { exportTotal: 'x' }, { x: s }) / 1000;
  assert.equal(runW(st(1234, 'kWh')), 1234, 'Weich: 1234 kWh');
  assert.equal(runW(st(1500, 'Wh')), 1.5, 'Weich: 1500 Wh');
}
console.log('ok B-JS-02');

// B-TPL-03: Energie-Popup – Leistung in kW/MW wird in W umgerechnet (Hauptwert, Stufe, Solar/Akku/Netz).
{
  const c = tpl('casora_popup_energy');
  const def = c.match(/const _sumW = \(id\) => \{[\s\S]*?n; \};/);
  assert.ok(def, '_sumW gefunden');
  const states = { p: st(2.5, 'kW'), w: st(800, 'W'), m: st(0.003, 'MW') };
  const safeNum = (id) => parseFloat(states[id].state);
  const sumW = new Function('safeNum', 'states', def[0] + ' return _sumW;')(safeNum, states);
  assert.equal(sumW('p'), 2500); assert.equal(sumW('w'), 800); assert.equal(sumW('m'), 3000);
  assert.ok(!/const power = powerId \? safeNum\(powerId\)/.test(c) && /const power = powerId \? _sumW\(powerId\)/.test(c), 'Hauptwert über _sumW');
  for (const k of ['solarPowerId', 'battPowerId', 'netzPowerId']) assert.ok(c.includes(`const p = _sumW(${k});`) && !c.includes(`const p = safeNum(${k});`), k);
  const inner = c.match(/const power = \(\(\) => \{ const n = safeNum\(powerId\);[\s\S]*?\}\)\(\);/);
  assert.ok(inner, 'Stufe (_powerScore) rechnet um');
  const p = new Function('safeNum', 'states', 'powerId', inner[0] + ' return power;')(safeNum, states, 'p');
  assert.equal(p, 2500, '2,5 kW → 2500 W für die Stufe');
}
console.log('ok B-TPL-03');

// B-TPL-04: Energie-Badge – Wh-Zähler nicht 1000-fach zu groß, kW-Sensor nicht als W.
{
  const name = T.casora_badge_energy.name;
  const body = name.replace(/^\[\[\[/, '').replace(/\]\]\]\s*$/, '');
  const run = (state, unit, dc) => new Function('variables', 'entity', 'states', 'hass', body)(
    {}, { entity_id: 'sensor.x', state: String(state), attributes: { unit_of_measurement: unit, device_class: dc } }, {}, { locale: { language: 'de' } });
  assert.match(run(1500, 'Wh', 'energy'), /1,5 kWh/, 'Wh → kWh');
  assert.match(run(12, 'kWh', 'energy'), />12 kWh</, 'kWh bleibt');
  assert.match(run(2.5, 'kW', 'power'), /2,5 kW/, 'kW-Sensor → 2,5 kW');
  assert.match(run(800, 'W', 'power'), />800 W</, 'W bleibt');
}
console.log('ok B-TPL-04');

// B-JS-03: FBH-/Thermostat-Popup – Einheit und Standardbereich aus HA (°F), nicht fest °C / 5…30.
{
  const src = mod('03-popups.js');
  const a = src.indexOf('(function () {\n  if (window._casoraFbh) return;');
  const b = src.indexOf('\n})();', a);
  const load = (unit) => {
    const w = { addEventListener() {}, _casoraUI: { tokens: { font: 'x', ink: '#000', ink2: '#111', ink3: '#222' } } };
    const doc = { querySelector: () => ({ hass: { config: { unit_system: { temperature: unit } } } }) };
    new Function('window', 'document', src.slice(a, b + 6))(w, doc);
    return w._casoraFbh;
  };
  const F = load('°F');
  const states = { 'climate.bad': { state: 'heat', attributes: { temperature: 70, current_temperature: 68 } } };
  assert.equal(F.status({ id: 'climate.bad' }, states), 'Bereit · 70,0 °F');
  const html = F.stepper(['climate.bad'], 70, {}, 'Ziel', true);
  assert.ok(html.includes('<span> °F</span>') && !html.includes('°C'), 'Stepper in °F');
  const bar = JSON.parse(html.match(/data-fb-bar="([^"]+)"/)[1].replace(/&quot;/g, '"'));
  assert.deepEqual([bar.lo, bar.hi], [41, 86], 'Standardbereich in °F');
  assert.ok(load('°C').stepper(['climate.bad'], 21, {}, 'Ziel', true).includes('<span> °C</span>'), '°C bleibt °C');
}
console.log('ok B-JS-03');

// B-JS-04: Aquarium, 3D-Drucker, Auto-Außentemperatur, Lüften, Netzwerk-Temperatur – Einheit des
// Sensors bzw. von HA; fest eingebautes „ °C“ nur noch als Rückfall.
for (const f of ['02-geraete.js', '03-popups.js', '05-standard-medien.js', '05-weich-mehr.js']) {
  const bad = mod(f).split('\n').filter((l) => /' °C'|'°C',|<span> °C</.test(l) && !/\|\| '°C'/.test(l));
  assert.deepEqual(bad, [], f + ': fest eingebautes °C');
}
{
  const src = mod('03-popups.js');
  assert.ok(src.includes("outUnit: unit('aussentemperatur') || '°C'") && src.includes("fmtN(r.out, 1) + ' ' + (r.outUnit || '°C')"), 'Auto: Außentemperatur mit Einheit');
}
console.log('ok B-JS-04');
