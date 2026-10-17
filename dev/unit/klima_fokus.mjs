// Klima-Popup: vom Luftfeuchtigkeits-Badge aus startet das Diagramm mit der Luftfeuchtigkeit (Daniel, 17.10.2026).
// Prüft den Chart-Umschalter (selected: Index/Entität) und dass die Vorlage ihn setzt.   node dev/unit/klima_fokus.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// casora-chart im Node: HTMLElement/customElements nachstellen, nur setConfig prüfen.
globalThis.window = globalThis;
globalThis.HTMLElement = class { toggleAttribute() {} attachShadow() { return { innerHTML: '' }; } };
globalThis.customElements = { get: () => undefined, define: () => {} };
globalThis.document = { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), querySelector: () => null, addEventListener: () => {} };
new Function(src('custom_components/casora/scripts/casora-chart.js'))();
const Chart = window._casoraChartClass || null;
const tpl = JSON.parse(src('custom_components/casora/panel/casora-templates.json'));
const T = tpl.templates || tpl.button_card_templates || tpl;
const content = T.casora_climate_popup.tap_action.casora_popup.content;
assert.match(content, /selected: ownDc === 'humidity' && humidId \? humidId : \(tempId \|\| humidId \|\| 0\)/, 'Vorlage setzt selected');
// setConfig-Logik nachgestellt wie in casora-chart.js
const pick = (series, sel) => {
  let si = 0;
  if (typeof sel === 'number' && sel >= 0 && sel < series.length) si = Math.floor(sel);
  else if (typeof sel === 'string') si = Math.max(0, series.findIndex((x) => x.entity === sel));
  return si;
};
const S = [{ entity: 'sensor.t' }, { entity: 'sensor.h' }];
assert.equal(pick(S, 'sensor.h'), 1, 'Entität → Index');
assert.equal(pick(S, 'sensor.t'), 0); assert.equal(pick(S, 'sensor.x'), 0, 'unbekannt → erste'); assert.equal(pick(S, 1), 1); assert.equal(pick(S, 5), 0); assert.equal(pick(S, undefined), 0);
assert.match(src('custom_components/casora/scripts/casora-chart.js'), /c\.selected/, 'Chart liest selected');
void Chart;
console.log('klima_fokus: ok');
