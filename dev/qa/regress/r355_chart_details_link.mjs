// @zustand: arbeit
// @parallel: ui
// 26.10.2026 (owner, prod): in the air purifier popup the chart head „Feinstaub PM2,5 · 48 Stunden“ shows „Details ›“,
// tapping it did nothing. Expected: „Details ›“ opens the reading's own page (Casora measurement page, header changes,
// ‹ back) – air purifier and fan (plant and batteries for the back step too), desktop 1440 and phone 393. Then (owner, prod): after ‹ back the chart card stayed
// empty – expected: the chart is drawn again (a curve, like #68 in the weather popup).
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
for (const [w, h, dev] of [[1440, 900, 'Desktop'], [393, 852, 'Handy']]) {
  const { page } = await open({ width: w, height: h, theme: 'Casora' });
  usePage(page);
  await dashboard(page, desk.url);
  for (const tpl of ['casora_air_purifier', 'casora_fan', 'casora_popup_plant', 'casora_popup_battery']) {
    const r = await page.evaluate(async (tpl) => {
      const ha = document.querySelector('home-assistant');
      const st = ha.hass.states;
      const ids = Object.keys(st).filter((k) => tpl === 'casora_popup_plant' ? k.startsWith('plant.')
        : tpl === 'casora_popup_battery' ? st[k].attributes.device_class === 'battery' : k.startsWith('fan.')).slice(0, 6);
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
    // ‹ back: the popup of the device again, with its chart drawn.
    await page.evaluate(() => { const b = window.casoraPopup.element && window.casoraPopup.element._headerBack; if (b && !b.hidden) b.click(); });
    let back = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(300);
      back = await page.evaluate(() => {
        const pop = window.casoraPopup && window.casoraPopup.element;
        const S = window.casoraPopup && window.casoraPopup.surface;
        const c = S && window.__pierce('casora-chart', S)[0];
        const lines = c && c.shadowRoot ? [...c.shadowRoot.querySelectorAll('path')].filter((p) => (p.getAttribute('d') || '').length > 20).length : 0;
        return { title: pop && pop._headerTitle ? pop._headerTitle.textContent : '', chart: !!c, lines, h: c ? Math.round(c.getBoundingClientRect().height) : 0 };
      });
      if (back.lines > 0 && back.title === r.t0) break;
    }
    await shot(dev + ' ' + tpl + ' nach zurueck');
    await check(dev + ' ' + tpl + ': nach ‹ wieder im Popup, Diagramm gezeichnet', back.title === r.t0 && back.lines > 0 && back.h > 60, back);
    await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); window.__pierce('ha-more-info-dialog').forEach((d) => d.close && d.close()); });
    await page.waitForTimeout(500);
  }
}
await finish();
