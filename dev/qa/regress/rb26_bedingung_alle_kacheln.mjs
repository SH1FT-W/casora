// @zustand: arbeit
// @parallel: allein
// Anzeige-Bedingung bei allen Kacheln (gemeldet 09.10.2026): Im Studio fehlte der Bereich bei Auto,
// E-Bike, Abfall (nur schon bedingte Kacheln hatten ihn, neue Bedingungen ließen sich nicht setzen);
// beim Saugroboter aus Hemma (oder mit „nicht“ darin) stand die Bedingung nur als Text oben.
// Erwartet: Jede Kachel hat unter „Sichtbarkeit“ den Bereich „Anzeigen, wenn“; „+ Bedingung“ legt sie
// an, gespeichert blendet sie die Kachel am Desktop und am Handy aus/ein; die letzte Zeile entfernt
// nimmt sie wieder ab. Der Saugroboter zeigt seine Bedingung als bearbeitbare Zeilen.
// Schreibt Desktop- und Handy-Dashboard (nur Test-HA) und stellt am Ende den vorherigen Stand her.
import { open, usePage, studio, dashboard, casoraDashboard, check, need, finish, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

// Ein Dashboard mit Auto, E-Bike, Abfall und Saugroboter (das Prüf-Dashboard qa-arbeit hat kein Auto).
const hasAll = (d) => ['casora_car', 'casora_ebike', 'casora_trash', 'casora_vacuum'].every((t) => JSON.stringify(d.config || {}).includes('"' + t + '"'));
const dash = (await casoraDashboard(hasAll)) || (await casoraDashboard());
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const c0 = await ws();
const states = await c0.cmd({ type: 'get_states' });
c0.close();
const alarm = (states.find((s) => s.entity_id.startsWith('alarm_control_panel.')) || {}).entity_id;
await need('Alarmanlage im Testhaus', alarm);
const now = states.find((s) => s.entity_id === alarm).state;
const bins = states.filter((s) => s.entity_id.startsWith('binary_sensor.')).slice(0, 2).map((s) => s.entity_id);

const d0 = JSON.parse(JSON.stringify(dash.config)), m0 = JSON.parse(JSON.stringify(dash.phone.config));
const save = async (url, config) => { const c = await ws(); await c.cmd({ type: 'lovelace/config/save', url_path: url, config }); c.close(); };
let restored = false;
const restore = async () => { if (!restored) { restored = true; await save(dash.url, d0); await save(dash.phone.url, m0); } };
atFinish(restore);
const getCfg = async (url) => { const c = await ws(); const cfg = await c.cmd({ type: 'lovelace/config', url_path: url }); c.close(); return cfg; };
const tplOf = (o) => [].concat((o && o.template) || [])[0];
// Auto-Kacheln im Handy-Dashboard: [{ cond: bedingt?, conditions }]
const phoneCars = async () => {
  const out = [];
  const walk = (o, sh) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach((x) => walk(x, sh));
    if (o.type === 'conditional') return walk(o.card, o);
    if (o.type === 'custom:button-card' && tplOf(o) === 'casora_car') { out.push({ cond: !!sh, conditions: sh ? sh.conditions : null }); return; }
    Object.values(o).forEach((x) => walk(x, sh)); };
  walk((await getCfg(dash.phone.url)).views, null);
  return out;
};

const { page, browser } = await open({ width: 1600, height: 1000, dark: false });
usePage(page);
const H = (fn, a) => page.evaluate(fn, a);
const saveStudio = async (pg0) => {
  await pg0.evaluate(() => { const p = window.__panel(); p._markDirty(); });
  await pg0.keyboard.press('Meta+s');
  return pg0.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 })
    .then(() => true).catch(() => false);
};
// Kachel einer Vorlage auswählen; mod(tile) darf sie vorher (nur im Speicher) ändern.
const pick = (tpl, mod) => H(async ({ tpl, mod }) => {
  const p = window.__panel();
  const rooms = p._state.compact.rooms;
  const isT = (x) => x && [].concat((x.type === 'conditional' ? x.card : x).template || [])[0] === tpl;
  const ri = rooms.findIndex((r) => (r.tiles || []).some(isT));
  if (ri < 0) return null;
  const ti = rooms[ri].tiles.findIndex(isT);
  if (mod) { const f = new Function('t', mod); const n = f(rooms[ri].tiles[ti]); if (n) rooms[ri].tiles[ti] = n; }
  const tile = rooms[ri].tiles[ti];
  if (ri !== p._room) { p._room = ri; p._renderTabs(); }
  p._bOpen = true;
  p._renderForm();
  p._select({ group: 'tiles', key: p._tileKey(tile), label: tpl });
  await new Promise((r) => setTimeout(r, 1200));
  const sel = p.shadowRoot.querySelector('#pane #band-tiles .tile.sel');
  const vis = sel && sel.querySelector('.adv.uxvis');
  return {
    room: rooms[ri].name, path: rooms[ri].path,
    inVis: !!(vis && vis.querySelector('.condarea .condedit')),
    add: !!(vis && vis.querySelector('.condarea .condadd')),
    rows: vis ? vis.querySelectorAll('.condarea .condrow').length : 0,
    ops: vis ? [...vis.querySelectorAll('.condarea .condrow')].map((r) => { const c = r.querySelectorAll('.combo')[1]; const i = c && c.querySelector('input'); return i ? i.value : ''; }) : [],
  };
}, { tpl, mod: mod || null });

// 1. Bereich bei Auto, E-Bike, Abfall, Saugroboter – unter „Sichtbarkeit“, mit „+ Bedingung“.
await studio(page, dash.url);
let carPath = null;
for (const tpl of ['casora_car', 'casora_ebike', 'casora_trash', 'casora_vacuum']) {
  const r = await pick(tpl);
  await need('Kachel ' + tpl + ' im Dashboard', r);
  if (tpl === 'casora_car') carPath = r.path;
  await check(tpl + ': Bereich „Anzeigen, wenn“ unter Sichtbarkeit', r.inVis && r.add, r);
}
// 2. Saugroboter wie aus Hemma: oder mit „nicht“ darin – drei bearbeitbare Zeilen, die erste „ist nicht“.
const vac = await pick('casora_vacuum', `return t.type === 'conditional' ? null : { type: 'conditional', conditions: [{ condition: 'or', conditions: [
  { condition: 'not', conditions: [{ condition: 'state', entity: ${JSON.stringify(alarm)}, state: ['idle', 'charging'] }] },
  ${bins.map((b) => `{ condition: 'state', entity: '${b}', state: 'on' }`).join(',')} ] }], card: t };`);
await shot('saugroboter bedingung');
await check('Saugroboter: Bedingung als Zeilen', vac && vac.rows === 1 + bins.length, vac);
await check('Saugroboter: „nicht (… ist …)“ als „ist nicht“', vac && /^(isnot|ist nicht|is not)$/.test(vac.ops[0] || ''), vac && vac.ops);
await browser.close();

// 3. Auto: „+ Bedingung“ im Studio, Bedingung, die jetzt nicht gilt → am Desktop und Handy weg.
const p2 = await open({ width: 1600, height: 1000, dark: false });
const pg = p2.page;
usePage(pg);
await studio(pg, dash.url);
const P = (fn, a) => pg.evaluate(fn, a);
const pickP = (tpl) => P(async (tpl) => {
  const p = window.__panel();
  const openVis = (p) => { const v = p.shadowRoot.querySelector('#pane .tile.sel .adv.uxvis'); if (v && !v.classList.contains('open')) v.querySelector('.advsum').click(); };
  const rooms = p._state.compact.rooms;
  const isT = (x) => x && [].concat((x.type === 'conditional' ? x.card : x).template || [])[0] === tpl;
  const ri = rooms.findIndex((r) => (r.tiles || []).some(isT));
  const tile = rooms[ri].tiles.find(isT);
  if (ri !== p._room) { p._room = ri; p._renderTabs(); }
  p._bOpen = true; p._renderForm();
  p._select({ group: 'tiles', key: p._tileKey(tile), label: tpl });
  await new Promise((r) => setTimeout(r, 1200));
  openVis(p);
  await new Promise((r) => setTimeout(r, 600));
  return ri;
}, tpl);
const ri = await pickP('casora_car');
const added = await P(async (ri) => {
  const p = window.__panel();
  const btn = [...p.shadowRoot.querySelectorAll('#pane .tile.sel .condarea .condadd')].find((b) => b.getClientRects().length);
  if (!btn) return null;
  btn.click();
  await new Promise((r) => setTimeout(r, 1000));
  const t = p._state.compact.rooms[ri].tiles.find((x) => x && x.type === 'conditional' && x.card && [].concat(x.card.template || [])[0] === 'casora_car');
  const rows = [...p.shadowRoot.querySelectorAll('#pane .tile.sel .condarea .condrow')].filter((x) => x.getClientRects().length).length;
  return { wrapped: !!t, rows };
}, ri);
await shot('auto bedingung angelegt');
await check('Auto: „+ Bedingung“ legt die Bedingung an (eine leere Zeile sichtbar)', added && added.wrapped && added.rows === 1, added);
// Zeile füllen wie das Formular (Modell → condWrite): Alarm in einem Zustand, den er jetzt nicht hat.
await P(({ ri, alarm }) => {
  const p = window.__panel();
  const t = p._state.compact.rooms[ri].tiles.find((x) => x && x.type === 'conditional' && x.card && [].concat(x.card.template || [])[0] === 'casora_car');
  t.conditions = [{ condition: 'state', entity: alarm, state: ['armed_vacation', 'triggered'] }];
}, { ri, alarm });
await check('Studio speichert (Auto mit Bedingung)', await saveStudio(pg));
const cars1 = await phoneCars();
await check('Handy: Auto-Kachel trägt die Bedingung (genau einmal)', cars1.length === 1 && cars1[0].cond
  && JSON.stringify(cars1[0].conditions) === JSON.stringify([{ condition: 'state', entity: alarm, state: ['armed_vacation', 'triggered'] }]), cars1);
await p2.browser.close();

const carSeen = async (pg2) => pg2.evaluate(() => window.__pierce('button-card').some((b) => b._config
  && [].concat(b._config.template || []).includes('casora_car') && b.getBoundingClientRect().height > 0));
const views = (cfg) => (cfg.views || []);
const deskView = () => { const v = views(d0).find((x) => x.path === carPath) || views(d0)[0]; return dash.url + '/' + (v.path || '0'); };
const phoneView = () => { const v = views(m0)[0] || {}; return dash.phone.url + '/' + (v.path || '0'); };
const look = async (label) => {
  const a = await open({ width: 1600, height: 1000, dark: false });
  usePage(a.page);
  await dashboard(a.page, deskView(), 3);
  const desk = await carSeen(a.page);
  await shot('desktop ' + label);
  await a.browser.close();
  const b = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false });
  usePage(b.page);
  await dashboard(b.page, phoneView(), 3);
  const phone = await carSeen(b.page);
  await shot('handy ' + label);
  await b.browser.close();
  return { desk, phone };
};
const off = await look('auto bedingung aus');
await check('Desktop: Auto-Kachel ausgeblendet', !off.desk, { zustand: now });
await check('Handy: Auto-Kachel ausgeblendet', !off.phone, { zustand: now });

// 4. Bedingung gilt jetzt → sichtbar; dann die letzte Zeile entfernen → wieder ohne Bedingung.
const p3 = await open({ width: 1600, height: 1000, dark: false });
usePage(p3.page);
await studio(p3.page, dash.url);
const Q = (fn, a) => p3.page.evaluate(fn, a);
const ri3 = await Q(async ({ alarm, now }) => {
  const p = window.__panel();
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r) => (r.tiles || []).some((x) => x && x.type === 'conditional' && x.card && [].concat(x.card.template || [])[0] === 'casora_car'));
  if (ri < 0) return -1;
  const t = rooms[ri].tiles.find((x) => x && x.type === 'conditional' && x.card && [].concat(x.card.template || [])[0] === 'casora_car');
  t.conditions = [{ condition: 'state', entity: alarm, state: now }];
  return ri;
}, { alarm, now });
await need('Auto-Kachel mit Bedingung nach dem Laden', ri3 >= 0);
await Q(() => { const p = window.__panel(); p._markDirty(); });
await p3.page.keyboard.press('Meta+s');
await p3.page.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).catch(() => {});
await p3.browser.close();
const on = await look('auto bedingung an');
await check('Desktop: Auto-Kachel sichtbar, wenn die Bedingung gilt', on.desk);
await check('Handy: Auto-Kachel sichtbar, wenn die Bedingung gilt', on.phone);

const p4 = await open({ width: 1600, height: 1000, dark: false });
usePage(p4.page);
await studio(p4.page, dash.url);
const pgSave = p4.page;
const ri4 = await pgSave.evaluate(async () => {
  const p = window.__panel();
  const rooms = p._state.compact.rooms;
  const isT = (x) => x && x.type === 'conditional' && x.card && [].concat(x.card.template || [])[0] === 'casora_car';
  const ri = rooms.findIndex((r) => (r.tiles || []).some(isT));
  const tile = rooms[ri].tiles.find(isT);
  if (ri !== p._room) { p._room = ri; p._renderTabs(); }
  p._bOpen = true; p._renderForm();
  p._select({ group: 'tiles', key: p._tileKey(tile), label: 'Auto' });
  await new Promise((r) => setTimeout(r, 1200));
  const v = p.shadowRoot.querySelector('#pane .tile.sel .adv.uxvis');
  if (v && !v.classList.contains('open')) v.querySelector('.advsum').click();
  await new Promise((r) => setTimeout(r, 600));
  const del = [...p.shadowRoot.querySelectorAll('#pane .tile.sel .condarea .conddel')].find((b) => b.getClientRects().length);
  if (!del) return -1;
  del.click();
  await new Promise((r) => setTimeout(r, 800));
  return rooms[ri].tiles.some((x) => x && x.type !== 'conditional' && [].concat(x.template || [])[0] === 'casora_car') ? ri : -2;
});
await check('Studio: letzte Zeile entfernt nimmt die Bedingung ab', ri4 >= 0, ri4);
await pgSave.evaluate(() => { const p = window.__panel(); p._markDirty(); });
await pgSave.keyboard.press('Meta+s');
await pgSave.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).catch(() => {});
await p4.browser.close();
const cars2 = await phoneCars();
await check('Handy: Auto-Kachel wieder ohne Bedingung (genau einmal)', cars2.length === 1 && !cars2[0].cond, cars2);

await restore();
await finish();
