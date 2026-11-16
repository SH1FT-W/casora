// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/entity_renames.py custom_components/casora/__init__.py custom_components/casora/scripts/local/01-basis.js#_casoraHouseLights,_casoraHouseLightsOf
// Issue 206: after changing a lamp's entity ID in HA, the lamp was gone from its room's light badge and from the
// house's lighting (tile and popup); adding it again with the new ID on the lighting tile did not bring it back –
// the room's badge (light_entity_N, where the house's lights come from) still held the old ID.
// A lamp listed one by one on a room's badge (several slots, as the reporter's living room) is renamed through HA's
// entity registry. Expected: both Casora dashboards (desktop and phone) hold the new ID wherever they held the old
// one, and the open dashboard counts the lamp in the house's lights again. Renames back and writes the dashboards back.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => d.url === (process.env.CASORA_QA_DASH || 'qa-arbeit')) || await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with rooms', dash);
const URLS = [dash.url].concat(dash.phone ? [dash.phone.url] : []);
const c0 = await ws();
const saved = {};
for (const u of URLS) saved[u] = await c0.cmd({ type: 'lovelace/config', url_path: u });
const S0 = Object.fromEntries((await c0.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
const REG = new Set((await c0.cmd({ type: 'config/entity_registry/list' })).map((r) => r.entity_id));
c0.close();
const isGrp = (id) => S0[id] && Array.isArray(S0[id].attributes.entity_id);
const OLD = (() => {
  for (const v of saved[dash.url].views.slice(1)) {
    const hero = (v.cards || []).find((x) => [].concat(x.template || []).includes('casora_room'));
    const V = (hero && hero.variables) || {};
    const lamps = Object.keys(V).filter((k) => /^light_entity_\d+$/.test(k)).map((k) => V[k]);
    const lamp = lamps.length >= 2 && lamps.find((x) => typeof x === 'string' && S0[x] && !isGrp(x) && REG.has(x));
    if (lamp) return lamp;
  }
  return null;
})();
await need('a registered lamp on a room badge with several lamps', OLD);
const NEW = OLD + '_r897';
const has = (x, id, d = 0) => d < 40 && (x === id || (Array.isArray(x) ? x.some((y) => has(y, id, d + 1))
  : x && typeof x === 'object' ? Object.values(x).some((y) => has(y, id, d + 1)) : false));
const rename = async (from, to) => { const c = await ws(); try { await c.cmd({ type: 'config/entity_registry/update', entity_id: from, new_entity_id: to }); } finally { c.close(); } };

atFinish(async () => {
  const c = await ws();
  const now = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, 1]));
  if (now[NEW]) await c.cmd({ type: 'config/entity_registry/update', entity_id: NEW, new_entity_id: OLD }).catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: saved[u] });
  c.close();
});

try {
  await rename(OLD, NEW);
  let cfg = {};
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    const c = await ws();
    for (const u of URLS) cfg[u] = await c.cmd({ type: 'lovelace/config', url_path: u });
    c.close();
    if (URLS.every((u) => !has(cfg[u], OLD))) break;
  }
  for (const u of URLS) {
    await check(u + ': the old entity ID is gone', !has(cfg[u], OLD));
    // Exactly the old ID replaced, nothing else changed (templates and fingerprint hold no lamp IDs here).
    const want = JSON.stringify(saved[u]).split(JSON.stringify(OLD)).join(JSON.stringify(NEW));
    await check(u + ': the new entity ID is there wherever the old one was, nothing else changed', JSON.stringify(cfg[u]) === want);
  }

  const o = await open({ width: 1440, height: 900 });
  usePage(o.page);
  await dashboard(o.page, dash.url + '/' + (saved[dash.url].views[0].path || '0'), 3);
  const ids = await o.page.evaluate(() => (window._casoraHouseLights ? window._casoraHouseLights().ids : null));
  await check('dashboard: the renamed lamp counts in the house\'s lights', Array.isArray(ids) && ids.includes(NEW) && !ids.includes(OLD), ids);
  await o.context.close();
} catch (e) {
  await check('flow without abort', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
