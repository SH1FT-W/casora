// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/12-tanken.js#lmOf,mlOf,leafOf,hmCreate,syncMap
// Issue #253: since HA 2026.10 ha-map draws through an engine: MapLibre (m._engine._map) with WebGL2, Leaflet
// (m._engine.leafletMap) without it. Casora looked for Leaflet only on m.leafletMap (before 2026.10), so in a browser
// without WebGL2 the Fuel prices map stayed empty and fell back to the dot map after 12 s. Expected: without WebGL2
// the tile map (Leaflet) shows with the price pins, and its gestures are off like on the MapLibre map.
// The fuel sensor is faked in the browser only (invented stations), nothing is saved in HA.
import { open, casoraDashboards, dashboard, check, need, finish, fakeStates, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('a Casora dashboard', desk, all.map((d) => d.url));

const SID = 'sensor.casora_tanken_qa_testauto_e10';
const CENTER = [50.11, 8.682];   // a public place (Frankfurt am Main); the test house sits at 0/0
const stations = [
  { n: 'Freie Tankstelle Mühlweg', b: 'Freie', p: 1.689, o: true, d: 2.8, x: 1.9, y: 2.0 },
  { n: 'Autohof Nord', b: 'JET', p: 1.699, o: true, d: 4.6, x: 2.4, y: 3.9 },
  { n: 'Tankpunkt Südring', b: 'Tankpunkt', p: 1.719, o: true, d: 1.2, x: -0.4, y: -1.1 },
].map((s) => ({ ...s, lat: +(CENTER[0] + s.y / 110.57).toFixed(4), lng: +(CENTER[1] + s.x / (111.32 * Math.cos(CENTER[0] * Math.PI / 180))).toFixed(4) }));
const typical = Array.from({ length: 24 }, (_, h) => (h >= 19 && h <= 22 ? 1.649 : h < 6 ? 1.70 : 1.749));
const sensor = (dev) => ({ state: '1.689', attributes: { car_device_id: dev, car_name: 'Testauto', fuel: 'e10',
  friendly_name: 'Testauto günstigster Preis Super E10', unit_of_measurement: '€/L', source: 'key', origin: 'home',
  radius_km: 5, center: CENTER, updated: new Date().toISOString(), count: stations.length, stations, error: null,
  typical, low: 1.649, high: 1.749, days: 14, learn_days_left: 0 } });

const { page, context } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
// A browser without WebGL2 (hardware acceleration off, no GPU).
await context.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : get.call(this, type, ...rest); };
  if (window.OffscreenCanvas) {
    const og = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : og.call(this, type, ...rest); };
  }
});
await dashboard(page, desk.url);
await need('WebGL2 is off in this browser', await page.evaluate(() => document.createElement('canvas').getContext('webgl2') === null));

// Car tile in the browser (its range sensor as anchor), service calls caught.
const car = await page.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const conn = ha.hass.connection;
  if (!conn.__qaSend) {
    conn.__qaSend = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => (m && m.type === 'call_service' ? Promise.resolve({}) : conn.__qaSend(m));
  }
  const C = window._casoraCar;
  const anchor = C && C.id(null, 'reichweite_kombiniert', 'sensor');
  if (!anchor) return null;
  const old = window.__pierce('button-card').find((b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 420 && r.height > 60 && r.top > 100; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_car', entity: anchor, name: 'Auto' });
  el.hass = ha.hass;
  if (old) old.parentNode.insertBefore(el, old); else document.body.appendChild(el);
  window.__qaTile = el;
  await new Promise((r) => setTimeout(r, 1000));
  return { anchor, dev: (ha.hass.entities[anchor] || {}).device_id || null };
});
await need('a car in the test house', car && car.dev, car);
const real = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((k) => k.startsWith('sensor.casora_tanken_')));
const none = Object.fromEntries(real.concat([SID]).map((k) => [k, null]));
await fakeStates(page, { ...none, [SID]: sensor(car.dev) }, { sticky: true });

// Car popup, then the view "Tanken".
await page.evaluate(() => {
  const el = window.__qaTile;
  el.hass = document.querySelector('home-assistant').hass;
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && (ev.detail.config.icon_tap_action || ev.detail.config.tap_action);
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: !!el._hasIconActions });
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const row = window.__pierce('.casora-tank-row, [data-casora-page^="tanken"]', s).find((e) => e.getBoundingClientRect().height > 0);
  if (row) row.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
});

const m = await page.evaluate(async () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const one = (q) => window.__pierce(q, s)[0] || null;
  let sawLeaflet = false, sawMaplibre = false;
  for (let i = 0; i < 80; i++) {
    const l = one('.ct-hamap'), h = l && l.querySelector('ha-map');
    if (h && h._engine && h._engine.leafletMap) sawLeaflet = true;
    if (h && h._engine && h._engine._map) sawMaplibre = true;
    if (l && l.dataset.state !== 'laden') break;
    await new Promise((r) => setTimeout(r, 250));
  }
  await new Promise((r) => setTimeout(r, 600));   // the layer fades in (opacity .35 s)
  const layer = one('.ct-hamap'), hm = layer && layer.querySelector('ha-map');
  const lm = hm && hm._engine && hm._engine.leafletMap;
  return { state: layer ? layer.dataset.state : null, hasMap: !!hm, leaflet: sawLeaflet, maplibre: sawMaplibre,
    visible: !!layer && getComputedStyle(layer).display !== 'none' && +getComputedStyle(layer).opacity > 0.9,
    pins: layer ? layer.querySelectorAll('svg.ct-hamap-pins g.ct-pin').length : 0,
    dragging: lm && lm.dragging ? lm.dragging.enabled() : null };
});
await need('HA falls back to Leaflet without WebGL2 (ha-map._engine.leafletMap)', m.leaflet && !m.maplibre, m);
await check('without WebGL2: the tile map loads (no fallback to the dot map)', m.state === 'ok' && m.visible, m);
await check('without WebGL2: price pins on the tile map', m.pins >= 1, m);
await check('without WebGL2: the map does not move under a finger (dragging off)', m.dragging === false, m);
await finish();
