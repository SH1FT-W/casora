// @deckt: custom_components/casora/scripts/local/06-abfall-fetch.js
// The waste fetch lives in 06-abfall-fetch.js, not in the casora_trash template; the module is in MODULES.
//   node dev/unit/waste_fetch_module.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const T = JSON.parse(read('dashboards/casora/button_card_templates.json'));
const tile = T.casora_trash.state_display;
assert.ok(!/_casoraTrashFetch\s*=/.test(tile) && !tile.includes('callApi'), 'template holds no fetch');
assert.ok(tile.includes('_casoraTrashFetch?.('), 'template only calls it');
assert.ok(/'06-abfall-fetch'/.test(read('custom_components/casora/scripts/casora-local.js')), 'module in MODULES');

globalThis.window = globalThis;
new Function(read('custom_components/casora/scripts/local/06-abfall-fetch.js'))();
assert.equal(typeof window._casoraTrashFetch, 'function');
let url = null;
await new Promise((res) => {
  window._casoraTrashFetch({ callApi: (m, u) => { url = u; res(); return Promise.resolve([{ summary: 'x' }]); } }, 'calendar.a');
});
await new Promise((r) => setImmediate(r));
assert.ok(url.startsWith('calendars/calendar.a?start='), 'fetches the calendar');
assert.equal(window._casoraTrashCal.id, 'calendar.a');
assert.equal(window._casoraTrashBusy, false);
console.log('waste_fetch_module: ok');
