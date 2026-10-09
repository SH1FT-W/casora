// Aquarium 1.1.2: Bedeutung des Zeitplan-Schalters, Farbkanäle der Beckenlampe, Soll-Bereich der
// Temperatur, Statussensor auch englisch, Temperatur auf der Kachel.  node dev/unit/aquarium_licht.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/02-geraete.js', import.meta.url), 'utf8');
const a = src.indexOf('(function () {\n  if (window._casoraAqParts) return;');
const b = src.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'Aquarium-Teile-Block nicht gefunden');
const window = { casoraLocale: () => 'de-DE' };
new Function('window', src.slice(a, b + 6))(window);
const W = window;

// 1) Zeitplan-Schalter: HeliaLux „manuelle Farbsimulation“ = an heißt HA; Chihiros auto_mode / Juwel „Automatik“ = Lampe.
{
  const hass = (id, tk, name) => ({ entities: { [id]: { entity_id: id, translation_key: tk } },
    states: { [id]: { entity_id: id, state: 'on', attributes: { friendly_name: name } } } });
  const m = (id, tk, name, V) => W._casoraAqSwitchMeaning(id, V || {}, hass(id, tk, name));
  assert.equal(m('switch.becken_manual_color_simulation', 'manual_color_simulation', 'Becken Manuelle Farbsimulation'), 'ha');
  assert.equal(m('switch.lampe_x', 'auto_mode', 'Lampe Auto-Modus'), 'lamp');
  assert.equal(m('switch.juwel_automatik', null, 'Juwel Automatik'), 'lamp');
  assert.equal(m('switch.lampe_programm', null, 'Lampe Tagesprogramm'), 'lamp');
  assert.equal(m('switch.irgendwas', null, 'Irgendwas'), 'ha', 'im Zweifel wie bisher: an = HA');
  // Studio-Wahl geht vor.
  assert.equal(m('switch.lampe_x', 'auto_mode', 'Auto', { light_schedule_on: 'ha' }), 'ha');
  assert.equal(m('switch.becken_manual_color_simulation', 'manual_color_simulation', 'x', { light_schedule_on: 'lamp' }), 'lamp');
  assert.equal(W._casoraAqSwitchMeaning(null, {}, null), 'ha');
}

// 2) Farbwörter: Kanalnamen und -farben aus translation_key / Entitäts-ID / Name.
{
  const c = (t) => (W._casoraAqChannelOf(t) || {}).name || null;
  assert.equal(c('channel_red'), 'Rot');
  assert.equal(c('lampe kanal grün'), 'Grün');
  assert.equal(c('royal_blue'), 'Aktinisch');
  assert.equal(c('cold white'), 'Kaltweiß');
  assert.equal(c('number.lampe_kanal_w'), 'Weiß');
  assert.equal(c('number.b_menge_1'), null, 'Dosiermenge ist kein Farbkanal');
  assert.equal(c('number.becken_b_dose'), null, 'einzelnes „b“ mitten im Namen zählt nicht');
}

// 3) Kanäle: number-Entitäten am Gerät der Leuchte (Fluval-Muster) vor den Farben der Leuchte.
{
  const st = (id, state, attrs) => ({ entity_id: id, state: String(state), attributes: attrs || {} });
  const states = {
    'light.l': st('light.l', 'on', { friendly_name: 'Becken Lampe', supported_color_modes: ['rgb'], rgb_color: [255, 0, 51] }),
    'number.l_red': st('number.l_red', 50, { min: 0, max: 100, step: 1, friendly_name: 'Becken Rot' }),
    'number.l_blue': st('number.l_blue', 1000, { min: 0, max: 1000, step: 10, friendly_name: 'Becken Blau' }),
    'number.l_menge': st('number.l_menge', 2, { min: 0, max: 10, friendly_name: 'Becken Menge' }),
    'number.fremd_red': st('number.fremd_red', 10, { min: 0, max: 100 }),
  };
  const ent = (id, dev, tk) => ({ entity_id: id, device_id: dev, translation_key: tk || null });
  const hass = { entities: { 'light.l': ent('light.l', 'd1'), 'number.l_red': ent('number.l_red', 'd1', 'red'),
    'number.l_blue': ent('number.l_blue', 'd1', 'blue'), 'number.l_menge': ent('number.l_menge', 'd1'),
    'number.fremd_red': ent('number.fremd_red', 'd2', 'red') } };
  const ch = W._casoraAqChannels('light.l', {}, states, hass);
  assert.deepEqual(ch.map((k) => [k.id, k.name, k.value]), [['number.l_red', 'Rot', 50], ['number.l_blue', 'Blau', 100]]);
  assert.deepEqual(ch[1].svc, { domain: 'number', service: 'set_value', field: 'value', scale: [0, 1000, 10], target: { entity_id: 'number.l_blue' } });
  // Gewählte Kanäle gehen vor (Name ohne Farbwort: Gerätename vorn weg).
  states['number.l_k1'] = st('number.l_k1', 25, { min: 0, max: 100, friendly_name: 'Becken Kanal 1' });
  const pick = W._casoraAqChannels('light.l', { light_channels: ['number.l_k1', 'number.fehlt'] }, states, hass);
  assert.deepEqual(pick.map((k) => [k.name, k.value, k.color]), [['Kanal 1', 25, null]]);
  // Ohne number-Entitäten: Kanäle der Leuchte selbst (rgbw), Regler setzt nur seinen Kanal.
  const h2 = { entities: { 'light.w': ent('light.w', 'd3') } };
  states['light.w'] = st('light.w', 'on', { supported_color_modes: ['rgbw'], rgbw_color: [140, 76, 102, 178] });
  const rgbw = W._casoraAqChannels('light.w', {}, states, h2);
  assert.deepEqual(rgbw.map((k) => [k.name, k.value]), [['Rot', 55], ['Grün', 30], ['Blau', 40], ['Weiß', 70]]);
  assert.equal(rgbw[3].svc.field, 'rgbw_color');
  assert.equal(rgbw[3].svc.channel, 3);
  assert.equal(rgbw[3].svc.size, 4);
  // Nur an/aus: keine Kanäle.
  states['light.o'] = st('light.o', 'on', { supported_color_modes: ['onoff'] });
  assert.deepEqual(W._casoraAqChannels('light.o', {}, states, { entities: {} }), []);
}

// 4) Soll-Bereich: draußen = Prüfen, mehr als 2 °C (3,6 °F) = Alarm; ohne Bereich nichts.
{
  const r = (v, V, u) => W._casoraAqTempRange(v, V, u || '°C');
  assert.deepEqual(r('25.4', { temp_min: 24, temp_max: 26 }), { level: 0, dir: null });
  assert.deepEqual(r('26.5', { temp_min: 24, temp_max: 26 }), { level: 1, dir: 'high' });
  assert.deepEqual(r('28.5', { temp_min: 24, temp_max: 26 }), { level: 2, dir: 'high' });
  assert.deepEqual(r('23', { temp_min: '24' }), { level: 1, dir: 'low' });
  assert.deepEqual(r('80', { temp_max: 78 }, '°F'), { level: 1, dir: 'high' });
  assert.deepEqual(r('25', {}), { level: 0, dir: null });
  assert.deepEqual(r('unavailable', { temp_min: 24, temp_max: 26 }), { level: 0, dir: null });
}

// 5) Statussensor: deutsch und englisch, binary_sensor an = Problem.
{
  const L = (state, id) => W._casoraAqStatusLevel({ entity_id: id || 'sensor.s', state });
  assert.equal(L('Kritisch'), 2);
  assert.equal(L('critical'), 2);
  assert.equal(L('Warnung'), 1);
  assert.equal(L('warning'), 1);
  assert.equal(L('ok'), 0);
  assert.equal(L('on', 'binary_sensor.p'), 1);
  assert.equal(L('off', 'binary_sensor.p'), 0);
  assert.equal(W._casoraAqStatusLevel(null), 0);
}

// 6) Kachel: Temperatur vorn.
{
  assert.equal(W._casoraAqTileText({ state: '25.43' }, { level: 0, text: 'Alles ok' }), 'Alles ok');
  assert.equal(W._casoraAqTileText({ state: '26.84' }, { level: 1, text: 'Prüfen · Temperatur zu hoch' }), '26,8° · Prüfen · Temperatur zu hoch');
  assert.equal(W._casoraAqTileText({ state: 'unavailable' }, { text: 'Prüfen · Temperaturfühler offline' }), 'Prüfen · Temperaturfühler offline');
}
// 7) Technik aus dem Studio (tech_*) plus ältere devices; Dienst aus der Domain.
{
  const S = { 'climate.heizer': { entity_id: 'climate.heizer', state: 'heat', attributes: { friendly_name: 'Heizer' } },
    'fan.luefter': { entity_id: 'fan.luefter', state: 'off', attributes: { friendly_name: 'Lüfter', icon: 'mdi:fan-auto' } } };
  const d = W._casoraAqDevices({ devices: [{ entity: 'switch.pumpe', label: 'Pumpe', alarm: true }],
    tech_entities: ['switch.pumpe', 'climate.heizer', 'fan.luefter'], tech_names: { 'climate.heizer': 'Heizstab' },
    tech_alarm: { 'climate.heizer': true }, tech_confirm: { 'fan.luefter': true } }, S);
  assert.deepEqual(d.map((x) => [x.entity, x.label, x.icon || null, !!x.alarm, !!x.confirm]), [
    ['switch.pumpe', 'Pumpe', null, true, false],
    ['climate.heizer', 'Heizstab', 'mdi:thermometer', true, false],
    ['fan.luefter', 'Lüfter', 'mdi:fan-auto', false, true]]);
  assert.deepEqual(W._casoraAqTechSvc('climate.heizer', true), { domain: 'climate', service: 'turn_off', target: { entity_id: 'climate.heizer' } });
  assert.deepEqual(W._casoraAqTechSvc('fan.luefter', false).domain, 'fan');
  assert.deepEqual(W._casoraAqTechSvc('valve.x', false).domain, 'homeassistant');
  assert.equal(W._casoraAqTechOn(S['climate.heizer']), true);
  assert.equal(W._casoraAqTechOn(S['fan.luefter']), false);
}
console.log('aquarium_licht: ok');
