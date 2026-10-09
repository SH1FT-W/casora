// Pulse-Kachel und -Popup (Casora 1.2.x): Auswertung der Pulse-Entitäten ohne HA – Erkennung über
// Integration + translation_key (nicht die Entity-ID), Zählen, Sortieren, Gründe, Kachel-Text,
// Unterzeile/Leiste, „Gewechselt“-Knopf, Studio-Angebot nur mit Pulse, Vorschlag im Geräte-Assistenten.
// Alle Geräte und Namen erfunden.
//   node dev/unit/pulse.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(src('custom_components/casora/scripts/local/14-pulse.js'))();
const P = window._casoraPulse;

const NOW = Date.parse('2026-10-09T12:00:00Z');
const ago = (h) => new Date(NOW - h * 3600000).toISOString();

// Registry wie hass.entities (Anzeige-Einträge) – absichtlich „krumme“ Entity-IDs, gefunden wird über den Schlüssel.
const devices = {
  d_smoke: { id: 'd_smoke', name: 'Rauchmelder Speicher', area_id: 'a_store' },
  d_win: { id: 'd_win', name: 'Fenster Atelier', name_by_user: null, area_id: 'a_studio' },
  d_move: { id: 'd_move', name: 'Bewegung Treppe', area_id: null },
  d_temp: { id: 'd_temp', name: 'Thermometer Wintergarten', area_id: 'a_garden' },
  d_leak: { id: 'd_leak', name: 'Wassermelder Waschküche', area_id: null },
  d_door: { id: 'd_door', name: 'Tür Geräteschuppen', area_id: null },
  d_new: { id: 'd_new', name: 'Taster Leseecke', area_id: null },
  pulse_hub: { id: 'pulse_hub', name: 'Pulse', entry_type: 'service' },
};
const areas = { a_store: { name: 'Speicher' }, a_studio: { name: 'Atelier' }, a_garden: { name: 'Wintergarten' } };
const entities = {}, states = {};
const add = (id, platform, key, device, state, attributes = {}) => {
  entities[id] = { entity_id: id, platform, translation_key: key, device_id: device, entity_category: platform === 'pulse' && device !== 'pulse_hub' ? 'diagnostic' : null };
  states[id] = { entity_id: id, state, attributes };
};
const dev = (n, d, status, attrs, bat) => {
  add('sensor.x' + n + '_status', 'pulse', 'status', d, status, Object.assign({ reason_key: null, silent_since: null, typical_interval: null, critical: false, snoozed_until: null }, attrs));
  add('binary_sensor.x' + n + '_problem', 'pulse', 'problem', d, status === 'check' || status === 'failed' ? 'on' : 'off');
  add('sensor.x' + n + '_last', 'pulse', 'last_report', d, ago(1));
  if (bat != null) add('sensor.x' + n + '_battery', 'zha', null, d, String(bat), { device_class: 'battery', unit_of_measurement: '%' });
};
dev(1, 'd_smoke', 'failed', { reason_key: 'silent', silent_since: ago(50), typical_interval: 4 * 3600, critical: true }, 80);
dev(2, 'd_win', 'check', { reason_key: 'battery_low', silent_since: null }, 7);
dev(3, 'd_move', 'check', { reason_key: 'silent', silent_since: ago(9), typical_interval: 3600 });
dev(4, 'd_temp', 'watch', { reason_key: 'battery_soon' }, 18);
dev(5, 'd_leak', 'watch', { reason_key: 'waiting_first' }, 100);
dev(6, 'd_door', 'ok', { reason_key: 'ok_rhythm', typical_interval: 2 * 86400 }, 64);
dev(7, 'd_new', 'learning', { reason_key: 'learning' });
add('sensor.pulse_x_problems', 'pulse', 'problems', 'pulse_hub', '3', { devices: [] });
add('sensor.pulse_x_monitored', 'pulse', 'monitored', 'pulse_hub', '7');
// Fremde Entität mit gleichem Schlüssel – darf nicht zählen.
add('sensor.other_status', 'other', 'status', 'd_door', 'ok', { reason_key: 'silent' });
const hass = { entities, devices, areas, states };

assert.equal(P.installed(hass), true);
assert.equal(P.installed({ entities: {}, states: {} }), false, 'ohne Pulse-Entitäten nicht installiert');

const s = P.scan(hass, states, NOW);
assert.equal(s.total, 7, 'je Gerät genau ein Status-Sensor, fremde Plattform ignoriert');
assert.deepEqual(s.counts, { failed: 1, check: 2, watch: 2, learning: 1, ok: 1 });
assert.equal(s.problems, 3);
assert.equal(s.soon, 2);
assert.equal(s.ok, 2, 'ok + lernt');
assert.equal(s.worst, 'failed');
assert.equal(s.problemsId, 'sensor.pulse_x_problems');
assert.equal(s.monitored, 7);

// Sortierung: ausgefallen → prüfen (innerhalb: kritisch vorn, längste Stille vorn, Batterie danach) → bald fällig → lernt → ok.
assert.deepEqual(s.list.map((d) => d.name), [
  'Rauchmelder Speicher', 'Bewegung Treppe', 'Fenster Atelier', 'Thermometer Wintergarten', 'Wassermelder Waschküche',
  'Taster Leseecke', 'Tür Geräteschuppen',
]);
const by = Object.fromEntries(s.list.map((d) => [d.name, d]));
assert.equal(by['Fenster Atelier'].battery, 7, 'Batterie-% vom Batteriesensor desselben Geräts');
assert.equal(by['Fenster Atelier'].area, 'Atelier');
assert.equal(by['Rauchmelder Speicher'].critical, true);
assert.equal(by['Rauchmelder Speicher'].device, 'd_smoke');

// Gründe als eigene deutsche Sätze.
assert.equal(by['Rauchmelder Speicher'].text, 'Antwortet nicht · sonst alle 4 Std.');
assert.equal(by['Bewegung Treppe'].text, 'Still · sonst jede Stunde');
assert.equal(by['Fenster Atelier'].text, 'Batterie fast leer');
assert.equal(by['Thermometer Wintergarten'].text, 'Batterie bald fällig');
assert.equal(by['Wassermelder Waschküche'].text, 'Gewechselt · wartet auf erste Meldung');
assert.equal(by['Tür Geräteschuppen'].text, 'Meldet sich wie gewohnt · alle 2 Tage');
assert.equal(by['Taster Leseecke'].text, 'Lernt noch den Rhythmus');
assert.equal(P.reason({ reason: 'unavailable', status: 'failed' }), 'Nicht erreichbar');
assert.equal(P.reason({ reason: 'zukunft', status: 'check' }), 'Bitte prüfen', 'unbekannter Schlüssel → Wort zum Status');
assert.equal(P.every(600), 'alle 10 Min.');
assert.equal(P.every(86400), 'einmal am Tag');
assert.equal(P.every(null), null);
assert.equal(P.since(ago(50), NOW), 'seit 2 T.');
assert.equal(P.since(ago(9), NOW), 'seit 9 Std.');
assert.equal(P.since(new Date(NOW - 12 * 60000).toISOString(), NOW), 'seit 12 Min.');

// Kachel: aktiv nur bei echten Problemen, „bald fällig“ nur als Zusatz.
assert.equal(P.active(s), true);
assert.equal(P.tileState(s), '3 Probleme · 2 beobachten');
assert.equal(P.color(s.worst), P.COLOR.failed);
const onlyWatch = P.scan({ ...hass, states: { ...states,
  'sensor.x1_status': { ...states['sensor.x1_status'], state: 'ok' },
  'sensor.x2_status': { ...states['sensor.x2_status'], state: 'ok' },
  'sensor.x3_status': { ...states['sensor.x3_status'], state: 'ok' } } }, null, NOW);
assert.equal(onlyWatch.problems, 0);
assert.equal(P.active(onlyWatch), false, 'bald fällig macht die Kachel nicht aktiv');
assert.equal(P.tileState(onlyWatch), 'Alles ok');
assert.equal(P.color(onlyWatch.worst), P.COLOR.ok, 'bald fällig färbt nicht');
const one = P.scan({ ...hass, states: { ...states,
  'sensor.x1_status': { ...states['sensor.x1_status'], state: 'ok' },
  'sensor.x3_status': { ...states['sensor.x3_status'], state: 'ok' },
  'sensor.x4_status': { ...states['sensor.x4_status'], state: 'ok' },
  'sensor.x5_status': { ...states['sensor.x5_status'], state: 'ok' } } }, null, NOW);
assert.equal(P.tileState(one), '1 Problem');
assert.equal(P.color(one.worst), P.COLOR.check);
assert.equal(P.tileState(P.scan({ entities: {}, states: {} })), 'Nicht installiert');

// Unterzeile „N Probleme · M bald fällig · K ok“ und Leiste.
assert.deepEqual(P.subline(s), { main: '3 Probleme', rest: ['2 beobachten', '2 ok'], tone: 'bad' });
assert.deepEqual(P.subline(onlyWatch).main, 'Keine Probleme');
const bar = P.bar(s);
for (const t of ['1 ausgefallen', '2 prüfen', '2 beobachten', '2 ok']) assert.ok(bar.includes(t), t);
assert.equal(P.wide(hass, states), true, 'Probleme + bald fällig → zweispaltig');

// Popup-Bereiche: Zeilen über einen Stub von window._casoraUI.
const groups = [];
window._casoraUI = {
  line: (m, r) => '<line>' + m + '|' + r.join('|') + '</line>',
  group: (rows, label) => { groups.push({ rows, label }); return '<div class="hui-row">' + rows.map((r) => r.label + ' ' + (r.sub || '')).join(',') + '</div>'; },
  more: (id, html, o) => '<more ' + o.label + ' ' + o.count + '>' + html + '</more>',
};
// Abschnitte wie im Pulse-Panel: links Ausgefallen/Prüfen, rechts Batterie/Beobachten.
groups.length = 0;
const prob = P.sec('prob', null, states, hass);
const left = groups.splice(0);
assert.ok(left.length && left.every((x) => x.label === 'Ausgefallen' || x.label === 'Prüfen'), left.map((x) => x.label));
assert.ok(prob.includes('Wichtig'), '„Wichtig“-Marke für kritisches Gerät');
P.sec('soon', null, states, hass);
const right = groups.splice(0);
assert.ok(right.length && right.every((x) => x.label === 'Batterie' || x.label === 'Beobachten'), right.map((x) => x.label));
const all = left.concat(right).flatMap((x) => x.rows);
assert.equal(all.length, 5, '3 Probleme + 2 beobachten');
const batRows = (right.find((x) => x.label === 'Batterie') || { rows: [] }).rows;
const win = all.find((r) => r.label === 'Fenster Atelier');
assert.ok(batRows.includes(win), 'Batterie-Grund steht unter „Batterie“');
assert.equal(win.action, 'Gewechselt');
assert.deepEqual(win.svc.domain + '.' + win.svc.service, 'pulse.mark_replaced');
assert.deepEqual(win.svc.data, { device_id: 'd_win' });
assert.ok(win.confirm, 'Rückfrage vor dem Melden');
assert.ok(win.svc.done, 'Rückmeldung nach dem Melden');
assert.equal(win.value, '7 %');
assert.equal(win.entity, 'sensor.x2_status');
const smoke = all.find((r) => /^Rauchmelder/.test(r.label));
assert.equal(smoke.action, undefined, 'kein „Gewechselt“ bei Stille');
assert.equal(smoke.iconTone, 'bad');
assert.ok(left.flatMap((x) => x.rows).includes(smoke), 'Stille steht links');
const more = P.sec('more', null, states, hass);
assert.ok(/<more Alles ok 2>/.test(more), '„Alles ok“ eingeklappt mit Anzahl');
assert.ok(more.includes('data-casora-link="/pulse"'), 'Fuß führt ins Pulse-Panel');
assert.ok(P.sec('hero', null, states, hass).includes('3 Probleme'));

// Studio: Kacheltyp nur mit Pulse; Finder-Schlüssel; Assistent schlägt eine Kachel für die Startseite vor.
// Nur die Typenliste (wie aquarium_felder.mjs) – der Rest der Datei braucht das Panel.
const tsrc = src('custom_components/casora/panel/casora-panel-types.js');
const w = {};
new Function('window', tsrc.slice(0, tsrc.indexOf('\n];\n', tsrc.indexOf('window.CASORA_TILE_TYPES = [')) + 4))(w);
const type = (w.CASORA_TILE_TYPES || []).find((t) => t.id === 'casora_pulse');
assert.ok(type, 'Kacheltyp casora_pulse');
assert.equal(type.template, 'casora_pulse');
assert.equal(type.onlyIf(hass), true);
assert.equal(type.onlyIf({ entities: { 'sensor.a': { platform: 'zha' } } }), false, 'ohne Pulse nicht angeboten');
new Function(src('custom_components/casora/panel/casora-panel-assist.js'))();
const A = window.casoraAssist;
const sug = A.suggest(hass, [{ name: 'Zuhause', path: 'home', tiles: [] }], [type]);
const ps = sug.filter((x) => x.type === 'casora_pulse');
assert.equal(ps.length, 1);
assert.equal(ps[0].entity, 'sensor.pulse_x_problems');
assert.equal(ps[0].room, 'Zuhause');
assert.equal(A.suggest(hass, [{ name: 'Zuhause', path: 'home', tiles: [{ template: 'casora_pulse' }] }], [type])
  .filter((x) => x.type === 'casora_pulse').length, 0, 'schon eine Pulse-Kachel → kein Vorschlag');

console.log('pulse: ok');
