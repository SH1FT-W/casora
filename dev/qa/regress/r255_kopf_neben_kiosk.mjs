// @zustand: arbeit
// Gemeldet (11.10.2026, Messung am iPhone in der App): Mit installiertem kiosk-mode lag der Seitenkopf nach
// Neustart/leerem Cache 56 px zu tief – kiosk-mode hatte die HA-Kopfzeile ausgeblendet, ihr Platz
// (--header-height) blieb im Abstand oben (#view padding-top = Safe-Area + 56). Casoras eigene Regel war
// abgeschaltet, sobald kiosk-mode da ist. Erwartet: auch mit kiosk-mode setzt Casora die Regel, #view oben =
// nur die Safe-Area. kiosk-mode wird hier nur angedeutet (window.KioskMode), die Kopfzeile bleibt so sichtbar
// wie ohne das Modul – geprüft wird, dass Casora sie trotzdem ausblendet und keinen Platz lässt.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => !!(d.config && d.config.kiosk_mode));
await need('Casora-Dashboard mit kiosk_mode.hide_header', dash && dash.phone);
const o = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false });
await o.context.addInitScript(() => { window.KioskMode = window.KioskMode || { qa: true }; });
const { page } = o;
await dashboard(page, dash.phone.url);
await page.waitForTimeout(1500);
const m = await page.evaluate(() => {
  const main = document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main').shadowRoot;
  const hr = main.querySelector('partial-panel-resolver ha-panel-lovelace').shadowRoot.querySelector('hui-root');
  const v = hr.shadowRoot.querySelector('#view');
  return { kiosk: !!window.KioskMode, guard: !!hr.shadowRoot.getElementById('casora-hide-header'), pt: getComputedStyle(v).paddingTop };
});
await check('Casora-Regel auch mit kiosk-mode aktiv', m.kiosk && m.guard, m);
await check('kein Platz der HA-Kopfzeile oben (#view padding-top = Safe-Area 0)', m.pt === '0px', m);
await finish();
