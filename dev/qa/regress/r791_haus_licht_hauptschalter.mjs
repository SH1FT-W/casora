// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#S.head,S.headFor custom_components/casora/scripts/casora-core.js#casoraVisibleIdsNow,_syncHeadSwitch,headSwitchIds
// V9 (optimisation round 14.11.2026, owner's go: „Alle aus“ in the house light popup). Found: on the phone the house
// light popup (badge „Beleuchtung“ on Home) opened after a page load had no main switch at all – 4 of 4 times – so
// switching off the whole house took one tap per room. The switch exists (03-popups.js S.headFor: the whole house only
// off, with a confirmation, greyed out while everything is off), but it asks „Wer sieht das?“ for the visible lamps,
// whose dashboard config loads on first use (casoraVisibleIdsNow: null until then). The popup was the first to ask, the
// hook threw on the null list, and no sync came after the config had arrived. Expected on the phone, on a fresh page
// each time (twice): the head shows the switch, on while lamps are on, enabled, and it is the house's (switches off only).
import { open, usePage, dashboard, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

const RUNS = [['Handy', dash.phone.url, { width: 393, height: 852, mobile: true, safari: true }], ['Handy (2. Laden)', dash.phone.url, { width: 393, height: 852, mobile: true, safari: true }]];
for (const [label, url, size] of RUNS) {
  const { page: pg, browser } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(pg);
  await dashboard(pg, url, 2);
  // At least one lamp on (the house popup's switch only switches off).
  const lit = await pg.evaluate(async () => {
    const h = document.querySelector('home-assistant').hass;
    const on = Object.keys(h.states).filter((x) => x.startsWith('light.') && h.states[x].state === 'on');
    if (on.length) return on.length;
    const l = Object.keys(h.states).find((x) => x.startsWith('light.') && h.states[x].state === 'off');
    if (l) await h.callService('light', 'turn_on', {}, { entity_id: l });
    return l ? 1 : 0;
  });
  await need(`${label}: eine Lampe an`, lit > 0);
  await pg.evaluate(() => { const h = document.querySelector('home-assistant').hass;
    if (h.states['input_select.casora_expanded_row']) return h.callService('input_select', 'select_option', { entity_id: 'input_select.casora_expanded_row', option: 'none' }); });
  await pg.waitForTimeout(1500);
  const b = await pg.evaluate(() => {
    const vis = (x) => { const r = x.getBoundingClientRect(); return r.width > 8 && r.height > 8 && r.top >= 0 && r.top < innerHeight; };
    const x = window.__pierce('button-card').find((x) => { const t = [].concat((x._config || {}).template || []); return t[t.length - 1] === 'casora_badge_light_group' && vis(x); })
      || window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light_group') && vis(x));
    if (!x) return null; x.scrollIntoView({ block: 'center', inline: 'nearest' }); const r = x.getBoundingClientRect();
    return { x: r.x + Math.min(30, r.width / 2), y: r.y + r.height / 2 };
  });
  await need(`${label}: Badge „Beleuchtung“ für das ganze Haus`, b);
  if (size.mobile) await pg.touchscreen.tap(b.x, b.y); else await pg.mouse.click(b.x, b.y);
  await pg.waitForTimeout(3500);
  const st = await pg.evaluate(() => {
    const p = window.casoraPopup && window.casoraPopup.shown; if (!p || !p.hasAttribute('open')) return null;
    const s = p._headerSwitch, r = s.getBoundingClientRect();
    return { title: p._headerTitle.textContent, eyebrow: p._headerEyebrow.textContent, hidden: s.hidden, w: Math.round(r.width),
      on: s.getAttribute('aria-checked'), disabled: s.disabled, house: !!p._hsOff && typeof p._hsToggle === 'function', ids: (p._hsIds || []).length };
  });
  await need(`${label}: Haus-Licht-Popup offen`, st && /Beleuchtung|Lighting/.test(st.title), st);
  await check(`${label}: Hauptschalter im Kopf sichtbar`, st && !st.hidden && st.w > 30, st);
  await check(`${label}: Hauptschalter an und bedienbar (Lampen an)`, st && st.on === 'true' && !st.disabled, st);
  await check(`${label}: Hauptschalter des Hauses (schaltet nur aus, mit Rückfrage)`, st && st.house && st.ids > 1, st);
  await browser.close();
}
await finish();
