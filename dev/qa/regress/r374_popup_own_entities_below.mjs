// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/32-media-badge.js
// Reported (issue #97, Android phone): the popup's own entities (Studio „Entitäten im Popup“) lay over the upper
// part of the media popup – over volume and „Quelle“. Many popup_styles make .content a flex column whose
// .container may shrink; with own cards below, it shrank by their height and its content ran on under them.
// Also reported: the title showed „Livin&apos; on the edge“ – the player (WiiM/LinkPlay) sends entities in its
// metadata. Expected on the phone (393×852, Casora dark): the own cards start below the last content of the
// popup (also scrolled to the end), and the title reads „Livin' on the edge“ without „&apos;“.
// Pictures: CASORA_R373_BILDER=<folder> (oben.png, unten.png). States only in the browser (fakeStates).
import fs from 'node:fs';
import path from 'node:path';
import { open, dashboard, casoraDashboards, fakeStates, check, need, finish } from './lib.mjs';

const BILDER = process.env.CASORA_R373_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const all = await casoraDashboards();
const hasTile = (v) => /"template":"casora_media"|"template":\["casora_media"/.test(JSON.stringify(v));
const d = all.find((x) => x.mobile && (x.config.views || []).some(hasTile));
await need('phone dashboard with a media tile', d);
const { page } = await open({ width: 393, height: 852, mobile: true, dark: true, theme: 'Casora' });
const views = d.config.views.map((v, i) => [v, v.path || String(i)]);
const mv = views.find(([v]) => hasTile(v)) || views[0];
await dashboard(page, d.url + '/' + mv[1], 3);
await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'media' } })));
await page.waitForTimeout(2000);
// A media tile with three own entities (scripts of the house), as the Studio stores them.
const ent = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass;
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_media')
    && x.getBoundingClientRect().width > 50 && /^media_player\./.test(x._config.entity || '') && h.states[x._config.entity]);
  const scripts = Object.keys(h.states).filter((id) => id.startsWith('script.')).slice(0, 3);
  if (!b || scripts.length < 3) return null;
  b._config.variables = Object.assign({}, b._config.variables, { popup_extra_entities: scripts });
  return b._config.entity;
});
await need('media tile and three scripts in the house', ent, ent);
// Playing with cover, sources and volume: the popup is taller than the sheet.
await fakeStates(page, { [ent]: { state: 'playing', attributes: { volume_level: 0.1, supported_features: 450487,
  source_list: ['Wifi', 'Bluetooth', 'Follower', 'Optical', 'Line In', 'HDMI'], source: 'Wifi', entity_picture: '/casora_assets/rooms/balcony-demo.jpg',
  media_title: 'Livin&apos; on the edge', media_artist: 'Aerosmith', media_duration: 200, media_position: 20,
  media_position_updated_at: new Date().toISOString() } } }, { sticky: true });
const pos = await page.evaluate((id) => {
  const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id && x.getBoundingClientRect().width > 50);
  b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, ent);
await page.waitForTimeout(800);
await page.touchscreen.tap(pos.x, pos.y);
await page.waitForTimeout(3500);
if (BILDER) await page.screenshot({ path: path.join(BILDER, 'oben.png') });

// Lowest painted point of the popup's own content vs. the top of the own cards, at the top and scrolled to the end.
const measure = () => page.evaluate(() => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const sr = p.shadowRoot, c = sr.querySelector('.container'), ex = sr.querySelector('.extra');
  let low = 0;
  const walk = (root) => root.querySelectorAll('*').forEach((e) => {
    if (e.shadowRoot) walk(e.shadowRoot);
    if (['STYLE', 'SLOT', 'SCRIPT'].includes(e.tagName)) return;
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
    if (r.height < 1 || r.width < 1 || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    let text = false; for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) text = true;
    const paints = !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor) || cs.backgroundImage !== 'none';
    if (text || paints || ['IMG', 'HA-ICON', 'svg'].includes(e.tagName)) low = Math.max(low, r.bottom);
  });
  walk(c);
  const xr = ex && !ex.hidden ? ex.getBoundingClientRect() : null;
  const t = window.__pierce('.hm-t', c).map((e) => e.textContent.trim()).filter(Boolean)[0] || '';
  return { low: Math.round(low), extraTop: xr ? Math.round(xr.top) : null, title: t };
});
const top = await measure();
await need('media popup with its own cards', top && top.extraTop !== null, top);
await check('own cards start below the content (top of the sheet)', top.extraTop >= top.low - 1, top);
await page.evaluate(() => { const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open')); const ct = p.shadowRoot.querySelector('.content'); ct.scrollTop = ct.scrollHeight; });
await page.waitForTimeout(600);
const end = await measure();
await check('own cards start below the content (scrolled to the end)', end && end.extraTop >= end.low - 1, end);
if (BILDER) await page.screenshot({ path: path.join(BILDER, 'unten.png') });
await check('title without „&apos;“', top.title === "Livin' on the edge", top.title);
await finish();
