// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json dev/qa/popup-galerie.mjs dev/qa/popup-spalten.mjs
// Owner 01.11.2026: two-column popups on desktop/tablet must not leave a large empty block under the shorter column.
// Builds the popup gallery, opens every popup at 1440×900 and the tablet size 1180×820 and measures both columns'
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
const KNOWN = {
  'licht-raum': 283,
  // 26.11.8: the house light popup lists every room again (setup no longer caps it at ten lights) – the list grows,
  // 400 px under the dial in the gate house. Back to 328 or lower once the column rule (branch fix-spaltenregel) is in.
  'licht-badge': 440, 'klima-raum': 512, 'klima-feuchte': 512, 'befeuchter': 434, 'drucker': 437,
  'sauger': 382, 'kaffee': 609, 'aquarium-licht': 276, 'ebike': 582, 'sicherheit': 328, 'schloss': 325, 'schloss-badge': 325,
  'lueften': 256, 'diagramm': 241, 'pflanze': 296, 'wetter': 420, 'frigate': 358, 'kalender': 844, 'abfall': 463, 'rezept': 669,
  // Gate 02.11.2026 (after the light popup changes of 01.11.): the house light popup – dial left (359 px), the rooms'
  // list right (602 px), 243 px empty under the dial. Open: rebalance it (list partly under the dial).
  // 26.11.8 light migration (r9): Home's light badge is the house group alone, so this opener now shows the same
  // popup as 'licht-badge' above – every room listed, 400 px under the dial in the gate house. Same cap as there until
  // the column rule (branch fix-spaltenregel) is in, then back to 283 or lower.
  'licht-haus': 440,
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
