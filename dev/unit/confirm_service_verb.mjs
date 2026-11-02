// Issue #108: the confirm button of a popup action names what the service does, not a guess from the
// entity's state ("Einschalten" for a restart, "Ausschalten" for installing updates in state on).
//   node dev/unit/confirm_service_verb.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const block = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };
const shown = [];
let host = null;
const states = {
  'update.core': { state: 'on', attributes: { friendly_name: 'Core Update' } },
  'update.app': { state: 'on', attributes: { friendly_name: 'App Update' } },
  'alarm_control_panel.house': { state: 'triggered', attributes: { friendly_name: 'Alarm' } },
  'alarm_control_panel.quiet': { state: 'armed_away', attributes: { friendly_name: 'Alarm' } },
  'todo.shopping': { state: '3', attributes: { friendly_name: 'Shopping' } },
  'climate.house': { state: 'off', attributes: { friendly_name: 'House' } },
};
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
const w = { addEventListener() {}, casoraHaptic() {} };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout', 'setInterval', 'clearInterval',
  block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, doc, WeakSet, class {}, () => {}, () => 0, () => {});
w.__casoraConfirmIds = [];
const ask = async (spec) => {
  shown.length = 0; host = null;
  const p = w.casoraConfirmSpec(spec);
  assert.ok(host, 'asks: ' + JSON.stringify(spec));
  host.parts['.no'].onclick();
  await p;
  return shown.slice();
};
const yes = (r) => (r.find((x) => x.startsWith('.yes=')) || '').slice(5);

// Updates popup stage (08-weich-kompakt.js): restart after an update, and "Alle aktualisieren".
{
  const r = await ask({ domain: 'homeassistant', service: 'restart', data: {}, confirm: 'Home Assistant jetzt neu starten?' });
  assert.equal(yes(r), 'Neu starten', 'restart: ' + r);
  assert.ok(r.includes('p=Home Assistant jetzt neu starten?'), 'own question kept: ' + r);
}
{
  const r = await ask({ domain: 'update', service: 'install', target: { entity_id: ['update.core', 'update.app'] }, data: {}, confirm: 'Alle 2 Updates jetzt installieren?' });
  assert.equal(yes(r), 'Installieren', 'install all: ' + r);
}
// Alarm stage (07-weich-spezial.js, danger → confirm): disarming is not "Einschalten".
{
  const r = await ask({ domain: 'alarm_control_panel', service: 'alarm_disarm', target: { entity_id: 'alarm_control_panel.house' }, confirm: 'Alarm beenden?' });
  assert.equal(yes(r), 'Alarm beenden', 'disarm triggered: ' + r);
  const r2 = await ask({ domain: 'alarm_control_panel', service: 'alarm_disarm', target: { entity_id: 'alarm_control_panel.quiet' }, confirm: true });
  assert.equal(yes(r2), 'Unscharf schalten', 'disarm armed: ' + r2);
}
// Shopping list: deleting done items (36-shopping.js clearSvc), the todo state is a count.
{
  const r = await ask({ domain: 'todo', service: 'remove_completed_items', target: { entity_id: 'todo.shopping' }, confirm: 'Erledigte löschen?' });
  assert.equal(yes(r), 'Löschen', 'remove completed: ' + r);
}
// A service without entity and without a known verb: neutral, never "Einschalten".
{
  const r = await ask({ domain: 'notify', service: 'send_message', data: {}, confirm: 'Senden?' });
  assert.equal(yes(r), 'Bestätigen', 'unknown service: ' + r);
}
// Unchanged: switching the whole house's heating on (03-popups.js quick modes) still says "Einschalten".
{
  const r = await ask({ domain: 'climate', service: 'set_hvac_mode', target: { entity_id: 'climate.house' }, data: { hvac_mode: 'heat' }, confirm: 'Einschalten' });
  assert.equal(yes(r), 'Einschalten', 'hvac on: ' + r);
}
console.log('confirm_service_verb: ok');
