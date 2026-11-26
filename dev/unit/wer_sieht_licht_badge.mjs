// "Who sees this?" on a light tile (Prüfrunde u10-02): the child no longer saw the office's light tile, but the
// office's light badge and Home's house badge (light_rooms_auto) still showed that light, and the Studio said nothing.
// The "still sees it here" scan now covers light badges as well: the room's badge listing the lamp or its group, and
// Home's badge built from the rooms' lights; "Hide it there too" narrows casora_badge_users.lights there.
// Made-up entities and users.
//   node dev/unit/wer_sieht_licht_badge.mjs
// @deckt: custom_components/casora/panel/casora-panel-b-mehr.js#_mElseScan
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8');
const proto = {};
let ready;
const defined = new Promise((r) => { ready = r; });
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {} }) };
globalThis.customElements = { whenDefined: () => defined, get: () => ({ prototype: proto }) };
new Function(src)();
ready();
await new Promise((r) => setTimeout(r, 0));
assert.equal(typeof proto._mElseScan, 'function', '_mElseScan installed');

const users = [{ id: 'admin', name: 'Admin' }, { id: 'kid', name: 'Kind' }];
const S = {
  'light.qa_office': { state: 'on', attributes: { entity_id: ['light.qa_office_lamp'] } },
  'light.qa_office_lamp': { state: 'on', attributes: {} },
  'light.qa_kitchen': { state: 'off', attributes: {} },
};
const tile = { type: 'light', entity: 'light.qa_office', visibility: [{ condition: 'user', users: ['admin'] }] };
const mk = () => ({
  _hass: { states: S },
  _roomLabel: (r) => r.name,
  _state: { compact: { rooms: [
    { name: 'Zuhause', path: 'home', tiles: [], variables: { light_rooms_auto: true } },
    { name: 'Büro', tiles: [tile], variables: { light_group_entity: 'light.qa_office' } },
    { name: 'Küche', tiles: [], variables: { light_entity_1: 'light.qa_kitchen' } },
  ] } },
});
const p = mk();
const res = proto._mElseScan.call(p, ['light.qa_office'], ['admin'], users, { tile });
assert.ok(res.places && res.places.includes('Büro (Lights)'), 'office light badge named: ' + res.text);
assert.ok(res.places.includes('Zuhause (Lights)'), 'Home house badge named: ' + res.text);
assert.ok(!res.places.some((x) => /Küche/.test(x)), 'kitchen badge has nothing of it');
assert.match(res.text, /Kind/);
res.fixes.forEach((f) => f());
const R = p._state.compact.rooms;
assert.deepEqual(R[1].variables.casora_badge_users.lights, ['admin'], 'hide there too: office badge');
assert.deepEqual(R[0].variables.casora_badge_users.lights, ['admin'], 'hide there too: Home badge');
// A lamp inside the group: the badge with the group shows it too.
const p2 = mk();
assert.ok(proto._mElseScan.call(p2, ['light.qa_office_lamp'], ['admin'], users, null).places.includes('Büro (Lights)'), 'lamp in the badge group');
// Already hidden from the child there: nothing to say.
const p3 = mk();
p3._state.compact.rooms.forEach((r) => { r.variables.casora_badge_users = { lights: ['admin'] }; });
assert.equal(proto._mElseScan.call(p3, ['light.qa_office'], ['admin'], users, { tile }).text, '', 'badges already admin only');
console.log('ok wer_sieht_licht_badge');
