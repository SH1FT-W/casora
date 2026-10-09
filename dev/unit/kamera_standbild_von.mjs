// Kamera „Standbild von: …“ (09.10.2026, 1.2.1): Die Kamera-Kachel nimmt ihr Standbild bevorzugt von
// einer Schnappschuss-Entität derselben Kamera (casora-core.js casoraCamStill), das Popup bleibt bei der
// Kamera. Prüft mit erfundenen IDs: (1) ohne Schnappschuss-Entität die Kamera selbst (bisheriges
// Verhalten), (2) Reolink snapshots_main vor snapshots_sub, nur am selben Gerät, nur verfügbar,
// (3) Teleobjektiv/Doppellinse passend, (4) Studio-Feld hat Vorrang, auch image.* einer anderen
// Integration, (5) generisch nur eindeutige translation_keys, nichts geraten (Ring last_recording,
// Frigate-Objektbilder, Streams), (6) Alterstext, (7) Vorlage und Studio-Feld fragen den Helfer.
//   node dev/unit/kamera_standbild_von.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const core = fs.readFileSync(new URL('custom_components/casora/scripts/casora-core.js', root), 'utf8');
const a = core.indexOf('// casora-cam-still:start'), b = core.indexOf('// casora-cam-still:end');
assert.ok(a > 0 && b > a, 'Block casora-cam-still gefunden');
const window = {};
new Function('window', core.slice(a, b))(window);
const still = window.casoraCamStill, age = window.casoraCamAge;

const pic = (id) => ({ state: 'idle', attributes: { entity_picture: `/api/camera_proxy/${id}?token=t` } });
const states = {};
const entities = {};
const add = (id, device_id, platform, translation_key, st) => {
  entities[id] = { entity_id: id, device_id, platform, translation_key };
  states[id] = st === undefined ? pic(id) : st;
};
// Reolink: Hauptkamera mit beiden Schnappschuss-Kameras
add('camera.hof_main', 'dev_hof', 'reolink', 'main');
add('camera.hof_sub', 'dev_hof', 'reolink', 'sub');
add('camera.hof_snap_sub', 'dev_hof', 'reolink', 'snapshots_sub');
add('camera.hof_snap_main', 'dev_hof', 'reolink', 'snapshots_main');
// Reolink: Hochauflösung nicht verfügbar → Standardauflösung
add('camera.flur_main', 'dev_flur', 'reolink', 'main');
add('camera.flur_snap_main', 'dev_flur', 'reolink', 'snapshots_main', { state: 'unavailable', attributes: { entity_picture: '/x' } });
add('camera.flur_snap_sub', 'dev_flur', 'reolink', 'snapshots_sub');
// Reolink Doppellinse + Teleobjektiv
add('camera.duo_main_0', 'dev_duo', 'reolink', 'main_lens_0');
add('camera.duo_main_1', 'dev_duo', 'reolink', 'main_lens_1');
add('camera.duo_snap_0', 'dev_duo', 'reolink', 'snapshots_main_lens_0');
add('camera.duo_snap_1', 'dev_duo', 'reolink', 'snapshots_main_lens_1');
add('camera.zoom_tele', 'dev_zoom', 'reolink', 'telephoto_main');
add('camera.zoom_main', 'dev_zoom', 'reolink', 'main');
add('camera.zoom_snap', 'dev_zoom', 'reolink', 'snapshots_main');
add('camera.zoom_tele_snap', 'dev_zoom', 'reolink', 'telephoto_snapshots_main');
// Schnappschuss an einem anderen Gerät zählt nicht
add('camera.garten_main', 'dev_garten', 'reolink', 'main');
add('camera.fremd_snap', 'dev_fremd', 'reolink', 'snapshots_main');
// Ohne Reolink: Generic Camera, Ring, Frigate, eine Integration mit eindeutigem Schlüssel
add('camera.generisch', 'dev_gen', 'generic', null);
add('image.generisch_bild', 'dev_gen', 'irgendwas', null, { state: '2026-10-09T08:00:00+00:00', attributes: { entity_picture: '/api/image_proxy/x' } });
add('camera.ring_live_view', 'dev_ring', 'ring', 'live_view');
add('camera.ring_last_recording', 'dev_ring', 'ring', 'last_recording');
add('camera.frigate_hof', 'dev_frig', 'frigate', null);
add('image.frigate_hof_person', 'dev_frig', 'frigate', null);
add('camera.ander_live', 'dev_and', 'andere', 'live');
add('camera.ander_stream', 'dev_and', 'andere', 'stream_main');
add('image.ander_snapshot', 'dev_and', 'andere', 'snapshot');
// Kamera ohne Gerät
add('camera.ohne_geraet', null, 'template', null);
const hass = { states, entities };

// (1)/(2)
assert.equal(still('camera.hof_main', hass, {}), 'camera.hof_snap_main', 'snapshots_main bevorzugt');
assert.equal(still('camera.hof_sub', hass, {}), 'camera.hof_snap_main', 'auch für die Sub-Kamera');
assert.equal(still('camera.flur_main', hass, {}), 'camera.flur_snap_sub', 'snapshots_main weg → snapshots_sub');
assert.equal(still('camera.garten_main', hass, {}), 'camera.garten_main', 'fremdes Gerät zählt nicht');
assert.equal(still('camera.ohne_geraet', hass, {}), 'camera.ohne_geraet', 'ohne Gerät die Kamera selbst');
assert.equal(still('camera.hof_main', { states }, {}), 'camera.hof_main', 'ohne hass.entities die Kamera selbst');
// nicht aktiviert = nicht in hass.entities
const ent2 = { ...entities }; delete ent2['camera.hof_snap_main']; delete ent2['camera.hof_snap_sub'];
assert.equal(still('camera.hof_main', { states, entities: ent2 }, {}), 'camera.hof_main', 'deaktivierte Schnappschüsse zählen nicht');
// (3)
assert.equal(still('camera.duo_main_0', hass, {}), 'camera.duo_snap_0', 'Linse 0');
assert.equal(still('camera.duo_main_1', hass, {}), 'camera.duo_snap_1', 'Linse 1');
assert.equal(still('camera.zoom_tele', hass, {}), 'camera.zoom_tele_snap', 'Teleobjektiv');
assert.equal(still('camera.zoom_main', hass, {}), 'camera.zoom_snap', 'Weitwinkel');
// (4)
assert.equal(still('camera.hof_main', hass, { still_entity: 'camera.hof_snap_sub' }), 'camera.hof_snap_sub', 'Studio-Feld hat Vorrang');
assert.equal(still('camera.generisch', hass, { still_entity: 'image.generisch_bild' }), 'image.generisch_bild', 'image.* per Studio-Feld');
assert.equal(still('camera.generisch', hass, { still_entity: 'image.fehlt' }), 'camera.generisch', 'eingetragene Entität fehlt → Kamera');
assert.equal(still('camera.generisch', hass, { still_entity: 'sensor.x' }), 'camera.generisch', 'nur camera/image');
// (5)
assert.equal(still('camera.generisch', hass, {}), 'camera.generisch', 'Generic Camera: kein image.* geraten');
assert.equal(still('camera.ring_live_view', hass, {}), 'camera.ring_live_view', 'Ring last_recording nicht automatisch');
assert.equal(still('camera.frigate_hof', hass, {}), 'camera.frigate_hof', 'Frigate-Objektbild nicht automatisch');
assert.equal(still('camera.ander_live', hass, {}), 'image.ander_snapshot', 'eindeutiger Schlüssel snapshot');
// (6)
assert.equal(age(0), 'gerade eben');
assert.equal(age(4999), 'gerade eben');
assert.equal(age(8000), 'vor 8 s');
assert.equal(age(125000), 'vor 2 Min.');
assert.equal(age(2 * 3600e3), 'vor 2 Std.');
// (7)
const tpl = JSON.parse(fs.readFileSync(new URL('dashboards/casora/button_card_templates.json', root), 'utf8'));
const cam = JSON.stringify(tpl.casora_camera);
assert.ok(/casoraCamStill/.test(cam) && /casoraCamAge/.test(cam), 'Vorlage nutzt casoraCamStill/casoraCamAge');
assert.ok(!/return "Live"/.test(tpl.casora_camera.state_display), 'Kachel behauptet kein „Live“ mehr');
assert.deepEqual(tpl.casora_doorbell.template, ['casora_camera'], 'Klingel erbt die Kamera-Kachel');
const types = fs.readFileSync(new URL('custom_components/casora/panel/casora-panel-types.js', root), 'utf8');
assert.ok(/key: "still_entity"[^}]*domains: \["camera", "image"\]/.test(types), 'Studio-Feld still_entity');
console.log('kamera_standbild_von: ok');
