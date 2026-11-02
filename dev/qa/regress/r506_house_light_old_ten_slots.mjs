// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-basis.js
// Follow-up to r505 (02.11.2026): setups before 26.11.9 gave Home's light badge the house's HA light group AND its
// lights in the slots (light_entity_1…10, the first ten when there were more). Picked lights win over the group in
// the popup (#80), so rooms past the tenth stay missing from the house light popup. Expected: opening such a
// dashboard in the Studio empties the slots (the group stays, marker light_slots_checked) on the desktop rooms and
// the phone's badge row, only in memory and shown as unsaved; HA keeps the old config until the user saves; after
// one save and a reload nothing is offered again, and every lamp of the rooms' light badges is in a room of the
// house light popup. Also the old full list of ten or fewer units (fewer rooms, another order) is emptied.
// Copies of „Test Neu“ (E2E t03, with its phone half) with the old pattern written back, removed at the end.
import { open, casoraDashboard, dashboard, studio, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const URL = 'qa-r506-licht', URL_B = 'qa-r506-licht-b';
const SLOTS = Array.from({ length: 10 }, (_, i) => 'light_entity_' + (i + 1));
const multi = (d) => (d.config.views || []).length > 2;
const src = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with rooms', src, null);

// Cleanup first: whatever gets created below is removed even when a step fails.
const made = [];
atFinish(async () => {
  const c2 = await ws();
  const l = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = l.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});

// The old setup's Home: the rooms' light slots in order, groups' members dropped (casoraBasis.topUnits).
const c = await ws();
const states = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
const members = (id) => [].concat(((states[id] || {}).attributes || {}).entity_id || []).filter((x) => typeof x === 'string');
const deep = (id, seen = new Set()) => { if (seen.has(id)) return []; seen.add(id); return members(id).flatMap((x) => [x, ...deep(x, seen)]); };
// The view's casora_room card (also inside stacks/sections).
const roomCard = (x, d = 0) => { if (!x || typeof x !== 'object' || d > 8) return null;
  if (Array.isArray(x)) { for (const y of x) { const r = roomCard(y, d + 1); if (r) return r; } return null; }
  if ([].concat(x.template || []).includes('casora_room') && x.variables) return x;
  return roomCard(x.cards, d + 1) || roomCard(x.sections, d + 1) || roomCard(x.card, d + 1); };
// The phone's badge rows that carry Home's light group (not the template definitions).
const phoneRows = (cfg) => { const out = [];
  (function walk(x, d) { if (!x || typeof x !== 'object' || d > 12) return;
    if (Array.isArray(x)) { x.forEach((y) => walk(y, d + 1)); return; }
    if (x.template === 'casora_mobile_filter_badges' && x.variables && x.variables.light_group_entity) out.push(x.variables);
    Object.keys(x).forEach((k) => { if (k !== 'button_card_templates') walk(x[k], d + 1); }); })(cfg, 0);
  return out; };
const unitsOf = (views) => { const rl = [];
  views.forEach((v) => { const V = (roomCard(v) || {}).variables || {};
    SLOTS.forEach((k) => { if (typeof V[k] === 'string' && V[k] && !rl.includes(V[k])) rl.push(V[k]); }); });
  const inner = new Set(rl.flatMap((id) => deep(id)));
  return rl.filter((id) => !inner.has(id)); };
const cfg = JSON.parse(JSON.stringify(src.config));
const homeCard = roomCard(cfg.views[0]);
await need('Home with its room card', homeCard && homeCard.variables, cfg.views[0] && cfg.views[0].path);
const H = homeCard.variables;
const units = unitsOf(cfg.views.slice(1));
const tree = new Set(H.light_group_entity ? deep(H.light_group_entity) : []);
await need('Home has a house light group over more than ten lights', !!H.light_group_entity && units.length > 10 && units.slice(0, 10).every((id) => tree.has(id)),
  { group: H.light_group_entity, units: units.length });
const OLD = units.slice(0, 10);
SLOTS.forEach((k, i) => { H[k] = OLD[i]; });
const save = async (url, conf, title) => {
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  made.push(url);
  if (!list.some((d) => d.url_path === url)) {
    await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
  }
  await c.cmd({ type: 'lovelace/config/save', url_path: url, config: conf });
};
await save(URL, cfg, 'QA r506 Licht');
// The phone half with the same old slots on its badge row (as the Studio mirrors Home's lights there).
let phone = false;
if (src.phone) {
  const m = JSON.parse(JSON.stringify(src.phone.config));
  const rows = phoneRows(m);
  rows.forEach((V) => SLOTS.forEach((k, i) => { V[k] = OLD[i]; }));
  phone = rows.length > 0;
  await save(URL + '-mobile', m, 'QA r506 Licht Handy');
}
console.log('  info   phone half with Home\'s lights: ' + (phone ? 'yes' : 'no'));
// Case B: the old full list (ten or fewer units): Home and the first rooms while their units fit ten, reversed.
const cfgB = JSON.parse(JSON.stringify(src.config));
let nB = 1;
while (nB < cfgB.views.length && unitsOf(cfgB.views.slice(1, nB + 1)).length <= 10) nB++;
cfgB.views = cfgB.views.slice(0, nB);
const unitsB = unitsOf(cfgB.views.slice(1));
const HB = roomCard(cfgB.views[0]).variables;
SLOTS.forEach((k) => delete HB[k]);
unitsB.slice().reverse().forEach((id, i) => { HB['light_entity_' + (i + 1)] = id; });
await need('case B: two or more rooms with ten or fewer units', nB > 2 && unitsB.length >= 2 && unitsB.every((id) => tree.has(id)), { rooms: nB - 1, units: unitsB.length });
await save(URL_B, cfgB, 'QA r506 Licht B');
c.close();
const live = async (url) => { const c3 = await ws(); try { return await c3.cmd({ type: 'lovelace/config', url_path: url }); } finally { c3.close(); } };
const liveHome = async (url = URL) => roomCard((await live(url)).views[0]).variables;

// ── Studio: open → slots emptied in memory (desktop and phone row), group stays, unsaved; HA unchanged ──
const ph = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
const pg = ph.page; usePage(pg);
const studioState = () => pg.evaluate((slots) => { const p = window.__panel(); const V = p._state.compact.rooms[0].variables;
  const rows = []; const P = p._pair;
  if (P && P.mobile) (function walk(x, d) { if (!x || typeof x !== 'object' || d > 12) return;
    if (Array.isArray(x)) { x.forEach((y) => walk(y, d + 1)); return; }
    if (x.template === 'casora_mobile_filter_badges' && x.variables && x.variables.light_group_entity) rows.push(slots.filter((k) => x.variables[k]).length);
    Object.keys(x).forEach((k) => walk(x[k], d + 1)); })([P.mobile.compact, P.mobile.chrome, P.mobile.scaffold], 0);
  return { group: V.light_group_entity, left: slots.filter((k) => V[k]).length, mark: V.light_slots_checked, dirty: p._isDirty(), blocked: !!p._saveBlocked,
    auto: V.light_rooms_auto, pair: !!(P && P.safe !== false), phoneRows: rows }; }, SLOTS);
await studio(pg, URL);
const st = await studioState();
await check('Studio: the old ten slots are emptied, the group stays, marked', st.group === H.light_group_entity && st.left === 0 && st.mark === true && st.auto === undefined, st);
await check('Studio: shown as unsaved (save bar), saving not blocked', st.dirty && !st.blocked, st);
if (phone) await check('Studio: the phone\'s badge row lost the slots too', st.pair && st.phoneRows.length > 0 && st.phoneRows.every((n) => n === 0), st);
const before = await liveHome();
await check('nothing written before saving (HA still has the ten slots)', SLOTS.every((k) => before[k] === H[k]) && !before.light_slots_checked, SLOTS.map((k) => before[k]));
const saved = await pg.evaluate(() => window.__panel()._save());
await need('Studio saved', saved !== false, saved);
const after = await liveHome();
await check('after one save: HA has the group alone, marked', after.light_group_entity === H.light_group_entity && SLOTS.every((k) => !after[k]) && after.light_slots_checked === true, after);
if (phone) {
  const rows = phoneRows(await live(URL + '-mobile'));
  await check('after one save: the phone\'s badge row has the group alone', rows.length > 0 && rows.every((V) => SLOTS.every((k) => !V[k])), rows.map((V) => SLOTS.filter((k) => V[k]).length));
}
// Reload: nothing offered again, saving stays possible.
await studio(pg, URL);
const st2 = await studioState();
await check('reload: nothing changed again, nothing unsaved', st2.left === 0 && st2.mark === true && !st2.dirty && !st2.blocked, st2);

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
// ── Case B: the full list of ten or fewer units (another order) is emptied too ──
await studio(pg, URL_B);
const sb = await studioState();
await check('case B (' + unitsB.length + ' units, all listed): emptied, group stays', sb.group === HB.light_group_entity && sb.left === 0 && sb.mark === true && sb.dirty, sb);
await pg.evaluate(() => { const p = window.__panel(); if (p && p._discardDraft) p._discardDraft(); });
await finish();
