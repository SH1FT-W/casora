// @zustand: arbeit
// Gemeldet (Issue #6, 04.10.2026): Am Handy wanderten aktive Kacheln (eingeschaltetes Licht,
// laufende Waschmaschine) in den Räumen nicht nach vorne, am Desktop schon. Ursache war nicht das
// Einrasten der Reihe (scroll-snap, am Handy gibt es dort keine waagrechte Reihe), sondern die
// Raumseite (casora-filter-overlay mit room) ließ das Sortieren bewusst aus.
// Erwartet: Raumseite am Handy (WebKit 390×844) zeigt aktive Kacheln vorn, innerhalb der Gruppen
// in der Studio-Reihenfolge; schaltet sich eine Kachel bei offenem Raum ein, rückt sie nach vorn.
// Es wird nichts gespeichert: Zustände nur im Browser untergeschoben (fakeStates).
import { open, usePage, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

// Raum-Abschnitt am Handy mit Licht und dahinter (Studio-Reihenfolge) einer Jalousie.
const kids = (((dash.phone.config.views[0] || {}).cards || [])[1] || {}).cards || [];
let room = null;
for (let i = 0; i < kids.length - 1 && !room; i++) {
  const h = kids[i], r = kids[i + 1];
  if (h.template !== 'casora_mobile_header' || r.type !== 'custom:casora-smart-row' || r.sort === false) continue;
  if (/^(favorites|favoriten|scenes|szenen)$/i.test(String(h.name || '')) || (h.variables || {}).favorites) continue;
  const ents = [...new Set((r.cards || []).map((c) => c && c.entity).filter((e) => typeof e === 'string' && /^[a-z_]+\./.test(e)))];
  const light = ents.find((e) => e.startsWith('light.')), cover = ents.find((e) => e.startsWith('cover.'));
  if (light && cover && ents.indexOf(cover) > ents.indexOf(light)) room = { name: h.name, ents, light, cover };
}
await need('Raum am Handy mit Licht und dahinter einer Jalousie', room);
const overlay = kids.find((c) => c.type === 'custom:casora-filter-overlay' && c.room === room.name);
await need('Raumseite (casora-filter-overlay) des Raums', overlay);
const key = overlay.filter_category || 'room_' + String(room.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const { page } = await open({ width: 390, height: 844, mobile: true, safari: true });
usePage(page);
await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);

// Alle Kacheln des Raums aus, nur die Jalousie offen (aktiv).
const OFF = { light: 'off', switch: 'off', fan: 'off', input_boolean: 'off', cover: 'closed', media_player: 'off',
  climate: 'off', lock: 'locked', vacuum: 'docked', camera: 'idle', sensor: 'idle', binary_sensor: 'off' };
const off = Object.fromEntries(room.ents.map((e) => [e, { state: OFF[e.split('.')[0]] || 'off' }]));
await fakeStates(page, { ...off, [room.cover]: { state: 'open' } });
await page.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), key);
await page.waitForTimeout(3500);

// Kacheln der Raumseite in Bildschirm-Reihenfolge (oben → unten, links → rechts).
const order = () => page.evaluate(() => {
  const grids = window.__pierce('.casora-entity-grid').filter((g) => g.getBoundingClientRect().height > 0);
  const out = [];
  grids.forEach((g) => [...g.children].forEach((c) => {
    const r = c.getBoundingClientRect();
    const bc = c.localName === 'button-card' ? c : c.querySelector && c.querySelector('button-card');
    const e = bc && bc._config && bc._config.entity;
    if (r.width > 0 && e) out.push({ e, y: Math.round(r.y), x: Math.round(r.x) });
  }));
  return out.sort((a, b) => a.y - b.y || a.x - b.x).map((o) => o.e);
});
const first = await order();
await check(`Raum „${room.name}“: offene Jalousie (aktiv) steht vorn`, first[0] === room.cover, { order: first, studio: room.ents });
const rest = first.filter((e) => e !== room.cover);
await check('übrige Kacheln behalten die Studio-Reihenfolge', JSON.stringify(rest) === JSON.stringify(room.ents.filter((e) => rest.includes(e))), { rest, studio: room.ents });

// Bei offenem Raum das Licht einschalten: rückt nach vorn, unter den aktiven gilt die
// Studio-Reihenfolge (Licht vor Jalousie).
await fakeStates(page, { [room.light]: { state: 'on' } });
// Die Raumseite sortiert spätestens 2,5 s nach einem Update neu; bis zu 8 s warten.
let after = [];
for (let i = 0; i < 16; i++) {
  await page.waitForTimeout(500);
  after = await order();
  if (after[0] === room.light && after[1] === room.cover) break;
}
await check('eingeschaltetes Licht rückt bei offenem Raum nach vorn', after[0] === room.light && after[1] === room.cover, after);
await finish();
