// Waste tile, popup head and bins list from one source (02.11.2026): the tile and the popup head said „Bio in 2 T.“
// while the bins list said „Restmüll · Heute“. The tile counted from the sensors' countdown (state / daysTo), the list
// from their date attributes; a countdown that already moved on (pickup day) or a stale one lost the pickup today.
// Expected: the pickup date wins (as in the list), the countdown only when a bin has no date from today on.
// Loads the real finder (00-finder.js) and the casora_trash tile and popup expressions. Made-up entities only.
//   LC_ALL=en_US.UTF-8 TZ=UTC node dev/unit/waste_date_first.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
globalThis.window = globalThis;
globalThis.document = { createElement: () => ({ style: {} }), querySelector: () => null };
globalThis.addEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
window.casoraStateFit = (t, _w, short) => short || t;
window.CASORA_SETTINGS = {};

new Function(read('custom_components/casora/scripts/local/00-finder.js'))();
const D = window.casoraDevice;
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const body = (s) => s.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.state_display));
const tileOf = (hass, vars) => tile(hass.states, null, {}, hass, vars || {}, null);
const popup = new Function('states', 'entity', 'user', 'hass', 'variables', 'html', body(T.casora_trash.tap_action.casora_popup.content));
function popOf(hass, vars) {
  const seen = { hero: null, rows: [] };
  window._casoraUI = { tokens: {}, esc: String, hero: (o) => { seen.hero = o; return ''; },
    group: (r, t) => { if (t === 'Tonnen') seen.rows = r.map((x) => [x.label, x.value]); return ''; } };
  try { popup(hass.states, null, {}, hass, vars || {}, null); } finally { delete window._casoraUI; }
  return seen;
}

const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// WCS-shaped bins (made-up place „Musterhausen“): state and daysTo = countdown, pickup dates as {date: type}.
const DEV = { id: 'dev_wcs_x', name: 'Waste Collection Schedule', name_by_user: null };
function bin(states, entities, id, name, count, dates, type) {
  const a = { friendly_name: 'Waste Collection Schedule ' + name, daysTo: count };
  dates.forEach((n) => { a[ymd(day(n))] = type; });
  states[id] = { entity_id: id, state: String(count), attributes: a };
  entities[id] = { entity_id: id, device_id: DEV.id, platform: 'waste_collection_schedule', name };
}
function house({ restCount = 9, restDates = [-14, 0, 14], bioCount = 2, bioDates = [-35] } = {}) {
  const states = {}, entities = {};
  // Residual waste: pickup today by date, the countdown says 9 (stale or already counting to the next one).
  bin(states, entities, 'sensor.musterhausen_restmuell', 'Restmüll', restCount, restDates, 'Restmuellbehaelter');
  // Organic: only a past date, countdown 2 – the countdown is all there is.
  bin(states, entities, 'sensor.musterhausen_bio', 'Bio', bioCount, bioDates, 'Biobehaelter');
  bin(states, entities, 'sensor.musterhausen_papier', 'Papier', 15, [15, 43], 'Papierbehaelter');
  return { states, entities, devices: { [DEV.id]: DEV } };
}

// ── A: pickup date today beats a countdown of 9 ───────────────────────────────
{
  const h = house();
  const W = D.waste(h, {});
  assert.equal(W.bins.find((b) => b.label === 'Restmüll').days, 0, 'Restmüll: date today wins over countdown 9');
  assert.equal(W.days, 0, 'next pickup today');
  assert.equal(W.next.label, 'Restmüll', 'next bin = Restmüll, not Bio');
  assert.equal(tileOf(h), 'Heute Restmüll', 'tile (and so the popup head) says Restmüll today');
  const pop = popOf(h);
  assert.equal(pop.hero.value, 'Restmüll', 'popup hero: same bin as the tile');
  // The bins list and the tile agree.
  const row = pop.rows.find((r) => r[0] === 'Restmüll');
  assert.ok(row && /heute/i.test(row[1]), 'bins list: Restmüll today (' + JSON.stringify(pop.rows) + ')');
  console.log('waste_date_first: date today beats the countdown ok');
}

// ── B: a countdown that undercounts the date loses as well (date in 5 days, countdown 1) ─────
{
  const h = house({ restCount: 1, restDates: [-9, 5, 19], bioCount: 3 });
  const W = D.waste(h, {});
  assert.equal(W.bins.find((b) => b.label === 'Restmüll').days, 5, 'date in 5 days, not countdown 1');
  assert.equal(tileOf(h), 'In 3 T. · Bio', 'next is Bio (countdown only, no future date)');
  console.log('waste_date_first: date beats a short countdown ok');
}

// ── C: no date from today on – the countdown stays (Bio above, sensors without dates) ────────
{
  const h = house({ restDates: [-14] });
  const W = D.waste(h, {});
  assert.equal(W.bins.find((b) => b.label === 'Restmüll').days, 9, 'only past dates: countdown');
  assert.equal(W.bins.find((b) => b.label === 'Bio').days, 2);
  assert.equal(tileOf(h), 'In 2 T. · Bio');
  const plain = { states: { 'sensor.tonne_x': { entity_id: 'sensor.tonne_x', state: '4', attributes: { friendly_name: 'Tonne X' } } },
    entities: {}, devices: {} };
  assert.equal(D.waste(plain, { trash_sensors: ['sensor.tonne_x'] }).days, 4, 'no dates at all: countdown');
  console.log('waste_date_first: countdown without dates ok');
}

// ── D: an overview sensor (dates of several types) keeps its countdown, as before ────────────
{
  const h = house();
  const id = 'sensor.musterhausen_abfuhr';
  h.states[id] = { entity_id: id, state: '9', attributes: { friendly_name: 'Waste Collection Schedule Abfuhr',
    [ymd(day(0))]: 'Restmuellbehaelter', [ymd(day(1))]: 'Papierbehaelter' } };
  h.entities[id] = { entity_id: id, device_id: DEV.id, platform: 'waste_collection_schedule', name: 'Abfuhr' };
  const W = D.waste(h, {});
  assert.equal(W.bins.find((b) => b.id === id).days, 9, 'overview: countdown, not the mixed dates');
  assert.equal(W.next.label, 'Restmüll');
  console.log('waste_date_first: overview sensor unchanged ok');
}
