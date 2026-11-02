// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/01-basis.js dashboards/casora/button_card_templates.json
// House blinds popup (ZUHAUSE · Jalousien, a cover group over several rooms): the rows drop the shared „Jalousie“
// („Küche“, „Bad“ …). Tapping „Küche“ opened the blind's sub page titled just „Jalousie“: the page stripped its room
// („Jalousie Küche“ minus „Küche“) although it came from the house popup, where no room stands above it.
// Expected: the sub page carries the name of the row that was tapped („Küche“); from a room popup (both blinds in the
// living room) the sub page keeps its title without the room as before („Jalousie Links“).
// Areas and rooms are faked in the browser only (owner's production: blinds on room pages, areas set); nothing saved.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot, fakeStates } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('a Casora dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
// Invented blinds (browser only) named like the owner's production.
const blind = (name) => ({ state: 'open', attributes: { friendly_name: name, current_position: 100, is_closed: false, device_class: 'shutter', supported_features: 15 } });
const group = (name, members) => ({ state: 'open', attributes: { friendly_name: name, entity_id: members, current_position: 100, is_closed: false,
  icon: 'mdi:blinds-horizontal', supported_features: 15 } });
await fakeStates(page, { 'cover.qa_blind_kitchen': blind('Jalousie Küche'), 'cover.qa_blind_bath': blind('Jalousie Bad'), 'cover.qa_blind_office': blind('Jalousie Büro'),
  'cover.qa_blind_bedroom': blind('Jalousie Schlafzimmer'), 'cover.qa_blind_living_left': blind('Jalousie Wohnzimmer Links'),
  'cover.qa_blind_living_right': blind('Jalousie Wohnzimmer Rechts'),
  'cover.qa_blinds': group('Jalousien', ['cover.qa_blind_bedroom', 'cover.qa_blind_bath', 'cover.qa_blind_office', 'cover.qa_blind_kitchen',
    'cover.qa_blind_living_left', 'cover.qa_blind_living_right']),
  'cover.qa_blinds_living': group('Jalousien Wohnzimmer', ['cover.qa_blind_living_left', 'cover.qa_blind_living_right']) }, { sticky: true });
const AREA = { 'cover.qa_blind_kitchen': 'Küche', 'cover.qa_blind_bath': 'Badezimmer', 'cover.qa_blind_office': 'Büro',
  'cover.qa_blind_bedroom': 'Schlafzimmer', 'cover.qa_blind_living_left': 'Wohnzimmer', 'cover.qa_blind_living_right': 'Wohnzimmer' };
// The living room's group sits in the living room too (its popup is a room's popup).
const ROOM = { ...AREA, 'cover.qa_blinds_living': 'Wohnzimmer' };
const ok = await page.evaluate((AREA) => {
  const ha = document.querySelector('home-assistant'), h = ha.hass;
  if (!Object.keys(AREA).every((id) => h.states[id])) return false;
  const areas = { ...(h.areas || {}) }, entities = { ...(h.entities || {}) };
  Object.entries(AREA).forEach(([id, name]) => {
    const aid = 'qa_r487_' + name.toLowerCase().replace(/[^a-z]/g, '');
    areas[aid] = { area_id: aid, name };
    entities[id] = { ...(entities[id] || { entity_id: id }), area_id: aid };
  });
  ha._updateHass({ areas, entities });
  // The blinds sit on their rooms' pages in production (_casoraRoomOf reads the dashboard).
  const orig = window._casoraRoomOf;
  window._casoraRoomOf = (id) => AREA[id] || (orig ? orig(id) : null);
  return true;
}, ROOM);
await need('faked blinds in the browser', ok);

const head = () => page.evaluate(() => { const e = window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
  return { title: e._headerTitle ? e._headerTitle.textContent.replace(/​/g, '').trim() : null, back: !!(e._headerBack && !e._headerBack.hidden),
    eyebrow: e._headerEyebrow ? e._headerEyebrow.textContent.trim() : '' }; });
const rows = () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return [];
  return window.__pierce('.hui-row[data-casora-mi]', s).filter((r) => r.getBoundingClientRect().width > 20).map((r) => {
    const b = r.getBoundingClientRect(), l = r.querySelector('.hui-inner > div:nth-child(2) > div') || r;
    return { id: r.getAttribute('data-casora-mi'), name: l.textContent.trim(), x: b.x + b.width / 3, y: b.y + b.height / 2 }; }); });

// Opens a blinds tile (made in the browser like the dashboard's), taps the row of `id`, returns row and sub page head.
async function subOf(entity, covers, room, id, tag) {
  await page.evaluate(() => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); });
  await page.waitForTimeout(600);
  const at = await page.evaluate(async ({ entity, covers, room }) => {
    document.querySelector('home-assistant').shadowRoot.querySelectorAll('.qa-r487').forEach((x) => x.remove());
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const el = h.createCardElement({ type: 'custom:button-card', template: ['casora_cover', 'casora_popup_cover'], entity, name: 'Jalousien',
      variables: { room_name: room, covers } });
    el.classList.add('qa-r487');
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
  const row = R.find((r) => r.id === id);
  const main = await head();
  await shot(tag + '_list');
  if (!row) return { R, main };
  await page.waitForTimeout(700);
  await page.mouse.click(row.x, row.y);
  let h = null;
  for (let i = 0; i < 25 && !((h = await head()) && h.back); i++) await page.waitForTimeout(200);
  await page.waitForTimeout(500);
  h = await head();
  await shot(tag + '_sub');
  return { row: row.name, main, sub: h, R: R.map((r) => r.name) };
}

const ALL = Object.keys(AREA);
const a = await subOf('cover.qa_blinds', ALL, 'Zuhause', 'cover.qa_blind_kitchen', 'house');
await need('house popup lists the blinds', a.row, a);
await check('house popup: row reads „Küche“', a.row === 'Küche', a);
await check('house popup: sub page with ‹ titled like the row („Küche“), not „Jalousie“', a.sub && a.sub.back && a.sub.title === 'Küche', a);

const W = ['cover.qa_blind_living_left', 'cover.qa_blind_living_right'];
const b = await subOf('cover.qa_blinds_living', W, 'Wohnzimmer', W[0], 'room');
await need('room popup lists the blinds', b.row, b);
await check('room popup: row reads „Links“', b.row === 'Links', b);
await check('room popup: sub page keeps „Jalousie Links“ (room dropped as before)', b.sub && b.sub.back && b.sub.title === 'Jalousie Links', b);
await finish();
