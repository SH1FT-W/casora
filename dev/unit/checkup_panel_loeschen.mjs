// Studio: Doppelklick auf „Löschen“ entfernt genau eins (Kachel, Mitglied, Raum).
//   node dev/unit/checkup_panel_loeschen.mjs
// Checkup 10/2026: removeTile, drop/dropFirst der Sammelkacheln und „Raum löschen“ arbeiteten mit
// einer festen Stelle (i bzw. n). Ein zweiter Klick während der Animation – oder eine Änderung während
// der Rückfrage – traf dann die nächste Kachel, das nächste Mitglied bzw. den falschen Raum.
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
window.matchMedia = () => ({ matches: true });   // ohne Animation: done() läuft sofort

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const method = (head) => {
  const at = src.indexOf('\n  ' + head);
  assert.ok(at > 0, head + ' nicht gefunden');
  const open = src.indexOf('{\n', at);
  return src.slice(open + 2, src.indexOf('\n  }\n', at));
};
// Pfeilfunktion im Rumpf: von „const name = (…) => {“ bis zur schließenden Zeile gleicher Einrückung.
const arrow = (head, indent) => {
  const at = src.indexOf('\n' + indent + head);
  assert.ok(at > 0, head + ' nicht gefunden');
  const end = src.indexOf('\n' + indent + '};', at);
  return src.slice(at + 1, end + indent.length + 3);
};

// ── removeTile: zweimal geklickt → eine Kachel weg, und zwar die richtige ───────────
{
  const code = arrow('const removeTile = () => {', '    ');
  const make = new Function('room', 'shell', 'i', 'box', code + '\nreturn removeTile;');
  const a = { name: 'A' }, b = { name: 'B' }, c = { name: 'C' };
  const room = { tiles: [a, b, c] };
  const self = { _removePairTwin() {}, _renderForm() {} };
  const box = {};
  const rm = make.call(self, room, b, 1, box);
  rm(); rm();
  assert.deepEqual(room.tiles, [a, c], 'Doppelklick entfernt nur B');

  // Stelle i ist veraltet (vorher ist etwas weggefallen): gesucht wird die Kachel selbst.
  const room2 = { tiles: [b, c] };
  make.call(self, room2, c, 2, {})();
  assert.deepEqual(room2.tiles, [b], 'Kachel per indexOf, nicht per i');
  // Schon fort: nichts entfernen.
  const room3 = { tiles: [a, c] };
  make.call(self, room3, b, 0, {})();
  assert.deepEqual(room3.tiles, [a, c], 'nicht gefunden → nichts');
}

// ── _armRow: „Löschen“ der Zeile feuert nur einmal ─────────────────────────────────
{
  const body = method('_armRow(row, label, remove) {');
  const armRow = new Function('row', 'label', 'remove', body);
  const els = [];
  globalThis.document = { createElement: () => { const e = { setAttribute() {} }; els.push(e); return e; } };
  const row = { appendChild() {}, classList: { add() {}, remove() {} } };
  const self = { _disarmRow() {}, shadowRoot: null };
  let n = 0;
  armRow.call(self, row, 'Licht 2', () => { n++; });
  const del = els[0];
  const ev = { stopPropagation() {} };
  del.onclick(ev); del.onclick(ev);
  assert.equal(n, 1, 'Doppelklick → remove nur einmal');
}

// ── drop (Mitglied n) per Wert, dropFirst nur einmal ───────────────────────────────
{
  const dropCode = arrow('const drop = () => {', '        ');
  assert.ok(/cur\[n\] === member/.test(dropCode), 'drop sucht per Wert');
  const mk = new Function('tile', 'grp', 'n', 'member', 'collapse', 'syncEntity', dropCode + '\nreturn drop;');
  const self = { _renderForm() {} };
  const grp = { list: 'lights', perMember: [] };
  const tile = { entity: 'light.a', variables: { lights: ['light.a', 'light.b', 'light.c', 'light.d'] } };
  const collapse = () => { delete tile.variables.lights; };
  const drop = mk.call(self, tile, grp, 2, 'light.c', collapse, () => {});
  drop(); drop();
  assert.deepEqual(tile.variables.lights, ['light.a', 'light.b', 'light.d'], 'Doppelt → nur light.c weg');
  // Index verrutscht (davor ist eins weggefallen): trotzdem das richtige Mitglied.
  const tile2 = { variables: { lights: ['light.a', 'light.c', 'light.d'] } };
  mk.call(self, tile2, grp, 2, 'light.c', () => {}, () => {})();
  assert.deepEqual(tile2.variables.lights, ['light.a', 'light.d'], 'per Wert statt Stelle');
  // Nach collapse (variables weg): kein Fehler, nichts passiert.
  const tile3 = { entity: 'light.a' };
  mk.call(self, tile3, grp, 1, 'light.b', () => {}, () => {})();
  assert.equal(tile3.variables, undefined, 'ohne Liste → nichts');

  const firstCode = arrow('const dropFirst = () => {', '        ');
  const mkFirst = new Function('tile', 'grp', 'list', 'collapse', firstCode + '\nreturn dropFirst;');
  // Erste Zeile (Kachel-Entität) entfernen – Fall aus Issue #21 bleibt.
  const list = ['light.a', 'light.b', 'light.c'];
  const t4 = { entity: 'light.a', variables: { lights: list } };
  const df = mkFirst.call(self, t4, grp, list, () => { delete t4.variables.lights; });
  df();
  assert.deepEqual(t4.variables.lights, ['light.b', 'light.c'], 'erste Zeile entfernt');
  assert.equal(t4.entity, 'light.b', 'nächste rückt nach');
  df();
  assert.deepEqual(t4.variables.lights, ['light.b', 'light.c'], 'zweiter Klick ändert nichts');
  assert.equal(t4.entity, 'light.b');
}

// ── Raum löschen: nach der Rückfrage frisch suchen ─────────────────────────────────
{
  const body = method('async _roomMenuAction(id, i) {');
  const act = new Function('id', 'i', 'return (async () => {' + body + '\n})();');
  const mkSelf = (rooms, during) => ({
    _state: { compact: { rooms } },
    _roomLabel: (r) => r.name,
    _roomDeleteBlock() { return ''; },
    async _ask() { during(this); return true; },
    _renderTabs() {}, _renderForm() {},
    shadowRoot: { querySelector: () => null },
  });
  const H = { name: 'Home' }, K = { name: 'Küche' }, B = { name: 'Bad' }, N = { name: 'Neu' };
  // Während der Rückfrage kommt vorne ein Raum dazu: gelöscht wird trotzdem „Küche“.
  const rooms = [H, K, B];
  const self = mkSelf(rooms, () => rooms.splice(1, 0, N));
  await act.call(self, 'delete', 1);
  assert.deepEqual(rooms.map((r) => r.name), ['Home', 'Neu', 'Bad'], 'richtiger Raum');
  // Anderes Dashboard / Rückgängig: Raum nicht mehr da → nichts löschen.
  const rooms2 = [H, K, B];
  const self2 = mkSelf(rooms2, (me) => { me._state = { compact: { rooms: [H, B] } }; });
  await act.call(self2, 'delete', 1);
  assert.deepEqual(self2._state.compact.rooms.map((r) => r.name), ['Home', 'Bad'], 'neuer Stand unberührt');
  assert.deepEqual(rooms2.map((r) => r.name), ['Home', 'Küche', 'Bad'], 'alter Stand unberührt');
}

console.log('ok checkup_panel_loeschen');
