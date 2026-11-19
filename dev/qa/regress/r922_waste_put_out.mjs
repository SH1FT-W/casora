// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/50-waste-out.js custom_components/casora/scripts/local/01-basis.js#standing custom_components/casora/waste_out.py dashboards/casora/button_card_templates.json#casora_trash
// Issue #211: on the pickup day the waste tile is active; a tap on its icon confirms „put out“ and the tile hides until
// the next pickup – on every device (list kept by the integration, casora/waste_out/*), not only in this browser. The
// waste popup has the same as a switch row „Rausgestellt“, which is also the way back. The bell's „Abfall heute“ row
// for that pickup goes with the confirmation and comes back with the undo (maintainer, #211).
// Two browsers stand for two devices: a phone (393x852, WebKit) taps the icon, a desktop (1440x900) sees the tile go
// without reloading, opens the popup and switches the row off; both tiles come back.
// Made-up bin sensors (fakeStates, sticky, this browser only) with residual waste today; the tile is built in the
// browser from the test house's casora_trash tile with these sensors. The confirmation is the only thing saved; it is
// taken back at the end.
// R922_BILD=<dir>: pictures of the tile, the notice and the popup.
import fs from 'node:fs';
import path from 'node:path';
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates, stable, atFinish } from './lib.mjs';

const all = await casoraDashboards();
const tileOf = (o) => {
  if (!o || typeof o !== 'object') return null;
  if ([].concat(o.template || []).includes('casora_trash')) return o;
  for (const x of Object.values(o)) { const t = tileOf(x); if (t) return t; }
  return null;
};
const desk = all.find((d) => !d.mobile && !/importiert/.test(d.url) && tileOf(d.config));
await need('Casora-Dashboard mit Abfall-Kachel', desk);
const ymd = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const REST = 'sensor.qa_r922_restmuell', BIO = 'sensor.qa_r922_bio', DUTY = 'binary_sensor.qa_r922_dienst';
// On duty (a duty roster of the test house could make the tile quiet this month: then nothing is to confirm).
const FAKE = {
  [DUTY]: { state: 'on', attributes: { friendly_name: 'QA Dienst' } },
  [REST]: { state: '0', attributes: { friendly_name: 'QA Restmüll', [ymd(0)]: 'QA Rest', [ymd(14)]: 'QA Rest' } },
  [BIO]: { state: '5', attributes: { friendly_name: 'QA Bio', [ymd(5)]: 'QA Bio' } },
};
const TILE = JSON.parse(JSON.stringify(tileOf(desk.config)));
TILE.variables = Object.assign({}, TILE.variables, { trash_sensors: { [REST]: 'Restmüll', [BIO]: 'Bio' }, trash_duty_entity: DUTY });
const DIR = process.env.R922_BILD;
if (DIR) fs.mkdirSync(DIR, { recursive: true });
const pic = async (pg, name) => { if (DIR) await pg.screenshot({ path: path.join(DIR, name + '.png') }); };

const build = (pg) => pg.evaluate(async (tile) => {
  const ha = document.querySelector('home-assistant');
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 140 && x.height > 50 && x.top > 60; });
  if (!old) return 'keine Kachel als Anker';
  const el = document.createElement('button-card');
  el.id = 'qa-r922';
  el.setConfig(Object.assign({ type: 'custom:button-card' }, tile));
  el.hass = ha.hass;
  old.parentNode.insertBefore(el, old);
  // Like a dashboard grid (hui-card, casora-smart-row): a tile whose `hidden` turns true is taken out of the layout.
  el.addEventListener('card-visibility-changed', () => { el.style.display = el.hidden ? 'none' : ''; });
  el.scrollIntoView({ block: 'center' });
  await new Promise((res) => setTimeout(res, 1000));
  return 'ok';
}, TILE);
// The tile: shown (has a box) and what the module says.
const TILE_NOW = () => {
  const el = window.__pierce('button-card').find((b) => b.id === 'qa-r922');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const W = window.casoraDevice.waste(document.querySelector('home-assistant').hass, el._config.variables);
  const O = window._casoraWasteOut;
  // button-card's own `hidden` (what the grids read) and the box.
  return { shown: !el.hidden && r.width > 0 && r.height > 0, key: O ? O.key(W) : null,
    out: !!(O && O.isOut(W)), state: (el.shadowRoot && el.shadowRoot.querySelector('#state') || {}).textContent || '' };
};
const ICON_AT = () => {
  const el = window.__pierce('button-card').find((b) => b.id === 'qa-r922');
  const sr = el && el.shadowRoot;
  const ic = sr && (sr.querySelector('#icon') || sr.querySelector('#img-cell'));
  if (!ic) return null;
  el.scrollIntoView({ block: 'center' });
  const r = ic.getBoundingClientRect();
  return r.width > 0 ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
};
// The bell's waste rows: notify hours wide open and the same made-up bins as the tile (browser only).
const BELL_WASTE = (bins) => {
  window.CASORA_NOTIFY_LOCAL = Object.assign({}, window.CASORA_NOTIFY_LOCAL || {}, { waste: true, waste_from_hour: 0, waste_until_hour: 24,
    waste_sensors: bins.sensors, waste_duty: bins.duty });
  const N = window._casoraNotify;
  if (!N || !N.refresh) return Promise.resolve(null);
  return Promise.resolve(N.refresh()).then(() => N.rows.filter((r) => /^casora:waste:/.test(String(r.id))).map((r) => r.label + ' · ' + (r.sub || '')));
};
const BINS = { sensors: { [REST]: 'Restmüll', [BIO]: 'Bio' }, duty: DUTY };
const bellRest = (rows) => !!(rows && rows.some((t) => /^Abfall heute · .*Restmüll/.test(t)));
const setOut = (pg, key, out) => pg.evaluate(([k, o]) => document.querySelector('home-assistant').hass.connection
  .sendMessagePromise({ type: 'casora/waste_out/set', key: k, out: o }).then((r) => !!r, () => false), [key, out]);

// ── phone: tile active today, icon tap confirms ──
const phone = await open({ dark: false, theme: 'Casora', width: 393, height: 852, mobile: true, safari: true });
usePage(phone.page);
await dashboard(phone.page, desk.url, 3);
await fakeStates(phone.page, FAKE, { sticky: true });
await need('Handy: Abfall-Kachel mit den erfundenen Tonnen gebaut', (await build(phone.page)) === 'ok');
let a = await stable(phone.page, TILE_NOW, null, { until: (t) => t && t.key });
await need('Handy: Restmüll heute fällig (Kachel aktiv)', a && a.key && /\|restmüll/.test(a.key), a);
const KEY = a.key;
atFinish(() => setOut(phone.page, KEY, false));
await setOut(phone.page, KEY, false);
a = await stable(phone.page, TILE_NOW, null, { until: (t) => t && t.shown });
await check('Handy: Kachel vor dem Bestätigen sichtbar', a && a.shown, a);
await pic(phone.page, 'handy-1-kachel-faellig');
let bell = await stable(phone.page, BELL_WASTE, BINS, { until: bellRest });
await check('Handy: Glocke zeigt „Abfall heute · Restmüll“ vor dem Bestätigen', bellRest(bell), bell);

// ── desktop (second device) ──
const desk2 = await open({ dark: false, theme: 'Casora', width: 1440, height: 900 });
await dashboard(desk2.page, desk.url, 3);
await fakeStates(desk2.page, FAKE, { sticky: true });
await need('Desktop: Abfall-Kachel gebaut', (await build(desk2.page)) === 'ok');
let b = await stable(desk2.page, TILE_NOW, null, { until: (t) => t && t.shown });
await check('Desktop: Kachel sichtbar', b && b.shown, b);

usePage(phone.page);
const at = await phone.page.evaluate(ICON_AT);
await need('Handy: Symbol der Kachel gefunden', at);
await phone.page.touchscreen.tap(at.x, at.y);
a = await stable(phone.page, TILE_NOW, null, { max: 8000, until: (t) => t && !t.shown });
await check('Handy: Tipp aufs Symbol – Kachel ausgeblendet', a && !a.shown && a.out, a);
bell = await stable(phone.page, BELL_WASTE, BINS, { max: 8000, until: (r) => r && !bellRest(r) });
await check('Handy: Glocken-Eintrag nach dem Bestätigen weg', bell && !bellRest(bell), bell);
const popupOpen = await phone.page.evaluate(() => !!window.__pierce('casora-popup').find((x) => x.hasAttribute('open')));
await check('Handy: Symbol öffnet am Abholtag kein Popup', !popupOpen);
await phone.page.waitForTimeout(400);
await pic(phone.page, 'handy-2-bestaetigt-hinweis');

usePage(desk2.page);
b = await stable(desk2.page, TILE_NOW, null, { max: 8000, until: (t) => t && !t.shown });
await check('Desktop: ohne Neuladen ebenfalls ausgeblendet (geteilt)', b && !b.shown && b.out, b);
const bellD = await stable(desk2.page, BELL_WASTE, BINS, { max: 8000, until: (r) => r && !bellRest(r) });
await check('Desktop: Glocken-Eintrag ebenfalls weg (geteilt)', bellD && !bellRest(bellD), bellD);

// ── desktop: popup row „Rausgestellt“ on, switch it off ──
await desk2.page.evaluate(() => {
  const el = window.__pierce('button-card').find((x) => x.id === 'qa-r922');
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
});
const ROW = () => {
  const S = window.casoraPopup && window.casoraPopup.surface;
  const sw = S && window.__pierce('[data-casora-wasteout]', S).find((x) => x.getBoundingClientRect().width > 0);
  if (!sw) return null;
  const row = sw.closest('.hui-row');
  const r = sw.getBoundingClientRect();
  return { on: sw.getAttribute('aria-checked') === 'true', text: (row ? row.textContent : '').replace(/\s+/g, ' ').trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
let row = await stable(desk2.page, ROW, null, { max: 12000, until: (r) => !!r });
await need('Desktop: Zeile „Rausgestellt“ im Abfall-Popup', row, row);
await check('Desktop: Zeile sagt Rausgestellt und steht auf an', row.on && /Rausgestellt/.test(row.text), row);
await desk2.page.waitForTimeout(500);
await pic(desk2.page, 'desktop-3-popup-rausgestellt');
await desk2.page.mouse.click(row.x, row.y);
row = await stable(desk2.page, ROW, null, { until: (r) => r && !r.on });
await check('Desktop: Schalter aus', row && !row.on, row);
await pic(desk2.page, 'desktop-4-popup-zurueck');
b = await stable(desk2.page, TILE_NOW, null, { max: 8000, until: (t) => t && !t.out });
await check('Desktop: Bestätigung zurückgenommen', b && !b.out, b);
usePage(phone.page);
a = await stable(phone.page, TILE_NOW, null, { max: 8000, until: (t) => t && t.shown });
await check('Handy: Kachel wieder da (geteilt)', a && a.shown && !a.out, a);
bell = await stable(phone.page, BELL_WASTE, BINS, { max: 8000, until: bellRest });
await check('Handy: Glocken-Eintrag nach dem Zurücknehmen wieder da', bellRest(bell), bell);
await finish();
