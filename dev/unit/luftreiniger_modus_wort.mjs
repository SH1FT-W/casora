// Prüfrunde d03-14 (part): the air purifier tile wrote the raw preset „auto“ while its popup said „Auto“ (HA has no
// translation for the integration's preset). One answer for both: window.casoraPresetLabel (casora-core.js).
//   node dev/unit/luftreiniger_modus_wort.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_air_purifier,casora_fan custom_components/casora/scripts/casora-core.js#casoraPresetLabel
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  var PRESET = {'), b = core.indexOf('  // A raw value HA had no words for', a);
assert.ok(a > 0 && b > a, 'casoraPresetLabel in casora-core.js');
const window = {};
new Function('window', core.slice(a, b))(window);
const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
// HA without a translation hands the raw value back.
const hass = { formatEntityAttributeValue: (e, k, v) => String(v) };
const ent = { entity_id: 'fan.qa_luftreiniger', state: 'on', attributes: { preset_mode: 'auto', percentage: 40 } };
const tile = new Function('window', 'states', 'hass', 'variables', 'entity', body(T.casora_air_purifier.state_display));
assert.equal(tile(window, {}, hass, {}, ent), 'Auto', 'tile says the popup\'s word');
assert.equal(window.casoraPresetLabel(hass, ent, 'sleep'), 'Schlafen');
assert.equal(window.casoraPresetLabel({ formatEntityAttributeValue: () => 'Automatisch' }, ent, 'auto'), 'Automatisch', 'HA\'s translation first');
// The popups use the same helper.
for (const k of ['casora_air_purifier', 'casora_fan']) {
  assert.ok(T[k].tap_action.casora_popup.content.includes('window.casoraPresetLabel(hass, entity, p)'), k + ': popup uses the helper');
}
console.log('luftreiniger_modus_wort: ok');
