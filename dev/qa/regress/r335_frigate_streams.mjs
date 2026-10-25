// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/23-frigate.js dev/casora_mock/frigate.py custom_components/casora/panel/casora-panel-types.js
// Frigate streams (#61) at the made-up Frigate camera camera.testhof (dev/casora_mock/frigate.py: go2rtc has
// testhof + testhof_sub, MSE over the integration's websocket proxy):
//   1. Desktop popup: switch "Standard · Unterstream" below the picture; Standard without stream function = the
//      still as before, with stream function (3b) HA's ha-camera-stream.
//   2. "Unterstream" → <casora-frigate-stream> plays testhof_sub over …/mse/api/ws (MSE, 320 px wide picture).
//   3. Closed and reopened: the pick holds (session); back to Standard.
//   4. Studio field "Stream in the popup (default)" = the main stream picks it on opening (without session).
//   5. Phone (393 px): tile with "Live on the tile" plays the sub stream, the popup starts with it.
//   6. Stream that does not answer: note "Stream nicht erreichbar · Standard", Standard plays.
//   7. Integration without the go2rtc proxy: no switch, the picture card as before.
// CASORA_SHOT_DIR=<dir> also saves screenshots there. The tiles exist only in the browser (not saved).
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboard, dashboard, check, need, finish, stable, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const ID = 'camera.testhof';
const SHOTS = process.env.CASORA_SHOT_DIR || '';
const tok = await tokens();
const svc = (name, data) => fetch(BASE + '/api/services/casora_mock/' + name,
  { method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) });
await svc('frigate_proxy', { notifications: true, vod: true, reviews: true, stream: false, clips: true, streams: true, zuruecksetzen: true });
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);

const addTile = (page, cls, vars, left, top) => page.evaluate(async ([id, cls, vars, left, top]) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_frigate', entity: id, name: 'Hofkamera', variables: vars });
  el.classList.add(cls);
  el.hass = ha.hass;
  el.style.cssText = 'position:fixed;left:' + left + 'px;top:' + top + 'px;width:290px;height:200px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  el._qaT = setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
}, [ID, cls, vars || {}, left, top]);
const dropTile = (page, cls) => page.evaluate((c) => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.' + c);
  if (el) { clearInterval(el._qaT); el.remove(); }
}, cls);
const tileAt = (page, cls) => page.evaluate((c) => {
  const r = document.querySelector('home-assistant').shadowRoot.querySelector('.' + c).getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, cls);
const liveInfo = (page) => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!pop) return null;
  const el = window.__pierce('casora-frigate-live', pop.shadowRoot)[0];
  if (!el || !el.shadowRoot) return { card: false, pic: window.__pierce('hui-picture-entity-card', pop.shadowRoot).length };
  const r = el.shadowRoot;
  const segs = [...r.querySelectorAll('.hui-sg')].map((s) => ({ t: s.textContent.trim(), on: s.classList.contains('on'), v: s.getAttribute('data-stream') }));
  const p = el._player;
  const v = p && p.tagName === 'CASORA-FRIGATE-STREAM' ? p.querySelector('video') : null;
  const ov = r.querySelector('.ov');
  return { card: true, segs, tag: p ? p.tagName.toLowerCase() : null, src: el._src, way: p && p.way, ready: v ? v.readyState : null,
    w: v ? v.videoWidth : null, note: ov && !ov.hidden ? ov.textContent : null };
});
const waitLive = (page, until, max = 20000) => stable(page, () => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!pop) return null;
  const el = window.__pierce('casora-frigate-live', pop.shadowRoot)[0];
  if (!el || !el.shadowRoot) return { card: false, pic: window.__pierce('hui-picture-entity-card', pop.shadowRoot).length };
  const p = el._player, v = p && p.tagName === 'CASORA-FRIGATE-STREAM' ? p.querySelector('video') : null;
  const ov = el.shadowRoot.querySelector('.ov');
  return { card: true, segs: [...el.shadowRoot.querySelectorAll('.hui-sg')].map((s) => (s.classList.contains('on') ? '*' : '') + s.textContent.trim()),
    tag: p ? p.tagName.toLowerCase() : null, src: el._src, ready: v ? v.readyState : null, w: v ? v.videoWidth : null,
    note: ov && !ov.hidden ? ov.textContent : null };
}, null, { max, quiet: 900, until });
const clickSeg = (page, label) => page.evaluate((l) => {
  const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  const el = window.__pierce('casora-frigate-live', pop.shadowRoot)[0];
  const s = [...el.shadowRoot.querySelectorAll('.hui-sg')].find((x) => x.textContent.trim() === l);
  if (s) s.click();
  return !!s;
}, label);
const closePop = async (page) => { await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close())); await page.waitForTimeout(600); };
const snap = async (page, name) => {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
};

// ── Desktop ──────────────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 1440, height: 1000, theme: 'Casora' });
  await dashboard(page, dash.url, 3);
  await need('Frigate-Testkamera im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], ID));
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) { /* none */ } });
  await addTile(page, 'qa-r335', {}, 400, 300);
  await page.waitForTimeout(1500);
  let at = await tileAt(page, 'qa-r335');
  await page.mouse.click(at.x, at.y);
  let d = await waitLive(page, (v) => v && v.card && v.segs.length === 2);
  await check('1. Popup: Umschalter „Standard · Unterstream“, Standard aktiv', d && d.card && d.segs.join('|') === '*Standard|Unterstream', d);
  await check('1. Standard ohne Stream-Funktion (Mock): Standbild wie bisher', d && d.tag === 'img' && !d.src, d);
  await page.waitForTimeout(1500);
  await snap(page, '1-desktop-standard');

  await clickSeg(page, 'Unterstream');
  d = await waitLive(page, (v) => v && v.ready >= 2 && v.w > 0);
  await check('2. „Unterstream“: casora-frigate-stream spielt testhof_sub über den MSE-Proxy (320 px breit)',
    d && d.tag === 'casora-frigate-stream' && d.src === 'testhof_sub' && d.ready >= 2 && d.w === 320 && d.segs.join('|') === 'Standard|*Unterstream', d);
  const way = await page.evaluate(() => {
    const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const p = window.__pierce('casora-frigate-live', pop.shadowRoot)[0]._player;
    return { way: p.way, sess: sessionStorage.getItem('casora-frigate-stream:camera.testhof') };
  });
  await check('2. Weg MSE, Wahl in der Sitzung gemerkt', way.way === 'mse' && way.sess === 'testhof_sub', way);
  await page.waitForTimeout(2500);
  await check('2. Popup bleibt nach dem Umschalten offen', await page.evaluate(() => !!window.__pierce('casora-popup').find((x) => x.hasAttribute('open'))));
  await snap(page, '2-desktop-unterstream');

  await closePop(page);
  await page.mouse.click(at.x, at.y);
  d = await waitLive(page, (v) => v && v.ready >= 2);
  await check('3. Wieder geöffnet: Unterstream bleibt (Sitzung)', d && d.src === 'testhof_sub' && d.segs.join('|') === 'Standard|*Unterstream', d);
  await clickSeg(page, 'Standard');
  d = await waitLive(page, (v) => v && v.tag === 'img');
  await check('3. Zurück auf Standard', d && d.tag === 'img' && d.segs.join('|') === '*Standard|Unterstream', d);
  await closePop(page);

  // 3b. Camera with stream function (Frigate with RTSP restream): Standard = HA's own ha-camera-stream.
  await svc('frigate_proxy', { stream: true });
  await page.waitForTimeout(800);
  await page.mouse.click(at.x, at.y);
  d = await waitLive(page, (v) => v && v.tag === 'ha-camera-stream');
  await check('3b. Mit Stream-Funktion: Standard = HAs ha-camera-stream', d && d.tag === 'ha-camera-stream' && !d.src, d);
  await closePop(page);
  await svc('frigate_proxy', { stream: false });
  await page.waitForTimeout(800);

  // 4. Studio field: popup starts with the main stream when nothing was picked in this session.
  await page.evaluate(() => sessionStorage.clear());
  await page.evaluate(() => { const F = window._casoraFrigate; F._streamsReset(); });
  await dropTile(page, 'qa-r335');
  await addTile(page, 'qa-r335b', { stream_popup: 'testhof_sub' }, 400, 300);
  await page.waitForTimeout(1500);
  at = await tileAt(page, 'qa-r335b');
  await page.mouse.click(at.x, at.y);
  d = await waitLive(page, (v) => v && v.ready >= 2);
  await check('4. Studio-Feld „Stream im Popup (Standard)“ = testhof_sub: Popup startet damit', d && d.src === 'testhof_sub' && d.ready >= 2, d);
  await closePop(page);

  // 6. A stream that does not answer (proxy gone after the list was read): note, Standard plays.
  await svc('frigate_proxy', { streams: false });
  await page.evaluate(() => sessionStorage.clear());
  await page.mouse.click(at.x, at.y);
  d = await waitLive(page, (v) => v && v.tag === 'img' && !!v.note, 30000);
  await check('6. Stream antwortet nicht: Hinweis „Stream nicht erreichbar · Standard“, Standard läuft',
    d && d.tag === 'img' && /Stream nicht erreichbar/.test(d.note || '') && d.segs[0] === '*Standard', d);
  await snap(page, '6-desktop-rueckfall');
  await closePop(page);

  // 7. Integration without the go2rtc proxy: no stream list → picture card as before.
  await page.evaluate(() => { window._casoraFrigate._streamsReset(); window._casoraFrigate._badStreamReset(); });
  await page.waitForTimeout(800);
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(800);
  await closePop(page);
  await page.mouse.click(at.x, at.y);
  d = await stable(page, () => {
    const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    if (!pop) return null;
    return { own: window.__pierce('casora-frigate-live', pop.shadowRoot).length, pic: window.__pierce('hui-picture-entity-card', pop.shadowRoot).length };
  }, null, { max: 8000, quiet: 900 });
  await check('7. Ohne go2rtc-Proxy: kein Umschalter, Bildkarte wie bisher', d && d.own === 0 && d.pic >= 1, d);
  await closePop(page);
  await svc('frigate_proxy', { streams: true });
  await dropTile(page, 'qa-r335b');
}

// ── Phone ────────────────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora' });
  await dashboard(page, dash.url, 3);
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) { /* none */ } });
  await addTile(page, 'qa-r335p', { live_tile: true }, 16, 140);
  const t = await stable(page, () => window._casoraFrigate._dbg(), null, { max: 12000, quiet: 900, until: (v) => v.live === 1 });
  await check('5. Handy: Kachel mit „Live auf der Kachel“ spielt den Unterstream', t && t.live === 1 && t.srcs[0] === 'testhof_sub', t);
  const tv = await stable(page, () => {
    const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r335p');
    const v = el && el.shadowRoot && el.shadowRoot.querySelector('casora-frigate-stream video');
    return v ? { ready: v.readyState, w: v.videoWidth } : null;
  }, null, { max: 20000, quiet: 900, until: (v) => v && v.ready >= 2 });
  await check('5. Handy-Kachel: Bild läuft (320 px)', tv && tv.ready >= 2 && tv.w === 320, tv);
  await page.waitForTimeout(1500);
  await snap(page, '5-handy-kachel');
  const at = await tileAt(page, 'qa-r335p');
  await page.mouse.click(at.x, at.y);
  const d = await waitLive(page, (v) => v && v.ready >= 2);
  await check('5. Handy-Popup startet mit dem Unterstream', d && d.src === 'testhof_sub' && d.segs.join('|') === 'Standard|*Unterstream', d);
  await page.waitForTimeout(1200);
  await snap(page, '5-handy-popup');
  await closePop(page);
  await dropTile(page, 'qa-r335p');
  const end = await stable(page, () => window._casoraFrigate._dbg(), null, { max: 6000, quiet: 800, until: (v) => v.live === 0 });
  await check('Kachel entfernt: kein Live-Bild mehr', end && end.live === 0, end);
}

await finish();
