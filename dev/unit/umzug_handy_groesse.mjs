// Umzug: Kachelgröße am Handy (groß/klein) wie im Hemma-Handy-Dashboard.  node dev/unit/umzug_handy_groesse.mjs
// Gemeldet 03.10.2026: Nach dem Umzug waren am Handy alle Kacheln gleich groß. Hemma trug die Größe
// nur im Handy-Dashboard; Casora speichert sie an der Raum-Kachel („Size on phone“) und gibt sie beim
// Speichern ans Handy weiter. carryPhoneSizes überträgt sie deshalb an die Raum-Kacheln.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  return src.slice(m.index, end + 2);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const code = [
  one(/^const CUSTOM_TEMPLATE = .*$/m),
  grab(/^function stable\(/m),
  grab(/^function tileTwinKey\(/m),
  one(/^const innerTile = .*$/m),
  grab(/^function copySizeDeep\(/m),
  grab(/^function carryPhoneSizes\(/m),
  'return { carryPhoneSizes };',
].join('\n');
const { carryPhoneSizes } = new Function(code)();

const t = (template, entity, vars) => ({ type: 'custom:button-card', template, entity, ...(vars ? { variables: vars } : {}) });
const desk = { compact: { rooms: [
  { name: 'Home', path: 'home', tiles: [t('casora_lock', 'lock.tuer'), t('casora_car', 'sensor.auto'), t('casora_light', 'light.a'), t('casora_light', 'light.a')] },
  { name: 'Wohnzimmer', path: 'wohnzimmer', tiles: [t('casora_media', 'media_player.tv', { icon: 'tv' }), t('casora_camera', 'camera.wz'), t('casora_entity_actions', 'switch.x')] },
] } };
const phone = { compact: { rooms: [
  { name: 'Favorites', tiles: [t('casora_lock', 'lock.tuer', { size: 'large' }), t('casora_car', 'sensor.auto'),
    t('casora_light', 'light.a'), t('casora_light', 'light.a', { size: 'large' })] },
  { name: 'Wohnzimmer', tiles: [
    { type: 'conditional', conditions: [], card: t('casora_media', 'media_player.tv', { size: 'large' }) },
    t('casora_camera', 'camera.wz', { size: 'large' }),
    t('casora_entity_actions', 'switch.x', { size: 'small' }),
    t('casora_light', 'light.nur_handy', { size: 'large' })] },
] } };
const link = { links: [{ room: 0, section: 0 }, { room: 1, section: 1 }] };

const n = carryPhoneSizes(desk, phone, link);
const size = (r, i) => ((desk.compact.rooms[r].tiles[i].variables) || {}).size;
assert.equal(size(0, 0), 'large', 'Schloss groß wie am Handy');
assert.equal(size(0, 1), undefined, 'Auto ohne Angabe bleibt Standard');
assert.equal(size(0, 2), undefined, 'erste von zwei gleichen Kacheln: klein wie am Handy');
assert.equal(size(0, 3), 'large', 'zweite gleiche Kachel: groß – der Reihe nach zugeordnet');
assert.equal(size(1, 0), 'large', 'Größe aus der bedingten Handy-Karte');
assert.equal(desk.compact.rooms[1].tiles[0].variables.icon, 'tv', 'andere Variablen bleiben');
assert.equal(size(1, 1), 'large', 'Kamera groß');
assert.equal(size(1, 2), 'small', 'ausdrücklich klein bleibt klein (Vorlage wäre groß)');
assert.equal(n, 5, 'fünf Größen übertragen');

// Bedingte Raum-Kachel: Größe an der inneren Kachel, wie smart-row sie liest.
const desk2 = { compact: { rooms: [{ name: 'Home', path: 'home', tiles: [{ type: 'conditional', conditions: [], card: t('casora_camera', 'camera.c') }] }] } };
const phone2 = { compact: { rooms: [{ name: 'Favorites', tiles: [t('casora_camera', 'camera.c', { size: 'large' })] }] } };
carryPhoneSizes(desk2, phone2, { links: [{ room: 0, section: 0 }] });
assert.equal(desk2.compact.rooms[0].tiles[0].card.variables.size, 'large', 'bedingte Raum-Kachel innen groß');
assert.equal(desk2.compact.rooms[0].tiles[0].variables, undefined, 'nicht an die Hülle');

// Verschachtelt (04.10.2026): Swipe-Karte mit zwei Kameras und auto-entities mit Pflanzen in
// einer bedingten Karte – die Größe gilt auch für die Karten darin.
const swipe = (sz) => ({ type: 'conditional', conditions: [], card: { type: 'custom:casora-swipe-card', ...(sz ? { variables: { size: sz } } : {}),
  cards: [t('casora_camera', 'camera.a', sz ? { size: sz } : null), t('casora_camera', 'camera.b', sz ? { size: sz } : null)] } });
const plants = (sz) => ({ type: 'conditional', conditions: [], card: { type: 'custom:auto-entities', ...(sz ? { variables: { size: sz } } : {}),
  filter: { include: [{ entity_id: 'plant.y', options: t('casora_plant', 'plant.y', sz ? { size: sz, sensors: [] } : { sensors: [] }) }] } } });
const desk4 = { compact: { rooms: [{ name: 'Home', path: 'home', tiles: [swipe(), plants(), t('casora_vacuum', 'vacuum.r')] },
  { name: 'Waschküche', path: 'waschkueche', tiles: [t('casora_vacuum', 'vacuum.r')] }] } };
const phone4 = { compact: { rooms: [{ name: 'Favorites', tiles: [swipe('large'), plants('large'), t('casora_vacuum', 'vacuum.r')] },
  { name: 'Waschküche', tiles: [t('casora_vacuum', 'vacuum.r', { size: 'large' })] }] } };
assert.equal(carryPhoneSizes(desk4, phone4, { links: [{ room: 0, section: 0 }, { room: 1, section: 1 }] }), 3);
const h4 = desk4.compact.rooms[0].tiles;
assert.equal(h4[0].card.variables.size, 'large', 'Swipe-Karte groß');
assert.deepEqual(h4[0].card.cards.map((c) => c.variables.size), ['large', 'large'], 'Kameras in der Swipe-Karte groß');
assert.equal(h4[1].card.variables.size, 'large', 'auto-entities groß');
assert.equal(h4[1].card.filter.include[0].options.variables.size, 'large', 'Pflanze darin groß');
assert.deepEqual(h4[1].card.filter.include[0].options.variables.sensors, [], 'übrige Variablen bleiben');
// Dieselbe Entität: in den Favoriten klein, im Raum groß – je an ihrer Stelle.
assert.equal(h4[2].variables, undefined, 'Saugroboter in der Übersicht bleibt klein');
assert.equal(desk4.compact.rooms[1].tiles[0].variables.size, 'large', 'Saugroboter in der Waschküche groß');

// Ohne Handy-Abschnitt (Raum nicht verknüpft): nichts ändern.
const desk3 = { compact: { rooms: [{ name: 'Flur', path: 'flur', tiles: [t('casora_light', 'light.f')] }] } };
assert.equal(carryPhoneSizes(desk3, phone2, { links: [{ room: 0, section: null }] }), 0);
assert.equal(desk3.compact.rooms[0].tiles[0].variables, undefined);

console.log('ok umzug_handy_groesse');
