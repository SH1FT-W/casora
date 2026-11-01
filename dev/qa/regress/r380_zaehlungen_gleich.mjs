// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js
// Review 2 (01.11.2026), group „counts & logic“: Home's light badge said „3 An“ (lamps), the light tile „2 An“ (rooms), the
// popup „2 von 10 Räumen an“; the Klima badge's „Jalousien“ counted every cover (7), the blinds tile and popup 6.
// Now badge, tile and popup count from one source (window.casoraLightTally / casoraClimateBlinds): rooms with the word,
// the blinds of the tile. Owner (01.11.2026): light counts lamps everywhere, never rooms – a room page's light badge
// and tile said „2 Räume an“ (the room's group held sub-groups). Desktop, Home and a room of qa-arbeit (or CASORA_QA_DASH).
import { open, ready, check, need, finish } from './lib.mjs';

const DASH = process.env.CASORA_QA_DASH || 'qa-arbeit';
const { page } = await open({ width: 1440, height: 900, dark: false });
await ready(page, '/' + DASH + '/home', () => window.__pierce && window.__pierce('button-card').length > 3);
await page.waitForTimeout(4000);

const read = () => page.evaluate(() => {
  const cards = window.__pierce('button-card').filter((x) => x.getBoundingClientRect().width > 0);
  const tpl = (x) => [].concat((x._config || {}).template || []);
  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  const badge = cards.find((x) => tpl(x).includes('casora_badge_light_group'));
  const tile = cards.find((x) => tpl(x).includes('casora_light') && /^light\./.test((x._config || {}).entity || ''));
  const h = document.querySelector('home-assistant').hass;
  const tally = (el) => el && window.casoraLightTally(el._stateObj || null, h.states, h, el._evaledVariables
    ? Object.fromEntries(Object.entries(el._evaledVariables).map(([k, v]) => [k, v && typeof v === 'object' && 'value' in v ? v.value : v])) : el._config.variables || {});
  const blinds = window.casoraClimateBlinds ? window.casoraClimateBlinds(h, h.user, true, true) : null;
  const bt = window.casoraBlindsTile ? window.casoraBlindsTile() : null;
  const tileBlinds = bt && window._casoraSecCovers ? window._casoraSecCovers.singles(h.states, (bt.variables || {}).covers && bt.variables.covers.length > 1 ? bt.variables.covers : [bt.entity]) : null;
  return {
    badge: badge ? txt(badge.shadowRoot.querySelector('.badge-sub')) : null, badgeT: tally(badge),
    tile: tile ? txt(tile.shadowRoot.querySelector('#state .sf-f')) || txt(tile.shadowRoot.querySelector('#state')) : null, tileT: tally(tile),
    blinds: blinds && blinds.slice().sort(), tileBlinds: tileBlinds && tileBlinds.slice().sort(),
  };
});
const r = await read();
await need('Home: light badge and tile found', r.badge && r.tile, r);
const word = (s) => /^(\d+ an|Alle an|Alle aus|An|Aus)$/.test(s);
await check('light badge: lamps („n An“), never rooms', word(r.badge), r.badge);
await check('light tile: lamps („n An“), never rooms', word(r.tile), r.tile);
await check('badge and tile count lamps', r.badgeT && r.tileT && r.badgeT.kind === 'lamps' && r.tileT.kind === 'lamps', r);
if (r.badgeT && r.tileT && r.badgeT.tot === r.tileT.tot) await check('same set: same number', r.badge === r.tile, r);
if (r.tileBlinds) await check('Klima „Jalousien“: the blinds tile\'s blinds', JSON.stringify(r.blinds) === JSON.stringify(r.tileBlinds), r);

// A room page: its header's light badge and its light tile count the room's lamps.
const views = await page.evaluate(async (d) => (await document.querySelector('home-assistant').hass.callWS({ type: 'lovelace/config', url_path: d })).views
  .map((v, i) => ({ path: v.path || String(i), light: /casora_light\b/.test(JSON.stringify(v)) })), DASH);
let roomDone = false;
for (const v of views.slice(1).filter((x) => x.light)) {
  await ready(page, '/' + DASH + '/' + v.path, () => window.__pierce && window.__pierce('button-card').length > 3);
  await page.waitForTimeout(3000);
  const q = await read();
  if (!q.badge || !q.tile) continue;
  await check('room „' + v.path + '“: light badge counts lamps', word(q.badge) && q.badgeT && q.badgeT.kind === 'lamps', q);
  await check('room „' + v.path + '“: light tile counts lamps', word(q.tile) && q.tileT && q.tileT.kind === 'lamps', q);
  roomDone = true;
  break;
}
await check('a room with a light badge and tile found', roomDone);
await finish();
