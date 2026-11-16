// Interactions for dev/qa/leistung.mjs (Tempo „unter 100 ms“, 16.11.2026): each one reports
//   inhalt = from the tap (pointerdown/touchstart; swipe: touchend; started by code: the call) until the content is
//            there (checked once per frame, so the frame that paints it),
//   steht  = until the last re-render / DOM change before 500 ms of quiet (Lit updates and watched roots),
// plus renders, [[[ ]]] time and long tasks in that window. With prof the same interaction runs under the CDP
// profiler (Chromium) and returns the biggest self times by function and by file.
//
// Parts (leistung.mjs --teile …):
//   popups     every popup found on the test dashboards (one row per tile template that opens one)
//   raumtipp   desktop: room bar tap (casora-nav-bar); phone: „Räume“ in the bottom bar, then a room in its menu
//   wischen    phone: swipe to the next room (swipe_rooms switched on in the browser only)
//   glocke     the bell (notification centre)
//   chips      phone: the badge row's group chips (security, climate) open/close their sub row
//   schalter   a tile's switch and the light popup's head switch until the tile/switch shows the new state
//   schoner    screensaver started by hand (like the ⋯ menu) until it covers the page, and a tap back
//   studiotipp Studio (desktop): open from the dashboard, switch room, sections, a settings group, preview device
// Writes nothing into dashboards; screensaver and swipe settings are set in the browser only.

export function makeTippen({ BASE, DASH, PHONE, POPDASH, POPPHONE, SNAP, diff, H }) {
  const sleep = (page, ms) => page.waitForTimeout(ms);

  // ── Profile (CDP) ─────────────────────────────────────────────────────────
  function summarise(profile) {
    const byId = new Map(profile.nodes.map((n) => [n.id, n]));
    const parent = new Map(); for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
    // Native work (getComputedStyle, layout, innerHTML …) counted at the nearest script frame that called it.
    const owner = (n) => { let x = n; while (x && !x.callFrame.url) x = byId.get(parent.get(x.id)); return x || n; };
    const fn = new Map(), file = new Map(), jfn = new Map(), jfile = new Map(); let total = 0;
    const s = profile.samples, d = profile.timeDeltas;
    for (let i = 0; i < s.length; i++) {
      const n = byId.get(s[i]); const ms = (d[i + 1] || 0) / 1000; const cf = n.callFrame;
      if (/^\((idle|program|root)\)$/.test(cf.functionName)) continue;
      total += ms;
      const f = (cf.url || '').replace(/\?.*$/, '').split('/').pop() || (cf.functionName.startsWith('(') ? cf.functionName : '(nativ)');
      const k = `${cf.functionName || '(anonym)'} ${f}:${cf.lineNumber + 1}`;
      fn.set(k, (fn.get(k) || 0) + ms); file.set(f, (file.get(f) || 0) + ms);
      const ow = owner(n).callFrame; const of = (ow.url || '').replace(/\?.*$/, '').split('/').pop() || f;
      const ok = `${ow.functionName || '(anonym)'} ${of}:${ow.lineNumber + 1}`;
      jfn.set(ok, (jfn.get(ok) || 0) + ms); jfile.set(of, (jfile.get(of) || 0) + ms);
    }
    const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, +v.toFixed(1)]);
    return { aktivMs: +total.toFixed(1), funktionen: top(fn, 10), dateien: top(file, 8), mitNativ: top(jfn, 10), dateienMitNativ: top(jfile, 8) };
  }

  // ── Core: one interaction ─────────────────────────────────────────────────
  // act(): performs the input (or, started by code, sets __lp.down itself). ready: function body (L, arg) → true when
  // the content is there; it only runs once the input arrived. from: 'down' | 'up' (swipe ends on touchend).
  async function messen(o, { act, ready, arg = null, from = 'down', quietMs = 500, max = 8000, prof = false, before = null }) {
    const { page, cdp } = o;
    await page.evaluate((b) => { const L = window.__lp; L.down = null; L.up = null; L.bcHits = []; L.bcWatch = b ? new RegExp(b) : null; }, before);
    const s0 = await page.evaluate(SNAP);
    if (prof && cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
    const waiting = page.evaluate(async ({ src, arg, from, max }) => {
      const L = window.__lp; const ok = new Function('L', 'arg', src);
      const t0 = performance.now(); let start = null, hit = null;
      while (performance.now() - t0 < max + 4000) {
        await new Promise((r) => requestAnimationFrame(r));
        start = from === 'up' ? L.up : L.down;
        if (start == null) continue;
        let y = false; try { y = !!ok(L, arg); } catch (e) { /* not yet */ }
        if (y) { hit = performance.now(); break; }
        if (performance.now() - start > max) break;
      }
      return { start, hit };
    }, { src: ready, arg, from, max });
    waiting.catch(() => {});
    await act();
    const r = await waiting;
    if (r.start == null) { if (prof && cdp) await cdp.send('Profiler.stop').catch(() => {}); return { fehler: 'keine Eingabe' }; }
    const st = await page.evaluate(async ({ start, quietMs, max }) => {
      const L = window.__lp; const t0 = performance.now();
      const last = () => Math.max(L.lastRender, L.lastMut, start);
      let capped = true;
      while (performance.now() - t0 < max) { await new Promise((x) => setTimeout(x, 100)); if (performance.now() - last() >= quietMs) { capped = false; break; } }
      const lt = L.longtasks.filter((x) => x[0] + x[1] >= start - 2 && x[0] <= last());
      return { steht: last() - start, capped, longN: lt.length, longMs: lt.reduce((s, x) => s + x[1], 0), longMax: Math.max(0, ...lt.map((x) => x[1])) };
    }, { start: r.start, quietMs, max });
    let profil;
    if (prof && cdp) { const { profile } = await cdp.send('Profiler.stop'); profil = summarise(profile); }
    const s1 = await page.evaluate(SNAP);
    const d = diff(s0, s1);
    await page.evaluate(() => { window.__lp.bcWatch = null; window.__lp.bcHits = []; });
    const out = { inhalt: r.hit == null ? null : +(r.hit - r.start).toFixed(0), steht: +Math.max(st.steht, r.hit == null ? 0 : r.hit - r.start).toFixed(0), renders: d.n, bc: d.bc, renderMs: d.ms, evalMs: d.evalMs,
      longN: o.cdp ? st.longN : null, longMs: o.cdp ? st.longMs : null, longMax: o.cdp ? st.longMax : null };
    if (st.capped) out.unruhig = true;
    if (r.hit == null) out.fehler = 'Inhalt kam nicht';
    if (profil) out.profil = profil;
    return out;
  }

  const tap = async (page, at, touch) => { if (touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y); };
  // Single-page navigation like HA's navigate(), then wait for quiet.
  const spa = async (page, path) => {
    await page.evaluate((p) => { history.pushState(null, '', p); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }, path);
    await quietWait(page, 600, 12000);
  };
  const quietWait = (page, quietMs = 600, max = 12000) => quietWait1(page, quietMs, max).catch(async () => {
    // A redirect (casora-redirect.js, phone ↔ desktop) replaced the page: wait for the new one.
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForFunction(() => window.__lp && window._casoraLocalLoaded, null, { timeout: 60000 }).catch(() => {});
    await page.addScriptTag({ content: H.PIERCE }).catch(() => {});
    return quietWait1(page, quietMs, max).catch(() => {});
  });
  const quietWait1 = (page, quietMs, max) => page.evaluate(async ({ quietMs, max }) => {
    const L = window.__lp; const t0 = performance.now();
    while (performance.now() - t0 < max) { await new Promise((r) => setTimeout(r, 100)); if (performance.now() - Math.max(L.lastRender, L.lastMut) >= quietMs) break; }
  }, { quietMs, max });
  async function gotoFull(page, path) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.addScriptTag({ content: H.PIERCE }).catch(() => {});
    await page.waitForFunction(() => window.__lp && window._casoraLocalLoaded, null, { timeout: 90000 }).catch(() => {});
    await quietWait(page, 1000, 20000);
  }
  const curDash = (page) => page.evaluate(() => location.pathname.split('/')[1]);

  // ── Popups ────────────────────────────────────────────────────────────────
  const POPUP_READY = `const s = window.casoraPopup && window.casoraPopup.surface;
    if (s) { L.watch(s.getRootNode && s.getRootNode()); const c = s.querySelector('.content') || s; const r = c.getBoundingClientRect();
      return r.height > 60 && ((c.innerText || '').trim().length > 0 || r.height > 120); }
    const d = L.deep(document.querySelector('home-assistant') && document.querySelector('home-assistant').shadowRoot, 'ha-more-info-dialog, ha-adaptive-dialog');
    return !!d && L.vis(d, 80, 80);`;
  const popupOpen = (page) => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (s) return 'popup';
    const ha = document.querySelector('home-assistant'); const d = window.__lp.deep(ha && ha.shadowRoot, 'ha-more-info-dialog, ha-adaptive-dialog');
    return d && window.__lp.vis(d, 80, 80) ? 'ha-dialog' : null; });
  async function closePopup(page) {
    await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
    await page.keyboard.press('Escape').catch(() => {});
    for (let i = 0; i < 20 && await popupOpen(page); i++) await sleep(page, 100);
    await sleep(page, 350);
  }
  // Main template of a tile: the last casora_* that is not a building block.
  const MAIN = (tpl) => { const t = [].concat(tpl || []); const m = t.filter((x) => /^casora_/.test(x) && !/^casora_(entity|default|popup_base|badge_base|popup_variant)$/.test(x));
    const own = m.filter((x) => !/^casora_popup_/.test(x)); return own.length ? own[own.length - 1] : m[m.length - 1] || null; };
  const SKIP = /^casora_(room|time|menu_icon|settings_button|assist_button|notifications_button|now_playing.*|mobile_(?!filter).*|mobile_filter_badges|scene_row|solar_tip)$/;
  async function candidates(page) {
    return page.evaluate(({ MAINsrc, SKIPsrc }) => { const MAIN = eval(MAINsrc); const SKIP = new RegExp(SKIPsrc); const out = {};
      for (const b of window.__pierce('button-card')) { const m = MAIN((b._config || {}).template); if (!m || SKIP.test(m) || out[m]) continue;
        const r = b.getBoundingClientRect(); if (r.width < 20 || r.height < 20) continue; out[m] = 1; }
      return Object.keys(out); }, { MAINsrc: MAIN.toString(), SKIPsrc: SKIP.source });
  }
  // Find a tile by its main template, scroll it into view (also sideways rows); centre point or null.
  async function findMain(page, main, nth = 0) {
    return page.evaluate(({ main, nth, MAINsrc }) => { const MAIN = eval(MAINsrc);
      const all = window.__pierce('button-card').filter((x) => { if (MAIN((x._config || {}).template) !== main) return false; const r = x.getBoundingClientRect(); return r.width > 20 && r.height > 20; });
      const b = all[nth] || all[0]; if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' });
      for (let a = b, n = 0; a && n < 40; a = a.parentElement || (a.getRootNode() && a.getRootNode().host), n++) {
        if (a.scrollWidth > a.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(a).overflowX)) { const rr = b.getBoundingClientRect(), ar = a.getBoundingClientRect(); a.scrollLeft += (rr.x + rr.width / 2) - (ar.x + ar.width / 2); }
      }
      const r = b.getBoundingClientRect(); if (r.x < 0 || r.x + r.width > innerWidth || r.y < 0 || r.y + r.height > innerHeight) return null;
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, { main, nth, MAINsrc: MAIN.toString() });
  }
  // Places to look: desktop = views; phone = home + room filters.
  async function goPlace(o, place) {
    const { page } = o;
    if (await curDash(page) !== place.dash) await gotoFull(page, '/' + place.dash + '/' + (place.view || 'home'));
    if (place.filter !== undefined) {
      const cur = await page.evaluate(() => window._casoraFilter && window._casoraFilter.get());
      if (cur !== place.filter) { await page.evaluate((k) => window._casoraFilter.set(k), place.filter); await quietWait(page, 600, 8000); }
    } else if (place.view) {
      const p = '/' + place.dash + '/' + place.view;
      if (await page.evaluate(() => location.pathname) !== p) await spa(page, p);
    }
    await page.addScriptTag({ content: H.PIERCE }).catch(() => {});
  }
  async function placesFor(o, phone, cfgs) {
    const out = [];
    if (phone) {
      for (const d of [PHONE, POPPHONE].filter((x, i, a) => x && cfgs[x] && a.indexOf(x) === i)) {
        out.push({ dash: d, view: 'home', filter: 'all' });
        if (d === POPPHONE) for (const k of ['room_wohnzimmer', 'room_bro', 'room_flur', 'room_garten', 'room_waschkche', 'room_badezimmer']) out.push({ dash: d, view: 'home', filter: k });
      }
    } else {
      out.push({ dash: DASH, view: (cfgs[DASH].views[0].path || '0') });
      if (POPDASH && cfgs[POPDASH]) for (const v of cfgs[POPDASH].views) out.push({ dash: POPDASH, view: v.path });
    }
    return out;
  }
  // Discovery (once per device): which tile templates open a popup, and where.
  async function discover(o, phone, touch, cfgs) {
    const { page } = o; const found = {}; const tried = new Set();
    for (const place of await placesFor(o, phone, cfgs)) {
      await goPlace(o, place);
      for (const m of await candidates(page)) {
        if ((found[m] && found[m].art) || tried.has(m)) continue; tried.add(m);
        const at = await findMain(page, m); if (!at) { tried.delete(m); continue; }
        const path0 = await page.evaluate(() => location.pathname + location.search);
        await tap(page, at, touch);
        let kind = null; for (let i = 0; i < 20 && !kind; i++) { await sleep(page, 100); kind = await popupOpen(page); }
        const path1 = await page.evaluate(() => location.pathname + location.search);
        // No popup (opens a page, switches, expands a row, or does nothing here): listed with art null, not measured.
        found[m] = { ...place, art: kind || (path1 !== path0 ? 'seite:' + path1 : null) };
        await closePopup(page);
        if (path1 !== path0) { await gotoFull(page, path0); if (place.filter && place.filter !== 'all') await goPlace(o, place); }
        else await page.evaluate(() => window.__lp && document.activeElement && document.activeElement.blur && document.activeElement.blur());
      }
    }
    return found;
  }
  async function popups(o, { phone, touch, cfgs, katalog, prof }) {
    const out = {};
    const keys = Object.keys(katalog).filter((m) => katalog[m].art === 'popup' || katalog[m].art === 'ha-dialog').sort((a, b) => JSON.stringify([katalog[a].dash, katalog[a].view, katalog[a].filter]).localeCompare(JSON.stringify([katalog[b].dash, katalog[b].view, katalog[b].filter])));
    for (const m of keys) {
      await goPlace(o, katalog[m]);
      const at = await findMain(o.page, m); if (!at) { out[m] = { fehler: 'Kachel nicht gefunden' }; continue; }
      await sleep(o.page, 250);
      out[m] = await messen(o, { act: () => tap(o.page, at, touch), ready: POPUP_READY, prof });
      await closePopup(o.page);
    }
    return out;
  }

  // ── Room switch ───────────────────────────────────────────────────────────
  const OVERLAY = `const ov = (k) => { for (const r of window._casoraSmartRows || []) { const sr = r.shadowRoot; if (!sr) continue;
      for (const fo of sr.querySelectorAll('casora-filter-overlay')) if (fo._config && fo._config.filter_category === k && fo._showing && fo._overlayEl && L.vis(fo._overlayEl, 100, 150)) return fo; } return null; };`;
  const PHONE_ROOM_READY = OVERLAY + `if (!window._casoraFilter || window._casoraFilter.get() !== arg) return false; const fo = ov(arg); if (!fo) return false;
    L.watch(fo.shadowRoot || fo); const b = L.deep(fo._overlayEl, 'button-card'); return !!b && L.vis(b, 20, 20);`;
  async function raumtipp(o, { phone, touch, prof }) {
    const { page } = o; const out = {};
    if (!phone) {
      await goPlace(o, { dash: DASH, view: 'home' });
      for (const label of ['Badezimmer', 'Büro', 'Küche', 'Zuhause']) {
        const at = await page.evaluate((label) => { const nb = window.__lp.deep(document, 'casora-nav-bar'); if (!nb) return null;
          const b = [...nb.shadowRoot.querySelectorAll('button.route')].find((x) => x.textContent.trim() === label); if (!b) return null;
          const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, label);
        if (!at) { out['raum:' + label] = { fehler: 'Knopf fehlt' }; continue; }
        const p0 = await page.evaluate(() => location.pathname);
        out['raum:' + label] = await messen(o, { act: () => tap(page, at, touch), before: 'casora_room', arg: { p0, label },
          ready: `if (location.pathname === arg.p0) return false; return L.bcHits.some(([el]) => L.vis(el, 300, 100) && (arg.label === 'Zuhause' || (el.shadowRoot && el.shadowRoot.textContent || '').includes(arg.label)));`, prof });
      }
      return out;
    }
    await goPlace(o, { dash: POPPHONE || PHONE, view: 'home', filter: 'all' });
    for (const [key, label] of [['room_wohnzimmer', 'Wohnzimmer'], ['room_bro', 'Büro'], ['room_kche', 'Küche']]) {
      const bar = await page.evaluate(() => { const b = [...document.querySelectorAll('.hmn-bar .hmn-btn')].find((x) => /Räume|Rooms/.test(x.getAttribute('aria-label') || x.textContent)); if (!b) return null;
        const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (!bar) { out.raummenue = { fehler: 'Räume-Knopf fehlt' }; break; }
      const m = await messen(o, { act: () => tap(page, bar, touch), prof,
        ready: `const m = document.querySelector('.hmn-menu'); if (!m || !L.vis(m, 100, 100)) return false; L.watch(m); return (m.innerText || '').trim().length > 0;` });
      (out.raummenue = out.raummenue || []).push(m);
      const item = await page.evaluate((label) => { const m = document.querySelector('.hmn-menu'); if (!m) return null;
        const el = [...m.querySelectorAll('*')].filter((x) => x.children.length === 0 || x.localName === 'button').find((x) => (x.textContent || '').trim() === label);
        let t = el; while (t && t !== m && !(t.onclick || t.localName === 'button' || t.getAttribute('role') === 'button' || t.classList.contains('hmn-item'))) t = t.parentElement;
        const r = (t && t !== m ? t : el); if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, label);
      if (!item) { out['raum:' + key] = { fehler: 'Raum im Menü fehlt' }; await page.keyboard.press('Escape'); continue; }
      await sleep(page, 400);
      out['raum:' + key] = await messen(o, { act: () => tap(page, item, touch), arg: key, ready: PHONE_ROOM_READY, prof });
      await page.evaluate(() => window._casoraFilter.set('all')); await quietWait(page, 600, 8000);
    }
    // raummenue: median over the three opens
    return out;
  }

  // ── Swipe (phone) ─────────────────────────────────────────────────────────
  async function wischen(o, { prof }) {
    const { page, cdp } = o; const out = {};
    await goPlace(o, { dash: POPPHONE || PHONE, view: 'home', filter: 'all' });
    const keys = await page.evaluate(() => (window._hmnOwner && window._hmnOwner._rooms || []).filter(window.casoraSeesRoute || (() => true)).map((r) => r.key));
    if (keys.length < 3) return { wischen: { fehler: 'zu wenige Räume' } };
    await page.evaluate(() => { window._hmnOwner._cfg = Object.assign({}, window._hmnOwner._cfg, { swipe_rooms: true }); });
    const y = 520;
    if (!cdp && !(await page.evaluate(() => { try { return !!new Touch({ identifier: 1, target: document.body }); } catch (e) { return false; } }))) return { wischen: { fehler: 'WebKit am Mac: kein Touch(), nur Chromium' } };
    const swipe = async (x0, x1) => {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
        for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * i / 8, y: y + i * 0.5 }] }); await sleep(page, 16); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        // WebKit: no trusted touch input from Playwright, and no Touch constructor on the Mac: not measurable here.
        await page.evaluate(async ({ x0, x1, y }) => {
          let tgt = document.elementFromPoint(x0, y); while (tgt && tgt.shadowRoot && tgt.shadowRoot.elementFromPoint) { const i = tgt.shadowRoot.elementFromPoint(x0, y); if (!i || i === tgt) break; tgt = i; }
          const mk = (x) => new Touch({ identifier: 1, target: tgt, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
          const ev = (type, list) => tgt.dispatchEvent(new TouchEvent(type, { bubbles: true, composed: true, cancelable: true, touches: list, targetTouches: list, changedTouches: list.length ? list : [mk(x1)] }));
          ev('touchstart', [mk(x0)]);
          for (let i = 1; i <= 8; i++) { await new Promise((r) => setTimeout(r, 16)); ev('touchmove', [mk(x0 + (x1 - x0) * i / 8)]); }
          ev('touchend', []);
        }, { x0, x1, y });
      }
    };
    const res = [];
    for (let n = 0; n < 2; n++) {
      await page.evaluate((k) => window._casoraFilter.set(k), keys[1 + n]); await quietWait(page, 800, 8000);
      res.push(await messen(o, { act: () => swipe(330, 60), from: 'up', arg: keys[2 + n], ready: PHONE_ROOM_READY, prof }));
    }
    out.wischen = res;
    await page.evaluate(() => { window._hmnOwner._cfg = Object.assign({}, window._hmnOwner._cfg, { swipe_rooms: false }); window._casoraFilter.set('all'); });
    await quietWait(page, 600, 8000);
    return out;
  }

  // ── Bell ──────────────────────────────────────────────────────────────────
  async function glocke(o, { phone, touch, prof }) {
    const { page } = o;
    await goPlace(o, phone ? { dash: PHONE, view: 'home', filter: 'all' } : { dash: DASH, view: 'home' });
    const res = [];
    for (let n = 0; n < 2; n++) {
      const at = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_notifications_button') && x.getBoundingClientRect().width > 0);
        if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (!at) return { glocke: { fehler: 'Glocke fehlt' } };
      res.push(await messen(o, { act: () => tap(page, at, touch), prof,
        ready: `const m = document.querySelector('.casora-notify-menu'); if (!m || !L.vis(m, 100, 60)) return false; L.watch(m); return (m.innerText || '').trim().length > 0;` }));
      await page.keyboard.press('Escape').catch(() => {});
      for (let i = 0; i < 10 && await page.evaluate(() => !!document.querySelector('.casora-notify-menu')); i++) { if (i === 3) await tap(page, at, touch); await sleep(page, 150); }
      await sleep(page, 400);
    }
    return { glocke: res };
  }

  // ── Phone chips ───────────────────────────────────────────────────────────
  // The badge row on the phone's Home (casora_mobile_filter_badges): a group chip opens its popup or its sub row
  // (casora_mobile_sensor_chips), whichever the dashboard does; content = either is there.
  async function chips(o, { touch, prof }) {
    const { page } = o; const out = {};
    await goPlace(o, { dash: POPPHONE || PHONE, view: 'home', filter: 'all' });
    for (const g of ['security', 'climate', 'light', 'energy']) {
      const at = await page.evaluate((g) => { const fb = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_filter_badges'));
        const b = fb && window.__pierce('button-card', fb.shadowRoot).find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_' + g + '_group') && x.getBoundingClientRect().width > 0);
        const c = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_mobile_sensor_chips'));
        window.__ltChips = { c, h0: c ? Math.round(c.getBoundingClientRect().height) : 0 };
        if (!b) return null; b.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, g);
      if (!at) { out['chip:' + g] = { fehler: 'Chip fehlt' }; continue; }
      await sleep(page, 300);
      out['chip:' + g] = await messen(o, { act: () => tap(page, at, touch), prof,
        ready: `const pop = (() => { ${POPUP_READY} })(); if (pop) return true; const x = window.__ltChips; const c = x.c;
          if (!c || !L.vis(c, 100, 20) || Math.round(c.getBoundingClientRect().height) === x.h0) return false; L.watch(c.shadowRoot); return (c.shadowRoot.textContent || '').trim().length > 0;` });
      await sleep(page, 300);
      if (await popupOpen(page)) await closePopup(page);
      else { out['chip_zu:' + g] = await messen(o, { act: () => tap(page, at, touch), prof, ready: `const x = window.__ltChips; return !x.c || Math.round(x.c.getBoundingClientRect().height) <= x.h0;` }); }
      await sleep(page, 400);
    }
    return out;
  }

  // ── Switches ──────────────────────────────────────────────────────────────
  // Tile: the nested toggle button-card's drawing changes; HA's state arrives (stateMs) separately.
  const HASS = `const hs = () => { const ha = document.querySelector('home-assistant'); return ha && ha.hass && ha.hass.states; };`;
  async function schalter(o, { phone, touch, prof }) {
    const { page } = o; const out = {};
    if (!POPDASH) return out;
    await goPlace(o, phone ? { dash: POPPHONE, view: 'home', filter: 'room_wohnzimmer' } : { dash: POPDASH, view: 'wohnzimmer' });
    for (let n = 0; n < 2; n++) {
      const at = await page.evaluate(() => { const L = window.__lp;
        const t = window.__pierce('button-card').find((b) => { const tg = b.shadowRoot && b.shadowRoot.querySelector('#toggle'); return tg && L.vis(tg, 10, 10) && /^(fan|light|switch)\./.test((b._config || {}).entity || ''); })
          || window.__pierce('button-card').find((b) => { const tg = b.shadowRoot && b.shadowRoot.querySelector('#toggle'); if (!tg || getComputedStyle(tg).display === 'none') return false; const r = b.getBoundingClientRect(); return r.width > 20 && /^(fan|light|switch)\./.test((b._config || {}).entity || ''); });
        if (!t) return null;
        t.scrollIntoView({ block: 'center', inline: 'center' });
        for (let a = t, k = 0; a && k < 40; a = a.parentElement || (a.getRootNode() && a.getRootNode().host), k++) {
          if (a.scrollWidth > a.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(a).overflowX)) { const rr = t.getBoundingClientRect(), ar = a.getBoundingClientRect(); a.scrollLeft += (rr.x + rr.width / 2) - (ar.x + ar.width / 2); }
        }
        const tg = t.shadowRoot.querySelector('#toggle'); const inner = tg.querySelector('button-card') || L.deep(tg, 'button-card');
        const sig = () => (inner && inner.shadowRoot ? inner.shadowRoot.innerHTML : tg.innerHTML) + '|' + (t.shadowRoot.querySelector('ha-card') || {}).className;
        window.__ltSw = { t, sig, s0: sig(), eid: t._config.entity };
        const r = tg.getBoundingClientRect(); if (!r.width) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2, eid: t._config.entity }; });
      if (!at) { out.schalter_kachel = { fehler: 'kein Kachel-Schalter sichtbar' }; break; }
      await sleep(page, 600);
      await page.evaluate(() => { window.__ltSw.s0 = window.__ltSw.sig(); });
      const st0 = await page.evaluate((e) => document.querySelector('home-assistant').hass.states[e].state, at.eid);
      const r = await messen(o, { act: () => tap(page, at, touch), prof, ready: `return window.__ltSw.sig() !== window.__ltSw.s0;` });
      // When did HA's new state reach the page? (network + HA; the tile cannot be faster without optimistic drawing)
      r.stateMs = await page.evaluate(async ({ e, s0 }) => { const t0 = performance.now(); const down = window.__lp.down;
        while (performance.now() - t0 < 5000) { const s = document.querySelector('home-assistant').hass.states[e]; if (s && s.state !== s0) return +(performance.now() - down).toFixed(0); await new Promise((x) => setTimeout(x, 5)); }
        return -1; }, { e: at.eid, s0: st0 });
      (out.schalter_kachel = out.schalter_kachel || []).push(r);
      await sleep(page, 1200);
    }
    // HA state timing on its own: subscribe to state_changed in the page and compare with the tap.
    // Light popup head switch.
    const lt = await findMain(page, 'casora_light');
    if (lt) {
      await tap(page, lt, touch);
      for (let i = 0; i < 30 && !(await popupOpen(page)); i++) await sleep(page, 100);
      await sleep(page, 800);
      for (let n = 0; n < 2; n++) {
        const at = await page.evaluate(() => { const el = window.casoraPopup && window.casoraPopup.element; const sf = window.casoraPopup && window.casoraPopup.surface; const sw = (sf && sf.querySelector('button.header-switch')) || (el && (el.shadowRoot || el).querySelector('button.header-switch'));
          if (!sw) return null; window.__ltHs = { sw, s0: sw.outerHTML }; const r = sw.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
        if (!at) { out.schalter_popup = { fehler: 'Kopfschalter fehlt (Popup offen: ' + await popupOpen(page) + ')' }; break; }
        (out.schalter_popup = out.schalter_popup || []).push(await messen(o, { act: () => tap(page, at, touch), prof, ready: `return window.__ltHs.sw.outerHTML !== window.__ltHs.s0;` }));
        await sleep(page, 1200);
      }
      await closePopup(page);
    }
    return out;
  }

  // ── Screensaver ───────────────────────────────────────────────────────────
  async function schoner(o, { phone, touch, prof }) {
    const { page } = o; const out = {};
    const dash = phone ? PHONE : DASH;
    await gotoFull(page, '/' + dash + '/home?casora_saver=1');
    for (const kind of ['himmel', 'wetter', 'kalender']) {
      const ok = await page.evaluate((kind) => {
        const pl = window.__pierce('ha-panel-lovelace')[0]; if (!pl || !pl.lovelace) return false;
        const cfg = structuredClone(pl.lovelace.config);
        for (const v of cfg.views || []) { const h = (v.cards || [])[0] || ((v.sections || [])[0] || {}).cards && v.sections[0].cards[0]; if (h) { h.variables = Object.assign({}, h.variables, { casora_screensaver: '60', casora_screensaver_kind: kind }); } }
        pl._setLovelaceConfig(cfg, pl.lovelace.rawConfig, pl.lovelace.mode); return true; }, kind);
      if (!ok) return { schoner: { fehler: 'Konfiguration nicht gesetzt' } };
      await quietWait(page, 800, 10000);
      const can = await page.evaluate(() => !!(window._casoraSaver && window._casoraSaver.canStart && window._casoraSaver.canStart()));
      if (!can) { out['schoner:' + kind] = { fehler: 'canStart() = false' }; continue; }
      out['schoner:' + kind] = await messen(o, { prof, act: () => page.evaluate(() => { window.__lp.down = performance.now(); window._casoraSaver.start(); }),
        ready: `const l = document.querySelector('.cs-sv-layer'); const s = l && l.querySelector('.cs-sv'); if (!s || !L.vis(l, innerWidth - 4, innerHeight - 4)) return false; L.watch(l); return s.children.length > 0;` });
      await sleep(page, 600);
      out['schoner_zu:' + kind] = await messen(o, { prof, act: () => tap(page, { x: 200, y: 400 }, touch), ready: `const l = document.querySelector('.cs-sv-layer'); return !l || !L.vis(l, 50, 50);` });
      await sleep(page, 600);
    }
    return out;
  }

  // ── Studio (desktop) ──────────────────────────────────────────────────────
  const P = `const p = L.deep(document.querySelector('home-assistant') && document.querySelector('home-assistant').shadowRoot, 'casora-panel'); if (p && p.shadowRoot) L.watch(p.shadowRoot);`;
  async function studiotipp(o, { touch, prof }) {
    const { page } = o; const out = {};
    await page.evaluate((d) => localStorage.setItem('casora_panel_last_dashboard', d), DASH);
    await goPlace(o, { dash: DASH, view: 'home' });
    out.studio_oeffnen = await messen(o, { max: 20000, prof,
      act: () => page.evaluate(() => { window.__lp.down = performance.now(); history.pushState(null, '', '/casora-studio'); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }),
      ready: P + `if (!p || !p._state || !p._state.compact || !p._state.compact.rooms) return false; const n = p.shadowRoot.querySelector('.mini-name'); return !!n && L.vis(n, 10, 5) && p.shadowRoot.querySelectorAll('.mtile').length > 1;` });
    await quietWait(page, 1000, 15000);
    await page.addScriptTag({ content: H.PIERCE }).catch(() => {});
    const click = (sel, text) => page.evaluate(({ sel, text }) => { const p = window.__panel(); const b = [...p.shadowRoot.querySelectorAll(sel)].find((x) => !text || (x.textContent || '').trim() === text);
      if (!b) return null; b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, { sel, text });
    for (const label of ['Badezimmer', 'Küche', 'Wohnzimmer']) {
      const at = await click('.mini-tab', label); if (!at) { out['studio_raum:' + label] = { fehler: 'Reiter fehlt' }; continue; }
      out['studio_raum:' + label] = await messen(o, { act: () => tap(page, at, touch), arg: label, prof,
        ready: P + `const n = p.shadowRoot.querySelector('.mini-name'); return !!n && n.textContent.trim() === arg && L.vis(n, 10, 5);` });
      await sleep(page, 300);
    }
    // Sections in the top bar: Settings opens the hub; a group tile opens its page.
    let at = await click('button.btool', 'Einstellungen');
    if (at) {
      out['studio_bereich:Einstellungen'] = await messen(o, { act: () => tap(page, at, touch), prof, ready: P + `const g = p.shadowRoot.querySelector('.cs-hubgrid'); return !!g && L.vis(g, 100, 100);` });
      await sleep(page, 400);
      const tiles = await page.evaluate(() => [...window.__panel().shadowRoot.querySelectorAll('.cs-hubtile')].map((x) => x.dataset.tile).slice(0, 3));
      for (const t of tiles) {
        const a = await page.evaluate((t) => { const b = window.__panel().shadowRoot.querySelector('.cs-hubtile[data-tile="' + t + '"]'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, t);
        if (!a) continue;
        out['studio_gruppe:' + t] = await messen(o, { act: () => tap(page, a, touch), prof,
          ready: P + `const g = p.shadowRoot.querySelector('.cs-hubgrid'); if (g && L.vis(g, 100, 100)) return false; const b = p.shadowRoot.querySelector('[data-pkey^="nb-"]'); return !!b && L.vis(b, 50, 20);` });
        await sleep(page, 300);
        await page.evaluate(() => window.__panel()._csShow('n-start')); await quietWait(page, 500, 6000);
      }
    }
    for (const label of ['Inhalt', 'Raumaktionen']) {
      at = await click('button.btool', label); if (!at) continue;
      const sig0 = await page.evaluate(() => window.__panel().shadowRoot.innerHTML.length);
      out['studio_bereich:' + label] = await messen(o, { act: () => tap(page, at, touch), arg: sig0, prof,
        ready: P + `return p.shadowRoot.innerHTML.length !== arg;` });
      await sleep(page, 400);
    }
    // Preview device: Desktop → Handy → Desktop.
    for (const [size, label] of [['phone', 'Handy'], ['desktop', 'Desktop']]) {
      const a = await page.evaluate((size) => { const b = window.__panel().shadowRoot.querySelector('button.segopt[data-size="' + size + '"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, size);
      if (!a) continue;
      const w0 = await page.evaluate(() => { const n = window.__panel().shadowRoot.querySelector('.mini-fill'); return n ? Math.round(n.getBoundingClientRect().width) : -1; });
      out['studio_vorschau:' + label] = await messen(o, { act: () => tap(page, a, touch), arg: w0, prof,
        ready: P + `const n = p.shadowRoot.querySelector('.mini-fill'); if (!n || !L.vis(n, 5, 5)) return false; return Math.round(n.getBoundingClientRect().width) !== arg && (p.shadowRoot.querySelector('.mini-name') || {}).isConnected;` });
      await sleep(page, 400);
    }
    // Rebuild of the preview by code (what an edit triggers).
    out.studio_vorschauNeu = await messen(o, { prof, act: () => page.evaluate(() => { window.__lp.down = performance.now(); const p = window.__panel(); window.__ltRb = performance.now(); p._rebuildPreview(); window.__ltRb = performance.now() - window.__ltRb; }),
      ready: `return true;` });
    out.studio_vorschauNeu.syncMs = await page.evaluate(() => +window.__ltRb.toFixed(1));
    return out;
  }

  return { messen, discover, popups, raumtipp, wischen, glocke, chips, schalter, schoner, studiotipp, gotoFull };
}
