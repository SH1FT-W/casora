// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/32-media-badge.js tools/phone_room_badges.py
// Issue #64: the Home media badge said "1 läuft" (a TV that was only on, three speakers idle), but tapping it opened
// nothing – the tap expanded a row of player pills that only showed players with a title. Now the tap always opens
// the popup casora_popup_media with every configured player, and "läuft" counts exactly its "Läuft" list.
// Reported on an iPad (Safari, 1180×674) with an LG webOS TV (state "on", no media_title, source list).
// Steps: Home of the desktop and phone dashboard get four players of the house (three speakers, one TV); their states
// are faked in the browser only (nothing is switched). TV on without a title → badge "1 läuft", tap opens the popup:
// "Läuft" with the TV ("An"), the speakers below with Bereit/Standby/Aus. A speaker starts playing while the popup is
// open → it moves to the top with "Pausieren", the badge says "2 laufen". Nothing plays → the badge hides by the same
// rule. Phone home: the same badge opens the same popup.
// Writes both dashboards (test HA only) and restores them. Pictures: CASORA_M64_BILDER=<folder>.
import fs from 'node:fs';
import { open, casoraDashboard, dashboard, stable, check, need, finish, usePage, atFinish, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_M64_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

// ── Players of the house: three speakers and a TV ──
const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const mp = S.filter((s) => s.entity_id.startsWith('media_player.')).sort((a, b) => a.entity_id.localeCompare(b.entity_id));
const isTv = (s) => /\btv\b|_tv|tv_|qled|oled|samsung|fernseher|bravia/i.test(s.entity_id + ' ' + (s.attributes.friendly_name || ''))
  && !/apple/i.test(s.entity_id);
const tv = mp.find(isTv);
const speakers = mp.filter((s) => s !== tv && !/apple|playstation|test/i.test(s.entity_id)).slice(0, 3);
await need('a TV and three speakers in the house', tv && speakers.length === 3, mp.map((s) => s.entity_id));
const IDS = [speakers[0].entity_id, speakers[1].entity_id, tv.entity_id, speakers[2].entity_id];
const NAME = { tv: 'QA Fernseher', a: 'QA Echo Küche', b: 'QA Echo Bad', c: 'QA Echo Schlafzimmer' };

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const d0 = await c.cmd({ type: 'lovelace/config', url_path: dash.url });
const m0 = await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url });
let restored = false;
atFinish(async () => {
  if (restored) return;
  restored = true;
  const c2 = await ws();
  await c2.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: d0 });
  await c2.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config: m0 });
  c2.close();
});

// Home: exactly these four players, media badge on, no now-playing card instead of it.
const setPlayers = (v) => {
  for (let i = 1; i <= 10; i++) { delete v['media_player_' + i]; delete v['show_media_player_' + i]; delete v['media_entity_' + i]; }
  IDS.forEach((id, i) => { v['media_player_' + (i + 1)] = id; });
  v.show_media = true;
  v.show_now_playing = false;
};
const d1 = JSON.parse(JSON.stringify(d0));
const home = (d1.views || []).find((v) => v.path === 'home') || d1.views[0];
const room = (home.cards || []).find((x) => [].concat(x.template || []).includes('casora_room'));
await need('desktop Home has a casora_room card', room);
room.variables = room.variables || {};
setPlayers(room.variables);
await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: d1 });
const m1 = JSON.parse(JSON.stringify(m0));
let fb = null;
const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if ([].concat(o.template || []).includes('casora_mobile_filter_badges')) fb = o; Object.values(o).forEach(walk); } };
walk(m1.views || []);
await need('phone Home has its badge row', fb);
fb.variables = fb.variables || {};
setPlayers(fb.variables);
await c.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config: m1 });
c.close();

const now = new Date().toISOString();
const STATE = {
  // LG webOS (integration webostv) as reported in #64: "on", a source list, no media_title.
  tvOn: { [tv.entity_id]: { state: 'on', attributes: { friendly_name: NAME.tv, media_title: '', media_artist: '', source: 'HDMI 1',
    source_list: ['HDMI 1', 'Live TV', 'Netflix'], sound_output: 'tv_speaker', device_class: 'tv', supported_features: 24509 }, last_changed: now },
    [IDS[0]]: { state: 'idle', attributes: { friendly_name: NAME.a, media_title: 'Altes Lied', media_artist: '' }, last_changed: now },
    [IDS[1]]: { state: 'standby', attributes: { friendly_name: NAME.b, media_title: '', media_artist: '' }, last_changed: now },
    [IDS[3]]: { state: 'off', attributes: { friendly_name: NAME.c, media_title: '', media_artist: '' }, last_changed: now } },
};
STATE.playing = { [IDS[1]]: { state: 'playing', attributes: { friendly_name: NAME.b, media_title: 'QA Lied', media_artist: 'QA Band', supported_features: 21437 }, last_changed: now } };
STATE.nothing = { [tv.entity_id]: { state: 'off', attributes: { friendly_name: NAME.tv, source: '' }, last_changed: now },
  [IDS[1]]: { state: 'idle', attributes: { friendly_name: NAME.b, media_title: '', media_artist: '' }, last_changed: now } };

// ── Browser helpers ──
const badge = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_media_group')
    && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  const t = ((b.shadowRoot && b.shadowRoot.querySelector('.badge-sub')) || {}).textContent || '';
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, sub: t.replace(/\s+/g, ' ').trim() };
};
const POPUP = () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const vis = (n) => n.getBoundingClientRect().height > 0;
  const pop = window.__pierce('casora-popup')[0];
  const title = pop && pop.shadowRoot ? (pop.shadowRoot.querySelector('.header-title') || {}).textContent || '' : '';
  const rows = window.__pierce('.hui-row', s).filter(vis).map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  const text = window.__pierce('.hui-plate, .hui-line, [class*="lbl"]', s).filter(vis).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
  const labels = window.__pierce('*', s).filter((n) => vis(n) && !n.children.length).map((n) => n.textContent.trim()).filter(Boolean);
  return { title: title.replace(/\s+/g, ' ').trim(), rows, text, labels };
};
const offen = (page) => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
const tapBadge = async (page, mobile) => {
  for (let t = 0; t < 4 && !(await offen(page)); t++) {
    const p = await page.evaluate(badge);
    if (!p) break;
    if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    for (let w = 0; w < 20 && !(await offen(page)); w++) await page.waitForTimeout(250);
  }
  return offen(page);
};
const idx = (rows, name) => rows.findIndex((r) => r.includes(name));
const shoot = async (page, file) => { if (BILDER) { await page.waitForTimeout(700); await page.screenshot({ path: BILDER + '/' + file }); } };

const run = async (tag, page, mobile, pre) => {
  await fakeStates(page, STATE.tvOn, { sticky: true });
  const b0 = await stable(page, badge, null, { max: 12000, until: (v) => v && v.sub === '1 läuft' });
  await check(tag + ': badge „1 läuft“ (TV on, speakers idle/standby/off)', b0 && b0.sub === '1 läuft', b0);
  await shoot(page, pre + '-1-badge.png');
  await need(tag + ': tap on the badge opens the media popup', await tapBadge(page, mobile));
  let p = await stable(page, POPUP, null, { max: 10000, until: (v) => v && v.rows.length >= 4 });
  await check(tag + ': title „Medien“', p && /^Medien/.test(p.title), p && p.title);
  await check(tag + ': all four players listed', p && [NAME.tv, NAME.a, NAME.b, NAME.c].every((n) => idx(p.rows, n) > -1), p && p.rows);
  await check(tag + ': „Läuft“ = the TV with „An“, first', p && idx(p.rows, NAME.tv) === 0 && /An$/.test(p.rows[0]) && p.labels.includes('Läuft'), p && { rows: p.rows, labels: p.labels });
  await check(tag + ': the rest with their state (Bereit, Standby, Aus)', p && /Bereit/.test(p.rows[idx(p.rows, NAME.a)] || '')
    && /Standby/.test(p.rows[idx(p.rows, NAME.b)] || '') && /Aus/.test(p.rows[idx(p.rows, NAME.c)] || ''), p && p.rows);
  await check(tag + ': hero says „1 läuft“ like the badge', p && /1 läuft/.test(p.text), p && p.text);
  await shoot(page, pre + '-2-popup-tv-on.png');
  // A speaker starts while the popup is open: it moves to the top, with play/pause.
  await fakeStates(page, STATE.playing, { sticky: true });
  p = await stable(page, POPUP, null, { max: 10000, until: (v) => v && idx(v.rows, NAME.b) === 0 });
  await check(tag + ': playing speaker listed first, live', p && idx(p.rows, NAME.b) === 0 && idx(p.rows, NAME.tv) === 1, p && p.rows);
  await check(tag + ': playing row shows title and „Pausieren“', p && /QA Lied – QA Band/.test(p.rows[0]) && /Pausieren/.test(p.rows[0]), p && p.rows[0]);
  await check(tag + ': hero „2 laufen“', p && /2 laufen/.test(p.text), p && p.text);
  await shoot(page, pre + '-3-popup-playing.png');
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
  await page.waitForTimeout(900);
  const b1 = await stable(page, badge, null, { max: 15000, until: (v) => v && v.sub === '2 laufen' });
  const dbg = await page.evaluate((id) => { const h = document.querySelector('home-assistant').hass; return h.states[id] && h.states[id].state; }, IDS[1]);
  await check(tag + ': badge „2 laufen“ = the popup\'s „Läuft“ list', b1 && b1.sub === '2 laufen', { b1, dbg });
  // Nothing plays: the badge hides itself by the same rule (no "läuft" left that the popup would not show).
  await fakeStates(page, STATE.nothing, { sticky: true });
  const b2 = await stable(page, badge, null, { max: 8000, until: (v) => v === null });
  await check(tag + ': nothing plays → badge hidden (same rule as the count)', b2 === null, b2);
  await shoot(page, pre + '-4-nothing.png');
};

const dk = await open({ width: 1440, height: 1000, theme: 'Casora' });
usePage(dk.page);
await dashboard(dk.page, dash.url + '/home', 3);
await run('Desktop', dk.page, false, 'desktop');
await dk.browser.close();

// Tablet as reported: Safari (WebKit) 1180×674 with touch, iPadOS's desktop user agent, light.
const tb = await open({ width: 1180, height: 674, safari: true, touch: true, dark: false, theme: 'Casora',
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' });
usePage(tb.page);
await dashboard(tb.page, dash.url + '/home', 3);
await run('Tablet Safari', tb.page, true, 'tablet');
await tb.browser.close();

const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
usePage(ph.page);
await dashboard(ph.page, dash.phone.url + '/home', 2);
await ph.page.evaluate(() => window._casoraFilter && window._casoraFilter.set && window._casoraFilter.set('all'));
await run('Phone', ph.page, true, 'phone');

await finish();
