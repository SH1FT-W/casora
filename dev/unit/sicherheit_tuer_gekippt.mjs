// Prüfrunde u07-05: the security summary on Home left out a tilted terrace door. casoraContacts puts the door's tilt
// sensor into excl (it is merged with the contact into one opening), and casoraSecCount took only the members not in
// excl, so openings() never saw the tilt sensor and could not tell „tilted“. Expected: doorsTilted 1, no double count.
//   node dev/unit/sicherheit_tuer_gekippt.mjs
// @deckt: custom_components/casora/scripts/local/00-finder.js#casoraSecCount
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/scripts/local/00-finder.js', import.meta.url), 'utf8');
const w = { CASORA_SETTINGS: {} };
new Function('window', 'document', 'customElements', src)(w, { querySelector: () => null },
  { whenDefined: () => new Promise(() => {}), get: () => null });
const st = (state, dc, name) => ({ state, attributes: { device_class: dc, friendly_name: name } });
const run = (contact, tilt) => {
  const states = {
    'binary_sensor.terrassentuer_kontakt': st(contact, 'door', 'Terrassentür Kontakt'),
    'binary_sensor.terrassentuer_kippsensor': st(tilt, 'door', 'Terrassentür Kippsensor'),
    'binary_sensor.fenster_bad': st('off', 'window', 'Fenster Bad'),
  };
  const hass = { states, entities: {}, devices: {}, areas: {} };
  return w.casoraSecCount(states, hass, { place: 'home' }, {}, null);
};
let r = run('off', 'on');
assert.equal(r.doorsTilted, 1, 'tilted door counted');
assert.equal(r.doors, 0, 'tilted is not open');
assert.ok(r.ids.includes('binary_sensor.terrassentuer_kippsensor'), 'tilt sensor among the ids (redraw)');
r = run('on', 'off');
assert.equal(r.doors, 1, 'open door counted once');
assert.equal(r.doorsTilted, 0);
r = run('off', 'off');
assert.equal(r.doors + r.doorsTilted, 0, 'closed: nothing');
console.log('sicherheit_tuer_gekippt: ok');
