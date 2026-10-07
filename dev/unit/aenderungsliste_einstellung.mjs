// Änderungsliste nennt die Einstellung (note1 Frage 6).  node dev/unit/aenderungsliste_einstellung.mjs
// Eine Dashboard-Einstellung, die in allen Räumen steht, heißt „Uhrzeit: 12-Stunden-Uhr an“ statt
// „Dashboard-Einstellungen geändert“. Unbekannte Schlüssel und Änderungen am Dashboard selbst bleiben allgemein.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
const win = {};
new Function('window', src('casora-panel-b-mehr.js'))(win);
const { changeLines } = win.__casoraStudioMehr;
const J = JSON.stringify;
const room = (path, variables) => ({ path, name: path, tiles: [], variables: variables || {} });
const st = (rooms, dash) => [{ rooms }, dash || {}, {}, null, null];
const clone = (x) => JSON.parse(J(x));

// Felder wie im Panel (SECTIONS) – nur die hier geprüften.
const sections = [
  { label: 'Time', fields: [{ key: 'use_12h', label: '12-hour clock', type: 'bool', boolDefault: false },
    { key: 'show_time', label: 'Show clock', type: 'bool', boolDefault: true }] },
  { label: 'General', title: 'Controls', fields: [
    { key: 'casora_hide_header', label: 'Show the HA header', type: 'bool', invert: true, boolDefault: true },
    { key: 'font', label: 'Font', type: 'select', optionLabels: { '': 'Default (theme)', inter: 'Inter' } }] },
];
// Die Felder gibt es im Panel wirklich so.
const panel = src('casora-panel.js');
assert.match(panel, /key: "use_12h", label: "12-hour clock", type: "bool"/);
assert.match(panel, /label: "Time", icon: "clock"/);
assert.match(panel, /SECTIONS, tileTwinKey/, 'SECTIONS steht in __casoraPanelInternals');

const base = st(['home', 'kueche', 'bad'].map((p) => room(p, { use_12h: false, font: '' })));
const ctx = { sections };
const set = (k, v) => { const x = clone(base); x[0].rooms.forEach((r) => { r.variables[k] = v; }); return x; };

assert.deepEqual(changeLines(base, set('use_12h', true), ctx), ['Time: 12-hour clock on']);
assert.deepEqual(changeLines(base, set('font', 'inter'), ctx), ['Controls: Font → Inter']);
assert.deepEqual(changeLines(base, set('casora_hide_header', true), ctx), ['Controls: Show the HA header off'], 'umgekehrter Schalter');
// Zwei Einstellungen zugleich: beide beim Namen
const two = set('use_12h', true); two[0].rooms.forEach((r) => { r.variables.font = 'inter'; });
assert.deepEqual(changeLines(base, two, ctx), ['Time: 12-hour clock on · Controls: Font → Inter']);
// Unbekannter Schlüssel → wie bisher
assert.deepEqual(changeLines(base, set('mystery_key', 3), ctx), ['Dashboard settings changed']);
// Ohne Felder (kein Panel) → wie bisher
assert.deepEqual(changeLines(base, set('use_12h', true), {}), ['Dashboard settings changed']);
// Änderung am Dashboard selbst (nicht in den Räumen) → allgemein
const d = clone(base); d[1] = { theme: 'x' };
assert.deepEqual(changeLines(base, d, ctx), ['Dashboard settings changed']);
console.log('ok aenderungsliste_einstellung');
