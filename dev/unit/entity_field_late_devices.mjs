// Issue #25: right after an HA restart the Studio inspector was drawn before Tractive had its device_trackers.
// The pet field kept its empty list ("No match") until the tile was selected again, and as a plain text
// field it took any typed text (the pet's name) as the tile's entity on blur.
// Expected: _combo with opts.source reads the list again on open (desktop menu, typing, phone sheet) once
// hass has changed; opts.entity makes it a device field while the list is still empty (typed text that is
// no entity is not committed; the phone sheet offers typed text only as an entity ID and finds the pet by
// name); the chosen device's face follows. Other callers are unchanged, except that every device field's
// phone sheet follows the same typed-text rule.
//   node dev/unit/entity_field_late_devices.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};

// ── Load the real panel class ────────────────────────────────────────────────
let Panel = null;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = globalThis;
globalThis.location = { pathname: '/' };
// Reduced motion: menus open and close without animations.
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.HTMLElement = class {};
globalThis.innerWidth = 1400;
globalThis.innerHeight = 900;
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, setItem: noop, removeItem: noop }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
const src = read('custom_components/casora/panel/casora-panel.js');
new Function(fix(src))();
console.info = info;
assert.ok(Panel, 'panel class');
const P = Panel.prototype;

// ── Minimal DOM: enough for the combobox and its menu ───────────────────────
const mk = (tag) => {
  const cls = new Set();
  const el = {
    tagName: String(tag).toUpperCase(), children: [], attributes: {}, style: { setProperty: noop },
    parentNode: null, textContent: '', title: '', value: '', placeholder: '', readOnly: false,
    get className() { return [...cls].join(' '); },
    set className(v) { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => cls.add(c)); },
    classList: { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)),
      toggle: (c, on) => ((on === undefined ? !cls.has(c) : on) ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
    get innerHTML() { return ''; },
    set innerHTML(v) { el.children.forEach((c) => { c.parentNode = null; }); el.children = []; },
    get firstChild() { return el.children[0] || null; },
    get nextSibling() { const p = el.parentNode; return p ? p.children[p.children.indexOf(el) + 1] || null : null; },
    get parentElement() { return el.parentNode; },
    appendChild(c) {
      if (c.fragment) { c.children.slice().forEach((x) => el.appendChild(x)); return c; }
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = el;
      el.children.push(c);
      return c;
    },
    insertBefore(c, ref) {
      if (c.parentNode) c.parentNode.removeChild(c);
      const i = el.children.indexOf(ref);
      c.parentNode = el;
      el.children.splice(i < 0 ? el.children.length : i, 0, c);
      return c;
    },
    removeChild(c) { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); c.parentNode = null; return c; },
    querySelectorAll(sel) {
      const want = sel.replace(/^\./, '');
      const out = [];
      const walk = (n) => n.children.forEach((c) => { if (c.classList && c.classList.contains(want)) out.push(c); walk(c); });
      walk(el);
      return out;
    },
    querySelector(sel) { return el.querySelectorAll(sel)[0] || null; },
    closest: () => null,
    getBoundingClientRect: () => ({ left: 10, top: 10, right: 210, bottom: 40, width: 200, height: 30 }),
    setAttribute(k, v) { el.attributes[k] = String(v); },
    getAttribute(k) { return k in el.attributes ? el.attributes[k] : null; },
    addEventListener: noop, removeEventListener: noop, focus: noop, blur: noop, select: noop,
    remove() { if (el.parentNode) el.parentNode.removeChild(el); },
    click() { if (el.onclick) el.onclick(); },
  };
  return el;
};
globalThis.document = { createElement: mk, createTextNode: (t) => ({ textContent: t }), querySelector: () => null, addEventListener: noop, removeEventListener: noop,
  createDocumentFragment: () => Object.assign(mk('#fragment'), { fragment: true }) };

// ── A house before and after Tractive has set up ─────────────────────────────
const st = (id, state, attributes) => ({ entity_id: id, state, attributes });
const A = 'device_tracker.tracker_aaaa', B = 'device_tracker.tracker_bbbb';
const registry = {
  entities: {
    [A]: { entity_id: A, device_id: 'hwA', platform: 'tractive' },
    [B]: { entity_id: B, device_id: 'hwB', platform: 'tractive' },
  },
  // As in HA: the tracker sits on the tracker hardware, the pet device hangs on it via via_device.
  devices: {
    hwA: { id: 'hwA', name: 'Tracker AAAA' }, petA: { id: 'petA', name: 'Pet A', via_device_id: 'hwA' },
    hwB: { id: 'hwB', name: 'Tracker BBBB' }, petB: { id: 'petB', name: 'Pet B', via_device_id: 'hwB' },
  },
};
const base = { 'light.hall': st('light.hall', 'on', { friendly_name: 'Hall' }), 'sensor.temp': st('sensor.temp', '21', { friendly_name: 'Temperature' }) };
const hassBefore = () => ({ states: { ...base }, entities: {}, devices: {}, areas: {}, language: 'en' });
const hassAfter = () => ({ states: { ...base,
  [A]: st(A, 'home', { friendly_name: 'Tracker AAAA', source_type: 'gps' }),
  [B]: st(B, 'not_home', { friendly_name: 'Tracker BBBB', source_type: 'gps' }) }, ...registry, areas: {}, language: 'en' });

function panelWith(hass) {
  const p = Object.create(P);
  const overlay = mk('div');
  p._hass = hass;
  p.overlay = overlay;
  p.$ = (id) => (id === 'overlay' ? overlay : null);
  p.shadowRoot = { activeElement: null, querySelector: () => null };
  p._openCombo = null;
  return p;
}
// The inspector's source: every device_tracker, only the Tractive ones once there are any.
const petSource = (p) => () => {
  const all = Object.keys(p._hass.states).filter((e) => e.startsWith('device_tracker.')).sort();
  const pets = all.filter((e) => p._hass.entities[e] && p._hass.entities[e].platform === 'tractive');
  return pets.length ? pets : all;
};
const make = (p, value, list, onChange, opts) => P._combo.call(p, value, list, 'Choose your pet', onChange, opts);
const menuOf = (p) => p.overlay.children[0] || null;
const opts = (p) => (menuOf(p) ? menuOf(p).querySelectorAll('.combo-opt').map((d) => d.title || d.querySelector('.lbl').textContent) : null);
const empty = (p) => !!(menuOf(p) && menuOf(p).querySelector('.combo-empty'));
const focus = (input) => input.onfocus();
const blur = (p, input) => { input.onblur(); if (p._openCombo) p._openCombo(); };
const type = (input, text) => { input.value = text; input.oninput(); };

// ── A: the list follows hass without drawing the field again ─────────────────
{
  const p = panelWith(hassBefore());
  const picked = [];
  const src0 = petSource(p);
  const { wrap, input } = make(p, '', src0(), (v) => picked.push(v), { source: src0, entity: true });
  assert.ok(wrap.classList.contains('hasent'), 'device field while the list is still empty');
  focus(input);
  assert.ok(empty(p), 'nothing to choose yet');
  assert.equal(input.placeholder, 'Search by name, room or ID', 'search placeholder of a device field');
  blur(p, input);
  p._hass = hassAfter();
  focus(input);
  assert.deepEqual(opts(p), [A, B], 'opening again lists both trackers');
  const rows = menuOf(p).querySelectorAll('.combo-opt').map((d) => [d.querySelector('.lbl').textContent, d.querySelector('.sub').textContent]);
  assert.deepEqual(rows, [['Pet A', 'Tracker AAAA'], ['Pet B', 'Tracker BBBB']], 'pet name, the tracker below');
  menuOf(p).querySelectorAll('.combo-opt')[1].onmousedown({ preventDefault: noop });
  assert.deepEqual(picked, [B], 'a tracker from the new list can be picked');
  console.log('ok late devices: menu');
}

// ── B: typing filters the new list; the field keeps hass identity as its cache key ──
{
  const p = panelWith(hassBefore());
  let calls = 0;
  const src0 = petSource(p);
  const counted = () => { calls++; return src0(); };
  const { input } = make(p, '', src0(), noop, { source: counted, entity: true });
  focus(input);
  type(input, 'pet');
  assert.equal(calls, 0, 'hass unchanged: the list is not read again');
  p._hass = hassAfter();
  type(input, 'pet b');
  assert.equal(calls, 1, 'hass changed: read once');
  assert.deepEqual(opts(p), [B], 'typing filters the new list (by pet name)');
  type(input, 'pet');
  assert.equal(calls, 1, 'not again for the next key');
  blur(p, input);
  console.log('ok late devices: typing');
}

// ── C: typed text is no entity: nothing is committed ─────────────────────────
{
  const p = panelWith(hassBefore());
  const picked = [];
  const src0 = petSource(p);
  const { input } = make(p, '', src0(), (v) => picked.push(v), { source: src0, entity: true });
  focus(input);
  type(input, 'Bello');
  input.onkeydown({ key: 'Enter', preventDefault: noop, stopPropagation: noop });
  blur(p, input);
  assert.deepEqual(picked, [], 'search text is not taken as the entity (blur, Enter)');
  assert.equal(input.value, '', 'the field goes back to its value (empty)');
  // A unique pet name typed while Tractive came up still finds its tracker.
  focus(input);
  type(input, 'Pet A');
  p._hass = hassAfter();
  blur(p, input);
  assert.deepEqual(picked, [A], 'a unique name of the new list is taken');
  // Without opts.entity an empty list stays a text field, as before.
  const q = panelWith(hassBefore());
  const typed = [];
  const plain = make(q, '', [], (v) => typed.push(v));
  assert.ok(!plain.wrap.classList.contains('hasent'), 'plain field without the option');
  focus(plain.input);
  type(plain.input, 'Bello');
  blur(q, plain.input);
  assert.deepEqual(typed, ['Bello'], 'a text combo still takes typed text');
  console.log('ok late devices: free text');
}

// ── D: the chosen device's face follows ──────────────────────────────────────
{
  const p = panelWith(hassBefore());
  const src0 = petSource(p);
  const { wrap, input } = make(p, A, src0(), noop, { source: src0, entity: true });
  assert.ok(wrap.classList.contains('gone'), 'tracker not there yet: "Device missing"');
  p._hass = hassAfter();
  focus(input);
  blur(p, input);
  assert.ok(!wrap.classList.contains('gone') && wrap.classList.contains('hasface'), 'face repainted');
  assert.equal(wrap.querySelector('.fn').textContent, 'Pet A', 'shows the pet');
  console.log('ok late devices: face');
}

// ── E: phone sheet gets the new list ─────────────────────────────────────────
{
  globalThis.innerWidth = 390;
  globalThis.innerHeight = 800;
  const p = panelWith(hassBefore());
  let sheet = null;
  p._pickSheet = (o) => { sheet = o; };
  p._menuAt = (anchor, items) => { sheet = { list: items.map((x) => x.id) }; };
  const src0 = petSource(p);
  const { input } = make(p, '', src0(), noop, { source: src0, entity: true });
  input.onclick();
  assert.deepEqual(sheet.list, [], 'empty before');
  p._hass = hassAfter();
  input.onclick();
  assert.deepEqual(sheet.list, [A, B], 'phone sheet lists both trackers');
  // A fixed chooser with a source (phone menu) as well.
  const q = panelWith(hassBefore());
  q._menuAt = p._menuAt;
  const src1 = petSource(q);
  const fx = P._combo.call(q, '', src1(), '', noop, { fixed: true, source: src1 });
  q._hass = hassAfter();
  fx.input.onclick();
  assert.deepEqual(sheet.list, [A, B], 'phone menu of a fixed chooser');
  globalThis.innerWidth = 1400;
  globalThis.innerHeight = 900;
  console.log('ok late devices: phone');
}

// ── F: callers without the options behave as before ──────────────────────────
{
  // Populated device field: its list stays as drawn.
  const p = panelWith(hassBefore());
  const picked = [];
  const { wrap, input } = make(p, '', ['light.hall', 'sensor.temp'], (v) => picked.push(v));
  assert.ok(wrap.classList.contains('hasent'));
  p._hass = hassAfter();
  focus(input);
  assert.deepEqual(opts(p), ['light.hall', 'sensor.temp'], 'list as given');
  type(input, 'Bello');
  blur(p, input);
  assert.deepEqual(picked, [], 'search text not taken, as before');
  focus(input);
  type(input, 'light.kitchen');
  blur(p, input);
  assert.deepEqual(picked, ['light.kitchen'], 'an ID-shaped text is taken, as before');
  // Select (fixed chooser) and icon picker: no device field.
  const sel = P._combo.call(p, 'a', ['a', 'b'], '', (v) => picked.push(v), { fixed: true, labels: { a: 'First', b: 'Second' } });
  assert.ok(!sel.wrap.classList.contains('hasent') && sel.input.readOnly, 'select stays a chooser');
  sel.input.onclick();
  assert.deepEqual(menuOf(p).querySelectorAll('.combo-opt').map((d) => d.querySelector('.lbl').textContent), ['First', 'Second']);
  menuOf(p).querySelectorAll('.combo-opt')[1].onmousedown({ preventDefault: noop });
  assert.equal(picked.at(-1), 'b');
  const icons = ['Default', 'lightbulb', 'sofa'];
  const ic = P._combo.call(p, '', icons, 'default', (v) => picked.push(v), { icon: true });
  assert.ok(!ic.wrap.classList.contains('hasent'), 'icon picker is no device field');
  focus(ic.input);
  const label = menuOf(p).querySelectorAll('.combo-opt')[2].querySelector('.lbl').textContent;
  type(ic.input, label);
  blur(p, ic.input);
  assert.equal(picked.at(-1), 'sofa', 'a typed icon name means its icon, as before');
  console.log('ok late devices: other combos');
}

// ── G: the inspector's main field passes its list as a source ────────────────
{
  const at = src.indexOf('const entCombo = this._combo(tile.entity');
  assert.ok(at > 0, 'main field');
  const head = src.slice(src.lastIndexOf('const entOptions = () => {', at), at);
  assert.ok(head.includes('this._rankedEntityList(type.domains, type.classes, room, tile.entity)'), 'ranked list');
  assert.ok(/isPetTracker\(this\._hass, e\)/.test(head), 'pet filter inside the source');
  const end = src.indexOf('const entityLabel = ', at);
  assert.ok(src.slice(at, end).includes('{ source: entOptions, entity: true }'), 'source and entity passed (also own-data tiles)');
  console.log('ok late devices: inspector');
}

// ── H: phone sheet: typed text only as an entity ID in a device field ────────
{
  globalThis.innerWidth = 390;
  globalThis.innerHeight = 800;
  const phone = (hass) => {
    const p = panelWith(hass);
    p._trace = noop;
    p._scrollSnap = () => null;
    p._restoreScroll = noop;
    return p;
  };
  const sheetOf = (p) => p.overlay.querySelector('.psheet');
  const search = (p, text) => {
    const q = sheetOf(p).querySelector('.psheet-search').children[0];
    q.value = text;
    q.oninput();
    return q;
  };
  const rows = (p) => sheetOf(p).querySelectorAll('.psheet-row').map((r) => r.querySelector('.lbl').textContent);
  const enter = (q) => q.onkeydown({ key: 'Enter' });

  // Empty pet field (Tractive not up yet): the pet's name is no entity.
  const p = phone(hassBefore());
  const picked = [];
  const src0 = petSource(p);
  const { input } = make(p, '', src0(), (v) => picked.push(v), { source: src0, entity: true });
  input.onclick();
  const q0 = search(p, 'Grelo');
  assert.deepEqual(rows(p), [], 'no "Use" row for a name');
  enter(q0);
  assert.deepEqual(picked, [], 'Enter takes nothing');
  enter(search(p, 'device_tracker.tracker_cccc'));
  assert.deepEqual(picked, ['device_tracker.tracker_cccc'], 'an entity ID can still be typed');
  assert.equal(sheetOf(p), null, 'sheet closed');
  // Once Tractive is up the sheet lists the trackers, found by the pet's name.
  p._hass = hassAfter();
  input.onclick();
  search(p, 'Pet B');
  assert.deepEqual(rows(p), ['Pet B'], 'found by name');
  sheetOf(p).querySelector('.psheet-row').click();
  assert.equal(picked.at(-1), B, 'picked from the new list');

  // Populated device field without the options: same rule.
  const q = phone(hassBefore());
  const got = [];
  const dev = make(q, '', ['light.hall', 'sensor.temp'], (v) => got.push(v));
  dev.input.onclick();
  search(q, 'Bello');
  assert.deepEqual(rows(q), [], 'no "Use" row for a name');
  search(q, 'light.kitchen');
  assert.ok(rows(q).includes('Use “light.kitchen”'), 'an entity ID is offered');
  sheetOf(q).querySelector('.psheet-cancel').onclick();

  // A text combo (no device field) still offers typed text.
  const r = phone(hassBefore());
  const said = [];
  const txt = make(r, '', ['morning', 'evening'], (v) => said.push(v));
  txt.input.onclick();
  enter(search(r, 'noon'));
  assert.deepEqual(said, ['noon'], 'typed text taken in a text combo');
  globalThis.innerWidth = 1400;
  globalThis.innerHeight = 900;
  console.log('ok late devices: phone free text');
}
