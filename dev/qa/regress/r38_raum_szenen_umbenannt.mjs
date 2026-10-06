// @zustand: arbeit
// Gemeldet (04.10.2026): Am Handy zeigte die Raumseite eines im Studio umbenannten Raums (HA-Bereich
// „Hauswirtschaftsraum“, Raum „Wirtschaftsraum“) ALLE Szenen statt nur die des Bereichs. Ursache:
// Die Szenenliste suchte den Bereich über den Raumnamen; fand sie keinen, und brachten die Kacheln
// der Raumseite keine Entität mit (Kachel-Entität nur in variables/verschachtelt), blieb die Liste
// ungefiltert. Am Desktop gibt es Szenen nur als Badge der Home-Zeile (alle Szenen, gewollt).
// Erwartet: Raum umbenennen + speichern, am Handy (WebKit 390×844) die Raumseite öffnen: nur die
// Szenen des Bereichs (Szene im Bereich oder schaltet Entitäten des Bereichs). Am Ende wird der
// alte Name wieder gespeichert.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';
import { ws } from '../ws.mjs';

const NEU = 'Qa Wirtschaftsraum';
const key = (n) => 'room_' + String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

// Raum umbenennen (Studio, Speicher wie „Speichern“) – liefert Raum und Bereich.
const rename = async (pick, to, tileEnts = {}) => {
  const s = await open();
  await studio(s.page, dash.url);
  const r = await s.page.evaluate(async ([pick, to, tileEnts]) => {
    const p = window.__panel(), I = window.__casoraPanelInternals, H = p._hass;
    const rooms = p._state.compact.rooms;
    const fold = (x) => String(x || '').trim().toLowerCase();
    const areaOf = (eid) => { const e = (H.entities || {})[eid]; return e && (e.area_id || ((H.devices || {})[e.device_id] || {}).area_id) || null; };
    let ri = -1, area = null;
    if (pick) ri = rooms.findIndex((x) => x.name === pick);
    else {
      // Raum mit gleichnamigem Bereich, der eigene Szenen hat, aber nicht alle – und dessen
      // Handy-Kacheln Entitäten dieses Bereichs tragen (wie im gemeldeten Fall). Nur darüber
      // findet die Raumseite den Bereich nach dem Umbenennen wieder; ein Raum ohne Kacheln
      // (hier umbenannt ohne gemerkten Bereich) zeigt richtigerweise keine Szenen.
      const scenes = Object.keys(H.states).filter((id) => id.startsWith('scene.'));
      ri = rooms.findIndex((x) => {
        if (I.isHomeRoom(x, rooms)) return false;
        const a = Object.values(H.areas || {}).find((y) => fold(y.name) === fold(x.name));
        if (!a) return false;
        if (!(tileEnts[x.name] || []).some((e) => areaOf(e) === a.area_id)) return false;
        const n = scenes.filter((id) => areaOf(id) === a.area_id).length;
        if (n && n < scenes.length) { area = a.area_id; return true; }
        return false;
      });
    }
    if (ri < 0) return null;
    const room = rooms[ri], old = room.name;
    room.name = to;
    room.variables = { ...(room.variables || {}), room_name: to };
    p._markDirty && p._markDirty();
    const saved = await p._save();
    return { old, area, saved };
  }, [pick, to, tileEnts]);
  await s.browser.close();
  return r;
};

// Zweiter Raum: gleichnamiger Bereich, aber Raumseite ohne Kachel-Entitäten (wie ein Raum, dessen
// Geräte-Kacheln ihre Entitäten nur in variables tragen) – dort darf nach dem Umbenennen nicht
// „alle Szenen“ stehen.
const kids0 = (((dash.phone.config.views[0] || {}).cards || [])[1] || {}).cards || [];
let LEER = null;
for (let i = 0; i < kids0.length - 1 && !LEER; i++) {
  const h = kids0[i], row = kids0[i + 1];
  if (h.template !== 'casora_mobile_header' || row.type !== 'custom:casora-smart-row' || (h.variables || {}).favorites) continue;
  if (/^(favorites|favoriten|scenes|szenen)$/i.test(String(h.name || ''))) continue;
  if (!JSON.stringify(row.cards || []).match(/"[a-z_]+\.[a-z0-9_]+"/)) LEER = h.name;
}
const NEU2 = 'Qa Abstellraum';
// Entitäten der Handy-Kacheln je Raum (auch in variables/verschachtelt).
const TILE_ENTS = {};
for (let i = 0; i < kids0.length - 1; i++) {
  const h = kids0[i], row = kids0[i + 1];
  if (h.template !== 'casora_mobile_header' || row.type !== 'custom:casora-smart-row') continue;
  TILE_ENTS[h.name] = [...new Set(JSON.stringify(row.cards || []).match(/(?<=")[a-z_]+\.[a-z0-9_]+(?=")/g) || [])];
}

const r = await rename(null, NEU, TILE_ENTS);
await need('Raum mit gleichnamigem HA-Bereich, eigenen Szenen und Kacheln aus dem Bereich', r && r.area, r);
await need('Studio hat gespeichert', r.saved !== false, r);
const r2 = LEER ? await rename(LEER, NEU2) : null;

// Frisch gespeichertes Handy-Layout lesen.
const c = await ws();
const phone = await c.cmd({ type: 'lovelace/config', url_path: dash.phone.url });
c.close();
const kids = (((phone.views[0] || {}).cards || [])[1] || {}).cards || [];
const overlay = kids.find((x) => x && x.type === 'custom:casora-filter-overlay' && x.room === NEU);
await check('Raumseite am Handy heißt wie der umbenannte Raum', !!overlay, kids.filter((x) => x && x.room).map((x) => x.room));

if (overlay) {
  const { page } = await open({ width: 390, height: 844, mobile: true, safari: true });
  usePage(page);
  await dashboard(page, dash.phone.url + '/' + (phone.views[0].path || '0'), 3);
  await page.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), overlay.filter_category || key(NEU));
  let res = null;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    res = await page.evaluate(([area, NEU]) => {
      const H = document.querySelector('home-assistant').hass, SC = window._casoraSC;
      const areaOf = (eid) => { const e = (H.entities || {})[eid]; return e && (e.area_id || ((H.devices || {})[e.device_id] || {}).area_id) || null; };
      const visible = Object.keys(H.states).filter((id) => id.startsWith('scene.') && !id.startsWith('scene.casora')
        && H.entities[id] && !(H.entities[id].hidden_by || H.entities[id].disabled_by));
      const inArea = new Set(Object.keys(H.entities).filter((e) => areaOf(e) === area));
      const leaves = (id, seen = new Set()) => { if (seen.has(id)) return []; seen.add(id); const m = (H.states[id] || {}).attributes?.entity_id; return Array.isArray(m) ? m.flatMap((x) => leaves(x, seen)) : [id]; };
      const ok = new Set(visible.filter((id) => inArea.has(id) || ((H.states[id].attributes || {}).entity_id || []).some((t) => inArea.has(t) || leaves(t).some((l) => inArea.has(l)))));
      const rows = window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_scene_row')
        && ((b._config || {}).variables || {}).room === NEU);
      const shown = rows.length ? SC.list(H.states, H, rows[0]._config.variables) : [];
      return { rows: rows.length, shown, ok: [...ok], total: visible.length };
    }, [r.area, NEU]);
    if (res.rows) break;
  }
  if (r2) {
    // Raumseite des zweiten Raums öffnen.
    const ov2 = kids.find((x) => x && x.type === 'custom:casora-filter-overlay' && x.room === NEU2);
    await page.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), (ov2 && ov2.filter_category) || key(NEU2));
    let leer = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(500);
      leer = await page.evaluate(() => {
        const H = document.querySelector('home-assistant').hass, SC = window._casoraSC;
        return window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).includes('casora_scene_row')
          && ((b._config || {}).variables || {}).room === 'Qa Abstellraum').map((b) => SC.list(H.states, H, b._config.variables).length);
      });
      if (leer.length) break;
    }
    await check(`umbenannter Raum ohne Kachel-Entitäten („${LEER}“): keine Szenen statt aller`, !leer.some((n) => n > 0), { leer, total: res && res.total });
  }
  await check('Raumseite zeigt eine Szenenliste', res && res.rows > 0, res);
  await check('nur Szenen des Bereichs, nicht alle', res && res.shown.length > 0 && res.shown.length < res.total
    && res.shown.every((id) => res.ok.includes(id)), res);
}

// Alten Namen wiederherstellen.
if (r2) await rename(NEU2, r2.old);
const back = await rename(NEU, r.old);
await check('alter Raumname wieder gespeichert', back && back.saved !== false, back);

// Namensfeld im Studio (nichts gespeichert): Umbenennen merkt sich den bisher über den Namen
// gefundenen HA-Bereich als area am Raum, die Raumseite am Handy bekommt ihn mit.
const t = await open();
await studio(t.page, dash.url);
const f = await t.page.evaluate(async (old) => {
  const p = window.__panel(), rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((x) => x.name === old);
  if (ri < 0) return null;
  if (rooms[ri].variables) delete rooms[ri].variables.area;
  p._room = ri; p._sel = null;
  p._renderTabs && p._renderTabs();
  p._renderForm();
  await new Promise((res) => setTimeout(res, 900));
  const row = [...p.shadowRoot.querySelectorAll('#pane .row, #pane label')].find((e) => /^(Raumname|Room name)$/i.test((e.querySelector ? (e.querySelector('label') || e) : e).textContent.trim()));
  const inp = row && (row.querySelector('input') || row.parentElement.querySelector('input'));
  if (inp) inp.setAttribute('data-qa', 'raumname');
  return { ri, field: !!inp };
}, r.old);
await need('Namensfeld „Raumname“', f && f.field, f);
await t.page.click('[data-qa=raumname]');
await t.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
await t.page.keyboard.type(NEU);
await t.page.keyboard.press('Tab');
await t.page.waitForTimeout(900);
const v = await t.page.evaluate((ri) => {
  const p = window.__panel(), I = window.__casoraPanelInternals, room = p._state.compact.rooms[ri];
  let ov = null;
  if (p._pair && I.syncPairRooms && I.expandMobileConfig) {
    I.syncPairRooms(p._pair);
    const m = p._pair.mobile;
    const cfg = I.expandMobileConfig(m.compact, m.scaffold, m.extras, m.templates, m.chrome);
    ov = (cfg.views[0].cards[1].cards || []).find((c) => c && c.type === 'custom:casora-filter-overlay' && c.room === room.name) || null;
  }
  return { name: room.name, area: (room.variables || {}).area || null, overlayArea: ov ? ov.area || null : 'keine Raumseite' };
}, f.ri);
await check('Umbenennen im Studio merkt sich den HA-Bereich (area)', v.name === NEU && v.area === r.area, { ...v, erwartet: r.area });
await check('Raumseite am Handy trägt den Bereich', v.overlayArea === r.area, v);
await finish();
