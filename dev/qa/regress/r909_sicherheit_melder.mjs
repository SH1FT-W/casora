// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraSecDetectors,casoraSecCount,casoraSecuritySummary custom_components/casora/scripts/local/49-security-detectors.js custom_components/casora/scripts/local/35-phone-hub.js custom_components/casora/panel/casora-panel-personal.js dashboards/casora/button_card_templates.json#casora_badge_security_group,casora_badge_security_detectors,casora_badge_security_motion
// Issue #209: under Security only window contacts showed – smoke and water detectors and motion sensors were missing.
// Expected (owner, 18.11.2026): with the default settings a water/smoke detector that reports leads the phone's Home
// security badge in red („Wasser · <Raum>“), the badge's popup has a detectors row also when all is calm; switched
// off (security.detectors: false) nothing of it; motion (security.motion: true) counts only while nobody is home
// („Bewegung · <Raum>“). Studio › Settings › Home & devices › Security: group „Melder“ with both switches.
// Writes Casora's settings (test HA only) and restores them; detector, person and alarm states are faked in the browser.
import { open, casoraDashboard, dashboard, studio, stable, check, need, finish, usePage, atFinish, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const reg = await c.cmd({ type: 'config/entity_registry/list' });
const devs = await c.cmd({ type: 'config/device_registry/list' });
const areas = await c.cmd({ type: 'config/area_registry/list' });
const R = Object.fromEntries(reg.map((e) => [e.entity_id, e]));
const areaOf = (id) => { const e = R[id] || {}; const a = e.area_id || ((devs.find((d) => d.id === e.device_id) || {}).area_id);
  return (areas.find((x) => x.area_id === a) || {}).name || ''; };
const plain = (id) => { const e = R[id] || {}; return !e.entity_category && !e.hidden_by && !e.disabled_by; };
const of = (dc) => S.filter((s) => s.entity_id.startsWith('binary_sensor.') && s.attributes.device_class === dc && plain(s.entity_id) && areaOf(s.entity_id))
  .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
const water = of('moisture')[0];
await need('a water detector with an area in the test house', !!water, of('moisture').map((s) => s.entity_id));
const WATER = water.entity_id, WAREA = areaOf(WATER);
const motion = S.filter((s) => s.entity_id.startsWith('binary_sensor.') && /^(motion|occupancy)$/.test(s.attributes.device_class || '')
  && s.state === 'off' && plain(s.entity_id) && areaOf(s.entity_id))
  .find((s) => !reg.some((e) => e.device_id && e.device_id === (R[s.entity_id] || {}).device_id && /^(camera|device_tracker)\./.test(e.entity_id)));
await need('a motion sensor with an area', !!motion);
const MOTION = motion.entity_id, MAREA = areaOf(MOTION);
const AWAY = Object.fromEntries(S.filter((s) => /^(person|alarm_control_panel)\./.test(s.entity_id))
  .map((s) => [s.entity_id, { state: s.entity_id.startsWith('person.') ? 'not_home' : 'armed_away' }]));
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
const put = async (patch) => {
  const k = await ws();
  const sec = { ...((before || {}).security || {}) };
  delete sec.detectors; delete sec.motion; delete sec.smoke_detectors; delete sec.water_detectors; delete sec.detectors_exclude;
  await k.cmd({ type: 'casora/settings/set', settings: { ...(before || {}), security: { ...sec, ...patch } } });
  k.close();
};
await put({});
c.close();

const badge = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_security_group') && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  const card = b.shadowRoot.querySelector('ha-card');
  const lead = b.shadowRoot.querySelector('.cs-sum-lead');
  return { sub: ((b.shadowRoot.querySelector('.badge-sub') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    lead: lead ? lead.textContent.trim() : null,
    color: card ? getComputedStyle(card).getPropertyValue('--casora-badge-icon-color').trim() : '',
    alarm: card ? getComputedStyle(card).getPropertyValue('--casora-security-alarm-color').trim() : '' };
};
const popupRows = (page) => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  return s ? window.__pierce('.hui-row', s).filter((n) => n.getBoundingClientRect().height > 0).map((n) => n.textContent.replace(/\s+/g, ' ').trim()) : [];
});
const openPopup = async (page) => {
  const p = await page.evaluate(() => {
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_security_group') && x.getBoundingClientRect().width > 20);
    b.scrollIntoView({ block: 'center', inline: 'center' });
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.touchscreen.tap(p.x, p.y);
  for (let t0 = Date.now(); Date.now() - t0 < 8000; await page.waitForTimeout(300)) if ((await popupRows(page)).length) break;
  await page.waitForTimeout(800);
  return popupRows(page);
};
const close = async (page) => { await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(900); };
const reload = async (page) => {
  await page.reload();
  await dashboard(page, dash.phone.url + '/home', 2);
  await page.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
};

const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
usePage(ph.page);
const page = ph.page;
await dashboard(page, dash.phone.url + '/home', 2);
await page.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));

// 1. Default: all dry – the popup lists the detectors anyway.
let rows = await openPopup(page);
await check('default, calm: the popup has a detectors row („… Melder“)', rows.some((r) => /^(Wassermelder|Rauchmelder|Melder)/.test(r)), rows);
await close(page);

// 2. Water reports: it leads the badge in red, with its room.
await fakeStates(page, { [WATER]: { state: 'on' } }, { sticky: true });
let b = await stable(page, badge, null, { max: 8000, until: (v) => v && /Wasser/.test(v.sub) });
await check('water: „Wasser · ' + WAREA + '“ leads the security badge', b && (b.lead || b.sub).startsWith('Wasser · ' + WAREA), b);
await check('water: the badge is red (alarm level)', b && !!b.color && (b.color === b.alarm || /security-alarm-color|D35A4E/i.test(b.color)), b && { color: b.color, alarm: b.alarm });
rows = await openPopup(page);
await check('water: the detectors row says it („Wasser · …“)', rows.some((r) => /^(Wassermelder|Melder).*Wasser · /.test(r)), rows);
await close(page);

// 3. Switched off: as before #209 (the common key of #209 still switches smoke and water off, #220).
await put({ detectors: false });
await reload(page);
await fakeStates(page, { [WATER]: { state: 'on' } }, { sticky: true });
b = await stable(page, badge, null, { max: 6000 });
await check('detectors off: the badge does not name the water', b && !/Wasser/.test(b.sub), b);
rows = await openPopup(page);
await check('detectors off: no detectors row', !rows.some((r) => /^(Wassermelder|Rauchmelder|Melder)/.test(r)), rows);
await close(page);

// 4. Motion on: counts only while nobody is home.
await put({ motion: true });
await reload(page);
await fakeStates(page, { [WATER]: { state: 'off' }, [MOTION]: { state: 'on' } }, { sticky: true });
b = await stable(page, badge, null, { max: 6000 });
await check('motion at home: no finding', b && !/Bewegung/.test(b.sub), b);
await fakeStates(page, AWAY, { sticky: true });
b = await stable(page, badge, null, { max: 8000, until: (v) => v && /Bewegung/.test(v.sub) });
await check('motion while away: „Bewegung · ' + MAREA + '“', b && /Bewegung( · | erkannt)/.test(b.sub), b);
rows = await openPopup(page);
await check('motion: the popup has a „Bewegung“ row', rows.some((r) => /^Bewegung(Erkannt|$| )/.test(r)), rows);
await close(page);
await ph.browser.close();

// 5. Studio: Settings › Home & devices › Security, group „Melder“ with its switches (smoke and water apart since #220,
// both on by default; motion off).
await put({});
const dk = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
usePage(dk.page);
await studio(dk.page, dash.url);
for (let i = 0; i < 6; i++) {
  const gone = await dk.page.evaluate(() => { const h = document.querySelector('[data-casora-welcome]'); const b = h && h.shadowRoot && h.shadowRoot.querySelector('.cw-go'); if (b) b.click(); return !h; });
  if (gone) break;
  await dk.page.waitForTimeout(500);
}
await dk.page.evaluate(() => window.__panel()._bOpenSettings && window.__panel()._bOpenSettings());
await dk.page.waitForTimeout(1000);
await dk.page.locator('.cs-hubsearch input').fill('Rauchmelder');
await dk.page.waitForTimeout(500);
await dk.page.locator('.frow').filter({ has: dk.page.locator('b', { hasText: /^Sicherheit$/ }) }).first().click();
await dk.page.waitForTimeout(2200);
const sw = await dk.page.evaluate(() => {
  const g = window.__panel().shadowRoot.querySelector('#pane [data-pkey="security_detectors"]');
  const row = (re) => { const r = g && [...g.querySelectorAll('.frow')].find((x) => re.test((x.querySelector('b') || {}).textContent || ''));
    return r ? (r.querySelector('.sw') || {}).getAttribute?.('aria-checked') : null; };
  return { found: !!g, smoke: row(/^Rauchmelder$/), water: row(/^Wassermelder$/), motion: row(/^Bewegungsmelder/) };
});
await check('Studio: group „Melder“, smoke and water on, motion off', sw.found && sw.smoke === 'true' && sw.water === 'true' && sw.motion === 'false', sw);
await dk.browser.close();
await finish();
