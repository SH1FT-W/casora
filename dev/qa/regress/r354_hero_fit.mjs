// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/layout-offsets.js
// Reported (26.10.2026, 8.7" tablet in a kiosk browser, 1340×800): on Home the weather line, the room title and
// the badge row sat so low that the badges touched the tiles, while photo space stayed empty above.
// Expected: only when it gets tight (badge row closer than 28 px to the tiles) the hero moves up and the title
// gets somewhat smaller; the badges then clear the tiles, the hero stays below the nav bar and the open Now
// Playing list, the title keeps at least 62 % of its size. Where it fits, the layout is exactly the unfitted one
// (same positions, same title size, nothing set on the card). Each case is measured fitted, then with the fit
// switched off (window.CASORA_QA_NO_HERO_FIT, the base behaviour), then fitted again (same result, no loop).
// The tablet's own geometry (hero ~110 px lower than in the test house) is rebuilt with --header-top-desktop
// on the room card.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => /"casora_room"/.test(JSON.stringify(d.config)));
await need('Casora dashboard with room card', dash);

const GAP = 28;

// Show Now Playing in the room header (the test house leaves it off) - only in this browser.
const nowPlaying = () => {
  const fix = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(fix); return; }
    const t = [].concat(o.template || []);
    if (o.variables && t.includes('casora_room')) o.variables.show_now_playing = true;
    for (const k in o) fix(o[k]);
  };
  const add = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function (t, fn, opt) {
    if (t !== 'message') return add.call(this, t, fn, opt);
    return add.call(this, t, function (ev) {
      if (typeof ev.data === 'string' && ev.data.includes('"views"') && ev.data.includes('"casora_room"')) {
        try { const d = JSON.parse(ev.data); fix(d); ev = new MessageEvent('message', { data: JSON.stringify(d) }); } catch (e) { /* unchanged */ }
      }
      return fn.call(this, ev);
    }, opt);
  };
  try { localStorage.removeItem('casora.np.hidden'); } catch (e) { /* ignore */ }
};

const measure = (pg) => pg.evaluate(() => {
  const host = window.__pierce('#badges_media').map((e) => e.getRootNode().host)
    .find((h) => h && h.shadowRoot.querySelector('#container').getBoundingClientRect().height > 0);
  if (!host) return null;
  const sr = host.shadowRoot;
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const areas = [...sr.querySelectorAll('#container > [id^="badges"]')].map(box).filter(Boolean);
  const badges = areas.length ? { l: Math.min(...areas.map((a) => a.l)), t: Math.min(...areas.map((a) => a.t)),
    r: Math.max(...areas.map((a) => a.r)), b: Math.max(...areas.map((a) => a.b)) } : null;
  // The visible badges themselves (for the overlap with the Now Playing list).
  const pills = [...sr.querySelectorAll('#container > [id^="badges"]')].flatMap((a) => window.__pierce('button-card', a))
    .map(box).filter((r) => r && r.b - r.t < 120);
  const tiles = window.__pierce('casora-smart-row').filter((r) => r._scrollMode === false)
    .flatMap((r) => (r._wrappers || []).map(box)).filter(Boolean);
  const nav = window.__pierce('casora-nav-bar').map((n) => n.shadowRoot && box(n.shadowRoot.querySelector('.bar'))).find(Boolean);
  const title = ['#name', '#n'].map((s) => sr.querySelector(s)).find((e) => box(e));
  const menu = [...document.querySelectorAll('body > .casora-welle-menu')].map(box).find(Boolean) || null;
  return {
    fit: host._casoraHeroFit || null,
    inline: ['--hero-top', '--hero-room-name-size-current'].map((p) => host.style.getPropertyValue(p)).filter(Boolean),
    temp: box(sr.querySelector('#temperature')), title: box(title), fs: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
    badges, pills, tilesTop: tiles.length ? Math.min(...tiles.map((t) => t.t)) : null, navBottom: nav ? nav.b : 0, menu,
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
const same = (a, b) => !!a === !!b && (!a || ['l', 't', 'r', 'b'].every((k) => Math.abs(a[k] - b[k]) <= 0.5));
const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

async function run(label, { width, height, touch = false, heroTop = null, media = false }) {
  const o = await open({ width, height, touch, scale: 1, dark: true, theme: 'Casora', welleAuto: media });
  await o.context.addInitScript(() => localStorage.setItem('dockedSidebar', '"always_hidden"'));
  if (media) await o.context.addInitScript(nowPlaying);
  const pg = o.page;
  await dashboard(pg, dash.url + '/' + ((dash.config.views || [])[0]?.path || '0'));
  if (media) {
    const ids = await pg.evaluate(() => {
      const h = window.__pierce('#badges_media').map((e) => e.getRootNode().host).find((x) => x && x._config);
      const v = (h && h._config.variables) || {};
      return Object.keys(v).filter((k) => /^media_player_\d+$/.test(k)).map((k) => v[k])
        .filter((x) => typeof x === 'string' && x.startsWith('media_player.'));
    });
    if (ids[0]) {
      await fakeStates(pg, { [ids[0]]: { state: 'playing', attributes: { media_title: 'QA episode with a rather long title',
        media_artist: 'QA', media_duration: 1800, media_position: 600, media_position_updated_at: new Date().toISOString(),
        media_content_type: 'music', supported_features: 4127295 } } }, { sticky: true });
    }
    await pg.waitForFunction(() => !!document.querySelector('body > .casora-welle-menu'), null, { timeout: 8000 }).catch(() => {});
  }
  if (heroTop) {
    await pg.evaluate((v) => window.__pierce('#badges_media').forEach((e) => e.getRootNode().host.style.setProperty('--header-top-desktop', v)), heroTop);
  }
  await settle(pg);
  const fitted = await measure(pg);
  await pg.evaluate(() => { window.CASORA_QA_NO_HERO_FIT = true; });
  await settle(pg);
  const base = await measure(pg);
  await pg.evaluate(() => { window.CASORA_QA_NO_HERO_FIT = false; });
  await settle(pg);
  const again = await measure(pg);
  await o.browser.close();

  if (!await check(`${label}: room header and tiles found`, fitted && base && fitted.badges && fitted.tilesTop != null,
    fitted && { badges: fitted.badges, tilesTop: fitted.tilesTop })) return null;
  const baseGap = Math.round(base.tilesTop - base.badges.b);
  const gap = Math.round(fitted.tilesTop - fitted.badges.b);
  await check(`${label}: fitted again gives the same layout (no loop)`,
    JSON.stringify({ ...fitted, menu: null }) === JSON.stringify({ ...again, menu: null }), { fitted: fitted.fit, again: again.fit });
  if (baseGap >= GAP) {
    await check(`${label}: fits as it is (gap ${baseGap} px) - nothing set on the card`, !fitted.fit && !fitted.inline.length, fitted.inline);
    await check(`${label}: weather, title and badges exactly where the base puts them`,
      same(fitted.temp, base.temp) && same(fitted.title, base.title) && same(fitted.badges, base.badges) && fitted.fs === base.fs,
      { fitted: [fitted.temp, fitted.title, fitted.badges, fitted.fs], base: [base.temp, base.title, base.badges, base.fs] });
  } else {
    await check(`${label}: badge row clears the tiles (${baseGap} → ${gap} px)`, gap >= GAP - 1, fitted.fit);
    await check(`${label}: hero moved up`, fitted.badges.t < base.badges.t && (!base.temp || fitted.temp.t < base.temp.t),
      { from: base.badges.t, to: fitted.badges.t });
    await check(`${label}: title somewhat smaller, not below 62 %`, fitted.fs <= base.fs && fitted.fs >= base.fs * 0.62 - 0.5,
      { from: base.fs, to: fitted.fs });
    const top = Math.min(...[fitted.temp, fitted.title, fitted.badges].filter(Boolean).map((r) => r.t));
    await check(`${label}: hero stays below the nav bar`, top >= fitted.navBottom + 19, { top, nav: fitted.navBottom });
  }
  if (media) {
    await check(`${label}: Now Playing list open`, !!fitted.menu);
    const parts = [fitted.temp, fitted.title, ...fitted.pills].filter(Boolean);
    await check(`${label}: Now Playing list does not cover the hero`, !parts.some((p) => hit(p, fitted.menu)), fitted.menu);
  }
  return { baseGap, gap, fit: fitted.fit };
}

// Tight: the 8.7" tablet in Chrome (528 high with the toolbar) and the reported kiosk geometry.
const tight1 = await run('Tablet 1006×528 (touch)', { width: 1006, height: 528, touch: true });
await check('1006×528 was tight before (test would catch the old layout)', tight1 && tight1.baseGap < GAP, tight1);
const tight2 = await run('Tablet like reported, 1340×800 + Now Playing', { width: 1340, height: 800, heroTop: '413px', media: true });
await check('reported geometry was tight before', tight2 && tight2.baseGap < GAP, tight2);
// Short screens that fit: unchanged, or fitted without overlap.
for (const [w, h, touch] of [[1340, 800, false], [1006, 600, true], [1280, 720, false], [1366, 768, false]]) {
  await run(`${w}×${h}${touch ? ' (touch)' : ''}`, { width: w, height: h, touch });
}
// Controls: must stay exactly as they are.
for (const [w, h, touch] of [[1440, 900, false], [1920, 1080, false], [1180, 820, true], [820, 1180, true]]) {
  const r = await run(`Control ${w}×${h}${touch ? ' (touch)' : ''}`, { width: w, height: h, touch });
  await check(`Control ${w}×${h}: not tight, nothing fitted`, r && r.baseGap >= GAP && !r.fit, r);
}

// Phone: no fit anywhere.
{
  const o = await open({ width: 393, height: 852, mobile: true, scale: 1, dark: true, theme: 'Casora' });
  await dashboard(o.page, (dash.phone ? dash.phone.url : dash.url), 3);
  await o.page.waitForTimeout(800);
  const set = await o.page.evaluate(() => window.__pierce('button-card')
    .filter((b) => b._casoraHeroFit || b.style.getPropertyValue('--hero-room-name-size-current')).length);
  await check('Phone 393×852: no hero fit', set === 0, set);
  await o.browser.close();
}
await finish();
