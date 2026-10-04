// ── Weich: „Aktuelle Wiedergabe“ als ruhige Liste (05.10.2026, 1.0.7) ────────
// Nur im Weich-Design (window._casoraSoft()). Eine Karte, jeder Player eine Zeile:
// Cover, Titel, „Interpret · Gerät“, dünner Fortschritt und ein runder Play/Pause-Knopf.
// Am Handy stehen die Zeilen untereinander, am Desktop/Tablet nebeneinander (umbrechend
// statt seitlich zu scrollen). Standard und Glas zeigen weiter Karussell bzw. Pillen.
//
// Die Vorlagen melden ihre Karte nur an (window._casoraNPSoft.mount):
//   casora_mobile_now_playing  → 'phone' (ersetzt #media_row/#np_rail, Überschrift bleibt)
//   casora_room                → 'room'  (ersetzt die Medien-Pillen in #badges_media; angemeldet wird
//                                          die Raumkarte, die innere Karte wird hier gesucht)
// Die bisherigen Karten bleiben unsichtbar im DOM: ihre Logik (Ein-/Ausblenden, Pausen-
// Frist, Reihenfolge) läuft weiter, und ein Tipp auf eine Zeile löst genau deren Aktion
// aus – das Medien-Popup öffnet sich also wie bisher.
(function () {
  if (window._casoraNPSoft) return;
  var M = window._casoraNPSoft = {};

  var soft = function () { return typeof window._casoraSoft === 'function' && window._casoraSoft(); };
  var getHass = function () { var h = document.querySelector('home-assistant'); return h && h.hass; };
  var T = function (de) { return window.casoraTr ? window.casoraTr(de) : de; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var P = {
    play: 'M8,5.14V19.14L19,12.14L8,5.14Z',
    pause: 'M14,19H18V5H14M6,19H10V5H6V19Z',
    note: 'M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z',
    game: 'M7.97,16L5,19C4.67,19.3 4.23,19.5 3.75,19.5A1.75,1.75 0 0,1 2,17.75V17.5L3,10.12C3.21,7.81 5.14,6 7.5,6H16.5C18.86,6 20.79,7.81 21,10.12L22,17.5V17.75A1.75,1.75 0 0,1 20.25,19.5C19.77,19.5 19.33,19.3 19,19L16.03,16H7.97M7,8V10H5V11H7V13H8V11H10V10H8V8H7M16.5,8A0.75,0.75 0 0,0 15.75,8.75A0.75,0.75 0 0,0 16.5,9.5A0.75,0.75 0 0,0 17.25,8.75A0.75,0.75 0 0,0 16.5,8M14.75,9.75A0.75,0.75 0 0,0 14,10.5A0.75,0.75 0 0,0 14.75,11.25A0.75,0.75 0 0,0 15.5,10.5A0.75,0.75 0 0,0 14.75,9.75M18.25,9.75A0.75,0.75 0 0,0 17.5,10.5A0.75,0.75 0 0,0 18.25,11.25A0.75,0.75 0 0,0 19,10.5A0.75,0.75 0 0,0 18.25,9.75M16.5,11.5A0.75,0.75 0 0,0 15.75,12.25A0.75,0.75 0 0,0 16.5,13A0.75,0.75 0 0,0 17.25,12.25A0.75,0.75 0 0,0 16.5,11.5Z',
  };
  var svg = function (d, s) { return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true"><path fill="currentColor" d="' + d + '"/></svg>'; };

  // Einstellungen der Raumkarte → dieselbe Form wie casora_mobile_now_playing (variables.cfg),
  // damit beide Ansichten dieselbe Quelle (window._casoraNP) mit denselben Regeln nutzen.
  M.roomCfg = function (v) {
    v = v || {};
    var c = { pause_timeout_minutes: v.pause_timeout_minutes != null ? v.pause_timeout_minutes : 10 };
    for (var i = 1; i <= 10; i++) { c['media_player_' + i] = v['media_player_' + i] || null; c['show_media_player_' + i] = !!v['media_player_' + i]; }
    for (var j = 1; j <= 2; j++) { c['psn_' + j] = v['psn_' + j] || null; c['show_psn_' + j] = !!v['psn_' + j]; }
    ['discord_user', 'discord_online', 'discord_game', 'discord_image', 'discord_details', 'discord_label',
      'steam_account', 'steam_online', 'steam_game', 'steam_image', 'steam_label', 'duplicate_game'].forEach(function (k) { c[k] = v[k] || null; });
    c.show_discord = !!(v.discord_user || (v.discord_online && v.discord_game));
    c.show_steam = !!(v.steam_account || v.steam_game);
    c.pinned_key = '';
    return c;
  };

  var CSS = ''
    + ':host{display:block;--cnp-card:var(--casora-np-list-surface, var(--ha-card-background, rgba(251,248,243,.88)));'
    + '--cnp-ink:var(--primary-text-color, #3A322B);--cnp-sub:var(--secondary-text-color, rgba(98,87,76,.92));'
    + '--cnp-ton:var(--casora-np-progress, var(--primary-color, #B67A50));--cnp-track:var(--casora-np-track, var(--casora-soft-control-fill, rgba(140,115,90,.14)));'
    + '--cnp-hair:var(--casora-pill-divider, rgba(120,100,80,.16));--cnp-shadow:var(--button-card-box-shadow-mobile, 0 6px 16px -10px rgba(90,70,50,.18))}'
    + '.l{font-family:var(--primary-font-family, Inter, system-ui);color:var(--cnp-ink);-webkit-font-smoothing:antialiased;line-height:1.25;text-align:left;'
    + 'background:var(--cnp-card);border-radius:26px;box-shadow:var(--cnp-shadow);padding:4px 0;box-sizing:border-box;'
    + '-webkit-backdrop-filter:var(--casora-np-list-backdrop, none);backdrop-filter:var(--casora-np-list-backdrop, none)}'
    + '.l.d{display:grid;border-radius:28px;padding:4px 6px}'
    + '.l *{box-sizing:border-box}'
    + '.r{display:flex;align-items:center;gap:14px;padding:12px 14px 12px 12px;position:relative;min-width:0;cursor:pointer;'
    + 'border-radius:22px;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;outline:none}'
    + '.r:focus-visible{box-shadow:inset 0 0 0 2px var(--cnp-ton)}'
    + '@media (hover:hover){.r:hover{background:var(--casora-np-hover, var(--casora-soft-row-hover, rgba(140,115,90,.06)))}}'
    + '.r:active{background:var(--casora-soft-row-hover, rgba(140,115,90,.08))}'
    + '.r.hs:before{content:"";position:absolute;top:0;left:78px;right:16px;height:1px;background:var(--cnp-hair)}'
    + '.l.d .r.hs:before{left:12px;right:12px}'
    + '.r.vs:after{content:"";position:absolute;left:0;top:18px;bottom:18px;width:1px;background:var(--cnp-hair)}'
    + '.cv{width:52px;height:52px;border-radius:14px;flex:none;display:grid;place-items:center;color:var(--cnp-sub);'
    + 'background:var(--casora-np-art-fill, var(--cnp-track)) center/cover no-repeat}'
    + '.l.d .cv{width:56px;height:56px}'
    + '.m{flex:1;min-width:0}'
    + '.t{font-size:16px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.s{font-size:13px;color:var(--cnp-sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.b{height:3px;border-radius:2px;background:var(--cnp-track);overflow:hidden;margin-top:9px}'
    + '.b i{display:block;height:100%;border-radius:2px;background:var(--cnp-ton)}'
    + '.b.n{visibility:hidden}'
    + '.p{width:44px;height:44px;border-radius:50%;flex:none;display:grid;place-items:center;border:0;padding:0;margin:0;cursor:pointer;'
    + 'background:var(--casora-soft-media-play, var(--primary-color, #B67A50));color:#fff;font:inherit;-webkit-tap-highlight-color:transparent;'
    + 'box-shadow:var(--casora-soft-media-play-shadow, 0 10px 22px -12px rgba(150,95,55,.55));transition:transform .12s ease}'
    + '.p.o{background:var(--cnp-track);color:var(--cnp-ink);box-shadow:none}'
    + '.p:active{transform:scale(.92)}'
    + '.p:focus-visible{outline:2px solid var(--cnp-ton);outline-offset:2px}';

  // Was die Vorlage sonst zeigt, wird im Weich-Design ausgeblendet (die Karten bleiben im DOM).
  var HIDE = {
    phone: '#media_row,#np_rail{display:none !important}ha-card{flex-direction:column !important;align-items:stretch !important}',
    // #container trägt sein display inline mit !important (styles.grid) – darum aus dem Fluss nehmen statt display.
    room: '#container{position:absolute !important;left:0;top:0;opacity:0 !important;visibility:hidden !important;'
      + 'clip-path:inset(50%) !important;pointer-events:none !important}'
      + 'ha-card{position:relative;min-height:0 !important;overflow:visible !important}',
  };

  var entries = [];
  M._entries = function () { return entries; };
  var timer = 0;

  M.mount = function (card, cfg, kind) {
    try {
      if (!card || !cfg) return '';
      var e = null;
      for (var i = 0; i < entries.length; i++) if (entries[i].card === card) { e = entries[i]; break; }
      if (!e) { e = { card: card, kind: kind === 'room' ? 'room' : 'phone', rows: {} }; entries.push(e); }
      e.cfg = cfg;
      if (!timer) timer = setInterval(tick, 1000);
      requestAnimationFrame(function () { render(e); });
    } catch (err) { /* nie die Vorlage brechen */ }
    return '';
  };

  function teardown(e) {
    if (e.host) { if (e.host.parentNode) e.host.parentNode.removeChild(e.host); e.host = null; }
    if (e.style) { if (e.style.parentNode) e.style.parentNode.removeChild(e.style); e.style = null; }
    e.sig = null;
  }

  function tick() {
    var now = Date.now();
    entries = entries.filter(function (e) {
      if (e.card.isConnected) { e.gone = 0; return true; }
      if (!e.gone) e.gone = now;
      return now - e.gone < 120000;
    });
    if (!entries.length) { clearInterval(timer); timer = 0; return; }
    entries.forEach(function (e) { if (e.card.isConnected) render(e); });
  }

  // Verfügbare Breite der Raumkarten-Zeile: vom Anfang der Medien-Zeile bis zum Kartenrand.
  function roomWidth(card) {
    var field = card.parentElement, grid = field && field.parentElement;
    if (!field || !grid) return 0;
    var fr = field.getBoundingClientRect(), gr = grid.getBoundingClientRect();
    var pr = parseFloat(getComputedStyle(grid).paddingRight) || 0;
    return Math.max(0, Math.floor(gr.right - pr - fr.left));
  }

  function device(rec, states) {
    if (rec.kind === 'player') {
      var s = states[rec.entity];
      return String((s && s.attributes && s.attributes.friendly_name) || rec.source || '').trim();
    }
    return String(rec.source || '').trim();
  }

  // Karte, deren Inhalt ersetzt wird: am Handy die angemeldete Karte selbst, im Raum die
  // innere Karte der Medien-Zeile (#badges_media) der angemeldeten Raumkarte.
  function target(e) {
    if (e.kind !== 'room') return e.card;
    var rr = e.card.shadowRoot, f = rr && rr.getElementById('badges_media');
    return (f && f.querySelector('button-card')) || null;
  }

  function render(e) {
    var card = target(e), root = card && card.shadowRoot;
    var hc = root && root.querySelector('ha-card');
    if (!hc) return;
    if (!soft()) { if (e.host || e.style) teardown(e); return; }
    var h = getHass(); if (!h || !h.states) return;
    var states = h.states;

    if (!e.style || !e.style.isConnected) {
      e.style = document.createElement('style');
      e.style.className = 'cnp-hide';
      e.style.textContent = HIDE[e.kind];
      root.appendChild(e.style);
    }
    if (!e.host || e.host.parentNode !== hc) {
      if (e.host && e.host.parentNode) e.host.parentNode.removeChild(e.host);
      e.host = document.createElement('div');
      e.host.className = 'cnp-host';
      e.host.setAttribute('data-no-i18n', '');
      var sr = e.host.attachShadow({ mode: 'open' });
      sr.innerHTML = '<style>' + CSS + '</style><div class="w"></div>';
      bind(e, sr);
      hc.appendChild(e.host);
      e.sig = null;
    }

    var list = typeof window._casoraNP === 'function' ? window._casoraNP(states, e.cfg) : [];
    var show = list.length > 0;
    if (e.kind === 'phone') {
      var f = (states['input_select.casora_mobile_filter'] || {}).state || 'all';
      show = show && (f === 'all' || f === 'media');
    }

    var desk = e.kind === 'room';
    var cols = 1, colW = 0, avail = 0;
    if (desk) {
      avail = roomWidth(card);
      cols = Math.max(1, Math.min(list.length || 1, Math.floor((avail - 12) / 290)));
      colW = Math.floor(Math.max(240, Math.min(370, (avail - 12) / cols)));
      // Schmale Zeile (Handy hoch): wie die Handy-Liste untereinander.
      if (avail && avail < 560) { desk = false; cols = 1; }
    }

    var rows = {};
    var items = !show ? [] : list.map(function (rec) {
      var dur = Number(rec.dur), pos = Number(rec.pos);
      var hasBar = rec.kind === 'player' && isFinite(dur) && dur > 0 && isFinite(pos);
      rows[rec.key] = { pos: pos, dur: dur, at: Number(rec.posAt) || 0, playing: !!rec.playing, bar: hasBar };
      var sub = [String(rec.subtitle || '').trim(), device(rec, states)].filter(Boolean);
      if (sub.length === 2 && sub[0] === sub[1]) sub.pop();
      return [rec.key, rec.title, sub.join(' \u00b7 '), rec.art || '', !!rec.playing, !!(rec.controls || {}).toggle, hasBar, rec.kind];
    });
    e.rows = rows;
    e.list = list;
    // Signatur ohne Fortschritt: der Balken läuft über progress(), ohne die Zeilen neu zu bauen.
    var sig = JSON.stringify([items, desk, cols, colW, avail]);
    var w = e.host.shadowRoot.querySelector('.w');
    if (e.sig !== sig) {
      e.sig = sig;
      var html = items.map(function (it, i) {
        var key = it[0], title = it[1], sub = it[2], artU = it[3], playing = it[4], tog = it[5], hasBar = it[6], kind = it[7];
        var cls = 'r';
        if (desk) { if (i % cols) cls += ' vs'; if (i >= cols) cls += ' hs'; } else if (i) cls += ' hs';
        var art = artU ? ' style="background-image:url(&quot;' + esc(artU) + '&quot;)"' : '';
        return '<div class="' + cls + '" data-k="' + esc(key) + '" role="button" tabindex="0" aria-label="' + esc(title) + '">'
          + '<div class="cv"' + art + '>' + (artU ? '' : svg(kind === 'player' ? P.note : P.game, 24)) + '</div>'
          + '<div class="m"><div class="t">' + esc(title) + '</div>'
          + '<div class="s">' + esc(sub) + '</div>'
          + '<div class="b' + (hasBar ? '' : ' n') + '"><i style="width:' + pct(rows[key]) + '%"></i></div></div>'
          + (tog
            ? '<button type="button" class="p' + (playing ? '' : ' o') + '" aria-label="' + esc(T(playing ? 'Pausieren' : 'Abspielen')) + '">'
              + svg(playing ? P.pause : P.play, 22) + '</button>'
            : '')
          + '</div>';
      }).join('');
      if (html) {
        html = '<div class="l' + (desk ? ' d' : '') + '"' + (desk ? ' style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))"' : '') + '>' + html + '</div>';
      }
      w.innerHTML = html;
      if (e.kind === 'room') {
        // Feste Breite statt max-content: die Zeilen sollen umbrechen, nicht seitlich scrollen.
        e.host.style.cssText = !html ? 'display:none'
          : desk ? 'display:block;width:' + (cols * colW + 12) + 'px;max-width:' + (avail || 9999) + 'px;padding:2px 0 10px'
            : 'display:block;width:' + (avail || 320) + 'px;padding:2px 0 10px';
      } else {
        e.host.style.cssText = !html ? 'display:none'
          : 'display:block;width:100%;box-sizing:border-box;padding:0 max(env(safe-area-inset-right), var(--casora-rail-left, 16px)) 14px max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px))';
      }
    } else progress(e);
  }

  function pct(r) {
    if (!r || !r.bar) return '0';
    var p = r.pos + (r.playing && r.at ? (Date.now() - r.at) / 1000 : 0);
    return (Math.max(0, Math.min(1, p / r.dur)) * 100).toFixed(2);
  }

  function progress(e) {
    var w = e.host && e.host.shadowRoot && e.host.shadowRoot.querySelector('.w');
    if (!w) return;
    Array.prototype.forEach.call(w.querySelectorAll('.r'), function (row) {
      var r = e.rows[row.getAttribute('data-k')];
      var bar = row.querySelector('.b i');
      if (r && r.bar && r.playing && bar) bar.style.width = pct(r) + '%';
    });
  }

  // Die bisherige (unsichtbare) Karte zu einer Zeile – ihr Tipp öffnet das gewohnte Popup.
  function original(e, key) {
    var tg = target(e), root = tg && tg.shadowRoot;
    if (!root) return null;
    if (e.kind === 'room') {
      var id = key === 'discord' ? 'activity_discord' : key === 'steam' ? 'activity_steam'
        : /^psn\d$/.test(key) ? 'activity' + key.slice(3) : key;
      var fld = root.getElementById(id);
      return fld && fld.querySelector('button-card');
    }
    var mr = root.getElementById('media_row');
    var inner = mr && mr.querySelector('button-card');
    var isr = inner && inner.shadowRoot;
    var slots = window._casoraNPSlotState || {};
    for (var i = 1; i <= 9 && isr; i++) {
      var st = slots['media' + i];
      if (st && st._npHoldSrc && st._npHoldSrc.key === key) {
        var f2 = isr.getElementById('media' + i);
        var bc = f2 && f2.querySelector('button-card');
        if (bc) return bc;
      }
    }
    return null;
  }

  function open(e, key) {
    var rec = (e.list || []).filter(function (r) { return r.key === key; })[0];
    var orig = original(e, key);
    var hc = orig && orig.shadowRoot && orig.shadowRoot.querySelector('ha-card');
    if (hc) {
      window._casoraLastTile = { el: orig, at: Date.now() };
      hc.dispatchEvent(new CustomEvent('action', { detail: { action: 'tap' } }));
      return;
    }
    if (rec && rec.entity) {
      if (window.casoraPopup && window.casoraPopup.moreInfo) window.casoraPopup.moreInfo(rec.entity);
      else {
        var ha = document.querySelector('home-assistant');
        if (ha) ha.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: rec.entity } }));
      }
    }
  }

  function toggle(e, key, btn) {
    var rec = (e.list || []).filter(function (r) { return r.key === key; })[0];
    var h = getHass();
    if (!rec || !rec.entity || !h) return;
    // Sofort umschalten; der nächste Zustand aus HA bestätigt oder korrigiert.
    var playing = !btn.classList.contains('o');
    btn.classList.toggle('o', playing);
    btn.innerHTML = svg(playing ? P.play : P.pause, 22);
    btn.setAttribute('aria-label', T(playing ? 'Abspielen' : 'Pausieren'));
    var r = e.rows[key];
    if (r) { r.pos = Number(pct(r)) / 100 * r.dur; r.at = Date.now(); r.playing = !playing; }
    try { card_haptic(e.card); } catch (err) { /* egal */ }
    h.callService('media_player', 'media_play_pause', { entity_id: rec.entity });
    // Bleibt HA die Antwort schuldig, zeigt die Zeile nach kurzer Zeit wieder den echten Zustand.
    setTimeout(function () { e.sig = null; }, 4000);
  }

  function card_haptic(el) {
    el.dispatchEvent(new CustomEvent('haptic', { detail: 'light', bubbles: true, composed: true }));
  }

  function bind(e, sr) {
    var act = function (ev) {
      var path = ev.composedPath ? ev.composedPath() : [];
      var btn = null, row = null;
      for (var i = 0; i < path.length && path[i] !== sr; i++) {
        var n = path[i];
        if (!n.classList) continue;
        if (!btn && n.classList.contains('p')) btn = n;
        if (n.classList.contains('r')) { row = n; break; }
      }
      if (!row) return;
      ev.stopPropagation();
      if (ev.cancelable && ev.type !== 'pointerup') ev.preventDefault();
      var key = row.getAttribute('data-k');
      if (btn) toggle(e, key, btn); else { try { card_haptic(e.card); } catch (err) { /* egal */ } open(e, key); }
    };
    // Antippen selbst erkennen: die umgebende button-card (Aktions-Handler am ha-card) unterdrückt
    // am Handy sonst den click. Ihre Touch-/Maus-Ereignisse bekommt sie daher nicht zu sehen.
    var down = null, last = 0;
    ['touchstart', 'touchend', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].forEach(function (t) {
      sr.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true });
    });
    sr.addEventListener('pointerdown', function (ev) { down = { x: ev.clientX, y: ev.clientY, t: Date.now() }; });
    sr.addEventListener('pointercancel', function () { down = null; });
    sr.addEventListener('pointerup', function (ev) {
      var d = down; down = null;
      if (!d || Date.now() - d.t > 700 || Math.abs(ev.clientX - d.x) > 10 || Math.abs(ev.clientY - d.y) > 10) return;
      last = Date.now();
      act(ev);
    });
    sr.addEventListener('click', function (ev) {
      if (Date.now() - last < 700) { ev.stopPropagation(); return; }
      act(ev);
    });
    sr.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var t = ev.composedPath ? ev.composedPath()[0] : ev.target;
      if (t && t.classList && t.classList.contains('p')) return;
      act(ev);
    });
  }
})();
