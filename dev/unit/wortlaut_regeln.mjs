// Wortlaut-Regeln über alle Übersetzungstabellen (Wortlaut-Runde 1.3, 10.10.2026).
//   node dev/unit/wortlaut_regeln.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const J = (p) => JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/' + p, import.meta.url), 'utf8'));
const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, p + k + '.') : [[p + k, v]]));
const slots = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
const groups = (rx) => new RegExp(rx + '|').exec('').length - 1;

// 1. Integration (Einrichtung, Optionen, Dienste): gleiche Schlüssel, gleiche Platzhalter.
const ide = Object.fromEntries(flat(J('de.json'))), ien = Object.fromEntries(flat(J('en.json')));
assert.deepEqual(Object.keys(ide).sort(), Object.keys(ien).sort(), 'Integration: de/en gleiche Schlüssel');
for (const k of Object.keys(ien)) assert.equal(slots(ide[k]), slots(ien[k]), 'Integration: Platzhalter ' + k);
// „With HACS, turn on betas in HACS instead“ – ohne „stattdessen“ las sich der Satz doppelt.
assert.match(ide['options.step.init.data_description.beta_updates'], /stattdessen in HACS/);

// 2. Dashboard-Phrasen: Muster kompilieren, {n} nur bis zur Zahl der Gruppen.
const ph = J('dashboard/phrases/en.json');
for (const [rx, en] of ph.patterns) {
  const n = groups(rx);
  for (const m of en.matchAll(/\{(\d+)\}/g)) assert.ok(+m[1] <= n, `Phrase ${rx}: {${m[1]}} ohne Gruppe`);
}

// 3. Studio: Platzhalter im Original = in der Übersetzung; Muster wie oben.
const pd = J('panel/de.json');
for (const [en, de] of Object.entries(pd.exact)) assert.equal(slots(de), slots(en), 'Studio: Platzhalter in ' + en);
for (const [rx, de] of pd.patterns) {
  const n = groups(rx);
  for (const m of de.matchAll(/\{(\d+)\}/g)) assert.ok(+m[1] <= n, `Studio-Muster ${rx}: {${m[1]}} ohne Gruppe`);
}

// 4. Casora duzt: keine Sie-Form in Studio und Integration (Satzanfang „Sie“ = 3. Person, erlaubt).
const formal = /(?<![.!?:–]\s|^|„)\b(Sie|Ihre?[mnrs]?|Ihnen)\b/;
for (const s of [...Object.values(pd.exact), ...Object.values(ide)]) assert.ok(!formal.test(s), 'Sie-Form: ' + s);

// 5. Nach außen nie „Studio B“.
for (const s of [...Object.values(pd.exact), ...Object.values(ph.exact), ...Object.values(ide), ...Object.values(ien)]) assert.ok(!/Studio B\b/.test(s), 'Studio B: ' + s);
console.log('ok wortlaut_regeln');
