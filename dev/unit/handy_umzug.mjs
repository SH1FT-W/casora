// Handy-Dashboard aus Hemma ohne Browser: einlesen (extractMobileConfig) und wieder
// aufbauen (expandMobileConfig).  node dev/unit/handy_umzug.mjs
// Umzug-Prüfung 10.10.2026: Ein RAUM namens „Favoriten“ (neben dem Favoriten-Abschnitt) wurde zum
// zweiten Favoriten-Abschnitt – am Handy ohne Pfeil, nicht als Raum zu öffnen, nicht im Menü.
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
  grab(/^function roomVisibility\(/m),
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
// Hemma 2.1.2 mit einem Raum „Favoriten“: der erste Abschnitt ist der Favoriten-Bereich, der
// zweite bleibt Raum (Merkmal favorites: false) – mit Menüeintrag, Rundlauf stabil.
const dup = JSON.parse(JSON.stringify(lovelace));
const kidsD = dup.views[0].cards[1].cards;
const at = kidsD.findIndex((c) => c.name === 'Küche');
kidsD.splice(at, 0, header('Favoriten'), row([tile('casora_light')]));
dup.views[0].cards[1].cards.splice(1, 0, { type: 'custom:casora-filter-overlay', room: 'Favoriten' });
const m3 = extractMobileConfig(dup);
assert.deepEqual(m3.compact.rooms.map((r) => r.name), ['Favorites', 'Favoriten', 'Küche', 'Waschküche', 'Flur'], 'Raum „Favoriten“ bleibt Raum');
assert.equal(m3.compact.rooms[1].variables.favorites, false, 'Merkmal: kein Favoriten-Abschnitt');
const out3 = expandMobileConfig(m3.compact, m3.scaffold, m3.extras, m3.templates, m3.chrome);
const nav3 = out3.views[0].cards.find((c) => c.type === 'custom:casora-mobile-nav');
assert.deepEqual(nav3.rooms.map((r) => r.name), ['Favoriten', 'Küche', 'Waschküche', 'Flur'], 'Raum „Favoriten“ im Menü');
const m4 = extractMobileConfig(out3);
assert.deepEqual(m4.compact.rooms.map((r) => [r.name, (r.variables || {}).favorites]), m3.compact.rooms.map((r) => [r.name, (r.variables || {}).favorites]), 'Rundlauf stabil');
// blankMobileState (neues Handy-Layout aus Desktop-Räumen): Raum „Favoriten“ mit Merkmal.
assert.match(src, /isRoom\(n, i\) && isFavoritesName\(n\)\) r\.variables = \{ \.\.\.\(r\.variables \|\| \{\}\), favorites: false \}/, 'blankMobileState markiert Raum „Favoriten“');
// Am Handy: Kopf eines Raums „Favoriten“ (favorites: false) mit Pfeil und antippbar; der echte
// Favoriten-Abschnitt weiter ohne.
const T = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-templates.json', import.meta.url), 'utf8'));
const hdr = (T.templates || T).casora_mobile_header;
const js = (x) => String(x).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const arrow = new Function('variables', js(hdr.styles.custom_fields.arrow.find((o) => o.display).display));
const tap = js(hdr.tap_action.action);
const tapFn = new Function('variables', tap);
const ctx = (name) => ({ _config: { name } });
assert.equal(arrow.call(ctx('Favoriten'), { favorites: false }), 'flex', 'Raum „Favoriten“: Pfeil');
assert.equal(arrow.call(ctx('Favoriten'), {}), 'none', 'Favoriten-Abschnitt: kein Pfeil');
assert.equal(arrow.call(ctx('Lieblinge'), { favorites: true }), 'none', 'umbenannte Favoriten: kein Pfeil');
assert.equal(tapFn.call(ctx('Favoriten'), {}), 'none', 'Favoriten-Abschnitt nicht antippbar');
assert.notEqual(tapFn.call(ctx('Favoriten'), { favorites: false }), 'none', 'Raum „Favoriten“ antippbar');
console.log('ok handy_umzug');
