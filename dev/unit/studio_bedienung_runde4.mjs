// Studio-Bedienung nach Nutzertest Runde 4 ohne Browser.  node dev/unit/studio_bedienung_runde4.mjs
// - Änderungsliste: „Küche → Kochecke“ lässt sich einzeln zurücknehmen, auch wenn danach im selben
//   Raum Kacheln/Badges geändert wurden; echte Abhängigkeiten nennen die andere Zeile.
// - HA-Kürzel aus einem Buchstaben feuern im Studio nicht; die Suche fokussiert sofort.
// - Ausgeblendete Räume: im Hinweis „N ausgeblendet“, in Raumknopf/Vorschau-Leiste markiert;
//   „Fertig“ öffnet dann die Startseite statt der versteckten Raumseite.
// - Szene: Toast sagt ehrlich, dass die Farbe mit dem Dashboard gespeichert wird.
// - Rückfrage eingeschaltet: Toast mit „Ausprobieren“ statt Verweis auf einen Knopf.
// - Tablet-Leiste: gemessen mit dem längsten Raumnamen, letzte Stufe ohne Raumnamen.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const J = JSON.stringify;
const clone = (x) => JSON.parse(J(x));
const mehr = read('panel/casora-panel-b-mehr.js');
const load = (src) => { const w = {}; new Function('window', src)(w); return w.__casoraStudioMehr; };
const { changeLines, revertLine } = load(mehr);

const tile = (name, entity, extra) => ({ type: 'custom:button-card', template: 'casora_light', name, entity, ...(extra || {}) });
const room = (path, name, tiles, variables) => ({ path, name, tiles: tiles || [], variables: variables || {} });
const st = (rooms) => [{ rooms }, {}, {}, null, null];
const base = st([
  room('home', 'Home', [tile('A', 'light.a')]),
  room('kueche', 'Küche', [tile('Spüle', 'light.s'), tile('Herd', 'switch.h')]),
]);

// 1) Umbenennen + Kachel aus + Badge im selben Raum
const now = clone(base);
const k = now[0].rooms[1];
k.name = 'Kochecke'; Object.assign(k.variables, { room_name: 'Kochecke' });
k.tiles[0].enabled = false;
k.variables.climate_title = 'Luft';
const lines = changeLines(base, now, {});
assert.deepEqual(lines, ['Room renamed: Küche → Kochecke', 'Tile turned off: Spüle · Kochecke', 'Badge renamed: Climate → Luft · Kochecke']);
const r0 = revertLine(base, now, 0, {});
assert.ok(r0.state, 'Umbenennung im selben Raum einzeln zurücknehmbar (war „hängt zusammen“)');
assert.equal(r0.state[0].rooms[1].name, 'Küche');
assert.equal(r0.state[0].rooms[1].variables.room_name, undefined, 'Nebenwert der Umbenennung auch zurück');
assert.equal(r0.state[0].rooms[1].tiles[0].enabled, false, 'Kachel bleibt aus');
assert.equal(r0.state[0].rooms[1].variables.climate_title, 'Luft', 'Badge bleibt');
assert.deepEqual(changeLines(base, r0.state, {}), ['Tile turned off: Spüle · Küche', 'Badge renamed: Climate → Luft · Küche']);
for (const i of [1, 2]) assert.ok(revertLine(base, now, i, {}).state, 'Zeile ' + i + ' bleibt einzeln zurücknehmbar');
// Mit Anzeigenamen aus dem Studio (ctx.roomName) genauso
const ctx = { roomName: (r) => (r.variables && r.variables.room_name) || r.name };
assert.ok(revertLine(base, now, 0, ctx).state, 'auch mit eigenem Anzeigenamen');

// 2) Echte Abhängigkeit: Grund nennt die andere Zeile (Fingerabdruck künstlich verfälscht)
const forced = load(mehr.replace('const got = desk(changeLines(before, x, fctx)).sort();',
  'const got = desk(changeLines(before, x, fctx)).sort().slice(1);'));
const rl = forced.revertLine(base, now, 0, {});
assert.equal(rl.why, 'linked');
assert.ok(lines.slice(1).includes(rl.with), 'nennt die verknüpfte Zeile: ' + rl.with);
assert.ok(mehr.includes('tr("Only together with “{line}” – use Undo for both.")'), 'Grund am ausgegrauten Knopf');

// 3) Tastatur: Einbuchstaben-Kürzel abgefangen, Suche sofort fokussiert
assert.ok(/String\(ev\.key \|\| ""\)\.length !== 1/.test(mehr) && /isContentEditable\)\) return;\n\s*ev\.preventDefault\(\);\n\s*\}\);/.test(mehr),
  'Buchstaben ohne Eingabefeld: preventDefault (HA ignoriert dann a/e/c/d/m)');
assert.ok(/paint\(\);\n[^\n]*\n[^\n]*\n\s*input\.focus\(\);/.test(mehr), 'Suchfeld bekommt den Fokus sofort');

// 4) Ausgeblendete Räume
const b = read('panel/casora-panel-b.js');
assert.ok(b.includes('P._bHiddenRooms = function') && b.includes('hid.badges.length + hRooms.length'), 'Hinweis zählt ausgeblendete Räume');
assert.ok(/id\.indexOf\("r:"\) === 0\) \{ if \(this\._mHideRoom\) this\._mHideRoom\(\+id\.slice\(2\), false\)/.test(b), 'Antippen blendet wieder ein');
assert.ok(b.includes('rbtn.classList.toggle("bhidroom", hid)'), 'Raumknopf markiert');
const panel = read('panel/casora-panel.js');
assert.ok(panel.includes('(hid ? " hid" : "")') && panel.includes('.mini-tab.hid::before'), 'Vorschau-Leiste markiert');
assert.ok(/if \(room && \(room\.variables \|\| \{\}\)\.casora_hidden\) room = null;/.test(panel), '„Fertig“: Startseite statt versteckter Raumseite');

// 5) Szene + Rückfrage
const plus = read('panel/casora-panel-b-plus.js');
assert.ok(plus.includes('The color is saved with the dashboard') && !plus.includes('"Saved in Home Assistant."'), 'Szenen-Toast ehrlich');
assert.ok(mehr.includes('action: { label: tr("Try it")') && !mehr.includes('Try it with “Show Popup”'), 'Toast mit „Ausprobieren“');

// 6) Tablet-Leiste
const ux = read('panel/casora-panel-b-ux.js');
// Vergleich 06.10. (#f7): nach der Lupe zeigt der Raumknopf den Namen (uxsr), die übrigen nur Symbole;
// erst wenn vom Namen kaum etwas bliebe, nur Symbole.
assert.ok(ux.includes('this.classList.add("uxsr")') && ux.includes('this.classList.add("btight", "uxs1", "uxs2")'), 'Stufen: Raumname, dann ohne Raumnamen');
assert.ok(/t\.length > long\.length/.test(ux) && /finally \{\n\s*if \(lab && keep !== null\) lab\.textContent = keep;/.test(ux), 'gemessen mit längstem Raumnamen');

// Übersetzungen
const de = JSON.parse(read('translations/panel/de.json')).exact;
for (const key of ['Only together with “{line}” – use Undo for both.', 'Try it', 'The popup in the preview asks too. Not saved yet.',
  'Scene saved in Home Assistant. The color is saved with the dashboard.',
  'Scene saved in Home Assistant. Pick a color now – it is saved with the dashboard.', 'Hidden on the dashboard', 'Show again']) {
  assert.ok(de[key], 'de.json: ' + key);
}
console.log('studio_bedienung_runde4: ok');

// Nebenfund P: Kachel über variables.enabled ausgeschaltet heißt „ausgeschaltet“, nicht „geändert“
{ const b2 = st([room('bad', 'Bad', [tile('Jalousie', 'cover.j')])]);
  const n2 = clone(b2); n2[0].rooms[0].tiles[0].variables = { enabled: false };
  assert.deepEqual(changeLines(b2, n2, {}), ['Tile turned off: Jalousie · Bad']);
  const n3 = clone(n2); const b3 = clone(n2); n3[0].rooms[0].tiles[0].variables = {};
  assert.deepEqual(changeLines(b3, n3, {}), ['Tile turned on: Jalousie · Bad']); }
console.log('studio_bedienung_runde4: Kachel an/aus ok');

// Nachtrag Gruppe E
{ const set = read('panel/casora-panel-settings.js');
  assert.ok(/else if \(this\._csSheetPage && this\._flowMode\)[^\n]*\n(\s*\/\/[^\n]*\n)*\s*else this\._csBar\(\);/.test(set), 'E-T3: Leiste nach dem Speichern auch am Handy zurückgesetzt');
  assert.ok(panel.includes('hint: "For desktop and tablet – the phone layout has no clock."'), 'E-T3: Uhr-Hinweis am Schalter (Abschnittstext ist verdeckt)');
  assert.ok(/mshow:/.test(mehr) && /this\._mHideRoom\(\+id\.slice\(6\), false\)/.test(mehr), 'E-T6: Räume-Menü blendet mit einem Tipp ein');
  const ver = read('panel/casora-panel-versions.js');
  assert.ok(ver.includes('if (this._bClose) this._bClose();') && ver.includes('t("Version restored")'), 'E-T9: Blatt zu, Bestätigung');
  for (const key of ['Version restored', 'For desktop and tablet – the phone layout has no clock.']) assert.ok(de[key], 'de.json: ' + key); }
console.log('studio_bedienung_runde4: Nachtrag E ok');
