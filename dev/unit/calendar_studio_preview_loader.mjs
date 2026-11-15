// Studio screensaver preview loader: the Studio loads the calendar title rule and passes its settings draft.
// @deckt: custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview
//   node dev/unit/calendar_studio_preview_loader.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-settings.js', import.meta.url), 'utf8');
const start = src.indexOf('P._csSaverPreview = function');
const end = src.indexOf('P._csFillNeu = function');
assert.ok(start > 0 && end > start, 'the Studio screensaver preview function is found in the settings panel');
const preview = src.slice(start, end);

const loader = preview.slice(preview.indexOf('saverLoad = Promise.all('), preview.indexOf('.then(() => imp("local/46-screensaver.js"))'));
assert.ok(loader.includes('quiet("local/06a-kalender-filter.js")'),
  'the Studio preview loads the calendar title rule (06a-kalender-filter.js), not the calendar module');
assert.ok(!loader.includes('06-kalender.js'), 'the Studio preview does not load the calendar module');

const mount = preview.slice(preview.indexOf('SV.mount(stage'), preview.indexOf('if (typeof this._images'));
assert.ok(mount.includes('settings: this._cs ? this._cs.S : null'),
  'the preview context passes the settings draft to the screensaver, so the saved filter is not used');

console.log('ok Studio screensaver preview loads the calendar title rule and passes the settings draft');
