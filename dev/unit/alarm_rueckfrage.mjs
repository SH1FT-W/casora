// Alarm scharf schalten: Rückfrage, wenn Fenster/Türen offen oder ein Schloss entriegelt ist
// (07.10.2026). Gezählt wird wie im Sicherheits-Badge der Räume; ausgeblendete Räume und
// „Wer sieht das?“ zählen nicht. Unscharf schalten fragt nie, Abbrechen schickt nichts.
//   node dev/unit/alarm_rueckfrage.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');

// casoraOpenings (Kontakt + Kippsensor = eine Öffnung) aus 00-finden.js.
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
new Function(read('scripts/local/00-finden.js'))();

const core = read('scripts/casora-core.js');
const block = (start, end) => { const i = core.indexOf(start); return core.slice(i, core.indexOf(end, i) + end.length); };

const states = {};
const set = (id, state, attrs = {}) => { states[id] = { entity_id: id, state, attributes: attrs }; };
const hass = { user: { id: 'admin' }, states, entities: {}, devices: {}, areas: {} };
let host = null;
const shown = {};
const doc = {
  querySelector: (s) => (s === 'home-assistant' ? { hass } : null),
  addEventListener() {}, removeEventListener() {},
  body: { appendChild: (h) => { host = h; } },
  createElement: () => {
    const parts = {};
    const el = { classList: { add() {} }, addEventListener() {}, remove() { host = null; },
      attachShadow: () => ({ set innerHTML(v) {}, querySelector: (s) => (parts[s] = parts[s] || {
        focus() {}, classList: { add: (c) => { shown[s + '.class'] = c; } },
        set textContent(v) { shown[s] = v; } }) }),
      parts };
    return el;
  },
};
const w = { addEventListener() {}, casoraOpenings: globalThis.casoraOpenings };
new Function('window', 'document', 'WeakSet', 'CustomEvent', 'setTimeout',
  block('(function () {\n  var hassUser', '})();\n') + block('(function () {\n  if (window.__casoraAskFirst)', '})();\n'))(
  w, doc, WeakSet, class {}, () => {});
assert.equal(typeof w.casoraConfirmArm, 'function');

// Haus: Gruppe „Fenster“ (zwei Fenster), Küchenfenster mit Kippsensor, Haustür (Kontakt), zwei Schlösser.
set('binary_sensor.fenster', 'on', { friendly_name: 'Fenster', entity_id: ['binary_sensor.bad_fenster', 'binary_sensor.buero_fenster'] });
set('binary_sensor.bad_fenster', 'on', { device_class: 'window', friendly_name: 'Bad Fenster' });
set('binary_sensor.buero_fenster', 'on', { device_class: 'window', friendly_name: 'Büro Fenster' });
set('binary_sensor.kueche_fenster', 'off', { device_class: 'window', friendly_name: 'Küche Fenster' });
set('binary_sensor.kueche_fenster_kipp', 'off', { device_class: 'window', friendly_name: 'Küche Fenster Kippsensor' });
set('binary_sensor.haustuer', 'off', { device_class: 'door', friendly_name: 'Haustür Kontakt' });
set('lock.haustuer', 'unlocked', { friendly_name: 'Haustür' });
set('lock.keller', 'locked', { friendly_name: 'Keller' });
set('alarm_control_panel.alarmo', 'disarmed', { friendly_name: 'Alarmo' });

const room = (v) => ({ type: 'custom:button-card', template: 'casora_room', variables: { show_security: true, ...v } });
const cfg = { views: [
  { cards: [room({ security_lock_entity: 'lock.haustuer', security_locks: ['lock.haustuer', 'lock.keller'],
    security_entity_1: 'alarm_control_panel.alarmo', security_entity_2: 'binary_sensor.fenster', security_entity_3: 'binary_sensor.haustuer' })] },
  { cards: [room({ security_entity_1: 'binary_sensor.kueche_fenster', security_entity_2: 'binary_sensor.kueche_fenster_kipp' })] },
] };
const warn = (c = cfg, user = hass.user) => w.casoraArmWarnings(hass, w.casoraArmIds(c, user));

// 1) Zwei Fenster offen (Gruppe zählt über Mitglieder), Haustür entriegelt.
assert.deepEqual(warn(), ['2 Fenster offen', 'Haustür entriegelt']);

// 2) Kontakt + Kippsensor sind eine Öffnung: gekippt, nicht „2 Fenster“.
set('binary_sensor.kueche_fenster_kipp', 'on', states['binary_sensor.kueche_fenster_kipp'].attributes);
assert.deepEqual(warn(), ['2 Fenster offen', '1 Fenster gekippt', 'Haustür entriegelt']);
set('binary_sensor.kueche_fenster_kipp', 'off', states['binary_sensor.kueche_fenster_kipp'].attributes);

// 3) Einzahl/Mehrzahl, mehr als zwei Schlösser als Zahl.
set('binary_sensor.buero_fenster', 'off', states['binary_sensor.buero_fenster'].attributes);
set('binary_sensor.haustuer', 'on', states['binary_sensor.haustuer'].attributes);
set('lock.keller', 'unlocked', states['lock.keller'].attributes);
assert.deepEqual(warn(), ['1 Tür offen', '1 Fenster offen', 'Haustür entriegelt', 'Keller entriegelt']);
set('lock.dach', 'unlocked', { friendly_name: 'Dach' });
const three = { views: [{ cards: [room({ security_locks: ['lock.haustuer', 'lock.keller', 'lock.dach'] })] }] };
assert.deepEqual(warn(three), ['3 Schlösser entriegelt']);

// 4) Ausgeblendeter Raum, Raum nur für andere, abgeschaltete Sicherheit, „Wer sieht das?“ der Kachel.
const only = (v) => ({ views: [{ cards: [room({ security_entity_1: 'binary_sensor.fenster', ...v })] }] });
assert.deepEqual(warn(only({})), ['1 Fenster offen']);
assert.deepEqual(warn(only({ casora_hidden: true })), [], 'ausgeblendeter Raum');
assert.deepEqual(warn(only({ casora_users: ['kind'] })), [], 'Raum nur für andere');
assert.deepEqual(warn(only({ show_security: false })), [], 'Sicherheit im Raum aus');
assert.deepEqual(warn(only({ casora_entity_users: { 'binary_sensor.fenster': ['kind'] } })), [], 'Kachel nur für andere');
assert.deepEqual(warn(only({ casora_badge_users: { security: ['kind'] } })), [], 'Badge nur für andere');
// Vorlagen-Variablen ([[[ … ]]]) und button_card_templates zählen nicht.
assert.deepEqual(warn({ button_card_templates: { x: { variables: { security_entity_1: 'binary_sensor.fenster' } } },
  views: [{ cards: [room({ security_entity_1: '[[[ return 1 ]]]' })] }] }), []);

// 5) Dialog: Wortlaut, Fokus-Knopf „Abbrechen“, Knöpfe untereinander.
const tap = async (c, yes) => {
  host = null; for (const k of Object.keys(shown)) delete shown[k];
  const p = w.casoraConfirmArm(hass, c);
  const asked = !!host;
  if (host) host.parts[yes ? '.yes' : '.no'].onclick();
  return { ok: await p, asked };
};
{
  const r = await tap(cfg, false);
  assert.equal(r.asked, true);
  assert.equal(shown.h2, 'Achtung: 1 Tür offen, 1 Fenster offen, Haustür entriegelt, Keller entriegelt');
  assert.equal(shown.p, 'Trotzdem scharf schalten?');
  assert.equal(shown['.no'], 'Abbrechen');
  assert.equal(shown['.yes'], 'Trotzdem scharf schalten');
  assert.equal(shown['.row.class'], 'stack');
  assert.equal(r.ok, false, 'Abbrechen → nicht scharf');
}
assert.equal((await tap(cfg, true)).ok, true, 'Trotzdem → scharf');

// 6) Am Dienstaufruf: Scharf mit Offenem fragt, Abbrechen schickt nichts; Unscharf fragt nie;
// alles zu → ohne Rückfrage.
w._casoraLovelaceCfg = () => cfg;
const sent = [];
const conn = { sendMessagePromise(msg) { sent.push(msg.service || msg.type); return Promise.resolve({ context: {} }); } };
w.__casoraArmGuard(conn);
const send = async (service, yes) => {
  host = null;
  const p = conn.sendMessagePromise({ type: 'call_service', domain: 'alarm_control_panel', service, service_data: { entity_id: 'alarm_control_panel.alarmo' } });
  await Promise.resolve();
  const asked = !!host;
  if (host) host.parts[yes ? '.yes' : '.no'].onclick();
  return { r: await p, asked };
};
{
  sent.length = 0;
  const a = await send('alarm_arm_away', false);
  assert.equal(a.asked, true, 'offenes Fenster → Rückfrage');
  assert.deepEqual(sent, [], 'Abbrechen → kein Dienstaufruf');
  assert.equal(a.r.casora_cancelled, true, 'Abbrechen ist kein Fehler');
  const b = await send('alarm_arm_night', true);
  assert.equal(b.asked, true);
  assert.deepEqual(sent, ['alarm_arm_night'], 'Trotzdem → Dienstaufruf');
  const c = await send('alarm_disarm');
  assert.equal(c.asked, false, 'Unscharf fragt nie');
  assert.deepEqual(sent, ['alarm_arm_night', 'alarm_disarm']);
  await conn.sendMessagePromise({ type: 'call_service', domain: 'light', service: 'turn_on' });
  assert.equal(host, null, 'andere Dienste unberührt');
}
{
  for (const id of Object.keys(states)) {
    if (id.startsWith('binary_sensor.')) states[id].state = 'off';
    if (id.startsWith('lock.')) states[id].state = 'locked';
  }
  sent.length = 0;
  const a = await send('alarm_arm_home');
  assert.equal(a.asked, false, 'alles zu → keine Rückfrage');
  assert.deepEqual(sent, ['alarm_arm_home']);
}
{
  // Kein Casora-Dashboard offen (z. B. Alarmo-Seite): wie bisher, ohne Rückfrage.
  states['binary_sensor.bad_fenster'].state = 'on';
  w._casoraLovelaceCfg = () => null;
  sent.length = 0;
  const a = await send('alarm_arm_away');
  assert.equal(a.asked, false);
  assert.deepEqual(sent, ['alarm_arm_away']);
}

// 7) Englisch: alle Teile haben eine Übersetzung.
const en = JSON.parse(read('translations/dashboard/phrases/en.json'));
const trEn = (s) => en.exact[s] ?? (() => {
  for (const [re, out] of en.patterns) { const m = s.match(new RegExp(re)); if (m) return out.replace(/\{(\d)\}/g, (x, n) => m[+n]); }
  return null;
})();
assert.equal(trEn('Achtung'), 'Heads up');
assert.equal(trEn('Trotzdem scharf schalten?'), 'Arm anyway?');
assert.equal(trEn('Trotzdem scharf schalten'), 'Arm anyway');
assert.equal(trEn('1 Fenster offen'), '1 window open');
assert.equal(trEn('2 Fenster offen'), '2 windows open');
assert.equal(trEn('1 Tür offen'), '1 door open');
assert.equal(trEn('3 Schlösser entriegelt'), '3 locks unlocked');
assert.equal(trEn('Front Door entriegelt'), 'Front Door unlocked');

console.log('alarm_rueckfrage: ok');
