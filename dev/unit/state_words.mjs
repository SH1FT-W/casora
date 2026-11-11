// Idle is not ready to start; action tiles offer Start, and off appliances remain off.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const root = new URL('../../', import.meta.url);
const T = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root)));
const show = (kind, state, variables = {}, id = 'sensor.example', attributes = {}) => {
  const src = T[kind].state_display.trim().slice(3, -3);
  const window = { casoraStateFit: t => t, casoraRunService: () => true };
  return new Function('entity', 'variables', 'states', 'window', 'hass', src).call({},
    { entity_id: id, state, attributes }, variables, {}, window, {});
};
for (const kind of ['casora_3d_printer', 'casora_air_purifier', 'casora_media', 'casora_vacuum']) {
  assert.equal(show(kind, 'idle'), 'Inaktiv', `${kind}: idle`);
}
assert.equal(show('casora_air_purifier', 'standby'), 'Bereitschaft', 'standby is not idle');
for (const [raw, word] of [['inactive', 'Inaktiv'], ['ready', 'Bereit'], ['off', 'Aus'], ['finished', 'Fertig']]) {
  assert.equal(show('casora_appliance', raw), word, `appliance: ${raw}`);
}
for (const [id, state] of [['script.example', 'off'], ['scene.example', 'unknown'], ['button.example', 'unknown']]) {
  assert.equal(show('casora_entity_actions', state, { tap_run: true }, id), 'Start');
}
assert.equal(show('casora_entity_actions', 'on', { tap_run: true }, 'script.example'), 'Läuft');
console.log('OK: state words at the template boundary');
