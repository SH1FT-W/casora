// Clock hint (#30): the dashboard clock reads sensor.time (core "Time & Date" integration, option "Time") when no
// time sensor is chosen. casoraClockNeedsTimeDate decides, in one place, whether it reads a missing sensor.time;
// the Studio warning under "Time sensor" and the admin hint in the clock tile both use it.
//   node dev/unit/uhr_zeit_datum.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraClockNeedsTimeDate,casoraStudioGo,casoraClockHintGo
// @deckt: custom_components/casora/panel/casora-panel.js#fieldFault
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const slice = (text, re, what) => { const m = text.match(re); assert.ok(m, what + ' fehlt'); return m[0]; };

// --- the rule (casora-core.js) ---
const core = src('custom_components/casora/scripts/casora-core.js');
const ruleSrc = slice(core, /  window\.casoraClockNeedsTimeDate = function [\s\S]*?\n  \};\n/, 'casoraClockNeedsTimeDate');
const goSrc = slice(core, /  window\.casoraStudioGo = function [\s\S]*?\n  \};\n/, 'casoraStudioGo');
const hintGoSrc = slice(core, /  window\.casoraClockHintGo = function [\s\S]*?\n  \};\n/, 'casoraClockHintGo');
const win0 = {};
new Function('window', ruleSrc)(win0);
const needs = win0.casoraClockNeedsTimeDate;
const none = {};
const withTime = { 'sensor.time': { state: '21:07' } };
// warn: clock on (explicit or default), Automatic or sensor.time by hand, sensor.time missing
assert.equal(needs(true, '', none), true, 'on + Automatic + missing');
assert.equal(needs(undefined, undefined, none), true, 'default is on');
assert.equal(needs(true, 'sensor.time', none), true, 'sensor.time by hand + missing');
assert.equal(needs('', null, undefined), true, 'no states at all: missing');
// no warn
assert.equal(needs(true, '', withTime), false, 'sensor.time exists');
assert.equal(needs(true, '', { 'sensor.time': { state: 'unavailable' } }), false, 'unavailable counts as existing');
assert.equal(needs(true, 'sensor.uhr_wohnzimmer', none), false, 'another sensor chosen (its own check applies)');
assert.equal(needs(true, 'sensor.uhr_wohnzimmer', withTime), false);
assert.equal(needs(false, '', none), false, 'clock off');
assert.equal(needs(false, 'sensor.time', none), false);

// --- Studio: the field-level choice (casora-panel.js, real code sliced by marker) ---
const panel = src('custom_components/casora/panel/casora-panel.js');
const panelSrc = slice(panel, /const CLOCK_NEEDS_TIME_DATE = [\s\S]*?const fieldFault = [\s\S]*?\n\};\n/, 'fieldFault block');
const studio = new Function('window', panelSrc + '\nreturn { fieldFault, clockFaultOn, CLOCK_NEEDS_TIME_DATE, flowStartUrl };')({ casoraClockNeedsTimeDate: needs });
const { fieldFault, clockFaultOn, CLOCK_NEEDS_TIME_DATE, flowStartUrl } = studio;
const field = { key: 'time_entity', domains: ['sensor'] };
const generic = 'This entity no longer exists. Pick another one.';
assert.equal(fieldFault(field, '', { states: none }, { show_time: true }), CLOCK_NEEDS_TIME_DATE, 'Automatic warns');
assert.equal(fieldFault(field, '', { states: none }, {}), CLOCK_NEEDS_TIME_DATE, 'clock on by default');
assert.equal(fieldFault(field, 'sensor.time', { states: none }, {}), CLOCK_NEEDS_TIME_DATE, 'hand-picked sensor.time: new text, not generic');
assert.notEqual(fieldFault(field, 'sensor.time', { states: none }, {}), generic);
assert.equal(fieldFault(field, 'sensor.uhr_x', { states: none }, {}), generic, 'other missing sensor: generic text');
assert.equal(fieldFault(field, '', { states: withTime }, {}), '', 'sensor.time exists');
assert.equal(fieldFault(field, '', { states: none }, { show_time: false }), '', 'clock off');
assert.equal(fieldFault({ key: 'other', domains: ['sensor'] }, 'sensor.time', { states: none }, {}), generic, 'only the Time sensor field');
assert.equal(clockFaultOn(field, '', { states: none }, {}), true, 'marker: button follows the rule, not the text');
assert.equal(clockFaultOn(field, 'sensor.uhr_x', { states: none }, {}), false);
assert.equal(flowStartUrl('time_date'), 'https://my.home-assistant.io/redirect/config_flow_start/?domain=time_date');
assert.ok(panel.includes('window.open(flowStartUrl("time_date")'), 'button uses the shared URL builder');
assert.ok(panel.includes('flowStartUrl(r.id)'), 'setup check uses the same builder');

// --- go to the Studio (one helper for the popup gear and the clock hint) ---
const go = (admin, pathname, query) => {
  const calls = [];
  const win = { casoraIsAdmin: () => admin, history: { pushState: (_a, _b, u) => calls.push(u) }, dispatchEvent: (e) => calls.push(e.type) };
  const g = new Function('window', 'location', 'CustomEvent', goSrc + hintGoSrc + '\nreturn window;')(win, { pathname }, class { constructor(t) { this.type = t; } });
  query ? g.casoraStudioGo(query) : g.casoraClockHintGo();
  return calls;
};
assert.deepEqual(go(true, '/casora/kueche', '&settings=battery'), ['/casora-studio/kueche?dash=casora&settings=battery', 'location-changed'], 'room kept (as the popup gear did)');
assert.deepEqual(go(true, '/casora-mobile/kueche', '&settings=start'), ['/casora-studio?dash=casora&settings=start', 'location-changed'], 'phone: no room');
assert.deepEqual(go(true, '/casora_mobile', '&tab=popup'), ['/casora-studio?dash=casora&tab=popup', 'location-changed']);
assert.deepEqual(go(true, '/casora'), ['/casora-studio?dash=casora&section=time', 'location-changed'], 'hint opens the Time section');
assert.deepEqual(go(false, '/casora'), [], 'non-admin: no jump');
assert.ok(core.includes('window.casoraStudioGo(url)') || core.includes('window.casoraStudioGo('), 'popup gear uses the helper');
assert.ok(/_sectionFromRoute/.test(panel), 'Studio reads ?section=');

// --- tile: admin gets the hint, non-admin an empty text, rule false: the time as before. Production path: the
// "time" wrapper card hands the room variables to casora_time. ---
const templates = JSON.parse(src('dashboards/casora/button_card_templates.json'));
const tpl = templates.casora_time.name;
const find = (o) => { if (!o || typeof o !== 'object') return null; if (o.time && o.time.card && o.time.card.template === 'casora_time') return o.time.card; for (const v of Object.values(o)) { const r = find(v); if (r) return r; } return null; };
const wrapper = find(templates);
assert.ok(wrapper, 'time wrapper card');
const expr = (s, scope) => new Function('variables', 'hass', 'return (function(){' + s.replace(/^\[\[\[|\]\]\]\s*$/g, '') + '})()')(scope.variables, scope.hass);
const run = (admin, states, input) => {
  const hass = { locale: { time_format: '24' } };
  const vars = {};
  for (const [k, v] of Object.entries(wrapper.variables)) vars[k] = typeof v === 'string' && v.startsWith('[[[') ? expr(v, { variables: input, hass }) : v;
  const win = { casoraEsc: (t) => String(t), casoraIsAdmin: () => admin };
  new Function('window', ruleSrc)(win);
  return new Function('window', 'states', 'variables', 'return (function(){' + tpl.replace(/^\[\[\[|\]\]\]\s*$/g, '') + '})()')(win, states, vars);
};
const strip = (h) => h.replace(/<[^>]*>/g, '');
const hint = strip(run(true, none, { time_entity: 'sensor.time' }));
assert.ok(hint.length > 0 && /Uhrzeit & Datum/.test(hint), 'admin sees the hint naming the integration');
assert.match(run(true, none, {}), /text-transform:none/, 'hint does not inherit the clock uppercase');
assert.equal(run(false, none, { time_entity: 'sensor.time' }), '', 'non-admin sees no text');
assert.equal(run(true, withTime, { time_entity: 'sensor.time' }), '21:07', 'rule false: time as before');
assert.equal(run(true, none, { time_entity: 'sensor.uhr_wohnzimmer' }), '', 'other missing sensor: empty as before');
assert.equal(run(true, none, { time_entity: 'sensor.time', show_time: false }), '', 'clock off (through the wrapper): no hint');
// Texts exist in every dashboard language.
for (const l of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const ph = JSON.parse(src(`custom_components/casora/translations/dashboard/phrases/${l}.json`)).exact;
  assert.ok(ph[hint], l + ': ' + hint);
}
// Studio texts exist in every panel language, with the HA titles.
const titles = { de: 'Uhrzeit & Datum', en: 'Time & Date', es: 'Fecha y hora', fr: 'Date et heure', it: 'Ora e data', nl: 'Tijd en datum', pt: 'Hora & Data', pl: 'Czas i data' };
for (const [l, title] of Object.entries(titles)) {
  const ph = JSON.parse(src(`custom_components/casora/translations/panel/${l}.json`)).exact;
  assert.ok(ph[CLOCK_NEEDS_TIME_DATE].includes(title), l + ': warning names ' + title);
  assert.ok(ph['Add Time & Date'].includes(title), l + ': button names ' + title);
}
console.log('ok uhr_zeit_datum');
