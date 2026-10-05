// Bildvergleich: zwei Test-HAs im selben Zustand (z. B. Stand des letzten Release gegen den
// aktuellen Checkout) Ansicht für Ansicht fotografieren und nur das zeigen, was sich sichtbar
// verändert hat – vorher | nachher | Diff, sortiert nach Größe der Änderung.
//
//   node dev/qa/bildvergleich.mjs --alt http://localhost:8195 --alt-dir <worktree v1.0.1> \
//        --neu http://localhost:8196 [--neu-dir .] --out /pfad/bildvergleich [--jobs 8]
//
// Weitere Schalter:
//   --theme "Casora"   HA-Theme beider Seiten (Standard Casora), immer hell und dunkel
//   --dash a,b               Desktop-Dashboards (Handy = <url>-mobile); Standard: alle Casora-Dashboards
//                            außer Fixture/Importkopien (dashboard-hemma*, *importiert*)
//   --vp desktop,tablet,handy  Viewports (Standard alle drei)
//   --popups n               höchstens n Popup-Arten (Standard 16)
//   --bewertung datei.json   Urteile je Ansicht { "<id>": { "urteil": "gewollt|verdächtig", "grund": "…" } }
//                            – nur Bericht neu bauen: --nur-bericht
//
// Beide Seiten laufen im Gleichschritt: dieselbe Ansicht wird auf alt und neu gleichzeitig
// geöffnet, gleich bedient und fotografiert. Feste Uhrzeit (Playwright-Clock), Animationen aus,
// alle schreibenden Aufrufe abgefangen (aufgeklappte Reihen werden nur im Browser unterschoben),
// so verändert der Lauf an keinem der beiden HAs etwas. Der Pixelvergleich läuft im Browser
// (Canvas) – keine zusätzlichen Pakete.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);

const OUT = path.resolve(arg('out', '/tmp/casora-bildvergleich'));
const BEW = arg('bewertung', null);
fs.mkdirSync(path.join(OUT, 'bilder'), { recursive: true });

// ── Bericht ───────────────────────────────────────────────────────────────────
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function bericht() {
  const r = JSON.parse(fs.readFileSync(path.join(OUT, 'ergebnis.json'), 'utf8'));
  const bew = BEW && fs.existsSync(BEW) ? JSON.parse(fs.readFileSync(BEW, 'utf8')) : {};
  const ch = r.ansichten.filter((a) => a.geaendert);
  const rank = (a) => { const u = (bew[a.id] || {}).urteil; return u === 'verdächtig' ? 0 : u === 'gewollt' ? 2 : 1; };
  ch.sort((a, b) => rank(a) - rank(b) || b.anteil - a.anteil);
  const zeile = (a) => {
    const b = bew[a.id] || {};
    const cls = b.urteil === 'verdächtig' ? 'sus' : b.urteil === 'gewollt' ? 'ok' : 'open';
    return `<section class="item ${cls}" id="${esc(a.id)}">
  <header><span class="tag ${cls}">${esc(b.urteil || 'unbewertet')}</span>
  <h3>${esc(a.titel)}</h3><span class="meta">${esc(a.vp)} · ${esc(a.thema)} · ${(a.anteil * 100).toFixed(2)} % der Fläche (${a.pixel} px)${a.hinweis ? ' · ' + esc(a.hinweis) : ''}</span></header>
  ${b.grund ? `<p class="grund">${esc(b.grund)}</p>` : ''}
  <div class="trio"><figure><figcaption>vorher (alt)</figcaption><a href="${a.alt}"><img loading="lazy" src="${a.alt}"></a></figure>
  <figure><figcaption>nachher (neu)</figcaption><a href="${a.neu}"><img loading="lazy" src="${a.neu}"></a></figure>
  <figure><figcaption>Diff</figcaption><a href="${a.diff}"><img loading="lazy" src="${a.diff}"></a></figure></div></section>`;
  };
  const n = (u) => ch.filter((a) => (bew[a.id] || {}).urteil === u).length;
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bildvergleich</title><style>
:root{--bg:#f6f3ee;--fg:#2b2622;--mut:#7a7068;--card:#fff;--line:#e4ddd3;--sus:#c0392b;--ok:#2e7d4f;--open:#b7791f}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a17;--fg:#ece6de;--mut:#a39a90;--card:#27231f;--line:#3a342e}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,system-ui,sans-serif}
main{max-width:1700px;margin:0 auto;padding:16px}
h1{font-size:22px;margin:8px 0}.sum{color:var(--mut)}
.item{background:var(--card);border:1px solid var(--line);border-left:5px solid var(--open);border-radius:10px;margin:14px 0;padding:12px}
.item.sus{border-left-color:var(--sus)}.item.ok{border-left-color:var(--ok)}
.item header{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}.item h3{margin:0;font-size:15px}
.meta{color:var(--mut);font-size:12px}.grund{margin:6px 0 4px}
.tag{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;color:#fff;background:var(--open)}.tag.sus{background:var(--sus)}.tag.ok{background:var(--ok)}
.trio{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}
figure{margin:0}figcaption{font-size:11px;color:var(--mut)}img{width:100%;height:auto;border:1px solid var(--line);border-radius:4px;display:block}
@media (max-width:700px){.trio{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Bildvergleich ${esc(r.altName)} → ${esc(r.neuName)}</h1>
<p class="sum">${r.ansichten.length} Ansichten verglichen, ${ch.length} verändert${Object.keys(bew).length ? ` (${n('verdächtig')} verdächtig, ${n('gewollt')} gewollt, ${ch.length - n('verdächtig') - n('gewollt')} unbewertet)` : ''} · Laufzeit ${Math.round(r.sekunden / 60)} min ${r.sekunden % 60} s · Schwelle: Pixel mit Farbabstand &gt; ${r.schwelle.farbe}, Ansicht verändert ab ${r.schwelle.pixel} Pixeln · ${esc(r.zeit)}</p>
${r.fehler.length ? `<details><summary>${r.fehler.length} Ansichten nicht fotografiert</summary><ul>${r.fehler.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></details>` : ''}
${ch.map(zeile).join('\n')}
</main></body></html>`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
  console.log('Bericht: ' + path.join(OUT, 'index.html') + ` (${ch.length} veränderte Ansichten)`);
}
if (flag('nur-bericht')) { bericht(); process.exit(0); }

// ── Aufbau ────────────────────────────────────────────────────────────────────
const SIDES = {
  alt: { url: arg('alt'), dir: path.resolve(arg('alt-dir', '.')) },
  neu: { url: arg('neu', process.env.CASORA_URL || 'http://localhost:8124'), dir: path.resolve(arg('neu-dir', path.join(HERE, '../..'))) },
};
if (!SIDES.alt.url) { console.error('--alt <url> fehlt'); process.exit(2); }
const JOBS = Number(arg('jobs', 8));
const THEME = arg('theme', 'Casora');
const MAXPOP = Number(arg('popups', 16));
const VPS = arg('vp', 'desktop,tablet,handy').split(',');
const FARBE = 40;           // Kanal-Abstand, ab dem ein Pixel als verändert gilt (Kantenglättung bleibt darunter)
const MINPIX = 120;         // so viele veränderte Pixel braucht eine Ansicht (bei Pixeldichte 1)
const T0 = Date.now();
// Feste Uhrzeit für beide Seiten: volle Stunde in zwei Stunden (relative Zeiten lauten überall gleich).
const FIXED = new Date(Math.ceil(Date.now() / 3600e3) * 3600e3 + 3600e3);

function findPlaywright() {
  if (process.env.PLAYWRIGHT_PATH) return process.env.PLAYWRIGHT_PATH;
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(f)) return f;
  }
  return 'playwright';
}
const { chromium } = await import(findPlaywright());

for (const [k, s] of Object.entries(SIDES)) {
  s.tok = JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'token.mjs')], { env: { ...process.env, CASORA_URL: s.url } }).toString());
  s.version = JSON.parse(fs.readFileSync(path.join(s.dir, 'custom_components/casora/manifest.json'), 'utf8')).version;
  s.name = k + ' ' + s.version;
}

async function wsc(side) {
  const sock = new WebSocket(side.url.replace(/^http/, 'ws') + '/api/websocket');
  let id = 0; const wait = new Map();
  await new Promise((res, rej) => {
    sock.onerror = rej;
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') sock.send(JSON.stringify({ type: 'auth', access_token: side.tok.access_token }));
      else if (m.type === 'auth_ok') res();
      else if (m.type === 'auth_invalid') rej(new Error('auth_invalid'));
      else if (m.type === 'result' && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); m.success ? w.res(m.result) : w.rej(new Error(JSON.stringify(m.error))); }
    };
  });
  return { cmd: (msg) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); sock.send(JSON.stringify({ ...msg, id: i })); }), close: () => sock.close() };
}

// ── Plan (aus der neuen Seite) ────────────────────────────────────────────────
const c = await wsc(SIDES.neu);
const dashList = await c.cmd({ type: 'lovelace/dashboards/list' });
let desk = arg('dash', '') ? arg('dash').split(',') : [];
const cfgs = {};
for (const d of dashList.filter((x) => x.mode === 'storage')) {
  if (desk.length && !desk.includes(d.url_path) && !desk.includes(d.url_path.replace(/-mobile$/, ''))) continue;
  if (!desk.length && (/^dashboard-hemma|importiert|^map$/.test(d.url_path))) continue;
  try { cfgs[d.url_path] = await c.cmd({ type: 'lovelace/config', url_path: d.url_path }); } catch (e) { continue; }
  if (!/casora_room|casora_mobile/.test(JSON.stringify(cfgs[d.url_path]))) delete cfgs[d.url_path];
}
const expOpts = await c.cmd({ type: 'get_states' }).then((s) => ((s.find((x) => x.entity_id === 'input_select.casora_expanded_row') || {}).attributes || {}).options || []);
c.close();
if (!desk.length) desk = Object.keys(cfgs).filter((u) => !/-mobile$/.test(u));
const firstDash = desk[0];

const THEMES = [['hell', false], ['dunkel', true]];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, scale: 1, mobile: false, touch: false },
  tablet: { width: 1180, height: 820, scale: 1, mobile: false, touch: true },
  handy: { width: 390, height: 844, scale: 2, mobile: true, touch: true },
};
// Handy-Räume: Schlüssel aus der Raumliste des Handy-Layouts ({ key: 'room_…', name }) –
// so wie die Räume-Leiste sie setzt (Umlaute fallen dort weg: „Küche“ → room_kche).
const mobileRooms = (cfg) => {
  const out = new Map();
  (function walk(o) {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== 'object') return;
    if (typeof o.key === 'string' && /^room_/.test(o.key) && typeof o.name === 'string') out.set(o.key, o.name);
    Object.values(o).forEach(walk);
  })(cfg);
  return [...out.entries()].map(([key, name]) => ({ key, name }));
};
const views = []; // { titel, vp, url, filter?, popups?, expand?, studio? }
for (const vp of VPS) {
  for (const d of desk) {
    if (vp === 'handy') {
      const m = d + '-mobile';
      if (!cfgs[m]) continue;
      // Handy-Räume: Filter „room_<slug(Raumname)>“ wie die Raumköpfe des Handy-Layouts (ä→ae …)
      const rooms = mobileRooms(cfgs[m]);
      views.push({ vp, url: '/' + m + '/' + (cfgs[m].views[0].path || '0'), filter: 'all', titel: `${m} Startseite`, popups: d === firstDash, expand: true });
      for (const r of rooms) views.push({ vp, url: '/' + m + '/' + (cfgs[m].views[0].path || '0'), filter: r.key, titel: `${m} Raum ${r.name}`, popups: d === firstDash });
    } else {
      cfgs[d].views.forEach((v, i) => {
        const p = v.path || String(i);
        views.push({ vp, url: '/' + d + '/' + p, titel: `${d}/${p}`, popups: d === firstDash, expand: d === firstDash && i === 0 });
      });
    }
  }
  if (firstDash) views.push({ vp, studio: firstDash, url: '/casora-studio', titel: `Studio (${firstDash})` });
}
const tasks = [];
for (const v of views) for (const [thema, dark] of THEMES) tasks.push({ ...v, thema, dark });
// lange Aufgaben (mit Popups/Studio) zuerst
tasks.sort((a, b) => (b.expand ? 2 : b.popups || b.studio ? 1 : 0) - (a.expand ? 2 : a.popups || a.studio ? 1 : 0));
console.log(`Plan: ${tasks.length} Seiten (${desk.join(', ')}; ${VPS.join('/')}; hell+dunkel), ${JOBS} parallel, Uhrzeit fest ${FIXED.toISOString()}`);

// ── Browser-Teil ──────────────────────────────────────────────────────────────
const PIERCE = `
  window.__pierce = function (sel, root) {
    const out = [];
    (function walk(r) { if (!r) return; r.querySelectorAll(sel).forEach((e) => out.push(e));
      r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); }); })(root || document);
    return out;
  };
  window.__panel = function () { return window.__pierce('casora-panel')[0] || null; };`;

// Schreibsperre: jeder schreibende Aufruf (Dienste, …/save, set_user_data …) wird nur protokolliert.
const BLOCK = `(() => {
  const W = /(^|_)(call|execute|fire|save|create|update|delete|remove|set|write|install|restart|restore|apply|move|import|reset|clear|rename|upload|add|start|stop|reload|trigger|generate|confirm|approve|toggle|run|migrate|dismiss|ignore|skip|enable|disable|purge|assign|link|unlink|pair|remember|forget|send|publish|revert)(_|$)/;
  const bad = (m) => m && typeof m === 'object' && (m.type === 'call_service' || (!/^(render_template|subscribe_trigger|unsubscribe_events|auth\\/sign_path)$/.test(String(m.type)) && W.test(String(m.type || '').split('/').pop())));
  const t = setInterval(() => {
    const ha = document.querySelector('home-assistant'); const conn = ha && ha.hass && ha.hass.connection;
    if (!conn || conn.__bv) return; conn.__bv = true;
    const smp = conn.sendMessagePromise.bind(conn), sm = conn.sendMessage.bind(conn);
    conn.sendMessagePromise = (m) => bad(m) ? Promise.resolve(m.type === 'call_service' ? { context: { id: 'bv' } } : null) : smp(m);
    conn.sendMessage = (m, id) => bad(m) ? undefined : sm(m, id);
  }, 30);
  setTimeout(() => clearInterval(t), 120000);
  const of = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method !== 'GET' && /\\/api\\//.test(url) && !/\\/auth\\//.test(url)) return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return of.apply(this, arguments);
  };
  const sw = navigator.serviceWorker;
  if (sw) { const p = Object.getPrototypeOf(sw); const o = p.register;
    p.register = async function () { try { const r = await o.apply(this, arguments); if (r) return r; } catch (e) {} return Object.assign(new EventTarget(), { update: async () => {}, unregister: async () => true }); }; }
})();`;

async function newPage(browser, side, t) {
  const vp = VIEWPORTS[t.vp];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale, colorScheme: t.dark ? 'dark' : 'light',
    isMobile: vp.mobile, hasTouch: vp.touch, locale: 'de-DE', timezoneId: 'Europe/Berlin', reducedMotion: 'reduce', serviceWorkers: 'block',
    userAgent: vp.mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' : undefined,
  });
  await ctx.clock.setFixedTime(FIXED);
  await ctx.addInitScript(([tk, base, version, theme, dark, filter]) => {
    localStorage.setItem('hassTokens', JSON.stringify({ access_token: tk.access_token, token_type: 'Bearer', expires_in: tk.expires_in,
      refresh_token: tk.refresh_token, hassUrl: base, clientId: base + '/', expires: Date.now() + tk.expires_in * 1000 }));
    localStorage.setItem('selectedTheme', JSON.stringify({ theme, dark }));
    localStorage.setItem('casora.seenVersion', version);
    localStorage.setItem('casora.umzug.off', '1');
    localStorage.setItem('casora_mobile_filter', filter || 'all');
  }, [side.tok, side.url, side.version, THEME, t.dark, t.filter]);
  await ctx.addInitScript(BLOCK);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  return { ctx, page, errors };
}

async function settle(page) {
  // Bilder fertig, Schriften geladen, dann kurz Ruhe.
  await page.evaluate(async () => {
    try { await document.fonts.ready; } catch (e) {}
    const imgs = window.__pierce('img').filter((i) => !i.complete);
    await Promise.race([Promise.all(imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r; }))), new Promise((r) => setTimeout(r, 4000))]);
  }).catch(() => {});
  await page.waitForTimeout(900);
}

async function openView(p, side, t) {
  await p.page.goto(side.url + t.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.page.addScriptTag({ content: PIERCE });
  if (t.studio) {
    await p.page.waitForFunction(() => { const x = window.__panel && window.__panel(); return !!(x && x._hass && (x._state || x._flowMode)); }, null, { timeout: 60000 });
    await p.page.evaluate(async (d) => { const x = window.__panel(); x._setDash(d); x._remember(d); await x._load(); }, t.studio);
    await p.page.waitForFunction(() => { const x = window.__panel(); return !x._flowMode && x._state && x._state.compact && x._state.compact.rooms; }, null, { timeout: 30000 });
    await p.page.waitForTimeout(2000);
  } else {
    await p.page.waitForFunction(() => window.__pierce('button-card').length >= 3, null, { timeout: 60000 });
    // Handy-Raum: Filter wie ein Tipp auf den Raumkopf setzen (der gespeicherte Wert allein reicht
    // nicht – das Handy-Layout startet auf „Alle“).
    if (t.filter && t.filter !== 'all') {
      await p.page.waitForFunction(() => !!window._casoraFilter, null, { timeout: 30000 });
      await p.page.evaluate((f) => window._casoraFilter.set(f), t.filter);
      await p.page.waitForTimeout(1500);
    }
    // warten, bis die Zahl der Karten 1,5 s stabil ist
    let last = -1;
    for (let i = 0; i < 12; i++) {
      const n = await p.page.evaluate(() => window.__pierce('button-card').length);
      if (n === last) break;
      last = n; await p.page.waitForTimeout(1500);
    }
    // Spät nachladende Teile (Szenen-Badge, Glocken-Einträge aus den lokalen Modulen) abwarten
    await p.page.waitForTimeout(3000);
  }
  await settle(p.page);
}

// Größter innerer Scroll-Bereich (Casora-Räume scrollen in der Raum-Karte, nicht im Dokument).
async function scroller(page) {
  return page.evaluate(() => {
    const se = document.scrollingElement;
    let best = se.scrollHeight > innerHeight + 40 ? se : null, area = best ? innerWidth * innerHeight : 0;
    for (const e of window.__pierce('*')) {
      if (e.scrollHeight <= e.clientHeight + 40 || e.clientHeight < innerHeight * 0.4) continue;
      const oy = getComputedStyle(e).overflowY; if (!/auto|scroll/.test(oy)) continue;
      const a = e.clientWidth * e.clientHeight; if (a > area) { area = a; best = e; }
    }
    window.__bvScroll = best;
    if (best) return { sh: best.scrollHeight, ch: best === se ? innerHeight : best.clientHeight };
    // Kein Scroll-Bereich, aber Inhalt ragt unten hinaus (Handy-Layout schneidet ab): Höhe melden.
    let tall = 0;
    for (const e of window.__pierce('*')) if (e.scrollHeight > tall && e.clientHeight >= innerHeight * 0.8) tall = e.scrollHeight;
    return tall > innerHeight + 40 ? { tall } : null;
  });
}
// Ansicht in den Grundzustand: Popups zu, gleiche Seite, Handy-Filter wie geplant, oben.
async function reset(p, side, t) {
  await closePopups(p.page);
  if (!p.page.url().endsWith(t.url)) await openView(p, side, t);
  await p.page.evaluate((f) => {
    try { if (window._casoraFilter && f) window._casoraFilter.set(f); } catch (e) {}
    if (window.__bvScroll) window.__bvScroll.scrollTop = 0; window.scrollTo(0, 0);
  }, t.filter || (t.vp === 'handy' ? 'all' : null)).catch(() => {});
  await p.page.waitForTimeout(500);
}
async function scrollTo(page, y) { await page.evaluate((y) => { const e = window.__bvScroll; if (e) e.scrollTop = y; }, y); }

async function shoot(page, file) {
  await page.screenshot({ path: file, animations: 'disabled', caret: 'hide', timeout: 30000 });
}

async function closePopups(page) {
  await page.evaluate(() => {
    try { window.casoraPopup && window.casoraPopup.close(); } catch (e) {}
    window.__pierce('ha-more-info-dialog, ha-dialog[open]').forEach((d) => { try { d.closeDialog ? d.closeDialog() : d.close && d.close(); } catch (e) {} });
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(700);
}

// Popup-Kandidaten: Karten mit Casora-Popup (je Vorlage einmal) + Glocke + Einstellungen.
async function popupTargets(page) {
  return page.evaluate(() => {
    const out = [], seen = new Set();
    window.__pierce('button-card').forEach((b) => {
      const c = b._config || {}; const r = b.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const tpl = [].concat(c.template || []).join(',');
      const ta = c.tap_action || {};
      const special = /casora_notifications_button|casora_settings_button/.test(tpl);
      if (!special && !(ta.casora_popup && String(ta.action) !== 'call-service')) return;
      const key = tpl + '|' + (c.entity || '');
      const dedupe = tpl || key;
      if (seen.has(dedupe)) return;
      // nur, was man wirklich antippen kann (nicht in zugeklappter Reihe, nicht verdeckt)
      b.scrollIntoView({ block: 'center' });
      const q = b.getBoundingClientRect(); const x = q.x + Math.min(q.width / 2, 40), y = q.y + q.height / 2;
      let el = document.elementFromPoint(x, y);
      while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; }
      let hit = false;
      for (let n = el; n; n = n.parentNode || n.host) { if (n === b) { hit = true; break; } }
      if (!hit) return;
      seen.add(dedupe);
      out.push({ key, dedupe, label: (special ? (/notif/.test(tpl) ? 'Glocke' : 'Einstellungen') : (tpl.split(',').pop() || 'Kachel')) + (c.entity ? ' ' + c.entity.split('.')[0] : '') });
    });
    return out;
  });
}
async function clickTarget(page, key) {
  const pos = await page.evaluate((key) => {
    const b = window.__pierce('button-card').find((b) => { const c = b._config || {}; const r = b.getBoundingClientRect();
      return r.width && ([].concat(c.template || []).join(',') + '|' + (c.entity || '')) === key; });
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    window._casoraLastTile = { el: b, at: Date.now() };
    return { x: r.x + Math.min(r.width / 2, 40), y: r.y + r.height / 2 };
  }, key);
  if (!pos) return false;
  await page.mouse.click(pos.x, pos.y);
  await page.waitForTimeout(1500);
  await settle(page);
  return true;
}
async function fakeExpanded(page, v) {
  return page.evaluate((v) => {
    const ha = document.querySelector('home-assistant'); const id = 'input_select.casora_expanded_row';
    const s = ha && ha.hass && ha.hass.states[id]; if (!s) return false;
    const states = { ...ha.hass.states, [id]: { ...s, state: v } };
    if (typeof ha._updateHass === 'function') ha._updateHass({ states }); else return false;
    return true;
  }, v).then(async (ok) => { await page.waitForTimeout(1300); await settle(page); return ok; });
}
async function studioItems(page) {
  return page.evaluate(() => {
    const p = window.__panel(); const root = p && p.shadowRoot; if (!root) return [];
    const els = window.__pierce('.sidelist .siderow, #rooms .tab', root);
    const seen = new Set(), out = [];
    let rooms = 0;
    for (const e of els) {
      const k = (e.dataset && e.dataset.k) || '';
      if (k.startsWith('dash-')) continue;
      const label = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!label || seen.has(label)) continue;
      if (k.startsWith('room-') || e.matches('#rooms .tab')) { if (rooms >= 2) continue; rooms++; }
      seen.add(label); out.push({ label, k });
    }
    return out;
  });
}
async function clickStudio(page, item) {
  const ok = await page.evaluate((it) => {
    const root = window.__panel().shadowRoot;
    const e = window.__pierce('.sidelist .siderow, #rooms .tab', root).find((e) => ((e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)) === it.label);
    if (!e) return false; e.scrollIntoView({ block: 'center' }); e.click(); return true;
  }, item);
  await page.waitForTimeout(1600);
  await settle(page);
  return ok;
}

// Pixelvergleich im Browser: Anzahl veränderter Pixel, Umriss, Diff-Bild (nachher blass, Änderungen rot).
async function diff(dpage, fa, fb, fd) {
  const a = fs.readFileSync(fa).toString('base64'), b = fs.readFileSync(fb).toString('base64');
  const r = await dpage.evaluate(async ([a, b, F]) => {
    const load = async (s) => createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob());
    const A = await load(a), B = await load(b);
    const w = Math.max(A.width, B.width), h = Math.max(A.height, B.height);
    const get = (I) => { const c = new OffscreenCanvas(w, h); const x = c.getContext('2d'); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, w, h); x.drawImage(I, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const da = get(A), db = get(B);
    const oc = new OffscreenCanvas(w, h); const ox = oc.getContext('2d'); const out = ox.createImageData(w, h); const o = out.data;
    let n = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let i = 0, p = 0; i < da.length; i += 4, p++) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d > F) {
        n++; o[i] = 230; o[i + 1] = 20; o[i + 2] = 40; o[i + 3] = 255;
        const x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      } else {
        const g = (db[i] * 0.3 + db[i + 1] * 0.59 + db[i + 2] * 0.11) * 0.35 + 165; o[i] = o[i + 1] = o[i + 2] = g; o[i + 3] = 255;
      }
    }
    if (!n) return { n, w, h };
    ox.putImageData(out, 0, 0);
    if (n) { ox.strokeStyle = 'rgba(230,20,40,0.9)'; ox.lineWidth = Math.max(2, w / 400); ox.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8); }
    const blob = await oc.convertToBlob({ type: 'image/png' });
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return { n, w, h, box: [x0, y0, x1, y1], png: btoa(s), sameSize: A.width === B.width && A.height === B.height };
  }, [a, b, FARBE]);
  if (r.png) fs.writeFileSync(fd, Buffer.from(r.png, 'base64'));
  return r;
}

const results = [], fehler = [];
const POPSEEN = new Set();
const POPCOUNT = (t) => [...POPSEEN].filter((k) => k.startsWith(t.vp + '|' + t.thema + '|')).length;
const slug = (s) => s.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').slice(0, 90);

async function runTask(browser, dpage, t) {
  const base = slug(`${t.vp}-${t.thema}-${t.titel}`);
  const P = {};
  try {
    [P.alt, P.neu] = await Promise.all([newPage(browser, SIDES.alt, t), newPage(browser, SIDES.neu, t)]);
    await Promise.all([openView(P.alt, SIDES.alt, t), openView(P.neu, SIDES.neu, t)]);
    const vp = VIEWPORTS[t.vp];
    const step = async (name, act) => {
      const id = slug(base + (name ? '-' + name : ''));
      const hints = [];
      if (act) {
        const [ra, rn] = await Promise.all([act(P.alt.page, 'alt'), act(P.neu.page, 'neu')]);
        if (ra === false) hints.push('fehlt vorher');
        if (rn === false) hints.push('fehlt nachher');
        if (ra === false && rn === false) return;
      }
      const f = (s) => path.join(OUT, 'bilder', `${id}-${s}.png`);
      await Promise.all([shoot(P.alt.page, f('alt')), shoot(P.neu.page, f('neu'))]);
      const d = await diff(dpage, f('alt'), f('neu'), f('diff'));
      const min = MINPIX * vp.scale * vp.scale;
      const ch = d.n > min;
      if (!ch) { fs.rmSync(f('alt'), { force: true }); fs.rmSync(f('neu'), { force: true }); fs.rmSync(f('diff'), { force: true }); }
      results.push({ id, titel: t.titel + (name ? ' · ' + name.replace(/_/g, ' ') : ''), vp: t.vp, thema: t.thema, url: t.url, filter: t.filter,
        geaendert: ch, pixel: d.n, anteil: d.n / (d.w * d.h), box: d.box, hinweis: hints.join(', '),
        alt: `bilder/${id}-alt.png`, neu: `bilder/${id}-neu.png`, diff: `bilder/${id}-diff.png` });
      if (ch) console.log(`  ≠ ${id} (${d.n} px)`);
    };
    await step('');
    if (!t.studio) {
      // zweite Bildschirmseite, wenn die Ansicht scrollt (gleiche Höhe auf beiden Seiten nehmen)
      const [sa, sn] = await Promise.all([scroller(P.alt.page), scroller(P.neu.page)]);
      const s = (sn && sn.sh ? sn : null) || (sa && sa.sh ? sa : null);
      const tall = Math.max((sn && sn.tall) || 0, (sa && sa.tall) || 0);
      if (!s && tall) {
        // ganzer Inhalt in einem höheren Fenster (höchstens dreifach)
        const h = Math.min(tall + 60, vp.height * 3);
        await step('ganz', async (pg) => { await pg.setViewportSize({ width: vp.width, height: h }); await pg.waitForTimeout(1200); await settle(pg); });
        await Promise.all([P.alt.page.setViewportSize({ width: vp.width, height: vp.height }), P.neu.page.setViewportSize({ width: vp.width, height: vp.height })]);
        await P.neu.page.waitForTimeout(800);
      }
      if (s) {
        const pages = Math.min(t.vp === 'handy' ? 3 : 2, Math.ceil(s.sh / s.ch));
        for (let i = 1; i < pages; i++) await step('seite' + (i + 1), async (pg) => { await scrollTo(pg, i * s.ch * 0.9); await pg.waitForTimeout(600); await settle(pg); });
        if (pages > 1) await Promise.all([scrollTo(P.alt.page, 0), scrollTo(P.neu.page, 0)]);
      }
      if (t.expand && t.vp !== 'handy') {
        for (const e of expOpts.filter((x) => x !== 'none')) await step('aufgeklappt_' + e, (pg) => fakeExpanded(pg, e));
        await Promise.all([fakeExpanded(P.alt.page, 'none'), fakeExpanded(P.neu.page, 'none')]);
      }
      if (t.popups) {
        // jede Popup-Art je Viewport/Thema nur einmal (Glocke, Wetter … stehen in jedem Raum)
        const targets = (await popupTargets(P.neu.page)).filter((g) => {
          const k = t.vp + '|' + t.thema + '|' + g.dedupe;
          if (POPSEEN.has(k) || POPCOUNT(t) >= MAXPOP) return false;
          POPSEEN.add(k); return true;
        });
        await Promise.all([reset(P.alt, SIDES.alt, t), reset(P.neu, SIDES.neu, t)]);
        for (const g of targets) {
          await step('popup_' + g.label, async (pg) => { const ok = await clickTarget(pg, g.key); return ok; });
          await Promise.all([reset(P.alt, SIDES.alt, t), reset(P.neu, SIDES.neu, t)]);
        }
      }
    } else if (t.vp !== 'handy') {
      const items = await studioItems(P.neu.page);
      for (const it of items) await step('studio_' + it.label, (pg) => clickStudio(pg, it));
    }
  } catch (e) {
    fehler.push(`${base}: ${String(e && e.message || e).split('\n')[0]}`);
    console.log(`  ✗ ${base}: ${String(e && e.message || e).split('\n')[0]}`);
  } finally {
    for (const k of ['alt', 'neu']) if (P[k]) await P[k].ctx.close().catch(() => {});
  }
}

const queue = tasks.slice();
let done = 0;
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
  const browser = await chromium.launch({ args: ['--hide-scrollbars', '--font-render-hinting=none'] });
  const dctx = await browser.newContext(); const dpage = await dctx.newPage();
  while (queue.length) {
    const t = queue.shift();
    await runTask(browser, dpage, t);
    done++;
    if (done % 10 === 0) console.log(`${done}/${tasks.length} Seiten · ${Math.round((Date.now() - T0) / 1000)} s`);
  }
  await browser.close();
}));

const sek = Math.round((Date.now() - T0) / 1000);
fs.writeFileSync(path.join(OUT, 'ergebnis.json'), JSON.stringify({ altName: SIDES.alt.name, neuName: SIDES.neu.name, zeit: new Date().toISOString(),
  sekunden: sek, schwelle: { farbe: FARBE, pixel: MINPIX }, fehler, ansichten: results }, null, 1));
console.log(`Fertig nach ${sek} s: ${results.length} Ansichten, ${results.filter((r) => r.geaendert).length} verändert, ${fehler.length} Fehler`);
bericht();
