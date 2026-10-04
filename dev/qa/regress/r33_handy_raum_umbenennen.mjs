// @zustand: arbeit
// Gemeldet (Issue #4, 04.10.2026): Ein im Studio umbenannter Raum behielt am Handy den alten Namen
// (Kopf, Leiste, Raumseite, room_chips), am Desktop blieb aqi_room_name alt. Ursache: Übernommene
// Hemma-Handy-Layouts bestanden den Rundlauf-Vergleich nicht („Favoriten“, Leiste ohne Symbole),
// das Studio ließ das Handy dann beim Speichern ganz aus; dazu nahmen Raum-Chips und Filter-Optionen
// den Schlüssel aus dem Namen statt den der Raumseite (room_kueche ≠ room_kche).
// Erwartet: (1) Casora-Layout: Umbenennen zieht Kopf, Raumseite, Leiste (Schlüssel + Name) und
// room_chips (Schlüssel, aqi_room_name) nach; das Studio erkennt beim Laden einen schon gespeicherten,
// am Handy noch alten Namen (phoneStale). (2) Hemma-Layout (dashboard-hemma): Handy-Hälfte gilt als
// verlustfrei, ein Raum mit eigenem Hemma-Schlüssel bekommt den Schlüssel des neuen Namens, die Chips
// ziehen mit. (3) Namensfeld im Studio: aqi_room_name folgt, wenn er der alte Name war.
// Es wird nichts gespeichert: alles nur im Speicher des Studios.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const NEU = 'Qa Wirtschaftsraum';
const key = (n) => 'room_' + String(n).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

// Umbenennen nur im Speicher, dann Abgleich wie beim Speichern; Ergebnis des Handy-Layouts.
const renameAndSync = (page, pick) => page.evaluate(([pick, NEU]) => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const pair = p._pair;
  if (!pair) return { pair: null };
  if (pair.safe === false) return { pair: 'unsafe' };
  const rooms = pair.desktop.compact.rooms;
  const keysOf = I.phoneRoomKeys ? I.phoneRoomKeys(pair.mobile) : {};
  const link = pair.link.links.find((l) => {
    if (l.overview || l.section === null) return false;
    const sec = pair.mobile.compact.rooms[l.section];
    const k = keysOf[sec.name];
    return pick === 'hemma' ? !!k && k !== 'room_' + sec.name.toLowerCase().replace(/[^a-z0-9]+/g, '') : true;
  });
  if (!link) return { pair: true, room: null };
  const room = rooms[link.room];
  const old = room.name;
  const chipsCard = () => pair.mobile.chrome.items.find((it) => it.card && it.card.template === 'casora_mobile_sensor_chips');
  const oldKey = keysOf[pair.mobile.compact.rooms[link.section].name] || null;
  const hadChips = !!(((chipsCard() || {}).card || {}).variables || {}).room_chips?.[oldKey || ('room_' + old.toLowerCase().replace(/[^a-z0-9]+/g, ''))];
  room.name = NEU;
  room.variables = { ...(room.variables || {}), room_name: NEU };
  const stale = I.phoneStale ? I.phoneStale(pair) : null;
  I.syncPairRooms(pair);
  I.syncRoomChips(pair);
  const cfg = I.expandMobileConfig(pair.mobile.compact, pair.mobile.scaffold, pair.mobile.extras, pair.mobile.templates, pair.mobile.chrome);
  const kids = cfg.views[0].cards[1].cards;
  const nav = (cfg.views[0].cards.find((c) => c && c.type === 'custom:casora-mobile-nav') || {}).rooms || [];
  const ov = kids.find((c) => c && c.type === 'custom:casora-filter-overlay' && c.room === NEU);
  const chips = ((kids.find((c) => c && c.template === 'casora_mobile_sensor_chips') || {}).variables || {}).room_chips || {};
  return {
    pair: true, old, oldKey, hadChips,
    stale: stale && stale.renamed,
    headers: kids.filter((c) => c && c.template === 'casora_mobile_header').map((c) => c.name),
    overlay: ov ? { room: ov.room, filter_category: ov.filter_category || null } : null,
    nav: nav.map((r) => r.key + '=' + r.name),
    chipKeys: Object.keys(chips),
    chip: chips['room_' + NEU.toLowerCase().replace(/[^a-z0-9]+/g, '')] || null,
    kueche: chips.room_kueche ? true : false,
  };
}, [pick, NEU]);

// ── (1) Casora-Layout ────────────────────────────────────────────────────────
const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const s = await open();
await studio(s.page, dash.url);
const a = await renameAndSync(s.page, 'casora');
await need('Handy-Hälfte gekoppelt', a.pair === true, a);
await need('Raum am Handy', a.room !== null && a.old, a);
await check('Laden erkennt einen am Handy noch alten Raumnamen (phoneStale)', Array.isArray(a.stale) && a.stale.some((r) => r.from === a.old && r.to === NEU), a.stale);
await check('Handy-Kopf trägt den neuen Namen, der alte ist weg', a.headers.includes(NEU) && !a.headers.includes(a.old), a.headers);
await check('Raumseite (filter-overlay) heißt wie der Raum', !!a.overlay, a.overlay);
await check('Handy-Leiste: Schlüssel und Name des neuen Namens', a.nav.includes(key(NEU) + '=' + NEU) && !a.nav.some((n) => n.endsWith('=' + a.old)), a.nav);
if (a.hadChips) {
  await check('room_chips unter dem neuen Schlüssel, aqi_room_name neu', !!a.chip && a.chip.aqi_room_name !== a.old && !a.chipKeys.includes(key(a.old)), { keys: a.chipKeys, chip: a.chip });
}

// ── (3) Namensfeld: aqi_room_name folgt dem Namen ────────────────────────────
await s.browser.close();
const t = await open();
await studio(t.page, dash.url);
const f = await t.page.evaluate(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const rooms = p._state.compact.rooms;
  const ri = rooms.findIndex((r) => !I.isHomeRoom(r, rooms));
  if (ri < 0) return null;
  rooms[ri].variables = { ...(rooms[ri].variables || {}), aqi_room_name: rooms[ri].name };
  p._room = ri; p._sel = null;
  p._renderTabs && p._renderTabs();
  p._renderForm();
  await new Promise((r) => setTimeout(r, 900));
  const row = [...p.shadowRoot.querySelectorAll('#pane .row, #pane label')].find((e) => /^(Raumname|Room name)$/i.test((e.querySelector ? (e.querySelector('label') || e) : e).textContent.trim()));
  const inp = row && (row.querySelector('input') || row.parentElement.querySelector('input'));
  if (inp) inp.setAttribute('data-qa', 'raumname');
  return { ri, field: !!inp };
});
await need('Namensfeld „Raumname“', f && f.field);
await t.page.click('[data-qa=raumname]');
await t.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
await t.page.keyboard.type(NEU);
await t.page.keyboard.press('Tab');
await t.page.waitForTimeout(900);
const aqi = await t.page.evaluate((ri) => { const r = window.__panel()._state.compact.rooms[ri]; return { name: r.name, aqi: r.variables.aqi_room_name }; }, f.ri);
await check('Umbenennen im Studio: Popup-Titel (aqi_room_name) folgt dem neuen Namen', aqi.name === NEU && aqi.aqi === NEU, aqi);

// ── (2) Übernommenes Hemma-Handy-Layout ──────────────────────────────────────
await t.browser.close();
const u = await open();
await studio(u.page, 'dashboard-hemma');
const b = await renameAndSync(u.page, 'hemma');
await check('Hemma-Handy-Layout gilt als verlustfrei (Studio gleicht es ab)', b.pair === true, b.pair);
if (b.pair === true) {
  await need('Raum mit eigenem Hemma-Schlüssel', b.room !== null && b.oldKey, b);
  await check('Hemma-Raum: Raumseite nimmt den Schlüssel des neuen Namens', b.overlay && !b.overlay.filter_category, b.overlay);
  await check('Hemma-Raum: Leiste mit neuem Schlüssel und Namen', b.nav.includes(key(NEU) + '=' + NEU) && !b.nav.some((n) => n.startsWith(b.oldKey + '=')), b.nav);
  if (b.hadChips) await check('Hemma-Raum: room_chips ziehen vom Hemma-Schlüssel um', !!b.chip && !b.chipKeys.includes(b.oldKey), { keys: b.chipKeys, old: b.oldKey });
}
await finish();
