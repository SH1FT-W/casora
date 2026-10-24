// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/25-coffee.js dev/casora_mock/coffee.py custom_components/casora/panel/casora-panel-b-ux.js
// Coffee machine as a regular card, one tile per made-up machine of the test house (dev/casora_mock/coffee.py) – each
// source shows only the rows it has (25-coffee.js SOURCES):
//   Testbarista (Home Connect core), Morgenbohne (De'Longhi BT), Bohnenwerk (power curve), Kaffeeinsel (Home Connect
//   Local), Espressobar (plug on a device named like a coffee machine).
//   1. Tile "Bereit" (plug: "Bereit" from its idle watts), popup with the sections of the source and without the others.
//   2. Start a drink where the source can: Kaffeeinsel (select + start button), Testbarista (service), Morgenbohne
//      (select starts) → ring and the drink's name; cancel where there is a button. Espressobar: brewing by power →
//      tile "Läuft", popup shows the watts.
// The tiles exist only in the browser (not saved); services act on the test devices only.
import { open, casoraDashboard, dashboard, check, need, finish, stable, atFinish, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const M = {
  testbarista: { id: 'sensor.testbarista_operation_state', has: ['Getränke', 'Stärke', 'Pflege', 'Statistik'], not: ['Steckdose'],
    start: 'consumer_products_coffee_maker_program_beverage_espresso', drink: 'Espresso', run: ['sensor.testbarista_operation_state', 'run'] },
  morgenbohne: { id: 'switch.morgenbohne_power', has: ['Getränke', 'Statistik'], not: ['Stärke', 'Temperatur'],
    start: 'Cappuccino', drink: 'Cappuccino', run: ['binary_sensor.morgenbohne_dispensing', 'on'] },
  bohnenwerk: { id: 'sensor.bohnenwerk_status', has: ['Zuletzt', 'Getränk an der Maschine wählen', 'Pflege', 'Statistik'], not: ['Stärke', 'Getränk antippen'] },
  kaffeeinsel: { id: 'sensor.kaffeeinsel_operation_state', has: ['Getränke', 'Stärke', 'Temperatur', 'Pflege', 'In 35', 'Statistik'], not: ['Menge', 'Steckdose'],
    start: 'consumerproducts_coffeemaker_program_beverage_espresso', drink: 'Espresso', run: ['sensor.kaffeeinsel_operation_state', 'run'] },
  espressobar: { id: 'switch.espressobar_steckdose', has: ['Steckdose an', 'Leistung'], not: ['Getränke', 'Pflege', 'Statistik'] },
};
const tok = await tokens();
const post = (path, data) => fetch(BASE + '/api/services/' + path,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
const reset = async () => {
  for (const g of ['testbarista', 'morgenbohne', 'bohnenwerk', 'kaffeeinsel']) await post('casora_mock/kaffee_warnung', { art: 'aus', geraet: g });
  await post('button/press', { entity_id: 'button.testbarista_stop_program' });
  await post('button/press', { entity_id: 'button.kaffeeinsel_abort' });
  await post('switch/turn_off', { entity_id: 'switch.espressobar_steckdose' });
  await post('switch/turn_on', { entity_id: 'switch.espressobar_steckdose' });
  // Picking a drink preselects it on Home Connect machines: back to the test house's Cappuccino (r281 expects it).
  await post('select/select_option', { entity_id: 'select.testbarista_selected_program', option: 'consumer_products_coffee_maker_program_beverage_cappuccino' });
  await post('select/select_option', { entity_id: 'select.kaffeeinsel_program', option: 'consumerproducts_coffeemaker_program_beverage_cappuccino' });
};
atFinish(reset);

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
await dashboard(page, dash.url, 3);
const S = (id) => page.evaluate((x) => { const s = document.querySelector('home-assistant').hass.states[x]; return s ? s.state : null; }, id);
await need('Kaffeemaschinen im Testhaus (Mock)', (await Promise.all(Object.values(M).map((m) => S(m.id)))).every((x) => x != null));
await reset();
await page.waitForFunction(() => {
  const st = document.querySelector('home-assistant').hass.states;
  return st['sensor.testbarista_operation_state'].state === 'ready' && st['sensor.kaffeeinsel_operation_state'].state === 'ready';
}, null, { timeout: 20000 }).catch(() => {});
await page.evaluate(async (list) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  list.forEach(([key, id], i) => {
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_coffee', entity: id });
    el.classList.add('qa-r329-' + key);
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:' + (40 + i * 280) + 'px;top:300px;width:260px;height:180px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
  });
}, Object.entries(M).map(([k, m]) => [k, m.id]));
const tile = (key) => stable(page, (c) => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r329-' + c);
  const st = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  const full = st && st.querySelector('.sf-f');
  return st ? String((full || st).textContent || '').replace(/[\s  ]+/g, ' ').trim() : null;
}, key, { max: 10000, quiet: 800 });
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
  return { txt: parts.join(' ').replace(/[\s  ]+/g, ' ').slice(0, 3000), ring: window.__pierce('svg circle[stroke-dasharray]', pop.shadowRoot).length };
}, null, { max: 12000, quiet: 1200 });
const openPop = async (key) => {
  const r = await page.evaluate((c) => { const b = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r329-' + c).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, key);
  await page.mouse.click(r.x + 30, r.y + 30);
  return popText();
};
const closePop = async () => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };
const tapMi = (prefix) => page.evaluate((p) => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = pop && window.__pierce('[data-casora-mi^="' + p + '"]', pop.shadowRoot)[0]; if (el) el.click(); return !!el; }, prefix);

for (const [key, m] of Object.entries(M)) {
  const t = await tile(key);
  await check(`${key}: Kachel „Bereit“`, t === 'Bereit', t);
  const p = await openPop(key);
  await check(`${key}: Popup mit ${m.has.join(', ')}`, p && m.has.every((x) => p.txt.includes(x)), p && p.txt);
  await check(`${key}: Popup ohne ${m.not.join(', ')}`, p && !m.not.some((x) => p.txt.includes(x)), p && p.txt);
  if (m.start) {
    await check(`${key}: ${m.drink} antippen`, await tapMi('coffee-pick:' + m.id + '|' + m.start));
    await page.waitForTimeout(700);
    await check(`${key}: ${m.drink} starten`, await tapMi('coffee-start:'));
    await page.waitForFunction(([id, v]) => document.querySelector('home-assistant').hass.states[id].state === v, m.run, { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const q = await popText();
    await check(`${key}: Bezug mit Ring und „${m.drink}“`, q && q.ring >= 1 && q.txt.includes(m.drink), q && q.txt);
    if (key !== 'morgenbohne') {
      await check(`${key}: Abbrechen`, await tapMi('coffee-stop:'));
      await page.waitForTimeout(1500);
      await check(`${key}: abgebrochen`, (await S(m.run[0])) !== m.run[1], await S(m.run[0]));
    }
  }
  await closePop();
}
// Plug: brewing by power.
await post('casora_mock/kaffee_beziehen', { geraet: 'espressobar', dauer: 15 });
await page.waitForTimeout(1500);
await check('espressobar: Kachel „Läuft“ bei 1350 W', (await tile('espressobar')) === 'Läuft', await tile('espressobar'));
const pp = await openPop('espressobar');
await check('espressobar: Kopf mit Leistung', pp && /1\.?350 W/.test(pp.txt), pp && pp.txt);
await closePop();
await finish();
