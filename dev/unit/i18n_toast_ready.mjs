// @deckt: custom_components/casora/panel/casora-panel-i18n.js#ready, custom_components/casora/panel/casora-panel-versions.js#hass
// Template-update toast in Studio: waits for the language table (window.casoraI18n.ready) before it
// builds the toast text and the log line, so a Dutch user gets Dutch even when nl.json arrives after
// the WebSocket reply. Loads the real Studio modules against a fake casora-panel.
// Node 22, no HA:  node dev/unit/i18n_toast_ready.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const PANEL = new URL('../../custom_components/casora/panel/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, PANEL), 'utf8');
const I18N = read('casora-panel-i18n.js').replace('import.meta.url', JSON.stringify('http://ha.local/casora_panel/casora-panel-i18n.js?v=1'));
const VERS = read('casora-panel-versions.js');
const NL = JSON.parse(read('i18n/nl.json'));
const DUTCH1 = '1 dashboard naar de nieuwe sjablonen gebracht – ongedaan maken via Tijdreis';
const DUTCH2 = '2 dashboards naar de nieuwe sjablonen gebracht – ongedaan maken via Tijdreis';
const ENGLISH1 = '1 dashboard brought up to the new templates – see Rewind to undo';
// The log line is the toast text, then the dashboard names.
const DUTCH1_LOG = DUTCH1 + ': Mock';
const ENGLISH1_LOG = ENGLISH1 + ': Mock';
const tick = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// nl: 'slow' (ms until nl.json arrives) | 'never' (fetch hangs) | 'fail' (network error).
function studio(nl) {
  const win = {};
  class Panel {
    constructor() { this._hass = null; this.style = {}; this.shadowRoot = null; this.events = []; this.logs = []; }
    get hass() { return this._hass; }
    set hass(h) { this._hass = h; }
    dispatchEvent(e) { this.events.push(e); }
    _log(msg) { this.logs.push(msg); }
  }
  let resolveDefined;
  const defined = new Promise((r) => { resolveDefined = r; });
  const ce = { whenDefined: () => defined, get: () => Panel };
  const requested = [];
  const fetchStub = (url) => {
    requested.push(url);
    if (!/\/i18n\/nl\.json/.test(url)) return Promise.resolve({ ok: false, status: 404 });
    if (nl === 'never') return new Promise(() => {});
    if (nl === 'fail') return Promise.reject(new Error('network down'));
    return new Promise((res) => setTimeout(() => res({ ok: true, json: async () => NL }), nl));
  };
  const ls = { getItem: () => null, setItem() {} };
  const doc = { querySelector: () => null, createElement: () => ({ style: {} }), addEventListener() {} };
  class CE { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const args = ['window', 'document', 'customElements', 'fetch', 'localStorage', 'navigator', 'location',
    'queueMicrotask', 'MutationObserver', 'CustomEvent'];
  const vals = [win, doc, ce, fetchStub, ls, { language: 'en-US' }, { href: 'http://ha.local/casora-studio' },
    queueMicrotask, class { observe() {} }, CE];
  // Same order as STUDIO_MODULES: i18n first, versions later.
  new Function(...args, I18N)(...vals);
  new Function(...args, VERS)(...vals);
  resolveDefined();
  return { win, requested, Panel };
}

// A panel that gets hass in the given language (the setter also sets the Studio language).
function panelFor(env, locale, { admin = false, count = 1 } = {}) {
  const p = new env.Panel();
  p.hass = {
    locale: { language: locale }, user: { is_admin: admin },
    callWS: async () => ({ notice: { count, dashboards: ['Mock'] } }),
  };
  return p;
}

// Waits until a toast arrives on the panel (or until the deadline); returns its message.
async function toastOf(p, deadlineMs = 4000) {
  const until = Date.now() + deadlineMs;
  for (;;) {
    const ev = p.events.find((e) => e.type === 'hass-notification');
    if (ev) return ev.detail.message;
    if (Date.now() > until) return '(no toast)';
    await sleep(10);
  }
}

// ready() must resolve within 50 ms (no waiting for a fetch).
async function assertReadyAtOnce(env, why) {
  assert.equal(typeof env.win.casoraI18n.ready, 'function', 'casoraI18n.ready exists');
  const r = await Promise.race([env.win.casoraI18n.ready().then(() => 'resolved'), sleep(50).then(() => 'late')]);
  assert.equal(r, 'resolved', why);
}

const nlFetches = (env) => env.requested.filter((u) => /\/i18n\/nl\.json/.test(u)).length;

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ': ' + e.message.split('\n')[0]]); }
}

await check('slow nl.json, count 1: toast and log line are Dutch, one fetch', async () => {
  const env = studio(30);
  await tick(); await tick();
  const p = panelFor(env, 'nl', { admin: true, count: 1 });
  assert.equal(await toastOf(p), DUTCH1);
  assert.equal(p.logs[0], DUTCH1_LOG);
  assert.equal(nlFetches(env), 1, 'nl.json fetched once');
});

await check('slow nl.json, count 2: Dutch with n = 2', async () => {
  const env = studio(30);
  await tick(); await tick();
  const p = panelFor(env, 'nl', { admin: true, count: 2 });
  assert.equal(await toastOf(p), DUTCH2);
});

await check('English locale: ready() resolves at once, no fetch', async () => {
  const env = studio(30);
  await tick(); await tick();
  panelFor(env, 'en');
  await assertReadyAtOnce(env, 'ready() resolves at once for English');
  assert.deepEqual(env.requested, [], 'nothing fetched for English');
});

await check('language without a table (xx): ready() resolves at once, no fetch', async () => {
  const env = studio(30);
  await tick(); await tick();
  panelFor(env, 'xx');
  await assertReadyAtOnce(env, 'ready() resolves at once without a table');
  assert.deepEqual(env.requested, [], 'nothing fetched for a language without a table');
});

await check('table already loaded: a second ready() resolves at once, no second fetch', async () => {
  const env = studio(30);
  await tick(); await tick();
  panelFor(env, 'nl');
  await env.win.casoraI18n.ready();
  assert.equal(nlFetches(env), 1, 'first load fetched nl.json once');
  panelFor(env, 'nl');
  await assertReadyAtOnce(env, 'ready() resolves at once when the table is loaded');
  assert.equal(nlFetches(env), 1, 'no second fetch');
});

await check('nl.json hangs: toast after one 3 s window, English toast and log line', async () => {
  const env = studio('never');
  await tick(); await tick();
  const p = panelFor(env, 'nl', { admin: true, count: 1 });
  const t0 = Date.now();
  const msg = await toastOf(p, 4000);
  const elapsed = Date.now() - t0;
  assert.equal(msg, ENGLISH1);
  assert.equal(p.logs[0], ENGLISH1_LOG);
  assert.ok(elapsed >= 2900 && elapsed < 3500, 'toast after about 3 s, not at once: ' + elapsed + ' ms');
});

await check('nl.json network error: toast English at once, ready() never rejects', async () => {
  const env = studio('fail');
  await tick(); await tick();
  const p = panelFor(env, 'nl', { admin: true, count: 1 });
  const t0 = Date.now();
  assert.equal(await toastOf(p), ENGLISH1);
  assert.ok(Date.now() - t0 < 1000, 'failed load does not wait for the 3 s window');
  assert.equal(p.logs[0], ENGLISH1_LOG);
  await env.win.casoraI18n.ready();
});

for (const [s, n] of results) console.log(s, n);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(failed ? `${failed} FAILED` : 'all i18n toast checks passed');
process.exit(failed ? 1 : 0);
