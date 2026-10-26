// Issue #75: a custom card pasted in the Studio could not be removed again - saving stayed locked.
//   node dev/unit/custom_card_round_trip.mjs
// The Studio hosted every pasted card in a casora_custom tile, containers too (cards: or card:, e.g. a swipe
// card or auto-entities). Reading a dashboard gives a hosted container back unhosted (unhostContainers), so the
// round trip check on the next load differed and saving was off for good, even after removing the card.
//   1. Whatever "Custom card" / "Edit card" / "Move into the tile row" put in a row survives save + load.
//   2. Dashboards saved before 26.10.62 with such a host load unlocked (the host is exactly the
//      Studio's own, so taking it off loses nothing), on the desktop and the phone half.
//   3. Anything else that changes only tiles: saving is off while such a tile is in a room and works again
//      once it is removed (also an undo that brings it back locks again). Other differences stay locked.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');
function grab(re) {
  const m = re.exec(src);
  assert.ok(m, 'not found: ' + re);
  const end = src.indexOf('\n}', m.index);
  const semi = src.indexOf('\n};', m.index);
  const stop = semi >= 0 && semi <= end ? semi + 3 : end + 2;
  return src.slice(m.index, stop);
}
const one = (re) => { const m = re.exec(src); assert.ok(m, 'not found: ' + re); return m[0]; };
const method = (head) => {
  const at = src.indexOf('\n  ' + head);
  assert.ok(at > 0, head + ' not found');
  const open = src.indexOf('{\n', at);
  return src.slice(open + 2, src.indexOf('\n  }\n', at));
};
const code = [
  one(/^const clone = .*$/m),
  one(/^const SMART_ROW = .*$/m),
  one(/^const MOBILE_HEADER = .*$/m),
  one(/^const MOBILE_NAV = .*$/m),
  one(/^const MOBILE_FAVORITES = .*$/m),
  one(/^const isFavoritesName = .*$/m),
  one(/^const CUSTOM_IN_ROW = .*$/m),
  one(/^const CUSTOM_BELOW = .*$/m),
  // From TILE_OWN_KEYS through the hosting helpers, the round trip helpers and lossyLeft in one piece.
  src.slice(src.indexOf('const TILE_OWN_KEYS = '),
    src.indexOf('\n', src.indexOf('lossy.prints.has(stable(t))));')) + 1),
  grab(/^function stable\(/m),
  grab(/^const omit = /m),
  grab(/^function roomVisibility\(/m),
  grab(/^function entityUsers\(/m),
  grab(/^function confirmEntities\(/m),
  grab(/^function confirmNames\(/m),
  grab(/^function extractConfig\(/m),
  grab(/^function expandConfig\(/m),
  grab(/^function phoneCanon\(/m),
  grab(/^const phoneRoundTrips = /m),
  src.slice(src.indexOf('function stripComment('), src.indexOf('const ENTITY_ACTIVE_STATES')),
  'return { clone, stable, wrapCustomCard, hostCard, hostBareTiles, unhostStudioHosts, roundTrips, lossyTiles, lossyLeft,'
    + ' LOSSY_TILE_MSG, phoneRoundTrips, extractConfig, expandConfig, parsePasted, parseCardText, cardToText,'
    + ' CUSTOM_TEMPLATE, TILE_OWN_KEYS, CUSTOM_IN_ROW, CUSTOM_BELOW };',
].join('\n');
const X = new Function(code)();

const json = (x) => JSON.parse(JSON.stringify(x));
const dash = (tiles) => ({ views: [{ type: 'custom:casora-view', title: 'Home', path: 'home', layout: {}, cards: [
  { type: 'custom:button-card', template: 'casora_room', name: 'Home', variables: {} },
  { type: 'custom:button-card', template: 'casora_nav' },
  { type: 'custom:casora-smart-row', cards: tiles || [] }] }] });
const save = (st) => json(X.expandConfig(st.compact, st.scaffold, st.extras, st.templates));
// What _load checks: the stored file against its own rebuild.
const loads = (cfg) => { const st = X.extractConfig(cfg); return X.roundTrips(X.expandConfig(st.compact, st.scaffold, st.extras, st.templates), cfg); };

const PASTED = {
  plain: 'type: custom:some-card\nentity: sensor.example\noptions:\n  a: 1\n  b: [1, 2]\n',
  unknown: 'type: custom:does-not-exist\n',
  swipe: 'type: custom:swipe-card\ncards:\n  - type: tile\n    entity: light.example\n',
  autoEntities: 'type: custom:auto-entities\ncard:\n  type: entities\nfilter:\n  include:\n    - domain: light\n',
  conditional: 'type: conditional\nconditions: []\ncard:\n  type: markdown\n  content: hi\n',
  layout: 'type: custom:some-card\nview_layout:\n  grid-area: a\ngrid_options:\n  columns: 6\nvariables:\n  size: auto\n',
  comments: '# my card\ntype: custom:some-card   # inline\nname: "1"\n',
};

// ── 1. what the Studio puts in a row round trips ───────────────────────────────
for (const [what, text] of Object.entries(PASTED)) {
  const card = X.parsePasted(text).card;
  const st = X.extractConfig(dash());
  st.compact.rooms[0].tiles.push(X.hostCard(card));
  assert.ok(loads(save(st)), 'pasted ' + what + ' round trips');
}
// The old way (every card hosted) is the bug: containers do not round trip exactly.
{
  const st = X.extractConfig(dash());
  st.compact.rooms[0].tiles.push(X.wrapCustomCard(X.parsePasted(PASTED.swipe).card));
  const cfg = save(st);
  const st2 = X.extractConfig(cfg);
  assert.notEqual(X.stable(X.expandConfig(st2.compact, st2.scaffold, st2.extras, st2.templates)), X.stable(cfg),
    'a hosted container differs on the next load (#75)');
}

// _addCustomCard and _editRawCard, run as written in the panel.
const panelFns = (body, args) => new Function('parsePasted', 'parseCardText', 'cardToText', 'wrapCustomCard', 'hostCard',
  'hostBareTiles', 'clone', 'CUSTOM_TEMPLATE', 'TILE_OWN_KEYS', 'CUSTOM_IN_ROW', 'CUSTOM_BELOW', 'requestAnimationFrame',
  'return async function (' + args + ') {' + body + '\n};')(X.parsePasted, X.parseCardText, X.cardToText, X.wrapCustomCard,
  X.hostCard, X.hostBareTiles, X.clone, X.CUSTOM_TEMPLATE, X.TILE_OWN_KEYS, X.CUSTOM_IN_ROW, X.CUSTOM_BELOW, () => {});
const addCustom = panelFns(method('async _addCustomCard(room) {'), 'room');
const editRaw = panelFns(method('async _editRawCard(room, tile) {'), 'room, tile');
const fakePanel = (answer) => ({ _state: { surface: 'desktop' }, _ask: async () => answer, _markDirty() {}, _renderForm() {}, _status() {},
  _installTemplate() { throw new Error('not a template'); } });
for (const [what, text] of Object.entries(PASTED)) {
  const st = X.extractConfig(dash());
  await addCustom.call(fakePanel({ value: text, choice: X.CUSTOM_IN_ROW }), st.compact.rooms[0]);
  assert.equal(st.compact.rooms[0].tiles.length, 1, 'added ' + what);
  assert.ok(loads(save(st)), 'Custom card dialog: ' + what + ' round trips');
}
{
  // A hosted card edited into a container leaves its host; a Casora tile edited into a bare card gets one.
  const st = X.extractConfig(dash([
    X.wrapCustomCard({ type: 'custom:some-card' }, { size: 'auto' }),
    { type: 'custom:button-card', template: 'casora_light', entity: 'light.example', variables: { size: 'auto' } },
  ]));
  const [hosted, light] = st.compact.rooms[0].tiles;
  await editRaw.call(fakePanel(PASTED.swipe), st.compact.rooms[0], hosted);
  assert.equal(hosted.type, 'custom:swipe-card', 'container left its host, same object');
  assert.equal(hosted.variables.size, 'auto', 'tile settings kept');
  await editRaw.call(fakePanel(PASTED.unknown), st.compact.rooms[0], light);
  assert.equal(light.template, X.CUSTOM_TEMPLATE, 'bare card hosted, same object');
  assert.equal(light.variables.size, 'auto', 'tile settings kept on the host');
  assert.ok(loads(save(st)), 'edited cards round trip');
}
assert.match(src, /concat\(\[hostCard\(moved\)\]\)/, '"Move into the tile row" hosts like reading does');
assert.match(fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel-import.js', import.meta.url), 'utf8'),
  /\(I\.hostCard \|\| I\.wrapCustomCard\)\(card\)/, 'Hemma import hosts like reading does');

// ── 2. dashboards saved with a Studio host around a container load unlocked ──────
{
  for (const what of ['swipe', 'autoEntities', 'conditional']) {
    const cfg = dash([X.wrapCustomCard(X.parsePasted(PASTED[what]).card, { size: 'auto' })]);
    assert.ok(loads(json(cfg)), what + ' hosted before 26.10.62 loads unlocked');
  }
  // A host with something the Studio does not write stays a difference (casora_ui_managed, own name).
  const odd = X.wrapCustomCard(X.parsePasted(PASTED.swipe).card);
  odd.name = 'Something else';
  assert.ok(!loads(dash([odd])), 'a host the Studio would not have written still locks');
  // Phone half: the same host inside a section's row.
  const host = X.wrapCustomCard(X.parsePasted(PASTED.swipe).card, { size: 'auto' });
  const phone = (tile) => ({ views: [{ type: 'panel', path: 'home', cards: [
    { type: 'custom:button-card', template: 'casora_mobile_bg' },
    { type: 'custom:casora-smart-row', cards: [
      { type: 'custom:button-card', template: 'casora_mobile_header', name: 'Kitchen' },
      { type: 'custom:casora-smart-row', cards: [tile] }] }] }] });
  assert.ok(X.phoneRoundTrips(phone(X.hostBareTiles([host])[0]), phone(host)), 'phone half with a Studio host round trips');
  assert.ok(!X.phoneRoundTrips(phone(X.hostBareTiles([odd])[0]), phone(odd)), 'phone: other hosts still differ');
}

// ── 3. only tiles differ: locked while they are there, free once removed ────────
{
  const odd = X.wrapCustomCard(X.parsePasted(PASTED.swipe).card);
  odd.name = 'Something else';
  const keep = { type: 'custom:button-card', template: 'casora_light', entity: 'light.example' };
  const bare = { type: 'tile', entity: 'light.example' };   // hand-written, reading hosts it
  const cfg = json(dash([keep, odd, bare]));
  const st = X.extractConfig(cfg);
  const rebuilt = X.expandConfig(st.compact, st.scaffold, st.extras, st.templates);
  const lossy = X.lossyTiles(st, X.unhostStudioHosts(cfg), rebuilt);
  const tiles = st.compact.rooms[0].tiles;
  assert.deepEqual(lossy, [tiles[1], tiles[2]], 'the two tiles that would change, not the Casora tile');

  // _markDirty as written in the panel.
  const markDirty = new Function('lossyLeft', 'LOSSY_TILE_MSG', 'trLabel', 'return function () {' + method('_markDirty() {') + '\n};')(X.lossyLeft, X.LOSSY_TILE_MSG, (s) => s);
  const el = { classList: { toggle() {} } };
  const said = [];
  const panel = { _state: st, _saveBlocked: true, _lossy: { state: st, tiles: new Set(lossy), prints: new Set(lossy.map(X.stable)) },
    $: () => el, _print: () => 'x', _clean: 'y', _status: (m) => said.push(m), _log() {}, _draftLater() {} };
  markDirty.call(panel);
  assert.equal(panel._saveBlocked, true, 'still locked while both are there');
  tiles.splice(1, 1);
  markDirty.call(panel);
  assert.equal(panel._saveBlocked, true, 'still locked with one left');
  const removed = tiles.splice(1, 1)[0];
  markDirty.call(panel);
  assert.equal(panel._saveBlocked, false, 'free once both are removed');
  tiles.push(X.clone(removed));   // undo restores a copy
  markDirty.call(panel);
  assert.equal(panel._saveBlocked, true, 'an undo that brings one back locks again');
  assert.equal(said[said.length - 1], X.LOSSY_TILE_MSG);
  tiles.pop();
  markDirty.call(panel);
  assert.equal(panel._saveBlocked, false);
  // Another dashboard loaded (or a setup screen open): never touched.
  panel._state = X.extractConfig(cfg);
  panel._saveBlocked = true;
  markDirty.call(panel);
  assert.equal(panel._saveBlocked, true, 'other state: left alone');
  panel._state = st; panel._flowMode = 'full';
  markDirty.call(panel);
  assert.equal(panel._saveBlocked, true, 'setup screen: left alone');

  // Something outside the tiles differs: no way out by removing tiles.
  const other = json(dash([odd]));
  other.views[0].cards[0].variables = { casora_entity_users: { 'light.x': ['u1'] } };   // recomputed from tiles
  const so = X.extractConfig(other);
  assert.equal(X.lossyTiles(so, other, X.expandConfig(so.compact, so.scaffold, so.extras, so.templates)), null,
    'a difference outside the tiles stays locked');
  // A view the Studio skips (fewer than 3 cards): rooms and views no longer line up.
  const skipped = json(dash([odd]));
  skipped.views.push({ path: 'x', cards: [] });
  const sk = X.extractConfig(skipped);
  assert.equal(X.lossyTiles(sk, skipped, X.expandConfig(sk.compact, sk.scaffold, sk.extras, sk.templates)), null,
    'skipped view stays locked');
}
assert.match(src, /const safe = roundTrips\(rebuilt, cfg\);/, '_load uses the tolerant round trip');
assert.match(src, /lossyTiles\(this\._state, unhostStudioHosts\(cfg\), rebuilt\)/, '_load records the tiles that would change');

console.log('custom_card_round_trip: ok');
