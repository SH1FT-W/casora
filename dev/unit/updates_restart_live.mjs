// Updates tile and popup: one restart rule, counted live, and each update in exactly one group.
// Without a browser: casoraNeedsRestart from casora-core.js, the tile's templates and the popup's
// nested templates (built once at open, then re-evaluated with later states).
//   node dev/unit/updates_restart_live.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.innerWidth = 1200;
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const fn = core.match(/window\.casoraNeedsRestart = function \(e\) \{[\s\S]*?\n {2}\};/);
assert.ok(fn, 'casoraNeedsRestart found in casora-core.js');
new Function(fn[0])();
window._casoraUI = { soft: () => false, hero: () => '<hero>', group: () => '<group>', label: (t) => t, icon: (n, t) => `<icon ${n} ${t}>` };

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tpl = (s) => new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(s));

const RESTART = "<ha-alert alert-type='error'>Restart of Home Assistant required</ha-alert>";
const upd = (id, a, state) => ({ entity_id: id, state: state || 'on',
  attributes: { friendly_name: id, installed_version: '1.0.0', latest_version: '1.1.0', supported_features: 1, in_progress: false, ...a } });

// ── The rule ──
const R = window.casoraNeedsRestart;
assert.equal(R(upd('update.a', { installed_version: '1.1.0', release_summary: RESTART }, 'off')), true, 'HACS installed, restart owed');
assert.equal(R(upd('update.a', { release_summary: RESTART }, 'on')), false, 'still pending is not a restart');
assert.equal(R(upd('update.a', { installed_version: '1.1.0' }, 'off')), false, 'up to date, no summary');
assert.equal(R(upd('update.a', { installed_version: '1.1.0', release_summary: RESTART }, 'unavailable')), false, 'unavailable');
assert.equal(R(null), false);

// ── Tile ──
const tile = T.casora_updates;
const show = tpl(tile.state_display), idle = tpl(tile.variables.idle), icon = tpl(tile.variables.icon);
const tileOf = (states) => ({ text: show(states, undefined, {}, { states }, {}), idle: idle(states, undefined, {}, { states }, {}),
  icon: icon(states, undefined, {}, { states }, {}) });
let st = { 'update.a': upd('update.a'), 'update.b': upd('update.b', { installed_version: '2.0', latest_version: '2.0' }, 'off') };
assert.deepEqual(tileOf(st), { text: '1 Verfügbar', idle: false, icon: 'updates' });
st['update.a'] = upd('update.a', { installed_version: '1.1.0', release_summary: RESTART }, 'off');
assert.deepEqual(tileOf(st), { text: 'Neustart ausstehend', idle: false, icon: 'updates-restart' }, 'tile: installed via HACS');
// Skipped (HA: state off) is neither open nor restart.
st = { 'update.s': upd('update.s', { skipped_version: '1.1.0' }, 'off') };
assert.deepEqual(tileOf(st), { text: 'Aktuell', idle: true, icon: 'updates' }, 'tile: skipped');
// A non-standard restart_type attribute no longer makes a pending update read as "restart".
st = { 'update.r': upd('update.r', { restart_type: 'restart' }) };
assert.equal(tileOf(st).text, '1 Verfügbar', 'tile: restart_type ignored');

// ── Popup: built once at open, nested templates re-evaluated later ──
const popup = tpl(T.casora_popup_updates.tap_action.casora_popup.content);
const hass = { states: {}, locale: { language: 'de' } };
const open = (states) => { hass.states = states; return popup(states, undefined, {}, hass, {}, null); };
const templates = (cfg) => {
  const out = [];
  const walk = (o, path) => {
    if (typeof o === 'string') { if (o.trim().startsWith('[[[')) out.push({ path, f: tpl(o) }); return; }
    if (o && typeof o === 'object') Object.keys(o).forEach((k) => walk(o[k], path + '/' + k));
  };
  walk(cfg, '');
  return out;
};
const run = (t, states) => { hass.states = states; return t.f(states, undefined, {}, hass, {}, null); };
const find = (ts, re) => ts.filter((t) => re.test(t.path));

// 1) Two open updates, one cannot install (no INSTALL feature): Update All takes only one → no Update All.
st = { 'update.a': upd('update.a'), 'update.b': upd('update.b'), 'update.n': upd('update.n', { supported_features: 0 }) };
let ts = templates(open(st));
const head = ts.find((t) => /\/listhead\/card\/custom_fields\/t$/.test(t.path));
const btnTap = ts.find((t) => /\/listhead\/card\/custom_fields\/b\/card\/tap_action$/.test(t.path));
const btnText = ts.find((t) => /\/listhead\/card\/custom_fields\/b\/card\/custom_fields\/t$/.test(t.path));
assert.ok(head && btnTap && btnText, 'list heading and its button found');
let tap = run(btnTap, st);
assert.equal(tap.service, 'update.install');
assert.deepEqual(tap.target.entity_id, ['update.a', 'update.b'], 'Update All: only entities with INSTALL');
st = { 'update.a': upd('update.a'), 'update.n': upd('update.n', { supported_features: 0 }) };
assert.equal(run(btnTap, st).action, 'none', 'one installable left: no Update All');

// 2) One installs, the other has already installed and waits for the restart: no "Restart now" yet.
st = { 'update.a': upd('update.a', { in_progress: true }), 'update.b': upd('update.b', { installed_version: '1.1.0', release_summary: RESTART }, 'off') };
assert.equal(run(btnTap, st).action, 'none', 'no restart while an install is still running');
assert.ok(/Verfügbare Updates/.test(run(head, st)), 'heading stays on the list while installing');
// 3) Done: restart owed.
st['update.a'] = upd('update.a', { installed_version: '1.1.0', release_summary: RESTART }, 'off');
assert.equal(run(btnTap, st).service, 'homeassistant.restart', 'all installed: Restart now');
assert.ok(/Wartet auf Neustart/.test(run(head, st)));
// The status card says so too (it said "Alles aktuell" with a check).
const ov = find(ts, /\/ov\/card\/custom_fields\/c$/)[0] || find(ts, /\/left\/.*|ov/).find((t) => /\/ov\/card\/custom_fields\/c$/.test(t.path));
assert.ok(ov, 'status card found');
let html = run(ov, st);
assert.ok(/Neustart ausstehend/.test(html) && /updates-restart warn/.test(html), 'status card: restart pending, not "Alles aktuell"');
// 4) An update entity added while the popup is open counts in the heading.
st = { 'update.a': upd('update.a'), 'update.new': upd('update.new') };
assert.deepEqual(run(btnTap, st).target.entity_id, ['update.a', 'update.new'], 'new entity counted live');

// 5) Opened with nothing to do, then an update appears and installs with a restart owed:
//    the list shows the restart (it stayed empty) and the status card says so.
st = { 'update.a': upd('update.a', { installed_version: '1.1.0' }, 'off') };
ts = templates(open(st));
const list = ts.find((t) => /\/list\/card\/custom_fields\/c$/.test(t.path));
assert.ok(list, "empty popup: live list found");
window._casoraUpdX = { list: () => '<rows>', ov: () => null };
assert.equal(run(list, st), '', 'nothing to do: no list');
st = { 'update.a': upd('update.a', { installed_version: '1.1.0', release_summary: RESTART }, 'off') };
html = run(list, st);
assert.ok(/<rows>/.test(html) && /Wartet auf Neustart/.test(html), 'restart owed: list with "Wartet auf Neustart"');
assert.ok(/Neustart ausstehend/.test(run(find(ts, /\/ov\/card\/custom_fields\/c$/)[0], st)), 'empty popup: status card shows the restart');
st = { 'update.a': upd('update.a') };
assert.ok(/Verfügbare Updates/.test(run(list, st)), 'update found later: "Verfügbare Updates"');
html = run(find(ts, /\/ov\/card\/custom_fields\/c$/)[0], { 'update.a': upd('update.a', { installed_version: '1.1.0' }, 'off') });
assert.ok(/Alles aktuell/.test(html) && /mdi:check good/.test(html), 'status card: all up to date');

console.log('ok updates_restart_live');
