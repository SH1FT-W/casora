// @zustand: arbeit
// @parallel: allein   (öffnet das Studio)
// Gewünscht: „Kachel hinzufügen“ in der Studio-Vorschau öffnet gleich die Typauswahl, statt nur
// zur Kachel-Liste zu springen (vorher schloss weiches Scrollen das Menü sofort wieder), und zwar
// direkt an seinem Knopf. Im neuen Studio öffnet der Platz zuerst die Geräteauswahl (V-04); deren
// „Andere Kachelart …“ führt zur selben Typauswahl.
import { open, studioDashboard, studio, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('ein Dashboard fürs Studio', dash);
for (const [label, opts] of [['Chromium', {}], ['WebKit', { safari: true }]]) {
  const { page, browser } = await open({ width: 1440, height: 900, ...opts });
  await studio(page, dash);
  const slot = await page.evaluateHandle(() => window.__pierce('.miniroom .mtile.ghost').find((e) => e.getBoundingClientRect().width > 4) || null);
  const el = slot.asElement();
  await need(`${label}: Platz „Kachel hinzufügen“ in der Vorschau`, el);
  const r = await el.boundingBox();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await page.waitForTimeout(900);
  // Neues Studio (V-04): zuerst „Was soll auf das Dashboard?“ – die Typauswahl liegt unter „Andere Kachelart …“.
  const sheet = await page.evaluate(() => { const b = window.__pierce('.uxadd .uxlink')[0]; return b ? b.textContent : null; });
  if (sheet !== null) {
    await check(`${label}: Blatt „Was soll auf das Dashboard?“ mit „Andere Kachelart …“`, /Andere Kachelart|Other tile type/.test(sheet), sheet);
    await page.evaluate(() => window.__pierce('.uxadd .uxlink')[0].click());
    await page.waitForTimeout(1500);
  } else await page.waitForTimeout(600);
  const menu = await page.evaluate(() => window.__pierce('.combo-menu').some((m) => m.getClientRects().length
    && getComputedStyle(m).visibility !== 'hidden' && +getComputedStyle(m).opacity > 0.1
    && m.querySelectorAll('.combo-opt').length >= 5));
  await check(`${label}: Typauswahl offen`, menu);
  // Gemeldet: das Menü hing weit über seinem Knopf (Abschnitt klappte nach dem Platzieren noch auf).
  const gap = await page.evaluate(() => { const mm = window.__pierce('.combo-menu').find((m) => m.getClientRects().length);
    const b = window.__pierce('.addbar.tileadd button.scadd')[0]; if (!mm || !b) return null;
    const r = mm.getBoundingClientRect(), k = b.getBoundingClientRect();
    return Math.min(Math.abs(k.top - r.bottom), Math.abs(r.top - k.bottom)); });
  await check(`${label}: Menü direkt am Knopf (Abstand ≤ 16 px)`, gap !== null && gap <= 16, gap);
  await browser.close();
}
await finish();
