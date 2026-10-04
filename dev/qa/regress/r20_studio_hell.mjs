// @zustand: arbeit
// @parallel: allein   (öffnet das Studio; parallele Tests, die Dashboards anlegen, laden es neu)
// Gemeldet: Das Studio war immer dunkel, auch wenn HA hell eingestellt ist. Ein erzwungenes Hell
// war unvollständig: Vorschau-Spalte dunkelgrau, „Tablet/Mobil“ im Größen-Umschalter und das
// Rückgängig-Symbol unsichtbar. Erwartet: Studio folgt HAs Hell/Dunkel (auch beim Umschalten ohne
// Neuladen), hell = helle Flächen mit dunkler Schrift, Bedienelemente mit Kontrast > 3:1;
// dunkel bleibt dunkel. Nur lesen – schreibende Aufrufe werden im Browser abgefangen.
import { open, studio, studioDashboard, check, need, finish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);

// Ein Theme, das ein anderer Test per settheme in den Benutzerdaten (Server) hinterlassen hat,
// ginge vor das hell/dunkel des Browsers – vorher zurücksetzen, sonst bleibt „HA hell“ dunkel.
try { const c = await ws(); await c.cmd({ type: 'frontend/set_user_data', key: 'theme', value: null }); c.close?.(); } catch (e) { /* ohne Zugang: wie bisher */ }

// Lesend: nichts darf gespeichert werden (das Umschalten von Hell/Dunkel bleibt im Browser).
const readOnly = () => {
  const patch = () => {
    const ha = document.querySelector('home-assistant');
    const conn = ha && ha.hass && ha.hass.connection;
    if (!conn) return setTimeout(patch, 5);
    if (conn.__ro) return;
    conn.__ro = true;
    const orig = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => {
      const t = String((m && m.type) || '');
      if (/save|\/set$|set_|create|delete|update|call_service|remove|apply|install/.test(t)) return Promise.reject(new Error('nur lesen: ' + t));
      return orig(m);
    };
  };
  patch();
};

// Farben messen: Hintergrund aus der Kette der Vorfahren zusammengesetzt (über Schatten-Grenzen),
// Vordergrund samt Deckkraft der Vorfahren; Kontrast nach WCAG.
const measure = () => {
  const P = window.__panel();
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const over = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const up = (e) => e.parentElement || (e.parentNode && e.parentNode.host) || null;
  const bgOf = (el) => {
    const layers = [];
    for (let e = el; e; e = up(e)) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    // Ohne deckenden Vorfahren: der Grund des Studios (Verlauf) – grob über seine Helligkeit.
    if (!layers.length || layers[layers.length - 1].a < 1) {
      const g = getComputedStyle(P).getPropertyValue('--ground').trim();
      base = P.classList.contains('is-light') || /f4f4f7/i.test(g) ? { r: 240, g: 240, b: 244, a: 1 } : { r: 18, g: 18, b: 24, a: 1 };
    }
    return layers.reverse().reduce((acc, l) => over(l, acc), base);
  };
  const opac = (el) => { let o = 1; for (let e = el; e && e !== P; e = up(e)) o *= Number(getComputedStyle(e).opacity); return o; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const fg = (el) => { const bg = bgOf(el); const c = parse(getComputedStyle(el).color); c.a *= opac(el); return { bg, c: over(c, bg) }; };
  const q = (sel) => window.__pierce(sel).find((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
  const cr = (el) => { if (!el) return null; const { bg, c } = fg(el); return Math.round(ratio(c, bg) * 100) / 100; };
  const side = q('.sidelist'), insp = q('.inspector');
  return {
    light: P.classList.contains('is-light'),
    sideLum: side ? Math.round(lum(bgOf(side)) * 100) / 100 : null,
    inspLum: insp ? Math.round(lum(bgOf(insp)) * 100) / 100 : null,
    stageLum: q('.main') ? Math.round(lum(bgOf(q('.main'))) * 100) / 100 : null,
    textLum: side ? Math.round(lum(parse(getComputedStyle(q('.sidelist .siderow, .sidelist .tab') || side).color)) * 100) / 100 : null,
    segs: window.__pierce('#sizeseg .segopt').filter((e) => e.getClientRects().length && !e.hidden).map((e) => ({ t: e.textContent.trim(), k: cr(e) })),
    undo: cr(q('#undo')),
    rowText: cr(q('.sidelist .siderow .sidelabel, .sidelist .tab .tablabel')),
  };
};

// ── HA hell ──
let o = await open({ width: 1600, height: 1000, dark: false });
await o.context.addInitScript(readOnly);
await studio(o.page, dash);
let m = await o.page.evaluate(measure);
await check('HA hell → Studio hell (is-light)', m.light, m);
await check('Seitenleiste hell', m.sideLum > 0.7, m.sideLum);
await check('Inspektor hell', m.inspLum > 0.7, m.inspLum);
await check('Vorschau-Spalte hell', m.stageLum > 0.6, m.stageLum);
await check('Schrift dunkel', m.textLum !== null && m.textLum < 0.1, m.textLum);
await check('Zeilentext Kontrast ≥ 4,5:1', m.rowText >= 4.5, m.rowText);
await check('Größen-Umschalter: alle Beschriftungen sichtbar (> 3:1)', m.segs.length >= 2 && m.segs.every((s) => s.k > 3), m.segs);
await check('Rückgängig-Symbol sichtbar (> 3:1)', m.undo > 3, m.undo);

// Laufzeitwechsel: HA auf dunkel, ohne Neuladen.
await o.page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('settheme', { detail: { dark: true } })));
await o.page.waitForTimeout(1200);
m = await o.page.evaluate(measure);
await check('Umschalten auf dunkel ohne Neuladen', !m.light && m.sideLum < 0.1, m);
await o.browser.close();

// ── HA dunkel: bleibt wie bisher ──
o = await open({ width: 1600, height: 1000, dark: true });
await o.context.addInitScript(readOnly);
await studio(o.page, dash);
m = await o.page.evaluate(measure);
await check('HA dunkel → Studio dunkel', !m.light, m);
await check('Seitenleiste dunkel', m.sideLum < 0.1, m.sideLum);
await check('Schrift hell', m.textLum > 0.8, m.textLum);
await check('Dunkel: Umschalter und Rückgängig sichtbar', m.segs.every((s) => s.k > 3) && m.undo > 3, m);
await o.browser.close();

// ── Vorschau im Look „Casora Weich“ ──
// Gemeldet: In HA hell + Weich zeigte die Dashboard-Vorschau rechts die dunkle Fassung
// (weißer Raumtitel, dunkle Badge-Pillen, dunkle Kacheln mit weißer Schrift), das echte
// Dashboard dagegen dunkle Schrift auf hellen Leinen-Kacheln. Erwartet: Vorschau-Kachel hell
// mit dunklem Namen, Titel dunkel; nach Umschalten auf dunkel (ohne Neuladen) umgekehrt.
// Das Theme wird nur im Browser gesetzt (readOnly fängt das Speichern ab).
const preview = () => {
  const r = window.__panel().shadowRoot;
  const parse = (c) => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: v[0], g: v[1], b: v[2], a: v.length > 3 ? v[3] : 1 }; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return Math.round((0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b)) * 100) / 100; };
  const card = r.querySelector('.card.map');
  const tile = r.querySelector('.card.map .mtile:not(.ghost):not(.on)');
  const title = r.querySelector('.card.map .mini-name, .card.map .mp-name');
  if (!tile || !title) return { card: card && card.className, tile: !!tile, title: !!title };
  const bg = parse(getComputedStyle(tile).backgroundColor);
  return {
    card: card.className,
    tileLum: lum(bg), tileAlpha: bg.a,
    nameLum: lum(parse(getComputedStyle(tile.querySelector('.mname')).color)),
    titleLum: lum(parse(getComputedStyle(title).color)),
  };
};
const weich = (pg, dark) => pg.evaluate((d) => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('settheme',
  { detail: { theme: 'Casora Weich', dark: d }, bubbles: true, composed: true })), dark);
const settle = async (pg, want) => {
  for (let i = 0; i < 40; i++) {
    const v = await pg.evaluate(preview);
    if (v.tileLum !== undefined && (want ? v.tileLum > 0.5 : v.tileLum < 0.2)) return v;
    await pg.waitForTimeout(250);
  }
  return pg.evaluate(preview);
};
const lightOk = (v) => v.tileLum > 0.6 && v.tileAlpha > 0.5 && v.nameLum < 0.15 && v.titleLum < 0.15;
const darkOk = (v) => v.tileLum < 0.1 && v.nameLum > 0.6 && v.titleLum > 0.6;
const phoneSize = (pg) => pg.evaluate(() => { const b = window.__panel().shadowRoot.querySelector('#sizeseg .segopt[data-size="phone"]');
  if (!b || b.hidden) return false; b.click(); return true; });

// Geprüft wird eine ausgeschaltete Kachel. Sind in der ersten Ansicht alle an (z. B. weil die
// Updates-Kachel ohne Updates fehlt), nacheinander die Räume öffnen, bis eine dabei ist.
const offTile = async (pg) => {
  const has = () => !!window.__panel().shadowRoot.querySelector('.card.map .mtile:not(.ghost):not(.on)');
  const wait = async () => { for (let j = 0; j < 12; j++) { if (await pg.evaluate(has)) return true; await pg.waitForTimeout(250); } return false; };
  if (!process.env.R20_SKIP && await wait()) return { found: 'start' };
  const n = await pg.evaluate(() => window.__panel()._state.compact.rooms.length);
  for (let i = 1; i < n; i++) {
    await pg.evaluate((k) => { const p = window.__panel(); p._room = k; p._sel = null; p._renderTabs(); p._renderForm(); }, i);
    if (await wait()) return { found: i, n };
  }
  return { found: false, n };
};

o = await open({ width: 1600, height: 1000, dark: false });
await o.context.addInitScript(readOnly);
await studio(o.page, dash);
const ot = await offTile(o.page); console.log("  info   ausgeschaltete Kachel:", JSON.stringify(ot));
await weich(o.page, false);
let v = await settle(o.page, true);
await check('Weich hell: Vorschau-Kachel hell, Name und Raumtitel dunkel', lightOk(v), { ...v, ot });
await o.page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('settheme', { detail: { dark: true } })));
v = await settle(o.page, false);
await check('Weich: Umschalten auf dunkel ohne Neuladen → Kachel dunkel, Schrift hell', darkOk(v), v);
await o.page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('settheme', { detail: { dark: false } })));
v = await settle(o.page, true);
await check('Weich: zurück auf hell → Kachel wieder hell', lightOk(v), v);
if (await phoneSize(o.page)) {
  v = await settle(o.page, true);
  await check('Weich hell: Handy-Vorschau – Kachel hell, Name und Titel dunkel', lightOk(v), v);
}
await finish();
