// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Gemeldet (Nutzerwunsch 11.10.2026, Raumleiste A am Tablet): „das scrollen ruckelt … das springt“, und der
// linke Pfeil stand schon auf der ersten Seite da. Ursache: die Seiten wurden per hidden umgeschaltet
// (harter Sprung, kein Mitgehen mit dem Finger, Neuvermessung je Blättern), Wischen blätterte schon ab
// 40 px, ein Trackpad-Schwung blätterte bis zu 5 Seiten.
// Erwartet (Tablet 1180×820 quer und 820×1180 hochkant, Theme Casora): die Raumreihe bleibt während des
// Zugs stehen (11.10.: Mitgehen ließ sie am iPad zwischen zwei Seiten hängen) und gleitet beim Loslassen;
// Loslassen nach kurzem Zug gleitet zurück, nach langem/schnellem Wisch genau eine Seite weiter; Pfeil
// und Trackpad blättern genau eine Seite, die neue Seite blendet weich ein; am Ende nur ganze Namen bündig,
// Zuhause und Breite fest; linker Pfeil auf Seite 1 unsichtbar und nicht bedienbar, danach sichtbar.
// Ohne Bewegung (prefers-reduced-motion) kein Gleiten. Chromium mit echtem CDP-Touch, dazu WebKit
// (Safari) mit nachgestellten Zeiger-Ereignissen.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, ready, casoraDashboards, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const dash = all.filter((d) => !d.mobile).sort((a, b) => (b.config.views || []).length - (a.config.views || []).length)[0];
await need('Casora-Dashboard mit vielen Räumen', dash && (dash.config.views || []).length >= 8, all.map((d) => d.url));
const url = '/' + dash.url;
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const NAV = `window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0]`;
const state = (page) => page.evaluate((NAV) => {
  const nav = eval(NAV);
  if (!nav) return null;
  const sr = nav.shadowRoot, rooms = sr.querySelector('.rooms');
  if (!rooms) return null;
  const rr = rooms.getBoundingClientRect();
  const btns = [...sr.querySelectorAll('.rooms .route')];
  const vis = btns.filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.right > rr.left + 1 && r.left < rr.right - 1; });
  const ml = sr.querySelector('.more-l'), cs = getComputedStyle(ml);
  const home = sr.querySelector('.route.home');
  return { page: nav._page, pages: nav._pages ? nav._pages.length : 0, rooms: { l: rr.left, r: rr.right, y: rr.top + rr.height / 2, w: rr.width },
    bar: sr.querySelector('.bar').getBoundingClientRect().width, home: home ? home.getBoundingClientRect().left : null,
    vis: vis.map((b) => { const r = b.getBoundingClientRect(); return { n: b.textContent.trim(), l: r.left, r: r.right }; }),
    leftShown: cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5 && cs.pointerEvents !== 'none' && ml.getAttribute('aria-hidden') !== 'true',
    leftGone: (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) && cs.pointerEvents === 'none' && ml.getAttribute('aria-hidden') === 'true' && ml.tabIndex < 0,
    leftW: ml.getBoundingClientRect().width };
}, NAV);
// Lage des ersten Raums je Frame (auch außerhalb des Fensters) + Seite.
const rec = (page, on) => page.evaluate(([on, NAV]) => {
  if (!on) { window.__rec.stop = true; return window.__rec; }
  const nav = eval(NAV), b0 = nav.shadowRoot.querySelector('.rooms .route');
  const R = window.__rec = { x: [], p: [], stop: false };
  const loop = () => { if (R.stop) return; R.x.push(Math.round(b0.getBoundingClientRect().left)); R.p.push(nav._page); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}, [on, NAV]);
const steps = (R) => [...new Set(R.x)].length;
const pageChanges = (R) => R.p.filter((p, i) => i && p !== R.p[i - 1]).length;
const whole = (s) => s.vis.every((v) => v.l >= s.rooms.l - 1 && v.r <= s.rooms.r + 1);
const toPage = (page, p) => page.evaluate(([p, NAV]) => eval(NAV)._showPage(p, true, true), [p, NAV]);

for (const [name, vp, engine] of [['Tablet quer 1180', { width: 1180, height: 820 }, 'chromium'],
  ['Tablet hochkant 820', { width: 820, height: 1180 }, 'chromium'], ['Tablet quer 1180 WebKit', { width: 1180, height: 820 }, 'webkit']]) {
  const { page, context } = await open({ ...vp, mobile: engine === 'chromium', touch: true, userAgent: IPAD_UA, dark: false, theme: 'Casora', safari: engine === 'webkit', scale: 1 });
  usePage(page);
  await ready(page, url, () => window.__pierce('casora-nav-bar').some((e) => e.getClientRects().length), 90000);
  await page.waitForTimeout(3000);
  await toPage(page, 0); await page.waitForTimeout(400);
  const s = await state(page);
  await need(name + ': Raumleiste mit mehreren Seiten', s && s.pages > 1, s);
  await check(name + ': Seite 1 – linker Pfeil unsichtbar, nicht bedienbar, Platz reserviert', s.leftGone && s.leftW > 0, s);

  // Zeiger-Wisch: Chromium per CDP-Touch (echte Ereignisse), WebKit per nachgestellten PointerEvents.
  const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  const drag = async (frac, n, dt) => {
    const st = await state(page);
    const x0 = st.rooms.l + st.rooms.w * (frac > 0 ? 0.75 : 0.25), x1 = x0 - st.rooms.w * frac, y = st.rooms.y;
    const before = await page.evaluate((NAV) => Math.round(eval(NAV).shadowRoot.querySelector('.rooms .route').getBoundingClientRect().left), NAV);
    await rec(page, true);
    let mid = null;
    if (cdp) {
      const t = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await t('touchStart', x0);
      for (let i = 1; i <= n; i++) { await t('touchMove', x0 + (x1 - x0) * i / n); await page.waitForTimeout(dt);
        if (i === n) mid = await page.evaluate((NAV) => Math.round(eval(NAV).shadowRoot.querySelector('.rooms .route').getBoundingClientRect().left), NAV); }
      await t('touchEnd');
    } else {
      mid = await page.evaluate(async ([x0, x1, y, n, dt, NAV]) => {
        const nav = eval(NAV), rooms = nav.shadowRoot.querySelector('.rooms');
        const tgt = nav.shadowRoot.elementFromPoint ? (nav.shadowRoot.elementFromPoint(x0, y) || rooms) : rooms;
        const ev = (type, x) => (type === 'pointerdown' ? tgt : rooms).dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
        ev('pointerdown', x0); let m = null;
        for (let i = 1; i <= n; i++) { ev('pointermove', x0 + (x1 - x0) * i / n); await new Promise((r) => setTimeout(r, dt)); }
        m = Math.round(rooms.querySelector('.route').getBoundingClientRect().left);
        ev('pointerup', x1); return m;
      }, [x0, x1, y, n, dt, NAV]);
    }
    await page.waitForTimeout(800);
    const R = await rec(page, false);
    return { before, mid, R, end: await state(page), dx: x1 - x0 };
  };

  // 1) Langer Zug (45 %, langsam): Reihe bleibt während des Zugs stehen, dann genau eine Seite weiter.
  let d = await drag(0.45, 16, 30);
  await check(name + ': Wischen – Reihe bleibt während des Zugs stehen (vor dem Loslassen ' + (d.mid - d.before) + ' px bei ' + Math.round(d.dx) + ' px Zug)',
    d.mid != null && Math.abs(d.mid - d.before) <= 1, { before: d.before, mid: d.mid, dx: d.dx });
  await check(name + ': langer Zug blättert genau eine Seite (' + s.page + ' → ' + d.end.page + ')', d.end.page === s.page + 1 && pageChanges(d.R) === 1, { page: d.end.page, wechsel: pageChanges(d.R) });
  await check(name + ': danach nur ganze Namen, bündig im Fenster', whole(d.end) && d.end.vis.length > 0, d.end.vis);
  await check(name + ': Seite 2 – linker Pfeil sichtbar und bedienbar', d.end.leftShown, d.end);
  await check(name + ': Zuhause und Breite fest', Math.abs(d.end.bar - s.bar) <= 1 && (s.home == null || Math.abs(d.end.home - s.home) <= 1), { s: [s.bar, s.home], e: [d.end.bar, d.end.home] });

  // 2) Kurzer Zug (15 %, langsam): bleibt stehen, keine neue Seite.
  const p2 = d.end.page;
  d = await drag(0.15, 10, 40);
  await check(name + ': kurzer Zug (15 %) bleibt auf der Seite', d.end.page === p2 && pageChanges(d.R) === 0 && whole(d.end), { page: d.end.page, vorher: p2 });
  await check(name + ': … und die Reihe steht dabei still (kein Hängenbleiben zwischen Seiten)', steps(d.R) <= 1, { lagen: steps(d.R) });

  // 3) Schneller Wisch zurück (35 % in ~110 ms): genau eine Seite zurück.
  d = await drag(-0.35, 6, 18);
  await check(name + ': schneller Wisch zurück = genau eine Seite', d.end.page === p2 - 1 && pageChanges(d.R) === 1, { page: d.end.page, wechsel: pageChanges(d.R) });

  // 4) Pfeil rechts: die nächste Seite blendet weich ein, genau eine Seite.
  if (engine === 'chromium') {
    await toPage(page, 0); await page.waitForTimeout(400);
    const c = await page.evaluate((NAV) => { const r = eval(NAV).shadowRoot.querySelector('.more-r').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, NAV);
    await rec(page, true);
    await page.mouse.click(c[0], c[1]);
    // Seitenwechsel ohne Schieben (11.10.): die neue Seite blendet ein – keine Lücke zwischen zwei Seiten.
    const fade = await page.evaluate((NAV) => { const n = eval(NAV), pg = n._pageEls[n._page];
      return pg && pg.getAnimations ? pg.getAnimations().length : 0; }, NAV);
    await page.waitForTimeout(700);
    let R = await rec(page, false);
    let e = await state(page);
    await check(name + ': Pfeil blendet die nächste Seite weich ein (' + fade + ' Animation)', e.page === 1 && fade >= 1 && whole(e), { fade, page: e.page });

    // 5) Trackpad-Schwung (abklingende Rad-Ereignisse ~650 ms): genau eine Seite.
    await toPage(page, 0); await page.waitForTimeout(400);
    await page.mouse.move(s.rooms.l + s.rooms.w / 2, s.rooms.y);
    await rec(page, true);
    for (let i = 0; i < 40; i++) { await page.mouse.wheel(Math.max(1, Math.round(60 * Math.pow(0.9, i))), 0); await page.waitForTimeout(16); }
    await page.waitForTimeout(800);
    R = await rec(page, false);
    e = await state(page);
    await check(name + ': ein Trackpad-Schwung = genau eine Seite (' + e.page + ')', e.page === 1 && pageChanges(R) === 1, { page: e.page, wechsel: pageChanges(R) });

    // 6) Weniger Bewegung: kein Gleiten.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toPage(page, 0); await page.waitForTimeout(400);
    await rec(page, true);
    await page.mouse.click(c[0], c[1]);
    await page.waitForTimeout(500);
    R = await rec(page, false);
    e = await state(page);
    await check(name + ': prefers-reduced-motion – Pfeil ohne Gleiten', e.page === 1 && steps(R) <= 2, { lagen: steps(R), page: e.page });
  }
  await page.close();
}

await finish();
