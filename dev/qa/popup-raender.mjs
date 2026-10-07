// Popup-Ränder: jedes Casora-Popup öffnen und messen, ob etwas abgeschnitten ist oder über den
// Rand ragt (Knöpfe, Pfeile, Schalter, Regler, Texte). Anlass 07.10.2026: abgeschnittene
// Kalender-Pfeile im Abfall-Popup, die im Theme „Hemma 2“ nie auffielen – deshalb misst das
// Werkzeug standardmäßig im Theme „Casora“ (Weich).
//
//   CASORA_URL=http://localhost:<port> node dev/qa/popup-raender.mjs [Optionen]
//     --dash <url_path>        Desktop-Dashboard (Standard: erstes Casora-Dashboard); Handy: <url>-mobile, falls da
//     --theme "Casora"         HA-Theme (Standard Casora)
//     --schemes hell,dunkel    Farbschemata
//     --views handy,handy-klein,ipad-quer,ipad-hoch,desktop,laptop   Ansichten (Standard alle)
//     --only <regex>           nur Popups, deren Schlüssel (Vorlage) passt
//     --settings '<json>'      Casora-Einstellungen nur im Browser ergänzen, z. B. Abfall mit Monatskalender:
//                              '{"waste":{"calendar_popup":true}}' (am HA ändert sich nichts)
//     --handy-raeume [n]       am Handy zusätzlich jeden Raum öffnen (Raumseite) und dort alle Kacheln/Badges
//                              antippen (n = höchstens so viele Räume; Standard alle). Anlass 07.10.2026:
//                              Popups aus Räumen (Pflanze, Geräte, Swipe-Karten …) wurden am Handy nie gemessen.
//     --json <datei>           Rohdaten schreiben
//     --shots <ordner>         je Fund ein Bild (--alle-bilder: von jedem Popup)
//
// Gemessen wird je offenem Popup (Casora-Popup bzw. sichtbarer HA-Dialog), durch alle Shadow-DOMs:
//  - jedes sichtbare Bedienelement (button, [role=button|switch|slider|tab|checkbox], input, Schalter,
//    Regler, a[href], ha-icon-button, oberstes Element mit cursor:pointer) und jeder Textblock muss
//    ganz in jedem abschneidenden Vorfahren liegen (overflow hidden/clip = sichtbarer Rahmen,
//    auto/scroll = Scrollbereich – was man hinscrollen kann, gilt nicht als abgeschnitten),
//    höchstens bis zum Popup-Rahmen und zum Fenster;
//  - Text: scrollWidth > clientWidth bei overflow hidden ohne Ellipsis/line-clamp = abgeschnitten;
//  - Bedienelemente dürfen sich nicht überlappen (ohne Verschachtelung);
//  - Handy: Trefferfläche < 44 px wird gezählt (Hinweis, kein Fehler).
// Rückgabe 1, wenn es Funde „abgeschnitten“ oder „Überlappung“ gibt.
import fs from 'node:fs';
import path from 'node:path';
import { tokens, ws } from './ws.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
process.env.CASORA_THEME = arg('theme', process.env.CASORA_THEME || 'Casora');
await tokens();
const H = await import('../e2e/harness.mjs');

const VIEWS = {
  handy: { width: 390, height: 844, mobile: true, safari: true, scale: 3, phone: true },
  'handy-klein': { width: 375, height: 667, mobile: true, safari: true, scale: 2, phone: true },
  'ipad-quer': { width: 1024, height: 768, safari: true, touch: true, scale: 2 },
  'ipad-hoch': { width: 768, height: 1024, safari: true, touch: true, scale: 2 },
  desktop: { width: 1600, height: 1000 },
  laptop: { width: 1280, height: 800 },
};
const views = (arg('views', Object.keys(VIEWS).join(','))).split(',').filter((v) => VIEWS[v]);
const schemes = arg('schemes', 'hell,dunkel').split(',');
const only = arg('only') ? new RegExp(arg('only')) : null;
const shotsDir = arg('shots');
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

// Dashboards: Desktop + Handy-Gegenstück.
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
const cfgs = {};
for (const d of list.filter((x) => x.mode === 'storage' && !/^dashboard-hemma/.test(x.url_path))) {
  try { cfgs[d.url_path] = await c.cmd({ type: 'lovelace/config', url_path: d.url_path }); } catch (e) { /* leer */ }
}
// Ein im Benutzerprofil gespeichertes Theme schlägt die Browser-Vorgabe – leeren.
try { await c.cmd({ type: 'frontend/set_user_data', key: 'theme', value: null }); } catch (e) { /* egal */ }
c.close();
const isCasora = (u) => cfgs[u] && /casora_room|casora_mobile/.test(JSON.stringify(cfgs[u]));
const desk = arg('dash') || Object.keys(cfgs).find((u) => !/-mobile$/.test(u) && isCasora(u));
if (!desk) { console.log('FAIL popup-raender – kein Casora-Dashboard'); process.exit(1); }
const phoneDash = cfgs[desk + '-mobile'] ? desk + '-mobile' : desk;
const viewPaths = (u) => (cfgs[u].views || []).map((v, i) => v.path || String(i));

// Kacheln, deren Antippen schaltet statt ein Popup zu öffnen, und Bedien-Knöpfe ohne Popup.
const SKIP = /^casora_(scene|script|button|toggle|switch_tap|favorite|room|menu_icon|settings_button|now_playing|nav|chip|mobile_(nav|room|filter))/;

// ── im Browser: Popup finden und messen ──────────────────────────────────────
const MEASURE = ({ phone }) => {
  const parentOf = (e) => e.assignedSlot || e.parentNode || (e.host || null);
  const up = (e) => { const p = parentOf(e); return p && p.nodeType === 11 ? p.host : p; };
  // Popup-Rahmen
  let frame = null, kind = '';
  const cp = window.casoraPopup && window.casoraPopup.surface;
  if (cp) { frame = cp; kind = 'casora'; }
  if (!frame) {
    for (const d of window.__pierce('ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog, ha-more-info-dialog, ha-voice-command-dialog')) {
      const sr = d.shadowRoot; const inner = sr && (sr.querySelector('dialog, .mdc-dialog__surface, [part~="dialog"], .surface, wa-dialog'));
      const el = inner || d; const r = el.getBoundingClientRect();
      if (r.width > 80 && r.height > 80) { frame = el; kind = d.tagName.toLowerCase(); break; }
    }
  }
  if (!frame) return null;
  const FR = frame.getBoundingClientRect();
  const all = [];
  (function walk(n) {
    for (const ch of (n.children || [])) { all.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); }
  })(frame.shadowRoot || frame);
  if (frame.shadowRoot) (function walk(n) { for (const ch of n.children) { all.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } })(frame);
  const seen = new Set(); const els = all.filter((e) => !seen.has(e) && seen.add(e));
  const vis = (e, r) => {
    if (r.width < 2 || r.height < 2) return false;
    if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    return true;
  };
  const csCache = new Map(); const cs = (e) => { let v = csCache.get(e); if (!v) { v = getComputedStyle(e); csCache.set(e, v); } return v; };
  const INTER = /^(BUTTON|INPUT|SELECT|TEXTAREA|HA-ICON-BUTTON|HA-SWITCH|HA-SLIDER|HA-CONTROL-SLIDER|HA-CONTROL-SWITCH|HA-CONTROL-BUTTON|HA-CHECKBOX|HA-RADIO|MWC-BUTTON|HA-BUTTON|HA-ASSIST-CHIP|HA-FILTER-CHIP|A)$/;
  const FA = FR.width * FR.height;
  const small = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height < FA * 0.2; };
  const realInter = (e) => {
    if (e.tagName === 'A' && !e.hasAttribute('href')) return false;
    if (INTER.test(e.tagName)) return true;
    const role = e.getAttribute && e.getAttribute('role');
    return /^(button|switch|slider|tab|checkbox|radio|menuitem)$/.test(role || '');
  };
  // cursor:pointer erbt sich (die ganze Popup-Karte zeigt oft die Hand): zählt nur, wo es neu
  // gesetzt ist (Eltern ohne Hand) und das Element nicht die halbe Fläche einnimmt.
  const isInter = (e) => {
    if (realInter(e)) return true;
    if (cs(e).cursor !== 'pointer' || !small(e)) return false;
    const p = up(e); return !(p && p.nodeType === 1 && cs(p).cursor === 'pointer');
  };
  // Verschachtelt: nur echte Bedienelemente (Tag/Rolle) schlucken ihren Inhalt.
  const insideInter = (e) => { for (let a = up(e), n = 0; a && a !== frame && n < 60; a = up(a), n++) if (a.nodeType === 1 && realInter(a)) return a; return null; };
  // Symbole (Pfeile, Icons) außerhalb von Bedienelementen zählen wie Bedienelemente.
  // Diagramme (große SVGs mit Rand für Achsen) zählen nicht – nur Symbole bis 64 px.
  const isIcon = (e) => { const r = e.getBoundingClientRect(); if (r.width > 64 || r.height > 64) return false;
    return /^(HA-ICON|HA-SVG-ICON|HA-STATE-ICON)$/.test(e.tagName) || (e.tagName.toLowerCase() === 'svg' && !(up(e) && /^(HA-SVG-ICON|svg)$/i.test(up(e).tagName))); };
  const ownText = (e) => { for (const n of e.childNodes) if (n.nodeType === 3 && n.data.trim()) return n.data.trim(); return ''; };
  const label = (e) => ((e.getAttribute && (e.getAttribute('aria-label') || e.getAttribute('title'))) || e.innerText || ownText(e) || (e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''))).replace(/\s+/g, ' ').trim().slice(0, 40);
  const path = (e) => { const p = []; for (let a = e, n = 0; a && a !== frame && n < 6; a = up(a), n++) if (a.nodeType === 1) p.unshift(a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (typeof a.className === 'string' && a.className.trim() ? '.' + a.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.join(' > '); };
  // Sichtbarer Bereich eines Elements: Schnitt aller abschneidenden Vorfahren bis zum Rahmen.
  const clipOf = (e) => {
    let L = -1e6, T = -1e6, R = 1e6, B = 1e6; let by = '';
    // Nach einem Scrollbereich zählen äußere Rahmen in dieser Richtung nicht mehr: der Inhalt wird
    // dort hingescrollt, nicht abgeschnitten.
    let sx = false, sy = false;
    const cut = (l, t, r, b, who) => {
      if (!sx) { if (l > L) { L = l; by = who; } if (r < R) { R = r; by = who; } }
      if (!sy) { if (t > T) { T = t; by = who; } if (b < B) { B = b; by = who; } } };
    for (let a = up(e), n = 0; a && n < 80; a = up(a), n++) {
      if (a.nodeType !== 1) continue;
      const s = cs(a);
      const ox = s.overflowX, oy = s.overflowY;
      if (ox !== 'visible' || oy !== 'visible' || a === frame) {
        const r = a.getBoundingClientRect();
        const bl = parseFloat(s.borderLeftWidth) || 0, bt = parseFloat(s.borderTopWidth) || 0;
        let l = r.left + bl, t = r.top + bt, rr = r.left + bl + a.clientWidth, bb = r.top + bt + a.clientHeight;
        if (!a.clientWidth && !a.clientHeight) { l = r.left; t = r.top; rr = r.right; bb = r.bottom; }
        // Scrollbar: was man hinscrollen kann, ist nicht abgeschnitten.
        if (/auto|scroll/.test(ox)) { l = r.left + bl - a.scrollLeft; rr = l + Math.max(a.scrollWidth, a.clientWidth); }
        if (/auto|scroll/.test(oy)) { t = r.top + bt - a.scrollTop; bb = t + Math.max(a.scrollHeight, a.clientHeight); }
        if (ox === 'visible') { l = -1e6; rr = 1e6; }
        if (oy === 'visible') { t = -1e6; bb = 1e6; }
        cut(l, t, rr, bb, path(a).split(' > ').pop());
        if (/auto|scroll/.test(ox)) sx = true;
        if (/auto|scroll/.test(oy)) sy = true;
      }
      if (a === frame) break;
    }
    // Zuletzt das Fenster (nicht in Richtungen, in denen ein Scrollbereich liegt).
    cut(0, 0, innerWidth, innerHeight, 'Fenster');
    return { L, T, R, B, by };
  };
  const ht = frame.querySelector && frame.querySelector('.header-title');
  const out = { title: ht ? ht.textContent.trim().slice(0, 40) : '', kind, frame: [FR.left, FR.top, FR.width, FR.height].map(Math.round), cut: [], text: [], overlap: [], small: [], counts: { inter: 0, text: 0 } };
  const inters = [];
  for (const e of els) {
    if (e.nodeType !== 1 || /^(STYLE|SCRIPT|SLOT|TEMPLATE)$/.test(e.tagName) || (e instanceof SVGElement && e.tagName.toLowerCase() !== 'svg')) continue;
    const r = e.getBoundingClientRect();
    if (!vis(e, r)) continue;
    const s = cs(e);
    if (s.position === 'fixed' && e !== frame) continue;
    const inter = (isInter(e) || isIcon(e)) && !insideInter(e);
    const txt = !inter && ownText(e) && !insideInter(e);
    if (!inter && !txt) continue;
    // Gerade in Bewegung (Animation/Übergang): Momentaufnahme überspringen.
    let moving = false;
    // Nur kurze, endliche Animationen, die noch höchstens 2 s laufen (Ein-/Ausblenden) – Dauerläufer
    // (Pulsieren, Lade-Schimmer) mit vielen Wiederholungen zählen nicht als Bewegung.
    const short = (x) => { if (x.playState !== 'running' || !x.effect || !x.effect.getComputedTiming) return false;
      const t = x.effect.getComputedTiming(); if (!isFinite(t.endTime) || t.iterations > 3) return false;
      return (t.endTime - (t.localTime || 0)) < 2000; };
    for (let a = e, n = 0; a && a !== frame && n < 30; a = up(a), n++) if (a.nodeType === 1 && a.getAnimations && a.getAnimations().some(short)) { moving = true; out.counts.moving = (out.counts.moving || 0) + 1; break; }
    if (moving) continue;
    if (inter) { out.counts.inter++; inters.push({ e, r }); } else out.counts.text++;
    // Inhalt („Tinte“) statt Box für Texte
    let box = r;
    // (bei Ellipsis zählt der Kasten – der Text endet sichtbar mit „…“)
    const ell = s.textOverflow === 'ellipsis' && s.overflowX !== 'visible';
    if (txt && !ell) { const rg = document.createRange(); rg.selectNodeContents(e); const q = rg.getBoundingClientRect(); if (q.width > 0) box = q; }
    const cl = clipOf(e);
    // Ganz außerhalb (z. B. hinausgeschobene Seite eines Karussells): nicht sichtbar, kein Anschnitt.
    const fullyOut = box.right <= cl.L + 1 || box.left >= cl.R - 1 || box.bottom <= cl.T + 1 || box.top >= cl.B - 1;
    const over = { l: cl.L - box.left, t: cl.T - box.top, r: box.right - cl.R, b: box.bottom - cl.B };
    // Texte: Zeilenkasten großer Schrift ragt oben/unten etwas über die Zeilenhöhe (Schriftmetrik,
    // keine sichtbare Kante) – senkrecht erst ab einem Viertel der Schriftgröße werten.
    if (txt) { const tol = Math.max(2, (parseFloat(s.fontSize) || 14) * 0.25); over.t -= tol; over.b -= tol; }
    const worst = Math.max(over.l, over.t, over.r, over.b);
    if (!fullyOut && worst > 1.5) {
      const side = Object.entries(over).sort((a, b) => b[1] - a[1])[0][0];
      out.cut.push({ what: inter ? 'Bedienelement' : 'Text', label: label(e), px: Math.round(worst), side, by: cl.by, path: path(e),
        at: [box.left, box.top, box.width, box.height].map(Math.round) });
    }
    // Text, der in seinem eigenen Kasten abgeschnitten wird (ohne Ellipsis/Zeilenbegrenzung).
    if (txt && /hidden|clip/.test(s.overflowX) && e.scrollWidth > e.clientWidth + 1 && s.textOverflow !== 'ellipsis' && s.webkitLineClamp === 'none' && !(parseInt(s.webkitLineClamp) > 0)) {
      out.text.push({ label: label(e), sw: e.scrollWidth, cw: e.clientWidth, path: path(e) });
    }
    // Trefferfläche: unsichtbarer Rand per ::before/::after (position:absolute mit negativem inset) zählt mit.
    let hw = r.width, hh = r.height;
    if (phone && inter) for (const pe of ['::before', '::after']) {
      const p = getComputedStyle(e, pe);
      if (p.content === 'none' || p.position !== 'absolute') continue;
      const v = (k) => Math.max(0, -(parseFloat(p[k]) || 0));
      hw = Math.max(hw, r.width + v('left') + v('right')); hh = Math.max(hh, r.height + v('top') + v('bottom'));
    }
    if (phone && inter && isInter(e) && (hw < 44 || hh < 44)) out.small.push({ label: label(e), w: Math.round(r.width), h: Math.round(r.height), path: path(e) });
  }
  // Überlappung zweier Bedienelemente (keins im anderen).
  const contains = (a, b) => { for (let x = b, n = 0; x && n < 80; x = up(x), n++) if (x === a) return true; return false; };
  for (let i = 0; i < inters.length; i++) for (let j = i + 1; j < inters.length; j++) {
    const A = inters[i].r, B = inters[j].r;
    const w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
    if (w <= 2 || h <= 2) continue;
    if (contains(inters[i].e, inters[j].e) || contains(inters[j].e, inters[i].e)) continue;
    // Nur, wenn beide an der Stelle sichtbar sind (nicht eins unter einer Ebene versteckt).
    const cx = Math.max(A.left, B.left) + w / 2, cy = Math.max(A.top, B.top) + h / 2;
    out.overlap.push({ a: label(inters[i].e), b: label(inters[j].e), w: Math.round(w), h: Math.round(h), at: [Math.round(cx), Math.round(cy)] });
  }
  return out;
};

const popupKey = (t) => t.filter((x) => /^casora_/.test(x) && x !== 'casora_entity' && x !== 'casora_default').join('+');

async function popupOpen(page) {
  return page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface) || window.__pierce('ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog, ha-more-info-dialog, ha-voice-command-dialog').some((d) => { const r = d.getBoundingClientRect(); return r.width > 80 && r.height > 80; }));
}
async function closeAll(page) {
  for (let i = 0; i < 3 && await popupOpen(page); i++) {
    await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(500);
  }
}

// Liegt die Kachel an ihrer Mitte obenauf (nicht unter der Raumseite verdeckt)?
const onTop = (page, i, at) => page.evaluate(([i, x, y]) => { const b = window.__pierce('button-card')[i]; let e = document.elementFromPoint(x, y);
  while (e && e.shadowRoot) { const d = e.shadowRoot.elementFromPoint(x, y); if (!d || d === e) break; e = d; }
  for (let a = e, n = 0; a && n < 80; n++) { if (a === b) return true; a = a.assignedSlot || a.parentNode || a.host; if (a && a.nodeType === 11) a = a.host; }
  return false; }, [i, at.x, at.y]).catch(() => false);
// Raumseite offen halten (Escape beim Schließen eines Popups darf sie nicht mitnehmen).
const ensureRoom = async (page, room) => {
  const shown = () => page.evaluate((k) => window.__pierce('casora-filter-overlay').some((o) => o._config && o._config.filter_category === k && o._showing), room).catch(() => false);
  if (await shown()) return true;
  await page.evaluate((k) => window._casoraFilter && window._casoraFilter.set(k), room).catch(() => {});
  await page.waitForTimeout(2500);
  return shown();
};

const results = [];
const stamp = Date.now();
for (const scheme of schemes) for (const vn of views) {
  const V = VIEWS[vn];
  const o = await H.open({ ...V, dark: scheme === 'dunkel' });
  await o.context.addInitScript(() => { window.CASORA_QA_NO_WELLE_AUTO = true; });
  const page = o.page;
  const dash = V.phone ? phoneDash : desk;
  const done = new Set(); const dead = new Set();
  let themeOk = null;
  // Durchgänge: jede Ansicht, am Handy mit --handy-raeume danach jeder Raum der ersten Ansicht.
  const passes = viewPaths(dash).map((v) => ({ v, room: null }));
  const roomArg = process.argv.indexOf('--handy-raeume');
  if (V.phone && roomArg > 0) {
    await H.ready(page, '/' + dash + '/' + passes[0].v, "() => !!window._casoraFilter && window.__pierce('button-card').length >= 3", 60000).catch(() => {});
    // Die Raumleiste baut sich nach den Kacheln auf: kurz warten.
    await page.waitForTimeout(2500);
    const keys = [...await page.evaluate(() => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._set === 'function' && e._bar);
      return n ? n._rooms.map((r) => r.key).filter((k) => /^room_/.test(k) && k !== 'room_scenes') : []; }).catch(() => [])];
    console.log(`  info   ${vn}: Räume ${keys.join(', ') || '(keine)'}`);
    const lim = parseInt(process.argv[roomArg + 1], 10);
    for (const k of keys.slice(0, lim > 0 ? lim : keys.length)) passes.push({ v: passes[0].v, room: k });
  }
  for (const { v, room } of passes) {
    if (room) await page.evaluate(() => { try { localStorage.setItem('casora_mobile_filter', 'all'); } catch (e) { /* leer */ } }).catch(() => {});
    await H.ready(page, '/' + dash + '/' + v, "() => window.__pierce('button-card').length >= 3", 60000).catch(() => {});
    await page.waitForTimeout(2500);
    if (room) {
      await page.evaluate((k) => window._casoraFilter && window._casoraFilter.set(k), room);
      await page.waitForTimeout(3000);
      if (!await ensureRoom(page, room)) { console.log(`  info   ${vn}: Raum ${room} öffnet nicht`); continue; }
    }
    const pre = room ? room.replace(/^room_/, '') + '/' : '';
    if (themeOk === null) themeOk = await page.evaluate(() => { const ha = document.querySelector('home-assistant'); return { theme: ha.hass.selectedTheme && ha.hass.selectedTheme.theme, active: ha.hass.themes.theme, dark: ha.hass.themes.darkMode, bg: getComputedStyle(document.documentElement).getPropertyValue('--primary-background-color').trim() }; });
    // Sammel-Badges aufklappen (Unter-Badges öffnen die Popups) – nacheinander je Gruppe.
    const groups = await page.evaluate(() => window.__pierce('button-card').map((b, i) => ({ i, t: [].concat((b._config || {}).template || []) })).filter((x) => x.t.some((t) => /^casora_badge_\w+_group$/.test(t) && !/lock_group|camera_group|contact_group/.test(t))).map((x) => x.i));
    for (const gi of [null, ...groups]) {
      if (gi !== null) {
        const at = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, gi);
        if (!at) continue;
        if (room && !await onTop(page, gi, at)) continue;
        await page.mouse.click(at.x, at.y); await page.waitForTimeout(1500);
        if (await popupOpen(page)) { await closeAll(page); if (room) await ensureRoom(page, room); } // Gruppe ohne Unter-Badges öffnet gleich das Popup (wird unten gemessen)
      }
      const tiles = await page.evaluate(() => window.__pierce('button-card').map((b, i) => {
        const t = [].concat((b._config || {}).template || []); const r = b.getBoundingClientRect();
        const e = (b._config || {}).entity || ''; return { i, t, e: e.split('.')[0], w: r.width, h: r.height };
      }).filter((c) => c.w > 20 && c.h > 20 && c.t.some((x) => /^casora_/.test(x))));
      for (const tile of tiles) {
        const key0 = popupKey(tile.t);
        if (!key0 || SKIP.test(key0)) continue;
        const key = (room ? 'raum/' : '') + key0 + (/badge_security$|badge_light$|media$/.test(key0) && tile.e ? ':' + tile.e : '');
        if (done.has(key) || dead.has(key) || (only && !only.test(key))) continue;
        if (/_group$/.test(key0) && !/lock_group|camera_group|contact_group/.test(key0)) {
          // Sammel-Badge selbst: öffnet nur ohne Unter-Badges ein Popup – ausprobieren.
        }
        const at = await page.evaluate((i) => { const b = window.__pierce('button-card')[i]; if (!b) return null;
          b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
          return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; }, tile.i);
        if (!at) continue;
        if (room) { await page.waitForTimeout(250); if (!await onTop(page, tile.i, at)) continue; }
        if (arg('settings')) await page.evaluate((x) => { const S = window.CASORA_SETTINGS || {}; const n = { ...S };
          for (const [k, v] of Object.entries(x)) n[k] = (v && typeof v === 'object') ? { ...(S[k] || {}), ...v } : v; window.CASORA_SETTINGS = n; }, JSON.parse(arg('settings')));
        await page.waitForTimeout(300);
        if (V.phone || V.touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
        let opened = false;
        for (let t0 = Date.now(); Date.now() - t0 < 3000; await page.waitForTimeout(200)) if (await popupOpen(page)) { opened = true; break; }
        if (!opened) { dead.add(key); if (process.env.QA_DEBUG) console.log("  (öffnet nicht) " + key); continue; }
        done.add(key);
        // Warten, bis das Popup steht (Öffnen-Animation, nachgeladene Inhalte).
        // Spalten werden nach dem Öffnen ausgeglichen und Zeilen nachgeladen: warten, bis Höhe und
        // Anzahl der Elemente 800 ms gleich bleiben (höchstens 6 s).
        const sig = () => { const s = window.casoraPopup && window.casoraPopup.surface; const c = s && s.querySelector('.content');
          return c ? c.scrollHeight + ':' + c.scrollWidth + ':' + s.getBoundingClientRect().height : String(Date.now() % 7); };
        let last = '', since = Date.now();
        for (const t0 = Date.now(); Date.now() - t0 < 6000; await page.waitForTimeout(150)) {
          const k = await page.evaluate(sig).catch(() => ''); if (k !== last) { last = k; since = Date.now(); } else if (Date.now() - since > 800) break;
        }
        await page.waitForTimeout(400);
        const measure = () => page.evaluate(MEASURE, { phone: !!V.phone }).catch((e) => ({ error: String(e), cut: [], text: [], overlap: [], small: [] }));
        let m = await measure();
        // Nur Funde, die nach einer weiteren Pause noch genauso da sind (sonst Momentaufnahme).
        if (m && (m.cut.length || m.text.length || m.overlap.length)) {
          await page.waitForTimeout(1500);
          const m2 = await measure();
          const same = (a, b, k) => a.filter((x) => b.some((y) => k(x) === k(y)));
          m.cut = same(m.cut, m2.cut, (x) => x.label + x.side + x.px);
          m.text = same(m.text, m2.text, (x) => x.label + x.sw);
          m.overlap = same(m.overlap, m2.overlap, (x) => x.a + x.b + x.w + x.h);
        }
        const row = { scheme, view: vn, page: v, room: room || undefined, key, ...(m || { error: 'kein Popup' }) };
        if (shotsDir && m && (process.argv.includes('--alle-bilder') || m.cut.length || m.text.length || m.overlap.length)) {
          row.shot = path.join(shotsDir, `${vn}_${scheme}_${key.replace(/[^\w-]+/g, '_')}.jpg`.slice(0, 120));
          // Unten abgeschnitten: ans Ende scrollen – zeigt, ob man es erreichen kann.
          if (m.cut.some((x) => x.side === 'b')) await page.evaluate(() => { const c = window.casoraPopup && window.casoraPopup.surface && window.casoraPopup.surface.querySelector('.content'); if (c) c.scrollTop = c.scrollHeight; });
          await page.waitForTimeout(400);
          await page.screenshot({ path: row.shot, type: 'jpeg', quality: 55 });
        }
        results.push(row);
        const n = m ? (m.cut.length + m.text.length + m.overlap.length) : -1;
        console.log(`  ${n ? 'FUND  ' : 'ok    '} ${scheme}/${vn} ${pre}${key}` + (n > 0 ? ` – ${m.cut.length} abgeschnitten, ${m.text.length} Text, ${m.overlap.length} Überlappung` : ''));
        await closeAll(page);
        if (room && !await ensureRoom(page, room)) break;
      }
    }
  }
  console.log(`  info   ${scheme}/${vn}: Theme ${JSON.stringify(themeOk)}, ${done.size} Popups`);
  results.push({ scheme, view: vn, theme: themeOk, popups: [...done] });
  await o.browser.close();
}
const json = arg('json');
if (json) fs.writeFileSync(json, JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.cut && (r.cut.length || r.overlap.length));
if (!results.some((r) => r.key)) { console.log('FAIL popup-raender – kein Popup geöffnet'); process.exit(1); }
console.log(`${bad.length ? 'FAIL' : 'PASS'} popup-raender – ${results.filter((r) => r.key).length} Messungen, ${bad.length} mit Fund (${Math.round((Date.now() - stamp) / 1000)} s)`);
process.exit(bad.length ? 1 : 0);
