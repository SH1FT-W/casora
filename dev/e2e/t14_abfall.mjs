// Abfall-Kachel neutral: frisch angelegtes Dashboard (Paket-Vorlagen), mit und ohne
// /config/www/casora/einstellungen.js. Aufruf: node t14_abfall.mjs [dashboard]
import { open, PIERCE, shot, BASE } from './harness.mjs';
const DASH = process.argv[2] || 'test-neu';
const { browser, page, errors } = await open();
await page.goto(BASE + '/' + DASH + '/home', { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: PIERCE });
await page.waitForTimeout(12000);
const info = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass;
  const W = window.casoraDevice && window.casoraDevice.waste(h);
  const b = window.__pierce('button-card').find((x) => x._config && [].concat(x._config.template || []).includes('casora_trash'));
  const cal = window._casoraCalendar ? window._casoraCalendar.cals({}).map((c) => c.name + (c.tile === false ? '*' : '')) : null;
  return {
    settings: !!window.CASORA_SETTINGS,
    tonnen: W && W.bins.map((x) => x.label + ':' + x.days), kalender: W && W.calendar, dienst: W && W.duty, monate: W && W.months,
    kachel: b ? (b.shadowRoot?.querySelector('ha-card')?.innerText || '').replace(/\s+/g, ' ').trim() : 'KEINE KACHEL',
    kalenderliste: cal,
  };
});
console.log('Abfall:', JSON.stringify(info));
const tile = page.locator('button-card').filter({ hasText: /Abfall/ }).first();
try {
  await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => x._config && [].concat(x._config.template || []).includes('casora_trash')); b.scrollIntoView({ block: 'center' }); b.shadowRoot.querySelector('ha-card').click(); });
  await page.waitForTimeout(2500);
  const pop = await page.evaluate(() => {
    const d = window.__pierce('ha-dialog, casora-popup, .casora-popup, bubble-card, ha-adaptive-dialog').filter((e) => e.offsetParent || e.open);
    const txt = window.__pierce('button-card').filter((x) => x.offsetParent && /Nächste Abholung|Keine Termine/.test(x.shadowRoot?.textContent || '')).map((x) => x.shadowRoot.textContent);
    return (txt.join(' ').replace(/\s+/g, ' ').replace(/<style>.*?<\/style>|[.#][\w-]+\{[^}]*\}/g, '').trim()).slice(0, 400) || ('Dialoge: ' + d.length);
  });
  console.log('Popup:', pop);
  console.log('  📸', await shot(page, 'ab_' + (process.env.FALL || 'popup')));
} catch (e) { console.log('Popup FEHLER', e.message); }
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
await browser.close();
