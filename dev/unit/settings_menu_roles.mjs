// ⋯ menu (casora_settings_button): "Dashboard bearbeiten" opens the Studio, so only admins see it
// (Prüfung 2 fam-07); everyone gets "Home Assistant", the way back to HA's sidebar (E14).
//   node dev/unit/settings_menu_roles.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = T.casora_settings_button.tap_action.javascript.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');

// Just enough DOM to build the menu.
const el = (tag) => {
  const e = { tagName: tag, children: [], style: { setProperty() {}, removeProperty() {} }, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.children.push(c); return c; },
    getBoundingClientRect: () => ({ left: 0, right: 40, top: 0, bottom: 40, width: 40, height: 40 }),
    offsetWidth: 200, contains: () => false, remove() {}, textContent: '' };
  return e;
};
const run = (user) => {
  const body = el('body');
  globalThis.document = { querySelector: () => null, createElement: el, body, addEventListener() {}, removeEventListener() {} };
  globalThis.window = { matchMedia: () => ({ matches: true }), innerWidth: 393, addEventListener() {}, removeEventListener() {},
    location: { pathname: '/dash-mobile/home' } };
  const host = { shadowRoot: null, style: { setProperty() {}, removeProperty() {} }, getBoundingClientRect: () => ({ right: 380, bottom: 800 }) };
  new Function('hass', 'variables', 'user', src).call(host, { user }, {}, user);
  const menu = body.children[0];
  return menu.children.map((b) => b.children[1].textContent);
};

const admin = run({ is_admin: true, id: 'a' });
assert.ok(admin.includes('Dashboard bearbeiten'), 'admin keeps the Studio entry');
assert.ok(admin.includes('Home Assistant'), 'admin: way back to HA');
const kid = run({ is_admin: false, id: 'k' });
assert.ok(!kid.includes('Dashboard bearbeiten'), 'non-admin: no Studio entry (it did nothing)');
assert.ok(kid.includes('Aktualisieren') && kid.includes('Home Assistant'), 'non-admin keeps the rest');
console.log('settings_menu_roles: ok');
