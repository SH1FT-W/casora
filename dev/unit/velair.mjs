// Velair community card (#32, 31-velair.js + casoraVelairFind in 00-finder.js) without HA: detection by the platform
// velair, reading Velair's schedule response (default week, profiles, pauses), today/week with the carry-over across
// midnight, editing a day and the service calls it sends. Responses shaped like Velair 1.8 (docs/developer/api.md).
//   node dev/unit/velair.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const calls = [];
const asks = [];
let hass = null;
globalThis.window = globalThis;
globalThis.document = { querySelector: (q) => (q === 'home-assistant' && hass ? { hass, dispatchEvent: () => {} } : null), addEventListener: () => {} };
globalThis.addEventListener = () => {};
globalThis.setTimeout = () => 0;
globalThis.history = { pushState: () => {} };
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Stand-in for casora-core's _casoraUI: same escaping, rows kept for the assertions.
const rowsSeen = [];
window._casoraUI = {
  esc, tokens: { font: 'x', ink: 'i', ink2: 'i2' },
  line: (main, rest) => '<div class="hui-line">' + esc(main) + (rest || []).map((r) => ' · ' + esc(r)).join('') + '</div>',
  group: (rows, label) => { rowsSeen.push({ label, rows }); return '<div class="g">' + esc(label || '') + rows.map((r) => '<div>' + esc(r.label) + '|' + esc(r.sub || '') + '|' + esc(r.value || '') + '</div>').join('') + '</div>'; },
  segments: (items, label) => '<div class="seg">' + esc(label) + items.map((i) => esc(i.label)).join(',') + '</div>',
  label: (t) => '<div class="lbl">' + esc(t) + '</div>',
  note: (t) => '<div class="note">' + esc(t) + '</div>',
};
window._casoraSoftKit = { secCard: (watch, code) => ({ watch, code }), layout: (o) => ({ custom_fields: o.fields, o }) };
window.casoraAsk = (o) => { asks.push(o); return Promise.resolve(true); };
const load = (p) => new Function(fs.readFileSync(new URL('../../custom_components/casora/scripts/local/' + p, import.meta.url), 'utf8'))();
load('00-finder.js');
load('31-velair.js');
const F = window.casoraVelairFind, V = window._casoraVelair;
assert.ok(F && V, 'modules loaded');

const ID = 'climate.test_ac';
const states = {}, entities = {};
const add = (id, state, attrs, reg) => {
  states[id] = { entity_id: id, state, attributes: attrs || {} };
  entities[id] = Object.assign({ entity_id: id, platform: 'other' }, reg || {});
};
add(ID, 'heat', { hvac_modes: ['off', 'heat', 'cool'], temperature: 21, current_temperature: 20.4, min_temp: 16, max_temp: 30,
  target_temp_step: 0.5, fan_modes: ['auto', 'low'], fan_mode: 'auto', friendly_name: 'Test AC' });
add('climate.other', 'off', {});
hass = { states, entities, devices: {}, callService: (d, s, data) => { calls.push({ d, s, data }); return Promise.resolve(); },
  callWS: () => Promise.resolve(null) };

// ── Detection: only the platform velair ──
assert.equal(F.present(hass), false, 'no Velair entity → not present');
assert.deepEqual(F.climates(hass), []);
assert.equal(F.managed(hass, ID), false);
add('switch.velair_automatic_scheduling', 'on', {}, { platform: 'velair', translation_key: 'automatic_scheduling' });
add('sensor.velair_control_test_ac', 'automatic', {}, { platform: 'velair', translation_key: 'zone_control' });
// Same keys on another platform are not Velair.
add('sensor.fake_control', 'automatic', {}, { platform: 'other', translation_key: 'zone_control' });
assert.equal(F.present(hass), true);
const E = F.entities(hass);
assert.equal(E.auto, 'switch.velair_automatic_scheduling');
assert.deepEqual(E.zones.map((z) => z.entity_id), ['sensor.velair_control_test_ac']);
// Before the schedule arrives: the zone sensor named after the climate is the hint.
assert.deepEqual(F.climates(hass), [ID]);
assert.equal(F.managed(hass, ID), true);
assert.equal(F.managed(hass, 'climate.other'), null, 'unknown until loaded');

// ── Velair's response ──
const WEEK = {
  monday: [{ start: '06:00', action: 'set_temperature', temperature: 21, hvac_mode: 'heat' }, { start: '08:30', action: 'set_temperature', temperature: 18 },
    { start: '22:30', action: 'turn_off' }],
  tuesday: [{ start: '07:00', action: 'set_temperature', temperature: 20.5 }, { start: '18:00', action: 'set_temperature', target_temp_low: 20, target_temp_high: 24, hvac_mode: 'heat_cool' }],
  wednesday: [], thursday: [], friday: [{ start: '12:00', action: 'set_hvac_mode', hvac_mode: 'cool' }],
  saturday: [], sunday: [{ start: '20:00', action: 'set_temperature', temperature: 17 }],
};
const response = (over) => Object.assign({
  configured_entities: [ID], temperature_unit: '°C', temperature_migration: { required: false }, operation_recovery: null,
  global: { mode: 'auto', active_profile_ids: [] }, active_profile_ids: [], profiles: [], settings: { first_weekday: 'monday', min_temperature: 16, max_temperature: 30 },
  zones: { [ID]: { enabled: true, schedule: JSON.parse(JSON.stringify(WEEK)), override: null } },
  zone_runtime: { [ID]: { state: 'scheduled', control_mode: 'automatic' } },
}, over || {});
F._seed(response());
assert.deepEqual(F.climates(hass), [ID]);
assert.equal(F.managed(hass, 'climate.other'), false);

let z = V.zone(F.data(), ID);
assert.equal(z.source, 'default');
assert.equal(z.editable, true);
assert.equal(V.zone(F.data(), 'climate.other'), null);

// ── Day segments: a block runs until the next block of the week, across midnight and empty days ──
const seg = (wd) => V.daySegments(z.schedule, wd).map((s) => [V.hhmm(s.from), s.to >= 1440 ? '24:00' : V.hhmm(s.to), V.label(s.block), s.carried]);
assert.deepEqual(seg('monday'), [['00:00', '06:00', '17°', true], ['06:00', '08:30', '21°', false], ['08:30', '22:30', '18°', false], ['22:30', '24:00', 'Aus', false]]);
assert.deepEqual(seg('tuesday'), [['00:00', '07:00', 'Aus', true], ['07:00', '18:00', '20,5°', false], ['18:00', '24:00', '20–24°', false]]);
assert.deepEqual(seg('wednesday'), [['00:00', '24:00', '20–24°', true]], 'empty day: the last block of the week before');
assert.deepEqual(seg('friday'), [['00:00', '12:00', '20–24°', true], ['12:00', '24:00', 'Kühlen', false]]);
assert.deepEqual(V.daySegments({}, 'monday'), [], 'empty week');

// ── Now and next ──
const at = (y, mo, d, h, mi) => new Date(y, mo - 1, d, h, mi);
// 2026-10-26 is a Monday.
let a = V.at(z.schedule, at(2026, 10, 26, 7, 0));
assert.equal(a.now.temperature, 21);
assert.deepEqual([a.next.start, a.next.days, a.next.block.temperature], [510, 0, 18]);
assert.equal(V.status(z, at(2026, 10, 26, 7, 0)), '18° ab 08:30');
assert.equal(V.status(z, at(2026, 10, 26, 23, 0)), '20,5° morgen ab 07:00');
assert.equal(V.status(z, at(2026, 10, 28, 9, 0)), 'Kühlen am Freitag ab 12:00');

// ── States of the zone ──
F._seed(response({ zone_runtime: { [ID]: { state: 'paused', control_mode: 'automatic', pause_count: 1, until: null } } }));
z = V.zone(F.data(), ID);
assert.equal(z.zonePaused, true);
assert.equal(V.status(z), 'Zeitplan pausiert');
F._seed(response({ zone_runtime: { [ID]: { state: 'scheduled', control_mode: 'manual' } } }));
assert.equal(V.status(V.zone(F.data(), ID)), 'Manuell eingestellt');
F._seed(response({ global: { mode: 'paused' }, zone_runtime: { [ID]: { state: 'paused' } } }));
z = V.zone(F.data(), ID);
assert.equal(z.globalPaused, true); assert.equal(z.zonePaused, false);
assert.equal(V.status(z), 'Velair pausiert');
// An active profile that owns the zone: its week, read-only.
const away = { monday: [{ start: '00:00', action: 'set_temperature', temperature: 16 }] };
F._seed(response({ active_profile_ids: ['away'], profiles: [{ key: 'away', name: '<b>Weg</b>', zones: { [ID]: { behavior: 'schedule', schedule: away } } }] }));
z = V.zone(F.data(), ID);
assert.deepEqual([z.source, z.editable, z.profile], ['profile', false, '<b>Weg</b>']);
assert.deepEqual(z.schedule, away);
F._seed(response({ active_profile_ids: ['away'], profiles: [{ key: 'away', name: 'Weg', zones: { [ID]: { behavior: 'pause' } } }] }));
z = V.zone(F.data(), ID);
assert.deepEqual([z.source, z.editable, V.status(z)], ['profile_pause', false, 'Pausiert durch Weg']);
F._seed(response({ temperature_migration: { required: true } }));
assert.deepEqual([V.zone(F.data(), ID).editable, V.zone(F.data(), ID).blocked], [false, 'migration']);

// ── Editing a day (pure) ──
const mon = WEEK.monday;
let r = V.change(mon, 1, { temperature: 18.5 });
assert.deepEqual(r.blocks.map((b) => [b.start, b.temperature]), [['06:00', 21], ['08:30', 18.5], ['22:30', undefined]]);
assert.equal(r.blocks[0].hvac_mode, 'heat', 'other fields of the blocks stay');
r = V.change(mon, 0, { start: '9:15' });
assert.deepEqual(r.blocks.map((b) => b.start), ['08:30', '09:15', '22:30'], 'moved start: sorted, HH:MM');
assert.deepEqual(V.change(mon, 0, { start: '08:30' }), { error: 'twice' });
assert.deepEqual(V.change(mon, 2, null).blocks.map((b) => b.start), ['06:00', '08:30']);
assert.deepEqual(V.change(mon, -1, { start: '12:00', action: 'set_temperature', temperature: 20 }).blocks.map((b) => b.start), ['06:00', '08:30', '12:00', '22:30']);
assert.equal(mon.length, 3, 'input untouched');
assert.deepEqual(V.svc.day(ID, 'monday', []), { domain: 'velair', service: 'set_daily_schedule', data: { entity_id: ID, weekday: 'monday', blocks: [] } });
assert.deepEqual(V.svc.pause(ID).data, { entity_id: ID, action: 'none' });
assert.deepEqual(V.svc.resume(ID), { domain: 'velair', service: 'resume_zone', data: { entity_id: ID, apply_current_schedule: true, resume_all: true } });
assert.equal(V.svc.resumeAuto(ID).service, 'resume_automatic_control');

// ── Taps in the popup: choose Tuesday, edit its first slot, +0,5° twice, 15 min earlier, save ──
F._seed(response());
const tap = (mid) => window._casoraMiHooks.some((fn) => fn(mid));
const popup = V.popup({ entity_id: ID }, states, hass, {});
assert.deepEqual([popup.o.top, popup.o.left, popup.o.right], [['hero'], ['ctl'], ['plan', 'opts']], 'controls left, schedule right');
assert.deepEqual(popup.o.narrowOrder, ['ctl', 'plan', 'opts'], 'phone: controls, then the schedule');
assert.ok(popup.custom_fields.plan.card.watch.includes('sensor.velair_control_test_ac'), 'live on Velair\'s zone sensors');
assert.ok(tap('velair-day:' + ID + '|tuesday'));
let html = V.sec('plan', ID, states, hass, null);
assert.ok(/07:00–18:00/.test(html) && /20,5°/.test(html), 'Tuesday shown');
tap('velair-edit:' + ID + '|0');
tap('velair-step:' + ID + '|temperature|+');
tap('velair-step:' + ID + '|temperature|+');
tap('velair-step:' + ID + '|start|-');
html = V.sec('plan', ID, states, hass, null);
assert.ok(/Zeitfenster bearbeiten/.test(html) && /06:45/.test(html) && /21,5/.test(html), 'editor shows the draft');
tap('velair-save:' + ID);
await new Promise((res) => setImmediate(res));
assert.deepEqual(calls.pop(), { d: 'velair', s: 'set_daily_schedule', data: { entity_id: ID, weekday: 'tuesday', blocks: [
  { start: '06:45', action: 'set_temperature', temperature: 21.5 },
  { start: '18:00', action: 'set_temperature', target_temp_low: 20, target_temp_high: 24, hvac_mode: 'heat_cool' }] } });
// Add a slot and delete one (with the question first).
tap('velair-add:' + ID);
tap('velair-save:' + ID);
await new Promise((res) => setImmediate(res));
let c = calls.pop();
assert.deepEqual(c.data.blocks.map((b) => b.start), ['07:00', '18:00', '19:00'], 'new slot an hour after the last one');
assert.equal(c.data.blocks[2].temperature, 21, 'new slot: the climate target');
assert.equal(c.data.blocks[2].hvac_mode, undefined, 'mode of the block before it (none at 07:00)');
tap('velair-edit:' + ID + '|1');
tap('velair-del:' + ID);
await new Promise((res) => setImmediate(res));
await new Promise((res) => setImmediate(res));
assert.equal(asks.length, 1);
c = calls.pop();
assert.deepEqual(c.data.blocks.map((b) => b.start), ['07:00']);
// A Velair error comes back as a note, the editor stays open.
hass.callService = () => Promise.reject(new Error('Duplicate'));
tap('velair-edit:' + ID + '|0');
tap('velair-save:' + ID);
await new Promise((res) => setImmediate(res));
await new Promise((res) => setImmediate(res));
assert.ok(/Zeitfenster bearbeiten/.test(V.sec('plan', ID, states, hass, null)), 'editor still open after an error');
tap('velair-cancel:' + ID);
hass.callService = (d, s, data) => { calls.push({ d, s, data }); return Promise.resolve(); };

// ── Read-only with a profile: no edit taps, the name escaped ──
F._seed(response({ active_profile_ids: ['away'], profiles: [{ key: 'away', name: '<img src=x onerror=alert(1)>', zones: { [ID]: { behavior: 'pause' } } }] }));
rowsSeen.length = 0;
html = V.sec('plan', ID, states, hass, null) + V.sec('hero', ID, states, hass, null);
assert.ok(!/<img/.test(html), 'profile name escaped');
assert.ok(rowsSeen.every((g) => g.rows.every((x) => !/^velair-(edit|add)/.test(x.entity || ''))), 'no editing while a profile owns the zone');
assert.ok(/Ein Profil pausiert diesen Zeitplan/.test(html));

// ── Controls: modes and fan from the climate, target as a stepper ──
F._seed(response());
html = V.sec('ctl', ID, states, hass, null);
assert.ok(/Modus/.test(html) && /Aus,Heizen,Kühlen/.test(html), 'modes');
assert.ok(/Lüfter/.test(html) && /Auto,Niedrig/.test(html), 'fan modes');
assert.ok(/data-casora-step="0.5"/.test(html) && /21,0/.test(html), 'target stepper');
assert.equal(V.sec('hero', ID, states, hass, null), '<div class="hui-line">20,4° · Ziel 21° · ' + esc(V.status(V.zone(F.data(), ID))) + '</div>');

// ── Without data for this climate: a quiet line, no empty area ──
F._seed(response({ configured_entities: ['climate.x'], zones: { 'climate.x': { enabled: true, schedule: {} } } }));
assert.ok(/Velair plant dieses Gerät nicht/.test(V.sec('plan', ID, states, hass, null)));
console.log('velair: ok');
