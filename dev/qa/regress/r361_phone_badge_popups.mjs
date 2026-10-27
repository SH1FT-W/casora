// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/35-phone-hub.js
// Owner (27.10.2026, 26.10.63): on the phone a tap on a Home badge filtered the start page; since #80 the light badge
// opened its popup – now every badge does. Security and Climate open a hub popup with the sub-badges and tiles the
// filter page showed, as rows; a row opens that badge's or tile's own popup as a sub page (‹ back to the hub) and
// never switches the device. Lights and Energy open their existing popups. The page is never filtered.
// Desktop: the security badge keeps its row (no hub).
import { open, casoraDashboard, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);

const badgeAt = (page, t) => page.evaluate((t) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t) && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, t);
const popup = (page) => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  const pop = window.__pierce('casora-popup')[0];
  const sr = pop && pop.shadowRoot;
  const back = sr && sr.querySelector('.header-back');
  return {
    open: !!s,
    title: sr ? String((sr.querySelector('.header-title') || {}).textContent || '').trim() : '',
    back: !!(back && !back.hidden && back.getBoundingClientRect().width > 0),
    rows: s ? window.__pierce('.hui-row', s).filter((n) => n.getBoundingClientRect().height > 0).map((n) => n.textContent.replace(/\s+/g, ' ').trim()) : [],
    filter: window._casoraFilter && window._casoraFilter.get ? window._casoraFilter.get() : null,
  };
});
const close = async (page) => { await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(900); };
const tap = async (page, p) => { await page.waitForTimeout(250); await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(2500); };
const rowAt = (page, label) => page.evaluate((label) => {
  const s = window.casoraPopup.surface;
  const r = window.__pierce('.hui-row', s).find((n) => n.textContent.replace(/\s+/g, ' ').trim().startsWith(label));
  if (!r) return null;
  r.scrollIntoView({ block: 'center' });
  const q = r.getBoundingClientRect();
  return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
}, label);
const climateStates = (page) => page.evaluate(() => { const st = document.querySelector('home-assistant').hass.states;
  return Object.keys(st).filter((k) => /^(climate|fan|humidifier|cover)\./.test(k)).map((k) => k + '=' + st[k].state).join(','); });

const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true, theme: 'Casora' });
usePage(ph.page);
const page = ph.page;
await dashboard(page, dash.phone.url + '/home', 2);
await page.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));

// Security: hub with the sub-badges as rows, a row opens its popup as a sub page, ‹ comes back.
const sec = await badgeAt(page, 'casora_badge_security_group');
await need('phone Home has the security badge', sec);
await tap(page, sec);
let p = await popup(page);
await check('Security: the tap opens a popup „Sicherheit“', p.open && p.title === 'Sicherheit', p);
await check('Security: the start page is not filtered', p.filter === 'all', p.filter);
await check('Security: the sub-badges are rows (Schlösser, Türen, Fenster …)', p.rows.some((r) => /^Schlösser/.test(r)) && p.rows.some((r) => /^(Türen|Fenster)/.test(r)), p.rows);
// What needs attention shows it on the icon (owner, 27.10.2026): an unlocked lock → warning tone, locked → calm.
const locks = await page.evaluate(() => { const r = (window._casoraPhoneHub.last.security || {}).chips || [];
  const c = r.find((x) => x.title === 'Schlösser'); return c ? c.ids.filter((id) => id.startsWith('lock.')) : []; });
await need('Security: the locks row has locks', locks.length, locks);
const rowTone = () => page.evaluate(() => { const s = window.casoraPopup.surface;
  const r = window.__pierce('.hui-row', s).find((n) => /^Schlösser/.test(n.textContent.trim()));
  return r ? (/casora-security-(warn|alarm)|--casora-color-orange|255, ?159|#FF9F0A/i.test(r.innerHTML) ? 'warn' : 'calm') : null; });
await fakeStates(page, Object.fromEntries(locks.map((id) => [id, { state: 'unlocked' }])), { sticky: true });
await page.waitForTimeout(1800);
await check('Security: unlocked lock → „Schlösser“ row in the warning tone', (await rowTone()) === 'warn', await rowTone());
await fakeStates(page, Object.fromEntries(locks.map((id) => [id, { state: 'locked' }])), { sticky: true });
await page.waitForTimeout(1800);
await check('Security: locked → „Schlösser“ row calm', (await rowTone()) === 'calm', await rowTone());
const lock = await rowAt(page, 'Schlösser');
await tap(page, lock);
p = await popup(page);
await check('Security: „Schlösser“ opens the locks popup as a sub page with ‹', p.open && p.title === 'Schlösser' && p.back, p);
const back = await page.evaluate(() => { const b = window.__pierce('casora-popup')[0].shadowRoot.querySelector('.header-back'); const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
await tap(page, back);
p = await popup(page);
await check('Security: ‹ goes back to the hub', p.open && p.title === 'Sicherheit', p);
await close(page);

// Climate: hub with readings and devices; a device row opens the device's popup and switches nothing.
const cli = await badgeAt(page, 'casora_badge_climate_group');
await need('phone Home has the climate badge', cli);
await tap(page, cli);
p = await popup(page);
await check('Climate: the tap opens a popup „Klima“', p.open && p.title === 'Klima', p);
await check('Climate: readings as rows (Temperatur …)', p.rows.some((r) => /^Temperatur/.test(r)), p.rows);
await check('Climate: no blinds among the devices (owner, 27.10.2026)', !p.rows.some((r) => /^(Jalousie|Rollo|Testjalousie)/.test(r)), p.rows);
// A device row: the rows after the sub-badges (whatever the house calls its devices).
const nChips = await page.evaluate(() => ((window._casoraPhoneHub.last.climate || {}).chips || []).length);
const dev = p.rows[nChips];
await need('Climate: a device row', dev, p.rows);
const s0 = await climateStates(page);
await tap(page, await rowAt(page, dev));
p = await popup(page);
await check('Climate: a device row opens that device\'s popup as a sub page', p.open && p.title !== 'Klima' && p.back, p);
await page.waitForTimeout(1500);
await check('Climate: opening it switched nothing', (await climateStates(page)) === s0, { s0, s1: await climateStates(page) });
await close(page);

// #80 special case: picked rooms plus an HA group – the light popup shows the picked rooms only („N Räumen“).
const picked = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_mobile_filter_badges'));
  const v = (b && b._config.variables) || {}; const st = document.querySelector('home-assistant').hass.states;
  const ids = []; for (let i = 1; i <= 10; i++) { const x = v['light_entity_' + i]; if (typeof x === 'string' && x.startsWith('light.') && st[x]) ids.push(x); }
  return { n: ids.length, groups: ids.filter((x) => Array.isArray(st[x].attributes.entity_id)).length, group: v.light_group_entity || null }; });
if (picked.n > 1 && picked.groups) {
  const lb = await badgeAt(page, 'casora_badge_light_group');
  await tap(page, lb);
  const head = await page.evaluate(() => { const pop = window.__pierce('casora-popup')[0]; const s = window.casoraPopup.surface;
    return (pop && pop.shadowRoot ? pop.shadowRoot.textContent : '') + ' ' + (s ? s.textContent : ''); });
  await check('#80: picked rooms (with an HA group beside them) → „von ' + picked.n + ' Räumen“', new RegExp('von ' + picked.n + ' Räumen').test(head.replace(/\s+/g, ' ')), { picked, head: head.replace(/\s+/g, ' ').slice(0, 200) });
  await close(page);
}

// Lights and Energy: their own popups, no filter.
for (const [t, title] of [['casora_badge_light_group', 'Beleuchtung'], ['casora_badge_energy_group', null]]) {
  const b = await badgeAt(page, t);
  if (!b) continue;
  await tap(page, b);
  p = await popup(page);
  await check(t + ': opens its popup' + (title ? ' „' + title + '“' : ''), p.open && (!title || p.title === title), p);
  await check(t + ': the start page is not filtered', p.filter === 'all', p.filter);
  await close(page);
}
await ph.browser.close();

// Desktop: the security badge keeps its own behaviour (no hub).
const dk = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(dk.page);
await dashboard(dk.page, dash.url + '/home', 3);
const dsec = await badgeAt(dk.page, 'casora_badge_security_group');
if (dsec) {
  await dk.page.mouse.click(dsec.x, dsec.y);
  await dk.page.waitForTimeout(2000);
  const d = await popup(dk.page);
  await check('Desktop: the security badge opens no hub', !(d.open && d.title === 'Sicherheit' && d.rows.some((r) => /^Schlösser/.test(r))), d);
}
await finish();
