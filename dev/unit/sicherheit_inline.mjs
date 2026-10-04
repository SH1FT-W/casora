// Sicherheit einzeln (show_security_inline, wie Hemma): statt der Sammel-Badge „Sicherheit“
// stehen Schlösser, Alarm, Kontakte und Kameras als eigene Badges in der Reihe.
//   node dev/unit/sicherheit_inline.mjs
// Prüft ohne Browser: Studio-Vorschau (_miniModel) und die casora_room-Vorlage (welche Badges
// in der oberen Reihe aktiv sind, Reihenfolge, Unter-Reihe aus).
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');

// ── Studio-Vorschau ──────────────────────────────────────────────────────────
const start = src.indexOf('\n  _miniModel(room, opts) {');
assert.ok(start > 0, '_miniModel nicht gefunden');
const end = src.indexOf('\n  }\n', start);
const body = src.slice(start, end + 4).replace('_miniModel(room, opts) {', 'function _miniModel(room, opts) {');
const stubs = 'const numText = (n, d) => Number(n).toFixed(d); const trLabel = (s) => s; '
  + 'const wattText = (w) => w + " W"; const studioIcon = (s) => s;';
globalThis.window = globalThis;
const miniModel = new Function(stubs + body + '\nreturn _miniModel;')();

const states = {
  'binary_sensor.fenster_beispiel': { state: 'off', attributes: { device_class: 'window', friendly_name: 'Fenster' } },
  'binary_sensor.terrasse_beispiel': { state: 'on', attributes: { device_class: 'door', friendly_name: 'Terrassentür' } },
  'alarm_control_panel.beispiel': { state: 'armed_home', attributes: { friendly_name: 'Alarm' } },
  'lock.beispiel': { state: 'locked', attributes: { friendly_name: 'Wohnungstür' } },
  'camera.beispiel': { state: 'idle', attributes: { friendly_name: 'Kamera' } },
};
const ctx = { _hass: { states, config: { unit_system: { temperature: '°C' } } }, _sceneCatalog: () => [] };
const model = (V, opts) => miniModel.call(ctx, { variables: V }, opts);
const room = {
  security_lock_entity: 'lock.beispiel',
  security_entity_1: 'alarm_control_panel.beispiel',
  security_entity_2: 'binary_sensor.fenster_beispiel',
  security_entity_3: 'binary_sensor.terrasse_beispiel',
  security_cameras: ['camera.beispiel'],
};

// Ohne Schalter: eine Sammel-Badge mit Unter-Badges.
const grp = model(room).filter((b) => String(b.id).startsWith('security'));
assert.deepEqual(grp.map((b) => b.id), ['security']);
assert.equal(grp[0].subs.length, 5);

// Mit Schalter: Einzel-Badges in der Reihenfolge Schloss, Alarm, Kontakte, Kameras.
const inl = model({ ...room, show_security_inline: true }).filter((b) => String(b.id).startsWith('security'));
assert.deepEqual(inl.map((b) => b.id), ['security:0', 'security:1', 'security:2', 'security:3', 'security:4']);
assert.deepEqual(inl.map((b) => b.label), ['Lock', 'Alarm', 'Fenster', 'Terrassentür', 'Camera']);
assert.deepEqual(inl.map((b) => b.text), ['Locked', 'Armed (Home)', 'Closed', 'Opened', 'No Alerts']);
assert.ok(inl.every((b) => Array.isArray(b.subs) && !b.subs.length), 'Einzel-Badges haben keine Unter-Badges');
assert.equal(inl[2].icon, 'window-closed');
assert.equal(inl[3].icon, 'door-open');

// Nur ein Fenster-Kontakt: genau eine Einzel-Badge „Fenster“.
const one = model({ security_entity_2: 'binary_sensor.fenster_beispiel', show_security_inline: true })
  .filter((b) => String(b.id).startsWith('security'));
assert.deepEqual(one.map((b) => [b.id, b.label]), [['security:0', 'Fenster']]);

// Ausgeschaltet bleibt ausgeschaltet.
assert.equal(model({ ...room, show_security: false, show_security_inline: true })
  .filter((b) => String(b.id).startsWith('security')).length, 0);

// Handy: der Filter bleibt die eine Sicherheits-Badge (Hemma hatte einzeln nur Desktop/Tablet).
assert.deepEqual(model({ ...room, show_security_inline: true }, { phone: true })
  .filter((b) => String(b.id).startsWith('security')).map((b) => b.id), ['security']);

// Studio-Schalter in der Badge-Einstellung „Sicherheit“.
const sec = src.slice(src.indexOf('label: "Security", bid: "security"'));
const fld = /key: "show_security_inline", label: "Separate security badges", type: "bool"/;
assert.ok(fld.test(sec.slice(0, sec.indexOf('repeats:'))), 'Schalter show_security_inline fehlt');
const de = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/translations/panel/de.json', import.meta.url), 'utf8'));
assert.equal(de.exact['Separate security badges'], 'Einzeln anzeigen');

// ── Dashboard-Vorlage casora_room ────────────────────────────────────────────
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const R = T.casora_room;
const js = (s) => new Function('variables', String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
const cards = R.custom_fields.badges.card.cards;
const shown = (V) => cards.filter((c) => /security|lock|camera|contact/.test(c.template)
  && js(c.variables.enabled)(V))
  .map((c) => c.template + (c.entity ? ':' + js(c.entity)(V) : ''));

assert.deepEqual(shown(room), ['casora_badge_security_group'], 'ohne Schalter nur die Sammel-Badge');
assert.deepEqual(shown({ ...room, show_security_inline: true }), [
  'casora_badge_lock_group:lock.beispiel',
  'casora_badge_security:alarm_control_panel.beispiel',
  'casora_badge_contact_group:binary_sensor.fenster_beispiel',
  'casora_badge_contact_group:binary_sensor.terrasse_beispiel',
  'casora_badge_camera_group:camera.beispiel',
], 'einzeln: Schloss, Alarm, Kontakte, Kameras');
assert.deepEqual(shown({ security_entity_2: 'binary_sensor.fenster_beispiel', show_security_inline: true }),
  ['casora_badge_contact_group:binary_sensor.fenster_beispiel']);
assert.deepEqual(shown({ ...room, show_security: false, show_security_inline: true }), []);

// Dieselben Vorlagen wie die Unter-Badges, damit Symbol, Text, Farbe und Popup gleich sind.
const sub = R.custom_fields.badges_security.card.cards;
for (const c of cards.filter((x) => x.variables?.inline === true)) {
  const twin = sub.find((s) => s.template === c.template && (s.entity === c.entity || /lock_group/.test(c.template)));
  assert.ok(twin, 'kein Unter-Badge-Vorbild für ' + c.template + ' ' + c.entity);
  assert.ok(String(T[c.template].extra_styles).includes("order:var(--casora-badge-order-security,1)"),
    c.template + ' sortiert an der Sicherheits-Stelle');
}
// Einzel- und Listen-Schlösser zusammen in einer Schloss-Badge.
const lock = cards.find((c) => c.template === 'casora_badge_lock_group');
assert.deepEqual(js(lock.variables.locks)({ security_lock_entity: 'lock.a', security_lock_entity_2: 'lock.b',
  security_locks: ['lock.b', 'lock.c'] }), ['lock.a', 'lock.b', 'lock.c']);

// Unter-Reihe der Sammel-Badge bleibt zu, wenn einzeln gezeigt.
const rowStyle = Object.assign({}, ...R.styles.custom_fields.badges_security);
globalThis.states = { 'input_select.casora_expanded_row': { state: 'security' } };
const rowJs = (s) => new Function('variables', 'states', String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''));
assert.equal(rowJs(rowStyle.display)({ ...room, show_security_inline: true }, globalThis.states), 'none');
assert.equal(rowJs(rowStyle.display)(room, globalThis.states), 'block');
assert.equal(R.variables.show_security_inline, false, 'Standardwert');

console.log('sicherheit_inline: ok');
