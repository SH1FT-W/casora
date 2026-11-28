// #214: the Studio preview clock must read exactly like the dashboard clock. The dashboard rule stays in
// casora-core.js; the panel carries a small local copy (studioClockText/studioClockDate/studioClockLine).
// The panel's three clock names, one line each:
//   studioClockText: the time text only (24-hour or 12-hour), in the profile's zone.
//   studioClockLine: studioClockText plus the suffix, uppercased.
//   studioTimeText: the tile's time line, which also reads a time sensor; tested in studio_clock_sensor.mjs.
// This runs both rules on the same inputs and fails when they drift apart.
//   node dev/unit/studio_clock_parity.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraClockText,casoraClockDate,casora-clock custom_components/casora/panel/casora-panel.js#studioClockText,studioClockDate,studioClockLine
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

// The browser stands in New York while the profile says "server" (Europe/Amsterdam): only the profile's
// zone may show. Set before any Date is made.
process.env.TZ = 'America/New_York';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

// The dashboard rule, sliced out of core exactly like uhr_ohne_zeit_datum.mjs does: the two helpers, and
// the casora-clock element that turns them into the line (suffix after the time, uppercase).
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('    window.casoraClockText = function');
const b = core.indexOf('    /* alt: the tile\'s own short form', a);
assert.ok(a > 0 && b > a, 'clock helpers and the casora-clock element in casora-core.js');
const coreWin = { casoraLocale: () => 'nl' };
const root = { hass: null };
let ClockElement = null;
const customElements = { get: () => null, define: (name, def) => { if (name === 'casora-clock') ClockElement = def; } };
class FakeElement { constructor() { this.dataset = {}; this.textContent = ''; } }
new Function('window', 'document', 'customElements', 'HTMLElement', 'setTimeout', 'clearTimeout', core.slice(a, b))(
  coreWin, { querySelector: (sel) => (sel === 'home-assistant' ? root : null) }, customElements, FakeElement, () => 0, () => {});
assert.equal(typeof coreWin.casoraClockText, 'function', 'casoraClockText in casora-core.js');
assert.equal(typeof coreWin.casoraClockDate, 'function', 'casoraClockDate in casora-core.js');
assert.equal(typeof ClockElement, 'function', 'the casora-clock element in casora-core.js');

// The Studio copy, from the real panel.
const { I } = await loadPanel();
for (const fn of ['studioClockText', 'studioClockDate', 'studioClockLine']) {
  assert.equal(typeof I[fn], 'function', fn + ' in the panel internals');
}

// The two zones really differ at the test instants (winter: New York UTC-5, Amsterdam UTC+1).
const off = new Date('2026-01-15T05:05:00Z').getTimezoneOffset();
assert.equal(off, 300, 'the browser zone is America/New_York');
assert.notEqual(off, -60, 'and not the server zone Europe/Amsterdam');

// 05:05 UTC: 06:05 Amsterdam, 00:05 New York (both 15.1.). 00:05 UTC: 19:05 on 14.1. in New York,
// already 15.1. in Amsterdam. 11:00 UTC: noon in Amsterdam (the AM/PM boundary). 23:30 UTC: 00:30 on
// 16.1. in Amsterdam while New York is still on 15.1. (the profile zone crosses midnight).
const AFTER = new Date('2026-01-15T05:05:00Z');
const BEFORE = new Date('2026-01-15T00:05:00Z');
const NOON = new Date('2026-01-15T11:00:00Z');
const SERVER_MIDNIGHT = new Date('2026-01-15T23:30:00Z');
const INSTANTS = [AFTER, BEFORE, NOON, SERVER_MIDNIGHT];
const server = { locale: { time_zone: 'server' }, config: { time_zone: 'Europe/Amsterdam' } };
const local = { locale: { time_zone: 'local' }, config: { time_zone: 'Europe/Amsterdam' } };

// The casora-clock element reads the clock through new Date(); pin that for the comparison.
const RealDate = Date;
const withInstant = (at, fn) => {
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [at.getTime()])); }
    static now() { return at.getTime(); }
  };
  try { return fn(); } finally { globalThis.Date = RealDate; }
};

// Anchors: the Studio copy alone must be right, not merely equal to core.
assert.equal(I.studioClockText(server, false, AFTER), '06:05', 'server, 24-hour: leading zero, Amsterdam');
assert.equal(I.studioClockText(server, true, AFTER), '6:05 AM', 'server, 12-hour');
assert.equal(I.studioClockText(local, false, AFTER), '00:05', 'local, 24-hour: midnight with leading zero');
assert.equal(I.studioClockText(local, true, AFTER), '12:05 AM', 'local, 12-hour: midnight is 12 AM');
assert.equal(I.studioClockText(server, false, NOON), '12:00', 'server, 24-hour: noon');
assert.equal(I.studioClockText(server, true, NOON), '12:00 PM', 'server, 12-hour: noon is 12 PM');
assert.equal(I.studioClockText(server, false, SERVER_MIDNIGHT), '00:30', 'server, 24-hour: midnight after the day changed');
assert.equal(I.studioClockText(server, true, SERVER_MIDNIGHT), '12:30 AM', 'server, 12-hour: midnight is 12 AM');
assert.equal(I.studioClockText(local, true, SERVER_MIDNIGHT), '6:30 PM', 'local, 12-hour: New York in the evening');

// Time text, both rules on the same inputs.
for (const hass of [server, local, null]) {
  for (const use12 of [false, true]) {
    for (const at of INSTANTS) {
      const want = coreWin.casoraClockText(hass, use12, at);
      const got = I.studioClockText(hass, use12, at);
      assert.equal(got, want, 'time text, hass=' + JSON.stringify(hass && hass.locale) + ' use12=' + use12 + ' at=' + at.toISOString());
    }
  }
}

// The whole line with a suffix: the dashboard's own element builds it, so a change in the suffix or
// uppercase rule in core (not a copy of it in this test) turns the comparison red.
const elementLine = (hass, use12, sx, at) => {
  root.hass = hass;
  const el = new ClockElement();
  el.dataset.h12 = use12 ? '1' : '';
  el.dataset.suffix = sx;
  withInstant(at, () => el._tick());
  return el.textContent;
};
assert.equal(I.studioClockLine(server, true, 'home', AFTER), '6:05 AM HOME', 'anchor: suffix uppercased after the time');
assert.equal(elementLine(server, true, 'home', AFTER), '6:05 AM HOME', 'anchor: the dashboard element uppercases the suffix');
for (const hass of [server, local]) {
  for (const use12 of [false, true]) {
    for (const sx of ['home', '', 'uur']) {
      for (const at of INSTANTS) {
        assert.equal(I.studioClockLine(hass, use12, sx, at), elementLine(hass, use12, sx, at),
          'line, hass=' + hass.locale.time_zone + ' use12=' + use12 + ' suffix="' + sx + '" at=' + at.toISOString());
      }
    }
  }
}

// The date in all nine dashboard languages, plus the fallback while no language file is loaded.
const LANGS = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb'];
for (const l of LANGS) {
  coreWin.casoraLocale = () => l;
  window.casoraLocale = () => l;
  for (const hass of [server, local]) {
    for (const at of INSTANTS) {
      assert.equal(I.studioClockDate(hass, at), coreWin.casoraClockDate(hass, at),
        'date, ' + l + ' ' + hass.locale.time_zone + ' at=' + at.toISOString());
    }
  }
}
coreWin.casoraLocale = () => 'nl';
window.casoraLocale = () => 'nl';
assert.equal(I.studioClockDate(server, AFTER), 'donderdag 15 januari', 'anchor: Dutch, Amsterdam');
assert.equal(I.studioClockDate(server, BEFORE), 'donderdag 15 januari', 'anchor: server stays on 15 January');
assert.equal(I.studioClockDate(local, BEFORE), 'woensdag 14 januari', 'anchor: New York is still on 14 January');
assert.equal(I.studioClockDate(server, SERVER_MIDNIGHT), 'vrijdag 16 januari', 'anchor: the server zone crossed midnight');
assert.equal(I.studioClockDate(local, SERVER_MIDNIGHT), 'donderdag 15 januari', 'anchor: New York stays on 15 January');
delete coreWin.casoraLocale;
delete window.casoraLocale;
assert.equal(I.studioClockDate(server, AFTER), coreWin.casoraClockDate(server, AFTER), 'date without the language file');
assert.equal(I.studioClockDate(server, AFTER), 'Donnerstag, 15. Januar', 'anchor: the fallback is German');
window.casoraLocale = () => 'nl';

console.log('studio_clock_parity: ok');
