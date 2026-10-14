// @zustand: demo
// @deckt: custom_components/casora/scripts/smart-row.js
// 1.5 (Fund 14.10.2026): Handy-Kacheln mit Größe „Automatisch“ wurden groß, zeigten aber das kleine Layout
// (Symbol neben Name/Status) statt des großen (Symbol oben links, Name + Status unten). Ursache: eine
// veraltete casora_entity im Dashboard ohne size_large (Demo-Haus). Geprüft: die Reihe mit dem 3D-Drucker
// steht auf „Automatisch“, „Drucker druckt“ einmal vor dem Laden und einmal danach – groß heißt jedes Mal
// Raster "i" "n" "s" und Symbol über dem Namen. Dashboard und Mock werden danach zurückgesetzt.
import { open, casoraDashboards, dashboard, check, need, finish, atFinish } from './lib.mjs';

const ph = (await casoraDashboards()).find((d) => d.mobile);
await need('ein Casora-Handy-Dashboard', ph);
const { page } = await open({ width: 390, height: 844, theme: 'Casora', dark: false, mobile: true });
await dashboard(page, ph.url, 3);
const svc = (s, d) => page.evaluate(([s, d]) => document.querySelector('home-assistant').hass.callService('casora_mock', s, d), [s, d]);

// Reihe mit dem 3D-Drucker auf „Automatisch“ (Original merken und am Ende zurückschreiben).
const prep = await page.evaluate(async (url) => {
  const h = document.querySelector('home-assistant').hass;
  const cfg = await h.callWS({ type: 'lovelace/config', url_path: url });
  const orig = JSON.parse(JSON.stringify(cfg));
  let row = null;
  const walk = (o) => {
    if (!o || typeof o !== 'object' || row) return;
    if (Array.isArray(o.cards) && o.cards.some((c) => [].concat((c || {}).template || []).includes('casora_3d_printer'))) { row = o; return; }
    Object.values(o).forEach(walk);
  };
  walk(cfg);
  if (!row) return null;
  row.cards.forEach((c) => { c.variables = Object.assign({}, c.variables, { size: 'auto' }); });
  await h.callWS({ type: 'lovelace/config/save', url_path: url, config: cfg });
  const ent = cfg.button_card_templates && cfg.button_card_templates.casora_entity;
  return { orig, sizeLarge: !!(ent && ent.variables && ent.variables.size_large) };
}, ph.url);
await need('Reihe mit 3D-Drucker im Handy-Dashboard', prep);
atFinish(async () => {
  await svc('reset', {}).catch(() => {});
  await page.evaluate(([url, cfg]) => document.querySelector('home-assistant').hass.callWS({ type: 'lovelace/config/save', url_path: url, config: cfg }),
    [ph.url, prep.orig]).catch(() => {});
});
await check('casora_entity im Dashboard kennt size_large (keine veraltete Vorlage)', prep.sizeLarge);

const big = () => page.evaluate(() => window.__pierce('[data-size="large"][data-size-auto="1"]').map((w) => {
  const bc = window.__pierce('button-card', w)[0];
  if (!w.getBoundingClientRect().height) return null;
  if (!bc || ![].concat(bc._config.template || []).includes('casora_3d_printer')) return null;
  const sr = bc.shadowRoot, g = sr.querySelector('#container');
  const ic = sr.querySelector('#img-cell, .img-cell, #icon'), nm = sr.querySelector('#name');
  const r = (e) => (e ? e.getBoundingClientRect() : null);
  return { areas: getComputedStyle(g).gridTemplateAreas, iconBottom: r(ic) && Math.round(r(ic).bottom), nameTop: r(nm) && Math.round(r(nm).top) };
}).filter(Boolean)[0] || null);
const ok = (b) => !!b && b.areas.replace(/\s+/g, ' ') === '"i" "n" "s"' && (b.iconBottom == null || b.nameTop == null || b.iconBottom <= b.nameTop);

// Vor dem Laden: Szenario läuft schon, dann Seite neu laden.
await svc('reset', {});
await svc('scenario', { name: 'drucker_druckt' });
await page.waitForTimeout(1500);
await page.reload(); await dashboard(page, ph.url, 3); await page.waitForTimeout(4000);
let b = await big();
await check('Szenario vor dem Laden: Drucker groß mit großem Layout', ok(b), b);

// Nach dem Laden: klein laden, dann druckt er.
await svc('reset', {}); await page.waitForTimeout(1500);
await page.reload(); await dashboard(page, ph.url, 3); await page.waitForTimeout(3000);
await check('ohne Szenario: Drucker nicht groß', !(await big()));
await svc('scenario', { name: 'drucker_druckt' });
await page.waitForTimeout(5000);
b = await big();
await check('Szenario nach dem Laden: Drucker wird groß mit großem Layout', ok(b), b);
await finish();
