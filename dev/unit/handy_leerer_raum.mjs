// Prüfrunde u06-04: a phone room without tiles (Garage, Garten) showed only its title and photo, nothing below –
// it looked like a loading error, while the desktop row says „Noch keine Geräte – im Studio hinzufügen“. Expected:
// the room page shows the empty hint (as an empty category does); a room with tiles shows its grid and no hint.
//   node dev/unit/handy_leerer_raum.mjs
// @deckt: custom_components/casora/scripts/filter-overlay.js#_ensureAutoSections,_appendEmptyHint
import fs from 'node:fs';
import assert from 'node:assert/strict';

const fo = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
const m = /\n    _ensureAutoSections\(\) \{([\s\S]*?)\n    \}\n/.exec(fo);
assert.ok(m, '_ensureAutoSections found');

const run = (tiles) => {
  const calls = [];
  const header = { _config: { template: 'casora_mobile_header', name: 'Garage', variables: {} } };
  const row = { _config: { cards: tiles } };
  const kids = [{ bc: header }, { querySelector: () => row }];
  const self = {
    _config: { room: 'Garage', scenes: false },
    _container: { children: kids },
    _helpers: {},
    _contentEl: { children: [], appendChild() {} },
    _cardEls: [],
    _getBC: (k) => k.bc || null,
    _appendEmptyHint: () => calls.push('hint'),
    _appendEntityGrid: (cards) => calls.push('grid:' + cards.length),
    _appendRevealCard: (c) => calls.push('card:' + c.template),
    _appendGroupHeader: () => calls.push('group'),
  };
  new Function('window', '_cardOffOnPhone', '_lightIdsOf', '_roomGroupOn', '_roomGroupSplit', '_devicesHeadCfg', 'noEval',
    'LANDSCAPE_GUTTER_CALC', '_isFavHeader', '_cardCategory', m[1])
    .call(self, {}, () => false, () => [], () => false, () => null, () => ({ template: 'casora_mobile_header' }), (x) => x,
      '0px', () => false, () => null);
  return calls;
};

assert.deepEqual(run([]), ['hint'], 'empty room: the hint, no empty grid');
assert.deepEqual(run([{ type: 'custom:button-card', template: 'casora_light', entity: 'light.x' }]), ['grid:1'], 'room with a tile: its grid');
console.log('handy_leerer_raum: ok');
