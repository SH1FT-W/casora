// Phone room page on a dashboard without any scene card (setup wizard's dashboard: no scene row on the start page):
// the scene list window._casoraSC is defined only by a card built on casora_scene_core, so the room page waited for
// it forever and never showed its scenes (gate 02.11.2026, r396 on qa-arbeit). Now the room page builds one hidden
// scene card outside the page to define it, and removes it once the list is there.
//   node dev/unit/room_scenes_without_scene_card.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const fo = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
const m = /\n    _primeSceneList\(roomMode\) \{([\s\S]*?)\n    \}\n/.exec(fo);
assert.ok(m, '_primeSceneList found in filter-overlay.js');
// The late-scene branch of _ensureAutoSections asks for it.
assert.match(fo, /this\._lateScenes = \{ roomMode[^\n]*\n\s*this\._primeSceneList\(roomMode\);/, 'late-scene branch primes the scene list');

// Run it with a fake DOM.
const made = [];
const mkEl = (tag) => ({ tag, style: {}, attrs: {}, kids: [], isConnected: false, parent: null,
  setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); c.parent = this; c.isConnected = this.isConnected; return c; },
  remove() { if (this.parent) this.parent.kids = this.parent.kids.filter((x) => x !== this); this.isConnected = false; this.parent = null; },
  get firstChild() { return this.kids[0] || null; } });
const body = mkEl('body'); body.isConnected = true;
const document = { body, createElement: (t) => mkEl(t) };
const timers = [];
const window = {};
const self = {
  _hass: { states: {} }, _config: { room: 'Bad', area: 'bad' },
  _helpers: { createCardElement: (cfg) => { const el = mkEl('button-card'); el.cfg = cfg; made.push(el); return el; } },
};
const run = () => new Function('window', 'document', 'setTimeout', 'roomMode', 'state',
  'let _scenePrimer = state.p; try {' + m[1] + '} finally { state.p = _scenePrimer; }')
  .call(self, window, document, (f, ms) => timers.push([f, ms]), 'Bad', st);
const st = { p: null };

run();
assert.equal(made.length, 1, 'one hidden scene card built');
assert.deepEqual([].concat(made[0].cfg.template), ['casora_scene_row'], 'built on the scene template (casora_scene_core)');
assert.equal(made[0].cfg.variables.room, 'Bad');
assert.equal(made[0].hass, self._hass, 'gets hass, so it renders');
const box = body.kids[0];
assert.ok(box && box.kids[0] === made[0], 'attached to the document, outside the room page');
assert.match(box.style.cssText, /opacity:0/); assert.match(box.style.cssText, /pointer-events:none/);
run();
assert.equal(made.length, 1, 'a second room page reuses it');
// The list arrives: the hidden card goes away.
window._casoraSC = { list: () => [] };
timers.filter(([, ms]) => ms === 300).forEach(([f]) => f());
assert.equal(body.kids.length, 0, 'removed once the scene list is there');
// With the list already there nothing is built.
made.length = 0; st.p = null;
run();
assert.equal(made.length, 0, 'nothing built when the scene list exists');
console.log('room_scenes_without_scene_card: ok');
