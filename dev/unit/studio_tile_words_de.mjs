// The Studio speaks like the dashboard (wortliste; design audit 14.11.2026): the font sample read „Lichter 2 An“ (a count
// with its state word is lower case, wortliste „Zahl + Zustandswort“: „2 an“), and the preview's fallback thermostat word
// (tileStateWord in casora-panel.js, for tiles without a Casora template) read „21.4° · Aus“ with a decimal point where
// the dashboard writes „21,4°“ (numbers in the user's locale, casoraNum). The fallback words are English and go through
// the panel's table, whose thermostat patterns now take the decimal comma.
//   node dev/unit/studio_tile_words_de.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json'));

// 1. Counts with a state word stay lower case in the German panel table.
const flat = [];
(function walk(o) { for (const [k, v] of Object.entries(o)) typeof v === 'string' ? flat.push([k, v]) : walk(v); })(de);
const STATE = /^(\d+|\{\w+\}) (an|aus|offen|schwach|verfügbar|aktiv|läuft|geöffnet)$/i;
for (const [k, v] of flat) if (STATE.test(v)) assert.equal(v, v.replace(/ (\S+)$/, (m, w) => ' ' + w.toLowerCase()), `de.json „${k}“ → „${v}“: count + state word lower case`);
assert.equal((de.exact || de)['2 on'], '2 an', 'de.json: „2 on“ → „2 an“');

// 2. The thermostat preview writes its room reading in the locale.
const src = read('custom_components/casora/panel/casora-panel.js');
const a = src.indexOf('const tileStateWord = (kind, tile, ent, states, hass) => {');
assert.ok(a > 0, 'tileStateWord found');
const b = src.indexOf('\n};', a) + 3;
const n0 = src.indexOf('const numText = ');
const n1 = src.indexOf('\n', src.indexOf('\n', n0) + 1);
const make = (window) => new Function('window', src.slice(n0, n1) + '\n' + src.slice(a, b) + '\nreturn tileStateWord;')(window);
const win = { casoraLocale: () => 'de-DE' };
const word = make(win);
const ent = { entity_id: 'climate.qa', state: 'off', attributes: { current_temperature: 21.43 } };
const got = word('thermostat', { variables: {} }, ent, { 'climate.qa': ent }, null);
assert.ok(/^21,4° · /.test(got), `thermostat preview in de: ${JSON.stringify(got)}`);
const got2 = word('thermostat', { variables: {} }, { ...ent, attributes: { current_temperature: 21 } }, {}, null);
assert.ok(/^21° · /.test(got2), `whole degrees without „,0“: ${JSON.stringify(got2)}`);
const S = { 'sensor.qa_t': { state: '19.96', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } } };
const got3 = word('thermostat', { variables: { temp_sensor: 'sensor.qa_t' } }, ent, S, null);
assert.ok(/^20° · /.test(got3), `sensor reading rounded and in de: ${JSON.stringify(got3)}`);
// The word goes through the panel's German table afterwards: its patterns must take the decimal comma too.
const pats = (de.patterns || []).map(([re, rep]) => [new RegExp(re), rep]);
const trDe = (t) => { for (const [re, rep] of pats) { const m = t.match(re); if (m) return rep.replace(/\{(\d+)\}/g, (_, i) => { const g = m[+i] || ''; return (de.exact || {})[g] != null ? de.exact[g] : g; }); } return (de.exact || {})[t] != null ? de.exact[t] : t; };
assert.equal(trDe(got), '21,4° · Aus', `translated thermostat word: ${JSON.stringify(trDe(got))}`);
console.log('studio_tile_words_de: ok');
