// Settings in the new structure (prototype, casora-panel-settings.js NEU) without a browser.  node dev/unit/settings_neu_map.mjs
// Nothing lost: every page and personal section of the previous settings, every dashboard section the topics link
// to and every field of those sections (by part and field) has a block in a tile; dashboard sections are drawn in
// the tile (no links), only Updates stay a page of their own; at most two levels (tile → blocks); every block has a
// title, a plain sentence and search words; every visible text is translated into all seven languages.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../custom_components/casora/' + p, import.meta.url), 'utf8');
const de = JSON.parse(read('translations/panel/de.json')).exact;
const src = read('panel/casora-panel-settings.js');
const win = {};
const doc = { createElement: () => ({ style: {}, classList: { add() {}, toggle() {}, contains() { return false; } }, setAttribute() {}, appendChild() {} }), getElementById: () => null };
new Function('window', 'document', 'customElements', 'localStorage', src)(win, doc, { whenDefined: () => ({ then() {} }), get: () => null }, { getItem: () => null });
const NEU = win.casoraSettingsMap && win.casoraSettingsMap.tiles;
assert.ok(Array.isArray(NEU) && NEU.length >= 6 && NEU.length <= 9, 'a few big tiles');

// The previous pages and sections, read from the source (PAGES and HUB).
const slice = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
const pagesSrc = slice('const PAGES = [', 'const HUB = [');
const hubSrc = slice('const HUB = [', 'const HUB_FIND');
const pageIds = [...pagesSrc.matchAll(/\{ id: "(\w+)"/g)].map((m) => m[1]);
const personal = [...pagesSrc.matchAll(/personal: \[([^\]]+)\]/g)].flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]));
const secs = [...new Set([...hubSrc.matchAll(/sec: "(\w+)"/g)].map((m) => m[1]))];
assert.ok(pageIds.length >= 10 && personal.length >= 10 && secs.length >= 5, 'previous structure found');

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
  'Preview of the new settings. Everything is saved as before.', 'Back to the previous settings',
  'Same settings, sorted by what you want to do. You can switch back any time.', 'Try the new settings (preview)',
  'What do you want to set up? Pick a topic or search for a word.']);
NEU.forEach((tl) => { texts.add(tl.label); texts.add(tl.sub); tl.blocks.forEach((b) => { texts.add(b.title); texts.add(b.plain); }); });
const langs = ['de', 'es', 'fr', 'it', 'nl', 'pl', 'pt'];
langs.forEach((l) => {
  const tab = l === 'de' ? de : JSON.parse(read('translations/panel/' + l + '.json')).exact;
  texts.forEach((s) => assert.ok(tab[s], l + ' missing: ' + s));
});
texts.forEach((s) => assert.ok(src.includes(JSON.stringify(s).slice(1, -1)) || src.includes(s), 'text in source: ' + s));
console.log('ok settings_neu_map: ' + NEU.length + ' tiles, ' + blocks.length + ' blocks, ' + blocks.filter((b) => b.adv).length + ' advanced, '
  + fields + ' dashboard fields covered');
