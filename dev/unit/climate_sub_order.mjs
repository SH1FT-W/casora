// Own order of the climate badge's entries (climate_sub_order, 01.11.2026): the Studio's "Order" list orders the
// badge's sub-badges (layout-card rows with casora_clim_order: expanded row, separate badges, phone rows) and so its
// popup. Without one everything stays as before (temperature, humidity, air quality, blinds).
//   node dev/unit/climate_sub_order.mjs
// Checks without a browser: casoraClimSub (00-finder.js, shared with casoraSecSub), the layout-card hook, the
// popup's row order (35-phone-hub.js source), the Studio's list (climSubPresent) and the template rows.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
class FakeLayoutCard { setConfig(cfg) { this.cfg = cfg; } }
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: (n) => (n === 'layout-card' ? FakeLayoutCard : null) };
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
const C = window.casoraClimSub;
assert.ok(C, 'casoraClimSub missing');
assert.equal(typeof window.casoraSubOrder, 'function', 'shared factory');
assert.deepEqual(C.KEYS, ['temp', 'humidity', 'quality', 'covers']);

// ── Keys of the sub-badge cards ───────────────────────────────────────────────
const temp = { template: 'casora_badge_temp' }, hum = { template: 'casora_badge_humidity' };
const aq = { template: 'casora_badge_air_quality' }, cov = { type: 'custom:button-card', template: 'casora_badge_climate_covers' };
assert.equal(C.keyOfCard(temp), 'temp');
assert.equal(C.keyOfCard(hum), 'humidity');
assert.equal(C.keyOfCard(aq), 'quality');
assert.equal(C.keyOfCard(cov), 'covers');
assert.equal(C.keyOfCard({ template: 'casora_badge_lock_group' }), undefined, 'security badge is no climate entry');
assert.equal(window.casoraSecSub.keyOfCard(temp, {}), undefined, 'climate badge is no security entry');

// ── Cards: no order = the usual (today's) order, the list's order with one ────
const row = [temp, hum, aq, cov];
assert.deepEqual(C.cards(row, undefined, {}), row, 'no order: as today');
assert.deepEqual(C.cards(row, [], {}), row);
assert.deepEqual(C.cards(row, ['bogus'], {}), row);
assert.deepEqual(C.cards(row, ['covers', 'quality'], {}), [cov, aq, temp, hum], 'missing kinds follow in the usual order');
// A mixed row (separate badges next to the security ones): only the climate badges move among their slots.
const mixed = [{ template: 'casora_badge_security_group' }, { template: 'casora_badge_climate_group' }, temp, hum, aq,
  { template: 'casora_badge_light_group' }];
const m = C.cards(mixed, ['quality', 'humidity', 'temp'], {});
assert.deepEqual(m, [mixed[0], mixed[1], aq, hum, temp, mixed[5]]);

// ── layout-card hook: both orders on one row, the used order stays on the element ──
const lc = new FakeLayoutCard();
lc.setConfig({ type: 'custom:layout-card', casora_clim_order: ['humidity'], casora_sec_order: null,
  cards: [{ template: 'casora_badge_lock_group' }, { template: 'casora_badge_security', entity: 'alarm_control_panel.x' }, temp, hum] });
assert.deepEqual(lc.cfg.cards.map((c) => c.template), ['casora_badge_security', 'casora_badge_lock_group', 'casora_badge_humidity', 'casora_badge_temp']);
assert.deepEqual(lc.__casoraSubOrder.casora_clim_order, ['humidity']);
const plain = new FakeLayoutCard();
const plainCards = [hum, temp];
plain.setConfig({ cards: plainCards });
assert.equal(plain.cfg.cards, plainCards, 'a row without an order property is left alone');

// ── Popup (35-phone-hub.js): climate rows follow the row's order, the extra blinds row included ──
const hub = read('custom_components/casora/scripts/local/35-phone-hub.js');
assert.ok(/rowOrder\[cat\] = \(lc && lc\.__casoraSubOrder\)/.test(hub), 'popup reads the row\'s order');
assert.ok(/CS\.sort\(list, CS\.clean\(o\)\.length \? o : CS\.KEYS, climKey\)/.test(hub), 'popup sorts climate rows');
assert.ok(!/„Jalousien“ last in the overview, as in the sub-row/.test(hub), 'no fixed blinds-last move any more');
const climKey = (c) => (c.blinds ? 'covers' : C.keyOfCard({ template: (c.tpl || '').split(',') }));
const chips = [{ tpl: 'casora_badge_temp' }, { tpl: 'casora_badge_air_quality' }, { blinds: ['cover.a'] }];
assert.deepEqual(C.sort(chips, C.KEYS, climKey), chips, 'usual: blinds last');
assert.deepEqual(C.sort(chips, ['covers', 'quality'], climKey).map(climKey), ['covers', 'quality', 'temp']);

// ── Studio: kinds the badge has, field in the climate section, preview sorts ──
const src = read('custom_components/casora/panel/casora-panel.js');
const grab = (re) => { const mm = re.exec(src); assert.ok(mm, 'not found: ' + re); return src.slice(mm.index, src.indexOf('\n}\n', mm.index) + 2); };
const one = (re) => { const mm = re.exec(src); assert.ok(mm, 'not found: ' + re); return mm[0]; };
const studio = new Function(one(/^const CLIM_SUB_LABEL = [^;]*;/ms) + grab(/^function climSubPresent\(/m) + grab(/^function secSubRows\(/m)
  + '\nreturn { climSubPresent, secSubRows, CLIM_SUB_LABEL };')();
assert.deepEqual(studio.climSubPresent({ temp_sensor_2: 'sensor.t', quality_sensor: 'sensor.q' }, false), ['temp', 'quality']);
assert.deepEqual(studio.climSubPresent({ temp_sensor_1: 'sensor.t', humidity_sensor_3: 'sensor.h', quality_sensor: 'sensor.q' }, true),
  ['temp', 'humidity', 'quality', 'covers']);
assert.deepEqual(studio.climSubPresent({ humidity_sensor: 'sensor.h' }, false), ['humidity']);
assert.deepEqual(studio.secSubRows(['covers', 'temp'], ['temp', 'humidity', 'covers']), ['covers', 'temp', 'humidity']);
C.KEYS.forEach((k) => assert.ok(studio.CLIM_SUB_LABEL[k], 'label for ' + k));
assert.ok(/key: "climate_sub_order", label: "Order", type: "suborder", sub: "climate"/.test(src), 'field in the climate section');
assert.ok(/CS\.sort\(subs, V\.climate_sub_order, \(x\) => x\.climKey\)/.test(src), 'preview sorts the climate sub-badges');

// ── Templates: every row of climate sub-badges carries the order ──────────────
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const rows = [['casora_room', 'badges'], ['casora_room', 'badges_climate'], ['casora_mobile_sensor_chips', 'climate_row'],
  ['casora_mobile_sensor_chips', 'rooms_row'], ['casora_mobile_sensor_chips', 'room_sub_climate']];
for (const [t, f] of rows) {
  const card = T[t].custom_fields[f].card;
  assert.ok(/climate_sub_order/.test(card.casora_clim_order || ''), t + '.' + f + ': casora_clim_order');
  // Today's template order is the usual order: without a setting nothing moves.
  const keys = card.cards.map((c) => C.keyOfCard(c)).filter((k) => k !== undefined);
  assert.deepEqual(keys, C.KEYS.filter((k) => keys.includes(k)), t + '.' + f + ': template order = KEYS');
}
for (const t of ['casora_room', 'casora_mobile_sensor_chips', 'casora_mobile_filter_badges']) {
  assert.ok(Object.prototype.hasOwnProperty.call(T[t].variables, 'climate_sub_order'), t + ' declares climate_sub_order (phone mirror)');
}

console.log('ok climate_sub_order');
