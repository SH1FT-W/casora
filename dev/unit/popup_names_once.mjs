// Owner decision 02.11.2026 (option B): the shared leading words of device names are dropped once across the whole
// popup, not per list. A device that moves between two lists of the same popup (Offen / Geschlossen, Akku schwach /
// Weitere Geräte, the first rows and „Alle anzeigen“) keeps the same name whatever the states are, and a list with a
// single row gets the popup-wide cut too. Popups with one list behave as before.
//   node dev/unit/popup_names_once.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');

// ── the core helpers: casoraDropCommonPrefix, dropRowPrefix (per list), popupNames (whole popup) ──
const a = core.indexOf('  window.casoraDropCommonPrefix = function');
const b = core.indexOf('  function group(rows, label', a);
assert.ok(a > 0 && b > a, 'helpers found');
const W = {};
const H = new Function('window', core.slice(a, b)
  + '\nreturn { dropRowPrefix: dropRowPrefix, popupNames: typeof popupNames === "function" ? popupNames : null };')(W);

// What UI.group does with the names (its first line, checked against the source below).
const shown = (rows, opts) => (opts && opts.keepNames ? rows : H.dropRowPrefix(rows)).map((r) => r.label);
assert.ok(/function group\(rows, label, labelAction, opts\) \{\n(?:    \/\/.*\n)*    rows = opts && opts\.keepNames \? \(rows \|\| \[\]\) : dropRowPrefix\(rows \|\| \[\]\);/.test(core),
  'UI.group cuts per list through dropRowPrefix');

const r = (id, label, extra) => Object.assign({ entity: id, label }, extra || {});

// ── module popups, run with a UI whose group behaves like the core's ──
const esc = (t) => String(t == null ? '' : t);
globalThis.window = globalThis;
globalThis.document = { querySelector: () => null, addEventListener: () => {} };
let lists = [];
window._casoraUI = {
  esc, line: () => '', note: () => '', stage: () => '', more: (k, html) => html, v3: () => false, soft: () => true,
  group: (rows, label, act, opts) => { lists.push({ label, names: shown(rows, opts) }); return ''; },
  popupNames: H.popupNames,
};
const nameIn = (label) => { const l = lists.find((x) => x.label === label); return l ? l.names : null; };

// Security covers popup: „Offen“, „Geschlossen“, „Nicht verfügbar“.
window._casoraSoftKit = { secCard: () => ({}), layout: () => ({}) };
new Function(rd('custom_components/casora/scripts/local/34-security-covers.js'))();
const SC = window._casoraSecCovers;
const cv = (state, name) => ({ state, attributes: { friendly_name: name, supported_features: 15, current_position: state === 'open' ? 100 : 0 } });
window.CASORA_SETTINGS = { security: { covers: ['cover.l', 'cover.r', 'cover.t'], covers_night: false } };
const covers = (l, rr, t) => ({ 'cover.l': cv(l, 'Wohnzimmer Jalousie links'), 'cover.r': cv(rr, 'Wohnzimmer Jalousie rechts'),
  'cover.t': cv(t, 'Wohnzimmer Terrasse') });
const hass0 = { entities: {}, devices: {}, areas: {} };
lists = []; SC.sec('list', null, covers('open', 'open', 'closed'), hass0);
const s1 = { open: nameIn('Offen'), closed: nameIn('Geschlossen') };
lists = []; SC.sec('list', null, covers('closed', 'open', 'closed'), hass0);
const s2 = { open: nameIn('Offen'), closed: nameIn('Geschlossen') };
assert.deepEqual(s1, { open: ['Jalousie links', 'Jalousie rechts'], closed: ['Terrasse'] }, 'covers, both open');
assert.deepEqual(s2, { open: ['Jalousie rechts'], closed: ['Jalousie links', 'Terrasse'] }, 'covers, one closed: same names');

// Battery popup (soft): „Akku schwach“ and „Weitere Geräte“ are two cards, each cuts over all batteries.
new Function(rd('custom_components/casora/scripts/local/08-weich-kompakt.js'))();
const SB = window._casoraSoftBat;
const C = { b: [['sensor.a', 'Bewegungsmelder Flur', null, []], ['sensor.b', 'Bewegungsmelder Bad', null, []], ['sensor.c', 'Bewegungsmelder Küche', null, []]] };
const bat = (x, y, z) => ({ 'sensor.a': { state: String(x), attributes: {} }, 'sensor.b': { state: String(y), attributes: {} }, 'sensor.c': { state: String(z), attributes: {} } });
const batNames = (st) => { lists = []; SB.sec('low', C, st); SB.sec('all', C, st); return { low: nameIn('Akku schwach'), rest: nameIn('Weitere Geräte') || nameIn('Alle Geräte') }; };
assert.deepEqual(batNames(bat(90, 80, 70)), { low: null, rest: ['Küche', 'Bad', 'Flur'] }, 'batteries all fine');
assert.deepEqual(batNames(bat(5, 80, 70)), { low: ['Flur'], rest: ['Küche', 'Bad'] }, 'one battery low: same names, single row cut');

// ── the helper itself ──
assert.ok(H.popupNames, 'core has popupNames');
assert.ok(/popupNames: popupNames/.test(core), 'UI.popupNames is exported');
const all = [r('c.l', 'Wohnzimmer Fenster links'), r('c.r', 'Wohnzimmer Fenster rechts'), r('c.t', 'Wohnzimmer Terrassentür')];
const cut = H.popupNames(all);
assert.deepEqual(all.map(cut).map((x) => x.label), ['Fenster links', 'Fenster rechts', 'Terrassentür'], 'one cut over all rows');
assert.equal(all[0].label, 'Wohnzimmer Fenster links', 'the rows given stay untouched');
// A list of rows that already carry the popup-wide name is not cut a second time by UI.group.
assert.deepEqual(shown([all[0], all[1]].map(cut)), ['Fenster links', 'Fenster rechts'], 'no second cut per list');
assert.deepEqual(shown([all[2]].map(cut)), ['Terrassentür'], 'a single row gets the popup-wide cut');
// Safeguards of casoraDropCommonPrefix stay: never empty, never a bare number.
assert.deepEqual([r('l.1', 'Lampe 1'), r('l.2', 'Lampe 2')].map(H.popupNames([r('l.1', 'Lampe 1'), r('l.2', 'Lampe 2')])).map((x) => x.label),
  ['Lampe 1', 'Lampe 2']);
const one = H.popupNames([r('l.1', 'Jalousie Bad')]);
assert.equal(one(r('l.1', 'Jalousie Bad')).label, 'Jalousie Bad', 'one device: nothing to cut');
// Rows that name no device, and rows the set does not know, keep their words.
const c2 = H.popupNames([r('a.1', 'Sensor Flur'), r('a.2', 'Sensor Bad')]);
assert.equal(c2({ label: 'Sensor Alle' }).label, 'Sensor Alle');
assert.deepEqual([r('a.1', 'Sensor Flur'), r('a.2', 'Sensor Bad')].map(H.popupNames([r('a.1', 'Sensor Flur'), r('a.2', 'Sensor Bad'), { label: 'Sensor prüfen' }])).map((x) => x.label),
  ['Sensor Flur', 'Sensor Bad'], 'a row that names no device among them: names stay whole, as in one list');
assert.equal(c2(r('a.9', 'Sensor Keller')).label, 'Sensor Keller');
assert.equal(c2({ page: 'x|1', label: 'Sensor Flur' }).label, 'Sensor Flur', 'keyed by entity / page');
assert.deepEqual([r('a.1', 'Sensor Flur'), r('a.1', 'Sensor Flur'), r('a.2', 'Sensor Bad')].map(H.popupNames([r('a.1', 'Sensor Flur'), r('a.1', 'Sensor Flur'), r('a.2', 'Sensor Bad')])).map((x) => x.label),
  ['Flur', 'Flur', 'Bad'], 'a row listed twice counts once');

// ── template popups and the remaining modules hand their rows through UI.popupNames ──
const T = JSON.parse(rd('dashboards/casora/button_card_templates.json'));
const content = (name, act) => T[name][act || 'tap_action'].casora_popup.content;
for (const [name, act] of [['casora_popup_contacts'], ['casora_badge_security'], ['casora_popup_battery'], ['casora_popup_battery', 'icon_tap_action'],
  ['casora_popup_cover'], ['casora_cover']]) {
  assert.ok(/UI\.popupNames/.test(content(name, act)), name + (act ? ' ' + act : '') + ': popup-wide names');
}
const mods = {
  'custom_components/casora/scripts/local/05-weich-mehr.js': 'energy consumers, first rows and the rest',
  'custom_components/casora/scripts/local/18-ziele.js': 'device page, entity lists',
  'custom_components/casora/scripts/local/34-entity-list.js': 'entity list sections',
  'custom_components/casora/scripts/local/08-weich-kompakt.js': 'updates, first rows and the rest',
};
for (const [p, what] of Object.entries(mods)) assert.ok(/UI\.popupNames/.test(rd(p)), what);
// Hemma round #11a: open stacks unfold into the same lists, the names still cut once across both.
assert.ok(/UI\.popupNames\(unfold\(g\.fresh\)\.concat\(unfold\(g\.old\)\)/.test(core),
  'notifications: „Neu“ and „Früher“ share the names');
console.log('popup_names_once: ok');
