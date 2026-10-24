// Own badges (#53, 29-eigene-badges.js + casora_badge_custom) without HA.
//   node dev/unit/eigene_badges.mjs
// Checks: what a badge shows from an entity (state words, numbers, hidden when unavailable) and from a template
// result (text, "…" while loading, off-like results dim), HTML in names and results stays text, tap actions
// (popup = more-info, go to room = navigate on the desktop and the room filter on the phone), the shared template
// subscriber (one subscription per template, release after the last watcher), the row cards in casora_room,
// the phone's start page and the derived phone room page, and the wrap option (badges_wrap → flex row).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const MOD = 'custom_components/casora/scripts/local/29-eigene-badges.js';

// ── Module in a bare window ─────────────────────────────────────────────────────
let subscribed = [];
let unsubscribed = 0;
let hass = null;
globalThis.window = globalThis;
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null), addEventListener() {} };
globalThis.HTMLElement = class { constructor() { this.style = {}; this.isConnected = true; this.children = []; } };
globalThis.customElements = { _d: {}, get(n) { return this._d[n]; }, define(n, c) { this._d[n] = c; } };
globalThis.location = { pathname: '/qa-haus/home' };
const timers = [];
globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
globalThis.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = null; };
globalThis.casoraIconUrl = (n) => '/casora_assets/icons/' + n + '.svg';
new Function(read(MOD))();
const CB = window._casoraCustomBadge, TP = window._casoraTemplates;
assert.ok(CB && TP, 'module exports');
assert.ok(customElements.get('casora-custom-badges'), 'row card defined');

// ── view(): entity badges ───────────────────────────────────────────────────────
const ent = (state, attrs) => ({ entity_id: 'binary_sensor.beispiel_fenster', state, attributes: { friendly_name: 'Fenster Beispiel', ...(attrs || {}) } });
let v = CB.view({ name: 'Fenster', entity: 'binary_sensor.beispiel_fenster' }, ent('on'), null, null);
assert.equal(v.hide, false); assert.equal(v.title, 'Fenster'); assert.equal(v.sub, 'An'); assert.equal(v.active, true);
assert.equal(v.color, 'var(--casora-color-teal, #4E9E95)', 'default color teal');
v = CB.view({ entity: 'binary_sensor.beispiel_fenster' }, ent('off'), null, null);
assert.equal(v.title, 'Fenster Beispiel', 'name from the entity'); assert.equal(v.sub, 'Aus'); assert.equal(v.active, false);
v = CB.view({ entity: 'binary_sensor.beispiel_fenster' }, ent('unavailable'), null, null);
assert.equal(v.hide, true, 'unavailable hides');
assert.equal(CB.view({ entity: 'sensor.fehlt' }, null, null, null).hide, true, 'missing entity hides');
v = CB.view({ entity: 'sensor.t', color: 'var(--casora-color-red, #FF4245)', icon: 'temp-medium' },
  { entity_id: 'sensor.t', state: '21.5', attributes: { unit_of_measurement: '°C' } }, null, null);
assert.ok(/21[.,]5 °C/.test(v.sub), 'number with unit: ' + v.sub); assert.equal(v.active, true, 'numbers are active');
assert.equal(v.color, 'var(--casora-color-red, #FF4245)'); assert.equal(v.svg, '/casora_assets/icons/temp-medium.svg'); assert.equal(v.mdi, '');
v = CB.view({ entity: 'sensor.t', icon: 'mdi:water' }, { entity_id: 'sensor.t', state: '3', attributes: {} }, null,
  { formatEntityState: () => '3 l' });
assert.equal(v.sub, '3 l', "HA's own wording when available"); assert.equal(v.mdi, 'mdi:water'); assert.equal(v.svg, '');
v = CB.view({ entity: 'lock.x' }, { entity_id: 'lock.x', state: 'locked', attributes: {} }, null, null);
assert.equal(v.sub, 'Verriegelt'); assert.equal(v.active, false);

// ── view(): template badges ─────────────────────────────────────────────────────
v = CB.view({ name: 'Sonne', template: "{{ states('sun.sun') }}" }, null, null, null);
assert.equal(v.tpl, true); assert.equal(v.sub, '…', 'loading'); assert.equal(v.active, false); assert.equal(v.svg, '/casora_assets/icons/default.svg');
v = CB.view({ name: 'Sonne', template: 'x' }, null, 'above_horizon', null);
assert.equal(v.sub, 'above_horizon'); assert.equal(v.active, true);
v = CB.view({ template: 'x' }, null, 'off', null);
assert.equal(v.title, 'Badge'); assert.equal(v.active, false);
assert.equal(CB.view({ template: 'x' }, null, '  ', null).sub, '—', 'empty result shows a dash');

// ── html(): names and results stay text ─────────────────────────────────────────
const html = CB.html(CB.view({ name: '<b>Böse</b>', template: 'x' }, null, '<img src=x onerror=alert(1)> & "q"', null));
assert.ok(!/<b>|<img/.test(html), 'tags escaped');
assert.ok(html.includes('&lt;b&gt;Böse&lt;/b&gt;') && html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;q&quot;'));
assert.ok(/badge-title"><span data-no-i18n>/.test(html), 'own names are not translated');
assert.ok(/badge-sub"><span data-no-i18n>/.test(html), 'template text is not translated');
assert.ok(!/badge-sub"><span/.test(CB.html(CB.view({ entity: 'e' }, ent('on'), null, null))), 'entity state words are translated');

// ── tap() ───────────────────────────────────────────────────────────────────────
assert.deepEqual(CB.tap({ tap: 'popup', entity: 'light.x' }, 'room'), { action: 'more-info', entity: 'light.x', haptic: 'light' });
assert.deepEqual(CB.tap({ tap: 'popup', template: 'x' }, 'room'), { action: 'none' }, 'no popup without an entity');
assert.deepEqual(CB.tap({ tap: 'navigate', navigate: 'kueche', navigate_filter: 'room_kueche' }, 'room'),
  { action: 'navigate', navigation_path: '/qa-haus/kueche', haptic: 'light' });
assert.deepEqual(CB.tap({ tap: 'navigate', navigate: 'kueche', navigate_filter: 'room_kueche' }, 'phone'),
  { action: 'fire-dom-event', casora_filter: 'room_kueche', haptic: 'light' });
assert.deepEqual(CB.tap({ entity: 'light.x' }, 'room'), { action: 'none' });

// ── shared subscriber ───────────────────────────────────────────────────────────
hass = { connection: { subscribeMessage(cb, msg) { subscribed.push({ cb, msg }); return Promise.resolve(() => { unsubscribed++; }); } } };
const got = [];
const u1 = TP.watch("{{ states('sun.sun') }}", (t) => got.push('a:' + t));
const u2 = TP.watch("{{ states('sun.sun') }}", (t) => got.push('b:' + t));
assert.equal(subscribed.length, 1, 'one subscription for the same template');
assert.equal(subscribed[0].msg.type, 'render_template'); assert.equal(subscribed[0].msg.report_errors, true);
subscribed[0].cb({ result: 'above_horizon', listeners: {} });
assert.deepEqual(got, ['a:above_horizon', 'b:above_horizon']);
assert.equal(TP.text("{{ states('sun.sun') }}"), 'above_horizon', 'cached per template');
const u3 = TP.watch("{{ states('sun.sun') }}", (t) => got.push('c:' + t));
assert.equal(got[2], 'c:above_horizon', 'late watcher gets the cached text at once');
assert.equal(subscribed.length, 1);
subscribed[0].cb({ result: 7 });
assert.equal(TP.text("{{ states('sun.sun') }}"), '7', 'results become text');
TP.watch("{{ 1 }}", () => {});
assert.equal(subscribed.length, 2, 'another template, another subscription');
assert.equal(TP.watch('   ', () => {})(), undefined, 'empty template: nothing');
u1(); u2(); u3();
assert.equal(unsubscribed, 0, 'released only after the grace period');
const pending = timers.filter((t) => t.fn && t.ms === TP.RELEASE_MS);
assert.equal(pending.length, 1, 'one release timer');
for (const t of pending) t.fn();
await Promise.resolve(); await Promise.resolve();
assert.equal(unsubscribed, 1, 'unsubscribed after the last watcher left');
assert.equal(TP.text("{{ states('sun.sun') }}"), null, 'cache dropped with the subscription');

// ── templates: the row cards ────────────────────────────────────────────────────
const tpl = T.casora_badge_custom;
assert.ok(tpl, 'casora_badge_custom');
assert.deepEqual(tpl.template, ['casora_badge_base']);
assert.equal(tpl.tap_action.haptic, 'light');
assert.ok(String(tpl.extra_styles).includes('order:var(--casora-badge-order-custom,8)'), 'after the built-in badges');
const last = (cards) => cards[cards.length - 1];
const roomRow = T.casora_room.custom_fields.badges.card;
const own = last(roomRow.cards);
assert.equal(own.type, 'custom:casora-custom-badges', 'own badges last in the room header');
assert.ok(/casoraSeen\(variables,'custom',user/.test(own.enabled), '"Who sees this?"');
assert.ok(/variables\.custom_badges/.test(own.badges));
const phoneRow = T.casora_mobile_filter_badges.custom_fields.badges.card;
const pown = last(phoneRow.cards);
assert.equal(pown.type, 'custom:casora-custom-badges'); assert.equal(pown.place, 'phone');
assert.ok(/casora_hv/.test(pown.badges) && /variables\.custom_badges/.test(pown.badges), 'phone start: Home at runtime, else the mirrored copy');
assert.ok('custom_badges' in T.casora_mobile_filter_badges.variables && 'badges_wrap' in T.casora_mobile_filter_badges.variables,
  'phone badges declare both (else the Studio does not mirror them)');
const chipRow = T.casora_mobile_sensor_chips.custom_fields.rooms_row.card;
const cown = chipRow.cards.find((c) => c.type === 'custom:casora-custom-badges');
assert.ok(cown, 'phone room page carries the own badges (tools/phone_room_badges.py)');
assert.equal(cown.place, 'phone');
assert.ok(/_rv\.custom_badges/.test(cown.badges), 'phone room reads the desktop room (casora_rv)');

// ── template JS of casora_badge_custom with the module loaded ───────────────────
const js = (s) => new Function('variables', 'entity', 'states', 'hass', 'user', String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
const V = { badge: { name: 'A <i>', entity: 'light.x' }, value: null, enabled: true };
const E = { entity_id: 'light.x', state: 'on', attributes: {} };
assert.ok(js(tpl.name)(V, E, {}, {}, null).includes('A &lt;i&gt;'), 'name HTML escaped in the template');
assert.equal(js(tpl.styles.card[0].display)(V, E, {}, {}, null), 'inline-grid');
assert.equal(js(tpl.styles.card[0].display)(V, { entity_id: 'light.x', state: 'unavailable', attributes: {} }, {}, {}, null), 'none');
assert.equal(js(tpl.styles.card[0].display)({ ...V, enabled: false }, E, {}, {}, null), 'none', '"Who sees this?" hides');
assert.match(js(tpl.extra_styles)({ badge: { template: 'x', icon: 'light' }, value: 'An' }, null, {}, {}, null), /mask: url\('\/casora_assets\/icons\/light\.svg'\)/);
assert.equal(js(tpl.icon)({ badge: { icon: 'mdi:water' } }, null, {}, {}, null), 'mdi:water');
assert.equal(js(tpl.styles.card[1]['--casora-icon-color'])({ badge: { template: 'x' }, value: 'off' }, null, {}, {}, null), 'var(--badge-title-inactive)');

// ── wrap option ─────────────────────────────────────────────────────────────────
const lay = (card, vars) => js(card.layout.display)(vars, null, {}, {}, null);
assert.equal(lay(roomRow, { badges_wrap: true }), 'flex'); assert.equal(lay(roomRow, {}), 'grid'); assert.equal(lay(roomRow, { badges_wrap: 'true' }), 'grid', 'only true wraps');
assert.equal(roomRow.layout['flex-wrap'], 'wrap');
assert.equal(lay(phoneRow, { casora_hv: { badges_wrap: true } }), 'flex'); assert.equal(lay(phoneRow, { badges_wrap: true }), 'flex'); assert.equal(lay(phoneRow, { casora_hv: {} }), 'grid');
assert.equal(lay(chipRow, { casora_rv: { badges_wrap: true } }), 'flex'); assert.equal(lay(chipRow, {}), 'grid');
assert.equal(chipRow.layout['flex-wrap'], 'wrap');
// Phone rows: the inner card is max-content wide (so the row scrolls); with the wrap option it takes the row's width.
for (const [name, field] of [['casora_mobile_filter_badges', 'badges'], ['casora_mobile_sensor_chips', 'rooms_row']]) {
  assert.ok(T[name].extra_styles.includes('width:var(--casora-badge-row-child-w, max-content)!important'), name + ': inner card width follows the wrap option');
  const e = T[name].styles.custom_fields[field].find((x) => '--casora-badge-row-child-w' in x);
  assert.ok(e, name + ': sets --casora-badge-row-child-w');
  const f = js(e['--casora-badge-row-child-w']);
  const on = field === 'badges' ? { casora_hv: { badges_wrap: true } } : { casora_rv: { badges_wrap: true } };
  assert.equal(f(on, null, {}, {}, null), '100%'); assert.equal(f({}, null, {}, {}, null), 'max-content');
}
const lc = read('custom_components/casora/scripts/layout-card-modified.js');
assert.ok(/"flex-wrap" === o/.test(lc) && /"row-gap" === o/.test(lc), 'layout-card passes flex-wrap and row-gap through');
assert.ok(/'29-eigene-badges'/.test(read('custom_components/casora/scripts/casora-local.js')), 'module loaded');

// ── Studio ──────────────────────────────────────────────────────────────────────
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.ok(/label: "Own badges", bid: "custom"/.test(panel), 'section "Own badges"');
assert.ok(/key: "badges_wrap", sub: "chrome"/.test(panel), 'wrap option in Controls › Screen');
assert.ok(/_customBadgesField\(room, fs, f, setVar\)/.test(panel), 'field renders the list');
assert.ok(/\["custom", "Own badges"\]/.test(read('custom_components/casora/panel/casora-panel-b-mehr.js')), '"Who sees this?" knows the section');
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
assert.equal(de['Own badges'], 'Eigene Badges'); assert.equal(de['Wrap badges onto more lines'], 'Badges umbrechen');

// ── Studio field with a minimal DOM: a template badge can be created, the preview releases its subscriptions ──
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.classList = { add() {}, remove() {}, toggle() {}, contains: () => false }; this.isConnected = true; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  addEventListener() {}
  get textContent() { return this._t || ''; }
  set textContent(v) { this._t = String(v); }
}
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
const Row = customElements.get('casora-custom-badges');
let Panel = null;
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
set('document', new Proxy({ createElement: (t) => new El(t), querySelector: (s) => (s === 'home-assistant' ? { hass } : null) }, { get: (t, k) => (k in t ? t[k] : stub()) }));
set('customElements', { get: () => Panel, define: (nm, c) => { Panel = c; }, whenDefined: () => Promise.resolve() });
set('requestAnimationFrame', () => 0);
set('matchMedia', () => ({ matches: false, addEventListener() {} }));
set('fetch', () => Promise.reject(new Error('offline')));
set('HTMLElement', class {}); set('innerWidth', 1400); set('innerHeight', 900);
set('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info; console.info = () => {};
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(panel))();
await new Promise((r) => setImmediate(r));
console.info = info;
assert.ok(Panel, 'panel class');
const P = Panel.prototype;
const room = { path: 'wohnzimmer', name: 'Wohnzimmer', tiles: [], variables: {} };
const studio = () => {
  const p = Object.create(P);
  p._hass = hass; p._room = 1; p._pair = null; p.menus = []; p.combos = [];
  p._state = { compact: { rooms: [{ path: 'home', name: 'Zuhause', tiles: [], variables: {} }, room] }, templates: {} };
  p._markDirty = () => {}; p._syncPreview = () => {}; p._renderForm = () => {}; p._status = () => {};
  p._prettyEntity = (id) => id; p._roomLabel = (r) => r.name; p._rankedEntityList = () => [];
  p._combo = (value, options, placeholder, onChange, opts) => { const c = { value, options, onChange, opts, wrap: new El('div') }; p.combos.push(c); return c; };
  p._menuAt = (anchor, items, cb) => { p.menus.push({ items, cb }); };
  return p;
};
const F = { key: 'custom_badges' };
const render = (p) => {
  const fs = new El('section');
  p.combos = []; p.menus = [];
  P._customBadgesField.call(p, room, fs, F, (key, value) => { if (value === undefined) delete room.variables[key]; else room.variables[key] = value; });
  const rows = [];
  (function walk(el) { el.children.forEach((c) => { if (c.tagName === 'LABEL') rows.push(c.textContent); walk(c); }); })(fs);
  const ta = (function find(el) { for (const c of el.children) { if (c.tagName === 'TEXTAREA') return c; const d = find(c); if (d) return d; } return null; })(fs);
  return { fs, rows, ta };
};
let p = studio();
let r = render(p);
assert.deepEqual(r.rows, [], 'no badges yet');
assert.equal(p.menus.length, 0);
// "Add badge" → "From a template": the row must show the textarea, not the entity picker (store() drops empty strings).
const addBtn = r.fs.children.find((c) => c.tagName === 'BUTTON');
addBtn.onclick();
assert.equal(p.menus.length, 1, 'add menu');
p.menus[0].cb('template');
assert.deepEqual(room.variables.custom_badges, [{ source: 'template' }], 'the template badge keeps its source marker');
r = render(p);
assert.ok(r.rows.includes('Template') && !r.rows.includes('Device'), 'template row with textarea: ' + r.rows.join(','));
assert.ok(r.ta, 'textarea present');
r.ta.value = " {{ states('sun.sun') }} ";
r.ta.onchange();
assert.deepEqual(room.variables.custom_badges, [{ source: 'template', template: "{{ states('sun.sun') }}" }], 'typed template stored');
// The dashboard row drops a template badge without text, keeps one with text; the marker does not matter there.
{
  const row = Object.create(Row.prototype); row._items = []; row._config = {}; row.style = {}; row.isConnected = false; row._sync = () => {};
  row.setConfig({ badges: [{ source: 'template' }, { source: 'template', template: '{{ 1 }}' }, { entity: 'light.x' }, {}] });
  assert.deepEqual(row._config.badges, [{ source: 'template', template: '{{ 1 }}' }, { entity: 'light.x' }], 'dashboard keeps only badges with an entity or template text');
}
// Source switch on an entity badge → template: textarea, no entity picker; back → entity picker.
room.variables.custom_badges = [{ entity: 'light.x', name: 'Lampe' }];
r = render(p);
assert.ok(r.rows.includes('Device') && !r.rows.includes('Template'));
p.combos.find((c) => c.opts && c.opts.labels && c.opts.labels.template === 'Template').onChange('template');
assert.deepEqual(room.variables.custom_badges, [{ name: 'Lampe', source: 'template' }], 'switched to template: marker, entity gone');
r = render(p);
assert.ok(r.rows.includes('Template') && !r.rows.includes('Device'), 'textarea after the switch');
p.combos.find((c) => c.opts && c.opts.labels && c.opts.labels.template === 'Template').onChange('entity');
assert.deepEqual(room.variables.custom_badges, [{ name: 'Lampe' }], 'back to device: no marker');
r = render(p);
assert.ok(r.rows.includes('Device'));

// Preview text of template badges: one subscription per string, released when the string changes or the panel leaves.
hass = { connection: { subscribeMessage(cb, msg) { subscribed.push({ cb, msg }); return Promise.resolve(() => { unsubscribed++; }); } } };
const flush = async () => { for (const t of timers.filter((x) => x.fn)) { const fn = t.fn; t.fn = null; fn(); } await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const before = subscribed.length, freed = unsubscribed;
room.variables.custom_badges = [{ source: 'template', template: '{{ 2 }}' }];
let synced = 0;
p = studio(); p._syncPreview = () => { synced++; };
assert.equal(P._customBadgeText.call(p, '{{ 2 }}'), null, 'no text yet');
assert.equal(subscribed.length, before + 1, 'one subscription (via the dashboard module)');
assert.equal(P._customBadgeText.call(p, '{{ 2 }}'), null, 'cached: no second subscription');
assert.equal(subscribed.length, before + 1);
subscribed[before].cb({ result: 2 });
assert.equal(P._customBadgeText.call(p, '{{ 2 }}'), '2', 'result as text'); assert.equal(synced, 1, 'preview redrawn');
// A second panel instance meets the shared cache: the text comes back at once, without a redraw inside the render.
{ const q = studio(); let s2 = 0; q._syncPreview = () => { s2++; }; assert.equal(P._customBadgeText.call(q, '{{ 2 }}'), '2', 'cached text at once'); assert.equal(s2, 0, 'no redraw from inside the render'); q._gList = []; P.disconnectedCallback.call(q); }
// Unused string (the typed template changed): the sweep releases it; the room's current one stays.
P._customBadgeText.call(p, '{{ old }}');
assert.equal(subscribed.length, before + 2);
P._customBadgeSweep.call(p);
await flush();
assert.equal(unsubscribed, freed + 1, 'the old string is unsubscribed');
assert.ok(p._customTpl.has('{{ 2 }}') && !p._customTpl.has('{{ old }}'), 'cache follows');
// Panel leaves: everything goes.
p._gList = []; p._gOff = false;
P.disconnectedCallback.call(p);
await flush();
assert.equal(unsubscribed, freed + 2, 'panel gone: all released');
// Without the dashboard module: HA's connection directly, unsubscribed just the same.
const sharedTP = window._casoraTemplates; window._casoraTemplates = undefined;
p = studio();
P._customBadgeText.call(p, '{{ 3 }}');
assert.equal(subscribed.length, before + 3, 'direct subscription');
assert.equal(subscribed[before + 2].msg.template, '{{ 3 }}');
room.variables.custom_badges = [];
P._customBadgeSweep.call(p);
await flush();
assert.equal(unsubscribed, freed + 3, 'direct subscription released');
window._casoraTemplates = sharedTP;

console.log('ok eigene_badges');
