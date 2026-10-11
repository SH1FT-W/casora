// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Gemeldet (Nutzerwunsch 11.10.2026, Raumleiste A am Tablet): „das scrollen ruckelt … das springt“.
// Danach blätterte die Leiste seitenweise (nur ganze Namen) – Nutzerwunsch: „ich will nicht das die leiste
// springt oder so also ganze räume anzeigt...sondern wenn ich nur ganz bisschen scrolle sollen auch
// halbe räume angezeigt werden“.
// Erwartet (Tablet 1180×820 quer und 820×1180 hochkant, iPad, Theme Casora, Chromium mit echtem
// CDP-Touch): die Raumreihe (.rooms) scrollt nativ – während des Zugs folgt scrollLeft stetig dem
// Finger; nach dem Loslassen (Finger stand still) bleibt die Reihe genau dort stehen, kein Einrasten
// auf Seiten. Ein paar kräftige Wische führen ans Ende: scrollLeft === max, der letzte Raum schließt
// bündig rechts ab (kein Leerraum). Linker Pfeil bei scrollLeft 0 unsichtbar, aria-hidden, nicht
// fokussierbar; nach dem Wischen sichtbar. Zuhause und Leistenbreite bleiben fest.
// Gegen das Seiten-Verhalten (bis 30b08914) rot: dort stand .rooms immer auf scrollLeft 0 (Schiene per
// transform), ein Zug bewegte nichts und das Loslassen sprang auf eine Seite.
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
  const btns = [...rooms.querySelectorAll('.route')];
  const last = btns[btns.length - 1].getBoundingClientRect();
  const ml = sr.querySelector('.more-l'), cs = getComputedStyle(ml);
  const home = sr.querySelector('.route.home');
  return { sl: rooms.scrollLeft, max: rooms.scrollWidth - rooms.clientWidth,
    rooms: { l: rr.left, r: rr.right, y: rr.top + rr.height / 2, w: rr.width }, lastR: last.right,
    bar: sr.querySelector('.bar').getBoundingClientRect().width, home: home ? home.getBoundingClientRect().left : null,
    leftShown: cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.5 && cs.pointerEvents !== 'none' && ml.getAttribute('aria-hidden') !== 'true',
    leftGone: (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) && cs.pointerEvents === 'none'
      && ml.getAttribute('aria-hidden') === 'true' && ml.tabIndex < 0,
    leftW: ml.getBoundingClientRect().width };
}, NAV);
const scrollLeft = (page) => page.evaluate((NAV) => eval(NAV).shadowRoot.querySelector('.rooms').scrollLeft, NAV);
const toStart = (page) => page.evaluate((NAV) => { eval(NAV).shadowRoot.querySelector('.rooms').scrollLeft = 0; }, NAV);

for (const [name, vp] of [['Tablet quer 1180', { width: 1180, height: 820 }], ['Tablet hochkant 820', { width: 820, height: 1180 }]]) {
  const { page, context } = await open({ ...vp, mobile: true, touch: true, userAgent: IPAD_UA, dark: false, theme: 'Casora', scale: 1 });
  usePage(page);
  await ready(page, url, () => window.__pierce('casora-nav-bar').some((e) => e.getClientRects().length), 90000);
  await page.waitForTimeout(3000);
  await toStart(page); await page.waitForTimeout(400);
  const s = await state(page);
  await need(name + ': Raumleiste läuft über', s && s.max > 40, s);
  await check(name + ': bei scrollLeft 0 linker Pfeil unsichtbar, aria-hidden, nicht fokussierbar (Platz bleibt)', s.sl === 0 && s.leftGone && s.leftW > 0, s);

  const cdp = await context.newCDPSession(page);
  const t = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: s.rooms.y, id: 1 }] });

  // 1) Langsamer Zug nach links (12 × 15 px), dann kurz still halten und loslassen.
  const x0 = s.rooms.l + s.rooms.w * 0.8;
  const seen = [];
  await t('touchStart', x0);
  for (let i = 1; i <= 12; i++) { await t('touchMove', x0 - i * 15); await page.waitForTimeout(30); seen.push(await scrollLeft(page)); }
  await page.waitForTimeout(250);
  await t('touchMove', x0 - 180); await page.waitForTimeout(250);
  const held = await scrollLeft(page);
  await t('touchEnd');
  await page.waitForTimeout(1200);
  const e = await state(page);
  const rising = seen.every((v, i) => !i || v >= seen[i - 1]) && new Set(seen).size >= 8;
  // Nach dem Anfangs-Schlupf (≤ 1 Schritt) liegt scrollLeft je Schritt höchstens einen Frame hinter dem
  // Finger: Fingerweg i·15 minus Schlupf, ±1 Schritt – keine Sprünge (Seite), kein Stillstand.
  const lag = seen.map((v, i) => (i + 1) * 15 - v);
  await check(name + ': Zug – scrollLeft folgt stetig dem Finger (' + seen.join(',') + ')',
    rising && lag.every((d) => d >= -1 && d <= 31), { seen, lag });
  await check(name + ': nach dem Loslassen bleibt die Reihe stehen, wo sie aufhört (' + held + ' → ' + e.sl + ', kein Einrasten)',
    held > 100 && Math.abs(e.sl - held) <= 1, { held, nach: e.sl });
  await check(name + ': nach dem Wischen linker Pfeil sichtbar und bedienbar', e.leftShown, e);
  await check(name + ': Zuhause und Breite fest', Math.abs(e.bar - s.bar) <= 1 && (s.home == null || Math.abs(e.home - s.home) <= 1),
    { vorher: [s.bar, s.home], nachher: [e.bar, e.home] });

  // 2) Kräftige Wische bis ans Ende: letzter Raum bündig, kein Leerraum rechts.
  for (let k = 0; k < 8; k++) {
    if ((await scrollLeft(page)) >= s.max - 1) break;
    await t('touchStart', x0);
    for (let i = 1; i <= 5; i++) { await t('touchMove', x0 - i * s.rooms.w * 0.12); await page.waitForTimeout(12); }
    await t('touchEnd');
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(600);
  const z = await state(page);
  await check(name + ': am Ende scrollLeft === max (' + z.sl + '/' + z.max + ')', Math.abs(z.sl - z.max) <= 1, z);
  await check(name + ': letzter Raum bündig rechts, kein Leerraum (' + (z.rooms.r - z.lastR).toFixed(1) + ' px)', Math.abs(z.rooms.r - z.lastR) <= 1.5, z);
  await check(name + ': Zuhause und Breite auch am Ende fest', Math.abs(z.bar - s.bar) <= 1 && (s.home == null || Math.abs(z.home - s.home) <= 1),
    { vorher: [s.bar, s.home], nachher: [z.bar, z.home] });

  // 3) Zurück an den Anfang: linker Pfeil wieder weg.
  await toStart(page); await page.waitForTimeout(500);
  const a = await state(page);
  await check(name + ': zurück bei 0 – linker Pfeil wieder unsichtbar', a.sl === 0 && a.leftGone, a);
  await page.close();
}

await finish();
