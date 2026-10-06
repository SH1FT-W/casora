// Assist-Vorschläge (D-ASSIST, 06.10.2026): window.casoraAssistIdeas (00-finden.js) baut die
// Vorschlags-Chips aus dem eigenen Haus statt aus festen Sätzen. Geprüft: nur vorhandene Geräte,
// Raumnamen aus den Bereichen (im/in der), Reihenfolge Handlungsbedarf → Tageszeit → Allgemein,
// Anzahl (Handy 4, Desktop 6), gleiche Lage = gleiche Vorschläge.
//   node dev/unit/assist_vorschlaege.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(src('custom_components/casora/scripts/local/00-finden.js'))();

const ideas = window.casoraAssistIdeas;
const qs = (l) => l.map((x) => x.q);

// Haus: [state, attrs, area]
function house(st, areas = { wz: 'Wohnzimmer', ku: 'Küche', fl: 'Flur', ga: 'Garten' }) {
  const h = { states: {}, entities: {}, devices: {}, areas: {} };
  for (const [id, n] of Object.entries(areas)) h.areas[id] = { area_id: id, name: n };
  for (const [id, [state, attrs = {}, area = null, extra = {}]] of Object.entries(st)) {
    h.states[id] = { entity_id: id, state, attributes: attrs };
    h.entities[id] = { entity_id: id, area_id: area, ...extra };
  }
  return h;
}
const dimmable = { supported_color_modes: ['brightness'] };
const base = {
  'light.wz': ['off', dimmable, 'wz'],
  'light.wz2': ['off', dimmable, 'wz'],
  'light.ku': ['off', dimmable, 'ku'],
  'climate.wz': ['heat', { current_temperature: 21 }, 'wz'],
  'sensor.garten_temp': ['12', { device_class: 'temperature' }, 'ga'],
  'binary_sensor.fenster_ku': ['off', { device_class: 'window' }, 'ku'],
  'lock.tuer': ['locked', {}, 'fl'],
  'weather.home': ['cloudy', {}],
  'todo.shopping_list': ['2', { friendly_name: 'Einkaufsliste' }],
};

// Leeres Haus: keine Vorschläge (nichts ins Leere fragen)
assert.deepEqual(ideas(house({}), { hour: 9, max: 6 }), []);

// Kein fester Satz aus einem bestimmten Haus mehr im Code
const code = src('custom_components/casora/scripts/local/01-basis.js');
for (const s of ['Meerwasseraquarium', 'Büro?', 'Wohnungstür']) assert.ok(!code.includes(s), 'fester Satz noch da: ' + s);

// Tageszeiten
assert.equal(ideas.slot(5), 'morgen');
assert.equal(ideas.slot(9), 'morgen');
assert.equal(ideas.slot(10), 'tag');
assert.equal(ideas.slot(17), 'abend');
assert.equal(ideas.slot(22), 'nacht');
assert.equal(ideas.slot(3), 'nacht');

// im / in der
assert.equal(ideas.inRoom('Wohnzimmer'), 'im Wohnzimmer');
assert.equal(ideas.inRoom('Küche'), 'in der Küche');
assert.equal(ideas.inRoom('Speisekammer'), 'in der Speisekammer');
assert.equal(ideas.inRoom('Bad'), 'im Bad');

// Morgens, nichts zu tun: Wetter, Temperatur im Hauptraum (nicht Garten), dann Allgemeines
let l = qs(ideas(house(base), { hour: 8, max: 4 }));
assert.deepEqual(l, ['Wie wird das Wetter heute?', 'Wie warm ist es im Wohnzimmer?', 'Ist alles abgeschlossen?', 'Welche Fenster sind offen?']);
// Desktop: 6
assert.equal(ideas(house(base), { hour: 8, max: 6 }).length, 6);
// Gleiche Lage → gleiche Vorschläge
assert.deepEqual(qs(ideas(house(base), { hour: 8, max: 6 })), qs(ideas(house(base), { hour: 8, max: 6 })));

// Handlungsbedarf zuerst: Fenster offen + Licht an, tagsüber
l = qs(ideas(house({ ...base, 'binary_sensor.fenster_ku': ['on', { device_class: 'window' }, 'ku'], 'light.ku': ['on', dimmable, 'ku'] }), { hour: 12, max: 4 }));
assert.deepEqual(l.slice(0, 2), ['Welche Fenster sind offen?', 'Welche Lichter sind an?']);

// Nachts mit Licht an: „Schalte alle Lichter aus“; entriegelt → „Ist alles abgeschlossen?“ vorn
l = qs(ideas(house({ ...base, 'light.ku': ['on', dimmable, 'ku'], 'lock.tuer': ['unlocked', {}, 'fl'] }), { hour: 23, max: 4 }));
assert.deepEqual(l.slice(0, 2), ['Ist alles abgeschlossen?', 'Schalte alle Lichter aus']);

// Abends: Licht dimmen im Raum, in dem Licht an ist (Küche → „in der“)
l = qs(ideas(house({ ...base, 'light.ku': ['on', dimmable, 'ku'] }), { hour: 19, max: 6 }));
assert.ok(l.includes('Dimme das Licht in der Küche'), l.join(' | '));

// Versteckte und Diagnose-Entitäten zählen nicht
l = qs(ideas(house({ 'lock.x': ['locked', {}, null, { hidden: true }], 'weather.y': ['sunny', {}, null, { entity_category: 'diagnostic' }] }), { hour: 8, max: 6 }));
assert.deepEqual(l, []);

// Saugroboter nur, wenn es einen gibt und er angedockt ist (tagsüber)
assert.ok(!qs(ideas(house(base), { hour: 12, max: 6 })).includes('Starte den Saugroboter'));
assert.ok(qs(ideas(house({ ...base, 'vacuum.r': ['docked', {}, 'wz'] }), { hour: 12, max: 6 })).includes('Starte den Saugroboter'));

// Alarm nachts unscharf → scharf schalten vorschlagen; tagsüber nicht
assert.ok(qs(ideas(house({ ...base, 'alarm_control_panel.a': ['disarmed', {}] }), { hour: 23, max: 6 })).includes('Alarm scharf schalten'));
assert.ok(!qs(ideas(house({ ...base, 'alarm_control_panel.a': ['disarmed', {}] }), { hour: 12, max: 6 })).includes('Alarm scharf schalten'));

// Jede Frage hat Symbol und Farbe
for (const x of ideas(house(base), { hour: 19, max: 6 })) { assert.ok(/^mdi:/.test(x.icon)); assert.ok(x.tone); }

// Englisch: alle Sätze übersetzt (exakt oder per Muster)
const en = JSON.parse(src('custom_components/casora/translations/dashboard/phrases/en.json'));
const pats = en.patterns.map(([re, to]) => [new RegExp(re), to]);
const all = new Set();
for (const h of [3, 8, 12, 19, 23]) for (const st of [base, { ...base, 'light.ku': ['on', dimmable, 'ku'], 'lock.tuer': ['unlocked', {}, 'fl'],
  'binary_sensor.tuer': ['on', { device_class: 'door' }, 'fl'], 'binary_sensor.fenster_ku': ['on', { device_class: 'window' }, 'ku'],
  'vacuum.r': ['docked', {}, 'wz'], 'alarm_control_panel.a': ['disarmed', {}], 'cover.j': ['open', {}, 'wz'], 'media_player.m': ['playing', {}, 'wz'],
  'sensor.p': ['300', { device_class: 'power' }] }]) ideas(house(st), { hour: h, max: 20 }).forEach((x) => all.add(x.q));
for (const q of all) assert.ok(en.exact[q] || pats.some(([re]) => re.test(q)), 'ohne Englisch: ' + q);
for (const s of ['morgen', 'tag', 'abend', 'nacht']) assert.ok(en.exact[{ morgen: 'Vorschläge für den Morgen', tag: 'Vorschläge für heute', abend: 'Vorschläge für den Abend', nacht: 'Vorschläge für die Nacht' }[s]]);

// R-07: Die Frage (enthält Bereichsnamen) steht maskiert in data-q, nicht als Code im onclick.
{ const b = src('custom_components/casora/scripts/local/01-basis.js');
  assert.ok(b.includes('data-q="\' + esc(q) + \'"') && b.includes("send(this.dataset.q)"), 'Chip sendet aus data-q');
  assert.ok(!/_casoraAssist\.send\(' \+ JSON\.stringify/.test(b), 'keine Frage als Code im Handler'); }

console.log('assist_vorschlaege: ok (' + all.size + ' Sätze)');
