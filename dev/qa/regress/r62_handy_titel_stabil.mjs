// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026, Nutzertest Handy): Der Titel der Startseite wechselte zwischen „Home“ und
// „Zuhause“. Ursache: casora-i18n übersetzte den wörtlichen Namen beim Zeichnen („Home“ → „Zuhause“),
// die Stil-Regel von casora_mobile_weather schrieb danach wieder „Home“ hinein – nach jedem Raum- oder
// Filterwechsel stand kurz das eine, dann das andere. Erwartet (Sprache de, Handy 390×844, WebKit):
// derselbe Titel beim Laden und nach jeder Rückkehr zur Übersicht, auch während der Wechsel.
import { open, usePage, dashboard, casoraDashboards, check, need, finish } from './lib.mjs';

// Wörtlicher Name (ohne home_auto) zuerst – dort trat der Wechsel auf.
const literal = (d) => { const m = JSON.stringify(d.config || {}).match(/"template":"casora_mobile_weather","variables":(\{[^}]*\})/);
  return !!m && !/"home_auto":true/.test(m[1]); };
const all = await casoraDashboards();
const phone = all.find((d) => d.mobile && literal(d)) || all.find((d) => d.mobile);
await need('Casora-Dashboard mit Handy-Gegenstück', phone);
console.log('  info   ' + phone.url + (literal(phone) ? ' (Name wörtlich)' : ''));

const { page } = await open({ width: 390, height: 844, mobile: true, safari: true });
usePage(page);
await dashboard(page, phone.url + '/' + (phone.config.views[0].path || '0'), 3);
const head = () => page.evaluate(() => {
  const w = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_weather'));
  const n = w && w.shadowRoot && w.shadowRoot.getElementById('name');
  return n ? n.textContent.trim() : null;
});
// Alle Titel mitschreiben, die auf der Übersicht zu sehen sind (alle 80 ms).
const seen = new Set();
const watch = async (ms, f) => { for (const t0 = Date.now(); Date.now() - t0 < ms; await page.waitForTimeout(80)) {
  const h = await head(); const cur = await page.evaluate(() => window._casoraFilter && window._casoraFilter.get());
  if (h && cur === 'all' && f === 'all') seen.add(h); } };
await watch(3000, 'all');
const first = [...seen][0];
await need('Titel der Übersicht', first, [...seen]);
const opts = await page.evaluate(() => document.querySelector('home-assistant').hass.states['input_select.casora_mobile_filter']?.attributes?.options || []);
const other = opts.filter((o) => o !== 'all').slice(0, 3);
for (const f of other.length ? other : ['security']) {
  await page.evaluate((f) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: f } })), f);
  await page.waitForTimeout(1800);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'all' } })));
  await watch(2500, 'all');
}
await check('Titel der Übersicht bleibt gleich (beim Laden und nach jedem Wechsel)', seen.size === 1, [...seen]);
await finish();
