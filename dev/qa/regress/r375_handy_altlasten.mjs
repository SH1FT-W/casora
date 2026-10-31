// @zustand: arbeit
// Reported (31.10.2026): "we load a lot we no longer need … an old media player in the background … at the top of the
// phone view sometimes a menu we no longer have".
//  1. Ghost menu: the header capsule (bell, assist, ⋯) stood top right while the modules loaded, until the bottom bar
//     (casora-mobile-nav) docked it. Expected (Casora design): never visible at the top, visible in the bottom bar.
//  2. Old media player: casora_mobile_now_playing drew its former carousel (9 slots, ~85 hidden button-cards that
//     re-rendered on every state change) under the Casora list. Expected: none of those cards exist, and a tap on a
//     row of the list still opens the media popup.
// Phone, WebKit 393 × 852.
import { open, casoraDashboards, check, need, finish, PIERCE, fakeStates } from './lib.mjs';

const all = await casoraDashboards();
const pair = all.find((d) => !d.mobile && all.some((p) => p.url === d.url + '-mobile'));
await need('Casora dashboard with a phone layout', pair);
const ph = all.find((p) => p.url === pair.url + '-mobile');
const { page, context } = await open({ width: 393, height: 852, mobile: true, safari: true });
await context.addInitScript(PIERCE);
// From the first script on: note every moment the capsule is visible in the top 120 px.
await context.addInitScript(() => {
  window.__qaTop = [];
  const t0 = performance.now();
  const iv = setInterval(() => {
    if (performance.now() - t0 > 20000) { clearInterval(iv); return; }
    try {
      window.__pierce('button-card').forEach((b) => {
        if (![].concat((b._config || {}).template || []).includes('casora_mobile_chrome')) return;
        const r = b.getBoundingClientRect();
        const card = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
        const vis = card ? getComputedStyle(card).visibility : 'hidden';
        if (r.width > 0 && r.height > 0 && r.top < 120 && vis !== 'hidden') window.__qaTop.push(Math.round(performance.now() - t0));
      });
    } catch (e) { /* page still building */ }
  }, 30);
});
await page.goto(process.env.CASORA_URL.replace(/\/$/, '') + '/' + ph.url + '/' + (ph.config.views[0].path || '0'));
await page.waitForFunction(() => !!window._casoraLocalLoaded, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(4000);

const soft = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--casora-popup-layout').trim() === 'soft');
await need('Casora design active (soft layout)', soft);

// 1. Ghost menu
const top = await page.evaluate(() => window.__qaTop);
await check('Capsule never visible at the top while loading', top.length === 0, top.slice(0, 5));
const docked = await page.evaluate(() => {
  const b = window.__pierce('.hmn-dock button-card')[0];
  const card = b && b.shadowRoot && b.shadowRoot.querySelector('ha-card');
  const r = card && card.getBoundingClientRect();
  return card ? { vis: getComputedStyle(card).visibility, y: Math.round(r.y), h: Math.round(r.height) } : null;
});
await check('Capsule docked and visible in the bottom bar', docked && docked.vis === 'visible' && docked.y > 600 && docked.h > 0, docked);

// 2. Old media player
const old = await page.evaluate(() => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || [])
  .some((t) => /^casora_now_playing_(primary|controls|button)$/.test(t))).length);
await check('No hidden carousel cards of the former phone player', old === 0, old);

// A player that plays, so the Casora list has a row to tap.
const np = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_mobile_now_playing'));
  const v = (b && b._config && b._config.variables) || {};
  const id = Object.keys(v).filter((k) => /^media_player_\d+$/.test(k)).map((k) => v[k]).find((x) => typeof x === 'string' && x.startsWith('media_player.'));
  const any = id || Object.keys(document.querySelector('home-assistant').hass.states).find((k) => k.startsWith('media_player.'));
  return { card: !!b, id: any };
});
await need('Phone now-playing card and a media player', np.card && np.id, np);
await fakeStates(page, { [np.id]: { state: 'playing', attributes: { media_title: 'QA Song', media_artist: 'QA Artist', media_duration: 200, media_position: 20,
  media_position_updated_at: new Date().toISOString(), supported_features: 152463 } } }, { sticky: true });
await page.waitForTimeout(1500);
const row = await page.evaluate(() => {
  const host = window.__pierce('.cnp-host').find((h) => h.shadowRoot && h.shadowRoot.querySelector('.r'));
  const r = host && host.shadowRoot.querySelector('.r');
  if (!r) return null;
  r.scrollIntoView({ block: 'center' });
  const b = r.getBoundingClientRect();
  return { x: b.x + 40, y: b.y + b.height / 2 };
});
await need('A row in the Casora list', row, row);
await page.mouse.click(row.x, row.y);
const opened = await page.waitForFunction(() => window.__pierce('casora-popup').some((p) => p.hasAttribute('open')), null, { timeout: 8000 })
  .then(() => true, () => false);
// The media popup of that player (its title), not a device page.
if (opened) await page.waitForTimeout(1500);
const txt = opened ? await page.evaluate(() => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const out = [];
  (function walk(r) { r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot);
    if (!e.children.length && e.textContent && !/^(STYLE|SCRIPT)$/.test(e.tagName)) out.push(e.textContent.trim()); }); })(p.shadowRoot || p);
  return out.join(' ');
}) : '';
await check('Tap on the row opens the media popup', opened && /QA Song/.test(txt), txt.slice(0, 160));
await finish();
