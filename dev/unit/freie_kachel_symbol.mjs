// Prüfrunde d03-14 (part): a Universal tile with a switch and no icon of its own showed the „?“ placeholder while its
// popup showed a switch symbol. Without an own icon the tile takes its domain's Casora icon like the neighbouring tiles
// (casora_switch: power_on, casora_light: light, casora_fan: fan, casora_vacuum: vacuum); an own icon stays.
//   node dev/unit/freie_kachel_symbol.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_free
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const src = T.casora_free.entity_picture || T.casora_entity.entity_picture;
const window = { casoraIconUrl: (n) => '/i/' + n + '.svg' };
const pic = (id, icon) => new Function('window', 'variables', 'entity', 'states', body(src))(window, { icon: icon || 'default' }, id ? { entity_id: id } : null, {});
assert.equal(pic('switch.qa_abschaeumer'), '/i/power_on.svg', 'switch: power icon, no „?“');
assert.equal(pic('input_boolean.qa_gast'), '/i/power_on.svg');
assert.equal(pic('light.qa_lampe'), '/i/light.svg');
assert.equal(pic('fan.qa_luefter'), '/i/fan.svg');
assert.equal(pic('switch.qa_abschaeumer', 'aquarium'), '/i/aquarium.svg', 'own icon stays');
assert.equal(pic('sensor.qa_wert'), '/i/default.svg', 'no domain icon: as before');
assert.equal(pic(null), '/i/default.svg', 'no entity: as before');
console.log('freie_kachel_symbol: ok');
