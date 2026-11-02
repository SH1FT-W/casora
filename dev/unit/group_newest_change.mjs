// Lock and cover group popups said „Zuletzt vor 6 Min.“ for HA's start: their newest change was the newest raw
// last_changed of the group. It now comes from casoraSinceMs (no HA start, the time every popup head says, issue 106).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const lines = [];
const walk = (o, name) => {
  if (typeof o === 'string') { for (const m of o.matchAll(/const newest = ids[^\n]*/g)) lines.push([name, m[0]]); return; }
  if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v, name);
};
for (const [k, v] of Object.entries(tpl)) walk(v, k);
const names = new Set(lines.map((x) => x[0]));
for (const k of ['casora_popup_lock', 'casora_popup_cover', 'casora_cover']) assert.ok(names.has(k), k + ': newest change found');

const now = Date.now(), start = now - 6 * 60000, real = now - 3 * 3600000;
const states = { 'lock.a': { last_changed: new Date(start).toISOString() }, 'lock.b': { last_changed: new Date(real).toISOString() } };
const hass = { states };
const window = { casoraSinceMs: (st) => (Date.parse(st.last_changed) === start ? null : Date.parse(st.last_changed)) };
for (const [name, line] of lines) {
  const newest = new Function('ids', 'states', 'hass', 'window', line + '\nreturn newest;')(['lock.a', 'lock.b'], states, hass, window);
  assert.equal(newest, new Date(real).toISOString(), name + ': the newest real change, not HA\'s start');
}
console.log('group_newest_change: ok');
