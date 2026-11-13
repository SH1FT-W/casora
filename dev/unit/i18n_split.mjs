// Translation per language (Ladezeit stage 1, 01.11.2026): casora-i18n.js (dashboard) and casora-panel-i18n.js
// (Studio) carry only the source language; every other language is one file (scripts/i18n/<lang>.json,
// panel/i18n/<lang>.json) fetched when it is shown. Before, every page loaded all 8 languages (1 MB / 1.4 MB).
// Checks: size budget, all languages built, only the shown language is fetched (with the runtime's ?v=),
// texts translate once it is there, a language change fetches the new one.   node dev/unit/i18n_split.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
// Own small fake clock: setTimeout only collects the callbacks; advance(ms) runs the due ones in time order, so the
// test does not sleep.
// Date.now moves with it, so the code's own time checks see the same time.
const realNow = Date.now;
const realClear = globalThis.clearTimeout;
const FAKE = Symbol('fake timer');
let fakeNow = 0;
const fakeQueue = [];
globalThis.setTimeout = (fn, ms = 0, ...args) => {
  const t = { fn, args, at: fakeNow + (Number(ms) || 0), dead: false, [FAKE]: true };
  fakeQueue.push(t);
  return t;
};
globalThis.clearTimeout = (t) => (t && t[FAKE] ? (t.dead = true) : realClear(t));
Date.now = () => realNow() + fakeNow;
const advance = async (ms) => {
  const end = fakeNow + ms;
  await new Promise((r) => setImmediate(r));
  for (let due; (due = fakeQueue.filter((t) => !t.dead && t.at <= end).sort((a, b) => a.at - b.at)[0]); ) {
    fakeQueue.splice(fakeQueue.indexOf(due), 1);
    fakeNow = Math.max(fakeNow, due.at);
    due.fn(...due.args);
    await new Promise((r) => setImmediate(r));
  }
  fakeNow = end;
};

const CC = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, CC), 'utf8');
const langs = (d) => fs.readdirSync(new URL(d, CC)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
const tick = () => advance(0);

// ── Budget and completeness ───────────────────────────────────────────────────
const DASH = read('scripts/casora-i18n.js');
const PANEL = read('panel/casora-panel-i18n.js');
assert.ok(DASH.length < 40 * 1024, 'casora-i18n.js stays small (only German inline): ' + DASH.length);
assert.ok(PANEL.length < 30 * 1024, 'casora-panel-i18n.js stays small (only English inline): ' + PANEL.length);
const srcDash = fs.readdirSync(new URL('translations/dashboard/phrases/', CC)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((l) => l !== 'de').sort();
const srcPanel = fs.readdirSync(new URL('translations/panel/', CC)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((l) => l !== 'en').sort();
assert.deepEqual(langs('scripts/i18n/'), srcDash, 'one dashboard phrases file per language (tools/build-i18n.py)');
assert.deepEqual(langs('panel/i18n/'), srcPanel, 'one Studio file per language (tools/build-panel-i18n.py)');
for (const l of srcDash) {
  const built = JSON.parse(read('scripts/i18n/' + l + '.json'));
  const src = JSON.parse(read('translations/dashboard/phrases/' + l + '.json'));
  assert.equal(Object.keys(built.exact).length, Object.values(src.exact || {}).filter((v) => typeof v === 'string').length, l + ': all exact phrases built');
  assert.equal(built.patterns.length, (src.patterns || []).length, l + ': all patterns built');
}
for (const l of srcPanel) {
  const built = JSON.parse(read('panel/i18n/' + l + '.json'));
  const src = JSON.parse(read('translations/panel/' + l + '.json'));
  assert.deepEqual(built, { exact: src.exact || {}, patterns: src.patterns || [] }, l + ': Studio table built unchanged');
}

// ── Dashboard runtime ─────────────────────────────────────────────────────────
function dash(language, { remembered = null, hass = true } = {}) {
  const calls = [];
  const store = new Map(remembered ? [['casora.i18n.lang', remembered]] : []);
  const H = { hass: hass ? { locale: { language } } : null };
  const win = { dispatchEvent() {}, addEventListener() {} };
  const doc = {
    querySelector: (q) => (q === 'home-assistant' ? H : /casora-i18n\.js/.test(q) ? { src: 'http://ha.local/casora_scripts/casora-i18n.js?v=1234' } : null),
    addEventListener() {},
  };
  const fetchStub = (url) => {
    calls.push(url);
    const m = /\/casora_scripts\/i18n\/([a-z]+)\.json\?v=1234$/.exec(url);
    if (!m) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, text: async () => read('scripts/i18n/' + m[1] + '.json') });
  };
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  try {
    new Function('window', 'document', 'customElements', 'MutationObserver', 'fetch', 'localStorage', 'location', 'navigator', DASH)(
      win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, class { observe() {} }, fetchStub, ls,
      { href: 'http://ha.local/lovelace/0' }, { language: 'de-DE' });
  } catch (e) { /* DOM watcher without a browser */ }
  return { tr: win.casoraTr, calls, H, store };
}

{
  const d = dash('de');
  assert.equal(d.calls.length, 0, 'German: nothing fetched (source language inline)');
  assert.equal(d.tr('62%'), '62 %', 'German rules still apply');
}
{
  const d = dash('fr');
  assert.equal(d.tr('Gerät fehlt'), 'Gerät fehlt', 'French: German until the file is there');
  await tick(); await tick(); await tick();
  assert.deepEqual(d.calls, ['http://ha.local/casora_scripts/i18n/fr.json?v=1234'], 'French: one file, with the runtime ?v=');
  assert.notEqual(d.tr('Gerät fehlt'), 'Gerät fehlt', 'French: translated once it arrived');
  assert.equal(d.store.get('casora.i18n.lang'), 'fr', 'language remembered for the next start');
  // Language change: the new one is fetched (after 1.5 s when it differs from last time's), French stays loaded.
  d.H.hass = { locale: { language: 'en' } };
  d.tr('Gerät fehlt');
  await advance(1700);
  await tick(); await tick();
  assert.equal(d.calls.length, 2, 'language change fetches the new language: ' + d.calls.join(', '));
  assert.equal(d.tr('Gerät fehlt'), 'Device missing', 'English after the change');
}
{
  const d = dash('sv');
  d.tr('Gerät fehlt');
  await tick(); await tick(); await tick();
  assert.deepEqual(d.calls, ['http://ha.local/casora_scripts/i18n/en.json?v=1234'], 'language without a table: English fallback only');
  assert.equal(d.tr('Gerät fehlt'), 'Device missing');
}
{
  const d = dash('pt-BR');
  d.tr('Gerät fehlt');
  await tick(); await tick(); await tick();
  assert.deepEqual(d.calls, ['http://ha.local/casora_scripts/i18n/pt.json?v=1234'], 'regional variant: base language file');
}
{
  // Before HA knows the user: only the guess (browser de-DE → nothing to fetch), never the fallback 'en'.
  const d = dash('en', { hass: false });
  d.tr('Gerät fehlt');
  await tick();
  assert.equal(d.calls.length, 0, 'no hass, German browser: nothing fetched');
}

// ── Studio runtime ────────────────────────────────────────────────────────────
{
  const body = PANEL.replace('import.meta.url', JSON.stringify('http://ha.local/casora_panel/casora-panel-i18n.js?v=26.11.2.99'));
  const calls = [];
  const fetchStub = (url) => {
    calls.push(url);
    const m = /\/casora_panel\/i18n\/([a-z]+)\.json\?v=26\.11\.2\.99$/.exec(url);
    if (!m) return Promise.resolve({ ok: false, status: 404 });
    return Promise.resolve({ ok: true, json: async () => JSON.parse(read('panel/i18n/' + m[1] + '.json')) });
  };
  const win = {};
  const store = new Map();
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const doc = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: 'de' } } } : null) };
  new Function('window', 'document', 'customElements', 'fetch', 'localStorage', 'navigator', 'location', 'queueMicrotask', 'MutationObserver', body)(
    win, doc, { whenDefined: () => new Promise(() => {}) }, fetchStub, ls, { language: 'en-US' }, { href: 'http://ha.local/casora-studio' }, queueMicrotask, class { observe() {} });
  await tick(); await tick(); await tick();
  assert.deepEqual(calls, ['http://ha.local/casora_panel/i18n/de.json?v=26.11.2.99'], 'Studio: the user language only, with the Studio ?v=');
  assert.equal(typeof win.casoraI18n.t, 'function');
}

console.log('i18n_split: ok');
