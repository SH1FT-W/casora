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
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return null;
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
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
    + '.zs-chip{padding:11px 17px;border-radius:999px;font-family:var(--primary-font-family,system-ui);font-size:13.5px;font-weight:600;'
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
        var since = ago(states[act[0]] && states[act[0]].state);
        return UI.hero({ center: true, value: nameOf(act[0], states, V.room) + (act.length > 1 ? ' +' + (act.length - 1) : ''),
          sub: since ? 'Aktiv · ' + since : 'Aktiv', subTone: 'good' });
      }
      var last = null, lastT = 0;
      ids.forEach(function (id) { var t = Date.parse(states[id].state); if (!isNaN(t) && t > lastT) { lastT = t; last = id; } });
      return UI.hero({ center: true, value: 'Keine Szene aktiv',
        sub: last ? 'Zuletzt ' + nameOf(last, states, V.room) + ' · ' + ago(states[last].state) : null });
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

  Z.popup = function (entity, variables, states, hass) {
    var SC = window._casoraSC, HH = window._casoraHH;
    if (!SC || !HH || !HH.col) return { type: 'vertical-stack', cards: [] };
    variables = variables || {};
    var ids = SC.list(states, hass, variables) || [];
    SC.prefetch(ids, states);
    var room = variables.room_name && variables.room_name !== 'Home' && variables.room_name !== 'Zuhause' ? variables.room_name : null;
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
