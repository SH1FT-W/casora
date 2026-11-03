// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Owner, 03.11.2026: the lamp chips under a light badge got the room's name (variables.room_name) to drop it from
// their own names – but casora_popup_light reads variables.room_name as the popup's own title. So Home's room chip
// (a Home with room_name „Zuhause“) opened its room's light popup titled „Zuhause“ with the rows' full names
// („Stehlampe Büro“), and a lamp chip in a room (aqi_room_name) opened its popup titled with the room.
// Expected:
//   - desktop: Home's room chip opens the room's light popup with the same title and rows as the room's own light badge,
//     the room as its label (on Home nothing else names it), never „Zuhause“
//   - desktop: a lamp chip in a room opens a popup titled with the lamp, not the room
//   - phone: the room's light badge (the phone opens popups, no chip row) gives the desktop room's popup
// Set in the browser only: Home's room_name and the room's aqi_room_name (as saved dashboards have them), two made-up
// lamps named after the room in the room's group, and a made-up porch lamp first in the house group (houses whose
// group lists lamps beside the room groups: the room's popup does not climb to the house there). Nothing is saved.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const multi = (d) => (d.config.views || []).length > 1;
const dash = await casoraDashboard((d) => d.url === (process.env.CASORA_QA_DASH || 'test-neu') && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with rooms and a phone layout', dash && dash.phone, dash && dash.url);
// Rooms whose light badge is one HA light group (light_entity_1 alone); Home's chips decide which one.
const heroOf = (v) => { let h = null; (function f(x) { if (h || !x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(f);
  if ([].concat(x.template || []).includes('casora_room') && x.variables) { h = x; return; } Object.values(x).forEach(f); })(v.cards); return h; };
const cands = (dash.config.views || []).slice(1).map((v) => ({ v, h: heroOf(v) }))
  .filter(({ h }) => h && typeof h.variables.light_entity_1 === 'string' && !h.variables.light_entity_2);
await need('a room whose light badge is one light group', cands.length, null);
let ROOM, GROUP, ROOM_NAME, REF;
const LAMP = 'light.qa_r508_floor', LAMP2 = 'light.qa_r508_ceiling', PORCH = 'light.qa_r508_porch';
const lamps = async (pg) => {
  const parents = await pg.evaluate(([g, porch]) => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((id) => id.startsWith('light.') && id !== g && Array.isArray(S[id].attributes.entity_id)
      && S[id].attributes.entity_id.includes(g) && !S[id].attributes.entity_id.includes(porch))
      .map((id) => [id, S[id].state, Object.assign({}, S[id].attributes, { entity_id: [porch].concat(S[id].attributes.entity_id) })]); }, [GROUP, PORCH]);
  const patch = {
    [GROUP]: { state: 'off', attributes: { entity_id: [LAMP, LAMP2], friendly_name: ROOM_NAME, supported_color_modes: ['brightness'] } },
    [LAMP]: { state: 'off', attributes: { friendly_name: 'Stehlampe ' + ROOM_NAME, supported_color_modes: ['brightness'] } },
    [LAMP2]: { state: 'off', attributes: { friendly_name: 'Deckenleuchte ' + ROOM_NAME, supported_color_modes: ['brightness'] } },
    [PORCH]: { state: 'off', attributes: { friendly_name: 'Porch', supported_color_modes: ['brightness'] } },
  };
  parents.forEach(([id, st, at]) => { patch[id] = { state: st, attributes: at }; });
  await fakeStates(pg, patch, { sticky: true });
  await pg.waitForTimeout(1200);
};

const head = (pg) => pg.evaluate(() => {
  const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
  const vis = (x) => x && x.getBoundingClientRect().width > 0;
  return { title: e._headerTitle ? e._headerTitle.textContent.replace(/​/g, '').trim() : null,
    eyebrow: e._headerEyebrow ? e._headerEyebrow.textContent.trim() : '',
    rows: window.__pierce('.lps-tx b', e.shadowRoot).filter(vis).map((x) => x.textContent.trim()) };
});
const until = async (pg, fn) => { let h = null; for (let i = 0; i < 25; i++) { await pg.waitForTimeout(250); h = await head(pg); if (h && fn(h)) break; } await pg.waitForTimeout(500); return head(pg); };
const close = (pg) => pg.evaluate(async () => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 700)); });
// The visible card of a template (and entity), scrolled into view: its centre.
const spot = (pg, tpl, id) => pg.evaluate(([tpl, id]) => {
  const b = window.__pierce('button-card').find((x) => new RegExp('\\b' + tpl + '\\b').test([].concat((x._config || {}).template || []).join(' '))
    && (!id || (x._stateObj && x._stateObj.entity_id === id)) && x.getBoundingClientRect().width > 20);
  if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, [tpl, id]);
// The room hero's variables as a saved dashboard has them (browser only): re-set its config.
const heroVars = (pg, extra) => pg.evaluate(async (extra) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_room'));
  if (!b) return false;
  b.setConfig(Object.assign({}, b._config, { variables: Object.assign({}, b._config.variables, extra) }));
  b.hass = document.querySelector('home-assistant').hass;
  await new Promise((r) => setTimeout(r, 1200));
  return true;
}, extra);
const lightsRow = async (pg) => { await fakeStates(pg, { 'input_select.casora_expanded_row': { state: 'lights', attributes: {} } }, { sticky: true }); await pg.waitForTimeout(1200); };

// ── Desktop ──
{
  const ph = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
  const pg = ph.page; usePage(pg);
  // Home with its own name (room_name), its light row open: the room chips.
  await dashboard(pg, dash.url, 2);
  await heroVars(pg, { room_name: 'Zuhause', aqi_room_name: 'Zuhause' });
  await lightsRow(pg);
  const shown = await pg.evaluate(() => window.__pierce('button-card').filter((x) => /\bcasora_badge_light\b/.test([].concat((x._config || {}).template || []).join(' '))
    && x._stateObj && x.getBoundingClientRect().width > 20).map((x) => x._stateObj.entity_id));
  const pick = cands.find(({ h }) => shown.includes(h.variables.light_entity_1));
  await need('desktop: Home shows a chip of such a room', pick, { shown, cands: cands.map((c) => c.h.variables.light_entity_1) });
  ROOM = pick.v.path; GROUP = pick.h.variables.light_entity_1; ROOM_NAME = String(pick.h.name || pick.v.title || ROOM);
  await lamps(pg);
  let at = await spot(pg, 'casora_badge_light', GROUP);
  await pg.mouse.click(at.x, at.y);
  const home = await until(pg, (h) => h.rows.length > 0);
  await close(pg);

  // The room's own light badge (held: the popup) – the reference.
  await dashboard(pg, dash.url + '/' + ROOM, 2);
  await lamps(pg);
  await heroVars(pg, { aqi_room_name: ROOM_NAME });
  at = await spot(pg, 'casora_badge_light_group');
  await need('desktop: the room\'s light badge', at, ROOM);
  await pg.mouse.move(at.x, at.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up();
  const ref = await until(pg, (h) => h.rows.length > 0);
  await close(pg);
  await need('desktop: the room\'s light popup', ref && ref.title && ref.rows.length === 2, ref);
  REF = ref;
  // On Home nothing above the popup names the room: its label does (blueprint rule 1), on the room's page the page does.
  await check('desktop: Home\'s room chip opens the room\'s light popup (title „' + ref.title + '“ as in the room, label „' + ROOM_NAME + '“, not „Zuhause“)',
    home && home.title === ref.title && home.title !== 'Zuhause' && home.eyebrow.toLowerCase() === ROOM_NAME.toLowerCase(), { ref, home });
  await check('desktop: … with the same rows, without the room (' + ref.rows.join(', ') + ')',
    home && JSON.stringify(home.rows) === JSON.stringify(ref.rows) && !ref.rows.some((r) => r.includes(ROOM_NAME)), { ref: ref.rows, home: home && home.rows });

  // A lamp chip in the room.
  await lightsRow(pg);
  at = await spot(pg, 'casora_badge_light', LAMP);
  await need('desktop: the lamp chip under the room\'s light badge', at, LAMP);
  await pg.mouse.click(at.x, at.y);
  const lamp = await until(pg, (h) => !!h.title);
  await close(pg);
  await check('desktop: a lamp chip in the room opens a popup titled with the lamp („Stehlampe“), not the room („' + ROOM_NAME + '“)',
    lamp && lamp.title && lamp.title.toLowerCase() !== ROOM_NAME.toLowerCase() && /stehlampe/i.test(lamp.title), { lamp });
  await pg.context().close();
}

// ── Phone: the room's light badge opens its light popup (35-phone-hub.js), no chip row ──
{
  const ph = await open({ width: 393, height: 852, mobile: true, safari: true, dark: false, theme: 'Casora' });
  const pg = ph.page; usePage(pg);
  await dashboard(pg, dash.phone.url + '/home', 2);
  await lamps(pg);
  // The phone's key of the room (as phoneRoomKeys): its overlay, else from its name.
  const flat = []; (function f(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(f); flat.push(x); f(x.cards); })(dash.phone.config.views || []);
  const ov = flat.find((k) => k.type === 'custom:casora-filter-overlay' && k.room === ROOM_NAME);
  const key = (ov && ov.filter_category) || 'room_' + ROOM_NAME.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  await pg.waitForFunction(() => !!window._casoraFilter, null, { timeout: 30000 });
  await pg.evaluate((k) => window._casoraFilter.set(k), key);
  await pg.waitForTimeout(2500);
  const at = await pg.evaluate(() => {
    const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
    const row = card && card.shadowRoot.querySelector('#rooms_row');
    const g = row && window.__pierce('button-card', row).find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_light_group')
      && b.getBoundingClientRect().width > 0);
    if (!g) return null; g.scrollIntoView({ block: 'center' }); const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await need('phone: the room\'s light badge (' + key + ')', at, key);
  await pg.touchscreen.tap(at.x, at.y);
  const pop = await until(pg, (h) => h.rows.length > 0);
  await close(pg);
  await check('phone: the room\'s light badge opens the room\'s light popup as on the desktop (title „' + REF.title + '“, rows without the room)',
    pop && pop.title === REF.title && pop.title !== 'Zuhause' && JSON.stringify(pop.rows) === JSON.stringify(REF.rows), { REF, pop });
  await pg.context().close();
}
await finish();
