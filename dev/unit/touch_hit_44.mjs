// Touch targets 44 px (V1, 14.11.2026): on touch the phone badges (40), the bell's „Alles gelesen“/„Alle entfernen“
// (32), the tablet page dots (18) and the room bar arrows (30) reach 44 to a finger; only (pointer: coarse), the mouse
// keeps the old sizes. Static guard for the rules; the measurement in a browser is dev/qa/regress/r768_tippen_44_touch.mjs.
//   node dev/unit/touch_hit_44.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const row = read('custom_components/casora/scripts/smart-row.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const flat = (s) => s.replace(/\s+/g, ' ');

// Bell actions: invisible 6 px rim above and below the 32 px pill, touch only.
assert.match(core, /@media \(pointer:coarse\)\{' \+ W \+ '\.casora-notify-read\{position:relative;\}'\s*\+\s*W \+ '\.casora-notify-read::before\{content:"";position:absolute;inset:-6px 0;/, 'bell pills: 44 on touch');
// Room bar arrows: invisible 7 px rim, touch only.
assert.match(flat(core), /@media \(pointer: coarse\) \{ \.bar\.paged \.scroller \.more::after \{ content: ""; position: absolute; inset: -7px;/, 'room bar arrows: 44 on touch');
// Page dots: 44 × 44 on touch, 18 with a mouse.
assert.match(flat(row), /#dots > button \{ width: 18px; height: 18px;/, 'dots stay 18 with a mouse');
assert.match(flat(row), /@media \(pointer: coarse\) \{ #dots \{ gap: 0; \} #dots > button, #dots > button\.on \{ width: 44px; height: 44px; margin: -2px 0; \} \}/, 'dots 44 on touch');

// Phone badges: the hit layer fills the badge plus --casora-badge-hit-top above it; only the phone rows set it, on touch.
const base = T.casora_badge_base;
assert.ok(base.custom_fields.hit, 'badge hit layer');
const hit = Object.assign({}, ...base.styles.custom_fields.hit);
assert.equal(hit.display, 'var(--casora-badge-hit-display, none)', 'hit layer off unless a row turns it on');
assert.match(base.extra_styles, /#hit\{ grid-area: auto !important; \}/, 'hit layer spans the card, not its own grid cell');
assert.equal(hit.top, 'calc(-1 * var(--casora-badge-hit-top, 0px))');
assert.ok(base.styles.card.some((d) => d.overflow === 'var(--casora-badge-hit-overflow, hidden)'), 'card clips unless the row says otherwise');
for (const k of ['casora_mobile_filter_badges', 'casora_mobile_sensor_chips']) {
  assert.match(flat(T[k].extra_styles), /@media \(pointer: coarse\) \{ :host \{ --casora-badge-hit-top: 4px; --casora-badge-hit-display: block; --casora-badge-hit-overflow: visible; \} \}/, k + ': sets the hit layer on touch');
  for (const [f, v] of Object.entries(T[k].styles.custom_fields)) {
    if (!Array.isArray(v) || !v.some((d) => d['overflow-x'] === 'auto')) continue;
    const o = Object.assign({}, ...v);
    assert.equal(o['padding-top'], 'var(--casora-badge-hit-top, 0px) !important', `${k}.${f}: room for the hit layer`);
    assert.equal(o['margin-top'], 'calc(-1 * var(--casora-badge-hit-top, 0px)) !important', `${k}.${f}: layout unchanged`);
  }
}
console.log('touch_hit_44: ok');
