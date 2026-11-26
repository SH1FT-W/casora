// "Start empty" (Prüfrunde u01-03): the phone dashboard of a new, empty Casora dashboard showed "Home" on a German
// HA instead of "Zuhause". _createMobileSibling wrote the overview's name marker (home_auto) only when a room had
// tiles. Now it is written whenever the desktop rooms are known, tiles or not.
//   node dev/unit/handy_leer_zuhause.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_createMobileSibling,markPhoneManaged
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const grabFn = (re) => {
  const m = re.exec(src); assert.ok(m, 'not found: ' + re);
  return src.slice(m.index, src.indexOf('\n}', m.index) + 2);
};
const one = (re) => { const m = re.exec(src); assert.ok(m, 'not found: ' + re); return m[0]; };
// The method body, up to its closing brace at two spaces.
const mi = src.indexOf('  async _createMobileSibling(');
assert.ok(mi > 0, '_createMobileSibling');
const method = src.slice(mi, src.indexOf('\n  }\n', mi) + 4).replace('async _createMobileSibling(', 'async function _createMobileSibling(');

const code = [
  one(/^const clone = .*$/m),
  one(/^const MOBILE_NAV = .*$/m),
  one(/^const HOME_ROOM_NAME = .*$/m),
  one(/^const isDefaultHomeName = .*$/m),
  one(/^const isHomeRoom = [^;]*;/ms),
  one(/^const AUTO_HOME = .*$/m),
  one(/^const isLiteralName = .*$/m),
  one(/^const isAutoHome = .*$/m),
  one(/^const isDefaultHome = .*$/m),
  grabFn(/^function markPhoneManaged\(/m),
  'const MOBILE_FAVORITES = "Favorites"; const FINGERPRINT_KEY = "fp"; const fingerprintOf = () => "x";',
  'const st0 = () => ({ chrome: { extraCards: [] } });',
  'const mobileFromRooms = () => st0(); const blankMobileState = () => st0();',
  'const expandAny = () => ({ views: [{ cards: [{ type: MOBILE_NAV }, { type: "custom:button-card", template: "casora_mobile_weather", variables: {} }] }] });',
  'const applyScenePick = () => {}; const applyMotion = () => {}; const applyKiosk = () => {}; const dropRetiredVars = () => {};',
  method,
  'return _createMobileSibling;',
].join('\n');
const fn = new Function(code)();

const saved = [];
const self = {
  _dashList: [], _log() {},
  _hass: { callWS: async (m) => { if (m.type === 'lovelace/config/save') saved.push(m.config); return {}; } },
};
const rooms = [
  { path: 'home', name: 'Home', tiles: [], variables: { casora_auto_name: 'home' } },
  { path: 'kueche', name: 'Küche', tiles: [], variables: {} },
];
const ok = await fn.call(self, 'casora-x', 'Casora', ['Küche'], { mobile: {}, templates: {} }, rooms);
assert.equal(ok, true, 'phone layout created');
const [nav, head] = saved[0].views[0].cards;
assert.equal(head.variables.home_auto, true, 'phone title is Casora\'s own overview name (translated: "Zuhause")');
assert.equal(nav.home_auto, true, 'phone bar too');
console.log('ok handy_leer_zuhause');
