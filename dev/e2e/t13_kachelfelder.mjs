// Casora-Kacheln im Studio: Symbol in der Kachelliste, Editor-Felder, Finder-Platzhalter, „Mit KI ergänzen“.
// Arbeitet nur im Speicher des Panels – es wird nichts gespeichert.
import { open, ready, shot } from './harness.mjs';
const DASH = process.argv[2] || 'dashboard-hemma'; // Adresse des Test-Dashboards
const { browser, page, errors } = await open();
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._state && p._hass; });
const H = (fn, arg) => page.evaluate(fn, arg);
await H(async (d) => { const p = window.__panel(); p._setDash(d); p._remember(d); await p._load(); }, DASH);
await page.waitForTimeout(3000);

// 1) Alle Casora-Kacheln im Dashboard: Typ erkannt, Symbol vorhanden?
const all = await H(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const out = [];
  p._state.compact.rooms.forEach((r) => r.tiles.forEach((t) => {
    const ty = I.tileTypeAny(t);
    if (ty && (String(ty.id).startsWith('casora_') || [].concat(t.template || []).includes('casora_popup_fbh')))
      out.push({ room: r.name, name: t.name || '', type: ty.id, fields: (ty.fields || []).length, icon: ty.icon || null });
  }));
  return out;
});
console.log('Casora-Kacheln:', all.length);
all.forEach((x) => console.log('  ' + x.room + ' · ' + (x.name || '–') + ' → ' + x.type + ' · felder ' + x.fields + ' · symbol ' + x.icon));

// 2) Raum mit Waschmaschine öffnen, Kachelliste prüfen
const room = (all.find((x) => x.type === 'casora_washer') || all[0]).room;
await page.locator('.tablabel', { hasText: room }).first().click();
await page.waitForTimeout(1200);
// Raum-Abschnitte stehen gestapelt und eingeklappt im Bereich (Seitenleiste nur im schmalen Studio).
const sec = page.locator('.grouphead.stackhead', { hasText: 'Kacheln' });
if (await sec.count()) await sec.first().click();
else await page.locator('button.siderow', { hasText: 'Kacheln' }).first().click();
await page.waitForTimeout(1500);
const rows = await H(() => window.__pierce('.tilegrid .tile .thead').map((h) => ({
  name: (h.querySelector('.grow') || {}).textContent?.trim(),
  icon: !!h.querySelector('.sicon'),
  url: (h.querySelector('.sicon')?.style.getPropertyValue('--i') || '').slice(0, 60),
})));
console.log('Kachelliste ' + room + ':');
rows.forEach((r) => console.log('  ' + (r.icon ? '✓' : '✗ OHNE SYMBOL') + ' ' + r.name + '  ' + r.url));
await page.evaluate(() => window.__pierce('.tilegrid')[0]?.scrollIntoView({ block: 'center' }));
console.log('  📸', await shot(page, 'k1_liste'));

// Symbol-Dateien erreichbar?
const urls = [...new Set(rows.map((r) => (r.url.match(/url\('([^']+)'/) || [])[1]).filter((u) => u && u.startsWith('/')))];
for (const u of urls) {
  const s = await H(async (x) => (await fetch(x)).status, u);
  console.log('  ' + s + ' ' + u);
}

// 3) Waschmaschine öffnen: Felder + Platzhalter
await page.locator('.tilegrid .tile .thead', { hasText: 'Waschmaschine' }).first().click();
await page.waitForTimeout(1500);
await page.locator('button.advsum:visible', { hasText: 'Popup' }).first().click();
await page.waitForTimeout(800);
const form = await H(() => window.__pierce('.row').filter((r) => r.offsetParent).map((r) => {
  const l = r.querySelector('label')?.textContent?.trim();
  const i = r.querySelector('input');
  return l ? l + ' = ' + (i ? (i.value || '[' + (i.placeholder || '') + ']') : '…') : null;
}).filter(Boolean));
console.log('Felder Waschmaschine:');
form.forEach((f) => console.log('  ' + f));
const ai = await H(() => { const r = window.__pierce('.casora-ai')[0]; return r ? r.textContent.trim() : null; });
console.log('KI-Zeile:', ai);
console.log('  📸', await shot(page, 'k2_waschmaschine'));

// 4) KI-Knopf: Plug-Feld leeren und Finder abschalten, damit die KI etwas zu tun hat
const res = await H(async () => {
  const p = window.__panel();
  const room = p._state.compact.rooms.find((r) => r.tiles.some((t) => [].concat(t.template || []).includes('casora_waschmaschine')));
  const tile = room.tiles.find((t) => [].concat(t.template || []).includes('casora_waschmaschine'));
  const saveCD = window.casoraDevice; window.casoraDevice = null;
  if (tile.variables) { delete tile.variables.plug_entity; delete tile.variables.appliance_progress; }
  p._renderForm();
  await new Promise((r) => setTimeout(r, 500));
  const b = window.__pierce('.casora-ai button')[0];
  if (!b) { window.casoraDevice = saveCD; return 'kein Knopf'; }
  b.click();
  for (let i = 0; i < 40 && !(tile.variables && tile.variables.plug_entity); i++) await new Promise((r) => setTimeout(r, 250));
  const txt = (window.__pierce('.casora-ai')[0] || {}).textContent;
  window.casoraDevice = saveCD;
  return { vars: tile.variables, text: txt };
});
console.log('KI-Ergebnis:', JSON.stringify(res));
console.log('  📸', await shot(page, 'k3_ki'));
console.log('Unübersetzt:', (await H(() => window.casoraI18nMissing())).slice(0, 20));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
await browser.close();
