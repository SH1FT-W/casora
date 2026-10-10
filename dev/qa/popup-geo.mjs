// Popup-Geometrie und Kontrast (Design-Audit 1.3, 10.10.2026) – Messfunktion für dev/qa/popup-raender.mjs --geo.
// Läuft im Browser am offenen Popup (Casora-Popup bzw. HA-Dialog), durch alle Shadow-DOMs. Gemessen wird:
//  - Zeilen-Platten (Fläche mit Rundung, 36–110 px hoch) mit Symbolkreis links: Abstand Kreis–Platte
//    links = oben = unten (±1 px, „ring“), Radius konzentrisch: min(Plattenradius, Höhe/2) = Kreisradius
//    + Abstand (±2 px, „radius“); je Popup gleicher linker Abstand in allen Zeilen gleicher Höhe („zeilen“).
//  - Abschnittsüberschriften (Großbuchstaben-Etikett): Einzug zur Platte darunter und Lücke darüber je
//    Popup gleich (±1 px, „etikett“); erste Überschriften zweier Spalten auf einer Höhe (±1 px, „spalten“).
//  - Kontrast (WCAG AA): Text 4,5:1 (groß 3:1), Symbole in Zeilen/Kreisen 3:1, Schalter: Spur oder
//    Knopf muss sich mit 1,5:1 von der Platte abheben („kontrast“, „schalter“). Inaktive (opacity < .6,
//    disabled) zählen nicht. Hintergrund = Verlauf ausgenommen (unsicher → nicht gezählt).
//  - Trefferflächen am Handy ≥ 40 px inkl. unsichtbarem ::before/::after-Rand („treffer“).
//  - Haken in Auswahllisten (✓ / mdi:check) statt hinterlegter Zeile („haken“).
// Rückgabe { n, finds: [{ kind, msg, label, path }] }.
export const MEASURE_GEO = () => {
  const parentOf = (e) => e.assignedSlot || e.parentNode || (e.host || null);
  const up = (e) => { const p = parentOf(e); return p && p.nodeType === 11 ? p.host : p; };
  let frame = window.casoraPopup && window.casoraPopup.surface;
  if (!frame) {
    for (const d of window.__pierce('ha-dialog, ha-adaptive-dialog, ha-md-dialog, ha-wa-dialog, ha-more-info-dialog')) {
      const r = d.getBoundingClientRect(); if (r.width > 80 && r.height > 80) { frame = d; break; }
    }
  }
  if (!frame) return { n: 0, finds: [], err: 'kein Popup' };
  const all = [];
  const walk = (n) => { for (const ch of (n.children || [])) { all.push(ch); if (ch.shadowRoot) walk(ch.shadowRoot); walk(ch); } };
  if (frame.shadowRoot) walk(frame.shadowRoot); walk(frame);
  const seen = new Set(); const els = all.filter((e) => !seen.has(e) && seen.add(e));
  const csC = new Map(); const cs = (e) => { let v = csC.get(e); if (!v) { v = getComputedStyle(e); csC.set(e, v); } return v; };
  const FR = frame.getBoundingClientRect();
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
    if (e.checkVisibility && !e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
    if (r.bottom < FR.top || r.top > FR.bottom || r.top > innerHeight || r.bottom < 0) return null; return r; };
  const col = (s) => { const m = String(s || '').match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => { const a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; };
  const label = (e) => ((e.getAttribute && e.getAttribute('aria-label')) || e.innerText || e.textContent || e.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
  const path = (e) => { const p = []; for (let a = e, n = 0; a && a !== frame && n < 5; a = up(a), n++) if (a.nodeType === 1) p.unshift(a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className.trim() ? '.' + a.className.trim().split(/\s+/).slice(0, 2).join('.') : '')); return p.join(' > '); };
  // Effektiver Hintergrund: Ebenen von innen nach außen sammeln, bis eine deckend ist. Verlauf/Bild = unsicher.
  const pageBg = col(cs(document.documentElement).getPropertyValue('--primary-background-color').trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`)) || [255, 255, 255, 1];
  const bgOf = (e, self = false) => {
    const layers = []; let opacity = 1;
    for (let a = self ? e : up(e), n = 0; a && n < 80; a = up(a), n++) {
      if (a.nodeType !== 1) continue; const s = cs(a);
      opacity *= Number(s.opacity || 1);
      if (s.backgroundImage && s.backgroundImage !== 'none' && /gradient|url/.test(s.backgroundImage)) return { unsure: true };
      const c = col(s.backgroundColor); if (c && c[3] > 0.01) { layers.push(c); if (c[3] >= 0.99) break; }
    }
    let base = layers.length && layers[layers.length - 1][3] >= 0.99 ? layers.pop() : pageBg;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return { bg: base, opacity };
  };
  const inactive = (e) => { let op = 1; for (let a = e, n = 0; a && n < 80; a = up(a), n++) { if (a.nodeType !== 1) continue;
    if (a.hasAttribute && (a.hasAttribute('disabled') || a.getAttribute('aria-disabled') === 'true')) return true;
    op *= Number(cs(a).opacity || 1); } return op < 0.6; };
  const finds = []; const add = (kind, msg, e) => finds.push({ kind, msg, label: label(e), path: path(e) });
  const R = new Map(); for (const e of els) { const r = vis(e); if (r) R.set(e, r); }
  const radius = (e) => parseFloat(cs(e).borderTopLeftRadius) || 0;
  const hasFill = (e) => { const s = cs(e); const c = col(s.backgroundColor); return (c && c[3] > 0.02) || /gradient/.test(s.backgroundImage) || (s.boxShadow && s.boxShadow !== 'none'); };
  // 1) Zeilen-Platten mit Symbolkreis
  const plates = [...R].filter(([e, r]) => r.height >= 36 && r.height <= 110 && r.width >= 120 && radius(e) >= 10 && hasFill(e));
  const circles = [...R].filter(([e, r]) => r.width >= 22 && r.width <= 52 && Math.abs(r.width - r.height) <= 1 && radius(e) >= r.width / 2 - 1 && hasFill(e));
  const rowsByH = new Map();
  for (const [p, pr] of plates) {
    const inner = circles.filter(([c, cr]) => c !== p && cr.left >= pr.left - 0.5 && cr.left - pr.left <= 24 && cr.top >= pr.top - 0.5 && cr.bottom <= pr.bottom + 0.5);
    if (!inner.length) continue;
    // nur der äußerste Kreis (bei Kreis in Kreis)
    const [c, cr] = inner.sort((a, b) => b[1].width - a[1].width)[0];
    // Kreis gehört zu einer tieferen Platte? Dann misst die innere Platte.
    if (plates.some(([q, qr]) => q !== p && qr.width < pr.width && qr.left >= pr.left && qr.right <= pr.right && qr.top >= pr.top && qr.bottom <= pr.bottom && cr.left >= qr.left - 0.5 && cr.bottom <= qr.bottom + 0.5)) continue;
    const l = cr.left - pr.left, t = cr.top - pr.top, b = pr.bottom - cr.bottom;
    if (Math.abs(t - b) > 1) add('ring', `Kreis nicht mittig: oben ${t.toFixed(1)} / unten ${b.toFixed(1)} px`, p);
    else if (Math.abs(l - t) > 1 && pr.height <= cr.height + 2 * l + 1.5) add('ring', `Abstand Kreis–Platte links ${l.toFixed(1)} ≠ oben ${t.toFixed(1)} px`, p);
    const rp = Math.min(radius(p), pr.height / 2), want = cr.width / 2 + Math.min(l, t);
    if (Math.abs(rp - want) > 2) add('radius', `Plattenradius ${rp.toFixed(1)} ≠ Kreis ${(cr.width / 2).toFixed(1)} + Abstand ${Math.min(l, t).toFixed(1)} = ${want.toFixed(1)} px`, p);
    const k = Math.round(pr.height); if (!rowsByH.has(k)) rowsByH.set(k, []); rowsByH.get(k).push({ p, l, cw: cr.width });
  }
  const allRows = [...rowsByH.values()].flat();
  const ls = [...new Set(allRows.map((x) => Math.round(x.l)))];
  if (ls.length > 1) { const ex = allRows.find((x) => Math.round(x.l) !== Math.round(allRows[0].l)) || allRows[0];
    add('zeilen', `Zeilen-Einzug Kreis uneinheitlich: ${ls.sort((a, b) => a - b).join(' / ')} px (Kreise ${[...new Set(allRows.map((x) => Math.round(x.cw)))].join('/')} px)`, ex.p); }
  // 2) Etiketten (Abschnittsüberschriften)
  const labels = [...R].filter(([e, r]) => { const s = cs(e); if (s.textTransform !== 'uppercase' || parseFloat(s.letterSpacing) <= 0 || parseFloat(s.fontSize) > 14) return false;
    return [...e.childNodes].some((n) => n.nodeType === 3 && n.data.trim()) && r.width < FR.width * 0.8; });
  const lab = [];
  for (const [e, r] of labels) {
    const below = plates.concat([...R].filter(([x, xr]) => xr.height >= 30 && xr.width >= 120 && radius(x) >= 10 && hasFill(x)))
      .filter(([, pr]) => pr.top >= r.bottom - 1 && pr.top - r.bottom <= 24 && pr.left < r.right && pr.right > r.left)
      .sort((a, b) => a[1].top - b[1].top || a[1].left - b[1].left)[0];
    if (!below) continue;
    // Überschrift in der Platte (Info-Karte) ausnehmen
    if (r.top >= below[1].top) continue;
    lab.push({ e, r, dx: r.left - below[1].left, gap: below[1].top - r.bottom });
  }
  const spread = (a) => Math.max(...a) - Math.min(...a);
  if (lab.length > 1 && spread(lab.map((x) => x.dx)) > 1) add('etikett', `Einzug Überschrift–Platte uneinheitlich: ${[...new Set(lab.map((x) => x.dx.toFixed(0)))].join(' / ')} px`, lab[0].e);
  if (lab.length > 1 && spread(lab.map((x) => x.gap)) > 1) add('etikett', `Lücke Überschrift–Platte uneinheitlich: ${[...new Set(lab.map((x) => x.gap.toFixed(0)))].join(' / ')} px`, lab[0].e);
  // Spalten: Etiketten nebeneinander fast auf einer Höhe
  for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
    const a = labels[i][1], b = labels[j][1]; const d = Math.abs(a.top - b.top);
    if (d > 1 && d <= 14 && (a.right < b.left || b.right < a.left)) add('spalten', `Überschriften nebeneinander um ${d.toFixed(1)} px versetzt (${label(labels[i][0])} / ${label(labels[j][0])})`, labels[i][0]);
  }
  // 3) Kontrast
  const seenTxt = new Set();
  for (const [e, r] of R) {
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.data.trim().length > 0);
    const s = cs(e);
    // Trennpunkt „·“ ist Zierde, kein Inhalt.
    if (own && !inactive(e) && !/^[·•|\s]+$/.test(e.textContent)) {
      const c = col(s.color); const B = bgOf(e, true); if (!c || B.unsure) continue;
      const fg = over([c[0], c[1], c[2], c[3] * B.opacity], B.bg);
      const fs = parseFloat(s.fontSize), fw = Number(s.fontWeight) || 400;
      const need = fs >= 24 || (fs >= 18.66 && fw >= 700) ? 3 : 4.5; const q = ratio(fg, B.bg);
      const key = label(e) + Math.round(q * 10);
      if (q < need && !seenTxt.has(key)) { seenTxt.add(key); add('kontrast', `Text ${q.toFixed(2)}:1 < ${need}:1 (${s.color} auf rgb(${B.bg.slice(0, 3).map(Math.round)}), ${fs}px/${fw})`, e); }
    }
    // Symbole: svg (Farbe × eigene Deckkraft) und Maskensymbole (Hintergrundfarbe + mask-image).
    const isSvg = e.tagName && e.tagName.toLowerCase() === 'svg' && r.width <= 32 && r.width >= 6;
    const isMask = !isSvg && r.width <= 32 && r.width >= 8 && s.webkitMaskImage && s.webkitMaskImage !== 'none';
    if ((isSvg || isMask) && !inactive(up(e))) {
      // svg: gezeichnete Farbe am ersten Pfad (Kontur vor Füllung – Pfeile sind Konturen, Füllung dort Standard-Schwarz).
      const ink = (x) => { const t = cs(x); if (t.stroke && t.stroke !== 'none' && !/url/.test(t.stroke)) return t.stroke;
        if (t.fill && t.fill !== 'none' && !/url/.test(t.fill)) return t.fill; return null; };
      const shape = isSvg && e.querySelector('path, polyline, line, circle, rect, use');
      const c = isMask ? col(s.backgroundColor) : col((shape && ink(shape)) || ink(e) || s.color); const B = bgOf(e); if (!c || B.unsure) continue;
      const fg = over([c[0], c[1], c[2], c[3] * B.opacity * Number(s.opacity || 1)], B.bg); const q = ratio(fg, B.bg);
      const k2 = 'sym' + fg.slice(0, 3).map(Math.round) + B.bg.slice(0, 3).map(Math.round);
      if (q < 3 && !seenTxt.has(k2)) seenTxt.add(k2), add('kontrast', `Symbol ${q.toFixed(2)}:1 < 3:1 (rgb(${fg.slice(0, 3).map(Math.round)}) auf rgb(${B.bg.slice(0, 3).map(Math.round)}), ${Math.round(r.width)} px)`, e);
    }
    // Schalter: Pille 36–56 × 20–32 px mit rundem Knopf (Kind oder ::after) bzw. role=switch/ha-switch.
    // Spur oder Knopf muss sich mit mind. 1,5:1 von der Fläche darunter abheben.
    const pill = r.width >= 36 && r.width <= 56 && r.height >= 20 && r.height <= 32 && radius(e) >= r.height / 2 - 1;
    const knobKid = pill && [...e.children].some((k) => { const kr = k.getBoundingClientRect(); return kr.width >= 14 && Math.abs(kr.width - kr.height) <= 1 && radius(k) >= kr.width / 2 - 1; });
    const knobAfter = pill && (() => { const a = getComputedStyle(e, '::after'); return a.content !== 'none' && parseFloat(a.width) >= 14 ? a : null; })();
    if ((knobKid || knobAfter || /^(HA-SWITCH|HA-CONTROL-SWITCH)$/.test(e.tagName)) && !inactive(e)) {
      const B = bgOf(e); if (B.unsure) continue;
      const cols = [col(s.backgroundColor)];
      if (knobAfter) cols.push(col(knobAfter.backgroundColor));
      for (const k of e.children) cols.push(col(cs(k).backgroundColor));
      let best = 1;
      for (const c of cols) if (c && c[3] > 0.05) best = Math.max(best, ratio(over(c, B.bg), B.bg));
      if (best < 1.5) add('schalter', `Schalter hebt sich kaum ab (Spur ${s.backgroundColor}, bestes Teil ${best.toFixed(2)}:1 gegen rgb(${B.bg.slice(0, 3).map(Math.round)}))`, e);
    }
  }
  // 4) Trefferflächen (Handy/Touch): Bedienelement samt unsichtbarem Rand (::before/::after mit position
  // absolute und negativem Abstand) mindestens 40 × 40 px. Nur kleine Bedienteile (≤ 64 px), keine Zeilen.
  if (matchMedia('(pointer: coarse)').matches) {
    const tapSeen = new Set();
    for (const [e, r] of R) {
      if (r.width > 64 && r.height > 64) continue;
      const role = e.getAttribute && e.getAttribute('role');
      const btn = /^(BUTTON|HA-ICON-BUTTON)$/.test(e.tagName) || /^(button|switch|tab|checkbox)$/.test(role || '')
        || (cs(e).cursor === 'pointer' && !(up(e) && up(e).nodeType === 1 && cs(up(e)).cursor === 'pointer'));
      if (!btn || inactive(e)) continue;
      let w = r.width, h = r.height;
      for (const ps of ['::before', '::after']) {
        const a = getComputedStyle(e, ps); if (a.content === 'none' || a.position !== 'absolute') continue;
        const px = (v) => (/px$/.test(v) ? parseFloat(v) : 0);
        w = Math.max(w, r.width - Math.min(0, px(a.left)) - Math.min(0, px(a.right)));
        h = Math.max(h, r.height - Math.min(0, px(a.top)) - Math.min(0, px(a.bottom)));
      }
      const k = label(e) + Math.round(w) + 'x' + Math.round(h);
      if ((w < 39.5 || h < 39.5) && !tapSeen.has(k)) { tapSeen.add(k); add('treffer', `Trefferfläche ${Math.round(w)}×${Math.round(h)} px < 40`, e); }
    }
  }
  // 5) Haken in Auswahllisten
  for (const [e] of R) {
    const ic = e.getAttribute && e.getAttribute('icon');
    if ((ic === 'mdi:check' || ic === 'mdi:check-bold') || ([...e.childNodes].some((n) => n.nodeType === 3 && n.data.trim() === '✓'))) add('haken', 'Haken statt hinterlegter Zeile', e);
  }
  return { n: finds.length, finds };
};
