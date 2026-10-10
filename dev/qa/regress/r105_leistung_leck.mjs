// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/layout-offsets.js custom_components/casora/scripts/smart-row.js custom_components/casora/scripts/casora-core.js
// Leistung 1.3 (gemessen mit dev/qa/leistung.mjs, Bericht bugfixrunde-1010/leistung):
//  - Nach jedem Raumwechsel lief layout-offsets.js ~5 s lang je Takt sechsmal durch alle Shadow-DOMs
//    (~130 Voll-Durchläufe). Erwartet: höchstens 50 in den 6 s danach.
//  - Jedes geöffnete Popup blieb nach dem Schließen im Speicher (button-card „haptic“-Listener mit
//    .bind(this), Szenen-Liste, Filter-Liste der Kachelreihe): +~45 Listener je Popup. Erwartet: nach
//    8 weiteren Popups höchstens 80 Listener mehr (nach Speicherbereinigung).
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = await casoraDashboard((x) => /casora_badge_energy_group|casora_room/.test(JSON.stringify(x.config.views || [])));
await need('Casora-Dashboard', d, null);
const views = (d.config.views || []).map((v, i) => v.path || String(i));
const room = views[1];
await need('Dashboard mit Raum-Ansicht', room, views);

const { page, context } = await open({ width: 1440, height: 900, theme: 'Casora' });
await context.addInitScript(() => {
  let n = 0; window.__qaStar = () => n;
  for (const P of [Document.prototype, Element.prototype, DocumentFragment.prototype]) {
    const q = P.querySelectorAll;
    P.querySelectorAll = function (s) { if (s === '*') n++; return q.call(this, s); };
  }
});
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');
const listeners = async () => {
  await cdp.send('HeapProfiler.collectGarbage');
  const { metrics } = await cdp.send('Performance.getMetrics');
  return metrics.find((m) => m.name === 'JSEventListeners').value;
};

await dashboard(page, d.url + '/' + views[0]);
await page.waitForTimeout(4000); // Anlauf-Takte nach dem Laden vorbei

// ── Raumwechsel: Voll-Durchläufe in den 6 s danach ──
const roots = await page.evaluate(() => { let n = 1; (function w(r) { r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) { n++; w(e.shadowRoot); } }); })(document); return n; });
const go = (v) => page.evaluate((u) => { history.pushState(null, '', u); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }, '/' + d.url + '/' + v);
await go(room);
await page.waitForTimeout(1500);
const s0 = await page.evaluate(() => window.__qaStar());
await go(views[0]);
await page.waitForTimeout(6000);
const walks = Math.round((await page.evaluate(() => window.__qaStar()) - s0) / roots);
await check(`Raumwechsel: höchstens 50 Voll-Durchläufe in 6 s (${walks}, ${roots} Wurzeln)`, walks <= 50, walks);

// ── Popup 10× öffnen/schließen: Listener wachsen nicht mit ──
const cycle = async () => {
  const at = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_energy_group') && x.getBoundingClientRect().width > 20);
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  if (!at) return false;
  await page.mouse.click(at.x, at.y);
  let ok = false;
  for (let t = 0; t < 30 && !ok; t++) { await page.waitForTimeout(100); ok = await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)); }
  await page.evaluate(() => window.casoraPopup && window.casoraPopup.close());
  await page.waitForTimeout(700);
  return ok;
};
await cycle(); await cycle();
const l0 = await listeners();
let opened = 0;
for (let i = 0; i < 8; i++) if (await cycle()) opened++;
const l1 = await listeners();
await need('Energie-Popup öffnet', opened === 8, opened);
await check(`8 Popups: höchstens 80 Listener mehr (${l1 - l0})`, l1 - l0 <= 80, { vorher: l0, nachher: l1 });

await finish();
