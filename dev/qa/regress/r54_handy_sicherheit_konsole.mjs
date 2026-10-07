// @zustand: arbeit
// Gemeldet (06.10.2026): Am Handy warf die Seite „Sicherheit“ beim Öffnen einen Konsolenfehler
// „Cannot read properties of null (reading 'nextSibling')“ (WebKit: „null is not an object
// (evaluating 't.nextSibling')“). Ursache: casora_mobile_weather schrieb den Namen der Übersicht
// per textContent in #name zurück (Regel casoraRoomName) und löschte dabei Lits Platzhalter; beim
// nächsten Namen („Sicherheit“) brach button-card ab. Erwartet: Sicherheit-Seite (390×844) ohne
// Konsolenfehler, Kopf zeigt „Sicherheit“, #name behält seinen Platzhalter.
import { open, usePage, dashboard, casoraDashboards, check, need, finish } from './lib.mjs';

// Der Fehler trat nur auf, wenn der Name wörtlich steht (ohne home_auto, z. B. importierte Dashboards
// mit „Home“) – solche Dashboards zuerst, sonst irgendeins mit Handy-Gegenstück.
const literal = (d) => { const m = JSON.stringify(d.config || {}).match(/"template":"casora_mobile_weather","variables":(\{[^}]*\})/);
  return !!m && !/"home_auto":true/.test(m[1]); };
const all = await casoraDashboards();
const phone = (process.env.CASORA_QA_DASH ? null : all.find((d) => d.mobile && literal(d)))
  || all.find((d) => d.mobile && all.some((x) => x.url + '-mobile' === d.url));
const dash = phone && { phone };
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
console.log('  info   ' + phone.url + (literal(phone) ? ' (Name wörtlich)' : ''));

const headName = (page) => page.evaluate(() => {
  const w = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_weather'));
  const n = w && w.shadowRoot && w.shadowRoot.getElementById('name');
  return n ? { text: n.textContent.trim(), marker: Array.from(n.childNodes).some((c) => c.nodeType === 8) } : null;
});

for (const safari of [false, true]) {
  const eng = safari ? 'WebKit' : 'Chromium';
  const { page, errors } = await open({ width: 390, height: 844, mobile: true, safari });
  usePage(page);
  await dashboard(page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'), 3);
  // Kurz warten, bis die Kopfzeile ihren Namen gesetzt hat (dabei ging der Platzhalter verloren).
  await page.waitForTimeout(1500);
  const vor = await headName(page);
  await need(`${eng}: Handy-Kopf (casora_mobile_weather)`, vor, vor);
  await check(`${eng}: Name der Übersicht behält Lits Platzhalter`, vor.marker, vor);
  const n0 = errors.length;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'security' } })));
  await page.waitForTimeout(3500);
  const nach = await headName(page);
  const neu = errors.slice(n0);
  await check(`${eng}: Sicherheit-Seite ohne Konsolenfehler`, neu.length === 0, neu.slice(0, 3));
  await check(`${eng}: Kopf zeigt „Sicherheit“`, nach && nach.text === 'Sicherheit', nach);
  // Zurück zur Übersicht: wieder der Name, ebenfalls ohne Fehler.
  const n1 = errors.length;
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'all' } })));
  await page.waitForTimeout(2500);
  const zur = await headName(page);
  await check(`${eng}: zurück zur Übersicht ohne Fehler, Name wieder da`, errors.length === n1 && zur && zur.text && zur.text !== 'Sicherheit',
    { fehler: errors.slice(n1, n1 + 3), kopf: zur });
}
await finish();
