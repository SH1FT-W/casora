// #157: the line under the Home greeting: off by default, next calendar event and next waste pickup.   node dev/unit/begruessung_naechstes.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraHomeNext dashboards/casora/button_card_templates.json#casora_room,casora_mobile_weather custom_components/casora/panel/casora-panel.js
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const a = src.indexOf('// casora-home-next:start'), b = src.indexOf('// casora-home-next:end');
assert.ok(a > 0 && b > a, 'block found');
const window = {};
new Function('window', src.slice(a, b))(window);
const now = new Date(2026, 10, 9, 10, 0, 0);
const cal = (msg, start, extra) => ({ state: 'off', attributes: { message: msg, start_time: start, ...extra } });
const on = { casora_greeting_next: true };
const next = (S, W) => { window.casoraDevice = { waste: () => W || { bins: [] } }; return window.casoraHomeNext({ states: S, locale: { language: 'de' } }, on, now); };

assert.equal(window.casoraHomeNext({ states: {} }, {}, now), '', 'off by default');
assert.equal(next({}), '', 'nothing due: no line');
assert.equal(next({ 'calendar.a': cal('Zahnarzt', '2026-11-09 15:00:00') }), 'Heute 15:00 Zahnarzt', 'today with time');
assert.equal(next({ 'calendar.a': cal('Spät', '2026-11-11 09:00:00'), 'calendar.b': cal('Früh', '2026-11-10 08:05:00') }), 'Morgen 08:05 Früh', 'the earliest of all calendars');
assert.equal(next({ 'calendar.a': cal('Urlaub', '2026-11-09 00:00:00', { all_day: true }) }), 'Heute Urlaub', 'all day: no time');
assert.equal(next({ 'calendar.a': { state: 'on', attributes: { message: 'Läuft', start_time: '2026-11-09 09:00:00' } } }), 'Jetzt Läuft', 'running now');
assert.equal(next({}, { bins: [{ label: 'Bio', days: 2 }, { label: 'Restmüll', days: 1 }] }), 'Morgen Restmüll', 'nearest bin');
assert.equal(next({ 'calendar.a': cal('Zahnarzt', '2026-11-09 15:00:00') }, { bins: [{ label: 'Bio', days: 0 }] }), 'Heute 15:00 Zahnarzt · Heute Bio', 'both in one line');
assert.equal(next({ 'calendar.waste': cal('Bio', '2026-11-09 00:00:00', { all_day: true }) }, { calendar: 'calendar.waste', bins: [] }), '', 'the waste calendar is not an event');
assert.match(next({}, { bins: [{ label: 'Papier', days: 3 }] }), /^Donnerstag Papier$/, 'a weekday within the week');
assert.equal(next({}, { bins: [{ label: 'Papier', days: null }] }), '', 'no date: left out');
// Reported in #157: a calendar hidden in Home Assistant (the Workday sensor's calendar, hidden with its device)
// stood under the greeting as „Heute Workday Sensor“. Hidden and disabled calendars are not shown, and the Workday
// integration's calendar is no appointment even when it is visible.
const reg = (entities) => (S) => { window.casoraDevice = { waste: () => ({ bins: [] }) }; return window.casoraHomeNext({ states: S, entities, locale: { language: 'de' } }, on, now); };
const two = { 'calendar.workday_sensor': cal('Workday Sensor', '2026-11-09 00:00:00', { all_day: true }), 'calendar.familie': cal('Zahnarzt', '2026-11-10 15:00:00') };
assert.equal(reg({ 'calendar.workday_sensor': { hidden: true, platform: 'workday' }, 'calendar.familie': { platform: 'google' } })(two), 'Morgen 15:00 Zahnarzt', 'a hidden calendar is left out');
assert.equal(reg({ 'calendar.workday_sensor': { hidden: true, platform: 'workday' } })({ 'calendar.workday_sensor': two['calendar.workday_sensor'] }), '', 'only a hidden calendar: no line');
assert.equal(reg({ 'calendar.familie': { disabled_by: 'user', platform: 'google' } })({ 'calendar.familie': two['calendar.familie'] }), '', 'a disabled calendar is left out');
assert.equal(reg({ 'calendar.workday_sensor': { platform: 'workday' }, 'calendar.familie': { platform: 'google' } })(two), 'Morgen 15:00 Zahnarzt', 'the Workday calendar is no appointment');
assert.equal(reg({})(two).includes('Zahnarzt') || reg({})(two).includes('Workday'), true, 'calendars without a registry entry (YAML) still count');
// #189: calendars picked in the Studio (Settings › Home & devices › Calendars) are the ones that count, as on the
// calendar tile; a calendar left out there no longer stands under the greeting. Without a pick, all of them (above).
const picked = (list) => (S) => { window.casoraDevice = { waste: () => ({ bins: [] }) }; window.casoraSettings = () => ({ calendars: list }); try { return window.casoraHomeNext({ states: S, entities: {}, locale: { language: 'de' } }, on, now); } finally { delete window.casoraSettings; } };
const both = { 'calendar.arbeit': cal('Meeting', '2026-11-09 11:00:00'), 'calendar.familie': cal('Zahnarzt', '2026-11-10 15:00:00') };
assert.equal(picked([{ entity: 'calendar.familie', name: 'Familie' }])(both), 'Morgen 15:00 Zahnarzt', 'a calendar not picked in the Studio is left out');
assert.equal(picked([{ entity: 'calendar.familie' }, { entity: 'calendar.arbeit', tile: false }])(both), 'Morgen 15:00 Zahnarzt', 'a calendar picked only for the popup (tile: false) is no appointment either');
assert.equal(picked([])(both), 'Heute 11:00 Meeting', 'an empty pick means all calendars');
assert.equal(picked(['calendar.arbeit'])(both), 'Heute 11:00 Meeting', 'a pick given as plain ids works too');
// #189: the line also stands under the room name (title „Room name“), still only when switched on; with the switch off
// the room name stays in button-card's #name exactly as before. Template code run with a stand-in window.
const T = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
const body = (x) => x.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const run = (code, self, vars, greet) => {
  const w = { casoraEsc: null, casoraGreeting: () => greet || null, casoraRoomName: (n, v) => ({ text: n || 'Home', literal: v.name_literal === true }),
    casoraHomeNext: (h, v) => (v.casora_greeting_next === true ? 'Morgen 15:00 Zahnarzt' : '') };
  return new Function('window', 'hass', 'variables', 'states', body(code)).call(self, w, {}, vars, {});
};
const R = T.casora_room, room = { _config: { name: 'Wohnzimmer' }, shadowRoot: null };
const nField = (vars, greet) => run(R.custom_fields.n, room, vars, greet);
const shown = (list, vars, greet) => run(list.find((o) => 'display' in o).display, room, vars, greet);
assert.equal(nField({}), '', 'room name, switch off: the field stays empty');
assert.equal(shown(R.styles.name, {}), 'block', 'room name, switch off: #name shows as before');
assert.equal(shown(R.styles.custom_fields.n, {}), 'none', 'room name, switch off: the field is hidden');
const withLine = nField(on);
assert.match(withLine, /^<span>Wohnzimmer<\/span><div data-no-i18n[^>]*>Morgen 15:00 Zahnarzt<\/div>$/, 'room name, switch on: name and line');
assert.equal(shown(R.styles.name, on), 'none', 'room name, switch on: the field stands in for #name');
assert.equal(shown(R.styles.custom_fields.n, on), 'block', 'room name, switch on: the field shows');
assert.match(nField({ ...on, name_literal: true }), /^<span data-no-i18n>Wohnzimmer<\/span>/, 'a literal name is not translated');
assert.match(nField(on, 'Guten Tag'), /^<span data-no-i18n>Guten Tag<\/span><div data-no-i18n[^>]*>Morgen 15:00 Zahnarzt<\/div>$/, 'greeting: unchanged');
assert.equal(nField({}, 'Guten Tag'), '<span data-no-i18n>Guten Tag</span>', 'greeting without the line: unchanged');
const M = T.casora_mobile_weather;
const mName = (vars, greet) => run(M.name, { shadowRoot: null }, vars, greet);
assert.equal(mName({ home_name: 'Haus' }), '<span data-no-i18n>Haus</span>', 'phone, switch off: an own title as before');
assert.equal(mName({}), 'Home', 'phone, switch off: the default title as before');
assert.match(mName({ home_name: 'Haus', ...on }), /^<span data-no-i18n>Haus<\/span><div data-no-i18n[^>]*>Morgen 15:00 Zahnarzt<\/div>$/, 'phone, switch on: own title and line');
assert.match(mName(on), /^<span>Home<\/span><div data-no-i18n[^>]*>Morgen 15:00 Zahnarzt<\/div>$/, 'phone, switch on: default title and line');
assert.match(mName(on, 'Guten Tag'), /^<span data-no-i18n>Guten Tag<\/span><div/, 'phone greeting: unchanged');
// The Studio shows the switch with either title and hands it to the phone dashboard only when switched on.
const P = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
const fld = P.slice(P.indexOf('key: "casora_greeting_next"'), P.indexOf('key: "__phone_name"'));
assert.ok(fld && !/when:/.test(fld) && /boolDefault: false/.test(fld), 'the switch: no condition, off by default');
assert.ok(P.includes('if (hv.casora_greeting_next === true) c.variables.casora_greeting_next = true;'), 'phone twin: the switch only when on, with any title');
console.log('ok – line under the title');
