// Thermostat wording (21.10.2026): the tile read "22,2° · An · 22°" – two numbers and a switch word. Calm tile
// (owner, 02.11.2026): every tile width reads "<room> · <state>" – "22,2° · Heizt", "Kühlt", "Bereit" (idle at the
// target), "Automatik", "Aus"; no target, no range. The text is its own short form (ends with "…" instead of a
// counter). The icon circle is coloured in every mode but off. The tile popup (statusText) and the popup head
// (03-popups.js F.status) keep "Heizt auf 22°"; with a range heating aims at the lower and cooling at the upper bound.
//   node dev/unit/thermostat_wording.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert.ok(i > -1 && j > i, 'block: ' + a); return src.slice(i, j); };
const kal = read('custom_components/casora/scripts/local/06-kalender.js');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));

// ── Tile: wide text and short form ─────────────────────────────────────────────────
const fits = [];
const win = { casoraStateFit: (t, w, s) => { fits.push([t, s]); return t; } };
new Function('window', cut(kal, '// ── Thermostat aktiv?', '// ── Glocke'))(win);
const body = T.casora_thermostat.state_display.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const S = { 'sensor.example_room': { state: '22.2', attributes: { device_class: 'temperature' } } };
const tile = (state, attributes, sensor = true) => {
  fits.length = 0;
  const full = new Function('states', 'entity', 'variables', 'window', body)(S, { state, attributes },
    sensor ? { temp_sensor: 'sensor.example_room' } : {}, win);
  return [full, fits[0] ? fits[0][1] : undefined];
};
const at = (action, cur, more = {}) => ({ hvac_action: action, current_temperature: cur, temperature: 22, ...more });
const range = { temperature: undefined, target_temp_low: 20, target_temp_high: 24 };

// Every case: full text and the short form are the same, so narrow tiles keep the word.
const same = (t) => [t, t];
assert.deepEqual(tile('heat', at('heating', 21)), same('22,2° · Heizt'), 'heating: no "auf 22°"');
assert.deepEqual(tile('heat', at('idle', 22)), same('22,2° · Inaktiv'), 'at the target: inactive, not ready to start');
assert.deepEqual(tile('heat', at('idle', 22, { temperature: undefined })), same('22,2° · Inaktiv'), 'no target: no number');
assert.deepEqual(tile('cool', at('cooling', 25)), same('22,2° · Kühlt'));
assert.deepEqual(tile('heat', at('heating', 18, range)), same('22,2° · Heizt'), 'range: no bound on the tile');
assert.deepEqual(tile('cool', at('cooling', 26, range)), same('22,2° · Kühlt'));
assert.deepEqual(tile('auto', at('idle', 22, range)), same('22,2° · Automatik'), 'auto: no range');
assert.deepEqual(tile('heat_cool', at('idle', 22, range)), same('22,2° · Automatik'));
assert.deepEqual(tile('auto', at('heating', 19, range)), same('22,2° · Heizt'), 'auto while heating says so');
assert.deepEqual(tile('heat_cool', at('cooling', 26, range)), same('22,2° · Kühlt'), 'auto while cooling says so');
assert.deepEqual(tile('off', at('idle', 18)), same('22,2° · Aus'), 'off with the room reading');
// Without a sensor (review 2, fam-15/E09): the thermostat's own reading in front, the room's (Klima badge) wins.
assert.deepEqual(tile('heat', at('heating', 21), false), same('21° · Heizt'), 'without a sensor: own reading');
assert.deepEqual(tile('heat', at('idle', 22), false), same('22° · Inaktiv'));
assert.deepEqual(tile('auto', at('idle', 21, range), false), same('21° · Automatik'));
assert.deepEqual(tile('off', at('idle', 21.1), false), same('21,1° · Aus'), 'off still shows the room');
assert.deepEqual(tile('off', at('off', undefined), false), same('Aus'), 'off without a reading: only "Aus"');
assert.deepEqual(tile('heat', at('heating', 21, { current_temperature: undefined }), false), same('Heizt'), 'no reading at all');
assert.equal(tile('unavailable', at(null, 21), false)[0], 'Nicht verfügbar');
win.casoraRoomTempOf = (id, st) => (st === S ? 23.3 : null);
assert.deepEqual(tile('off', at('idle', 21.7), false), same('23,3° · Aus'), 'the room reading as on the Klima badge');
delete win.casoraRoomTempOf;
for (const [st, act] of [['heat', 'heating'], ['heat', 'idle'], ['auto', 'idle'], ['cool', 'cooling'], ['off', 'off']]) {
  const t = tile(st, at(act, 21, range))[0];
  assert.ok(!/ auf |Ziel|–/.test(t) && (t.match(/°/g) || []).length === 1, 'one number only: ' + t);
}

// ── Tile icon (temp_puck): coloured circle + white icon in every mode but off ─────
{
  const puckSrc = T.casora_thermostat.custom_fields.temp_puck.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const w = { casoraIconUrl: () => 'x.svg', casoraEsc: (t) => String(t), casoraEscJs: (t) => String(t) };
  const puck = (state, attributes = {}) => new Function('states', 'entity', 'variables', 'window', puckSrc)({},
    { entity_id: 'climate.x', state, attributes: { hvac_modes: ['off', 'heat', 'cool', 'auto'], ...attributes } }, { has_controls: true }, w);
  const grey = 'var(--casora-puck-off-bg';
  const white = 'background-color:rgba(255,255,255,0.9)';
  for (const [st, a, tint] of [['heat', { hvac_action: 'heating' }, 'puck-heat-color'], ['heat', { hvac_action: 'idle' }, 'puck-heat-color'],
    ['auto', { hvac_action: 'idle' }, 'puck-heat-color'], ['heat_cool', { hvac_action: 'idle' }, 'puck-heat-color'],
    ['heat_cool', { hvac_action: 'cooling' }, 'puck-cool-color'], ['cool', { hvac_action: 'cooling' }, 'puck-cool-color']]) {
    const h = puck(st, a);
    assert.ok(!h.includes(grey) && h.includes('--casora-icon-circle-bg:var(--casora-' + tint) && h.includes(white), 'coloured: ' + st + ' ' + a.hvac_action);
  }
  const off = puck('off', { hvac_action: 'off' });
  assert.ok(off.includes(grey) && !off.includes(white), 'off: grey circle, tinted icon');
  assert.ok(puck('unavailable').includes(grey), 'unavailable: grey');
}

// ── Tile on/off: switch and active surface (owner, 02.11.2026: Automatik is „An“, only off is inactive) ──────
{
  // casora_entity decides both from its built-in active states plus the template's variables.active_states.
  const ent = JSON.stringify(T.casora_entity);
  const lists = [...ent.matchAll(/const (?:activeStates|defaults) = (\[\\"on[^\]]*\]);/g)].map((m) => JSON.parse(m[1].replace(/\\"/g, '"')));
  assert.equal(lists.length, 2, 'toggle and surface lists in casora_entity');
  const extra = T.casora_thermostat.variables.active_states || [];
  for (const L of lists) {
    const on = (st) => [...L, ...extra].includes(st);
    for (const m of ['heat', 'cool', 'auto', 'heat_cool', 'dry', 'fan_only']) assert.ok(on(m), 'on: ' + m);
    for (const m of ['off', 'unavailable', 'unknown']) assert.ok(!on(m), 'off: ' + m);
  }
  // The thermostat's own on-colours (overlay controls, name/state ink) follow the same rule, not only heat/cool.
  assert.ok(!JSON.stringify(T.casora_thermostat).includes("['cool','heat'].includes(entity?.state)"), 'no heat/cool-only rule left');
  const nameInk = T.casora_thermostat.styles.card.find((x) => x['--thermostat-overlay-text-name'])['--thermostat-overlay-text-name']
    .trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
  const ink = (state) => new Function('entity', nameInk)({ state });
  assert.equal(ink('auto'), ink('heat'), 'auto: active ink like heat');
  assert.notEqual(ink('off'), ink('heat'), 'off: inactive ink');

  // Studio preview: tileActive (the "on" class) and the puck colour.
  const panel = read('custom_components/casora/panel/casora-panel.js');
  const fn = cut(panel, 'const tileActive = (kind, ent, V, states) => {', '\n};\n') + '\n};';
  const tileActive = new Function('ENTITY_ACTIVE_STATES', fn + ' return tileActive;')(['on', 'cool', 'heat']);
  const pv = (state) => tileActive('thermostat', { state }, {}, {});
  for (const m of ['heat', 'cool', 'auto', 'heat_cool', 'dry', 'fan_only']) assert.ok(pv(m), 'preview on: ' + m);
  for (const m of ['off', 'unavailable', 'unknown']) assert.ok(!pv(m), 'preview off: ' + m);
  assert.ok(/!active \? \(TILE_COLOR\[kind\] \|\| TILE_TINT\)\s*: cools \?/.test(panel), 'preview puck: coloured whenever on');
}

// ── Tile popup (statusText, code inside the template) ──────────────────────────────
// The popup's code sits escaped inside a string of the template: find that string, unescape the function.
const strings = (o) => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []);
const holder = strings(T.casora_thermostat).find((s) => s.includes('const statusText = (e) =>'));
assert.ok(holder, 'statusText in the template');
const statusSrc = JSON.parse('"' + cut(holder, 'const statusText = (e) =>', "return 'Inaktiv';\\n  };") + "return 'Inaktiv';\\n  };" + '"');
const fmt = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const act = (e) => win.casoraClimateActive(e) || {};
const statusText = new Function('num', 'fmt', 'act', statusSrc + ' return statusText;')(num, fmt, act);
const E = (state, attributes) => ({ state, attributes });
assert.equal(statusText(E('heat', at('heating', 21))), 'Heizt auf 22,0 °C');
assert.equal(statusText(E('heat', at('idle', 22))), 'Inaktiv · Ziel 22,0 °C');
assert.equal(statusText(E('cool', at('cooling', 25))), 'Kühlt auf 22,0 °C', 'cooling was the raw mode');
assert.equal(statusText(E('heat_cool', at('idle', 22, range))), 'Automatik · 20,0–24,0 °C');
assert.equal(statusText(E('dry', at(null, 22))), 'Entfeuchten');
assert.equal(statusText(E('fan_only', at(null, 22))), 'Nur Lüfter');
assert.equal(statusText(E('off', at(null, 22))), 'Aus');

// ── Popup head (03-popups.js F.status) ─────────────────────────────────────────────
{
  const src = read('custom_components/casora/scripts/local/03-popups.js');
  const a = src.indexOf('(function () {\n  if (window._casoraFbh) return;');
  const b = src.indexOf('\n})();', a);
  const w = { addEventListener() {}, casoraClimateActive: win.casoraClimateActive,
    _casoraUI: { tokens: { font: 'x', ink: '#000', ink2: '#111', ink3: '#222' } } };
  const doc = { querySelector: () => ({ hass: { config: { unit_system: { temperature: '°C' } } } }) };
  new Function('window', 'document', src.slice(a, b + 6))(w, doc);
  const F = w._casoraFbh;
  const st = (state, attributes) => F.status({ id: 'climate.x' }, { 'climate.x': { state, attributes } });
  assert.equal(st('heat', at('heating', 21)), 'Heizt auf 22,0 °C');
  assert.equal(st('heat', at('idle', 22)), 'Inaktiv · Ziel 22,0 °C', 'idle word agrees with the tile');
  assert.equal(st('cool', at('cooling', 25, range)), 'Kühlt auf 24,0 °C');
  assert.equal(st('auto', at('idle', 22, range)), 'Automatik · 20,0–24,0 °C');
  assert.equal(st('fan_only', at(null, 22)), 'Nur Lüfter');
}

// ── casoraStateFit: own short form instead of "first part +N" ─────────────────────
{
  const core = read('custom_components/casora/scripts/casora-core.js');
  const w = { casoraTextEm: () => 5 };
  new Function('window', cut(core, '    window.casoraStateFit = function', '    // Statuszeile (1.4.1)'))(w);
  const own = w.casoraStateFit('22,2° · Heizt auf 22°', undefined, '22,2° · Heizt');
  assert.ok(own.includes('<span class="sf-f">22,2° · Heizt auf 22°</span>') && own.includes('>22,2° · Heizt</span>'), 'both forms');
  assert.ok(!own.includes('+1'), 'no counter with an own short form');
  // The calm thermostat passes its text as its own short form: cut with "…", never "22,2° +1".
  const self = w.casoraStateFit('22,2° · Automatik', undefined, '22,2° · Automatik');
  assert.ok(self.includes('<span class="sf-f">22,2° · Automatik</span>') && self.includes('>22,2° · Automatik</span>') && !self.includes('+1'), 'same text: no counter');
  assert.ok(w.casoraStateFit('Trocknet Mopp · Station', undefined).includes('+1'), 'without one: counter as before');
}
console.log('ok thermostat_wording');
