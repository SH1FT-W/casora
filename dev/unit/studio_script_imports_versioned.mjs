// Studio: dashboard scripts are imported only through window.casoraImportScript (casora-panel-types.js),
// which adds the ?v= a dashboard loads them with. A plain "/casora_scripts/…" URL is a second module
// instance next to the dashboard's (the module runs twice) and is revalidated on every open.
// Allowed: the fallback "(p) => import("/casora_scripts/" + p)" used only when casoraImportScript is missing,
// and the resolver itself in casora-panel-types.js.
import fs from 'node:fs';
import path from 'node:path';

const dir = new URL('../../custom_components/casora/panel/', import.meta.url).pathname;
const FALLBACK = 'import("/casora_scripts/" + p)';
const bad = [];
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/^\s*\/\/.*$/, '');
    const rest = code.split(FALLBACK).join('');
    // A literal path to a script file outside the resolver.
    if (f !== 'casora-panel-types.js' && /["'`]\/casora_scripts\/[\w./-]+\.js/.test(rest)) bad.push(`${f}:${i + 1} literal script URL: ${line.trim()}`);
    // A dynamic import of anything but the resolver's URL, a Lovelace resource URL or the settings file.
    for (const m of rest.matchAll(/\bimport\(\s*([^)]*)\)/g)) {
      const arg = m[1].trim();
      if (arg === 'u' || arg === 'url' || arg.startsWith('"/casora_assets/einstellungen.js')) continue;
      if (/^src\b/.test(arg)) continue; // own methods named _import(src, …)
      bad.push(`${f}:${i + 1} import(${arg})`);
    }
  });
}
if (bad.length) {
  console.error('FAIL Studio script imports without casoraImportScript:\n  ' + bad.join('\n  '));
  process.exit(1);
}
console.log('ok studio_script_imports_versioned');
