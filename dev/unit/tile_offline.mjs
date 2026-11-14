// Offline tiles (V2, 14.11.2026): a device that is unavailable looked exactly like „Aus“ (camera „Offline“ grey like
// Apple TV „Aus“). casora_entity's second state casora_offline gives every tile the warning colour, a dashed rim and
// „Offline · seit …“ (last_changed, the relative time of casora-ago) and hides the switch. unknown only counts for
// device domains; a scene, a button or a sensor without a value yet is no lost device. Composite tiles opt out.
//   node dev/unit/tile_offline.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraTileOffline,casoraSinceWord,casoraOfflineHtml,casora-ago
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const block = (name) => { const a = core.indexOf('// ' + name + ':start'), b = core.indexOf('// ' + name + ':end'); assert.ok(a > 0 && b > a, name); return core.slice(a, b); };
window.casoraAgoMin = (ms) => (ms >= 60000 ? Math.round(ms / 60000) : 0);
window.casoraCamOffline = (id, states, vars) => !!(vars && vars.status_entity && ['unavailable', 'unknown', 'off'].includes(states[vars.status_entity]?.state));
window.casoraCamStatusOf = (id, vars) => (vars && vars.status_entity) || null;
new Function(block('casora-offline'))();

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const ent = (entity_id, state, min = 120) => ({ entity_id, state, attributes: {}, last_changed: ago(min) });

// Which states count.
const off = (e, states = {}, vars = {}) => window.casoraTileOffline(e, Object.assign({ [e.entity_id]: e }, states), vars);
for (const id of ['light.desk', 'switch.plug', 'media_player.tv', 'camera.door', 'sensor.washer_power', 'binary_sensor.window', 'scene.evening'])
  assert.ok(off(ent(id, 'unavailable')), id + ' unavailable is offline');
for (const id of ['light.desk', 'cover.blinds', 'climate.living', 'lock.front', 'vacuum.robot', 'media_player.tv'])
  assert.ok(off(ent(id, 'unknown')), id + ' unknown is offline');
for (const id of ['scene.evening', 'button.restart', 'input_button.go', 'sensor.next_pickup', 'binary_sensor.rain', 'event.doorbell'])
  assert.equal(off(ent(id, 'unknown')), null, id + ' unknown is no lost device');
for (const [id, s] of [['light.desk', 'off'], ['light.desk', 'on'], ['media_player.tv', 'standby'], ['camera.door', 'idle']])
  assert.equal(off(ent(id, s)), null, `${id} ${s} is not offline`);
assert.equal(off(ent('sensor.casora_rezept_der_woche', 'unavailable')), null, 'Casora\'s own entities never count');
assert.equal(window.casoraTileOffline(null, {}, {}), null, 'no entity');
// Camera behind a proxy: its status entity says offline, the camera itself is idle; since = the status entity's change.
const st = ent('binary_sensor.door_cam_online', 'off', 30);
const cam = off(ent('camera.door', 'idle', 600), { 'binary_sensor.door_cam_online': st }, { status_entity: st.entity_id });
assert.ok(cam, 'camera with offline status entity');
assert.equal(cam.since, Date.parse(st.last_changed), 'camera: since = status entity');
const lamp = ent('light.desk', 'unavailable', 120);
assert.equal(off(lamp).since, Date.parse(lamp.last_changed), 'since = last_changed');

// Words.
const W = window.casoraSinceWord;
assert.equal(W(Date.now() - 20 * 1000), 'gerade eben');
assert.equal(W(Date.now() - 5 * 60000), 'seit 5 Min.');
assert.equal(W(Date.now() - 125 * 60000), 'seit 2 Std.');
assert.equal(W(Date.now() - 26 * 3600000), 'seit 1 Tag');
assert.equal(W(Date.now() - 50 * 3600000), 'seit 2 Tagen');
const html = window.casoraOfflineHtml({ since: Date.now() - 125 * 60000 });
assert.match(html, /<casora-ago data-since="\d+" data-pre="Offline ·" data-form="since">Offline · seit 2 Std\.<\/casora-ago>/, html);
assert.match(html, /class="sf-s"[^>]*>.*>Offline</, 'narrow tile: only „Offline“');
assert.equal(window.casoraOfflineHtml({ since: null }), 'Offline', 'unknown since (HA start): only „Offline“');

// casora-ago ticks the since form.
const tick = core.slice(core.indexOf("customElements.define('casora-ago'"), core.indexOf("customElements.define('casora-ago'") + 1400);
assert.ok(/dataset\.form === 'since'[^\n]*casoraSinceWord/.test(tick), 'casora-ago keeps „seit …“ current');

// The template: state right after „Gerät fehlt“, warning colour, dashed rim, no switch, opt-out honoured.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const S = T.casora_entity.state;
assert.deepEqual(S.slice(0, 2).map((x) => x.id), ['casora_missing', 'casora_offline'], 'offline is the second state');
const O = S[1];
const run = (code, entity, variables) => new Function('entity', 'states', 'variables', String(code).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(entity, entity ? { [entity.entity_id]: entity } : {}, variables);
assert.equal(run(O.value, ent('light.desk', 'unavailable'), T.casora_entity.variables), true, 'state matches an unavailable light');
assert.equal(run(O.value, ent('light.desk', 'off'), T.casora_entity.variables), false, 'not an „Aus“ light');
assert.equal(run(O.value, ent('light.desk', 'unavailable'), { show_offline: false }), false, 'opt-out');
assert.match(run(O.state_display, ent('light.desk', 'unavailable'), {}), /Offline · seit 2 Std\./);
const css = JSON.stringify(O.styles);
assert.ok(/"outline":"1\.5px dashed [^"]*--casora-security-warn-color/.test(css), 'dashed rim in the warning colour');
assert.ok(/"color":"var\(--casora-entity-offline-color, var\(--casora-popup-ui-warn/.test(css), 'state in the warning text colour');
assert.ok(/"--casora-active-overlay-opacity":"0"/.test(css), 'never the active look');
for (const f of ['toggle', 'ctl_up', 'ctl_set', 'ctl_down']) assert.deepEqual(O.styles.custom_fields[f], [{ display: 'none' }], 'no ' + f);
// Tiles that stand for several things (rooms, scenes, update list, cameras, Pulse, free tile) keep their own words.
for (const k of ['casora_more', 'casora_scenes', 'casora_updates', 'casora_entity_list', 'casora_cameras', 'casora_pulse', 'casora_free'])
  assert.equal(T[k].variables.show_offline, false, k + ' opts out');
console.log('tile_offline: ok');
