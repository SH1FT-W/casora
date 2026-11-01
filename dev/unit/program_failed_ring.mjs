// Detail round #35: a failed programme (3D printer „Fehlgeschlagen“) stood in a grey, empty ring – S4 with o.tone
// 'bad'/'warn' fills the ring in the traffic-light colour; the printer passes 'bad' for failed or a reported error.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const s4 = core.slice(core.indexOf("    } else if (code === 'S4') {"), core.indexOf("    } else if (code === 'S6') {"));
assert.ok(/if \(\(o\.tone === 'bad' \|\| o\.tone === 'warn'\) && TONE\[o\.tone\]\) \{ ring\.pct = 100; ring\.col = TONE\[o\.tone\]; \}/.test(s4), 'S4: tone fills the ring');
const dev = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-devices.js', import.meta.url), 'utf8');
assert.ok(dev.includes("tone: errOn || raw === 'failed' ? 'bad' : null,"), 'printer: failed → bad (offline stays grey)');
console.log('program_failed_ring: ok');
