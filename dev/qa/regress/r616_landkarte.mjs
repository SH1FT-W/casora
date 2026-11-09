// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/44-landkarte.js#_casoraMapCard dashboards/casora/button_card_templates.json#casora_map dashboards/casora/button_card_templates.json#casora_popup_map
// Map tile (community card #159). Tile: HA's map on the tile like a camera's picture – the map draws once (markers follow,
// no reload, no jump), takes no gestures, comes up when the tile is in view and is gone when the tile is; if it cannot
// load, or with „Map on the tile“ off, it is the plain tile. Popup: Home Assistant's own map card, large (the complaint
// with a map card in a Universal tile's popup was its size on a desktop): the wide popup, 900 with the map across it and
// at least 400 high; phone: the sheet. Desktop in Chromium, the phone in WebKit. Nothing is saved: the tiles only exist
// in this browser (fakeStates, createCardElement). Map pictures come from HA's map service and may not load everywhere.
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates } from './lib.mjs';

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);

const PEOPLE = {
  'person.qa_kartenperson': { state: 'home', attributes: { friendly_name: 'Probe', latitude: 52.4, longitude: 13.4, gps_accuracy: 5 } },
  'person.qa_kartenzweite': { state: 'not_home', attributes: { friendly_name: 'Zweite', latitude: 52.6, longitude: 13.5, gps_accuracy: 5 } },
  'zone.qa_kartenzone': { state: '0', attributes: { friendly_name: 'Probezone', latitude: 52.5, longitude: 13.45, radius: 300, passive: false, persons: [] } },
  'geo_location.qa_beben': { state: '12', attributes: { friendly_name: 'Probepunkt', latitude: 52.55, longitude: 13.6, source: 'qa_quakes', unit_of_measurement: 'km' } },
};

const mount = (page, cls, vars, box) => page.evaluate(async ([cls, vars, box]) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_map', name: 'Landkarte', variables: vars });
  el.classList.add(cls);
  el.hass = ha.hass;
  el.style.cssText = `position:fixed;left:${box[0]}px;top:${box[1]}px;width:${box[2]}px;height:${box[3]}px;z-index:99990;`;
  ha.shadowRoot.appendChild(el);
  el._qaTick = setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, [cls, vars, box]);
const root = (cls) => `document.querySelector('home-assistant').shadowRoot.querySelector('.${cls}')`;
const waitField = (page, cls) => page.waitForFunction((sel) => { const el = new Function('return ' + sel)(); return el && el.shadowRoot && el.shadowRoot.querySelector('ha-card') && el.shadowRoot.querySelector('#name'); }, root(cls), { timeout: 15000 });
const tileInfo = (page, cls) => page.evaluate((sel) => {
  const el = new Function('return ' + sel)(), s = el.shadowRoot;
  const map = s.querySelector('casora-tile-map');
  const mf = map && map.parentElement ? getComputedStyle(map.parentElement).pointerEvents : null;
  const canvas = map && map._el && map._el.shadowRoot ? map._el.shadowRoot.querySelector('canvas') : null;
  const m = map && map._ml;
  const name = s.querySelector('#name'), st = s.querySelector('#state'), icon = s.querySelector('#img-cell');
  return { name: name && name.textContent.trim(), state: st ? st.textContent.trim() : '', flag: el.getAttribute('data-casora-map'), map: !!map, canvas: !!canvas,
    field: mf, nameColor: name ? getComputedStyle(name).webkitTextFillColor : '', iconHidden: icon ? getComputedStyle(icon).visibility === 'hidden' : null,
    gestures: m ? ['dragPan', 'scrollZoom', 'boxZoom', 'doubleClickZoom', 'touchZoomRotate', 'keyboard'].map((x) => (m[x] && m[x].isEnabled ? m[x].isEnabled() : false)) : null,
    center: m ? [m.getCenter().lat, m.getCenter().lng] : null, zoom: m ? m.getZoom() : null,
    ctrls: map && map._el && map._el.shadowRoot ? [...map._el.shadowRoot.querySelectorAll('.maplibregl-ctrl-group, .maplibregl-ctrl-top-left, .maplibregl-ctrl-top-right')].filter((n) => n.getBoundingClientRect().width > 0).length : -1,
    attrib: map && map._el && map._el.shadowRoot ? /OpenStreetMap/.test(map._el.shadowRoot.querySelector('.maplibregl-ctrl-attrib')?.textContent || '') : false,
    attribGap: (() => { const a = map && map._el && map._el.shadowRoot && map._el.shadowRoot.querySelector('.maplibregl-ctrl-attrib'); return a ? Math.round(s.querySelector('ha-card').getBoundingClientRect().bottom - a.getBoundingClientRect().bottom) : null; })(),
    live: window._casoraMapCard.liveCount(), text: s.textContent };
}, root(cls));

for (const [tag, o] of [
  ['Desktop', { width: 1440, height: 900 }],
  ['Phone', { width: 393, height: 852, mobile: true, touch: true, scale: 3, safari: true }],
]) {
  const { page, browser } = await open(o);
  await dashboard(page, dash.url, 3);
  await need(tag + ': the module', await page.evaluate(() => !!window._casoraMapCard && !!window._casoraUI));
  await fakeStates(page, PEOPLE, { sticky: true });

  // 1. Option off: the plain tile, no map.
  const [w, h] = tag === 'Desktop' ? [280, 190] : [177, 210];
  await mount(page, 'qa-r616-off', { map_tile: false }, [20, 40, w, h]);
  await waitField(page, 'qa-r616-off');
  await page.waitForTimeout(800);
  const off = await tileInfo(page, 'qa-r616-off');
  await check(tag + ': option off: title and no status, no map', off.name === 'Landkarte' && off.state === '' && !off.map && !off.flag, off);
  await check(tag + ': no undefined/NaN on the tile', !/undefined|NaN/.test(off.text), off.text.slice(0, 100));

  // 2. The map on the tile.
  await mount(page, 'qa-r616', { map_geo: 'all' }, [20, 300, w, h]);
  await waitField(page, 'qa-r616');
  await page.waitForFunction((sel) => new Function('return ' + sel)()?.getAttribute('data-casora-map') === 'ok', root('qa-r616'), { timeout: 25000 }).catch(() => {});
  const t1 = await tileInfo(page, 'qa-r616');
  await check(tag + ': the map came up on the tile', t1.flag === 'ok' && t1.canvas, t1);
  await check(tag + ': one live map', t1.live === 1, t1.live);
  await check(tag + ': title and status over the map, white', t1.name === 'Landkarte' && /\d+ von \d+ zu Hause/.test(t1.state) && /rgb\(255, 255, 255\)/.test(t1.nameColor), [t1.state, t1.nameColor]);
  await check(tag + ': the symbol gives way to the map', t1.iconHidden === true, t1.iconHidden);
  await check(tag + ': no gestures, no controls, the field lets a touch through', t1.gestures && !t1.gestures.some(Boolean) && t1.ctrls === 0 && t1.field === 'none', t1);
  await check(tag + ': attribution stays (licence), small in the bottom corner', t1.attrib && t1.attribGap !== null && t1.attribGap >= 0 && t1.attribGap <= 4, t1.attribGap);

  // 3. Markers follow without reloading, no jump.
  const mapEl = await page.evaluate((sel) => { const e = new Function('return ' + sel)().shadowRoot.querySelector('casora-tile-map'); window.__r616el = e._el; return true; }, root('qa-r616'));
  await need(tag + ': map element', mapEl);
  const marks = () => page.evaluate((sel) => { const e = new Function('return ' + sel)().shadowRoot.querySelector('casora-tile-map')._el; return window.__pierce('ha-entity-marker', e.shadowRoot).map((m) => m.style.transform).sort().join('|'); }, root('qa-r616'));
  const m1 = await marks();
  await fakeStates(page, { 'person.qa_kartenzweite': { state: 'home', attributes: { friendly_name: 'Zweite', latitude: 52.62, longitude: 13.55, gps_accuracy: 5 } } }, { sticky: true });
  await page.waitForTimeout(3200);
  const t2 = await tileInfo(page, 'qa-r616');
  const sameEl = await page.evaluate((sel) => new Function('return ' + sel)().shadowRoot.querySelector('casora-tile-map')._el === window.__r616el, root('qa-r616'));
  await check(tag + ': a state change keeps the same map', sameEl && t2.canvas, sameEl);
  await check(tag + ': no jump', t1.center && t2.center && Math.abs(t1.center[0] - t2.center[0]) < 1e-6 && Math.abs(t1.center[1] - t2.center[1]) < 1e-6 && Math.abs(t1.zoom - t2.zoom) < 1e-6, [t1.center, t2.center, t1.zoom, t2.zoom]);
  await check(tag + ': the marker moved', (await marks()) !== m1, m1.slice(0, 80));
  await check(tag + ': the status follows', t2.state !== t1.state, [t1.state, t2.state]);
  await fakeStates(page, { 'person.qa_kartenzweite': PEOPLE['person.qa_kartenzweite'] }, { sticky: true });

  // 4. The popup, opened with a tap on the tile.
  await page.evaluate((sel) => new Function('return ' + sel)().shadowRoot.querySelector('ha-card').click(), root('qa-r616'));
  const seen = await page.waitForFunction(() => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    return pop && window.__pierce('hui-map-card', pop.shadowRoot).some((c) => c.getBoundingClientRect().width > 0);
  }, null, { timeout: 25000 }).then(() => true).catch(() => false);
  await check(tag + ': a tap opens the popup with Home Assistant\'s map card', seen);
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
    if (!pop) return null;
    const card = window.__pierce('hui-map-card', pop.shadowRoot).find((c) => c.getBoundingClientRect().width > 0);
    const r = (n) => { if (!n) return null; const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, b: b.bottom, r: b.right }; };
    const surf = window.__pierce('.surface', pop.shadowRoot).find((c) => c.getBoundingClientRect().width > 0);
    const hdr = pop.shadowRoot.querySelector('.header-title, .head-title') || window.__pierce('.header-title', pop.shadowRoot)[0];
    const txt = pop.shadowRoot.textContent.replace(/\s+/g, ' ');
    const map = window.__pierce('ha-map', pop.shadowRoot).find((c) => c.getBoundingClientRect().width > 0);
    const marks = window.__pierce('ha-entity-marker', map ? map.shadowRoot : pop.shadowRoot).map((m) => getComputedStyle(m.shadowRoot.querySelector('.marker')).backgroundColor);
    return { marks, card: r(card), surface: r(surf), cfg: card && card._config, title: hdr ? hdr.textContent.trim() : '', txt, vw: window.innerWidth, vh: window.innerHeight };
  });
  await need(tag + ': popup open', !!info);
  if (info && info.card) {
    await check(tag + ': entity markers have their round fill', info.marks.length >= 2 && info.marks.some((c) => !/rgba\(0, 0, 0, 0\)|transparent/.test(c)), info.marks);
    await check(tag + ': head with the title', /Landkarte/.test(info.title) || /Landkarte/.test(info.txt), info.title);
    await check(tag + ': head says who is home', /\d+ von \d+ zu Hause/.test(info.txt), info.txt.slice(0, 120));
    const ids = (info.cfg.entities || []).map((e) => e.entity || e);
    await check(tag + ': every person and zone, and the sources from the tile',
      ids.includes('person.qa_kartenperson') && ids.includes('person.qa_kartenzweite') && ids.includes('zone.qa_kartenzone')
      && JSON.stringify(info.cfg.geo_location_sources) === JSON.stringify(['all']), ids);
    await check(tag + ': history off and the theme decides dark or light', info.cfg.hours_to_show === 0 && info.cfg.theme_mode === 'auto' && !('default_zoom' in info.cfg), info.cfg);
    if (tag === 'Desktop') {
      await check('Desktop: the wide popup (900)', info.surface && info.surface.w >= 880 && info.surface.w <= 920, info.surface);
      await check('Desktop: the map fills it, across and high', info.card.w >= 800 && info.card.h >= 420, info.card);
      await check('Desktop: nothing leaves the window', info.card.b <= info.vh && info.surface.b <= info.vh + 1 && info.card.r <= info.vw, { c: info.card, s: info.surface });
    } else {
      await check('Phone: the map across the sheet', info.card.w >= 340 && info.card.r <= info.vw, info.card);
      await check('Phone: high enough to use, inside the screen', info.card.h >= 300 && info.card.b <= info.vh, info.card);
    }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  // 5. A chosen list is exact.
  const only = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    return window._casoraMapCard.ids(h.states, { map_entities: ['person.qa_kartenperson'] });
  });
  await check(tag + ': a chosen list is exact', JSON.stringify(only) === JSON.stringify(['person.qa_kartenperson']), only);

  // 6. Gone means gone; a map that cannot load is the plain tile, without an error card.
  await page.evaluate((sel) => new Function('return ' + sel)().remove(), root('qa-r616'));
  await page.waitForTimeout(400);
  const after = await page.evaluate(() => ({ live: window._casoraMapCard.liveCount(), canvases: window.__pierce('casora-tile-map').length }));
  await check(tag + ': a removed tile leaves no live map', after.live === 0 && after.canvases === 0, after);
  await page.evaluate(() => { window._casoraHaMap.__ok = window._casoraHaMap.ok; window._casoraHaMap.ok = () => false; });
  await mount(page, 'qa-r616-fail', {}, [20, 300, w, h]);
  await waitField(page, 'qa-r616-fail');
  await page.waitForTimeout(1200);
  const fail = await tileInfo(page, 'qa-r616-fail');
  await check(tag + ': no map service: the plain tile, no error', fail.flag === null && !fail.canvas && fail.iconHidden === false && !/fehler|error/i.test(fail.text), fail);
  await page.evaluate(() => { window._casoraHaMap.ok = window._casoraHaMap.__ok; });

  // 7. Phone, the real way to the large form: a tile with size „auto“ in a phone row, large through casoraAutoLarge (no hand
  // on the wrapper); with the option off it stays small.
  if (tag === 'Phone') {
    await page.evaluate(() => { document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r616-fail,.qa-r616-off').forEach((x) => x.remove()); });
    const row = await page.evaluate(async () => {
      const ha = document.querySelector('home-assistant');
      const r = window.__pierce('casora-smart-row').find((x) => x._scrollMode && x._sortEnabled && x._config && (x._config.cards || []).length);
      if (!r) return { none: true, path: location.pathname };
      window.__row = r;
      const tile = (variables, name) => ({ type: 'custom:button-card', template: 'casora_map', name, variables });
      const cards = [tile({ size: 'auto' }, 'Landkarte'), tile({ size: 'auto', map_tile: false }, 'Schlicht'), ...r._config.cards.slice(0, 1)];
      r.setConfig({ ...r._config, cards });
      r.hass = ha.hass;
      // The row keeps its card elements on a new config: put the tiles in them as a saved dashboard would have them.
      await new Promise((res) => setTimeout(res, 300));
      [0, 1].forEach((i) => r._wrappers[i].firstElementChild.setConfig(cards[i]));
      r.hass = ha.hass;
      return { path: location.pathname };
    });
    await need('Phone: a phone row', !row.none, row);
    await page.waitForTimeout(800);
    await page.waitForFunction(() => { const w = window.__row._wrappers[0]; const c = w && w.querySelector('button-card'); return c && w.dataset.size === 'large' && c.getAttribute('data-casora-map') === 'ok'; }, null, { timeout: 25000 }).catch(() => {});
    const r2 = await page.evaluate(() => {
      const R = window.__row, card = (i) => R._wrappers[i] && R._wrappers[i].querySelector('button-card');
      const a = card(0), b = card(1);
      const dist = () => { const map = a && a.shadowRoot.querySelector('casora-tile-map'); if (!map || !map._el) return null; const pts = window.__pierce('ha-entity-marker', map._el.shadowRoot).filter((m) => /^[A-Z]$/.test(m.shadowRoot.querySelector('.marker')?.textContent.trim() || '')).map((m) => { const r = m.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }); let min = Infinity; pts.forEach((p, i) => pts.slice(i + 1).forEach((q) => { min = Math.min(min, Math.hypot(p[0] - q[0], p[1] - q[1])); })); return pts.length > 1 ? Math.round(min) : null; };
      return { size0: R._wrappers[0]?.dataset.size || '', ok: a && a.getAttribute('data-casora-map'), h0: a ? Math.round(a.getBoundingClientRect().height) : 0, size1: R._wrappers[1]?.dataset.size || '', h1: b ? Math.round(b.getBoundingClientRect().height) : 0, map1: !!(b && b.shadowRoot.querySelector('casora-tile-map')), minDist: dist() };
    });
    await check('Phone: the map tile becomes large through casoraAutoLarge', r2.size0 === 'large' && r2.h0 >= 100 && r2.ok === 'ok', r2);
    await check('Phone: option off stays small, without a map', r2.size1 !== 'large' && r2.h1 < 100 && !r2.map1, r2);
    await check('Phone: the people on the map do not stack', r2.minDist === null || r2.minDist >= 18, r2);
  }
  await browser.close();
}
await finish();
