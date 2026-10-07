// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026): Im Abfall-Popup waren im Theme „Casora“ (Weich) die Kalender-Pfeile oben
// abgeschnitten – die Tests liefen bis dahin fast nur im Theme „Hemma 2“. Dieser Test öffnet jedes
// Popup des Prüf-Dashboards im Theme „Casora“ (hell, Handy 390×844 und Desktop 1600×1000) und misst
// mit dev/qa/popup-raender.mjs: kein Knopf, Pfeil, Schalter, Regler, Symbol oder Text darf über den
// Rand seines Popups bzw. eines abschneidenden Rahmens ragen, Bedienelemente dürfen sich nicht
// überlappen. Seit 07.10.2026 (Pflanzen-Popup am Handy) zusätzlich am Handy die Raumseiten: drei Räume
// öffnen und dort jede Kachel/Badge antippen (--handy-raeume) – Popups aus Räumen wurden vorher nie gemessen.
// Den vollen Lauf (alle Ansichten, hell + dunkel) startet man vor Releases von Hand:
//   CASORA_URL=… node dev/qa/popup-raender.mjs
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const tool = fileURLToPath(new URL('../popup-raender.mjs', import.meta.url));
const r = spawnSync(process.execPath, [tool, '--dash', dash.url, '--views', 'handy,desktop', '--schemes', 'hell',
  // Abfall auch mit Monatskalender (nur im Browser eingeschaltet, am HA ändert sich nichts).
  '--settings', '{"waste":{"calendar_popup":true}}'], { encoding: 'utf8', env: process.env, timeout: 15 * 60 * 1000 });
const r2 = spawnSync(process.execPath, [tool, '--dash', dash.url, '--views', 'handy', '--schemes', 'hell', '--handy-raeume', '3'],
  { encoding: 'utf8', env: process.env, timeout: 15 * 60 * 1000 });
const out = (r.stdout || '') + (r.stderr || '');
const out2 = (r2.stdout || '') + (r2.stderr || '');
const lines = out.split('\n');
const funde = lines.filter((l) => /^\s+FUND/.test(l)).map((l) => l.trim());
const summary = lines.find((l) => /^(PASS|FAIL) popup-raender/.test(l)) || out.slice(-400);
const n = Number((summary.match(/(\d+) Messungen/) || [])[1] || 0);
await check('Popups geöffnet und gemessen (mind. 8)', n >= 8, summary);
await check('kein Popup mit abgeschnittenen oder überlappenden Elementen', funde.length === 0, funde.join(' | '));
const l2 = out2.split('\n');
const raum = l2.filter((l) => /^\s+(ok|FUND)\s+\S+ \w+\/raum\//.test(l));
const funde2 = l2.filter((l) => /^\s+FUND/.test(l)).map((l) => l.trim());
await check('Handy: Popups aus Räumen geöffnet (mind. 3)', raum.length >= 3, out2.slice(-400));
await check('Handy: auch Popups aus Räumen ohne Anschnitt/Überlappung', funde2.length === 0, funde2.join(' | '));
await finish();
