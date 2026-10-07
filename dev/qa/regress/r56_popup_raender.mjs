// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026): Im Abfall-Popup waren im Theme „Casora“ (Weich) die Kalender-Pfeile oben
// abgeschnitten – die Tests liefen bis dahin fast nur im Theme „Hemma 2“. Dieser Test öffnet jedes
// Popup des Prüf-Dashboards im Theme „Casora“ (hell, Handy 390×844 und Desktop 1600×1000) und misst
// mit dev/qa/popup-raender.mjs: kein Knopf, Pfeil, Schalter, Regler, Symbol oder Text darf über den
// Rand seines Popups bzw. eines abschneidenden Rahmens ragen, Bedienelemente dürfen sich nicht
// überlappen. Den vollen Lauf (alle Ansichten, hell + dunkel) startet man vor Releases von Hand:
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
const out = (r.stdout || '') + (r.stderr || '');
const lines = out.split('\n');
const funde = lines.filter((l) => /^\s+FUND/.test(l)).map((l) => l.trim());
const summary = lines.find((l) => /^(PASS|FAIL) popup-raender/.test(l)) || out.slice(-400);
const n = Number((summary.match(/(\d+) Messungen/) || [])[1] || 0);
await check('Popups geöffnet und gemessen (mind. 8)', n >= 8, summary);
await check('kein Popup mit abgeschnittenen oder überlappenden Elementen', funde.length === 0, funde.join(' | '));
await finish();
