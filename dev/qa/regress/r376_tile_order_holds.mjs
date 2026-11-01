// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/smart-row.js
// Prüfung 2 fam-04/E19 (31.10.2026): Favorites on the phone (lock unlocked, lights, blinds) – lock it, the lock tile
// moved to the back and the next tap hit the wrong tile; on the desktop the heating jumped to the front after
// switching it on. Expected: after the load phase a tile row keeps its order right after use, a state change only
// changes colours (phone WebKit 393 and desktop 1440). Nothing is saved: states are faked in the browser.
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);

for (const phone of [true, false]) {
  const tag = phone ? 'Handy' : 'Desktop';
  const url = phone && dash.phone ? dash.phone.url : dash.url;
  const cfg = phone && dash.phone ? dash.phone.config : dash.config;
  const { page } = await open(phone ? { width: 393, height: 852, mobile: true, safari: true, dark: false } : { width: 1440, height: 900, dark: false });
  usePage(page);
  await dashboard(page, url + '/' + ((cfg.views[0] || {}).path || '0'), 3);
  // A sorting row with at least two tiles, visible on screen.
  await page.waitForTimeout(11000);  // past the load phase (10 s)
  const info = await page.evaluate(() => {
    const rows = window.__pierce('casora-smart-row').filter((r) => r._sortEnabled && r._wrappers && r._wrappers.length >= 2 && r.getBoundingClientRect().height > 0);
    const r = rows[0];
    if (!r) return null;
    window.__qaRow = r;
    const order = () => r._wrappers.map((w, i) => ({ i, o: Number(w.style.order || i) })).sort((a, b) => a.o - b.o).map((x) => x.i);
    window.__qaOrder = order;
    // Only the tile that stands last turns active, everything else idle: a sorting row would move it to the front.
    const before = order();
    const last = before[before.length - 1];
    r._isActive = (i) => i === last;
    return { before, n: r._wrappers.length };
  });
  await need(tag + ': sortierende Kachelreihe', info, info);
  // Someone just used a tile (input), then its state update reaches the row as usual (HA's own path).
  // Since "Sort tiles" (01.11.2026, default calm) the order holds until 30 s after the last input (r379).
  await page.keyboard.press('Shift');
  await fakeStates(page, { 'sensor.casora_qa_r376': { state: String(Date.now()) } });
  await page.waitForTimeout(7000);  // SORT_DELAY + quiet time would have re-sorted by now
  const after = await page.evaluate(() => window.__qaOrder());
  await check(`${tag}: Reihenfolge bleibt nach dem Umschalten`, JSON.stringify(after) === JSON.stringify(info.before), { before: info.before, after });
  // The old behaviour is still there on request (tests of the sorting rules use it).
  await page.evaluate(() => { window.CASORA_LIVE_SORT = true; });
  await fakeStates(page, { 'sensor.casora_qa_r376': { state: String(Date.now() + 1) } });
  await page.waitForTimeout(7000);
  const live = await page.evaluate(() => window.__qaOrder());
  await check(`${tag}: mit CASORA_LIVE_SORT sortiert sie wie früher um`, JSON.stringify(live) !== JSON.stringify(info.before), { before: info.before, live });
  await page.close();
}
await finish();
