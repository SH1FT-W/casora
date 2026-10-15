// Checkup 10/2026: Kachelreihe – das Intervall, das den Größen-Stempel „groß“ erneuert, lief weiter,
// wenn die Kachel wieder klein wurde, und blieb nach dem Ende als toter Merker stehen (kein Neustart).
//   node dev/unit/checkup_scripts_groesse_intervall.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

let RowClass = null;
const timers = new Map(); let n = 0;
const sandbox = {
  window: { addEventListener() {}, removeEventListener() {} },
  document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: () => ({ style: {} }) },
  customElements: { define: (x, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class {}, getComputedStyle: () => ({}), requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  setTimeout: () => 0, clearTimeout() {}, ResizeObserver: class { observe() {} disconnect() {} },
  setInterval: (fn) => { timers.set(++n, fn); return n; }, clearInterval: (id) => timers.delete(id),
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'Klasse definiert');
const row = Object.create(RowClass.prototype);
let stamps = 0;
row._stampLargeFill = () => { stamps++; };
const w = { dataset: { size: 'large' }, isConnected: true };

row._scheduleLargeFill(w);
assert.equal(timers.size, 1, 'Intervall läuft');
const id = w._casoraLargeFillInterval;
timers.get(id)();
assert.equal(stamps, 1, 'groß: stempelt');
delete w.dataset.size;                  // wieder klein
timers.get(id)();
assert.equal(stamps, 1, 'klein: kein Stempel mehr');
assert.equal(timers.size, 0, 'klein: Intervall beendet');
assert.equal(w._casoraLargeFillInterval, null, 'Merker zurückgesetzt');
w.dataset.size = 'large';
row._scheduleLargeFill(w);
assert.equal(timers.size, 1, 'wieder groß: Intervall neu gestartet');
w.isConnected = false;
timers.get(w._casoraLargeFillInterval)();
assert.equal(timers.size, 0, 'ausgehängt: beendet');
assert.equal(w._casoraLargeFillInterval, null);
console.log('ok groesse_intervall');
