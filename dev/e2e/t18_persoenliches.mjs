// Studio → Einstellungen (früher „Persönliches“): der alte Einstieg öffnet die Unterseite
// „Haus & Geräte“ mit ihren Bereichen; ohne Änderung bleibt Speichern aus und nichts wird geschrieben.
import { open, ready } from './harness.mjs';

const { browser, page, errors } = await open({ width: 1440, height: 1000 });
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass && p._casoraPersonal && p._csShow; });
const before = await page.evaluate(() => document.querySelector('home-assistant').hass.callWS({ type: 'casora/settings/get' }));
await page.evaluate(() => window.__panel()._casoraPersonal());
await page.waitForTimeout(2000);
const seite = await page.evaluate(() => {
  const p = window.__panel(), root = p.shadowRoot;
  return { offen: p._csOpen || p._csSheetPage !== undefined, seite: p._csPage || p._csSheetPage,
    bereiche: root.querySelectorAll('.fhead').length, zeilen: root.querySelectorAll('.casora-prow').length,
    speichernAus: !!(root.querySelector('.cs-save') || {}).disabled };
});
await page.evaluate(() => { const b = window.__panel().shadowRoot.querySelector('.cs-save'); if (b) b.click(); });
await page.waitForTimeout(1500);
const after = await page.evaluate(() => document.querySelector('home-assistant').hass.callWS({ type: 'casora/settings/get' }));
console.log(JSON.stringify({ seite, gespeichert: after.stored,
  unveraendert: !before.stored || JSON.stringify(before.settings) === JSON.stringify(after.settings) }));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)));
await browser.close();
