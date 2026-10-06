// Einheitliches Ergebnis für E2E-Tests (wie dev/qa/regress/lib.mjs): je Prüfung eine Zeile
// „ok“/„FEHLER“, am Ende genau eine Zeile „PASS <name>“ bzw. „FAIL <name> – x von y Prüfungen“
// und Rückgabe 0/1. dev/qa/pool.mjs wertet bei Tests mit dieser Zeile nur noch sie und den
// Rückgabewert aus (06.10.2026: vorher konnten 13 Tests inhaltlich nie rot werden).
import path from 'node:path';

const NAME = path.basename(process.argv[1] || 'test', '.mjs');
let checks = 0, fails = 0;

export function check(label, ok, info) {
  checks++;
  if (ok) { console.log('  ok     ' + label); return true; }
  fails++;
  console.log('  FEHLER ' + label + (info !== undefined ? ' – ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : ''));
  return false;
}

// Browser-Fehler, die alle Tests gleich ausblenden (fehlende Bilder, Erweiterungen des Testbrowsers).
export const echteFehler = (errors, extra) => errors.filter((e) => !/addEventListener|404/.test(e) && !(extra && extra.test(e)));

export function ende() {
  if (!checks) { fails++; console.log('  FEHLER keine Prüfung gelaufen'); }
  console.log(fails ? `FAIL ${NAME} – ${fails} von ${checks} Prüfungen` : `PASS ${NAME} – ${checks} Prüfungen`);
  process.exitCode = fails ? 1 : 0;
}
