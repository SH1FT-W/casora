// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/35-phone-hub.js
// Owner (27.10.2026): with the Studio option „Jalousien anzeigen“ on (climate_blinds, default) the Klima badge's sub-row
// on Home has a sub-badge „Jalousien“ like the one under Sicherheit (blinds glyph, open count) that opens the blinds
// group popup (two columns, ≥ 880 wide on the desktop). Option off → no such sub-badge. Desktop 1440; option only in
// the browser (setConfig of the Home header).
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.url + '/home', 3);
const at = (t) => page.evaluate((t) => { const b = window.__pierce('button-card').find((x) => [].concat(x._config?.template || []).includes(t) && x.getBoundingClientRect().width > 20);
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: b.shadowRoot.textContent.replace(/\s+/g, ' ') }; }, t);
const covers = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((k) => k.startsWith('cover.')).length);
await need('blinds in the test house', covers > 0, covers);
const kl = await at('casora_badge_climate_group');
await need('Klima badge on Home', kl);
await page.mouse.click(kl.x, kl.y);
await page.waitForTimeout(2500);
const sub = await at('casora_badge_climate_covers');
// Last in the sub-row: right of every other visible climate sub-badge in the same row.
const order = await page.evaluate(() => { const vis = window.__pierce('button-card').filter((x) => /casora_badge_(temp|humidity|air_quality|climate_covers)\b/.test([].concat(x._config?.template || []).join(',')) && x.getBoundingClientRect().width > 20);
  const me = vis.find((x) => [].concat(x._config.template).includes('casora_badge_climate_covers')); if (!me) return null;
  const r = me.getBoundingClientRect(); return vis.filter((x) => x !== me && Math.abs(x.getBoundingClientRect().top - r.top) < 8).every((x) => x.getBoundingClientRect().left < r.left); });
await check('„Jalousien“ is the last sub-badge of the Klima row', order === true, order);
await check('Klima sub-row: sub-badge „Jalousien“ with its state', sub && /Jalousien/.test(sub.text) && /(geöffnet|geschlossen)/i.test(sub.text), sub);
if (sub) {
  await page.mouse.click(sub.x, sub.y);
  await page.waitForTimeout(2500);
  const pop = await page.evaluate(() => { const p = window.__pierce('casora-popup')[0]; const s = window.casoraPopup.surface;
    return { title: p.shadowRoot.querySelector('.header-title').textContent.trim(), w: s ? Math.round(s.getBoundingClientRect().width) : 0 }; });
  await check('the sub-badge opens the blinds popup, two columns wide', pop.title === 'Jalousien' && pop.w >= 880, pop);
  await page.evaluate(() => window.casoraPopup.close());
  await page.waitForTimeout(900);
}
// Option off.
await page.evaluate(() => { const el = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_room') && b.getBoundingClientRect().width > 0);
  const cfg = JSON.parse(JSON.stringify(el._config)); cfg.variables = { ...(cfg.variables || {}), climate_blinds: false };
  el.setConfig(cfg); el.hass = document.querySelector('home-assistant').hass; });
await page.waitForTimeout(2500);
const kl2 = await at('casora_badge_climate_group');
const rowOpen = await page.evaluate(() => document.querySelector('home-assistant').hass.states['input_select.casora_expanded_row']?.state);
if (kl2 && rowOpen !== 'climate') { await page.mouse.click(kl2.x, kl2.y); await page.waitForTimeout(2500); }
await check('option „Jalousien anzeigen“ off → no sub-badge „Jalousien“', !(await at('casora_badge_climate_covers')));
await finish();
