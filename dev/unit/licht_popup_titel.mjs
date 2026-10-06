// Eigener Popup-Titel der Licht-Kachel (Funktionstest F-03, 06.10.2026).   node dev/unit/licht_popup_titel.mjs
// Gemeldet: Studio → Kachel „Beleuchtung“ → Popup → Popup-Titel „QA Lichtpopup“ wurde gespeichert
// (variables.room_name), das Popup hieß weiter wie das Gerät bzw. die Gruppe.
// Erwartet: eigener Titel zuerst (window.casoraPopupTitle wie bei Jalousie und Co.), ein Raumname
// zählt nicht als Titel; ohne eigenen Titel wie bisher (Kachelname, Gerätename, Gruppenkopf).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const basis = read('custom_components/casora/scripts/local/01-basis.js');

globalThis.window = {
  _casoraRoomNames: () => ['Wohnzimmer', 'Zuhause'],
  _casoraLovelaceCfg: () => ({ views: [{ path: 'wohnzimmer' }] }),
  _casoraLPC: (e, s, h, v, part) => (part === 'header' ? { title: 'Licht Wohnzimmer (Gruppe)' } : null),
};
const a = basis.indexOf('window.casoraPopupTitle = function');
assert.ok(a >= 0, 'casoraPopupTitle in 01-basis.js');
new Function(basis.slice(a, basis.indexOf('\n};', a) + 3))();

const expr = T.casora_light.tap_action.casora_popup.title.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const title = (variables, { group = false, name = '' } = {}) => {
  const entity = { entity_id: 'light.wz', state: 'on', attributes: { friendly_name: 'Licht Wohnzimmer', ...(group ? { entity_id: ['light.a', 'light.b'] } : {}) } };
  const states = { 'light.wz': entity };
  return new Function('entity', 'states', 'variables', 'hass', expr).call({ _config: { name } }, entity, states, variables, null);
};

assert.equal(title({ room_name: 'QA Lichtpopup' }), 'QA Lichtpopup', 'Einzel-Licht: eigener Titel');
assert.equal(title({ room_name: 'QA Lichtpopup' }, { group: true }), 'QA Lichtpopup', 'Lichtgruppe: eigener Titel');
assert.equal(title({}), 'Licht Wohnzimmer', 'ohne eigenen Titel: Gerätename');
assert.equal(title({}, { name: 'Decke' }), 'Decke', 'ohne eigenen Titel: Kachelname');
assert.equal(title({ room_name: 'Wohnzimmer' }), 'Licht Wohnzimmer', 'Raumname ist kein Titel');
assert.equal(title({}, { group: true }), 'Licht Wohnzimmer (Gruppe)', 'Gruppe ohne eigenen Titel: Gruppenkopf');
console.log('ok licht_popup_titel');
