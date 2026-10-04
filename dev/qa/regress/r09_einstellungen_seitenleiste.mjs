// @zustand: frisch
// Einstellungen für alle Dashboards stehen in der Studio-Seitenleiste unter der Überschrift „Einstellungen“
// (vor „Updates“); der alte Menüeintrag „Zuhause-Einstellungen …“ im ⋯-Menü ist weg.
import { open, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
const { page } = await open();
await studio(page, dash);
const side = await page.evaluate(() => {
  const host = window.__pierce('#sidesections')[0];
  if (!host) return null;
  const kids = [...host.children].map((e) => ({ cls: e.className, text: e.textContent.replace(/\s+/g, ' ').trim() }));
  return kids;
});
await need('Studio-Seitenleiste', side);
const head = side.findIndex((k) => /cu-sidehead/.test(k.cls));
const cs = side.findIndex((k) => /cs-sub/.test(k.cls));
const cu = side.findIndex((k) => /cu-side\b/.test(k.cls));
await check('Überschrift „Einstellungen“ in der Seitenleiste', head >= 0 && /^Einstellungen/.test(side[head].text), side.map((k) => k.text));
await check('keine eigene Zeile „Einstellungen“ (Unterseiten direkt unter der Überschrift)', !side.some((k) => /cs-side/.test(k.cls)), side.map((k) => k.cls));
await check('Unterseiten direkt unter der Überschrift', cs === head + 1, side.map((k) => k.text));
await check('Unterseiten vor „Updates“', cu < 0 || cs < cu, { cs, cu });

await page.evaluate(() => window.__pierce('.cs-sub')[0].click());
await page.waitForTimeout(2500);
const page1 = await page.evaluate(() => ({ open: !!window.__panel()._csOpen, page: window.__panel()._csPage,
  title: window.__pierce('h3').filter((h) => h.offsetParent).map((h) => h.textContent.trim()) }));
await check('Einstellungen-Seite öffnet sich (erste Unterseite)', page1.open && page1.title.length > 0, page1);

await page.evaluate(() => window.__pierce('#more')[0].click());
await page.waitForTimeout(800);
const items = await page.evaluate(() => window.__pierce('.combo-menu .combo-opt').map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
await check('⋯-Menü geöffnet', items.length > 0, items);
await check('⋯-Menü ohne „Zuhause-Einstellungen“', !items.some((t) => /Zuhause-Einstellungen|Home settings|Persönliches/i.test(t)), items);
await finish();
