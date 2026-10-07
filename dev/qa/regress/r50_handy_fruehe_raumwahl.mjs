// @zustand: arbeit
// Gemeldet (P-01, 07.10.2026, schon in 1.0.11): Handy frisch laden und sofort (≤ 1 s) einen Raum
// wählen – die Leiste unten zeigt den Raum, der Inhalt bleibt bzw. springt auf „Zuhause“.
// Ursache: Raum-Overlays und Reihen, die ihre ersten Zustände bekamen, bevor casora-core (der
// Filter je Gerät) geladen war, meldeten sich nie am Filter an. Eine frühe Wahl wirkte erst, wenn
// HA zufällig neue Zustände schickte; der Kopf der Startseite setzte beim späten Aufbau außerdem
// auf „all“ zurück.
// Nachstellen: casora-core.js kommt 2,5 s verzögert an (wie ein langsames Handy), gleich danach wird
// ein Raum gewählt. Erwartet: alle Overlays und Reihen hängen am Filter, der Raum ist nach 3 s
// offen und bleibt es (auch nach weiteren 3 s), der Filter steht noch auf dem Raum.
// WebKit, 390×844, mehrere Räume.
import { open, casoraDashboard, dashboard, check, need, finish, BASE, PIERCE } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const m = await open({ width: 390, height: 844, mobile: true, safari: true, dark: false, theme: 'Casora' });
const pg = m.page;
// Raum-Schlüssel aus der unteren Navigation (einmal normal laden).
await dashboard(pg, dash.phone.url, 3);
const keys = (await pg.evaluate(() => {
  const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
  return n ? n._rooms.map((r) => r.key) : [];
})).filter((k) => k !== 'room_scenes').slice(0, 3);
await need('mindestens zwei Räume am Handy', keys.length >= 2, keys);
await m.context.route(/\/casora_scripts\/casora-core\.js/, async (r) => {
  await new Promise((res) => setTimeout(res, 2500));
  return r.fallback();
});

const state = (key) => pg.evaluate((key) => {
  const ovs = window.__pierce('casora-filter-overlay');
  const rows = window.__pierce('casora-smart-row');
  const o = ovs.find((x) => x._config && x._config.filter_category === key);
  return {
    f: window._casoraFilter.get(),
    shown: !!(o && o._showing && o._overlayEl && +getComputedStyle(o._overlayEl).opacity > 0.5),
    lose: ovs.filter((x) => !x._filterOff).length + rows.filter((x) => !x._filterOff).length,
  };
}, key);

const bad = [];
for (const key of keys) {
  // Vorher war Zuhause offen (sonst öffnet die Seite den zuletzt gewählten Raum von selbst).
  await pg.evaluate(() => { try { localStorage.setItem('casora_mobile_filter', 'all'); } catch (e) { /* leer */ } }).catch(() => {});
  await pg.goto(BASE + '/' + dash.phone.url, { waitUntil: 'domcontentloaded' });
  await pg.waitForFunction(() => !!window._casoraFilter, null, { timeout: 60000, polling: 20 });
  await pg.evaluate((k) => window._casoraFilter.set(k), key);
  await pg.addScriptTag({ content: PIERCE });
  await pg.waitForTimeout(3000);
  const a = await state(key);
  await pg.waitForTimeout(3000);
  const b = await state(key);
  if (!(a.shown && b.shown && b.f === key && !b.lose)) bad.push({ key, nach3s: a, nach6s: b });
}
await check(`frühe Raumwahl bleibt offen (${keys.length} Räume, Kern 2,5 s verzögert)`, !bad.length, bad);
await finish();
