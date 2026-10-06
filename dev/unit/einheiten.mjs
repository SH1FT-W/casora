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
