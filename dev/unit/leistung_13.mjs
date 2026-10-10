// Leistung 1.3 („Schneller“): die drei behobenen Bremsen ohne Browser festhalten.
//   node dev/unit/leistung_13.mjs
// Gemessen mit dev/qa/leistung.mjs (Bericht bugfixrunde-1010/leistung):
//  1. layout-offsets.js lief je Takt (250 ms, nach Laden und nach jedem Raumwechsel ~5 s lang) sechsmal
//     durch alle Shadow-DOMs (querySelectorAll('*')) – jetzt einmal.
//  2. Am Handy holten Rückfrage (casora-core) und Szenenleiste (04-navigation) dieselbe ~2,5 MB große
//     Desktop-Konfiguration zweimal – jetzt einmal (window._casoraCfgOnce, eine Minute geteilt).
//  3. button-card meldete seinen „haptic“-Listener mit .bind(this) ab (neue Funktion, greift nie):
//     jede je eingehängte Karte blieb im Speicher – jetzt eine feste gebundene Funktion je Karte.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/scripts/' + p, import.meta.url), 'utf8');

// ── 1. layout-offsets: ein Durchlauf je Takt ──────────────────────────────────
{
  const src = read('layout-offsets.js');
  let star = 0;
  // Kleiner Baum: Dokument → 3 Hosts mit Shadow-Root, darin Kopf (#badges_media in #container),
  // Kachelreihe und Navigationsleiste.
  const el = (tag, extra = {}) => ({ localName: tag, id: '', shadowRoot: null, children: [], getBoundingClientRect: () => ({ width: 100, height: 40, bottom: 60 }),
    closest() { return this._container || null; }, querySelectorAll(sel) { return root(this).querySelectorAll(sel); }, ...extra });
  const root = (nodes) => ({ querySelectorAll(sel) {
    if (sel === '*') { star++; return nodes.all; }
    return nodes.all.filter((n) => (sel === '#badges_media' ? n.id === 'badges_media' : n.localName === sel));
  } });
  const container = el('div', { id: 'container' });
  const badges = el('div', { id: 'badges_media', _container: container });
  const row = el('casora-smart-row', { _scrollMode: false });
  const bar = el('casora-nav-bar'); bar.shadowRoot = root({ all: [el('div')] }); bar.shadowRoot.querySelector = () => el('div');
  const h1 = el('x-a'); h1.shadowRoot = root({ all: [container, badges] });
  const h2 = el('x-b'); h2.shadowRoot = root({ all: [row] });
  const docAll = [h1, h2, bar];
  const timers = [];
  const doc = { documentElement: { style: { setProperty() {} } }, querySelector: () => null, querySelectorAll: (sel) => (sel === '*' ? (star++, docAll) : docAll.filter((n) => n.localName === sel)) };
  const win = { addEventListener() {}, innerHeight: 900, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} disconnect() {} },
    requestAnimationFrame: (f) => f() };
  new Function('window', 'document', 'getComputedStyle', 'setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'requestAnimationFrame', 'ResizeObserver', 'MutationObserver',
    src)(win, doc, () => ({ display: 'block', visibility: 'visible', getPropertyValue: () => '', marginTop: '0', marginBottom: '0' }),
    (f, ms) => timers.push([f, ms]), (f) => { timers.push([f, 'iv']); return timers.length; }, () => {}, () => {}, win.requestAnimationFrame, win.ResizeObserver, class { observe() {} });
  const initHeader = timers.find((t) => t[1] === 200 && /initHeader|computeAndApplyHeader/.test(String(t[0])) ) || timers.filter((t) => t[1] === 200)[1];
  assert.ok(initHeader, 'initHeader geplant');
  star = 0;
  initHeader[0]();
  // Ein Durchlauf = Dokument + 3 Shadow-Roots = 4 Aufrufe (vorher 6 Durchläufe = 24).
  await Promise.resolve();
  assert.equal(star, 4, `ein Voll-Durchlauf je Takt (querySelectorAll('*') ${star}×)`);
  const tick = timers.find((t) => t[1] === 'iv');
  star = 0; tick[0](); await Promise.resolve();
  assert.equal(star, 4, `Intervall-Takt: ein Durchlauf (${star}×)`);
}

// ── 2. Partner-Konfiguration nur einmal holen ────────────────────────────────
{
  const core = read('casora-core.js');
  const i = core.indexOf('(function () {\n  if (window.__casoraAskFirst)');
  const block = core.slice(i, core.indexOf('})();\n', i) + 6);
  const w = { addEventListener() {}, location: { pathname: '/x-mobile/home' } };
  const doc = { querySelector: () => null, addEventListener() {}, removeEventListener() {}, body: {}, createElement: () => ({}) };
  new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout', block)(w, doc, WeakSet, class {}, () => {});
  assert.equal(typeof w._casoraCfgOnce, 'function');
  let calls = 0, fail = true;
  const hass = { callWS: (m) => { calls++; return fail ? Promise.reject(new Error('weg')) : Promise.resolve({ views: [m.url_path] }); } };
  await w._casoraCfgOnce(hass, 'x').catch(() => {});
  fail = false;
  const [a, b] = await Promise.all([w._casoraCfgOnce(hass, 'x'), w._casoraCfgOnce(hass, 'x')]);
  assert.equal(calls, 2, 'Fehler wird nicht gemerkt, gleichzeitige Abrufe teilen sich einen');
  assert.equal(a, b);
  await w._casoraCfgOnce(hass, 'x');
  assert.equal(calls, 2, 'innerhalb einer Minute aus dem Speicher');
  await w._casoraCfgOnce(hass, 'y');
  assert.equal(calls, 3, 'andere Adresse wird geholt');
  // 1.3: Partner nur noch als Auszug (casora/partner_info), ältere Integration: ganze Konfiguration.
  let pi = 0;
  const hass2 = { callWS: (m) => { if (m.type === 'casora/partner_info') { pi++; return Promise.resolve({ confirm: { ids: ['lock.a'], names: {} }, scenes: {} }); } calls++; return Promise.resolve({ views: [] }); } };
  const i1 = await w._casoraPartnerInfo(hass2, 'p');
  await w._casoraPartnerInfo(hass2, 'p');
  assert.equal(pi, 1, 'partner_info eine Minute geteilt');
  assert.deepEqual(i1.confirm.ids, ['lock.a']);
  const c0 = calls;
  const hass3 = { callWS: (m) => m.type === 'casora/partner_info' ? Promise.reject({ code: 'unknown_command' }) : (calls++, Promise.resolve({ views: [{ cards: [{ entity: 'lock.b', variables: { confirm_toggle: true } }] }] })) };
  const i2 = await w._casoraPartnerInfo(hass3, 'q');
  assert.equal(calls, c0 + 1, 'ältere Integration: Rückfall auf die ganze Konfiguration');
  assert.deepEqual(i2.confirm.ids, ['lock.b']);
  // 04-navigation nutzt denselben Weg.
  assert.match(read('local/04-navigation.js'), /window\._casoraPartnerInfo\(this\._hass, desk\)/);
}

// ── 3. button-card „haptic“: feste gebundene Funktion je Karte ───────────────
{
  const core = read('casora-core.js');
  const i = core.indexOf("(function () {\n  if (window.__casoraShadowRoom");
  assert.ok(i >= 0, 'button-card-Block');
  const block = core.slice(i, core.indexOf('})();\n', i) + 6);
  assert.match(block, /_hapticInterceptHandler/);
  let got = null;
  class Card { _hapticInterceptHandler(e) { got = [this, e]; if (this._hapticCapture) e.stopped = true; } }
  Card.elementStyles = [];
  const reg = { get: () => Card, whenDefined: () => Promise.resolve() };
  const w = { customElements: reg };
  new Function('window', 'customElements', 'CSSStyleSheet', 'setTimeout', block)(w, reg, class { replaceSync() {} }, () => {});
  await Promise.resolve(); await Promise.resolve();
  const c1 = new Card(), c2 = new Card();
  // So meldet button-card an und ab: window.add/removeEventListener('haptic', this._hapticInterceptHandler.bind(this), …)
  const f1 = c1._hapticInterceptHandler.bind(c1);
  assert.equal(c1._hapticInterceptHandler.bind(c1), f1, 'gleiche Funktion beim Abmelden');
  assert.notEqual(c2._hapticInterceptHandler.bind(c2), f1, 'je Karte eine eigene');
  c1._hapticCapture = true;
  const ev = {}; f1(ev);
  assert.equal(got[0], c1); assert.equal(ev.stopped, true, 'Verhalten unverändert');
}

console.log('leistung_13: ok');
