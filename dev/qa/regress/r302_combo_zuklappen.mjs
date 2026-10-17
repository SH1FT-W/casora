// @zustand: arbeit
// Studio-Auswahlfeld (fest, z. B. Live-Aktivitäten „Fertig bleibt stehen für“): ein zweiter Klick aufs Feld
// klappt die Liste wieder zu. Vorher öffnete er sie nur erneut – zu ging sie nur über eine Auswahl
// oder einen Klick daneben (Rückmeldung 17.10.). Chromium und WebKit.
import { open, studioDashboard, studio, check, finish, usePage } from './lib.mjs';

const dash = await studioDashboard();
for (const browser of ['chromium', 'webkit']) {
  const { page } = await open({ width: 1400, height: 900, browser });
  usePage(page);
  await studio(page, dash);
  await page.evaluate(() => window.__panel()._csOpenPage('live'));
  await page.waitForFunction(() => window.__pierce('.cs-wrap .cs-live-row').some((r) => r.offsetParent !== null), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const row = await page.evaluateHandle(() => window.__pierce('.cs-wrap .cs-live-row').find((r) => r.offsetParent !== null));
  await row.click({ position: { x: 60, y: 20 } });
  await page.waitForTimeout(800);
  const inp = await page.evaluateHandle(() => window.__pierce('.cs-wrap .cs-live-opt input').find((e) => e.offsetParent !== null));
  const menus = () => page.evaluate(() => window.__pierce('.combo-opt').filter((e) => e.offsetParent !== null).length);
  const tap = async () => { await inp.click(); await page.waitForTimeout(600); return menus(); };
  const a = await tap(), b = await tap(), c = await tap();
  await page.mouse.click(300, 880); await page.waitForTimeout(600);
  const d = await menus();
  const e = await tap();
  const opt = await page.evaluateHandle(() => window.__pierce('.combo-opt').filter((x) => x.offsetParent !== null)[3]);
  await opt.click(); await page.waitForTimeout(600);
  const f = await menus();
  await check(`${browser}: Klick öffnet, zweiter Klick schließt, dritter öffnet`, a > 0 && b === 0 && c > 0, { a, b, c });
  await check(`${browser}: Klick daneben schließt`, d === 0, d);
  await check(`${browser}: Auswahl schließt`, e > 0 && f === 0, { e, f });
}
await finish();
