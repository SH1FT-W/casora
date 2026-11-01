// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js custom_components/casora/scripts/local/35-phone-hub.js
// Owner (01.11.2026): the climate badge gets the same "Order" as the security badge (r381). Studio › Climate ›
// "Order" lists the sub-badges the badge has (temperature, humidity, air quality, blinds on Home); dragged (mouse) or
// moved with the arrow keys and saved, the order holds for the badge's sub-row on the desktop, the phone's sub-row and
// the phone's climate popup. Without an order everything stays as before (temperature, humidity, air quality, blinds).
// The climate badge's sub-line is one value (the temperature span) – nothing to order there. The dashboard pair is
// restored at the end.
//   CASORA_QA_SHOTS=<dir>: before/after pictures there as well (light theme).
import fs from 'node:fs';
import path from 'node:path';
import { open, usePage, shot, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const OUT = process.env.CASORA_QA_SHOTS || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const keep = async (pg, name, clip) => {
  if (!OUT) return;
  await pg.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }).catch(() => {});
};
const USUAL = ['temp', 'humidity', 'quality', 'covers'];
const usual = (rows) => (rows || []).slice().sort((a, b) => USUAL.indexOf(a) - USUAL.indexOf(b));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const desk = await open({ width: 1440, height: 900, dark: false });
const page = desk.page;
usePage(page);
const H = (fn, arg) => page.evaluate(fn, arg);
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));

const backup = await H(async (urls) => {
  const h = document.querySelector('home-assistant').hass;
  const out = {};
  for (const u of urls) out[u] = await h.callWS({ type: 'lovelace/config', url_path: u });
  return out;
}, [dash.url, dash.phone.url]);
const restore = () => H(async (b) => {
  const h = document.querySelector('home-assistant').hass;
  for (const [u, c] of Object.entries(b)) await h.callWS({ type: 'lovelace/config/save', url_path: u, config: c });
}, backup);

// Start without an order (a run cut short leaves one behind); the configs above come back at the end.
const cleaned = await H(async (b) => {
  const h = document.querySelector('home-assistant').hass;
  let n = 0;
  for (const [u, c] of Object.entries(b)) {
    const txt = JSON.stringify(c, (k, v) => { if (k === 'climate_sub_order') { n++; return undefined; } return v; });
    if (n) await h.callWS({ type: 'lovelace/config/save', url_path: u, config: JSON.parse(txt) });
  }
  return n;
}, backup);
if (cleaned) await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));

// Desktop: Home's climate sub-row (DOM order = the order on screen), only the badges that show.
const shownKeys = (fieldSel, host) => H(([fieldSel, host]) => {
  let root = document;
  if (host) {
    const h = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes(host));
    root = h && h.shadowRoot;
  }
  const field = root && (root.querySelector ? root.querySelector(fieldSel) : null) || (!host && window.__pierce(fieldSel)[0]);
  if (!field) return null;
  return window.__pierce('button-card', field).filter((b) => {
    const hc = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
    return hc && getComputedStyle(hc).display !== 'none' && b.getBoundingClientRect().width > 0;
  }).map((b) => window.casoraClimSub.keyOfCard(b._config)).filter(Boolean);
}, [fieldSel, host]);
const openRow = async (pg) => {
  // A busy test HA may drop the socket (error 3): try again.
  for (let i = 0; i < 4; i++) {
    const ok = await pg.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
      { entity_id: 'input_select.casora_expanded_row', option: 'climate' }).then(() => true, () => false)).catch(() => false);
    if (ok) break;
    await pg.waitForTimeout(2500);
  }
  await pg.waitForTimeout(2000);
};
const headClip = (pg) => pg.evaluate(() => {
  const g = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_climate_group')
    && b.getBoundingClientRect().width > 0);
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: Math.max(0, r.x - 260), y: Math.max(0, r.y - 20), width: 1000, height: 200 };
});

await openRow(page);
const before = await shownKeys('#badges_climate');
await need('desktop: climate sub-row with two kinds or more', before && before.length >= 2, before);
await check('desktop: without an order the usual one (temperature, humidity, air quality, blinds)', same(before, usual(before)), before);
await keep(page, 'vorher_desktop_klima', await headClip(page));

// Phone: Home's climate sub-row and the climate popup's rows.
const phone = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: false, theme: 'Casora' });
const P = (fn, arg) => phone.page.evaluate(fn, arg);
const NAME = [[/^Temperatur/, 'temp'], [/^Luftfeuchtigkeit/, 'humidity'], [/^Luftqualit/, 'quality'], [/^Jalousien/, 'covers']];
const keysOf = (rows) => rows.map((t) => (NAME.find(([re]) => re.test(t)) || [])[1]).filter(Boolean);
const phoneState = async (name) => {
  await dashboard(phone.page, dash.phone.url + '/home', 2);
  await P(() => window._casoraFilter && window._casoraFilter.set('all'));
  await phone.page.waitForTimeout(800);
  const row = await P(() => {
    const host = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
    const f = host && host.shadowRoot.querySelector('#climate_row');
    return f ? window.__pierce('button-card', f).filter((b) => {
      const hc = b.shadowRoot && b.shadowRoot.querySelector('ha-card'); return hc && getComputedStyle(hc).display !== 'none';
    }).map((b) => window.casoraClimSub.keyOfCard(b._config)).filter(Boolean) : [];
  });
  const at = await P(() => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_climate_group') && x.getBoundingClientRect().width > 20);
    if (!b) return null;
    b.scrollIntoView({ block: 'center', inline: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!at) return { row, rows: [] };
  await phone.page.waitForTimeout(300);
  await phone.page.touchscreen.tap(at.x, at.y);
  await phone.page.waitForTimeout(3000);
  const rows = await P(() => {
    const s = window.casoraPopup && window.casoraPopup.surface;
    return s ? window.__pierce('.hui-row', s).filter((n) => n.getBoundingClientRect().height > 0)
      .map((n) => n.textContent.replace(/\s+/g, ' ').trim()) : [];
  });
  await keep(phone.page, name);
  await P(() => window.casoraPopup && window.casoraPopup.close());
  return { row, rows };
};
const phoneBefore = await phoneState('vorher_handy_klima_popup');
await need('phone: climate popup with rows', keysOf(phoneBefore.rows).length >= 2, phoneBefore);
await check('phone: without an order Home\'s sub-row is the usual one', same(phoneBefore.row, usual(phoneBefore.row)), phoneBefore.row);
await check('phone: without an order the popup rows are the usual one (blinds last)', same(keysOf(phoneBefore.rows), usual(keysOf(phoneBefore.rows))), phoneBefore.rows);

// ── Studio: the "Order" list in the climate badge ────────────────────────────
await studio(page, dash.url);
const sel = (pg) => pg.evaluate(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals || {};
  const rooms = p._state.compact.rooms;
  p._room = Math.max(0, rooms.findIndex((r) => I.isHomeRoom ? I.isHomeRoom(r, rooms) : r === rooms[0]));
  p._sel = null; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 600));
  p._select({ group: 'badges', key: 'Climate', label: 'Climate' });
  await new Promise((r) => setTimeout(r, 1500));
  const box = window.__pierce('.suborder[data-key="climate_sub_order"]').find((x) => x.getBoundingClientRect().height > 0);
  if (!box) return null;
  box.scrollIntoView({ block: 'center' });
  return [...box.querySelectorAll('.subrow')].map((r) => r.dataset.id);
});
const BOX = '.suborder[data-key="climate_sub_order"]';
const rows0 = await sel(page);
await need('Studio: "Order" list in the climate badge', rows0 && rows0.length >= 2, rows0);
await check('Studio: without an order the usual one', same(rows0, usual(rows0)), rows0);
const listClip = (pg) => pg.evaluate((BOX) => {
  const box = window.__pierce(BOX).find((x) => x.getBoundingClientRect().height > 0);
  const r = box.getBoundingClientRect();
  return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 70 };
}, BOX);
await keep(page, 'studio_desktop_klima_vorher', await listClip(page));

// Drag the last row to the top with the mouse (grip), then move the new third row (or the second) up with the keyboard.
const gripAt = (id) => H(([BOX, id]) => {
  const g = window.__pierce(BOX + ' .subrow[data-id="' + id + '"] .scgrip').find((x) => x.getBoundingClientRect().width > 0);
  const r = g.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, step: g.closest('.subrow').offsetHeight + 2 };
}, [BOX, id]);
const last = rows0[rows0.length - 1];
const g = await gripAt(last);
await page.mouse.move(g.x, g.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(g.x, g.y - (g.step * (rows0.length - 1) * i) / 10);
await page.mouse.up();
await page.waitForTimeout(600);
const rowsNow = () => H((BOX) => [...window.__pierce(BOX)[0].querySelectorAll('.subrow')].map((r) => r.dataset.id), BOX);
const rows1 = await rowsNow();
await check('Studio: dragged row is now first', rows1[0] === last && rows1.length === rows0.length, rows1);
// Two rows only: one more move would give the usual order back – the keys are checked with three or more.
let rows2 = rows1;
if (rows1.length >= 3) {
  const mover = rows1[2];
  await H(([BOX, id]) => window.__pierce(BOX + ' .subrow[data-id="' + id + '"] .scgrip')[0].focus(), [BOX, mover]);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  rows2 = await rowsNow();
  await check('Studio: arrow up moves the focused row', rows2[1] === mover, rows2);
}
await check('Studio: "Reset" appears with an own order', await H((BOX) => !window.__pierce(BOX + ' .subreset')[0].hidden, BOX));
await keep(page, 'studio_desktop_klima_nachher', await listClip(page));
// Studio preview: the climate badge's sub-badges in the order (preview chips with the same words).
const want = rows2;
const saved = await H(async () => {
  const p = window.__panel();
  const ok = await p._save();
  return { ok, v: p._state.compact.rooms[p._room].variables.climate_sub_order };
});
await check('Studio: saved climate_sub_order', saved.ok && same(saved.v, want), { saved, want });
const mob = await H(async (u) => {
  const h = document.querySelector('home-assistant').hass;
  // A busy test HA may drop the socket right after the save (error 3): ask again.
  let c = null;
  for (let i = 0; i < 4 && !c; i++) {
    try { c = await h.callWS({ type: 'lovelace/config', url_path: u }); } catch (e) { await new Promise((r) => setTimeout(r, 2000)); }
  }
  const hits = [];
  JSON.stringify(c, (k, v) => { if (k === 'climate_sub_order') hits.push(v); return v; });
  return hits;
}, dash.phone.url);
await check('phone dashboard got the order (mirror)', mob.some((v) => same(v, want)), mob);

// Studio on a phone: the same list, for the picture.
const sp = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: false });
usePage(sp.page);
await studio(sp.page, dash.url);
const phoneRows = await sel(sp.page);
await sp.page.waitForTimeout(500);
await check('Studio on the phone: list in the saved order', same(phoneRows, want), phoneRows);
await keep(sp.page, 'studio_handy_klima');
usePage(page);

// ── Dashboard after saving ───────────────────────────────────────────────────
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));
await openRow(page);
const after = await shownKeys('#badges_climate');
const follows = (got) => same(got, want.filter((k) => got.includes(k)));
await check('desktop: sub-row follows the order', follows(after) && !same(after, before), { before, after, want });
await keep(page, 'nachher_desktop_klima', await headClip(page));
await shot('desktop_after');

const phoneAfter = await phoneState('nachher_handy_klima_popup');
const popupKeys = keysOf(phoneAfter.rows);
await check('phone: Home sub-row follows the order', follows(phoneAfter.row), { before: phoneBefore.row, after: phoneAfter.row, want });
await check('phone: climate popup rows follow the order', popupKeys.length >= 2 && follows(popupKeys),
  { before: phoneBefore.rows, after: phoneAfter.rows, want });
usePage(phone.page);
await shot('phone_popup_after');
usePage(page);

if (!process.env.CASORA_QA_KEEP) await restore();
await finish();
