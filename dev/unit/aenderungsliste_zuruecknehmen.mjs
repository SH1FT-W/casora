// Änderungsliste (Nutzertest 2, T8) ohne Browser.  node dev/unit/aenderungsliste_zuruecknehmen.mjs
// Zählt richtig (Umbenennen = 1 Zeile, auch mit den Nebenwerten room_name/area/room_icon; eine
// Dashboard-Einstellung in allen Räumen = 1 Zeile), nennt Badge-Namen wortgenau und Kachel an/aus,
// und nimmt jede Zeile einzeln zurück, auch wenn danach weitere Änderungen kamen – sonst ausgegraut.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const win = {};
new Function('window', fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8'))(win);
const { changeLines, changeItems, revertLine } = win.__casoraStudioMehr;
const J = JSON.stringify;
const tile = (name, entity, extra) => ({ type: 'custom:button-card', template: 'casora_light', name, entity, ...(extra || {}) });
const room = (path, name, tiles, variables) => ({ path, name, tiles: tiles || [], variables: variables || {} });
const st = (rooms, dash) => [{ rooms }, dash || {}, {}, null, null];
const clone = (x) => JSON.parse(J(x));

const base = st([
  room('home', 'Home', [tile('A', 'light.a')], { use_12h: false }),
  room('kueche', 'Küche', [tile('Spüle', 'light.s')], { use_12h: false }),
  room('bad', 'Bad', [tile('Heizung', 'climate.h'), tile('Spiegel', 'light.m')], { use_12h: false }),
]);

// Drei Änderungen wie im Test: Küche umbenannt (mit Nebenwerten), Bad-Kachel aus, Badge „Klima“ → „Luft“.
const now = clone(base);
const k = now[0].rooms[1];
k.name = 'Kochecke'; Object.assign(k.variables, { room_name: 'Kochecke', area: 'kuche', room_icon: 'kitchen' });
now[0].rooms[2].tiles[0].enabled = false;
now[0].rooms[2].variables.climate_title = 'Luft';
assert.deepEqual(changeLines(base, now, {}), [
  'Room renamed: Küche → Kochecke',
  'Tile turned off: Heizung · Bad',
  'Badge renamed: Climate → Luft · Bad',
], 'drei Zeilen für drei Änderungen');

// Umbenennen zurücknehmen, obwohl danach noch zwei Änderungen kamen
const r1 = revertLine(base, now, 0, {});
assert.ok(r1.state, 'Umbenennen lässt sich einzeln zurücknehmen');
assert.equal(r1.state[0].rooms[1].name, 'Küche');
assert.equal(J(r1.state[0].rooms[1].variables), J(base[0].rooms[1].variables), 'Nebenwerte auch zurück');
assert.deepEqual(changeLines(base, r1.state, {}), ['Tile turned off: Heizung · Bad', 'Badge renamed: Climate → Luft · Bad']);
assert.equal(now[0].rooms[1].name, 'Kochecke', 'Eingabe bleibt unverändert');
// Badge zurück, Kachel bleibt aus
const r2 = revertLine(base, now, 2, {});
assert.equal(r2.state[0].rooms[2].variables.climate_title, undefined);
assert.equal(r2.state[0].rooms[2].tiles[0].enabled, false);
// Alle drei nacheinander → nichts mehr geändert
let s = now;
for (let n = 3; n > 0; n--) { const r = revertLine(base, s, 0, {}); assert.ok(r.state); s = r.state; }
assert.equal(J(s[0]), J(base[0]), 'alles zurück = gespeicherter Stand');

// Eine Einstellung in allen Räumen (Uhr 12 h) = eine Zeile, Zurücknehmen in allen Räumen
const clock = clone(base);
clock[0].rooms.forEach((r) => { r.variables.use_12h = true; });
assert.deepEqual(changeLines(base, clock, {}), ['Dashboard settings changed'], 'nicht „15 Änderungen“');
const rc = revertLine(base, clock, 0, {});
assert.ok(rc.state && rc.state[0].rooms.every((r) => r.variables.use_12h === false));

// Kachel hinzugefügt / entfernt / Reihenfolge / Raum neu
const more = clone(base);
more[0].rooms[0].tiles.push(tile('Neu', 'light.n'));
more[0].rooms[2].tiles.reverse();
more[0].rooms.push(room('garten', 'Garten'));
const it = changeItems(base, more, {}).map((x) => x.text);
assert.deepEqual(it, ['Room added: Garten', 'Tile added: Neu · Home', 'Tile order changed: Bad']);
for (let i = 0; i < it.length; i++) {
  const r = revertLine(base, more, i, {});
  assert.ok(r.state, 'zurücknehmbar: ' + it[i]);
  assert.deepEqual(changeLines(base, r.state, {}), it.filter((_, j) => j !== i));
}
// Raum gelöscht → kommt an seinen Platz zurück
const del = clone(base); del[0].rooms.splice(1, 1);
const rd = revertLine(base, del, 0, {});
assert.equal(J(rd.state[0]), J(base[0]));

// Handy-Layout folgt (Raumname im Handy-Abschnitt mit umbenannt): Zurücknehmen geht trotzdem,
// und mit der letzten Desktop-Zeile kommt auch das Handy-Layout zurück.
{ const b = clone(base); b[4] = [{ rooms: [{ name: 'Küche', tiles: [] }] }, null, null];
  const n = clone(b); n[0].rooms[1].name = 'Kochecke'; n[4][0].rooms[0].name = 'Kochecke';
  assert.deepEqual(changeLines(b, n, {}), ['Room renamed: Küche → Kochecke']);
  const r = revertLine(b, n, 0, {});
  assert.ok(r.state, 'nicht „verknüpft“');
  assert.equal(J(r.state), J(b), 'Desktop und Handy zurück'); }
// Was sich nicht sauber trennen lässt, wird ehrlich abgelehnt (Fingerabdruck stimmt nicht)
const W2 = {}; new Function('window', fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8')
  .replace('const want = desk(items.filter', 'const want = desk([{ text: "x" }].concat(items).filter'))(W2);
assert.equal(W2.__casoraStudioMehr.revertLine(base, now, 0, {}).why, 'linked');

// Panel: Zurückbenennen räumt die Nebenwerte weg (kein Geistereintrag „Raumeinstellungen geändert“)
const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
assert.ok(/const saved = this\._savedRoom \? this\._savedRoom\(room\) : null;/.test(src) && src.includes('room.variables.room_icon === autoRoomGlyph(nv)'), 'Zurückbenennen räumt auf');
const mehr = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-b-mehr.js', import.meta.url), 'utf8');
assert.ok(mehr.includes('b.textContent = tr("Take back");') && mehr.includes('tr("Tied to another change – use Undo.")'), 'Zeilen mit „Zurücknehmen“ bzw. Grund');
assert.ok(/:host\(\.bmode\.bdirty\.phone:not\(\.flow\)\) \.toprow > \.bedited\.mlink/.test(mehr), 'am Handy sichtbar unter dem Titel');
console.log('aenderungsliste_zuruecknehmen: ok');
