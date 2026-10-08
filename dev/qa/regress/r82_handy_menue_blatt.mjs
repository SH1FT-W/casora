// @zustand: arbeit
// @parallel: ui
// Wunsch (08.10.2026, Entwurf A „Blatt von unten“): Räume- und Szenen-Menü der Handy-Leiste kommen im
// Casora-Look als Blatt von unten. Erwartet (Casora hell und dunkel, Casora Nebel hell, iPhone 393 × 852):
// Blatt 8 px vom Rand links/rechts/unten, Ecken konzentrisch (Blatt 44, Zeilen/Kacheln 44 − 8), Zeilen 64 px,
// Zeilen 8 px eingerückt, Symbolkreis links so weit wie oben und wie zum Text, Symbol/Text springen zwischen
// offener und anderer Zeile nicht, Überschrift fluchtet mit dem Kreis, Anzahl mit dem Chevron.
// Zustandszeile je Raum aus den Werten der Raum-Badges (Lichter, Temperatur): „1 Licht an · 22°“,
// „Alles aus · 22°“. Szenen als Kacheln im 2er-Raster mit eigener Farbe, Tipp dunkelt ab und schrumpft.
// Viele Räume: die letzte sichtbare Zeile ist angeschnitten.
import { open, casoraDashboards, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const phone = (process.env.CASORA_QA_DASH && all.find((d) => d.mobile && d.url === process.env.CASORA_QA_DASH)) || all.find((d) => d.mobile);
await need('Handy-Dashboard', phone);

const near = (a, b, t = 1) => a != null && b != null && Math.abs(a - b) <= t;

// Blatt öffnen (kind: rooms | scenes) und messen.
const measure = (page, kind) => page.evaluate((kind) => {
  const nav = window.__pierce('casora-mobile-nav')[0];
  if (!nav || !nav._hass || !nav._bRooms) return null;
  let m = document.querySelector('.hmn-menu');
  if (!m || m.getAttribute('data-kind') !== kind) {
    nav._closeMenu();
    (kind === 'rooms' ? nav._bRooms : nav._bScenes).click();
    return { wait: true };
  }
  if (!m.classList.contains('open') || !m.classList.contains('hmn-sheet')) return { wait: true, sheet: m.classList.contains('hmn-sheet') };
  const R = (e) => e.getBoundingClientRect(), cs = (e) => getComputedStyle(e);
  const sr = R(m), list = m.querySelector('.hmn-list'), lr = R(list);
  const items = [...list.querySelectorAll('.hmn-item')];
  const row = (b) => {
    if (!b) return null;
    const r = R(b), ic = b.querySelector('.hmn-sic'), i = R(ic), tx = b.querySelector('.hmn-txt') || b.querySelector('.hmn-name'), t = R(tx);
    const after = cs(b, '::after');
    return { x: r.left - sr.left, right: sr.right - r.right, w: r.width, h: r.height, top: r.top, bottom: r.bottom,
      radius: parseFloat(cs(b).borderTopLeftRadius), icL: i.left - r.left, icTop: i.top - r.top, icW: i.width, icH: i.height,
      icR: /%$/.test(cs(ic).borderTopLeftRadius) ? i.width * parseFloat(cs(ic).borderTopLeftRadius) / 100 : parseFloat(cs(ic).borderTopLeftRadius), gap: t.left - i.right, txL: t.left - r.left,
      bg: cs(b).backgroundColor, sub: (b.querySelector('.hmn-sub') || {}).textContent || '', key: b.getAttribute('data-k'),
      name: (b.querySelector('.hmn-name') || {}).textContent || '', chevW: parseFloat(getComputedStyle(b, '::after').width) || 0 };
  };
  const head = m.querySelector('.hmn-head'), title = m.querySelector('.hmn-title'), count = m.querySelector('.hmn-count');
  const on = list.querySelector('.hmn-item.on'), off = items.find((x) => !x.classList.contains('on'));
  return {
    kind, vw: innerWidth, vh: innerHeight,
    sheet: { left: sr.left, right: innerWidth - sr.right, bottom: innerHeight - sr.bottom, top: sr.top, radius: parseFloat(cs(m).borderTopLeftRadius) },
    titleL: title ? R(title).left - sr.left : null, countR: count ? sr.right - R(count).right : null, count: count ? count.textContent : '',
    list: { top: lr.top, bottom: lr.bottom, ch: list.clientHeight, sh: list.scrollHeight },
    n: items.length, on: row(on), off: row(off), first: row(items[0]), second: row(items[1]), third: row(items[2]),
  };
}, kind);

const openSheet = async (page, kind) => {
  let m = null;
  for (let i = 0; i < 16 && !(m && m.kind); i++) {
    m = await measure(page, kind);
    if (!(m && m.kind)) await page.waitForTimeout(600);
  }
  await page.waitForTimeout(450); // Einfahren abwarten (0,34 s)
  return measure(page, kind);
};

for (const [theme, dark] of [['Casora', false], ['Casora', true], ['Casora Nebel', false]]) {
  const tag = theme + ' ' + (dark ? 'dunkel' : 'hell');
  const { page, browser } = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark, theme });
  usePage(page);
  await dashboard(page, phone.url, 3);
  // Einen Raum öffnen, damit es eine markierte Zeile gibt.
  await page.evaluate(() => { const nav = window.__pierce('casora-mobile-nav')[0]; const r = nav && nav._rooms && nav._rooms[0]; if (r) nav._set(r.key); });
  await page.waitForTimeout(1200);

  // ── Räume ──
  const m = await openSheet(page, 'rooms');
  await need(`${tag}: Räume als Blatt`, m && m.kind === 'rooms' && m.on, m);
  console.log(tag, 'Räume', JSON.stringify({ sheet: m.sheet, titleL: m.titleL, countR: m.countR, on: m.on, off: m.off, list: m.list }));
  await check(`${tag}: Blatt 8 px vom Rand links/rechts/unten`, near(m.sheet.left, 8) && near(m.sheet.right, 8) && near(m.sheet.bottom, 8), m.sheet);
  await check(`${tag}: Zeilen 8 px eingerückt (links = rechts)`, near(m.on.x, 8) && near(m.on.right, 8) && near(m.off.x, 8), [m.on, m.off]);
  await check(`${tag}: Ecken konzentrisch (Blatt ${m.sheet.radius} − 8 = Zeile ${m.on.radius})`, near(m.sheet.radius, 44, 0) && near(m.on.radius, m.sheet.radius - 8, 2), m);
  await check(`${tag}: Zeilen 64 px hoch (Trefferfläche ≥ 44)`, near(m.on.h, 64) && near(m.off.h, 64) && m.on.w >= 44, [m.on.h, m.off.h]);
  await check(`${tag}: Symbolkreis links = oben = Abstand zum Text`, near(m.on.icL, m.on.icTop) && near(m.on.icL, m.on.gap), m.on);
  await check(`${tag}: Symbolkreis konzentrisch zur Zeile (Pille)`, near(Math.min(m.on.radius, m.on.h / 2) - m.on.icL, m.on.icR, 2), m.on);
  await check(`${tag}: Symbol und Text springen nicht zwischen den Zeilen`, near(m.on.icL, m.off.icL) && near(m.on.txL, m.off.txL), [m.on, m.off]);
  await check(`${tag}: offene Zeile flächig hinterlegt`, m.on.bg !== m.off.bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(m.on.bg), [m.on.bg, m.off.bg]);
  await check(`${tag}: Überschrift fluchtet mit dem Symbolkreis, Anzahl mit dem Chevron`,
    near(m.titleL, m.on.x + m.on.icL) && near(m.countR, m.on.right + 12), { titleL: m.titleL, countR: m.countR });
  await check(`${tag}: Anzahl „${m.count}“`, new RegExp('^' + m.n + ' (Räume|Raum)$').test(m.count), m.count);
  // Viele Räume (arbeit: über zehn): letzte sichtbare Zeile angeschnitten.
  if (m.list.sh > m.list.ch + 1) {
    const rest = m.list.ch % 64;
    await check(`${tag}: viele Räume – letzte Zeile angeschnitten (${rest} px sichtbar)`, rest >= 16 && rest <= 48, m.list);
  }

  // Zustandszeile: Raum mit Lichtern und Temperatur, Zustände nur im Browser untergeschoben.
  if (!dark) {
    // Raum-Variablen kommen erst aus room_chips, dann vom Server (casora/phone_room_badges) – warten, bis sie stehen.
    let was = null;
    for (let i = 0; i < 10; i++) {
      const now = await page.evaluate(() => { const nav = window.__pierce('casora-mobile-nav')[0], ch = nav._chips();
        return JSON.stringify(nav._rooms.map((r) => window.casoraPhoneRoom && window.casoraPhoneRoom.vars(r.key, ch))); });
      if (now === was) break;
      was = now; await page.waitForTimeout(1200);
    }
    const pick = await page.evaluate(() => {
      const nav = window.__pierce('casora-mobile-nav')[0], h = nav._hass, PR = window.casoraPhoneRoom, ch = nav._chips();
      for (const r of nav._rooms) {
        const v = PR && PR.vars(r.key, ch);
        if (!v || !v.temp_sensor_1 || !h.states[v.temp_sensor_1]) continue;
        // Lichter zählen wie die Licht-Badge (casora_badge_light_group): eingetragene Lichter, sonst die
        // Mitglieder der Lichtgruppe; eine Gruppe aus Einzellichtern zählt als ein Licht.
        const mems = (e) => { const m = h.states[e] && (h.states[e].attributes || {}).entity_id; return Array.isArray(m) ? m.filter((x) => x.startsWith('light.')) : []; };
        let cfg = []; for (let n = 1; n <= 10; n++) if (v['light_entity_' + n]) cfg.push(v['light_entity_' + n]);
        if (!cfg.length && v.light_group_entity) cfg = mems(v.light_group_entity).length ? mems(v.light_group_entity) : [v.light_group_entity];
        const seen = new Set();
        const units = (e) => { if (!e || seen.has(e)) return []; const m = mems(e); if (!m.length || !m.some((x) => mems(x).length)) return [e]; seen.add(e); return m.flatMap(units); };
        const lights = [...new Set(cfg.flatMap(units))];
        if (lights.length) return { key: r.key, temp: v.temp_sensor_1, lights, more: [1, 2, 3, 4, 5].some((i) => i > 1 && v['temp_sensor_' + i]) };
      }
      return null;
    });
    await need(`${tag}: Raum mit Lichtern und Temperatur`, pick && !pick.more, pick);
    const sub = () => page.evaluate((k) => { const b = document.querySelector('.hmn-sheet .hmn-row[data-k="' + k + '"]'); return b ? b.querySelector('.hmn-sub').textContent : null; }, pick.key);
    const off = Object.fromEntries(pick.lights.map((e) => [e, { state: 'off' }]));
    await fakeStates(page, { ...off, [pick.temp]: { state: '21.6' } }, { sticky: true });
    await page.waitForTimeout(500);
    const s1 = await sub();
    await check(`${tag}: Zustandszeile „Alles aus · 22°“`, s1 === 'Alles aus · 22°', s1);
    await fakeStates(page, { ...off, [pick.lights[0]]: { state: 'on' }, [pick.temp]: { state: '21.6' } }, { sticky: true });
    await page.waitForTimeout(500);
    const s2 = await sub();
    await check(`${tag}: Zustandszeile „1 Licht an · 22°“ (live nachgezogen)`, s2 === '1 Licht an · 22°', s2);
    if (pick.lights.length > 1) {
      await fakeStates(page, { ...Object.fromEntries(pick.lights.map((e) => [e, { state: 'on' }])), [pick.temp]: { state: '21.6' } }, { sticky: true });
      await page.waitForTimeout(500);
      const s3 = await sub();
      await check(`${tag}: Zustandszeile „${pick.lights.length} Lichter an · 22°“`, s3 === pick.lights.length + ' Lichter an · 22°', s3);
    }
  }

  // ── Szenen ──
  const s = await openSheet(page, 'scenes');
  await need(`${tag}: Szenen als Blatt`, s && s.kind === 'scenes' && s.n >= 2, s);
  console.log(tag, 'Szenen', JSON.stringify({ sheet: s.sheet, first: s.first, second: s.second }));
  const a = s.first, b = s.second;
  await check(`${tag}: Szenen im 2er-Raster, 8 px Abstand und Rand`,
    near(a.x, 8) && near(b.right, 8) && near(a.w, b.w) && near(a.top, b.top) && near((s.vw - s.sheet.left - s.sheet.right) - a.w - b.w - 16, 8), [a, b]);
  await check(`${tag}: Kachel-Ecken konzentrisch (${s.sheet.radius} − 8 = ${a.radius}), Kreis ${a.icR} = ${a.radius} − ${a.icL}`,
    near(a.radius, s.sheet.radius - 8, 2) && near(a.icL, a.icTop) && near(a.radius - a.icL, a.icR, 2), a);
  await check(`${tag}: Kacheln farbig hinterlegt`, !/rgba\(0, 0, 0, 0\)|transparent/.test(a.bg), a.bg);
  await check(`${tag}: Kacheln groß genug (≥ 44 px)`, a.h >= 44 && a.w >= 44, [a.w, a.h]);
  if (s.third) await check(`${tag}: Kachelreihen 8 px Abstand`, near(s.third.top - a.bottom, 8), [a.bottom, s.third.top]);
  // Tipp-Rückmeldung (ohne auszulösen): pointerdown → abgedunkelt und kleiner.
  const press = await page.evaluate(async () => {
    const t = document.querySelector('.hmn-sheet .hmn-tile');
    t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    const cs = getComputedStyle(t), out = { transform: cs.transform, filter: cs.filter };
    t.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    return out;
  });
  const sc = /matrix\(([\d.]+)/.exec(press.transform || '');
  await check(`${tag}: Tipp dunkelt ab und schrumpft`, sc && +sc[1] < 0.99 && /brightness\(0?\.\d+\)/.test(press.filter), press);
  await page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._closeMenu());
  await page.waitForTimeout(500);
  // Hotfix 1.1.2: Die Leiste selbst bleibt wie in 1.1.0 – die Blatt-Regel für den Symbolkreis
  // (früher „.hmn-ic“) zog sie auf 40 px Höhe, rund und eingefärbt.
  const bar = await page.evaluate(() => {
    const b = document.querySelector('.hmn-bar'); if (!b) return null;
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    return { h: Math.round(r.height), radius: cs.borderTopLeftRadius, ic: b.classList.contains('hmn-ic') };
  });
  await check(`${tag}: Leiste unverändert (nicht 40 px, nicht 50 % rund)`, bar && bar.h > 44 && bar.radius !== '50%', bar);
  // Hotfix 1.1.2: Wischen nach unten schließt das Blatt – am Kopf und in der Liste, wenn sie oben steht;
  // Wischen auf dem Hintergrund scrollt die Seite nicht.
  const swipe = await page.evaluate(async () => {
    const nav = window.__pierce('casora-mobile-nav')[0];
    nav._bRooms.click();
    await new Promise((r) => setTimeout(r, 600));
    const m = document.querySelector('.hmn-menu.hmn-sheet.open'); if (!m) return { open: false };
    let T;
    try { new Touch({ identifier: 1, target: m, clientX: 1, clientY: 1 }); T = true; } catch (e) { T = false; }
    if (!T) return { open: true, touch: false };
    const fire = (el, type, y) => {
      const t = new Touch({ identifier: 1, target: el, clientX: 200, clientY: y });
      const ev = new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t], targetTouches: type === 'touchend' ? [] : [t] });
      el.dispatchEvent(ev); return ev.defaultPrevented;
    };
    const sc = document.querySelector('.hmn-scrim');
    fire(sc, 'touchstart', 300); const scrimBlocked = fire(sc, 'touchmove', 200); fire(sc, 'touchend', 200);
    const list = m.querySelector('.hmn-list'); list.scrollTop = 0;
    const row = m.querySelector('.hmn-row') || m;
    const y = row.getBoundingClientRect().top + 10;
    fire(row, 'touchstart', y);
    for (let i = 1; i <= 6; i++) { fire(row, 'touchmove', y + i * 25); await new Promise((r) => setTimeout(r, 16)); }
    fire(row, 'touchend', y + 150);
    await new Promise((r) => setTimeout(r, 500));
    return { open: true, touch: true, scrimBlocked, closed: !document.querySelector('.hmn-menu.open') };
  });
  if (swipe.touch === false) console.log('  info   ' + tag + ': Touch-Ereignisse in diesem Browser nicht nachstellbar – Wischen nicht geprüft');
  else {
    await check(`${tag}: Wischen auf dem Hintergrund scrollt die Seite nicht`, swipe.scrimBlocked === true, swipe);
    await check(`${tag}: Liste oben nach unten wischen schließt das Blatt`, swipe.closed === true, swipe);
  }
  await page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._closeMenu());
  await browser.close();
}
await finish();
