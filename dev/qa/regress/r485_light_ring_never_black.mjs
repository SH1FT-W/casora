// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/casora-core.js
// Owner (02.11.2026, iPhone, 26.11.5): the brightness ring of the house light popup was black („100 % Volle Helligkeit“,
// white knob). A lit lamp reported rgb_color [0, 0, 0] (Govee ceiling light running a scene/effect) and its „colour“
// became the ring's colour. Expected: a lamp without a usable colour gives no ring colour – the ring keeps the accent;
// several lamps blend only real colours. Also: on/off-only and brightness-only lamps, a light group reporting black.
// Phone 393×852 light, theme Casora: house popup (light badge on Home) and the room popup (casora_light of the room group).
// Every state is faked in the browser only (fakeStates), nothing is switched or saved.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

// test-neu first (as r425): its house light badge covers every room. The gate's qa-arbeit (CASORA_QA_DASH, ranked
// first there) keeps the setup's own ten-lamp selection on the house badge, without the room group's room (Terrasse),
// so the faked lamp never reached the house popup (gate 26.11.7: „Aus“, empty head and room row).
const multi = (d) => (d.config.views || []).length > 1;
const dash = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with a phone layout', dash && dash.phone, dash && dash.url);
const ph = await open({ width: 393, height: 852, mobile: true, safari: true, dark: false, theme: 'Casora' });
const pg = ph.page; usePage(pg);
await dashboard(pg, dash.phone.url + '/home', 2);
await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
await pg.waitForTimeout(1500);

// A house room with ≥ 3 lamps of its own (test house: Terrasse) and its group.
const house = await pg.evaluate(() => {
  const h = document.querySelector('home-assistant').hass, hl = window._casoraHouseLights && window._casoraHouseLights(h);
  const room = ((hl && hl.rooms) || []).find((r) => r.rid && (r.lights || []).filter((x) => h.states[x] && !Array.isArray(h.states[x].attributes.entity_id)).length >= 2);
  if (!room) return null;
  const st = (x) => h.states[x] && h.states[x].attributes;
  return { name: room.name, rid: room.rid, lamps: room.lights.filter((x) => st(x) && !Array.isArray(st(x).entity_id)),
    groups: room.lights.filter((x) => st(x) && Array.isArray(st(x).entity_id)),
    all: Object.keys(h.states).filter((x) => x.startsWith('light.')).map((x) => [x, st(x).friendly_name || '', st(x).supported_color_modes || [], st(x).entity_id || null]) };
});
await need('a house room with a room group and two lamps', house, house);

// Replace a light's attributes completely (fakeStates merges, so drop it first). Everything else off without colour.
const COLOUR = ['brightness', 'color_mode', 'rgb_color', 'hs_color', 'xy_color', 'color_temp_kelvin', 'effect'];
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

const look = () => pg.evaluate(() => {
  const p = window.casoraPopup && window.casoraPopup.element;
  if (!p) return null;
  const ln = window.__pierce('.hui-dl path.fl.ln', p.shadowRoot).find((x) => x.getBoundingClientRect().width > 0) || window.__pierce('.hui-dl path.fl.ln', p.shadowRoot)[0];
  if (!ln) return { none: true };
  const cs = getComputedStyle(ln), stroke = cs.stroke;
  const m = /url\(["']?#([^"')]+)/.exec(stroke);
  const g = m ? ln.ownerSVGElement.querySelector('#' + CSS.escape(m[1])) : null;
  const dl = ln.closest('.hui-dl');
  return { stroke, shown: cs.display !== 'none', stops: g ? [...g.querySelectorAll('stop')].map((s) => getComputedStyle(s).stopColor) : [],
    dlCol: dl ? getComputedStyle(dl).getPropertyValue('--dl-col').trim() : '', value: dl ? dl.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) : '' };
});
// A usable ring colour: not black, not empty, not „none“ (a gradient: every stop).
const black = (c) => !c || c === 'none' || /^rgba?\(0, 0, 0(, 1)?\)$/.test(c) || /^(#000|#000000|black)$/i.test(c);
// An on/off lamp lit beside dimmable ones fills the ring too (r495): no exception for it.
const ringOk = (l) => l && !l.none && l.shown && (l.stops.length ? l.stops.every((c) => !black(c)) : !black(l.stroke)) && !black(l.dlCol);
const red = (l) => l && l.shown && !l.stops.length && /^rgb\(255, 0, 0\)$/.test(l.stroke);

const closeAll = () => pg.evaluate(async () => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 700)); });
const openHouse = async () => {
  await closeAll();
  const at = await pg.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => /casora_badge_light_group\b/.test([].concat((x._config || {}).template || []).join(' ')) && x.getBoundingClientRect().width > 20);
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!at) return null;
  await pg.touchscreen.tap(at.x, at.y);
  for (let i = 0; i < 20; i++) { await pg.waitForTimeout(300); const l = await look(); if (l && !l.none && /\d/.test(l.value)) return l; }
  return look();
};
const openRoom = async () => {
  await closeAll();
  await pg.evaluate(async (entity) => {
    const ha = document.querySelector('home-assistant');
    const old = ha.shadowRoot.getElementById('qa-r485'); if (old) old.remove();
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity, variables: {} });
    el.id = 'qa-r485'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:10px;top:500px;width:160px;height:120px;z-index:0;opacity:0;';
    ha.shadowRoot.appendChild(el);
    await new Promise((r) => setTimeout(r, 1200));
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  }, house.rid);
  for (let i = 0; i < 20; i++) { await pg.waitForTimeout(300); const l = await look(); if (l && !l.none && /\d/.test(l.value)) return l; }
  return look();
};

const [a, b] = house.lamps;
const grp = house.groups[0] || null;
const roomOn = (attrs) => ({ [house.rid]: { brightness: 255, ...attrs } });
const cases = [
  ['black colour (rgb 0,0,0) with an effect', { [a]: { color_mode: 'rgb', rgb_color: [0, 0, 0], hs_color: [0, 0], brightness: 255, effect: 'Sunrise', effect_list: ['Sunrise', 'Aurora'] }, ...roomOn({ color_mode: 'rgb', rgb_color: [0, 0, 0], hs_color: [0, 0] }) }],
  ['black colour (rgb 0,0,0) without an effect', { [a]: { color_mode: 'rgb', rgb_color: [0, 0, 0], brightness: 255 }, ...roomOn({ color_mode: 'rgb', rgb_color: [0, 0, 0] }) }],
  ...(grp ? [['a light group reporting black', { [grp]: { color_mode: 'rgb', rgb_color: [0, 0, 0], hs_color: [0, 0], brightness: 255 }, ...roomOn({ color_mode: 'rgb', rgb_color: [0, 0, 0] }) }]] : []),
  ['on/off-only lamp (no brightness, no colour)', { [a]: { color_mode: 'onoff', supported_color_modes: ['onoff'] }, ...roomOn({ color_mode: 'onoff' }) }],
  ['brightness-only lamp', { [a]: { color_mode: 'brightness', supported_color_modes: ['brightness'], brightness: 128 }, ...roomOn({ color_mode: 'brightness', brightness: 128 }) }],
  ['black lamp next to a red one', { [a]: { color_mode: 'rgb', rgb_color: [0, 0, 0], brightness: 255 }, [b]: { color_mode: 'rgb', rgb_color: [255, 0, 0], hs_color: [0, 100], brightness: 255 }, ...roomOn({ color_mode: 'rgb', rgb_color: [255, 0, 0] }) }],
  ['on/off lamp next to a red one', { [a]: { color_mode: 'onoff', supported_color_modes: ['onoff'] }, [b]: { color_mode: 'rgb', rgb_color: [255, 0, 0], hs_color: [0, 100], brightness: 255 }, ...roomOn({ color_mode: 'rgb', rgb_color: [255, 0, 0] }) }],
];
const shots = process.env.R485_SHOTS;
for (const [label, on] of cases) {
  await setLights(on);
  const h = await openHouse();
  await check('house popup, ' + label + ': ring never black/empty', ringOk(h), h);
  if (shots && label === cases[0][0]) await pg.screenshot({ path: shots + '/house.png' });
  const r = await openRoom();
  await check('room popup, ' + label + ': ring never black/empty', ringOk(r), r);
  // A real colour still colours the ring: the red lamp alone (black and on/off lamps bring none).
  if (/next to a red one/.test(label)) await check(label + ': the ring is the red lamp\'s colour', red(h) && red(r), { h, r });
  if (shots && label === cases[0][0]) await pg.screenshot({ path: shots + '/room.png' });
}
await closeAll();
await finish();
