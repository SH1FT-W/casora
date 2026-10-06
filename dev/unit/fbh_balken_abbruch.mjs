// B-JS-01: FBH-/Thermostat-Popup – bricht iOS das Ziehen am Temperatur-Balken ab (touchcancel),
// darf das nächste Wischen irgendwo die Temperatur nicht umstellen.
//   node dev/unit/fbh_balken_abbruch.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/03-popups.js', import.meta.url), 'utf8');
const a = src.indexOf('  /* ── Eingaben: Raum antippen → Raum-Popup; Temperaturbalken tippen/ziehen ── */');
const b = src.indexOf("  window.addEventListener('mouseup', function () { barEnd(); }, true);", a);
assert.ok(a > 0 && b > a, 'Balken-Block gefunden');
const block = src.slice(a, src.indexOf('\n', b) + 1);

const L = {};
const calls = [];
const window = { addEventListener: (t, fn) => { (L[t] = L[t] || []).push(fn); } };
const document = { querySelector: () => ({ hass: { callService: (...x) => calls.push(x) } }) };
new Function('window', 'document', 'open', 'fmt', block)(window, document, () => {}, (v) => String(v));
const barEl = {
  isConnected: true,
  getAttribute: () => JSON.stringify({ id: 'climate.bad', lo: 5, hi: 30, step: 0.5 }),
  getBoundingClientRect: () => ({ left: 0, width: 100 }),
  querySelector: (q) => (q === '.fb-tb-t' ? { getBoundingClientRect: () => ({ left: 0, width: 100 }) } : null), getRootNode: () => null,
  hasAttribute: (n) => n === 'data-fb-bar',
};
const ev = (target, x) => ({ composedPath: () => [target], target, touches: [{ clientX: x }], changedTouches: [{ clientX: x }],
  cancelable: true, preventDefault() {}, stopPropagation() {} });
const fire = (t, e) => (L[t] || []).forEach((fn) => fn(e));
const other = { hasAttribute: () => false, getAttribute: () => null };

fire('touchstart', ev(barEl, 50));
fire('touchcancel', ev(barEl, 50));
fire('touchmove', ev(other, 90));
fire('touchend', ev(other, 90));
assert.equal(calls.length, 0, 'nach touchcancel kein set_temperature beim nächsten Wischen');

// Normales Ziehen stellt weiter ein …
fire('touchstart', ev(barEl, 50));
fire('touchmove', ev(barEl, 60));
fire('touchend', ev(barEl, 60));
assert.equal(calls.length, 1, 'Ziehen stellt ein');
// … aber nicht, wenn das Popup inzwischen geschlossen ist.
fire('touchstart', ev(barEl, 50));
barEl.isConnected = false;
fire('touchend', ev(barEl, 50));
assert.equal(calls.length, 1, 'geschlossenes Popup: nichts einstellen');
console.log('ok fbh_balken_abbruch');
