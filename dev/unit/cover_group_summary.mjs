// Cover group summary (#63): the Home "Jalousien" tile read "85 % Geöffnet" (the HA cover group's own
// current_position, a different member list), its popup "Position 70 %" (average of the listed covers).
// Now tile and popup head share casoraCoverSummary/casoraCoverSummaryText: the same members, the same
// average, the count first ("3 von 6 geöffnet · Ø 70 %", narrow "3 von 6 geöffnet").
//   node dev/unit/cover_group_summary.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = read('custom_components/casora/scripts/casora-core.js');
const i = core.indexOf('  window.casoraCoverSummary = function');
const j = core.indexOf('  window.casoraCoverIconUrl = function');
assert.ok(i > 0 && j > i, 'casoraCoverSummary not found');
const fits = [];
const w = { casoraStateFit: (t, wgt, s) => { fits.push([t, s]); return t; } };
new Function('window', core.slice(i, j))(w);

const cov = (state, pos, more = {}) => ({ state, attributes: Object.assign(pos == null ? {} : { current_position: pos }, more) });
const sum = (S, ids) => w.casoraCoverSummary(S, ids);
const txt = (S, ids) => w.casoraCoverSummaryText(sum(S, ids));

// The reporter's house: 4 x 100, 1 %, 20 % -> average 70, all open; the HA group says 85 and holds a 7th cover.
const H = {
  'cover.a': cov('open', 100), 'cover.b': cov('open', 100), 'cover.c': cov('open', 100), 'cover.d': cov('open', 100),
  'cover.e': cov('open', 1), 'cover.f': cov('open', 20), 'cover.x': cov('open', 100),
  'cover.group': cov('open', 85, { entity_id: ['cover.a', 'cover.b', 'cover.c', 'cover.d', 'cover.e', 'cover.f', 'cover.x'] }),
};
const six = ['cover.a', 'cover.b', 'cover.c', 'cover.d', 'cover.e', 'cover.f'];
let s = sum(H, six);
assert.equal(s.total, 6); assert.equal(s.open, 6); assert.equal(s.avg, 70, 'average of the listed covers, not the group attribute');
assert.deepEqual(txt(H, six), { full: 'Alle geöffnet · Ø 70 %', short: 'Alle geöffnet' });

// Mixed positions: some closed.
const M = { 'cover.a': cov('open', 100), 'cover.b': cov('closed', 0), 'cover.c': cov('open', 40), 'cover.d': cov('closed', 0) };
assert.deepEqual(txt(M, Object.keys(M)), { full: '2 von 4 geöffnet · Ø 35 %', short: '2 von 4 geöffnet' });
// Position wins over the state (closed at 30 % is open).
assert.equal(sum({ 'cover.a': cov('closed', 30), 'cover.b': cov('closed', 0) }, ['cover.a', 'cover.b']).open, 1);

// Without positions: count by state, no average shown.
const N = { 'cover.a': cov('open'), 'cover.b': cov('closed'), 'cover.c': cov('closed') };
assert.deepEqual(txt(N, Object.keys(N)), { full: '1 von 3 geöffnet', short: '1 von 3 geöffnet' });
assert.equal(sum(N, Object.keys(N)).avg, 33, 'no position at all: open = 100, closed = 0 (slider)');
// Mixed: members with a position make the average, the others only the count.
assert.equal(sum({ 'cover.a': cov('open', 50), 'cover.b': cov('open') }, ['cover.a', 'cover.b']).avg, 50);

// Unavailable / unknown / missing members are left out.
const U = { 'cover.a': cov('open', 60), 'cover.b': cov('unavailable'), 'cover.c': cov('closed', 0), 'cover.d': cov('unknown', 30) };
s = sum(U, ['cover.a', 'cover.b', 'cover.c', 'cover.d', 'cover.gone']);
assert.equal(s.total, 2); assert.equal(s.unavailable, 3); assert.equal(s.avg, 30);
assert.deepEqual(txt(U, ['cover.a', 'cover.b', 'cover.c']), { full: '1 von 2 geöffnet · Ø 30 %', short: '1 von 2 geöffnet' });
assert.equal(txt(U, ['cover.b']).full, 'Nicht verfügbar');

// Group without a list: its members count, not its own current_position (85).
s = sum(H, ['cover.group']);
assert.equal(s.total, 7); assert.equal(s.avg, 74);
// Group plus its members in one list: no double counting.
assert.equal(sum(H, ['cover.group', 'cover.a', 'cover.b']).total, 7);
// A group whose members HA does not know counts as itself.
assert.equal(sum({ 'cover.g': cov('open', 85, { entity_id: ['cover.nope'] }) }, ['cover.g']).avg, 85);

// All closed / all open / moving / single cover.
const C = { 'cover.a': cov('closed', 0), 'cover.b': cov('closed', 0) };
assert.equal(txt(C, Object.keys(C)).full, 'Alle geschlossen');
assert.equal(txt({ 'cover.a': cov('open', 100), 'cover.b': cov('open', 100) }, ['cover.a', 'cover.b']).full, 'Alle geöffnet');
assert.equal(txt({ 'cover.a': cov('opening', 40), 'cover.b': cov('closed', 0) }, ['cover.a', 'cover.b']).full, 'Öffnet sich …');
assert.equal(txt({ 'cover.a': cov('closing', 40), 'cover.b': cov('open', 100) }, ['cover.a', 'cover.b']).full, 'Schließt sich …');
assert.equal(txt({ 'cover.a': cov('open', 70) }, ['cover.a']).full, '70 % geöffnet');
assert.equal(txt({ 'cover.a': cov('closed', 0) }, ['cover.a']).full, 'Geschlossen');

// ── Tile template (casora_cover.state_display) ──
const T = JSON.parse(read('custom_components/casora/panel/casora-templates.json')).templates;
const body = T.casora_cover.state_display.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
const tile = (S, entity, variables) => {
  fits.length = 0;
  const out = new Function('hass', 'entity', 'variables', 'window', body)({ states: S }, Object.assign({ entity_id: entity }, S[entity]), variables, w);
  return [out, fits[0] && fits[0][1]];
};
// Reporter: tile on the HA group with the six covers listed -> the same as the popup, not "85 % Geöffnet".
assert.deepEqual(tile(H, 'cover.group', { covers: six }), ['Alle geöffnet · Ø 70 %', 'Alle geöffnet']);
// Group without a list: the group's members.
assert.deepEqual(tile(H, 'cover.group', {}), ['Alle geöffnet · Ø 74 %', 'Alle geöffnet']);
// List whose first cover is the tile entity (room without an HA group) -> still the whole list.
const R = Object.assign({}, M);
assert.deepEqual(tile(R, 'cover.a', { covers: Object.keys(M) }), ['2 von 4 geöffnet · Ø 35 %', '2 von 4 geöffnet']);
// A single cover keeps its own words.
assert.equal(tile({ 'cover.a': cov('open', 70) }, 'cover.a', {})[0], '70% Geöffnet');
assert.ok(!/von \$\{openCount \+ closedCount\} offen/.test(body), 'old "x von y offen" without the average is gone');

// ── Popups: head and slider use the same summary ──
for (const t of ['casora_cover', 'casora_popup_cover']) {
  const c = T[t].tap_action.casora_popup.content;
  assert.ok(c.includes('window.casoraCoverSummaryText(window.casoraCoverSummary(states, ids)).full'), t + ': head from the summary');
  assert.ok(c.includes('window.casoraCoverSummary(states, coverIds)'), t + ': slider average from the summary');
  assert.ok(c.includes('_grpMembers'), t + ': a group without a list shows its members');
  assert.ok(!c.includes("'Teilweise geöffnet'"), t + ': no "Teilweise geöffnet" without the count');
}

// ── Translations: every part has a phrase in every language ──
for (const lang of ['en', 'es', 'fr', 'it', 'nl', 'pl', 'pt']) {
  const P = JSON.parse(read(`custom_components/casora/translations/dashboard/phrases/${lang}.json`));
  const hit = (x) => P.exact[x] != null || P.patterns.some(([re]) => new RegExp(re).test(x));
  for (const x of ['Alle geöffnet', 'Alle geschlossen', '2 von 4 geöffnet', 'Ø 70 %', '70 % geöffnet', 'Nicht verfügbar']) {
    assert.ok(hit(x), `${lang}: ${x}`);
  }
}
console.log('ok cover_group_summary');
