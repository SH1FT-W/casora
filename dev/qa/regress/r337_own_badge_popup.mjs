// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/29-eigene-badges.js custom_components/casora/scripts/local/28-free-tile.js custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-popups.js
// Wish (issue #60): an own popup for own badges, so a tile is not needed for the information. New: the tap
// "Own popup" composes the badge's popup in the Studio exactly like the Universal tile's (values, 24 h history,
// controls, own cards). The test builds it in the Studio by hand – own badge from a switch of the house, tap
// "Own popup", two value rows (one with an own label), history of a temperature sensor, one own Markdown card –
// saves, then taps the badge on the desktop room and on the phone room page. Expected: the popup carries the
// badge's name, the state line, a casora-chart, no own Aus/An (header switch, blueprint v2), "Werte" with both rows and the own card;
// desktop two columns, phone one. Entities come from the house at run time, nothing is switched. The dashboards
// are restored at the end. Pictures: CASORA_BP60_BILDER=<folder> (Studio editor, popup desktop dark, phone).
import fs from 'node:fs';
import { open, usePage, studio, casoraDashboard, dashboard, stable, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_BP60_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

// ── Entities of the house ──
const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const live = (s) => s && !['unavailable', 'unknown', ''].includes(String(s.state));
const fname = (s) => String((s.attributes || {}).friendly_name || s.entity_id);
const pick = (f) => S.filter((s) => live(s) && f(s)).sort((a, b) => fname(a).localeCompare(fname(b)))[0];
const sw = S.filter((s) => s.entity_id.startsWith('switch.') && ['on', 'off'].includes(s.state) && !/kindersicherung|childlock|display|indicator|protect|led/i.test(fname(s) + s.entity_id))
  .sort((a, b) => fname(a).localeCompare(fname(b)))[0];
const temp = pick((s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'temperature' && isFinite(parseFloat(s.state)));
const hum = pick((s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'humidity' && isFinite(parseFloat(s.state)));
await need('switch, temperature and humidity sensor in the house', sw && temp && hum, { sw: !!sw, temp: !!temp, hum: !!hum });
const WANT = sw.state === 'on' ? 'An' : 'Aus';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const d0 = await c.cmd({ type: 'lovelace/config', url_path: dash.url });
const m0 = await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url });
c.close();
let restored = false;
atFinish(async () => {
  if (restored) return;
  restored = true;
  const c2 = await ws();
  await c2.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: d0 });
  await c2.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config: m0 });
  c2.close();
});

// ── Studio: build the badge by hand ──
const s = await open({ width: 1440, height: 1000, dark: true });
usePage(s.page);
const pg = s.page;
await studio(pg, dash.url);
const room = await pg.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals || {};
  const rooms = p._state.compact.rooms;
  const i = rooms.findIndex((r, k) => k > 0 && !(I.isHomeRoom && I.isHomeRoom(r)) && r.path);
  if (i < 0) return null;
  p._room = i;
  if (p._renderTabs) p._renderTabs();
  p._bOpen = true;
  p._select({ group: 'badges', key: 'Own badges', label: 'Own badges' });
  return { i, path: rooms[i].path, name: rooms[i].name };
});
await need('a room besides Home', room);
const H = (fn, arg) => pg.evaluate(fn, arg);
const boxes = () => window.__pierce('.ownbadge').length;
const n0 = await stable(pg, () => (window.__pierce('.scadd.fieldadd').some((b) => /Badge/.test(b.textContent)) ? window.__pierce('.ownbadge').length : null),
  null, { until: (v) => v !== null && v !== undefined });
await need('Studio shows the section „Own badges“', n0 !== null && n0 !== undefined, n0);
// Marks the n-th element of a query inside the last badge box so Playwright can click it.
const mark = (sel, labelRe, tag) => H(([sel, src, tag]) => {
  const box = window.__pierce('.ownbadge').pop();
  if (!box) return false;
  window.__pierce('[data-qa60]').forEach((x) => x.removeAttribute('data-qa60'));
  const rows = [...box.querySelectorAll('.row')].filter((r) => { const l = r.querySelector(':scope > label'); return l && new RegExp(src).test(l.textContent.trim()); });
  const el = rows.length ? rows[0].querySelector(sel) : null;
  if (!el) return false;
  el.setAttribute('data-qa60', tag);
  el.scrollIntoView({ block: 'center' });
  return true;
}, [sel, labelRe, tag]);
const opt = async (re) => {
  await pg.waitForTimeout(350);
  // The option's label without the tick (".lbl" in menus, the whole text in combos).
  const ok = await H((src) => {
    window.__pierce('[data-qa60="o"]').forEach((x) => x.removeAttribute('data-qa60'));
    const text = (x) => ((x.querySelector('.lbl') || x).textContent || '').replace(/\s+/g, ' ').trim();
    const o = window.__pierce('.combo-menu .combo-opt').filter((x) => x.getClientRects().length && new RegExp(src).test(text(x)));
    if (!o.length) return window.__pierce('.combo-menu .combo-opt').filter((x) => x.getClientRects().length).map(text).slice(0, 12).join(' | ') || false;
    o[0].setAttribute('data-qa60', 'o');
    return true;
  }, re);
  if (ok !== true) { console.log('  info   options: ' + ok); return false; }
  await pg.locator('[data-qa60="o"]').click();
  await pg.waitForTimeout(400);
  return true;
};
// Combo in the row labelled labelRe: type q, take the option matching re.
const combo = async (labelRe, q, re) => {
  // An open menu covers the rows: close it first (the form may redraw, so mark afterwards).
  if (await H(() => window.__pierce('.combo-menu').some((m) => m.getClientRects().length))) {
    await pg.keyboard.press('Escape');
    await pg.waitForTimeout(400);
  }
  if (!(await mark('input', labelRe, 'c'))) return false;
  await pg.locator('[data-qa60="c"]').click();
  if (q) await pg.keyboard.type(q, { delay: 15 });
  return opt(re);
};
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await H(() => window.__pierce('.scadd.fieldadd').find((b) => /Badge/.test(b.textContent)).click());
await check('Studio: „Add badge“ offers „From a device“', await opt('^(Von einem Gerät|From a device)$'));
await stable(pg, boxes, null, { until: (v) => v === n0 + 1 });
await mark('input', '^Name$', 'n');
await pg.locator('[data-qa60="n"]').fill('QA Pumpe');
await pg.locator('[data-qa60="n"]').dispatchEvent('change');
await pg.waitForTimeout(500);
await check('Studio: device of the badge picked', await combo('^(Gerät|Device)$', fname(sw), '.'));
await check('Studio: tap „Eigenes Popup“ chosen', await combo('^(Beim Antippen|On tap)$', '', '^(Eigenes Popup|Own popup)$'));
// Browser side: labels and subheads of the last badge box.
const rowsOf = () => { const box = window.__pierce('.ownbadge').pop(); return box ? [...box.querySelectorAll('.row > label, .subhead')].map((l) => l.textContent.trim()) : []; };
const r1 = (await stable(pg, rowsOf, null, { until: (v) => v.some((t) => /^(Werte|Values)$/.test(t)) })) || (await H(rowsOf));
await check('Studio: the popup sections of the Universal tile appear', ['Werte|Values', 'Verlauf \\(24 Std\\.\\)|History \\(24 h\\)', 'Bedienung|Controls', 'Eigene Karten im Popup|Own cards in popup']
  .every((re) => r1.some((t) => new RegExp('^(' + re + ')$').test(t))), r1);
await check('Studio: value 1 added', await combo('^(Werte|Values)$', fname(temp), '.'));
await check('Studio: value 2 added', await combo('^(Werte|Values)$', fname(hum), '.'));
await stable(pg, rowsOf, null, { until: (v) => v.some((t) => t === fname(temp)) });
await mark('input', '^' + esc(fname(temp)) + '$', 'l');
await pg.locator('[data-qa60="l"]').fill('QA Innen');
await pg.locator('[data-qa60="l"]').dispatchEvent('change');
await pg.waitForTimeout(500);
await mark('button.sw', '^(Verlauf \\(24 Std\\.\\)|History \\(24 h\\))$', 'h');
await pg.locator('[data-qa60="h"]').click();
await stable(pg, rowsOf, null, { until: (v) => v.some((t) => /^(Verlauf von|History of)$/.test(t)) });
await check('Studio: history of the temperature sensor', await combo('^(Verlauf von|History of)$', fname(temp), '.'));
// Own card through the tiles' card sheet.
await mark('button', '^(Eigene Karten im Popup|Own cards in popup)$', 'k');
await pg.locator('[data-qa60="k"]').click();
await pg.waitForTimeout(600);
const ta = pg.locator('.askpane textarea').first();
await ta.fill('type: markdown\ncontent: QA Karte im Badge-Popup');
await pg.waitForTimeout(400);
await H(() => { const b = window.__pierce('.askpane button').filter((x) => /^(Hinzufügen|Add)$/.test(x.textContent.trim())).pop(); if (b) b.click(); });
await pg.waitForTimeout(800);
const stored = await H((path) => {
  const p = window.__panel();
  const r = p._state.compact.rooms.find((x) => x.path === path);
  const list = (r && r.variables.custom_badges) || [];
  return list[list.length - 1] || null;
}, room.path);
await check('Studio: the badge carries its own popup', !!stored && stored.tap === 'own_popup' && stored.entity === sw.entity_id
  && JSON.stringify((stored.popup || {}).free_values) === JSON.stringify([temp.entity_id, hum.entity_id])
  && (stored.popup.free_value_labels || {})[temp.entity_id] === 'QA Innen' && stored.popup.free_chart === true
  && stored.popup.free_chart_entity === temp.entity_id && (stored.popup.popup_extra_cards || []).length === 1, stored);
if (BILDER) {
  await H(() => { const b = window.__pierce('.ownbadge').pop(); if (b) b.scrollIntoView({ block: 'start' }); });
  await pg.waitForTimeout(500);
  const bb = await H(() => { const b = window.__pierce('.ownbadge').pop(); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: Math.min(r.height, 1000 - r.y) }; });
  await pg.screenshot({ path: BILDER + '/studio-editor.png' });
  await pg.screenshot({ path: BILDER + '/studio-editor-badge.png', clip: { x: Math.max(0, bb.x - 12), y: Math.max(0, bb.y - 12), width: bb.w + 24, height: bb.h + 12 } });
}
const saved = await H(() => window.__panel()._save());
await need('Studio saved', saved !== false, saved);
await s.browser.close();

// ── Dashboard: tap the badge ──
const POPUP = () => {
  const vis = (n) => n.getBoundingClientRect().height > 0;
  const txt = (sel) => window.__pierce(sel).filter(vis).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const box = (sel, re) => { const n = window.__pierce(sel).find((x) => re.test(x.textContent.trim()) && vis(x)); return n ? n.getBoundingClientRect() : null; };
  const pop = window.__pierce('casora-popup')[0];
  const title = pop && pop.shadowRoot ? (pop.shadowRoot.querySelector('.header-title') || {}).textContent || '' : '';
  const rows = window.__pierce('.hui-srow').filter(vis);
  const vals = box('.hui-slbl', /^Werte$/), ctl = box('.hui-slbl', /^Bedienung$/);
  return { title: title.replace(/\s+/g, ' ').trim(), line: ((window.__pierce('.hui-line')[0] || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    segs: txt('.hui-sg'), rowText: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    chart: window.__pierce('casora-chart').some(vis),
    card: window.__pierce('ha-markdown').some((m) => vis(m) && /QA Karte im Badge-Popup/.test(m.textContent || (m.shadowRoot && m.shadowRoot.textContent) || '')),
    vals: vals ? { x: vals.left, y: vals.top } : null, ctl: ctl ? { x: ctl.left, y: ctl.top } : null };
};
const badgeAt = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_popup_own_badge')
    && x.getBoundingClientRect().width > 0 && /QA Pumpe/.test(x.shadowRoot ? x.shadowRoot.textContent : ''));
  if (!b) return null;
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const run = async (tag, page, mobile, file) => {
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  const at = await stable(page, badgeAt, null, { max: 15000, until: (v) => !!v });
  await need(tag + ': own badge with own popup on the page', at);
  for (let t = 0; t < 4 && !(await offen()); t++) {
    const p = await page.evaluate(badgeAt);
    if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': tap opens the Casora popup', await offen());
  const p = await stable(page, POPUP, null, { max: 12000, until: (v) => v && v.chart && v.rowText.length >= 3 && v.card });
  await check(tag + ': title is the badge name', /QA Pumpe/.test(p.title), p.title);
  await check(tag + ': state line „' + WANT + '“', new RegExp('^' + WANT + '\\b').test(p.line), p.line);
  await check(tag + ': history chart', p.chart);
  await check(tag + ': no own Aus/An next to the header switch (blueprint v2, decision 2)', !p.ctl && !p.segs.includes('Aus') && !p.segs.includes('An'), p.segs);
  await check(tag + ': „Werte“ with the own label and the second value', !!p.vals && p.rowText.some((t) => /^QA Innen/.test(t) && /°C/.test(t))
    && p.rowText.some((t) => t.startsWith(fname(hum)) || /%/.test(t)), p.rowText);
  await check(tag + ': own Markdown card below', p.card);
  await check(tag + ': values shown (one column without controls)', !!p.vals, { vals: p.vals });
  if (BILDER) { await page.waitForTimeout(700); await page.screenshot({ path: BILDER + '/' + file }); }
};

const dk = await open({ width: 1440, height: 1000, dark: true, theme: 'Casora' });
usePage(dk.page);
await dashboard(dk.page, dash.url + '/' + room.path, 2);
await run('Desktop dark', dk.page, false, 'popup-desktop-dark.png');

const ph = await open({ width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
usePage(ph.page);
await dashboard(ph.page, dash.phone.url + '/home', 2);
await ph.page.evaluate(() => window.casoraPhoneRoom && window.casoraPhoneRoom.refresh && window.casoraPhoneRoom.refresh());
await ph.page.waitForTimeout(1500);
const key = 'room_' + String(room.name || room.path).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
await ph.page.evaluate((k) => window._casoraFilter.set(k), key);
await ph.page.waitForTimeout(1200);
await run('Phone dark', ph.page, true, 'popup-phone-dark.png');

await finish();
