// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/scripts/casora-core.js
// Issue #57: a room added in the Studio showed only its own badges on the desktop, none of the switched-on built-in
// badges, and on the phone no badges at all. Cause: a new room started without the devices of its HA area (a new
// dashboard gets them, casoraBasis.fillBadges), and the phone room page laid out its badge row only for built-in
// badges (casoraPhoneRoom._any ignored custom_badges).
// Steps as reported, through the Studio: add the room "Garten" (an HA area with lights), add an own badge from a
// device, save. Expected: the Studio filled the room's lights by itself; the desktop room header shows the Lights
// badge and the own badge after it; the phone room page shows both. Then a room in the reported state (only an own
// badge, saved without devices): the phone shows its own badge, and the Studio fills its devices on load.
// Writes both dashboards (test HA only) and restores them.
import { open, studio, casoraDashboard, dashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const URLS = [dash.url, dash.phone.url];
const cfgOf = async (u) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } finally { c.close(); } };
const saveCfg = async (u, cfg) => { const c = await ws(); try { await c.cmd({ type: 'lovelace/config/save', url_path: u, config: cfg }); } finally { c.close(); } };
const saved0 = {};
for (const u of URLS) saved0[u] = await cfgOf(u);
atFinish(async () => { for (const u of URLS) await saveCfg(u, saved0[u]); });
const shotDir = process.env.CASORA_OUT || '/tmp/casora-qa';

const AREA = 'Garten';
// Dashboards made from the whole house (t03's test-neu, qa-arbeit) already have the room: take it out
// first (restored at the end), so the test does not depend on which dashboard comes first.
const isArea = (v) => ((v.cards || [])[0] || {}).name === AREA;
if (saved0[dash.url].views.some(isArea)) {
  await saveCfg(dash.url, { ...saved0[dash.url], views: saved0[dash.url].views.filter((v) => !isArea(v)) });
}
await need('Test house has the HA area "Garten" with lights and no room of that name',
  !(await cfgOf(dash.url)).views.some(isArea));

// Badges in the room header (desktop) / on the phone room page.
const deskBadges = (pg) => pg.evaluate(() => {
  const room = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_room') && b.getBoundingClientRect().width > 0);
  const row = room && room.shadowRoot.querySelector('#badges');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return window.__pierce('button-card').filter((x) => {
    const t = [].concat((x._config || {}).template || []).join(',');
    const q = x.getBoundingClientRect();
    return /^casora_badge_/.test(t) && q.width > 0 && q.y >= r.y - 4 && q.bottom <= r.bottom + 4;
  }).map((x) => ({ t: [].concat(x._config.template).join(','), x: Math.round(x.getBoundingClientRect().x),
    text: (x.shadowRoot.querySelector('ha-card') || {}).innerText?.replace(/\s+/g, ' ').trim() || '' }));
});
const phoneBadges = (pg) => pg.evaluate(() => {
  const chips = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  const row = chips && chips.shadowRoot.querySelector('#rooms_row');
  if (!row || getComputedStyle(row).display === 'none') return [];
  const r = row.getBoundingClientRect();
  return window.__pierce('button-card').filter((x) => {
    const t = [].concat((x._config || {}).template || []).join(',');
    const q = x.getBoundingClientRect();
    return /^casora_badge_/.test(t) && q.width > 0 && q.y >= r.y - 4 && q.bottom <= r.bottom + 4;
  }).map((x) => ({ t: [].concat(x._config.template).join(','),
    text: (x.shadowRoot.querySelector('ha-card') || {}).innerText?.replace(/\s+/g, ' ').trim() || '' }));
});
const phoneRoom = async (key, until) => {
  const ph = await open({ width: 393, height: 852, mobile: true, dark: true });
  usePage(ph.page);
  await dashboard(ph.page, dash.phone.url + '/home', 2);
  await ph.page.evaluate(() => window.casoraPhoneRoom && window.casoraPhoneRoom.refresh && window.casoraPhoneRoom.refresh());
  await ph.page.waitForTimeout(1500);
  await ph.page.evaluate((k) => window._casoraFilter.set(k), key);
  let list = [];
  for (let i = 0; i < 40; i++) {
    list = await phoneBadges(ph.page);
    if (until(list)) break;
    await ph.page.waitForTimeout(400);
  }
  return { page: ph.page, list };
};

try {
  // ── 1. Reporter's steps in the Studio ──────────────────────────────────────
  const o = await open({ width: 1600, height: 1000, dark: false });
  usePage(o.page);
  const pg = o.page;
  const H = (fn, a) => pg.evaluate(fn, a);
  const clickOpt = async (re) => {
    const r = await H((src) => { const rx = new RegExp(src, 'i');
      const e = window.__pierce('.combo-opt').find((x) => x.getClientRects().length && rx.test(x.textContent.replace('✓', '').trim()));
      if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, re.source);
    if (!r) return false;
    await pg.mouse.click(r.x, r.y);
    await pg.waitForTimeout(1200);
    return true;
  };
  await studio(pg, dash.url);
  await H(() => { const p = window.__panel(); p._sel = null; p._bClose(); });
  await pg.locator('button.broom').click();
  await pg.waitForTimeout(800);
  await need('Menu item "Add Room…"', await clickOpt(/^(Raum hinzufügen …|Add Room…)$/));
  await pg.locator('input:visible').first().fill(AREA);
  await pg.getByRole('button', { name: /^(Hinzufügen|Add)$/ }).last().click();
  await pg.waitForTimeout(1500);
  const vars = () => H(() => { const p = window.__panel(); const r = p._state.compact.rooms[p._room]; return { name: r.name, path: r.path, v: JSON.parse(JSON.stringify(r.variables)) }; });
  const a = await vars();
  const lights = Object.keys(a.v).filter((k) => /^light_entity_\d+$/.test(k)).map((k) => a.v[k]);
  await check('New room: the Studio filled the lights of its HA area', a.name === AREA && lights.length > 0 && a.v.casora_badges_auto === true, a.v);

  // Own badge: "Add badge" › "From a device" › pick a light that is not on the Lights badge.
  await H(() => { const p = window.__panel(); p._select({ group: 'badges', key: 'Own badges', label: 'Own badges' }); });
  await pg.waitForTimeout(1200);
  const add = await H(() => { const b = window.__pierce('button.fieldadd').find((x) => x.getClientRects().length && /badge/i.test(x.textContent));
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await need('"Add badge" button', add);
  await pg.mouse.click(add.x, add.y);
  await pg.waitForTimeout(800);
  await need('Menu item "From a device"', await clickOpt(/(Gerät|device)/));
  const own = await H((taken) => Object.keys(window.__panel()._hass.states).find((e) => /^light\./.test(e) && !taken.includes(e)
    && !(window.__panel()._hass.states[e].attributes || {}).entity_id), lights);
  const ownName = await H((e) => (window.__panel()._hass.states[e].attributes || {}).friendly_name || e, own);
  const dev = await H(() => { const box = window.__pierce('.ownbadge')[0];
    const row = box && Array.from(box.querySelectorAll('.row')).find((r) => /^(Gerät|Device)$/.test((r.querySelector('label') || {}).textContent || ''));
    const i = row && row.querySelector('input'); if (!i) return null; const b = i.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await need('Device field of the own badge', dev);
  await pg.mouse.click(dev.x, dev.y);
  await pg.waitForTimeout(500);
  await pg.keyboard.type(ownName);
  await pg.waitForTimeout(800);
  await need('Device in the list', await clickOpt(/./));
  const b = await vars();
  await check('Own badge stored with its device', Array.isArray(b.v.custom_badges) && b.v.custom_badges.length === 1 && /^light\./.test(b.v.custom_badges[0].entity || ''), b.v.custom_badges);

  await H(() => { const p = window.__panel(); p._bClose(); document.activeElement && document.activeElement.blur(); });
  await pg.keyboard.press('Meta+s');
  const saved = await pg.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).then(() => true).catch(() => false);
  await check('⌘S saves', saved);

  // Desktop: Lights badge and the own badge after it.
  await dashboard(pg, dash.url + '/' + b.path, 2);
  let dl = [];
  for (let i = 0; i < 40; i++) {
    dl = (await deskBadges(pg)) || [];
    if (dl.some((x) => /casora_badge_custom/.test(x.t)) && dl.some((x) => /casora_badge_light_group/.test(x.t))) break;
    await pg.waitForTimeout(400);
  }
  await pg.screenshot({ path: shotDir + '/r335_desktop.png' });
  const lg = dl.find((x) => /casora_badge_light_group/.test(x.t));
  const cb = dl.find((x) => /casora_badge_custom/.test(x.t));
  await check('Desktop: built-in Lights badge in the new room', !!lg, dl);
  await check('Desktop: own badge in the new room, after the built-in ones', !!cb && !!lg && cb.x > lg.x, dl);

  // Phone: the room page shows both.
  const key = 'room_' + AREA.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const p1 = await phoneRoom(key, (l) => l.some((x) => /casora_badge_custom/.test(x.t)) && l.some((x) => /casora_badge_light_group/.test(x.t)));
  await p1.page.screenshot({ path: shotDir + '/r335_phone.png' });
  await check('Phone: Lights badge on the new room page', p1.list.some((x) => /casora_badge_light_group/.test(x.t)), p1.list);
  await check('Phone: own badge on the new room page', p1.list.some((x) => /casora_badge_custom/.test(x.t)), p1.list);

  // ── 2. A room in the reported state: only an own badge, no devices ─────────
  const d = await cfgOf(dash.url);
  const view = d.views.find((v) => v.path === b.path);
  const V = view.cards[0].variables;
  Object.keys(V).forEach((k) => { if (/^(light_|climate_entity_|temp_sensor_|humidity_sensor|quality_sensor|security_|media_player_|energy_|casora_badges_auto|casora_energy_auto)/.test(k)) delete V[k]; });
  await saveCfg(dash.url, d);
  const p2 = await phoneRoom(key, (l) => l.some((x) => /casora_badge_custom/.test(x.t)));
  await p2.page.screenshot({ path: shotDir + '/r335_phone_own_only.png' });
  await check('Phone: a room with only an own badge shows its badge row', p2.list.length >= 1 && p2.list.every((x) => /casora_badge_custom/.test(x.t)), p2.list);

  const o3 = await open({ width: 1600, height: 1000, dark: false });
  usePage(o3.page);
  await studio(o3.page, dash.url);
  const re = await o3.page.evaluate((path) => { const p = window.__panel(); const r = p._state.compact.rooms.find((x) => x.path === path);
    return { dirty: p._isDirty(), v: r && r.variables }; }, b.path);
  await check('Studio load: the room without devices gets its area\'s lights (unsaved, one save fixes it)',
    re.dirty && !!re.v && Object.keys(re.v).some((k) => /^light_entity_\d+$/.test(k)) && re.v.casora_badges_auto === true, re);
} catch (e) {
  await check('Run without abort', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
