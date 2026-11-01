// Phone room page: a tile never takes the full width – also not as the only tile of a group (owner decision
// 01.11.2026; DH-24 had made the only tile fill the row in portrait).
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
assert.ok(!/:only-child\s*\{\s*grid-column\s*:\s*1\s*\/\s*-1/.test(src), 'the only tile of a group must not span the row');
assert.ok(!/casora-entity-grid[^{]*\{[^}]*grid-column\s*:\s*1\s*\/\s*-1/.test(src), 'no phone grid rule spans a tile over the row');
console.log('ok handy_kachel_nie_volle_breite');
