// #214: the Studio preview clock must read exactly like the dashboard clock. The dashboard rule stays in
// casora-core.js; the panel carries a small local copy (studioClockText/studioClockDate/studioClockLine).
// This runs both rules on the same inputs and fails when they drift apart.
//   node dev/unit/studio_clock_parity.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraClockText,casoraClockDate custom_components/casora/panel/casora-panel.js#studioClockText,studioClockDate,studioClockLine
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

// The browser stands in New York while the profile says "server" (Europe/Amsterdam): only the profile's
// zone may show. Set before any Date is made.
process.env.TZ = 'America/New_York';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

// The dashboard rule, sliced out of core exactly like uhr_ohne_zeit_datum.mjs does.
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('    window.casoraClockText = function');
const b = core.indexOf("    if (!customElements.get('casora-clock'))", a);
assert.ok(a > 0 && b > a, 'clock helpers in casora-core.js');
const coreWin = { casoraLocale: () => 'nl' };
new Function('window', 'document', core.slice(a, b))(coreWin, { querySelector: () => null });

// The Studio copy, from the real panel.
const { I } = await loadPanel();
for (const fn of ['studioClockText', 'studioClockDate', 'studioClockLine']) {
  assert.equal(typeof I[fn], 'function', fn + ' in the panel internals');
}

// The two zones really differ at the test instants (winter: New York UTC-5, Amsterdam UTC+1).
const off = new Date('2026-01-15T05:05:00Z').getTimezoneOffset();
assert.equal(off, 300, 'the browser zone is America/New_York');
assert.notEqual(off, -60, 'and not the server zone Europe/Amsterdam');

// 05:05 UTC: after midnight in both zones (06:05 Amsterdam, 00:05 New York, both 15.1.).
// 00:05 UTC: before midnight in New York (19:05 on 14.1.), already 15.1. in Amsterdam.
const AFTER = new Date('2026-01-15T05:05:00Z');
const BEFORE = new Date('2026-01-15T00:05:00Z');
const server = { locale: { time_zone: 'server' }, config: { time_zone: 'Europe/Amsterdam' } };
const local = { locale: { time_zone: 'local' }, config: { time_zone: 'Europe/Amsterdam' } };

// Anchors: the Studio copy alone must be right, not merely equal to core.
assert.equal(I.studioClockText(server, false, AFTER), '06:05', 'server, 24-hour: leading zero, Amsterdam');
assert.equal(I.studioClockText(server, true, AFTER), '6:05 AM', 'server, 12-hour');
assert.equal(I.studioClockText(local, false, AFTER), '00:05', 'local, 24-hour: midnight with leading zero');
assert.equal(I.studioClockText(local, true, AFTER), '12:05 AM', 'local, 12-hour: midnight is 12 AM');

// Time text, both rules on the same inputs.
for (const hass of [server, local, null]) {
  for (const use12 of [false, true]) {
    for (const at of [AFTER, BEFORE]) {
      const want = coreWin.casoraClockText(hass, use12, at);
      const got = I.studioClockText(hass, use12, at);
      assert.equal(got, want, 'time text, hass=' + JSON.stringify(hass && hass.locale) + ' use12=' + use12 + ' at=' + at.toISOString());
    }
  }
}

// The whole line with a suffix, like the dashboard's casora-clock element builds it.
const elementLine = (hass, use12, sx, at) => {
  const t = coreWin.casoraClockText(hass, use12, at);
  return (sx ? t + ' ' + sx : t).toUpperCase();
};
assert.equal(I.studioClockLine(server, true, 'home', AFTER), '6:05 AM HOME', 'anchor: suffix uppercased after the time');
for (const hass of [server, local]) {
  for (const use12 of [false, true]) {
    for (const sx of ['home', '']) {
      for (const at of [AFTER, BEFORE]) {
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
    for (const at of [AFTER, BEFORE]) {
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
delete coreWin.casoraLocale;
delete window.casoraLocale;
assert.equal(I.studioClockDate(server, AFTER), coreWin.casoraClockDate(server, AFTER), 'date without the language file');
assert.equal(I.studioClockDate(server, AFTER), 'Donnerstag, 15. Januar', 'anchor: the fallback is German');
window.casoraLocale = () => 'nl';

console.log('studio_clock_parity: ok');
