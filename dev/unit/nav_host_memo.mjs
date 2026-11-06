// Desktop room bar (casora-nav): every casora-nav card (one per view) looked for ha-app-layout with a walk through
// every shadow root of the page, on load and on each room change. HA no longer has ha-app-layout, so each walk
// ended at document.body (~875 querySelectorAll('*') per walk on the test house's desktop dashboard).
// Expected: one walk per dashboard (hui-root), the same host as before, a new walk once hui-root or the host changed.
//   node dev/unit/nav_host_memo.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('  function walkFind(root, selector, out, depth) {');
const b = core.indexOf('  class CasoraNav extends HTMLElement {', a);
assert.ok(a > 0 && b > a, 'walkFind … persistentHost found');

// Made-up page: home-assistant → home-assistant-main → partial-panel-resolver ha-panel-lovelace → hui-root,
// plus 50 tiles with shadow roots. Every querySelectorAll('*') counts as one step of a walk.
let star = 0;
const node = (name, kids = [], shadow = null) => {
  const n = { localName: name, isConnected: true, shadowRoot: shadow, kids };
  return n;
};
const root = (kids) => ({
  kids,
  all() { const out = []; const rec = (ks) => ks.forEach((k) => { out.push(k); rec(k.kids); }); rec(this.kids); return out; },
  querySelectorAll(sel) { if (sel === '*') { star++; return this.all(); } return this.all().filter((x) => x.localName === sel); },
  querySelector(sel) {
    const parts = sel.split(' ');
    let pool = this.all().filter((x) => x.localName === parts[0]);
    if (parts[1]) pool = pool.flatMap((p) => { const o = []; const rec = (ks) => ks.forEach((k) => { o.push(k); rec(k.kids); }); rec(p.kids); return o; }).filter((x) => x.localName === parts[1]);
    return pool[0] || null;
  },
});
let layout = null;
const page = () => {
  const tiles = Array.from({ length: 50 }, () => node('button-card', [], root([node('ha-card')])));
  const hr = node('hui-root', [], root(layout ? [layout, ...tiles] : tiles));
  const pl = node('ha-panel-lovelace', [], root([hr]));
  const ham = node('home-assistant-main', [], root([node('partial-panel-resolver', [pl])]));
  const ha = node('home-assistant', [], root([ham]));
  return { ha, hr, doc: root([ha]) };
};
let P = page();
const body = { localName: 'body', isConnected: true };
const document = {
  body,
  querySelector: (s) => (s === 'home-assistant' ? P.ha : null),
  querySelectorAll: (s) => P.doc.querySelectorAll(s),
};
const persistentHost = new Function('document', core.slice(a, b) + '\nreturn persistentHost;')(document);

// 1. Load: several casora-nav adopt the bar – one walk, the host stays document.body.
for (let i = 0; i < 6; i++) assert.equal(persistentHost(), body, 'no ha-app-layout: document.body');
const perWalk = star;
assert.ok(perWalk > 50, 'the first call walks the page');
for (let i = 0; i < 6; i++) persistentHost();
assert.equal(star, perWalk, `later calls on the same dashboard do not walk again (${star} vs ${perWalk})`);

// 2. Another dashboard (new hui-root): walks again.
P = page();
assert.equal(persistentHost(), body);
assert.equal(star, 2 * perWalk, 'a new hui-root walks once more');

// 3. A page that still has ha-app-layout (older frontend): found, and looked up again once it is gone.
layout = node('ha-app-layout');
P = page();
assert.equal(persistentHost(), layout, 'ha-app-layout found as before');
const s3 = star;
assert.equal(persistentHost(), layout);
assert.equal(star, s3, 'remembered while connected');
layout.isConnected = false;
assert.equal(persistentHost(), body, 'gone: walked again, falls back to body');
assert.ok(star > s3, 'walked again');

// 4. No hui-root reachable (other panel): walks every time, as before.
const ha = P.ha; P.ha = null;
const s4 = star;
persistentHost(); persistentHost();
assert.ok(star > s4 + 1, 'without hui-root nothing is remembered');
P.ha = ha;
console.log('ok nav_host_memo');
