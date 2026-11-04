// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/layout-offsets.js#fitHero,evenHero,heroSpan
// Reported (issue 123, 04.11.2026, 1280×800 kiosk browser): the hero fits, but a tall band of empty photo
// sits between the nav bar and the weather line, while the badges are close to the tiles.
// Expected: on short landscape screens (height below 880, e.g. 1280×800, 1280×720, 1024×768, 1180×820) the
// band above the hero shrinks by about a third, at most by half, but never below 0.8 × the gap between badges
// and tiles (where that gap is already tall, as on the 1180×820 iPad, it moves only a little); the hero keeps its inner spacing and title size, the badge row
// never gets closer to the tiles than before (and at least 28 px, also with a sub-row open), and the hero stays
// at least 20 px below the nav bar. Taller screens (1440×900, 1920×1080) and phones stay exactly as before.
// Each case is measured fitted, then with the fit switched off (window.CASORA_QA_NO_HERO_FIT, the theme layout).
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"casora_room"/.test(JSON.stringify(d.config)));
await need('Casora dashboard with room card', dash);

const GAP = 28;

const measure = (pg) => pg.evaluate(() => {
  const host = window.__pierce('#badges_media').map((e) => e.getRootNode().host)
    .find((h) => h && h.shadowRoot.querySelector('#container').getBoundingClientRect().height > 0);
  if (!host) return null;
  const sr = host.shadowRoot;
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { t: r.top, b: r.bottom } : null; };
  const areas = [...sr.querySelectorAll('#container > [id^="badges"]')].map(box).filter(Boolean);
  const tiles = window.__pierce('casora-smart-row').filter((r) => r._scrollMode === false)
    .flatMap((r) => (r._wrappers || []).map(box)).filter(Boolean);
  const nav = window.__pierce('casora-nav-bar').map((n) => n.shadowRoot && box(n.shadowRoot.querySelector('.bar'))).find(Boolean);
  const title = ['#name', '#n'].map((s) => sr.querySelector(s)).find((e) => box(e));
  const temp = box(sr.querySelector('#temperature'));
  if (!areas.length || !tiles.length || !title) return null;
  const t = box(title);
  const badgesTop = Math.min(...areas.map((a) => a.t)), badgesBottom = Math.max(...areas.map((a) => a.b));
  const heroTop = Math.min(t.t, badgesTop, temp ? temp.t : Infinity);
  return {
    fit: host._casoraHeroFit || null, navBottom: nav ? nav.b : 0, heroTop, titleTop: t.t, titleBottom: t.b,
    tempTop: temp ? temp.t : null, badgesTop, badgesBottom, fs: parseFloat(getComputedStyle(title).fontSize),
    tilesTop: Math.min(...tiles.map((x) => x.t)),
  };
});

const settle = async (pg) => {
  await pg.evaluate(() => window.dispatchEvent(new Event('resize')));
  let last = '';
  for (let i = 0; i < 20; i++) {
    await pg.waitForTimeout(150);
    const k = JSON.stringify(await measure(pg));
    if (k === last) return;
    last = k;
  }
};

async function both(pg) {
  await settle(pg);
  const fitted = await measure(pg);
  await pg.evaluate(() => { window.CASORA_QA_NO_HERO_FIT = true; });
  await settle(pg);
  const base = await measure(pg);
  await pg.evaluate(() => { window.CASORA_QA_NO_HERO_FIT = false; });
  await settle(pg);
  return { fitted, base };
}

async function page(width, height, touch) {
  const o = await open({ width, height, touch, scale: 1, dark: true, theme: 'Casora' });
  await o.context.addInitScript(() => localStorage.setItem('dockedSidebar', '"always_hidden"'));
  await dashboard(o.page, dash.url + '/' + ((dash.config.views || [])[0]?.path || '0'));
  return o;
}

const r = Math.round;
const gaps = (m) => m && { above: r(m.heroTop - m.navBottom), below: r(m.tilesTop - m.badgesBottom) };

// Short landscape screens: band above the hero shrinks, the rest stays calm.
for (const [w, h, touch] of [[1280, 800, false], [1280, 720, false], [1024, 768, false], [1180, 820, true]]) {
  const label = `${w}×${h}${touch ? ' (touch)' : ''}`;
  const o = await page(w, h, touch);
  const { fitted, base } = await both(o.page);
  let opened = null;
  if (w === 1280 && h === 800) {
    await fakeStates(o.page, { 'input_select.casora_expanded_row': { state: 'lights' } }, { sticky: true });
    opened = await both(o.page);
    await fakeStates(o.page, { 'input_select.casora_expanded_row': { state: 'none' } }, { sticky: true });
  }
  await o.browser.close();
  if (!await check(`${label}: room header and tiles found`, fitted && base, { fitted, base })) continue;
  const f = gaps(fitted), b = gaps(base);
  console.log(`         ${label}: above ${b.above} → ${f.above} px, badges→tiles ${b.below} → ${f.below} px`);
  const balanced = Math.abs(f.above - 0.8 * f.below) <= 2;
  await check(`${label}: band under the nav bar smaller (${b.above} → ${f.above} px): 25-50 %, or down to 0.8 × badges→tiles`,
    f.above <= b.above - 5 && f.above >= b.above * 0.5 - 1 && (f.above <= b.above * 0.75 + 1 || balanced), { f, b, fit: fitted.fit });
  await check(`${label}: band not squeezed below 0.8 × the badges-to-tiles gap`, f.above >= 0.8 * f.below - 2, f);
  if (b.below <= 0.45 * b.above) await check(`${label}: badges close to the tiles - band about a third smaller`, f.above <= b.above * 0.7 + 1, { f, b });
  await check(`${label}: hero stays at least 20 px below the nav bar`, f.above >= 19, f);
  await check(`${label}: badges not closer to the tiles than before, at least ${GAP} px`, f.below >= b.below - 1 && f.below >= GAP - 1, { f, b });
  await check(`${label}: title size and hero spacing unchanged`, fitted.fs === base.fs
    && Math.abs((fitted.titleTop - fitted.heroTop) - (base.titleTop - base.heroTop)) <= 1
    && Math.abs((fitted.badgesTop - fitted.titleBottom) - (base.badgesTop - base.titleBottom)) <= 1,
  { fitted: [fitted.fs, fitted.titleTop - fitted.heroTop, fitted.badgesTop - fitted.titleBottom], base: [base.fs, base.titleTop - base.heroTop, base.badgesTop - base.titleBottom] });
  if (opened) {
    const of = gaps(opened.fitted), ob = gaps(opened.base);
    console.log(`         ${label}, sub-row open: above ${ob && ob.above} → ${of && of.above} px, badges→tiles ${ob && ob.below} → ${of && of.below} px`);
    await check(`${label}, sub-row open: lower row clears the tiles (${of && of.below} px), hero below the nav bar`,
      of && of.below >= GAP - 1 && of.above >= 19 && opened.fitted.badgesBottom - opened.fitted.badgesTop > 80, { of, ob });
  }
}

// Taller screens: exactly the theme's layout (±2 px against what the previous release drew there).
for (const [w, h] of [[1440, 900], [1920, 1080]]) {
  const o = await page(w, h, false);
  const { fitted, base } = await both(o.page);
  await o.browser.close();
  if (!await check(`${w}×${h}: room header and tiles found`, fitted && base)) continue;
  const f = gaps(fitted), b = gaps(base);
  console.log(`         ${w}×${h}: above ${f.above} px, badges→tiles ${f.below} px`);
  await check(`${w}×${h}: unchanged, nothing set on the card`, !fitted.fit
    && Math.abs(f.above - b.above) <= 2 && Math.abs(f.below - b.below) <= 2 && fitted.fs === base.fs, { f, b, fit: fitted.fit });
}

// Phones: no move, portrait or landscape.
for (const [w, h] of [[393, 852], [852, 393]]) {
  const o = await open({ width: w, height: h, mobile: true, scale: 1, dark: true, theme: 'Casora' });
  await dashboard(o.page, (dash.phone ? dash.phone.url : dash.url), 3);
  await o.page.waitForTimeout(800);
  const set = await o.page.evaluate(() => window.__pierce('button-card')
    .filter((x) => x._casoraHeroFit && x._casoraHeroFit.even).length);
  await check(`Phone ${w}×${h}: hero not moved`, set === 0, set);
  await o.browser.close();
}
await finish();
