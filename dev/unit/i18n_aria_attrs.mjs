// Screen reader names in the shown language (a11y round 14.11.2026): casoraTr translated only the text between tags, so
// a moon „Kühlen“ read „Cool“ on screen but its aria-label stayed „Kühlen“ – in English, Dutch, French and Polish a
// screen reader read German (thermostat modes, alarm modes, volume, „Hinzufügen“ in the shopping list …). The DOM
// watcher likewise fixed only text nodes, not aria-label/title/placeholder set on elements.
// Checks: aria-label, title, placeholder and alt in HTML are translated like text; other attributes, data-no-i18n and
// the German source language stay as written; the watcher translates those attributes on elements it sees.
//   node dev/unit/i18n_aria_attrs.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const CC = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, CC), 'utf8');
const DASH = read('scripts/casora-i18n.js');
const tick = () => new Promise((r) => setTimeout(r, 0));

// Minimal DOM for the watcher: elements with attributes, children and a shadow root.
class El {
  constructor(name, attrs = {}) { this.nodeType = 1; this.nodeName = name.toUpperCase(); this.localName = name; this.attrs = { ...attrs }; this.childNodes = []; this.parentNode = null; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  hasAttribute(k) { return k in this.attrs; }
  closest(sel) { let n = this; while (n && n.nodeType === 1) { if (sel === '[data-no-i18n]' && n.hasAttribute('data-no-i18n')) return n; n = n.parentNode; } return null; }
  append(...c) { c.forEach((x) => { x.parentNode = this; this.childNodes.push(x); }); return this; }
  all() { const out = []; (function w(n) { n.childNodes.forEach((c) => { if (c.nodeType === 1) { out.push(c); w(c); } }); })(this); return out; }
  querySelectorAll(sel) { return sel === '*' ? this.all() : this.all().filter((e) => sel.split(',').some((s) => { const m = /\[([\w-]+)\]/.exec(s.trim()); return m && e.hasAttribute(m[1]); })); }
}

function dash(language) {
  const H = { hass: { locale: { language } } };
  const observers = [];
  const doc = {
    querySelector: (q) => (q === 'home-assistant' ? H : /casora-i18n\.js/.test(q) ? { src: 'http://ha.local/casora_scripts/casora-i18n.js?v=1' } : null),
    addEventListener() {},
    createTreeWalker: () => ({ nextNode: () => null }),
  };
  const fetchStub = (url) => {
    const m = /\/casora_scripts\/i18n\/([a-z]+)\.json/.exec(url);
    return Promise.resolve(m ? { ok: true, text: async () => read('scripts/i18n/' + m[1] + '.json') } : { ok: false, status: 404 });
  };
  const store = new Map();
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  class MO { constructor(fn) { this.fn = fn; observers.push(this); } observe(root, opt) { this.root = root; this.opt = opt; } }
  const win = { dispatchEvent() {}, addEventListener() {} };
  try {
    new Function('window', 'document', 'customElements', 'MutationObserver', 'fetch', 'localStorage', 'location', 'navigator', 'NodeFilter', 'Element', DASH)(
      win, doc, { whenDefined: () => new Promise(() => {}), get: () => null }, MO, fetchStub, ls,
      { href: 'http://ha.local/lovelace/0' }, { language: 'de-DE' }, { SHOW_TEXT: 4 }, undefined);
  } catch (e) { /* parts that need a real browser */ }
  return { tr: win.casoraTr, win, observers };
}

{
  const d = dash('en');
  d.tr('Kühlen');
  await tick(); await tick(); await tick();
  assert.equal(d.tr('Kühlen'), 'Cool', 'English table loaded');
  const moon = '<div class="hui-moon on" role="button" aria-label="Kühlen" title="Heizen" style="--a:18%"><span>Kühlen</span></div>';
  const out = d.tr(moon);
  assert.ok(out.includes('aria-label="Cool"'), 'aria-label translated: ' + out);
  assert.ok(out.includes('title="Heat"'), 'title translated: ' + out);
  assert.ok(out.includes('<span>Cool</span>'), 'text still translated: ' + out);
  assert.ok(out.includes('style="--a:18%"'), 'other attributes stay as written: ' + out);
  assert.ok(d.tr('<input placeholder="Hinzufügen">').includes('placeholder="Add"'), 'placeholder translated');
  assert.ok(d.tr("<img alt='Hinzufügen'>").includes("alt='Add'"), 'single quotes too');
  assert.ok(d.tr(`<i aria-label="Livin' on" title="Hinzufügen"></i>`).includes('title="Add"'), "apostrophe in a double-quoted value");
  assert.ok(d.tr('<div data-casora-x="Kühlen" aria-labelledby="Kühlen"></div>').includes('data-casora-x="Kühlen" aria-labelledby="Kühlen"'), 'only name attributes');
  assert.ok(d.tr('<span data-no-i18n aria-label="Zuhause">Zuhause</span>').includes('aria-label="Zuhause">Zuhause'), 'data-no-i18n keeps the own name');
  // Escaped values (casoraEsc) are looked up as plain text and escaped again.
  assert.ok(d.tr('<b aria-label="Saugt &amp; wischt"></b>').match(/aria-label="[^"]*&amp;[^"]*"/), 'escaped value stays escaped: ' + d.tr('<b aria-label="Saugt &amp; wischt"></b>'));

  // Watcher: an element added with a German aria-label (set by code, not through casoraTr) is translated.
  const root = new El('#root');
  root.nodeType = 11;
  const host = { localName: 'button-card', shadowRoot: root };
  d.win.casoraTrWatch(root);
  const mo = d.observers.find((o) => o.root === root);
  assert.ok(mo, 'watcher observes the shadow root');
  assert.ok(mo.opt.attributes && (mo.opt.attributeFilter || []).includes('aria-label'), 'watcher also follows the name attributes: ' + JSON.stringify(mo.opt));
  const btn = new El('div', { role: 'button', 'aria-label': 'Lautstärke' });
  const own = new El('span', { 'data-no-i18n': '', 'aria-label': 'Zuhause' });
  root.append(btn, own);
  mo.fn([{ type: 'childList', addedNodes: [btn, own] }]);
  assert.equal(btn.getAttribute('aria-label'), 'Volume', 'added element: aria-label translated');
  assert.equal(own.getAttribute('aria-label'), 'Zuhause', 'data-no-i18n element keeps its name');
  btn.setAttribute('aria-label', 'Mähen');
  mo.fn([{ type: 'attributes', target: btn, attributeName: 'aria-label' }]);
  assert.equal(btn.getAttribute('aria-label'), 'Mow', 'changed aria-label translated');
  void host;
}
{
  const d = dash('de');
  assert.equal(d.tr('<div aria-label="Kühlen">Kühlen</div>'), '<div aria-label="Kühlen">Kühlen</div>', 'German source unchanged');
}
console.log('i18n_aria_attrs: ok');
