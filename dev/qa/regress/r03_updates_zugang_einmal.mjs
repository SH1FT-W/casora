// @zustand: frisch
// @deckt: custom_components/casora/panel/casora-panel-updates.js
// Gemeldet: Die Updates-Seite bat dreimal darum, den Update-Zugang einzurichten
// (Kopfkarte, Karten-Updates, Abschnitt „Update-Zugang“). Seit Updates anonym aus dem
// öffentlichen Repo kommen, gibt es keinen Update-Zugang mehr. Erwartet: keine Aufforderung,
// kein Abschnitt „Update-Zugang“ – weder auf der Updates-Seite noch in den Einstellungen.
import { open, studio, studioDashboard, check, need, finish } from './lib.mjs';

// Die Updates-Seite hängt in der Seitenleiste des Studios; dafür reicht irgendein Dashboard.
const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open();
await studio(page, dash);
const opened = await page.evaluate(() => {
  const b = window.__pierce('.cu-side')[0];
  if (b) b.click(); else window.__panel()._cuOpenPage();
  return !!b;
});
await check('Seitenleiste hat „Updates“', opened);
await page.waitForTimeout(3500);
const ZUGANG = /Update-Zugang|Update Access|Casora-Schlüssel|Casora key/i;
const r = await page.evaluate((src) => {
  const re = new RegExp(src, 'i');
  const vis = (e) => !!(e.offsetParent || e.getClientRects().length);
  const btns = window.__pierce('button').filter(vis).map((b) => b.textContent.replace(/\s+/g, ' ').trim());
  const heads = window.__pierce('.cu-h').filter(vis).map((h) => h.textContent.trim());
  const side = window.__pierce('.siderow, .sidelist *').filter(vis).map((x) => x.textContent.trim());
  return { cta: btns.filter((t) => re.test(t)), heads: heads.filter((t) => re.test(t)),
    side: [...new Set(side.filter((t) => re.test(t)))] };
}, ZUGANG.source);
await check('keine Aufforderung zum Update-Zugang', r.cta.length === 0, r);
await check('kein Abschnitt „Update-Zugang“', r.heads.length === 0, r);
await check('kein „Update-Zugang“ in der Seitenleiste', r.side.length === 0, r);
await finish();
