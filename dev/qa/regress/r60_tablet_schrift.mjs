// @zustand: arbeit
// @parallel: ui
// Gewünscht (07.10.2026): Am Tablet war Kleingedrucktes im Casora-Look schwer zu lesen (Wetter
// „H · T · Regen“ 10,5 px, Badge-Zustände 11,4 px, Kachel-Zustände 12,5 px).
// Erwartet (iPad 1024×768 quer mit Seitenleiste und 768×1024 hochkant, hell): kein Text im
// Dashboard unter 13 px auf der Startseite und dem ersten Raum, und keine der vergrößerten Zeilen
// (13/14 px: Zustände, Wetter) mit „…“ gekürzt. Lange Kachelnamen (15 px) kürzt Casora wie bisher.
import { open, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const views = dash.config.views.slice(0, 2).map((v, i) => v.path || String(i));
for (const [w, h] of [[1024, 768], [768, 1024]]) {
  const { page } = await open({ width: w, height: h, dark: false, theme: 'Casora', touch: true, userAgent: IPAD });
  for (const v of views) {
    await dashboard(page, dash.url + '/' + v, 3);
    const r = await page.evaluate(() => {
      const small = [], cut = [];
      (function walk(root) {
        root.querySelectorAll('*').forEach((e) => {
          if (e.shadowRoot) walk(e.shadowRoot);
          const own = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => n.textContent.trim()).join(' ');
          if (!own) return;
          const q = e.getBoundingClientRect();
          if (!q.width || q.bottom < 0 || q.top > innerHeight) return;
          let n = e, inView = false;
          while (n) { if (n.localName === 'hui-view') { inView = true; break; } n = n.parentElement || (n.parentNode && n.parentNode.host); }
          if (!inView) return;
          const cs = getComputedStyle(e);
          if (cs.visibility === 'hidden' || cs.opacity === '0') return;
          const fs = parseFloat(cs.fontSize);
          if (fs < 12.95) small.push(own.slice(0, 20) + ' ' + fs.toFixed(1));
          if (fs < 14.5 && cs.textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1) cut.push(own.slice(0, 24) + ' ' + fs.toFixed(1) + ' ' + String(e.id || e.className || e.localName).slice(0, 20));
        });
      })(document);
      return { soft: !!(window._casoraSoft && window._casoraSoft(true)), small, cut };
    });
    await check(`${w}×${h} ${v}: Casora-Look aktiv`, r.soft);
    await check(`${w}×${h} ${v}: kein Text unter 13 px`, !r.small.length, r.small.slice(0, 8));
    await check(`${w}×${h} ${v}: nichts mit „…“ gekürzt`, !r.cut.length, r.cut.slice(0, 8));
  }
}
await finish();
