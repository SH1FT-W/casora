// @zustand: arbeit
// Gemeldet: Am Handy zeigte die Netzwerk-Kachel „10.0 Mbit/s Upload“ (Punkt), weitere Kacheln
// und Popups formatierten Zahlen per toFixed ebenso. Erwartet bei deutscher Oberfläche:
// Dezimalkomma in jeder angezeigten Zahl mit Einheit – auf Desktop und Handy.
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';
// Hinweis: gespeicherte Dashboards tragen die Vorlagen der installierten Casora-Fassung. Im Gate
// wird qa-arbeit mit dem Checkout neu angelegt; gegen ältere Dashboards zeigt der Test deren Stand.

const dash = await casoraDashboard(() => true);
await need('Casora-Dashboard', dash);
console.log('  Dashboard: ' + dash.url + (dash.phone ? ' (+ Handy)' : ''));

// Dezimalpunkt (1–2 Nachkommastellen; 1.234 wäre Tausenderpunkt) direkt vor einer Einheit.
const BAD = /(^|[^\d.,])\d+\.\d{1,2}(?!\d)\s?(kWh|kW|W|€|Mbit\/s|°C|°|%|ppm|µg)(?![A-Za-z])/;

// Werte mit Nachkommastellen unterschieben (nur im Browser), sonst zeigt das Testhaus
// womöglich lauter ganze Zahlen und die Prüfung sähe nichts.
const decimals = (page) => page.evaluate(() => {
  const V = { power: '42.37', energy: '12.34', monetary: '3.21', temperature: '21.46', humidity: '45.5',
    data_rate: '10.04', pm25: '7.3', pm10: '9.6', battery: null };
  const out = {};
  Object.values(document.querySelector('home-assistant').hass.states).forEach((s) => {
    if (!/^(sensor|input_number|number)\./.test(s.entity_id) || isNaN(parseFloat(s.state))) return;
    const dc = s.attributes.device_class;
    const u = String(s.attributes.unit_of_measurement || '');
    const v = V[dc] !== undefined ? V[dc] : /bit\/s$/.test(u) ? '10.04' : /°C$/.test(u) ? '21.46' : null;
    if (v) out[s.entity_id] = { state: v };
  });
  if (out['input_number.casora_thermostat_target_temperature'] === undefined) out['input_number.casora_thermostat_target_temperature'] = { state: '21.5' };
  return out;
});

const texts = (page) => page.evaluate(() => {
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const s = n.textContent.replace(/\s+/g, ' ').trim(); if (s) out.push(s); return; }
    if (n.nodeType === 1 && /^(STYLE|SCRIPT|TEMPLATE)$/.test(n.tagName)) return;
    if (n.shadowRoot) walk(n.shadowRoot);
    n.childNodes && n.childNodes.forEach(walk);
  };
  walk(document.body);
  // Zusammenhängender Kartentext (Zahl und Einheit stehen oft in eigenen Knoten).
  window.__pierce('button-card').forEach((b) => {
    const c = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
    if (c && c.getClientRects().length) out.push(c.innerText.replace(/\s+/g, ' ').trim());
  });
  return out;
});

async function scan(label, d, opts) {
  const { page } = await open(opts);
  usePage(page);
  const views = (d.config.views || []).slice(0, 6);
  const hits = [];
  let seen = 0;
  for (const v of views) {
    const idx = d.config.views.indexOf(v);
    try { await dashboard(page, d.url + '/' + (v.path || idx), 3); } catch (e) { continue; }
    await fakeStates(page, await decimals(page));
    // Unter Gate-Last brauchen die Karten länger: bis zu 6 s auf die untergeschobenen Werte warten.
    let t = [];
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(500);
      t = await texts(page);
      if (t.some((s) => /\d,\d/.test(s))) break;
    }
    seen += t.filter((s) => /\d,\d/.test(s)).length;
    t.filter((s) => BAD.test(s)).forEach((s) => hits.push((v.title || v.path || idx) + ': ' + s.slice(0, 80)));
  }
  await check(`${label}: keine Zahl mit Dezimalpunkt vor einer Einheit`, !hits.length, [...new Set(hits)].slice(0, 10));
  return seen;
}

// „Überhaupt Kommazahlen gesehen“ gilt für beide zusammen: Die Handy-Startseite zeigt je nach
// Haus nur Favoriten ohne Nachkommastellen (dann wäre die Prüfung dort grundlos rot).
let seen = await scan('Desktop', dash, { width: 1600, height: 1000 });
if (dash.phone) seen += await scan('Handy', dash.phone, { width: 390, height: 844, mobile: true });
else await check('Handy-Gegenstück vorhanden', false, dash.url + '-mobile fehlt');
await check('Zahlen mit Komma zu sehen (Desktop + Handy)', seen > 0, seen);
await finish();
