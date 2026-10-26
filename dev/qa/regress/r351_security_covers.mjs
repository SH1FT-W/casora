// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/34-security-covers.js custom_components/casora/settings.py custom_components/casora/panel/casora-panel-personal.js tools/phone_room_badges.py
// Issue #76 (wish): "in the evening and at night see at a glance whether every security-relevant cover is closed,
// with a choice of which covers count." Settings › Home & Devices › "Sicherheit: Rollos" picks the covers and
// "Nur abends und nachts" (on by default). Expected on Home: in the expanded security row a sub-badge "Rollos ·
// N offen" (only at night and only with an open picked cover), the security badge's summary line with a cover icon and
// the number, the badge not secure. Tap → popup "Rollos": "Offen" first with „Schließen" per cover and „Alle schließen",
// then "Geschlossen". By day (sun above the horizon) nothing shows. Nothing picked: nothing changes. Phone Home the same.
// Studio: the picker lists the covers of the house with check marks, the search finds it by "Rollladen".
// Writes Casora's settings (security.covers, test HA only) and restores them; cover and sun states are faked in the
// browser only, service calls are intercepted. Pictures: CASORA_R351_BILDER=<folder>.
import fs from 'node:fs';
import { open, casoraDashboard, dashboard, studio, stable, check, need, finish, usePage, atFinish, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_R351_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

// ── Covers of the house (no garage doors/gates, which count as gates already) ──
const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const covers = S.filter((s) => s.entity_id.startsWith('cover.') && !['garage', 'gate', 'door'].includes(String(s.attributes.device_class || '')))
  .sort((a, b) => a.entity_id.localeCompare(b.entity_id)).slice(0, 4);
await need('four covers in the test house', covers.length === 4, covers.map((s) => s.entity_id));
const IDS = covers.map((s) => s.entity_id);
const NAME = ['QA Rollo Terrasse', 'QA Rollo Küche', 'QA Rollo Schlafzimmer', 'QA Rollo Büro'];

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);

// ── Settings: pick the four covers (the integration has to keep the section "security") ──
const r0 = await c.cmd({ type: 'casora/settings/get' });
const before = r0.stored ? r0.settings : null;
let restored = false;
atFinish(async () => {
  if (restored) return;
  restored = true;
  const c2 = await ws();
  await c2.cmd({ type: 'casora/settings/set', settings: before || {} });
  c2.close();
});
await c.cmd({ type: 'casora/settings/set', settings: { ...(before || {}), security: { covers: IDS } } });
const r1 = await c.cmd({ type: 'casora/settings/get' });
await check('integration stores security.covers', JSON.stringify((r1.settings.security || {}).covers) === JSON.stringify(IDS), r1.settings.security);
c.close();

const now = new Date().toISOString();
const cov = (i, state, pos) => ({ [IDS[i]]: { state, attributes: { friendly_name: NAME[i], current_position: pos, device_class: 'shutter', supported_features: 15 }, last_changed: now } });
const NIGHT = { 'sun.sun': { state: 'below_horizon', attributes: {} }, ...cov(0, 'open', 100), ...cov(1, 'open', 40), ...cov(2, 'closed', 0), ...cov(3, 'closed', 0) };
const DAY = { 'sun.sun': { state: 'above_horizon', attributes: {} } };

// ── Browser helpers ──
const look = (tpl) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(tpl) && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  const sub = (b.shadowRoot && b.shadowRoot.querySelector('.badge-sub')) || null;
  const title = ((b.shadowRoot && b.shadowRoot.querySelector('.badge-title')) || {}).textContent || '';
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, title: title.trim(), sub: sub ? sub.textContent.replace(/\s+/g, ' ').trim() : '',
    items: sub ? [...sub.querySelectorAll('.cs-sum-item')].map((n) => n.getAttribute('aria-label') || n.textContent.trim()) : [],
    icon: sub ? sub.innerHTML.includes('cover_open') : false };
};
const POPUP = () => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const vis = (n) => n.getBoundingClientRect().height > 0;
  const pop = window.__pierce('casora-popup')[0];
  const title = pop && pop.shadowRoot ? (pop.shadowRoot.querySelector('.header-title') || {}).textContent || '' : '';
  const rows = window.__pierce('.hui-row', s).filter(vis).map((r) => r.textContent.replace(/\s+/g, ' ').trim());
  const labels = window.__pierce('*', s).filter((n) => vis(n) && !n.children.length).map((n) => n.textContent.trim()).filter(Boolean);
  const text = window.__pierce('.hui-line', s).filter(vis).map((n) => n.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
  return { title: title.replace(/\s+/g, ' ').trim(), rows, labels, text };
};
const offen = (page) => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
const shoot = async (page, file) => { if (BILDER) { await page.waitForTimeout(800); await page.screenshot({ path: BILDER + '/' + file }); } };
const stub = (page) => page.evaluate(() => {
  window.__qaCalls = window.__qaCalls || [];
  document.querySelector('home-assistant').hass.callService = (d, s, data) => { window.__qaCalls.push([d, s, data]); return Promise.resolve(); };
});

const run = async (tag, page, mobile, pre) => {
  const tap = async (p) => { if (mobile) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y); };
  // A sticky patch replaces the one before: keep every faked state in one patch.
  let cur = {};
  const fake = (patch) => { cur = { ...cur, ...patch }; return fakeStates(page, cur, { sticky: true }); };
  // Night, two open (one at 40 %), two closed; the security row open.
  await fake(NIGHT);
  if (mobile) await page.evaluate(() => window._casoraFilter && window._casoraFilter.set && window._casoraFilter.set('security'));
  else await fake({ 'input_select.casora_expanded_row': { state: 'security', attributes: {} } });
  const g = await stable(page, look, 'casora_badge_security_group', { max: 12000, until: (v) => v && (v.icon || /Rollos offen/.test(v.sub)) });
  await check(tag + ': security badge names the open covers (icon with 2 / „2 Rollos offen“)',
    g && (g.items.includes('2 Rollos offen') || /2 Rollos offen/.test(g.sub)), g);
  const b = await stable(page, look, 'casora_badge_security_covers', { max: 12000, until: (v) => v && v.sub === '2 offen' });
  await check(tag + ': sub-badge „Rollos · 2 offen“ in the security row', b && b.title === 'Rollos' && b.sub === '2 offen', b);
  if (b) await page.evaluate(() => { const x = window.__pierce('button-card').find((y) => [].concat((y._config || {}).template || []).includes('casora_badge_security_covers') && y.getBoundingClientRect().width > 20); if (x) x.scrollIntoView({ block: 'center', inline: 'center' }); });
  await shoot(page, pre + '-1-home-night.png');

  // Tap → popup
  for (let t = 0; t < 4 && !(await offen(page)); t++) {
    const p = await page.evaluate(look, 'casora_badge_security_covers');
    if (!p) break;
    await tap(p);
    for (let w = 0; w < 20 && !(await offen(page)); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': tap opens the covers popup', await offen(page));
  let p = await stable(page, POPUP, null, { max: 10000, until: (v) => v && v.rows.length >= 4 });
  await check(tag + ': title „Rollos“', p && /^Rollos/.test(p.title), p && p.title);
  const at = (n) => (p ? p.rows.findIndex((r) => r.includes(n)) : -1);
  await check(tag + ': open ones first with „Schließen“', p && at(NAME[0]) === 0 && at(NAME[1]) === 1
    && /Schließen$/.test(p.rows[0]) && /40 % geöffnet/.test(p.rows[1]), p && p.rows);
  await check(tag + ': sections „Offen“, „Geschlossen“ and „Alle schließen“', p && ['Offen', 'Geschlossen', 'Alle schließen'].every((x) => p.labels.includes(x)), p && p.labels);
  await check(tag + ': closed ones below with „Geschlossen“', p && at(NAME[2]) > 1 && /Geschlossen$/.test(p.rows[at(NAME[2])]), p && p.rows);
  await check(tag + ': status line „2 von 4 geöffnet · Bis Sonnenaufgang“', p && /2 von 4 geöffnet/.test(p.text) && /Bis Sonnenaufgang/.test(p.text), p && p.text);
  await shoot(page, pre + '-2-popup.png');
  // „Schließen“ calls cover.close_cover for that cover; „Alle schließen“ for both open ones.
  await stub(page);
  const rowAt = await page.evaluate((n) => {
    const s = window.casoraPopup.surface;
    const r = window.__pierce('.hui-row', s).find((x) => x.textContent.includes(n) && x.getBoundingClientRect().height > 0);
    if (!r) return null;
    const q = r.getBoundingClientRect();
    return { x: q.x + q.width - 40, y: q.y + q.height / 2 };
  }, NAME[0]);
  if (rowAt) await tap(rowAt);
  await page.waitForTimeout(700);
  const allAt = await page.evaluate(() => {
    const s = window.casoraPopup.surface;
    const a = window.__pierce('.hui-ga', s).find((x) => x.textContent.trim() === 'Alle schließen' && x.getBoundingClientRect().height > 0);
    if (!a) return null;
    const q = a.getBoundingClientRect();
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  });
  if (allAt) { await page.waitForTimeout(500); await tap(allAt); }
  await page.waitForTimeout(700);
  const calls = await page.evaluate(() => window.__qaCalls || []);
  await check(tag + ': „Schließen“ → cover.close_cover for that cover', calls.some((x) => x[0] === 'cover' && x[1] === 'close_cover' && x[2].entity_id === IDS[0]), calls);
  await check(tag + ': „Alle schließen“ → cover.close_cover for both open ones', calls.some((x) => x[0] === 'cover' && x[1] === 'close_cover'
    && JSON.stringify(x[2].entity_id) === JSON.stringify([IDS[0], IDS[1]])), calls);
  // Closing while the popup is open: the cover moves to „Geschlossen“.
  await fake(cov(0, 'closed', 0));
  p = await stable(page, POPUP, null, { max: 8000, until: (v) => v && v.rows[0] && v.rows[0].includes(NAME[1]) });
  await check(tag + ': live: a closed cover leaves „Offen“', p && p.rows[0].includes(NAME[1]) && !p.labels.includes('Alle schließen'), p && p.rows);
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
  await page.waitForTimeout(900);
  const b1 = await stable(page, look, 'casora_badge_security_covers', { max: 8000, until: (v) => v && v.sub === '1 offen' });
  await check(tag + ': badge follows („1 offen“)', b1 && b1.sub === '1 offen', b1);

  // Day: nothing shows, the security badge is as before.
  await fake(DAY);
  const b2 = await stable(page, look, 'casora_badge_security_covers', { max: 8000, until: (v) => v === null });
  await check(tag + ': by day no „Rollos“ badge', b2 === null, b2);
  const g2 = await stable(page, look, 'casora_badge_security_group', { max: 8000 });
  await check(tag + ': by day no cover in the summary', g2 && !g2.icon && !/Rollo/.test(g2.sub), g2);
  await fake(NIGHT);
};

const dk = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
usePage(dk.page);
await dashboard(dk.page, dash.url + '/home', 3);
await run('Desktop', dk.page, false, 'desktop');

// ── Studio: Settings › Home & Devices › „Sicherheit: Rollos“ ──
await studio(dk.page, dash.url);
const H = (fn, a) => dk.page.evaluate(fn, a);
await H(() => window.__panel()._bOpenSettings && window.__panel()._bOpenSettings());
await dk.page.waitForTimeout(1000);
await dk.page.locator('.cs-hubsearch input').fill('Rollladen');
await dk.page.waitForTimeout(500);
const hits = await H(() => [...window.__panel().shadowRoot.querySelectorAll('#pane .frow b')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim()));
await check('Studio: search „Rollladen“ finds „Sicherheit: Rollos“', hits[0] === 'Sicherheit: Rollos', hits);
await dk.page.locator('.frow').filter({ has: dk.page.locator('b', { hasText: /^Sicherheit: Rollos$/ }) }).first().click();
await dk.page.waitForTimeout(2200);
const st = await H((ids) => {
  const r = window.__panel().shadowRoot;
  const g = r.querySelector('#pane [data-pkey="security"]');
  const rows = [...r.querySelectorAll('#pane .casora-psec-covers .frow[role="checkbox"]')];
  const box = g ? g.getBoundingClientRect() : null;
  return { group: !!g, head: g ? g.querySelector('.fhead').textContent : '', night: g ? (g.querySelector('.sw') || {}).getAttribute?.('aria-checked') : null,
    rows: rows.length, checked: rows.filter((x) => x.getAttribute('aria-checked') === 'true').length, inView: !!box && box.top < innerHeight && box.bottom > 0,
    areas: [...r.querySelectorAll('#pane .casora-psec-covers .fhead')].map((x) => x.textContent), ids };
}, IDS);
await check('Studio: group „Sicherheit: Rollos“, opened at it', st.group && st.head === 'Sicherheit: Rollos' && st.inView, st);
await check('Studio: „Nur abends und nachts“ on by default', st.night === 'true', st);
await check('Studio: covers listed by area with check marks, the four picked ones checked', st.rows >= 4 && st.checked === 4 && st.areas.length >= 1, st);
await dk.page.evaluate(() => { const r = window.__panel().shadowRoot; const g = r.querySelector('#pane [data-pkey="security"]'); if (g) g.scrollIntoView({ block: 'start' }); });
await shoot(dk.page, 'desktop-4-studio.png');
// Unpick one: check mark goes, the save bar asks to save (nothing is saved here).
await H(() => { const r = window.__panel().shadowRoot; const x = r.querySelector('#pane .casora-psec-covers .frow[aria-checked="true"]'); x.click(); });
await dk.page.waitForTimeout(600);
const after = await H(() => { const r = window.__panel().shadowRoot; return { checked: r.querySelectorAll('#pane .casora-psec-covers .frow[aria-checked="true"]').length,
  bar: !!r.querySelector('.cs-bar:not(.cs-clean)'), draft: ((window.__panel()._cs || {}).S || {}).security };
});
await check('Studio: unpicking marks it and offers saving', after.checked === 3 && after.bar && after.draft.covers.length === 3, after);
await dk.browser.close();

const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
usePage(ph.page);
await dashboard(ph.page, dash.phone.url + '/home', 2);
await run('Phone', ph.page, true, 'phone');
// Studio on the phone: the same group as a sheet.
await studio(ph.page, dash.url);
await ph.page.evaluate(() => window.__panel()._csShow('home', 'security'));
await ph.page.waitForTimeout(2500);
const phs = await ph.page.evaluate(() => {
  const r = window.__panel().shadowRoot;
  const g = [...r.querySelectorAll('[data-pkey="security"]')].find((x) => x.getClientRects().length);
  if (g) g.scrollIntoView({ block: 'start' });
  return { group: !!g, rows: r.querySelectorAll('.casora-psec-covers .frow[role="checkbox"]').length };
});
await check('Studio phone: „Sicherheit: Rollos“ with the covers', phs.group && phs.rows >= 4, phs);
await shoot(ph.page, 'phone-4-studio.png');
await ph.browser.close();

// Nothing picked: nothing changes (no badge, no cover in the summary) – desktop Home.
const c3 = await ws();
await c3.cmd({ type: 'casora/settings/set', settings: { ...(before || {}), security: { covers: [] } } });
c3.close();
const dk2 = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
usePage(dk2.page);
await dashboard(dk2.page, dash.url + '/home', 3);
await fakeStates(dk2.page, { ...NIGHT, 'input_select.casora_expanded_row': { state: 'security', attributes: {} } }, { sticky: true });
const off = await stable(dk2.page, look, 'casora_badge_security_covers', { max: 6000 });
const offG = await stable(dk2.page, look, 'casora_badge_security_group', { max: 6000 });
await check('nothing picked: no „Rollos“ badge, no cover in the summary', off === null && offG && !offG.icon, { off, offG });
await dk2.browser.close();

await finish();
