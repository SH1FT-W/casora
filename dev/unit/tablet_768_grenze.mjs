// Prüfrunde d05-01: at exactly 768 px (classic iPad portrait, desktop browser) the desktop dashboard had neither
// the room bar nor the phone bar, and the clock stood in the middle of the page: the phone redirect ends at
// max-width 767px, but the room bar, clock, player and menu rules started at min-width 769px. Expected: the
// desktop rules start where the redirect ends (768 px), no gap.
//   node dev/unit/tablet_768_grenze.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_room custom_components/casora/scripts/local/01-basis.js custom_components/casora/scripts/casora-redirect.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const redirect = read('custom_components/casora/scripts/casora-redirect.js');
const m = /matchMedia\('\(max-width: (\d+)px\)/.exec(redirect);
assert.ok(m, 'redirect breakpoint found');
const phoneMax = Number(m[1]);
assert.equal(phoneMax, 767);

const tpl = read('dashboards/casora/button_card_templates.json');
const basis = read('custom_components/casora/scripts/local/01-basis.js');
for (const [name, src] of [['templates', tpl], ['01-basis.js', basis]]) {
  const mins = [...src.matchAll(/min-width: *(\d+)px/g)].map((x) => Number(x[1])).filter((n) => n > phoneMax && n < phoneMax + 8);
  for (const n of mins) assert.equal(n, phoneMax + 1, `${name}: desktop rule at min-width ${n}px leaves a gap after the redirect (${phoneMax}px)`);
}
// The room bar's own condition in particular.
const T = JSON.parse(tpl);
const conds = [];
(function walk(o) {
  if (!o || typeof o !== 'object') return;
  if (o.type === 'conditional' && o.card && o.card.type === 'custom:casora-nav') conds.push(...(o.conditions || []));
  Object.values(o).forEach(walk);
})(T);
assert.ok(conds.length, 'room bar condition found');
for (const c of conds) assert.ok(/min-width: 768px/.test(c.media_query || ''), 'room bar from 768 px: ' + c.media_query);
console.log('tablet_768_grenze: ok');
