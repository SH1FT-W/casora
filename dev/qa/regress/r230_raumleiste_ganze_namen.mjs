// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Raumleiste A „Feinschliff“ (1.3, navbar nav-01/nav-04): bei vielen Räumen standen halbe Wörter am
// Rand („Ga…“, Pfeil über dem Text), und beim Antippen eines Raums rückte die ganze Leiste 100–160 px,
// weil der neue Raum in die Mitte gescrollt wurde.
// Erwartet (Desktop 1440, Tablet 1024 quer, Tablet 768 hoch): jeder sichtbare Raumname liegt ganz in
// der Leiste (nicht unter einem Pfeil), Zuhause steht fest vorn; Antippen eines sichtbaren Raums
// verschiebt weder Zuhause noch die anderen Namen; Blättern mit dem Pfeil behält Breite und Zuhause,
// und über alle Seiten ist jeder Raum genau einmal erreichbar.
// 1.3 (leiste2, 11.10.2026): die Seiten liegen nebeneinander in einer gleitenden Schiene – sichtbar ist,
// was im Fenster (.rooms) liegt; der linke Pfeil ist auf der ersten Seite unsichtbar und nicht bedienbar.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, ready, casoraDashboards, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const dash = all.filter((d) => !d.mobile).sort((a, b) => (b.config.views || []).length - (a.config.views || []).length)[0];
await need('Casora-Dashboard mit vielen Räumen', dash && (dash.config.views || []).length >= 8, all.map((d) => d.url));
const views = dash.config.views.map((v) => v.path).filter(Boolean);
const url = '/' + dash.url + '/' + (views[Math.min(6, views.length - 1)] || '');

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const GERAETE = [
  ['Desktop 1440', { width: 1440, height: 900 }],
  ['Tablet 1024', { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA }],
  ['Tablet 768', { width: 768, height: 1024, mobile: true, touch: true, userAgent: IPAD_UA }],
];

const state = (page) => page.evaluate(() => {
  const nav = window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0];
  if (!nav) return null;
  const sr = nav.shadowRoot;
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width }; };
  const bar = sr.querySelector('.bar'), rooms = sr.querySelector('.rooms');
  const rb = rooms ? rooms.getBoundingClientRect() : null;
  // Sichtbar = im Fenster der Raumreihe (die übrigen Seiten liegen daneben in der Schiene).
  const vis = [...sr.querySelectorAll('.route')].filter((b) => { const r = b.getBoundingClientRect();
    return r.width > 0 && (!rb || b.classList.contains('home') || (r.right > rb.left + 1 && r.left < rb.right - 1)); });
  const lab = (b) => (b.querySelector('.htx') || b.querySelector('.label')).textContent.trim();
  const box = rooms ? R(rooms) : R(sr.querySelector('.scroller'));
  // Nur sichtbare Pfeile zählen: der linke liegt auf Seite 1 unsichtbar über dem Anfang der Reihe (11.10.2026).
  const caps = [...sr.querySelectorAll('.more')].filter((m) => { const c = getComputedStyle(m);
    return m.getBoundingClientRect().width > 0 && c.visibility !== 'hidden' && parseFloat(c.opacity) > 0.1; }).map(R);
  const ml = sr.querySelector('.more-l'), mcs = ml && getComputedStyle(ml);
  const leftGone = !!ml && (mcs.visibility === 'hidden' || parseFloat(mcs.opacity) === 0) && mcs.pointerEvents === 'none' && ml.getAttribute('aria-hidden') === 'true';
  return {
    bar: R(bar), rooms: box, paged: bar.classList.contains('paged'), page: nav._page, pages: nav._pages ? nav._pages.length : 0,
    home: sr.querySelector('.route.home') ? R(sr.querySelector('.route.home')) : null,
    all: [...sr.querySelectorAll('.rooms .route')].map(lab),
    vis: vis.map((b) => ({ name: lab(b), active: b.classList.contains('active'), home: b.classList.contains('home'), ...R(b.querySelector('.label')) })),
    caps, leftGone,
  };
});
const cut = (s) => s.vis.filter((v) => !v.home).filter((v) => v.l < s.rooms.l - 1 || v.r > s.rooms.r + 1
  || s.caps.some((c) => v.l < c.r - 1 && c.l < v.r - 1)).map((v) => v.name);

for (const [name, dev] of GERAETE) {
  const { page } = await open(dev);
  usePage(page);
  await ready(page, url, () => window.__pierce('casora-nav-bar').some((e) => e.getClientRects().length), 90000);
  await page.waitForTimeout(3000);
  const s = await state(page);
  await need(name + ': Raumleiste da', s && s.vis.length, s);
  await check(name + ': Zuhause fest vorn', s.home && s.vis[0].home, s.vis.map((v) => v.name));
  await check(name + ': keine abgeschnittenen Namen (alle ganz in der Leiste, keiner unter einem Pfeil)', cut(s).length === 0, { cut: cut(s), rooms: s.rooms, caps: s.caps });
  if (!s.paged) { await check(name + ': Leiste läuft über (sonst nichts zu blättern)', false, s); await page.close(); continue; }

  // Antippen eines sichtbaren, nicht aktiven Raums: nichts wandert.
  const target = s.vis.filter((v) => !v.home && !v.active).slice(-1)[0];
  await need(name + ': anderer sichtbarer Raum', target, s.vis);
  await page.mouse.click((target.l + target.r) / 2, await page.evaluate(() => {
    const nav = window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0];
    const r = nav.shadowRoot.querySelector('.bar').getBoundingClientRect(); return r.top + r.height / 2; }));
  await page.waitForTimeout(2500);
  const t = await state(page);
  const act = t.vis.find((v) => v.active);
  await check(name + ': angetippter Raum ist aktiv', act && act.name === target.name, { target: target.name, act });
  const moved = s.vis.map((v) => { const n = t.vis.find((x) => x.name === v.name); return n ? Math.round(n.l - v.l) : 'weg'; });
  await check(name + ': Leiste wandert beim Antippen nicht (alle Namen ±1 px an ihrem Platz)', moved.every((d) => d !== 'weg' && Math.abs(d) <= 1), { moved, vorher: s.vis.map((v) => v.name) });
  await check(name + ': Breite gleich', Math.abs(t.bar.w - s.bar.w) <= 1, [s.bar, t.bar]);

  // Durchblättern: jede Seite ganze Namen, Zuhause und Breite fest, jeder Raum einmal.
  await page.evaluate(() => { const nav = window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0]; nav._showPage(0, true); });
  await page.waitForTimeout(700);   // Seiten gleiten 360 ms
  const seen = [];
  let p = await state(page), guard = 0, ok = true;
  const bad = [];
  await check(name + ': Seite 1 – linker Pfeil unsichtbar und nicht bedienbar', p.page === 0 && p.leftGone, { page: p.page, caps: p.caps });
  let leftLater = true;
  while (guard++ < 30) {
    seen.push(...p.vis.filter((v) => !v.home).map((v) => v.name));
    if (cut(p).length) bad.push({ page: p.page, cut: cut(p) });
    if (Math.abs(p.home.l - s.home.l) > 1 || Math.abs(p.bar.w - s.bar.w) > 1) ok = false;
    if (p.page >= p.pages - 1) break;
    const c = await page.evaluate(() => { const nav = window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0];
      const r = nav.shadowRoot.querySelector('.more-r').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(700);
    p = await state(page);
    if (p.leftGone) leftLater = false;
  }
  await check(name + ': ab Seite 2 linker Pfeil da', leftLater, { page: p.page });
  await check(name + ': jede Seite nur ganze Namen', bad.length === 0, bad);
  await check(name + ': Zuhause und Breite bleiben beim Blättern stehen', ok, { home: s.home, bar: s.bar });
  const dup = seen.filter((n, i) => seen.indexOf(n) !== i);
  const miss = p.all.filter((n) => seen.indexOf(n) < 0);
  await check(name + ': über alle Seiten jeder Raum genau einmal (' + seen.length + '/' + p.all.length + ')', !dup.length && !miss.length, { dup, miss });
  await page.close();
}

await finish();
