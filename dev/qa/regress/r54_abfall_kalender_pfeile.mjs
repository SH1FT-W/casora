// @zustand: arbeit
// @parallel: ui
// Gemeldet (07.10.2026): Im Abfall-Popup mit Monatskalender waren die Pfeile zum Blättern (Monat
// vor/zurück) oben abgeschnitten – auf Handy, Tablet und Desktop, im Theme „Casora“ (Weich). Die
// Pfeile ragen dort absichtlich 6 px über die Überschrift hinaus; button-card schneidet seine Felder
// aber ab (overflow: hidden). Seit 1.0.9.
// Erwartet: beide Pfeile liegen vollständig innerhalb aller abschneidenden Eltern (overflow hidden/
// clip) und des Fensters – Handy 390×844, Tablet 1024×768, Desktop 1600×1000, Weich hell.
// Der Monatskalender ist eine Einstellung (Studio → Haus & Geräte); der Test schaltet sie nur im
// Browser ein (window.CASORA_SETTINGS), am Test-HA ändert sich nichts.
import { open, casoraDashboards, dashboard, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const hasTrash = (d) => !/importiert/.test(d.url) && JSON.stringify(d.config).includes('"casora_trash"');
const desk = all.find((d) => !d.mobile && hasTrash(d));
const phoneDash = all.find((d) => d.mobile && hasTrash(d)) || desk;
await need('Casora-Dashboard mit Abfall-Kachel', desk);

const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

async function measure(name, opts, dash) {
  const { page } = await open({ dark: false, theme: 'Casora', ...opts });
  await dashboard(page, dash.url, 3);
  let at = null;
  for (const v of [null, ...(dash.config.views || []).map((x, i) => x.path || String(i))]) {
    if (v) await dashboard(page, dash.url + '/' + v, 3);
    at = await page.evaluate(() => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_trash')
        && x.getBoundingClientRect().width > 20);
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (at) break;
  }
  if (!at) return { name, kachel: false };
  await page.evaluate(() => {
    const S = window.CASORA_SETTINGS || {};
    window.CASORA_SETTINGS = { ...S, waste: { ...(S.waste || {}), calendar_popup: true } };
  });
  await page.waitForTimeout(400);
  if (opts.touch || opts.mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  await page.waitForFunction(() => window.__pierce('.hcal-b').some((b) => b.getBoundingClientRect().width > 0), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return page.evaluate((name) => {
    const soft = !!(window._casoraHH && window._casoraHH.on());
    const arrows = window.__pierce('.hcal-b').filter((b) => b.getBoundingClientRect().width > 0
      && /^wnav/.test(b.dataset.hcal || ''));
    const out = { name, soft, arrows: [] };
    for (const b of arrows) {
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      const clip = { t: 0, l: 0, r: innerWidth, b: innerHeight };
      let by = '';
      for (let n = b; n;) {
        n = n.parentElement || (n.parentNode && n.parentNode.host) || null;
        if (!n || n === document.documentElement) break;
        const cs = getComputedStyle(n);
        if (!/hidden|clip/.test(cs.overflowX + ' ' + cs.overflowY)) continue;
        const q = n.getBoundingClientRect();
        const nm = n.id || String(n.className || n.tagName).slice(0, 30);
        if (q.top > clip.t) { clip.t = q.top; by = nm; }
        if (q.bottom < clip.b) { clip.b = q.bottom; by = nm; }
        if (q.left > clip.l) { clip.l = q.left; by = nm; }
        if (q.right < clip.r) { clip.r = q.right; by = nm; }
      }
      const cut = Math.max(clip.t - r.top, r.bottom - clip.b, clip.l - r.left, r.right - clip.r);
      out.arrows.push({ nav: b.dataset.hcal, cut: Math.round(cut * 10) / 10, by });
    }
    return out;
  }, name);
}

const runs = [
  ['Handy', { width: 390, height: 844, mobile: true }, phoneDash],
  ['Tablet', { width: 1024, height: 768, touch: true, userAgent: IPAD }, desk],
  ['Desktop', { width: 1600, height: 1000 }, desk],
];
for (const [name, opts, dash] of runs) {
  const m = await measure(name, opts, dash);
  await need(name + ': Abfall-Kachel gefunden', m.kachel !== false, m);
  await need(name + ': Weich-Look aktiv', m.soft, m);
  await need(name + ': beide Blätter-Pfeile im Abfall-Popup sichtbar', m.arrows.length === 2, m);
  await check(name + ': Blätter-Pfeile nicht abgeschnitten', m.arrows.every((a) => a.cut <= 0.5), m.arrows);
}
await finish();
