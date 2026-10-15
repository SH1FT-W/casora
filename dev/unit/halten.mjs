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
assert.equal(m.quick[0].value, ' · 50 %', 'aktueller Wert an der Überschrift');
assert.equal(m.timer.label, 'Ausschalten in');
assert.equal(keys(m), 'popup,history,device,edit');
assert.equal(keys(H.model(st('light.a', 'on'), { admin: true, device: true, tapPopup: true })), 'history,device,edit', 'Tippen öffnet schon das Popup: keine Zeile Details');
assert.equal(keys(H.model(st('light.a', 'on'), { admin: false, device: true, tapPopup: true })), 'history', 'Gerät und Bearbeiten nur für Admins');
assert.equal(H.worth(m), true);

// Licht nur an/aus: keine Helligkeit; aus → „An für“; ohne Casora-Zeitschalter-Sensor kein Zeitschalter.
m = H.model(st('light.c', 'off', { supported_color_modes: ['color_temp'] }), { timers: {} });
assert.deepEqual(m.quick.map((q) => q.label), ['Helligkeit'], 'aus: keine Lichtfarbe');
m = H.model(st('light.b', 'off', { supported_color_modes: ['onoff'] }), { timers: {} });
assert.equal(m.main.t, 'Einschalten');
assert.equal(m.quick.length, 0);
assert.equal(m.timer.label, 'Einschalten für');
assert.equal(H.model(st('light.b', 'off', {}), { timers: null }).timer, null);
assert.equal(keys(m), 'popup,history', 'ohne Gerät/Admin nur Details und Verlauf');

// Laufender Zeitschalter: „Aus um hh:mm“ mit Abbrechen.
m = H.model(st('switch.c', 'on'), { timers: { 'switch.c': { at: '2026-10-15T19:30:00Z', action: 'turn_off' } } });
assert.equal(m.timer.active, true);
assert.equal(m.timer.word, 'Aus um');
assert.match(m.timer.time, /^\d\d:\d\d$/);

// Jalousie: Öffnen (zu), Auf/Stopp/Zu, Position 50 %.
m = H.model(st('cover.d', 'closed', { supported_features: 15, current_position: 50 }), { timers: {} });
assert.equal(m.main.t, 'Öffnen');
assert.deepEqual(m.quick[0].items.map((x) => x.t), ['Auf', 'Stopp', 'Zu']);
assert.equal(m.quick[1].items[1].on, true);
assert.equal(m.timer, null, 'kein Zeitschalter für Jalousien');

// Thermostat: Ausschalten, Zieltemperatur in Schritten und Grenzen.
m = H.model(st('climate.e', 'heat', { supported_features: 384, temperature: 21, min_temp: 7, max_temp: 21.5 }), { timers: {} });
assert.equal(m.main.t, 'Ausschalten');
assert.equal(m.quick[0].kind, 'step');
assert.equal(H.stepTo(m.quick[0], 1), 21.5);
assert.equal(H.stepTo({ value: 21.5, step: 0.5, max: 21.5 }, 1), 21.5);
assert.equal(H.stepTo({ value: 7, step: 0.5, min: 7 }, -1), 7);
assert.equal(H.model(st('climate.e', 'heat', { temperature: 21 }), { pendingTemp: 23 }).quick[0].value, 23, 'gesammelte Tipps gehen beim Neuzeichnen nicht verloren');
// Ohne TURN_ON/TURN_OFF: über den Betriebsmodus; ohne Aus-Fähigkeit kein Zeitschalter.
m = H.model(st('climate.k', 'off', { hvac_modes: ['off', 'heat'] }), { timers: {} });
assert.equal(m.main.svc, 'climate.set_hvac_mode'); assert.equal(m.main.data.hvac_mode, 'heat');
assert.equal(H.model(st('climate.k', 'heat', { hvac_modes: ['off', 'heat'] }), { timers: {} }).main.data.hvac_mode, 'off');
assert.equal(H.model(st('climate.k', 'heat', { hvac_modes: ['off', 'heat'] }), { timers: {} }).timer, null);
// Nur angebotene Fähigkeiten: Sauger ohne START, Player ohne PAUSE, Jalousie nur kippbar.
assert.equal(H.model(st('vacuum.v', 'docked', { supported_features: 0 }), {}).main, null);
assert.equal(H.model(st('vacuum.v', 'docked', { supported_features: 8192 }), {}).main.t, 'Starten');
assert.equal(H.model(st('media_player.x', 'playing', { supported_features: 0 }), {}).main, null);
assert.equal(H.model(st('cover.t', 'closed', { supported_features: 128 }), {}).main, null);

// Schloss: Entriegeln, „Tür öffnen“ mit Rückfrage; kein Zeitschalter.
m = H.model(st('lock.f', 'locked', { supported_features: 1 }), { timers: {} });
assert.equal(m.main.t, 'Entriegeln');
assert.ok(m.main.ask, 'Entriegeln fragt immer');
assert.equal(m.quick.length, 0);
assert.equal(m.acts[0].t, 'Tür öffnen'); assert.ok(m.acts[0].ask, 'Tür öffnen abgesetzt und mit Rückfrage');
assert.equal(H.model(st('lock.f', 'unlocked', {}), {}).main.ask, undefined, 'Verriegeln ohne Rückfrage');
assert.equal(m.timer, null);

// Medien: Pausieren, Tasten nach Fähigkeiten; Zeitschalter nur mit turn_off-Fähigkeit.
m = H.model(st('media_player.g', 'playing', { supported_features: 1 | 16 | 32 | 1024 }), { timers: {} });
assert.equal(m.main.t, 'Pausieren');
assert.deepEqual(m.quick[0].items.map((x) => x.t), ['Zurück', 'Leiser', 'Lauter', 'Weiter']);
assert.equal(m.timer, null);
assert.equal(H.model(st('media_player.g', 'playing', { supported_features: 256 }), { timers: {} }).timer.label, 'Ausschalten in');

// Nicht erreichbar / reiner Sensor: nur die Wege.
m = H.model(st('light.h', 'unavailable'), { timers: {}, device: true });
assert.equal(m.main, null); assert.equal(m.quick.length, 0); assert.equal(m.timer, null);
m = H.model(st('sensor.i', '21.5'), { timers: {} });
assert.equal(m.main, null); assert.equal(keys(m), 'popup,history');
assert.equal(H.worth(m), true, 'Info-Kachel: Menü mit den Wegen');
m = H.model(st('sensor.i', '21.5'), { tapPopup: true, admin: true });
assert.equal(m.main.t, 'Öffnen'); assert.ok(m.main.open, 'Info-Kachel: oben Öffnen wie Tippen');
assert.equal(H.model(st('sensor.e', '400'), { tapPopup: true, kind: 'energy' }).acts[0].path, '/energy');
assert.equal(H.model(st('sensor.u', '2'), { tapPopup: true, kind: 'updates', admin: false }).acts.length, 0, 'Alle Updates nur für Admins');
assert.deepEqual(H.model(st('sensor.u', '2'), { tapPopup: true, kind: 'updates', admin: true, updCheck: true }).acts.map((x) => x.t), ['Nach Updates suchen', 'Alle Updates']);
m = H.model(null, { tapPopup: true, admin: true });
assert.equal(m.main.t, 'Öffnen'); assert.equal(keys(m), 'edit', 'Kachel ohne Gerät: Öffnen und Bearbeiten');
assert.equal(H.worth(H.model(null, {})), false, 'ohne Gerät, ohne Popup, kein Admin: nichts');

// 3D-Drucker: Pause während des Drucks, Fortsetzen pausiert, Licht, Kamera live – nur vorhandene Entitäten.
const S = { 'button.p_pause': st('button.p_pause', 'unknown'), 'button.p_resume': st('button.p_resume', 'unknown'),
  'light.p_light': st('light.p_light', 'on'), 'camera.p_cam': st('camera.p_cam', 'idle'), 'sensor.p_stage': st('sensor.p_stage', 'running') };
const PR = { st: 'sensor.p_stage', pause: 'button.p_pause', resume: 'button.p_resume', light: 'light.p_light', cam: 'camera.p_cam' };
m = H.model(st('sensor.p_stage', 'running'), { printer: PR, states: S });
assert.deepEqual(m.quick[0].items.map((x) => x.t), ['Pause', 'Licht aus']);
assert.equal(m.quick[0].items[0].entity, 'button.p_pause');
assert.equal(m.quick[0].items[1].on, true);
assert.equal(m.acts[0].t, 'Kamera live');
S['sensor.p_stage'] = st('sensor.p_stage', 'pause');
assert.equal(H.model(st('sensor.p_stage', 'pause'), { printer: PR, states: S }).quick[0].items[0].t, 'Fortsetzen');
assert.equal(H.model(st('sensor.p_stage', 'idle'), { printer: { st: 'sensor.p_stage' }, states: S, tapPopup: true }).main.t, 'Öffnen', 'Drucker ohne Tasten: Öffnen');

// Aquarium: Licht des Beckens; Kamera: Live ansehen ohne Verlauf; Befeuchter: Zielfeuchte; Ventilator: Auto.
m = H.model(st('sensor.aq', 'ok'), { aqLight: 'light.aq', states: { 'light.aq': st('light.aq', 'off') } });
assert.equal(m.quick[0].items[0].entity, 'light.aq'); assert.equal(H.worth(m), true);
m = H.model(st('camera.c', 'idle'), {});
assert.equal(m.acts[0].key, 'live'); assert.equal(keys(m), 'popup');
m = H.model(st('humidifier.h', 'on', { humidity: 50, min_humidity: 30, max_humidity: 80 }), {});
assert.equal(m.quick[0].label, 'Zielfeuchte'); assert.equal(m.quick[0].items[1].on, true);
m = H.model(st('fan.f', 'on', { supported_features: 9, percentage: 33, preset_modes: ['Auto', 'Sleep'], preset_mode: 'Auto' }), {});
assert.deepEqual(m.quick[0].items.map((x) => x.t), ['33 %', '66 %', '100 %', 'Auto']);
assert.equal(m.quick[0].items[3].on, true); assert.equal(m.quick[0].items[0].on, false);

// Nur Halten, das bisher ein Popup/HAs Dialog war, wird zum Menü.
assert.equal(H.wants({ hold_action: { action: 'more-info' } }), true);
assert.equal(H.wants({ hold_action: { action: 'fire-dom-event' } }), true);
assert.equal(H.wants({ hold_action: { action: 'none' } }), false);
assert.equal(H.wants({ hold_action: { action: 'toggle' } }), false);
assert.equal(H.via({ hold_action: { action: 'toggle' }, tap_action: { action: "[[[ return window.casoraPopupAction ? window.casoraPopupAction() : 'more-info'; ]]]" } }), 'tap', 'Jalousie: Halten schaltete, Tippen öffnet das Popup');
assert.equal(H.via({ hold_action: { action: 'more-info' } }), 'hold');
assert.equal(H.wants({ hold_action: { action: "[[[\nreturn window.casoraPopupAction ? window.casoraPopupAction() : 'more-info';\n]]]\n" } }), true);
assert.equal(H.wants({ hold_action: { action: "[[[ return 'call-service' ]]]" } }), false);
assert.equal(H.wants({ hold_action: { action: "[[[ return window.casoraPopup && window.casoraPopup.enabled && window.CASORA_HOLD_MENU !== false ? 'more-info' : 'none'; ]]]" } }), true, 'neue Halten-Aktion der Info-Vorlagen');
assert.equal(H.wants({ hold_action: { action: 'call-service', service: 'script.turn_on' } }), false, 'Licht-Badge: Smart-Toggle bleibt');
// Alarm: unscharf → Scharf-Tasten je Modus mit Rückfrage (Code verdeckt, wenn verlangt); scharf → Unscharf als Hauptaktion.
m = H.model(st('alarm_control_panel.a', 'disarmed', { supported_features: 3, code_format: 'number', code_arm_required: false }), { timers: {} });
assert.equal(m.main, null);
assert.deepEqual(m.quick[0].items.map((x) => x.t), ['Zuhause', 'Abwesend']);
assert.ok(m.quick[0].items.every((x) => x.ask && !x.code), 'Scharf mit Rückfrage, ohne Code wenn code_arm_required false');
assert.equal(m.timer, null); assert.equal(H.worth(m), true);
m = H.model(st('alarm_control_panel.a', 'armed_away', { supported_features: 3, code_format: 'number' }), {});
assert.equal(m.main.svc, 'alarm_control_panel.alarm_disarm'); assert.ok(m.main.ask && m.main.code && m.main.numeric);
assert.equal(H.model(st('alarm_control_panel.a', 'triggered', {}), {}).main.t, 'Alarm beenden');
// Zusatz-Einträge der Info-Kacheln (nur, was Casora schon kann; rohe [[[ ]]]-Variablen werden übergangen).
const hx = { states: { 'switch.lampe': st('switch.lampe', 'off'), 'sensor.casora_rezept_der_woche': st('sensor.casora_rezept_der_woche', 'ok', { zutaten: ['Mehl'], status: 'done', link: 'https://cookidoo.de/x' }) } };
let ex = H.extras(hx, '', 'casora_entity_actions', { action_1_action: 'toggle', action_1_entity: 'switch.lampe', action_1_label: 'Lampe',
  action_2_action: 'call-service', action_2_service: 'script.turn_on', action_2_service_data: { entity_id: 'script.x' }, action_2_label: 'Skript',
  action_3_action: '[[[ return 1 ]]]', action_3_entity: 'switch.lampe' });
assert.deepEqual(ex.map((x) => [x.t, x.svc]), [['Lampe', 'homeassistant.toggle'], ['Skript', 'script.turn_on']]);
assert.equal(ex[1].noEntity, true);
window.casoraSvc = (n) => ({ domain: 'casora', service: 'rezept_auf_liste', data: {} });
ex = H.extras(hx, 'sensor.casora_rezept_der_woche', 'casora_recipe', {});
assert.deepEqual(ex.map((x) => x.t), ['Auf die Einkaufsliste', 'Rezept öffnen']);
m = H.model(st('sensor.casora_rezept_der_woche', 'ok'), { tapPopup: true, extra: ex });
assert.equal(m.main.t, 'Öffnen', 'Öffnen bleibt oben, auch mit Zusatz-Einträgen');
assert.equal(m.acts.length, 2);
console.log('halten: ok');
