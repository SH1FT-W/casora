// @zustand: arbeit
// @parallel: allein
// Gemeldet (Funktionstest F-07, 06.10.2026): Im Studio ausgeblendete Kachel (Schalter „Sichtbar“
// aus, variables.enabled: false) fehlte am Desktop, die Handy-Raumseite zeigte sie weiter – die
// Raumseite (casora-filter-overlay mit room) übernahm die Kacheln der Reihe ungefiltert.
// Erwartet: Handy-Raumseite (WebKit 390×844) ohne die ausgeblendete Kachel, übrige Kacheln da.
// Schreibt die Kachel ausgeschaltet ins Handy-Dashboard (nur Test-HA) und stellt am Ende den
// vorherigen Stand wieder her.
import { open, usePage, casoraDashboard, dashboard, check, need, finish, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);

const cfg0 = JSON.parse(JSON.stringify(dash.phone.config));
const cfg = JSON.parse(JSON.stringify(cfg0));
const kids = (((cfg.views[0] || {}).cards || [])[1] || {}).cards || [];
// Raum mit mindestens drei Kacheln, deren Gerät je nur einmal vorkommt.
let pick = null;
for (let i = 0; i < kids.length - 1 && !pick; i++) {
  const h = kids[i], r = kids[i + 1];
  if (h.template !== 'casora_mobile_header' || r.type !== 'custom:casora-smart-row') continue;
  if (/^(favorites|favoriten|scenes|szenen)$/i.test(String(h.name || '')) || (h.variables || {}).favorites) continue;
  const on = (r.cards || []).filter((c) => c && typeof c.entity === 'string' && (c.variables || {}).enabled !== false);
  const once = on.filter((c) => on.filter((x) => x.entity === c.entity).length === 1);
  if (on.length >= 3 && once.length >= 2) pick = { name: h.name, card: once[once.length - 1], other: once[0].entity };
}
await need('Handy-Raum mit drei Kacheln', pick);
const overlay = kids.find((c) => c.type === 'custom:casora-filter-overlay' && c.room === pick.name);
await need('Raumseite (casora-filter-overlay) des Raums', overlay);
const key = overlay.filter_category || 'room_' + String(pick.name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
const hidden = pick.card.entity;
pick.card.variables = { ...(pick.card.variables || {}), enabled: false };

const save = async (config) => { const c = await ws(); await c.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config }); c.close(); };
await save(cfg);
let restored = false;
const restore = async () => { if (!restored) { restored = true; await save(cfg0); } };
atFinish(restore);

const { page } = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false });
usePage(page);
await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);
await page.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), key);
await page.waitForTimeout(3500);
const shown = await page.evaluate(() => window.__pierce('.casora-entity-grid').filter((g) => g.getBoundingClientRect().height > 0)
  .flatMap((g) => [...g.children].map((c) => { const bc = c.localName === 'button-card' ? c : c.querySelector && c.querySelector('button-card');
    return bc && bc._config && bc._config.entity; }).filter(Boolean)));
if (process.env.RF05_SHOT) await shot('rf05-raumseite');
await check(`Raum „${pick.name}“: übrige Kacheln auf der Raumseite`, shown.includes(pick.other), { shown, other: pick.other });
await check(`Raum „${pick.name}“: ausgeblendete Kachel fehlt auf der Handy-Raumseite`, !shown.includes(hidden), { shown, hidden });
await restore();
await finish();
