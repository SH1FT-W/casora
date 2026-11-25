// @deckt: custom_components/casora/scripts/local/51-smart-heating.js custom_components/casora/scripts/local/00-finder.js#casoraShcFind
// Smart Heating Control community card (#240, 51-smart-heating.js + casoraShcFind in 00-finder.js) without HA:
// detection by the platform advanced_climate and the Decision sensor's translation_key, reading the Decision sensor's
// attributes (sensor.py DecisionSensor), the usual week (schedule.py profile_for, a slot running over midnight), the
// tile's words, the popup's parts and the service calls of the dial, the moons, the profile switch and the editor.
// Attributes shaped like Smart Heating Control 2.7.0.
//   node dev/unit/smart_heating.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const calls = [];
const asks = [];
let hass = null;
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' && hass ? { hass, dispatchEvent: () => {} } : null), addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Stand-in for casora-core's _casoraUI: rows, stages and quick items kept for the assertions.
let groups = [], stages = [], quicks = [], lines = [];
window._casoraUI = {
  esc, tokens: { font: 'x', ink: 'i', ink2: 'i2' }, soft: () => true,
  line: (main, rest) => { lines.push({ main, rest }); return '<div class="hui-line">' + esc(main) + (rest || []).map((r) => ' · ' + esc(r)).join('') + '</div>'; },
  group: (rows, label) => { groups.push({ label, rows }); return '<div class="g">' + esc(label || '') + rows.map((r) => '<div>' + esc(r.label) + '|' + esc(r.sub || '') + '|' + esc(r.value || '') + '</div>').join('') + '</div>'; },
  label: (t) => '<div class="lbl">' + esc(t) + '</div>',
  note: (t) => '<div class="note">' + esc(t) + '</div>',
  stage: (type, o) => { stages.push({ type, o }); if (typeof o.moons === 'function') o.moons(); return '<div class="stage"></div>'; },
  quick: (items, label) => { quicks.push({ items, label }); return ''; },
};
window._casoraSoftKit = { secCard: (watch, code) => ({ watch, code }), layout: (o) => ({ custom_fields: o.fields, o }) };
window.casoraAsk = (o) => { asks.push(o); return Promise.resolve(true); };
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('00-finder.js');
load('51-smart-heating.js');
const F = window.casoraShcFind, H = window._casoraShc;
assert.ok(F && H, 'modules loaded');

const ID = 'sensor.test_room_decision';
const SEL = 'select.test_room_schedule_profile';
const MODE = 'select.test_house_mode';
const SCHEDULE = {
  workday: [{ time: '00:00', preset: 'sleep' }, { time: '06:00', preset: 'home' }, { time: '22:00', preset: 'sleep' }],
  weekend: [{ time: '08:00', preset: 'comfort' }, { time: '23:00', preset: 'eco' }],
  late: [{ time: '00:00', preset: 'sleep' }, { time: '09:00', preset: 'home' }],
};
const DAYS = { workday: { days: 'workday', enabled: true }, weekend: { days: 'weekend', enabled: true }, late: { days: ['wed', 'fri'], enabled: false } };
const attrs = (over) => Object.assign({
  room_id: 'sub1', entry_id: 'e1', room_name: 'Test Room', house_name: 'Test House', reason: 'Schedule', reason_key: 'schedule',
  preset: 'home', temperature_unit: '°C', target_temperature: 21, current_temperature: 20.4, window_open: false, override: null,
  profile: 'workday', next_change: null, next_preset: 'sleep', schedule: JSON.parse(JSON.stringify(SCHEDULE)), profile_days: JSON.parse(JSON.stringify(DAYS)),
  schedule_error: null, schedule_editable: true, presets: ['home', 'sleep', 'eco', 'away', 'comfort', 'activity'],
  preset_names: { home: 'home', sleep: 'sleep', eco: 'eco', away: 'away', comfort: 'comfort', activity: 'activity' },
  levels: { home: 21, sleep: 18, eco: 17, away: 12, comfort: 22, activity: 20 }, min_temperature: 5, max_temperature: 30,
  heat_demand: true, heating: true, day_boundary: 0,
  entities: { decision: ID, schedule_profile: SEL, room_temperature: 'sensor.test_room_room_temperature', clear_override: 'button.test_room_clear_override' },
  house_entities: { mode: MODE },
}, over || {});
const states = {}, entities = {};
const add = (id, state, a, reg) => {
  states[id] = { entity_id: id, state, attributes: a || {} };
  entities[id] = Object.assign({ entity_id: id, platform: 'other' }, reg || {});
};
const fresh = () => { hass = Object.assign({}, hass, { entities: Object.assign({}, entities), states: Object.assign({}, states) }); };
hass = { states, entities, devices: {}, callService: (d, s, data, target) => { calls.push({ d, s, data, target }); return Promise.resolve(); } };

// ── Detection: platform advanced_climate + translation_key decision ──
assert.equal(F.present(hass), false, 'nothing → not present');
add('sensor.fake_decision', 'schedule', {}, { platform: 'other', translation_key: 'decision' });
fresh();
assert.equal(F.present(hass), false, 'same key on another platform is not Smart Heating Control');
add(ID, 'schedule', attrs(), { platform: 'advanced_climate', translation_key: 'decision' });
add('sensor.test_room_target_temperature', '21', {}, { platform: 'advanced_climate', translation_key: 'target_temperature' });
add(SEL, 'workday', { options: ['workday', 'weekend', 'late'] }, { platform: 'advanced_climate', translation_key: 'schedule_profile' });
add(MODE, 'auto', { options: ['auto', 'away', 'vacation', 'off', 'summer'] }, { platform: 'advanced_climate', translation_key: 'mode' });
add('sensor.test_room_room_temperature', '20.4', { unit_of_measurement: '°C' }, { platform: 'advanced_climate', translation_key: 'room_temperature' });
fresh();
assert.equal(F.present(hass), true);
assert.deepEqual(F.rooms(hass), [ID], 'only the Decision sensor is a room');
assert.equal(F.isRoom(hass, ID), true);
assert.equal(F.isRoom(hass, 'sensor.test_room_target_temperature'), false);
assert.equal(F.SOURCE.domain, 'advanced_climate');

// ── The model ──
const m = H.model(hass.states[ID]);
assert.equal(m.ok, true);
assert.equal(m.target, 21);
assert.equal(m.cur, 20.4);
assert.equal(m.heating, true);
assert.equal(m.editable, true);
assert.deepEqual(m.profiles, ['workday', 'weekend', 'late']);
assert.equal(m.ents.schedule_profile, SEL);
assert.equal(m.houseEnts.mode, MODE);
assert.equal(H.model(null).ok, false);
assert.equal(H.model({ entity_id: ID, state: 'unavailable', attributes: {} }).dead, true);

// ── Words ──
assert.equal(H.levelName(m, 'home'), 'Zuhause');
assert.equal(H.levelName(H.model({ entity_id: ID, state: 'schedule', attributes: attrs({ preset_names: { home: 'Tagsüber' } }) }), 'home'), 'Tagsüber', 'own level names win');
assert.equal(H.daysWord('workday'), 'Werktage');
assert.equal(H.daysWord(['fri', 'wed']), 'Mi, Fr', 'weekdays in week order');
assert.equal(H.ruleWord('window_open'), 'Fenster offen');
const now = new Date(2026, 10, 25, 14, 0);   // Wednesday
assert.equal(H.when(new Date(2026, 10, 25, 22, 0).toISOString(), now), 'ab 22:00');
assert.equal(H.when(new Date(2026, 10, 26, 6, 0).toISOString(), now), 'morgen ab 06:00');
assert.equal(H.when(new Date(2026, 10, 30, 6, 0).toISOString(), now), 'am Montag ab 06:00');
assert.equal(H.until(new Date(2026, 10, 25, 16, 30).toISOString(), now), 'bis 16:30');
assert.equal(H.until(new Date(2026, 10, 26, 6, 0).toISOString(), now), 'bis morgen 06:00');
assert.equal(H.until(new Date(2026, 10, 28, 6, 0).toISOString(), now), 'bis Samstag 06:00');
assert.equal(H.next(H.model({ entity_id: ID, state: 'schedule', attributes: attrs({ next_change: new Date(2026, 10, 25, 22, 0).toISOString() }) }), now), 'Schlafen ab 22:00');

// ── Tile ──
assert.equal(H.tileState(hass.states[ID]), '20,4° · Heizt auf 21°');
assert.equal(H.active(hass.states[ID]), true);
const st2 = (state, over) => ({ entity_id: ID, state, attributes: attrs(over) });
assert.equal(H.tileState(st2('schedule', { heating: false })), '20,4° · Ziel 21°');
assert.equal(H.active(st2('schedule', { heating: false })), false);
assert.equal(H.tileState(st2('window_open', { heating: false, target_temperature: 5 })), '20,4° · Fenster offen', 'a holding rule names itself');
assert.equal(H.tileState(st2('summer', { heating: false })), '20,4° · Sommer');
assert.equal(H.tileState({ entity_id: ID, state: 'unavailable', attributes: {} }), 'Nicht verfügbar');
assert.equal(H.tileState(st2('schedule', { current_temperature: null, heating: false })), 'Ziel 21°', 'no room temperature: only the target');
assert.ok(!/undefined|NaN|null/.test(H.tileState(st2('unknown', { current_temperature: null }))));

// ── The usual week (schedule.py profile_for) ──
assert.equal(H.profileFor(DAYS, 0), 'workday');
assert.equal(H.profileFor(DAYS, 5), 'weekend');
assert.equal(H.profileFor({ late: { days: ['wed'], enabled: true }, workday: { days: 'workday', enabled: true } }, 2), 'late', 'a weekday profile wins');
assert.equal(H.profileFor({ any: { days: 'all', enabled: true } }, 6), 'any');
assert.equal(H.profileFor({ workday: { days: 'workday', enabled: true } }, 6), null, 'no active profile → none (frost protection)');
// Saturday starts with the last slot of Friday (sleep from 22:00) until the weekend's first slot at 08:00.
const sat = H.daySegments(m, 5, 2);
assert.deepEqual(sat.map((s) => [s.from, s.to, s.preset, s.carried]), [[0, 480, 'sleep', true], [480, 1380, 'comfort', false], [1380, 1440, 'eco', false]]);
// Monday starts at 00:00 with its own slot; before it would be Sunday's eco.
assert.deepEqual(H.daySegments(m, 0, 2).map((s) => s.preset), ['sleep', 'home', 'sleep']);
// Today: the profile the room uses (attribute profile), also when the usual week says otherwise (holiday).
const holiday = H.model(st2('schedule', { profile: 'weekend' }));
assert.equal(H.dayProfile(holiday, 2, 2), 'weekend');
assert.equal(H.dayProfile(holiday, 3, 2), 'workday');
const none = H.model(st2('frost_protection', { profile_days: { workday: { days: 'workday', enabled: true } }, profile: null }));
assert.deepEqual(H.daySegments(none, 6, 2).map((s) => s.preset), ['frost']);

// ── Editing a profile's slots (pure) ──
assert.deepEqual(H.change(SCHEDULE.workday, 1, { time: '06:30', preset: 'comfort' }).slots,
  [{ time: '00:00', preset: 'sleep' }, { time: '06:30', preset: 'comfort' }, { time: '22:00', preset: 'sleep' }]);
assert.deepEqual(H.change(SCHEDULE.workday, -1, { time: '12:00', preset: 'eco' }).slots.map((x) => x.time), ['00:00', '06:00', '12:00', '22:00'], 'sorted');
assert.deepEqual(H.change(SCHEDULE.workday, 2, null).slots.map((x) => x.time), ['00:00', '06:00']);
assert.equal(H.change(SCHEDULE.workday, 1, { time: '22:00' }).error, 'twice');
assert.equal(H.change([{ time: '00:00', preset: 'home' }], 0, null).error, 'empty', 'a profile keeps one slot');
assert.equal(H.change(SCHEDULE.workday, 1, { time: '25:00' }).error, 'time');
assert.deepEqual(H.levelOrder(m), ['away', 'eco', 'sleep', 'activity', 'home', 'comfort']);

// ── Service specs ──
assert.deepEqual(H.svc.override(ID, 21.5), { domain: 'advanced_climate', service: 'set_override', data: { entity_id: ID, temperature: 21.5 }, target: { entity_id: ID } });
assert.deepEqual(H.svc.level(ID, 'eco'), { domain: 'advanced_climate', service: 'set_override', data: { entity_id: ID, preset: 'eco' } });
assert.deepEqual(H.svc.clear(ID), { domain: 'advanced_climate', service: 'clear_override', data: { entity_id: ID } });
assert.deepEqual(H.svc.profile(SEL, 'late'), { domain: 'select', service: 'select_option', data: { option: 'late' }, target: { entity_id: SEL } });

// ── Popup ──
const pop = H.popup(hass.states[ID], hass);
assert.deepEqual(Object.keys(pop.custom_fields).sort(), ['chart', 'hero', 'rows', 'stage'], 'v3 parts and the room temperature as Verlauf');
assert.equal(pop.o.stage, 'stage');
assert.deepEqual(pop.o.right, ['rows']);
assert.equal(pop.custom_fields.chart.card.series[0].entity, 'sensor.test_room_room_temperature');
assert.ok(pop.custom_fields.hero.card.watch.includes(ID) && pop.custom_fields.hero.card.watch.includes(MODE) && pop.custom_fields.hero.card.watch.includes(SEL));
const sec = (part, id) => { groups = []; stages = []; quicks = []; lines = []; return H.sec(part, id || ID, hass.states, hass, null); };

sec('hero');
assert.equal(lines[0].main, 'Heizt');
sec('stage');
const S0 = stages[0].o;
assert.equal(S0.value, 21);
assert.equal(S0.foot, 'Jetzt 20,4 °C');
assert.deepEqual(S0.plus.svc, H.svc.override(ID, 21.5), '+ sets a manual change half a degree up');
assert.deepEqual(S0.minus.svc, H.svc.override(ID, 20.5));
assert.equal(S0.min, 5);
assert.equal(S0.max, 30);
const moons = quicks[0].items;
assert.equal(moons[0].text, 'Automatik');
assert.equal(moons[0].active, true, 'no manual change → Automatik');
assert.deepEqual(moons[0].svc, H.svc.clear(ID));
assert.deepEqual(moons.slice(1).map((x) => x.text), ['Zuhause', 'Eco', 'Komfort', 'Schlafen', 'Abwesend', 'Aktiv']);
assert.ok(moons.every((x) => /^mdi:/.test(x.icon)), 'MDI symbols');

sec('rows');
let rows = groups[0].rows;
const sched = rows.find((r) => r.label === 'Zeitplan');
assert.ok(sched && sched.page === 'shc-plan|' + ID, 'row „Zeitplan ›“ opens the week');
assert.ok(/workday/.test(sched.sub));
assert.ok(rows.find((r) => r.label === 'Modus' && r.value === 'Automatik' && r.entity === MODE), 'the house mode');
assert.ok(rows.find((r) => r.label === 'Entscheidung' && r.value === 'Zeitplan'), 'the decision');
assert.ok(!rows.some((r) => /^Manuell/.test(r.label)), 'no manual change → no row');

// A manual change: its row with „Automatik“, the moon of its level, the head names its end.
const until = new Date(Date.now() + 2 * 3600 * 1000);
states[ID] = { entity_id: ID, state: 'manual_override', attributes: attrs({ heating: false, preset: 'eco', target_temperature: 17,
  override: { origin: 'card', until: until.toISOString(), preset: 'eco', temperature: 17, applied: true, interrupted: false } }) };
fresh();
sec('rows');
rows = groups[0].rows;
const man = rows.find((r) => /^Manuell/.test(r.label));
assert.ok(man && man.label === 'Manuell · Eco' && man.action === 'Automatik', JSON.stringify(man));
assert.deepEqual(man.svc, H.svc.clear(ID));
assert.ok(/^bis /.test(man.sub), man.sub);
sec('stage');
assert.equal(quicks[0].items[0].active, false);
assert.equal(quicks[0].items.find((x) => x.text === 'Eco').active, true);
sec('hero');
assert.equal(lines[0].main, 'Manuell');
assert.ok(/^bis \d\d:\d\d$|^bis morgen /.test(lines[0].rest[0]), lines[0].rest);

// Mode off (above a manual change): the dial greyed, no − / +.
states[ID] = { entity_id: ID, state: 'mode_off', attributes: attrs({ heating: false, target_temperature: 5 }) };
fresh();
sec('stage');
assert.equal(stages[0].o.plus, undefined);
assert.equal(stages[0].o.state, 'off');
assert.equal(H.tileState(states[ID]), '20,4° · Aus');

// Unavailable: no − / +, no rows, words instead of undefined.
states[ID] = { entity_id: ID, state: 'unavailable', attributes: {} };
fresh();
sec('stage');
assert.equal(stages[0].o.plus, undefined);
assert.equal(stages[0].o.state, 'na');
assert.equal(sec('rows'), '');
sec('hero');
assert.equal(lines[0].main, 'Nicht verfügbar');

// ── The week page: profiles, the week, a day's slots, editing ──
states[ID] = { entity_id: ID, state: 'schedule', attributes: attrs() };
fresh();
const tap = (mid) => window._casoraMiHooks.some((fn) => fn(mid));
const today = (new Date().getDay() + 6) % 7;
let html = sec('plan');
assert.ok(/class="lbl">Woche</.test(html), 'the week');
assert.equal((html.match(/data-casora-mi="shc-day:/g) || []).length, 7);
const profs = groups.find((g) => g.label === 'Tagesprofile');
assert.ok(profs, 'profiles section');
const late = profs.rows.find((r) => r.label === 'late');
assert.equal(late.sub, 'Mi, Fr');
assert.equal(late.action, 'Aktivieren');
assert.deepEqual(late.svc, H.svc.profile(SEL, 'late'), 'switching the profile = the room\'s profile select');
assert.equal(profs.rows.find((r) => r.label === 'workday').value, 'Aktiv');
// Monday's slots: editable rows of the profile, „Zeitfenster hinzufügen“.
assert.ok(tap('shc-day:' + ID + '|0'));
html = sec('plan');
let day = groups.find((g) => /workday/.test(g.label || '') && g.label !== 'Tagesprofile');
assert.ok(day, groups.map((g) => g.label).join(','));
assert.deepEqual(day.rows.filter((r) => r.entity && r.entity.indexOf('shc-edit:') === 0).map((r) => r.entity),
  ['shc-edit:' + ID + '|workday|0', 'shc-edit:' + ID + '|workday|1', 'shc-edit:' + ID + '|workday|2']);
assert.equal(day.rows[1].label, '06:00–22:00');
assert.equal(day.rows[1].value, '21°');
assert.ok(day.rows.some((r) => r.entity === 'shc-add:' + ID + '|workday'));
// Edit the second slot: 15 minutes earlier, one level warmer, save → set_schedule with every profile.
tap('shc-edit:' + ID + '|workday|1');
tap('shc-step:' + ID + '|start|-');
tap('shc-step:' + ID + '|level|+');
html = sec('plan');
assert.ok(/Zeitfenster bearbeiten · workday/.test(html), 'the editor');
assert.ok(/05:45/.test(html) && /Komfort/.test(html), 'start and level in the editor');
calls.length = 0;
tap('shc-save:' + ID);
await new Promise((r) => r());
assert.equal(calls.length, 1);
assert.equal(calls[0].d, 'advanced_climate');
assert.equal(calls[0].s, 'set_schedule');
assert.equal(calls[0].data.entity_id, ID);
assert.equal(calls[0].data.profile_days, undefined, 'the profiles keep their days');
assert.deepEqual(calls[0].data.profiles.workday, [{ time: '00:00', preset: 'sleep' }, { time: '05:45', preset: 'comfort' }, { time: '22:00', preset: 'sleep' }]);
assert.deepEqual(calls[0].data.profiles.weekend, SCHEDULE.weekend, 'the other profiles unchanged');
assert.deepEqual(calls[0].data.profiles.late, SCHEDULE.late);
// Add a slot and delete one (with a question).
await Promise.resolve();
tap('shc-add:' + ID + '|weekend');
calls.length = 0;
tap('shc-save:' + ID);
await Promise.resolve();
assert.deepEqual(calls[0].data.profiles.weekend, [{ time: '08:00', preset: 'comfort' }, { time: '23:00', preset: 'eco' }, { time: '23:45', preset: 'home' }],
  'a new slot after the last one (home)');
await Promise.resolve();
tap('shc-edit:' + ID + '|workday|2');
calls.length = 0; asks.length = 0;
tap('shc-del:' + ID);
await new Promise((r) => r());
await Promise.resolve();
assert.equal(asks.length, 1, 'delete asks first');
assert.deepEqual(calls[0].data.profiles.workday.map((x) => x.time), ['00:00', '06:00']);
// Review round 1: the slot moved meanwhile (another device deleted 06:00) → nothing is sent, the editor closes.
states[ID] = { entity_id: ID, state: 'schedule', attributes: attrs() };
fresh();
tap('shc-edit:' + ID + '|workday|2');
states[ID] = { entity_id: ID, state: 'schedule', attributes: attrs({ schedule: Object.assign({}, SCHEDULE, { workday: [SCHEDULE.workday[0], SCHEDULE.workday[2]] }) }) };
fresh();
calls.length = 0;
tap('shc-save:' + ID);
await Promise.resolve();
assert.equal(calls.length, 0, 'a stale index never writes another slot');
assert.equal(H._ui(ID).edit, null);
// Review round 1: a schedule the integration could not read shows its default – view only, no profile switch.
states[ID] = { entity_id: ID, state: 'schedule', attributes: attrs({ schedule_error: "Line 1: unknown preset 'spar'" }) };
fresh();
assert.equal(H.model(states[ID]).editable, false);
html = sec('plan');
assert.ok(!/shc-edit:|shc-add:/.test(JSON.stringify(groups)), 'schedule error: view only');
assert.ok(!groups.find((g) => g.label === 'Tagesprofile').rows.some((r) => r.svc), 'schedule error: no profile switch');
assert.ok(/einen Fehler/.test(html) && !/Zeitplan-Helfer/.test(html));
calls.length = 0;
tap('shc-edit:' + ID + '|workday|1');
tap('shc-save:' + ID);
assert.equal(calls.length, 0, 'schedule error: nothing saved');
// Not editable (Schedule helper): no edit rows, no add, a note.
states[ID] = { entity_id: ID, state: 'schedule', attributes: attrs({ schedule_editable: false }) };
fresh();
html = sec('plan');
assert.ok(!/shc-edit:|shc-add:/.test(JSON.stringify(groups)), 'helper schedule: view only');
assert.ok(/Zeitplan-Helfer/.test(html));
assert.ok(!groups.find((g) => g.label === 'Tagesprofile').rows.some((r) => r.svc), 'helper schedule: no profile switch');
// Today's row is lit.
uiReset();
function uiReset() { const u = H._ui(ID); u.day = null; u.edit = null; u.busy = false; }
states[ID] = { entity_id: ID, state: 'schedule', attributes: attrs() };
fresh();
sec('plan');
day = groups[groups.length - 1];
assert.ok(day.label.indexOf('Heute') === 0, day.label);
assert.equal(day.rows.filter((r) => r.active).length, 1, 'the slot running now is lit');
assert.equal(today >= 0, true);

// No emojis in the module (popup-richtlinien-v3 §4.8: MDI only).
const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/51-smart-heating.js', import.meta.url), 'utf8');
assert.ok(!/\p{Extended_Pictographic}/u.test(src), 'no emoji');
console.log('smart_heating: ok');
