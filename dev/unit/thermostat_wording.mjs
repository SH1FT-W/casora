// Thermostat wording (21.10.2026): the tile read "22,2° · An · 22°" – two numbers and a switch word. Now
// "22,2° · Heizt auf 22°" / "22,2° · Ziel 22°", on narrow tiles the own short form "22,2° · Heizt" (instead
// of "22,2° +1"). Tile, tile popup (statusText) and the popup head (03-popups.js F.status) use the same words;
// with a range heating aims at the lower and cooling at the upper bound; the popup never shows the raw mode.
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

assert.deepEqual(tile('heat', at('heating', 21)), ['22,2° · Heizt auf 22°', '22,2° · Heizt'], 'heating, short keeps the word');
assert.deepEqual(tile('heat', at('idle', 22)), ['22,2° · Ziel 22°', undefined], 'at the target: "Ziel", no "An"');
assert.deepEqual(tile('heat', at('idle', 22, { temperature: undefined })), ['22,2° · Bereit', undefined], 'no target: no number');
assert.deepEqual(tile('cool', at('cooling', 25)), ['22,2° · Kühlt auf 22°', '22,2° · Kühlt']);
assert.equal(tile('heat', at('heating', 18, range))[0], '22,2° · Heizt auf 20°', 'range: heats to the lower bound');
assert.equal(tile('cool', at('cooling', 26, range))[0], '22,2° · Kühlt auf 24°', 'range: cools to the upper bound');
assert.deepEqual(tile('auto', at('idle', 22, range)), ['22,2° · Automatik · 20–24°', '22,2° · Automatik']);
assert.deepEqual(tile('off', at('idle', 18)), ['22,2° · Aus', undefined]);
assert.deepEqual(tile('heat', at('heating', 21), false), ['Heizt auf 22°', 'Heizt'], 'without a sensor');
assert.deepEqual(tile('heat', at('idle', 22), false), ['Ziel 22°', undefined]);

// ── Tile popup (statusText, code inside the template) ──────────────────────────────
// The popup's code sits escaped inside a string of the template: find that string, unescape the function.
const strings = (o) => (typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(strings) : []);
const holder = strings(T.casora_thermostat).find((s) => s.includes('const statusText = (e) =>'));
assert.ok(holder, 'statusText in the template');
const statusSrc = JSON.parse('"' + cut(holder, 'const statusText = (e) =>', "return 'Bereit';\\n  };") + "return 'Bereit';\\n  };" + '"');
const fmt = (n) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const act = (e) => win.casoraClimateActive(e) || {};
const statusText = new Function('num', 'fmt', 'act', statusSrc + ' return statusText;')(num, fmt, act);
const E = (state, attributes) => ({ state, attributes });
assert.equal(statusText(E('heat', at('heating', 21))), 'Heizt auf 22,0 °C');
assert.equal(statusText(E('heat', at('idle', 22))), 'Ziel 22,0 °C');
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
  assert.equal(st('heat', at('idle', 22)), 'Ziel 22,0 °C', 'was "An · 22,0 °C"');
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
  assert.ok(w.casoraStateFit('Trocknet Mopp · Station', undefined).includes('+1'), 'without one: counter as before');
}
console.log('ok thermostat_wording');
