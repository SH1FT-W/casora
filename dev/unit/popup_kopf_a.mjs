// Popup-Kopfzeile A (Casora 1.3 „Feinschliff“): Kopf in einer Zeile – Symbol-Kachel links, Raum klein
// darüber, Titel + Statuszeile, Hauptschalter + X rechts; Schalter in Gerätefarbe; Symbolfarbe nach
// Kontrast (DP-17); Satz-Überschriften; Tokens im Theme.
//   node dev/unit/popup_kopf_a.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const theme = rd('custom_components/casora/theme_weich.yaml');

// ── Hilfsfunktionen aus dem Kern (Quelltext ausschneiden) ──
const fn = (name) => {
  const a = core.indexOf('  function ' + name + '(');
  assert.ok(a > 0, name + ' fehlt');
  const b = core.indexOf('\n  }\n', a);
  return core.slice(a, b + 4);
};
const vars = { '--casora-color-yellow': '#E8B04A', '--casora-color-orange': '#DE8A4E', '--casora-color-green': '#6AAE78',
  '--casora-color-teal': '#4E9E95', '--casora-color-red': '#D35A4E', '--casora-color-blue': '#5B8FC9' };
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: (k) => vars[k] || '' });
const lib = new Function(fn('rgbaOf') + fn('resolveRgb') + fn('lumOf') + 'var INK_CACHE = {};' + fn('inkOn') + fn('stripRoom')
  + ' return { inkOn: inkOn, stripRoom: stripRoom };')();

// DP-17: Weiß nur mit mindestens 3 : 1, sonst dunkle Tinte.
const dark = (c) => /on-accent-ink/.test(lib.inkOn(c));
assert.ok(dark('var(--casora-color-yellow, #E8B04A)'), 'Gelb → dunkle Tinte');
assert.ok(dark('var(--casora-color-orange, #DE8A4E)'), 'Orange → dunkle Tinte');
assert.ok(dark('var(--casora-color-green, #6AAE78)'), 'Grün → dunkle Tinte');
assert.ok(dark('rgb(232,176,74)'), 'Gerätefarbe aus der Kachel (rgb) → dunkle Tinte');
assert.ok(!dark('var(--casora-color-red, #D35A4E)'), 'Rot bleibt weiß');
assert.ok(!dark('var(--casora-color-teal, #4E9E95)'), 'Petrol bleibt weiß');
assert.ok(!dark('var(--casora-color-blue, #5B8FC9)'), 'Blau bleibt weiß');

// Raum steht als Etikett über dem Titel – nicht noch einmal im Titel.
assert.equal(lib.stripRoom('Licht Badezimmer', 'Badezimmer'), 'Licht');
assert.equal(lib.stripRoom('Badezimmer', 'Badezimmer'), 'Badezimmer', 'nie leer');
assert.equal(lib.stripRoom('Thermostat', 'Flur'), 'Thermostat');
assert.equal(lib.stripRoom('Spots Küche Insel', 'Küche'), 'Spots Insel');

// ── Kopf-Aufbau im Kern ──
for (const cls of ['header-ring', 'header-eyebrow', 'header-title', 'header-status hui-line', 'header-switch'])
  assert.ok(core.includes('class="' + cls + '"'), 'Kopf-Element ' + cls);
assert.ok(/:host\(\[soft\]\) \.header-bar \{[^}]*display: grid;/.test(core), 'Kopf als Raster in einer Zeile');
assert.ok(/:host\(\[soft\]\) \.header-ring \{[^}]*border-radius: var\(--casora-ic-head-radius, 16px\)/.test(core), 'Symbol als abgerundetes Quadrat');
assert.ok(/--casora-sw-on: var\(--casora-popup-accent,/.test(core), 'Schalter in Gerätefarbe');
assert.ok(/header-switch\[aria-checked="true"\] \{ background: var\(--casora-popup-accent/.test(core), 'Hauptschalter in Gerätefarbe');
assert.ok(/--casora-h15-tt: none;/.test(core) && /--casora-h15-fs: var\(--casora-fs-heading, 17px\)/.test(core), 'Satz-Überschrift 17 in Popups');
assert.ok(core.includes('_casoraHeadSwitchHooks'), 'Haken für Module (Hauptschalter)');
assert.ok(/opacity:var\(--casora-chev-opacity, \.6\)/.test(core), 'DP-30: Pfeil .6');

// ── Tokens im Theme ──
for (const k of ['casora-r-window: 44px', 'casora-r-surface: 32px', 'casora-r-row: 24px', 'casora-r-element: 18px', 'casora-r-small: 12px',
  'casora-r-pill: 999px', 'casora-fs-label: 12px', 'casora-fs-heading: 17px', 'casora-fs-title: 28px', 'casora-fs-page: 34px',
  'casora-ic-head: 56px', 'casora-ic-row: 36px', 'casora-press-scale: .97', 'casora-ease-enter: cubic-bezier(.2,.8,.3,1)',
  'casora-ease-slide: cubic-bezier(.36,0,.16,1)'])
  assert.ok(theme.includes(k), 'Token ' + k);
for (const k of ['casora-shadow-rest', 'casora-shadow-raised', 'casora-shadow-float', 'casora-soft-row-active', 'casora-on-accent-ink'])
  assert.equal((theme.match(new RegExp('\\n\\s+' + k + ':', 'g')) || []).length, 2, k + ' hell und dunkel');

// ── Licht-Popup: Stilblock ohne verwaiste Angaben (ein abgebrochener Rumpf schaltete das Raster ab) ──
const lp = rd('custom_components/casora/scripts/local/03-popups.js');
const z = lp.indexOf('if (window._casoraLightSoft) return;');
const a = lp.indexOf("var CSS = '<style>'", z);
const b = lp.indexOf("+ '</style>';", a) + "+ '</style>'".length;
const css = new Function('return ' + lp.slice(a + 'var CSS = '.length, b))().replace(/^<style>|<\/style>$/g, '');
let depth = 0, sel = '';
for (const ch of css) {
  if (ch === '{') { if (depth === 0) assert.ok(!/;/.test(sel), 'verwaiste Angabe vor „' + sel.slice(-60) + '“'); depth++; sel = ''; }
  else if (ch === '}') { depth--; assert.ok(depth >= 0, 'Klammer zu viel'); sel = ''; }
  else if (depth === 0) sel += ch;
}
assert.equal(depth, 0, 'Klammern ausgeglichen');
assert.ok(!/lps-off/.test(css), '„Alles aus“-Knopf entfernt');
console.log('ok popup_kopf_a');
