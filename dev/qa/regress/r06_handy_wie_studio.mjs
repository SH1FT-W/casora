// @zustand: arbeit
// Gemeldet: Das Handy zeigte andere Räume, alte Namen oder eine andere Reihenfolge als
// das Studio (u. a. beim ersten Laden ungefiltert alle Abschnitte). Erwartet: Menü
// „Räume“ am Handy = Räume des Studios in derselben Reihenfolge, Raumseite mit dem Namen.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => true);
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

// 1) Räume laut Studio
const s = await open();
await studio(s.page, dash.url);
const want = await s.page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  return p._state.compact.rooms.filter((r) => !I.isHomeRoom(r) && !(r.variables && r.variables.hide_on_phone))
    .map((r) => p._roomLabel(r));
});
await s.browser.close();

// 2) Handy: gleich beim ersten Laden, dann Menü „Räume“
const { page } = await open({ width: 390, height: 844, mobile: true });
usePage(page);
await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'));
const leaves = () => page.evaluate(() => {
  const out = [];
  window.__pierce('span, div').forEach((e) => {
    if (e.children.length || !e.offsetParent) return;
    const t = e.textContent.trim(); const r = e.getBoundingClientRect();
    if (t && r.y > 0 && r.y < innerHeight && r.width > 0) out.push({ t, x: Math.round(r.x), y: Math.round(r.y) });
  });
  return out;
});
const clicked = await page.evaluate(() => {
  const b = window.__pierce('button.hmn-btn').find((x) => /Räume|Rooms/.test(x.textContent));
  if (b) b.click();
  return !!b;
});
await need('Handy-Leiste mit „Räume“', clicked);
await page.waitForTimeout(1800);
// Viele Räume (Zustand „stress“: 27) passen nicht auf den Bildschirm – das Menü scrollt.
// Deshalb wie ein Nutzer durchscrollen und nur Zeilen zählen, die im Menü sichtbar sind
// (nicht vom Menürand abgeschnitten). Vorher fehlten dort 13 Räume ohne Hinweis.
const menuRows = () => page.evaluate(() => {
  const m0 = document.querySelector('.hmn-menu'); if (!m0) return [];
  // Casora-Look (Blatt von unten): die Liste unter dem Kopf scrollt, der Name steht in .hmn-name.
  const m = m0.querySelector('.hmn-list') || m0;
  const mr = m.getBoundingClientRect();
  return [...m.querySelectorAll('.hmn-item')].map((b) => {
    const r = b.getBoundingClientRect(), s = b.querySelector('.hmn-name') || b.lastElementChild;
    return { t: s.textContent.trim(), x: Math.round(s.getBoundingClientRect().x), y: Math.round(r.y),
      vis: r.top >= mr.top - 1 && r.top + r.height / 2 <= mr.bottom };
  }).filter((l) => l.vis);
});
const seen = new Map();
for (let i = 0; i < 20; i++) {
  (await menuRows()).forEach((l) => { if (!seen.has(l.t)) seen.set(l.t, l); });
  const end = await page.evaluate(() => { const m0 = document.querySelector('.hmn-menu'), m = m0 && (m0.querySelector('.hmn-list') || m0);
    if (!m || m.scrollTop + m.clientHeight >= m.scrollHeight - 1) return true; m.scrollTop += m.clientHeight * 0.6; return false; });
  if (end) break;
  await page.waitForTimeout(150);
}
await page.evaluate(() => { const m0 = document.querySelector('.hmn-menu'), m = m0 && (m0.querySelector('.hmn-list') || m0); if (m) m.scrollTop = 0; });
await page.waitForTimeout(200);
// Die Menüzeilen stehen untereinander in einer Spalte.
const col = [...seen.values()].filter((l) => want.includes(l.t));
const x0 = col.length ? col[0].x : 0;
const got = col.filter((l) => Math.abs(l.x - x0) < 8).map((l) => l.t);
const cut = await page.evaluate(() => [...document.querySelectorAll('.hmn-menu .hmn-item')].some((b) => {
  const s = b.querySelector('.hmn-name') || b.lastElementChild, m = b.parentNode.getBoundingClientRect(), r = s.getBoundingClientRect();
  return r.right > m.right + 1 || (s.scrollWidth > s.clientWidth + 1 && getComputedStyle(s).textOverflow !== 'ellipsis');
}));
await check('Handy-Menü „Räume“: lange Namen laufen nicht über den Rand (… statt abgeschnitten)', !cut);
await check('Handy-Menü „Räume“: gleiche Räume wie im Studio', want.every((n) => got.includes(n)) && got.length === want.length, { studio: want, handy: got });
await check('Handy-Menü „Räume“: gleiche Reihenfolge wie im Studio', JSON.stringify(got) === JSON.stringify(want.filter((n) => got.includes(n))), { studio: want, handy: got });

// 3) Räume öffnen: Seitentitel = Name im Studio. Der zweite Raum und der mit dem längsten
//    Namen (steht im Zustand „stress“ weit unten – das Menü muss dorthin scrollen).
const longest = got.slice().sort((a, b) => b.length - a.length)[0];
for (const name of [...new Set([got[Math.min(1, got.length - 1)], longest])].filter(Boolean)) {
  if (!(await page.evaluate(() => !!document.querySelector('.hmn-menu')))) {
    // Im offenen Raum trägt der Knopf den Raumnamen statt „Räume“: zweiter Knopf der Leiste.
    await page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._bRooms.click());
    await page.waitForTimeout(1200);
  }
  await page.evaluate((n) => { const b = [...document.querySelectorAll('.hmn-menu .hmn-item')].find((x) => (x.querySelector('.hmn-name') || x.lastElementChild).textContent.trim() === n);
    if (b) b.scrollIntoView({ block: 'center' }); }, name);
  await page.waitForTimeout(300);
  const hit = (await menuRows()).find((l) => l.t === name);
  if (!hit) { await check(`Raum „${name}“ im Menü erreichbar`, false); continue; }
  await page.mouse.click(hit.x + 10, hit.y + 20);
  await page.waitForTimeout(2500);
  const top = (await leaves()).filter((l) => l.y < 140).map((l) => l.t);
  await check(`Raumseite „${name}“ zeigt ihren Namen`, top.includes(name), top);
}
await finish();
