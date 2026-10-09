#!/usr/bin/env node
// Gestaffeltes Gate: welche Tests berühren die geänderten Dateien? (dev/qa/gate.sh --umfang patch,
// --nachholen). Ohne Home Assistant, nur aus Git und den Testquellen.
//
//   node dev/qa/auswahl.mjs --basis <commit> [--out auswahl.json] [--nur-tabelle]
//
// Geändert = git diff <basis>..HEAD plus nicht committete Änderungen. Je Datei, in dieser Reihenfolge:
//   1. Doku, Changelog, Bilder, Unit-Tests, Release-Werkzeuge → nur Grundprüfungen (statisch + Unit)
//   2. ein Test selbst (dev/qa/regress/rNN…, dev/e2e/tNN…) → genau dieser Test
//   3. Kopfzeile „// @deckt: <muster> …“ in einem Test (Glob, z. B. custom_components/casora/scripts/local/12-tanken.js
//      oder **/casora-panel-updates.js) → dieser Test
//   4. automatisch aus Inhalten:
//      - Vorlagen (button_card_templates.json): geänderte Vorlagen samt allen, die von ihnen erben →
//        Tests, deren Quelle den Vorlagennamen nennt
//      - Dashboard-Skripte (scripts/…): dort definierte Elemente/Globale (customElements.define,
//        window._casora…) und die Vorlagen, die sie aufrufen → Tests, die einen davon nennen
//      - Studio (panel/…): Tests, die das Studio öffnen (studio(…), /casora-studio, __panel)
//   5. nichts gefunden → der Zustand (bzw. die Zustände) der Datei komplett (wie früher --gezielt)
// Gate-Infrastruktur (lib.mjs, harness.mjs, pool.mjs, Mock …) → alle Zustände komplett.
// Überlauf-Stichworte im Diff einer Oberflächen-Datei → zusätzlich stress (voller Klick-Durchlauf).
//
// Ausgabe: Tabelle Datei → Tests (Grund), am Ende je Zustand die Auswahl. --out schreibt JSON:
//   { basis, files: [{ file, tests, states, grund }], states: { arbeit: { komplett, e2e, regress, crawler, teile }, … } }
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const BASIS = opt('basis', '');
const HEAD = opt('head', 'HEAD');   // zum Ausprobieren gegen alte Stände; nur bei HEAD zählt der Arbeitsstand mit
if (!BASIS) { console.error('Aufruf: auswahl.mjs --basis <commit> [--out datei.json]'); process.exit(2); }
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8', maxBuffer: 256 << 20 });
const STATES = ['arbeit', 'stress', 'frisch'];
for (const r of [BASIS, HEAD]) {
  try { git('rev-parse', '--verify', '-q', r + '^{commit}'); } catch (e) { console.error(`auswahl: unbekannter Commit ${r}`); process.exit(2); }
}

// ── Tests einlesen ────────────────────────────────────────────────────────────────────────
const tests = [];
const head = (src, n = 12) => src.split('\n').slice(0, n).join('\n');
for (const f of fs.readdirSync(path.join(REPO, 'dev/qa/regress')).filter((x) => /\.mjs$/.test(x) && x !== 'lib.mjs').sort()) {
  const src = fs.readFileSync(path.join(REPO, 'dev/qa/regress', f), 'utf8');
  const z = (head(src, 5).match(/^\/\/ @zustand: *([a-z]*)/m) || [])[1] || 'frisch';
  tests.push({ id: f.replace(/\.mjs$/, ''), file: 'dev/qa/regress/' + f, kind: 'regress', state: z, src });
}
const alle = fs.readFileSync(path.join(REPO, 'dev/e2e/alle.sh'), 'utf8');
for (const t of (((alle.match(/for t in ([^;]*)/) || [])[1]) || '').trim().split(/\s+/).filter(Boolean)) {
  const f = path.join(REPO, 'dev/e2e', t + '.mjs');
  if (fs.existsSync(f)) tests.push({ id: t, file: 'dev/e2e/' + t + '.mjs', kind: 'e2e', state: 'arbeit', src: fs.readFileSync(f, 'utf8') });
}
// „// @deckt: a b“ (auch mehrere Zeilen) in den ersten 20 Zeilen.
const glob = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$');
for (const t of tests) t.deckt = [...head(t.src, 20).matchAll(/^\/\/ @deckt: *(.+)$/gm)].flatMap((m) => m[1].trim().split(/\s+/)).map((g) => ({ g, re: glob(g) }));
const word = (s) => new RegExp('(?<![\\w-])' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w-])');
const mention = (t, names) => names.find((n) => word(n).test(t.src));

// ── Vorlagen ─────────────────────────────────────────────────────────────────────────────
const TPL = 'dashboards/casora/button_card_templates.json';
const readJson = (rev, f) => { try { return JSON.parse(rev ? git('show', rev + ':' + f) : fs.readFileSync(path.join(REPO, f), 'utf8')); } catch (e) { return {}; } };
const tplNow = readJson(HEAD === 'HEAD' ? null : HEAD, TPL);
const parents = (t) => [].concat((tplNow[t] || {}).template || []);
// Alle Vorlagen, die (auch über Zwischenstufen) von einer aus <set> erben.
const heirs = (set) => {
  const out = new Set(set);
  for (let grew = true; grew;) { grew = false; for (const k of Object.keys(tplNow)) if (!out.has(k) && parents(k).some((p) => out.has(p))) { out.add(k); grew = true; } }
  return [...out];
};

// ── Geänderte Dateien ─────────────────────────────────────────────────────────────────────
const files = [...new Set([...git('diff', '--name-only', BASIS, HEAD).split('\n'), ...(HEAD === 'HEAD' ? git('diff', '--name-only', 'HEAD').split('\n') : [])].filter(Boolean))].sort();
const diffOf = (f) => { try { return HEAD === 'HEAD' ? git('diff', BASIS, '--', f) : git('diff', BASIS, HEAD, '--', f); } catch (e) { return ''; } };
const changedLines = (f) => diffOf(f).split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---) /.test(l));
const STRESS_RE = /overflow|ellipsis|nowrap|scroll|flex-wrap|line-clamp|max-width|min-width|white-space|grid-template|Überlauf|lange Namen/i;
const UI_FILE = /^(custom_components\/casora\/(scripts|panel)\/|dashboards\/)/;

// Zustände, wenn nichts Genaueres gefunden wird (wie das frühere --gezielt).
function fallback(f) {
  if (/^custom_components\/casora\/panel\/casora-panel-(umzug|import|assist|welcome)\.js$/.test(f)) return [['frisch', 'arbeit'], 'Umzug/Import/Assistent'];
  if (/^custom_components\/casora\/(.*\.py|ki\/)|^tools\/build-(panel-)?i18n\.py$/.test(f)) return [['frisch', 'arbeit'], 'Python/Setup'];
  if (/^custom_components\/casora\/(theme_.*\.yaml|assets\/|translations\/)|^www\//.test(f)) return [['arbeit'], 'Theme/Bilder/Texte'];
  if (/^(custom_components\/casora\/(panel|scripts)\/|dashboards\/|custom_components\/casora\/.*\.yaml$)/.test(f)) return [['arbeit'], 'Dashboard/Panel'];
  if (/^dev\/stress\//.test(f)) return [['stress'], 'Stresshaus'];
  return [STATES, 'unbekannt – sicherheitshalber alles'];
}

// Elemente/Globale je Skript, und wie viele Skripte jeden setzen.
const defsOf = (f) => { const src = fs.readFileSync(path.join(REPO, f), 'utf8');
  return [...new Set([...src.matchAll(/customElements\.define\(\s*['"]([a-z0-9-]+)['"]/g)].map((m) => m[1])
    .concat([...src.matchAll(/window\.(_{1,2}casora[A-Za-z0-9_]+)\s*=(?!=)/g)].map((m) => m[1])))]; };
const DEFCOUNT = new Map();
for (const d of ['custom_components/casora/scripts', 'custom_components/casora/scripts/local']) {
  for (const x of fs.readdirSync(path.join(REPO, d)).filter((y) => y.endsWith('.js'))) for (const g of defsOf(d + '/' + x)) DEFCOUNT.set(g, (DEFCOUNT.get(g) || 0) + 1);
}
const rows = [];
const sel = Object.fromEntries(STATES.map((s) => [s, { komplett: false, tests: new Set(), teile: new Set(), crawl: false, grund: [] }]));
const add = (t) => sel[t.state] && sel[t.state].tests.add(t);
const studioTests = tests.filter((t) => /\bstudio\(|casora-studio|__panel\b/.test(t.src));
for (const f of files) {
  let hit = [], states = [], grund = '', teile = [];
  if (/\.md$|^docs\/|^LICENSE$|^\.github\/|^brand\/|^hacs\.json$|^\.gitignore$|^custom_components\/casora\/brand\/|^dev\/demo\//.test(f)) grund = 'Doku/Bilder';
  else if (/^dev\/unit\//.test(f)) grund = 'Unit-Test (läuft immer)';
  else if (/^tools\/(release\.sh|sync-changelog\.py|privacy-check\.py|qa_gate\.py|build-card-update\.py|i18ncheck\.py|phrase-gaps\.py)$/.test(f)) grund = 'Werkzeug (statische Prüfung)';
  else if (/^dev\/qa\/(alles\.mjs|inpage\.js)$/.test(f)) {
    // Nur der Klick-Durchlauf (schnell in arbeit, voll in stress) – keine Regress-/E2E-Tests.
    ['desktop-studio', 'desktop-dashboard', 'phone-studio', 'phone-dashboard'].forEach((x) => sel.arbeit.teile.add(x));
    sel.stress.crawl = true; grund = 'Klick-Durchlauf (arbeit schnell, stress voll)';
  }
  else if (/^dev\/(qa\/regress\/lib\.mjs|e2e\/harness\.mjs|e2e\/ergebnis\.mjs|qa\/(pool|token|ws|bereit)\.mjs|qa\/(gate|wegwerf-ha)\.sh|qa\/stress-setup\.mjs|haus\.sh|casora_mock\/)/.test(f)) { states = STATES; grund = 'Gate-Infrastruktur/Mock → alles'; }
  else if (/^dev\/qa\/(auswahl|nachholen)\.mjs$/.test(f)) grund = 'Gate-Auswahl (statische Prüfung)';
  // Release-Teile: Version im manifest, Texte im Neu-Popup (nur Zeichenketten geändert) – Syntax prüft statisch.
  else if (f === 'custom_components/casora/manifest.json' && changedLines(f).every((l) => /^[+-]\s*"version":/.test(l))) grund = 'nur Version';
  else if (f === 'custom_components/casora/panel/casora-panel-welcome.js' && changedLines(f).every((l) => /^[+-]\s*(\w+: *"(?:[^"\\]|\\.)*",? *)+$|^[+-]\s*\[ *("(?:[^"\\]|\\.)*",? *)+\],?$|^[+-]\s*$|^[+-]\s*\/\//.test(l))) {
    hit = tests.filter((t) => /casora-panel-welcome|WHATS_NEW|Neu-Popup/.test(t.src)); grund = 'nur Texte im Neu-Popup';
  }
  else if (tests.some((t) => t.file === f)) { hit = tests.filter((t) => t.file === f); grund = 'Test selbst'; }
  else if (!fs.existsSync(path.join(REPO, f)) && /^dev\/(qa\/regress|e2e)\//.test(f)) grund = 'Test gelöscht';
  else if (/^dev\/(qa|e2e)\//.test(f)) {
    // Prüfhilfe (z. B. dev/qa/ausrichtung.mjs): die Tests, die sie laden.
    const base = path.basename(f);
    hit = tests.filter((t) => t.src.includes(base));
    grund = hit.length ? `Prüfhilfe, geladen von ${hit.length} Test(s)` : 'Prüfhilfe ohne Gate-Lauf';
  }
  else {
    const tagged = tests.filter((t) => t.deckt.some((d) => d.re.test(f)));
    let auto = [], why = [];
    if (f === TPL || f === 'custom_components/casora/panel/casora-templates.json') {
      const old = readJson(BASIS, TPL);
      const changed = Object.keys({ ...old, ...tplNow }).filter((k) => JSON.stringify(old[k]) !== JSON.stringify(tplNow[k]));
      const names = heirs(changed);
      auto = tests.filter((t) => mention(t, names));
      why.push(`Vorlagen ${changed.slice(0, 4).join(', ')}${changed.length > 4 ? ' …' : ''}${names.length > changed.length ? ` (+${names.length - changed.length} erbende)` : ''}`);
      teile = ['desktop-dashboard', 'phone-dashboard'];
      if (!changed.length) why.push('keine Vorlage geändert');
    } else if (/^custom_components\/casora\/scripts\/.*\.js$/.test(f) && fs.existsSync(path.join(REPO, f))) {
      // Globale, die mehrere Skripte setzen (z. B. _casoraSuppressDismiss), sagen nichts über diese Datei.
      const defs = defsOf(f).filter((d) => (DEFCOUNT.get(d) || 0) <= 1);
      // Vorlagen, die diese Globalen aufrufen, und ihre Erben.
      const users = Object.keys(tplNow).filter((k) => defs.some((d) => JSON.stringify(tplNow[k]).includes(d)));
      const names = defs.concat(heirs(users));
      auto = tests.filter((t) => mention(t, names));
      if (defs.length) why.push(`${defs.length} Elemente/Globale${users.length ? `, ${users.length} Vorlagen` : ''}`);
      teile = ['desktop-dashboard', 'phone-dashboard'];
    } else if (/^custom_components\/casora\/panel\/casora-panel.*\.js$/.test(f) && !fallback(f)[0].includes('frisch')) {
      auto = studioTests;
      why.push('Studio');
      teile = ['desktop-studio', 'phone-studio'];
    }
    hit = [...new Set([...tagged, ...auto])];
    grund = [tagged.length ? `@deckt (${tagged.length})` : '', ...why].filter(Boolean).join(', ');
    if (!hit.length) { const [z, g] = fallback(f); states = z; grund = (grund ? grund + ' → ' : '') + 'keine Zuordnung → Zustand komplett: ' + g; teile = []; }
  }
  // Überlauf-Hinweise im Diff → stress komplett (voller Klick-Durchlauf); nur Oberflächen-Dateien.
  if (UI_FILE.test(f) && !states.includes('stress') && diffOf(f).split('\n').some((l) => /^[+-][^+-]/.test(l) && STRESS_RE.test(l))) {
    states = [...states, 'stress']; grund += ', Überlauf/Listen im Diff → stress';
  }
  for (const t of hit) add(t);
  for (const z of states) sel[z].komplett = true;
  if (teile.length && hit.some((t) => t.state === 'arbeit')) teile.forEach((x) => sel.arbeit.teile.add(x));
  rows.push({ file: f, tests: hit.map((t) => t.id), states, grund });
}

// ── Ergebnis ──────────────────────────────────────────────────────────────────────────────
const out = { basis: git('rev-parse', BASIS).trim(), head: git('rev-parse', HEAD).trim(), files: rows, states: {} };
for (const z of STATES) {
  const s = sel[z];
  const e2e = [...s.tests].filter((t) => t.kind === 'e2e').map((t) => t.id);
  const regress = [...s.tests].filter((t) => t.kind === 'regress').map((t) => t.id);
  out.states[z] = s.komplett ? { komplett: true, crawler: z === 'arbeit' ? 'quick' : z === 'stress' ? 'full' : null }
    : { komplett: false, e2e, regress, crawler: z === 'arbeit' && s.teile.size ? 'quick' : z === 'stress' && s.crawl ? 'full' : null, teile: [...s.teile] };
}
if (opt('out', '')) fs.writeFileSync(opt('out', ''), JSON.stringify(out, null, 1));

console.log(`Auswahl: ${rows.length} geänderte Dateien seit ${out.basis.slice(0, 12)}`);
for (const r of rows) {
  const what = r.states.length ? `${r.states.join('+')} komplett${r.tests.length ? ' + ' + r.tests.join(', ') : ''}` : r.tests.length ? r.tests.join(', ') : 'nur statisch/Unit';
  console.log(`  ${r.file.padEnd(60)} → ${what}  (${r.grund})`);
}
for (const z of STATES) {
  const s = out.states[z];
  const n = s.komplett ? 'komplett' : [s.e2e.length ? `E2E ${s.e2e.join(' ')}` : '', s.regress.length ? `Regress ${s.regress.join(' ')}` : '',
    s.crawler ? `Klick-Durchlauf ${s.crawler === 'full' ? 'voll' : s.teile.join(' ')}` : ''].filter(Boolean).join(' · ') || '–';
  console.log(`  ⇒ ${z.padEnd(7)} ${n}`);
}
