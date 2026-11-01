// A colour lamp in colour mode: the dial's ring takes the lamp's colour; a white tone colours it by Kelvin
// (owner, 01.11.2026). Lamps in different colours blend: dev/unit/light_mixed_room.mjs.   node dev/unit/light_ring_colour.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const pop = rd('custom_components/casora/scripts/local/03-popups.js');
assert.ok(/if \(o\.ringColor && !off\) ring\.col = o\.ringColor;/.test(core), 'stage: o.ringColor colours the ring while on');
assert.ok(/rgb = rc;/.test(pop) && /ringColor: ringColor, ringColors: ringColors \}\);/.test(pop), 'light popup passes the lamp colour in colour mode');
console.log('ok light_ring_colour');
// White tones: warm, neutral and cold colour the ring by Kelvin.
assert.ok(/k = Number\(a\.color_temp_kelvin\); rgb = S\.kColor\(k\);/.test(pop) && /\[2200, \[232, 168, 72\]\], \[4000, \[242, 226, 196\]\], \[6500, \[200, 222, 245\]\]/.test(pop), 'white tone colours the ring by Kelvin');
console.log('ok light_ring_colour (kelvin)');
