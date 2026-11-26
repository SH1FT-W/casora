// u05-09 follow-up (review 26.11.2026): the open badge row is per device (casora-core _casoraRow), so a fresh browser
// shows 'none' for a value a person left on input_select.casora_expanded_row. The QA tools that open a row skipped
// their select_option when HA's raw state already held the wanted value (popup-galerie setRow, inpage uiSet), and
// bildvergleich's fakeExpanded kept the old context (with user_id) and last_changed, so the row stayed closed: missing
// sub-badges in the gallery, false diffs in the 'aufgeklappt_*' comparison images. Checked here against the real
// _casoraRow module with invented ids.
//   node dev/unit/qa_expanded_row_tools.mjs
// @deckt: dev/qa/inpage.js#uiSet
// @deckt: dev/qa/popup-galerie.mjs#setRow
// @deckt: dev/qa/bildvergleich.mjs#fakeExpanded
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const a = core.indexOf('(function () {\n  if (window._casoraRow) return;');
assert.ok(a > -1, '_casoraRow module');
const rowMod = core.slice(a, core.indexOf('\n})();\n', a) + 6);

const E = 'input_select.casora_expanded_row';
const T0 = Date.now() - 60000;
// A browser: fresh localStorage, HA's raw helper left on `state` by another person.
const browser = (state) => {
  const win = {}, store = new Map();
  const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  new Function('window', 'localStorage', rowMod)(win, ls);
  const conn = { sendMessagePromise(msg) { return Promise.resolve(msg); } };
  const ha = {
    hass: {
      states: { [E]: { entity_id: E, state, last_changed: new Date(T0).toISOString(), attributes: {},
        context: { id: 'c0', user_id: 'someone_else', parent_id: null } } },
      connection: conn,
      callService(domain, service, service_data) { return this.connection.sendMessagePromise({ type: 'call_service', domain, service, service_data }); },
    },
    _updateHass(p) { this.hass = Object.assign({}, this.hass, p); },
  };
  const document = { querySelector: (s) => (s === 'home-assistant' ? ha : null) };
  const shown = () => win._casoraRow.apply(ha.hass, null).states[E].state;
  assert.equal(shown(), 'none', 'precondition: a fresh browser shows another person\'s row closed');
  return { win, ha, document, shown };
};

// 1. inpage.js uiSet: the select_option goes out although HA already holds the value.
{
  const B = browser('lights');
  const w = { fetch: () => Promise.resolve() };
  new Function('window', 'document', 'setInterval', 'setTimeout', 'clearInterval', read('dev/qa/inpage.js'))(
    w, B.document, () => 0, () => 0, () => {});
  await w.__qa.uiSet(E, 'lights');
  assert.equal(B.shown(), 'lights', 'uiSet opens the row on this browser');
}

// 2. popup-galerie setRow: the same.
{
  const B = browser('security');
  const src = read('dev/qa/popup-galerie.mjs');
  const i = src.indexOf('  const setRow = async');
  assert.ok(i > -1, 'setRow in popup-galerie');
  const body = src.slice(i, src.indexOf('await sleep(1600); };', i) + 'await sleep(1600); };'.length);
  const pg = { evaluate: (fn, v) => Promise.resolve(fn(v)) };
  const setRow = new Function('pg', 'sleep', 'document', body + '\nreturn setRow;')(pg, async () => {}, B.document);
  globalThis.document = B.document;
  await setRow('security');
  delete globalThis.document;
  assert.equal(B.shown(), 'security', 'setRow opens the row on this browser');
}

// 3. bildvergleich fakeExpanded: the fake counts as a change by no person, now.
{
  const B = browser('none');
  const src = read('dev/qa/bildvergleich.mjs');
  const i = src.indexOf('async function fakeExpanded');
  assert.ok(i > -1, 'fakeExpanded in bildvergleich');
  const body = src.slice(i, src.indexOf('\nasync function', i + 10));
  const page = { evaluate: (fn, v) => Promise.resolve(fn(v)), waitForTimeout: async () => {} };
  const fakeExpanded = new Function('settle', body + '\nreturn fakeExpanded;')(async () => {});
  globalThis.document = B.document;
  assert.equal(await fakeExpanded(page, 'climate'), true);
  delete globalThis.document;
  assert.equal(B.shown(), 'climate', 'the faked row shows open on this browser');
}
console.log('qa_expanded_row_tools: ok');
