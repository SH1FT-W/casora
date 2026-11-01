// @zustand: arbeit
// Load time (01.11.2026): the phone start page downloaded the day AND the night photo on every open,
// only to sample gradient colours from both (casora-core.js sampleWallpapers); one of them is never shown.
// Expected: (1) in dark mode only the night photo is requested and its palette is published,
// (2) switching the theme to light samples the day photo then (palette for the day appears).
import { open, dashboard, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with a phone counterpart', dash && dash.phone);

const m = await open({ width: 390, height: 844, mobile: true, dark: true });
const photos = [];
m.page.on('request', (r) => {
  const u = r.url();
  if (/\/casora_assets\/rooms\/|\/api\/casora\/photo\//.test(u)) photos.push(u.replace(/^https?:\/\/[^/]+/, '').replace(/[?&]authSig=[^&]*/, ''));
});
await dashboard(m.page, dash.phone.url, 3);

const vars = () => m.page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const url = (n) => { const x = cs.getPropertyValue(n).match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/); return x ? x[1].replace(/^https?:\/\/[^/]+/, '') : null; };
  return { day: url('--casora-mobile-hero-img-day'), night: url('--casora-mobile-hero-img-night'), now: url('--casora-mobile-hero-img'),
    dayPal: cs.getPropertyValue('--casora-sampled-day-handoff').trim(), nightPal: cs.getPropertyValue('--casora-sampled-night-handoff').trim() };
});
const path = (u) => (u || '').split('?')[0];
const asked = (u) => photos.some((p) => path(p) === path(u));

await m.page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--casora-sampled-night-handoff').trim(), null, { timeout: 15000 }).catch(() => {});
const a = await vars();
await need('start page photos for day and night', a.day && a.night && path(a.day) !== path(a.night), a);
await check('dark mode: the night photo is the one on screen', path(a.now) === path(a.night), a);
await check('dark mode: night palette published', !!a.nightPal, a);
await check('dark mode: the day photo is not downloaded', !asked(a.day), { ...a, photos });

// (2) Light mode: the day photo follows, sampled once it is on screen.
await m.page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('settheme', { detail: { dark: false } })));
await m.page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--casora-sampled-day-handoff').trim(), null, { timeout: 15000 }).catch(() => {});
const b = await vars();
await check('light mode: the day photo is on screen', path(b.now) === path(b.day), b);
await check('light mode: day palette published', !!b.dayPal, { ...b, photos });
await finish();
