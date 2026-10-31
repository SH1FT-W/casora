// Phone bar and room menu: Casora's own glyphs travel as data: URIs, so a cold start shows no empty
// circles while the SVG files load (Prüfung 2 DH-17, E24); scenes are a wand with sparkles, not the
// palette that read as "colours" (fam-18).
//   node dev/unit/phone_bar_glyphs.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/04-navigation.js', import.meta.url), 'utf8');
assert.match(src, /mk\('scenes', SFI \+ 'scenes-wand\.svg'/, 'scenes button: the wand');
assert.ok(!/mk\('scenes', 'mdi:palette/.test(src), 'no palette in the bar');
// _iconHtml as it runs in the page.
const a = src.indexOf('  var SFI ='), b = src.indexOf('  var css = function');
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
globalThis.window = { CASORA_ICONS: { kitchen: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E' } };
const m = /_iconHtml\(icon\) \{([\s\S]*?)\n    \}\n/.exec(src);
assert.ok(m, '_iconHtml found');
const ctx = new Function('esc', src.slice(a, b) + '\nreturn { INLINE: INLINE, SF_RATIO: SF_RATIO, iconHtml: function (icon) {' + m[1] + '} };')(esc);
for (const [icon, want] of [['/casora_assets/icons/rooms.svg?v=3', 'data:image/svg+xml'], ['/casora_assets/icons/scenes-wand.svg', 'data:image/svg+xml'],
  ['/casora_assets/icons/kitchen.svg', 'data:image/svg+xml']]) {
  const h = ctx.iconHtml(icon);
  assert.ok(h.includes(want) && !h.includes('/casora_assets/'), icon + ' → inline: ' + h.slice(0, 120));
}
assert.ok(ctx.iconHtml('/casora_assets/icons/unknown-thing.svg').includes("url('/casora_assets/icons/unknown-thing.svg')"), 'unknown names still load the file');
assert.ok(ctx.iconHtml('mdi:door').includes('<ha-icon icon="mdi:door">'), 'mdi stays ha-icon');
console.log('phone_bar_glyphs: ok');
