// ── Update-Popup: KI-Check (23.09.2026) ─────────────────────────────────────
// Rendert die Einschätzungen aus sensor.casora_update_ki_analyse (Automation
// "Casora: Update-KI-Analyse", Claude liest die Release-Notes und prüft sie
// gegen dieses System). Das Template casora_popup_updates ruft nur
// window._casoraUpdAi(states, h) auf, die Logik bleibt hier update-sicher.
(function () {
  var SENSOR = 'sensor.casora_update_ki_analyse';
  /* Neutrale Pillen (Offen/Unklar/Fehler): --casora-upd-ai-neutral, Weich setzt einen lesbaren Ton
     (Sand-Grund über color-mix, dunkle Schrift); ohne Variable bleibt das bisherige Weiß. */
  var LV = {
    breaking: { t: 'Breaking', c: 'var(--casora-popup-ui-bad, #FF453A)', i: 'mdi:alert-octagon' },
    action:   { t: 'Handeln', c: 'var(--casora-popup-ui-warn, #FF9F0A)', i: 'mdi:alert' },
    info:     { t: 'Unkritisch', c: 'var(--casora-popup-ui-good, #30D158)', i: 'mdi:check-circle' },
    unknown:  { t: 'Unklar', c: 'var(--casora-upd-ai-neutral, rgba(255,255,255,0.45))', i: 'mdi:help-circle' },
    running:  { t: 'Prüft …', c: 'var(--casora-color-teal, #00C3D0)', i: 'mdi:robot-outline' },
    error:    { t: 'Fehler', c: 'var(--casora-upd-ai-neutral, rgba(255,255,255,0.45))', i: 'mdi:alert-circle-outline' },
    none:     { t: 'Offen', c: 'var(--casora-upd-ai-neutral, rgba(255,255,255,0.45))', i: 'mdi:robot-outline' },
  };
  var RANK = { breaking: 0, action: 1, running: 2, unknown: 3, error: 4, none: 5, info: 6 };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.';
  };
  var OPEN = window._casoraUpdAiOpen = window._casoraUpdAiOpen || {};

  /* Gesperrt: KI sagt breaking/action für genau diese Version und die
     Einschätzung ist noch nicht bestätigt (ack). Nutzen Popup-Zeilen und
     der "Alle aktualisieren"-Kopf im Template. */
  var entryOf = function (id, states) {
    var s = states[SENSOR], e = states[id];
    if (!s || !e || e.state !== 'on') return null;
    var list = (s.attributes && s.attributes.analysen) || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it && it.id === id && String(it.to) === String(e.attributes.latest_version)) return it;
    }
    return null;
  };
  /* KI-Update-Check aus (Einstellungen → KI, 1.0.3): der Sensor trägt zeitplan "off".
     Dann keine KI-Zeilen, keine Sperre, keine KI-Zusammenfassung. */
  window._casoraUpdAiOff = function (states) {
    var s = states && states[SENSOR];
    return !!(s && s.attributes && s.attributes.zeitplan === 'off');
  };
  window._casoraUpdAiBlocked = function (id, states) {
    if (window._casoraUpdAiOff(states)) return false;
    var it = entryOf(id, states);
    return !!(it && it.status === 'done' && (it.level === 'breaking' || it.level === 'action') && !it.ack);
  };

  /* 1.0.5: Aktion mit Handy-Knopf (casora-core .hui-actx): Text, Symbol und Vorlese-Text getrennt setzen. */
  var setAct = function (a, txt, icon) {
    var at = a.querySelector('.hui-at');
    if (!at) { a.textContent = txt; return; }
    at.textContent = txt;
    var ic = a.querySelector('.hui-ab ha-icon');
    if (ic && icon) ic.setAttribute('icon', icon);
    a.setAttribute('aria-label', typeof window.casoraTr === 'function' ? window.casoraTr(txt) : txt);
  };
  /* Die Update-Zeilen baut das Popup einmal beim Öffnen, deshalb wird die
     Sperre direkt im DOM gesetzt/aufgehoben: data-casora-mi (öffnet den
     HA-Installationsdialog) und das Live-Label werden geparkt, die Zeile
     ausgegraut. Nur Zeilen mit Live-Aktion (Liste "Verfügbare Updates"),
     nicht die Übersprungen-Zeilen. */
  var deep = function (root, sel, out) {
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, sel, out); });
    return out;
  };
  var sweep = function () {
    var ha = document.querySelector('home-assistant');
    var hass = ha && ha.hass; if (!hass) return;
    var acts = deep(ha.shadowRoot, '[data-casora-live="act"], [data-casora-live-blocked]', []);
    acts.forEach(function (a) {
      var row = a.closest('.hui-row'); if (!row) return;
      var id = a.getAttribute('data-casora-ent'); if (!id) return;
      var block = window._casoraUpdAiBlocked(id, hass.states);
      var isB = a.hasAttribute('data-casora-live-blocked');
      /* Wie die Bestätigungszeilen im Aquarium-Popup: Tipp auf die Zeile
         schiebt rechts „Bestätigen“ rein (casora-core: data-casora-arm +
         .hui-cf/data-casora-cf), erst das gibt das Update frei. Logo und
         Name bleiben bis dahin ausgegraut. */
      var inner = row.querySelector('.hui-inner');
      var dim = inner ? [inner.children[0], inner.children[1]] : [];
      if (block && !isB) {
        a.setAttribute('data-casora-live-blocked', a.getAttribute('data-casora-live'));
        a.removeAttribute('data-casora-live');
        a.setAttribute('data-casora-txt', (a.querySelector('.hui-at') || a).textContent);
        a.setAttribute('data-casora-col', a.style.color);
        setAct(a, 'Freigeben', 'mdi:lock-open-variant-outline');
        a.style.color = 'var(--casora-popup-ui-warn, #FF9F0A)';
        if (row.hasAttribute('data-casora-mi')) { row.setAttribute('data-casora-mi-blocked', row.getAttribute('data-casora-mi')); row.removeAttribute('data-casora-mi'); }
        row.setAttribute('data-casora-arm', '');
        if (!row.querySelector('.hui-cf')) {
          var cf = document.createElement('div');
          cf.className = 'hui-cf';
          cf.setAttribute('data-casora-cf', JSON.stringify(window.casoraSvc('casora_update_ki_bestaetigen', { entity_id: id })));
          cf.textContent = 'Bestätigen';
          row.appendChild(cf);
        }
        dim.forEach(function (d) { if (d) d.style.opacity = '0.5'; });
      } else if (!block && isB) {
        a.setAttribute('data-casora-live', a.getAttribute('data-casora-live-blocked'));
        a.removeAttribute('data-casora-live-blocked');
        setAct(a, a.getAttribute('data-casora-txt') || 'Aktualisieren', 'mdi:download');
        a.style.color = a.getAttribute('data-casora-col') || '';
        if (row.hasAttribute('data-casora-mi-blocked')) { row.setAttribute('data-casora-mi', row.getAttribute('data-casora-mi-blocked')); row.removeAttribute('data-casora-mi-blocked'); }
        row.removeAttribute('data-casora-arm');
        row.classList.remove('armed');
        var cf2 = row.querySelector('.hui-cf'); if (cf2) cf2.remove();
        dim.forEach(function (d) { if (d) d.style.opacity = ''; });
      }
    });
  };
  /* Auf-/Zuklappen selbst steuern: Im Popup schluckt ein Klick-Handler
     (preventDefault) das native <details>-Toggle, mit der Maus tat sich
     nichts. Capture auf window läuft vor allem anderen; Touch über
     touchend (ohne Wischen), der Folge-Klick wird dann ignoriert. */
  var sumOf = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.tagName === 'SUMMARY' && n.parentNode && n.parentNode.dataset && n.parentNode.dataset.id
          && n.closest && n.closest('.hua')) return n;
      if (n && n.classList && n.classList.contains('hua')) return null;
    }
    return null;
  };
  /* Release-Notes-Link: auch der Klick auf <a> wird im Popup verschluckt, daher selbst öffnen. */
  var linkOf = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.classList && n.classList.contains('hua-link')) return n;
      if (n && n.classList && n.classList.contains('hua')) return null;
    }
    return null;
  };
  var openLink = function (a) { var u = a.getAttribute('href'); if (u && /^https?:\/\//.test(u)) window.open(u, '_blank', 'noopener'); };
  var flip = function (sm) {
    var d = sm.parentNode;
    d.open = !d.open;
    OPEN[d.dataset.id] = d.open;
  };
  var tStart = null, tFlip = 0;
  window.addEventListener('touchstart', function (ev) {
    var t = ev.touches && ev.touches[0];
    tStart = t ? { x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    var ln = linkOf(ev);
    if (ln && tStart) {
      var t0 = ev.changedTouches && ev.changedTouches[0];
      if (t0 && (Math.abs(t0.clientX - tStart.x) > 10 || Math.abs(t0.clientY - tStart.y) > 10)) return;
      tFlip = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation();
      openLink(ln); return;
    }
    var sm = sumOf(ev); if (!sm || !tStart) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientX - tStart.x) > 10 || Math.abs(t.clientY - tStart.y) > 10)) return;
    flip(sm); tFlip = Date.now();
    if (ev.cancelable) ev.preventDefault();
    ev.stopPropagation();
  }, { capture: true, passive: false });
  window.addEventListener('click', function (ev) {
    var ln = linkOf(ev);
    if (ln) { ev.preventDefault(); ev.stopPropagation(); if (Date.now() - tFlip >= 700) openLink(ln); return; }
    var sm = sumOf(ev); if (!sm) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - tFlip < 700) return;
    flip(sm);
  }, true);

  /* Logos: HACS setzt entity_picture auf brands.home-assistant.io. Integrationen,
     die dort fehlen (z. B. uix), liefern dort das Bild "icon not available",
     bringen ihr Icon aber in custom_components/<domain>/brand/ mit. HA stellt es
     unter /api/brands/integration/<domain>/icon.png bereit, nur mit Anmeldung
     (roh per <img> = 403), daher per fetchWithAuth als Blob-URL laden und im
     Popup einsetzen. Ergebnis je Domain gemerkt (false = kein lokales Icon). */
  var BR = window._casoraBrand = window._casoraBrand || {};
  var CDN = window._casoraBrandCdn = window._casoraBrandCdn || {};
  var brandFallback = function (img) {
    var ic = document.createElement('ha-icon');
    ic.setAttribute('icon', 'mdi:puzzle-outline');
    ic.setAttribute('data-casora-brand-fallback', '');
    ic.style.cssText = '--mdc-icon-size:19px;width:19px;height:19px;display:flex;'
      + 'color:var(--casora-soft-glyph-off, var(--casora-popup-ui-tertiary, rgba(255,255,255,0.42)));';
    if (img.parentNode) img.parentNode.replaceChild(ic, img);
  };
  var bytesOf = function (hass, d) {
    return hass.fetchWithAuth('/api/brands/integration/' + d + '/icon.png')
      .then(function (r) { return r.ok && /^image\//.test(r.headers.get('content-type') || '') ? r.blob() : null; })
      .then(function (blob) { return blob ? blob.arrayBuffer().then(function (buf) { return { blob: blob, buf: buf }; }) : null; })
      .catch(function () { return null; });
  };
  var phP = null;
  var placeholder = function (hass) { return phP || (phP = bytesOf(hass, 'casora_kein_markenbild')); };
  var sameBytes = function (a, b) {
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    var x = new Uint8Array(a), y = new Uint8Array(b);
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  };
  var brandSweep = function () {
    var ha = document.querySelector('home-assistant');
    var hass = ha && ha.hass; if (!hass || !hass.fetchWithAuth) return;
    deep(ha.shadowRoot, 'img[src*="brands.home-assistant.io/_/"]', []).forEach(function (img) {
      var m = String(img.getAttribute('src')).match(/brands\.home-assistant\.io\/_\/([^/]+)\/(dark_)?icon/);
      if (!m) return;
      var d = m[1];
      /* Gar kein Markenbild (04.10.2026, z. B. Volkswagen Connect): neutrales Ersatzsymbol
         (Puzzleteil im Kreis) statt des Bildes „icon not available“. Erkennung: HAs
         /api/brands/integration liefert für fehlende Domains denselben Platzhalter wie für eine
         sicher unbekannte Domain (Bytevergleich); ältere HA ohne diesen Weg: die CDN-Adresse
         ohne „_“ antwortet dann mit 404 statt mit dem Platzhalter. */
      if (BR[d] === 'missing') { brandFallback(img); return; }
      if (typeof BR[d] === 'string') { img.src = BR[d]; return; }
      if (BR[d] === false) {
        if (CDN[d] === 'missing') { brandFallback(img); return; }
        if (CDN[d] !== undefined) return;
        CDN[d] = null;
        var probe = new Image();
        probe.onload = function () { CDN[d] = 'ok'; };
        probe.onerror = function () { CDN[d] = 'missing'; brandSweep(); };
        probe.src = 'https://brands.home-assistant.io/' + d + '/icon.png';
        return;
      }
      if (BR[d] !== undefined) return;
      BR[d] = null;
      Promise.all([bytesOf(hass, d), placeholder(hass)]).then(function (x) {
        var b = x[0], ph = x[1];
        if (b && ph && sameBytes(b.buf, ph.buf)) BR[d] = 'missing';
        else BR[d] = b ? URL.createObjectURL(b.blob) : false;
        brandSweep();
      }).catch(function () { BR[d] = false; brandSweep(); });
    });
  };
  window._casoraBrandSweep = brandSweep;
  /* Bei jedem Popup-Öffnen nachfassen (auch ohne anstehende Updates, dann gibt es keinen KI-Check). */
  var wrapOpen = function () {
    var P = window.casoraPopup;
    if (!P || !P.open) return false;
    if (P._hbWrapped) return true;
    var o = P.open;
    P.open = function () {
      var r = o.apply(this, arguments);
      [300, 1000, 2500, 5000].forEach(function (t) { setTimeout(brandSweep, t); });
      return r;
    };
    P._hbWrapped = true;
    return true;
  };
  if (!wrapOpen()) { var nW = 0, ivW = setInterval(function () { if (wrapOpen() || ++nW > 240) clearInterval(ivW); }, 250); }
  window._casoraUpdAiSweep = function () {
    [0, 250, 800, 2000].forEach(function (t) { setTimeout(sweep, t); });
    /* Der Verlauf lädt asynchron nach, deshalb länger nachfassen. */
    [0, 300, 1000, 2500, 5000].forEach(function (t) { setTimeout(brandSweep, t); });
  };

  window._casoraUpdAi = function (states, h) {
    h = h || {};
    var INK = h.INK || 'var(--casora-popup-tiles-text-primary, #fff)';
    var INK3 = h.INK3 || 'var(--casora-popup-ui-tertiary, rgba(255,255,255,0.42))';
    var ids = Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0 && states[id].state === 'on'; });
    if (!ids.length || window._casoraUpdAiOff(states)) return '';
    var s = states[SENSOR];
    var list = (s && s.attributes && s.attributes.analysen) || [];
    var byId = {};
    list.forEach(function (it) { if (it && it.id) byId[it.id] = it; });

    var items = ids.map(function (id) {
      var a = states[id].attributes || {};
      var it = byId[id];
      if (it && String(it.to) !== String(a.latest_version)) it = null;
      var key = !it ? 'none' : it.status === 'running' ? 'running' : it.status === 'error' ? 'error' : (LV[it.level] ? it.level : 'unknown');
      return { id: id, it: it, key: key, name: h.nameOf ? h.nameOf(id) : (a.friendly_name || id) };
    }).sort(function (x, y) { return (RANK[x.key] - RANK[y.key]) || x.name.localeCompare(y.name); });

    window._casoraUpdAiSweep();
    var nBad = items.filter(function (x) { return x.key === 'breaking' && !(x.it && x.it.ack); }).length;
    var nAct = items.filter(function (x) { return x.key === 'action' && !(x.it && x.it.ack); }).length;

    var css = '<style>'
      + '.hua details{border-top:1px solid var(--casora-popup-divider, rgba(255,255,255,0.08));}'
      + '.hua details:first-of-type{border-top:none;}'
      + '.hua summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;min-height:52px;'
      +   'padding:8px var(--casora-popup-row-pad-x, 16px);-webkit-tap-highlight-color:transparent;}'
      + '.hua summary::-webkit-details-marker{display:none;}'
      + '@media (hover:hover){.hua summary:hover{background:var(--casora-popup-row-hover, rgba(255,255,255,0.045));}}'
      + '.hua .nm{font-size:var(--casora-popup-row-label-size, 17px);font-weight:var(--casora-popup-row-label-weight, 400);letter-spacing:-0.01em;color:' + INK + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '.hua .hl{font-size:var(--casora-popup-sub-size, 13px);color:' + INK3 + ';margin-top:1px;white-space:normal;overflow-wrap:anywhere;line-height:1.3;}'
      + '.hua .pl{flex:none;font-size:12px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap;}'
      + '.hua .cv{flex:none;opacity:.35;transition:transform .2s;}'
      + '.hua details[open] .cv{transform:rotate(90deg);}'
      + '.hua .bd{padding:0 var(--casora-popup-row-pad-x, 16px) 14px calc(var(--casora-popup-row-pad-x, 16px) + 44px);'
      +   'font-size:13.5px;line-height:1.45;color:' + INK + ';white-space:normal;overflow-wrap:anywhere;}'
      + '.hua .lb{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + INK3 + ';margin:10px 0 3px;}'
      + '.hua ul{margin:0;padding-left:18px;} .hua li{margin:2px 0;}'
      + '.hua .ft{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;font-size:12.5px;color:' + INK3 + ';}'
      + '.hua .ft a{color:var(--casora-color-teal, #00C3D0);text-decoration:none;}'
      + '.hua .ak{margin-top:14px;cursor:pointer;text-align:center;font-size:15px;font-weight:600;color:#000;'
      +   'background:var(--casora-color-teal, #00C3D0);padding:11px 14px;border-radius:14px;}'
      + '.hua .hn{margin-top:12px;font-size:13px;font-weight:600;color:var(--casora-popup-ui-warn, #FF9F0A);}'
      + '.hua .ok{margin-top:12px;font-size:13px;font-weight:600;color:var(--casora-popup-ui-good, #30D158);}'
      + '.hua .bt{margin-left:auto;cursor:pointer;font-size:13px;font-weight:600;color:var(--casora-color-teal, #00C3D0);'
      +   'background:rgba(0,195,208,0.14);padding:6px 12px;border-radius:999px;}'
      + '</style>';

    var lead = function (id, key) {
      var pic = h.logoOf ? h.logoOf(id) : null;
      return '<div style="width:32px;height:32px;flex:none;display:grid;place-items:center;border-radius:9px;overflow:hidden;">'
        + (pic ? '<img src="' + esc(pic) + '" alt="" style="width:28px;height:28px;object-fit:contain;border-radius:50%;display:block;">'
               : '<ha-icon icon="' + LV[key].i + '" style="--mdc-icon-size:22px;color:' + LV[key].c + ';"></ha-icon>')
        + '</div>';
    };
    var svc = function (id, script) {
      return ' data-casora-svc="' + esc(JSON.stringify(window.casoraSvc(script || 'casora_update_ki_pruefen', { entity_id: id }))) + '"';
    };

    var rows = items.map(function (x) {
      var it = x.it || {}, L = LV[x.key];
      var sub = x.key === 'none' ? 'Noch nicht geprüft'
        : x.key === 'running' ? 'Claude liest die Release-Notes …'
        : x.key === 'error' ? (it.error || 'Prüfung fehlgeschlagen')
        : (it.headline || '');
      if ((x.key === 'breaking' || x.key === 'action') && !it.ack) sub = (sub ? sub + ' · ' : '') + 'Update gesperrt';
      var pill = '<span class="pl" style="color:' + L.c + ';background:color-mix(in srgb, ' + L.c + ' 16%, transparent);">' + L.t + '</span>';
      var body = '';
      if (it.summary) body += '<div>' + esc(it.summary) + '</div>';
      if (it.affects && it.affects.length) body += '<div class="lb">Betrifft bei dir</div><ul>' + it.affects.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      if (it.todo && it.todo.length) body += '<div class="lb">Zu tun</div><ul>' + it.todo.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>';
      var src = it.source && /^https?:\/\//.test(it.source) ? '<a class="hua-link" href="' + esc(it.source) + '" target="_blank" rel="noopener">Release-Notes</a>' : '';
      var when = it.checked && x.key !== 'none' ? (x.key === 'running' ? 'läuft seit ' : 'geprüft ') + ago(it.checked) : '';
      var needAck = (x.key === 'breaking' || x.key === 'action');
      if (needAck && !it.ack) {
        body += '<div class="hn">Zum Freigeben oben in der Update-Zeile auf „Freigeben“ tippen und bestätigen.</div>';
      } else if (needAck && it.ack) {
        body += '<div class="ok">✓ Freigegeben' + (it.ack_at ? ' ' + ago(it.ack_at) : '') + '</div>';
      }
      body += '<div class="ft">' + [src, when].filter(Boolean).join(' · ')
        + (x.key !== 'running' ? '<span class="bt"' + svc(x.id) + '>' + (x.key === 'none' ? 'Jetzt prüfen' : 'Neu prüfen') + '</span>' : '')
        + '</div>';
      /* Standard zugeklappt (Wunsch); aufgeklappt bleibt, was man
         selbst geöffnet hat. */
      var isOpen = !!OPEN[x.id];
      return '<details data-id="' + esc(x.id) + '"' + (isOpen ? ' open' : '')
        + '>'
        + '<summary>' + lead(x.id, x.key)
        + '<div style="flex:1;min-width:0;"><div class="nm">' + esc(x.name) + '</div>'
        + (sub ? '<div class="hl">' + esc(sub) + '</div>' : '') + '</div>'
        + pill + '<ha-icon class="cv" icon="mdi:chevron-right" style="--mdc-icon-size:20px;color:' + INK + ';"></ha-icon>'
        + '</summary><div class="bd">' + body + '</div></details>';
    }).join('');

    var cap = nBad ? nBad + (nBad === 1 ? ' Breaking Change betrifft dich' : ' Breaking Changes betreffen dich')
      : nAct ? (nAct === 1 ? '1 Update braucht Aufmerksamkeit' : nAct + ' Updates brauchen Aufmerksamkeit')
      : null;
    /* KI-Symbol wie bei Pflanzen-Doktor/Energie-Coach/Rad-Check (mdi:creation, 16px, Teal). headOut setzt t ungeescaped ein. */
    var kiLbl = '<span style="display:var(--casora-upd-ai-head-display, inline-flex);align-items:center;gap:6px;">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 16px;width:16px;height:16px;margin:var(--casora-upd-ai-glyph-my, 0px) 0;">'
      + '<ha-icon icon="mdi:creation" style="--mdc-icon-size:16px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:0;color:var(--casora-color-teal, #00C3D0);"></ha-icon></span>'
      + '<span>KI-Check</span></span>';
    /* Popup-Standard (24.09.2026): Überschrift außen (Sheet) bzw. in der Karte (Info), per --casora-lbl-out/-in umgeschaltet. */
    var headOut = '<div style="display:var(--casora-lbl-out, block);font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + INK + ');padding:var(--casora-upd-ai-head-pad, 2px 4px 10px);">' + kiLbl + '</div>';  /* +2/+2 = Innenabstand des „Alle aktualisieren“-Buttons links, sonst sitzt rechts 4 px höher; Weich unter „Mehr“: --casora-upd-ai-head-pad/-glyph-my, damit „KI-Check“ wie „System“ sitzt */
    /* Weich (04.10.2026): Überschrift exakt wie UI.label (System, Zuletzt aktualisiert …) – gleiche
       Schrift, Höhe und Abstände, das Funkel-Symbol macht die Zeile nicht höher. Sonst stand
       „KI-Check“ einige Pixel tiefer als die Überschrift der Nachbarspalte. Zeilen: Name wie alle
       Weich-Zeilen (14,5 px fett), Unterzeile 12,5 px in Zweitfarbe. */
    var soft = !!(window._casoraUI && window._casoraUI.soft && window._casoraUI.soft());
    if (soft) {
      headOut = '<div class="hui-slbl" style="font-family:var(--primary-font-family, system-ui);display:var(--casora-lbl-out, flex);align-items:center;gap:6px;margin:0 6px 10px;">'
        + '<ha-icon icon="mdi:creation" style="--mdc-icon-size:14px;width:14px;height:14px;margin:-2px 0;flex:none;display:flex;color:var(--casora-color-teal, #00C3D0);"></ha-icon>'
        + '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--casora-soft-label, var(--secondary-text-color));">KI-Check</div></div>';
      css += '<style>.hua .nm{font-size:14.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;}'
        + '.hua .hl{font-size:12.5px;font-weight:500;line-height:1.3;color:var(--casora-soft-sub, ' + INK3 + ');}</style>';
    }
    var head = '<div style="display:var(--casora-lbl-in, none);font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + INK + ');padding:var(--casora-popup-row-pad-y, 8px) var(--casora-popup-row-pad-x, 16px) 10px;">' + kiLbl + '</div>';
    return headOut + css
      + '<div class="hua" style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
      + 'overflow:hidden;box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
      + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);font-family:var(--primary-font-family, system-ui);text-align:left;">'
      + head
      + (cap ? '<div style="padding:12px var(--casora-popup-row-pad-x, 16px) 4px;font-size:13px;font-weight:600;color:'
          + (nBad ? LV.breaking.c : LV.action.c) + ';">' + cap + '</div>' : '')
      + rows + '</div>';
  };
})();

// ── Fußbodenheizung-Popup (23.09.2026) ───────────────────────────────────────
// Template casora_popup_fbh (über casora_thermostat gelegt) ruft nur
// window._casoraFbhPopup(entity, variables, states, hass) auf, die Logik bleibt
// hier update-sicher. Zwei Modi:
//  - Gruppe (climate-Gruppe mit member_entities): Haus-Temperatur,
//    Verlauf, "Ganzes Haus" (Modus mit Bestätigung, Zieltemperatur für alle
//    aktiven Räume), Räume + Heizkörper getrennt. Tipp auf einen Raum öffnet
//    das Raum-Popup.
//  - Einzelraum (Bosch Room Climate) bzw. Heizkörper (Zigbee-TRV): Ist/Soll,
//    Verlauf, Stepper + Balken, Modus, Details (Anforderung, Absenkung,
//    Kindersicherung bzw. Akku/Ventil/Fenster/Boost).
(function () {
  if (window._casoraFbh) return;
  var F = window._casoraFbh = {};

  var num = function (v) { var n = parseFloat(v); return isNaN(n) ? null : n; };
  var ok = function (s) { return s && s.state !== 'unknown' && s.state !== 'unavailable'; };
  /* Zahl aus einem Zustand oder null – auch bei Text wie „none“ (sonst würfe fmt(null)). */
  var nv = function (s) { return s && ok(s) ? num(s.state) : null; };
  var fmt = function (n) { return n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 1, maximumFractionDigits: 1 }); };
  /* Temperatur-Einheit von Home Assistant (°C/°F) – die Werte kommen schon darin (06.10.2026). */
  var TU = function () {
    var ha = document.querySelector('home-assistant'), us = ha && ha.hass && ha.hass.config && ha.hass.config.unit_system;
    return (us && us.temperature) || '°C';
  };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var MODES = { off: 'Aus', heat: 'Heizen', auto: 'Automatik' };
  var ORDER = ['off', 'heat', 'auto'];

  /* Geräte-Geschwister: Bosch Room Climate (call_for_heat …) über translation_keys, das
     Wandthermostat als eigenes Gerät im selben Bereich (child_lock, Temperatur, Feuchte). */
  F.info = function (id, states, hass) {
    var reg = (hass && hass.entities) || {};
    var dev = reg[id] && reg[id].device_id;
    var sib = dev ? Object.keys(reg).filter(function (e) { return reg[e].device_id === dev && e !== id && states[e]; }) : [];
    var pick = function (re) { for (var i = 0; i < sib.length; i++) if (re.test(sib[i])) return sib[i]; return null; };
    var o = { id: id, trv: !!pick(/_valve_adapt_status$|_pi_heating_demand$/) };
    var cfh = pick(/_roomclimatecontrol_call_for_heat$/);
    /* Casora: Bosch-Raumklima über translation_keys (sprachunabhängig); das
       Wandthermostat ist ein eigenes Gerät im selben Bereich mit child_lock. */
    var CD = window.casoraDevice;
    if (CD && hass && dev) {
      var K = CD.map(hass, id, {
        cfh: { keys: ['call_for_heat'], domain: 'binary_sensor' }, next: { keys: ['next_setpoint_temperature'], domain: 'sensor' },
        dip: { keys: ['temperature_drop_enabled'], domain: 'switch' }, dipVal: { keys: ['temperature_drop_value'], domain: 'number' },
        override: { keys: ['schedule_override_active'], domain: 'binary_sensor' }, pause: { keys: ['summer_mode'], domain: 'binary_sensor' },
        air: { keys: ['ventilation_mode'], domain: 'binary_sensor' } });
      if (K.cfh) {
        cfh = K.cfh;
        ['next', 'dip', 'dipVal', 'override', 'pause', 'air'].forEach(function (k) { if (K[k]) o['_k_' + k] = K[k]; });
        var D = hass.devices || {}, me = D[dev] || {};
        var wall = me.area_id ? Object.keys(D).filter(function (d) {
          if (d === dev || D[d].area_id !== me.area_id || D[d].manufacturer !== me.manufacturer) return false;
          var mine = Object.keys(reg).filter(function (e) { return reg[e].device_id === d; });
          return mine.some(function (e) { return reg[e].translation_key === 'child_lock'; })
            && mine.some(function (e) { return e.indexOf('sensor.') === 0 && states[e] && states[e].attributes.device_class === 'temperature'; });
        })[0] : null;
        if (wall) {
          var W = CD.map(hass, Object.keys(reg).filter(function (e) { return reg[e].device_id === wall; })[0],
            { lock: { keys: ['child_lock'], domain: 'switch' }, temp: { dc: 'temperature', domain: 'sensor' }, hum: { dc: 'humidity', domain: 'sensor' } });
          o._wall = W;
        }
      }
    }
    o.cfh = cfh;
    ['next', 'dip', 'dipVal', 'override', 'pause', 'air'].forEach(function (k) { if (o['_k_' + k]) o[k] = o['_k_' + k]; delete o['_k_' + k]; });
    if (o._wall) { ['lock', 'temp', 'hum'].forEach(function (k) { if (o._wall[k] && states[o._wall[k]]) o[k] = o._wall[k]; }); delete o._wall; }
    if (o.trv) {
      o.temp = pick(/_local_temperature$/);
      o.lock = pick(/_child_lock$/);
      o.bat = pick(/_battery$/);
      o.batLow = pick(/_battery_low$/);
      o.valve = pick(/_valve_adapt_status$/);
      o.err = pick(/_error_state$/);
      o.win = pick(/_window_detection$/);
      o.boost = pick(/_boost_heating$/);
      o.opMode = pick(/_operating_mode$/);
      o.demand = pick(/_pi_heating_demand$/);
    }
    var fn = (states[id] && states[id].attributes.friendly_name) || id;
    o.name = String(fn).replace(/^(Fu(ß|ss)bodenheizung|Room Climate)\s*/i, '').trim() || fn;
    return o;
  };
  F.curTemp = function (o, states) {
    var s = o.temp && states[o.temp];
    var v = s && ok(s) ? num(s.state) : null;
    return v != null ? v : num(states[o.id] && states[o.id].attributes.current_temperature);
  };
  F.heating = function (o, states) {
    var e = states[o.id]; if (!e) return false;
    if (o.cfh && states[o.cfh] && states[o.cfh].state === 'on') return true;
    var a = window.casoraClimateActive ? window.casoraClimateActive(e) : {};
    return !!(a && a.heating);
  };
  F.status = function (o, states) {
    var e = states[o.id]; if (!e) return '—';
    var t = num(e.attributes.temperature);
    var tt = t != null ? fmt(t) + ' ' + TU() : null;
    if (e.state === 'unavailable') return 'Nicht verfügbar';
    if (e.state === 'off') return 'Aus';
    if (F.heating(o, states)) return tt ? 'Heizt auf ' + tt : 'Heizt';
    if (e.state === 'auto') return tt ? 'Automatik · ' + tt : 'Automatik';
    return tt ? 'Bereit · ' + tt : 'Bereit';
  };

  var plate = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
    + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
    + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);';

  /* Zieltemperatur: Stepper (−/+) und optional der ziehbare Balken aus dem Thermostat-Popup. */
  F.stepper = function (targets, value, a, label, withBar) {
    var UI = window._casoraUI, T = UI.tokens;
    var step = num(a.target_temp_step) || 0.5;
    var F_ = TU() === '°F', lo = num(a.min_temp) != null ? num(a.min_temp) : (F_ ? 41 : 5), hi = num(a.max_temp) != null ? num(a.max_temp) : (F_ ? 86 : 30);
    var tgt = { entity_id: targets.length === 1 ? targets[0] : targets };
    var dn = Math.max(lo, Math.round((value - step) / step) * step);
    var up = Math.min(hi, Math.round((value + step) / step) * step);
    var btn = function (svg, t, dis) {
      return '<div class="fb-st-b' + (dis ? ' dis' : '') + '"'
        + (dis ? '' : ' data-casora-svc="' + esc(JSON.stringify({ domain: 'climate', service: 'set_temperature', data: { temperature: t }, target: tgt })) + '"')
        + '>' + svg + '</div>';
    };
    var out = '<style>'
      + '.fb-st{display:flex;align-items:center;justify-content:space-between;gap:12px;font-family:' + T.font + ';' + plate + 'padding:12px;}'
      + '.fb-st-b{width:52px;height:52px;flex:none;border-radius:999px;display:grid;place-items:center;cursor:pointer;line-height:0;color:' + T.ink + ';'
      +   'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));transition:background-color .16s ease;user-select:none;-webkit-user-select:none;}'
      + '.fb-st-b.dis{opacity:.3;cursor:default;}.fb-st-b svg{pointer-events:none;}'
      + '@media (hover:hover){.fb-st-b:not(.dis):hover{background:var(--casora-popup-seg-fill-hover, rgba(255,255,255,0.24));}}'
      + '.fb-st-v{text-align:center;pointer-events:none;}'
      + '.fb-st-v .l{font-size:13px;color:' + T.ink2 + ';}'
      + '.fb-st-v .n{font-size:30px;font-weight:500;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:' + T.ink + ';}'
      + '.fb-st-v .n span{font-size:16px;font-weight:400;color:' + T.ink2 + ';}'
      /* Weich: Sand-Pille, runde Knöpfe in Steuerfläche, Etikett in Großbuchstaben. */
      + (window._casoraHH && window._casoraHH.on() ? '.fb-st{padding:10px;border-radius:var(--casora-popup-row-radius, 24px);}'
        + '.fb-st-b{background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));}'
        + '@media (hover:hover){.fb-st-b:not(.dis):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
        + '.fb-st-v .l{font-size:11.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--casora-soft-label, ' + T.ink2 + ');}'
        + '.fb-st-v .n{font-weight:700;}' : '')
      + '</style><div class="fb-st">'
      + btn('<svg width="20" height="20" viewBox="0 0 20 20" style="display:block"><path d="M4 10H16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>', dn, value <= lo)
      + '<div class="fb-st-v"><div class="l">' + esc(label) + '</div><div class="n">' + fmt(value) + '<span> ' + TU() + '</span></div></div>'
      + btn('<svg width="20" height="20" viewBox="0 0 20 20" style="display:block"><path d="M4 10H16M10 4V16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>', up, value >= hi)
      + '</div>';
    if (withBar) {
      var k = ((value - lo) / (hi - lo) * 100).toFixed(1);
      out += '<style>'
        + '.fb-tb{margin-top:6px;padding:14px 4px 4px;cursor:pointer;touch-action:none;}'
        + '.fb-tb-t{position:relative;height:8px;border-radius:999px;pointer-events:none;'
        +   'background:var(--casora-temp-gradient, linear-gradient(90deg,#0A84FF 0%,#64D2FF 30%,#FF9F0A 65%,#FF453A 100%));}'
        + '.fb-tb-k{position:absolute;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:999px;background:#fff;'
        +   'box-shadow:0 1px 4px rgba(0,0,0,.45);transition:left .15s ease;}'
        + '.fb-tb-s{display:flex;justify-content:space-between;font-size:12px;color:' + T.ink3 + ';margin-top:6px;font-variant-numeric:tabular-nums;}'
        + '</style>'
        + '<div class="fb-tb" data-fb-bar="' + esc(JSON.stringify({ lo: lo, hi: hi, st: step, id: targets[0] })) + '">'
        + '<div class="fb-tb-t"><div class="fb-tb-k" style="left:' + k + '%"></div></div>'
        + '<div class="fb-tb-s"><span>' + fmt(lo) + ' ' + TU() + '</span><span>' + fmt(hi) + ' ' + TU() + '</span></div></div>';
    }
    return out;
  };

  /* Modus als iOS-Auswahlliste mit Haken. confirmOn: Einschalten nur mit Bestätigung (Aquarium-Muster). */
  F.modeSeg = function (id, states) {
    var UI = window._casoraUI;
    var e = states[id]; if (!e || e.state === 'unavailable') return '';
    var list = (e.attributes.hvac_modes || []).map(String).filter(function (m) { return MODES[m]; })
      .sort(function (x, y) { return ORDER.indexOf(x) - ORDER.indexOf(y); });
    if (list.length < 2) return '';
    return (window._casoraHH && window._casoraHH.on() ? window._casoraHH.label('Modus')
      : '<div style="font-family:var(--primary-font-family,system-ui);font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);'
      + 'color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary,#fff));text-align:left;padding:0 4px 8px;">Modus</div>')
      + '<style>.fb-seg .hui-seg{flex-wrap:nowrap;gap:6px;}.fb-seg .hui-sg{flex:1 1 0;min-width:0;padding:11px 4px;}</style>'
      + '<div class="fb-seg">' + UI.segments(list.map(function (m) {
        return { label: MODES[m], active: e.state === m,
          svc: { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: m }, target: { entity_id: id } } };
      })) + '</div>';
  };
  F.modes = function (id, states, confirmOn, title) {
    var UI = window._casoraUI;
    var e = states[id]; if (!e || e.state === 'unavailable') return '';
    var list = (e.attributes.hvac_modes || []).map(String).filter(function (m) { return MODES[m]; })
      .sort(function (x, y) { return ORDER.indexOf(x) - ORDER.indexOf(y); });
    var ICON = { off: 'mdi:power', heat: 'mdi:heating-coil', auto: 'mdi:calendar-clock' };
    var SUB = { off: null, heat: 'Feste Zieltemperatur', auto: 'Nach Zeitplan' };
    /* Aktiver Modus wie die aktive Zeile im Netzwerk-Popup: hinterlegt, Icon in Modusfarbe, kein Haken. */
    var COL = { off: 'rgba(255,255,255,0.55)', heat: 'var(--casora-tone-heat, var(--casora-color-red, #FF453A))', auto: 'var(--casora-color-teal, #00C3D0)' };
    var html = UI.group(list.map(function (m) {
      var on = e.state === m;
      return {
        icon: ICON[m], iconTone: on ? (m === 'off' && window._casoraHH && window._casoraHH.on() ? 'var(--casora-soft-seg-on-ink, rgba(58,50,43,0.55))' : COL[m]) : 'rgba(255,255,255,0.18)',
        label: MODES[m], sub: SUB[m],
        svc: on ? null : { domain: 'climate', service: 'set_hvac_mode', data: { hvac_mode: m }, target: { entity_id: id } },
        confirm: (!on && confirmOn && m !== 'off') ? 'Einschalten' : null,
      };
    }), title || 'Modus');
    var at = html.indexOf('>' + MODES[e.state] + '<');
    var rs = at > -1 ? html.lastIndexOf('class="hui-row', at) : -1;
    if (rs > -1) html = html.slice(0, rs) + 'class="fb-sel ' + html.slice(rs + 7);
    html = '<style>.hui-row.fb-sel{background:var(--casora-popup-row-hover, rgba(255,255,255,0.08));}</style>' + html;
    return window._casoraHH ? window._casoraHH.sel(html) : html;
  };

  var toggleRow = function (eid, icon, label, sub, states) {
    var s = states[eid]; if (!s) return null;
    var on = s.state === 'on';
    return { icon: icon, iconTone: on ? 'accent' : 'rgba(255,255,255,0.18)', label: label, sub: sub || null,
      value: s.state === 'unavailable' ? '—' : (on ? 'An' : 'Aus'),
      svc: ok(s) ? { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: eid } } : null };
  };

  /* ── Abschnitte (werden in [[[ ]]]-Feldern mit triggers_update aufgerufen) ── */
  F.sec = function (name, c, states, hass) {
    var UI = window._casoraUI; if (!UI) return '';
    var e = states[c.id]; if (!e) return '';
    var a = e.attributes || {};

    if (name === 'hero') {
      if (c.group) {
        var rooms = c.rooms.map(function (r) { return r; });
        var active = rooms.filter(function (r) { return states[r.id] && states[r.id].state !== 'off' && states[r.id].state !== 'unavailable'; });
        var heat = rooms.filter(function (r) { return F.heating(r, states); });
        var v = c.houseTemp && states[c.houseTemp] && ok(states[c.houseTemp]) ? num(states[c.houseTemp].state) : null;
        if (v == null) {
          /* Kein Haus-Temperatursensor: Mittel der Raumtemperaturen der Gruppe. */
          var temps = rooms.map(function (r) { return F.curTemp(r, states); }).filter(function (t) { return t != null && !isNaN(t); });
          if (temps.length) v = Math.round(temps.reduce(function (a, b) { return a + b; }, 0) / temps.length * 10) / 10;
        }
        var sub = !active.length ? 'Alle Räume aus'
          : heat.length ? (heat.length === 1 ? '1 Raum heizt gerade' : heat.length + ' Räume heizen gerade')
          : (active.length === rooms.length ? 'An · alle Räume warm genug' : active.length + ' von ' + rooms.length + ' Räumen an');
        return UI.hero({ label: window._casoraHH && window._casoraHH.on() ? null : 'Durchschnitt im Haus', value: v != null ? fmt(v) : '—', unit: v != null ? TU() : null,
          sub: sub, subTone: heat.length ? 'warn' : null, center: true });
      }
      var cur = F.curTemp(c, states);
      var hum = c.hum && nv(states[c.hum]) != null ? Math.round(nv(states[c.hum])) + ' % Luftfeuchtigkeit' : null;
      return UI.hero({ label: window._casoraHH && window._casoraHH.on() ? null : (c.trv ? 'Temperatur am Heizkörper' : 'Raumtemperatur'), value: cur != null ? fmt(cur) : '—', unit: cur != null ? TU() : null,
        sub: [F.status(c, states), hum].filter(Boolean).join(' · '), subTone: F.heating(c, states) ? 'warn' : null, center: true });
    }

    if (name === 'house') {
      /* Zieltemperatur für alle Räume, die gerade an sind. Unterschiedliche Werte:
         Anzeige = gerundeter Mittelwert, −/+ setzt alle auf denselben Wert. */
      var act = c.rooms.concat(c.trvs).filter(function (r) { var s = states[r.id]; return s && s.state !== 'off' && s.state !== 'unavailable'; });
      /* Popup-Standard (24.09.2026): Überschrift wie überall „Modus“ (vorher „Ganzes Haus“). */
      var out = F.modes(c.id, states, true, 'Modus');
      var ms = c.master && states[c.master];
      /* Weich (Entschlacken): Hauptschalter steht unter „Mehr“ (sec 'master'). */
      if (ms && !(window._casoraHH && window._casoraHH.on())) {
        var mon = ms.state === 'on';
        out += '<div style="height:12px"></div>' + UI.group([{ icon: 'mdi:power-plug-outline', iconTone: mon ? 'accent' : 'rgba(255,255,255,0.18)',
          label: 'Hauptschalter', sub: mon ? 'Heizkreise mit Strom versorgt' : 'Heizkreise stromlos', value: mon ? 'An' : 'Aus',
          svc: ok(ms) ? { domain: 'switch', service: mon ? 'turn_off' : 'turn_on', target: { entity_id: c.master } } : null,
          confirm: mon ? 'Ausschalten' : 'Einschalten' }]);
      }
      if (act.length) {
        var ts = act.map(function (r) { return num(states[r.id].attributes.temperature); }).filter(function (t) { return t != null; });
        if (ts.length) {
          var st = num(a.target_temp_step) || 0.5;
          var same = ts.every(function (t) { return t === ts[0]; });
          var avg = Math.round(ts.reduce(function (s, t) { return s + t; }, 0) / ts.length / st) * st;
          out += '<div style="height:12px"></div>'
            + F.stepper(act.map(function (r) { return r.id; }), same ? ts[0] : avg,
              { target_temp_step: st, min_temp: a.min_temp, max_temp: a.max_temp },
              same ? 'Zieltemperatur alle Räume' : 'Räume unterschiedlich · Ø', false);
        }
      }
      return out;
    }

    if (name === 'master') {
      var ms2 = c.master && states[c.master];
      if (!ms2) return '';
      var mon2 = ms2.state === 'on';
      return UI.group([{ icon: 'mdi:power-plug-outline', iconTone: mon2 ? 'accent' : 'rgba(255,255,255,0.18)',
        label: 'Hauptschalter', sub: mon2 ? 'Heizkreise mit Strom versorgt' : 'Heizkreise stromlos', value: mon2 ? 'An' : 'Aus',
        svc: ok(ms2) ? { domain: 'switch', service: mon2 ? 'turn_off' : 'turn_on', target: { entity_id: c.master } } : null,
        confirm: mon2 ? 'Ausschalten' : 'Einschalten' }], 'Strom');
    }

    if (name === 'history') {
      /* Weich (Entschlacken): Verlauf als Zeile unter „Mehr“ – öffnet den HA-Verlauf. */
      var hid = c.group ? c.houseTemp : c.temp;
      if (!hid || !states[hid]) return '';
      return UI.group([{ icon: 'mdi:chart-bell-curve-cumulative', iconTone: 'accent', label: c.group ? 'Temperatur im Haus' : 'Temperatur',
        sub: 'Verlauf der letzten 24 Stunden', entity: hid }], 'Verlauf');
    }

    if (name === 'rooms' || name === 'trvs' || name === 'allrooms') {
      /* allrooms (Weich): Räume und Heizkörper in einer Liste. */
      var list = name === 'rooms' ? c.rooms : name === 'trvs' ? c.trvs : c.rooms.concat(c.trvs);
      if (!list.length) return '';
      var html = UI.group(list.map(function (r) {
        var s = states[r.id];
        var t = F.curTemp(r, states), h = F.heating(r, states);
        var sub = F.status(r, states);
        if (r.trv && r.bat && nv(states[r.bat]) != null) sub += ' · Akku ' + Math.round(nv(states[r.bat])) + ' %';
        return { icon: r.trv ? 'mdi:radiator' : 'mdi:heating-coil',
          iconTone: h ? 'var(--casora-tone-heat, var(--casora-color-red, #FF453A))' : (s && s.state !== 'off' && s.state !== 'unavailable' ? 'accent' : 'rgba(255,255,255,0.18)'),
          label: r.name, sub: sub, value: t != null ? fmt(t) + ' ' + TU() : null, entity: r.id,
          /* Weich: eingeschalteter Raum/Heizkörper als aktive Zeile (heller Grund, Zustand in Ton) –
             wie die Thermostat-Kachel nach hvac_mode, nicht nur solange er gerade heizt. */
          active: !!(s && s.state !== 'off' && s.state !== 'unavailable' && s.state !== 'unknown') };
      }), name === 'trvs' ? 'Heizkörper' : 'Räume');
      list.forEach(function (r) {
        html = html.replace('data-casora-mi="' + r.id + '"', 'data-fbh-room="' + esc(JSON.stringify({ id: r.id, name: r.name })) + '"');
      });
      return html;
    }

    if (name === 'hcoach') {
      /* Heizungs-Coach (23.09.2026): sensor.casora_heizungs_coach, wöchentlich nur in der Heizsaison. */
      var hc = states['sensor.casora_heizungs_coach']; if (!hc) return '';
      var ha = hc.attributes || {};
      var T = UI.tokens;
      /* Heizdauer 7 Tage: Wärmeanforderung der Räume aus dem Verlauf (Casora). */
      var cfhs = (c.rooms || []).map(function (r) { return r.cfh; }).filter(Boolean);
      var hrs = window.casoraDevice && window.casoraDevice.onHours ? window.casoraDevice.onHours(cfhs, 7) : null;
      if (hrs == null) hrs = 0;
      var running = ha.status === 'running', has = !!ha.fazit;
      var Zc = { gut: ['Alles im grünen Bereich', 'var(--casora-popup-ui-good, #30D158)', 'mdi:check-circle'],
                 beobachten: ['Beobachten', 'var(--casora-popup-ui-warn, #FF9F0A)', 'mdi:eye-outline'],
                 handeln: ['Handeln', 'var(--casora-popup-ui-bad, #FF453A)', 'mdi:alert'] };
      var ic = function (nm, px, col) { return '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 ' + px + 'px;width:' + px + 'px;height:' + px + 'px;"><ha-icon icon="' + nm + '" style="--mdc-icon-size:' + px + 'px;width:' + px + 'px;height:' + px + 'px;display:flex;align-items:center;justify-content:center;line-height:0;color:' + col + ';"></ha-icon></span>'; };
      var li = function (arr, col) { return '<ul style="margin:10px 0 0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + col + ';white-space:normal;">' + arr.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>'; };
      var body;
      if (running) body = '<div style="font-size:15px;color:' + T.ink + ';">Claude wertet die Heizwoche aus …</div>';
      else if (has) {
        var z = Zc[ha.zustand];
        body = (z ? '<div style="display:flex;align-items:center;gap:8px;">' + ic(z[2], 20, z[1]) + '<span style="font-size:var(--casora-fs16,16px);font-weight:600;color:' + z[1] + ';">' + z[0] + '</span></div>' : '')
          + '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink + ';margin-top:8px;white-space:normal;">' + esc(ha.fazit) + '</div>'
          + ((ha.erkenntnisse || []).length ? li(ha.erkenntnisse, T.ink2) : '')
          + ((ha.tipps || []).length ? '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + T.ink3 + ';margin:12px 0 0;">Tipps</div>' + li(ha.tipps, T.ink) : '');
      } else body = '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink2 + ';white-space:normal;">'
        + (hrs < 1 ? 'Die Auswertung startet mit der Heizsaison: Sobald geheizt wird, prüft Claude jeden Montag Heizdauer, Raumtemperaturen, Heizen bei offenem Fenster und den Heizkörper im Bad.'
                   : 'Claude prüft Heizdauer, Raumtemperaturen, Heizen bei offenem Fenster und den Heizkörper im Bad der letzten 7 Tage.') + '</div>';
      var hsvc = window.casoraSvc('casora_heizungs_coach');
      var svc = ' data-casora-svc="' + esc(JSON.stringify(hsvc)) + '"';
      // Kein Knopf, der ins Leere läuft: nur, wenn der Heizungs-Coach-Dienst da ist (eigenes Skript
      // bzw. casora.heizungs_coach). Vorher hing das fälschlich am eBike-Skript (01.10.2026).
      var hsv = hass && hass.services;
      var canRun = !hsv || !!(hsv[hsvc.domain] && hsv[hsvc.domain][hsvc.service]);
      var btn = (running || !canRun) ? '' : '<span' + svc + ' style="display:inline-flex;cursor:pointer;font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;margin-top:14px;'
        + (has ? 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));' : 'color:#000;background:var(--casora-color-teal, #00C3D0);') + '">' + (has ? 'Neu auswerten' : 'Jetzt auswerten') + '</span>';
      var ago = function (ts) { var t = Date.parse(ts); if (isNaN(t)) return ''; var m = Math.max(0, Math.round((Date.now() - t) / 60000));
        return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.'; };
      var hcHead = '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 4px 8px;display:flex;align-items:center;gap:6px;">'
        + ic('mdi:creation', 16, 'var(--casora-color-teal, #00C3D0)') + '<span style="flex:1 1 auto;text-align:left;">Heizungs-Coach</span>'
        + '<span style="font-size:13px;font-weight:500;color:' + T.ink3 + ';">' + (hrs ? fmt(hrs).replace(',0', '') + ' Std. geheizt (7 T.)' : '') + '</span></div>';
      /* Weich: Titel in der Platte wie der Lüftungs-Coach. */
      var hcSoft = window._casoraHH && window._casoraHH.on();
      if (hcSoft) hcHead = hcHead.replace('padding:0 4px 8px;', 'padding:0 0 10px;');
      return '<div style="font-family:' + T.font + ';text-align:left;">'
        + (hcSoft ? '' : hcHead)
        + '<div style="' + plate + 'padding:16px 18px;">' + (hcSoft ? hcHead : '') + body
        + (has && !running && ha.erstellt ? '<div style="font-size:12px;color:' + T.ink3 + ';margin-top:10px;">Auswertung der letzten 7 Tage · ' + ago(ha.erstellt) + '</div>' : '')
        + btn + '</div></div>';
    }

    if (name === 'ctl') {
      /* Popup-Standard (24.09.2026): Raum-Modus als Tasten-Leiste wie beim Luftreiniger – oben „Modus“,
         darunter die Zieltemperatur. Das ganze Haus behält die Liste mit Bestätigung (Schutz vor versehentlichem Einschalten). */
      var out2 = F.modeSeg(c.id, states);
      var tv = num(a.temperature);
      if (e.state !== 'off' && e.state !== 'unavailable' && tv != null) {
        out2 += (out2 ? '<div style="height:18px"></div>' : '') + F.stepper([c.id], tv, a, 'Zieltemperatur', true);
      }
      return out2;
    }

    if (name === 'det') {
      var rows = [];
      if (c.trv) {
        var dm = c.demand && nv(states[c.demand]) != null ? Math.round(nv(states[c.demand])) : null;
        if (dm != null) rows.push({ icon: 'mdi:valve', iconTone: dm > 0 ? 'var(--casora-tone-heat, var(--casora-color-red, #FF453A))' : 'rgba(255,255,255,0.18)', label: 'Ventilöffnung', value: dm + ' %' });
        if (c.opMode && states[c.opMode]) {
          var OM = { pause: 'Pause', manual: 'Manuell', schedule: 'Zeitplan', automatic: 'Automatik', auto: 'Automatik' };
          rows.push({ icon: 'mdi:cog-outline', label: 'Betriebsart', value: OM[states[c.opMode].state] || states[c.opMode].state, entity: c.opMode });
        }
        var br = c.boost && toggleRow(c.boost, 'mdi:rocket-launch-outline', 'Boost', 'Kurz volle Leistung', states); if (br) rows.push(br);
        var wr = c.win && toggleRow(c.win, 'mdi:window-open-variant', 'Fenster-Erkennung', 'Schließt bei Temperatursturz', states); if (wr) rows.push(wr);
      } else {
        if (c.cfh && states[c.cfh]) {
          var cf = states[c.cfh].state === 'on';
          rows.push({ icon: 'mdi:fire', iconTone: cf ? 'var(--casora-tone-heat, var(--casora-color-red, #FF453A))' : 'rgba(255,255,255,0.18)', label: 'Wärmeanforderung', value: cf ? 'Aktiv' : 'Keine', valueTone: cf ? 'warn' : null });
        }
        if (c.next && nv(states[c.next]) != null) rows.push({ icon: 'mdi:clock-outline', label: 'Nächste Solltemperatur', value: fmt(nv(states[c.next])) + ' ' + TU() });
        if (c.dip && states[c.dip]) {
          var dv = c.dipVal && nv(states[c.dipVal]) != null ? fmt(nv(states[c.dipVal])) + ' ' + TU() : null;
          var dr = toggleRow(c.dip, 'mdi:thermometer-chevron-down', 'Temperaturabsenkung', dv ? 'Absenkung um ' + dv : null, states); if (dr) rows.push(dr);
        }
        /* Nur zeigen, wenn aktiv. Heizpause ist außerhalb der Heizsaison normal, daher neutral. */
        [[c.pause, 'mdi:pause-circle-outline', 'Heizpause', null], [c.override, 'mdi:calendar-edit', 'Zeitplan überschrieben', 'accent'], [c.air, 'mdi:weather-windy', 'Lüften erkannt', 'accent']]
          .forEach(function (x) { if (x[0] && states[x[0]] && states[x[0]].state === 'on') rows.push({ icon: x[1], iconTone: x[3] || (window._casoraHH ? window._casoraHH.tone('rgba(255,255,255,0.30)') : 'rgba(255,255,255,0.30)'), label: x[2], value: 'Aktiv' }); });
      }
      var lr = c.lock && toggleRow(c.lock, 'mdi:lock-outline', 'Kindersicherung', 'Tasten am Gerät gesperrt', states); if (lr) rows.push(lr);
      var out3 = rows.length ? UI.group(rows, c.trv ? 'Heizkörper' : 'Raum') : '';
      if (c.trv) {
        var dev = [];
        if (c.bat && states[c.bat]) {
          var b = nv(states[c.bat]) != null ? Math.round(nv(states[c.bat])) : null;
          /* battery_low meldet schon bei 89 % "on", daher nur die Prozentzahl. */
          var tn = b == null ? null : window.casoraBattery ? window.casoraBattery.tone(window.casoraBattery.level(b)) : b <= 20 ? 'warn' : null;
          dev.push({ icon: 'mdi:battery', iconTone: tn || 'good', label: 'Akku', value: b != null ? b + ' %' : '—', valueTone: tn });
        }
        if (c.valve && states[c.valve]) {
          var VS = { success: 'Angepasst', none: 'Nicht angepasst', ready_to_calibrate: 'Bereit zur Anpassung', calibration_in_progress: 'Läuft …', error: 'Fehler' };
          var vs = states[c.valve].state;
          dev.push({ icon: 'mdi:tune-vertical', label: 'Ventil-Anpassung', value: VS[vs] || vs, valueTone: vs === 'error' ? 'bad' : null });
        }
        if (c.err && states[c.err]) {
          var es = states[c.err].state;
          dev.push({ icon: 'mdi:alert-circle-outline', iconTone: es === 'ok' ? 'rgba(255,255,255,0.18)' : 'bad', label: 'Gerätestatus', value: es === 'ok' ? 'OK' : es, valueTone: es === 'ok' ? 'good' : 'bad' });
        }
        if (dev.length) out3 += '<div style="height:18px"></div>' + UI.group(dev, 'Gerät');
      }
      return out3;
    }
    return '';
  };

  /* Weich: Ring-Symbol für die Fußbodenheizung (die Thermostat-Kachel hat kein #icon). */
  var prevRing = window.casoraRingGlyph;
  window.casoraRingGlyph = function (src, key) {
    if (/casora_popup_fbh/.test(key)) return 'mdi:heating-coil';
    return typeof prevRing === 'function' ? prevRing(src, key) : null;
  };

  /* ── Popup-Karte ── */
  window._casoraFbhPopup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !entity) return { type: 'vertical-stack', cards: [] };
    var id = entity.entity_id;
    var members = Array.isArray(entity.attributes.member_entities) ? entity.attributes.member_entities.filter(function (m) { return states[m]; }) : [];
    var c;
    if (members.length) {
      var infos = members.map(function (m) { return F.info(m, states, hass); });
      c = { id: id, group: true, rooms: infos.filter(function (i) { return !i.trv; }), trvs: infos.filter(function (i) { return i.trv; }),
        houseTemp: variables.temp_sensor && states[variables.temp_sensor] ? variables.temp_sensor : null,
        master: variables.master_switch || (window.casoraDevice ? window.casoraDevice.map(hass, id, { m: { keys: ['main_switch'], domain: 'switch' } }).m : null) || null };
    } else {
      c = F.info(id, states, hass);
    }
    var cj = JSON.stringify(c);
    var watch = [id];
    var addW = function (o) { ['id', 'temp', 'hum', 'cfh', 'next', 'dip', 'dipVal', 'override', 'pause', 'air', 'lock', 'bat', 'batLow', 'valve', 'err', 'win', 'boost', 'opMode', 'demand']
      .forEach(function (k) { if (o[k]) watch.push(o[k]); }); };
    if (c.group) { c.rooms.concat(c.trvs).forEach(addW); if (c.houseTemp) watch.push(c.houseTemp); if (c.master) watch.push(c.master);
      watch.push('sensor.casora_heizungs_coach'); } else addW(c);
    watch = watch.filter(function (w, i) { return watch.indexOf(w) === i && states[w]; });

    var fields = {}, fstyle = {};
    var sec = function (n) { return '[[[ return window._casoraFbh ? window._casoraFbh.sec(' + JSON.stringify(n) + ', ' + cj + ', states, hass) : ""; ]]]'; };
    var add = function (n, v) { fields[n] = v; fstyle[n] = [{ 'justify-self': 'stretch' }]; };

    add('hero', sec('hero'));
    var chartId = c.group ? c.houseTemp : c.temp;
    if (chartId && typeof window._hpChartCfg === 'function') {
      window._hpChartCfg(chartId, c.group ? 'Temperatur im Haus' : 'Temperatur', '24h', '#FF9F0A', 150);
      if (window._hpSmooth) window._hpSmooth(chartId);
      add('chart', window._casoraHH && window._casoraHH.on() ? window._casoraHH.chart(window._hpChartTitle(chartId), plate)
        : '<div style="' + plate + 'padding:14px 10px 6px;">'
        + '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);font-size:15px;font-weight:600;'
        + 'letter-spacing:-0.01em;color:var(--casora-popup-tiles-text-primary,#fff);text-align:left;padding:0 6px;">'
        + window._hpChartTitle(chartId) + '</div>'
        + '<div class="hp-chart-slot" style="min-height:150px;margin:6px 0 0;"></div></div>');
      if (typeof window._hpChartInit === 'function') window._hpChartInit(chartId);
    }
    var leftKeys, rightKeys;
    if (c.group) { add('house', sec('house')); add('rooms', sec('rooms')); add('trvs', sec('trvs'));
      if (states['sensor.casora_heizungs_coach']) add('hcoach', sec('hcoach'));
      /* Popup-Standard (24.09.2026): Coach ist Info → rechts unter Räume/Heizkörper. */
      leftKeys = ['house']; rightKeys = ['rooms', 'trvs'].concat(fields.hcoach ? ['hcoach'] : []); }
    else { add('ctl', sec('ctl')); add('det', sec('det')); leftKeys = ['ctl']; rightKeys = ['det']; }
    if (c.group && window._casoraSplit) { var _sp = window._casoraSplit('fbh', leftKeys, rightKeys); leftKeys = _sp.left; rightKeys = _sp.right; }

    /* Weich (Entschlacken 01.10.2026): Haus – Kopf mit Ø-Temperatur, links Modus und Zieltemperatur,
       rechts eine Liste aus Räumen und Heizkörpern; Heizungs-Coach, Hauptschalter und Verlauf unter
       „Mehr“. Raum – Kopf, Verlauf, links Modus/Zieltemperatur, rechts Raum-/Gerätedetails unter „Mehr“. */
    var HH = window._casoraHH;
    if (HH && HH.on() && HH.layout) {
      var mcode = function (parts) {
        return 'const F = window._casoraFbh, H = window._casoraHH; const c = ' + cj + ';\n'
          + 'return F && H ? H.more("fbh", ' + JSON.stringify(parts) + '.map(function (n) { return F.sec(n, c, states, hass); })) : "";';
      };
      if (c.group) {
        var g = { hero: fields.hero, house: fields.house, allrooms: sec('allrooms'),
          more: HH.moreCard(watch, mcode(['hcoach', 'master', 'history']), id) };
        return HH.layout({ entity: id, watch: watch, fields: g, left: ['house'], right: ['allrooms', 'more'] });
      }
      var r1 = { hero: fields.hero, chart: fields.chart, ctl: fields.ctl, more: HH.moreCard(watch, mcode(['det']), id) };
      return HH.layout({ entity: id, watch: watch, fields: r1, top: ['hero', 'chart'], left: ['ctl'], right: ['more'] });
    }

    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }', 'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    ].join('\n');
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = fields[k]; cs[k] = fstyle[k]; });
      return {
        type: 'custom:button-card', entity: id, triggers_update: watch,
        tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle },
        extra_styles: window._casoraColGap ? window._casoraColGap(keys) : '',
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
                 { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    var top = {}, topStyle = {}, topAreas = [];
    ['hero', 'chart'].forEach(function (k) { if (fields[k] !== undefined) { top[k] = fields[k]; topStyle[k] = fstyle[k]; topAreas.push(k); } });
    /* Einzelraum/Heizkörper (25.09.2026): nur Modus + Details – untereinander statt links fast leer.
       Ein Raster (01.10.2026): dieselbe Breite wie Hero und Diagramm darüber, keine schmalere Mittelspalte. */
    var colS = c.group ? [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }]
      : [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
    top.left = { card: makeCol(leftKeys) }; topStyle.left = colS;
    top.right = { card: makeCol(rightKeys) }; topStyle.right = colS;
    var narrow = topAreas.concat(['left', 'right']).map(function (k) { return '"' + k + '"'; }).join(' ');
    var wide = topAreas.map(function (k) { return '"' + k + ' ' + k + '"'; }).join(' ') + (c.group ? ' "left right"' : ' "left left" "right right"');
    return {
      type: 'custom:button-card', entity: id, triggers_update: watch,
      card_mod: { style: wrapperStyle + '\nha-card.disabled { pointer-events: auto !important; }' },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: ' + wide + ' !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: 20px !important; } }',
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': narrow }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: topStyle,
      },
      custom_fields: top,
    };
  };

  /* ── Eingaben: Raum antippen → Raum-Popup; Temperaturbalken tippen/ziehen ── */
  var pathFind = function (ev, attr) {
    var p = (ev.composedPath && ev.composedPath()) || [ev.target];
    for (var i = 0; i < p.length; i++) if (p[i] && p[i].getAttribute && p[i].hasAttribute(attr)) return p[i];
    return null;
  };
  var openRoom = function (el) {
    var d; try { d = JSON.parse(el.getAttribute('data-fbh-room')); } catch (e) { return; }
    var open = window._casoraNotifyOpenViaCard; if (!open) return;
    window._casoraSuppressDismiss = Date.now() + 600;
    open(d.id, function (okd) { if (!okd && window.casoraPopup) window.casoraPopup.moreInfo(d.id); },
      { type: 'custom:button-card', template: ['casora_thermostat', 'casora_popup_fbh'], entity: d.id, name: d.name, variables: {} });
  };
  var ts = null, tDone = 0;
  window.addEventListener('touchstart', function (ev) {
    var t = ev.touches && ev.touches[0]; ts = t ? { x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    var el = pathFind(ev, 'data-fbh-room'); if (!el || !ts) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientX - ts.x) > 10 || Math.abs(t.clientY - ts.y) > 10)) return;
    tDone = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation();
    openRoom(el);
  }, { capture: true, passive: false });
  window.addEventListener('click', function (ev) {
    var el = pathFind(ev, 'data-fbh-room'); if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - tDone < 700) return;
    openRoom(el);
  }, true);

  /* Balken: Wert beim Ziehen anzeigen, set_temperature erst beim Loslassen. */
  var bar = null;
  var barVal = function (b, x) {
    var tr = b.el.querySelector('.fb-tb-t'); var r = tr.getBoundingClientRect();
    var f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    return Math.round((b.c.lo + f * (b.c.hi - b.c.lo)) / b.c.st) * b.c.st;
  };
  var barPaint = function (b, v) {
    var k = b.el.querySelector('.fb-tb-k'); if (k) k.style.left = ((v - b.c.lo) / (b.c.hi - b.c.lo) * 100) + '%';
    var root = b.el.getRootNode(); var n = root && root.querySelector && root.querySelector('.fb-st-v .n');
    if (n && n.firstChild) n.firstChild.nodeValue = fmt(v);
  };
  var barStart = function (ev, x) {
    var el = pathFind(ev, 'data-fb-bar'); if (!el) return false;
    var c; try { c = JSON.parse(el.getAttribute('data-fb-bar')); } catch (e) { return false; }
    bar = { el: el, c: c, v: null }; bar.v = barVal(bar, x); barPaint(bar, bar.v);
    ev.stopPropagation(); return true;
  };
  var barEnd = function () {
    if (!bar) return; var b = bar; bar = null;
    // Popup inzwischen zu: nichts mehr einstellen.
    if (!b.el.isConnected) return;
    var ha = document.querySelector('home-assistant');
    if (ha && ha.hass && b.v != null) ha.hass.callService('climate', 'set_temperature', { temperature: b.v }, { entity_id: b.c.id });
  };
  window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; if (t) barStart(ev, t.clientX); }, { capture: true, passive: true });
  window.addEventListener('touchmove', function (ev) {
    if (!bar) return; var t = ev.touches && ev.touches[0]; if (!t) return;
    if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); bar.v = barVal(bar, t.clientX); barPaint(bar, bar.v);
  }, { capture: true, passive: false });
  window.addEventListener('touchend', function (ev) { if (bar) { ev.stopPropagation(); if (ev.cancelable) ev.preventDefault(); barEnd(); } }, { capture: true, passive: false });
  // iOS bricht die Berührung ab (Systemgeste, Mitteilung): Ziehen beenden, ohne etwas einzustellen.
  window.addEventListener('touchcancel', function () { bar = null; }, { capture: true, passive: true });
  window.addEventListener('mousedown', function (ev) { if (barStart(ev, ev.clientX)) ev.preventDefault(); }, true);
  window.addEventListener('mousemove', function (ev) { if (bar) { bar.v = barVal(bar, ev.clientX); barPaint(bar, bar.v); } }, true);
  window.addEventListener('mouseup', function () { barEnd(); }, true);
})();

// ── Küche: Rezept der Woche + Cookidoo-Speiseplan (23.09.2026) ──────────────
// Kachel casora_recipe (['casora_entity','casora_popup_recipe']) ruft nur
// window._casoraRecipe.tile()/popup() auf. Kachel: geplantes Cookidoo-Rezept
// (Cookidoo-Speiseplan, nächste 7 Tage), sonst die KI-Idee aus
// sensor.casora_rezept_der_woche. Popup: Idee (Link, Andere Idee), Zutaten,
// Speiseplan 7 Tage, Einkaufsliste zum Abhaken (Cookidoo).
(function () {
  if (window._casoraRecipe) return;
  var R = window._casoraRecipe = { cal: {}, todo: {} };
  /* Cookidoo über translation_keys (Speiseplan, Einkaufsliste, Zusätzliche Käufe) – sprachunabhängig. */
  var IDEA = 'sensor.casora_rezept_der_woche';
  var ckey = function (key, dom) {
    var ha = document.querySelector('home-assistant'), h = ha && ha.hass;
    return (h && window.casoraDevice && window.casoraDevice.keyAny(h, key, dom)) || null;
  };
  var cal = function () { return ckey('meal_plan', 'calendar'); };
  var todo = function () { return ckey('ingredient_list', 'todo'); };
  var extra = function () { return ckey('additional_item_list', 'todo'); };
  var DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var DAYL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var dayStart = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  var dayName = function (d) {
    var diff = Math.round((dayStart(d) - dayStart(new Date())) / 86400000);
    return diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : DAYL[d.getDay()];
  };
  var mins = function (m) {
    m = Number(m); if (!m) return null;
    return m >= 60 ? Math.floor(m / 60) + ' Std.' + (m % 60 ? ' ' + (m % 60) + ' Min.' : '') : m + ' Min.';
  };
  var parseMin = function (desc) { var m = String(desc || '').match(/Total Time:\s*([\d.]+)/); return m ? Math.round(parseFloat(m[1]) / 60) : null; };
  var find = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) find(n.shadowRoot, sel, out); });
    return out;
  };
  var repaint = function (cls, html) {
    var ha = document.querySelector('home-assistant');
    find(ha && ha.shadowRoot, '.' + cls).forEach(function (n) { n.innerHTML = (window.casoraTr || function (x) { return x; })(html()); });
  };

  /* Nächstes geplantes Rezept direkt aus dem Kalender-Zustand (message/start_time), ohne Abruf. */
  R.next = function (states) {
    var c = states[cal()]; if (!c || !c.attributes || !c.attributes.message) return null;
    var t = new Date(String(c.attributes.start_time || '').replace(' ', 'T'));
    if (isNaN(t) || dayStart(t) - dayStart(new Date()) > 6 * 86400000) return null;
    return { name: c.attributes.message, when: t, min: parseMin(c.attributes.description) };
  };
  /* Kurzname für die Kachel (24.09.2026): nur der Kern des Gerichts, der volle Name steht im Popup.
     "Reispfanne mit Hähnchen und Pilzen" -> "Reispfanne"; sonst an einer Wortgrenze mit … kürzen. */
  R.short = function (name, max) {
    max = max || 20;
    var full = String(name || '').trim();
    if (full.length <= max) return full;
    var t = full.split(/\s+(?:mit|und|an|auf|nach|in|im|vom|aus|zum|zur)\s+|\s*[,(–—]\s*|\s+-\s+/i)[0].trim() || full;
    if (t.length <= max) return t;
    var cut = t.slice(0, max + 1).replace(/\s+\S*$/, '');
    return (cut.length >= 8 ? cut : t.slice(0, max)).replace(/[\s,.-]+$/, '') + '…';
  };
  R.tile = function (entity, states) {
    var n = R.next(states);
    if (n) return dayName(n.when) + ' · ' + R.short(n.name);
    var s = states[IDEA];
    if (s && s.attributes.status === 'running') return 'Sucht ein Rezept …';
    if (!s || s.state === 'unknown' || s.state === 'unavailable') return 'Nichts geplant';
    var m = mins(s.attributes.minuten);
    return R.short(s.state) + (m ? ' · ' + m : '');
  };

  /* Speiseplan 7 Tage (REST calendars/…), 5 Min. gemerkt, dann Platzhalter im Popup ersetzen. */
  R.loadCal = function (hass) {
    var C = R.cal;
    if (C.busy || (C.ts && Date.now() - C.ts < 300000) || !hass || !hass.callApi || !cal()) return;
    C.busy = true;
    var s = dayStart(new Date()), e = new Date(s.getTime() + 7 * 86400000);
    hass.callApi('GET', 'calendars/' + cal() + '?start=' + encodeURIComponent(s.toISOString()) + '&end=' + encodeURIComponent(e.toISOString()))
      .then(function (r) { C.list = (r || []).map(function (ev) {
        var st = ev.start && (ev.start.dateTime || ev.start.date);
        return { name: ev.summary, when: new Date(String(st).length === 10 ? st + 'T12:00:00' : st), min: parseMin(ev.description) };
      }).sort(function (a, b) { return a.when - b.when; }); C.err = false; })
      .catch(function () { C.err = true; })
      .then(function () { C.busy = false; C.ts = Date.now(); repaint('hr-cal', R.calHtml); repaint('hr-week', R.weekHtml); repaint('hr-hero', function () { return R.heroHtml(); }); });
  };
  R.heroHtml = function (states) {
    var UI = window._casoraUI; if (!UI) return '';
    if (!states) { var ha0 = document.querySelector('home-assistant'); states = (ha0 && ha0.hass && ha0.hass.states) || {}; }
    var nx = R.next(states) || ((R.cal.list || []).filter(function (x) { return dayStart(x.when) - dayStart(new Date()) <= 6 * 86400000; })[0] || null);
    if (!nx) return UI.hero({ value: R.cal.list ? 'Nichts geplant' : '…', sub: R.cal.list ? 'Speiseplan der nächsten 7 Tage ist leer' : null, center: true });
    return UI.hero({ value: dayName(nx.when) + ': ' + R.short(nx.name), sub: nx.min ? mins(nx.min) : null, center: true });
  };
  /* Weich: Speiseplan mit Datums-Plakette (FR / 3) statt sieben gleicher Besteck-Symbole –
     der Tag ist die eigentliche Information. Heute in Akzentfarbe, Zeilen schlanker. */
  var CAL_CSS = '<style>.hrw{display:flex;flex-direction:column;gap:8px;text-align:left;}'
    + '.hrw-r{display:flex;align-items:center;gap:12px;min-height:58px;box-sizing:border-box;padding:10px 16px 10px 10px;'
    + 'border-radius:var(--casora-popup-row-radius, 24px);background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));}'
    + '.hrw-b{flex:none;width:38px;height:38px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;'
    + 'background:var(--casora-soft-icon-off, rgba(140,115,90,0.12));color:var(--casora-popup-tiles-text-primary, #2E2721);line-height:1;}'
    + '.hrw-b b{font-size:9.5px;font-weight:700;letter-spacing:.06em;opacity:.7;}'
    + '.hrw-b span{font-size:14px;font-weight:700;margin-top:1px;font-variant-numeric:tabular-nums;}'
    + '.hrw-r.now .hrw-b{background:var(--casora-soft-icon-on, #276B64);color:var(--casora-soft-glyph, #fff);}'
    + '.hrw-r.now .hrw-b b{opacity:.85;}'
    + '.hrw-t{flex:1;min-width:0;}'
    + '.hrw-n{font-size:14.5px;font-weight:700;letter-spacing:-0.01em;color:var(--casora-popup-tiles-text-primary, #2E2721);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
    + '.hrw-s{font-size:12.5px;font-weight:500;color:var(--casora-soft-sub, rgba(46,39,33,0.6));margin-top:1px;}'
    + '.hrw-m{flex:none;font-size:12.5px;font-weight:600;color:var(--casora-soft-sub, rgba(46,39,33,0.6));}</style>';
  R.calSoft = function () {
    var C = R.cal, HH = window._casoraHH;
    var lbl = HH.label('Speiseplan');
    var row = function (cls, badge, name, sub, right) {
      return '<div class="hrw-r' + cls + '">' + badge + '<div class="hrw-t"><div class="hrw-n">' + name + '</div>'
        + (sub ? '<div class="hrw-s">' + sub + '</div>' : '') + '</div>' + (right ? '<div class="hrw-m">' + right + '</div>' : '') + '</div>';
    };
    var empty = '<div class="hrw-b"><ha-icon icon="mdi:calendar-blank-outline" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;"></ha-icon></div>';
    if (!C.list) return CAL_CSS + lbl + '<div class="hrw">' + row('', empty, C.err ? 'Speiseplan nicht verfügbar' : 'Wird geladen …') + '</div>';
    if (!C.list.length) return CAL_CSS + lbl + '<div class="hrw">' + row('', empty, 'Nichts geplant', 'In der Cookidoo-App auf „Meine Woche“ planen') + '</div>';
    return CAL_CSS + lbl + '<div class="hrw">' + C.list.map(function (x) {
      var dn = dayName(x.when), rel = dn === 'Heute' || dn === 'Morgen';
      return row(dn === 'Heute' ? ' now' : '', '<div class="hrw-b"><b>' + DAYS[x.when.getDay()].toUpperCase() + '</b><span>' + x.when.getDate() + '</span></div>',
        esc(x.name), rel ? dn : null, x.min ? mins(x.min) : null);
    }).join('') + '</div>';
  };
  /* Weich, breit: Wochenleiste – sieben Tage nebeneinander (heute hervorgehoben, freie Tage
     als Strich). Schmal (Handy) dieselbe Liste wie sonst, sieben Kacheln wären dort zu eng. */
  var WEEK_CSS = '<style>.hrk-w{display:none;}'
    + '@media (min-width: 761px) { .hrk-w{display:block;} .hrk-l{display:none;} }'
    + '.hrk{display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:8px;text-align:left;}'
    + '.hrk-d{min-height:104px;box-sizing:border-box;padding:12px 10px 12px 12px;border-radius:20px;display:flex;flex-direction:column;'
    + 'background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));}'
    + '.hrk-d.now{background:var(--casora-soft-row-selected, #fff);box-shadow:var(--casora-soft-row-selected-shadow, none);}'
    + '.hrk-h{display:flex;align-items:baseline;gap:5px;color:var(--casora-soft-sub, rgba(46,39,33,0.6));}'
    + '.hrk-h b{font-size:11px;font-weight:700;letter-spacing:.08em;}'
    + '.hrk-h span{font-size:17px;font-weight:700;color:var(--casora-popup-tiles-text-primary, #2E2721);font-variant-numeric:tabular-nums;}'
    + '.hrk-d.now .hrk-h b, .hrk-d.now .hrk-h span{color:var(--casora-soft-icon-on, #276B64);}'
    + '.hrk-n{margin-top:auto;padding-top:10px;font-size:13px;font-weight:700;line-height:1.25;letter-spacing:-0.01em;color:var(--casora-popup-tiles-text-primary, #2E2721);'
    /* white-space:normal: button-card vererbt nowrap – dann brach der Name nie um und wurde
       ohne „…“ abgeschnitten (Issue #3). Zwei Zeilen, danach Ellipse. */
    + 'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:normal;overflow-wrap:anywhere;}'
    + '.hrk-n.off{color:var(--casora-soft-sub, rgba(46,39,33,0.45));font-weight:500;}'
    + '.hrk-m{font-size:11.5px;font-weight:500;color:var(--casora-soft-sub, rgba(46,39,33,0.6));margin-top:2px;}</style>';
  R.weekHtml = function () {
    var C = R.cal, HH = window._casoraHH;
    var strip = '';
    if (C.list) {
      var t0 = dayStart(new Date());
      for (var i = 0; i < 7; i++) {
        var d = new Date(t0.getTime() + i * 86400000);
        var meals = C.list.filter(function (x) { return dayStart(x.when).getTime() === dayStart(d).getTime(); });
        var m0 = meals[0];
        strip += '<div class="hrk-d' + (i === 0 ? ' now' : '') + '"><div class="hrk-h"><b>' + (i === 0 ? 'HEUTE' : DAYS[d.getDay()].toUpperCase()) + '</b><span>' + d.getDate() + '</span></div>'
          + (m0 ? '<div class="hrk-n">' + esc(m0.name) + (meals.length > 1 ? ' +' + (meals.length - 1) : '') + '</div>' + (m0.min ? '<div class="hrk-m">' + mins(m0.min) + '</div>' : '')
            : '<div class="hrk-n off">–</div>') + '</div>';
      }
    }
    return WEEK_CSS + '<div class="hrk-w">' + HH.label('Speiseplan') + (C.list ? '<div class="hrk">' + strip + '</div>' : R.calSoft().replace(HH.label('Speiseplan'), '')) + '</div>'
      + '<div class="hrk-l">' + R.calSoft() + '</div>';
  };
  R.calHtml = function () {
    var UI = window._casoraUI, C = R.cal;
    if (window._casoraHH && window._casoraHH.on()) return R.calSoft();
    if (!C.list) return UI.group([{ icon: 'mdi:calendar-blank-outline', iconTone: 'rgba(255,255,255,0.18)', label: C.err ? 'Speiseplan nicht verfügbar' : 'Wird geladen …' }], 'Speiseplan');
    if (!C.list.length) return UI.group([{ icon: 'mdi:calendar-blank-outline', iconTone: 'rgba(255,255,255,0.18)', label: 'Nichts geplant', sub: 'In der Cookidoo-App auf "Meine Woche" planen' }], 'Speiseplan');
    return UI.group(C.list.map(function (x) {
      return { icon: 'mdi:silverware-fork-knife', iconTone: dayName(x.when) === 'Heute' ? 'accent' : 'rgba(255,255,255,0.18)',
        label: x.name, sub: dayName(x.when) + (x.min ? ' · ' + mins(x.min) : '') };
    }), 'Speiseplan');
  };

  /* Einkaufsliste: Cookidoo-Einkaufsliste (Zutaten geplanter Rezepte, nur abhaken) und
     "Zusätzliche Käufe" (dorthin schreibt "Auf die Einkaufsliste"). Beide per WS geladen,
     neu sobald sich eine der beiden Listen ändert. Erledigte eingeklappt. */
  R.loadTodo = function (hass, key) {
    var T = R.todo;
    if (T.busy || T.key === key || !hass || !hass.callWS) return;
    T.busy = true;
    var get = function (id) {
      if (!id) return Promise.resolve([]);
      return hass.callWS({ type: 'todo/item/list', entity_id: id })
        .then(function (r) { return ((r && r.items) || []).map(function (i) { i._list = id; return i; }); })
        .catch(function () { return []; });
    };
    Promise.all([get(todo()), get(extra())])
      .then(function (r) { T.items = r[0].concat(r[1]); T.err = false; T.key = key; })
      .catch(function () { T.err = true; })
      .then(function () { T.busy = false; repaint('hr-todo', R.todoHtml); });
  };
  /* Zutat → Icon + Kategorienfarbe (erstes passendes Stichwort gewinnt). */
  var FOOD = [
    [/käse|parmesan|mozzarella|feta|gouda|emmentaler|ricotta|mascarpone/, 'mdi:cheese', '#FFD60A'],
    [/milch|sahne|joghurt|quark|schmand|crème|creme|butter/, 'mdi:cup', '#64D2FF'],
    [/\beier?\b/, 'mdi:egg', '#FFD60A'],
    [/nudel|pasta|makkaroni|spaghetti|penne|lasagne|tortellini/, 'mdi:pasta', '#FF9F0A'],
    [/reis\b|risotto/, 'mdi:rice', '#FF9F0A'],
    [/mehl|zucker|grieß|haferflocken|stärke|backpulver|hefe/, 'mdi:sack', '#FF9F0A'],
    [/brot|brötchen|baguette|toast/, 'mdi:baguette', '#FF9F0A'],
    [/hähnchen|huhn|hühn|pute|rind|schwein|hack|speck|schinken|wurst|fleisch|lamm/, 'mdi:food-drumstick', '#FF453A'],
    [/fisch|lachs|thunfisch|garnele|shrimp|kabeljau/, 'mdi:fish', '#0A84FF'],
    [/pilz|champignon/, 'mdi:mushroom', '#AC8E68'],
    [/zitrone|limette|orange|apfel|birne|banane|beere|obst/, 'mdi:fruit-citrus', '#FFD60A'],
    [/wein\b|weißwein|rotwein/, 'mdi:bottle-wine', '#BF5AF2'],
    [/öl\b|olivenöl|rapsöl/, 'mdi:bottle-tonic-outline', '#FFD60A'],
    [/brühe|fond|gewürzpaste/, 'mdi:pot-steam', '#FF9F0A'],
    [/wasser/, 'mdi:water', '#64D2FF'],
    [/salz|pfeffer|curry|muskat|paprikapulver|zimt|kreuzkümmel|gewürz|chili/, 'mdi:shaker-outline', '#FF9F0A'],
    [/petersilie|basilikum|schnittlauch|koriander|thymian|rosmarin|kräuter|salat|spinat|rucola/, 'mdi:leaf', '#30D158'],
    [/kürbis|kartoffel|karotte|möhre|zwiebel|schalotte|knoblauch|lauch|zucchini|paprika|tomate|gurke|brokkoli|blumenkohl|sellerie|gemüse|erbse|bohne|linse|mais/, 'mdi:carrot', '#30D158'],
  ];
  var foodOf = function (name) {
    var n = String(name || '').toLowerCase();
    for (var i = 0; i < FOOD.length; i++) if (FOOD[i][0].test(n)) return FOOD[i];
    return [null, 'mdi:basket-outline', 'rgba(255,255,255,0.55)'];
  };
  R.todoHtml = function () {
    var UI = window._casoraUI, T = R.todo, K = UI.tokens;
    var head = function (t) { return '<div style="font-family:' + K.font + ';font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);text-align:left;color:var(--casora-h15-c, ' + K.ink + ');padding:0 4px 8px;">' + t + '</div>'; };
    if (!T.items) return UI.group([{ icon: 'mdi:cart-outline', iconTone: 'rgba(255,255,255,0.18)', label: T.err ? 'Einkaufsliste nicht verfügbar' : 'Wird geladen …' }], 'Einkaufsliste');
    var open = T.items.filter(function (i) { return i.status !== 'completed'; });
    var done = T.items.filter(function (i) { return i.status === 'completed'; });
    var css = '<style>'
      + '.hrl{background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);overflow:hidden;'
      +   'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);'
      +   'font-family:' + K.font + ';text-align:left;}'
      + '.hrl-r{display:flex;align-items:center;gap:12px;min-height:52px;padding:6px 16px;cursor:pointer;-webkit-tap-highlight-color:transparent;}'
      + '.hrl-r + .hrl-r{border-top:1px solid var(--casora-popup-divider, rgba(255,255,255,0.08));}'
      + '@media (hover:hover){.hrl-r:hover{background:var(--casora-popup-row-hover, rgba(255,255,255,0.045));}}'
      + '.hrl-i{width:32px;height:32px;flex:none;border-radius:9px;display:grid;place-items:center;pointer-events:none;}'
      + '.hrl-t{flex:1;min-width:0;pointer-events:none;}'
      + '.hrl-n{font-size:16px;color:' + K.ink + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '.hrl-s{font-size:13px;color:' + K.ink3 + ';margin-top:1px;}'
      + '.hrl-d .hrl-n{color:' + K.ink3 + ';text-decoration:line-through;}'
      + '.hrl-d .hrl-i{opacity:.45;}'
      + '.hrl-c{display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 26px;width:26px;height:26px;pointer-events:none;}'
      + '</style>';
    /* Weich: einzelne Sand-Pillen mit rundem Symbol, Etikett darüber (wie Leuchten im Licht-Popup). */
    var sf = window._casoraHH && window._casoraHH.on();
    if (sf) css += '<style>.hrl{background:none;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;overflow:visible;'
      + 'border-radius:0;display:flex;flex-direction:column;gap:8px;}'
      + '.hrl-r{min-height:58px;box-sizing:border-box;padding:10px 16px 10px 10px;border-radius:var(--casora-popup-row-radius, 24px);'
      + 'background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));transition:background-color .18s ease;}'
      + '.hrl-r + .hrl-r{border-top:none;}'
      + '@media (hover:hover){.hrl-r:hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
      + '.hrl-i{width:38px;height:38px;border-radius:50%;}'
      + '.hrl-n{font-size:14.5px;font-weight:700;letter-spacing:-0.01em;}'
      + '.hrl-s{font-size:12.5px;font-weight:500;color:var(--casora-soft-sub, ' + K.ink2 + ');}'
      + '.hrl-c ha-icon{color:var(--casora-soft-glyph-off, rgba(58,50,43,0.55)) !important;}'
      + '.hrl-d .hrl-c ha-icon{color:var(--casora-popup-ui-good, #30D158) !important;}</style>';
    /* Haken statt Kästchen: offen = blasser Umriss-Haken, erledigt = grüner gefüllter Haken. */
    var tick = function (isDone) {
      return '<ha-icon icon="' + (isDone ? 'mdi:check-circle' : 'mdi:check-circle-outline') + '" style="--mdc-icon-size:26px;width:26px;height:26px;display:flex;align-items:center;justify-content:center;line-height:0;color:'
        + (isDone ? 'var(--casora-popup-ui-good, #30D158)' : 'rgba(255,255,255,0.28)') + ';"></ha-icon>';
    };
    /* Weich: Kategorienfarben aus der Weich-Palette statt greller iOS-Systemfarben; das neutrale
       Korb-Symbol (sonst weiß auf Sand, kaum sichtbar) in der gedämpften Symbolfarbe. */
    var SOFT_FOOD = { '#FFD60A': 'var(--casora-color-yellow)', '#64D2FF': 'var(--casora-color-blue)',
      '#FF9F0A': 'var(--casora-color-orange)', '#FF453A': 'var(--casora-color-red)', '#0A84FF': 'var(--casora-color-blue)',
      '#AC8E68': 'var(--casora-color-sand, #9A8672)', '#BF5AF2': 'var(--casora-color-pink)', '#30D158': 'var(--casora-color-green)',
      'rgba(255,255,255,0.55)': 'var(--casora-soft-glyph-off, rgba(58,50,43,0.55))' };
    var row = function (i, isDone) {
      var f = foodOf(i.summary);
      if (sf && SOFT_FOOD[f[2]]) f = [f[0], f[1], SOFT_FOOD[f[2]]];
      var svc = { domain: 'todo', service: 'update_item', data: { item: i.uid || i.summary, status: isDone ? 'needs_action' : 'completed' }, target: { entity_id: i._list } };
      return '<div class="hrl-r' + (isDone ? ' hrl-d' : '') + '" data-casora-svc="' + esc(JSON.stringify(svc)) + '">'
        + '<div class="hrl-i" style="background:color-mix(in srgb, ' + f[2] + ' 22%, transparent);"><ha-icon icon="' + f[1] + '" style="--mdc-icon-size:19px;width:19px;height:19px;display:flex;color:' + f[2] + ';"></ha-icon></div>'
        + '<div class="hrl-t"><div class="hrl-n">' + esc(i.summary) + '</div>' + (i.description ? '<div class="hrl-s">' + esc(i.description) + '</div>' : '') + '</div>'
        + '<span class="hrl-c">' + tick(isDone) + '</span></div>';
    };
    var rows = open.map(function (i) { return row(i, false); }).join('');
    var okC = sf ? 'var(--casora-color-green)' : '#30D158';
    if (!open.length) rows += '<div class="hrl-r" style="cursor:default;"><div class="hrl-i" style="background:' + (sf ? 'color-mix(in srgb, ' + okC + ' 22%, transparent)' : 'rgba(48,209,88,0.2)') + ';"><ha-icon icon="mdi:cart-check" style="--mdc-icon-size:19px;width:19px;height:19px;display:flex;color:' + okC + ';"></ha-icon></div>'
      + '<div class="hrl-t"><div class="hrl-n">Alles eingekauft</div>' + (done.length ? '' : '<div class="hrl-s">Einkaufsliste ist leer</div>') + '</div></div>';
    if (done.length) {
      rows += '<div class="hrl-r" data-hr-done=""><div class="hrl-i" style="background:rgba(255,255,255,0.08);"><ha-icon icon="' + (T.showDone ? 'mdi:chevron-up' : 'mdi:chevron-down') + '" style="--mdc-icon-size:19px;width:19px;height:19px;display:flex;color:' + K.ink3 + ';"></ha-icon></div>'
        + '<div class="hrl-t"><div class="hrl-n" style="color:' + K.ink3 + ';">' + done.length + ' erledigt</div></div>'
        + '<div class="hrl-s" style="flex:none;pointer-events:none;">' + (T.showDone ? 'Ausblenden' : 'Anzeigen') + '</div></div>';
      if (T.showDone) rows += done.map(function (i) { return row(i, true); }).join('');
    }
    /* Info-Popup (24.09.2026): Überschrift in der Karte. */
    if (sf) return css + window._casoraHH.label('Einkaufsliste' + (open.length ? ' · ' + open.length + ' offen' : '')) + '<div class="hrl">' + rows + '</div>';
    return css + '<div class="hrl">' + head('Einkaufsliste' + (open.length ? ' · ' + open.length + ' offen' : '')).replace('padding:0 4px 8px;', 'padding:var(--casora-popup-row-pad-y, 8px) var(--casora-popup-row-pad-x, 16px) 10px;') + rows + '</div>';
  };

  R.sec = function (name, states, hass) {
    var UI = window._casoraUI; if (!UI) return '';
    var T = UI.tokens;
    var SF = !!(window._casoraHH && window._casoraHH.on());
    if (name === 'hero') {
      /* Weich (Entschlacken): „Heute: Kürbissuppe“ bzw. das nächste geplante Rezept – aus dem
         Kalenderzustand, sonst aus dem geladenen Speiseplan (dann zeichnet loadCal nach). */
      return '<div class="hr-hero">' + R.heroHtml(states) + '</div>';
    }
    if (name === 'app' && SF) {
      /* Weich: als beschriftete Zeile wie „Zutaten der Idee“ – steht im breiten „Mehr“ bündig daneben. */
      return '<div style="font-family:' + T.font + ';text-align:left;">' + window._casoraHH.label('Cookidoo')
        + '<div data-casora-link="https://cookidoo.de/shopping/de-DE" style="display:flex;align-items:center;gap:12px;min-height:58px;box-sizing:border-box;padding:10px 16px 10px 10px;cursor:pointer;'
        + 'border-radius:var(--casora-popup-row-radius, 24px);background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));-webkit-tap-highlight-color:transparent;">'
        + '<div style="flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--casora-soft-icon-off, rgba(140,115,90,0.12));pointer-events:none;">'
        + '<ha-icon icon="mdi:chef-hat" style="--mdc-icon-size:19px;width:19px;height:19px;display:flex;color:var(--casora-popup-tiles-text-primary, #2E2721);"></ha-icon></div>'
        + '<div style="flex:1;min-width:0;pointer-events:none;"><div style="font-size:14.5px;font-weight:700;letter-spacing:-0.01em;color:' + T.ink + ';">Cookidoo-App öffnen</div>'
        + '<div style="font-size:12.5px;font-weight:500;color:var(--casora-soft-sub, ' + T.ink2 + ');margin-top:1px;">Einkaufsliste und Wochenplan bearbeiten</div></div>'
        + '<ha-icon icon="mdi:open-in-new" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;pointer-events:none;color:var(--casora-soft-glyph-off, rgba(58,50,43,0.55));"></ha-icon></div></div>';
    }
    if (name === 'app') {
      return '<div style="font-family:' + T.font + ';text-align:left;">' + (window._casoraHH ? window._casoraHH.pillCss : '')
        + '<div class="hh-pills" style="justify-content:flex-start;"><div class="hh-pill" data-casora-link="https://cookidoo.de/shopping/de-DE">'
        + '<ha-icon icon="mdi:open-in-new" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;pointer-events:none;"></ha-icon>'
        + '<span style="pointer-events:none;">Cookidoo-App öffnen</span></div></div></div>';
    }
    if (name === 'idea' || name === 'ideaBand') {
      var band = name === 'ideaBand';
      var n = R.next(states), s = states[IDEA];
      var a = (s && s.attributes) || {};
      var running = a.status === 'running';
      var has = s && s.state !== 'unknown' && s.state !== 'unavailable';
      var plate = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
        + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
        + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);padding:18px 20px;font-family:' + T.font + ';text-align:left;';
      /* Weich (Audit K6): Hauptaktion in Ton wie die übrigen Aktionsknöpfe, Nebenaktionen sandfarben –
         vorher türkisgrüne Pillen, die es sonst nirgends gibt. */
      var softBtn = !!(window._casoraSoft && window._casoraSoft());
      var btn = function (label, attr, primary) {
        return '<span ' + attr + ' style="display:inline-flex;align-items:center;cursor:pointer;font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;'
          + (softBtn ? (primary ? 'color:#fff;background:var(--casora-soft-primary, #B67A50);'
            : 'color:' + T.ink + ';background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));')
          : primary ? (window._casoraHH && window._casoraHH.on() ? 'color:var(--casora-popup-ui-on-action, #fff);background:var(--casora-popup-ui-action, #276B64);'
            : 'color:#000;background:var(--casora-color-teal, #00C3D0);') : 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));')
          + '">' + label + '</span>';
      };
      var out = '';
      /* Weich: das geplante Rezept steht im Kopf. */
      if (n && !SF) {
        out += '<div style="' + plate + 'margin-bottom:18px;">'
          + '<div style="font-size:13px;color:' + T.ink2 + ';">Geplant · ' + esc(dayName(n.when)) + '</div>'
          + '<div style="font-size:var(--casora-fs24,24px);font-weight:var(--casora-fw24,600);letter-spacing:-0.02em;color:' + T.ink + ';margin-top:2px;">' + esc(n.name) + '</div>'
          + (n.min ? '<div style="font-size:14px;color:' + T.ink2 + ';margin-top:4px;">' + mins(n.min) + '</div>' : '')
          + '</div>';
      }
      /* Weich: Etikett über der Karte wie bei Speiseplan/Einkaufsliste – die Spalten beginnen bündig. */
      if (SF) out += window._casoraHH.label('Idee der Woche');
      /* Band (breit): Text links, Knöpfe rechts untereinander; schmal wie gehabt untereinander. */
      if (band) out += '<style>@media (min-width: 761px) { .hri-band { display:flex; align-items:center; gap:28px; }'
        + ' .hri-band > .hri-t { flex:1 1 auto; min-width:0; } .hri-band > .hri-b { flex:0 0 auto; flex-direction:column; align-items:stretch; margin-top:0 !important; }'
        + ' .hri-band > .hri-b > span { justify-content:center; } }</style>';
      out += '<div class="hri' + (band ? ' hri-band' : '') + '" style="' + plate + '"><div class="hri-t">'
        + '<div style="display:flex;align-items:center;justify-content:flex-start;gap:6px;font-size:13px;color:' + T.ink2 + ';">'
        + '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 16px;width:16px;height:16px;"><ha-icon icon="mdi:creation" style="--mdc-icon-size:16px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:0;color:var(--casora-color-teal, #00C3D0);"></ha-icon></span>'
        + '<span style="flex:1 1 auto;text-align:left;">' + (SF ? 'Vorschlag von Claude' : 'Idee der Woche von Claude') + '</span></div>';
      if (running) {
        out += '<div style="font-size:20px;font-weight:600;color:' + T.ink + ';margin-top:6px;">Claude sucht ein Rezept …</div>';
      } else if (has) {
        var m = mins(a.minuten);
        out += '<div style="font-size:' + (n ? '20' : '24') + 'px;font-weight:' + (softBtn ? 700 : 600) + ';letter-spacing:-0.02em;color:' + T.ink + ';margin-top:4px;">' + esc(s.state) + '</div>'
          + '<div style="font-size:14px;color:' + T.ink2 + ';margin-top:4px;">' + [m, 'Thermomix'].filter(Boolean).join(' · ') + '</div>'
          + (a.warum ? '<div style="font-size:14px;line-height:1.45;color:' + T.ink + ';margin-top:10px;white-space:normal;">' + esc(a.warum) + '</div>' : '');
      } else {
        out += '<div style="font-size:18px;font-weight:600;color:' + T.ink + ';margin-top:6px;">' + (a.status === 'error' ? 'Keine Idee gefunden' : 'Noch keine Idee') + '</div>';
      }
      out += '</div><div class="hri-b" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;">'
        + (has && !running && /^https:\/\/cookidoo\./.test(a.link || '') ? btn('Rezept öffnen', 'data-casora-link="' + esc(a.link) + '"', true) : '')
        + (has && !running && (a.zutaten || []).length ? btn('Auf die Einkaufsliste', 'data-casora-svc="' + esc(JSON.stringify(window.casoraSvc('casora_rezept_auf_liste'))) + '"', false) : '')
        + (!running ? btn(has ? 'Andere Idee' : 'Idee holen', 'data-casora-svc="' + esc(JSON.stringify(window.casoraSvc('casora_rezept_neu'))) + '"', !has) : '')
        /* Cookidoo-App (24.09.2026): /shopping/* ist ein Universal Link der Cookidoo-App (apple-app-site-association),
           iPhone/iPad springt damit in die App (Einkaufsliste), ohne App bzw. am Mac öffnet cookidoo.de. */
        + (SF ? '' : btn('Cookidoo-App öffnen', 'data-casora-link="https://cookidoo.de/shopping/de-DE"', false))
        + '</div></div>';
      return out;
    }
    if (name === 'ing') {
      var z = (states[IDEA] && states[IDEA].attributes.zutaten) || [];
      if (!z.length || (states[IDEA].attributes.status === 'running')) return '';
      /* Weich: Etikett über der Platte statt Titel darin. */
      if (window._casoraHH && window._casoraHH.on()) return '<div style="font-family:' + T.font + ';text-align:left;">' + window._casoraHH.label('Zutaten der Idee')
        + '<div style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);padding:14px 18px;">'
        + '<ul style="margin:0;padding-left:18px;font-size:14.5px;font-weight:500;line-height:1.7;color:' + T.ink + ';white-space:normal;">'
        + z.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div></div>';
      return '<div style="font-family:' + T.font + ';text-align:left;">'
        + '<div style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);padding:14px 18px;'
        + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);">'
        + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 0 10px;">Zutaten der Idee</div>'
        + '<ul style="margin:0;padding-left:18px;font-size:15px;line-height:1.7;color:' + T.ink + ';white-space:normal;">'
        + z.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div></div>';
    }
    if (name === 'cal') { R.loadCal(hass); return '<div class="hr-cal">' + R.calHtml() + '</div>'; }
    if (name === 'week') { R.loadCal(hass); return '<div class="hr-week">' + R.weekHtml() + '</div>'; }
    if (name === 'todo' || name === 'todoWide') {
      var opts2 = name === 'todoWide';
      var ts = states[todo()], tx = states[extra()];
      R.loadTodo(hass, (ts ? ts.state + '|' + ts.last_updated : 'x') + '/' + (tx ? tx.state + '|' + tx.last_updated : 'x'));
      return '<div class="hr-todo' + (opts2 ? ' hr-todo-2' : '') + '">' + R.todoHtml() + '</div>'
        + (opts2 ? '<style>@media (min-width: 761px) { .hr-todo-2 .hrl { display:grid !important; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px 26px !important; } }</style>' : '')
        + (ts && Number(ts.state) > 0 ? '' : '');
    }
    return '';
  };

  R.popup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    /* Ohne feste Entität: Rezept-Sensor bzw. Cookidoo-Kalender/-Liste als Anker (sonst leeres Popup). */
    if (!entity || !entity.entity_id) entity = { entity_id: [IDEA, cal(), todo()].filter(function (w) { return w && states[w]; })[0] || IDEA };
    if (!UI) return { type: 'vertical-stack', cards: [] };
    R.cal.ts = 0; // beim Öffnen frisch laden
    var watch = [entity.entity_id, IDEA, cal(), todo(), extra()].filter(function (w, i, a) { return a.indexOf(w) === i && states[w]; });
    var fields = {}, fstyle = {};
    var add = function (k) { fields[k] = '[[[ return window._casoraRecipe ? window._casoraRecipe.sec(' + JSON.stringify(k) + ', states, hass) : ""; ]]]'; fstyle[k] = [{ 'justify-self': 'stretch' }]; };
    ['idea', 'ideaBand', 'ing', 'cal', 'week', 'todo', 'todoWide'].forEach(add);
    /* Weich (Entschlacken 01.10.2026): Kopf „Heute: …“, Speiseplan als Wochenleiste, Idee der Woche
       als breites Band, Einkaufsliste zweispaltig; Zutaten der Idee und „Cookidoo-App öffnen“ unter „Mehr“. */
    var HH = window._casoraHH;
    if (HH && HH.on() && HH.layout) {
      add('hero');
      /* Einspaltig (alles volle Breite): „Mehr“ teilt sich aufgeklappt selbst auf zwei Spalten
         (wie das breite Mehr im Zwei-Spalten-Aufbau). */
      fields.more = HH.moreCard(watch, 'const R = window._casoraRecipe, H = window._casoraHH;\n'
        + 'return R && H ? H.more("recipe", ["ing", "app"].map(function (n) { return R.sec(n, states, hass); }))'
        + ' + "<style>@media (min-width: 761px) { .hui-more.open > .hui-mbd { display: block !important; column-count: 2; column-gap: var(--casora-popup-col-gap, 26px); }'
        + ' .hui-more.open > .hui-mbd > * { break-inside: avoid; -webkit-column-break-inside: avoid; display: block; margin: 0; padding-bottom: 18px; }'
        + ' .hui-more.open > .hui-mbd > style { display: none; margin: 0; } }</style>" : "";', entity.entity_id);
      /* Variante C: alles in Bändern über die volle Breite – Wochenleiste, Idee, Einkaufsliste
         zweispaltig, „Mehr“. Keine Spalte kann leer auslaufen. */
      return HH.layout({ entity: entity.entity_id, watch: watch, fields: fields, top: ['hero', 'week', 'ideaBand'], left: ['todoWide'], right: ['more'] });
    }
    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }', 'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    ].join('\n');
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = fields[k]; cs[k] = fstyle[k]; });
      return {
        type: 'custom:button-card', entity: entity.entity_id, triggers_update: watch,
        tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle }, extra_styles: window._casoraColGap ? window._casoraColGap(keys) : '',
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
                 { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    return {
      type: 'custom:button-card', entity: entity.entity_id,
      card_mod: { style: wrapperStyle + '\nha-card.disabled { pointer-events: auto !important; }' },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: "left right" !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: 20px !important; } }',
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': '"left" "right"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: { left: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }], right: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }] },
      },
      custom_fields: (function () { var sp = window._casoraSplit ? window._casoraSplit('recipe', ['idea', 'ing'], ['cal', 'todo'], { leftMovable: ['ing'] }) : { left: ['idea', 'ing'], right: ['cal', 'todo'] };
        return { left: { card: makeCol(sp.left) }, right: { card: makeCol(sp.right) } }; })(),
    };
  };

  /* Erledigt-Zeile der Einkaufsliste auf-/zuklappen (nur Anzeige). */
  var hrDone = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) if (p[i] && p[i].hasAttribute && p[i].hasAttribute('data-hr-done')) return true;
    return false;
  };
  var hrT = 0, hrS = null;
  window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; hrS = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    if (!hrDone(ev) || !hrS) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientX - hrS.x) > 10 || Math.abs(t.clientY - hrS.y) > 10)) return;
    hrT = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation();
    R.todo.showDone = !R.todo.showDone; repaint('hr-todo', R.todoHtml);
  }, { capture: true, passive: false });
  window.addEventListener('click', function (ev) {
    if (!hrDone(ev)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - hrT < 700) return;
    R.todo.showDone = !R.todo.showDone; repaint('hr-todo', R.todoHtml);
  }, true);

  /* Links in Popups (data-casora-link): Klicks werden dort verschluckt, daher selbst öffnen. */
  if (!window._casoraLinkHandler) {
    window._casoraLinkHandler = true;
    var ts0 = null, tDone = 0;
    var linkOf = function (ev) {
      var p = (ev.composedPath && ev.composedPath()) || [];
      for (var i = 0; i < p.length; i++) if (p[i] && p[i].getAttribute && p[i].hasAttribute('data-casora-link')) return p[i];
      return null;
    };
    var go = function (el) { var u = el.getAttribute('data-casora-link'); if (/^https?:\/\//.test(u || '')) window.open(u, '_blank', 'noopener'); };
    window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; ts0 = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
    window.addEventListener('touchend', function (ev) {
      var el = linkOf(ev); if (!el || !ts0) return;
      var t = ev.changedTouches && ev.changedTouches[0];
      if (t && (Math.abs(t.clientX - ts0.x) > 10 || Math.abs(t.clientY - ts0.y) > 10)) return;
      tDone = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); go(el);
    }, { capture: true, passive: false });
    window.addEventListener('click', function (ev) {
      var el = linkOf(ev); if (!el) return;
      ev.preventDefault(); ev.stopPropagation();
      if (Date.now() - tDone >= 700) go(el);
    }, true);
  }
})();

// ── Auto-Kachel + Popup (Auto über EU-Data-Act, 23.09.2026) ─────────────
// Template casora_car (['casora_entity','casora_popup_car']) ruft nur
// window._casoraCar.tile()/level()/popup() auf. variables.car = altes Entitäts-Präfix,
// sonst die Kachel-Entität (ihr Gerät ist das Auto), sonst das Gerät mit den meisten
// Fahrzeug-Rollen. Nur lesend; Daten kommen je nach Integration verzögert.
(function () {
  if (window._casoraCar) return;
  var C = window._casoraCar = {};
  var num = function (v) { var n = parseFloat(v); return isNaN(n) ? null : n; };
  var ok = function (s) { return s && s.state !== 'unknown' && s.state !== 'unavailable'; };
  var fmtN = function (n, d) { return n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return null;
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.';
  };
  var DOORS = [['tur_vorne_links', 'Fahrertür'], ['tur_vorne_rechts', 'Beifahrertür'], ['tur_hinten_links', 'Tür hinten links'], ['tur_hinten_rechts', 'Tür hinten rechts'], ['heckklappe', 'Heckklappe'], ['motorhaube', 'Motorhaube']];
  var WINS = [['fenster_vorne_links', 'Fenster vorne links'], ['fenster_vorne_rechts', 'Fenster vorne rechts'], ['fenster_hinten_links', 'Fenster hinten links'], ['fenster_hinten_rechts', 'Fenster hinten rechts'], ['schiebedach', 'Schiebedach']];
  var LOCKS = ['turschloss_vorne_links', 'turschloss_vorne_rechts', 'turschloss_hinten_links', 'turschloss_hinten_rechts', 'heckklappenschloss'];

  // Casora: Entitäten über Rollen statt über eine bestimmte Integration (02.10.2026).
  // Je Rolle: translation_keys bekannter Integrationen (k) und Endungen der Entitäts-ID
  // auf Deutsch und Englisch (e, Reihenfolge = Vorrang), Domänen (d), Ausschlüsse (x).
  // Getestet mit cupra_eu_data_act und volkswagen_connect; die Endungen decken auch
  // Tesla, BMW, Škoda/MySkoda, Mercedes und E-Autos (Akku statt Tank) ab, soweit sie
  // ihre Entitäten so benennen. Das Auto ist das Gerät mit den meisten Treffern.
  var B = ['binary_sensor'], S = ['sensor'];
  var ROLES = {
    reichweite_kombiniert: { d: S, k: ['cruising_range_combined', 'range_combined', 'remaining_range_total', 'total_range', 'range'],
      e: ['reichweite_kombiniert', 'range_combined', 'cruising_range_combined', 'remaining_range_total', 'total_range', 'range_total',
        'range_primary', 'est_battery_range', 'battery_range', 'electric_range', 'remaining_range', 'reichweite', 'range'], x: /(scr|adblue)_range$|range_secondary$/ },
    tankfullstand: { d: S, k: ['fuel_level_current_level', 'fuel_level', 'remaining_fuel_percent', 'fuel_percentage'],
      e: ['tankfullstand', 'fuel_level_current_level', 'fuel_level', 'remaining_fuel_percent', 'fuel_percentage', 'fuel_level_percentage', 'tank_level'] },
    akku: { d: S, k: ['battery_level', 'state_of_charge', 'remaining_battery_percent', 'battery_percentage'],
      e: ['akkustand', 'ladezustand', 'state_of_charge', 'battery_level', 'remaining_battery_percent', 'battery_percentage', 'battery_soc', 'soc'] },
    kilometerstand: { d: S, k: ['mileage', 'odometer'], e: ['kilometerstand', 'mileage', 'odometer', 'odometer_km'] },
    scr_reichweite: { d: S, k: ['scr_range', 'adblue_range'], e: ['scr_reichweite', 'scr_range', 'adblue_range', 'adblue_reichweite'] },
    olstand: { d: S, k: ['oil_level_actual_level', 'oil_level'], e: ['olstand', 'oil_level'] },
    '12v_batteriespannung': { d: S, k: ['boardnetBatteryVoltageIndication', 'battery_voltage_12v'],
      e: ['12v_batteriespannung', 'boardnetbatteryvoltageindication', '12v_battery_voltage', 'battery_voltage_12v', 'aux_battery_voltage'] },
    aussentemperatur: { d: S, k: ['outside_temperature', 'outside_temp'], e: ['aussentemperatur', 'outside_temperature', 'outside_temp', 'exterior_temperature'] },
    datenstand: { d: S, k: ['data_captured', 'last_updated', 'last_update'], e: ['datenstand', 'data_captured', 'last_data_update', 'last_updated', 'last_update'] },
    tur_vorne_links: { d: B, k: ['open_state_front_left_door'], e: ['tur_vorne_links', 'front_left_door', 'door_front_left', 'front_driver_door'] },
    tur_vorne_rechts: { d: B, k: ['open_state_front_right_door'], e: ['tur_vorne_rechts', 'front_right_door', 'door_front_right', 'front_passenger_door'] },
    tur_hinten_links: { d: B, k: ['open_state_rear_left_door'], e: ['tur_hinten_links', 'rear_left_door', 'door_rear_left', 'rear_driver_door'] },
    tur_hinten_rechts: { d: B, k: ['open_state_rear_right_door'], e: ['tur_hinten_rechts', 'rear_right_door', 'door_rear_right', 'rear_passenger_door'] },
    heckklappe: { d: B, k: ['open_state_tailgate', 'trunk', 'trunk_open'], e: ['heckklappe', 'kofferraum', 'tailgate', 'trunk', 'trunk_open', 'boot', 'rear_trunk', 'liftgate'] },
    motorhaube: { d: B, k: ['open_state_front_engine_bonnet', 'bonnet', 'hood'], e: ['motorhaube', 'bonnet', 'hood', 'engine_hood', 'bonnet_open', 'frunk', 'front_trunk'] },
    fenster_vorne_links: { d: B, k: ['state_front_left_door_window_lifter'], e: ['fenster_vorne_links', 'front_left_window', 'window_front_left', 'front_driver_window'] },
    fenster_vorne_rechts: { d: B, k: ['state_front_right_door_window_lifter'], e: ['fenster_vorne_rechts', 'front_right_window', 'window_front_right', 'front_passenger_window'] },
    fenster_hinten_links: { d: B, k: ['state_rear_left_door_window_lifter'], e: ['fenster_hinten_links', 'rear_left_window', 'window_rear_left', 'rear_driver_window'] },
    fenster_hinten_rechts: { d: B, k: ['state_rear_right_door_window_lifter'], e: ['fenster_hinten_rechts', 'rear_right_window', 'window_rear_right', 'rear_passenger_window'] },
    schiebedach: { d: B, k: ['state_sunroof_motor_hood_1', 'sunroof'], e: ['schiebedach', 'sunroof', 'sun_roof', 'sunroof_open', 'panorama_roof'] },
    // Sammelmelder (BMW, Škoda …): eine Entität für alle Türen/Fenster/Klappen.
    turen: { d: B, k: ['doors', 'doors_open'], e: ['turen', 'doors', 'doors_open', 'door_state', 'any_door_open'] },
    fenster: { d: B, k: ['windows', 'windows_open'], e: ['fenster', 'windows', 'windows_open', 'window_state'] },
    klappen: { d: B, k: ['lids'], e: ['klappen', 'lids', 'lids_open'] },
    // Schlösser: binary_sensor der Klasse „lock“ (an = entriegelt) oder lock-Entität.
    turschloss_vorne_links: { d: B, k: ['locked_state_front_left_door'], e: ['turschloss_vorne_links', 'front_left_door_lock', 'door_lock_front_left'] },
    turschloss_vorne_rechts: { d: B, k: ['locked_state_front_right_door'], e: ['turschloss_vorne_rechts', 'front_right_door_lock', 'door_lock_front_right'] },
    turschloss_hinten_links: { d: B, k: ['locked_state__rear_left_door'], e: ['turschloss_hinten_links', 'rear_left_door_lock', 'door_lock_rear_left'] },
    turschloss_hinten_rechts: { d: B, k: ['locked_state_rear_right_door'], e: ['turschloss_hinten_rechts', 'rear_right_door_lock', 'door_lock_rear_right'] },
    heckklappenschloss: { d: B, k: ['locked_state_tailgate'], e: ['heckklappenschloss', 'tailgate_lock', 'trunk_lock'] },
    verriegelung: { d: B, k: ['door_lock_state', 'doors_locked'], e: ['verriegelung', 'door_lock_state', 'doors_locked', 'vehicle_locked', 'central_lock', 'locked'] },
    schloss: { d: ['lock'], k: [], e: ['turschloss', 'door_lock', 'doors', 'lock', 'central_locking', 'vehicle_lock'] },
    feststellbremse: { d: B, k: ['parking_brake'], e: ['feststellbremse', 'parking_brake', 'park_brake', 'handbrake'] },
    nachste_inspektion: { d: S, k: ['inspection_due_date', 'inspection_due', 'service_inspection_time'],
      e: ['nachste_inspektion', 'inspection_due_date', 'inspection_due', 'service_inspection_time', 'service_due_date', 'next_service', 'next_inspection'] },
    inspektionsdistanz: { d: S, k: ['inspectionDistance', 'inspection_due_2', 'service_inspection_distance'],
      e: ['inspektionsdistanz', 'inspection_distance', 'inspection_due_2', 'service_inspection_distance', 'service_due_distance', 'next_service_distance'] },
    nachster_olwechsel: { d: S, k: ['oil_change_due_date', 'oil_service_time', 'oil_service_due'],
      e: ['nachster_olwechsel', 'oil_change_due_date', 'oil_change_due', 'oil_service_time', 'oil_service_due'] },
    strecke_kurzzeit: { d: S, k: ['short_term_data_mileage'], e: ['strecke_kurzzeit'] },
    fahrzeit_kurzzeit: { d: S, k: ['short_term_data_travel_time'], e: ['fahrzeit_kurzzeit'] },
    o_verbrauch_benzin_kurzzeit: { d: S, k: ['short_term_data_average_fuel_consumption'], e: ['o_verbrauch_benzin_kurzzeit'] },
    strecke_langzeit: { d: S, k: ['long_term_data_mileage'], e: ['strecke_langzeit'] },
    fahrzeit_langzeit: { d: S, k: ['long_term_data_travel_time'], e: ['fahrzeit_langzeit'] },
    o_verbrauch_benzin_langzeit: { d: S, k: ['long_term_data_average_fuel_consumption'], e: ['o_verbrauch_benzin_langzeit'] },
    o_geschwindigkeit_langzeit: { d: S, k: ['long_term_data_average_speed'], e: ['o_geschwindigkeit_langzeit'] },
    jetzt_aktualisieren: { d: ['button'], k: ['refresh'], e: ['jetzt_aktualisieren', 'refresh', 'force_refresh', 'refresh_data', 'update_data'] },
  };
  Object.keys(ROLES).forEach(function (r) { var R0 = ROLES[r]; R0.re = R0.e.map(function (x) { return new RegExp('(^|_)' + x + '$'); }); });
  // Rollen, an denen ein Fahrzeug-Gerät zu erkennen ist (eine davon muss dabei sein).
  var CORE = ['reichweite_kombiniert', 'kilometerstand', 'tankfullstand', 'akku'];
  // Bestes Ergebnis je Rolle für eine Entität: 0 = translation_key, 1… = Rang der Endung.
  // Abgeleitete Helfer am Auto-Gerät (z. B. utility_meter „monthly_mileage“) sind nie die Rolle selbst.
  var HELPER = /^(utility_meter|statistics|derivative|integration|template|filter|min_max|threshold|trend|history_stats)$/;
  var rank = function (role, eid, x) {
    var R0 = ROLES[role], dom = eid.split('.')[0], obj = eid.slice(dom.length + 1);
    if (R0.d.indexOf(dom) < 0 || (R0.x && R0.x.test(obj))) return -1;
    if (x && x.platform && HELPER.test(x.platform)) return -1;
    if (x && x.translation_key && R0.k.indexOf(x.translation_key) >= 0) return 0;
    for (var i = 0; i < R0.re.length; i++) if (R0.re[i].test(obj)) return i + 1;
    return -1;
  };
  var mapDevice = function (R, dev) {
    var best = {}, map = {};
    Object.keys(R).forEach(function (e) {
      var x = R[e]; if (!x || x.device_id !== dev || x.hidden || x.disabled_by) return;
      Object.keys(ROLES).forEach(function (role) {
        var r = rank(role, e, x);
        if (r >= 0 && (best[role] == null || r < best[role])) { best[role] = r; map[role] = e; }
      });
    });
    return map;
  };
  var carCache = { reg: null, map: {} };
  // p: altes Präfix (variables.car) ODER eine Entität des Autos (Kachel-Entität) ODER leer.
  C.map = function (p) {
    var root = document.querySelector('home-assistant');
    var hass = root && root.hass;
    var R = (hass && hass.entities) || {};
    if (carCache.reg !== R) carCache = { reg: R, map: {} };
    var ck = p || '';
    if (carCache.map[ck]) return carCache.map[ck];
    var dev = null;
    if (p && p.indexOf('.') > 0 && R[p]) dev = R[p].device_id;
    else if (p && R['sensor.' + p + '_reichweite_kombiniert']) dev = R['sensor.' + p + '_reichweite_kombiniert'].device_id;
    if (!dev) {
      // Kandidaten: Geräte mit einer Kernrolle; gewählt wird das mit den meisten Rollen.
      var devs = {};
      Object.keys(R).forEach(function (e) {
        var x = R[e]; if (!x || !x.device_id || devs[x.device_id]) return;
        if (CORE.some(function (role) { return rank(role, e, x) >= 0; })) devs[x.device_id] = true;
      });
      var top = 0;
      Object.keys(devs).sort().forEach(function (d) {
        var m = mapDevice(R, d), n = Object.keys(m).length;
        if (n >= 4 && n > top) { top = n; dev = d; carCache.map['dev|' + d] = m; }
      });
    }
    var m = dev ? (carCache.map['dev|' + dev] || mapDevice(R, dev)) : {};
    carCache.map[ck] = m;
    return m;
  };
  C.id = function (p, suffix, domain) {
    var hit = C.map(p)[suffix];
    if (hit && (!domain || hit.split('.')[0] === domain)) return hit;
    return p && p.indexOf('.') < 0 ? domain + '.' + p + '_' + suffix : null;
  };

  // Datum aus einem Wartungssensor: Datum/Zeitstempel oder Resttage (Einheit d/Tage).
  var toDate = function (x) {
    if (!ok(x)) return null;
    var u = (x.attributes && x.attributes.unit_of_measurement) || '';
    if (/^(d|days?|tage?)$/i.test(u) && num(x.state) != null) return new Date(Date.now() + num(x.state) * 86400000);
    var t = new Date(x.state); return isNaN(t) ? null : t;
  };
  C.toDate = toDate;
  C.read = function (p, states) {
    var s = function (k) { var id = C.id(p, k, 'sensor'); return id && states[id]; };
    var b = function (k) { var id = C.id(p, k, 'binary_sensor'); return id && states[id]; };
    var val = function (k) { var x = s(k); return ok(x) ? num(x.state) : null; };
    var on = function (k) { var x = b(k); return !!(x && x.state === 'on'); };
    var openDoors = DOORS.filter(function (d) { return on(d[0]); }).map(function (d) { return d[1]; });
    var openWins = WINS.filter(function (d) { return on(d[0]); }).map(function (d) { return d[1]; });
    // Sammelmelder nur, wenn keine Einzelmelder offen sind (sonst doppelt).
    if (!openDoors.length && on('turen')) openDoors.push('Türen');
    if (!openDoors.length && on('klappen')) openDoors.push('Klappen');
    if (!openWins.length && on('fenster')) openWins.push('Fenster');
    var lk = LOCKS.concat(['verriegelung']).map(function (k) { return b(k); }).filter(ok);
    var unlocked = lk.filter(function (x) { return x.state === 'on'; }).length;
    var lockEnt = (function () { var id = C.id(p, 'schloss', 'lock'); return id && states[id]; })();
    var locked = lk.length ? unlocked === 0 : null;
    if (ok(lockEnt)) locked = lockEnt.state === 'locked' && locked !== false;
    var range = s('reichweite_kombiniert'), stampS = s('datenstand');
    var fuel = val('tankfullstand'), soc = val('akku');
    return {
      range: val('reichweite_kombiniert'), tank: fuel != null ? fuel : soc, ev: fuel == null && soc != null, km: val('kilometerstand'),
      scr: val('scr_reichweite'), oil: val('olstand'), v12: val('12v_batteriespannung'),
      out: val('aussentemperatur'), open: openDoors.concat(openWins), openDoors: openDoors, openWins: openWins, locked: locked,
      brake: on('feststellbremse'),
      insp: s('nachste_inspektion'), inspKm: val('inspektionsdistanz'), oilDate: s('nachster_olwechsel'),
      shortKm: val('strecke_kurzzeit'), shortL: val('o_verbrauch_benzin_kurzzeit'), shortMin: val('fahrzeit_kurzzeit'),
      longKm: val('strecke_langzeit'), longL: val('o_verbrauch_benzin_langzeit'), longMin: val('fahrzeit_langzeit'), longV: val('o_geschwindigkeit_langzeit'),
      stamp: (range && range.attributes && range.attributes.data_captured_at) || (ok(stampS) && !isNaN(Date.parse(stampS.state)) ? stampS.state : null),
      refresh: (function () { var id = C.id(p, 'jetzt_aktualisieren', 'button'); return id && states[id] ? id : null; })(),
    };
  };
  /* 0 = alles gut, 1 = Hinweis (Tank knapp, nicht verriegelt), 2 = etwas offen */
  C.level = function (p, states) {
    var r = C.read(p, states);
    if (r.open.length) return 2;
    if (r.locked === false || (r.tank != null && r.tank <= 15)) return 1;
    return 0;
  };
  C.tile = function (p, states) {
    var r = C.read(p, states);
    if (r.open.length) return r.open.length === 1 ? r.open[0] + ' offen' : r.open.length + ' Öffnungen offen';
    /* Kachel zeigt den Schließzustand (Wunsch), Reichweite/Tank stehen im Popup. */
    if (r.locked === false) return 'Nicht verriegelt';
    if (r.locked === true) return 'Verriegelt';
    return 'Keine Daten';
  };

  C.sec = function (name, p, states) {
    var UI = window._casoraUI; if (!UI) return '';
    var r = C.read(p, states);
    if (name === 'hero') {
      var lv = C.level(p, states);
      var sub = [r.open.length ? r.open.join(', ') + ' offen' : (r.locked === false ? 'Nicht verriegelt' : r.locked ? 'Verriegelt' : null),
        r.stamp ? 'Stand ' + ago(r.stamp) : null].filter(Boolean).join(' · ');
      var SFh = window._casoraHH && window._casoraHH.on();
      /* Weich (Entschlacken): „Reichweite 140 km“ als Hauptwert; „kommt verzögert“ als kleiner Zusatz am Datenstand. */
      if (SFh) sub = [r.open.length ? r.open.join(', ') + ' offen' : (r.locked === false ? 'Nicht verriegelt' : r.locked ? 'Verriegelt' : null),
        r.stamp ? 'Stand ' + ago(r.stamp) + ' (verzögert)' : null].filter(Boolean).join(' · ');
      var out = UI.hero({ label: SFh ? null : 'Reichweite', value: r.range != null ? (SFh ? 'Reichweite ' : '') + fmtN(r.range) : '—', unit: r.range != null ? 'km' : null,
        sub: sub, subTone: lv === 2 ? 'bad' : lv === 1 ? 'warn' : 'good', center: true });
      /* Weich: Tank als breiter runder Balken wie der Helligkeitsregler. */
      if (r.tank != null && window._casoraHH && window._casoraHH.on()) {
        return out + '<div style="height:20px"></div>' + window._casoraHH.bar({ pct: Math.max(2, Math.min(100, r.tank)), text: fmtN(r.tank) + ' %', word: r.ev ? 'Akku' : 'Tank', tone: r.tank <= 15 ? 'warn' : 'accent' });
      }
      if (r.tank != null) {
        var col = r.tank <= 15 ? 'var(--casora-popup-ui-warn, #FF9F0A)' : 'var(--casora-color-teal, #00C3D0)';
        out += '<div style="max-width:420px;margin:14px auto 0;font-family:var(--primary-font-family, system-ui);">'
          + '<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--casora-popup-ui-tertiary, rgba(255,255,255,0.55));margin-bottom:6px;">'
          + '<span>' + (r.ev ? 'Akku' : 'Tank') + '</span><span>' + fmtN(r.tank) + ' %</span></div>'
          + '<div style="height:8px;border-radius:999px;background:rgba(255,255,255,0.14);overflow:hidden;">'
          + '<div style="height:100%;width:' + Math.max(2, Math.min(100, r.tank)) + '%;border-radius:999px;background:' + col + ';"></div></div></div>';
      }
      return out;
    }
    if (name === 'state_s') {
      /* Weich: nur Abweichungen, sonst ein Satz. */
      var dev = [];
      if (r.open.length) dev.push({ icon: 'mdi:alert', iconTone: 'bad', label: r.open.length === 1 ? r.open[0] + ' offen' : 'Offen', sub: r.open.length > 1 ? r.open.join(', ') : null });
      if (r.locked === false) dev.push({ icon: 'mdi:lock-open-variant', iconTone: 'warn', label: 'Nicht verriegelt' });
      if (r.tank != null && r.tank <= 15) dev.push({ icon: r.ev ? 'mdi:battery-10' : 'mdi:gas-station', iconTone: 'warn', label: r.ev ? 'Akku fast leer' : 'Tank fast leer', value: fmtN(r.tank) + ' %', valueTone: 'warn' });
      if (!dev.length) dev.push({ icon: 'mdi:check-circle-outline', iconTone: 'good', label: r.locked == null ? 'Alles zu' : 'Alles zu und verriegelt',
        sub: r.brake ? 'Feststellbremse angezogen' : null });
      return UI.group(dev, 'Zustand');
    }
    if (name === 'service_s') {
      /* Weich: nur Fälliges (Inspektion/Ölwechsel in 30 Tagen bzw. 1.500 km, Öl, AdBlue, 12 V). */
      var dd = toDate;
      var fmtD = function (t) { return t.toLocaleDateString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { day: '2-digit', month: '2-digit', year: 'numeric' }); };
      var soon = function (t) { return t && (t - Date.now()) < 30 * 86400000; };
      var due = [], it = dd(r.insp), oc = dd(r.oilDate);
      if (soon(it) || (r.inspKm != null && r.inspKm <= 1500)) due.push({ icon: 'mdi:wrench-clock', iconTone: 'warn', label: 'Inspektion', sub: r.inspKm != null ? 'in ' + fmtN(r.inspKm) + ' km' : null, value: it ? fmtD(it) : '—', valueTone: 'warn' });
      if (soon(oc)) due.push({ icon: 'mdi:oil', iconTone: 'warn', label: 'Ölwechsel', value: fmtD(oc), valueTone: 'warn' });
      if (r.oil != null && r.oil < 30) due.push({ icon: 'mdi:oil-level', iconTone: 'warn', label: 'Ölstand', value: fmtN(r.oil) + ' %', valueTone: 'warn' });
      if (r.scr != null && r.scr < 1000) due.push({ icon: 'mdi:water', iconTone: 'warn', label: 'AdBlue-Reichweite', value: fmtN(r.scr) + ' km', valueTone: 'warn' });
      if (r.v12 != null && r.v12 < 12.0) due.push({ icon: 'mdi:car-battery', iconTone: 'warn', label: '12-V-Batterie', value: fmtN(r.v12, 1) + ' V', valueTone: 'warn' });
      if (!due.length) due.push({ icon: 'mdi:check-circle-outline', iconTone: 'good', label: 'Nichts fällig',
        sub: it ? 'Nächste Inspektion ' + fmtD(it) : (r.inspKm != null ? 'Nächste Inspektion in ' + fmtN(r.inspKm) + ' km' : null) });
      return UI.group(due, 'Wartung');
    }
    if (name === 'state') {
      var rows = [
        { icon: r.locked === false ? 'mdi:lock-open-variant' : 'mdi:lock', iconTone: r.locked === false ? 'warn' : 'good', label: 'Verriegelung',
          value: r.locked == null ? '—' : r.locked ? 'Verriegelt' : 'Offen', valueTone: r.locked === false ? 'warn' : null },
        { icon: 'mdi:car-door', iconTone: r.openDoors.length ? 'bad' : 'rgba(255,255,255,0.18)',
          label: 'Türen & Klappen', value: r.openDoors.length ? 'Offen' : 'Zu' },
        { icon: 'mdi:car-door-lock', iconTone: r.openWins.length ? 'bad' : 'rgba(255,255,255,0.18)',
          label: 'Fenster & Schiebedach', value: r.openWins.length ? 'Offen' : 'Zu' },
        { icon: 'mdi:car-brake-parking', iconTone: 'rgba(255,255,255,0.18)', label: 'Feststellbremse', value: r.brake ? 'Angezogen' : 'Gelöst' },
      ];
      if (r.out != null) rows.push({ icon: 'mdi:thermometer', iconTone: 'rgba(255,255,255,0.18)', label: 'Außentemperatur', value: fmtN(r.out, 1) + ' °C' });
      if (r.open.length) rows.unshift({ icon: 'mdi:alert', iconTone: 'bad', label: 'Offen', sub: r.open.join(', '), valueTone: 'bad' });
      return UI.group(rows, 'Zustand');
    }
    if (name === 'service') {
      var d = function (x) { var t = toDate(x); return t ? t.toLocaleDateString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { day: '2-digit', month: '2-digit', year: 'numeric' }) : null; };
      var rows2 = [];
      if (r.km != null) rows2.push({ icon: 'mdi:counter', iconTone: 'rgba(255,255,255,0.18)', label: 'Kilometerstand', value: fmtN(r.km) + ' km' });
      var ins = d(r.insp);
      if (ins || r.inspKm != null) rows2.push({ icon: 'mdi:wrench-clock', iconTone: 'accent', label: 'Inspektion', sub: r.inspKm != null ? 'in ' + fmtN(r.inspKm) + ' km' : null, value: ins || '—' });
      var od = d(r.oilDate);
      if (od) rows2.push({ icon: 'mdi:oil', iconTone: 'accent', label: 'Ölwechsel', value: od });
      if (r.oil != null) rows2.push({ icon: 'mdi:oil-level', iconTone: r.oil < 30 ? 'warn' : 'rgba(255,255,255,0.18)', label: 'Ölstand', value: fmtN(r.oil) + ' %', valueTone: r.oil < 30 ? 'warn' : null });
      if (r.scr != null) rows2.push({ icon: 'mdi:water', iconTone: r.scr < 1000 ? 'warn' : 'rgba(255,255,255,0.18)', label: 'AdBlue-Reichweite', value: fmtN(r.scr) + ' km', valueTone: r.scr < 1000 ? 'warn' : null });
      if (r.v12 != null) rows2.push({ icon: 'mdi:car-battery', iconTone: r.v12 < 12.0 ? 'warn' : 'good', label: '12-V-Batterie', value: fmtN(r.v12, 1) + ' V', valueTone: r.v12 < 12.0 ? 'warn' : null });
      return rows2.length ? UI.group(rows2, 'Wartung') : '';
    }
    if (name === 'trips') {
      var hm = function (m) { return m == null ? null : m >= 60 ? Math.floor(m / 60) + ' Std. ' + Math.round(m % 60) + ' Min.' : Math.round(m) + ' Min.'; };
      var rows3 = [];
      if (r.shortKm != null) rows3.push({ icon: 'mdi:map-marker-path', iconTone: 'accent', label: 'Letzte Fahrt', sub: [hm(r.shortMin), r.shortL != null ? fmtN(r.shortL, 1) + ' l/100 km' : null].filter(Boolean).join(' · '), value: fmtN(r.shortKm) + ' km' });
      if (r.longKm != null) rows3.push({ icon: 'mdi:chart-timeline-variant', iconTone: 'rgba(255,255,255,0.18)', label: 'Langzeit', sub: [r.longL != null ? fmtN(r.longL, 1) + ' l/100 km' : null, r.longV != null ? 'Ø ' + fmtN(r.longV) + ' km/h' : null].filter(Boolean).join(' · '), value: fmtN(r.longKm) + ' km' });
      var out3 = rows3.length ? UI.group(rows3, 'Fahrten') : '';
      var info = [{ icon: 'mdi:cloud-sync-outline', iconTone: 'rgba(255,255,255,0.18)', label: 'Datenstand',
        sub: window._casoraHH && window._casoraHH.on() ? null : 'Vom Hersteller, kommt verzögert', value: r.stamp ? ago(r.stamp) : '—' }];
      if (r.refresh) {
        /* Wie beim Aquarium: Tippen → Bestätigungsknopf fährt herein. Unterzeile zeigt den letzten Abruf (24.09.2026). */
        var hhmm = function (t) { return new Date(t).toLocaleTimeString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { hour: '2-digit', minute: '2-digit' }); };
        var pr = Date.parse((states[r.refresh] || {}).state), rsub = null;
        if (!isNaN(pr) && Date.now() - pr < 30 * 60000) {
          var rs = states[C.id(p, 'reichweite_kombiniert', 'sensor')];
          var got = rs && Date.parse(rs.last_updated) >= pr - 5000;
          /* Kurz halten, die Unterzeile ist einzeilig (24.09.: zu lang). */
          rsub = got ? 'Abgerufen ' + hhmm(pr) + (r.stamp ? ' · Stand ' + hhmm(r.stamp) : '') : 'Angefordert ' + hhmm(pr) + ' …';
        }
        info.push({ icon: 'mdi:refresh', iconTone: 'accent', label: 'Jetzt aktualisieren', sub: rsub,
          svc: { domain: 'button', service: 'press', target: { entity_id: r.refresh } }, confirm: 'Aktualisieren' });
      }
      return out3 + (out3 ? '<div style="height:18px"></div>' : '') + UI.group(info, 'Daten');
    }
    return '';
  };

  C.popup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    /* Altes Präfix oder die Kachel-Entität: deren Gerät ist das Auto (mehrere Autos möglich). */
    var p = variables.car || (entity && entity.entity_id) || null;
    /* Die Kachel findet das Auto über die translation_keys – ohne feste Entität
       ist die Reichweite der Anker (sonst blieb das Popup leer, 30.09.2026). */
    var anchor = (entity && entity.entity_id) || C.id(p, 'reichweite_kombiniert', 'sensor');
    if (!UI || !anchor) return { type: 'vertical-stack', cards: [] };
    entity = { entity_id: anchor };
    var watch = [];
    var M = C.map(p);
    Object.keys(M).forEach(function (k) { var id = M[k]; if (id && states[id] && watch.indexOf(id) < 0) watch.push(id); });
    var sec = function (n) { return '[[[ return window._casoraCar ? window._casoraCar.sec(' + JSON.stringify(n) + ', ' + JSON.stringify(p) + ', states) : ""; ]]]'; };
    /* Weich (Entschlacken 01.10.2026): Kopf mit Reichweite und Tankbalken, links Zustand (nur Abweichungen),
       rechts Wartung (nur Fälliges); alle Zustandszeilen, Wartungswerte, Fahrten und Daten unter „Mehr“. */
    var HH = window._casoraHH;
    if (HH && HH.on() && HH.layout) {
      var fc = { hero: sec('hero'), state_s: sec('state_s'), service_s: sec('service_s'),
        more: HH.moreCard(watch, 'const C = window._casoraCar, H = window._casoraHH;\n'
          + 'return C && H ? H.more("car", ["state", "service", "trips"].map(function (n) { return C.sec(n, ' + JSON.stringify(p) + ', states); })) : "";', entity.entity_id) };
      return HH.layout({ entity: entity.entity_id, watch: watch, fields: fc, left: ['state_s'], right: ['service_s', 'more'] });
    }
    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }', 'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    ].join('\n');
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = sec(k); cs[k] = [{ 'justify-self': 'stretch' }]; });
      return {
        type: 'custom:button-card', entity: entity.entity_id, triggers_update: watch,
        tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle }, extra_styles: window._casoraColGap ? window._casoraColGap(keys) : '',
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
                 { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    return {
      type: 'custom:button-card', entity: entity.entity_id, triggers_update: watch,
      card_mod: { style: wrapperStyle + '\nha-card.disabled { pointer-events: auto !important; }' },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: "hero hero" "left right" !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: 20px !important; } }',
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': '"hero" "left" "right"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: { hero: [{ 'justify-self': 'stretch' }], left: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }], right: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }] },
      },
      custom_fields: (function () { var sp = window._casoraSplit ? window._casoraSplit('car', ['state', 'trips'], ['service'], { leftMovable: ['trips'] }) : { left: ['state', 'trips'], right: ['service'] };
        return { hero: sec('hero'), left: { card: makeCol(sp.left) }, right: { card: makeCol(sp.right) } }; })(),
    };
  };
})();

// ── KI-Kamera-Beschreibung im Kamera-Popup (23.09.2026) ─────────────────────
// Hängt in jedes .cam-detail des Casora-Kamera-Popups (casora_popup_camera,
// unverändert) einen ✦-Knopf in die Knopfreihe und darunter ein Feld mit der
// letzten Beschreibung aus sensor.casora_kamera_ki. Knopf → script.casora_kamera_
// beschreiben. Läuft nur, solange ein Casora-Popup mit Kameras offen ist.
(function () {
  if (window._casoraCamAi) return;
  var A = window._casoraCamAi = {};
  var SENSOR = 'sensor.casora_kamera_ki';
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.';
  };
  var deep = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, sel, out); });
    return out;
  };
  var entryOf = function (hass, id) {
    var s = hass.states[SENSOR], l = (s && s.attributes && s.attributes.kameras) || [];
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].id === id) return l[i];
    return null;
  };
  /* Ohne Bild nichts zu beschreiben: Kamera fehlt, ist aus oder nicht erreichbar – für jede Integration gleich. */
  var noImage = function (hass, id) {
    var st = hass.states[id];
    return !st || ['unavailable', 'unknown', 'off'].indexOf(String(st.state || '').toLowerCase()) >= 0;
  };
  A.local = A.local || {};
  var MAX_AGE = 30 * 60000;   // ältere Beschreibungen ausblenden
  var boxHtml = function (it) {
    if (!it) return '';
    if (it.status !== 'running' && Date.now() - Date.parse(it.at) > MAX_AGE) return '';
    if (it.status === 'noimage') {
      return '<div style="display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:16px;'
        + 'background:var(--casora-glass-pill-fill, rgba(255,255,255,0.10));font-family:var(--primary-font-family, system-ui);text-align:left;">'
        + '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 18px;width:18px;height:18px;">'
        + '<ha-icon icon="mdi:camera-off-outline" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;line-height:0;color:rgba(255,255,255,0.6);"></ha-icon></span>'
        + '<div style="font-size:14px;line-height:1.4;color:rgba(255,255,255,0.92);white-space:normal;">Die Kamera ist aus oder offline und liefert gerade kein Bild.</div></div>';
    }
    var running = it.status === 'running';
    var col = it.alert ? 'var(--casora-popup-ui-warn, #FF9F0A)' : 'rgba(255,255,255,0.92)';
    var text = running ? 'Claude schaut sich das Bild an …' : it.status === 'error' ? (it.error || 'Kein Bild – die Kamera ist aus, schläft oder ist nicht erreichbar.') : it.text;
    return '<div style="display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;'
      + 'background:var(--casora-glass-pill-fill, rgba(255,255,255,0.10));font-family:var(--primary-font-family, system-ui);text-align:left;">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 18px;width:18px;height:18px;margin-top:1px;"><ha-icon icon="mdi:creation" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;align-items:center;justify-content:center;line-height:0;color:var(--casora-color-teal, #00C3D0);"></ha-icon></span>'
      + '<div style="min-width:0;"><div style="font-size:14px;line-height:1.4;color:' + col + ';white-space:normal;">' + esc(text) + '</div>'
      + (running ? '' : '<div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:3px;">KI-Beschreibung · ' + ago(it.at) + '</div>')
      + '</div></div>';
  };
  var sweep = function () {
    var P = window.casoraPopup, el = P && P.element;
    if (!el || !el.isConnected) return;
    var ha = document.querySelector('home-assistant'); var hass = ha && ha.hass; if (!hass) return;
    deep(el.shadowRoot || el, '.cam-detail[data-cam]', []).forEach(function (d) {
      var id = d.getAttribute('data-cam');
      var ctl = d.querySelector('.cam-controls'); if (!ctl) return;
      if (!ctl.querySelector('[data-cam-ai]')) {
        var b = document.createElement('div');
        b.setAttribute('data-cam-ai', id);
        b.setAttribute('data-tip', 'Was ist los?');
        /* 52 px + Beschriftung wie die übrigen Kamera-Knöpfe (01.10.2026). */
        b.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;'
          + 'border-radius:50%;flex:0 0 auto;cursor:pointer;pointer-events:auto;touch-action:manipulation;-webkit-tap-highlight-color:transparent;'
          + 'background:var(--casora-glass-pill-fill, rgba(255,255,255,0.12));';
        b.innerHTML = '<ha-icon icon="mdi:creation" style="--mdc-icon-size:22px;color:var(--casora-color-teal, #00C3D0);pointer-events:none;"></ha-icon>'
          + '<span class="cam-lbl">' + (window.casoraTr ? window.casoraTr('Beschreiben') : 'Beschreiben') + '</span>';
        ctl.appendChild(b);
      }
      var box = d.querySelector('.cam-ai-box');
      if (!box) {
        box = document.createElement('div'); box.className = 'cam-ai-box';
        ctl.parentNode.insertBefore(box, ctl.nextSibling);
      }
      var it = entryOf(hass, id);
      var loc = A.local[id];
      if (loc && (!it || Date.parse(loc.at) > Date.parse(it.at))) it = loc;
      var key = it ? it.status + '|' + it.at + '|' + Math.floor(Date.now() / 60000) : '';
      if (box._k !== key) { box._k = key; var h = (window.casoraTr || function (x) { return x; })(boxHtml(it)); box.innerHTML = h; box.style.display = h ? '' : 'none'; }
    });
  };
  /* Eigenständiger Bereich (z. B. im Drucker-Popup): Überschrift, Knopf, darunter die Beschreibung. */
  A.inline = function (id, title, label) {
    return '<div class="cam-ai-inline" data-cam="' + esc(id) + '" style="font-family:var(--primary-font-family, system-ui);text-align:left;">'
      /* Kopfzeile so hoch wie eine normale Abschnittsüberschrift (Knopf ragt per negativem Margin hinaus), damit beide Spalten oben bündig starten. */
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 4px 8px;height:18px;box-sizing:content-box;overflow:visible;">'
      + '<div style="display:flex;align-items:center;gap:6px;line-height:18px;font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary, #fff));">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 16px;width:16px;height:16px;">'
      + '<ha-icon icon="mdi:creation" style="--mdc-icon-size:16px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:0;color:var(--casora-color-teal, #00C3D0);"></ha-icon></span>'
      + '<span>' + esc(title) + '</span></div>'
      + '<span data-cam-ai="' + esc(id) + '" style="cursor:pointer;font-size:13px;font-weight:600;padding:6px 12px;margin:-6px 0;line-height:16px;border-radius:999px;'
      + 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));">' + esc(label) + '</span></div>'
      + '<div class="cam-ai-box" style="display:none;"></div></div>';
  };
  var sweepInline = function () {
    var P = window.casoraPopup, el = P && P.element;
    if (!el || !el.isConnected) return;
    var ha = document.querySelector('home-assistant'); var hass = ha && ha.hass; if (!hass) return;
    deep(el.shadowRoot || el, '.cam-ai-inline[data-cam]', []).forEach(function (d) {
      var id = d.getAttribute('data-cam'), box = d.querySelector('.cam-ai-box'); if (!box) return;
      var it = entryOf(hass, id), loc = A.local[id];
      if (loc && (!it || Date.parse(loc.at) > Date.parse(it.at))) it = loc;
      var key = it ? it.status + '|' + it.at + '|' + Math.floor(Date.now() / 60000) : '';
      if (box._k !== key) { box._k = key; var h = (window.casoraTr || function (x) { return x; })(boxHtml(it)); box.innerHTML = h; box.style.display = h ? '' : 'none'; }
    });
  };
  setInterval(function () { sweep(); sweepInline(); }, 1000);

  var fire = function (btn) {
    var id = btn.getAttribute('data-cam-ai');
    var ha = document.querySelector('home-assistant');
    if (!id || !ha || !ha.hass) return;
    if (noImage(ha.hass, id)) { A.local[id] = { id: id, status: 'noimage', at: new Date().toISOString() }; setTimeout(sweep, 50); return; }
    delete A.local[id];
    var kc = window.casoraSvc('casora_kamera_beschreiben', { entity_id: id }); ha.hass.callService(kc.domain, kc.service, kc.data);
    setTimeout(function () { sweep(); sweepInline(); }, 300);
  };
  var btnOf = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) if (p[i] && p[i].hasAttribute && p[i].hasAttribute('data-cam-ai')) return p[i];
    return null;
  };
  var s0 = null, tDone = 0;
  window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; s0 = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    var b = btnOf(ev); if (!b || !s0) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientX - s0.x) > 10 || Math.abs(t.clientY - s0.y) > 10)) return;
    tDone = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); fire(b);
  }, { capture: true, passive: false });
  window.addEventListener('click', function (ev) {
    var b = btnOf(ev); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - tDone >= 700) fire(b);
  }, true);
  ['pointerdown', 'pointerup', 'mousedown'].forEach(function (t) {
    window.addEventListener(t, function (ev) { if (btnOf(ev)) ev.stopPropagation(); }, true);
  });
})();

// ── Pflanzen-Doktor im Pflanzen-Popup (23.09.2026) ───────────────────────────
// casora_popup_plant (Casora-Template) bleibt unverändert: Solange ein Popup
// offen ist, sucht dieses Modul jede Sekunde die Messwert-Zeilen
// ([data-hp-metric]), ermittelt über das Gerät die plant.*-Entität und hängt
// unter die Messwerte einen Bereich "Pflanzen-Doktor" (sensor.casora_pflanzen_ki,
// Knopf → script.casora_pflanzen_doktor).
(function () {
  if (window._casoraPlantAi) return;
  var PA = window._casoraPlantAi = {};
  var SENSOR = 'sensor.casora_pflanzen_ki';
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.';
  };
  var deep = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, sel, out); });
    return out;
  };
  var icon = function (name, px, col) {
    return '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 ' + px + 'px;width:' + px + 'px;height:' + px + 'px;">'
      + '<ha-icon icon="' + name + '" style="--mdc-icon-size:' + px + 'px;width:' + px + 'px;height:' + px + 'px;display:flex;align-items:center;justify-content:center;line-height:0;color:' + col + ';"></ha-icon></span>';
  };
  var Z = { gut: ['Alles im grünen Bereich', 'var(--casora-popup-ui-good, #30D158)', 'mdi:check-circle'],
            beobachten: ['Beobachten', 'var(--casora-popup-ui-warn, #FF9F0A)', 'mdi:eye-outline'],
            handeln: ['Handeln', 'var(--casora-popup-ui-bad, #FF453A)', 'mdi:alert'] };
  PA.html = function (pid, hass, inSlot) {
    var T = (window._casoraUI && window._casoraUI.tokens) || { ink: '#fff', ink2: 'rgba(255,255,255,0.7)', ink3: 'rgba(255,255,255,0.45)', font: 'system-ui' };
    var l = (hass.states[SENSOR] && hass.states[SENSOR].attributes.pflanzen) || [];
    var it = l.filter(function (x) { return x && x.id === pid; })[0] || null;
    var running = it && it.status === 'running';
    var z = it && Z[it.zustand];
    var body;
    if (running) body = '<div style="font-size:15px;color:' + T.ink + ';">Claude wertet die letzten 7 Tage aus …</div>';
    else if (it && it.status === 'error') body = '<div style="font-size:15px;color:' + T.ink + ';">' + esc(it.error || 'Auswertung fehlgeschlagen.') + '</div>';
    else if (it && z) {
      body = '<div style="display:flex;align-items:center;justify-content:flex-start;gap:8px;">' + icon(z[2], 20, z[1])
        + '<span style="flex:1 1 auto;text-align:left;font-size:var(--casora-fs16,16px);font-weight:600;color:' + z[1] + ';">' + z[0] + '</span></div>'
        + '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink + ';margin-top:8px;white-space:normal;">' + esc(it.fazit) + '</div>'
        + (it.punkte && it.punkte.length ? '<ul style="margin:10px 0 0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink2 + ';white-space:normal;">' + it.punkte.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '')
        + (it.tipps && it.tipps.length ? '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + T.ink3 + ';margin:12px 0 3px;">Pflegetipps</div>'
          + '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink + ';white-space:normal;">' + it.tipps.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '');
    } else body = '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink2 + ';white-space:normal;">Claude prüft Bodenfeuchte, Licht, Temperatur und Luftfeuchte der letzten 7 Tage passend zur Art und gibt einen Pflegetipp.</div>';
    var svc = ' data-casora-svc="' + esc(JSON.stringify(window.casoraSvc('casora_pflanzen_doktor', { plant: pid }))) + '"';
    var btn = running ? '' : '<span' + svc + ' style="display:inline-flex;cursor:pointer;font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;margin-top:14px;'
      + (it ? 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));' : 'color:#000;background:var(--casora-color-teal, #00C3D0);') + '">'
      + (it ? 'Neu prüfen' : 'Jetzt prüfen') + '</span>';
    /* Weich (01.10.2026): KI-Karte mit Etikett und rundem Knopf aus den Bausteinen. */
    var kc = window._casoraUI && window._casoraUI.kiCard && window._casoraUI.kiCard({
      title: 'Pflanzen-Doktor', body: body, wrapStyle: inSlot ? '' : 'margin-top:18px;',
      foot: it && !running && it.at ? 'KI-Einschätzung · ' + ago(it.at) : '',
      btnSvc: svc, btnText: running ? '' : (it ? 'Neu prüfen' : 'Jetzt prüfen'), primary: !it });
    if (kc) return kc;
    return '<div style="font-family:' + T.font + ';text-align:left;' + (inSlot ? '' : 'margin-top:18px;') + '">'
      + '<div style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);padding:16px 18px;'
      + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);">'
      + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 0 10px;display:flex;align-items:center;justify-content:flex-start;gap:6px;">'
      + icon('mdi:creation', 16, 'var(--casora-color-teal, #00C3D0)') + '<span style="flex:1 1 auto;text-align:left;">Pflanzen-Doktor</span></div>'
      + body + (it && !running && it.at ? '<div style="font-size:12px;color:' + T.ink3 + ';margin-top:10px;">KI-Einschätzung · ' + ago(it.at) + '</div>' : '')
      + btn + '</div></div>';
  };
  var plantOf = function (hass, sensorId) {
    var reg = hass.entities || {}, dev = reg[sensorId] && reg[sensorId].device_id;
    if (!dev) return null;
    var ids = Object.keys(reg).filter(function (e) { return reg[e].device_id === dev && e.indexOf('plant.') === 0; });
    return ids[0] || null;
  };
  var sweep = function () {
    var P = window.casoraPopup, el = P && P.element;
    if (!el || !el.isConnected) return;
    var ha = document.querySelector('home-assistant'); var hass = ha && ha.hass; if (!hass || !hass.states[SENSOR]) return;
    var row = deep(el.shadowRoot || el, '[data-hp-metric]', [])[0]; if (!row) return;
    var pid = plantOf(hass, row.getAttribute('data-hp-metric')); if (!pid) return;
    var root = row.getRootNode();
    /* Eigener Platz im Raster (.plant-ai-slot, rechte Spalte), sonst unter die Messwerte (#all) hängen. */
    var slot = root && root.querySelector && root.querySelector('.plant-ai-slot');
    var box;
    if (slot) { box = slot; box._slot = true; }
    else {
      var host = (root && root.getElementById && root.getElementById('all')) || (row.parentNode && row.parentNode.parentNode) || null; if (!host) return;
      box = host.querySelector('.plant-ai');
      if (!box) { box = document.createElement('div'); box.className = 'plant-ai'; host.appendChild(box); }
    }
    var l = hass.states[SENSOR].attributes.pflanzen || [];
    var it = l.filter(function (x) { return x && x.id === pid; })[0];
    var key = pid + '|' + (it ? it.status + '|' + it.at : '') + '|' + Math.floor(Date.now() / 60000);
    if (box._k !== key) { box._k = key; box.innerHTML = (window.casoraTr || function (x) { return x; })(PA.html(pid, hass, !!box._slot)); }
  };
  setInterval(sweep, 1000);
})();

// ── Energie-Coach im Energie-Popup (23.09.2026) ──────────────────────────────
// Das Energie-Popup (casora_popup_energy) hat einen Platzhalter
// <div class="casora-coach">. Solange ein Popup offen ist, füllt dieses Modul ihn
// jede Sekunde (nur bei Änderung) aus sensor.casora_energie_coach.
(function () {
  if (window._casoraCoach) return;
  var SENSOR = 'sensor.casora_energie_coach';
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.';
  };
  var deep = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, sel, out); });
    return out;
  };
  var icon = function (name, px, col) {
    return '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 ' + px + 'px;width:' + px + 'px;height:' + px + 'px;">'
      + '<ha-icon icon="' + name + '" style="--mdc-icon-size:' + px + 'px;width:' + px + 'px;height:' + px + 'px;display:flex;align-items:center;justify-content:center;line-height:0;color:' + col + ';"></ha-icon></span>';
  };
  window._casoraCoach = function (s) {
    var T = (window._casoraUI && window._casoraUI.tokens) || { ink: '#fff', ink2: 'rgba(255,255,255,0.7)', ink3: 'rgba(255,255,255,0.45)', font: 'system-ui' };
    var a = (s && s.attributes) || {};
    var running = a.status === 'running';
    var has = !!a.fazit;
    var body;
    if (running) body = '<div style="font-size:15px;color:' + T.ink + ';">Claude wertet die letzte Woche aus …</div>';
    else if (!has) body = '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink2 + ';white-space:normal;">Claude wertet einmal pro Woche (sonntags 18 Uhr) Netzbezug, Solar und die großen Geräte aus und sagt, wo sich Strom sparen lässt.</div>';
    else {
      var eur = Number(a.ersparnis_eur);
      body = (eur > 0 ? '<div style="display:inline-flex;align-items:baseline;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(48,209,88,0.16);margin-bottom:10px;">'
          + '<span style="font-size:17px;font-weight:700;color:var(--casora-popup-ui-good, #30D158);">≈ ' + eur.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €</span>'
          + '<span style="font-size:13px;color:' + T.ink2 + ';">pro Woche sparbar</span></div>' : '')
        + '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink + ';white-space:normal;">' + esc(a.fazit) + '</div>'
        + ((a.erkenntnisse || []).length ? '<ul style="margin:10px 0 0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink2 + ';white-space:normal;">' + a.erkenntnisse.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '')
        + ((a.tipps || []).length ? '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + T.ink3 + ';margin:12px 0 3px;">Tipps</div>'
          + '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink + ';white-space:normal;">' + a.tipps.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '');
    }
    var svc = ' data-casora-svc="' + esc(JSON.stringify(window.casoraSvc('casora_energie_coach'))) + '"';
    var btn = running ? '' : '<span' + svc + ' style="display:inline-flex;cursor:pointer;font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;margin-top:14px;'
      + (has ? 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));' : 'color:#000;background:var(--casora-color-teal, #00C3D0);') + '">'
      + (has ? 'Neu auswerten' : 'Jetzt auswerten') + '</span>';
    return '<div style="font-family:' + T.font + ';text-align:left;">'
      + '<div style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);padding:16px 18px;'
      + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);">'
      + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 0 10px;display:flex;align-items:center;justify-content:flex-start;gap:6px;">'
      + icon('mdi:creation', 16, 'var(--casora-color-teal, #00C3D0)') + '<span style="flex:1 1 auto;text-align:left;">Energie-Coach</span></div>'
      + body + (has && !running && a.erstellt ? '<div style="font-size:12px;color:' + T.ink3 + ';margin-top:10px;">Auswertung der letzten 7 Tage · ' + ago(a.erstellt) + '</div>' : '')
      + btn + '</div></div>';
  };
  var sweep = function () {
    var P = window.casoraPopup, el = P && P.element;
    if (!el || !el.isConnected) return;
    var ha = document.querySelector('home-assistant'); var hass = ha && ha.hass; if (!hass) return;
    var s = hass.states[SENSOR]; if (!s) return;
    var key = s.attributes.status + '|' + s.attributes.erstellt + '|' + s.last_updated + '|' + Math.floor(Date.now() / 60000);
    deep(el.shadowRoot || el, '.casora-coach', []).forEach(function (box) {
      if (box._k !== key) { box._k = key; box.innerHTML = (window.casoraTr || function (x) { return x; })(window._casoraCoach(s)); }
    });
  };
  setInterval(sweep, 1000);
})();

// ── eBike-Kachel + Popup (Bosch Smart System / ha_bosch_ebike, 23.09.2026) ──
// Template casora_ebike (['casora_entity','casora_popup_ebike']) ruft nur
// window._casoraBike.tile()/level()/popup() auf. Daten nur aus der Integration
// Bosch eBike (HACS: Xunil99/ha-bosch-ebike) für Räder mit Bosch Smart System:
// Fahrten, Reichweite je Modus, Akku-Werte, Service. Eigene Bridge-Felder (Ladegerät,
// Akku live/zuletzt) gibt es seit 1.0.3 nicht mehr.
(function () {
  if (window._casoraBike) return;
  var B = window._casoraBike = {};
  // Präfixe der Bosch-eBike-Entitäten (Drive Unit / Garage), aus den Kennungen der
  // Integration abgeleitet (translation_key, damit es in jeder HA-Sprache passt);
  // ebike: {prefix, prefix_garage, capacity} in den Einstellungen überschreibt das.
  var P = '', G = '', X = {};
  var bikeIds = function (states) {
    var cfg = (window.CASORA_SETTINGS || {}).ebike || {};
    var ha = document.querySelector('home-assistant'), h = ha && ha.hass;
    var key = function (k, d) { return h && window.casoraDevice ? window.casoraDevice.keyAny(h, k, d) : null; };
    var bare = function (id, suffix) { return id ? id.replace(/^[a-z_]+\./, '').replace(new RegExp('_' + suffix + '$'), '') : ''; };
    var ends = function (dom, suffix) { return Object.keys(states).filter(function (k) { return k.indexOf(dom + '.') === 0 && k.slice(-suffix.length - 1) === '_' + suffix; }).sort()[0] || null; };
    P = cfg.prefix || bare(key('days_since_last_ride', 'sensor'), 'days_since_last_ride');
    G = cfg.prefix_garage || bare(ends('binary_sensor', 'theft_reported'), 'theft_reported');
    /* Garage-Werte mit übersetzter Kennung (z. B. „geschatzte_reichweite_aktuell“ in deutschem HA):
       über den translation_key der Integration, sonst die englische Endung. */
    var gk = function (k, suffix) { var hit = key(k, 'sensor'); return hit && (!G || hit.indexOf('sensor.' + G + '_') === 0) ? hit : 'sensor.' + G + '_' + suffix; };
    /* Akku-Werte heißen nach dem Akkumodell (powertube_750_…, powertube_625_…). */
    var pt = function (pre, suffix) { return Object.keys(states).filter(function (k) { return pre && k.indexOf('sensor.' + pre + '_powertube_') === 0 && k.slice(-suffix.length - 1) === '_' + suffix; }).sort()[0] || null; };
    X = {
      capacity: cfg.capacity || key('battery_capacity', 'number'),
      anchor: key('days_since_last_ride', 'sensor'),
      rangeNow: gk('estimated_range_current', 'estimated_range_current'),
      rangeFull: gk('estimated_range_full', 'estimated_range_full'),
      charged365: gk('energy_charged_365d', 'energy_charged_365d'),
      cycles: pt(P, 'charge_cycles'), lifetime: pt(P, 'wh_lifetime'), soh: pt(G, 'state_of_health'),
    };
  };
  var num = function (v) { var n = parseFloat(v); return isNaN(n) ? null : n; };
  var ok = function (s) { return s && s.state !== 'unknown' && s.state !== 'unavailable' && s.state !== 'Unknown'; };
  var fmtN = function (n, d) { return n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var v = function (states, id) { var s = states[id]; return ok(s) ? num(s.state) : null; };
  var t = function (states, id) { var s = states[id]; return ok(s) ? String(s.state) : null; };
  var MODES = [['a100m00040', 'Eco'], ['a100maaaa0', 'Tour+'], ['a100m0auto', 'Auto'], ['a100mspic7', 'Turbo']];

  B.read = function (states) {
    bikeIds(states);
    var theft = states['binary_sensor.' + G + '_theft_reported'];
    var dueDays = v(states, 'sensor.' + P + '_service_due_in_days');
    var dueKm = v(states, 'sensor.' + P + '_service_due_in_kilometres');
    return {
      theft: theft && theft.state === 'on',
      km: v(states, 'sensor.' + P + '_odometer'),
      serviceDue: (dueDays != null && dueDays <= 0) || (dueKm != null && dueKm <= 0),
      dueDays: dueDays, dueKm: dueKm, dueDate: t(states, 'date.' + P + '_service_due_date'),
      daysSince: v(states, 'sensor.' + P + '_days_since_last_ride'),
      rangeFull: v(states, X.rangeFull),
    };
  };
  /* Entitäten des Rads (Drive Unit und Garage der Bosch-Integration) – für das Popup und den Rad-Check. */
  B.ids = function (states) {
    bikeIds(states);
    return Object.keys(states).filter(function (k) { return (P && k.indexOf(P) > -1) || (G && k.indexOf(G) > -1) || k === X.capacity; });
  };
  /* Rad-Check (Casora-KI, ki.py): Ergebnis in sensor.casora_ebike_ki; ältere eigene Pakete schrieben
     nach sensor.hemma_ebike_ki – das gilt als Rückfall, solange Casora noch nichts hat. */
  var EB_KI = ['sensor.casora_ebike_ki', 'sensor.hemma_ebike_ki'];
  B.kiSensors = function (states) { return EB_KI.filter(function (k) { return !!states[k]; }); };
  B.ki = function (states) {
    for (var i = 0; i < EB_KI.length; i++) {
      var s = states[EB_KI[i]], a = s && s.attributes;
      if (a && (a.fazit || a.status)) return a;
    }
    return null;
  };
  var aiReady = function (states) {
    return window._casoraAiReady ? window._casoraAiReady(states) : Object.keys(states).some(function (k) { return k.indexOf('ai_task.') === 0; });
  };
  B.hasAi = function (states) { return aiReady(states) || !!(B.ki(states) || {}).fazit; };
  B.level = function (states) {
    var r = B.read(states);
    return r.theft ? 2 : r.serviceDue ? 1 : 0;
  };
  B.tile = function (states) {
    var r = B.read(states);
    if (r.theft) return 'Diebstahl gemeldet';
    if (r.serviceDue) return 'Service fällig';
    if (r.daysSince != null) return r.daysSince < 1 ? 'Heute gefahren' : r.daysSince < 2 ? 'Gestern gefahren' : 'Letzte Fahrt vor ' + fmtN(Math.round(r.daysSince)) + ' T.';
    return r.km != null ? fmtN(r.km) + ' km' : 'Keine Daten';
  };

  B.sec = function (name, states) {
    var UI = window._casoraUI; if (!UI) return '';
    var r = B.read(states);
    var DIM = 'rgba(255,255,255,0.18)';
    var SF = !!(window._casoraHH && window._casoraHH.on());
    /* Noch gar keine Werte: unter dem Kopf sagen, woher sie kommen (Einstellungen → Haus & Geräte). */
    var noData = r.km == null && r.daysSince == null && !r.theft;
    var where = noData && UI.note ? '<div style="height:6px"></div>' + UI.note('Für Räder mit Bosch Smart System: Die Werte kommen aus der Integration Bosch eBike (HACS: Xunil99/ha-bosch-ebike).') : '';
    /* Weich (Entschlacken): Kilometerstand als Hauptwert, Unterzeile „Service fällig“ bzw. letzte Fahrt. */
    if (name === 'hero' && SF) {
      var subS = r.theft ? 'Diebstahl gemeldet' : r.serviceDue ? 'Service fällig' : (r.daysSince != null ? 'Letzte Fahrt vor ' + fmtN(Math.round(r.daysSince)) + ' Tagen' : null);
      return UI.hero({ value: r.km != null ? fmtN(Math.round(r.km)) + ' km' : '—',
        sub: subS, subTone: r.theft ? 'bad' : r.serviceDue ? 'warn' : null, center: true }) + where;
    }
    if (name === 'hero') {
      var sub = r.theft ? 'Diebstahl gemeldet' : r.serviceDue ? 'Service fällig' : (r.daysSince != null ? 'Letzte Fahrt vor ' + fmtN(Math.round(r.daysSince)) + ' Tagen' : null);
      return UI.hero({ label: 'Kilometerstand', value: r.km != null ? fmtN(Math.round(r.km)) : '—', unit: r.km != null ? 'km' : null,
        sub: sub, subTone: r.theft ? 'bad' : r.serviceDue ? 'warn' : null, center: true }) + where;
    }
    if (name === 'range') {
      var rows = MODES.map(function (m) {
        var x = v(states, 'sensor.' + G + '_reachable_range_' + m[0]);
        return x == null ? null : { icon: 'mdi:map-marker-distance', iconTone: 'accent', label: m[1], value: fmtN(x) + ' km' };
      }).filter(Boolean);
      return rows.length ? UI.group(rows, 'Reichweite je Modus') : '';
    }
    if (name === 'last') {
      var d = t(states, 'sensor.' + P + '_last_ride_date'); if (!d) return '';
      var rows2 = [
        { icon: 'mdi:bike', iconTone: 'accent', label: t(states, 'sensor.' + P + '_last_ride_title') || 'Fahrt', sub: d, value: fmtN(v(states, 'sensor.' + P + '_last_ride_distance') || 0, 1) + ' km' },
      ];
      var dur = v(states, 'sensor.' + P + '_last_ride_duration'), avg = v(states, 'sensor.' + P + '_last_ride_avg_speed'), up = v(states, 'sensor.' + P + '_last_ride_elevation_gain');
      if (dur != null) rows2.push({ icon: 'mdi:timer-outline', iconTone: DIM, label: 'Fahrzeit', value: fmtN(Math.round(dur)) + ' Min.' });
      if (avg != null) rows2.push({ icon: 'mdi:speedometer', iconTone: DIM, label: 'Ø Tempo', sub: 'max. ' + fmtN(v(states, 'sensor.' + P + '_last_ride_max_speed') || 0, 1) + ' km/h', value: fmtN(avg, 1) + ' km/h' });
      if (up != null) rows2.push({ icon: 'mdi:elevation-rise', iconTone: DIM, label: 'Höhenmeter', value: fmtN(up) + ' m' });
      var pw = v(states, 'sensor.' + P + '_last_ride_avg_rider_power');
      if (pw != null) rows2.push({ icon: 'mdi:arm-flex-outline', iconTone: DIM, label: 'Eigene Leistung', sub: 'Trittfrequenz ' + fmtN(v(states, 'sensor.' + P + '_last_ride_avg_cadence') || 0) + ' U/min', value: fmtN(pw) + ' W' });
      var wh = v(states, 'sensor.' + P + '_last_ride_battery_consumption');
      if (wh != null) rows2.push({ icon: 'mdi:battery-arrow-down-outline', iconTone: DIM, label: 'Akku verbraucht', value: fmtN(wh, 1) + ' Wh' });
      return UI.group(rows2, 'Letzte Fahrt');
    }
    if (name === 'total') {
      var rows3 = [];
      var n = v(states, 'sensor.' + P + '_total_rides'), dist = v(states, 'sensor.' + P + '_total_distance_activities'), h = v(states, 'sensor.' + P + '_total_ride_duration');
      if (n != null) rows3.push({ icon: 'mdi:counter', iconTone: 'accent', label: 'Fahrten', sub: dist != null ? fmtN(Math.round(dist)) + ' km aufgezeichnet' : null, value: fmtN(n) });
      if (h != null) rows3.push({ icon: 'mdi:clock-outline', iconTone: DIM, label: 'Fahrzeit gesamt', value: fmtN(Math.round(h)) + ' Std.' });
      var el = v(states, 'sensor.' + P + '_total_elevation_gain'); if (el != null) rows3.push({ icon: 'mdi:elevation-rise', iconTone: DIM, label: 'Höhenmeter gesamt', value: fmtN(el) + ' m' });
      var sp = v(states, 'sensor.' + P + '_avg_speed_all_rides'); if (sp != null) rows3.push({ icon: 'mdi:speedometer', iconTone: DIM, label: 'Ø Tempo', value: fmtN(sp, 1) + ' km/h' });
      var kc = v(states, 'sensor.' + P + '_total_calories'); if (kc != null) rows3.push({ icon: 'mdi:fire', iconTone: DIM, label: 'Kalorien', value: fmtN(kc) + ' kcal' });
      return rows3.length ? UI.group(rows3, 'Gesamt') : '';
    }
    if (name === 'battery') {
      var rows4 = [];
      /* Akku-Werte der Bosch-Integration: Reichweite, Ladezyklen, Gesundheit, Energie.
         Weich: Reichweiten stehen unter „Reichweite je Modus“. */
      var rNow = SF ? null : v(states, X.rangeNow);
      if (rNow != null) rows4.push({ icon: 'mdi:map-marker-distance', iconTone: 'accent', label: 'Reichweite jetzt', value: '≈ ' + fmtN(rNow) + ' km' });
      var cap = X.capacity ? v(states, X.capacity) : null;
      var cyc = v(states, X.cycles); if (cyc != null) rows4.push({ icon: 'mdi:battery-sync-outline', iconTone: 'accent', label: 'Ladezyklen', sub: cap ? 'PowerTube ' + fmtN(cap) + ' Wh' : null, value: fmtN(cyc, 1) });
      var soh = v(states, X.soh); if (soh != null) rows4.push({ icon: 'mdi:battery-heart-variant', iconTone: soh < 80 ? 'warn' : 'good', label: 'Akku-Gesundheit', value: fmtN(soh) + ' %' });
      var life = v(states, X.lifetime); if (life != null) rows4.push({ icon: 'mdi:lightning-bolt', iconTone: DIM, label: 'Energie gesamt', value: fmtN(life / 1000, 1) + ' kWh' });
      var y = v(states, X.charged365); if (y != null) rows4.push({ icon: 'mdi:ev-station', iconTone: DIM, label: 'Geladen (12 Monate)', value: fmtN(y / 1000, 2) + ' kWh' });
      if (SF) return rows4.length ? UI.group(rows4, 'Akku') : '';
      if (r.rangeFull != null) rows4.push({ icon: 'mdi:map-marker-distance', iconTone: DIM, label: 'Reichweite voller Akku', value: '≈ ' + fmtN(r.rangeFull) + ' km' });
      return rows4.length ? UI.group(rows4, 'Akku') : '';
    }
    if (name === 'ai' || name === 'ai_tips') {
      if (name === 'ai_tips' && !SF) return '';
      /* Rad-Check (KI, nur per Knopf, Dienst casora.ebike_check) */
      var ready = aiReady(states);
      var a = B.ki(states) || {}, T = UI.tokens;
      if (!ready && !a.fazit) return '';
      var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
      var ic = function (nm, px, col) { return '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 ' + px + 'px;width:' + px + 'px;height:' + px + 'px;"><ha-icon icon="' + nm + '" style="--mdc-icon-size:' + px + 'px;width:' + px + 'px;height:' + px + 'px;display:flex;align-items:center;justify-content:center;line-height:0;color:' + col + ';"></ha-icon></span>'; };
      var Z = { gut: ['Alles im grünen Bereich', 'var(--casora-popup-ui-good, #30D158)', 'mdi:check-circle'], beobachten: ['Beobachten', 'var(--casora-popup-ui-warn, #FF9F0A)', 'mdi:eye-outline'], handeln: ['Handeln', 'var(--casora-popup-ui-bad, #FF453A)', 'mdi:alert'] };
      var li = function (arr, col) { return '<ul style="margin:10px 0 0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + col + ';white-space:normal;">' + arr.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; };
      var running = a.status === 'running', has = !!a.fazit, z = Z[a.zustand], body;
      /* Weich (Entschlacken): sichtbar nur das Fazit, Punkte und Tipps unter „Mehr“ (ai_tips). */
      if (SF && name === 'ai_tips') {
        if (running || !has || !((a.punkte || []).length || (a.tipps || []).length)) return '';
        return '<div style="font-family:' + T.font + ';text-align:left;">' + window._casoraHH.label('Rad-Check im Detail')
          + '<div style="background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));border-radius:var(--casora-popup-row-radius, 24px);padding:6px 18px 16px;">'
          + ((a.punkte || []).length ? li(a.punkte, T.ink2) : '')
          + ((a.tipps || []).length ? '<div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--casora-soft-label, ' + T.ink3 + ');margin:14px 0 0;">Tipps</div>' + li(a.tipps, T.ink) : '')
          + '</div></div>';
      }
      if (SF) a = Object.assign({}, a, { punkte: [], tipps: [] });
      if (running) body = '<div style="font-size:15px;color:' + T.ink + ';">Claude prüft das Rad …</div>';
      else if (has) body = (z ? '<div style="display:flex;align-items:center;gap:8px;">' + ic(z[2], 20, z[1]) + '<span style="font-size:var(--casora-fs16,16px);font-weight:600;color:' + z[1] + ';">' + z[0] + '</span></div>' : '')
        + '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink + ';margin-top:8px;white-space:normal;">' + esc(a.fazit) + '</div>'
        + ((a.punkte || []).length ? li(a.punkte, T.ink2) : '')
        + ((a.tipps || []).length ? '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + T.ink3 + ';margin:12px 0 0;">Tipps</div>' + li(a.tipps, T.ink) : '');
      else body = '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink2 + ';white-space:normal;">Claude prüft Service, Verschleißteile nach Kilometern und die Akku-Pflege passend zur Jahreszeit.</div>';
      var ago = function (ts) { var q = Date.parse(ts); if (isNaN(q)) return ''; var m = Math.max(0, Math.round((Date.now() - q) / 60000)); return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.'; };
      var svc = ' data-casora-svc="' + esc(JSON.stringify(window.casoraSvc('casora_ebike_check', { entities: B.ids(states) }))) + '"';
      var btn = running || !ready ? '' : '<span' + svc + ' style="display:inline-flex;cursor:pointer;font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;margin-top:14px;'
        + (has ? 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));' : 'color:#000;background:var(--casora-color-teal, #00C3D0);') + '">' + (has ? 'Neu prüfen' : 'Jetzt prüfen') + '</span>';
      return '<div style="font-family:' + T.font + ';text-align:left;">'
        + '<div style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);padding:16px 18px;'
        + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);">'
        + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 0 10px;display:flex;align-items:center;gap:6px;">'
        + ic('mdi:creation', 16, 'var(--casora-color-teal, #00C3D0)') + '<span style="flex:1 1 auto;text-align:left;">Rad-Check</span></div>'
        + body + (has && !running && a.erstellt ? '<div style="font-size:12px;color:' + T.ink3 + ';margin-top:10px;">KI-Einschätzung · ' + ago(a.erstellt) + '</div>' : '')
        + btn + '</div></div>';
    }
    if (name === 'service') {
      var rows5 = [];
      var dd = r.dueDate ? new Date(r.dueDate) : null;
      rows5.push({ icon: 'mdi:wrench-clock', iconTone: r.serviceDue ? 'warn' : 'accent', label: 'Nächster Service',
        sub: r.dueDays != null ? (r.dueDays <= 0 ? 'seit ' + fmtN(Math.round(-r.dueDays)) + ' Tagen fällig' : 'in ' + fmtN(Math.round(r.dueDays)) + ' Tagen') : null,
        value: dd && !isNaN(dd) ? dd.toLocaleDateString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—', valueTone: r.serviceDue ? 'warn' : null });
      if (r.dueKm != null) rows5.push({ icon: 'mdi:road-variant', iconTone: DIM, label: 'Service nach Strecke', value: 'in ' + fmtN(Math.round(r.dueKm)) + ' km' });
      var mh = SF ? null : v(states, 'sensor.' + P + '_motor_total_hours'); if (mh != null) rows5.push({ icon: 'mdi:engine-outline', iconTone: DIM, label: 'Motorstunden', sub: 'davon ' + fmtN(v(states, 'sensor.' + P + '_motor_assist_hours') || 0) + ' Std. mit Unterstützung', value: fmtN(mh) + ' Std.' });
      var th = states['binary_sensor.' + G + '_theft_reported'];
      if (th) rows5.push({ icon: th.state === 'on' ? 'mdi:shield-alert' : 'mdi:shield-check', iconTone: th.state === 'on' ? 'bad' : 'good', label: 'Diebstahl', value: th.state === 'on' ? 'Gemeldet' : 'Nicht gemeldet', valueTone: th.state === 'on' ? 'bad' : null });
      return UI.group(rows5, 'Service & Sicherheit');
    }
    if (name === 'motor') {
      var mh2 = v(states, 'sensor.' + P + '_motor_total_hours'); if (mh2 == null) return '';
      return UI.group([{ icon: 'mdi:engine-outline', iconTone: DIM, label: 'Motorstunden', sub: 'davon ' + fmtN(v(states, 'sensor.' + P + '_motor_assist_hours') || 0) + ' Std. mit Unterstützung', value: fmtN(mh2) + ' Std.' }], 'Motor');
    }
    return '';
  };

  B.popup = function (entity, variables, states) {
    var UI = window._casoraUI;
    bikeIds(states);
    /* Ohne feste Entität: Anker aus der erkannten Drive Unit (sonst leeres Popup). */
    var anchor = (entity && entity.entity_id) || (X.anchor && states[X.anchor] ? X.anchor : null)
      || (P && states['sensor.' + P + '_days_since_last_ride'] ? 'sensor.' + P + '_days_since_last_ride' : null)
      || (G && states['binary_sensor.' + G + '_theft_reported'] ? 'binary_sensor.' + G + '_theft_reported' : null);
    if (!UI || !anchor) return { type: 'vertical-stack', cards: [] };
    entity = { entity_id: anchor };
    var watch = B.ids(states).concat(B.kiSensors(states));
    var sec = function (n) { return '[[[ return window._casoraBike ? window._casoraBike.sec(' + JSON.stringify(n) + ', states) : ""; ]]]'; };
    /* Weich (Entschlacken 01.10.2026): Kopf mit Akkustand, links Reichweite je Modus, rechts Service
       und Fazit des Rad-Checks; Letzte Fahrt, Gesamt, Akku-Details, Rad-Check-Tipps und Motorstunden unter „Mehr“. */
    var HH = window._casoraHH;
    if (HH && HH.on() && HH.layout) {
      var fb = { hero: sec('hero'), range: sec('range'), service: sec('service') };
      if (B.hasAi(states)) fb.ai = sec('ai');
      fb.more = HH.moreCard(watch, 'const B = window._casoraBike, H = window._casoraHH;\n'
        + 'return B && H ? H.more("ebike", ["last", "total", "battery", "ai_tips", "motor"].map(function (n) { return B.sec(n, states); })) : "";', entity.entity_id);
      return HH.layout({ entity: entity.entity_id, watch: watch, fields: fb, left: ['range'], right: ['service', 'ai', 'more'] });
    }
    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }', 'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    ].join('\n');
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = sec(k); cs[k] = [{ 'justify-self': 'stretch' }]; });
      return {
        type: 'custom:button-card', entity: entity.entity_id, triggers_update: watch,
        tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle }, extra_styles: window._casoraColGap ? window._casoraColGap(keys) : '',
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
                 { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    return {
      type: 'custom:button-card', entity: entity.entity_id, triggers_update: watch,
      card_mod: { style: wrapperStyle + '\nha-card.disabled { pointer-events: auto !important; }' },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: "hero hero" "left right" !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: 20px !important; } }',
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': '"hero" "left" "right"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: { hero: [{ 'justify-self': 'stretch' }], left: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }], right: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }] },
      },
      custom_fields: (function () { var r0 = (B.hasAi(states) ? ['ai'] : []).concat(['service', 'battery']);
        var sp = window._casoraSplit ? window._casoraSplit('ebike', ['range', 'last', 'total'], r0, { leftMovable: ['total'] }) : { left: ['range', 'last', 'total'], right: r0 };
        return { hero: sec('hero'), left: { card: makeCol(sp.left) }, right: { card: makeCol(sp.right) } }; })(),
    };
  };
})();


// ── Update-Popup: System, Verlauf, Übersprungen, KI-Zusammenfassung (25.09.2026) ──
// Template casora_popup_updates ruft nur window._casoraUpdX.ov/sys/hist/skip auf.
// ov: Zusatz für die Unterzeile der Statuskarte (KI-Fazit bzw. letztes Update).
// sys: Versionen Core/OS/Supervisor/HACS/Casora + Backup-Zeile.
// hist: letzte 5 Updates aus dem Recorder (30 Tage), Ergebnis 10 Min. gemerkt.
// skip: übersprungene Versionen, auf-/zuklappbar (Klappen über den KI-Check-Listener, .hua + data-id).
(function () {
  if (window._casoraUpdX) return;
  var X = window._casoraUpdX = {};
  var H = window._casoraUpdHist5 = window._casoraUpdHist5 || {};
  var OPEN = window._casoraUpdAiOpen = window._casoraUpdAiOpen || {};
  var AI = 'sensor.casora_update_ki_analyse';
  var INK = 'var(--casora-popup-tiles-text-primary, #fff)';
  var INK3 = 'var(--casora-popup-ui-tertiary, rgba(255,255,255,0.42))';
  var RED = 'var(--casora-popup-ui-bad, #FF453A)', ORG = 'var(--casora-popup-ui-warn, #FF9F0A)';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var agoMs = function (t) {
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.'
      : Math.round(m / 1440) === 1 ? 'gestern' : 'vor ' + Math.round(m / 1440) + ' Tagen';
  };
  var nameOf = function (states, id) {
    var e = states[id]; if (!e) return id.replace(/^update\./, '');
    return String(e.attributes.title || e.attributes.friendly_name || id).replace(/\s+(Update|Firmware|Software-Aktualisierung)$/i, '').trim() || id;
  };
  var deep = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, sel, out); });
    return out;
  };
  var paint = function (sel, fn) {
    var ha = document.querySelector('home-assistant');
    deep(ha && ha.shadowRoot, sel).forEach(function (n) { n.innerHTML = (window.casoraTr || function (x) { return x; })(fn()); });
  };

  // ── Verlauf laden (gemeinsam für hist und ov) ──
  var load = function (states, hass) {
    if ((H.ts && Date.now() - H.ts < 600000) || H.busy || !hass || !hass.callWS) return;
    var ids = Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0; });
    H.busy = true;
    hass.callWS({
      type: 'history/history_during_period',
      start_time: new Date(Date.now() - 30 * 86400000).toISOString(),
      entity_ids: ids, include_start_time_state: true,
      significant_changes_only: false, minimal_response: false, no_attributes: false,
    }).then(function (res) {
      var list = [];
      Object.keys(res || {}).forEach(function (id) {
        // Nur echte Versionswechsel; Geräte, die zwischen Version und leer pendeln, zählen je Version einmal.
        var prev = null, seen = {};
        (res[id] || []).forEach(function (r) {
          if (r.s === 'unavailable' || r.s === 'unknown') return;
          var v = r.a && r.a.installed_version != null ? String(r.a.installed_version).trim() : '';
          if (!v || v === 'unknown' || v === 'None' || /^-/.test(v) || /^0*1?$/.test(v) && Number(v) <= 0) return;
          if (prev != null && v !== prev && !seen[v]) list.push({ id: id, from: prev, to: v, t: (r.lu || r.lc || 0) * 1000 });
          seen[v] = true; prev = v;
        });
      });
      list.sort(function (a, b) { return b.t - a.t; });
      H.list = list; H.err = false;
    }).catch(function () { H.err = true; }).then(function () {
      H.busy = false; H.ts = Date.now();
      var st = (document.querySelector('home-assistant') || {}).hass;
      st = st ? st.states : states;
      paint('.hu-hist5', function () { return histRows(st, H._h); });
      paint('.hu-ovlast', function () { return lastLine(st); });
      if (window._casoraBrandSweep) [100, 800].forEach(function (t) { setTimeout(window._casoraBrandSweep, t); });
    });
  };

  // ── KI-Fazit bzw. letztes Update für die Statuskarte ──
  var lastLine = function (states) {
    var u = H.list && H.list[0];
    return u ? 'Zuletzt ' + esc(nameOf(states, u.id)) + ' ' + agoMs(u.t) : '';
  };
  X.ov = function (states, hass, pend) {
    pend = pend || Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0 && states[id].state === 'on'; });
    if (!pend.length || (window._casoraUpdAiOff && window._casoraUpdAiOff(states))) {
      load(states, hass);
      return '<span class="hu-ovlast">' + lastLine(states) + '</span>';
    }
    var list = (states[AI] && states[AI].attributes && states[AI].attributes.analysen) || [];
    var c = { breaking: 0, action: 0, info: 0, running: 0, open: 0 };
    pend.forEach(function (id) {
      var e = states[id], it = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === id && String(list[i].to) === String(e.attributes.latest_version)) { it = list[i]; break; }
      }
      if (!it || it.status === 'error') c.open++;
      else if (it.status === 'running') c.running++;
      else if (it.level === 'breaking' && !it.ack) c.breaking++;
      else if (it.level === 'action' && !it.ack) c.action++;
      else c.info++;
    });
    var n = pend.length;
    if (c.breaking) return '<span style="color:' + RED + ';">KI: ' + (c.breaking === 1 ? '1 Breaking Change' : c.breaking + ' Breaking Changes') + ' · erst lesen</span>';
    if (c.action) return '<span style="color:' + ORG + ';">KI: ' + (c.action === 1 ? '1 Update braucht' : c.action + ' Updates brauchen') + ' Aufmerksamkeit</span>';
    if (c.running) return 'KI prüft noch …';
    if (c.open) return c.info ? 'KI: ' + c.info + ' von ' + n + ' geprüft' : 'KI-Check steht noch aus';
    return 'KI: ' + (n === 1 ? 'unkritisch' : 'alle unkritisch') + ' · Installieren empfohlen';
  };

  // ── System ──
  var SYS_EXTRA = [['update.hacs_update', 'HACS'], ['update.casora_update', 'Casora']];
  var fmtNext = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return null;
    var d = new Date(t), now = new Date();
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var dd = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - day) / 86400000);
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return (dd === 0 ? 'heute' : dd === 1 ? 'morgen' : d.toLocaleDateString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { weekday: 'short', day: '2-digit', month: '2-digit' })) + ' ' + hm;
  };
  // 26.09.2026: Verlauf so lang wie System (gleich hohe Spalten).
  var sysRowsN = function (states, C) {
    C = C || {};
    var ok = function (id) { var s = states[id]; return s && s.state && s.state !== 'unknown' && s.state !== 'unavailable'; };
    return (C.system || []).concat(SYS_EXTRA).filter(function (sy) { return states[sy[0]]; }).length
      + (ok(C.backupLast) || ok(C.backupNext) ? 1 : 0);
  };
  X.sys = function (states, h) {
    var UI = h.UI, C = h.C || {}, rows = [];
    (C.system || []).concat(SYS_EXTRA).forEach(function (sy) {
      var e = states[sy[0]]; if (!e) return;
      var a = e.attributes, pending = e.state === 'on';
      rows.push({ entity: sy[0], iconTone: 'rgba(0,0,0,0)', image: h.logoOf ? h.logoOf(sy[0]) : null, label: sy[1],
        value: a.installed_version || '—',
        sub: pending ? 'Update auf ' + a.latest_version : (a.auto_update ? 'Aktuell · automatisch' : 'Aktuell'),
        valueTone: pending ? 'warn' : null });
    });
    // Backup: letzter Erfolg, nächster Termin, Warnung bei Fehlschlag oder > 26 Std.
    var ok = function (id) { var s = states[id]; return s && s.state && s.state !== 'unknown' && s.state !== 'unavailable' ? s.state : null; };
    var last = ok(C.backupLast), tried = ok(window.casoraDevice && window.casoraDevice.keyAny(h, 'last_attempted_automatic_backup', 'sensor')), next = ok(C.backupNext);
    var bs = ok(C.backupState);
    if (last || next) {
      var tl = Date.parse(last), tt = Date.parse(tried);
      var failed = !isNaN(tt) && (isNaN(tl) || tt - tl > 120000);
      var old = !isNaN(tl) && Date.now() - tl > 26 * 3600000;
      var val = bs && bs !== 'idle' ? 'Läuft' : !isNaN(tl) ? agoMs(tl) : '—';
      // Termin in der Vergangenheit: nicht als „Nächstes …“ zeigen, sondern als überfällig.
      var tn = Date.parse(next), due = !isNaN(tn) && tn < Date.now() - 10 * 60000;
      var nx = due ? null : fmtNext(next);
      rows.push({ entity: C.backupLast, icon: 'mdi:backup-restore', iconTone: 'rgba(0,0,0,0)', label: 'Backup',
        value: val, valueTone: failed ? 'bad' : old ? 'warn' : null,
        sub: failed ? 'Letzter Versuch fehlgeschlagen' : due ? 'Nächstes Backup überfällig' : nx ? 'Nächstes ' + nx : (old ? 'Älter als ein Tag' : 'Automatisch') });
    }
    return h.headOut('System') + UI.group(rows, null, null, { labelInside: true });
  };

  // ── Zuletzt aktualisiert ──
  var histRows = function (states, h) {
    var UI = window._casoraUI; if (!UI || !h) return '';
    if (!H.list) return UI.group([{ icon: 'clock', iconTone: 'rgba(0,0,0,0)', label: H.err ? 'Verlauf nicht verfügbar' : 'Wird geladen …' }], null, null, { labelInside: true });
    if (!H.list.length) return UI.group([{ icon: 'clock', iconTone: 'rgba(0,0,0,0)', label: 'Keine Updates in 30 Tagen' }], null, null, { labelInside: true });
    return UI.group(H.list.slice(0, Math.max(5, sysRowsN(states, h.C))).map(function (u) {
      return { entity: states[u.id] ? u.id : undefined, iconTone: 'rgba(0,0,0,0)', image: h.logoOf ? h.logoOf(u.id) : null,
        label: nameOf(states, u.id), sub: (u.from ? u.from + ' → ' : '') + u.to, value: agoMs(u.t) };
    }), null, null, { labelInside: true });
  };
  X.hist = function (states, hass, h) {
    H._h = h;
    load(states, hass);
    return h.headOut('Zuletzt aktualisiert') + '<div class="hu-hist5">' + histRows(states, h) + '</div>';
  };

  // ── Verfügbare Updates (live statt nur beim Öffnen gebaut, 25.09.2026) ──
  // Überspringen/Wieder anzeigen wirkt sofort; Zeilen wie im Template (Aktion live über actionLive).
  var TEAL = 'var(--casora-color-teal, #00C3D0)';
  X.RULES = [
    /* Laufend (04.10.2026): war fast unsichtbar (Füllfarbe) – jetzt Zweitfarbe mit kleinem Kreis (busy, casora-core .hui-busy). */
    { attr: 'in_progress', text: 'Wird aktualisiert', busy: true, color: 'var(--casora-soft-sub, var(--casora-popup-tiles-text-secondary, rgba(255,255,255,0.56)))' },
    { attr: 'state', eq: 'off', and: [{ attr: 'skipped_version' }], text: 'Übersprungen', icon: 'mdi:skip-next', color: INK3 },
    { attr: 'state', eq: 'off', and: [{ attr: 'release_summary', has: 'restart' }], text: 'Neustart erforderlich', icon: 'mdi:restart', color: ORG },
    { attr: 'state', eq: 'off', text: 'Installiert', icon: 'mdi:check', color: 'var(--casora-popup-ui-good, #30D158)' },
  ];
  X.list = function (states, h) {
    var UI = h.UI;
    var ids = Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0 && states[id].state === 'on'; })
      .sort(function (a, b) {
        var x = states[a].attributes.friendly_name || a, y = states[b].attributes.friendly_name || b;
        return x.localeCompare(y);
      });
    if (window._casoraUpdAiSweep) window._casoraUpdAiSweep();
    /* 1.0.5: Nichts mehr offen, aber ein Neustart steht aus – die Liste zeigt die Neustart-Zeilen
       (Kopf darüber heißt dann „Wartet auf Neustart“ mit „Jetzt neu starten“). */
    if (!ids.length) {
      var rr = X.restartRows(states, h);
      return rr.length ? UI.group(rr, null) : UI.group([{ icon: 'mdi:check', iconTone: 'rgba(0,0,0,0)', label: 'Keine Updates offen' }], null);
    }
    /* Weich (E3): nur Name, neue Version und KI-Urteil als Punkt (08-weich-kompakt.js). */
    if (UI.soft && UI.soft() && window._casoraSoftUpd) {
      var sr = window._casoraSoftUpd.rows(states, ids);
      return window._casoraSoftUpd.tint(UI.group(sr, null), sr);
    }
    return UI.group(ids.map(function (id) {
      var e = states[id], a = e.attributes || {};
      var ver = (a.installed_version && a.latest_version && a.installed_version !== a.latest_version)
        ? a.installed_version + ' → ' + a.latest_version : (a.installed_version || a.latest_version || null);
      // release_summary ist Markdown/HTML (je nach Integration): erste Textzeile ohne
      // Auszeichnung (#, **, `, [Text](Link), Listenpunkt), gekürzt.
      // Erst Entities auflösen, dann Tags entfernen – sonst würde aus &lt;img …&gt; echtes Markup.
      var sum = String(a.release_summary || '').replace(/&(amp|lt|gt|quot);/g, function (m, x) { return { amp: '&', lt: '<', gt: '>', quot: '"' }[x]; })
        .replace(/<[^>]+>/g, '').split('\n').map(function (l) {
        return l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s*)/, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/\*\*|__|`/g, '').trim();
      }).filter(Boolean)[0];
      if (sum && sum.length > 90) sum = sum.slice(0, 88).replace(/\s+\S*$/, '') + ' …';
      return {
        entity: id, iconTone: 'rgba(0,0,0,0)', image: h.logoOf ? h.logoOf(id) : null,
        label: String(a.title || a.friendly_name || id).replace(/\s+Update$/i, ''),
        sub: [ver, sum].filter(Boolean),
        action: a.in_progress ? 'Wird aktualisiert' : 'Aktualisieren', actionTone: 'accent', actionBusy: !!a.in_progress,
        /* 1.0.5: am Handy runder Download-Knopf statt Text (casora-core .hui-actx). */
        actionIcon: 'mdi:download',
        actionLive: { rules: X.RULES, text: 'Aktualisieren', icon: 'mdi:download', color: TEAL },
      };
    }), null);
  };

  // ── Wartet auf Neustart (live, 1.0.5) ──
  // Früher nur beim Öffnen gebaut: Wer im offenen Popup installierte, sah den Bereich erst nach
  // erneutem Öffnen. Gleiche Erkennung wie headCount im Template: aus, Kurzfassung nennt
  // „restart“, installierte = neueste Version.
  X.needsRestart = function (e) {
    if (!e || e.state !== 'off') return false;
    var a = e.attributes || {};
    return String(a.release_summary || '').toLowerCase().indexOf('restart') !== -1
      && !!a.installed_version && a.installed_version === a.latest_version;
  };
  X.restartIds = function (states) {
    return Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0 && X.needsRestart(states[id]); })
      .sort(function (a, b) {
        var x = states[a].attributes.friendly_name || a, y = states[b].attributes.friendly_name || b;
        return x.localeCompare(y);
      });
  };
  X.restartRows = function (states, h) {
    return X.restartIds(states).map(function (id) {
      var a = states[id].attributes || {};
      return { entity: id, iconTone: 'rgba(0,0,0,0)', image: h && h.logoOf ? h.logoOf(id) : null,
        label: String(a.title || a.friendly_name || id).replace(/\s+Update$/i, ''),
        sub: a.installed_version || null, value: 'Neustart erforderlich', valueTone: 'warn', valueIcon: 'mdi:restart',
        svc: { domain: 'homeassistant', service: 'restart' }, confirm: 'Neustart' };
    });
  };
  // Eigener Bereich nur, solange daneben noch Updates offen sind – sonst stehen die Zeilen in der
  // Liste selbst (X.list). Leer: '' (kein Abstand; der Bereich bringt seinen Abstand oben selbst mit).
  X.restart = function (states, h) {
    var UI = h.UI;
    var pend = Object.keys(states).some(function (id) { return id.indexOf('update.') === 0 && states[id].state === 'on'; });
    if (!pend) return '';
    var rr = X.restartRows(states, h);
    if (!rr.length) return '';
    var soft = UI.soft && UI.soft();
    return '<div style="padding-top:' + (soft ? 'var(--casora-popup-sec-gap, 22px)' : '18px') + '">'
      + (soft ? UI.group(rr, 'Wartet auf Neustart') : h.headOut('Wartet auf Neustart') + UI.group(rr, null)) + '</div>';
  };

  // ── Übersprungen (auf-/zuklappbar, Standard zu) ──
  X.skip = function (states, h) {
    var UI = h.UI;
    var sk = Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0 && states[id].attributes.skipped_version; })
      .sort(function (a, b) { return nameOf(states, a).localeCompare(nameOf(states, b)); });
    if (!sk.length) return '';
    var id = '__hu_skipped';
    var body = UI.group(sk.map(function (e) {
      return { entity: e, iconTone: 'rgba(0,0,0,0)', image: h.logoOf ? h.logoOf(e) : null, label: nameOf(states, e),
        sub: 'Version ' + states[e].attributes.skipped_version + ' übersprungen',
        action: 'Wieder anzeigen', actionTone: 'accent',
        svc: { domain: 'update', service: 'clear_skipped', target: { entity_id: e } }, confirm: 'Anzeigen' };
    }), null, null, { labelInside: true });
    return '<style>'
      + '.hus,.hus details{display:block;width:100%;}'
      + '.hus summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:6px;padding:0 4px 8px;'
      + 'font-family:var(--primary-font-family, system-ui);font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + INK + ');}'
      + '.hus summary::-webkit-details-marker{display:none;}'
      + '.hus .cnt{font-weight:500;color:' + INK3 + ';}'
      + '.hus .cv{margin-left:-2px;transition:transform .2s ease;color:' + INK3 + ';}'
      + '.hus details[open] .cv{transform:rotate(90deg);}'
      + '</style>'
      + '<div class="hua hus"><details data-id="' + id + '"' + (OPEN[id] ? ' open' : '') + '>'
      + '<summary><span>Übersprungen</span><span class="cnt">' + sk.length + '</span>'
      + '<ha-icon class="cv" icon="mdi:chevron-right" style="--mdc-icon-size:20px;"></ha-icon></summary>'
      + body + '</details></div>';
  };
})();

// ── HAs eigener Update-Dialog (30.09.2026) ──────────────────────────────────
// Die Zeilen im Update-Popup öffnen HAs Dialog (more-info-update). Dessen Fußleiste
// mit „Überspringen/Aktualisieren“ klebt unten und nimmt als Hintergrund die Dialog-
// Fläche des Themes – bei Casora halbdurchsichtig. Lange Versionshinweise liefen
// dadurch sichtbar unter den Knöpfen durch und waren dort nicht lesbar. Hier: Fußleiste
// deckend (mit Blur), die Hinweise ruhiger gesetzt (Überschriften, Listenabstände).
(function () {
  if (window._casoraUpdDialogFix) return;
  window._casoraUpdDialogFix = true;
  var MD_CSS = ''
    + 'ha-markdown-element h1,ha-markdown-element h2,ha-markdown-element h3,ha-markdown-element h4{'
    + 'font-size:1.02em;font-weight:650;line-height:1.3;margin:1.15em 0 .4em;}'
    + 'ha-markdown-element>:first-child{margin-top:0;}'
    + 'ha-markdown-element ul,ha-markdown-element ol{padding-inline-start:1.3em;margin:.2em 0 .6em;}'
    + 'ha-markdown-element li{margin:.35em 0;line-height:1.45;}'
    + 'ha-markdown-element li::marker{color:var(--secondary-text-color);}'
    + 'ha-markdown-element p{line-height:1.45;}'
    + 'ha-markdown-element code{font-size:.88em;padding:.1em .35em;border-radius:5px;}';
  var rgba = function (c) {
    var m = /rgba?\(([^)]+)\)/.exec(c || '');
    return m ? m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat) : null;
  };
  var fix = function (el) {
    var root = el && el.shadowRoot;
    if (!root) return;
    var foot = root.querySelector('.footer');
    if (foot && !foot._casoraFix) {
      var bg = getComputedStyle(foot).backgroundColor, p = rgba(bg);
      if (p && p.length > 3 && p[3] < 0.9) {
        foot._casoraFix = true;
        // Deckende Grundfarbe passend zur Schrift (helle Schrift → dunkle Fläche), darüber
        // die Theme-Fläche, damit der Ton zum restlichen Dialog passt.
        var t = rgba(getComputedStyle(el).color) || [255, 255, 255];
        var light = (0.299 * t[0] + 0.587 * t[1] + 0.114 * t[2]) / 255 > 0.5;
        foot.style.background = 'linear-gradient(' + bg + ',' + bg + '),' + (light ? 'rgb(22,22,26)' : 'rgb(246,246,248)');
        foot.style.backdropFilter = 'blur(20px) saturate(1.2)';
        foot.style.webkitBackdropFilter = 'blur(20px) saturate(1.2)';
      }
    }
    var md = root.querySelector('ha-markdown');
    if (md && md.shadowRoot && !md.shadowRoot.getElementById('casora-upd-md')) {
      var st = document.createElement('style');
      st.id = 'casora-upd-md';
      st.textContent = MD_CSS;
      md.shadowRoot.appendChild(st);
    }
  };
  customElements.whenDefined('more-info-update').then(function () {
    var C = customElements.get('more-info-update');
    var proto = C && C.prototype;
    if (!proto || proto._casoraUpdFix) return;
    proto._casoraUpdFix = true;
    var orig = proto.updated;
    proto.updated = function () {
      if (orig) orig.apply(this, arguments);
      var self = this;
      try { fix(self); } catch (e) { /* HAs Dialog nie brechen */ }
      // ha-markdown rendert nach dem Laden der Hinweise noch einmal nach.
      requestAnimationFrame(function () { try { fix(self); } catch (e) { /* egal */ } });
    };
  });
})();

// ── Licht-Popup „soft“ (Weich, 01.10.2026) ──────────────────────────────────
// Aufbau wie im Weich-Entwurf: Ring + Titel + Unterzeile, links Helligkeit,
// Lichtfarbe und Szenen, rechts die Leuchten des Raums. Nur aktiv, wenn das
// Theme --casora-popup-layout: soft setzt (Casora); Hemma 2 und Hemma 1
// behalten den bisherigen Aufbau. Die Vorlage casora_popup_light ruft nur
// window._casoraLightSoft.cards(...) auf, Raumdaten kommen aus _casoraLPC.
// Eingaben laufen über die Fenster-Listener unten (Touch mit Schwelle +
// Scroll-Schutz, Klick entprellt) – kein onclick im HTML.
(function () {
  if (window._casoraLightSoft) return;
  var S = window._casoraLightSoft = { els: {} };
  S.on = function () {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue('--casora-popup-layout').trim() === 'soft';
    } catch (e) { return false; }
  };
  var tr = function (t) { return window.casoraTr ? window.casoraTr(t) : t; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var attr = function (o) { return esc(JSON.stringify(o)); };
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };
  var icon = function (n) {
    return window.casoraIconUrl ? window.casoraIconUrl(n) : '/casora_assets/icons/' + n + '.svg';
  };
  var modes = function (st) { return (st && st.attributes && st.attributes.supported_color_modes) || []; };
  var dimmable = function (st) { var m = modes(st); return m.length > 0 && !(m.length === 1 && m[0] === 'onoff'); };
  var hasCt = function (st) { return modes(st).indexOf('color_temp') > -1; };
  var pct = function (st) {
    var b = st && st.attributes && st.attributes.brightness;
    return (st && st.state === 'on' && typeof b === 'number') ? Math.max(1, Math.round(b / 2.55)) : null;
  };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return tr('gerade eben');
    if (m < 60) return tr('vor ' + m + ' Min.');
    if (m < 1440) return tr('vor ' + Math.round(m / 60) + ' Std.');
    return tr('vor ' + Math.round(m / 1440) + ' T.');
  };
  // Raumname aus dem Leuchtennamen nehmen („Spot Terrasse“ → „Spot“), nie leer.
  var short = function (name, room) {
    var n = String(name || '');
    if (!room) return n;
    var r = n.replace(new RegExp('\\s*\\b' + String(room).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b\\s*', 'i'), ' ').trim();
    return r || n;
  };
  var nameOf = function (id, states) {
    var st = states[id];
    return (st && st.attributes && st.attributes.friendly_name) || id.split('.').pop().replace(/_/g, ' ');
  };

  /* Bereich eines Raums: Registry der Gruppe, sonst einer Leuchte, sonst ein
     HA-Bereich mit gleichem Namen. Daraus die Szenen des Raums. */
  var areaOf = function (h, id) {
    var re = h && h.entities && h.entities[id];
    if (!re) return null;
    return re.area_id || (re.device_id && h.devices && h.devices[re.device_id] && h.devices[re.device_id].area_id) || null;
  };
  var roomArea = function (h, room) {
    var ids = [room.rid].concat(room.lights || []);
    for (var i = 0; i < ids.length; i++) { var a = areaOf(h, ids[i]); if (a) return a; }
    var want = String(room.name || '').toLowerCase();
    var areas = (h && h.areas) || {};
    for (var k in areas) if (areas[k] && String(areas[k].name || '').toLowerCase() === want) return k;
    return null;
  };
  var scenesOf = function (h, states, room) {
    var a = roomArea(h, room);
    if (!a) return [];
    return Object.keys(states).filter(function (id) {
      return id.indexOf('scene.') === 0 && areaOf(h, id) === a;
    }).sort(function (x, y) { return nameOf(x, states).localeCompare(nameOf(y, states)); });
  };

  /* Was gerade gezeigt wird: ein Raum (Raumauswahl oder Popup aus einem Raum)
     oder das ganze Haus („Alle“). */
  var selOf = function (cfg) {
    var f = window._casoraLF && window._casoraLF[cfg.gid];
    return (f !== undefined) ? f : cfg.init;
  };
  var scopeOf = function (cfg) {
    if (!cfg.rooms) return cfg.flat;
    var s = selOf(cfg);
    return (s >= 0 && cfg.rooms[s]) ? cfg.rooms[s] : null;
  };
  var stat = function (ids, states) {
    var on = 0, sum = 0, nb = 0, tot = 0;
    ids.forEach(function (id) {
      var st = states[id]; if (!st) return;
      tot++;
      if (st.state === 'on') { on++; var p = pct(st); if (p != null) { sum += p; nb++; } }
    });
    return { on: on, tot: tot, pct: nb ? Math.round(sum / nb) : null };
  };
  var subline = function (s, oneLamp) {
    var p = s.pct != null ? ' · ' + s.pct + ' %' : '';
    if (s.tot <= 1 || oneLamp) return s.on ? tr('An') + p : tr('Aus');
    if (!s.on) return tr('Alle aus');
    return tr(s.on + ' von ' + s.tot + ' An') + p;
  };

  var CSS = '<style>'
    + 'ha-card.disabled{pointer-events:auto!important;}'
    + '.lps-r{font-family:var(--primary-font-family,system-ui);color:var(--casora-lps-title,var(--primary-text-color));text-align:left;}'
    + '.lps-r *{box-sizing:border-box;}'
    + '.lps-head{display:flex;flex-direction:column;align-items:center;text-align:center;padding:4px 0 0;}'
    + '.lps-ring{width:78px;height:78px;border-radius:50%;display:grid;place-items:center;cursor:pointer;'
    +   'background:var(--casora-lps-ring-off);box-shadow:0 0 0 10px var(--casora-lps-ring-off-halo);'
    +   'transition:background .25s ease,box-shadow .25s ease,transform .15s ease;-webkit-tap-highlight-color:transparent;}'
    + '.lps-ring.on{background:var(--casora-lps-ring);box-shadow:0 0 0 10px var(--casora-lps-ring-halo),var(--casora-lps-ring-shadow);}'
    + '.lps-ring:active{transform:scale(.95);}'
    + '.lps-g{display:block;background:currentColor;-webkit-mask:var(--lps-ic) center/contain no-repeat;mask:var(--lps-ic) center/contain no-repeat;}'
    + '.lps-ring .lps-g{width:34px;height:34px;color:var(--casora-lps-ring-off-ink);}'
    + '.lps-ring.on .lps-g{color:var(--casora-lps-ring-ink);}'
    + '.lps-t{font-size:28px;font-weight:800;letter-spacing:-.7px;line-height:1.2;margin-top:16px;color:var(--casora-lps-title,var(--primary-text-color));}'
    + '.lps-s{font-size:15px;font-weight:500;line-height:1.45;margin-top:4px;color:var(--casora-lps-sub,var(--secondary-text-color));font-variant-numeric:tabular-nums;}'
    + '.lps-s b{font-size:17px;font-weight:700;letter-spacing:-0.01em;color:var(--casora-lps-title,var(--primary-text-color));}'
    + '.lps-s i{font-style:normal;opacity:.6;}'
    /* Trennpunkt an einem Zeilenumbruch: ausgeblendet, dort steht ein Umbruch (_casoraSepScan). */
    + '.lps-s .hui-cut{display:none!important;}'
    + '.lps-cols{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--casora-popup-col-gap,26px);align-items:start;}'
    + '.lps-cols.one{grid-template-columns:minmax(0,1fr);}'
    + '.lps-lbl{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 0 10px 6px;color:var(--casora-lps-label,var(--secondary-text-color));}'
    + '.lps-gap{margin-top:22px;}'
    + '.lps-bar{position:relative;height:66px;border-radius:var(--casora-popup-row-radius,24px);overflow:hidden;cursor:ew-resize;'
    +   'background:var(--casora-lps-track);touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}'
    + '.lps-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;background:var(--casora-lps-fill);transition:width .18s cubic-bezier(.36,0,.16,1);}'
    + '.lps-bar.drag i{transition:none;}'
    + '.lps-bar .v{position:absolute;left:22px;top:50%;transform:translateY(-50%);font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;pointer-events:none;color:var(--casora-lps-sub,var(--secondary-text-color));}'
    + '.lps-bar em{position:absolute;right:22px;top:50%;transform:translateY(-50%);font-style:normal;font-size:14px;font-weight:600;pointer-events:none;white-space:nowrap;color:var(--casora-lps-sub,var(--secondary-text-color));}'
    /* Schrift zweilagig (wie Kontrollzentrum): unten gedämpft auf der Spur, darüber dieselbe Zeile in
       Füllschrift, auf die Füllbreite zugeschnitten – lesbar bei jedem Wert, hell und dunkel. */
    + '.lps-bar b{position:absolute;inset:0;pointer-events:none;font-weight:inherit;transition:clip-path .18s cubic-bezier(.36,0,.16,1);}'
    + '.lps-bar b .v,.lps-bar b em{color:var(--casora-lps-fill-ink,#3A2A14);}'
    + '.lps-bar.drag b{transition:none;}'
    + '@media (prefers-reduced-motion:reduce){.lps-bar i,.lps-bar b{transition:none;}}'
    + '.lps-seg{display:flex;gap:10px;}'
    + '.lps-sg{flex:1;min-width:0;height:46px;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;'
    +   'font-size:13px;font-weight:600;white-space:nowrap;background:var(--casora-lps-seg);color:var(--casora-lps-seg-ink);'
    +   'transition:background .2s ease,color .2s ease,box-shadow .2s ease;-webkit-tap-highlight-color:transparent;}'
    + '.lps-sg.on{background:var(--casora-lps-seg-on);color:var(--casora-lps-seg-on-ink);box-shadow:var(--casora-lps-seg-on-shadow);}'
    + '.lps-dot{width:10px;height:10px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1px var(--casora-soft-dot-ring,var(--casora-lps-dot-ring,transparent));}'
    + '.lps-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px;}'
    + '.lps-chip{padding:10px 16px;border-radius:999px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;'
    +   'background:var(--casora-lps-chip);color:var(--casora-lps-chip-ink);transition:background .2s ease;-webkit-tap-highlight-color:transparent;}'
    + '.lps-chip.on{background:var(--casora-lps-chip-on);color:var(--casora-lps-chip-on-ink);}'
    + '.lps-rows{display:flex;flex-direction:column;gap:8px;}'
    + '.lps-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px var(--casora-popup-col-gap,26px);}'
    + '.lps-row{display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 14px 10px 10px;border-radius:var(--casora-popup-row-radius,24px);'
    +   'background:var(--casora-soft-row-fill,var(--casora-lps-row));cursor:pointer;transition:background .2s ease;-webkit-tap-highlight-color:transparent;}'
    + '@media (hover:hover){.lps-row:hover{background:var(--casora-soft-row-hover,var(--casora-lps-row-hover));}.lps-chip:not(.on):hover,.lps-sg:not(.on):hover{filter:brightness(.98);}}'
    + '.lps-ic{width:38px;height:38px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--casora-lps-icon-off);}'
    + '.lps-ic .lps-g{width:19px;height:19px;color:var(--casora-lps-icon-off-ink);}'
    + '.lps-row.on .lps-ic{background:var(--casora-lps-icon-on);}'
    + '.lps-row.on .lps-ic .lps-g{color:var(--casora-lps-icon-on-ink);}'
    + '.lps-tx{flex:1;min-width:0;}'
    + '.lps-tx b{display:block;font-size:14.5px;font-weight:700;color:var(--casora-lps-title,var(--primary-text-color));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '.lps-tx small{display:block;font-size:12.5px;font-weight:500;color:var(--casora-lps-sub,var(--secondary-text-color));overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums;}'
    + '.lps-sw{position:relative;width:44px;height:26px;flex:none;border-radius:999px;background:var(--casora-lps-switch-off);cursor:pointer;transition:background .2s ease;}'
    + '.lps-sw::after{content:"";position:absolute;left:3px;top:3px;width:20px;height:20px;border-radius:50%;background:var(--casora-lps-knob);'
    +   'box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .2s ease;}'
    + '.lps-row.on .lps-sw{background:var(--casora-lps-switch-on);}'
    + '.lps-row.on .lps-sw::after{left:21px;}'
    // Leuchte an = aktive Zeile wie ladende Geräte (Batterien) und gemeldete Werte (Pflanzen):
    // heller Grund, dunkle Schrift, Zustand in Ton (03.10.2026, Vorschlag).
    + '.lps-row.on{background:var(--casora-entity-background-active,var(--casora-soft-row-fill));box-shadow:var(--button-card-box-shadow-active-mobile,none);}'
    + '@media (hover:hover){.lps-row.on:hover{background:var(--casora-entity-background-active,var(--casora-soft-row-fill));}}'
    + '.lps-row.on .lps-tx b{color:var(--casora-entity-name-active,var(--casora-lps-title));}'
    + '.lps-row.on .lps-tx small{color:var(--casora-entity-state-active-color,var(--casora-lps-sub));}'
    + '.lps-row.na{opacity:.55;}'
    + '@media (max-width:760px){.lps-cols,.lps-grid{grid-template-columns:minmax(0,1fr);}.lps-cols{gap:22px;}.lps-t{font-size:24px;margin-top:12px;}'
    +   '.lps-ring{width:66px;height:66px;}.lps-ring .lps-g{width:29px;height:29px;}}'
    + '@media (prefers-reduced-motion:reduce){.lps-r *{transition:none!important;}}'
    + '</style>';

  var glyph = function (n) { return '<span class="lps-g" style="--lps-ic:url(\'' + icon(n) + '\')"></span>'; };

  var lampRow = function (id, states, roomName) {
    var st = states[id];
    var on = st && st.state === 'on';
    var na = !st || st.state === 'unavailable' || st.state === 'unknown';
    var sub;
    if (na) sub = tr('Nicht verfügbar');
    else if (on) {
      var p = pct(st), k = st.attributes.color_temp_kelvin;
      sub = tr('An') + (p != null ? ' · ' + p + ' %' : '')
        + ((!st.attributes.color_mode || st.attributes.color_mode === 'color_temp') && k ? ' · ' + Math.round(k / 50) * 50 + ' K' : '');
    } else sub = tr('Aus') + (st.last_changed ? ' · ' + tr('zuletzt') + ' ' + ago(st.last_changed) : '');
    var tg = attr({ a: 'toggle', id: id });
    return '<div class="lps-row' + (on ? ' on' : '') + (na ? ' na' : '') + '" data-lps-tap="' + attr({ a: 'mi', id: id }) + '">'
      + '<div class="lps-ic" data-lps-tap="' + tg + '">' + glyph('light') + '</div>'
      + '<div class="lps-tx"><b>' + esc(short(nameOf(id, states), roomName)) + '</b><small>' + esc(sub) + '</small></div>'
      + '<div class="lps-sw" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" data-lps-tap="' + tg + '"></div>'
      + '</div>';
  };

  // Statuszeile wie in allen Weich-Popups: erster Teil fett (Zustand), Rest gedämpft (Meta).
  var statusLine = function (sub) {
    var parts = String(sub || '').split(' · ');
    return '<b>' + esc(parts[0]) + '</b>' + parts.slice(1).map(function (p) { return '<i class="hui-sep"> · </i>' + esc(p); }).join('');
  };
  var hero = function (cfg, states) {
    var sc = scopeOf(cfg);
    var title, sub, on, id;
    if (sc) {
      var s = stat(sc.lights, states);
      title = /^(beleuchtung|licht|lichter|lampen|zuhause)$/i.test(String(sc.name)) ? tr('Beleuchtung') : tr('Licht') + ' ' + sc.name;
      sub = subline(s, false); on = s.on > 0; id = sc.rid;
    } else {
      var ron = 0;
      cfg.rooms.forEach(function (r) { if (stat(r.lights, states).on) ron++; });
      title = tr('Beleuchtung');
      sub = ron ? tr(ron + ' von ' + cfg.rooms.length + ' Räumen an') : tr('Alle aus');
      on = ron > 0; id = cfg.gid;
    }
    return '<div class="lps-head">'
      + '<div class="lps-ring' + (on ? ' on' : '') + '" role="button" aria-label="' + esc(title) + '" data-lps-tap="' + attr({ a: 'scope', id: id }) + '">' + glyph('light') + '</div>'
      + '<div class="lps-t">' + esc(title) + '</div><div class="lps-s">' + statusLine(sub) + '</div></div>';
  };

  var ctPresets = function (lamps, states) {
    var lo = Infinity, hi = -Infinity;
    lamps.forEach(function (id) {
      var a = states[id].attributes;
      lo = Math.min(lo, a.min_color_temp_kelvin || 2000);
      hi = Math.max(hi, a.max_color_temp_kelvin || 6500);
    });
    var cl = function (k) { return Math.max(lo, Math.min(hi, k)); };
    return [{ k: cl(2700), l: 'Warm', d: 'warm' }, { k: cl(4000), l: 'Neutral', d: 'neutral' }, { k: cl(6000), l: 'Kalt', d: 'cold' }];
  };

  var roomBody = function (cfg, sc, states, h) {
    var ids = sc.lights.filter(function (id) { return states[id]; });
    var left = '';
    var dim = ids.filter(function (id) { return dimmable(states[id]); });
    if (dim.length) {
      var s = stat(dim, states);
      var v = s.on ? (s.pct != null ? s.pct : 100) : 0;
      var target = dim.filter(function (id) { return states[id].state === 'on'; });
      left += '<div class="lps-lbl">' + esc(tr('Helligkeit')) + '</div>'
        + '<div class="lps-bar" role="slider" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + v + '" data-lps-bar="'
        + attr({ ids: target.length ? target : dim }) + '">'
        + '<i style="width:' + v + '%"></i>' + barText(v) + '</div>';
    }
    var ct = ids.filter(function (id) { return hasCt(states[id]); });
    if (ct.length) {
      var ctOn = ct.filter(function (id) { return states[id].state === 'on'; });
      var cur = null;
      ctOn.some(function (id) {
        var a = states[id].attributes;
        if ((!a.color_mode || a.color_mode === 'color_temp') && a.color_temp_kelvin) { cur = a.color_temp_kelvin; return true; }
        return false;
      });
      var pr = ctPresets(ct, states);
      var best = -1;
      if (cur != null) pr.forEach(function (p, i) { if (best < 0 || Math.abs(p.k - cur) < Math.abs(pr[best].k - cur)) best = i; });
      left += '<div class="lps-lbl' + (left ? ' lps-gap' : '') + '">' + esc(tr('Lichtfarbe')) + '</div><div class="lps-seg">'
        + pr.map(function (p, i) {
          return '<div class="lps-sg' + (i === best ? ' on' : '') + '" role="button" data-lps-tap="'
            + attr({ a: 'ct', ids: ctOn.length ? ctOn : ct, k: p.k }) + '">'
            + '<i class="lps-dot" style="background:' + (p.d === 'cold' ? 'var(--casora-soft-dot-cold, var(--casora-lps-dot-cold))' : 'var(--casora-lps-dot-' + p.d + ')') + '"></i>' + esc(tr(p.l)) + '</div>';
        }).join('') + '</div>';
    }
    var sc2 = scenesOf(h, states, sc);
    if (sc2.length) {
      var last = null, lastT = 0;
      sc2.forEach(function (id) { var t = Date.parse(states[id].state); if (!isNaN(t) && t > lastT) { lastT = t; last = id; } });
      if (Date.now() - lastT > 12 * 3600000) last = null;
      left += '<div class="lps-chips"' + (left ? '' : ' style="margin-top:0"') + '>' + sc2.map(function (id) {
        return '<div class="lps-chip' + (id === last ? ' on' : '') + '" role="button" data-lps-tap="' + attr({ a: 'scene', id: id }) + '">'
          + esc(short(nameOf(id, states), sc.name)) + '</div>';
      }).join('') + '</div>';
    }
    var right = '<div class="lps-lbl">' + esc(tr('Leuchten im Raum')) + '</div><div class="lps-rows">'
      + ids.map(function (id) { return lampRow(id, states, sc.name); }).join('') + '</div>';
    return '<div class="lps-cols' + (left ? '' : ' one') + '">' + (left ? '<div>' + left + '</div>' : '') + '<div>' + right + '</div></div>';
  };
  var word = function (v) { return v <= 0 ? tr('Aus') : v >= 100 ? tr('Volle Helligkeit') : tr('Gedimmt'); };
  /* Wert und Wort zweimal: gedämpft auf der Spur, in Füllschrift auf die Füllung zugeschnitten. */
  var barText = function (v) {
    var t = '<span class="v">' + v + ' %</span><em>' + esc(word(v)) + '</em>';
    return t + '<b aria-hidden="true" style="clip-path:inset(0 ' + (100 - v) + '% 0 0)">' + t + '</b>';
  };

  var houseBody = function (cfg, states) {
    return '<div class="lps-lbl">' + esc(tr('Räume')) + '</div><div class="lps-grid">'
      + cfg.rooms.map(function (r, i) {
        var s = stat(r.lights, states);
        return '<div class="lps-row' + (s.on ? ' on' : '') + '" data-lps-tap="' + attr({ a: 'room', gid: cfg.gid, idx: i }) + '">'
          + '<div class="lps-ic" data-lps-tap="' + attr({ a: 'scope', id: r.rid }) + '">' + glyph('light') + '</div>'
          + '<div class="lps-tx"><b>' + esc(r.name) + '</b><small>' + esc(subline(s, false)) + '</small></div>'
          + '<div class="lps-sw" role="switch" aria-checked="' + (s.on ? 'true' : 'false') + '" data-lps-tap="' + attr({ a: 'scope', id: r.rid }) + '"></div>'
          + '</div>';
      }).join('') + '</div>';
  };

  S.render = function (cfg, part, states, h, el) {
    if (el) {
      el._lpsCfg = cfg; el._lpsPart = part;
      var set = S.els[cfg.gid] = S.els[cfg.gid] || [];
      if (set.indexOf(el) < 0) set.push(el);
      S.els[cfg.gid] = set.filter(function (x) { return x.isConnected || x === el; });
    }
    var inner;
    if (part === 'hero') inner = hero(cfg, states);
    else { var sc = scopeOf(cfg); inner = sc ? roomBody(cfg, sc, states, h) : houseBody(cfg, states); }
    return CSS + '<div class="lps-r" data-part="' + part + '">' + inner + '</div>';
  };

  /* Raumauswahl gewechselt: Ring und Inhalt sofort neu zeichnen (die Auswahl
     steht in window._casoraLF, das keine Vorlage beobachtet). */
  S.refresh = function (gid) {
    var h = hassNow(); if (!h) return;
    (S.els[gid] || []).forEach(function (el) {
      var r = el.shadowRoot && el.shadowRoot.querySelector('.lps-r');
      if (!r || !el._lpsCfg) return;
      var tmp = document.createElement('div');
      tmp.innerHTML = S.render(el._lpsCfg, el._lpsPart, h.states, h, null);
      var nr = tmp.querySelector('.lps-r');
      if (nr) r.replaceWith(nr);
    });
  };

  S.cards = function (cfg, states, h) {
    var rooms = cfg.rooms || [cfg.flat];
    var watch = [cfg.gid];
    rooms.forEach(function (r) {
      watch.push(r.rid); watch = watch.concat(r.lights);
      watch = watch.concat(scenesOf(h, states, r));
    });
    watch = watch.filter(function (w, i) { return w && watch.indexOf(w) === i && states[w]; });
    var ghost = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important;'
        + ' --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; width: 100% !important; max-width: none !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important;'
        + ' backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; will-change: auto !important; }',
      'ha-card.disabled { pointer-events: auto !important; }',
      'ha-card::before, ha-card::after { display: none !important; }',
      'ha-ripple { display: none !important; }',
      '#container { overflow: visible !important; }',
    ].join('\n');
    var cj = JSON.stringify(cfg);
    var mk = function (part, pad) {
      return {
        type: 'custom:button-card', entity: cfg.gid, triggers_update: watch,
        tap_action: { action: 'none' }, hold_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: ghost },
        extra_styles: '@media (max-width: 760px) { ha-card { padding: ' + pad[1] + ' !important; } }',
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: pad[0] }, { overflow: 'visible' }],
          grid: [{ 'grid-template-areas': '"lps"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }],
          custom_fields: { lps: [{ 'justify-self': 'stretch' }, { overflow: 'visible' }] },
        },
        custom_fields: {
          lps: '[[[ return window._casoraLightSoft ? window._casoraLightSoft.render(' + cj + ', ' + JSON.stringify(part) + ', states, hass, this) : ""; ]]]',
        },
      };
    };
    return {
      hero: mk('hero', ['22px 14px 20px 14px', '39px 28px 20px 28px']),
      body: mk('body', ['4px 14px 12px 14px', '4px 28px 12px 28px']),
    };
  };

  /* ── Eingaben ── */
  var find = function (ev, a) {
    var p = (ev.composedPath && ev.composedPath()) || [ev.target];
    for (var i = 0; i < p.length; i++) if (p[i] && p[i].hasAttribute && p[i].hasAttribute(a)) return p[i];
    return null;
  };
  var act = function (el) {
    var d; try { d = JSON.parse(el.getAttribute('data-lps-tap')); } catch (e) { return; }
    var h = hassNow(); if (!h || !d) return;
    window._casoraSuppressDismiss = Date.now() + 600;
    if (d.a === 'toggle') {
      var row = el.closest && el.closest('.lps-row');
      if (row) row.classList.toggle('on');
      h.callService('light', 'toggle', {}, { entity_id: d.id });
    } else if (d.a === 'scope') {
      if (h.states['script.casora_light_smart_toggle']) h.callService('script', 'casora_light_smart_toggle', { light_entity: d.id });
      else h.callService('light', 'toggle', {}, { entity_id: d.id });
    } else if (d.a === 'scene') {
      el.classList.add('on');
      h.callService('scene', 'turn_on', {}, { entity_id: d.id });
    } else if (d.a === 'ct') {
      var sg = el.parentNode && el.parentNode.querySelectorAll('.lps-sg');
      if (sg) sg.forEach(function (x) { x.classList.toggle('on', x === el); });
      h.callService('light', 'turn_on', { color_temp_kelvin: d.k }, { entity_id: d.ids });
    } else if (d.a === 'room') {
      document.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_lf_gid: d.gid, casora_lf_action: 'toggle', casora_lf_idx: d.idx } }));
    } else if (d.a === 'mi') {
      var ha = document.querySelector('home-assistant');
      var pop = window.casoraPopup && window.casoraPopup.element;
      if (pop) pop._miOpenedAt = Date.now();
      if (ha) ha.dispatchEvent(new CustomEvent('hass-more-info', { bubbles: true, composed: true, detail: { entityId: d.id } }));
    }
  };
  var ts = null, tDone = 0;
  window.addEventListener('touchstart', function (ev) {
    var t = ev.touches && ev.touches[0]; ts = t ? { x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    if (bar) return;
    var el = find(ev, 'data-lps-tap'); if (!el || !ts) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientX - ts.x) > 10 || Math.abs(t.clientY - ts.y) > 10)) return;
    if (Date.now() - (window._casoraLastScrollTs || 0) < 400) return;
    tDone = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation();
    act(el);
  }, { capture: true, passive: false });
  window.addEventListener('click', function (ev) {
    var el = find(ev, 'data-lps-tap'); if (!el) return;
    ev.preventDefault(); ev.stopPropagation();
    window._casoraSuppressDismiss = Date.now() + 600;
    if (Date.now() - tDone < 700) return;
    act(el);
  }, true);

  /* Helligkeit: Wert beim Ziehen zeigen, Dienst erst beim Loslassen. Am Handy
     entscheidet die erste Bewegung: waagrecht = Regler, senkrecht = Scrollen. */
  var bar = null;
  var barVal = function (b, x) {
    var r = b.el.getBoundingClientRect(); if (!r.width) return 0;
    return Math.max(0, Math.min(100, Math.round((x - r.left) / r.width * 100)));
  };
  var barPaint = function (b, v) {
    var i = b.el.querySelector('i'); if (i) i.style.width = v + '%';
    b.el.querySelectorAll('.v').forEach(function (s) { s.textContent = v + ' %'; });
    b.el.querySelectorAll('em').forEach(function (w) { w.textContent = word(v); });
    var k = b.el.querySelector('b'); if (k) k.style.clipPath = 'inset(0 ' + (100 - v) + '% 0 0)';
    b.el.setAttribute('aria-valuenow', String(v));
  };
  var barStart = function (ev, x, y, touch) {
    var el = find(ev, 'data-lps-bar'); if (!el) return false;
    var spec; try { spec = JSON.parse(el.getAttribute('data-lps-bar')); } catch (e) { return false; }
    bar = { el: el, ids: spec.ids, x0: x, y0: y, live: !touch, v: null };
    window._casoraSuppressDismiss = Date.now() + 1500;
    if (!touch) { el.classList.add('drag'); bar.v = barVal(bar, x); barPaint(bar, bar.v); }
    ev.stopPropagation();
    return true;
  };
  var barEnd = function (x) {
    if (!bar) return; var b = bar; bar = null;
    b.el.classList.remove('drag');
    if (b.v == null && x != null) { b.v = barVal(b, x); barPaint(b, b.v); }
    window._casoraSuppressDismiss = Date.now() + 600;
    var h = hassNow(); if (!h || b.v == null || !b.ids || !b.ids.length) return;
    if (b.v <= 0) h.callService('light', 'turn_off', {}, { entity_id: b.ids });
    else h.callService('light', 'turn_on', { brightness_pct: b.v }, { entity_id: b.ids });
  };
  window.addEventListener('touchstart', function (ev) {
    var t = ev.touches && ev.touches[0]; if (t) barStart(ev, t.clientX, t.clientY, true);
  }, { capture: true, passive: true });
  window.addEventListener('touchmove', function (ev) {
    if (!bar) return; var t = ev.touches && ev.touches[0]; if (!t) return;
    if (!bar.live) {
      var dx = Math.abs(t.clientX - bar.x0), dy = Math.abs(t.clientY - bar.y0);
      if (dy > 8 && dy > dx) { bar = null; return; }
      if (dx < 6) return;
      bar.live = true; bar.el.classList.add('drag');
    }
    if (ev.cancelable) ev.preventDefault(); ev.stopPropagation();
    bar.v = barVal(bar, t.clientX); barPaint(bar, bar.v);
  }, { capture: true, passive: false });
  window.addEventListener('touchend', function (ev) {
    if (!bar) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    ev.stopPropagation(); if (ev.cancelable) ev.preventDefault();
    tDone = Date.now();
    barEnd(t ? t.clientX : null);
  }, { capture: true, passive: false });
  window.addEventListener('touchcancel', function () { if (bar) { bar.el.classList.remove('drag'); bar = null; } }, { capture: true, passive: true });
  window.addEventListener('mousedown', function (ev) { if (ev.button === 0 && barStart(ev, ev.clientX, ev.clientY, false)) ev.preventDefault(); }, true);
  window.addEventListener('mousemove', function (ev) { if (bar && bar.live) { bar.v = barVal(bar, ev.clientX); barPaint(bar, bar.v); } }, true);
  window.addEventListener('mouseup', function () { if (bar) barEnd(null); }, true);
})();
