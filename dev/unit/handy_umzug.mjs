// Handy-Dashboard aus Hemma ohne Browser: einlesen (extractMobileConfig) und wieder
// aufbauen (expandMobileConfig).  node dev/unit/handy_umzug.mjs
// Gemeldet: Nach dem Umzug eines deutschen Hemma-Handy-Dashboards zeigte Home nur noch die
// Badges – „Favoriten“ galt als Raum und wurde ausgeblendet; die Räume im Menü hatten andere
// Schlüssel als ihre Overlays (room_kche statt room_kueche) und öffneten nichts.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const code = [
  one(/^const MOBILE_HEADER = .*$/m),
  one(/^const SMART_ROW = .*$/m),
  one(/^const FILTER_OVERLAY = .*$/m),
  one(/^const MOBILE_NAV = .*$/m),
  one(/^const MOBILE_FAVORITES = .*$/m),
  one(/^const isFavoritesName = .*$/m),
  one(/^const isFav = (?:.|\n)*?;$/m),
  one(/^const clone = .*$/m),
  one(/^const put = .*$/m),
  grab(/^const omit = /m),
  one(/^const roomKeyOf = (?:.|\n)*?;$/m),
  'const hostBareTiles = (l) => l || [];',
  'const autoRoomGlyph = () => "home";',
  one(/^const isIconPath = .*$/m),
  one(/^const roomIconSrc = .*$/m),
  grab(/^function extractMobileConfig\(/m),
  grab(/^function expandMobileConfig\(/m),
  'return { extractMobileConfig, expandMobileConfig };',
].join('\n');
const { extractMobileConfig, expandMobileConfig } = new Function(code)();

const header = (name) => ({ type: 'custom:button-card', template: 'casora_mobile_header', name });
const row = (cards) => ({ type: 'custom:casora-smart-row', cards });
const tile = (t) => ({ type: 'custom:button-card', template: t });
const lovelace = { views: [{ type: 'custom:grid-layout', path: 'home', layout: {}, cards: [
  tile('casora_mobile_bg'),
  row([
    tile('casora_mobile_filter_badges'),
    { type: 'custom:casora-filter-overlay', room: 'Küche', filter_category: 'room_kueche' },
    { type: 'custom:casora-filter-overlay', room: 'Waschküche', filter_category: 'room_hauswirtschaftsraum' },
    { type: 'custom:casora-filter-overlay', room: 'Flur' },
    header('Szenen'), tile('casora_scene_row'),
    header('Favoriten'), row([tile('casora_light'), tile('casora_lock')]),
    header('Küche'), row([tile('casora_light')]),
    header('Waschküche'), row([tile('casora_light')]),
    header('Flur'), row([tile('casora_light')]),
  ]),
  { type: 'custom:casora-mobile-nav', rooms: [] },
] }] };

const m = extractMobileConfig(lovelace);
const names = m.compact.rooms.map((r) => r.name);
assert.deepEqual(names, ['Favorites', 'Küche', 'Waschküche', 'Flur'], 'Favoriten intern als „Favorites“');

const out = expandMobileConfig(m.compact, m.scaffold, m.extras, m.templates, m.chrome);
const nav = out.views[0].cards.find((c) => c.type === 'custom:casora-mobile-nav');
assert.deepEqual(nav.rooms.map((r) => r.name), ['Küche', 'Waschküche', 'Flur'], 'Favoriten nicht als Raum im Menü');
assert.deepEqual(nav.rooms.map((r) => r.key), ['room_kueche', 'room_hauswirtschaftsraum', 'room_flur'],
  'Menü-Schlüssel wie das Overlay des Raums');
// Der Kopf bleibt beim Aufbauen „Favorites“ (Anzeige übersetzt ihn) – nicht doppelt, nicht verloren.
const heads = out.views[0].cards[1].cards.filter((c) => c.template === 'casora_mobile_header').map((c) => c.name);
assert.deepEqual(heads, ['Szenen', 'Favorites', 'Küche', 'Waschküche', 'Flur']);
// Favoriten umbenannt (Studio „Name am Handy“, Hemma 2.2.0): das Merkmal variables.favorites hält
// den Abschnitt als Favoriten – eigener Name bleibt, kein Raum im Menü, Rundlauf unverändert.
const ren = JSON.parse(JSON.stringify(lovelace));
const favHead = ren.views[0].cards[1].cards.find((c) => c.name === 'Favoriten');
favHead.name = 'Lieblingsgeräte';
favHead.variables = { favorites: true, hide_caret: true };
const m2 = extractMobileConfig(ren);
assert.deepEqual(m2.compact.rooms.map((r) => r.name), ['Lieblingsgeräte', 'Küche', 'Waschküche', 'Flur'], 'eigener Name bleibt');
const out2 = expandMobileConfig(m2.compact, m2.scaffold, m2.extras, m2.templates, m2.chrome);
const nav2 = out2.views[0].cards.find((c) => c.type === 'custom:casora-mobile-nav');
assert.deepEqual(nav2.rooms.map((r) => r.name), ['Küche', 'Waschküche', 'Flur'], 'umbenannte Favoriten nicht als Raum im Menü');
assert.deepEqual(JSON.stringify(out2.views[0].cards[1]), JSON.stringify(ren.views[0].cards[1]), 'Rundlauf unverändert');
console.log('ok handy_umzug');
