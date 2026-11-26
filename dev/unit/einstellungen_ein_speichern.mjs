// @deckt: custom_components/casora/panel/casora-panel-b-plus.js#_bChanged,custom_components/casora/panel/casora-panel-settings.js#_csOwnsChanges,_markDirty
// One way to save on a settings page (Prüfrunde u03-05, u04-08): a dashboard field there (Show date, Rooms by category)
// raised the Studio's toast „Change applied · Save now“ on top of the page's own bar „Unsaved changes · Save
// settings“. On a settings page the bar holds the change alone; elsewhere the toast stays.
//   node dev/unit/einstellungen_ein_speichern.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { loadPanel } from './lib/testhaus.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const read = (f) => fs.readFileSync(ROOT + 'custom_components/casora/panel/' + f, 'utf8');
const { P } = await loadPanel();
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"').replace(/\bimport\((["'])/g, 'Promise.reject($1');
for (const m of ['b-plus', 'settings']) new Function(fix(read('casora-panel-' + m + '.js')))();
await new Promise((r) => setImmediate(r));
assert.equal(typeof P._bChanged, 'function', 'b-plus loaded');
assert.equal(typeof P._csOwnsChanges, 'function', 'settings loaded');

const timers = [];
globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
globalThis.clearTimeout = () => {};
const edit = (open, page) => {
  const me = Object.create(P);
  me.toasts = [];
  me._state = { compact: { rooms: [] } };
  me._bDiff = () => ({ kind: 'edit' });
  me._bToast = (m, o) => me.toasts.push([m, o]);
  me._csOpen = open;
  me._csPage = page;
  me.classList = { contains: () => false };
  timers.length = 0;
  me._bChanged({ s: [{}] });
  timers.splice(0).forEach((f) => f());
  return me.toasts;
};
assert.equal(edit(true, 'n-look').length, 0, 'settings page: the bar alone');
assert.equal(edit(true, 'n-phone').length, 0);
const out = edit(false, undefined);
assert.equal(out.length, 1, 'elsewhere the toast stays');
assert.equal(out[0][1].save, true);
console.log('einstellungen_ein_speichern: ok');
