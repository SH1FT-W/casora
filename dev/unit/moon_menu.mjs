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
assert.ok(/Math\.max\(8, Math\.min\(W - pw - 8,/.test(src) && /max-width:min\(280px, calc\(100vw - 16px\)\)/.test(src), 'inside the window');
assert.ok(/\.row\.on\{background:var\(--casora-soft-row-active/.test(src) && !/mdi:check/.test(src), 'chosen row hinterlegt, no check mark');
assert.ok(/px\.click\(\)/.test(src), 'a row clicks its proxy');
// Rows like every Casora menu (design-regeln §0): 52 high, circle 36, pill 26, pane 34 (26 + 8 concentric).
assert.ok(/\.row\{[^}]*min-height:var\(--casora-menu-row-h, 52px\)[^}]*border-radius:var\(--casora-menu-row-radius, 26px\)/.test(src), 'menu row 52 / 26');
assert.ok(/\.ic\{[^}]*width:var\(--casora-ic-row, 36px\)/.test(src), 'circle 36');
assert.ok(/border-radius:var\(--casora-menu-radius, 34px\)/.test(src), 'pane 34');
console.log('moon_menu: ok');
