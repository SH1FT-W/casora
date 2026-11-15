// Studio Agenda tile preview (#151): the calendar filter, the waste exclusion and the translated
// "No events" apply in the Studio, as on the dashboard. The Studio has no calendar module; the
// title rule comes alone from scripts/local/06a-kalender-filter.js.
// @deckt: custom_components/casora/panel/casora-panel.js#tileStateWord,_calendarSettings
import fs from 'node:fs';
import assert from 'node:assert/strict';

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
const makeWindow = ({ withRule = true, waste = null } = {}) => {
  const w = {
    casoraI18n: { t: (s) => de[s] || s },
    casoraDevice: { waste: () => ({ calendar: waste }) },
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

// Settings source: the Settings draft first, then the saved settings, read once when neither is known.
{
  const make = (ctx) => new Function('window', 'return {' + methodSrc() + '}')({})._calendarSettings.bind(ctx);
  const draft = { calendar_filter: 'Naam-' };
  const saved = { calendar_filter: '' };

  const withDraft = { _cs: { S: draft }, _casoraSettingsNow: saved };
  assert.equal(make(withDraft)('casora_calendar'), draft, 'an open Settings draft is used first');

  const savedOnly = { _casoraSettingsNow: saved };
  assert.equal(make(savedOnly)('casora_calendar'), saved, 'then the saved settings');

  assert.equal(make({ _cs: {} })('other_tile'), null, 'other tiles take no calendar settings');

  let read = 0, rebuilt = 0;
  const pending = { _hass: {}, _settingsOnce: () => { read++; return Promise.resolve(saved); }, _rebuildPreview: () => { rebuilt++; } };
  assert.equal(make(pending)('casora_calendar'), null, 'nothing known yet: null while the saved settings are read');
  await new Promise((r) => setTimeout(r));
  assert.equal(read, 1, 'the saved settings are read once');
  assert.equal(rebuilt, 1, 'the preview is drawn again when they arrive');
  console.log('ok Studio Agenda preview takes the Settings draft, else the saved settings');
}

// The preview passes its settings to tileStateWord.
assert.ok(/tileStateWord\(kind, tile, ent, this\._hass\.states, this\._hass, this\._calendarSettings\(kind\)\)/.test(panel),
  'the tile preview passes the calendar settings');
console.log('ok calendar_studio_tile');
