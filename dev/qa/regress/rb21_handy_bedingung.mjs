// @zustand: arbeit
// @parallel: allein
// Bedingte Kachel (type: conditional) am Handy (gemeldet 06.10.2026): Die Bedingung einer Kachel
// im Studio am Desktop geändert und gespeichert – am Handy galt weiter die alte Bedingung, die
// Kachel war dort sichtbar, am Desktop nicht. Erwartet: Nach dem Speichern trägt die Handy-Kachel
// dieselbe Bedingung (und dieselben Einstellungen der Kachel darin) wie die Raum-Kachel.
// Schreibt Desktop- und Handy-Dashboard (nur Test-HA) und stellt am Ende den vorherigen Stand her.
import { open, usePage, studio, dashboard, casoraDashboard, check, need, finish, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const c0 = await ws();
const states = await c0.cmd({ type: 'get_states' });
c0.close();
const alarm = (states.find((s) => s.entity_id.startsWith('alarm_control_panel.')) || {}).entity_id;
await need('Alarmanlage im Testhaus', alarm);
const now = states.find((s) => s.entity_id === alarm).state;

const d0 = JSON.parse(JSON.stringify(dash.config)), m0 = JSON.parse(JSON.stringify(dash.phone.config));
const save = async (url, config) => { const c = await ws(); await c.cmd({ type: 'lovelace/config/save', url_path: url, config }); c.close(); };
let restored = false;
const restore = async () => { if (!restored) { restored = true; await save(dash.url, d0); await save(dash.phone.url, m0); } };
atFinish(restore);

// Home: Alarm-Kachel in einer bedingten Karte, die beim jetzigen Zustand ausgeblendet ist.
const d = JSON.parse(JSON.stringify(d0));
const home = d.views.find((v) => v.path === 'home') || d.views[0];
const tiles = home.cards[2].cards;
const at = tiles.findIndex((t) => [].concat(t.template || [])[0] === 'casora_alarm');
const inner = { type: 'custom:button-card', template: 'casora_alarm', entity: alarm, name: 'QA Alarm', variables: { modes: ['armed_home', 'armed_away'] } };
const shell = { type: 'conditional', conditions: [{ condition: 'state', entity: alarm, state: ['armed_vacation', 'triggered'] }], card: inner };
if (at >= 0) tiles[at] = shell; else tiles.unshift(shell);
await save(dash.url, d);

const findShell = (cfg) => {
  let hit = null;
  const walk = (o) => { if (hit || !o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk);
    if (o.type === 'conditional' && o.card && o.card.entity === alarm && [].concat(o.card.template || [])[0] === 'casora_alarm') { hit = o; return; }
    Object.values(o).forEach(walk); };
  walk(cfg.views);
  return hit;
};
const phoneShell = async () => { const c = await ws(); const cfg = await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url }); c.close(); return findShell(cfg); };

const { page, browser } = await open({ width: 1600, height: 1000, dark: false });
usePage(page);
const H = (fn, a) => page.evaluate(fn, a);
const saveStudio = async () => {
  await H(() => { const p = window.__panel(); p._markDirty(); p._bClose && p._bClose(); document.body.focus(); });
  await page.keyboard.press('Meta+s');
  return page.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 })
    .then(() => true).catch(() => false);
};

// 1. Wie nach einem Umzug: Die Handy-Kachel trägt eine andere Bedingung (dort sichtbar, am Desktop
//    nicht) und andere Einstellungen. Im Studio die Einstellung der Kachel ändern und speichern.
await studio(page, dash.url);
const setup = await H(({ ent, now }) => {
  const p = window.__panel(), pair = p._pair;
  const link = pair && (pair.link.links || []).find((l) => l.overview && l.section !== null);
  const room = link && p._state.compact.rooms[link.room];
  const sec = link && pair.mobile.compact.rooms[link.section];
  const t = room && (room.tiles || []).find((x) => x && x.type === 'conditional' && x.card && x.card.entity === ent);
  if (!t || !sec) return null;
  const old = JSON.parse(JSON.stringify(t));
  old.conditions = [{ condition: 'state', entity: ent, state: [now, 'armed_vacation', 'triggered'] }];
  old.card.variables = { modes: ['armed_home'] };
  sec.tiles = [old, ...(sec.tiles || [])];
  t.card.variables = { ...(t.card.variables || {}), modes: ['armed_away'] };
  return { section: sec.name };
}, { ent: alarm, now });
await need('Desktop-Kachel und Handy-Abschnitt gefunden', setup);
// Wie frisch geladen: Das Studio merkt sich den gespeicherten Handy-Stand und zeigt an der Kachel den Hinweis.
const hint = await H(async (ent) => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  p._pair.phoneConds = I.phoneCondSnapshot(p._pair);
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r) => (r.tiles || []).some((x) => x && x.type === 'conditional' && x.card && x.card.entity === ent));
  const tile = rooms[ri].tiles.find((x) => x && x.type === 'conditional' && x.card && x.card.entity === ent);
  if (ri !== p._room) { p._room = ri; p._renderTabs(); p._renderForm(); }
  p._bOpen = true;
  p._select({ group: 'tiles', key: p._tileKey(tile), label: 'QA Alarm' });
  await new Promise((r) => setTimeout(r, 1500));
  const h = [...p.shadowRoot.querySelectorAll('#pane .condphone')].find((x) => x.getClientRects().length);
  return h ? h.textContent : null;
}, alarm);
await shot('studio hinweis handy-bedingung');
await check('Studio: Hinweis „Am Handy ist eine andere Bedingung gespeichert“', /Am Handy ist eine andere Bedingung/.test(hint || ''), hint);
await check('Studio speichert', await saveStudio());
const p2 = await phoneShell();
await need('Bedingte Alarm-Kachel ist am Handy', p2, { alarm });
await check('Handy: Bedingung wie am Desktop', JSON.stringify(p2.conditions) === JSON.stringify(shell.conditions), p2.conditions);
await check('Handy: Einstellung der Kachel darin wie am Desktop', JSON.stringify((p2.card.variables || {}).modes) === JSON.stringify(['armed_away']), p2.card.variables);
await browser.close();

// Am Handy: die Alarm-Kachel folgt jetzt der Desktop-Bedingung und ist beim jetzigen Zustand aus.
const ph = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false });
usePage(ph.page);
const mv = (m0.views || [])[0] || {};
await dashboard(ph.page, dash.phone.url + '/' + (mv.path || '0'), 3);
const seen = await ph.page.evaluate((ent) => window.__pierce('button-card').some((b) => b._config && b._config.entity === ent
  && [].concat(b._config.template || []).includes('casora_alarm') && b.getBoundingClientRect().height > 0), alarm);
await shot('handy nach speichern');
await check('Handy: Alarm-Kachel ausgeblendet wie am Desktop', !seen, { zustand: now });
await ph.browser.close();
await restore();
await finish();
