// @zustand: arbeit
// Gemeldet (03.10.2026): Im Design „Casora Weich“ waren die Symbole der Klima-Unter-Badges
// (Temperatur, Luftfeuchtigkeit) viel kleiner und dünner als die der Haupt-Badges; am Handy
// standen die Unter-Badges zudem ohne Pille mit weißer Schrift direkt auf dem hellen Foto.
// Erwartet (Desktop und Handy, Weich hell): Unter-Badges haben denselben Kreis, eine ähnlich
// große und kräftige Glyphe (Pixelmessung im Kreis), eine deckende Pille und die Schriftfarbe
// der Haupt-Badges.
import { open, usePage, casoraDashboard, dashboard, cards, check, need, finish } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora-Dashboard', dash);

const MAIN = ['casora_badge_security_group', 'casora_badge_climate_group', 'casora_badge_light_group', 'casora_badge_energy_group'];
const SUB = ['casora_badge_temp', 'casora_badge_humidity', 'casora_badge_air_quality'];

// Sichtbare Glyphe im Symbolkreis: Höhe (CSS-px) und „Tinte“ (Summe der Abweichung von der
// Kreisfarbe) – aus einem Bildschirmfoto des Kreises, ausgewertet im Browser per Canvas.
async function glyph(page, i) {
  const r = await page.evaluate((i) => { const b = window.__pierce('button-card')[i];
    const c = b.shadowRoot.querySelector('#img-cell'); const q = c.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; }, i);
  const png = await page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
  return page.evaluate(async ([b64, w]) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, cv.width, cv.height).data; const s = cv.width / w;
    const W = cv.width, H = cv.height, R = Math.min(W, H) / 2;
    const px = (x, y) => { const k = (y * W + x) * 4; return [d[k], d[k + 1], d[k + 2]]; };
    const ring = []; for (let a = 0; a < 360; a += 10) { const t = a * Math.PI / 180;
      ring.push(px(Math.min(W - 1, Math.round(W / 2 + 0.85 * R * Math.cos(t))), Math.min(H - 1, Math.round(H / 2 + 0.85 * R * Math.sin(t))))); }
    ring.sort((p, q) => (p[0] + p[1] + p[2]) - (q[0] + q[1] + q[2])); const bg = ring[ring.length >> 1];
    let y0 = 1e9, y1 = -1, ink = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if ((x - W / 2) ** 2 + (y - H / 2) ** 2 > (0.78 * R) ** 2) continue;
      const p = px(x, y); const dd = (Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2])) / 3;
      if (dd > 40) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); ink += dd / 255; }
    }
    return { h: y1 < 0 ? 0 : (y1 - y0 + 1) / s, ink: ink / s / s, cell: w };
  }, [png.toString('base64'), r.w]);
}

async function look(page, i) {
  return page.evaluate((i) => { const b = window.__pierce('button-card')[i]; const sr = b.shadowRoot;
    const card = sr.querySelector('ha-card'); const t = sr.querySelector('.badge-title');
    // Farbe als [r, g, b, a] (0–255) – color-mix() liefert color(srgb …), daher über ein Canvas.
    const rgba = (css) => { const cv = document.createElement('canvas'); cv.width = cv.height = 1; const x = cv.getContext('2d');
      x.fillStyle = css; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data]; };
    return { alpha: rgba(getComputedStyle(card).backgroundColor)[3] / 255, title: t ? rgba(getComputedStyle(t).color) : [] }; }, i);
}

async function run(label, opts, url) {
  const { page } = await open({ ...opts, dark: false });
  usePage(page);
  await dashboard(page, url);
  await page.evaluate(() => document.querySelector('home-assistant').dispatchEvent(new CustomEvent('settheme',
    { detail: { theme: 'Casora Weich', dark: false }, bubbles: true, composed: true })));
  await page.waitForTimeout(5000);
  const g = (await cards(page, 'casora_badge_climate_group'))[0];
  await need(label + ': Klima-Badge', g);
  await page.mouse.click(g.x + g.w / 2, g.y + g.h / 2);
  await page.waitForTimeout(2500);
  const subs = [];
  for (const t of SUB) subs.push(...(await cards(page, t)).map((c) => ({ ...c, tpl: t })));
  await need(label + ': Klima-Unter-Badges sichtbar', subs.length, 'keine Temperatur/Feuchte/Luft-Badges');
  const mains = [];
  for (const t of MAIN) { const c = (await cards(page, t))[0]; if (c && c.y < subs[0].y - 4 && c.x >= 0 && c.x + 48 <= opts.width) mains.push({ ...c, tpl: t }); }
  await need(label + ': Haupt-Badges zum Vergleich', mains.length >= 2);
  const mg = []; for (const m of mains) mg.push(await glyph(page, m.i));
  const ml = await look(page, mains.find((m) => m.tpl !== 'casora_badge_climate_group').i);
  const hMin = Math.min(...mg.map((x) => x.h)), inkMin = Math.min(...mg.map((x) => x.ink));
  for (const s of subs) {
    const sg = await glyph(page, s.i), sl = await look(page, s.i), name = s.tpl.replace('casora_badge_', '');
    await check(`${label}: ${name} – Kreis so groß wie bei den Haupt-Badges`, Math.abs(sg.cell - mg[0].cell) <= 1, { sub: sg.cell, haupt: mg[0].cell });
    await check(`${label}: ${name} – Symbol ähnlich groß (Höhe ≥ 80 % der kleinsten Haupt-Glyphe)`, sg.h >= 0.8 * hMin, { sub: sg.h, hauptMin: hMin });
    await check(`${label}: ${name} – Symbol ähnlich kräftig (Tinte ≥ 80 % der schwächsten Haupt-Glyphe)`, sg.ink >= 0.8 * inkMin, { sub: +sg.ink.toFixed(1), hauptMin: +inkMin.toFixed(1) });
    await check(`${label}: ${name} – Pille mit Fläche`, sl.alpha >= 0.5, sl);
    await check(`${label}: ${name} – Schriftfarbe wie die Haupt-Badges`,
      sl.title.length === 4 && sl.title.slice(0, 3).every((v, k) => Math.abs(v - ml.title[k]) <= 12), { sub: sl.title, haupt: ml.title });
  }
  await page.evaluate(() => document.querySelector('home-assistant').hass.callWS({ type: 'frontend/set_user_data', key: 'theme', value: null })).catch(() => {});
}

const view = (d) => d.url + '/' + (d.config.views[0].path || '0');
await run('Desktop', { width: 1440, height: 900 }, view(dash));
if (dash.phone) await run('Handy', { width: 390, height: 844, mobile: true, scale: 3 }, view(dash.phone));
await finish();
