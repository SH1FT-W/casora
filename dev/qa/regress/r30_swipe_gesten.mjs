// @zustand: arbeit
// @parallel: allein   (legt qa-swipe(-mobile) als Kopie von qa-arbeit an und löscht sie am Ende)
// Gemeldet: Auf einer Swipe-Kachel (Stapel mit Punkten oben) ließ sich weder die Seite noch die
// Kachelreihe bewegen – die Swipe-Karte fing jede Geste.
// Erwartet (Chromium mit echter Touch-Eingabe, WebKit mit Touch-Ereignissen; Handy, Raum-Overlay,
// Tablet, Desktop mit Maus/Mausrad):
//  1. senkrecht: Seite bzw. Overlay scrollt, die Geste wird nie verhindert, Stapel bleibt
//  2. waagerecht: Stapel blättert (vor/zurück), Seite bleibt
//  3. Stapelende: am Anfang nach rechts / am Ende nach links scrollt die Kachelreihe; ohne Reihe
//     (Handy) bleibt die Karte stehen (kein Herumspringen ans andere Ende)
//  4. Punkt antippen springt zur Karte, Wischen auf der Punktleiste blättert
//  5. Tippen öffnet das Popup, nach einem Wisch öffnet sich keins
//  6. Maus-Ziehen und Mausrad/Trackpad seitwärts wie Touch; Mausrad senkrecht blättert nicht
// Messprotokoll (JSON) zusätzlich nach $CASORA_OUT/r30_swipe_gesten.json.
import fs from 'node:fs';
import { open, check, need, finish, usePage, BASE, atFinish, stable } from './lib.mjs';
import { ws } from '../ws.mjs';

const DASH = 'qa-swipe';
const log = [];

// ── Prüf-Dashboards: Kopie von qa-arbeit(-mobile), drei Kacheln je Reihe zu einem Stapel ──
const swipeOf = (cards) => ({ type: 'custom:casora-swipe-card', always_active: true, cards });
const tpl = (x) => [].concat(x.template || []);
const cp = (x) => JSON.parse(JSON.stringify(x));
const rowsIn = (o, out = []) => {
  if (Array.isArray(o)) o.forEach((x) => rowsIn(x, out));
  else if (o && typeof o === 'object') {
    if (o.type === 'custom:casora-smart-row') out.push(o);
    for (const k of Object.keys(o)) if (k !== 'variables') rowsIn(o[k], out);
  }
  return out;
};
const stack = (row) => {
  const i = row.cards.findIndex((x) => tpl(x).includes('casora_thermostat'));
  if (i < 0) return false;
  row.cards.splice(i, 3, swipeOf(row.cards.slice(i, i + 3)));
  return true;
};

const c = await ws();
let made = false;
async function cleanup() {
  if (!made || process.env.R28_KEEP) return;
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  for (const d of list.filter((x) => x.url_path === DASH || x.url_path === DASH + '-mobile')) {
    try { await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); } catch (e) { /* schon weg */ }
  }
  made = false;
}
atFinish(cleanup);  // auch wenn need() abbricht
let desk = null, mob = null;
try {
  desk = await c.cmd({ type: 'lovelace/config', url_path: 'qa-arbeit' });
  mob = await c.cmd({ type: 'lovelace/config', url_path: 'qa-arbeit-mobile' });
} catch (e) { /* need() unten */ }
await need('Dashboard qa-arbeit(-mobile) im Zustand arbeit', desk && mob);
const wz = (desk.views || []).find((v) => v.path === 'wohnzimmer');
const mrow = (mob.views[0].cards || []).find((x) => x.type === 'custom:casora-smart-row');
const after = (name) => mrow && mrow.cards[mrow.cards.findIndex((x) => tpl(x).includes('casora_mobile_header') && x.name === name) + 1];
const fav = after('Favorites'), buero = after('Büro'), schlaf = after('Schlafzimmer'), wzm = after('Wohnzimmer');
await need('Wohnzimmer/Büro/Schlafzimmer mit Thermostat in qa-arbeit', wz && fav && buero && schlaf && wzm);
// Desktop/Tablet: Stapel in der Mitte der Reihe (nicht vorn angeheftet), damit die Reihe an
// beiden Stapelenden in beide Richtungen scrollen kann.
{
  const r = rowsIn(wz)[0];
  await need('Desktop-Reihe Wohnzimmer gestapelt', stack(r));
  const i = r.cards.findIndex((x) => x.type === 'custom:casora-swipe-card');
  const [sw] = r.cards.splice(i, 1);
  delete sw.always_active;
  r.cards.splice(Math.min(3, r.cards.length), 0, sw);
}
// Handy: Stapel in den Favoriten (dazu genug Kacheln, dass die Seite scrollt) und im Wohnzimmer (Overlay).
const bi = buero.cards.findIndex((x) => tpl(x).includes('casora_thermostat'));
fav.cards.push(...cp(schlaf.cards), swipeOf(cp(buero.cards.slice(bi, bi + 3))), ...cp(schlaf.cards));
await need('Handy-Reihe Wohnzimmer gestapelt', stack(wzm));
wzm.cards.push(...cp(schlaf.cards), ...cp(schlaf.cards));
{
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  for (const [url, cfg, title] of [[DASH, desk, 'QA Swipe'], [DASH + '-mobile', mob, 'QA Swipe Handy']]) {
    if (!list.some((x) => x.url_path === url)) {
      await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
    }
    made = true;
    await c.cmd({ type: 'lovelace/config/save', url_path: url, config: cfg });
  }
}

// ── Im Browser ──
const PAGE_HELPERS = () => {
  const up = (e) => e.parentElement || (e.getRootNode() && e.getRootNode().host) || null;
  const inOverlay = (x) => { for (let e = x; e; e = up(e)) if (e.hasAttribute && e.hasAttribute('data-casora-filter-overlay')) return true; return false; };
  const deep = (x, y) => { let e = document.elementFromPoint(x, y); while (e && e.shadowRoot) { const i = e.shadowRoot.elementFromPoint(x, y); if (!i || i === e) break; e = i; } return e; };
  const hits = (s) => { const r = s.getBoundingClientRect(); for (let e = deep(r.x + r.width / 2, r.y + r.height / 2); e; e = up(e)) if (e === s) return true; return false; };
  window.__swPick = (overlay) => {
    window.__sw = window.__pierce('casora-swipe-card').find((s) => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && r.y > 60 && r.bottom <= innerHeight && (!overlay || inOverlay(s)) && hits(s);
    }) || null;
    // Raum-Overlay mit Kategorien (1.0.6): der Stapel liegt in seiner Gruppe (Klima) und damit
    // oft unter dem Bildrand – ins Bild scrollen, der nächste Durchlauf wählt ihn dann.
    if (!window.__sw && overlay) {
      const s = window.__pierce('casora-swipe-card').find((x) => x.getBoundingClientRect().width > 0 && inOverlay(x));
      if (s) s.scrollIntoView({ block: 'center' });
    }
    return !!window.__sw;
  };
  // Desktop/Tablet: Reihe so scrollen, dass der Stapel mittig liegt (Platz nach beiden Seiten).
  window.__swCenter = () => {
    const s = window.__pierce('casora-swipe-card').find((x) => x.getBoundingClientRect().width > 0);
    if (!s) return;
    for (let e = up(s); e; e = up(e)) {
      if (/auto|scroll/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth + 1 && e !== document.documentElement) {
        const r = s.getBoundingClientRect();
        e.style.scrollSnapType = 'none';
        const max = e.scrollWidth - e.clientWidth;
        e.scrollLeft = Math.max(Math.min(60, max / 3), Math.min(max - Math.min(60, max / 3), e.scrollLeft + r.x + r.width / 2 - innerWidth / 2));
        return;
      }
    }
  };
  window.__swState = () => {
    const s = window.__sw;
    const r = s.getBoundingClientRect();
    let row = null, vs = null;
    for (let e = up(s); e; e = up(e)) {
      const cs = getComputedStyle(e);
      if (!row && /auto|scroll/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1 && e !== document.documentElement) row = e;
      if (!vs && /auto|scroll/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 1) vs = e;
    }
    const dots = [...s.shadowRoot.querySelectorAll('.dot')].map((d) => { const b = d.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
    return {
      idx: s._index, n: (s._cards || []).length, x: r.x, y: r.y, w: r.width, h: r.height, dots,
      page: Math.round(document.scrollingElement.scrollTop), vscroll: vs ? Math.round(vs.scrollTop) : null,
      row: row ? Math.round(row.scrollLeft) : null, rowMax: row ? row.scrollWidth - row.clientWidth : null,
      pop: window.__pierce('casora-popup').some((p) => { const b = p.getBoundingClientRect(); return b.width > 0 && b.height > 0; }),
    };
  };
  // Wurde eine Touch-Bewegung verhindert? (Dokument-Listener läuft nach dem der Karte.)
  window.__dp = [];
  document.addEventListener('touchmove', (e) => window.__dp.push(e.defaultPrevented), { passive: true });
  // WebKit (Playwright kann dort nicht touch-ziehen): Touch-Ereignisse in der Seite auslösen.
  window.__synthDrag = async (x, y, dx, dy, steps) => {
    const tgt = deep(x, y);
    // WebKit am Mac kennt keinen Touch-Konstruktor: Ereignis mit nachgebauten touches-Listen.
    const mk = (cx, cy) => ({ identifier: 7, target: tgt, clientX: cx, clientY: cy, pageX: cx, pageY: cy, screenX: cx, screenY: cy });
    const fire = (type, t) => {
      const ev = new Event(type, { bubbles: true, composed: true, cancelable: true });
      const list = type === 'touchend' ? [] : [t];
      Object.defineProperty(ev, 'touches', { value: list });
      Object.defineProperty(ev, 'targetTouches', { value: list });
      Object.defineProperty(ev, 'changedTouches', { value: [t] });
      tgt.dispatchEvent(ev);
    };
    fire('touchstart', mk(x, y));
    for (let i = 1; i <= steps; i++) { fire('touchmove', mk(x + dx * i / steps, y + dy * i / steps)); await new Promise((r) => setTimeout(r, 16)); }
    fire('touchend', mk(x + dx, y + dy));
  };
};

async function session({ label, url, safari, device, overlay }) {
  if (process.env.R28_ONLY && !label.includes(process.env.R28_ONLY)) return;
  const opts = device === 'phone' ? { width: 390, height: 844, mobile: true }
    : device === 'tablet' ? { width: 1180, height: 820, touch: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
      : { width: 1280, height: 800 };
  const { page, browser, context } = await open({ ...opts, safari });
  // HA-Seitenleiste ausblenden: sie deckt sonst am Tablet die nach links gescrollte Kachel ab.
  await context.addInitScript(() => localStorage.setItem('dockedSidebar', JSON.stringify('always_hidden')));
  usePage(page);
  const cdp = safari ? null : await page.context().newCDPSession(page);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  const { PIERCE } = await import('../../e2e/harness.mjs');
  await page.addScriptTag({ content: PIERCE });
  await page.waitForFunction(() => window.__pierce('casora-swipe-card').some((s) => s.getBoundingClientRect().width > 0), null, { timeout: 60000 });
  // Bis die Swipe-Kacheln stehen (Lage + Zahl), statt fest 3 s.
  await stable(page, () => window.__pierce('casora-swipe-card').map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width)]; }), null, { max: 5000, quiet: 900 });
  await page.evaluate(PAGE_HELPERS);
  const filter = (f) => page.evaluate((v) => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: v } })), f);
  const pick = (ms) => page.waitForFunction((o) => window.__swPick(o), overlay, { timeout: ms }).then(() => true, () => false);
  let picked = false;
  if (overlay) {
    // Das Raum-Overlay baut sich gelegentlich erst beim zweiten Öffnen auf – dann zu und wieder auf.
    for (let k = 0; k < 5 && !picked; k++) {
      if (k) { await filter('all'); await page.waitForTimeout(1500); }
      await filter('room_wohnzimmer');
      picked = await pick(8000);
    }
    await page.waitForTimeout(1500);
  }
  if (device !== 'phone') { await page.evaluate(() => window.__swCenter()); await page.waitForTimeout(600); }
  // Kein automatisches Weiterblättern während der Messung.
  await page.evaluate(() => window.__pierce('casora-swipe-card').forEach((s) => { clearInterval(s._autoTimer); s._config = { ...s._config, auto_swipe_interval: 0 }; }));
  picked = await pick(15000);
  if (!(await check(`${label}: Swipe-Kachel sichtbar`, picked))) { await browser.close(); return; }
  const st = () => page.evaluate(() => window.__swState());

  const touchDrag = async (x, y, dx, dy, steps = 12) => {
    await page.evaluate(() => { window.__dp = []; });
    if (safari) { await page.evaluate(([a, b, c2, d, e]) => window.__synthDrag(a, b, c2, d, e), [x, y, dx, dy, steps]); }
    else {
      const tp = (px, py) => [{ x: px, y: py, id: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(x, y) });
      for (let i = 1; i <= steps; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x + dx * i / steps, y + dy * i / steps) });
        await page.waitForTimeout(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.waitForTimeout(900);
    return page.evaluate(() => window.__dp.some(Boolean));
  };
  const tap = async (x, y) => {
    if (safari) await page.touchscreen.tap(x, y);
    else {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2 }] });
      await page.waitForTimeout(40);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await page.waitForTimeout(1200);
  };
  const mouseDrag = async (x, y, dx, dy) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(900);
  };
  const wheel = async (x, y, dx, dy, n = 4) => {
    await page.mouse.move(x, y);
    for (let i = 0; i < n; i++) { await page.mouse.wheel(dx / n, dy / n); await page.waitForTimeout(16); }
    await page.waitForTimeout(500);
  };
  const L = (s) => s.x + s.w * 0.85, R = (s) => s.x + s.w * 0.15, M = (s) => s.y + s.h * 0.6;
  // Ein Fall: Geste ausführen, vorher/nachher messen, Erwartung prüfen.
  const fall = async (name, gesture, expect) => {
    const a = await st();
    const prevented = await gesture(a);
    const b = await st();
    const row = { gerät: label, fall: name, idx: `${a.idx}→${b.idx}`, seite: `${a.page}→${b.page}`,
      overlay: a.vscroll === null ? '–' : `${a.vscroll}→${b.vscroll}`, reihe: a.row === null ? '–' : `${a.row}→${b.row}`,
      popup: b.pop, verhindert: prevented === undefined ? '–' : prevented };
    log.push(row);
    const why = expect(a, b, prevented);
    await check(`${label}: ${name}`, why === true, why === true ? undefined : `${why} ${JSON.stringify(row)}`);
    return b;
  };
  const same = (u, v) => Math.abs((u || 0) - (v || 0)) <= 2;

  if (device !== 'desktop') {
    await fall('senkrecht → Seite/Overlay', (s) => touchDrag(s.x + s.w / 2, s.y + s.h / 2, 0, -160), (a, b, p) => {
      if (p) return 'senkrechte Bewegung verhindert';
      if (b.idx !== a.idx) return 'Stapel hat geblättert';
      if (!safari && device !== 'tablet') {
        const moved = overlay ? (b.vscroll || 0) - (a.vscroll || 0) : b.page - a.page;
        if (moved < 50) return 'Seite/Overlay hat nicht gescrollt';
      }
      if (b.pop) return 'Popup offen';
      return true;
    });
    // Zurückscrollen, damit die Kachel für die nächsten Fälle wieder frei liegt.
    { const s = await st(); await touchDrag(s.x + s.w / 2, Math.max(s.y + s.h / 2, 140), 0, 160); }
    // Unter Last (paralleles Gate 07.10.2026) wertete Chromium dieses Zurückziehen selten als Tippen
    // und öffnete das Thermostat-Popup – alle weiteren Fälle scheiterten dann am offenen Popup.
    // Das Zurückziehen ist nur Vorbereitung: ein dabei offenes Popup schließen und vermerken.
    if ((await st()).pop) {
      console.log(`  info   ${label}: Popup nach dem Zurückziehen offen – geschlossen`);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__swState().pop, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    await fall('links → nächste Karte', (s) => touchDrag(L(s), M(s), -s.w * 0.6, 3), (a, b, p) =>
      b.idx === a.idx + 1 && same(a.page, b.page) && same(a.row, b.row) && !b.pop ? true : 'kein Weiterblättern / Seite oder Reihe bewegt / Popup');
    await fall('rechts → vorige Karte', (s) => touchDrag(R(s), M(s), s.w * 0.6, 3), (a, b) =>
      b.idx === a.idx - 1 && same(a.row, b.row) && !b.pop ? true : 'kein Zurückblättern');
    if (device === 'tablet') {
      // Bis ans Ende blättern, dann übernimmt die Reihe.
      for (let k = 0; k < 4 && (await st()).idx < (await st()).n - 1; k++) { const s = await st(); await touchDrag(L(s), M(s), -s.w * 0.6, 3); }
      await fall('links am Stapelende → Reihe', (s) => touchDrag(L(s), M(s), -s.w * 0.7, 3), (a, b) =>
        a.idx === a.n - 1 && b.idx === a.idx && b.row - a.row > 40 && !b.pop ? true : 'Reihe hat nicht übernommen');
      for (let k = 0; k < 4 && (await st()).idx > 0; k++) { const s = await st(); await touchDrag(R(s), M(s), s.w * 0.6, 3); }
      await fall('rechts am Stapelanfang → Reihe', (s) => touchDrag(R(s), M(s), s.w * 0.7, 3), (a, b) =>
        a.idx === 0 && b.idx === 0 && a.row - b.row > 40 && !b.pop ? true : 'Reihe hat nicht übernommen');
    } else {
      await fall('rechts am Stapelanfang (keine Reihe) → bleibt', (s) => touchDrag(R(s), M(s), s.w * 0.6, 3), (a, b) =>
        a.idx === 0 && b.idx === 0 && !b.pop ? true : 'Karte gesprungen');
    }
    if (!overlay) {
      await fall('Punkt 3 antippen', (s) => tap(s.dots[2][0], s.dots[2][1]), (a, b) => b.idx === 2 && !b.pop ? true : 'nicht zur 3. Karte');
      await fall('Wischen auf der Punktleiste', (s) => touchDrag(s.dots[2][0], s.dots[2][1], s.w * 0.6, 2), (a, b) =>
        b.idx === 1 && !b.pop ? true : 'Punktleiste blättert nicht');
      await fall('Kachel antippen → Popup', async (s) => { await tap(s.x + s.w * 0.7, s.y + s.h * 0.65); await page.waitForFunction(() => window.__swState().pop, null, { timeout: 4000 }).catch(() => {}); }, (a, b) => b.pop ? true : 'kein Popup');
    }
  } else {
    await fall('Maus ziehen links → nächste Karte', (s) => mouseDrag(L(s), M(s), -s.w * 0.6, 4), (a, b) =>
      b.idx === a.idx + 1 && same(a.row, b.row) && !b.pop ? true : 'kein Weiterblättern / Reihe zog mit / Popup');
    await fall('Maus ziehen links → nächste Karte (Ende)', (s) => mouseDrag(L(s), M(s), -s.w * 0.6, 4), (a, b) =>
      b.idx === a.idx + 1 && same(a.row, b.row) && !b.pop ? true : 'kein Weiterblättern');
    await fall('Maus ziehen links am Stapelende → Reihe', (s) => mouseDrag(L(s), M(s), -s.w * 0.7, 4), (a, b) =>
      a.idx === a.n - 1 && b.idx === a.idx && b.row - a.row > 40 && !b.pop ? true : 'Reihe hat nicht übernommen');
    await fall('Trackpad seitwärts zurück → vorige Karte', (s) => wheel(s.x + s.w / 2, M(s), -120, 0), (a, b) =>
      b.idx === a.idx - 1 && same(a.row, b.row) ? true : 'kein Zurückblättern per Rad');
    await page.waitForTimeout(300);
    await fall('Trackpad seitwärts zurück → erste Karte', (s) => wheel(s.x + s.w / 2, M(s), -120, 0), (a, b) =>
      b.idx === 0 ? true : 'kein Zurückblättern per Rad');
    await page.waitForTimeout(300);
    await fall('Trackpad seitwärts am Stapelanfang → Reihe', (s) => wheel(s.x + s.w / 2, M(s), -200, 0), (a, b) =>
      b.idx === 0 && a.row - b.row > 40 ? true : 'Reihe scrollt nicht per Rad');
    await fall('Mausrad senkrecht → blättert nicht', (s) => wheel(s.x + s.w / 2, M(s), 0, 200), (a, b) =>
      b.idx === a.idx && !b.pop ? true : 'Stapel hat per senkrechtem Rad geblättert');
    await fall('Maus senkrecht ziehen → kein Popup', (s) => mouseDrag(s.x + s.w / 2, s.y + s.h * 0.3, 0, 40), (a, b) =>
      b.idx === a.idx && !b.pop ? true : 'geblättert oder Popup');
    await fall('Punkt 3 klicken', async (s) => { await page.mouse.click(s.dots[2][0], s.dots[2][1]); await page.waitForTimeout(900); }, (a, b) =>
      b.idx === 2 && !b.pop ? true : 'nicht zur 3. Karte');
    // Auf das Popup warten statt fest 1,2 s – unter Last brauchte es im Gate länger (07.10.2026).
    await fall('Kachel klicken → Popup', async (s) => { await page.mouse.click(s.x + s.w * 0.7, s.y + s.h * 0.65); await page.waitForFunction(() => window.__swState().pop, null, { timeout: 5000 }).catch(() => {}); }, (a, b) =>
      b.pop ? true : 'kein Popup');
  }
  await browser.close();
}

try {
  for (const safari of [false, true]) {
    const b = safari ? 'WebKit' : 'Chromium';
    await session({ label: `${b} Handy`, url: `/${DASH}-mobile/home`, safari, device: 'phone' });
    await session({ label: `${b} Raum-Overlay`, url: `/${DASH}-mobile/home`, safari, device: 'phone', overlay: true });
    await session({ label: `${b} Tablet`, url: `/${DASH}/wohnzimmer`, safari, device: 'tablet' });
    await session({ label: `${b} Desktop`, url: `/${DASH}/wohnzimmer`, safari, device: 'desktop' });
  }
} catch (e) {
  await check('Abbruch', false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
} finally {
  await cleanup();
  c.close();
  try { fs.writeFileSync((process.env.CASORA_OUT || '/tmp/casora-qa') + '/r30_swipe_gesten.json', JSON.stringify(log, null, 1)); } catch (e) { /* egal */ }
}
await finish();
