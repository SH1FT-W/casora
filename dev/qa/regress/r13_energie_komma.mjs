// @zustand: arbeit
// @parallel: allein   (Import-Tests legen parallel halbfertige Dashboards an)
// Gemeldet: Im Energie-Popup standen Zahlen mit Punkt („1.5 kWh“) statt Komma.
// Erwartet bei deutscher Oberfläche: Dezimalkomma überall im Popup (Werte, Achsen, Legende).
import { open, casoraDashboard, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';

// dashboard-hemma(-mobile) ist gesperrt (von Hand erweitert): Studio und das automatische
// Auffrischen (template_refresh.py LOCKED) lassen seine gespeicherten Vorlagen absichtlich
// alt – dort stehen noch die Punkt-Zahlen von früher. Geprüft wird ein normales Dashboard.
// Bevorzugt ein Dashboard mit echter Energie-KACHEL (zeigt kWh/Kosten mit Nachkommastellen);
// „casora_energy“ steht sonst auch in der Popup-Konfiguration der Energie-Badge.
const TILE_RE = /"template":\[?"casora_energy"/;
// Nur eine Energie-Kachel MIT Sensor zählt: ein Dashboard, das ein paralleler Import-Test gerade
// erst anlegt, hat sie noch leer („Kein Sensor gewählt“) – dann gäbe es nichts zu prüfen.
const energyWithSensor = (cfg) => {
  let hit = false;
  (function walk(x) {
    if (hit || !x || typeof x !== 'object') return;
    const t = [].concat(x.template || []);
    if (t.includes('casora_energy') && (/^sensor\./.test(x.entity || '') || /^sensor\./.test((x.variables || {}).entity_power || ''))) { hit = true; return; }
    Object.values(x).forEach(walk);
  })(cfg);
  return hit;
};
// Zuerst das feste Import-Dashboard des Zustands „arbeit“ (echte Energiewerte, liegt dauerhaft),
// nie die nummerierten Kopien (-2, -3 …), die Import-Tests während des Gates anlegen.
const stable = (u) => !/^dashboard-hemma(-mobile)?$/.test(u) && !/-\d+$/.test(u);
const dash = (await casoraDashboard((d) => d.url === 'hemma-1-test-importiert' && energyWithSensor(d.config)))
  || (await casoraDashboard((d) => stable(d.url) && energyWithSensor(d.config)))
  || (await casoraDashboard((d) => !/^dashboard-hemma(-mobile)?$/.test(d.url) && TILE_RE.test(JSON.stringify(d.config))))
  || (await casoraDashboard((d) => !/^dashboard-hemma(-mobile)?$/.test(d.url) && /"casora_energy"/.test(JSON.stringify(d.config))));
await need('Casora-Dashboard mit Energie-Kachel oder -Badge', dash);
console.log('  Dashboard: ' + dash.url);
const view = dash.config.views.find((v) => TILE_RE.test(JSON.stringify(v))) || dash.config.views.find((v) => /"casora_energy"/.test(JSON.stringify(v))) || dash.config.views[0];
const { page } = await open({ width: 1600, height: 1000 });
await dashboard(page, dash.url + '/' + (view.path || '0'));

// Energie-Kachel, sonst die Energie-Badge – beide öffnen dasselbe Energie-Popup. (Ein frisch
// angelegtes Dashboard hat die Energie oft nur als Badge; „casora_energy“ steht dann nur in
// deren Popup-Konfiguration.)
let TPL = 'casora_energy';
let t = (await cards(page, TPL)).find((c) => c.x >= 0);
if (!t) { TPL = 'casora_badge_energy_group'; t = (await cards(page, TPL)).find((c) => c.x >= 0); }
const inView = async () => (await cards(page, TPL)).find((c) => c.x >= 0 && c.x + c.w <= 1600);
// Kachelreihe (casora-smart-row) seitwärts schieben, bis die Kachel im Bild ist – auch erneut
// nach dem Unterschieben der Zustände (die Reihe sortiert dann neu und springt zurück).
const bring = async () => {
  const c = (await cards(page, TPL)).find((x) => x.x >= 0);
  if (!c || c.x + c.w <= 1600) return c;
  await page.evaluate((i) => {
    const b = window.__pierce('button-card')[i];
    b.scrollIntoView({ inline: 'center', block: 'center' });
    for (let e = b; e; e = e.parentElement || (e.getRootNode && e.getRootNode().host)) {
      if (e.scrollWidth > e.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(e).overflowX)) {
        const r = b.getBoundingClientRect(), er = e.getBoundingClientRect();
        e.scrollLeft += r.left - er.left - (er.width - r.width) / 2;
        break;
      }
    }
  }, c.i);
  await page.waitForTimeout(1000);
  return (await inView()) || c;
};
t = (await bring()) || t;
await need('sichtbare Energie-Kachel oder Energie-Badge', t);
console.log('  geöffnet über ' + TPL);
// Werte mit Nachkommastellen unterschieben (nur im Browser), sonst zeigt das Testhaus
// womöglich lauter ganze Zahlen und die Prüfung sähe nichts.
const patch = await page.evaluate(() => {
  const out = {};
  Object.values(document.querySelector('home-assistant').hass.states).forEach((s) => {
    const dc = s.attributes.device_class;
    if (!s.entity_id.startsWith('sensor.') || isNaN(parseFloat(s.state))) return;
    if (dc === 'power') out[s.entity_id] = { state: '1234.56' };
    if (dc === 'energy') out[s.entity_id] = { state: '12.34' };
    if (dc === 'monetary') out[s.entity_id] = { state: '3.21' };
  });
  return out;
});
await fakeStates(page, patch);
const popOpen = () => page.evaluate(() => window.__pierce('casora-popup').some((p) => { const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0; }));
for (let i = 0; i < 3 && !(await popOpen()); i++) {
  t = await bring();
  await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
  await page.waitForTimeout(2500);
}
await page.waitForTimeout(2000); // Diagramm lädt Verlauf
const txt = await page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => { const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!pop) return null;
  const out = [];
  const walk = (n) => {
    if (n.nodeType === 3) { const s = n.textContent.trim(); if (s) out.push(s); return; }
    if (n.nodeType === 1 && /^(STYLE|SCRIPT|TEMPLATE)$/.test(n.tagName)) return;
    if (n.shadowRoot) walk(n.shadowRoot);
    n.childNodes && n.childNodes.forEach(walk);
  };
  walk(pop.shadowRoot || pop);
  return out;
});
await check('Energie-Popup offen', txt && txt.length > 3, txt);
if (txt) {
  const nums = txt.filter((s) => /\d/.test(s));
  console.log('  Zahlen: ' + nums.slice(0, 10).join(' | '));
  await check('Popup enthält Zahlen', nums.length > 0);
  // Dezimalpunkt: 1–2 Nachkommastellen (1.234 wäre Tausenderpunkt und erlaubt). Uhrzeiten/Daten ausgenommen.
  const bad = nums.filter((s) => /(^|[^\d.:])\d+\.\d{1,2}(?!\d)/.test(s) && !/^\d{1,2}\.\d{1,2}\.(\d{2,4})?$/.test(s) && !/\d{1,2}\.\d{1,2}\./.test(s));
  await check('Zahlen im Energie-Popup mit Dezimalkomma', !bad.length, { punkt: bad.slice(0, 8), beispiele: nums.slice(0, 12) });
  await check('mindestens eine Zahl mit Komma zu sehen', nums.some((s) => /\d,\d/.test(s)), nums.slice(0, 12));
}
await finish();
