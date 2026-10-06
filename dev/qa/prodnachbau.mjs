// Prod-Nachbau: echte Dashboards eines Nutzers (private Kopie, NIE im Repo) in ein Wegwerf-Test-HA
// einspielen und mit dem aktuellen Checkout so prüfen, wie der Nutzer sie sieht.
//
//   CASORA_PRODKOPIE=/privater/ordner CASORA_URL=http://localhost:8197 node dev/qa/prodnachbau.mjs --out /pfad/bericht
//
// Der Ordner enthält Dateien wie in HAs .storage: lovelace_dashboards, lovelace.<id> (je Dashboard),
// optional lovelace_resources und casora_entry.json. Ohne CASORA_PRODKOPIE: übersprungen (Rückgabe 0).
// Echte Entitäts-IDs stehen nur in der Kopie und im Bericht (außerhalb des Repos), nie hier im Code.
//
// Ablauf:
//   1. Dashboards 1:1 anlegen (gleiche URL, Titel, Symbol) und Konfiguration speichern,
//      Casora-Optionen vergleichen, HA neu starten (wie nach einem Update: Casora frischt Vorlagen auf).
//   2. Desktop (1440×900) jede Ansicht, Handy (390×844) Startseite + jeder Raum: Fehlerkarten,
//      Konsolenfehler, „undefined/NaN“ im Text, Bildschirmfotos.
//   3. Badge-Reihe je Raum: Sicherheit bei Kontakt/Schloss/Kamera, Energie bei Leistungssensor,
//      Klima, Licht, Medien wie konfiguriert; Reihenfolge Sicherheit, Klima, Licht, Personen, Energie, Szenen, Medien.
//   4. Glocke öffnen (Einträge, Punkt), Wäsche-Kacheln und -Popups.
//   5. Studio öffnen und ohne Änderung schließen: darf nichts als ungespeichert markieren.
//   6. Studio einmal speichern: Kacheln je Raum und eigene Karten vorher/nachher gleich.
//
// Schalter: --out <ordner> (Standard /tmp/casora-prodnachbau), --kein-neustart, --kein-speichern
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DIR = process.env.CASORA_PRODKOPIE;
if (!DIR) { console.log('prodnachbau: CASORA_PRODKOPIE nicht gesetzt – übersprungen'); process.exit(0); }
const HERE = path.dirname(new URL(import.meta.url).pathname);
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const BASE = process.env.CASORA_URL || 'http://localhost:8124';
if (/:8124\b/.test(BASE) && !flag('auch-8124')) { console.error('prodnachbau: nie gegen casora-test (:8124) – CASORA_URL auf ein Wegwerf-HA setzen'); process.exit(2); }
const OUT = path.resolve(arg('out', '/tmp/casora-prodnachbau'));
fs.mkdirSync(path.join(OUT, 'bilder'), { recursive: true });
const T0 = Date.now();
const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const befunde = []; // { schwere: fehler|warnung|info, art, wo, text, bild? }
const add = (schwere, art, wo, text, bild) => { befunde.push({ schwere, art, wo, text, bild }); console.log(`  [${schwere}] ${art} · ${wo}: ${text}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function token() { return JSON.parse(execFileSync(process.execPath, [path.join(HERE, 'token.mjs')], { env: { ...process.env, CASORA_URL: BASE } }).toString()); }
let TOK = token();
async function wsc() {
  const sock = new WebSocket(BASE.replace(/^http/, 'ws') + '/api/websocket');
  let id = 0; const wait = new Map();
  await new Promise((res, rej) => {
    sock.onerror = rej;
    sock.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === 'auth_required') sock.send(JSON.stringify({ type: 'auth', access_token: TOK.access_token }));
      else if (m.type === 'auth_ok') res();
      else if (m.type === 'auth_invalid') rej(new Error('auth_invalid'));
      else if (m.type === 'result' && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); m.success ? w.res(m.result) : w.rej(new Error(JSON.stringify(m.error))); }
    };
  });
  return { cmd: (msg) => new Promise((res, rej) => { const i = ++id; wait.set(i, { res, rej }); sock.send(JSON.stringify({ ...msg, id: i })); }), close: () => sock.close() };
}

// ── 1. Einspielen ─────────────────────────────────────────────────────────────
const dashMeta = read('lovelace_dashboards').data.items.filter((d) => fs.existsSync(path.join(DIR, 'lovelace.' + d.id)));
if (!dashMeta.length) { console.error('prodnachbau: keine lovelace.<id>-Dateien in ' + DIR); process.exit(2); }
let c = await wsc();
const have = await c.cmd({ type: 'lovelace/dashboards/list' });
for (const d of dashMeta) {
  const old = have.find((x) => x.url_path === d.url_path);
  if (old) await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: old.id });
  await c.cmd({ type: 'lovelace/dashboards/create', url_path: d.url_path, title: d.title, icon: d.icon, show_in_sidebar: d.show_in_sidebar !== false, require_admin: !!d.require_admin, mode: 'storage' });
  await c.cmd({ type: 'lovelace/config/save', url_path: d.url_path, config: read('lovelace.' + d.id).data.config });
  console.log(`eingespielt: /${d.url_path} (${read('lovelace.' + d.id).data.config.views.length} Ansichten)`);
}
// Casora-Optionen wie im Original?
try {
  const want = fs.existsSync(path.join(DIR, 'casora_entry.json')) ? read('casora_entry.json') : null;
  const entries = await c.cmd({ type: 'config_entries/get', domain: 'casora' });
  const w = want ? [].concat(want).find((e) => e.domain === 'casora') : null;
  if (!entries.length) add('fehler', 'einrichtung', 'Casora', 'kein Casora-Eintrag im Test-HA');
  else if (w) {
    const opts = await fetch(BASE + '/api/config/config_entries/entry/' + entries[0].entry_id, { headers: { Authorization: 'Bearer ' + TOK.access_token } }).then((r) => r.ok ? r.json() : null).catch(() => null);
    const same = JSON.stringify(w.options || {}) === JSON.stringify((opts && opts.options) || {});
    add(same || !Object.keys(w.options || {}).length ? 'info' : 'warnung', 'einrichtung', 'Casora-Optionen',
      Object.keys(w.options || {}).length ? (same ? 'wie im Original' : 'weichen ab (Original: ' + Object.keys(w.options).join(', ') + ')') : 'Original hat keine Optionen (Standard) – Test-HA ebenso');
  }
} catch (e) { add('info', 'einrichtung', 'Casora-Optionen', 'nicht prüfbar: ' + e.message); }
// Ressourcen, die im Original stehen, im Test-HA aber fehlen (Fremdkarten) – deren Karten zeigen hier Fehler.
const fremd = [];
try {
  const res = fs.existsSync(path.join(DIR, 'lovelace_resources')) ? read('lovelace_resources').data.items : [];
  const here = await c.cmd({ type: 'lovelace/resources' });
  const base = (u) => u.split('?')[0].split('/').pop();
  for (const r of res) if (!here.some((h) => base(h.url) === base(r.url))) fremd.push(base(r.url).replace(/\.js$/, ''));
  if (fremd.length) add('info', 'einrichtung', 'Ressourcen', 'im Test-HA nicht vorhanden (Fehlerkarten dieser Karten zählen nicht): ' + fremd.join(', '));
} catch (e) { /* egal */ }
c.close();

// Neustart wie nach einem Update – Casora frischt Vorlagen der Dashboards auf.
if (!flag('kein-neustart')) {
  console.log('Neustart …');
  await fetch(BASE + '/api/services/homeassistant/restart', { method: 'POST', headers: { Authorization: 'Bearer ' + TOK.access_token, 'Content-Type': 'application/json' }, body: '{}' }).catch(() => {});
  await sleep(8000);
  execFileSync(process.execPath, [path.join(HERE, 'bereit.mjs'), '--max', '180'], { env: { ...process.env, CASORA_URL: BASE }, stdio: 'inherit' });
  TOK = token();
}
c = await wsc();
const cfgVorher = {};
for (const d of dashMeta) cfgVorher[d.url_path] = await c.cmd({ type: 'lovelace/config', url_path: d.url_path });
const states = Object.fromEntries((await c.cmd({ type: 'get_states' })).map((s) => [s.entity_id, s]));
c.close();
// Hat Casora die Vorlagen aufgefrischt (wie nach einem echten Update)? Die Auffrischung läuft je
// Dashboard-URL nur einmal je Vorlagen-Bundle (.storage/casora.template_refresh) – wurde dieselbe URL
// in diesem Test-HA schon einmal eingespielt, bleibt der alte Vorlagenstand des Originals stehen und
// alle Befunde zeigen die alte Version. Dann: frisches Wegwerf-HA nehmen.
try {
  const repo = JSON.parse(fs.readFileSync(path.join(HERE, '../../custom_components/casora/panel/casora-templates.json'), 'utf8')).templates;
  for (const d of dashMeta) {
    const have = cfgVorher[d.url_path].button_card_templates || {};
    const alt = Object.keys(repo).filter((k) => have[k] && JSON.stringify(have[k]) !== JSON.stringify(repo[k]));
    const orig = read('lovelace.' + d.id).data.config.button_card_templates || {};
    const unver = alt.filter((k) => JSON.stringify(have[k]) === JSON.stringify(orig[k]));
    if (unver.length > 5) add('warnung', 'vorlagen-alt', '/' + d.url_path, `${unver.length} Casora-Vorlagen noch auf dem Stand des Originals (nicht aufgefrischt – URL schon einmal eingespielt? frisches Wegwerf-HA nehmen): ${unver.slice(0, 8).join(', ')}`);
    else add('info', 'vorlagen-alt', '/' + d.url_path, `Vorlagen aufgefrischt (${alt.length} weichen vom Repo ab, davon ${unver.length} unverändert vom Original – eigene Anpassungen bleiben)`);
  }
} catch (e) { add('info', 'vorlagen-alt', 'Vorlagen', 'nicht prüfbar: ' + e.message); }
const desk = dashMeta.find((d) => !/-mobile$/.test(d.url_path) && dashMeta.some((m) => m.url_path === d.url_path + '-mobile')) || dashMeta.find((d) => !/-mobile$/.test(d.url_path));
const phone = dashMeta.find((d) => d.url_path === desk.url_path + '-mobile');
const deskCfg = cfgVorher[desk.url_path];

// ── Browser ───────────────────────────────────────────────────────────────────
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
const browser = await chromium.launch({ args: ['--hide-scrollbars'] });
const PIERCE = `
  window.__pierce = function (sel, root) {
    const out = [];
    (function walk(r) { if (!r) return; r.querySelectorAll(sel).forEach((e) => out.push(e));
      r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); }); })(root || document);
    return out;
  };
  window.__panel = function () { return window.__pierce('casora-panel')[0] || null; };
  // sichtbar und antippbar? (Treffer an der Mitte führt ins Element)
  window.__hit = function (b) {
    const q = b.getBoundingClientRect(); if (!q.width || !q.height) return false;
    const x = q.x + q.width / 2, y = q.y + q.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    let el = document.elementFromPoint(x, y);
    while (el && el.shadowRoot) { const inner = el.shadowRoot.elementFromPoint(x, y); if (!inner || inner === el) break; el = inner; }
    for (let n = el; n; n = n.parentNode || n.host) if (n === b) return true;
    return false;
  };`;
const VP = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  handy: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' },
};
async function page(vp, { filter, dark = false, theme = 'Casora' } = {}) {
  const ctx = await browser.newContext({ ...VP[vp], colorScheme: dark ? 'dark' : 'light', locale: 'de-DE', timezoneId: 'Europe/Berlin', serviceWorkers: 'block' });
  const version = JSON.parse(fs.readFileSync(path.join(HERE, '../../custom_components/casora/manifest.json'), 'utf8')).version;
  await ctx.addInitScript(([tk, base, version, theme, dark, filter]) => {
    localStorage.setItem('hassTokens', JSON.stringify({ access_token: tk.access_token, token_type: 'Bearer', expires_in: tk.expires_in,
      refresh_token: tk.refresh_token, hassUrl: base, clientId: base + '/', expires: Date.now() + tk.expires_in * 1000 }));
    localStorage.setItem('selectedTheme', JSON.stringify({ theme, dark }));
    localStorage.setItem('casora.seenVersion', version);
    localStorage.setItem('casora.umzug.off', '1');
    if (filter) localStorage.setItem('casora_mobile_filter', filter);
    const sw = navigator.serviceWorker;
    if (sw) { const p = Object.getPrototypeOf(sw); const o = p.register;
      p.register = async function () { try { const r = await o.apply(this, arguments); if (r) return r; } catch (e) {} return Object.assign(new EventTarget(), { update: async () => {}, unregister: async () => true }); }; }
  }, [TOK, BASE, version, theme, dark, filter]);
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('pageerror', (e) => errors.push(String(e.message || e)));
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { ctx, pg, errors };
}
// HA-Frontend registriert auf localhost einen Service Worker; mit serviceWorkers: 'block' wirft es
// „reading 'addEventListener'“ (kein Casora-Fehler, siehe dev/e2e/harness.mjs) – nicht melden.
const konsole = (list) => [...new Set(list)].filter((e) => !/reading 'addEventListener'/.test(e));
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
const slug = (s) => String(s).replace(/[^\w-]+/g, '_').slice(0, 80);
async function shot(pg, name) { const f = `bilder/${slug(name)}.png`; await pg.screenshot({ path: path.join(OUT, f), animations: 'disabled', caret: 'hide' }).catch(() => {}); return f; }
async function openDash(pg, url) {
  await pg.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await pg.addScriptTag({ content: PIERCE });
  await pg.waitForFunction(() => window.__pierce('button-card').length >= 3, null, { timeout: 60000 });
  let last = -1;
  for (let i = 0; i < 12; i++) { const n = await pg.evaluate(() => window.__pierce('button-card').length); if (n === last) break; last = n; await pg.waitForTimeout(1500); }
  await pg.waitForTimeout(1500);
}
// Fehlerkarten, kaputte Texte
async function scan(pg) {
  return pg.evaluate(() => {
    const err = window.__pierce('hui-error-card, hui-warning').filter((e) => e.getBoundingClientRect().width).map((e) => {
      const t = (e.shadowRoot ? e.shadowRoot.textContent : e.textContent) || '';
      const cfg = e._config && e._config.origConfig ? e._config.origConfig : (e._config || {});
      return { text: t.replace(/\s+/g, ' ').trim().slice(0, 200), type: String((cfg && cfg.type) || '') };
    });
    const bad = [];
    window.__pierce('button-card').forEach((b) => {
      const r = b.getBoundingClientRect(); if (!r.width) return;
      const t = (b.shadowRoot && b.shadowRoot.querySelector('ha-card') ? b.shadowRoot.querySelector('ha-card').innerText : '') || '';
      if (/\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b/.test(t)) bad.push(t.replace(/\s+/g, ' ').trim().slice(0, 120));
    });
    return { err, bad: [...new Set(bad)] };
  });
}
const CATS = [['sicherheit', /security|lock|camera|contact|alarm/], ['klima', /climate|temp|humidity|air_quality/], ['licht', /light/],
  ['personen', /presence|activity/], ['energie', /energy/], ['szenen', /scene/], ['medien', /media/], ['rollo', /cover/]];
const cat = (tpl) => (CATS.find(([, re]) => re.test(tpl)) || ['?'])[0];
const ORDER = ['sicherheit', 'klima', 'licht', 'personen', 'energie', 'szenen', 'medien'];
// Sichtbare Badges der Hauptreihe in Reihenfolge (Unter-Badges zugeklappter Reihen zählen nicht).
async function badges(pg) {
  return pg.evaluate(() => {
    const out = [];
    for (const b of window.__pierce('button-card')) {
      const tpl = [].concat((b._config || {}).template || []).join(',');
      if (!/casora_badge_/.test(tpl)) continue;
      if (!b.getBoundingClientRect().width) continue;
      // Reihe quer scrollen, damit auch Badges rechts außerhalb geprüft werden
      b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (!window.__hit(b)) continue;
      const t = (b.shadowRoot && b.shadowRoot.querySelector('ha-card') ? b.shadowRoot.querySelector('ha-card').innerText : '').replace(/\s+/g, ' ').trim();
      out.push({ tpl: tpl.split(',').filter((x) => /casora_badge_/.test(x)).pop(), text: t.slice(0, 60), x: b.getBoundingClientRect().x });
    }
    return out;
  });
}
// Erwartete Badge-Arten aus den Raum-Variablen (nur, was es im HA auch gibt).
function expected(vars) {
  const has = (re) => Object.entries(vars || {}).some(([k, v]) => re.test(k) && (Array.isArray(v) ? v.some((x) => states[x]) : typeof v === 'string' && states[v]));
  const e = {};
  if (has(/^(security_entity(_\d+)?|security_cameras|lock_entity(_\d+)?|alarm_entity(_\d+)?)$/)) e.sicherheit = true;
  if (has(/^(climate_entity_\d+|temp_sensor_\d+|humidity_sensor)$/)) e.klima = true;
  if (has(/^light_entity_\d+$/)) e.licht = true;
  if (has(/^(energy_power_entity|energy_entity(_\d+)?)$/)) e.energie = true;
  // Medien-Badge erscheint nur, wenn ein Player läuft (wie Hemma)
  if (Object.entries(vars || {}).some(([k, v]) => /^media_player_\d+$/.test(k) && states[v] && /^(playing|paused|buffering)$/.test(states[v].state))) e.medien = true;
  return e;
}
function roomVars(view) {
  const room = (view.cards || []).find((x) => [].concat(x.template || []).includes('casora_room'));
  return (room && room.variables) || {};
}

// ── 2./3. Desktop ─────────────────────────────────────────────────────────────
const rooms = [];
{
  const P = await page('desktop');
  for (const [i, v] of deskCfg.views.entries()) {
    const url = `/${desk.url_path}/${v.path || i}`, wo = `Desktop ${url}`;
    P.errors.length = 0;
    try { await openDash(P.pg, url); } catch (e) { add('fehler', 'laedt-nicht', wo, e.message.split('\n')[0], await shot(P.pg, 'desktop-' + (v.path || i))); continue; }
    const s = await scan(P.pg);
    const bild = await shot(P.pg, 'desktop-' + (v.path || i));
    for (const e of s.err) add(fremd.some((f) => e.text.includes(f) || e.type.includes(f)) ? 'info' : 'fehler', 'fehlerkarte', wo, (e.type ? e.type + ': ' : '') + e.text, bild);
    for (const t of s.bad) add('fehler', 'text-kaputt', wo, t, bild);
    for (const e of konsole(P.errors)) add('warnung', 'konsole', wo, e.slice(0, 200), bild);
    const b = await badges(P.pg);
    // Badge ohne Wert („–“): konfigurierter Sensor fehlt bzw. ist nicht verfügbar
    for (const x of b) if (/(^|\s)[–-]$/.test(x.text)) add('warnung', 'badge-ohne-wert', wo, `${x.tpl}: „${x.text}“ – Sensor fehlt/nicht verfügbar, Badge steht trotzdem da`, bild);
    const vars = roomVars(v), exp = expected(vars), got = [...new Set(b.map((x) => cat(x.tpl)))];
    rooms.push({ view: v.path || String(i), title: v.title, badges: b.map((x) => `${cat(x.tpl)}:${x.tpl.replace('casora_badge_', '')}${x.text ? ' „' + x.text.slice(0, 30) + '“' : ''}`), erwartet: Object.keys(exp), bild });
    for (const k of Object.keys(exp)) if (!got.includes(k)) add('fehler', 'badge-fehlt', wo, `${k} erwartet (laut Raum-Variablen), Badge-Reihe zeigt: ${got.join(', ') || 'nichts'}`, bild);
    const seq = got.filter((k) => ORDER.includes(k));
    const sorted = [...seq].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    if (seq.join() !== sorted.join()) add('fehler', 'badge-reihenfolge', wo, `ist ${seq.join(' → ')}, soll ${sorted.join(' → ')}`, bild);
  }
  // Glocke
  try {
    await openDash(P.pg, `/${desk.url_path}/${deskCfg.views[0].path || 0}`);
    const dot = await P.pg.evaluate(() => { const b = window.__pierce('button-card').find((x) => /casora_notifications_button/.test([].concat((x._config || {}).template || []).join())); if (!b) return null;
      const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, html: b.shadowRoot ? b.shadowRoot.innerHTML.length : 0 }; });
    if (!dot) add('fehler', 'glocke', 'Desktop Startseite', 'Glocke nicht gefunden');
    else {
      await P.pg.mouse.click(dot.x, dot.y); await P.pg.waitForTimeout(1800);
      // Die Glocke öffnet ein eigenes Mitteilungsfenster (kein Casora-Popup): an „Alles gelesen“ erkennen.
      const rows = await P.pg.evaluate(() => {
        const hit = []; (function w(r) { r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) w(e.shadowRoot); if (!e.children.length && /^(Alles gelesen|Mark all read)$/.test((e.textContent || '').trim()) && e.getBoundingClientRect().width) hit.push(e); }); })(document);
        let e = hit[0]; if (!e) { const s = window.casoraPopup && window.casoraPopup.surface; return { open: !!s, txt: s ? s.innerText.replace(/\s+/g, ' ').trim().slice(0, 1500) : '' }; }
        for (let i = 0; i < 4 && (e.parentElement || (e.parentNode && e.parentNode.host)); i++) e = e.parentElement || e.parentNode.host;
        return { open: true, txt: (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1500) };
      });
      const bild = await shot(P.pg, 'desktop-glocke');
      if (!rows.open) add('fehler', 'glocke', 'Desktop Startseite', 'Glocke öffnet kein Popup', bild);
      else {
        add('info', 'glocke', 'Desktop Startseite', 'Popup offen: ' + rows.txt.slice(0, 300), bild);
        if (/undefined|NaN|\[object/.test(rows.txt)) add('fehler', 'glocke', 'Desktop Startseite', 'kaputter Text im Glocken-Popup', bild);
      }
    }
  } catch (e) { add('warnung', 'glocke', 'Desktop Startseite', 'nicht prüfbar: ' + e.message.split('\n')[0]); }
  // Wäsche-Kacheln: Popup je Gerät
  for (const [i, v] of deskCfg.views.entries()) {
    if (!/casora_(waschmaschine|trockner|geschirrspueler)/.test(JSON.stringify(v))) continue;
    const url = `/${desk.url_path}/${v.path || i}`;
    try {
      await openDash(P.pg, url);
      const keys = await P.pg.evaluate(() => window.__pierce('button-card').map((b, n) => ({ n, t: [].concat((b._config || {}).template || []).join(','), e: (b._config || {}).entity || '' }))
        .filter((x) => /casora_(waschmaschine|trockner|geschirrspueler)/.test(x.t)));
      for (const k of keys) {
        const txt0 = await P.pg.evaluate((n) => { const b = window.__pierce('button-card')[n]; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
          window.__bvPos = { x: r.x + Math.min(40, r.width / 2), y: r.y + r.height / 2 }; return (b.shadowRoot.querySelector('ha-card') || {}).innerText || ''; }, k.n);
        const pos = await P.pg.evaluate(() => window.__bvPos);
        const bildK = await shot(P.pg, `desktop-waesche-kachel-${k.e}`);
        add('info', 'waesche', `Desktop ${url}`, `Kachel ${k.t.split(',').pop()} (${k.e}): „${txt0.replace(/\s+/g, ' ').trim().slice(0, 80)}“`, bildK);
        await P.pg.mouse.click(pos.x, pos.y); await P.pg.waitForTimeout(1800);
        const pop = await P.pg.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface;
          return { open: !!s, txt: s ? (s.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 600) : '' }; });
        const bild = await shot(P.pg, `desktop-waesche-popup-${k.e}`);
        if (!pop.open) add('fehler', 'waesche', `Desktop ${url}`, `Popup ${k.e} öffnet nicht`, bild);
        else add(/undefined|NaN|\[object/.test(pop.txt) ? 'fehler' : 'info', 'waesche', `Desktop ${url}`, `Popup ${k.e}: ${pop.txt.slice(0, 240)}`, bild);
        await P.pg.evaluate(() => { try { window.casoraPopup.close(); } catch (e) {} }); await P.pg.waitForTimeout(600);
      }
    } catch (e) { add('warnung', 'waesche', `Desktop ${url}`, 'nicht prüfbar: ' + e.message.split('\n')[0]); }
  }
  await P.ctx.close();
}

// ── Handy ─────────────────────────────────────────────────────────────────────
if (phone) {
  const pv = cfgVorher[phone.url_path].views[0];
  const mr = mobileRooms(cfgVorher[phone.url_path]);
  const filters = ['all', ...mr.map((r) => r.key)];
  const roomName = Object.fromEntries(mr.map((r) => [r.key, r.name]));
  for (const f of filters) {
    const P = await page('handy', { filter: f });
    const url = `/${phone.url_path}/${pv.path || 0}`, wo = `Handy ${f === 'all' ? 'Startseite' : (roomName[f] || f)}`;
    try {
      await openDash(P.pg, url);
      // Raum wie ein Tipp auf den Raumkopf wählen (das Handy-Layout startet auf „Alle“)
      if (f !== 'all') {
        await P.pg.waitForFunction(() => !!window._casoraFilter, null, { timeout: 30000 });
        await P.pg.evaluate((v) => window._casoraFilter.set(v), f);
        await P.pg.waitForTimeout(2000);
      }
    } catch (e) { add('fehler', 'laedt-nicht', wo, e.message.split('\n')[0], await shot(P.pg, 'handy-' + f)); await P.ctx.close(); continue; }
    const s = await scan(P.pg);
    // ganzer Inhalt (Handy-Layout scrollt in der Raum-Karte): höheres Fenster
    const tall = await P.pg.evaluate(() => Math.max(...window.__pierce('*').filter((e) => e.clientHeight >= innerHeight * 0.8).map((e) => e.scrollHeight), innerHeight));
    if (tall > 900) { await P.pg.setViewportSize({ width: 390, height: Math.min(tall + 60, 2600) }); await P.pg.waitForTimeout(1200); }
    const bild = await shot(P.pg, 'handy-' + f);
    for (const e of s.err) add(fremd.some((x) => e.text.includes(x) || e.type.includes(x)) ? 'info' : 'fehler', 'fehlerkarte', wo, (e.type ? e.type + ': ' : '') + e.text, bild);
    for (const t of s.bad) add('fehler', 'text-kaputt', wo, t, bild);
    for (const e of konsole(P.errors)) add('warnung', 'konsole', wo, e.slice(0, 200), bild);
    const r = rooms.find((x) => String(x.title || x.view).toLowerCase() === String(roomName[f] || '').toLowerCase());
    if (r) r.handy = bild;
    if (f === 'all') rooms.handyStart = bild;
    await P.ctx.close();
  }
}

// ── 5./6. Studio ──────────────────────────────────────────────────────────────
const summary = (cfg) => {
  // je Ansicht: Karten (Typ/Vorlage + Entität) ohne den Raumkopf; eigene Karten = alles, was keine button-card ist
  const out = {};
  for (const [i, v] of (cfg.views || []).entries()) {
    const cards = [];
    (function walk(o) {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (o.type) {
        const tpl = [].concat(o.template || []).join(',');
        if (tpl !== 'casora_room') cards.push(`${o.type}${tpl ? '[' + tpl + ']' : ''}${o.entity ? ' ' + o.entity : ''}`);
      }
      for (const k of ['cards', 'card', 'sections']) if (o[k]) walk(o[k]);
    })(v.cards || []);
    out[v.path || String(i)] = cards;
  }
  return out;
};
const studio = { offen: null, nachSchliessen: null, gespeichert: null, vergleich: [] };
{
  const P = await page('desktop');
  const ready = async () => {
    await P.pg.goto(BASE + '/casora-studio', { waitUntil: 'domcontentloaded' });
    await P.pg.addScriptTag({ content: PIERCE });
    await P.pg.waitForFunction(() => { const x = window.__panel && window.__panel(); return !!(x && x._hass && (x._state || x._flowMode)); }, null, { timeout: 60000 });
    await P.pg.evaluate(async (d) => { const x = window.__panel(); x._setDash(d); x._remember(d); await x._load(); }, desk.url_path);
    await P.pg.waitForFunction(() => { const x = window.__panel(); return !x._flowMode && x._state && x._state.compact && x._state.compact.rooms; }, null, { timeout: 60000 });
    await P.pg.waitForTimeout(5000); // Studio rechnet nach dem Laden nach (Vorschau, Helfer) – erst dann zählt „ungespeichert“
  };
  const dirtyInfo = () => P.pg.evaluate(() => {
    const x = window.__panel(); const root = x.shadowRoot;
    // sichtbare Speicherleiste / „ungespeichert“-Hinweis
    const marks = window.__pierce('.savebar, .dirty, [data-dirty], .unsaved', root).filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0).map((e) => (e.className || e.tagName) + ': ' + (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60));
    return { dirty: x._isDirty(), marks, draft: Object.keys(localStorage).filter((k) => /draft/i.test(k)) };
  });
  try {
    await ready();
    studio.offen = await dirtyInfo();
    const bild = await shot(P.pg, 'studio-offen');
    if (studio.offen.dirty) {
      // Was unterscheidet sich? (erste abweichende Stelle zwischen _print() und _clean)
      const d = await P.pg.evaluate(() => { const x = window.__panel(); const a = x._clean || '', b = x._print() || ''; let i = 0; while (i < a.length && a[i] === b[i]) i++;
        return { at: i, vorher: a.slice(Math.max(0, i - 120), i + 160), nachher: b.slice(Math.max(0, i - 120), i + 160) }; });
      add('fehler', 'studio-ungespeichert', 'Studio ohne Änderung', `meldet ungespeicherte Änderungen direkt nach dem Öffnen (ab Zeichen ${d.at}): vorher …${d.vorher}… / jetzt …${d.nachher}…`, bild);
    } else add('info', 'studio-ungespeichert', 'Studio ohne Änderung', 'nichts ungespeichert' + (studio.offen.marks.length ? ' (Markierungen: ' + studio.offen.marks.join('; ') + ')' : ''), bild);
    if (studio.offen.marks.length && !studio.offen.dirty) add('warnung', 'studio-ungespeichert', 'Studio ohne Änderung', 'sichtbare Markierung ohne Änderung: ' + studio.offen.marks.join('; '), bild);
    // schließen über „Fertig“ (ohne Änderung: kein Speichern), Dashboard darf unverändert sein
    await P.pg.evaluate(() => window.__panel()._done()).catch(() => {});
    await P.pg.waitForTimeout(3000);
    c = await wsc();
    const nachSchliessen = await c.cmd({ type: 'lovelace/config', url_path: desk.url_path });
    c.close();
    if (JSON.stringify(nachSchliessen.views) !== JSON.stringify(cfgVorher[desk.url_path].views)) add('fehler', 'studio-ungespeichert', 'Studio schließen', 'Schließen ohne Änderung hat das Dashboard verändert');
    else add('info', 'studio-ungespeichert', 'Studio schließen', 'Dashboard unverändert');
    // erneut öffnen: Entwurf/Markierung darf nicht auftauchen
    await ready();
    studio.nachSchliessen = await dirtyInfo();
    if (studio.nachSchliessen.dirty) add('fehler', 'studio-ungespeichert', 'Studio erneut geöffnet', 'nach Schließen ohne Änderung erneut „ungespeichert“', await shot(P.pg, 'studio-erneut'));

    if (!flag('kein-speichern')) {
      const ok = await P.pg.evaluate(async () => { try { return await window.__panel()._save(); } catch (e) { return 'Fehler: ' + e.message; } });
      await P.pg.waitForTimeout(3000);
      const bildS = await shot(P.pg, 'studio-gespeichert');
      studio.gespeichert = ok;
      if (ok !== true) add('fehler', 'studio-speichern', 'Studio speichern', 'Speichern meldet ' + JSON.stringify(ok), bildS);
      c = await wsc();
      for (const d of dashMeta) {
        const nach = await c.cmd({ type: 'lovelace/config', url_path: d.url_path });
        const a = summary(cfgVorher[d.url_path]), b = summary(nach);
        for (const v of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const va = a[v] || [], vb = b[v] || [];
          const fehlt = va.filter((x) => { const i = vb.indexOf(x); if (i < 0) return true; vb.splice(i, 1); return false; });
          const neu = vb;
          studio.vergleich.push({ dash: d.url_path, view: v, vorher: (a[v] || []).length, nachher: (summary(nach)[v] || []).length, fehlt, neu });
          if (fehlt.length) add('fehler', 'studio-verlust', `/${d.url_path}/${v}`, `nach Speichern fehlen ${fehlt.length}: ${fehlt.slice(0, 8).join('; ')}`, bildS);
          if (neu.length) add('warnung', 'studio-verlust', `/${d.url_path}/${v}`, `nach Speichern neu ${neu.length}: ${neu.slice(0, 8).join('; ')}`, bildS);
        }
        // eigene Vorlagen/Karten außerhalb der Ansichten
        const ka = Object.keys(cfgVorher[d.url_path]).filter((k) => k !== 'views'), kb = Object.keys(nach).filter((k) => k !== 'views');
        const weg = ka.filter((k) => !kb.includes(k));
        if (weg.length) add('fehler', 'studio-verlust', `/${d.url_path}`, 'nach Speichern fehlen Schlüssel: ' + weg.join(', '));
        const ta = Object.keys(cfgVorher[d.url_path].button_card_templates || {}), tb = Object.keys(nach.button_card_templates || {});
        const tw = ta.filter((k) => !tb.includes(k));
        // Vorlage weg, die keine Karte (mehr) nutzt (z. B. entfernte Funktion): nur Info.
        const viewsTxt = JSON.stringify(nach.views || []);
        const used = tw.filter((k) => viewsTxt.includes('"' + k + '"'));
        if (used.length) add('fehler', 'studio-verlust', `/${d.url_path}`, 'nach Speichern fehlen benutzte Vorlagen: ' + used.join(', '));
        if (tw.length > used.length) add('info', 'studio-verlust', `/${d.url_path}`, 'nach Speichern entfernt (von keiner Karte benutzt): ' + tw.filter((k) => !used.includes(k)).join(', '));
      }
      c.close();
      if (!befunde.some((b) => b.art === 'studio-verlust' && b.schwere === 'fehler')) add('info', 'studio-speichern', 'Studio speichern', 'Kacheln je Raum und eigene Karten vorher = nachher');
    }
  } catch (e) { add('fehler', 'studio', 'Studio', 'Ablauf abgebrochen: ' + e.message.split('\n')[0], await shot(P.pg, 'studio-abbruch')); }
  await P.ctx.close();
}
await browser.close();

// ── Bericht ───────────────────────────────────────────────────────────────────
const sek = Math.round((Date.now() - T0) / 1000);
fs.writeFileSync(path.join(OUT, 'befunde.json'), JSON.stringify({ zeit: new Date().toISOString(), sekunden: sek, dashboards: dashMeta.map((d) => d.url_path), befunde, raeume: rooms, studio }, null, 1));
const n = (s) => befunde.filter((b) => b.schwere === s).length;
console.log(`Fertig nach ${sek} s: ${n('fehler')} Fehler, ${n('warnung')} Warnungen, ${n('info')} Infos → ${path.join(OUT, 'befunde.json')}`);
process.exit(n('fehler') ? 1 : 0);
