// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/34-security-covers.js#C.cfg,C.scan,C.show,C.badge custom_components/casora/panel/casora-panel-personal.js
// Issue #199 (wish, owner OK 15.11.2026): "have that badge always on the screen". Settings › Home & Devices ›
// Security › „Immer zeigen“ (off by default, stored as security.covers_always: true) keeps the sub badge „Jalousien“
// on Home by day and with every picked cover closed („Alle geschlossen“, ok colour). Security counts as before:
// by day the security badge stays secure. Without the switch: hidden by day and when all are closed (as r351).
// Writes Casora's settings (test HA only) and restores them; cover and sun states are faked in the browser only.
import { open, casoraDashboard, dashboard, studio, stable, check, need, finish, usePage, atFinish, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const covers = S.filter((s) => s.entity_id.startsWith('cover.') && !['garage', 'gate', 'door'].includes(String(s.attributes.device_class || '')))
  .sort((a, b) => a.entity_id.localeCompare(b.entity_id)).slice(0, 2);
await need('two covers in the test house', covers.length === 2, covers.map((s) => s.entity_id));
const IDS = covers.map((s) => s.entity_id);
const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);

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
const put = async (sec) => {
  const k = await ws();
  await k.cmd({ type: 'casora/settings/set', settings: { ...(before || {}), security: sec } });
  k.close();
};
await put({ covers: IDS, covers_always: true });
const r1 = await c.cmd({ type: 'casora/settings/get' });
await check('integration stores security.covers_always', (r1.settings.security || {}).covers_always === true, r1.settings.security);
c.close();

const now = new Date().toISOString();
const cov = (i, state, pos) => ({ [IDS[i]]: { state, attributes: { friendly_name: 'QA Rollo ' + i, current_position: pos, device_class: 'shutter', supported_features: 15 }, last_changed: now } });
const DAY_CLOSED = { 'sun.sun': { state: 'above_horizon', attributes: {} }, ...cov(0, 'closed', 0), ...cov(1, 'closed', 0) };
const DAY_OPEN = { ...DAY_CLOSED, ...cov(0, 'open', 100) };

const look = (tpl) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(tpl) && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  const sub = b.shadowRoot && b.shadowRoot.querySelector('.badge-sub');
  const title = ((b.shadowRoot && b.shadowRoot.querySelector('.badge-title')) || {}).textContent || '';
  const card = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
  return { title: title.trim(), sub: sub ? sub.textContent.replace(/\s+/g, ' ').trim() : '',
    color: card ? getComputedStyle(card).getPropertyValue('--casora-badge-icon-color').trim() : '',
    ok: card ? getComputedStyle(card).getPropertyValue('--casora-security-ok-color').trim() : '',
    icon: sub ? sub.innerHTML.includes('cover_open') : false };
};

const run = async (tag, page, mobile) => {
  let cur = {};
  const fake = (patch) => { cur = { ...cur, ...patch }; return fakeStates(page, cur, { sticky: true }); };
  await fake(DAY_CLOSED);
  if (mobile) await page.evaluate(() => window._casoraFilter && window._casoraFilter.set && window._casoraFilter.set('security'));
  else await fake({ 'input_select.casora_expanded_row': { state: 'security', attributes: {} } });
  const b = await stable(page, look, 'casora_badge_security_covers', { max: 12000, until: (v) => v && v.sub === 'Alle geschlossen' });
  await check(tag + ': by day, all closed: „Jalousien · Alle geschlossen“ stays', b && b.title === 'Jalousien' && b.sub === 'Alle geschlossen', b);
  await check(tag + ': ok colour, no warning', b && !!b.color && (b.color === b.ok || /security-ok-color/.test(b.color)), b && { color: b.color, ok: b.ok });
  await fake(DAY_OPEN);
  const b2 = await stable(page, look, 'casora_badge_security_covers', { max: 8000, until: (v) => v && v.sub === '1 geöffnet' });
  await check(tag + ': by day one open: „1 geöffnet“', b2 && b2.sub === '1 geöffnet', b2);
  const g = await stable(page, look, 'casora_badge_security_group', { max: 8000 });
  await check(tag + ': security badge does not count it by day', g && !g.icon && !/Jalousie/.test(g.sub), g);
  await fake(DAY_CLOSED);
};

const dk = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
usePage(dk.page);
await dashboard(dk.page, dash.url + '/home', 3);
await run('Desktop', dk.page, false);

// Studio: the switch is there and on.
await studio(dk.page, dash.url);
// The "What's new" note of a new version can lie over the Studio: close it like a person would.
for (let i = 0; i < 6; i++) {
  const gone = await dk.page.evaluate(() => { const h = document.querySelector('[data-casora-welcome]'); const b = h && h.shadowRoot && h.shadowRoot.querySelector('.cw-go'); if (b) b.click(); return !h; });
  if (gone) break;
  await dk.page.waitForTimeout(500);
}
await dk.page.evaluate(() => window.__panel()._bOpenSettings && window.__panel()._bOpenSettings());
await dk.page.waitForTimeout(1000);
await dk.page.locator('.cs-hubsearch input').fill('Rollladen');
await dk.page.waitForTimeout(500);
await dk.page.locator('.frow').filter({ has: dk.page.locator('b', { hasText: /^Sicherheit$/ }) }).first().click();
await dk.page.waitForTimeout(2200);
const sw = await dk.page.evaluate(() => {
  const g = window.__panel().shadowRoot.querySelector('#pane [data-pkey="security"]');
  const row = g && [...g.querySelectorAll('.frow')].find((x) => /^Immer zeigen/.test((x.querySelector('b') || {}).textContent || ''));
  return { found: !!row, on: row ? (row.querySelector('.sw') || {}).getAttribute?.('aria-checked') : null };
});
await check('Studio: „Immer zeigen“ under the covers, on', sw.found && sw.on === 'true', sw);
await dk.browser.close();

const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
usePage(ph.page);
await dashboard(ph.page, dash.phone.url + '/home', 2);
await run('Phone', ph.page, true);

// Without the switch: hidden by day again.
await put({ covers: IDS });
await ph.page.reload();
await dashboard(ph.page, dash.phone.url + '/home', 2);
await fakeStates(ph.page, DAY_CLOSED, { sticky: true });
await ph.page.evaluate(() => window._casoraFilter && window._casoraFilter.set && window._casoraFilter.set('security'));
const off = await stable(ph.page, look, 'casora_badge_security_covers', { max: 8000, until: (v) => v === null });
await check('Phone: switch off, by day: no „Jalousien“ badge', off === null, off);
await ph.browser.close();
await finish();
