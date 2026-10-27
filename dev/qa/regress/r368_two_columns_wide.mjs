// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json custom_components/casora/scripts/casora-core.js
// Stage 2 (26.10.62) set many popups to the one-column width (552). Some of them still lay out two columns in a group
// mode – floor heating group (fixed 26.10.62), cover group (owner, 27.10.2026: „Jalou…“). Every popup of the test
// dashboard on the desktop (1440, light): two plates side by side → the popup is at least 700 px wide.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const tool = fileURLToPath(new URL('../popup-raender.mjs', import.meta.url));
const r = spawnSync(process.execPath, [tool, '--dash', dash.url, '--views', 'desktop', '--schemes', 'hell', '--spalten'],
  { encoding: 'utf8', env: process.env, timeout: 15 * 60 * 1000 });
const out = (r.stdout || '') + (r.stderr || '');
const n = Number((out.match(/(\d+) Messungen/) || [])[1] || 0);
await check('Popups geöffnet und gemessen (mind. 8)', n >= 8, out.slice(-300));
const squeezed = out.split('\n').filter((l) => /^\s+SPALTEN/.test(l)).map((l) => l.trim());
await check('kein zweispaltiges Popup in der schmalen Breite', !squeezed.length, squeezed.join(' | '));
await finish();
