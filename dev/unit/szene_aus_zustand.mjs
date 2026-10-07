// „Aktuellen Zustand als Szene speichern“ (Studio, casora-panel-b-plus.js): welche Attribute je
// Domäne in die Szene kommen (nur, was HAs Szenen wiederherstellen), wie der Zustand lesbar
// heißt („60 %, warm“), welche Geräte eines Bereichs angeboten werden und wie die Konfiguration
// für config/scene/config/<id> aussieht.
//   node dev/unit/szene_aus_zustand.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-plus.js', import.meta.url), 'utf8');
new Function(src)();
const S = window.casoraSceneFromState;
assert.ok(S, 'casoraSceneFromState fehlt');

const st = (entity_id, state, attributes = {}) => ({ entity_id, state, attributes });
const DE = { Off: 'Aus', On: 'An', warm: 'warm', cool: 'kühl', neutral: 'neutral', blue: 'blau', Open: 'Offen',
  Closed: 'Geschlossen', Heat: 'Heizen', Playing: 'Läuft', Volume: 'Lautstärke', Locked: 'Verriegelt', Unavailable: 'Nicht verfügbar' };
const t = (x) => DE[x] || x;

// Licht an, Farbtemperatur: Helligkeit + Kelvin, keine fremden Farbattribute, kein friendly_name.
const warm = st('light.decke', 'on', { brightness: 153, color_mode: 'color_temp', color_temp_kelvin: 2700,
  hs_color: [30, 60], rgb_color: [255, 180, 100], xy_color: [0.5, 0.4], friendly_name: 'Decke', supported_color_modes: ['color_temp'] });
assert.deepEqual(S.sceneState(warm), { state: 'on', brightness: 153, color_mode: 'color_temp', color_temp_kelvin: 2700 });
assert.equal(S.describe(warm, t, 'de'), '60 %, warm');

// Licht farbig (hs): nur hs_color; Effekt „none“ fällt weg.
const blau = st('light.band', 'on', { brightness: 255, color_mode: 'hs', hs_color: [230, 80], effect: 'none', rgb_color: [0, 0, 255] });
assert.deepEqual(S.sceneState(blau), { state: 'on', brightness: 255, color_mode: 'hs', hs_color: [230, 80] });
assert.equal(S.describe(blau, t, 'de'), '100 %, blau');
// Weißes Licht im Farbmodus (Sättigung 0, Farbton 0) heißt „weiß“, nicht „rot“ (Nutzertest 6).
assert.equal(S.describe(st('light.lese', 'on', { brightness: 77, color_mode: 'hs', hs_color: [0, 0] }), (x) => (x === 'white' ? 'weiß' : t(x)), 'de'), '30 %, weiß');
assert.equal(S.describe(st('light.rot', 'on', { brightness: 255, color_mode: 'hs', hs_color: [0, 90] }), (x) => (x === 'red' ? 'rot' : t(x)), 'de'), '100 %, rot');

// Licht aus: nur der Zustand.
assert.deepEqual(S.sceneState(st('light.nachtlicht', 'off', { brightness: null, color_mode: null })), { state: 'off' });
assert.equal(S.describe(st('light.nachtlicht', 'off'), t, 'de'), 'Aus');

// Rollladen: Position und Neigung; „opening“ wird zu „open“.
assert.deepEqual(S.sceneState(st('cover.jalousie', 'opening', { current_position: 40, current_tilt_position: 10, device_class: 'blind' })),
  { state: 'open', current_position: 40, current_tilt_position: 10 });
assert.equal(S.describe(st('cover.jalousie', 'open', { current_position: 40 }), t, 'de'), 'Offen 40 %');
assert.equal(S.describe(st('cover.jalousie', 'closed', { current_position: 0 }), t, 'de'), 'Geschlossen');

// Thermostat: Modus als Zustand, Solltemperatur und Voreinstellung; Ist-Temperatur nicht.
const heiz = st('climate.wz', 'heat', { temperature: 21.5, current_temperature: 19.2, preset_mode: 'comfort', hvac_modes: ['off', 'heat'] });
assert.deepEqual(S.sceneState(heiz), { state: 'heat', temperature: 21.5, preset_mode: 'comfort' });
assert.equal(S.describe(heiz, t, 'de', '°C'), 'Heizen 21,5 °C');

// Medien: Lautstärke und Quelle, aber nicht der Titel; aus = nur aus.
const tv = st('media_player.tv', 'playing', { volume_level: 0.3, is_volume_muted: false, source: 'HDMI 1', media_title: 'Film' });
assert.deepEqual(S.sceneState(tv), { state: 'playing', volume_level: 0.3, is_volume_muted: false, source: 'HDMI 1' });
assert.equal(S.describe(tv, t, 'de'), 'Läuft, Lautstärke 30 %');
assert.deepEqual(S.sceneState(st('media_player.tv', 'off', { volume_level: 0.3 })), { state: 'off' });

// Lüfter, Schalter, Schloss; Nicht verfügbares und fremde Domänen gar nicht.
assert.deepEqual(S.sceneState(st('fan.luft', 'on', { percentage: 50, preset_mode: null })), { state: 'on', percentage: 50 });
assert.deepEqual(S.sceneState(st('switch.steckdose', 'on')), { state: 'on' });
assert.equal(S.describe(st('lock.tuer', 'locked'), t, 'de'), 'Verriegelt');
assert.equal(S.sceneState(st('light.weg', 'unavailable')), null);
assert.equal(S.sceneState(st('sensor.temp', '21')), null);
assert.equal(S.sceneState(st('lock.tuer', 'jammed')), null);

// Geräte eines Bereichs: über die Entität oder ihr Gerät, ohne verborgene, Konfig-Entitäten und
// Nicht-Verfügbares; nach Anzeigename („Decke“ vor „light.band“), Licht vor Rollladen vor Medien vor Schalter vor Schloss.
const hass = {
  states: Object.fromEntries([warm, blau, st('cover.jalousie', 'open', { current_position: 100 }), tv,
    st('switch.steckdose', 'on'), st('switch.kindersicherung', 'off'), st('lock.tuer', 'locked'),
    st('light.verborgen', 'on'), st('light.weg', 'unavailable'), st('light.kueche', 'on')].map((s) => [s.entity_id, s])),
  entities: {
    'light.decke': { area_id: 'wz' }, 'light.band': { device_id: 'd1' }, 'cover.jalousie': { area_id: 'wz' },
    'media_player.tv': { area_id: 'wz' }, 'switch.steckdose': { area_id: 'wz' }, 'switch.kindersicherung': { area_id: 'wz', entity_category: 'config' },
    'lock.tuer': { area_id: 'wz' }, 'light.verborgen': { area_id: 'wz', hidden: true }, 'light.weg': { area_id: 'wz' },
    'light.kueche': { area_id: 'ku' },
  },
  devices: { d1: { area_id: 'wz' } },
};
assert.deepEqual(S.areaEntities(hass, 'wz'),
  ['light.decke', 'light.band', 'cover.jalousie', 'media_player.tv', 'switch.steckdose', 'lock.tuer']);
assert.deepEqual(S.areaEntities(hass, null), []);
// Schloss nicht von selbst angehakt.
assert.equal(S.checkedByDefault('lock.tuer'), false);
assert.equal(S.checkedByDefault('light.decke'), true);

// Konfiguration wie HAs Szenen-Editor: id, Name, entities mit Zustand + Attributen, metadata.
const cfg = S.buildScene('  Filmabend ', ['light.decke', 'cover.jalousie', 'light.weg'], hass.states, { id: '1700000000000' });
assert.deepEqual(cfg, {
  id: '1700000000000', name: 'Filmabend', metadata: {},
  entities: {
    'light.decke': { state: 'on', brightness: 153, color_mode: 'color_temp', color_temp_kelvin: 2700 },
    'cover.jalousie': { state: 'open', current_position: 100 },
  },
});
assert.match(S.buildScene('X', [], {}).id, /^\d{10,}$/);

// Nutzertest 2 (T2): Vorauswahl nur Lichter; ohne Licht wie bisher (ohne Schloss/Ventil).
assert.deepEqual(S.defaultChecked(['light.a', 'cover.j', 'climate.h', 'light.b']), ['light.a', 'light.b']);
assert.deepEqual(S.defaultChecked(['cover.j', 'lock.t', 'media_player.m']), ['cover.j', 'media_player.m']);
// Licht im Dialog einstellbar (Regler), und ohne „scene: !include scenes.yaml“ eine klare Meldung statt „gespeichert“.
assert.ok(src.includes('const lightControls = (self, id, after) =>') && src.includes('brightness_pct: v') && src.includes('color_temp_kelvin: v'), 'Regler im Dialog');
assert.ok(/if \(!id\) \{[\s\S]{0,400}tr\("Home Assistant did not load the scene"\)[\s\S]{0,80}kind: "err"/.test(src), 'Fehlermeldung ohne geladene Szene');

console.log('ok szene_aus_zustand');
