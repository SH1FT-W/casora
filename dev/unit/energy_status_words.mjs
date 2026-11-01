// Energy popup v3 (owner, 01.11.2026): the status line says in words where the power comes from („Bezug aus dem Netz ·
// Akku bereit“, „Solar deckt 80 %“, „Netz offline“) – never the stage's watts again; the grid circle of the flow reads
// „Offline“ instead of „—“ when its sensor is unavailable; the head carries a label (room, else „Zuhause“).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/05-weich-mehr.js', import.meta.url), 'utf8');
globalThis.window = globalThis;
new Function(src)();
const E = window._casoraSoftEnergy;
assert.equal(typeof E.statusWords, 'function', 'statusWords');

const st = (o) => Object.fromEntries(Object.entries(o).map(([id, s]) => [id, { entity_id: id, state: String(s), attributes: { unit_of_measurement: 'W' } }]));
const F = { solar: ['sensor.solar'], grid: 'sensor.grid', chg: 'sensor.chg', dis: 'sensor.dis', home: 'sensor.home', has: { solar: true, battery: true, grid: true } };
const C = { home: 'sensor.home', fs: F };
const words = (S) => { const w = E.statusWords(C, S, null); return [w.main].concat(w.rest).join(' · '); };

// Night: everything from the grid, battery idle.
assert.equal(words(st({ 'sensor.home': 513, 'sensor.solar': 0, 'sensor.grid': 513, 'sensor.chg': 0, 'sensor.dis': 0 })), 'Bezug aus dem Netz · Akku bereit');
// Noon: solar covers 80 %.
assert.equal(words(st({ 'sensor.home': 1000, 'sensor.solar': 900, 'sensor.grid': 200, 'sensor.chg': 100, 'sensor.dis': 0 })), 'Solar deckt 80 % · Akku lädt');
// Evening: solar and battery together.
assert.equal(words(st({ 'sensor.home': 1000, 'sensor.solar': 300, 'sensor.grid': 100, 'sensor.chg': 0, 'sensor.dis': 600 })), 'Solar und Akku decken 90 % · Akku entlädt');
// Feed-in.
assert.equal(words(st({ 'sensor.home': 400, 'sensor.solar': 2000, 'sensor.grid': -1600, 'sensor.chg': 0, 'sensor.dis': 0 })), 'Einspeisung ins Netz · Akku bereit');
// Grid sensor unavailable (prod 01.11.2026).
assert.equal(words(st({ 'sensor.home': 513, 'sensor.solar': 0, 'sensor.grid': 'unavailable', 'sensor.chg': 0, 'sensor.dis': 0 })), 'Netz offline · Akku bereit');
// The words never carry the stage's watts.
for (const S of [st({ 'sensor.home': 513, 'sensor.solar': 0, 'sensor.grid': 513, 'sensor.chg': 0, 'sensor.dis': 0 })]) {
  assert.ok(!/\bW\b|kW/.test(words(S)), 'no watts in the status line');
}
// Only a power sensor: today's use, else a word.
assert.equal(E.statusWords({ home: 'sensor.home', today: 'sensor.today' }, Object.assign(st({ 'sensor.home': 300 }), { 'sensor.today': { state: '3.2', attributes: {} } }), null).main, 'Heute 3,2 kWh');
assert.equal(E.statusWords({ home: 'sensor.home' }, st({ 'sensor.home': 2 }), null).main, 'Kein Verbrauch');
assert.equal(E.statusWords({ home: 'sensor.home' }, st({ 'sensor.home': 'unavailable' }), null).main, 'Offline');

// Flow: the grid circle says „Offline“, not „—“.
const v = E.flowValues(F, st({ 'sensor.home': 513, 'sensor.solar': 0, 'sensor.grid': 'unavailable', 'sensor.chg': 0, 'sensor.dis': 0 }));
assert.equal(v.gridOff, true, 'grid offline detected');
const m = E.flowE1Model(v);
assert.equal(m.nodes.grid.w, null);
assert.equal(m.nodes.grid.off, true, 'grid node marked offline');
assert.ok(/n\.w == null && n\.off \? 'Offline'/.test(src), 'flow writes „Offline“ for an offline grid');
assert.equal(E.flowValues(F, st({ 'sensor.home': 513, 'sensor.solar': 0, 'sensor.grid': 513, 'sensor.chg': 0, 'sensor.dis': 0 })).gridOff, false);

// v3 layout: a status line field on top (lifted into the head), so the frame never falls back to „513 W“.
assert.ok(/f3\.hero = \{ card: secCard\(w3, 'return window\._casoraSoftEnergy \? window\._casoraSoftEnergy\.status3\(/.test(src), 'status line field');
assert.ok(/layout\(\{ fields: f3, top: \['hero'\]/.test(src), 'status line on top');
// Label: energy popups get the room, else „Zuhause“ (casora-core roomLabelOf).
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.ok(/return er \|\| 'Zuhause';/.test(core), 'energy label falls back to Zuhause');
console.log('energy_status_words: ok');
process.exit(0);
