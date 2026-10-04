// Raum-Symbol ohne Browser: room_icon ist ein Name (/casora_assets/icons/<name>.svg) oder ein
// ganzer Pfad zu einem eigenen Symbol (/local/casora/icons/eigene/x.svg|png). Dazu die
// automatische Zuordnung für Kinderzimmer.  node dev/unit/raum_symbol.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const nav = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/04-navigation.js', import.meta.url), 'utf8');
const one = (re) => { const m = re.exec(src); assert.ok(m, 'nicht gefunden: ' + re); return m[0]; };
const block = (re) => {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  return src.slice(m.index, src.indexOf('\n};', m.index) + 3);
};
const code = [
  block(/^const ROOM_GLYPHS = \{/m),
  block(/^const ROOM_ICON_LABEL = \{/m),
  one(/^const titleCase = (?:.|\n)*?;$/m),
  one(/^const isIconPath = .*$/m),
  one(/^const roomIconSrc = .*$/m),
  one(/^const ownIconName = .*$/m),
  one(/^const roomIconLabel = .*$/m),
  block(/^const autoRoomGlyph = /m),
  'const ICON_DEFAULT = "Default";',
  'const ICON_DATA = { default: "data:default", bedroom: "data:bedroom", "kids-room": "data:kids" };',
  block(/^const iconUrl = /m),
  'return { isIconPath, roomIconSrc, roomIconLabel, autoRoomGlyph, iconUrl };',
].join('\n');
const { isIconPath, roomIconSrc, roomIconLabel, autoRoomGlyph, iconUrl } = new Function(code)();

// Bestehende Namen unverändert.
assert.equal(roomIconSrc('bedroom'), '/casora_assets/icons/bedroom.svg');
assert.equal(roomIconSrc('living-room'), '/casora_assets/icons/living-room.svg');
assert.equal(roomIconSrc(''), '/casora_assets/icons/home.svg');
assert.equal(iconUrl('bedroom'), 'data:bedroom');
assert.equal(iconUrl('gibtsnicht'), 'data:default');

// Eigene Symbole: ganzer Pfad bleibt, SVG wie PNG.
for (const p of ['/local/casora/icons/eigene/sofa.svg', '/local/casora/icons/eigene/mein-sofa-2.png']) {
  assert.ok(isIconPath(p), p);
  assert.equal(roomIconSrc(p), p);
  assert.equal(iconUrl(p), p);
}
assert.equal(roomIconLabel('/local/casora/icons/eigene/mein-sofa-2.png'), 'Mein Sofa 2');
assert.equal(roomIconLabel('kids-room'), 'Kids Room');

// Nichts, was aus url('…') oder einem style-Attribut ausbrechen könnte.
for (const bad of ["/local/x.svg');background:red;('", '/local/a b.svg', 'javascript:alert(1)', '//evil.example/x.svg?', '//evil.example/x.svg',
  '/local/x.gif', 'bedroom', null, 42]) {
  assert.ok(!isIconPath(bad), String(bad));
}

// Kinderzimmer automatisch, auch mit Nummer am Ende.
for (const n of ['Kinderzimmer', 'Kinderzimmer 2', 'kids', 'Kids Room', 'Nursery', 'Babyzimmer', 'Spielzimmer', 'Playroom']) {
  assert.equal(autoRoomGlyph(n), 'kids-room', n);
}
assert.equal(autoRoomGlyph('Schlafzimmer 2'), 'bedroom');
assert.equal(autoRoomGlyph('Wohnzimmer'), 'living-room');
assert.equal(autoRoomGlyph('Irgendwas'), 'home');
assert.equal(autoRoomGlyph('Raum 101'), 'home');

// Mitgeliefert: Datei, Panel-Daten und Handy-Navigation kennen das Symbol.
assert.ok(fs.existsSync(new URL('../../custom_components/casora/assets/icons/kids-room.svg', import.meta.url)));
assert.ok(/^ {2}"kids-room": "data:image\/svg\+xml,[^"#]+",$/m.test(src), 'ICON_DATA kids-room ohne # im data:-URI');
assert.ok(/"kids-room": "Kinderzimmer"/.test(src), 'ICON_NAMES_DE');
assert.ok(/kinderzimmer: SFI \+ 'kids-room\.svg'/.test(nav), '04-navigation ROOM_ICON');
// Handy-Navigation nimmt jeden Pfad, der mit / beginnt, als Maske.
assert.ok(/icon\.charAt\(0\) === '\/' \? '<i class="hmn-svg"/.test(nav), '04-navigation _iconHtml');

console.log('ok raum_symbol');
