// Owner 05.11.2026 (Pulse popup, house, v3 segment ring S7): „Der Ring hat gar nicht dieses Leuchten wie die anderen
// Karten.“ Only the short problem segments glowed, the big green arc had none. Every lit segment glows in its own colour
// like the other wheels (light, climate …); a segment that is off stays dark.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const a = core.indexOf('  function dialSvg(ring) {');
const b = core.indexOf('    if (ring.temp) {', a);
assert.ok(a > 0 && b > a, 'dialSvg in casora-core.js');
const dialSvg = new Function('DIAL', 'dPt', 'dArc', 'TONE', 'esc', 'dRound',
  'var dialSeq = 0;\n' + core.slice(a, b) + '\nreturn "";\n}\nreturn dialSvg;')(
  { a0: 135, span: 270, r: 169 }, () => [0, 0], (x, y) => 'M' + x + ' ' + y, { good: 'G', bad: 'R', warn: 'O', off: 'X' },
  (s) => String(s), (x) => x);
const glows = (svg) => (svg.match(/<path [^>]*filter="url\(#hui-dlg[^"]*\)"[^>]*style="stroke:([^"]+)"/g) || [])
  .map((p) => p.match(/stroke:([^"]+)"/)[1]);
const svg = dialSvg({ kind: 'segs', segs: [{ ok: false, tone: 'bad', w: 1 }, { ok: false, tone: 'warn', w: 1 }, { ok: true, w: 30 }, { ok: false, tone: 'off', w: 2 }] });
const g = glows(svg);
assert.ok(g.includes('G'), 'the big green arc glows too: ' + JSON.stringify(g));
assert.ok(g.includes('R') && g.includes('O'), 'problem segments keep their glow: ' + JSON.stringify(g));
assert.ok(!g.includes('X'), 'a segment that is off stays without glow');
console.log('dial_segs_glow: ok');
