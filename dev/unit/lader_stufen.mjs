// Loader casora-local.js (Ladezeit stages 1.3 and 3.1), run in a fake page without HA:
//  - the settings file is fetched only when the integration said there is one, with its version key
//    (cacheable), never with ?t= while a remembered answer names the key; without any remembered answer
//    (first open here) the old unversioned request stays;
//  - the modules never wait for the settings WebSocket;
//  - the start modules (00, 01, 04, 02, 03) run first, then "casora-local-started" (the phone's veil goes),
//    then the others in order with a yield in between, then "casora-local-loaded" as before;
//  - a changed file key in the fresh answer loads the new file and redraws once.
//   node dev/unit/lader_stufen.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Own small fake clock: setTimeout only collects the callbacks; advance(ms) runs the due ones in time order, so the
// test does not sleep. Nothing here reads the real clock.
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
// Runs the fake clock in steps until the page's loader has finished (its promise settles).
const settle = async (p) => {
  let done = false;
  p.then(() => { done = true; });
  for (let i = 0; i < 200 && !done; i++) await advance(20);
  return p;
};

const SRC = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-local.js', import.meta.url), 'utf8');
const ROW = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
// Number of local modules in the loader's list (one per '00-name' entry), not a fixed number.
const NMOD = (SRC.match(/^\s*'\d\d-[a-z0-9-]+',?\s*$/gm) || []).length;
const BASE = 'http://ha.test/casora_scripts/casora-local.js?v=123';

// The loader as a function: import() and import.meta.url replaced, run with top-level await inside.
const body = SRC.replace(/import\.meta\.url/g, '__META').replace(/\bimport\(/g, '__imp(');
const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;

async function run({ cache, ws, files = {}, slim = false }) {
  const log = [];          // order of imports and events
  const store = new Map();
  if (cache !== undefined) store.set('casora.settings.cache', JSON.stringify(cache));
  const listeners = {};
  let resolveWs;
  const wsAnswer = new Promise((r) => { resolveWs = r; });
  const kicks = [];
  const win = {
    _casoraFilter: {},
    casoraKickAll: (reason) => kicks.push(reason),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    dispatchEvent: (e) => { log.push('event:' + e.type); (listeners[e.type] || []).slice().forEach((f) => f(e)); return true; },
    _casoraHomeSlim: slim || undefined,
  };
  const hass = { connection: {}, callWS: () => (ws === 'never' ? new Promise(() => {}) : wsAnswer) };
  const doc = {
    querySelector: (s) => (s === 'home-assistant' ? { hass } : null),
    querySelectorAll: () => [],
    createElement: () => ({ style: {}, setAttribute() {} }),
    head: { appendChild() {} },
  };
  const imp = async (url) => {
    const u = String(url);
    log.push('import:' + u.replace('http://ha.test', ''));
    const m = /einstellungen\.js\?(.*)$/.exec(u);
    if (m && files[m[1]] !== undefined) win.CASORA_SETTINGS = files[m[1]];
    return {};
  };
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  // A yield: one message through a channel (a task of its own).
  class FakeChannel {
    constructor() {
      const self = this;
      this.port1 = { onmessage: null };
      this.port2 = { postMessage: () => { log.push('idle'); setTimeout(() => self.port1.onmessage && self.port1.onmessage({}), 0); } };
    }
  }
  const fn = new AsyncFn('window', 'document', 'localStorage', 'customElements', 'performance', 'location', '__imp', '__META', 'Event', 'MutationObserver', 'setTimeout', 'MessageChannel', body);
  const ce = { get: () => true, define() {}, whenDefined: () => new Promise(() => {}) };
  const loc = { search: '' };
  const Ev = class { constructor(t) { this.type = t; } };
  // The header-hide block uses matchMedia and a few globals of a page.
  win.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.window = win;
  // The header-hide block polls a few times with timers: only short timers run here.
  const st = (f, ms) => (ms > 50 ? 0 : setTimeout(f, ms));
  const done = fn(win, doc, ls, ce, { now: () => 0 }, loc, imp, BASE, Ev, class { observe() {} }, st, FakeChannel);
  return { done, log, win, kicks, store, answer: (r) => resolveWs(r), listeners };
}

const mods = (log) => log.filter((x) => x.startsWith('import:/casora_scripts/local/')).map((x) => x.replace(/^import:\/casora_scripts\/local\/|\.js\?v=123$/g, ''));
const fileReqs = (log) => log.filter((x) => x.includes('einstellungen.js'));

// 1) Remembered, stored settings: no file request at all; the modules run while the WebSocket never answers.
{
  const t = await run({ cache: { stored: true, settings: { scenes: { exclude: ['scene.a'] } }, file: 'k1' }, ws: 'never' });
  await settle(t.done);
  assert.deepEqual(fileReqs(t.log), [], 'stored settings: the file is not fetched');
  assert.deepEqual(t.win.CASORA_SETTINGS, { scenes: { exclude: ['scene.a'] } }, 'remembered settings in force');
  assert.equal(mods(t.log).length, NMOD, 'all modules ran without the WebSocket');
  assert.ok(Array.isArray(t.win._casoraLocalLoaded), 'loader finished');
}

// 2) Remembered: a file with version key → versioned (cacheable) request, never ?t=.
{
  const t = await run({ cache: { stored: false, settings: {}, file: 'abc-1' }, ws: 'never', files: { 'v=abc-1': { waste: { a: 1 } } } });
  await settle(t.done);
  assert.deepEqual(fileReqs(t.log), ['import:/casora_assets/einstellungen.js?v=abc-1'], 'versioned file URL');
  assert.deepEqual(t.win.CASORA_SETTINGS, { waste: { a: 1 } }, 'file settings in force');
}

// 3) Remembered: no file → no request.
{
  const t = await run({ cache: { stored: false, settings: {}, file: null }, ws: 'never' });
  await settle(t.done);
  assert.deepEqual(fileReqs(t.log), [], 'no file, no request');
}

// 4) First open (nothing remembered): the old unversioned request, the modules do not wait for the WebSocket.
{
  const t = await run({ cache: undefined, ws: 'never' });
  await settle(t.done);
  const f = fileReqs(t.log);
  assert.equal(f.length, 1, 'one file request');
  assert.match(f[0], /einstellungen\.js\?t=\d+$/, 'unversioned the first time');
  assert.equal(mods(t.log).length, NMOD, 'modules ran without the WebSocket');
}

// 5) Order: start modules, then casora-local-started (+ one redraw), then the rest with a yield before each.
{
  const t = await run({ cache: { stored: true, settings: {} }, ws: 'never' });
  await settle(t.done);
  const m = mods(t.log);
  assert.deepEqual(m.slice(0, 5), ['00-finder', '01-basis', '04-navigation', '02-devices', '03-popups'], 'start modules first');
  const iStart = t.log.indexOf('event:casora-local-started');
  const iSixth = t.log.findIndex((x) => x.includes('/local/' + m[5] + '.js'));
  const iFifth = t.log.findIndex((x) => x.includes('/local/03-popups.js'));
  assert.ok(iFifth < iStart && iStart < iSixth, 'casora-local-started between the start modules and the rest');
  assert.equal(t.log.filter((x) => x === 'idle').length, NMOD - 5, 'a yield before every late module');
  assert.ok(t.log.indexOf('event:casora-local-loaded') > t.log.lastIndexOf('idle'), 'casora-local-loaded after the last module');
  assert.deepEqual(t.win._casoraLocalStarted, m.slice(0, 5), 'start flag names the start modules');
  assert.deepEqual(t.kicks, ['modules-loaded'], 'no veil: one redraw at the end only');
  assert.deepEqual(m, t.win.casoraLocalModules.all, 'every module once, in the list order');
}

// 5b) Phone Home with a veil: the cards are drawn once more when the start modules are there.
{
  const t = await run({ cache: { stored: true, settings: {} }, ws: 'never', slim: true });
  await settle(t.done);
  assert.deepEqual(t.kicks, ['modules-started', 'modules-loaded'], 'veil: redraw after the start modules and at the end');
}

// 6) Fresh answer names a new file key: the new file runs, the tiles are drawn once more.
{
  const t = await run({ cache: { stored: false, settings: {}, file: 'old' }, files: { 'v=old': { a: 1 }, 'v=new': { a: 2 } } });
  await settle(t.done);
  t.answer({ stored: false, settings: {}, file: 'new' });
  await advance(20);
  assert.ok(fileReqs(t.log).includes('import:/casora_assets/einstellungen.js?v=new'), 'new file version loaded');
  assert.deepEqual(t.win.CASORA_SETTINGS, { a: 2 }, 'new file settings in force');
  assert.ok(t.kicks.includes('settings'), 'redraw for the changed settings');
  assert.equal(JSON.parse(t.store.get('casora.settings.cache')).file, 'new', 'key remembered for the next open');
}

// 7) Same answer as remembered: no second redraw, no second file request.
{
  const t = await run({ cache: { stored: false, settings: {}, file: 'k' }, files: { 'v=k': { a: 1 } } });
  await settle(t.done);
  t.answer({ stored: false, settings: {}, file: 'k' });
  await advance(20);
  assert.equal(fileReqs(t.log).length, 1, 'file fetched once');
  assert.ok(!t.kicks.includes('settings'), 'no redraw when nothing changed');
}

// 7b) Remembered answer without the key (older Casora) and a file: it runs unversioned once; the first stamped
//     answer names the same file – no second run, no redraw.
{
  const t = await run({ cache: { stored: false, settings: {} }, files: {} });
  await settle(t.done);
  t.answer({ stored: false, settings: {}, file: 'k9' });
  await advance(20);
  assert.equal(fileReqs(t.log).length, 1, 'file ran once');
  assert.match(fileReqs(t.log)[0], /\?t=\d+$/, 'the unversioned request');
  assert.ok(!t.kicks.includes('settings'), 'no redraw on account of the key');
}

// 7c) Stored settings removed in the Studio, no file: Casora's defaults again, drawn once more.
{
  const t = await run({ cache: { stored: true, settings: { a: 1 }, file: null } });
  await settle(t.done);
  t.answer({ stored: false, settings: {}, file: null });
  await advance(20);
  assert.equal(t.win.CASORA_SETTINGS, undefined, 'stored settings gone');
  assert.ok(t.kicks.includes('settings'), 'redraw');
}

// 7d) The file went away: its settings go too.
{
  const t = await run({ cache: { stored: false, settings: {}, file: 'k' }, files: { 'v=k': { a: 1 } } });
  await settle(t.done);
  t.answer({ stored: false, settings: {}, file: null });
  await advance(20);
  assert.equal(t.win.CASORA_SETTINGS, undefined, 'file settings gone');
  assert.ok(t.kicks.includes('settings'), 'redraw');
}

// 7e) Nothing remembered (first open, private mode) and the answer is Casora's defaults: no redraw.
{
  const t = await run({ cache: undefined });
  await settle(t.done);
  t.answer({ stored: false, settings: {}, file: null });
  await advance(20);
  assert.ok(!t.kicks.includes('settings'), 'defaults as started: no redraw');
}

// 7f) The answer arrives while the late modules still load: the redraw waits for casora-local-loaded.
{
  const t = await run({ cache: { stored: false, settings: {}, file: null } });
  t.answer({ stored: true, settings: { x: 1 } });
  await settle(t.done);
  await advance(20);
  assert.deepEqual(t.win.CASORA_SETTINGS, { x: 1 }, 'stored settings in force');
  assert.equal(t.kicks.filter((k) => k === 'settings').length, 1, 'one redraw');
  assert.ok(t.win._casoraLocalLoaded, 'loader finished');
}

// 8) smart-row lets the phone's veil go on the start modules.
assert.match(ROW, /window\._casoraLocalStarted \|\| window\._casoraLocalLoaded/, 'veil: start modules are enough');
assert.match(ROW, /addEventListener\('casora-local-started', this\._bootCheck\)/, 'veil listens for casora-local-started');

// 9) casora-preload.js: modulepreload links for the URLs in its own ?u=, Casora's scripts on this server only,
//    nothing on settings pages, nothing run.
const PRE = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-preload.js', import.meta.url), 'utf8');
const preRun = (pathname, w = {}) => {
  const links = [];
  const doc = { createElement: () => ({}), head: { appendChild: (l) => links.push(l) } };
  const loc = { pathname, href: 'http://ha.test' + pathname, origin: 'http://ha.test' };
  const u = '/casora_scripts/casora-i18n.js?v=1,/casora_scripts/casora-core.js?v=2,http://evil.test/casora_scripts/x.js,/local/y.js';
  new Function('window', 'document', 'location', '__META', PRE.replace(/import\.meta\.url/g, '__META'))(w, doc, loc,
    'http://ha.test/casora_scripts/casora-preload.js?v=5&u=' + u);
  return links;
};
const onDash = preRun('/dashboard-x/home');
assert.deepEqual(onDash.map((l) => [l.rel, l.href]), [['modulepreload', 'http://ha.test/casora_scripts/casora-i18n.js?v=1'],
  ['modulepreload', 'http://ha.test/casora_scripts/casora-core.js?v=2']], 'preload: own scripts with their ?v=, nothing else');
assert.equal(preRun('/config/integrations').length, 0, 'preload: not on settings pages');
assert.equal(preRun('/casora-studio').length, 0, 'preload: not in the Studio');
assert.equal(preRun('/dashboard-x/home', { casoraEsc: () => '' }).length, 0, 'preload: not on a page that already runs Casora');
assert.ok(!/\bimport\(/.test(PRE), 'preload runs nothing');

console.log('ok lader_stufen');
process.exit(0); // the WebSocket of some runs never answers on purpose
