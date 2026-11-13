// Studio "12-hour clock" (use_12h): with no saved choice the toggle shows what the dashboard clock uses –
// the HA user's time format, then the HA user's language – not the browser's language (#41).
//   node dev/unit/studio_clock_default.mjs
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

// An English browser: the old load-time default would say "12-hour".
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US' }, configurable: true });
const { P, I } = await loadPanel();
const field = I.SECTIONS.flatMap((s) => s.fields || []).find((f) => f.key === 'use_12h');
assert.ok(field, 'use_12h field in the Studio sections');

const nl = (time_format) => ({ locale: { language: 'nl', time_format }, language: 'nl' });
const en = (time_format) => ({ locale: { language: 'en', time_format }, language: 'en' });

// Seam 1: the default the toggle takes, given the HA user.
assert.equal(I.fieldDefault(field, nl('24')), false, 'HA user 24-hour, English browser: off');
assert.equal(I.fieldDefault(field, nl('12')), true, 'HA user 12-hour: on');
assert.equal(I.fieldDefault(field, nl('language')), false, 'profile "language": Dutch user, off');
assert.equal(I.fieldDefault(field, nl('system')), false, 'profile "system": still the HA user language, off');
assert.equal(I.fieldDefault(field, en('language')), true, 'English HA user, no format: on');
assert.equal(I.fieldDefault({ boolDefault: true }, nl('24')), true, 'a plain boolDefault stays as it is');

// Seam 2: the switch built from that default; a saved choice wins.
const sw = (cur, hass) => P._boolSwitch(cur, I.fieldDefault(field, hass), () => {}, 'x').getAttribute('aria-checked');
const el = { style: {}, dataset: {}, children: [], appendChild: (c) => c, addEventListener() {}, classList: { add() {}, contains: () => false } };
let attrs;
globalThis.document = { createElement: () => { attrs = {}; return Object.assign({}, el, { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] }); } };
assert.equal(sw(undefined, nl('24')), 'false', 'nothing saved, HA user 24-hour: toggle off');
assert.equal(sw(undefined, nl('12')), 'true', 'nothing saved, HA user 12-hour: toggle on');
assert.equal(sw(true, nl('24')), 'true', 'saved on wins');
assert.equal(sw(false, nl('12')), 'false', 'saved off wins');
console.log('studio_clock_default: ok');
