// Auto: altes Präfix vs. nur Finder (ohne variables.car) liefern dieselben Werte.
import { open, ready } from './harness.mjs';
const { browser, page } = await open();
await ready(page, '/dashboard-hemma/home', () => !!(window._casoraCar && window._casoraCar.id)); // Adresse des Test-Dashboards
const r = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass; const C = window._casoraCar;
  const a = C.read('tiguan_r_line_20_l_tdi_scr_4motion', h.states), b = C.read(null, h.states);
  const keys = Object.keys(a); const bad = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  return { felder: keys.length, gefuellt: keys.filter((k) => a[k] != null && !(Array.isArray(a[k]) && !a[k].length)).length,
    abweichend: bad.map((k) => k + ': ' + JSON.stringify(a[k]) + ' ≠ ' + JSON.stringify(b[k])), kachel: [C.tile('tiguan_r_line_20_l_tdi_scr_4motion', h.states), C.tile(null, h.states)] };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
