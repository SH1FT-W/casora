// CO detector card (#124, scripts/local/42-co.js): levels 30/50/100 ppm, tile text and colour, the detector's other
// entities found on its device by device_class/translation_key (never by entity id), a CO alarm counts as danger, the
// last raised value from the history, and popup v3: S6 dial with the range, its colour and the thresholds as marks, the
// Verlauf slot with 24 Std. · 7 Tage, what to do per level, the levels and the detector rows. Plus the wiring: module
// loaded, templates, Studio type (only with a CO sensor), main entity finder, English texts.
//   node dev/unit/co_sensor.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub() });
const win = { innerWidth: 1440 };
const box = { window: win, document: stub(), setTimeout, console, getComputedStyle: () => ({}), localStorage: { getItem: () => null } };
vm.createContext(box);
for (const f of ['00-finder.js', '42-co.js']) vm.runInContext(read('custom_components/casora/scripts/local/' + f), box);
const C = win._casoraCo;
// Values from the vm realm: compare as plain JSON.
const eq = (a, b, msg) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, msg);
assert.ok(C, 'module loads');

// Levels (agreed in the issue): < 30 normal, from 30 slightly raised, from 50 warning, from 100 danger.
eq([0, 29.9, 30, 49, 50, 99.5, 100, 400].map(C.level), [0, 0, 1, 1, 2, 2, 3, 3]);
assert.equal(C.level('unavailable'), null);
eq(C.COLOR.map((c) => c.split(',')[0]), ['var(--casora-color-green', 'var(--casora-color-yellow',
  'var(--casora-color-orange', 'var(--casora-color-red'], 'colours from the theme tokens');

// Made-up detector; entity ids say nothing (x1 …), the finder goes by device_class and translation_key.
const st = (state, a) => ({ state, attributes: a || {}, last_changed: new Date(Date.now() - 120000).toISOString() });
const hass = {
  states: {
    'sensor.x1': st('12.0', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm', state_class: 'measurement' }),
    'binary_sensor.x2': st('off', { device_class: 'carbon_monoxide' }),
    'binary_sensor.x3': st('off', { device_class: 'carbon_monoxide' }),
    'binary_sensor.x4': st('off', { device_class: 'smoke' }),
    'sensor.x5': st('87', { device_class: 'battery', unit_of_measurement: '%' }),
    'button.x6': st(new Date(Date.now() - 3 * 864e5).toISOString(), { friendly_name: 'Detector A Self-test' }),
    'binary_sensor.x7': st('off', { device_class: 'running' }),
    'binary_sensor.x8': st('off', { device_class: 'problem' }),
    'sensor.other': st('7', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' }),
  },
  entities: {
    'sensor.x1': { device_id: 'd1' },
    'binary_sensor.x2': { device_id: 'd1', translation_key: 'interconnected_co_alarm' },
    'binary_sensor.x3': { device_id: 'd1' },
    'binary_sensor.x4': { device_id: 'd1' },
    'sensor.x5': { device_id: 'd1', entity_category: 'diagnostic' },
    'button.x6': { device_id: 'd1', translation_key: 'self_test_request' },
    'binary_sensor.x7': { device_id: 'd1', translation_key: 'test_in_progress' },
    'binary_sensor.x8': { device_id: 'd1', translation_key: 'hardware_fault' },
  },
  devices: { d1: { name: 'Detector A' } },
  areas: {},
};
const ent = (id) => Object.assign({ entity_id: id }, hass.states[id]);
let m = C.model(hass, 'sensor.x1');
assert.equal(m.alarm, 'binary_sensor.x3', 'own CO alarm before the interconnected one');
eq([m.smoke, m.battery, m.test, m.testRun, m.faults.join()], ['binary_sensor.x4', 'sensor.x5', 'button.x6', 'binary_sensor.x7', 'binary_sensor.x8']);
eq([m.ppm, m.lv, m.unit], [12, 0, 'ppm']);
assert.equal(C.model(hass, 'sensor.other').alarm, null, 'a sensor without a device: nothing else');

// Tile: the value with its unit, the colour of the level; highlighted from 30 ppm on.
assert.equal(C.tileState(ent('sensor.x1'), hass), '12 ppm');
assert.equal(C.tileColor(ent('sensor.x1'), hass), C.COLOR[0]);
assert.equal(C.active(ent('sensor.x1'), hass), false);
for (const [v, lv] of [['35', 1], ['60', 2], ['120', 3]]) {
  hass.states['sensor.x1'] = st(v, { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
  assert.equal(C.tileColor(ent('sensor.x1'), hass), C.COLOR[lv], v + ' ppm → level ' + lv);
  assert.equal(C.active(ent('sensor.x1'), hass), true);
}
hass.states['sensor.x1'] = st('unavailable', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
assert.equal(C.tileState(ent('sensor.x1'), hass), 'Nicht verfügbar');
hass.states['sensor.x1'] = st('unknown', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
assert.equal(C.tileState(ent('sensor.x1'), hass), 'Unbekannt');
assert.equal(C.tileState(null, hass), '', 'entity missing: quiet');
// The detector's CO alarm is danger even while the reading is low.
hass.states['sensor.x1'] = st('8', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
hass.states['binary_sensor.x3'] = st('on', { device_class: 'carbon_monoxide' });
assert.equal(C.model(hass, 'sensor.x1').lv, 3, 'CO alarm → danger');
hass.states['binary_sensor.x3'] = st('off', { device_class: 'carbon_monoxide' });

// Last raised value from history rows.
const T0 = Date.parse('2026-11-01T00:00:00Z'), H = 36e5;
const rows = [{ s: '2', t: T0 }, { s: '35', t: T0 + H }, { s: '62', t: T0 + 2 * H }, { s: '10', t: T0 + 3 * H }, { s: '4', t: T0 + 5 * H }];
eq(C.lastHigh(rows, T0 + 10 * H), { t: T0 + 3 * H, max: 62 }, 'end of the last raised stretch and its peak');
eq(C.lastHigh(rows.concat([{ s: '40', t: T0 + 6 * H }]), T0 + 7 * H), { now: true, since: T0 + 6 * H, max: 40 }, 'raised now');
assert.equal(C.lastHigh([{ s: '3', t: T0 }, { s: 'unavailable', t: T0 + H }], T0 + 2 * H), null, 'nothing raised');
assert.equal(C.lastHigh(null), null);

// Popup v3 through a recording UI stub.
const calls = [];
win._casoraUI = { stage: (t, o) => { calls.push([t, JSON.parse(JSON.stringify(o))]); return 'S:' + t; }, line: (w, rest) => 'L:' + w + '|' + rest.join(),
  group: (rs, l) => ({ rows: rs, l }) };
win._hpPlantCfg = {};
win._hpChartCfg = (k, label, span, color, height) => (win._hpPlantCfg[k] = { type: 'custom:casora-chart', span, height, series: [{ entity: k, name: label, color }] });
win._hpStageChart = () => {};
win._casoraZiele = { history: () => rows };
hass.states['sensor.x1'] = st('62', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
assert.ok(C.charts('sensor.x1'), 'chart configs');
const c24 = win._hpPlantCfg['co:sensor.x1|24h'], c7 = win._hpPlantCfg['co:sensor.x1|7d'];
eq([c24.span, c24.series[0].entity, c24.readout, c24.plate, c7.span, c7.series[0].entity], ['24h', 'sensor.x1', 'hero', false, '7d', 'sensor.x1']);
assert.match(c24.series[0].color, /^var\(--casora-color-teal/, 'line in the air-quality teal, no traffic light colour');
assert.equal(C.sec('hero', { id: 'sensor.x1' }, hass.states, hass), 'L:Warnung|', 'head says the level');
const html = C.sec('stage', { id: 'sensor.x1' }, hass.states, hass, null);
let [t, o] = calls.pop();
assert.equal(t, 'chart', 'S6');
eq([o.value, o.unit, o.read, o.ring.min, o.ring.max, o.ring.color, o.ring.marks], ['62', 'ppm', 'sensor.x1', 0, 150, C.COLOR[2], [30, 50, 100]],
  'dial: value, range, colour of the level, thresholds as marks');
assert.match(o.chart, /class="hp-chart-slot"[^>]*pointer-events:auto/, 'chart slot takes taps (reading value and time)');
eq(o.range.map((r) => [r.label, r.active, r.attrs['data-hp-metric']]),
  [['24 Std.', true, 'co:sensor.x1|24h'], ['7 Tage', false, 'co:sensor.x1|7d']], 'range switch 24 Std. · 7 Tage');
assert.match(html, /onclick="window\._hpPlantTap/, 'range taps go through the shared chart switch');

// Frozen stage (follow-up to #124, r590): a new ppm keeps the exact HTML – no redraw, no chart remount –,
// the ring is painted in place (UI.dialPaint) and the number follows live (data-hp-live).
win._casoraUI.dialPct = (v, mn, mx) => (v - mn) / (mx - mn) * 100;
const paints = [];
win._casoraUI.dialPaint = (dl, pct) => paints.push(pct);
const elS = { shadowRoot: { querySelector: () => ({ querySelectorAll: () => [] }) } };
const h1 = C.sec('stage', { id: 'sensor.x1' }, hass.states, hass, elS);
assert.equal(calls.pop()[1].live, 'sensor.x1', 'the number follows live');
const drawn = calls.length;
hass.states['sensor.x1'] = st('63', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
const h2 = C.sec('stage', { id: 'sensor.x1' }, hass.states, hass, elS);
assert.equal(h2, h1, 'a new ppm keeps the same HTML (no redraw)');
assert.equal(calls.length, drawn, 'the stage is not drawn again for a new ppm');
await new Promise((r) => setTimeout(r, 5));
eq(paints.map(Math.round), [41, 42], 'the ring is painted in place per value');
hass.states['sensor.x1'] = st('unavailable', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
C.sec('stage', { id: 'sensor.x1' }, hass.states, hass, elS);
assert.equal(calls.length, drawn + 1, 'unavailable draws the stage anew');
assert.equal(calls.pop()[1].state, 'na', 'unavailable stage greyed');
calls.length = 0;
hass.states['sensor.x1'] = st('62', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });

const todo = C.sec('todo', { id: 'sensor.x1' }, hass.states, hass);
assert.equal(todo.l, 'Was tun');
assert.match(todo.rows[0].sub, /Raum verlassen/, 'warning: leave the room');
hass.states['sensor.x1'] = st('120', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
assert.match(C.sec('todo', { id: 'sensor.x1' }, hass.states, hass).rows[0].label, /Notruf 112/, 'danger: call 112');
const lv = C.sec('levels', { id: 'sensor.x1' }, hass.states, hass);
eq(lv.rows.map((r) => [r.label, r.value, !!r.active]),
  [['Normal', 'unter 30 ppm', false], ['Leicht erhöht', '30 bis 49 ppm', false], ['Warnung', '50 bis 99 ppm', false], ['Gefahr', 'ab 100 ppm', true]]);
hass.states['sensor.x1'] = st('4', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
const dev = C.sec('device', { id: 'sensor.x1' }, hass.states, hass, null);
assert.equal(dev.l, 'Melder');
const byLabel = Object.fromEntries(dev.rows.map((r) => [r.label, r]));
eq(Object.keys(byLabel), ['CO-Alarm', 'Rauchalarm', 'Batterie', 'Selbsttest', 'Zuletzt erhöht'], 'no fault row while there is none');
assert.equal(byLabel['CO-Alarm'].value, 'Kein Alarm');
assert.equal(byLabel.Selbsttest.svc.service, 'press');
assert.equal(byLabel.Selbsttest.svc.target.entity_id, 'button.x6');
assert.ok(byLabel.Selbsttest.confirm, 'self-test asks first (it beeps loudly)');
assert.equal(byLabel.Selbsttest.sub, 'Letzter Test vor 3 Tagen');
assert.match(byLabel['Zuletzt erhöht'].value, /^vor \d+ (Tagen|Std\.) · max\. 62 ppm$/);
hass.states['binary_sensor.x8'] = st('on', { device_class: 'problem' });
assert.ok(C.sec('device', { id: 'sensor.x1' }, hass.states, hass, null).rows.some((r) => r.label === 'Gerätefehler'), 'a fault shows');
// The detector unreachable: stage greyed, no crash.
hass.states['sensor.x1'] = st('unavailable', { device_class: 'carbon_monoxide', unit_of_measurement: 'ppm' });
C.sec('stage', { id: 'sensor.x1' }, hass.states, hass, null);
[t, o] = calls.pop();
eq([o.state, o.value], ['na', 'Nicht verfügbar']);
assert.equal(C.sec('todo', { id: 'sensor.x1' }, hass.states, hass), '', 'no advice without a reading');
assert.equal(C.sec('stage', { id: 'sensor.gone' }, hass.states, hass, null).length > 0, true, 'entity gone: no TypeError');

// Wiring.
assert.ok(read('custom_components/casora/scripts/casora-local.js').includes("'42-co'"), 'module in MODULES');
const tpl = JSON.parse(read('dashboards/casora/button_card_templates.json'));
eq(tpl.casora_co.template, ['casora_entity', 'casora_popup_co']);
assert.equal(tpl.casora_co.variables.icon, 'co');
assert.ok(fs.existsSync(new URL('custom_components/casora/assets/icons/co.svg', ROOT)), 'own icon');
assert.match(tpl.casora_co.state_display, /window\._casoraCo/);
assert.match(JSON.stringify(tpl.casora_co.styles), /tileColor/);
assert.equal(tpl.casora_popup_co.tap_action.casora_popup.variant, 'v3');
assert.match(tpl.casora_popup_co.tap_action.casora_popup.content, /window\._casoraCo\.popup/);
const built = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
eq([built.casora_co.template, !!built.casora_popup_co], [tpl.casora_co.template, true], 'templates built');
const types = read('custom_components/casora/panel/casora-panel-types.js');
assert.match(types, /id: "casora_co"[\s\S]{0,400}device_class === "carbon_monoxide"/, 'Studio: only offered with a CO sensor');
const panel = read('custom_components/casora/panel/casora-panel.js');
assert.match(panel, /casora_co: \{ domain: "sensor", match: [^\n]*"carbon_monoxide"/, 'main entity by device_class');
assert.ok(!/sensor\.[a-z0-9_]+co\b/.test(read('custom_components/casora/scripts/local/42-co.js')), 'no entity ids in the module');

// English for every German text the module shows.
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact;
const src = read('custom_components/casora/scripts/local/42-co.js');
const texts = new Set();
for (const mm of src.matchAll(/(?:label|sub|value|text|done|confirm|caption): '([^']*[a-zäöüß][^']*)'/g)) texts.add(mm[1]);
C.WORD.concat(C.RANGE).forEach((x) => texts.add(x));
['Was tun', 'Stufen', 'Melder', 'Kohlenmonoxid', 'Kein Alarm', 'Ausgelöst', 'Nicht in 7 Tagen'].forEach((x) => texts.add(x));
const miss = [...texts].filter((x) => !/^mdi:/.test(x) && !(x in en));
eq(miss, [], 'English phrases missing');
console.log('ok co_sensor');
