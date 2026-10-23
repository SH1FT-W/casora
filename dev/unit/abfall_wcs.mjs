// Issue #27: Waste Collection Schedule (WCS) on HA 2026.4+. Loads the real finder (00-finder.js), the
// casora_trash tile expression, the Studio panel (_boolSwitch, _entMeta), the Studio settings
// (casora-panel-personal.js) and the tile types (casora-panel-types.js).
//   - bin names without the place (friendly name "<device> <entity>", device renamed or not)
//   - countdown from the date attributes / an ISO date state instead of "Keine Daten", the same in
//     the popup; an overview sensor for every type gets no countdown from its dates
//   - a configured calendar that is gone falls back to the detected one; a failed calendar fetch
//     is not repeated on every render (5 s, 15 s, then every minute; opening the popup tries at once)
//   - Studio: a bin picked without a name keeps its name, a corrected pick takes the new name, an
//     emptied name gets it back; the waste tile mirrors the global "Calendar in the waste popup" switch
//   node dev/unit/abfall_wcs.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
const flush = () => new Promise((r) => setImmediate(r));

// Minimal DOM: enough for the switch and the settings rows.
const mk = (tag) => {
  const cls = new Set();
  return {
    tagName: String(tag).toUpperCase(), children: [], attributes: {}, dataset: {}, style: { setProperty: noop },
    className: '', textContent: '', innerHTML: '', parentElement: null, isConnected: true,
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
      toggle: (c, on) => ((on === undefined ? !cls.has(c) : on) ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
    setAttribute(k, v) { this.attributes[k] = String(v); }, getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; }, append(...c) { c.forEach((x) => this.appendChild(x)); },
    addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], matches: () => false, remove: noop,
  };
};
const DOM = { createElement: mk, createTextNode: (t) => ({ textContent: t }), querySelector: () => null };

globalThis.window = globalThis;
globalThis.document = DOM;
globalThis.addEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
window.casoraStateFit = (t) => t;

new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
const D = window.casoraDevice;
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.state_display));
const tileOf = (hass, vars) => tile(hass.states, null, {}, hass, vars || {}, null);
// The popup content (casora_trash tap_action) with a stub UI: what the hero and the bin rows say.
const popup = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.tap_action.casora_popup.content));
function popOf(hass, vars) {
  const seen = { hero: null, rows: [] };
  window._casoraUI = { tokens: {}, esc: String, hero: (o) => { seen.hero = o; return ''; },
    group: (r, t) => { if (t === 'Tonnen') seen.rows = r.map((x) => [x.label, x.value]); return ''; } };
  try { popup(hass.states, null, {}, hass, vars || {}, null); } finally { delete window._casoraUI; }
  return seen;
}

const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
// WCS default state: "on Thu, 12.11.2026".
const on = (d) => 'on ' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ', '
  + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();

// WCS-shaped hass: one device "Waste Collection Schedule" (place = renamed by the user), default
// sensors without daysTo, pickup dates as attributes {date: type}. HA 2026.4+: friendly name
// "<device name_by_user || name> <entity name>", a name the user gave the entity alone.
const BINS = [['Grüne Tonne', 2, 16], ['Schwarze Tonne', 9, 23], ['Blaue Tonne', 5, 19]];
const idOf = (t) => 'sensor.waste_collection_schedule_' + t.toLowerCase().replace(/ü/g, 'u').replace(/\s+/g, '_');
function wcs({ place = null, rename = {}, bins = BINS } = {}) {
  const dev = { id: 'dev_wcs', name: 'Waste Collection Schedule', name_by_user: place };
  const states = {}, entities = {};
  for (const [t, a, b] of bins) {
    const id = idOf(t);
    states[id] = { entity_id: id, state: on(day(a)), attributes: {
      [ymd(day(-3))]: t, [ymd(day(a))]: t, [ymd(day(b))]: t, friendly_name: rename[t] || (place || dev.name) + ' ' + t } };
    entities[id] = { entity_id: id, device_id: dev.id, platform: 'waste_collection_schedule', name: rename[t] || t };
  }
  return { states, entities, devices: { [dev.id]: dev } };
}
const labels = (W) => W.bins.map((b) => b.label).sort();
const binOf = (W, label) => W.bins.find((b) => b.label === label);
window.CASORA_SETTINGS = {};

// ── A: names without the place ────────────────────────────────────────────────
{
  let W = D.waste(wcs(), {});
  assert.deepEqual(labels(W), ['Blaue Tonne', 'Grüne Tonne', 'Schwarze Tonne'], 'device not renamed');
  W = D.waste(wcs({ place: 'Musterdorf' }), {});
  assert.deepEqual(labels(W), ['Blaue Tonne', 'Grüne Tonne', 'Schwarze Tonne'], 'device renamed to the place');
  // A place with a kind word must not colour every bin (Glasberg → glass).
  W = D.waste(wcs({ place: 'Glasberg' }), {});
  assert.equal(binOf(W, 'Blaue Tonne').color, '#0A84FF', 'blue bin stays blue');
  assert.equal(binOf(W, 'Grüne Tonne').color, '#30D158', 'green bin stays green');
  // A name the user gave the entity stays as it is.
  W = D.waste(wcs({ place: 'Musterdorf', rename: { 'Grüne Tonne': 'Bio' } }), {});
  assert.deepEqual(labels(W), ['Bio', 'Blaue Tonne', 'Schwarze Tonne'], 'user-renamed entity');
  // No registry (hass.entities/devices empty): the WCS device name still goes.
  const h = wcs();
  W = D.waste({ states: h.states, entities: {}, devices: {} }, { trash_sensors: Object.keys(h.states) });
  assert.deepEqual(labels(W), ['Blaue Tonne', 'Grüne Tonne', 'Schwarze Tonne'], 'no registry');
  // Names from the Studio or the tile come first.
  W = D.waste(wcs({ place: 'Musterdorf' }), { trash_sensors: { [idOf('Grüne Tonne')]: 'Biotonne' } });
  assert.deepEqual(labels(W), ['Biotonne']);
  // Calendar events match the short name (popup dates per bin).
  const hc = wcs({ place: 'Musterdorf' });
  const CAL = 'calendar.waste_collection_schedule_musterdorf';
  hc.states[CAL] = { entity_id: CAL, state: 'off', attributes: { friendly_name: 'Musterdorf Entsorger' } };
  hc.entities[CAL] = { entity_id: CAL, device_id: 'dev_wcs', platform: 'waste_collection_schedule' };
  window._casoraTrashCal = { id: CAL, ts: Date.now(), ev: [{ summary: 'Grüne Tonne', start: { date: ymd(day(30)) } }] };
  const g = D.wasteDates(hc, D.waste(hc, {})).find((x) => x.bin.label === 'Grüne Tonne');
  assert.ok(g.dates.map(ymd).includes(ymd(day(30))), 'calendar date for the bin');
  window._casoraTrashCal = null;
  console.log('abfall_wcs: names ok');
}

// ── B: countdown from the dates instead of "Keine Daten" ───────────────────────
{
  const h = wcs({ place: 'Musterdorf' });
  const W = D.waste(h, {});
  assert.equal(binOf(W, 'Grüne Tonne').days, 2, 'nearest date from today, past dates ignored');
  assert.equal(binOf(W, 'Blaue Tonne').days, 5);
  assert.equal(W.days, 2);
  assert.equal(tileOf(h), '2 Tage · Grüne Tonne');
  let pop = popOf(h);
  assert.equal(pop.hero.value, 'Grüne Tonne', 'popup: same next bin as the tile');
  assert.match(pop.hero.sub, /^in 2 Tagen · /);
  // Pickup today.
  const h0 = wcs({ bins: [['Gelbe Tonne', 0, 14]] });
  assert.equal(tileOf(h0), 'Heute Gelbe Tonne');
  // Date as attribute value, state without a number.
  const hv = { states: { 'sensor.papier': { entity_id: 'sensor.papier', state: 'bald', attributes: { friendly_name: 'Papier', next_date: ymd(day(4)) } } }, entities: {}, devices: {} };
  assert.equal(D.waste(hv, { trash_sensors: ['sensor.papier'] }).days, 4, 'ISO date as attribute value');
  // A date as state (device_class date) is a date, not the year.
  const hd = { states: { 'sensor.restmuell': { entity_id: 'sensor.restmuell', state: ymd(day(3)), attributes: { device_class: 'date' } } }, entities: {}, devices: {} };
  assert.equal(D.waste(hd, { trash_sensors: { 'sensor.restmuell': 'Restmüll' } }).days, 3, 'ISO date state');
  assert.equal(tileOf(hd, { trash_sensors: { 'sensor.restmuell': 'Restmüll' } }), '3 Tage · Restmüll');
  // The popup counts the same days as the tile, not the year.
  pop = popOf(hd, { trash_sensors: { 'sensor.restmuell': 'Restmüll' } });
  assert.deepEqual(pop.rows, [['Restmüll', 'in 3 Tagen']], 'popup: ISO date state');
  assert.match(pop.hero.sub, /^in 3 Tagen · /);
  // A past date as state with daysTo: daysTo, in the tile and the popup.
  const hp = { states: { 'sensor.restmuell': { entity_id: 'sensor.restmuell', state: ymd(day(-1)), attributes: { device_class: 'date', daysTo: 6 } } }, entities: {}, devices: {} };
  assert.equal(tileOf(hp, { trash_sensors: { 'sensor.restmuell': 'Restmüll' } }), '6 Tage · Restmüll');
  assert.deepEqual(popOf(hp, { trash_sensors: { 'sensor.restmuell': 'Restmüll' } }).rows, [['Restmüll', 'in 6 Tagen']]);
  // daysTo still wins over the dates.
  const ht = wcs({ bins: [['Bio', 6, 20]] });
  ht.states[idOf('Bio')].state = '6';
  ht.states[idOf('Bio')].attributes.daysTo = 6;
  assert.equal(D.waste(ht, {}).days, 6);
  // Colour word with "ue".
  const hu = wcs({ bins: [['Gruene Tonne', 1, 15]] });
  assert.equal(D.waste(hu, {}).bins[0].color, '#30D158', 'Gruene → green');

  // An overview sensor for every type (state = next type, dates of all types) gets no countdown
  // from its dates: the next pickup stays the real bin, with its colour.
  const overview = (hs, types) => {
    const id = 'sensor.waste_collection_schedule_abfuhr', a = { friendly_name: 'Waste Collection Schedule Abfuhr' };
    types.forEach(([t, n]) => { a[ymd(day(n))] = t; });
    hs.states[id] = { entity_id: id, state: types[0][0], attributes: a };
    hs.entities[id] = { entity_id: id, device_id: 'dev_wcs', platform: 'waste_collection_schedule', name: 'Abfuhr' };
    return id;
  };
  const ho = wcs({ bins: [['Bio', 1, 15], ['Papier', 6, 20]] });
  ho.states[idOf('Bio')].state = '1';
  ho.states[idOf('Papier')].state = '6';
  const ov = overview(ho, [['Bio', 1], ['Papier', 6], ['Bio', 15]]);
  let Wo = D.waste(ho, {});
  assert.equal(Wo.bins.find((b) => b.id === ov).days, null, 'overview: no countdown from mixed dates');
  assert.deepEqual(Wo.next, { label: 'Bio', tint: 'rgba(48,209,88,0.25)', color: '#30D158' });
  assert.equal(tileOf(ho), 'Morgen Bio');
  // The same with WCS default sensors (no number anywhere).
  const hw = wcs();
  overview(hw, [['Grüne Tonne', 2], ['Blaue Tonne', 5], ['Schwarze Tonne', 9]]);
  Wo = D.waste(hw, {});
  assert.equal(Wo.next.label, 'Grüne Tonne');
  assert.equal(tileOf(hw), '2 Tage · Grüne Tonne');
  // appointment_types format ({type: date}): one type is one bin, several are an overview.
  const ha = { states: {
    'sensor.bio': { entity_id: 'sensor.bio', state: 'bald', attributes: { Bio: ymd(day(3)) } },
    'sensor.alle': { entity_id: 'sensor.alle', state: 'bald', attributes: { Bio: ymd(day(3)), Papier: ymd(day(8)) } } },
  entities: {}, devices: {} };
  Wo = D.waste(ha, { trash_sensors: ['sensor.bio', 'sensor.alle'] });
  assert.deepEqual(Wo.bins.map((b) => [b.id, b.days]), [['sensor.bio', 3], ['sensor.alle', null]]);
  console.log('abfall_wcs: countdown ok');
}

// ── C: calendar fallback and fetch throttle ──────────────────────────────────
{
  const LIVE = 'calendar.waste_collection_schedule_musterdorf';
  const h = { states: { [LIVE]: { entity_id: LIVE, state: 'off', attributes: { friendly_name: 'Musterdorf' } } },
    entities: { [LIVE]: { entity_id: LIVE, platform: 'waste_collection_schedule' } }, devices: {} };
  window.CASORA_SETTINGS = { waste: { calendar: 'calendar.weg' } };
  assert.equal(D.waste(h, {}).calendar, LIVE, 'configured calendar gone (settings): detected one');
  window.CASORA_SETTINGS = {};
  assert.equal(D.waste(h, { trash_calendar: 'calendar.weg' }).calendar, LIVE, 'configured calendar gone (tile): detected one');
  // A configured calendar that exists is kept, even with another one around.
  h.states['calendar.eigener'] = { entity_id: 'calendar.eigener', state: 'off', attributes: { friendly_name: 'Eigener' } };
  window.CASORA_SETTINGS = { waste: { calendar: 'calendar.eigener' } };
  assert.equal(D.waste(h, {}).calendar, 'calendar.eigener');
  // Nothing else found: the configured id stays, and the tile says the source is unreachable.
  const h2 = { states: {}, entities: {}, devices: {}, callApi: () => new Promise(noop) };
  window.CASORA_SETTINGS = { waste: { calendar: 'calendar.weg' } };
  assert.equal(D.waste(h2, {}).calendar, 'calendar.weg');
  assert.equal(tileOf(h2), 'Nicht erreichbar');

  // A failed fetch is not repeated on every render: again after 5 s, 15 s, then every minute.
  // Opening the popup tries at once (a short outage must not leave it loading).
  delete window._casoraTrashFetch;
  window._casoraTrashCal = null; window._casoraTrashBusy = false; window._casoraTrashFail = null;
  window.CASORA_SETTINGS = { waste: { calendar: LIVE } };
  let calls = 0, up = false;
  const hf = { states: { [LIVE]: h.states[LIVE] }, entities: {}, devices: {},
    callApi: () => { calls++; return up ? Promise.resolve([{ summary: 'Grüne Tonne', start: { date: ymd(day(2)) } }]) : Promise.reject(new Error('Bad Request')); } };
  const now = Date.now, t0 = now();
  const at = async (s) => { Date.now = () => t0 + s * 1000; tileOf(hf); await flush(); return calls; };
  try {
    for (let i = 0; i < 5; i++) await at(0);
    assert.equal(calls, 1, 'no new fetch on every render after a failure');
    assert.equal(await at(4), 1);
    assert.equal(await at(6), 2, 'again after 5 s');
    assert.equal(await at(20), 2);
    assert.equal(await at(22), 3, 'then after 15 s');
    assert.equal(await at(80), 3);
    assert.equal(await at(83), 4, 'then every minute');
    assert.equal(await at(140), 4);
    popOf(hf); await flush();
    assert.equal(calls, 5, 'popup opened: tried at once');
    up = true;
    assert.equal(await at(150), 5, 'the tile still waits');
    popOf(hf); await flush();
    assert.equal(calls, 6);
    popOf(hf); await flush();
    assert.equal(calls, 6, 'loaded: no new fetch on open');
  } finally { Date.now = now; }
  assert.equal(window._casoraTrashCal.id, LIVE, 'answer stored');
  assert.equal(window._casoraTrashFail, null, 'failure forgotten');
  assert.equal(tileOf(hf), '2 Tage · Grüne Tonne');
  window._casoraTrashCal = null;
  console.log('abfall_wcs: calendar ok');
}

// ── Studio: load the panel (real class) and the settings module ────────────────
let Panel = null;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.location = { pathname: '/' };
globalThis.matchMedia = () => ({ matches: false, addEventListener: noop });
globalThis.HTMLElement = class {};
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
globalThis.document = DOM;
console.info = info;
assert.ok(Panel, 'panel class');
globalThis.customElements = { get: () => Panel, define: noop, whenDefined: () => Promise.resolve() };
new Function(read('custom_components/casora/panel/casora-panel-personal.js'))();
await flush();
const P = Panel.prototype;
const { normalize, prune } = window.casoraPersonal;

// A panel object with the real helpers and stubbed layout pieces.
function panelWith(hass) {
  const p = Object.create(P);
  p._hass = hass;
  p.shadowRoot = { getElementById: () => ({}), appendChild: noop, querySelectorAll: () => [] };
  p.combos = []; p.rows = []; p.renders = 0; p.said = [];
  p._flowGroup = () => { const l = mk('div'); l.parentElement = mk('div'); return l; };
  p._flowRow = (list, o) => { const row = mk('div'); p.rows.push({ o, row }); return { row }; };
  p._combo = (value, opts, ph, onChange) => { p.combos.push({ value, onChange }); return { wrap: mk('div') }; };
  p._entityList = () => [];
  p._renderForm = () => { p.renders++; };
  p._status = (msg, kind) => { p.said.push([msg, kind]); };
  return p;
}

// ── D: a bin picked without a name is kept ───────────────────────────────────
{
  const hass = wcs({ place: 'Musterdorf' });
  const p = panelWith(hass);
  const S = normalize({});
  S.waste.sensors[''] = '';   // "Add bin"
  P._casoraPersonalGroups.call(p, mk('div'), S, ['waste'], noop);
  p.combos[0].onChange(idOf('Grüne Tonne'));
  assert.deepEqual(S.waste.sensors, { [idOf('Grüne Tonne')]: 'Grüne Tonne' }, 'name filled in, without the place');
  assert.deepEqual(prune(S).waste.sensors, { [idOf('Grüne Tonne')]: 'Grüne Tonne' }, 'kept on save');
  // Device not renamed, no registry: "Waste Collection Schedule" goes as well.
  const h2 = wcs();
  const p2 = panelWith({ states: h2.states, entities: {}, devices: {} });
  const S2 = normalize({});
  S2.waste.sensors[''] = '';
  P._casoraPersonalGroups.call(p2, mk('div'), S2, ['waste'], noop);
  p2.combos[0].onChange(idOf('Blaue Tonne'));
  assert.deepEqual(prune(S2).waste.sensors, { [idOf('Blaue Tonne')]: 'Blaue Tonne' });
  // A name typed before picking stays.
  const S3 = normalize({});
  S3.waste.sensors[''] = 'Papier';
  const p3 = panelWith(hass);
  P._casoraPersonalGroups.call(p3, mk('div'), S3, ['waste'], noop);
  p3.combos[0].onChange(idOf('Blaue Tonne'));
  assert.deepEqual(S3.waste.sensors, { [idOf('Blaue Tonne')]: 'Papier' });
  // Wrong sensor picked, then corrected in the same row: the filled-in name follows the sensor;
  // a typed name stays.
  const pickIn = (S0, v) => {
    const pp = panelWith(hass);
    P._casoraPersonalGroups.call(pp, mk('div'), S0, ['waste'], noop);
    pp.combos[0].onChange(v);
  };
  pickIn(S, idOf('Blaue Tonne'));
  assert.deepEqual(S.waste.sensors, { [idOf('Blaue Tonne')]: 'Blaue Tonne' }, 'filled-in name replaced');
  const Wr = D.waste(hass, { trash_sensors: prune(S).waste.sensors });
  assert.deepEqual(Wr.bins.map((b) => [b.label, b.color]), [['Blaue Tonne', '#0A84FF']], 'blue bin, blue colour');
  pickIn(S3, idOf('Grüne Tonne'));
  assert.deepEqual(S3.waste.sensors, { [idOf('Grüne Tonne')]: 'Papier' }, 'typed name kept');
  // The name field emptied: the filled-in name comes back, the bin is not dropped on save.
  const pn = panelWith(hass);
  P._casoraPersonalGroups.call(pn, mk('div'), S3, ['waste'], noop);
  const name = pn.rows.find((r) => r.o.title === 'Bin').row.children[0].children.find((c) => c.tagName === 'INPUT');
  name.value = '';
  name.oninput();
  assert.deepEqual(prune(S3).waste.sensors, { [idOf('Grüne Tonne')]: 'Grüne Tonne' }, 'emptied name: bin kept');
  name.value = 'Bio';
  name.oninput();
  assert.deepEqual(S3.waste.sensors, { [idOf('Grüne Tonne')]: 'Bio' });
  console.log('abfall_wcs: studio bin ok');
}

// ── E: the waste tile mirrors the global "Calendar in the waste popup" ───────────
{
  const type = window.CASORA_TILE_TYPES.find((t) => t.id === 'casora_trash');
  const f = type.fields.find((x) => x.setting);
  assert.ok(f, 'waste tile has the settings switch');
  assert.equal(f.key, 'waste.calendar_popup', 'same setting as under Settings');
  assert.equal(f.type, 'bool');
  assert.equal(f.boolDefault, true, 'on unless switched off');
  assert.ok(f.advanced, 'in the Popup fold');
  assert.equal(f.label, 'Calendar in the waste popup', 'same words as under Settings');
  assert.equal(f.sub, 'Month with the pickup days in the bin colors');
  // The tile inspector hands setting fields to the settings module instead of writing a tile variable.
  assert.match(read('custom_components/casora/panel/casora-panel.js'),
    /if \(f\.setting\) \{\s*const sw = typeof this\._casoraSettingSwitch === "function" \? this\._casoraSettingSwitch\(f\)/);

  // The switch under Settings stores only "off".
  const hass = wcs();
  const ps = panelWith(hass);
  const S = normalize({});
  P._casoraPersonalGroups.call(ps, mk('div'), S, ['waste'], noop);
  const settingsSw = ps.rows.find((r) => r.o.title === 'Calendar in the waste popup').row.children[0];
  settingsSw.onclick();
  assert.equal(prune(S).waste.calendar_popup, false);

  // Stored settings in the integration; set replaces everything.
  const store = { settings: { waste: { sensors: { [idOf('Blaue Tonne')]: 'Papier' } }, scenes: { exclude: ['scene.beispiel'] } } };
  const ws = (m) => {
    if (m.type === 'casora/settings/get') return Promise.resolve({ stored: true, settings: JSON.parse(JSON.stringify(store.settings)) });
    if (m.type === 'casora/settings/set') { store.settings = m.settings; return Promise.resolve({ stored: true, settings: m.settings }); }
    return Promise.reject(new Error('unknown'));
  };
  window.CASORA_SETTINGS = undefined;
  const p = panelWith(Object.assign({}, hass, { callWS: ws }));
  let sw = p._casoraSettingSwitch(f);
  assert.equal(sw.getAttribute('aria-checked'), 'true', 'not stored: on');
  await flush();
  sw.onclick();
  await flush();
  assert.deepEqual(store.settings, { waste: { sensors: { [idOf('Blaue Tonne')]: 'Papier' }, calendar_popup: false }, scenes: { exclude: ['scene.beispiel'] } },
    'switched off: same value as under Settings, the rest kept');
  assert.deepEqual(p.said.pop(), ['Saved – reload open dashboards to apply', 'ok']);
  assert.equal(D.waste(hass, {}).calendarPopup, false, 'the popup follows (CASORA_SETTINGS)');
  sw = p._casoraSettingSwitch(f);
  assert.equal(sw.getAttribute('aria-checked'), 'false');
  sw.onclick();
  await flush();
  assert.deepEqual(store.settings.waste, { sensors: { [idOf('Blaue Tonne')]: 'Papier' } }, 'switched on: nothing stored');
  assert.equal(D.waste(hass, {}).calendarPopup, true);
  // The Settings page reads again; with unsaved edits there, they take the new value.
  p._cs = { S: normalize({}), at: Date.now() };
  p._csDirty = () => false;
  p._casoraSettingSwitch(f).onclick();
  await flush();
  assert.equal(p._cs.at, 0, 'Settings page reads again');
  p._cs = { S: normalize({ waste: { duty_months: [1], calendar_popup: false } }), at: Date.now() };
  p._csDirty = () => true;
  p._casoraSettingSwitch(f).onclick();
  await flush();
  assert.equal(p._cs.S.waste.calendar_popup, undefined, 'switched on again in the draft');
  assert.deepEqual(p._cs.S.waste.duty_months, [1], 'draft edits kept');
  assert.notEqual(p._cs.at, 0);

  // Off under Settings, inspector drawn before the settings are read: drawn again once they are.
  store.settings = { waste: { calendar_popup: false } };
  window.CASORA_SETTINGS = undefined;
  const p2 = panelWith(Object.assign({}, hass, { callWS: ws }));
  p2._casoraSettingSwitch(f);
  await flush();
  assert.equal(p2.renders, 1, 'redrawn with the stored value');
  assert.equal(p2._casoraSettingSwitch(f).getAttribute('aria-checked'), 'false');

  // Saving fails: message, and the switch is drawn again with the stored value.
  const p3 = panelWith(Object.assign({}, hass, { callWS: (m) => (m.type === 'casora/settings/set' ? Promise.reject(new Error('not allowed')) : ws(m)) }));
  p3._casoraSettingSwitch(f).onclick();
  await flush();
  assert.deepEqual(p3.said.pop(), ['Could not save: not allowed', 'err']);
  assert.ok(p3.renders >= 1);
  assert.deepEqual(store.settings, { waste: { calendar_popup: false } }, 'nothing written');
  console.log('abfall_wcs: studio popup switch ok');
}
console.log('abfall_wcs: ok');
