// @zustand: arbeit
// @parallel: ui
// Owner wish (01.11.2026, desktop, media popup with music playing): the progress bar had no knob and could not be
// moved; the play button was purple while the dial's ring and the bar were pink.
// Expected (Casora look): a player with SEEK and a duration gets a knob on the bar; dragging (mouse) or a click on
// the bar calls media_player.media_seek with seek_position, the time label shows the target while dragging and the
// bar stays at the target (no jump back) until HA reports it; keys move it ±5 s. On the phone (WebKit, touch) a drag
// along the bar and a tap seek, a vertical swipe over the bar does not. Without SEEK: no knob, no slider. Ring, bar
// fill and play button share one colour taken from the cover. The player is faked in the browser, service calls are
// only recorded.
import { open, usePage, dashboard, casoraDashboards, fakeStates, check, need, finish, shot } from './lib.mjs';

const all = await casoraDashboards();
const hasTile = (v) => /"template":"casora_media"|"template":\["casora_media"/.test(JSON.stringify(v));
const DUR = 129;

const spy = (page) => page.evaluate(() => {
  const conn = document.querySelector('home-assistant').hass.connection;
  window.__qaCalls = [];
  const orig = conn.sendMessagePromise.bind(conn);
  conn.sendMessagePromise = (m) => {
    if (m && m.type === 'call_service' && m.domain === 'media_player') { window.__qaCalls.push({ s: m.service, d: m.service_data || {} }); return Promise.resolve({ context: { id: 'qa' } }); }
    return orig(m);
  };
});
// A purple cover (the owner's case: the play button took it, ring and bar did not).
const cover = (pg) => pg.evaluate(() => { const c = document.createElement('canvas'); c.width = 120; c.height = 120; const x = c.getContext('2d');
  x.fillStyle = '#6a3fb5'; x.fillRect(0, 0, 120, 120); x.fillStyle = '#4b2a8a'; x.fillRect(30, 30, 60, 60); return c.toDataURL('image/png'); });

async function setup(mobile, safari) {
  const d = all.find((x) => !!x.mobile === mobile && (x.config.views || []).some(hasTile));
  await need((mobile ? 'phone' : 'desktop') + ' dashboard with a media tile', d, all.map((x) => x.url));
  const opts = mobile ? { width: 390, height: 844, mobile: true, safari, dark: false, theme: 'Casora' }
    : { width: 1280, height: 900, safari, dark: false, theme: 'Casora' };
  const { page } = await open(opts);
  usePage(page);
  const views = d.config.views.map((v, i) => [v, v.path || String(i)]);
  const mv = views.find(([v]) => hasTile(v)) || views[0];
  await dashboard(page, d.url + '/' + mv[1], 3);
  if (mobile) await page.evaluate(() => window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_filter: 'media' } })));
  await page.waitForTimeout(1500);
  const ent = await page.evaluate(() => {
    const h = document.querySelector('home-assistant').hass;
    const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_media')
      && x.getBoundingClientRect().width > 50 && /^media_player\./.test(x._config.entity || '') && h.states[x._config.entity]);
    return b ? b._config.entity : null;
  });
  await need('media tile', ent, ent);
  return { page, ent };
}
const attrsFor = async (page, extra) => ({ volume_level: 0.35, supported_features: 448439, entity_picture: await cover(page), entity_picture_local: null,
  media_content_type: 'music', device_class: 'speaker', media_title: 'Example title', media_artist: 'Example', media_duration: DUR, media_position: 11,
  media_position_updated_at: new Date().toISOString(), ...(extra || {}) });
async function openPopup(page, ent, mobile) {
  // The tile can sit on the second page of the room's tile row (qa-arbeit: HomePod in Badezimmer): scroll it into
  // view, wait until the row stopped moving, measure again and tap; retry until the popup shows its bar (a tap on the
  // still scrolling row went beside the tile in the gate).
  // Only the media tile itself: with input_select.casora_expanded_row on „media“ (the gate's base state) another
  // button-card of the same player exists outside the tile row, and the tap went there.
  const where = () => page.evaluate((id) => { const b = window.__pierce('button-card').find((x) => x._config && x._config.entity === id
    && [].concat(x._config.template || []).includes('casora_media') && x.getBoundingClientRect().width > 50);
    if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, in: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; }, ent);
  const hasBar = () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; return !!s && window.__pierce('.hm-prog', s).some((x) => x.getBoundingClientRect().width > 0); }).catch(() => false);
  const isOpen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  for (let t = 0; t < 4 && !(await hasBar()); t++) {
    if (!(await isOpen())) {
      let pos = await where(), last = null;
      for (let w = 0; w < 20 && pos && !(last && pos.in && Math.abs(pos.x - last.x) < 1 && Math.abs(pos.y - last.y) < 1); w++) {
        await page.waitForTimeout(150); last = pos; pos = await where();
      }
      if (!pos) break;
      if (mobile) await page.touchscreen.tap(pos.x, pos.y); else await page.mouse.click(pos.x, pos.y);
    }
    await page.waitForFunction(() => { const s = window.casoraPopup && window.casoraPopup.surface; return s && window.__pierce('.hm-prog', s).some((x) => x.getBoundingClientRect().width > 0); }, null, { timeout: 8000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);
}
// Bar, knob, label, colours of the open popup.
const bar = (page) => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return null;
  const vis = (q) => window.__pierce(q, s).find((x) => x.getBoundingClientRect().width > 0);
  const sk = vis('.hm-seek'), tr = vis('.hm-prog .hm-track'), f = vis('.hm-prog .hm-fill'), lb = vis('.hm-pos'), kn = vis('.hm-knob');
  const ring = vis('.hui-dl path.fl.ln'), play = vis('.hm-b.lg');
  const r = tr && tr.getBoundingClientRect();
  return { seek: !!sk, role: sk ? sk.getAttribute('role') : null, knob: !!kn, label: lb ? lb.textContent : null,
    track: r ? { x: r.x, y: r.y + r.height / 2, w: r.width } : null, frac: f && r ? f.getBoundingClientRect().width / r.width : null,
    ring: ring ? getComputedStyle(ring).stroke : null, fill: f ? getComputedStyle(f).backgroundColor : null, play: play ? getComputedStyle(play).backgroundColor : null,
    calls: (window.__qaCalls || []).slice() };
});
const seeks = (b) => b.calls.filter((c) => c.s === 'media_seek').map((c) => c.d.seek_position);
const at = (b, f) => ({ x: b.track.x + b.track.w * f, y: b.track.y });

// ── Desktop (Chromium, mouse) ──────────────────────────────────────────────
{
  const { page, ent } = await setup(false, false);
  await fakeStates(page, { [ent]: { state: 'paused', attributes: await attrsFor(page) } }, { sticky: true });
  await spy(page);
  await openPopup(page, ent, false);
  let b = await bar(page);
  await need('desktop: media popup with a progress bar', b && b.track, b);
  await shot('desktop seekable bar');
  await check('desktop: SEEK → slider with a knob', b.seek && b.role === 'slider' && b.knob, b);
  await check('desktop: ring, bar fill and play button in one colour', b.ring && b.ring === b.fill && b.fill === b.play, { ring: b.ring, fill: b.fill, play: b.play });
  // Drag from 20 % to 70 %: the label shows the target while dragging, release seeks.
  const p0 = at(b, 0.2), p1 = at(b, 0.7);
  await page.mouse.move(p0.x, p0.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(p0.x + (p1.x - p0.x) * i / 8, p0.y);
  const mid = await bar(page);
  await check('desktop: while dragging the label shows the target time', mid.label === '1:30' && Math.abs(mid.frac - 0.7) < 0.03, mid);
  await page.mouse.up();
  await page.waitForTimeout(400);
  b = await bar(page);
  await check('desktop: drag calls media_seek at the target', seeks(b).length === 1 && Math.abs(seeks(b)[0] - Math.round(DUR * 0.7)) <= 1, b.calls);
  // HA still reports the old place (a periodic update): the bar does not jump back.
  await fakeStates(page, { [ent]: { state: 'paused', attributes: { media_position: 11, media_position_updated_at: new Date().toISOString() } } }, { sticky: true });
  b = await bar(page);
  await check('desktop: no jump back before HA reports the new position', Math.abs(b.frac - 0.7) < 0.03 && b.label === '1:30', b);
  await fakeStates(page, { [ent]: { state: 'paused', attributes: { media_position: 90, media_position_updated_at: new Date().toISOString() } } }, { sticky: true });
  b = await bar(page);
  await check('desktop: HA reports the target, the bar stays there', Math.abs(b.frac - 90 / DUR) < 0.02 && b.label === '1:30', b);
  // A click on the bar jumps.
  const c = at(b, 0.3);
  await page.mouse.click(c.x, c.y);
  await page.waitForTimeout(400);
  b = await bar(page);
  await check('desktop: click on the bar seeks there', seeks(b).length === 2 && Math.abs(seeks(b)[1] - Math.round(DUR * 0.3)) <= 1, b.calls);
  // Keys: focused slider, arrow right = +5 s.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  b = await bar(page);
  await check('desktop: arrow right seeks 5 s on', seeks(b).length === 3 && Math.abs(seeks(b)[2] - (seeks(b)[1] + 5)) <= 1, b.calls);
  await check('desktop: the popup stays open', await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open'))));
  // Without SEEK: the bar only shows.
  await fakeStates(page, { [ent]: { state: 'playing', attributes: { supported_features: 448439 & ~2, media_position: 20, media_position_updated_at: new Date().toISOString() } } }, { sticky: true });
  b = await bar(page);
  await check('desktop: without SEEK no knob and no slider', b && b.track && !b.seek && !b.knob, b);
}

// ── Phone (WebKit, touch) ──────────────────────────────────────────────────
{
  const { page, ent } = await setup(true, true);
  await fakeStates(page, { [ent]: { state: 'paused', attributes: await attrsFor(page) } }, { sticky: true });
  await spy(page);
  await openPopup(page, ent, true);
  let b = await bar(page);
  await need('phone: media popup with a seekable bar', b && b.track && b.seek, b);
  // Synthetic touches on the element under the point (composed through the shadow roots).
  const touch = (points) => page.evaluate(async (points) => {
    const deepAt = (x, y) => { let el = document.elementFromPoint(x, y); while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; } return el; };
    const target = deepAt(points[0].x, points[0].y);
    // WebKit has no Touch constructor: a plain composed event carrying touch lists (what the handlers read).
    const fire = (type, p) => {
      const t = { identifier: 7, target, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y };
      const end = type === 'touchend';
      const ev = new Event(type, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(ev, 'touches', { value: end ? [] : [t] });
      Object.defineProperty(ev, 'targetTouches', { value: end ? [] : [t] });
      Object.defineProperty(ev, 'changedTouches', { value: [t] });
      target.dispatchEvent(ev);
    };
    fire('touchstart', points[0]);
    for (let i = 1; i < points.length; i++) { await new Promise((r) => setTimeout(r, 16)); fire('touchmove', points[i]); }
    fire('touchend', points[points.length - 1]);
    return true;
  }, points);
  const p0 = at(b, 0.2), p1 = at(b, 0.6);
  const ok = await touch(Array.from({ length: 9 }, (_, i) => ({ x: p0.x + (p1.x - p0.x) * i / 8, y: p0.y })));
  await need('phone: touch events can be built', ok);
  await page.waitForTimeout(500);
  b = await bar(page);
  await check('phone: drag along the bar seeks', seeks(b).length === 1 && Math.abs(seeks(b)[0] - Math.round(DUR * 0.6)) <= 2, b.calls);
  await check('phone: bar at the target after the drag', Math.abs(b.frac - 0.6) < 0.04, b);
  // A vertical swipe that starts on the bar is not a seek.
  const v = at(b, 0.5);
  await touch(Array.from({ length: 8 }, (_, i) => ({ x: v.x, y: v.y - i * 14 })));
  await page.waitForTimeout(500);
  b = await bar(page);
  await check('phone: vertical swipe over the bar sends nothing', seeks(b).length === 1, b.calls);
  // A tap on the bar jumps.
  const t = at(b, 0.85);
  await touch([t]);
  await page.waitForTimeout(500);
  b = await bar(page);
  await check('phone: tap on the bar seeks there', seeks(b).length === 2 && Math.abs(seeks(b)[1] - Math.round(DUR * 0.85)) <= 2, b.calls);
  await check('phone: the popup stays open', await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open'))));
  await shot('phone seekable bar');
}
await finish();
