// Raumseite am Handy = Raum-Kopf am Desktop (05.10.2026).
//   node dev/unit/handy_raum_badges.mjs
// Gemeldet: Am Handy fehlten im Raum Energie und Sicherheit (Türen/Fenster), die am Tablet im
// Raum-Kopf stehen; Einzel-Anzeige (show_*_inline) galt am Handy nicht. Erwartet: dieselben
// Badges in derselben Reihenfolge, Abweichungen nur über Handy-Schalter in room_chips.
// Ohne Browser:
//   1. window.casoraPhoneRoom.merge (casora-core.js) = phoneRoomBadgeVars (Studio).
//   2. casora_mobile_sensor_chips/rooms_row zeigt mit diesen Variablen genau die Karten, die
//      casora_room/badges am Desktop zeigt (Art, Entität, Reihenfolge), außer Szenen.
//   3. Handy-Schalter (room_chips) wirken nur am Handy; Bewegung bleibt Handy-Extra.
//   4. Unter-Reihen: Sammel-Badges klappen je Gerät auf (casora_phone_row), Quelle = Desktop-Feld.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const panel = read('custom_components/casora/panel/casora-panel.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

// ── 1. Zusammenführen: Dashboard und Studio gleich ───────────────────────────
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, querySelector() { return null; } };
globalThis.location = { pathname: '/qa-haus-mobile/home' };
const energyAt = core.indexOf('window._casoraEnergyOn = function (V) {');
new Function(core.slice(energyAt, core.indexOf('\n  };', energyAt) + 4))();
const coreAt = core.indexOf('// Raum-Badges am Handy wie im Raum-Kopf am Desktop/Tablet');
assert.ok(coreAt > 0, 'casoraPhoneRoom fehlt in casora-core.js');
const coreEnd = core.indexOf('\n})();\n', core.indexOf('window.casoraPhoneRoom = {', coreAt)) + 6;
new Function(core.slice(coreAt, coreEnd))();
const PR = window.casoraPhoneRoom;
assert.ok(PR && PR.merge && PR.vars, 'window.casoraPhoneRoom');

const one = (re) => { const m = re.exec(panel); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const fnOf = (name) => {
  const at = panel.indexOf('\nfunction ' + name + '(');
  assert.ok(at > 0, name);
  return panel.slice(at, panel.indexOf('\n}\n', at) + 3);
};
const studio = new Function([
  one(/^const BADGE_SWITCH_KEYS = .*$/m),
  one(/^const CHIPS_AQI_FROM_ROOM = [^;]*;/ms),
  one(/^const BADGE_TITLE_KEYS = .*$/m),
  one(/^const PHONE_ROOM_OVERRIDE = [^;]*;/ms),
  fnOf('phoneRoomLegacyVars'), fnOf('phoneRoomBadgeVars'),
  'return { phoneRoomBadgeVars, PHONE_ROOM_OVERRIDE };'].join('\n'))();
assert.deepEqual(studio.PHONE_ROOM_OVERRIDE, PR.OVERRIDE, 'gleiche Handy-Schalter in Studio und Dashboard');

const ROOM = {
  room_name: null,
  temp_sensor_1: 'sensor.beispiel_temperatur', humidity_sensor: 'sensor.beispiel_feuchte',
  quality_sensor: 'sensor.beispiel_luft', climate_entity_1: 'climate.beispiel',
  light_group_entity: 'light.beispiel_gruppe',
  presence_entity_1: 'person.beispiel_a', presence_entity_2: 'person.beispiel_b',
  security_locks: ['lock.beispiel'], security_entity_1: 'alarm_control_panel.beispiel',
  security_entity_2: 'binary_sensor.beispiel_fenster', security_entity_3: 'binary_sensor.beispiel_tuer',
  security_cameras: ['camera.beispiel'],
  energy_power_entity: 'sensor.beispiel_leistung', energy_entity_1: 'sensor.beispiel_geraet',
  media_player_1: 'media_player.beispiel',
  badge_order: ['energy', 'security', 'climate'],
};
const CHIP = {   // was das Studio bis 1.0.9 kopierte (Auszug), dazu Bewegung
  temp_entity: 'sensor.beispiel_temperatur', humidity_entity: 'sensor.beispiel_feuchte',
  lights_entity: 'light.beispiel_gruppe', security_entity_2: 'binary_sensor.beispiel_fenster',
  aqi_room_name: 'Beispielraum', motion_entity: 'binary_sensor.beispiel_bewegung',
};
const cases = [
  [ROOM, null, 'Beispielraum'],
  [ROOM, CHIP, 'Beispielraum'],
  [{ ...ROOM, show_security_inline: true, show_climate_inline: true }, CHIP, 'Beispielraum'],
  [ROOM, { ...CHIP, show_energy: false, show_security_inline: true, badge_order: ['climate'] }, 'Beispielraum'],
  [null, CHIP, null],
  [null, { ...CHIP, security_locks: ['lock.beispiel'], aqi_sensors: ['sensor.beispiel_pm25'] }, null],
];
for (const [d, c, n] of cases) {
  const a = PR.merge(d, c, n);
  const b = studio.phoneRoomBadgeVars(d, c, n);
  delete a._any;
  assert.deepEqual(b, a, 'Studio und Dashboard führen gleich zusammen');
}
// Ohne Desktop-Raum (älterer Server): der Auszug in Desktop-Form.
const leg = PR.merge(null, CHIP, null);
assert.equal(leg.temp_sensor_1, 'sensor.beispiel_temperatur');
assert.equal(leg.light_group_entity, 'light.beispiel_gruppe');
assert.equal(leg.security_entity_2, 'binary_sensor.beispiel_fenster');
assert.equal(leg._name, 'Beispielraum');
assert.equal(leg.show_scenes, false);
// Desktop-Raum vorhanden: der Auszug spielt keine Rolle, Handy-Schalter schon.
const ov = PR.merge(ROOM, { ...CHIP, show_energy: false, temp_entity: 'sensor.anders' }, 'Beispielraum');
assert.equal(ov.show_energy, false, 'Handy-Schalter gilt');
assert.equal(ov.temp_sensor_1, 'sensor.beispiel_temperatur', 'Entitäten kommen vom Desktop');
assert.equal(PR.merge(ROOM, null, 'X').show_energy, undefined, 'ohne Schalter wie am Desktop');
assert.equal(PR.vars('all', {}), null);
assert.equal(PR.vars('room_x', {}), null, 'ohne Server-Antwort und ohne Auszug nichts');
assert.equal(PR.vars('room_x', { room_x: CHIP }).temp_sensor_1, 'sensor.beispiel_temperatur');

// ── 2. Vorlagen: gleiche Badges wie casora_room ──────────────────────────────
const R = T.casora_room, C = T.casora_mobile_sensor_chips;
const body = (s) => String(s).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const ev = (s, V, name) => (typeof s === 'string' && s.trim().startsWith('[[[')
  ? new Function('variables', 'states', 'hass', 'entity', body(s)).call({ _config: { name } }, V, {}, { states: {}, config: {} }, null)
  : s);
const desk = R.custom_fields.badges.card.cards;
const phone = C.custom_fields.rooms_row.card.cards;
const shown = (cards, V, name) => cards.filter((c) => c.variables && 'enabled' in c.variables
  && ev(c.variables.enabled, V, name)).map((c) => c.template + ':' + (ev(c.entity, V, name) || ''));

const ON = { show_scenes: true, scene_entities: ['scene.beispiel'] };
const variants = [
  {},
  { show_security_inline: true },
  { show_climate_inline: true, show_people_inline: true },
  { show_security_inline: true, show_climate_inline: true, show_people_inline: true },
  { show_energy: false, show_media: false },
  { show_lights: false, show_security: false },
  { show_now_playing: true },
];
for (const x of variants) {
  const V = { ...ROOM, ...ON, ...x };
  const d = shown(desk, V, 'Beispielraum').filter((t) => !t.startsWith('casora_badge_scene_group'));
  const p = shown(phone, { casora_rv: PR.merge(V, null, 'Beispielraum') }, null);
  assert.deepEqual(p, d, 'Handy = Desktop für ' + JSON.stringify(x));
}
// Energie und Sicherheit (gemeldet) stehen am Handy.
const base = shown(phone, { casora_rv: PR.merge(ROOM, null, 'Beispielraum') }, null);
assert.ok(base.some((t) => t.startsWith('casora_badge_energy_group')), 'Energie am Handy');
assert.ok(base.some((t) => t.startsWith('casora_badge_security_group')), 'Sicherheit am Handy');
// Einzeln: Kontakte als eigene Badges am Handy.
const inl = shown(phone, { casora_rv: PR.merge({ ...ROOM, show_security_inline: true }, null, 'R') }, null);
assert.ok(inl.includes('casora_badge_contact_group:binary_sensor.beispiel_fenster'), 'Fenster einzeln am Handy');
assert.ok(!inl.some((t) => t.startsWith('casora_badge_security_group')), 'keine Sammel-Badge bei einzeln');
// Handy-Schalter: Energie nur am Handy aus.
const off = shown(phone, { casora_rv: PR.merge(ROOM, { show_energy: false }, 'R') }, null);
assert.ok(!off.some((t) => t.startsWith('casora_badge_energy')), 'Handy-Schalter show_energy');
assert.ok(shown(desk, ROOM, 'R').some((t) => t.startsWith('casora_badge_energy_group')), 'Desktop unberührt');
// Szenen nie als Badge auf der Raumseite.
assert.ok(!phone.some((c) => c.template === 'casora_badge_scene_group'));
// Popup-Titel: Raumname wie am Desktop (this._config.name → _name).
const temp = phone.find((c) => c.template === 'casora_badge_temp');
assert.equal(ev(temp.variables.room_name, { casora_rv: PR.merge(ROOM, null, 'Beispielraum') }), 'Beispielraum');
const dtemp = desk.find((c) => c.template === 'casora_badge_temp');
assert.equal(ev(dtemp.variables.room_name, ROOM, 'Beispielraum'), 'Beispielraum');

// Reihenfolge: dieselben --casora-badge-order-* wie der Raum-Kopf.
const ordD = Object.assign({}, ...R.styles.card.filter((e) => Object.keys(e)[0].startsWith('--casora-badge-order-')));
const ordP = Object.assign({}, ...C.styles.custom_fields.rooms_row.filter((e) => Object.keys(e)[0].startsWith('--casora-badge-order-')));
assert.deepEqual(Object.keys(ordP).sort(), Object.keys(ordD).sort(), 'alle Reihenfolge-Werte');
for (const k of Object.keys(ordD)) {
  for (const bo of [undefined, ['energy', 'security'], ['media', 'climate', 'people']]) {
    const V = { ...ROOM, badge_order: bo };
    assert.equal(ev(ordP[k], { casora_rv: PR.merge(V, null, 'R') }), ev(ordD[k], V, 'R'), k + ' ' + JSON.stringify(bo));
  }
}
// Bewegung (Handy-Extra) hinten.
const motion = phone.find((c) => c.icon === 'mdi:motion-sensor');
assert.ok(motion && motion.extra_styles.includes(':host{order:99;}'), 'Bewegung hinten');

// ── 3. Unter-Reihen ──────────────────────────────────────────────────────────
const groups = { casora_badge_security_group: 'security', casora_badge_climate_group: 'climate',
  casora_badge_light_group: 'lights', casora_badge_presence_group: 'presence', casora_badge_media_group: 'media' };
for (const [tpl, kind] of Object.entries(groups)) {
  const c = phone.find((x) => x.template === tpl);
  assert.deepEqual(c.tap_action, { action: 'fire-dom-event', casora_phone_row: kind, haptic: 'light' }, tpl);
  assert.ok(C.custom_fields['room_sub_' + kind], 'Unter-Reihe ' + kind);
  const dsub = R.custom_fields[{ lights: 'badges_lights', presence: 'badges_presence' }[kind] || 'badges_' + kind];
  assert.equal(JSON.stringify(C.custom_fields['room_sub_' + kind]).length > JSON.stringify(dsub).length * 0.9, true);
  const disp = Object.assign({}, ...C.styles.custom_fields['room_sub_' + kind]).display;
  const st = (row) => ({ 'input_select.casora_mobile_filter': { state: 'room_x', attributes: { casora_row: row } } });
  const run = (row) => new Function('variables', 'states', body(disp))({ casora_rv: {} }, st(row));
  assert.equal(run(kind), 'block');
  assert.equal(run(null), 'none');
}
const en = phone.find((x) => x.template === 'casora_badge_energy_group');
assert.equal(ev(en.tap_action.casora_phone_row, { casora_rv: PR.merge(ROOM, null, 'R') }), 'energy');
assert.equal(ev(en.tap_action.casora_phone_row, { casora_rv: PR.merge({ ...ROOM, energy_entity_1: null }, null, 'R') }), null,
  'ohne Unter-Badges: gleich das Popup');
// Sub-Reihen lesen nie den gemeinsamen Helfer casora_expanded_row.
for (const k of Object.keys(C.custom_fields).filter((k) => k.startsWith('room_sub_') || k === 'rooms_row')) {
  assert.ok(!JSON.stringify(C.custom_fields[k]).includes('casora_expanded_row'), k + ' ohne casora_expanded_row');
}

// ── 4. Filter je Gerät: Unter-Reihe, Neuzeichnen ─────────────────────────────
const fAt = core.indexOf('(function () {\n  if (window._casoraFilter) return;');
const fEnd = core.indexOf('\n})();\n', fAt) + 6;
const store = {};
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const L = [];
globalThis.addEventListener = (type, fn) => L.push([type, fn]);
new Function(core.slice(fAt, fEnd))();
const F = window._casoraFilter;
F.set('room_x');
const ent = { entity_id: F.ENTITY, state: 'all', attributes: { options: [] } };
const hass = { states: { [F.ENTITY]: ent, 'light.a': { state: 'on' } } };
const h1 = F.apply(hass);
assert.equal(h1.states[F.ENTITY].state, 'room_x');
assert.equal(F.apply({ ...hass, states: { ...hass.states, 'light.a': { state: 'off' } } }).states[F.ENTITY], h1.states[F.ENTITY],
  'Zustand des Filters bleibt dasselbe Objekt, solange er sich nicht ändert (kein Neuzeichnen bei jedem Update)');
const ll = L.find(([t]) => t === 'll-custom')[1];
const fire = (detail) => ll({ detail, stopPropagation() {} });
fire({ casora_phone_row: 'security' });
assert.equal(F.row(), 'security');
const h2 = F.apply(hass);
assert.equal(h2.states[F.ENTITY].attributes.casora_row, 'security');
fire({ casora_phone_row: 'security' });
assert.equal(F.row(), null, 'zweites Antippen klappt zu');
fire({ casora_phone_row: 'lights' });
F.set('room_y');
assert.equal(F.row(), null, 'Raumwechsel klappt zu');
const t0 = F.apply(hass).states[F.ENTITY];
F.bump();
assert.notEqual(F.apply(hass).states[F.ENTITY], t0, 'neue Raum-Badges vom Server zeichnen neu');

// ── 5. Vorlage auf dem Stand von casora_room ─────────────────────────────────
execFileSync('python3', [new URL('../../tools/phone_room_badges.py', import.meta.url).pathname, '--check'], { stdio: 'pipe' });

console.log('handy_raum_badges: ok');
