// Weather warning tile with the DWD level sensors (issue #55): the tile only took a safety binary_sensor
// (NINA/Meteoalarm: on/off, severity/headline …); HA's "Deutscher Wetterdienst (DWD) Weather Warnings" gives
// sensor.<region>_current_warning_level (state = level 0–4, warning_count, warning_<n>_* attributes) instead.
// Expected: one normaliser (01-basis.js window.casoraWarnings) turns both shapes into one list of warnings,
// level 1–4 ↔ Minor/Moderate/Severe/Extreme, a DWD sensor is active only with level > 0 and warning_count > 0;
// the tile's name/colour/state expressions and the popup read that list, the Studio offers the sensor.
//   node dev/unit/wetterwarnung_dwd.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const R = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const basis = R('../../custom_components/casora/scripts/local/01-basis.js');
const T = JSON.parse(R('../../dashboards/casora/button_card_templates.json'));
const types = R('../../custom_components/casora/panel/casora-panel-types.js');
const panel = R('../../custom_components/casora/panel/casora-panel.js');
const finder = R('../../custom_components/casora/scripts/local/00-finder.js');

// The normaliser alone, out of the notify module (as wetterwarnung_farbe.mjs does for casoraWarnHue).
const block = basis.match(/  window\.casoraWarnings = \(function \(\) \{[\s\S]*?\n  \}\)\(\);\n/);
assert.ok(block, 'casoraWarnings block in 01-basis.js');
globalThis.window = {};
new Function('window', block[0])(window);
const W = window.casoraWarnings;
for (const k of ['list', 'of', 'top', 'active', 'isLevelSensor', 'level', 'severity', 'region', 'kind']) assert.equal(typeof W[k], 'function', k);

// ── shapes ──
const nina = (state, attrs) => ({ entity_id: 'binary_sensor.nina_warning_teststadt_1', state, attributes: attrs || {} });
const dwd = (level, warnings, extra) => {
  const a = { friendly_name: 'Testland Aktuelle Warnstufe', last_update: '2026-10-24T08:30:00+02:00', region_name: 'Testland Nord',
    region_id: 909999999, warning_count: warnings.length, ...(extra || {}) };
  warnings.forEach((w, i) => { const k = 'warning_' + (i + 1) + '_'; Object.assign(a, { [k + 'name']: w.name, [k + 'type']: 50 + i,
    [k + 'level']: w.level, [k + 'headline']: w.headline, [k + 'description']: 'Beschreibung ' + (i + 1), [k + 'instruction']: 'Hinweis ' + (i + 1),
    [k + 'start']: '2026-10-24T0' + (6 + i) + ':00:00+02:00', [k + 'end']: '2026-10-24T1' + (2 + i) + ':00:00+02:00', [k + 'parameters']: {}, [k + 'color']: '#f00' }); });
  return { entity_id: 'sensor.testland_current_warning_level', state: String(level), attributes: a };
};
const STURM = { name: 'SCHWERE STURMBÖEN', level: 3, headline: 'Amtliche UNWETTERWARNUNG vor SCHWEREN STURMBÖEN' };
const GEWITTER = { name: 'GEWITTER', level: 2, headline: 'Amtliche WARNUNG vor GEWITTER' };

// ── binary_sensor as before ──
assert.equal(W.isLevelSensor(nina('on', { severity: 'Severe' })), false);
assert.deepEqual(W.of(nina('off', { severity: 'Severe' })), [], 'off = nothing');
const b = W.of(nina('on', { severity: 'Severe', headline: 'Amtliche UNWETTERWARNUNG vor ORKANBÖEN', description: 'D', instruction: 'I',
  sent: '2026-10-24T07:00:00+02:00', expires: '2026-10-24T12:00:00+02:00', event: 'Orkanböen' }));
assert.equal(b.length, 1);
assert.equal(b[0].level, 3);
assert.equal(b[0].severity, 'Severe');
assert.equal(b[0].headline, 'Amtliche UNWETTERWARNUNG vor ORKANBÖEN');
assert.equal(b[0].start, '2026-10-24T07:00:00+02:00');
assert.equal(b[0].end, '2026-10-24T12:00:00+02:00');
assert.equal(b[0].entity, 'binary_sensor.nina_warning_teststadt_1');
assert.equal(W.kind(b[0]), 'Orkanböen');
assert.equal(W.of(nina('on', {}))[0].severity, 'Minor', 'on without severity counts as Minor');
assert.equal(W.of(nina('on', { severity: 'Extreme' }))[0].level, 4);
assert.equal(W.of(nina('on', { severity: 'Extrem' }))[0].level, 4, 'tolerates the mistyped „Extrem“');
assert.equal(W.region(nina('on', { region: 'Teststadt' })), 'Teststadt');

// ── DWD level sensor ──
assert.equal(W.isLevelSensor(dwd(0, [])), true, 'warning_count makes it a level sensor');
assert.equal(W.isLevelSensor({ entity_id: 'sensor.x', state: '3', attributes: {} }), false, 'a plain sensor is none');
assert.equal(W.active(dwd(0, [])), false, 'level 0 = inactive');
assert.deepEqual(W.of(dwd(0, [])), []);
assert.equal(W.active(dwd(2, [], { warning_count: 0 })), false, 'level without warnings = inactive');
assert.equal(W.active(dwd(0, [GEWITTER], { warning_count: 1 })), false, 'warnings but level 0 = inactive (state wins)');
assert.equal(W.active(dwd(2, [GEWITTER])), true);
const one = W.of(dwd(2, [GEWITTER]));
assert.equal(one.length, 1);
assert.deepEqual([one[0].level, one[0].severity, one[0].headline, one[0].event], [2, 'Moderate', 'Amtliche WARNUNG vor GEWITTER', 'GEWITTER']);
assert.equal(one[0].description, 'Beschreibung 1');
assert.equal(one[0].instruction, 'Hinweis 1');
assert.equal(one[0].start, '2026-10-24T06:00:00+02:00');
assert.equal(one[0].end, '2026-10-24T12:00:00+02:00');
assert.equal(one[0].updated, '2026-10-24T08:30:00+02:00', 'last_update as the update time');
assert.equal(one[0].entity, 'sensor.testland_current_warning_level');
assert.equal(W.kind(one[0]), 'Gewitter');
const two = W.of(dwd(3, [GEWITTER, STURM]));
assert.equal(two.length, 2, 'warning_count warnings');
assert.deepEqual(two.map((w) => w.level), [2, 3], 'of() keeps the sensor order');
assert.equal(W.region(dwd(3, [STURM])), 'Testland Nord');
// Level mapping 1–4 ↔ words, out of range clamped.
assert.deepEqual([1, 2, 3, 4].map(W.severity), ['Minor', 'Moderate', 'Severe', 'Extreme']);
assert.deepEqual(['Minor', 'Moderate', 'Severe', 'Extreme'].map(W.level), [1, 2, 3, 4]);
assert.equal(W.of(dwd(4, [{ ...STURM, level: 9 }]))[0].severity, 'Extreme');
assert.equal(W.of(dwd(1, [{ ...STURM, level: 0 }]))[0].severity, 'Minor');

// ── list over several sensors: most severe first, both shapes mixed ──
const S = { 'sensor.testland_current_warning_level': dwd(3, [GEWITTER, STURM]), 'binary_sensor.nina_warning_teststadt_1': nina('on', { severity: 'Extreme', headline: 'X' }),
  'binary_sensor.nina_warning_teststadt_2': nina('off', { severity: 'Severe' }) };
const L = W.list(S, Object.keys(S).concat('sensor.fehlt', null));
assert.deepEqual(L.map((w) => w.level), [4, 3, 2]);
assert.equal(W.top(S, Object.keys(S)), 4);
assert.equal(W.top(S, ['binary_sensor.nina_warning_teststadt_2']), 0);
assert.equal(W.top({}, ['sensor.fehlt']), 0, 'missing sensor = nothing');

// ── the tile reads the list (no second parser in the templates) ──
const tile = T.casora_weather_warning, popup = T.casora_popup_weather_warning;
const js = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const fn = (s) => new Function('states', 'entity', 'user', 'hass', 'variables', 'html', js(s));
window.matchMedia = () => ({ matches: false });
const levels = fn(tile.variables.levels)({}, null, {}, {}, {});
const vars = (ids) => ({ sensors: ids, levels });
const D = { 'sensor.t': dwd(3, [GEWITTER, STURM]) }, ent = { entity_id: 'sensor.t' };
assert.equal(fn(tile.name)(D, ent, {}, {}, vars([])), 'Warnungen · Schwere Warnung', 'name from the highest DWD level');
assert.equal(fn(tile.name)({ 'sensor.t': dwd(0, []) }, ent, {}, {}, vars([])), 'Warnungen');
assert.equal(fn(tile.state[0].value)(D, ent, {}, {}, vars([])), true, 'tile active');
assert.equal(fn(tile.state[0].value)({ 'sensor.t': dwd(0, []) }, ent, {}, {}, vars([])), false, 'level 0: tile quiet');
let colour = null;
tile.state[0].styles.card.forEach((o) => { if (o['--casora-icon-color-current']) colour = o['--casora-icon-color-current']; });
assert.equal(fn(colour)(D, ent, {}, {}, vars([])), 'var(--casora-color-red, #FF4245)', 'level 3 = red like Severe');
assert.equal(fn(colour)({ 'sensor.t': dwd(4, [{ ...STURM, level: 4 }]) }, ent, {}, {}, vars([])), 'var(--casora-color-purple, #9333ea)');
window.casoraStateFit = (t) => t;
const shown = fn(tile.state_display)(D, ent, {}, {}, vars([]));
assert.match(shown, /Schweren Sturmböen · 1 weitere/, 'state: the headline of the most severe warning plus the count');
for (const [name, src] of [['tile', JSON.stringify(tile)], ['popup', JSON.stringify(popup)]]) {
  assert.ok(src.includes('window.casoraWarnings'), name + ' reads casoraWarnings');
  assert.ok(!/s\.state === 'on'|severityToLevel|attributes\?\.severity/.test(src), name + ' has no parser of its own left');
}
assert.ok(popup.tap_action.casora_popup.content.includes('W.region('), 'popup region from the normaliser (DWD region_name)');

// ── the bell reads the same list ──
assert.ok(basis.includes('WR.of(st, id).forEach(function (w, i) {'), 'bell: one row per warning from casoraWarnings');
assert.ok(basis.includes('window.casoraWarnings.isLevelSensor(st, id)'), 'bell: a DWD sensor counts as warning source');
assert.ok(finder.includes("window.casoraWarnings.isLevelSensor(st, id)"), 'bell exceptions list the DWD sensor');

// ── Studio: picker and finder offer the DWD sensor ──
const typeLine = types.match(/\{ id: "casora_weather_warning"[\s\S]*?fields: \[[\s\S]*?\] \}/)[0];
assert.ok(/domains: \["binary_sensor", "sensor"\]/.test(typeLine), 'tile type takes sensors too');
assert.equal((typeLine.match(/accept: "weather_warning"/g) || []).length, 2, 'type and the sensors list use the accept rule');
assert.ok(/const ACCEPT_RULES = \{\s*weather_warning: isWarningLevelSensor/.test(panel), 'ACCEPT_RULES.weather_warning');
assert.ok(/if \(acc && acc\(this\._hass, e\)\) return true;/.test(panel), '_entityList honours the rule');
const hass = { states: { 'sensor.a': { attributes: { warning_count: 2 } }, 'sensor.b': { attributes: {} }, 'binary_sensor.c': { attributes: { warning_count: 1 } } } };
const rule = new Function('return ' + panel.match(/const isWarningLevelSensor = \(h, id\) => [\s\S]*?warning_count, 10\)\);\n/)[0].replace('const isWarningLevelSensor = ', ''))();
assert.deepEqual(['sensor.a', 'sensor.b', 'binary_sensor.c', 'sensor.x'].map((id) => rule(hass, id)), [true, false, false, false]);
const spec = panel.match(/casora_weather_warning: \{[^\n]*\},\n/)[0];
assert.ok(/match: isWarningLevelSensor/.test(spec) && !/domain: "binary_sensor"/.test(spec), 'finder suggests DWD sensors');
assert.ok(/not: \/advance_warning\|vorwarn\/i/.test(spec), 'finder prefers the current level over the advance warning');

console.log('ok wetterwarnung_dwd');
