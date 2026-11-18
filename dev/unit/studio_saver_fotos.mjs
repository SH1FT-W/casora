// @deckt: custom_components/casora/panel/casora-panel-settings.js#_csSaverPreview,_csSave,_csDiscardAll
// Studio photo choices in rotation, through the rendered controls and settings save/discard boundary.
//   node dev/unit/studio_saver_fotos.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const copy = (x) => JSON.parse(JSON.stringify(x));
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {};
    this.style = { setProperty() {} }; this.className = ''; this.isConnected = true;
    this.classList = { add: (name) => { this.className += ' ' + name; } };
  }
  set textContent(value) { this.text = String(value); this.children.forEach((c) => { c.parentNode = null; }); this.children = []; }
  get textContent() { return (this.text || '') + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) {
    if (child.parentNode) child.parentNode.children.splice(child.parentNode.children.indexOf(child), 1);
    this.children.push(child); child.parentNode = this; return child;
  }
  append(...children) { children.forEach((c) => this.appendChild(c)); }
  insertBefore(child, before) {
    this.appendChild(child);
    this.children.splice(this.children.indexOf(child), 1);
    this.children.splice(this.children.indexOf(before), 0, child);
  }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  getAttribute(key) { return this.attrs[key]; }
  getRootNode() { return this.parentNode ? this.parentNode.getRootNode() : this.rootNode || null; }
  querySelectorAll(selector) { return byClass(this, selector.slice(1)); }
  focus() { (this.getRootNode() || document).activeElement = this; }
}
const all = (root, predicate) => root.children.flatMap((c) => [ ...(predicate(c) ? [c] : []), ...all(c, predicate) ]);
const byClass = (root, name) => all(root, (e) => e.className.split(/\s+/).includes(name));
const timers = new Map();
const document = { createElement: (tag) => new Element(tag), activeElement: null };
class Panel {
  _markDirty() {}
}
const win = { matchMedia: () => ({ matches: false }) };
const context = vm.createContext({
  window: win, console, Intl, Date, Math, JSON,
  document,
  customElements: { whenDefined: () => Promise.resolve(), get: () => Panel },
  setInterval: (fn) => { const id = timers.size + 1; timers.set(id, fn); return id; },
  clearInterval: (id) => timers.delete(id),
  location: { search: '', pathname: '/' },
});
vm.runInContext(read('custom_components/casora/scripts/local/46-screensaver.js'), context);
// Rendering the animated preview is a separate seam; keep the real selection/vars APIs.
win._casoraSaver.mount = () => ({ update() {}, destroy() {} });
vm.runInContext(read('custom_components/casora/panel/casora-panel-settings.js'), context);
await new Promise((resolve) => setImmediate(resolve));

function studio(variables = {}, images = ['room-a', 'room-b']) {
  let saved = { compact: { rooms: images.map((image, i) => ({
    name: 'Room ' + (i + 1), variables: { image, ...copy(variables) },
  })) } };
  // A room without an image is still a valid dashboard.
  if (!images.length) saved.compact.rooms.push({ name: 'Room', variables: copy(variables) });
  const p = new Panel();
  p._state = copy(saved); p._hass = { states: {} }; p._cs = {};
  const mirrors = [];
  p._mirrorToPair = (key, value) => { mirrors.push([key, copy(value === undefined ? null : value)]); };
  let writes = 0;
  p._isDirty = () => JSON.stringify(p._state) !== JSON.stringify(saved);
  p._csRepaint = () => {}; p._status = () => {};
  p._markDirty = () => { p._csDashTouched = true; };
  // Mock only the dashboard persistence boundary, not the settings save/discard controls.
  p._save = async () => { writes++; saved = copy(p._state); return true; };
  p._csLoad = async () => {};
  p._discardDraft = () => {};
  p._load = async () => { p._state = copy(saved); };
  let root;
  const render = () => {
    timers.clear();
    root = new Element('section');
    root.rootNode = { activeElement: null };
    const card = new Element('article'); root.appendChild(card);
    p._csSaverPreview(root, card);
  };
  p._csRender = render;
  render();
  return {
    p, mirrors, render, root: () => root, saved: () => copy(saved), writes: () => writes,
    photos: () => byClass(root, 'cs-saver-photo'),
    chip: (id) => byClass(root, 'cs-saver-chip').find((e) => e.dataset.kind === id).onclick(),
    participation: (id) => byClass(root, 'cs-saver-row').find((e) => e.dataset.id === id).onclick(),
  };
}

const s = studio();
assert.equal(s.photos().length, 2, 'default rotation exposes photo selection');
const wrap = byClass(s.root(), 'cs-saver')[0];
const order = all(wrap, () => true);
assert.ok(order.indexOf(byClass(wrap, 'cs-saver-list')[0]) < order.indexOf(byClass(wrap, 'cs-saver-grid')[0]),
  'photo grid follows rotation participation choices');
assert.equal(byClass(s.root(), 'cs-saver-grid').length, 1, 'only one grid');
assert.ok(s.photos().every((e) => e.tagName === 'BUTTON' && e.type === 'button'), 'native keyboard controls');
assert.deepEqual(s.photos().map((e) => e.getAttribute('aria-pressed')), ['true', 'true'], 'all photos initially selected');
s.photos()[0].focus();
s.photos()[0].onclick();
assert.ok(s.root().rootNode.activeElement === s.photos()[0], 'photo activation retains shadow-root keyboard focus on the redrawn choice');
assert.deepEqual(copy(s.p._state.compact.rooms[0].variables.casora_screensaver_photos), ['room-a'], 'first tap selects one');
assert.deepEqual(s.mirrors.at(-1), ['casora_screensaver_photos', ['room-a']], 'photo selection delegates paired-dashboard mirroring');
assert.deepEqual(s.photos().map((e) => e.getAttribute('aria-pressed')), ['true', 'false']);
assert.equal(s.writes(), 0, 'editing photo choices does not save');
assert.equal(s.saved().compact.rooms[0].variables.casora_screensaver_photos, undefined, 'saved Dashboard stays unchanged');
s.participation('fotos');
assert.equal(s.photos().length, 0, 'excluded Photos hides the grid');
assert.equal(s.mirrors.at(-1)[0], 'casora_screensaver_mix', 'participation delegates paired-dashboard mirroring');
assert.deepEqual(copy(s.p._state.compact.rooms[0].variables.casora_screensaver_photos), ['room-a'], 'exclusion retains selection');
s.participation('fotos');
assert.deepEqual(s.photos().map((e) => e.getAttribute('aria-pressed')), ['true', 'false'], 're-inclusion restores selection');
for (const kind of ['fotos', 'wort', 'mix', 'fotos', 'mix']) {
  s.chip(kind);
  assert.equal(s.photos().length, kind === 'wort' ? 0 : 2, 'visibility for ' + kind);
  assert.deepEqual(copy(s.p._state.compact.rooms[0].variables.casora_screensaver_photos), ['room-a'], 'switching retains selection');
}
s.photos()[1].onclick();
assert.deepEqual(copy(s.p._state.compact.rooms[0].variables.casora_screensaver_photos), ['room-a', 'room-b'], 'multiple photos can be picked');
s.photos()[0].onclick();
assert.deepEqual(copy(s.p._state.compact.rooms[0].variables.casora_screensaver_photos), ['room-b']);
s.photos()[1].onclick();
assert.equal(s.p._state.compact.rooms[0].variables.casora_screensaver_photos, undefined, 'last deselection restores all');
assert.deepEqual(s.photos().map((e) => e.getAttribute('aria-pressed')), ['true', 'true']);
assert.ok(s.p._state.compact.rooms.every((r) => !r.variables.casora_screensaver_photos), 'all room settings agree');

// The actual settings bar delegates save/load to the dashboard persistence boundary.
s.photos()[1].onclick();
s.participation('fotos');
await s.p._csDiscardAll();
s.render();
assert.equal(s.writes(), 0, 'discard never saves');
assert.deepEqual(s.photos().map((e) => e.getAttribute('aria-pressed')), ['true', 'true'], 'discard restores participation and photos');
s.photos()[1].onclick();
s.participation('fotos');
assert.equal(await s.p._csSave(), true, 'settings bar saves dashboard draft');
assert.equal(s.writes(), 1);
assert.deepEqual(s.saved().compact.rooms[0].variables.casora_screensaver_photos, ['room-b']);
await s.p._load();
s.render();
assert.equal(s.photos().length, 0, 'saved exclusion survives reopening');
s.participation('fotos');
assert.deepEqual(s.photos().map((e) => e.getAttribute('aria-pressed')), ['false', 'true'], 'saved photo choice survives reopening');

const emptyText = 'No room photos available. Add a photo to a room.';
for (const kind of ['mix', 'fotos', 'wort']) {
  const empty = studio(kind === 'mix' ? {} : { casora_screensaver_kind: kind }, []);
  assert.equal(empty.photos().length, 0, 'no photos for an empty dashboard');
  assert.equal(empty.root().textContent.includes(emptyText), kind !== 'wort', 'empty-state visibility for ' + kind);
  if (kind === 'mix') {
    empty.participation('fotos');
    assert.equal(empty.root().textContent.includes(emptyText), false, 'excluded empty Photos has no explanation');
    empty.participation('fotos');
    assert.equal(empty.root().textContent.includes(emptyText), true, 'empty explanation returns on re-inclusion');
  }
}
const excluded = studio({ casora_screensaver_mix: ['wort'], casora_screensaver_photos: ['room-b'] });
assert.equal(excluded.photos().length, 0, 'explicit rotation without Photos has no grid');
excluded.chip('fotos');
assert.deepEqual(excluded.photos().map((e) => e.getAttribute('aria-pressed')), ['false', 'true'], 'single Photos ignores rotation exclusions');
const duplicate = studio({}, ['room-a', 'room-a']);
assert.equal(duplicate.photos().length, 1, 'shared room photos are not duplicated');
const elsewhere = new Element('button');
duplicate.root().rootNode.activeElement = elsewhere;
duplicate.photos()[0].onclick();
assert.equal(duplicate.root().rootNode.activeElement, elsewhere, 'photo redraw does not steal unrelated focus');
const approved = {
  de: 'Keine Raumfotos vorhanden. Füge einem Raum ein Foto hinzu.',
  en: emptyText,
  nl: 'Geen kamerfoto’s beschikbaar. Voeg een foto toe aan een kamer.',
};
for (const lang of ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb']) {
  const source = JSON.parse(read('custom_components/casora/translations/panel/' + lang + '.json')).exact;
  const text = source[emptyText] || (lang === 'en' ? emptyText : '');
  assert.ok(text, lang + ' empty-state translation exists');
  if (approved[lang]) assert.equal(text, approved[lang], lang + ' wording matches the agreement');
  if (lang !== 'en') assert.notEqual(text, emptyText, lang + ' does not copy English');
  // English is the source-text fallback, not a separate lazy-loaded dictionary.
  if (lang !== 'en') {
    const built = JSON.parse(read('custom_components/casora/panel/i18n/' + lang + '.json')).exact;
    assert.equal(built[emptyText], text, lang + ' built translation matches source');
  }
}
console.log('studio_saver_fotos: visibility, selection, empty state, settings save/discard OK');
