// Test-Rahmen für das Casora-Test-HA (Docker casora-test, Port 8124, Zustand „arbeit“ – dev/haus.sh).
// Anmeldung per Token aus der Umgebung (CASORA_TOKENS = JSON von /auth/token),
// nichts davon liegt im Repo. Playwright: PLAYWRIGHT_PATH, sonst der npx-Cache
// im eigenen Heimordner (npx playwright …), sonst eine normale Installation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function findPlaywright() {
  if (process.env.PLAYWRIGHT_PATH) return process.env.PLAYWRIGHT_PATH;
  const npx = path.join(os.homedir(), '.npm', '_npx');
  for (const d of fs.existsSync(npx) ? fs.readdirSync(npx) : []) {
    const f = path.join(npx, d, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(f)) return f;
  }
  return 'playwright';
}
const { chromium, webkit, devices } = await import(findPlaywright());
export { chromium, webkit, devices };

export const BASE = process.env.CASORA_URL || 'http://localhost:8124';
export const OUT = process.env.CASORA_OUT || '/tmp/casora-e2e';
// IDs des eigenen Testhauses (privat wie die Mock-Fixture): dev/e2e/testhaus.json.
const HAUS_FILE = new URL('./testhaus.json', import.meta.url);
export const HAUS = fs.existsSync(HAUS_FILE) ? JSON.parse(fs.readFileSync(HAUS_FILE, 'utf8')) : {};
fs.mkdirSync(OUT, { recursive: true });

export async function freshToken() {
  const t = JSON.parse(process.env.CASORA_TOKENS);
  const r = await fetch(BASE + '/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: BASE + '/' }),
  });
  const j = await r.json();
  return { ...j, refresh_token: t.refresh_token };
}

// dark: HA-Dunkelmodus (Standard an), locale: Browser-Sprache, args: Chromium-Startargumente
// (z. B. --hide-scrollbars für Screenshots), scale: Pixeldichte (Standard 2, iPhone 3),
// theme: HA-Theme dieses Browsers (Standard „Casora Standard“, wie die Tests es erwarten).
export async function open({ width = 1440, height = 900, mobile = false, umzug = false, safari = false,
  dark = true, locale = 'de-DE', args = [], touch, userAgent, scale = 2, theme = 'Casora Standard' } = {}) {
  const tok = await freshToken();
  // safari: WebKit statt Chromium (Safari-Eigenheiten nachstellen).
  const browser = await (safari ? webkit : chromium).launch(safari ? {} : { args });
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: scale,
    // HA speichert die Theme-Wahl je Benutzer auf dem Server; ohne festen Hell/Dunkel-Wert
    // folgt es dem System – das Farbschema des Browsers muss also zu „dark“ passen.
    colorScheme: dark ? 'dark' : 'light',
    // touch/userAgent: eigene Werte (z. B. Tablet mit Touch, aber ohne Handy-Kennung) – sonst wie mobile.
    isMobile: mobile, hasTouch: touch ?? mobile, locale, serviceWorkers: 'block',
    userAgent: userAgent || (mobile ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' : undefined),
  });
  const version = JSON.parse(fs.readFileSync(new URL('../../custom_components/casora/manifest.json', import.meta.url), 'utf8')).version;
  await context.addInitScript(([t, base, version, umzug, dark, theme]) => {
    localStorage.setItem('hassTokens', JSON.stringify({
      access_token: t.access_token, token_type: 'Bearer', expires_in: t.expires_in,
      refresh_token: t.refresh_token, hassUrl: base, clientId: base + '/', expires: Date.now() + t.expires_in * 1000,
    }));
    localStorage.setItem('selectedTheme', JSON.stringify({ theme, dark }));
    // Willkommen/Neu-in-Casora nicht über die Studio-Knöpfe legen (Test t19 prüft es eigens).
    if (!localStorage.getItem('casora.seenVersion')) localStorage.setItem('casora.seenVersion', version);
    // Umzugsangebot nicht über die Studio-Knöpfe legen (t19 ruft den Assistenten direkt auf).
    if (!umzug) localStorage.setItem('casora.umzug.off', '1');
    // Hemma-Fixture (alte, von Hand erweiterte Vorlagen) nie überschreiben – das Produkt hat keine Sperre.
    window.CASORA_STUDIO_SAVE_LOCK = '^dashboard-hemma(-mobile)?$';
  }, [tok, BASE, version, umzug, dark, theme]);
  // CASORA_STUDIO=b|a: neues Studio (Vorschau ist der Editor) bzw. bisheriges erzwingen;
  // ohne Angabe gilt der Standard des Panels. Option studio: 'a'|'b' überschreibt.
  const studio = arguments[0] && arguments[0].studio || process.env.CASORA_STUDIO;
  if (studio === 'a' || studio === 'b') {
    await context.addInitScript((v) => localStorage.setItem('casora.studio.b', v), studio === 'b' ? '1' : '0');
  }
  // serviceWorkers: 'block' lässt navigator.serviceWorker.register() nichts zurückgeben. Das
  // HA-Frontend registriert auf localhost aber /sw-modern.js und ruft dann
  // registration.addEventListener('updatefound') auf – das warf in jedem Lauf (Studio, Dashboard,
  // Assistent) „Cannot read properties of undefined (reading 'addEventListener')“. Kein Casora-Fehler:
  // eine leere Registrierung zurückgeben, die nie ein Update meldet.
  await context.addInitScript(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    const stub = () => Object.assign(new EventTarget(), { installing: null, waiting: null, active: null,
      scope: location.origin + '/', update: async () => {}, unregister: async () => true });
    const wrap = (orig) => async function (...a) {
      let r;
      try { r = await orig.apply(this, a); } catch (e) { r = undefined; }
      return r || stub();
    };
    // Playwrights Sperre kann vor oder nach diesem Skript greifen: beide Wege abdecken.
    const proto = Object.getPrototypeOf(sw);
    proto.register = wrap(proto.register);
    let own = Object.prototype.hasOwnProperty.call(sw, 'register') ? wrap(sw.register) : null;
    try {
      Object.defineProperty(sw, 'register', { configurable: true,
        get() { return own || proto.register; }, set(f) { own = wrap(f); } });
    } catch (e) { /* bleibt beim Prototyp */ }
  });
  // CASORA_LOCAL=1: Panel-/Skriptdateien aus diesem Checkout statt der im Test-HA
  // eingespielten Fassung – so lässt sich ein Fix prüfen, ohne HA anzufassen.
  if (process.env.CASORA_LOCAL) {
    const CC = new URL('../../custom_components/casora/', import.meta.url).pathname;
    await context.route(/\/casora_(scripts|panel|studio|assets)\/[^?]*\.js(\?|$)/, async (r) => {
      const m = new URL(r.request().url()).pathname.match(/^\/casora_(\w+)\/(.*)$/);
      const f = [CC + (m[1] === 'scripts' ? 'scripts' : 'panel') + '/' + m[2], CC + m[2]].find((c) => fs.existsSync(c));
      if (!f) return r.continue();
      return r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(f, 'utf8') });
    });
  }
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return { browser, context, page, errors, token: tok.access_token };
}

export async function call(token, domain, service, data = {}) {
  const r = await fetch(`${BASE}/api/services/${domain}/${service}`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return r.status;
}

// Rekursiv durch Shadow-DOM suchen (im Browser ausgeführt).
export const PIERCE = `
  window.__pierce = function (sel, root) {
    const out = [];
    (function walk(r) { if (!r) return; r.querySelectorAll(sel).forEach((e) => out.push(e));
      r.querySelectorAll('*').forEach((e) => { if (e.shadowRoot) walk(e.shadowRoot); }); })(root || document);
    return out;
  };
  window.__panel = function () { return window.__pierce('casora-panel')[0] || null; };`;

export async function ready(page, url, check = '() => true', timeout = 90000) {
  await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: PIERCE });
  await page.waitForFunction(check, null, { timeout });
  await page.waitForTimeout(1500);
}

export async function shot(page, name) {
  const p = `${OUT}/${name}.png`;
  await page.screenshot({ path: p });
  return p;
}
