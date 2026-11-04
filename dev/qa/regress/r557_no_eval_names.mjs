// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js#casoraNoEval,_casoraNPRef,_casoraNPRec custom_components/casora/scripts/local/01-basis.js#openViaCard,casoraPopupTitle custom_components/casora/scripts/local/09-weich-wiedergabe.js#open custom_components/casora/scripts/local/05-weich-mehr.js#own tools/noeval-check.mjs
// HACS review 5, point 2: button-card runs every config string shaped "[[[ … ]]]" as JavaScript. A media title
// (anyone who casts sets it), a friendly_name or a scene name of that shape ran in the viewer's session: the
// now-playing cards carried the media record in their variables, the hidden card that opens a popup (bell, light
// group row) carried the friendly_name as its name, the light group popup the lamp names in its nested tiles.
// Here a light, a scene and the light's area are named "[[[ window.__pwned = 1 ]]]" (test HA only, restored at the
// end) and every media player plays a title, artist and app of that shape (this browser only). Expected on the
// desktop room page, the light popup, a single lamp opened from it, a popup opened through the hidden card, Home with
// now playing, the phone's now-playing row and its tap, and the phone's scene menu: window.__pwned never set, no page
// error.
import { open, usePage, casoraDashboard, dashboard, cards, check, need, finish, atFinish, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const PWN = '[[[ window.__pwned = 1 ]]]';
const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard', dash);
const c = await ws();
const reg = await c.cmd({ type: 'config/entity_registry/list' });
const areas = await c.cmd({ type: 'config/area_registry/list' });
const statesNow = await c.cmd({ type: 'get_states' });
c.close();
const regOf = (id) => reg.find((e) => e.entity_id === id);

// A room view with a light badge; its first light (a lamp, not a group) and its area, a scene of the house.
const view = dash.config.views.slice(1).find((v) => { const x = ((v.cards || [])[0] || {}).variables || {}; return x.light_entity_1 && regOf(x.light_entity_1); });
await need('Room with a light badge', view);
const light = view.cards[0].variables.light_entity_1;
const lamp = (() => {
  const st = statesNow.find((s) => s.entity_id === light);
  const members = (st && st.attributes && st.attributes.entity_id) || [];
  return members.find((m) => regOf(m)) || light;
})();
const area = (regOf(lamp) || regOf(light) || {}).area_id || (areas[0] || {}).area_id;
const scene = (statesNow.find((s) => s.entity_id.startsWith('scene.') && regOf(s.entity_id)) || {}).entity_id;
const renames = [[lamp, PWN], [scene, PWN]].filter(([id]) => id && regOf(id));
await need('Entities to rename', renames.length >= 1, renames);
const old = { names: renames.map(([id]) => [id, regOf(id).name]), area: areas.find((a) => a.area_id === area) };
let restored = false;
atFinish(async () => {
  if (restored) return;
  restored = true;
  const k = await ws();
  for (const [id, name] of old.names) await k.cmd({ type: 'config/entity_registry/update', entity_id: id, name: name || null }).catch(() => {});
  if (old.area) await k.cmd({ type: 'config/area_registry/update', area_id: old.area.area_id, name: old.area.name }).catch(() => {});
  k.close();
});
{
  const k = await ws();
  for (const [id, name] of renames) await k.cmd({ type: 'config/entity_registry/update', entity_id: id, name });
  if (old.area) await k.cmd({ type: 'config/area_registry/update', area_id: old.area.area_id, name: PWN });
  const after = await k.cmd({ type: 'get_states' });
  k.close();
  const fn = (after.find((s) => s.entity_id === lamp) || {}).attributes || {};
  await need('The lamp is named like a template', fn.friendly_name === PWN, fn.friendly_name);
}
// Every media player plays a hostile title (browser only).
const patch = {};
for (const s of statesNow.filter((x) => x.entity_id.startsWith('media_player.'))) {
  patch[s.entity_id] = { state: 'playing', attributes: { media_title: PWN, media_artist: PWN, app_name: PWN, source: PWN,
    media_duration: 240, media_position: 30, media_position_updated_at: new Date().toISOString(), supported_features: 152463 } };
}
await need('Media players to play a title', Object.keys(patch).length >= 1);

// Read and clear: every check below says whether something ran since the last one.
const pwned = (pg) => pg.evaluate(() => { const p = window.__pwned === 1; window.__pwned = 0; return p; });
const errors = [];
const watchErrors = (pg) => {
  pg.on('pageerror', (e) => errors.push(String(e && e.message || e)));
};
const popupOpen = (pg) => pg.evaluate(() => window.__pierce('casora-popup').some((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0; }));
const closePopup = async (pg) => { await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await pg.waitForTimeout(700); };
const tap = (pg, i) => pg.evaluate((n) => {
  const b = window.__pierce('button-card')[n];
  const card = b && b.shadowRoot && b.shadowRoot.querySelector('ha-card');
  if (card) card.click();
}, i);

// ── Desktop ───────────────────────────────────────────────────────────────────
const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
watchErrors(page);
await dashboard(page, dash.url + '/' + view.path, 2);
await fakeStates(page, patch, { sticky: true });
await page.waitForTimeout(1500);
await check('Room page: nothing ran', !(await pwned(page)));
// Light popup from the room's light badge or tile.
const lc = (await cards(page, 'casora_badge_light'))[0] || (await cards(page, 'casora_light'))[0];
await check('Light card on the room page', !!lc);
if (lc) {
  await tap(page, lc.i);
  await page.waitForTimeout(2000);
  await check('Light popup open', await popupOpen(page));
  await check('Light popup: nothing ran', !(await pwned(page)));
  // A lamp row of the group popup: opens the lamp through the hidden card (01-basis.js openViaCard).
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_light_more_info: id } })), lamp);
  await page.waitForTimeout(2500);
  await check('Lamp popup open', await popupOpen(page));
  await check('Lamp popup: nothing ran', !(await pwned(page)));
  await closePopup(page);
}
// The bell's way: a popup opened through a hidden card built for the entity (no tile on this page).
const mp = Object.keys(patch)[0];
const viaCard = await page.evaluate((id) => new Promise((res) => {
  if (!window._casoraNotifyOpenViaCard) return res('none');
  window._casoraNotifyOpenViaCard(id, (ok) => res(ok ? 'ok' : 'fallback'), null, true);
  setTimeout(() => res('timeout'), 6000);
}), mp);
await page.waitForTimeout(1500);
await check('Popup through the hidden card', viaCard === 'ok' || viaCard === 'fallback', viaCard);
await check('Hidden card popup: nothing ran', !(await pwned(page)));
await closePopup(page);
// Home with now playing.
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || 'home'), 2);
await fakeStates(page, patch, { sticky: true });
await page.waitForTimeout(2500);
const np = await page.evaluate(() => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_now_playing_primary')).length);
await check('Home: now playing cards drawn', np > 0, np);
await check('Home with now playing: nothing ran', !(await pwned(page)));
const npc = (await cards(page, 'casora_now_playing_primary'))[0];
if (npc) {
  await tap(page, npc.i);
  await page.waitForTimeout(2000);
  await check('Desktop now playing popup open', await popupOpen(page));
  await check('Desktop now playing popup: nothing ran', !(await pwned(page)));
  await closePopup(page);
}

// ── Phone ─────────────────────────────────────────────────────────────────────
const ph = await open({ width: 393, height: 852, mobile: true, dark: true });
usePage(ph.page);
watchErrors(ph.page);
if (dash.phone) {
  await dashboard(ph.page, dash.phone.url + '/home', 2);
  await fakeStates(ph.page, patch, { sticky: true });
  await ph.page.waitForTimeout(2500);
  await check('Phone home: nothing ran', !(await pwned(ph.page)));
  // Tap on a now-playing row (09-weich-wiedergabe.js open): builds a casora_now_playing_primary card for the tap.
  const tapped = await ph.page.evaluate(() => {
    const M = window._casoraNPSoft;
    const e = M && M._entries && M._entries().find((x) => x.kind === 'phone' && (x.list || []).length);
    if (!e || !M._open) return false;
    M._open(e, e.list[0].key);
    return true;
  });
  await check('Phone: now-playing row to tap', tapped);
  await ph.page.waitForTimeout(2500);
  await check('Phone now playing popup open', await popupOpen(ph.page));
  await check('Phone now playing tap: nothing ran', !(await pwned(ph.page)));
  await closePopup(ph.page);
  // Scene menu of the phone navigation.
  await ph.page.evaluate(() => { const n = window.__pierce('casora-mobile-nav')[0]; if (n && n._openMenu) try { n._openMenu('scenes'); } catch (e) { /* other menu API */ } });
  await ph.page.waitForTimeout(1500);
  await check('Phone scene menu: nothing ran', !(await pwned(ph.page)));
} else {
  await need('Phone dashboard', false);
}
usePage(page);

await check('No page error', errors.length === 0, errors.slice(0, 5));
await finish();
