// Zeitreise: Zusammenfassung eines Stands ohne Browser.  node dev/unit/zeitreise.mjs
// Gemeldet (Nachtbericht Lücken B, 03.10.2026): Ein Stand hieß „Zuhause: Badges · Küche: …“,
// obwohl an Zuhause nichts geändert war, und die Flur-Änderung aus derselben Minute fehlte.
// Ursachen: (a) das Speichern leitet die Energie-Unterbadges von Zuhause ab und setzt dabei
// energy_subs_auto – der Vergleich zählte das als Badge-Änderung; (b) mehrere Speicherungen
// kurz hintereinander wurden nie zusammengefasst (ts ist ISO-Text, der Abstand war NaN), und
// das Festhalten lief nebenher, sodass ein folgendes Speichern dazwischenkommen konnte.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'nicht gefunden: ' + re);
  const end = src.indexOf('\n}', m.index);
  return src.slice(m.index, end + 2);
}
const deriveEnergyRooms = new Function(grab(/^function deriveEnergyRooms\(/m) + '\nreturn deriveEnergyRooms;')();

// Das Versionen-Modul mit einem Mini-window laden; extractAny liest hier schon fertige Zustände.
const window = {
  __casoraPanelInternals: { extractAny: (cfg) => JSON.parse(JSON.stringify(cfg)), deriveEnergyRooms },
};
const customElements = { whenDefined: () => new Promise(() => {}) };
const vsrc = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-versions.js', import.meta.url), 'utf8');
new Function('window', 'customElements', vsrc)(window, customElements);
const V = window.__casoraVersionsInternals;
assert.ok(V && V.summarize, 'Versionen-Bausteine fehlen');

const tile = (name, entity) => ({ type: 'custom:button-card', template: ['casora_light'], entity, name });
const room = (path, name, variables, tiles) => ({ path, name, variables: variables || {}, tiles: tiles || [] });
const state = (rooms) => ({ compact: { rooms } });
const clone = (x) => JSON.parse(JSON.stringify(x));

// Ausgangsstand wie aus einem Import: Zuhause ohne abgeleitete Energie-Badges, Küche mit Monatskosten.
const base = state([
  room('home', 'Home', { show_energy: true, light_entity_1: 'light.a' }, [tile('Licht', 'light.a')]),
  room('kueche', 'Küche', { energy_cost_month: 'sensor.kueche_kosten' }, [tile('Spüle', 'light.k1'), tile('Herd', 'light.k2')]),
  room('flur', 'Flur', {}, [tile('Decke', 'light.f1')]),
]);

// (a) Speichern so nachstellen, wie _save es tut: abgeleitete Badges + casora_ui_managed.
const saved = (st) => {
  const out = clone(st);
  deriveEnergyRooms(out.compact.rooms);
  out.compact.rooms.forEach((r) => { r.variables.casora_ui_managed = true; });
  return out;
};

{
  const after = clone(base);
  after.compact.rooms[1].tiles[0].name = 'Spüle neu';
  const s = JSON.parse(V.summarize(base, saved(after), null, null, false));
  assert.deepEqual(s.changed, ['Küche'], '(a) nur Küche geändert, nicht Zuhause: ' + JSON.stringify(s.changed));
  assert.deepEqual(s.detail, { 'Küche': ['tiles'] });
  assert.equal(V.describe({ kind: 'save', summary: JSON.stringify(s) }).includes('Badges'), false, '(a) keine „Badges“');
}
{
  // Eine echte Badge-Änderung an Zuhause bleibt sichtbar.
  const after = clone(base);
  after.compact.rooms[0].variables.light_entity_2 = 'light.b';
  const s = JSON.parse(V.summarize(base, saved(after), null, null, false));
  assert.deepEqual(s.changed, ['Home']);
  assert.deepEqual(s.detail.Home, ['badges'], 'echte Badge-Änderung wird genannt');
}
{
  // Nichts geändert, nur gespeichert: kein Raum gilt als geändert.
  const s = JSON.parse(V.summarize(base, saved(base), null, null, false));
  assert.deepEqual(s.changed, [], 'reines Speichern ändert nichts: ' + JSON.stringify(s.changed));
}

// (b) Drei Speicherungen kurz hintereinander (Küche, Küche, Flur): ein Eintrag, alle Änderungen.
{
  const s1 = clone(base); s1.compact.rooms[1].tiles[0].name = 'Spüle A';
  const s2 = clone(s1); s2.compact.rooms[1].tiles[1].name = 'Herd B';
  const s3 = clone(s2); s3.compact.rooms[2].tiles[0].name = 'Decke X';
  const sum = [V.summarize(base, saved(s1), null, null, false),
    V.summarize(saved(s1), saved(s2), null, null, false),
    V.summarize(saved(s2), saved(s3), null, null, false)];
  // Neueste zuerst, wie casora/versions/list sie liefert; ts als ISO-Text mit Zeitzone.
  const list = [
    { id: '3', ts: '2026-10-03T11:57:09.100000+02:00', kind: 'save', summary: sum[2] },
    { id: '2', ts: '2026-10-03T11:57:05.200000+02:00', kind: 'save', summary: sum[1] },
    { id: '1', ts: '2026-10-03T11:57:01.300000+02:00', kind: 'save', summary: sum[0] },
    { id: '0', ts: '2026-10-03T02:17:11.000000+02:00', kind: 'save', summary: '' },
  ];
  const g = V.groupVersions(list);
  assert.equal(g.length, 2, 'drei Speicherungen in zwei Minuten ergeben einen Eintrag: ' + g.length);
  assert.equal(g[0].id, '3', 'der neueste steht für die Gruppe');
  assert.equal(g[0].grouped, 3);
  const m = JSON.parse(g[0].summary);
  assert.deepEqual(m.changed.sort(), ['Flur', 'Küche'], 'Flur und Küche: ' + JSON.stringify(m.changed));
  const txt = V.describe(g[0]);
  assert.ok(txt.includes('Flur'), 'Flur steht in der Zusammenfassung: ' + txt);
  assert.ok(txt.includes('Küche'), 'Küche steht in der Zusammenfassung: ' + txt);
  assert.ok(!txt.includes('Badges'), 'keine erfundenen Badges: ' + txt);
}
{
  // „Angelegt“ und „Vorlagen erneuert“ sind eigene Schritte und werden nicht verschluckt.
  const list = [
    { id: 'c', ts: '2026-10-02T23:07:22+02:00', kind: 'save', summary: '{"origin":"created"}' },
    { id: 'u', ts: '2026-10-02T23:06:50+02:00', kind: 'save', summary: '{"origin":"update","added":[],"removed":[],"changed":[]}' },
  ];
  const g = V.groupVersions(list);
  assert.equal(g.length, 2, 'Angelegt bleibt ein eigener Eintrag');
  assert.equal(V.describe(g[0]), 'Created');
}
{
  // Mehr als zwei Minuten Abstand: getrennte Einträge.
  const list = [
    { id: 'b', ts: '2026-10-03T12:10:00+02:00', kind: 'save', summary: '' },
    { id: 'a', ts: '2026-10-03T12:00:00+02:00', kind: 'save', summary: '' },
  ];
  assert.equal(V.groupVersions(list).length, 2);
}

// Das Festhalten nach dem Speichern wird abgewartet (sonst kann das nächste Speichern dazwischenkommen).
assert.match(vsrc, /await this\._hass\.callWS\(\{ type: "casora\/versions\/snap", url_path, mobile_url, kind: "save", summary \}\)/,
  'Snap nach dem Speichern muss abgewartet werden');
// Lange Zusammenfassungen werden nicht mitten im JSON abgeschnitten.
const py = fs.readFileSync(new URL('../../custom_components/casora/versions.py', import.meta.url), 'utf8');
assert.ok(/SUMMARY_MAX = (\d+)/.exec(py) && Number(/SUMMARY_MAX = (\d+)/.exec(py)[1]) >= 2000, 'Zusammenfassung darf lang sein');

// Benannte und angeheftete Stände (06.10.2026): nie in eine Gruppe, angeheftete oben,
// „Jetzt“ ist der aktuelle Stand, nicht der erste Eintrag.
{
  const list = [
    { id: 'c', ts: '2026-10-03T12:01:00+02:00', kind: 'save', summary: '', current: true },
    { id: 'b', ts: '2026-10-03T12:00:30+02:00', kind: 'save', summary: '', name: 'Vor dem Umbau', pinned: true },
    { id: 'a', ts: '2026-10-03T12:00:00+02:00', kind: 'save', summary: '' },
  ];
  const g = V.groupVersions(list);
  assert.equal(g.length, 3, 'benannter Stand bleibt für sich');
  const o = V.pinnedFirst(g);
  assert.deepEqual(o.map((v) => v.id), ['b', 'c', 'a'], 'angeheftet oben');
  assert.equal(V.nowOf(o).id, 'c', 'Jetzt = aktueller Stand');
}

console.log('zeitreise: ok');
