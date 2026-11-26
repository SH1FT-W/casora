// Empty room line (Prüfrunde u10-01): only admins may open the Studio. A non-admin saw "Noch keine Geräte – im Studio
// hinzufügen" as a link; tapping it opened /casora-studio and HA sent them to another dashboard without a word.
// Expected: admins keep the link, everyone else gets the plain line "Noch keine Geräte" without plus, role or click.
//   node dev/unit/empty_room_hint_admin.mjs
// @deckt: custom_components/casora/scripts/smart-row.js#_buildEmptyHint
import fs from 'node:fs';
import assert from 'node:assert/strict';

let RowClass = null;
const mkEl = () => {
  const el = { attrs: {}, listeners: {}, classes: new Set(), style: {}, _html: '',
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    addEventListener(t, f) { this.listeners[t] = f; },
    classList: null, lastChild: { textContent: '' } };
  el.classList = { add: (c) => el.classes.add(c) };
  Object.defineProperty(el, 'className', { set(v) { el.classes.add(v); }, get() { return [...el.classes].join(' '); } });
  Object.defineProperty(el, 'innerHTML', { set(v) { el._html = v; el.lastChild = { textContent: '' }; }, get() { return el._html; } });
  return el;
};
const win = { addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }), innerWidth: 1440,
  location: { pathname: '/qa/system' } };
const sandbox = {
  window: win,
  document: { body: null, addEventListener() {}, documentElement: { style: { setProperty() {} } }, createElement: mkEl },
  customElements: { define: (n, c) => { RowClass = c; }, get: () => null, whenDefined: () => new Promise(() => {}) },
  HTMLElement: class { dispatchEvent() { return true; } },
  getComputedStyle: () => ({ display: 'flex' }),
  requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {},
  ResizeObserver: class { observe() {} disconnect() {} },
};
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/smart-row.js', import.meta.url), 'utf8');
new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));
assert.ok(RowClass, 'casora-smart-row defined');
assert.equal(typeof RowClass.prototype._buildEmptyHint, 'function', 'hint has its own builder');

const row = (user) => Object.assign(Object.create(RowClass.prototype), { _hass: user ? { user } : null });

const admin = row({ is_admin: true })._buildEmptyHint();
assert.equal(admin.attrs.role, 'link', 'admin: link');
assert.ok(admin.innerHTML.includes('mdi:plus'), 'admin: plus');
assert.equal(admin.lastChild.textContent, 'Noch keine Geräte – im Studio hinzufügen');
assert.equal(typeof admin.listeners.click, 'function', 'admin: opens the Studio');

const child = row({ is_admin: false })._buildEmptyHint();
assert.equal(child.attrs.role, undefined, 'non-admin: no link role');
assert.ok(!child.innerHTML.includes('mdi:plus'), 'non-admin: no plus');
assert.equal(child.lastChild.textContent, 'Noch keine Geräte', 'non-admin: plain line');
assert.equal(child.listeners.click, undefined, 'non-admin: nothing to tap');

// Without hass yet: the page's user (window.casoraIsAdmin).
win.casoraIsAdmin = () => false;
assert.equal(row(null)._buildEmptyHint().listeners.click, undefined, 'no hass yet: page user decides');
console.log('empty_room_hint_admin: ok');
