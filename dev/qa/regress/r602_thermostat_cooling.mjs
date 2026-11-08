// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/31-velair.js#casoraClimateModes,casoraClimateExtras dashboards/casora/button_card_templates.json#casora_thermostat
// Issue #144: an air conditioner in the thermostat popup. A climate tile is faked in the browser with a Daikin-like
// list of modes. Expected: moons Aus, Heizen, Kühlen and „Mehr (3)“, whose menu holds the rest; below them fan, preset and swing;
// tapping a fan speed calls set_fan_mode. Nothing is switched in HA. Pictures: CASORA_R602_BILDER=<folder>.
import fs from 'node:fs';
import { open, usePage, casoraDashboard, dashboard, check, need, finish, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_R602_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const dash = await casoraDashboard((d) => !d.mobile && JSON.stringify(d.config).includes('casora_thermostat'));
await need('Casora dashboard with a thermostat', dash);

const FIND = () => { const b = window.__pierce('button-card').find((x) => { const c = x._config || {}, t = [].concat(c.template || []);
  const e = x._stateObj || (x.hass && x.hass.states[c.entity]);
  return t.includes('casora_thermostat') && !t.includes('casora_popup_fbh') && c.entity && e && !e.attributes.member_entities && x.getBoundingClientRect().width > 40; });
  return b ? b._config.entity : null; };
const key = (n) => 'room_' + String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const c = await ws();
const phone = dash.phone ? await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url }) : null;
c.close();
await need('a phone layout', phone);
const rooms = (((phone.views[0] || {}).cards || [])[1] || {}).cards.filter((x) => x && x.type === 'custom:casora-filter-overlay' && x.room);

for (const [tag, narrow] of [['desktop', false], ['phone', true]]) {
  const { page } = await open(narrow ? { width: 390, height: 844, mobile: true, dark: true, theme: 'Casora' } : { width: 1280, height: 900, dark: true, theme: 'Casora' });
  usePage(page);
  let hit = null;
  if (narrow) {
    await dashboard(page, dash.phone.url + '/' + (phone.views[0].path || '0'), 3);
    for (const room of rooms) {
      await page.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), room.filter_category || key(room.room));
      for (let i = 0; i < 6 && !hit; i++) { await page.waitForTimeout(500); hit = await page.evaluate(FIND); }
      if (hit) break;
    }
  } else {
    for (const v of (dash.config.views || []).map((x, i) => x.path || String(i))) {
      await dashboard(page, dash.url + '/' + v, 3);
      hit = await page.evaluate(FIND);
      if (hit) break;
    }
  }
  await need(tag + ': a thermostat tile', hit);
  await fakeStates(page, { [hit]: { state: 'cool', attributes: { friendly_name: 'QA Airco', hvac_modes: ['off', 'heat', 'cool', 'heat_cool', 'dry', 'fan_only'], hvac_action: 'cooling', current_temperature: 26, temperature: 22, min_temp: 7, max_temp: 35, target_temp_step: 1,
    fan_modes: ['Auto', 'Silence', '1', '2', '3', '4', '5'], fan_mode: 'Auto', preset_modes: ['none', 'away', 'eco', 'boost'], preset_mode: 'none', swing_modes: ['off', 'vertical', 'horizontal', '3d'], swing_mode: 'off', supported_features: 57 } } }, { sticky: true });
  await page.waitForTimeout(800);
  await page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => (x._config || {}).entity === id && [].concat(x._config.template || []).includes('casora_thermostat'));
    window.__calls = []; const h = document.querySelector('home-assistant').hass, o = h.callService; h.callService = function (d, s, data, t) { window.__calls.push([d, s, data, t]); return Promise.resolve(); };
    b.scrollIntoView({ block: 'center', inline: 'center' }); const c = b.shadowRoot.querySelector('ha-card'); c.click(); }, hit);
  await page.waitForTimeout(2200);
  const fit = await page.evaluate(() => window.__pierce('.hui-sg').filter((x) => ['Auto', 'Leise', '1', '2', '3', '4', '5', 'Keine', 'Abwesend', 'Eco', 'Boost', 'Aus', 'Vertikal', 'Horizontal', '3D'].includes(x.textContent.trim()) && x.getClientRects().length)
    .filter((x) => { const r = x.getBoundingClientRect(); const g = document.createRange(); g.selectNodeContents(x); const t = g.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1 || t.left < r.left || t.right > r.right; }).map((x) => x.textContent.trim()));
  const seen = await page.evaluate(() => ({ text: window.__pierce('.hui-moon, [class*="moon"]').map((m) => m.textContent.trim()).filter(Boolean), segs: window.__pierce('.hui-sg').map((x) => x.textContent.trim()) }));
  if (BILDER) await page.screenshot({ path: `${BILDER}/${tag.replace(' ', '-')}.png`, fullPage: false });
  const moons = seen.text.join(' | ');
  await check(tag + ': every choice fits', fit.length === 0, fit);
  await check(tag + ': moons offer cooling', /Kühlen/.test(moons) && /Heizen/.test(moons) && /Mehr \(3\)/.test(moons), seen.text);
  for (const w of ['Leise', 'Boost', '3D']) await check(tag + ': below the dial ' + w, seen.segs.includes(w), seen.segs);
  const tapped = await page.evaluate(() => { const s = window.__pierce('.hui-sg').find((x) => x.textContent.trim() === 'Leise'); s.click(); return !!s; });
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => window.__calls);
  await check(tag + ': a fan speed goes to set_fan_mode', tapped && calls.some((c) => c[1] === 'set_fan_mode' && c[2].fan_mode === 'Silence'), calls);
  await page.close();
}
await finish();
