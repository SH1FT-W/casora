// Leistung messen (1.3 „Schneller“): Ladezeit, Popups, Raumwechsel, Studio-Start, Neuzeichnen je
// hass-Update, Timer/Beobachter, Dateigrößen, Speicher. Wiederholbar (je Messung Median aus --runs Läufen),
// standardmäßig im Theme „Casora“.
//
//   CASORA_URL=http://localhost:<port> node dev/qa/leistung.mjs [Optionen]
//     --runs 3                  Läufe je Messung (Median)
//     --dash <url_path>         Desktop-Dashboard (Standard: test-neu bzw. erstes Casora-Dashboard); Handy: <url>-mobile
//     --geraete desktop,handy   desktop = Chromium 1440×900, handy = WebKit 393×852 (iPhone)
//     --teile laden,popup,raum,studio,update,leck   Messungen (Standard alle; Studio nur am Desktop)
//     --speicher <min>          zusätzlich: Speicher nach <min> Minuten Leerlauf mit Zustandsänderungen (Chromium)
//     --json <datei>            Ergebnis schreiben
//     --vergleich <datei>       Tabelle vorher (Datei) / nachher (dieser Lauf)
//     LEISTUNG_INIT=<datei.js>  Versuchs-Skript vor allem anderen einspielen (A/B ohne HA-Änderung)
//     LEISTUNG_STAPEL=1         Herkunft der Voll-Durchläufe (querySelectorAll('*')) im Leerlauf sammeln
//     --grenzen <datei>         Messgrenzen prüfen ({ "pfad.im.ergebnis": { "max": n } }), Rückgabe 1 bei Überschreitung
//
// Gemessen wird im Browser über eine Instrumentierung vor dem ersten Skript (addInitScript):
//  - jedes Custom Element mit Lit-update() zählt Neuzeichnen und Zeit je Tag (button-card, smart-row, …),
//    button-card zusätzlich Anzahl/Zeit der [[[ ]]]-Auswertungen (_evalTemplate);
//  - „erste Kachel“ = erste gezeichnete, sichtbare button-card einer Kachel/eines Badges (nicht Raum-Hülle);
//  - „steht“ = letztes Neuzeichnen vor 600 ms Ruhe (höchstens 20 s);
//  - Popup: vom Antippen (pointerdown/touchstart) bis die Popup-Fläche Inhalt hat bzw. steht;
//  - setInterval (aktive, mit Herkunft), setTimeout-Aufrufe, MutationObserver, Listener an window/document;
//  - Chromium: Performance.getMetrics (Script-/Layout-/Style-Zeit, Knoten, JS-Listener, Heap nach GC), lange Tasks.
// Schreibt nichts in Dashboards. Für Zustandsänderungen setzt es per REST eine eigene Test-Entität
// (sensor.casora_leistung_test) und den Wert eines gezeigten Leistungssensors (nur Wegwerf-HA!).
import fs from 'node:fs';
import { tokens, ws } from './ws.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
await tokens();
const H = await import('../e2e/harness.mjs');
const BASE = H.BASE;
if (/:(8123|8124)$/.test(BASE) || /192\.168\./.test(BASE)) { console.log('leistung: nur Wegwerf-HA (nicht 8123/8124/Prod)'); process.exit(2); }

const RUNS = Number(arg('runs', 3));
const GERAETE = arg('geraete', 'desktop,handy').split(',');
const TEILE = new Set(arg('teile', 'laden,popup,raum,studio,update,leck').split(','));
const SPEICHER = Number(arg('speicher', 0));
const VIEWS = {
  desktop: { width: 1440, height: 900 },
  handy: { width: 393, height: 852, mobile: true, safari: true, scale: 3 },
};

// ── Dashboard wählen ────────────────────────────────────────────────────────
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
const cfgs = {};
for (const d of list.filter((x) => x.mode === 'storage' && !/^dashboard-hemma/.test(x.url_path))) {
  try { cfgs[d.url_path] = await c.cmd({ type: 'lovelace/config', url_path: d.url_path }); } catch (e) { /* leer */ }
}
try { await c.cmd({ type: 'frontend/set_user_data', key: 'theme', value: null }); } catch (e) { /* egal */ }
c.close();
const isCasora = (u) => cfgs[u] && /casora_room|casora_mobile/.test(JSON.stringify(cfgs[u]));
const DASH = arg('dash') || (isCasora('test-neu') ? 'test-neu' : Object.keys(cfgs).find((u) => !/-mobile$/.test(u) && isCasora(u)));
if (!DASH) { console.log('FAIL leistung – kein Casora-Dashboard'); process.exit(1); }
const PHONE = cfgs[DASH + '-mobile'] ? DASH + '-mobile' : DASH;
const views = (cfgs[DASH].views || []).map((v, i) => ({ path: v.path || String(i), json: JSON.stringify(v) }));
const HOME = views[0].path;
const TOKEN = (await tokens()).access_token;
const rest = (p, body) => fetch(BASE + p, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
// Gezeigter Leistungssensor (Energie-Badge der Startseite), sonst irgendeiner aus dem Dashboard.
const POWER = (JSON.stringify(cfgs[DASH]).match(/sensor\.[a-z0-9_]*(hausbedarf|leistung|power)[a-z0-9_]*/) || [])[0] || null;
const LIGHT = (views[0].json.match(/light\.[a-z0-9_]+/) || [])[0] || null;

// ── Instrumentierung (im Browser vor jedem anderen Skript) ──────────────────
const INSTR = (opt) => {
  if (window.__lp) return;
  const now = () => performance.now();
  const L = window.__lp = { renders: {}, rtime: {}, evalN: 0, evalMs: 0, firstTile: null, lastRender: 0, localLoaded: null,
    intervals: new Map(), timeouts: 0, ruLeer: 0, perform: 0, qsaStar: 0, mo: { created: 0, observing: 0 }, ls: {}, longtasks: [], down: null, renderLog: null };
  window.addEventListener('casora-local-loaded', () => { L.localLoaded = now(); });
  const sI = window.setInterval, cI = window.clearInterval, sT = window.setTimeout;
  const origin = () => { const s = (new Error().stack || '').split('\n').slice(3, 6).map((x) => x.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+/g, '').replace(/\?[^:)]*/g, '')); return s.join(' < '); };
  window.setInterval = function (f, ms, ...a) { const id = sI.call(this, f, ms, ...a); L.intervals.set(id, { ms: ms | 0, at: origin() }); return id; };
  window.clearInterval = function (id) { L.intervals.delete(id); return cI.call(this, id); };
  window.setTimeout = function (...a) { L.timeouts++; return sT.apply(this, a); };
  // Voll-Durchläufe: querySelectorAll('*') auf Dokument, Elementen und Shadow-Roots.
  for (const P of [Document.prototype, Element.prototype, DocumentFragment.prototype]) {
    const q = P.querySelectorAll;
    P.querySelectorAll = function (sel) {
      if (sel === '*') {
        L.qsaStar++;
        // LEISTUNG_STAPEL=1: Herkunft der Voll-Durchläufe sammeln (teuer, nur zur Ursachensuche).
        if (opt && opt.stacks) { const k = (new Error().stack || '').split('\n').slice(2, 12).map((x) => x.trim().replace(/^at /, '').replace(/https?:\/\/[^/]+/g, '').replace(/\?[^:)]*/g, '')).filter((x) => !/^(walk|deep|findDeep|NodeList|Array)/.test(x)).slice(0, 3).join(' < '); L.qsaBy = L.qsaBy || {}; L.qsaBy[k] = (L.qsaBy[k] || 0) + 1; }
      }
      return q.call(this, sel);
    };
  }
  const MO = window.MutationObserver;
  window.MutationObserver = class extends MO {
    constructor(cb) { super(cb); L.mo.created++; }
    observe(...a) { if (!this.__lpo) { this.__lpo = 1; L.mo.observing++; } return super.observe(...a); }
    disconnect() { if (this.__lpo) { this.__lpo = 0; L.mo.observing--; } return super.disconnect(); }
  };
  for (const [nm, tgt] of [['window', window], ['document', document]]) {
    const a = tgt.addEventListener, r = tgt.removeEventListener;
    tgt.addEventListener = function (t, ...x) { L.ls[nm + ':' + t] = (L.ls[nm + ':' + t] || 0) + 1; return a.call(this, t, ...x); };
    tgt.removeEventListener = function (t, ...x) { L.ls[nm + ':' + t] = (L.ls[nm + ':' + t] || 0) - 1; return r.call(this, t, ...x); };
  }
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => L.longtasks.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); } catch (e) { /* WebKit */ }
  for (const t of ['pointerdown', 'touchstart', 'mousedown']) window.addEventListener(t, (e) => { if (L.down === null) L.down = now(); }, true);
  const TILE = /^casora_(?!room$|mobile_bg$|mobile_chrome$|time$)/;
  // HA ersetzt die Registry (scoped-custom-element-registry): define abfangen greift nicht. Deshalb die
  // Klassen bekannter Elemente nach whenDefined am Prototyp messen (gilt auch für schon erzeugte).
  const TAGS = ['button-card', 'casora-smart-row', 'casora-chart', 'casora-nav', 'casora-nav-bar', 'casora-mobile-nav', 'casora-popup',
    'casora-swipe-card', 'casora-filter-overlay', 'layout-card', 'grid-layout', 'hui-card', 'hui-badge', 'hui-view', 'hui-sections-view',
    'hui-masonry-view', 'hui-panel-view', 'ha-state-icon', 'ha-icon', 'hui-root', 'casora-panel'];
  const wrap = (name, cls) => {
    const p = cls && cls.prototype;
    if (!p || typeof p.update !== 'function' || Object.prototype.hasOwnProperty.call(p, '__lpw')) return;
    p.__lpw = true;
    const orig = p.update;
    p.update = function (ch) {
      const t = now();
      try { return orig.call(this, ch); } finally {
        const e = now();
        L.renders[name] = (L.renders[name] || 0) + 1; L.rtime[name] = (L.rtime[name] || 0) + (e - t); L.lastRender = e;
        if (L.renderLog) L.renderLog.push(name === 'button-card' ? 'bc:' + [].concat((this._config || {}).template || []).join('+') : name);
        if (name === 'button-card' && L.firstTile === null) {
          const self = this;
          requestAnimationFrame(() => {
            if (L.firstTile !== null) return;
            const tp = [].concat((self._config || {}).template || []);
            if (!tp.some((x) => TILE.test(x))) return;
            const r = self.getBoundingClientRect();
            const vis = !self.checkVisibility || self.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
            if (r.width > 20 && r.height > 20 && r.top < innerHeight && vis) L.firstTile = now();
          });
        }
      }
    };
    if (name === 'button-card') {
      // requestUpdate() ohne Eigenschaft (Backlog 1.3) und Aktualisierungen, die shouldUpdate abweist.
      const ru = p.requestUpdate, pu = p.performUpdate;
      p.requestUpdate = function (...a) { if (!a.length) L.ruLeer++; return ru.apply(this, a); };
      if (typeof pu === 'function') p.performUpdate = function (...a) { L.perform++; return pu.apply(this, a); };
    }
    // [[[ ]]]-Auswertung über _getTemplateOrValue messen (nur die äußerste Ebene) – so bleibt _evalTemplate
    // unberührt und ein Zwischenspeicher, der es ersetzt, wird mitgemessen.
    if (name === 'button-card' && typeof p._getTemplateOrValue === 'function') {
      const og = p._getTemplateOrValue; let depth = 0;
      p._getTemplateOrValue = function (a, b) {
        if (depth++) { try { return og.call(this, a, b); } finally { depth--; } }
        const t = now();
        try { return og.call(this, a, b); } finally { depth--; if (typeof b === 'string' && b.indexOf('[[[') >= 0) L.evalN++; L.evalMs += now() - t; }
      };
    }
  };
  const hook = () => { if (!window.customElements || !customElements.whenDefined) return setTimeout(hook, 5);
    TAGS.forEach((t) => customElements.whenDefined(t).then(() => { try { wrap(t, customElements.get(t)); } catch (e) { /* weiter */ } })); };
  hook();
};

// Hilfen im Browser
const SNAP = () => { const L = window.__lp; return { renders: { ...L.renders }, rtime: { ...L.rtime }, evalN: L.evalN, evalMs: L.evalMs, timeouts: L.timeouts, lt: L.longtasks.length, ruLeer: L.ruLeer, perform: L.perform, qsaStar: L.qsaStar }; };
const diff = (a, b) => {
  const r = {}; let n = 0, ms = 0;
  for (const k of Object.keys(b.renders)) { const d = b.renders[k] - (a.renders[k] || 0); if (d) { r[k] = d; n += d; ms += b.rtime[k] - (a.rtime[k] || 0); } }
  return { n, ms: +ms.toFixed(1), bc: r['button-card'] || 0, je: r, evalN: b.evalN - a.evalN, evalMs: +(b.evalMs - a.evalMs).toFixed(1), timeouts: b.timeouts - a.timeouts,
    ruLeer: b.ruLeer - a.ruLeer, abgewiesen: (b.perform - a.perform) - (r['button-card'] || 0), qsaStar: b.qsaStar - a.qsaStar };
};
const median = (a) => { const v = a.filter((x) => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); if (!v.length) return null; const m = v.length >> 1; return +(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2).toFixed(1); };

async function quiet(page, since, { quietMs = 600, max = 20000 } = {}) {
  return page.evaluate(async ({ since, quietMs, max }) => {
    const L = window.__lp; const t0 = performance.now();
    while (performance.now() - t0 < max) {
      await new Promise((r) => setTimeout(r, 100));
      if (performance.now() - Math.max(L.lastRender, since) >= quietMs) break;
    }
    return Math.max(0, L.lastRender - since);
  }, { since, quietMs, max });
}

async function metrics(page, cdp) {
  if (!cdp) return null;
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch (e) { /* egal */ }
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const o = {}; for (const x of m) o[x.name] = x.value;
  return { heapMB: +(o.JSHeapUsedSize / 1048576).toFixed(1), nodes: o.Nodes, listeners: o.JSEventListeners, docs: o.Documents,
    scriptS: +o.ScriptDuration.toFixed(2), layoutS: +o.LayoutDuration.toFixed(2), styleS: +o.RecalcStyleDuration.toFixed(2), taskS: +o.TaskDuration.toFixed(2) };
}

async function openBrowser(name) {
  const o = await H.open({ ...VIEWS[name] });
  await o.context.addInitScript(INSTR, { stacks: !!process.env.LEISTUNG_STAPEL });
  await o.context.addInitScript(() => { window.CASORA_QA_NO_WELLE_AUTO = true; });
  // LEISTUNG_INIT=<datei.js>: zusätzliches Skript vor allem anderen (A/B-Versuch ohne HA-Änderung).
  if (process.env.LEISTUNG_INIT) await o.context.addInitScript({ path: process.env.LEISTUNG_INIT });
  let cdp = null;
  if (!VIEWS[name].safari) { cdp = await o.context.newCDPSession(o.page); await cdp.send('Performance.enable'); }
  return { ...o, cdp };
}

// Laden: Zeit bis erste Kachel / Casora-Module / alles steht, dazu Netz und Neuzeichnen.
async function load(page, url, net) {
  const wsBytes = { n: 0, max: 0, sum: 0 };
  const onWs = (w) => w.on('framereceived', (f) => { const l = typeof f.payload === 'string' ? Buffer.byteLength(f.payload) : f.payload.length; wsBytes.n++; wsBytes.sum += l; wsBytes.max = Math.max(wsBytes.max, l); });
  page.on('websocket', onWs);
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: H.PIERCE });
  await page.waitForFunction(() => window.__lp && window.__lp.firstTile !== null && window._casoraLocalLoaded, null, { timeout: 90000 });
  const settled = await quiet(page, 0, { quietMs: 1000, max: 25000 });
  const r = await page.evaluate(() => { const L = window.__lp; const nav = performance.getEntriesByType('navigation')[0];
    return { firstTile: L.firstTile, localLoaded: L.localLoaded, dcl: nav && nav.domContentLoadedEventEnd, longN: L.longtasks.length, longMs: L.longtasks.reduce((s, x) => s + x[1], 0), long50: L.longtasks.filter((x) => x[1] > 200).length }; });
  const s = await page.evaluate(SNAP);
  page.off('websocket', onWs);
  return { firstTile: +r.firstTile.toFixed(0), localLoaded: r.localLoaded && +r.localLoaded.toFixed(0), settled: +settled.toFixed(0), dcl: r.dcl && +r.dcl.toFixed(0),
    renders: Object.values(s.renders).reduce((a, b) => a + b, 0), bc: s.renders['button-card'] || 0, renderMs: +Object.values(s.rtime).reduce((a, b) => a + b, 0).toFixed(0),
    evalN: s.evalN, evalMs: +s.evalMs.toFixed(0), longN: r.longN, longMs: r.longMs, ws: wsBytes, qsaStar: s.qsaStar, ruLeer: s.ruLeer, abgewiesen: s.perform - (s.renders['button-card'] || 0) };
}

// Netz: alle Antworten beim kalten Laden (Größe gepackt/entpackt, gzip, Zwischenspeicher).
function netRecorder(page) {
  const rows = [];
  page.on('response', async (resp) => {
    try {
      const u = new URL(resp.url()); const req = resp.request();
      if (!/^https?:/.test(u.protocol)) return;
      const h = await resp.allHeaders();
      const enc = h['content-encoding'] || '';
      let body = null; try { body = (await resp.body()).length; } catch (e) { /* 304/leer */ }
      let sz = null; try { sz = (await req.sizes()).responseBodySize; } catch (e) { /* WebKit */ }
      rows.push({ path: u.pathname, status: resp.status(), type: req.resourceType(), enc, raw: body, wire: sz, cache: h['cache-control'] || '' });
    } catch (e) { /* Seite weg */ }
  });
  return rows;
}
const group = (p) => /casora-templates\.json|\/api\/casora\/templates/.test(p) ? 'Vorlagen (Studio)'
  : /\/casora_scripts\/local\//.test(p) ? 'scripts/local/*.js' : /casora-core\.js/.test(p) ? 'casora-core.js'
    : /casora-i18n|\/i18n|phrases|translations/.test(p) ? 'i18n' : /\/casora_scripts\//.test(p) ? 'übrige Casora-Skripte'
      : /\/casora_panel\/|casora-studio/.test(p) ? 'Studio (Panel)' : /\/casora_(assets|images|fonts|room_icons)/.test(p) ? 'Casora-Bilder/Schriften'
        : /\/local\/community\/|\/hacsfiles\/|\/uix\//.test(p) ? 'Fremdkarten (HACS)' : /\/frontend_(latest|es5)\//.test(p) ? 'HA-Frontend' : 'sonstiges';
function sumNet(rows) {
  const g = {};
  for (const r of rows) {
    const k = group(r.path); const x = g[k] = g[k] || { n: 0, rawKB: 0, wireKB: 0, gzip: 0, files: [] };
    x.n++; x.rawKB += (r.raw || 0) / 1024; x.wireKB += (r.wire != null ? r.wire : (r.raw || 0)) / 1024; if (/gzip|br/.test(r.enc)) x.gzip++;
    if (/casora|community/.test(r.path) && (r.raw || 0) > 20000) x.files.push(`${r.path.split('/').pop()} ${Math.round((r.raw || 0) / 1024)}→${Math.round((r.wire || 0) / 1024)} KB${r.enc ? ' ' + r.enc : ''}`);
  }
  for (const x of Object.values(g)) { x.rawKB = Math.round(x.rawKB); x.wireKB = Math.round(x.wireKB); }
  return { requests: rows.length, ungepacktJsJson: rows.filter((r) => /\.(js|json)$/.test(r.path) && (r.raw || 0) > 20000 && !r.enc && r.status === 200).map((r) => r.path), gruppen: g };
}

// Popup: Ziele je Gerät (Vorlagen-Muster), bei Sammel-Badges erst aufklappen.
const POPUPS = {
  licht: { tile: /^casora_badge_light$|casora_popup_light|^casora_light/, expand: /badge_light_group/ },
  // FBH-Thermostat (casora_popup_fbh) ist im Testhaus leer – gemessen wird das Klima-Popup eines Badges.
  thermostat: { tile: /casora_climate_popup|^casora_badge_(climate|temp)$/, expand: /badge_climate_group/ },
  energie: { tile: /^casora_badge_energy$|casora_popup_energy/, expand: /badge_energy_group/ },
  // Pulse gibt es im Testhaus nicht: Batterien-Kachel (casora_battery → casora_popup_battery) wird nur im
  // Browser hinter die Rezept-Kachel gesetzt (injectBattery), am Handy auf der Startseite.
  pulse: { tile: /casora_pulse$|casora_battery/, expand: null, inject: true },
};
async function findTile(page, re) {
  return page.evaluate((src) => { const re = new RegExp(src);
    const b = window.__pierce('button-card').find((x) => { const t = [].concat((x._config || {}).template || []).join('+'); const r = x.getBoundingClientRect();
      return re.test(t) && r.width > 20 && r.height > 20 && (!x.checkVisibility || x.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })); });
    if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' });
    // Kachelreihe (casora-smart-row) scrollt selbst quer: bis die Kachel im Fenster liegt.
    for (let a = b, n = 0; a && n < 40; a = a.parentElement || (a.getRootNode() && a.getRootNode().host), n++) {
      if (a.scrollWidth > a.clientWidth + 4 && /auto|scroll/.test(getComputedStyle(a).overflowX)) { const rr = b.getBoundingClientRect(), ar = a.getBoundingClientRect(); a.scrollLeft += (rr.x + rr.width / 2) - (ar.x + ar.width / 2); }
    }
    const r = b.getBoundingClientRect(); if (r.x < 0 || r.x + r.width > innerWidth) return null;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, t: [].concat((b._config || {}).template || []).join('+') }; }, re.source);
}
async function injectBattery(page) {
  return page.evaluate(() => {
    if (window.__lpBattery) return true;
    const pl = window.__pierce('ha-panel-lovelace')[0];
    if (!pl || typeof pl._setLovelaceConfig !== 'function') return false;
    const cfg = structuredClone(pl.lovelace.config);
    let done = false;
    (function walk(o) { if (done || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { const x = o[i];
        if (x && [].concat(x.template || []).some((t) => /^casora_(recipe|trash|car)$/.test(t))) { o.splice(i, 0, { ...x, template: 'casora_battery', entity: undefined, name: 'Batterien', variables: {} }); done = true; return; }
        walk(x); } return; }
      for (const k of Object.keys(o)) if (k !== 'button_card_templates') walk(o[k]); })(cfg.views);
    if (done) { pl._setLovelaceConfig(cfg, pl.lovelace.rawConfig, pl.lovelace.mode); window.__lpBattery = true; }
    return done;
  }).then(async (ok) => { await page.waitForTimeout(2500); return ok; });
}
const popupOpen = (page) => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (s) return true;
  return window.__pierce('ha-more-info-dialog, ha-adaptive-dialog').some((d) => { const r = d.getBoundingClientRect(); return r.width > 80 && r.height > 80; }); });
async function closePopup(page) {
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
  await page.keyboard.press('Escape').catch(() => {});
  for (let i = 0; i < 20 && await popupOpen(page); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(400);
}
async function tap(page, at, touch) { if (touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y); }
async function measurePopup(page, spec, touch) {
  if (spec.inject) await injectBattery(page);
  let at = await findTile(page, spec.tile);
  if (!at && spec.expand) {
    const g = await findTile(page, spec.expand);
    if (g) {
      await tap(page, g, touch); await page.waitForTimeout(1500);
      // Sammel-Badge ohne Unter-Badges öffnet das Popup selbst: dann zählt das Antippen des Sammel-Badges.
      if (await popupOpen(page)) { await closePopup(page); at = g; } else at = await findTile(page, spec.tile);
    }
  }
  if (!at) return null;
  await page.waitForTimeout(300);
  const s0 = await page.evaluate(SNAP);
  await page.evaluate(() => { window.__lp.down = null; });
  await tap(page, at, touch);
  const r = await page.evaluate(async () => {
    const L = window.__lp; const t0 = performance.now();
    const content = () => { const s = window.casoraPopup && window.casoraPopup.surface;
      if (s) { const c = s.querySelector('.content') || s; return c.getBoundingClientRect().height > 60 && (c.innerText || '').trim().length > 0 || c.querySelector('*') && c.getBoundingClientRect().height > 120; }
      return window.__pierce('ha-more-info-dialog, ha-adaptive-dialog').some((d) => { const r = d.getBoundingClientRect(); return r.width > 80 && r.height > 80; }); };
    let open = null;
    while (performance.now() - t0 < 8000) { await new Promise((r) => requestAnimationFrame(r)); if (content()) { open = performance.now(); break; } }
    return { down: L.down, open };
  });
  if (!r.open || r.down === null) return { fehler: 'öffnet nicht' };
  const settled = await quiet(page, r.down, { quietMs: 500, max: 8000 });
  const s1 = await page.evaluate(SNAP);
  const d = diff(s0, s1);
  return { tile: at.t, open: +(r.open - r.down).toFixed(0), settled: +settled.toFixed(0), renders: d.n, bc: d.bc, renderMs: d.ms, evalMs: d.evalMs };
}

// Raumwechsel: Desktop = Ansicht wechseln (wie HAs navigate), Handy = _casoraFilter.set(Raum).
async function measureRoom(page, phone, target) {
  const s0 = await page.evaluate(SNAP);
  const t0 = await page.evaluate(({ phone, target, dash }) => {
    const t = performance.now();
    if (phone) window._casoraFilter.set(target);
    else { history.pushState(null, '', '/' + dash + '/' + target); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); }
    return t;
  }, { phone, target, dash: DASH });
  const first = await page.evaluate(async ({ t0 }) => { const L = window.__lp; const st = performance.now();
    while (performance.now() - st < 10000) { await new Promise((r) => requestAnimationFrame(r)); if (L.lastRender > t0) return performance.now() - t0; } return null; }, { t0 });
  const settled = await quiet(page, t0, { quietMs: 600, max: 15000 });
  const s1 = await page.evaluate(SNAP);
  const d = diff(s0, s1);
  return { first: first && +first.toFixed(0), settled: +settled.toFixed(0), renders: d.n, bc: d.bc, renderMs: d.ms, evalMs: d.evalMs };
}

// Neuzeichnen je hass-Update: fremde Entität (nirgends gezeigt), gezeigter Leistungssensor, Licht.
async function measureUpdates(page, k = 6) {
  const out = {};
  const cases = { fremd: 'sensor.casora_leistung_test' };
  if (POWER) cases.leistung = POWER;
  if (LIGHT) cases.licht = LIGHT;
  // Ruhe ohne Änderung als Bezug
  { await page.evaluate(() => { window.__lp.qsaBy = {}; });
    const a = await page.evaluate(SNAP); await page.waitForTimeout(60000); const b = await page.evaluate(SNAP); out.ruhe60s = diff(a, b);
    out.ruhe60sHerkunft = await page.evaluate(() => Object.entries(window.__lp.qsaBy || {}).sort((x, y) => y[1] - x[1]).slice(0, 10)); }
  for (const [key, eid] of Object.entries(cases)) {
    const per = [];
    for (let i = 0; i < k; i++) {
      const a = await page.evaluate(SNAP);
      if (key === 'licht') await rest('/api/states/' + eid, { state: i % 2 ? 'on' : 'off', attributes: (await (await fetch(BASE + '/api/states/' + eid, { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).attributes });
      else await rest('/api/states/' + eid, { state: String(100 + i * 7), attributes: key === 'fremd' ? { unit_of_measurement: 'W' } : (await (await fetch(BASE + '/api/states/' + eid, { headers: { Authorization: 'Bearer ' + TOKEN } })).json()).attributes });
      await page.waitForTimeout(1500);
      const b = await page.evaluate(SNAP);
      per.push(diff(a, b));
    }
    out[key] = { entity: key === 'fremd' ? eid : '(Dashboard)', renders: median(per.map((x) => x.n)), bc: median(per.map((x) => x.bc)), renderMs: median(per.map((x) => x.ms)), evalN: median(per.map((x) => x.evalN)), evalMs: median(per.map((x) => x.evalMs)), qsaStar: median(per.map((x) => x.qsaStar)), abgewiesen: median(per.map((x) => x.abgewiesen)),
      je: per[per.length - 1].je };
  }
  // Wer zeichnet bei einer fremden Änderung neu? (Vorlagen der neu gezeichneten button-cards)
  await page.evaluate(() => { window.__lp.renderLog = []; });
  await rest('/api/states/sensor.casora_leistung_test', { state: '999', attributes: { unit_of_measurement: 'W' } });
  await page.waitForTimeout(1500);
  const log = await page.evaluate(() => { const l = window.__lp.renderLog; window.__lp.renderLog = null; return l; });
  const cnt = {}; for (const x of log) cnt[x] = (cnt[x] || 0) + 1;
  out.fremdWer = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 25);
  return out;
}

async function timers(page) {
  return page.evaluate(() => { const L = window.__lp; const iv = [...L.intervals.values()];
    const by = {}; for (const x of iv) { const k = x.ms + 'ms ' + x.at.slice(0, 140); by[k] = (by[k] || 0) + 1; }
    return { intervalle: iv.length, intervalleJe: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 15), mutationObserver: { ...L.mo },
      listener: Object.fromEntries(Object.entries(L.ls).filter(([, v]) => v > 2).sort((a, b) => b[1] - a[1]).slice(0, 20)) }; });
}

// ── Ablauf ──────────────────────────────────────────────────────────────────
const R = { meta: { base: BASE, dash: DASH, phone: PHONE, runs: RUNS, theme: process.env.CASORA_THEME, at: new Date().toISOString(), power: POWER, light: LIGHT }, geraete: {} };
const roomViews = views.slice(1).map((v) => v.path);
const pulseView = (views.find((v) => /casora_popup_battery|pulse/.test(v.json)) || {}).path;

for (const g of GERAETE) {
  const phone = g === 'handy'; const touch = !!VIEWS[g].mobile;
  const url = '/' + (phone ? PHONE : DASH) + '/' + HOME;
  const res = R.geraete[g] = { kalt: [], warm: [], popup: {}, raum: [], studio: [], update: null, timer: null, leck: null, netz: null };
  console.log(`── ${g} (${url})`);
  for (let i = 0; i < RUNS; i++) {
    const o = await openBrowser(g);
    const rows = netRecorder(o.page);
    try {
      if (TEILE.has('laden')) {
        const k = await load(o.page, url); res.kalt.push(k);
        if (i === 0) res.netz = sumNet(rows);
        const m0 = await metrics(o.page, o.cdp);
        const w = await load(o.page, url); w.metrics = m0; res.warm.push(w);
        console.log(`  Lauf ${i + 1}: kalt erste Kachel ${k.firstTile} ms, steht ${k.settled} ms; warm ${w.firstTile}/${w.settled} ms; ${k.bc} button-card-Renders`);
      } else await load(o.page, url);
      if (i === 0) res.timer = await timers(o.page);
      if (TEILE.has('popup')) {
        for (const [name, spec] of Object.entries(POPUPS)) {
          if (name === 'pulse' && !phone && pulseView && pulseView !== HOME) {
            await load(o.page, '/' + DASH + '/' + pulseView);
          }
          const p = await measurePopup(o.page, spec, touch).catch((e) => ({ fehler: String(e.message || e).slice(0, 80) }));
          (res.popup[name] = res.popup[name] || []).push(p);
          await closePopup(o.page);
          if (name === 'pulse' && !phone && pulseView && pulseView !== HOME) await load(o.page, url);
        }
      }
      if (TEILE.has('raum')) {
        const seq = phone ? ['room_wohnzimmer', 'room_kche', 'all'] : roomViews.filter((v) => /wohnzimmer|kueche|buero/.test(v)).concat([HOME]);
        const rr = [];
        for (const t of seq) rr.push(await measureRoom(o.page, phone, t));
        res.raum.push(rr);
      }
      if (TEILE.has('update') && i === 0) res.update = await measureUpdates(o.page);
      if (TEILE.has('leck') && i === 0 && o.cdp) {
        // Popup 10× öffnen/schließen. Lebendig nach 65 s + GC (WeakRef auf die Karten im Popup) = Leck;
        // die Zähler aus getMetrics sinken erst nach dem (trägen) Aufräumen und sind nur ein Hinweis.
        const a = await metrics(o.page, o.cdp);
        await o.page.evaluate(() => { window.__lpWr = []; });
        let opened = 0;
        for (let n = 0; n < 10; n++) {
          const at = await findTile(o.page, POPUPS.energie.expand) || await findTile(o.page, POPUPS.licht.tile); if (!at) break;
          await tap(o.page, at, touch); await o.page.waitForTimeout(1200);
          if (await o.page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return false;
            window.__pierce('button-card, casora-smart-row, hui-vertical-stack-card', s).forEach((e) => window.__lpWr.push(new WeakRef(e))); return true; })) opened++;
          await closePopup(o.page);
        }
        const b = await metrics(o.page, o.cdp);
        await o.page.waitForTimeout(65000);
        const c = await metrics(o.page, o.cdp); await metrics(o.page, o.cdp);
        const alive = await o.page.evaluate(() => ({ alive: window.__lpWr.filter((r) => r.deref()).length, made: window.__lpWr.length }));
        const t = await timers(o.page);
        res.leck = { geoeffnet: opened, ...alive, vorher: a, nach10Popups: b, nach65s: c, intervalleDanach: t.intervalle, moDanach: t.mutationObserver };
      }
    } finally { await o.browser.close(); }
  }
  // Studio-Start (Desktop): bis _state geladen, Vorschau steht.
  if (!phone && TEILE.has('studio')) {
    for (let i = 0; i < RUNS; i++) {
      const o = await openBrowser(g);
      try {
        await o.context.addInitScript((d) => localStorage.setItem('casora_panel_last_dashboard', d), DASH);
        await o.page.goto(BASE + '/casora-studio', { waitUntil: 'domcontentloaded' });
        await o.page.addScriptTag({ content: H.PIERCE });
        await o.page.waitForFunction(() => { const p = window.__panel && window.__panel(); return !!(p && p._state && p._state.compact && p._state.compact.rooms); }, null, { timeout: 90000 });
        const tState = await o.page.evaluate(() => performance.now());
        const settled = await quiet(o.page, 0, { quietMs: 1000, max: 25000 });
        const lt = await o.page.evaluate(() => ({ n: window.__lp.longtasks.length, ms: window.__lp.longtasks.reduce((s, x) => s + x[1], 0), max: Math.max(0, ...window.__lp.longtasks.map((x) => x[1])) }));
        res.studio.push({ geladen: +tState.toFixed(0), steht: +Math.max(settled, tState).toFixed(0), longN: lt.n, longMs: lt.ms, longMax: lt.max });
        console.log(`  Studio ${i + 1}: geladen ${tState.toFixed(0)} ms, steht ${Math.max(settled, tState).toFixed(0)} ms`);
      } finally { await o.browser.close(); }
    }
  }
}

// Speicher über längere Zeit (Chromium, Desktop): Zustandsänderungen alle 3 s.
if (SPEICHER > 0) {
  const o = await openBrowser('desktop');
  try {
    await load(o.page, '/' + DASH + '/' + HOME);
    const serie = [{ min: 0, ...(await metrics(o.page, o.cdp)) }];
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < SPEICHER * 60000) {
      await rest('/api/states/sensor.casora_leistung_test', { state: String(i % 500), attributes: { unit_of_measurement: 'W' } });
      if (POWER) await rest('/api/states/' + POWER, { state: String(200 + (i % 50) * 13), attributes: { unit_of_measurement: 'W', device_class: 'power' } });
      i++;
      await o.page.waitForTimeout(3000);
      const min = Math.floor((Date.now() - t0) / 60000);
      if (min > serie[serie.length - 1].min) { serie.push({ min, ...(await metrics(o.page, o.cdp)) }); console.log(`  Speicher ${min} min: ${serie[serie.length - 1].heapMB} MB, ${serie[serie.length - 1].nodes} Knoten`); }
    }
    const t = await timers(o.page);
    R.speicher = { minuten: SPEICHER, aenderungen: i, serie, intervalle: t.intervalle, mo: t.mutationObserver };
  } finally { await o.browser.close(); }
}

// ── Zusammenfassen ──────────────────────────────────────────────────────────
const S = R.zusammenfassung = {};
for (const [g, r] of Object.entries(R.geraete)) {
  const s = S[g] = {};
  if (r.kalt.length) {
    s.kalt_ersteKachel = median(r.kalt.map((x) => x.firstTile)); s.kalt_module = median(r.kalt.map((x) => x.localLoaded)); s.kalt_steht = median(r.kalt.map((x) => x.settled));
    s.warm_ersteKachel = median(r.warm.map((x) => x.firstTile)); s.warm_steht = median(r.warm.map((x) => x.settled));
    s.laden_renders = median(r.kalt.map((x) => x.bc)); s.laden_renderMs = median(r.kalt.map((x) => x.renderMs)); s.laden_evalMs = median(r.kalt.map((x) => x.evalMs));
    s.laden_longMs = median(r.kalt.map((x) => x.longMs)); s.laden_vollDurchlaeufe = median(r.kalt.map((x) => x.qsaStar)); s.ws_kB = median(r.kalt.map((x) => Math.round(x.ws.sum / 1024)));
  }
  for (const [p, arr] of Object.entries(r.popup)) {
    const ok = arr.filter((x) => x && x.open != null);
    s['popup_' + p + '_offen'] = median(ok.map((x) => x.open)); s['popup_' + p + '_steht'] = median(ok.map((x) => x.settled)); s['popup_' + p + '_renderMs'] = median(ok.map((x) => x.renderMs));
  }
  if (r.raum.length) {
    s.raum_steht = median(r.raum.flat().map((x) => x.settled)); s.raum_renderMs = median(r.raum.flat().map((x) => x.renderMs)); s.raum_renders = median(r.raum.flat().map((x) => x.bc));
  }
  if (r.studio.length) { s.studio_geladen = median(r.studio.map((x) => x.geladen)); s.studio_steht = median(r.studio.map((x) => x.steht)); s.studio_longMs = median(r.studio.map((x) => x.longMs)); }
  if (r.update && r.update.ruhe60s) { s.ruhe60s_renders = r.update.ruhe60s.bc; s.ruhe60s_vollDurchlaeufe = r.update.ruhe60s.qsaStar; s.ruhe60s_requestUpdateLeer = r.update.ruhe60s.ruLeer; s.ruhe60s_timeouts = r.update.ruhe60s.timeouts; }
  if (r.update) for (const k of ['fremd', 'leistung', 'licht']) if (r.update[k]) { s['update_' + k + '_renders'] = r.update[k].bc; s['update_' + k + '_renderMs'] = r.update[k].renderMs; s['update_' + k + '_vollDurchlaeufe'] = r.update[k].qsaStar; }
  if (r.timer) { s.intervalle = r.timer.intervalle; s.mutationObserver = r.timer.mutationObserver.observing; }
  if (r.leck) { s.leck_popupKartenLebendig = r.leck.made ? `${r.leck.alive}/${r.leck.made}` : null; s.leck_listener = r.leck.nach65s.listeners - r.leck.vorher.listeners; s.leck_knoten = r.leck.nach65s.nodes - r.leck.vorher.nodes; s.leck_heapMB = +(r.leck.nach65s.heapMB - r.leck.vorher.heapMB).toFixed(1); }
  if (r.netz) { s.requests = r.netz.requests; for (const [k, v] of Object.entries(r.netz.gruppen)) if (/Casora|casora|Vorlagen|i18n|Studio|local/.test(k)) s['kB_' + k] = `${v.rawKB}→${v.wireKB}`; }
}
// Ausgelieferter Code (Dateien im Checkout, roh)
const CC = new URL('../../custom_components/casora/', import.meta.url).pathname;
const kb = (p) => { try { return Math.round(fs.statSync(CC + p).size / 1024); } catch (e) { return null; } };
const dir = (d) => fs.readdirSync(CC + d).filter((f) => /\.(js|json)$/.test(f)).reduce((s, f) => s + fs.statSync(CC + d + '/' + f).size, 0);
R.dateien = { 'casora-core.js': kb('scripts/casora-core.js'), 'casora-templates.json': kb('panel/casora-templates.json'), 'scripts/local/*.js': Math.round(dir('scripts/local') / 1024),
  'scripts/*.js': Math.round(dir('scripts') / 1024), 'panel/*.js': Math.round(fs.readdirSync(CC + 'panel').filter((f) => f.endsWith('.js')).reduce((s, f) => s + fs.statSync(CC + 'panel/' + f).size, 0) / 1024),
  'casora-i18n.js': kb('scripts/casora-i18n.js'), 'casora-panel-i18n.js': kb('panel/casora-panel-i18n.js') };

console.log('\n' + JSON.stringify(S, null, 1));
if (arg('json')) { fs.writeFileSync(arg('json'), JSON.stringify(R, null, 1)); console.log('→ ' + arg('json')); }

if (arg('vergleich')) {
  const A = JSON.parse(fs.readFileSync(arg('vergleich'), 'utf8'));
  console.log('\n| Messung | vorher | nachher | Δ |\n|---|---|---|---|');
  for (const [g, s] of Object.entries(S)) for (const [k, v] of Object.entries(s)) {
    const a = A.zusammenfassung && A.zusammenfassung[g] && A.zusammenfassung[g][k];
    const d = typeof v === 'number' && typeof a === 'number' ? (v - a > 0 ? '+' : '') + +(v - a).toFixed(1) : '';
    console.log(`| ${g} ${k} | ${a ?? '–'} | ${v ?? '–'} | ${d} |`);
  }
}
let rc = 0;
if (arg('grenzen')) {
  const G = JSON.parse(fs.readFileSync(arg('grenzen'), 'utf8'));
  for (const [p, lim] of Object.entries(G).filter(([k]) => !k.startsWith('_'))) {
    const v = p.split('.').reduce((o, k) => (o == null ? o : o[k]), R);
    const ok = typeof v === 'number' && (lim.max == null || v <= lim.max);
    console.log(`  ${ok ? 'ok    ' : 'FEHLER'} ${p} = ${v} (max ${lim.max})`);
    if (!ok) rc = 1;
  }
  console.log(rc ? 'FAIL leistung' : 'PASS leistung');
}
process.exit(rc);
