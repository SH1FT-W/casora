// Aquarium 26.11.9 (owner, 03.11.2026): the v3 tank popup shows a dosing pump as one row „Dosierung“ (warning below 20 %
// container or under 7 days left, the most urgent channel named), a sub page with a short line per channel, and the
// channels of the lamp as a list with a slim track (design A). The Studio's dosing pump picker fills the dosing_* fields
// from the pump's entities (casoraBasis.dosingFill) and only offers a pump (dosingSuggest). Regress r522.
//   node dev/unit/aquarium_dose_v3.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const src = read('custom_components/casora/scripts/local/02-devices.js');
const a = src.indexOf('(function () {\n  if (window._casoraAqParts) return;');
const b = src.indexOf('\n})();', a);
assert.ok(a > 0 && b > a, 'aquarium block');
const W = { casoraLocale: () => 'de-DE' };
new Function('window', src.slice(a, b + 6))(W);
// The tile block (channels list, dosing row and pages) right after it.
const a2 = src.indexOf('(function () {\n\n  window._casoraAqWrap', b);
const b2 = src.indexOf('\n})();', a2);
assert.ok(a2 > 0 && b2 > a2, 'tile block');
new Function('window', 'document', src.slice(a2, b2 + 6))(W, { addEventListener() {}, querySelector: () => null });

// 1) The Studio fields reach the channels; without them the entry stays as before (no extra keys).
const S = {};
const st = (id, v) => { S[id] = { entity_id: id, state: String(v), attributes: {} }; };
const btn = [1, 2, 3, 4].map((n) => 'button.qa_pumpe_' + n + '_dosieren');
btn.forEach((x, i) => { st(x, 'unknown'); st('sensor.qa_pumpe_' + (i + 1) + '_heute', [1.5, 1, 1, 1][i]);
  st('sensor.qa_pumpe_' + (i + 1) + '_rest', [420, 310, 40, 99][i]); st('sensor.qa_pumpe_' + (i + 1) + '_tage', [61, 44, 3, 7][i]);
  st('sensor.qa_pumpe_' + (i + 1) + '_groesse', 500); st('number.qa_pumpe_' + (i + 1) + '_menge', 1); });
const map = (end) => Object.fromEntries(btn.map((x, i) => [x, x.replace('button.', end.split('.')[0] + '.').replace('_dosieren', '_' + end.split('.')[1])]));
const V = { dosing_buttons: btn, dosing_today: map('sensor.heute'), dosing_volume: map('number.menge'), dosing_remaining: map('sensor.rest'),
  dosing_days_left: map('sensor.tage'), dosing_capacity: map('sensor.groesse'),
  dosing_names: { [btn[0]]: 'Calcium', [btn[1]]: 'Magnesium', [btn[2]]: 'Spurenelemente', [btn[3]]: 'Dünger' } };
const dose = W._casoraAqParts(V, S).dose;
assert.equal(dose.length, 4);
assert.equal(dose[2].left, 'sensor.qa_pumpe_3_rest');
assert.equal(dose[2].days, 'sensor.qa_pumpe_3_tage');
assert.equal(dose[2].size, 'sensor.qa_pumpe_3_groesse');
assert.ok(!('left' in W._casoraAqParts({ dosing_buttons: btn }, S).dose[0]), 'no Studio field, no key');

// 2) Warning: below 20 % or under 7 days; the summary names the most urgent channel.
const c = { dose, labels: dose.map((d) => d.label) };
const info = W._casoraAqDoseInfo(c, S);
assert.deepEqual(info.map((x) => x.low), [false, false, true, true], '3 days; 99/500 ml (19.8 %) with 7 days (not under 7) low by its level');
S['sensor.qa_pumpe_4_rest'].state = '100'; // 20 % exactly: fine
assert.equal(W._casoraAqDoseInfo(c, S)[3].low, false);
S['sensor.qa_pumpe_4_rest'].state = '99';
assert.equal(W._casoraAqDoseInfo(c, S)[3].low, true, '19.8 % is below 20 %');
let sum = W._casoraAqDoseSum(W._casoraAqDoseInfo(c, S));
assert.equal(sum.warn, true);
assert.equal(sum.sub, 'Spurenelemente reicht noch 3 T.', 'the channel with the fewest days');
assert.equal(sum.value, 'heute 4,5 ml');
S['sensor.qa_pumpe_3_rest'].state = '400'; S['sensor.qa_pumpe_3_tage'].state = '30';
sum = W._casoraAqDoseSum(W._casoraAqDoseInfo(c, S));
assert.equal(sum.sub, 'Dünger fast leer', 'only the level is low: „fast leer“');
S['sensor.qa_pumpe_4_rest'].state = '300';
sum = W._casoraAqDoseSum(W._casoraAqDoseInfo(c, S));
assert.equal(sum.warn, false);
assert.equal(sum.sub, '4 Kanäle · alles in Ordnung');
S['sensor.qa_pumpe_2_tage'].state = '6';
assert.equal(W._casoraAqDoseSum(W._casoraAqDoseInfo(c, S)).sub, 'Magnesium reicht noch 6 T.', 'under 7 days');

// 3) The line under a channel is short enough for the phone.
const line = W._casoraAqDoseSub(W._casoraAqDoseInfo(c, S)[0]);
assert.equal(line, 'heute 1,5 ml · noch 61 T.');
assert.ok(line.length <= 28);
assert.equal(W._casoraAqDoseSub({ today: null, days: null }), null);

// 4) Channels design A: a slider line per channel (axis x), solid fill in the channel colour, a knob at every value.
const UI = { esc: (t) => String(t).replace(/[&<>"']/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x])) };
const html = W._casoraAqChanList([{ name: 'Blau', color: '#4C6FD8', value: 100, svc: { domain: 'number' } },
  { name: 'UV', color: '#8E5CC7', value: 0, svc: { domain: 'number' } }], true, UI);
assert.equal((html.match(/role="slider"/g) || []).length, 2);
assert.equal((html.match(/data-casora-axis="x"/g) || []).length, 2);
assert.ok(!/linear-gradient/.test(html), 'no gradient pill any more');
assert.ok(/\.aq-cr \.hui-sl-fill::after\{content:""/.test(html), 'knob on the fill');
assert.ok(!/\.off\b/.test(html), 'no class to keep in step while dragging (0 % keeps its knob)');
assert.ok(/width:0%;background:#8E5CC7/.test(html), 'UV at 0 %');
assert.ok(/class="hui-sl-val">100 %/.test(html), 'value as the drag code writes it');
assert.ok(/width:0%/.test(W._casoraAqChanList([{ name: 'Rot', color: '#f00', value: 80, svc: {} }], false, UI)), 'lamp off: 0');

// 5) Studio: pump picker (casoraBasis), made-up entities.
globalThis.window = globalThis;
globalThis.document = { addEventListener: () => {}, querySelector: () => null, documentElement: {}, createElement: () => ({ style: {} }) };
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => 'soft' });
globalThis.addEventListener = () => {};
window.__casoraPanelInternals = { TILE_TYPES: [], clone: (x) => JSON.parse(JSON.stringify(x)), isHomeRoom: () => false };
new Function(read('custom_components/casora/panel/casora-panel-basis.js'))();
const B = window.casoraBasis;
const ent = {}, sts = {};
const e = (id, dev, tk) => { ent[id] = { entity_id: id, device_id: dev, translation_key: tk }; sts[id] = { entity_id: id, state: '1', attributes: {} }; };
[1, 2].forEach((n) => { const p = 'qa_dosierer_pumpe_' + n;
  e('button.' + p + '_dosieren', 'dev_p', 'dose_' + n); e('number.' + p + '_menge', 'dev_p', 'dose_volume_' + n);
  e('sensor.' + p + '_heute', 'dev_p', 'dosed_today_' + n); e('sensor.' + p + '_gesamt', 'dev_p', 'dosed_total_' + n);
  e('sensor.' + p + '_restmenge', 'dev_p', 'remaining_' + n); e('sensor.' + p + '_reicht_noch', 'dev_p', 'remaining_days_' + n);
  e('sensor.' + p + '_behaelter', 'dev_p', 'container_size_' + n); });
e('sensor.qa_becken_temperatur', 'dev_t', null);
e('button.qa_kaffee_entkalken', 'dev_k', 'descale');
const hass = { entities: ent, states: sts, devices: { dev_p: { name: 'QA Dosierer', area_id: 'kueche' }, dev_t: { name: 'QA Fühler', area_id: 'kueche' }, dev_k: { name: 'QA Kaffee' } } };
assert.deepEqual(B.dosingPumps(hass).map((p) => [p.id, p.channels]), [['dev_p', 2]], 'only devices with dose buttons');
const fill = B.dosingFill(hass, 'dev_p');
assert.deepEqual(fill.dosing_buttons, ['button.qa_dosierer_pumpe_1_dosieren', 'button.qa_dosierer_pumpe_2_dosieren']);
assert.equal(fill.dosing_volume['button.qa_dosierer_pumpe_2_dosieren'], 'number.qa_dosierer_pumpe_2_menge');
assert.equal(fill.dosing_today['button.qa_dosierer_pumpe_1_dosieren'], 'sensor.qa_dosierer_pumpe_1_heute');
assert.equal(fill.dosing_total['button.qa_dosierer_pumpe_1_dosieren'], 'sensor.qa_dosierer_pumpe_1_gesamt');
assert.equal(fill.dosing_remaining['button.qa_dosierer_pumpe_1_dosieren'], 'sensor.qa_dosierer_pumpe_1_restmenge');
assert.equal(fill.dosing_days_left['button.qa_dosierer_pumpe_1_dosieren'], 'sensor.qa_dosierer_pumpe_1_reicht_noch', 'remaining_days is days, not the container');
assert.equal(fill.dosing_capacity['button.qa_dosierer_pumpe_1_dosieren'], 'sensor.qa_dosierer_pumpe_1_behaelter');
assert.equal(B.dosingFill(hass, 'dev_k'), null);
assert.equal(B.dosingSuggest(hass, 'sensor.qa_becken_temperatur'), 'dev_p', 'pump in the tank sensor’s area');
// Two pumps, none in the tank's area: nothing is offered.
e('button.qa_zweite_pumpe_1_dosieren', 'dev_q', 'dose_1');
hass.devices.dev_q = { name: 'QA Zweite', area_id: 'keller' };
hass.devices.dev_p.area_id = 'flur';
assert.equal(B.dosingSuggest(hass, 'sensor.qa_becken_temperatur'), null);
console.log('ok aquarium_dose_v3');
