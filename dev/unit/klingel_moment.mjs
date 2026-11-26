// @deckt: custom_components/casora/scripts/local/52-klingel-moment.js custom_components/casora/scripts/local/46-screensaver.js#S.wake
// Doorbell moment (52-klingel-moment.js) without HA: what counts as a ring (event time, binary off → on, fresh only),
// the decision (setting, hidden page, typing, Studio, edit mode, extend while open, quiet time after it closed), the
// camera on the doorbell's device (Reolink live camera before the snapshot one, none = no moment), the doorbells of the
// house, the typing test through shadow roots, and the bell's switch notify_doorbell_front (configureFrom).
//   node dev/unit/klingel_moment.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
// Pure part only: without a document the module stops before it watches anything.
new Function(read('scripts/local/52-klingel-moment.js'))();
const M = window._casoraKlingelMoment;
assert.ok(M && typeof M.decide === 'function', 'module loaded');

const NOW = Date.parse('2026-11-26T18:00:00Z'), sec = (ms) => ms / 1000;

// ── isRing ──
const ev = 'event.front_door_ding';
const t0 = '2026-11-26T17:50:00.000+00:00', t1 = '2026-11-26T17:59:58.000+00:00';
assert.equal(M.isRing(ev, { s: t0 }, { s: t1, lc: sec(NOW - 2000) }, NOW), true, 'event: a new press time rings');
assert.equal(M.isRing(ev, { s: 'unknown' }, { s: t1, lc: sec(NOW - 2000) }, NOW), true, 'event: first press since the start rings');
assert.equal(M.isRing(ev, { s: 'unavailable' }, { s: t1, lc: sec(NOW) }, NOW), false, 'event: coming back from unavailable is no ring');
assert.equal(M.isRing(ev, { s: t1 }, { s: t1, lc: sec(NOW) }, NOW), false, 'event: same time is no ring');
assert.equal(M.isRing(ev, { s: t0 }, { s: '2026-11-26T17:40:00+00:00', lc: sec(NOW) }, NOW), false, 'event: an old press time is no ring');
assert.equal(M.isRing(ev, { s: t0 }, { s: 'unavailable', lc: sec(NOW) }, NOW), false, 'event: going unavailable is no ring');
assert.equal(M.isRing(ev, null, { s: t1, lc: sec(NOW) }, NOW), false, 'event: nothing seen before (first message) is no ring');
const bs = 'binary_sensor.testklingel_visitor';
assert.equal(M.isRing(bs, { s: 'off' }, { s: 'on', lc: sec(NOW - 500) }, NOW), true, 'binary: off → on rings');
assert.equal(M.isRing(bs, { s: 'on' }, { s: 'off', lc: sec(NOW) }, NOW), false, 'binary: the release is no ring');
assert.equal(M.isRing(bs, { s: 'unavailable' }, { s: 'on', lc: sec(NOW) }, NOW), false, 'binary: unavailable → on is no ring');
assert.equal(M.isRing(bs, { s: 'unknown' }, { s: 'on', lc: sec(NOW) }, NOW), false, 'binary: unknown → on is no ring');
assert.equal(M.isRing(bs, { s: 'off' }, { s: 'on', lc: sec(NOW - 10 * 60000) }, NOW), false, 'binary: a stale change is no ring');
assert.equal(M.isRing('sensor.x', { s: '1' }, { s: '2', lc: sec(NOW) }, NOW), false, 'other domains never ring');

// ── decide ──
const base = { on: true, cam: 'camera.c', hidden: false, typing: false, studio: false, editing: false, active: false, last: 0, now: NOW };
const d = (o) => M.decide(Object.assign({}, base, o));
assert.equal(d({}), 'open');
assert.equal(d({ on: false }), 'skip', 'switched off in the Studio');
assert.equal(d({ cam: null }), 'skip', 'no camera on the doorbell');
assert.equal(d({ hidden: true }), 'skip', 'page in the background');
assert.equal(d({ typing: true }), 'skip', 'never steals the focus from someone typing');
assert.equal(d({ studio: true }), 'skip', 'not in the Studio');
assert.equal(d({ editing: true }), 'skip', 'not while the dashboard is edited');
assert.equal(d({ active: true }), 'extend', 'a second ring while open extends it');
assert.equal(d({ active: true, typing: true }), 'extend', 'extending takes no focus');
assert.equal(d({ last: NOW - 10000 }), 'skip', 'debounce: shortly after it closed');
assert.equal(d({ last: NOW - M.QUIET_MS - 1 }), 'open', 'after the quiet time it opens again');
assert.ok(M.RING_MS >= 60000 && M.RING_MS <= 180000, 'ring window between one and three minutes');

// ── camOf / bells ──
const ent = (device_id, translation_key, extra) => Object.assign({ device_id, translation_key, platform: 'casora_mock' }, extra || {});
const hass = {
  entities: {
    'binary_sensor.testklingel_visitor': ent('dk', 'visitor'),
    'camera.testklingel_snapshots_main': ent('dk', 'snapshots_main'),
    'camera.testklingel_main': ent('dk', 'main'),
    'camera.testklingel_sub': ent('dk', 'sub'),
    'event.front_door_ding': ent('dr', null),
    'camera.front_door': ent('dr', null),
    'event.side_ding': ent('ds', null),
    'camera.side_hidden': ent('ds', null, { hidden: true }),
    'binary_sensor.window': ent('dw', null),
  },
  states: {
    'binary_sensor.testklingel_visitor': { state: 'off', attributes: {} },
    'camera.testklingel_snapshots_main': { state: 'idle', attributes: {} },
    'camera.testklingel_main': { state: 'idle', attributes: {} },
    'camera.testklingel_sub': { state: 'idle', attributes: {} },
    'event.front_door_ding': { state: t0, attributes: { device_class: 'doorbell' } },
    'camera.front_door': { state: 'idle', attributes: {} },
    'event.side_ding': { state: t0, attributes: { device_class: 'doorbell' } },
    'camera.side_hidden': { state: 'idle', attributes: {} },
    'binary_sensor.window': { state: 'off', attributes: { device_class: 'window' } },
  },
};
assert.equal(M.camOf(hass, 'binary_sensor.testklingel_visitor'), 'camera.testklingel_sub', 'Reolink: the sub stream, never the snapshot camera');
assert.equal(M.camOf(hass, 'event.front_door_ding'), 'camera.front_door', 'camera on the same device');
assert.equal(M.camOf(hass, 'event.side_ding'), null, 'a hidden camera does not count');
assert.equal(M.camOf(hass, 'binary_sensor.nope'), null);
// casoraIsDoorbell stands in for 00-finder.js.
window.casoraIsDoorbell = (h, id) => id === 'binary_sensor.testklingel_visitor' || (id.startsWith('event.') && h.states[id].attributes.device_class === 'doorbell');
assert.deepEqual(M.bells(hass), { 'binary_sensor.testklingel_visitor': 'camera.testklingel_sub', 'event.front_door_ding': 'camera.front_door' },
  'doorbells with a camera only');
// With 24-klingel.js loaded, its liveCam decides for a Reolink doorbell.
window._casoraKlingel = { liveCam: (h, id) => id === 'camera.testklingel_main' };
assert.equal(M.camOf(hass, 'binary_sensor.testklingel_visitor'), 'camera.testklingel_main', 'Reolink liveCam wins');
delete window._casoraKlingel;

// ── typing ──
const el = (tagName, o) => Object.assign({ tagName }, o || {});
assert.equal(M.typing({ activeElement: el('BODY') }), false);
assert.equal(M.typing({ activeElement: el('INPUT', { type: 'text' }) }), true);
assert.equal(M.typing({ activeElement: el('INPUT', { type: 'checkbox' }) }), false, 'a switch is no typing');
assert.equal(M.typing({ activeElement: el('TEXTAREA') }), true);
assert.equal(M.typing({ activeElement: el('DIV', { isContentEditable: true }) }), true);
const studioInput = el('INPUT', { type: 'search' });
const panel = el('CASORA-PANEL', { shadowRoot: { activeElement: el('HA-TEXTFIELD', { shadowRoot: { activeElement: studioInput } }) } });
assert.equal(M.typing({ activeElement: el('HOME-ASSISTANT', { shadowRoot: { activeElement: panel } }) }), true, 'through shadow roots (Studio)');
assert.equal(M.typing(null), false);

// ── the bell's switch ──
const core = read('scripts/casora-core.js');
assert.ok(/_doorbellFront = V\.notify_doorbell_front !== false/.test(core), 'configureFrom reads notify_doorbell_front');
assert.ok(/get doorbellFront\(\) \{ return _doorbellFront; \}/.test(core), '_casoraNotify.doorbellFront');
const tpl = JSON.parse(fs.readFileSync(new URL('../../dashboards/casora/button_card_templates.json', import.meta.url), 'utf8'));
assert.equal(tpl.casora_room.variables.notify_doorbell_front, true, 'on by default in the room card');
const studio = read('panel/casora-panel.js');
assert.ok(/key: "notify_doorbell_front", sub: "safety"[^\n]*boolDefault: true/.test(studio), 'Studio switch, on by default');
assert.ok(/when: \(\) => doorbellHere\(\)/.test(studio), 'Studio switch only with a doorbell');
// The screensaver can be woken from outside.
assert.ok(/S\.wake = function \(\)/.test(read('scripts/local/46-screensaver.js')), 'screensaver wake path');
assert.ok(/'52-klingel-moment'/.test(read('scripts/casora-local.js')), 'module in the loader');
console.log('klingel_moment: ok');
