// Design-Zähler (Bau-Handbuch 1.3, docs/handbuch/design-regeln.md): keine neuen festen Werte neben den Tokens.
//   node dev/unit/design_zaehler.mjs                     prüfen
//   node dev/unit/design_zaehler.mjs --grenzen-schreiben  Grenzen auf den Stand des Checkouts setzen (nur nach Absprache)
// Gezählt wird im ausgelieferten Code ohne Theme-Dateien (die Themes SIND die Tokens), getrennt nach
// Dashboard (scripts/, scripts/local/, Vorlagen-Quelle) und Studio (panel/casora-panel*.js):
//  - feste Farben (#rgb/#rrggbb/#rrggbbaa)        – nur bekannte Werte erlaubt (Rückfallwerte in var(--x, #…))
//  - border-radius in px                           – nur bekannte Stufen erlaubt
//  - Bewegungskurven cubic-bezier(…)               – nur bekannte Kurven erlaubt
//  - halbe Pixel bei font-size                     – Anzahl darf nicht steigen
//  - feste Schatten (box-shadow mit rgba, ohne var) – Anzahl darf nicht steigen
// Wer eine neue Farbe/Stufe/Kurve braucht, nimmt eine Theme-Variable. Sinken die Zahlen (Aufräumen), meldet der
// Test das, damit die Grenze nachgezogen wird.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const GRENZEN = new URL('./design_grenzen.json', import.meta.url);
const rd = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const ls = (dir, re) => fs.readdirSync(new URL(dir, root)).filter((f) => re.test(f)).sort().map((f) => dir + f);
const C = 'custom_components/casora/';
const BEREICHE = {
  dashboard: [...ls(C + 'scripts/', /\.js$/), ...ls(C + 'scripts/local/', /\.js$/), 'dashboards/casora/button_card_templates.json'],
  studio: ls(C + 'panel/', /^casora-panel.*\.js$/),
};

const norm = {
  hex: (s) => s.toLowerCase(),
  radius: (s) => s.replace(/^.*?(\d+(?:\.\d+)?px)$/, '$1'),
  kurve: (s) => s.replace(/\s+/g, '').replace(/(^|[(,])0\./g, '$1.'),
};
const RX = {
  hex: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g,
  radius: /border-radius["']?\s*:\s*["']?\d+(?:\.\d+)?px/g,
  kurve: /cubic-bezier\([^)]*\)/g,
  halbpx: /font-size["']?\s*:\s*["']?\d+\.\d+px/g,
  schatten: /box-shadow["']?\s*:\s*["']?(?!var\(|none|inherit|initial|unset)[^;"'\n]*rgba?\(/g,
};

const messen = () => {
  const out = {};
  for (const [b, files] of Object.entries(BEREICHE)) {
    const m = { hex: new Map(), radius: new Map(), kurve: new Map(), halbpx: 0, schatten: 0 };
    for (const f of files) {
      const src = rd(f);
      for (const k of ['hex', 'radius', 'kurve']) {
        for (const hit of src.match(RX[k]) || []) { const v = norm[k](hit); if (!m[k].has(v)) m[k].set(v, f); }
      }
      m.halbpx += (src.match(RX.halbpx) || []).length;
      m.schatten += (src.match(RX.schatten) || []).length;
    }
    out[b] = m;
  }
  return out;
};

const ist = messen();
const sortVals = (k, xs) => [...xs].sort(k === 'radius' ? (a, b) => parseFloat(a) - parseFloat(b) : undefined);

if (process.argv.includes('--grenzen-schreiben')) {
  const g = {};
  for (const [b, m] of Object.entries(ist)) {
    g[b] = { hex: sortVals('hex', m.hex.keys()), radius: sortVals('radius', m.radius.keys()), kurve: sortVals('kurve', m.kurve.keys()),
      halbpx: m.halbpx, schatten: m.schatten };
  }
  fs.writeFileSync(GRENZEN, JSON.stringify(g, null, 1) + '\n');
  console.log('Grenzen geschrieben:', GRENZEN.pathname);
  process.exit(0);
}

const g = JSON.parse(fs.readFileSync(GRENZEN, 'utf8'));
const fehler = [], senkbar = [];
for (const [b, m] of Object.entries(ist)) {
  const erlaubt = g[b];
  assert.ok(erlaubt, 'Grenzen für ' + b + ' fehlen');
  for (const k of ['hex', 'radius', 'kurve']) {
    const ok = new Set(erlaubt[k]);
    const neu = [...m[k].entries()].filter(([v]) => !ok.has(v));
    if (neu.length) fehler.push(b + ' ' + k + ': ' + neu.map(([v, f]) => v + ' (' + f + ')').join(', '));
    const weg = erlaubt[k].filter((v) => !m[k].has(v));
    if (weg.length) senkbar.push(b + ' ' + k + ' nicht mehr verwendet: ' + weg.join(', '));
  }
  for (const k of ['halbpx', 'schatten']) {
    if (m[k] > erlaubt[k]) fehler.push(b + ' ' + k + ': ' + m[k] + ' statt höchstens ' + erlaubt[k]);
    else if (m[k] < erlaubt[k]) senkbar.push(b + ' ' + k + ': ' + m[k] + ' < Grenze ' + erlaubt[k]);
  }
}
// Plausibilität: Zähler greift überhaupt (Dateien umbenannt?).
assert.ok(ist.dashboard.hex.size > 20 && ist.studio.hex.size > 20, 'zu wenige Farben gefunden – Dateien verschoben?');

if (senkbar.length) console.log('Hinweis – Grenzen können sinken (node dev/unit/design_zaehler.mjs --grenzen-schreiben):\n  ' + senkbar.join('\n  '));
assert.deepEqual(fehler, [], 'Neue feste Werte statt Theme-Variablen (docs/handbuch/design-regeln.md):\n  ' + fehler.join('\n  '));
console.log('ok design_zaehler');
