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
// Newer Pulse reasons (1.1, 26.10.5): own texts; an unknown reason on "watch" never claims a battery is due
// (18.10.: leak sensor at 91 % showed "Bald fällig").
assert.equal(P.reason({ reason: 'radio_only', status: 'watch' }), 'Funkt, schickt aber keine Werte');
assert.equal(P.reason({ reason: 'battery_missing', status: 'watch' }), 'Batteriewert fehlt');
assert.equal(P.reason({ reason: 'cloud_outage', status: 'check' }), 'Cloud antwortet nicht');
assert.equal(P.reason({ reason: 'startup_waiting', status: 'watch' }), 'Seit dem Neustart noch keine Meldung');
assert.equal(P.reason({ reason: 'ok_reachable', status: 'ok' }), 'Erreichbar, gerade nichts zu melden');
assert.equal(P.reason({ reason: 'silent_reachable', status: 'watch' }), 'Erreichbar, gerade nichts zu melden');
assert.equal(P.reason({ reason: 'zukunft', status: 'watch' }), 'Beobachten', 'unknown reason on watch → no battery claim');
for (const k of ['radio_only', 'battery_missing', 'cloud_outage', 'startup_waiting', 'ok_reachable', 'zukunft'])
  assert.notEqual(P.reason({ reason: k, status: 'watch' }), 'Bald fällig', k);
assert.equal(P.icon({ reason: 'startup_waiting', status: 'watch' }), 'mdi:timer-sand');
assert.equal(P.icon({ reason: 'battery_missing', status: 'watch' }), 'mdi:battery-unknown');
assert.equal(P.icon({ reason: 'cloud_outage', status: 'check' }), 'mdi:cloud-off-outline');
assert.equal(P.icon({ reason: 'radio_only', status: 'watch' }), 'mdi:access-point-off');
assert.equal(P.every(600), 'alle 10 Min.');
assert.equal(P.every(86400), 'einmal am Tag');
assert.equal(P.every(null), null);
assert.equal(P.since(ago(50), NOW), 'seit 2 Tagen');
assert.equal(P.since(ago(30), NOW), 'seit 1 Tag');
// The time goes into the sentence (popup row, 26.10.: right side only ›).
assert.equal(P.reason(by['Rauchmelder Speicher'], 'seit 2 Tagen'), 'Antwortet seit 2 Tagen nicht · sonst alle 4 Std.');
assert.equal(P.reason(by['Bewegung Treppe'], 'seit 9 Std.'), 'Still seit 9 Std. · sonst jede Stunde');
assert.equal(P.since(ago(9), NOW), 'seit 9 Std.');
assert.equal(P.since(new Date(NOW - 12 * 60000).toISOString(), NOW), 'seit 12 Min.');

// Kachel: aktiv nur bei echten Problemen, „bald fällig“ nur als Zusatz.
assert.equal(P.active(s), true);
assert.equal(P.tileState(s), '3 Probleme · 1 Batterie bald fällig · 1 beobachten', 'Batterie und Beobachten getrennt');
assert.equal(P.color(s.worst), P.COLOR.failed);
const onlyWatch = P.scan({ ...hass, states: { ...states,
  'sensor.x1_status': { ...states['sensor.x1_status'], state: 'ok' },
  'sensor.x2_status': { ...states['sensor.x2_status'], state: 'ok' },
  'sensor.x3_status': { ...states['sensor.x3_status'], state: 'ok' } } }, null, NOW);
assert.equal(onlyWatch.problems, 0);
assert.equal(P.active(onlyWatch), true, 'bald fällig macht die Kachel aktiv (1.4)');
assert.equal(P.tileState(onlyWatch), '1 Batterie bald fällig · 1 beobachten', 'bald fällig steht auf der Kachel, nicht „Alles ok“');
assert.equal(P.color(onlyWatch.worst), P.COLOR.watch, 'bald fällig färbt gelb');
assert.equal(P.color('learning'), P.COLOR.ok, 'lernt noch bleibt ruhig');
const one = P.scan({ ...hass, states: { ...states,
  'sensor.x1_status': { ...states['sensor.x1_status'], state: 'ok' },
  'sensor.x3_status': { ...states['sensor.x3_status'], state: 'ok' },
  'sensor.x4_status': { ...states['sensor.x4_status'], state: 'ok' },
  'sensor.x5_status': { ...states['sensor.x5_status'], state: 'ok' } } }, null, NOW);
assert.equal(P.tileState(one), '1 Problem');
assert.equal(P.color(one.worst), P.COLOR.check);
assert.equal(P.tileState(P.scan({ entities: {}, states: {} })), 'Nicht installiert');

// Short subline „N Probleme · K ok“ (one line on a phone; the watch count stands at its section) and bar.
assert.deepEqual(P.subline(s), { main: '3 Probleme', rest: ['2 ok'], tone: 'bad' });
assert.deepEqual(P.subline(onlyWatch).main, 'Keine Probleme');
const bar = P.bar(s);
for (const t of ['1 ausgefallen', '2 prüfen', '2 beobachten', '2 ok']) assert.ok(bar.includes(t), t);
assert.equal((bar.match(/<span /g) || []).length, 4, 'four segments, no legend');
assert.equal(P.wide(hass, states), true, 'a section with two entries → wide');
assert.equal(P.wide(hass, { ...states,
  'sensor.x1_status': { ...states['sensor.x1_status'], state: 'ok' },
  'sensor.x3_status': { ...states['sensor.x3_status'], state: 'ok' },
  'sensor.x4_status': { ...states['sensor.x4_status'], state: 'ok' },
  'sensor.x5_status': { ...states['sensor.x5_status'], state: 'ok' } }), false, 'one entry per section → narrow');

// Popup sections: rows through a stub of window._casoraUI (row markup like the core: icon after .hui-inner).
const groups = [];
window._casoraUI = {
  line: (m, r) => '<line>' + m + '|' + r.join('|') + '</line>',
  icon: (n, t) => '<i data-ic="' + n + '|' + t + '"></i>',
  group: (rows, label) => { groups.push({ rows, label }); return rows.map((r) => '<div class="hui-row"><div class="hui-inner">' + window._casoraUI.icon(r.icon, r.iconTone)
    + r.label + ' ' + (r.sub || '') + (r.action ? '<div class="hui-actx" aria-label="' + r.action + '"></div>' : '') + '</div></div>').join(''); },
  more: (id, html, o) => '<more ' + o.label + ' ' + o.count + '><span class="hui-mlb"></span>' + html + '</more>',
};
// Sections by Pulse status, stacked: Ausgefallen, Prüfen, Beobachten – each with its count.
groups.length = 0;
const secs = {};
for (const [part, label, n] of [['failed', 'Ausgefallen', 1], ['check', 'Prüfen', 2], ['watch', 'Beobachten', 2]]) {
  secs[part] = P.sec(part, null, states, hass);
  assert.ok(secs[part].includes('>' + label + '</div><span class="pls-n"'), label);
  assert.ok(secs[part].includes('>' + n + '</span>'), label + ' count ' + n);
}
assert.equal(P.sec('soon', null, states, hass), '', 'no „Batterie“ section any more');
const all = groups.splice(0).flatMap((x) => x.rows);
assert.equal(all.length, 5, '3 Probleme + 2 beobachten');
const win = all.find((r) => r.label === 'Fenster Atelier');
assert.ok(secs.check.includes('Fenster Atelier'), 'battery „prüfen“ under „Prüfen“');
assert.ok(secs.watch.includes('Thermometer Wintergarten'), 'battery „bald fällig“ under „Beobachten“');
assert.equal(win.action, 'Batterie gewechselt');
assert.equal(win.actionIcon, 'mdi:check', 'round ✓ button');
assert.ok(secs.check.includes('aria-label="Batterie gewechselt" title="Batterie gewechselt"'), 'tooltip on the ✓ button');
assert.deepEqual(win.svc.domain + '.' + win.svc.service, 'pulse.mark_replaced');
assert.deepEqual(win.svc.data, { device_id: 'd_win' });
assert.ok(win.confirm, 'Rückfrage vor dem Melden');
assert.ok(win.svc.done, 'Rückmeldung nach dem Melden');
assert.equal(win.value, undefined, 'nothing on the right but the controls');
assert.equal(win.pct, '7 %');
// Badge sits on the icon of its own row (rows with the same icon before it stay without).
const winRow = secs.check.split('<div class="hui-row">').find((x) => x.includes('Fenster Atelier'));
assert.ok(/<div class="pls-ic"><i [^>]*><\/i><span class="pls-pct">7 %<\/span><\/div>/.test(winRow), winRow);
assert.ok(!secs.check.split('<div class="hui-row">').find((x) => x.includes('Bewegung Treppe')).includes('pls-pct'), 'no badge without battery');
const smoke = all.find((r) => /Rauchmelder/.test(r.label));
assert.equal(smoke.action, undefined, 'kein „Gewechselt“ bei Stille');
assert.equal(smoke.iconTone, 'bad');
assert.equal(smoke.pct, null, 'silent: no (stale) battery badge');
assert.ok(/^Antwortet seit \d+ Tagen nicht · sonst alle 4 Std\. · Speicher$/.test(smoke.sub), smoke.sub);
assert.ok(secs.failed.includes('<span class="pls-nm">Rauchmelder Speicher</span><span class="pls-tag">Wichtig</span>'), '„Wichtig“ beside the name');
assert.ok(!/[\u2062\u2063]/.test(secs.failed), 'no markers left');
const more = P.sec('more', null, states, hass);
assert.ok(/<more Alles ok 2>/.test(more), '„Alles ok“ eingeklappt mit Anzahl');
assert.ok(more.includes('class="pls-okic"'), 'green check in front of „Alles ok“');
assert.ok(more.includes('class="pls-link" data-casora-link="/pulse"'), 'Fuß führt ins Pulse-Panel (Textlink)');
assert.ok(more.includes('<span class="pls-pct">64 %</span>'), 'battery badge in „Alles ok“ too');
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
