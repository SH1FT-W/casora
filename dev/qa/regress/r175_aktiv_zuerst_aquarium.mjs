// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/smart-row.js
// Gemeldet (10.10.2026, iPad, Startseite): Die Aquarium-Kachel („Alles ok“, Symbol grau = inaktiv) stand
// in der Kachelreihe vorn, vor aktiven Kacheln (Schloss entriegelt, Jalousien offen).
// Ursache: Die Kachel steckt in einer Sammelkarte (conditional → auto-entities → Swipe) mit
// active_entities = Hilfssensoren „… prüfen“. _findHaCard erreichte die Kachel in dieser Tiefe nicht,
// also entschied active_entities: Sensor „prüfen“ = on (eigene Kriterien, z. B. Lampe 30 min nicht
// erreichbar) → aktiv, obwohl die Kachel selbst inaktiv aussieht.
// Erwartet: Eine Sammelkarte ist so aktiv wie ihre Kacheln aussehen – grau → hinten; eine Sammelkarte mit
// sichtbar aktiver Kachel (Pflanze mit Problem) bleibt vorn.
// Es wird nichts gespeichert: Zustände nur im Browser untergeschoben (fakeStates).
import { open, usePage, dashboard, fakeStates, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

// Dashboard mit einer Kachelreihe, die eine Aquarium-Sammelkarte (active_entities) enthält.
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
let hit = null;
const unwrap = (x) => { let k = x, n = 0; while (k && k.type === 'conditional' && k.card && n++ < 4) k = k.card; return k; };
for (const d of list.filter((x) => x.mode === 'storage')) {
  let cfg = null;
  try { cfg = await c.cmd({ type: 'lovelace/config', url_path: d.url_path }); } catch (e) { continue; }
  (cfg.views || []).forEach((v, vi) => (v.cards || []).forEach((row) => {
    if (hit || !row || row.type !== 'custom:casora-smart-row') return;
    const idx = (row.cards || []).findIndex((x) => { const u = unwrap(x);
      return u && Array.isArray(u.active_entities) && u.active_entities.length && JSON.stringify(u).includes('casora_aquarium_tank'); });
    if (idx < 0) return;
    const plants = (row.cards || []).findIndex((x) => { const u = unwrap(x);
      return u && Array.isArray(u.active_entities) && u.active_entities.length && JSON.stringify(u).includes('casora_plant'); });
    hit = { url: d.url_path + '/' + (v.path || vi), idx, sensor: unwrap(row.cards[idx]).active_entities[0],
      plants, plant: plants >= 0 ? unwrap(row.cards[plants]).active_entities[0] : null };
  }));
  if (hit) break;
}
c.close();
await need('Kachelreihe mit Aquarium-Sammelkarte (active_entities)', hit);

const { page } = await open({ width: 1024, height: 768, safari: true, dark: false });
usePage(page);
await dashboard(page, hit.url, 5);
const patch = { [hit.sensor]: { state: 'on' } };
if (hit.plant) patch[hit.plant] = { state: 'problem' };
await fakeStates(page, patch, { sticky: true });
// HA 2026.10: Die Bedingungs-Hülle der Sammelkarte liest Zustände nicht mehr aus dem untergeschobenen hass –
// dieselben Zustände kurz echt im Wegwerf-HA setzen, am Ende den alten Stand zurück.
const was = await page.evaluate(async (p) => {
  const h = document.querySelector('home-assistant').hass, out = {};
  for (const [id, v] of Object.entries(p)) {
    const r = await h.callApi('GET', 'states/' + id).catch(() => null);
    out[id] = r ? { state: r.state, attributes: r.attributes } : null;
    await h.callApi('POST', 'states/' + id, { state: v.state, attributes: r ? r.attributes : {} });
  }
  return out;
}, patch);
atFinish(() => page.evaluate(async (w) => { const h = document.querySelector('home-assistant').hass;
  for (const [id, v] of Object.entries(w)) await (v ? h.callApi('POST', 'states/' + id, v) : h.callApi('DELETE', 'states/' + id)).catch(() => {}); }, was).catch(() => {}));
// Sortieren wartet SORT_DELAY_MS (2,5 s) nach der Änderung.
await page.waitForTimeout(4500);

const m = await page.evaluate(({ idx, plants }) => {
  const row = window.__pierce('casora-smart-row').find((r) => r._wrappers && r._wrappers[idx]
    && JSON.stringify(r._config.cards[idx]).includes('casora_aquarium_tank'));
  if (!row) return null;
  const tile = (i) => {
    const out = [];
    const walk = (el) => { if (!el) return; if (el.tagName === 'BUTTON-CARD') { out.push(el); return; }
      if (el.shadowRoot) [...el.shadowRoot.children].forEach(walk); [...(el.children || [])].forEach(walk); };
    walk(row._cards[i]);
    return out.map((b) => { const h = b.shadowRoot && b.shadowRoot.querySelector('ha-card');
      return { v: h ? h.style.getPropertyValue('--casora-active-overlay-opacity').trim() : '',
        text: h ? h.innerText.replace(/\s+/g, ' ').trim().slice(0, 40) : '' }; });
  };
  const vis = row._config.cards.map((_, i) => i).filter((i) => row._wrappers[i].style.display !== 'none');
  const ord = (i) => Number(row._wrappers[i].style.order);
  const act = vis.filter((i) => row._activeSet.has(i));
  return { aq: tile(idx), aqOrder: ord(idx), aqActive: row._activeSet.has(idx), shown: vis.includes(idx),
    plants: plants >= 0 && vis.includes(plants) ? { active: row._activeSet.has(plants), order: ord(plants), tiles: tile(plants) } : null,
    activeOthers: act.filter((i) => i !== idx).map((i) => ({ i, order: ord(i) })) };
}, { idx: hit.idx, plants: hit.plants });
await need('Aquarium-Sammelkarte sichtbar mit Kachel', m && m.shown && m.aq.length, m);
const grey = m.aq.every((t) => t.v !== '1');
await need('Aquarium-Kachel sieht inaktiv aus (Bewertung „ok“)', grey, m.aq);
await check('Graue Aquarium-Kachel zählt nicht als aktiv', !m.aqActive, m);
const before = m.activeOthers.filter((a) => a.order > m.aqOrder);
await check('Graue Aquarium-Kachel steht hinter allen aktiven Kacheln', m.activeOthers.length > 0 && !before.length, m);
if (m.plants && m.plants.tiles.some((t) => t.v === '1')) {
  await check('Pflanzen-Sammelkarte mit aktiver Kachel bleibt aktiv (vorn)', m.plants.active && m.plants.order < m.aqOrder, m.plants);
}
await finish();
