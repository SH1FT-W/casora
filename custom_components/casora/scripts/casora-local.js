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

const MODULES = [
  '00-finder',
  '01-basis',
  '02-devices',
  '03-popups',
  '04-navigation',
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
];

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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
   File and integration are asked at the same time (formerly one after the other). The
   integration's answer is remembered: if it does not answer within SETTINGS_WAIT (phone
   on mobile data, HA busy), the last known state applies instead of the whole dashboard
   waiting for it. */
const SETTINGS_KEY = 'casora.settings.cache';
const SETTINGS_WAIT = 4000;
// /casora_assets serves the user's file or – without one – an empty module.
// So there is no 404 in the browser console.
const fileP = import('/casora_assets/einstellungen.js?t=' + Date.now()).catch((e) => {
  console.error('[casora-local] einstellungen.js konnte nicht geladen werden:', e);
});
const wsP = (async () => {
  const hass = await until(() => {
    const h = document.querySelector('home-assistant');
    return h && h.hass && h.hass.connection ? h.hass : null;
  }, 8000);
  if (!hass) return null;
  const r = await hass.callWS({ type: 'casora/settings/get' });
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ stored: !!(r && r.stored), settings: (r && r.settings) || {}, price_kwh: r && r.price_kwh, price_entity: r && r.price_entity })); } catch (e) { /* private mode / full */ }
  return r;
})().catch(() => null); // Older Casora without a settings store: the file (or nothing) applies.
const cached = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { return null; } };

await fileP;
const TIMEOUT = {};
let r = await Promise.race([wsP, wait(SETTINGS_WAIT).then(() => TIMEOUT)]);
if (r === TIMEOUT) {
  r = cached();
  console.warn('[casora-local] Einstellungen: keine Antwort in ' + SETTINGS_WAIT + ' ms, ' + (r ? 'letzter bekannter Stand' : 'Datei/Standard') + ' gilt.');
}
if (r && r.stored) window.CASORA_SETTINGS = r.settings || {};
// Electricity price from the Casora options, else from HA's energy dashboard (costs in device popups,
// window.casoraPriceKwh). With a price entity casoraPriceKwh reads its state live.
if (r && typeof r.price_kwh === 'number') window.CASORA_PRICE_KWH = r.price_kwh;
if (r && typeof r.price_entity === 'string' && r.price_entity) window.CASORA_PRICE_ENTITY = r.price_entity;

/* The modules build on casora-core (_casoraFilter, casoraMenuGlass, casoraPopup …).
   It is a resource of its own and can finish after this loader on the phone. */
await until(() => window._casoraFilter, 15000);

for (let i = 0; i < urls.length; i++) {
  try {
    await import(urls[i]);
  } catch (e) {
    console.error('[casora-local] Modul ' + MODULES[i] + ' konnte nicht geladen werden:', e);
  }
}
window._casoraLocalLoaded = MODULES;
try { window.dispatchEvent(new Event('casora-local-loaded')); } catch (e) { /* old browser */ }
