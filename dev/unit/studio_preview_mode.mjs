// Studio preview day/night: the theme's other mode as variables for the preview only.
//   node dev/unit/studio_preview_mode.mjs
// Reported: the day/night switch above the preview only swapped the photo; tiles, badges, chrome and the
// player kept Home Assistant's mode. Browser check: dev/qa/regress/r311_preview_day_night.mjs.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const panel = read('custom_components/casora/panel/casora-panel.js');
const at = panel.indexOf('\nfunction previewThemeVars(');
assert.ok(at > 0, 'previewThemeVars');
const previewThemeVars = new Function(panel.slice(at, panel.indexOf('\n}\n', at) + 3) + '\nreturn previewThemeVars;')();

const theme = {
  'casora-u': '8px', 'card-pane': 'var(--casora-entity-background)', plain: '#123',
  modes: {
    light: { 'casora-entity-background': '#fff', 'only-light': '1px' },
    dark: { 'casora-entity-background': '#222', 'only-dark': '2px' },
  },
};
const hass = (darkMode, name = 'Casora') => ({ themes: { darkMode, theme: name, themes: { Casora: theme, Plain: { a: '1' } } } });

assert.equal(previewThemeVars(hass(true), true), null, 'preview matches HA (dark): nothing to override');
assert.equal(previewThemeVars(hass(false), false), null, 'preview matches HA (light)');
assert.equal(previewThemeVars(hass(true, 'Plain'), false), null, 'theme without modes: nothing');
assert.equal(previewThemeVars({}, true), null, 'no themes yet');

// HA dark, preview day: the light mode, base values with var(…) again, dark-only keys back to base (none here).
assert.deepEqual(previewThemeVars(hass(true), false), {
  '--casora-entity-background': '#fff', '--only-light': '1px', '--card-pane': 'var(--casora-entity-background)',
});
// HA light, preview night.
const night = previewThemeVars(hass(false), true);
assert.equal(night['--casora-entity-background'], '#222');
assert.equal(night['--only-dark'], '2px');
assert.equal(night['--card-pane'], 'var(--casora-entity-background)', 'resolved again in the preview');
assert.ok(!('--plain' in night) && !('--casora-u' in night), 'plain base values stay inherited');
assert.ok(!('--modes' in night));
// The user's selected theme counts before the default.
const sel = { ...hass(true, 'Plain'), selectedTheme: { theme: 'Casora' } };
assert.equal(previewThemeVars(sel, false)['--casora-entity-background'], '#fff');

// Wiring: switch → _syncPreviewMode, variables on .plinth, Studio-mode selectors replaced in the preview.
assert.ok(/this\._miniDark = v === "night";\s*this\._syncPreviewMode\(\);/.test(panel), 'switch applies the mode');
assert.ok(/querySelector\("\.plinth"\)[\s\S]{0,400}previewThemeVars\(this\._hass, dark\)/.test(panel), 'variables on .plinth');
assert.ok(!/:host\(\.is-light\) \.card\.map\.soft \.miniroom \.mzscrim/.test(panel), 'focus veil follows the preview');
assert.ok(/\.card\.map\.soft \.mini-wave\.on \{\s*background:var\(--casora-np-head-on/.test(panel), 'open wave from the theme');
const pop = read('custom_components/casora/panel/casora-panel-popups.js');
assert.ok(/themes: \{ \.\.\.th, darkMode: !!dk \}/.test(pop), 'popup preview: templates see the switch');
const np = read('custom_components/casora/scripts/local/09-weich-wiedergabe.js');
assert.ok(/dk = opt\.dark != null \? !!opt\.dark :/.test(np), 'player: opt.dark');
assert.ok(/NP\.paint\(e, sr\.querySelector\("\.w"\), list, this\._hass\.states, o\)/.test(panel), 'preview draws the dashboard player');

console.log('ok studio_preview_mode');
