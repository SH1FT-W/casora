// @zustand: arbeit
// @parallel: ui
// Design-Durchsicht 1.2, Teil D (Entscheidungen 08.10.2026). Erwartet im Casora-Design (hell und dunkel):
// D1 Schwebende Fenster als eine Familie: Glocke (Desktop + Handy), Welle (Desktop), ⋯-Menü (Desktop + Handy)
//    und Handy-Räume-Fenster mit Radius 28, deckender Fläche und demselben Schatten. Glocke und Welle ohne Kopf
//    und ohne Platten, Zeilen 52, Kreis 36, Name 15/600, Unterzeile 13; „Alles gelesen“ als Sand-Pille unter
//    der Liste (nur bei Ungelesenem); ⋯-Menü Zeilen 52, Kreis 36.
// D7 Handy-Zurück-Kreis 48, gleiche Höhe und Mittellinie wie die Kopf-Pille rechts.
// D8 Offener Kopfknopf (Glocke, Welle) in der Fläche der aktiven Raum-Pille.
// D10 Kopfknöpfe Glocke, Assist, ⋯ mit dem Leisten-Schatten wie die Welle.
// D12 Desktop-Raumleiste: weiße Pille ringsum 4 eingerückt.
// D5 Handy-Raumseite: Szenen-Kachel 62 hoch, Kreis 42, Text bei 80 wie die Geräte-Kacheln.
// 1.2.1 Glocke: Symbole auf ganzen Pixeln mittig im Kreis, Warndreieck („Neustart ausstehend“) optisch mittig.
import { open, casoraDashboards, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = await casoraDashboard((d) => all.some((x) => x.url === d.url + '-mobile'));
await need('Casora-Dashboard mit Handy-Gegenstück', desk && desk.phone);
const near = (a, b, t = 1) => a != null && b != null && Math.abs(a - b) <= t;
const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c || '');
// Farben vergleichen, auch wenn eine als color(srgb …) aus color-mix kommt.
const rgba = (c) => { const n = String(c || '').match(/[\d.]+/g) || []; const f = /^color\(srgb/.test(c || '') ? 255 : 1;
  return [0, 1, 2].map((i) => Math.round(+n[i] * f)).concat([n[3] == null ? 1 : +(+n[3]).toFixed(2)]); };
const same = (a, b) => { const x = rgba(a), y = rgba(b); return x.every((v, i) => Math.abs(v - y[i]) <= (i < 3 ? 1 : 0.02)); };

// Ein schwebendes Fenster vermessen (sel: Klasse am Fenster, row: Zeilen-Selektor, ic: Kreis in der Zeile).
const frame = (page, [sel, row, ic, name]) => page.evaluate(([sel, row, ic, name]) => {
  const m = window.__pierce(sel).find((e) => e.getBoundingClientRect().width > 0); if (!m) return null;
  const cs = getComputedStyle(m), mr = m.getBoundingClientRect();
  const rows = row ? [...(m.shadowRoot || m).querySelectorAll(row)].concat(...[...m.querySelectorAll('*')].filter((x) => x.shadowRoot).map((x) => [...x.shadowRoot.querySelectorAll(row)]))
    .filter((r) => r.getBoundingClientRect().height > 0) : [];
  const r0 = rows[0], i0 = r0 && ic ? r0.querySelector(ic) : null, n0 = r0 && name ? r0.querySelector(name) : null;
  return { radius: parseFloat(cs.borderTopLeftRadius), bg: cs.backgroundColor, shadow: cs.boxShadow, blur: cs.backdropFilter || cs.webkitBackdropFilter || 'none',
    w: mr.width, n: rows.length, rowH: r0 ? r0.getBoundingClientRect().height : null, rowBg: r0 ? getComputedStyle(r0).backgroundColor : null,
    icW: i0 ? i0.getBoundingClientRect().width : null, fs: n0 ? parseFloat(getComputedStyle(n0).fontSize) : null, fw: n0 ? +getComputedStyle(n0).fontWeight : null,
    head: !!m.querySelector('.casora-welle-head') || [...m.querySelectorAll('div')].some((d) => /^(Benachrichtigungen|Notifications)$/.test(d.textContent.trim())),
    read: (() => { const b = m.querySelector('.casora-notify-read'); if (!b) return null; const r = b.getBoundingClientRect(), c = getComputedStyle(b);
      return { below: r.top >= (rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom - 1 : 0), radius: parseFloat(c.borderTopLeftRadius), h: r.height, bg: c.backgroundColor, fs: parseFloat(c.fontSize) }; })() };
}, [sel, row, ic, name]);
const tap = async (page, fn) => { const p = await page.evaluate(fn); if (!p) return false; await page.mouse.click(p.x, p.y); await page.waitForTimeout(1300); return true; };
const btn = (tpl) => `(() => { const c = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('${tpl}') && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top < 220);
  if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`;
const headBtn = (page, tpl) => page.evaluate((tpl) => { const c = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes(tpl) && b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top < 220);
  const h = c && c.shadowRoot.querySelector('ha-card'); return h ? { bg: getComputedStyle(h).backgroundColor, shadow: getComputedStyle(h).boxShadow } : null; }, tpl);
const probe = (page, v) => page.evaluate((v) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;width:1px;height:1px;background:' + v; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; }, v);

// Symbole der offenen Glocke in ihren Kreisen: Glyphen-Kasten auf ganzen Pixeln mittig (bei 8,5 px Rand rastete
// Chrome auf 9 – alles ½ px rechts unten), und beim Warndreieck („Neustart ausstehend“) die gezeichnete Form
// per Bildauswertung: waagrecht mittig, Schwerpunkt höchstens 1,3 px unter der Kreismitte (vorher 2,2 px).
async function glyphs(page, tag) {
  const list = await page.evaluate(() => { const m = window.__pierce('.casora-notify-menu').find((e) => e.getBoundingClientRect().width > 0); if (!m) return [];
    return [...m.querySelectorAll('.hui-srow')].map((r) => { const c = r.querySelector('.hui-inner > :first-child'), g = c && c.firstElementChild; if (!g) return null;
      const q = c.getBoundingClientRect(), k = g.getBoundingClientRect();
      return { label: r.textContent.trim().slice(0, 32), c: { x: q.x, y: q.y, w: q.width, h: q.height }, left: k.left - q.left, top: k.top - q.top,
        right: q.right - k.right, bottom: q.bottom - k.bottom }; }).filter(Boolean); });
  await check(`${tag}: Glocke – Symbole auf ganzen Pixeln mittig im Kreis`, list.length > 0 && list.every((x) => near(x.left, x.right, 0.01) && near(x.top, x.bottom, 0.01)
    && Math.abs(x.left - Math.round(x.left)) < 0.01 && Math.abs(x.top - Math.round(x.top)) < 0.01), list.map((x) => [x.label, x.left, x.right, x.top, x.bottom]));
  const it = list.find((x) => /Neustart ausstehend|Restart pending/.test(x.label));
  await need(`${tag}: Glocke mit „Neustart ausstehend“`, it, list.map((x) => x.label));
  const buf = await page.screenshot({ clip: { x: it.c.x, y: it.c.y, width: it.c.w, height: it.c.h } });
  const a = await page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, cv.width, cv.height).data, W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = W / 2;
    const px = (i, j) => { const k = (j * W + i) * 4; return [d[k], d[k + 1], d[k + 2]]; };
    const ring = []; for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const r = Math.hypot(i + .5 - cx, j + .5 - cy) / R; if (r > .82 && r < .92) ring.push(px(i, j)); }
    const bg = [0, 1, 2].map((q) => ring.map((p) => p[q]).sort((u, v) => u - v)[ring.length >> 1]);
    const w = new Float32Array(W * H); let mx = 0;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (Math.hypot(i + .5 - cx, j + .5 - cy) / R > .8) continue; const p = px(i, j);
      const v = Math.hypot(p[0] - bg[0], p[1] - bg[1], p[2] - bg[2]); w[j * W + i] = v; mx = Math.max(mx, v); }
    let s = 0, sx = 0, sy = 0, x0 = W, x1 = -1;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const v = w[j * W + i] / (mx || 1); if (v < .08) continue;
      s += v; sx += v * (i + .5); sy += v * (j + .5); if (v > .25) { x0 = Math.min(x0, i); x1 = Math.max(x1, i + 1); } }
    const f = W / 36;
    return { massX: (sx / s - cx) / f, massY: (sy / s - cy) / f, boxX: ((x0 + x1) / 2 - cx) / f };
  }, buf.toString('base64'));
  console.log(tag, 'Warndreieck', JSON.stringify(a));
  await check(`${tag}: Glocke – Warndreieck optisch mittig im Kreis (waagrecht ±0,4, Schwerpunkt ≤ 1,3 px unter der Mitte)`,
    Math.abs(a.boxX) <= 0.4 && Math.abs(a.massX) <= 0.4 && a.massY <= 1.3 && a.massY >= -0.5, a);
}

const IDS = ['media_player.qa_welle_1', 'media_player.qa_welle_2'];
for (const dark of [false, true]) {
  const tag = 'Casora ' + (dark ? 'dunkel' : 'hell');
  // ── Desktop ──
  const { page, context, browser } = await open({ width: 1440, height: 900, dark, theme: 'Casora', scale: 1 });
  usePage(page);
  // Welle im Kopf: zwei Wiedergaben (nur im Browser).
  await context.addInitScript((ids) => { const fix = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(fix); return; }
    if (o.variables && [].concat(o.template || []).includes('casora_room')) { o.variables.show_now_playing = true; ids.forEach((id, i) => { o.variables['media_player_' + (i + 1)] = id; }); } for (const k in o) fix(o[k]); };
    const add = WebSocket.prototype.addEventListener; WebSocket.prototype.addEventListener = function (t, fn, opt) { if (t !== 'message') return add.call(this, t, fn, opt);
      return add.call(this, t, function (ev) { if (typeof ev.data === 'string' && ev.data.includes('"casora_room"') && ev.data.includes('"views"')) { try { const d = JSON.parse(ev.data); fix(d); ev = new MessageEvent('message', { data: JSON.stringify(d) }); } catch (e) {} } return fn.call(this, ev); }, opt); }; }, IDS);
  await dashboard(page, desk.url, 3);
  const tabFill = await probe(page, 'var(--casora-nav-tab-active-fill)');
  const rim = await page.evaluate(() => { const d = document.createElement('div'); d.style.boxShadow = 'var(--casora-pill-rim)'; document.body.appendChild(d); const s = getComputedStyle(d).boxShadow; d.remove(); return s; });

  // D10: Kopfknöpfe mit dem Leisten-Schatten.
  for (const t of ['casora_notifications_button', 'casora_settings_button']) {
    const b = await headBtn(page, t);
    await check(`${tag}: ${t} mit Leisten-Schatten wie die Welle (D10)`, b && b.shadow !== 'none' && b.shadow === rim, [b, rim]);
  }
  // D12: Raumleiste, weiße Pille ringsum 4.
  const nb = await page.evaluate(() => { const nb = window.__pierce('casora-nav-bar').find((e) => e.getBoundingClientRect().width > 0); if (!nb) return null;
    const b = nb.shadowRoot.querySelector('.bar').getBoundingClientRect(), f = nb.shadowRoot.querySelector('.indicator .fill').getBoundingClientRect(),
      r = nb.shadowRoot.querySelector('.route.active, .route'), rr = r.getBoundingClientRect(), first = nb.shadowRoot.querySelector('.route').getBoundingClientRect();
    return { left: first.left - b.left, top: f.top - b.top, bottom: b.bottom - f.bottom, firstActive: r === nb.shadowRoot.querySelector('.route') };
  });
  await check(`${tag}: Raumleiste – Pille ringsum 4 eingerückt (D12)`, nb && near(nb.left, 4) && near(nb.top, 4) && near(nb.bottom, 4), nb);

  // 1.2.1 (gemeldet: „Symbol Neustart im Kreis bei der Glocke nicht ausgerichtet“): Eintrag „Neustart ausstehend“
  // nur im Browser herstellen, dann Lage der Symbole in ihren Kreisen messen (nach dem Öffnen).
  await fakeStates(page, { 'update.qa_neustart': { state: 'off', attributes: { friendly_name: 'QA Update', installed_version: '1.2.0',
    latest_version: '1.2.0', release_summary: 'Restart Home Assistant to finish', in_progress: false } } }, { sticky: true });
  await page.evaluate(() => window._casoraNotify && window._casoraNotify.refresh());
  await page.waitForTimeout(600);
  // Glocke.
  await tap(page, () => { const r = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const g = await frame(page, ['.casora-notify-menu', '.hui-srow', '.hui-inner > :first-child', '.hui-inner > :nth-child(2) > :first-child']);
  await need(`${tag}: Glocke offen`, g && g.n > 0, g);
  console.log(tag, 'Glocke', JSON.stringify(g));
  await glyphs(page, tag);
  const bellOpen = await headBtn(page, 'casora_notifications_button');
  await check(`${tag}: offene Glocke in der Fläche der aktiven Raum-Pille (D8)`, bellOpen && same(bellOpen.bg, tabFill), [bellOpen, tabFill]);
  await page.keyboard.press('Escape'); await page.waitForTimeout(600);

  // Welle.
  const now = new Date().toISOString();
  const pl = (t, i) => ({ state: 'playing', attributes: { friendly_name: 'Lautsprecher ' + i, media_title: t, media_artist: 'Künstler', media_duration: 300, media_position: 60, media_position_updated_at: now, media_content_type: 'music', supported_features: 4127295 } });
  await fakeStates(page, { [IDS[0]]: pl('Erster Titel', 1), [IDS[1]]: pl('Zweiter Titel', 2) }, { sticky: true });
  await page.waitForTimeout(2500);
  const wv = await tap(page, () => { const r = window.__pierce('.np-head-wave').map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0)[0]; return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const w = wv ? await frame(page, ['.casora-welle-menu', '.r', '.cv', '.t']) : null;
  await need(`${tag}: Welle offen`, w && w.n > 0, w);
  console.log(tag, 'Welle', JSON.stringify(w));
  const waveOpen = await page.evaluate(() => { const e = window.__pierce('.np-head-wave').find((x) => x.getBoundingClientRect().width > 0); return e ? getComputedStyle(e).backgroundColor : null; });
  await page.waitForTimeout(500);
  const waveOpen2 = await page.evaluate(() => { const e = window.__pierce('.np-head-wave').find((x) => x.getBoundingClientRect().width > 0); return e ? getComputedStyle(e).backgroundColor : null; });
  await check(`${tag}: offene Welle in der Fläche der aktiven Raum-Pille (D8)`, same(waveOpen2, tabFill), [waveOpen, waveOpen2, tabFill]);
  await tap(page, () => { const r = window.__pierce('.np-head-wave').map((e) => e.getBoundingClientRect()).filter((b) => b.width > 0)[0]; return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.waitForTimeout(500);

  // ⋯-Menü.
  await tap(page, new Function('return ' + btn('casora_settings_button')));
  const p = await frame(page, ['.casora-settings-menu', 'button', '.casora-mi', 'span:not(.casora-mi)']);
  await need(`${tag}: ⋯-Menü offen`, p && p.n > 0, p);
  console.log(tag, '⋯', JSON.stringify(p));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);

  // D1: eine Familie.
  for (const [n, f] of [['Glocke', g], ['Welle', w], ['⋯-Menü', p]]) {
    await check(`${tag}: ${n} Desktop – Radius 28, deckend, kein Glas (D1)`, near(f.radius, 28, 0) && /^rgb\(/.test(f.bg) && !/blur/.test(f.blur), f);
    await check(`${tag}: ${n} Desktop – Schatten wie die Glocke`, f.shadow === g.shadow && f.shadow !== 'none', [f.shadow, g.shadow]);
    await check(`${tag}: ${n} Desktop – Bg wie die Glocke`, f.bg === g.bg, [f.bg, g.bg]);
  }
  await check(`${tag}: Glocke ohne Kopf, Zeilen ohne Platte 52, Kreis 36, Name 15/600`, !g.head && clear(g.rowBg) && near(g.rowH, 52) && near(g.icW, 36) && near(g.fs, 15, 0.5) && g.fw >= 600, g);
  await check(`${tag}: „Alles gelesen“ als kleine Sand-Pille unter der Liste (nur bei Ungelesenem)`, g.read === null || (g.read.below && g.read.h <= 36 && g.read.radius >= g.read.h / 2 - 1 && !clear(g.read.bg) && near(g.read.fs, 13, 0.5)), g.read);
  // 09.10.2026: Welle-Menü als Cover-Bühne (Entwurf C) – erste Wiedergabe mit Cover 64, Titel 17/600.
  await check(`${tag}: Welle ohne Kopf, Bühne mit Cover 64, Titel 17/600`, !w.head && near(w.icW, 64) && near(w.fs, 17, 0.5) && w.fw >= 600, w);
  await check(`${tag}: ⋯-Menü Zeilen 52, Kreis 36`, near(p.rowH, 52) && near(p.icW, 36), p);
  await browser.close();

  // ── Handy ──
  const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark, theme: 'Casora' });
  usePage(ph.page);
  await dashboard(ph.page, desk.phone.url, 3);
  await ph.page.waitForFunction(() => { const n = window.__pierce('casora-mobile-nav')[0]; return !!(n && n._hass && n._bRooms); }, null, { timeout: 15000 }).catch(() => {});
  const hg = await tap(ph.page, () => { const r = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top < 200); return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })
    ? await frame(ph.page, ['.casora-notify-menu', '.hui-srow', '.hui-inner > :first-child', '.hui-inner > :nth-child(2) > :first-child']) : null;
  await ph.page.keyboard.press('Escape'); await ph.page.mouse.click(200, 600); await ph.page.waitForTimeout(800);
  const hp = await tap(ph.page, new Function('return ' + btn('casora_settings_button'))) ? await frame(ph.page, ['.casora-settings-menu', 'button', '.casora-mi', null]) : null;
  await ph.page.keyboard.press('Escape'); await ph.page.mouse.click(200, 600); await ph.page.waitForTimeout(800);
  await ph.page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._bRooms.click()); await ph.page.waitForTimeout(1300);
  const hr = await frame(ph.page, ['.hmn-menu.open', '.hmn-row', '.hmn-sic', '.hmn-name']);
  await ph.page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._closeMenu()); await ph.page.waitForTimeout(600);
  console.log(tag, 'Handy', JSON.stringify({ hg, hp, hr }));
  await need(`${tag}: Handy-Fenster offen`, hg && hp && hr, { hg, hp, hr });
  for (const [n, f] of [['Glocke', hg], ['⋯-Menü', hp]]) {
    await check(`${tag}: Handy ${n} wie das Räume-Fenster (Radius, Fläche, Schatten)`, near(f.radius, 28, 0) && f.radius === hr.radius && f.bg === hr.bg && f.shadow === hr.shadow, [f, hr]);
  }
  await check(`${tag}: Handy Glocke Zeilen 52, Kreis 36, ohne Kopf`, !hg.head && near(hg.rowH, 52) && near(hg.icW, 36) && clear(hg.rowBg), hg);
  await check(`${tag}: Handy ⋯-Menü Zeilen 52, Kreis 36`, near(hp.rowH, 52) && near(hp.icW, 36), hp);

  // D7 + D5: Raumseite.
  await ph.page.evaluate(() => { const nav = window.__pierce('casora-mobile-nav')[0]; const k = nav._items('rooms').filter((x) => x.label); k[0].run(); });
  await ph.page.waitForTimeout(4000);
  const rs = await ph.page.evaluate(() => {
    const R = (e) => e && e.getBoundingClientRect();
    const ov = window.__pierce('casora-filter-overlay').find((o) => o._showing), b = R(ov && ov._backBtn);
    const ch = window.__pierce('button-card').filter((x) => [].concat(x._config?.template || []).includes('casora_mobile_chrome') && x.getBoundingClientRect().width > 0).map((x) => R(x.shadowRoot.querySelector('ha-card')))[0];
    const chip = window.__pierce('[data-scene]').find((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().top > 100);
    const dev = window.__pierce('button-card').filter((x) => [].concat(x._config?.template || []).some((t) => /^casora_(light|cover|switch|media)/.test(t)) && x.getBoundingClientRect().width > 0 && x.getBoundingClientRect().top > 100)[0];
    const dh = dev && R(dev.shadowRoot.querySelector('ha-card')), dn = dev && R(dev.shadowRoot.querySelector('#name'));
    return { back: b && { top: b.top, h: b.height, mid: b.top + b.height / 2 }, pill: ch && { top: ch.top, h: ch.height, mid: ch.top + ch.height / 2 },
      chip: chip && { h: R(chip).height, ic: R(chip.firstElementChild).width, tx: R(chip.children[1]).left - R(chip).left },
      dev: dh && { h: dh.height, tx: dn.left - dh.left } };
  });
  console.log(tag, 'Raumseite', JSON.stringify(rs));
  await check(`${tag}: Zurück-Kreis 48 auf der Mittellinie der Kopf-Pille (D7)`, rs.back && rs.pill && near(rs.back.h, 48) && near(rs.back.mid, rs.pill.mid), rs);
  if (rs.chip) await check(`${tag}: Szenen-Kachel wie Geräte-Kachel – 62 hoch, Kreis 42, Text bei 12 + 42 + 10 (D5)`, near(rs.chip.h, 62) && near(rs.chip.ic, 42) && near(rs.chip.tx, 64) && (!rs.dev || (near(rs.dev.h, rs.chip.h) && near(rs.dev.tx, rs.chip.tx))), rs);
  else console.log('  info   ' + tag + ': erste Raumseite ohne Szenen – D5 nicht geprüft');
  await ph.browser.close();
}
await finish();
