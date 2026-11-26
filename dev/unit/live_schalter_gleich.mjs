// The live activity device list uses the settings' own switch (Prüfrunde d04-06).   node dev/unit/live_schalter_gleich.mjs
// Its rows had a larger iOS switch (.fswitch, 51×31) right under the normal ones (.sw, as _boolSwitch draws them).
// @deckt: casora-panel-live.js#_csFillLive
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (f) => fs.readFileSync(new URL('../../custom_components/casora/panel/' + f, import.meta.url), 'utf8');
const live = read('casora-panel-live.js');
const panel = read('casora-panel.js');
assert.ok(!/el\("button", "fswitch"\)/.test(live) && !/\.fswitch/.test(live), 'no own switch class in the live page');
assert.match(live, /const sw = el\("button", "sw"\);/, 'the settings switch');
assert.match(live, /ev\.stopPropagation\(\);/, 'the tap on the switch does not also open the row');
assert.match(panel, /_boolSwitch\(cur, boolDefault, onChange, label\) \{[\s\S]{0,200}sw\.className = "sw";/, '.sw is the settings switch');
console.log('live_schalter_gleich: ok');
