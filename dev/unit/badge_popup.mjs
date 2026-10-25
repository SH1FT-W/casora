// Own badge with the tap "Own popup" (#60) without HA: the badge's popup settings (b.popup) become the Universal tile's
// variables, the row card builds the badge with casora_popup_own_badge (built on casora_popup_free), the popup is the
// Universal tile's (values, 24 h history, controls, own cards; a template badge's text as the status line), the popup
// header takes the badge's colour and icon, and the Studio composes the popup with the tile's fields and own cards.
// All devices and names are invented.   node dev/unit/badge_popup.mjs
import assert from 'node:assert/strict';
import { freeTileEnv, stubKit, stubUI, src } from './lib/free_tile_env.mjs';

const { F, states, hass } = freeTileEnv();

// ── Dashboard module in the same bare window ───────────────────────────────────
class Node0 {
  constructor() { this.style = {}; this.isConnected = true; this.children = []; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
}
globalThis.HTMLElement = Node0;
globalThis.customElements = { _d: {}, get(n) { return this._d[n]; }, define(n, c) { this._d[n] = c; } };
globalThis.location = { pathname: '/qa-haus/home' };
globalThis.casoraIconUrl = (n) => '/casora_assets/icons/' + n + '.svg';
new Function(src('custom_components/casora/scripts/local/29-eigene-badges.js'))();
const CB = window._casoraCustomBadge;

const POPUP = { free_values: ['sensor.qa_temp', 'binary_sensor.qa_tuer'], free_value_labels: { 'sensor.qa_temp': 'Innen' },
  free_chart: true, free_chart_entity: 'sensor.qa_temp', free_controls: true,
  popup_extra_cards: [{ type: 'markdown', content: 'Hallo' }], popup_extra_title: 'Mehr' };
const devBadge = { name: 'Pumpe', entity: 'switch.qa_pumpe', icon: 'mdi:water-pump', color: 'var(--casora-color-blue, #5B8FC9)', tap: 'own_popup', popup: POPUP };
const tplBadge = { name: 'Sonne', template: "{{ states('sun.sun') }}", icon: 'light', tap: 'own_popup', popup: { free_values: ['sensor.qa_temp'] } };

// ── Settings → variables ──────────────────────────────────────────────────────
assert.equal(CB.hasPopup(devBadge), true);
assert.equal(CB.hasPopup({ ...devBadge, tap: 'popup' }), false);
assert.deepEqual(CB.popupVars(devBadge), POPUP, 'the tile keys pass as they are');
assert.deepEqual(CB.popupVars({ entity: 'switch.qa_pumpe', tap: 'own_popup', popup: { free_values: [], free_chart: '', evil: 1, free_controls: false } }),
  { free_values: [], free_controls: false }, 'only the popup keys, empty strings dropped, false kept');
assert.deepEqual(CB.popupVars(tplBadge), { free_values: ['sensor.qa_temp'], free_template: "{{ states('sun.sun') }}" }, 'template badge: its text for the status line');
assert.deepEqual(CB.popupVars({ tap: 'own_popup', popup: ['x'] }), {}, 'a list is no popup');
assert.equal(CB.tap(devBadge, 'room'), null, 'own popup: the template supplies the action');
assert.equal(CB.tap(devBadge, 'phone'), null, 'same on the phone');
assert.equal(CB.popupTitle(devBadge, states['switch.qa_pumpe']), 'Pumpe');
assert.equal(CB.popupTitle({ entity: 'switch.qa_pumpe' }, states['switch.qa_pumpe']), 'pumpe', 'friendly name without own name');
assert.equal(CB.popupTitle({ template: 'x' }, null), 'Badge');

// ── Row card: the badge card for an own popup ───────────────────────────────────
const made = [];
window.loadCardHelpers = () => Promise.resolve({ createCardElement: (cfg) => { made.push(cfg); const el = new Node0(); el.classList = { add() {} }; el.setConfig = () => {}; return el; } });
const Row = customElements.get('casora-custom-badges');
const row = new Row();
row.setConfig({ badges: [devBadge, { ...tplBadge }, { entity: 'light.qa_stehlampe', tap: 'popup' }], place: 'phone' });
await new Promise((r) => setImmediate(r));
assert.equal(made.length, 3);
const [c0, c1, c2] = made;
assert.deepEqual(c0.template, ['casora_badge_custom', 'casora_popup_own_badge']);
assert.equal(c0.entity, 'switch.qa_pumpe');
assert.equal(c0.tap_action, undefined, 'no own tap_action: casora_popup_base opens the popup (or more-info without Casora popups)');
assert.equal(c0.variables.place, 'phone');
assert.deepEqual(c0.variables.free_values, POPUP.free_values);
assert.deepEqual(c0.variables.popup_extra_cards, POPUP.popup_extra_cards, 'own cards where casoraPopupExtras reads them');
assert.equal(c0.variables.badge.popup, undefined, 'popup settings only once (button-card evaluates variables deeply)');
assert.equal(c0.variables.badge.name, 'Pumpe');
assert.equal(devBadge.popup, POPUP, 'the stored badge is not changed');
assert.equal(c1.variables.free_template, tplBadge.template);
assert.equal(c1.entity, undefined);
assert.equal(c2.template, 'casora_badge_custom', 'other taps keep the plain badge');
assert.deepEqual(c2.tap_action, { action: 'more-info', entity: 'light.qa_stehlampe', haptic: 'light' });

// ── Popup: the Universal tile's, from the badge's variables ─────────────────────
stubKit();
window._casoraUI = {};
let L = F.popup(states['switch.qa_pumpe'], states, hass, c0.variables);
assert.deepEqual(Object.keys(L.fields), ['hero', 'chart', 'ctl', 'vals', 'more'], 'values, history and controls as configured');
assert.deepEqual(L.fields.chart.card.series, [{ entity: 'sensor.qa_temp', name: 'temp', unit: '°C' }]);
assert.equal(F.wide(states['switch.qa_pumpe'], states, c0.variables), true, 'controls + values: two columns');
L = F.popup(null, states, hass, c1.variables);
assert.deepEqual(Object.keys(L.fields), ['hero', 'vals'], 'template badge: status line and values, no controls');
const UI = stubUI();
const C = F.plan(null, states, hass, c1.variables);
assert.equal(C.tpl, tplBadge.template);
assert.equal(F.sec('hero', C, states, hass), '<line>…|</line>', 'template text still loading');
window._casoraTemplates._subs[tplBadge.template] = { text: 'above_horizon', error: null, cbs: new Set() };
assert.equal(F.sec('hero', C, states, hass), '<line>above_horizon|</line>', 'the template text as the status line');
assert.equal(F.sec('vals', C, states, hass), '<group Werte>sensor.qa_temp:temp=21,5 °C</group>');
assert.match(F.sec('hero', F.plan(null, states, hass, { free_template: tplBadge.template }), states, hass), /<note>Im Studio kannst du/, 'nothing configured: hint');
assert.equal(F.plan(states['switch.qa_pumpe'], states, hass, { free_template: 'x' }).tpl, null, 'a device badge has its state line');
assert.match(F.sec('hero', F.plan(null, states, hass, {}), states, hass), /Kein Gerät gewählt/, 'the tile without device is unchanged');
assert.match(F.sec('vals', F.plan(states['switch.qa_pumpe'], states, hass, c0.variables), states, hass), /sensor\.qa_temp:Innen=21,5 °C/, 'own labels');
delete UI.line;

// ── Header: badge colour and icon, main switch ──────────────────────────────────
const hueOf = (card) => { let out = null; window._casoraRingHueHooks.some((f) => { out = f(card, [].concat(card._config.template).join(' ') + ' ' + ((card._stateObj || {}).entity_id || '')); return !!out; }); return out; };
const srcCard = (cfg, st) => ({ _config: cfg, _stateObj: st, _hass: hass });
assert.deepEqual(hueOf(srcCard(c0, states['switch.qa_pumpe'])), { hue: devBadge.color, off: false });
assert.deepEqual(hueOf(srcCard(c0, { ...states['switch.qa_pumpe'], state: 'off' })), { hue: devBadge.color, off: true }, 'sand when the badge looks off');
assert.equal(window.casoraRingUrl(srcCard(c1, null), 'casora_badge_custom casora_popup_own_badge '), '/casora_assets/icons/light.svg', 'Casora icon of the badge');
assert.equal(window.casoraRingUrl(srcCard(c2, null), 'casora_badge_custom light.qa_stehlampe'), null, 'other badges untouched');
assert.equal(window.casoraRingGlyph(srcCard(c0, states['switch.qa_pumpe']), 'casora_badge_custom casora_popup_own_badge switch.qa_pumpe'), 'mdi:water-pump', 'mdi icon of the badge');
assert.match(window.casoraRingGlyph(srcCard({ ...c0, variables: { ...c0.variables, badge: { entity: 'switch.qa_pumpe' } } }, states['switch.qa_pumpe']),
  'casora_badge_custom casora_popup_own_badge switch.qa_pumpe'), /^mdi:/, 'without own icon: the device icon');
const headOf = (card) => { let out = null; window._casoraHeadSwitchHooks.some((f) => { out = f(card); return out !== null && out !== undefined; }); return out; };
assert.deepEqual(headOf({ _config: c0, _stateObj: states['switch.qa_pumpe'] }), ['switch.qa_pumpe'], 'switch badge: main switch in the header');
assert.equal(headOf({ _config: c1, _stateObj: null }), false, 'template badge: none');

// ── Templates ───────────────────────────────────────────────────────────────────
const T = JSON.parse(src('dashboards/casora/button_card_templates.json'));
const own = T.casora_popup_own_badge;
assert.ok(own, 'casora_popup_own_badge');
assert.deepEqual(own.template, ['casora_popup_free'], 'content, width, own cards and styles from the Universal tile');
assert.equal(Object.keys(own.tap_action.casora_popup).join(), 'title', 'only the title differs');
assert.ok('free_template' in own.variables);
const js = (s) => new Function('variables', 'entity', String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
assert.equal(js(own.tap_action.casora_popup.title)({ badge: { name: 'Pumpe' } }, null), 'Pumpe');
assert.ok(JSON.parse(src('custom_components/casora/panel/casora-templates.json')).templates.casora_popup_own_badge, 'built (tools/build-templates.py)');

// ── Studio: tap "Own popup" composes the popup with the tile's fields ──────────
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; this.isConnected = true; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  querySelector(sel) { if (sel !== 'label') return null; return (function find(el) { for (const c of el.children) { if (c.tagName === 'LABEL') return c; const d = find(c); if (d) return d; } return null; })(this); }
  querySelectorAll() { return []; }
  addEventListener() {}
  getElementById() { return null; }
  get textContent() { return this._t || ''; }
  set textContent(v) { this._t = String(v); }
}
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
let Panel = null;
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
set('document', new Proxy({ createElement: (t) => new El(t), querySelector: () => null }, { get: (t, k) => (k in t ? t[k] : stub()) }));
set('customElements', { get: () => Panel, define: (nm, c) => { Panel = c; }, whenDefined: () => Promise.resolve() });
set('requestAnimationFrame', () => 0);
set('matchMedia', () => ({ matches: false, addEventListener() {} }));
set('fetch', () => Promise.reject(new Error('offline')));
set('HTMLElement', class {}); set('innerWidth', 1400); set('innerHeight', 900);
set('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info; console.info = () => {};
new Function(fix(src('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(src('custom_components/casora/panel/casora-panel.js')))();
await new Promise((r) => setImmediate(r));
new Function(fix(src('custom_components/casora/panel/casora-panel-popups.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
const P = Panel.prototype;
assert.equal(typeof P._popupCardsRows, 'function', 'own cards editor loaded');
const room = { path: 'wohnzimmer', name: 'Wohnzimmer', tiles: [], variables: { custom_badges: [{ name: 'Pumpe', entity: 'switch.qa_pumpe', tap: 'own_popup' }] } };
const p = Object.create(P);
p._hass = hass; p._room = 1; p._pair = null; p.combos = []; p.chips = []; p.switches = []; p.renders = 0;
p._state = { compact: { rooms: [{ path: 'home', name: 'Zuhause', tiles: [], variables: {} }, room] }, templates: {} };
p.shadowRoot = new El('root');
p._markDirty = () => {}; p._syncPreview = () => {}; p._renderForm = () => { p.renders++; }; p._status = () => {}; p._customBadgeSweep = () => {};
p._prettyEntity = (id) => id; p._roomLabel = (r) => r.name; p._rankedEntityList = () => [];
p._combo = (value, options, placeholder, onChange, opts) => { const c = { value, options, placeholder, onChange, opts, wrap: new El('div') }; p.combos.push(c); return c; };
p._chipPicker = (values, domains, onChange) => { const c = new El('div'); c.values = values; c.onChange = onChange; p.chips.push(c); return c; };
p._boolSwitch = (cur, def, onChange, label) => { const c = new El('div'); Object.assign(c, { cur, def, onChange, label }); p.switches.push(c); return c; };
const render = () => {
  const fs = new El('section');
  p.combos = []; p.chips = []; p.switches = [];
  P._customBadgesField.call(p, room, fs, { key: 'custom_badges' }, (key, value) => { if (value === undefined) delete room.variables[key]; else room.variables[key] = value; });
  const labels = [];
  (function walk(el) { el.children.forEach((c) => { if (c.tagName === 'LABEL' || /subhead/.test(c.className || '')) labels.push(c.textContent); walk(c); }); })(fs);
  return { fs, labels };
};
let r = render();
const tapCombo = p.combos.find((c) => c.opts && c.opts.labels && c.opts.labels.own_popup);
assert.deepEqual(tapCombo.options, ['none', 'popup', 'own_popup', 'navigate']);
assert.equal(tapCombo.opts.labels.own_popup, 'Own popup');
assert.equal(tapCombo.value, 'own_popup');
for (const l of ['Own popup', 'Values', 'History (24 h)', 'Controls', 'Own cards in popup']) assert.ok(r.labels.includes(l), 'row ' + l + ': ' + r.labels.join(','));
assert.ok(!r.labels.includes('History of'), 'chart source only with history on');
// Values → stored on the badge, the form redraws for the label rows.
p.chips[0].onChange(['sensor.qa_temp', 'binary_sensor.qa_tuer']);
assert.deepEqual(room.variables.custom_badges[0].popup, { free_values: ['sensor.qa_temp', 'binary_sensor.qa_tuer'] });
r = render();
assert.ok(r.labels.includes('Label') && r.labels.includes('temp') && r.labels.includes('tuer'), 'one label row per value: ' + r.labels.join(','));
// History on → "History of" appears, with this badge's device as the default.
p.switches.find((s) => s.label === 'History (24 h)').onChange(true);
assert.equal(room.variables.custom_badges[0].popup.free_chart, true);
r = render();
const of = p.combos.find((c) => c.placeholder === "This badge's device");
assert.ok(of && r.labels.includes('History of'), 'history source picker');
of.onChange('sensor.qa_temp');
p.switches.find((s) => s.label === 'Controls').onChange(false);
assert.deepEqual(room.variables.custom_badges[0].popup, { free_values: ['sensor.qa_temp', 'binary_sensor.qa_tuer'], free_chart: true, free_chart_entity: 'sensor.qa_temp', free_controls: false });
// Own cards: the tiles' editor writes into the badge (stand-in tile with _commit).
let stand = null;
const realRows = P._popupCardsRows;
p._popupCardsRows = function (tile, type, advRow) { stand = tile; return realRows.call(this, tile, type, advRow); };
r = render();
assert.equal(stand.template, 'casora_free');
stand.variables.popup_extra_cards = [{ type: 'markdown', content: 'Hallo' }];
stand._commit();
assert.deepEqual(room.variables.custom_badges[0].popup.popup_extra_cards, [{ type: 'markdown', content: 'Hallo' }], 'own card stored on the badge');
r = render();
assert.ok(r.labels.includes('1. Markdown') && r.labels.includes('Heading above your cards'), 'card row and heading: ' + r.labels.join(','));
// Removing a value drops its label.
room.variables.custom_badges[0].popup.free_value_labels = { 'binary_sensor.qa_tuer': 'Tür' };
r = render();
p.chips[0].onChange(['sensor.qa_temp']);
assert.equal(room.variables.custom_badges[0].popup.free_value_labels, undefined, 'label of the removed value gone');
// Template badge: own popup offered, no controls; another tap keeps the settings but shows no popup fields.
room.variables.custom_badges = [{ name: 'Sonne', template: 'x', tap: 'own_popup' }];
r = render();
assert.deepEqual(p.combos.find((c) => c.opts && c.opts.labels && c.opts.labels.own_popup).options, ['none', 'own_popup', 'navigate']);
assert.ok(r.labels.includes('Values') && !r.labels.includes('Controls'), 'template badge: no controls');
room.variables.custom_badges = [{ name: 'Pumpe', entity: 'switch.qa_pumpe', tap: 'popup', popup: { free_values: ['sensor.qa_temp'] } }];
r = render();
assert.ok(!r.labels.includes('Own popup'), 'popup fields only for the own popup');

// ── Translations ────────────────────────────────────────────────────────────────
for (const lang of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const tr = JSON.parse(src('custom_components/casora/translations/panel/' + lang + '.json')).exact;
  for (const s of ['Own popup', "This badge's device"]) assert.ok(tr[s], lang + ' translation missing for: ' + s);
}
assert.equal(JSON.parse(src('custom_components/casora/translations/panel/de.json')).exact['Own popup'], 'Eigenes Popup');
console.log('badge_popup: ok');
