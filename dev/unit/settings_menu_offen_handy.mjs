// Prüfrunde u06-06 / d01-04: in the phone bar the ⋯ button stayed unmarked while its menu was open, while the bell,
// Rooms and Scenes show a tone circle in a light ring. Expected: open sets the same look on the docked ⋯, every close
// undoes it; outside the bar (not docked) the phone keeps the plain button.
//   node dev/unit/settings_menu_offen_handy.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_settings_button
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = T.casora_settings_button.tap_action.javascript.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');

const el = (tag) => ({ tagName: tag, children: [], style: { setProperty() {}, removeProperty() {} }, attrs: {},
  setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; },
  getBoundingClientRect: () => ({ left: 0, right: 40, top: 0, bottom: 40, width: 40, height: 40 }),
  offsetWidth: 200, contains: () => false, remove() {}, textContent: '' });
const props = () => {
  const m = new Map();
  return { m, setProperty(k, v) { m.set(k, v); }, removeProperty(k) { m.delete(k); } };
};
const open = (docked) => {
  const body = el('body');
  const ext = [];
  globalThis.document = { querySelector: () => null, createElement: el, body, addEventListener() {}, removeEventListener() {} };
  globalThis.window = { matchMedia: () => ({ matches: true }), innerWidth: 393, addEventListener() {}, removeEventListener() {},
    location: { pathname: '/dash-mobile/home' }, _hmnExt: (k, on) => ext.push(k + ':' + on) };
  // host -> shadow root of the capsule -> capsule -> holder -> .hmn-dock (or a plain page node)
  const dock = { classList: { contains: (c) => docked && c === 'hmn-dock' }, parentNode: null };
  const holder = { classList: { contains: () => false }, parentNode: dock };
  const capsule = { classList: { contains: () => false }, parentNode: holder, _config: { template: 'casora_mobile_chrome' }, shadowRoot: null };
  const shadow = { nodeType: 11, host: capsule };
  const host = { shadowRoot: null, style: props(), parentNode: shadow, getRootNode: () => shadow,
    getBoundingClientRect: () => ({ right: 380, bottom: 800 }) };
  new Function('hass', 'variables', 'user', src).call(host, { user: { is_admin: true } }, {}, { is_admin: true });
  return { host, menu: body.children[0], ext };
};

const d = open(true);
assert.equal(d.host.style.m.get('--casora-settings-fill'), 'var(--primary-color, #B67A50)', 'docked + open: tone circle');
assert.equal(d.host.style.m.get('--casora-settings-ink'), '#fff', 'docked + open: white glyph');
assert.ok(/0 0 0 7px/.test(d.host.style.m.get('--casora-chrome-btn-shadow') || ''), 'docked + open: light ring like the bell');
d.menu._close();
assert.equal(d.host.style.m.size, 0, 'closing removes the mark: ' + [...d.host.style.m.keys()]);
assert.deepEqual(d.ext, ['settings:true', 'settings:false']);

const f = open(false);
assert.equal(f.host.style.m.size, 0, 'phone without the bar: plain button as before');
f.menu._close();
console.log('settings_menu_offen_handy: ok');
