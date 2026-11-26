// CasoraPopup keyboard focus: a scrolling .content is a tab stop; right after open (focus on .content) Tab and
// Shift+Tab stay inside the popup.
//   node dev/unit/popup_tab_scroll_focus.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#_syncScrollStop,_trapTab,close
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = src.indexOf('    _syncScrollStop() {');
const b = src.indexOf('    dismiss() {', a);
assert.ok(a > 0 && b > a, 'popup focus methods found');
const body = src.slice(a, b);
// Real methods in a bare class; deepFocus is injected.
const Popup = new Function('deepFocus', 'document', `return class { ${body} }`)(() => active, { body: {}, documentElement: {} });
let active = null;

const el = (extra = {}) => {
  const attrs = { tabindex: '-1' };
  const o = { tabIndex: -1, disabled: false, hidden: false, scrollHeight: 100, clientHeight: 100, focused: 0,
    matches: () => true, getBoundingClientRect: () => ({ width: 10, height: 10 }),
    getAttribute: (k) => attrs[k], setAttribute(k, v) { attrs[k] = String(v); if (k === 'tabindex') o.tabIndex = Number(v); },
    focus() { active = o; }, ...extra };
  return o;
};
const make = (scrolls) => {
  const content = el({ scrollHeight: scrolls ? 500 : 100 });
  const btn1 = el({ tabIndex: 0 }), btn2 = el({ tabIndex: 0 });
  const p = new Popup();
  const kids = [btn1, content, btn2];
  Object.assign(p, { content, surface: el(), shadowRoot: { querySelectorAll: () => kids },
    hasAttribute: (k) => k === 'open', _owns: () => true });
  return { p, content, btn1, btn2 };
};
const tab = (p, shiftKey) => { let stopped = false; p._trapTab({ shiftKey, preventDefault() { stopped = true; } }); return stopped; };

// Scrolls: tabindex 0, in the tab order.
let t = make(true);
t.p._syncScrollStop();
assert.equal(t.content.getAttribute('tabindex'), '0');
assert.deepEqual(t.p._focusables(), [t.btn1, t.content, t.btn2], 'scrolling content is a tab stop');

// Does not scroll: stays -1, no extra tab stop; and goes back to -1 when it stops scrolling.
t = make(false);
t.p._syncScrollStop();
assert.equal(t.content.getAttribute('tabindex'), '-1');
assert.deepEqual(t.p._focusables(), [t.btn1, t.btn2], 'short content adds no tab stop');
t = make(true); t.p._syncScrollStop(); t.content.scrollHeight = 100; t.p._syncScrollStop();
assert.equal(t.content.getAttribute('tabindex'), '-1', 'back to -1 when it no longer scrolls');

// First Tab after open (focus on the content, no tab stop): into the popup, never out.
t = make(false);
active = t.content;
assert.equal(tab(t.p, false), true, 'Tab prevented');
assert.equal(active, t.btn1, 'Tab → first focusable');
active = t.content;
assert.equal(tab(t.p, true), true, 'Shift+Tab prevented');
assert.equal(active, t.btn2, 'Shift+Tab → last focusable');

// Same order as a long popup's: from the content, Tab goes to the content's first control (not back up to the head),
// Shift+Tab to the head's last one. btn1/hd2 stand in the head, row1/row2 in the content (row2 inside a card's root).
{
  t = make(false);
  const hd2 = el({ tabIndex: 0 }), row1 = el({ tabIndex: 0, parentNode: t.content });
  const card = { host: row1 }, row2 = el({ tabIndex: 0, parentNode: card });
  const kids = [t.btn1, hd2, t.content, row1, row2];
  t.p.shadowRoot = { querySelectorAll: () => kids };
  active = t.content;
  assert.equal(tab(t.p, false), true, 'Tab prevented');
  assert.equal(active, row1, 'Tab from the content → its first control, not the head');
  active = t.content;
  assert.equal(tab(t.p, true), true, 'Shift+Tab prevented');
  assert.equal(active, hd2, 'Shift+Tab from the content → the head\'s last control');
}

// A 1px rounding difference is no scroll: no tab stop.
t = make(false); t.content.scrollHeight = 101; t.p._syncScrollStop();
assert.equal(t.content.getAttribute('tabindex'), '-1', 'rounding adds no tab stop');

// Wiring: the scroll check (scroll, resize of content/container/extra, after open) syncs the tab stop; close resets it.
const more = src.slice(src.indexOf('var moreCheck = () => {'), src.indexOf('this._moreCheck = moreCheck;'));
assert.match(more, /this\._syncScrollStop\(\)/, 'moreCheck syncs the tab stop');
assert.match(src, /this\._moreRO\.observe\(this\._extra\)/, 'extra entities resize the scroll check');
const fin = src.slice(src.indexOf("        this.removeAttribute('more-below');"), src.indexOf("this.surface.style.removeProperty('transform');"));
assert.match(fin, /this\.content\.setAttribute\('tabindex', '-1'\)/, 'close resets the tab stop');
console.log('ok popup_tab_scroll_focus');
