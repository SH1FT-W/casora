// @deckt: custom_components/casora/scripts/local/46-screensaver.js#CSS,kalender
// The calendar screensaver dims the last month's days like the next month's (Prüfrunde u03-09): they are past too,
// and „past“ came later in the style sheet, so October's 26th looked like a November day beside today, the 26th.
//   node dev/unit/screensaver_kalender_vormonat.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const win = { matchMedia: () => ({ matches: false }) };
const box = { window: win, console, Intl, Date, Math, parseFloat, isFinite, isNaN, parseInt, String, Number, JSON, Object, Array, Promise,
  setInterval: () => 0, clearInterval() {}, location: { search: '', pathname: '/' } };
vm.createContext(box);
const src = read('custom_components/casora/scripts/local/46-screensaver.js');
vm.runInContext(src, box);
const S = win._casoraSaver;
const now = new Date(2026, 10, 26, 9, 0);
const html = S.html('kalender', S.context({ hass: { states: {} }, now, vars: {}, sun: null, rooms: [], cals: [], events: [] }));
assert.match(html, /class="cs-kd cs-kout cs-kpast"/, 'a day of October is out of the month and past');
// Of two rules with the same weight the later one wins: the „out of the month“ colour has to come after „past“.
const css = src.slice(src.indexOf("var CSS = '"));
const out = css.indexOf('.cs-kd.cs-kout > b{'), past = css.indexOf('.cs-kd.cs-kpast > b{');
assert.ok(out > -1 && past > -1, 'both rules exist');
assert.ok(out > past, 'the dimmed colour of another month wins over the past colour');
console.log('screensaver_kalender_vormonat: ok');
