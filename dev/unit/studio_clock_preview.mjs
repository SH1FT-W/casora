// #214: the Studio preview clock drawn through _roomMap: the profile's time zone ("server" = Europe/Amsterdam
// while the browser stands in New York), a leading zero in the 24-hour form, the dashboard's 12-hour form, the
// dashboard language for the date (all nine), the suffix uppercased like the dashboard. The time is drawn at
// once from the local copy; the date waits for the dashboard's language file – one import, one redraw when it
// arrives, none and no error when it fails.
//   node dev/unit/studio_clock_preview.mjs
// @deckt: custom_components/casora/panel/casora-panel.js#_roomMap,studioClockText,studioClockDate,studioClockLine
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPanel } from './lib/testhaus.mjs';

process.env.TZ = 'America/New_York';
const RealDate = Date;
let instant = '2026-01-15T05:05:00Z';   // 06:05 in Amsterdam, 00:05 in New York
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [instant])); }
  static now() { return new RealDate(instant).getTime(); }
};
assert.equal(new Date().getTimezoneOffset(), 300);
assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', hourCycle: 'h23' }).format(new Date()), '06');

const { P } = await loadPanel();
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
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const room = { path: 'home', name: 'Home', tiles: [], variables: { show_date: true, use_12h: false } };
const panel = Object.assign(Object.create(P), {
  _state: { compact: { rooms: [room] } }, _room: 0, _miniSize: 'desktop',
  _hass: { states: {}, locale: { language: 'nl', time_zone: 'server' }, config: { time_zone: 'Europe/Amsterdam' } },
  classList: { contains: () => false }, shadowRoot: { querySelector: () => null },
  _closeSceneMenu() {}, _sizeAllowed: x => x, _scenesOn: () => false,
  _roomShown: () => 'Home', _miniModel: () => [], _badgeOrder: () => [],
  _wireRowScroll() {}, _paintBadge: () => new Element(), _applyMiniSort() {},
  _smartSortOn: () => false, _gOn: () => {},
});
const draw = () => panel._roomMap().children[0].children[0].querySelector('.mini-time');
globalThis.dispatchEvent = () => {};
globalThis.CustomEvent = class {};

// The dashboard's language file, as a dashboard would have it (casoraLocale reads home-assistant's hass).
// Only this one loads: the clock rule itself is the Studio's local copy and needs no script.
document.querySelector = (selector) => selector === 'home-assistant' ? { hass: panel._hass } : null;
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-i18n.js', import.meta.url), 'utf8'))();
assert.equal(typeof window.casoraLocale, 'function', 'the language file is there');

// Server zone (Amsterdam): 06:05 with a leading zero, the date in Dutch underneath.
const time = draw();
assert.equal(time.textContent, '06:05');
assert.equal(time.children[0].textContent, 'donderdag 15 januari');
// The date follows the dashboard's language, all nine of them.
const dates = {
  de: 'Donnerstag, 15. Januar', en: 'Thursday, January 15', es: 'jueves, 15 de enero',
  fr: 'jeudi 15 janvier', it: 'giovedì 15 gennaio', nl: 'donderdag 15 januari',
  pl: 'czwartek, 15 stycznia', pt: 'quinta-feira, 15 de janeiro', nb: 'torsdag 15. januar',
};
for (const [language, expected] of Object.entries(dates)) {
  panel._hass.locale.language = language;
  assert.equal(draw().children[0].textContent, expected, language);
}
panel._hass.locale.language = 'nl';
// 12-hour form and a suffix, uppercased together like the dashboard's clock element.
room.variables.use_12h = true;
assert.equal(draw().textContent, '6:05 AM');
room.variables.time_suffix = 'home';
assert.equal(draw().textContent, '6:05 AM HOME');
// Profile "local": the browser's zone (New York), same formats, date of that zone.
panel._hass.locale.time_zone = 'local';
room.variables.use_12h = false;
room.variables.time_suffix = '';
assert.equal(draw().textContent, '00:05');
assert.equal(draw().children[0].textContent, 'donderdag 15 januari');
room.variables.use_12h = true;
assert.equal(draw().textContent, '12:05 AM');
// Five hours earlier: still 15 January in Amsterdam, already evening of the 14th in New York.
room.variables.time_suffix = 'home';
instant = '2026-01-15T00:05:00Z';
assert.equal(draw().textContent, '7:05 PM HOME');
assert.equal(draw().children[0].textContent, 'woensdag 14 januari');
panel._hass.locale.time_zone = 'server';
assert.equal(draw().textContent, '1:05 AM HOME');
assert.equal(draw().children[0].textContent, 'donderdag 15 januari');
instant = '2026-01-15T05:05:00Z';
panel._hass.locale.time_zone = 'local';

// No language file yet: the time shows at once, the date waits for one import and one redraw.
const locale = window.casoraLocale;
delete window.casoraLocale;
const pending = new Map();
window.casoraImportScript = (path) => new Promise((resolve, reject) => pending.set(path, { resolve, reject }));
let redraws = 0;
panel._rebuildPreview = () => { redraws++; };
panel._previewLocaleLoad = null;
const waiting = draw();
assert.equal(waiting.textContent, '12:05 AM HOME', 'the time needs no script');
assert.equal(waiting.children.length, 0, 'the date waits for the language');
await Promise.resolve();
assert.ok(pending.has('casora-i18n.js'), 'the language file is imported once');
assert.equal(pending.size, 1, 'and nothing else is');
window.casoraLocale = locale;
pending.get('casora-i18n.js').resolve();
await new Promise(resolve => setImmediate(resolve));
assert.equal(redraws, 1, 'exactly one redraw when the language arrives');
const arrived = draw();
assert.equal(arrived.textContent, '12:05 AM HOME');
assert.equal(arrived.children[0].textContent, 'donderdag 15 januari', 'the date appears after the redraw');

// A failed load: silent, no retry loop, the time stays and the date stays away.
delete window.casoraLocale;
panel._previewLocaleLoad = null;
pending.clear();
const failed = draw();
assert.equal(failed.textContent, '12:05 AM HOME', 'the time still shows');
assert.equal(failed.children.length, 0, 'the date stays absent');
await Promise.resolve();
pending.get('casora-i18n.js').reject(new Error('offline'));
await new Promise(resolve => setImmediate(resolve));
const after = draw();
assert.equal(after.textContent, '12:05 AM HOME', 'no error, no fallback to another clock');
assert.equal(after.children.length, 0);
assert.equal(redraws, 1, 'no redraw on failure');
// And a later draw does not start a second import.
pending.clear();
draw();
await new Promise(resolve => setImmediate(resolve));
assert.equal(pending.size, 0, 'no retry');
assert.equal(redraws, 1);

console.log('studio_clock_preview: ok');
