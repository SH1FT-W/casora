// @zustand: arbeit
// Gemeldet (07.10.2026, P2-01, schon in 1.0.11): Die Glocke zeigte eine gekippte Tür manchmal doppelt –
// „… ist offen“ (Kombi-Sensor) und „… Kippsensor ist offen“ statt einmal „… ist gekippt“. Ursache: Die
// Glocke sammelte vor den lokalen Modulen (00-finden fasst Kontakt + Kippsensor zusammen, 01-basis
// schreibt „gekippt“) und erst nach 60 s wieder. Nachgestellt mit einem künstlich langsamen Lader
// (casora-local.js 20 s verzögert). Erwartet: spätestens 3 s nach dem Laden der Module je Tür nur ein
// Eintrag, kein „Kippsensor“ in der Glocke.
import { open, usePage, casoraDashboard, check, need, finish, ready } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile);
await need('Casora-Dashboard (Desktop)', dash);
const { page, context } = await open({ width: 1600, height: 1000 });
usePage(page);
await context.route(/\/casora-local\.js(\?|$)/, async (r) => { await new Promise((x) => setTimeout(x, 20000)); r.fallback(); });
await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), '() => !!window._casoraNotify', 60000);

const openRows = () => page.evaluate(() => (window._casoraNotify ? window._casoraNotify.rows : [])
  .filter((r) => /^casora:open:/.test(r.id)).map((r) => ({ id: r.entity, label: r.label })));
await page.waitForFunction(() => !!window._casoraLocalLoaded, null, { timeout: 60000 });
// Gibt es im Testhaus überhaupt eine Öffnung mit Kippsensor, die gerade offen/gekippt ist?
const kipp = await page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).filter((id) => id.indexOf('binary_sensor.') === 0 && /kipp|tilt/i.test(id + ' ' + (S[id].attributes.friendly_name || ''))
    && S[id].state === 'on' && !Object.prototype.hasOwnProperty.call(S[id].attributes, 'tilt'));
});
await need('Testhaus: offener Kippsensor', kipp.length > 0, kipp);
await page.waitForTimeout(3000);
const rows = await openRows();
await check('keine Zeile „Kippsensor ist offen“', !rows.some((r) => /kippsensor/i.test(r.label)), rows);
await check('kein Kippsensor als eigener Eintrag', !rows.some((r) => kipp.indexOf(r.id) !== -1), rows);
const labels = rows.map((r) => r.label);
await check('keine doppelten Zeilen', new Set(labels).size === labels.length, labels);
await check('Zustand zusammengefasst („gekippt“)', labels.some((l) => / ist gekippt$/.test(l)), labels);
await finish();
