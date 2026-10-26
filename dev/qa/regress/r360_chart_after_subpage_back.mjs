// @zustand: arbeit
// @parallel: ui
// Owner, prod (26.10.2026): in the floor heating popup (one room) the chart „Temperatur · 24 Stunden“ was empty after
// › „Weitere Einstellungen“ and ‹ back. Every popup chart that a sub page hides has to be drawn again on ‹.
// Thermostat (floor heating room and plain), air purifier, fan, plant, energy, weather – desktop 1440 and phone 393.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const lines = () => page2.evaluate(() => {
  const S = window.casoraPopup && window.casoraPopup.surface;
  const c = S && window.__pierce('casora-chart', S)[0];
  return c && c.shadowRoot ? [...c.shadowRoot.querySelectorAll('path')].filter((p) => (p.getAttribute('d') || '').length > 20).length : 0;
});
let page2 = null;
for (const [w, h, dev] of [[1440, 900, 'Desktop'], [393, 852, 'Handy']]) {
  const { page } = await open({ width: w, height: h, theme: 'Casora' });
  page2 = page; usePage(page);
  await dashboard(page, desk.url);
  const cases = await page.evaluate(() => {
    const st = document.querySelector('home-assistant').hass.states, k = Object.keys(st);
    const cl = k.filter((x) => x.startsWith('climate.'));
    const single = cl.find((x) => !(window.casoraClimateMembers && window.casoraClimateMembers(st[x], st).length));
    return [
      { name: 'Fußbodenheizung (Raum)', tpl: ['casora_thermostat', 'casora_popup_fbh'], eid: single },
      { name: 'Thermostat', tpl: 'casora_thermostat', eid: single },
      { name: 'Luftreiniger', tpl: 'casora_air_purifier', eid: k.find((x) => x.startsWith('fan.')) },
      { name: 'Ventilator', tpl: 'casora_fan', eid: k.find((x) => x.startsWith('fan.')) },
      { name: 'Pflanze', tpl: 'casora_popup_plant', eid: k.find((x) => x.startsWith('plant.')) },
      { name: 'Energie', tpl: 'casora_popup_energy', eid: k.find((x) => x.startsWith('sensor.') && st[x].attributes.device_class === 'power') },
      { name: 'Wetter', tpl: 'casora_weather', eid: k.find((x) => x.startsWith('weather.')) },
    ].filter((c) => c.eid);
  });
  for (const c of cases) {
    const opened = await page.evaluate(async (c) => {
      const ha = document.querySelector('home-assistant');
      const old = window.__pierce('button-card').find((b) => { const q = b.getBoundingClientRect(); return q.width > 120 && q.height > 60 && q.top > 60; });
      const el = document.createElement('button-card');
      try { el.setConfig({ type: 'custom:button-card', template: c.tpl, entity: c.eid }); } catch (e) { return 'cfg ' + e; }
      el.hass = ha.hass; old.parentNode.insertBefore(el, old); window.__r360el = el;
      await new Promise((res) => setTimeout(res, 700));
      el.addEventListener('hass-action', (ev) => { const act = ev.detail.config.tap_action; if (act && act.casora_popup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
      el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
      await new Promise((res) => setTimeout(res, 3500));
      return window.casoraPopup && window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open') ? (window.casoraPopup.element._headerTitle.textContent || 'x') : 'closed';
    }, c);
    const l0 = await lines();
    if (!l0) { console.log('  –      ' + dev + ' ' + c.name + ': kein Diagramm im Popup (' + opened + '), übersprungen'); await page.evaluate(async () => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r360el) window.__r360el.remove(); await new Promise((r) => setTimeout(r, 600)); }); continue; }
    // A › sub page in the same popup: „Weitere Einstellungen“ (or the first › row).
    const sub = await page.evaluate(async () => {
      const S = window.casoraPopup.surface;
      const rows = window.__pierce('.hui-row', S);
      const row = rows.find((r) => /Weitere Einstellungen/.test(r.textContent)) || rows.find((r) => r.dataset.casoraPage || r.dataset.casoraMi);
      if (!row) return 'no row';
      row.scrollIntoView({ block: 'center', behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 300));
      row.click();
      for (let i = 0; i < 20; i++) { await new Promise((r) => setTimeout(r, 200)); const el = window.casoraPopup.element, b = el && el._headerBack; if (b && !b.hidden) return 'ok'; }
      return 'no back (' + row.textContent.replace(/\s+/g, ' ').trim().slice(0, 30) + ')';
    });
    if (sub !== 'ok') { console.log('  –      ' + dev + ' ' + c.name + ': keine Unterseite mit ‹ (' + sub + ')'); await page.evaluate(async () => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r360el) window.__r360el.remove(); await new Promise((r) => setTimeout(r, 600)); }); continue; }
    await page.waitForTimeout(500);
    await page.evaluate(() => window.casoraPopup.element._headerBack.click());
    let l1 = 0;
    for (let i = 0; i < 20 && !l1; i++) { await page.waitForTimeout(300); l1 = await lines(); }
    await shot(dev + ' ' + c.name + ' nach zurueck');
    await check(dev + ' ' + c.name + ': Diagramm nach › und ‹ wieder gezeichnet', l1 > 0, { opened, l0, l1 });
    await page.evaluate(async () => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__r360el) window.__r360el.remove(); await new Promise((r) => setTimeout(r, 600)); });
  }
}
await finish();
