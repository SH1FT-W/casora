// Zeitschalter-Ring auf der Kachel (casora-core.js, casora-timer).  node dev/unit/zeitschalter_kachel.mjs
// Läuft für die Entität ein Timer (sensor.casora_timers, Attribut timers), zeigt die Kachel oben rechts
// einen Ring wie der Fortschrittsring: voll beim Setzen, leer beim Ablauf, Restzeit „28“ bzw. „1:15“.
// Schalter und Fortschrittsring weichen, solange er läuft; die Kachel beobachtet den Sensor.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > -1 && j > i, 'Block fehlt: ' + a); return src.slice(i, j); };
const intervals = [];
const window = {
  casoraLocale: () => 'de-DE',
  casoraTr: (x) => ({ 'Aus um': 'Off at', 'An um': 'On at' }[x] || x),
  setInterval: (fn, ms) => { intervals.push({ fn, ms }); return intervals.length; },
  clearInterval: () => {},
};
new Function('window', cut(core, '// casora-timer:start', '// casora-timer:end'))(window);
const { casoraTimerNote: note, casoraTimerRing: ring, casoraTimerActive: active } = window;

const T0 = Date.parse('2026-10-15T18:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const MIN = 60000;
const S = (timers) => ({ 'sensor.casora_timers': { state: String(Object.keys(timers).length), attributes: { timers } } });

// 1) Kein Sensor, kein Eintrag, abgelaufen, kaputt → nichts
assert.equal(note('light.lampe', {}), null);
assert.equal(note('light.lampe', S({})), null);
assert.equal(note('light.lampe', S({ 'light.lampe': { at: iso(T0 - 1000), action: 'turn_off' } }), T0), null, 'abgelaufen');
assert.equal(note('light.lampe', S({ 'light.lampe': { at: 'kaputt', action: 'turn_off' } }), T0), null);
assert.equal(note(null, S({})), null);
assert.equal(ring('light.lampe', S({}), null, T0), '');
assert.equal(active('light.lampe', S({}), T0), false);

// 2) Füllstand aus start/at: halb abgelaufen → 50 %, Restzeit in Minuten (aufgerundet)
const half = S({ 'light.lampe': { at: iso(T0 + 30 * MIN), action: 'turn_off', start: iso(T0 - 30 * MIN) } });
let n = note('light.lampe', half, T0);
assert.equal(Math.round(n.pct), 50);
assert.equal(n.label, '30');
assert.equal(n.action, 'turn_off');
const clk = new Date(T0 + 30 * MIN).toLocaleTimeString('de-DE', { hour: 'numeric', minute: '2-digit' });
assert.equal(n.clock, clk, 'Uhrzeit nach Sprache (casoraLocale)');
assert.match(clk, /^\d{1,2}:\d\d$/);
assert.equal(n.title, 'Off at ' + clk, 'Wort über casoraTr');
assert.equal(note('light.lampe', half, T0 + 29 * MIN + 30000).label, '1', 'letzte Minute zeigt 1');
// gerade gesetzt → voll
n = note('light.lampe', S({ 'light.lampe': { at: iso(T0 + 15 * MIN), action: 'turn_off', start: iso(T0) } }), T0);
assert.equal(Math.round(n.pct), 100);

// 3) Stunden als h:mm, An-Timer
n = note('switch.pumpe', S({ 'switch.pumpe': { at: iso(T0 + 75 * MIN), action: 'turn_on', start: iso(T0) } }), T0);
assert.equal(n.label, '1:15');
assert.equal(n.action, 'turn_on');
assert.ok(n.title.startsWith('On at '));
assert.equal(note('switch.pumpe', S({ 'switch.pumpe': { at: iso(T0 + 120 * MIN), action: 'turn_on', start: iso(T0) } }), T0).label, '2:00');

// 4) Ohne start (ältere Einträge): erster Blick = Start, danach leert sich der Ring
const old = S({ 'fan.luefter': { at: iso(T0 + 20 * MIN), action: 'turn_off' } });
assert.equal(Math.round(note('fan.luefter', old, T0).pct), 100);
assert.equal(Math.round(note('fan.luefter', old, T0 + 10 * MIN).pct), 50);
// start nach at (kaputt) zählt wie fehlend
assert.ok(note('fan.x', S({ 'fan.x': { at: iso(T0 + MIN), action: 'turn_off', start: iso(T0 + 5 * MIN) } }), T0).pct <= 100);

// 5) Ring-Markup: gleiche Klassen wie #progress, Füllstand als Variable, Restzeit in der Mitte
const card = { isConnected: true };
const svg = ring('light.lampe', half, card, T0);
assert.match(svg, /class="casora-progress-track"/);
assert.match(svg, /class="casora-progress-arc"[^>]*stroke-dasharray="87.965"/);
assert.match(svg, /--casora-timer-pct:50\.00/);
assert.match(svg, /<text class="casora-timer-left"[^>]*>30<\/text>/);
assert.ok(svg.includes('aria-label="Off at ' + clk + '"'));
assert.ok(!/#[0-9a-f]{3,6}\b/i.test(svg), 'keine festen Farben im Ring');
assert.match(ring('switch.pumpe', S({ 'switch.pumpe': { at: iso(T0 + 75 * MIN), action: 'turn_on', start: iso(T0) } }), null, T0), /font-size="10">1:15</);

// 6) Takt: Kachel mit laufendem Timer wird angemeldet und neu gezeichnet, ohne Timer fällt sie raus
assert.equal(intervals.length, 1);
assert.ok(intervals[0].ms <= 60000, 'mindestens jede Minute');
let kicked = 0;
window.casoraKick = (el) => { if (el === card) kicked++; };
intervals[0].fn();
assert.equal(kicked, 1);
ring('light.lampe', S({}), card, T0);
intervals[0].fn();
assert.equal(kicked, 1, 'ohne Timer kein Neuzeichnen mehr');

// 7) Vorlagen: Feld timer in casora_entity, Sensor wird direkt gelesen (button-card beobachtet ihn),
//    Schalter und Fortschrittsring weichen, ⋯-Knopf rechnet die Ecke mit.
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const E = tpl.casora_entity;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const run = (code, entity, states, variables, self) =>
  new Function('entity', 'states', 'variables', 'hass', 'window', body(code)).call(self || {}, entity, states, variables, {}, window);
assert.ok(E.custom_fields.timer.includes("states['sensor.casora_timers']"));
const ent = { entity_id: 'light.lampe', state: 'on', attributes: {} };
window.casoraTimerActive = (eid, st) => active(eid, st, T0);
window.casoraTimerRing = (eid, st, c) => ring(eid, st, c, T0);
assert.match(run(E.custom_fields.timer, ent, half, {}), /casora-timer-left/);
assert.equal(run(E.custom_fields.timer, ent, {}, {}), '');
const cardStyle = (k) => E.styles.card.find((x) => k in x)[k];
assert.equal(run(cardStyle('--casora-timer-display'), ent, half, {}), 'var(--casora-tile-extras, block)');
assert.equal(run(cardStyle('--casora-timer-display'), ent, S({}), {}), 'none');
const prog = { show_progress: true, progress_active_states: ['on'] };
assert.equal(run(cardStyle('--casora-progress-display'), ent, half, prog), 'none', 'Fortschrittsring weicht');
assert.notEqual(run(cardStyle('--casora-progress-display'), ent, S({}), prog), 'none');
const tgl = E.styles.custom_fields.toggle.find((x) => 'display' in x).display;
assert.equal(run(tgl, ent, half, { show_toggle: true }), 'none', 'Schalter weicht dem Ring');
assert.notEqual(run(tgl, ent, S({}), { show_toggle: true }), 'none');
const tm = E.styles.custom_fields.timer;
const pr = E.styles.custom_fields.progress;
for (const k of ['top', 'right', 'width', 'height']) {
  assert.equal(tm.find((x) => k in x)[k], pr.find((x) => k in x)[k], 'Ring sitzt wie der Fortschrittsring: ' + k);
}
assert.ok(E.extra_styles.includes('#timer svg .casora-progress-arc'));
const more = tpl.casora_entity_actions.styles.custom_fields.more.filter((x) => Object.values(x).some((v) => String(v).includes('moreGeom')));
assert.equal(more.length, 4);
more.forEach((x) => assert.ok(Object.values(x)[0].includes('moreGeom(variables, entity?.state, states, entity?.entity_id)')));
// Thermostat: Verlauf nicht unter dem Ring
const spark = tpl.casora_thermostat.styles.custom_fields.spark.find((x) => 'display' in x).display;
assert.equal(run(spark, { entity_id: 'climate.bad', state: 'heat' }, S({ 'climate.bad': { at: iso(T0 + MIN), action: 'turn_off', start: iso(T0) } }), { sparkline: true }), 'none');
assert.equal(run(spark, { entity_id: 'climate.bad', state: 'heat' }, S({}), { sparkline: true }), 'block');

console.log('zeitschalter_kachel: alles ok');
