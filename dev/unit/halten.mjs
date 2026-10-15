// Halten-Schnellmenü (22-halten.js) ohne HA: Hauptaktion, Schnellbedienung, Zeitschalter, Zeilen je Gerät.
import fs from 'node:fs';
import assert from 'node:assert/strict';
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/22-halten.js', import.meta.url), 'utf8'))();
const H = window._casoraHold;
const st = (id, state, attributes) => ({ entity_id: id, state, attributes: attributes || {} });
const keys = (m) => m.rows.map((r) => r.key).join(',');

// Licht an, dimmbar mit Farbtemperatur: Ausschalten, Helligkeit (50 % gewählt), Lichtfarbe, Zeitschalter „Aus in“.
let m = H.model(st('light.a', 'on', { supported_color_modes: ['color_temp'], brightness: 128, color_mode: 'color_temp',
  color_temp_kelvin: 2700, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 }), { admin: true, device: true, timers: {} });
assert.equal(m.main.t, 'Ausschalten');
assert.equal(m.quick[0].label, 'Helligkeit');
assert.deepEqual(m.quick[0].items.map((x) => !!x.on), [false, true, false]);
assert.equal(m.quick[1].items[0].on, true, 'Warm gewählt');
assert.equal(m.timer.label, 'Aus in');
assert.equal(keys(m), 'popup,history,device,edit');

// Licht nur an/aus: keine Helligkeit; aus → „An für“; ohne Casora-Zeitschalter-Sensor kein Zeitschalter.
m = H.model(st('light.b', 'off', { supported_color_modes: ['onoff'] }), { timers: {} });
assert.equal(m.main.t, 'Einschalten');
assert.equal(m.quick.length, 0);
assert.equal(m.timer.label, 'An für');
assert.equal(H.model(st('light.b', 'off', {}), { timers: null }).timer, null);
assert.equal(keys(m), 'popup,history', 'ohne Gerät/Admin nur Popup und Verlauf');

// Laufender Zeitschalter: „Aus um hh:mm“ mit Abbrechen.
m = H.model(st('switch.c', 'on'), { timers: { 'switch.c': { at: '2026-10-15T19:30:00Z', action: 'turn_off' } } });
assert.equal(m.timer.active, true);
assert.match(m.timer.text, /^Aus um \d\d:\d\d$/);

// Jalousie: Öffnen (zu), Auf/Stopp/Zu, Position 50 %.
m = H.model(st('cover.d', 'closed', { supported_features: 15, current_position: 50 }), { timers: {} });
assert.equal(m.main.t, 'Öffnen');
assert.deepEqual(m.quick[0].items.map((x) => x.t), ['Auf', 'Stopp', 'Zu']);
assert.equal(m.quick[1].items[1].on, true);
assert.equal(m.timer, null, 'kein Zeitschalter für Jalousien');

// Thermostat: Ausschalten, Zieltemperatur in Schritten und Grenzen.
m = H.model(st('climate.e', 'heat', { temperature: 21, min_temp: 7, max_temp: 21.5 }), { timers: {} });
assert.equal(m.main.t, 'Ausschalten');
assert.equal(m.quick[0].kind, 'step');
assert.equal(H.stepTo(m.quick[0], 1), 21.5);
assert.equal(H.stepTo({ value: 21.5, step: 0.5, max: 21.5 }, 1), 21.5);
assert.equal(H.stepTo({ value: 7, step: 0.5, min: 7 }, -1), 7);

// Schloss: Entriegeln, „Tür öffnen“ mit Rückfrage; kein Zeitschalter.
m = H.model(st('lock.f', 'locked', { supported_features: 1 }), { timers: {} });
assert.equal(m.main.t, 'Entriegeln');
assert.equal(m.quick[0].items[0].ask, true);
assert.equal(m.timer, null);

// Medien: Pausieren, Tasten nach Fähigkeiten; Zeitschalter nur mit turn_off-Fähigkeit.
m = H.model(st('media_player.g', 'playing', { supported_features: 16 | 32 | 1024 }), { timers: {} });
assert.equal(m.main.t, 'Pausieren');
assert.deepEqual(m.quick[0].items.map((x) => x.t), ['Zurück', 'Leiser', 'Lauter', 'Weiter']);
assert.equal(m.timer, null);
assert.equal(H.model(st('media_player.g', 'playing', { supported_features: 256 }), { timers: {} }).timer.label, 'Aus in');

// Nicht erreichbar / reiner Sensor: nur die Wege.
m = H.model(st('light.h', 'unavailable'), { timers: {}, device: true });
assert.equal(m.main, null); assert.equal(m.quick.length, 0); assert.equal(m.timer, null);
m = H.model(st('sensor.i', '21.5'), { timers: {} });
assert.equal(m.main, null); assert.equal(keys(m), 'popup,history');

// Nur Halten, das bisher ein Popup/HAs Dialog war, wird zum Menü.
assert.equal(H.wants({ hold_action: { action: 'more-info' } }), true);
assert.equal(H.wants({ hold_action: { action: 'fire-dom-event' } }), true);
assert.equal(H.wants({ hold_action: { action: 'none' } }), false);
assert.equal(H.wants({ hold_action: { action: 'toggle' } }), false);
console.log('halten: ok');
