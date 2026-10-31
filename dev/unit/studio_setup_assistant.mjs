// Setup assistant (test 2, G3): E04 a waste schedule gets its waste tile on Home; E10 step and choices survive a
// reload; E11 step 1 says "Continue" while two steps follow; E21 the done page counts like step 1 (Home plus the
// chosen rooms); E22 the dashboard name comes before the rooms.
//   node dev/unit/studio_setup_assistant.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const noop = () => {};
let Panel = null;
const stub = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : stub()), apply: () => stub(), construct: () => stub() });
globalThis.window = globalThis;
globalThis.location = { pathname: '/' };
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q), addEventListener: noop });
globalThis.addEventListener = noop;
globalThis.removeEventListener = noop;
globalThis.setTimeout = () => 0;
globalThis.requestAnimationFrame = () => 0;
globalThis.fetch = () => Promise.reject(new Error('offline'));
globalThis.HTMLElement = class {};
globalThis.innerWidth = 1400;
globalThis.innerHeight = 900;
const store = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, configurable: true });
globalThis.customElements = { get: () => Panel, define: (n, c) => { Panel = c; }, whenDefined: () => new Promise(noop) };
const fix = (s) => s.replace(/import\.meta\.url/g, '"http://x/casora-panel.js?v=0"');
const info = console.info;
console.info = noop;
globalThis.document = stub();
new Function(fix(read('custom_components/casora/panel/casora-panel-types.js')))();
new Function(fix(read('custom_components/casora/panel/casora-panel.js')))();
globalThis.customElements.whenDefined = () => Promise.resolve();
new Function(fix(read('custom_components/casora/panel/casora-panel-basis.js')))();
await new Promise((r) => setImmediate(r));
console.info = info;
const P = Panel.prototype;
const SRC = read('custom_components/casora/panel/casora-panel.js');

// ── E04: waste tile on Home ──────────────────────────────────────────────────
{
  const B = window.casoraBasis;
  const st = (id, state, a) => ({ entity_id: id, state, attributes: { friendly_name: id, ...a } });
  const hass = { states: { 'sensor.bin_organic': st('sensor.bin_organic', '2', { daysTo: 2 }), 'light.k': st('light.k', 'off') },
    entities: { 'sensor.bin_organic': { platform: 'waste_collection_schedule' }, 'light.k': { device_id: 'd', area_id: 'k' } },
    devices: { d: { id: 'd', area_id: 'k' } }, areas: { k: { area_id: 'k', name: 'Kitchen' } }, language: 'en' };
  const p = B.plan(hass, ['Kitchen'], Object.assign({}, B.DEFAULTS));
  const w = p.rooms[0].items.find((x) => x.type === 'casora_trash');
  assert.ok(w && w.on, 'waste tile suggested on Home');
  assert.equal(w.tile.template, 'casora_trash');
  assert.equal(w.tile.entity, '', 'finds its data itself');
  const none = B.plan({ ...hass, states: { 'light.k': hass.states['light.k'] } }, ['Kitchen'], Object.assign({}, B.DEFAULTS));
  assert.ok(!none.rooms[0].items.some((x) => x.type === 'casora_trash'), 'no waste data: no waste tile');
  console.log('ok setup: waste tile on Home');
}

// ── E10: resume after a reload ───────────────────────────────────────────────
{
  const calls = [];
  const p = Object.create(P);
  p._hass = { states: {}, themes: {} };
  p._setupExisting = async () => ({ moves: [], yaml: [], broken: [] });
  p._themeStep = () => calls.push('look');
  p._fontStep = () => calls.push('font');
  p._perfStep = () => calls.push('perf');
  p._createForm = () => calls.push('rooms');
  p._firstRun();
  assert.deepEqual(calls, ['look'], 'nothing saved: starts at the look');
  store.set('casora.setup.progress', JSON.stringify({ ts: Date.now(), look: 'Casora Glas', step: 'font' }));
  calls.length = 0;
  p._firstRun();
  assert.deepEqual(calls, ['font'], 'resumes at the font');
  assert.equal(p._lookPick, 'Casora Glas', 'keeps the chosen look');
  store.set('casora.setup.progress', JSON.stringify({ ts: Date.now() - 2 * 86400000, step: 'perf' }));
  calls.length = 0;
  p._firstRun();
  assert.deepEqual(calls, ['look'], 'old progress is ignored');
  // Saved on every step, cleared when done or restarted.
  assert.ok(/setupSave\(\{ look: pick, step: "font" \}\)/.test(SRC) && /setupSave\(\{ font: pick, step: "perf" \}\)/.test(SRC)
    && /setupSave\(\{ perf: pick, step: "rooms" \}\)/.test(SRC) && /setupSave\(\{ rooms: picked, title, step: "rooms" \}\)/.test(SRC), 'saved per step');
  assert.ok(/_flowDone\(opts\) \{\n\s+const rooms = opts.rooms \|\| \[\];\n\s+setupClear\(\);/.test(SRC), 'cleared when the dashboard is made');
  assert.ok(/savedRooms \? savedRooms\.has\(a\.name\)/.test(SRC), 'picked rooms preselected again');
  console.log('ok setup: resume');
}

// ── E11 / E22: step 1 ────────────────────────────────────────────────────────
{
  const i = SRC.indexOf('async _createForm(o)');
  const body = SRC.slice(i, SRC.indexOf('async _create(url_path', i));
  assert.ok(/_flowButton\(s\.acts, typeof this\._fillStep === "function" \? "Continue" : "Create Dashboard"/.test(body), 'E11: Continue while steps follow');
  assert.ok(/s\.body\.insertBefore\(dash\.parentNode, head\)/.test(body), 'E22: name before the rooms');
  console.log('ok setup: step 1');
}

// ── E21: done page counts Home plus the chosen rooms ─────────────────────────
{
  let lede = null;
  const p = Object.create(P);
  p._hass = { user: { is_admin: false }, callWS: async () => ({}) };
  p._flowScreen = (o) => { lede = o.lede; return { box: stub(), body: stub(), acts: stub() }; };
  p._livePreview = noop;
  p._flowGroup = () => stub();
  p._flowRow = () => stub();
  p._flowButton = noop;
  const rooms = [{ path: 'home' }, { path: 'a' }, { path: 'b' }];
  p._flowDone({ title: 'Casora', url_path: 'casora-x', rooms });
  assert.equal(lede, '“Casora” is in the sidebar with Home and 2 rooms.', 'same count as "2 rooms selected"');
  p._flowDone({ title: 'Old', url_path: 'old', rooms, fromYaml: true });
  assert.ok(/with 3 rooms\. /.test(lede), 'an import counts every room');
  const de = JSON.parse(read('custom_components/casora/translations/panel/de.json'));
  const pat = de.patterns.find((x) => new RegExp(x[0]).test('“Casora” is in the sidebar with Home and 2 rooms.'));
  assert.ok(pat && /Zuhause und \{2\} Räumen/.test(pat[1]), 'German text');
  console.log('ok setup: done page');
}

// ── T11: the done page's live preview looks for HA's error stand-ins and reloads once ──
{
  const has = window.__casoraPanelInternals.previewHasError;
  const el = (tag, kids, shadow, hidden) => ({ localName: tag, getClientRects: () => (hidden ? [] : [1]),
    shadowRoot: shadow ? { querySelectorAll: () => shadow } : null, kids });
  const doc = (list) => ({ querySelectorAll: () => list });
  const badge = el('hui-error-badge');
  assert.equal(has(doc([el('home-assistant', null, [el('hui-root', null, [el('div'), badge])])])), true, 'error badge inside shadow roots');
  assert.equal(has(doc([el('home-assistant', null, [el('hui-root', null, [el('div')])])])), false, 'clean dashboard');
  assert.equal(has(doc([el('hui-error-card', null, null, true)])), false, 'hidden error card does not count');
  const i = SRC.indexOf('_livePreview(box, url, w, h, top) {');
  const lp = SRC.slice(i, SRC.indexOf('_safeArea(f, top, bottom) {', i));
  assert.ok(/previewHasError\(f\.contentDocument\)/.test(lp) && /f\._casoraReloaded = true;/.test(lp) && /location\.reload\(\)/.test(lp), 'reloads once');
  console.log('ok setup: done page preview reloads on a config error');
}
