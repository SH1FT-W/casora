// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#paintPlant,softLine,hero
// Owner, 06.11.2026: the plant popup's status line showed „Gestern gegossen“ and lost it after a few seconds. The
// line is filled once from history after opening; every later state update drew the popup head again with an empty
// slot. Expected: the watering words stay while the popup is open.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile && JSON.stringify(d.config).includes('casora_plant'));
await need('ein Casora-Dashboard mit Pflanze', dash);
const { page } = await open({ width: 1440, height: 900 });
let hit = null;
for (const v of (dash.config.views || []).map((x, i) => x.path || String(i))) {
  await dashboard(page, dash.url + '/' + v, 3);
  hit = await page.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).some((t) => /casora_plant/.test(t))
      && x.getBoundingClientRect().width > 40);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + 30, y: r.y + r.height / 2 };
  });
  if (hit) break;
}
await need('eine Pflanzen-Kachel', hit);
// The test house has no watering jump in its history: hand the popup a watering result as the history would.
await page.evaluate(() => {
  window._casoraPlantW = new Proxy({}, { get: () => ({ at: Date.now(), txt: 'Gestern gegossen' }), set: () => true });
});
await page.mouse.click(hit.x, hit.y);
const read = () => page.evaluate(() => window.__pierce('[id^="plantcap-"]').filter((n) => n.getClientRects().length)
  .map((n) => n.textContent.trim()));
await page.waitForTimeout(1500);
const early = await read();
await need('Statuszeile mit Platz für das Gießen', early.length > 0, early);
await page.waitForTimeout(8000);
const late = await read();
await check('„Gestern gegossen“ steht auch nach Sekunden noch da', late.length > 0 && late.every((t) => t === 'Gestern gegossen'), { early, late });
await finish();
