#!/usr/bin/env node
// Legt im Zustand „stress“ (dev/haus.sh stress) das Dashboard „qa-stress“ über den echten
// Studio-Ablauf an: alle Räume, „Automatisch einrichten“, alle vorgeschlagenen Kacheln.
// Danach hat dev/qa/alles.mjs etwas zum Durchlaufen.
//
//   CASORA_TOKENS='{"refresh_token":"…"}' node dev/qa/stress-setup.mjs [--force]
//
// Schreibt ins Test-HA (legt ein Dashboard an) – deshalb nur im Zustand „stress“,
// außer mit --force. Ein vorhandenes qa-stress(-mobile) wird vorher gelöscht.
//
// Auch für andere Zustände: --name qa-arbeit --state arbeit legt dort ein frisch im Studio
// angelegtes Prüf-Dashboard an (die Hemma-Fixture dashboard-hemma taugt nicht für Produktprüfungen).
import fs from 'node:fs';
import os from 'node:os';

process.env.CASORA_OUT = process.env.CASORA_OUT || '/tmp/casora-qa';
const { open, ready, shot } = await import('../e2e/harness.mjs');

// CASORA_ZUSTAND: Zustand eines Wegwerf-HA (dev/qa/wegwerf-ha.sh, paralleles Gate) – sonst der
// aktive Zustand von casora-test aus ~/casora-haus/aktiv.
const aktiv = process.env.CASORA_ZUSTAND || (() => { try { return fs.readFileSync(os.homedir() + '/casora-haus/aktiv', 'utf8').trim(); } catch (e) { return '?'; } })();
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const WANT = arg('state', 'stress');
if (aktiv !== WANT && !process.argv.includes('--force')) {
  console.error(`Test-HA ist im Zustand „${aktiv}“, nicht „${WANT}“ – erst dev/haus.sh ${WANT} (oder --force).`);
  process.exit(2);
}
const NAME = arg('name', 'qa-stress');
if (!/^qa-[a-z0-9-]+$/.test(NAME)) { console.error('--name muss mit „qa-“ beginnen (wird vorher gelöscht).'); process.exit(2); }
const { browser, page, errors } = await open();
const PANEL = () => { const p = window.__panel && window.__panel(); return p && p._hass && p._state !== undefined; };
await ready(page, '/casora-studio', PANEL);
// Lädt die Seite gerade neu (z. B. Weiterleitung nach dem ersten Laden), geht der Aufruf verloren:
// dann neu bereit machen und noch einmal (unter paralleler Last gesehen, 04.10.2026).
const H = async (fn, arg) => {
  for (let i = 0; ; i++) {
    try { return await page.evaluate(fn, arg); } catch (e) {
      if (i >= 2 || !/context was destroyed|navigation/i.test(String(e && e.message))) throw e;
      await ready(page, '/casora-studio', PANEL);
    }
  }
};

// Alte Fassung weg (Dashboard + Handy-Layout).
const removed = await H(async (name) => {
  const h = document.querySelector('home-assistant').hass;
  const out = [];
  for (const d of await h.callWS({ type: 'lovelace/dashboards/list' }))
    if (d.url_path === name || d.url_path === name + '-mobile') { await h.callWS({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); out.push(d.url_path); }
  return out;
}, NAME);
if (removed.length) { console.log('Entfernt:', removed.join(', ')); await ready(page, '/casora-studio', PANEL); }

// 1) Räume wählen: alle.
await H(() => window.__panel()._createForm());
await page.waitForFunction(() => window.__pierce('.rp-room').length > 0, null, { timeout: 30000 });
await H(() => window.__pierce('.rp-room').forEach((r) => r.setAttribute('aria-checked', 'true')));
const rooms = await H(() => window.__pierce('.rp-room').map((r) => r.dataset.name));
console.log('Räume:', rooms.length, rooms.join(' · '));
await H((n) => { const i = window.__pierce('.flowin input').filter((x) => x.offsetParent).pop(); i.value = n; i.dispatchEvent(new Event('input', { bubbles: true })); }, NAME);
// Knöpfe im Fuß des Assistenten (.flowfoot): der Hauptknopf ist der letzte ohne .ghost.
// Beschriftungen ändern sich (z. B. „Mit 44 Kacheln anlegen (≈ 3 pro Raum)“) – deshalb über
// die Rolle im Fuß klicken und die Beschriftung nur grob prüfen (Regex, nur zur Kontrolle).
const clickPrimary = async (re, what) => {
  // Der Fuß füllt sich teils erst nach einem WS-Aufruf (z. B. KI-Modelle in „Räume füllen“): warten.
  await page.waitForFunction((src) => {
    const re = new RegExp(src, 'i');
    const foot = window.__pierce('.flowfoot').filter((f) => f.offsetParent).pop();
    return !!foot && [...foot.querySelectorAll('button')].some((b) => b.offsetParent && !b.classList.contains('ghost') && !b.disabled && re.test(b.textContent.trim()));
  }, re.source, { timeout: 20000 }).catch(() => {});
  const label = await H((src) => {
    const re = new RegExp(src, 'i');
    const foot = window.__pierce('.flowfoot').filter((f) => f.offsetParent).pop();
    const btns = foot ? [...foot.querySelectorAll('button')].filter((b) => b.offsetParent && !b.classList.contains('ghost') && !b.disabled) : [];
    const b = btns.filter((x) => re.test(x.textContent.trim())).pop() || btns.pop();
    if (!b) return null;
    b.setAttribute('data-qa-click', '1');
    return b.textContent.trim();
  }, re.source);
  if (!label) throw new Error('Hauptknopf fehlt (' + what + ')');
  if (!re.test(label)) console.warn(`  Hinweis: Hauptknopf „${label}“ passt nicht zu ${re} – geklickt wird er trotzdem (${what})`);
  console.log(`  ▸ ${what}: „${label}“`);
  const h = await page.evaluateHandle(() => window.__pierce('[data-qa-click]')[0]);
  await h.asElement().click();
  await H(() => window.__pierce('[data-qa-click]').forEach((b) => b.removeAttribute('data-qa-click')));
};
const waitStep = (sel, what, timeout = 30000) =>
  page.waitForFunction((s) => window.__pierce(s).some((e) => e.offsetParent), sel, { timeout })
    .catch(() => { throw new Error('Schritt nicht erreicht: ' + what + ' (' + sel + ')'); });

await clickPrimary(/^(Dashboard erstellen|Create Dashboard)$/, '1/3 Räume');

// 2) Räume füllen: automatisch.
await waitStep('.themecard[data-k=auto]', '2/3 Räume füllen');
await H(() => window.__pierce('.themecard[data-k=auto]')[0].click());
await clickPrimary(/^(Weiter|Continue)$/, '2/3 Räume füllen');

// 3) Vorschau: alle Kacheln bleiben an → „Mit N Kacheln anlegen“ / „Create with N tiles“.
await waitStep('.bs-grid', '3/3 Vorschau');
await page.waitForFunction(() => window.__pierce('.bs-item[aria-checked]').length > 0, null, { timeout: 30000 }).catch(() => {});
const tiles = await H(() => window.__pierce('.bs-item[aria-checked]').length);
await H(() => window.__pierce('.bs-item[aria-checked=false]').forEach((b) => b.click()));
console.log('Kacheln im Vorschlag:', tiles);
await clickPrimary(/(anlegen|erstellen|^Create)/, '3/3 Anlegen');

// 4) Warten, bis Dashboard und Handy-Layout da sind (statt fester Wartezeit).
await page.waitForFunction(async (name) => {
  const h = document.querySelector('home-assistant').hass;
  const l = await h.callWS({ type: 'lovelace/dashboards/list' });
  return l.some((x) => x.url_path === name) && l.some((x) => x.url_path === name + '-mobile');
}, NAME, { timeout: 90000, polling: 1500 }).catch(() => console.warn('  Dashboard/Handy-Layout nach 90 s nicht vollständig'));
await page.waitForTimeout(2000);

console.log('  📸', await shot(page, NAME.replace(/-/g, '_') + '_setup_fertig'));

const made = await H(async (name) => {
  const h = document.querySelector('home-assistant').hass;
  const list = await h.callWS({ type: 'lovelace/dashboards/list' });
  const d = list.find((x) => x.url_path === name);
  if (!d) return null;
  const c = await h.callWS({ type: 'lovelace/config', url_path: d.url_path });
  return { url: d.url_path, views: (c.views || []).length, mobile: list.some((x) => x.url_path === d.url_path + '-mobile') };
}, NAME);
console.log('Angelegt:', JSON.stringify(made));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
await browser.close();
process.exit(made && made.mobile && made.views > 1 ? 0 : 1);
