// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Gemeldet (Personas 10.10.2026, per-01): Raumleiste mit vielen Räumen läuft über, aber direkt nach
// dem Laden fehlte der rechte Pfeil (.bar ohne more-r-on, Liste ohne fade-r); das Mausrad blätterte
// die Leiste nicht – mit der Maus waren Räume ab „Küche“ unerreichbar (Desktop 1440 + Tablet 1024).
// Erwartet: läuft die Leiste über, ist der rechte Pfeil nach dem Laden sichtbar; Mausrad (senkrecht)
// über der Leiste scrollt die Raumreihe waagrecht, danach ist auch der linke Pfeil da.
// 1.3 (frei scrollend, 11.10.2026): keine Seiten mehr – die Raumreihe (.rooms) scrollt nativ. Der
// Pfeil scrollt weich (smooth) um 60 % der Breite, das Mausrad stetig um seinen Ausschlag; vorher
// sprang beides um eine ganze Seite (scrollLeft blieb 0, nur die Schiene wurde verschoben).
import { open, usePage, ready, casoraDashboards, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const dash = all.filter((d) => !d.mobile).sort((a, b) => (b.config.views || []).length - (a.config.views || []).length)[0];
await need('Casora-Dashboard mit vielen Räumen', dash && (dash.config.views || []).length >= 8, all.map((d) => d.url));
// Ohne Ansicht in der Adresse (wie aus der Seitenleiste): kein aktiver Raum beim Aufbau – genau dann fehlte der Pfeil.
const url = '/' + dash.url;

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const GERAETE = [
  ['Desktop 1440', { width: 1440, height: 900 }],
  ['Tablet 1024', { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA }],
];

const NAV = `window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0]`;
const state = (page) => page.evaluate((NAV) => {
  const nav = eval(NAV);
  if (!nav) return null;
  const sr = nav.shadowRoot, bar = sr.querySelector('.bar');
  const paged = bar.classList.contains('paged');
  const sc = paged ? sr.querySelector('.rooms') : sr.querySelector('.scroller');
  const r = sc.getBoundingClientRect();
  const more = sr.querySelector('.more-r');
  const ml = sr.querySelector('.more-l'), c = getComputedStyle(ml);
  return {
    paged, over: sc.scrollWidth - sc.clientWidth, left: Math.round(sc.scrollLeft), cw: sc.clientWidth,
    moreR: bar.classList.contains('more-r-on') && getComputedStyle(more).opacity === '1',
    moreL: bar.classList.contains('more-l-on'), fadeR: paged || sr.querySelector('.scroller').classList.contains('fade-r'),
    leftGone: (c.visibility === 'hidden' || parseFloat(c.opacity) === 0) && c.pointerEvents === 'none',
    x: r.left + r.width / 2, y: r.top + r.height / 2,
  };
}, NAV);
const toStart = (page) => page.evaluate((NAV) => { const sr = eval(NAV).shadowRoot;
  (sr.querySelector('.bar.paged .rooms') || sr.querySelector('.scroller')).scrollLeft = 0; }, NAV);
// scrollLeft je Frame mitschreiben (zeigt, ob weich gescrollt oder gesprungen wird).
const rec = (page, on) => page.evaluate(([on, NAV]) => {
  if (!on) { window.__rec.stop = true; return window.__rec.x; }
  const sr = eval(NAV).shadowRoot, sc = sr.querySelector('.bar.paged .rooms') || sr.querySelector('.scroller');
  const R = window.__rec = { x: [], stop: false };
  const loop = () => { if (R.stop) return; R.x.push(Math.round(sc.scrollLeft)); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}, [on, NAV]);

for (const [name, dev] of GERAETE) {
  const { page } = await open(dev);
  usePage(page);
  await ready(page, url, () => window.__pierce('casora-nav-bar').some((e) => e.getClientRects().length), 90000);
  await page.waitForTimeout(2500);
  const s = await state(page);
  await need(name + ': Raumleiste da', s, s);
  if (s.over <= 2) { await check(name + ': Leiste läuft über (sonst nichts zu prüfen)', false, s); continue; }
  await check(name + ': rechter Pfeil (+ Verlauf bzw. weicher Rand) nach dem Laden sichtbar', s.moreR && s.fadeR, s);
  await toStart(page);
  await page.waitForTimeout(300);
  const z = await state(page);
  if (s.paged) await check(name + ': bei scrollLeft 0 linker Pfeil unsichtbar', z.left === 0 && z.leftGone && !z.moreL, z);

  // Mausrad senkrecht: scrollt waagrecht, stetig um den Ausschlag (keine Seite). Den Ausschlag liest ein
  // eigener Zuhörer mit (Playwright teilt ihn je nach Pixeldichte, beim Desktop ×2 also halb).
  await page.evaluate((NAV) => { const sc = eval(NAV).shadowRoot.querySelector('.scroller'); window.__dy = 0;
    sc.addEventListener('wheel', (e) => { window.__dy += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; }, true); }, NAV);
  const dy = () => page.evaluate(() => Math.round(window.__dy));
  await page.mouse.move(s.x, s.y);
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(250);
  const w1 = await state(page), d1 = await dy();
  await check(name + ': ein Rad-Schritt scrollt genau um seinen Ausschlag (' + w1.left + ' = ' + d1 + ')', d1 > 0 && Math.abs(w1.left - d1) <= 1, w1);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  const t = await state(page), d2 = await dy();
  await check(name + ': Mausrad scrollt die Leiste weiter (scrollLeft ' + t.left + ' = ' + Math.min(t.over, d2) + ')', Math.abs(t.left - Math.min(t.over, d2)) <= 1, t);
  await check(name + ': danach linker Pfeil sichtbar', t.moreL && !t.leftGone, t);

  if (s.paged) {
    // Pfeil rechts: weich (mehrere Zwischenlagen) um 60 % der Breite.
    await toStart(page); await page.waitForTimeout(300);
    const c = await page.evaluate((NAV) => { const r = eval(NAV).shadowRoot.querySelector('.more-r').getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2]; }, NAV);
    await rec(page, true);
    await page.mouse.click(c[0], c[1]);
    await page.waitForTimeout(900);
    const R = await rec(page, false);
    const u = await state(page);
    const want = Math.min(u.over, Math.round(Math.max(120, u.cw * 0.6)));
    const mids = new Set(R.filter((x) => x > 2 && x < want - 2)).size;
    await check(name + ': Pfeil scrollt um 60 % der Breite (' + u.left + ' ≈ ' + want + ')', Math.abs(u.left - want) <= 2, u);
    await check(name + ': … und zwar weich (' + mids + ' Zwischenlagen)', mids >= 3, { lagen: [...new Set(R)] });
  }
  await page.close();
}

await finish();
