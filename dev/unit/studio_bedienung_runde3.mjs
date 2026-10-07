// Studio-Bedienung nach Nutzertest Runde 3 ohne Browser.  node dev/unit/studio_bedienung_runde3.mjs
// - Änderungsliste: nach „Zurücknehmen“ ist „Wiederholen“ (⇧⌘Z) möglich und holt die Zeile zurück;
//   ⌘Z danach nimmt sie wieder zurück. ⌘Z direkt nach dem Zurücknehmen holt sie ebenfalls zurück.
// - Suche ⌘K findet Geräte ohne Kachel („Kachel für Stehlampe hinzufügen“) und legt sie im Raum des Geräts an.
// - „…“-Menü trägt „Auf Handy öffnen“; das Raummenü nennt ausgeblendete Räume oben.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const clone = (x) => JSON.parse(JSON.stringify(x));

// Kleines Panel als Ersatz: Rückgängig-Stapel wie im echten Panel (_undo nimmt den obersten Stand).
class Panel {
  constructor() {
    this.classList = { contains: (c) => c === 'bmode' };
    this.shadowRoot = null;
    this._undoStack = [];
  }
  _snap() { return clone(this.cur); }
  _undo() { const s = this._undoStack.pop(); if (s) this.cur = clone(s); }
  _markDirty() { this._lastPrint = JSON.stringify(this.cur); }
  _resetUndo() { this._undoStack = []; }
  _isDirty() { return JSON.stringify(this.cur) !== JSON.stringify(this._mBase); }
  _roomLabel(r) { return r.name; }
  _tileKey(t) { return t.entity; }
  _menuAt(anchor, items, onPick) { this.menu = { items, onPick }; }
  _renderTabs() {}
  _renderForm() {}
}
const win = {
  document: {},
  requestAnimationFrame: (f) => f(),
};
const ce = { whenDefined: () => Promise.resolve(), get: () => Panel };
new Function('window', 'customElements', 'requestAnimationFrame', 'setTimeout', read('panel/casora-panel-b-mehr.js'))(win, ce, (f) => f(), (f) => f());
await new Promise((r) => setImmediate(r));
assert.ok(Panel.prototype.__casoraMehr, 'Modul hat das Panel erweitert');

const tile = (name, entity) => ({ type: 'custom:button-card', template: 'casora_light', name, entity });
const room = (path, name, tiles, variables) => ({ path, name, tiles: tiles || [], variables: variables || {} });
const state = (rooms) => ({ s: [{ rooms }, {}, {}, null], m: null });

// ── Zurücknehmen → Wiederholen ──
{
  const p = new Panel();
  p._state = { compact: {} };
  p._mBase = state([room('home', 'Home', [tile('A', 'light.a')]), room('kueche', 'Küche'), room('bad', 'Bad', [], { climate_title: undefined })]);
  p.cur = clone(p._mBase);
  p._lastPrint = JSON.stringify(p.cur);
  // zwei Änderungen: Küche → Kochecke, Badge „Luft“
  p._undoStack.push(p._snap()); p.cur.s[0].rooms[1].name = 'Kochecke'; p._markDirty();
  p._undoStack.push(p._snap()); p.cur.s[0].rooms[2].variables.climate_title = 'Luft'; p._markDirty();
  const lines = p._mChanges();
  assert.equal(lines.length, 2, 'zwei Zeilen');
  const iBadge = p._mItems().findIndex((x) => /Luft/.test(x.text));
  assert.ok(p._mRevert(iBadge), 'Zeile lässt sich zurücknehmen');
  assert.equal(p.cur.s[0].rooms[2].variables.climate_title, undefined, 'Badge zurück');
  assert.equal(p.cur.s[0].rooms[1].name, 'Kochecke', 'Umbenennen bleibt');
  assert.equal((p._mRedo || []).length, 1, '„Wiederholen“ ist danach möglich (war ausgegraut)');
  p._redo();
  assert.equal(p.cur.s[0].rooms[2].variables.climate_title, 'Luft', 'Wiederholen holt die Zeile zurück');
  assert.equal((p._mRedo || []).length, 0);
  p._undo();
  assert.equal(p.cur.s[0].rooms[2].variables.climate_title, undefined, '⌘Z nimmt sie wieder zurück (kein doppelter Stand)');
  p._undo();
  assert.equal(p.cur.s[0].rooms[1].name, 'Kochecke', 'danach weiter zurück wie gewohnt: Stand vor dem Badge');
  p._undo();
  assert.equal(p.cur.s[0].rooms[1].name, 'Küche', '… und vor dem Umbenennen');

  // ⌘Z direkt nach dem Zurücknehmen holt die Zeile auch zurück, ⇧⌘Z nimmt sie wieder zurück.
  const q = new Panel();
  q._state = { compact: {} };
  q._mBase = clone(p._mBase);
  q.cur = clone(q._mBase);
  q._lastPrint = JSON.stringify(q.cur);
  q._undoStack.push(q._snap()); q.cur.s[0].rooms[1].name = 'Kochecke'; q._markDirty();
  assert.ok(q._mRevert(0));
  assert.equal(q.cur.s[0].rooms[1].name, 'Küche');
  q._undo();
  assert.equal(q.cur.s[0].rooms[1].name, 'Kochecke', '⌘Z holt sie zurück');
  q._redo();
  assert.equal(q.cur.s[0].rooms[1].name, 'Küche', '⇧⌘Z nimmt sie wieder zurück');
  // Eine neue Änderung leert „Wiederholen“ wie bisher.
  assert.ok(q._mRevert === Panel.prototype._mRevert);
  q._undoStack.push(q._snap()); q.cur.s[0].rooms[0].name = 'Daheim'; q._markDirty();
  assert.equal((q._mRedo || []).length, 0, 'neue Änderung leert Wiederholen');
}

// ── Suche: Gerät ohne Kachel ──
{
  const p = new Panel();
  const rooms = [room('home', 'Home', [tile('A', 'light.a')]), room('wohnzimmer', 'Wohnzimmer'), room('schlafzimmer', 'Schlafzimmer')];
  p._state = { compact: { rooms } };
  p._room = 1;
  p._hass = { states: {}, entities: {} };
  p._uxDevices = () => [
    { entity: 'light.lightstrip', name: 'Stehlampe', area: 'Schlafzimmer', roomIndex: 2, kind: 'Licht', fresh: true },
    { entity: 'light.a', name: 'A', area: '', roomIndex: 0, kind: 'Licht', fresh: false },
  ];
  let added = null;
  p._uxAddDevice = (c, o) => { added = { c, o }; };
  const items = p._mSearchItems();
  assert.ok(!items.some((x) => x.id === 'd:light.a'), 'Geräte mit Kachel nicht doppelt');
  const hit = win.__casoraStudioMehr.searchRank(items, 'Stehlampe')[0];
  assert.ok(hit && hit.kind === 'device', 'Stehlampe wird gefunden');
  assert.equal(hit.label, 'Add tile for Stehlampe');
  assert.equal(hit.path, 'New in Schlafzimmer – no tile yet');
  hit.run();
  assert.equal(added.c.entity, 'light.lightstrip');
  assert.deepEqual(added.o, { direct: true }, 'ohne Rückfrage in den Raum des Geräts');
  assert.ok(!win.__casoraStudioMehr.searchRank(items, '').length, 'leere Suche zeigt keine Geräte');
}

// ── Menüs: QR im „…“, ausgeblendete Räume im Raummenü ──
{
  const p = new Panel();
  const rooms = [room('home', 'Home'), room('bad', 'Bad'), room('garten', 'Garten', [], { casora_hidden: true })];
  p._state = { compact: { rooms } };
  p._room = 1;
  p._dashUrl = 'test-neu';
  p._mChanges = () => [];
  let qr = 0, arrange = 0;
  p._mQr = () => { qr++; };
  p._bRoomsOpen = () => { arrange++; };
  p._menuAt(null, [{ id: 'setup', label: 'Setup assistant…' }, { id: 'hints', label: 'Show hints' }], () => {});
  const ids = p.menu.items.map((x) => x.id);
  assert.ok(ids.indexOf('mqr') >= 0 && ids.indexOf('mqr') < ids.indexOf('hints'), '„Auf Handy öffnen“ im „…“');
  p.menu.onPick('mqr');
  assert.equal(qr, 1);
  p._menuAt(null, rooms.map((r, i) => ({ id: 'go:' + i, label: r.name, group: 'Rooms' }))
    .concat([{ id: 'rename', group: 'This Room' }, { id: 'delete', group: 'This Room' }]), () => {});
  const it = p.menu.items;
  assert.equal(it[0].id, 'mhidden', 'Hinweis oben in der Raumliste');
  assert.equal(it[0].label, '1 room hidden ›');
  assert.ok(it.find((x) => x.id === 'go:2').label.endsWith('· Hidden'), 'Raum selbst bleibt gekennzeichnet');
  p.menu.onPick('mhidden');
  assert.equal(arrange, 1, 'führt zu „Räume ordnen“');
  // ohne ausgeblendeten Raum kein Hinweis
  delete rooms[2].variables.casora_hidden;
  p._menuAt(null, rooms.map((r, i) => ({ id: 'go:' + i, label: r.name, group: 'Rooms' })).concat([{ id: 'rename', group: 'This Room' }]), () => {});
  assert.ok(!p.menu.items.some((x) => x.id === 'mhidden'));
}

console.log('studio_bedienung_runde3: ok');
