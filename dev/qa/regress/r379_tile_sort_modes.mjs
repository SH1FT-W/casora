// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/smart-row.js
// "Sort tiles" (01.11.2026, Daniel: "C und Schalter"): since E19 a tile that turned idle stayed in front between the
// active ones until a reload. Expected after the load phase (phone WebKit 393 and desktop 1440):
//   calm (default) – while someone uses the page the order holds; 30 s after the last input the tile moves back;
//   open – no re-sort while the page is open; now – re-sorts within seconds (as before E19).
// The mode is set with the code switch CASORA_SORT_MODE (the Studio value is unit-tested). Nothing is saved.
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
  if (!phone) await page.mouse.move(4, 4);  // pointer away from the row (hover holds a re-sort)
  await page.waitForTimeout(11000);  // past the load phase (10 s)
  const info = await page.evaluate(() => {
    const rows = window.__pierce('casora-smart-row').filter((r) => r._sortEnabled && r._wrappers && r._wrappers.length >= 2 && r.getBoundingClientRect().height > 0);
    const r = rows[0];
    if (!r) return null;
    window.__qaRow = r;
    window.__qaOrder = () => r._wrappers.map((w, i) => ({ i, o: Number(w.style.order || i) })).sort((a, b) => a.o - b.o).map((x) => x.i);
    const before = window.__qaOrder();
    // The tile in front turns idle, all others active: it belongs at the back.
    const front = before[0];
    window.__qaFlip = (f) => { r._isActive = (i) => (i === front ? f : true); };
    return { before, front, n: r._wrappers.length, mode: window._casoraSortModeNow && window._casoraSortModeNow() };
  });
  await need(tag + ': sortierende Kachelreihe', info, info);
  await check(`${tag}: Standard ist „Nach kurzer Ruhe“`, info.mode === 'calm', info);
  const order = () => page.evaluate(() => window.__qaOrder());
  const nudge = (n) => fakeStates(page, { 'sensor.casora_qa_r379': { state: String(Date.now() + n) } });

  // ── calm ──
  await page.evaluate(() => { window.__qaFlip(true); });
  await nudge(0);  // settle the faked state as "front tile active" (it already is)
  await page.evaluate(() => { window.__qaFlip(false); });
  await nudge(1);
  // Someone keeps using the page for 20 s: no jump.
  for (let k = 0; k < 4; k++) { await page.keyboard.press('Shift'); await page.waitForTimeout(5000); }
  const busy = await order();
  await check(`${tag}: bei Bedienung kein Sprung`, JSON.stringify(busy) === JSON.stringify(info.before), { before: info.before, busy });
  await page.waitForTimeout(34000);  // 30 s quiet + check interval
  const calm = await order();
  await check(`${tag}: nach Ruhe rückt die inaktive Kachel nach hinten`, calm[calm.length - 1] === info.front, { before: info.before, calm });

  // ── open ──
  await page.evaluate(() => { window.CASORA_SORT_MODE = 'open'; window.__qaFlip(true); });
  await nudge(2);
  await page.waitForTimeout(8000);
  const held = await order();
  await check(`${tag}: „Nur beim Öffnen“ sortiert nicht`, JSON.stringify(held) === JSON.stringify(calm), { calm, held });

  // ── now ──
  await page.evaluate(() => { window.CASORA_SORT_MODE = 'now'; });
  await nudge(3);
  await page.waitForTimeout(7000);  // SORT_DELAY 2.5 s + 2 s quiet
  const quick = await order();
  // All tiles active again: config order, the front tile no longer at the back.
  await check(`${tag}: „Sofort“ sortiert gleich um`, JSON.stringify(quick) === JSON.stringify([...quick].sort((a, b) => a - b)) && quick[quick.length - 1] !== info.front, { calm, quick });
  await page.close();
}
await finish();
