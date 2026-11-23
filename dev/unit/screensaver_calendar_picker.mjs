// @deckt: custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadCalendars } from './lib/calendars_block.mjs';

const read = (path) => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.style = { cssText: '', setProperty() {} };
    this.parentNode = null;
    this.className = '';
    this.classList = {
      add: (...names) => { this.className = [...new Set([...this.classes(), ...names])].join(' '); },
      contains: (name) => this.classes().includes(name),
    };
  }
  classes() { return String(this.className).split(/\s+/).filter(Boolean); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  insertBefore(child, before) {
    child.parentNode = this;
    const index = this.children.indexOf(before);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    return child;
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text || this.children.map((child) => child.textContent || '').join(''); }
  getRootNode() { let node = this; while (node.parentNode) node = node.parentNode; return node; }
  querySelectorAll(selector) {
    const match = selector[0] === '.'
      ? (node) => node.classes().includes(selector.slice(1))
      : selector[0] === '#'
        ? (node) => node.id === selector.slice(1)
        : () => false;
    const found = [];
    const visit = (node) => node.children.forEach((child) => { if (match(child)) found.push(child); visit(child); });
    visit(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  get isConnected() { return true; }
}

const Panel = class {};
const window = { matchMedia: () => ({ matches: false }) };
loadCalendars(window);
const context = {
  window,
  document: { createElement: (tag) => new Element(tag) },
  customElements: { whenDefined: () => Promise.resolve(), get: () => Panel },
  console,
  Intl,
  Date,
  Math,
  parseFloat,
  isFinite,
  isNaN,
  parseInt,
  String,
  Number,
  JSON,
  location: { search: '', pathname: '/' },
  __casoraPanelInternals: {},
  URL,
  URLSearchParams,
  setTimeout,
  setInterval: () => 1,
  clearInterval() {},
};
vm.createContext(context);
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), context, { filename: '46-screensaver.js' });
vm.runInContext(read('custom_components/casora/panel/casora-panel-settings.js'), context, { filename: 'casora-panel-settings.js' });
await Promise.resolve();

const SV = window._casoraSaver;
SV.mount = () => ({ update() {}, destroy() {} });
const makePreview = (variables = {}, states = {
  'calendar.example_a': { attributes: { friendly_name: 'A' } },
  'calendar.example_b': { attributes: { friendly_name: 'B' } },
}) => {
  const box = new Element('section'), card = new Element('article');
  box.appendChild(card);
  const panel = {
    _state: { compact: { rooms: [{ name: 'Test', variables: { ...variables } }] } },
    _hass: { states },
    _imgs: [],
  };
  Panel.prototype._csSaverPreview.call(panel, box, card);
  return { box, variables: panel._state.compact.rooms[0].variables };
};
const lists = (box) => box.querySelectorAll('.cs-saver-list');
const listFor = (box, key) => lists(box).find((list) => list.dataset.key === key);
const calendarRow = (box, id) => listFor(box, 'casora_screensaver_calendars').children.find((row) => row.dataset.id === id);
const rotationRow = (box, id) => listFor(box, 'casora_screensaver_mix').children.find((row) => row.dataset.id === id);

// Unset rotation uses SV.selected's real default: every kind is included.
const defaults = makePreview({ casora_screensaver_calendars: ['calendar.example_b'] });
assert.ok(listFor(defaults.box, 'casora_screensaver_calendars'), 'default rotation exposes the shared calendar picker');
assert.equal(calendarRow(defaults.box, 'calendar.example_b').attributes['aria-pressed'], 'true');
for (const kind of ['kalender', 'linie', 'woche']) {
  defaults.box.querySelectorAll('.cs-saver-chip').find((chip) => chip.dataset.kind === kind).onclick();
  assert.ok(listFor(defaults.box, 'casora_screensaver_calendars'), `single ${kind} exposes the shared picker`);
}
const empty = makePreview({}, {});
assert.match(empty.box.textContent, /No calendar found\. The preview shows an example\./, 'no calendars keeps the example empty state');

// With one non-calendar kind selected, the picker is hidden; enabling Calendar restores the same saved choice.
const rotation = makePreview({
  casora_screensaver_mix: ['wort'],
  casora_screensaver_calendars: ['calendar.example_b'],
});
assert.equal(listFor(rotation.box, 'casora_screensaver_calendars'), undefined, 'rotation without calendar kinds hides the picker');
rotationRow(rotation.box, 'kalender').onclick();
assert.ok(listFor(rotation.box, 'casora_screensaver_calendars'), 'enabling Calendar in rotation restores the picker');
assert.equal(calendarRow(rotation.box, 'calendar.example_b').attributes['aria-pressed'], 'true', 'the saved calendar remains selected');
rotationRow(rotation.box, 'kalender').onclick();
assert.equal(listFor(rotation.box, 'casora_screensaver_calendars'), undefined, 'disabling the last calendar kind hides the picker');
assert.deepEqual(rotation.variables.casora_screensaver_calendars, ['calendar.example_b'], 'hiding the picker retains the draft selection');
rotationRow(rotation.box, 'kalender').onclick();
assert.equal(calendarRow(rotation.box, 'calendar.example_b').attributes['aria-pressed'], 'true', 're-showing the picker restores the unchanged selection');

console.log('screensaver_calendar_picker: ok');
