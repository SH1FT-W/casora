// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js dashboards/casora/button_card_templates.json
// Issue #116 (owner decision „Variante C“): blinds named „Jalousie Links“ / „Jalousie Rechts“ in the living room and in
// the bedroom showed „Links · Rechts · Links · Rechts“ in the house popup (casoraDropCommonPrefix drops „Jalousie“).
// Expected: a cut name that would appear twice and lacks its room gets the room in front („Wohnzimmer Links“,
// „Schlafzimmer Links“ …), and the sub page takes that name. Unchanged: unique names (the owner's production names
// „Jalousie Küche“, „Jalousie Wohnzimmer Links“ … stay „Küche“, „Wohnzimmer Links“ …) and a room's popup („Links“, „Rechts“).
// Names and areas are faked in the browser only; nothing saved.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot, fakeStates } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('a Casora dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);

// Invented blinds (browser only) named like the owner's production; four of them later get the reporter's names, all get areas.
const WL = 'cover.qa_blind_living_left', WR = 'cover.qa_blind_living_right', SL = 'cover.qa_blind_bedroom', SR = 'cover.qa_blind_bath';
const AREA = { [WL]: 'Wohnzimmer', [WR]: 'Wohnzimmer', [SL]: 'Schlafzimmer', [SR]: 'Schlafzimmer',
  'cover.qa_blind_kitchen': 'Küche', 'cover.qa_blind_office': 'Büro' };
const blind = (name) => ({ state: 'open', attributes: { friendly_name: name, current_position: 100, is_closed: false, device_class: 'shutter', supported_features: 15 } });
const group = (name, members) => ({ state: 'open', attributes: { friendly_name: name, entity_id: members, current_position: 100, is_closed: false,
  icon: 'mdi:blinds-horizontal', supported_features: 15 } });
await fakeStates(page, { 'cover.qa_blind_kitchen': blind('Jalousie Küche'), 'cover.qa_blind_bath': blind('Jalousie Bad'), 'cover.qa_blind_office': blind('Jalousie Büro'),
  [SL]: blind('Jalousie Schlafzimmer'), [WL]: blind('Jalousie Wohnzimmer Links'), [WR]: blind('Jalousie Wohnzimmer Rechts'),
  'cover.qa_blinds': group('Jalousien', [SL, SR, 'cover.qa_blind_office', 'cover.qa_blind_kitchen', WL, WR]),
  'cover.qa_blinds_living': group('Jalousien Wohnzimmer', [WL, WR]) }, { sticky: true });
const PROD = ['cover.qa_blind_kitchen', 'cover.qa_blind_bath', 'cover.qa_blind_office', 'cover.qa_blind_bedroom', WL, WR];
const ok = await page.evaluate((AREA) => {
  const ha = document.querySelector('home-assistant'), h = ha.hass;
  if (!Object.keys(AREA).every((id) => h.states[id])) return false;
  const areas = { ...(h.areas || {}) }, entities = { ...(h.entities || {}) };
  Object.entries(AREA).forEach(([id, name]) => {
    const aid = 'qa_r488_' + name.toLowerCase().replace(/[^a-z]/g, '');
    areas[aid] = { area_id: aid, name };
    entities[id] = { ...(entities[id] || { entity_id: id }), area_id: aid };
  });
  ha._updateHass({ areas, entities });
  return true;
}, AREA);
await need('faked blinds in the browser', ok);

const head = () => page.evaluate(() => { const e = window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
  return { title: e._headerTitle ? e._headerTitle.textContent.replace(/​/g, '').trim() : null, back: !!(e._headerBack && !e._headerBack.hidden) }; });
const rows = () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return [];
  return window.__pierce('.hui-row[data-casora-mi]', s).filter((r) => r.getBoundingClientRect().width > 20).map((r) => {
    const b = r.getBoundingClientRect(), l = r.querySelector('.hui-inner > div:nth-child(2) > div') || r;
    return { id: r.getAttribute('data-casora-mi'), name: l.textContent.trim(), x: b.x + b.width / 3, y: b.y + b.height / 2 }; }); });

// Opens a blinds tile (made in the browser like the dashboard's); with `tap` it taps that row and reads the sub page.
async function popup(entity, covers, room, tag, tap) {
  await page.evaluate(() => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); });
  await page.waitForTimeout(600);
  const at = await page.evaluate(async ({ entity, covers, room }) => {
    const ha = document.querySelector('home-assistant');
    ha.shadowRoot.querySelectorAll('.qa-r488').forEach((x) => x.remove());
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: ['casora_cover', 'casora_popup_cover'], entity, name: 'Jalousien',
      variables: { room_name: room, covers } });
    el.classList.add('qa-r488');
    el.hass = ha.hass;
    el.style.cssText = 'position:fixed;left:400px;top:300px;width:220px;height:140px;z-index:99990;';
    ha.shadowRoot.appendChild(el);
    setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
    await new Promise((r) => setTimeout(r, 1200));
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width * 0.5, y: b.y + b.height * 0.3 };
  }, { entity, covers, room });
  await page.mouse.click(at.x, at.y);
  let R = [];
  for (let i = 0; i < 30 && R.length < 2; i++) { await page.waitForTimeout(250); R = await rows(); }
  await page.waitForTimeout(400);
  R = await rows();
  await shot(tag + '_list');
  const out = { names: Object.fromEntries(R.map((r) => [r.id, r.name])) };
  const row = tap && R.find((r) => r.id === tap);
  if (!row) return out;
  await page.waitForTimeout(700);
  await page.mouse.click(row.x, row.y);
  let h = null;
  for (let i = 0; i < 25 && !((h = await head()) && h.back); i++) await page.waitForTimeout(200);
  await page.waitForTimeout(500);
  out.sub = await head();
  await shot(tag + '_sub');
  return out;
}

// 1. The owner's production names: unique after the cut, nothing changes.
const p = await popup('cover.qa_blinds', PROD, 'Zuhause', 'prod');
await need('house popup lists the blinds', Object.keys(p.names).length === 6, p);
await check('production names unchanged: „Küche“, „Bad“, „Büro“, „Schlafzimmer“, „Wohnzimmer Links“, „Wohnzimmer Rechts“',
  p.names['cover.qa_blind_kitchen'] === 'Küche' && p.names['cover.qa_blind_bath'] === 'Bad' && p.names['cover.qa_blind_office'] === 'Büro'
  && p.names['cover.qa_blind_bedroom'] === 'Schlafzimmer' && p.names[WL] === 'Wohnzimmer Links' && p.names[WR] === 'Wohnzimmer Rechts', p.names);

// 2. #116: „Jalousie Links“ / „Jalousie Rechts“ in two rooms.
await fakeStates(page, { [WL]: blind('Jalousie Links'), [WR]: blind('Jalousie Rechts'), [SL]: blind('Jalousie Links'), [SR]: blind('Jalousie Rechts') }, { sticky: true });
const t = await popup('cover.qa_blinds', [WL, WR, SL, SR], 'Zuhause', 'twins', SL);
await check('#116: the twins get their room in front', t.names[WL] === 'Wohnzimmer Links' && t.names[WR] === 'Wohnzimmer Rechts'
  && t.names[SL] === 'Schlafzimmer Links' && t.names[SR] === 'Schlafzimmer Rechts', t.names);
await check('#116: the sub page takes the row name („Schlafzimmer Links“)', t.sub && t.sub.back && t.sub.title === 'Schlafzimmer Links', t.sub);

// 3. A room's popup (both in the bedroom): no room in front.
const r = await popup('cover.qa_blinds_living', [SL, SR], 'Schlafzimmer', 'room');
await check('room popup unchanged: „Links“, „Rechts“', r.names[SL] === 'Links' && r.names[SR] === 'Rechts', r.names);
await finish();
