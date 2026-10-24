// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js custom_components/casora/panel/casora-panel-basis.js
// Gemeldet (23./24.10.2026, Gate-Rot nach dem neuen Testhaus): Ohne eine HA-Lichtgruppe über das ganze Haus bekam
// das Beleuchtungs-Badge der Übersicht nur zehn Lichter (light_entity_1…10), der Rest fehlte still; das Haus-Popup
// hatte keine Raumleiste, der Hauptschalter schaltete ohne Rückfrage, die Kachel „Beleuchtung“ öffnete eine flache
// Liste. Erwartet (Desktop 1440×900, Casora-Look): mit der Markierung light_rooms_auto zählt das Badge alle Lichter
// der Räume des Dashboards (aus den Raum-Badges abgeleitet, window._casoraHouseLights), das Popup zeigt die
// Raumleiste mit den Räumen, der Hauptschalter fragt „Alle N Lichter im Haus ausschalten?“ und schaltet genau die
// eingeschalteten; die Haus-Kachel öffnet dasselbe Popup. Das Studio stellt ein Dashboard, dessen Übersicht nur
// Casoras Zehnerliste trägt, beim Öffnen auf die Räume um (nur im Speicher). Badge und Kachel werden hier als
// Karten im Browser angelegt (das Prüf-Dashboard hat eine Hausgruppe), Zustände nur im Browser; nichts wird gespeichert.
import { open, casoraDashboard, dashboard, studio, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 2);
await need('Casora-Dashboard mit Räumen', dash);
const { page } = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
await dashboard(page, dash.url, 3);

// Erwartung aus der Konfiguration: Lichter der Raum-Badges (Gruppe eines Raums → ihre Mitglieder).
const roomVars = dash.config.views.slice(1).map((v) => ({ name: ((v.cards || [])[0] || {}).name || v.title, V: (((v.cards || [])[0] || {}).variables) || {} }));
const expected = await page.evaluate((rv) => {
  const st = document.querySelector('home-assistant').hass.states;
  const mem = (id) => { const a = st[id] && st[id].attributes; return a && Array.isArray(a.entity_id) ? a.entity_id.filter((x) => st[x]) : []; };
  const rooms = [], ids = [];
  rv.forEach(({ name, V }) => {
    if (V.show_lights === false) return;
    const slots = []; for (let i = 1; i <= 10; i++) if (V['light_entity_' + i]) slots.push(V['light_entity_' + i]);
    let lights = slots.length === 1 && mem(slots[0]).length ? mem(slots[0]) : slots.length ? slots : V.light_group_entity ? mem(V.light_group_entity) : [];
    lights = lights.filter((x, i, a) => a.indexOf(x) === i && st[x]);
    if (!lights.length) return;
    rooms.push(name); lights.forEach((x) => { if (!ids.includes(x)) ids.push(x); });
  });
  return { rooms, ids };
}, roomVars);
await need('mindestens zwei Räume mit Lichtern', expected.rooms.length > 1, expected);

// Die Hälfte der Lichter an (nur im Browser), Dienstaufrufe abfangen.
const patch = {};
expected.ids.forEach((id, i) => { patch[id] = { state: i % 2 ? 'on' : 'off' }; });
await fakeStates(page, patch, { sticky: true });
await page.waitForTimeout(800);
await page.evaluate(() => {
  window.__qaCalls = [];
  document.querySelector('home-assistant').hass.callService = (d, s, data, target) => { window.__qaCalls.push([d, s, (target && target.entity_id) || (data && data.entity_id)]); return Promise.resolve(); };
});

// 1) Ableitung im Dashboard.
const got = await page.evaluate(() => { const r = window._casoraHouseLights(); return { rooms: r.rooms.map((x) => x.name), ids: r.ids }; });
await check('Hausliste aus den Raum-Badges: alle Räume', JSON.stringify(got.rooms) === JSON.stringify(expected.rooms), { got, expected });
await check('Hausliste: alle Lichter (auch mehr als zehn)', [...got.ids].sort().join() === [...expected.ids].sort().join(), { got: got.ids, expected: expected.ids });

// 2) Badge mit der Markierung zählt alle Lichter.
const onCount = expected.ids.filter((id, i) => i % 2).length;
const badge = await page.evaluate(async () => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_badge_light_group', entity: 'input_select.casora_expanded_row',
    variables: { enabled: true, light_rooms_auto: true } });
  el.id = 'qa-r316-badge'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:300px;top:300px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  await new Promise((r) => setTimeout(r, 1500));
  const r = el.getBoundingClientRect();
  return { text: (el.shadowRoot && el.shadowRoot.querySelector('ha-card') || el).innerText.replace(/\s+/g, ' ').trim(), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width };
});
await check('Badge zählt alle Lichter der Räume („' + onCount + ' An“)', badge.w > 0 && badge.text.includes(onCount + ' An'), badge);

// 3) Halten öffnet das Haus-Popup: Raumleiste aus den Räumen, Hauptschalter fragt.
await page.mouse.move(badge.x, badge.y); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; return !!s && s.innerText.trim().length > 20; }, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);
const pop = await page.evaluate(() => {
  const P = window.casoraPopup, pop = P && P.element;
  const row = window.__pierce('button-card').find((x) => x.shadowRoot && x.shadowRoot.querySelector('#pill_all') && x.getBoundingClientRect().width > 0);
  // Pills are nested button-cards: their name sits in the card config (text in a shadow root).
  const pills = row ? [...row.shadowRoot.querySelectorAll('[id^=pill_]')].filter((p) => p.id !== 'pill_all' && p.id !== 'pill_sp' && p.getBoundingClientRect().width > 0)
    .map((p) => { const bc = p.querySelector('button-card'); return bc && bc._config ? String(bc._config.name || '') : (p.innerText || '').trim(); }) : [];
  const b = pop && pop.shadowRoot.querySelector('.header-switch');
  const title = pop && pop.shadowRoot.querySelector('.header-title') ? pop.shadowRoot.querySelector('.header-title').textContent.trim() : '';
  const surf = P && P.surface ? P.surface.innerText : '';
  const r = b ? b.getBoundingClientRect() : null;
  return { title, pills, rows: (surf.match(/Räume/g) || []).length, btn: !!b && !b.hidden, house: !!(pop && pop._hsOff), dis: b && b.disabled, at: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null };
});
await check('Popup „Beleuchtung“ mit Raumleiste aus den Räumen', pop.title === 'Beleuchtung' && pop.pills.length === expected.rooms.length && pop.pills.every((p, i) => p === expected.rooms[i]), pop);
await check('Räume als Zeilen', pop.rows > 0, pop);
await need('Hauptschalter (Haus: nur aus)', pop.btn && pop.house && !pop.dis, pop);
await page.mouse.click(pop.at.x, pop.at.y);
await page.waitForTimeout(900);
const dialog = () => page.evaluate(() => {
  const host = document.querySelector('.casora-askfirst');
  if (!host) return null;
  const r = host.shadowRoot;
  return { title: r.querySelector('h2').textContent, yes: r.querySelector('.yes').textContent };
});
const d = await dialog();
await check('Rückfrage „Alle N Lichter im Haus ausschalten?“ mit allen eingeschalteten', d && d.title === 'Alle ' + onCount + ' Lichter im Haus ausschalten?', d);
if (d) await page.evaluate(() => document.querySelector('.casora-askfirst').shadowRoot.querySelector('.yes').click());
await page.waitForTimeout(1000);
const calls = await page.evaluate(() => window.__qaCalls);
const off = calls.find((c) => c[0] === 'light' && c[1] === 'turn_off');
await check('Ausschalten: light.turn_off genau für die eingeschalteten Lichter', off && [...off[2]].sort().join() === expected.ids.filter((id, i) => i % 2).sort().join(), calls);
await page.evaluate(() => { const P = window.casoraPopup; if (P && P.close) P.close(); const e = document.querySelector('home-assistant').shadowRoot.getElementById('qa-r316-badge'); if (e) e.remove(); });
await page.waitForTimeout(800);

// 4) Die Haus-Kachel (erste Lampe + Markierung, wie „Neu beginnen“ sie ohne Gruppe anlegt) öffnet dasselbe Popup.
const tile = await page.evaluate(async (first) => {
  const ha = document.querySelector('home-assistant');
  const h = await window.loadCardHelpers();
  const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_light', entity: first, name: 'Beleuchtung',
    variables: { house: true, light_rooms_auto: true, lights: [first], active_entities: [first] } });
  el.id = 'qa-r316-tile'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:300px;top:420px;width:220px;height:140px;z-index:99990;';
  ha.shadowRoot.appendChild(el);
  await new Promise((r) => setTimeout(r, 1500));
  const r = el.getBoundingClientRect();
  return { text: (el.shadowRoot.querySelector('ha-card') || el).innerText.replace(/\s+/g, ' ').trim(), x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, expected.ids[0]);
await check('Haus-Kachel zählt die Lichter der Räume', tile.text.includes(onCount + ' An'), tile);
await page.mouse.click(tile.x, tile.y);
await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; return !!s && s.innerText.trim().length > 20; }, null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(2000);
const tp = await page.evaluate(() => {
  const P = window.casoraPopup, pop = P && P.element;
  const row = window.__pierce('button-card').find((x) => x.shadowRoot && x.shadowRoot.querySelector('#pill_all') && x.getBoundingClientRect().width > 0);
  const n = row ? [...row.shadowRoot.querySelectorAll('[id^=pill_]')].filter((p) => p.id !== 'pill_all' && p.id !== 'pill_sp' && p.getBoundingClientRect().width > 0).length : 0;
  return { title: pop && pop.shadowRoot.querySelector('.header-title') ? pop.shadowRoot.querySelector('.header-title').textContent.trim() : '', n, house: !!(pop && pop._hsOff) };
});
await check('Kachel: Popup „Beleuchtung“ mit Raumleiste und Haus-Schalter', tp.title === 'Beleuchtung' && tp.n === expected.rooms.length && tp.house, tp);
await page.evaluate(() => { const P = window.casoraPopup; if (P && P.close) P.close(); const e = document.querySelector('home-assistant').shadowRoot.getElementById('qa-r316-tile'); if (e) e.remove(); });

// 5) Studio: Übersicht mit Casoras Zehnerliste und ohne Gruppe wird beim Laden auf die Räume umgestellt (im Speicher).
await studio(page, dash.url);
const st = await page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals, B = window.casoraBasis;
  const rooms = JSON.parse(JSON.stringify(p._state.compact.rooms));
  const V = rooms[0].variables;
  delete V.light_group_entity; delete V.light_rooms_auto;
  for (let i = 1; i <= 10; i++) delete V['light_entity_' + i];
  const slots = B.topUnits(p._hass, rooms.slice(1).flatMap((r) => Array.from({ length: 10 }, (_, k) => (r.variables || {})['light_entity_' + (k + 1)]).filter(Boolean))).slice(0, 10);
  slots.forEach((id, i) => { V['light_entity_' + (i + 1)] = id; });
  const switched = I.fillHomeLights(p._hass, rooms);
  const model = p._miniModel.call(Object.assign(Object.create(p), { _state: { compact: { rooms } } }), rooms[0]).find((b) => b.id === 'lights');
  const why = B.homeLightsWhy(p._hass, rooms);
  const user = JSON.parse(JSON.stringify(rooms)); delete user[0].variables.light_rooms_auto; slots.forEach((id, i) => { user[0].variables['light_entity_' + (i + 1)] = id; });
  delete user[0].variables.light_entity_1;
  return { slots: slots.length, switched, auto: V.light_rooms_auto, left: Object.keys(V).filter((k) => /^light_entity_/.test(k)).length,
    subs: model ? model.subs.length : -1, why: why && [why.n, why.m], userStays: !I.fillHomeLights(p._hass, user) };
});
await check('Studio: Casoras Zehnerliste → folgt den Räumen', st.slots > 0 && st.switched && st.auto === true && st.left === 0, st);
// Preview sub-badges: one per room (its group, else its lamps); the why line counts lamps and rooms.
await check('Studio-Vorschau zeigt die Räume, Hinweis nennt Lichter und Räume', st.subs >= expected.rooms.length && st.why && st.why[0] === expected.ids.length && st.why[1] === expected.rooms.length, { st, expected });
await check('Studio: eigene Liste des Nutzers bleibt', st.userStays, st);
await finish();
