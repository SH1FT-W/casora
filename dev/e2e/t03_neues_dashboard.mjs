// Neues Dashboard anlegen, Casora-Kacheltypen im Editor auswählen, speichern, prüfen.
import { open, ready, shot, HAUS, BASE } from './harness.mjs';
import fs from 'node:fs';

const { browser, page, errors } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
const step = async (name) => { await page.waitForTimeout(900); console.log('  📸', await shot(page, name)); };
const H = (fn, arg) => page.evaluate(fn, arg);

// Aufräumen
await H(async () => {
  const h = document.querySelector('home-assistant').hass;
  for (const d of await h.callWS({ type: 'lovelace/dashboards/list' }))
    if (d.mode === 'storage' && /^(test-neu|casora-dashboard)/.test(d.url_path)) await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: (await import('./harness.mjs')).PIERCE });
await page.waitForFunction(() => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; }, null, { timeout: 45000 });
await page.waitForTimeout(1500);

await H(() => window.__panel()._createForm());
await page.getByText('Räume wählen').waitFor({ timeout: 20000 });
const rooms = await H(() => window.__pierce('.flowin .frow').map((r) => r.textContent.replace(/\s+/g, ' ').trim()).slice(0, 20));
console.log('Räume zur Auswahl:', rooms);
const nameDefault = await H(() => window.__pierce('.flowin input.fin').pop()?.value);
console.log('Vorgabe-Name:', nameDefault);
await H(() => { const i = window.__pierce('.flowin input.fin').pop(); i.value = 'Test Neu'; i.dispatchEvent(new Event('input', { bubbles: true })); });
await step('n1_raeume');
const btn = await H(() => window.__pierce('.flowin button, .facts button, button').filter((b) => b.offsetParent && /Dashboard erstellen|Create Dashboard/.test(b.textContent)).map((b) => b.textContent.trim()));
console.log('Knopf:', btn);
await page.getByText(btn[0], { exact: true }).click();
await page.waitForTimeout(2500);
// Seit dem Standardraum: erst „Räume füllen“ – hier leer beginnen, damit der Rest wie bisher prüft.
const fill = await H(() => window.__pierce('.themecard[data-k=empty]').length > 0);
console.log('Räume füllen:', fill ? 'ja' : 'FEHLT');
if (fill) {
  await H(() => { window.__pierce('.themecard[data-k=empty]')[0].click(); });
  await H(() => { [...window.__panel()._fx.foot.querySelectorAll('button:not(.fbackbtn)')].pop().click(); });
}
await page.waitForTimeout(8000);
await step('n2_fertig');
const done = await H(() => window.__pierce('.flowin')[0]?.textContent.replace(/\s+/g, ' '));
console.log('Fertig:', done);

// In den Editor
await page.getByText('Bearbeiten', { exact: true }).last().click();
await page.waitForTimeout(5000);
const st = await H(() => { const p = window.__panel(); return { dash: p._dashUrl, rooms: p._state.compact.rooms.map((r) => r.name + ':' + r.tiles.length) }; });
console.log('Editor:', st);

// Kacheltypen, die „Kachel hinzufügen“ anbietet
const types = await H(() => {
  const I = window.__casoraPanelInternals;
  return { casora: I.TILE_TYPES.filter((t) => !t.hidden).map((t) => t.label + (t.casora ? '*' : '')), user: I.USER_TILE_TYPES.map((t) => t.label + ' [' + [].concat(t.template).join('+') + ']') };
});
console.log('Kacheltypen:', types.casora.length, types.casora.join(', '));
console.log('Eigene (yours):', types.user.length, types.user.join(', '));

// Casora-Kacheln per Panel-Modell hinzufügen (wie „+“ nach Typwahl) und speichern
const add = await H((D) => {
  const p = window.__panel(); const I = window.__casoraPanelInternals;
  const want = { '3D-Drucker': D, 'Waschmaschine': null, 'Geschirrspüler': null, 'Aquarium': null, 'Auto': null, 'Kalender': null };
  const room = p._state.compact.rooms[0];
  const out = [];
  for (const t of I.TILE_TYPES.filter((x) => (window.CASORA_TILE_TYPES || []).includes(x))) {
    const before = room.tiles.length;
    p._state.compact.rooms[0].tiles.push({ type: 'custom:button-card', template: I.clone(t.template), variables: {} });
    out.push(t.id + ' → ' + [].concat(t.template).join('+'));
  }
  p._markDirty && p._markDirty();
  return out;
}, HAUS.drucker_status);
console.log('Hinzugefügt:', add);
const saved = await H(async () => { const p = window.__panel(); try { const r = await p._save(); return 'ok ' + r; } catch (e) { return 'FEHLER ' + e.message; } });
console.log('Speichern:', saved);
await page.waitForTimeout(3000);
await step('n3_editor');

const cfg = await H(async () => {
  const h = document.querySelector('home-assistant').hass;
  window.__u = window.__panel()._dashUrl; const c = await h.callWS({ type: 'lovelace/config', url_path: window.__panel()._dashUrl });
  const row = (c.views[0].cards || []).find((x) => x.type === 'custom:casora-smart-row');
  const tpl = c.button_card_templates || {};
  const missing = new Set();
  JSON.stringify(c.views, (k, v) => { if (k === 'template') [].concat(v).forEach((n) => { if (typeof n === 'string' && !tpl[n]) missing.add(n); }); return v; });
  return { url: window.__u, views: c.views.length, kiosk: !!c.kiosk_mode, tiles: row ? row.cards.map((x) => [].concat(x.template || x.type).join('+')) : null, templates: Object.keys(tpl).length, missing: [...missing] };
});
console.log('Gespeichert:', JSON.stringify(cfg));

const missingI18n = await H(() => window.casoraI18nMissing());
fs.writeFileSync('/tmp/casora-e2e/i18n_missing_t03.json', JSON.stringify(missingI18n, null, 1));
console.log('Unübersetzt:', missingI18n.length, missingI18n.slice(0, 30));

await page.goto(BASE + '/' + JSON.parse(JSON.stringify(cfg)).url + '/home', { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: (await import('./harness.mjs')).PIERCE });
await page.waitForTimeout(9000);
const bad = await H(() => window.__pierce('hui-error-card').map((e) => { const c = e._config || e.config || {}; return (c.error || '') + ' ← ' + JSON.stringify(c.origConfig || c).slice(0, 200); }));
console.log('Fehlerkarten:', bad.length, bad.slice(0, 5));
await step('n4_dashboard');
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 8));
await browser.close();
