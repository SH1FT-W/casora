// @deckt: custom_components/casora/panel/casora-panel.js#_allTilesAuto
// „Alle Kacheln auf Automatisch“ (Studio › Handy): the question's text is translated before the number goes in
// (Prüfrunde u04-03, the German Studio showed it in English), and a second click with nothing left to change says so
// instead of doing nothing (u04-07).
//   node dev/unit/alle_kacheln_automatisch.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/panel/casora-panel.js');
const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
const i = src.indexOf('  async _allTilesAuto() {');
assert.ok(i > 0, '_allTilesAuto exists');
const body = src.slice(src.indexOf('{', i) + 1, src.indexOf('\n  }\n', i));
const window = { casoraI18n: { t: (s) => de[s] || s } };
const trLabel = (s) => window.casoraI18n.t(s);
const run = new Function('trLabel', 'window', 'return async function () {' + body + '\n};')(trLabel, window);

const studio = (sizes) => {
  const me = { asked: [], toasts: [], dirty: 0,
    _state: { compact: { rooms: [{ tiles: sizes.map((s) => ({ type: 'custom:button-card', variables: s ? { size: s } : {} })) }] } },
    _ask(o) { me.asked.push(o); return Promise.resolve(true); },
    _bToast(m) { me.toasts.push(m); },
    _markDirty() { me.dirty++; }, _renderForm() {}, _syncPreview() {} };
  return me;
};

const a = studio(['l', null, 'auto']);
await run.call(a);
assert.equal(a.asked.length, 1);
assert.equal(a.asked[0].message, '2 Kacheln bekommen am Handy die Größe Automatisch. Danach speichern, damit es gilt.', 'the German text with the number');
assert.equal(a.dirty, 1);

const b = studio(['auto', 'auto']);
await run.call(b);
assert.equal(b.asked.length, 0, 'nothing to ask');
assert.deepEqual(b.toasts, ['Alle Kacheln stehen schon auf Automatisch.'], 'a note instead of silence');
console.log('alle_kacheln_automatisch: ok');
