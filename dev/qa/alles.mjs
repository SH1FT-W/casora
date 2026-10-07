#!/usr/bin/env node
// „Alles bedienen“ – wiederholbarer QA-Rundgang durch Casora Studio und ein echtes Dashboard.
//
//   CASORA_TOKENS='{"refresh_token":"…"}' node dev/qa/alles.mjs [--quick] [Optionen]
//
// Tippt systematisch alles an, was sich bedienen lässt, und sammelt Befunde (bricht nie beim
// ersten ab): tote Elemente, Konsolenfehler, abgeschnittene/nicht scrollbare Reihen, englische
// Wörter / „undefined“ / rohe Entitäts-IDs, Seite scrollt quer, doppelte Knöpfe.
// Nur lesend: schreibende WebSocket-/REST-Aufrufe werden im Browser abgefangen und protokolliert
// (Ausnahme: reine UI-Helfer wie input_select.casora_expanded_row). Knöpfe wie Löschen,
// Speichern, Installieren … werden nie gedrückt (DENY unten).
//
// Optionen:
//   --quick                 Kurzlauf (desktop + phone, wenige Räume/Kacheln je Ansicht)
//   --viewports a,b         desktop | tablet | phone | phone-webkit   (Standard: alle vier; quick: desktop,phone)
//   --dash <url_path>       Test-Dashboard (Standard: qa-stress, sonst ein im Studio angelegtes, sonst irgendein Casora-Dashboard)
//   --mobile-dash <url>     Handy-Dashboard (Standard: <dash>-mobile, falls vorhanden)
//   --only studio|dashboard nur einen Teil
//   --allow-writes          Schreibsperre aus (Vorsicht – dann wirken Taps auf das Test-HA)
//   --max <n>               höchstens n Elemente je Liste (Standard 400, quick 6)
//   --rooms <n>             höchstens n Räume (Studio) bzw. Ansichten (Dashboard) (Standard 8, quick 2)
// Umgebung: CASORA_TOKENS (Pflicht), CASORA_URL, CASORA_OUT (Standard /tmp/casora-qa), CASORA_LOCAL=1
// (Panel-/Skriptdateien aus diesem Checkout), PLAYWRIGHT_PATH.
// Ergebnis: $CASORA_OUT/bericht.json + bericht.md + Bilder; Exit-Code 1 bei Befunden der Stufe „error“.
//
// Parallel (dev/qa/pool.mjs): je Viewport und Teil (--only studio|dashboard) ein eigener Prozess
// mit eigenem CASORA_OUT, danach führt
//   node dev/qa/alles.mjs --merge <teil-ordner …> [--seconds n]
// deren bericht.json zu einem Bericht in $CASORA_OUT zusammen (gleiches Format, Bildpfade relativ).
import fs from 'node:fs';
import path from 'node:path';

process.env.CASORA_OUT = process.env.CASORA_OUT || '/tmp/casora-qa';
const { open, BASE, OUT } = await import('../e2e/harness.mjs');

// ── Argumente ───────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const QUICK = flag('quick');
const ALLOW_WRITES = flag('allow-writes');
const ONLY = opt('only', '');
const MAX = Number(opt('max', QUICK ? 6 : 400));
const VIEWPORTS = opt('viewports', QUICK ? 'desktop,phone' : 'desktop,tablet,phone-webkit,phone').split(',').map((s) => s.trim()).filter(Boolean);
// Voller Lauf: höchstens 8 Räume/Ansichten (im Stresshaus 27 – ab dem achten wiederholen sich
// die Muster, alle zusammen dauerten Stunden). Mehr mit --rooms <n>.
const ROOMS = Number(opt('rooms', QUICK ? 2 : 8));
const LIMIT = {
  rooms: ROOMS, views: ROOMS, tiles: MAX, badges: QUICK ? 12 : 99, subs: QUICK ? 3 : 40,
  controls: QUICK ? 4 : 30, editors: QUICK ? 3 : 99, shots: QUICK ? 40 : 250, scrollRows: QUICK ? 6 : 40,
};
const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const VP = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA },
  phone: { width: 390, height: 844, mobile: true },
  'phone-webkit': { width: 390, height: 844, mobile: true, safari: true },
};
const MERGE = flag('merge');
for (const v of VIEWPORTS) if (!VP[v]) { console.error('Unbekannter Viewport:', v, '– erlaubt:', Object.keys(VP).join(', ')); process.exit(2); }
if (!MERGE && !process.env.CASORA_TOKENS) { console.error('CASORA_TOKENS fehlt (JSON mit refresh_token für das Test-HA).'); process.exit(2); }

// Nie drücken (Beschriftung, de + en). Menüpunkte mit diesen Wörtern werden nur aufgelistet.
const DENY = /(lösch|entfern|wiederherst|install|neu ?start|neustart|speicher|übernehm|anwend|verschieb|zurücksetz|import(ier)?en|aktualisier|erstell|anlegen|duplizier|hochlad|abmeld|umzieh|fertig|senden|leeren|ausführen|mobil-layout|\bdelete|\bremove|restore|install|restart|\bsave|apply|\bmove\b|\breset|import\b|\bupdate\b|create|duplicate|upload|log ?out|\bdone\b|\bsend\b|\brun\b|discard|verwerf|ersetzen|replace|übertragen|freigeben|share|kaufen|buy)/i;
// Schließen/Zurück ohne Wirkung.
const CLOSE = /^(abbrechen|schließen|zurück|später|nicht jetzt|jetzt nicht|cancel|close|back|not now|later|ok, verstanden)$/i;

const OUTDIR = OUT;
fs.mkdirSync(path.join(OUTDIR, 'bilder'), { recursive: true });
const INPAGE = fs.readFileSync(new URL('./inpage.js', import.meta.url), 'utf8');

// ── Befunde ─────────────────────────────────────────────────────────────
const findings = [];
const seen = new Set();
let shots = 0;
// ui: erlaubte Schreibaufrufe auf UI-Helfer (zeigt, welche Teile sich beim Parallellauf
// über gemeinsame Helfer wie input_select.casora_expanded_row berühren könnten).
const stats = { tapped: 0, dead: 0, pages: 0, blocked: 0, ui: 0 };
const ERR_ALLOW = /addEventListener|ResizeObserver loop|Failed to load resource.*favicon|service.?worker/i;

async function finding(ctx, f, tagId) {
  // Texte und abgeschnittene Stellen je Viewport nur einmal (sie wiederholen sich auf jeder Seite).
  const pageKey = /^(text-|abgeschnitten|doppelter-knopf)/.test(f.kind) ? '' : ctx.page;
  // Uhrzeiten/Zahlen im Label (Vorschau-Uhr „10:05“, Zähler) ändern sich von Seite zu Seite –
  // für die Dublettenprüfung zählen sie nicht, und .focusing/.on-Zustandsklassen im Pfad auch nicht.
  const norm = (x) => String(x || '').replace(/\d+([:.,]\d+)*/g, '#').replace(/\.(focusing|on|open|infocus)\b/g, '');
  const key = [f.kind, ctx.vp, pageKey, norm(f.path), norm(f.text || f.label)].join('|');
  if (seen.has(key)) return;
  seen.add(key);
  const rec = { sev: f.sev, kind: f.kind, viewport: ctx.vp, page: ctx.page, label: f.label || '', path: f.path || '', detail: f.detail || f.text || '' };
  if (f.sev !== 'info' && shots < LIMIT.shots && ctx.page_) {
    const file = `bilder/${String(++shots).padStart(3, '0')}_${ctx.vp}_${f.kind}.png`;
    try {
      if (tagId) await ctx.page_.evaluate((id) => { const e = window.__qa.byTag(id); if (e) { e.__qaOutline = e.style.outline; e.style.outline = '3px solid #ff2d55'; e.style.outlineOffset = '1px'; } }, tagId).catch(() => {});
      await ctx.page_.screenshot({ path: path.join(OUTDIR, file), timeout: 8000 });
      if (tagId) await ctx.page_.evaluate((id) => { const e = window.__qa.byTag(id); if (e) e.style.outline = e.__qaOutline || ''; }, tagId).catch(() => {});
      rec.shot = file;
    } catch (e) { /* Bild ist nur Beiwerk */ }
  }
  findings.push(rec);
  const mark = f.sev === 'error' ? '✗' : f.sev === 'warn' ? '!' : '·';
  console.log(`  ${mark} [${ctx.vp}] ${ctx.page} · ${f.kind}: ${(f.label || '').slice(0, 50)} ${(rec.detail || '').slice(0, 240)}`);
}

// ── Seite ───────────────────────────────────────────────────────────────
async function newCtx(vp) {
  const o = VP[vp];
  const s = await open({ width: o.width, height: o.height, mobile: !!o.mobile, safari: !!o.safari, touch: o.touch, userAgent: o.userAgent });
  await s.context.addInitScript((cfg) => { window.__QA_CFG = cfg; }, { allowWrites: ALLOW_WRITES });
  await s.context.addInitScript({ content: INPAGE });
  s.page.setDefaultTimeout(15000);
  // Konsolenfehler mit Objekt („…: Object“, Gate 07.10.2026) sagen nichts: den Inhalt nachtragen.
  s.page.on('console', async (m) => {
    if (m.type() !== 'error' || !/\bObject\b/.test(m.text())) return;
    try {
      const parts = await Promise.all(m.args().map((a) => a.evaluate((v) => {
        try { return v instanceof Error ? v.message : typeof v === 'object' ? JSON.stringify(v) : String(v); } catch (e) { return String(v); }
      }).catch(() => '?')));
      const i = s.errors.lastIndexOf(m.text());
      if (i >= 0) s.errors[i] = m.text() + ' ⟶ ' + parts.join(' ').slice(0, 300);
    } catch (e) { /* nur Beiwerk */ }
  });
  let cdp = null;
  if (!o.safari && o.mobile) { try { cdp = await s.context.newCDPSession(s.page); } catch (e) { cdp = null; } }
  return { vp, browser: s.browser, context: s.context, page_: s.page, errors: s.errors, touch: !!(o.mobile || o.touch), desktop: !o.mobile, cdp, page: '' };
}
const Q = (ctx, fn, arg) => ctx.page_.evaluate(fn, arg);

async function goto(ctx, url, check, timeout = 45000) {
  for (let i = 0; i < 2; i++) {
    try {
      await ctx.page_.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await ctx.page_.waitForFunction(check, null, { timeout, polling: 500 });
      await ctx.page_.waitForTimeout(1800);
      return true;
    } catch (e) {
      if (i) { await finding(ctx, { sev: 'error', kind: 'laedt-nicht', label: url, detail: String(e.message).split('\n')[0] }); return false; }
    }
  }
}

// Element zu einer data-qa-Marke als Playwright-Handle.
async function handleOf(ctx, tagId) {
  const h = await ctx.page_.evaluateHandle((id) => window.__qa.byTag(id), tagId);
  return h.asElement();
}

// Sichtbare Elemente sammeln; sel = CSS, scope = optionale Marke, in der gesucht wird.
async function collect(ctx, sel, { scope = null, filter = null } = {}) {
  return Q(ctx, ([sel, scope, filter]) => {
    const qa = window.__qa;
    const root = scope ? qa.byTag(scope) : null;
    if (scope && !root) return [];
    const list = qa.pierce(sel, root ? (root.shadowRoot || root) : undefined).concat(root && root.shadowRoot ? qa.pierce(sel, root) : []);
    const out = []; const dupe = new Set();
    for (const e of list) {
      if (dupe.has(e) || !qa.isVisible(e)) continue;
      dupe.add(e);
      if (filter && !new Function('e', 'qa', filter)(e, qa)) continue;
      out.push({ tag: qa.tag(e), label: qa.label(e), path: qa.describe(e), tpl: qa.tplOf(e), cls: typeof e.className === 'string' ? e.className : '', k: (e.dataset && e.dataset.k) || '' });
    }
    return out;
  }, [sel, scope, filter]);
}

async function newErrors(ctx, from) {
  return ctx.errors.slice(from).filter((e) => !ERR_ALLOW.test(e));
}

// Antippen und prüfen, ob sich etwas tut. expect: Funktion (Diff → Text) für eigene Erwartung.
async function tap(ctx, item, what, { expectFn = null, settle = 900, deadSev = 'error', mouse = false, deny = false } = {}) {
  if (deny && DENY.test(item.label || '')) return { skipped: true };
  const page = ctx.page_;
  let h = await handleOf(ctx, item.tag).catch(() => null);
  if (!h) return { gone: true };
  await Q(ctx, () => window.__qa.before()).catch(() => {});
  const e0 = ctx.errors.length;
  try {
    await h.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
    if (ctx.touch && !mouse) await h.tap({ timeout: 4000 });
    else await h.click({ timeout: 4000 });
  } catch (e) {
    try { await h.click({ timeout: 3000, force: true }); } catch (e2) {
      await finding(ctx, { sev: 'warn', kind: 'nicht-antippbar', label: item.label, path: item.path, detail: what + ': ' + String(e.message).split('\n')[0].slice(0, 140) }, item.tag);
      return { failed: true };
    }
  }
  stats.tapped++;
  await page.waitForTimeout(settle);
  const d = await Q(ctx, () => window.__qa.after()).catch(() => ({ changed: 1, blocked: [], ui: [], url: '', dialog: 0 }));
  stats.blocked += d.blocked.length;
  stats.ui += (d.ui || []).length;
  if (d.blocked.length) await finding(ctx, { sev: 'info', kind: 'schreiben-blockiert', label: item.label, path: item.path, detail: d.blocked.slice(0, 3).join('; ') });
  for (const err of await newErrors(ctx, e0)) await finding(ctx, { sev: 'error', kind: 'konsole', label: item.label, path: item.path, detail: what + ': ' + err.slice(0, 220) }, item.tag);
  const alive = d.changed > 0 || d.blocked.length || d.ui.length || d.url;
  if (expectFn) {
    const why = await expectFn(d);
    if (why) await finding(ctx, { sev: 'error', kind: 'reagiert-falsch', label: item.label, path: item.path, detail: what + ': ' + why }, item.tag);
  } else if (!alive) {
    stats.dead++;
    // Sieht es gar nicht bedienbar aus (kein Knopf/Link/role=button, Zeiger nicht „pointer“,
    // z. B. Unter-Badges der Studio-Vorschau mit cursor:default), ist „tut nichts“ gewollt.
    const looksTappable = await Q(ctx, (id) => {
      const e = window.__qa.byTag(id); if (!e) return true;
      if (/^(BUTTON|A|INPUT|SELECT)$/.test(e.tagName) || e.getAttribute('role') === 'button' || e.onclick) return true;
      return getComputedStyle(e).cursor === 'pointer';
    }, item.tag).catch(() => true);
    await finding(ctx, { sev: looksTappable ? deadSev : 'info', kind: 'tot', label: item.label, path: item.path, detail: what + ': Antippen ändert nichts' }, item.tag);
  }
  return d;
}

// Offene Popups/Dialoge/Menüs schließen – nie bestätigen.
async function closeAll(ctx) {
  const page = ctx.page_;
  for (let i = 0; i < 3; i++) {
    const n = await Q(ctx, () => {
      try { window.casoraPopup && window.casoraPopup.close(); } catch (e) {}
      return window.__qa.dialogs().length;
    }).catch(() => 0);
    if (!n) return;
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(450);
    const btn = await collect(ctx, 'button, [role=button], ha-button, mwc-button, .fnav', { filter: `return /^(abbrechen|schließen|zurück|später|nicht jetzt|jetzt nicht|cancel|close|back|not now|later)$/i.test((qa.label(e)||'').trim())` }).catch(() => []);
    if (btn.length) { const h = await handleOf(ctx, btn[btn.length - 1].tag); if (h) await h.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(450); }
  }
}

// Seitenprüfungen: abgeschnitten, Scroll-Reihen, Seite quer, Texte, doppelte Knöpfe.
const scrollTested = new Set();
async function scan(ctx, scopeTag = null, where = '') {
  const r = await Q(ctx, (s) => window.__qa.overflowScan(s ? window.__qa.byTag(s) : null), scopeTag).catch(() => null);
  if (!r) return;
  for (const c of r.cut) {
    // Stufen (dev/qa/README.md): halb angeschnittener Knopf/Text = error; nur ganz verdeckte
    // Elemente = warn (oft Absicht, Bild prüfen); Kante mit Verlaufsmaske = info (gewollt).
    // Nur ganz verdeckt in einem winzigen Container (< 64px, z. B. zusammengeklappte Felder
    // eines Popup-Layouts, die gerade nicht gezeigt werden) → info: nichts davon ist zu sehen.
    const collapsed = !c.cut && c.cw < 64;
    await finding(ctx, { sev: c.masked || collapsed ? 'info' : c.cut ? 'error' : 'warn', kind: 'abgeschnitten', label: c.label, path: c.path,
      detail: `${where}Inhalt ragt über den Rand (${c.sw}px in ${c.cw}px, overflow-x versteckt, nicht scrollbar): ${c.cut} angeschnitten, ${c.gone} ganz verdeckt ${c.names.length ? '– ' + c.names.join(' | ') : ''} @${c.at}` }, c.tag);
  }
  for (const p of r.pageScroll) await finding(ctx, { sev: 'error', kind: 'seite-quer', path: p.path, detail: `Seite scrollt horizontal (${p.sw}px statt ${p.cw}px)` }, p.tag);
  for (const row of r.rows.slice(0, LIMIT.scrollRows)) {
    const k = ctx.vp + '|' + ctx.page + '|' + row.path;
    if (scrollTested.has(k)) continue;
    scrollTested.add(k);
    await scrollRow(ctx, row);
  }
  if (!scopeTag) {
    const texts = await Q(ctx, () => window.__qa.textScan()).catch(() => []);
    for (const t of texts) await finding(ctx, { sev: t.sev, kind: t.kind, path: t.path, text: t.text }, t.tag);
    const dups = await Q(ctx, () => window.__qa.dupScan()).catch(() => []);
    for (const d of dups) await finding(ctx, { sev: 'warn', kind: 'doppelter-knopf', label: d.text, detail: `„${d.text}“ steht ${d.n}× auf der Seite` });
  }
}

// Scrollbare Reihe: Trackpad (deltaX), Mausrad mit Shift, Ziehen mit der Maus (Desktop), Wischen (Touch).
async function scrollRow(ctx, row) {
  const page = ctx.page_;
  const pos = () => Q(ctx, (id) => { const e = window.__qa.byTag(id); return e ? e.scrollLeft : null; }, row.tag);
  const reset = (v) => Q(ctx, ([id, v]) => { const e = window.__qa.byTag(id); if (e) e.scrollLeft = v; }, [row.tag, v]);
  const center = await Q(ctx, (id) => {
    const e = window.__qa.byTag(id); if (!e) return null;
    e.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, vis: r.top >= 0 && r.bottom <= innerHeight };
  }, row.tag).catch(() => null);
  if (!center) return;
  // Liegt über der Reihenmitte etwas anderes (Popup, Überblendung, noch laufende Animation),
  // messen Rad/Ziehen nicht die Reihe: kurz warten, sonst als „verdeckt“ melden statt „scrollt nicht“.
  const hitsRow = () => Q(ctx, ([id, x, y]) => {
    const row = window.__qa.byTag(id); if (!row) return false;
    let h = document.elementFromPoint(x, y);
    for (let n = 0; h && h.shadowRoot && n < 30; n++) { const d = h.shadowRoot.elementFromPoint(x, y); if (!d || d === h) break; h = d; }
    for (let e = h, n = 0; e && n < 60; e = window.__qa.parentOf(e), n++) if (e === row) return true;
    return false;
  }, [row.tag, center.x, center.y]).catch(() => true);
  if (!(await hitsRow())) {
    await page.waitForTimeout(700);
    if (!(await hitsRow())) {
      await finding(ctx, { sev: 'warn', kind: 'reihe-verdeckt', label: row.label, path: row.path, detail: `Reihe (${row.sw}px in ${row.cw}px): über ihrer Mitte liegt ein anderes Element – Scrollen nicht messbar` }, row.tag);
      return;
    }
  }
  const p0 = await pos();
  if (p0 === null) return;
  // Richtung mit Platz wählen: steht die Reihe schon am rechten Ende (z. B. zur offenen
  // Kachel gerutscht), geht es nur nach links – sonst meldete der Test fälschlich „scrollt nicht“.
  const room = await Q(ctx, (id) => { const e = window.__qa.byTag(id); return e ? e.scrollWidth - e.clientWidth : 0; }, row.tag).catch(() => 0);
  const dir = p0 > room / 2 ? -1 : 1;
  const res = {};
  // null = Reihe ist inzwischen weg (Seite hat gewechselt, neu gerendert) → nicht messbar, kein Befund.
  let gone = false;
  const moved = async () => { await page.waitForTimeout(450); const p = await pos(); if (p === null) { gone = true; return null; } const m = Math.abs(p - p0) > 4; await reset(p0); await page.waitForTimeout(150); return m; };
  if (ctx.desktop) {
    await page.mouse.move(center.x, center.y);
    await page.mouse.wheel(160 * dir, 0); res.trackpad = await moved();
    await page.keyboard.down('Shift'); await page.mouse.wheel(0, 160 * dir); await page.keyboard.up('Shift'); res.shiftWheel = await moved();
    await Q(ctx, () => window.__qa.before());
    const dx0 = Math.min(120, center.w / 3) * dir;
    await page.mouse.move(center.x + dx0, center.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(center.x + dx0 - i * 25 * dir, center.y);
    await page.mouse.up();
    res.drag = await moved();
    await closeAll(ctx); // Ziehen darf kein Popup öffnen – falls doch, schließen
    if (gone) return;
    if (!res.trackpad && !res.shiftWheel) {
      await finding(ctx, { sev: 'error', kind: 'reihe-scrollt-nicht', label: row.label, path: row.path, detail: `Reihe ist breiter (${row.sw}px in ${row.cw}px), aber weder Trackpad noch Shift+Mausrad scrollen sie` }, row.tag);
    } else if (!res.drag) {
      // Maus-Ziehen verspricht Casora nur für die Kachelreihe (casora-smart-row) und die
      // Unter-Badge-Reihen im Dashboard; dort ist fehlendes Ziehen ein Fehler (vgl. r02).
      // Andere Reihen (Navigationsleiste, Studio-Vorschau – dort heißt Ziehen „Kachel
      // verschieben“) reichen mit Rad/Trackpad/Wischen → nur Hinweis.
      const promised = !ctx.page.startsWith('studio') && (row.subBadges || await Q(ctx, (id) => {
        for (let e = window.__qa.byTag(id), n = 0; e && n < 30; e = window.__qa.parentOf(e), n++) if (e.tagName === 'CASORA-SMART-ROW') return true;
        return false;
      }, row.tag).catch(() => false));
      await finding(ctx, { sev: promised ? 'error' : 'info', kind: 'reihe-nicht-ziehbar', label: row.label, path: row.path, detail: `Reihe (${row.sw}px in ${row.cw}px) scrollt per Rad/Trackpad, aber nicht per Maus-Ziehen${promised ? ' – Ziehen ist hier zugesagt' : ' (Ziehen hier nicht zugesagt)'}` }, row.tag);
    }
  } else if (ctx.cdp) {
    try {
      await ctx.cdp.send('Input.synthesizeScrollGesture', { x: Math.round(center.x), y: Math.round(center.y), xDistance: -dir * Math.round(Math.min(160, center.w / 2)), yDistance: 0, gestureSourceType: 'touch', speed: 800 });
      res.touch = await moved();
    } catch (e) { res.touch = null; }
    if (res.touch === false && !gone) await finding(ctx, { sev: 'error', kind: 'reihe-scrollt-nicht', label: row.label, path: row.path, detail: `Reihe ist breiter (${row.sw}px in ${row.cw}px), lässt sich per Wischen nicht scrollen` }, row.tag);
  } else {
    // WebKit ohne Touch-Gesten: wenigstens programmatisch scrollbar?
    await Q(ctx, ([id, d]) => { const e = window.__qa.byTag(id); if (e) e.scrollBy({ left: 120 * d }); }, [row.tag, dir]);
    if ((await moved()) === false) await finding(ctx, { sev: 'error', kind: 'reihe-scrollt-nicht', label: row.label, path: row.path, detail: 'Reihe ist breiter, scrollt aber nicht (scrollBy)' }, row.tag);
  }
}

// ═══ Studio ════════════════════════════════════════════════════════════
const PANEL_READY = () => { const p = window.__qa && window.__qa.pierce('casora-panel')[0]; return !!(p && p._state !== undefined && p._hass); };
const P = (ctx, fn, arg) => Q(ctx, ([src, arg]) => { const p = window.__qa.pierce('casora-panel')[0]; return new Function('p', 'arg', src)(p, arg); }, [fn, arg]);

async function studioReset(ctx, dash) {
  await ctx.page_.keyboard.press('Escape').catch(() => {});
  const ok = await P(ctx, `
    if (!p) return false;
    try { p._openCombo && p._openCombo(); } catch (e) {}
    try { if (p._flowMode) p._exitFlow(false); } catch (e) {}
    try { if (p._csOpen && p._csClose) p._csClose(); } catch (e) {}
    return !!p._state && p._dashUrl === arg;`, dash).catch(() => false);
  if (!ok) {
    await P(ctx, `p._setDash(arg); p._remember(arg); return p._load();`, dash).catch(() => {});
    await ctx.page_.waitForTimeout(2500);
  }
  const still = await Q(ctx, () => window.__qa.dialogs().length).catch(() => 0);
  if (still) await closeAll(ctx);
}

async function openStudio(ctx, dash) {
  ctx.page = 'studio';
  if (!(await goto(ctx, '/casora-studio', PANEL_READY))) return false;
  await P(ctx, `p._setDash(arg); p._remember(arg); return p._load();`, dash).catch((e) => finding(ctx, { sev: 'error', kind: 'laedt-nicht', label: dash, detail: 'Studio lädt Dashboard nicht: ' + e.message }));
  await ctx.page_.waitForTimeout(3000);
  return true;
}

async function studioMenu(ctx, dash, openerSel, name) {
  // Menü öffnen, Punkte lesen, jeden (erlaubten) einzeln antippen und danach alles zurücksetzen.
  const opener = (await collect(ctx, openerSel))[0];
  if (!opener) return;
  const d = await tap(ctx, opener, name + ' öffnen', { mouse: true });
  if (d.failed || d.gone) return;
  const items = await collect(ctx, '.combo-opt[role=menuitem], [role=menuitem]');
  await scan(ctx, null, name + ': ');
  await ctx.page_.keyboard.press('Escape').catch(() => {});
  await P(ctx, `try { p._openCombo && p._openCombo(); } catch (e) {}`).catch(() => {});
  await ctx.page_.waitForTimeout(300);
  const labels = [...new Set(items.map((i) => i.label).filter(Boolean))];
  for (const lab of labels) {
    if (DENY.test(lab)) { await finding(ctx, { sev: 'info', kind: 'uebersprungen', label: lab, detail: name + ': destruktiv/schreibend, nicht angetippt' }); continue; }
    const op = (await collect(ctx, openerSel))[0];
    const o = op && await handleOf(ctx, op.tag).catch(() => null);
    if (!o) break;
    await o.click({ timeout: 3000 }).catch(() => {});
    await ctx.page_.waitForTimeout(500);
    const now = await collect(ctx, '.combo-opt[role=menuitem], [role=menuitem]', { filter: `return (qa.label(e)||'') === ${JSON.stringify(lab)}` });
    if (!now.length) continue;
    // Einträge, die zu einem anderen Dashboard wechseln würden, nur aufzählen.
    await tap(ctx, now[0], name + ' → ' + lab, { mouse: true, settle: 1400, deny: true });
    // Führt der Eintrag aus dem Studio heraus („Dashboard öffnen“), steht dort eine andere,
    // noch ladende Seite: ein Scan nach 1,4 s maß Karten mitten im ersten Zeichnen (die
    // Badge-Reihe des Handy-Dashboards sprang beim ersten hass-Update auf 0 zurück →
    // falsches „scrollt nicht“), und die folgenden Menüpunkte hätte der Lauf auf dem
    // Dashboard gesucht. Diese Seiten prüft der Dashboard-Durchlauf mit eigener Wartezeit –
    // hier nur festhalten und ins Studio zurück.
    const out = await Q(ctx, () => (location.pathname.startsWith('/casora-studio') ? '' : location.pathname)).catch(() => '?');
    if (out) {
      await finding(ctx, { sev: 'info', kind: 'nav-menue', label: lab, detail: name + ': führt aus dem Studio nach ' + out + ' (Seite prüft der Dashboard-Durchlauf)' });
      const was = ctx.page;
      const back = await openStudio(ctx, dash);
      ctx.page = was;
      if (!back) break;
      continue;
    }
    await scan(ctx, null, name + ' → ' + lab + ': ');
    await studioReset(ctx, dash);
  }
}

async function crawlStudio(ctx, dash) {
  console.log(`\n▶ Studio [${ctx.vp}] ${dash}`);
  if (!(await openStudio(ctx, dash))) return;
  stats.pages++;
  await scan(ctx, null, 'Studio: ');

  // Handy: Seitenleiste steckt hinter dem Raum-Knopf.
  const railBtn = await collect(ctx, '#railbtn');
  if (railBtn.length) await tap(ctx, railBtn[0], 'Raumleiste öffnen', { deadSev: 'warn' });

  // 1) Seitenleiste: Räume (Tabs) + Abschnitte + Casora (Einstellungen/Updates …).
  const SIDE = '.sidelist .siderow, #rooms .tab, .rail .tab';
  const NODASH = `return !String((e.dataset && e.dataset.k) || '').startsWith('dash-')`; // Dashboard-Wechsel nie antippen
  const side = await collect(ctx, SIDE, { filter: NODASH });
  const labels = [...new Map(side.map((s) => [s.label, s])).values()];
  console.log(`  Seitenleiste: ${labels.length} Einträge`);
  const roomTabs = labels.filter((s) => s.k.startsWith('room-'));
  // Die Raum-Editoren sind in allen Breiten dieselben: gründlich nur am Desktop, sonst 3 Räume.
  const maxRooms = ctx.desktop ? LIMIT.rooms : Math.min(LIMIT.rooms, 3);
  let rooms = 0;
  for (const it of labels) {
    const isRoom = it.k.startsWith('room-');
    if (isRoom && rooms >= maxRooms) continue;
    const now = (await collect(ctx, SIDE, { filter: NODASH + ` && qa.label(e) === ${JSON.stringify(it.label)}` }))[0];
    if (!now) { if (railBtn.length) { const rb = await collect(ctx, '#railbtn'); if (rb[0]) await tap(ctx, rb[0], 'Raumleiste öffnen', { deadSev: 'info' }); } continue; }
    const on = /\bon\b/.test(now.cls);
    ctx.page = 'studio/' + (it.label || '?').slice(0, 40);
    if (!on) await tap(ctx, now, 'Seitenleiste', { settle: 1300 });
    await scan(ctx, null, '');
    if (isRoom) { rooms++; await crawlStudioRoom(ctx, dash, it.label); }
    await studioReset(ctx, dash);
    if (railBtn.length) { const rb = await collect(ctx, '#railbtn'); if (rb[0] && !(await collect(ctx, '.sidelist .siderow, #rooms .tab')).length) await tap(ctx, rb[0], 'Raumleiste öffnen', { deadSev: 'info' }); }
  }
  if (!roomTabs.length) {
    // Schmales Studio ohne Seitenleiste: Räume über die Raum-Tabs oben.
    const tabs = await collect(ctx, '.tabs .tab', { filter: NODASH });
    for (const t of tabs.slice(0, maxRooms)) {
      const now = (await collect(ctx, '.tabs .tab', { filter: `return qa.label(e) === ${JSON.stringify(t.label)}` }))[0];
      if (!now) continue;
      ctx.page = 'studio/' + t.label.slice(0, 40);
      if (!/\bon\b/.test(now.cls)) await tap(ctx, now, 'Raum-Tab', { settle: 1300 });
      await crawlStudioRoom(ctx, dash, t.label);
      await studioReset(ctx, dash);
    }
  }

  // 2) ⋯-Menü und Dashboard-Titelmenü.
  ctx.page = 'studio/menue';
  const more = await collect(ctx, '#more');
  if (more[0]) await studioMenu(ctx, dash, '#more', '⋯-Menü');
  await studioReset(ctx, dash);
  const title = await collect(ctx, '#bigtitle, #roomtitle, #navtitle');
  if (title[0]) {
    const d = await tap(ctx, title[0], 'Titelmenü öffnen', { mouse: true, deadSev: 'warn' });
    if (d && !d.skipped) await scan(ctx, null, 'Titelmenü: ');
    await studioReset(ctx, dash);
  }

  // 3) Vorschau: Desktop/Tablet/Mobil, Tag/Nacht.
  ctx.page = 'studio/vorschau';
  const segs = await collect(ctx, '#sizeseg .segopt, #modeseg .segopt');
  for (const s of segs) {
    const now = (await collect(ctx, '#sizeseg .segopt, #modeseg .segopt')).find((x) => x.path === s.path && x.label === s.label);
    if (!now) continue;
    const sel = await Q(ctx, (id) => { const e = window.__qa.byTag(id); return !!e && (e.classList.contains('on') || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-checked') === 'true'); }, now.tag).catch(() => false);
    await tap(ctx, now, 'Vorschau-Umschalter ' + s.label, { settle: 1400, deadSev: sel ? 'info' : 'error' });
    await scan(ctx, null, 'Vorschau ' + s.label + ': ');
    await crawlPreviewBadges(ctx, 'Vorschau ' + s.label);
  }
  // Zurück auf Desktop + Tag, damit der nächste Lauf gleich beginnt.
  for (const sel of ['#sizeseg .segopt[data-size=desktop]', '#modeseg .segopt[data-mode=day]']) {
    const x = await collect(ctx, sel); if (x[0]) await (await handleOf(ctx, x[0].tag))?.click({ timeout: 2000 }).catch(() => {});
  }
}

async function crawlStudioRoom(ctx, dash, room) {
  // Raum-Menü (Pünktchen am Tab)
  await studioMenu(ctx, dash, '#rooms .tab.on .caret, .tabs .tab.on .caret', 'Raum-Menü ' + room);
  await studioReset(ctx, dash);

  // Vorschau-Badges dieses Raums
  await crawlPreviewBadges(ctx, 'Vorschau ' + room);

  // Akkordeon-Abschnitte (Darstellung, Wiedergabe, Badges, Kacheln, Popups …)
  const heads = await collect(ctx, '#pane .grouphead.stackhead');
  for (const h of heads) {
    const now = (await collect(ctx, '#pane .grouphead.stackhead', { filter: `return qa.label(e) === ${JSON.stringify(h.label)}` }))[0];
    if (!now) continue;
    const wasOpen = await Q(ctx, (id) => { const e = window.__qa.byTag(id); return !!e && e.getAttribute('aria-expanded') === 'true'; }, now.tag).catch(() => false);
    const where = 'Abschnitt ' + h.label.slice(0, 30);
    if (!wasOpen) await tap(ctx, now, where + ' aufklappen', { settle: 1100 });
    const band = await Q(ctx, (id) => { const e = window.__qa.byTag(id); const b = e && e.closest('.band'); return b ? window.__qa.tag(b) : null; }, now.tag).catch(() => null);
    if (band) {
      await scan(ctx, band, where + ': ');
      // Editoren im Abschnitt: Kachel-Köpfe, Badge-Zeilen, „Erweitert“-Knöpfe.
      const eds = await collect(ctx, '.tile .thead, .badgeedit, .thead, button.advsum, .grouphead:not(.stackhead)', { scope: band });
      let n = 0;
      for (const e of eds) {
        if (n >= LIMIT.editors * 3) break;
        const cur = (await collect(ctx, '.tile .thead, .badgeedit, .thead, button.advsum, .grouphead:not(.stackhead)', { scope: band })).find((x) => x.tag === e.tag);
        if (!cur) continue;
        n++;
        await tap(ctx, cur, where + ' → ' + (e.label || 'Editor').slice(0, 40), { settle: 1000 });
        await scan(ctx, band, where + ' → ' + e.label.slice(0, 30) + ': ');
        // Im geöffneten Editor: aufklappbare Unterbereiche (Popup, Erweitert …)
        const adv = await collect(ctx, 'button.advsum', { scope: band });
        for (const a of adv.slice(0, 4)) await tap(ctx, a, where + ' → ' + a.label.slice(0, 30), { settle: 700, deadSev: 'warn' });
        await closeAll(ctx);
      }
    }
    await studioReset(ctx, dash);
  }
  await scan(ctx, null, 'Raum ' + room + ': ');
}

// Vorschau-Badges: Antippen muss die Unter-Badge-Reihe aufklappen (oder etwas öffnen).
async function crawlPreviewBadges(ctx, where) {
  const badges = await collect(ctx, '.miniroom .mini-badges .pbadge:not(.ghost)');
  for (const b of badges.slice(0, LIMIT.badges)) {
    const now = (await collect(ctx, '.miniroom .mini-badges .pbadge:not(.ghost)')).find((x) => x.label === b.label);
    if (!now) continue;
    const already = await Q(ctx, (id) => !!window.__qa.byTag(id)?.classList.contains('open'), now.tag).catch(() => false);
    if (already) { await (await handleOf(ctx, now.tag))?.click({ timeout: 2000 }).catch(() => {}); await ctx.page_.waitForTimeout(500); }
    await tap(ctx, now, where + ' Badge ' + b.label.slice(0, 30), {
      settle: 900,
      expectFn: async () => {
        const st = await Q(ctx, () => {
          const r = window.__qa.pierce('.miniroom .mini-subs').filter((e) => e.classList.contains('on'));
          const n = r.reduce((a, e) => a + e.querySelectorAll('.pbadge').length, 0);
          // Neues Studio (B): Antippen öffnet den Editor des Badges im Inspektor – das zählt als „geöffnet“.
          const P = window.__qa.pierce('casora-panel')[0];
          return { n, dialogs: window.__qa.dialogs().length, insp: !!(P && P.classList.contains('binsp')) };
        });
        if (st.n || st.dialogs || st.insp) return '';
        // Badge ohne Unter-Badges: das Studio sagt es selbst (title „Noch keine Unter-Badges“ /
        // „No sub-badges yet“) – dann ist „klappt nicht auf“ gewollt (im Dashboard öffnet sie z. B. ein Popup).
        const none = await Q(ctx, (id) => /Noch keine Unter-Badges|No sub-badges yet/i.test((window.__qa.byTag(id) || {}).title || ''), now.tag).catch(() => false);
        if (none) { await finding(ctx, { sev: 'info', kind: 'vorschau-ohne-unterbadges', label: b.label, detail: where + ': Badge hat keine Unter-Badges (laut Studio)' }); return ''; }
        return 'Vorschau-Badge klappt nicht auf (keine Unter-Badges sichtbar, nichts geöffnet)';
      },
    });
    const subsRow = await collect(ctx, '.miniroom .mini-subs.on');
    if (subsRow[0]) {
      await scan(ctx, subsRow[0].tag, where + ' Unter-Badges ' + b.label.slice(0, 20) + ': ');
      const subs = await collect(ctx, '.pbadge', { scope: subsRow[0].tag });
      for (const s of subs.slice(0, LIMIT.subs)) await tap(ctx, s, where + ' Unter-Badge ' + s.label.slice(0, 30), { settle: 700, deadSev: 'warn' });
    }
    // wieder zuklappen
    const again = (await collect(ctx, '.miniroom .mini-badges .pbadge.open'))[0];
    if (again) { await (await handleOf(ctx, again.tag))?.click({ timeout: 2000 }).catch(() => {}); await ctx.page_.waitForTimeout(400); }
  }
}

// ═══ Dashboard ═════════════════════════════════════════════════════════
const DASH_READY = () => window.__qa && window.__qa.pierce('button-card').length > 3;
const BADGE_SEL = 'ha-card';
const BADGE_F = `const host = e.getRootNode && e.getRootNode().host; return e.classList.contains('casora-badge') || (!!host && host.tagName === 'BUTTON-CARD' && /badge/.test(qa.tplOf(host)));`;
const TILE_FILTER = `
  const host = e.getRootNode && e.getRootNode().host;       // ha-card → button-card
  const t = (qa.tplOf(host) || '');
  if (!host || host.tagName !== 'BUTTON-CARD') return false;
  if (e.classList.contains('casora-badge') || /badge|casora_room\\b|hero|nav|scene_row|filter/.test(t)) return false;
  const r = e.getBoundingClientRect();
  return r.width >= 60 && r.height >= 50 && r.width < innerWidth * 0.9;`;

async function uiRestore(ctx, states) {
  for (const [id, v] of Object.entries(states || {})) await Q(ctx, ([id, v]) => window.__qa.uiSet(id, v), [id, v]).catch(() => {});
}

async function crawlDashboard(ctx, dash, views) {
  console.log(`\n▶ Dashboard [${ctx.vp}] /${dash}`);
  const list = views.slice(0, LIMIT.views);
  let uiStart = null;
  for (let vi = 0; vi < list.length; vi++) {
    const v = list[vi];
    ctx.page = '/' + dash + '/' + v;
    if (!(await goto(ctx, '/' + dash + '/' + v, DASH_READY))) continue;
    stats.pages++;
    if (!uiStart) uiStart = await Q(ctx, () => window.__qa.uiStates()).catch(() => ({}));
    await Q(ctx, () => window.__qa.uiSet('input_select.casora_expanded_row', 'none')).catch(() => {});
    await ctx.page_.waitForTimeout(600);
    await scan(ctx, null, '');

    // Navigation (nur in der ersten Ansicht, sie ist überall gleich).
    if (vi === 0) {
      const nav = await collect(ctx, 'casora-nav button, casora-nav a, casora-nav-bar button, casora-nav-bar a, casora-nav-bar [role=button], casora-mobile-nav .hmn-btn, .hmn-btn');
      for (const n of nav.slice(0, 20)) {
        const now = (await collect(ctx, 'casora-nav button, casora-nav a, casora-nav-bar button, casora-nav-bar a, casora-nav-bar [role=button], casora-mobile-nav .hmn-btn, .hmn-btn')).find((x) => x.path === n.path && x.label === n.label);
        if (!now) continue;
        // Schon aktiver Eintrag (Handy-Leiste „Zuhause“ auf der Startansicht): Antippen ist dort
        // gewollt ohne sichtbare Wirkung, außer die Seite ist heruntergescrollt – dann geht es
        // nach oben. Also erst herunterscrollen und genau das prüfen, statt „tot“ zu melden.
        const active = /(^|\s)(on|active|selected)(\s|$)/.test(now.cls) || await Q(ctx, (id) => {
          const e = window.__qa.byTag(id);
          return !!e && ['aria-current', 'aria-pressed', 'aria-selected'].some((a) => { const v = e.getAttribute(a); return v && v !== 'false'; });
        }, now.tag).catch(() => false);
        if (active) {
          const y0 = await Q(ctx, () => { window.scrollTo(0, 400); return window.scrollY; }).catch(() => 0);
          await ctx.page_.waitForTimeout(300);
          await tap(ctx, now, 'Navigation ' + n.label.slice(0, 30) + ' (schon aktiv)', { settle: 1400, deadSev: 'info' });
          const y1 = await Q(ctx, () => window.scrollY).catch(() => 0);
          if (y0 > 50 && y1 > 20) await finding(ctx, { sev: 'error', kind: 'reagiert-falsch', label: now.label, path: now.path, detail: `Navigation ${n.label.slice(0, 30)} (schon aktiv): führt nicht nach oben (scrollY ${Math.round(y0)} → ${Math.round(y1)})` }, now.tag);
        } else {
          await tap(ctx, now, 'Navigation ' + n.label.slice(0, 30), { settle: 1400 });
        }
        await scan(ctx, null, 'Navigation ' + n.label.slice(0, 20) + ': ');
        const items = await collect(ctx, '.hmn-item, [role=menuitem]');
        for (const it of items.slice(0, 12)) await finding(ctx, { sev: 'info', kind: 'nav-menue', label: it.label, detail: 'Menüeintrag gesehen' });
        await closeAll(ctx);
        if (!ctx.page_.url().endsWith('/' + dash + '/' + v)) await goto(ctx, '/' + dash + '/' + v, DASH_READY);
      }
    }

    // Badges: aufklappen (Unter-Badges erscheinen) oder Popup öffnen.
    const badges = await collect(ctx, BADGE_SEL, { filter: BADGE_F });
    console.log(`  ${ctx.page}: ${badges.length} Badges`);
    for (const b of badges.slice(0, LIMIT.badges)) {
      const now = (await collect(ctx, BADGE_SEL, { filter: BADGE_F })).find((x) => x.label === b.label && x.path === b.path);
      if (!now) continue;
      // Vorher sichtbare Badges nach Marke UND Beschriftung: rendert die Badge-Reihe beim
      // Antippen neu (Handy-Layout: Badge filtert die Seite), sind das neue Elemente mit alten
      // Namen – keine Unter-Badges.
      const before0 = await collect(ctx, BADGE_SEL, { filter: BADGE_F });
      const before = new Set(before0.map((x) => x.tag));
      const beforeLabels = new Set(before0.map((x) => x.label));
      const isFresh = (x) => !before.has(x.tag) && !beforeLabels.has(x.label);
      const d = await tap(ctx, now, 'Badge ' + b.label.slice(0, 40), {
        settle: 1300,
        expectFn: async (d) => {
          const after = await collect(ctx, BADGE_SEL, { filter: BADGE_F });
          const fresh = after.filter((x) => !before.has(x.tag));
          if (fresh.length || d.dialog || d.url || d.changed > 0 || d.blocked.length) return '';
          return 'Badge klappt nicht auf und öffnet nichts';
        },
      });
      if (!d || d.skipped || d.failed) continue;
      const after = await collect(ctx, BADGE_SEL, { filter: BADGE_F });
      const fresh = after.filter(isFresh);
      const dlg = await Q(ctx, () => window.__qa.dialogs().length).catch(() => 0);
      if (dlg) { await scan(ctx, null, 'Popup von Badge ' + b.label.slice(0, 20) + ': '); await crawlPopupControls(ctx, 'Badge ' + b.label.slice(0, 20)); await closeAll(ctx); }
      if (fresh.length) {
        // Unter-Badge-Reihe: passt sie? Sonst muss sie scrollen.
        // Die Reihe ist der nächste Vorfahr, der wirklich quer scrollen kann (overflow-x
        // auto/scroll); das innere Raster (grid-layout #root, overflow visible) ist nur breiter.
        // Scrollt kein Vorfahr, gilt der erste überlaufende als Reihe (→ ggf. Befund).
        const row = await Q(ctx, (id) => {
          const qa = window.__qa;
          let first = null;
          let e = qa.byTag(id);
          for (let n = 0; e && n < 16; n++, e = qa.parentOf(e)) {
            if (!(e instanceof Element)) continue;
            if (e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 100) {
              if (/auto|scroll/.test(getComputedStyle(e).overflowX)) return qa.tag(e);
              if (!first) first = e;
            }
          }
          return first ? qa.tag(first) : null;
        }, fresh[fresh.length - 1].tag).catch(() => null);
        await scan(ctx, row, 'Unter-Badges von ' + b.label.slice(0, 20) + ': ');
        if (row) {
          const info = await Q(ctx, ([id, fresh]) => {
            const qa = window.__qa, e = qa.byTag(id), cs = getComputedStyle(e), r = e.getBoundingClientRect();
            const L = Math.max(r.left, 0), R = Math.min(r.right, innerWidth);
            // Unerreichbar: Unter-Badge ragt über die Reihe bzw. den Bildschirmrand hinaus.
            const out = fresh.map((t) => qa.byTag(t)).filter(Boolean).filter((b) => { const x = b.getBoundingClientRect(); return x.right > R + 2 || x.left < L - 2; }).length;
            return { ox: cs.overflowX, sw: e.scrollWidth, cw: e.clientWidth, path: qa.describe(e), out };
          }, [row, fresh.map((f) => f.tag)]);
          if (!/auto|scroll/.test(info.ox) && info.out) {
            await finding(ctx, { sev: 'error', kind: 'unterreihe-nicht-scrollbar', label: b.label, path: info.path, detail: `Unter-Badge-Reihe ist zu breit (${info.sw}px in ${info.cw}px), ${info.out} Unter-Badges liegen außerhalb und die Reihe lässt sich nicht quer scrollen (overflow-x: ${info.ox})` }, row);
          } else if (/auto|scroll/.test(info.ox)) {
            const k = ctx.vp + '|' + ctx.page + '|' + info.path + '|' + b.label;
            if (!scrollTested.has(k)) { scrollTested.add(k); await scrollRow(ctx, { tag: row, path: info.path, label: 'Unter-Badges ' + b.label, sw: info.sw, cw: info.cw, subBadges: true }); }
          }
        }
        for (const s of fresh.slice(0, LIMIT.subs)) {
          const cur = (await collect(ctx, BADGE_SEL, { filter: BADGE_F })).find((x) => x.tag === s.tag);
          if (!cur) continue;
          await tap(ctx, cur, 'Unter-Badge ' + s.label.slice(0, 40), { settle: 1200, deadSev: 'warn' });
          if (await Q(ctx, () => window.__qa.dialogs().length).catch(() => 0)) {
            await scan(ctx, null, 'Popup von Unter-Badge ' + s.label.slice(0, 20) + ': ');
            await crawlPopupControls(ctx, 'Unter-Badge ' + s.label.slice(0, 20));
            await closeAll(ctx);
          }
        }
      }
      await closeAll(ctx);
      await Q(ctx, () => window.__qa.uiSet('input_select.casora_expanded_row', 'none')).catch(() => {});
      await ctx.page_.waitForTimeout(500);
    }

    // Kacheln: Antippen öffnet ein Popup (oder schaltet – dann wird der Dienst abgefangen).
    const tiles = await collect(ctx, 'ha-card', { filter: TILE_FILTER });
    console.log(`  ${ctx.page}: ${tiles.length} Kacheln`);
    for (const t of tiles.slice(0, LIMIT.tiles)) {
      const now = (await collect(ctx, 'ha-card', { filter: TILE_FILTER })).find((x) => x.tag === t.tag) || (await collect(ctx, 'ha-card', { filter: TILE_FILTER })).find((x) => x.path === t.path && x.label === t.label);
      if (!now) continue;
      const d = await tap(ctx, now, 'Kachel ' + t.label.slice(0, 40), { settle: 1500 });
      if (!d || d.skipped || d.failed || d.gone) continue;
      if (d.dialog) {
        await scan(ctx, null, 'Popup ' + t.label.slice(0, 20) + ': ');
        await crawlPopupControls(ctx, 'Kachel ' + t.label.slice(0, 20));
      }
      await closeAll(ctx);
      const left = await Q(ctx, () => window.__qa.dialogs().length).catch(() => 0);
      if (left) {
        await finding(ctx, { sev: 'error', kind: 'popup-schliesst-nicht', label: t.label, path: t.path, detail: 'Popup/Dialog bleibt nach Escape + Schließen offen' });
        await goto(ctx, '/' + dash + '/' + v, DASH_READY);
      }
      if (d.url && !ctx.page_.url().includes('/' + dash + '/' + v)) await goto(ctx, '/' + dash + '/' + v, DASH_READY);
    }
  }
  await uiRestore(ctx, uiStart);
}

// Im offenen Popup: Tabs, Segmente, Chips – nur harmlose (Dienste sind ohnehin abgefangen).
async function crawlPopupControls(ctx, where) {
  const SEL = 'casora-popup [role=tab], casora-popup [role=radio], casora-popup .seg button, casora-popup .segopt, casora-popup [class*=chip], casora-popup [class*=tab]:not([class*=table]), casora-popup [class*=pill]:not([class*=badge]), ha-more-info-dialog [role=tab], ha-more-info-dialog mwc-tab, ha-more-info-dialog ha-tab';
  const ctrls = (await collect(ctx, SEL)).filter((c) => !DENY.test(c.label) && c.label);
  const seenL = new Set();
  let n = 0;
  for (const c of ctrls) {
    if (n >= LIMIT.controls || seenL.has(c.label)) continue;
    seenL.add(c.label);
    const cur = (await collect(ctx, SEL)).find((x) => x.label === c.label);
    if (!cur) continue;
    n++;
    await tap(ctx, cur, where + ' → ' + c.label.slice(0, 30), { settle: 800, deadSev: 'warn', deny: true });
    await scan(ctx, null, where + ' → ' + c.label.slice(0, 20) + ': ');
    if (!(await Q(ctx, () => window.__qa.dialogs().length).catch(() => 0))) break; // Popup zu → fertig
  }
}

// ═══ Ablauf ═══════════════════════════════════════════════════════════
async function pickDashboards(ctx) {
  await goto(ctx, '/casora-studio', PANEL_READY);
  return Q(ctx, async ([want, wantM]) => {
    const h = document.querySelector('home-assistant').hass;
    const list = await h.callWS({ type: 'lovelace/dashboards/list' });
    const urls = list.map((d) => d.url_path);
    const isCasora = async (u) => { try { const c = await h.callWS({ type: 'lovelace/config', url_path: u }); return /"casora_|custom:casora-/.test(JSON.stringify(c.views || [])) ? c : null; } catch (e) { return null; } };
    let dash = want || (urls.includes('qa-stress') ? 'qa-stress' : null);
    let cfg = dash ? await isCasora(dash) : null;
    if (!cfg) {
      // Vorrang: ein echtes, im Studio angelegtes Casora-Dashboard (Raumkarte „vom Panel
      // verwaltet“) mit Handy-Gegenstück; dann andere Casora-Dashboards. Kurzlebige Hilfs-Dashboards anderer Tests (qa-*)
      // nur, wenn es sonst nichts gibt – sie können mitten im Lauf verschwinden.
      const cand = [];
      // Nie die Hemma-Fixture dashboard-hemma(-mobile) des Zustands „arbeit“: speichergesperrt und
      // von der automatischen Vorlagen-Auffrischung ausgenommen – alte Vorlagen, keine Produktprüfung.
      for (const u of urls.filter((u) => !/-mobile$/.test(u) && !/^dashboard-hemma/.test(u))) {
        const c = await isCasora(u); if (!c) continue;
        const managed = (c.views || []).some((v) => (((v.cards || [])[0] || {}).variables || {}).casora_ui_managed);
        const rank = (/^qa-/.test(u) ? 4 : 0) + (managed ? 0 : 2) + (urls.includes(u + '-mobile') ? 0 : 1);
        cand.push({ u, c, rank });
      }
      cand.sort((a, b) => a.rank - b.rank);
      if (cand[0]) { dash = cand[0].u; cfg = cand[0].c; }
    }
    if (!cfg) return null;
    const mob = wantM || (urls.includes(dash + '-mobile') ? dash + '-mobile' : null);
    const mcfg = mob ? await isCasora(mob) : null;
    const paths = (c) => (c.views || []).map((v, i) => v.path || String(i));
    return { dash, views: paths(cfg), mobile: mcfg ? mob : null, mviews: mcfg ? paths(mcfg) : [], storage: list.find((d) => d.url_path === dash)?.mode !== 'yaml' };
  }, [opt('dash', ''), opt('mobile-dash', '')]);
}

if (MERGE) process.exit(mergeReports(argv.slice(argv.indexOf('--merge') + 1).filter((a) => !a.startsWith('--') && a !== opt('seconds', '')), Number(opt('seconds', 0))));

const t0 = Date.now();
let target = null;
for (const vp of VIEWPORTS) {
  let ctx;
  try {
    ctx = await newCtx(vp);
    if (!target) {
      target = await pickDashboards(ctx);
      if (!target) { console.error('Kein Casora-Dashboard gefunden (--dash angeben oder dev/qa/stress-setup.mjs laufen lassen).'); process.exit(2); }
      console.log('Test-Dashboard:', target.dash, target.views.length, 'Ansichten; Handy:', target.mobile || '–');
    }
    if (ONLY !== 'dashboard') await crawlStudio(ctx, target.dash).catch((e) => finding(ctx, { sev: 'error', kind: 'lauf-abbruch', detail: 'Studio: ' + String(e.stack || e).slice(0, 300) }));
    if (ONLY !== 'studio') {
      const phone = VP[vp].mobile && VP[vp].width < 600;
      const [d, views] = phone && target.mobile ? [target.mobile, target.mviews] : [target.dash, target.views];
      await crawlDashboard(ctx, d, views).catch((e) => finding(ctx, { sev: 'error', kind: 'lauf-abbruch', detail: 'Dashboard: ' + String(e.stack || e).slice(0, 300) }));
    }
  } catch (e) {
    findings.push({ sev: 'error', kind: 'lauf-abbruch', viewport: vp, page: '', label: '', path: '', detail: String(e.stack || e).slice(0, 400) });
    console.error(e);
  } finally {
    if (ctx) await ctx.browser.close().catch(() => {});
  }
}

// ── Bericht ─────────────────────────────────────────────────────────────
process.exit(writeReport({ findings, stats, target, seconds: Math.round((Date.now() - t0) / 1000), viewports: VIEWPORTS, quick: QUICK }));

function writeReport({ findings, stats, target, seconds, viewports, quick }) {
  const order = { error: 0, warn: 1, info: 2 };
  findings.sort((a, b) => order[a.sev] - order[b.sev] || a.kind.localeCompare(b.kind) || a.viewport.localeCompare(b.viewport));
  const count = (s) => findings.filter((f) => f.sev === s).length;
  const summary = { when: new Date().toISOString(), seconds, quick, viewports,
    dashboard: target, writesBlocked: !ALLOW_WRITES, stats, errors: count('error'), warnings: count('warn'), infos: count('info') };
  fs.writeFileSync(path.join(OUTDIR, 'bericht.json'), JSON.stringify({ summary, findings }, null, 1));
  const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const md = [
    `# Casora QA „Alles bedienen“ – ${summary.when.slice(0, 16).replace('T', ' ')}`,
    '',
    `Dashboard **${target ? target.dash : '–'}**${target && target.mobile ? ' / ' + target.mobile : ''} · Viewports ${viewports.join(', ')}${quick ? ' · Kurzlauf' : ''} · ${summary.seconds}s`,
    `Angetippt: ${stats.tapped} · tot: ${stats.dead} · Seiten: ${stats.pages} · abgefangene Schreibaufrufe: ${stats.blocked} · UI-Helfer gesetzt: ${stats.ui || 0}`,
    '',
    `**${summary.errors} Fehler · ${summary.warnings} Warnungen · ${summary.infos} Hinweise**`,
    '',
    '## Nach Art',
    '',
    ...Object.entries(findings.reduce((m, f) => { const k = f.sev + ' · ' + f.kind; m[k] = (m[k] || 0) + 1; return m; }, {})).map(([k, n]) => `- ${k}: ${n}`),
    '',
    '## Befunde',
    '',
    '| Stufe | Art | Viewport | Seite | Element | Details | Bild |',
    '|---|---|---|---|---|---|---|',
    ...findings.filter((f) => f.sev !== 'info').map((f) => `| ${f.sev} | ${f.kind} | ${f.viewport} | ${esc(f.page)} | ${esc(f.label).slice(0, 60)}<br><sub>${esc(f.path).slice(0, 160)}</sub> | ${esc(f.detail).slice(0, 300)} | ${f.shot ? `[Bild](${f.shot})` : ''} |`),
    '',
    '<details><summary>Hinweise (übersprungen, abgefangen …)</summary>',
    '',
    ...findings.filter((f) => f.sev === 'info').map((f) => `- [${f.viewport}] ${esc(f.page)} · ${f.kind}: ${esc(f.label)} ${esc(f.detail)}`),
    '',
    '</details>',
  ].join('\n');
  fs.writeFileSync(path.join(OUTDIR, 'bericht.md'), md);
  console.log(`\n${summary.errors} Fehler, ${summary.warnings} Warnungen, ${summary.infos} Hinweise – Bericht: ${path.join(OUTDIR, 'bericht.md')}`);
  return summary.errors ? 1 : 0;
}

// Teilberichte (je Viewport/Teil ein Ordner mit bericht.json) zu einem Bericht zusammenführen.
// Fehlt ein Teilbericht (Prozess abgestürzt), ist das ein Fehler „lauf-abbruch“. Texte,
// abgeschnittene Stellen und doppelte Knöpfe zählen wie im Einzellauf je Viewport nur einmal –
// auch wenn sie im Studio- und im Dashboard-Teil desselben Viewports auftauchen.
function mergeReports(dirs, seconds) {
  const all = [], st = { tapped: 0, dead: 0, pages: 0, blocked: 0, ui: 0 }, vps = new Set();
  let target = null, quick = false, maxSec = 0;
  const seenM = new Set();
  const norm = (x) => String(x || '').replace(/\d+([:.,]\d+)*/g, '#').replace(/\.(focusing|on|open|infocus)\b/g, '');
  for (const dir of dirs) {
    const f = path.join(dir, 'bericht.json');
    let doc = null;
    try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
      all.push({ sev: 'error', kind: 'lauf-abbruch', viewport: path.basename(dir), page: '', label: '', path: '', detail: 'Teilbericht fehlt: ' + f });
      continue;
    }
    const s = doc.summary || {};
    for (const k of Object.keys(st)) st[k] += (s.stats || {})[k] || 0;
    (s.viewports || []).forEach((v) => vps.add(v));
    quick = quick || !!s.quick;
    maxSec = Math.max(maxSec, s.seconds || 0);
    if (s.dashboard) {
      if (!target) target = s.dashboard;
      else if (target.dash !== s.dashboard.dash) all.push({ sev: 'error', kind: 'lauf-abbruch', viewport: path.basename(dir), page: '', label: '', path: '', detail: `Teil prüfte ${s.dashboard.dash} statt ${target.dash}` });
    }
    for (const x of doc.findings || []) {
      if (/^(text-|abgeschnitten|doppelter-knopf)/.test(x.kind)) {
        const key = [x.kind, x.viewport, norm(x.path), norm(x.label || x.detail)].join('|');
        if (seenM.has(key)) continue;
        seenM.add(key);
      }
      if (x.shot) x.shot = path.relative(OUTDIR, path.join(dir, x.shot));
      all.push(x);
    }
  }
  const vpOrder = Object.keys(VP);
  const viewports = [...vps].sort((a, b) => vpOrder.indexOf(a) - vpOrder.indexOf(b));
  console.log(`Zusammengeführt: ${dirs.length} Teile, Viewports ${viewports.join(', ')}`);
  return writeReport({ findings: all, stats: st, target, seconds: seconds || maxSec, viewports, quick });
}
