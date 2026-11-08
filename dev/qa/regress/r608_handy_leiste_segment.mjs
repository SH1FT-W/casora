// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/04-navigation.js
// Phone bar A: Home, Rooms and Scenes are one segment with a sliding marker, the tools behind it are flat symbols, the
// active button stays nameless, and the bar stays inside a narrow phone's screen.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora dashboard with a phone twin', d && d.phone, d && d.url);
for (const [w, dark] of [[393, false], [393, true], [360, false], [344, false]]) {
  const tag = w + (dark ? ' dark' : ' light');
  const { page } = await open({ width: w, height: 800, mobile: true, touch: true, safari: true, scale: 2, dark, theme: 'Casora' });
  usePage(page);
  await dashboard(page, d.phone.url, 3);
  await page.waitForFunction(() => !!document.querySelector('.hmn-bar.hmn-act .hmn-dock button-card'), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const read = () => page.evaluate(() => {
    const bar = document.querySelector('.hmn-bar'), pill = bar.querySelector('.hmn-pill'), on = bar.querySelector('.hmn-btn.on');
    const R = (e) => e.getBoundingClientRect();
    const card = bar.querySelector('.hmn-dock button-card');
    const slot = ['bell', 'edit', 'assist'].map((k) => card.shadowRoot.getElementById(k)).find((e) => e && R(e).width > 0);
    const tool = slot && slot.querySelector('button-card').shadowRoot.querySelector('ha-card');
    return { inSeg: bar.querySelectorAll('.hmn-seg .hmn-btn').length, pillX: R(pill).left, onX: on ? R(on).left : null, onK: on && on.dataset.k,
      name: on ? getComputedStyle(on.querySelector('span:not(.hmn-bic)')).display : null, sep: getComputedStyle(bar.querySelector('.hmn-sep')).display,
      toolBg: tool ? getComputedStyle(tool).backgroundColor : null, barL: R(bar).left, barR: R(bar).right, vw: innerWidth };
  });
  const a = await read();
  await check(tag + ': three destinations in one segment', a.inSeg === 3, a);
  await check(tag + ': the marker sits on the active button', a.onX != null && Math.abs(a.pillX - a.onX) < 1.5, a);
  await check(tag + ': the active button has no name', a.name === 'none', a.name);
  await check(tag + ': no divider, flat tools', a.sep === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(a.toolBg), a);
  await check(tag + ': the bar stays on the screen', a.barL >= 0 && a.barR <= a.vw, a);
  await page.evaluate(() => document.querySelector('.hmn-btn[data-k=rooms]').click());
  await page.waitForTimeout(900);
  const b = await read();
  await check(tag + ': the marker follows to Rooms', b.onK === 'rooms' && Math.abs(b.pillX - b.onX) < 1.5, b);
  await page.context().browser().close();
}
await finish();
