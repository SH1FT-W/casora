// ── Schloss-Ansicht im Schloss-Popup (Casora 1.2, Entwurf A) ─────────────────
// Im Weich-Look öffnet die Geräte-Zeile im Schloss-Popup (casora_popup_lock, data-casora-mi="lock.…")
// nicht mehr HAs Dialog, sondern eine eigene Ansicht im selben Popup (Muster wie Tanken, 12-tanken.js):
// Ring + Name, Statuszeile „Verriegelt · seit 22:14 · Automatisch“, links BEDIENEN (Entriegeln/
// Verriegeln, „Tür öffnen“ nur mit OPEN) und ZUSTAND (Schloss, Tür, Batterie), rechts VERLAUF · Heute
// aus dem Logbuch (logbook/get_events) mit Auslöser, „Ganzer Verlauf“ öffnet HAs Logbuch.
// Auslöser nur, was der Kontext hergibt: Automation/Skript (context_event_type + Name), Benutzer
// (context_user_id → Person bzw. HA-Benutzer, „per App“ = HA-Oberfläche), Dienst ohne Benutzer
// („Über Home Assistant“); ohne jeden Kontext „Am Schloss“ – nicht nach einem Neustart (vorher offline).
// Rückfrage wie im Studio („Vor dem Schalten fragen“, casoraConfirmSpec); „Tür öffnen“ fragt immer.
// Akku/Türkontakt je Schloss meldet die Vorlage (window._casoraLockView.meta), sonst vom selben Gerät.
// Standard/Glas: unverändert HAs Dialog.
(function () {
  if (window._casoraLockView) return;
  var L = window._casoraLockView = {};

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var soft = function () { return typeof window._casoraSoft === 'function' && window._casoraSoft(); };
  var hass = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };
  var states = function () { var h = hass(); return (h && h.states) || {}; };
  var popEl = function () { var P = window.casoraPopup; return P && P.element && P.element.hasAttribute('open') ? P.element : null; };
  var dead = function (s) { return !s || s === 'unavailable' || s === 'unknown'; };
  var BUSY = { locking: 1, unlocking: 1, opening: 1 };

  // ── Zuordnung Akku/Türkontakt ─────────────────────────────────────────────
  var META = { batt: {}, door: {} };
  L.meta = function (batt, door) {
    Object.keys(batt || {}).forEach(function (k) { if (batt[k]) META.batt[k] = batt[k]; });
    Object.keys(door || {}).forEach(function (k) { if (door[k]) META.door[k] = door[k]; });
  };
  // Ohne Angabe: Sensor desselben Geräts (Akku: device_class battery, Tür: door/opening).
  var sameDevice = function (id, dom, classes) {
    var h = hass(), E = (h && h.entities) || {}, S = states();
    var dev = E[id] && E[id].device_id;
    if (!dev) return null;
    var hit = Object.keys(E).filter(function (x) {
      if (x.indexOf(dom + '.') !== 0 || E[x].device_id !== dev || !S[x]) return false;
      return classes.indexOf(String((S[x].attributes || {}).device_class || '')) >= 0;
    });
    return hit[0] || null;
  };
  // Zuerst die Kachel/Badge, die das Popup geöffnet hat (ihre Variablen), dann die Meldung der Vorlage
  // (kann aus dem Popup-Zwischenspeicher fehlen), zuletzt dasselbe Gerät.
  var srcVar = function (key, id) {
    var pop = V ? V.pop : popEl();
    var c = pop && pop._src && pop._src._config, m = c && c.variables && c.variables[key];
    var v = m && typeof m === 'object' && !Array.isArray(m) ? m[id] : null;
    return typeof v === 'string' && v.indexOf('.') > 0 ? v : null;
  };
  L.battOf = function (id) { return srcVar('battery_entities', id) || META.batt[id] || sameDevice(id, 'sensor', ['battery']); };
  L.doorOf = function (id) { return srcVar('door_sensors', id) || META.door[id] || sameDevice(id, 'binary_sensor', ['door', 'opening', 'garage_door']); };

  // ── Wörter, Töne, Zeiten ──────────────────────────────────────────────────
  var WORD = { locked: 'Verriegelt', unlocked: 'Entriegelt', locking: 'Wird verriegelt…', unlocking: 'Wird entriegelt…',
    jammed: 'Klemmt', open: 'Geöffnet', opening: 'Wird geöffnet…', unavailable: 'Offline', unknown: 'Unbekannt' };
  L.word = function (s) { return WORD[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : WORD.unknown); };
  // Stufe wie Kachel/Badge (casoraSecurityLevel); ohne 00-finden.js dieselbe Regel in kurz.
  var level = function (id, s) {
    var h = hass();
    if (window.casoraSecurityLevel && h && h.states[id]) return window.casoraSecurityLevel(h, [id]);
    if (s === 'jammed') return 'alarm';
    return (s === 'locked' || s === 'locking') ? 'ok' : 'warn';
  };
  var color = function (lv) { return window.casoraSecurityColor ? window.casoraSecurityColor(lv)
    : ({ ok: '#6AAE78', warn: '#DE8A4E', alarm: '#D35A4E' })[lv] || '#6AAE78'; };
  var DIM = 'var(--casora-soft-icon-off, rgba(140,115,90,0.18))';
  var dotTone = function (s) { return dead(s) ? DIM : s === 'jammed' ? color('alarm') : (s === 'locked' || s === 'locking') ? color('ok') : color('warn'); };
  var ringIcon = function (s) {
    if (s === 'unlocking' || s === 'opening') return 'lock-unlocking-fill';
    return (s === 'unlocked' || s === 'open' || s === 'jammed') ? 'lock-open-fill' : 'lock-fill';
  };
  // 12-Stunden-Uhr (Englisch) ohne führende Null („2:19 AM“), 24 Stunden zweistellig.
  var hm = function (d) {
    var o = { hour: '2-digit', minute: '2-digit' };
    try { if (new Intl.DateTimeFormat(loc(), o).resolvedOptions().hour12) o.hour = 'numeric'; } catch (e) { /* alter Browser */ }
    return d.toLocaleTimeString(loc(), o);
  };
  var dayStart = function (d) { var x = new Date(d || Date.now()); x.setHours(0, 0, 0, 0); return x; };
  // „22:14“ heute, „gestern 22:14“, sonst Datum.
  L.when = function (iso) {
    var t = typeof iso === 'number' ? new Date(iso) : new Date(Date.parse(iso || ''));
    if (isNaN(t)) return null;
    var d0 = dayStart().getTime();
    if (t.getTime() >= d0) return hm(t);
    if (t.getTime() >= d0 - 864e5) return 'gestern ' + hm(t);
    return t.toLocaleDateString(loc(), { day: '2-digit', month: '2-digit' }) + '.';
  };

  // ── Auslöser aus dem Logbuch ──────────────────────────────────────────────
  // e = Logbuch-Eintrag, prev = Zustand davor (undefined = unbekannt). Nur, was der Kontext belegt.
  L.trigger = function (e, prev, id) {
    var et = e.context_event_type;
    var nm = e.context_name || e.context_entity_id_name || e.context_entity_id || '';
    if (et === 'unbelegt') return e.context_user_id ? { kind: 'user', user: e.context_user_id } : null;
    if (et === 'automation_triggered') return { kind: 'auto', name: nm };
    if (et === 'script_started') return { kind: 'script', name: nm };
    if (e.context_user_id) return { kind: 'user', user: e.context_user_id };
    if (et === 'call_service') return { kind: 'ha' };
    if (e.context_entity_id && e.context_entity_id !== id) return { kind: 'via', name: nm };
    if (dead(e.state) || prev === undefined || dead(prev)) return null;
    return { kind: 'device' };
  };
  var STRONG = { auto: 1, script: 1, user: 1, ha: 1, via: 1 };
  // Einträge (aufsteigend) → Ereignisse; „Wird verriegelt…“ + „Verriegelt“ kurz danach = ein Ereignis,
  // dessen Auslöser vom Übergang kommt, wenn der Endzustand selbst keinen belegten hat.
  L.events = function (entries, id) {
    var list = (entries || []).filter(function (e) { return e && e.state != null && (!e.entity_id || e.entity_id === id); })
      .map(function (e) { var w = e.when; return { e: e, t: typeof w === 'number' ? w * 1000 : Date.parse(w) }; })
      .filter(function (x) { return !isNaN(x.t); })
      .sort(function (a, b) { return a.t - b.t; });
    var out = [], prev;
    list.forEach(function (x, i) {
      var s = x.e.state, tr = L.trigger(x.e, prev, id);
      var nx = list[i + 1];
      if (BUSY[s] && nx && !BUSY[nx.e.state] && nx.t - x.t < 120000) { x.pass = tr; prev = s; out.push(x); return; }
      var last = out[out.length - 1];
      if (last && last.pass !== undefined) {
        out.pop();
        if ((!tr || !STRONG[tr.kind]) && last.pass && STRONG[last.pass.kind]) tr = last.pass;
        else if (!tr && last.pass) tr = last.pass;
      }
      out.push({ t: x.t, s: s, tr: tr });
      prev = s;
    });
    return out.filter(function (x) { return x.pass === undefined; });
  };

  // Benutzername: Person mit user_id, eigener Benutzer, sonst (Admin) die Benutzerliste.
  var USERS = null, usersAsk = false;
  var userName = function (uid) {
    var S = states(), h = hass();
    for (var k in S) {
      if (k.indexOf('person.') === 0 && S[k].attributes && S[k].attributes.user_id === uid) return S[k].attributes.friendly_name || null;
    }
    if (h && h.user && h.user.id === uid) return h.user.name || null;
    if (USERS && USERS[uid]) return USERS[uid];
    if (!usersAsk && h && h.user && h.user.is_admin && h.callWS) {
      usersAsk = true;
      h.callWS({ type: 'config/auth/list' }).then(function (r) {
        USERS = {};
        (r || []).forEach(function (u) { if (u && u.id && u.name && !u.system_generated) USERS[u.id] = u.name; });
        if (V) render(true);
      }, function () { USERS = {}; });
    }
    return null;
  };
  var nameSpan = function (n) { return '<span data-no-i18n>' + esc(n) + '</span>'; };
  var SEP = '<span> · </span>';
  // lang: Zeile im Verlauf („Automatisch · Gute Nacht“), sonst kurz für die Statuszeile („Automatisch“).
  L.trigText = function (tr, long) {
    if (!tr) return '';
    if (tr.kind === 'auto') return '<span>Automatisch</span>' + (long && tr.name ? SEP + nameSpan(tr.name) : '');
    if (tr.kind === 'script') return '<span>Skript</span>' + (tr.name ? SEP + nameSpan(tr.name) : '');
    if (tr.kind === 'user') {
      var n = userName(tr.user);
      if (!long) return n ? nameSpan(n) : '<span>per App</span>';
      return n ? nameSpan(n) + '<span> per App</span>' : '<span>per App</span>';
    }
    if (tr.kind === 'ha') return '<span>Über Home Assistant</span>';
    if (tr.kind === 'via') return tr.name ? '<span>Über</span> ' + nameSpan(tr.name) : '';
    if (tr.kind === 'device') return '<span>Am Schloss</span>';
    return '';
  };

  // Logbuch der letzten zwei Tage (für den Zustand vor dem ersten Eintrag heute); Rückfall: Verlauf
  // (nur Benutzer aus dem Kontext).
  L.fetch = function (id) {
    var h = hass();
    if (!h || !h.callWS) return Promise.resolve(null);
    var start = new Date(dayStart().getTime() - 864e5).toISOString(), end = new Date(Date.now() + 60000).toISOString();
    return h.callWS({ type: 'logbook/get_events', start_time: start, end_time: end, entity_ids: [id] }).then(function (r) {
      return Array.isArray(r) ? r : null;
    }, function () {
      return h.callWS({ type: 'history/history_during_period', start_time: start, end_time: end, entity_ids: [id],
        minimal_response: false, no_attributes: true, significant_changes_only: false }).then(function (r) {
        var rows = (r && r[id]) || [];
        // Ohne Logbuch kein Auslöser außer dem Benutzer; Kontext ohne Benutzer bleibt ohne Angabe.
        return rows.map(function (x) {
          var c = x.c && typeof x.c === 'object' ? x.c : {};
          return { when: x.lu, state: x.s, context_user_id: c.user_id || null, context_event_type: c.user_id ? null : 'unbelegt' };
        });
      });
    }).catch(function () { return null; });
  };

  // ── Bausteine ─────────────────────────────────────────────────────────────
  var T = function () {
    var UI = window._casoraUI || {}, k = UI.tokens || {};
    return { UI: UI, font: k.font || 'var(--primary-font-family, system-ui)', ink: 'var(--casora-popup-tiles-text-primary, ' + (k.ink || '#3A322B') + ')',
      sub: 'var(--casora-soft-sub, rgba(58,50,43,.6))', row: 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))',
      ctl: 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))', ton: 'var(--casora-soft-primary, #94603B)', tonInk: 'var(--casora-soft-primary-ink, #fff)',
      surf: 'var(--casora-soft-surface, var(--casora-popup-surface, #FBF8F3))' };
  };
  var mask = function (name, size, col) {
    var u = window.casoraIconUrl ? window.casoraIconUrl(name) : '';
    return '<span style="display:inline-block;flex:none;width:' + size + 'px;height:' + size + 'px;background-color:' + col + ';'
      + "-webkit-mask:url('" + u + "') center / contain no-repeat;mask:url('" + u + "') center / contain no-repeat;pointer-events:none;\"></span>";
  };
  var pill = function (k, o) {
    var on = !o.off;
    return '<div class="csl-btn' + (o.primary ? ' csl-main' : '') + '" role="button"' + (on && o.svc ? ' data-csl-svc="' + esc(o.svc) + '"' : ' aria-disabled="true"')
      + ' style="flex:1 1 0;min-width:0;height:44px;min-height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:8px;'
      + 'box-sizing:border-box;padding:0 14px;font-family:' + k.font + ';font-size:15px;font-weight:700;white-space:nowrap;'
      + (on && o.svc ? 'cursor:pointer;' : 'cursor:default;opacity:.6;')
      + (o.primary ? 'background:' + k.ton + ';color:' + k.tonInk + ';' : 'background:' + k.ctl + ';color:' + k.ink + ';') + '">'
      + (o.ic ? mask(o.ic, 18, 'currentColor') : '') + '<span>' + esc(o.t) + '</span></div>';
  };

  L.html = function (id, ev, wide) {
    var k = T(), UI = k.UI, S = states(), e = S[id] || { state: 'unavailable', attributes: {} };
    var s = String(e.state || '').toLowerCase(), a = e.attributes || {};
    var lv = level(id, s);
    var since = L.when(e.last_changed);
    var today = dayStart().getTime();
    // Statuszeile: Zustand · seit … · wer (nur wenn der letzte Eintrag den jetzigen Zustand belegt).
    var lastEv = ev && ev.length ? ev[ev.length - 1] : null;
    var who = lastEv && lastEv.s === s ? L.trigText(lastEv.tr, false) : '';
    var line = '<div class="csl-line" style="font-family:' + k.font + ';text-align:center;padding:0 8px 4px;margin:-4px 0 22px;font-size:15px;font-weight:500;line-height:1.45;color:' + k.sub + ';">'
      + '<span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;color:' + (lv === 'alarm' ? color('alarm') : lv === 'warn' && !dead(s) ? color('warn') : k.ink) + ';">' + esc(L.word(s)) + '</span>'
      + (since && !dead(s) ? SEP + '<span>' + esc('seit ' + since) + '</span>' : '') + (who ? SEP + who : '') + '</div>';

    // BEDIENEN
    var feats = Number(a.supported_features || 0), canOpen = (feats & 1) === 1;
    var main = null;
    if (s === 'locked') main = { svc: 'unlock', t: 'Entriegeln', ic: 'lock-open-fill' };
    else if (s === 'unlocked' || s === 'open' || s === 'jammed') main = { svc: 'lock', t: 'Verriegeln', ic: 'lock-fill' };
    else main = { t: L.word(s), ic: BUSY[s] ? ringIcon(s) : null, off: true };
    var ask = window.casoraAsksFirst && window.casoraAsksFirst(id);
    var bed = UI.label('Bedienen');
    if (dead(s)) bed += '<div class="csl-note" style="font-family:' + k.font + ';font-size:14px;font-weight:600;color:' + k.sub + ';background:' + k.row + ';border-radius:24px;padding:14px 16px;">Schloss nicht erreichbar</div>';
    else {
      main.primary = true;
      bed += '<div class="csl-btns" style="display:flex;gap:10px;">' + pill(k, main)
        + (canOpen ? pill(k, { svc: BUSY[s] ? null : 'open', t: 'Tür öffnen', ic: 'door-open', off: !!BUSY[s] }) : '') + '</div>'
        + (ask ? '<div class="csl-ask" style="font-family:' + k.font + ';font-size:12.5px;font-weight:500;color:' + k.sub + ';margin:8px 6px 0;">Mit Rückfrage, wie im Studio eingestellt</div>' : '');
    }

    // ZUSTAND
    var rows = [{ icon: window.casoraSecurityIcon ? window.casoraSecurityIcon(id, s, a) : 'lock-fill', iconTone: dead(s) ? 'rgba(255,255,255,0.18)' : color(lv),
      label: 'Schloss', sub: since && !dead(s) ? 'seit ' + since : null, value: L.word(s), valueTone: lv === 'alarm' ? 'bad' : lv === 'warn' ? 'warn' : null }];
    var did = L.doorOf(id), d = did && S[did];
    if (d) {
      var ds = String(d.state || '').toLowerCase(), dOpen = ds === 'on';
      rows.push({ icon: dOpen ? 'door-open' : 'door-closed', iconTone: dOpen ? color('warn') : 'rgba(255,255,255,0.18)', label: 'Tür', sub: 'Türkontakt',
        value: dead(ds) ? 'Offline' : dOpen ? 'Offen' : 'Geschlossen', valueTone: dOpen ? 'warn' : null });
    }
    var bid = L.battOf(id), b = bid && S[bid], B = window.casoraBattery;
    if (b) {
      var n = B ? B.pct(b) : parseFloat(b.state), blv = B ? B.level(b) : 'ok';
      var rep = L.when(b.last_reported || b.last_updated);
      rows.push({ icon: B ? B.icon(blv, n) : 'mdi:battery', iconTone: blv === 'crit' ? color('alarm') : blv === 'low' ? color('warn') : 'rgba(255,255,255,0.18)',
        label: 'Batterie', sub: rep && !dead(b.state) ? 'zuletzt gemeldet ' + rep : null,
        value: dead(b.state) ? 'Offline' : B ? B.text(b) : Math.round(n) + ' %', valueTone: blv === 'crit' ? 'bad' : blv === 'low' ? 'warn' : null });
    }
    var zus = '<div class="csl-zustand">' + UI.group(rows, 'Zustand') + '</div>';

    // VERLAUF · Heute
    var vl = UI.label('Verlauf').replace(/<\/div>$/, '<div style="font-size:12.5px;font-weight:600;color:' + k.sub + ';">Heute</div></div>');
    var body;
    if (ev === null) body = '<div class="csl-empty" style="padding:14px 4px;font-size:14px;font-weight:500;color:' + k.sub + ';">Verlauf nicht abrufbar</div>';
    else if (ev === undefined) body = '<div class="csl-empty" style="padding:14px 4px;font-size:14px;font-weight:500;color:' + k.sub + ';">Wird geladen …</div>';
    else {
      var td = ev.filter(function (x) { return x.t >= today; }).reverse().slice(0, 8);
      body = !td.length ? '<div class="csl-empty" style="padding:14px 4px;font-size:14px;font-weight:500;color:' + k.sub + ';">Heute keine Änderung</div>'
        : td.map(function (x, i) {
          var tt = L.trigText(x.tr, true), last = i === td.length - 1;
          return '<div class="csl-ev" data-state="' + esc(x.s) + '" style="display:grid;grid-template-columns:minmax(46px,max-content) 22px minmax(0,1fr);align-items:start;column-gap:8px;position:relative;padding:9px 0;">'
            + '<div style="font-size:13px;font-weight:600;color:' + k.sub + ';font-variant-numeric:tabular-nums;padding-top:2px;white-space:nowrap;">' + esc(hm(new Date(x.t))) + '</div>'
            + '<div style="position:relative;height:100%;display:flex;justify-content:center;">'
            + (last ? '' : '<div style="position:absolute;top:16px;bottom:-18px;width:2px;border-radius:2px;background:' + DIM + ';"></div>')
            + '<div style="position:relative;width:12px;height:12px;border-radius:50%;margin-top:4px;background:' + dotTone(x.s) + ';box-shadow:0 0 0 3px ' + k.row + ';"></div></div>'
            + '<div style="min-width:0;"><div class="csl-act" style="font-size:14.5px;font-weight:700;color:' + k.ink + ';">' + esc(L.word(x.s)) + '</div>'
            + (tt ? '<div class="csl-trig" style="font-size:12.5px;font-weight:500;color:' + k.sub + ';margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + tt + '</div>' : '')
            + '</div></div>';
        }).join('');
    }
    var ver = vl + '<div class="csl-verlauf" style="font-family:' + k.font + ';background:' + k.row + ';border-radius:var(--casora-popup-row-radius, 24px);padding:8px 16px 8px 12px;">' + body + '</div>'
      + '<div class="csl-more" role="button" data-csl-more="" style="font-family:' + k.font + ';margin-top:10px;height:46px;min-height:46px;border-radius:999px;display:flex;align-items:center;justify-content:center;gap:6px;'
      + 'font-size:14px;font-weight:700;cursor:pointer;background:var(--casora-soft-mehr-fill, ' + k.ctl + ');color:var(--casora-soft-mehr-ink, ' + k.ink + ');">'
      + '<span>Ganzer Verlauf</span><ha-icon icon="mdi:chevron-right" style="--mdc-icon-size:18px;display:flex;"></ha-icon></div>';

    var gap = '<div style="height:22px"></div>';
    var left = '<div class="csl-left">' + bed + gap + zus + '</div>', right = '<div class="csl-right">' + ver + '</div>';
    return '<div style="font-family:' + k.font + '">' + line + (wide
      ? '<div class="csl-cols" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:var(--casora-popup-col-gap, 26px);align-items:start">' + left + right + '</div>'
      : left + gap + right) + '</div>';
  };

  // ── Ansicht im offenen Popup ──────────────────────────────────────────────
  var V = null;
  var paintRing = function () {
    if (!V) return;
    var sr = V.pop.shadowRoot, ring = sr.querySelector('.header-ring');
    var e = states()[V.id] || {}, s = String(e.state || '').toLowerCase();
    if (!ring) return;
    var u = window.casoraIconUrl ? window.casoraIconUrl(ringIcon(s)) : '';
    var html = '<span class="g" style="--g:url(&quot;' + u + '&quot;)"></span>';
    if (ring.innerHTML !== html) ring.innerHTML = html;
    ring.hidden = false;
    ring.style.setProperty('--ring', color(level(V.id, s)));
    ring.toggleAttribute('off', dead(s));
    var ttl = sr.querySelector('.header-title'), nm = (e.attributes && e.attributes.friendly_name) || V.id;
    if (ttl && ttl.textContent !== nm) ttl.textContent = nm;
  };
  var render = function (keepScroll) {
    if (!V) return;
    var sr = V.pop.shadowRoot, content = sr.querySelector('.content');
    var top = content ? content.scrollTop : 0;
    var bw = V.box.getBoundingClientRect().width;
    V.wide = bw > 700 || (bw === 0 && window.innerWidth > 760);
    V.box.innerHTML = L.html(V.id, V.ev, V.wide);
    paintRing();
    if (content) content.scrollTop = keepScroll ? top : 0;
    if (window._casoraSepScan) window._casoraSepScan(sr);
  };
  var load = function () {
    if (!V) return;
    var v = V, id = V.id;
    L.fetch(id).then(function (r) { if (V !== v) return; V.ev = r ? L.events(r, id) : null; render(true); });
  };
  var sig = function () {
    var S = states(), id = V.id, b = L.battOf(id), d = L.doorOf(id);
    return [S[id], b && S[b], d && S[d]];
  };
  L.open = function (id) {
    var pop = popEl();
    if (!pop || V || !id) return false;
    var sr = pop.shadowRoot, cont = sr.querySelector('.content .container');
    var close = sr.querySelector('.header-close'), surf = sr.querySelector('.surface');
    if (!cont || !close || !surf) return false;
    // Seitenabstand wie die Zeilen des Popups.
    var cr = cont.getBoundingClientRect();
    // Linke Kante der linken Spalte (die Zeilen stehen im zweispaltigen Popup rechts).
    var deep = function (root, sel, out) {
      out = out || [];
      root.querySelectorAll('*').forEach(function (e) { if (e.matches(sel)) out.push(e); if (e.shadowRoot) deep(e.shadowRoot, sel, out); });
      return out;
    };
    var lefts = deep(cont, '.hui-srow, .hui-slbl')
      .map(function (e) { return e.getBoundingClientRect(); }).filter(function (r) { return r.width > 0; })
      .map(function (r) { return r.left - cr.left; });
    var pad = lefts.length ? Math.max(0, Math.min(40, Math.round(Math.min.apply(null, lefts)))) : (window.innerWidth > 760 ? 26 : 14);
    var ttlEl = sr.querySelector('.header-title'), ring = sr.querySelector('.header-ring');
    V = { pop: pop, id: id, hidden: [], ev: undefined, title: ttlEl ? ttlEl.textContent : '' };
    // Inhalt in eine ausgeblendete Hülle: am Handy setzt die Karte selbst display:flex !important
    // (:host im eigenen Schattenbaum, schlägt jede Regel von außen) – die Hülle blendet trotzdem aus.
    var hide = document.createElement('div');
    hide.className = 'casora-lock-hidden';
    hide.style.display = 'none';
    [].slice.call(cont.children).forEach(function (c) { V.hidden.push(c); hide.appendChild(c); });
    cont.appendChild(hide);
    V.hide = hide;
    var ex = sr.querySelector('.extra');
    if (ex && !ex.hidden) { V.extra = ex; ex.hidden = true; }
    if (ring) V.ringHidden = ring.hidden;
    var box = document.createElement('div');
    box.className = 'casora-lock-view';
    // Volle Breite auch im Spalten-Raster des Popups (_casoraStd).
    box.style.cssText = 'grid-column:1 / -1;width:100%;align-self:stretch;justify-self:stretch;flex:0 0 auto;display:block;padding:0 ' + pad + 'px 24px;box-sizing:border-box;position:relative;z-index:1;text-align:left;';
    cont.appendChild(box);
    V.box = box;
    // Zurück: Spiegelbild des Schließen-Knopfs (wie Tanken).
    var back = close.cloneNode(true);
    back.classList.add('casora-lock-back');
    back.setAttribute('aria-label', 'Zurück');
    back.hidden = false;
    var path = back.querySelector('path');
    if (path) path.setAttribute('d', 'M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z');
    var place = function () {
      var s = surf.getBoundingClientRect(), r = close.getBoundingClientRect();
      back.style.position = 'absolute';
      back.style.top = (r.top - s.top) + 'px';
      back.style.left = (s.right - r.right) + 'px';
      back.style.right = 'auto';
      back.style.margin = '0';
      back.style.zIndex = '5';
    };
    surf.appendChild(back);
    place();
    V.back = back;
    V.onResize = function () { if (!V) return; place(); var w = V.box.getBoundingClientRect().width > 700; if (w !== V.wide) render(true); };
    window.addEventListener('resize', V.onResize);
    V.mo = new MutationObserver(function () { if (V && (!pop.hasAttribute('open') || !box.isConnected)) L.leave(true); });
    V.mo.observe(pop, { attributes: true, attributeFilter: ['open'] });
    V.mo.observe(cont, { childList: true });
    // Zustände (Schloss, Tür, Akku) beobachten; ändert sich das Schloss, Verlauf neu holen.
    V.sig = sig();
    V.poll = setInterval(function () {
      if (!V) return;
      var n = sig(), o = V.sig;
      if (n[0] !== o[0] || n[1] !== o[1] || n[2] !== o[2]) {
        var moved = !n[0] || !o[0] || n[0].last_changed !== o[0].last_changed;
        V.sig = n;
        render(true);
        if (moved) { clearTimeout(V.refetch); V.refetch = setTimeout(load, 1500); }
      } else paintRing();  // Popup zeichnet seinen Ring bei Gruppen-Änderungen neu
    }, 700);
    render(false);
    load();
    return true;
  };
  L.leave = function (closing) {
    if (!V) return;
    var v = V; V = null;
    clearInterval(v.poll);
    clearTimeout(v.refetch);
    v.mo.disconnect();
    window.removeEventListener('resize', v.onResize);
    if (v.back) v.back.remove();
    if (v.box) v.box.remove();
    var sr = v.pop.shadowRoot;
    var hide = v.hide;
    if (hide && hide.parentNode) v.hidden.forEach(function (c) { if (c.parentNode === hide) hide.parentNode.insertBefore(c, hide); });
    if (hide) hide.remove();
    if (v.extra) v.extra.hidden = false;
    var ttl = sr.querySelector('.header-title');
    if (ttl) ttl.textContent = v.title;
    // Ring des Popups neu zeichnen lassen (Gruppenzustand kann sich geändert haben).
    var ring = sr.querySelector('.header-ring');
    if (ring) { ring.style.removeProperty('--ring'); ring.hidden = !!v.ringHidden; }
    try { v.pop._ringHtml = null; if (v.pop._paintSoft) v.pop._paintSoft(false); } catch (e) { /* älteres Popup */ }
    var content = sr.querySelector('.content');
    if (content && !closing) content.scrollTop = 0;
  };
  L.active = function () { return V ? V.id : null; };

  // ── Schalten ──────────────────────────────────────────────────────────────
  var act = function (svc) {
    if (!V) return;
    var id = V.id, h = hass();
    if (!h) return;
    var e = states()[id] || {}, nm = (e.attributes && e.attributes.friendly_name) || id;
    var go = function () { h.callService('lock', svc, { entity_id: id }); };
    if (svc === 'open') {
      // Tür öffnen fragt immer (wie bisher im Schloss-Popup).
      var w = window.casoraAsk ? window.casoraAsk({ title: nm, text: 'Wirklich die Tür öffnen?', yes: 'Öffnen' }) : Promise.resolve(window.confirm('Wirklich die Tür öffnen?'));
      w.then(function (ok) { if (ok) go(); });
      return;
    }
    var spec = { domain: 'lock', service: svc, target: { entity_id: id } };
    if (window.casoraConfirmSpec) window.casoraConfirmSpec(spec).then(function (ok) { if (ok) go(); });
    else go();
  };
  var full = function () {
    if (!V) return;
    var id = V.id;
    try { window.casoraPopup.close(); } catch (e) { /* schon zu */ }
    // Ganzer heutiger Tag (HA zeigt ohne Zeitraum nur die letzten Stunden).
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var d1 = new Date(d0.getTime()); d1.setDate(d1.getDate() + 1);
    history.pushState(null, '', '/logbook?entity_id=' + encodeURIComponent(id)
      + '&start_date=' + encodeURIComponent(d0.toISOString()) + '&end_date=' + encodeURIComponent(d1.toISOString()));
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  };

  // ── Antippen: vor casora-core (window statt document, Erfassungsphase) ────
  var last = 0, tp = null;
  var fire = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    var pop = popEl();
    if (!pop || path.indexOf(pop) < 0) return;
    for (var i = 0; i < path.length; i++) {
      var el = path[i];
      if (!el || !el.classList) continue;
      var take = function () {
        ev.preventDefault(); ev.stopPropagation();
        if (Date.now() - last < 400) return false;
        last = Date.now();
        return true;
      };
      if (!V) {
        if (el.dataset && el.dataset.casoraMi && el.dataset.casoraMi.indexOf('lock.') === 0 && soft()) {
          var id = el.dataset.casoraMi;
          if (!take()) return;
          if (!L.open(id) && window.casoraPopup) window.casoraPopup.moreInfo(id);
          return;
        }
        continue;
      }
      if (el.classList.contains('casora-lock-back')) {
        if (!take()) return;
        window._casoraSuppressDismiss = Date.now() + 600;
        L.leave(false);
        return;
      }
      if (el.dataset && el.dataset.cslSvc) { if (take()) act(el.dataset.cslSvc); return; }
      if (el.dataset && el.dataset.cslMore !== undefined) { if (take()) full(); return; }
    }
  };
  window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; tp = t ? { x: t.clientX, y: t.clientY, moved: false } : null; }, { capture: true, passive: true });
  window.addEventListener('touchmove', function (ev) {
    var t = ev.touches && ev.touches[0];
    if (tp && t && (Math.abs(t.clientX - tp.x) > 10 || Math.abs(t.clientY - tp.y) > 10)) tp.moved = true;
  }, { capture: true, passive: true });
  window.addEventListener('click', fire, true);
  window.addEventListener('touchend', function (ev) { var moved = !!(tp && tp.moved); tp = null; if (!moved) fire(ev); }, true);
})();
