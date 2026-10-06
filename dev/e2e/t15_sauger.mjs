// Saugroboter: Finder (translation_keys) vs. alte Namensmuster – beide müssen dieselben Entitäten liefern.
import { open, ready, HAUS } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';
const { browser, page, errors } = await open();
await ready(page, '/dashboard-hemma/home', () => !!(window._casoraVac || window._casoraVacuum || window.casoraDevice), 60000); // Adresse des Test-Dashboards
await page.waitForTimeout(6000);
const r = await page.evaluate((B) => {
  const h = document.querySelector('home-assistant').hass;
  const V = Object.values(window).find((x) => x && typeof x === 'object' && typeof x.resolve === 'function' && typeof x.inner === 'function' && x.resolve.toString().includes('vac: true'));
  if (!V) return { fehler: 'kein Saugroboter-Modul' };
  const id = Object.keys(h.states).find((k) => k.startsWith('vacuum.'));
  const ent = h.states[id];
  const neu = V.resolve(ent, {}, h.states, h);
  const CD = window.casoraDevice; window.casoraDevice = null;
  const alt = V.resolve(ent, { entity_day_base: B }, h.states, h);
  window.casoraDevice = CD;
  const diff = [];
  Object.keys(alt).forEach((k) => { if (JSON.stringify(alt[k]) !== JSON.stringify(neu[k])) diff.push(k + ': ' + JSON.stringify(alt[k]) + ' → ' + JSON.stringify(neu[k])); });
  const nurFinder = CD.map(h, id, { a: { keys: ['status'] }, b: { keys: ['total_cleaning_count'] }, c: { keys: ['mop_washing'], domain: 'switch' }, d: { keys: ['main_brush_time_left'] } }, { siblings: true });
  const stecker = CD.companionPlug(h, id);
  return { nurFinder, stecker, id, gefunden: Object.keys(neu).filter((k) => typeof neu[k] === 'string' && k !== 'st' && k !== 'name').length, diff,
    heute: CD.dayStart(neu.total) };
}, HAUS.sauger_tagesbasis);
console.log('Saugroboter:', JSON.stringify(r, null, 1));
await page.waitForTimeout(2000);
const tag = await page.evaluate(() => { const h = document.querySelector('home-assistant').hass; return window.casoraDevice.dayStart(Object.keys(h.states).find((k) => /gesamtzahl_reinigungen|total_cleaning_count/.test(k))); });
console.log('Tagesstart:', tag);
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
/* Seit dem Finder gibt es keinen Rückfall auf alte Namensmuster mehr (02-geraete.js: ohne
   casoraDevice bleiben die Felder leer) – „diff“ ist daher nur noch Info. Geprüft wird der Finder. */
check('Saugroboter-Modul da', !r.fehler, r.fehler);
check('Finder findet die Entitäten', r.gefunden >= 10, r.gefunden);
check('Finder: Status, Zähler, Mopp-Wäsche, Bürste', r.nurFinder && ['a', 'b', 'c', 'd'].every((k) => r.nurFinder[k]), r.nurFinder);
check('Zwischenstecker gefunden', !!(r.stecker && r.stecker.switch), r.stecker);
check('Tagesstart ist eine Zahl', typeof tag === 'number' && !isNaN(tag), tag);
check('keine Browser-Fehler', !echteFehler(errors).length, echteFehler(errors));
await browser.close();
ende();
