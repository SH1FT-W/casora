// Updates popup: available updates grouped by kind (owner, 05.11.2026). Home Assistant (platform hassio), Marketplace
// (marketplace, older HA: hacs), Geräte (everything else: firmware, a router's network app, ...), in that order, each
// heading with its count; headings only when more than one kind has entries. Without a browser: _casoraUpdX from
// 03-popups.js and the Casora look's list (_casoraSoftUpd.sec('list'), 08-weich-kompakt.js) with a stub UI.
//   node dev/unit/updates_groups.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + f, import.meta.url), 'utf8');
const block = (src, start) => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n})();', i) + 6); };
const doc = { querySelector: () => null, addEventListener: () => {} };
const w = { addEventListener: () => {}, document: doc };
w.window = w;
const run = (code) => new Function('window', 'document', 'setTimeout', code)(w, doc, () => 0);
run(block(read('03-popups.js'), '(function () {\n  if (window._casoraUpdX) return;'));
run(block(read('08-weich-kompakt.js'), '(function () {\n  if (window._casoraSoftBat) return;'));
const X = w._casoraUpdX, U = w._casoraSoftUpd;
assert.ok(X && U, 'both blocks loaded');

// The motivating case: the router's firmware and the Marketplace integration for that router.
const upd = (name, extra) => ({ state: 'on', attributes: { friendly_name: name, title: name, installed_version: '1', latest_version: '2',
  in_progress: false, supported_features: 1, ...extra } });
const states = {
  'update.core': upd('Home Assistant Core'),
  'update.addon': upd('Mosquitto broker'),
  'update.router_integration': upd('UniFi Dream Router 7'),
  'update.router_firmware': upd('Dream Router 7 Firmware', { device_class: 'firmware' }),
  'update.drive': upd('UniFi Drive'),
  'update.legacy': upd('Old Card'),
};
const hass = { states, entities: {
  'update.core': { platform: 'hassio' }, 'update.addon': { platform: 'hassio' },
  'update.router_integration': { platform: 'marketplace' }, 'update.legacy': { platform: 'hacs' },
  'update.router_firmware': { platform: 'unifi' }, 'update.drive': { platform: 'unifi' },
} };

// ── kindOf / groups ──
assert.equal(X.kindOf('update.core', hass), 'ha');
assert.equal(X.kindOf('update.router_integration', hass), 'mp');
assert.equal(X.kindOf('update.legacy', hass), 'mp', 'older HA: HACS counts as Marketplace');
assert.equal(X.kindOf('update.router_firmware', hass), 'dev');
assert.equal(X.kindOf('update.unknown', hass), 'dev', 'not in the registry: a device');
assert.equal(X.kindOf('update.core', null), 'dev', 'no hass: one group');
const ids = Object.keys(states).sort();
assert.deepEqual(X.groups(ids, hass).map((g) => [g.label, g.ids]), [
  ['Home Assistant', ['update.addon', 'update.core']],
  ['Marketplace', ['update.legacy', 'update.router_integration']],
  ['Geräte', ['update.drive', 'update.router_firmware']],
], 'order of the kinds, order inside kept');
assert.deepEqual(X.groups(['update.drive', 'update.router_firmware'], hass).map((g) => [g.label, g.ids]),
  [[null, ['update.drive', 'update.router_firmware']]], 'one kind: no heading');
assert.deepEqual(X.groups(['update.core', 'update.drive'], hass).map((g) => g.label), ['Home Assistant', 'Geräte'], 'empty kinds left out');

// ── The Casora look's list (v3) ──
const UI = { soft: () => true, group: (rows, label) => '[' + (label || '-') + ':' + rows.map((r) => r.label).join('|') + ']',
  more: (id, html, o) => '{' + o.label + html + '}' };
w._casoraUI = UI;
const list = (st, h) => U.sec('list', {}, st, h).replace(/<div style="height:[^"]*"><\/div>/g, '');
assert.equal(list(states, hass),
  '[Home Assistant · 2:Home Assistant Core|Mosquitto broker][Marketplace · 2:Old Card|UniFi Dream Router 7][Geräte · 2:Dream Router 7|UniFi Drive]');
const only = { 'update.drive': states['update.drive'], 'update.router_firmware': states['update.router_firmware'] };
assert.equal(list(only, hass), '[Verfügbare Updates · 2:Dream Router 7|UniFi Drive]', 'one kind: the list as before');

// More than twelve: the first twelve grouped, the rest behind „Alle n anzeigen“; a kind running on keeps no second heading.
const many = {}, mh = { entities: {} };
for (let i = 1; i <= 10; i++) { const id = 'update.dev' + String(i).padStart(2, '0'); many[id] = upd('Device ' + String(i).padStart(2, '0')); }
for (let i = 1; i <= 4; i++) { const id = 'update.app' + i; many[id] = upd('App ' + i); mh.entities[id] = { platform: 'hassio' }; }
assert.equal(list(many, mh), '[Home Assistant · 4:App 1|App 2|App 3|App 4][Geräte · 10:Device 01|Device 02|Device 03|Device 04|Device 05|Device 06|Device 07|Device 08]'
  + '{Alle 14 anzeigen[-:Device 09|Device 10]}');

// ── Standard and glass look (X.list) ──
UI.soft = () => false;
const xl = X.list(states, { UI, logoOf: () => null, hass });
assert.ok(/^\[Home Assistant · 2:.*\]\[Marketplace · 2:.*\]\[Geräte · 2:.*\]$/.test(xl.replace(/<div style="height:[^"]*"><\/div>/g, '')), xl);
console.log('updates_groups: ok');
