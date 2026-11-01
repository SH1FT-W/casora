// Own order of the security badge's entries (security_sub_order, 01.11.2026): the Studio's "Order" list orders the
// badge's sub-line, its sub-badges (layout-card rows with casora_sec_order) and so its popup.
//   node dev/unit/security_sub_order.mjs
// Checks without a browser: casoraSecSub (00-finder.js), the sub-line with and without an order, the Studio's
// list (secSubPresent/secSubRows) and that every row of sub-badges in the templates carries the order.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
window.casoraIconUrl = (k) => '/i/' + k + '.svg';
const S = window.casoraSecSub;
assert.ok(S, 'casoraSecSub missing');

const states = {
  'alarm_control_panel.example': { state: 'disarmed', attributes: {} },
  'lock.example': { state: 'unlocked', attributes: {} },
  'camera.example': { state: 'idle', attributes: {} },
  'binary_sensor.front_door': { state: 'on', attributes: { device_class: 'door' } },
  'binary_sensor.kitchen_window': { state: 'on', attributes: { device_class: 'window' } },
  'binary_sensor.fenster_gruppe': { state: 'off', attributes: { entity_id: ['binary_sensor.kitchen_window'] } },
  'binary_sensor.smoke': { state: 'off', attributes: { device_class: 'smoke' } },
  'cover.garage': { state: 'open', attributes: { device_class: 'garage' } },
  'cover.living_blind': { state: 'open', attributes: { device_class: 'blind' } },
};

// ── Key of an entity ─────────────────────────────────────────────────────────
const K = (id) => S.keyOf(id, states);
assert.equal(K('alarm_control_panel.example'), 'alarm');
assert.equal(K('lock.example'), 'locks');
assert.equal(K('camera.example'), 'cameras');
assert.equal(K('binary_sensor.front_door'), 'doors');
assert.equal(K('binary_sensor.kitchen_window'), 'windows');
assert.equal(K('binary_sensor.fenster_gruppe'), 'windows', 'group helper: its member\'s class');
assert.equal(K('binary_sensor.smoke'), 'other');
assert.equal(K('cover.garage'), 'gates');
assert.equal(K('cover.living_blind'), 'covers');
assert.equal(K(null), null);

// ── Sort: stable, missing kinds after, unknown keys ignored, no order = same list ──
const L = ['a:doors', 'b:locks', 'c:windows', 'd:doors', 'e:cameras'];
const key = (x) => x.split(':')[1];
assert.equal(S.sort(L, null, key), L, 'no order: the very same list');
assert.equal(S.sort(L, [], key), L);
assert.equal(S.sort(L, ['nonsense'], key), L, 'only unknown keys: unchanged');
assert.deepEqual(S.sort(L, ['cameras', 'windows'], key), ['e:cameras', 'c:windows', 'a:doors', 'b:locks', 'd:doors']);
assert.deepEqual(S.sort(L, ['locks', 'bogus', 'doors', 'locks'], key), ['b:locks', 'a:doors', 'd:doors', 'c:windows', 'e:cameras']);

// ── Cards: only the security sub-badges move, among their own slots ─────────
const cards = [
  { template: 'casora_badge_security_group' },
  { template: 'casora_badge_lock_group' },
  { template: 'casora_badge_camera_group' },
  { template: 'casora_badge_security', entity: 'alarm_control_panel.example' },
  { template: 'casora_badge_climate_group' },
  { template: 'casora_badge_contact_group', variables: { contacts_kind: 'window' } },
  { template: ['casora_badge_security', 'casora_popup_contacts'], entity: 'binary_sensor.front_door' },
  { template: 'casora_badge_security_covers' },
];
assert.equal(S.cards(cards, undefined, states), cards);
const out = S.cards(cards, ['windows', 'doors', 'alarm', 'covers', 'locks', 'cameras'], states);
assert.equal(out[0], cards[0], 'group badge stays first');
assert.equal(out[4], cards[4], 'other badges keep their slot');
assert.deepEqual([1, 2, 3, 5, 6, 7].map((i) => S.keyOfCard(out[i], states)),
  ['windows', 'doors', 'alarm', 'covers', 'locks', 'cameras']);
assert.equal(S.keyOfCard({ template: 'casora_badge_temp' }, states), undefined);

// ── Sub-line: usual order without a list, the list's order with one ─────────
const sec = { triggered: false, disarmed: true, locks: 1, lockJammed: 0, lockDead: 1, doors: 2, windows: 1, doorsTilted: 0,
  windowsTilted: 0, gates: 0, covers: 0, camDead: 1, insecure: true, problem: true };
const sum = window.casoraSecuritySummary;
assert.equal(sum(sec, { summary: 'detailed' }).text,
  'Alarm aus · 2 Türen offen · Schloss offen · Fenster offen · Schloss offline · Kamera offline');
assert.equal(sum(sec, { summary: 'detailed', order: ['cameras', 'locks', 'windows'] }).text,
  'Kamera offline · Schloss offen · Schloss offline · Fenster offen · Alarm aus · 2 Türen offen');
const short = sum(sec, { summary: 'short', order: ['windows', 'doors'] }).html;
const icons = [...short.matchAll(/mask:url\('\/i\/([\w-]+)\.svg'\)/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) === i);
assert.deepEqual(icons, ['window-open', 'door-open', 'lock-open', 'lock', 'camera']);
assert.ok(/^<span class="cs-sum"[^>]*><span class="cs-sum-lead"/.test(short), 'the lead word stays first');

// ── Studio: kinds the badge has, list rows ───────────────────────────────────
const src = read('custom_components/casora/panel/casora-panel.js');
const grab = (re) => { const m = re.exec(src); assert.ok(m, 'not found: ' + re); return src.slice(m.index, src.indexOf('\n}\n', m.index) + 2); };
const one = (re) => { const m = re.exec(src); assert.ok(m, 'not found: ' + re); return m[0]; };
const studio = new Function(one(/^const SEC_SUB_LABEL = [^;]*;/ms) + grab(/^function secSubPresent\(/m) + grab(/^function secSubRows\(/m)
  + '\nreturn { secSubPresent, secSubRows, SEC_SUB_LABEL };')();
const V = { security_locks: ['lock.example'], security_cameras: ['camera.example'],
  security_entity_1: 'alarm_control_panel.example', security_entity_2: 'binary_sensor.kitchen_window' };
const present = studio.secSubPresent(V, states, [], false);
assert.deepEqual(present, ['alarm', 'locks', 'windows', 'cameras']);
assert.deepEqual(studio.secSubPresent(V, states, ['binary_sensor.front_door'], true), ['alarm', 'doors', 'locks', 'windows', 'covers', 'cameras']);
assert.deepEqual(studio.secSubRows(undefined, present), present);
assert.deepEqual(studio.secSubRows(['cameras', 'gates', 'locks'], present), ['cameras', 'locks', 'alarm', 'windows']);
S.KEYS.forEach((k) => assert.ok(studio.SEC_SUB_LABEL[k], 'label for ' + k));
assert.ok(/key: "security_sub_order", label: "Order", type: "suborder"/.test(src), 'field in the security section');

// ── Templates: every row of security sub-badges carries the order ────────────
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const rows = [['casora_room', 'badges'], ['casora_room', 'badges_security'], ['casora_mobile_sensor_chips', 'security_row'],
  ['casora_mobile_sensor_chips', 'rooms_row'], ['casora_mobile_sensor_chips', 'room_sub_security']];
for (const [t, f] of rows) {
  const card = T[t].custom_fields[f].card;
  assert.ok(/security_sub_order/.test(card.casora_sec_order || ''), t + '.' + f + ': casora_sec_order');
}
const groups = [T.casora_room.custom_fields.badges.card.cards[0], T.casora_mobile_filter_badges.custom_fields.badges.card.cards[0],
  T.casora_mobile_sensor_chips.custom_fields.rooms_row.card.cards[0]];
groups.forEach((c) => {
  assert.equal(c.template, 'casora_badge_security_group');
  assert.ok(/security_sub_order/.test(c.variables.sub_order || ''), 'group badge gets sub_order');
});
for (const t of ['casora_room', 'casora_mobile_sensor_chips', 'casora_mobile_filter_badges']) {
  assert.ok(Object.prototype.hasOwnProperty.call(T[t].variables, 'security_sub_order'), t + ' declares security_sub_order (phone mirror)');
}
assert.ok(/order: variables\.sub_order/.test(T.casora_badge_security_group.name), 'sub-line passes the order');

console.log('ok security_sub_order');
