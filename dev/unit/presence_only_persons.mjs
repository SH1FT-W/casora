// Owner, 01.11.2026: the people popup (phone's people badge, 35-phone-hub.js) lists persons only – a device tracker
// (phone, watch) in a presence slot or a room's presence row is no extra row, and no extra segment in the dial.
// Only trackers set up (no person at all): they still stand for the people, as on the badge.
//   node dev/unit/presence_only_persons.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/35-phone-hub.js', import.meta.url), 'utf8');

// A tiny DOM: button-cards with templates and a state, found through children and shadow roots.
const node = (localName, extra = {}) => Object.assign({ nodeType: 1, localName, children: [], shadowRoot: null,
  getBoundingClientRect: () => ({ width: 0, height: 0 }) }, extra);
const badge = (id, state) => node('button-card', { _config: { template: ['casora_badge_presence'] },
  _stateObj: { entity_id: id, state, attributes: { friendly_name: 'Name ' + id.split('.')[1] } } });

const run = (ids) => {
  const row = node('button-card', { _config: { template: ['casora_mobile_filter_badges'] } });
  row.shadowRoot = node('#shadow', { children: ids.map(([id, st]) => badge(id, st)) });
  const ha = node('home-assistant', { shadowRoot: node('#shadow', { children: [row] }) });
  const window = {};
  const document = { querySelector: (q) => (q === 'home-assistant' ? ha : null) };
  vm.runInNewContext(src, { window, document, getComputedStyle: () => ({ display: 'block' }), setTimeout, clearTimeout, console });
  return JSON.parse(JSON.stringify(window._casoraPhoneHub.scan('presence'), (k, v) => (k === 'el' ? undefined : v)));
};

const s = run([['person.alex', 'home'], ['device_tracker.alex_phone', 'home'], ['person.kim', 'not_home'],
  ['device_tracker.kim_watch', 'not_home']]);
assert.deepEqual(s.chips.map((c) => c.ids[0]), ['person.alex', 'person.kim'], 'only persons are rows');
assert.deepEqual(s.watch, ['person.alex', 'person.kim'], 'the trackers are not watched for rows either');

const t = run([['device_tracker.alex_phone', 'home'], ['device_tracker.kim_phone', 'not_home']]);
assert.equal(t.chips.length, 2, 'only trackers set up: they stand for the people');

console.log('presence_only_persons: ok');
