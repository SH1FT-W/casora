// ── Mobile-Navigation unten (custom:casora-mobile-nav, 23.09.2026) ─────────────
// Schwebende Glas-Pille wie die Tablet-casora-nav, nur für das Mobile-Dashboard:
// Home (Filter "all" + nach oben), Räume (Menü nach oben → Raum-Overlay über
// input_select.casora_mobile_filter, wie die Raum-Überschriften), Szenen
// (room_scenes). Die Leiste wird an document.body gehängt (kein Stacking-Problem
// mit den Overlays); die Karte selbst ist nur ein Platzhalter/Abstand unten.
// ── Gemeinsame Szenenliste (24.09.2026) ────────────────────────────────────────
// Eine Quelle für: Szenen-Badge im Tablet/Desktop-Header (scene_entities der
// Home-View ruft window.casoraNavScenes auf), Tablet/Desktop-casora-nav und
// Mobile-Nav. Ausschließen über scenes.exclude in den Einstellungen. Automatisch raus: scene.casora*,
// versteckte/deaktivierte Szenen und *_restore_*-Schnappschüsse aus scene.create.
(function () {
  // Eigene Ausschlüsse: scenes.exclude in /config/www/casora/einstellungen.js.
  var SCENE_EXCLUDE = (((window.CASORA_SETTINGS || {}).scenes || {}).exclude || []).slice();
  var RESTORE = /(^|_)restore(_|$)/;
  window.casoraSceneExclude = SCENE_EXCLUDE;
  window.casoraNavScenes = function (hass, extra) {
    var states = (hass && hass.states) || {};
    var reg = (hass && hass.entities) || {};
    var ex = SCENE_EXCLUDE.concat(Array.isArray(extra) ? extra : []);
    var name = function (id) { return (states[id].attributes && states[id].attributes.friendly_name) || id; };
    return Object.keys(states).filter(function (id) {
      if (id.indexOf('scene.') !== 0 || id.indexOf('scene.casora') === 0) return false;
      if (ex.indexOf(id) >= 0 || RESTORE.test(id.slice(6))) return false;
      var e = reg[id];
      return !(e && (e.hidden || e.hidden_by || e.disabled || e.disabled_by));
    }).sort(function (a, b) { return name(a).localeCompare(name(b)); });
  };
  /* casora-nav (casora-core, Tablet/Desktop): Szenenmenü mit derselben Ausschlussliste.
     Nur die Config für den einen Aufruf erweitern, casora-core selbst bleibt unverändert. */
  customElements.whenDefined('casora-nav').then(function () {
    var C = customElements.get('casora-nav');
    if (!C || !C.prototype._menuItems || C.prototype._casoraSceneWrap) return;
    var orig = C.prototype._menuItems;
    C.prototype._casoraSceneWrap = true;
    C.prototype._menuItems = function (route) {
      if (!route || !(route.menu === 'scenes' || !route.popup)) return orig.call(this, route);
      var saved = this._config;
      var cfg = saved || {};
      this._config = Object.assign({}, cfg, { scene_exclude: SCENE_EXCLUDE.concat(cfg.scene_exclude || []) });
      var items;
      try { items = orig.call(this, route); } finally { this._config = saved; }
      return (items || []).filter(function (it) { return !(it.id && RESTORE.test(String(it.id).slice(6))); });
    };
  });
})();

(function () {
  if (customElements.get('casora-mobile-nav')) return;
  var FILTER = 'input_select.casora_mobile_filter';
  /* Beschriftung in der HA-Sprache (Deutsch ist die Quellsprache der Phrasen). */
  var T = function (de) { return window.casoraTr ? window.casoraTr(de) : de; };
  /* SF-Symbol-SVGs aus /casora_assets/icons (bathroom.svg selbst gezeichnet, gleicher Stil). */
  var SFI = '/casora_assets/icons/';
  /* Seitenverhältnis (viewBox B/H) je SVG: gleiche optische Größe statt "contain" (Bett ist breit, Kühlschrank hoch). */
  var SF_RATIO = { 'living-room': 1.147, kitchen: 0.627, desktop: 1.144, bedroom: 1.518, bathroom: 1.048,
    'door-open': 0.716, 'laundry-room': 1.051, plant: 1.154 };
  var ROOM_ICON = { wohnzimmer: SFI + 'living-room.svg', kueche: SFI + 'kitchen.svg', buero: SFI + 'desktop.svg', schlafzimmer: SFI + 'bedroom.svg',
    badezimmer: SFI + 'bathroom.svg', kinderzimmer: SFI + 'kids-room.svg', flur: SFI + 'door-open.svg', hauswirtschaftsraum: SFI + 'laundry-room.svg', terrasse: SFI + 'plant.svg' };

  var css = function () {
    if (document.getElementById('casora-mnav-css')) return;
    var st = document.createElement('style');
    st.id = 'casora-mnav-css';
    st.textContent = ''
      + '.hmn-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(6px + env(safe-area-inset-bottom, 0px) * 0.4);z-index:100;'
      +   'width:min(calc(100vw - 32px), 280px);height:60px;border-radius:30px;box-sizing:border-box;padding:6px;display:flex;gap:4px;'
      +   'background:var(--casora-mnav-bg, rgba(40,40,44,0.55));backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);'
      +   'box-shadow:0 10px 30px -10px rgba(0,0,0,0.55), inset 0 0.5px 0 rgba(255,255,255,0.22);'
      +   'font-family:var(--primary-font-family, system-ui);transition:opacity .3s ease, transform .5s cubic-bezier(.22,1.3,.36,1);}'
      + '.hmn-bar.hmn-hidden{opacity:0;pointer-events:none;transform:translateX(-50%) translateY(calc(100% + 40px));transition:opacity .22s ease .06s, transform .28s cubic-bezier(.4,0,1,1);}'
      + '.hmn-btn{flex:1 1 0;border:0;background:transparent;color:var(--casora-mnav-fg, rgba(255,255,255,0.72));border-radius:24px;display:flex;flex-direction:column;'
      +   'align-items:center;justify-content:center;gap:2px;font:inherit;font-size:11px;font-weight:500;letter-spacing:.01em;'
      +   'cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .2s ease,color .2s ease;}'
      + '.hmn-btn ha-icon{--mdc-icon-size:24px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;line-height:0;}'
      + '.hmn-btn.on{background:var(--casora-mnav-on-fill, rgba(255,255,255,0.14));color:var(--casora-mnav-label-on, var(--casora-mnav-fg-on, #fff));font-weight:var(--casora-mnav-label-on-weight, 500);}'
      + '.hmn-btn .hmn-svg{width:24px;height:24px;display:block;background:currentColor;-webkit-mask:var(--hmn-svg) center/contain no-repeat;mask:var(--hmn-svg) center/contain no-repeat;}'
      + '.hmn-btn.on ha-icon,.hmn-btn.on .hmn-svg{color:var(--casora-mnav-icon-on, var(--casora-color-teal, #00C3D0));}'
      + '.hmn-btn:active{background:var(--casora-mnav-press-fill, rgba(255,255,255,0.20));}'
      + '.hmn-btn>span:not(.hmn-bic){max-width:100%;padding:0 4px;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '.hmn-menu{position:fixed;z-index:152;transform:translateY(8px);opacity:0;'
      +   'bottom:calc(76px + env(safe-area-inset-bottom, 0px) * 0.4);width:max-content;min-width:170px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:var(--casora-mnav-menu-pad, 6px);'
      +   'border-radius:26px;background:var(--casora-mnav-menu-bg, rgba(40,40,44,0.72));backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);'
      +   'box-shadow:0 14px 40px -12px rgba(0,0,0,0.6), inset 0 0.5px 0 rgba(255,255,255,0.22);font-family:var(--primary-font-family, system-ui);'
      +   'transition:opacity .18s ease, transform .22s cubic-bezier(.2,.8,.3,1);max-height:calc(100vh - 160px);overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}'
      + '.hmn-menu.open{opacity:1;transform:translateY(0);}'
      /* Hintergrund-Scrim wie bei den Casora-Popups (gleiche Tönung/Blur, gleiche Kurven; Werte kommen aus dem Theme). */
      + '.hmn-scrim{position:fixed;inset:0;z-index:150;opacity:0;touch-action:none;overscroll-behavior:none;background:var(--hmn-scrim, rgba(0,0,0,0.40));'
      +   'backdrop-filter:var(--hmn-scrim-bd, blur(6px) saturate(1.35));-webkit-backdrop-filter:var(--hmn-scrim-bd, blur(6px) saturate(1.35));'
      +   'transition:opacity 480ms cubic-bezier(0.25, 0.6, 0.3, 1);}'
      /* Scrim muss über der sticky Badge-Karte (z 100) und der Glocken-Pille (z 113) liegen; Leiste nur bei offenem Menü darüber. */
      + '.hmn-bar.hmn-up{z-index:151;}'
      /* Raum-/Kategorie-Seiten scrollen in einer eigenen festen Ebene: Safaris Glas-Unschärfe erfasst sie nicht,
         die Kacheln lagen scharf auf der Leiste. Dort die Leiste fast deckend. */
      + '.hmn-bar.hmn-over{background-color:var(--casora-mnav-pane, var(--casora-mnav-over, rgba(30,33,38,0.9))) !important;}'
      + '.hmn-scrim.open{opacity:1;}'
      + '.hmn-scrim.out{transition-duration:220ms;}'
      + '.hmn-item .hmn-sub{display:block;font-size:12px;line-height:14px;color:var(--casora-mnav-fg-sub, rgba(255,255,255,0.55));margin-top:1px;}'
      + '.hmn-item span{white-space:nowrap;}'
      /* Lange Raumnamen (Stresshaus): mit … kürzen statt über den Menürand zu laufen – 30.09.2026. */
      + '.hmn-item>span{min-width:0;overflow:hidden;text-overflow:ellipsis;}'
      + '.hmn-item{display:grid;grid-template-columns:var(--casora-menu-ic-col, 22px) minmax(0,1fr);align-items:center;column-gap:var(--casora-menu-ic-gap, 14px);width:100%;height:var(--casora-menu-row-h, 48px);min-height:var(--casora-menu-row-h, 48px);padding:var(--casora-mnav-item-pad, 0 20px 0 14px);line-height:19px;'
      +   'border:0;border-radius:var(--casora-mnav-item-radius, var(--casora-menu-item-radius, 20px));background:transparent;color:var(--casora-mnav-fg-on, #fff);font:inherit;font-size:15px;font-weight:var(--casora-menu-item-weight, inherit);text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}'
      + '.hmn-item ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;line-height:0;color:color-mix(in srgb, var(--casora-mi-tone, transparent) var(--casora-menu-tone-mix, 0%), var(--casora-mnav-fg-icon, rgba(255,255,255,0.8)));}'
      + '.hmn-item.on{background:var(--casora-mnav-on-fill, rgba(255,255,255,0.14));}'
      /* Schriftstärke der Menüzeilen: Weich wie die Menüs der Desktop-Raumleiste (normal, aktiv 500). */
      + '.hmn-item{font-weight:var(--casora-mnav-item-weight, var(--casora-menu-item-weight, inherit));}'
      + '.hmn-item.on{font-weight:var(--casora-mnav-item-on-weight, var(--casora-mnav-item-weight, var(--casora-menu-item-weight, inherit)));}'
      + '.hmn-item .hmn-svg{width:20px;height:20px;display:block;background:color-mix(in srgb, var(--casora-mi-tone, transparent) var(--casora-menu-tone-mix, 0%), var(--casora-mnav-fg-icon, rgba(255,255,255,0.8)));-webkit-mask:var(--hmn-svg) center/contain no-repeat;mask:var(--hmn-svg) center/contain no-repeat;}'
      + '.hmn-item.on ha-icon{color:color-mix(in srgb, var(--casora-mi-tone, transparent) var(--casora-menu-tone-mix, 0%), var(--casora-color-teal, #00C3D0));}'
      + '.hmn-item.on .hmn-svg{background:color-mix(in srgb, var(--casora-mi-tone, transparent) var(--casora-menu-tone-mix, 0%), var(--casora-color-teal, #00C3D0));}'

      + '.hmn-item:active{background:var(--casora-mnav-press-fill, rgba(255,255,255,0.20));}'
      /* Weich (1.0.7, Entwurf B „Nur Symbole“): kompakte Kapsel nur mit Symbolen; das aktive Ziel wird zur
         Pille mit Wort. Richtung 1 „Weiße Pille“ (08.10.2026, passend zum C-Blatt): jede Taste trägt den
         Sand-Kreis 36 der C-Zeile (hmn-bic) mit dunkler Glyphe 22; die aktive Taste ist die gewählte C-Zeile –
         weiße Pille (--casora-entity-background-active, weicher Schatten), Kreis in Ton mit weißer Glyphe,
         Name 15/600. Maße bleiben: Platte 60/30, Innenrand 6, Tasten 58 × 48, Radius 24 = 30 − 6,
         Kreis 18 = 24 − 6 (konzentrisch). Klasse hmn-ic setzt _render(), solange das Weich-Design aktiv ist. */
      + '.hmn-bic{display:contents;}'
      + '.hmn-bar.hmn-ic{width:auto;max-width:calc(100vw - 32px);gap:2px;}'
      + '.hmn-bar.hmn-ic .hmn-btn{flex:none;width:58px;flex-direction:row;gap:10px;padding:0;}'
      + '.hmn-bar.hmn-ic .hmn-btn>span:not(.hmn-bic){display:none;}'
      + '.hmn-bar.hmn-ic .hmn-bic{display:flex;flex:none;box-sizing:border-box;width:36px;height:36px;border-radius:50%;align-items:center;justify-content:center;'
      +   'background:var(--casora-icon-circle-bg, rgba(140,115,90,0.12));color:var(--casora-popup-tiles-text-primary, var(--casora-mnav-fg, currentColor));transition:background .2s ease,color .2s ease;}'
      + '.hmn-bar.hmn-ic .hmn-bic ha-icon{--mdc-icon-size:22px;width:22px;height:22px;color:inherit;}'
      + '.hmn-bar.hmn-ic .hmn-bic .hmn-svg{width:22px;height:22px;color:inherit;background:currentColor;}'
      + '.hmn-bar.hmn-ic .hmn-btn.on{width:auto;min-width:58px;padding:0 18px 0 6px;'
      +   'background:var(--casora-entity-background-active, var(--casora-mnav-pill, #FFFDF9));color:var(--casora-entity-name-active, var(--casora-mnav-pill-ink, #2E2721));'
      +   'box-shadow:var(--button-card-box-shadow-active-mobile, none);}'
      + '.hmn-bar.hmn-ic .hmn-btn.on .hmn-bic{background:var(--primary-color, #B67A50);color:#fff;}'
      + '.hmn-bar.hmn-ic .hmn-btn.on>span:not(.hmn-bic){display:block;font-size:15px;font-weight:600;padding:0;letter-spacing:-0.01em;max-width:150px;}'
      + '.hmn-bar.hmn-ic .hmn-btn:not(.on):active{background:var(--casora-mnav-press-fill, rgba(255,255,255,0.20));}'
      + '.hmn-bar.hmn-ic .hmn-btn.on:active{filter:brightness(.94);}'
      /* Casora/Weich (Richtung C „Leicht“, 08.10.2026): Räume und Szenen als Blatt wie ein Casora-Handy-Popup –
         volle Breite, unten bündig, nur oben rund (--casora-sheet-radius), Griff wie der Popup-Griff, Titel
         mittig mit Etikett. Zeilen 52 px ohne Platten (Pille 26 = Kreis 18 + 8 Innenabstand, konzentrisch);
         nur der offene Raum bekommt die Fläche der gewählten Popup-Zeile.
         Die Klasse hmn-sheet setzt _openSheet(), nur solange das Weich-Design aktiv ist. */
      + '.hmn-menu.hmn-sheet{left:0;right:0;bottom:0;margin:0 auto;width:auto;min-width:0;max-width:520px;padding:0;overscroll-behavior:contain;'
      +   'border-radius:var(--casora-sheet-radius, 24px) var(--casora-sheet-radius, 24px) 0 0 !important;box-shadow:none !important;'
      +   'display:flex;flex-direction:column;overflow:hidden;opacity:1;'
      +   'max-height:calc(100vh - max(env(safe-area-inset-top, 0px), 12px) - 40px);'
      +   'max-height:calc(100dvh - max(env(safe-area-inset-top, 0px), 12px) - 40px);'
      +   'transform:translateY(calc(100% + 24px));transition:transform .34s cubic-bezier(.2,.9,.25,1);color:var(--casora-mnav-fg-on, #fff);}'
      + '.hmn-menu.hmn-sheet.open{transform:translateY(0);}'
      /* Die Leiste liegt unter dem Blatt und schien durch dessen Glasfläche – solange es offen ist, ausblenden. */
      + '.hmn-bar.hmn-under{opacity:0;pointer-events:none;}'
      + '.hmn-menu.hmn-sheet.hmn-drag{transition:none;}'
      + '.hmn-grip{flex:none;width:36px;height:4px;border-radius:2px;margin:10px auto 0;background:var(--casora-popup-grabber, var(--casora-soft-grabber, rgba(120,100,80,0.30)));}'
      + '.hmn-head{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 20px 6px;'
      +   'touch-action:none;cursor:grab;}'
      + '.hmn-title{font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.02em;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis;}'
      + '.hmn-count{font-size:12px;line-height:16px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;'
      +   'color:var(--casora-soft-label, var(--casora-mnav-fg-sub, rgba(255,255,255,0.55)));}'
      /* Liste: 10 px Luft zum Blattrand; position:relative, damit offsetTop der Zeilen in der Liste zählt (Mittigstellen). */
      + '.hmn-list{position:relative;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;'
      +   'padding:8px 10px max(10px, env(safe-area-inset-bottom, 0px));box-sizing:border-box;}'
      + '.hmn-empty{padding:4px 10px 12px;font-size:15px;color:var(--casora-mnav-fg-sub, rgba(255,255,255,0.55));}'
      /* Zeile (Räume und Szenen gleich): Kreis 36 | Name | Zustand rechts. Innenabstand links 8 wie
         Kreis-Radius 18 zur Pille 26; Abstand Kreis–Text ebenfalls 8. */
      + '.hmn-sheet .hmn-item.hmn-row{grid-template-columns:36px minmax(0,1fr) auto;column-gap:8px;height:52px;min-height:52px;'
      +   'padding:0 14px 0 8px;border-radius:26px;font-size:15px;line-height:20px;letter-spacing:-0.01em;background:transparent;'
      +   'font-weight:600;transition:transform .14s ease, background-color .14s ease;}'
      /* Offener Raum = gewählte Popup-Zeile: Weiß mit weichem Schatten, Name/Zustand in den Aktiv-Farben. */
      + '.hmn-sheet .hmn-item.hmn-row.on{font-weight:600;background:var(--casora-entity-background-active, var(--casora-mnav-on-fill, rgba(255,255,255,0.14)));'
      +   'box-shadow:var(--button-card-box-shadow-active-mobile, none);color:var(--casora-entity-name-active, inherit);}'
      /* Symbolkreis im Blatt: eigene Klasse hmn-sic – „hmn-ic“ trägt im Weich-Design die Leiste selbst,
         die Regel hatte sie in 1.1.1 auf 40 px Höhe, rund und eingefärbt gezogen (Hotfix 1.1.2).
         Räume: Sand-Kreis mit dunkler Glyphe wie die Popup-Zeilen, Ton nur im offenen Raum.
         Szenen (hmn-tone): Kreis in der Studio-Farbe der Szene (_sceneTone), weiße Glyphe. */
      + '.hmn-sic{flex:none;box-sizing:border-box;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
      +   'background:var(--casora-icon-circle-bg, rgba(140,115,90,0.12));color:var(--casora-popup-tiles-text-primary, currentColor);}'
      + '.hmn-sheet .hmn-item .hmn-sic ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;line-height:0;color:inherit;}'
      + '.hmn-sheet .hmn-item .hmn-sic .hmn-svg{width:20px;height:20px;display:block;background:currentColor;-webkit-mask:var(--hmn-svg) center/contain no-repeat;mask:var(--hmn-svg) center/contain no-repeat;}'
      + '.hmn-row.on .hmn-sic,.hmn-row.hmn-tone .hmn-sic{background:var(--hmn-tone, var(--primary-color, #B67A50));color:var(--casora-msheet-on-ink, #fff);}'
      + '.hmn-txt{display:flex;flex-direction:column;min-width:0;}'
      + '.hmn-name{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      /* Zustand rechts als kleiner Wert in Text 2 (wie ein Badge-Wert); im offenen Raum in der Aktiv-Zustandsfarbe. */
      + '.hmn-sheet .hmn-sub{display:block;min-width:0;max-width:46%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:16px;font-weight:500;'
      +   'margin:0;font-variant-numeric:tabular-nums;color:var(--casora-text-2, var(--casora-mnav-fg-sub, rgba(255,255,255,0.55)));}'
      + '.hmn-sheet .hmn-sub.hmn-warn{color:var(--casora-popup-ui-warn, #D9822B);font-weight:600;}'
      + '.hmn-sheet .hmn-sub.hmn-warn::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:6px;vertical-align:1px;}'
      + '.hmn-sheet .hmn-row.on .hmn-sub{color:var(--casora-entity-state-active-color, var(--casora-text-2, inherit));}'
      /* Tipp-Rückmeldung wie die Popup-Zeilen: Fläche hinterlegen und leicht schrumpfen (auch per Klasse, falls :active am Handy nicht greift). */
      + '.hmn-sheet .hmn-item.hmn-row:active,.hmn-sheet .hmn-item.hmn-row.hmn-press{background:var(--casora-mnav-press-fill, rgba(255,255,255,0.20));transform:scale(.985);}'
      + '.hmn-sheet .hmn-item.hmn-row.on:active,.hmn-sheet .hmn-item.hmn-row.on.hmn-press{background:var(--casora-entity-background-active, var(--casora-mnav-on-fill, rgba(255,255,255,0.14)));filter:brightness(.97);}';
    document.head.appendChild(st);
  };

  var PRELOADED = {};
  class CasoraMobileNav extends HTMLElement {
    setConfig(cfg) { this._cfg = cfg || {}; this._rooms = cfg.rooms || []; this._homeText(); this._preload(); }
    /* Raum-Symbole vorab laden (Nutzertest 06.10.2026): beim ersten Öffnen des Räume-Menüs standen sonst
       kurz leere Kreise da, bis die SVGs (mask-image) aus dem Netz kamen. */
    _preload() {
      var self = this;
      setTimeout(function () {
        (self._rooms || []).forEach(function (r) {
          var ic; try { ic = self._roomIcon(r); } catch (e) { return; }
          if (ic && ic.charAt(0) === '/' && !PRELOADED[ic]) { PRELOADED[ic] = new Image(); PRELOADED[ic].src = ic; }
        });
      }, 0);
    }
    /* Home-Knopf heißt wie die Übersicht: eigener Name (home_label, vom Studio gesetzt) wie getippt,
       sonst „Home“ übersetzt („Zuhause“) – wie die Pille der Desktop-Leiste. */
    _homeText() {
      var s = this._bHome && this._bHome.querySelector(':scope > span:not(.hmn-bic)');
      if (!s) return;
      var own = this._cfg && typeof this._cfg.home_label === 'string' ? this._cfg.home_label.trim() : '';
      /* Regel wie überall (casoraRoomName): übersetzt nur mit home_auto (von Casora angelegt,
         unverändert); ohne Markierung steht „Home“ wie gespeichert (04.10.2026). */
      var r = window.casoraRoomName ? window.casoraRoomName(own || 'Home',
        { casora_auto_name: !own && this._cfg && this._cfg.home_auto ? 'home' : undefined, name_literal: !!own }) : null;
      var t = r ? r.text : (own || T('Home'));
      if (r && r.literal) s.setAttribute('data-no-i18n', ''); else s.removeAttribute('data-no-i18n');
      if (s.textContent !== t) s.textContent = t;
      if (this._bHome.getAttribute('aria-label') !== t) this._bHome.setAttribute('aria-label', t);
    }
    getCardSize() { return 1; }
    connectedCallback() {
      css();
      /* Platzhalter im Fluss: Abstand unten, damit die letzte Kachel nicht unter der Leiste liegt. */
      this.style.display = 'block';
      this.style.height = 'calc(84px + env(safe-area-inset-bottom, 0px))';
      if (!this._bar) this._build();
      if (!this._bar.isConnected) document.body.appendChild(this._bar);
      /* Raum-/Kategorie-Seiten (filter-overlay) scrollen in einem eigenen Fenster: ohne diesen Platz
         unten bleibt die letzte Kachelreihe dauerhaft unter der Leiste liegen. */
      document.documentElement.style.setProperty('--casora-mobile-nav-space', 'calc(84px + env(safe-area-inset-bottom, 0px))');
      this._bindScroll();
      this._bindIdle();
      if (window._casoraFilter && !this._fOff) { var me = this; this._fOff = window._casoraFilter.onChange(function () { me._render(); }); }
      this._render();
    }
    /* Wie Tablet-Auto-Home: nach idle_home_minutes (Standard 2, 0 = aus) ohne Bedienung zurück zu Home.
       Nur wenn DIESES Gerät die aktuelle Ansicht gewählt hat (_mine) – der Filter-Helfer ist geräteübergreifend,
       ein ruhendes Handy soll kein anderes aus dem Raum werfen. Ein offenes Casora-Popup hält den Timer an. */
    _bindIdle() {
      if (this._idleIv) return;
      var self = this;
      this._lastAct = Date.now();
      this._bump = function (e) { self._lastAct = Date.now(); if (e) self._tapAt = self._lastAct; };
      ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(function (t) { window.addEventListener(t, self._bump, { capture: true, passive: true }); });
      this._idleCheck = function () {
        var min = self._cfg.idle_home_minutes != null ? Number(self._cfg.idle_home_minutes) : 2;
        var cur = self._cur();
        if (!min || !self.isConnected || cur === 'all' || cur !== self._mine) { self._bump(); return; }
        if (window.casoraPopup && window.casoraPopup.surface) { self._bump(); return; }
        if (Date.now() - self._lastAct < min * 60000) return;
        self._closeMenu(); self._set('all'); self._mine = null;
        try { window.scrollTo(0, 0); } catch (e) {}
        self._bump();
      };
      this._idleIv = setInterval(this._idleCheck, 10000);
      this._onVis = function () { if (!document.hidden) self._idleCheck(); };
      document.addEventListener('visibilitychange', this._onVis);
    }
    /* Beim Runterscrollen ausblenden, beim Hochscrollen/oben wieder zeigen. Capture auf document
       fängt Fenster-Scroll und den eigenen Scroll-Container der Raum-Overlays; horizontale
       Reihen ändern scrollTop nicht und lösen nichts aus. */
    _bindScroll() {
      if (this._onScroll) return;
      var self = this, last = new WeakMap();
      this._onScroll = function (e) {
        var t = e.target, el = (t === document || t === document.documentElement || t === document.body) ? null : t;
        var y = el ? el.scrollTop : (window.scrollY || document.documentElement.scrollTop || 0);
        var key = el || window, prev = last.has(key) ? last.get(key) : y;
        last.set(key, y);
        var d = y - prev;
        clearTimeout(self._idleT);
        self._idleT = setTimeout(function () { self._hide(false); }, 450);
        if (Math.abs(d) < 6 || self._menu) return;
        self._hide(d > 0 && y > 40);
      };
      document.addEventListener('scroll', this._onScroll, { capture: true, passive: true });
    }
    /* Raum-/Kategorie-Overlays scrollen in einem eigenen Container im Shadow-DOM der äußeren Reihe –
       scroll ist nicht composed und kommt am document nie an. Deshalb direkt an jedes _overlayEl hängen. */
    _bindOverlays() {
      if (!this._onScroll) return;
      var self = this, seen = this._ovSeen = this._ovSeen || new WeakSet();
      Array.from(window._casoraSmartRows || []).forEach(function (r) {
        if (!r.shadowRoot) return;
        Array.prototype.forEach.call(r.shadowRoot.querySelectorAll('casora-filter-overlay'), function (fo) {
          var el = fo._overlayEl;
          if (el && !seen.has(el)) { seen.add(el); el.addEventListener('scroll', self._onScroll, { passive: true }); }
        });
      });
    }
    _hide(on) { if (this._bar) this._bar.classList.toggle('hmn-hidden', !!on); }
    disconnectedCallback() {
      var self = this;
      /* Nur entfernen, wenn die Karte wirklich weg ist (Dashboard gewechselt), nicht bei kurzem Umhängen. */
      setTimeout(function () { if (!self.isConnected) { self._closeMenu(); if (self._bar && self._bar.parentNode) self._bar.remove();
        document.documentElement.style.removeProperty('--casora-mobile-nav-space');
        if (self._fOff) { self._fOff(); self._fOff = null; }
        if (self._onScroll) { document.removeEventListener('scroll', self._onScroll, true); self._onScroll = null; }
        if (self._idleIv) { clearInterval(self._idleIv); self._idleIv = null; document.removeEventListener('visibilitychange', self._onVis);
          ['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(function (t) { window.removeEventListener(t, self._bump, true); }); } } }, 400);
    }
    set hass(h) { this._hass = h; this._render(); if (this._menu && this._menu._sheetRefresh) this._menu._sheetRefresh(); if (!this._scPre) { this._scPre = true; try { this._sceneCfg(); } catch (e) {} } }
    _haptic() { try { this.dispatchEvent(new CustomEvent('haptic', { detail: 'light', bubbles: true, composed: true })); } catch (e) {} }
    _set(opt) {
      if (!this._hass) return;
      /* Optimistisch: Markierung sofort umschalten, nicht erst wenn HA den neuen Filter zurückmeldet. */
      this._pend = opt; this._pendT = Date.now() + 3000; this._mine = opt;
      this._render();
      /* Der Filter gilt pro Gerät (window._casoraFilter); der Helfer wird nur noch gespiegelt. */
      var HF = window._casoraFilter;
      if (HF) { HF.set(opt); HF.share(this._hass, opt); }
      else this._hass.callService('input_select', 'select_option', { entity_id: FILTER, option: opt });
    }
    _cur() {
      var HF = window._casoraFilter;
      var real = HF ? HF.get() : (this._hass && this._hass.states[FILTER] ? this._hass.states[FILTER].state : 'all');
      if (this._pend != null) { if (real === this._pend || Date.now() > this._pendT) this._pend = null; else return this._pend; }
      return real;
    }
    _build() {
      var self = this;
      var bar = this._bar = document.createElement('div');
      bar.className = 'hmn-bar';
      /* Gleicher Glas-Look wie Casoras Punkte-Menü / Nav-Menüs (casoraMenuGlass), eigener Radius. */
      if (window.casoraMenuGlass) { window.casoraMenuGlass.apply(bar); bar.style.borderRadius = '30px'; }
      /* Weich (04.10.2026, Variante B): Leiste hebt sich klar von den Kacheln ab, im Dunklen ohne hellen Rand.
         Ohne die Theme-Variablen bleibt der Glas-Look von oben. */
      bar.style.backgroundColor = 'var(--casora-mnav-pane, ' + (bar.style.backgroundColor || 'transparent') + ')';
      bar.style.boxShadow = 'var(--casora-mnav-shadow, ' + (bar.style.boxShadow || 'none') + ')';
      bar.style.backdropFilter = 'var(--casora-mnav-blur, ' + (bar.style.backdropFilter || 'none') + ')';
      bar.style.webkitBackdropFilter = 'var(--casora-mnav-blur, ' + (bar.style.webkitBackdropFilter || 'none') + ')';
      var mk = function (key, icon, label) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'hmn-btn'; b.setAttribute('data-k', key);
        /* Symbol in einer Hülle (hmn-bic): ohne Weich-Design display:contents, in Weich der Sand-Kreis. */
        b.innerHTML = '<span class="hmn-bic">' + self._iconHtml(icon) + '</span><span>' + (window.casoraTr || function (x) { return x; })(label) + '</span>';
        b._icon = icon;
        b.setAttribute('aria-label', (window.casoraTr || function (x) { return x; })(label));
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self._haptic(); self._tap(key, b); });
        bar.appendChild(b);
        return b;
      };
      this._bHome = mk('home', 'mdi:home-variant', 'Home');
      this._homeText();
      this._bRooms = mk('rooms', '/casora_assets/icons/rooms.svg?v=3', T('Räume'));
      this._bScenes = mk('scenes', 'mdi:palette-outline', T('Szenen'));
    }
    /* Pfad statt mdi: → SF-Symbol-SVG aus /casora_assets/icons per mask-image (ha-icon hat unberechenbare Innenmaße). */
    _iconHtml(icon) {
      var r = SF_RATIO[(icon.match(/([^/]+)\.svg/) || [])[1]], G = 78;
      var ms = r ? ';-webkit-mask-size:' + (G * Math.sqrt(r)).toFixed(1) + '% ' + (G / Math.sqrt(r)).toFixed(1) + '%;mask-size:' + (G * Math.sqrt(r)).toFixed(1) + '% ' + (G / Math.sqrt(r)).toFixed(1) + '%' : '';
      return icon.charAt(0) === '/' ? '<i class="hmn-svg" style="--hmn-svg:url(\'' + icon + '\')' + ms + '"></i>' : '<ha-icon icon="' + icon + '"></ha-icon>';
    }
    _roomIcon(r) { return r.icon || ROOM_ICON[r.key.replace(/^room_/, '')] || 'mdi:door'; }
    _tap(key) {
      if (key === 'rooms' || key === 'scenes') {
        var same = this._menu && this._menuKind === key;
        this._closeMenu();
        if (!same) this._openMenu(key);
        return;
      }
      this._closeMenu();
      if (key === 'home') {
        this._set('all');
        try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
      }
    }
    _items(kind) {
      var self = this, h = this._hass, cur = this._cur();
      if (kind === 'rooms') return this._rooms.filter(window.casoraSeesRoute || function () { return true; }).map(function (r) {
        return { key: r.key, icon: self._roomIcon(r), label: r.label || r.name, on: cur === r.key, run: function () { self._set(r.key); } };
      });
      /* Szenen: nur die Szenen aus window.casoraNavScenes (gemeinsame Liste oben), ohne "Alle Szenen" (24.09.2026). */
      var ago = function (ts) { var q = Date.parse(ts); if (isNaN(q)) return ''; var m = Math.max(0, Math.round((Date.now() - q) / 60000));
        return m < 1 ? 'Gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + (window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.round(m / 1440)) + ' T.'; };
      var list = [];
      /* Auswahl der Szenen-Badge (Desktop/Tablet), 1.0.5: das Studio schreibt sie beim Speichern an
         die Leiste; ältere Handy-Dashboards ohne sie lesen sie aus dem Desktop-Dashboard (_deskScenes). */
      var sc = this._sceneCfg();
      var ids = window.casoraNavScenes(h, sc.scene_exclude);
      if (Array.isArray(sc.scenes) && sc.scenes.length) {
        var pick = sc.scenes.filter(function (id) { return h.states[id]; });
        if (pick.length) ids = pick.filter(function (id) { return (sc.scene_exclude || []).indexOf(id) < 0; });
      }
      /* Reihenfolge wie die Szenen-Badges (scene_order zuerst, dann alphabetisch) – 30.09.2026. */
      var so = Array.isArray(sc.scene_order) ? sc.scene_order : [];
      if (so.length) {
        var at = function (x) { var i = so.indexOf(x); return i < 0 ? 999 : i; };
        ids = ids.map(function (id, i) { return [id, i]; })
          .sort(function (a, b) { return (at(a[0]) - at(b[0])) || (a[1] - b[1]); })
          .map(function (p) { return p[0]; });
      }
      /* In einem Raum nur dessen Szenen (30.09.2026): Bereich gleichen Namens (Szene oder ihr Gerät),
         sonst Raumname im Szenennamen. Passt keine, bleibt die ganze Liste statt eines leeren Menüs. */
      var room = /^room_/.test(cur) && cur !== 'room_scenes' ? this._rooms.filter(function (r) { return r.key === cur; })[0] : null;
      if (room) {
        var want = [room.name, room.label].filter(Boolean).map(function (x) { return String(x).trim().toLowerCase(); });
        var areas = h.areas || {}, reg = h.entities || {}, devs = h.devices || {};
        var aids = Object.keys(areas).filter(function (a) { return want.indexOf(String(areas[a].name || '').trim().toLowerCase()) > -1; });
        var inRoom = ids.filter(function (id) {
          var e = reg[id], aid = e && (e.area_id || (e.device_id && devs[e.device_id] ? devs[e.device_id].area_id : null));
          if (aid) return aids.indexOf(aid) > -1;
          var n = String((h.states[id].attributes && h.states[id].attributes.friendly_name) || id).toLowerCase();
          return want.some(function (w) { return w && n.indexOf(w) > -1; });
        });
        if (inRoom.length) ids = inRoom;
      }
      ids.forEach(function (id) {
        var st = h.states[id];
        var sic = (st.attributes && st.attributes.icon) || 'mdi:palette-outline';
        if (window.casoraFilledIcon) sic = window.casoraFilledIcon(sic);
        list.push({ id: id, icon: sic, label: (st.attributes && st.attributes.friendly_name) || id,
          color: window.casoraSceneColor ? window.casoraSceneColor(id) : null,
          run: function () { h.callService('scene', 'turn_on', { entity_id: id }); } });
      });
      return list;
    }
    /* Eigene Szenen-Schlüssel der Leiste, sonst die der Startseite des Desktop-Dashboards
       (<name>-mobile → <name>): Heldenkarte der ersten Ansicht, dann casora_scene_row. Einmal je Seite. */
    _sceneCfg() {
      var c = this._cfg || {};
      var has = function (o) { return o && ['scenes', 'scene_exclude', 'scene_order'].some(function (k) { return Array.isArray(o[k]) && o[k].length; }); };
      if (has(c) || 'scene_order' in c || 'scene_exclude' in c) return c;
      var D = window._casoraDeskScenes = window._casoraDeskScenes || {};
      var seg = String(location.pathname || '').split('/')[1] || '';
      var desk = /[-_]mobile$/i.test(seg) ? seg.replace(/[-_]mobile$/i, '') : '';
      if (!desk || !this._hass || !this._hass.connection) return c;
      if (D[desk] === undefined) {
        D[desk] = null;
        var self = this;
        this._hass.connection.sendMessagePromise({ type: 'lovelace/config', url_path: desk }).then(function (cfg) {
          var v0 = ((((cfg || {}).views || [])[0] || {}).cards || [])[0];
          var t = ((cfg || {}).button_card_templates || {}).casora_scene_row;
          var src = [v0 && v0.variables, t && t.variables].filter(has)[0] || {};
          D[desk] = { scenes: src.scenes, scene_exclude: src.scene_exclude, scene_order: src.scene_order };
          if (self._menu && self._menuKind === 'scenes') { self._closeMenu(); self._openMenu('scenes'); }
        }, function () { D[desk] = {}; });
      }
      return D[desk] || c;
    }
    _openMenu(kind) {
      if (window._casoraSoft && window._casoraSoft()) return this._openSheet(kind);
      var self = this;
      var m = this._menu = document.createElement('div');
      this._menuKind = kind;
      m.className = 'hmn-menu';
      if (window.casoraMenuGlass) window.casoraMenuGlass.apply(m);
      /* Weich: Fläche und Schatten wie die Menüs der Desktop-Raumleiste. Ohne die Theme-Variablen
         bleibt der Glas-Look von oben. */
      /* Handy-WebKit: die deckende Fläche aus casoraMenuGlass behalten (D-01) – sonst schien die Seite durch. */
      var bg0 = m.style.backgroundColor || 'transparent';
      if (bg0.indexOf('menu-pane-webkit') < 0) m.style.backgroundColor = 'var(--casora-mnav-menu-pane, ' + bg0 + ')';
      m.style.setProperty('--casora-menu-shadow', 'var(--casora-mnav-menu-shadow, var(--casora-elevation-floating-phone, 0 10px 26px rgba(0,0,0,0.18)))');
      this._items(kind).forEach(function (it) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'hmn-item' + (it.on ? ' on' : '');
        b.title = String(it.label || '');
        var ic = self._iconHtml(it.icon);
        if (window.casoraMenuGlass && window.casoraMenuGlass.iconHtml) ic = window.casoraMenuGlass.iconHtml(ic, kind === 'scenes' ? 'light' : 'general');
        /* Szene mit Studio-Farbe: Symbolton in dieser Farbe (B-SZENE). */
        if (it.color) ic = ic.replace(/^<span class="casora-mi"[^>]*>/, '<span class="casora-mi" style="--casora-mi-tone:' + String(it.color).replace(/["<>;{}]/g, '') + '">');
        b.innerHTML = ic + '<span>' + (window.casoraTr || function (x) { return x; })(it.label) + (it.sub ? '<span class="hmn-sub">' + it.sub + '</span>' : '') + '</span>';
        b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); self._haptic(); self._closeMenu(); it.run(); });
        m.appendChild(b);
      });
      this._scrimOpen();
      document.body.appendChild(m);
      /* Erst die Leiste neu zeichnen, dann messen: in Weich (hmn-ic) wird die getippte Taste beim Öffnen
         zur breiten Ton-Pille mit Wort und die Kapsel zentriert sich neu – mit den alten Maßen saß das
         Menü bis zu 35 px neben der Taste (05.10.2026). */
      this._render();
      /* Über dem eigenen Knopf ausrichten, am Bildschirmrand begrenzen; Breite = Inhalt. */
      var btn = kind === 'rooms' ? this._bRooms : this._bScenes;
      var r = btn.getBoundingClientRect(), w = m.offsetWidth;
      m.style.left = Math.round(Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12))) + 'px';
      /* Mehr Einträge als Platz (z. B. 27 Räume am iPhone): die Liste scrollt, aber ohne Hinweis sahen die
         unteren Räume wie „fehlend“ aus. Höhe so kürzen, dass die letzte sichtbare Zeile halb angeschnitten ist
         (Scroll-Hinweis wie in iOS), und den offenen Raum in die Mitte holen – 30.09.2026. */
      if (m.scrollHeight > m.clientHeight + 1 && m.firstElementChild) {
        var rowH = m.firstElementChild.offsetHeight || 48, pad = parseFloat(getComputedStyle(m).paddingTop) || 6;
        var k = Math.max(1, Math.floor((m.clientHeight - 2 * pad - rowH * 0.5) / rowH));
        m.style.maxHeight = Math.round(pad + k * rowH + rowH * 0.5) + 'px';
        var on = m.querySelector('.hmn-item.on');
        if (on) m.scrollTop = Math.max(0, on.offsetTop - (m.clientHeight - rowH) / 2);
      }
      requestAnimationFrame(function () { m.classList.add('open'); });
      this._away = function (e) {
        /* Ganzen Pfad prüfen: ein Tipp aufs Icon endet im Shadow-DOM von ha-icon, btn.contains() sähe ihn als "außen" –
           dann schloss pointerdown das Menü und der folgende click öffnete es sofort wieder (kein Toggle). */
        var path = e.composedPath ? e.composedPath() : [e.target];
        if (path.indexOf(m) < 0 && path.indexOf(self._bRooms) < 0 && path.indexOf(self._bScenes) < 0) self._closeMenu();
      };
      setTimeout(function () { document.addEventListener('pointerdown', self._away, true); }, 0);
    }
    /* Hintergrund-Scrim für Menü und Blatt (Werte wie die Casora-Popups). */
    _scrimOpen() {
      var sc = this._scrim = document.createElement('div');
      sc.className = 'hmn-scrim';
      /* Wischen auf dem abgedunkelten Hintergrund scrollt die Seite darunter nicht (Hotfix 1.1.2). */
      sc.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
      try {
        var cs = getComputedStyle(document.querySelector('home-assistant') || document.documentElement);
        var sv = (cs.getPropertyValue('--casora-popup-scrim') || cs.getPropertyValue('--mdc-dialog-scrim-color')).trim();
        var bv = (cs.getPropertyValue('--casora-popup-scrim-backdrop') || cs.getPropertyValue('--casora-scrim-backdrop')).trim();
        if (sv) sc.style.setProperty('--hmn-scrim', sv);
        if (bv) sc.style.setProperty('--hmn-scrim-bd', bv);
      } catch (e) {}
      document.body.appendChild(sc);
      if (this._bar) this._bar.classList.add('hmn-up');
      requestAnimationFrame(function () { sc.classList.add('open'); });
    }
    /* room_chips der Raumseiten (casora_mobile_sensor_chips im Handy-Layout) – daraus und aus dem
       Desktop-Raum (casoraPhoneRoom) kommen dieselben Werte wie für die Raum-Badges. */
    _chips() {
      var rows = Array.from(window._casoraSmartRows || []);
      for (var i = 0; i < rows.length; i++) {
        var cards = (rows[i]._config && rows[i]._config.cards) || [];
        for (var j = 0; j < cards.length; j++) {
          var c = cards[j], t = c && c.template;
          if (t === 'casora_mobile_sensor_chips' || (Array.isArray(t) && t.indexOf('casora_mobile_sensor_chips') >= 0)) {
            return (c.variables && c.variables.room_chips) || null;
          }
        }
      }
      return null;
    }
    /* Zustandszeile einer Raumzeile („1 Licht an · 22°“, „Alles aus · 21°“): nur aus den Werten der
       Raum-Badges (Lichter wie casora_badge_light_group, Temperatur wie casora_badge_climate_group).
       Ohne Lichter und Temperatur bleibt die Zeile leer – nichts erfinden. */
    /* „Vor 5 Min.“, „Gestern“ … wie casora_badge_scene (Szenen-Zustand = Zeitpunkt der letzten Ausführung). */
    _sceneAgo(id) {
      var st = this._hass && this._hass.states[id];
      var t = Date.parse(st && st.state), tr = window.casoraTr || function (x) { return x; };
      if (!isFinite(t)) return tr('Noch nie');
      var m = Math.round((Date.now() - t) / 60000);
      if (m < 1) return tr('Gerade eben');
      if (m < 60) return tr('Vor ' + m + ' Min.');
      var h = Math.round(m / 60);
      var day = function (x) { var o = new Date(x); return new Date(o.getFullYear(), o.getMonth(), o.getDate()); };
      var d = Math.round((day(Date.now()) - day(t)) / 86400000);
      if (h < 24 || d < 1) return tr('Vor ' + h + ' Std.');
      return tr(d === 1 ? 'Gestern' : 'Vor ' + d + ' Tagen');
    }
    /* Rechts je Raum nur das Auffälligste (Vorschlag 1, 08.10.2026), sonst nichts: Fenster/Tür offen
       (orange) vor Licht an vor feuchter Luft. Alles aus den Werten der Raum-Badges – nichts erfinden.
       Laufende Geräte bewusst nicht: Leistungswerte allein sagen das nicht verlässlich (Kühlschrank). */
    _roomSub(key, chips) {
      var r = this._roomNote(key, chips);
      return r ? r.text : '';
    }
    _roomNote(key, chips) {
      var PR = window.casoraPhoneRoom, h = this._hass;
      if (!PR || !h || !key) return null;
      var v; try { v = PR.vars(key, chips); } catch (e) { v = null; }
      if (!v) return null;
      var st = h.states || {};
      if (v.show_security !== false) {
        var win = 0, door = 0;
        for (var i = 1; i <= 8; i++) {
          var e = v['security_entity_' + i], s = e && st[e];
          if (!s || s.state !== 'on' || e.indexOf('binary_sensor.') !== 0) continue;
          var dc = String((s.attributes && s.attributes.device_class) || '');
          if (/door|garage/.test(dc)) door++; else if (/window|opening/.test(dc) || !dc) win++;
        }
        if (win || door) {
          var t = win && door ? T('Offen') : win ? (win === 1 ? T('Fenster offen') : T(win + ' Fenster offen')) : (door === 1 ? T('Tür offen') : T(door + ' Türen offen'));
          return { text: t, warn: true };
        }
      }
      if (v.show_lights !== false && (v.light_entity_1 || v.light_group_entity)) {
        var cfg = []; for (var n = 1; n <= 10; n++) if (v['light_entity_' + n]) cfg.push(v['light_entity_' + n]);
        var mems = function (x) { var m = st[x] && st[x].attributes && st[x].attributes.entity_id; return Array.isArray(m) ? m.filter(function (y) { return typeof y === 'string' && y.indexOf('light.') === 0; }) : []; };
        if (!cfg.length) { var g = mems(v.light_group_entity); cfg = g.length ? g : [v.light_group_entity]; }
        var seen = {}, units = function (x) {
          if (!x || seen[x]) return [];
          var m = mems(x);
          if (!m.length || !m.some(function (y) { return mems(y).length; })) return [x];
          seen[x] = 1;
          return m.reduce(function (a, y) { return a.concat(units(y)); }, []);
        };
        var all = cfg.reduce(function (a, x) { return a.concat(units(x)); }, []).filter(function (x, k, a) { return a.indexOf(x) === k; });
        var on = all.filter(function (x) { return st[x] && st[x].state === 'on'; }).length;
        if (on) return { text: on === 1 ? T('Licht an') : T(on + ' Lichter an') };
      }
      var hs = v.humidity_sensor && st[v.humidity_sensor], hum = hs ? parseFloat(hs.state) : NaN;
      if (!isNaN(hum) && hum >= 65) return { text: T('Feucht') + ' · ' + Math.round(hum) + ' %' };
      return null;
    }
    /* Kreisfarbe einer Szene im Blatt: die Studio-Farbe wie überall am Desktop (Szenen-Badge, -Kacheln, -Reihe):
       eigene Farbe aus dem Studio, sonst die Standard-Szenenfarbe (--casora-scene-badge-color, im Casora-Design
       Gelb – dieselbe Quelle wie casora_badge_scene/casora_scenes). Keine geratene Symbolfarbe (Richtung C, 08.10.2026). */
    _sceneTone(id) {
      var own = window.casoraSceneColor ? window.casoraSceneColor(id) : null;
      return own ? String(own).replace(/["<>;{}]/g, '') : 'var(--casora-scene-badge-color, var(--casora-color-yellow, #FFCC00))';
    }
    /* Richtung C „Leicht“ (Casora/Weich, 08.10.2026): Griff, Titel mittig mit Etikett, Räume und Szenen als
       leichte Zeilen (Kreis, Name, Zustand rechts). Ziehen nach unten oder Tipp daneben schließt. */
    _openSheet(kind) {
      var self = this, rooms = kind === 'rooms';
      var items = this._items(kind);
      var m = this._menu = document.createElement('div');
      this._menuKind = kind;
      m.className = 'hmn-menu hmn-sheet';
      m.setAttribute('role', 'dialog');
      m.setAttribute('data-kind', kind);
      if (window.casoraMenuGlass) window.casoraMenuGlass.apply(m);
      var bg0 = m.style.backgroundColor || 'transparent';
      if (bg0.indexOf('menu-pane-webkit') < 0) m.style.backgroundColor = 'var(--casora-mnav-menu-pane, ' + bg0 + ')';
      m.style.setProperty('--casora-menu-shadow', 'var(--casora-mnav-menu-shadow, var(--casora-elevation-floating-phone, 0 10px 26px rgba(0,0,0,0.18)))');
      var el = function (tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
      var title = T(rooms ? 'Räume' : 'Szenen'), n = items.length;
      m.setAttribute('aria-label', title);
      m.appendChild(el('div', 'hmn-grip'));
      var head = el('div', 'hmn-head');
      head.appendChild(el('span', 'hmn-title', title));
      if (n) head.appendChild(el('span', 'hmn-count', rooms ? T(n === 1 ? '1 Raum' : n + ' Räume') : T(n === 1 ? '1 Szene' : n + ' Szenen')));
      m.appendChild(head);
      var list = el('div', 'hmn-list');
      m.appendChild(list);
      var chips = rooms ? this._chips() : null;
      var tap = function (b, it) {
        var up = function () { b.classList.remove('hmn-press'); };
        b.addEventListener('pointerdown', function () { b.classList.add('hmn-press'); });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { b.addEventListener(t, up); });
        /* Kurz die Rückmeldung zeigen, dann schließen; die Aktion läuft sofort. */
        b.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation(); self._haptic();
          b.classList.add('hmn-press'); it.run();
          setTimeout(function () { if (self._menu === m) self._closeMenu(); }, 120);
        });
      };
      items.forEach(function (it) {
        var tone = rooms ? null : self._sceneTone(it.id);
        var b = el('button', 'hmn-item hmn-row' + (it.on ? ' on' : '') + (tone ? ' hmn-tone' : ''));
        b.type = 'button';
        var label = (window.casoraTr || function (x) { return x; })(it.label);
        b.title = String(it.label || '');
        var ic = el('span', 'hmn-sic');
        ic.innerHTML = self._iconHtml(it.icon);
        if (tone) b.style.setProperty('--hmn-tone', tone);
        b.appendChild(ic);
        var tx = el('span', 'hmn-txt');
        tx.appendChild(el('span', 'hmn-name', label));
        b.appendChild(tx);
        if (!rooms) {
          /* Szenen: rechts, wann sie zuletzt lief – dieselbe Schreibweise wie die Szenen-Badges. */
          var ago = el('span', 'hmn-sub', self._sceneAgo(it.id));
          ago.setAttribute('data-sid', it.id);
          b.appendChild(ago);
        }
        if (rooms) {
          /* Zustand rechts neben dem Namen (eigene Rasterspalte), leer = ausgeblendet. */
          var note = self._roomNote(it.key, chips), sub = note ? note.text : '';
          var s = el('span', 'hmn-sub' + (note && note.warn ? ' hmn-warn' : ''), sub);
          s.setAttribute('data-no-i18n', '');
          if (!sub) s.style.display = 'none';
          b.appendChild(s);
          b.setAttribute('data-k', it.key);
          if (it.on) b.setAttribute('aria-current', 'true');
        }
        tap(b, it);
        list.appendChild(b);
      });
      if (!n) list.appendChild(el('div', 'hmn-empty', T(rooms ? 'Keine Räume' : 'Keine Szenen')));
      /* Zustand live nachziehen, solange das Blatt offen ist (set hass). */
      m._sheetRefresh = rooms ? function () {
        var ch = self._chips();
        Array.prototype.forEach.call(list.querySelectorAll('.hmn-row[data-k]'), function (b) {
          var s = b.querySelector('.hmn-sub'), nt = self._roomNote(b.getAttribute('data-k'), ch), t = nt ? nt.text : '';
          if (s && s.textContent !== t) { s.textContent = t; s.style.display = t ? '' : 'none'; }
          if (s) s.classList.toggle('hmn-warn', !!(nt && nt.warn));
        });
      } : function () {
        Array.prototype.forEach.call(list.querySelectorAll('.hmn-sub[data-sid]'), function (s) {
          var t = self._sceneAgo(s.getAttribute('data-sid'));
          if (s.textContent !== t) s.textContent = t;
        });
      };
      this._scrimOpen();
      if (this._bar) this._bar.classList.add('hmn-under');
      document.body.appendChild(m);
      this._render();
      /* Mehr Zeilen als Platz: Liste so kürzen, dass die letzte sichtbare Zeile halb angeschnitten ist
         (Scroll-Hinweis wie in iOS), und den offenen Raum in die Mitte holen. */
      var first = list.firstElementChild;
      if (first && list.scrollHeight > list.clientHeight + 1) {
        var padT = parseFloat(getComputedStyle(list).paddingTop) || 0, rowH = first.offsetHeight;
        var k = Math.max(1, Math.floor((list.clientHeight - padT - rowH * 0.5) / rowH));
        list.style.maxHeight = Math.round(k * rowH + rowH * 0.5 + padT) + 'px';
        var on = list.querySelector('.hmn-item.on');
        if (on) list.scrollTop = Math.max(0, on.offsetTop - (list.clientHeight - on.offsetHeight) / 2);
      }
      void m.offsetHeight;
      requestAnimationFrame(function () { m.classList.add('open'); });
      /* Nach unten ziehen schließt (ab 70 px oder schnell), sonst federt das Blatt zurück – am Kopf immer,
         in der Liste, sobald sie oben steht (wie die Casora-Popups). Hotfix 1.1.2: vorher ging es nur am
         Kopf, und am Handy scrollte dabei der Hintergrund mit. */
      var y0 = null, t0 = 0, dy = 0, drag = false;
      var start = function (y) { y0 = y; t0 = Date.now(); dy = 0; drag = false; };
      var move = function (y) {
        if (y0 == null) return false;
        var d = y - y0;
        if (!drag) { if (d <= 4) return false; drag = true; m.classList.add('hmn-drag'); }
        dy = Math.max(0, d); m.style.transform = 'translateY(' + dy + 'px)';
        return true;
      };
      var end = function () {
        if (y0 == null) return;
        y0 = null; m.classList.remove('hmn-drag');
        if (drag && (dy > 70 || (dy > 24 && Date.now() - t0 < 220))) self._closeMenu(); else m.style.transform = '';
        drag = false;
      };
      /* Maus/Stift: am Kopf ziehen. */
      head.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') return; start(e.clientY); try { head.setPointerCapture(e.pointerId); } catch (x) {} });
      head.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch') move(e.clientY); });
      head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
      /* Finger: überall im Blatt. In der Liste nur, wenn sie oben steht und nach unten gezogen wird –
         sonst scrollt die Liste selbst. Was das Blatt nicht braucht, geht nie an den Hintergrund. */
      var inList = false;
      m.addEventListener('touchstart', function (e) {
        if (e.touches.length !== 1) return;
        inList = !!(e.target && e.target.closest && e.target.closest('.hmn-list'));
        start(e.touches[0].clientY);
      }, { passive: true });
      m.addEventListener('touchmove', function (e) {
        if (y0 == null || e.touches.length !== 1) return;
        var y = e.touches[0].clientY;
        var canScroll = list.scrollHeight > list.clientHeight + 1;
        if (inList && canScroll && !drag && (y < y0 || list.scrollTop > 0)) return; /* Liste scrollt */
        if (move(y) || !inList || !canScroll) e.preventDefault();
      }, { passive: false });
      m.addEventListener('touchend', end); m.addEventListener('touchcancel', end);
      this._away = function (e) {
        var path = e.composedPath ? e.composedPath() : [e.target];
        if (path.indexOf(m) < 0 && path.indexOf(self._bRooms) < 0 && path.indexOf(self._bScenes) < 0) self._closeMenu();
      };
      this._esc = function (e) { if (e.key === 'Escape') self._closeMenu(); };
      setTimeout(function () { document.addEventListener('pointerdown', self._away, true); document.addEventListener('keydown', self._esc, true); }, 0);
    }
    _closeMenu() {
      var self = this, m = this._menu; if (!m) return;
      this._menu = null;
      document.removeEventListener('pointerdown', this._away, true);
      if (this._esc) { document.removeEventListener('keydown', this._esc, true); this._esc = null; }
      if (this._bar) this._bar.classList.remove('hmn-under');
      m.classList.remove('open', 'hmn-drag');
      m.style.transform = '';
      setTimeout(function () { if (m.parentNode) m.remove(); }, m.classList.contains('hmn-sheet') ? 360 : 220);
      var sc = this._scrim; this._scrim = null;
      var bar = this._bar;
      if (sc) { sc.classList.add('out'); sc.classList.remove('open'); setTimeout(function () { if (sc.parentNode) sc.remove(); if (bar && !self._menu) bar.classList.remove('hmn-up'); }, 260); }
      this._render();
    }
    _render() {
      if (!this._bar || !this._hass) return;
      var cur = this._cur();
      /* Raum umbenannt/gelöscht: der gemerkte Schlüssel zeigt auf keinen Raum mehr – zurück zu Home statt leerer Seite. */
      if (/^room_/.test(cur) && cur !== 'room_scenes' && this._rooms.length && this._pend == null
        && !this._rooms.some(function (r) { return r.key === cur; }) && window._casoraFilter) {
        window._casoraFilter.set('all'); cur = 'all';
      }
      var room = /^room_/.test(cur) && cur !== 'room_scenes';
      this._bar.classList.toggle('hmn-over', !!cur && cur !== 'all');
      this._bar.classList.toggle('hmn-ic', !!(window._casoraSoft && window._casoraSoft()));
      var mk = this._menu ? this._menuKind : null;
      this._homeText();
      this._bHome.classList.toggle('on', !room && cur !== 'room_scenes' && !mk);
      this._bRooms.classList.toggle('on', mk ? mk === 'rooms' : room);
      this._bScenes.classList.toggle('on', mk ? mk === 'scenes' : cur === 'room_scenes');
      /* Räume-Knopf zeigt Icon + Namen des offenen Raums (wie im Dropdown), sonst Grundriss (rooms.svg) + "Räume". */
      var ar = room && this._rooms.filter(function (r) { return r.key === cur; })[0];
      var ri = ar ? this._roomIcon(ar) : '/casora_assets/icons/rooms.svg?v=3';
      if (this._bRooms._icon !== ri) {
        this._bRooms._icon = ri;
        this._bRooms.firstElementChild.innerHTML = this._iconHtml(ri);
      }
      var rl = ar ? (ar.label || ar.name) : T('Räume'), ls = this._bRooms.lastElementChild;
      if (ls && ls.textContent !== rl) ls.textContent = rl;
      if (this._bRooms.getAttribute('aria-label') !== rl) this._bRooms.setAttribute('aria-label', rl);
      /* Wie "Räume" laufend nachziehen: beim ersten Aufbau kann die Übersetzung noch fehlen. */
      var ss = this._bScenes.lastElementChild, st = T('Szenen');
      if (ss && ss.textContent !== st) ss.textContent = st;
      if (this._bScenes.getAttribute('aria-label') !== st) this._bScenes.setAttribute('aria-label', st);
      if (cur !== this._lastCur) {
        /* Auch Raumwechsel über andere Wege (Raum-Chips, Header) zählen als "meine", wenn hier gerade getippt wurde. */
        if (this._tapAt && Date.now() - this._tapAt < 4000) this._mine = cur;
        this._lastCur = cur; this._hide(false);
        /* Overlay wird erst beim Öffnen gebaut – kurz nachfassen. */
        var me = this; [150, 600, 1500].forEach(function (t) { setTimeout(function () { me._bindOverlays(); }, t); });
      }
      this._bindOverlays();
      this._slimHome();

    }
  }
  /* Home nur noch Kopf/Badges/Chips/Now Playing + Favoriten: Szenen- und Raum-Abschnitte werden
     per Stylesheet im Shadow-Root der äußeren Reihe versteckt (nicht gelöscht) – die Raum- und
     Kategorie-Overlays lesen ihre Karten weiterhin aus genau diesen Abschnitten. !important im
     Stylesheet schlägt das Inline-display, das Overlay/Smart-Row beim Auf-/Zuklappen setzen. */
  /* Einmal melden, dass Home aufgeräumt ist: smart-row hält die Raum-Abschnitte bis dahin verdeckt. */
  var slimDone = function () {
    if (window._casoraHomeSlim) return;
    window._casoraHomeSlim = true;
    try { window.dispatchEvent(new Event('casora-home-slim')); } catch (e) { /* alt */ }
  };
  CasoraMobileNav.prototype._slimHome = function () {
    if (this._cfg.slim_home === false) { slimDone(); return; }
    var rows = Array.from(window._casoraSmartRows || []), host = null;
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; if (r.isConnected && r.shadowRoot && r._config && (r._config.cards || []).some(function (c) { return c && c.type === 'custom:casora-filter-overlay'; })) { host = r; break; } }
    if (!host) { var me = this; if (!this._slimRetry) this._slimRetry = setTimeout(function () { me._slimRetry = null; me._slimHome(); }, 800); return; }
    var sr = host.shadowRoot;
    if (!sr.getElementById('hmn-slim-css')) {
      var st = document.createElement('style'); st.id = 'hmn-slim-css';
      st.textContent = '#container > .card-wrapper[data-hmn-hide]{display:none !important;}';
      sr.appendChild(st);
    }
    /* Über die Konfiguration statt über das DOM: dataset.idx → cards[idx]. */
    var cards = host._config.cards || [], hideNames = {}, hideIdx = {}, hiding = false;
    (this._rooms || []).forEach(function (r) { hideNames[r.name] = 1; }); hideNames['Szenen'] = 1; hideNames['Scenes'] = 1; hideNames[T('Szenen')] = 1;
    var tpl = function (c, n) { var t = c && c.template; return t === n || (Array.isArray(t) && t.indexOf(n) >= 0); };
    cards.forEach(function (c, i) {
      if (tpl(c, 'casora_mobile_header')) hiding = !!hideNames[c.name];
      if (hiding || tpl(c, 'casora_scene_row')) hideIdx[i] = 1;
    });
    Array.prototype.forEach.call(sr.querySelectorAll('#container > .card-wrapper'), function (w) {
      if (hideIdx[w.dataset.idx]) { if (!w.hasAttribute('data-hmn-hide')) w.setAttribute('data-hmn-hide', ''); }
      else if (w.hasAttribute('data-hmn-hide')) w.removeAttribute('data-hmn-hide');
    });
    /* Reihe baut ihre Karten noch (Frame für Frame): später Nachfassen, erst dann melden. */
    if (host._cardsCreated) slimDone();
    else { var self = this; if (!this._slimRetry) this._slimRetry = setTimeout(function () { self._slimRetry = null; self._slimHome(); }, 300); }
  };
  customElements.define('casora-mobile-nav', CasoraMobileNav);
})();

