// Detail round 01.11.2026 #2: the phone's room chip „Beleuchtung · 3 An“ in the bathroom counted the whole house (the
// house-wide light_rooms_auto came along in the room's variables). A room with lamps of its own counts those.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const row = tpl.casora_mobile_sensor_chips.custom_fields.rooms_row;
const find = (o) => { if (!o || typeof o !== 'object') return null;
  if ([].concat(o.template || []).includes('casora_badge_light_group') && /casora_rv/.test(String((o.variables || {}).light_rooms_auto))) return o;
  for (const v of Object.values(o)) { const r = find(v); if (r) return r; } return null; };
const chip = find(row);
assert.ok(chip, 'light chip in the room row');
const expr = chip.variables.light_rooms_auto.replace(/^\[\[\[|\]\]\]$/g, '');
const run = (rv) => new Function('variables', expr)({ casora_rv: rv });
assert.equal(run({ light_rooms_auto: true, light_entity_1: 'light.bad' }), false, 'room with its own lamp: only those');
assert.equal(run({ light_rooms_auto: true, light_group_entity: 'light.bad_gruppe' }), false, 'room with its own group: only that');
assert.equal(run({ light_rooms_auto: true }), true, 'no lamps of its own: the house list (as before)');
assert.equal(run({}), false, 'off without the setting');
console.log('room_chip_lights: ok');
