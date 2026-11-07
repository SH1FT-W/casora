// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#paintPlant,softLine,hero
// Owner, 06.11.2026: the plant popup's status line showed „Gestern gegossen“ and lost it after a few seconds. The
// line is filled once from history after opening; every later state update drew the popup head again with an empty
// slot. Expected: the watering words stay while the popup is open.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile && (d.config.views || []).length > 1);
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900 });
await dashboard(page, dash.url, 3);
// A plant tile built in the browser (qa-arbeit has none on its pages), nothing is saved.
const hit = await page.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const plant = Object.keys(ha.hass.states).find((i) => /^plant\./.test(i));
  if (!plant) return null;
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_plant', entity: plant });
  el.id = 'qa-r589-plant'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:300px;top:300px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  await new Promise((r) => setTimeout(r, 1500));
  const r = el.getBoundingClientRect();
  return r.width > 40 ? { plant, x: r.x + 30, y: r.y + r.height / 2 } : null;
});
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
