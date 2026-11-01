// „Alle (n)“ moon (owner, 01.11.2026, vacuum screenshot): instead of a sub page a small menu at the moon – rows with
// symbol and word, the chosen one hinterlegt, a tap picks and closes, a tap beside it or Esc closes; on the phone it
// stays inside the window. For every „Alle (n)“ moon of the dial (vacuum modes, alarm modes, scenes, programs …).
// The rows click hidden proxies inside the moon that carry the items' own attributes, so services, the alarm code and
// pages keep running through the existing handlers.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const cut = (start, end) => { const i = core.indexOf(start); assert.ok(i >= 0, start); const j = core.indexOf(end, i); assert.ok(j > i, end); return core.slice(i, j); };
const src = cut('  // Positions of the moons (degrees', '  // The rings. ring = ');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const win = {};
const { moons } = new Function('window', 'esc', 'dRound', 'stGlyph', 'stAttrs', 'T_', src + '\nreturn { moons };')(
  win, esc, (x) => Math.round(x * 10) / 10, (n, c) => '<i class="' + c + '" data-g="' + esc(n) + '"></i>',
  (a) => Object.keys(a || {}).map((k) => ' ' + k + '="' + esc(a[k]) + '"').join(''), (x) => x);
assert.ok(win._casoraMoonMenu && typeof win._casoraMoonMenu.open === 'function', 'menu API');

const svc = (o) => ({ domain: 'vacuum', service: 'set_fan_speed', data: { fan_speed: o }, target: { entity_id: 'vacuum.robot' } });
const items = ['Smart', 'Saugen', 'Saugen & wischen', 'Wischen', 'Intensiv'].map((t, i) => ({ icon: 'mdi:robot-vacuum', text: t, active: t === 'Wischen', svc: svc(t),
  attrs: i === 4 ? { 'data-x': 'y' } : null }));
const m = moons(items, null, { page: 'vacModes|vacuum.robot' });
const moonsHtml = m.html.split('<div class="hui-moon').slice(1);
assert.equal(moonsHtml.length, 4, '3 moons + „Alle (5)“');
const all = moonsHtml[3];
assert.ok(/aria-label="Alle \(5\)"/.test(all), 'Alle (5)');
assert.ok(/data-casora-moonmenu=""/.test(all) && /aria-haspopup="menu"/.test(all), 'opens a menu');
assert.ok(!/ data-casora-page="vacModes/.test(all.split('hui-mm-src')[0]), 'the moon itself is no page link');
assert.ok(/data-casora-mm-page="vacModes\|vacuum\.robot"/.test(all), 'the page stays as the fallback');
assert.ok(/^ on/.test(all), 'a chosen hidden mode (Wischen) marks the moon');
const rows = JSON.parse(all.match(/data-casora-mm="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
assert.deepEqual(rows.map((r) => r.text), ['Smart', 'Saugen', 'Saugen & wischen', 'Wischen', 'Intensiv'], 'every choice in the menu, full names');
assert.deepEqual(rows.map((r) => r.on), [false, false, false, true, false], 'the chosen row');
// Proxies: one per row with the item's own service and attributes, hidden.
assert.ok(/<div class="hui-mm-src" style="display:none !important;">/.test(all), 'proxies hidden');
for (let k = 0; k < 5; k++) assert.ok(new RegExp('<i data-casora-mm-i="' + k + '" data-casora-svc="').test(all), 'proxy ' + k);
assert.ok(/data-casora-mm-i="4"[^>]*data-x="y"/.test(all), 'proxy keeps the item attributes (alarm: data-casora-alarm after the swap)');
// Four or fewer: plain moons, no menu.
assert.ok(!/moonmenu/.test(moons(items.slice(0, 4), null, {}).html), 'no menu up to 4');

// The click handler opens the menu before pages; the menu closes on Esc / the veil, stays in the window, hinterlegt.
assert.ok(/t\.dataset\.casoraMoonmenu !== undefined[\s\S]{0,400}_casoraMoonMenu\.open\(t, ev\.detail === 0\)/.test(core), 'fire() opens the menu');
assert.ok(core.indexOf('t.dataset.casoraMoonmenu !== undefined') < core.indexOf('if (t && t.dataset && t.dataset.casoraPage) {'), 'menu before the page handler');
assert.ok(/ev\.key === 'Escape'/.test(src) && /\.veil'\)\.addEventListener\('click'/.test(src), 'Esc and a tap beside close');
assert.ok(/var W = window\.innerWidth, H = window\.innerHeight, b = \{ left: 8, top: 8, right: W - 8, bottom: H - 8 \}/.test(src) && /max-width:min\(280px, calc\(100vw - 16px\)\)/.test(src), 'inside the window');
assert.ok(/\.row\.on\{background:var\(--casora-soft-row-active/.test(src) && !/mdi:check/.test(src), 'chosen row hinterlegt, no check mark');
assert.ok(/px\.click\(\)/.test(src), 'a row clicks its proxy');
// Rows like every Casora menu (design-regeln §0): 52 high, circle 36, pill 26, pane 34 (26 + 8 concentric).
assert.ok(/\.row\{[^}]*min-height:var\(--casora-menu-row-h, 52px\)[^}]*border-radius:var\(--casora-menu-row-radius, 26px\)/.test(src), 'menu row 52 / 26');
assert.ok(/\.ic\{[^}]*width:var\(--casora-ic-row, 36px\)/.test(src), 'circle 36');
assert.ok(/border-radius:var\(--casora-menu-radius, 34px\)/.test(src), 'pane 34');
console.log('moon_menu: ok');

// Placement (desktop, 01.11.2026: a long effects list opened upwards over the popup title): the menu stays inside
// the popup below its head – below the moon, else above, else the larger side with a limited height that scrolls.
{
  const place = win._casoraMoonMenu.place;
  assert.equal(typeof place, 'function', 'place API');
  const b = { left: 100, top: 160, right: 700, bottom: 900 }; // surface less 8, top = below the head
  const moon = (top) => ({ left: 380, width: 76, top, bottom: top + 76 });
  // Room below: opens below.
  let p = place(moon(300), 240, 400, b);
  assert.ok(p.below && p.top === 384 && !p.maxH, 'below when it fits');
  // Moon low, room above: opens above, never above the head.
  p = place(moon(760), 240, 400, b);
  assert.ok(!p.below && p.top === 752 - 400 && p.top >= b.top && !p.maxH, 'above when it fits');
  // Long list (16 effects, 52 each): neither side fits – the larger side, limited, inside the bounds.
  p = place(moon(560), 240, 16 * 52 + 16, b);
  assert.ok(!p.below && p.top === b.top && p.maxH === 560 - 8 - b.top, 'above side limited, starts below the head');
  assert.ok(p.top + p.maxH <= 560 - 8, 'does not cover the moon');
  p = place(moon(300), 240, 16 * 52 + 16, b);
  assert.ok(p.below && p.top === 384 && p.maxH === 900 - 384 && p.top + p.maxH <= b.bottom, 'below side limited');
  // Horizontally inside the popup.
  p = place({ left: 640, width: 76, top: 300, bottom: 376 }, 240, 200, b);
  assert.ok(p.left + 240 <= b.right && p.left >= b.left, 'inside left/right');
}
console.log('moon_menu placement ok');
