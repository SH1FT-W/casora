// Casora – Übergangsschicht für Dashboards, die noch alte Hemma-Namen nutzen.
//
// Nach der Umbenennung heißen Karten, Vorlagen und JS-Helfer „casora…“. Ein nicht
// umgestelltes Dashboard (Dienst casora.umstellen) findet seine Karten und Helfer
// trotzdem: Die alten Element-Namen werden als Alias registriert und die alten
// window-Namen zeigen auf die neuen. Entfällt, sobald alle Dashboards umgestellt sind.
(function () {
  if (window.__casoraKompat) return;
  window.__casoraKompat = true;

  // Ist Hemma selbst noch installiert, bringt es seine hemma-…-Elemente und window.hemma…
  // mit. Dann nichts vorwegnehmen: Ein Alias, der vor Hemmas Skript da ist, lässt dessen
  // customElements.define scheitern („already been used“), und ein window-Zwilling würde
  // Hemmas Zuweisung auf die Casora-Funktion umleiten. HA hängt alle Ressourcen auf
  // einmal ein – diese Datei steht als letzte in der Liste, Hemmas <script> sind also da.
  var HEMMA = !!document.querySelector('script[src*="/hemma_scripts/"], script[src*="/local/hemma/scripts/"]');

  var ELEMENTS = ['casora-filter-overlay', 'casora-mobile-nav', 'casora-nav', 'casora-nav-bar',
    'casora-popup', 'casora-popup-hass', 'casora-smart-row', 'casora-swipe-card'];
  ELEMENTS.forEach(function (name) {
    var old = name.replace(/^casora-/, 'hemma-');
    customElements.whenDefined(name).then(function () {
      // Mit Hemma: abwarten, ob Hemma das Element selbst anmeldet; nur Fehlendes ergänzen.
      return HEMMA ? Promise.race([customElements.whenDefined(old), new Promise(function (r) { setTimeout(r, 10000); })]) : null;
    }).then(function () {
      if (customElements.get(old)) return;
      var C = customElements.get(name);
      try { customElements.define(old, class extends C {}); } catch (e) { /* schon belegt */ }
    });
  });

  // window._casoraX → window._hemmaX, window.casoraX → window.hemmaX, CASORA_X → HEMMA_X
  // Selbst angelegte Zwillinge (Accessoren) – die Gegenrichtung fasst sie nicht an.
  var made = {};
  function twin(key) {
    if (HEMMA) return;
    var old = key.replace(/^_casora/, '_hemma').replace(/^casora/, 'hemma').replace(/^CASORA_/, 'HEMMA_');
    if (old === key || made[key] || Object.prototype.hasOwnProperty.call(window, old)) return;
    try {
      Object.defineProperty(window, old, {
        configurable: true,
        get: function () { return window[key]; },
        set: function (v) { window[key] = v; },
      });
      made[old] = true;
    } catch (e) { /* nicht umlegbar */ }
  }
  // Gegenrichtung (03.10.2026): Eigene Module des Nutzers (z. B. /local/hemma-local/…, als
  // Ressource geladen) setzen noch window._hemmaX, die umgezogenen Vorlagen rufen window._casoraX.
  // Fehlt _casoraX (Casora selbst definiert es nicht), zeigt es auf _hemmaX. Legt ein Casora-Modul
  // _casoraX später selbst an, ersetzt die Zuweisung den Zwilling – Casoras Fassung gewinnt, das
  // Modul des Nutzers bleibt unter seinem alten Namen unberührt.
  function twinBack(key) {
    if (HEMMA || made[key]) return;
    var neu = key.replace(/^_hemma/, '_casora').replace(/^hemma/, 'casora').replace(/^HEMMA_/, 'CASORA_');
    if (neu === key || Object.prototype.hasOwnProperty.call(window, neu)) return;
    try {
      Object.defineProperty(window, neu, {
        configurable: true,
        enumerable: false,
        get: function () { return window[key]; },
        set: function (v) {
          Object.defineProperty(window, neu, { configurable: true, enumerable: true, writable: true, value: v });
          delete made[neu];
        },
      });
      made[neu] = true;
    } catch (e) { /* nicht umlegbar */ }
  }
  function sweep() {
    Object.keys(window).forEach(function (k) {
      if (/^(_casora|casora|CASORA_)/.test(k)) twin(k);
      else if (/^(_hemma|hemma|HEMMA_)/.test(k)) twinBack(k);
    });
  }
  sweep();
  // Module laden nach und nach (casora-local.js, eigene Ressourcen) – mehrmals nachziehen.
  [1000, 3000, 8000, 20000, 45000].forEach(function (ms) { setTimeout(sweep, ms); });
  window.addEventListener('casora-local-loaded', function () { sweep(); });
  window.__casoraKompatSweep = sweep;

  // Theme-Variablen: HA schreibt das aktive Theme inline auf <html>. Das Casora-Theme
  // kennt nur --casora-…, alte Hemma-Dashboards lesen --hemma-…. Ohne Brücke fallen sie
  // auf ihre Fallbacks zurück (z. B. weiße Schrift auf aktiven Karten). Ein echtes
  // Hemma-Theme setzt seine Werte ebenfalls inline und gewinnt damit vor dieser Regel.
  var bridge = document.createElement('style');
  bridge.id = 'casora-kompat-vars';
  var last = '';
  function bridgeVars() {
    var st = document.documentElement.style;
    var own = {};
    var out = [];
    for (var i = 0; i < st.length; i++) if (st[i].indexOf('--hemma-') === 0) own[st[i]] = true;
    for (var j = 0; j < st.length; j++) {
      var k = st[j];
      if (k.indexOf('--casora-') !== 0) continue;
      var old = '--hemma-' + k.slice(9);
      if (!own[old]) out.push(old + ':var(' + k + ')');
    }
    var css = out.length ? ':root{' + out.join(';') + '}' : '';
    if (css === last) return;
    last = css;
    bridge.textContent = css;
    if (!bridge.isConnected) document.head.appendChild(bridge);
  }
  bridgeVars();
  new MutationObserver(bridgeVars).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
})();
