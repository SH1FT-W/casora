// fix3 (Feinschliff 1.3, AB-10): In der Rückfrage „Hemma entfernen?“ begann der Text der Ankreuz-Zeilen
// (Hemma-Dashboards, www/hemma) 8 px weiter rechts als der Text der Punkt-Zeilen (Kästchen 16 px, Punkt 8 px).
// Prüft mit dem echten CSS (Chromium): in der Liste mit Ankreuz-Zeilen fluchten Texte und Markenmitten.
//   node dev/unit/hemma_entfernen_einzug.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-settings.js', import.meta.url), 'utf8');
assert.match(src, /title: t\("Remove Hemma\?"\)[\s\S]{0,400}el\("div", "chr-list chr-mix"\)/, 'Rückfrage nutzt die Liste mit Ankreuz-Ausgleich');
const css = [...src.matchAll(/\+ ("\.chr-(?:[^"\\]|\\.)*")/g)].map((m) => JSON.parse(m[1])).join('');
assert.ok(css.includes('.chr-item>input'), 'chr-CSS gefunden');
const pw = (() => {
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) { const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs'); if (fs.existsSync(f)) return f; }
  return 'playwright';
})();
// Ohne Playwright (z. B. GitHub-CI ohne Browser) nur der statische Teil oben – der Browser-Teil läuft im Gate.
let chromium;
try { ({ chromium } = await import(pw)); } catch (e) { console.log('übersprungen (Browser-Teil): kein Playwright'); process.exit(0); }
const b = await chromium.launch();
const pg = await b.newPage();
await pg.setContent(`<style>:root{--t-foot:13px;--t-caption:12px}body{margin:0;font-family:system-ui}${css}</style>
  <div class="chr-list chr-mix" style="width:500px">
    <div class="chr-item"><i></i><div><b>Hemma-Integration</b><span>1 Eintrag</span></div></div>
    <div class="chr-item"><input type="checkbox" checked id="a"><label for="a"><b>Hemma</b><span>Umgezogen</span></label></div>
    <div class="chr-item info"><i></i><div><b>Hemma 2</b></div></div>
    <div><div class="chr-item"><input type="checkbox" id="c"><label for="c"><b>www/hemma</b></label></div></div>
  </div>`);
const rows = await pg.evaluate(() => [...document.querySelectorAll('.chr-item')].map((r) => {
  const t = r.querySelector(':scope>label, :scope>div').getBoundingClientRect(), m = r.querySelector(':scope>i, :scope>input').getBoundingClientRect();
  return { text: t.left, mitte: m.left + m.width / 2 };
}));
await b.close();
const texte = new Set(rows.map((r) => Math.round(r.text))), mitten = new Set(rows.map((r) => Math.round(r.mitte)));
assert.equal(texte.size, 1, 'Texteinzug je Zeile: ' + rows.map((r) => r.text).join(', '));
assert.equal(mitten.size, 1, 'Punkt-/Kästchenmitte: ' + rows.map((r) => r.mitte).join(', '));
console.log('ok hemma_entfernen_einzug');
