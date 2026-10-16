// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/25-kaffee.js dev/casora_mock/kaffee.py
// Community-Karte Kaffeevollautomat am erfundenen „Testbarista“ (Home-Connect-artig) und „Morgenbohne“ (De'Longhi-BT-artig,
// dev/casora_mock/kaffee.py):
//   1. Kachel: „Bereit“ bzw. „Entkalken in …“ steht nur im Popup; Morgenbohne erkannt ohne Integration (Schlüssel
//      device_status/make_beverage wie delonghi_primadonna).
//   2. Popup: Titel „Kaffee“, Getränke-Raster, Cappuccino vorgewählt, „Cappuccino starten“ direkt unter dem Raster,
//      Stärke/Menge/Temperatur, Pflege („In 10 Tassen“), Statistik (Getränke gesamt).
//   3. „Espresso“ antippen + starten bei offenem Popup → Ring erscheint (fehlte beim ersten Öffnen) samt „Abbrechen“;
//      Kachel „N % · Espresso“. „Abbrechen“ wirkt sofort (einstufig) und zeigt kurz „Abgebrochen“.
//   4. Warnung (casora_mock.kaffee_warnung wasser) → Kachel „Wasser leer“, Kopf „Wasser nachfüllen“, Abschnitt „Hinweise“
//      mit Anleitung.
//   5. Morgenbohne: Cappuccino starten (Auswahl startet sofort) → Popup nennt „Cappuccino“ statt „Läuft“, Ring aus „Gibt aus“.
// Die Kachel entsteht nur im Browser (nicht gespeichert); Dienste wirken nur auf die Testgeräte.
import { open, casoraDashboard, dashboard, check, need, finish, stable, atFinish, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const HC = 'sensor.testbarista_operation_state', DL = 'sensor.morgenbohne_device_status';
const tok = await tokens();
const svc = (s, data) => fetch(BASE + '/api/services/casora_mock/' + s,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
atFinish(async () => { await svc('kaffee_warnung', { art: 'aus' }); });

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
await need('Testbarista im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], HC));
await svc('kaffee_warnung', { art: 'aus' });
// Grundzustand: läuft noch ein Bezug (anderer Test), beenden und auf „Bereit“ warten.
await fetch(BASE + '/api/services/button/press', { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ entity_id: 'button.testbarista_stop_program' }) });
await page.waitForFunction((id) => document.querySelector('home-assistant').hass.states[id].state === 'ready', HC, { timeout: 15000 }).catch(() => {});
await page.evaluate(async ([a, b]) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  [[a, 'qa-r281a', 300], [b, 'qa-r281b', 520]].forEach(([id, cls, top]) => {
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_coffee', entity: id, name: 'Kaffee' });
    el.classList.add(cls);
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:400px;top:' + top + 'px;width:290px;height:200px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  });
}, [HC, DL]);
const tile = (cls) => stable(page, (c) => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.' + c);
  const st = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  const full = st && st.querySelector('.sf-f');
  return st ? String((full || st).textContent || '').replace(/\s+/g, ' ').trim() : null;
}, cls, { max: 10000, quiet: 800 });
const popText = () => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  return { txt: parts.join(' ').replace(/\s+/g, ' ').slice(0, 2500), drinks: window.__pierce('.cof-d', pop.shadowRoot).length,
    ring: window.__pierce('svg circle[stroke-dasharray]', pop.shadowRoot).length };
}, null, { max: 12000, quiet: 1200 });
const center = (cls) => page.evaluate((c) => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.' + c).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, cls);
const closePop = async () => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };
const tapMi = (prefix) => page.evaluate((p) => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = pop && window.__pierce('[data-casora-mi^="' + p + '"]', pop.shadowRoot)[0]; if (el) el.click(); return !!el; }, prefix);

await check('Kachel Testbarista: „Bereit“', (await tile('qa-r281a')) === 'Bereit', await tile('qa-r281a'));
await check('Kachel Morgenbohne (De\'Longhi-artig, nur Schlüssel): „Bereit“', (await tile('qa-r281b')) === 'Bereit', await tile('qa-r281b'));
const at = await center('qa-r281a');
await page.mouse.click(at.x + 40, at.y + 40);
let p = await popText();
await check('Popup: Getränke-Raster, Cappuccino vorgewählt, Start vor den Optionen', p && p.drinks >= 9 && /Stärke/.test(p.txt) && /Menge/.test(p.txt)
  && /Temperatur/.test(p.txt) && /Cappuccino starten/.test(p.txt) && p.txt.indexOf('Cappuccino starten') < p.txt.indexOf('Stärke'), p && p.txt);
await check('Popup: Titel „Kaffee“, Pflege „In 10 Tassen“ und Statistik', p && /Kaffee/.test(p.txt) && /Pflege/.test(p.txt) && /In 10\sTassen/.test(p.txt)
  && /Getränke gesamt/.test(p.txt), p && p.txt);
await check('Espresso antippen', await tapMi('coffee-pick:' + HC + '|consumer_products_coffee_maker_program_beverage_espresso'));
await page.waitForTimeout(800);
p = await popText();
await check('Auswahl gewechselt: „Espresso starten“', p && /Espresso starten/.test(p.txt), p && p.txt);
await tapMi('coffee-start:');
await page.waitForFunction(() => document.querySelector('home-assistant').hass.states['sensor.testbarista_operation_state'].state === 'run', null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(4000);
p = await popText();
await check('Bezug (Popup vorher offen): Ring und „Abbrechen“', p && p.ring >= 1 && /Abbrechen/.test(p.txt) && /Espresso/.test(p.txt), p && p.txt);
await check('Bezug: Kopf ohne „Läuft“, keine „Gerade“-Zeile', p && !/Läuft/.test(p.txt) && !/Gerade/.test(p.txt), p && p.txt);
await closePop();
const t = await tile('qa-r281a');
await check('Bezug: Kachel „N % · Espresso“', /^\d+\s?% · Espresso$/.test(String(t).replace(/[\u00a0\u202f]/g, ' ')), t);
// Abbrechen: einstufig, sofort, danach kurz „Abgebrochen“
await page.mouse.click(at.x + 40, at.y + 40);
await popText();
await check('Abbrechen antippen', await tapMi('coffee-stop:'));
await page.waitForTimeout(400);
p = await popText();
const stopped = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, HC);
await check('Abbrechen wirkt sofort und zeigt „Abgebrochen“', stopped !== 'run' && p && /Abgebrochen/.test(p.txt), stopped + ' / ' + (p && p.txt));
await closePop();
await svc('kaffee_warnung', { art: 'wasser' });
await page.waitForTimeout(1500);
await check('Warnung: Kachel „Wasser leer“', (await tile('qa-r281a')) === 'Wasser leer', await tile('qa-r281a'));
await page.mouse.click(at.x + 40, at.y + 40);
p = await popText();
await check('Warnung: „Hinweise“ mit Wasser und Anleitung, Kopf ohne „Bereit · …“', p && /Hinweise/.test(p.txt) && /Wasser nachfüllen/.test(p.txt)
  && /Tank herausnehmen/.test(p.txt) && !/Bereit · Wasser/.test(p.txt), p && p.txt);
await closePop();
await svc('kaffee_warnung', { art: 'aus' });
// Morgenbohne (De'Longhi BT): Auswahl startet sofort, die Integration meldet das Getränk nicht – das Popup nennt es trotzdem.
const bt = await center('qa-r281b');
await page.mouse.click(bt.x + 40, bt.y + 40);
p = await popText();
await check('Morgenbohne: Getränke ohne „none“', p && p.drinks >= 6 && !/\bnone\b/.test(p.txt), p && p.txt);
await tapMi('coffee-pick:' + DL + '|Cappuccino');
await page.waitForTimeout(600);
await tapMi('coffee-start:');
await page.waitForFunction(() => document.querySelector('home-assistant').hass.states['binary_sensor.morgenbohne_dispensing'].state === 'on', null, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(4000);
p = await popText();
await check('Morgenbohne: Bezug zeigt „Cappuccino“ und Ring', p && /Cappuccino/.test(p.txt) && p.ring >= 1, p && p.txt);
await closePop();
await finish();
