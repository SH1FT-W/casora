// @zustand: arbeit
// @parallel: ui
// Wunsch (08.10.2026, Richtung C „Leicht“ für 1.1.3): Räume- und Szenen-Menü der Handy-Leiste kommen als
// Blatt von unten wie ein Casora-Handy-Popup. Erwartet (Casora hell und dunkel, Casora Nebel hell, iPhone 393 × 852):
// Seit 08.10.2026 abends schwebendes Fenster über der Leiste (Breite nach Inhalt, mittig, ringsum rund 28, höchstens 520 hoch,
// kein Griff, Leiste bleibt sichtbar) statt ganzflächigem Blatt.
// Titel mittig mit Etikett „10 RÄUME“ (12/700 Versalien). Zeilen 52 px ohne Platten, Symbolkreis 36 in Sand mit
// dunkler Glyphe, Name 15/600, Zustand rechts als kleiner Wert (13 px). Nur der offene Raum hat eine Fläche
// (--casora-entity-background-active, Kreis in Ton). Zeilen 8 px vom Fensterrand (links = rechts), Kreis links =
// oben = Abstand zum Text (8), Pille konzentrisch zum Kreis, Symbol/Text springen zwischen den Zeilen nicht.
// Rechts je Raum die Temperatur, davor das Auffälligste (08.10.2026): „Fenster offen“ (orange) vor „Licht an“ vor „Feucht · 70 %“.
// Szenen: dieselben Zeilen, Kreis in der Studio-Farbe der Szene wie am Desktop (eigene Farbe, sonst die
// Standard-Szenenfarbe --casora-scene-badge-color wie casora_badge_scene/casora_scenes), weiße Glyphe.
// Viele Räume: Liste scrollt, letzte sichtbare Zeile angeschnitten, offener Raum in der Mitte. Leiste bleibt
// unverändert und ist ausgeblendet, solange das Blatt offen ist. Wischen nach unten schließt, Hintergrund scrollt nicht.
import { open, casoraDashboards, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const phone = (process.env.CASORA_QA_DASH && all.find((d) => d.mobile && d.url === process.env.CASORA_QA_DASH)) || all.find((d) => d.mobile);
await need('Handy-Dashboard', phone);

const near = (a, b, t = 1) => a != null && b != null && Math.abs(a - b) <= t;
const clear = (c) => /rgba\(0, 0, 0, 0\)|transparent/.test(c || '');

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
    const sub = b.querySelector('.hmn-sub'), s = sub && sub.style.display !== 'none' ? R(sub) : null, nm = b.querySelector('.hmn-name');
    return { x: r.left - sr.left, right: sr.right - r.right, w: r.width, h: r.height, top: r.top, bottom: r.bottom,
      radius: parseFloat(cs(b).borderTopLeftRadius), icL: i.left - r.left, icTop: i.top - r.top, icW: i.width, icH: i.height,
      icR: /%$/.test(cs(ic).borderTopLeftRadius) ? i.width * parseFloat(cs(ic).borderTopLeftRadius) / 100 : parseFloat(cs(ic).borderTopLeftRadius),
      gap: t.left - i.right, txL: t.left - r.left, bg: cs(b).backgroundColor, shadow: cs(b).boxShadow, icBg: cs(ic).backgroundColor, icColor: cs(ic).color,
      fs: parseFloat(cs(nm).fontSize), fw: +cs(nm).fontWeight, sub: sub ? sub.textContent : '', subR: s ? r.right - s.right : null,
      subFs: sub ? parseFloat(cs(sub).fontSize) : null, subMidY: s ? (s.top + s.height / 2) - (r.top + r.height / 2) : null,
      key: b.getAttribute('data-k'), name: nm ? nm.textContent : '', tone: b.classList.contains('hmn-tone') };
  };
  const grip = m.querySelector('.hmn-grip'), g = R(grip), title = m.querySelector('.hmn-title'), count = m.querySelector('.hmn-count');
  // Vergleichszeile: ein anderer Raum MIT Zustand (sonst misst die Zustands-Prüfung ins Leere – je nach Testhaus
  // hat der erste andere Raum weder Licht noch Temperatur).
  const hasSub = (x) => { const e = x.querySelector('.hmn-sub'); return !!e && e.style.display !== 'none' && e.textContent.trim() !== ''; };
  const on = list.querySelector('.hmn-item.on'), off = items.find((x) => !x.classList.contains('on') && hasSub(x)) || items.find((x) => !x.classList.contains('on'));
  const mid = (e) => R(e).left + R(e).width / 2 - (sr.left + sr.width / 2);
  const last = items.filter((b) => R(b).top < lr.bottom - 1).pop();
  return {
    kind, vw: innerWidth, vh: innerHeight,
    sheet: { left: sr.left, right: innerWidth - sr.right, bottom: innerHeight - sr.bottom, top: sr.top,
      radius: parseFloat(cs(m).borderTopLeftRadius), radiusBottom: parseFloat(cs(m).borderBottomLeftRadius), bg: cs(m).backgroundColor },
    grip: { w: g.width, h: g.height, top: g.top - sr.top, mid: mid(grip), bg: cs(grip).backgroundColor },
    title: title ? { mid: mid(title), fs: parseFloat(cs(title).fontSize), fw: +cs(title).fontWeight } : null,
    count: count ? { text: count.textContent, mid: mid(count), fs: parseFloat(cs(count).fontSize), fw: +cs(count).fontWeight, tt: cs(count).textTransform } : null,
    list: { top: lr.top, bottom: lr.bottom, ch: list.clientHeight, sh: list.scrollHeight, st: list.scrollTop },
    n: items.length, on: row(on), off: row(off), first: row(items[0]), second: row(items[1]),
    lastVisible: last ? lr.bottom - R(last).top : null,
    onMid: on ? (R(on).top + R(on).height / 2) - (lr.top + lr.height / 2) : null,
    tones: items.map((b) => b.classList.contains('hmn-tone')),
    bar: (() => { const b = document.querySelector('.hmn-bar'); if (!b) return null; return { op: cs(b).opacity, under: b.classList.contains('hmn-under') }; })(),
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

const geometry = async (tag, m, what) => {
  await check(`${tag}: ${what} Zeilen 8 px vom Fensterrand (links = rechts)`, near(m.first.x, 8) && near(m.first.right, 8) && near(m.second.x, 8) && near(m.second.right, 8), [m.first, m.second]);
  await check(`${tag}: ${what} Zeilen 52 px hoch (Trefferfläche ≥ 44)`, near(m.first.h, 52) && near(m.second.h, 52) && m.first.w >= 44, [m.first.h, m.second.h]);
  await check(`${tag}: ${what} Symbolkreis 36 px, links = oben = Abstand zum Text`,
    near(m.first.icW, 36) && near(m.first.icH, 36) && near(m.first.icL, m.first.icTop) && near(m.first.icL, m.first.gap) && near(m.first.icTop, (m.first.h - m.first.icH) / 2), m.first);
  await check(`${tag}: ${what} Pille konzentrisch zum Symbolkreis (${m.first.radius} − ${m.first.icL} = ${m.first.icR})`,
    near(Math.min(m.first.radius, m.first.h / 2) - m.first.icL, m.first.icR, 2), m.first);
  await check(`${tag}: ${what} Symbol und Text springen nicht zwischen den Zeilen`, near(m.first.icL, m.second.icL) && near(m.first.txL, m.second.txL), [m.first, m.second]);
  await check(`${tag}: ${what} Name 15/600`, near(m.first.fs, 15, 0.5) && m.first.fw >= 600 && near(m.second.fs, 15, 0.5), [m.first.fs, m.first.fw]);
};

// Wischen im Browser nachstellen: Hintergrund (Scrim), Liste oben, Kopf. Liefert { touch:false }, wenn der Browser keine Touch-Ereignisse kennt.
const swipeInPage = async () => {
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
    const closedList = !document.querySelector('.hmn-menu.open');
    // Noch einmal am Kopf.
    nav._bRooms.click();
    await new Promise((r) => setTimeout(r, 600));
    const m2 = document.querySelector('.hmn-menu.hmn-sheet.open'); if (!m2) return { open: true, touch: true, scrimBlocked, closedList, closedHead: null };
    const head = m2.querySelector('.hmn-head'), y2 = head.getBoundingClientRect().top + 10;
    fire(head, 'touchstart', y2);
    for (let i = 1; i <= 6; i++) { fire(head, 'touchmove', y2 + i * 25); await new Promise((r) => setTimeout(r, 16)); }
    fire(head, 'touchend', y2 + 150);
    await new Promise((r) => setTimeout(r, 500));
    return { open: true, touch: true, scrimBlocked, closedList, closedHead: !document.querySelector('.hmn-menu.open') };
  };
const swipeChecks = async (tag, swipe) => {
  if (swipe.touch === false) { console.log('  info   ' + tag + ': Touch-Ereignisse in diesem Browser nicht nachstellbar – Wischen nicht geprüft'); return; }
  await check(`${tag}: Wischen auf dem Hintergrund scrollt die Seite nicht`, swipe.scrimBlocked === true, swipe);
  await check(`${tag}: Liste oben nach unten wischen schließt das Blatt`, swipe.closedList === true, swipe);
  await check(`${tag}: Am Kopf nach unten wischen schließt das Blatt`, swipe.closedHead === true, swipe);
};

for (const [theme, dark] of [['Casora', false], ['Casora', true], ['Casora Nebel', false]]) {
  const tag = theme + ' ' + (dark ? 'dunkel' : 'hell');
  const { page, browser } = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark, theme });
  usePage(page);
  await dashboard(page, phone.url, 3);
  // Einen Raum öffnen, damit es eine markierte Zeile gibt.
  // Nicht fest warten (1,2 s reichten unter Last nicht, dann war keine Zeile markiert – Gate 1.1.2):
  // erst weiter, wenn die Leiste den Raum wirklich als offen führt.
  const roomKey = await page.evaluate(() => { const nav = window.__pierce('casora-mobile-nav')[0]; const r = nav && nav._rooms && nav._rooms[0]; if (r) nav._set(r.key); return r ? r.key : null; });
  await need(`${tag}: Leiste kennt Räume`, !!roomKey);
  await page.waitForFunction((k) => { const nav = window.__pierce('casora-mobile-nav')[0]; return !!nav && nav._cur() === k; }, roomKey, { timeout: 15000, polling: 200 }).catch(() => {});
  await page.waitForTimeout(400);

  // ── Räume ──
  const m = await openSheet(page, 'rooms');
  await need(`${tag}: Räume als Blatt`, m && m.kind === 'rooms' && m.on && m.off, m);
  console.log(tag, 'Räume', JSON.stringify({ sheet: m.sheet, grip: m.grip, title: m.title, count: m.count, on: m.on, off: m.off, list: m.list }));
  await check(`${tag}: Fenster schwebt mittig über der Leiste (Breite nach Inhalt, mind. 12 px seitlich)`, near(m.sheet.left, m.sheet.right) && m.sheet.left >= 11 && m.sheet.bottom > 60 && m.sheet.top > 100, m.sheet);
  await check(`${tag}: Fenster ringsum rund (28)`, near(m.sheet.radius, 28, 0) && near(m.sheet.radiusBottom, 28, 0), m.sheet);
  await check(`${tag}: Blatt deckend (kein durchscheinender Grund)`, !clear(m.sheet.bg), m.sheet.bg);
  await check(`${tag}: kein Griff (schwebendes Fenster)`, m.grip && m.grip.w === 0, m.grip);
  await check(`${tag}: Titel mittig 19/700, Etikett mittig 12/700 Versalien`,
    m.title && m.count && near(m.title.mid, 0) && near(m.title.fs, 19) && m.title.fw >= 700 && near(m.count.mid, 0) && near(m.count.fs, 12) && m.count.fw >= 700 && m.count.tt === 'uppercase', [m.title, m.count]);
  await check(`${tag}: Etikett „${m.count.text}“`, new RegExp('^' + m.n + ' (Räume|Raum)$').test(m.count.text), m.count.text);
  await geometry(tag, m, 'Räume:');
  await check(`${tag}: andere Zeilen ohne Platte, Kreis in Sand mit dunkler Glyphe (kein Ton)`,
    clear(m.off.bg) && !clear(m.off.icBg) && m.off.icBg !== m.on.icBg && m.off.icColor !== m.on.icColor, [m.off.bg, m.off.icBg, m.off.icColor, m.on.icBg]);
  await check(`${tag}: offener Raum flächig (Weiß) mit Kreis in Ton`, !clear(m.on.bg) && m.on.bg !== m.off.bg && !clear(m.on.icBg), [m.on.bg, m.off.bg, m.on.icBg]);
  if (m.off.sub) await check(`${tag}: Zustand rechts als kleiner Wert (13 px, 14 px vom Zeilenrand, mittig)`,
    m.off.subR != null && near(m.off.subR, 14) && near(m.off.subFs, 13) && near(m.off.subMidY, 0) && m.off.subFs < m.off.fs, m.off);
  else console.log('  info   ' + tag + ': kein Raum mit Hinweis rechts – Maße der Zustandsspalte nicht gemessen');
  await check(`${tag}: Leiste bleibt unter dem Fenster sichtbar`, m.bar && !m.bar.under && +m.bar.op === 1, m.bar);

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
        const sec = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v['security_entity_' + i]).filter((e) => e && e.startsWith('binary_sensor.') && h.states[e]);
        if (lights.length) return { key: r.key, temp: v.temp_sensor_1, lights, sec, hum: v.humidity_sensor || null, more: [1, 2, 3, 4, 5].some((i) => i > 1 && v['temp_sensor_' + i]) };
      }
      return null;
    });
    await need(`${tag}: Raum mit Lichtern und Temperatur`, pick && !pick.more, pick);
    const sub = () => page.evaluate((k) => { const b = document.querySelector('.hmn-sheet .hmn-row[data-k="' + k + '"]'); return b ? b.querySelector('.hmn-sub').textContent : null; }, pick.key);
    // Rechts immer die Temperatur, das Auffälligste davor (Fenster/Tür offen vor Licht an vor feuchter Luft).
    const calm = Object.fromEntries([...pick.sec.map((e) => [e, { state: 'off' }]), ...(pick.hum ? [[pick.hum, { state: '45' }]] : [])]);
    const off = { ...calm, ...Object.fromEntries(pick.lights.map((e) => [e, { state: 'off' }])) };
    await fakeStates(page, { ...off, [pick.temp]: { state: '21.6' } }, { sticky: true });
    await page.waitForTimeout(500);
    const s1 = await sub();
    await check(`${tag}: alles ruhig: rechts nur die Temperatur`, s1 === '22°', s1);
    await fakeStates(page, { ...off, [pick.lights[0]]: { state: 'on' }, [pick.temp]: { state: '21.6' } }, { sticky: true });
    await page.waitForTimeout(500);
    const s2 = await sub();
    await check(`${tag}: „Licht an“ (live nachgezogen)`, s2 === 'Licht an · 22°', s2);
    if (pick.lights.length > 1) {
      await fakeStates(page, { ...Object.fromEntries(pick.lights.map((e) => [e, { state: 'on' }])), [pick.temp]: { state: '21.6' } }, { sticky: true });
      await page.waitForTimeout(500);
      const s3 = await sub();
      await check(`${tag}: „${pick.lights.length} Lichter an“`, s3 === pick.lights.length + ' Lichter an · 22°', s3);
    }
    if (pick.sec.length) {
      await fakeStates(page, { ...off, [pick.lights[0]]: { state: 'on' }, [pick.sec[0]]: { state: 'on', attributes: { device_class: 'window' } } }, { sticky: true });
      await page.waitForTimeout(500);
      const s4 = await page.evaluate((k) => { const b = document.querySelector('.hmn-sheet .hmn-row[data-k="' + k + '"] .hmn-sub'); return b ? { t: b.textContent, warn: b.classList.contains('hmn-warn') } : null; }, pick.key);
      await check(`${tag}: offenes Fenster geht vor Licht und ist orange markiert`, s4 && /^Fenster offen( · \d+°)?$/.test(s4.t) && s4.warn, s4);
    }
  }

  // ── Viele Räume (nur im Browser: sechs zusätzliche Räume): scrollt, letzte Zeile angeschnitten, offener Raum mittig. ──
  await page.evaluate(() => {
    const nav = window.__pierce('casora-mobile-nav')[0];
    nav._closeMenu();
    nav._qaRooms = nav._rooms;
    nav._rooms = nav._rooms.slice(); // die Konfiguration ist eingefroren
    const base = nav._rooms[1];
    ['Hobbyraum', 'Gästezimmer', 'Kinderzimmer', 'Garage', 'Werkstatt', 'Garten'].forEach((n, i) => nav._rooms.push(Object.assign({}, base, { key: 'room_qa_' + i, label: n, name: n })));
    nav._set(nav._rooms[7].key);
  });
  await page.waitForTimeout(700);
  const v = await openSheet(page, 'rooms');
  await need(`${tag}: Blatt mit 16 Räumen`, v && v.kind === 'rooms' && v.n >= 16 && v.on, v);
  console.log(tag, 'viele', JSON.stringify({ list: v.list, lastVisible: v.lastVisible, onMid: v.onMid, sheetTop: v.sheet.top }));
  await check(`${tag}: viele Räume – Liste scrollt und bleibt im Bildschirm`, v.list.sh > v.list.ch + 1 && v.sheet.top >= 40, v.list);
  await check(`${tag}: viele Räume – letzte sichtbare Zeile angeschnitten (${v.lastVisible} px sichtbar)`, v.lastVisible != null && v.lastVisible >= 10 && v.lastVisible <= 44, v);
  await check(`${tag}: viele Räume – offener Raum in der Mitte der Liste`, near(v.onMid, 0, 30), v.onMid);
  await page.evaluate(() => {
    const nav = window.__pierce('casora-mobile-nav')[0];
    nav._closeMenu(); nav._rooms = nav._qaRooms; nav._set(nav._rooms[0].key);
  });
  await page.waitForTimeout(500);

  // ── Szenen: dieselben leichten Zeilen, Kreis in der Studio-Farbe (erste Szene mit eigener Farbe, Rest Standard). ──
  const colors = await page.evaluate(() => {
    let first = null;
    window.casoraSceneColor = (id) => { if (!first) first = id; return id === first ? 'var(--casora-color-blue, #5B8FC9)' : null; };
    // Desktop-Standardfarbe der Szenen (casora_badge_scene: --casora-scene-badge-color; casora_scenes: --casora-color-yellow) aufgelöst.
    const probe = (v) => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;width:1px;height:1px;background:' + v; document.body.appendChild(d); const c = getComputedStyle(d).backgroundColor; d.remove(); return c; };
    return { badge: probe('var(--casora-scene-badge-color, #C29CFF)'), yellow: probe('var(--casora-color-yellow, #FFCC00)'), blue: probe('var(--casora-color-blue, #5B8FC9)') };
  });
  const s = await openSheet(page, 'scenes');
  await need(`${tag}: Szenen als Blatt`, s && s.kind === 'scenes' && s.n >= 2, s);
  console.log(tag, 'Szenen', JSON.stringify({ sheet: s.sheet, first: s.first, second: s.second, tones: s.tones }));
  await check(`${tag}: Etikett „${s.count.text}“`, new RegExp('^' + s.n + ' (Szenen|Szene)$').test(s.count.text), s.count.text);
  // Szenen zeigen rechts, wann sie zuletzt liefen – wie die Szenen-Badges („Vor 5 Min.“, „Gestern“, „Noch nie“);
  // eine aktive Szene zeigt „Aktiv“.
  const agos = await page.evaluate(() => [...document.querySelectorAll('.hmn-sheet .hmn-sub[data-sid]')].map((e) => ({ t: e.textContent.trim(), w: e.getBoundingClientRect().width })));
  await check(`${tag}: Szenen mit „zuletzt ausgeführt“ rechts`, agos.length === s.n && agos.every((a) => a.w > 0 && /^(Aktiv|Gerade eben|Noch nie|Gestern|Vor \d+ (Min\.|Std\.|Tagen))$/.test(a.t)), agos.slice(0, 4));
  await geometry(tag, s, 'Szenen:');
  const white = (c) => /^rgb\(255, 255, 255\)|^rgba\(255, 255, 255/.test(c || '');
  await check(`${tag}: Szenen ohne Platte, Kreis exakt in der Desktop-Standardfarbe (${colors.badge}), weiße Glyphe`,
    clear(s.second.bg) && s.second.tone && s.second.icBg === colors.badge && s.second.icBg === colors.yellow && white(s.second.icColor), [s.second.bg, s.second.icBg, s.second.icColor, colors]);
  await check(`${tag}: Szene mit eigener Studio-Farbe: Kreis exakt in dieser Farbe (${colors.blue}), weiße Glyphe`,
    s.first.tone && s.first.icBg === colors.blue && white(s.first.icColor), [s.first.icBg, s.first.icColor, colors]);
  // Tipp-Rückmeldung wie die Popup-Zeilen (ohne auszulösen): pointerdown → Fläche hinterlegt und leicht kleiner.
  const press = await page.evaluate(async () => {
    const t = document.querySelector('.hmn-sheet .hmn-row');
    const before = getComputedStyle(t).backgroundColor;
    t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 260));
    const cs = getComputedStyle(t), out = { before, bg: cs.backgroundColor, transform: cs.transform };
    t.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
    return out;
  });
  const sc = /matrix\(([\d.]+)/.exec(press.transform || '');
  await check(`${tag}: Tipp hinterlegt die Zeile und schrumpft leicht`, sc && +sc[1] < 0.995 && press.bg !== press.before && !clear(press.bg), press);
  await page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._closeMenu());
  await page.waitForTimeout(500);
  // Hotfix 1.1.2: Die Leiste selbst bleibt wie in 1.1.0 – die Blatt-Regel für den Symbolkreis
  // (früher „.hmn-ic“) zog sie auf 40 px Höhe, rund und eingefärbt.
  const bar = await page.evaluate(() => {
    const b = document.querySelector('.hmn-bar'); if (!b) return null;
    const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
    const btn = (el) => { const q = el.getBoundingClientRect(), c = el.querySelector('.hmn-bic'), i = c.getBoundingClientRect(), g = c.firstElementChild, s = getComputedStyle(el), sp = el.querySelector(':scope>span:not(.hmn-bic)');
      return { x: q.left - r.left, w: q.width, h: q.height, radius: parseFloat(s.borderTopLeftRadius), bg: s.backgroundColor, shadow: s.boxShadow,
        icL: i.left - q.left, icTop: i.top - q.top, icW: i.width, icBg: getComputedStyle(c).backgroundColor, icColor: getComputedStyle(c).color,
        glyph: g ? g.getBoundingClientRect().width : null, glyphColor: g ? (g.classList.contains('hmn-svg') ? getComputedStyle(g).backgroundColor : getComputedStyle(g).color) : null,
        label: sp && getComputedStyle(sp).display !== 'none' ? { fs: parseFloat(getComputedStyle(sp).fontSize), fw: +getComputedStyle(sp).fontWeight, gap: sp.getBoundingClientRect().left - i.right, right: q.right - sp.getBoundingClientRect().right } : null }; };
    const on = b.querySelector('.hmn-btn.on'), off = b.querySelector('.hmn-btn:not(.on)');
    return { h: Math.round(r.height), radius: cs.borderTopLeftRadius, pad: parseFloat(cs.paddingLeft), ic: b.classList.contains('hmn-ic'), op: cs.opacity, under: b.classList.contains('hmn-under'),
      on: on ? btn(on) : null, off: off ? btn(off) : null };
  });
  await check(`${tag}: Leiste unverändert (nicht 40 px, nicht 50 % rund) und nach dem Schließen wieder da`, bar && bar.h > 44 && bar.radius !== '50%' && !bar.under && +bar.op === 1, bar);
  // Richtung 1 „Weiße Pille“ (08.10.2026): Platte 60/30, Innenrand 6, Tasten 48, Radius 24 = 30 − 6; ruhende Taste
  // mit Sand-Kreis 36 (wie die C-Zeile) und dunkler Glyphe 22; aktive Taste weiße Pille mit Ton-Kreis, weißer Glyphe,
  // Name 15/600, Kreis 6 px vom Rand (18 = 24 − 6, konzentrisch).
  console.log(tag, 'Leiste', JSON.stringify(bar));
  await check(`${tag}: Leiste 60/30, Innenrand 6, Tasten 48 mit Radius 24`, bar.ic && near(bar.h, 60) && bar.radius === '30px' && near(bar.pad, 6) && near(bar.on.h, 48) && near(bar.off.h, 48) && near(bar.on.radius, 24) && near(bar.off.radius, 24), bar);
  await check(`${tag}: ruhende Taste 58 breit, Sand-Kreis 36 mittig (wie die C-Zeile), dunkle Glyphe 22`,
    near(bar.off.w, 58) && near(bar.off.icW, 36) && near(bar.off.icL, (bar.off.w - 36) / 2) && near(bar.off.icTop, 6) && bar.off.icBg === m.off.icBg && near(bar.off.glyph, 22) && bar.off.glyphColor === m.off.icColor && clear(bar.off.bg), [bar.off, m.off.icBg]);
  await check(`${tag}: aktive Taste weiße Pille wie der offene Raum im Blatt, Kreis in Ton mit weißer Glyphe`,
    bar.on.bg === m.on.bg && bar.on.shadow === m.on.shadow && bar.on.icBg === m.on.icBg && /^rgb\(255, 255, 255\)/.test(bar.on.glyphColor), [bar.on, m.on.bg, m.on.icBg]);
  await check(`${tag}: aktive Taste konzentrisch (Kreis 6 px vom Rand = Radius 24 − 18), Name 15/600, 10 px nach dem Kreis, 18 px zum Rand`,
    near(bar.on.icL, 6) && near(bar.on.icTop, 6) && near(bar.on.radius - bar.on.icL, bar.on.icW / 2) && bar.on.label && near(bar.on.label.fs, 15) && bar.on.label.fw >= 600 && near(bar.on.label.gap, 10) && near(bar.on.label.right, 18), bar.on);
  // Hotfix 1.1.2: Wischen nach unten schließt das Blatt – am Kopf und in der Liste, wenn sie oben steht;
  // Wischen auf dem Hintergrund scrollt die Seite nicht.
  const swipe = await page.evaluate(swipeInPage);
  await swipeChecks(tag, swipe);
  await page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._closeMenu());
  await browser.close();
}

// Gesten in Chromium (WebKit kennt in Playwright keine Touch-Ereignisse): Wischen nach unten schließt,
// Hintergrund scrollt nicht.
{
  const tag = 'Casora hell (Chromium)';
  const { page, browser } = await open({ width: 393, height: 852, mobile: true, safari: false, scale: 2, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, phone.url, 3);
  await page.waitForFunction(() => { const nav = window.__pierce('casora-mobile-nav')[0]; return !!(nav && nav._hass && nav._bRooms); }, null, { timeout: 15000, polling: 200 }).catch(() => {});
  const swipe = await page.evaluate(swipeInPage);
  await need(`${tag}: Touch-Ereignisse nachstellbar`, swipe.touch !== false, swipe);
  await swipeChecks(tag, swipe);
  await page.evaluate(() => window.__pierce('casora-mobile-nav')[0]._closeMenu());
  await browser.close();
}
await finish();
