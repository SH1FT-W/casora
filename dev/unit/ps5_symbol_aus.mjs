// Test round 26.11.2026 (d02-03): the PlayStation tile, off, in the light look. Its icon was the ready-made picture
// ps5_off (white fill) on the light sand circle – nearly invisible – because icon_never_masked was true for the PS5 in
// every state. Off, it is masked in the off ink like Apple TV and the TV; only while it plays (dark circle) the picture.
//   node dev/unit/ps5_symbol_aus.mjs
// @deckt: dashboards/casora/button_card_templates.json#casora_media
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const V = T.casora_media.variables;
const never = (icon, state, extra) => new Function('entity', 'variables', 'states', 'hass', body(V.icon_never_masked))(
  { entity_id: 'media_player.example_ps5', state, attributes: {} }, { icon, active_states: extra }, {}, {});

assert.equal(never('ps5', 'off'), false, 'off: masked like its neighbours');
assert.equal(never('ps5', 'standby'), false);
assert.equal(never('ps5', 'playing'), true, 'playing: the coloured picture on the dark circle');
assert.equal(never('ps5', 'on', ['on']), true, 'an extra active state counts as playing (is_active)');
assert.equal(never('tv', 'playing'), false, 'other icons always masked');
// The mask has the off form ready.
assert.match(T.casora_media.styles.card.map((x) => JSON.stringify(x)).join(''), /ps5_off/);
console.log('ok PS5 icon off: masked');
