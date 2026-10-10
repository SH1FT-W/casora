// d-kacheln (Feinschliff 1.3): Die Jalousien-Kachel zeigte direkt nach dem Laden der Startseite „open“
// (deutsches Haus) – hass.formatEntityState gibt vor dem Laden der Übersetzungen den rohen Zustand
// zurück. Prüft: casora_cover nimmt Casoras Zustandswort (_casoraStateText) und das liefert auch dann
// „Geöffnet“/„Geschlossen“, wenn formatEntityState noch roh antwortet.
//   node dev/unit/jalousie_zustand_roh.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const sd = T.casora_cover.state_display;
assert.ok(/window\._casoraStateText\(hass, entity\)/.test(sd), 'casora_cover nutzt _casoraStateText');
assert.ok(sd.indexOf('_casoraStateText') < sd.indexOf('formatEntityState(entity)'), 'Casoras Wort vor formatEntityState');
const core = read('custom_components/casora/scripts/casora-core.js');
const s = core.indexOf('(function () {\n  if (window._casoraStateText) return;');
assert.ok(s > 0, 'Zustands-Modul gefunden');
const window = {};
vm.runInNewContext(core.slice(s, core.indexOf('\n})();', s) + 6), { window });
const roh = { formatEntityState: (e) => e.state }; // wie direkt nach dem Laden
assert.equal(window._casoraStateText(roh, { entity_id: 'cover.beispiel', state: 'open' }), 'Geöffnet');
assert.equal(window._casoraStateText(roh, { entity_id: 'cover.beispiel', state: 'closed' }), 'Geschlossen');
assert.equal(window._casoraStateText(roh, { entity_id: 'cover.beispiel', state: 'unavailable' }), 'Nicht verfügbar');
console.log('ok jalousie_zustand_roh');
