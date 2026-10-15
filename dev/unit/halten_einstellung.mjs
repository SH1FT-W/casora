// Studio-Einstellung „Halten auf Kacheln“ (Halten-Menü 22-halten.js).   node dev/unit/halten_einstellung.mjs
// - Studio › Bedienung › Kacheln: hold_mode ('' = Schnellmenü, popup, ha) dashboardweit, Rundlauf ohne Warnung.
// - casora_mobile_bg erklärt hold_mode → das Studio spiegelt den Wert ans Handy (mobileTargetsFor).
// - casora-core.js setzt window._casoraHoldMode ('menu' | 'popup' | 'ha') aus Raumkarte bzw. casora_mobile_bg.
// - Kachel-Inspektor: „Halten“ je Kachel (variables.hold_mode, leer = „Wie Dashboard (…)“ mit dem Dashboard-Wert),
//   in der Gruppe „Sichtbarkeit, Rückfrage & Halten“, mit Abstand zum Hinweis darüber.
// - „Kachel bearbeiten“ (?tile=): findet auch Kacheln in Hüllen und lässt die Vorschau dorthin blättern.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const dir = new URL('../../custom_components/casora/panel/', import.meta.url);
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const noop = () => {};
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = { addEventListener: noop, location: { pathname: '/' }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
globalThis.HTMLElement = class {};
globalThis.customElements = { get: () => null, define: noop, whenDefined: () => new Promise(() => {}) };
globalThis.document = stub();
globalThis.localStorage = { getItem: () => null, setItem: noop };
const log = console.info;
console.info = noop;
new Function(fix(fs.readFileSync(new URL('casora-panel-types.js', dir), 'utf8')))();
const src = read('custom_components/casora/panel/casora-panel.js');
new Function(fix(src))();
console.info = log;
const I = window.__casoraPanelInternals;
const clone = (x) => JSON.parse(JSON.stringify(x));

// ── Studio: Feld unter Bedienung › Kacheln ───────────────────────────────────────
const gen = I.SECTIONS.find((s) => s.label === 'General');
assert.ok(gen && gen.scope === 'dashboard', 'Bedienung ist dashboardweit');
assert.ok(gen.subs.some((s) => s.id === 'hold' && s.label === 'Tiles'), 'Unterabschnitt „Kacheln“');
const f = gen.fields.find((x) => x.key === 'hold_mode');
assert.ok(f, 'Feld hold_mode');
assert.equal(f.sub, 'hold');
assert.equal(f.type, 'select');
assert.equal(f.label, 'Hold on tiles');
assert.deepEqual(f.options, ['', 'popup', 'ha'], 'leer = Schnellmenü (Standard)');
assert.equal(f.optionLabels[''], 'Quick menu');
assert.ok(/under Visibility, ask first & hold\.$/.test(f.hint), 'Hinweis nennt den Weg zur Kachel-Einstellung');

// ── Rundlauf mit hold_mode an den Räumen und an einer Kachel ───────────────────────
const view = (path, name, vars, tiles) => ({
  type: 'custom:grid-layout', title: name, path, layout: { grid: 1 },
  cards: [
    { type: 'custom:button-card', template: 'casora_room', name, variables: vars },
    { type: 'vertical-stack', cards: [{ type: 'custom:casora-nav', routes: [{ url: '/casora-test/home', label: 'Home' }] }] },
    { type: 'custom:casora-smart-row', cards: tiles || [] },
  ],
});
const cfg = { views: [
  view('home', 'Home', { image: 'home-demo', casora_ui_managed: true, hold_mode: 'popup' },
    [{ type: 'custom:button-card', template: 'casora_light', entity: 'light.beispiel', variables: { hold_mode: 'ha' } }]),
  view('kueche', 'Küche', { image: 'kueche-demo', hold_mode: 'popup' },
    [{ type: 'custom:button-card', template: 'casora_cover', entity: 'cover.beispiel' }]),
] };
{
  const ex = I.extractAny(clone(cfg));
  assert.deepEqual(ex.warnings || [], [], 'keine Warnung beim Laden');
  assert.equal(ex.compact.rooms[0].variables.hold_mode, 'popup');
  assert.equal(ex.compact.rooms[0].tiles[0].variables.hold_mode, 'ha', 'Kachel behält ihre Einstellung');
  const back = I.expandAny(ex);
  assert.deepEqual(back, cfg, 'Rundlauf unverändert');
  const again = I.extractAny(back);
  assert.deepEqual(again.warnings || [], [], 'keine Warnung nach dem Speichern');
}

// ── Handy: casora_mobile_bg erklärt hold_mode (Spiegeln beim Bearbeiten und Speichern) ────
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const B = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const m = /^function mobileTargetsFor\(/m.exec(src);
const mobileTargetsFor = new Function(src.slice(m.index, src.indexOf('\n}', m.index) + 2) + '\nreturn mobileTargetsFor;')();
for (const [name, tpl] of [['Quelle', T], ['Paket', B]]) {
  assert.ok(mobileTargetsFor('hold_mode', tpl).includes('casora_mobile_bg'), name + ': hold_mode geht ans Handy');
  assert.ok(Object.prototype.hasOwnProperty.call(tpl.casora_room.variables, 'hold_mode'), name + ': casora_room erklärt hold_mode');
}

// ── casora-core: window._casoraHoldMode ────────────────────────────────────────
{
  const core = read('custom_components/casora/scripts/casora-core.js');
  const start = core.indexOf('(function () {\n  if (window._casoraHoldWatch) return;');
  assert.ok(start > 0, 'Block in casora-core.js');
  const block = core.slice(start, core.indexOf('})();\n', start) + 6);
  const listeners = {};
  const w = { addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); } };
  let config = null;
  const root = { isConnected: true, get lovelace() { return { config }; } };
  const doc = { querySelector: (s) => (s === 'hui-root' ? root : null), querySelectorAll: () => [] };
  new Function('window', 'document', 'setTimeout', block)(w, doc, noop);
  assert.equal(w._casoraHoldMode, 'menu', 'Standard: Schnellmenü');
  const of = w._casoraHoldModeOf;
  assert.equal(of(cfg), 'popup', 'Desktop: Raumkarte');
  assert.equal(of({ views: [view('home', 'Home', {})] }), 'menu', 'nichts gesetzt');
  assert.equal(of({ views: [view('home', 'Home', { hold_mode: 'quatsch' })] }), 'menu', 'Unbekanntes = Schnellmenü');
  const phone = { button_card_templates: { casora_mobile_bg: { variables: { hold_mode: null } } }, views: [{ path: 'home', cards: [
    { type: 'custom:layout-card', cards: [{ type: 'custom:button-card', template: 'casora_mobile_bg', variables: { image: 'home-demo', hold_mode: 'ha' } }] },
    { type: 'custom:casora-smart-row', cards: [{ type: 'custom:button-card', template: 'casora_light', entity: 'light.beispiel', variables: { hold_mode: 'popup' } }] },
  ] }] };
  assert.equal(of(phone), 'ha', 'Handy: casora_mobile_bg (auch verschachtelt), nicht die Kachel');
  assert.equal(of({ views: [{ cards: [{ type: 'custom:button-card', template: 'casora_mobile_bg' }] }] }), 'menu', 'Handy ohne Wert');
  // Vor jedem Drücken neu gelesen (ein Halten folgt immer einem pointerdown).
  config = cfg;
  listeners.pointerdown.forEach((fn) => fn());
  assert.equal(w._casoraHoldMode, 'popup');
  config = phone;
  listeners.keydown.forEach((fn) => fn());
  assert.equal(w._casoraHoldMode, 'ha', 'auch vor einer Taste (Kontextmenü-Taste)');
  config = { views: [view('home', 'Home', {})] };
  w._casoraHoldModeRefresh();
  assert.equal(w._casoraHoldMode, 'menu', 'zurückgestellt → wieder Schnellmenü');
}

// ── Kachel-Inspektor: „Halten“ je Kachel ───────────────────────────────────────
{
  const mehr = read('custom_components/casora/panel/casora-panel-b-mehr.js');
  const i = mehr.indexOf('const holdsTile = ');
  const holdsTile = new Function('return ' + mehr.slice(i + 'const holdsTile = '.length, mehr.indexOf(';\n', i)))();
  assert.equal(holdsTile({ type: 'custom:button-card', template: 'casora_light' }), true);
  assert.equal(holdsTile({ type: 'custom:button-card', template: ['casora_thermostat', 'casora_popup_fbh'] }), true);
  assert.equal(holdsTile({ type: 'custom:casora-swipe-card', cards: [] }), false, 'Karussell-Hülle nicht');
  assert.equal(holdsTile({ type: 'entities' }), false, 'fremde Karte nicht');
  assert.ok(mehr.includes('const HOLD_MODES = ["menu", "popup", "ha"];'), 'Werte wie vereinbart');
  assert.ok(/"": "Same as dashboard"/.test(mehr), 'leer = wie Dashboard');
  assert.ok(mehr.includes('inner.variables.hold_mode = v') && mehr.includes('delete inner.variables.hold_mode'), 'schreibt variables.hold_mode an der Kachel');
  // „Wie Dashboard (…)“: Wert des Dashboards (erster Raum mit hold_mode), sonst Schnellmenü.
  const j = mehr.indexOf('const dashHold = ');
  const dashHold = new Function('return ' + mehr.slice(j + 'const dashHold = '.length, mehr.indexOf('\n    };\n', j) + 6))();
  assert.equal(dashHold([]), 'menu', 'nichts gesetzt: Schnellmenü');
  assert.equal(dashHold([{ variables: {} }, { variables: { hold_mode: 'popup' } }]), 'popup', 'erster Raum mit Wert');
  assert.equal(dashHold([{ variables: { hold_mode: '' } }, { variables: { hold_mode: 'ha' } }]), 'ha', 'leer zählt nicht');
  assert.equal(dashHold([{ variables: { hold_mode: 'quatsch' } }]), 'menu', 'Unbekanntes = Schnellmenü');
  assert.equal(dashHold([null, {}]), 'menu', 'kaputte Räume');
  assert.ok(mehr.includes('fill(tr("Same as dashboard ({mode})"), { mode: tr(HOLD_LABELS[dashHold(rooms$(this))]) })'),
    'Auswahl zeigt den Dashboard-Wert');
  assert.ok(/\.mgroup > \* \+ \.row\.mhold \{ margin-top:12px; \}/.test(mehr), '„Halten“ mit Abstand zum Hinweis darüber');
  assert.equal((mehr.match(/way\("Tile", "Visibility, ask first & hold"\)/g) || []).length, 3, 'Suche nennt den neuen Gruppennamen');
  assert.ok(!mehr.includes('way("Tile", "Visibility & ask first")'), 'kein alter Weg in der Suche');
  // Gruppentitel nach Inhalt (casora-panel-b-ux.js).
  const ux = read('custom_components/casora/panel/casora-panel-b-ux.js');
  const k = ux.indexOf('const visTitle = ');
  const visTitle = new Function('return ' + ux.slice(k + 'const visTitle = '.length, ux.indexOf('\n    };\n', k) + 6))();
  const el = (...cls) => ({ querySelector: (q) => (cls.includes(q) ? {} : null) });
  assert.equal(visTitle(el('.row.mask', '.row.mhold')), 'Visibility, ask first & hold');
  assert.equal(visTitle(el('.row.mask')), 'Visibility & ask first');
  assert.equal(visTitle(el('.row.mhold')), 'Visibility & hold');
  assert.equal(visTitle(el()), 'Visibility');
  assert.equal(visTitle(null), 'Visibility');
}

// ── Übersetzungen ───────────────────────────────────────────────────────────────
{
  const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
  const want = { 'Hold on tiles': 'Halten auf Kacheln', 'Quick menu': 'Schnellmenü', 'Open popup': 'Popup öffnen',
    'Home Assistant dialog': 'Home-Assistant-Dialog', Hold: 'Halten', 'Same as dashboard': 'Wie Dashboard', Tiles: 'Kacheln',
    'Same as dashboard ({mode})': 'Wie Dashboard ({mode})', 'Visibility, ask first & hold': 'Sichtbarkeit, Rückfrage & Halten',
    'Visibility & hold': 'Sichtbarkeit & Halten',
    'What holding a tile does. A single tile can do something else – set it on the tile under Visibility, ask first & hold.':
      'Was Halten auf einer Kachel tut. Eine einzelne Kachel kann etwas anderes tun – einstellen an der Kachel unter „Sichtbarkeit, Rückfrage & Halten“.' };
  for (const [k, v] of Object.entries(want)) assert.equal(de[k], v, k);
}

// ── „Kachel bearbeiten“: Auswahl auch in Hüllen, Vorschau blättert hin ────────────────
{
  const at = src.indexOf('  _tileFromRoute() {');
  const body = src.slice(src.indexOf('{', at) + 1, src.indexOf('\n  }\n', at));
  const fn = new Function(body);
  const page = { type: 'custom:button-card', template: 'casora_light', entity: 'light.seite_zwei' };
  const carousel = { type: 'custom:casora-swipe-card', cards: [{ type: 'custom:button-card', template: 'casora_light', entity: 'light.seite_eins' }, page] };
  const stackIn = { type: 'custom:button-card', template: 'casora_switch', entity: 'switch.beispiel' };
  const rooms = [{ tiles: [{ type: 'custom:button-card', template: 'casora_light', entity: 'light.beispiel' }] },
    { tiles: [carousel, { type: 'horizontal-stack', cards: [stackIn] }] }];
  const keys = new Map();
  const mk = (want) => {
    const self = { _room: 0, _state: { compact: { rooms } }, picked: null, shown: null, tabs: 0,
      _renderTabs() { this.tabs++; }, _select(p) { this.picked = p; }, _tileRouteReveal(m) { this.shown = m; },
      _tileKey: (t) => { if (!keys.has(t)) keys.set(t, 'k' + keys.size); return keys.get(t); } };
    globalThis.window.location = { search: '?dash=d&tile=' + want, href: 'http://x/casora-studio/r?dash=d&tile=' + want };
    globalThis.window.history = { state: null, replaceState: noop };
    fn.call(self);
    return self;
  };
  let s = mk('light.seite_zwei');
  assert.equal(s._room, 1, 'Raum der Kachel');
  assert.equal(s.picked.key, keys.get(carousel), 'gewählt: das Karussell (Inspektor)');
  assert.deepEqual(s.shown, ['t:' + keys.get(carousel), 't:' + keys.get(page)], 'Vorschau: Karussell, sonst die Seite');
  s = mk('switch.beispiel');
  assert.deepEqual(s.shown[1], 't:' + keys.get(stackIn), 'Kachel in einer Reihe');
  s = mk('light.beispiel');
  assert.equal(s._room, 0);
  assert.equal(s.tabs, 0, 'gleicher Raum: keine Reiter neu');
  s = mk('light.gibt_es_nicht');
  assert.equal(s.picked, null, 'unbekannt: nichts gewählt');
  assert.ok(src.includes('_tileRouteReveal(mks) {') && /this\._bFlash\(hit\.mk\)/.test(src), 'Hervorheben über _bFlash');
}

console.log('ok halten_einstellung');
