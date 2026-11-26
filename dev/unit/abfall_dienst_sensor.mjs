// Prüfrunde u08-05: waste „Rausstellen“ with duty months and a „your turn“ sensor. The sensor decides (finder), so the
// popup's month bar fills the current month after the sensor and promises no „Nächster Dienst im …“ from the months –
// before, November was filled while the text beside it said „Nicht dran“ (sensor off). The Studio greys the month chips
// out while a sensor is picked. Without a sensor everything stays as it was.
//   node dev/unit/abfall_dienst_sensor.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#waste dashboards/casora/button_card_templates.json#casora_trash custom_components/casora/panel/casora-panel-personal.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, createElement: () => ({}) };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
const D = window.casoraDevice;
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const popup = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.tap_action.casora_popup.content));

const now = new Date().getMonth() + 1;
const other = (now % 12) + 1;
const BIN = 'sensor.qa_waste_residual', DUTY = 'binary_sensor.qa_waste_my_turn';
const hassWith = (dutyState) => {
  const states = { [BIN]: { entity_id: BIN, state: '3', attributes: { friendly_name: 'Restmüll', daysTo: 3 } } };
  if (dutyState) states[DUTY] = { entity_id: DUTY, state: dutyState, attributes: {} };
  return { states, entities: { [BIN]: { entity_id: BIN, platform: 'waste_collection_schedule' } }, devices: {} };
};
// Months: this one and the next; the sensor may say otherwise.
const vars = (sensor) => Object.assign({ trash_sensors: [BIN], trash_duty_months: [now, other] }, sensor ? { trash_duty_entity: DUTY } : {});
const dutyOf = (hass, v) => {
  window._casoraUI = { tokens: {}, esc: String, hero: () => '', group: () => '' };
  try { return popup(hass.states, null, {}, hass, v, null).cards[0].custom_fields.duty; } finally { delete window._casoraUI; }
};
const cells = (html) => [...html.matchAll(/class="tr-mc([^"]*)"/g)].map((m) => m[1]);

// Sensor off, this month is a duty month: not your turn – the bar agrees, no next month from the months.
{
  const h = hassWith('off');
  const W = D.waste(h, vars(true));
  assert.equal(W.duty, false, 'the sensor decides');
  assert.equal(W.dutyBySensor, true);
  const html = dutyOf(h, vars(true));
  const c = cells(html);
  assert.equal(c.length, 12);
  assert.ok(!/\bduty\b/.test(c[now - 1]) && /\bnow\b/.test(c[now - 1]), 'current month not filled: ' + c[now - 1]);
  assert.ok(/Nicht dran/.test(html));
  assert.ok(!/Nächster Dienst/.test(html), 'no next duty from the months');
}
// Sensor on in a month that is no duty month: your turn, current month filled.
{
  const h = hassWith('on');
  const v = Object.assign(vars(true), { trash_duty_months: [other] });
  const html = dutyOf(h, v);
  assert.ok(/\bduty\b/.test(cells(html)[now - 1]), 'current month filled after the sensor');
  assert.ok(/Diesen Monat bist du dran\./.test(html) && !/danach wieder/.test(html));
}
// Without a sensor: as before.
{
  const h = hassWith(null);
  const html = dutyOf(h, Object.assign(vars(false), { trash_duty_months: [other] }));
  assert.equal(D.waste(h, Object.assign(vars(false), { trash_duty_months: [other] })).dutyBySensor, false);
  assert.ok(!/\bduty\b/.test(cells(html)[now - 1]));
  assert.ok(/Nächster Dienst im/.test(html), 'months alone: the next duty month');
}

// Studio: the month chips are greyed out (disabled) while a sensor is picked, with a note why.
{
  const src = read('custom_components/casora/panel/casora-panel-personal.js');
  assert.ok(/b\.disabled = bySensor/.test(src), 'chips disabled with a sensor');
  assert.ok(/bySensor \? "The sensor decides" : "Months you put the bins out"/.test(src), 'note why');
  const de = JSON.parse(read('custom_components/casora/translations/panel/de.json')).exact;
  assert.ok(de['The sensor decides'], 'translated');
}
console.log('abfall_dienst_sensor: ok');
