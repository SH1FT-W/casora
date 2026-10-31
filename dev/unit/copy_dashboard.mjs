// Copying in the Studio (#92): "Duplicate" puts a tile's copy right behind it in the same room, "Copy…" in the
// dashboard menu makes a new dashboard (and phone layout) from the saved one; links into its rooms follow.
//   node dev/unit/copy_dashboard.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../../custom_components/casora/panel/casora-panel.js', import.meta.url), 'utf8');

// 1. Tile menu: Duplicate inserts a clone at i + 1.
assert.ok(src.includes('{ id: "duplicate", label: "Duplicate" }'), 'Duplicate in the tile menu');
assert.ok(/if \(id === "duplicate"\) \{\s*room\.tiles\.splice\(i \+ 1, 0, clone\(shell\)\);/.test(src), 'clone right behind');

// 2. _copyDashboard with a fake Home Assistant.
const start = src.indexOf('\n  async _copyDashboard(d) {');
const end = src.indexOf('\n  }\n', start);
const body = src.slice(start, end + 4).replace('async _copyDashboard(d) {', 'async function _copyDashboard(d) {');
const translit = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const copy = new Function('translit', body + '\nreturn _copyDashboard;')(translit);

function panel({ fail } = {}) {
  const calls = [], saved = {}, list = [
    { id: 'd1', url_path: 'demo-haus', title: 'Demo Haus', icon: 'mdi:home', mode: 'storage' },
    { id: 'd2', url_path: 'demo-haus-mobile', title: 'Demo Haus Mobile', mode: 'storage' },
  ];
  const cfgs = {
    'demo-haus': { views: [{ path: 'home', cards: [{ tap_action: { navigation_path: '/demo-haus/kueche' } },
      { navigation_path: '/demo-haus-mobile/home' }, { navigation_path: '/demo-haus-alt/x' }, { url: '/demo-haus' }] }] },
    'demo-haus-mobile': { views: [{ path: 'home', cards: [{ navigation_path: '/demo-haus-mobile/kueche' }] }] },
  };
  const p = {
    calls, saved, _dashList: list, _state: {}, _isDirty: () => false, logs: [], statuses: [],
    _ask: async () => 'Demo Haus 2',
    _homes: (l) => [{ wide: l[0], phone: l[1] }],
    _flowPath: (t, fb, suffix) => { const s = translit(t); return s.includes('-') ? s : s + '-' + suffix; },
    _flowRelist: async () => {}, _paintDashes: () => {},
    _log: (m) => p.logs.push(m), _status: (m, k) => p.statuses.push([m, k]),
    _hass: { callWS: async (m) => {
      calls.push(m);
      if (m.type === 'lovelace/config') return JSON.parse(JSON.stringify(cfgs[m.url_path]));
      if (m.type === 'lovelace/dashboards/create') {
        if (fail && m.url_path.endsWith('-mobile')) throw new Error('boom');
        return { id: 'new-' + m.url_path };
      }
      if (m.type === 'lovelace/config/save') { saved[m.url_path] = m.config; return null; }
      return null;
    } },
  };
  return p;
}
{
  const p = panel();
  await copy.call(p, p._dashList[0]);
  const made = p.calls.filter((c) => c.type === 'lovelace/dashboards/create').map((c) => [c.url_path, c.title, c.show_in_sidebar]);
  assert.deepEqual(made, [['demo-haus-2', 'Demo Haus 2', true], ['demo-haus-2-mobile', 'Demo Haus 2 Mobile', false]]);
  const cards = p.saved['demo-haus-2'].views[0].cards;
  assert.equal(cards[0].tap_action.navigation_path, '/demo-haus-2/kueche', 'room link follows');
  assert.equal(cards[1].navigation_path, '/demo-haus-2-mobile/home', 'phone link follows');
  assert.equal(cards[2].navigation_path, '/demo-haus-alt/x', 'another dashboard stays');
  assert.equal(cards[3].url, '/demo-haus-2', 'plain link follows');
  assert.equal(p.saved['demo-haus-2-mobile'].views[0].cards[0].navigation_path, '/demo-haus-2-mobile/kueche');
  assert.deepEqual(p.statuses.at(-1), ['Copied to Demo Haus 2', 'ok']);
  console.log('ok copy with phone layout');
}
{
  const p = panel({ fail: true });
  await copy.call(p, p._dashList[0]);
  const del = p.calls.filter((c) => c.type === 'lovelace/dashboards/delete').map((c) => c.dashboard_id);
  assert.deepEqual(del, ['new-demo-haus-2'], 'half made copy removed');
  assert.equal(p.statuses.at(-1)[1], 'err');
  console.log('ok failed copy cleaned up');
}
{
  const p = panel();
  p._isDirty = () => true;
  await copy.call(p, p._dashList[0]);
  assert.equal(p.calls.length, 0, 'unsaved changes: nothing copied');
  console.log('ok unsaved changes first');
}
console.log('copy_dashboard: ok');
