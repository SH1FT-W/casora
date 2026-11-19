// @deckt: custom_components/casora/scripts/local/50-waste-out.js dashboards/casora/button_card_templates.json#casora_trash
// Issue #211: on the pickup day (tile active) a tap on the waste tile's icon confirms „put out“; the tile then hides
// until the next pickup, on every device (list kept by the integration, casora/waste_out/*). The popup has the same
// as a switch row „Rausgestellt“ (also the way back). Before or after that, the icon does what a tile tap does.
//   node dev/unit/waste_out.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const TPL = JSON.parse(read('dashboards/casora/button_card_templates.json')).casora_trash;
const body = (s) => s.replace(/^\s*\[\[\[/, '').replace(/\]\]\]\s*$/, '');

const store = {};
const listeners = {};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
globalThis.document = { querySelector: () => null };
window.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
const kicks = [];
window.casoraKickAll = (reason, filter) => kicks.push({ reason, filter });
const notices = [];
window.casoraNotice = (d) => notices.push(d);
window._casoraUI = { group: (rows) => '<div class="hui-row">' + rows.map((r) => r.label + '|' + r.sub + '|' + r.endHtml).join('') + '</div>' };
let W = null;
window.casoraDevice = { waste: () => W };
new Function(read('custom_components/casora/scripts/local/50-waste-out.js'))();
const O = window._casoraWasteOut;

// Fake connection: records sent messages, keeps the subscriber to push from the "server".
const sent = [];
let push = null, failNext = false;
const hass = { connection: {
  subscribeMessage: (cb, m) => { sent.push(m); push = cb; return Promise.resolve(() => {}); },
  sendMessagePromise: (m) => { sent.push(m); return failNext ? Promise.reject(new Error('x')) : Promise.resolve({ rows: O.rows() }); },
} };
const tick = () => new Promise((r) => setTimeout(r, 0));

const day = (n) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const iso = (n) => { const d = day(n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// ── key: only while the tile is active (today / tomorrow, on duty) ──
W = { days: 0, duty: null, next: { label: 'Restmüll', color: '#888' }, bins: [] };
assert.equal(O.key(W), iso(0) + '|restmüll', 'today');
assert.equal(O.key({ ...W, days: 1 }), iso(1) + '|restmüll', 'the evening before: tomorrow’s pickup');
assert.equal(O.key({ ...W, days: 2 }), null, 'in 2 days: nothing to confirm');
assert.equal(O.key({ ...W, duty: false }), null, 'not on duty: tile inactive, nothing to confirm');
assert.equal(O.key({ ...W, next: null, days: null }), null, 'no pickup');
assert.equal(O.key({ ...W, next: { label: 'Bio + Papier' } }), iso(0) + '|bio + papier', 'two bins on one day: one key');

// ── icon tap: due → javascript action; confirm hides the tile and offers undo ──
const vars = {};
const iconAction = () => new Function('hass', 'variables', body(TPL.icon_tap_action.action))(hass, vars);
const hidden = () => new Function('hass', 'variables', body(TPL.hidden))(hass, vars);
assert.equal(iconAction(), 'javascript', 'pickup day: the icon confirms');
assert.equal(sent[0] && sent[0].type, 'casora/waste_out/subscribe', 'subscribes to the shared list');
assert.equal(hidden(), false, 'not confirmed yet: tile visible');
new Function('hass', 'variables', body(TPL.icon_tap_action.javascript))(hass, vars);
await tick();
assert.deepEqual(sent.filter((m) => m.type === 'casora/waste_out/set').pop(), { type: 'casora/waste_out/set', key: iso(0) + '|restmüll', out: true });
assert.equal(hidden(), true, 'confirmed: tile hidden');
assert.equal(iconAction(), 'none', 'confirmed: the icon opens the popup like the tile');
assert.ok(kicks.length && kicks[kicks.length - 1].filter({ _config: { template: ['casora_trash'] } }), 'waste tiles redraw');
assert.ok(!kicks[kicks.length - 1].filter({ _config: { template: 'casora_light' } }), 'other tiles do not');
const n = notices.pop();
assert.equal(n.message, 'Müll ist rausgestellt');
assert.equal(n.action.text, 'Rückgängig');
assert.ok(JSON.parse(store.casora_waste_out).rows[iso(0) + '|restmüll'] > 0, 'cached for the first paint');

// ── undo from the notice ──
n.action.action();
await tick();
assert.deepEqual(sent.filter((m) => m.type === 'casora/waste_out/set').pop().out, false);
assert.equal(hidden(), false, 'undo: tile back');

// ── another device confirmed: the push hides the tile here too ──
push({ rows: { [iso(0) + '|restmüll']: Date.now() } });
assert.equal(hidden(), true, 'shared: confirmation from another device hides the tile');
// The next pickup has another key: the tile comes back by itself.
W = { days: 0, duty: null, next: { label: 'Papier', color: '#36f' }, bins: [] };
assert.equal(hidden(), false, 'next pickup (other bin/date): tile visible again');
W = { days: 0, duty: null, next: { label: 'Restmüll', color: '#888' }, bins: [] };

// ── enabled: false and show_when still work (template hidden replaces casora_entity's) ──
assert.equal(new Function('hass', 'variables', body(TPL.hidden))(hass, { enabled: false }), true, 'switched off tile stays hidden');
push({ rows: {} });
assert.equal(new Function('hass', 'variables', body(TPL.hidden))(hass, { show_when: 'active', idle: true }), true, 'show_when/idle kept');
// Without the module (Studio preview) nothing hides.
const keep = window._casoraWasteOut; delete window._casoraWasteOut;
assert.equal(new Function('hass', 'variables', body(TPL.hidden))(hass, {}), false, 'no module: visible');
assert.equal(new Function('hass', 'variables', body(TPL.icon_tap_action.action))(hass, {}), 'none', 'no module: icon like the tile');
window._casoraWasteOut = keep;

// ── failed save: back to before, a notice says so ──
failNext = true;
await O.set(hass, iso(0) + '|restmüll', true);
failNext = false;
assert.equal(hidden(), false, 'not saved: tile stays');
assert.equal(notices.pop().message, 'Hat nicht geklappt');

// ── popup row: switch with the pickup's key, flips on tap ──
const html = O.rowHtml(hass, W);
assert.match(html, /data-casora-wasteout="[^"]*\|restmüll"/, 'switch carries the key');
assert.match(html, /Rausgestellt\|Restmüll · Heute\|/, 'row: label and pickup');
assert.match(html, /aria-checked="false"/);
assert.equal(O.rowHtml(hass, { ...W, days: 3 }), '', 'nothing due: no row');
const sw = { nodeType: 1, hasAttribute: (a) => a === 'data-casora-wasteout', getAttribute: () => iso(0) + '|restmüll', classList: { contains: () => false } };
const box = { nodeType: 1, innerHTML: '', classList: { contains: () => false }, hasAttribute: (a) => a === 'data-casora-wasteout-box',
  getAttribute: () => JSON.stringify({ label: 'Restmüll', color: '#888', days: 0 }) };
document.querySelector = () => ({ hass });
let stopped = false;
listeners.click[0]({ type: 'click', composedPath: () => [sw, box], preventDefault() {}, stopPropagation() { stopped = true; } });
await tick();
assert.ok(stopped, 'the tap is the row’s');
assert.equal(hidden(), true, 'popup switch on: tile hidden');
assert.match(box.innerHTML, /aria-checked="true"/, 'row redrawn as on');
assert.match(box.innerHTML, /Kachel bis zur nächsten Abholung ausgeblendet/);
listeners.click[0]({ type: 'click', composedPath: () => [sw, box], preventDefault() {}, stopPropagation() {} });
await tick();
assert.equal(hidden(), false, 'popup switch off: tile back');

// ── template: the popup places the row before the bins, the module is loaded ──
const content = TPL.tap_action.casora_popup.content;
assert.match(content, /WO\.rowHtml\(hass, W\)/);
assert.match(content, /\['down', 'wtoday', 'out', 'right'/, 'phone: right under today');
assert.match(content, /\['down', 'wday', 'out', 'right'/, 'desktop: under the day card');
assert.match(read('custom_components/casora/scripts/casora-local.js'), /'50-waste-out'/, 'module loaded');
const en = JSON.parse(read('custom_components/casora/translations/dashboard/phrases/en.json')).exact;
for (const k of ['Rausgestellt', 'Müll ist rausgestellt', 'Kachel bis zur nächsten Abholung ausgeblendet']) assert.ok(en[k], 'en: ' + k);
console.log('waste_out: ok');
