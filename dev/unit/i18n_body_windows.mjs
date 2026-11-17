// Casora's windows on <body> are translated (#175, r151). The dashboard translation watches tiles and popups;
// a window Casora hangs on <body> (bell, menus, dialogs, search, screensaver) is outside them, so every text
// there had to call tr itself, and each one that forgot showed German in English. Now each such window
// carries data-casora-window and casora-i18n.js watches it.
//   1. Every element the dashboard scripts put on <body> carries the mark, or says on the same line why not
//      („// casora-window: none, <reason>“).
//   2. The runtime (casora-i18n.js on a small stand-in DOM): a marked window is translated, also text added
//      later and its shadow root; an unmarked element and own names (data-no-i18n) stay; German stays German.
//   node dev/unit/i18n_body_windows.mjs
// @deckt: custom_components/casora/scripts/casora-i18n.js#watchWindow,watchBody,rescan,watch
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { phrases } from './lib/i18n_phrases.mjs';

const ROOT = new URL('../../custom_components/casora/scripts/', import.meta.url);
let fails = 0;
const check = async (name, fn) => {
  try { await fn(); console.log('ok   ' + name); } catch (e) { fails++; console.log('FAIL ' + name + '\n     ' + e.message.split('\n').join('\n     ')); }
};

// ── 1. static: every element on <body> is marked or excused ────────────────────────────────────────────────
await check('every window on <body> carries data-casora-window or a stated reason', () => {
  const files = [];
  for (const dir of ['', 'local/']) {
    for (const f of fs.readdirSync(new URL(dir, ROOT))) if (f.endsWith('.js')) files.push(dir + f);
  }
  const PUT = /document\.(body|documentElement)\.(appendChild|append|prepend|insertBefore|insertAdjacentElement|replaceChildren)\(/;
  const bad = [];
  let sites = 0;
  for (const f of files) {
    fs.readFileSync(new URL(f, ROOT), 'utf8').split('\n').forEach((ln, i) => {
      if (!PUT.test(ln)) return;
      sites++;
      if (/setAttribute\('data-casora-window', ''\); document\.body\.appendChild\(/.test(ln)) return;
      if (/\/\/ casora-window: none, \S.{8,}$/.test(ln)) return;
      bad.push(f + ':' + (i + 1) + '  ' + ln.trim().slice(0, 120));
    });
  }
  assert.ok(sites >= 27, 'scan finds the known places (' + sites + ')');
  assert.deepEqual(bad, [], 'mark the window (el.setAttribute(\'data-casora-window\', \'\'); document.body.appendChild(el);) '
    + 'or say why it needs no translation (// casora-window: none, <reason>)');
});

// ── 2. runtime on a stand-in DOM ───────────────────────────────────────────────────────────────────────────
const observers = [];
let queue = [];
function notify(target, rec) {
  for (const o of observers) {
    for (let n = target, own = true; n; n = n.parentNode || n.host, own = false) {
      if (o.targets.has(n) && (own || o.targets.get(n).subtree)) {
        const opts = o.targets.get(n);
        if ((rec.type === 'childList' && opts.childList) || (rec.type === 'characterData' && opts.characterData)) {
          queue.push([o, rec]);
          if (queue.length === 1) queueMicrotask(flush);
        }
        break;
      }
    }
  }
}
function flush() { const q = queue; queue = []; q.forEach(([o, r]) => o.cb([r])); }
class MO { constructor(cb) { this.cb = cb; this.targets = new Map(); observers.push(this); } observe(t, o) { this.targets.set(t, o); } disconnect() {} }

class Text {
  constructor(v) { this.nodeType = 3; this.nodeName = '#text'; this._v = v; this.parentNode = null; }
  get data() { return this._v; }
  set data(v) { this._v = v; if (this.parentNode) notify(this, { type: 'characterData', target: this }); }
}
class Frag {
  constructor(host) { this.nodeType = 11; this.host = host; this.childNodes = []; this.parentNode = null; }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); notify(this, { type: 'childList', addedNodes: [c] }); return c; }
  querySelectorAll(sel) { return all(this).filter((e) => matches(e, sel)); }
}
class El extends Frag {
  constructor(tag) { super(null); this.nodeType = 1; this.localName = tag; this.nodeName = tag.toUpperCase(); this.attrs = {}; this.shadowRoot = null; this.host = undefined; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matches(n, sel)) return n; return null; }
  attachShadow() { this.shadowRoot = new Frag(this); return this.shadowRoot; }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
}
function matches(e, sel) {
  if (e.nodeType !== 1) return false;
  return sel.split(',').some((s) => (s = s.trim()) === '*' || (s[0] === '[' ? e.hasAttribute(s.slice(1, -1)) : e.localName === s));
}
function all(n) { const out = []; (function w(x) { for (const c of x.childNodes || []) { if (c.nodeType === 1) { out.push(c); w(c); } } })(n); return out; }
function texts(n) { const out = []; (function w(x) { for (const c of x.childNodes || []) { if (c.nodeType === 3) out.push(c); else w(c); } })(n); return out; }
const el = (tag, attrs = {}, ...kids) => { const e = new El(tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); kids.forEach((k) => e.appendChild(typeof k === 'string' ? new Text(k) : k)); return e; };

async function runtime(language) {
  observers.length = 0;
  const body = new El('body');
  const hass = { locale: { language }, language };
  const doc = {
    body, documentElement: new El('html'),
    querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
    querySelectorAll: (q) => [body, ...all(body)].filter((e) => matches(e, q)),
    createTreeWalker: (n) => { const t = texts(n); let i = 0; return { nextNode: () => t[i++] || null }; },
    addEventListener() {},
  };
  const win = { __casoraI18nPhrases: phrases(), Element: El, addEventListener() {}, setTimeout: () => 0, localStorage: { getItem: () => null, setItem() {} } };
  win.window = win;
  const src = fs.readFileSync(new URL('casora-i18n.js', ROOT), 'utf8');
  try {
    new Function('window', 'document', 'customElements', 'MutationObserver', 'NodeFilter', 'Element', 'localStorage', 'setTimeout', 'navigator', src)(
      win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, MO, { SHOW_TEXT: 4 }, El, win.localStorage, () => 0, { language });
  } catch (e) { /* parts that need a browser */ }
  assert.ok(win.casoraTr, 'translation loaded');
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { body, win, tick };
}

await check('English: a marked window is translated, also later text and its shadow root', async () => {
  const { body, win, tick } = await runtime('en');
  assert.equal(win.casoraTr('Gestern'), 'Yesterday');
  const menu = el('div', { 'data-casora-window': '' }, el('div', {}, 'Gestern'), el('span', { 'data-no-i18n': '' }, 'Aus'));
  const host = el('div', { 'data-casora-window': '' }); host.attachShadow().appendChild(el('span', {}, 'Aus'));
  const plain = el('div', {}, 'Gestern');
  body.appendChild(menu); body.appendChild(host); body.appendChild(plain);
  await tick();
  assert.equal(texts(menu)[0].data, 'Yesterday', 'text already in the window');
  assert.equal(texts(menu)[1].data, 'Aus', 'own names stay (data-no-i18n)');
  assert.equal(texts(host.shadowRoot)[0].data, 'Off', 'shadow root of a marked window');
  assert.equal(texts(plain)[0].data, 'Gestern', 'an unmarked element is left alone');
  // Painted after it went up (the bell's timeline, a refreshed menu entry).
  menu.appendChild(el('div', {}, el('small', {}, 'vor 2 Std.')));
  await tick(); await tick();
  assert.equal(texts(menu)[2].data, '2 h ago', 'text added later');
  texts(menu)[0].data = 'Aktiv · Zuhause';
  await tick(); await tick();
  assert.equal(texts(menu)[0].data, 'Active · Home', 'text changed later');
});

await check('a window that went up before the language arrived is caught by the rescan', async () => {
  const { body, win, tick } = await runtime('en');
  const early = el('div', { 'data-casora-window': '' }, 'Gestern');
  body.childNodes.push(early); early.parentNode = body;  // no mutation record: up before the watcher
  win.casoraTrRescan();
  await tick();
  assert.equal(texts(early)[0].data, 'Yesterday');
});

await check('German: the source language is not touched', async () => {
  const { body, tick } = await runtime('de');
  const menu = el('div', { 'data-casora-window': '' }, 'Gestern');
  body.appendChild(menu);
  await tick();
  assert.equal(texts(menu)[0].data, 'Gestern');
});

if (fails) { console.log(fails + ' failed'); process.exit(1); }
console.log('i18n_body_windows: ok');
