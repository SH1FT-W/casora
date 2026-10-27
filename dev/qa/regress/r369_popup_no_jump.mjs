// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Reported (owner, 27.10.2026): in nearly every popup the headings jumped up after opening. The status line was
// drawn inside the content first and lifted into the header a frame (on slow devices several) later, so all
// sections moved up ~26 px. Expected: from the first frame in which the content is visible, section headings and
// rows of the lock, thermostat and blinds popups keep their position (≤ 2 px). Desktop 1440 and phone 393.
import { open, dashboard, casoraDashboards, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const WANT = /^(casora_lock|casora_thermostat|casora_cover)$/;

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  const seen = new Set();
  for (const [i, v] of (desk.config.views || []).entries()) {
    if (seen.size >= 3) break;
    await dashboard(page, desk.url + '/' + (v.path || String(i)), 3);
    await page.waitForTimeout(1500);
    const tiles = await page.evaluate((re) => window.__pierce('button-card').map((b, k) => ({ k, t: [].concat((b._config || {}).template || []).find((x) => new RegExp(re).test(x)), r: b.getBoundingClientRect() }))
      .filter((x) => x.t && x.r.width > 60 && x.r.height > 30).map(({ k, t }) => ({ k, t })), WANT.source);
    for (const tl of tiles) {
      if (seen.has(tl.t)) continue;
      const at = await page.evaluate((k) => { const b = window.__pierce('button-card')[k]; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, tl.k);
      await page.waitForTimeout(300);
      await page.evaluate(() => {
        window.__jt = []; const t0 = performance.now();
        const deep = (root, sel, out) => { root.querySelectorAll(sel).forEach((n) => out.push(n)); root.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) deep(n.shadowRoot, sel, out); }); return out; };
        const tick = () => {
          const P = window.casoraPopup, s = P && P.surface, c = P && P.element && P.element.shadowRoot && P.element.shadowRoot.querySelector('.content');
          if (s && c && getComputedStyle(c).visibility !== 'hidden' && parseFloat(getComputedStyle(s).opacity || '1') > 0.5) {
            const R = s.getBoundingClientRect();
            window.__jt.push(deep(s, '.hui-slbl,.hui-srow', []).slice(0, 8).map((n) => [Math.round(n.getBoundingClientRect().top - R.top), (n.textContent || '').trim().slice(0, 16)]));
          }
          if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      if (size.mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(1500);
      const moves = await page.evaluate(() => { const T = (window.__jt || []).filter((f) => f.length); if (T.length < 2) return null;
        const a = T[0], b = T[T.length - 1];
        // Same text may repeat (two „Jalousie Wohnzimmer…“): compare the n-th occurrence with the n-th.
        const key = (f) => { const n = {}; return f.map((e) => [e[0], e[1] + '#' + (n[e[1]] = (n[e[1]] || 0) + 1)]); };
        const A = key(a), B = key(b);
        return A.map((e) => { const l = B.find((x) => x[1] === e[1]); return l && Math.abs(l[0] - e[0]) > 2 ? e[1] + ' ' + e[0] + '→' + l[0] : null; }).filter(Boolean); });
      if (moves) { seen.add(tl.t); await check(`${label}: ${tl.t} – nichts springt nach dem Öffnen`, !moves.length, moves); }
      await page.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close());
      await page.waitForTimeout(700);
    }
  }
  await check(`${label}: Popups gemessen (mind. 2)`, seen.size >= 2, [...seen]);
  await page.context().close();
}
await finish();
