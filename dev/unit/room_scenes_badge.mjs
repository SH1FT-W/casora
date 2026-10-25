// Studio (25.10.2026): rooms get their own scenes badge on desktop and tablet. Before only Home had one (the
// dashboard-wide "Scenes"); casora_room could already draw it in any room from show_scenes + scene_entities.
// Checks: the badge section "Room scenes" (title "Scenes", bid "scenes" like the dashboard's badge order) is
// room-only and off by default, turning it on fills the scenes of the room's HA area (_areaScenes), the badge
// in the preview leads to it outside Home, and Home's scene order card no longer removes the room's card.
//   node dev/unit/room_scenes_badge.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const sec = src.slice(src.indexOf('label: "Room scenes"'), src.indexOf('label: "Room scenes"') + 700);
assert.ok(/title: "Scenes", bid: "scenes"/.test(sec) && /roomOnly: true, toggleFn: "roomScenes"/.test(sec), 'room scenes section');
assert.ok(/LIST\("scene_entities", "Scenes", \["scene"\]\)/.test(sec), 'scene list field');
assert.ok(/if \(sec\.roomOnly && onHome\) return;/.test(src), 'not on Home (Home keeps the dashboard-wide Scenes)');
assert.ok(/!\(sec\.roomOnly && onHome\)\)/.test(src), 'no dashed placeholder on Home');
assert.ok(/get: \(\) => room\.variables\.show_scenes === true,/.test(src), 'off unless show_scenes is true');
assert.ok(/V\.scene_entities = this\._areaScenes\(room\);/.test(src), 'turning on fills the area scenes');
assert.ok(src.includes(":scope > .scenesorder[data-bid=\"scenes\"]"), "Home's order card only removes itself");
assert.ok(/if \(pick\.sceneBadge && this\._state && this\._state\.compact/.test(src), 'badge pick goes to the room section outside Home');

const m = src.match(/  _areaScenes\(room\) \{[\s\S]*?\n  \}\n/);
assert.ok(m, '_areaScenes');
const areaScenes = new Function('return function ' + m[0].trim())();
const ctx = {
  _roomArea: () => 'bad',
  _hass: {
    states: { 'scene.b_zwei': { attributes: { friendly_name: 'Zwei' } }, 'scene.a_eins': { attributes: { friendly_name: 'Eins' } },
      'scene.dev': { attributes: { friendly_name: 'Gerät' } }, 'scene.kueche': { attributes: {} }, 'scene.versteckt': { attributes: {} },
      'light.bad': { attributes: {} } },
    entities: { 'scene.b_zwei': { area_id: 'bad' }, 'scene.a_eins': { area_id: 'bad' }, 'scene.dev': { device_id: 'd1' },
      'scene.kueche': { area_id: 'kueche' }, 'scene.versteckt': { area_id: 'bad', hidden: true }, 'light.bad': { area_id: 'bad' } },
    devices: { d1: { area_id: 'bad' } },
  },
};
assert.deepEqual(areaScenes.call(ctx, {}), ['scene.a_eins', 'scene.dev', 'scene.b_zwei'], 'area scenes by name, device area counts, hidden not');
assert.deepEqual(areaScenes.call({ ...ctx, _roomArea: () => null }, {}), [], 'no area: empty');
console.log('ok room_scenes_badge');
