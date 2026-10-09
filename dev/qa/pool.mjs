#!/usr/bin/env node
// Parallel-Läufer fürs Qualitäts-Gate: führt die Tests EINES Test-HA-Zustands mit mehreren
// Browsern gleichzeitig aus (E2E t01–t19, Regressionstests, Klick-Durchlauf je Viewport/Teil)
// und schreibt je Schritt dasselbe Protokoll und dieselbe Ergebniszeile wie früher der
// serielle Lauf in dev/qa/gate.sh.
//
//   node dev/qa/pool.mjs --state arbeit --e2e --regress --crawler quick --dash qa-arbeit \
//        --jobs 1 --logs .qa/logs/<commit> --results <steps.tsv> [--tests <tests.tsv>] [--dry-run]
//
// --jobs N        Tests gleichzeitig JE Test-HA (Bahn); Standard 4. Mit mehreren HAs (--ha a,b)
//                 laufen also bis zu N × HAs Tests. --max M begrenzt die Summe über alle Bahnen.
// --nur a,b       nur diese Tests (E2E-/Regress-Namen); --crawler-teile desktop-studio,… nur diese
//                 Teile des Klick-Durchlaufs (gestaffeltes Gate, Nachholen).
// --tests datei   je Test eine Zeile: zustand, schritt, id, ok, wackelt, sekunden, log, sperren
// --keine-gegenprobe   rote Tests nicht noch einmal einzeln laufen lassen
//
// Was gleichzeitig laufen darf, regeln Abhängigkeiten („nach“) und Sperren:
//   ui       – gemeinsamer HA-Zustand: UI-Helfer (input_select.casora_expanded_row, Overlays …),
//              Mock-Szenario, im Browser untergeschobene Zustände (fakeStates) und das Antippen
//              im Dashboard. Immer nur ein Teil mit dieser Sperre gleichzeitig.
//   dash     – legt Dashboards an/löscht sie (t02/t03/t07) bzw. wertet „neue Dashboards“ aus (t19).
//   settings – Casora-Einstellungen lesen/vergleichen (t18) bzw. schreiben (t19).
//   allein   – läuft ganz allein (unbekannte neue E2E-Tests, Regressionstests mit
//              „// @parallel: allein“, z. B. erststart: legt qa-start an).
// Regressionstests: „// @parallel: ui|frei|allein“ in den ersten Zeilen; ohne Angabe „ui“, wenn
// der Test ein Dashboard öffnet oder Zustände unterschiebt (dashboard(…)/fakeStates(…)), sonst frei.
// Klick-Durchlauf: je Viewport ein Studio-Teil (frei) und ein Dashboard-Teil (ui), danach
// „alles.mjs --merge“ zu einem Bericht (gleiches Format wie früher).
//
// Mehrere Test-HAs desselben Zustands („Bahnen“, paralleles Gate): --ha url1,url2 – jede Bahn hat
// eigene Sperren und eigene Anmeldung; E2E läuft immer auf der ersten Bahn (t03→t04→… bauen
// aufeinander auf), Regress- und Klick-Teile auf der ersten freien. --ha-later url=datei: Bahn,
// die erst dazukommt, sobald <datei> existiert (z. B. das frisch-HA nach seinen Tests).
//
// Reihenfolge: längster Restpfad bzw. größter Rückstau einer Sperre zuerst. Gemessene Zeiten
// landen in .qa/zeiten.json und dienen beim nächsten Lauf (und im Probelauf) als Schätzung.
// Rückgabe 0 = alle Schritte ok, 1 = mindestens ein Schritt fehlgeschlagen, 2 = Aufruf falsch.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const STATE = opt('state', '');
const JOBS = Math.max(1, Number(opt('jobs', 4)) || 1);   // je Bahn (Test-HA)
const MAXALL = Math.max(0, Number(opt('max', 0)) || 0);     // 0 = JOBS × Bahnen
const NUR = opt('nur', '') ? new Set(opt('nur', '').split(',').filter(Boolean)) : null;
const TEILE = opt('crawler-teile', '') ? new Set(opt('crawler-teile', '').split(',').filter(Boolean)) : null;
const TESTS_OUT = opt('tests', '');
const GEGENPROBE = !flag('keine-gegenprobe');
const DRY = flag('dry-run');
const LOGS = opt('logs', '');
const RESULTS = opt('results', '');
const CRAWLER = opt('crawler', '');           // quick | full | ''
const DASH = opt('dash', '');
// --t0 <epoch s>: Startzeit des Gates – Fortschrittszeilen zeigen dann auch die Gate-Uhr (@m:ss).
const GATE0 = Number(opt('t0', 0)) * 1000;
const BASE0 = process.env.CASORA_URL || 'http://localhost:8124';
const LANES = opt('ha', BASE0).split(',').filter(Boolean).map((url) => ({ url, up: false }));
for (const x of opt('ha-later', '').split(',').filter(Boolean)) {
  const i = x.indexOf('=');
  if (i > 0) LANES.push({ url: x.slice(0, i), up: false, flag: x.slice(i + 1) });
}
LANES.forEach((l, i) => { l.n = i + 1; });
const MULTI = LANES.length > 1;
const CAP = MAXALL || JOBS * LANES.length;   // Tests gleichzeitig über alle Bahnen
const clock = () => (GATE0 ? ` @${Math.floor((Date.now() - GATE0) / 60000)}:${String(Math.floor((Date.now() - GATE0) / 1000) % 60).padStart(2, '0')}` : '');
const NODE = process.env.NODE && fs.existsSync(process.env.NODE) ? process.env.NODE : process.execPath;
if (!STATE || (!DRY && !LOGS)) { console.error('Aufruf: pool.mjs --state <zustand> [--e2e] [--regress] [--crawler quick|full] [--dash url] [--jobs n] --logs <ordner> [--results datei] [--dry-run]'); process.exit(2); }
if (CRAWLER && !/^(quick|full)$/.test(CRAWLER)) { console.error('--crawler quick|full'); process.exit(2); }

// ── Schätzungen (Sekunden) ─────────────────────────────────────────────────────────────
// Aus den seriellen Läufen vom 30.09.2026 (e2e 310 s, Regress arbeit 105 s, Klick-Durchlauf
// schnell 383 s / voll 949 s) auf die Teile verteilt; gemessene Werte ersetzen sie.
const EST = {
  t01_finder: 10, t02_import_hemma1: 27, t03_neues_dashboard: 36, t04_handy: 14, t05_assistent: 19,
  t06_lokal: 8, t07_import_hemma2: 25, t08_menue_handy_en: 20, t09_rundlauf: 25, t10_drucker_vorlage: 25,
  t11_solar: 8, t12_auto: 8, t13_kachelfelder: 14, t14_abfall: 17, t15_sauger: 14, t16_fbh: 12,
  t17_ki: 9, t18_persoenliches: 9, t19_umzug: 15,
  'quick/desktop-studio': 110, 'quick/desktop-dashboard': 90, 'quick/phone-studio': 70, 'quick/phone-dashboard': 90,
  'full/desktop-studio': 330, 'full/desktop-dashboard': 170, 'full/tablet-studio': 90, 'full/tablet-dashboard': 110,
  'full/phone-webkit-studio': 40, 'full/phone-webkit-dashboard': 80, 'full/phone-studio': 40, 'full/phone-dashboard': 80,
  regress: 12, erststart: 40,
};
const ZEITEN = path.join(REPO, '.qa', 'zeiten.json');
let measured = {};
try { measured = JSON.parse(fs.readFileSync(ZEITEN, 'utf8')); } catch (e) { /* noch keine Messung */ }
// key: Schlüssel in .qa/zeiten.json (<zustand>/<teil>), base: Schlüssel in EST.
const est = (key, base, fallback) => measured[key] || EST[base] || fallback;

// ── E2E: Abhängigkeiten und Sperren ────────────────────────────────────────────────────
// t03 legt test-neu an; t04/t08 lesen es, t05 und t10 speichern es, t06/t14 lesen danach –
// Leser und Schreiber von test-neu nie gleichzeitig (Speichern lädt offene Ansichten neu),
// Reihenfolge wie in alle.sh. t10 schaltet das Mock-Szenario, t14 tippt eine Kachel an (ui).
const E2E_RULES = {
  t01_finder: {}, t11_solar: {}, t12_auto: {}, t09_rundlauf: {}, t13_kachelfelder: {},
  t15_sauger: {}, t16_fbh: {}, t17_ki: {},
  t02_import_hemma1: { locks: ['dash'] },
  t07_import_hemma2: { after: ['t02_import_hemma1'], locks: ['dash'] },
  t03_neues_dashboard: { locks: ['dash'] },
  t04_handy: { after: ['t03_neues_dashboard'] },
  t08_menue_handy_en: { after: ['t03_neues_dashboard'] },
  t05_assistent: { after: ['t04_handy', 't08_menue_handy_en'] },
  t06_lokal: { after: ['t05_assistent'] },
  t10_drucker_vorlage: { after: ['t06_lokal'], locks: ['ui'] },
  t14_abfall: { after: ['t10_drucker_vorlage'], locks: ['ui'] },
  t18_persoenliches: { locks: ['settings'] },
  t19_umzug: { locks: ['dash', 'settings'] },
  t21_kachelart: { locks: ['ui'] },
};
const E2E_FAIL = /\bFEHLER\b|FEHLT|ABWEICHUNG|TimeoutError|Uncaught/;
// Tests mit Ergebniszeile (dev/e2e/ergebnis.mjs, 06.10.2026): es zählen nur Rückgabe + „PASS“.
// Ältere Tests ohne diese Zeile (t03, t05, t09, t10, t14, t16, t17) weiter über das Textmuster.
const E2E_RESULT = /^(PASS|FAIL) t\d+/m;

const steps = [];
const tasks = [];
const notes = [];
const addTask = (step, t) => { t.step = step; t.after = t.after || []; t.locks = t.locks || []; t.key = STATE + '/' + t.id; step.tasks.push(t); tasks.push(t); };

if (flag('e2e')) {
  const alle = fs.readFileSync(path.join(REPO, 'dev/e2e/alle.sh'), 'utf8');
  const list = ((alle.match(/for t in ([^;]*)/) || [])[1] || '').trim().split(/\s+/).filter(Boolean);
  const step = { id: 'e2e-' + STATE, group: 'e2e', kind: 'e2e', tasks: [] };
  steps.push(step);
  for (const t of list.filter((x) => !NUR || NUR.has(x))) {
    const r = E2E_RULES[t];
    if (!r) notes.push(`E2E ${t}: keine Regel in pool.mjs (E2E_RULES) – läuft sicherheitshalber allein`);
    addTask(step, { id: t, label: t, cmd: [NODE, t + '.mjs'], cwd: path.join(REPO, 'dev/e2e'), env: { CASORA_OUT: process.env.CASORA_E2E_OUT || '' }, pin: 1,
      after: (r && r.after || []).filter((d) => list.includes(d)), locks: r ? (r.locks || []) : [], alone: !r, est: est(STATE + '/' + t, t, 15) });
  }
}

const WRITES = /lovelace\/config\/save|\._save\(|casora\/settings\/set|frontend\/set_user_data|lovelace\/dashboards\/(create|delete)/;
const header = (f, re) => (fs.readFileSync(f, 'utf8').split('\n').slice(0, 8).join('\n').match(re) || [])[1];
if (flag('regress')) {
  const dir = path.join(REPO, 'dev/qa/regress');
  const step = { id: 'regress-' + STATE, group: 'regress', kind: 'regress', tasks: [] };
  steps.push(step);
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.mjs') && x !== 'lib.mjs').sort()) {
    const file = path.join(dir, f);
    // wie test_state in gate.sh: „// @zustand: …“ in den ersten 5 Zeilen, ohne Angabe frisch
    const z = (fs.readFileSync(file, 'utf8').split('\n').slice(0, 5).join('\n').match(/^\/\/ @zustand: *([a-z]*)/m) || [])[1] || 'frisch';
    if (z !== STATE) continue;
    const src = fs.readFileSync(file, 'utf8');
    const head = header(file, /^\/\/ @parallel: *([a-z]+)/m);
    let par = head || (/\bdashboard\(|\bfakeStates\(/.test(src) ? 'ui' : 'frei');
    // Speichert der Test Dashboards, Einstellungen oder Benutzerdaten, sehen gleichzeitige Tests auf
    // demselben HA den Zwischenstand (r42 speicherte qa-arbeit, während andere es lasen) – dann
    // allein auf seiner Bahn, außer der Kopf sagt ausdrücklich „frei“.
    if (par !== 'frei' && WRITES.test(src)) par = 'allein';
    const id = f.replace(/\.mjs$/, '');
    if (NUR && !NUR.has(id)) continue;
    addTask(step, { id, label: 'dev/qa/regress/' + f, cmd: [NODE, file], cwd: REPO,
      env: { CASORA_LOCAL: '', ...(STATE === 'arbeit' ? { CASORA_QA_DASH: DASH || 'qa-arbeit' } : {}) },
      locks: par === 'ui' ? ['ui'] : [], alone: par === 'allein', est: est(STATE + '/' + id, id, EST.regress) });
  }
  step.footer = `${step.tasks.length} Regressionstests im Zustand ${STATE}`;
}

const QA_OUT = process.env.CASORA_OUT || '/tmp/casora-qa';
if (CRAWLER) {
  const vps = CRAWLER === 'quick' ? ['desktop', 'phone'] : ['desktop', 'tablet', 'phone-webkit', 'phone'];
  const partsDir = path.join(QA_OUT, 'teile', STATE);
  const step = { id: 'crawler-' + STATE, group: 'crawler', kind: 'crawler', tasks: [], partsDir, dirs: [] };
  steps.push(step);
  for (const vp of vps) for (const part of ['studio', 'dashboard']) {
    const id = `${vp}-${part}`;
    if (TEILE && !TEILE.has(id)) continue;
    const out = path.join(partsDir, id);
    step.dirs.push(out);
    addTask(step, { id, label: `Teil ${vp}/${part}`, cwd: REPO, env: { CASORA_OUT: out },
      cmd: [NODE, path.join(REPO, 'dev/qa/alles.mjs'), ...(CRAWLER === 'quick' ? ['--quick'] : []), ...(DASH ? ['--dash', DASH] : []), '--viewports', vp, '--only', part],
      locks: part === 'dashboard' ? ['ui'] : [], est: est(`${STATE}/${CRAWLER}/${id}`, `${CRAWLER}/${id}`, 60) });
  }
}

// ── Planung ────────────────────────────────────────────────────────────────────────────
const byStepId = (s, id) => s.tasks.find((t) => t.id === id);
for (const t of tasks) t.deps = t.after.map((id) => byStepId(t.step, id)).filter(Boolean);
for (const t of tasks) t.dependents = tasks.filter((x) => x.deps.includes(t));
const cpMemo = new Map();
const cp = (t) => { if (!cpMemo.has(t)) cpMemo.set(t, t.est + Math.max(0, ...t.dependents.map(cp))); return cpMemo.get(t); };

// Nächster startbarer Teil für eine Bahn (oder null). running: laufende Teile DIESER Bahn,
// done: Set fertiger Teile, lane: Nummer der Bahn (Teile mit pin nur auf ihrer Bahn).
function pick(pending, running, done, free, lane = 1) {
  if (free <= 0 || running.some((r) => r.alone)) return null;
  const ready = pending.filter((t) => t.deps.every((d) => done.has(d)) && (!t.pin || t.pin === lane));
  // Wartet ein „allein“-Teil, erst leerlaufen lassen, dann ihn allein starten.
  const alone = ready.find((t) => t.alone);
  if (alone) return running.length ? null : alone;
  const held = new Set(running.flatMap((r) => r.locks));
  const ok = ready.filter((t) => !t.locks.some((l) => held.has(l)));
  if (!ok.length) return null;
  const backlog = (l) => pending.filter((x) => x.locks.includes(l)).reduce((s, x) => s + x.est, 0);
  const prio = (t) => Math.max(cp(t), ...t.locks.filter((l) => l === 'ui').map(backlog));
  // Gleichstand (z. B. alle ui-Teile mit demselben Rückstau): längerer Restpfad zuerst.
  const better = (x, y) => prio(x) > prio(y) || (prio(x) === prio(y) && cp(x) > cp(y));
  return ok.reduce((a, b) => (better(b, a) ? b : a));
}

function simulate() {
  const pending = tasks.slice(), running = [], done = new Set(), sched = [];
  let now = 0;
  const workers = Array.from({ length: CAP }, () => null);
  while (pending.length || running.length) {
    let t, more = true;
    while (more) {
      more = false;
      for (const l of LANES) {
        const mine = running.filter((r) => r.lane === l.n);
        t = pick(pending, mine, done, Math.min(JOBS - mine.length, CAP - running.length), l.n);
        if (!t) continue;
        pending.splice(pending.indexOf(t), 1);
        const w = workers.indexOf(null); workers[w] = t;
        running.push(Object.assign(t, { simStart: now, simEnd: now + t.est, worker: w + 1, lane: l.n }));
        sched.push(t); more = true;
      }
    }
    if (!running.length) { notes.push('Planung hängt (Abhängigkeiten im Kreis?)'); break; }
    running.sort((a, b) => a.simEnd - b.simEnd);
    const fin = running.shift();
    now = fin.simEnd; done.add(fin); workers[fin.worker - 1] = null;
  }
  const stepEnd = (s) => Math.max(0, ...s.tasks.map((t) => t.simEnd || 0)) + (s.kind === 'crawler' ? 2 : 0);
  return { sched, total: Math.max(0, ...steps.map(stepEnd)), serial: tasks.reduce((s, t) => s + t.est, 0) };
}

if (DRY) {
  const { sched, total, serial } = simulate();
  if (!tasks.length) { console.log(`    (keine Tests im Zustand ${STATE})`); process.exit(0); }
  console.log(`    ${JOBS} je HA${MULTI ? ` auf ${LANES.length} Test-HAs` : ''} · geschätzt ~${total} s statt ~${serial} s nacheinander`
    + (Object.keys(measured).length ? ' (Schätzung aus .qa/zeiten.json)' : ' (Schätzung aus den seriellen Protokollen)'));
  for (const t of sched.sort((a, b) => a.simStart - b.simStart || a.worker - b.worker)) {
    const extra = [t.deps.length ? 'nach ' + t.deps.map((d) => d.id.replace(/_.*/, '')).join(',') : '',
      t.locks.length ? 'Sperre ' + t.locks.join('+') : '', t.alone ? 'allein' : '', MULTI ? 'HA ' + t.lane : ''].filter(Boolean).join(' · ');
    console.log(`    [${t.worker}] ${String(t.simStart).padStart(4)}–${String(t.simEnd).padEnd(4)} ${t.step.group.padEnd(8)} ${t.id.padEnd(32)} ${extra}`);
  }
  notes.forEach((n) => console.log('    Hinweis: ' + n));
  if (opt('est-file', '')) fs.appendFileSync(opt('est-file', ''), total + '\n');
  process.exit(0);
}

// ── Ausführung ─────────────────────────────────────────────────────────────────────────
if (!tasks.length) process.exit(0);
// Anmeldung je Bahn (eigenes HA = eigene Benutzerdatenbank). Die erste Bahn übernimmt
// CASORA_TOKENS aus der Umgebung, wenn sie das HA aus CASORA_URL ist.
function loginLane(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const p = spawn(NODE, [path.join(REPO, 'dev/qa/token.mjs')], { env: { ...process.env, CASORA_URL: url }, stdio: ['ignore', 'pipe', 'inherit'] });
    p.stdout.on('data', (b) => chunks.push(b));
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks).toString('utf8').trim()) : reject(new Error('Anmeldung an ' + url + ' fehlgeschlagen'))));
  });
}
let laneUp = async function (l) {
  l.tokens = (l.n === 1 && l.url === BASE0 && process.env.CASORA_TOKENS) || await loginLane(l.url);
  await presetScenario(l);
  l.up = true;
  if (MULTI) console.log(`    Test-HA ${l.n} bereit: ${l.url}${clock()}`);
};
const PARTS = path.join(LOGS, 'teile');
fs.mkdirSync(PARTS, { recursive: true });
for (const s of steps) if (s.partsDir) fs.rmSync(s.partsDir, { recursive: true, force: true });
notes.forEach((n) => console.log('    Hinweis: ' + n));

// Wie früher: nach E2E sahen Regress/Klick-Durchlauf das Mock-Szenario aus t10. Jetzt laufen
// sie gleichzeitig – darum das Szenario vorab setzen (t10 setzt es noch einmal).
// Mit mehreren Bahnen auf jeder (die zweite Bahn bekommt kein t10).
async function presetScenario(l) {
  if (!(STATE === 'arbeit' && flag('e2e') && (flag('regress') || CRAWLER))) return;
  try {
    const { refresh_token } = JSON.parse(l.tokens);
    const tok = await fetch(l.url + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id: l.url + '/' }) }).then((r) => r.json());
    const r = await fetch(l.url + '/api/services/casora_mock/scenario', {
      method: 'POST', headers: { Authorization: 'Bearer ' + tok.access_token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: process.env.SZENARIO || 'drucker_druckt' }) });
    console.log(`    Mock-Szenario ${process.env.SZENARIO || 'drucker_druckt'} vorab${MULTI ? ' (HA ' + l.n + ')' : ''}: ${r.status}`);
  } catch (e) { console.log('    Mock-Szenario vorab nicht gesetzt: ' + e.message); }
}

// ── Grundzustand je HA ───────────────────────────────────────────────────────────────────
// Gemeinsame UI-Helfer (input_*.casora_*: aufgeklappte Reihe, Handy-Filter, Overlays …) schalten
// beim Antippen um. Ließ ein Test einen davon verändert zurück, klappte der nächste damit zu, was
// er aufklappen wollte (r34, 09.10.2026). Darum je HA beim Start merken und vor jedem Test mit
// Sperre ui/allein (und vor jeder Gegenprobe) wiederherstellen; Abweichungen danach protokollieren.
const HELPER = /^input_(select|boolean|text|number)\.casora_/;
async function access(l) {
  if (l.acc && Date.now() - l.accAt < 20 * 60000) return l.acc;
  const { refresh_token } = JSON.parse(l.tokens);
  const tok = await fetch(l.url + '/auth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token, client_id: l.url + '/' }) }).then((r) => r.json());
  l.acc = tok.access_token; l.accAt = Date.now();
  return l.acc;
}
async function api(l, method, p, body) {
  const r = await fetch(l.url + p, { method, headers: { Authorization: 'Bearer ' + await access(l), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(p + ': ' + r.status);
  return r.json();
}
async function helpers(l) {
  const st = await api(l, 'GET', '/api/states');
  return Object.fromEntries(st.filter((x) => HELPER.test(x.entity_id)).map((x) => [x.entity_id, x.state]));
}
const helperDiff = (base, now) => Object.keys(base).filter((id) => now[id] !== undefined && now[id] !== base[id]
  && !/^(unknown|unavailable)$/.test(base[id])).map((id) => ({ id, from: base[id], to: now[id] }));
async function restoreBase(l) {
  if (!l.base) return [];
  const out = [];
  for (const d of helperDiff(l.base, await helpers(l))) {
    const dom = d.id.split('.')[0], data = { entity_id: d.id };
    let svc = 'set_value';
    if (dom === 'input_select') { svc = 'select_option'; data.option = d.from; }
    else if (dom === 'input_boolean') svc = d.from === 'on' ? 'turn_on' : 'turn_off';
    else if (dom === 'input_number') data.value = Number(d.from);
    else data.value = d.from;
    try { await api(l, 'POST', `/api/services/${dom}/${svc}`, data); out.push(`${d.id}: ${d.to} → ${d.from}`); } catch (e) { /* Helfer weg o. ä. */ }
  }
  return out;
}
const guarded = (t) => t.gp || t.alone || t.locks.includes('ui');
async function baseLane(l) {
  try { l.base = await helpers(l); } catch (e) { console.log(`    Grundzustand HA ${l.n} nicht gemerkt: ${e.message}`); }
}
const _laneUp = laneUp;
laneUp = async (l) => { await _laneUp(l); await baseLane(l); };

for (const l of LANES) if (!l.flag) await laneUp(l);

const T0 = Date.now();
const sec = (ms) => Math.round(ms / 1000);
// Ein Teil: vorher Grundzustand (ui/allein/Gegenprobe), danach Reste protokollieren.
async function run(t) {
  const l = t.laneObj, pre = [];
  if (guarded(t)) {
    const fixed = await restoreBase(l).catch(() => []);
    if (fixed.length) pre.push('  info   Grundzustand hergestellt: ' + fixed.join(', '));
  }
  await runRaw(t);
  if (pre.length) t.out = pre.join('\n') + '\n' + t.out;
  if (guarded(t) && l.base && t.step.kind !== 'e2e') {
    try {
      const left = helperDiff(l.base, await helpers(l));
      if (left.length) {
        t.leftovers = left.map((d) => `${d.id}: ${d.from} → ${d.to}`);
        t.out += '  info   hinterlässt (wird vor dem nächsten Test zurückgesetzt): ' + t.leftovers.join(', ') + '\n';
      }
    } catch (e) { /* nur Protokoll */ }
  }
  if (pre.length || t.leftovers) fs.writeFileSync(t.logFile, t.out);
  return t;
}
function runRaw(t) {
  return new Promise((resolve) => {
    const logFile = path.join(PARTS, `${t.step.id}__${t.id}${t.gp ? '__gegenprobe' : ''}.log`);
    const fd = fs.openSync(logFile, 'w');
    const chunks = [];
    t.start = Date.now();
    const env = { ...process.env, ...t.env, CASORA_URL: t.laneObj.url, CASORA_TOKENS: t.laneObj.tokens };
    if (env.CASORA_OUT === '') delete env.CASORA_OUT;
    const p = spawn(t.cmd[0], t.cmd.slice(1), { cwd: t.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    const onData = (b) => { chunks.push(b); fs.writeSync(fd, b); };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    const finish = (rc) => {
      fs.closeSync(fd);
      t.end = Date.now(); t.rc = rc; t.out = Buffer.concat(chunks).toString('utf8'); t.logFile = logFile;
      if (t.step.kind === 'e2e') t.ok = rc === 0 && (E2E_RESULT.test(t.out) ? /^PASS /m.test(t.out) : !E2E_FAIL.test(t.out));
      else if (t.step.kind === 'crawler') t.ok = rc === 0 || rc === 1; // 1 = Befunde, zählt die Zusammenführung
      else t.ok = rc === 0;
      resolve(t);
    };
    p.on('error', (e) => { chunks.push(Buffer.from(String(e.stack || e) + '\n')); finish(127); });
    p.on('close', (code, sig) => finish(code === null ? (sig ? 128 : 1) : code));
  });
}

function runPost(cmd, env) {
  return new Promise((resolve) => {
    const chunks = [];
    const p = spawn(cmd[0], cmd.slice(1), { cwd: REPO, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (b) => chunks.push(b)); p.stderr.on('data', (b) => chunks.push(b));
    p.on('error', (e) => resolve({ rc: 127, out: String(e) }));
    p.on('close', (code) => resolve({ rc: code === null ? 1 : code, out: Buffer.concat(chunks).toString('utf8') }));
  });
}

let failed = false;
const finished = new Set();
// Rot und nachprüfbar: Regress und E2E (außer E2E, die Dashboards anlegen – nicht wiederholbar).
const retryable = (t) => t.ok === false && t.wackelt === undefined && GEGENPROBE && (t.step.kind === 'regress' || (t.step.kind === 'e2e' && !t.locks.includes('dash')));
async function finishStep(s) {
  finished.add(s);
  const start = Math.min(...s.tasks.map((t) => t.start)), lastEnd = Math.max(...s.tasks.map((t) => t.end)), lines = [];
  let ok = s.tasks.every((t) => t.ok);
  const wobbly = s.tasks.filter((t) => t.wackelt).map((t) => t.id);
  for (const t of s.tasks) {
    lines.push(`=== ${t.label}   (${sec(t.end - t.start)} s, ab +${sec(t.start - T0)} s${MULTI ? ', Test-HA ' + t.lane : ''})`);
    lines.push(t.out.replace(/\n$/, ''));
    if (!t.ok) lines.push(s.kind === 'e2e' ? `>>> FEHLER ${t.id}` : `>>> FEHLER ${t.label} (Rückgabe ${t.rc})`);
  }
  if (s.footer) lines.push(s.footer);
  if (wobbly.length) lines.push(`Wackler (im Lauf rot, in der Gegenprobe einzeln grün – zählen als bestanden): ${wobbly.join(', ')}`);
  if (s.kind === 'crawler') {
    const m = await runPost([NODE, path.join(REPO, 'dev/qa/alles.mjs'), '--merge', '--seconds', String(sec(Date.now() - start)), ...s.dirs], { CASORA_OUT: QA_OUT });
    lines.push('=== Zusammenführen', m.out.replace(/\n$/, ''));
    if (m.rc !== 0) ok = false;
  }
  const dt = sec((s.kind === 'crawler' ? Date.now() : lastEnd) - start);
  const log = path.join(LOGS, s.id + '.log');
  fs.writeFileSync(log, lines.join('\n') + '\n');
  const rc = ok ? 0 : 1;
  if (!ok) failed = true;
  process.stdout.write(`▸ ${s.id.padEnd(28)} ` + (ok ? `ok (${dt}s)${clock()}${wobbly.length ? ' – wackelt: ' + wobbly.join(', ') : ''}\n` : `FEHLER (${dt}s)${clock()} – ${log}\n`
    + lines.join('\n').split('\n').slice(-8).map((l) => '    ' + l).join('\n') + '\n'));
  if (RESULTS) fs.appendFileSync(RESULTS, `${s.id}\t${s.group}\t${rc}\t${dt}\t${log}\t${wobbly.join(',')}\n`);
  if (TESTS_OUT) for (const t of s.tasks) fs.appendFileSync(TESTS_OUT, [STATE, s.id, t.id, t.ok ? 1 : 0, t.wackelt ? 1 : 0,
    sec(t.end - t.start), t.logFile, t.locks.join('+') + (t.alone ? (t.locks.length ? '+' : '') + 'allein' : '')].join('\t') + '\n');
}

const pending = tasks.slice(), running = [], done = new Set(), stepJobs = [];
let timer = null;
await new Promise((resolveAll) => {
  const pump = () => {
    let t, more = true;
    while (more) {
      more = false;
      // Bahn mit den wenigsten laufenden Teilen zuerst.
      const lanes = LANES.filter((l) => l.up).sort((a, b) => running.filter((r) => r.lane === a.n).length - running.filter((r) => r.lane === b.n).length);
      for (const l of lanes) {
        const mine = running.filter((r) => r.lane === l.n);
        t = pick(pending, mine, done, Math.min(JOBS - mine.length, CAP - running.length), l.n);
        if (!t) continue;
        pending.splice(pending.indexOf(t), 1);
        t.lane = l.n; t.laneObj = l;
        running.push(t); more = true;
        run(t).then((x) => {
          running.splice(running.indexOf(x), 1); done.add(x);
          console.log(`    · ${x.step.id} ${x.id.padEnd(30)} ${x.ok ? 'ok    ' : 'FEHLER'} ${String(sec(x.end - x.start)).padStart(4)} s  (+${sec(x.start - T0)}…${sec(x.end - T0)} s)${MULTI ? ' HA ' + x.lane : ''}${clock()}`);
          // Schritte mit roten Tests warten auf die Gegenprobe (unten), die übrigen melden sich gleich.
          if (x.step.tasks.every((y) => done.has(y)) && !x.step.tasks.some(retryable)) stepJobs.push(finishStep(x.step));
          if (!pending.length && !running.length) { clearInterval(timer); resolveAll(); } else pump();
        });
        break;
      }
    }
    if (!running.length && pending.length) { console.log('    Planung hängt – Rest nacheinander'); pending.forEach((p) => { p.deps = []; p.locks = []; p.alone = false; p.pin = 0; }); pump(); }
  };
  // Später dazukommende Bahnen: sobald ihre Datei da ist, anmelden und mitarbeiten lassen.
  const late = LANES.filter((l) => l.flag);
  if (late.length) {
    timer = setInterval(() => {
      for (const l of late) {
        if (l.up || l.joining || !fs.existsSync(l.flag)) continue;
        if (!pending.length) continue;
        l.joining = true;
        laneUp(l).then(pump, (e) => console.log(`    Test-HA ${l.n} nicht nutzbar: ${e.message}`));
      }
    }, 2000);
  }
  pump();
});
clearInterval(timer);

// ── Gegenprobe ───────────────────────────────────────────────────────────────────────────
// Ein im Lauf roter Regress-/E2E-Test läuft am Ende noch einmal einzeln (auf seinem HA läuft
// nichts anderes, Grundzustand vorher hergestellt). Grün → „wackelt“: zählt als bestanden, steht
// aber im Bericht (Wackler-Liste, .qa/wackler.log). Rot → echter Fehler. Bei vielen roten Tests
// ist eher etwas kaputt als wackelig – dann keine Gegenprobe (spart Zeit).
const GP_MAX = Number(process.env.GATE_GEGENPROBE_MAX || 8);
const toRetry = tasks.filter(retryable);
if (toRetry.length && GEGENPROBE && toRetry.length <= GP_MAX) {
  console.log(`    Gegenprobe: ${toRetry.length} rote(r) Test(s) einzeln: ${toRetry.map((t) => t.id).join(', ')}${clock()}`);
  const queue = toRetry.slice();
  await Promise.all(LANES.filter((l) => l.up).map(async (l) => {
    while (queue.length) {
      const t = queue.shift();
      const first = { out: t.out, start: t.start, end: t.end, rc: t.rc, lane: t.lane, logFile: t.logFile };
      Object.assign(t, { gp: true, laneObj: l });
      await run(t);
      const again = { ok: t.ok, out: t.out, start: t.start, end: t.end, lane: l.n };
      Object.assign(t, first, { gp: false, laneObj: t.laneObj });
      t.ok = again.ok; t.wackelt = again.ok;
      t.out = first.out.replace(/\n?$/, '\n') + `>>> Gegenprobe einzeln (${sec(again.end - again.start)} s${MULTI ? ', Test-HA ' + l.n : ''}): ${again.ok ? 'grün – wackelt' : 'wieder rot'}\n`
        + again.out.replace(/\n$/, '').split('\n').map((x) => '  | ' + x).join('\n') + '\n';
      console.log(`    · Gegenprobe ${t.id.padEnd(30)} ${again.ok ? 'grün – wackelt' : 'wieder rot'} ${String(sec(again.end - again.start)).padStart(4)} s${MULTI ? ' HA ' + l.n : ''}${clock()}`);
      if (again.ok) try { fs.appendFileSync(path.join(REPO, '.qa', 'wackler.log'), `${new Date().toISOString()}\t${path.basename(LOGS)}\t${STATE}\t${t.id}\n`); } catch (e) { /* nur Statistik */ }
    }
  }));
} else if (toRetry.length && GEGENPROBE) console.log(`    Gegenprobe ausgelassen: ${toRetry.length} rote Tests (> ${GP_MAX}) – eher ein echter Fehler als Wackeln`);
for (const s of steps) if (s.tasks.length && !finished.has(s)) stepJobs.push(finishStep(s));
await Promise.all(stepJobs);

// ── Zeiten ─────────────────────────────────────────────────────────────────────────────
const wall = sec(Date.now() - T0), sum = tasks.reduce((s, t) => s + (t.end - t.start), 0);
const zlines = [`Zustand ${STATE}: ${JOBS} je HA auf ${LANES.filter((l) => l.up).length} HA(s), Wandzeit ${wall} s, Summe der Teile ${sec(sum)} s (Faktor ${(sum / 1000 / Math.max(1, wall)).toFixed(1)})`];
for (const t of tasks.slice().sort((a, b) => a.start - b.start)) {
  zlines.push(`  +${String(sec(t.start - T0)).padStart(4)}…${String(sec(t.end - T0)).padEnd(4)} ${String(sec(t.end - t.start)).padStart(4)} s  ${MULTI ? 'HA' + t.lane + ' ' : ''}${t.step.group.padEnd(8)} ${t.id}${t.locks.length ? '  [' + t.locks.join('+') + ']' : ''}`);
  if (t.ok) measured[t.step.kind === 'crawler' ? `${STATE}/${CRAWLER}/${t.id}` : t.key] = Math.max(1, sec(t.end - t.start)); // nur echte Läufe als Schätzung
}
fs.writeFileSync(path.join(LOGS, `zeiten-${STATE}.log`), zlines.join('\n') + '\n');
console.log('    ' + zlines[0] + ` – ${path.join(LOGS, `zeiten-${STATE}.log`)}`);
// Mehrere Zustände schreiben gleichzeitig: frisch einlesen, nur die eigenen Schlüssel ersetzen.
try {
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(ZEITEN, 'utf8')); } catch (e) { /* neu */ }
  for (const [k, v] of Object.entries(measured)) if (k.startsWith(STATE + '/')) cur[k] = v;
  fs.mkdirSync(path.dirname(ZEITEN), { recursive: true });
  fs.writeFileSync(ZEITEN + '.' + process.pid, JSON.stringify(cur, null, 1));
  fs.renameSync(ZEITEN + '.' + process.pid, ZEITEN);
} catch (e) { /* nur Schätzhilfe */ }
process.exit(failed ? 1 : 0);
