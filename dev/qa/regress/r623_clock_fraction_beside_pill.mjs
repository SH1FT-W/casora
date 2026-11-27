// @zustand: arbeit
// @parallel: ja
// @deckt: custom_components/casora/scripts/local/01-basis.js#_casoraPillLeft,_casoraClockRight,_casoraPillPlace,_casoraTimeGuard
// d05-09 follow-up (r932 red at midday, green the evening before): on a portrait tablet the room pill is placed
// 12 px after the clock's right edge, rounded to whole pixels, while the clock guard hides the clock when its edge
// plus 12 px passes the pill. A clock text ending at a fraction below .5 rounded the pill 0.x px too close, so the
// clock vanished, depending on the digits of the time. Expected: for every fractional right edge the clock stays
// visible and the pill starts at least 12 px after it.
import { open, dashboard, casoraDashboards, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('a Casora dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 834, height: 1194, dark: true, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
await page.waitForTimeout(2500);

for (const frac of [0.1, 0.3, 0.45, 0.6, 0.9]) {
  const m = await page.evaluate(async (frac) => {
    const time = window.__pierce('#time').find((e) => e.getBoundingClientRect().width > 0);
    if (!time) return { noClock: true };
    // Shift the clock's right edge to <whole px> + frac, as different digits of the time do.
    time.style.paddingRight = '0px';
    const base = time.getBoundingClientRect().right;
    time.style.paddingRight = (Math.ceil(base) - base + frac) + 'px';
    time.style.visibility = '';
    await new Promise((r) => setTimeout(r, 2000));   // clock guard (700 ms) and pill placement (400 ms) settle
    const host = window.__pierce('casora-nav-bar').find((b) => b.isConnected);
    const bar = host && host.shadowRoot && host.shadowRoot.querySelector('.bar');
    const t = time.getBoundingClientRect(), b = bar && bar.getBoundingClientRect();
    return { visible: getComputedStyle(time).visibility !== 'hidden', right: t.right, barLeft: b ? b.left : null };
  }, frac);
  await need('the clock in the top row', !m.noClock, m);
  await check(`clock edge at .${String(frac).slice(2)} px: clock visible`, m.visible, m);
  await check(`clock edge at .${String(frac).slice(2)} px: pill starts 12 px after the clock`,
    m.barLeft != null && m.barLeft >= m.right + 12, m);
}
await finish();
