// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/02-devices.js#H.dense
// Owner (01.11.2026, prod): in the vacuum popup („Saugen und Wischen“: suction Leise … Eigene, water Aus … Eigene, 8 each)
// the segment bars wrapped into two uneven rows on one 999 px track, the chosen pill stuck out of the track's rounded
// edge. UI.segments: up to 5 fields one row on one track; from 6 a grid of pills – no shared track, equal widths, rows
// filled evenly (6 → 3 + 3, 7 → 4 + 3, 8 → 4 + 4), the chosen pill inside the box, long labels on two lines instead of
// clipped. Checked in a v3 popup with the vacuum's real labels, desktop light 1440×900 and phone dark 393×852.
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard(() => true);
await need('Casora dashboard', dash);
const SUCTION = ['Leise', 'Ausgewogen', 'Turbo', 'Max', 'Max+', 'Aus', 'Smart', 'Eigene'];
const WATER = ['Aus', 'Gering', 'Mittel', 'Hoch', 'Eigene Wassermenge', 'Smart', 'Eigene'];
const SIX = ['88 °C', '90 °C', '92 °C', '94 °C', '95 °C', '96 °C'];
const FIVE = ['100 ml', '120 ml', '150 ml', '200 ml', '250 ml'];

const measure = (page) => page.evaluate(async ([sets]) => {
  const P = window.casoraPopup, UI = window._casoraUI;
  await P.open({ title: 'Segmente', variant: 'v3', content: 'x' });
  const box = P.element.container;
  box.innerHTML = sets.map((s) => '<div style="margin-bottom:24px">' + UI.segments(s.map((l, i) => ({ label: l, active: i === s.length - 3 })), null) + '</div>').join('');
  return new Promise((res) => setTimeout(() => res([...box.querySelectorAll('.hui-seg')].map((s) => {
    const R = s.getBoundingClientRect(), kids = [...s.querySelectorAll('.hui-sg')];
    const rows = {}; kids.forEach((k) => { const t = Math.round(k.getBoundingClientRect().top); rows[t] = (rows[t] || 0) + 1; });
    const o = s.querySelector('.hui-sg.on').getBoundingClientRect();
    return { n: kids.length, grid: s.classList.contains('grid'), rows: Object.values(rows),
      widths: [...new Set(kids.map((k) => Math.round(k.getBoundingClientRect().width)))],
      inside: o.left >= R.left - 0.5 && o.right <= R.right + 0.5 && o.top >= R.top - 0.5 && o.bottom <= R.bottom + 0.5,
      clipped: kids.filter((k) => k.scrollWidth > k.clientWidth + 1 || k.scrollHeight > k.clientHeight + 1).map((k) => k.textContent),
      track: getComputedStyle(s).backgroundColor };
  })), 600));
}, [[SUCTION, WATER, SIX, FIVE]]);

const run = async (tag, page) => {
  const [s8, s7, s6, s5] = await measure(page);
  await check(tag + ': 8 fields → grid 4 + 4, equal widths', s8.grid && s8.rows.join() === '4,4' && s8.widths.length === 1, s8);
  await check(tag + ': 7 fields → grid 4 + 3, equal widths', s7.grid && s7.rows.join() === '4,3' && s7.widths.length === 1, s7);
  await check(tag + ': 6 fields → grid 3 + 3', s6.grid && s6.rows.join() === '3,3', s6);
  await check(tag + ': grid without a shared track', [s8, s7, s6].every((s) => /rgba\(0, 0, 0, 0\)|transparent/.test(s.track)), [s8.track, s7.track]);
  await check(tag + ': 5 fields → one row on one track', !s5.grid && s5.rows.join() === '5', s5);
  await check(tag + ': the chosen pill inside the box', [s8, s7, s6, s5].every((s) => s.inside), [s8, s7, s6, s5].map((s) => s.inside));
  await check(tag + ': no label clipped („Eigene Wassermenge“ on two lines)', [s8, s7, s6, s5].every((s) => !s.clipped.length), [s8, s7, s6, s5].map((s) => s.clipped));
  await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(600);
};

const desk = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
await dashboard(desk.page, dash.url, 3);
await run('desktop light', desk.page);
const ph = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: true, theme: 'Casora' });
usePage(ph.page);
await dashboard(ph.page, (dash.phone || dash).url, 2);
await run('phone dark', ph.page);
await finish();
