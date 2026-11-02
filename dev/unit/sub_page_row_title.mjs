// House blinds popup (r487): the rows drop the shared „Jalousie“ („Küche“, „Bad“ …); tapping „Küche“ opened a sub page
// titled just „Jalousie“ – the page cut its room off the device's name („Jalousie Küche“) although no room stands above
// it there. Expected: from a popup over several rooms (label „Zuhause“ or none) the sub page takes the tapped row's name;
// from a room's popup it keeps the device's name without the room, as before.
//   node dev/unit/sub_page_row_title.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const rd = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const core = rd('custom_components/casora/scripts/casora-core.js');
const pops = rd('custom_components/casora/scripts/local/03-popups.js');

// ── casoraSubTitle: which title a row hands to the sub page it opens ──
const a = core.indexOf('  window.casoraSubTitle = function');
assert.ok(a > 0, 'casoraSubTitle found');
const b = core.indexOf('\n  };', a) + 5;
let soft = true;
const W = { _casoraSoft: () => soft };
new Function('window', core.slice(a, b))(W);
const sub = W.casoraSubTitle;
assert.equal(sub('Küche', { _roomLabel: 'Zuhause' }), 'Küche', 'house popup: the row names the page');
assert.equal(sub(' Wohnzimmer Links ', { _roomLabel: '' }), 'Wohnzimmer Links', 'popup without a room label: the row names the page');
assert.equal(sub('Links', { _roomLabel: 'Wohnzimmer' }), null, 'room popup: page keeps its own title');
assert.equal(sub('', { _roomLabel: 'Zuhause' }), null, 'no row name: nothing');
assert.equal(sub('Küche', null), null, 'no popup: nothing');
soft = false;
assert.equal(sub('Küche', { _roomLabel: 'Zuhause' }), null, 'classic design keeps the device title (it cuts no room)');
soft = true;

// ── stripRoom alone gives the bug: „Jalousie Küche“ under its room „Küche“ → „Jalousie“ ──
const s1 = core.indexOf('  function stripRoom(title, room) {');
const stripRoom = new Function(core.slice(s1, core.indexOf('\n  }', s1) + 4) + '\nreturn stripRoom;')();
assert.equal(stripRoom('Jalousie Küche', 'Küche'), 'Jalousie', 'the cut that made the title say nothing');
assert.equal(stripRoom('Jalousie Wohnzimmer Links', 'Wohnzimmer'), 'Jalousie Links', 'room popup cut stays');

// ── wiring: rows carry their name, the tap hands it on, the popup shows it uncut ──
assert.equal((core.match(/\+ \(r\.entity && typeof r\.label === 'string' && r\.label\.trim\(\) \? ' data-casora-rn="' \+ esc\(r\.label\.trim\(\)\) \+ '"' : ''\)/g) || []).length, 2,
  'both row renderers (classic and soft) carry the row name');
assert.ok(/_casoraBackNext = \{ fn: function \(\) \{ window\.casoraPopup\.open\(prevCfg\); \}, at: Date\.now\(\),\s+title: window\.casoraSubTitle\(t\.getAttribute\('data-casora-rn'\), window\.casoraPopup\.element\) \}/.test(core),
  'light/cover row tap hands the row name to the sub page');
assert.ok(/if \(typeof bn\.title === 'string' && bn\.title\) \{\s+this\._cfgTitle = bn\.title; this\._rowTitle = true;/.test(core), 'open() takes the row title');
assert.ok(/var title = sf && !this\._rowTitle \? stripRoom\(/.test(core), 'a row title is not cut by the room');
assert.ok(/this\._rowTitle = cfg\.row_title === true;/.test(core) && /\{ title: this\._cfgTitle, row_title: true \}/.test(core),
  'the row title stays in the config (‹ from a page further in)');
assert.ok(/window\.casoraSubTitle\(shownL\.textContent, P\.element\)/.test(pops), 'lamp rows of the house light popup hand on their name');
console.log('ok sub_page_row_title');
