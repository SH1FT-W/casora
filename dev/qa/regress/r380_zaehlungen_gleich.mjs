// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js
// Review 2 (01.11.2026), group „counts & logic“: Home's light badge said „3 An“ (lamps), the light tile „2 An“ (rooms), the
// popup „2 von 10 Räumen an“; the Klima badge's „Jalousien“ counted every cover (7), the blinds tile and popup 6.
// Now badge, tile and popup count from one source (window.casoraLightTally / casoraClimateBlinds): rooms with the word,
// the blinds of the tile. Desktop, Home of qa-arbeit (or CASORA_QA_DASH).
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
const word = (s) => /^(\d+ Räume an|1 Raum an|\d+ An|Alle An|Alle aus|An|Aus)$/.test(s);
await check('light badge: a count with its unit', word(r.badge), r.badge);
await check('light tile: a count with its unit', word(r.tile), r.tile);
await check('badge and tile count the same kind (rooms for the house)', r.badgeT && r.tileT && r.badgeT.kind === r.tileT.kind, r);
if (r.badgeT && r.tileT && r.badgeT.tot === r.tileT.tot) await check('same set: same number', r.badge === r.tile, r);
if (r.tileBlinds) await check('Klima „Jalousien“: the blinds tile\'s blinds', JSON.stringify(r.blinds) === JSON.stringify(r.tileBlinds), r);

// Switching a lamp: badge and tile follow at once and stay equal in kind.
await finish();
