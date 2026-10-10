// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/08-weich-kompakt.js custom_components/casora/scripts/local/07-weich-spezial.js custom_components/casora/scripts/local/08-weich-szenen.js custom_components/casora/scripts/local/06-kalender.js dev/qa/popup-geo.mjs
// Design-Audit Popups 10.10.2026 (Casora 1.3), Theme „Casora“, Desktop 1440 Chromium + Handy 393 WebKit,
// hell und dunkel. Je Fund ein Popup gezielt öffnen (_casoraNotifyOpenViaCard) und messen:
//  - DP-03 Langer Name im Kopf: Titel bleibt im Popup (mit „…“), auch mit den alten popup_styles der
//    Gerät-/Auto-/Kalender-Vorlagen (max-width: calc(100% + 56px)) – lief vorher 114–287 px über den Rand.
//  - DP-04 Schloss entriegelt (dunkel): Schalter hebt sich von der hellen aktiven Zeile ab (≥ 1,5:1),
//    vorher Spur .18 + heller Knopf auf Creme = unsichtbar.
//  - DP-25 Alarm scharf (dunkel): Symbol im hellen Kreis von „Unscharf schalten“ ≥ 3:1 (vorher hell auf Creme).
//  - DP-11 Sicherheits-Badge mit Alarmanlage: Weich-Kopf (Zustand ≤ 17 px), nicht der alte 36-px-Kopf.
//  - DP-02 Handy: Szenen-Chips und Kalender-Pfeile/-Legende mit Trefferfläche ≥ 40 px (inkl. ::before).
// Messung über dev/qa/popup-geo.mjs (Arten schalter, kontrast, treffer).
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates } from './lib.mjs';
import { MEASURE_GEO } from '../popup-geo.mjs';

process.env.CASORA_THEME = 'Casora';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const LONG = 'Sehr langer Gerätename zum Prüfen von Umbrüchen und Kürzungen im Wohnzimmer links';
// Alte Kopf-Regel einiger Vorlagen (casora_appliance, casora_popup_car, _calendar, _ebike, …).
const OLD_CSS = '.header-content { left: 82px !important; right: 82px !important; margin-inline: 0 !important; width: auto !important; max-width: none !important; overflow: visible !important; align-items: safe center !important; } .header-title { max-width: calc(100% + 56px) !important; overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }';

const VIEWS = [
  { name: 'Desktop', url: dash.url, view: (dash.config.views[0] || {}).path || '0', o: { width: 1440, height: 900 } },
  { name: 'Handy', url: (dash.phone || dash).url, view: ((dash.phone || dash).config.views[0] || {}).path || '0', o: { width: 393, height: 852, mobile: true, safari: true, scale: 3 }, phone: true },
];
const openPop = (page, id, cfg) => page.evaluate(([id, cfg]) => new Promise((res) => {
  if (window.casoraPopup) window.casoraPopup.close();
  setTimeout(() => window._casoraNotifyOpenViaCard(id, res, cfg), 400);
}), [id, cfg]).catch(() => false);
const settle = async (page) => {
  await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; const r = s && s.getBoundingClientRect(); return r && r.height > 100; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1800);
};
const geo = (page) => page.evaluate(MEASURE_GEO).catch((e) => ({ finds: [], err: String(e) }));
let opened = 0;
for (const dark of [false, true]) for (const V of VIEWS) {
  const tag = V.name + (dark ? ' dunkel' : ' hell');
  const { page, browser } = await open({ ...V.o, dark, theme: 'Casora' });
  await dashboard(page, V.url + '/' + V.view, 3);
  const pick = await page.evaluate(() => {
    const st = document.querySelector('home-assistant').hass.states; const ids = Object.keys(st);
    const first = (re) => ids.find((i) => re.test(i));
    return { lock: first(/^lock\./), alarm: first(/^alarm_control_panel\./), cal: first(/^calendar\./), sw: first(/^switch\./) || first(/^light\./) };
  });
  const patch = {};
  if (pick.lock) patch[pick.lock] = { state: 'unlocked' };
  if (pick.alarm) patch[pick.alarm] = { state: 'armed_home', attributes: { code_format: null, supported_features: 63 } };
  await fakeStates(page, patch, { sticky: true });

  // DP-03: langer Titel (Gerät-Vorlage hat die alte Kopf-Regel selbst; zusätzlich eingespritzt, falls nicht)
  if (pick.sw && await openPop(page, pick.sw, { type: 'custom:button-card', template: ['casora_appliance'], entity: pick.sw, name: LONG, variables: {} })) {
    await settle(page);
    const m = await page.evaluate(([css, long]) => {
      const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null; const sr = s.shadowRoot || s;
      const t = sr.querySelector('.header-title'); if (!t) return null;
      const st = document.createElement('style'); st.textContent = css; sr.appendChild(st); t.textContent = long;
      const r = t.getBoundingClientRect(), f = s.getBoundingClientRect();
      return { l: Math.round(r.left - f.left), r: Math.round(f.right - r.right), w: Math.round(r.width) };
    }, [OLD_CSS, LONG]);
    if (m) { opened++; await check(`${tag}: DP-03 langer Titel bleibt im Popup`, m.l >= 0 && m.r >= 0, m); }
  }
  // DP-04: Schloss entriegelt
  if (pick.lock && await openPop(page, pick.lock, null)) {
    await settle(page); opened++;
    const g = await geo(page);
    await check(`${tag}: DP-04 Schloss-Schalter sichtbar`, !g.finds.some((f) => f.kind === 'schalter'), g.finds.filter((f) => f.kind === 'schalter'));
  }
  // DP-25 + DP-11: Alarm scharf – Alarm-Popup und Sicherheits-Badge mit Alarmanlage
  if (pick.alarm) {
    for (const [lab, tpl] of [['Alarm', 'casora_alarm'], ['Badge Sicherheit', 'casora_badge_security']]) {
      if (!await openPop(page, pick.alarm, { type: 'custom:button-card', template: [tpl], entity: pick.alarm, variables: { alarm_entity: pick.alarm } })) continue;
      await settle(page); opened++;
      const g = await geo(page);
      const weak = g.finds.filter((f) => f.kind === 'kontrast' && /^Symbol/.test(f.msg) && parseFloat(f.msg.slice(7)) < 1.5);
      await check(`${tag}: DP-25 ${lab} – kein unsichtbares Symbol (< 1,5:1)`, !weak.length, weak);
      const big = await page.evaluate(() => { const s = window.casoraPopup.surface; const out = [];
        (function w(n) { for (const c of n.children || []) { if (c.dataset && c.dataset.casoraLive === 'word') out.push(parseFloat(getComputedStyle(c).fontSize)); if (c.shadowRoot) w(c.shadowRoot); w(c); } })(s.shadowRoot || s);
        return out; });
      await check(`${tag}: DP-11 ${lab} – Zustand im Weich-Kopf (≤ 17 px)`, big.length > 0 && Math.max(...big) <= 17, big);
    }
  } else console.log(`  info   ${tag}: keine Alarmanlage im Haus`);
  // DP-02: Trefferflächen am Handy (Szenen, Kalender)
  if (V.phone) {
    for (const [lab, id, cfg] of [
      ['Szenen', null, { type: 'custom:button-card', template: ['casora_scenes'], variables: {} }],
      ['Kalender', pick.cal, { type: 'custom:button-card', template: ['casora_calendar'], entity: pick.cal, variables: {} }]]) {
      if (lab === 'Kalender' && !pick.cal) continue;
      if (!await openPop(page, id, cfg)) { console.log(`  info   ${tag}: ${lab} öffnet nicht`); continue; }
      await settle(page); opened++;
      const g = await geo(page);
      const small = g.finds.filter((f) => f.kind === 'treffer' && !/Schließen|Close/.test(f.label));
      await check(`${tag}: DP-02 ${lab} – Trefferflächen ≥ 40 px`, !small.length, small.slice(0, 6));
    }
  }
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()).catch(() => {});
  await browser.close();
}
await need('Popups geöffnet und gemessen', opened >= 4, opened);
await finish();
