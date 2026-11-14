// V10 (owner, 14.11.2026): the plant popup's ring stayed green while its head said „Steht zu nass“ – colour and word
// disagreed. A plant that reports a problem gets its ring in the warning colour; the word and the ring read the same
// source (plantIsBad), a healthy plant keeps the usual ring.
//   node dev/unit/plant_ring_warn.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const src = T.casora_popup_plant.tap_action.casora_popup.content;
const cut = (from, to) => {
  const a = src.indexOf(from);
  assert.ok(a > 0, 'found: ' + from);
  const b = src.indexOf(to, a);
  assert.ok(b > a, 'found: ' + to);
  return src.slice(a, b);
};
// The word: from the plant's state to the advice; the ring: the stage's ring option.
const word = cut('  const plantState = states[plant]?.state;', '  const cleanName = ');
const ringLine = src.split('\n').find((l) => /^\s*ring: /.test(l));
assert.ok(ringLine, 'the plant stage passes a ring');
const run = new Function('states', 'plant', 'plantAttrs', 'sensors', 'getSensorType', 'safeNum', '_sv', '_su',
  word + '\nreturn { advice, ring: ({ ' + ringLine.trim().replace(/,$/, '') + ' }).ring, C_STRUGGLING };');

const plant = 'plant.demo_pflanze';
const call = (state, attrs, sv = 55, su = '%') => run({ [plant]: { state, attributes: attrs } }, plant, attrs, [],
  () => null, () => null, sv, su);

// „Steht zu nass“: the ring in the warning colour (was the green ring).
const wet = call('problem', { problems: [{ sensor_type: 'moisture', status: 'high' }] });
assert.equal(wet.advice, 'Steht zu nass');
assert.ok(wet.ring && wet.ring.color === wet.C_STRUGGLING, 'problem: warning ring – got ' + JSON.stringify(wet.ring));
assert.deepEqual([wet.ring.min, wet.ring.max], [0, 100], 'same range as the stage\'s own ring');
// Too dry, too bright: any problem, as the word says.
for (const [t, s, w] of [['moisture', 'low', 'Braucht Wasser'], ['illuminance', 'high', 'Zu viel Sonne']]) {
  const r = call('problem', { problems: [{ sensor_type: t, status: s }] });
  assert.equal(r.advice, w);
  assert.ok(r.ring && r.ring.color === r.C_STRUGGLING, w + ': warning ring');
}
// Healthy: no own ring (the stage draws its usual one).
const ok = call('ok', { problems: [] });
assert.equal(ok.advice, 'Fühlt sich wohl');
assert.equal(ok.ring, undefined, 'healthy: the usual ring');
// A reading that is no percentage keeps the chart plate (no ring at all), also with a problem.
assert.equal(call('problem', { problems: [{ sensor_type: 'moisture', status: 'high' }] }, 1200, 'µS/cm').ring, undefined);

// The dial takes the ring's colour (casora-core.js, S6).
const core = fs.readFileSync(new URL('../../custom_components/casora/scripts/casora-core.js', import.meta.url), 'utf8');
assert.ok(core.includes('if (r6.color) ring.col = r6.color;'), 'S6 ring colour');
console.log('ok plant_ring_warn');
