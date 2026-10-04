// Bestehendes Dashboard (Kopie des eigenen) im Studio laden, speichern, vergleichen, rendern.
import { open, ready, shot, PIERCE, BASE } from './harness.mjs';
const DASH = process.argv[2] || 'dashboard-hemma'; // Adresse des Test-Dashboards
const { browser, page, errors } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
const H = (fn, a) => page.evaluate(fn, a);
const get = (u) => H(async (u) => (await document.querySelector('home-assistant').hass.callWS({ type: 'lovelace/config', url_path: u })), u);
const before = await get(DASH), beforeM = await get(DASH + '-mobile').catch(() => null);
await H(async (d) => { const p = window.__panel(); p._setDash(d); await p._load(); }, DASH);
await page.waitForTimeout(3000);
const log = await H(() => (window.__panel()._logLines || window.__panel()._logs || []).slice(-15));
const dirty = await H(() => !window.__panel().$('save').disabled);
console.log('Nach dem Laden geändert?', dirty);
// Kleine echte Änderung: Name der ersten Kachel eines Raums (Rundlauf wie beim Bearbeiten).
if (process.env.UNLOCK) await H(() => { window.CASORA_STUDIO_SAVE_OK = true; });
const edit = await H(() => { const p = window.__panel(); const r = p._state.compact.rooms.find((x) => x.tiles.some((t) => t.type === 'custom:button-card' && t.name));
  const t = r.tiles.find((t) => t.type === 'custom:button-card' && t.name); const old = t.name; t.name = (old || 'Kachel') + ' Test'; p._markDirty(); return r.name + ': ' + old + ' → ' + t.name; });
console.log('Änderung:', edit, '– geändert markiert:', await H(() => !window.__panel().$('save').disabled));
// Die eigenen Haupt-Dashboards (dashboard-hemma[-mobile]) sperrt das Studio fürs Speichern –
// ohne UNLOCK=1 ist „gesperrt“ das erwartete Ergebnis, dann wird nichts geschrieben.
const locked = /^dashboard-hemma(-mobile)?$/.test(DASH) && !process.env.UNLOCK;
const r = await H(async () => { try { return 'ok ' + await window.__panel()._save(); } catch (e) { return 'FEHLER ' + e.message; } });
if (locked) console.log('Speichern:', r === 'ok false' ? 'gesperrt wie vorgesehen (UNLOCK=1 zum echten Rundlauf)' : 'FEHLER Sperre greift nicht: ' + r);
else console.log('Speichern:', r);
await page.waitForTimeout(2000);
const after = await get(DASH), afterM = await get(DASH + '-mobile').catch(() => null);
const J = (x) => JSON.stringify(x);
const diffViews = (a, b) => (a.views || []).map((v, i) => J(v) === J((b.views || [])[i]) ? null : (v.path || i)).filter((x) => x !== null);
const tplDiff = (a, b) => { const A = a.button_card_templates || {}, B = b.button_card_templates || {};
  return { changed: Object.keys(A).filter((k) => B[k] && J(A[k]) !== J(B[k])).length, added: Object.keys(B).filter((k) => !A[k]).length, removed: Object.keys(A).filter((k) => !B[k]) }; };
console.log('Desktop – geänderte Ansichten:', diffViews(before, after), 'Vorlagen:', J(tplDiff(before, after)));
if (beforeM) console.log('Handy – geänderte Ansichten:', diffViews(beforeM, afterM), 'Vorlagen:', J(tplDiff(beforeM, afterM)));
const revert = locked ? 'nicht nötig (gesperrt)' : await H(async () => { const p = window.__panel(); const r = p._state.compact.rooms.find((x) => x.tiles.some((t) => / Test$/.test(t.name || '')));
  const t = r.tiles.find((t) => / Test$/.test(t.name || '')); t.name = t.name.replace(/ Test$/, ''); p._markDirty(); return await p._save(); });
console.log('Zurückgesetzt und gespeichert:', revert);
for (const [u, o] of [[DASH + '/home', {}], [DASH + '-mobile', { width: 390, height: 844, mobile: true }]]) {
  if (o.mobile) { await page.setViewportSize({ width: 390, height: 844 }); }
  await page.goto(BASE + '/' + u, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: PIERCE });
  await page.waitForTimeout(9000);
  const bad = await H(() => window.__pierce('hui-error-card').map((e) => String((e._config || {}).message || '').slice(0, 140)));
  console.log(u, 'Fehlerkarten:', bad.length, bad.slice(0, 4));
  console.log('  📸', await shot(page, 'r9_' + u.replace(/\//g, '_')));
}
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
await browser.close();
