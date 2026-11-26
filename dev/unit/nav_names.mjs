// Room bar "Show names" (Studio › Settings › Look & feel › Room bar, variable nav_names): nothing stored = Home only
// as its round house icon, the rooms keep their names (default since owner, 15.11.2026); "all" = every name, Home with
// its text. A stored "rooms" (beta b4) still means the icon. Desktop and tablet only.
//   node dev/unit/nav_names.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#navNamesOf,_syncNames,_setHomeIcon
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const panel = read('custom_components/casora/panel/casora-panel.js');
const settings = read('custom_components/casora/panel/casora-panel-settings.js');

// ── reader: first room view whose hero card sets it, anything but "all" is the default (icon) ──
const a = core.indexOf('  function navNamesOf(cfg) {');
assert.ok(a > 0, 'navNamesOf in casora-core.js');
const src = core.slice(a, core.indexOf('\n  }\n', a) + 4);
const navNamesOf = new Function(src + '; return navNamesOf;')();
const view = (vars) => ({ cards: [{ type: 'custom:button-card', template: 'casora_room', variables: vars }, { type: 'x' }] });
assert.equal(navNamesOf(null), 'rooms', 'no config: default, Home as the icon');
assert.equal(navNamesOf({ views: [] }), 'rooms');
assert.equal(navNamesOf({ views: [view({})] }), 'rooms', 'nothing stored: Home as the icon');
assert.equal(navNamesOf({ views: [view({ nav_names: 'all' })] }), 'all', '"all": every name, Home with its text');
assert.equal(navNamesOf({ views: [view({ nav_names: 'rooms' })] }), 'rooms', 'legacy "rooms": the icon');
assert.equal(navNamesOf({ views: [view({}), view({ nav_names: 'all' })] }), 'all', 'an imported dashboard may carry it on one room');
assert.equal(navNamesOf({ views: [view({ nav_names: '' }), view({ nav_names: 'all' })] }), 'all', 'empty counts as unset');
assert.equal(navNamesOf({ views: [view({ nav_names: 'icons' })] }), 'rooms', 'unknown value: default');
assert.equal(navNamesOf({ views: [{ cards: [{ type: 'x', nav_names: 'all' }] }] }), 'rooms', 'only the hero variables count');

// ── bar: its own class with the same look as the tight state, read from the dashboard, aria-label stays ──
assert.match(core, /:is\(\.bar\.tight, \.bar\.homeicon\) \.route\.home \.htx \{ display: none; \}/, 'homeicon hides the Home text');
assert.match(core, /:is\(\.bar\.tight, \.bar\.homeicon\) \.route\.home \.label \{ padding-right:/, 'and makes the pill round');
assert.match(core, /bar\.classList\.toggle\('homeicon', !!this\._homeIcon\);/, 'set when the bar is built');
assert.match(core, /btn\.setAttribute\('aria-label', htx\.textContent\);\s*if \(this\._homeIcon\) btn\.title = htx\.textContent;/,
  'Home keeps its name for screen readers and as a tooltip');
assert.match(core, /this\._setHomeIcon\(navNamesOf\(cfg\) !== 'all'\);/);
assert.match(core, /if \(!cfg\) \{ if \(this\._homeIcon === undefined\) this\._setHomeIcon\(true\); return; \}/,
  'no config yet: the default (icon), so Home does not flash its text');
assert.match(core, /bar\._syncNames\(true\);\s*bar\.setConfig\(this\._config\);/, 'read before the first build');
assert.match(core, /_syncRoute\(\) \{\s*if \(!this\._built\) return;\s*this\._syncNames\(true\);/, 'read again on a room change');
// The tight state still resets itself on every layout; homeicon is never touched there.
const lay = core.slice(core.indexOf('    _layout() {'), core.indexOf('    _regroup('));
assert.doesNotMatch(lay, /homeicon/);

// ── Studio: one dashboard field, two values; "All" first as before, the default "" (icon) second ──
assert.match(panel, /\{ key: "nav_names", sub: "chrome", label: "Show names", type: "select", seg: true, auto: true, scope: "dashboard",\s*options: \["all", ""\],\s*optionLabels: \{ all: "All", "": "Home page as icon" \},\s*hint: "Without the text, one more room fits in the bar\." \}/);
assert.doesNotMatch(panel, /nav_names[^\n]*icons/, 'no "only icons" choice');
// Section fields can be segments; choosing the default removes the value. A value not among the options (legacy
// "rooms") shows the default, "Home page as icon".
assert.match(panel, /if \(f\.type === "select" && f\.seg\) \{[\s\S]{0,900}setVar\(f\.key, v \|\| undefined, f\);/);
assert.match(panel, /this\._wireSeg\(seg, "v", \(f\.options \|\| \[\]\)\.includes\(now\) \? now : "",/);
// Its own block right before the clock, "Only this dashboard" (sec).
const look = settings.slice(settings.indexOf('{ id: "look"'), settings.indexOf('{ id: "use"'));
const iNav = look.indexOf('k: "navbar"'), iTime = look.indexOf('k: "time"');
assert.ok(iNav > 0 && iTime > iNav, 'Room bar block before Clock');
assert.match(look.slice(iNav, iTime), /sec: "General", sub: "chrome", keys: \["nav_names"\], title: "Room bar"/);
assert.ok(!/adv: true/.test(look.slice(iNav, iTime)), 'not folded away under Advanced');
// The preview draws Home as a house circle too.
assert.match(panel, /if \(homeFixed && ri === 0 && V\.nav_names !== "all"\) \{\s*t\.classList\.add\("homeicon"\);\s*t\.setAttribute\("aria-label", t\.textContent\);/);
assert.match(panel, /\.mini-tab\.home\.homeicon::before \{/);

// ── all eight languages ──
for (const l of ['de', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const ex = JSON.parse(read('custom_components/casora/translations/panel/' + l + '.json')).exact;
  for (const k of ['Room bar', 'The bar at the top with Home and your rooms, on desktop and tablet.', 'Show names', 'All',
    'Home page as icon', 'Without the text, one more room fits in the bar.']) {
    assert.ok(ex[k] && ex[k] !== k, l + ': ' + k);
  }
}
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
assert.equal(de['Room bar'], 'Raumleiste');
assert.equal(de['Show names'], 'Namen zeigen');
assert.equal(de['Home page as icon'], 'Zuhause als Symbol');
// The first view's name is the user's own ("Start", "Home" ...): neither the label nor the bar hard-codes it.
for (const l of ['de', 'es', 'fr', 'it', 'nb', 'nl', 'pl', 'pt']) {
  const ex = JSON.parse(read('custom_components/casora/translations/panel/' + l + '.json')).exact;
  assert.ok(!('Without Home text' in ex), l + ': old label gone');
}
assert.doesNotMatch(panel, /Without Home text/);
const homeBtn = core.slice(core.indexOf("btn.classList.add('home');"), core.indexOf("btn.appendChild(label);", core.indexOf("btn.classList.add('home');")));
assert.doesNotMatch(homeBtn.replace(/\/\/.*$/gm, ''), /Zuhause/, 'aria-label and title are the view\'s real name');
assert.equal(de['Without the text, one more room fits in the bar.'], 'Ohne den Text passt ein Raum mehr in die Leiste.');

console.log('nav_names: ok');
