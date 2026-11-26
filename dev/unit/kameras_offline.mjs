// Test round 26.11.2026 (d02-02): on the phone the derived tile „Kameras“ showed an unreachable camera grey „Offline“
// like a switched-off device, beside the single camera's tile in the offline look (warning colour, dashed rim). The
// cameras tile opted out of the offline state (show_offline: false). Now a tile over several devices
// (variables.offline_members) takes the offline look when all of them are offline.
//   node dev/unit/kameras_offline.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraTileOfflineMembers,casoraTileOffline dashboards/casora/button_card_templates.json#casora_entity,casora_cameras
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('// casora-offline:start'), b = core.indexOf('// casora-offline:end');
new Function(core.slice(a, b))();
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const st = T.casora_entity.state.find((x) => x.id === 'casora_offline');
const run = (src, entity, states, variables, hass = {}) => new Function('entity', 'states', 'variables', 'hass', body(src))(entity, states, variables, hass);

const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const cam = (id, state, min = 90) => ({ entity_id: id, state, attributes: {}, last_changed: ago(min) });
const S = {
  'camera.example_living': cam('camera.example_living', 'unavailable', 90),
  'camera.example_garden': cam('camera.example_garden', 'unavailable', 30),
  'camera.example_door': cam('camera.example_door', 'idle'),
};
// The cameras tile's own list (its variable), evaluated like button-card does.
const V = T.casora_cameras.variables;
const membersOf = (cameras) => run(V.offline_members, S[cameras[0]], S, { cameras });
assert.equal(V.show_offline, false, 'the tile\'s own entity still does not decide');

// The reported case: one camera, unreachable – the offline look and „Offline · seit …“.
{
  const vars = { show_offline: false, offline_members: membersOf(['camera.example_living']) };
  assert.equal(run(st.value, S['camera.example_living'], S, vars), true, 'all (one) offline: offline state');
  assert.match(run(st.state_display, S['camera.example_living'], S, vars), /Offline · seit 2 Std\./);
}
// Several cameras, all unreachable: „Alle offline“ in the offline look; one of them reachable: no offline look.
{
  const vars = { show_offline: false, offline_members: membersOf(['camera.example_living', 'camera.example_garden']) };
  assert.equal(run(st.value, S['camera.example_living'], S, vars), true);
  assert.equal(run(st.state_display, S['camera.example_living'], S, vars), 'Alle offline');
  const some = { show_offline: false, offline_members: membersOf(['camera.example_living', 'camera.example_door']) };
  assert.equal(run(st.value, S['camera.example_living'], S, some), false, 'one reachable: the tile says „1 offline“ itself');
  assert.equal(run(st.value, null, S, { show_offline: false, offline_members: [] }), false, 'no cameras: not offline');
}
// Test round 26.11.2026 (u06-08, decision „Offline überall gleich: orange Warnung, auch für die Kameras-Gruppe“): with
// some cameras offline the tile's own „1 offline“ is in the offline look's warning colour, not grey.
{
  globalThis.casoraStateFit = (t) => t;
  const sd = (cameras) => run(T.casora_cameras.state_display, S[cameras[0]], S, { cameras });
  const one = sd(['camera.example_living', 'camera.example_door']);
  assert.match(one, /^<span style="color:var\(--casora-entity-offline-color, var\(--casora-popup-ui-warn/, 'warning colour');
  assert.match(one, />1 offline<\/span>$/);
  assert.equal(st.styles.state[0].color.split(' !important')[0], 'var(--casora-entity-offline-color, var(--casora-popup-ui-warn, var(--casora-color-orange-deep, #B96A33)))', 'same colour as the offline look');
  assert.ok(!/<span/.test(sd(['camera.example_door'])), 'all reachable: no warning');
  delete globalThis.casoraStateFit;
}
// Other tiles keep their rule.
assert.equal(run(st.value, S['camera.example_living'], S, { show_offline: false }), false);
assert.equal(run(st.value, S['camera.example_living'], S, {}), true);
console.log('ok cameras tile: offline look when every camera is offline');
