// Tempo (16.11.2026): tile templates read design switches from <html> (--casora-tile-fallback-name …) with
// getComputedStyle(document.documentElement) – each read forced a style recalculation while a room or the page was being
// built. casoraRootVar (casora-core.js) keeps the values until the next frame or a change of <html>/<head>/size.
//   node dev/unit/root_var_cache.mjs
// @deckt: custom_components/casora/scripts/casora-core.js#casoraRootVar
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const block = core.slice(core.indexOf('// casora-rootvar:begin'), core.indexOf('// casora-rootvar:end'));
assert.ok(block.length > 100, 'casoraRootVar block in casora-core.js');

let vars = { '--a': ' 1', '--b': 'soft' }, reads = 0, frames = [], observers = [], listeners = {};
const win = { addEventListener: (t, f) => { listeners[t] = f; } };
const sandbox = {
  window: win,
  document: { documentElement: {}, head: {}, addEventListener: (t, f) => { listeners['doc:' + t] = f; } },
  getComputedStyle: () => { reads++; const snap = { ...vars }; return { getPropertyValue: (n) => snap[n] ?? '' }; },
  requestAnimationFrame: (f) => frames.push(f),
  MutationObserver: class { constructor(f) { this.f = f; observers.push(this); } observe() {} },
};
new Function(...Object.keys(sandbox), block)(...Object.values(sandbox));
const V = win.casoraRootVar;
assert.equal(typeof V, 'function');

assert.equal(V('--a'), ' 1', 'same string as getPropertyValue (caller trims)');
assert.equal(V('--b'), 'soft'); assert.equal(V('--a'), ' 1'); assert.equal(V('--nope'), '');
assert.equal(reads, 1, 'one computed style per frame for all names');

vars = { '--a': '0' };
assert.equal(V('--a'), ' 1', 'kept within the frame');
frames.splice(0).forEach((f) => f());
assert.equal(V('--a'), '0', 'next frame reads again');
assert.equal(reads, 2);

for (const [i, why] of [[0, '<html> attribute (HA theme)'], [1, 'stylesheet in <head>']]) {
  vars = { '--a': String(i + 10) };
  observers[i].f([]);
  assert.equal(V('--a'), String(i + 10), 'dropped on a change of ' + why);
}
vars = { '--a': 'r' }; listeners.resize(); assert.equal(V('--a'), 'r', 'dropped on resize (media queries)');
vars = { '--a': 'l' }; listeners['doc:load'](); assert.equal(V('--a'), 'l', 'dropped when a stylesheet loads');

// Every template read of a root custom property goes through it (with the old read as fallback before casora-core).
const tpl = read('dashboards/casora/button_card_templates.json');
const bare = tpl.split('getComputedStyle(document.documentElement).getPropertyValue(').length - 1;
const wrapped = tpl.split('(window.casoraRootVar || ((n) => getComputedStyle(document.documentElement).getPropertyValue(n)))(').length - 1;
assert.equal(bare, wrapped, 'no direct root read left in the templates (' + bare + ' / ' + wrapped + ')');
assert.ok(wrapped >= 20, 'template reads use casoraRootVar');

console.log('ok root_var_cache');
