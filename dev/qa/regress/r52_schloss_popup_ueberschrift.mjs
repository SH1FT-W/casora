// @zustand: arbeit
// @parallel: ui
// Gemeldet (dashfix 23, 07.10.2026): Schlösser-Popup am Tablet (zweispaltig) – die Überschrift
// „Schloss“ / „Alle Schlösser“ wurde vom Schalter darunter halb überdeckt. Der negative Abstand unter
// der Überschrift ist für das einspaltige Raster mit Zeilenlücke gedacht; in den Spalten ab 761 px
// gibt es keine Zeilenlücke.
// Erwartet: Tablet 1180×820 (Weich, hell) – der Schalter beginnt unterhalb der Überschrift; Handy
// 390×844 ebenso (dort unverändert).
// v3 (01.11.2026): The popup no longer has its own „Schloss“ title row (#tlbl); the header comes from the
// frame. The same overlap can still hit the list heading („Gerät“, .hui-slbl) over its plate, so the
// test measures every visible list heading against the plate right below it.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

// qa-arbeit hat eine Schloss-Kachel mit Gerät; importierte Kopien zeigen mangels Geräten oft keine Kacheln.
const hasLock = (d) => !/importiert/.test(d.url) && JSON.stringify(d.config).includes('"casora_lock"');
const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit' && hasLock(d))) || (await casoraDashboard(hasLock));
await need('Casora-Dashboard mit Schloss-Kachel', dash);

async function measure(opts, url) {
  const { page } = await open(opts);
  await dashboard(page, url, 3);
  let at = null;
  for (const v of [null, ...(dash.config.views || []).map((x, i) => x.path || String(i))]) {
    if (v) await dashboard(page, dash.url + '/' + v, 3);
    at = await page.evaluate(() => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_lock')
        && x.getBoundingClientRect().width > 40);
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + 30, y: r.y + r.height - 20 };
    });
    if (at) break;
  }
  if (!at) return null;
  await page.waitForTimeout(400);
  if (opts.touch || opts.mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const heads = window.__pierce('.hui-slbl').filter((x) => x.getBoundingClientRect().height > 0);
    if (!heads.length) return { label: false };
    // The worst pair: heading bottom vs. top of the next visible element (its plate).
    let worst = null;
    for (const l of heads) {
      const lr = l.getBoundingClientRect();
      let n = l.nextElementSibling;
      while (n && n.getBoundingClientRect().height === 0) n = n.nextElementSibling;
      if (!n) continue;
      const nr = n.getBoundingClientRect();
      const gap = nr.top - lr.bottom;
      if (!worst || gap < worst.gap) worst = { label: true, text: l.textContent.trim(), labelBottom: Math.round(lr.bottom), nextTop: Math.round(nr.top), gap };
    }
    return worst || { label: false };
  });
}

const tab = await measure({ width: 1180, height: 820, touch: true, dark: false, theme: 'Casora',
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15' }, dash.url);
await need('Schloss-Popup mit Listen-Überschrift am Tablet', tab && tab.label && tab.nextTop != null, tab);
await check('Tablet: Platte beginnt unter der Überschrift', tab.nextTop >= tab.labelBottom - 1, tab);
const phone = await measure({ width: 390, height: 844, mobile: true, dark: false, theme: 'Casora' }, dash.url);
console.log("  info   phone", JSON.stringify(phone));
if (phone && phone.label && phone.nextTop != null) await check('Handy: Platte beginnt unter der Überschrift', phone.nextTop >= phone.labelBottom - 1, phone);
await finish();
