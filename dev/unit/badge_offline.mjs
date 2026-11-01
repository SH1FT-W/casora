// Sub-badges whose sensor is unavailable/unknown (owner, 01.11.2026): not hidden, but muted with the icon of their kind
// (no „?“) and the word „Offline“. Prod: the energy sub-badge „Netz“ vanished with an unavailable grid sensor, a
// security slot read „Nicht verfügbar“ with a „?“.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
window.casoraEsc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.casoraIconUrl = (n) => 'icon:' + n;
const basis = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/01-basis.js', import.meta.url), 'utf8');
new Function(basis.slice(basis.indexOf('window.casoraBadgeOffline = ')))();
assert.equal(typeof window.casoraBadgeOfflineName, 'function', 'helpers loaded');

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const run = (code, entity, variables = {}) => {
  const body = String(code).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const hass = { config: { unit_system: { temperature: '°C' }, currency: 'EUR' }, locale: { language: 'de' }, formatEntityState: () => '' };
  return new Function('entity', 'states', 'hass', 'variables', 'user', body)(entity, { [entity.entity_id]: entity }, hass, variables, {});
};
const cardStyle = (tpl, key) => (T[tpl].styles.card.find((o) => o[key] !== undefined) || {})[key];

const CASES = [
  ['casora_badge_energy', 'sensor.grid_power', { label: 'Netz' }, 'Netz', '--casora-badge-icon-color'],
  ['casora_badge_temp', 'sensor.room_temperature', {}, 'Temperatur', '--casora-icon-color'],
  ['casora_badge_humidity', 'sensor.room_humidity', {}, 'Luftfeuchtigkeit', '--casora-icon-color'],
  ['casora_badge_air_quality', 'sensor.room_air_quality', {}, 'Luftqualität', '--casora-icon-color'],
  ['casora_badge_cover', 'cover.room_blinds', {}, 'Jalousien', '--casora-badge-icon-color'],
  ['casora_badge_light', 'light.desk', {}, 'Desk', null],
  ['casora_badge_presence', 'person.someone', {}, 'Someone', null],
  ['casora_badge_security', 'binary_sensor.front_door', {}, 'Front door', '--casora-badge-icon-color'],
];
for (const state of ['unavailable', 'unknown']) {
  for (const [tpl, id, vars, title, colorKey] of CASES) {
    const e = { entity_id: id, state, attributes: { friendly_name: title } };
    const v = Object.assign({ enabled: true }, T[tpl].variables || {}, vars);
    assert.notEqual(run(cardStyle(tpl, 'display'), e, v), 'none', `${tpl} (${state}): shown, not hidden`);
    if (T[tpl].extra_styles) assert.ok(!/display:none/.test(run(T[tpl].extra_styles, e, v).replace(/\s/g, '')), `${tpl} (${state}): host not hidden`);
    const name = run(T[tpl].name, e, v);
    assert.ok(/>Offline</.test(name), `${tpl} (${state}): says „Offline“ – got ${name.replace(/\s+/g, ' ').trim()}`);
    assert.ok(!/Nicht verfügbar|Unbekannt/.test(name), `${tpl} (${state}): no „Nicht verfügbar“/„Unbekannt“`);
    if (colorKey) assert.equal(run(cardStyle(tpl, colorKey), e, v), window.casoraBadgeOfflineColor, `${tpl} (${state}): muted icon`);
  }
  // Security slot and contact group: the kind's glyph, never the „?“ (casoraIconUrl('default')).
  for (const [tpl, id, dc, glyph] of [['casora_badge_security', 'binary_sensor.front_door', 'door', 'door-closed'],
    ['casora_badge_security', 'lock.front', '', 'lock-fill'], ['casora_badge_contact_group', 'binary_sensor.front_door', 'door', 'door-closed']]) {
    const e = { entity_id: id, state, attributes: { friendly_name: 'Front', device_class: dc } };
    const css = run(T[tpl].extra_styles, e, { enabled: true });
    assert.ok(!css.includes('icon:default'), `${tpl} ${id} (${state}): no „?“ glyph`);
    assert.ok(css.includes('icon:' + glyph), `${tpl} ${id} (${state}): ${glyph}`);
  }
}
// Still hidden: no entity, or switched off in the Studio.
for (const [tpl] of CASES) {
  assert.equal(run(cardStyle(tpl, 'display'), { entity_id: undefined, state: undefined, attributes: {} }, Object.assign({}, T[tpl].variables, { enabled: true })), 'none', `${tpl}: no entity stays hidden`);
}
// A live value is unchanged (no „Offline“).
assert.ok(!/Offline/.test(run(T.casora_badge_energy.name, { entity_id: 'sensor.grid_power', state: '513', attributes: { unit_of_measurement: 'W' } }, { label: 'Netz' })), 'live energy value');
console.log('badge_offline: ok');
