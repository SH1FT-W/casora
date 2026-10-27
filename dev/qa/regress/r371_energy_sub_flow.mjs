// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/20-energie-fokus.js
// Owner (27.10.2026): the energy sub-popups „Haus“, „Solar“, „Netz“ and „Akku“ showed a stacked bar („Woher kommt der Strom“ /
// „Wohin geht der Solarstrom“). With the sources of the big popup's flow present they show that flow (E1,
// „Energiefluss“ as the heading above the card), else the bar stays. Desktop 1440 and tablet 1180 (the phone opens the big energy popup from its badge); the Home badge
// gets energy sub-badges only in the browser (setConfig).
import { open, casoraDashboard, dashboard, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard', dash);
for (const [tag, o] of [['Desktop', { width: 1440, height: 900, theme: 'Casora' }], ['Tablet', { width: 1180, height: 820, touch: true, theme: 'Casora' }]]) {
  const { page, browser } = await open(o);
  usePage(page);
  await dashboard(page, dash.url + '/home', 3);
  const home = await page.evaluate(() => { const el = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_room') && b.getBoundingClientRect().width > 0)
      || window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_room'));
    if (!el) return null;
    const v = el._config.variables || {}; const id = v.home_power_entity || v.energy_power_entity || v.power_entity; if (!id) return null;
    const cfg = JSON.parse(JSON.stringify(el._config)); cfg.variables.energy_entity_1 = id; cfg.variables.energy_entity_2 = id; cfg.variables.energy_popup_focus_2 = 'grid';
    cfg.variables.energy_entity_3 = id; cfg.variables.energy_popup_focus_3 = 'battery'; el.setConfig(cfg); el.hass = document.querySelector('home-assistant').hass; return id; });
  await need(tag + ': a house power sensor on Home', home);
  await page.waitForTimeout(2000);
  const tapAt = async (q) => { if (o.touch) await page.touchscreen.tap(q.x, q.y); else await page.mouse.click(q.x, q.y); await page.waitForTimeout(2800); };
  const at = (t) => page.evaluate((t) => { const b = window.__pierce('button-card').find((x) => [].concat(x._config?.template || []).includes(t) && x.getBoundingClientRect().width > 20);
    if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, t);
  const g = await at('casora_badge_energy_group');
  await need(tag + ': energy badge', g);
  await tapAt(g);
  // Narrow: the group badge may open the big popup; the sub-badge row is the desktop's way in.
  if (await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface))) { await page.evaluate(() => window.casoraPopup.close()); await page.waitForTimeout(900); }
  const subs = await page.evaluate(() => window.__pierce('button-card').filter((x) => [].concat(x._config?.template || []).includes('casora_badge_energy') && x.getBoundingClientRect().width > 20).length);
  if (!subs) { console.log('  info   ' + tag + ': no energy sub-badge row here'); await browser.close(); continue; }
  for (let i = 0; i < subs; i++) {
    const q = await page.evaluate((i) => { const b = window.__pierce('button-card').filter((x) => [].concat(x._config?.template || []).includes('casora_badge_energy') && x.getBoundingClientRect().width > 20)[i];
      if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, i);
    if (!q) continue;
    await tapAt(q);
    const r = await page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; const p = window.__pierce('casora-popup')[0];
      const e1 = s ? window.__pierce('[data-casora-kind="e1"]', s)[0] : null;
      const lbl = s ? window.__pierce('*', s).find((n) => !n.children.length && n.textContent.trim() === 'Energiefluss' && n.getBoundingClientRect().height > 0) : null;
      return { title: p && p.shadowRoot.querySelector('.header-title').textContent.trim(), e1: !!e1, heading: !!(lbl && e1 && lbl.getBoundingClientRect().bottom <= e1.getBoundingClientRect().top + 1),
        bar: !!(s && /Woher kommt der Strom|Wohin geht der Solarstrom/.test(s.textContent)) }; });
    await check(tag + ': sub-popup „' + r.title + '“ shows the energy flow (E1), not the bar', r.e1 && !r.bar, r);
    await check(tag + ': „' + r.title + '“: „Energiefluss“ is the heading above the card', r.heading, r);
    await page.evaluate(() => window.casoraPopup.close());
    await page.waitForTimeout(900);
  }
  await browser.close();
}
await finish();
