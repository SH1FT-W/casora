// Issue #54: the room climate tile (casora_vent) on a room page listed every room of the house – in the
// garden the indoor temperatures. Now the popup follows the page: a room shows its own row(s), an outdoor
// room only the outdoor air, a room without sensors a hint, Home the house. Plus „Shown in the popup“:
// rows switched off in the Studio (variables.popup_hide) stay out of the popup and the tile
// (window.casoraPopupHide, 00-finder.js; Studio list casora-panel-popups.js _popupHideRows).
//   node dev/unit/popup_zeilen.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
let hass = null;
let cfg = null;
globalThis.window = globalThis;
globalThis.location = { pathname: '/casora/home' };
globalThis.document = { querySelector: (s) => (s === 'home-assistant' ? { hass } : null), addEventListener: noop,
  createElement: () => ({ style: {} }), querySelectorAll: () => [] };
globalThis.customElements = { whenDefined: () => new Promise(noop), get: () => null, define: noop };
globalThis.addEventListener = noop;
globalThis.setInterval = () => 0;
window._casoraLovelaceCfg = () => cfg;
window.casoraSvc = (n) => ({ domain: 'casora', service: n });
// UI stub: structured results instead of HTML.
window._casoraUI = {
  group: (rows, title) => ({ group: title, rows }),
  hero: (o) => ({ hero: o }),
  line: (a, b, o) => ({ line: a, rest: b, o }),
  tokens: { ink: '#fff', ink2: '#eee', ink3: '#ddd', font: 'x' },
  _casoraLabelInside: true, // keep the module's HTML wrapper of UI.group off the structured stub
};
new Function(src('custom_components/casora/scripts/local/00-finder.js'))();
new Function(src('custom_components/casora/scripts/local/05-standard-medien.js'))();
const H = window.casoraPopupHide, V = window._casoraVent;
assert.ok(H && V, 'helper and vent module loaded');

// ── The invented house: three indoor rooms with climate, the garden only with an outdoor sensor ──
const room = (k, n, status, extra) => ({ k, n, status, grund: '', rh: 50, t: 21.5, co2: null, voc: null, ah: 9.5,
  fenster: null, offen_min: null, ziel_min: 20, heizt: false, co2_krit: false, ...(extra || {}) });
const states = {
  'sensor.casora_lueften': { entity_id: 'sensor.casora_lueften', state: 'ok', attributes: {
    rooms: [room('wohnzimmer', 'Wohnzimmer', 'ok', { t: 21.4, rh: 48 }), room('kuche', 'Küche', 'jetzt', { grund: 'CO₂ 1450 ppm', t: 22, rh: 55, co2: 1450 }),
      room('buro', 'Büro', 'ok', { t: 22.4, rh: 51 })],
    aussen: { t: 12.5, rh: 70, ah: 7.6, pm25: 8 } } },
  'sensor.casora_lueftungs_coach': { entity_id: 'sensor.casora_lueftungs_coach', state: 'ok', attributes: { status: 'done', fazit: 'Haus ok', zustand: 'gut',
    raeume: [{ n: 'Wohnzimmer', zustand: 'gut', fazit: 'Wohnzimmer ok', tipp: '' }] } },
  'sensor.garten_temperatur': { entity_id: 'sensor.garten_temperatur', state: '12.5', attributes: { device_class: 'temperature', friendly_name: 'Garten Temperatur' } },
  'sensor.tuer_batterie': { entity_id: 'sensor.tuer_batterie', state: '35', attributes: { device_class: 'battery', friendly_name: 'Tür Batterie' } },
  'sensor.fenster_batterie': { entity_id: 'sensor.fenster_batterie', state: '80', attributes: { device_class: 'battery', friendly_name: 'Fenster Batterie' } },
  'sensor.iphone_battery': { entity_id: 'sensor.iphone_battery', state: '60', attributes: { device_class: 'battery', friendly_name: 'iPhone Battery' } },
  'sensor.tot_batterie': { entity_id: 'sensor.tot_batterie', state: 'unavailable', attributes: { device_class: 'battery' } },
};
hass = { states, entities: {}, devices: {}, areas: { garten: { area_id: 'garten', name: 'Garten' } } };
let n = 0;
const ok = (label, cond, info) => { n++; assert.ok(cond, label + (info !== undefined ? ' – ' + JSON.stringify(info) : '')); };
const eq = (label, got, want) => { n++; assert.deepEqual(got, want, label); };

// ── casoraPopupHide ──
eq('list: missing → []', H.list({}), []);
eq('list: string → [string]', H.list({ popup_hide: 'a' }), ['a']);
eq('list: only strings', H.list({ popup_hide: ['a', 1, null, 'b'] }), ['a', 'b']);
ok('has', H.has({ popup_hide: ['x'] }, 'x') && !H.has({ popup_hide: ['x'] }, 'y') && !H.has({}, 'x'));
eq('ids', H.ids(['a', 'b', 'c'], { popup_hide: ['b'] }), ['a', 'c']);
eq('rows by entity or id', H.rows([{ entity: 'a' }, { id: 'b' }, { entity: 'c' }], { popup_hide: ['a', 'b'] }).map((r) => r.entity || r.id), ['c']);
eq('rows without a list stay', H.rows([{ entity: 'a' }], {}).length, 1);

// ── Batteries (00-finder.js): the scan without personal devices, hidden rows out, Studio list with them ──
eq('batteries: house pick', H.batteries(states, {}, hass).map((e) => e.entity_id).sort(), ['sensor.fenster_batterie', 'sensor.tuer_batterie']);
eq('batteries: hidden out', H.batteries(states, { popup_hide: ['sensor.tuer_batterie'] }, hass).map((e) => e.entity_id), ['sensor.fenster_batterie']);
eq('batteries: Studio list keeps hidden, lowest first', H.entries('casora_battery', hass, { popup_hide: ['sensor.tuer_batterie'] }, null).map((e) => e.id + '|' + e.sub),
  ['sensor.tuer_batterie|35 %', 'sensor.fenster_batterie|80 %']);
eq('batteries: chosen list wins', H.batteries(states, { batteries: ['sensor.iphone_battery'] }, hass).map((e) => e.entity_id), ['sensor.iphone_battery']);
eq('entries: unknown template → null', H.entries('casora_light', hass, {}, null), null);

// ── Scope: where the tile sits ──
cfg = { views: [{ path: 'home', title: 'home', cards: [] },
  { path: 'wohnzimmer', title: 'wohnzimmer', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Wohnzimmer' }] },
  { path: 'buero', title: 'buero', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Büro' }] },
  { path: 'garten', title: 'garten', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Garten' }] },
  { path: 'abstellkammer', title: 'abstellkammer', cards: [] },
  { path: 'energie', title: 'Energie', cards: [{ type: 'custom:button-card', template: 'casora_energy' }] },
  { path: 'bad', title: 'Bad', cards: [{ type: 'vertical-stack', cards: [{ type: 'custom:button-card', template: 'casora_room', name: '[[[ return variables.room_name ]]]' }] }] }] };
const at = (p) => { location.pathname = p; return V.scope({}); };
eq('desktop: Home view → house', at('/casora/home'), null);
eq('desktop: no view segment → house', at('/casora'), null);
eq('desktop: garden view', at('/casora/garten'), { key: 'garten', name: 'Garten', outdoor: true });
eq('desktop: living room view (name from the room header)', at('/casora/wohnzimmer'), { key: 'wohnzimmer', name: 'Wohnzimmer', outdoor: false });
eq('desktop: view by index', at('/casora/3'), { key: 'garten', name: 'Garten', outdoor: true });
// A view without a casora_room header is no room (Energy, Scenes, an own page): the house, not "Keine Sensoren".
eq('desktop: view without header → house', at('/casora/abstellkammer'), null);
eq('desktop: Energy view (tiles, no room header) → house', at('/casora/energie'), null);
eq('desktop: header with a template name → the title', at('/casora/bad'), { key: 'bad', name: 'Bad', outdoor: false });
eq('explicit: null = house', V.scope({}, null), null);
// The Studio's preview room counts only while the Studio is on the page (HA keeps one window: the dashboard
// opened after the Studio must not inherit it).
window._casoraStudioRoom = { key: 'garten', name: 'Garten' };
eq('Studio room without the Studio on the page: ignored (the address decides)', at('/casora/wohnzimmer'), { key: 'wohnzimmer', name: 'Wohnzimmer', outdoor: false });
window._casoraStudioPanel = { isConnected: true };
eq('Studio preview: the panel names the room', at('/casora-studio'), { key: 'garten', name: 'Garten', outdoor: true });
window._casoraStudioRoom = null;
eq('Studio preview: Home', at('/casora-studio'), null);
window._casoraStudioRoom = { key: 'garten', name: 'Garten' };
window._casoraStudioPanel = { isConnected: false };
eq('Studio left (panel disconnected): ignored', at('/casora/wohnzimmer'), { key: 'wohnzimmer', name: 'Wohnzimmer', outdoor: false });
delete window._casoraStudioRoom; delete window._casoraStudioPanel;
eq('explicit: a room by name', V.scope({}, { name: 'Terrasse' }), { key: 'terrasse', name: 'Terrasse', outdoor: true });
// Phone: one view, the room filter decides.
cfg = { views: [{ path: 'home', cards: [] }] };
let filter = 'all';
window._casoraFilter = { get: () => filter };
window.casoraPhoneRoom = { vars: (key) => (key === 'room_garten' ? { _name: 'Garten' } : null) };
eq('phone: filter all → house', at('/casora-mobile/home'), null);
filter = 'room_garten';
eq('phone: room filter garden', at('/casora-mobile/home'), { key: 'garten', name: 'Garten', outdoor: true });
filter = 'room_wohnzimmer';
eq('phone: room filter without a name', at('/casora-mobile/home'), { key: 'wohnzimmer', name: null, outdoor: false });
filter = 'security';
eq('phone: other filters → house', at('/casora-mobile/home'), null);
delete window._casoraFilter; delete window.casoraPhoneRoom;
cfg = null;

// ── Model: which rows ──
const names = (m) => m.rooms.map((x) => x.n);
const house = V.model(states, {}, null);
eq('house: every room, urgent first', [house.mode, names(house)], ['house', ['Küche', 'Wohnzimmer', 'Büro']]);
const garten = V.model(states, {}, { key: 'garten', name: 'Garten' });
eq('garden: no indoor room, outdoor mode', [garten.mode, names(garten)], ['outdoor', []]);
const wz = V.model(states, {}, { key: 'wohnzimmer', name: 'Wohnzimmer' });
eq('living room: only its own row', [wz.mode, names(wz)], ['room', ['Wohnzimmer']]);
eq('room by slug of the area name (view buero, area buro)', names(V.model(states, {}, { key: 'buero', name: null })), ['Büro']);
eq('room by name only (renamed view path)', names(V.model(states, {}, { key: 'kochecke', name: 'Küche' })), ['Küche']);
eq('indoor room without sensors: empty, never the others', [V.model(states, {}, { key: 'abstellkammer', name: 'Abstellkammer' }).mode], ['empty']);
const hid = V.model(states, { popup_hide: ['kuche'] }, null);
eq('house with a hidden room', [names(hid), hid.hidden], [['Wohnzimmer', 'Büro'], 1]);
eq('room page: own row hidden → empty rows, still room mode', [V.model(states, { popup_hide: ['wohnzimmer'] }, { name: 'Wohnzimmer' }).mode, names(V.model(states, { popup_hide: ['wohnzimmer'] }, { name: 'Wohnzimmer' }))], ['room', []]);
ok('older sensor states without rooms do not throw', V.model({ 'sensor.casora_lueften': { state: 'ok', attributes: {} } }, {}, null).rooms.length === 0);

// ── Tile text and color follow the scope and the hidden rows ──
eq('tile Home: the room that needs airing', V.tile(states, {}, null), 'Küche');
eq('tile Home with Küche hidden', V.tile(states, { popup_hide: ['kuche'] }, null), 'Luft gut');
eq('tile garden: the outdoor temperature', V.tile(states, {}, { name: 'Garten' }), '12,5 °C');
eq('tile living room: its own status', V.tile(states, {}, { name: 'Wohnzimmer' }), 'Luft gut');
eq('tile kitchen: its own status, not its name', V.tile(states, {}, { name: 'Küche' }), 'Jetzt lüften');
eq('tile room without sensors', V.tile(states, {}, { name: 'Abstellkammer' }), 'Keine Sensoren');
ok('color Home: airing (blue)', /blue/.test(V.color(states, {}, null)));
ok('color Home with Küche hidden: calm (teal)', /teal/.test(V.color(states, { popup_hide: ['kuche'] }, null)));
ok('color garden: calm', /teal/.test(V.color(states, {}, { name: 'Garten' })));

// ── Sections as the popup draws them (C = { hide, scope }) ──
const CG = { hide: [], scope: { key: 'garten', name: 'Garten', outdoor: true } };
eq('garden: no rooms section', V.sec('rooms', states, CG), '');
const outG = V.sec('out', states, CG);
eq('garden: outdoor air = its own sensors only', [outG.group, outG.rows.map((r) => r.label)], ['Außenluft', ['Temperatur', 'Luftfeuchtigkeit', 'Feinstaub PM2.5']]);
eq('garden: no coach', V.sec('coach', states, CG), '');
ok('garden: hero shows the outdoor reading', /12,5/.test(JSON.stringify(V.sec('hero', states, CG))));
const CW = { hide: [], scope: { key: 'wohnzimmer', name: 'Wohnzimmer', outdoor: false } };
const rowsW = V.sec('rooms', states, CW);
eq('living room: one row, heading Raumluft', [rowsW.group, rowsW.rows.map((r) => r.label), rowsW.rows[0].id], ['Raumluft', ['Wohnzimmer'], 'wohnzimmer']);
ok('living room: outdoor air with the airing timer', V.sec('out', states, CW).rows.some((r) => r.label === 'Stoßlüften'));
ok('living room: the room coach', /data-room|Wohnzimmer ok/.test(String(V.sec('coach', states, CW))));
const CE = { hide: [], scope: { key: 'abstellkammer', name: 'Abstellkammer', outdoor: false } };
eq('room without sensors: hint row', V.sec('empty', states, CE).rows.map((r) => r.label), ['Keine Klimasensoren in diesem Raum']);
eq('room without sensors: no rooms, no coach', [V.sec('rooms', states, CE), V.sec('coach', states, CE)], ['', '']);
const CH = { hide: [], scope: null };
const rowsH = V.sec('rooms', states, CH);
eq('Home unchanged: every room under Räume', [rowsH.group, rowsH.rows.map((r) => r.label)], ['Räume', ['Küche', 'Wohnzimmer', 'Büro']]);
ok('Home: house coach', /Haus ok/.test(String(V.sec('coach', states, CH))));
eq('Home with hidden rows', V.sec('rooms', states, { hide: ['kuche', 'buro'], scope: null }).rows.map((r) => r.label), ['Wohnzimmer']);
eq('older callers without C: the house', V.sec('rooms', states).rows.length, 3);

// ── The popup card: scope and hidden ids travel with the live cards, outdoor/empty are one column ──
location.pathname = '/casora/garten';
cfg = { views: [{ path: 'home', cards: [] }, { path: 'garten', cards: [{ type: 'custom:button-card', template: 'casora_room', name: 'Garten' }] }] };
const pg = JSON.stringify(V.popup(null, {}, states));
ok('garden popup carries its scope', pg.includes('\\"scope\\":{\\"key\\":\\"garten\\"'), pg.slice(0, 300));
ok('garden popup: one column, only the outdoor air', !pg.includes('"right":{"card"') && pg.includes('\\"out\\"') && !pg.includes('\\"rooms\\"'), pg.slice(0, 400));
location.pathname = '/casora/home';
const ph = JSON.stringify(V.popup(null, { popup_hide: ['kuche'] }, states));
ok('Home popup carries the hidden ids and both columns', ph.includes('\\"hide\\":[\\"kuche\\"]') && ph.includes('"right":{"card"'), ph.slice(0, 400));
cfg = null;

// ── Studio candidates ──
eq('entries Home: every room', H.entries('casora_vent', hass, {}, null).map((e) => e.id), ['kuche', 'wohnzimmer', 'buro']);
eq('entries in a room: only its rows', H.entries('casora_vent', hass, {}, 'Wohnzimmer').map((e) => e.id + '|' + e.name), ['wohnzimmer|Wohnzimmer']);
eq('entries in the garden: nothing to hide', H.entries('casora_vent', hass, {}, 'Garten'), []);
ok('entries carry status and readings', /Jetzt lüften/.test(H.entries('casora_vent', hass, {}, 'Küche')[0].sub));

// ── Coach in the climate popup (casora_climate_popup): any dashboard room, not a fixed German list ──
window._casoraRoomNames = () => ['Zuhause', 'Wohnzimmer', 'Garten', 'Living Room'];
ok('climateSlot: dashboard room → room coach', /data-room="Garten"/.test(V.climateSlot('Garten', states)));
ok('climateSlot: English room name too', /data-room="Living Room"/.test(V.climateSlot('Living Room', states)));
ok('climateSlot: Home → house coach', !/data-room/.test(V.climateSlot('Zuhause', states)));
ok('climateSlot: no room → house coach', !/data-room/.test(V.climateSlot('Klima', states)));
ok('climateSlot: coach room without dashboard entry', /data-room="Wohnzimmer"/.test(V.climateSlot('Wohnzimmer', states)));

// ── Studio: „Shown in the popup“ (casora-panel-popups.js) with a minimal DOM ──
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.style = {}; this.dataset = {}; this.classList = { add: noop, remove: noop, toggle: noop, contains: () => false }; this.isConnected = true; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { this.children.push(c); c.parentNode = c.parentElement = this; return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(c)); }
  querySelector() { return this.children.find((c) => c.tagName === 'LABEL') || null; }
  querySelectorAll() { return []; }
  getElementById() { return null; }
  matches() { return false; }
  addEventListener() {}
  click() { if (this.onclick) this.onclick(); }
  get textContent() { return this._t || ''; }
  set textContent(v) { this._t = String(v); }
}
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
let Panel = null;
const keep = {};
['document', 'customElements', 'setTimeout', 'requestAnimationFrame', 'matchMedia', 'fetch', 'HTMLElement', 'innerWidth', 'innerHeight', 'localStorage']
  .forEach((k) => { keep[k] = Object.getOwnPropertyDescriptor(globalThis, k); });
const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
const doc = { createElement: (t) => new El(t) };
set('document', new Proxy(doc, { get: (t, k) => (k in t ? t[k] : stub()) }));
set('customElements', { get: () => Panel, define: (nm, c) => { Panel = c; }, whenDefined: () => Promise.resolve() });
set('setTimeout', () => 0); set('requestAnimationFrame', () => 0);
set('matchMedia', (q) => ({ matches: false, addEventListener: noop }));
set('fetch', () => Promise.reject(new Error('offline')));
set('HTMLElement', class {}); set('innerWidth', 1400); set('innerHeight', 900);
set('localStorage', { getItem: () => null, setItem: noop, removeItem: noop });
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info; console.info = noop;
new Function(fix(src('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(src('custom_components/casora/panel/casora-panel.js')))();
new Function(fix(src('custom_components/casora/panel/casora-panel-popups.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
assert.ok(Panel, 'panel class');
const P = Panel.prototype;
ok('Studio: _popupHideRows on the panel', typeof P._popupHideRows === 'function');
ok('Studio: hook in the tile form', /_popupHideRows\(tile, type, advRow\)/.test(src('custom_components/casora/panel/casora-panel.js')));
const panel = (ri) => {
  const p = Object.create(P);
  p._hass = hass; p._room = ri; p.dirty = 0; p.synced = 0;
  p._state = { compact: { rooms: [{ path: 'home', name: 'Zuhause', tiles: [] }, { path: 'wohnzimmer', name: 'Wohnzimmer', tiles: [] }, { path: 'garten', name: 'Garten', tiles: [] }] }, templates: {} };
  p.shadowRoot = { getElementById: () => ({}), appendChild: noop };
  p._markDirty = () => { p.dirty++; }; p._syncPreview = () => { p.synced++; }; p._renderForm = noop;
  return p;
};
const render = (p, tile) => {
  const rows = [];
  P._popupHideRows.call(p, tile, { id: 'casora_vent' }, (label, input, sub) => { const r = new El('div'); const l = new El('label'); l.textContent = label; r.appendChild(l); r.appendChild(input); rows.push({ label, sub, input, r }); });
  return rows;
};
const tile = { template: 'casora_vent', name: 'Raumklima' };
let rows = render(panel(0), tile);
eq('Studio Home: lead row + every room', rows.map((r) => r.label), ['Visible in the popup', 'Küche', 'Wohnzimmer', 'Büro']);
ok('Studio: room names are data, not UI text', rows[1].r.querySelector('label').getAttribute('data-no-i18n') === '');
ok('Studio: every room on', rows.slice(1).every((r) => r.input.getAttribute('aria-checked') === 'true'));
const p0 = panel(0);
rows = render(p0, tile);
rows[1].input.click();
eq('Studio: switching a room off writes popup_hide', tile.variables, { popup_hide: ['kuche'] });
ok('Studio: dirty + preview after the change', p0.dirty === 1 && p0.synced === 1);
rows = render(panel(0), tile);
ok('Studio: hidden row shown off, others on', rows[1].input.getAttribute('aria-checked') === 'false' && rows[2].input.getAttribute('aria-checked') === 'true');
eq('Studio: lead names the count', rows[0].input.textContent, '1 row hidden');
rows[1].input.click();
eq('Studio: switching it on again removes the list', tile.variables, undefined);
const tileW = { template: 'casora_vent' };
eq('Studio in a room: only its rows', render(panel(1), tileW).map((r) => r.label), ['Visible in the popup', 'Wohnzimmer']);
rows = render(panel(2), tileW);
eq('Studio in the garden: nothing to hide', [rows.length, rows[0].input.textContent], [1, 'Nothing to hide yet – the popup collects its rows by itself.']);
eq('Studio: a tile without automatic popup gets no list', render(panel(0), { template: 'casora_light', entity: 'light.a' }).length, 0);
rows = render(panel(0), { template: 'casora_battery' });
eq('Studio batteries: the house list', rows.map((r) => r.label), ['Visible in the popup', 'Tür Batterie', 'Fenster Batterie']);
// Stale ids (room gone) drop out on the next change.
const stale = { template: 'casora_vent', variables: { popup_hide: ['keller', 'buro'] } };
rows = render(panel(0), stale);
rows[2].input.click();
eq('Studio: stale ids drop, known ones stay', stale.variables.popup_hide, ['wohnzimmer', 'buro']);
// The preview's room marker ends with the preview and with the panel (casora-panel-popups.js _cpClose, disconnectedCallback).
{
  const p = panel(2);
  p.classList = { remove: noop, add: noop, contains: () => false }; p._cpSync = noop; p._cpLayer = null;
  window._casoraStudioRoom = { key: 'garten', name: 'Garten' };
  P._cpClose.call(p);
  ok('Studio: closing the preview drops the room marker', !('_casoraStudioRoom' in window));
  window._casoraStudioRoom = { key: 'garten', name: 'Garten' };
  window._casoraStudioPanel = p;
  P.disconnectedCallback.call(p);
  ok('Studio: leaving the panel drops the room marker', !('_casoraStudioRoom' in window));
  ok('Studio: leaving the panel unregisters it', window._casoraStudioPanel === null);
  ok('Studio: _cpOpen sets the marker', /window\._casoraStudioRoom = cpRoom/.test(src('custom_components/casora/panel/casora-panel-popups.js')));
}
// German Studio texts exist.
const de = JSON.parse(src('custom_components/casora/translations/panel/de.json'));
['Visible in the popup', 'Switch off what the popup should not list.', 'Nothing to hide yet – the popup collects its rows by itself.', '1 row hidden']
  .forEach((k) => ok('de.json: ' + k, !!de.exact[k]));
ok('de.json: plural pattern', de.patterns.some(([re]) => re === '^(\\d+) rows hidden$'));
const en = JSON.parse(src('custom_components/casora/translations/dashboard/phrases/en.json'));
ok('phrases: empty state translated', !!en.exact['Keine Klimasensoren in diesem Raum']);
// Templates: the tile hands its variables to the module, the battery popup skips hidden rows.
const T = JSON.parse(src('custom_components/casora/panel/casora-templates.json')).templates;
ok('casora_vent: state with variables', /_casoraVent\.tile\(states, variables\)/.test(T.casora_vent.state_display));
ok('casora_popup_battery: hidden rows out', /casoraPopupHide\.has\(variables, e\.entity_id\)/.test(T.casora_popup_battery.tap_action.casora_popup.content));

console.log('popup_zeilen: ok (' + n + ' Prüfungen)');
