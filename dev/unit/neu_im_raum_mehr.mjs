// „Neu in <Raum>“ zeigt alle Geräte ohne Kachel (Nutzertest 4, P 5a).  node dev/unit/neu_im_raum_mehr.mjs
// Vorher nur die vom Assistenten erkannten (im Test 5) – eine neue Stehlampe fehlte. Jetzt: erkannte
// zuerst, dann nach Art (Licht vor Tasten); die ersten 6 sofort, der Rest hinter „+N weitere“.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const win = {};
new Function('window', fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-ux.js', import.meta.url), 'utf8'))(win);
const { newInRoom } = win.__casoraStudioUx;
assert.equal(typeof newInRoom, 'function');
const d = (entity, type, o) => ({ entity, type, fresh: true, roomIndex: 2, suggested: false, loose: false, ...(o || {}) });
const all = [
  d('button.a', 'entity_actions'), d('switch.b', 'casora_switch'), d('remote.c', 'entity_actions'),
  d('cover.j', 'cover', { suggested: 'cover' }), d('fan.p', 'fan', { suggested: 'fan' }),
  d('light.testlampe', 'light'), d('button.x', 'entity_actions'), d('button.y', 'entity_actions'),
  d('light.testlampe_alt', 'light', { fresh: false }), d('light.testraum_decke', 'light', { roomIndex: 1 }),
];
const r = newInRoom(all, 2, 6);
assert.deepEqual(r.shown.map((c) => c.entity), ['cover.j', 'fan.p', 'light.testlampe', 'switch.b', 'button.a', 'remote.c']);
assert.deepEqual(r.rest.map((c) => c.entity), ['button.x', 'button.y'], 'Rest aufklappbar');
// Mehr erkannte als die Grenze: alle erkannten stehen sofort da
const many = Array.from({ length: 9 }, (_, i) => d('light.l' + i, 'light', { suggested: 'light' }));
assert.equal(newInRoom(many.concat([d('button.z', 'entity_actions')]), 2, 6).shown.length, 9);
assert.deepEqual(newInRoom([], 2, 6), { shown: [], rest: [] });
console.log('ok neu_im_raum_mehr');
