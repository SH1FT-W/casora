// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Raumleiste A „Feinschliff“ (1.3, navbar nav-01/nav-04): beim Antippen eines Raums rückte die ganze
// Leiste 100–160 px, weil der neue Raum in die Mitte gescrollt wurde. Danach (bis 30b08914) blätterte sie
// seitenweise mit nur ganzen Namen – Nutzerwunsch (11.10.2026): „ich will nicht das die leiste springt oder so
// also ganze räume anzeigt...sondern wenn ich nur ganz bisschen scrolle sollen auch halbe räume angezeigt
// werden“.
// Erwartet (Desktop 1440, Tablet 1024 quer, Tablet 768 hoch, viele Räume): Zuhause steht fest vorn, die
// Raumreihe (.rooms) scrollt frei. Bei scrollLeft 0 beginnt der erste Raum direkt hinter dem Trenner, der
// linke Pfeil ist weg und links läuft nichts aus. Schon ein wenig Scrollen (30 px) bleibt so stehen –
// halbe Namen am Rand sind erlaubt und laufen weich aus (mask-image, links erst ab scrollLeft > 0).
// Antippen eines ganz sichtbaren Raums verschiebt nichts (scrollLeft ±1, alle Namen am Platz). Ein
// Raumwechsel von woanders auf einen nicht sichtbaren Raum holt ihn ganz ins Bild. Am Ende schließt der
// letzte Raum bündig rechts ab. Zuhause und Leistenbreite bleiben dabei fest. Mit wenigen Räumen
// (ausreichend Platz): kein Scrollen, kein Pfeil.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, ready, casoraDashboards, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const desks = all.filter((d) => !d.mobile).sort((a, b) => (b.config.views || []).length - (a.config.views || []).length);
const dash = desks[0];
await need('Casora-Dashboard mit vielen Räumen', dash && (dash.config.views || []).length >= 8, all.map((d) => d.url));
const views = dash.config.views.map((v) => v.path).filter(Boolean);
const url = '/' + dash.url + '/' + (views[Math.min(6, views.length - 1)] || '');

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const GERAETE = [
  ['Desktop 1440', { width: 1440, height: 900 }],
  ['Tablet 1024', { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA }],
  ['Tablet 768', { width: 768, height: 1024, mobile: true, touch: true, userAgent: IPAD_UA }],
];

const NAV = `window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0]`;
const state = (page) => page.evaluate((NAV) => {
  const nav = eval(NAV);
  if (!nav) return null;
  const sr = nav.shadowRoot;
  const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, y: r.top + r.height / 2 }; };
  const bar = sr.querySelector('.bar'), rooms = sr.querySelector('.rooms');
  const lab = (b) => (b.querySelector('.htx') || b.querySelector('.label')).textContent.trim();
  const ml = sr.querySelector('.more-l'), mcs = ml && getComputedStyle(ml);
  const mr = sr.querySelector('.more-r'), rcs = mr && getComputedStyle(mr);
  const shown = (m, c) => !!m && m.getBoundingClientRect().width > 0 && c.visibility !== 'hidden' && parseFloat(c.opacity) > 0.1;
  const rcs2 = rooms ? getComputedStyle(rooms) : null;
  const home = sr.querySelector('.route.home');
  const sep = home && home.nextElementSibling;
  return {
    bar: R(bar), rooms: rooms ? R(rooms) : null, paged: bar.classList.contains('paged'),
    sl: rooms ? rooms.scrollLeft : 0, max: rooms ? rooms.scrollWidth - rooms.clientWidth : 0,
    pad: rooms ? parseFloat(rooms.style.getPropertyValue('--pg-pad')) || 0 : 0,
    fl: rcs2 ? rcs2.getPropertyValue('--fl').trim() : '', fr: rcs2 ? rcs2.getPropertyValue('--fr').trim() : '',
    mask: rcs2 ? (rcs2.maskImage || rcs2.webkitMaskImage || '') : '',
    home: home ? R(home) : null, sepR: sep && sep !== rooms ? sep.getBoundingClientRect().right : null,
    list: [...sr.querySelectorAll('.rooms .route')].map((b) => ({ name: lab(b), active: b.classList.contains('active'), ...R(b) })),
    leftGone: !!ml && (mcs.visibility === 'hidden' || parseFloat(mcs.opacity) === 0) && mcs.pointerEvents === 'none'
      && ml.getAttribute('aria-hidden') === 'true' && ml.tabIndex < 0,
    leftShown: shown(ml, mcs), rightShown: shown(mr, rcs), rOn: bar.classList.contains('more-r-on'),
  };
}, NAV);
const setLeft = (page, x) => page.evaluate(([x, NAV]) => { eval(NAV).shadowRoot.querySelector('.rooms').scrollLeft = x; }, [x, NAV]);
// Ganz sichtbar = zwischen linkem Pfeil-Platz (nur wenn links etwas verborgen ist) und rechtem Rand.
const fully = (s, v) => v.l >= s.rooms.l + (s.sl > 0 ? s.pad : 0) - 1 && v.r <= s.rooms.r + 1;
const part = (s, v) => !fully(s, v) && v.r > s.rooms.l + 1 && v.l < s.rooms.r - 1;

for (const [name, dev] of GERAETE) {
  const { page } = await open(dev);
  usePage(page);
  await ready(page, url, () => window.__pierce('casora-nav-bar').some((e) => e.getClientRects().length), 90000);
  await page.waitForTimeout(3000);
  const s0 = await state(page);
  await need(name + ': Raumleiste da und läuft über', s0 && s0.paged && s0.max > 30, s0);
  await check(name + ': Zuhause fest vorn', s0.home && s0.home.r <= s0.rooms.l + 1, { home: s0.home, rooms: s0.rooms });
  const act0 = s0.list.find((v) => v.active);
  await check(name + ': aktiver Raum nach dem Laden ganz im Bild', act0 && fully(s0, act0), { act0, sl: s0.sl, rooms: s0.rooms });

  // Anfang: erster Raum direkt hinter dem Trenner, kein linker Pfeil, links kein Auslauf.
  await setLeft(page, 0); await page.waitForTimeout(400);
  const a = await state(page);
  await check(name + ': bei scrollLeft 0 beginnt der erste Raum direkt am Anfang der Reihe (hinter dem Trenner)',
    Math.abs(a.list[0].l - a.rooms.l) <= 1 && (a.sepR == null || a.list[0].l >= a.sepR - 1), { first: a.list[0], rooms: a.rooms, sep: a.sepR });
  await check(name + ': bei scrollLeft 0 linker Pfeil unsichtbar, aria-hidden, nicht fokussierbar; links kein Auslauf',
    a.leftGone && !a.leftShown && (a.fl === '' || a.fl === '0px'), { fl: a.fl, mask: a.mask });
  await check(name + ': rechts läuft die Reihe weich aus (mask-image, vor dem Pfeil)', a.rightShown && /linear-gradient/.test(a.mask) && a.fr !== '', { fr: a.fr, mask: a.mask });

  // Wenig scrollen: bleibt genau dort, halbe Namen erlaubt, links läuft es jetzt aus.
  await setLeft(page, 30); await page.waitForTimeout(500);
  const b = await state(page);
  await check(name + ': 30 px scrollen bleibt stehen (scrollLeft ' + b.sl + ', kein Einrasten)', Math.abs(b.sl - 30) <= 1, b.sl);
  const halbe = b.list.filter((v) => part(b, v)).map((v) => v.name);
  await check(name + ': halbe Namen am Rand erlaubt (' + halbe.length + ')', halbe.length >= 1, { halbe });
  await check(name + ': linker Pfeil sichtbar, links läuft die Reihe weich aus', b.leftShown && !b.leftGone && b.fl !== '' && b.fl !== '0px', { fl: b.fl });
  // Unter dem linken Pfeil (im Dunklen durchscheinend) bleibt die Reihe ganz ausgeblendet – kein Text unter dem Pfeil.
  const clear = [...b.mask.matchAll(/rgba\(0, 0, 0, 0\) ([\d.]+)px/g)].map((m) => parseFloat(m[1]));
  await check(name + ': unter dem linken Pfeil nichts sichtbar (Maske bis ' + Math.max(0, ...clear) + ' px durchsichtig, Pfeil-Platz ' + b.pad + ' px)',
    b.pad > 0 && clear.some((x) => x >= b.pad - 1), { mask: b.mask, pad: b.pad });
  await check(name + ': Zuhause und Breite fest beim Scrollen', Math.abs(b.home.l - a.home.l) <= 1 && Math.abs(b.bar.w - a.bar.w) <= 1, [a.bar, b.bar]);

  // Antippen eines ganz sichtbaren, nicht aktiven Raums: nichts verschiebt sich.
  const target = b.list.filter((v) => fully(b, v) && !v.active).slice(-1)[0];
  await need(name + ': ganz sichtbarer, nicht aktiver Raum', target, b.list);
  await page.mouse.click((target.l + target.r) / 2, target.y);
  await page.waitForTimeout(2500);
  const t = await state(page);
  const act = t.list.find((v) => v.active);
  await check(name + ': angetippter Raum ist aktiv', act && act.name === target.name, { target: target.name, act });
  await check(name + ': Antippen verschiebt nichts (scrollLeft ' + b.sl + ' → ' + t.sl + ')', Math.abs(t.sl - b.sl) <= 1, { vorher: b.sl, nachher: t.sl });
  const moved = b.list.map((v, i) => Math.round(t.list[i].l - v.l));
  await check(name + ': alle Namen ±1 px an ihrem Platz, Zuhause und Breite fest',
    moved.every((d) => Math.abs(d) <= 1) && Math.abs(t.home.l - b.home.l) <= 1 && Math.abs(t.bar.w - b.bar.w) <= 1, { moved });

  // Raumwechsel von woanders auf einen Raum ganz rechts außerhalb: er kommt ganz ins Bild.
  await setLeft(page, 0); await page.waitForTimeout(400);
  const c = await state(page);
  const hidden = c.list.map((v, i) => ({ ...v, i })).filter((v) => v.l >= c.rooms.r).slice(-1)[0];
  await need(name + ': Raum außerhalb des Bilds', hidden, c.list);
  // Ziel aus der Route des Knopfs (wie beim Antippen), angesteuert über die Adresse – nicht über die Leiste.
  const to = await page.evaluate(([i, NAV]) => { const nav = eval(NAV), el = nav._els.filter((x) => x.room)[i];
    const r = el && el.route, ta = r && r.tap_action; return r && (r.url || (ta && ta.navigation_path)) || null; }, [hidden.i, NAV]);
  await need(name + ': Ziel des Raums', to, { i: hidden.i });
  await page.evaluate((u) => { history.pushState(null, '', u); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }, to);
  await page.waitForTimeout(2000);
  const d = await state(page);
  const h = d.list[hidden.i];
  await check(name + ': Raumwechsel holt den verborgenen Raum ganz ins Bild (' + hidden.name + ')', h.active && fully(d, h), { h, rooms: d.rooms, sl: d.sl, pad: d.pad });
  await check(name + ': Zuhause und Breite fest beim Raumwechsel', Math.abs(d.home.l - a.home.l) <= 1 && Math.abs(d.bar.w - a.bar.w) <= 1, [a.bar, d.bar]);

  // Ende: letzter Raum bündig rechts.
  await setLeft(page, 1e6); await page.waitForTimeout(500);
  const e = await state(page);
  const last = e.list[e.list.length - 1];
  await check(name + ': am Ende scrollLeft === max, letzter Raum bündig rechts, rechter Pfeil blass, kein Auslauf (' + (e.rooms.r - last.r).toFixed(1) + ' px)',
    Math.abs(e.sl - e.max) <= 1 && Math.abs(e.rooms.r - last.r) <= 1.5 && !e.rOn && (e.fr === '' || e.fr === '0px'), { sl: e.sl, max: e.max, last, rooms: e.rooms });
  await page.close();
}

// Ausreichende Breite: wenige Räume passen – kein Scrollen, kein Pfeil.
const few = desks.filter((d) => (d.config.views || []).length >= 3).slice(-1)[0];
if (few && few !== dash) {
  const { page } = await open({ width: 1440, height: 900 });
  usePage(page);
  await ready(page, '/' + few.url, () => window.__pierce('casora-nav-bar').some((e) => e.getClientRects().length), 90000);
  await page.waitForTimeout(2500);
  const f = await state(page);
  await need('Wenige Räume: Raumleiste da', f && f.list.length >= 1, f);
  await check('Wenige Räume (Desktop 1440): kein Scrollen, kein Pfeil', f.max <= 1 && !f.leftShown && !f.rightShown && !f.paged, { max: f.max, paged: f.paged });
  await page.close();
} else {
  await check('Dashboard mit wenigen Räumen für die Breiten-Prüfung', false, desks.map((d) => d.url));
}

await finish();
