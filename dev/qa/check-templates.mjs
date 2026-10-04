// Syntaxprüfung aller JavaScript-Vorlagen [[[ … ]]] in den Kartenvorlagen – so, wie
// button-card sie übersetzt (new Function). Ein offenes String-Literal legt sonst ganze
// Dashboards lahm, ohne dass es beim Bauen auffällt.
//   node dev/qa/check-templates.mjs [datei.json …]   (Standard: dashboards/casora/button_card_templates.json)
import fs from 'node:fs';

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : [new URL('../../dashboards/casora/button_card_templates.json', import.meta.url).pathname];
const ARGS = ['states', 'entity', 'user', 'hass', 'variables', 'html'];
let n = 0;
const bad = [];
for (const f of files) {
  const doc = JSON.parse(fs.readFileSync(f, 'utf8'));
  const walk = (v, where) => {
    if (typeof v === 'string') {
      const s = v.trim();
      if (!s.startsWith('[[[') || !s.endsWith(']]]')) return;
      n++;
      try { new Function(...ARGS, s.slice(3, -3)); } catch (e) { bad.push(`${where}: ${e.message}`); }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, where ? `${where}.${k}` : k);
  };
  walk(doc.templates && typeof doc.templates === 'object' ? doc.templates : doc, '');
}
bad.forEach((b) => console.log('FEHLER ' + b));
console.log(`${n} Vorlagen-Ausdrücke geprüft, ${bad.length} mit Syntaxfehler`);
process.exit(bad.length ? 1 : 0);
