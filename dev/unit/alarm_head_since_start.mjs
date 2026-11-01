// Gate 02.11.2026 (r105 DP-11): the alarm / security popup head lost its status line. Issue 106 made the alarm line
// use casoraSinceMs, which says nothing for an alarm unchanged since HA's start; the head's fallback word
// („Aktiviert · Zuhause“) then repeats the wheel and is dropped (§3), leaving the head empty. Without a real change
// time the alarm line says its last_changed, as before 106, so the head always has a line.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/07-weich-spezial.js', import.meta.url), 'utf8');
const lines = [];
globalThis.window = {
  _casoraUI: { line: (t) => { lines.push(t); return '<div class="hui-line">' + t + '</div>'; } },
  casoraLocale: () => 'de-DE',
  casoraSinceMs: () => null,
  addEventListener: () => {},
};
globalThis.document = { querySelector: () => null, addEventListener: () => {}, head: { appendChild: () => {} }, createElement: () => ({ style: {} }) };
new Function(src)();
const AL = window._casoraAlarmSoft;
assert.ok(AL && typeof AL.line === 'function', 'AL.line');
const lc = new Date(Date.now() - 2 * 3600000).toISOString();
const states = { 'alarm_control_panel.haus': { entity_id: 'alarm_control_panel.haus', state: 'armed_home', last_changed: lc, attributes: {} } };
const out = AL.line('alarm_control_panel.haus', states);
assert.ok(out, 'an alarm unchanged since HA\'s start still has a head line');
assert.match(lines[lines.length - 1], /^Seit /, 'the line says since when');
// A real change time (casoraSinceMs) wins over last_changed (issue 106: one time everywhere).
const real = Date.now() - 30 * 60000;
window.casoraSinceMs = () => real;
AL.line('alarm_control_panel.haus', states);
assert.equal(lines[lines.length - 1], AL.since(real), 'casoraSinceMs is used when it has a time');
console.log('alarm_head_since_start: ok');
