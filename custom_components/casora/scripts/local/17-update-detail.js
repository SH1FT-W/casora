// ── Update-Detailseite (Casora 1.5, Entwurf A) ────────────────────────────────
// Ein Tipp auf ein Update (Zeile mit data-casora-mi="update.…", z. B. im Update-Popup) öffnet statt
// HAs Update-Dialog eine Detailseite im selben Popup, mit ‹ zurück zur Liste (cfg.back, casora-core.js).
// Links Version, „Vorher sichern“ und KI-Check, darunter Installieren/Überspringen; rechts die
// KI-Einschätzung (falls es eine Warnung gibt) und „Was ist neu“ aus HAs Versionshinweisen
// (WebSocket update/release_notes, sonst release_summary).
//   window._casoraUpdDetail.open(id)                 – Detailseite öffnen
//   window._casoraUpdDetail.sec(part, id, states, hass, el)
//   window._casoraUpdDetail.md(text)                 – Versionshinweise (Markdown) → schlichtes HTML
//   window._casoraUpdDetail.installSpec(id, st)      – Dienstaufruf für Installieren (mit/ohne Sicherung)
(function () {
  if (window._casoraUpdDetail) return;
  var D = window._casoraUpdDetail = {};
  var AI = 'sensor.casora_update_ki_analyse';
  var F_INSTALL = 1, F_BACKUP = 8, F_NOTES = 16;

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var nameOf = function (states, id) {
    var e = states[id]; if (!e) return id;
    return String(e.attributes.title || e.attributes.friendly_name || id).replace(/\s+(Update|Firmware|Software-Aktualisierung)$/i, '').trim() || id;
  };
  var areaOf = function (hass, id) {
    var R = (hass && hass.entities) || {}, Dv = (hass && hass.devices) || {}, A = (hass && hass.areas) || {};
    var e = R[id] || {}, a = e.area_id || (Dv[e.device_id] || {}).area_id;
    return a && A[a] ? A[a].name : null;
  };
  var kindOf = function (st) {
    var dc = (st.attributes || {}).device_class;
    if (dc === 'firmware') return 'Firmware';
    return null;
  };
  var aiOf = function (states, id) {
    var s = states[AI], e = states[id];
    var list = (s && s.attributes && s.attributes.analysen) || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it && it.id === id && e && String(it.to) === String(e.attributes.latest_version)) return it;
    }
    return null;
  };
  var AI_TXT = { breaking: ['Breaking Change', 'bad'], action: ['Braucht Aufmerksamkeit', 'warn'], info: ['Unkritisch', 'good'],
    unknown: ['Unklar', null], running: ['KI prüft …', null], error: ['KI-Fehler', null], none: ['Nicht geprüft', null] };
  var aiKey = function (it) {
    if (!it) return 'none';
    if (it.status === 'running') return 'running';
    if (it.status === 'error') return 'error';
    return it.level || 'unknown';
  };

  // Markdown der Versionshinweise → schlichtes HTML (Überschriften fett, Listen, Fett/Code, Links als Text).
  D.md = function (text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var out = [], list = false;
    var inline = function (s) {
      return esc(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/(^|\s)@([\w-]+)/g, '$1@$2');
    };
    var fence = false;
    lines.forEach(function (l) {
      var m;
      // Code-Blöcke als schlichter Text; Tabellenzeilen als „a · b · c“ (sonst sprengten sie die Breite).
      if (/^\s*```/.test(l)) { fence = !fence; return; }
      if (/^\s*\|?\s*:?-{2,}/.test(l)) return;
      if (/^\s*\|.*\|\s*$/.test(l)) l = l.replace(/^\s*\||\|\s*$/g, '').split('|').map(function (x) { return x.trim(); }).filter(Boolean).join(' · ');
      l = l.replace(/<[^>]+>/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '');
      if ((m = /^\s*[-*+]\s+(.*)$/.exec(l))) {
        if (!list) { out.push('<ul>'); list = true; }
        out.push('<li>' + inline(m[1]) + '</li>');
        return;
      }
      if (list) { out.push('</ul>'); list = false; }
      if ((m = /^\s*#{1,6}\s+(.*)$/.exec(l))) { out.push('<p class="h">' + inline(m[1]) + '</p>'); return; }
      if (/^\s*(<!--.*-->)?\s*$/.test(l)) return;
      out.push('<p>' + inline(l) + '</p>');
    });
    if (list) out.push('</ul>');
    return out.join('');
  };

  // Versionshinweise je Update und Version einmal holen; danach die offenen Bereiche neu zeichnen.
  var notes = {};
  D.notes = function (hass, id, el) {
    var st = hass && hass.states && hass.states[id];
    if (!st) return null;
    var a = st.attributes || {};
    var key = id + '|' + a.latest_version;
    var hit = notes[key];
    if (hit) { if (el && hit.busy) hit.wait.push(el); return hit.text; }
    var feats = Number(a.supported_features || 0);
    if (!(feats & F_NOTES) || !hass.callWS) { notes[key] = { text: a.release_summary || '', busy: false, wait: [] }; return notes[key].text; }
    var h = notes[key] = { text: null, busy: true, wait: el ? [el] : [] };
    hass.callWS({ type: 'update/release_notes', entity_id: id }).then(function (r) {
      h.text = typeof r === 'string' && r.trim() ? r : (a.release_summary || '');
    }, function () { h.text = a.release_summary || ''; }).then(function () {
      h.busy = false;
      h.wait.forEach(function (w) {
        try {
          if (typeof window.casoraKick === 'function') window.casoraKick(w);
          else if (typeof w.requestUpdate === 'function') w.requestUpdate('_config', undefined);
        } catch (e) { /* Popup schon zu */ }
      });
      h.wait = [];
    });
    return null;
  };

  // „Vorher sichern“ je Update (Standard an, wenn die Integration es kann).
  var backup = window._casoraUpdBackup = window._casoraUpdBackup || {};
  var wantsBackup = function (id) { return backup[id] !== false; };
  var installSpec = function (id, st) {
    var feats = Number((st.attributes || {}).supported_features || 0);
    var data = (feats & F_BACKUP) && wantsBackup(id) ? { backup: true } : {};
    return { domain: 'update', service: 'install', data: data, target: { entity_id: id } };
  };
  // Tipps auch auf touchend (14.10.2026): am Handy schluckt die Teilkarte (button-card) das Klick-Echo nach dem
  // Fingertipp – „Überspringen“ ging (casora-core wertet touchend aus), „Installieren“ tat nichts.
  var tp = null, lastTouch = 0;
  document.addEventListener('touchstart', function (ev) {
    var t0 = ev.touches && ev.touches[0];
    tp = t0 ? { x: t0.clientX, y: t0.clientY, moved: false } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (ev) {
    var t1 = ev.touches && ev.touches[0];
    if (tp && t1 && (Math.abs(t1.clientX - tp.x) > 10 || Math.abs(t1.clientY - tp.y) > 10)) tp.moved = true;
  }, { capture: true, passive: true });
  var onTap = function (attr, fn) {
    var h = function (ev) {
      var p = (ev.composedPath && ev.composedPath()) || [];
      for (var i = 0; i < p.length; i++) {
        var n = p[i];
        if (!n || !n.getAttribute || !n.hasAttribute(attr)) continue;
        if (ev.type === 'touchend') {
          var moved = !!(tp && tp.moved);
          tp = null;
          if (moved) return;   // Scrollgeste
          lastTouch = Date.now();
        } else if (Date.now() - lastTouch < 700) { ev.preventDefault(); ev.stopPropagation(); return; }   // Klick-Echo
        if (ev.cancelable) ev.preventDefault();
        ev.stopPropagation();
        fn(n, n.getAttribute(attr));
        return;
      }
    };
    document.addEventListener('touchend', h, true);
    document.addEventListener('click', h, true);
  };
  onTap('data-casora-upd-bk', function (n, id) {
    if (window.casoraHaptic) window.casoraHaptic('selection');
    backup[id] = !wantsBackup(id);
    n.setAttribute('aria-checked', wantsBackup(id) ? 'true' : 'false');
  });
  // Installieren: „Vorher sichern“ erst beim Tipp lesen – der Schalter steht in einer anderen Teilkarte.
  onTap('data-casora-upd-install', function (n, id) {
    if (n.classList.contains('dis')) return;
    if (window.casoraHaptic) window.casoraHaptic('light');
    var ha = document.querySelector('home-assistant'), st = ha && ha.hass && ha.hass.states[id];
    if (!st) return;
    var spec = installSpec(id, st);
    D.lastInstall = spec;
    var go = function () { ha.hass.callService(spec.domain, spec.service, spec.data, spec.target); };
    if (window.casoraConfirmSpec) window.casoraConfirmSpec(spec).then(function (ok) { if (ok) go(); }); else go();
  });

  D.installSpec = installSpec;

  D.open = function (id) {
    var P = window.casoraPopup, K = window._casoraSoftKit, UI = window._casoraUI;
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (!P || !K || !UI || !hass || !hass.states[id]) return false;
    var prev = P.current;
    var watch = [id, AI];
    var call = function (part) {
      return 'return window._casoraUpdDetail ? window._casoraUpdDetail.sec(' + JSON.stringify(part) + ', '
        + JSON.stringify(id) + ', states, hass, this) : "";';
    };
    var st = hass.states;
    var f = { hero: { card: K.secCard(watch, call('hero'), st) }, ver: { card: K.secCard(watch, call('ver'), st) },
      act: { card: K.secCard(watch, call('act'), st) }, notes: { card: K.secCard(watch, call('notes'), st) } };
    var cfg = {
      title: nameOf(st, id),
      content: K.layout({ fields: f, top: ['hero'], left: ['ver', 'act'], right: ['notes'], narrowOrder: ['ver', 'notes', 'act'] }),
      back: prev ? function () { P.open(prev); } : null,
      dismiss_on_background: prev ? prev.dismiss_on_background : true,
      style: (prev && prev.style) || '--popup-min-width: min(900px, 92vw); --popup-max-width: min(920px, 92vw);',
      popup_styles: prev && prev.popup_styles,
    };
    P.open(cfg);
    return true;
  };

  // Pillen wie in den Geräte-Popups (Weich: window._casoraHH).
  var pills = function (keys) {
    var HH = window._casoraHH;
    var css = HH && HH.pillCss ? HH.pillCss : '';
    return css + '<style>.hh-pill > *{pointer-events:none;}</style><div class="hh-pills" style="justify-content:flex-start;margin-top:4px;">'
      + keys.map(function (k) {
        return '<div class="hh-pill' + (k.pri ? ' pri' : '') + (k.off ? ' dis' : '') + '"'
          + (k.off || !k.svc ? '' : ' data-casora-svc="' + esc(JSON.stringify(k.svc)) + '"') + (k.attr || '') + '>'
          + '<ha-icon icon="' + esc(k.icon) + '" style="--mdc-icon-size:20px;width:20px;height:20px;display:block;"></ha-icon>'
          + '<span>' + esc(T(k.label)) + '</span></div>';
      }).join('') + '</div>';
  };

  D.sec = function (part, id, states, hass, el) {
    var UI = window._casoraUI;
    var st = states && states[id];
    if (!UI || !st) return '';
    var a = st.attributes || {};
    var feats = Number(a.supported_features || 0);
    var busy = !!a.in_progress;
    var done = st.state === 'off';
    var it = aiOf(states, id), k = aiKey(it);
    if (part === 'hero') {
      var head = busy ? 'Wird installiert' + (a.update_percentage != null ? ' · ' + Math.round(a.update_percentage) + ' %' : '')
        : done ? 'Aktuell' : 'Neue Version ' + (a.latest_version || '');
      return UI.line(head, [kindOf(st), areaOf(hass, id)].filter(Boolean), { tone: done ? 'good' : null });
    }
    if (part === 'ver') {
      var rows = [
        { icon: 'mdi:tag-outline', iconTone: 'accent', label: 'Installiert', value: a.installed_version || '–' },
        { icon: 'mdi:tag-arrow-up-outline', iconTone: done ? 'accent' : 'good', label: 'Neu', value: a.latest_version || '–', valueTone: done ? null : 'good' },
      ];
      if (states[AI]) {
        var tx = AI_TXT[k] || AI_TXT.unknown;
        rows.push({ icon: 'mdi:robot-outline', iconTone: tx[1] || 'accent', label: 'KI-Check', value: tx[0], valueTone: tx[1],
          sub: it && it.headline ? it.headline : null });
      }
      var out = UI.group(rows, 'Version');
      if (feats & F_BACKUP && !done) {
        var on = wantsBackup(id);
        out += '<div role="switch" tabindex="0" data-casora-upd-bk="' + esc(id) + '" aria-checked="' + on + '" class="cud-bk">'
          + '<style>.cud-bk{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;cursor:pointer;'
          + 'padding:var(--casora-soft-row-pad, 12px 18px);border-radius:var(--casora-popup-row-radius, 22px);'
          + 'background:var(--casora-popup-row-fill, rgba(127,127,127,.10));font-size:15px;font-weight:600;}'
          + '.cud-bk i{width:46px;height:28px;border-radius:999px;position:relative;flex:none;transition:background-color .16s;'
          + 'background:var(--casora-soft-control-fill, rgba(127,127,127,.25));}'
          + '.cud-bk i::after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;'
          + 'transition:transform .16s;box-shadow:0 1px 3px rgba(0,0,0,.25);}'
          + '.cud-bk[aria-checked="true"] i{background:var(--casora-popup-accent, var(--casora-color-teal, #4E9E95));}'
          + '.cud-bk[aria-checked="true"] i::after{transform:translateX(18px);}.cud-bk > *{pointer-events:none;}</style>'
          + '<span>' + esc(T('Vorher sichern')) + '</span><i></i></div>';
      }
      return out;
    }
    if (part === 'act') {
      if (done) return '';
      var keys = [];
      if (feats & F_INSTALL) {
        keys.push({ icon: busy ? 'mdi:progress-download' : 'mdi:download', label: busy ? 'Wird installiert' : 'Installieren', pri: true, off: busy,
          svc: null, attr: ' data-casora-upd-install="' + esc(id) + '" data-casora-upd-spec="' + esc(JSON.stringify(installSpec(id, st))) + '"' });
      }
      if (!busy) keys.push({ icon: 'mdi:debug-step-over', label: 'Überspringen', svc: { domain: 'update', service: 'skip', data: {}, target: { entity_id: id } } });
      return keys.length ? pills(keys) : '';
    }
    if (part === 'notes') {
      var secs = [];
      // KI-Einschätzung nur bei einer Warnung ausführlich (sonst steht das Urteil links in einer Zeile).
      if (it && (it.level === 'breaking' || it.level === 'action') && !it.ack && (it.summary || (it.todo || []).length)) {
        secs.push(UI.label('KI-Einschätzung') + '<div class="cud-txt">' + (it.summary ? '<p>' + esc(it.summary) + '</p>' : '')
          + ((it.todo || []).length ? '<ul>' + it.todo.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') + '</div>');
      }
      var txt = D.notes(hass, id, el);
      var link = /^https:\/\//.test(a.release_url || '') ? a.release_url : '';
      var head = UI.label('Was ist neu').replace(/<\/div>$/, link ? '<div data-casora-link="' + esc(link) + '" style="cursor:pointer;font-size:13px;font-weight:600;'
        + 'color:var(--casora-soft-sub, var(--secondary-text-color));">' + esc(T('Alle Hinweise')) + ' ›</div></div>' : '</div>');
      var body = txt == null ? '<p class="cud-sub">' + esc(T('Wird geladen …')) + '</p>'
        : txt ? D.md(txt) : '<p class="cud-sub">' + esc(T('Keine Versionshinweise')) + '</p>';
      secs.push(head + '<div class="cud-txt cud-notes">' + body + '</div>');
      return '<style>.cud-txt{padding:14px 18px;border-radius:var(--casora-popup-row-radius, 22px);background:var(--casora-popup-row-fill, rgba(127,127,127,.10));'
        + 'font-size:14.5px;line-height:1.55;color:var(--casora-popup-tiles-text-primary, inherit);text-align:left;overflow-wrap:anywhere;'
        + 'word-break:break-word;min-width:0;max-width:100%;box-sizing:border-box;}'
        + '.cud-txt *{max-width:100%;white-space:normal;overflow-wrap:anywhere;word-break:break-word;}'
        + '.cud-notes{max-height:min(46vh, 420px);overflow-y:auto;overflow-x:hidden;}'
        + '.cud-txt p{margin:0 0 8px;}.cud-txt p.h{font-weight:700;margin-top:6px;}.cud-txt ul{margin:0 0 8px;padding-left:20px;}'
        + '.cud-txt li{margin:2px 0;}.cud-txt code{font-size:13px;padding:1px 5px;border-radius:6px;background:rgba(127,127,127,.15);}'
        + '.cud-sub{opacity:.65;}</style>' + secs.join('<div style="height:16px"></div>');
    }
    return '';
  };

  // Tipp auf eine Update-Zeile: Detailseite statt HAs Dialog (casora-core.js, data-casora-mi).
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (id) {
    if (!/^update\./.test(id || '')) return false;
    return D.open(id);
  });
})();
