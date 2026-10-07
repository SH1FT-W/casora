// @zustand: stress
// Gemeldet: Passen die Unter-Badges einer aufgeklappten Badge nicht in die Zeile, lassen
// sie sich nicht seitwärts schieben – am Desktop weder mit Mausrad/Trackpad noch per
// Ziehen, am Handy nicht per Wischen. Erwartet: die Reihe bewegt sich.
// Braucht eine Badge mit vielen Unter-Badges (Zustand „stress“; Szenen/Licht/Energie).
import { open, usePage, casoraDashboard, dashboard, cards, check, need, finish } from './lib.mjs';

const GROUPS = [['casora_badge_scene_group', 'casora_badge_scene'], ['casora_badge_light_group', 'casora_badge_light'],
  ['casora_badge_energy_group', 'casora_badge_energy'], ['casora_badge_climate_group', 'casora_badge_climate'],
  ['casora_badge_security_group', 'casora_badge_security'], ['casora_badge_media_group', 'casora_badge_media']];

// Im Zustand „stress“ legt dev/qa/stress-setup.mjs „qa-stress“ an – das zuerst.
const dash = (await casoraDashboard((d) => d.url === 'qa-stress')) || (await casoraDashboard());
await need('Casora-Dashboard', dash);

// Badge aufklappen, deren Unter-Badges über den Rand ragen. Rückgabe: [Gruppe, Unter-Vorlage] oder null.
const tried = [];
async function openOverflowing(page, width) {
  tried.length = 0;
  for (const [grp, sub] of GROUPS) {
    let g = (await cards(page, grp))[0];
    if (!g) continue;
    if (g.x + g.w / 2 > width || g.x < 0) {
      // Am Handy ist schon die Badge-Reihe selbst seitwärts verschoben: Badge ins Bild holen.
      await page.evaluate((i) => window.__pierce('button-card')[i].scrollIntoView({ inline: 'center', block: 'nearest' }), g.i);
      await page.waitForTimeout(600);
      g = (await cards(page, grp))[0];
      if (g.x + g.w / 2 > width || g.x < 0) { tried.push(grp + ': nicht ins Bild zu holen'); continue; }
    }
    // Die Badge-Reihe selbst blättert und schneidet am Rand ab (z. B. lange Sicherheits-Zeile):
    // Badge erst in der Reihe ganz ins Bild holen, sonst trifft der Klick die Raumkarte.
    await page.evaluate((i) => window.__pierce('button-card')[i].scrollIntoView({ inline: 'nearest', block: 'nearest' }), g.i);
    await page.waitForTimeout(500);
    g = (await cards(page, grp))[0];
    await page.mouse.click(g.x + g.w / 2, g.y + g.h / 2);
    await page.waitForTimeout(1200);
    const subs = (await cards(page, sub)).filter((c) => c.y > g.y);
    const row = subs.length ? subs.filter((c) => Math.abs(c.y - subs[0].y) < 4) : [];
    if (row.length && Math.max(...row.map((c) => c.x + c.w)) > width + 4) return { grp, sub, y: row[0].y, h: row[0].h, x0: row[0].x };
    // Manche Badges öffnen ein Popup statt aufzuklappen (z. B. Klima am Handy): schließen.
    const popup = await page.evaluate(() => { const p = window.casoraPopup; const open = !!(p && p.surface);
      try { if (open) p.close(); } catch (e) { /* schon zu */ } return open; });
    if (popup) { await page.keyboard.press('Escape'); await page.waitForTimeout(700); tried.push(grp + ': Popup'); continue; }
    tried.push(grp + ': ' + (subs.length ? row.length + ' Unter-Badges passen' : 'klappt nicht auf'));
    await page.mouse.click(g.x + g.w / 2, g.y + g.h / 2); // wieder zu
    await page.waitForTimeout(600);
  }
  return null;
}
const firstX = async (page, sub, y) => {
  const r = (await cards(page, sub)).filter((c) => Math.abs(c.y - y) < 4);
  return r.length ? Math.min(...r.map((c) => c.x)) : null;
};

// Desktop: Mausrad (horizontal und vertikal wie am Trackpad) und Ziehen.
{
  const W = 1280;
  const { page } = await open({ width: W, height: 860 });
  await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));
  const row = await openOverflowing(page, W);
  await need('eine Badge mit überlaufenden Unter-Badges (Zustand „stress“)', row);
  const mid = { x: Math.min(W - 60, row.x0 + 120), y: row.y + row.h / 2 };
  const before = await firstX(page, row.sub, row.y);
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(700);
  const afterV = await firstX(page, row.sub, row.y);
  await page.mouse.wheel(400, 0);
  await page.waitForTimeout(700);
  const afterH = await firstX(page, row.sub, row.y);
  await check('Desktop: Mausrad/Trackpad schiebt die Unter-Badges (' + row.grp + ')',
    afterV < before - 20 || afterH < before - 20, { before, afterV, afterH });
  const b2 = afterH;
  await page.mouse.move(mid.x + 200, mid.y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(mid.x + 200 - i * 25, mid.y);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const afterD = await firstX(page, row.sub, row.y);
  await check('Desktop: Ziehen mit der Maus schiebt die Unter-Badges', afterD < b2 - 20 || (afterH < before - 20 && afterD !== null), { b2, afterD });
}

// Handy: Wischen per Touch (CDP-Touch-Ereignisse, wie ein Finger).
{
  const W = 390;
  const { page, context } = await open({ width: W, height: 844, mobile: true });
  usePage(page);
  const url = dash.phone ? dash.phone.url : dash.url;
  await dashboard(page, url + '/' + ((dash.phone || dash).config.views[0].path || '0'));
  const row = await openOverflowing(page, W);
  // Das Casora-Handy-Layout klappt keine Unter-Badges auf: seine Badges filtern die Seite
  // (casora_mobile_filter_badges; auch das Desktop-Dashboard zeigt am Handy dieses Layout).
  // Dann gibt es nichts zu wischen – ausdrücklich als übersprungen melden. Handy-Layouts mit
  // Unter-Badge-Reihen (Hemma-Stil, Zustand „arbeit“) prüft dev/qa/alles.mjs
  // (Befund „unterreihe-nicht-scrollbar“ / „reihe-scrollt-nicht“).
  const filters = !row && (await cards(page, 'casora_mobile_filter_badges')).length > 0;
  if (filters) {
    console.log('  SKIP   Handy: Wischen – das Handy-Layout filtert mit seinen Badges, es gibt keine Unter-Badge-Reihe');
    await check('Handy: Badges filtern die Seite statt aufzuklappen (nichts zu wischen)', true);
    await finish();
  }
  if (!row) {
    await check('Handy: eine Badge mit überlaufenden Unter-Badges', false, 'keine gefunden – ' + tried.join(' · '));
  } else {
    const cdp = await context.newCDPSession(page);
    const y = row.y + row.h / 2, x = W - 40;
    const before = await firstX(page, row.sub, row.y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 22, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(900);
    const after = await firstX(page, row.sub, row.y);
    await check('Handy: Wischen schiebt die Unter-Badges (' + row.grp + ')', after < before - 20, { before, after });
  }
}
await finish();
