// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/44-waermepumpe.js#_casoraHeatPump custom_components/casora/scripts/local/00-finder.js#casoraHeatPumpFind dashboards/casora/button_card_templates.json#casora_heat_pump
// Heat pump tile and popup (issue #132) on made-up entities: the tile says program, hot water and whether the
// compressor runs; the popup has the target on the dial, the presets as moons, the hot water and the values. A
// climate with current_temperature null shows the target only, an optional sensor adds „Jetzt“. A plain thermostat
// on the same entity stays as it was. Nothing is saved: the states exist only in this browser (fakeStates).
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates, usePage } from './lib.mjs';

const ID = 'climate.demo_waermepumpe', WATER = 'water_heater.demo_warmwasser', BTN = 'button.demo_einmal_laden',
  COMP = 'binary_sensor.demo_verdichter';
const FAKE = {
  [ID]: { state: 'auto', attributes: { friendly_name: 'Demo Wärmepumpe', hvac_modes: ['off', 'auto'], min_temp: 3, max_temp: 60, target_temp_step: 1,
    preset_modes: ['comfort', 'eco', 'home', 'sleep'], preset_mode: 'home', current_temperature: null, temperature: 19, temperature_unit: '°C',
    hvac_action: 'idle', supported_features: 401 } },
  [WATER]: { state: 'on', attributes: { friendly_name: 'Demo Warmwasser', min_temp: 10, max_temp: 60, current_temperature: 42.9, temperature: 50, temperature_unit: '°C' } },
  [BTN]: { state: 'unknown', attributes: { friendly_name: 'Demo Einmal laden' } },
  [COMP]: { state: 'off', attributes: { friendly_name: 'Demo Verdichter', device_class: 'running' } },
  'sensor.demo_aussen': { state: '9.8', attributes: { friendly_name: 'Demo Außen', device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.demo_vorlauf': { state: '25.6', attributes: { friendly_name: 'Demo Vorlauf', device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.demo_ruecklauf': { state: '25.5', attributes: { friendly_name: 'Demo Rücklauf', device_class: 'temperature', unit_of_measurement: '°C' } },
  'sensor.demo_leistungszahl': { state: '3.0', attributes: { friendly_name: 'Demo Leistungszahl' } },
  'sensor.demo_leistung': { state: '6.0', attributes: { friendly_name: 'Demo Verdichterleistung', device_class: 'power', unit_of_measurement: 'kW' } },
  'sensor.demo_raum': { state: '20.5', attributes: { friendly_name: 'Demo Raum', device_class: 'temperature', unit_of_measurement: '°C' } },
};
const VARS = { water_heater_entity: WATER, charge_button: BTN, compressor_entity: COMP, outdoor_entity: 'sensor.demo_aussen',
  supply_entity: 'sensor.demo_vorlauf', return_entity: 'sensor.demo_ruecklauf', cop_entity: 'sensor.demo_leistungszahl', power_entity: 'sensor.demo_leistung' };

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 1000 });
usePage(page);
await dashboard(page, dash.url, 3);
await fakeStates(page, FAKE, { sticky: true });
await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass;
  window.__calls = []; h.callService = (d, s, data, target) => { window.__calls.push({ d, s, data, target }); return Promise.resolve(); };
});
const mount = (id, template, variables, left) => page.evaluate(async ({ id, entity, template, variables, left }) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  ha.shadowRoot.getElementById(id)?.remove();
  const el = h.createCardElement({ type: 'custom:button-card', template, entity, name: 'Wärmepumpe', variables });
  el.id = id; el.hass = ha.hass;
  el.style.cssText = `position:fixed;left:${left}px;top:300px;width:220px;height:140px;z-index:99990;`;
  ha.shadowRoot.appendChild(el);
  if (!window.__qaTiles) { window.__qaTiles = []; setInterval(() => window.__qaTiles.forEach((e) => { if (e.hass !== ha.hass) e.hass = ha.hass; }), 200); }
  window.__qaTiles.push(el);
}, { id, entity: ID, template, variables, left });
const tileRead = (id) => {
  const el = document.querySelector('home-assistant').shadowRoot.getElementById(id);
  const s = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
  const fa = s && s.querySelector('.sf-f');
  const c = el && el.shadowRoot && el.shadowRoot.querySelector('.casora-icon-circle');
  return { text: s ? s.textContent.replace(/\s+/g, ' ').trim() : '', full: fa ? fa.textContent.trim() : '', circle: c ? c.getAttribute('style') : '' };
};
const tileText = (id) => page.evaluate(tileRead, id);
const readyTile = (id) => stable(page, () => null, null, { max: 300, quiet: 100 }).then(() => page.waitForFunction((id) => {
  const el = document.querySelector('home-assistant').shadowRoot.getElementById(id);
  return el && el.shadowRoot && el.shadowRoot.querySelector('ha-card') && el.shadowRoot.querySelector('#state');
}, id, { timeout: 15000 }));

await mount('qa-r609', 'casora_heat_pump', VARS, 300);
await mount('qa-r609-plain', 'casora_thermostat', {}, 540);
await readyTile('qa-r609'); await readyTile('qa-r609-plain');
await page.waitForTimeout(500);

let t = await tileText('qa-r609');
await check('tile: active program', /Zuhause/.test(t.full), t);
await check('tile: hot water current and target', /42,9° \/ 50°/.test(t.full), t);
await check('tile: compressor off', /· Aus$/.test(t.full), t);
const off = t.circle;
await check('tile: the icon circle is not coloured while the compressor is off', /puck-off-bg/.test(off), off);

// The compressor starts: the tile follows (the entity is the tile's own; button-card must watch it).
await fakeStates(page, { [COMP]: { state: 'on', attributes: {} } }, { sticky: true });
t = await stable(page, tileRead, 'qa-r609', { max: 6000, quiet: 400, until: (v) => /Läuft/.test(v.full) });
await check('tile: compressor start shows „Läuft“ live', /· Läuft$/.test(t.full), t);
await check('tile: the icon circle is coloured while the compressor runs', /puck-heat/.test(t.circle), t.circle);

const plain = await tileText('qa-r609-plain');
await check('plain thermostat on the same entity: unchanged, no program, no hot water', !/Zuhause|Wasser|Läuft/.test(plain.text) && /Automatik/.test(plain.text), plain);
await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.getElementById('qa-r609-plain')?.remove());

// Popup: tap the tile.
await page.mouse.click(300 + 150, 300 + 100);
const look = () => {
  const p = window.casoraPopup && window.casoraPopup.element;
  if (!p || !p.hasAttribute('open')) return { open: false };
  const R = p.shadowRoot, all = window.__pierce('*', R);
  const vis = (n) => n.getClientRects && n.getClientRects().length;
  const moons = all.filter((n) => n.classList && n.classList.contains('hui-moon') && vis(n));
  const rows = all.filter((n) => n.classList && n.classList.contains('hui-srow') && vis(n));
  const n = all.find((x) => x.classList && x.classList.contains('hui-st-n') && vis(x));
  const stageEl = all.find((x) => x.getAttribute && x.getAttribute('data-casora-stage'));
  return { open: true, stage: stageEl ? stageEl.textContent.replace(/\s+/g, ' ').trim() : '', title: (R.querySelector('.header-title') || {}).textContent, stages: all.filter((x) => x.getAttribute && x.getAttribute('data-casora-stage')).map((x) => x.getAttribute('data-casora-stage')),
    value: n ? n.textContent.trim() : '', text: R.textContent.replace(/\s+/g, ' '),
    moons: moons.map((m) => m.textContent.replace(/\s+/g, ' ').trim()),
    active: moons.filter((m) => m.classList.contains('on') || m.getAttribute('aria-pressed') === 'true' || m.getAttribute('aria-checked') === 'true').map((m) => m.textContent.trim()),
    charts: all.filter((x) => x.nodeName === 'CASORA-CHART' && vis(x)).length, rows: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()) };
};
let pop = await stable(page, look, null, { max: 15000, quiet: 800, until: (v) => v && v.open && v.value });
await need('popup open with its dial', pop && pop.open && pop.stages.includes('S2'), pop);
await check('dial shows the target 19', pop.value.startsWith('19'), pop.value);
await check('climate with current_temperature null: the dial has no „Jetzt“', !/Jetzt \d/.test(pop.stage), pop.stage);
await check('the four presets are moons', ['Komfort', 'Eco', 'Zuhause', 'Schlafen'].every((w) => pop.moons.some((m) => m.includes(w))), pop.moons);
await check('the supply temperature as the Verlauf', pop.charts === 1, pop.charts);
await check('hot water row with current and target', pop.rows.some((r) => /42,9 °C/.test(r)) && pop.rows.some((r) => /Ziel.*50,0 °C/.test(r)), pop.rows);
await check('values rows', [/Außen.*9,8 °C/, /Vorlauf.*25,6 °C/, /Rücklauf.*25,5 °C/, /Leistungszahl.*3/, /Verdichterleistung.*6 kW/, /Verdichter.*Läuft/].every((re) => pop.rows.some((r) => re.test(r))), pop.rows);

// The presets, the hot water target and the one-time charge call the right services.
const click = async (test) => {
  const at = await page.evaluate((test) => {
    const p = window.casoraPopup.element, f = new Function('n', 'return ' + test);
    const el = window.__pierce('*', p.shadowRoot).find((n) => n.getClientRects && n.getClientRects().length && f(n));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, test);
  if (at) await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(500);
  return !!at;
};
const calls = () => page.evaluate(() => window.__calls.slice());
// The first open re-lays the popup once after measuring its columns: tap again until the service went out.
let c = [];
for (let i = 0; i < 4 && !c.length; i++) {
  await click(`n.classList && n.classList.contains('hui-moon') && /Komfort/.test(n.textContent)`);
  c = await calls();
}
await check('moon sets the preset (climate.set_preset_mode)', c.some((x) => x.d === 'climate' && x.s === 'set_preset_mode' && x.data.preset_mode === 'comfort' && x.target.entity_id === ID), c);
await click(`n.getAttribute && n.getAttribute('aria-label') === 'Mehr' && n.closest && !n.closest('.hui-dl') && n.dataset.casoraStep`);
c = await calls();
await check('+ sets the hot water target (water_heater.set_temperature)', c.some((x) => x.d === 'water_heater' && x.s === 'set_temperature' && x.data.temperature === 51 && x.target.entity_id === WATER), c);
await click(`n.classList && n.classList.contains('hui-srow') && /Einmal aufheizen/.test(n.textContent)`);
c = await calls();
await check('one-time charge presses its button', c.some((x) => x.d === 'button' && x.s === 'press' && x.target.entity_id === BTN), c);
await page.evaluate(() => window.casoraPopup.close && window.casoraPopup.close());
await page.waitForFunction(() => !window.casoraPopup.element.hasAttribute('open'), null, { timeout: 8000 });
await page.waitForTimeout(600);

// Optional sensor: the dial gets a current value from it.
await page.evaluate(() => document.querySelector('home-assistant').shadowRoot.getElementById('qa-r609')?.remove());
await page.evaluate(() => { window.__qaTiles.length = 0; });
await mount('qa-r609b', 'casora_heat_pump', { ...VARS, temp_sensor: 'sensor.demo_raum' }, 300);
await readyTile('qa-r609b');
await page.mouse.click(300 + 150, 300 + 100);
pop = await stable(page, look, null, { max: 15000, quiet: 800, until: (v) => v && v.open && v.value });
await check('optional sensor: the dial shows „Jetzt 20,5 °C“', /Jetzt 20,5 °C/.test(pop.stage), pop.stage);

await finish();
