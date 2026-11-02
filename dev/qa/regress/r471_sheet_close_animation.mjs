// @zustand: arbeit
// @parallel: ui
// Issue #110: on the phone (Casora look, bottom sheet) closing a popup by swiping it down slid the sheet out, but
// tapping the dimmed scrim or the ✕ made it vanish without any animation. Expected: every close path slides the
// sheet down (its top edge travels at least MIN_TRAVEL px while the popup is closing); with reduced motion the sheet
// closes without moving, as before.
// R471_SHOTS=<dir>: writes one picture taken right after the tap per path (mid-close when the sheet slides).
import { open, usePage, casoraDashboards, dashboard, cards, check, need, finish } from './lib.mjs';

const MIN_TRAVEL = 40;
const SHOTS = process.env.R471_SHOTS || '';
const all = await casoraDashboards();
const phones = all.filter((d) => d.mobile);
await need('Casora-Handy-Dashboard', phones.length);

const isPop = (c) => c.t.some((x) => /casora_popup_|casora_light$|casora_cover/.test(x)) && c.y > 150 && c.y < 700;
const popOpen = (page) => page.waitForFunction(() => window.__pierce('casora-popup').some((p) => p.hasAttribute('shown')
  && !p.hasAttribute('closing')), null, { timeout: 8000 }).then(() => true, () => false);

// Records the sheet's top edge on every frame from the moment the popup starts closing until it is gone.
const arm = (page) => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const sf = pop.shadowRoot.querySelector('.surface');
  const rec = window.__r471 = { top0: sf.getBoundingClientRect().top, max: 0, soft: pop.hasAttribute('soft'), done: false };
  const mo = new MutationObserver(() => {
    if (!pop.hasAttribute('closing')) return;
    mo.disconnect();
    const t0 = performance.now();
    (function tick() {
      if (pop.hasAttribute('open')) rec.max = Math.max(rec.max, sf.getBoundingClientRect().top - rec.top0);
      if (pop.hasAttribute('open') && performance.now() - t0 < 600) requestAnimationFrame(tick); else rec.done = true;
    })();
  });
  mo.observe(pop, { attributes: true, attributeFilter: ['closing'] });
  return rec;
});
const result = async (page) => {
  await page.waitForFunction(() => window.__r471 && window.__r471.done, null, { timeout: 4000 }).catch(() => {});
  return page.evaluate(() => window.__r471);
};

async function openPopup(page) {
  let tiles = [];
  for (const ph of phones) {
    await dashboard(page, ph.url + '/' + (ph.config.views[0].path || '0'));
    tiles = (await cards(page)).filter(isPop);
    if (tiles.length) break;
  }
  if (!tiles.length) return false;
  for (let i = 0; i < 3; i++) {
    const now = i ? (await cards(page)).filter(isPop) : tiles;
    const t = now[0] || tiles[0];
    await page.touchscreen.tap(t.x + t.w / 2, t.y + t.h / 2);
    if (await popOpen(page)) { await page.waitForTimeout(800); return true; }
  }
  return false;
}

const paths = {
  // The strip of dimmed scrim above the sheet (Casora look leaves 44 px).
  scrim: async (page) => page.touchscreen.tap(195, 12),
  close: async (page) => {
    const r = await page.evaluate(() => {
      const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
      const b = pop.shadowRoot.querySelector('.header-close').getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    await page.touchscreen.tap(r.x, r.y);
  },
};

for (const reduce of [false, true]) {
  for (const [name, act] of Object.entries(paths)) {
    const label = (reduce ? 'reduzierte Bewegung, ' : '') + name;
    const { page } = await open({ mobile: true, width: 390, height: 844 });
    usePage(page);
    if (reduce) await page.emulateMedia({ reducedMotion: 'reduce' });
    await need(label + ': Popup am Handy offen', await openPopup(page));
    const armed = await arm(page);
    await act(page);
    if (SHOTS && !reduce) await page.waitForTimeout(90).then(() => page.screenshot({ path: `${SHOTS}/${name}.png` })).catch(() => {});
    const r = await result(page);
    const closed = await page.waitForFunction(() => !window.__pierce('casora-popup').some((p) => p.hasAttribute('open')), null, { timeout: 4000 }).then(() => true, () => false);
    await check(label + ': Popup schließt', closed, r);
    if (reduce) await check(label + ': Blatt schließt ohne Bewegung', r && r.max < 2, r);
    else await check(label + `: Blatt gleitet beim Schließen nach unten (≥ ${MIN_TRAVEL} px)`, armed.soft !== undefined && r && r.max >= MIN_TRAVEL, r);
    await page.context().browser().close();
  }
}
await finish();
