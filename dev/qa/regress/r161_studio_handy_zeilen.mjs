// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-personal.js
// Gefunden im Studio-Audit (d-studio, 10.10.2026), Handy 393 (WebKit), Einstellungen › Glocke & Meldungen:
//   ds-07 Zeilen mit zwei Textfeldern + ✕ (Zonen-Formulierung „Büro → im Büro“): das ✕ rutschte allein in eine
//         eigene Zeile unter die Felder (links), weil die Grundbreite der Felder (130 + 160 + 44) breiter war als
//         die Zeile (337 px). Erwartet: Felder und ✕ in einer Zeile.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard fürs Studio', dash);
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, dark: false });
usePage(page);
await studio(page, dash);
await page.evaluate(async () => { const p = window.__panel(); p._bOpen = true; await p._csOpenPage('alerts'); });
await page.waitForTimeout(2000);
const rows = await page.evaluate(() => {
  const p = window.__panel();
  return [...p.shadowRoot.querySelectorAll('.casora-pctl')].map((c) => {
    const k = [...c.children].filter((x) => x.getBoundingClientRect().width > 0);
    return { kinds: k.map((x) => x.tagName.toLowerCase() + (x.classList.contains('casora-x') ? '.x' : '')).join('+'),
      tops: k.map((x) => Math.round(x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2)) };
  }).filter((r) => r.kinds === 'input+input+button.x');
});
await need('Zeilen mit zwei Feldern und ✕ (Zonen-Formulierung)', rows.length > 0, rows);
const bad = rows.filter((r) => Math.max(...r.tops) - Math.min(...r.tops) > 4);
await check('ds-07 Felder und ✕ stehen in einer Zeile (Mitten ±4 px)', !bad.length, bad.slice(0, 3));
await finish();
