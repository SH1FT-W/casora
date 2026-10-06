// README-/Website-Bilder aus dem neutralen, englischen Demo-Haus (dev/haus.sh demo).
//
//   CASORA_TOKENS='{…}' /opt/homebrew/opt/node@22/bin/node dev/e2e/screenshots.mjs [name …]
//
// Ohne Namen entstehen alle Bilder, sonst nur die genannten (z. B. „desktop studio“).
// Jedes Bild gibt es hell und dunkel: docs/images/casora-<name>-<light|dark>.webp,
// die PNG-Rohfassung liegt in $CASORA_OUT/shots/. Danach baut dev/e2e/readme-compose.mjs (offline)
// daraus die gerahmten README-Bilder docs/images/readme-*.webp. Umgebung:
//   CASORA_SHOTS_MODES=light,dark   nur bestimmte Modi
//   CASORA_SHOTS_DIR=…              Zielordner der .webp (Standard: docs/images im Repo)
//   CASORA_SHOTS_DASH=home-dashboard  Desktop-Dashboard des Demo-Hauses (Handy: <dash>-mobile)
//   CASORA_SHOTS_ROOM=living-room   Raum für die Studio-Bilder
//   CASORA_SHOTS_DESK_ROOM=bedroom  Raum fürs Desktop-Raumbild
//   CASORA_SHOTS_CLOCK=0            Uhr nicht auf 9:41 stellen
//   CASORA_SHOTS_THEME="Casora"  Design der Bilder (Standard: Casora, das Hauptdesign)
//   CASORA_URL=http://localhost:<port>  eigenes Wegwerf-HA mit dem Demo-Haus statt casora-test (8124);
//                                   Wächter 1 gilt nur für 8124, Wächter 2 (kein Hemma-Dashboard) immer
//
// Sicherheit: Das Test-HA hat auch Zustände mit Daten eines echten Hauses („arbeit“,
// „frisch“). Das Skript fotografiert nur, wenn der aktive Zustand „demo“ ist, und bricht
// zusätzlich ab, sobald es ein Hemma-Dashboard sieht (gibt es nur in den anderen Zuständen).
// Es schaltet keinen Zustand um, startet nichts neu und speichert nichts in HA – der
// Umzugs-Bildschirm bekommt ein Hemma-Dashboard nur im Browser vorgespielt, ebenso die
// Dashboard-Uhr (sensor.time).
//
// Popups: Standardgeräte, die fast jeder hat (Licht, Raumklima). Die Demo-Fixture schaltet
// dafür Leuchten in mehreren Räumen ein, und der Mock schreibt beim Start Tageskurven für
// Temperatur/Luftfeuchte in den Recorder – die Diagramme sind also nicht flach.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { open, ready, BASE, OUT, chromium, devices } from './harness.mjs';

const REPO = new URL('../../', import.meta.url).pathname;
const DIR = process.env.CASORA_SHOTS_DIR || path.join(REPO, 'docs/images');
const RAW = path.join(OUT, 'shots');
const DASH = process.env.CASORA_SHOTS_DASH || 'home-dashboard';
const MOBILE = DASH + '-mobile';
const ROOM = process.env.CASORA_SHOTS_ROOM || 'living-room';
// Raum fürs Desktop-Raumbild: im Demo-Haus hat das Schlafzimmer die ruhigste Kachelreihe.
const DESK_ROOM = process.env.CASORA_SHOTS_DESK_ROOM || 'bedroom';
const THEME = process.env.CASORA_SHOTS_THEME || 'Casora';
const MODES = (process.env.CASORA_SHOTS_MODES || 'light,dark').split(',').filter(Boolean);
const ONLY = process.argv.slice(2);
fs.mkdirSync(DIR, { recursive: true });
fs.mkdirSync(RAW, { recursive: true });

// ── Wächter 1: Zustand des Docker-HA (dev/haus.sh schreibt ihn nach ~/casora-haus/aktiv) ──
if (/localhost:8124|127\.0\.0\.1:8124/.test(BASE)) {
  let aktiv = '?';
  try { aktiv = fs.readFileSync(path.join(os.homedir(), 'casora-haus', 'aktiv'), 'utf8').trim(); } catch (e) { /* unbekannt */ }
  if (aktiv !== 'demo') {
    console.error(`Abbruch: Test-HA ist im Zustand „${aktiv}“, nicht „demo“. Nur das Demo-Haus wird fotografiert.`);
    process.exit(2);
  }
}

// ── Bildliste ────────────────────────────────────────────────────────────────
// kind: dash (Chromium 1440×900), tablet (WebKit, iPad Pro 11" quer), phone (WebKit, iPhone 15 Pro),
// studio (Chromium 1440×900). popup: Vorlage der Kachel/des Badges, die angetippt wird; mit url
// wird direkt dort gesucht (Badges stecken in der Raumkarte, nicht in der Dashboard-Konfiguration).
const SHOTS = [
  { name: 'desktop', kind: 'dash', url: () => `/${DASH}/home` },
  { name: 'desktop-room', kind: 'dash', url: () => `/${DASH}/${DESK_ROOM}` },
  { name: 'popup-lights', kind: 'dash', popup: 'casora_light', url: () => `/${DASH}/home` },
  // Der Temperatur-Badge liegt in der Klima-Gruppe: erst die Gruppe aufklappen (pre), dann antippen.
  { name: 'popup-climate', kind: 'dash', pre: 'casora_badge_climate_group', popup: 'casora_badge_temp', url: () => `/${DASH}/living-room` },
  // Weitere Popups der Startseite: Energie, Wäsche (läuft, siehe Zustände vor dem Lauf),
  // Sicherheit (Schloss) und Pflanzen.
  { name: 'popup-energy', kind: 'dash', popup: 'casora_energy', url: () => `/${DASH}/home` },
  { name: 'popup-laundry', kind: 'dash', popup: 'casora_waschmaschine', url: () => `/${DASH}/home` },
  { name: 'popup-security', kind: 'dash', pre: 'casora_badge_security_group', popup: 'casora_badge_contact_group', url: () => `/${DASH}/home` },
  { name: 'popup-plants', kind: 'dash', popup: 'casora_plant', url: () => `/${DASH}/home` },
  { name: 'tablet', kind: 'tablet', url: () => `/${DASH}/home` },
  { name: 'phone', kind: 'phone', url: () => `/${MOBILE}/home` },
  { name: 'studio', kind: 'studio', run: studioRoom },
  { name: 'studio-tile', kind: 'studio', run: studioTile },
  { name: 'studio-phone', kind: 'studio', run: studioPhone },
  { name: 'assistant', kind: 'studio', run: (p) => panelCall(p, 'x._casoraAssist()') },
  { name: 'setup-look', kind: 'studio', run: setupLook },
  { name: 'versions', kind: 'studio', run: versions },
  { name: 'move', kind: 'studio', run: moveFromHemma },
].filter((s) => !ONLY.length || ONLY.includes(s.name));

// Echte Geräte: Safari-Engine, Pixeldichte, Touch und Kennung von Playwright. Das iPhone
// liefert nur den Bereich zwischen Statusleiste (59 pt) und Home-Balken (34 pt), wie eine
// Web-App auf dem Home-Bildschirm – Playwright kennt keine Safe Areas, die Kamera-Insel läge
// sonst über der Navigation. readme-compose.mjs setzt Statusleiste und Balken wieder dazu.
const IPAD = devices['iPad Pro 11 landscape'];
const IPHONE = devices['iPhone 15 Pro'];
const VIEW = {
  dash: { width: 1440, height: 900, maxW: 1600 },
  studio: { width: 1440, height: 900, maxW: 1600 },
  tablet: { ...IPAD.viewport, scale: IPAD.deviceScaleFactor, mobile: true, touch: true, userAgent: IPAD.userAgent,
    safari: true, maxW: 1600 },
  phone: { width: IPHONE.screen.width, height: IPHONE.screen.height, scale: IPHONE.deviceScaleFactor,
    mobile: true, touch: true, userAgent: IPHONE.userAgent, safari: true, maxW: 800 },
};

// ── PNG → WebP im Browser (kein cwebp nötig) ────────────────────────────────
const conv = await (await chromium.launch()).newPage();
async function saveWebp(png, file, maxW) {
  const b64 = await conv.evaluate(async ([src, maxW]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + src;
    await img.decode();
    const s = Math.min(1, maxW / img.naturalWidth);
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/webp', 0.86).split(',')[1];
  }, [png.toString('base64'), maxW]);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

// ── Helfer ───────────────────────────────────────────────────────────────────
const sleep = (page, ms) => page.waitForTimeout(ms);
const tilesReady = () => window.__pierce && window.__pierce('button-card').length > 3;
const studioReady = () => { const p = window.__panel && window.__panel(); return !!(p && p._hass && p._state && p._dashList); };

// Wächter 2: kein Hemma-Dashboard im Haus (Demo hat keins), und das Demo-Dashboard gibt es.
async function guard(page) {
  const r = await page.evaluate(async (dash) => {
    const h = document.querySelector('home-assistant').hass;
    const list = await h.callWS({ type: 'lovelace/dashboards/list' });
    for (const d of list) {
      try {
        const c = await h.callWS({ type: 'lovelace/config', url_path: d.url_path });
        if (/"hemma_room"/.test(JSON.stringify(c.views || []))) return 'Hemma-Dashboard „' + d.url_path + '“ gefunden';
      } catch (e) { /* leeres Dashboard */ }
    }
    return list.some((d) => d.url_path === dash) ? null : 'Dashboard „' + dash + '“ fehlt';
  }, DASH);
  if (r) { console.error('Abbruch: ' + r + ' – das ist nicht das Demo-Haus.'); process.exit(2); }
}

// Ansicht, in der eine Kachel mit dieser Vorlage liegt (Desktop: Räume, Handy: nur home).
async function viewWith(page, dash, tpl) {
  return page.evaluate(async ([dash, tpl]) => {
    const h = document.querySelector('home-assistant').hass;
    const c = await h.callWS({ type: 'lovelace/config', url_path: dash });
    const re = new RegExp('"' + tpl + '"');
    const views = (c.views || []).filter((v) => re.test(JSON.stringify(v)));
    // Home zuerst, sonst der Raum mit den meisten Treffern.
    views.sort((a, b) => (b.path === 'home') - (a.path === 'home'));
    return views.length ? views[0].path : null;
  }, [dash, tpl]);
}

// Kachel mit der Vorlage antippen (echter Klick/Touch, damit button-card seine Aktion ausführt).
async function tapTile(page, tpl, touch) {
  const pt = await page.evaluate((tpl) => {
    const has = (el) => [].concat((el._config && el._config.template) || []).includes(tpl);
    const el = window.__pierce('button-card').find((e) => has(e) && e.getBoundingClientRect().width > 40);
    if (!el) return null;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, tpl);
  if (!pt) return false;
  await sleep(page, 600);
  if (touch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await sleep(page, 3500);
  return true;
}

// Warten, bis keine Kacheln mehr nachkommen (das Handy baut die Favoriten spät auf).
async function settle(page, max = 30000) {
  const count = () => page.evaluate(() => window.__pierce('button-card')
    .filter((e) => e.getBoundingClientRect().height > 40).length);
  let last = -1, same = 0;
  for (let t = 0; t < max && same < 3; t += 1000) {
    const n = await count();
    same = n === last ? same + 1 : 0; last = n;
    await sleep(page, 1000);
  }
}

// Die Dashboard-Uhr liest sensor.time aus HA, nicht die Browser-Uhr: den Wert nur im Browser
// überschreiben (HA selbst bleibt unberührt), passend zu Tag-/Nachtfoto.
async function fakeClock(page, mode) {
  if (process.env.CASORA_SHOTS_CLOCK === '0') return;
  await page.evaluate((t) => {
    const ha = document.querySelector('home-assistant');
    const s = ha && ha.hass && ha.hass.states;
    if (!s || !s['sensor.time'] || typeof ha._updateHass !== 'function') return;
    ha._updateHass({ states: { ...s, 'sensor.time': { ...s['sensor.time'], state: t } } });
  }, mode === 'dark' ? '21:41' : '09:41');
}

async function dashShot(page, shot, touch) {
  const dash = shot.kind === 'phone' ? MOBILE : DASH;
  let url = shot.url && shot.url();
  if (shot.popup && !url) {
    // Frische Seite: erst das Dashboard laden, damit hass für die Suche bereitsteht.
    if (!page.url().startsWith(BASE)) await ready(page, `/${dash}/home`, tilesReady, 60000);
    const v = await viewWith(page, dash, shot.popup);
    if (!v) return `keine Kachel „${shot.popup}“ in ${dash}`;
    url = `/${dash}/${v}`;
  }
  await ready(page, url, tilesReady, 60000);
  // Ganzer iPhone-Bildschirm: Playwright kennt keine Safe Areas – Casoras Mobil-Chrome wird
  // um die Statusleiste (59 px) nach unten versetzt, das Hintergrundbild reicht bis ganz oben.
  if (shot.kind === 'phone') {
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--casora-mobile-chrome-drop', '63px');
      // Unten der Home-Balken (34 px): Navigationsleiste so hoch wie auf dem iPhone.
      (function walk(r) {
        if (!r) return;
        r.querySelectorAll('.hmn-bar').forEach((b) => { b.style.setProperty('bottom', '32px', 'important'); });
        r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
      })(document);
    });
  }
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await settle(page);
  await sleep(page, 3000);  // Raumfotos, Diagramme, Einblend-Animationen
  if (shot.pre && !(await tapTile(page, shot.pre, touch))) return `Kachel „${shot.pre}“ nicht sichtbar`;
  if (shot.popup) {
    if (!(await tapTile(page, shot.popup, touch))) return `Kachel „${shot.popup}“ nicht sichtbar`;
    await sleep(page, 2500);  // Diagramme im Popup laden den Verlauf nach
  }
  return null;
}

// Entitäts-IDs (light.xyz) stammen im Demo-Haus aus einem echten Haus und sind deutsch:
// fürs Bild nur im Browser durch eine neutrale ID aus dem angezeigten Namen ersetzen.
async function neutralIds(page) {
  await page.evaluate(() => {
    const re = /^\s*([a-z_]+)\.([a-z0-9_]+)\s*$/;
    const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'device';
    (function walk(r) {
      const it = document.createTreeWalker(r, NodeFilter.SHOW_TEXT);
      for (let n = it.nextNode(); n; n = it.nextNode()) {
        const m = re.exec(n.nodeValue);
        if (!m || !/^(light|sensor|binary_sensor|switch|climate|cover|fan|lock|media_player|camera|plant|vacuum|select|button|number|update|scene|script|input_[a-z]+|alarm_control_panel|weather|calendar|todo|event|valve|humidifier|water_heater|device_tracker|person)$/.test(m[1])) continue;
        const el = n.parentElement;
        const prev = el && el.previousElementSibling;
        const name = prev && prev.textContent.trim();
        n.nodeValue = m[1] + '.' + slug(name || m[2]);
      }
      r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); });
    })(document);
  });
}

// ── Studio ───────────────────────────────────────────────────────────────────
async function panelCall(page, code) {
  await page.evaluate(`(async () => { const x = window.__panel(); await ${code}; })()`);
  await sleep(page, 2500);
}

// Tag-/Nacht-Vorschau des Studios passend zum Modus.
async function studioMode(page, mode) {
  await page.evaluate((m) => {
    const p = window.__panel();
    // Nur klicken, wenn die Vorschau noch falsch steht (das aktive Segment bleibt bei Klick aktiv).
    if (!!p._miniDark !== (m === 'night')) {
      const b = p.shadowRoot.querySelector(`#modeseg [data-mode="${m}"]`);
      if (b) b.click();
    }
    // „n Differences“ (Desktop und Handy des Demo-Hauses weichen voneinander ab) ist
    // ein Hinweis zu den Demo-Daten, keiner zum Studio – fürs Bild ausblenden.
    const d = p.shadowRoot.querySelector('#diffs');
    if (d) d.style.visibility = 'hidden';
  }, mode === 'dark' ? 'night' : 'day');
  await sleep(page, 1500);
}

async function studioRoom(page, mode) { await studioMode(page, mode); }

async function studioTile(page, mode) {
  await studioMode(page, mode);
  const picked = await page.evaluate(() => {
    const p = window.__panel();
    const room = p._state.compact.rooms[p._room || 0];
    const order = ['casora_air_purifier', 'casora_thermostat', 'casora_light', 'casora_cover'];
    const tpl = (t) => [].concat(t.template || []);
    const tile = order.map((o) => (room.tiles || []).find((t) => tpl(t).includes(o))).find(Boolean) || (room.tiles || [])[0];
    if (!tile) return null;
    p._select({ group: 'tiles', key: p._tileKey(tile) });
    return tile.name || tpl(tile)[0];
  });
  if (!picked) return 'keine Kachel im Raum';
  await sleep(page, 2500);
  // Popup-Vorschau neben dem Editor, falls sie nicht von selbst aufgeht.
  await page.evaluate(async () => { const p = window.__panel(); if (!p._cpLayer && p._cpTarget && p._cpTarget()) await p._cpOpen(); });
  await sleep(page, 3500);
  return null;
}

async function studioPhone(page, mode) {
  await studioMode(page, mode);
  const ok = await page.evaluate(() => {
    const b = window.__panel().shadowRoot.querySelector('#sizeseg [data-size="phone"]');
    if (!b || b.hidden) return false;
    b.click(); return true;
  });
  if (!ok) return 'Handy-Vorschau nicht verfügbar (kein Handy-Dashboard?)';
  await sleep(page, 4000);
  return null;
}

async function setupLook(page) {
  // Der Assistent beginnt direkt mit der Look-Wahl (wie ⋯ → „Einrichtungsassistent …“).
  await panelCall(page, 'x._rerunSetup()');
  await sleep(page, 3000);
}

async function versions(page, mode) {
  await studioMode(page, mode);
  await panelCall(page, 'x._cvOpenPage()');
  // Einen älteren Stand in der Vorschau zeigen, wenn es einen gibt.
  const n = await page.evaluate(() => {
    const rows = window.__pierce('.cv-row').filter((r) => r.getAttribute('aria-current') !== 'true');
    if (rows[0]) rows[0].click();
    return window.__pierce('.cv-row').length;
  });
  await sleep(page, 3500);
  return n ? null : 'noch keine Versionen im Demo-Haus – Bild zeigt den leeren Zustand';
}

// Umzug: das Demo-Dashboard als Hemma-2-Dashboard vorspielen (nur im Browser, nichts wird
// geschrieben), dann die Übersicht des Umzugsassistenten zeigen.
async function moveFromHemma(page) {
  // Das Raum-Karussell gleitet sonst und steht im Bild mitten zwischen zwei Karten.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(async ([dash, mobile]) => {
    const p = window.__panel(); const h = p._hass;
    const asHemma = (c) => c && JSON.parse(JSON.stringify(c)
      .replace(/--casora-/g, '--hemma-').replace(/\bcasora_/g, 'hemma_').replace(/\bcasora-/g, 'hemma-'));
    const raw = asHemma(await h.callWS({ type: 'lovelace/config', url_path: dash }));
    let rawMobile = null;
    try { rawMobile = asHemma(await h.callWS({ type: 'lovelace/config', url_path: mobile })); } catch (e) { /* ohne Handy */ }
    const c = { url_path: 'dashboard-hemma', id: 'demo-hemma', title: 'My Home (Hemma)', mode: 'storage', raw, rawMobile, done: false };
    await p._casoraUmzug({ list: [c] });
  }, [DASH, MOBILE]);
  await sleep(page, 4000);
}

// ── Lauf ─────────────────────────────────────────────────────────────────────
const made = [], skipped = [];
let guarded = false;
for (const mode of MODES) {
  for (const kind of ['dash', 'tablet', 'phone', 'studio']) {
    const list = SHOTS.filter((s) => s.kind === kind);
    if (!list.length) continue;
    for (const shot of list) {
      // Eigener Browser je Bild: Studio-Abläufe und Popups beeinflussen sich so nicht.
      const v = VIEW[kind];
      const { browser, context, page, errors } = await open({ ...v, dark: mode === 'dark', theme: THEME, locale: 'en-US', args: ['--hide-scrollbars'] });
      await context.addInitScript(() => {
        localStorage.setItem('dockedSidebar', JSON.stringify('always_hidden'));
        localStorage.setItem('casora.aiCost.skip', '1');
      });
      // Feste Browser-Uhr nur fürs Studio (Vorschau-Uhr); das Dashboard liest sensor.time (fakeClock).
      if (kind === 'studio' && process.env.CASORA_SHOTS_CLOCK !== '0') {
        const t = new Date(); t.setHours(mode === 'dark' ? 21 : 9, 41, 0, 0);
        try { await context.clock.install({ time: t }); await context.clock.resume(); } catch (e) { /* ohne feste Uhr */ }
      }
      let why = null;
      try {
        if (!guarded) { await ready(page, '/' + DASH + '/home', tilesReady, 60000); await guard(page); guarded = true; }
        if (kind === 'studio') {
          await ready(page, `/casora-studio?dash=${DASH}&room=${ROOM}`, studioReady, 60000);
          await sleep(page, 3000);
          why = (await shot.run(page, mode)) || null;
        } else {
          why = await dashShot(page, shot, kind === 'phone');
        }
      } catch (e) {
        why = 'Fehler: ' + String(e.message || e).split('\n')[0];
      }
      const file = `casora-${shot.name}-${mode}`;
      // Hinweise (why) ohne „Fehler“/„keine“ sind nur Anmerkungen – das Bild entsteht trotzdem.
      if (why && /^(Fehler|keine Kachel|Kachel|Handy-Vorschau)/.test(why)) {
        skipped.push(`${file}: ${why}`);
      } else {
        if (kind !== 'studio') { await fakeClock(page, mode); await sleep(page, 1200); }
        await neutralIds(page);
        const png = await page.screenshot();
        fs.writeFileSync(path.join(RAW, file + '.png'), png);
        await saveWebp(png, path.join(DIR, file + '.webp'), v.maxW);
        made.push(file + '.webp' + (why ? `  (${why})` : ''));
        console.log('📸', file, why ? '– ' + why : '');
      }
      const bad = errors.filter((e) => !/addEventListener|404|favicon/.test(e));
      if (bad.length) console.log('   Browser-Fehler:', bad.slice(0, 3));
      await browser.close();
    }
  }
}
await conv.context().browser().close();
console.log(`\n${made.length} Bilder nach ${DIR}` + (skipped.length ? `, ${skipped.length} übersprungen:` : ''));
skipped.forEach((s) => console.log('  –', s));
