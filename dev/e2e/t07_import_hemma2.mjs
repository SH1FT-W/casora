// @deckt: custom_components/casora/panel/casora-panel-import.js custom_components/casora/hemma_package.py custom_components/casora/umstellen.py
// Zwei YAML-Dashboards: Auswahl-Schritt, dann Hemma-2-Import (Casoras eigener Ablauf).
import { open, ready, shot, PIERCE, BASE } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';
const { browser, page, errors } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
const H = (fn, arg) => page.evaluate(fn, arg);
const step = async (name) => { await page.waitForTimeout(900); console.log('  📸', await shot(page, name)); };
await H(async () => {
  const h = document.querySelector('home-assistant').hass;
  for (const d of await h.callWS({ type: 'lovelace/dashboards/list' }))
    if (d.mode === 'storage' && /^hemma-2-test/.test(d.url_path)) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
});
await H(() => window.__panel()._importForm());
await page.getByText('Dashboard wählen').or(page.getByText('Choose a Dashboard')).first().waitFor({ timeout: 20000 });
const list = await H(() => window.__pierce('.flowin .frow').map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
console.log('Auswahl:', list);
check('Auswahl zeigt beide YAML-Dashboards', list.length >= 2, list);
await step('h2_0_auswahl');
await page.getByRole('radio', { name: /Hemma 2 \(Test\)/ }).click();
await page.getByText('Weiter', { exact: true }).click();
await page.waitForTimeout(2500);
const review = await H(() => ({ title: window.__pierce('.flowin .ftitle')[0]?.textContent, rows: window.__pierce('.flowin .frow').map((r) => r.textContent.replace(/\s+/g, ' ').trim()).slice(0, 12), name: window.__pierce('.flowin input.fin').pop()?.value }));
console.log('Prüfung:', JSON.stringify(review, null, 1));
await step('h2_1_pruefung');
const btn = await H(() => window.__pierce('button').filter((b) => b.offsetParent && /^(Importieren|Import)$/.test(b.textContent.trim())).map((b) => b.textContent.trim()));
await page.getByText(btn[0], { exact: true }).click();
await page.waitForTimeout(9000);
const done = await H(() => window.__pierce('.flowin')[0]?.textContent.replace(/\s+/g, ' '));
console.log('Fertig:', done);
check('Import fertig', /fertig|ready|done/i.test(done || ''), (done || '').slice(0, 120));
await step('h2_2_fertig');
const url = await H(async () => { const h = document.querySelector('home-assistant').hass;
  const l = await h.callWS({ type: 'lovelace/dashboards/list' }); return (l.find((d) => /^hemma-2-test/.test(d.url_path) && !/mobile/.test(d.url_path)) || {}).url_path; });
await page.goto(BASE + '/' + url, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: PIERCE });
await page.waitForTimeout(9000);
const bad = await H(() => window.__pierce('hui-error-card').map((e) => String((e._config || {}).message || '').slice(0, 150)));
console.log('Dashboard', url, 'Fehlerkarten:', bad.length, bad.slice(0, 4));
check('neues Dashboard da', !!url, url);
check('keine Fehlerkarten', !bad.length, bad);
await step('h2_3_dashboard');
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
check('keine Browser-Fehler', !echteFehler(errors).length, echteFehler(errors));
await browser.close();
ende();
