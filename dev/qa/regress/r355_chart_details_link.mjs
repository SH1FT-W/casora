// @zustand: arbeit
// @parallel: ui
// 26.10.2026 (owner, prod): in the air purifier popup the chart head „Feinstaub PM2,5 · 48 Stunden“ shows „Details ›“,
// tapping it did nothing. Expected: „Details ›“ opens the reading's own page (Casora measurement page, header changes,
// ‹ back) – air purifier and fan, desktop 1440 and phone 393.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
for (const [w, h, dev] of [[1440, 900, 'Desktop'], [393, 852, 'Handy']]) {
  const { page } = await open({ width: w, height: h, theme: 'Casora' });
  usePage(page);
  await dashboard(page, desk.url);
  for (const tpl of ['casora_air_purifier', 'casora_fan']) {
    const r = await page.evaluate(async (tpl) => {
      const ha = document.querySelector('home-assistant');
      const dom = 'fan.';
      const ids = Object.keys(ha.hass.states).filter((k) => k.startsWith(dom));
      const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 120 && x.height > 60 && x.top > 60; });
      for (const fid of ids) {
        const el = document.createElement('button-card');
        el.setConfig({ type: 'custom:button-card', template: tpl, entity: fid });
        el.hass = ha.hass; old.parentNode.insertBefore(el, old);
        await new Promise((res) => setTimeout(res, 600));
        el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && (ev.detail.config.tap_action);
          if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
        el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
        let det = null;
        for (let i = 0; i < 40 && !det; i++) { await new Promise((res) => setTimeout(res, 200)); det = window.casoraPopup && window.casoraPopup.surface && window.__pierce('.hp-det', window.casoraPopup.surface)[0]; }
        if (!det) { if (window.casoraPopup) window.casoraPopup.close(); el.remove(); await new Promise((res) => setTimeout(res, 500)); continue; }
        await new Promise((res) => setTimeout(res, 900));
        const pop = window.casoraPopup.element;
        const t0 = pop._headerTitle ? pop._headerTitle.textContent : '';
        const mi = det.getAttribute('data-casora-mi');
        return { fid, t0, mi, el: true };
      }
      return null;
    }, tpl);
    if (!r) { await check(dev + ' ' + tpl + ': Popup mit „Details ›“ gefunden', false, r); continue; }
    // A real tap, like a finger/mouse (centre of the link).
    const box = await page.evaluate(() => { const d = window.__pierce('.hp-det', window.casoraPopup.surface)[0]; const b = d.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => {
      const pop = window.casoraPopup && window.casoraPopup.element;
      const moreInfo = !!window.__pierce('ha-more-info-dialog').find((d) => d.open || d.hasAttribute('open'));
      return { open: !!(pop && pop.hasAttribute('open')), title: pop && pop._headerTitle ? pop._headerTitle.textContent : '', back: !!(pop && window.__pierce('.header-back, [data-casora-back], .hdr-back', pop.shadowRoot || pop).find((b) => b.offsetParent !== null)), moreInfo };
    });
    await shot(dev + ' ' + tpl + ' nach Details');
    await check(dev + ' ' + tpl + ': „Details ›“ öffnet die Seite des Messwerts', (after.open && after.title && after.title !== r.t0) || after.moreInfo, { r, after });
    await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); window.__pierce('ha-more-info-dialog').forEach((d) => d.close && d.close()); });
    await page.waitForTimeout(500);
  }
}
await finish();
