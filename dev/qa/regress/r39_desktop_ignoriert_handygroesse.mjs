// @zustand: arbeit
// @parallel: allein   (legt qa-groesse(-mobile) als Kopie von qa-arbeit an und löscht sie am Ende)
// Gemeldet (1.0.4): Seit die Handy-Größen aus Hemma an die Raum-Kacheln übernommen werden,
// tragen auch Desktop-Kacheln „variables.size: large“ (Studio-Feld „Size on phone“, gespiegelt
// aufs Handy). Der Desktop las das mit: die Kachelreihe zerfiel in zwei Reihen mit Lücken,
// Kacheln rutschten nach unten aus dem Bild.
// Erwartet: Desktop (1440) – dieselbe Reihe mit großen Kacheln bleibt einreihig, alle Kacheln
// gleich hoch, gleiche Abstände, nichts unter dem Bildrand. Handy (390) – dieselben Kacheln sind
// groß (doppelt so hoch wie eine kleine).
import { open, check, need, finish, usePage, BASE, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const DASH = 'qa-groesse';
const BIG = [0, 1, 4];  // Licht, Thermostat, erste Medien-Kachel im Wohnzimmer
const tpl = (x) => [].concat(x.template || []);
const big = (x) => { x.variables = { ...(x.variables || {}), size: 'large' }; };
const rowsIn = (o, out = []) => {
  if (Array.isArray(o)) o.forEach((x) => rowsIn(x, out));
  else if (o && typeof o === 'object') {
    if (o.type === 'custom:casora-smart-row') out.push(o);
    for (const k of Object.keys(o)) if (k !== 'variables') rowsIn(o[k], out);
  }
  return out;
};

const c = await ws();
let made = false;
async function cleanup() {
  // settheme (Weich dunkel, unten) landet in den Benutzerdaten auf dem Server und bliebe für
  // spätere Tests stehen (r20 sah dann ein dunkles Studio trotz HA hell) – zurücksetzen.
  try { await c.cmd({ type: 'frontend/set_user_data', key: 'theme', value: null }); } catch (e) { /* egal */ }
  if (!made || process.env.R39_KEEP) return;
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  for (const d of list.filter((x) => x.url_path === DASH || x.url_path === DASH + '-mobile')) {
    try { await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); } catch (e) { /* schon weg */ }
  }
  made = false;
}
atFinish(cleanup);  // auch wenn need() abbricht
let desk = null, mob = null;
try {
  desk = await c.cmd({ type: 'lovelace/config', url_path: 'qa-arbeit' });
  mob = await c.cmd({ type: 'lovelace/config', url_path: 'qa-arbeit-mobile' });
} catch (e) { /* need() unten */ }
await need('Dashboard qa-arbeit(-mobile) im Zustand arbeit', desk && mob);
const wz = (desk.views || []).find((v) => v.path === 'wohnzimmer');
const drow = wz && rowsIn(wz)[0];
const mrow = (mob.views[0].cards || []).find((x) => x.type === 'custom:casora-smart-row');
const wzm = mrow && mrow.cards[mrow.cards.findIndex((x) => tpl(x).includes('casora_mobile_header') && x.name === 'Wohnzimmer') + 1];
await need('Wohnzimmer mit mindestens 6 Kacheln (Desktop und Handy)',
  drow && drow.cards.length >= 6 && wzm && (wzm.cards || []).length >= 6);
BIG.forEach((i) => { big(drow.cards[i]); big(wzm.cards[i]); });
// Startseite: die ersten beiden Kacheln der Reihe ebenfalls groß.
// Startseite wie gemeldet: die Hemma-Startseite (bedingte Karten, Swipe-Stapel), jede zweite
// Kachel groß – bei bedingten Karten die innere, wie der Umzug sie setzt.
let hemma = null;
try { hemma = await c.cmd({ type: 'lovelace/config', url_path: 'dashboard-hemma' }); } catch (e) { /* need() unten */ }
const hhome = hemma && (hemma.views || []).find((v) => v.path === 'home');
await need('Hemma-Startseite (dashboard-hemma) im Zustand arbeit', hhome && rowsIn(hhome)[0]);
rowsIn(hhome)[0].cards.forEach((x, i) => {
  if (i % 2) return;
  let t = x; for (let d = 0; t && t.type === 'conditional' && t.card && d < 4; d++) t = t.card;
  big(t);
});
desk.views = desk.views.map((v) => (v.path === 'home' ? hhome : v));
{
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  for (const [url, cfg, title] of [[DASH, desk, 'QA Größe'], [DASH + '-mobile', mob, 'QA Größe Handy']]) {
    if (!list.some((x) => x.url_path === url)) {
      await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
    }
    made = true;
    await c.cmd({ type: 'lovelace/config/save', url_path: url, config: cfg });
  }
}

try {
  // ── Desktop (Look „Casora“, wie gemeldet): Reihe einreihig, gleiche Höhe, gleiche Abstände, im Bild ──
  for (const [view, min] of [['home', 4], ['wohnzimmer', 6]]) {
    const { page, browser, context } = await open({ width: 1440, height: 900 });
    await context.addInitScript(() => localStorage.setItem('dockedSidebar', JSON.stringify('always_hidden')));
    usePage(page);
    await page.goto(BASE + '/' + DASH + '/' + view, { waitUntil: 'domcontentloaded' });
    const { PIERCE } = await import('../../e2e/harness.mjs');
    await page.addScriptTag({ content: PIERCE });
    await page.waitForFunction(() => document.querySelector('home-assistant') && document.querySelector('home-assistant').hass, null, { timeout: 60000 });
    await page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('settheme',
      { detail: { theme: 'Casora', dark: true }, bubbles: true, composed: true })));
    const tiles = (min) => {
      const row = window.__pierce('casora-smart-row').find((r) => r.getBoundingClientRect().width > 0 && r._config && r._config.sort !== false && r._config.cards.length >= min);
      if (!row) return null;
      return [...row.shadowRoot.querySelectorAll('#container > .card-wrapper')]
        .filter((w) => w.style.display !== 'none' && w.getBoundingClientRect().width > 0)
        .map((w) => {
          // Wrapper und Karte darin: eine Karte, die aus ihrem Platz rutscht, zählt mit.
          const a = w.getBoundingClientRect();
          const k = w.firstElementChild ? w.firstElementChild.getBoundingClientRect() : a;
          const y = Math.min(a.y, k.height ? k.y : a.y), bot = Math.max(a.bottom, k.height ? k.bottom : a.bottom);
          // Kachel-Geometrie aus der Vorlage (styles.card): am Desktop immer die -mq-Werte.
          const bc = [w, ...w.querySelectorAll('*')].map((e) => e.shadowRoot && e.shadowRoot.querySelector('ha-card')).find(Boolean);
          const areas = bc ? bc.style.getPropertyValue('--casora-tile-areas') : '';
          return { x: Math.round(a.x), y: Math.round(y), w: Math.round(a.width), h: Math.round(bot - y), large: w.dataset.size === 'large', lg: areas.includes('-lg') };
        });
    };
    await page.waitForFunction(tiles, min, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const t = await page.evaluate(tiles, min);
    await need(`Desktop ${view}: Kachelreihe da`, t && t.length >= min, t);
    const top = Math.min(...t.map((x) => x.y));
    const inView = t.filter((x) => x.x < 1440);
    const hs = inView.map((x) => x.h);
    await check(`Desktop ${view}: Reihe einreihig (alle Kacheln oben bündig)`, inView.every((x) => Math.abs(x.y - top) <= 2), inView.map((x) => x.y));
    await check(`Desktop ${view}: alle Kacheln gleich hoch`, Math.max(...hs) - Math.min(...hs) <= 2, hs);
    const xs = t.map((x) => x.x).sort((a, b) => a - b);
    const gaps = xs.slice(1).map((x, i) => x - xs[i] - t[0].w).filter((g, i) => xs[i + 1] < 1440);
    await check(`Desktop ${view}: gleiche Abstände, keine Lücken`, gaps.every((g) => Math.abs(g - gaps[0]) <= 2), gaps);
    await check(`Desktop ${view}: keine Kachel unter dem Bildrand`, t.every((x) => x.y + x.h <= 900 || x.x >= 1440), t.map((x) => x.y + x.h));
    await check(`Desktop ${view}: keine Kachel als groß markiert`, t.every((x) => !x.large));
    await check(`Desktop ${view}: Vorlage nutzt keine Groß-Geometrie`, t.every((x) => !x.lg), t.map((x) => x.lg));
    await browser.close();
  }

  // ── Handy: dieselben Kacheln groß ──
  {
    const { page, browser } = await open({ width: 390, height: 844, mobile: true });
    usePage(page);
    await page.goto(BASE + '/' + DASH + '-mobile/home', { waitUntil: 'domcontentloaded' });
    const { PIERCE } = await import('../../e2e/harness.mjs');
    await page.addScriptTag({ content: PIERCE });
    await page.waitForTimeout(6000);
    const filter = (f) => page.evaluate((v) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: v } })), f);
    // Höhen der Kacheln im offenen Raum-Overlay (Reihenfolge wie in der Konfiguration).
    // Große Kacheln über ihre Entität erkennen: mit Raum-Kategorien (1.0.6) verteilt sich der Raum
    // auf mehrere Raster (Licht, Klima, Medien …), die Position im Raster ist nicht mehr der Index.
    const bigEnts = BIG.map((i) => wzm.cards[i] && wzm.cards[i].entity);
    const measure = (bigEnts) => {
      const up = (e) => e.parentElement || (e.getRootNode() && e.getRootNode().host) || null;
      const inOverlay = (x) => { for (let e = x; e; e = up(e)) if (e.hasAttribute && e.hasAttribute('data-casora-filter-overlay')) return true; return false; };
      const entOf = (w) => { const bc = w.localName === 'button-card' ? w : w.querySelector && w.querySelector('button-card'); return (bc && bc._config && bc._config.entity) || null; };
      // Raum-Overlay: Kacheln als Raster (filter-overlay, je Kategorie eines) oder als smart-row.
      const grids = window.__pierce('.casora-entity-grid').filter((g) => inOverlay(g) && g.getBoundingClientRect().width > 0);
      const gridEls = grids.flatMap((g) => [...g.children]);
      const row = gridEls.length < 6 && window.__pierce('casora-smart-row').find((r) => inOverlay(r) && r.getBoundingClientRect().width > 0 && r._config && r._config.cards.length >= 6);
      const els = row ? [...row.shadowRoot.querySelectorAll('#container > .card-wrapper')] : gridEls;
      const out = els.map((w, i) => {
        const b = w.getBoundingClientRect();
        const e = row ? null : entOf(w);
        return { i: row ? +w.dataset.idx : i, e, big: row ? null : bigEnts.includes(e),
          h: Math.round(b.height), shown: w.style.display !== 'none' && b.width > 0 };
      });
      return out.filter((x) => x.shown).length >= 6 ? out : null;
    };
    let m = null;
    for (let k = 0; k < 5 && !m; k++) {
      if (k) { await filter('all'); await page.waitForTimeout(1500); }
      await filter('room_wohnzimmer');
      m = await page.waitForFunction(measure, bigEnts, { timeout: 8000 }).then((h) => h.jsonValue(), () => null);
    }
    await need('Handy: Wohnzimmer-Overlay mit Kacheln', m, m);
    await page.waitForTimeout(2500);
    m = await page.evaluate(measure, bigEnts);
    const isBig = (x) => (x.big === null ? BIG.includes(x.i) : x.big);
    const shown = m.filter((x) => x.shown);
    const small = Math.min(...shown.map((x) => x.h));
    const bigOnes = shown.filter(isBig);
    const rest = shown.filter((x) => !isBig(x));
    await check('Handy: große Kacheln doppelt so hoch', bigOnes.length === BIG.length && bigOnes.every((x) => x.h >= small * 1.8), m);
    await check('Handy: übrige Kacheln klein', rest.every((x) => x.h <= small * 1.2), m);
    await browser.close();
  }
} finally {
  await cleanup();
}
await finish();
