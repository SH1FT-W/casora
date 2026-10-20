// @zustand: frisch
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-basis.js custom_components/casora/panel/casora-panel-assist.js dev/casora_mock/hubs.py dev/casora_mock/haus.py
// "Start fresh" shows every lamp in its room: lamps behind a bridge were not found from 1.0.3 until 26.10.41 and nobody
// noticed, because the test house had none. Now it has a Hue-like bridge, a Zigbee coordinator and a two-channel
// dimmer (dev/casora_mock/hubs.py, rooms "Garage" and "Garten"). Runs the real setup in the Studio (choose
// rooms → fill rooms automatically → preview → Create) up to the point where the dashboard would be written, and
// checks what would be created: every light with an area (not hidden, no config/diagnostic entity, no status LED,
// not the chamber light of a printer) is on a tile of its room and on the room's Lights badge, the preview shows the
// hub rooms with their lights. Nothing is saved (_create is caught, writing calls are refused).
import { open, ready, check, need, finish } from './lib.mjs';

const { page } = await open({ width: 1440, height: 1000 });
const PANEL = () => { const p = window.__panel && window.__panel(); return !!(p && p._hass && (p._state !== undefined || p._flowMode)); };
await ready(page, '/casora-studio', PANEL);
const H = (fn, arg) => page.evaluate(fn, arg);

// Nothing goes to HA: catch the creation, refuse writing calls.
await H(() => {
  const p = window.__panel();
  p._create = async (url_path, title, picked, filled) => { window.__qaFilled = { picked, filled }; };
  const c = document.querySelector('home-assistant').hass.connection;
  const o = c.sendMessagePromise.bind(c);
  c.sendMessagePromise = (m) => (/(save|create|update|delete|\/set$|call_service|execute_script)/.test(m && m.type)
    ? Promise.reject(new Error('qa: blocked ' + m.type)) : o(m));
});

// The hub lamps of the test house (dev/casora_mock/hubs.py LAMPS).
const LAMPS = {
  'light.werkbanklampe': 'Garage', 'light.palmenleuchte': 'Garten', 'light.deckenlicht_garage': 'Garage',
  'light.werkbank_spots': 'Garage', 'light.wandlicht_garten': 'Garten',
};
const have = await H((ids) => ids.filter((id) => document.querySelector('home-assistant').hass.states[id]), Object.keys(LAMPS));
await need('hub lamps in the test house (dev/casora_mock/hubs.py)', have.length === Object.keys(LAMPS).length, have);

// 1) Rooms: all.
await H(() => window.__panel()._createForm());
await page.waitForFunction(() => window.__pierce('.rp-room').length > 0, null, { timeout: 30000 });
const pre = await H(() => window.__pierce('.rp-room').filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.dataset.name));
await check('hub rooms are preselected (they get tiles)', ['Garage', 'Garten'].every((n) => pre.includes(n)), pre);
await H(() => window.__pierce('.rp-room').forEach((r) => r.setAttribute('aria-checked', 'true')));
const primary = (re) => H((src) => {
  const foot = window.__pierce('.flowfoot').filter((f) => f.offsetParent).pop();
  const b = foot && [...foot.querySelectorAll('button')].filter((x) => x.offsetParent && !x.classList.contains('ghost') && !x.disabled)
    .filter((x) => new RegExp(src, 'i').test(x.textContent.trim())).pop();
  if (b) b.click();
  return !!b;
}, re.source);
const until = (fn, arg, timeout = 30000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);
await need('step 1/3 rooms', await primary(/^(Dashboard erstellen|Create Dashboard)$/));

// 2) Fill rooms: automatically.
await need('step 2/3 fill rooms', await until(() => window.__pierce('.themecard[data-k=auto]').some((e) => e.offsetParent)));
await H(() => window.__pierce('.themecard[data-k=auto]')[0].click());
await until(() => { const f = window.__pierce('.flowfoot').filter((x) => x.offsetParent).pop();
  return !!f && [...f.querySelectorAll('button')].some((b) => /^(Weiter|Continue)$/.test(b.textContent.trim()) && !b.disabled); }, null, 20000);
await need('continue to the preview', await primary(/^(Weiter|Continue)$/));

// 3) Preview: the hub rooms with their lights (one tile "3 × Light" in Garage, "2 × Light" in Garten).
await need('step 3/3 preview', await until(() => window.__pierce('.bs-item[aria-checked]').length > 0));
const preview = await H(() => Object.fromEntries(window.__pierce('.bs-room').map((box) => [
  (box.querySelector(':scope > b') || {}).firstChild?.textContent || '',
  [...box.querySelectorAll('.bs-item')].map((b) => b.textContent.replace(/\s+/g, ' ').trim())])));
await check('preview: Garage with its three lights', (preview.Garage || []).some((t) => /3 ×/.test(t)), preview.Garage);
await check('preview: Garten with its two lights', (preview.Garten || []).some((t) => /2 ×/.test(t)), preview.Garten);
await check('preview: thermostat behind the coordinator in Garage', (preview.Garage || []).some((t) => /Heizkörper|Thermostat/i.test(t)), preview.Garage);

// 4) Create (caught): what would be written.
await need('create', await primary(/(anlegen|erstellen|^Create)/));
await need('creation caught', await until(() => !!window.__qaFilled, null, 15000));
const res = await H(() => {
  const h = document.querySelector('home-assistant').hass;
  const R = h.entities, D = h.devices, S = h.states, A = h.areas;
  const { filled } = window.__qaFilled;
  const members = (id, seen = new Set()) => {
    if (seen.has(id)) return [];
    seen.add(id);
    const m = [].concat(((S[id] || {}).attributes || {}).entity_id || []);
    return [id].concat(...m.map((x) => members(x, seen)));
  };
  const ids = (v) => { const out = []; JSON.stringify(v, (k, x) => { if (typeof x === 'string' && /^light\.[a-z0-9_]+$/.test(x)) out.push(x); return x; }); return out; };
  const deep = (v) => new Set([].concat(...ids(v).map((x) => members(x))));
  const areaOf = (eid) => { const e = R[eid] || {}; const a = e.area_id || (D[e.device_id] || {}).area_id; return a && A[a] ? A[a].name : null; };
  const printer = (dev) => !!dev && Object.keys(R).some((x) => R[x].device_id === dev && ['print_status', 'stage'].includes(R[x].translation_key));
  const expect = Object.keys(S).filter((eid) => /^light\./.test(eid) && R[eid] && areaOf(eid) && !R[eid].hidden && !R[eid].entity_category
    && !R[eid].disabled_by && !/(^|_)status_led$/.test(eid.split('.')[1]) && !printer(R[eid].device_id));
  const out = { n: expect.length, tile: [], badge: [] };
  expect.forEach((eid) => {
    const room = areaOf(eid);
    if (!deep(filled.tiles[room] || []).has(eid)) out.tile.push(eid + ' → ' + room);
    const V = filled.vars[room] || {};
    if (!deep(Object.keys(V).filter((k) => /^light_(entity_\d+|group_entity)$/.test(k)).map((k) => V[k])).has(eid)) out.badge.push(eid + ' → ' + room);
  });
  out.hub = Object.keys(S).filter((eid) => /^light\.(werkbank|palmen|deckenlicht_garage|wandlicht_garten)/.test(eid))
    .map((eid) => [eid, areaOf(eid), deep(filled.tiles[areaOf(eid)] || []).has(eid)]);
  return out;
});
console.log('  info   lights with an area:', res.n, ' hub lamps:', JSON.stringify(res.hub));
await check('every lamp with an area on a tile of its room', res.n >= 5 && !res.tile.length, res.tile);
await check('every lamp with an area on its room\'s Lights badge', !res.badge.length, res.badge);
await check('hub lamps in their rooms', Object.entries(LAMPS).every(([eid, room]) => res.hub.some(([e, a, ok]) => e === eid && a === room && ok)), res.hub);
await finish();
