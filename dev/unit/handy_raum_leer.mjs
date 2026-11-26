// Test round 26.11.2026 (d02-07): a phone room page whose room has no tiles and no scenes (Garage, Garten) showed only
// its title on the photo – no hint, as if it were still loading. The desktop's row says „Noch keine Geräte“. Now the
// room page shows the empty hint the category pages have, once the room's row is there; late scenes take it out again.
//   node dev/unit/handy_raum_leer.mjs
// @deckt: custom_components/casora/scripts/filter-overlay.js#_ensureAutoSections,_insertLateScenes,_appendEmptyHint
import fs from 'node:fs';
import assert from 'node:assert/strict';

const fo = fs.readFileSync(new URL('../../custom_components/casora/scripts/filter-overlay.js', import.meta.url), 'utf8');
const method = (name) => {
  const m = new RegExp('\\n    ' + name + '\\(\\) \\{([\\s\\S]*?)\\n    \\}\\n').exec(fo);
  assert.ok(m, name + ' found');
  return m[1];
};
const ensure = method('_ensureAutoSections');
const late = method('_insertLateScenes');

const helpers = {
  _isFavHeader: () => false, _cardOffOnPhone: () => false, _lightIdsOf: () => [], _roomGroupOn: () => false,
  _devicesHeadCfg: () => ({ head: 'Geräte' }), noEval: (x) => x, LANDSCAPE_GUTTER_CALC: '0px', _cardCategory: () => null,
  _roomGroupSplit: () => null,
};
const names = Object.keys(helpers);
const run = (self, body) => new Function(...names, body).call(self, ...names.map((k) => helpers[k]));

const page = (cards, scenes) => {
  const content = { children: [], insertBefore(f) { this.children.push(...(f.kids || [])); } };
  const header = { _cfg: { template: 'casora_mobile_header', name: 'Garage', variables: {} } };
  const row = { _cfg: null, querySelector: () => ({ _config: { cards } }) };
  const self = {
    _config: { room: 'Garage' }, _container: { children: [header, row] }, _helpers: {}, _contentEl: content, _cardEls: [],
    _getBC: (kid) => (kid._cfg ? { _config: kid._cfg } : null),
    _appendRevealCard: (cfg, parent) => { (parent.kids || parent.children).push({ cfg }); },
    _appendEntityGrid: (cs, parent) => { if (cs.length) parent.children.push({ grid: cs.length }); else parent.children.push({ grid: 0 }); },
    _appendRoomScenes: (room, ents, parent) => { if (!window._casoraSC || !scenes()) return false; (parent.kids || parent.children).push({ scenes: true }); return true; },
    _primeSceneList: () => {},
    hints: 0,
    _appendEmptyHint() { if (this._emptyHintEl && this._emptyHintEl.isConnected) return; this.hints++;
      const el = { hint: true, isConnected: true, remove() { this.isConnected = false; content.children = content.children.filter((x) => x !== el); } };
      content.children.push(el); this._emptyHintEl = el; },
  };
  return self;
};
globalThis.window = globalThis;
globalThis.document = { createDocumentFragment: () => ({ kids: [] }) };

// The reported case: no tiles, no scenes.
window._casoraSC = { list: () => [] };
{
  const p = page([], () => false);
  run(p, ensure);
  assert.equal(p.hints, 1, 'an empty room shows the hint');
  assert.ok(p._contentEl.children.some((x) => x.hint));
}
// Tiles or scenes: no hint.
{
  const p = page([{ entity: 'light.example' }], () => false);
  run(p, ensure);
  assert.equal(p.hints, 0, 'tiles: no hint');
  const q = page([], () => true);
  run(q, ensure);
  assert.equal(q.hints, 0, 'scenes: no hint');
}
// The row not built yet: still loading, no hint.
{
  const p = page([], () => false);
  p._container.children = [p._container.children[0]];
  run(p, ensure);
  assert.equal(p.hints, 0, 'no row yet: no hint while loading');
}
// Scenes arriving late take the hint out.
{
  delete window._casoraSC;
  let has = false;
  const p = page([], () => has);
  run(p, ensure);
  assert.equal(p.hints, 1);
  window._casoraSC = { list: () => [] };
  has = true;
  run(p, late);
  assert.ok(!p._contentEl.children.some((x) => x.hint), 'late scenes: hint gone');
  assert.ok(p._contentEl.children.some((x) => x.scenes));
}
console.log('ok phone room page without tiles: hint');
