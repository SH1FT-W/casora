// Football head (owner 14.11.2026, V13): the form chips S/U/N keep ≥ 4,5 : 1 (bold white on deep tones, 1,75 em),
// „nächster Gegner“ in the table is text-2 at 12 px, and inkOn takes the better ink when neither reaches the target
// (it took the dark one on mid red, where white was better).
//   node dev/unit/fussball_form_contrast.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#inkOn, custom_components/casora/scripts/local/11-fussball.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  function inkOn(');
const inkOn = new Function(core.slice(a, core.indexOf('\n  }\n', a) + 4) + ' return inkOn;')();

const WHITE = 'var(--casora-soft-glyph, #fff)', DARK = 'var(--casora-soft-glyph-dark, rgba(46,34,20,.88))';
const lum = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
  .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  .reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const onWhite = (h) => 1.05 / (lum(h) + 0.05);

// inkOn: neither ink reaches 4,5 on the mid red – white (3,9) beats the dark glyph, so white.
assert.equal(inkOn('var(--casora-color-red, #D35A4E)', 4.5), WHITE, 'mid red at 4,5: the better ink (white), not dark');
// Unchanged: light fills still get the dark glyph, saturated ones white.
assert.equal(inkOn('var(--casora-color-yellow, #E8B04A)', 4.5), DARK, 'yellow: dark');
assert.equal(inkOn('var(--casora-color-green, #6AAE78)', 3), DARK, 'mid green at 3: dark');
assert.equal(inkOn('var(--casora-color-blue, #5B8FC9)', 3), WHITE, 'blue at 3: white');

// Football module with the real inkOn.
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: 'de' } } } : null) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
window._casoraInkOn = inkOn;
new Function(rd('custom_components/casora/scripts/local/11-fussball.js'))();
const K = window._casoraFootball;

for (const r of ['W', 'D', 'L']) {
  const tone = K.formTone[r];
  assert.ok(onWhite(tone) >= 4.5, r + ': white on ' + tone + ' is ' + onWhite(tone).toFixed(2));
  assert.equal(inkOn(tone, 4.5), WHITE, r + ': white letters');
}

window._casoraUI = { line: (w, parts) => '<div class="l">' + w + (parts.length ? ' · ' + parts.join(' · ') : '') + '</div>',
  hero: () => '', tokens: { ink: '#000', ink2: '#333', ink3: '#666', font: 'x' } };
const st = { entity_id: 'sensor.team_a', state: 'PRE', attributes: { state: 'PRE', sport_path: 'soccer', league_path: 'ger.1',
  team_id: '1', team_abbr: 'HEI', opponent_abbr: 'GAS', team_name: 'Heim', opponent_id: '2', opponent_name: 'Gast', date: new Date(Date.now() + 864e5).toISOString() } };
const i = K.info(st);
const row = (id, rank, name) => ({ id, rank, name, gp: 7, gd: 0, pts: 10 });
K.data[K.key(i)] = { ts: Date.now(), table: { name: '', rows: [row('1', 1, 'Heim'), row('2', 2, 'Gast')] },
  form: [{ res: 'W', opp: 'A', home: true, my: 2, their: 0 }, { res: 'D', opp: 'B', home: false, my: 1, their: 1 },
    { res: 'L', opp: 'C', home: true, my: 0, their: 1 }] };

const head = K.html('head', st);
const pills = head.match(/<i class="cfb-hf [WDL]"[^>]*>/g) || [];
assert.equal(pills.length, 3, 'three chips');
for (const p of pills) {
  assert.match(p, /width:1\.75em;height:1\.75em/, 'chip 1,75 em');
  assert.match(p, /font-weight:800/, 'bold letters');
  assert.match(p, /color:var\(--casora-soft-glyph, #fff\)/, 'white letters: ' + p);
  const bg = /background:(#[0-9A-Fa-f]{6})/.exec(p);
  assert.ok(bg && onWhite(bg[1]) >= 4.5, 'deep tone ≥ 4,5 : 1: ' + p);
}

const tab = K.html('table', st);
const em = /\.cfb-r \.n em\{([^}]*)\}/.exec(tab);
assert.ok(em, 'label style');
assert.match(em[1], /font-size:12px/, '„nächster Gegner“ 12 px');
assert.ok(!/primary-color/.test(em[1]), '„nächster Gegner“ not in the accent (2,9 : 1)');
assert.match(em[1], /color:#333/, 'text-2');
assert.match(tab, /\.cfb-res\.W\{background:#3F7A4C;\}/, 'form list uses the same deep tones');

console.log('fussball_form_contrast: ok');
