// The phone start page paints a demo photo until the theme defines --casora-mobile-hero-img (a moment after the first
// paint). That fallback was the day photo, so dark mode downloaded the day photo now and then (gate r453, 11.11.2026).
// The fallback follows the colour scheme: the night photo in dark mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const m = src.match(/function heroFallback\(\)[\s\S]*?\n  }\n/);
assert.ok(m, 'casora-core.js has heroFallback()');
assert.ok(/var\(--casora-mobile-hero-img, '\s*\+\s*heroFallback\(\)/.test(src) || /var\(--casora-mobile-hero-img, \$\{heroFallback\(\)\}/.test(src),
  'the hero image falls back to heroFallback(), not to a fixed photo');
assert.ok(!/var\(--casora-mobile-hero-img, url\(/.test(src), 'no fixed fallback photo left');
const pick = (dark) => vm.runInNewContext(m[0] + '; heroFallback()', { window: { matchMedia: (q) => ({ matches: dark && /dark/.test(q) }) } });
assert.match(pick(true), /home-demo-night\.jpg/, 'dark mode: night photo');
assert.match(pick(false), /home-demo\.jpg/, 'light mode: day photo');
assert.doesNotMatch(pick(false), /night/, 'light mode: not the night photo');
console.log('ok hero_fallback_photo');
