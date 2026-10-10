// Bau-Regeln der Vorlagen (Bau-Handbuch 1.3, docs/handbuch/blaupause-*.md), statisch ohne HA:
//   node dev/unit/vorlagen_regeln.mjs
//  1. Verschachtelte Karte in custom_fields mit eigener javascript-Aktion braucht do_not_eval: true –
//     sonst wertet die Elternkarte den Klick-Code schon beim Rendern aus und der Tipp tut nichts.
//  2. Popups mit Platten-Auftritt (--casora-popup-plate-enter: casora-plate-in …) schalten ihn bei
//     prefers-reduced-motion ab.
//  3. Auswahllisten zeigen die aktive Zeile hinterlegt (_casoraSelRows), nie einen Haken als Wert.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));

const walk = (x, p, fn) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y, i) => walk(y, p + '.' + i, fn)); return; }
  fn(x, p);
  for (const [k, v] of Object.entries(x)) walk(v, p + '.' + k, fn);
};

// 1. do_not_eval
const ohneDNE = [];
let nested = 0;
for (const [name, t] of Object.entries(T)) {
  walk(t, name, (x, p) => {
    if (!/\.custom_fields\.[^.]+$/.test(p) || !x.card || typeof x.card !== 'object') return;
    nested++;
    if (/"action"\s*:\s*"javascript"/.test(JSON.stringify(x.card)) && x.do_not_eval !== true) ohneDNE.push(p);
  });
}
assert.ok(nested > 20, `zu wenige verschachtelte Karten gefunden (${nested}) – Vorlagen-Datei geändert?`);
assert.deepEqual(ohneDNE, [], 'Verschachtelte Karte mit javascript-Aktion ohne do_not_eval:\n  ' + ohneDNE.join('\n  '));

// 2. reduzierte Bewegung
const ohneRuhe = [];
let auftritte = 0;
for (const [name, t] of Object.entries(T)) {
  walk(t, name, (x, p) => {
    if (typeof x.styles !== 'string' || !/--casora-popup-plate-enter\s*:\s*casora-plate-in/.test(x.styles)) return;
    auftritte++;
    if (!/prefers-reduced-motion\s*:\s*reduce/.test(x.styles)) ohneRuhe.push(p);
  });
}
assert.ok(auftritte > 10, `zu wenige Popup-Auftritte gefunden (${auftritte})`);
assert.deepEqual(ohneRuhe, [], 'Popup-Auftritt ohne prefers-reduced-motion:\n  ' + ohneRuhe.join('\n  '));

// 3. kein Haken als Zeilenwert (Vorlagen und Dashboard-Skripte)
const C = 'custom_components/casora/scripts/';
const quellen = ['dashboards/casora/button_card_templates.json',
  ...fs.readdirSync(new URL('../../' + C, import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => C + f),
  ...fs.readdirSync(new URL('../../' + C + 'local/', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => C + 'local/' + f)];
const HAKEN = /\\?["']?value\\?["']?\s*:\s*\\?["'](?:✓|✔|\\u2713|\\u2714)\\?["']/g;
const haken = quellen.flatMap((f) => (rd(f).match(HAKEN) || []).map((m) => f + ': ' + m));
assert.deepEqual(haken, [], 'Auswahlliste mit Haken statt hinterlegter Zeile (_casoraSelRows):\n  ' + haken.join('\n  '));

console.log(`ok vorlagen_regeln (${nested} verschachtelte Karten, ${auftritte} Popup-Auftritte, ${quellen.length} Dateien)`);
