// Weich-Wiedergabe (05.10.2026): Gruppieren gleicher Wiedergaben und „Ausblenden“ je Gerät.
//   node dev/unit/np_gruppe_ausblenden.mjs
// Prüft ohne Browser: (1) 09-weich-wiedergabe.js fasst Player mit gleichem Titel und Interpret zu
// einer Zeile zusammen und benennt die Geräte („A“, „HomePod Küche + Büro“, „A + B“, „A + 2“).
// (2) window._casoraNPHidden (casora-core.js, Block casora-np-hidden) blendet aus, bis der Player
// etwas anderes spielt oder die Wiedergabe endet; fremde Player (andere Karte) bleiben unberührt.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = new URL('../../custom_components/casora/scripts/', import.meta.url);

// ── 09: Gruppieren und Namen ──
const store = {};
const win = {
  addEventListener() {}, dispatchEvent() {}, matchMedia: () => ({ matches: false }),
  localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
};
const ctx = vm.createContext({ window: win, document: {}, setTimeout: () => 0, setInterval: () => 0, clearInterval() {},
  requestAnimationFrame() {}, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, console });
win.window = win;
vm.runInContext(fs.readFileSync(new URL('local/09-weich-wiedergabe.js', root), 'utf8'), ctx);
const NP = win._casoraNPSoft;
const J = (x) => JSON.parse(JSON.stringify(x)); // Ergebnisse aus dem vm-Kontext vergleichbar machen
assert.equal(typeof NP.group, 'function', '_casoraNPSoft.group fehlt');

const rec = (key, entity, title, artist, playing = true, extra = {}) => ({ key, kind: 'player', entity, title, mtitle: title,
  subtitle: artist, playing, controls: { toggle: true }, ...extra });
const states = {};
const name = (id, n) => { states[id] = { attributes: { friendly_name: n } }; };
name('media_player.a', 'HomePod Küche'); name('media_player.b', 'HomePod Büro'); name('media_player.c', 'Lautsprecher Flur');
name('media_player.d', 'Fernseher');

// Gleicher Titel + Interpret → eine Gruppe, an der Stelle des ersten Players.
let g = NP.group([rec('mp1', 'media_player.a', 'Lied', 'Band'), rec('mp3', 'media_player.d', 'Film', ''),
  rec('mp2', 'media_player.b', 'Lied', 'Band', false)]);
assert.deepEqual(J(g.map((x) => x.recs.map((r) => r.key))), [['mp1', 'mp2'], ['mp3']]);
assert.equal(g[0].key, 'mp1');
assert.equal(NP.subline(g[0], states), 'HomePod Küche + Büro · Band');
// Fortschritt vom spielenden Player: der zweite spielt, der erste ist pausiert.
g = NP.group([rec('mp1', 'media_player.a', 'Lied', 'Band', false), rec('mp2', 'media_player.b', 'Lied', 'Band', true)]);
assert.equal(g[0].live.key, 'mp2');
assert.equal(g[0].lead.key, 'mp1', 'Antippen öffnet den ersten Player');

// Anderer Interpret, anderer Titel, Groß/Klein und Leerzeichen.
g = NP.group([rec('mp1', 'media_player.a', 'Lied', 'Band'), rec('mp2', 'media_player.b', 'Lied', 'Andere')]);
assert.equal(g.length, 2, 'anderer Interpret = eigene Zeile');
g = NP.group([rec('mp1', 'media_player.a', 'Lied ', 'band'), rec('mp2', 'media_player.b', 'lied', 'Band ')]);
assert.equal(g.length, 1, 'Groß/Klein und Leerzeichen zählen nicht');
// Ohne echten Medientitel (Ersatz durch den Gerätenamen) nie gruppieren; Spiele/Aktivitäten nie.
g = NP.group([rec('mp1', 'media_player.a', 'Medien', '', true, { mtitle: '' }), rec('mp2', 'media_player.b', 'Medien', '', true, { mtitle: '' })]);
assert.equal(g.length, 2);
g = NP.group([{ key: 'steam', kind: 'activity', title: 'Spiel', subtitle: '' }, { key: 'discord', kind: 'activity', title: 'Spiel', subtitle: '' }]);
assert.equal(g.length, 2);
// Ältere Quelle ohne mtitle: Titel zählt nur zusammen mit einem Interpreten.
g = NP.group([{ key: 'mp1', kind: 'player', title: 'Lied', subtitle: 'Band' }, { key: 'mp2', kind: 'player', title: 'Lied', subtitle: 'Band' }]);
assert.equal(g.length, 1);
g = NP.group([{ key: 'mp1', kind: 'player', title: 'Wohnzimmer', subtitle: '' }, { key: 'mp2', kind: 'player', title: 'Wohnzimmer', subtitle: '' }]);
assert.equal(g.length, 2);

// Namen.
assert.equal(NP.names(['HomePod Küche']), 'HomePod Küche');
assert.equal(NP.names(['HomePod Küche', 'HomePod Büro']), 'HomePod Küche + Büro');
assert.equal(NP.names(['HomePod Küche', 'homepod Büro Links']), 'HomePod Küche + Büro Links');
assert.equal(NP.names(['HomePod Küche', 'Lautsprecher Flur']), 'HomePod Küche + Lautsprecher Flur');
assert.equal(NP.names(['HomePod', 'HomePod Büro']), 'HomePod + HomePod Büro', 'ein Wort allein wird nicht gekürzt');
assert.equal(NP.names(['A Eins', 'A Zwei', 'B Drei']), 'A Eins + 2');
assert.equal(NP.names(['A', 'B', 'C', 'D']), 'A + 3');
assert.equal(NP.names(['', 'B']), 'B');
// Unterzeile: Interpret · Geräte; ohne Interpret nur die Geräte.
g = NP.group([rec('mp1', 'media_player.a', 'Lied', ''), rec('mp2', 'media_player.b', 'Lied', ''), rec('mp3', 'media_player.c', 'Lied', '')]);
assert.equal(NP.subline(g[0], states), 'HomePod Küche + 2');

// ── casora-core.js: Ausblenden ──
const core = fs.readFileSync(new URL('casora-core.js', root), 'utf8');
const a = core.indexOf('// casora-np-hidden:start'), b = core.indexOf('// casora-np-hidden:end');
assert.ok(a > 0 && b > a, 'Block casora-np-hidden nicht gefunden');
const events = [];
const w2 = { localStorage: win.localStorage, dispatchEvent: (e) => events.push(e.type) };
w2.window = w2;
const run = new Function('window', 'CustomEvent', 'setTimeout', 'clearTimeout', core.slice(a, b));
run(w2, ctx.CustomEvent, () => 0, () => {});
const H = w2._casoraNPHidden;
assert.equal(typeof H.filter, 'function');
const V = { show_media_player_1: true, media_player_1: 'media_player.a', show_media_player_2: true, media_player_2: 'media_player.b' };
const Vother = { show_media_player_1: true, media_player_1: 'media_player.x' };
const A = rec('mp1', 'media_player.a', 'Lied', 'Band'), B = rec('mp2', 'media_player.b', 'Lied', 'Band');
const C = rec('mp3', 'media_player.d', 'Film', '');

assert.deepEqual(H.filter([A, B, C], V), [A, B, C], 'ohne Einträge unverändert');
const v0 = H.ver();
H.hide([A, B]);
assert.ok(H.ver() > v0, 'Version steigt');
assert.ok(events.includes('casora-np-changed'), 'Ansichten werden benachrichtigt');
assert.deepEqual(Object.keys(JSON.parse(store['casora.np.hidden'])).sort(), ['media_player.a', 'media_player.b']);
assert.deepEqual(H.filter([A, B, C], V).map((r) => r.key), ['mp3'], 'Gruppe ausgeblendet');
// Pausieren derselben Wiedergabe: bleibt ausgeblendet.
assert.deepEqual(H.filter([{ ...A, playing: false, state: 'paused' }, B, C], V).map((r) => r.key), ['mp3']);
// Andere Karte ohne diese Player: Einträge bleiben stehen.
H.filter([], Vother);
assert.equal(Object.keys(JSON.parse(store['casora.np.hidden'])).length, 2, 'fremde Karte räumt nichts ab');
// Anderer Titel auf Player b: b kommt zurück, a bleibt ausgeblendet.
const B2 = rec('mp2', 'media_player.b', 'Neues Lied', 'Band');
assert.deepEqual(H.filter([A, B2, C], V).map((r) => r.key), ['mp2', 'mp3']);
assert.deepEqual(Object.keys(JSON.parse(store['casora.np.hidden'])), ['media_player.a']);
// Wiedergabe von a endet (fällt aus der Liste): Eintrag weg – startet a wieder, ist es zu sehen.
H.filter([B2, C], V);
assert.equal(store['casora.np.hidden'], undefined, 'leer = Schlüssel entfernt');
assert.deepEqual(H.filter([A, B2, C], V).map((r) => r.key), ['mp1', 'mp2', 'mp3']);
// Gespeichertes überlebt ein Neuladen (frischer Zustand liest localStorage).
H.hide([C]);
H._reset();
assert.deepEqual(H.filter([A, C], { show_media_player_1: true, media_player_1: 'media_player.d' }).map((r) => r.key), ['mp1']);
H.clear();
assert.equal(store['casora.np.hidden'], undefined);

console.log('np_gruppe_ausblenden: ok');
