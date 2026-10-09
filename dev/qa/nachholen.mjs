#!/usr/bin/env node
// Nachholen statt Neulauf (dev/qa/gate.sh --nachholen[=<commit>]): Plan, welche Tests neu laufen.
//
//   node dev/qa/nachholen.mjs [--von <commit>] [--out plan.json]
//
// Vorlauf: das Gate-Ergebnis .qa/gate-<C>.json von --von bzw. das jüngste eines Vorfahren von HEAD
// (oder HEAD selbst) mit Ergebnis je Test. Zulässig nur, wenn
//   - der Vorlauf vollständig war (nicht --quick/--only, nicht auf geändertem Stand) und alle Aufbau-
//     Schritte grün waren (haus-*, *-setup, pool-*) – sonst fehlen Tests ganz,
//   - sich seit dem Vorlauf nur Tests geändert haben bzw. Dateien, die laut Zuordnung (auswahl.mjs)
//     allein bestimmte Tests betreffen; nichts, was einen Zustand komplett braucht.
// Neu laufen: die im Vorlauf roten Tests, die geänderten Tests und die laut Zuordnung betroffenen.
// War ein Klick-Durchlauf rot, läuft er für diesen Zustand ganz neu. Statisch + Unit laufen immer.
// Rückgabe 0 = Plan geschrieben, 2 = nicht zulässig (Grund in der Ausgabe).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const git = (...a) => execFileSync('git', ['-C', REPO, ...a], { encoding: 'utf8' }).trim();
const nein = (msg) => { console.log('✗ Nachholen nicht möglich: ' + msg + '\n  → volles Gate: dev/qa/gate.sh'); process.exit(2); };
const isAnc = (c) => { try { execFileSync('git', ['-C', REPO, 'merge-base', '--is-ancestor', c, 'HEAD']); return true; } catch (e) { return false; } };

const QA = path.join(REPO, '.qa');
let prevFile = null;
if (opt('von', '')) {
  let c;
  try { c = git('rev-parse', '--verify', '-q', opt('von', '') + '^{commit}'); } catch (e) { nein('unbekannter Commit ' + opt('von', '')); }
  prevFile = path.join(QA, `gate-${c}.json`);
  if (!fs.existsSync(prevFile)) nein(`kein Gate-Ergebnis für ${c.slice(0, 12)}`);
} else {
  let best = null;
  for (const f of fs.existsSync(QA) ? fs.readdirSync(QA).filter((x) => /^gate-[0-9a-f]{40}\.json$/.test(x)) : []) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(QA, f), 'utf8')); } catch (e) { continue; }
    if (!Array.isArray(d.tests) || !d.tests.length || !isAnc(d.commit)) continue;
    if (!best || d.timestamp > best.d.timestamp) best = { f: path.join(QA, f), d };
  }
  if (!best) nein('kein Gate-Lauf mit Ergebnis je Test für HEAD oder einen Vorfahren (.qa/gate-*.json)');
  prevFile = best.f;
}
const prev = JSON.parse(fs.readFileSync(prevFile, 'utf8'));
if (!isAnc(prev.commit)) nein(`Vorlauf ${prev.commit.slice(0, 12)} ist kein Vorfahre von HEAD`);
if (!Array.isArray(prev.tests) || !prev.tests.length) nein('Vorlauf hat kein Ergebnis je Test (älteres Gate) – einmal voll laufen lassen');
if (prev.quick || prev.partial || prev.dirty) nein('Vorlauf war ein Teillauf oder lief auf geändertem Arbeitsstand');
const badInfra = (prev.steps || []).filter((s) => !s.ok && !['static', 'unit', 'e2e', 'regress', 'crawler'].includes(s.group));
if (badInfra.length) nein('im Vorlauf scheiterte der Aufbau: ' + badInfra.map((s) => s.id).join(', ') + ' – dort fehlen Tests ganz');
const badSetup = (prev.steps || []).filter((s) => !s.ok && /-setup$/.test(s.id));
if (badSetup.length) nein('im Vorlauf scheiterte die Einrichtung: ' + badSetup.map((s) => s.id).join(', '));

// Was hat sich seit dem Vorlauf geändert, und welche Tests betrifft es?
const tmp = path.join(fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'casora-nach-')), 'auswahl.json');
try { execFileSync(process.execPath, [path.join(REPO, 'dev/qa/auswahl.mjs'), '--basis', prev.commit, '--out', tmp], { stdio: ['ignore', 'ignore', 'inherit'] }); }
catch (e) { nein('Zuordnung der Änderungen fehlgeschlagen'); }
const aus = JSON.parse(fs.readFileSync(tmp, 'utf8'));
const komplett = aus.files.filter((f) => f.states.length);
if (komplett.length) nein('seit dem Vorlauf geändert, betrifft ganze Zustände:\n    ' + komplett.map((f) => `${f.file} (${f.grund})`).join('\n    '));

const STATES = ['arbeit', 'stress', 'frisch'];
const plan = { vorlauf: prevFile, von: prev.commit, umfang: prev.umfang || 'voll', basis: prev.basis || null,
  geaendert: aus.files.map((f) => f.file), states: {} };
const lines = [];
for (const z of STATES) {
  const red = prev.tests.filter((t) => t.zustand === z && !t.ok);
  const s = aus.states[z] || {};
  const kinds = Object.fromEntries(prev.tests.filter((t) => t.zustand === z).map((t) => [t.id, t.schritt.split('-')[0]]));
  const e2e = new Set([...red.filter((t) => kinds[t.id] === 'e2e').map((t) => t.id), ...(s.e2e || [])]);
  const regress = new Set([...red.filter((t) => kinds[t.id] === 'regress').map((t) => t.id), ...(s.regress || [])]);
  // Klick-Durchlauf: Teile werden erst beim Zusammenführen bewertet – roter Schritt = alle Teile neu.
  const crawlRed = (prev.steps || []).some((x) => x.id === 'crawler-' + z && !x.ok);
  const teile = crawlRed ? (z === 'arbeit' ? ['desktop-studio', 'desktop-dashboard', 'phone-studio', 'phone-dashboard'] : null) : null;
  plan.states[z] = { komplett: false, e2e: [...e2e], regress: [...regress], crawler: crawlRed ? (z === 'arbeit' ? 'quick' : 'full') : null, teile: teile || [] };
  const n = [...e2e, ...regress].length;
  if (n || crawlRed) lines.push(`  ${z.padEnd(7)} ${[...e2e, ...regress].join(' ')}${crawlRed ? ' + Klick-Durchlauf' : ''}`
    + `  (rot im Vorlauf: ${red.length}, durch Änderungen: ${n - red.filter((t) => e2e.has(t.id) || regress.has(t.id)).length})`);
}
fs.writeFileSync(opt('out', path.join(QA, 'nachholen.json')), JSON.stringify(plan, null, 1));
console.log(`Nachholen auf Vorlauf ${prev.commit.slice(0, 12)} (${path.relative(REPO, prevFile)}, ${prev.umfang || 'voll'}${prev.ok ? ', war grün' : ''}):`);
if (aus.files.length) console.log('  geändert seitdem: ' + aus.files.map((f) => f.file).join(', '));
console.log(lines.length ? lines.join('\n') : '  keine Tests neu – nur statisch + Unit');
