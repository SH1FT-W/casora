// @zustand: arbeit
// @parallel: ui
// Gewünscht 03.10.2026:
// 1. Studio-Vorschau wie Dashboard: eine eingerichtete Medien-Badge ohne Wiedergabe steht nicht in
//    der Badge-Reihe, auch nicht gestrichelt. Gestrichelt nur, was fehlt oder ausgeschaltet ist.
// 2. Eigene Karten in der Kachelliste: oben ihr Name (eigener oder aus der Karte gelesen),
//    darunter „Eigene Karte“. Ohne beides nur einmal „Eigene Karte“.
// Alles nur im Speicher des Studios und mit untergeschobenen Zuständen – gespeichert wird nichts.
import { open, usePage, studio, casoraDashboard, fakeStates, shot, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const { page } = await open();
usePage(page);
await studio(page, dash.url);
const H = (fn, arg) => page.evaluate(fn, arg);

const P = 'media_player.qa_medien_beispiel';
// sticky: Das Mock-HA schickt laufend neue Zustände; ohne sticky waren die untergeschobenen nach
// Sekunden wieder weg und die Prüfung kam unter Last zu spät (T-07, 06.10.2026).
await fakeStates(page, { [P]: { state: 'off', attributes: { friendly_name: 'Beispiel Player' } } }, { sticky: true });

// Raum ohne Medien-Wiedergabe: Medien eingerichtet, Player aus.
const room = await H((pl) => {
  const p = window.__panel();
  const rs = p._state.compact.rooms;
  const i = rs.findIndex((r) => r.path !== 'home');
  const r = rs[i];
  r.variables = { ...(r.variables || {}) };
  for (let k = 1; k <= 10; k++) delete r.variables['media_player_' + k];
  delete r.variables.show_media; delete r.variables.show_now_playing;
  r.variables.media_player_1 = pl;
  p._room = i; p._sel = null; p._group = null;
  p._renderForm();
  return r.path;
}, P);
const badges = () => H(() => window.__pierce('.mini-badges .pbadge').filter((b) => b.getBoundingClientRect().width > 0)
  .map((b) => ({ ghost: b.classList.contains('ghost'), id: b.dataset.mk || '', text: b.innerText.replace(/\s+/g, ' ').trim() })));
// Warten, bis die Badge-Reihe den erwarteten Stand zeigt (höchstens ms) – statt fester Pausen.
const badgesUntil = async (ok, ms = 8000) => {
  let r = [];
  for (const t0 = Date.now(); Date.now() - t0 < ms; await page.waitForTimeout(200)) { r = await badges(); if (r.length && ok(r)) return r; }
  return r;
};
const isMedia = (b) => /^(Medien|Media)\b/.test(b.text);
// Erwartet: keine Medien-Badge. Erst warten, bis die Reihe steht (sonst wäre „leer“ ein Scheinerfolg).
await badgesUntil((r) => r.length > 0, 8000);
await page.waitForTimeout(500);
let row = await badges();
await check(`${room}: Medien eingerichtet, nichts läuft – keine Medien-Badge, auch nicht gestrichelt`,
  !row.some(isMedia), row.map((b) => (b.ghost ? '[gestrichelt] ' : '') + b.text).join(' | '));

// Läuft etwas: echte Badge.
await fakeStates(page, { [P]: { state: 'playing', attributes: { media_title: 'Beispiel-Titel' } } }, { sticky: true });
await H(() => window.__panel()._renderForm());
row = await badgesUntil((r) => r.some((b) => isMedia(b) && !b.ghost));
await check('Wiedergabe läuft – Medien-Badge sichtbar (nicht gestrichelt)', row.some((b) => isMedia(b) && !b.ghost),
  row.map((b) => b.text).join(' | '));

// Ausgeschaltet: gestrichelt (Weg zurück zum Schalter).
await H(() => { const p = window.__panel(); p._state.compact.rooms[p._room].variables.show_media = false; p._renderForm(); });
row = await badgesUntil((r) => r.some((b) => isMedia(b) && b.ghost));
await check('Medien ausgeschaltet – gestrichelt', row.some((b) => isMedia(b) && b.ghost), row.map((b) => b.text).join(' | '));

// Nicht eingerichtet: gestrichelt.
await H(() => { const p = window.__panel(); const v = p._state.compact.rooms[p._room].variables;
  delete v.show_media; delete v.media_player_1; p._renderForm(); });
row = await badgesUntil((r) => r.some((b) => isMedia(b) && b.ghost));
await check('Medien nicht eingerichtet – gestrichelt', row.some((b) => isMedia(b) && b.ghost), row.map((b) => b.text).join(' | '));
await shot('vorschau-medien');

// Energie (03.10.2026): Raum mit Leistungssensor – Badge auch bei 0 W; ohne Messung keine
// echte Badge (gestrichelt = nicht eingerichtet, Antippen führt hin).
const W = 'sensor.qa_raum_leistung_beispiel';
await fakeStates(page, { [W]: { state: '0', attributes: { device_class: 'power', unit_of_measurement: 'W', friendly_name: 'Beispiel Steckdose' } } }, { sticky: true });
await H((w) => { const p = window.__panel(); const v = p._state.compact.rooms[p._room].variables;
  ['energy_usage_today', 'energy_usage_month', 'energy_cost_today', 'energy_cost_month'].forEach((k) => delete v[k]);
  delete v.show_energy; v.energy_power_entity = w; p._renderForm(); }, W);
const isEnergy = (b) => /^(Energie|Energy)\b/.test(b.text);
row = await badgesUntil((r) => r.some((b) => isEnergy(b) && !b.ghost && /0\s*W/.test(b.text)));
await check('Leistungssensor mit 0 W – Energie-Badge sichtbar', row.some((b) => isEnergy(b) && !b.ghost && /0\s*W/.test(b.text)),
  row.map((b) => b.text).join(' | '));
await H(() => { const p = window.__panel(); const v = p._state.compact.rooms[p._room].variables; delete v.energy_power_entity; delete v.energy_entities; p._renderForm(); });
row = await badgesUntil((r) => !r.some((b) => isEnergy(b) && !b.ghost), 4000);
await check('ohne Leistungsmessung – keine echte Energie-Badge', !row.some((b) => isEnergy(b) && !b.ghost), row.map((b) => b.text).join(' | '));

// Eigene Karten in der Kachelliste.
const heads = await H(() => {
  const p = window.__panel(); const I = window.__casoraPanelInternals;
  const r = p._state.compact.rooms[p._room];
  const ent = Object.keys(p._hass.states).find((e) => e.startsWith('sensor.') && p._hass.states[e].attributes.friendly_name);
  const named = I.wrapCustomCard({ type: 'markdown', content: 'x' }, { casora_name: 'QA Notiz' });
  r.tiles.unshift(I.wrapCustomCard({ type: 'markdown', content: 'x' }),
    I.wrapCustomCard({ type: 'entities', title: 'QA Titel', entities: [] }),
    I.wrapCustomCard({ type: 'tile', entity: ent }), named);
  p._group = 'tiles'; p._sel = null; p._stackOpenReq = 'tiles';
  p._renderForm();
  return { fn: p._hass.states[ent].attributes.friendly_name };
});
const readList = () => H(() => window.__pierce('.tile.shut .grow').slice(0, 4).map((g) => ({
  name: (g.querySelector('.tname') || {}).textContent.trim(), kind: ((g.querySelector('.kind') || {}).textContent || '').trim() })));
let list = [];
for (const t0 = Date.now(); Date.now() - t0 < 8000 && list.length < 4; await page.waitForTimeout(200)) list = await readList();
const want = [['Eigene Karte', ''], ['QA Titel', 'Eigene Karte'], [heads.fn, 'Eigene Karte'], ['QA Notiz', 'Eigene Karte']];
await check('Kachelliste: Name oben, „Eigene Karte“ darunter (ohne Namen nur einmal)',
  want.every(([n, k], i) => list[i] && list[i].name === n && list[i].kind === k), JSON.stringify(list));
await shot('eigene-karten');
await finish();
