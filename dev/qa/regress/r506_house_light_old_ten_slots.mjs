// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-basis.js
// Follow-up to r505 (02.11.2026): 26.11.8 fixed the setup, but dashboards set up before it keep Home's light badge
// with the house's HA light group AND the first ten lights (light_entity_1…10). Picked lights win over the group in
// the popup (#80), so rooms past the tenth stay missing from the house light popup. Expected: opening such a
// dashboard in the Studio empties the ten slots (the group stays), only in memory and shown as unsaved; HA keeps
// the old config until the user saves; after one save every lamp of the rooms' light badges is in a room of the
// house light popup. A copy of „Test Neu“ (E2E t03) with the old pattern written back, removed at the end.
import { open, casoraDashboard, dashboard, studio, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const URL = 'qa-r506-licht';
const SLOTS = Array.from({ length: 10 }, (_, i) => 'light_entity_' + (i + 1));
const multi = (d) => (d.config.views || []).length > 2;
const src = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with rooms', src, null);

// The old setup's Home: the rooms' light slots in order, groups' members dropped (casoraBasis.topUnits), first ten.
const c = await ws();
const states = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
const members = (id) => [].concat(((states[id] || {}).attributes || {}).entity_id || []).filter((x) => typeof x === 'string');
const deep = (id, seen = new Set()) => { if (seen.has(id)) return []; seen.add(id); return members(id).flatMap((x) => [x, ...deep(x, seen)]); };
// The view's casora_room card (also inside stacks/sections).
const roomCard = (x, d = 0) => { if (!x || typeof x !== 'object' || d > 8) return null;
  if (Array.isArray(x)) { for (const y of x) { const r = roomCard(y, d + 1); if (r) return r; } return null; }
  if ([].concat(x.template || []).includes('casora_room') && x.variables) return x;
  return roomCard(x.cards, d + 1) || roomCard(x.sections, d + 1) || roomCard(x.card, d + 1); };
const cfg = JSON.parse(JSON.stringify(src.config));
const homeCard = roomCard(cfg.views[0]);
await need('Home with its room card', homeCard && homeCard.variables, cfg.views[0] && cfg.views[0].path);
const H = homeCard.variables;
const roomLights = [];
cfg.views.slice(1).forEach((v) => { const V = (roomCard(v) || {}).variables || {};
  SLOTS.forEach((k) => { if (typeof V[k] === 'string' && V[k] && !roomLights.includes(V[k])) roomLights.push(V[k]); }); });
const inner = new Set(roomLights.flatMap((id) => deep(id)));
const units = roomLights.filter((id) => !inner.has(id));
const tree = new Set(H.light_group_entity ? deep(H.light_group_entity) : []);
await need('Home has a house light group over more than ten lights', !!H.light_group_entity && units.length > 10 && units.slice(0, 10).every((id) => tree.has(id)),
  { group: H.light_group_entity, units: units.length });
SLOTS.forEach((k, i) => { H[k] = units[i]; });
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
if (!list.some((d) => d.url_path === URL)) {
  await c.cmd({ type: 'lovelace/dashboards/create', url_path: URL, title: 'QA r506 Licht', mode: 'storage', show_in_sidebar: false, require_admin: false });
}
await c.cmd({ type: 'lovelace/config/save', url_path: URL, config: cfg });
c.close();
atFinish(async () => {
  const c2 = await ws();
  const l = await c2.cmd({ type: 'lovelace/dashboards/list' });
  const d = l.find((x) => x.url_path === URL);
  if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  c2.close();
});
const liveHome = async () => { const c3 = await ws(); try { return roomCard((await c3.cmd({ type: 'lovelace/config', url_path: URL })).views[0]).variables; } finally { c3.close(); } };

// ── Studio: open → slots emptied in memory, group stays, unsaved; HA unchanged ──
const ph = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
const pg = ph.page; usePage(pg);
await studio(pg, URL);
const st = await pg.evaluate((slots) => { const p = window.__panel(); const V = p._state.compact.rooms[0].variables;
  return { group: V.light_group_entity, left: slots.filter((k) => V[k]).length, dirty: p._isDirty(), blocked: !!p._saveBlocked, auto: V.light_rooms_auto }; }, SLOTS);
await check('Studio: the old ten slots are emptied, the group stays', st.group === H.light_group_entity && st.left === 0 && st.auto === undefined, st);
await check('Studio: shown as unsaved (save bar), saving not blocked', st.dirty && !st.blocked, st);
const before = await liveHome();
await check('nothing written before saving (HA still has the ten slots)', SLOTS.every((k) => before[k] === H[k]), SLOTS.map((k) => before[k]));
const saved = await pg.evaluate(() => window.__panel()._save());
await need('Studio saved', saved !== false, saved);
const after = await liveHome();
await check('after one save: HA has the group alone', after.light_group_entity === H.light_group_entity && SLOTS.every((k) => !after[k]), after);

// ── Dashboard: the house light popup lists every room lamp (as r505) ──
await dashboard(pg, URL, 2);
await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
await pg.waitForTimeout(1500);
const at = await pg.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => /casora_badge_light_group\b/.test([].concat((x._config || {}).template || []).join(' ')) && x.getBoundingClientRect().width > 20);
  if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Home light badge on ' + URL, at);
await pg.mouse.move(at.x, at.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up();
let res = null;
for (let i = 0; i < 30 && !res; i++) {
  await pg.waitForTimeout(250);
  res = await pg.evaluate(() => {
    const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
    const cur = window._casoraLightSoft && window._casoraLightSoft.cur;
    if (!cur || !cur.rooms) return null;
    const S = document.querySelector('home-assistant').hass.states;
    const lamps = (id, seen = new Set()) => {
      if (seen.has(id) || !S[id]) return []; seen.add(id);
      const m = (S[id].attributes || {}).entity_id;
      const own = Array.isArray(m) ? m.flatMap((x) => lamps(x, seen)) : [];
      return own.length ? own : [id];
    };
    const cfg = window._casoraLovelaceCfg && window._casoraLovelaceCfg();
    const want = new Map();
    (cfg.views || []).forEach((v, vi) => {
      if (vi === 0) return;
      const rc = (function f(x, d) { if (!x || typeof x !== 'object' || d > 8) return null;
        if (Array.isArray(x)) { for (const y of x) { const r = f(y, d + 1); if (r) return r; } return null; }
        if ([].concat(x.template || []).includes('casora_room') && x.variables) return x;
        return f(x.cards, d + 1) || f(x.sections, d + 1) || f(x.card, d + 1); })(v, 0);
      const V = rc && rc.variables; if (!V || V.show_lights === false) return;
      [V.light_group_entity].concat(Array.from({ length: 10 }, (_, k) => V['light_entity_' + (k + 1)]))
        .filter((y) => typeof y === 'string' && y.startsWith('light.')).flatMap((y) => lamps(y)).forEach((y) => want.set(y, v.title || v.path));
    });
    const have = new Set(cur.rooms.flatMap((r) => (r.lights || []).flatMap((y) => lamps(y))));
    const missing = [...want.entries()].filter(([id]) => !have.has(id));
    return { rooms: cur.rooms.length, want: want.size, missing: [...new Set(missing.map(([, room]) => room))], ids: missing.map(([id]) => id).slice(0, 6) };
  });
}
await need('house light popup with rooms', res, res);
await check('after the fix: every room lamp is in the house light popup (' + res.want + ' lamps, ' + res.rooms + ' rooms)', res.want > 0 && !res.missing.length, res);
await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
await finish();
