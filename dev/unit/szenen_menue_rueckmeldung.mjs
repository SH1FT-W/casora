// dashfix2 (06.10.2026): Tablet – Szene im Szenen-Menü der Raumleiste gestartet, Menü schloss sofort,
// keine Rückmeldung; die aktive Szene war nur durch etwas dickere Schrift erkennbar.
//   node dev/unit/szenen_menue_rueckmeldung.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const i = src.indexOf('    _openMenu(route, btn) {');
const blk = src.slice(i, src.indexOf('const close = () => {', i));
assert.ok(/background: it\.active \? 'var\(--casora-mnav-on-fill, transparent\)' : 'transparent'/.test(blk), 'aktive Szene hinterlegt');
assert.ok(/row\.style\.background = 'var\(--casora-mnav-on-fill, transparent\)';[\s\S]{0,80}setTimeout\(close, 350\);/.test(blk), 'getippte Szene kurz hinterlegt, dann zu');
console.log('ok szenen_menue_rueckmeldung');
