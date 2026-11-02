// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/casora-core.js
// Reported (02.11.2026): in a room with dimmable lamps only one on/off lamp was lit (color_mode „onoff“, no brightness –
// the status LED of a network device). The head said „1 von n an“, but the light dial of the house and of the room
// popup said „Aus“ with an empty ring: the stage counted only the dimmable lamps. Expected: the dial is on (an on/off
// lamp is fully on: 100 %, word „An“), the ring is filled; head, dial and the room row never contradict each other.
// A dimmable lamp lit next to it keeps the dial on its brightness. Phone 393×852 and desktop 1440×900, theme Casora.
// Every state is faked in the browser only (fakeStates), nothing is switched or saved.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage, shot } from './lib.mjs';

// test-neu first (as r425): rooms with a room group of their own. The house popup comes from a badge made in the
// browser below, so neither dashboard's own house badge matters.
const multi = (d) => (d.config.views || []).length > 1;
const dash = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with a phone layout', dash && dash.phone, dash && dash.url);
const shots = process.env.R495_SHOTS;

for (const [label, size, url] of [
  ['phone', { width: 393, height: 852, mobile: true, safari: true }, dash.phone && dash.phone.url + '/home'],
  ['desktop', { width: 1440, height: 900 }, dash.url],
]) {
  const ph = await open({ ...size, dark: false, theme: 'Casora' });
  const pg = ph.page; usePage(pg);
  await dashboard(pg, url, 2);
  await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
  await pg.waitForTimeout(1500);

  // A house room with a room group and at least two dimmable lamps of its own.
  const house = await pg.evaluate(() => {
    const h = document.querySelector('home-assistant').hass, hl = window._casoraHouseLights && window._casoraHouseLights(h);
    const st = (x) => h.states[x] && h.states[x].attributes;
    const lamp = (x) => st(x) && !Array.isArray(st(x).entity_id);
    const room = ((hl && hl.rooms) || []).find((r) => r.rid && h.states[r.rid] && (r.lights || []).filter(lamp).length >= 2);
    if (!room) return null;
    return { name: room.name, rid: room.rid, lamps: room.lights.filter(lamp),
      all: Object.keys(h.states).filter((x) => x.startsWith('light.')).map((x) => [x, st(x).friendly_name || '', st(x).supported_color_modes || [], st(x).entity_id || null]) };
  });
  await need(label + ': a house room with a room group and two lamps', house, house);

  // Replace every light's attributes (fakeStates merges, so drop them first); everything not given is off.
  const setLights = async (on) => {
    const drop = {}, put = {};
    for (const [id, name, modes, members] of house.all) {
      drop[id] = null;
      const base = { friendly_name: name, supported_color_modes: modes, ...(members ? { entity_id: members } : {}) };
      put[id] = on[id] ? { state: 'on', attributes: { ...base, ...on[id] } } : { state: 'off', attributes: { ...base, color_mode: null } };
    }
    await fakeStates(pg, drop, { sticky: true });
    await fakeStates(pg, put, { sticky: true });
  };

  const look = () => pg.evaluate((roomName) => {
    const p = window.casoraPopup && window.casoraPopup.element;
    if (!p) return null;
    const vis = (e) => e && e.getBoundingClientRect().width > 0;
    const txt = (e) => (e && e.textContent || '').replace(/\s+/g, ' ').trim();
    const dl = window.__pierce('.hui-dl', p.shadowRoot).find(vis);
    if (!dl) return { none: true };
    const ln = [...dl.querySelectorAll('path.fl.ln')].find((x) => getComputedStyle(x).display !== 'none') || null;
    const head = window.__pierce('.header-status', p.shadowRoot).find(vis);
    const row = window.__pierce('.lps-row', p.shadowRoot).filter(vis).find((r) => txt(r.querySelector('.lps-tx b')) === roomName);
    return { value: txt(dl.querySelector('.hui-st-val')), word: txt(dl.querySelector('.hui-st-w')), off: txt(dl.querySelector('.hui-st-val')) === 'Aus',
      ring: !!ln, head: txt(head), row: row ? txt(row.querySelector('.lps-tx small')) : null };
  }, house.name);

  const closeAll = () => pg.evaluate(async () => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 700)); });
  const settle = async () => {
    for (let i = 0; i < 20; i++) { await pg.waitForTimeout(300); const l = await look(); if (l && !l.none && l.value) return l; }
    return look();
  };
  // The house light popup from a house light badge made in the browser (light_rooms_auto: the rooms of the dashboard,
  // as _casoraHouseLights lists them above). The dashboard's own badge may carry a fixed lamp list without the chosen
  // room (gate 26.11.7: e2e t03 rebuilds test-neu with the setup's ten-lamp list), then the faked lamp never reached it.
  // Held like the badge (hold_action opens the popup); nothing saved.
  const holdHouseBadge = (id) => pg.evaluate(async (id) => {
    const ha = document.querySelector('home-assistant');
    const old = ha.shadowRoot.getElementById(id); if (old) old.remove();
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_badge_light_group', entity: 'input_select.casora_expanded_row',
      variables: { enabled: true, light_rooms_auto: true } });
    el.id = id; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:10px;top:500px;z-index:0;opacity:0;';
    ha.shadowRoot.appendChild(el);
    await new Promise((r) => setTimeout(r, 1500));
    el._handleAction({ detail: { action: 'hold' } }, { isIcon: false });
    return true;
  }, id);
  const openHouse = async () => {
    await closeAll();
    await holdHouseBadge('qa-r495-badge');
    const l = await settle();
    await pg.evaluate(() => { const b = document.querySelector('home-assistant').shadowRoot.getElementById('qa-r495-badge'); if (b) b.remove(); });
    return l;
  };
  const openRoom = async () => {
    await closeAll();
    await pg.evaluate(async (entity) => {
      const ha = document.querySelector('home-assistant');
      const old = ha.shadowRoot.getElementById('qa-r495'); if (old) old.remove();
      const h = await window.loadCardHelpers();
      const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity, variables: {} });
      el.id = 'qa-r495'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:10px;top:500px;width:160px;height:120px;z-index:0;opacity:0;';
      ha.shadowRoot.appendChild(el);
      await new Promise((r) => setTimeout(r, 1200));
      el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    }, house.rid);
    return settle();
  };

  const [a, b] = house.lamps;
  const n = house.lamps.length;
  // The on/off lamp and its room group as HA reports them: the group is on in „onoff“ without a brightness.
  const onoff = { color_mode: 'onoff', supported_color_modes: ['onoff'] };
  const only = { [a]: onoff, [house.rid]: { color_mode: 'onoff' } };
  await setLights(only);

  const h = await openHouse();
  await need(label + ': house popup with the light dial', h && !h.none, h);
  if (shots) await pg.screenshot({ path: `${shots}/${label}-house.png` });
  await check(label + ' house: the dial is on, not „Aus“', !h.off && h.value !== 'Aus' && /100/.test(h.value), h);
  await check(label + ' house: the ring is filled', h.ring, h);
  await check(label + ' house: the dial says „An“', /\bAn\b/.test(h.word), h);
  await check(label + ' house: the room row says the lamp is on', h.row && !/^Aus$/.test(h.row) && /an\b/i.test(h.row), h);
  await check(label + ' house: the head says a light is on', /\ban\b/i.test(h.head) && !/^Aus\b/.test(h.head), h);

  const r = await openRoom();
  await need(label + ': room popup with the light dial', r && !r.none, r);
  if (shots) await pg.screenshot({ path: `${shots}/${label}-room.png` });
  await check(label + ' room: the dial is on, not „Aus“', !r.off && r.value !== 'Aus' && /100/.test(r.value), r);
  await check(label + ' room: the ring is filled', r.ring, r);
  await check(label + ' room: the dial says „An“', /\bAn\b/.test(r.word), r);
  await check(label + ' room: the head says 1 of n is on', new RegExp('\\b1 von ' + n + ' an\\b').test(r.head) || /\ban\b/i.test(r.head), r);

  // A dimmable lamp lit beside the on/off lamp: the dial keeps the dimmable lamp's brightness (it is what turning sets).
  await setLights({ [a]: onoff, [b]: { color_mode: 'brightness', supported_color_modes: ['brightness'], brightness: 77 }, [house.rid]: { color_mode: 'brightness', brightness: 77 } });
  const m = await openRoom();
  await check(label + ' room, a dimmable lamp at 30 % beside it: the dial shows 30 %', m && /\b30\b/.test(m.value) && !/\bAn\b/.test(m.word), m);

  // Everything off: still „Aus“ with an empty ring.
  await setLights({});
  const o = await openRoom();
  await check(label + ' room, all off: „Aus“ and an empty ring', o && o.off && !o.ring, o);
  await closeAll();
  await pg.context().close();
}
await finish();
