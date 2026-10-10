// Studio-Vorschau (casoraTileState-Rückfall): Englisch „62%“, Deutsch „62 %“ – wie HA selbst (Backlog E2).
//   node dev/unit/studio_prozent_en.mjs
import assert from 'node:assert/strict';
globalThis.window = globalThis;
await import(new URL('../../custom_components/casora/panel/casora-panel-types.js', import.meta.url));
const tpl = window.CASORA_TILE_TYPES.find((t) => typeof t.template === 'string').template;
const st = (v, unit, lang) => window.casoraTileState({ template: tpl }, { state: v, attributes: { unit_of_measurement: unit } }, { locale: { language: lang } }, {});
assert.equal(st('62', '%', 'en'), '62%');
assert.equal(st('62', '%', 'de'), '62 %');
assert.equal(st('21.5', '°C', 'en'), '21.5 °C');
assert.equal(st('21.5', '°C', 'de'), '21,5 °C');
console.log('ok studio_prozent_en');
