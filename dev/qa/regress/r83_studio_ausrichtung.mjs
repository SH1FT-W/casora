// @zustand: arbeit
// @parallel: ui
// Gemeldet (08.10.2026): Im Studio saßen manche Symbole nicht mittig in ihren Kreisen (Zurück-Pfeil
// des Inspektors 1 px nach links versetzt, Szenen-Symbole und Popup-Pfeile 0,5–1 px zu tief), der
// Knopf „Mit KI ergänzen“ klebte unten am Rand seiner Karte.
// Erwartet: dev/qa/ausrichtung.mjs findet im Studio (Theme „Casora“ hell, Desktop 1440 und Handy 393
// WebKit) keine Abweichung: Symbol in Kreis/Knopf mittig ±0,5 px, Text in Pillen/Knöpfen vertikal
// mittig ±0,5 px, Zeilen fluchten, Markierungen mit gleichen Abständen ringsum (±1 px) und
// konzentrischem Radius (±2 px), Symbolkreise einer Reihe gleich groß, kein Knopf am Kartenrand.
// Den vollen Lauf (Tablet, dunkel, Casora Nebel) startet man vor Releases von Hand:
//   CASORA_URL=… node dev/qa/ausrichtung.mjs --shots /tmp/ausrichtung
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const tool = fileURLToPath(new URL('../ausrichtung.mjs', import.meta.url));
const r = spawnSync(process.execPath, [tool, '--dash', dash.url, '--views', 'desktop,handy', '--looks', 'Casora:hell'],
  { encoding: 'utf8', env: process.env, timeout: 15 * 60 * 1000 });
const out = (r.stdout || '') + (r.stderr || '');
const lines = out.split('\n');
const summary = lines.find((l) => /^(PASS|FAIL) ausrichtung/.test(l)) || out.slice(-400);
const n = Number((summary.match(/(\d+) Messungen/) || [])[1] || 0);
await check('Studio-Stationen gemessen (mind. 25)', n >= 25, summary);
const funde = lines.filter((l) => /^ {7}\S/.test(l)).map((l) => l.trim());
await check('keine Ausrichtungsfehler im Studio', r.status === 0 && /^PASS/.test(summary), funde.slice(0, 8).join(' | ') || summary);
await finish();
