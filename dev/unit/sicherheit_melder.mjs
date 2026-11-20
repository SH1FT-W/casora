// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraSecDetCfg,casoraSecDetKind,casoraSecDetectors,casoraSecDetWords,casoraSecCount,casoraSecLead,casoraSecuritySummary,casoraSecurityLevel,casoraSecSub custom_components/casora/scripts/local/49-security-detectors.js dashboards/casora/button_card_templates.json#casora_badge_security_group,casora_badge_security,casora_badge_security_detectors,casora_badge_security_motion custom_components/casora/panel/casora-panel-personal.js custom_components/casora/panel/casora-panel-settings.js
// Issue #209: under Security only window contacts showed; smoke detectors, water leak detectors and motion sensors were
// missing, and a smoke sensor picked as a security entry read „Geöffnet“ with a door. Expected (owner, 18.11.2026):
// smoke/gas/CO/water detectors count under Security (switch on by default): one that reports leads the badge in red
// („Rauch · Küche“ on Home), an offline one is a notice. Motion counts only with its switch (off by default) and only
// while nobody is home. Home takes the house, a room the detectors of its HA area. Switches off: as before.
//   node dev/unit/sicherheit_melder.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
new Function(read('custom_components/casora/scripts/local/49-security-detectors.js'))();
window.casoraIconUrl = (k) => '/i/' + k + '.svg';
window.casoraAgo = (t) => 'vor ' + Math.round((Date.now() - t) / 60000) + ' Min.';
const D = window._casoraSecDet;

const st = (state, dc, extra) => ({ state, attributes: { device_class: dc, friendly_name: 'x', ...extra } });
const base = () => ({
  'binary_sensor.rauch_kueche': st('off', 'smoke'),
  'binary_sensor.rauch_flur': st('off', 'smoke'),
  'binary_sensor.leck_bad': st('off', 'moisture'),
  'binary_sensor.bewegung_flur': st('off', 'motion', {}),
  'binary_sensor.fenster_bad': st('off', 'window'),
  'binary_sensor.rauch_diag': st('on', 'smoke'),
  'binary_sensor.rauch_hidden': st('on', 'smoke'),
  'binary_sensor.rauch_wmbus': st('off', 'smoke'),
  'binary_sensor.bewegung_diag': st('on', 'motion'),
  'binary_sensor.safety_x': st('on', 'safety'),
  'person.a': { state: 'home', attributes: {} },
});
const entities = {
  'binary_sensor.rauch_kueche': { area_id: 'kueche' }, 'binary_sensor.rauch_flur': { area_id: 'flur' },
  'binary_sensor.leck_bad': { device_id: 'd_bad' }, 'binary_sensor.bewegung_flur': { area_id: 'flur' },
  'binary_sensor.fenster_bad': { area_id: 'bad' },
  'binary_sensor.rauch_diag': { area_id: 'kueche', entity_category: 'config' },
  'binary_sensor.rauch_wmbus': { area_id: 'flur', entity_category: 'diagnostic' },
  'binary_sensor.bewegung_diag': { area_id: 'flur', entity_category: 'diagnostic' },
  'binary_sensor.rauch_hidden': { area_id: 'kueche', hidden_by: 'user' },
};
const hassOf = (S) => ({ states: S, entities, devices: { d_bad: { area_id: 'bad' } },
  areas: { kueche: { name: 'Küche' }, flur: { name: 'Flur' }, bad: { name: 'Bad' } } });
const set = (sec) => { window.CASORA_SETTINGS = sec === undefined ? {} : { security: sec }; };
const count = (S, v) => window.casoraSecCount(S, hassOf(S), v, null, null);

// ── Settings: smoke and water on by default (#220: a switch each, stored only as false; the #209 key detectors:
// false still switches both off), motion off (only motion: true) ──
set(undefined);
assert.deepEqual(window.casoraSecDetCfg(), { detectors: true, smoke: true, water: true, motion: false, exclude: [] }, 'defaults');
set({ detectors: false, motion: true });
assert.deepEqual(window.casoraSecDetCfg(), { detectors: false, smoke: false, water: false, motion: true, exclude: [] });
const pers = read('custom_components/casora/panel/casora-panel-personal.js');
assert.ok(pers.includes('DET_KEYS.forEach((x) => { if (now[x] === false) sec[x] = false; else delete sec[x]; });'), 'Studio stores only „off“');
assert.ok(pers.includes('if (v === true) sec.motion = true; else delete sec.motion;'), 'Studio stores only „on“');
assert.ok(/header: "Detectors"[\s\S]{0,4000}header: "Blinds and gates"/.test(pers), 'group Detectors, then Blinds and gates');
const sett = read('custom_components/casora/panel/casora-panel-settings.js');
assert.match(sett, /\{ k: "security", personal: \["security"\], title: "Security",[^}]*kw: "[^"]*sicherheit[^"]*rauchmelder[^"]*bewegungsmelder/);
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
assert.equal(de['Detectors'], 'Melder');
assert.equal(de['Smoke detectors'], 'Rauchmelder');
assert.equal(de['Water detectors'], 'Wassermelder');
assert.equal(de['Motion sensors'], 'Bewegungsmelder');

// ── Kinds ──
let S = base();
assert.equal(window.casoraSecDetKind('binary_sensor.rauch_kueche', S), 'smoke');
assert.equal(window.casoraSecDetKind('binary_sensor.leck_bad', S), 'water');
assert.equal(window.casoraSecDetKind('binary_sensor.bewegung_flur', S), 'motion');
assert.equal(window.casoraSecDetKind('binary_sensor.fenster_bad', S), null);
assert.equal(window.casoraSecDetKind('binary_sensor.safety_x', S), null, 'safety stays out');
assert.equal(window.casoraSecSub.keyOf('binary_sensor.rauch_kueche', S), 'smoke');
assert.equal(window.casoraSecSub.keyOf('binary_sensor.leck_bad', S), 'water', 'smoke and water apart');
assert.equal(window.casoraSecSub.keyOf('binary_sensor.bewegung_flur', S), 'motion');
assert.deepEqual(window.casoraSecSub.KEYS.filter((k) => ['smoke', 'water', 'motion', 'detectors'].includes(k)), ['smoke', 'water', 'motion']);

// ── Which detectors: Home the house, a room its area (device area too); hidden/diagnostic out ──
set(undefined);
let d = window.casoraSecDetectors(hassOf(S), { place: 'home' }, null, null);
assert.deepEqual(d.safety.sort(), ['binary_sensor.leck_bad', 'binary_sensor.rauch_flur', 'binary_sensor.rauch_kueche', 'binary_sensor.rauch_wmbus'],
  'a diagnostic smoke sensor counts (wmbusmeters), a config one does not');
assert.deepEqual(d.motion, [], 'motion off by default');
set({ motion: true });
assert.ok(!window.casoraSecDetectors(hassOf(S), { place: 'home' }, null, null).motion.includes('binary_sensor.bewegung_diag'), 'diagnostic motion stays out');
set(undefined);
d = window.casoraSecDetectors(hassOf(S), { room_name: 'Bad' }, 'room', null);
assert.deepEqual(d.safety, ['binary_sensor.leck_bad'], 'room by its area (the device\'s area)');
d = window.casoraSecDetectors(hassOf(S), { room_name: 'kueche' }, 'room', null);
assert.deepEqual(d.safety, ['binary_sensor.rauch_kueche'], 'umlauts folded');
d = window.casoraSecDetectors(hassOf(S), { _name: 'Küche' }, 'room', null);
assert.deepEqual(d.safety, ['binary_sensor.rauch_kueche'], 'the room card\'s own name (casora_room, phone _rv._name)');
d = window.casoraSecDetectors(hassOf(S), { room_name: 'Wohnzimmer', security_entity_1: 'binary_sensor.rauch_flur' }, 'room', null);
assert.deepEqual(d.safety, ['binary_sensor.rauch_flur'], 'a room\'s own entry counts too');

// ── Calm: all secure, ok ──
let r = count(S, { place: 'home' });
assert.equal(r.insecure, false); assert.equal(r.problem, false); assert.equal(r.level, 'ok'); assert.equal(r.detectors, 4);
assert.equal(window.casoraSecuritySummary(r, { summary: 'short' }).text, 'Alles sicher');

// ── Smoke in the kitchen: leads in red, with the room on Home ──
S = { ...base(), 'binary_sensor.rauch_kueche': st('on', 'smoke'), 'binary_sensor.fenster_bad': st('on', 'window') };
r = count(S, { place: 'home' });
assert.equal(r.danger, 1); assert.equal(r.level, 'alarm'); assert.equal(r.insecure, true);
let o = window.casoraSecuritySummary(r, { summary: 'short' });
assert.equal(o.text, 'Rauch · Küche · Fenster offen');
assert.match(o.html, /class="cs-sum-item cs-sum-lead"[^>]*>Rauch · Küche</, 'smoke leads in words');
// Leads even a jammed lock (rank above „jammed“) and whatever order the Studio set.
o = window.casoraSecuritySummary({ ...r, lockJammed: 1 }, { summary: 'short', order: ['locks', 'windows'] });
assert.match(o.html, /cs-sum-lead"[^>]*>Rauch · Küche</);
assert.equal(window.casoraSecLead([['x', 'i', 1, false, 'locks', 'jammed'], ['Wasser · Bad', 'i', 1, false, 'water', 'danger']]), 1);
// A room: no room name in the words.
r = count(S, { place: 'room', room_name: 'Küche' });
assert.equal(window.casoraSecuritySummary(r, { summary: 'detailed' }).text, 'Rauch erkannt');
assert.equal(r.level, 'alarm');
// Water in the bathroom.
S = { ...base(), 'binary_sensor.leck_bad': st('on', 'moisture') };
assert.equal(window.casoraSecuritySummary(count(S, { place: 'home' }), { summary: 'short' }).text, 'Wasser · Bad');
// Level of the single entity, as its sub-badge colours it.
assert.equal(window.casoraSecurityLevel(hassOf(S), ['binary_sensor.leck_bad']), 'alarm');

// ── Offline detector: a notice like an offline lock ──
S = { ...base(), 'binary_sensor.rauch_flur': st('unavailable', 'smoke') };
r = count(S, { place: 'home' });
assert.equal(r.detDead, 1); assert.equal(r.problem, true); assert.equal(r.level, 'warn');
assert.equal(r.detDeadSmoke, 1); assert.equal(r.detDeadWater, 0);
assert.equal(window.casoraSecuritySummary(r, { summary: 'short' }).text, 'Rauchmelder offline');
S = { ...S, 'binary_sensor.leck_bad': st('unknown', 'moisture') };
r = count(S, { place: 'home' });
assert.equal(window.casoraSecuritySummary(r, { summary: 'detailed' }).text, 'Rauchmelder offline · Wassermelder offline', 'smoke and water apart');

// ── Switch off: exactly as before (nothing counted, a reporting smoke sensor is no danger) ──
set({ detectors: false });
S = { ...base(), 'binary_sensor.rauch_kueche': st('on', 'smoke') };
r = count(S, { place: 'home' });
assert.equal(r.danger, 0); assert.equal(r.insecure, false); assert.equal(r.level, 'ok');
assert.equal(window.casoraSecurityLevel(hassOf(S), ['binary_sensor.rauch_kueche']), 'ok', 'off: no alarm level');
assert.equal(D.show(S, hassOf(S), null, { place: 'home' }, 'home', 'smoke'), false, 'off: no sub-badge');

// ── Motion: only with its switch and only while away ──
set({ motion: true });
S = { ...base(), 'binary_sensor.bewegung_flur': st('on', 'motion') };
r = count(S, { place: 'home' });
assert.equal(r.motion, 0, 'at home motion never counts'); assert.equal(r.level, 'ok');
S = { ...S, 'person.a': { state: 'not_home', attributes: {} } };
r = count(S, { place: 'home' });
assert.equal(r.motion, 1); assert.equal(r.level, 'alarm');
assert.equal(window.casoraSecuritySummary(r, { summary: 'short' }).text, 'Bewegung · Flur');
set(undefined);
assert.equal(count(S, { place: 'home' }).motion, 0, 'motion switch off: never');
// An e-bike's „in motion“ (device with a tracker) and a camera's object detection are no motion in the house.
{
  set({ motion: true });
  const S2 = { ...S, 'binary_sensor.ebike_in_motion': st('on', 'motion'), 'device_tracker.ebike': { state: 'home', attributes: {} },
    'binary_sensor.cam_person': st('on', 'occupancy'), 'camera.cam': { state: 'idle', attributes: {} } };
  const H = hassOf(S2);
  H.entities = { ...entities, 'binary_sensor.ebike_in_motion': { device_id: 'bike', area_id: 'flur' }, 'device_tracker.ebike': { device_id: 'bike' },
    'binary_sensor.cam_person': { device_id: 'cam', area_id: 'flur' }, 'camera.cam': { device_id: 'cam' } };
  assert.deepEqual(window.casoraSecDetectors(H, { place: 'home' }, 'home', null).motion, ['binary_sensor.bewegung_flur']);
}

// ── Sub-badges ──
set({ motion: true });
S = base();
// Smoke and water are two sub-badges (owner 19.11.2026), not one „Melder“.
let b = D.badge(S, hassOf(S), null, { place: 'home' }, 'home', 'smoke');
assert.equal(b.shown, true); assert.equal(b.title, 'Rauchmelder'); assert.equal(b.sub, '3 Melder · Normal'); assert.equal(b.level, 'ok');
assert.deepEqual(b.ids.sort(), ['binary_sensor.rauch_flur', 'binary_sensor.rauch_kueche', 'binary_sensor.rauch_wmbus']);
b = D.badge(S, hassOf(S), null, { place: 'home' }, 'home', 'water');
assert.equal(b.title, 'Wassermelder'); assert.equal(b.sub, 'Trocken'); assert.deepEqual(b.ids, ['binary_sensor.leck_bad']);
b = D.badge(S, hassOf(S), null, { place: 'room', room_name: 'Bad' }, 'room', 'water');
assert.equal(b.title, 'Wassermelder'); assert.equal(b.sub, 'Trocken');
assert.equal(D.show(S, hassOf(S), null, { place: 'room', room_name: 'Bad' }, 'room', 'smoke'), false, 'no smoke detector in the bathroom');
b = D.badge(S, hassOf(S), null, { place: 'room', room_name: 'Bad', own: ['binary_sensor.leck_bad'] }, 'room', 'water');
assert.equal(b.shown, false, 'its own entry keeps its single badge, no twin');
S = { ...base(), 'binary_sensor.rauch_kueche': st('on', 'smoke') };
assert.equal(D.badge(S, hassOf(S), null, { place: 'home' }, 'home', 'water').level, 'ok', 'smoke does not light the water badge');
b = D.badge(S, hassOf(S), null, { place: 'home' }, 'home', 'smoke');
assert.equal(b.sub, 'Rauch · Küche'); assert.equal(b.level, 'alarm');
const ago = Date.now() - 3 * 60000;
S = { ...base(), 'binary_sensor.bewegung_flur': { ...st('off', 'motion'), last_changed: new Date(ago).toISOString() } };
b = D.badge(S, hassOf(S), null, { place: 'home' }, 'home', 'motion');
assert.equal(b.title, 'Bewegung'); assert.equal(b.sub, 'Flur · vor 3 Min.'); assert.equal(b.level, 'ok');
set(undefined);
assert.equal(D.show(S, hassOf(S), null, { place: 'home' }, 'home', 'motion'), false, 'motion sub-badge only with its switch');

// ── Templates: one count for name, icon, colours; the rows carry the sub-badges ──
const G = T.casora_badge_security_group;
for (const k of ['extra_styles', 'icon', 'name']) assert.match(G[k], /window\.casoraSecCount\(states, hass, variables, user, this\)/, k);
assert.ok(!JSON.stringify(G).includes('const _sec = (() =>'), 'no copies of the count left');
for (const [t, f] of [['casora_mobile_sensor_chips', 'security_row'], ['casora_mobile_sensor_chips', 'rooms_row'],
  ['casora_mobile_sensor_chips', 'room_sub_security'], ['casora_room', 'badges'], ['casora_room', 'badges_security']]) {
  const cards = T[t].custom_fields[f].card.cards;
  const det = cards.filter((c) => c.template === 'casora_badge_security_detectors').map((c) => c.variables.kind);
  assert.deepEqual(det, ['smoke', 'water'], t + ' › ' + f + ': smoke and water rows');
  assert.ok(cards.some((c) => c.template === 'casora_badge_security_motion'), t + ' › ' + f);
}
assert.ok(!JSON.stringify(T.casora_mobile_sensor_chips).includes("casoraOnHomeView(this) ? 'home'"), 'phone room pages are rooms');
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'49-security-detectors'"), 'module loaded');

// ── Single badge (casora_badge_security): a smoke/water sensor is no door ──
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const sb = (field, e) => new Function('states', 'hass', 'variables', 'user', 'entity', body(field)).call({}, {}, hassOf({}), {}, null, e);
const smoke = { entity_id: 'binary_sensor.rauch_kueche', state: 'off', attributes: { device_class: 'smoke', friendly_name: 'Rauchmelder' } };
assert.match(sb(T.casora_badge_security.name, smoke), /badge-sub">Normal</);
assert.match(sb(T.casora_badge_security.name, { ...smoke, state: 'on' }), /badge-sub">Rauch</);
const leak = { entity_id: 'binary_sensor.leck_bad', state: 'off', attributes: { device_class: 'moisture', friendly_name: 'Leck' } };
assert.match(sb(T.casora_badge_security.name, leak), /badge-sub">Trocken</);
assert.match(sb(T.casora_badge_security.name, { ...leak, state: 'on' }), /badge-sub">Nass</);
assert.equal(sb(T.casora_badge_security.icon, smoke), 'mdi:smoke-detector-variant');
assert.equal(sb(T.casora_badge_security.icon, { ...leak, state: 'on' }), 'mdi:water-alert');
assert.ok(!/door/.test(sb(T.casora_badge_security.extra_styles, smoke)), 'no door glyph');

// ── Phrases ──
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json'));
for (const k of ['Rauch', 'Wasser', 'Bewegung', 'Rauch erkannt', 'Rauchmelder offline', 'Wassermelder offline', 'Gasmelder', 'Rauchmelder', 'Wassermelder', 'Normal', 'Trocken', 'Nass']) {
  assert.ok(en.exact[k], 'en phrase ' + k);
}
assert.ok(en.patterns.some(([p]) => p === '^(\\d+) Melder$'), 'en pattern „3 Melder“');
for (const w of ['Rauchmelder', 'Wassermelder']) assert.ok(en.patterns.some(([p]) => p === '^(\\d+) ' + w + ' offline$'), 'en pattern ' + w);
console.log('ok sicherheit_melder');
