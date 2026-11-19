// #223: the Studio preview clock follows the Dashboard's casora_time rule for the time text. A time sensor with a
// usable value shows its own time (whatever the profile says); Automatic with no usable sensor.time shows the
// device clock in the profile's zone; a chosen sensor that is gone shows nothing. Both rules run on the same
// inputs here: the real template from button_card_templates.json, and the real preview through _roomMap.
//   node dev/unit/studio_clock_sensor.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_roomMap,studioTimeText,studioClockLine dashboards/casora/button_card_templates.json#casora_time custom_components/casora/scripts/casora-core.js#casoraClockText,casoraClockHtml
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

// The helper itself, on the same cases: the Studio-chosen sensor is read the same way as the template.
const hassLocal = hassFor('local', { [KITCHEN]: { state: '09:30' } });
assert.equal(I.studioTimeText(hassLocal, { time_entity: KITCHEN, use_12h: false }, false, instant), '09:30', 'helper: sensor text');
assert.equal(I.studioTimeText(hassFor('local', {}), { use_12h: false }, false, instant), '00:05', 'helper: device clock, profile zone');
assert.equal(I.studioTimeText(hassFor('local', {}), { time_entity: KITCHEN }, false, instant), '', 'helper: chosen sensor gone');

console.log('studio_clock_sensor: ok');
