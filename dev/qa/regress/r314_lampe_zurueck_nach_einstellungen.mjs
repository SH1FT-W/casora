// @zustand: arbeit
// @parallel: ui
// #43 (Casora 26.10.52): light list → a lamp (‹ back to the list) → „Weitere Einstellungen“ (device page with ‹)
// → ‹ back to the lamp: there the ‹ back to the list was gone. Expected: the lamp popup keeps its ‹, and it
// still leads to the light list. Casora look, tablet 1024×768, light.
import { open, dashboard, casoraDashboards as _cd, check, need, finish } from './lib.mjs';

const desks = (await _cd()).filter((d) => !d.mobile && (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', desks.length);
const { page } = await open({ width: 1024, height: 768, dark: false, theme: 'Casora' });
const readPopup = () => page.evaluate(() => {
  const P = window.casoraPopup; const el = P && P.element; if (!el || !P.surface) return null;
  const sw = el.shadowRoot.querySelector('.header-switch'); const bk = el.shadowRoot.querySelector('.header-back');
  return { back: !!(bk && !bk.hidden), title: (el.shadowRoot.querySelector('.header-title') || {}).textContent || '', ids: sw && !sw.hidden ? (el._hsIds || []) : [],
    rows: window.__pierce('.lps-row', P.surface).map((r) => r.getAttribute('data-lps-tap') || '') };
});
let done = false;
outer: for (const dash of desks) for (const [i, v] of dash.config.views.entries()) {
  if (!i || !/casora_light\b/.test(JSON.stringify(v))) continue;
  await dashboard(page, dash.url + '/' + (v.path || String(i)), 3);
  await page.waitForTimeout(1500);
  // A visible room light tile (casora_light) with ≥ 2 existing lamps, one of them not a group.
  const pick = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    for (const b of window.__pierce('button-card')) {
      const e = b._config && b._config.entity;
      if (!e || !/^light\./.test(e) || !([].concat(b._config.template || []).includes('casora_light')) || !b.getBoundingClientRect().width) continue;
      const m = h.states[e]?.attributes?.entity_id;
      if (!Array.isArray(m)) continue;
      const ex = m.filter((x) => h.states[x]);
      const lamp = ex.find((x) => !Array.isArray(h.states[x].attributes?.entity_id));
      if (ex.length < 2 || !lamp) continue;
      b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
      return { room: e, lamp, name: h.states[lamp].attributes.friendly_name || lamp, x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    return null;
  });
  if (!pick) continue;
  await page.waitForTimeout(600);
  await page.mouse.click(pick.x, pick.y);
  await page.waitForTimeout(2500);
  const room = await readPopup();
  const rowAt = await page.evaluate((id) => { const P = window.casoraPopup; const r = window.__pierce('.lps-row', P.surface).find((x) => (x.getAttribute('data-lps-tap') || '').indexOf('"id":"' + id + '"') >= 0);
    if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width * 0.5, y: b.y + b.height / 2 }; }, pick.lamp);
  await check('room popup shows the lamp row', !!rowAt, { room, lamp: pick.lamp });
  if (!rowAt) continue;
  await check('room popup has its head switch', room && room.ids.length > 0, room);
  await page.mouse.click(rowAt.x, rowAt.y);
  await page.waitForTimeout(3000);
  const lamp = await readPopup();
  await check('lamp row opens the lamp popup', lamp && lamp.title && lamp.title !== room.title, { lamp, name: pick.name });
  await check('no head switch in the lamp popup', lamp && !lamp.ids.length, lamp && lamp.ids);
  await check('‹ back in the lamp popup', lamp && lamp.back, lamp);
  const clickBack = async () => {
    const bk = await page.evaluate(() => { const el = window.casoraPopup.element; const b = el.shadowRoot.querySelector('.header-back'); if (!b || b.hidden) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    if (bk) { await page.mouse.click(bk.x, bk.y); await page.waitForTimeout(2500); }
    return !!bk;
  };
  const setAt = await page.evaluate(() => { const P = window.casoraPopup;
    const r = window.__pierce('[data-casora-mi]', P.surface).find((x) => /^(Weitere Einstellungen|More settings)$/.test(String(x.textContent || '').replace(/\s+/g, ' ').trim()));
    if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  await need('„Weitere Einstellungen“ in the lamp popup', !!setAt, lamp);
  await page.mouse.click(setAt.x, setAt.y);
  await page.waitForTimeout(3000);
  const dev = await readPopup();
  await check('„Weitere Einstellungen“ opens the device page with ‹', dev && dev.back && dev.title !== room.title, dev);
  await clickBack();
  const lamp2 = await readPopup();
  await check('‹ from the device page: the lamp popup again', lamp2 && lamp2.title === lamp.title, { lamp2, lamp });
  await check('the lamp popup keeps its ‹ back to the list (#43)', lamp2 && lamp2.back, lamp2);
  await clickBack();
  const list = await readPopup();
  await check('‹ leads to the light list', list && list.rows.join() === room.rows.join(), { list, room });
  done = true;
  break outer;
}
await check('room light tile with ≥ 2 lamps found', done);
await finish();
