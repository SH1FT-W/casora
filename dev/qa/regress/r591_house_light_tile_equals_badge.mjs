// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/01-basis.js#_casoraLightScope,_casoraHomeLightVars,_casoraHomeLightVarsOf,casoraLightTally,_casoraLightTallyIds custom_components/casora/panel/casora-panel-types.js
// User test, 07.11.2026 (qa-arbeit, desktop): Home's light badge said „Beleuchtung 1 an“ (popup „Räume · 1 von 10 Lampen
// an“, 7 rooms), the house tile right below „Beleuchtung 3 an“ (popup „3 von 16 Lampen an“, 10 rooms with the utility
// room and the hub groups). The house's HA group holds lamps that are in no room of the dashboard; the Studio put it on
// the badge with the rooms listed beside it (what the badge counts), the tile on the bare group. Expected: the house tile
// is the badge – same text, same count and rooms in both popups.
// Puts Home's badge in that state (the house group with the rooms' groups beside it, as the Studio sets it up when the
// group holds more than the ticked lights), checks desktop 1440×900, writes the dashboard back. Nothing is switched.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => d.url === (process.env.CASORA_QA_DASH || 'qa-arbeit')) || await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);
const c0 = await ws();
const saved = await c0.cmd({ type: 'lovelace/config', url_path: dash.url });
const S0 = Object.fromEntries((await c0.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
c0.close();
const members = (id) => (S0[id] && Array.isArray(S0[id].attributes.entity_id) ? S0[id].attributes.entity_id : null);
const heroOf = (v) => (v.cards || []).find((x) => [].concat(x.template || []).includes('casora_room'));
const home = heroOf(saved.views[0]);
const findCard = (x, ok, d = 0) => {
  if (!x || typeof x !== 'object' || d > 8) return null;
  if (Array.isArray(x)) { for (const y of x) { const r = findCard(y, ok, d + 1); if (r) return r; } return null; }
  if (ok(x)) return x;
  return findCard(x.cards, ok, d + 1) || findCard(x.card, ok, d + 1) || findCard(x.sections, ok, d + 1);
};
const tile = findCard(saved.views[0].cards, (x) => [].concat(x.template || []).includes('casora_light') && x.variables && x.variables.house === true);
await need('Home header and house light tile', home && tile, { tile: !!tile });
const house = tile.entity;
await need('house tile on an HA group', members(house), house);
// The rooms' own groups on their badges, as the Studio lists the ticked rooms beside a larger group.
const roomGroups = [];
for (const v of saved.views.slice(1)) {
  const V = (heroOf(v) || {}).variables || {};
  const g = V.light_entity_1;
  if (g && !V.light_entity_2 && members(g) && members(house).includes(g)) roomGroups.push(g);
}
await need('rooms with their own group inside the house group', roomGroups.length >= 2 && roomGroups.length < members(house).length, roomGroups);
const cfg = JSON.parse(JSON.stringify(saved));
const HV = heroOf(cfg.views[0]).variables;
for (const k of Object.keys(HV)) if (/^light_entity_\d+$/.test(k) || k === 'light_rooms_auto') delete HV[k];
HV.light_group_entity = house;
roomGroups.slice(0, 10).forEach((g, i) => { HV['light_entity_' + (i + 1)] = g; });
const save = async (config) => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config }); } finally { c.close(); } };
atFinish(() => save(saved));
await save(cfg);

const o = await open({ width: 1440, height: 900, dark: true });
const pg = o.page; usePage(pg);
await dashboard(pg, dash.url + '/' + (saved.views[0].path || '0'), 3);
await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
await pg.waitForTimeout(1500);
const texts = await pg.evaluate(() => {
  const t = (x) => (x && x.shadowRoot && x.shadowRoot.querySelector('ha-card') ? x.shadowRoot.querySelector('ha-card').innerText : '').replace(/\s+/g, ' ').trim();
  const all = window.__pierce('button-card').filter((x) => x.getBoundingClientRect().width > 20);
  const badge = all.find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light_group'));
  const tl = all.find((x) => [].concat((x._config || {}).template || []).includes('casora_light') && ((x._config || {}).variables || {}).house === true);
  return { badge: t(badge), tile: t(tl) };
});
await need('badge and tile on Home', texts.badge && texts.tile, texts);
const count = (s) => String(s).replace(/^Beleuchtung\s*/, '');
await check('house tile says what the badge says', count(texts.tile) === count(texts.badge), texts);

// Both popups: the same rooms and the same lamps.
const popupOf = async (which) => {
  await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
  await pg.waitForTimeout(700);
  const at = await pg.evaluate((w) => {
    const b = window.__pierce('button-card').find((x) => x.getBoundingClientRect().width > 20 && (w === 'badge'
      ? [].concat((x._config || {}).template || []).includes('casora_badge_light_group')
      : [].concat((x._config || {}).template || []).includes('casora_light') && ((x._config || {}).variables || {}).house === true));
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, which);
  if (!at) return null;
  // The badge's popup is on hold (a tap opens its row), the tile's on tap.
  await pg.mouse.move(at.x, at.y);
  if (which === 'badge') { await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); } else await pg.mouse.click(at.x, at.y);
  for (let i = 0; i < 30; i++) {
    await pg.waitForTimeout(250);
    const r = await pg.evaluate(() => {
      const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
      const c = window._casoraLightSoft && window._casoraLightSoft.cur;
      if (!c || !c.rooms) return null;
      const S = document.querySelector('home-assistant').hass.states;
      const ids = [...new Set(c.rooms.flatMap((r) => r.lights || []))];
      const head = window.__pierce('.lps-lbl').map((x) => x.textContent.trim()).find((x) => /^Räume/.test(x)) || null;
      return { rooms: c.rooms.map((r) => r.name), ids: ids.sort(), on: ids.filter((x) => S[x] && S[x].state === 'on').length, head };
    });
    if (r) return r;
  }
  return null;
};
const pb = await popupOf('badge');
await shot('badge_popup');
const pt = await popupOf('tile');
await shot('tile_popup');
await need('both popups with rooms', pb && pt, { pb, pt });
await check('same rooms in both popups', JSON.stringify(pb.rooms) === JSON.stringify(pt.rooms), { badge: pb.rooms, tile: pt.rooms });
await check('same lamps in both popups', JSON.stringify(pb.ids) === JSON.stringify(pt.ids), { badge: pb.ids.length, tile: pt.ids.length });
await check('same heading „Räume · … Lampen an“', pb.head === pt.head, { badge: pb.head, tile: pt.head });
await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
await finish();
