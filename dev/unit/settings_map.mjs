// Settings in eight tiles (casora-panel-settings.js NEU, replaces the topics and subpages of 26.10., 03.11.2026)
// without a browser.  node dev/unit/settings_map.mjs
// Nothing lost: every page and personal section of the previous settings (frozen below, as in 26.11.9), every
// dashboard section the topics linked and every field of those sections (by part and field) has a block in a tile;
// every earlier page id and focus still leads somewhere (route); the previous structure and its preview switch are
// gone; dashboard sections are drawn in the tile (no links), only Updates stay a page of their own; at most two levels
// (tile → blocks); every block has a title, a plain sentence and search words; every visible text is translated
// into all seven languages.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('translations/panel/de.json')).exact;
const src = read('panel/casora-panel-settings.js');
const win = {};
const doc = { createElement: () => ({ style: {}, classList: { add() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, appendChild() {} }), getElementById: () => null };
new Function('window', 'document', 'customElements', 'localStorage', src)(win, doc, { whenDefined: () => ({ then() {} }), get: () => null }, { getItem: () => null });
const NEU = win.casoraSettingsMap && win.casoraSettingsMap.tiles;
assert.ok(Array.isArray(NEU) && NEU.length === 9, 'nine tiles');

// The previous settings (26.11.9): pages, their personal sections, the dashboard sections the topics linked, the topic ids.
const pageIds = ['design', 'home', 'calendar', 'alerts', 'dashboards', 'ai', 'outdoor', 'vent', 'live', 'fuel'];
const personal = ['waste', 'contacts', 'security', 'scenes', 'media', 'devices', 'calendars', 'notify', 'basis', 'umzug'];
const secs = ['Time', 'Notifications', 'Scenes', 'General', 'Weather'];
const topics = ['look', 'msg', 'house', 'wx', 'ctl', 'ext'];
// The previous structure is gone: no topic table, no page table, no preview switch.
assert.ok(!/const (HUB|HUB_FIND|PAGES) = \[/.test(src), 'previous tables removed');
assert.ok(!/casora\.settings\.neu|neuOn|neuSet|Back to the previous settings|Try the new settings/.test(src), 'no preview switch');
// Every earlier page id, topic and focus leads to a tile (and the block that holds it).
const route = win.casoraSettingsMap.route;
const tileIds = NEU.map((tl) => 'n-' + tl.id);
const blockOf = (id, nb) => { const tl = NEU.find((x) => 'n-' + x.id === id); return tl && tl.blocks.find((b) => 'nb-' + b.k === nb); };
['start', 'start-list', ...pageIds, ...topics.map((x) => 't-' + x)].forEach((id) => {
  const [to, nb] = route(id);
  assert.ok(tileIds.includes(to) || to === 'n-start', 'route ' + id + ' → ' + to);
  if (nb) assert.ok(blockOf(to, nb), 'route ' + id + ' → block ' + nb);
});
personal.forEach((f) => {
  const [to, nb] = route('home', f);
  const b = blockOf(to, nb);
  assert.ok(b && (b.personal || []).includes(f), 'focus ' + f + ' → ' + to + ' ' + nb);
});
assert.deepEqual(route('t-ctl'), ['n-use', undefined], 'Controls → Tapping');
assert.deepEqual(route('live'), ['n-phone', 'nb-live'], 'Live activities under Phone');
assert.deepEqual(route('fuel'), ['n-wx', 'nb-fuel'], 'Fuel under Weather, power & fuel');

const blocks = NEU.flatMap((tl) => tl.blocks.map((b) => ({ ...b, tile: tl.id })));
const has = (pred, what) => assert.ok(blocks.some(pred), 'no block for ' + what);
personal.forEach((k) => has((b) => (b.personal || []).includes(k), 'personal section ' + k));
// Option pages, own pages and the alert page's version push.
['ai', 'outdoor', 'vent', 'update_push'].forEach((k) => has((b) => b.opt === k, 'options ' + k));
has((b) => b.page === 'design', 'design');
has((b) => b.page === 'live', 'live activities');
has((b) => b.fuel, 'fuel prices');
has((b) => b.hemma, 'remove Hemma');
has((b) => b.updates, 'updates');
secs.forEach((s) => has((b) => b.sec === s, 'dashboard section ' + s));
// Every field of the dashboard sections is in a block: by section, part (sub) and, where a part is split, field.
const panel = read('panel/casora-panel.js');
assert.deepEqual(win.casoraSettingsMap.dashSections.slice().sort(), secs.slice().sort(), 'dashboard sections = the ones the topics linked');
const secSrc = (label) => {
  const at = panel.indexOf('label: "' + label + '"', panel.indexOf('const SECTIONS'));
  assert.ok(at > 0, 'section ' + label);
  const next = panel.indexOf('\n  {\n', at);
  return panel.slice(at, next > 0 ? next : at + 20000);
};
let fields = 0;
secs.forEach((label) => {
  const src = secSrc(label);
  const lines = src.split('\n').filter((l) => /key: "\w+"|\b(E|T|LIST|MAP)\("\w+"/.test(l));
  lines.forEach((l) => {
    const key = (l.match(/key: "(\w+)"/) || l.match(/\b(?:E|T|LIST|MAP)\("(\w+)"/))[1];
    const sub = (l.match(/sub: "(\w+)"/) || [])[1];
    fields++;
    has((b) => b.sec === label && (!b.sub || b.sub === sub) && (!b.keys || b.keys.includes(key)), label + ' › ' + (sub || '') + ' › ' + key);
  });
});
assert.ok(fields >= 50, 'dashboard fields found: ' + fields);
// No dashboard block is a link any more; only Updates are a page of their own.
assert.ok(!/_csHubGo\(\{ sec: b\.sec/.test(src), 'dashboard sections are drawn in the tile, not linked');
// Each page of the previous settings maps somewhere (personal pages through their sections).
pageIds.forEach((id) => assert.ok(['home', 'calendar', 'alerts', 'dashboards'].includes(id) || blocks.some((b) => b.page === id || b.opt === id
  || (id === 'fuel' && b.fuel)), 'page ' + id));

// Shape: unique keys, plain sentence, search words, at most two levels (blocks carry no children).
const keys = blocks.map((b) => b.k);
assert.equal(new Set(keys).size, keys.length, 'block keys unique');
blocks.forEach((b) => {
  assert.ok(b.title && b.plain && b.kw && b.kw.split(' ').length >= 2, 'title, plain sentence and words: ' + b.k);
  assert.ok(!b.blocks && !b.items, 'no third level: ' + b.k);
  assert.ok(!/\b(entity|entities|helper|template|yaml)\b/i.test(b.plain), 'no jargon in the plain sentence: ' + b.k);
});
NEU.forEach((tl) => assert.ok(tl.blocks.some((b) => !b.adv), 'tile opens with something frequent: ' + tl.id));

// Every visible text in all seven languages.
const texts = new Set(['Open updates', 'Advanced', 'Search: e.g. clock, waste, push…',
  'Open a dashboard in the Studio to change this.', 'Show scenes on this dashboard', 'Save your changes?',
  'Some changes are not saved yet. Discard takes back everything not saved, also on this dashboard.',
  'The dashboard could not be saved. Your changes are still here.',
  'What do you want to set up? Pick a topic or search for a word.']);
NEU.forEach((tl) => { texts.add(tl.label); texts.add(tl.sub); tl.blocks.forEach((b) => { texts.add(b.title); texts.add(b.plain); }); });
const langs = ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'nb'];
langs.forEach((l) => {
  const tab = l === 'de' ? de : JSON.parse(read('translations/panel/' + l + '.json')).exact;
  texts.forEach((s) => assert.ok(tab[s], l + ' missing: ' + s));
});
texts.forEach((s) => assert.ok(src.includes(JSON.stringify(s).slice(1, -1)) || src.includes(s), 'text in source: ' + s));
// Home & devices (settings rework): one section per kind of device, nothing folded away under "Advanced", and the
// jump from a tile or the old battery list lands in the right section.
const house = NEU.find((tl) => tl.id === 'house');
assert.ok(house.fold && house.blocks.every((b) => !b.adv), 'Home & devices: sections, no Advanced');
assert.deepEqual(house.blocks.map((b) => b.k), ['security', 'contacts', 'battery', 'scenes', 'media', 'waste', 'calendars', 'devices'], 'Home & devices: order');
assert.deepEqual(route('home', 'battery'), ['n-house', 'nb-battery'], 'batteries → Home & devices');
assert.deepEqual(route('home', 'notify_exclude'), ['n-bell', 'nb-notify'], '"Do not notify" stays with the bell');
// Side panel tabs: every kind with shared settings points at a block that exists; kinds without any have no entry.
const shared = win.casoraSettingsMap.tileShared;
Object.entries(shared).forEach(([kind, [tl, k]]) => assert.ok(NEU.find((x) => x.id === tl)?.blocks.some((b) => b.k === k), 'shared tab of ' + kind));
['light', 'thermostat', 'casora_switch'].forEach((kind) => assert.ok(!shared[kind], kind + ' has no shared tab'));
console.log('ok settings_map: ' + NEU.length + ' tiles, ' + blocks.length + ' blocks, ' + blocks.filter((b) => b.adv).length + ' advanced, '
  + fields + ' dashboard fields covered');
