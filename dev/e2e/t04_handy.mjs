// Handy-Ansicht eines Dashboards (Standard: das in t03 angelegte) – Fehlerkarten + Bild.
import { open, shot, PIERCE, BASE } from './harness.mjs';
import { check, ende, echteFehler } from './ergebnis.mjs';
const url = process.argv[2] || 'test-neu-mobile';
const { browser, page, errors } = await open({ width: 390, height: 844, mobile: true });
await page.goto(BASE + '/' + url, { waitUntil: 'domcontentloaded' });
await page.addScriptTag({ content: PIERCE });
await page.waitForTimeout(10000);
const r = await page.evaluate(() => ({
  path: location.pathname,
  bad: window.__pierce('hui-error-card').map((e) => { const c = e._config || {}; return String(c.message || c.error || '').slice(0, 160); }),
  cards: window.__pierce('button-card').length,
}));
console.log(url, JSON.stringify(r, null, 1));
console.log('  📸', await shot(page, 'm_' + url.replace(/\//g, '_')));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
check('Dashboard geöffnet', r.path.startsWith('/' + url), r.path);
check('Karten da', r.cards > 0, r.cards);
check('keine Fehlerkarten', !r.bad.length, r.bad);
check('keine Browser-Fehler', !echteFehler(errors).length, echteFehler(errors));
await browser.close();
ende();
