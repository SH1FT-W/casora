// @zustand: frisch
// @parallel: allein   (legt ein Hemma-Paar und das umgezogene Casora-Paar an, löscht beides am Ende)
// @deckt: custom_components/casora/panel/casora-panel-umzug.js custom_components/casora/panel/casora-panel.js
// Umzug-Prüfung 10.10.2026, Haus „Sonderfälle“: Ein Hemma-2-Paar (Desktop + Handy, deutsch) mit
// einem RAUM namens „Favoriten“ neben dem Favoriten-Abschnitt, einem leeren Raum und einem sehr
// langen Raumnamen. Erwartet nach dem Umzug: alle Räume da (Reihenfolge, Namen, leerer Raum
// leer), am Handy bleibt „Favoriten“ ein Raum (Merkmal favorites: false, mit Pfeil) und der
// Favoriten-Abschnitt bleibt der Favoriten-Abschnitt; keine Fehlerkarten.
// Vorher wurde der Raum „Favoriten“ zum zweiten Favoriten-Abschnitt – ohne Pfeil, nicht zu öffnen.
import { open, ready, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const SRC = 'qa-umzug-sonder';
const LANG = 'Wohnzimmer mit offener Küche, Essbereich und Wintergarten im Erdgeschoss';
const c = await ws();
const before = (await c.cmd({ type: 'lovelace/dashboards/list' })).map((d) => d.url_path);
const base = ['hemma-zuhause', 'hemma-zwei'].find((u) => before.includes(u));
await need('Hemma-2-Dashboard im Zustand frisch', !!base);
const settings0 = (await c.cmd({ type: 'casora/settings/get' })).settings || {};
const made = [SRC, SRC + '-mobile'];
atFinish(async () => {
  const c2 = await ws();
  for (const d of await c2.cmd({ type: 'lovelace/dashboards/list' }))
    if (made.includes(d.url_path) && !before.includes(d.url_path)) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id });
  const s1 = (await c2.cmd({ type: 'casora/settings/get' })).settings || {};
  if (settings0.umzug) s1.umzug = settings0.umzug; else delete s1.umzug;
  await c2.cmd({ type: 'casora/settings/set', settings: s1 });
  c2.close();
});

const { page } = await open({ width: 1440, height: 900, umzug: true });
await ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return p && p._hass && p._casoraUmzugRun && window.casoraUmzug; });
const r = await page.evaluate(async ({ base, SRC, LANG }) => {
  const p = window.__panel(); const h = p._hass; const U = window.casoraUmzug; const I = window.__casoraPanelInternals;
  const raw = await h.callWS({ type: 'lovelace/config', url_path: base });
  const views = raw.views;
  const roomView = views.find((v, i) => i > 0 && (v.cards || []).some((x) => x.type === 'custom:hemma-smart-row' && (x.cards || []).length));
  if (!roomView) return { err: 'kein Raum mit Kacheln im Hemma-Dashboard' };
  const copy = (name, path, empty) => {
    const v = JSON.parse(JSON.stringify(roomView));
    v.path = path; v.title = path;
    const hero = v.cards[0]; hero.name = name;
    if (empty) v.cards.forEach((x) => { if (x.type === 'custom:hemma-smart-row') x.cards = []; });
    return v;
  };
  views.push(copy('Favoriten', 'favoriten'), copy(LANG, 'langer-raum'), copy('Leerer Raum', 'leerer-raum', true));
  // Handy wie Hemma 2.1.2 es anlegt: erster Abschnitt „Favoriten“ (deutsch), dann die Räume – ohne Merkmale.
  const bundle = await p._bundleOnce();
  const desk = I.extractAny(window.casoraRename(JSON.parse(JSON.stringify(raw)), 'hemma'));
  const st = I.mobileFromRooms(bundle.mobile, bundle.templates, desk.compact.rooms);
  const mcfg = I.expandAny(st, { extras: {}, templates: bundle.templates });
  let first = true;
  (function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== 'object') return;
    if (o.template === 'casora_mobile_header') {
      if (o.variables) delete o.variables.favorites;
      if (o.name === 'Favorites' && first) { o.name = 'Favoriten'; first = false; }
    }
    Object.keys(o).forEach((k) => { if (k !== 'button_card_templates') walk(o[k]); }); })(mcfg.views);
  const hemma = (o) => JSON.parse(JSON.stringify(o).replace(/casora_/g, 'hemma_').replace(/custom:casora-/g, 'custom:hemma-'));
  for (const [u, cfg] of [[SRC, raw], [SRC + '-mobile', hemma(mcfg)]]) {
    await h.callWS({ type: 'lovelace/dashboards/create', url_path: u, title: 'QA Sonderfälle', show_in_sidebar: false, require_admin: false });
    await h.callWS({ type: 'lovelace/config/save', url_path: u, config: cfg });
  }
  const heads = (cfg) => { const out = []; (function walk(o) { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== 'object') return;
    if (/_mobile_header$/.test(String(o.template || '')) && o.name) out.push([o.name, (o.variables || {}).favorites]);
    Object.keys(o).forEach((k) => { if (k !== 'button_card_templates') walk(o[k]); }); })(cfg.views); return out; };
  const hemmaHeads = heads(hemma(mcfg));
  const list = await U.candidates(p, { includeDone: true });
  const cand = list.find((x) => x.url_path === SRC);
  if (!cand || !cand.rawMobile) return { err: 'Hemma-Paar nicht als Kandidat mit Handy erkannt' };
  const a = await U.analyze(cand, bundle, h);
  a.newTitle = 'QA Sonder neu';
  p._flowOpen('full');
  const done = new Promise((resolve) => { const o = p._flowDone; p._flowDone = function (x) { p._flowDone = o; const res = o.call(this, x); resolve(x && x.url_path); return res; }; });
  p._casoraUmzugRun(a, {});
  const url = await Promise.race([done, new Promise((res) => setTimeout(() => res(null), 90000))]);
  if (!url) return { err: 'Umzug nicht fertig' };
  const after = (I.extractAny(await h.callWS({ type: 'lovelace/config', url_path: url })).compact || {}).rooms || [];
  const mob = await h.callWS({ type: 'lovelace/config', url_path: url + '-mobile' });
  return { url, hemmaHeads, beforeRooms: a.rooms.map((x) => [x.name, x.tiles.length]),
    afterRooms: after.map((x) => [x.name, (x.tiles || []).filter((t) => t.entity).length]), mobHeads: heads(mob) };
}, { base, SRC, LANG });
if (r.err) await check('Vorbereitung/Umzug', false, r.err);
else {
  made.push(r.url, r.url + '-mobile');
  await check('Testdaten: Handy hat zweimal „Favoriten“ (Abschnitt + Raum), ohne Merkmal',
    r.hemmaHeads.filter((x) => x[0] === 'Favoriten' && x[1] === undefined).length === 2, r.hemmaHeads);
  const n = (list) => list.map((x) => x[0]);
  await check('gleich viele Räume', r.beforeRooms.length === r.afterRooms.length, [r.beforeRooms.length, r.afterRooms.length]);
  await check('Raum „Favoriten“, langer Name und leerer Raum da', ['Favoriten', LANG, 'Leerer Raum'].every((x) => n(r.afterRooms).includes(x)), n(r.afterRooms));
  const leer = r.afterRooms.find((x) => x[0] === 'Leerer Raum');
  await check('leerer Raum bleibt leer', !!leer && leer[1] === 0, leer);
  const fav = r.afterRooms.find((x) => x[0] === 'Favoriten'), src = r.beforeRooms.find((x) => x[0] === 'Favoriten');
  await check('Raum „Favoriten“ behält seine Kacheln', !!fav && !!src && fav[1] > 0, [src, fav]);
  const favHeads = r.mobHeads.filter((x) => /^(Favorites|Favoriten)$/.test(x[0]));
  await check('Handy: ein Favoriten-Abschnitt + Raum „Favoriten“ mit favorites: false',
    favHeads.length === 2 && favHeads.filter((x) => x[1] === false).length === 1 && favHeads.some((x) => x[0] === 'Favoriten' && x[1] === false), r.mobHeads);
  // Am Handy: Raum „Favoriten“ mit Pfeil, Favoriten-Abschnitt ohne.
  const o2 = await open({ width: 393, height: 852, mobile: true, safari: true });
  await dashboard(o2.page, r.url + '-mobile/home', 3);
  const arrows = await o2.page.evaluate(() => window.__pierce('button-card')
    .filter((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_header') && /^(Favorites|Favoriten)$/.test(String(b._config.name)))
    .map((b) => { const a = b.shadowRoot && b.shadowRoot.querySelector('#arrow'); return [b._config.name, ((b._config.variables || {}).favorites), a ? getComputedStyle(a).display : 'fehlt']; }));
  await check('Handy: Raum „Favoriten“ hat einen Pfeil', arrows.some((x) => x[1] === false && x[2] !== 'none'), arrows);
  await check('Handy: Favoriten-Abschnitt ohne Pfeil', arrows.some((x) => x[1] !== false && x[2] === 'none'), arrows);
  await dashboard(page, r.url + '/home');
  const errs = await page.evaluate(() => window.__pierce('hui-error-card').filter((e) => e.getBoundingClientRect().height > 0).length);
  await check('keine Fehlerkarten', errs === 0, errs);
}
c.close();
await finish();
