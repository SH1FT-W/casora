// Nutzertest 2 (T4/T5) ohne Browser.  node dev/unit/wer_sieht_und_rueckfrage.mjs
// „Wer sieht das?“ einer Kachel gilt auch für Badges/Summen (Kind sah „1 Schloss“), und
// „Vor dem Schalten fragen“ gilt für jeden Schaltweg der Kachel, auch im Popup. Beides über
// Listen, die das Studio beim Speichern in jeden Raum schreibt (casora_entity_users,
// casora_confirm_entities) und casora-core.js beim Zeichnen liest.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');

// ── Studio: Listen beim Speichern ──────────────────────────────────────────────────
const src = read('panel/casora-panel.js');
const grab = (name) => { const i = src.indexOf('function ' + name + '('); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n}', i) + 2); };
const clone = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const expand = new Function('clone', [grab('roomVisibility'), grab('entityUsers'), grab('confirmEntities'), grab('expandConfig'), 'return expandConfig;'].join('\n'))(clone);
const lockTile = { type: 'custom:button-card', template: 'casora_lock', entity: 'lock.tuer', visibility: [{ condition: 'user', users: ['admin'] }] };
const pump = { type: 'custom:button-card', template: 'casora_switch', entity: 'switch.pumpe', variables: { confirm_toggle: true } };
const rooms = [{ path: 'flur', name: 'Flur', variables: { security_lock_entity: 'lock.tuer' }, tiles: [lockTile, pump], _hero: { template: 'casora_room' }, _row: {}, _view: {} },
  { path: 'bad', name: 'Bad', variables: {}, tiles: [], _hero: { template: 'casora_room' }, _row: {}, _view: {} }];
const out = expand({ rooms }, { view_type: 'panel', layout: {}, nav: {} }, {}, null);
for (const v of out.views) {
  assert.deepEqual(v.cards[0].variables.casora_entity_users, { 'lock.tuer': ['admin'] }, 'in jedem Raum');
  assert.deepEqual(v.cards[0].variables.casora_confirm_entities, ['switch.pumpe']);
}
assert.equal(rooms[0].variables.casora_entity_users, undefined, 'nicht im Studio-Stand');
const plain = expand({ rooms: [{ ...rooms[1] }] }, { view_type: 'panel', layout: {}, nav: {} }, {}, null);
assert.ok(!('casora_entity_users' in plain.views[0].cards[0].variables) && !('casora_confirm_entities' in plain.views[0].cards[0].variables), 'ohne Grund nichts');
assert.ok(src.includes('omit(clone(hero.variables) || {}, ["casora_entity_users", "casora_confirm_entities"])'), 'beim Laden wieder entfernt');

// ── casora-core: casoraSeesEntity, casoraHasSec, Rückfrage im Popup ───────────────
const core = read('scripts/casora-core.js');
const block = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };
const asked = [];
const w = { addEventListener: () => {} };
const doc = { querySelector: () => ({ hass: { user: { id: 'kind' }, states: { 'switch.pumpe': { state: 'on', attributes: { friendly_name: 'Pumpe' } } } } }),
  addEventListener: () => {}, removeEventListener: () => {}, body: { appendChild: (h) => asked.push(h) },
  createElement: () => { const el = { classList: { add() {} }, addEventListener() {}, remove() {},
    attachShadow: () => ({ set innerHTML(v) {}, querySelector: (s) => (el[s] = el[s] || { focus() { asked.push('focus' + s); } }) }) }; return el; } };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  var hassUser', '})();\n') + block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(w, doc, WeakSet, class {}, (f) => f());
const V = { show_security: true, security_lock_entity: 'lock.tuer', casora_entity_users: { 'lock.tuer': ['admin'] }, casora_confirm_entities: ['switch.pumpe'] };
assert.equal(w.casoraHasSec(V, { id: 'kind' }), false, 'Kind: kein Sicherheits-Badge');
assert.equal(w.casoraHasSec(V, { id: 'admin' }), true, 'Admin sieht es');
assert.equal(w.casoraHasSec({ ...V, security_entity_1: 'binary_sensor.fenster' }, { id: 'kind' }), true, 'andere Geräte bleiben');
w.casoraSeen(V, 'security', { id: 'kind' }, true);
assert.equal(w.casoraSeesEntity('lock.tuer', { id: 'kind' }), false, 'dashboardweit gemerkt (Schloss-Gruppe)');
assert.equal(w.casoraSeesEntity('lock.andere', { id: 'kind' }), true);
assert.equal(w.casoraAsksFirst('switch.pumpe'), true, 'Pumpe fragt – auch im Popup');
assert.equal(w.casoraAsksFirst('switch.licht'), false);
w.casoraSeen({ show_security: true }, 'security', { id: 'kind' }, true);
assert.equal(w.casoraAsksFirst('switch.pumpe'), false, 'abgeschaltet → nicht veraltet weiter');
assert.equal(w.casoraSeesEntity('lock.tuer', { id: 'kind' }), true);
// Rückfrage: Fokus auf „Abbrechen“
w.casoraSeen(V, 'security', null, true);
w.casoraConfirmSwitch('switch.pumpe', 'switch.toggle');
assert.ok(asked.includes('focus.no') && !asked.includes('focus.yes'), 'Fokus auf Abbrechen: ' + asked.filter((x) => typeof x === 'string'));

// ── Vorlagen: Badge-Prüfungen gehen über casoraHasSec, Schloss-Gruppe filtert ─────────
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const all = JSON.stringify(tpl);
{ const raw = (all.match(/\(!!(variables|_rv)\.security_lock_entity\|\|/g) || []).length;
  const wrapped = (all.match(/casoraHasSec\((variables|_rv),user\):\(!!(variables|_rv)\.security_lock_entity\|\|/g) || []).length;
  assert.ok(raw > 40 && raw === wrapped, 'jede Sicherheits-Prüfung über casoraHasSec: ' + wrapped + '/' + raw); }
assert.ok(JSON.stringify(tpl.casora_badge_lock_group).includes('window.casoraSeesEntity(id, user)'), 'Schloss-Gruppe zählt nur Sichtbares');
assert.ok(JSON.stringify(tpl.casora_badge_security).includes('!window.casoraSeesEntity(entity.entity_id, user)'), 'einzelnes Sicherheits-Badge');
// Popups/Aktionsraster schalten über casoraConfirmSwitch
assert.ok(core.includes("window.casoraConfirmSwitch(eid, domain + '.toggle')") && read('scripts/local/03-popups.js').includes("window.casoraConfirmSwitch(d.id, 'light.toggle')"));
console.log('wer_sieht_und_rueckfrage: ok');
