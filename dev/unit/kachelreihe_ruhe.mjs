// P-V2 (1.3): aktive Kacheln sortieren sich erst nach Ruhe um – nicht, solange jemand bedient,
// ein Popup offen ist oder die Maus über der Reihe steht.
//   node dev/unit/kachelreihe_ruhe.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const listeners = new Map();
const win = {
  addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); },
  removeEventListener: (t, fn) => listeners.get(t)?.delete(fn),
  matchMedia: () => ({ matches: false }),   // Desktop (keine Handy-Medienabfrage trifft)
  innerWidth: 1440,
};
let RowClass = null;
let now = 100000;
const timers = [];
const sandbox = {
  window: win, document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, getComputedStyle: () => ({ overflowX: 'auto' }), requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms }); return timers.length; }, clearTimeout() {}, ResizeObserver: class { observe() {} disconnect() {} },
  Date: { now: () => now },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'Klasse definiert');
assert.ok(listeners.get('pointerdown')?.size, 'Bedienung wird seitenweit gemerkt');

// Reihe ohne DOM: nur Zeitsteuerung prüfen.
const row = Object.create(RowClass.prototype);
row._sortEnabled = true;
row._sortTimer = null;
let sorted = 0;
row._applyOrder = () => { sorted++; };
let hover = false;
row.matches = () => hover;
// Nächsten fälligen Timer laufen lassen (Zeit springt vor).
const tick = () => { timers.sort((a, b) => a.at - b.at); const t = timers.shift(); now = Math.max(now, t.at); t.fn(); };
const tap = () => listeners.get('pointerdown').forEach((fn) => fn());

// 1) Zustand ändert sich, niemand bedient → nach SORT_DELAY sortiert.
win._casoraLastInput = 0;
row._scheduleSort();
tick();
assert.equal(sorted, 1, 'ohne Bedienung wird umsortiert');

// 2) Nutzer tippt weiter: jedes Tippen kurz vor Ablauf schiebt das Umsortieren.
row._scheduleSort();
now += 2400; tap();            // tippt 0,1 s vor Ablauf
tick();                        // Timer fällig → noch nicht ruhig
assert.equal(sorted, 1, 'direkt nach dem Tippen kein Umsortieren');
now += 1000; tap();            // tippt erneut
while (timers.length && sorted === 1) tick();
assert.equal(sorted, 2, 'nach Ruhe doch umsortiert');
assert.ok(now - win._casoraLastInput >= 2000, 'erst nach mindestens 2 s Ruhe');

// 3) Popup offen → wartet, bis es zu ist.
win.casoraPopup = { surface: {} };
row._scheduleSort();
for (let i = 0; i < 5; i++) tick();
assert.equal(sorted, 2, 'bei offenem Popup kein Umsortieren');
win.casoraPopup.surface = null;
tick();
assert.equal(sorted, 3, 'nach dem Schließen umsortiert');

// 4) Maus über der Reihe (Desktop) → wartet.
hover = true;
row._scheduleSort();
for (let i = 0; i < 5; i++) tick();
assert.equal(sorted, 3, 'Maus über der Reihe: kein Umsortieren');
hover = false;
tick();
assert.equal(sorted, 4, 'Maus weg: umsortiert');

// 5) Filterwechsel ohne Animation (Handy) bleibt sofort.
win._casoraNoFilterAnim = true;
now += 10; tap();
row._scheduleSort();
tick();
assert.equal(sorted, 5, 'Filterwechsel ordnet sofort');
console.log('ok kachelreihe_ruhe');
