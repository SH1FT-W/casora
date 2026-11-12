// Idle is not ready to start; action tiles offer Start, and off appliances remain off.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
for (const [raw, word] of [['idle', 'Inaktiv'], ['inactive', 'Inaktiv'], ['ready', 'Bereit'], ['off', 'Aus'], ['finished', 'Fertig']]) {
  assert.equal(show('casora_appliance', raw), word, `appliance: ${raw}`);
}
for (const [id, state] of [['script.example', 'off'], ['scene.example', 'unknown'], ['button.example', 'unknown']]) {
  assert.equal(show('casora_entity_actions', state, { tap_run: true }, id), 'Start');
}
assert.equal(show('casora_entity_actions', 'on', { tap_run: true }, 'script.example'), 'Läuft');

// Exercise both popup render paths, including the stage expression returned by the template.
const devices = fs.readFileSync(new URL('custom_components/casora/scripts/local/02-devices.js', root), 'utf8');
const start = devices.lastIndexOf('(function () {', devices.indexOf('var DISH ='));
const end = devices.indexOf('\n})();', start) + '\n})();'.length;
const window = {};
vm.runInNewContext(devices.slice(start, end), { window });
const evaluate = (source, entity, variables, states) => new Function('entity', 'variables', 'states', 'window', 'hass',
  source.trim().slice(3, -3)).call({}, entity, variables, states, window, {});
for (const program of [false, true]) {
  for (const [raw, word] of [['idle', 'Inaktiv'], ['inactive', 'Inaktiv'], ['off', 'Aus'], ['ready', 'Bereit'], ['finished', 'Fertig']]) {
    const entity = { entity_id: 'sensor.example', state: raw, attributes: {} };
    const states = { [entity.entity_id]: entity };
    const variables = program ? { entity_program: 'select.program' } : {};
    const context = `${raw}, program=${program}`;
    assert.equal(show('casora_appliance', raw, variables), word, `tile: ${context}`);
    for (const soft of [false, true]) {
      window._casoraUI = { tokens: {}, soft: () => soft, stage: (_kind, options) => options.value,
        hero: options => options.value, group: () => '' };
      const popup = evaluate(T.casora_appliance.tap_action.casora_popup.content, entity, variables, states);
      const value = soft ? evaluate(popup.custom_fields.stage, entity, variables, states)
        : popup.cards[0].custom_fields.hero;
      assert.equal(value, word, `popup soft=${soft}: ${context}`);
    }
  }
}
console.log('OK: state words at the template boundary');
