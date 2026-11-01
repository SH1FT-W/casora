// Casora – early fetch of the dashboard's core scripts (Ladezeit stage 3.2).
//
// HA loads this small module on every page right after its own app code (frontend.add_extra_js_url, like
// casora-theme.js). casora-core.js, the translation runtime and the module loader are Lovelace resources:
// HA only asks for them once the frontend is connected and has read the resource list, on a phone seconds
// later. Here they are announced as <link rel="modulepreload"> with exactly the resource URLs (passed in this
// file's own URL as ?u=…), so the browser fetches and compiles them in parallel to HA's frontend. Nothing
// runs here: the Lovelace resource stays the one that runs them, and one URL is one module, so it never
// runs twice. Pages that are no dashboard (settings, developer tools, Studio …) get nothing.
(function () {
  if (window._casoraPreload) return;
  window._casoraPreload = true;
  // First path segment of HA pages that are no Lovelace dashboard.
  var NOT_DASHBOARD = /^\/(config|hacs|developer-tools|hassio|profile|casora-studio|hemma|history|logbook|map|energy|media-browser|todo|calendar|auth|onboarding\.html|api|local)(\/|$)/;
  try {
    if (NOT_DASHBOARD.test(location.pathname)) return;
    // Added to a page that already runs Casora (HA hands new extra modules to open pages after a reload of
    // the integration): that page will not run the new URLs before it reloads.
    if (window.casoraEsc || window._casoraBootErrorGuard) return;
    var own = new URL(import.meta.url);
    var list = (own.searchParams.get('u') || '').split(',').filter(Boolean);
    list.forEach(function (u) {
      var href = new URL(u, location.href);
      // Only Casora's own scripts on this server.
      if (href.origin !== location.origin || href.pathname.indexOf('/casora_scripts/') !== 0) return;
      var l = document.createElement('link');
      l.rel = 'modulepreload';
      l.href = href.href;
      document.head.appendChild(l);
    });
  } catch (e) { /* a speed-up only */ }
})();
