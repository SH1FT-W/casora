// ── Weich: weitere Popups entschlackt (E3, 01.10.2026) ───────────────────────
// Nur im Weich-Design (window._casoraSoft()). Die Vorlagen rufen die Bausteine hier auf
// und bekommen eine fertige Karte bzw. HTML zurück; Standard und Glas bauen weiter ihr
// bisheriges Popup. Aufbau wie Licht/Netzwerk: Ring + Titel + eine Unterzeile (UI.line),
// links Bedienung, rechts Liste, unten rechts „Mehr“ (UI.more). Live über eigene
// button-cards mit triggers_update (window._casoraSoftKit.secCard aus 05-weich-mehr.js).
//   _casoraSoftBat   Batterien (casora_popup_battery)
//   _casoraSoftUpd   Software-Updates (casora_popup_updates)
//   _casoraSoftAlarm Modus-Liste des Alarm-Popups (aktive Zeile hervorgehoben)
//   _casoraSoftLock  Schloss-Schalter waagrecht mit Bezeichnung (casora_popup_lock)
(function () {
  if (window._casoraSoftBat) return;

  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var raw = function (states, id) { return (id && states[id]) ? states[id].state : null; };
  var ok = function (s) { return s != null && s !== 'unknown' && s !== 'unavailable'; };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return null;
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + (window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.round(m / 1440)) + ' T.';
  };
  var kit = function () { return window._casoraSoftKit; };
  var call = function (obj, part, C) {
    return 'return window.' + obj + ' ? window.' + obj + '.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(C) + ', states, hass) : "";';
  };

  // ── Batterien ─────────────────────────────────────────────────────────────
  // Ring-Unterzeile mit der Zahl der schwachen Batterien und der niedrigsten, darunter das
  // 30-Tage-Diagramm in der Sand-Karte (1.2.1, wie Pflanze/Energie: Etikett innen, „Jetzt“-Zeile,
  // zu Beginn die niedrigste Batterie), dann „Akku schwach“ (≤ 20 %) und alle übrigen in zwei
  // Spalten. Antippen einer Zeile schaltet das Diagramm um.
  // Stufen, Wörter und Farben aus window.casoraBattery (casora-core.js, 05.10.2026).
  var BAT = function () { return window.casoraBattery; };
  var lvOf = function (v) { return BAT() ? BAT().level(v) : v <= 10 ? 'crit' : v <= 20 ? 'low' : 'ok'; };
  var B = window._casoraSoftBat = {};
  /* DP-15 (1.3): Kopf-Kachel der Batterien in der Farbe des Zustands – alle OK grün, schwach orange, fast leer rot
     (vorher die Farbe der Kachel: am Handy rot bei „Alle Batterien OK“). */
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_(battery|popup_battery)\b/.test(key) || !B.lastC) return null;
    var h = (document.querySelector('home-assistant') || {}).hass; if (!h) return null;
    var lv = rows(h.states, B.lastC).map(function (r) { return lvOf(r.v); });
    if (!lv.length) return null;
    return { hue: lv.indexOf('crit') > -1 ? 'var(--casora-color-red, #D35A4E)' : lv.indexOf('low') > -1 ? 'var(--casora-color-orange, #DE8A4E)'
      : 'var(--casora-color-green, #6AAE78)', off: false };
  });
  B.build = function (ctx) {
    var UI = window._casoraUI, K = kit();
    if (!UI || !UI.more || !K) return null;
    var states = ctx.states;
    var list = (ctx.batteries || []).filter(function (b) { return b && states[b.id]; });
    if (!list.length) return null;
    var C = { b: list.map(function (b) { return [b.id, b.name, b.icon, b.charge || []]; }) };
    B.lastC = C;
    var ids = list.map(function (b) { return b.id; });
    var chg = [].concat.apply([], list.map(function (b) { return b.charge || []; }));
    var hpOk = typeof window._hpChartCfg === 'function';
    if (hpOk) list.forEach(function (b) { window._hpChartCfg(b.id, b.name, '30d', '#30D158', 140); });
    var f = {};
    f.hero = { card: K.secCard(ids, call('_casoraSoftBat', 'hero', C), states) };
    // Leere Bereiche gar nicht erst anlegen (eine leere Karte kostet sonst einen Rasterabstand).
    var R0 = rows(states, C);
    if (hpOk && R0.length) {
      B.cur = R0[0].id; // zu Beginn die niedrigste Batterie
      f.chart = '<div class="hp-batwrap" data-casora-nodismiss="" style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));'
        + 'border-radius:var(--casora-popup-row-radius, 20px);box-shadow:var(--casora-popup-plate-shadow, none);padding:var(--casora-soft-plate-pad, 14px 10px 6px);">'
        + '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);'
        + 'letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary,#fff));'
        + 'text-align:left;padding:0 6px;display:flex;align-items:baseline;gap:12px;"><span class="hp-ct-t" style="flex:1;min-width:0;">' + esc(window._hpChartTitle(B.cur)) + '</span>'
        /* Decision 3 (variant A): a row picks the chart (no ›), the chosen battery's own page through „Details ›“. */
        + '<span class="hp-det" role="button" data-casora-mi="' + esc(B.cur) + '" style="font-size:var(--casora-fs-sub,13px);font-weight:700;cursor:pointer;'
        + 'color:var(--casora-popup-ui-action, var(--casora-color-teal));white-space:nowrap;"><span>' + esc('Details') + '</span> ›</span></div>'
        + '<div class="hp-chart-slot" style="min-height:150px;margin:6px 0 0;"></div></div>';
      if (typeof window._hpChartInit === 'function') window._hpChartInit(B.cur);
    }
    if (R0.some(function (r) { return lvOf(r.v) !== 'ok'; })) f.low = { card: K.secCard(ids.concat(chg), call('_casoraSoftBat', 'low', C), states) };
    if (R0.some(function (r) { return lvOf(r.v) === 'ok'; })) f.all = { card: K.secCard(ids.concat(chg), call('_casoraSoftBat', 'all', C), states) };
    return K.layout({ fields: f, top: ['hero', 'chart', 'low', 'all'], left: [], right: [] });
  };
  var pctOf = function (states, id) { var n = parseFloat(raw(states, id)); return isNaN(n) ? null : Math.round(n); };
  var charging = function (states, ids) {
    return (ids || []).some(function (id) {
      var v = String(raw(states, id) || '').trim().toLowerCase();
      return id.indexOf('binary_sensor.') === 0 ? v === 'on' : v === 'charging';
    });
  };
  var rows = function (states, C) {
    return C.b.map(function (b) { return { id: b[0], name: b[1], icon: b[2], ch: b[3], v: pctOf(states, b[0]) }; })
      .filter(function (r) { return r.v != null; })
      .sort(function (a, b) { return a.v - b.v; });
  };
  // Raum als Unterzeile (Wunsch 03.10.2026): Bereich der Entität, sonst ihres Geräts.
  var roomOf = function (id) {
    var h = (document.querySelector('home-assistant') || {}).hass; if (!h) return null;
    var e = (h.entities || {})[id]; if (!e) return null;
    var a = e.area_id || (e.device_id && (h.devices || {})[e.device_id] && h.devices[e.device_id].area_id);
    return a && h.areas && h.areas[a] ? h.areas[a].name : null;
  };
  var rowOf = function (states, r) {
    var c = charging(states, r.ch), room = roomOf(r.id);
    // Raum nicht doppelt, wenn er schon im Namen steht („Lecksensor Büro“).
    if (room && String(r.name || '').toLowerCase().indexOf(room.toLowerCase()) >= 0) room = null;
    var sub = [c ? 'Lädt' : null, room].filter(Boolean);
    // Fast leer (≤ 10 %): Symbol + Zahl rot; Schwach (≤ 20 %): orange; lädt: Blitz in Ton wie „Lädt“.
    // OK bleibt ruhig – Zahl ohne Farbe, Gerätesymbol wie gehabt.
    var lv = c ? 'charging' : lvOf(r.v);
    var tone = BAT() ? BAT().tone(lv) : null;
    return { entity: r.id, icon: lv === 'ok' ? (r.icon || 'battery') : BAT() ? BAT().icon(lv, r.v) : 'mdi:battery-low',
      iconTone: lv === 'ok' ? undefined : tone,
      label: r.name, sub: sub.length ? sub.join(' · ') : null, active: c, value: r.v + ' %',
      valueTone: lv === 'charging' ? null : tone, noChev: !noPick };
  };
  var noPick = false;
  // Zeilen schalten das Diagramm um statt More-Info (data-hp-metric wie im Pflanzen-Popup);
  // die gezeigte Batterie (B.cur) bleibt auch nach dem Neuzeichnen der Liste hinterlegt.
  var tapWrap = function (html) {
    if (typeof window._hpPlantTap !== 'function') return html;
    html = html.replace(/data-casora-mi="/g, 'data-hp-metric="');
    if (B.cur) {
      var q = String(B.cur).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp('class="(hui-row[^"]*)"([^>]*data-hp-metric="' + q + '")'), 'class="$1 hp-sel"$2');
    }
    return '<div ontouchstart="window._casoraSoftBat.tap(event,\'s\')" ontouchend="window._casoraSoftBat.tap(event,\'t\')"'
      + ' onclick="window._casoraSoftBat.tap(event,\'c\')">' + html + '</div>';
  };
  (window._casoraPages || (window._casoraPages = {}))['bat-all'] = function () {
    var K = kit(), C = B.lastC, h = (document.querySelector('home-assistant') || {}).hass;
    if (!K || !C || !h || !window.casoraPopup || !window.casoraPopup.sub) return;
    var ids = C.b.map(function (b) { return b[0]; });
    window.casoraPopup.sub({ title: 'Alle Batterien', content: K.layout({ fields: { l: { card: K.secCard(ids, call('_casoraSoftBat', 'list', C), h.states) } }, top: [], left: ['l'], right: [] }) });
  };
  B.tap = function (ev, kind) {
    window._hpPlantTap(ev, kind);
    if (window._hpShown) B.cur = window._hpShown;
  };
  var SEL_CSS = '<style>.hui-row.hp-sel{background:var(--casora-soft-row-selected, var(--casora-lps-seg-on, #FFFDF9)) !important;'
    + 'box-shadow:var(--casora-soft-row-selected-shadow, 0 6px 16px -10px rgba(90,70,50,0.45));}</style>';
  B.sec = function (part, C, states) {
    var UI = window._casoraUI; if (!UI) return '';
    var R = rows(states, C);
    var low = R.filter(function (r) { return lvOf(r.v) !== 'ok'; });
    if (part === 'hero') {
      var min = R[0];
      var crit = low.some(function (r) { return lvOf(r.v) === 'crit'; });
      return UI.line(low.length ? (low.length === 1 ? '1 Akku schwach' : low.length + ' Akkus schwach') : 'Alle Batterien OK',
        min ? ['Am niedrigsten: ' + min.name + ' ' + min.v + ' %'] : [], { tone: low.length ? (crit ? 'bad' : 'warn') : null });
    }
    if (part === 'low') {
      return low.length ? SEL_CSS + tapWrap(UI.group(low.map(function (r) { return rowOf(states, r); }), 'Akku schwach')) : '';
    }
    if (part === 'list') {
      // Sub page „Alle Batterien“: every battery as a row with › onto its own page.
      noPick = true;
      var allHtml = UI.group(R.map(function (r) { return rowOf(states, r); }), null);
      noPick = false;
      return allHtml;
    }
    if (part === 'all') {
      var rest = R.filter(function (r) { return lvOf(r.v) === 'ok'; });
      if (!rest.length) return '';
      /* Blueprint v2 (rule 9): from 12 rows on the first 12 (weakest first) and „Alle (n) ›“ onto a page. */
      var moreRowHtml = '';
      if (R.length > 12) {
        rest = rest.slice(0, Math.max(0, 12 - low.length));
        moreRowHtml = '<div style="height:8px"></div>' + UI.group([{ icon: 'mdi:format-list-bulleted', iconTone: 'rgba(0,0,0,0)',
          label: 'Alle', value: String(R.length), page: 'bat-all' }], null);
        if (!rest.length) return moreRowHtml;
      }
      // Eine Liste über zwei Spalten (schmal eine), nach Prozent sortiert.
      return SEL_CSS + '<style>.hp-batall .hui-plate{display:grid !important;grid-template-columns:repeat(2, minmax(0, 1fr));gap:8px 18px !important;}'
        + '@media (max-width: 760px){.hp-batall .hui-plate{grid-template-columns:minmax(0, 1fr);}}</style>'
        + '<div class="hp-batall">' + tapWrap(UI.group(rest.map(function (r) { return rowOf(states, r); }), low.length ? 'Weitere Geräte' : 'Alle Geräte')) + '</div>' + moreRowHtml;
    }
    return '';
  };

  // ── Software-Updates ──────────────────────────────────────────────────────
  // Unterzeile „KI: alle unkritisch · Backup vor 3 Std.“; links die Liste (nur Name, neue
  // Version, KI-Punkt; „Freigeben“ bleibt über 03-popups sweep), rechts der KI-Check nur
  // bei einer Warnung, sonst unter „Mehr“ – zusammen mit System, Verlauf, Übersprungen.
  var AI = 'sensor.casora_update_ki_analyse';
  // KI-Update-Check aus (zeitplan "off"): wie ohne Sensor, keine KI-Angaben.
  var aiS = function (states) {
    var s = states[AI];
    return s && !(s.attributes && s.attributes.zeitplan === 'off') ? s : null;
  };
  var aiOf = function (states, id) {
    var e = states[id], s = aiS(states);
    var list = (s && s.attributes && s.attributes.analysen) || [];
    for (var i = 0; i < list.length; i++) {
      var it = list[i];
      if (it && it.id === id && e && String(it.to) === String(e.attributes.latest_version)) return it;
    }
    return null;
  };
  var aiKey = function (it) {
    if (!it) return 'none';
    if (it.status === 'running') return 'running';
    if (it.status === 'error') return 'error';
    if ((it.level === 'breaking' || it.level === 'action') && it.ack) return 'info';
    return it.level || 'unknown';
  };
  var AI_TXT = { breaking: ['Breaking', 'bad'], action: ['Handeln', 'warn'], info: ['Unkritisch', 'good'],
    running: ['KI prüft …', null], error: ['KI-Fehler', null], unknown: ['Unklar', null], none: ['Nicht geprüft', null] };
  var pending = function (states) {
    return Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0 && states[id].state === 'on'; })
      .sort(function (a, b) {
        var x = states[a].attributes.friendly_name || a, y = states[b].attributes.friendly_name || b;
        return x.localeCompare(y);
      });
  };
  var warnCount = function (states) {
    var n = 0;
    pending(states).forEach(function (id) { var k = aiKey(aiOf(states, id)); if (k === 'breaking' || k === 'action') n++; });
    return n;
  };
  var U = window._casoraSoftUpd = {};
  U.hasWarn = function (states) { return warnCount(states) > 0; };
  // ctx: { states, hass, C, fields (bisherige Felder des Popups), allIds, restart }
  U.build = function (ctx) {
    var UI = window._casoraUI, K = kit();
    if (!UI || !UI.more || !K) return null;
    var states = ctx.states, C = ctx.C || {}, fl = ctx.fields || {};
    var all = ctx.allIds || [];
    var watchB = [C.backupLast, C.backupState, AI];
    var f = {};
    f.hero = { card: K.secCard(all.concat(watchB), call('_casoraSoftUpd', 'hero', C), states) };
    /* 1.0.5: „Wartet auf Neustart“ steht live im Kopf (sec 'hero'), nicht als eigenes Feld – ein
       leeres Rasterfeld kostete einen Abstand, und beim Öffnen gebaut fehlte es nach der Installation. */
    if (fl.upd) f.upd = fl.upd;
    /* Blueprint v2: nothing to install → an empty row; the search is an action row at the end of the list. */
    f.chk = { card: K.secCard(all, call('_casoraSoftUpd', 'chk', C), states) };
    var warn = U.hasWarn(states);
    if (warn && fl.ai) f.ai = fl.ai;
    var sysIds = (C.system || []).map(function (s) { return s[0]; }).concat(['update.hacs_update', 'update.casora_update', C.backupNext]);
    var Cm = Object.assign({}, C, { aiInMore: !warn });
    f.more = { card: K.secCard(all.concat(watchB, sysIds), call('_casoraSoftUpd', 'more', Cm), states) };
    var lay = K.layout({ fields: f, top: ['hero'], left: ['upd', 'chk'], right: ['ai', 'more'], moveLeft: [] });
    return lay;
  };
  var logoOf = function (states, id) {
    var pic = states[id] && states[id].attributes.entity_picture || null;
    if (pic && pic.indexOf('/api/brands/') === 0) {
      var p = pic.split('?')[0].split('/');
      pic = 'https://brands.home-assistant.io/_/' + p[p.length - 2] + '/' + p[p.length - 1];
    }
    return pic;
  };
  var nameOf = function (states, id) {
    var e = states[id]; if (!e) return id;
    return String(e.attributes.title || e.attributes.friendly_name || id).replace(/\s+(Update|Firmware|Software-Aktualisierung)$/i, '').trim() || id;
  };
  // Symbol rechts startet das Update (mit Rückfrage „Starten“), ein Tipp auf die Zeile öffnet die Details.
  // Nur wenn die Integration installieren kann (UpdateEntityFeature.INSTALL) und gerade nichts läuft.
  var installOf = function (states, id) {
    var st = states[id], a = (st && st.attributes) || {};
    if (!st || a.in_progress || !(Number(a.supported_features || 0) & 1)) return null;
    var D = window._casoraUpdDetail;
    var spec = D && D.installSpec ? D.installSpec(id, st) : { domain: 'update', service: 'install', data: {}, target: { entity_id: id } };
    return Object.assign({}, spec, { done: 'Update gestartet' });
  };
  // Schlanke Zeilen für _casoraUpdX.list: Name, „Neu: x“, KI-Urteil als farbiger Punkt.
  U.rows = function (states, ids) {
    var TEAL = 'var(--casora-color-teal, #00C3D0)';
    return ids.map(function (id) {
      var a = states[id].attributes || {};
      var k = aiKey(aiOf(states, id));
      var t = AI_TXT[k] || AI_TXT.unknown;
      return {
        // logo (1.5): Markenbild im weißen Kreis wie beim Tanken (casora-core.js, Zeilen-Kopf).
        entity: id, iconTone: 'rgba(0,0,0,0)', image: logoOf(states, id), logo: true, label: nameOf(states, id),
        sub: (a.latest_version ? 'Neu: ' + a.latest_version : '') + (aiS(states) ? ' · KI: ' + t[0] : ''),
        _tone: t[1],
        action: a.in_progress ? 'Wird aktualisiert' : 'Aktualisieren', actionTone: 'accent', actionBusy: !!a.in_progress,
        actionIcon: 'mdi:download',
        actionLive: { rules: (window._casoraUpdX && window._casoraUpdX.RULES) || [], text: 'Aktualisieren', icon: 'mdi:download', color: TEAL },
        svc: installOf(states, id), confirm: installOf(states, id) ? 'Starten' : undefined,
      };
    });
  };
  // Färbt „KI: …“ in der Unterzeile (Text kommt escaped aus UI.group).
  U.tint = function (html, rows) {
    var COL = { bad: 'var(--casora-popup-ui-bad, #C8553D)', warn: 'var(--casora-popup-ui-warn, #D9822B)', good: 'var(--casora-popup-ui-good, #3E8E5E)' };
    rows.forEach(function (r) {
      if (!r._tone) return;
      var k = ' · KI: ', i = html.indexOf(esc(r.sub));
      if (i < 0) return;
      var s = esc(r.sub), j = s.indexOf(k);
      html = html.slice(0, i) + s.slice(0, j) + ' · <span style="color:' + COL[r._tone] + ';font-weight:700;">● '
        + s.slice(j + k.length) + '</span>' + html.slice(i + s.length);
    });
    return html;
  };
  U.sec = function (part, C, states, hass) {
    var UI = window._casoraUI; if (!UI) return '';
    var pend = pending(states);
    if (part === 'hero') {
      var n = pend.length;
      var lb = raw(states, C.backupLast), bs = raw(states, C.backupState);
      var backup = bs && ok(bs) && bs !== 'idle' ? 'Backup läuft' : (ok(lb) ? 'Backup ' + ago(lb) : null);
      var busy = pend.filter(function (id) { return states[id].attributes.in_progress; }).length;
      var ki = null;
      if (n && aiS(states)) {
        var c = { breaking: 0, action: 0, info: 0, running: 0, open: 0 };
        pend.forEach(function (id) {
          var k = aiKey(aiOf(states, id));
          if (k === 'breaking') c.breaking++; else if (k === 'action') c.action++; else if (k === 'running') c.running++;
          else if (k === 'info') c.info++; else c.open++;
        });
        ki = c.breaking ? 'KI: ' + (c.breaking === 1 ? '1 Breaking Change' : c.breaking + ' Breaking Changes')
          : c.action ? 'KI: ' + (c.action === 1 ? '1 Update braucht' : c.action + ' Updates brauchen') + ' Aufmerksamkeit'
          : c.running ? 'KI prüft noch …'
          : c.open ? (c.info ? 'KI: ' + c.info + ' von ' + n + ' geprüft' : 'KI-Check steht noch aus')
          : 'KI: ' + (n === 1 ? 'unkritisch' : 'alle unkritisch');
      }
      var X0 = window._casoraUpdX;
      // Nothing left to install but a restart is owed: that is not "all up to date".
      var restartOnly = !n && X0 && X0.restartIds && X0.restartIds(states).length > 0;
      var head = n === 0 ? (restartOnly ? 'Neustart ausstehend' : 'Alles aktuell') : n === 1 ? '1 Update verfügbar' : n + ' Updates verfügbar';
      var rest = X0 && X0.restart ? X0.restart(states, { UI: UI, headOut: function (t) { return UI.label(t); },
        logoOf: function (id) { return logoOf(states, id); } }) : '';
      // „Jetzt nach Updates suchen“ is the action row at the end of the list (part 'chk', blueprint v2).
      var chk = '';
      return UI.line(head, [busy ? (busy === 1 ? 'Wird installiert' : busy + ' werden installiert') : null, ki, backup],
        { tone: n ? null : restartOnly ? 'warn' : 'good' }) + chk + (rest ? '<div style="text-align:left;">' + rest + '</div>' : '');
    }
    if (part === 'chk') {
      var none = !pend.length && !(window._casoraUpdX && window._casoraUpdX.restartIds && window._casoraUpdX.restartIds(states).length);
      return (none && UI.empty ? UI.empty({ icon: 'mdi:check-circle-outline', text: 'Keine offenen Updates', sub: 'Neue Versionen erscheinen hier' })
        + '<div style="height:8px"></div>' : '')
        + (window._casoraUpdCheck ? window._casoraUpdCheck.html('row') : '');
    }
    if (part === 'more') {
      var X = window._casoraUpdX, secs = [];
      var h = { UI: UI, C: C, logoOf: function (id) { return logoOf(states, id); }, nameOf: function (id) { return nameOf(states, id); }, ago: ago,
        headOut: function (t) { return UI.label(t); } };
      if (C.aiInMore && pend.length && window._casoraUpdAi) {
        var a = window._casoraUpdAi(states, { headOut: h.headOut, logoOf: h.logoOf, nameOf: h.nameOf });
        if (a) secs.push('<div>' + a + '</div>');
      }
      if (X && X.skip) { var sk = X.skip(states, h); if (sk) secs.push('<div>' + sk + '</div>'); }
      if (X && X.sys) secs.push('<div>' + X.sys(states, Object.assign({}, h, { states: states })) + '</div>');
      if (X && X.hist) secs.push('<div>' + X.hist(states, hass, h) + '</div>');
      return secs.length ? UI.more('upd', secs.map(function (x) { return '<div>' + x + '</div>'; }).join(''), { count: secs.length }) : '';
    }
    return '';
  };

  // ── Alarm: Modus-Liste ────────────────────────────────────────────────────
  // Ohne „Aktiv“-Etikett: die aktive Zeile ist hell hinterlegt (r.selected), live über das
  // Vorlagenfeld (triggers_update der Inhaltskarte).
  window._casoraSoftAlarm = function (ent, modes, states) {
    // Weich-Bedienung des Alarm-Popups steht in 07-weich-spezial.js (window._casoraAlarmSoft).
    if (window._casoraAlarmSoft && window._casoraAlarmSoft.modes) return window._casoraAlarmSoft.modes(ent, modes, states);
    var UI = window._casoraUI; if (!UI) return '';
    var st = raw(states, ent);
    return UI.group(modes.map(function (m) {
      var on = st === m.id;
      // Symbol des Modus wie Alarm-Kachel, Badge und Mitteilungen (05.10.2026); nur der aktive Modus
      // trägt die Stufenfarbe „ok“, die übrigen sind Auswahl (Sand) statt Petrol.
      return { icon: m.icon, iconTone: on ? 'good' : 'rgba(0,0,0,0)', label: m.label, sub: m.description,
        selected: on, svc: { domain: 'alarm_control_panel', service: 'alarm_' + m.id.replace('armed_', 'arm_'), data: { entity_id: ent } } };
    }), 'Modus');
  };

  // ── Schloss: waagrechter Schalter mit Bezeichnung ─────────────────────────
  // Wie die Helligkeits-Leiste im Licht-Popup: Etikett darüber, eine breite Pille mit
  // Zustand links und Schalter rechts. Die ganze Karte schaltet (tap_action der Vorlage).
  window._casoraSoftLock = function (s, one) {
    var on = s === 'locked' || s === 'locking';
    // Zeile hervorgehoben, wenn entriegelt (wie die Kachel, Badge „1 entriegelt“). Der Schalter selbst
    // folgt dem Zustandswort: an = verriegelt (Nutzertest 06.10.2026: „Verriegelt“ mit Schalter aus wirkte verkehrt).
    // Offline: weder „Entriegelt“ noch hervorgehoben, kein Tipp-Hinweis.
    var gone = s === 'unavailable';
    var open = !on && !gone;
    var busy = s === 'locking' || s === 'unlocking';
    var word = gone ? 'Offline' : s === 'locking' ? 'Wird verriegelt …' : s === 'unlocking' ? 'Wird entriegelt …' : on ? 'Verriegelt' : 'Entriegelt';
    var hint = busy || gone ? '' : on ? (one ? 'Tippen zum Entriegeln' : 'Tippen, um alle zu entriegeln') : (one ? 'Tippen zum Verriegeln' : 'Tippen, um alle zu verriegeln');
    var ic = (typeof window.casoraIconUrl === 'function') ? window.casoraIconUrl(on ? 'lock-fill' : 'lock-open-fill') : '';
    var lkHue = 'var(--casora-lock-unlocked-color, var(--casora-lps-switch-on, #B67A50))';
    return '<div class="lkbar" role="switch" aria-checked="' + on + '" style="display:flex;align-items:center;gap:12px;min-height:var(--casora-soft-row-h, 60px);box-sizing:border-box;'
      /* D-06: eine Zeilenart – entriegelt (aktiv) hell und erhoben wie die aktive Geräte-Zeile darunter, sonst Sand.
         1.3: Token der aktiven Zeile (DP-07), Symbol-Kachel 36/r12 mit 12 px Rand (DP-16), Symbolfarbe nach Kontrast. */
      + 'padding:var(--casora-soft-row-pad, 12px 16px 12px 12px);border-radius:var(--casora-popup-row-radius, 24px);background:'
      + (open ? 'var(--casora-soft-row-active, var(--casora-entity-background-active, #FFFDF9));box-shadow:var(--casora-soft-row-active-shadow, var(--button-card-box-shadow-active-mobile, none));'
        : 'var(--casora-soft-row-fill, rgba(140,115,90,0.07));')
      + 'font-family:var(--primary-font-family, system-ui);text-align:left;line-height:normal;cursor:pointer;">'
      + '<div style="width:var(--casora-soft-icon-size, 38px);height:var(--casora-soft-icon-size, 38px);border-radius:var(--casora-soft-icon-radius, 50%);flex:none;display:grid;place-items:center;background:'
      + (open ? lkHue : 'var(--casora-soft-icon-off, rgba(140,115,90,0.12))') + ';">'
      + '<div style="width:19px;height:19px;background-color:' + (open ? ((window._casoraInkOn && window._casoraInkOn(lkHue)) || '#fff') : 'var(--casora-soft-glyph-off, rgba(58,50,43,0.55))') + ';'
      + "-webkit-mask:url('" + ic + "') center / contain no-repeat;mask:url('" + ic + "') center / contain no-repeat;"
      + (busy ? 'animation:lktg-pl 1.2s ease-in-out infinite;' : '') + '"></div></div>'
      /* Schrift der aktiven Zeile aus dem Token (DP-07: im Dunkeln helle Schrift auf Sand 14 %). */
      + '<div style="flex:1;min-width:0;"><div style="font-size:var(--casora-soft-row-fs, 14.5px);font-weight:700;letter-spacing:-0.01em;color:'
      + (open ? 'var(--casora-soft-row-active-ink, var(--casora-entity-name-active, #3A322B))' : 'var(--casora-popup-tiles-text-primary, #3A322B)') + ';">' + esc(word) + '</div>'
      + (hint ? '<div style="font-size:var(--casora-soft-sub-fs, 12.5px);font-weight:500;color:' + (open ? 'var(--casora-soft-row-active-sub, var(--casora-entity-state-active-color, rgba(58,50,43,0.6)))' : 'var(--casora-soft-sub, rgba(58,50,43,0.6))')
        + ';margin-top:1px;">' + esc(hint) + '</div>' : '') + '</div>'
      + '<div style="position:relative;width:44px;height:26px;border-radius:999px;flex:none;background:'
      // 1.3: Schalter wie alle Popup-Schalter (Gerätefarbe, Aus-Spur aus dem Theme – die aktive Zeile ist im Dunkeln nicht mehr hell).
      + (on ? 'var(--casora-sw-on, var(--casora-lps-switch-on, #B67A50))' : 'var(--casora-sw-off, rgba(58,50,43,0.38))') + ';transition:background .2s ease;">'
      + '<div style="position:absolute;top:3px;left:' + (on ? '21px' : '3px') + ';width:20px;height:20px;border-radius:50%;'
      + 'background:var(--casora-lps-knob, #fff);box-shadow:0 1px 3px rgba(0,0,0,0.2);transition:left .2s ease;"></div></div></div>'
      + '<style>@keyframes lktg-pl{0%,100%{opacity:1}50%{opacity:.35}}@media (hover:hover){.lkbar[aria-checked="true"]:hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11)) !important;}}</style>';
  };
})();
