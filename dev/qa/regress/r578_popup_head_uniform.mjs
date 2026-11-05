// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#roomLabelOf,_paintSoft,_fitHeadGap,_syncHeadLine,casoraSubTitle
// Owner (05.11.2026, README popups on the phone): the label above the title came and went – a plant in a room and the
// climate popup stood without one, the blinds and the house's light said „Zuhause“ – and so the dials started at
// different heights (the head was one line shorter without a label). The rule now (richtlinien §3):
//   1. every v3 popup has a label above its title: the room for a popup of one room, „Zuhause“ for a collection;
//   2. the head always has the same height (label line and status line keep their place even when empty), and the
//      stage starts at the same height in every popup (±1 px), also when the content puts an empty card above it.
// Popups: a thermostat in a room, a room's climate badge, a plant (its room only an HA area), the blinds of the house
// and the house's light. Desktop 1440 and phone 393. Nothing is saved.
import { open, dashboard, casoraDashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const tplOf = (x) => [].concat((x && x.template) || []);
const cardsIn = (v) => { const out = []; (function w(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) return x.forEach(w);
  if (x.type === 'custom:button-card') out.push(x); w(x.cards); w(x.sections); })(v.cards || v.sections); return out; };
const home = dash.config.views[0];
const cover = cardsIn(home).find((c) => tplOf(c).includes('casora_cover') && c.entity);
const light = cardsIn(home).find((c) => tplOf(c).includes('casora_light') && c.entity);
// A room view with a thermostat tile and a climate badge.
const roomV = dash.config.views.find((v, i) => i > 0 && cardsIn(v).some((c) => tplOf(c).includes('casora_thermostat')));
await need('Startseite mit Jalousien und Licht, ein Raum mit Thermostat', cover && light && roomV);
const thermo = cardsIn(roomV).find((c) => tplOf(c).includes('casora_thermostat')).entity;

// What the open popup's head shows and where its stage starts (from the sheet's top).
const MEASURE = () => {
  const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
  const sr = e.shadowRoot, sf = e.surface.getBoundingClientRect();
  const vis = (x) => x && x.getBoundingClientRect().height > 0 && getComputedStyle(x).visibility !== 'hidden';
  const st = window.__pierce('.hui-stage', sr).filter(vis)[0];
  const t = (x) => (x ? x.textContent : '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
  return { v3: e.getAttribute('data-casora-pv') === 'v3', eyebrow: t(sr.querySelector('.header-eyebrow')), title: t(sr.querySelector('.header-title')),
    head: Math.round(sr.querySelector('.header-bar').getBoundingClientRect().height),
    stage: st ? Math.round(st.getBoundingClientRect().top - sf.top) : null };
};

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  const pop = async (id, cfg) => {
    await page.evaluate(([id, cfg]) => new Promise((res) => { if (window.casoraPopup) window.casoraPopup.close();
      setTimeout(() => window._casoraNotifyOpenViaCard(id, res, cfg || undefined), 500); }), [id, cfg]);
    let m = null;
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(250); m = await page.evaluate(MEASURE); if (m && m.stage != null) break; }
    await page.waitForTimeout(2200);
    return page.evaluate(MEASURE);
  };
  const roomUrl = size.mobile ? dash.phone.url + '/' + dash.phone.config.views[0].path : dash.url + '/' + roomV.path;
  await dashboard(page, roomUrl, 3);
  // A plant whose room is only its HA area (no plant tile in a room of the dashboard).
  const info = await page.evaluate((thermo) => {
    const h = document.querySelector('home-assistant').hass;
    const areaOf = (i) => { const en = h.entities[i] || {}; const ar = en.area_id || (en.device_id && (h.devices[en.device_id] || {}).area_id); return ar && h.areas[ar] ? h.areas[ar].name : ''; };
    const plant = Object.keys(h.states).find((i) => /^plant\./.test(i) && !window._casoraRoomOf(i) && areaOf(i));
    const temp = window.__pierce('button-card').filter((b) => [].concat(b._config.template || []).includes('casora_badge_temp')
      && b._stateObj && b.getBoundingClientRect().width > 0).map((b) => b._stateObj.entity_id)[0] || null;
    return { plant, plantRoom: plant ? areaOf(plant) : '', temp, thermoRoom: window._casoraRoomOf(thermo) || areaOf(thermo) };
  }, thermo);
  await need(label + ': eine Pflanze mit HA-Bereich, ohne Raum im Dashboard', info.plant, info);
  const seen = [];
  const judge = async (name, m, want) => {
    if (!m) { await check(`${label} ${name}: Popup offen`, false); return; }
    seen.push({ name, ...m });
    const ok = m.eyebrow && (want ? m.eyebrow.toLowerCase() === want.toLowerCase() : true);
    await check(`${label} ${name}: Etikett über dem Titel „${want || 'Raum oder Zuhause'}“`, m.v3 && !!ok, m);
  };
  await judge('Thermostat im Raum', await pop(thermo), info.thermoRoom);
  // The room's climate badge (desktop: tapped in its room tile, so it names that room); the phone has no badge row on
  // its first view – the same badge opened from its config, a badge without a room says „Zuhause“.
  if (info.temp) await judge('Raumklima', await pop(info.temp), size.mobile ? '' : roomV.cards.find((c) => tplOf(c).includes('casora_room')).name);
  else await judge('Raumklima', await pop(null, { type: 'custom:button-card', template: 'casora_badge_temp', entity: (await page.evaluate(() =>
    Object.keys(document.querySelector('home-assistant').hass.states).find((i) => /^sensor\..*temperatur/.test(i)))) }), 'Zuhause');
  await judge('Pflanze', await pop(null, { type: 'custom:button-card', template: 'casora_plant', entity: info.plant }), info.plantRoom);
  if (!size.mobile) await dashboard(page, dash.url + '/' + home.path, 3);
  await judge('Jalousien (Sammlung)', await pop(cover.entity), 'Zuhause');
  await judge('Beleuchtung (Sammlung)', await pop(light.entity), 'Zuhause');
  const tops = seen.map((s) => s.stage).filter((x) => x != null);
  await check(`${label}: alle Bühnen beginnen auf derselben Höhe (±1 px)`, tops.length === seen.length && Math.max(...tops) - Math.min(...tops) <= 1,
    seen.map((s) => `${s.name}: Kopf ${s.head}, Bühne ${s.stage}`));
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close());
}
await finish();
