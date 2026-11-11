// Tiles say a state like the popup head and the search (window.casoraStateWord, wortliste), never HA's raw word.
// Prod 01.11.2026: a HomePod tile said „Inaktiv“, its popup and the search „Bereit“.
//   node dev/unit/tile_state_word.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('(function () {\n  if (window._casoraStateText) return;');
const b = core.indexOf('})();', core.indexOf('window._casoraStateText = function', a)) + 5;
assert.ok(a > -1 && b > a, 'state word block found');
new Function(core.slice(a, b))();
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const run = (tpl, entity, hass, variables = {}) => {
  const src = T[tpl].state_display.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  return new Function('entity', 'states', 'hass', 'variables', 'user', src)(entity, { [entity.entity_id]: entity }, hass, variables, {});
};
// HA in German: idle → „Inaktiv“, on → „Ein“.
const HA = { idle: 'Inaktiv', on: 'Ein', off: 'Aus', paused: 'Pausiert', standby: 'Standby', ready: 'ready' };
const hass = { formatEntityState: (e) => HA[e.state] ?? e.state };
const word = (s, id) => window.casoraStateWord(hass, { entity_id: id, state: s, attributes: {} });

const mp = (s) => ({ entity_id: 'media_player.speaker', state: s, attributes: { friendly_name: 'Speaker' } });
assert.equal(run('casora_media', mp('idle'), hass), 'Inaktiv', 'media tile: idle is inactive');
for (const s of ['idle', 'paused', 'on', 'off', 'standby']) {
  assert.equal(run('casora_media', mp(s), hass), word(s, 'media_player.speaker'), 'media tile = popup word: ' + s);
}
assert.equal(run('casora_media', mp('idle'), {}), 'Inaktiv', 'without HA formatting still inactive');
// The plain tiles that showed HA's word take the same word.
const ent = (d, s) => ({ entity_id: d + '.x', state: s, attributes: {} });
assert.equal(run('casora_entity', ent('media_player', 'idle'), hass), 'Inaktiv');
assert.equal(run('casora_entity', ent('switch', 'on'), hass), 'An', 'HA\'s „Ein“ is „An“');
assert.equal(run('casora_entity', ent('select', 'ready'), hass), 'Bereit', 'raw English token');
assert.equal(run('casora_entity', { entity_id: 'sensor.t', state: '21.5', attributes: {} }, hass), '21.5', 'measurement: HA\'s text');
assert.equal(run('casora_entity_actions', ent('media_player', 'idle'), hass), 'Inaktiv');
assert.equal(run('casora_humidifier', ent('humidifier', 'on'), hass), 'An');
assert.equal(run('casora_humidifier', { ...ent('humidifier', 'on'), attributes: { action: 'idle' } }, hass), 'Inaktiv', 'humidifier idle matches popup');
assert.equal(run('casora_game', ent('media_player', 'idle'), hass), 'Inaktiv', 'game tile (esc was undefined there)');
console.log('ok tile_state_word');
