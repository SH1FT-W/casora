// @zustand: arbeit
// @deckt: dashboards/casora/button_card_templates.json#casora_mobile_filter_badges, custom_components/casora/phone_badges.py#home_badges, custom_components/casora/panel/casora-panel.js#_miniModel,PHONE_FILTERS, custom_components/casora/panel/casora-panel-addons.js#__casoraSceneMode
// #243: the Scenes badge on the phone's Home. The desktop's Home shows scenes as a badge (show_scenes). Expected:
// with the new switch off (default) the phone's Home badge row has no Scenes badge, as before; with "Also show on
// the phone" (show_scenes_phone) it has one, and a tap opens the scenes page (filter room_scenes). A phone room page
// never gets a Scenes badge. In the Studio the switch sits in the Scenes section (badge mode), flipping it is a
// draft (dashboard not saved, the miniphone's Home model has the badge) and discarding takes it back.
// Writes the desktop dashboard (test HA only) and restores it.
import { open, usePage, casoraDashboard, dashboard, stable, check, need, finish, atFinish, studio, studioRetry } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with a phone layout', dash && dash.phone);
const c0 = await ws();
const scenes = (await c0.cmd({ type: 'get_states' })).filter((s) => s.entity_id.startsWith('scene.') && !s.entity_id.startsWith('scene.casora'));
c0.close();
await need('at least one scene', scenes.length >= 1);

const d0 = JSON.parse(JSON.stringify(dash.config));
const homeIdx = Math.max(0, (d0.views || []).findIndex((v) => v.path === 'home'));
await need('overview room is the first view (Studio writes show_scenes there)', homeIdx === 0, homeIdx);
const save = async (cfg) => { const c = await ws(); await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); c.close(); };
const withHome = (vars) => {
  const d = JSON.parse(JSON.stringify(d0));
  const V = d.views[0].cards[0].variables = d.views[0].cards[0].variables || {};
  delete V.show_scenes_phone;
  Object.assign(V, vars);
  return d;
};
let restored = false;
atFinish(async () => { if (!restored) { restored = true; await save(d0); } });

// Visible Scenes badges in the phone's badge row.
// Only badges that are shown: not inside a faded-out wrapper (the Home row stays in the DOM at opacity 0 while a room
// page is open). The badge row scrolls sideways, so a badge may sit right of the screen and still count.
const sceneBadges = () => window.__pierce('button-card')
  .filter((x) => {
    if (![].concat((x._config || {}).template || []).includes('casora_badge_scene_group')) return false;
    const r = x.getBoundingClientRect();
    if (!(r.width > 0)) return false;
    for (let n = x; n; n = n.parentNode || n.host) {
      if (n.nodeType !== 1) continue;
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    }
    return true;
  })
  .length;
const phoneHome = async (want, label) => {
  const ph = await open({ width: 393, height: 852, mobile: true, dark: true });
  usePage(ph.page);
  await dashboard(ph.page, dash.phone.url + '/home', 3);
  await ph.page.evaluate(() => window.casoraPhoneRoom && window.casoraPhoneRoom.refresh && window.casoraPhoneRoom.refresh());
  await ph.page.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
  const n = await stable(ph.page, sceneBadges, null, { max: 12000, until: (v) => v === want });
  await check(label + ' (' + n + ')', n === want, n);
  return ph;
};

// 1) Switch off (default): as before.
await save(withHome({ show_scenes: true }));
const off = await phoneHome(0, 'switch off: no Scenes badge on the phone\'s Home');
await off.browser.close();

// 2) Switch on: badge in the row, a tap opens the scenes page; a room page stays without it.
await save(withHome({ show_scenes: true, show_scenes_phone: true }));
const on = await phoneHome(1, 'switch on: Scenes badge on the phone\'s Home');
const tapped = await on.page.evaluate(async () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_scene_group') && x.getBoundingClientRect().width > 0);
  const card = b && b.shadowRoot && b.shadowRoot.querySelector('ha-card');
  if (!card) return null;
  card.click();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const s = window._casoraFilter && window._casoraFilter.get();
    if (s === 'room_scenes') return s;
  }
  return window._casoraFilter && window._casoraFilter.get();
});
await check('tap opens the scenes page (room_scenes)', tapped === 'room_scenes', tapped);
const roomKey = await on.page.evaluate(() => {
  // Room key like the phone's filter (roomKeyOf): "room_" + name in lower case, only a-z0-9.
  const r = (window.casoraPhoneRoom && window.casoraPhoneRoom.rooms && window.casoraPhoneRoom.rooms()) || [];
  return r.length ? 'room_' + String(r[0].name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '') : null;
});
if (roomKey) {
  await on.page.evaluate((k) => window._casoraFilter.set(k), roomKey);
  const inRoom = await stable(on.page, sceneBadges, null, { max: 6000 });
  await check('phone room page: no Scenes badge (' + inRoom + ')', inRoom === 0, { roomKey, inRoom });
} else console.log('    no phone room known here – room check skipped');
await on.browser.close();

// 3) Studio: switch off again (saved state), flipping it is a draft.
await save(withHome({ show_scenes: true }));
const sp = await open({ width: 1440, height: 1000, dark: true });
usePage(sp.page);
await studio(sp.page, dash.url);
const st = await studioRetry(sp.page, dash.url, () => sp.page.evaluate(() => {
  const P = window.__panel();
  const card = P._csDashCard ? P._csDashCard('Scenes') : null;
  const row = card && card.querySelector('.casora-scenephone');
  const sw = row && row.querySelector('.sw');
  if (!sw) return { err: 'no switch', mode: P._scenesMode() };
  const before = sw.getAttribute('aria-checked');
  sw.click();
  const V = P._state.compact.rooms[0].variables;
  const dh = (((P._pair || {}).desktop || {}).compact || {}).rooms || [];
  const wideV = ((dh.find((r) => r.path === 'home') || dh[0] || {}).variables) || {};
  const model = P._miniModel({ variables: wideV }, { phone: true, place: 'home' }).map((b) => b.id);
  return { mode: P._scenesMode(), label: row.querySelector('label').textContent, before, after: sw.getAttribute('aria-checked'),
    stored: V.show_scenes_phone, dirty: !!(P._isDirty && P._isDirty()), phoneHasScenes: model.includes('scenes') };
})).catch((e) => ({ err: String(e) }));
console.log('    studio', JSON.stringify(st));
await check('Studio: switch in the Scenes section, off by default', st && st.mode === 'badge' && st.before === 'false', st);
await check('Studio: on → stored on Home as a draft (unsaved)', st && st.after === 'true' && st.stored === true && st.dirty, st);
await check('Studio: miniphone Home has the Scenes badge', st && st.phoneHasScenes === true, st);
const c1 = await ws();
const live = await c1.cmd({ type: 'lovelace/config', url_path: dash.url });
c1.close();
await check('nothing saved before "Save settings"', live.views[0].cards[0].variables.show_scenes_phone === undefined,
  live.views[0].cards[0].variables.show_scenes_phone);
const back = await sp.page.evaluate(async () => {
  const P = window.__panel();
  if (P._csDiscardAll) await P._csDiscardAll(); else { P._discardDraft(); await P._load(); }
  return P._state.compact.rooms[0].variables.show_scenes_phone;
}).catch((e) => String(e));
await check('discard takes the switch back', back === undefined, back);

restored = true;
await save(d0);
await finish();
