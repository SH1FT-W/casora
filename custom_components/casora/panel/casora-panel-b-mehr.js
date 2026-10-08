// Neues Studio: mehr Bedienung (06.10.2026)
//
// - Suche (Lupe, ⌘K/Strg+K; Handy: „…“ › Suchen): Räume, Kacheln, Badges, Szenen, Einstellungen
//   und Aktionen („Zeitreise“, „Look ändern“) – mit Tastatur, springt direkt hin
// - „Wer sieht das?“ je HA-Benutzer für Kachel, Badge und Raum (Admins sehen im Studio alles)
// - Raum vorübergehend ausblenden (Raummenü; in „Räume ordnen“ grau, wieder einblendbar)
// - „Vor dem Schalten fragen“ je Kachel (variables.confirm_toggle, Dialog: casora-core.js)
// - QR-Code „Auf Handy öffnen“ im Titelmenü (lokal erzeugt, ohne Zugangsdaten)
// - Liste der Änderungen vor dem Speichern und „Wiederholen“ (⌘⇧Z)
// Datenmodell, Speichern und Rückgängig bleiben die des Panels – hier wird nur angeschlossen.
// Ohne DOM prüfbar (dev/unit/studio_mehr.mjs): qrMatrix, changeLines, searchRank.
(() => {
  const W = typeof window !== "undefined" ? window : globalThis;
  const tr = (x) => (W.casoraI18n && W.casoraI18n.t ? W.casoraI18n.t(x) : x);
  const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] !== undefined ? o[k] : m));
  const J = (x) => JSON.stringify(x === undefined ? null : x);
  const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

  // ── QR-Code (Byte-Modus, Fehlerkorrektur M, Version 1–20) ──────────────────────────
  // Kleiner eigener Kodierer nach ISO/IEC 18004 – kein externer Dienst, keine Bibliothek.
  // qrMatrix(text) → Zeilen aus true/false (dunkel/hell), ohne Ruhezone.
  const QR_ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  const QR_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  const qrRaw = (v) => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const n = Math.floor(v / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  };
  const qrDataCw = (v) => Math.floor(qrRaw(v) / 8) - QR_ECC[v] * QR_BLOCKS[v];
  const gfMul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z & 0xff;
  };
  const rsDivisor = (deg) => {
    const r = new Array(deg).fill(0);
    r[deg - 1] = 1;
    let root = 1;
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; }
      root = gfMul(root, 0x02);
    }
    return r;
  };
  const rsRemainder = (data, div) => {
    const r = div.map(() => 0);
    data.forEach((b) => {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= gfMul(c, f); });
    });
    return r;
  };
  function qrMatrix(text) {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let ver = 1;
    for (; ver <= 20; ver++) {
      const need = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
      if (need <= qrDataCw(ver) * 8) break;
    }
    if (ver > 20) throw new Error("QR: text too long");
    const cap = qrDataCw(ver) * 8;
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4);
    put(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // Fehlerkorrektur je Block, dann verschränkt
    const nb = QR_BLOCKS[ver], ecl = QR_ECC[ver], raw = Math.floor(qrRaw(ver) / 8);
    const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
    const div = rsDivisor(ecl);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const words = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) words.push(b[i]); });
    }
    // Felder
    const size = ver * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver > 1) {
      const n = Math.floor(ver / 7) + 2;
      const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
      const pos = [6];
      for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
      pos.forEach((x, i) => pos.forEach((y, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }));
    }
    const format = (mask) => {
      const d = (0 << 3) | mask; // M = 0
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      const g = (i) => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, g(i));
      set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
      set(8, size - 8, true);
    };
    format(0);
    if (ver >= 7) {
      let r = ver;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) {
        const bit = ((b >>> i) & 1) === 1, a = size - 11 + (i % 3), c = Math.floor(i / 3);
        set(a, c, bit); set(c, a, bit);
      }
    }
    // Daten im Zickzack
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
        if (!fn[y][x] && i < words.length * 8) { mod[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
      }
    }
    const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
    const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    // Strafpunkte (vereinfacht): Läufe, 2×2-Blöcke, Sucher-ähnliche Muster, Hell/Dunkel-Verhältnis
    const penalty = () => {
      let p = 0, dark = 0;
      const line = (get) => {
        let run = 1;
        for (let k = 1; k <= size; k++) {
          if (k < size && get(k) === get(k - 1)) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
        for (let k = 0; k + 10 < size; k++) {
          const s = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((o) => (get(k + o) ? 1 : 0)).join("");
          if (s === "10111010000" || s === "00001011101") p += 40;
        }
      };
      for (let y = 0; y < size; y++) line((x) => mod[y][x]);
      for (let x = 0; x < size; x++) line((y) => mod[y][x]);
      for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      mod.forEach((r) => r.forEach((c) => { if (c) dark++; }));
      return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) {
      apply(m); format(m);
      const pp = penalty();
      if (pp < bestP) { bestP = pp; best = m; }
      apply(m);
    }
    apply(best); format(best);
    return mod;
  }
  // SVG mit Ruhezone (4 Module), dunkel auf weiß – unabhängig vom Theme gut lesbar.
  function qrSvg(text) {
    const m = qrMatrix(text);
    const n = m.length + 8;
    let d = "";
    m.forEach((row, y) => row.forEach((c, x) => { if (c) d += "M" + (x + 4) + " " + (y + 4) + "h1v1h-1z"; }));
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" role="img">'
      + '<rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>';
  }

  // ── Änderungen seit dem Speichern in Klartext ─────────────────────────────────────
  // before/after: [compact, scaffold, extras, chrome, mobile] wie _print() (stable JSON).
  // ctx: { roomName(room), tileName(tile) } – Ergebnis: Zeilen zum Anzeigen.
  const BADGE_VAR = /^(show_|badge|climate|temp|humid|aqi|light|security|lock|contact|camera|energy|people|person|media|now_playing|motion|window|door|co2|power|quality|presence)/;
  const OWN_VAR = /^(casora_hidden|casora_users|casora_badge_users|casora_ui_managed|image|image_night|room_name)$/;
  // Jede Zeile trägt ihre eigene Rücknahme: fix(x, b) setzt in x (Kopie des jetzigen Stands,
  // flach wie before/after) genau diesen Teil auf den gespeicherten Stand b zurück. Ob das sauber
  // geht, prüft revertLine über den Fingerabdruck (alle anderen Zeilen bleiben, diese verschwindet).
  // Umbenennen setzt nebenbei room_name/aqi_room_name/area und hält das bisherige Raumsymbol
  // fest (room_icon, wenn es vorher keins gab) – das gehört zur Umbenennung.
  const RENAME_VAR = /^(room_name|aqi_room_name|area)$/;
  const BADGE_TITLE = { climate: "Climate", lights: "Lights", people: "People", media: "Media", security: "Security", energy: "Energy" };
  const setv = (V, k, v) => { if (v === undefined) delete V[k]; else V[k] = JSON.parse(J(v)); };
  // Eine Dashboard-Einstellung in Worten (note1 Frage 6): „Uhrzeit: 12-Stunden-Uhr an“ statt
  // „Dashboard-Einstellungen geändert“. Schlüssel → Abschnitt und Feld aus SECTIONS des Panels
  // (ctx.sections, sonst window.__casoraPanelInternals.SECTIONS); unbekannt → null.
  function settingText(k, v, ctx) {
    const secs = (ctx && ctx.sections) || ((W.__casoraPanelInternals || {}).SECTIONS) || [];
    for (const sec of secs) {
      const f = (sec.fields || []).find((x) => x && x.key === k);
      if (!f || !f.label) continue;
      const head = tr(sec.title || sec.label) + ": " + tr(f.label);
      if (f.type === "bool") {
        let on = v === undefined || v === null || v === "" ? f.boolDefault !== false : v === true || v === "true" || v === 1;
        if (f.invert) on = !on;
        return head + " " + tr(on ? "On" : "Off").toLowerCase();
      }
      if (f.type === "select") {
        const key = v === undefined || v === null ? "" : String(v);
        const lab = f.optionLabels && f.optionLabels[key];
        return lab ? head + " → " + tr(lab) : null;
      }
      if (f.type === "range" || f.type === "text") return v === undefined || v === null || v === "" ? null : head + " → " + String(v);
      return null;
    }
    return null;
  }
  function changeItems(before, after, ctx) {
    const out = [];
    const add = (text, fix, key) => out.push({ text, fix, key: key || text });
    const rn = (r) => (ctx && ctx.roomName ? ctx.roomName(r) : (r && (r.name || r.path)) || "");
    const tn = (t) => (ctx && ctx.tileName ? ctx.tileName(t) : (t && t.name) || tr("Tile"));
    const R0 = ((before && before[0]) || {}).rooms || [], R1 = ((after && after[0]) || {}).rooms || [];
    const key = (r) => r.path || r.name || "";
    const M0 = new Map(R0.map((r) => [key(r), r])), M1 = new Map(R1.map((r) => [key(r), r]));
    const rooms = (x) => ((x && x[0]) || {}).rooms || [];
    const roomOf = (x, k) => rooms(x).find((r) => key(r) === k);
    const vars = (r) => (r.variables = r.variables || {});
    R1.forEach((r) => {
      if (!M0.has(key(r))) add(tr("Room added") + ": " + rn(r), (x) => { const l = rooms(x); const i = l.findIndex((y) => key(y) === key(r)); if (i >= 0) l.splice(i, 1); });
    });
    R0.forEach((r, bi) => {
      if (!M1.has(key(r))) add(tr("Room deleted") + ": " + rn(r), (x) => { const l = rooms(x); if (!roomOf(x, key(r))) l.splice(Math.min(bi, l.length), 0, JSON.parse(J(r))); });
    });
    if (J(R0.filter((r) => M1.has(key(r))).map(key)) !== J(R1.filter((r) => M0.has(key(r))).map(key))) {
      add(tr("Room order changed"), (x, b) => {
        const l = rooms(x), base = rooms(b).map(key);
        const slots = [], common = [];
        l.forEach((r, i) => { if (base.indexOf(key(r)) >= 0) { slots.push(i); common.push(r); } });
        common.sort((p, q) => base.indexOf(key(p)) - base.indexOf(key(q)));
        slots.forEach((s, i) => { l[s] = common[i]; });
      });
    }
    // Einstellungen, die das Studio in jedem Raum ablegt (z. B. Uhrzeit, 12-Stunden-Uhr): eine Zeile
    // statt einer je Raum (Nutzertest: „15 Änderungen“ für einen Schalter).
    const common = R1.filter((r) => M0.has(key(r)));
    const changedIn = new Map();
    common.forEach((r) => {
      const V0 = M0.get(key(r)).variables || {}, V1 = r.variables || {};
      new Set(Object.keys(V0).concat(Object.keys(V1))).forEach((k) => {
        if (OWN_VAR.test(k) || RENAME_VAR.test(k) || J(V0[k]) === J(V1[k])) return;
        if (!changedIn.has(k)) changedIn.set(k, []);
        changedIn.get(k).push(J(V1[k]));
      });
    });
    const wide = new Set();
    changedIn.forEach((vals, k) => {
      if (vals.length >= 2 && vals.length >= common.length * 0.8 && vals.every((v) => v === vals[0])) wide.add(k);
    });
    R1.forEach((r) => {
      const o = M0.get(key(r));
      if (!o) return;
      const k = key(r);
      const n = rn(r);
      const V0 = o.variables || {}, V1 = r.variables || {};
      const here = (x) => roomOf(x, k);
      const was = (b) => roomOf(b, k) || {};
      const copyVars = (re) => (x, b) => {
        const t = here(x); if (!t) return;
        const B = was(b).variables || {}, V = vars(t);
        new Set(Object.keys(B).concat(Object.keys(V))).forEach((v) => { if (re(v)) setv(V, v, B[v]); });
      };
      const renamed = (o.name || "") !== (r.name || "");
      const ofRename = (v) => RENAME_VAR.test(v) || (v === "room_icon" && V0.room_icon === undefined);
      if (renamed) {
        add(tr("Room renamed") + ": " + rn(o) + " → " + n, (x, b) => {
          const t = here(x); if (!t) return;
          if (was(b).name === undefined) delete t.name; else t.name = was(b).name;
          copyVars(ofRename)(x, b);
        });
      }
      if (!!V0.casora_hidden !== !!V1.casora_hidden) {
        add(tr(V1.casora_hidden ? "Room hidden" : "Room shown again") + ": " + n, copyVars((v) => v === "casora_hidden"));
      }
      if (J(V0.casora_users || []) !== J(V1.casora_users || []) || J(V0.casora_badge_users || {}) !== J(V1.casora_badge_users || {})) {
        add(tr("Who sees it changed") + ": " + n, copyVars((v) => v === "casora_users" || v === "casora_badge_users"));
      }
      if (J(V0.image) !== J(V1.image) || J(V0.image_night) !== J(V1.image_night)) {
        add(tr("Photo changed") + ": " + n, copyVars((v) => v === "image" || v === "image_night"));
      }
      // Kacheln: gleiche zählen sich weg, der Rest ist neu, entfernt oder (paarweise) geändert.
      const a = (o.tiles || []).map(J), bb = (r.tiles || []).map(J);
      const pool = new Map();
      a.forEach((x, i) => { if (!pool.has(x)) pool.set(x, []); pool.get(x).push(i); });
      const added = [];
      bb.forEach((x, i) => { const l = pool.get(x); if (l && l.length) l.shift(); else added.push(r.tiles[i]); });
      const removed = [];
      pool.forEach((l) => l.forEach((i) => removed.push(o.tiles[i])));
      removed.sort((x, y) => o.tiles.indexOf(x) - o.tiles.indexOf(y));
      const tiles = (x) => { const t = here(x); return t ? (t.tiles = t.tiles || []) : null; };
      const findT = (l, t) => l.findIndex((y) => J(y) === J(t));
      const both = Math.min(added.length, removed.length);
      for (let i = 0; i < both; i++) {
        const nu = added[i], old = removed[i];
        // Nur ein- oder ausgeschaltet: so sagen (statt „Kachel geändert“).
        // Das Studio schaltet über variables.enabled (Nutzertest 4: hieß sonst „Kachel geändert“).
        const sansOn = (t) => { const c = JSON.parse(J(t)); delete c.enabled; if (c.variables) { delete c.variables.enabled; if (!Object.keys(c.variables).length) delete c.variables; } return J(c); };
        const off = (t) => t.enabled === false || (t.variables || {}).enabled === false;
        const onoff = sansOn(nu) === sansOn(old) ? (off(nu) ? "Tile turned off" : "Tile turned on") : "Tile changed";
        add(tr(onoff) + ": " + tn(nu) + " · " + n, (x) => { const l = tiles(x); const j = l ? findT(l, nu) : -1; if (j >= 0) l[j] = JSON.parse(J(old)); });
      }
      added.slice(both).forEach((t) => add(tr("Tile added") + ": " + tn(t) + " · " + n,
        (x) => { const l = tiles(x); const j = l ? findT(l, t) : -1; if (j >= 0) l.splice(j, 1); }));
      removed.slice(both).forEach((t) => add(tr("Tile removed") + ": " + tn(t) + " · " + n,
        (x) => { const l = tiles(x); if (l) l.splice(Math.min(o.tiles.indexOf(t), l.length), 0, JSON.parse(J(t))); }));
      if (!added.length && !removed.length && J(a) !== J(bb)) {
        add(tr("Tile order changed") + ": " + n, (x, b) => { const t = here(x); if (t) t.tiles = JSON.parse(J(was(b).tiles || [])); });
      }
      const badgeKeys = [], otherKeys = [];
      new Set(Object.keys(V0).concat(Object.keys(V1))).forEach((v) => {
        if (OWN_VAR.test(v) || wide.has(v) || J(V0[v]) === J(V1[v])) return;
        if (renamed && ofRename(v)) return;
        if (BADGE_VAR.test(v) && !RENAME_VAR.test(v)) badgeKeys.push(v); else otherKeys.push(v);
      });
      if (badgeKeys.length) {
        // Nur ein Badge-Name geändert: wortgenau („Klima → Luft“), sonst allgemein.
        const m = badgeKeys.length === 1 && /^(climate|lights|people|media|security|energy)_title$/.exec(badgeKeys[0]);
        const bid = m && m[1];
        const txt = bid ? tr("Badge renamed") + ": " + (V0[bid + "_title"] || tr(BADGE_TITLE[bid])) + " → " + (V1[bid + "_title"] || tr(BADGE_TITLE[bid])) + " · " + n
          : tr("Badges changed") + ": " + n;
        add(txt, copyVars((v) => badgeKeys.indexOf(v) >= 0));
      }
      const SHELL = ["_hero", "_row", "_view", "_extraCards", "_header"];
      const shell = (x) => J(SHELL.map((f) => x[f]));
      if (otherKeys.length || shell(o) !== shell(r)) {
        add(tr("Room settings changed") + ": " + n, (x, b) => {
          copyVars((v) => otherKeys.indexOf(v) >= 0)(x, b);
          const t = here(x), B = was(b);
          if (t) SHELL.forEach((f) => { if (B[f] === undefined) delete t[f]; else t[f] = JSON.parse(J(B[f])); });
        });
      }
    });
    const dash = J((before || []).slice(1, 4)) !== J((after || []).slice(1, 4));
    if (dash || wide.size) {
      // Nur eine oder zwei bekannte Einstellungen in allen Räumen: beim Namen nennen.
      const one = R1.find((r) => M0.get(key(r))) || {};
      const named = !dash && wide.size <= 2 ? [...wide].map((k) => settingText(k, (one.variables || {})[k], ctx)) : [];
      const label = named.length && named.every(Boolean) ? named.join(" · ") : tr("Dashboard settings changed");
      add(label, (x, b) => {
        for (let i = 1; i < 4; i++) x[i] = JSON.parse(J((b || [])[i]));
        rooms(x).forEach((r) => {
          const B = (roomOf(b, key(r)) || {}).variables || {};
          wide.forEach((v) => { if (r.variables) setv(r.variables, v, B[v]); });
        });
      });
    }
    if (!out.length && J((before || [])[4]) !== J((after || [])[4])) out.push({ text: tr("Phone layout changed"), key: "phone", fix: (x, b) => { x[4] = JSON.parse(J((b || [])[4])); } });
    return out;
  }
  function changeLines(before, after, ctx) { return changeItems(before, after, ctx).map((x) => x.text); }
  // Eine Zeile zurücknehmen: liefert den neuen Stand oder { why } – dann bleiben die übrigen
  // Änderungen sonst nicht unberührt, und die Zeile wird ausgegraut statt still zu viel zu tun.
  function revertLine(before, after, index, ctx) {
    const items = changeItems(before, after, ctx);
    const it = items[index];
    if (!it) return { why: "gone" };
    const x = JSON.parse(J(after));
    const clean = (y) => {
      // Leere variables, die es vorher nicht gab, wieder weg (sonst bleibt der Stand „geändert“).
      const B = new Map((((before || [])[0] || {}).rooms || []).map((r) => [r.path || r.name || "", r]));
      (((y || [])[0] || {}).rooms || []).forEach((r) => {
        const o = B.get(r.path || r.name || "");
        if (o && o.variables === undefined && r.variables && !Object.keys(r.variables).length) delete r.variables;
      });
    };
    try { it.fix(x, before); clean(x); } catch (e) { return { why: "error" }; }
    // Das Handy-Layout folgt dem Desktop (Abgleich beim Anzeigen/Speichern, z. B. Raumnamen): es zählt
    // nicht zum Fingerabdruck. Ist am Desktop alles zurück, kommt auch das Handy-Layout zurück –
    // sonst blieb am Handy „Handy-Layout geändert“ übrig und das Zurücknehmen wirkte verknüpft.
    const PHONE = tr("Phone layout changed");
    const desk = (l) => l.filter((t) => t !== PHONE);
    if (!desk(changeLines(before, x, ctx)).length && J(x[4]) !== J((before || [])[4])) x[4] = JSON.parse(J((before || [])[4]));
    // Fingerabdruck mit festem Raumschlüssel statt Anzeigename: Wer „Küche → Kochecke“ zurücknimmt,
    // ändert nur den Namen in den übrigen Zeilen („… · Kochecke“ wird „… · Küche“) – das ist keine
    // Abhängigkeit (Nutzertest 4: Umbenennung war gesperrt, sobald im Raum etwas anderes geändert war).
    const fctx = Object.assign({}, ctx, { roomName: (r) => "#" + ((r && (r.path || r.name)) || "") });
    const itemsF = changeItems(before, after, fctx);
    const others = itemsF.map((y, i) => ({ f: y.text, text: (items[i] || y).text, i })).filter((y) => y.i !== index && y.f !== PHONE);
    const got = desk(changeLines(before, x, fctx)).sort();
    const want = others.map((y) => y.f).sort();
    if (J(got) !== J(want)) {
      // Welche andere Zeile hängt mit dran? (für einen verständlichen Grund am ausgegrauten Knopf)
      const left = got.slice();
      const tied = others.find((y) => { const k = left.indexOf(y.f); if (k >= 0) { left.splice(k, 1); return false; } return true; });
      return { why: "linked", with: tied ? tied.text : "" };
    }
    return { state: x };
  }

  // ── Suche: Treffer ordnen ────────────────────────────────────────────────────────
  // items: [{kind, label, sub?, words?}] – jedes Wort der Suche muss vorkommen; vorn im
  // Namen zählt am meisten. Leere Suche: nichts (die Vorschläge wählt der Aufrufer).
  const KIND_RANK = { action: 6, room: 5, setting: 4, tile: 3, badge: 2, scene: 1, device: 0 };
  function searchRank(items, q, max) {
    const toks = fold(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    const scored = [];
    items.forEach((it, i) => {
      const lab = fold(it.label), all = lab + " " + fold(it.sub) + " " + fold(it.words);
      let s = 0;
      for (const t of toks) {
        if (all.indexOf(t) < 0) return;
        s += lab.indexOf(t) === 0 ? 30 : new RegExp("(^|[^a-z0-9])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(lab) ? 20
          : lab.indexOf(t) >= 0 ? 10 : 4;
      }
      if (lab === toks.join(" ")) s += 25;
      scored.push({ it, s: s + (KIND_RANK[it.kind] || 0) + (it.here ? 8 : 0), i });
    });
    scored.sort((x, y) => y.s - x.s || x.i - y.i);
    return scored.slice(0, max || 30).map((x) => x.it);
  }

  W.__casoraStudioMehr = { qrMatrix, qrSvg, changeLines, changeItems, revertLine, searchRank, fold };
  if (typeof customElements === "undefined" || !W.document) return;

  // Symbole der Menüs (Strichzeichnungen wie MENU_ICONS des Panels).
  const ICONS = {
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H12"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4M6.3 6.8C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    qr: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z"/><path d="M14 14h2v2h-2zM18 14h2M14 18h2M18 18h2v2"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 20a6.5 6.5 0 0 0-3-5.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    chev: '<path d="M6 9l6 6 6-6"/>',
  };
  const svg = (k, w) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2)
    + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[k] + "</svg>";
  const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "");

  const CSS = `
    /* Lupe und Wiederholen in der Werkzeugleiste (Desktop/Tablet) */
    :host(.bmode) #msearch, :host(.bmode) #mredo { display:none; }
    :host(.bmode:not(.phone)) #mredo.has { display:grid; }
    /* Suche als sichtbarer Eingang: Feld „Suchen … ⌘K“ (Handy: Lupe neben „Fertig“) */
    :host(.bmode) #msearch { display:inline-flex; align-items:center; gap:8px; height:34px; min-width:0; padding:0 12px 0 10px;
      margin-right:8px; border-radius:999px; border:0; font:inherit; font-size:14px; color:var(--ink-2, inherit); cursor:text;
      background:var(--wash-fill, rgba(118,118,128,.12)); box-shadow:none; flex:none; }
    #msearch svg { width:17px; height:17px; flex:none; }
    #msearch .mkb { font-size:12px; opacity:.65; margin-left:12px; }
    :host(.bmode.btight) #msearch .mlab, :host(.bmode.btight) #msearch .mkb { display:none; }
    :host(.bmode.phone) #msearch { width:44px; height:44px; padding:0; justify-content:center; margin-right:6px; cursor:pointer;
      background:var(--casora-studio-chip, rgba(118,118,128,.18)); color:var(--ink, inherit); }
    :host(.bmode.phone) #msearch .mlab, :host(.bmode.phone) #msearch .mkb { display:none; }
    /* „Bearbeitet · 3 Änderungen“ am Titel öffnet die Änderungsliste */
    .toprow > .bedited.mlink { cursor:pointer; border-radius:8px; padding:2px 6px; margin-left:-12px !important; }
    /* Als zweite Zeile unter dem Titel, nicht daneben: sonst rückten beim ersten Ändern alle
       Knöpfe der Kopfzeile nach rechts (Nutzertest: Fehlklick). Am Handy so ebenfalls sichtbar. */
    :host(.bmode.bdirty:not(.flow)) .toprow { position:relative; }
    /* Eng: „Handy weicht bei N Einstellungen ab“ nur als Zahl (wie am Handy). */
    :host(.bmode.btight:not(.phone)) #diffs .s-long, :host(.bmode.uxs2:not(.phone)) #diffs .s-long { display:none; }
    :host(.bmode.btight:not(.phone)) #diffs .s-short, :host(.bmode.uxs2:not(.phone)) #diffs .s-short { display:inline; }
    :host(.bmode.bdirty:not(.flow):not(.btight)) .toprow > .bedited.mlink,
    :host(.bmode.bdirty.phone:not(.flow)) .toprow > .bedited.mlink {
      display:inline-flex; position:absolute; top:calc(100% - 4px); margin:0 !important; z-index:3;
      font-size:12px; font-weight:600; line-height:1.2; color:var(--accent, #94603B); background:var(--bg, transparent); }
    :host(.bmode.bdirty.phone:not(.flow)) .toprow > .bedited.mlink { top:calc(100% - 10px); padding:4px 10px; border-radius:999px;
      color:#f5f5f7; background:rgba(28,28,30,.72); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px);
      box-shadow:0 1px 4px rgba(0,0,0,.18); }
    :host(.is-light.bmode.bdirty.phone:not(.flow)) .toprow > .bedited.mlink { color:#1d1d1f; background:rgba(255,255,255,.86); }
    .toprow > .bedited.mlink:hover { background:var(--wash-fill, rgba(118,118,128,.12)); color:var(--ink, inherit); }
    .toprow > .bedited.mlink:focus-visible { outline:2px solid var(--accent, #B67A50); outline-offset:1px; }
    /* Aufklapp-Liste */
    .mpop { position:fixed; z-index:1000; width:min(360px, calc(100vw - 32px)); max-height:min(70vh, 520px); overflow:auto;
      padding:14px 14px 12px; border-radius:20px; box-shadow:0 2px 6px rgba(0,0,0,.10), 0 22px 56px rgba(0,0,0,.24); }
    .mpop, .msearch .mbox { color:var(--ink, inherit); background:var(--menu-glass, var(--casora-studio-menu-glass, rgba(30,33,38,.92)));
      -webkit-backdrop-filter:blur(28px) saturate(180%); backdrop-filter:blur(28px) saturate(180%); }
    :host(.is-light) .mpop, :host(.is-light) .msearch .mbox { background:var(--menu-glass, var(--casora-studio-menu-glass, rgba(255,255,255,.96))); }
    .mpop h4 { margin:2px 4px 8px; font-size:15px; font-weight:650; }
    .mpop ul { margin:0; padding:0; list-style:none; }
    .mpop li { padding:7px 4px; font-size:14px; line-height:1.35; border-top:.5px solid var(--hair, rgba(127,127,127,.2)); overflow-wrap:anywhere; }
    .mpop li:first-child { border-top:0; }
    /* Änderungsliste: je Zeile „Zurücknehmen“ (ausgegraut mit Grund, wenn es nicht sauber geht) */
    .mpop li.mline { display:grid; grid-template-columns:1fr auto; align-items:center; column-gap:10px; }
    .mpop li.mline .mwhy { grid-column:1 / -1; font-size:12px; color:var(--ink-2, #8a8a8e); margin-top:2px; }
    .mpop .mback { flex:none; min-height:32px; padding:4px 12px; border:0; border-radius:999px; font:inherit; font-size:13px; font-weight:600;
      color:var(--accent, #94603B); background:var(--accent-tint, rgba(148,96,59,.12)); box-shadow:none; cursor:pointer; white-space:nowrap; }
    .mpop li.mgone .mtxt { text-decoration:line-through; color:var(--ink-2, #8a8a8e); }
    .mpop .mback:disabled { color:var(--ink-2, #8a8a8e); background:var(--wash-fill, rgba(118,118,128,.10)); cursor:default; }
    :host(.phone) .mpop .mback { min-height:36px; }
    .mpop .mnone { color:var(--ink-2, #8a8a8e); font-size:14px; padding:6px 4px; }
    .mpop .macts { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px; }
    .mpop .macts button { min-width:0; white-space:nowrap; }
    .mpop .macts button:nth-child(3) { grid-column:1 / -1; }
    .mpop .mkbd { margin-left:6px; opacity:.6; font-weight:500; font-size:12px; }
    :host(.phone) .mpop { left:8px !important; right:8px; top:auto !important; bottom:calc(10px + env(safe-area-inset-bottom, 0px));
      width:auto; max-height:72vh; border-radius:24px; }
    /* Suche */
    .msearch { position:fixed; inset:0; z-index:1001; display:flex; justify-content:center; align-items:flex-start;
      padding:12vh 16px 16px; background:rgba(0,0,0,.18); }
    .msearch .mbox { width:min(580px, 100%); max-height:min(72vh, 620px); display:flex; flex-direction:column; overflow:hidden;
      border-radius:22px; box-shadow:0 2px 6px rgba(0,0,0,.10), 0 26px 64px rgba(0,0,0,.28); }
    .msearch .mfield { display:flex; align-items:center; gap:10px; padding:14px 16px; border-bottom:.5px solid var(--hair, rgba(127,127,127,.22)); }
    .msearch .mfield svg { width:20px; height:20px; flex:none; opacity:.55; }
    .msearch input { flex:1 1 auto; min-width:0; border:0; outline:0; background:none; color:inherit; font:inherit; font-size:17px; padding:2px 0; }
    .msearch .mesc { flex:none; font-size:12px; opacity:.5; }
    .msearch .mres { overflow:auto; padding:6px; }
    .msearch .mhead { padding:10px 10px 4px; font-size:12px; font-weight:650; letter-spacing:.02em; color:var(--ink-2, #8a8a8e); }
    .msearch .mrow { display:flex; align-items:center; gap:10px; width:100%; min-height:44px; padding:8px 10px; border:0; border-radius:12px;
      background:none; color:inherit; font:inherit; text-align:left; cursor:pointer; box-shadow:none; }
    .msearch .mrow.on { background:var(--accent-tint, rgba(148,96,59,.14)); }
    .msearch .mrow b { font-weight:600; font-size:15px; }
    .msearch .mrow .mtx { flex:1 1 auto; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .msearch .mrow .msub { font-size:13px; color:var(--ink-2, #8a8a8e); margin-left:6px; }
    .msearch .mrow .mkind { flex:none; font-size:12px; color:var(--ink-2, #8a8a8e); }
    .msearch .mempty { padding:22px 12px; text-align:center; color:var(--ink-2, #8a8a8e); font-size:14px; }
    :host(.phone) .msearch { padding:calc(10px + env(safe-area-inset-top, 0px)) 8px 8px; background:rgba(0,0,0,.28); }
    :host(.phone) .msearch .mbox { max-height:78vh; border-radius:24px; }
    /* Wer sieht das? / Rückfrage im Editor */
    .mwho { margin-top:4px; }
    .mtry { display:block; margin:6px 0 2px; padding:8px 12px; border-radius:10px; font:inherit; font-weight:600; cursor:pointer; }
    .mtry[hidden] { display:none; }
    .mwhofix { display:block; margin:4px 0 6px; padding:8px 12px; border-radius:10px; font:inherit; font-weight:600; cursor:pointer; }
    .mwho .mwhofix[hidden] { display:none !important; }
    .mhi { animation: mhi 1.8s ease-out; border-radius:10px; }
    @keyframes mhi { 0%,40% { box-shadow:0 0 0 3px color-mix(in srgb, var(--accent, #94603B) 45%, transparent); } 100% { box-shadow:0 0 0 3px transparent; } }
    .mwho .mval { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; min-height:40px;
      padding:8px 12px 8px 14px; border:0; border-radius:12px; box-shadow:none; text-align:left; cursor:pointer;
      font:inherit; font-size:var(--t-body, 15px); font-weight:500; color:var(--ink, inherit);
      background:var(--field-fill, var(--wash-fill, rgba(118,118,128,.12))); }
    .mwho .mval svg { width:18px; height:18px; flex:none; opacity:.6; }
    .mwho .mval .mvt { flex:1 1 auto; min-width:0; }
    .mwho .mnote { font-size:13px; line-height:1.35; color:var(--accent, #94603B); font-weight:600; margin:2px 0 0; }
    .mwhosheet .mu { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 2px;
      border-top:.5px solid var(--hair, rgba(127,127,127,.2)); font-size:15px; }
    .mwhosheet .mu:first-child { border-top:0; }
    .mwhosheet .mu small { display:block; font-size:12px; color:var(--ink-2, #8a8a8e); }
    .mwhosheet .mlist { margin:4px 0 6px; max-height:46vh; overflow:auto; }
    .mqr { display:flex; flex-direction:column; align-items:center; gap:10px; margin:6px 0 10px; }
    .mqr .mcode { width:min(230px, 62vw); aspect-ratio:1; border-radius:16px; overflow:hidden; background:#fff; box-shadow:0 0 0 .5px rgba(0,0,0,.12); }
    .mqr .mcode svg { width:100%; height:100%; display:block; }
    .mqr .murl { font-size:13px; color:var(--ink-2, #8a8a8e); text-align:center; overflow-wrap:anywhere; user-select:all; }
    .mqr .mhint { font-size:13px; line-height:1.4; text-align:center; color:var(--ink-2, #8a8a8e); margin:0; }
    /* Ausgeblendete Räume in „Räume ordnen“ */
    #pane .brow.mhid .bri, #pane .brow.mhid .bn { opacity:.45; }
    #pane .brow .mshow { margin-left:auto; padding:4px 10px; border-radius:999px; font:inherit; font-size:12px; font-weight:650;
      background:var(--wash-fill, rgba(118,118,128,.14)); color:inherit; cursor:pointer; }
    #pane .brow .mhidtag { margin-left:auto; font-size:12px; color:var(--ink-2, #8a8a8e); }
    #pane .brow.mhid .bgrip { margin-left:8px; }
  `;

  const BADGES = [["climate", "Climate"], ["lights", "Lights"], ["people", "People"], ["media", "Media"], ["security", "Security"], ["energy", "Energy"]];
  const BADGE_KEY = { climate: /^(climate_entity|temp_sensor|humidity_sensor|quality_sensor)/, lights: /^light_(entity|group)/,
    people: /^presence_entity/, media: /^(media_|now_playing_|psn_)/, security: /^security_/, energy: /^energy_(entity|power|cost)/ };
  const BADGE_WORDS = { climate: "klima temperatur luft feuchte", lights: "licht lampen beleuchtung", people: "personen anwesenheit leute",
    media: "medien musik fernseher tv", security: "sicherheit schloss tür kamera alarm kurz ausführlich ausfuehrlich ausgeschrieben unterzeile symbole short detailed summary", energy: "energie strom verbrauch" };

  customElements.whenDefined("casora-panel").then(() => {
    const P = customElements.get("casora-panel").prototype;
    if (P.__casoraMehr) return;
    P.__casoraMehr = true;
    const I = () => W.__casoraPanelInternals || {};
    const wrap = (name, make) => { const orig = P[name]; if (typeof orig === "function") P[name] = make(orig); };
    const on = (p) => p.classList.contains("bmode") && !p.classList.contains("flow");
    const isPhone = (p) => p.classList.contains("phone");
    const rooms$ = (p) => (p._state && p._state.compact && p._state.compact.rooms) || [];
    const isHome = (p, r) => !!(I().isHomeRoom && I().isHomeRoom(r, rooms$(p)));
    // Eigene Symbole in die Menü-Symbole des Panels (einmal).
    const icons = () => { const M = I().MENU_ICONS; if (M && !M.search) Object.keys(ICONS).forEach((k) => { if (!M[k]) M[k] = ICONS[k]; }); };

    P._mCss = function () {
      const root = this.shadowRoot;
      if (root && !root.getElementById("bmehr-css")) {
        const st = document.createElement("style");
        st.id = "bmehr-css";
        st.textContent = CSS;
        root.appendChild(st);
      }
    };

    const tileName = (t) => {
      const inner = (t && t.type === "conditional" && t.card) || (t && t.card) || t;
      const ty = I().tileTypeAny ? (I().tileTypeAny(t) || I().tileTypeAny(inner)) : null;
      const v = (t && t.variables) || {};
      return (t && t.name) || (inner && inner.name) || v.casora_name || (ty && tr(ty.label)) || tr("Tile");
    };

    // ── Wiederholen ──────────────────────────────────────────────────────────
    wrap("_undo", (orig) => function () {
      const st = this._undoStack || [];
      if (st.length && this._state && !this._mRedoing) {
        this._mRedo = (this._mRedo || []).concat([this._snap()]).slice(-50);
      }
      const quiet = this._mRedoing || this._bQuietUndo || !st.length;
      const was = quiet ? null : this._mChanges();
      const r = orig.apply(this, arguments);
      this._mPaintRedo();
      // „Rückgängig gemacht“ sagt jetzt, was: die Zeile, die aus der Änderungsliste verschwand.
      if (was && was.length && on(this) && this._bToast) {
        const left = this._mChanges().slice();
        const gone = was.filter((x) => { const i = left.indexOf(x); if (i >= 0) { left.splice(i, 1); return false; } return true; });
        if (gone.length === 1) setTimeout(() => this._bToast(tr("Undone") + ": " + gone[0], { ms: 2600 }), 0);
      }
      return r;
    });
    P._redo = function () {
      const snap = (this._mRedo || []).pop();
      if (!snap || !this._state) return;
      // Nach „Zurücknehmen“ liegt derselbe Stand schon oben auf dem Rückgängig-Stapel: nicht doppelt,
      // damit ⌘Z danach die Zeile wieder zurücknimmt.
      if (snap === this._mTakenBack) {
        const st = this._undoStack || [];
        if (st[st.length - 1] === snap) this._undoStack = st.slice(0, -1);
      }
      this._mTakenBack = null;
      // Über den Rückgängig-Weg anwenden; der jetzige Stand kommt danach wieder auf den Stapel.
      const now = this._snap();
      this._undoStack = (this._undoStack || []).concat([snap]);
      this._mRedoing = true;
      this._bQuietUndo = true;
      try { this._undo(); } finally { this._mRedoing = false; this._bQuietUndo = false; }
      this._undoStack = (this._undoStack || []).concat([now]).slice(-50);
      this._bQuiet = true;
      try { this._markDirty(); } finally { this._bQuiet = false; }
      this._mPaintRedo();
      if (this._bToast) this._bToast(tr("Redone"), { ms: 1800 });
    };
    // Eine neue Änderung (nicht Rückgängig/Wiederholen) leert „Wiederholen“.
    wrap("_markDirty", (orig) => function () {
      const p0 = this._lastPrint;
      const r = orig.apply(this, arguments);
      if (this._lastPrint !== p0 && p0 !== undefined && !this._mRedoing) this._mRedo = [];
      this._mPaintRedo();
      this._mPaintChanges();
      return r;
    });
    wrap("_resetUndo", (orig) => function () {
      const r = orig.apply(this, arguments);
      // Gespeicherter Stand zum Vergleichen (gesetzt wie _clean: nach Laden und Speichern).
      this._mBase = this._shadow || null;
      this._mRedo = [];
      this._mPaintRedo();
      this._mPaintChanges();
      return r;
    });
    P._mPaintRedo = function () {
      const b = this.shadowRoot && this.shadowRoot.getElementById("mredo");
      if (b) {
        const n = (this._mRedo || []).length;
        b.classList.toggle("has", n > 0);
        b.disabled = !n;
      }
    };

    // Vorschau folgt dem gewählten Raum (Nutzertest Handy: Raum im Räume-Menü gewählt, Vorschau
    // blieb auf „Zuhause“). Nur bei echtem Raumwechsel neu zeichnen.
    wrap("_renderTabs", (orig) => function () {
      const r = orig.apply(this, arguments);
      if (on(this) && this._state && this._mPvRoom !== undefined && this._mPvRoom !== this._room) {
        requestAnimationFrame(() => {
          try {
            // Handy-Vorschau: Raumseite des gewählten Raums (wie beim Umschalten auf „Handy“).
            if (this._miniSize === "phone" && this._phoneRoomFilter) this._phoneFilter = this._phoneRoomFilter();
            if (this._rebuildPreview) this._rebuildPreview();
          } catch (e) { /* nächstes Zeichnen */ }
        });
      }
      this._mPvRoom = this._room;
      return r;
    });

    // Der Hinweis „Handy weicht … ab“ kommt nach dem Einpassen der Kopfzeile: danach neu einpassen.
    wrap("_renderReconcile", (orig) => function () {
      const r = orig.apply(this, arguments);
      if (on(this) && typeof this._bFitTools === "function") requestAnimationFrame(() => { try { this._bFitTools(); } catch (e) { /* nächstes Mal */ } });
      return r;
    });

    // ── Änderungen ───────────────────────────────────────────────────────────
    const flat = (sn) => sn.s.concat([sn.m || null]);
    P._mCtx = function () { return { roomName: (r) => this._roomLabel(r), tileName }; };
    P._mItems = function () {
      if (!this._state || !this._mBase || !(this._isDirty && this._isDirty())) return [];
      try { return changeItems(flat(this._mBase), flat(this._snap()), this._mCtx()); } catch (e) { return []; }
    };
    // Gespeicherter Stand eines Raums (für das Zurückbenennen im Raum-Namensfeld).
    P._savedRoom = function (room) {
      const R = (this._mBase && this._mBase.s && this._mBase.s[0] && this._mBase.s[0].rooms) || [];
      return (room && R.find((r) => r.path === room.path)) || null;
    };
    P._mChanges = function () { return this._mItems().map((x) => x.text); };
    // Eine Zeile der Liste zurücknehmen (Teil-Wiederherstellung aus dem gespeicherten Stand).
    // Läuft über den Rückgängig-Weg: ⌘Z holt die Änderung danach wieder.
    P._mRevertPlan = function (i) {
      if (!this._state || !this._mBase) return { why: "gone" };
      try { return revertLine(flat(this._mBase), flat(this._snap()), i, this._mCtx()); } catch (e) { return { why: "error" }; }
    };
    P._mRevert = function (i) {
      const text = (this._mItems()[i] || {}).text;
      const plan = this._mRevertPlan(i);
      if (!plan.state) return false;
      const now = this._snap();
      const p = this._pair;
      const target = { s: plan.state.slice(0, 4), m: p && p.safe !== false ? plan.state[4] : null };
      this._undoStack = (this._undoStack || []).concat([target]);
      this._mRedoing = true;
      this._bQuietUndo = true;
      try { this._undo(); } finally { this._mRedoing = false; this._bQuietUndo = false; }
      this._undoStack = (this._undoStack || []).concat([now]).slice(-50);
      this._bQuiet = true;
      try { this._markDirty(); } finally { this._bQuiet = false; }
      // „Wiederholen“ (⇧⌘Z) holt die Zeile zurück – wie ⌘Z (Nutzertest: Knopf war ausgegraut).
      this._mRedo = [now];
      this._mTakenBack = now;
      this._mPaintRedo();
      this._mPaintChanges();
      if (this._bToast && text) this._bToast(tr("Taken back") + ": " + text, { ms: 2600 });
      return true;
    };
    const countText = (n) => (n === 1 ? tr("1 change") : tr("{n} changes").replace("{n}", n));
    // „— Bearbeitet“ am Titel (casora-panel-b.js) wird „Bearbeitet · 3 Änderungen“ und öffnet die Liste.
    P._mPaintChanges = function () {
      if (!this.shadowRoot) return;
      clearTimeout(this._mChT);
      this._mChT = setTimeout(() => {
        const e = this.shadowRoot.querySelector(".toprow > .bedited");
        if (!e) return;
        const n = this._mChanges().length;
        e.textContent = tr("Edited") + (n ? " · " + countText(n) : "") + " ›";
        // Unter dem Titelknopf (Desktop: Raumtitel, Handy: Dashboard-Titel) ausrichten.
        const tb = this.shadowRoot.querySelector(isPhone(this) ? "#navtitle" : "#roomtitle");
        if (tb && tb.offsetParent) e.style.left = Math.max(0, tb.offsetLeft - (isPhone(this) ? 6 : 0)) + "px";
        if (!e._mWired) {
          e._mWired = true;
          e.classList.add("mlink");
          e.setAttribute("role", "button");
          e.tabIndex = 0;
          e.onclick = () => this._mShowChanges(e);
          e.onkeydown = (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); this._mShowChanges(e); } };
        }
        const t = (n ? countText(n) : tr("Edited")) + " – " + tr("show what changed");
        e.title = t;
        e.setAttribute("aria-label", t);
      }, 120);
    };
    // Nach dem Speichern: „Gespeichert · 3 Änderungen – in der Zeitreise als Stand 21:40“.
    wrap("_save", (orig) => async function () {
      const n = on(this) ? this._mChanges().length : 0;
      const ok = await orig.apply(this, arguments);
      if (ok && n && on(this) && this._bToast) {
        const time = new Date().toLocaleTimeString((this._hass && this._hass.language) || undefined, { hour: "2-digit", minute: "2-digit" });
        this._bToast(tr("Saved") + " · " + countText(n), { ms: 4000, sub: tr("In Rewind as the version from {t}").replace("{t}", time) });
      }
      return ok;
    });
    // taken: in diesem Fenster zurückgenommene Zeilen ({at, text}). Sie bleiben als Platzhalter an
    // ihrer Stelle stehen – nichts rutscht, „Speichern“ springt nicht unter den Mauszeiger.
    P._mShowChanges = function (anchor, taken) {
      this._mCss();
      clearTimeout(this._bSoftT);
      if (this._bToastHide) this._bToastHide();
      taken = taken || [];
      const items = this._mItems();
      const box = document.createElement("div");
      const h = document.createElement("h4");
      h.textContent = items.length ? countText(items.length) : tr("No unsaved changes");
      box.appendChild(h);
      if (items.length || taken.length) {
        const ul = document.createElement("ul");
        const rows = items.slice(0, 14).map((it, i) => ({ it, i }));
        taken.slice().sort((a, b) => a.at - b.at).forEach((x) => rows.splice(Math.min(x.at, rows.length), 0, { gone: x.text }));
        rows.forEach((row, pos) => {
          if (row.gone) {
            const li = document.createElement("li");
            li.className = "mline mgone";
            const t = document.createElement("span");
            t.className = "mtxt";
            t.textContent = row.gone;
            const b = document.createElement("button");
            b.type = "button";
            b.className = "mback";
            b.disabled = true;
            b.textContent = tr("Taken back");
            li.append(t, b);
            ul.appendChild(li);
            return;
          }
          const { it, i } = row;
          const li = document.createElement("li");
          li.className = "mline";
          const t = document.createElement("span");
          t.className = "mtxt";
          t.textContent = it.text;
          li.appendChild(t);
          const plan = this._mRevertPlan(i);
          const b = document.createElement("button");
          b.type = "button";
          b.className = "mback";
          b.textContent = tr("Take back");
          b.setAttribute("aria-label", tr("Take back") + ": " + it.text);
          if (!plan.state) {
            // Ehrlich ausgrauen statt still mehr zurückzunehmen als diese Zeile.
            b.disabled = true;
            const why = document.createElement("small");
            why.className = "mwhy";
            why.textContent = plan.with ? fill(tr("Only together with “{line}” – use Undo for both."), { line: plan.with })
              : tr("Tied to another change – use Undo.");
            li.appendChild(why);
          }
          b.onclick = () => {
            if (!this._mRevert(i)) return;
            // Liste offen lassen und neu zeichnen: man sieht, was übrig bleibt (und was zurückgenommen ist).
            this._mShowChanges(anchor, taken.concat([{ at: pos, text: it.text }]));
          };
          li.insertBefore(b, li.children[1] || null);
          ul.appendChild(li);
        });
        if (items.length > 14) { const li = document.createElement("li"); li.textContent = tr("{n} more").replace("{n}", items.length - 14); ul.appendChild(li); }
        box.appendChild(ul);
      }
      const acts = document.createElement("div");
      acts.className = "macts";
      const mk = (label, kbd, dis, run, cls) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = cls || "ghost";
        b.textContent = label;
        if (kbd && !isPhone(this)) { const k = document.createElement("span"); k.className = "mkbd"; k.textContent = kbd; b.appendChild(k); }
        b.disabled = !!dis;
        b.onclick = () => { this._mPopClose(); run(); };
        acts.appendChild(b);
      };
      const mac = isMac();
      mk(tr("Undo"), mac ? "⌘Z" : "Ctrl+Z", !(this._undoStack || []).length, () => this._undo());
      mk(tr("Redo"), mac ? "⇧⌘Z" : "Ctrl+Y", !(this._mRedo || []).length, () => this._redo());
      if (items.length) mk(tr("Save"), mac ? "⌘S" : "Ctrl+S", false, () => this._save(), "");
      // Fokus auf „Speichern“, nicht auf das erste „Zurücknehmen“ (Enter nähme sonst etwas zurück).
      const sv = acts.querySelector("button:not(.ghost)");
      if (sv) sv.setAttribute("data-autofocus", "");
      box.appendChild(acts);
      this._mPop(anchor, box, "mchg");
    };

    // Kleines Aufklappfenster (Handy: Blatt unten). Esc und Klick daneben schließen.
    P._mPop = function (anchor, content, cls) {
      this._mPopClose();
      const root = this.shadowRoot;
      const pop = document.createElement("div");
      pop.className = "mpop " + (cls || "");
      pop.setAttribute("role", "dialog");
      pop.appendChild(content);
      root.appendChild(pop);
      if (!isPhone(this) && anchor && anchor.getBoundingClientRect) {
        const r = anchor.getBoundingClientRect();
        const w = pop.offsetWidth;
        pop.style.top = Math.round(r.bottom + 8) + "px";
        // Links im Fenster (Titel) linksbündig, rechts (Werkzeuge) rechtsbündig zum Auslöser.
        const x = r.left + r.width / 2 < window.innerWidth / 2 ? r.left - 6 : r.right - w;
        pop.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - w - 12, x))) + "px";
      }
      const away = (ev) => { if (!ev.composedPath().includes(pop) && ev.composedPath()[0] !== anchor && !ev.composedPath().includes(anchor)) this._mPopClose(); };
      const key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); this._mPopClose(); if (anchor && anchor.focus) anchor.focus(); } };
      setTimeout(() => { root.addEventListener("pointerdown", away, true); }, 0);
      document.addEventListener("keydown", key, true);
      this._mPopOff = () => { root.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", key, true); pop.remove(); };
      const f = pop.querySelector("[data-autofocus]") || pop.querySelector("button:not([disabled])");
      if (f && !isPhone(this)) setTimeout(() => f.focus({ preventScroll: true }), 30);
      return pop;
    };
    P._mPopClose = function () { if (this._mPopOff) { const f = this._mPopOff; this._mPopOff = null; f(); } };

    // ── Werkzeugleiste: Lupe, Wiederholen, Änderungen ───────────────────────
    P._mTools = function () {
      const root = this.shadowRoot;
      const undo = root.getElementById("undo");
      if (!undo) return;
      icons();
      if (!root.getElementById("msearch")) {
        const b = document.createElement("button");
        b.id = "msearch";
        b.type = "button";
        b.className = "msearchbtn";
        b.setAttribute("data-no-i18n", "");
        b.innerHTML = svg("search", 2.1) + '<span class="mlab"></span><span class="mkb"></span>';
        b.querySelector(".mlab").textContent = tr("Search…");
        b.querySelector(".mkb").textContent = isMac() ? "⌘K" : "Ctrl+K";
        b.title = tr("Search") + " (" + (isMac() ? "⌘K" : "Ctrl+K") + ")";
        b.setAttribute("aria-label", tr("Search"));
        b.onclick = () => this._mSearch();
        const pill = undo.closest(".navpill");
        (pill || undo).before(b);
      }
      if (!root.getElementById("mredo")) {
        const b = document.createElement("button");
        b.id = "mredo";
        b.type = "button";
        b.className = "ghost icon";
        b.innerHTML = svg("redo", 2.1);
        b.title = tr("Redo") + " (" + (isMac() ? "⇧⌘Z" : "Ctrl+Y") + ")";
        b.setAttribute("aria-label", tr("Redo"));
        b.onclick = () => this._redo();
        undo.after(b);
      }
      this._mPaintRedo();
      this._mPaintChanges();
    };

    // Tastatur: ⌘K/Strg+K Suche, ⌘⇧Z/Strg+Y Wiederholen (nicht in Eingabefeldern).
    P._mKeys = function () {
      if (this._mKeyed) return;
      this._mKeyed = true;
      // Über _gOn: beim Verlassen des Panels wieder abgemeldet (sonst hält document die alte Instanz).
      this._gOn(document, "keydown", (ev) => {
        if (!this.isConnected || !this._state || !on(this)) return;
        const k = String(ev.key || "").toLowerCase();
        const mod = ev.metaKey || ev.ctrlKey;
        if (mod && !ev.altKey && !ev.shiftKey && k === "k") { ev.preventDefault(); this._mSearch(); return; }
        const t = ev.composedPath ? ev.composedPath()[0] : ev.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        if ((mod && ev.shiftKey && k === "z") || (ev.ctrlKey && !ev.metaKey && !ev.shiftKey && k === "y")) {
          if (!(this._mRedo || []).length) return;
          ev.preventDefault();
          ev.stopImmediatePropagation();
          this._redo();
        }
      }, true);
      // HA-Kürzel aus einem Buchstaben (a = Assist, e/c/d = Schnellsuche, m = My-Link, ? = Kürzel)
      // feuern im Studio nicht (Nutzertest 4: Tippen kurz vor dem Fokus im Suchfeld öffnete Assist).
      // HA lauscht auf window (Bubble) und lässt ein Ereignis mit defaultPrevented liegen – hier auf
      // document (Bubble), also nach den eigenen Tastenhandlern des Studios. Eingabefelder bleiben
      // unberührt (dort tippt man; HA ignoriert sie ohnehin).
      this._gOn(document, "keydown", (ev) => {
        if (!this.isConnected || ev.defaultPrevented || ev.metaKey || ev.ctrlKey || ev.altKey) return;
        if (String(ev.key || "").length !== 1 || ev.key === " ") return;
        const t = ev.composedPath ? ev.composedPath()[0] : ev.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
        ev.preventDefault();
      });
    };

    // ── Suche ───────────────────────────────────────────────────────────────
    const SECS = [
      // Das Design gilt für alle Dashboards (Einstellungen › Design, unten bei PAGES); hier bleibt die Bedienung.
      ["General", "Controls", "bedienung kopfzeile knöpfe assist schrift leerlauf startseite tablet leistung dialoge"],
      ["Weather", "Weather", "wetter temperatur vorhersage"], ["Time", "Time", "uhrzeit uhr datum uhrformat format 12 12h 12-stunden 12-stunden-uhr 24 24h 24-stunden stunden am pm"],
      ["Notifications", "Notifications", "glocke benachrichtigungen hinweise meldungen push"], ["Scenes", "Scenes", "szenen stimmung"],
      ["Now Playing", "Now Playing", "musik wiedergabe medien player"],
      ["Appearance", "Appearance", "raumname foto bild hintergrund hintergrundbild bewegungsmelder raum"],
    ];
    const PAGES = [
      ["design", "Design", "design theme look aussehen stil farbe farben hell dunkel weich glas nebel"],
      ["home", "Home & Devices", "haus geräte personen bereiche"], ["alerts", "Bell & Alerts", "glocke meldungen benachrichtigung push"],
      ["dashboards", "New Dashboards", "neue dashboards standard"], ["ai", "AI", "ki künstliche intelligenz assistent"],
      ["outdoor", "Outdoor & Price", "außen draußen strompreis"], ["vent", "Ventilation", "lüften lüftung fenster"],
      ["fuel", "Fuel prices", "tanken tankstelle sprit benzin diesel spritpreis tankerkönig"],
    ];
    P._mSearchItems = function () {
      const out = [];
      const rooms = rooms$(this);
      const go = (i) => {
        if (i === this._room) return;
        this._room = i;
        this._renderTabs();
        this._renderForm();
      };
      const sel = (s) => requestAnimationFrame(() => { this._bOpen = true; this._select(s); });
      // Aktionen
      // Weg dorthin („Einstellungen › Design“) – so lernt man die Menüs nebenbei.
      const way = (...xs) => xs.filter(Boolean).map((x) => tr(x)).join(" › ");
      const here = rooms[this._room];
      const A = (id, label, words, run, ok, path) => { if (ok !== false) out.push({ kind: "action", id: "a:" + id, label: tr(label), words, run, path }); };
      A("rewind", "Rewind", "zeitreise rewind versionen version früher frueher frühere stände stand wiederherstellen verlauf backup sicherung history zurück",
        () => { this._bOpen = true; this._cvFromMenu(); }, typeof this._cvFromMenu === "function" && !!this._dashUrl, way("Clock next to Undo"));
      A("look", "Change the look", "look ändern design wechseln theme farben farbe aussehen stil weich schrift",
        () => { if (this._casoraShowDesign) this._casoraShowDesign(); }, typeof this._casoraShowDesign === "function", way("Settings", "Design"));
      A("photo", "Change the photo", "foto ändern hintergrund hintergrundbild bild raumbild bild ändern",
        () => { this._bLeavePages && this._bLeavePages(); sel({ group: "rooms", key: "Appearance", label: "Appearance" }); }, !!here,
        here ? this._roomLabel(here) + " › " + tr("Appearance") : "");
      A("addtile", "Add a tile", "kachel hinzufügen neu gerät lampe licht steckdose schalter einfügen", () => this._bAddTile(), true, way("Content", "Tiles"));
      // Kachel-Optionen, die man unter anderem Namen sucht (Nutzertest 5: „rückfrage“ fand nichts).
      A("askfirst", "Ask before switching", "rückfrage rueckfrage bestätigen bestätigung nachfragen fragen vorher sicherheitsabfrage abfrage "
        + "absichern versehentlich aus versehen garage garagentor tor confirm", () => this._mGoTileOption("ask"), true, way("Tile", "Visibility & ask first"));
      A("whosees", "Who sees this?", "wer sieht sichtbar sichtbarkeit benutzer nutzer kind kinder person gast ausblenden verbergen verstecken "
        + "zugriff rechte berechtigung", () => this._mGoTileOption("who"), true, way("Tile", "Visibility & ask first"));
      A("ventpush", "Ventilation hints on the phone", "lüften lueften lüftung lüftungs-coach coach handy push benachrichtigung benachrichtigungen "
        + "mitteilung mitteilungen nachricht empfänger telefon smartphone iphone app fenster", () => { this._bOpen = true; this._csOpenPage("vent"); },
        typeof this._csOpenPage === "function", way("Settings", "Ventilation"));
      A("scene", "Save the current state as a scene", "szene speichern stimmung licht merken aktueller zustand",
        () => this._bSceneFromState(), typeof this._bSceneFromState === "function" && !!(this._hass && this._hass.user && this._hass.user.is_admin),
        way("Dashboard", "Scenes"));
      A("adjustlights", "Adjust the lights now", "licht lichter lampe lampen einstellen helligkeit dimmen jetzt stimmung szene",
        () => this._bSceneFromState(), typeof this._bSceneFromState === "function" && !!(this._hass && this._hass.user && this._hass.user.is_admin),
        way("Dashboard", "Scenes"));
      A("addroom", "Add Room…", "raum hinzufügen neu zimmer", () => this._addRoom(), true, way("Rooms"));
      A("arrange", "Arrange Rooms", "räume ordnen sortieren reihenfolge ausgeblendet einblenden", () => this._bRoomsOpen(), rooms.length > 1, way("Rooms"));
      A("hideroom", "Hide room", "raum ausblenden verstecken verbergen vorübergehend weg", () => this._mHideRoom(this._room, true),
        !!here && !isHome(this, here) && !(here.variables || {}).casora_hidden, here ? this._roomLabel(here) : "");
      A("qr", "Open on phone", "handy qr code smartphone öffnen teilen iphone", () => this._mQr(), !!this._dashUrl, way("Title menu"));
      A("undo", "Undo", "rückgängig zurück", () => this._undo(), !!(this._undoStack || []).length);
      A("redo", "Redo", "wiederholen vor", () => this._redo(), !!(this._mRedo || []).length);
      A("changes", "Show unsaved changes", "änderungen liste ungespeichert", () => this._mShowChanges(this.shadowRoot.querySelector(isPhone(this) ? "#more" : ".toprow > .bedited")),
        !!(this._isDirty && this._isDirty()));
      A("save", "Save", "speichern fertig sichern", () => this._save(), !!(this._isDirty && this._isDirty()));
      A("phone", "Phone preview", "handy mobil vorschau iphone", () => {
        const seg = [...this.shadowRoot.querySelectorAll("[data-size], .seg button")].find((b) => /mobil|phone/i.test(b.dataset.size || b.textContent));
        if (seg) seg.click();
      }, !isPhone(this));
      A("match", "Match Desktop and Phone", "angleichen unterschiede handy desktop", () => this._reviewDifferences(), typeof this._reviewDifferences === "function" && !!this._pair);
      A("tour", "Quick tour", "einführung hilfe tour erklärung", () => this._bIntro && this._bIntro(true));
      A("updates", "Updates", "update aktualisieren version neu", () => this._cuFromMenu(), typeof this._cuFromMenu === "function");
      // Räume
      rooms.forEach((r, i) => {
        const V = r.variables || {};
        out.push({ kind: "room", id: "r:" + i, label: this._roomLabel(r), sub: V.casora_hidden ? tr("Hidden") : "",
          words: "raum zimmer " + (r.path || ""), run: () => { go(i); this._bClose && this._bClose(); } });
      });
      // Kacheln
      rooms.forEach((r, i) => (r.tiles || []).forEach((t) => {
        const key = this._tileKey(t);
        const inner = (t.type === "conditional" && t.card) || t;
        // Auch über den Anzeigenamen des Geräts (Registry-Name, sonst friendly_name) zu finden.
        const H = this._hass || {}, eid = String(inner.entity || "");
        const reg = (H.entities || {})[eid], st = (H.states || {})[eid];
        const alias = [(reg && reg.name) || "", (st && st.attributes && st.attributes.friendly_name) || ""].join(" ");
        out.push({ kind: "tile", id: "t:" + key, label: tileName(t), sub: this._roomLabel(r), path: this._roomLabel(r) + " › " + tr("Tiles"), here: i === this._room, words: eid + " " + alias + " kachel",
          run: () => { go(i); sel({ group: "tiles", key, label: tileName(t) }); setTimeout(() => this._bFlash && this._bFlash("t:" + key), 200); } });
      }));
      // Geräte ohne Kachel (Nutzertest: ⌘K „Stehlampe“ fand nichts): „Kachel für … hinzufügen“,
      // in den Raum des Geräts. Nur beim Tippen sichtbar (searchRank), nie in der leeren Liste.
      if (typeof this._uxDevices === "function" && typeof this._uxAddDevice === "function") {
        let devs = [];
        try { devs = this._uxDevices().filter((c) => c.fresh); } catch (e) { devs = []; }
        devs.forEach((c) => {
          const ri = c.roomIndex;
          out.push({ kind: "device", id: "d:" + c.entity, label: fill(tr("Add tile for {name}"), { name: c.name }),
            path: ri >= 0 ? fill(tr("New in {room} – no tile yet"), { room: this._roomLabel(rooms[ri]) }) : tr("Without a room – no tile yet"),
            here: ri === this._room, words: c.name + " " + c.entity + " " + (c.area || "") + " " + (c.kind || "") + " gerät kachel hinzufügen neu",
            run: () => { this._bOpen = true; this._uxAddDevice(c, { direct: true }); } });
        });
      }
      // Geräte zum Einstellen (Nutzertest 5, H-T2: „Leselampe“ – ein Licht im Badge, ohne Kachel – fand
      // nichts): Lichter, Jalousien, Lüfter, Schalter, Thermostate mit Bereich öffnen HAs großes Gerätefenster.
      // Nur beim Tippen sichtbar (searchRank), wie „Kachel für … hinzufügen“.
      {
        const H = this._hass || {}, S = H.states || {}, E = H.entities || {}, D = H.devices || {}, AR = H.areas || {};
        const fresh = new Set(out.filter((x) => x.kind === "device").map((x) => x.id.slice(2)));
        Object.keys(S).filter((id) => /^(light|cover|fan|switch|climate)\./.test(id) && !fresh.has(id)).forEach((id) => {
          const reg = E[id] || {};
          if (reg.hidden || reg.entity_category) return;
          const area = reg.area_id || (D[reg.device_id] || {}).area_id || "";
          if (!area) return;
          const name = reg.name || (S[id].attributes || {}).friendly_name || id;
          out.push({ kind: "device", id: "e:" + id, label: fill(tr("Adjust {name}"), { name }), path: (AR[area] || {}).name || "",
            words: name + " " + id + " einstellen helligkeit dimmen bedienen öffnen gerät",
            run: () => this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } })) });
        });
      }
      // Badges: im offenen Raum alle eingeschalteten, sonst nur eingerichtete
      rooms.forEach((r, i) => {
        const V = r.variables || {};
        const keys = Object.keys(V).filter((k) => V[k] !== null && V[k] !== "" && V[k] !== undefined);
        BADGES.forEach(([bid, label]) => {
          if (V["show_" + bid] === false) return;
          if (i !== this._room && !keys.some((k) => BADGE_KEY[bid].test(k))) return;
          const own = V[bid + "_title"];
          out.push({ kind: "badge", id: "b:" + i + ":" + bid, label: own || tr(label), sub: this._roomLabel(r), path: this._roomLabel(r) + " › " + tr("Badges"), here: i === this._room, words: "badge " + tr(label) + " " + BADGE_WORDS[bid],
            run: () => { go(i); sel({ group: "badges", key: label, label }); } });
        });
      });
      // Einstellungen
      SECS.forEach(([key, label, words]) => out.push({ kind: "setting", id: "s:" + key, label: tr(label), sub: tr("This dashboard"), words,
        path: key === "Appearance" && here ? this._roomLabel(here) + " › " + tr(label) : way("Dashboard", label),
        run: () => { this._bLeavePages && this._bLeavePages(); sel({ group: "rooms", key, label: key }); } }));
      if (typeof this._csOpenPage === "function") {
        PAGES.forEach(([id, label, words]) => out.push({ kind: "setting", id: "p:" + id, label: tr(label), sub: tr("For all dashboards"), words, path: way("Settings", label),
          run: () => { this._bOpen = true; this._csOpenPage(id); } }));
      }
      // Szenen
      (this._sceneCatalog ? this._sceneCatalog() : []).forEach((s) => out.push({ kind: "scene", id: "sc:" + s.id, label: s.label, words: s.id + " szene", path: way("Dashboard", "Scenes"),
        run: () => { this._bLeavePages && this._bLeavePages(); sel({ group: "rooms", key: "Scenes", label: "Scenes" }); } }));
      return out;
    };
    // ⌘K → Kachel-Option: die gewählte Kachel (sonst die erste passende, zuerst im offenen Raum)
    // öffnen, „Sichtbarkeit & Rückfrage“ aufklappen und die Zeile kurz hervorheben.
    P._mGoTileOption = function (kind) {
      const rooms = rooms$(this);
      const fits = (t) => {
        if (kind !== "ask") return true;
        const inner = (t.type === "conditional" && t.card) || t;
        const ty = I().tileTypeAny ? I().tileTypeAny(inner) : null;
        return !!(ty && (ty.fields || []).some((f) => f.key === "show_toggle")) || switchesSomething(inner);
      };
      let ri = this._room;
      let tile = this._sel && this._sel.group === "tiles" ? ((rooms[ri] || {}).tiles || []).find((t) => this._tileKey(t) === this._sel.key && fits(t)) : null;
      if (!tile) tile = ((rooms[ri] || {}).tiles || []).find(fits);
      if (!tile) rooms.some((r, i) => { const t = (r.tiles || []).find(fits); if (t) { ri = i; tile = t; } return !!t; });
      if (!tile) { if (this._bToast) this._bToast(tr(kind === "ask" ? "No tile switches anything yet." : "No tiles yet.")); return; }
      if (ri !== this._room) { this._room = ri; this._renderTabs(); this._renderForm(); }
      const key = this._tileKey(tile);
      this._bLeavePages && this._bLeavePages();
      this._bOpen = true;
      this._select({ group: "tiles", key, label: tileName(tile) });
      const show = (n) => {
        const box = this.shadowRoot.querySelector("#pane #band-tiles .tile.sel");
        const row = box && box.querySelector(kind === "ask" ? ".row.mask" : ".mwho");
        if (!row) { if (n > 0) setTimeout(() => show(n - 1), 120); return; }
        const fold = row.closest(".adv");
        const sum = fold && fold.querySelector(":scope > .advsum");
        if (fold && !fold.classList.contains("open") && sum) sum.click();
        setTimeout(() => {
          row.scrollIntoView({ block: "center", behavior: "smooth" });
          row.classList.remove("mhi"); void row.offsetWidth; row.classList.add("mhi");
          setTimeout(() => row.classList.remove("mhi"), 1900);
        }, 80);
      };
      setTimeout(() => show(12), 60);
      if (kind === "ask" && this._bToast) this._bToast(fill(tr("Every tile that switches has this – here: {name}"), { name: tileName(tile) }));
    };
    const KIND = { action: "Action", room: "Room", tile: "Tile", badge: "Badge", setting: "Setting", scene: "Scene", device: "Device" };
    P._mSearch = function () {
      if (!this._state) return;
      this._mCss();
      clearTimeout(this._bSoftT);
      if (this._bToastHide) this._bToastHide();
      this._mPopClose();
      if (this._openCombo) this._openCombo();
      const root = this.shadowRoot;
      const old = root.querySelector(".msearch");
      if (old) { old.querySelector("input").focus(); return; }
      const from = root.activeElement;
      const items = this._mSearchItems();
      const wrapEl = document.createElement("div");
      wrapEl.className = "msearch";
      wrapEl.innerHTML = '<div class="mbox" role="dialog" aria-modal="true"><div class="mfield">' + svg("search", 2.2)
        + '<input type="text" enterkeyhint="go" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="mres" aria-autocomplete="list">'
        + '<span class="mesc">esc</span></div><div class="mres" id="mres" role="listbox"></div></div>';
      const input = wrapEl.querySelector("input");
      input.placeholder = tr("Search rooms, tiles, settings…");
      input.setAttribute("aria-label", tr("Search"));
      input.setAttribute("data-no-i18n", "");
      if (isPhone(this)) wrapEl.querySelector(".mesc").remove();
      const res = wrapEl.querySelector(".mres");
      let list = [], at = 0;
      const close = (refocus) => {
        document.removeEventListener("keydown", esc, true);
        wrapEl.remove();
        if (refocus && from && from.focus) from.focus();
      };
      const run = (it) => { close(false); try { it.run(); } catch (e) { console.warn("Casora Studio:", e); } };
      const paint = () => {
        res.innerHTML = "";
        const q = input.value.trim();
        if (!q) {
          const pick = ["a:photo", "a:addtile", "a:scene", "a:rewind", "a:look"];
          list = pick.map((id) => items.find((x) => x.id === id)).filter(Boolean)
            .concat(items.filter((x) => x.kind === "room"));
        } else list = searchRank(items, q, 40);
        at = Math.min(at, Math.max(0, list.length - 1));
        if (!list.length) {
          const e = document.createElement("div");
          e.className = "mempty";
          e.textContent = tr("Nothing found. Try a room, a device or “Rewind”.");
          e.setAttribute("data-no-i18n", "");
          res.appendChild(e);
          input.removeAttribute("aria-activedescendant");
          return;
        }
        let lastHead = null;
        list.forEach((it, k) => {
          const head = !q ? (it.kind === "room" ? tr("Rooms") : tr("Frequent")) : null;
          if (head && head !== lastHead) {
            lastHead = head;
            const h = document.createElement("div");
            h.className = "mhead";
            h.textContent = head;
            h.setAttribute("data-no-i18n", "");
            res.appendChild(h);
          }
          const b = document.createElement("button");
          b.type = "button";
          b.className = "mrow" + (k === at ? " on" : "");
          b.id = "mopt" + k;
          b.setAttribute("role", "option");
          b.setAttribute("aria-selected", k === at ? "true" : "false");
          b.setAttribute("data-no-i18n", "");
          b.innerHTML = '<span class="mtx"><b></b><span class="msub"></span></span><span class="mkind"></span>';
          b.querySelector("b").textContent = it.label;
          b.querySelector(".msub").textContent = it.path || it.sub || "";
          b.querySelector(".mkind").textContent = tr(KIND[it.kind] || "");
          b.onpointermove = () => { if (at !== k) { at = k; mark(); } };
          b.onclick = () => run(it);
          res.appendChild(b);
        });
        mark();
      };
      const mark = () => {
        res.querySelectorAll(".mrow").forEach((b, k) => { b.classList.toggle("on", k === at); b.setAttribute("aria-selected", k === at ? "true" : "false"); });
        input.setAttribute("aria-activedescendant", "mopt" + at);
        const cur = res.querySelector("#mopt" + at);
        if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
      };
      input.addEventListener("input", () => { at = 0; paint(); });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
          ev.preventDefault();
          if (!list.length) return;
          at = (at + (ev.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
          mark();
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          if (list[at]) run(list[at]);
        }
      });
      const esc = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(true); } };
      document.addEventListener("keydown", esc, true);
      wrapEl.addEventListener("pointerdown", (ev) => { if (ev.target === wrapEl) close(true); });
      root.appendChild(wrapEl);
      paint();
      // Sofort fokussieren: sonst landeten Buchstaben, die direkt nach dem Klick kamen, beim Knopf
      // (und in HA-Kürzeln). Der zweite Versuch fängt Fokus-Diebe (Toast, Popover) danach ab.
      input.focus();
      setTimeout(() => { if (wrapEl.isConnected && root.activeElement !== input) input.focus(); }, 20);
    };

    // ── QR-Code „Auf Handy öffnen“ ──────────────────────────────────────────
    P._mDashLink = function () {
      const H = this._hass || {};
      const cfg = H.config || {};
      const base = String(cfg.external_url || cfg.internal_url || location.origin || "").replace(/\/+$/, "");
      const stem = String(this._dashUrl || "").replace(/[-_]mobile$/i, "");
      const list = this._dashList || [];
      const phone = list.find((d) => d.url_path === stem + "-mobile") ? stem + "-mobile" : stem;
      return { url: base + "/" + phone, external: !!cfg.external_url };
    };
    P._mQr = async function () {
      if (!this._dashUrl) return;
      this._mCss();
      const link = this._mDashLink();
      let code = "";
      try { code = qrSvg(link.url); } catch (e) { code = ""; }
      await this._ask({
        title: tr("Open on phone"),
        confirmLabel: tr("Done"),
        extend: ({ box, acts, cancel }) => {
          const q = document.createElement("div");
          q.className = "mqr";
          q.innerHTML = '<div class="mcode"></div><div class="murl" data-no-i18n></div><p class="mhint"></p>';
          // Ohne Code (Adresse zu lang) nur Link und „Link kopieren“ zeigen.
          const mc = q.querySelector(".mcode");
          mc.innerHTML = code;
          const svg = mc.querySelector("svg");
          if (svg) svg.setAttribute("aria-label", tr("QR code for this dashboard"));
          else mc.remove();
          q.querySelector(".murl").textContent = link.url;
          q.querySelector(".mhint").textContent = tr("Scan it with the phone's camera. The phone has to reach Home Assistant – on the same Wi-Fi or through your external address. No password is included.");
          box.insertBefore(q, acts);
          cancel.textContent = tr("Copy link");
          cancel.onclick = (ev) => {
            ev.stopPropagation();
            const done = () => { cancel.textContent = tr("Copied"); };
            try { navigator.clipboard.writeText(link.url).then(done, done); } catch (e) { done(); }
          };
        },
      });
    };
    wrap("_bDocItems", (orig) => function () {
      const items = orig.apply(this, arguments);
      if (!this._dashUrl || this._flowMode) return items;
      icons();
      const at = items.findIndex((x) => x.id === "doc:addmobile" || x.id === "doc:delete");
      const it = { id: "doc:qr", label: "Open on phone…", icon: "qr", group: "This dashboard" };
      const out = items.slice();
      out.splice(at >= 0 ? at : out.length, 0, it);
      return out;
    });
    wrap("_bDocPick", (orig) => function (id) {
      if (id === "doc:qr") { this._bRooms = false; this._mQr(); return true; }
      return orig.apply(this, arguments);
    });

    // ── Menüs: Suche, Wiederholen, Änderungen (Handy „…“); Raum ausblenden (Raummenü) ──
    wrap("_menuAt", (orig) => function (anchor, items, onPick, mopts) {
      if (on(this) && Array.isArray(items)) {
        icons();
        // Handy „…“: Suchen oben, Wiederholen unter Rückgängig, Änderungen ansehen.
        const u = items.findIndex((x) => x && x.id === "undo");
        if (isPhone(this) && u >= 0 && items.some((x) => x && x.id === "hints") && !items.some((x) => x && x.id === "msearch")) {
          items = items.slice();
          const g = items[u].group;
          const n = this._mChanges().length;
          const extra = [{ id: "mredo", label: "Redo", icon: "redo", group: g, quiet: true, disabled: !(this._mRedo || []).length }];
          if (n) extra.push({ id: "mchanges", label: countText(n) + "…", icon: "list", group: g, quiet: true });
          items.splice(u + 1, 0, ...extra);
          items.unshift({ id: "msearch", label: "Search…", icon: "search", group: g, quiet: true });
          const pick = onPick;
          const more = anchor;
          onPick = (id) => (id === "msearch" ? setTimeout(() => this._mSearch(), 60)
            : id === "mredo" ? this._redo()
              : id === "mchanges" ? setTimeout(() => this._mShowChanges(more), 60) : pick(id));
        }
        // „…“: „Auf Handy öffnen“ auch hier (Nutzertest: dort zuerst gesucht, lag nur im Titelmenü).
        const hi = items.findIndex((x) => x && x.id === "hints");
        if (hi >= 0 && this._dashUrl && !this._flowMode && !items.some((x) => x && x.id === "mqr")) {
          items = items.slice();
          items.splice(hi, 0, { id: "mqr", label: "Open on phone…", icon: "qr", group: items[hi].group });
          const pick0 = onPick;
          onPick = (id) => (id === "mqr" ? setTimeout(() => this._mQr(), 60) : pick0(id));
        }
        // Raummenü: ausblenden bzw. wieder einblenden; ausgeblendete Räume in der Liste gekennzeichnet.
        if (items.some((x) => x && x.id === "rename" && x.group === "This Room")) {
          const rooms = rooms$(this);
          const room = rooms[this._room];
          const hidden = !!(room && (room.variables || {}).casora_hidden);
          items = items.map((x) => {
            const m = x && /^go:(\d+)$/.exec(x.id || "");
            const r = m && rooms[+m[1]];
            return r && (r.variables || {}).casora_hidden ? { ...x, label: x.label + " · " + tr("Hidden") } : x;
          });
          // Ausgeblendete Räume oben, je Raum „… · Einblenden“ mit einem Tipp (Nutzertest 4, E-T6: der Weg
          // über „1 Raum ausgeblendet“ → Räume ordnen → Einblenden waren 7 Schritte). Viele: wie bisher
          // ein Hinweis, der zu „Räume ordnen“ führt.
          const hid = rooms.map((r, i) => ({ r, i })).filter((x) => (x.r.variables || {}).casora_hidden);
          const nHid = hid.length;
          const first = items.findIndex((x) => x && /^go:/.test(x.id || ""));
          const grp = (items[first] || {}).group || "Rooms";
          if (nHid && nHid <= 3) {
            items.splice(first >= 0 ? first : 0, 0, ...hid.map((x) => ({ id: "mshow:" + x.i,
              label: this._roomLabel(x.r) + " · " + tr("Show again"), icon: "eye", group: grp, quiet: true })));
          } else if (nHid && typeof this._bRoomsOpen === "function") {
            items.splice(first >= 0 ? first : 0, 0, { id: "mhidden", label: fill(tr("{n} rooms hidden ›"), { n: nHid }),
              icon: "eyeoff", group: grp, quiet: true });
          }
          const at = items.findIndex((x) => x && x.id === "delete");
          const home = room && isHome(this, room);
          items.splice(at >= 0 ? at : items.length, 0, {
            id: "mhide", label: hidden ? "Show room again" : "Hide room", icon: hidden ? "eye" : "eyeoff", group: "This Room", quiet: true,
            disabled: !!home && !hidden, why: home ? tr("The overview is always shown.") : undefined,
          });
          const pick = onPick;
          onPick = (id) => (id === "mhide" ? this._mHideRoom(this._room, !hidden)
            : /^mshow:\d+$/.test(id) ? this._mHideRoom(+id.slice(6), false)
              : id === "mhidden" ? setTimeout(() => this._bRoomsOpen(), 60) : pick(id));
        }
      }
      return orig.call(this, anchor, items, onPick, mopts);
    });

    // ── Raum ausblenden ─────────────────────────────────────────────────────
    P._mHideRoom = function (i, hide) {
      const r = rooms$(this)[i];
      if (!r || (hide && isHome(this, r))) return;
      r.variables = r.variables || {};
      if (hide) r.variables.casora_hidden = true; else delete r.variables.casora_hidden;
      this._bQuiet = true;
      try { this._markDirty(); } finally { this._bQuiet = false; }
      this._renderTabs();
      this._renderForm();
      // Vorschau neu: Auge an der Raumleiste und Zähler „N ausgeblendet“ (Nutzertest 7: blieben stehen).
      if (this._rebuildPreview) this._rebuildPreview();
      if (this._bToast) {
        this._bToast(tr(hide ? "Room hidden" : "Room shown again") + ": " + this._roomLabel(r), {
          sub: hide ? tr("It stays here with all its settings. Saving hides it on the dashboard.") : "", save: true,
          action: { label: tr("Undo"), run: () => this._mHideRoom(i, !hide) },
        });
      }
    };
    wrap("_bRoomsPaint", (orig) => function () {
      const r = orig.apply(this, arguments);
      try {
        const rooms = rooms$(this);
        this.shadowRoot.querySelectorAll("#pane .brow").forEach((row) => {
          const room = rooms[+row.dataset.i];
          const hid = !!(room && (room.variables || {}).casora_hidden);
          row.classList.toggle("mhid", hid);
          let tag = row.querySelector(".mshow");
          if (hid && !tag) {
            tag = document.createElement("button");
            tag.type = "button";
            tag.className = "mshow";
            tag.textContent = tr("Show again");
            tag.title = tr("Hidden on the dashboard – tap to show it again");
            tag.setAttribute("data-no-i18n", "");
            tag.onclick = (ev) => { ev.stopPropagation(); this._mHideRoom(+row.dataset.i, false); this._bRoomsFocus && this._bRoomsFocus(+row.dataset.i); };
            const grip = row.querySelector(".bgrip");
            if (grip) grip.before(tag); else row.appendChild(tag);
            row.setAttribute("aria-label", row.getAttribute("aria-label") + ", " + tr("Hidden"));
          } else if (!hid && tag) tag.remove();
        });
      } catch (e) { console.warn("Casora Studio:", e); }
      return r;
    });

    // ── Wer sieht das? ──────────────────────────────────────────────────────
    P._mUsers = function () {
      if (!this._mUsersP && this._hass && this._hass.callWS) {
        this._mUsersP = this._hass.callWS({ type: "config/auth/list" }).then((list) => (list || [])
          .filter((u) => u && !u.system_generated && u.is_active !== false)
          .map((u) => ({ id: u.id, name: u.name || u.username || u.id, admin: !!(u.is_owner || (u.group_ids || []).includes("system-admin")) }))
          .sort((a, b) => a.name.localeCompare(b.name)), () => { this._mUsersP = null; return []; });
      }
      return this._mUsersP || Promise.resolve([]);
    };
    const WHO_ONLY_HIDES = "Only hides it – no access protection. Anyone with an account can still control the devices in Home Assistant.";
    const namesOf = (ids, users) => ids.map((id) => (users.find((u) => u.id === id) || {}).name || tr("Unknown user"));
    // Zeile „Wer sieht das?“: Wert „Alle“ bzw. „Nur für: …“, Antippen öffnet die Auswahl.
    P._mWhoRow = function (host, get, set, what, elsewhere, opt) {
      opt = opt || {};
      const box = document.createElement("div");
      box.className = "mwho";
      const row = document.createElement("div");
      row.className = "row";
      const l = document.createElement("label");
      l.textContent = tr("Who sees this?");
      l.setAttribute("data-no-i18n", "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mval ghost";
      btn.setAttribute("data-no-i18n", "");
      btn.innerHTML = '<span class="mvt"></span>' + svg("users", 2);
      row.append(l, btn);
      const note = document.createElement("div");
      note.className = "mnote";
      note.setAttribute("data-no-i18n", "");
      // Ehrlich sagen, was es ist: nur Ausblenden im Dashboard, kein Zugriffsschutz.
      const warn = document.createElement("div");
      warn.className = "hint mwhowarn";
      warn.setAttribute("data-no-i18n", "");
      warn.textContent = tr(WHO_ONLY_HIDES);
      // Nutzertest 5 (H-T4): dasselbe Gerät kann woanders weiter zu sehen sein (z. B. Sicherheits-Badge auf „Zuhause“).
      const also = document.createElement("div");
      also.className = "hint mwhoalso";
      also.setAttribute("data-no-i18n", "");
      also.hidden = true;
      const alsoFix = document.createElement("button");
      alsoFix.type = "button";
      alsoFix.className = "mval ghost mwhofix";
      alsoFix.setAttribute("data-no-i18n", "");
      alsoFix.textContent = tr("Hide it there too");
      alsoFix.hidden = true;
      // Gespeichert wird, wer es sieht – ein später angelegter HA-Benutzer steht nicht in der Liste.
      const fresh = document.createElement("div");
      fresh.className = "hint mwhonew";
      fresh.setAttribute("data-no-i18n", "");
      fresh.textContent = tr("New users only see this once you switch them on here.");
      fresh.hidden = true;
      box.append(row, note, also, alsoFix, fresh, warn);
      const paint = (users) => {
        const ids = get();
        const more = ids.length && typeof elsewhere === "function" ? elsewhere(ids, users || []) : "";
        also.textContent = more;
        also.hidden = !more;
        const fx = more && typeof opt.fix === "function" ? opt.fix(ids, users || []) : [];
        alsoFix.hidden = !fx.length;
        alsoFix.onclick = () => {
          const list = opt.fix(get(), this._mUsersCache || users || []);
          if (!list.length) return;
          list.forEach((f) => f());
          this._bQuiet = true; try { this._markDirty(); } finally { this._bQuiet = false; }
          if (this._syncPreview) this._syncPreview();
          if (this._bToast) this._bToast(tr("Hidden there too"), { save: true, sub: more });
          this._mUsers().then(paint);
        };
        btn.querySelector(".mvt").textContent = ids.length ? tr("Only some people") : tr("Everyone");
        note.textContent = ids.length ? tr("Only for:") + " " + namesOf(ids, users || []).join(", ") : "";
        note.hidden = !ids.length;
        warn.hidden = !ids.length;
        fresh.hidden = !ids.length;
      };
      paint([]);
      this._mUsers().then(paint);
      btn.onclick = () => this._mWhoSheet(get(), what, (ids) => { set(ids); this._bQuiet = true; try { this._markDirty(); } finally { this._bQuiet = false; } this._syncPreview && this._syncPreview(); this._mUsers().then(paint);
        if (this._bToast) this._bToast(ids.length ? tr("Only for:") + " " + namesOf(ids, this._mUsersCache || []).join(", ") : tr("Everyone sees it again"), { save: true, sub: tr("Not saved yet – “Save now” or Done saves it.") });
      });
      if (opt.before && opt.before.parentNode === host) host.insertBefore(box, opt.before);
      else host.appendChild(box);
      return box;
    };
    // Wo sind diese Entitäten sonst noch zu sehen – für wen, den „ids“ ausblendet? Kacheln (mit ihrem
    // „Wer sieht das?“) und Sicherheits-Badges (Badge-Freigabe; Kachel-Freigaben gelten dort mit,
    // casora_entity_users). skip: die Stelle, um die es gerade geht. → Satz oder "".
    const SEC_KEYS = (V) => [].concat(Array.isArray(V.security_locks) ? V.security_locks : [], V.security_lock_entity || [], V.security_lock_entity_2 || [],
      Array.isArray(V.security_cameras) ? V.security_cameras : [], [1, 2, 3, 4, 5, 6, 7, 8].map((i) => V["security_entity_" + i]).filter(Boolean));
    P._mElsewhere = function (ents, ids, users, skip) { return this._mElseScan(ents, ids, users, skip).text; };
    // Dieselben Stellen als Änderungen: „Dort auch ausblenden“ (Nutzertest 7, P-T4) gibt ihnen dieselbe
    // Auswahl – war dort schon eingeschränkt, bleibt nur, wer an beiden Stellen sehen darf.
    P._mElsewhereFix = function (ents, ids, users, skip) { return this._mElseScan(ents, ids, users, skip).fixes; };
    P._mElseScan = function (ents, ids, users, skip) {
      const none = { text: "", fixes: [] };
      const want = new Set(ents.filter((x) => typeof x === "string" && x));
      if (!want.size || !ids.length) return none;
      const gone = users.filter((u) => ids.indexOf(u.id) < 0);
      if (!gone.length) return none;
      const fixes = [];
      const narrow = (cur) => { const both = cur.length ? cur.filter((x) => ids.indexOf(x) >= 0) : ids.slice(); return both.length ? both : ids.slice(); };
      const rooms = rooms$(this);
      const eu = I().entityUsers ? I().entityUsers(rooms) : {};
      const allowed = (list, u) => !list.length || list.indexOf(u.id) >= 0;
      const places = [], who = new Set();
      rooms.forEach((r, ri) => {
        (r.tiles || []).forEach((t) => {
          if (skip && skip.tile === t) return;
          const inner = (t.type === "conditional" && t.card) || t;
          if (!want.has(inner.entity)) return;
          const hit = gone.filter((u) => allowed(tileUsers(t), u));
          if (hit.length) {
            hit.forEach((u) => who.add(u.name)); places.push(this._roomLabel(r) + " (" + tileName(t) + ")");
            fixes.push(() => setTileUsers(t, narrow(tileUsers(t))));
          }
        });
        const V = r.variables || {};
        if (skip && skip.badge === ri) return;
        if (V.show_security === false) return;
        const sec = SEC_KEYS(V).filter((e) => want.has(e));
        if (!sec.length) return;
        const bu = ((V.casora_badge_users || {}).security) || [];
        const hit = gone.filter((u) => allowed(bu, u) && sec.some((e) => allowed(eu[e] || [], u)));
        if (hit.length) {
          hit.forEach((u) => who.add(u.name)); places.push(this._roomLabel(r) + " (" + tr("Security") + ")");
          fixes.push(() => {
            r.variables = r.variables || {};
            const m = { ...(r.variables.casora_badge_users || {}) };
            m.security = narrow(Array.isArray(m.security) ? m.security : []);
            r.variables.casora_badge_users = m;
          });
        }
      });
      if (!places.length) return none;
      return { text: fill(tr("{names} still sees it here: {places}"), { names: Array.from(who).join(", "), places: places.join(", ") }), fixes, places };
    };

    P._mWhoSheet = async function (cur, what, done) {
      const users = await this._mUsers();
      this._mUsersCache = users;
      // Schalter = „sieht es“. Ohne Einschränkung stehen alle an – wer es nicht sehen soll, wird
      // ausgeschaltet (Nutzertest 3: man wollte das Kind abwählen, musste aber sich selbst wählen).
      const pick = new Set(cur.length ? cur : users.map((u) => u.id));
      const ok = await this._ask({
        title: tr("Who sees this?"),
        message: tr(what) + " – " + tr("Switch off whoever should not see it. Everyone on means everyone. Admins always see everything here in the Studio.") + " " + tr(WHO_ONLY_HIDES),
        confirmLabel: tr("Done"),
        extend: ({ box, acts }) => {
          box.classList.add("mwhosheet");
          const list = document.createElement("div");
          list.className = "mlist";
          users.forEach((u) => {
            const r = document.createElement("div");
            r.className = "mu";
            const t = document.createElement("span");
            t.setAttribute("data-no-i18n", "");
            t.textContent = u.name;
            if (u.admin) { const s = document.createElement("small"); s.textContent = tr("Administrator"); t.appendChild(s); }
            const sw = this._boolSwitch(pick.has(u.id), false, (v) => { if (v) pick.add(u.id); else pick.delete(u.id); }, u.name);
            r.append(t, sw);
            list.appendChild(r);
          });
          if (!users.length) { const e = document.createElement("div"); e.className = "hint"; e.textContent = tr("No other Home Assistant users found."); list.appendChild(e); }
          box.insertBefore(list, acts);
        },
      });
      if (!ok) return;
      let ids = users.map((u) => u.id).filter((id) => pick.has(id));
      // Niemand an: nichts ändern – gespeichert hieße das sonst „alle sehen es“ (Review 1.1.1).
      // Für alle weg geht über „Kachel aus“ bzw. „Raum ausblenden“.
      if (users.length && !ids.length) {
        if (this._bToast) this._bToast(tr("Nobody switched on – nothing changed"), { sub: tr("To hide it from everyone, switch it off.") });
        return;
      }
      // Alle an = alle sehen es (ohne Einschränkung, auch für später angelegte Benutzer).
      if (ids.length === users.length) ids = [];
      if (J(ids) !== J(cur)) done(ids);
    };

    // Was eine Kachel schalten oder fahren kann (Tipp, Symbol, Popup-Knöpfe) – dort fragt das Dashboard nach.
    const SWITCH_DOMAINS = ["light", "switch", "input_boolean", "fan", "cover", "lock", "valve", "humidifier",
      "climate", "media_player", "siren", "scene", "script", "button", "input_button"];
    const switchesSomething = (t) => {
      const v = (t && t.variables) || {};
      const ids = [t && t.entity, v.cover_entity, v.action_1_entity, v.action_2_entity]
        .concat(Array.isArray(v.covers) ? v.covers : [], Array.isArray(v.locks) ? v.locks : []);
      return ids.some((id) => typeof id === "string" && SWITCH_DOMAINS.includes(id.split(".")[0]));
    };
    P._mSwitchesSomething = switchesSomething;

    // Kachel: visibility (HA-Bedingung „user“) an der Kachel bzw. ihrer Hülle.
    const tileUsers = (t) => {
      const c = t && Array.isArray(t.visibility) ? t.visibility.find((x) => x && x.condition === "user" && Array.isArray(x.users)) : null;
      return c ? c.users.slice() : [];
    };
    const setTileUsers = (t, ids) => {
      const rest = Array.isArray(t.visibility) ? t.visibility.filter((x) => !(x && x.condition === "user")) : [];
      if (ids.length) rest.push({ condition: "user", users: ids.slice() });
      if (rest.length) t.visibility = rest; else delete t.visibility;
    };
    P._mDecorateEditors = function () {
      const root = this.shadowRoot;
      const pane = root.getElementById("pane");
      const room = rooms$(this)[this._room];
      if (!pane || !room) return;
      // Kachel
      if (this._sel && this._sel.group === "tiles") {
        const box = pane.querySelector("#band-tiles .tile.sel");
        const body = box && box.querySelector(".tbody");
        const shell = (room.tiles || []).find((t) => this._tileKey(t) === this._sel.key);
        if (body && shell && !body.querySelector(".mwho")) {
          // Eigene Gruppe wie „Optionen“ (subcard), vor dem aufklappbaren „Popup“.
          const group = document.createElement("div");
          group.className = "subcard mgroup";
          const subs = body.querySelectorAll(":scope > .subcard");
          if (subs.length) subs[subs.length - 1].after(group); else body.appendChild(group);
          const inner = (shell.type === "conditional" && shell.card) || shell;
          // Kacheln, die etwas schalten oder fahren: mit An/Aus-Schalter (Feld show_toggle) oder mit
          // einer schaltbaren Entität (Nutzertest 5: Garagentor/Jalousie hatten die Option nicht).
          const ty = I().tileTypeAny ? I().tileTypeAny(inner) : null;
          const tf = ty && (ty.fields || []).find((f) => f.key === "show_toggle");
          if (tf || switchesSomething(inner)) {
            const r = document.createElement("div");
            r.className = "row mask";
            const l = document.createElement("label");
            l.textContent = tr("Ask before switching");
            l.setAttribute("data-no-i18n", "");
            const V = inner.variables || {};
            const sw = this._boolSwitch(V.confirm_toggle === true, false, (v) => {
              if (v) { inner.variables = inner.variables || {}; inner.variables.confirm_toggle = true; }
              else if (inner.variables) { delete inner.variables.confirm_toggle; if (!Object.keys(inner.variables).length) delete inner.variables; }
              // Eigene Meldung unten – nicht vom allgemeinen „Übernommen“ überdecken lassen.
              this._bQuiet = true;
              try { this._markDirty(); } finally { this._bQuiet = false; }
              // Ausprobieren geht jetzt auch hier: das Popup unter der Vorschau fragt ebenfalls (Nutzertest 3).
              // Nutzertest 4 (iPad): der Hinweis nannte „Popup anzeigen unter der Vorschau“, der Knopf lag
              // aber unter dem Rand bzw. erschien erst nach erneutem Antippen – jetzt öffnet der Toast es selbst.
              const target = v && !isPhone(this) && typeof this._cpOpen === "function" && typeof this._cpTarget === "function" ? this._cpTarget() : null;
              // Nutzertest 5 (H-T5): nach ~6 s war „Ausprobieren“ weg – länger stehen lassen, dazu der Knopf unten.
              if (try_) { try_.hidden = !v || !(canTry() || canAsk()); try_.textContent = tr(canTry() ? "Try it in the popup" : "Try the question"); }
              if (this._bToast) this._bToast(tr(v ? "The dashboard asks before switching" : "Switches right away again"),
                target ? { ms: 15000, save: true, sub: tr("The popup in the preview asks too. Not saved yet."),
                  action: { label: tr("Try it"), run: () => { this._cpDismissed = null; const t = this._cpTarget(); if (t) this._cpOpen(t); } } }
                  : v && canAsk() ? { ms: 15000, save: true, sub: tr("Not saved yet – “Save now” or Done saves it."), action: { label: tr("Try it"), run: askNow } }
                  : { save: true, sub: tr("Not saved yet – “Save now” or Done saves it.") });
            }, tr("Ask before switching"));
            r.append(l, sw);
            const h = document.createElement("div");
            h.className = "hint";
            // Seit dem Nutzertest fragt jeder Schaltweg der Kachel nach, auch das Popup (casora-core.js).
            const moves = /^(cover|valve)\./.test(String(inner.entity || inner.variables && inner.variables.cover_entity || ""));
            h.textContent = moves
              ? tr("A calm question before this opens or closes – on the tile and in its popup. For the garage door, the gate or the blinds.")
              : tr("A calm question before this device turns on or off – on the tile and in its popup. For the oven, the garage or the pump.");
            h.setAttribute("data-no-i18n", "");
            // Dauerhafter Weg zum Ausprobieren (nicht nur im Toast): öffnet das Popup der Vorschau.
            const canTry = () => !isPhone(this) && typeof this._cpOpen === "function" && typeof this._cpTarget === "function" && !!this._cpTarget();
            // Nutzertest 6 (P-T5): Kacheln ohne eigenes Popup (Pumpe) zeigen die Rückfrage selbst – nur ansehen,
            // in der Vorschau wird nichts geschaltet.
            const askId = String(inner.entity || "");
            // Der Dialog kommt aus casora-core.js; das Studio lädt Casoras Skripte erst bei Bedarf (wie das Popup).
            const canAsk = () => !!askId && (typeof window.casoraAskFirstTry === "function" || typeof this._casoraCardsReady === "function");
            const askNow = async () => {
              if (typeof window.casoraAskFirstTry !== "function" && this._casoraCardsReady) { try { await this._casoraCardsReady(); } catch (e) { /* unten */ } }
              if (typeof window.casoraAskFirstTry !== "function") { if (this._bToast) this._bToast(tr("Done saves it to your dashboard.")); return; }
              window.casoraAskFirstTry(askId, typeof inner.name === "string" ? inner.name : "").then((ok) => {
                if (this._bToast) this._bToast(tr(ok ? "In the dashboard it would switch now" : "Cancelled – nothing switches"),
                  { sub: tr("Nothing was switched here in the Studio.") });
              });
            };
            const try_ = document.createElement("button");
            try_.type = "button";
            try_.className = "mval ghost mtry";
            try_.setAttribute("data-no-i18n", "");
            try_.textContent = tr(canTry() ? "Try it in the popup" : "Try the question");
            try_.hidden = !(V.confirm_toggle === true && (canTry() || canAsk()));
            try_.onclick = () => {
              if (canTry()) { this._cpDismissed = null; const t = this._cpTarget(); if (t) this._cpOpen(t); return; }
              if (canAsk()) askNow();
            };
            group.append(r, h, try_);
          }
          this._mWhoRow(group, () => tileUsers(shell), (ids) => setTileUsers(shell, ids), "Tile",
            (ids, users) => this._mElsewhere([inner.entity], ids, users, { tile: shell }),
            { fix: (ids, users) => this._mElsewhereFix([inner.entity], ids, users, { tile: shell }) });
        }
      }
      // Badges
      // Nur im geöffneten Badge-Editor (die Liste aller Badges bleibt ruhig).
      if (this._sel && this._sel.group === "badges") pane.querySelectorAll("[data-bid]").forEach((card) => {
        const bid = card.dataset.bid;
        if (!BADGES.some(([b, l]) => b === bid && l === this._sel.key) || card.querySelector(":scope > .mwho")) return;
        const get = () => { const m = (room.variables || {}).casora_badge_users || {}; return Array.isArray(m[bid]) ? m[bid].slice() : []; };
        const set = (ids) => {
          room.variables = room.variables || {};
          const m = { ...(room.variables.casora_badge_users || {}) };
          if (ids.length) m[bid] = ids; else delete m[bid];
          if (Object.keys(m).length) room.variables.casora_badge_users = m; else delete room.variables.casora_badge_users;
        };
        // Oben unter dem Namen statt ganz am Ende eines langen Editors (Nutzertest 7, P-T4).
        const nameRow = card.querySelector(":scope > .row");
        const before = nameRow ? nameRow.nextSibling : card.children[1] || null;
        this._mWhoRow(card, get, set, "Badge", bid === "security"
          ? (ids, users) => this._mElsewhere(SEC_KEYS(room.variables || {}), ids, users, { badge: this._room }) : null,
          { before, fix: bid === "security" ? (ids, users) => this._mElsewhereFix(SEC_KEYS(room.variables || {}), ids, users, { badge: this._room }) : null });
      });
      // Raum (Darstellung)
      const app = pane.querySelector('[data-k="Appearance"]');
      if (app && !app.querySelector(":scope .mwho")) {
        const host = app.querySelector(".cbody") || app;
        if (isHome(this, room)) return;
        this._mWhoRow(host, () => ((room.variables || {}).casora_users || []).slice(), (ids) => {
          room.variables = room.variables || {};
          if (ids.length) room.variables.casora_users = ids; else delete room.variables.casora_users;
        }, "Room");
      }
    };

    // ── Anschließen ─────────────────────────────────────────────────────────
    wrap("_renderForm", (orig) => function () {
      const r = orig.apply(this, arguments);
      try { if (on(this)) { this._mCss(); this._mDecorateEditors(); } } catch (e) { console.warn("Casora Studio:", e); }
      return r;
    });
    wrap("_bApply", (orig) => function () {
      const r = orig.apply(this, arguments);
      try {
        if (this.classList.contains("bmode")) { this._mCss(); this._mTools(); this._mKeys(); }
      } catch (e) { console.warn("Casora Studio:", e); }
      return r;
    });
  });
})();
