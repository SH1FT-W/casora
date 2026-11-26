// Test round 26.11.2026 (d01-01): tiles, badges and the bell drew a white symbol on orange and yellow, popups the dark
// one (inkOn) – the same lock looked different on the tile and in its popup. Decision 26.11.2026: dark on orange and
// yellow everywhere. Tiles and badges now pick the symbol from their circle's colour with the inkOn rule (white where it
// keeps 3 : 1, else the dark glyph), the bell keeps orange (notify_icon_white.mjs).
//   node dev/unit/glyph_on_light_colours.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_entity,casora_badge_base,casora_lock,casora_badge_light_group,casora_badge_lock_group,casora_scene_core
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;

// The relative-colour formula as a browser evaluates it: r g b of the circle → the symbol's colour.
const evalRel = (expr, rgb) => {
  const js = expr.replace(/\bpow\(/g, 'Math.pow(').replace(/\bclamp\(/g, 'cl(').replace(/\bcalc\(/g, '(')
    .replace(/\balpha\b/g, rgb.length > 3 ? rgb[3] : 1)
    .replace(/\br\b/g, rgb[0]).replace(/\bg\b/g, rgb[1]).replace(/\bb\b/g, rgb[2]);
  return new Function('cl', 'return ' + js)((lo, v, hi) => Math.min(hi, Math.max(lo, v)));
};
const channels = (css, prop) => {
  const i = css.indexOf(prop + ':');
  assert.ok(i > 0, prop + ' defined');
  const from = css.indexOf('rgb(from ', i);
  // After the source colour (balanced parentheses) come the four channel expressions.
  let p = from + 'rgb(from '.length, depth = 0;
  for (; p < css.length; p++) { const c = css[p]; if (c === '(') depth++; else if (c === ')') depth--; else if (c === ' ' && depth === 0) break; }
  const parts = []; let cur = '', d = 0;
  for (let q = p; q < css.length; q++) {
    const c = css[q];
    if (c === '(') d++;
    if (c === ')') { if (d === 0) break; d--; }
    if ((c === ' ' || c === '\n') && d === 0) { if (cur.trim()) parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur.trim());
  const ch = parts.filter((x) => x !== '/');
  assert.equal(ch.length, 4, 'r g b / alpha');
  return (rgb) => ch.map((e) => evalRel(e, rgb));
};
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.slice(1 + i, 3 + i), 16));
const lum = (rgb) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
const inkOnIsDark = (rgb) => 1.05 / (lum(rgb) + 0.05) < 3;
const isDark = (c) => Math.round(c[0]) === 46 && Math.round(c[1]) === 34 && Math.round(c[2]) === 20 && Math.abs(c[3] - 0.88) < 1e-6;
const isWhite = (c) => c.slice(0, 3).every((x) => Math.round(x) === 255) && Math.abs(c[3] - 1) < 1e-6;

// Casora (Weich) colours: orange and yellow dark, teal/red/blue/pink white – the same answer as inkOn.
const colours = { orange: '#DE8A4E', yellow: '#E8B04A', yellowBright: '#FFCC00', teal: '#4E9E95', red: '#D35A4E', blue: '#5B8FC9', pink: '#D9708A' };
const check = (name, ink) => {
  for (const [k, h] of Object.entries(colours)) {
    const c = ink(hex(h));
    assert.ok(inkOnIsDark(hex(h)) ? isDark(c) : isWhite(c), name + ' ' + k + ': ' + c.map((x) => +x.toFixed(2)).join(' '));
  }
  assert.ok(isDark(ink(hex(colours.orange))) && isDark(ink(hex(colours.yellow))), name + ': dark on orange and yellow');
  assert.ok(isWhite(ink(hex(colours.teal))), name + ': white on teal');
};

// Tiles (casora_entity): the picture's shadow in the ink, the picture itself shifted out of the clipped circle.
const es = T.casora_entity.extra_styles;
check('tile', channels(es, '--casora-tile-glyph-filter'));
assert.match(es, /--casora-tile-glyph-filter: drop-shadow\(160px 0 0 rgb\(from var\(--casora-tile-glyph-ground/);
assert.match(es, /--casora-tile-glyph-shift: -160px 0;/);
// Fix round 26.11.2026: the source is the colour the circle is really painted in. A translucent circle (the dark themes'
// circle token, Casora Farbe's white chip, the camera's circle over its picture) keeps the white symbol: rgb(from …)
// alone dropped the alpha and turned a 0.08 white into a light circle with a dark symbol.
const tileInk = channels(es, '--casora-tile-glyph-filter');
for (const a of [[255, 240, 220, 0.08], [255, 229, 220, 0.08], [255, 255, 255, 0.28], [0, 0, 0, 0.2]]) {
  assert.ok(isWhite(tileInk(a)), 'tile: white on the translucent circle ' + a.join(','));
}
assert.ok(isDark(tileInk([...hex(colours.yellow), 1])), 'tile: dark on an opaque yellow circle');
assert.match(es, /rgb\(from var\(--casora-tile-glyph-ground, color-mix\(in srgb, var\(--casora-icon-color-current, var\(--casora-icon-circle-bg, #8E8E93\)\) var\(--casora-tile-tone-share, 0%\), var\(--casora-icon-circle-bg, #8E8E93\)\)\)/,
  'ground: the device colour where the tile is toned (Casora Farbe: chip over the device colour, like inkOn in the popup), else the circle');
assert.match(es, /@supports \(color: rgb\(from red r g b\)\)/, 'only where relative colours work, else white as before');
assert.match(es, /img\[src\^="data:image\/svg"\]:not\(\[src\*="%3Cstyle"\]\)/, 'only single-colour Casora icons');
// Every active state that cancels the picture filter puts the two in (filter and shift always together).
let n = 0;
for (const [k, v] of Object.entries(T)) {
  for (const st of [v.styles, ...(v.state || []).map((s) => s.styles)]) {
    const ep = st && st.entity_picture;
    if (!Array.isArray(ep)) continue;
    const f = ep.find((o) => 'filter' in o), tr = ep.find((o) => 'translate' in o);
    if (f && f.filter === 'none !important') assert.fail(k + ': picture filter none instead of the glyph filter');
    if (f && /casora-tile-glyph-filter/.test(f.filter)) { n++; assert.ok(tr && /casora-tile-glyph-shift/.test(tr.translate), k + ': shift with the filter'); }
    if (tr && /casora-tile-glyph-shift/.test(tr.translate)) assert.ok(f && /casora-tile-glyph-filter/.test(f.filter), k + ': filter with the shift');
    // The glyph reads the colour the circle is painted in: a state that paints the circle inline names the same colour
    // as the ground; one whose circle is neither inline nor --casora-icon-circle-bg on the card names the circle token.
    if (f && /casora-tile-glyph-filter/.test(f.filter)) {
      const kv = (l) => Object.assign({}, ...(Array.isArray(l) ? l : []).filter((o) => o && typeof o === 'object'));
      const ic = kv(st.img_cell), card = kv(st.card);
      const bg = ic.background ?? ic['background-color'];
      if (bg != null) assert.equal(ic['--casora-tile-glyph-ground'], bg, k + ': ground = the inline circle colour');
      else if (!('--casora-icon-circle-bg' in card)) assert.equal(ic['--casora-tile-glyph-ground'], 'var(--casora-icon-circle-bg)', k + ': ground = the circle token');
    }
  }
}
assert.ok(n >= 30, 'active states of the tiles (' + n + ')');
const lockOn = T.casora_lock.state.find((s) => s.styles && s.styles.entity_picture);
assert.ok(lockOn.styles.entity_picture.some((o) => /casora-tile-glyph-filter/.test(o.filter || '')), 'lock tile (the report)');

// Badges: the on state's glyph (--casora-badge-glyph „initial“) falls back to the circle's ink.
const bs = T.casora_badge_base.extra_styles;
check('badge', channels(bs, '--casora-badge-on-glyph'));
const all = JSON.stringify(T);
assert.ok(!all.includes('var(--casora-badge-glyph, #fff)'), 'no badge glyph falls back to plain white');
assert.ok(all.includes('var(--casora-badge-glyph, var(--casora-badge-on-glyph, #fff))'));
// Scene pills and scene tiles: the symbol in the circle through inkOn as well (white on yellow before).
const sc = JSON.stringify(T.casora_scene_core);
assert.ok(sc.includes("const onInk = (window._casoraInkOn && window._casoraInkOn(tint)) || '#ffffff';"), 'scene: inkOn on the scene colour');
assert.ok(sc.includes("const ink = 'color-mix(in srgb, ' + onInk + ' ' + _ring + ', ' + tint + ')';"), 'scene: ink in the circle');
console.log('glyph_on_light_colours: ok');
