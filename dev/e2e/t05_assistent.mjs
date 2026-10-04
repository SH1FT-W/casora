// Geräte-Assistent: Vorschläge für das in t03 angelegte Dashboard, Wunsch-Eingabe, Einbauen, Speichern.
import { open, ready, shot } from './harness.mjs';
const DASH = process.argv[2] || 'test-neu';
const WISH = process.argv[3] || 'Bau den Luftreiniger im Büro ein';
const { browser, page, errors } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
const H = (fn, arg) => page.evaluate(fn, arg);
const step = async (name) => { await page.waitForTimeout(900); console.log('  📸', await shot(page, name)); };

await H(async (d) => { const p = window.__panel(); p._setDash(d); p._remember(d); await p._load(); }, DASH);
await page.waitForTimeout(3000);
console.log('Dashboard:', await H(() => window.__panel()._dashUrl));
const menu = await H(() => { const p = window.__panel(); return typeof p._casoraAssist; });
console.log('Assistent vorhanden:', menu);

const sug = await H(() => { const p = window.__panel(); const I = window.__casoraPanelInternals;
  return window.casoraAssist.suggest(p._hass, p._state.compact.rooms, I.TILE_TYPES.filter((t) => !t.hidden)); });
const byRoom = {};
sug.forEach((s) => { const k = s.room || '(kein Raum)'; (byRoom[k] = byRoom[k] || []).push(s.name + ' → ' + s.type + ' [' + s.reason + ']'); });
console.log('Vorschläge:', sug.length);
for (const [k, v] of Object.entries(byRoom)) console.log('  ' + k + ': ' + v.slice(0, 6).join(', ') + (v.length > 6 ? ` … (+${v.length - 6})` : ''));

await H(() => window.__panel()._casoraAssist());
await page.getByText('Geräte-Assistent', { exact: true }).waitFor({ timeout: 10000 });
await step('a1_liste');

await H((w) => { const i = window.__pierce('.flowin input.fin')[0]; i.value = w; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }, WISH);
await page.waitForTimeout(2500);
const after = await H(() => ({
  note: window.__pierce('.casora-assist-note')[0]?.textContent,
  rows: window.__pierce('.flowin .frow').map((r) => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)).filter((t) => !/^Wunsch/.test(t)),
  btn: window.__pierce('button').filter((b) => b.offsetParent && /einbauen|Add \d/i.test(b.textContent)).map((b) => b.textContent.trim()),
}));
console.log('Wunsch „' + WISH + '“:', JSON.stringify(after, null, 1));
await step('a2_wunsch');

const before = await H(() => window.__panel()._state.compact.rooms.map((r) => r.name + ':' + r.tiles.length).join(' '));
await page.getByText(after.btn.find((b) => /Kachel/.test(b)) || after.btn[0], { exact: true }).click();
await page.waitForTimeout(1500);
const now = await H(() => window.__panel()._state.compact.rooms.map((r) => r.name + ':' + r.tiles.length).join(' '));
console.log('Vorher:', before, '\nNachher:', now);
const status = await H(() => (window.__pierce('#status, .status')[0] || {}).textContent);
console.log('Status:', status);
await step('a3_eingebaut');
const saved = await H(async () => { try { return 'ok ' + await window.__panel()._save(); } catch (e) { return 'FEHLER ' + e.message; } });
console.log('Speichern:', saved);
console.log('Unübersetzt (Assistent):', (await H(() => window.casoraI18nMissing())).filter((s) => /device|tile|room|add|wish|describe/i.test(s)));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
await browser.close();
