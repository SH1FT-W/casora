// dev/e2e/ergebnis.mjs: eine fehlgeschlagene Prüfung gibt „FAIL <name>“ und Rückgabe 1,
// alle ok „PASS <name>“ und 0, gar keine Prüfung zählt als FAIL (T-01, 06.10.2026).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const helper = new URL('../e2e/ergebnis.mjs', import.meta.url).href;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casora-ergebnis-'));
let fails = 0;
function run(name, body) {
  const f = path.join(dir, name + '.mjs');
  fs.writeFileSync(f, `import { check, ende, echteFehler } from ${JSON.stringify(helper)};\n${body}\nende();\n`);
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8' });
  return { rc: r.status, out: r.stdout + r.stderr };
}
function expect(label, ok, info) { console.log((ok ? '  ok     ' : '  FEHLER ') + label + (ok ? '' : ' – ' + info)); if (!ok) fails++; }

let r = run('t98_gut', "check('a', true); check('b', 1 === 1);");
expect('alles ok → PASS + 0', r.rc === 0 && /^PASS t98_gut – 2 Prüfungen$/m.test(r.out), r.out);
r = run('t97_rot', "check('a', true); check('Abweichung', false, ['x ≠ y']);");
expect('Abweichung → FAIL + 1', r.rc === 1 && /^FAIL t97_rot – 1 von 2 Prüfungen$/m.test(r.out) && /FEHLER Abweichung – \["x ≠ y"\]/.test(r.out), r.out);
r = run('t96_leer', '');
expect('keine Prüfung → FAIL', r.rc === 1 && /^FAIL t96_leer/m.test(r.out), r.out);
r = run('t95_filter', "check('Filter', echteFehler(['Failed: 404', 'x addEventListener', 'MIME type', 'Boom']).join() === 'MIME type,Boom' && echteFehler(['MIME type'], /MIME/).length === 0);");
expect('Browser-Fehler-Filter', r.rc === 0, r.out);
fs.rmSync(dir, { recursive: true, force: true });
console.log(fails ? `FEHLER: ${fails}` : 'alle ok');
process.exit(fails ? 1 : 0);
