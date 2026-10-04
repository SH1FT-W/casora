(function () {
  const REDIRECT_TOGGLE = 'input_boolean.casora_dashboard_redirect';

  const MOBILE_SUFFIX = /[-_]mobile$/i;
  const MOBILE_MQ  = window.matchMedia('(max-width: 767px), (max-height: 500px)');

  function getHass() {
    try { return document.querySelector('home-assistant')?.hass || null; }
    catch (e) { return null; }
  }

  function panelExists(hass, urlPath) {
    return !!(hass && hass.panels &&
      Object.prototype.hasOwnProperty.call(hass.panels, urlPath));
  }

  function pairFor(hass, path) {
    const panel = path.split('/')[1] || '';
    if (!panel) return null;
    const onMobile = MOBILE_SUFFIX.test(panel);
    const desktop  = onMobile ? panel.replace(MOBILE_SUFFIX, '') : panel;
    const mobile   = onMobile ? panel : panel + '-mobile';
    if (!panelExists(hass, desktop) || !panelExists(hass, mobile)) return null;
    return { desktop, mobile, onMobile };
  }

  // ── Redirect ───────────────────────────────────────────────────────────
  function maybeRedirect() {
    const hass = getHass();
    if (hass?.states?.[REDIRECT_TOGGLE]?.state !== 'on') return;

    const path = window.location.pathname;
    const pair = pairFor(hass, path);
    if (!pair) return;

    const wantMobile = MOBILE_MQ.matches;
    if (wantMobile === pair.onMobile) return;

    const target = '/' + (wantMobile ? pair.mobile : pair.desktop) + '/home';
    if (path === target) return;
    window.history.replaceState(null, '', target);
    window.dispatchEvent(new Event('location-changed'));
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  // So früh wie möglich umleiten – sobald hass mit Zuständen da ist, nicht erst
  // beim nächsten Seitenwechsel (sonst baut das falsche Dashboard schon Karten).
  let tries = 0;
  function waitForHA() {
    const hass = getHass();
    if (hass && hass.states && hass.panels) {
      maybeRedirect();
    } else if (tries++ < 600) {
      setTimeout(waitForHA, 16);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForHA);
  } else {
    waitForHA();
  }

  window.addEventListener('location-changed', () => setTimeout(maybeRedirect, 50), true);
  MOBILE_MQ.addEventListener('change', maybeRedirect);
})();
