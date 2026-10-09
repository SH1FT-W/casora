// @zustand: arbeit
// Gemeldet: Am iPhone (WebKit) schimmerten weiße Kacheln und Texte durch die Popup-Fläche,
// weil WebKit den Blur hinter dem Popup nicht malt. Erwartet: in WebKit unter 600 px ist
// die Popup-Fläche deckend (Deckkraft 1).
import { open, casoraDashboards, dashboard, cards, check, need, finish } from './lib.mjs';

// Kandidaten der Reihe nach: das erste Handy-Dashboard, dessen Startseite eine Licht-/Jalousie-/
// Popup-Kachel zeigt („Test Neu“ hat dort z. B. nur Solar-Tipp, Lüften, Auto …).
const all = await casoraDashboards();
const cands = all.filter((d) => !d.mobile && all.some((p) => p.url === d.url + '-mobile'));
await need('Casora-Dashboard mit Handy-Gegenstück', cands.length);
const { page } = await open({ width: 390, height: 844, mobile: true, safari: true });
const isPop = (c) => c.t.some((x) => /casora_popup_|casora_light$|casora_cover/.test(x)) && c.y > 150 && c.y < 700;
let tiles = [];
let seen = [];
for (const d of cands) {
  const ph = all.find((p) => p.url === d.url + '-mobile');
  await dashboard(page, ph.url + '/' + (ph.config.views[0].path || '0'));
  const cs = await cards(page);
  tiles = cs.filter(isPop);
  seen = cs.map((c) => c.t.join('+')).slice(0, 10);
  if (tiles.length) break;
}
await need('Kachel mit Popup auf der Handy-Startseite', tiles.length, seen);
// Auf das Popup warten statt fest 2,5 s; die Kacheln sortieren sich am Handy nach Zustand um (aktive
// vorn) – war das Popup nicht offen, Lage neu messen und noch einmal tippen (09.10.2026: im Gate rot).
const opened = () => page.waitForFunction(() => window.__pierce('casora-popup').some((p) => {
  const el = p.shadowRoot && p.shadowRoot.querySelector('.glass'); const r = el && el.getBoundingClientRect();
  return r && r.width > 100 && r.height > 100; }), null, { timeout: 8000 }).then(() => true, () => false);
for (let i = 0; i < 3; i++) {
  const now = i ? (await cards(page)).filter(isPop) : tiles;
  const t = now.find((x) => x.t.join('+') === tiles[0].t.join('+') && x.text === tiles[0].text) || now[0] || tiles[0];
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
  if (await opened()) break;
}
await page.waitForTimeout(600);   // Einblenden fertig
const g = await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => p.shadowRoot && p.shadowRoot.querySelector('.glass'));
  if (!pop) return null;
  const el = pop.shadowRoot.querySelector('.glass');
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/);
  const parts = m ? m[1].split(/[ ,/]+/).filter(Boolean).map(Number) : [];
  return { bg: cs.backgroundColor, alpha: parts.length > 3 ? parts[3] : (parts.length ? 1 : 0), w: r.width, h: r.height, flat: pop.hasAttribute('flat') };
});
await check('Popup öffnet sich in WebKit', g && g.w > 100 && g.h > 100, g);
if (g && !g.flat) await check('Popup-Fläche deckend (Deckkraft 1)', g.alpha >= 0.99, g);
await finish();
