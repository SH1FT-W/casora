// Issue 138: a garage door left 1 % open for air (HA state "open") showed „Tor offen“. Setting security.closed_up_to
// (0–20 %, default 0 = as before): a cover at rest whose current_position is at or below it counts as closed – gates
// (device_class garage/gate/door) and the covers picked for security. Opening/closing still counts as open.
// One helper, window.casoraCoverOpen (34-security-covers.js), used by the security badge (all four _sec copies),
// its level (casoraSecurityLevel), the arm warning (casoraArmWarnings) and the security covers (C.isOpen).
//   node dev/unit/cover_closed_up_to.mjs
// @deckt: custom_components/casora/scripts/local/34-security-covers.js#casoraCoverOpen,C.isOpen,C.closedUpTo, custom_components/casora/scripts/local/00-finder.js#securityLevel, custom_components/casora/scripts/casora-core.js#casoraArmWarnings, dashboards/casora/button_card_templates.json#casora_badge_security_group,casora_badge_security
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
window.casoraIconUrl = (k) => '/i/' + k + '.svg';
window._casoraUI = { esc: (t) => String(t), line: () => '', group: () => '', note: () => '' };
window._casoraSoftKit = { secCard: () => ({}), layout: () => ({}) };
new Function(read('custom_components/casora/scripts/local/34-security-covers.js'))();
const C = window._casoraSecCovers;

const cv = (state, attrs) => ({ state, attributes: Object.assign({ friendly_name: 'Garage', supported_features: 15 }, attrs || {}) });
const set = (sec) => { window.CASORA_SETTINGS = sec === undefined ? {} : { security: sec }; };
const gate = (state, pos) => cv(state, pos == null ? { device_class: 'garage' } : { device_class: 'garage', current_position: pos });

// ── Security group badge (legacy sub-line): „Tor offen“ or not ──
const G = T.casora_badge_security_group;
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const badge = (st) => {
  const states = { 'cover.garage': st, 'sun.sun': { state: 'above_horizon', attributes: {} } };
  const hass = { states, entities: {}, devices: {}, areas: {} };
  return new Function('states', 'hass', 'variables', 'user', 'entity', body(G.name))
    .call({}, states, hass, { place: 'room', entities: ['cover.garage'] }, null, null);
};
const level = (st) => window.casoraSecurityLevel({ states: { 'cover.garage': st }, entities: {}, devices: {}, areas: {} }, ['cover.garage']);

set(undefined);
assert.match(badge(gate('open', 1)), /Tor offen/, 'default 0: 1 % open is open, as before');
assert.equal(level(gate('open', 1)), 'warn');
set({ closed_up_to: 0 });
assert.match(badge(gate('open', 1)), /Tor offen/, 'threshold 0: open');
set({ closed_up_to: 1 });
assert.doesNotMatch(badge(gate('open', 1)), /Tor offen/, 'threshold 1: 1 % counts as closed');
assert.match(badge(gate('open', 1)), /Alles sicher/);
assert.equal(level(gate('open', 1)), 'ok', 'level: no warning at 1 %');
assert.match(badge(gate('open', 2)), /Tor offen/, 'above the threshold: open');
assert.match(badge(gate('opening', 1)), /Tor offen/, 'opening at 1 % is in motion: open');
assert.equal(level(gate('opening', 1)), 'warn');
assert.match(badge(gate('open')), /Tor offen/, 'no position reported: open');
assert.match(badge(gate('open', '')), /Tor offen/, 'empty position: open');
assert.doesNotMatch(badge(gate('closed', 0)), /Tor offen/);
assert.doesNotMatch(badge(gate('closing', 1)), /Tor offen/, 'closing gate: not open, as before');

// All four _sec copies of the group badge go through the helper.
for (const src of [G.extra_styles, G.icon, G.name, G.styles.card.find((e) => e['--casora-badge-icon-color'])['--casora-badge-icon-color']]) {
  assert.match(src, /casoraCoverOpen\(states\[id\], 'gate'\)/);
}
const ic = (st) => new Function('states', 'hass', 'variables', 'user', 'entity', body(G.icon))
  .call({}, { 'cover.garage': st }, { states: { 'cover.garage': st }, entities: {} }, { place: 'room', entities: ['cover.garage'] }, null, null);
assert.equal(ic(gate('open', 1)), 'mdi:shield-check', 'icon: secure at 1 % with threshold 1');
set({ closed_up_to: 0 });
assert.equal(ic(gate('open', 1)), 'mdi:shield-alert');

// Single security sub-badge (casora_badge_security): the door glyph follows the same rule.
const S1 = T.casora_badge_security;
const glyph = (st) => new Function('states', 'hass', 'variables', 'user', 'entity', body(S1.extra_styles))
  .call({}, {}, { states: {} }, {}, null, Object.assign({ entity_id: 'cover.garage' }, st));
set({ closed_up_to: 1 });
assert.match(glyph(gate('open', 1)), /door-closed/, 'sub-badge: closed glyph at 1 %');
set({ closed_up_to: 0 });
assert.match(glyph(gate('open', 1)), /door-open/);

// ── Arm warning (casora-core.js casoraArmWarnings) ──
const core = read('custom_components/casora/scripts/casora-core.js');
const block = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };
const w = { addEventListener() {}, casoraHaptic() {}, casoraOpenings: window.casoraOpenings, casoraCoverOpen: window.casoraCoverOpen };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  var hassUser', '})();\n') + block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, { querySelector: () => null, addEventListener() {} }, WeakSet, class {}, () => {});
const arm = (st) => w.casoraArmWarnings({ states: { 'cover.garage': st } }, ['cover.garage']);
set({ closed_up_to: 1 });
assert.deepEqual(arm(gate('open', 1)), [], 'arming: 1 % is closed');
assert.deepEqual(arm(gate('opening', 1)), ['Garage offen']);
set(undefined);
assert.deepEqual(arm(gate('open', 1)), ['Garage offen'], 'default: as before');

// ── Covers picked for security (C.isOpen / C.scan) ──
const blind = (state, pos) => cv(state, { friendly_name: 'Wohnzimmer', current_position: pos });
set({ covers: ['cover.blind'] });
assert.equal(C.isOpen(blind('open', 1)), true, 'default: 1 % is open');
assert.equal(C.isOpen(blind('open', 0)), true, 'default: state open at 0 % stays open, as before');
assert.equal(C.isOpen(blind('closed', 5)), true, 'default: closed but at 5 % is open, as before');
set({ covers: ['cover.blind'], closed_up_to: 2 });
assert.equal(C.isOpen(blind('open', 1)), false, 'threshold 2: 1 % counts as closed');
assert.equal(C.isOpen(blind('open', 2)), false, 'at the threshold: closed');
assert.equal(C.isOpen(blind('open', 3)), true);
assert.equal(C.isOpen(blind('closed', 2)), false);
assert.equal(C.isOpen(blind('closing', 1)), true, 'closing is in motion: open');
assert.equal(C.isOpen(blind('opening', 1)), true);
assert.equal(C.isOpen(blind('unavailable', 1)), null);
const st = { 'cover.blind': blind('open', 1), 'sun.sun': { state: 'below_horizon', attributes: {} } };
const r = C.scan(st, { states: st });
assert.deepEqual(r.closed, ['cover.blind']); assert.equal(r.count, 0);
assert.equal(C.word(blind('open', 1)), 'Geschlossen', 'popup word follows the rule');

// ── The setting: integer 0–20, anything else = 0 ──
const up = (v) => { set({ closed_up_to: v }); return C.closedUpTo(); };
assert.equal(up(undefined), 0); assert.equal(up(5), 5); assert.equal(up(20), 20);
assert.equal(up(21), 0); assert.equal(up(-1), 0); assert.equal(up('3'), 0); assert.equal(up(2.5), 0); assert.equal(up(NaN), 0);

// ── Per cover (issue 138, follow-up 07.11.2026): blinds left at different positions in the evening. ──
// security.closed_up_to_by { entity_id: whole percent 0–99 } wins over closed_up_to for that cover; others keep it.
const own = (id, state, pos, attrs) => Object.assign(cv(state, Object.assign({ current_position: pos }, attrs || {})), { entity_id: id });
set({ covers: ['cover.wz', 'cover.sz'], closed_up_to: 1, closed_up_to_by: { 'cover.wz': 40 } });
assert.equal(C.closedUpTo('cover.wz'), 40, 'own value of the cover');
assert.equal(C.closedUpTo('cover.sz'), 1, 'others: the general value');
assert.equal(C.closedUpTo(), 1, 'no cover: the general value');
assert.equal(C.isOpen(own('cover.wz', 'open', 40)), false, 'at its own value: closed');
assert.equal(C.isOpen(own('cover.wz', 'open', 41)), true, 'above its own value: open');
assert.equal(C.isOpen(own('cover.wz', 'opening', 30)), true, 'in motion: open');
assert.equal(C.isOpen(own('cover.sz', 'open', 40)), true, 'another cover keeps the general value');
assert.equal(window.casoraCoverOpen(own('cover.wz', 'open', 40, { device_class: 'garage' }), 'gate'), false, 'gates too');
set({ closed_up_to_by: { 'cover.wz': 0 } , closed_up_to: 5 });
assert.equal(C.closedUpTo('cover.wz'), 0, 'own 0 beats the general value');
for (const bad of [100, -1, '30', 2.5, NaN, null]) {
  set({ closed_up_to: 3, closed_up_to_by: { 'cover.wz': bad } });
  assert.equal(C.closedUpTo('cover.wz'), 3, 'invalid own value ' + bad + ': the general value');
}
set({ closed_up_to: 3, closed_up_to_by: ['cover.wz'] });
assert.equal(C.closedUpTo('cover.wz'), 3, 'not a map: ignored');
const st2 = { 'cover.wz': own('cover.wz', 'open', 35), 'sun.sun': { state: 'below_horizon', attributes: {} } };
set({ covers: ['cover.wz'], closed_up_to_by: { 'cover.wz': 40 } });
assert.equal(C.scan(st2, { states: st2 }).count, 0, 'scan: the blind at 35 % with own 40 % counts as closed');

// A gate has its own value too (Studio: „Tore: gilt als geschlossen bis“); other gates keep the general one.
set({ closed_up_to: 1, closed_up_to_by: { 'cover.garage': 15 } });
assert.equal(C.coverOpen({ entity_id: 'cover.garage', state: 'open', attributes: { current_position: 10 } }, 'gate'), false, 'gate within its own value');
assert.equal(C.coverOpen({ entity_id: 'cover.gate2', state: 'open', attributes: { current_position: 10 } }, 'gate'), true, 'another gate: general value');

console.log('cover_closed_up_to: ok');
