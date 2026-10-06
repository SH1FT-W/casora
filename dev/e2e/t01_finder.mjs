// Geräte-Finder: Drucker und Geschirrspüler finden ihre Entitäten ohne Variablen,
// auch wenn alle Entitäts-IDs neutral umbenannt sind (nur translation_key zählt).
import { open, ready, HAUS } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';

const { browser, page, errors } = await open();
await ready(page, '/dashboard-hemma/home', () => !!(window._casoraLocalLoaded && window._casoraDish && window._casoraPrint && window._casoraLaundry)); // Adresse des Test-Dashboards
const res = await page.evaluate((A) => {
  const h = document.querySelector('home-assistant').hass;
  function renamed(anchorEid, word) {
    const dev = h.entities[anchorEid].device_id;
    const fam = [dev].concat(Object.keys(h.devices).filter((d) => h.devices[d].via_device_id === dev));
    const ren = {}; let i = 0;
    Object.keys(h.entities).forEach((e) => { if (fam.includes(h.entities[e].device_id)) ren[e] = e.split('.')[0] + '.' + word + '_e' + (++i); });
    const R = (x) => ren[x] || x; const states = {}, entities = {};
    Object.keys(h.states).forEach((e) => { states[R(e)] = Object.assign({}, h.states[e], { entity_id: R(e) }); });
    Object.keys(h.entities).forEach((e) => { entities[R(e)] = Object.assign({}, h.entities[e], { entity_id: R(e) }); });
    return { fake: Object.assign({}, h, { states, entities }), R, ren };
  }
  function compare(mod, anchor, word, skip) {
    const a = mod.resolve(h.states[anchor], {}, h.states, h);
    const { fake, R, ren } = renamed(anchor, word);
    const b = mod.resolve(fake.states[R(anchor)], {}, fake.states, fake);
    const keys = Object.keys(a).filter((k) => !skip.includes(k));
    const norm = (v) => JSON.stringify(v, (k, x) => (typeof x === 'string' && ren[x] ? R(x) : x));
    const filled = keys.filter((k) => a[k] != null && !(Array.isArray(a[k]) && !a[k].length));
    const bad = keys.filter((k) => norm(a[k]) !== JSON.stringify(b[k]));
    return { felder: keys.length, gefunden: filled.length, abweichend_nach_umbenennung: bad.map((k) => k + ': ' + norm(a[k]) + ' ≠ ' + JSON.stringify(b[k])) };
  }
  return {
    drucker: compare(window._casoraPrint, A.drucker_status, 'printer', ['price', 'color', 'print', 'entry', 'dryer', 'lock', 'name']),
    waschmaschine: compare(window._casoraLaundry, A.waschmaschine, 'washer', ['price', 'color', 'entry', 'name']),
    trockner: compare(window._casoraLaundry, A.trockner, 'neutral', ['price', 'color', 'entry', 'name']),
    geschirrspueler: compare(window._casoraDish, A.geschirrspueler, 'dishwasher', ['price', 'color', 'dish', 'entry', 'dryer', 'lock', 'name']),
  };
}, HAUS);
console.log(JSON.stringify(res, null, 1));
console.log('Browser-Fehler:', errors.length, errors.slice(0, 5));
for (const [k, v] of Object.entries(res)) {
  check(k + ': Felder gefunden', v.gefunden > 0, v);
  check(k + ': gleich nach Umbenennung', !v.abweichend_nach_umbenennung.length, v.abweichend_nach_umbenennung);
}
check('keine Browser-Fehler', !echteFehler(errors).length, echteFehler(errors));
await browser.close();
ende();
