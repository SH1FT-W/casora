// Run a script, scene or button with one tap (#86, #90).  node dev/unit/script_run.mjs
// Checks: casoraRunService (which service runs which entity), the tile "Entity with buttons" with "Tap runs it"
// (casora_entity_actions tap_action: the service call instead of the popup, the actions overlay still closes first),
// the confirmation (switching() sees the run past the popup config, the dialog says "Ausführen"/"Aktivieren"),
// and the Studio field (only for scripts, scenes and buttons; phrases translated).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ── casora-core: run service, switching, wording ─────────────────────────────────────
const core = read('custom_components/casora/scripts/casora-core.js');
const block = (start, end) => { const i = core.indexOf(start); assert.ok(i >= 0, start); return core.slice(i, core.indexOf(end, i) + end.length); };
const states = {
  'script.example_door': { state: 'off', attributes: { friendly_name: 'Haustür öffnen' } },
  'script.example_running': { state: 'on', attributes: { friendly_name: 'Läuft' } },
  'scene.example_evening': { state: '2026-10-01T18:00:00+00:00', attributes: { friendly_name: 'Abend' } },
  'button.example_bell': { state: 'unknown', attributes: { friendly_name: 'Gong' } },
};
const w = { addEventListener: () => {} };
const doc = { querySelector: () => ({ hass: { user: { id: 'me' }, states } }), addEventListener() {}, removeEventListener() {}, body: { appendChild() {} } };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  var hassUser', '})();\n') + block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, doc, WeakSet, class {}, (f) => f());
assert.equal(w.casoraRunService('script.example_door'), 'script.turn_on');
assert.equal(w.casoraRunService('scene.example_evening'), 'scene.turn_on');
assert.equal(w.casoraRunService('button.example_bell'), 'button.press');
assert.equal(w.casoraRunService('input_button.example'), 'input_button.press');
assert.equal(w.casoraRunService('light.example'), '', 'a light does not "run"');
assert.equal(w.casoraRunService(undefined), '');
const A = w.__casoraAskFirstParts;
const runAct = { action: 'call-service', service: 'script.turn_on', service_data: { entity_id: 'script.example_door' }, casora_popup: { content: {} }, casora_run: true };
assert.ok(A.switching({ action: 'tap', config: { tap_action: runAct } }), 'a run asks although the popup config rides along');
assert.equal(A.switching({ action: 'tap', config: { tap_action: { ...runAct, casora_run: false } } }), null, 'popup taps still never ask');
assert.deepEqual(A.word({ action: 'call-service', service: 'script.turn_on', target: { entity_id: 'script.example_door' } }, { entity: 'script.example_door' }),
  { name: 'Haustür öffnen', verb: 'Ausführen' });
assert.equal(A.word({ action: 'call-service', service: 'script.turn_on', service_data: { entity_id: 'script.example_door' } }, {}).verb, 'Ausführen', 'service_data target');
assert.equal(A.word({ action: 'toggle' }, { entity: 'script.example_door' }).verb, 'Ausführen', 'toggle of an idle script runs it');
assert.equal(A.word({ action: 'toggle' }, { entity: 'script.example_running' }).verb, 'Ausschalten', 'toggle of a running script stops it');
assert.equal(A.word({ action: 'call-service', service: 'button.press', target: { entity_id: 'button.example_bell' } }, {}).verb, 'Ausführen');
assert.equal(A.word({ action: 'call-service', service: 'scene.turn_on', target: { entity_id: 'scene.example_evening' } }, {}).verb, 'Aktivieren');
assert.equal(A.word({ action: 'call-service', service: 'script.turn_on', target: { entity_id: 'script.example_door' } }, { name: 'Haustür' }).name, 'Haustür', 'own tile name first');

// ── Template casora_entity_actions: tap ────────────────────────────────────────────
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const built = JSON.parse(read('custom_components/casora/panel/casora-templates.json'));
const tap = T.casora_entity_actions.tap_action;
assert.ok(/casoraRunService/.test(JSON.stringify((built.templates || built).casora_entity_actions.tap_action.casora_run)), 'casora-templates.json rebuilt');
const js = (s) => new Function('variables', 'entity', 'states', 'hass', 'user', String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
const evalTap = (vars, id, open) => {
  globalThis.window = { casoraRunService: w.casoraRunService, casoraPopupAction: () => 'fire-dom-event',
    _casoraActions: { isOpen: () => !!open, openKey: (x) => x } };
  const e = states[id] || { entity_id: id, state: 'on', attributes: {} };
  const ent = { entity_id: id, ...e };
  return { action: js(tap.action)(vars, ent, states, {}, null), service: js(tap.service)(vars, ent, states, {}, null),
    data: js(tap.service_data)(vars, ent, states, {}, null), run: js(tap.casora_run)(vars, ent, states, {}, null) };
};
let r = evalTap({ tap_run: true }, 'script.example_door');
assert.deepEqual(r, { action: 'call-service', service: 'script.turn_on', data: { entity_id: 'script.example_door' }, run: true }, 'Tap runs it: the script');
r = evalTap({ tap_run: true }, 'button.example_bell');
assert.equal(r.service, 'button.press');
r = evalTap({}, 'script.example_door');
assert.deepEqual(r, { action: 'fire-dom-event', service: 'casora.actions_overlay_toggle', data: { actions_entity_id: 'script.example_door' }, run: false }, 'off: the popup as before');
r = evalTap({ tap_run: true }, 'light.example');
assert.equal(r.action, 'fire-dom-event', 'a light ignores tap_run'); assert.equal(r.run, false);
r = evalTap({ tap_run: true }, 'script.example_door', true);
assert.deepEqual(r, { action: 'call-service', service: 'casora.actions_overlay_toggle', data: { actions_entity_id: 'script.example_door' }, run: false },
  'open actions overlay: the tap closes it first, runs nothing');
assert.equal(T.casora_entity_actions.hold_action.action.includes('more-info'), true, 'holding still opens the popup');

// ── Studio: the field ──────────────────────────────────────────────────────────────
const panel = read('custom_components/casora/panel/casora-panel.js');
const fieldSrc = panel.match(/\{ key: "tap_run"[\s\S]*?hint: "([^"]+)" \}/);
assert.ok(fieldSrc, 'field tap_run on "Entity with buttons"');
const RUN = new Function(panel.match(/const RUN_DOMAINS = [^\n]+/)[0] + '\nreturn RUN_DOMAINS;')();
const when = new Function('RUN_DOMAINS', 'return (' + fieldSrc[0].match(/when: (\(vars, tile\) => [^\n]+),\n/)[1] + ');')(RUN);
assert.equal(when({}, { entity: 'script.example_door' }), true);
assert.equal(when({}, { entity: 'scene.example_evening' }), true);
assert.equal(when({}, { entity: 'light.example' }), false);
assert.equal(when({}, {}), false);
assert.ok(/f\.when\(tile\.variables \|\| \{\}, tile\)\)\.forEach/.test(panel), 'tile fields get the tile in when()');
assert.ok(/script: "entity_actions"/.test(read('custom_components/casora/panel/casora-panel-b-ux.js')), 'a script becomes "Entity with buttons"');
const mehr = read('custom_components/casora/panel/casora-panel-b-mehr.js');
assert.ok(/SWITCH_DOMAINS = \[[^\]]*"script"[^\]]*"button"/.test(mehr), '"Ask before switching" offered for scripts and buttons');
for (const lang of ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ex = JSON.parse(read('custom_components/casora/translations/panel/' + lang + '.json')).exact;
  for (const k of ['Tap runs it', fieldSrc[1], 'Run it', 'A calm question before this runs. For the front door, the gate or everything off.',
    'A calm question before this runs – on the tile and in its popup. For the front door, the gate or everything off.']) assert.ok(ex[k], lang + ': ' + k);
}
for (const lang of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ex = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/' + lang + '.json')).exact;
  for (const k of ['Wirklich ausführen?', 'Wirklich aktivieren?', 'Ausführen', 'Aktivieren']) assert.ok(ex[k], lang + ': ' + k);
}
console.log('ok script_run');
