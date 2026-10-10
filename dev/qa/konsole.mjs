#!/usr/bin/env node
// Konsole + HA-Log sammeln (Versprechen „Fehlerfrei“, 1.3): lässt den Klick-Durchlauf (alles.mjs)
// laufen und schneidet dabei jede Browser-Meldung mit – Konsolenfehler UND -warnungen, Seitenfehler,
// unbehandelte Promises, fehlgeschlagene Anfragen, HTTP ≥ 400 (harness.mjs, CASORA_KONSOLE). Danach
// wertet es das HA-Log des Laufs aus (nur die neuen Zeilen): Casora-Fehler/-Warnungen, „Detected
// blocking call“, Tracebacks, und fragt die Setup-Zeit der Integration ab (integration/setup_info).
//
//   CASORA_URL=http://localhost:8314 CASORA_TOKENS="$(node dev/qa/token.mjs)" \
//     node dev/qa/konsole.mjs --lauf arbeit [--ha-log <home-assistant.log>] [--viewports desktop,handy]
//                              [--quick] [--rooms n] [--max n] [--only studio|dashboard] [--dash <url>]
//                              [--randfaelle [--views n]] [--ohne-alles]   Randfälle (randfaelle.mjs) dazu bzw. nur sie
//   node dev/qa/konsole.mjs --auswerten <ordner>        nur Auswertung eines früheren Laufs
//
// Theme: CASORA_THEME (Standard hier „Casora“). Ergebnis in $CASORA_OUT (Standard
// /tmp/casora-konsole/<lauf>): konsole.jsonl (roh), konsole.json + konsole.md (gezählt, gruppiert),
// ha-log.txt (neue Logzeilen), alles/ (Bericht des Klick-Durchlaufs). Exit 1 bei Fehlern.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes('--' + n);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// Bekannte Meldungen, die nicht von Casora kommen (je mit Grund). Sie werden gezählt, aber getrennt.
export const FREMD = [
  [/Download the React DevTools|Lit is in dev mode/i, 'Entwickler-Hinweis'],
  [/ResizeObserver loop/i, 'Browser-Hinweis ohne Wirkung'],
  [/\/sw-modern\.js|service.?worker/i, 'Service Worker im Test gesperrt (harness.mjs)'],
  [/Unbehandelte Ablehnung \(HA\)/, 'HA-Frontend meldet beendetes Abo ab (harness.mjs)'],
  [/favicon/i, 'Favicon'],
  [/Failed to read the 'localStorage' property.*Access is denied/i, 'Init-Skript des Testrahmens auf about:blank'],
  [/Service Worker registration blocked by Playwright/i, 'Service Worker im Test gesperrt'],
  [/\/static\/(mdi|icons)\/.*due to access control checks/i, 'WebKit meldet beim Seitenwechsel abgebrochene Symbol-Abrufe von HA so'],
];

export function normal(t) {
  return String(t || '')
    .replace(/https?:\/\/[^/\s]+/g, '')
    .replace(/\?v=[^\s:)'"]+/g, '')
    .replace(/\b[0-9a-f]{20,}\b/gi, '…')
    .replace(/\d{2,}/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

export function auswerten(rows) {
  const gruppen = new Map();
  for (const r of rows) {
    const key = r.typ + '|' + normal(r.text) + '|' + normal(r.url || '');
    let g = gruppen.get(key);
    if (!g) {
      const hay = (r.text || '') + ' ' + (r.url || '') + ' ' + (r.quelle || '');
      const f = FREMD.find(([re]) => re.test(hay));
      g = { typ: r.typ, text: (r.text || '').slice(0, 400), url: r.url || '', quelle: r.quelle || '', fremd: f ? f[1] : '',
        anzahl: 0, laeufe: new Set(), seiten: new Set() };
      gruppen.set(key, g);
    }
    g.anzahl++;
    if (r.lauf) g.laeufe.add(r.lauf);
    if (r.seite) g.seiten.add(r.seite);
  }
  const liste = [...gruppen.values()].map((g) => ({ ...g, laeufe: [...g.laeufe], seiten: [...g.seiten].slice(0, 6) }))
    .sort((a, b) => (a.fremd ? 1 : 0) - (b.fremd ? 1 : 0) || b.anzahl - a.anzahl);
  const zahl = (pred) => rows.filter(pred).length;
  const isFehler = (r) => r.typ === 'fehler' || r.typ === 'seitenfehler' || r.typ === 'anfrage' || r.typ === 'http';
  const fremd = (r) => FREMD.some(([re]) => re.test((r.text || '') + ' ' + (r.url || '') + ' ' + (r.quelle || '')));
  return {
    summe: {
      fehler: zahl((r) => isFehler(r) && !fremd(r)), warnungen: zahl((r) => r.typ === 'warnung' && !fremd(r)),
      fremd: zahl(fremd), gruppen: liste.filter((g) => !g.fremd).length,
    },
    // Je Lauf (bei Randfällen je Fall): Fehler/Warnungen ohne bekannte fremde Meldungen.
    je_lauf: rows.reduce((m, r) => {
      if (fremd(r)) return m;
      const k = r.lauf || '–'; m[k] = m[k] || { fehler: 0, warnungen: 0 };
      if (isFehler(r)) m[k].fehler++; else if (r.typ === 'warnung') m[k].warnungen++;
      return m;
    }, {}),
    gruppen: liste,
  };
}

// HA-Log: nur die Zeilen ab Offset. Einträge beginnen mit Datum; Folgezeilen (Traceback) gehören dazu.
export function haLog(text) {
  const eintraege = [];
  for (const line of text.split('\n')) {
    if (/^\d{4}-\d{2}-\d{2} /.test(line) || !eintraege.length) eintraege.push(line);
    else eintraege[eintraege.length - 1] += '\n' + line;
  }
  const out = { casora: [], blockierend: [], traceback: [], fehler: 0, warnungen: 0 };
  for (const e of eintraege) {
    if (!e.trim()) continue;
    const lvl = (e.match(/^\S+ \S+ (ERROR|WARNING|CRITICAL|INFO|DEBUG)/) || [])[1] || '';
    if (lvl === 'ERROR' || lvl === 'CRITICAL') out.fehler++;
    if (lvl === 'WARNING') out.warnungen++;
    const kopf = e.split('\n')[0];
    if (/Detected blocking call/i.test(e)) out.blockierend.push(kopf.slice(0, 500));
    if (/Traceback \(most recent call last\)/.test(e)) out.traceback.push(e.slice(0, 1500));
    // Casora selbst (nicht casora_mock = Testgeräte, nicht HAs Pflichthinweis „custom integration“).
    const vonCasora = /\[custom_components\.casora[\].]/.test(kopf) || /custom_components\/casora\//.test(e);
    if (vonCasora && (lvl === 'ERROR' || lvl === 'WARNING' || lvl === 'CRITICAL')) out.casora.push(e.slice(0, 1500));
  }
  return out;
}

function md(lauf, a, log, setup) {
  const z = [`# Konsole + HA-Log – ${lauf}`, '',
    `Konsole: **${a.summe.fehler} Fehler**, **${a.summe.warnungen} Warnungen** (Casora-relevant, ${a.summe.gruppen} Gruppen); bekannte fremde Meldungen: ${a.summe.fremd}.`, ''];
  if (setup) z.push(`Setup-Zeit casora: ${setup.casora ?? '–'} s (casora_mock ${setup.casora_mock ?? '–'} s)`, '');
  if (log) z.push(`HA-Log (Lauf): ${log.fehler} ERROR, ${log.warnungen} WARNING · Casora: ${log.casora.length} · blockierend: ${log.blockierend.length} · Tracebacks: ${log.traceback.length}`, '');
  const jl = Object.entries(a.je_lauf || {});
  if (jl.length > 1) z.push('Je Lauf: ' + jl.map(([k, v]) => `${k} ${v.fehler}/${v.warnungen}`).join(' · '), '');
  z.push('| Typ | Anzahl | Meldung | Läufe | Seiten | fremd |', '|---|---|---|---|---|---|');
  for (const g of a.gruppen) z.push(`| ${g.typ} | ${g.anzahl} | ${(g.text + (g.url ? ' ' + g.url : '')).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 260)} | ${g.laeufe.join(', ')} | ${g.seiten.join(', ')} | ${g.fremd} |`);
  if (log && log.casora.length) z.push('', '## Casora im HA-Log', '', ...log.casora.map((e) => '```\n' + e + '\n```'));
  if (log && log.blockierend.length) z.push('', '## Blockierende Aufrufe', '', ...log.blockierend.map((e) => '- ' + e));
  return z.join('\n') + '\n';
}

async function setupZeiten() {
  try {
    const { ws } = await import('./ws.mjs');
    const c = await ws();
    const r = await c.cmd({ type: 'integration/setup_info' });
    c.close();
    const m = {};
    for (const x of r || []) m[x.domain] = Math.round((x.seconds || 0) * 100) / 100;
    return m;
  } catch (e) { return null; }
}

function schreiben(dir, lauf, rows, log, setup) {
  const a = auswerten(rows);
  fs.writeFileSync(path.join(dir, 'konsole.json'), JSON.stringify({ lauf, ...a, ha_log: log, setup }, null, 1));
  fs.writeFileSync(path.join(dir, 'konsole.md'), md(lauf, a, log, setup));
  console.log(`\n${lauf}: Konsole ${a.summe.fehler} Fehler, ${a.summe.warnungen} Warnungen (fremd ${a.summe.fremd})` +
    (log ? ` · HA-Log ${log.fehler} ERROR/${log.warnungen} WARNING, Casora ${log.casora.length}, blockierend ${log.blockierend.length}` : '') +
    (setup ? ` · Setup casora ${setup.casora ?? '–'} s` : '') + ` → ${path.join(dir, 'konsole.md')}`);
  return a.summe.fehler + (log ? log.casora.filter((e) => /ERROR|CRITICAL/.test(e.split('\n')[0])).length + log.blockierend.length : 0);
}

const lesen = (f) => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];

if (import.meta.url === `file://${process.argv[1]}`) {
  if (flag('auswerten')) {
    const dir = opt('auswerten');
    const j = fs.existsSync(path.join(dir, 'konsole.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'konsole.json'), 'utf8')) : {};
    process.exit(schreiben(dir, j.lauf || path.basename(dir), lesen(path.join(dir, 'konsole.jsonl')), j.ha_log || null, j.setup || null) ? 1 : 0);
  }
  if (!process.env.CASORA_TOKENS) { console.error('CASORA_TOKENS fehlt (node dev/qa/token.mjs).'); process.exit(2); }
  const lauf = opt('lauf', 'lauf');
  const dir = process.env.CASORA_OUT || path.join('/tmp/casora-konsole', lauf);
  fs.mkdirSync(dir, { recursive: true });
  const jsonl = path.join(dir, 'konsole.jsonl');
  fs.rmSync(jsonl, { force: true });
  const logFile = opt('ha-log', '');
  const off = logFile && fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;

  const pass = ['--viewports', opt('viewports', 'desktop,handy')];
  for (const n of ['rooms', 'max', 'only', 'dash', 'mobile-dash']) if (opt(n)) pass.push('--' + n, opt(n));
  if (flag('quick')) pass.push('--quick');
  const env = { ...process.env, CASORA_KONSOLE: jsonl, CASORA_KONSOLE_LAUF: lauf, CASORA_OUT: path.join(dir, 'alles'),
    CASORA_THEME: process.env.CASORA_THEME || 'Casora' };
  if (!flag('ohne-alles')) console.log(`▶ ${lauf}: alles.mjs ${pass.join(' ')} (Theme ${env.CASORA_THEME})`);
  const code = flag('ohne-alles') ? 0 : await new Promise((res) => spawn(process.execPath, [path.join(HERE, 'alles.mjs'), ...pass], { env, stdio: 'inherit' }).on('exit', res));
  // --randfaelle: danach Randfälle (randfaelle.mjs) auf demselben Dashboard, Lauf „<lauf>/rand:<fall>“.
  if (flag('randfaelle')) {
    const rp = ['--dash', opt('dash', 'qa-arbeit'), '--viewports', opt('viewports', 'desktop,handy')];
    if (opt('views')) rp.push('--views', opt('views'));
    await new Promise((res) => spawn(process.execPath, [path.join(HERE, 'randfaelle.mjs'), ...rp], { env, stdio: 'inherit' }).on('exit', res));
  }

  let log = null;
  if (logFile && fs.existsSync(logFile)) {
    const buf = fs.readFileSync(logFile);
    const neu = buf.subarray(buf.length >= off ? off : 0).toString('utf8');
    fs.writeFileSync(path.join(dir, 'ha-log.txt'), neu);
    log = haLog(neu);
  }
  const setup = await setupZeiten();
  const n = schreiben(dir, lauf, lesen(jsonl), log, setup);
  console.log(`alles.mjs Exit ${code}`);
  process.exit(n ? 1 : 0);
}
