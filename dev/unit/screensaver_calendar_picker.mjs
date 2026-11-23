import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-settings.js', import.meta.url), 'utf8');
const start = src.indexOf('const calendarPickerVisible = () =>');
const end = src.indexOf('const extra = () =>', start);
assert.ok(start >= 0 && end > start, 'screensaver picker renderer found');
const renderer = src.slice(start, end);

assert.match(renderer, /SV\.selected/, 'rotation visibility follows the selected rotation kinds');
assert.match(renderer, /calendarPickerVisible\(\)/, 'the shared calendar picker is rendered when enabled');
assert.match(renderer, /casora_screensaver_calendars/, 'the shared picker retains its existing dashboard setting');
assert.doesNotMatch(renderer, /setVar\(["']casora_screensaver_calendars["']/, 'hiding the picker never clears the selection');

const predicate = renderer.match(/const calendarPickerVisible = \(\) => \{[\s\S]*?\n      \};/)[0]
  .replace('const calendarPickerVisible = ', '');
const visible = (show, selected) => Function('show', 'SV', 'draft', `return (${predicate.slice(0, -1)});`)(
  show,
  { vars: () => ({ casora_screensaver_mix: selected }), selected: (vars) => vars.casora_screensaver_mix },
  () => ({}),
 )();
assert.equal(visible('mix', ['wort', 'kalender']), true, 'rotation with calendar enabled shows the shared picker');
assert.equal(visible('mix', ['linie']), true, 'rotation with Dayline enabled shows the shared picker');
assert.equal(visible('mix', ['woche']), true, 'rotation with Week enabled shows the shared picker');
assert.equal(visible('mix', ['wort']), false, 'rotation without a calendar mode hides the picker');
assert.equal(visible('kalender', []), true, 'single Calendar keeps access to the picker');
assert.equal(visible('linie', []), true, 'single Dayline keeps access to the picker');
assert.equal(visible('woche', []), true, 'single Week keeps access to the picker');
assert.equal(visible('kameras', []), false, 'unrelated single modes do not show the picker');
console.log('screensaver_calendar_picker: ok');
