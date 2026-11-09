// Kamera „Status von: …“ (07.10.2026, 1.1.1): Ein Bild über einen Proxy (go2rtc, Frigate, Scrypted,
// ONVIF-Proxy) meldet „bereit“, obwohl die Kamera dahinter weg ist. Je Kamera-Kachel lässt sich eine
// zweite Entität wählen, die sagt, ob die Kamera erreichbar ist (casora-core.js casoraCamOffline).
// Prüft mit erfundenen IDs: (1) ohne Einstellung nie offline (bisheriges Verhalten), (2) andere Kamera
// unavailable/unknown → offline, „idle“ → nicht, (3) Verbindungssensor off → offline, on → nicht,
// (4) Status-Entität fehlt → nicht offline (kein Raten), (5) Zuordnung aus den Kacheln des offenen
// Dashboards (auch in „conditional“), (6) Vorlagen und Sicherheits-Stufe fragen den Helfer.
//   node dev/unit/kamera_status_von.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const core = fs.readFileSync(new URL('custom_components/casora/scripts/casora-core.js', root), 'utf8');
const a = core.indexOf('// casora-cam-status:start'), b = core.indexOf('// casora-cam-status:end');
assert.ok(a > 0 && b > a, 'Block casora-cam-status gefunden');

const states = {
  'camera.proxy_flur': { state: 'idle' },
  'camera.echt_flur': { state: 'unavailable' },
  'camera.proxy_garten': { state: 'idle' },
  'camera.echt_garten': { state: 'idle' },
  'camera.proxy_hof': { state: 'idle' },
  'binary_sensor.hof_verbunden': { state: 'off', attributes: { device_class: 'connectivity' } },
  'camera.proxy_keller': { state: 'idle' },
  'binary_sensor.keller_verbunden': { state: 'on', attributes: { device_class: 'connectivity' } },
};
const config = { views: [
  { cards: [{ type: 'custom:casora-smart-row', cards: [
    { type: 'custom:button-card', template: 'casora_camera', entity: 'camera.proxy_flur', variables: { status_entity: 'camera.echt_flur' } },
    { type: 'conditional', conditions: [], card: { type: 'custom:button-card', template: 'casora_camera', entity: 'camera.proxy_hof', variables: { status_entity: 'binary_sensor.hof_verbunden' } } },
  ] }] },
  { cards: [{ type: 'custom:button-card', template: 'casora_camera', entity: 'camera.proxy_garten' }] },
] };
const panel = { isConnected: true, lovelace: { config } };
const res = { querySelector: (q) => (q === 'ha-panel-lovelace' ? panel : null) };
const main = { shadowRoot: { querySelector: (q) => (q === 'partial-panel-resolver' ? res : null) } };
const ha = { hass: { states }, shadowRoot: { querySelector: (q) => (q === 'home-assistant-main' ? main : null) } };
const window = {};
const document = { querySelector: (q) => (q === 'home-assistant' ? ha : null) };
new Function('window', 'document', core.slice(a, b))(window, document);
const off = window.casoraCamOffline;

// (1) ohne Einstellung
assert.equal(off('camera.proxy_garten', states), false, 'ohne Status-Entität nie offline');
assert.equal(off('camera.echt_flur', states, {}), false, 'eigene Kamera ohne Einstellung: bisherige Regel bleibt beim Aufrufer');
// (2) andere Kamera als Status, aus der Kachel selbst
assert.equal(off('camera.proxy_garten', states, { status_entity: 'camera.echt_flur' }), true, 'Status-Kamera unavailable → offline');
assert.equal(off('camera.proxy_garten', states, { status_entity: 'camera.echt_garten' }), false, 'Status-Kamera idle → online');
assert.equal(off('camera.proxy_garten', { ...states, 'camera.echt_garten': { state: 'unknown' } }, { status_entity: 'camera.echt_garten' }), true, 'unknown → offline');
// (3) Verbindungssensor
assert.equal(off('camera.proxy_keller', states, { status_entity: 'binary_sensor.keller_verbunden' }), false, 'verbunden → online');
assert.equal(off('camera.proxy_keller', { ...states, 'binary_sensor.keller_verbunden': { state: 'off' } }, { status_entity: 'binary_sensor.keller_verbunden' }), true, 'getrennt → offline');
// (4) fehlende Status-Entität
assert.equal(off('camera.proxy_garten', states, { status_entity: 'camera.gibt_es_nicht' }), false, 'fehlende Status-Entität → kein Raten');
// (5) Zuordnung aus dem Dashboard (Badges kennen die Kachel nicht)
assert.equal(off('camera.proxy_flur', states), true, 'Kachel im Dashboard: Status-Kamera unavailable');
assert.equal(off('camera.proxy_hof', states), true, 'Kachel in conditional: Verbindungssensor off');
assert.equal(off('camera.proxy_flur'), true, 'ohne states: liest hass.states');
assert.equal(window.casoraCamStatusOf('camera.proxy_hof'), 'binary_sensor.hof_verbunden', 'Zuordnung gefunden');
// Studio-Vorschau: ungespeicherte Zuordnung geht vor, leere Liste heißt „keine“
assert.equal(off('camera.proxy_garten', states, { casora_camera_status: { 'camera.proxy_garten': 'camera.echt_flur' } }), true, 'Vorschau-Zuordnung');
assert.equal(off('camera.proxy_flur', states, { casora_camera_status: {} }), false, 'Vorschau ohne Zuordnung');

// (6) Aufrufer
const tpl = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root), 'utf8'));
const has = (k, re) => re.test(JSON.stringify(tpl[k]));
assert.ok(has('casora_camera', /casoraCamOffline\?\.\(entity\?\.entity_id, states, variables\)\) return \\"Offline\\"/), 'Kachel: „Offline“');
assert.ok(has('casora_badge_security_group', /casoraCamOffline\?\.\(id, states\)\) r\.camDead\+\+/), 'Sicherheits-Badge: „Kamera offline“');
assert.ok(has('casora_badge_camera_group', /casoraCamOffline/), 'Kamera-Badge');
assert.ok(has('casora_popup_camera', /casoraCamOffline/), 'Kamera-Popup');
const finden = fs.readFileSync(new URL('custom_components/casora/scripts/local/00-finder.js', root), 'utf8');
assert.ok(/dom === 'camera' && !!\(window\.casoraCamOffline && window\.casoraCamOffline\(id, S\)\)/.test(finden), 'Sicherheits-Stufe (Farben)');
const types = fs.readFileSync(new URL('custom_components/casora/panel/casora-panel-types.js', root), 'utf8');
assert.ok(/key: "status_entity", label: "Status from", domains: \["camera", "binary_sensor"\]/.test(types), 'Studio-Feld „Status from“');
// The Studio preview has its own copy of the rule: a freshly opened Studio has not loaded casora-core.js.
const panelSrc = fs.readFileSync(new URL('custom_components/casora/panel/casora-panel.js', root), 'utf8');
const copy = panelSrc.match(/const camOffline = (\(id, states, map\) => \{[\s\S]*?\n\});?\n/);
assert.ok(copy, 'Studio: camOffline found');
assert.ok(!/window\.casoraCamOffline/.test(copy[1]), 'Studio: the copy does not need casora-core.js');
const studioOff = new Function('return ' + copy[1])();
for (const [cam, sid, st] of [['camera.a', 'camera.b', 'idle'], ['camera.a', 'camera.b', 'unavailable'], ['camera.a', 'camera.b', 'unknown'], ['camera.a', 'camera.b', ''],
  ['camera.a', 'binary_sensor.b', 'on'], ['camera.a', 'binary_sensor.b', 'off'], ['camera.a', 'binary_sensor.b', 'unavailable'], ['camera.a', 'sensor.b', 'off']]) {
  const S = { [sid]: { state: st } };
  assert.equal(studioOff(cam, S, { [cam]: sid }), off(cam, S, { casora_camera_status: { [cam]: sid } }), `Studio = dashboard: ${sid} ${st}`);
}
assert.equal(studioOff('camera.a', {}, { 'camera.a': 'camera.b' }), false, 'Studio: missing status entity is not offline');
assert.equal(studioOff('camera.a', { 'camera.b': { state: 'unavailable' } }, {}), false, 'Studio: no setting, never offline');

console.log('ok – Kamera „Status von“: Kachel, Badges, Popup, Sicherheits-Stufe; ohne Einstellung unverändert');
