// Casora – eigene Erweiterungen, Lader.
//
// Die Logik liegt in scripts/local/*.js und wird in fester Reihenfolge
// geladen. Die Reihenfolge ist Absicht: z. B. Geschirrspüler, Drucker und
// Saugroboter (02) bauen auf _casoraLaundry auf, und das Nachzeichnen nach
// spätem Laden (06) muss zuletzt laufen.
//
// Versionierung automatisch: Die Integration hängt an diese Datei ?v=<jüngste
// Änderungszeit aller Module> an; der Wert wird an jedes Modul weitergereicht.
// Nach einer Änderung also nur HA neu starten bzw. die Integration neu laden –
// kein Hochzählen von Hand mehr. Ein Fehler in einem Modul wird gemeldet und
// hält die übrigen nicht auf.
//
// Erstes Laden am Handy (30.09.2026): Dieser Lader ist klein und kommt vor den
// großen Skripten an. Deshalb sitzt hier (nicht mehr in casora-core) der Schutz
// gegen HAs „Konfigurationsfehler“ für noch unbekannte Karten, und das Ende
// meldet er per Ereignis „casora-local-loaded“ – smart-row hält die Raum-
// Abschnitte des Handy-Home so lange verdeckt (siehe dort).

// HA blendet für eine noch unbekannte Karte (casora-mobile-nav kommt erst aus
// den Modulen hier, grid-layout/button-card je nach Ladereihenfolge ebenso spät)
// nach 2 s eine Fehlerkarte ein und ersetzt sie, sobald das Element definiert
// ist. Solche Fehlerkarten bleiben in den ersten 30 s unsichtbar; wird das
// Element nie definiert, erscheint der Fehler danach wie gewohnt.
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
    // HAs 2-s-Timer setzt style.display = "" – den einen Setter hier abfangen.
    try { Object.defineProperty(st, 'display', { configurable: true, get: function () { return 'none'; }, set: function () {} }); } catch (e) { return; }
    var release = function () {
      try { delete st.display; } catch (e) { /* egal */ }
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
      } catch (e) { /* nie die Fehlerkarte selbst brechen */ }
      return r;
    };
  });
})();

const MODULES = [
  '00-finden',
  '01-basis',
  '02-geraete',
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
];

const v = new URL(import.meta.url).searchParams.get('v') || String(Date.now());
// Stand, mit dem diese Seite geladen wurde – casora-core vergleicht ihn mit casora/version
// („Casora wurde aktualisiert“). Seit 1.0.5 enthält er auch die übrigen Casora-Skripte.
if (new URL(import.meta.url).searchParams.get('v')) window.casoraLoadedStamp = v;
const urls = MODULES.map((m) => new URL('./local/' + m + '.js?v=' + v, import.meta.url).href);

/* Alle Module sofort parallel anfordern, danach der Reihe nach ausführen. */
urls.forEach((href) => {
  try {
    const l = document.createElement('link');
    l.rel = 'modulepreload';
    l.href = href;
    document.head.appendChild(l);
  } catch (e) { /* nur Beschleunigung */ }
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* Bis cond() wahr ist (alle 50 ms), höchstens ms lang. */
const until = (cond, ms) => new Promise((resolve) => {
  const t0 = Date.now();
  (function poll() {
    let x = null;
    try { x = cond(); } catch (e) { /* weiter warten */ }
    if (x) return resolve(x);
    if (Date.now() - t0 > ms) return resolve(null);
    setTimeout(poll, 50);
  })();
});

/* Persönliche Einstellungen (window.CASORA_SETTINGS): Studio → „Persönliches“,
   gespeichert in der Integration. Früher /config/www/casora/einstellungen.js – die
   Datei gilt weiter, solange im Studio nichts gespeichert ist. Fehlt beides, gelten
   Casoras neutrale Standards.
   Datei und Integration werden gleichzeitig gefragt (früher nacheinander). Die
   Antwort der Integration wird gemerkt: antwortet sie nicht binnen SETTINGS_WAIT
   (Handy im Mobilfunk, HA beschäftigt), gilt der letzte bekannte Stand, statt dass
   das ganze Dashboard auf sie wartet. */
const SETTINGS_KEY = 'casora.settings.cache';
const SETTINGS_WAIT = 4000;
// /casora_assets liefert die Datei des Nutzers oder – ohne eigene Datei – ein
// leeres Modul. So entsteht kein 404 in der Browser-Konsole.
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
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ stored: !!(r && r.stored), settings: (r && r.settings) || {}, price_kwh: r && r.price_kwh, price_entity: r && r.price_entity })); } catch (e) { /* privat/voll */ }
  return r;
})().catch(() => null); // Ältere Casora-Version ohne Einstellungs-Speicher: Datei (oder nichts) gilt.
const cached = () => { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) { return null; } };

await fileP;
window.CASORA_SETTINGS_FILE = window.CASORA_SETTINGS || null;
const TIMEOUT = {};
let r = await Promise.race([wsP, wait(SETTINGS_WAIT).then(() => TIMEOUT)]);
if (r === TIMEOUT) {
  r = cached();
  console.warn('[casora-local] Einstellungen: keine Antwort in ' + SETTINGS_WAIT + ' ms, ' + (r ? 'letzter bekannter Stand' : 'Datei/Standard') + ' gilt.');
}
if (r && r.stored) window.CASORA_SETTINGS = r.settings || {};
// Strompreis aus den Casora-Optionen, sonst aus HAs Energie-Dashboard (Kosten in Geräte-Popups,
// window.casoraPriceKwh). Bei einer Preis-Entität liest casoraPriceKwh deren Zustand live.
if (r && typeof r.price_kwh === 'number') window.CASORA_PRICE_KWH = r.price_kwh;
if (r && typeof r.price_entity === 'string' && r.price_entity) window.CASORA_PRICE_ENTITY = r.price_entity;

/* Die Module bauen auf casora-core auf (_casoraFilter, casoraMenuGlass, casoraPopup …).
   Es ist eine eigene Ressource und kann am Handy nach diesem Lader fertig werden. */
await until(() => window._casoraFilter, 15000);

for (let i = 0; i < urls.length; i++) {
  try {
    await import(urls[i]);
  } catch (e) {
    console.error('[casora-local] Modul ' + MODULES[i] + ' konnte nicht geladen werden:', e);
  }
}
window._casoraLocalLoaded = MODULES;
try { window.dispatchEvent(new Event('casora-local-loaded')); } catch (e) { /* alt */ }
