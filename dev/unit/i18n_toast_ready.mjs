// @deckt: custom_components/casora/panel/casora-panel-i18n.js#ready, custom_components/casora/panel/casora-panel-versions.js#hass
// Template-update toast in Studio: waits for the language table (window.casoraI18n.ready) before it
// builds the text, so a Dutch user gets Dutch even when nl.json arrives after the WebSocket reply.
// Loads the real Studio modules against a fake casora-panel. Checks: Dutch for count 1 and 2,
// English locale resolves at once without a fetch, a missing nl.json gives English after at most 3 s.
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
const tick = () => new Promise((r) => setTimeout(r, 0));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// nl: 'slow' (ms) | 'never' | 'fail'. Returns the window, the requested URLs and a fresh panel factory.
function studio(nl) {
  const win = {};
  class Panel {
    constructor() { this._hass = null; this.style = {}; this.shadowRoot = null; this.events = []; }
    get hass() { return this._hass; }
    set hass(h) { this._hass = h; }
    dispatchEvent(e) { this.events.push(e); }
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

// Sets hass on a new panel and waits until a toast arrives (or until the deadline).
async function toastFor(env, { locale, count }, deadlineMs = 4000) {
  const p = new env.Panel();
  p.hass = {
    locale: { language: locale }, user: { is_admin: true },
    callWS: async () => ({ notice: { count, dashboards: ['Mock'] } }),
  };
  const until = Date.now() + deadlineMs;
  for (;;) {
    const ev = p.events.find((e) => e.type === 'hass-notification');
    if (ev) return ev.detail.message;
    if (Date.now() > until) return '(no toast)';
    await sleep(10);
  }
}

const results = [];
async function check(name, fn) {
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name + ': ' + e.message.split('\n')[0]]); }
}

await check('slow nl.json, count 1: toast is Dutch', async () => {
  const env = studio(30);
  await tick(); await tick();
  assert.equal(await toastFor(env, { locale: 'nl', count: 1 }), DUTCH1);
});

await check('slow nl.json, count 2: Dutch with n = 2', async () => {
  const env = studio(30);
  await tick(); await tick();
  assert.equal(await toastFor(env, { locale: 'nl', count: 2 }), DUTCH2);
});

await check('English locale: ready() resolves at once, no fetch', async () => {
  const env = studio(30);
  await tick(); await tick();
  const p = new env.Panel();
  p.hass = { locale: { language: 'en' }, user: { is_admin: false } };
  assert.equal(typeof env.win.casoraI18n.ready, 'function', 'casoraI18n.ready exists');
  const winner = await Promise.race([env.win.casoraI18n.ready().then(() => 'resolved'), sleep(50).then(() => 'late')]);
  assert.equal(winner, 'resolved');
  assert.deepEqual(env.requested, [], 'nothing fetched for English');
});

await check('nl.json never arrives: ready() resolves within 3 s, toast is English', async () => {
  const env = studio('never');
  await tick(); await tick();
  const p = new env.Panel();
  p.hass = { locale: { language: 'nl' }, user: { is_admin: false } };
  const t0 = Date.now();
  const res = await Promise.race([env.win.casoraI18n.ready().then(() => Date.now() - t0), sleep(3500).then(() => -1)]);
  assert.ok(res >= 0 && res < 3500, 'ready() resolved in time: ' + res + ' ms');
  assert.equal(await toastFor(env, { locale: 'nl', count: 1 }), ENGLISH1);
});

await check('nl.json fails to load: ready() never rejects, toast is English', async () => {
  const env = studio('fail');
  await tick(); await tick();
  const p = new env.Panel();
  p.hass = { locale: { language: 'nl' }, user: { is_admin: false } };
  await env.win.casoraI18n.ready();
  assert.equal(await toastFor(env, { locale: 'nl', count: 1 }), ENGLISH1);
});

for (const [s, n] of results) console.log(s, n);
const failed = results.filter(([s]) => s === 'FAIL').length;
console.log(failed ? `${failed} FAILED` : 'all i18n toast checks passed');
process.exit(failed ? 1 : 0);
