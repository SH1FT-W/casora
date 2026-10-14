// Update-Logos einheitlich (14.10.2026): Jede Zeile, die ein Update-Logo (logoOf) als Bild trägt,
// braucht logo: true – sonst zeichnet casora-core.js das alte runde Logo im eckigen Grund.
// 1.5 hatte das nur an einer von sechs Stellen; diese Prüfung verhindert, dass eine Liste rausfällt.
//   node dev/qa/check-logos.mjs
import fs from 'node:fs';
import path from 'node:path';

const dir = new URL('../../custom_components/casora/scripts/', import.meta.url).pathname;
const files = [path.join(dir, 'casora-core.js'), ...fs.readdirSync(path.join(dir, 'local')).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, 'local', f))];
const bad = [];
let n = 0;
for (const f of files) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (!/image:\s*[^,]*logoOf\(/.test(line)) return;
    n++;
    if (!/logo:\s*true/.test(line)) bad.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
  });
  // Eigene <img> mit Logo, aber rund beschnitten
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/<img src="' \+ esc\(pic\)/.test(line) && /border-radius:50%/.test(line)) bad.push(`${path.relative(process.cwd(), f)}:${i + 1} (rundes Logo)`);
  });
}
bad.forEach((b) => console.log('FEHLER Update-Logo ohne logo: true – ' + b));
console.log(`${n} Logo-Zeilen geprüft, ${bad.length} abweichend`);
process.exit(bad.length ? 1 : 0);
