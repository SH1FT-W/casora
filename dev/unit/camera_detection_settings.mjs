// @deckt: custom_components/casora/panel/casora-panel-personal.js#global
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-personal.js', import.meta.url), 'utf8');
const noop = () => {};
function element(tag) {
  return {
    tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, className: '', textContent: '',
    classList: { add: noop, toggle: noop, contains: () => false },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
  };
}
const document = { createElement: element };
const window = { casoraI18n: { t: text => text } };
const Panel = function () {};
const customElements = { get: () => Panel, whenDefined: () => ({ then: fn => fn() }) };
new Function('window', 'document', 'customElements', source)(window, document, customElements);
const panel = Object.create(Panel.prototype);
panel._hass = {
  entities: { 'camera.test': { device_id: 'test' }, 'binary_sensor.person': { device_id: 'test' } },
  devices: { test: { name: 'Test camera' } },
  states: {
    'camera.test': { attributes: { friendly_name: 'Test camera' } },
    'binary_sensor.person': { attributes: { friendly_name: 'Person' } },
  },
};
panel.shadowRoot = { getElementById: () => null, appendChild: noop };
panel._flowGroup = (parent) => { const outer = element('div'), list = element('div'); parent.appendChild(outer); outer.appendChild(list); return list; };
panel._flowRow = (parent, options = {}) => { const row = element('div'); row.textContent = options.title || ''; parent.appendChild(row); return { row }; };
panel._combo = (value, options, hint, onChange, opts) => {
  panel.combos.push({ value, options, hint, onChange, opts });
  return { wrap: element('div') };
};
panel._entityList = () => [];
panel._csBar = noop;
const draft = window.casoraPersonal.normalize({});
assert.deepEqual(draft.cameras, [], 'camera list starts empty');
const host = element('div');
const render = () => { host.children = []; panel.combos = []; panel._casoraPersonalGroups(host, draft, ['cameras'], render); };
render();
panel.combos.find(c => c.hint === 'Add a camera').onChange('camera.test');
assert.equal(draft.cameras[0].entity_id, 'camera.test');
panel.combos.find(c => c.opts && c.opts.entity).onChange('binary_sensor.person');
assert.deepEqual(draft.cameras[0].detection_triggers, ['binary_sensor.person']);
assert.deepEqual(window.casoraPersonal.prune(draft).cameras[0].detection_triggers, ['binary_sensor.person']);
assert.equal(window.CASORA_SETTINGS, undefined, 'editing the list does not save the draft');

const settingsSource = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-settings.js', import.meta.url), 'utf8');
new Function('window', 'document', 'customElements', 'localStorage', settingsSource)(window, document, customElements, {});
let stored = { scenes: { exclude: ['scene.test'] } };
const writes = [];
panel._hass.callWS = async message => {
  if (message.type === 'casora/settings/get') return { stored: true, settings: structuredClone(stored) };
  if (message.type === 'casora/settings/set') { writes.push(message); stored = structuredClone(message.settings); return { settings: stored }; }
  if (message.type === 'casora/options/get') return { options: {} };
  if (message.type === 'casora/tanken/get') return { cars: [] };
  if (message.type === 'casora/charging/get') return {};
  throw new Error('not available');
};
panel.shadowRoot.querySelectorAll = () => [];
panel._csRepaint = noop;
panel._status = noop;
await panel._csLoad();
panel._cs.S.cameras = structuredClone(draft.cameras);
assert.equal(writes.length, 0, 'the settings draft is not saved until Save');
assert.equal(panel._csDirty(), true);
assert.equal(await panel._csSave(), true);
assert.deepEqual(stored.cameras[0].detection_triggers, ['binary_sensor.person']);
assert.deepEqual(stored.scenes, { exclude: ['scene.test'] }, 'other settings survive the save');
panel._cs.loaded = false;
await panel._csLoad();
assert.deepEqual(panel._cs.S.cameras[0].detection_triggers, ['binary_sensor.person'], 'triggers reload');
