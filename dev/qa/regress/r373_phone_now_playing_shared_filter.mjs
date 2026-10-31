// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/09-weich-wiedergabe.js custom_components/casora/scripts/local/10-weich-welle.js
// Reported (issue #101, Android phone): "Aktuelle Wiedergabe" showed while a player was playing, but no player
// below it; the desktop was fine. The phone filter is kept per device (window._casoraFilter) and only rewritten
// into the hass the cards get; the Casora list read the house-wide helper input_select.casora_mobile_filter from
// HA's own hass. Once another phone or tablet had picked a filter (the helper on "lights", say), the list stayed
// empty while the heading (from the card's own, rewritten hass) said something was playing. Expected: with the
// helper changed by another device after this page loaded and this device on "all", the heading and the playing
// title both show; the heading never shows alone. Picture: CASORA_R372_BILD=<file.png>.
import { open, casoraDashboard, dashboard, fakeStates, stable, check, need, finish, atFinish, call } from './lib.mjs';
import { tokens } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const { access_token } = await tokens();
const HELPER = 'input_select.casora_mobile_filter';
atFinish(async () => { await call((await tokens()).access_token, 'input_select', 'select_option', { entity_id: HELPER, option: 'all' }); });

const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: true });
await dashboard(page, dash.phone.url);
// Another phone or tablet picks a filter while this page is open (it writes the shared helper).
await need('shared filter helper set to "lights" by "another device"',
  (await call(access_token, 'input_select', 'select_option', { entity_id: HELPER, option: 'lights' })) === 200);
await page.waitForTimeout(1500);
const mp = await page.evaluate(() => {
  const el = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_now_playing'));
  const v = (el && el._config && el._config.variables) || {};
  return v.media_player_1 || null;
});
await need('phone now-playing card with a player', mp, mp);
await fakeStates(page, { [mp]: { state: 'playing', attributes: { media_title: 'Testlied 101', media_artist: 'Band', supported_features: 152463 } } }, { sticky: true });

const seen = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.height > 0 && r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
  const txt = (re) => window.__pierce('*').filter((e) => {
    let o = ''; for (const c of e.childNodes) if (c.nodeType === 3) o += c.textContent;
    return re.test(o.trim()) && vis(e) && +getComputedStyle(e).opacity !== 0;
  }).length > 0;
  const card = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_now_playing'));
  const cs = card && getComputedStyle(card);
  return { heading: txt(/^Aktuelle Wiedergabe$/) && !!cs && +cs.opacity > 0.5, title: txt(/^Testlied 101$/),
    deviceFilter: window._casoraFilter ? window._casoraFilter.get() : null };
};
const m = await stable(page, seen, null, { max: 8000, until: (v) => v && v.title });
await check('this device shows everything (per-device filter "all")', m.deviceFilter === 'all', m);
await check('heading „Aktuelle Wiedergabe“ shows', m.heading, m);
await check('the playing title shows under the heading', m.title, m);
if (process.env.CASORA_R372_BILD) await page.screenshot({ path: process.env.CASORA_R372_BILD });
await finish();
