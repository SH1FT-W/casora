// Solarspeicher: Finder (translation_key) liefert dieselben Entitäten wie die alten festen IDs.
import { open, ready, HAUS } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';
const { browser, page } = await open();
await ready(page, '/dashboard-hemma/home', () => !!(window.casoraDevice && window.casoraDevice.byKey)); // Adresse des Test-Dashboards
const res = await page.evaluate((W) => {
  const h = document.querySelector('home-assistant').hass; const D = window.casoraDevice;
  const want = W;
  const bad = [];
  for (const [k, id] of Object.entries(want)) { const dom = id.split('.')[0]; const got = D.byKey(h, 'anker_solix', k, dom); if (got !== id) bad.push(k + ': ' + got + ' ≠ ' + id); }
  return { geprueft: Object.keys(want).length, abweichend: bad };
}, HAUS.solar || {});
console.log(JSON.stringify(res, null, 1));
check('Solar-Entitäten geprüft', res.geprueft > 0, res);
check('Finder = feste IDs', !res.abweichend.length, res.abweichend);
await browser.close();
ende();
