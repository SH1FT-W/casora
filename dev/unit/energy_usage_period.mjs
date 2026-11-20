// @deckt: custom_components/casora/scripts/local/48-energie-verlauf.js#casoraUsagePeriod custom_components/casora/scripts/casora-core.js#paintLive,group,softGroup custom_components/casora/scripts/local/05-weich-mehr.js#statusWords,usageToday custom_components/casora/scripts/local/20-energie-fokus.js#rows,useKwh dashboards/casora/button_card_templates.json#casora_popup_energy
// #223: the house's energy popup showed „Heute 528 kWh“ and „Diesen Monat 528 kWh“ with a Shelly 3-phase meter in
// both fields – the meter's running total (state_class total_increasing, never resets), while the day was 5,9 kWh.
// A running meter now shows its change today / this month from HA's long-term statistics (period day, change in kWh),
// the placeholder while they load (never the reading), and the rows follow once they are there (live marker). A
// counter that resets every day keeps showing its state, without a request.
//   node dev/unit/energy_usage_period.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';
const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
globalThis.window = globalThis;
const NOW = new Date(2026, 10, 20, 15, 0).getTime(); // Friday 20 Nov 2026, 15:00
Date.now = () => NOW;
new Function(read('custom_components/casora/scripts/local/48-energie-verlauf.js'))();
const tick = () => new Promise((r) => setTimeout(r, 0));

// Day rows of the statistics: 12 kWh a day from 31 Oct, today 5,9 kWh so far; the meter's reading ends at 528 kWh.
const rows = [];
{
  let state = 528 - 5.9 - 12 * 20;
  for (let d = 31; d >= 0; d--) {
    const start = new Date(2026, 10, 20 - d).getTime();
    if (start < new Date(2026, 9, 31).getTime()) continue;
    const change = d === 0 ? 5.9 : 12;
    state += change;
    rows.push({ start, end: start + 864e5, state: Math.round(state * 10) / 10, change });
  }
}
const MONTH = 19 * 12 + 5.9; // 1–19 Nov and today
assert.equal(rows[rows.length - 1].state, 528);

const shelly = { state: '528.0', attributes: { state_class: 'total_increasing', device_class: 'energy', unit_of_measurement: 'kWh', friendly_name: 'Shelly 3EM Total' } };
const calls = [];
const mkHass = (states, answer) => ({
  states, locale: { language: 'de' },
  callWS: (msg) => { calls.push(msg); return Promise.resolve(answer(msg)); },
});

// ── The energy popup's rows „Heute“ / „Diesen Monat“ (casora_popup_energy, Standard and Casora look) ────────────
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const useRows = (content, states, hass, v) => {
  const a = content.indexOf('  const usage = [];'), b = content.indexOf('  /* This had no heading', a);
  const f0 = content.indexOf('const fmtN'), f1 = content.indexOf('const _m2', f0);
  assert.ok(a > 0 && b > a && f0 > 0 && f1 > f0, 'addUse found');
  const code = "const _LANG = 'de';\n" + content.slice(f0, f1)
    + 'const safeNum = (id) => { if (!id) return null; const s = states[id] && states[id].state; const n = parseFloat(s); return isNaN(n) ? null : n; };\n'
    + "const money = (x) => x == null ? null : x.toFixed(2).replace('.', ',') + ' €';\n"
    + 'const todayId = variables.entity_usage_today, monthId = variables.entity_usage_month;\n'
    + 'const costTodayId = variables.entity_cost_today, costMonthId = variables.entity_cost_month;\n'
    + content.slice(a, b) + '\nreturn usage;';
  return new Function('states', 'hass', 'variables', code)(states, hass, v);
};
for (const look of ['tap_action', 'hold_action']) {
  // Each look its own sensor: the statistics are cached per sensor.
  const id = 'sensor.shelly_total_' + look;
  const content = T.casora_popup_energy[look].casora_popup.content;
  calls.length = 0;
  const states = { [id]: shelly };
  const hass = mkHass(states, (msg) => ({ [msg.statistic_ids[0]]: rows }));
  const v = { entity_usage_today: id, entity_usage_month: id };
  // Opening: the statistics are on their way – the placeholder, never the meter's 528 kWh.
  let u = useRows(content, states, hass, v);
  assert.deepEqual(u.map((r) => r.label), ['Heute', 'Diesen Monat'], look);
  assert.ok(u.every((r) => !/528/.test(r.value)), look + ': no running total in the rows: ' + u.map((r) => r.value).join(' / '));
  assert.deepEqual(u.map((r) => r.value), ['—', '—'], look + ': placeholder while loading');
  assert.deepEqual(u.map((r) => r.livePeriod && r.livePeriod.per), ['day', 'month'], look + ': the rows follow live');
  await tick();
  // One request (both rows share it): period day, change and state in kWh, from this month / the last 7 days on.
  assert.ok(calls.length >= 1 && calls.length <= 2 && calls.every((c) => c.type === 'recorder/statistics_during_period'
    && c.period === 'day' && c.types.includes('change') && c.units.energy === 'kWh'), look + ': ' + JSON.stringify(calls));
  u = useRows(content, states, hass, v);
  assert.deepEqual(u.map((r) => r.value), ['5,9 kWh', '234 kWh'], look + ': today 5,9 kWh, the month 233,9 kWh');
  // The live marker writes the same.
  assert.equal(window.casoraUsagePeriod.text(hass, id, 'day', 'n'), '5,9 kWh');
  assert.equal(window.casoraUsagePeriod.text(hass, id, 'month', 'n'), '234 kWh');
  assert.equal(window.casoraUsagePeriod.value(hass, id, 'month'), MONTH);
}

// A daily counter (utility_meter: total_increasing with last_reset) and one without state_class: their state as
// before, no request.
{
  calls.length = 0;
  const states = {
    'sensor.day_um': { state: '3.2', attributes: { state_class: 'total_increasing', last_reset: '2026-11-20T00:00:00+01:00', unit_of_measurement: 'kWh' } },
    'sensor.month_tpl': { state: '41.5', attributes: { unit_of_measurement: 'kWh' } },
  };
  const hass = mkHass(states, () => ({}));
  const content = T.casora_popup_energy.tap_action.casora_popup.content;
  const u = useRows(content, states, hass, { entity_usage_today: 'sensor.day_um', entity_usage_month: 'sensor.month_tpl' });
  assert.deepEqual(u.map((r) => r.value), ['3,2 kWh', '41,5 kWh'], 'resetting counters show their state');
  assert.ok(u.every((r) => !r.livePeriod), 'no live marker');
  assert.equal(calls.length, 0, 'nothing fetched for a counter that resets');
}
// A daily counter without last_reset (total_increasing, e.g. an inverter's „today“): the statistics show it falls back
// at midnight – its state, as before.
{
  const daily = [];
  for (let d = 6; d >= 0; d--) {
    const start = new Date(2026, 10, 20 - d).getTime();
    daily.push({ start, state: d === 0 ? 3.2 : 9 + (d % 3), change: d === 0 ? 3.2 : 9 + (d % 3) });
  }
  const states = { 'sensor.today': { state: '3.2', attributes: { state_class: 'total_increasing', unit_of_measurement: 'kWh' } } };
  const hass = mkHass(states, () => ({ 'sensor.today': daily }));
  assert.equal(window.casoraUsagePeriod.value(hass, 'sensor.today', 'day'), 'wait');
  await tick();
  assert.equal(window.casoraUsagePeriod.value(hass, 'sensor.today', 'day'), 3.2, 'a daily counter keeps its state');
  assert.equal(window.casoraUsagePeriod.mode(daily), 'daily');
}
// No statistics at all (recorder excludes it): the state as before. Wh meter: the change in the sensor's unit.
{
  const states = { 'sensor.nostat': { state: '7.5', attributes: { state_class: 'total_increasing', unit_of_measurement: 'kWh' } },
    'sensor.wh': { state: '528000', attributes: { state_class: 'total', unit_of_measurement: 'Wh' } } };
  const hass = mkHass(states, (msg) => (msg.statistic_ids[0] === 'sensor.wh' ? { 'sensor.wh': rows } : {}));
  window.casoraUsagePeriod.value(hass, 'sensor.nostat', 'day'); window.casoraUsagePeriod.value(hass, 'sensor.wh', 'day');
  await tick();
  assert.equal(window.casoraUsagePeriod.value(hass, 'sensor.nostat', 'day'), 7.5);
  assert.equal(Math.round(window.casoraUsagePeriod.value(hass, 'sensor.wh', 'day')), 5900, 'Wh meter: 5900 Wh');
  assert.equal(window.casoraUsagePeriod.text(hass, 'sensor.wh', 'day', 'n'), '5,9 kWh');
}
// Pure parts: kind, mode, sums (today = the row holding now, also when HA's midnight is an hour off the browser's).
{
  const UP = window.casoraUsagePeriod;
  assert.equal(UP.kind({ a: shelly }, 'a'), 'check');
  assert.equal(UP.kind({ a: { state: '1', attributes: { state_class: 'measurement', unit_of_measurement: 'kWh' } } }, 'a'), 'state');
  assert.equal(UP.kind({ a: { state: '1', attributes: { state_class: 'total', unit_of_measurement: '€' } } }, 'a'), 'state');
  assert.equal(UP.mode(rows), 'total');
  assert.deepEqual(UP.sums(rows, NOW), { day: 5.9, month: MONTH });
  const shifted = rows.map((r) => Object.assign({}, r, { start: r.start - 36e5 }));
  const s2 = UP.sums(shifted, NOW);
  assert.equal(s2.day, 5.9); assert.equal(s2.month, MONTH);
}

// ── The live marker: casora-core's rows carry it, paintLive writes the loaded value ─────────────────────────────
{
  const core = read('custom_components/casora/scripts/casora-core.js');
  assert.equal((core.match(/data-casora-live="period"/g) || []).length, 2, 'both row builders (group, softGroup) mark the value');
  const a = core.indexOf('  var casoraLiveNum = function'), b = core.indexOf('  // Live-bridge hosts', a);
  assert.ok(a > 0 && b > a, 'paintLive found');
  const paint = new Function(core.slice(a, b) + '\nreturn paintLive;')();
  const states = { 'sensor.shelly_total': shelly };
  const hass = mkHass(states, (msg) => ({ [msg.statistic_ids[0]]: rows }));
  window.casoraUsagePeriod.value(hass, 'sensor.shelly_total', 'day');
  await tick();
  const el = { dataset: { casoraLive: 'period', casoraEnt: 'sensor.shelly_total', casoraPer: 'month', casoraFmt: 'n', casoraSuffix: '  ·  12,00 €' }, textContent: '—  ·  12,00 €' };
  paint([el], hass);
  assert.equal(el.textContent, '234 kWh  ·  12,00 €', 'cached statistics: the month written into the row');
}

// ── Casora look: the status line in the head („Heute … kWh“) ───────────────────────────────────────────────────
{
  new Function(read('custom_components/casora/scripts/local/05-weich-mehr.js'))();
  const E = window._casoraSoftEnergy;
  const states = { 'sensor.home': { state: '400', attributes: { unit_of_measurement: 'W' } }, 'sensor.shelly_total': shelly };
  const hass = mkHass(states, (msg) => ({ [msg.statistic_ids[0]]: rows }));
  assert.equal(E.statusWords({ home: 'sensor.home', today: 'sensor.shelly_total' }, states, hass).main, 'Heute 5,9 kWh');
  const fresh = { 'sensor.home': states['sensor.home'], 'sensor.other_total': Object.assign({}, shelly) };
  const h2 = mkHass(fresh, (msg) => ({ [msg.statistic_ids[0]]: rows }));
  assert.equal(E.statusWords({ home: 'sensor.home', today: 'sensor.other_total' }, fresh, h2).main, 'Verbraucht Strom', 'while loading: no reading');
  await tick();
}

// ── Energy focus page „Haus“: rows „Heute“ / „Diesen Monat“ ──────────────────────────────────────────────────────
{
  const src = read('custom_components/casora/scripts/local/20-energie-fokus.js');
  const a = src.indexOf('  function rows(UI, C, states, hass) {'), b = src.indexOf('\n  }\n', a);
  const h0 = src.indexOf('  var num = function'), h1 = src.indexOf('  var key = function', h0);
  assert.ok(a > 0 && b > a && h0 > 0 && h1 > h0, 'rows found');
  const groups = [];
  const UI = { group: (list, label) => { groups.push({ list, label }); return 'G'; } };
  const rowsFn = new Function('COL', 'pvSeen', src.slice(h0, h1) + src.slice(a, b + 4) + '\nreturn rows;')({}, () => []);
  const states = { 'sensor.shelly_total': shelly };
  const hass = mkHass(states, (msg) => ({ [msg.statistic_ids[0]]: rows }));
  rowsFn(UI, { focus: 'home', today: 'sensor.shelly_total', month: 'sensor.shelly_total' }, states, hass);
  const g = groups.pop();
  assert.deepEqual(g.list.map((r) => r.value), ['5,9 kWh', '234 kWh'], 'focus page: the statistics, not 528 kWh');
  assert.deepEqual(g.list.map((r) => r.livePeriod && r.livePeriod.fmt), ['wh', 'wh']);
}

console.log('energy_usage_period: ok');
