// The Studio preview clock follows the Dashboard's casora_time rule for the time text. A time sensor with a
// usable value shows its own time (whatever the profile says); Automatic with no usable sensor.time shows the
// device clock in the profile's zone; a chosen sensor that is gone shows nothing. Both rules run on the same
// inputs here: the real template from button_card_templates.json, and the real preview through _roomMap.
//   node dev/unit/studio_clock_sensor.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_roomMap,studioTimeText,studioClockLine,_liveRelevant dashboards/casora/button_card_templates.json#casora_time custom_components/casora/scripts/casora-core.js#casoraClockText,casoraClockHtml
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

// The browser stands in New York; the profile "server" means Europe/Amsterdam. Set before any Date is made.
process.env.TZ = 'America/New_York';
const RealDate = Date;
let instant = new RealDate('2026-01-15T05:05:00Z');   // 06:05 in Amsterdam, 00:05 in New York
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [instant.getTime()])); }
  static now() { return instant.getTime(); }
};
assert.equal(new Date().getTimezoneOffset(), 300);

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

// The Dashboard side: the real casora_time template, evaluated with the core clock helpers it calls.
const core = read('custom_components/casora/scripts/casora-core.js');
const ca = core.indexOf('    window.casoraClockText = function');
const cb = core.indexOf("    if (!customElements.get('casora-clock'))", ca);
assert.ok(ca > 0 && cb > ca, 'clock helpers in casora-core.js');
const dashWin = {};
const dashRoot = { hass: null };
const dashDocument = { querySelector: () => dashRoot };
new Function('window', 'document', core.slice(ca, cb))(dashWin, dashDocument);
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_time;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tplText = (states, variables) => new Function('window', 'states', 'hass', 'variables', js(tpl.name))(dashWin, states, {}, variables);
// The text the Dashboard shows: the device clock comes as a casora-clock element, whose text is the time.
const dashboardText = (hass, states, variables) => {
  dashRoot.hass = hass;
  const out = tplText(states, variables);
  const m = out.match(/^<casora-clock[^>]*>([^<]*)<\/casora-clock>$/);
  return m ? m[1] : out;
};

// The Studio side: the real preview, drawn through _roomMap (as studio_clock_preview.mjs does).
const { P, I } = await loadPanel();
class Element {
  constructor() {
    this.style = { setProperty() {} };
    this.dataset = {};
    this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.nodes = new Map();
    this.textContent = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  insertBefore(child) { return this.appendChild(child); }
  querySelector(sel) {
    if (!this.nodes.has(sel)) this.nodes.set(sel, new Element());
    return this.nodes.get(sel);
  }
  querySelectorAll() { return []; }
  addEventListener() {}
  setAttribute() {}
  toggleAttribute() {}
  remove() {}
  closest() { return null; }
}
document.createElement = () => new Element();
document.querySelector = () => null;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.dispatchEvent = () => {};
globalThis.CustomEvent = class {};

const room = { path: 'home', name: 'Home', tiles: [], variables: {} };
const hassFor = (zone, states) => ({ states, locale: { language: 'nl', time_zone: zone }, config: { time_zone: 'Europe/Amsterdam' } });
const panel = Object.assign(Object.create(P), {
  _state: { compact: { rooms: [room] } }, _room: 0, _miniSize: 'desktop',
  _hass: hassFor('local', {}),
  classList: { contains: () => false }, shadowRoot: { querySelector: () => null },
  _closeSceneMenu() {}, _sizeAllowed: x => x, _scenesOn: () => false,
  _roomShown: () => 'Home', _miniModel: () => [], _badgeOrder: () => [],
  _wireRowScroll() {}, _paintBadge: () => new Element(), _applyMiniSort() {},
  _smartSortOn: () => false, _gOn: () => {},
});
const previewText = (hass, variables) => {
  panel._hass = hass;
  room.variables = variables;
  return panel._roomMap().children[0].children[0].querySelector('.mini-time').textContent;
};

// 05:05 UTC: 06:05 Amsterdam, 00:05 New York. 23:30 UTC: the server zone is past midnight, New York is not.
// 11:00 UTC: noon in Amsterdam, the 12-hour boundary.
const INSTANTS = ['2026-01-15T05:05:00Z', '2026-01-15T23:30:00Z', '2026-01-15T11:00:00Z'];
const KITCHEN = 'sensor.kitchen_clock';

// Each case: the states of the house, the Studio settings (the draft variables), and what it must show.
const CASES = [
  { name: 'Automatic, sensor.time with a value, 24-hour', states: { 'sensor.time': { state: '08:13' } },
    vars: { use_12h: false }, expect: '08:13' },
  { name: 'Automatic, sensor.time with date and 12-hour, suffix', states: { 'sensor.time': { state: 'Mon, 20:05' } },
    vars: { use_12h: true, time_suffix: 'Uhr' }, expect: '8:05 PM UHR' },
  { name: 'time sensor sensor.time chosen by hand, with a value', states: { 'sensor.time': { state: '08:13' } },
    vars: { time_entity: 'sensor.time', use_12h: false }, expect: '08:13' },
  { name: 'Studio-chosen sensor with a value', states: { [KITCHEN]: { state: '09:30' } },
    vars: { time_entity: KITCHEN, use_12h: false }, expect: '09:30' },
  { name: 'Studio-chosen sensor with a value, 12-hour, suffix', states: { [KITCHEN]: { state: '21:45' } },
    vars: { time_entity: KITCHEN, use_12h: true, time_suffix: 'home' }, expect: '9:45 PM HOME' },
  { name: 'Automatic, no sensor.time in the house: device clock', states: {},
    vars: { use_12h: false }, expect: 'DEVICE' },
  { name: 'Automatic, sensor.time unavailable: device clock', states: { 'sensor.time': { state: 'unavailable' } },
    vars: { use_12h: true }, expect: 'DEVICE' },
  { name: 'Automatic, sensor.time unknown: device clock', states: { 'sensor.time': { state: 'unknown' } },
    vars: { use_12h: false }, expect: 'DEVICE' },
  { name: 'Automatic, sensor.time empty: device clock', states: { 'sensor.time': { state: '' } },
    vars: { use_12h: false }, expect: 'DEVICE' },
  { name: 'Studio-chosen sensor that is gone: empty', states: {},
    vars: { time_entity: KITCHEN, use_12h: false }, expect: '' },
  { name: 'Studio-chosen sensor unavailable: its state text, as the Dashboard shows', states: { [KITCHEN]: { state: 'unavailable' } },
    vars: { time_entity: KITCHEN, use_12h: false }, expect: 'UNAVAILABLE' },
  { name: 'sensor.time chosen by hand, unavailable: device clock, as the Dashboard', states: { 'sensor.time': { state: 'unavailable' } },
    vars: { time_entity: 'sensor.time', use_12h: false }, expect: 'DEVICE' },
  { name: 'Studio-chosen sensor with 00:05, 12-hour: 12:05 AM', states: { [KITCHEN]: { state: '00:05' } },
    vars: { time_entity: KITCHEN, use_12h: true }, expect: '12:05 AM' },
  // use_12h never stored (undefined): the template reads only use_12h === true, so it shows 24-hour. The preview
  // takes the profile's setting instead. This 24-hour profile ('nl') makes both agree; the 12-hour profile below
  // shows where they part.
  { name: 'Automatic, sensor.time with a value, use_12h not stored: 24-hour', states: { 'sensor.time': { state: '08:13' } },
    vars: {}, expect: '08:13' },
];

for (const c of CASES) {
  for (const zone of ['local', 'server']) {
    for (const at of INSTANTS) {
      instant = new RealDate(at);
      const hass = hassFor(zone, c.states);
      const label = c.name + ' | profile ' + zone + ' | ' + at;
      const dash = dashboardText(hass, c.states, c.vars);
      const want = c.expect === 'DEVICE' ? I.studioClockLine(hass, c.vars.use_12h === true, '', instant) : c.expect;
      if (c.expect === 'DEVICE') {
        assert.match(dash, /^\d{1,2}:\d\d( [AP]M)?$/, 'Dashboard shows the device clock: ' + label);
      } else {
        assert.equal(dash, c.expect, 'Dashboard text: ' + label);
      }
      assert.equal(previewText(hass, c.vars), dash, 'Studio preview equals the Dashboard: ' + label);
      assert.equal(previewText(hass, c.vars), want, 'Studio preview text: ' + label);
    }
  }
}

// The reported case, spelled out: a time sensor with a value, profile "local", browser zone New York.
instant = new RealDate('2026-01-15T05:05:00Z');
assert.equal(previewText(hassFor('local', { 'sensor.time': { state: '08:13' } }), { use_12h: false }), '08:13',
  'the sensor time, not the device clock (00:05 in New York)');

// Known gap, asserted as it is today (not changed here): use_12h never stored. The template shows 24-hour; the
// preview follows the profile (clock12: time_format "12" means 12-hour). Here the Dashboard and the preview differ.
instant = new RealDate('2026-01-15T05:05:00Z');
const hass12 = { states: { 'sensor.time': { state: '08:13' } }, locale: { language: 'nl', time_zone: 'local', time_format: '12' }, config: { time_zone: 'Europe/Amsterdam' } };
assert.equal(dashboardText(hass12, hass12.states, {}), '08:13', 'use_12h not stored: the Dashboard shows 24-hour');
assert.equal(previewText(hass12, {}), '8:13 AM', 'use_12h not stored, profile 12-hour: the preview follows the profile');

// The hass path: sensor.time coming back must redraw the preview at once. _liveRelevant skips sensors the room
// does not name, and the default sensor.time is named nowhere, so the time stayed on the device clock until the
// next change after 30 s. A change to sensor.time counts like one the dashboard names.
{
  const live = Object.assign(Object.create(P), { _state: { compact: { rooms: [{ path: 'home', name: 'Home', tiles: [], variables: {} }] } } });
  const house = { 'light.a': { state: 'on' } };
  live._liveRelevant({ states: house });
  live._liveAt = Date.now();   // a redraw has just happened
  assert.equal(live._liveRelevant({ states: { ...house, 'sensor.time': { state: '08:13' } } }), true,
    'sensor.time comes back: the preview redraws now, not after 30 s');
  live._liveAt = Date.now();
  assert.equal(live._liveRelevant({ states: { ...house, 'sensor.time': { state: '08:14' } } }), true,
    'sensor.time ticks: the preview follows');
  live._liveAt = Date.now();
  const tick = { state: '08:14' };
  live._liveRelevant({ states: { ...house, 'sensor.time': tick } });
  live._liveAt = Date.now();
  assert.equal(live._liveRelevant({ states: { ...house, 'sensor.time': tick, 'sensor.power': { state: '5' } } }), false,
    'an unrelated sensor still waits');
}
{
  const chosen = Object.assign(Object.create(P), { _state: { compact: { rooms: [{ path: 'home', name: 'Home', tiles: [], variables: { time_entity: 'sensor.wall_clock' } }] } } });
  const house = { 'light.a': { state: 'on' } };
  chosen._liveRelevant({ states: house });
  chosen._liveAt = Date.now();
  assert.equal(chosen._liveRelevant({ states: { ...house, 'sensor.wall_clock': { state: '08:13' } } }), true,
    'a time sensor chosen in Studio redraws the preview too');
}

console.log('studio_clock_sensor: ok');
