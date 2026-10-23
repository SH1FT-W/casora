// Issue #11 (Teil 2): „Zuletzt aktiv“ einer Szene stimmt auch, wenn eine Automation statt der
// Szene ihren Status-Schalter (input_boolean) einschaltet. scene.*.state blieb dann Tage alt.
// Erwartet: SC.lastActive() nimmt den neuesten Wert aus scene.*.state und dem letzten off → on
// des Status-Schalters (aus dem Verlauf, Neustarts zählen nicht), ohne Einstellung erkannt
// (das eine input_boolean der Szene, sonst gleicher Name). Badge, Gruppen-Badge, Handy-Zeile und
// Sortierung nutzen es; wenige Abfragen (gecacht).   node dev/unit/szenen_zuletzt_aktiv.mjs
process.env.TZ = 'Europe/Berlin';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const root = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');
const FIND = read('custom_components/casora/scripts/local/00-finder.js');

const NOW = Date.parse('2026-10-05T16:40:00Z');
const realNow = Date.now;
Date.now = () => NOW;
const iso = (s) => new Date(s).toISOString();

// Verlauf (HA history/period, minimal_response): Neustart 17:00 (on → on) zählt nicht.
const HIST = {
  'input_boolean.stimmung': [
    { state: 'off', last_changed: iso('2026-10-04T00:00:00Z') },
    { state: 'on', last_changed: iso('2026-10-05T16:32:02Z') },
  ],
  'input_boolean.nachtmodus': [
    { state: 'off', last_changed: iso('2026-09-20T00:00:00Z') },
    { state: 'on', last_changed: iso('2026-10-01T20:00:00Z') },
    { state: 'on', last_changed: iso('2026-10-05T06:00:00Z') },  // HA-Neustart
  ],
};
const calls = [];
const hass = {
  callApi: (m, url) => {
    calls.push(url);
    const id = decodeURIComponent(url.match(/filter_entity_id=([^&]+)/)[1]);
    // Wie HA: ohne end_time nur ein Tag ab start (10.10.2026: Abfrage über 30 Tage kam leer zurück).
    const start = Date.parse(decodeURIComponent(url.match(/history\/period\/([^?]+)/)[1]));
    const e = url.match(/[?&]end_time=([^&]+)/);
    const end = e ? Date.parse(decodeURIComponent(e[1])) : start + 86400000;
    return Promise.resolve([(HIST[id] || []).filter((x) => { const t = Date.parse(x.last_changed); return t >= start && t <= end; })]);
  },
  callWS: () => Promise.resolve({}),
  entities: {}, states: {},
};
const store = {};
const window = {};
const document = {
  querySelector: (q) => (q === 'home-assistant' ? { hass } : null),
  addEventListener() {}, createElement: () => ({ style: {} }), head: { appendChild() {} },
};
const localStorage = { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } };

// casoraDevice (00-finder.js) mit lastOn.
const a = FIND.indexOf('(function () {\n  if (window.casoraDevice) return;');
const b = FIND.indexOf('\n})();', a);
new Function('window', 'document', FIND.slice(a, b + 6))(window, document);
assert.equal(typeof window.casoraDevice.lastOn, 'function');

// Szenen-Kern ausführen.
const ST = (id, state, lc, attrs) => ({ entity_id: id, state, last_changed: lc || iso('2026-10-05T17:00:00Z'), attributes: attrs || {} });
const states = {
  'scene.stimmung': ST('scene.stimmung', iso('2026-10-03T18:45:08Z')),
  'input_boolean.stimmung': ST('input_boolean.stimmung', 'on', iso('2026-10-05T16:32:02Z')),
  'scene.abend': ST('scene.abend', iso('2026-10-02T19:00:00Z'), null, { id: '42' }),
  'input_boolean.nachtmodus': ST('input_boolean.nachtmodus', 'on', iso('2026-10-05T06:00:00Z')),
  'scene.lesen': ST('scene.lesen', iso('2026-10-05T12:00:00Z')),
  'input_boolean.lesen': ST('input_boolean.lesen', 'off', iso('2026-10-05T13:00:00Z')),
  'scene.ohne': ST('scene.ohne', iso('2026-10-04T10:00:00Z')),
};
// Konfiguration der Szene „Abend“ (Szeneneditor): schaltet genau ein input_boolean ein.
store.casora_scene_cfg_v1 = JSON.stringify({ 'scene.abend': { entities: { 'light.a': { state: 'on' }, 'input_boolean.nachtmodus': { state: 'on' }, 'input_boolean.x': { state: 'off' } } } });
hass.states = states;
new Function('window', 'document', 'localStorage', 'states', 'hass', 'variables', 'entity', body(T.casora_scene_core.variables.casora_scene_core_guard.value))(
  window, document, localStorage, states, hass, {}, null);
const SC = window._casoraSC;
assert.equal(typeof SC.lastActive, 'function');

// Erkennung des Status-Schalters.
assert.equal(SC.statusOf('scene.stimmung', states), 'input_boolean.stimmung', 'gleicher Name');
assert.equal(SC.statusOf('scene.abend', states), 'input_boolean.nachtmodus', 'das eine input_boolean aus der Szene');
assert.equal(SC.statusOf('scene.ohne', states), null);

// Erster Aufruf: Verlauf wird geholt, bis dahin scene.*.state.
assert.equal(SC.lastActive('scene.stimmung', states), Date.parse(states['scene.stimmung'].state));
await new Promise((r) => setTimeout(r, 0));
assert.equal(SC.lastActive('scene.stimmung', states), Date.parse('2026-10-05T16:32:02Z'), 'Schalter neuer als Szene');
SC.lastActive('scene.abend', states);
await new Promise((r) => setTimeout(r, 0));
assert.equal(SC.lastActive('scene.abend', states), Date.parse('2026-10-02T19:00:00Z'), 'Neustart (on → on) zählt nicht, Szene ist neuer als das off → on vom 01.10.');
// Szene neuer als der Schalter: Szene gewinnt. Ohne Schalter: Szene.
SC.lastActive('scene.lesen', states);
await new Promise((r) => setTimeout(r, 0));
assert.equal(SC.lastActive('scene.lesen', states), Date.parse('2026-10-05T12:00:00Z'));
assert.equal(SC.lastActive('scene.ohne', states), Date.parse('2026-10-04T10:00:00Z'));

// Gecacht: weitere Aufrufe ohne neue Abfrage; live off → on ohne Abfrage.
const n0 = calls.length;
for (let i = 0; i < 20; i++) SC.lastActive('scene.stimmung', states);
assert.equal(calls.length, n0, 'keine Abfrage-Flut');
states['input_boolean.lesen'] = ST('input_boolean.lesen', 'on', iso('2026-10-05T16:39:00Z'));
assert.equal(SC.lastActive('scene.lesen', states), Date.parse('2026-10-05T16:39:00Z'), 'live eingeschaltet');
assert.equal(calls.length, n0, 'live off → on ohne Abfrage');
// Neustart später (on → on, neues last_changed): Wert bleibt, keine Abfrage.
states['input_boolean.lesen'] = ST('input_boolean.lesen', 'on', iso('2026-10-05T16:39:30Z'));
assert.equal(SC.lastActive('scene.lesen', states), Date.parse('2026-10-05T16:39:00Z'));
assert.equal(calls.length, n0);

// Sortierung aktiver Szenen nutzt lastActive.
assert.ok(SC.activeList.toString().includes('lastActive'));

// Desktop-Badge und Gruppen-Badge: „gerade eben“ bzw. „vor 8 Min.“ statt „vor 2 Tagen“.
const badge = (id) => new Function('window', 'entity', 'states', 'variables', body(T.casora_badge_scene.name))(
  { _casoraSC: { isActive: () => false, lastActive: SC.lastActive.bind(SC) } }, states[id], states, {});
assert.ok(badge('scene.stimmung').includes('vor 8 Min.'), badge('scene.stimmung'));
assert.ok(badge('scene.ohne').includes('gestern'));
// Handy-Zeile (Kern, chipHtml): gleiche Zeit.
assert.ok(/vor 8 Min\./.test(SC.chipHtml('scene.stimmung', states, {})), 'Handy-Zeile');
// Heizdauer über 7 Tage (onHours) fragt ebenfalls bis jetzt ab, nicht nur den ersten Tag.
window.casoraDevice.onHours(['input_boolean.nachtmodus'], 7);
assert.ok(calls.length > 0 && calls.every((u) => /[?&]end_time=/.test(u)), 'jede Verlaufsabfrage mit end_time');
Date.now = realNow;
console.log('szenen_zuletzt_aktiv: ok (' + calls.length + ' Verlaufsabfragen)');
