// @zustand: arbeit
// @parallel: allein
// Neue Studio-Funktionen im Dashboard (06.10.2026). Erwartet: Kachel mit „Wer sieht das?“ für einen
// anderen HA-Benutzer (visibility, Bedingung „user“) fehlt am Desktop und auf der Handy-Raumseite;
// Licht-Badge nur für einen anderen Benutzer (casora_badge_users) fehlt im Raumkopf; Raum nur für
// einen anderen Benutzer (route.users) fehlt in der Leiste; Kachel mit „Vor dem Schalten fragen“
// zeigt beim An/Aus-Schalter einen ruhigen Dialog, „Abbrechen“/Esc schaltet nichts.
// Schreibt Desktop- und Handy-Dashboard (nur Test-HA) und stellt am Ende den vorherigen Stand her.
import { open, usePage, casoraDashboard, dashboard, cards, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const OTHER = 'qa-anderer-benutzer';
const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const d0 = JSON.parse(JSON.stringify(dash.config)), m0 = JSON.parse(JSON.stringify(dash.phone.config));
const d = JSON.parse(JSON.stringify(d0)), m = JSON.parse(JSON.stringify(m0));
const tilesOf = (v) => (((v.cards || [])[2] || {}).cards || []);
// Raum mit zwei Kacheln verschiedener Geräte: die zweite nur für den anderen Benutzer.
// Nur Raumseiten (nicht die Startseite views[0]): in qa-arbeit hat auch sie Kacheln an cards[2], dann
// fielen Ausblend- und Licht-Kachel auf dieselbe Kachel und der Schalter fehlte.
const roomViews = d.views.slice(1);
const vHide = roomViews.find((v) => tilesOf(v).filter((t) => t.entity).length >= 2 && new Set(tilesOf(v).map((t) => t.entity)).size >= 2);
await need('Raum mit zwei Kacheln', vHide);
const hideT = tilesOf(vHide).filter((t) => t.entity)[1], keepT = tilesOf(vHide).find((t) => t.entity && t.entity !== hideT.entity);
hideT.visibility = [{ condition: 'user', users: [OTHER] }];
// Licht-Kachel: Schalter zeigen + nachfragen; Licht-Badge des Raums nur für den anderen.
const vLight = roomViews.find((v) => v !== vHide && tilesOf(v).some((t) => /^light\./.test(t.entity || '')) && (v.cards[0].variables || {}).light_entity_1);
await need('Raum mit Licht-Kachel und Licht-Badge', vLight);
const lt = tilesOf(vLight).find((t) => /^light\./.test(t.entity || ''));
lt.variables = { ...(lt.variables || {}), show_toggle: true, confirm_toggle: true };
vLight.cards[0].variables.casora_badge_users = { lights: [OTHER] };
// Ein Raum nur für den anderen: aus der Leiste.
const vUser = d.views.find((v) => v !== vHide && v !== vLight && v.path !== (d.views[0] || {}).path);
const walk = (o, fn) => { if (Array.isArray(o)) o.forEach((x) => walk(x, fn)); else if (o && typeof o === 'object') { fn(o); Object.values(o).forEach((x) => walk(x, fn)); } };
walk(d, (o) => { if (Array.isArray(o.routes)) o.routes.forEach((r) => { if (r.url && r.url.endsWith('/' + vUser.path)) r.users = [OTHER]; }); });
// Handy: dieselbe Kachel im Abschnitt des Raums.
walk(m.views, (o) => { if (o.entity === hideT.entity && o.template && [].concat(o.template).join() === [].concat(hideT.template).join()) o.visibility = [{ condition: 'user', users: [OTHER] }]; });

const save = async (url, config) => { const c = await ws(); await c.cmd({ type: 'lovelace/config/save', url_path: url, config }); c.close(); };
await save(dash.url, d);
await save(dash.phone.url, m);
let restored = false;
const restore = async () => { if (!restored) { restored = true; await save(dash.url, d0); await save(dash.phone.url, m0); } };
atFinish(restore);

const { page } = await open({ width: 1600, height: 1000, dark: false });
usePage(page);
await dashboard(page, dash.url + '/' + vHide.path, 2);
const ents = (await page.evaluate(() => window.__pierce('button-card').filter((b) => b.getBoundingClientRect().width > 40 && b._config)
  .map((b) => b._config.entity))).filter(Boolean);
await check('Desktop: Kachel nur für anderen Benutzer fehlt, übrige da', !ents.includes(hideT.entity) && ents.includes(keepT.entity), { hide: hideT.entity, keep: keepT.entity });
const routes = await page.evaluate(() => window.__pierce('casora-nav-bar').flatMap((n) => (n._routes || []).map((r) => r.url)));
await check('Leiste ohne den Raum nur für anderen Benutzer', routes.length > 0 && !routes.some((u) => u.endsWith('/' + vUser.path)), { raum: vUser.path });

await dashboard(page, dash.url + '/' + vLight.path, 2);
const badges = (await cards(page)).filter((c) => c.t.some((t) => /^casora_badge_light/.test(t)));
await check('Licht-Badge nur für anderen Benutzer fehlt im Raumkopf', badges.length === 0, badges.map((b) => b.text));
// Genau die Kachel mit Schalter + Rückfrage (lt) – im Raum können weitere Licht-Kacheln stehen (qa-arbeit).
const hit = await page.evaluate((ent) => {
  const t = window.__pierce('button-card').find((b) => b._config && b._config.entity === ent && [].concat(b._config.template || []).includes('casora_light') && b.getBoundingClientRect().width > 0);
  const tog = t && [...t.shadowRoot.querySelectorAll('button-card')].find((b) => b._config.tap_action && b._config.tap_action.action === 'call-service');
  const r = tog && tog.getBoundingClientRect();
  return r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
}, lt.entity);
await need('An/Aus-Schalter der Licht-Kachel', hit);
const st0 = await page.evaluate((e) => document.querySelector('home-assistant').hass.states[e].state, lt.entity);
await page.mouse.click(hit.x, hit.y);
await page.waitForTimeout(700);
const dlg = await page.evaluate(() => { const h = document.querySelector('.casora-askfirst'); return h ? h.shadowRoot.querySelector('.box').innerText : null; });
await check('Schalter fragt in einem ruhigen Dialog nach', /Wirklich (ein|aus)schalten\?/.test(dlg || '') && /Abbrechen/.test(dlg || ''), dlg);
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
const st1 = await page.evaluate((e) => document.querySelector('home-assistant').hass.states[e].state, lt.entity);
await check('Abbrechen schaltet nichts', st0 === st1 && !(await page.evaluate(() => !!document.querySelector('.casora-askfirst'))), { st0, st1 });

// Handy-Raumseite
const kids = (((m.views[0] || {}).cards || [])[1] || {}).cards || [];
const ov = kids.find((c) => c.type === 'custom:casora-filter-overlay' && (c.room === vHide.title || c.room === (vHide.cards[0] || {}).name));
if (ov) {
  const { page: ph } = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false });
  usePage(ph);
  await dashboard(ph, dash.phone.url + '/' + (m.views[0].path || '0'), 3);
  const key = ov.filter_category || 'room_' + String(ov.room).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  await ph.evaluate((k) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: k } })), key);
  await ph.waitForTimeout(3500);
  const shown = await ph.evaluate(() => window.__pierce('.casora-entity-grid').filter((g) => g.getBoundingClientRect().height > 0)
    .flatMap((g) => [...g.children].map((c) => { const bc = c.localName === 'button-card' ? c : c.querySelector && c.querySelector('button-card');
      return bc && bc._config && bc._config.entity; }).filter(Boolean)));
  await check('Handy-Raumseite ohne die Kachel nur für anderen Benutzer', !shown.includes(hideT.entity), { shown, hide: hideT.entity });
} else await check('Handy-Raumseite des Raums vorhanden', false, vHide.path);
await restore();
await finish();
