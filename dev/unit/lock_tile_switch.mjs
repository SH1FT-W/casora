// T01 (26.10.70): the switch on a lock tile unlocked a door without asking, and a tile over several locks
// switched only its first lock while its state line showed the group ("1 entriegelt", switch off).
// Now: the switch acts on every lock of the tile, unlocking (and lock.open) always asks, jammed shows.
//   node dev/unit/lock_tile_switch.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const L = tpl.casora_lock;
const body = (t) => t.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (t, ctx) => new Function('states', 'entity', 'variables', 'hass', 'window', body(t))(ctx.states, ctx.entity, ctx.variables, {}, {});

const ctx = (lockStates, extra) => {
  const states = {};
  for (const [id, s] of Object.entries(lockStates)) states[id] = { entity_id: id, state: s, attributes: { friendly_name: id.split('.')[1] } };
  const ids = Object.keys(lockStates);
  const variables = { show_toggle: true, locks: ids.length > 1 ? ids : undefined, ...(extra || {}) };
  const c = { states, entity: states[ids[0]], variables };
  variables.lock_state = run(L.variables.lock_state, c);
  return c;
};
const svc = (c) => run(L.icon_tap_action.service, c);
const data = (c) => run(L.icon_tap_action.service_data, c);

// Single lock: unlock / lock, jammed and open lock again.
{
  const c = ctx({ 'lock.a': 'locked' });
  assert.equal(svc(c), 'lock.unlock');
  assert.deepEqual(data(c), { entity_id: 'lock.a' });
  assert.equal(svc(ctx({ 'lock.a': 'unlocked' })), 'lock.lock');
  assert.equal(svc(ctx({ 'lock.a': 'jammed' })), 'lock.lock', 'jammed: lock');
  assert.equal(svc(ctx({ 'lock.a': 'unavailable' })), 'none');
}
// Group: the case from the report – first lock locked, another one unlocked → lock the open ones, not unlock the first.
{
  const c = ctx({ 'lock.a': 'locked', 'lock.b': 'unlocked', 'lock.c': 'locked', 'lock.d': 'unavailable' });
  assert.equal(c.variables.lock_state, 'unlocked');
  assert.equal(svc(c), 'lock.lock', 'group with one open lock: lock');
  assert.deepEqual(data(c), { entity_id: ['lock.b'] }, 'only the open lock, nothing unavailable');
}
{
  const c = ctx({ 'lock.a': 'locked', 'lock.b': 'locked', 'lock.c': 'locked' });
  assert.equal(svc(c), 'lock.unlock', 'all locked: unlock all');
  assert.deepEqual(data(c), { entity_id: ['lock.a', 'lock.b', 'lock.c'] });
}
{
  const c = ctx({ 'lock.a': 'locked', 'lock.b': 'jammed', 'lock.c': 'unlocked' });
  assert.equal(c.variables.lock_state, 'jammed');
  assert.equal(svc(c), 'lock.lock');
  assert.deepEqual(data(c), { entity_id: ['lock.b', 'lock.c'] });
  const fit = { casoraStateFit: (t) => t };
  const shown = new Function('states', 'entity', 'variables', 'hass', 'window', body(L.state_display))(c.states, c.entity, c.variables, {}, fit);
  assert.equal(shown, 'Klemmt', 'jammed outranks "1 entriegelt"');
}
// The switch itself is a nested card with its own tap_action (casora_entity): it must run the same action.
const ta = L.custom_fields.toggle.card.tap_action;
assert.equal(ta.service, L.icon_tap_action.service, 'switch card: same service as the icon');
assert.equal(ta.service_data, L.icon_tap_action.service_data, 'switch card: same targets');
// The switch drawing follows the group state, not the first lock.
const sw = tpl.casora_entity.custom_fields.toggle.card.custom_fields.svg;
assert.ok(sw.includes('(!variables.toggle_entity && variables.lock_state) || states[toggleTarget]?.state'), 'switch follows lock_state');

// casora-core: hass-action for lock.unlock asks without "Ask before switching"; lock.lock does not.
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const block = (start, end) => { const i = core.indexOf(start); assert.ok(i >= 0, start); return core.slice(i, core.indexOf(end, i) + end.length); };
const shown = [];
let host = null, listener = null;
const states = { 'lock.a': { state: 'locked', attributes: { friendly_name: 'Front door' } },
  'lock.b': { state: 'locked', attributes: { friendly_name: 'Garage' } }, 'lock.c': { state: 'locked', attributes: { friendly_name: 'Shed' } } };
const doc = {
  querySelector: () => ({ hass: { states } }),
  addEventListener() {}, removeEventListener() {},
  body: { appendChild: (h) => { host = h; } },
  createElement: () => {
    const parts = {};
    return { classList: { add() {} }, addEventListener() {}, remove() { host = null; },
      attachShadow: () => ({ set innerHTML(v) {}, querySelector: (s) => (parts[s] = parts[s] || { focus() {}, remove() {}, style: {}, set textContent(v) { shown.push(s + '=' + v); } }) }),
      parts };
  },
};
const w = { addEventListener: (t, f) => { if (t === 'hass-action') listener = f; }, casoraHaptic() {} };
class CE { constructor(t, o) { this.type = t; this.detail = o.detail; } }
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, doc, WeakSet, CE, () => {});
assert.ok(listener, 'hass-action listener');
const fire = (act, name) => {
  shown.length = 0; host = null;
  const sent = [];
  let stopped = false;
  const tile = { _config: { entity: 'lock.a', name, variables: {} }, dispatchEvent: (e) => sent.push(e) };
  listener({ detail: { action: 'tap', config: { entity: 'lock.a', name, tap_action: act } }, composedPath: () => [tile], stopImmediatePropagation() { stopped = true; } });
  return { stopped, asked: shown.slice(), sent, yes: () => host && host.parts['.yes'].onclick() };
};
{
  const r = fire({ action: 'call-service', service: 'lock.unlock', service_data: { entity_id: 'lock.a' } }, 'Front door');
  assert.ok(r.stopped, 'unlock is held back');
  assert.ok(r.asked.includes('h2=Front door') && r.asked.includes('p=Wirklich entriegeln?') && r.asked.includes('.yes=Entriegeln'), String(r.asked));
  r.yes(); await new Promise((f) => setImmediate(f));
  assert.equal(r.sent.length, 1, 'confirmed: action sent on');
}
{
  const r = fire({ action: 'call-service', service: 'lock.lock', service_data: { entity_id: 'lock.a' } });
  assert.ok(!r.stopped && !r.asked.length, 'locking does not ask');
}
{
  const r = fire({ action: 'call-service', service: 'lock.open', service_data: { entity_id: 'lock.a' } });
  assert.ok(r.stopped && r.asked.includes('.yes=Tür öffnen'), 'lock.open asks: ' + r.asked);
}
{
  const r = fire({ action: 'call-service', service: 'lock.unlock', service_data: { entity_id: ['lock.a', 'lock.b', 'lock.c'] } }, 'Locks');
  assert.ok(r.asked.includes('h2=3 Schlösser entriegeln?'), 'group names the count: ' + r.asked);
  assert.ok(r.asked.includes('p=Front door, Garage, Shed – Wirklich entriegeln?'), 'and the locks: ' + r.asked);
}
console.log('ok lock_tile_switch');
