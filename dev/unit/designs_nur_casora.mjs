// Seit 1.6.1 nur noch Casora-Designs: „Casora“, „Casora Nebel“ und „Casora Glas“ (Hemma 1/2 entfernt).  node dev/unit/designs_nur_casora.mjs
// Auswahl im Assistenten und im Studio, Umstellung alter Namen im Browser, keine verwaisten Vorschaubilder.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const cc = new URL('../../custom_components/casora/', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, cc), 'utf8');
const src = read('panel/casora-panel.js');
const from = src.indexOf('const CASORA_THEME = ');
const to = src.indexOf('const isCasoraTheme = ', from);
assert.ok(from > 0 && to > from);
const { CASORA_THEMES, THEME_RENAMED } = new Function(src.slice(from, to) + '\nreturn { CASORA_THEMES, THEME_RENAMED };')();

assert.deepEqual(CASORA_THEMES.map((x) => x.name), ['Casora', 'Casora Nebel', 'Casora Glas'], 'Casora, Nebel und Glas zur Wahl');
// Alte Namen landen weiter auf Casora, nie auf Casora Glas
assert.ok(!Object.values(THEME_RENAMED).includes('Casora Glas'), 'keine Umleitung auf Casora Glas');
for (const old of ['Hemma 2', 'Hemma 1', 'Casora Standard', 'Casora Glass', 'Casora Weich']) {
  assert.equal(THEME_RENAMED[old], 'Casora', old + ' → Casora');
}
// Bilder der Auswahl gibt es, die der alten Designs nicht mehr
for (const x of CASORA_THEMES) for (const u of Object.values(x.shot)) {
  assert.ok(fs.existsSync(new URL('assets/themes/' + u.split('/').pop(), cc)), 'Vorschau fehlt: ' + u);
}
const imgs = fs.readdirSync(new URL('assets/themes/', cc));
assert.ok(!imgs.some((f) => /^(hemma|glass|perf-glass)-/.test(f)), 'keine Hemma-Vorschaubilder mehr');
assert.ok(!/perf-glass|"glass"|look-glass|Hemma 1 \(Legacy\)|Hemma 2 \(Legacy\)/.test(src + read('panel/casora-panel-addons.js')),
  'kein Glas-/Legacy-Zweig in der Design-Wahl');
// Browser: ein altes Theme wechselt nur, wenn es das alte nicht mehr gibt (Hemmas „Hemma“ bleibt, solange es da ist)
assert.ok(/hass\.themes\.themes\[to\] && !hass\.themes\.themes\[sel\.theme\]/.test(src), 'Browser-Umstellung prüft altes Theme');
// Integration meldet nur theme_*.yaml an, kein Glas-Theme mehr
assert.ok(!fs.existsSync(new URL('theme_glass.yaml', cc)), 'theme_glass.yaml entfernt');
assert.ok(/^Casora Basis:/m.test(read('theme.yaml')), 'theme.yaml = Grundwerte, kein Design');
// Casora Glas: Casora mit Milchglas – baut auf Casora auf (soft-Zweig geerbt), schaltet ihn nicht ab
const glas = read('theme_glas.yaml');
const glasCode = glas.replace(/#.*$/gm, '');
assert.ok(/^Casora Glas:/m.test(glas), 'theme_glas.yaml meldet „Casora Glas“ an');
assert.ok(/^\s+casora-theme-base:\s*Casora\s*$/m.test(glasCode), 'Casora Glas baut auf Casora auf');
assert.ok(!/casora-popup-layout/.test(glasCode), 'Casora Glas behält casora-popup-layout: soft von Casora');
assert.ok(/ha-card-backdrop-filter:\s*blur\(/.test(glasCode), 'Casora Glas setzt Milchglas (backdrop-filter)');
// Leistungsmodus: casora-core.js ersetzt halbtransparente Glas-Flächen nur über Ersatzwerte des Themes
// (MORE). Casora Glas bringt jeden davon hell und dunkel mit; Casora/Nebel setzen keinen (bleiben gleich).
const core = fs.readFileSync(new URL('scripts/casora-core.js', cc), 'utf8');
const more = [...core.slice(core.indexOf('var MORE = ['), core.indexOf('function css()')).matchAll(/'(--casora-perf-[a-z-]+)'/g)].map((m) => m[1].slice(2));
assert.ok(more.length >= 5, 'Perf-Ersatzliste MORE gefunden');
const modeOf = (txt, m) => { const i = txt.indexOf('\n    ' + m + ':'); const j = txt.indexOf('\n    ' + (m === 'light' ? 'dark' : 'zzz') + ':', i + 1); return txt.slice(i, j > i ? j : undefined); };
for (const v of new Set(more)) for (const m of ['light', 'dark']) {
  assert.ok(new RegExp('^\\s+' + v + ':', 'm').test(modeOf(glasCode, m)), 'Casora Glas ' + m + ': ' + v + ' fehlt');
}
for (const f of ['theme_weich.yaml', 'theme_nebel.yaml']) for (const v of new Set(more)) {
  assert.ok(!new RegExp('^\\s+' + v + ':', 'm').test(read(f)), f + ' darf ' + v + ' nicht setzen (Casora/Nebel unverändert)');
}
console.log('ok designs_nur_casora');
