// @deckt: custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview
// The Studio's camera disclosure works without switching away from rotation.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty() {} };
    this.className = '';
    this.classList = { add: (name) => { this.className += ' ' + name; } };
    this.isConnected = true;
  }
  appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  insertBefore(child) { this.appendChild(child); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  getRootNode() { return null; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text || this.children.map((child) => child.textContent).join(''); }
  click() { this.onclick?.(); }
}
const read = (path) => fs.readFileSync(new URL('../../custom_components/casora/' + path, import.meta.url), 'utf8');
class Panel {}
const context = vm.createContext({
  console, document: { createElement: (tag) => new Element(tag), querySelector: () => null, addEventListener() {} },
  customElements: { whenDefined: () => Promise.resolve(), get: () => Panel },
  matchMedia: () => ({ matches: false }), location: { pathname: '/', search: '' },
  setInterval: () => 0, clearInterval() {},
});
context.window = context;
vm.runInContext(read('scripts/local/00-finder.js'), context);
vm.runInContext(read('scripts/local/46-screensaver.js'), context);
context._casoraSaver.mount = () => ({ update() {}, destroy() {} });
vm.runInContext(read('panel/casora-panel-settings.js'), context);
await new Promise((resolve) => setImmediate(resolve));
const nodes = (root) => [root, ...root.children.flatMap(nodes)];
const action = (root) => nodes(root).find((node) => node.tagName === 'button' && node.textContent === 'Choose cameras');
const cameraList = (root) => nodes(root).find((node) => node.dataset.key === 'casora_screensaver_cameras');
const picker = (root) => nodes(root).find((node) => node.className === 'cs-saver-camera-picker');
const rotationRow = (root) => nodes(root).find((node) => node.dataset.key === 'casora_screensaver_mix')
  ?.children.flatMap(nodes).find((node) => node.dataset.id === 'kameras');

function render(variables = {}) {
  const panel = new Panel();
  panel._state = { compact: { rooms: [{ name: 'Mock room', variables: structuredClone(variables) }] } };
  panel._hass = { devices: {}, entities: {}, states: {
    'camera.example_door': { entity_id: 'camera.example_door', state: 'idle',
      attributes: { friendly_name: 'Mock door', entity_picture: '/api/camera_proxy/camera.example_door' } },
  } };
  panel.dirtyCalls = 0;
  panel._markDirty = () => { panel.dirtyCalls++; };
  panel._mirrorToPair = () => {};
  const root = new Element('div');
  panel._csRender = () => { root.textContent = ''; panel._csSaverPreview(root, new Element('div')); };
  panel._csSaverPreview(root, new Element('div'));
  return { panel, root };
}

for (const [name, variables] of [
  ['default rotation', {}],
  ['explicit rotation', { casora_screensaver_kind: 'mix', casora_screensaver_mix: ['wort', 'kameras'] }],
  ['cameras only', { casora_screensaver_kind: 'kameras' }],
]) {
  const { panel, root } = render(variables);
  assert.ok(action(root), name + ' exposes Choose cameras');
  assert.equal(action(root).getAttribute('aria-expanded'), 'false', name + ' starts collapsed');
  assert.equal(picker(root).hidden, true);
  if (variables.casora_screensaver_kind === 'kameras') {
    const lists = nodes(root).find((node) => node.className === 'cs-saver-lists');
    const chips = nodes(root).find((node) => node.className === 'cs-saver-chips');
    assert.equal(action(root).parentElement, lists,
      'single-mode action is below the mode choices');
    assert.ok(lists.parentElement.children.indexOf(chips) < lists.parentElement.children.indexOf(lists));
  } else {
    assert.equal(action(root).parentElement, rotationRow(root).parentElement, 'rotation action is beside Cameras');
    assert.equal(nodes(picker(root)).filter((node) => node.className === 'fhead').length, 0,
      'rotation reuses its Cameras row as the picker heading');
  }
  const before = JSON.stringify(panel._state);
  action(root).click();
  assert.ok(cameraList(root), 'Choose cameras expands the existing inline camera list');
  assert.equal(picker(root).hidden, false);
  assert.equal(action(root).getAttribute('aria-expanded'), 'true');
  action(root).click();
  assert.equal(picker(root).hidden, true);
  assert.equal(action(root).getAttribute('aria-expanded'), 'false');
  assert.equal(JSON.stringify(panel._state), before, 'disclosure does not change settings');
  assert.equal(panel.dirtyCalls, 0, 'disclosure does not mark settings dirty');
}
for (const variables of [
  { casora_screensaver_mix: ['wort'] },
  { casora_screensaver_kind: 'wort' },
]) {
  const { root } = render(variables);
  assert.equal(action(root), undefined, 'no camera action when Cameras is not active');
  assert.equal(cameraList(root), undefined, 'no camera picker when Cameras is not active');
}
{
  const { panel, root } = render({ casora_screensaver_cameras: ['camera.example_door'] });
  action(root).click();
  rotationRow(root).click();
  assert.equal(action(root), undefined, 'excluding Cameras hides the action and picker');
  assert.equal(cameraList(root), undefined);
  rotationRow(root).click();
  assert.ok(action(root), 'including Cameras restores the action');
  assert.deepEqual(Array.from(panel._state.compact.rooms[0].variables.casora_screensaver_cameras),
    ['camera.example_door'], 'rotation inclusion does not clear camera choices');
}
{
  const { panel, root } = render({ casora_screensaver_cameras: ['camera.example_door'] });
  action(root).click();
  nodes(cameraList(root)).find((node) => node.dataset.id === 'auto').click();
  assert.equal(panel._state.compact.rooms[0].variables.casora_screensaver_cameras, undefined,
    'Automatic restores the existing default selection');
  assert.equal(panel.dirtyCalls, 1, 'camera selection is a settings draft change');
  assert.equal(panel._state.compact.rooms[0].variables.casora_screensaver_kind, undefined,
    'choosing cameras keeps rotation mode');
  assert.equal(picker(root).hidden, false, 'selection keeps the inline picker open');
}
{
  const { panel, root } = render({ casora_screensaver_cameras: ['camera.example_door'] });
  action(root).click();
  nodes(root).find((node) => node.dataset.kind === 'kameras').click();
  assert.equal(panel._state.compact.rooms[0].variables.casora_screensaver_kind, 'kameras');
  assert.equal(picker(root).hidden, true, 'switching to cameras-only starts collapsed');
  nodes(root).find((node) => node.dataset.kind === 'mix').click();
  assert.equal(panel._state.compact.rooms[0].variables.casora_screensaver_kind, undefined);
  assert.equal(picker(root).hidden, true, 'switching back to rotation starts collapsed');
  assert.deepEqual(Array.from(panel._state.compact.rooms[0].variables.casora_screensaver_cameras),
    ['camera.example_door'], 'switching modes retains camera choices');
}
{
  const { panel, root } = render();
  panel._hass.states = {};
  const empty = new Element('div');
  panel._csSaverPreview(empty, new Element('div'));
  action(empty).click();
  assert.ok(picker(empty).textContent.includes('No camera found. The preview shows an example.'),
    'empty camera picker retains its explanation');
}
console.log('screensaver_camera_picker: ok');
