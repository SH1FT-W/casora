// ── Weich: Szenen-Popup (01.10.2026) ────────────────────────────────────────
// Nur im Weich-Design (window._casoraSoft()). casora_popup_scenes öffnet dann statt
// des browser_mod- bzw. HA-Dialogs ein Casora-Popup (casora_popup) und ruft hier
// window._casoraScenesSoft.popup(...) auf. Aufbau wie das Licht-Popup: Ring + Titel,
// eine Unterzeile („Keine Szene aktiv“ bzw. die aktive Szene), darunter die Szenen
// als Chips. Welche Szenen dazugehören und welche aktiv ist, entscheidet wie bei der
// Kachel window._casoraSC (casora_scene_core). Standard und Glas bleiben wie bisher.
(function () {
  if (window._casoraScenesSoft) return;
  var Z = window._casoraScenesSoft = {};
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ago = function (ts) {
    var t = typeof ts === 'number' ? ts : Date.parse(ts); if (isNaN(t)) return null;
    var m = (window.casoraAgoMin ? window.casoraAgoMin(Date.now() - t) : Math.max(0, Math.round((Date.now() - t) / 60000)));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + (window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.round(m / 1440)) + ' T.';
  };
  var nameOf = function (id, states, room) {
    var st = states[id];
    var n = String((st && st.attributes && st.attributes.friendly_name) || id.replace(/^scene\./, '').replace(/_/g, ' '));
    if (room) {
      var r = n.replace(new RegExp('^\\s*' + String(room).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[·:\\-–]?\\s*', 'i'), '').trim();
      if (r) n = r;
    }
    return n;
  };
  var CSS = '<style>'
    + '.zs-chips{display:flex;gap:8px;flex-wrap:wrap;}'
    // Sichtbar 38 px hoch, Trefferfläche 46 px (unsichtbarer Rand oben/unten in der 8-px-Lücke,
    // Design-Audit 10.10.2026: Trefferflächen ≥ 40 px wie Schließen/„Alles aus“).
    + '.zs-chip::before{content:"";position:absolute;left:0;right:0;top:-4px;bottom:-4px;}'
    + '.zs-chip{position:relative;padding:11px 17px;border-radius:999px;font-family:var(--primary-font-family,system-ui);font-size:13.5px;font-weight:600;'
    +   'cursor:pointer;white-space:nowrap;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;'
    +   'background:var(--casora-lps-chip, var(--casora-soft-row-fill, rgba(140,115,90,0.07)));'
    +   'color:var(--casora-lps-chip-ink, var(--casora-soft-sub, rgba(58,50,43,0.6)));transition:background .2s ease, color .2s ease;}'
    + '.zs-chip.on{background:var(--casora-lps-chip-on, #FFFDF9);color:var(--casora-lps-chip-on-ink, #2E2721);'
    +   'box-shadow:var(--casora-soft-seg-on-shadow, none);}'
    + '@media (hover:hover){.zs-chip:not(.on):hover{filter:brightness(.98);}}'
    + '.zs-chip:active{filter:brightness(.94);}'
    + '</style>';

  Z.sec = function (part, V, states) {
    var UI = window._casoraUI, SC = window._casoraSC;
    if (!UI || !SC) return '';
    var ids = (V.ids || []).filter(function (id) { return states[id]; });
    var act = SC.activeList(ids, states) || [];
    if (part === 'hero') {
      if (act.length) {
        /* Zuletzt aktiv inkl. Status-Schalter der Szene (#11). */
        var la = function (id) { return SC.lastActive ? (SC.lastActive(id, states) || NaN) : Date.parse(states[id] && states[id].state); };
        var since = ago(la(act[0]));
        return UI.hero({ center: true, value: nameOf(act[0], states, V.room) + (act.length > 1 ? ' +' + (act.length - 1) : ''),
          sub: since ? 'Aktiv · ' + since : 'Aktiv', subTone: 'good' });
      }
      var last = null, lastT = 0;
      ids.forEach(function (id) { var t = SC.lastActive ? (SC.lastActive(id, states) || NaN) : Date.parse(states[id].state); if (!isNaN(t) && t > lastT) { lastT = t; last = id; } });
      return UI.hero({ center: true, value: 'Keine Szene aktiv',
        sub: last ? 'Zuletzt ' + nameOf(last, states, V.room) + ' · ' + ago(lastT) : null });
    }
    if (part === 'chips') {
      if (!ids.length) {
        return UI.label('Szenen') + UI.note('Keine Szenen gefunden. Casora zeigt alle Szenen, die in den Entitäten weder ausgeblendet noch deaktiviert sind.');
      }
      return '<div style="text-align:left;">' + UI.label('Szenen') + CSS + '<div class="zs-chips">' + ids.map(function (id) {
        var svc = { domain: 'scene', service: 'turn_on', data: V.trans > 0 ? { transition: V.trans } : {}, target: { entity_id: id } };
        /* Aktiver Chip in der Studio-Farbe der Szene (B-SZENE): Farbpunkt + leicht getönte Fläche. */
        var on = act.indexOf(id) > -1, clr = on && window.casoraSceneColor ? window.casoraSceneColor(id) : null;
        return '<div class="zs-chip' + (on ? ' on' : '') + '" role="button" data-casora-svc="' + esc(JSON.stringify(svc)) + '"'
          + (clr ? ' style="background:color-mix(in srgb, ' + esc(clr) + ' 16%, var(--casora-lps-chip-on, #FFFDF9));"' : '') + '>'
          + (clr ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:1px;background:' + esc(clr) + ';"></span>' : '')
          + esc(nameOf(id, states, V.room)) + '</div>';
      }).join('') + '</div></div>';
    }
    return '';
  };

  // Popup v3 (popup-richtlinien-v3.md §4 S8, maintainer review 31.10.2026): the scenes as a grid of tiles in the
  // stage plate – symbol (MDI outline) over the name, the active one lit like a chosen quick tile with its Studio colour;
  // more than 12 → the first 12 and „Alle n anzeigen“. The status line says which is active or the last one.
  var V3CSS = '<style>.zs-g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;}'
    + '@media (max-width:600px){.zs-g{grid-template-columns:repeat(2,minmax(0,1fr));}}'
    + '.zs-t{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:10px;min-height:84px;padding:14px;box-sizing:border-box;'
    +   'border-radius:var(--casora-v3-quick-radius, 24px);background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));cursor:pointer;min-width:0;'
    +   'font-family:var(--primary-font-family, system-ui);color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));'
    +   'user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;transition:background-color var(--casora-dur-feedback, 160ms) ease;}'
    + '.zs-t > *{pointer-events:none;}'
    + '.zs-t ha-icon{--mdc-icon-size:22px;width:22px;height:22px;display:flex;margin:0 !important;color:var(--casora-soft-sub, rgba(58,50,43,0.6));}'
    // Names wrap at spaces („Ambiente / Badezimmer“), not with a hyphen mid-word („Ambiente Bade-zimmer“), as on the moons
    // (decision 01.11.2026); only a word longer than the tile still breaks.
    + '.zs-t b{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:14px;font-weight:700;line-height:1.25;overflow-wrap:break-word;hyphens:manual;-webkit-hyphens:manual;}'
    + '.zs-t.on{background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, #2E2721);'
    +   'box-shadow:0 0 0 2px var(--zs-c, var(--casora-popup-accent, var(--casora-color-yellow))), var(--casora-soft-seg-on-shadow, none);}'
    + '.zs-m{width:22px;height:22px;display:block;flex:none;background:var(--casora-soft-sub, rgba(58,50,43,0.6));-webkit-mask:no-repeat center/contain;mask:no-repeat center/contain;}'
    + '.zs-t.on .zs-m{background:color-mix(in srgb, var(--zs-c, var(--casora-popup-accent, var(--casora-color-yellow))) 65%, var(--casora-soft-seg-on-ink, #2E2721));}'
    + '.zs-t.on ha-icon{color:color-mix(in srgb, var(--zs-c, var(--casora-popup-accent, var(--casora-color-yellow))) 65%, var(--casora-soft-seg-on-ink, #2E2721));}'
    + '.zs-t:active{transform:scale(var(--casora-press-scale, .97));}'
    + '@media (hover:hover){.zs-t:not(.on):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
    + '.hui-stage{--casora-pv-stack-fill:transparent;}</style>';
  // The scene's own symbol (prod test 01.11.2026: every tile showed the same palette): the Studio's choice
  // (scene_icons of the tile or of the dashboard's scene row), then HA's (entity registry, then the state), else a calm
  // default. A picture path as a mask; nothing else.
  // One symbol set on the tiles (§4.8: MDI): a symbol from another set („ios:moon-stars“) is mapped by its name; an
  // unknown one stays only when its set is installed.
  var MAP = [[/lamp-floor|floor-lamp/, 'mdi:floor-lamp-outline'], [/lamp/, 'mdi:lamp-outline'], [/bulb|light/, 'mdi:lightbulb-outline'],
    [/moon|night|sleep|bed/, 'mdi:weather-night'], [/sun|sunrise|morning/, 'mdi:weather-sunny'], [/sunset|evening/, 'mdi:weather-sunset'],
    [/wand|sparkle|magic|clean|broom/, 'mdi:creation-outline'], [/tv|television|appletv|movie|film|cinema/, 'mdi:television'],
    [/music|note|speaker/, 'mdi:music-note'], [/book|read/, 'mdi:book-open-variant'], [/party|celebrat/, 'mdi:party-popper'],
    [/heart|love|romant/, 'mdi:heart-outline'], [/candle|flame|fire/, 'mdi:candle'], [/home|house/, 'mdi:home-outline'],
    [/leaf|plant|nature/, 'mdi:leaf'], [/dinner|food|fork|cook|kitchen/, 'mdi:silverware-fork-knife'], [/coffee|cup/, 'mdi:coffee-outline'],
    [/power|off/, 'mdi:power']];
  var toMdi = function (ic) {
    var m = /^([a-z0-9_-]+):([\w-]+)$/i.exec(ic);
    if (!m) return null;
    if (m[1] === 'mdi') return ic;
    for (var i = 0; i < MAP.length; i++) if (MAP[i][0].test(m[2])) return MAP[i][1];
    return (window.customIcons && window.customIcons[m[1]]) || (window.customIconsets && window.customIconsets[m[1]]) ? ic : null;
  };
  Z.iconOf = function (id, states, V) {
    var studio = (V && V.icons) || {};
    var reg = (((typeof document !== 'undefined' && document.querySelector('home-assistant')) || {}).hass || {}).entities || {};
    var st = states[id];
    var cand = [studio[id], (reg[id] || {}).icon, st && st.attributes && st.attributes.icon];
    for (var i = 0; i < cand.length; i++) {
      var c = typeof cand[i] === 'string' ? cand[i].trim() : '';
      if (!c) continue;
      var mi = toMdi(c);
      if (mi) return { icon: mi };
      if (/^(\/|https?:)[^"'<>()\s]+\.(svg|png|webp)$/i.test(c)) return { url: c };
    }
    return { icon: 'mdi:palette-outline' };
  };
  var iconHtml = function (id, states, V) {
    var o = Z.iconOf(id, states, V);
    if (o.url) return '<span class="zs-m" style="-webkit-mask-image:url(\'' + esc(o.url) + '\');mask-image:url(\'' + esc(o.url) + '\');"></span>';
    return '<ha-icon icon="' + esc(o.icon) + '"></ha-icon>';
  };
  Z.v3sec = function (part, V, states) {
    var UI = window._casoraUI, SC = window._casoraSC;
    if (!UI || !SC) return '';
    var ids = (V.ids || []).filter(function (id) { return states[id]; });
    var act = SC.activeList(ids, states) || [];
    if (part === 'hero') {
      if (act.length) {
        var la = function (id) { return SC.lastActive ? (SC.lastActive(id, states) || NaN) : Date.parse(states[id] && states[id].state); };
        var since = ago(la(act[0]));
        return UI.line(nameOf(act[0], states, V.room) + (act.length > 1 ? ' +' + (act.length - 1) : ''), [since ? 'aktiv ' + since : 'aktiv'], { tone: 'good' });
      }
      var last = null, lastT = 0;
      ids.forEach(function (id) { var t = SC.lastActive ? (SC.lastActive(id, states) || NaN) : Date.parse(states[id].state); if (!isNaN(t) && t > lastT) { lastT = t; last = id; } });
      return UI.line('Keine Szene aktiv', last ? ['Zuletzt ' + nameOf(last, states, V.room) + ' ' + ago(lastT)] : []);
    }
    if (part === 'stage') {
      if (!ids.length) return UI.stage('content', { empty: { icon: 'mdi:palette-outline', studio: true, text: 'Keine Szenen gefunden. Casora zeigt alle Szenen, die in den Entitäten weder ausgeblendet noch deaktiviert sind.' } });
      var tileHtml = function (id) {
        var svc = { domain: 'scene', service: 'turn_on', data: V.trans > 0 ? { transition: V.trans } : {}, target: { entity_id: id } };
        var on = act.indexOf(id) > -1, clr = on && window.casoraSceneColor ? window.casoraSceneColor(id) : null;
        var n = nameOf(id, states, V.room);
        return '<div class="zs-t' + (on ? ' on' : '') + '" role="button" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + esc(n) + '"'
          + ' data-casora-svc="' + esc(JSON.stringify(svc)) + '"' + (clr ? ' style="--zs-c:' + esc(clr) + '"' : '') + '>'
          + iconHtml(id, states, V) + '<b>' + esc(n) + '</b></div>';
      };
      var head = ids.slice(0, 12), rest = ids.slice(12);
      var html = V3CSS + '<div class="zs-g">' + head.map(tileHtml).join('') + '</div>';
      if (rest.length && UI.more) html += '<div style="height:10px"></div>' + UI.more('zs-all', '<div class="zs-g">' + rest.map(tileHtml).join('') + '</div>',
        { keep: true, label: 'Alle ' + ids.length + ' anzeigen', less: 'Weniger anzeigen' });
      return UI.stage('content', { html: html });
    }
    return '';
  };
  // Symbols chosen in the Studio: the tile's own scene_icons, then the dashboard's scene row (like casoraSceneColor).
  Z.studioIcons = function (variables) {
    var out = {};
    var add = function (m) { if (m && typeof m === 'object' && !Array.isArray(m)) Object.keys(m).forEach(function (k) { if (out[k] == null && typeof m[k] === 'string') out[k] = m[k]; }); };
    add(variables && variables.scene_icons);
    try {
      var cfg = window._casoraLovelaceCfg && window._casoraLovelaceCfg();
      var row = cfg && cfg.button_card_templates && cfg.button_card_templates.casora_scene_row;
      add(row && row.variables && row.variables.scene_icons);
    } catch (e) { /* YAML dashboard */ }
    return out;
  };
  Z.v3 = function () { var UI = window._casoraUI; return !!(UI && UI.v3 && UI.v3() && UI.stage && window._casoraSoftKit); };

  Z.popup = function (entity, variables, states, hass) {
    var SC = window._casoraSC, HH = window._casoraHH;
    if (SC && Z.v3()) {
      var K = window._casoraSoftKit;
      variables = variables || {};
      var ids3 = SC.list(states, hass, variables) || [];
      SC.prefetch(ids3, states);
      var room3 = variables.room_name && variables.room_name !== 'Home' && variables.room_name !== 'Zuhause' && variables.room_name !== 'Casa' ? variables.room_name : null;
      var cj3 = JSON.stringify({ ids: ids3, room: room3, trans: Number(variables.scene_transition != null ? variables.scene_transition : 4), icons: Z.studioIcons(variables) });
      var call = function (p) { return 'return window._casoraScenesSoft ? window._casoraScenesSoft.v3sec(' + JSON.stringify(p) + ', ' + cj3 + ', states) : "";'; };
      return K.layout({ fields: { hero: { card: K.secCard(ids3, call('hero'), states) }, stage: { card: K.secCard(ids3, call('stage'), states) } },
        top: ['hero'], stage: 'stage', left: [], right: [] });
    }
    if (!SC || !HH || !HH.col) return { type: 'vertical-stack', cards: [] };
    variables = variables || {};
    var ids = SC.list(states, hass, variables) || [];
    SC.prefetch(ids, states);
    var room = variables.room_name && variables.room_name !== 'Home' && variables.room_name !== 'Zuhause' && variables.room_name !== 'Casa' ? variables.room_name : null;
    var V = { ids: ids, room: room, trans: Number(variables.scene_transition != null ? variables.scene_transition : 4) };
    var cj = JSON.stringify(V);
    var sec = function (p) { return '[[[ return window._casoraScenesSoft ? window._casoraScenesSoft.sec(' + JSON.stringify(p) + ', ' + cj + ', states) : ""; ]]]'; };
    var anchor = (entity && entity.entity_id) || ids[0] || undefined;
    var col = HH.col(['hero', 'chips'], { hero: sec('hero'), chips: sec('chips') }, ids, anchor);
    /* Ränder wie die übrigen Weich-Popups (die Spalten-Karte hat sonst padding 0). */
    /* Als oberste Karte ohne Hülle: Schatten/Rand des Themes selbst abschalten (wie die Hülle der übrigen Popups). */
    col.card_mod = { style: col.card_mod.style.replace('padding: 0 !important;', 'padding: 0 26px 26px 26px !important;')
      + '\n:host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important;'
      + ' --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }'
      + '\nha-card:hover { box-shadow: none !important; }'
      + '\nha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }'
      + '\nha-card { will-change: auto !important; }'
      + '\n@media (max-width: 600px) { ha-card { padding-left: 16px !important; padding-right: 16px !important; } }' };
    return col;
  };
})();
