// Ausrichtung im Studio: Symbole in ihren Kreisen, Texte in Pillen/Knöpfen, Zeilen, Abstände, Radien.
// Anlass 08.10.2026 (Daniel): „Im Studio-UI Ausrichtungen überprüfen, manche Icons sind nicht in den
// Kreisen zentriert oder manche Texte“. Ergänzt popup-raender.mjs (abgeschnitten/überlappend) um die
// Geometrie-Qualität (siehe Design-Geometrie-Prüfung, Räume-Menü 07.10.2026).
//
//   CASORA_URL=http://localhost:<port> [CASORA_LOCAL=1] node dev/qa/ausrichtung.mjs [Optionen]
//     --dash <url_path>        Dashboard fürs Studio (Standard: erstes Casora-Dashboard)
//     --views desktop,tablet,handy        Ansichten (desktop 1440, tablet 1024, handy 393 WebKit)
//     --looks "Casora:hell,Casora:dunkel,Casora Nebel:hell"   Theme:Schema je Lauf
//     --only <regex>           nur Stationen, deren Name passt
//     --json <datei>           Funde als JSON (mit Bildpfaden)
//     --shots <ordner>         je Fund ein vergrößerter Ausschnitt (Kreuz = Mitte des Rahmens,
//                              Rahmen blau = gemessenes Teil); --alle-bilder: auch je Station ein Bild
//
// Gemessen wird im Studio-Panel (Shadow-DOM von casora-panel und eigenen casora-*-Elementen; HA-
// Bausteine wie Textfelder/Schalter nur von außen; verdeckte Teile – z. B. hinter einem Blatt – nicht), je Station:
//  - „Form“ = Knopf, [role=button|tab|menuitem|option], oder Element mit sichtbarem Hintergrund/Rand
//    und Rundung. In Knöpfen bis 64 px und sonstigen Formen bis 48 px Höhe stehen ihre Inhalte (Symbol,
//    Text, innere Formen; übereinanderliegende als ein Block, Texte auf einer Grundlinie als eine Zeile)
//    vertikal mittig: ±0,5 px, Block aus mehreren Zeilen ±1 px. Text zählt nur in sichtbaren Formen;
//    in Knöpfen ohne Fläche (Titel mit ⌄) richtet sich ein Symbol nach der Textzeile.
//  - Symbolkreis/Symbolknopf (nur Symbol, kein Text): Symbol auch waagrecht mittig ±0,5 px; bei eigenen
//    Inline-svgs zusätzlich die gezeichnete Form (Pfad) ±1 px (MDI-Symbole sind auf ihr Raster gezeichnet).
//  - Symbolkreise mit Fläche nebeneinander (Kopfzeile ‹ ⋯ ×) gleich groß ±1 px.
//  - Zeilen einer Liste (gleiche Geschwister, untereinander): Symbol links und Text links gleich ±0,5 px.
//  - Markierung/Segment (innere Form mit Hintergrund, füllt die äußere in einer Richtung ≥ 60 %, Abstand
//    ≤ 8 px): gegenüberliegende und anliegende Abstände gleich (±1 px), Radius = äußerer Radius minus
//    Abstand (±2 px). Kleinere Knöpfe in einer Karte: nicht am Rand kleben (< 2 px auf einer, > 6 px auf
//    der anderen Seite).
// Symbol = svg (bei ha-icon das innere svg), Maskensymbol (mask-image), kleines img (≤ 64 px).
// Rückgabe 1 bei Funden. Offene Geschmacks-/Dashboard-Fragen stehen in ERLAUBT – mit Begründung.
import fs from 'node:fs';
import path from 'node:path';
import { tokens, ws } from './ws.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
await tokens();
const H = await import('../e2e/harness.mjs');

const VIEWS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768, touch: true },
  handy: { width: 393, height: 852, mobile: true, safari: true, scale: 3 },
};
const views = arg('views', 'desktop,tablet,handy').split(',').filter((v) => VIEWS[v]);
const looks = arg('looks', 'Casora:hell,Casora:dunkel,Casora Nebel:hell').split(',').map((s) => {
  const [theme, scheme] = s.split(':'); return { theme, dark: scheme === 'dunkel', tag: theme + ' ' + (scheme || 'hell') };
});
const only = arg('only') ? new RegExp(arg('only'), 'i') : null;
const shotsDir = arg('shots');
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });

// Bewusste Ausnahmen: [Station-Regex, Fund-Regex (Art + Beschreibung), Begründung].
// Hier stehen nur Geschmacks-/Dashboard-Fragen, die bewusst offen sind – sie werden gezeigt, aber nicht als Fehler gezählt.
const ERLAUBT = [
  [/./, /pring|mp-back|mini-badges>button\.pbadge|mini-subs>span\.pbadge|mp-badges>button\.pbadge/,
    'Vorschau bildet die Maße des echten Dashboard-Badges/-Zurück-Knopfs nach (Symbolkreis links 6 statt 5 px, Zurück-Pfeil 2 px optisch versetzt) – Dashboard-Frage, offen'],
  [/./, /^groesse .*(rowmenu|bclose|back)/,
    'Kopfzeile des Inspektors: ⋯ bewusst kleiner als ✕ bzw. ‹ (Rangfolge) – Geschmacksfrage, offen'],
];

// ── Dashboard wählen ────────────────────────────────────────────────────────
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
let dash = arg('dash');
if (!dash) {
  for (const d of list.filter((x) => x.mode === 'storage' && !/^dashboard-hemma|-mobile$/.test(x.url_path))) {
    try { const cfg = await c.cmd({ type: 'lovelace/config', url_path: d.url_path });
      if (/casora_room/.test(JSON.stringify(cfg))) { dash = d.url_path; if (/^(mein-casora|test-neu)/.test(d.url_path)) break; } } catch (e) { /* leer */ }
  }
}
try { await c.cmd({ type: 'frontend/set_user_data', key: 'theme', value: null }); } catch (e) { /* egal */ }
c.close();
if (!dash) { console.log('FAIL ausrichtung – kein Casora-Dashboard'); process.exit(1); }

// ── im Browser: messen ──────────────────────────────────────────────────────
const MEASURE = () => {
  const p = window.__panel && window.__panel();
  if (!p || !p.shadowRoot) return { err: 'kein Panel' };
  const vw = innerWidth, vh = innerHeight;
  const up = (e) => e.parentElement || (e.parentNode && e.parentNode.host) || null;
  const DIVE = /^(CASORA-|HA-ICON$|HA-STATE-ICON$|HA-SVG-ICON$|IRON-ICON$|HA-DOMAIN-ICON$)/;
  // Vorschau-Kacheln/-Karten (echte Dashboard-Karten in der Vorschau) prüft das Dashboard, nicht das Studio.
  const NODIVE = /^(BUTTON-CARD|HUI-|HA-CARD$|CASORA-(MOBILE|ROOM|NAV)|HA-TEXTFIELD|HA-SELECT|HA-SWITCH|HA-SLIDER)/;
  const all = [];
  (function walk(r) {
    for (const e of r.querySelectorAll('*')) {
      all.push(e);
      if (e.shadowRoot && DIVE.test(e.tagName) && !NODIVE.test(e.tagName)) walk(e.shadowRoot);
    }
  })(p.shadowRoot);
  const css = new Map(); const cs = (e) => { let s = css.get(e); if (!s) { s = getComputedStyle(e); css.set(e, s); } return s; };
  const R = (e) => e.getBoundingClientRect();
  const alpha = (c) => { if (!c || c === 'transparent') return 0; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 1;
    const v = m[1].split(/[,\s/]+/).filter(Boolean); return v.length > 3 ? parseFloat(v[3]) : 1; };
  // sichtbar: Größe, im Fenster, nicht versteckt/durchsichtig, nicht von einem Rahmen abgeschnitten
  const vis = new Map();
  const visible = (e) => {
    if (vis.has(e)) return vis.get(e);
    const r = R(e); let ok = r.width >= 4 && r.height >= 4 && r.right > 0 && r.bottom > 0 && r.left < vw && r.top < vh;
    if (ok) { const s = cs(e); if (s.visibility === 'hidden' || s.display === 'none') ok = false; }
    if (ok) {
      let op = 1; const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      for (let a = e; a && a !== document.documentElement; a = up(a)) {
        if (a.nodeType !== 1) continue; const s = cs(a); op *= parseFloat(s.opacity || '1');
        if (s.display === 'none' || op < 0.3) { ok = false; break; }
        if (a !== e && /hidden|clip|auto|scroll/.test(s.overflow + s.overflowX + s.overflowY)) {
          const q = R(a); if (cx < q.left - 1 || cx > q.right + 1 || cy < q.top - 1 || cy > q.bottom + 1) { ok = false; break; }
        }
      }
    }
    // verdeckt (z. B. Studio hinter einem Blatt): Treffer an der Mitte gehört nicht zum Element
    if (ok) {
      const rt = e.getRootNode(); const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const hit = rt.elementFromPoint ? rt.elementFromPoint(Math.min(vw - 1, Math.max(0, cx)), Math.min(vh - 1, Math.max(0, cy))) : null;
      if (hit && !(hit === e || e.contains(hit) || hit.contains(e) || (hit.shadowRoot && hit.shadowRoot.contains(e)))) ok = false;
    }
    vis.set(e, ok); return ok;
  };
  const inSvg = (e) => { for (let a = up(e); a; a = up(a)) if (a.tagName && a.tagName.toLowerCase() === 'svg') return true; return false; };
  const isIcon = (e) => {
    const t = e.tagName.toLowerCase(); const r = R(e);
    if (t === 'svg') return !inSvg(e) && r.width <= 64 && r.height <= 64;
    if (t === 'img') return r.width <= 64 && r.height <= 64;
    if (/^(ha-icon|ha-state-icon|ha-svg-icon|iron-icon|ha-domain-icon)$/.test(t)) return false; // inneres svg zählt
    const s = cs(e); const m = s.maskImage || s.webkitMaskImage;
    return !!m && m !== 'none' && r.width <= 64 && r.height <= 64 && !e.children.length;
  };
  const ROLE = /^(button|tab|menuitem|menuitemradio|option|switch|link)$/;
  const shapeInfo = (e) => {
    const t = e.tagName.toLowerCase(); if (t === 'svg' || inSvg(e) || isIcon(e)) return null;
    const s = cs(e);
    const bg = alpha(s.backgroundColor) > 0.03 || (s.backgroundImage && s.backgroundImage !== 'none');
    const bw = parseFloat(s.borderTopWidth) || 0;
    const border = bw > 0 && alpha(s.borderTopColor) > 0.03 && s.borderTopStyle !== 'none';
    const btn = t === 'button' || ROLE.test(e.getAttribute('role') || '');
    const rad = parseFloat(s.borderTopLeftRadius) || 0;
    if (!(btn || ((bg || border) && rad > 0))) return null;
    if (s.display === 'contents' || /^(table|tr|td)$/.test(t)) return null;
    return { bg: bg || border, btn };
  };
  const shapes = new Map();
  for (const e of all) { const si = shapeInfo(e); if (si) shapes.set(e, si); }
  const shapeOf = (e) => { for (let a = up(e); a; a = up(a)) { if (a === p) return null; if (shapes.has(a)) return a; } return null; };
  const label = (e) => {
    const t = e.tagName.toLowerCase(); const cls = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
    const txt = (e.getAttribute('title') || e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return t + (e.id ? '#' + e.id : '') + (cls ? '.' + cls : '') + (txt ? ' „' + txt + '“' : '');
  };
  const pathOf = (e) => { const out = []; for (let a = e; a && a !== p && out.length < 6; a = up(a)) { if (a.nodeType !== 1) continue;
    const cls = (typeof a.className === 'string' ? a.className : '').trim().split(/\s+/).filter((c) => !/^(on|sel|active|open|hover|dim|has)$/.test(c))[0];
    out.unshift(a.tagName.toLowerCase() + (a.id ? '#' + a.id : cls ? '.' + cls : '')); } return out.join('>'); };
  const box = (r) => ({ x: +r.left.toFixed(2), y: +r.top.toFixed(2), w: +r.width.toFixed(2), h: +r.height.toFixed(2) });
  const inner = (e) => { const r = R(e), s = cs(e);
    return { left: r.left + (parseFloat(s.borderLeftWidth) || 0), right: r.right - (parseFloat(s.borderRightWidth) || 0),
      top: r.top + (parseFloat(s.borderTopWidth) || 0), bottom: r.bottom - (parseFloat(s.borderBottomWidth) || 0) }; };

  // Inhalte je Form: Symbole, Text, innere Formen
  const items = new Map(); const add = (s, it) => { if (!items.has(s)) items.set(s, []); items.get(s).push(it); };
  for (const e of all) {
    if (!visible(e)) continue;
    const s = shapeOf(e); if (!s) continue;
    const pos = cs(e).position;
    if (isIcon(e)) { add(s, { kind: 'Symbol', r: R(e), e, abs: pos === 'absolute' || pos === 'fixed' }); continue; }
    if (shapes.has(e)) { if (pos === 'absolute' || pos === 'fixed') continue; add(s, { kind: 'Form', r: R(e), e }); continue; }
  }
  // Text: direkte Textknoten je Element
  for (const e of all) {
    if (e.tagName.toLowerCase() === 'style' || e.tagName.toLowerCase() === 'script' || inSvg(e) || !visible(e)) continue;
    const tn = [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!tn.length) continue;
    const rects = [];
    for (const n of tn) { const rg = document.createRange(); rg.selectNodeContents(n); for (const q of rg.getClientRects()) if (q.width > 0.5 && q.height > 0.5) rects.push(q); }
    if (!rects.length) continue;
    const s = shapes.has(e) ? e : shapeOf(e); if (!s) continue;
    const u = { left: Math.min(...rects.map((q) => q.left)), right: Math.max(...rects.map((q) => q.right)), top: Math.min(...rects.map((q) => q.top)), bottom: Math.max(...rects.map((q) => q.bottom)) };
    u.width = u.right - u.left; u.height = u.bottom - u.top;
    const lines = new Set(rects.map((q) => Math.round(q.top))).size;
    const pos = cs(e).position;
    // abgeschnittener Text (Ellipsis) wird nicht gemessen
    add(s, { kind: 'Text', r: u, e, lines, abs: e !== s && (pos === 'absolute' || pos === 'fixed'), txt: tn.map((n) => n.textContent.trim()).join(' ').slice(0, 30) });
  }

  // Vorschau-Kacheln sind Karten (Symbol oben, Text unten), keine Pillen
  const SKIP = (e) => e.classList && e.classList.contains('mtile');
  const finds = [];
  const F = (kind, e, val, tol, msg, extra = {}) => finds.push({ kind, label: label(e), path: pathOf(e), val: +val.toFixed(2), tol, msg, box: box(R(e)), ...extra });

  // 1) Mitte in kleinen Formen
  for (const [s, its0] of items) {
    if (!visible(s) || SKIP(s)) continue;
    const sr = inner(s); const h = sr.bottom - sr.top; const si = shapes.get(s);
    // Knöpfe/Zeilen bis 64 px, sonstige Formen (Pillen, Kreise) bis 48 px; größere sind Karten.
    if (h > (si.btn ? 64 : 48) || h < 8) continue;
    // Reiner Text in Formen ohne Hintergrund wird nicht gemeldet (Textlink: Lage im Knopf sieht man nicht).
    const its = its0.filter((it) => !it.abs && it.r.top >= sr.top - 0.5 && it.r.bottom <= sr.bottom + 0.5 && it.r.left >= sr.left - 0.5 && it.r.right <= sr.right + 0.5);
    if (!its.length) continue;
    // waagrecht überlappende Inhalte = ein Block (übereinander)
    const sorted = [...its].sort((a, b) => a.r.left - b.r.left);
    const groups = [];
    // Texte auf einer Linie (gleiche Grundlinie, z. B. Titel + kleiner Zusatz) = ein Block
    const ov = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    for (const it of sorted) {
      const g = groups.find((x) => (it.r.left < x.right - 1 && it.r.right > x.left + 1)
        || (it.kind === 'Text' && x.its.every((y) => y.kind === 'Text' && y.lines === 1) && it.lines === 1 && ov(it.r, x) > 0.5 * Math.min(it.r.height, x.bottom - x.top)));
      if (g) { g.its.push(it); g.left = Math.min(g.left, it.r.left); g.right = Math.max(g.right, it.r.right); g.top = Math.min(g.top, it.r.top); g.bottom = Math.max(g.bottom, it.r.bottom); }
      else groups.push({ its: [it], left: it.r.left, right: it.r.right, top: it.r.top, bottom: it.r.bottom });
    }
    const cy0 = (sr.top + sr.bottom) / 2, cx = (sr.left + sr.right) / 2;
    // Knopf ohne sichtbare Fläche (Titel mit ⌄): ein Symbol gehört zur Textzeile, nicht zur Knopfmitte
    const tg = !si.bg && groups.find((g) => g.its.every((x) => x.kind === 'Text'));
    for (const g of groups) {
      const cy = tg && g.its.every((x) => x.kind === 'Symbol') ? (tg.top + tg.bottom) / 2 : cy0;
      if (!si.bg && g.its.every((x) => x.kind === 'Text')) continue;
      // übereinander (Titel + Untertitel) bzw. mehrzeilig: ±1 px; auf einer Linie: ±0,5 px
      const multi = g.its.some((x) => x.lines > 1) || g.its.some((x, i) => g.its.some((y, j) => j > i && ov(x.r, y.r) <= 0.5 * Math.min(x.r.height, y.r.height)));
      const off = (g.top + g.bottom) / 2 - cy;
      const tol = multi ? 1 : 0.5;
      if (Math.abs(off) > tol + 0.01) {
        const what = g.its.length > 1 ? 'Block (' + g.its.map((x) => x.kind).join('+') + ')' : g.its[0].kind + (g.its[0].txt ? ' „' + g.its[0].txt + '“' : '');
        F('vertikal', s, off, tol, what + ' sitzt ' + Math.abs(off).toFixed(1) + ' px zu ' + (off > 0 ? 'tief' : 'hoch'),
          { item: box({ left: g.left, top: g.top, width: g.right - g.left, height: g.bottom - g.top }), inner: box({ left: sr.left, top: sr.top, width: sr.right - sr.left, height: h }) });
      }
    }
    // waagrecht nur, wenn die Form gar keinen Text hat (Symbolkreis, Symbolknopf)
    if (groups.length === 1 && groups[0].its.every((x) => x.kind === 'Symbol') && !its0.some((x) => x.kind !== 'Symbol' && !x.abs)) {
      const g = groups[0], cy = cy0; const off = (g.left + g.right) / 2 - cx;
      // Gezeichnete Form des Symbols (Pfad) im Kreis: ein Pfad, der in seiner viewBox schief liegt,
      // sieht trotz mittiger Box schief aus. Nur Kreise/Quadrate mit genau einem svg, ±1 px.
      // MDI-Symbole (ha-icon) sind auf ihrem Raster gezeichnet – nur eigene Inline-svgs prüfen.
      if (g.its.length === 1 && g.its[0].kind === 'Symbol' && g.its[0].e.tagName.toLowerCase() === 'svg' && !/^HA-/.test((g.its[0].e.getRootNode().host || {}).tagName || '') && Math.abs((sr.right - sr.left) - h) < 2) {
        try {
          const svg = g.its[0].e, bb = svg.getBBox(), m = svg.getScreenCTM();
          if (bb.width > 0 && bb.height > 0 && m) {
            const P = (x, y) => new DOMPoint(x, y).matrixTransform(m);
            const a = P(bb.x, bb.y), b = P(bb.x + bb.width, bb.y + bb.height);
            const gx = (a.x + b.x) / 2 - cx, gy = (a.y + b.y) / 2 - cy;
            if (Math.abs(gx) > 1.01 || Math.abs(gy) > 1.01) F('zeichnung', s, Math.abs(gx) > Math.abs(gy) ? gx : gy, 1,
              'gezeichnetes Symbol liegt ' + gx.toFixed(1) + ' px waagrecht / ' + gy.toFixed(1) + ' px senkrecht neben der Kreismitte',
              { item: box({ left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }), inner: box({ left: sr.left, top: sr.top, width: sr.right - sr.left, height: h }) });
          }
        } catch (e) { /* kein svg-Inhalt */ }
      }
      if (Math.abs(off) > 0.51) F('waagrecht', s, off, 0.5, (g.its.length > 1 ? 'Block' : g.its[0].kind) + ' sitzt ' + Math.abs(off).toFixed(1) + ' px zu weit ' + (off > 0 ? 'rechts' : 'links'),
        { item: box({ left: g.left, top: g.top, width: g.right - g.left, height: g.bottom - g.top }), inner: box({ left: sr.left, top: sr.top, width: sr.right - sr.left, height: h }) });
    }
  }

  // 1b) Symbolkreise nebeneinander (z. B. Kopfzeile ‹ ⋯ ×) gleich groß ±1 px
  const rounds = [];
  for (const [s0, its0] of items) {
    if (!visible(s0) || !shapes.get(s0).bg || its0.some((x) => x.kind === 'Text' && !x.abs) || !its0.some((x) => x.kind === 'Symbol')) continue;
    const r = R(s0); if (r.height > 64 || Math.abs(r.width - r.height) > 1.5) continue;
    if ((parseFloat(cs(s0).borderTopLeftRadius) || 0) < r.height / 2 - 1) continue;
    rounds.push({ e: s0, r, cy: (r.top + r.bottom) / 2 });
  }
  rounds.sort((a, b) => a.r.left - b.r.left);
  const done = new Set();
  for (const a of rounds) {
    if (done.has(a)) continue;
    const row = [a];
    for (const b of rounds) if (b !== a && !done.has(b) && Math.abs(b.cy - a.cy) <= 1.5 && b.r.left - row[row.length - 1].r.right < 24 && b.r.left >= row[row.length - 1].r.right - 1) row.push(b);
    row.forEach((x) => done.add(x));
    if (row.length < 2) continue;
    const hs = row.map((x) => x.r.height), d = Math.max(...hs) - Math.min(...hs);
    if (d > 1.01) {
      const big = row.find((x) => x.r.height === Math.max(...hs));
      F('groesse', big.e, d, 1, 'Symbolkreise einer Reihe ungleich groß: ' + row.map((x) => Math.round(x.r.width) + '×' + Math.round(x.r.height)).join(', '),
        { rows: row.map((x) => label(x.e)).join(' · '), item: box(big.r), inner: box({ left: row[0].r.left, top: Math.min(...row.map((x) => x.r.top)), width: row[row.length - 1].r.right - row[0].r.left, height: Math.max(...hs) }) });
    }
  }

  // 2) Zeilen fluchten: gleiche Geschwister untereinander
  const base = (e) => e.tagName + '|' + (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter((c) => c && !/^(on|sel|active|open|hover|dim|has|cur|now|pinned|off|disabled|ghost|warn|err|ok)$/.test(c)).sort().join('.');
  const seen = new Set();
  for (const e of all) {
    const par = e.parentNode; if (!par || seen.has(par)) continue; seen.add(par);
    const kids = [...par.children].filter((k) => visible(k) && !/^(STYLE|SCRIPT|svg)$/i.test(k.tagName));
    const byB = new Map(); for (const k of kids) { const b = base(k); if (!byB.has(b)) byB.set(b, []); byB.get(b).push(k); }
    for (const [, rows] of byB) {
      if (rows.length < 2) continue;
      const rs = rows.map(R);
      if (rs.some((r) => r.height > 72)) continue;
      if (Math.max(...rs.map((r) => r.left)) - Math.min(...rs.map((r) => r.left)) > 0.5) continue; // nicht untereinander
      const ord = [...rs].sort((a, b) => a.top - b.top);
      if (ord.some((r, i) => i && r.top < ord[i - 1].bottom - 1)) continue; // übereinandergelegt (Ebenen), keine Liste
      if (Math.max(...rs.map((r) => r.height)) > 1.6 * Math.min(...rs.map((r) => r.height))) continue;
      const meas = rows.map((row, i) => {
        let ic = null, tx = null;
        for (const d of all) {
          if (ic && tx) break;
          if (!row.contains(d) && !(d.getRootNode().host && row.contains(d.getRootNode().host))) continue;
          if (!visible(d)) continue;
          if (!ic && isIcon(d)) ic = R(d);
          const word = (n) => n.nodeType === 3 && n.textContent.trim().length > 1;
          if (!tx && !inSvg(d) && !/^(STYLE|SCRIPT)$/.test(d.tagName) && [...d.childNodes].some(word)) {
            const n = [...d.childNodes].find(word); const rg = document.createRange(); rg.selectNodeContents(n); const q = rg.getClientRects()[0]; if (q) tx = q;
          }
        }
        return { ic: ic ? ic.left - rs[i].left : null, icy: ic ? (ic.top + ic.bottom) / 2 - (rs[i].top + rs[i].bottom) / 2 : null, tx: tx ? tx.left - rs[i].left : null, hasIc: !!ic };
      });
      const withIc = meas.filter((m) => m.hasIc);
      const spread = (a) => (a.length > 1 ? Math.max(...a) - Math.min(...a) : 0);
      const icL = spread(withIc.map((m) => m.ic)), txL = spread(withIc.filter((m) => m.tx != null).map((m) => m.tx));
      const txN = spread(meas.filter((m) => !m.hasIc && m.tx != null).map((m) => m.tx));
      const rowsTxt = rows.slice(0, 3).map(label).join(' · ');
      if (icL > 0.51) F('fluchten', rows[0], icL, 0.5, 'Symbole der Zeilen links nicht bündig (Spanne ' + icL.toFixed(1) + ' px)', { rows: rowsTxt, n: rows.length });
      if (txL > 0.51) F('fluchten', rows[0], txL, 0.5, 'Texte der Zeilen links nicht bündig (Spanne ' + txL.toFixed(1) + ' px)', { rows: rowsTxt, n: rows.length });
      if (txN > 0.51) F('fluchten', rows[0], txN, 0.5, 'Texte der Zeilen (ohne Symbol) links nicht bündig (Spanne ' + txN.toFixed(1) + ' px)', { rows: rowsTxt, n: rows.length });
    }
  }

  // 3) Abstände ringsum + konzentrische Radien: innere Form mit Hintergrund in äußerer Form mit Hintergrund
  const effR = (e, corner) => { const r = R(e); const v = parseFloat(cs(e)[corner]) || 0; return Math.min(v, r.width / 2, r.height / 2); };
  for (const [e, si] of shapes) {
    if (!si.bg || !visible(e)) continue;
    const par = shapeOf(e); if (!par || !shapes.get(par).bg || !visible(par)) continue;
    const pos = cs(e).position; if (pos === 'absolute' || pos === 'fixed') continue;
    const o = inner(par), r = R(e);
    const t = r.top - o.top, b = o.bottom - r.bottom, l = r.left - o.left, rr = o.right - r.right;
    // Knopf klebt am Rand seiner Karte: auf einer Seite < 2 px, gegenüber > 6 px Luft
    if (r.width < 0.6 * (o.right - o.left) && r.height < 0.6 * (o.bottom - o.top)) {
      const t0 = r.top - o.top, b0 = o.bottom - r.bottom;
      if (r.height <= 64 && Math.min(t0, b0) < 2 && Math.min(t0, b0) > -0.5 && Math.max(t0, b0) > 6)
        F('rand', e, Math.min(t0, b0), 2, 'liegt ' + (t0 < b0 ? 'oben' : 'unten') + ' am Rand der Karte (' + Math.min(t0, b0).toFixed(1) + ' px, gegenüber ' + Math.max(t0, b0).toFixed(1) + ' px)', { parent: label(par), item: box(r), inner: box({ left: o.left, top: o.top, width: o.right - o.left, height: o.bottom - o.top }) });
      continue;
    }
    // Nur Markierungen/Segmente: füllen die äußere Form in einer Richtung zu ≥ 60 %, Abstand ≤ 8 px
    const near = (x) => x >= -0.5 && x <= 8;
    const clips = cs(par).overflow !== 'visible';
    const msgs = [];
    if (near(t) && near(b) && Math.abs(t - b) > 1.01) msgs.push(['Abstand oben ' + t.toFixed(1) + ' ≠ unten ' + b.toFixed(1), t - b]);
    if (near(l) && near(rr) && Math.abs(l - rr) > 1.01) msgs.push(['Abstand links ' + l.toFixed(1) + ' ≠ rechts ' + rr.toFixed(1), l - rr]);
    if (near(t) && near(l) && Math.abs(t - l) > 1.01) msgs.push(['Abstand oben ' + t.toFixed(1) + ' ≠ links ' + l.toFixed(1), t - l]);
    else if (near(t) && near(rr) && !near(l) && Math.abs(t - rr) > 1.01) msgs.push(['Abstand oben ' + t.toFixed(1) + ' ≠ rechts ' + rr.toFixed(1), t - rr]);
    else if (near(b) && near(l) && !near(t) && Math.abs(b - l) > 1.01) msgs.push(['Abstand unten ' + b.toFixed(1) + ' ≠ links ' + l.toFixed(1), b - l]);
    for (const [m, v] of msgs) F('abstand', e, v, 1, m, { parent: label(par), item: box(r), inner: box({ left: o.left, top: o.top, width: o.right - o.left, height: o.bottom - o.top }) });
    // Radius: an einer Ecke, an der beide Abstände klein sind
    const corners = [['borderTopLeftRadius', t, l], ['borderTopRightRadius', t, rr], ['borderBottomLeftRadius', b, l], ['borderBottomRightRadius', b, rr]];
    for (const [cn, a, bb] of corners) {
      if (!(near(a) && near(bb))) continue;
      if (clips && Math.min(a, bb) <= 0.5) break; // Ecke vom Rahmen abgeschnitten
      const pr = effR(par, cn), cr = effR(e, cn), want = Math.max(0, pr - Math.min(a, bb));
      if (pr > 0 && Math.abs(cr - want) > 2.01) F('radius', e, cr - want, 2, 'Radius ' + cr.toFixed(1) + ' statt ' + want.toFixed(1) + ' (außen ' + pr.toFixed(1) + ' − Abstand ' + Math.min(a, bb).toFixed(1) + ')', { parent: label(par), item: box(r), inner: box({ left: o.left, top: o.top, width: o.right - o.left, height: o.bottom - o.top }) });
      break;
    }
  }
  return { finds, shapes: shapes.size, n: items.size };
};

// ── Stationen ───────────────────────────────────────────────────────────────
// Jede Station bringt das Studio in einen Zustand (nur im Speicher, gespeichert wird nichts).
const PJS = (page, src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', src)(window.__panel(), a), [src, a]);
// Element im Panel (auch in casora-*-Shadow-DOMs) per Selektor/Text finden und mit der Maus antippen.
async function tap(page, sel, re) {
  const pt = await page.evaluate(([sel, src]) => {
    const p = window.__panel(); const out = [];
    (function walk(r) { r.querySelectorAll(sel).forEach((e) => out.push(e)); r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot && /^CASORA-/.test(e.tagName)) walk(e.shadowRoot); }); })(p.shadowRoot);
    const rx = src ? new RegExp(src, 'i') : null;
    const e = out.find((x) => { const r = x.getBoundingClientRect(); if (!r.width || !r.height) return false;
      return !rx || rx.test((x.textContent || '') + ' ' + (x.title || '') + ' ' + (x.getAttribute('aria-label') || '')); });
    if (!e) return null;
    e.scrollIntoView({ block: 'center' });
    const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, [sel, re ? re.source : null]);
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(700);
  return true;
}
const insp = async (page) => { await PJS(page, 'if (p.classList.contains("bmode") && !p._bOpen) { p._bOpen = true; p._renderForm(); }'); await page.waitForTimeout(500); };
const esc = async (page, n = 2) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); } };

const STATIONS = [
  { name: 'Start (Raum, Inspektor)', run: async (pg) => { await insp(pg); return true; } },
  { name: 'Inspektor zu', run: async (pg) => { await PJS(pg, 'p._bClose && p._bClose()'); return true; } },
  { name: 'Dashboard-Menü (Titel)', run: async (pg) => tap(pg, '#roomtitle, #bigtitle, #navtitle') },
  { name: 'Raum-Menü', run: async (pg) => (await tap(pg, '.btool.broom, #rooms .tab.on .caret')) || tap(pg, '.bbar button', /Räume/) },
  { name: 'Kachel hinzufügen (Auswahl)', run: async (pg) => (await tap(pg, '.btool.uxplus')) || tap(pg, '.bbar button', /hinzufügen|^\s*$/) || tap(pg, '.mtile.ghost') },
  { name: 'Kachel-Editor', run: async (pg) => tap(pg, '.mtile:not(.ghost):not(.missingdev)') },
  { name: 'Badge-Editor', run: async (pg) => tap(pg, '.pbadge:not(.ghost)', /Beleuchtung|Klima|Sicherheit/) },
  { name: 'Szenen-Badge', run: async (pg) => tap(pg, '.pbadge', /Szenen/) },
  { name: 'Dashboard-Bereich', run: async (pg) => (await tap(pg, '.btool', /^\s*Dashboard/)) || tap(pg, '.bbar button', /Dashboard/) },
  { name: 'Ansehen als', run: async (pg) => tap(pg, '.uxas') },
  { name: 'Ausgeblendet', run: async (pg) => tap(pg, '.bhid') },
  { name: '⋯-Menü', run: async (pg) => tap(pg, '#more') },
  { name: 'Suche (⌘K)', run: async (pg) => { await pg.keyboard.press('Meta+k'); await pg.waitForTimeout(400);
    if (!(await PJS(pg, 'return !!p.shadowRoot.querySelector(".msearch")'))) await tap(pg, '#msearch, .msearchbtn, [title^="Suchen"]');
    await pg.keyboard.type('Licht'); await pg.waitForTimeout(500); return PJS(pg, 'return !!p.shadowRoot.querySelector(".msearch")'); } },
  { name: 'Einstellungen', run: async (pg) => (await tap(pg, '.btool', /Einstellungen/)) || tap(pg, '.bbar button', /Einstellungen/) },
  { name: 'Einstellungen: Haus', run: async (pg) => { await PJS(pg, 'return p._csOpenPage("home")'); return true; } },
  { name: 'Updates', run: async (pg) => { await PJS(pg, 'return p._cuOpenPage()'); await pg.waitForTimeout(1200); return true; } },
  { name: 'Zeitreise', run: async (pg) => { if (!(await tap(pg, '#brewind'))) return false; await pg.waitForTimeout(1200); return true; } },
  { name: 'Vorschau Handy', run: async (pg) => tap(pg, '.segopt', /Handy/) },
  { name: 'Assistent', run: async (pg) => { if (!(await tap(pg, '#more'))) return false; return tap(pg, '[role=menuitem], .combo-opt', /Einrichtungsassistent/); } },
  { name: 'Assistent Schritt 2', run: async (pg) => { if (!(await tap(pg, '#more'))) return false; if (!(await tap(pg, '[role=menuitem], .combo-opt', /Einrichtungsassistent/))) return false;
    await pg.waitForTimeout(1500);
    const w = pg.getByRole('button', { name: /^(Weiter|Next)$/ }).filter({ visible: true }).first();
    if (!(await w.isVisible().catch(() => false))) return false;
    await w.click(); await pg.waitForTimeout(1200); return true; } },
  { name: 'Inspektor: Kacheln', run: async (pg) => { await insp(pg); return tap(pg, '.grouphead, .stackhead, .grouprow > .chead, button', /^\s*Kacheln/); } },
  { name: 'Inspektor: Badges', run: async (pg) => { await insp(pg); return tap(pg, '.grouphead, .stackhead, .grouprow > .chead, button', /^\s*Badges/); } },
  { name: 'Inspektor: Popups', run: async (pg) => { await insp(pg); return tap(pg, '.grouphead, .stackhead, .grouprow > .chead, button', /^\s*Popups/); } },
];

async function reset(page) {
  await esc(page, 3);
  await PJS(page, `try { p._openCombo && p._openCombo(); } catch (e) {}
    try { if (p._flowMode) p._exitFlow(false); } catch (e) {}
    try { if (p._csOpen && p._csClose) p._csClose(); } catch (e) {}
    try { if (p._cuOpen && p._cuClose) p._cuClose(); } catch (e) {}
    try { if (p._cvOpen && p._cvClose) p._cvClose(); } catch (e) {}`).catch(() => {});
  await page.waitForTimeout(400);
}

// ── Lauf ────────────────────────────────────────────────────────────────────
const results = []; let measured = 0;
// Gleicher Fund an anderer Station bzw. in der nächsten Zeile einer Liste = derselbe Fund.
const key = (f) => f.kind + '|' + f.path.replace(/\d+/g, '#') + '|' + f.msg.replace(/„[^“]*“/g, '').replace(/[\d.,−-]+/g, '#');
const allowed = (f) => ERLAUBT.find(([st, re]) => st.test(f.station) && re.test(f.kind + ' ' + f.msg + ' ' + f.label + ' ' + f.path));

for (const view of views) {
  for (const look of looks) {
    // Handy: WebKit-Stichprobe nur im ersten Look, Nebel nur am Desktop.
    if (view === 'handy' && look !== looks[0] && !flag('voll')) continue;
    if (/Nebel/.test(look.theme) && view !== 'desktop' && !flag('voll')) continue;
    const v = VIEWS[view];
    const { browser, page } = await H.open({ ...v, dark: look.dark, theme: look.theme, studio: 'b', args: ['--hide-scrollbars'] });
    await page.addInitScript(() => { window.CASORA_QA_NO_WELLE_AUTO = true; });
    try {
      await H.ready(page, '/casora-studio', () => { const p = window.__panel && window.__panel(); return !!(p && p._hass && (p._state || p._flowMode)); });
      await PJS(page, 'p._setDash(arg); p._remember(arg); return p._load();', dash);
      await page.waitForFunction(() => { const p = window.__panel(); return p._state && p._state.compact && p._state.compact.rooms; }, null, { timeout: 30000 });
      await page.waitForTimeout(3500);
      // Toast vom Start weg (Toasts misst die Station „Start“, solange er steht)
      for (const st of STATIONS) {
        if (only && !only.test(st.name)) continue;
        const tag = `${view} · ${look.tag} · ${st.name}`;
        await reset(page);
        let ok = false;
        try { ok = await st.run(page); } catch (e) { console.log('  ! ' + tag + ': ' + String(e.message).slice(0, 120)); }
        if (!ok) { console.log('  –  ' + tag + ': nicht erreichbar (übersprungen)'); continue; }
        await page.waitForTimeout(600);
        await page.addScriptTag({ content: H.PIERCE }).catch(() => {});
        const m = await page.evaluate(MEASURE);
        if (m.err) { console.log('  ! ' + tag + ': ' + m.err); continue; }
        measured++;
        const fs_ = m.finds.map((f) => ({ ...f, station: st.name, view, look: look.tag }));
        let nNew = 0;
        for (const f of fs_) {
          const a = allowed(f); if (a) { f.erlaubt = a[2]; }
          const k = key(f) + '|' + view + '|' + look.tag;
          const dup = results.find((x) => x.k === k);
          if (dup) { if (!dup.stations.includes(st.name)) dup.stations.push(st.name); dup.count = (dup.count || 1) + 1; continue; }
          f.stations = [st.name];
          f.k = k; results.push(f); if (!a) nNew++;
          if (shotsDir) {
            f.shot = path.join(shotsDir, `f${String(results.length).padStart(3, '0')}.png`);
            await page.evaluate((f) => {
              const d = document.createElement('div'); d.id = '__ausr'; d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
              const bx = (b, c, st) => { const x = document.createElement('div'); x.style.cssText = `position:fixed;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;outline:1px ${st} ${c};`; d.appendChild(x); };
              const ln = (x, y, w, h, c) => { const l = document.createElement('div'); l.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c}`; d.appendChild(l); };
              const o = f.inner || f.box; if (f.item) bx(f.item, '#1e6fff', 'solid');
              ln(o.x, o.y + o.h / 2, o.w, 0.5, 'rgba(255,0,60,.85)'); ln(o.x + o.w / 2, o.y, 0.5, o.h, 'rgba(255,0,60,.85)');
              if (f.item) { const i = f.item; ln(i.x, i.y + i.h / 2, i.w, 0.5, 'rgba(30,111,255,.9)'); ln(i.x + i.w / 2, i.y, 0.5, i.h, 'rgba(30,111,255,.9)'); }
              document.body.appendChild(d);
            }, f);
            const u = [f.box, f.inner].filter(Boolean), pad = 18;
            const b = { x: Math.min(...u.map((q) => q.x)), y: Math.min(...u.map((q) => q.y)) };
            b.w = Math.max(...u.map((q) => q.x + q.w)) - b.x; b.h = Math.max(...u.map((q) => q.y + q.h)) - b.y;
            const clip = { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(v.width, b.x + b.w + pad) - Math.max(0, b.x - pad), height: Math.min(v.height, b.y + b.h + pad) - Math.max(0, b.y - pad) };
            if (clip.width > 2 && clip.height > 2) await page.screenshot({ path: f.shot, clip }).catch(() => { f.shot = null; });
            await page.evaluate(() => { const d = document.getElementById('__ausr'); if (d) d.remove(); });
          }
        }
        if (shotsDir && flag('alle-bilder')) await page.screenshot({ path: path.join(shotsDir, `station_${view}_${look.tag}_${st.name}`.replace(/[^\w-]+/g, '_') + '.png') });
        console.log(`  ${nNew ? 'FUND' : 'ok  '} ${tag}: ${m.shapes} Formen, ${nNew} neue Funde`);
        for (const f of fs_.filter((x) => results.includes(x) && !x.erlaubt)) console.log(`       ${f.kind.padEnd(9)} ${f.msg} – ${f.label}  [${f.path}]`);
      }
    } finally { await browser.close(); }
  }
}

const bad = results.filter((f) => !f.erlaubt);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ dash, views, looks, measured, finds: results }, null, 1));
console.log(`${bad.length ? 'FAIL' : 'PASS'} ausrichtung – ${measured} Messungen, ${bad.length} Funde${results.length - bad.length ? ', ' + (results.length - bad.length) + ' erlaubt' : ''}`);
process.exit(bad.length || measured < 5 ? 1 : 0);
