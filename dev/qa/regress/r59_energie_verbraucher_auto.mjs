// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026): Das Energie-Popup zeigt die größten Verbraucher (bis 5, nach Watt) auch
// ohne Zuordnung im Studio – Casora sucht sie selbst. Erwartet im Casora-Look (Desktop 1600×1000,
// hell): Abschnitt „Verbraucher“ mit 1–5 Zeilen, absteigend nach Leistung, ohne den Haus-Sensor der
// Kachel; sind Verbraucher zugeordnet, stehen genau diese (höchstens 5) drin.
import { open, casoraDashboards, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const all = (await casoraDashboards()).filter((d) => !d.mobile && /"casora_energy"/.test(JSON.stringify(d.config)));
await need('Casora-Dashboard mit Energie-Kachel', all.length);
const { page } = await open({ width: 1600, height: 1000, dark: false, theme: 'Casora' });
const findTile = () => window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).join(',') === 'casora_energy' && x.getBoundingClientRect().width > 0);
let tile = null;
for (const d of all) {
  for (const v of d.config.views.filter((x) => /"casora_energy"/.test(JSON.stringify(x)))) {
    await dashboard(page, d.url + '/' + (v.path || String(d.config.views.indexOf(v))), 3);
    await page.evaluate((f) => { const b = new Function('return ' + f)()(); if (b) b.scrollIntoView({ block: 'center', inline: 'center' }); }, findTile.toString());
    await page.waitForTimeout(1200);
    tile = await page.evaluate((f) => {
      const b = new Function('return ' + f)()();
      if (!b) return null;
      const r = b.getBoundingClientRect(); const v = (b._config || {}).variables || {};
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, entity: v.entity_power || b._config.entity, assigned: (v.power_entities || []).filter(Boolean) };
    }, findTile.toString());
    if (tile) break;
  }
  if (tile) break;
}
await need('sichtbare Energie-Kachel', tile);
// Misst die Kachel keine Leistung (nur kWh), wird ihr Sensor im Browser zum Leistungssensor –
// ohne ihn gibt es keine automatische Liste. Am Test-HA ändert sich nichts.
const pid = await page.evaluate((id) => id, tile.entity);
await fakeStates(page, { [pid]: { state: '442', attributes: { device_class: 'power', unit_of_measurement: 'W', state_class: 'measurement' } } }, { sticky: true });
await page.waitForTimeout(800);
// Nach dem Unterschieben neu messen (die Reihe kann sich verschoben haben).
await page.evaluate((f) => { const b = new Function('return ' + f)()(); if (b) b.scrollIntoView({ block: 'center', inline: 'center' }); }, findTile.toString());
await page.waitForTimeout(1200);
const at = await page.evaluate((f) => { const b = new Function('return ' + f)()(); if (!b) return null; const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, findTile.toString());
await need('Energie-Kachel nach dem Unterschieben', at);
await page.mouse.click(at.x, at.y);
await page.waitForTimeout(3500);
const res = await page.evaluate(() => {
  const lbl = window.__pierce('*').find((e) => e.children.length === 0 && /^verbraucher$/i.test((e.textContent || '').trim()) && e.getBoundingClientRect().width > 0);
  if (!lbl) return { label: false };
  // Zeilen unter der Überschrift in derselben Spalte, bis zur nächsten Überschrift.
  const L = lbl.getBoundingClientRect();
  const next = window.__pierce('*').filter((e) => e !== lbl && e.children.length === 0 && /^[A-ZÄÖÜ ]{4,}$/.test((e.textContent || '').trim())
    && Math.abs(e.getBoundingClientRect().left - L.left) < 30 && e.getBoundingClientRect().top > L.bottom).map((e) => e.getBoundingClientRect().top);
  const stop = next.length ? Math.min(...next) : Infinity;
  const rows = window.__pierce('.hui-row').filter((r) => { const q = r.getBoundingClientRect();
    return q.width > 0 && q.top > L.bottom && q.top < stop && Math.abs(q.left - L.left) < 40; });
  const st = document.querySelector('home-assistant').hass.states;
  const w = (id) => { const s = st[id]; if (!s) return null; const n = parseFloat(s.state); const u = s.attributes.unit_of_measurement; return u === 'kW' ? n * 1000 : n; };
  const ids = rows.map((r) => r.getAttribute('data-casora-mi') || (r._casoraRow && r._casoraRow.entity) || '').filter(Boolean);
  return { label: true, n: rows.length, ids, w: ids.map(w) };
});
// Was Casora für diese Kachel finden müsste (Raum-Popup: nur der Bereich des Raums).
const want = await page.evaluate(({ id, url }) => {
  const h = document.querySelector('home-assistant').hass;
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).join(',') === 'casora_energy' && x.getBoundingClientRect().width > 0);
  const v = (b && b._config.variables) || {};
  const area = window._casoraSoftEnergy.autoArea({ hass: h, states: h.states, powerId: id }, v);
  return window._casoraAutoConsumers(h, h.states, { exclude: [id], area }).top.map((x) => x.id);
}, { id: tile.entity });
if (!want.length && !tile.assigned.length) {
  await check('ohne passende Verbraucher kein leerer Abschnitt', !res.label, res);
  await finish();
}
await check('Abschnitt „Verbraucher“ im Energie-Popup', res.label, { res, want });
if (res.label) {
  await check('1 bis 5 Verbraucher', res.n >= 1 && res.n <= 5, res);
  await check('jede Zeile gehört zu einem Sensor', res.ids.length === res.n, res);
  await check('absteigend nach Leistung', res.w.every((x, i) => i === 0 || x == null || res.w[i - 1] == null || res.w[i - 1] >= x), res);
  await check('Haus-Sensor der Kachel nicht in der Liste', !res.ids.includes(tile.entity), res);
  if (!tile.assigned.length) await check('genau die erwarteten Verbraucher', JSON.stringify(res.ids) === JSON.stringify(want), { res, want });
  if (tile.assigned.length) await check('Zuordnung im Studio gilt', res.ids.every((id) => tile.assigned.includes(id)), { res, assigned: tile.assigned });
}
await finish();
