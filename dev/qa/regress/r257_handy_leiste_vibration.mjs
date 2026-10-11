// @zustand: arbeit
// Gemeldet (11.10.2026): Am Handy vibrierten Glocke und Assist in der Leiste nicht wie ⋯, Räume und Szenen –
// beide fangen den Fingertipp selbst ab und unterdrücken den Klick, an dem die Vibration hing.
// Erwartet: jeder Tipp auf Glocke, Assist, ⋯ und Räume löst genau ein „haptic“-Ereignis aus.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false });
await dashboard(page, dash.phone.url);
await page.waitForTimeout(2500);
await page.evaluate(() => { window.__qaHaptic = 0; window.addEventListener('haptic', () => { window.__qaHaptic++; }, true); });
const at = (tpl) => page.evaluate((tpl) => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(tpl) && x.getBoundingClientRect().width > 0);
  if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, docked: r.top > 700 }; }, tpl);
const close = async () => { await page.touchscreen.tap(200, 120); await page.waitForTimeout(700);
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); document.querySelectorAll('.casora-settings-menu').forEach((m) => m._close && m._close()); }); await page.waitForTimeout(500); };
for (const [name, tpl] of [['Glocke', 'casora_notifications_button'], ['Assist', 'casora_assist_button'], ['⋯', 'casora_settings_button']]) {
  const p = await at(tpl);
  if (!p) { await check(`${name}: in der Leiste`, false); continue; }
  await page.evaluate(() => { window.__qaHaptic = 0; });
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(600);
  const n = await page.evaluate(() => window.__qaHaptic);
  await check(`${name}: Tipp vibriert (genau einmal)`, p.docked && n === 1, { n, docked: p.docked });
  await close();
}
await finish();
