// Hemma-1-Import-Assistent: YAML-Dashboard (Raumkarte + layout-card) → neues Dashboard.
import { open, ready, shot, BASE } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';

const { browser, page, errors } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
const step = async (name) => { await page.waitForTimeout(900); console.log('  📸', await shot(page, name)); };

// Aufräumen: frühere Import-Ergebnisse löschen (nur Storage-Dashboards, nie das YAML-Original).
await page.evaluate(async () => {
  const h = document.querySelector('home-assistant').hass;
  const list = await h.callWS({ type: 'lovelace/dashboards/list' });
  for (const d of list) if (d.mode === 'storage' && /^hemma-1-test/.test(d.url_path)) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
});
await page.evaluate(() => window.__panel()._refreshDashboards && window.__panel()._refreshDashboards());
await page.waitForTimeout(1500);
await page.evaluate(() => window.__panel()._importForm());
// Mehrere YAML-Dashboards: erst auswählen.
await page.getByText('Hemma-1-Dashboard gefunden').or(page.getByText('Dashboard wählen')).first().waitFor({ timeout: 20000 });
if (await page.getByText('Dashboard wählen').count()) {
  await page.getByRole('radio', { name: /Hemma 1 \(Test\)/ }).click();
  await page.getByText('Weiter', { exact: true }).click();
}
await page.getByText('Hemma-1-Dashboard gefunden').waitFor({ timeout: 20000 });
const rooms = await page.evaluate(() => [...window.__pierce('.frow, [class*=frow]')].map((r) => r.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12));
console.log('Schritt 1 – Räume:', rooms);
check('Schritt 1 zeigt Räume', rooms.length > 0, rooms);
await step('h1_1_uebersicht');

await page.getByText('Weiter', { exact: true }).click();
await page.getByText('Ersatz auswählen').waitFor({ timeout: 10000 });
const picks = await page.evaluate(() => window.__pierce('select.casora-pick').map((s) => {
  const row = s.parentElement; const t = row.textContent.replace(/\s+/g, ' ').trim().slice(0, 70);
  return t + ' → [' + [...s.options].map((o) => o.textContent).join(' | ') + '] gewählt: ' + s.options[s.selectedIndex].textContent;
}));
console.log('Schritt 2 – Ersatz:', picks);
// Variante: erste Karte als eigene Karte behalten, zweite weglassen.
if (process.env.VARIANT === 'custom') {
  await page.evaluate(() => { const s = window.__pierce('select.casora-pick');
    s[0].value = 'custom'; s[0].dispatchEvent(new Event('change'));
    s[1].value = 'skip'; s[1].dispatchEvent(new Event('change')); });
  console.log('Variante: 1. eigene Karte, 2. weglassen');
}
await step('h1_2_ersatz');

await page.getByText('Weiter', { exact: true }).click();
await page.getByText('Dashboard importieren').waitFor({ timeout: 10000 });
const nameVal = await page.evaluate(() => (window.__pierce('.flowin input')[0] || {}).value);
console.log('Vorgeschlagener Name:', nameVal);
await step('h1_3_name');
await page.getByText('Importieren', { exact: true }).click();
await page.waitForTimeout(8000);
await step('h1_4_fertig');

const result = await page.evaluate(async () => {
  const h = document.querySelector('home-assistant').hass;
  const list = await h.callWS({ type: 'lovelace/dashboards/list' });
  const mine = list.filter((d) => /imported|casora|hemma-1/i.test(d.url_path + d.title));
  const out = [];
  for (const d of mine) {
    const cfg = await h.callWS({ type: 'lovelace/config', url_path: d.url_path });
    const views = cfg.views || [];
    const tiles = views.map((v) => { const row = (v.cards || []).find((c) => c && c.type === 'custom:casora-smart-row'); return (v.path || '?') + ':' + (row ? (row.cards || []).length + ' ' + (row.cards || []).map((c) => [].concat(c.template || c.type).join('+').replace('casora_', '')).join(',') : '–'); });
    const tplNames = new Set(Object.keys(cfg.button_card_templates || {}));
    const missing = new Set();
    JSON.stringify(cfg.views, (k, v) => { if (k === 'template') [].concat(v).forEach((n) => { if (typeof n === 'string' && !tplNames.has(n)) missing.add(n); }); return v; });
    out.push({ missingTemplates: [...missing], url: d.url_path, title: d.title, kiosk: JSON.stringify(cfg.kiosk_mode || null), views: views.length, tiles, templates: Object.keys(cfg.button_card_templates || {}).length });
  }
  return out;
});
console.log('Ergebnis:', JSON.stringify(result, null, 1));
check('Dashboards angelegt (Desktop + Handy)', result.length >= 2, result.map((r) => r.url));
for (const r of result) {
  check(r.url + ': Räume', r.views > 0, r.views);
  check(r.url + ': keine fehlenden Vorlagen', !r.missingTemplates.length, r.missingTemplates);
}
const done = await page.evaluate(() => window.__pierce('.flowin')[0]?.textContent.replace(/\s+/g, ' '));
console.log('Fertig-Text:', done);
for (const r of result) {
  await page.goto(BASE + '/' + r.url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: 'window.__pierce=' + (function (sel, root) { const out = []; (function walk(r) { if (!r) return; r.querySelectorAll(sel).forEach((e) => out.push(e)); r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); }); })(root || document); return out; }).toString() });
  await page.waitForTimeout(9000);
  const bad = await page.evaluate(() => window.__pierce('hui-error-card, hui-warning').map((e) => (e.shadowRoot?.textContent || e.textContent).replace(/\s+/g, ' ').slice(0, 160)));
  const btns = await page.evaluate(() => window.__pierce('button-card').length);
  console.log('Dashboard', r.url, '– button-cards:', btns, 'Fehlerkarten:', bad.length, bad.slice(0, 5));
  check(r.url + ': Karten ohne Fehlerkarten', btns > 0 && !bad.length, { btns, bad: bad.slice(0, 3) });
  console.log('  📸', await shot(page, 'h1_5_' + r.url));
}
console.log('Browser-Fehler:', errors.filter((e) => !/404/.test(e)).slice(0, 5));
check('keine Browser-Fehler', !echteFehler(errors).length, echteFehler(errors));
await browser.close();
ende();
