// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Gemeldet (Personas 10.10.2026, per-01): Raumleiste mit vielen Räumen läuft über, aber direkt nach
// dem Laden fehlte der rechte Pfeil (.bar ohne more-r-on, Liste ohne fade-r); das Mausrad blätterte
// die Leiste nicht – mit der Maus waren Räume ab „Küche“ unerreichbar (Desktop 1440 + Tablet 1024).
// Erwartet: läuft die Leiste über, ist der rechte Pfeil nach dem Laden sichtbar; Mausrad (senkrecht)
// über der Leiste blättert sie nach rechts, danach ist auch der linke Pfeil da.
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

const state = (page) => page.evaluate(() => {
  const nav = window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0];
  if (!nav) return null;
  const sc = nav.shadowRoot.querySelector('.scroller');
  const bar = nav.shadowRoot.querySelector('.bar');
  const r = sc.getBoundingClientRect();
  const more = nav.shadowRoot.querySelector('.more-r');
  return {
    over: sc.scrollWidth - sc.clientWidth, left: Math.round(sc.scrollLeft),
    moreR: bar.classList.contains('more-r-on') && getComputedStyle(more).opacity === '1',
    moreL: bar.classList.contains('more-l-on'), fadeR: sc.classList.contains('fade-r'),
    x: r.left + r.width / 2, y: r.top + r.height / 2,
  };
});

for (const [name, dev] of GERAETE) {
  const { page } = await open(dev);
  usePage(page);
  await ready(page, url, () => window.__pierce('casora-nav-bar').some((e) => e.getClientRects().length), 90000);
  await page.waitForTimeout(2500);
  const s = await state(page);
  await need(name + ': Raumleiste da', s, s);
  if (s.over <= 2) { await check(name + ': Leiste läuft über (sonst nichts zu prüfen)', false, s); continue; }
  await check(name + ': rechter Pfeil + Verlauf nach dem Laden sichtbar', s.moreR && s.fadeR, s);
  // Erst ganz nach links (aktiver Raum steht ggf. in der Mitte), dann per Mausrad blättern.
  await page.evaluate(() => { const nav = window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0]; nav.shadowRoot.querySelector('.scroller').scrollLeft = 0; });
  await page.waitForTimeout(300);
  await page.mouse.move(s.x, s.y);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  const t = await state(page);
  await check(name + ': Mausrad blättert die Leiste (scrollLeft ' + t.left + ' > 0)', t.left > 0, t);
  await check(name + ': danach linker Pfeil sichtbar', t.moreL, t);
  await page.close();
}

await finish();
