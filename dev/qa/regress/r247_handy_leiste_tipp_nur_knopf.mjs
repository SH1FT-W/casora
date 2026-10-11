// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/filter-overlay.js
// Handy-Leiste B (1.3, Casora-Look): Glocke, Sprechblase und ⋯ sitzen unten in der Leiste in EINER Kapsel.
// Ein Tipp auf ⋯ ließ Glocke und Sprechblase mit aufleuchten (Meldung 10.10.2026: „wenn man unten auf die
// 3 Punkte klickt kommt ein Hovereffekt auf Assist und Glocke mit“). Ursache: der Tipp-Schein der alten
// Kopf-Kapsel (filter-overlay, ein Lichtfleck über die ganze Kapsel) lief in der Leiste weiter.
// Erwartet (Handy 393, WebKit mit Touch, hell): Während und nach dem Tipp auf ⋯ (bzw. Glocke, Sprechblase)
// bleiben die anderen Knöpfe wie in Ruhe – gleiche berechnete Fläche, Filter, Deckkraft, Größe, und keine
// zusätzliche sichtbare Ebene liegt über ihnen. Der getippte Knopf darf (und soll) reagieren.
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const d = (await casoraDashboard((x) => x.url === 'qa-arbeit')) || (await casoraDashboard());
await need('Casora-Dashboard mit Handy-Gegenstück', d && d.phone, d && d.url);

const { page } = await open({ width: 393, height: 852, mobile: true, touch: true, safari: true, scale: 2, dark: false, theme: 'Casora' });
usePage(page);
await dashboard(page, d.phone.url, 3);
await page.waitForFunction(() => !!document.querySelector('.hmn-bar.hmn-act .hmn-dock button-card'), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);

// Fühler: je Bild (rAF) die Fingerabdrücke aller sichtbaren Kapsel-Knöpfe nehmen – eigene Fläche/Filter/Größe
// und alle sichtbaren Ebenen im Halter, die über dem Knopf liegen, ohne zu ihm zu gehören.
const ready = await page.evaluate(() => {
  const card = document.querySelector('.hmn-dock button-card');
  if (!card) return null;
  const host = card.parentElement;
  const slots = ['bell', 'assist', 'edit'].map((k) => {
    const s = card.shadowRoot.getElementById(k);
    const b = s && s.querySelector('button-card');
    return b && b.getBoundingClientRect().width > 0 ? { k, b } : null;
  }).filter(Boolean);
  const all = (root, out = []) => {
    for (const el of root.querySelectorAll('*')) { out.push(el); if (el.shadowRoot) all(el.shadowRoot, out); }
    return out;
  };
  const visible = (cs) => parseFloat(cs.opacity) > 0.01 && cs.visibility !== 'hidden' && cs.display !== 'none'
    && ((cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) || (cs.backgroundImage && cs.backgroundImage !== 'none'));
  const inside = (el, b) => { for (let n = el; n; n = n.parentNode || n.host) { if (n === b) return true; } return false; };
  const sig = (b) => {
    const hc = b.shadowRoot.querySelector('ha-card');
    const g = b.shadowRoot.querySelector('.casora-bell,.casora-assist,.casora-settings');
    const cs = getComputedStyle(hc), gs = g ? getComputedStyle(g) : null, bs = getComputedStyle(b);
    const r = hc.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const over = [host, ...all(host)].filter((el) => {
      if (el === b || inside(el, b) || inside(b, el)) return false;
      const q = el.getBoundingClientRect();
      if (!(q.left <= cx && q.right >= cx && q.top <= cy && q.bottom >= cy)) return false;
      return visible(getComputedStyle(el));
    }).map((el) => el.tagName + '.' + (el.className || '') + ':' + getComputedStyle(el).opacity + ':' + getComputedStyle(el).backgroundImage.slice(0, 40));
    return JSON.stringify({ bg: cs.backgroundColor, bgi: cs.backgroundImage, f: cs.filter, o: cs.opacity, t: bs.transform + '|' + cs.transform,
      w: Math.round(r.width * 2) / 2, gf: gs && gs.filter, go: gs && gs.opacity, over });
  };
  window.__r247 = {
    slots, sig,
    rest: Object.fromEntries(slots.map(({ k, b }) => [k, sig(b)])),
    start(tapped) {
      const log = this.log = {};
      const t0 = performance.now();
      const step = () => {
        for (const { k, b } of slots) {
          if (k === tapped) continue;
          const s = sig(b);
          if (s !== this.rest[k] && !log[k]) log[k] = { ms: Math.round(performance.now() - t0), ruhe: this.rest[k], jetzt: s };
        }
        if (performance.now() - t0 < 900) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
  };
  return slots.map((s) => s.k);
});
await need('Kapsel mit mindestens zwei Knöpfen in der Leiste', ready && ready.length >= 2, ready);

const tapAt = (k) => page.evaluate((k) => {
  const s = window.__r247.slots.find((x) => x.k === k);
  const r = s.b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, k);

for (const k of ['edit', 'bell', 'assist'].filter((x) => ready.includes(x))) {
  const name = { edit: '⋯', bell: 'Glocke', assist: 'Sprechblase' }[k];
  const p = await tapAt(k);
  await page.evaluate((k) => window.__r247.start(k), k);
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForTimeout(1100);
  const log = await page.evaluate(() => window.__r247.log);
  await check(`Tipp auf ${name}: die anderen Knöpfe bleiben in Ruhe`, Object.keys(log).length === 0, log);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  // Sprechblase öffnet Assist (HA-Dialog) – der geht mit Escape zu; vorsichtshalber nochmal.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}
await page.close();
await finish();
