// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js
// Owner (01.11.2026): the entries inside the security badge (locks, doors, windows, cameras …) had a fixed order.
// Studio › Security badge › "Order" lists the kinds the badge has; dragged (mouse) or moved with the arrow keys and
// saved, the order holds for the badge's sub-line, its sub-badges on the desktop, the phone's sub-badges and the
// phone's security popup. Without an order everything follows the sub-line's usual order (owner, 01.11.2026). The dashboard pair is restored at the end.
//   CASORA_QA_SHOTS=<dir>: before/after pictures there as well.
import fs from 'node:fs';
import path from 'node:path';
import { open, usePage, shot, studio, casoraDashboard, dashboard, check, need, finish, fakeStates } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const OUT = process.env.CASORA_QA_SHOTS || null;
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const keep = async (pg, name, clip) => {
  if (!OUT) return;
  await pg.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip } : {}) }).catch(() => {});
};

const desk = await open({ width: 1440, height: 900 });
const page = desk.page;
usePage(page);
const H = (fn, arg) => page.evaluate(fn, arg);
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));

// Configs as they are now, written back at the end.
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

// Something to show in the sub-line: a door and a window open, the lock unlocked.
const homeVars = (backup[dash.url].views[0].cards[0] || {}).variables || {};
const lock = (homeVars.security_locks || [])[0];
const facts = await H(() => {
  const st = document.querySelector('home-assistant').hass.states;
  const of = (dc) => Object.keys(st).find((k) => k.startsWith('binary_sensor.') && (st[k].attributes || {}).device_class === dc);
  return { door: of('door'), window: of('window') };
});
const patch = {};
if (lock) patch[lock] = { state: 'unlocked' };
if (facts.door) patch[facts.door] = { state: 'on' };
if (facts.window) patch[facts.window] = { state: 'on' };

// Desktop: the security badge's sub-line kinds and its sub-row (DOM order = the order on screen).
const KIND = { 'Schl(o|ö)ss': 'locks', 'T(ü|ue)r': 'doors', Fenster: 'windows', Kamera: 'cameras', 'Tor(e)? ': 'gates', Jalousie: 'covers', Alarm: 'alarm' };
const deskState = (pg) => pg.evaluate((KIND) => {
  const g = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group')
    && b.getBoundingClientRect().width > 0);
  // Kind from the item's words (aria-label / text): „2 Fenster offen“, „Schloss offline“ …
  const items = g ? [...g.shadowRoot.querySelectorAll('.cs-sum-item')].map((x) => {
    const w = (x.getAttribute('aria-label') || x.textContent || '');
    const hit = Object.keys(KIND).find((re) => new RegExp(re, 'i').test(w));
    // Rank of the finding as casoraSecLead has it: jammed, open (also „Alarm aus“), tilted, offline.
    const rank = /klemm/i.test(w) ? 0 : /offen|Alarm aus/i.test(w) ? 1 : /gekippt/i.test(w) ? 2 : /offline/i.test(w) ? 3 : 4;
    return { kind: hit ? KIND[hit] : w, rank, lead: x.classList.contains('cs-sum-lead') };
  }) : [];
  const sub = items.map((x) => x.kind);
  const field = window.__pierce('#badges_security')[0];
  const row = field ? window.__pierce('button-card', field).filter((b) => {
    const hc = b.shadowRoot && b.shadowRoot.querySelector('ha-card'); return hc && getComputedStyle(hc).display !== 'none';
  }).map((b) => window.casoraSecSub.keyOfCard(b._config, document.querySelector('home-assistant').hass.states)) : [];
  return { sub: sub.filter((k, i, a) => a.indexOf(k) === i), row, items };
}, KIND);
const openRow = async (pg) => {
  await pg.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
    { entity_id: 'input_select.casora_expanded_row', option: 'security' }));
  await pg.waitForTimeout(1800);
};
const headClip = async (pg) => pg.evaluate(() => {
  const g = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group')
    && b.getBoundingClientRect().width > 0);
  if (!g) return null;
  const r = g.getBoundingClientRect();
  return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: 900, height: 200 };
});

await fakeStates(page, patch, { sticky: true });
await openRow(page);
const before = await deskState(page);
await need('desktop: security sub-line and sub-row', before.sub.length >= 2 && before.row.length >= 2, before);
// Owner (01.11.2026): without an order the sub-badges follow the sub-line's usual order (alarm, doors, windows, gates, locks …).
await check('desktop: without an order the sub-row follows the usual order', JSON.stringify(before.row) === JSON.stringify(window_keys(before.row)), before.row);
await keep(page, 'vorher_desktop_badge', await headClip(page));

// Phone: Home's security sub-row and the hub popup's rows.
const phone = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: true, theme: 'Casora' });
const P = (fn, arg) => phone.page.evaluate(fn, arg);
const phoneState = async () => {
  await dashboard(phone.page, dash.phone.url + '/home', 2);
  await P(() => window._casoraFilter && window._casoraFilter.set('all'));
  await fakeStates(phone.page, patch, { sticky: true });
  const row = await P(() => {
    const host = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
    const f = host && host.shadowRoot.querySelector('#security_row');
    return f ? window.__pierce('button-card', f).filter((b) => {
      const hc = b.shadowRoot && b.shadowRoot.querySelector('ha-card'); return hc && getComputedStyle(hc).display !== 'none';
    }).map((b) => window.casoraSecSub.keyOfCard(b._config, document.querySelector('home-assistant').hass.states)) : [];
  });
  const at = await P(() => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_security_group') && x.getBoundingClientRect().width > 20);
    if (!b) return null;
    b.scrollIntoView({ block: 'center', inline: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!at) return { row, rows: [] };
  await phone.page.waitForTimeout(300);
  await phone.page.touchscreen.tap(at.x, at.y);
  await phone.page.waitForTimeout(2800);
  const rows = await P(() => {
    const s = window.casoraPopup && window.casoraPopup.surface;
    return s ? window.__pierce('.hui-row', s).filter((n) => n.getBoundingClientRect().height > 0)
      .map((n) => n.textContent.replace(/\s+/g, ' ').trim()) : [];
  });
  return { row, rows };
};
const phoneBefore = await phoneState();
const NAME = [[/^Schl(o|ö)ss/, 'locks'], [/^Kamera/, 'cameras'], [/^T(ü|ue)r/, 'doors'], [/^Fenster/, 'windows'],
  [/^Jalousie/, 'covers'], [/^Tor/, 'gates'], [/^Alarm/, 'alarm']];
const keysOf = (rows) => rows.map((t) => (NAME.find(([re]) => re.test(t)) || [])[1]).filter(Boolean);
await check('phone: without an order Home\'s sub-row follows the usual order', JSON.stringify(phoneBefore.row) === JSON.stringify(window_keys(phoneBefore.row)), phoneBefore.row);
await check('phone: without an order the popup rows follow the usual order', keysOf(phoneBefore.rows).length >= 2
  && JSON.stringify(keysOf(phoneBefore.rows)) === JSON.stringify(window_keys(keysOf(phoneBefore.rows))), phoneBefore.rows);
await need('phone: security popup with rows', phoneBefore.rows.length >= 2, phoneBefore);
await keep(phone.page, 'vorher_handy_popup');
await P(() => window.casoraPopup && window.casoraPopup.close());

// ── Studio: the "Order" list in the security badge ───────────────────────────
await studio(page, dash.url);
const sel = () => H(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals || {};
  const rooms = p._state.compact.rooms;
  p._room = Math.max(0, rooms.findIndex((r) => I.isHomeRoom ? I.isHomeRoom(r, rooms) : r === rooms[0]));
  p._sel = null; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 600));
  p._select({ group: 'badges', key: 'Security', label: 'Security' });
  await new Promise((r) => setTimeout(r, 1200));
  const box = window.__pierce('.suborder').find((x) => x.getBoundingClientRect().height > 0);
  if (!box) return null;
  box.scrollIntoView({ block: 'center' });
  return [...box.querySelectorAll('.subrow')].map((r) => r.dataset.id);
});
const rows0 = await sel();
await need('Studio: "Order" list in the security badge', rows0 && rows0.length >= 3, rows0);
await check('Studio: without an order the usual one (alarm, doors, windows, gates, locks, covers, cameras)',
  JSON.stringify(rows0) === JSON.stringify(window_keys(rows0)), rows0);
const listClip = () => H(() => {
  const box = window.__pierce('.suborder').find((x) => x.getBoundingClientRect().height > 0);
  const r = box.getBoundingClientRect();
  return { x: Math.max(0, r.x - 16), y: Math.max(0, r.y - 16), width: r.width + 32, height: r.height + 70 };
});
await keep(page, 'studio_desktop_vorher', await listClip());

// Drag the last row to the top with the mouse (grip), then move one row up with the keyboard.
const gripAt = (id) => H((id) => {
  const g = window.__pierce('.suborder .subrow[data-id="' + id + '"] .scgrip').find((x) => x.getBoundingClientRect().width > 0);
  const r = g.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, step: g.closest('.subrow').offsetHeight + 2 };
}, id);
const last = rows0[rows0.length - 1];
const g = await gripAt(last);
await page.mouse.move(g.x, g.y);
await page.mouse.down();
for (let i = 1; i <= 10; i++) await page.mouse.move(g.x, g.y - (g.step * (rows0.length - 1) * i) / 10);
await page.mouse.up();
await page.waitForTimeout(600);
const rows1 = await H(() => [...window.__pierce('.suborder')[0].querySelectorAll('.subrow')].map((r) => r.dataset.id));
await check('Studio: dragged row is now first', rows1[0] === last && rows1.length === rows0.length, rows1);
const third = rows1[2];
await H((id) => window.__pierce('.suborder .subrow[data-id="' + id + '"] .scgrip')[0].focus(), third);
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(400);
const rows2 = await H(() => [...window.__pierce('.suborder')[0].querySelectorAll('.subrow')].map((r) => r.dataset.id));
await check('Studio: arrow up moves the focused row', rows2[1] === third, rows2);
const focusKept = await H(() => { const a = window.__panel().shadowRoot.activeElement; return a && a.closest('.subrow') ? a.closest('.subrow').dataset.id : null; });
await check('Studio: focus stays on the moved row', focusKept === third, focusKept);
const resetShown = await H(() => !window.__pierce('.suborder .subreset')[0].hidden);
await check('Studio: "Reset" appears with an own order', resetShown);
await keep(page, 'studio_desktop_nachher', await listClip());
const want = rows2;
const saved = await H(async () => {
  const p = window.__panel();
  const ok = await p._save();
  return { ok, v: p._state.compact.rooms[p._room].variables.security_sub_order };
});
await check('Studio: saved security_sub_order', saved.ok && JSON.stringify(saved.v) === JSON.stringify(want), { saved, want });
const mob = await H(async (u) => {
  const h = document.querySelector('home-assistant').hass;
  const c = await h.callWS({ type: 'lovelace/config', url_path: u });
  const hits = [];
  JSON.stringify(c, (k, v) => { if (k === 'security_sub_order') hits.push(v); return v; });
  return hits;
}, dash.phone.url);
await check('phone dashboard got the order (mirror)', mob.some((v) => JSON.stringify(v) === JSON.stringify(want)), mob);

// Studio on a phone: the same list, for the picture.
const sp = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: true });
usePage(sp.page);
await studio(sp.page, dash.url);
await sp.page.evaluate(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals || {};
  const rooms = p._state.compact.rooms;
  p._room = Math.max(0, rooms.findIndex((r) => I.isHomeRoom ? I.isHomeRoom(r, rooms) : r === rooms[0]));
  p._sel = null; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 600));
  p._select({ group: 'badges', key: 'Security', label: 'Security' });
  await new Promise((r) => setTimeout(r, 1500));
  const box = window.__pierce('.suborder').find((x) => x.getBoundingClientRect().height > 0);
  if (box) box.scrollIntoView({ block: 'center' });
});
await sp.page.waitForTimeout(700);
const phoneRows = await sp.page.evaluate(() => { const b = window.__pierce('.suborder').find((x) => x.getBoundingClientRect().height > 0);
  return b ? [...b.querySelectorAll('.subrow')].map((r) => r.dataset.id) : null; });
await check('Studio on the phone: list in the saved order', JSON.stringify(phoneRows) === JSON.stringify(want), phoneRows);
await keep(sp.page, 'studio_handy');
usePage(page);

// ── Dashboard after saving ───────────────────────────────────────────────────
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));
await fakeStates(page, patch, { sticky: true });
await openRow(page);
const after = await deskState(page);
const follows = (got) => JSON.stringify(got) === JSON.stringify(want.filter((k) => got.includes(k)));
await check('desktop: sub-row follows the order', follows(after.row) && JSON.stringify(after.row) !== JSON.stringify(before.row), { before: before.row, after: after.row, want });
// Owner (13.11.2026): with several findings the most important one leads in words (rank: jammed, open, tilted,
// offline; within a rank the Studio's order), the icons after it follow the Studio's order.
const lead = after.items[0] || {};
const top = Math.min(...after.items.map((x) => x.rank));
const leadWant = after.items.filter((x) => x.rank === top).map((x) => x.kind)
  .sort((a, b) => (want.indexOf(a) < 0 ? 99 : want.indexOf(a)) - (want.indexOf(b) < 0 ? 99 : want.indexOf(b)))[0];
const rest = after.items.slice(1).map((x) => x.kind).filter((k, i, a) => a.indexOf(k) === i);
await check('desktop: sub-line leads with the most important finding (rank, then the order)',
  after.items.length >= 2 && lead.lead && lead.rank === top && lead.kind === leadWant, { items: after.items, want });
await check('desktop: sub-line icons after the lead follow the order', follows(rest), { before: before.sub, after: after.sub, rest, want });
await keep(page, 'nachher_desktop_badge', await headClip(page));
await shot('desktop_after');

const phoneAfter = await phoneState();
const popupKeys = keysOf(phoneAfter.rows);
await check('phone: Home sub-row follows the order', follows(phoneAfter.row), { before: phoneBefore.row, after: phoneAfter.row, want });
await check('phone: security popup rows follow the order', popupKeys.length >= 2 && follows(popupKeys),
  { before: phoneBefore.rows, after: phoneAfter.rows, want });
await keep(phone.page, 'nachher_handy_popup');
usePage(phone.page);
await shot('phone_popup_after');
usePage(page);

if (!process.env.CASORA_QA_KEEP) await restore();
await finish();

// The Studio's usual order: casoraSecSub.KEYS filtered to what is there.
function window_keys(rows) {
  const K = ['alarm', 'doors', 'windows', 'gates', 'locks', 'covers', 'cameras', 'other'];
  return (rows || []).slice().sort((a, b) => (K.indexOf(a) < 0 ? 99 : K.indexOf(a)) - (K.indexOf(b) < 0 ? 99 : K.indexOf(b)));
}
