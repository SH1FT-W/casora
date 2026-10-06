// Studio: Orientierung und Wege (UX-Runde 06.10.2026) ohne Browser.  node dev/unit/studio_ux.mjs
// Geltungsbereich je Ansicht („Gilt für: …“), Weg im Inspektor-Kopf, Untertitel der Reiter.
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

// ── V-02: Untertitel ────────────────────────────────────────────────────────────────
assert.ok(/\{room\}/.test(U.SUB.list) && /this dashboard/.test(U.SUB.dash) && /all dashboards/.test(U.SUB.home));

// Alle Texte des Moduls haben eine deutsche Fassung.
const de = JSON.parse(read('translations/panel/de.json')).exact;
const texts = [...Object.values(U.SUB), ...Object.values(U.SCOPE), ...Object.values(U.WHAT)];
texts.forEach((t) => assert.ok(de[t], 'deutsche Fassung fehlt: ' + t));

console.log('studio_ux: ok');
