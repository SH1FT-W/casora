// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/panel/casora-panel.js#syncPairTiles,assignTwins
// GitHub issue 158: a new Universal tile without a device showed on the desktop but not on the phone. Reproduced with
// a second such tile in the same room: the pair sync matched tiles by kind + device, two Universal tiles without a
// device counted as one and only the first was copied to the phone layout.
// Expected: two Universal tiles without a device added to Home in the Studio and saved are both in the phone
// dashboard and both drawn on the phone (390×844); a second save changes nothing.
// The dashboards are restored at the end.
import { open, studio, casoraDashboards, dashboard, check, need, finish, atFinish, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && all.some((m) => m.url === d.url + '-mobile'));
await need('a Casora dashboard with a phone layout', desk, all.map((d) => d.url));
const URLS = [desk.url, desk.url + '-mobile'];
const c = await ws();
const saved0 = {};
for (const u of URLS) saved0[u] = await c.cmd({ type: 'lovelace/config', url_path: u });
c.close();
atFinish(async () => {
  const c2 = await ws();
  for (const u of URLS) await c2.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] });
  c2.close();
});
const NAMES = ['QA158 Eins', 'QA158 Zwei'];
const found = async (url) => {
  const c3 = await ws();
  const cfg = await c3.cmd({ type: 'lovelace/config', url_path: url });
  c3.close();
  const hits = [];
  (function walk(n) { if (!n || typeof n !== 'object') return;
    if (!Array.isArray(n) && n.variables && n.variables.qa_158) { hits.push(n.name); return; }
    Object.values(n).forEach(walk); })(cfg);
  return hits;
};

{
  const o = await open({ width: 1440, height: 900, dark: false });
  usePage(o.page);
  await studio(o.page, desk.url);
  const st = await o.page.evaluate(async (names) => {
    const p = window.__panel(), I = window.__casoraPanelInternals, rooms = p._state.compact.rooms;
    const hi = rooms.findIndex((r) => I.isHomeRoom(r, rooms));
    const type = I.TILE_TYPES.find((t) => t.id === 'casora_free');
    names.forEach((name) => { const tile = I.newTile(type); tile.name = name; tile.variables.qa_158 = true; rooms[hi].tiles.push(tile); });
    p._room = hi; p._sel = null; p._renderTabs(); p._syncPreview();
    await new Promise((r) => setTimeout(r, 800));
    await p._saveNow();
    const first = !p._isDirty();
    await p._saveNow();
    return { home: hi >= 0, pair: !!p._pair, first, second: !p._isDirty(), entity: rooms[hi].tiles.filter((t) => (t.variables || {}).qa_158).map((t) => t.entity) };
  }, NAMES);
  await need('Studio: Home with a phone layout', st.home && st.pair, st);
  await check('Studio: two Universal tiles without a device, saved', st.first && st.second && st.entity.every((e) => !e), st);
  await o.browser.close().catch(() => {});
}

const d = await found(desk.url), m = await found(desk.url + '-mobile');
await check('desktop dashboard holds both tiles', JSON.stringify(d) === JSON.stringify(NAMES), d);
await check('phone dashboard holds both tiles, once each (saved twice)', JSON.stringify(m) === JSON.stringify(NAMES), m);

{
  const ph = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false });
  usePage(ph.page);
  await dashboard(ph.page, desk.url + '-mobile', 3);
  await ph.page.waitForTimeout(3000);
  const seen = await ph.page.evaluate(() => window.__pierce('button-card')
    .filter((b) => b._config && b._config.variables && b._config.variables.qa_158 && b.getBoundingClientRect().height > 20)
    .map((b) => b._config.name));
  await check('phone: both tiles are drawn', NAMES.every((n) => seen.includes(n)) && seen.length === 2, seen);
  await ph.browser.close().catch(() => {});
}
await finish();
