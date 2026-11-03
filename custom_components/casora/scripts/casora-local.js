// Casora – own extensions, loader.
//
// The logic lives in scripts/local/*.js and loads in a fixed order. The order is
// deliberate: e.g. dishwasher, printer and robot vacuum (02) build on _casoraLaundry,
// and redrawing after a late load (06) has to run last.
//
// Versioning is automatic: the integration appends ?v=<newest change time of all
// modules> to this file; the value is handed on to every module. After a change just
// restart HA or reload the integration – no counting up by hand. An error in one
// module is reported and does not hold up the others.
//
// First load on the phone (30.09.2026): this loader is small and arrives before the
// big scripts. That is why the guard against HA's "configuration error" for cards
// not known yet sits here (no longer in casora-core), and it announces its end with
// the event "casora-local-loaded" – smart-row keeps the room sections of the phone's
// Home covered until then (see there).

// casora-esc:begin – canonical HTML escaping, the same block in every file that loads on its own
// (checked by dev/unit/html_escape.mjs). Every value that goes into an HTML string goes through one of these:
//   casoraEsc(v)      text and quoted attribute values: & < > " ' as entities
//   casoraEscJs(v)    inside a quoted JS string of an inline handler (onclick="f('…')"): JS-escaped, then HTML-escaped
//   casoraSafeUrl(u)  href/src: '' for javascript:, vbscript: and data: other than images, else escaped
(function () {
  if (window.casoraEsc) return;
  var MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return MAP[c]; }); };
  window.casoraEsc = esc;
  window.casoraEscJs = function (v) {
    return esc(String(v == null ? '' : v).replace(/[\\'"`<>&\n\r\u2028\u2029]/g, function (c) {
      return '\\u' + ('000' + c.charCodeAt(0).toString(16)).slice(-4);
    }));
  };
  window.casoraSafeUrl = function (u) {
    var s = String(u == null ? '' : u).trim();
    var k = s.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
    if (/^(?:javascript|vbscript|data):/.test(k) && !/^data:image\//.test(k)) return '';
    return esc(s);
  };
})();
// casora-esc:end

// For a card not known yet (casora-mobile-nav only comes from the modules here,
// grid-layout/button-card just as late depending on the load order) HA shows an error
// card after 2 s and replaces it once the element is defined. Such error cards stay
// invisible for the first 30 s; if the element is never defined, the error shows
// afterwards as usual.
(function () {
  if (window._casoraBootErrorGuard) return;
  window._casoraBootErrorGuard = true;
  var RE = /^Custom element doesn't exist: ([a-z0-9-]+)\.?$/;
  var LIMIT = 30000;
  function hide(el, tag) {
    var st = el.style;
    if (st._casoraHeld) return;
    st._casoraHeld = true;
    st.setProperty('display', 'none');
    // HA's 2 s timer sets style.display = "" – catch that one setter here.
    try { Object.defineProperty(st, 'display', { configurable: true, get: function () { return 'none'; }, set: function () {} }); } catch (e) { return; }
    var release = function () {
      try { delete st.display; } catch (e) { /* ignore */ }
      st._casoraHeld = false;
      if (!customElements.get(tag)) st.removeProperty('display');
    };
    var left = Math.max(0, LIMIT - performance.now());
    var timer = setTimeout(release, left);
    customElements.whenDefined(tag).then(function () { clearTimeout(timer); release(); });
  }
  customElements.whenDefined('hui-error-card').then(function () {
    var C = customElements.get('hui-error-card');
    var proto = C && C.prototype;
    if (!proto || typeof proto.setConfig !== 'function' || proto._casoraBootGuard) return;
    proto._casoraBootGuard = true;
    var orig = proto.setConfig;
    proto.setConfig = function (cfg) {
      var r = orig.apply(this, arguments);
      try {
        var m = cfg && typeof cfg.message === 'string' && RE.exec(cfg.message)
          || cfg && typeof cfg.error === 'string' && RE.exec(cfg.error);
        if (m && performance.now() < LIMIT && !customElements.get(m[1])) hide(this, m[1]);
      } catch (e) { /* never break the error card itself */ }
      return r;
    };
  });
})();

// custom:casora-void – a card that draws nothing. Templates pick it as the type of a custom field whose card is
// not needed in the current design (casora_mobile_now_playing: the old carousel in Casora designs), so button-card
// does not build and re-render a hidden card tree. Defined here because this loader arrives first.
if (!customElements.get('casora-void')) {
  customElements.define('casora-void', class extends HTMLElement {
    setConfig() {}
    set hass(h) { /* nothing to draw */ }
    getCardSize() { return 0; }
    connectedCallback() { this.style.display = 'none'; }
  });
}

// HA's own toolbar (title, ⋮ menu) on dashboards whose kiosk_mode asks to hide it. It lived in casora-core,
// which arrives seconds later on a phone: until then HA's menu bar stood at the top of the page, a menu
// the dashboard does not have (31.10.2026). The loader is small and arrives first, so it hides it here.
(function () {
  if (window._casoraHeaderHide) return;
  window._casoraHeaderHide = true;

  var ID = 'casora-header-hide';
  var CSS = '.header { display: none !important; }';
  var OFF = /[?&](casora_header=1|disable_km)/.test(location.search);
  // kiosk-mode's breakpoint, so one dashboard reads the same under either.
  var NARROW = window.matchMedia('(max-width: 812px)');

  function findDeep(root, tag, depth) {
    if (!root || depth > 10 || !root.querySelector) return null;
    var hit = root.querySelector(tag);
    if (hit) return hit;
    var kids = root.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].shadowRoot) {
        var f = findDeep(kids[i].shadowRoot, tag, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  var _root = null;
  function huiRoot() {
    if (_root && _root.isConnected && _root.shadowRoot) return _root;
    _root = findDeep(document, 'hui-root', 0);
    return _root;
  }

  function wanted(cfg) {
    var km = cfg && cfg.kiosk_mode;
    if (!km) return false;
    var m = km.mobile_settings;
    if (m && m.hide_header !== undefined && NARROW.matches) return !!m.hide_header;
    return !!km.hide_header;
  }

  var _sr = null;
  var _head = null;

  function apply() {
    var root = huiRoot();
    var sr = root && root.shadowRoot;
    if (!sr) return false;

    if (_sr !== sr) {
      _sr = sr;
      new MutationObserver(function () { apply(); }).observe(sr, { childList: true });
    }
    var head = sr.querySelector('.header');
    if (head && _head !== head) {
      _head = head;
      new MutationObserver(function () { apply(); }).observe(head, { childList: true, subtree: true });
    }

    var ll = root.lovelace || {};
    var on = !OFF && !ll.editMode && wanted(ll.config);
    var el = sr.querySelector('#' + ID);
    if (on === !!el) return true;
    if (!on) { el.remove(); return true; }
    var st = document.createElement('style');
    st.id = ID;
    st.textContent = CSS;
    sr.appendChild(st);
    return true;
  }

  function kick() {
    var n = 0;
    (function tick() {
      apply();
      if (++n < 12) setTimeout(tick, n < 5 ? 200 : 1200);
    })();
  }
  kick();
  window.addEventListener('location-changed', kick, true);
  window.addEventListener('popstate', kick, true);
  NARROW.addEventListener('change', apply);
})();

// 04-navigation right after the basics (it needs only casora-core, 00 and 01): the phone's bottom bar is
// there before the large device and popup modules have run (Prüfung 2 DH-17: bar seconds late on a phone).
// The first START_MODULES.length entries are the start modules (stage 3.1): finder, basics, navigation,
// devices and popups – what the first picture and the first tap need. They also run before the phone's
// veil goes. The others follow one by one, each in a task of its own.
const MODULES = [
  '00-finder',
  '01-basis',
  '04-navigation',
  '02-devices',
  '03-popups',
  '05-standard-medien',
  '05-weich-mehr',
  '06-kalender',
  '07-weich-spezial',
  '08-weich-kompakt',
  '08-weich-szenen',
  '09-weich-wiedergabe',
  '10-weich-welle',
  '11-fussball',
  '12-tanken',
  '13-schloss',
  '14-pulse',
  '15-person',
  '16-maeher',
  '17-update-detail',
  '18-ziele',
  '19-befeuchter',
  '20-energie-fokus',
  '22-halten',
  '23-frigate',
  '24-klingel',
  '25-coffee',
  '26-haustier',
  '27-chart',
  '28-free-tile',
  '29-eigene-badges',
  '30-fridge',
  '31-velair',
  '32-media-badge',
  '33-color-wheel',
  '34-security-covers',
  '34-entity-list',
  '35-phone-hub',
  '36-shopping',
  '37-kettle',
  '38-search',
  '39-update-prompt',
  '40-swipe-rooms',
];

const START_MODULES = MODULES.slice(0, 5);
window.casoraLocalModules = { start: START_MODULES, all: MODULES };

const v = new URL(import.meta.url).searchParams.get('v') || String(Date.now());
// Stamp this page was loaded with – casora-core compares it with casora/version
// ("Casora was updated"). Since 1.0.5 it covers the other Casora scripts too.
if (new URL(import.meta.url).searchParams.get('v')) window.casoraLoadedStamp = v;
const urls = MODULES.map((m) => new URL('./local/' + m + '.js?v=' + v, import.meta.url).href);

/* Request every module right away in parallel, then run them in order. */
urls.forEach((href) => {
  try {
    const l = document.createElement('link');
    l.rel = 'modulepreload';
    l.href = href;
    document.head.appendChild(l);
  } catch (e) { /* speed-up only */ }
});

/* Until cond() is true (every 50 ms), at most ms long. */
const until = (cond, ms) => new Promise((resolve) => {
  const t0 = Date.now();
  (function poll() {
    let x = null;
    try { x = cond(); } catch (e) { /* keep waiting */ }
    if (x) return resolve(x);
    if (Date.now() - t0 > ms) return resolve(null);
    setTimeout(poll, 50);
  })();
});

/* Settings for the whole home (window.CASORA_SETTINGS): Studio → Settings, stored in
   the integration. Formerly /config/www/casora/einstellungen.js – the file still applies
   while nothing is stored in the Studio. Without either, Casora's neutral defaults apply.
   The integration's answer is remembered in this browser and the modules start right away on
   the remembered one (or on the defaults the very first time); the fresh answer follows and,
   only if it differs, the tiles are drawn again. The modules never wait for the WebSocket.
   The file: the integration's answer says whether there is one and its version key ("file");
   it is loaded only then, with that key in the URL, so the browser keeps it (Ladezeit stage 1.3:
   it was fetched with no-store and ?t= on every open). Only without a remembered answer that
   names the key (first open here, older Casora) is it asked for the old way. */
const SETTINGS_KEY = 'casora.settings.cache';
const cached = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { return null; } };
const known = (() => { const k = cached(); return k && typeof k === 'object' ? k : null; })();
// Whether the answer carries the file's version key (Casora 26.11 and newer).
const hasStamp = (x) => !!x && Object.prototype.hasOwnProperty.call(x, 'file');

let fromFile;            // what the file set (undefined: no file, or not run yet)
let fileKey = null;      // version key of the file that ran ('' for the unversioned one)
let best = known;        // newest answer of the integration (or the remembered one)
// Stored settings win over the file; electricity price from the Casora options, else from HA's energy dashboard
// (costs in device popups, window.casoraPriceKwh). With a price entity casoraPriceKwh reads its state live.
const settle = () => {
  const r = best;
  if (r && r.stored) window.CASORA_SETTINGS = r.settings || {};
  else if (fromFile !== undefined) window.CASORA_SETTINGS = fromFile;
  if (r && typeof r.price_kwh === 'number') window.CASORA_PRICE_KWH = r.price_kwh;
  if (r && typeof r.price_entity === 'string' && r.price_entity) window.CASORA_PRICE_ENTITY = r.price_entity;
};
// Runs the settings file (key: version key; null: unversioned, the old way). Resolves when it ran.
// /casora_assets serves the user's file or – without one – an empty module, so no 404 in the console.
const loadFile = (key) => {
  const url = '/casora_assets/einstellungen.js?' + (key ? 'v=' + encodeURIComponent(key) : 't=' + Date.now());
  return import(url).then(() => {
    fileKey = key || '';
    fromFile = window.CASORA_SETTINGS;
    settle();
  }, (e) => {
    console.error('[casora-local] einstellungen.js konnte nicht geladen werden:', e);
  });
};

const wsP = (async () => {
  const hass = await until(() => {
    const h = document.querySelector('home-assistant');
    return h && h.hass && h.hass.connection ? h.hass : null;
  }, 8000);
  if (!hass) return null;
  const r = await hass.callWS({ type: 'casora/settings/get' });
  const keep = { stored: !!(r && r.stored), settings: (r && r.settings) || {}, price_kwh: r && r.price_kwh, price_entity: r && r.price_entity };
  if (hasStamp(r)) keep.file = r.file || null;
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(keep)); } catch (e) { /* private mode / full */ }
  return r;
})().catch(() => null); // Older Casora without a settings store: the file (or nothing) applies.
// What the modules see of an answer (the part that changes tiles).
const sig = (x) => JSON.stringify(x ? [!!x.stored, x.stored ? x.settings || {} : null, x.price_kwh, x.price_entity, x.stored ? null : x.file || null] : null);

// The file is needed before the modules run only while nothing is stored (stored settings win over it).
if (!(known && known.stored)) {
  if (hasStamp(known)) { if (known.file) await loadFile(known.file); }
  else await loadFile(null);
}
settle();
// sig() of what the modules started with (nothing remembered: Casora's defaults, or the file that just ran).
let started = sig(known || { stored: false });
wsP.then(async (r) => {
  if (!r) return;
  best = r;
  if (!r.stored && hasStamp(r)) {
    if (fileKey === '' && r.file) {
      // The file ran unversioned on this page (first open here, or a remembered answer without the key):
      // it is the current one. Nothing to load again, and nothing changed for the modules on its account.
      fileKey = r.file;
      if (!known || !hasStamp(known)) started = sig(Object.assign({}, known || { stored: false }, { file: r.file }));
    } else if (r.file && r.file !== fileKey) {
      // The file appeared or changed since this browser last saw it.
      await loadFile(r.file);
    } else if (!r.file) {
      // No file (any more), nothing stored (any more): Casora's defaults.
      fromFile = undefined;
      window.CASORA_SETTINGS = undefined;
    }
  }
  settle();
  if (sig(r) === started) return;
  started = sig(r);
  // Changed since this browser last saw them: draw the tiles once more, after the modules are there.
  const redraw = () => {
    try { window.dispatchEvent(new Event('casora-settings-changed')); } catch (e) { /* old browser */ }
    if (typeof window.casoraKickAll === 'function') { window.casoraKickAll('settings'); return; }
    if (typeof window.casoraKick !== 'function') return;
    const out = [];
    (function walk(root, d) {
      if (!root || d > 30 || !root.querySelectorAll) return;
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) {
        if (all[i].localName === 'button-card') out.push(all[i]);
        if (all[i].shadowRoot) walk(all[i].shadowRoot, d + 1);
      }
    })(document, 0);
    out.forEach((el) => window.casoraKick(el));
  };
  if (window._casoraLocalLoaded) redraw();
  else window.addEventListener('casora-local-loaded', redraw, { once: true });
});

/* The modules build on casora-core (_casoraFilter, casoraMenuGlass, casoraPopup …).
   It is a resource of its own and can finish after this loader on the phone. */
await until(() => window._casoraFilter, 15000);

// Ladezeit stage 3.1: the start modules run back to back; then the phone's veil may go (smart-row listens
// for "casora-local-started"). The other modules follow, still in order, each in a task of its own, so the
// browser can paint and take a tap in between instead of running all 40 in one go. Cards drawn before a late
// module show its fallbacks until the redraw after the last one (as they always did on a desktop).
// Where a veil waits (phone Home, _casoraHomeSlim) the cards are drawn once more right away, with the start
// modules' helpers: they are about to be seen. Elsewhere that pass would only add a redraw wave.
const yieldToPage = () => new Promise((resolve) => {
  try {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(0);
  } catch (e) { setTimeout(resolve, 0); }
});
for (let i = 0; i < urls.length; i++) {
  if (i === START_MODULES.length) {
    window._casoraLocalStarted = START_MODULES;
    try { window.dispatchEvent(new Event('casora-local-started')); } catch (e) { /* old browser */ }
    try { if (window._casoraHomeSlim && typeof window.casoraKickAll === 'function') window.casoraKickAll('modules-started'); } catch (e) { /* the next state push redraws */ }
  }
  if (i >= START_MODULES.length) await yieldToPage();
  try {
    await import(urls[i]);
  } catch (e) {
    console.error('[casora-local] Modul ' + MODULES[i] + ' konnte nicht geladen werden:', e);
  }
}
window._casoraLocalLoaded = MODULES;
// The phone's header capsule (bell, assist, ⋯) waits hidden until the bottom bar docks it (casora_mobile_chrome).
// A phone page without casora-mobile-nav never docks it: from now on it shows where it stands.
try {
  const free = document.createElement('style');
  free.id = 'casora-mchrome-free';
  free.textContent = 'html:not(:has(.hmn-bar)){--casora-mchrome-vis:visible;}';
  document.head.appendChild(free);
} catch (e) { /* no :has() – the capsule stays docked-only */ }
try { window.dispatchEvent(new Event('casora-local-loaded')); } catch (e) { /* old browser */ }
// Cards drawn before a module was there show its helpers' fallbacks (e.g. casoraBadgeOffline from
// 01-basis): draw every card once more, now that all modules ran. casora-core batches it with the
// other passes that come with this event (module 06, changed settings), so it costs one redraw.
try { if (typeof window.casoraKickAll === 'function') window.casoraKickAll('modules-loaded'); } catch (e) { /* the next state push redraws */ }
