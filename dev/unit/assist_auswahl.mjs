// Device assistant (03.11.2026, owner): tick what gets built instead of all suggestions at once. Parts of a lamp
// (segments, outer ring, lamp surface) start unticked with "Part of …"; everything else with a room is ticked; kinds
// for the filter chips. Made-up entities only.
//   node dev/unit/assist_auswahl.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener() {}, head: { appendChild() {} }, createElement: () => ({ style: {} }) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null, define() {} };
const src = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
new Function(src('panel/casora-panel-assist.js'))();
const A = window.casoraAssist;
assert.ok(A.partsOf && A.defaultOn && A.kindOf, 'exports');

const hass = { devices: {
  strip: { id: 'strip', name: 'Deckenleuchte' },
  dim: { id: 'dim', name: 'Dimmer 2PM' },
  bar: { id: 'bar', name: 'Lichtleiste' },
} };
const it = (id, device, name, room, type = 'light') => ({ id, device, name, room, type, entity: 'light.qa_' + id });
const items = [
  it('main', 'strip', 'Deckenleuchte', 'Wohnzimmer'),
  it('ring', 'strip', 'Deckenleuchte Außenring', 'Wohnzimmer'),
  it('area', 'strip', 'Deckenleuchte Lampenfläche', 'Wohnzimmer'),
  it('s1', 'strip', 'Deckenleuchte Segment 1', 'Wohnzimmer'),
  it('s10', 'strip', 'Deckenleuchte Segment 10', 'Wohnzimmer'),
  // Two-channel dimmer: two real lamps, no main named like the device – both stay ticked.
  it('k1', 'dim', 'Leselampe', 'Wohnzimmer'),
  it('k2', 'dim', 'Unterschrank', 'Küche'),
  // No main light, but segment names: parts of the device.
  it('z1', 'bar', 'Lichtleiste Zone 1', 'Büro'),
  it('z2', 'bar', 'Lichtleiste Zone 2', 'Büro'),
  // Without a room: not ticked (nowhere to build it).
  { id: 'tv', device: 'tv', name: 'Fernseher', room: null, type: 'media', entity: 'media_player.qa_tv' },
  { id: 'wm', device: 'wm', name: 'Waschmaschine', room: 'Keller', type: 'casora_washer', entity: 'sensor.qa_wm' },
];
const parts = A.partsOf(hass, items);
assert.deepEqual([...parts.keys()].sort(), ['area', 'ring', 's1', 's10', 'z1', 'z2'], 'parts');
assert.equal(parts.get('ring'), 'Deckenleuchte', 'part of the main light');
assert.equal(parts.get('z1'), 'Lichtleiste', 'part of the device when there is no main light');
const on = A.defaultOn(hass, items);
assert.equal(on.get('main'), true);
assert.equal(on.get('ring'), false);
assert.equal(on.get('s1'), false);
assert.equal(on.get('k1'), true, 'dimmer channel 1 stays ticked');
assert.equal(on.get('k2'), true, 'dimmer channel 2 stays ticked');
assert.equal(on.get('tv'), false, 'no room → not ticked');
assert.equal(on.get('wm'), true);
assert.equal(A.kindOf('light'), 'lamps');
assert.equal(A.kindOf('thermostat'), 'climate');
assert.equal(A.kindOf('media'), 'media');
assert.equal(A.kindOf('lock'), 'security');
assert.equal(A.kindOf('cover'), 'blinds');
assert.equal(A.kindOf('casora_washer'), 'household');
assert.equal(A.kindOf('casora_football'), 'other');
console.log('ok assist_auswahl');
