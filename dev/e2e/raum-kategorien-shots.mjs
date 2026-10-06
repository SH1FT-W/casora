// Raum-Kategorien: Handy-Raumseite (390×844 WebKit), hell und dunkel, Spalten nebeneinander.
//   CASORA_URL=… CASORA_TOKENS='{…}' node dev/e2e/raum-kategorien-shots.mjs <ziel-ordner> [dash] [raum …]
import fs from 'node:fs';
import path from 'node:path';
import { open, ready, webkit } from './harness.mjs';

const OUTDIR = process.argv[2];
const DASH = process.argv[3] || 'qa-arbeit-mobile';
const ROOMS = process.argv.slice(4).length ? process.argv.slice(4) : ['Schlafzimmer', 'Wohnzimmer'];
// RK_VARIANTS=off,on – je Bild eine Spalte; leer = Standard des Looks (Weich: gruppiert).
const LABEL = { off: 'Ohne Gruppen', on: 'Gruppiert', '': 'Weich (Standard)' };
const VARIANTS = (process.env.RK_VARIANTS ?? 'off,on').split(',').map((v) => [v, LABEL[v] ?? v]);
const key = (n) => 'room_' + String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
fs.mkdirSync(OUTDIR, { recursive: true });

async function shoot(room, mode, variant) {
  const { browser, context, page } = await open({ width: 390, height: 844, mobile: true, safari: true,
    dark: mode === 'dunkel', scale: 2, theme: 'Casora' });
  await context.addInitScript((v) => {
    if (v) localStorage.setItem('casora-room-groups', v); else localStorage.removeItem('casora-room-groups');
    localStorage.setItem('casora_mobile_filter', 'all');
  }, variant);
  await ready(page, `/${DASH}/home`, () => window.__pierce('casora-smart-row').length > 3, 120000);
  await page.waitForTimeout(2500);
  const shown = () => page.evaluate(() => window.__pierce('[data-casora-filter-overlay]')
    .some((e) => e.style.display !== 'none' && e.querySelector('.casora-entity-grid')));
  for (let t = 0; t < 6 && !(await shown()); t++) {
    await page.evaluate(() => window._casoraFilter.set('all'));
    await page.waitForTimeout(800);
    await page.evaluate((k) => { window._casoraFilter.set(k); }, key(room));
    await page.waitForTimeout(3500);
  }
  // Overlay scrollt selbst (position:fixed) – Fenster auf volle Inhaltshöhe ziehen.
  const h = await page.evaluate(() => {
    const o = window.__pierce('[data-casora-filter-overlay]').find((e) => e.style.display !== 'none' && e.scrollHeight > 0);
    return o ? o.scrollHeight : 844;
  });
  await page.setViewportSize({ width: 390, height: Math.max(844, Math.min(h, 3000)) });
  await page.waitForTimeout(2500);
  const f = path.join(OUTDIR, `raw-${key(room)}-${mode}-${variant}.png`);
  await page.screenshot({ path: f });
  await browser.close();
  return f;
}

for (const room of ROOMS) {
  for (const mode of ['hell', 'dunkel']) {
    const files = [];
    for (const [v] of VARIANTS) files.push(await shoot(room, mode, v));
    const b = await webkit.launch();
    const p = await b.newPage({ viewport: { width: 24 + VARIANTS.length * 414, height: 900 }, deviceScaleFactor: 1 });
    const dark = mode === 'dunkel';
    const cols = files.map((f, i) => `<div class="c"><div class="l">${VARIANTS[i][1]}</div><img src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"></div>`).join('');
    await p.setContent(`<html><body style="margin:0;background:${dark ? '#1c1a18' : '#efe9e1'};font:600 22px -apple-system,Helvetica;color:${dark ? '#f2ebe1' : '#3a322b'}">
      <div style="padding:18px 24px 4px;font-size:26px">${room} · ${mode}</div>
      <div style="display:flex;gap:24px;padding:12px 24px 24px;align-items:flex-start">${cols}</div>
      <style>.c{width:390px}.l{margin:0 0 10px 4px}img{width:390px;border-radius:18px;display:block}</style></body></html>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUTDIR, `vergleich-${key(room).slice(5)}-${mode}.png`), fullPage: true });
    await b.close();
    console.log('ok', room, mode);
  }
}
