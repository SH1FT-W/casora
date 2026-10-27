// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js
// Reported (owner, 27.10.2026): in nearly every popup the headings jumped up after opening. The status line was
// drawn inside the content first and lifted into the header a frame (on slow devices several) later, so all
// sections moved up ~26 px. Expected: from the first frame in which the content is visible, section headings and
// rows of the lock, thermostat and blinds popups keep their position (≤ 2 px). Desktop 1440 and phone 393.
// 27.10.2026 (prod, after the first fix): charts (air purifier, weather: the chart slot grew 150 → 174 px after the
// reveal), rule-12 column padding (dishwasher) and the Sicherheit overview (sheet top and header moved) – also the
// sheet's top edge and the header title must stay put.
import { open, dashboard, casoraDashboards, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const WANT = /^(casora_lock|casora_thermostat|casora_cover|casora_air_purifier|casora_weather|casora_geschirrspueler|casora_badge_security_group)$/;

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  const seen = new Set();
  for (const [i, v] of (desk.config.views || []).entries()) {
    if (seen.size >= 7) break;
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
          // Only once the sheet has arrived (the phone sheet slides in – that is no jump).
          const dlg = s && s.closest && s.closest('dialog');
          const sliding = [s, dlg].some((e) => e && e.getAnimations && e.getAnimations().some((a) => a.playState === 'running'));
          // The plates' entrance (opacity + transform, replayed on the final layout since 27.10.2026) moves boxes
          // visually, not in layout: the first visible frame is measured with those animations at their end, later
          // frames only once they are over.
          const anims = [];
          if (c) { c.getAnimations({ subtree: true }).forEach((a) => anims.push(a));
            deep(c, '*', []).forEach((n) => { if (n.shadowRoot && n.shadowRoot.getAnimations) n.shadowRoot.getAnimations().forEach((a) => anims.push(a)); }); }
          const moving = anims.filter((a) => a.animationName && a.playState === 'running');
          const firstFrame = !window.__jt.length;
          if (s && c && !sliding && (firstFrame || !moving.length) && getComputedStyle(c).visibility !== 'hidden' && parseFloat(getComputedStyle(s).opacity || '1') > 0.5) {
            const saved = firstFrame ? moving.map((a) => { const t = a.currentTime; try { a.currentTime = a.effect.getComputedTiming().endTime - 0.01; } catch (e) { /* keep */ } return t; }) : [];
            const R = s.getBoundingClientRect(), ht = P.element.shadowRoot.querySelector('.header-title');
            // Positions on the page: the sheet's top and the header title count as well (Sicherheit overview).
            window.__jt.push([[Math.round(R.top), '§sheet'], [Math.round(ht ? ht.getBoundingClientRect().top : 0), '§title']]
              .concat(deep(s, '.hui-slbl,.hui-srow', []).slice(0, 8).map((n) => [Math.round(n.getBoundingClientRect().top), (n.textContent || '').trim().slice(0, 16)])));
            moving.forEach((a, k) => { if (firstFrame) try { a.currentTime = saved[k]; } catch (e) { /* keep */ } });
          }
          if (performance.now() - t0 < 1600) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      if (size.mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(1900);
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
  // Chart popups: on the desktop (the phone's Home of the test house has no chart tile).
  await check(`${label}: Popups gemessen`, size.mobile ? seen.size >= 3 : seen.size >= 4 && ['casora_air_purifier', 'casora_weather'].some((t) => seen.has(t)), [...seen]);
  // The test house's security badge has entries of its own: the overview opens on the phone (Home), not on the desktop.
  if (size.mobile) await check(`${label}: Sicherheits-Übersicht gemessen`, seen.has('casora_badge_security_group'), [...seen]);
  await page.context().close();
}
await finish();
