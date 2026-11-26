// u03-08 / u04-10 / d04-05 / d04-03 (owner 26.11.2026): the settings pages had four looks for "Advanced" (accent
// link with › on the right in the clock and bell sections, ⌄ in the waste block, a bold row at the page end) and three
// row forms (title 15 or 13 px, the sentence above or under the field). Now "Advanced" everywhere looks like the page's
// disclosure row (bold word in text colour, " ›" after it, " ⌄" open), every settings row has a 13 px title with
// its sentence right under it, and a section field's hint moves under its title.
//   node dev/unit/settings_one_form.mjs
// @deckt: casora-panel-settings.js#CSS,rowHints,trimCard,_csRowHints, casora-panel-personal.js#CSS
import fs from 'node:fs';
import assert from 'node:assert/strict';

const dir = new URL('../../custom_components/casora/panel/', import.meta.url);
const src = fs.readFileSync(new URL('casora-panel-settings.js', dir), 'utf8');
const pers = fs.readFileSync(new URL('casora-panel-personal.js', dir), 'utf8');

// Declarations of a selector in a source that writes its CSS as string pieces.
const decl = (text, sel) => {
  const i = text.indexOf(sel + '{');
  assert.ok(i >= 0, 'rule missing: ' + sel);
  const body = text.slice(i + sel.length + 1, text.indexOf('}', i));
  return Object.fromEntries(body.split(';').filter(Boolean).map((d) => { const k = d.indexOf(':'); return [d.slice(0, k).trim(), d.slice(k + 1).trim()]; }));
};

// ── One "Advanced" ──
const page = decl(src, '.cn-adv>summary b');
const section = decl(src, '.cn-block .adv>.advsum>span:not(.uxsum)');
const waste = decl(pers, '.frow.casora-pmore .rtext b');
for (const [name, d] of [['section fold', section], ['waste row', waste]]) {
  for (const k of ['font-size', 'font-weight', 'color']) assert.equal(d[k], page[k], name + ' ' + k + ' like the page row');
}
assert.equal(decl(src, ".cn-block .adv>.advsum>span:not(.uxsum)::after").content, "' ›'", 'section fold: › after the word');
assert.equal(decl(src, ".cn-block .adv.open>.advsum>span:not(.uxsum)::after").content, "' ⌄'", 'section fold: ⌄ when open');
assert.equal(decl(src, '.cn-block .adv>.advsum>svg').display, 'none', 'section fold: no arrow on the right');
assert.equal(decl(pers, '.frow.casora-pmore .rtext b::after').content, "' ›'", 'waste row: › after the word');
assert.equal(decl(pers, '.frow.casora-pmore.open .rtext b::after').content, "' ⌄'", 'waste row: ⌄ when open');
assert.equal(decl(pers, '.frow.casora-pmore .rchev').display, 'none', 'waste row: no chevron on the right');
assert.ok(!/\.cn-block \.adv>\.advsum span\{color:var\(--casora-studio-link/.test(src), 'no accent-link "Advanced" any more');
assert.ok(!/casora-pmore \.rtext b\{color:var\(--casora-studio-link/.test(pers), 'waste row: no accent link');

// ── One row form ──
assert.equal(decl(src, '.cn-block .frow:not(.hasicon):not(.casora-pmore) .rtext b')['font-size'], 'var(--t-foot)', 'flow row title 13 px like a field label');
assert.equal(decl(src, '.cn-block .frow:not(.hasicon):not(.casora-pmore) .rtext span')['font-size'], 'var(--t-caption)', 'flow row sentence 12 px');
assert.equal(decl(src, '.cn-block .row label .lsub')['white-space'], 'normal', 'a row sentence wraps');
// A label with a symbol in front is a flex line: the moved sentence went beside the title, out of the block (393, bell).
assert.equal(decl(src, '.cn-block .row>label.haslead:has(>.cn-rowhint)').display, 'grid', 'symbol label: sentence under the title');
assert.equal(decl(src, '.cn-block .row>label.haslead>.cn-rowhint')['grid-column'], '2', 'symbol label: sentence in the text column');

// A section field's hint moves under its row's title (tiny DOM).
const win = {}, P = {};
const node = (cls, kids = []) => {
  const n = { className: cls, children: [], parent: null };
  n.classList = { contains: (c) => n.className.split(/\s+/).includes(c) };
  Object.defineProperty(n, 'previousElementSibling', { get: () => { const s = n.parent && n.parent.children; const i = s ? s.indexOf(n) : -1; return i > 0 ? s[i - 1] : null; } });
  n.appendChild = (c) => { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = n; n.children.push(c); return c; };
  n.querySelector = (q) => {
    if (q === ':scope > label') return n.children.find((c) => c.tag === 'label') || null;
    if (q === '.lsub') { const walk = (x) => x.children.find((c) => c.classList.contains('lsub') || walk(c)); return walk(n) || null; }
    throw new Error('query ' + q);
  };
  n.querySelectorAll = (q) => { assert.equal(q, ':scope > .subcard'); return n.children.filter((c) => c.classList.contains('subcard')); };
  kids.forEach((k) => n.appendChild(k));
  return n;
};
const label = () => Object.assign(node(''), { tag: 'label' });
const doc = { createElement: () => ({ style: {}, classList: { add() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, appendChild() {} }), getElementById: () => null };
new Function('window', 'document', 'customElements', 'localStorage', src)(win, doc,
  { whenDefined: () => ({ then(f) { f(); } }), get: () => ({ prototype: P }) }, { getItem: () => null });
assert.equal(typeof P._csRowHints, 'function', 'row hint helper');

const l1 = label(), l2 = label(), l3 = label(), own = node('lsub');
l3.appendChild(own);
const r1 = node('row', [l1]), h1 = node('hint'), r2 = node('row', [l2]), r3 = node('row', [l3]), h3 = node('hint');
const plate = node('subcard', [r1, h1, r2, r3, h3]);
const foot = node('hint');
const card = node('cn-card', [plate, foot]);
P._csRowHints(card);
assert.equal(h1.parent, l1, 'the hint under a field sits under its title');
assert.equal(h1.className, 'lsub cn-rowhint', 'drawn as the row sentence');
assert.equal(h3.parent, plate, 'a row that has a sentence keeps the hint under it');
assert.equal(foot.parent, card, 'a hint after the plate (the block footer) stays');
assert.ok(/rowHints\(card\);/.test(src), 'trimCard runs it for every dashboard section');
console.log('settings_one_form: ok');
