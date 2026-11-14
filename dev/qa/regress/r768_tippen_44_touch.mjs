// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#casora-nav-bar,casoraNotify, custom_components/casora/scripts/smart-row.js
// Wanted (V1, 14.11.2026, everyday-use round): on touch every target reaches 44 × 44 px where a finger meets it. Measured
// before: phone badges 40 high, bell „Alles gelesen“/„Alle entfernen“ 32 high, tablet page dots 18 × 18, room bar
// arrows 30 × 30 (the phone bar's bell/assist/⋯ already reached 48 through --casora-chrome-hit). Invisible rims keep the
// look; only the page dots sit wider apart on touch (44 each, they cannot grow without overlapping). The mouse keeps
// the old sizes. The page dots fill the row's bottom padding down to the screen edge but never reach up over the tiles:
// 44 high dots took the bottom 12 px of the tiles above them (14.11.2026, r30: a swipe stack's own dots went dead). Measured as a finger meets it: how far from the centre elementFromPoint (through shadow roots) still
// lands on the element.
import { open, usePage, dashboard, casoraDashboards, check, need, finish } from './lib.mjs';

const IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const all = await casoraDashboards();
const phone = all.find((d) => d.mobile);
const desk = all.find((d) => !d.mobile && d.config.views.length > 3);
await need('Handy- und Desktop-Dashboard', phone && desk);

// Hit box of each element matching pick(): extent around the centre that still hits the element (or a descendant).
const HIT = () => {
  window.__hitBox = (el) => {
    const R = el.getBoundingClientRect(); const cx = R.x + R.width / 2, cy = R.y + R.height / 2;
    const hits = (x, y) => {
      // The screen edge stops a finger: a target that reaches it is as large as it gets in that direction.
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return true;
      let n = document.elementFromPoint(x, y);
      while (n && n.shadowRoot) { const m = n.shadowRoot.elementFromPoint(x, y); if (!m || m === n) break; n = m; }
      for (let p = n; p; p = p.parentNode || p.host) if (p === el) return true;
      return false;
    };
    window.__hits = hits;
    const ext = (dx, dy) => { let k = 0; while (k < 30 && hits(cx + dx * (k + 1), cy + dy * (k + 1))) k++; return k; };
    if (!hits(cx, cy)) return { w: 0, h: 0, vis: [Math.round(R.width), Math.round(R.height)] };
    return { w: ext(-1, 0) + ext(1, 0) + 1, h: ext(0, -1) + ext(0, 1) + 1, vis: [Math.round(R.width), Math.round(R.height)] };
  };
};
const fmt = (xs) => xs.map((x) => `${x.n} ${x.w}×${x.h} (sichtbar ${x.vis.join('×')})`);

// Phone: bar tools, badges, bell actions.
{
  const { page } = await open({ width: 393, height: 852, mobile: true, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, phone.url + '/' + (phone.config.views[0].path || '0'), 3);
  await page.evaluate(HIT);
  const tools = await page.evaluate(() => window.__pierce('button-card').filter((b) => /casora_(notifications|assist|settings)_button/.test([].concat((b._config || {}).template || []).join(' '))
    && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top > window.innerHeight / 2)
    .map((b) => ({ n: [].concat(b._config.template).join('+'), ...window.__hitBox(b) })));
  await need('Handy-Leiste mit Glocke', tools.length >= 2, tools.length);
  await check('Handy-Leiste: Glocke, Sprechblase, ⋯ mindestens 44 × 44', tools.every((x) => x.w >= 44 && x.h >= 44), fmt(tools));
  const badges = await page.evaluate(() => window.__pierce('button-card').filter((b) => {
    const t = [].concat((b._config || {}).template || []).join(' '); const r = b.getBoundingClientRect();
    return /casora_badge_/.test(t) && r.height > 30 && r.height < 60 && r.left >= 0 && r.right <= window.innerWidth && r.top < 200;
  }).map((b) => ({ n: [].concat(b._config.template).join('+'), ...window.__hitBox(b) })));
  await need('Handy-Badges sichtbar', badges.length >= 2, badges.length);
  await check('Handy-Badges: Trefferfläche mindestens 44 hoch', badges.every((x) => x.h >= 44), fmt(badges));
  await check('Handy-Badges: sichtbar weiter 40 hoch (Optik bleibt)', badges.every((x) => x.vis[1] === 40), fmt(badges));

  const bell = tools.find((x) => /notifications/.test(x.n));
  if (bell) {
    const p = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_notifications_button')
      && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().top > window.innerHeight / 2); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(1800);
    const acts = await page.evaluate(() => [...document.querySelectorAll('.casora-notify-read')].filter((b) => b.getBoundingClientRect().width > 0)
      .map((b) => ({ n: b.textContent.trim(), ...window.__hitBox(b) })));
    if (acts.length) {
      await check('Glocke: „Alles gelesen“/„Alle entfernen“ mindestens 44 hoch', acts.every((x) => x.h >= 44 && x.w >= 44), fmt(acts));
      await check('Glocke: Knöpfe sichtbar weiter 32 hoch', acts.every((x) => x.vis[1] <= 34), fmt(acts));
    } else console.log('  info   Glocke ohne Meldungen – keine Knöpfe');
  }
}

// Tablet (touch): page dots of the tile row and the room bar arrows.
const room = desk.config.views.map((v) => v.path).find((p) => /wohnzimmer/.test(p || '')) || desk.config.views[1].path;
const measureTablet = async (touch) => {
  const { page } = await open({ width: 1180, height: 820, dark: false, theme: 'Casora', touch, userAgent: touch ? IPAD : undefined });
  usePage(page);
  await dashboard(page, desk.url + '/' + room);
  await page.evaluate(HIT);
  return page.evaluate(() => {
    const dots = window.__pierce('#dots > button').filter((b) => b.getBoundingClientRect().width > 0).map((b, i) => {
      const R = b.getBoundingClientRect(), top = b.parentElement.getBoundingClientRect().top;
      const hb = window.__hitBox(b);
      // Above the padding (over the tile) the tile must take the tap, not the dot.
      return { n: 'Punkt ' + (i + 1), ...hb, edge: R.bottom >= innerHeight - 1, overTile: window.__hits(R.x + R.width / 2, top - 3) };
    });
    const arrows = window.__pierce('casora-nav-bar').flatMap((nb) => [...(nb.shadowRoot ? nb.shadowRoot.querySelectorAll('.more') : [])])
      .filter((b) => b.getBoundingClientRect().width > 0 && getComputedStyle(b).pointerEvents !== 'none' && getComputedStyle(b).visibility !== 'hidden')
      .map((b) => ({ n: b.className, ...window.__hitBox(b) }));
    return { dots, arrows, coarse: matchMedia('(pointer: coarse)').matches };
  });
};
const tab = await measureTablet(true);
await need('Tablet meldet Touch', tab.coarse);
await need('Tablet: Seitenpunkte unter der Kachelreihe', tab.dots.length >= 2, tab.dots.length);
// The tablet row ends at the screen edge (row padding below the tiles 20): a dot reaching that edge cannot be missed
// downwards, so it counts as tall enough without covering the tiles.
await check('Tablet: Seitenpunkte 44 breit, 44 hoch oder bis zum Bildschirmrand', tab.dots.every((x) => x.w >= 44 && (x.h >= 44 || x.edge)), fmt(tab.dots));
await check('Tablet: Seitenpunkte reichen nicht über die Kacheln', tab.dots.every((x) => !x.overTile), fmt(tab.dots));
if (tab.arrows.length) await check('Tablet: Raumleiste Weiter/Zurück mindestens 44 × 44', tab.arrows.every((x) => x.w >= 44 && x.h >= 44), fmt(tab.arrows));
else console.log('  info   Raumleiste ohne aktiven Pfeil');
await check('Tablet: Pfeile sichtbar weiter 30', tab.arrows.every((x) => x.vis[0] === 30), fmt(tab.arrows));

// Mouse: unchanged (dots 18 apart-ish, no larger targets).
const mouse = await measureTablet(false);
await check('Maus: Seitenpunkte bleiben klein (18 hoch)', mouse.dots.length < 2 || mouse.dots.every((x) => x.vis[1] === 18), fmt(mouse.dots));
await finish();
