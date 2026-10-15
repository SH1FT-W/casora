// Checkup 10/2026: Ohne Glocke im DOM durchsuchte announce() alle 2 s den ganzen Baum (findBells).
// Erwartet: nach einem Fehlschlag wachsende Pause (2 s, 4 s, … höchstens 30 s); location-changed
// setzt zurück, eine später geladene Glocke wird spätestens nach 30 s gefunden.
//   node dev/unit/checkup_scripts_glocke_suche.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const s0 = core.indexOf('(function () {\n  if (window._casoraNotify) return;');
assert.ok(s0 > 0, 'Mitteilungs-Modul gefunden');
const mod = core.slice(s0, core.indexOf('\n})();', s0) + 6);

let now = 1e12;
Date.now = () => now;
let searches = 0;
let bellRoot = null;   // erscheint später (Dashboard lädt verzögert)
const hass = { states: {}, entities: {}, devices: {}, areas: {}, callWS: () => Promise.resolve([]) };
const winL = {};
const intervals = [];
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.document = {
  readyState: 'complete', hidden: false, documentElement: {},
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  querySelectorAll: (q) => {
    if (q === '.casora-bell') { searches++; return bellRoot ? [bellRoot.glyph] : []; }
    return [];
  },
  addEventListener: () => {}, getElementById: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), head: { appendChild() {} },
};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.addEventListener = (t, fn) => { (winL[t] = winL[t] || []).push(fn); };
globalThis.dispatchEvent = () => true;
globalThis.setInterval = (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; };
globalThis.clearInterval = () => {};
globalThis.setTimeout = (fn) => { fn(); return 0; };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.CustomEvent = class { constructor(n, o) { this.type = n; this.detail = o && o.detail; } };
window.CASORA_SETTINGS = { notify: {} };
window._casoraLocalLoaded = [];

new Function(mod)();
// boot: Warte-Intervall (400 ms) einmal laufen lassen → Takt, location-changed, announce alle 2 s.
intervals.find((x) => x.ms === 400).fn();
const announce = intervals.find((x) => x.ms === 2000).fn;
assert.ok(announce, 'announce-Intervall');
assert.ok(winL['location-changed'] && winL['location-changed'].length, 'location-changed angemeldet');

const tickFor = (ms) => { let n0 = searches; for (let t = 0; t < ms; t += 2000) { now += 2000; announce(); } return searches - n0; };

searches = 0;
announce();                         // erster Fehlschlag
const per60 = tickFor(60000);
assert.ok(per60 <= 6, 'ohne Glocke selten suchen (60 s: ' + per60 + ' Suchen, früher 30)');
assert.ok(per60 >= 2, 'aber weiter suchen (' + per60 + ')');
// Pause wächst nicht über 30 s.
const per120 = tickFor(120000);
assert.ok(per120 >= 4, 'höchstens 30 s Pause (' + per120 + ' Suchen in 120 s)');

// location-changed: sofort wieder suchen.
searches = 0;
winL['location-changed'].forEach((fn) => fn());
assert.ok(searches >= 1, 'nach Navigation sofort gesucht');

// Glocke erscheint verzögert: spätestens nach ~30 s gefunden, danach keine Suche mehr.
const parent = { querySelector: () => null };
const count = { style: {}, textContent: '', isConnected: true, parentNode: parent };
const glyph = {
  getRootNode: () => ({ querySelector: (q) => (q === '.casora-bell-count' ? count : null), appendChild() {} }),
};
tickFor(20000);                      // Pause wieder groß
bellRoot = { glyph };
searches = 0;
tickFor(32000);
assert.ok(searches >= 1, 'später geladene Glocke gefunden');
const n1 = searches;
tickFor(20000);
assert.equal(searches, n1, 'gefundene Glocke: keine weitere Suche');
console.log('ok Glocke-Suche');
