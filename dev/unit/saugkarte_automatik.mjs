// Saugroboter-Karte (1.1.0): Feld „Karte“ leer oder die eingetragene Entität gibt es nicht
// mehr → am Roboter (und seiner Station) eine Karten-Entität suchen. Die gültige manuelle
// Wahl gewinnt immer; ohne Karte am Gerät bleibt die Karte weg.
//   node dev/unit/saugkarte_automatik.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finden.js', import.meta.url), 'utf8');
const ctx = { window: {}, document: { querySelector: () => null } };
ctx.window.window = ctx.window;
vm.createContext(ctx);
vm.runInContext(src, ctx);
const CD = ctx.window.casoraDevice;
assert.ok(CD && CD.vacuumMapFor, 'Finder hat vacuumMapFor');

const st = (state, name) => ({ state, attributes: { friendly_name: name, entity_picture: '/api/image_proxy/x?token=1' } });
function haus(extra) {
  const hass = {
    devices: { robo: { name: 'Robo', manufacturer: 'M' }, dock: { name: 'Robo Dock', manufacturer: 'M' } },
    entities: {
      'vacuum.robo': { device_id: 'robo', platform: 'roborock' },
      'sensor.robo_status': { device_id: 'robo', translation_key: 'status', platform: 'roborock' },
      'camera.flur': { device_id: 'cam', platform: 'demo' },
    },
    states: { 'vacuum.robo': st('docked', 'Robo'), 'sensor.robo_status': st('charging', 'Robo Status'), 'camera.flur': st('idle', 'Flur') },
  };
  (extra || []).forEach(([id, reg, state]) => { hass.entities[id] = reg; hass.states[id] = state; });
  return hass;
}

// 1) Manuelle Wahl gewinnt, solange es sie gibt.
let h = haus([['image.robo_erdgeschoss', { device_id: 'robo', platform: 'roborock', entity_category: 'diagnostic' }, st('2026-10-07', 'Robo Erdgeschoss')]]);
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', 'camera.flur'), 'camera.flur', 'manuelle Wahl gewinnt');
// 2) Leer → Roborock-Bild am Gerät (ohne Schlüssel, Name = Kartenname).
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', ''), 'image.robo_erdgeschoss', 'image.* von Roborock gefunden');
// 3) Eingetragene Entität gelöscht → wie leer.
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', 'camera.alte_eigene_karte'), 'image.robo_erdgeschoss', 'gelöschte Entität → Automatik');
// 4) Mehrere Stockwerke: aktive Karte (select selected_map) zuerst.
h = haus([
  ['image.robo_erdgeschoss', { device_id: 'robo', platform: 'roborock' }, st('2026-10-07', 'Robo Erdgeschoss')],
  ['image.robo_obergeschoss', { device_id: 'robo', platform: 'roborock' }, st('2026-10-07', 'Robo Obergeschoss')],
  ['select.robo_karte', { device_id: 'robo', platform: 'roborock', translation_key: 'selected_map' }, st('Obergeschoss', 'Robo Karte')],
]);
assert.equal(CD.vacuumMap(h, 'vacuum.robo'), 'image.robo_obergeschoss', 'aktive Karte zuerst');
h.states['select.robo_karte'] = st('unknown', 'Robo Karte');
assert.equal(CD.vacuumMap(h, 'vacuum.robo'), 'image.robo_erdgeschoss', 'ohne aktive Karte: erste');
// 5) Andere Integrationen: camera.*_map am Gerät bzw. an der Station.
h = haus([['camera.robo_map', { device_id: 'dock', platform: 'dreame_vacuum' }, st('idle', 'Robo Map')]]);
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', undefined), 'camera.robo_map', 'camera.*_map gefunden');
// 6) Kamera am Gerät ohne Kartenmerkmal ist keine Karte; eine fremde Kamera auch nicht.
h = haus([['camera.robo_frontkamera', { device_id: 'robo', platform: 'other' }, st('idle', 'Robo Front')]]);
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', ''), null, 'nichts gefunden → keine Karte');
// 7) Map Extractor ohne Gerät: camera.<roboter>_map.
h = haus([['camera.robo_map', { platform: 'xiaomi_cloud_map_extractor' }, st('idle', 'Robo Map')]]);
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', ''), 'camera.robo_map', 'Map Extractor über ID');

// 8) Andere Plattform, aber Gerät mit Kartenwahl: das Bild daran ist die Karte (Testhaus).
h = haus([
  ['image.robo_standard', { device_id: 'robo', platform: 'other' }, st('2026-10-07', 'Robo Standard')],
  ['select.robo_karte', { device_id: 'robo', platform: 'other', translation_key: 'selected_map' }, st('Standard', 'Robo Karte')],
]);
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', ''), 'image.robo_standard', 'Bild am Gerät mit Kartenwahl');
// 9) Bild ohne Kartenmerkmal (z. B. Titelbild eines Druckers) ist keine Karte.
h = haus([['image.robo_titelbild', { device_id: 'robo', platform: 'other', translation_key: 'cover_image' }, st('x', 'Robo Titelbild')]]);
assert.equal(CD.vacuumMapFor(h, 'vacuum.robo', ''), null, 'Titelbild ist keine Karte');

console.log('saugkarte_automatik: ok');
