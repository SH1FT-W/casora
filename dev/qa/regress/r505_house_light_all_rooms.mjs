// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-basis.js custom_components/casora/scripts/local/01-basis.js custom_components/casora/scripts/local/03-popups.js
// Found in the gate (02.11.2026): a dashboard set up fresh (E2E t03 builds „Test Neu“) gave Home's light badge the
// house's HA light group AND the first ten of its lights (light_entity_1…10). Picked lights win over the group in the
// popup (#80), so the house light popup listed only those ten – rooms past the tenth (with their room group) were
// missing. Expected: every lamp of the rooms' light badges is in a room of the house light popup.
// Desktop 1440×900 on test-neu (else the first Casora dashboard). Nothing is switched or saved.
import { open, casoraDashboard, dashboard, check, need, finish, usePage, shot } from './lib.mjs';

const multi = (d) => (d.config.views || []).length > 1;
const dash = await casoraDashboard((d) => d.url === 'test-neu' && multi(d)) || await casoraDashboard(multi);
await need('Casora dashboard with rooms', dash, null);
const shots = process.env.R505_SHOTS;

const ph = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
const pg = ph.page; usePage(pg);
await dashboard(pg, dash.url, 2);
await pg.evaluate(() => window._casoraFilter && window._casoraFilter.set('all'));
await pg.waitForTimeout(1500);

const at = await pg.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => /casora_badge_light_group\b/.test([].concat((x._config || {}).template || []).join(' ')) && x.getBoundingClientRect().width > 20);
  if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Home light badge on ' + dash.url, at);
await pg.mouse.move(at.x, at.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up();
let res = null;
for (let i = 0; i < 30; i++) {
  await pg.waitForTimeout(250);
  res = await pg.evaluate(() => {
    const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
    const c = window._casoraLightSoft && window._casoraLightSoft.cur;
    if (!c || !c.rooms) return null;
    const S = document.querySelector('home-assistant').hass.states;
    // Lamps behind an id: a group's existing members (deep), else the id itself.
    const lamps = (id, seen = new Set()) => {
      if (seen.has(id) || !S[id]) return []; seen.add(id);
      const m = (S[id].attributes || {}).entity_id;
      const own = Array.isArray(m) ? m.flatMap((x) => lamps(x, seen)) : [];
      return own.length ? own : [id];
    };
    // Every lamp the rooms' light badges list (the room views' casora_room, Home left out).
    const cfg = window._casoraLovelaceCfg && window._casoraLovelaceCfg();
    const want = new Map();
    (cfg.views || []).forEach((v, vi) => {
      if (vi === 0) return;
      (function find(x, d) {
        if (!x || typeof x !== 'object' || d > 6) return;
        if (Array.isArray(x)) { x.forEach((y) => find(y, d + 1)); return; }
        if ([].concat(x.template || []).includes('casora_room') && x.variables) {
          const V = x.variables; if (V.show_lights === false) return;
          const ids = [V.light_group_entity].concat(Array.from({ length: 10 }, (_, k) => V['light_entity_' + (k + 1)]))
            .filter((y) => typeof y === 'string' && y.startsWith('light.'));
          ids.flatMap((y) => lamps(y)).forEach((y) => want.set(y, v.title || v.path));
          return;
        }
        find(x.cards, d + 1);
      })(v.cards, 0);
    });
    const have = new Set(c.rooms.flatMap((r) => (r.lights || []).flatMap((y) => lamps(y))));
    const missing = [...want.entries()].filter(([id]) => !have.has(id));
    return { rooms: c.rooms.map((r) => r.name), want: want.size, missing: [...new Set(missing.map(([, room]) => room))], ids: missing.map(([id]) => id).slice(0, 6) };
  });
  if (res) break;
}
if (shots) await pg.screenshot({ path: `${shots}/house-rooms.png` });
await need('house light popup with rooms', res, res);
await check('every room lamp is in the house light popup (' + res.want + ' lamps, ' + res.rooms.length + ' rooms)', res.want > 0 && !res.missing.length,
  { missing: res.missing, ids: res.ids, rooms: res.rooms });
await shot('house_rooms');
await pg.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
await finish();
