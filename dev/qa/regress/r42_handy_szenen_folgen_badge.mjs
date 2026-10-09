// @zustand: arbeit
// Wunsch (04.10.2026, 1.0.5): Im Studio wählt man an der Szenen-Badge (Desktop/Tablet), welche
// Szenen gezeigt werden. Am Handy zeigte der Leistenpunkt „Szenen“ trotzdem ALLE Szenen: die
// Auswahl (scene_order/scene_exclude) ging beim Speichern an casora-nav, Szenen-Seite und
// casora_scene_row, aber nicht an die Handy-Leiste (casora-mobile-nav).
// Erwartet: Badge auf 3 Szenen stellen + speichern → das Szenen-Menü der Handy-Leiste zeigt genau
// diese 3 in derselben Reihenfolge. Auch ein Handy-Layout ohne die Schlüssel an der Leiste (wie vor
// 1.0.5 gespeichert) zeigt die Auswahl (zur Laufzeit aus dem Desktop-Dashboard), und das nächste
// Öffnen des Studios schreibt sie an die Leiste. Am Ende wird die alte Auswahl wieder gespeichert.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

const KEYS = ['scenes', 'scene_exclude', 'scene_order'];

// Auswahl im Studio setzen (wie die Szenen-Badge: scene_order + scene_exclude an allen Räumen) und speichern.
const pickAndSave = async (want) => {
  const s = await open();
  await studio(s.page, dash.url);
  const r = await s.page.evaluate(async ([want, KEYS]) => {
    const p = window.__panel(), rooms = p._state.compact.rooms;
    const before = {};
    KEYS.forEach((k) => { if (rooms[0].variables[k] !== undefined) before[k] = JSON.parse(JSON.stringify(rooms[0].variables[k])); });
    const cat = p._sceneCatalog().map((x) => x.id);
    let set = want;
    if (want === 'drei') {
      const three = cat.slice(1, 4).reverse();
      set = { scene_order: three, scene_exclude: cat.filter((id) => !three.includes(id)) };
    }
    rooms.forEach((r) => KEYS.forEach((k) => {
      if (set[k] === undefined) delete r.variables[k]; else r.variables[k] = JSON.parse(JSON.stringify(set[k]));
    }));
    p._markDirty && p._markDirty();
    const saved = await p._save();
    return { before, cat, set, saved };
  }, [want, KEYS]);
  await s.browser.close();
  return r;
};

// Namen im Szenen-Menü der Handy-Leiste (Home, kein Raum).
// want: erwartete Liste – dann bis zu 20 s darauf warten. Die Handy-Leiste liest die Auswahl ohne
// Schlüssel zur Laufzeit aus dem Desktop-Dashboard (WebSocket, unter Last später); vorher zeigt sie
// alle Szenen. Mit 1,4 s fester Wartezeit war der Test im Gate rot, einzeln grün (09.10.2026).
const phoneMenu = async (want) => {
  const { page, browser } = await open({ width: 390, height: 844, mobile: true, safari: true });
  usePage(page);
  const c = await ws();
  const phone = await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url });
  c.close();
  await dashboard(page, dash.phone.url + '/' + (phone.views[0].path || '0'), 3);
  let out = null;
  const until = Date.now() + (want ? 20000 : 8400);
  for (let i = 0; Date.now() < until; i++) {
    out = await page.evaluate(() => {
      const nav = window.__pierce('casora-mobile-nav')[0];
      if (!nav || !nav._hass) return null;
      if (window._casoraFilter) window._casoraFilter.set('all');
      nav._closeMenu && nav._closeMenu();
      nav._bScenes.click();
      const names = [...document.querySelectorAll('.hmn-menu .hmn-item')].map((b) => b.title);
      nav._closeMenu && nav._closeMenu();
      return names;
    });
    if (out && out.length && (want ? JSON.stringify(out) === JSON.stringify(want) : i >= 2)) break;
    await page.waitForTimeout(700);
  }
  await browser.close();
  return out || [];
};

const ws1 = await ws();
const states = await ws1.cmd({ type: 'get_states' });
ws1.close();
const fname = (id) => ((states.find((x) => x.entity_id === id) || {}).attributes || {}).friendly_name || id;

const a = await pickAndSave('drei');
await need('mindestens 4 Szenen im Katalog', a.cat.length >= 4, a.cat);
await need('Studio hat gespeichert', a.saved !== false, a);
const want = a.set.scene_order.map(fname);

try {
  // 1) Frisch gespeichert: die Leiste trägt die Auswahl.
  const c = await ws();
  const phone = await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url });
  const navCard = (phone.views[0].cards || []).find((x) => x && x.type === 'custom:casora-mobile-nav') || {};
  await check('Handy-Leiste trägt die Badge-Auswahl', JSON.stringify(navCard.scene_order) === JSON.stringify(a.set.scene_order), navCard.scene_order);
  const shown = await phoneMenu(want);
  await check('Handy-Menü „Szenen“ zeigt genau die 3 Szenen der Badge', JSON.stringify(shown) === JSON.stringify(want), { shown, want });

  // 2) Wie vor 1.0.5 gespeichert: Leiste ohne Szenen-Schlüssel → Laufzeit liest das Desktop-Dashboard.
  const old = JSON.parse(JSON.stringify(phone));
  old.views[0].cards.forEach((x) => { if (x && x.type === 'custom:casora-mobile-nav') KEYS.forEach((k) => delete x[k]); });
  await c.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config: old });
  c.close();
  const shown2 = await phoneMenu(want);
  await check('ohne Schlüssel an der Leiste: Handy folgt trotzdem der Badge', JSON.stringify(shown2) === JSON.stringify(want), { shown2, want });

  // 3) Studio öffnen (ohne Speichern): gleicht die Leiste von selbst an.
  const s = await open();
  await studio(s.page, dash.url);
  // Der Abgleich schreibt im Hintergrund – nachsehen, bis er da ist (höchstens 20 s), statt fest 2,5 s.
  let nav3 = {};
  for (const t0 = Date.now(); Date.now() - t0 < 20000; await s.page.waitForTimeout(500)) {
    const c2 = await ws();
    const phone3 = await c2.cmd({ type: 'lovelace/config', url_path: dash.phone.url });
    c2.close();
    nav3 = (phone3.views[0].cards || []).find((x) => x && x.type === 'custom:casora-mobile-nav') || {};
    if (JSON.stringify(nav3.scene_order) === JSON.stringify(a.set.scene_order)) break;
  }
  await s.browser.close();
  await check('Studio-Öffnen schreibt die Auswahl an die Handy-Leiste', JSON.stringify(nav3.scene_order) === JSON.stringify(a.set.scene_order), nav3);
} finally {
  const back = await pickAndSave(a.before);
  await check('alte Szenen-Auswahl wieder gespeichert', back.saved !== false, back.saved);
}
await finish();
