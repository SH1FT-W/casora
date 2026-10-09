// Rückfrage am Handy (1.2.1).  node dev/unit/rueckfrage_handy.mjs
// „Vor dem Schalten fragen“ stand an der Schloss-Kachel, am Handy entriegelte die Schloss-Ansicht
// trotzdem sofort: Die Liste der Rückfrage-Entitäten (casora_confirm_entities) schreibt das Studio
// nur in die Räume des Desktop-Dashboards. Jetzt zählen auch die Kacheln mit confirm_toggle im
// offenen Dashboard und in seinem Partner (Desktop ↔ „-mobile“), ohne neu zu speichern.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const block = (start, end) => { const i = core.indexOf(start); assert.ok(i >= 0, start); return core.slice(i, core.indexOf(end, i) + end.length); };

const states = {
  'lock.test_haustuer': { state: 'locked', attributes: { friendly_name: 'Testschloss' } },
  'cover.test_garage': { state: 'closed', attributes: { friendly_name: 'Testtor', current_position: 0 } },
  'switch.test_pumpe': { state: 'off', attributes: { friendly_name: 'Testpumpe' } },
  'light.test_decke': { state: 'off', attributes: { friendly_name: 'Testdecke' } },
};
const tile = (template, entity, ask, extra) => ({ type: 'custom:button-card', template, entity, ...(extra || {}),
  variables: { ...(ask ? { confirm_toggle: true } : {}), ...((extra || {}).variables || {}) } });
// Handy: Schloss mit Rückfrage in einer Raumreihe, Licht ohne; Kopf ohne casora_confirm_entities.
const mobile = { views: [{ cards: [{ template: 'casora_mobile_shell' }, { type: 'custom:casora-smart-row', cards: [
  { template: 'casora_mobile_room_header', name: 'Flur', variables: { show_security: true } },
  { type: 'custom:casora-smart-row', cards: [
    tile(['casora_lock', 'casora_popup_lock'], 'lock.test_haustuer', true, { name: 'Haustür' }),
    tile('casora_light', 'light.test_decke', false),
    { type: 'conditional', conditions: [], card: tile('casora_switch', 'switch.test_pumpe', true) },
  ] },
] }] }], button_card_templates: { casora_x: { variables: { confirm_toggle: true } } } };
// Desktop-Partner: Garagentor nur dort mit Rückfrage.
const desktop = { views: [{ cards: [{ template: 'casora_room', variables: { show_security: true } }, {},
  { type: 'custom:casora-smart-row', cards: [tile('casora_cover', 'cover.test_garage', true, { name: 'Garage' })] }] }] };

const shown = [];
let host = null, calls = [];
const hass = { states, callWS: (m) => { calls.push(m.url_path); return m.url_path === 'test-zuhause' ? Promise.resolve(desktop) : Promise.reject(new Error('nf')); } };
const doc = {
  querySelector: () => ({ hass }),
  addEventListener() {}, removeEventListener() {},
  body: { appendChild: (h) => { host = h; } },
  createElement: () => {
    const parts = {};
    return { classList: { add() {} }, addEventListener() {}, remove() { host = null; },
      attachShadow: () => ({ set innerHTML(v) {}, querySelector: (s) => (parts[s] = parts[s] || { focus() {}, remove() {}, style: {}, set textContent(v) { shown.push(s + '=' + v); } }) }),
      parts };
  },
};
let cfg = mobile;
const w = { addEventListener() {}, location: { pathname: '/test-zuhause-mobile/home' }, _casoraLovelaceCfg: () => cfg };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  var hassUser', '})();\n') + block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, doc, WeakSet, class {}, () => {});

// Handy-Kopf setzt die Raumliste zurück (kein casora_confirm_entities) – das Dashboard zählt trotzdem.
w.casoraEntityUsersFrom({ show_security: true });
assert.deepEqual(w.__casoraConfirmIds, []);
assert.equal(w.casoraAsksFirst('lock.test_haustuer'), true, 'Schloss-Kachel am Handy');
assert.equal(w.casoraAsksFirst('switch.test_pumpe'), true, 'Kachel in conditional');
assert.equal(w.casoraAsksFirst('light.test_decke'), false, 'ohne Rückfrage');
assert.equal(w.casoraAsksFirst('casora_x'), false, 'Vorlagen zählen nicht');
assert.deepEqual(calls, ['test-zuhause'], 'Partner (Desktop) geholt');

const tap = async (spec, yes) => {
  shown.length = 0; host = null;
  const p = w.casoraConfirmSpec(spec);
  for (let i = 0; i < 5 && !host; i++) await Promise.resolve();
  if (host) host.parts[yes ? '.yes' : '.no'].onclick();
  return { ok: await p, asked: shown.slice() };
};
{
  // Schloss-Ansicht „Entriegeln“ (13-schloss.js: casoraConfirmSpec) – erster Tipp wartet auf den Partner.
  const r = await tap({ domain: 'lock', service: 'unlock', target: { entity_id: 'lock.test_haustuer' } }, false);
  assert.equal(r.ok, false, 'Abbrechen → nicht entriegeln');
  assert.ok(r.asked.includes('h2=Haustür') && r.asked.includes('.yes=Aufschließen'), 'fragt mit Kachelnamen: ' + r.asked);
}
assert.equal(w.casoraAsksFirst('cover.test_garage'), true, 'Rückfrage vom Desktop gilt auch am Handy');
{
  // Positions-Regler im Tor-Popup am Handy (Einstellung nur am Desktop).
  const r = await tap({ domain: 'cover', service: 'set_cover_position', target: { entity_id: 'cover.test_garage' }, data: { position: 100 } }, true);
  assert.equal(r.ok, true);
  assert.ok(r.asked.includes('h2=Garage') && r.asked.includes('.yes=Öffnen'), 'Regler fragt: ' + r.asked);
}
{
  const r = await tap({ domain: 'light', service: 'turn_on', target: { entity_id: 'light.test_decke' } }, false);
  assert.ok(r.ok && !r.asked.length, 'Licht ohne Rückfrage schaltet direkt');
}
{
  // Popup-Schalter (casoraConfirmSwitch) am Handy.
  shown.length = 0; host = null;
  const p = w.casoraConfirmSwitch('switch.test_pumpe', 'switch.toggle');
  assert.ok(host, 'Dialog sofort (Partner schon da)');
  host.parts['.no'].onclick();
  assert.equal(await p, false);
}
// Rückfrage im Studio abgeschaltet und gespeichert: neue Konfiguration, Schloss fragt nicht mehr.
cfg = JSON.parse(JSON.stringify(mobile));
delete cfg.views[0].cards[1].cards[1].cards[0].variables.confirm_toggle;
assert.equal(w.casoraAsksFirst('lock.test_haustuer'), false, 'abgeschaltet');
// Kein Casora-Dashboard offen (Studio): nur die Raumvariablen wie bisher.
cfg = null;
assert.equal(w.casoraAsksFirst('switch.test_pumpe'), false);
w.casoraEntityUsersFrom({ show_security: true, casora_confirm_entities: ['switch.test_pumpe'] });
assert.equal(w.casoraAsksFirst('switch.test_pumpe'), true, 'Studio-Vorschau/Desktop-Raumliste');
console.log('rueckfrage_handy: ok');
