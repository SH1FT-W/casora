// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json dev/qa/popup-galerie.mjs dev/qa/popup-spalten.mjs custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/02-devices.js custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/local/05-weich-mehr.js custom_components/casora/scripts/local/05-standard-medien.js
// Owner 01.11.2026: two-column popups on desktop/tablet must not leave a large empty block under the shorter column
// (02.11.2026: one rule for all, casora-core colBalance; the popups it evens out fail here without it).
// Builds the popup gallery, opens every popup (twice: rule B applies from the second opening, 03.11.2026) at 1440×900 and the tablet size 1180×820 and measures both columns'
// bottom edges (dev/qa/popup-spalten.mjs): the empty block may be at most MAX_GAP px tall; the layouts measured above
// that on 01.11.2026 are a ratchet (KNOWN, may not grow). Also the weather popup's order (owner, §7.1): left under the
// dial the Verlauf, right „Nächste Stunden“ under „7 Tage“ (before: 455 px left, 1211 px right).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { check, need, finish } from './lib.mjs';

const MAX_GAP = 200;
// Layouts measured above MAX_GAP on 01.11.2026 (test house „arbeit“): the empty block may not grow beyond this cap
// (measured + 40 px). Lower or drop an entry when its popup is evened out.
// 02.11.2026: the column balance (casora-core colBalance, popup-richtlinien-v3 „Spaltenausgleich“) evened out climate, humidifier, vacuum, e-bike, security, lock, Lüften-Coach and chart
// popups – they left this list. What stays cannot be evened out by moving whole sections: a long left part with more
// than 200 px on the right (printer camera, coffee drinks, aquarium light, plant), one long list (calendar, rezept's
// shopping list) or layouts of their own (weather §7.1, Frigate, trash calendar). licht-badge and schloss-badge do not
// open in the gallery's badge path (not measurable), they keep their caps.
const KNOWN = {
  // Light popups (owner 03.11.2026): the column rule moves only whole sections and never splits a list, so the light
  // popups (one list right of the dial) keep their layout and their caps of 03.11.2026.
  'licht-raum': 283, 'licht-haus': 440,
  // Person popup: its right column is one Verlauf list that grows with the test house's tracker changes during the run
  // (94 px alone, 202 px after the double pass of 03.11.2026) – one section, nothing the column rule can move.
  'person-badge': 260,
  'licht-badge': 440, 'drucker': 437, 'kaffee': 609, 'aquarium-licht': 276, 'schloss-badge': 325, 'pflanze': 296,
  'wetter': 420, 'frigate': 358, 'kalender': 844, 'abfall': 463,
  // Recipe (owner 04.11.2026): „Cookidoo-App öffnen“ on the stage makes the left column 72 px taller; the column rule
  // still moves the meal plan under the stage (the lower popup), so the block under the shopping list grew by as much
  // (375 px measured 04.11.2026, cap = measured + 40).
  'rezept': 415,
  // Washer/dryer with care, statistics and detection (owner 04.11.2026): five whole sections, the best split measured
  // 201 px (left 719, right 518) – the column rule cannot split a section.
  'waschmaschine': 241, 'trockner': 241,
};
const tool = fileURLToPath(new URL('../popup-galerie.mjs', import.meta.url));
const run = (args) => spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8', env: process.env, timeout: 40 * 60 * 1000 });
const made = run(['anlegen']);
await need('Popup-Galerie angelegt', made.status === 0, (made.stdout + made.stderr).slice(-400));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r452-'));
for (const [name, size] of [['Desktop 1440', null], ['Tablet 1180', '1180x820']]) {
  const json = path.join(dir, name.replace(/\W+/g, '-') + '.json');
  const r = run(['pruefen', '--spalten', '--json', json, ...(size ? ['--groesse', size] : [])]);
  const out = fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, 'utf8')) : [];
  const two = out.filter((x) => x.spalten && typeof x.spalten.gap === 'number');
  await check(`${name}: zweispaltige Popups gemessen (mind. 10)`, two.length >= 10, `${two.length} von ${out.length}; ${(r.stdout || '').slice(-300)}`);
  const bad = two.filter((x) => x.spalten.gap > (KNOWN[x.id] || MAX_GAP)).map((x) => `${x.id}: links ${x.spalten.left}, rechts ${x.spalten.right} px`);
  await check(`${name}: keine leere Fläche über ${MAX_GAP} px unter einer Spalte (bekannte mit ihrer Grenze)`, !bad.length, bad.join('; '));
}
// The weather popup's columns (desktop): the Verlauf is in the left column, „Nächste Stunden“ in the right one.
const wx = run(['pruefen', '--nur', '^wetter$', '--wetter-spalten', '--json', path.join(dir, 'wx.json')]);
const w = fs.existsSync(path.join(dir, 'wx.json')) ? (JSON.parse(fs.readFileSync(path.join(dir, 'wx.json'), 'utf8'))[0] || {}).wetterSpalten : null;
await check('Wetter: links unter dem Rad der Verlauf, rechts „Nächste Stunden“ unter „7 Tage“',
  !!w && w.chartLeft && w.hourlyRight && w.hourlyBelowDaily, JSON.stringify(w) + ' ' + (wx.stdout || '').slice(-200));
fs.rmSync(dir, { recursive: true, force: true });
await finish();
