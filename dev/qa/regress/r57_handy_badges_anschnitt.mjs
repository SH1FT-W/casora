// @zustand: arbeit
// @parallel: ui
// Gemeldet (08.10.2026, iPhone, Casora-Look dunkel): Auf der Startseite standen die Badges
// (Sicherheit, Klima, Beleuchtung …) mit deutlich größerem Abstand als in den Räumen. Ursachen:
// 1) Endete ein Badge am Rand, wurden die sichtbaren Badges künstlich breiter (leerer Platz rechts
//    im Badge wirkte wie ein doppelter Abstand). Das ist wieder raus.
// 2) Die Startseite nahm 10 px Abstand aus dem Grund-Theme, die Raum-Chips 8 px.
// Erwartet im Casora-Look bei 375, 393 und 430 px (WebKit): Abstand zwischen den Badges der
// Startseite = Abstand in einem Raum (±1 px), kein Badge mit fest gesetzter Mindestbreite, und
// jedes Badge so breit wie sein Inhalt (gleiche Breite bei allen Bildschirmbreiten).
import { open, casoraDashboards, dashboard, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const phone = all.find((d) => d.mobile && JSON.stringify(d.config).includes('casora_mobile_filter_badges'));
await need('Handy-Dashboard mit Badge-Reihe', phone);

// Badge-Reihen im sichtbaren Bereich: Badges nach Zeile gruppiert, mit Abständen.
const rows = (page) => page.evaluate(() => {
  const top = window.__pierce('#badges').find((x) => x.getBoundingClientRect().width > 0);
  const inTop = (b) => { for (let e = b; e; e = e.parentNode || e.host) if (e === top) return true; return false; };
  const bs = window.__pierce('button-card')
    .filter((b) => { const t = String(b._config && b._config.template); return /casora_badge/.test(t) && !/popup/.test(t); })
    .map((b) => ({ b, q: b.getBoundingClientRect() }))
    .filter((x) => x.q.width > 0 && x.q.height > 20 && x.q.height < 80 && x.q.top >= 0 && x.q.top < innerHeight);
  const by = {};
  for (const x of bs) { const k = (inTop(x.b) ? 'start' : 'raum') + Math.round(x.q.top); (by[k] = by[k] || []).push(x); }
  return Object.entries(by).filter(([, xs]) => xs.length > 1).map(([k, xs]) => {
    xs.sort((a, b) => a.q.left - b.q.left);
    return {
      k, start: k.startsWith('start'),
      w: xs.map((x) => Math.round(x.q.width * 10) / 10),
      gaps: xs.slice(1).map((x, i) => Math.round((x.q.left - xs[i].q.right) * 10) / 10),
      mw: xs.filter((x) => x.b.style.minWidth).length,
    };
  });
});

const widths = {};
for (const w of [375, 393, 430]) {
  const { page } = await open({ width: w, height: 900, mobile: true, safari: true, scale: 2, dark: w === 430, theme: 'Casora' });
  await dashboard(page, phone.url, 3);
  await page.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
  await page.waitForTimeout(1500);
  const soft = await page.evaluate(() => !!(window._casoraSoft && window._casoraSoft(true)));
  await check(w + ' px: Casora-Look aktiv', soft);
  const start = (await rows(page)).find((r) => r.start);
  if (!await check(w + ' px: Badge-Reihe der Startseite gefunden', start)) continue;
  widths[w] = start.w;
  await check(w + ' px: kein Badge künstlich verbreitert', !start.mw, start);
  const keys = (await page.evaluate(() => {
    const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
    return n ? n._rooms.map((r) => r.key) : [];
  })).filter((k) => /^room_/.test(k) && k !== 'room_scenes');
  let raum = null;
  for (const k of keys) {
    await page.evaluate((key) => window._casoraFilter.set(key), k);
    await page.waitForTimeout(1500);
    raum = (await rows(page)).find((r) => !r.start);
    if (raum) break;
  }
  if (!await check(w + ' px: Raum mit mehreren Badges gefunden', raum, keys)) continue;
  const ref = raum.gaps[0];
  await check(w + ' px: Abstand Startseite = Raum (±1 px)', [...start.gaps, ...raum.gaps].every((g) => Math.abs(g - ref) <= 1),
    { start: start.gaps, raum: raum.gaps });
}
const ws = Object.values(widths);
await check('Badges an allen Breiten gleich breit (nichts gedehnt)',
  ws.length > 1 && ws.every((x) => x.length === ws[0].length && x.every((v, i) => Math.abs(v - ws[0][i]) <= 1)), widths);
await finish();
