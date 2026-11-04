// Issue #125: the Universal tile's popup said "Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten
// ergänzen." to everyone in the live dashboard. It is a setup hint for the admin: only the Studio preview (Studio
// panel on the page, window.casoraInStudio) shows it – stage (v3), hero and the template badge. All devices invented.
//   node dev/unit/free_tile_studio_hint.mjs
// @deckt: 28-free-tile.js#F.sec, casora-core.js#casoraInStudio
import assert from 'node:assert/strict';
import { freeTileEnv, stubUI } from './lib/free_tile_env.mjs';

const { F, states, hass, src } = freeTileEnv();
const UI = stubUI();
const HINT = 'Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten ergänzen.';

// The core's real helper, cut out of the bundle.
const core = src('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('  window.casoraInStudio = function () {');
assert.ok(a > 0, 'casora-core.js defines window.casoraInStudio');
new Function(core.slice(a, core.indexOf('\n  };\n', a) + 5))();

const extras = [];
UI.stage = (t, o) => { extras.push(o.extra || ''); return '<stage>' + (o.extra || '') + '</stage>'; };
const sec = (part, ent) => F.sec(part, F.plan(ent, states, hass, {}), states, hass);
const tpl = () => F.sec('hero', { id: null, tpl: '{{ 1 }}', empty: true, values: [], labels: {} }, states, hass);

// Live dashboard: no Studio panel registered (or it was removed / disconnected).
for (const panel of [undefined, null, { isConnected: false }]) {
  window._casoraStudioPanel = panel;
  assert.equal(window.casoraInStudio(), false, 'live: not in the Studio');
  for (const id of ['sensor.qa_temp', 'switch.qa_pumpe', 'sensor.qa_prozent']) {
    assert.ok(!sec('stage', states[id]).includes(HINT), 'live stage: no Studio hint (' + id + ')');
    assert.ok(!sec('hero', states[id]).includes(HINT), 'live hero: no Studio hint (' + id + ')');
  }
  assert.ok(!tpl().includes(HINT), 'live template badge: no Studio hint');
}

// Studio preview: the panel is on the page – the admin still sees where to add more.
window._casoraStudioPanel = { isConnected: true };
assert.equal(window.casoraInStudio(), true);
for (const id of ['sensor.qa_temp', 'switch.qa_pumpe', 'sensor.qa_prozent']) {
  assert.ok(sec('stage', states[id]).includes(HINT), 'Studio stage: hint stays (' + id + ')');
  assert.ok(sec('hero', states[id]).includes(HINT), 'Studio hero: hint stays (' + id + ')');
}
assert.ok(tpl().includes(HINT), 'Studio template badge: hint stays');
delete window._casoraStudioPanel;
console.log('free_tile_studio_hint: ok');
