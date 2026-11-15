// Studio Agenda tile preview (#151): the calendar filter, the waste exclusion and the translated
// "No events" apply in the Studio, as on the dashboard. The Studio has no calendar module; the
// title rule comes alone from scripts/local/06a-kalender-filter.js.
// @deckt: custom_components/casora/panel/casora-panel.js#tileStateWord,_calendarSettings,_paintTile,custom_components/casora/panel/casora-panel-personal.js#_casoraPersonalGroups,custom_components/casora/panel/casora-panel-settings.js#_csDiscardAll
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const panel = read('custom_components/casora/panel/casora-panel.js');
const rule = fs.existsSync(new URL('../../custom_components/casora/scripts/local/06a-kalender-filter.js', import.meta.url))
  ? read('custom_components/casora/scripts/local/06a-kalender-filter.js') : '';

// tileStateWord is module-private in casora-panel.js: take the function text out of the source.
const fnStart = panel.indexOf('const tileStateWord = ');
assert.ok(fnStart > -1, 'tileStateWord exists');
const fnEnd = panel.indexOf('\n};\n', fnStart) + 4;
const tileStateWordSrc = panel.slice(fnStart, fnEnd).replace(/^const tileStateWord = /, 'return ');

// _calendarSettings is a method of the panel class: take its text as an object-literal method.
const methodSrc = () => {
  const start = panel.indexOf('\n  _calendarSettings(kind) {');
  assert.ok(start > -1, '_calendarSettings exists');
  return panel.slice(start, panel.indexOf('\n  }\n', start) + 5);
};

const de = { 'No events': 'Keine Termine' };
for (const [locale, expected] of Object.entries({
  de: 'Keine Termine', en: 'No events', es: 'Sin eventos', fr: 'Aucun événement',
  it: 'Nessun evento', nl: 'Geen afspraken', pl: 'Brak wydarzeń', pt: 'Sem eventos', nb: 'Ingen avtaler',
})) {
  const dict = JSON.parse(read(`custom_components/casora/translations/panel/${locale}.json`));
  assert.equal((dict.exact || {})['No events'] || 'No events', expected, `${locale} empty state`);
}
const makeWindow = ({ withRule = true, waste = null } = {}) => {
  const w = {
    casoraI18n: { t: (s) => de[s] || s },
    // Same contract as the finder: a configured trash_calendar wins over the detected one.
    casoraDevice: { waste: (h, v) => ({ calendar: (v && v.trash_calendar) || waste }) },
  };
  if (withRule && rule) new Function('window', rule)(w);
  return w;
};
const tileStateWord = (w) => new Function('window', tileStateWordSrc)(w);

const states = {
  'calendar.waste': { state: 'on', attributes: { message: 'Bins out' } },
  'calendar.a': { state: 'on', attributes: { message: 'Naam-cccccc' } },
  'calendar.b': { state: 'on', attributes: { message: 'Visible' } },
};
const calTile = { variables: {} };

// Studio settings are not necessarily available through the finder's global settings.
{
  const w = makeWindow();
  delete w.casoraDevice;
  new Function('window', 'document', read('custom_components/casora/scripts/local/00-finder.js'))(w, { querySelector: () => null });
  const only = { 'calendar.bins': { state: 'on', attributes: { message: 'Pickup' } } };
  const settings = { calendars: [], waste: { calendar: 'calendar.bins' } };
  assert.equal(tileStateWord(w)('casora_calendar', calTile, null, only, { states: only }, settings),
    'Keine Termine', 'the configured waste calendar is excluded with the real finder and Studio settings');
}

{
  const w = makeWindow({ waste: 'calendar.waste' });
  const word = tileStateWord(w);
  const chosen = { calendars: [{ entity: 'calendar.b' }] };
  assert.equal(word('casora_calendar', calTile, null, states, {}, chosen), 'Visible', 'configured list excludes unselected calendars');
  assert.equal(word('casora_calendar', calTile, null, states, {}, { calendars: [{ entity: 'calendar.waste' }] }), 'Keine Termine', 'configured waste stays excluded');
  assert.equal(word('casora_calendar', calTile, null, states, {}, { calendars: [{ entity: 'calendar.a', tile: false }] }), 'Keine Termine', 'disabled tile calendar stays excluded');
  const hass = { entities: { 'calendar.a': { hidden_by: 'user' } } };
  assert.equal(word('casora_calendar', calTile, null, states, hass, { calendars: [] }), 'Visible', 'automatic selection excludes hidden calendars');
  assert.equal(word('casora_calendar', calTile, null, states, hass, { calendars: [{ entity: 'calendar.a' }] }), 'Naam-cccccc', 'explicit selection includes hidden calendars');
  const ownTile = { variables: { calendars: [{ entity: 'calendar.b' }, { entity: 'calendar.waste' }] } };
  assert.equal(word('casora_calendar', ownTile, null, states, hass, { calendars: [{ entity: 'calendar.a' }] }), 'Visible', 'tile list overrides configured calendars and excludes waste');
  assert.equal(word('casora_calendar', { variables: { calendars: [{ entity: 'calendar.waste' }] } }, null, states, hass, chosen), 'Keine Termine', 'tile list cannot include waste');
}

// Saved filter words hide the first title; the next calendar's title shows.
{
  const w = makeWindow({ waste: 'calendar.waste' });
  const word = tileStateWord(w)('casora_calendar', calTile, null, states, {}, { calendar_filter: 'Naam-' });
  assert.equal(word, 'Visible', 'the Studio Agenda preview hides a title that contains a filter entry');
  console.log('ok Studio Agenda preview applies the calendar filter');
}

// The waste calendar stays out of the Agenda preview, as on the dashboard.
{
  const w = makeWindow({ waste: 'calendar.waste' });
  const only = { 'calendar.waste': states['calendar.waste'] };
  const word = tileStateWord(w)('casora_calendar', calTile, null, only, {}, { calendar_filter: '' });
  assert.equal(word, 'Keine Termine', 'the waste calendar is not shown; no event left is "No events", translated');
  console.log('ok Studio Agenda preview leaves out the waste calendar');
}

// No message at all: the translated text, not the English one.
{
  const w = makeWindow();
  const word = tileStateWord(w)('casora_calendar', calTile, null, {}, {}, { calendar_filter: '' });
  assert.equal(word, 'Keine Termine', 'no event is translated through casoraI18n');
  console.log('ok Studio Agenda preview translates "No events"');
}

// Until the title rule has loaded, nothing is shown (no unfiltered text).
{
  const w = makeWindow({ withRule: false });
  const word = tileStateWord(w)('casora_calendar', calTile, null, states, {}, { calendar_filter: 'Naam-' });
  assert.equal(word, '', 'no unfiltered calendar title before the rule has loaded');
  console.log('ok Studio Agenda preview waits for the title rule');
}

// Waste: left out when casoraDevice knows the waste calendar (the Studio loads 00-finder at start).
{
  const w = makeWindow({ waste: 'calendar.waste' });
  delete w.casoraDevice;
  const word = tileStateWord(w)('casora_calendar', calTile, null, { 'calendar.waste': states['calendar.waste'] }, {}, { calendar_filter: '' });
  assert.equal(word, 'Bins out', 'without casoraDevice the waste calendar is not known and stays');
  console.log('ok Studio Agenda preview leaves the waste calendar in only when it is not known');
}

// Settings source: the open Settings draft, then the saved settings file (CASORA_SETTINGS, updated on Save),
// then the copy read once.
const tick = () => new Promise((r) => setTimeout(r));
const make = (ctx, win) => new Function('window', 'return {' + methodSrc() + '}')(win)._calendarSettings.bind(ctx);
{
  const originalTimeout = globalThis.setTimeout;
  const { P } = await loadPanel();
  globalThis.setTimeout = originalTimeout;
  const elements = [];
  const element = () => {
    const children = {};
    return { dataset: {}, classList: { add() {}, toggle() {} }, style: { setProperty() {} },
      appendChild() {}, setAttribute() {}, querySelector: selector => children[selector] || (children[selector] = element()) };
  };
  globalThis.document = { createElement: tag => { const el = element(); elements.push({ tag, el }); return el; } };
  Object.assign(globalThis, makeWindow({ waste: 'calendar.waste' }));
  new Function(read('custom_components/casora/panel/casora-panel-personal.js'))();
  new Function(read('custom_components/casora/panel/casora-panel-settings.js'))();
  await Promise.resolve();
  const mounted = { tile: null };
  const instance = Object.create(P);
  instance._hass = { states, callWS: async (msg) => {
    if (msg.type === 'casora/settings/get') return { settings: { calendar_filter: 'Naam-' }, stored: true };
    throw { code: 'unknown_command' };
  } };
  instance.shadowRoot = { getElementById: () => ({}), querySelectorAll: () => [] };
  instance._flowGroup = () => ({ parentElement: element() });
  instance._flowRow = () => ({ row: element() });
  instance._cs = { S: window.casoraPersonal.normalize({ calendar_filter: 'Naam-' }) };
  instance._tileEnt = () => null;
  instance._tileKey = () => 'calendar';
  instance._inactiveIconColor = () => '';
  instance._smartSortOn = () => false;
  const previewTile = { template: 'casora_calendar', variables: {} };
  instance._rebuildPreview = () => { mounted.tile = instance._paintTile(previewTile, 0, { tiles: [previewTile] }); };
  const previewText = () => mounted.tile.querySelector('.mstate').textContent;
  instance._csRepaint = () => {};
  instance._rebuildPreview();
  assert.equal(previewText(), 'Visible');
  instance._casoraPersonalGroups(element(), instance._cs.S, ['calendars'], () => {});
  const field = elements.find(({ tag, el }) => tag === 'input' && el.value === 'Naam-').el;
  field.value = 'Visible';
  field.oninput();
  assert.equal(previewText(), 'Naam-cccccc', 'editing the draft redraws the mounted preview');
  await instance._csDiscardAll();
  assert.equal(previewText(), 'Visible', 'discard restores the mounted preview');
}
{
  const draft = { calendar_filter: 'Naam-' };
  const file = { calendar_filter: 'Old-' };
  const once = { calendar_filter: '' };
  const ready = { casoraCalendarAllows: () => true };

  assert.equal(make({ _cs: { S: draft }, _casoraSettingsNow: once }, { ...ready, CASORA_SETTINGS: file })('casora_calendar'), draft,
    'an open Settings draft is used first');
  assert.equal(make({ _casoraSettingsNow: once }, { ...ready, CASORA_SETTINGS: file })('casora_calendar'), file,
    'then the saved settings file, which Save updates');
  assert.equal(make({ _casoraSettingsNow: once }, ready)('casora_calendar'), once, 'then the copy read once');
  assert.equal(make({ _cs: {} }, ready)('other_tile'), null, 'other tiles take no calendar settings');
  console.log('ok Studio Agenda preview takes the Settings draft, then the saved settings');
}

// The title rule is requested once, the settings read once; the preview is drawn again when they arrive.
{
  let imports = 0, rebuilt = 0;
  const win = { casoraImportScript: (path) => { imports++; assert.equal(path, 'local/06a-kalender-filter.js');
    return Promise.resolve().then(() => { win.casoraCalendarAllows = () => true; }); } };
  const ctx = { _hass: {}, _settingsOnce: () => Promise.resolve({ calendar_filter: '' }), _rebuildPreview: () => { rebuilt++; } };
  const pick = make(ctx, win);
  assert.equal(pick('casora_calendar'), null, 'nothing known yet');
  pick('casora_calendar');
  await tick();
  assert.equal(imports, 1, 'the title rule is requested once');
  assert.equal(rebuilt, 2, 'drawn again for the settings and for the title rule');
  console.log('ok Studio Agenda preview loads the title rule once and draws again');
}

// A failed settings read leaves nothing (no unfiltered titles), and the next paint asks again.
{
  let imports = 0, rebuilt = 0;
  const win = { casoraImportScript: () => {
    imports++;
    if (imports === 1) return Promise.reject(new Error('offline'));
    win.casoraCalendarAllows = () => true;
    return Promise.resolve();
  } };
  const ctx = { _cs: { S: {} }, _rebuildPreview: () => { rebuilt++; } };
  const pick = make(ctx, win);
  pick('casora_calendar');
  pick('casora_calendar');
  await tick();
  assert.equal(imports, 1, 'one request while loading and no immediate retry');
  assert.equal(rebuilt, 0, 'failure does not cause a retrying redraw');
  pick('casora_calendar');
  await tick();
  assert.equal(imports, 2, 'later paint retries');
  assert.equal(rebuilt, 1, 'recovery redraws once');
}

{
  let imports = 0, rebuilt = 0;
  const win = { casoraImportScript: () => { imports++; return Promise.reject(new Error('offline')); } };
  const ctx = { _cs: { S: {} }, _rebuildPreview: () => { rebuilt++; } };
  const pick = make(ctx, win);
  for (let i = 0; i < 6; i++) { pick('casora_calendar'); await tick(); }
  assert.equal(imports, 2, 'only the initial import and one later retry are allowed');
  assert.equal(rebuilt, 0, 'repeated failures never schedule a redraw');
  assert.equal(tileStateWord(win)('casora_calendar', calTile, null, states, {}, ctx._cs.S), '', 'exhaustion remains fail-closed');
}

{
  let reads = 0, rebuilt = 0;
  const win = { casoraCalendarAllows: () => true };
  const ctx = { _hass: {}, _settingsOnce: () => { reads++; return Promise.resolve(null); }, _rebuildPreview: () => { rebuilt++; } };
  const pick = make(ctx, win);
  assert.equal(pick('casora_calendar'), null);
  await tick();
  assert.equal(ctx._casoraSettingsNow, undefined, 'a failed read does not become an empty copy');
  assert.equal(ctx._calSettingsAsked, false, 'the next paint may ask again');
  assert.equal(rebuilt, 0, 'nothing to draw');
  pick('casora_calendar');
  await tick();
  assert.equal(reads, 2, 'asked again on the next paint');
  console.log('ok Studio Agenda preview retries a failed settings read');
}

// The preview passes its settings to tileStateWord.
assert.ok(/tileStateWord\(kind, tile, ent, this\._hass\.states, this\._hass, this\._calendarSettings\(kind\)\)/.test(panel),
  'the tile preview passes the calendar settings');
console.log('ok calendar_studio_tile');
