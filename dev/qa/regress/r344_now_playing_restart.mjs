// @zustand: arbeit
// @parallel: allein   (sets a player state via REST in the test HA - other tests would see it)
// Reported (25.10.2026, HomePod): tapping ⏮ restarts the same song, but the progress bar keeps the old
// position. Cause: the _casoraNP memo (casora-core.js) signed a player by title/artist/timestamp only -
// a new media_position without a new media_position_updated_at kept the old list, so the soft list
// and the wave stage went on from the old position. Also: the ⏮/⏭ glyph sat ~0.8 units off the centre
// of its round button (path box centred, not the drawn shape).
// Expected (Casora look, desktop light + phone dark): (1) playing at 60 % → bar ~60 %. (2) Same title,
// position 0 with a new timestamp → bar ~0 within 1 s. (3) Same title, position 0 with the SAME
// timestamp → bar ~0 within 1 s. (4) ⏮ with a silent player: bar restarts from 0 at once, back to HA's
// value after ~5 s. Each in the list/stage and in the media popup. (5) ⏮/⏭: centre of the drawn glyph =
// centre of the round button (≤ 0.5 px, both axes).
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, usePage, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const dash = await casoraDashboard((d) => /"casora_room"/.test(JSON.stringify(d.config)));
await need('Casora dashboard with room card and phone counterpart', dash && dash.phone);

const ID = 'media_player.qa_np_restart';
const { access_token: TK } = await tokens();
const rest = (body, method = 'POST') => fetch(BASE + '/api/states/' + ID, { method,
  headers: { Authorization: 'Bearer ' + TK, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const play = (pos, at) => rest({ state: 'playing', attributes: { friendly_name: 'Lautsprecher QA', media_title: 'Same Song',
  media_artist: 'QA Band', media_duration: 300, media_position: pos, media_position_updated_at: at || new Date().toISOString(),
  media_content_type: 'music', supported_features: 4127295 } });
atFinish(async () => { await rest(null, 'DELETE'); });

// Now playing in room cards (desktop) and the phone list, only with the test player.
const inject = (ids) => {
  const fix = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(fix); return; }
    const t = [].concat(o.template || []);
    if (o.variables && (t.includes('casora_room') || t.includes('casora_mobile_now_playing'))) {
      o.variables.show_now_playing = true;
      for (let i = 1; i <= 10; i++) o.variables['media_player_' + i] = ids[i - 1] || null;
    }
    for (const k in o) fix(o[k]);
  };
  const add = WebSocket.prototype.addEventListener;
  WebSocket.prototype.addEventListener = function (t, fn, opt) {
    if (t !== 'message') return add.call(this, t, fn, opt);
    return add.call(this, t, function (ev) {
      if (typeof ev.data === 'string' && ev.data.includes('"views"')
        && (ev.data.includes('"casora_room"') || ev.data.includes('casora_mobile_now_playing'))) {
        try { const d = JSON.parse(ev.data); fix(d); ev = new MessageEvent('message', { data: JSON.stringify(d) }); } catch (e) { /* unchanged */ }
      }
      return fn.call(this, ev);
    }, opt);
  };
  try { localStorage.removeItem('casora.np.hidden'); } catch (e) { /* ignore */ }
};

// Visible progress bars as fraction of their track: soft list/stage (.b i) and media popup (.hm-fill).
const bars = (pg) => pg.evaluate(() => {
  const out = [];
  for (const sel of ['.b i', '.hm-fill']) for (const el of window.__pierce(sel)) {
    if (sel === '.hm-fill' && !el.closest('.hm-prog')) continue; // volume slider
    const r = el.getBoundingClientRect(), p = el.parentElement.getBoundingClientRect();
    if (p.width < 20 || r.height === 0 || p.bottom < 0 || p.top > innerHeight) continue;
    out.push({ k: sel === '.b i' ? 'list' : 'popup', f: +(r.width / p.width).toFixed(3) });
  }
  return out;
});
const waitBars = async (pg, kind, ok, ms) => {
  const t = Date.now();
  let v = [];
  while (Date.now() - t <= ms) {
    v = (await bars(pg)).filter((x) => x.k === kind);
    if (v.length && v.every((x) => ok(x.f))) return { ms: Date.now() - t, v };
    await pg.waitForTimeout(100);
  }
  return { ms: -1, v };
};
// Silent player: media_player services are recorded, not sent (HA reports nothing after ⏮).
const muteCalls = (pg) => pg.evaluate(() => {
  window.__qaCalls = window.__qaCalls || [];
  const h = document.querySelector('home-assistant').hass;
  if (h.__qaMuted) return;
  const orig = h.callService;
  h.callService = function (d, s, data, target) {
    window.__qaCalls.push(d + '.' + s);
    if (d === 'media_player') return Promise.resolve();
    return orig.apply(this, arguments);
  };
  h.__qaMuted = true;
});

// Centre of the drawn glyph (alpha box of the rendered icon) vs centre of its round button.
const glyphs = (pg, sel) => pg.evaluate(async (sel) => {
  const out = [];
  for (const btn of window.__pierce(sel)) {
    const br = btn.getBoundingClientRect();
    if (br.width < 10 || br.top < 0 || br.top > innerHeight) continue;
    const icon = btn.querySelector('svg') || btn.querySelector('div');
    if (!icon) continue;
    let url;
    if (icon.localName === 'svg') {
      const c = icon.cloneNode(true);
      c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      c.querySelectorAll('path').forEach((p) => p.setAttribute('fill', '#000'));
      url = 'data:image/svg+xml,' + encodeURIComponent(c.outerHTML);
    } else {
      const m = (getComputedStyle(icon).webkitMaskImage || getComputedStyle(icon).maskImage || '').match(/url\("?(.*?)"?\)$/);
      if (!m) continue;
      url = m[1];
    }
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.onerror = res; img.src = url; });
    const N = 480, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d');
    g.drawImage(img, 0, 0, N, N);
    const px = g.getImageData(0, 0, N, N).data;
    let x0 = N, x1 = -1, y0 = N, y1 = -1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (px[(y * N + x) * 4 + 3] > 40) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) continue;
    const ir = icon.getBoundingClientRect();
    const gx = ir.left + ((x0 + x1 + 1) / 2 / N) * ir.width, gy = ir.top + ((y0 + y1 + 1) / 2 / N) * ir.height;
    out.push({ a: btn.dataset.a || (btn.dataset.casoraSvc || '').match(/media_\w+_track/)?.[0] || '?',
      dx: +(gx - (br.left + br.width / 2)).toFixed(2), dy: +(gy - (br.top + br.height / 2)).toFixed(2) });
  }
  return out;
}, sel);
const centred = (g) => g.length >= 2 && g.every((x) => Math.abs(x.dx) <= 0.5 && Math.abs(x.dy) <= 0.5);

async function scenarios(pg, kind, label) {
  await play(180);
  let r = await waitBars(pg, kind, (f) => f > 0.55 && f < 0.7, 3000);
  await check(label + ': playing at 60 % → bar ~60 %', r.ms >= 0, r.v);
  await play(0);
  r = await waitBars(pg, kind, (f) => f < 0.05, 1000);
  await check(label + ': same title, position 0 + new timestamp → bar ~0 within 1 s', r.ms >= 0, r);
  const at = new Date(Date.now() - 1000).toISOString();
  await play(180, at);
  await waitBars(pg, kind, (f) => f > 0.55, 3000);
  await play(0, at);
  r = await waitBars(pg, kind, (f) => f < 0.05, 1000);
  await check(label + ': same title, position 0 + same timestamp → bar ~0 within 1 s', r.ms >= 0, r);
}

async function skipTest(pg, kind, sel, label) {
  await play(180);
  await waitBars(pg, kind, (f) => f > 0.55, 3000);
  await muteCalls(pg);
  const b = await pg.evaluate((sel) => {
    const e = window.__pierce(sel).map((x) => x.getBoundingClientRect()).filter((q) => q.width > 10 && q.top > 0 && q.top < innerHeight)[0];
    return e ? { x: e.x + e.width / 2, y: e.y + e.height / 2 } : null;
  }, sel);
  await need(label + ': ⏮ found', b);
  await pg.mouse.click(b.x, b.y);
  let r = await waitBars(pg, kind, (f) => f < 0.05, 1000);
  await check(label + ': ⏮ with silent player → bar restarts from 0 at once', r.ms >= 0, r);
  const calls = await pg.evaluate(() => window.__qaCalls.slice());
  await check(label + ': ⏮ sent media_previous_track', calls.includes('media_player.media_previous_track'), calls);
  r = await waitBars(pg, kind, (f) => f > 0.55, 7000);
  await check(label + ': HA silent → back to HA position after ~5 s', r.ms >= 0, r);
}

// ── Desktop (light): wave stage, then media popup ──
await play(180);
const desk = await open({ width: 1440, height: 900, dark: false, theme: 'Casora', scale: 1 });
await desk.context.addInitScript(inject, [ID]);
await dashboard(desk.page, dash.url);
let pg = desk.page;
const wave = await pg.evaluate(() => {
  const e = window.__pierce('.np-head-wave').map((x) => x.getBoundingClientRect()).filter((r) => r.width >= 30)[0];
  return e ? { x: e.x + e.width / 2, y: e.y + e.height / 2 } : null;
});
await need('Desktop: wave visible', wave);
await pg.mouse.click(wave.x, wave.y);
await pg.waitForTimeout(900);
await scenarios(pg, 'list', 'Desktop stage');
let g = await glyphs(pg, '.r.st .k');
await check('Desktop stage: ⏮/⏭ glyph centred in its circle (≤ 0.5 px)', centred(g), g);
await skipTest(pg, 'list', '.r.st .k[data-a="prev"]', 'Desktop stage');
await pg.reload();
await dashboard(pg, dash.url);
const w2 = await pg.evaluate(() => {
  const e = window.__pierce('.np-head-wave').map((x) => x.getBoundingClientRect()).filter((r) => r.width >= 30)[0];
  return e ? { x: e.x + e.width / 2, y: e.y + e.height / 2 } : null;
});
await need('Desktop: wave visible again', w2);
await pg.mouse.click(w2.x, w2.y);
await pg.waitForTimeout(900);
const row = await pg.evaluate(() => {
  const b = window.__pierce('.r.st .t').map((x) => x.getBoundingClientRect()).filter((q) => q.width > 10 && q.y > 0)[0];
  return b ? { x: b.x + 5, y: b.y + b.height / 2 } : null;
});
await need('Desktop: stage row found', row);
await pg.mouse.click(row.x, row.y);
await pg.waitForTimeout(1500);
await scenarios(pg, 'popup', 'Desktop popup');
g = await glyphs(pg, '.hm-ctl .hm-b.sm');
await check('Desktop popup: ⏮/⏭ glyph centred in its circle (≤ 0.5 px)', centred(g), g);
await skipTest(pg, 'popup', '.hm-ctl .hm-b.sm[data-casora-svc*="media_previous_track"]', 'Desktop popup');

// ── Phone (dark): list, then media popup ──
const ph = await open({ width: 390, height: 844, mobile: true, dark: true, theme: 'Casora', scale: 1 });
usePage(ph.page);
await ph.context.addInitScript(inject, [ID]);
await play(180);
await dashboard(ph.page, dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'));
pg = ph.page;
await scenarios(pg, 'list', 'Phone list');
g = await glyphs(pg, '.r .k');
await check('Phone list: ⏮/⏭ glyph centred in its circle (≤ 0.5 px)', centred(g), g);
await skipTest(pg, 'list', '.r .k[data-a="prev"]', 'Phone list');
const prow = await pg.evaluate(() => {
  const b = window.__pierce('.r .t').map((x) => x.getBoundingClientRect()).filter((q) => q.width > 10 && q.y > 0)[0];
  return b ? { x: b.x + 5, y: b.y + b.height / 2 } : null;
});
await need('Phone: row found', prow);
await pg.mouse.click(prow.x, prow.y);
await pg.waitForTimeout(1500);
await scenarios(pg, 'popup', 'Phone popup');
g = await glyphs(pg, '.hm-ctl .hm-b.sm');
await check('Phone popup: ⏮/⏭ glyph centred in its circle (≤ 0.5 px)', centred(g), g);
await skipTest(pg, 'popup', '.hm-ctl .hm-b.sm[data-casora-svc*="media_previous_track"]', 'Phone popup');
await finish();
