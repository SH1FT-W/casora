// A colour lamp in colour mode: the dial's ring takes the lamp's colour (owner, 01.11.2026).   node dev/unit/light_ring_colour.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const pop = rd('custom_components/casora/scripts/local/03-popups.js');
assert.ok(/if \(o\.ringColor && !off2\) ring\.col = o\.ringColor;/.test(core), 'stage: o.ringColor colours the ring while on');
assert.ok(/var rgb = \(states\[id\]\.attributes \|\| \{\}\)\.rgb_color;/.test(pop) && /ringColor: ringColor \}\);/.test(pop), 'light popup passes the lamp colour in colour mode');
const i = pop.indexOf('var ringColor = null;');
assert.ok(i > 0 && /if \(colCur\) colOn\.some/.test(pop.slice(i, i + 200)), 'only in colour mode (colCur)');
console.log('ok light_ring_colour');
// White tones: warm, neutral and cold colour the ring by Kelvin.
assert.ok(/if \(!ringColor && cur != null\) \{/.test(pop) && /\[2200, \[232, 168, 72\]\], \[4000, \[242, 226, 196\]\], \[6500, \[200, 222, 245\]\]/.test(pop), 'white tone colours the ring by Kelvin');
console.log('ok light_ring_colour (kelvin)');
