// Studio: Orientierung und Wege (UX-Runde 06.10.2026) ohne Browser.  node dev/unit/studio_ux.mjs
// Geltungsbereich je Ansicht („Gilt für: …“), Weg im Inspektor-Kopf, Kachelart vom Gerät her,
// Geräte-Suche, Untertitel der Reiter.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const win = {};
new Function('window', read('panel/casora-panel-b-ux.js'))(win);
const U = win.__casoraStudioUx;
assert.ok(U && U.scopeOf && U.SCOPE && U.SUB, 'Bausteine fehlen');

// ── V-01: Geltungsbereich ───────────────────────────────────────────────────────────
const dashSection = (k) => ['General', 'Weather', 'Time', 'Notifications', 'Scenes'].includes(k);
const sc = (o) => U.scopeOf({ dashSection, ...o });
assert.equal(sc({ list: true }), 'room', 'Inhalt-Blatt: dieser Raum');
assert.equal(sc({ sel: { group: 'tiles', key: 'x' } }), 'room', 'Kachel: dieser Raum');
assert.equal(sc({ sel: { group: 'badges', key: 'Climate' } }), 'room', 'Badge: dieser Raum');
assert.equal(sc({ sel: { group: 'rooms', key: 'Appearance' } }), 'room', 'Darstellung: dieser Raum');
assert.equal(sc({ sel: { group: 'rooms', key: 'Now Playing' } }), 'room', 'Wiedergabe: dieser Raum');
assert.equal(sc({ sel: { group: 'rooms', key: 'Weather' } }), 'dash', 'Wetter: dieses Dashboard');
assert.equal(sc({ sel: { group: 'rooms', key: 'General' } }), 'design', 'Design & Bedienung sagt, was stimmt');
assert.equal(sc({ page: 'settings' }), 'all', 'Einstellungen: alle Dashboards');
assert.equal(sc({ page: 'updates' }), 'all');
assert.equal(sc({ page: 'rewind' }), 'dash', 'Zeitreise: dieses Dashboard');
assert.equal(sc({ arrange: true }), 'dash', 'Räume ordnen: dieses Dashboard');
assert.equal(sc({}), '', 'nichts offen: keine Zeile');
assert.ok(/\{room\}/.test(U.SCOPE.room) && /all dashboards/.test(U.SCOPE.design), 'Texte');

// ── V-07: Weg über dem Titel ────────────────────────────────────────────────────────
const pa = (o) => U.pathOf({ dashSection, room: 'Wohnzimmer', ...o });
assert.deepEqual(pa({ sel: { group: 'tiles', key: 'x' } }), ['Wohnzimmer', 'Tiles']);
assert.deepEqual(pa({ sel: { group: 'badges', key: 'Climate' } }), ['Wohnzimmer', 'Badges']);
assert.deepEqual(pa({ sel: { group: 'rooms', key: 'Appearance' } }), ['Wohnzimmer']);
assert.deepEqual(pa({ sel: { group: 'rooms', key: 'Weather' } }), [], 'Dashboard-Abschnitt: nur „Gilt für“');
assert.deepEqual(pa({ sel: { group: 'tiles', key: 'x' }, page: 'settings' }), [], 'Seite: kein Weg');

// ── V-04: Kachelart vom Gerät her, Geräte-Suche ────────────────────────────────────
const ids = new Set(['light', 'thermostat', 'media', 'cover', 'casora_switch', 'entity_actions', 'casora_washer']);
assert.equal(U.typeFor('light.stehlampe', ids), 'light');
assert.equal(U.typeFor('climate.bad', ids), 'thermostat');
assert.equal(U.typeFor('switch.kaffee', ids), 'casora_switch');
assert.equal(U.typeFor('script.gute_nacht', ids), 'entity_actions', 'Skript: Gerät mit Tasten');
assert.equal(U.typeFor('sensor.waschmaschine_status', ids, 'casora_washer'), 'casora_washer', 'Vorschlag des Assistenten zählt');
assert.equal(U.typeFor('vacuum.x', new Set(['light'])), null, 'ohne passende Art: nichts');
const devs = [
  { name: 'Deckenlicht', area: 'Küche', kind: 'Licht', words: 'licht lampe', fresh: false },
  { name: 'Stehlampe', area: 'Schlafzimmer', kind: 'Licht', words: 'licht lampe', fresh: true },
  { name: 'Lampe Flur', area: 'Flur', kind: 'Licht', words: 'licht lampe', fresh: true },
];
assert.deepEqual(U.rankDevices(devs, 'steh').map((d) => d.name), ['Stehlampe'], 'Anfang des Namens');
assert.equal(U.rankDevices(devs, 'lampe')[0].name, 'Lampe Flur', 'Name beginnt mit dem Wort');
assert.equal(U.rankDevices(devs, 'schlafzimmer licht')[0].name, 'Stehlampe', 'Bereich und Art finden mit');
const twins = [{ name: 'Spot A', area: '', kind: 'Licht', words: 'licht', fresh: false }, { name: 'Spot B', area: '', kind: 'Licht', words: 'licht', fresh: true }];
assert.equal(U.rankDevices(twins, 'licht')[0].name, 'Spot B', 'Neues (ohne Kachel) vor Vorhandenem');

// ── V-02: Untertitel ────────────────────────────────────────────────────────────────
assert.ok(/\{room\}/.test(U.SUB.list) && /this dashboard/.test(U.SUB.dash) && /all dashboards/.test(U.SUB.home));

// Akku-Hinweise an der Aquarium-Kachel: Auswahl Automatisch (nicht gespeichert) / Immer / Nie.
{
  const t = read('panel/casora-panel-types.js');
  const i = t.indexOf('id: "casora_aquarium"');
  const f = t.slice(t.indexOf('key: "battery_hints"', i), t.indexOf('key: "battery_hints"', i) + 600);
  assert.ok(i > 0 && /type: "select"/.test(f), 'Feld battery_hints als Auswahl an der Aquarium-Kachel');
  assert.match(f, /options: \["", "always", "never"\]/, '„Automatisch“ = leer, wird nicht gespeichert');
  const de0 = JSON.parse(read('translations/panel/de.json')).exact;
  assert.equal(de0['Battery hints'], 'Akku-Hinweise');
  ['Automatic', 'Always', 'Never'].forEach((k) => assert.ok(de0[k], 'deutsch: ' + k));
}

// Alle Texte des Moduls haben eine deutsche Fassung.
const de = JSON.parse(read('translations/panel/de.json')).exact;
const texts = [...Object.values(U.SUB), ...Object.values(U.SCOPE), ...Object.values(U.WHAT)];
texts.forEach((t) => assert.ok(de[t], 'deutsche Fassung fehlt: ' + t));

console.log('studio_ux: ok');
