// Room bar "Show names" (Studio › Settings › Look & feel › Room bar, variable nav_names): "" = every name (default,
// as before), "rooms" = Home only as its round house icon, the rooms keep their names. Desktop and tablet only.
//   node dev/unit/nav_names.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#navNamesOf,_syncNames,_setHomeIcon
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const panel = read('custom_components/casora/panel/casora-panel.js');
const settings = read('custom_components/casora/panel/casora-panel-settings.js');

// ── reader: first room view whose hero card sets it, anything but "rooms" is the default ──
const a = core.indexOf('  function navNamesOf(cfg) {');
assert.ok(a > 0, 'navNamesOf in casora-core.js');
const src = core.slice(a, core.indexOf('\n  }\n', a) + 4);
const navNamesOf = new Function(src + '; return navNamesOf;')();
const view = (vars) => ({ cards: [{ type: 'custom:button-card', template: 'casora_room', variables: vars }, { type: 'x' }] });
assert.equal(navNamesOf(null), '', 'no config: default');
assert.equal(navNamesOf({ views: [] }), '');
assert.equal(navNamesOf({ views: [view({})] }), '', 'nothing stored: every name, as before');
assert.equal(navNamesOf({ views: [view({ nav_names: 'rooms' })] }), 'rooms');
assert.equal(navNamesOf({ views: [view({}), view({ nav_names: 'rooms' })] }), 'rooms', 'an imported dashboard may carry it on one room');
assert.equal(navNamesOf({ views: [view({ nav_names: '' }), view({ nav_names: 'rooms' })] }), 'rooms', 'empty counts as unset');
assert.equal(navNamesOf({ views: [view({ nav_names: 'icons' })] }), '', 'unknown value: default');
assert.equal(navNamesOf({ views: [{ cards: [{ type: 'x', nav_names: 'rooms' }] }] }), '', 'only the hero variables count');

// ── bar: its own class with the same look as the tight state, read from the dashboard, aria-label stays ──
assert.match(core, /:is\(\.bar\.tight, \.bar\.homeicon\) \.route\.home \.htx \{ display: none; \}/, 'homeicon hides the Home text');
assert.match(core, /:is\(\.bar\.tight, \.bar\.homeicon\) \.route\.home \.label \{ padding-right:/, 'and makes the pill round');
assert.match(core, /bar\.classList\.toggle\('homeicon', !!this\._homeIcon\);/, 'set when the bar is built');
assert.match(core, /btn\.setAttribute\('aria-label', htx\.textContent\);\s*if \(this\._homeIcon\) btn\.title = htx\.textContent;/,
  'Home keeps its name for screen readers and as a tooltip');
assert.match(core, /this\._setHomeIcon\(navNamesOf\(cfg\) === 'rooms'\);/);
assert.match(core, /bar\._syncNames\(true\);\s*bar\.setConfig\(this\._config\);/, 'read before the first build');
assert.match(core, /_syncRoute\(\) \{\s*if \(!this\._built\) return;\s*this\._syncNames\(true\);/, 'read again on a room change');
// The tight state still resets itself on every layout; homeicon is never touched there.
const lay = core.slice(core.indexOf('    _layout() {'), core.indexOf('    _regroup('));
assert.doesNotMatch(lay, /homeicon/);

// ── Studio: one dashboard field, two values, default "" ──
assert.match(panel, /\{ key: "nav_names", sub: "chrome", label: "Show names", type: "select", seg: true, auto: true, scope: "dashboard",\s*options: \["", "rooms"\],\s*optionLabels: \{ "": "All", rooms: "Without Home text" \},\s*hint: "Without the text, one more room fits in the bar\." \}/);
assert.doesNotMatch(panel, /nav_names[^\n]*icons/, 'no "only icons" choice');
// Section fields can be segments; choosing the default removes the value (nothing stored: as before).
assert.match(panel, /if \(f\.type === "select" && f\.seg\) \{[\s\S]{0,900}setVar\(f\.key, v \|\| undefined, f\);/);
// Its own block right before the clock, "Only this dashboard" (sec).
const look = settings.slice(settings.indexOf('{ id: "look"'), settings.indexOf('{ id: "use"'));
const iNav = look.indexOf('k: "navbar"'), iTime = look.indexOf('k: "time"');
assert.ok(iNav > 0 && iTime > iNav, 'Room bar block before Clock');
assert.match(look.slice(iNav, iTime), /sec: "General", sub: "chrome", keys: \["nav_names"\], title: "Room bar"/);
assert.ok(!/adv: true/.test(look.slice(iNav, iTime)), 'not folded away under Advanced');
// The preview draws Home as a house circle too.
assert.match(panel, /if \(homeFixed && ri === 0 && V\.nav_names === "rooms"\) \{\s*t\.classList\.add\("homeicon"\);\s*t\.setAttribute\("aria-label", t\.textContent\);/);
assert.match(panel, /\.mini-tab\.home\.homeicon::before \{/);

// ── all eight languages ──
for (const l of ['de', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const ex = JSON.parse(read('custom_components/casora/translations/panel/' + l + '.json')).exact;
  for (const k of ['Room bar', 'The bar at the top with Home and your rooms, on desktop and tablet.', 'Show names', 'All',
    'Without Home text', 'Without the text, one more room fits in the bar.']) {
    assert.ok(ex[k] && ex[k] !== k, l + ': ' + k);
  }
}
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
assert.equal(de['Room bar'], 'Raumleiste');
assert.equal(de['Show names'], 'Namen zeigen');
assert.equal(de['Without Home text'], 'Ohne Zuhause-Text');
assert.equal(de['Without the text, one more room fits in the bar.'], 'Ohne den Text passt ein Raum mehr in die Leiste.');

console.log('nav_names: ok');
