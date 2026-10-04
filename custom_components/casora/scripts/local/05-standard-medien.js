// ── Lüften-Kachel + Popup + Lüftungs-Coach (24.09.2026) ──────────────────────
// Daten: sensor.casora_lueften (Integration, raumklima.py; früher eigenes Paket
// sensor.hemma_lueften – wird genommen, solange es ihn gibt), Attribut rooms je
// Raum mit status/grund/Werten, aussen; dazu sensor.casora_lueftungs_coach
// (KI, wöchentlich). Templates casora_vent/casora_popup_vent rufen nur
// window._casoraVent.tile()/level()/popup() auf. Die Home-Kachel erscheint nur,
// solange binary_sensor.casora_lueften_hinweis an ist (jetzt lüften/schließen).
(function () {
  if (window._casoraVent) return;
  var V = window._casoraVent = {};
  var COACH = 'sensor.casora_lueftungs_coach';
  var OLD = 'sensor.hemma_lueften', NEW = 'sensor.casora_lueften';
  V.sensor = function (states) { return states && states[OLD] && !states[NEW] ? OLD : NEW; };
  V.hint = function (states) { return V.sensor(states) === OLD ? 'binary_sensor.hemma_lueften_hinweis' : 'binary_sensor.casora_lueften_hinweis'; };
  var fmt = function (n, d) { return Number(n).toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); };
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ago = function (ts) {
    var t = Date.parse(ts); if (isNaN(t)) return '';
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.';
  };
  /* Status → Text, Ton, Rang (höher = dringender) */
  var ST = {
    schliessen: { t: 'Fenster schließen', tone: 'warn', r: 6 },
    jetzt: { t: 'Jetzt lüften', tone: 'warn', r: 5 },
    draussen: { t: 'Außenluft belastet', tone: 'bad', r: 4 },
    bald: { t: 'Bald lüften', tone: 'accent', r: 3 },
    feucht: { t: 'Zu feucht', tone: 'warn', r: 2 },
    lueftet: { t: 'Lüftet', tone: 'good', r: 1 },
    ok: { t: 'Gut', tone: null, r: 0 },
  };
  V.read = function (states) {
    var s = states[V.sensor(states)], a = (s && s.attributes) || {};
    var rooms = (a.rooms || []).slice().sort(function (x, y) { return (ST[y.status] || ST.ok).r - (ST[x.status] || ST.ok).r; });
    return { rooms: rooms, out: a.aussen || {}, coach: states[COACH] };
  };
  /* 0 = gut, 1 = jetzt lüften, 2 = Fenster schließen */
  V.level = function (states) {
    var r = V.read(states);
    if (r.rooms.some(function (x) { return x.status === 'schliessen'; })) return 2;
    if (r.rooms.some(function (x) { return x.status === 'jetzt'; })) return 1;
    return 0;
  };
  V.color = function (states) {
    var lv = V.level(states);
    return lv === 2 ? 'var(--casora-color-orange, #FF9F0A)' : lv === 1 ? 'var(--casora-color-blue, #0A84FF)' : 'var(--casora-color-teal, #00C3D0)';
  };
  V.tile = function (states) {
    var r = V.read(states);
    var cl = r.rooms.filter(function (x) { return x.status === 'schliessen'; });
    var now = r.rooms.filter(function (x) { return x.status === 'jetzt'; });
    /* Titel ist fest "Raumklima", Status = welcher Raum (was zu tun ist, zeigen Farbe + Popup).
       Priorität schließen > lüften > lüftet; ab 3 Räumen nur die Anzahl, sonst schrumpft casoraStateFit die Schrift. */
    var l = cl.length ? cl : now.length ? now : r.rooms.filter(function (x) { return x.status === 'lueftet'; });
    if (!l.length) return 'Luft gut';
    return l.length <= 2 ? l.map(function (x) { return x.n; }).join(', ') : l.length + ' Räume';
  };
  /* Messwerte der Zeile; was der Grund schon nennt (CO₂/Feuchte), nicht doppelt. */
  var vals = function (x) {
    var g = x.grund || '';
    return [x.rh != null && g.indexOf('Feuchte') < 0 ? fmt(x.rh) + ' %' : null,
      x.co2 != null && g.indexOf('CO₂') < 0 ? 'CO₂ ' + x.co2 + ' ppm' : null,
      x.t != null ? fmt(x.t, 1) + ' °C' : null].filter(Boolean).join(' · ');
  };
  var coachHtml = function (s, room) {
    var T = (window._casoraUI && window._casoraUI.tokens) || { ink: '#fff', ink2: 'rgba(255,255,255,0.7)', ink3: 'rgba(255,255,255,0.45)', font: 'system-ui' };
    var a = (s && s.attributes) || {};
    var running = a.status === 'running', has = !!a.fazit;
    var ZT = { gut: ['Gut', 'var(--casora-popup-ui-good, #30D158)', 'rgba(48,209,88,0.16)'], beobachten: ['Beobachten', 'var(--casora-popup-ui-warn, #FF9F0A)', 'rgba(255,159,10,0.16)'], handeln: ['Handeln', 'var(--casora-popup-ui-bad, #FF453A)', 'rgba(255,69,58,0.16)'] };
    /* Raum-Coach (24.09.2026): im Raum-Popup nur die Zeile dieses Raums aus attributes.raeume. */
    var re = null;
    if (room) (a.raeume || []).forEach(function (x) { if (x && x.n === room) re = x; });
    var z = ZT[room ? (re && re.zustand) : a.zustand];
    var body;
    if (running) body = '<div style="font-size:15px;color:' + T.ink + ';">Claude wertet die letzte Woche aus …</div>';
    else if (!has) body = '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink2 + ';white-space:normal;">Claude wertet einmal pro Woche (samstags 10 Uhr) Feuchte, CO₂ und Fensterzeiten aus und sagt, wo, wann und wie lange sich Lüften lohnt.</div>';
    else if (room && !re) body = '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink2 + ';white-space:normal;">Für ' + esc(room) + ' gibt es noch keine eigene Auswertung. „Neu auswerten“ erstellt sie für alle Räume.</div>';
    else if (room) body = (z ? '<div style="display:inline-flex;padding:5px 11px;border-radius:999px;background:' + z[2] + ';margin-bottom:10px;font-size:13px;font-weight:700;color:' + z[1] + ';">' + z[0] + '</div>' : '')
      + '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink + ';white-space:normal;">' + esc(re.fazit) + '</div>'
      + (re.tipp && !/^[\s\-–—.]*$/.test(re.tipp) ? '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + T.ink3 + ';margin:12px 0 3px;">Tipp</div>'
        + '<div style="font-size:13.5px;line-height:1.5;color:' + T.ink + ';white-space:normal;">' + esc(re.tipp) + '</div>' : '');
    else body = (z ? '<div style="display:inline-flex;padding:5px 11px;border-radius:999px;background:' + z[2] + ';margin-bottom:10px;font-size:13px;font-weight:700;color:' + z[1] + ';">' + z[0] + '</div>' : '')
      + '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink + ';white-space:normal;">' + esc(a.fazit) + '</div>'
      + ((a.erkenntnisse || []).length ? '<ul style="margin:10px 0 0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink2 + ';white-space:normal;">' + a.erkenntnisse.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '')
      + ((a.tipps || []).length ? '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + T.ink3 + ';margin:12px 0 3px;">Tipps</div>'
        + '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink + ';white-space:normal;">' + a.tipps.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>' : '');
    var svc = ' data-casora-svc="' + esc(JSON.stringify(window.casoraSvc('casora_lueftungs_coach'))) + '"';
    var btn = running ? '' : '<span' + svc + ' style="display:inline-flex;cursor:pointer;font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;margin-top:14px;'
      + (has ? 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));' : 'color:#000;background:var(--casora-color-teal, #00C3D0);') + '">'
      + (has ? 'Neu auswerten' : 'Jetzt auswerten') + '</span>';
    /* Weich (01.10.2026): KI-Karte mit Etikett und rundem Knopf aus den Bausteinen. */
    var kc = window._casoraUI && window._casoraUI.kiCard && window._casoraUI.kiCard({
      title: 'Lüftungs-Coach' + (room ? ' · ' + room : ''), body: body,
      foot: has && !running && a.erstellt ? 'Auswertung der letzten 7 Tage · ' + ago(a.erstellt) : '',
      btnSvc: svc, btnText: running ? '' : (has ? 'Neu auswerten' : 'Jetzt auswerten'), primary: !has });
    if (kc) return kc;
    var ic = '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 16px;width:16px;height:16px;">'
      + '<ha-icon icon="mdi:creation" style="--mdc-icon-size:16px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:0;color:var(--casora-color-teal, #00C3D0);"></ha-icon></span>';
    return '<div style="font-family:' + T.font + ';text-align:left;">'
      + '<div style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);padding:16px 18px;'
      + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);">'
      + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 0 10px;display:flex;align-items:center;justify-content:flex-start;gap:6px;">'
      + ic + '<span style="flex:1 1 auto;text-align:left;">Lüftungs-Coach' + (room ? ' · ' + esc(room) : '') + '</span></div>'
      + body + (has && !running && a.erstellt ? '<div style="font-size:12px;color:' + T.ink3 + ';margin-top:10px;">Auswertung der letzten 7 Tage · ' + ago(a.erstellt) + '</div>' : '')
      + btn + '</div></div>';
  };

  V.sec = function (name, states) {
    var UI = window._casoraUI; if (!UI) return '';
    /* Raumzeilen: Grund und Messwerte als eigene sub-Teile (UI.group rendert sie inline-block),
       damit die Messwerte in die nächste Zeile rutschen statt mit … abgeschnitten zu werden. */
    var r = V.read(states), o = r.out;
    var avgAh = (function () { var l = r.rooms.filter(function (x) { return x.ah != null; }); return l.length ? l.reduce(function (s, x) { return s + x.ah; }, 0) / l.length : null; })();
    var helps = o.ah != null && avgAh != null ? o.ah < avgAh - 0.5 : null;
    if (name === 'hero') {
      var lv = V.level(states);
      var need = r.rooms.filter(function (x) { return x.status === 'jetzt' || x.status === 'schliessen'; });
      var value = lv === 2 ? 'Schließen' : lv === 1 ? 'Lüften' : 'Gut';
      var sub = need.length ? (need.length <= 2 ? need.map(function (x) { return x.n; }).join(', ') : need.length + ' Räume')
        : (helps === true ? 'Außenluft ist trockener' : helps === false ? 'Außenluft ist feuchter' : null);
      /* Kurz halten: die Hero-Unterzeile bricht nicht um und wird auf dem Handy sonst beidseitig abgeschnitten.
         "Feuchter draußen" ist kein Grün-Zustand → neutral. */
      /* Weich (Entschlacken): „Raumluft gut“ als eine Aussage, ohne Etikett darüber. */
      if (window._casoraHH && window._casoraHH.on()) value = lv === 2 ? 'Fenster schließen' : lv === 1 ? 'Lüften empfohlen' : 'Raumluft gut';
      return UI.hero({ label: window._casoraHH && window._casoraHH.on() ? null : 'Raumluft', value: value, sub: sub, subTone: lv ? 'warn' : helps === false ? null : 'good', center: true });
    }
    if (name === 'rooms') {
      var rows = r.rooms.map(function (x) {
        var st = ST[x.status] || ST.ok;
        var icon = x.fenster ? 'mdi:window-open-variant' : x.fenster === false ? 'mdi:window-closed-variant' : 'mdi:home-thermometer-outline';
        var tone = st.tone || 'rgba(255,255,255,0.18)';
        return { icon: icon, iconTone: tone, label: x.n, sub: [x.grund || null, vals(x) || null].filter(Boolean), value: st.t, valueTone: st.tone === 'accent' ? null : st.tone,
          /* Weich: Raum mit Handlungsbedarf (lüften, schließen, zu feucht) oder der gerade lüftet als aktive Zeile. */
          active: ['schliessen', 'jetzt', 'feucht', 'lueftet'].indexOf(x.status) > -1 };
      });
      return rows.length ? UI.group(rows, 'Räume') : '';
    }
    if (name === 'out') {
      var rows2 = [];
      if (o.t != null) rows2.push({ icon: 'mdi:thermometer', iconTone: 'rgba(255,255,255,0.18)', label: 'Temperatur', value: fmt(o.t, 1) + ' °C' });
      /* Weich (Entschlacken): ohne absolute Feuchte (g/m³); „hilft nicht“ nur, wenn es zutrifft. */
      var SFv = window._casoraHH && window._casoraHH.on();
      if (o.rh != null && SFv) rows2.push({ icon: 'mdi:water-percent', iconTone: 'rgba(255,255,255,0.18)', label: 'Luftfeuchtigkeit', value: fmt(o.rh) + ' %' });
      else if (o.rh != null) rows2.push({ icon: 'mdi:water-percent', iconTone: 'rgba(255,255,255,0.18)', label: 'Luftfeuchtigkeit', sub: o.ah != null ? [fmt(o.ah, 1) + ' g/m³ absolut'].concat(avgAh != null ? ['drinnen Ø ' + fmt(avgAh, 1)] : []) : null, value: fmt(o.rh) + ' %' });
      if (o.pm25 != null) rows2.push({ icon: 'mdi:blur', iconTone: o.pm25 >= 35 ? 'bad' : 'rgba(255,255,255,0.18)', label: 'Feinstaub PM2.5', value: fmt(o.pm25) + ' µg/m³', valueTone: o.pm25 >= 35 ? 'bad' : null });
      var ziel = (r.rooms[0] && r.rooms[0].ziel_min) || null;
      if (ziel) rows2.push({ icon: 'mdi:timer-outline', iconTone: 'accent', label: 'Stoßlüften', sub: 'Fenster weit auf, nach Außentemperatur', value: 'ca. ' + ziel + ' Min.' });
      if (helps != null && !(SFv && helps)) rows2.push({ icon: helps ? 'mdi:check-circle' : 'mdi:close-circle', iconTone: helps ? 'good' : 'warn', label: helps ? 'Lüften hilft gegen Feuchte' : 'Lüften hilft nicht gegen Feuchte', sub: helps ? 'Außenluft ist trockener' : 'Außenluft enthält mehr Wasser' });
      return rows2.length ? UI.group(rows2, 'Außenluft') : '';
    }
    if (name === 'coach') return coachHtml(r.coach);
    return '';
  };

  /* Coach auch im Klima-Popup der Home-Badges (Temperatur/Feuchte/Luftqualität):
     casora_climate_popup setzt <div class="casora-vent-coach"> (seit 24.09. Zuhause UND Räume; früher nicht in
     Raum-Popups); solange ein Popup offen ist, hier live nachführen. */
  V.ROOMS = ['Wohnzimmer', 'Küche', 'Büro', 'Schlafzimmer', 'Badezimmer', 'Flur', 'Waschküche', 'Terrasse'];
  V.climateSlot = function (roomName, states) {
    /* 24.09.2026: Coach auch in den Raum-Klima-Popups – dort die Auswertung dieses Raums, im Zuhause-Popup die Hausauswertung. */
    var rn = String(roomName || '');
    if (V.ROOMS.indexOf(rn) >= 0) return '<div class="casora-vent-coach" data-room="' + esc(rn) + '">' + coachHtml(states[COACH], rn) + '</div>';
    return '<div class="casora-vent-coach">' + coachHtml(states[COACH]) + '</div>';
  };
  var deep = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, sel, out); });
    return out;
  };
  setInterval(function () {
    var P = window.casoraPopup, el = P && P.element;
    if (!el || !el.isConnected) return;
    var ha = document.querySelector('home-assistant'); var hass = ha && ha.hass; if (!hass) return;
    var s = hass.states[COACH]; if (!s) return;
    var key = s.attributes.status + '|' + s.attributes.erstellt + '|' + s.last_updated + '|' + Math.floor(Date.now() / 60000);
    deep(el.shadowRoot || el, '.casora-vent-coach', []).forEach(function (box) {
      if (box._k === undefined) { box._k = key; return; }
      if (box._k !== key) { box._k = key; box.innerHTML = (window.casoraTr || function (x) { return x; })(coachHtml(s, box.getAttribute('data-room') || undefined)); }
    });
  }, 1000);

  V.popup = function (entity, variables, states) {
    if (!window._casoraUI) return { type: 'vertical-stack', cards: [] };
    /* Ohne feste Entität: der Lüften-Sensor ist der Anker (sonst leeres Popup). */
    if (!entity || !entity.entity_id) entity = { entity_id: V.sensor(states) };
    var watch = [V.sensor(states), COACH];
    var sec = function (n) { return '[[[ return window._casoraVent ? window._casoraVent.sec(' + JSON.stringify(n) + ', states) : ""; ]]]'; };
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
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, 20px) !important; } }',
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': '"hero" "left" "right"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: { hero: [{ 'justify-self': 'stretch' }], left: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }], right: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }] },
      },
      custom_fields: (function () { var sp = window._casoraSplit ? window._casoraSplit('vent', ['rooms'], ['out', 'coach']) : { left: ['rooms'], right: ['out', 'coach'] };
        return { hero: sec('hero'), left: { card: makeCol(sp.left) }, right: { card: makeCol(sp.right) } }; })(),
    };
  };
})();

// ── Popup-Standard-Layout (24.09.2026) ─────────────────────────────────────
// Einheitlicher Aufbau aller Casora-Popups (Vorgabe): ab 761 px oben
// Hero mittig (+ optional Modus-Tasten), dann Diagramm/Kamera volle Breite,
// darunter zwei Spalten – links Bedienung, rechts Infos. Schmal einspaltig in
// derselben Reihenfolge. Nimmt die fertige ui-Karte eines Popups (button-card
// mit custom_fields) und ordnet deren Felder nur neu an:
//   window._casoraStdLayout(uiCard, { top: ['hero'], full: ['chart'], left: [...], right: [...] })
// Nicht zugeordnete Felder landen rechts. Hat nur eine Seite Inhalt, wird sie
// auf beide Spalten verteilt (balance), damit nichts halb leer wirkt.
window._casoraStdLayout = function (ui, o) {
  o = o || {};
  var f = ui.custom_fields || {}, st = (ui.styles && ui.styles.custom_fields) || {};
  var has = function (k) { return f[k] !== undefined && f[k] !== null && f[k] !== ''; };
  var top = (o.top || ['hero']).filter(has), full = (o.full || []).filter(has);
  var L = (o.left || []).filter(has), R = (o.right || []).filter(has);
  Object.keys(f).forEach(function (k) { if (has(k) && top.indexOf(k) < 0 && full.indexOf(k) < 0 && L.indexOf(k) < 0 && R.indexOf(k) < 0) R.push(k); });
  /* o.single: alles unter dem Hero in EINER mittigen Spalte (z. B. einzelne Jalousie, 24.09.). */
  if (o.single) { L = L.concat(R); R = []; }
  if (!o.single && o.balance !== false && !L.length && R.length > 1) { L = R.slice(0, Math.ceil(R.length / 2)); R = R.slice(L.length); }
  if (!o.single && o.balance !== false && !R.length && L.length > 1) { R = L.slice(Math.ceil(L.length / 2)); L = L.slice(0, L.length - R.length); }
  /* Spalten nach gemessener Höhe ausgleichen (25.09.2026). */
  if (!o.single && L.length && R.length && window._casoraSplit) { var sp0 = window._casoraSplit(o.id || ('std:' + L.concat(R).join(',')), L, R, { pinRight: o.pinRight }); L = sp0.left; R = sp0.right; }
  var pick = function (src, keys) { var r = {}; keys.forEach(function (k) { if (src[k] !== undefined) r[k] = src[k]; }); return r; };
  var colStyle = ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }'
    + '\nha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; will-change: auto !important; pointer-events: auto !important; }'
    + '\nha-card::before, ha-card::after, #container::before, #container::after { display: none !important; }'
    + '\nha-card:hover { box-shadow: none !important; }\nha-ripple { display: none !important; }';
  var col = function (keys) {
    var cs = pick(st, keys);
    keys.forEach(function (k) { if (!cs[k]) cs[k] = [{ 'justify-self': 'stretch' }]; });
    return {
      type: 'custom:button-card', entity: ui.entity, triggers_update: ui.triggers_update, variables: ui.variables,
      tap_action: { action: 'none' }, hold_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      card_mod: { style: colStyle },
      extra_styles: (window._casoraColGap ? window._casoraColGap(keys) : '') + (ui.extra_styles_col || ''),
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
        grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
               { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }, { 'align-content': 'start' }],
        custom_fields: cs,
      },
      custom_fields: pick(f, keys),
    };
  };
  var outF = {}, outS = {}, narrow = [], wide = [];
  var center = o.center || [];
  top.concat(full).forEach(function (k) {
    outF[k] = f[k];
    outS[k] = center.indexOf(k) > -1 ? [{ 'justify-self': 'center' }] : (st[k] || [{ 'justify-self': 'stretch' }]);
    narrow.push('"' + k + '"'); wide.push('"' + k + ' ' + k + '"');
  });
  var colS = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
  /* Nur eine Seite mit genau einem Block (z. B. eine einzelne Liste): mittig mit Lesebreite statt auf 900 px gezogen. */
  /* Ein Raster (01.10.2026): steht darüber ein Block in voller Breite (Diagramm), nimmt die
     Spalte dieselbe Breite – keine schmalere Mittelspalte unter einem breiten Diagramm. */
  if ((o.single || (L.length + R.length) === 1) && !full.length) colS = [{ 'justify-self': 'center' }, { 'align-self': 'start' }, { width: '100%' }, { 'max-width': '560px' }, { 'min-width': '0' }];
  if (L.length) { outF.left = { card: col(L) }; outS.left = colS; narrow.push('"left"'); }
  if (R.length) { outF.right = { card: col(R) }; outS.right = colS; narrow.push('"right"'); }
  if (L.length || R.length) wide.push('"' + (L.length ? 'left' : 'right') + ' ' + (R.length ? 'right' : 'left') + '"');
  var styles = Object.assign({}, ui.styles || {});
  styles.grid = [{ 'grid-template-areas': narrow.join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
                 { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }, { 'align-items': 'start' }];
  styles.custom_fields = outS;
  var out = Object.assign({}, ui, { styles: styles, custom_fields: outF });
  /* Weich (01.10.2026): Spalten wie im Entwurf etwas weiter auseinander. */
  var cGap = (window._casoraSoft && window._casoraSoft()) ? 26 : 20;
  out.extra_styles = (ui.extra_styles || '') + ' @media (min-width: 761px) { #container { grid-template-areas: ' + wide.join(' ')
    + ' !important; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, ' + cGap + 'px) !important; } }';
  return out;
};
// Nur ab 761 px umbauen – Mobile behält seinen eigenen einspaltigen Aufbau unverändert.
window._casoraStd = function (ui, o) {
  return (typeof window !== 'undefined' && window.innerWidth > 760 && window._casoraStdLayout) ? window._casoraStdLayout(ui, o) : ui;
};

// ── Popup-Standard: Abschnittsüberschriften (24.09.2026) ────────────────────
// In INFO-Popups (ohne Fläche, einzelne Glasplatten) steht die
// Überschrift IN der Karte wie beim Netzwerk; in BEDIEN-Popups (Sheet) DARÜBER.
// Der Inhalt wird oft schon beim Antippen gebaut, bevor das Popup offen ist –
// deshalb liefert UI.group beide Varianten, und der Popup-Stil schaltet per
// CSS-Variable um: Info-popup_styles setzen --casora-lbl-in: block und
// --casora-lbl-out: none; ohne Angabe (Sheets) bleibt die Überschrift außen.
// Unverändert: Gruppen mit Kopf-Aktion (labelAction) und explizitem labelInside.
(function () {
  var wrap = function () {
    var UI = window._casoraUI;
    if (!UI || UI._casoraLabelInside) return;
    var orig = UI.group, T = UI.tokens || {};
    var IN = '<div style="padding:var(--casora-popup-row-pad-y, 8px)';
    UI.group = function (rows, label, labelAction, opts) {
      if (!label || (labelAction && labelAction.text) || (opts && opts.labelInside !== undefined)) {
        return orig.call(this, rows, label, labelAction, opts);
      }
      var html = orig.call(this, rows, label, null, Object.assign({}, opts || {}, { labelInside: true }));
      var k = html.indexOf(IN);
      if (k < 0) return orig.call(this, rows, label, labelAction, opts);
      html = html.slice(0, k) + '<div style="display:var(--casora-lbl-in, none);' + html.slice(k + 12);
      var esc = UI.esc || function (x) { return x; };
      return '<div style="display:var(--casora-lbl-out, flex);align-items:baseline;justify-content:space-between;gap:12px;padding:0 4px 8px;">'
        + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + (T.ink || '#fff') + ');">' + esc(label) + '</div></div>' + html;
    };
    UI._casoraLabelInside = true;
  };
  wrap();
  setInterval(wrap, 1500);
})();

// ── Apple Music öffnen (Medien-Popups, 24.09.2026) ───────────────────────────
// Zeile mit data-casora-music="1" in der Einstellungen-Karte. Inline-Handler kommen im
// Popup nicht an (Popup fängt Klicks in der Capture-Phase ab) – daher eigene
// Capture-Listener auf window wie beim Release-Notes-Link (touchend ohne Wischen + click).
// iPhone/iPad (auch HA-App): music:// öffnet die Musik-App; sonst music.apple.com.
(function () {
  if (window._casoraMusicBound) return;
  window._casoraMusicBound = true;
  var find = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) { var n = p[i]; if (n && n.getAttribute && n.getAttribute('data-casora-music')) return n; }
    return null;
  };
  var open = function () {
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /Home ?Assistant\/iOS/i.test(ua);
    /* HA-iOS-App blockiert location.href auf fremde Schemata, reicht window.open-Ziele aber an iOS weiter.
       Fallback: klappt der Sprung nicht (Seite bleibt sichtbar), nach 1,2 s zusätzlich location.href. */
    if (ios) {
      var w = null; try { w = window.open('music://', '_blank'); } catch (e) {}
      setTimeout(function () { if (!document.hidden && !w) { try { window.location.href = 'music://'; } catch (e) {} } }, 1200);
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      /* Mac: music:// öffnet die Musik-App direkt (Browser fragt beim ersten Mal nach). */
      window.location.href = 'music://';
    } else window.open('https://music.apple.com/', '_blank', 'noopener');
  };
  var st = null, last = 0;
  window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; st = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    if (!find(ev)) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (st && t && (Math.abs(t.clientX - st.x) > 10 || Math.abs(t.clientY - st.y) > 10)) return;
    last = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); open();
  }, true);
  window.addEventListener('click', function (ev) {
    if (!find(ev)) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - last < 700) return;
    open();
  }, true);
})();

// ── Diagramm mit mehreren Kurven zum Ein-/Ausblenden (Wetter, 24.09.2026) ────
// _hpMulti.build(key, [[eid, kurzname], …], sel) legt unter key eine kombinierte
// apexcharts-Konfiguration an (aus den Einzel-Configs von _hpChartCfg), jede Kurve
// mit eigener Skala (Temperatur/Feuchte/Druck haben verschiedene Maßstäbe).
// Pillen mit data-hp-multi="key|eid" + _hpMultiTap schalten Kurven an/aus.
window._hpMulti = window._hpMulti || { sel: {}, names: {} };
window._hpMulti.build = function (key, list, sel) {
  var M = window._hpMulti, C = window._hpPlantCfg || {};
  list = list.filter(function (m) { return C[m[0]]; });
  if (!list.length) return null;
  M.names[key] = list;
  if (sel) M.sel[key] = sel.slice();
  var on = (M.sel[key] || list.map(function (m) { return m[0]; })).filter(function (e) { return C[e]; });
  if (!on.length) on = [list[0][0]];
  M.sel[key] = on;
  var base = JSON.parse(JSON.stringify(C[on[0]]));
  var LBL = { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px', fontFamily: 'var(--primary-font-family, system-ui)' };
  base.series = on.map(function (e) { return Object.assign({}, JSON.parse(JSON.stringify(C[e].series[0])), { yaxis_id: e.replace(/\W/g, '_') }); });
  base.yaxis = on.map(function (e) {
    return { id: e.replace(/\W/g, '_'), show: on.length === 1, decimals: 0,
      apex_config: { tickAmount: 2, forceNiceScale: true, floating: true, labels: { offsetX: 4, offsetY: -8, align: 'left', style: LBL } } };
  });
  base.apex_config.colors = on.map(function (e) { return C[e].series[0].color; });
  if (on.length > 1) base.apex_config.fill.gradient.opacityFrom = 0.28;
  var meta0 = (window._hpPlantMeta || {})[on[0]] || ['', '48h'];
  var names = list.filter(function (m) { return on.indexOf(m[0]) > -1; }).map(function (m) { return m[1]; });
  window._hpPlantMeta[key] = [on.length === 1 ? meta0[0] : names.join(' · '), meta0[1], base.apex_config.colors[0]];
  C[key] = base;
  return base;
};
window._hpMultiTap = function (ev, kind) {
  if (kind === 's') { var t0 = ev.touches && ev.touches[0]; window._hpMy = t0 ? t0.clientY : 0; window._hpMx = t0 ? t0.clientX : 0; return; }
  if (kind === 't') {
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientY - (window._hpMy || 0)) > 10 || Math.abs(t.clientX - (window._hpMx || 0)) > 10)) return;
    window._hpMT = Date.now();
  } else if (Date.now() - (window._hpMT || 0) < 700) return;
  var p = (ev.composedPath && ev.composedPath()) || [ev.target], pill = null;
  for (var i = 0; i < p.length; i++) { if (p[i] && p[i].dataset && p[i].dataset.hpMulti) { pill = p[i]; break; } }
  if (!pill) return;
  ev.stopPropagation(); if (ev.cancelable) ev.preventDefault();
  window._casoraSuppressDismiss = Date.now() + 600;
  var parts = pill.dataset.hpMulti.split('|'), key = parts[0], eid = parts[1], M = window._hpMulti;
  var on = (M.sel[key] || []).slice(), ix = on.indexOf(eid);
  if (ix > -1) { if (on.length === 1) return; on.splice(ix, 1); } else on.push(eid);
  /* Reihenfolge wie in der Liste halten (Farben/Skalen stabil). */
  M.sel[key] = (M.names[key] || []).map(function (m) { return m[0]; }).filter(function (e) { return on.indexOf(e) > -1; });
  M.build(key, M.names[key]);
  Array.prototype.forEach.call(pill.parentNode.children, function (el) {
    var d = el.dataset && el.dataset.hpMulti; if (!d) return;
    el.classList.toggle('on', M.sel[key].indexOf(d.split('|')[1]) > -1);
  });
  if (window._hpPlantShow) window._hpPlantShow(key, null, true);
};

// ── Medien: Vor/Zurück wie Apple Music (24.09.2026) ─────────────────
// Statt Pfeil mit Strich (skip_next/skip_previous) zwei abgerundete Dreiecke
// (SF forward.fill/backward.fill). Überschreibt nur die Einträge in
// window.CASORA_ICONS, damit casora-icons.js update-sicher unangetastet bleibt.
(function () {
  /* Dieselben Pfade wie in casora-icons.js, damit Größe und Versatz übereinstimmen. */
  var FWD = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20width%3D%2224px%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%23FFFFFF%22%3E%3Cg%20transform%3D%22scale%280.902256%29%20translate%28-1.2%205.8000%29%22%3E%3Cpath%20d%3D%22M2.800%202.000L2.800%2013.000Q2.800%2014.600%204.183%2013.795L13.617%208.305Q15.000%207.500%2013.617%206.695L4.183%201.205Q2.800%200.400%202.800%202.000ZM14.000%202.000L14.000%2013.000Q14.000%2014.600%2015.383%2013.795L24.817%208.305Q26.200%207.500%2024.817%206.695L15.383%201.205Q14.000%200.400%2014.000%202.000Z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E';
  var BWD = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2224px%22%20width%3D%2224px%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22%23FFFFFF%22%3E%3Cg%20transform%3D%22scale%280.902256%29%20translate%281.2%205.8000%29%22%3E%3Cpath%20d%3D%22M23.800%202.000L23.800%2013.000Q23.800%2014.600%2022.417%2013.795L12.983%208.305Q11.600%207.500%2012.983%206.695L22.417%201.205Q23.800%200.400%2023.800%202.000ZM12.600%202.000L12.600%2013.000Q12.600%2014.600%2011.217%2013.795L1.783%208.305Q0.400%207.500%201.783%206.695L11.217%201.205Q12.600%200.400%2012.600%202.000Z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E';
  var apply = function () {
    if (!window.CASORA_ICONS) return false;
    window.CASORA_ICONS.skip_next = FWD; window.CASORA_ICONS.skip_previous = BWD;
    return true;
  };
  if (!apply()) { var n = 0, iv = setInterval(function () { if (apply() || ++n > 40) clearInterval(iv); }, 250); }
})();


// ── Popup-Spalten ausgleichen (25.09.2026: „nicht eine Seite viel mehr Inhalt“) ──
// window._casoraSplit(id, left, right, opt) → { left, right }
//   left  = Bedienung, bleibt links (Casora-Standard); right = Infos, dürfen nach links wandern.
//   opt.pinRight: Info-Blöcke, die rechts bleiben müssen (z. B. Karte/Kamera oben rechts).
//   opt.leftMovable: Blöcke von links, die bei Bedarf nach rechts dürfen.
// Die echten Höhen misst das Popup beim Öffnen (nur ab 761 px) und merkt sie sich
// (localStorage casora_split_h). Ohne Messwerte bleibt die feste Aufteilung.
// Erkennung im DOM: _casoraColGap hängt an registrierte Spalten einen CSS-Kommentar
// /*hs:<id>:<keys>*/ an, darüber findet die Messung Spalte und Blöcke.
(function () {
  if (window._casoraSplit) return;
  var KEY = 'casora_split_h', GAP = 18;
  var H = {};
  try { H = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { H = {}; }
  var REG = {};
  window._casoraSplitH = H;

  window._casoraSplit = function (id, left, right, opt) {
    opt = opt || {};
    left = (left || []).slice(); right = (right || []).slice();
    var res = { left: left, right: right };
    var h = H[id];
    if (h && typeof window !== 'undefined' && window.innerWidth > 760) {
      // Fehlende Messwerte (Block gerade leer/neu) zählen als 0 und werden beim nächsten Öffnen nachgemessen.
      if (Object.keys(h).length >= 2) {
        var ht = function (keys) { var s = 0, n = 0; keys.forEach(function (k) { if ((h[k] || 0) > 0) { s += h[k] + (n ? GAP : 0); n++; } }); return s; };
        var pinR = opt.pinRight || [];
        var toL = right.filter(function (k) { return pinR.indexOf(k) < 0; });
        var toR = (opt.leftMovable || []).filter(function (k) { return left.indexOf(k) > -1; });
        var cand = toL.map(function (k) { return [k, 'L']; }).concat(toR.map(function (k) { return [k, 'R']; }));
        if (cand.length <= 10) {
          var base = Math.abs(ht(left) - ht(right)), best = null;
          for (var m = 1; m < (1 << cand.length); m++) {
            var L = left.slice(), R = right.slice(), moves = 0;
            cand.forEach(function (c, i) {
              if (!(m & (1 << i))) return;
              moves++;
              if (c[1] === 'L') { R.splice(R.indexOf(c[0]), 1); L.push(c[0]); }
              else { L.splice(L.indexOf(c[0]), 1); R.push(c[0]); }
            });
            if (!L.length || !R.length) continue;
            var cost = Math.abs(ht(L) - ht(R)) + 40 * moves;
            if (!best || cost < best.cost) best = { cost: cost, L: L, R: R };
          }
          // Nur umstellen, wenn es spürbar gleichmäßiger wird.
          if (best && best.cost + 60 < base) res = { left: best.L, right: best.R };
        }
      }
    }
    REG[res.left.join(',')] = id;
    REG[res.right.join(',')] = id;
    return res;
  };

  // _casoraColGap erweitern: Marker für registrierte Spalten.
  var wrapGap = function () {
    var g = window._casoraColGap;
    if (!g || g._hs) return !!g;
    var w = function (keys) {
      var css = g(keys);
      var id = keys && REG[keys.join(',')];
      return id ? css + ' /*hs:' + id + ':' + keys.join(',') + '*/' : css;
    };
    w._hs = true;
    window._casoraColGap = w;
    return true;
  };
  wrapGap();

  // Messen nach dem Öffnen eines Popups.
  var deep = function (root, out) {
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll('style').forEach(function (s) { if (s.textContent.indexOf('/*hs:') > -1) out.push(s); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, out); });
    return out;
  };
  var measure = function () {
    if (window.innerWidth <= 760) return;
    var ha = document.querySelector('home-assistant');
    var list = deep(document.body, []).concat(deep(ha && ha.shadowRoot, []));
    var changed = false;
    list.forEach(function (st) {
      var re = /\/\*hs:([^:]+):([^*]+)\*\//g, mm;
      var root = st.getRootNode();
      if (!root || !root.getElementById) return;
      var host = root.host;
      if (!host || !host.getBoundingClientRect().width) return;
      while ((mm = re.exec(st.textContent))) {
        var id = mm[1];
        mm[2].split(',').forEach(function (k) {
          var el = root.getElementById(k);
          if (!el) return;
          var v = Math.round(el.getBoundingClientRect().height);
          if (el.style && el.style.marginTop) v -= 0;
          H[id] = H[id] || {};
          if (H[id][k] !== v) { H[id][k] = v; changed = true; }
        });
      }
    });
    if (changed) { try { localStorage.setItem(KEY, JSON.stringify(H)); } catch (e) {} }
  };
  window._casoraSplitMeasure = measure;
  // Nur die Markierung (für Spalten mit eigenem row-gap statt _casoraColGap, z. B. Energie/Netzwerk-Vorlage).
  window._casoraSplitMark = function (keys) {
    var id = keys && REG[keys.join(',')];
    return id ? ' /*hs:' + id + ':' + keys.join(',') + '*/' : '';
  };
  var wrapOpen = function () {
    var P = window.casoraPopup;
    if (!P || !P.open) return false;
    if (P._hsWrapped) return true;
    var o = P.open;
    P.open = function () {
      var r = o.apply(this, arguments);
      [1200, 3000, 6000].forEach(function (t) { setTimeout(measure, t); });
      return r;
    };
    P._hsWrapped = true;
    return true;
  };
  var n = 0, iv = setInterval(function () { var a = wrapGap(), b = wrapOpen(); if ((a && b) || ++n > 240) clearInterval(iv); }, 250);
  wrapOpen();
})();


// ── Solar-Tipp (23.09.2026, allgemein 27.09.2026) ─────────────────────────────
// Kachel casora_solar_tip auf binary_sensor.casora_solar_tipp (Integration) bzw.
// früher ein eigener Template-Sensor (Attribut frei_w). Welche großen Geräte
// schon laufen, sucht tip() selbst: Waschmaschine, Geschirrspüler, Trockner.
(function () {
  if (window._casoraSolar) return;
  var O = window._casoraSolar = {};
  var KIND = [
    ['waschen', /wasch(?!k)|washer|washing/i, /run|start|rinse|spin|clean|wash|pause/],
    ['spülen', /geschirr|dishwash/i, /run|pause|delayed|wash|dry/],
    ['trocknen', /trockner|dryer|tumble/i, /run|start|pause|anti|dry/],
  ];
  var cache = { n: -1, ids: null };
  function devices(states) {
    var keys = Object.keys(states);
    if (cache.n === keys.length && cache.ids) return cache.ids;
    var ids = KIND.map(function () { return []; });
    keys.forEach(function (id) {
      if (id.indexOf('sensor.') !== 0) return;
      if (!/(zustand|status|state|betriebszustand|operation|program_phase|phase)$/i.test(id)) return;
      KIND.forEach(function (k, i) { if (k[1].test(id)) ids[i].push(id); });
    });
    cache = { n: keys.length, ids: ids };
    return ids;
  }
  O.tip = function (entity, states) {
    var w = Number((entity && entity.attributes && entity.attributes.frei_w) || 0);
    // Ohne Hinweis (Kachel dauerhaft sichtbar): nur sagen, dass gerade nichts übrig ist –
    // kurz, sonst schrumpft die Zeile auf der schmalen Handy-Kachel unleserlich klein (30.09.).
    if (entity && entity.state !== 'on') return 'Kein Überschuss';
    // Weich (Runde 2): Kachel ohne Solar-Entität verspricht keinen Tipp, sondern sagt, was fehlt.
    if (!entity) {
      var fb = false;
      try { fb = getComputedStyle(document.documentElement).getPropertyValue('--casora-tile-fallback-name').trim() === '1'; } catch (e) {}
      if (fb) return 'Noch nicht eingerichtet';
    }
    var ids = devices(states || {});
    var tips = [];
    KIND.forEach(function (k, i) {
      var busy = ids[i].some(function (id) { return k[2].test(String((states[id] || {}).state || '').toLowerCase()); });
      if (busy) return;
      if (k[0] === 'trocknen' && w < 2000) return;
      tips.push(k[0]);
    });
    var what = tips.length ? 'jetzt ' + (tips.length > 1 ? tips.slice(0, -1).join(', ') + ' oder ' + tips[tips.length - 1] : tips[0])
      : 'Geräte laufen schon';
    var kw = w >= 1000 ? (Math.round(w / 100) / 10).toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE')) + ' kW' : w + ' W';
    return (w ? '≈ ' + kw + ' frei · ' : '') + what;
  };
  // Inhalt des eigenen Solar-Tipp-Popups: Tipp groß, darunter freie Leistung und Hausverbrauch.
  O.card = function (o, states) {
    var UI = window._casoraUI;
    var st = o.eid ? states[o.eid] : null;
    if (!UI) return '';
    /* Weich: Kachel ohne Solar-Entität – trotzdem das eigene Popup, mit Hausverbrauch, falls bekannt. */
    if (!st) {
      var hs0 = o.house && states[o.house];
      var hw0 = hs0 ? parseFloat(hs0.state) : NaN;
      return UI.hero({ value: 'Noch nicht eingerichtet', sub: 'Im Casora Studio der Kachel den Solar-Tipp zuordnen.', center: true })
        + (hs0 && !isNaN(hw0) ? '<div style="height:18px"></div>' + UI.group([{ icon: 'mdi:home-lightning-bolt-outline', iconTone: 'good', label: 'Hausverbrauch',
          value: Math.round(hw0) + ' ' + ((hs0.attributes || {}).unit_of_measurement || 'W') }], null) : '');
    }
    var loc = window.casoraLocale ? window.casoraLocale() : 'de-DE';
    var watt = function (w) {
      if (w == null || isNaN(w)) return '—';
      return Math.abs(w) >= 1000 ? (Math.round(w / 100) / 10).toLocaleString(loc) + ' kW' : Math.round(w) + ' W';
    };
    var on = st.state === 'on';
    var free = Number((st.attributes || {}).frei_w);
    var hs = o.house && states[o.house];
    var hw = hs ? parseFloat(hs.state) * (String((hs.attributes || {}).unit_of_measurement || '') === 'kW' ? 1000 : 1) : null;
    // Weich (Runde 2): Energie-Zeilen in Grün wie Ring und Energie-Popup (Farbsystem).
    var eTone = (window._casoraSoft && window._casoraSoft()) ? 'good' : undefined;
    var rows = [{ icon: 'mdi:solar-power-variant', iconTone: eTone, label: 'Sonnenstrom übrig', value: on && free ? watt(free) : 'Keiner' }];
    if (hs) rows.push({ icon: 'mdi:home-lightning-bolt-outline', iconTone: eTone, label: 'Hausverbrauch', value: watt(hw) });
    return UI.hero({ value: on ? 'Jetzt nutzen' : 'Kein Überschuss', sub: on ? O.tip(st, states) : 'Sobald Sonnenstrom übrig ist, steht hier, welches Gerät sich lohnt.', center: true })
      + '<div style="height:18px"></div>' + UI.group(rows, null);
  };
  // Öffnet das Energie-Popup der Energiekachel (falls es eine gibt), sonst die Infos.
  O.open = function (hass, entity) {
    var id = (window.casoraDevice && window.casoraDevice.byKey && window.casoraDevice.byKey(hass, 'anker_solix', 'home_load_power', 'sensor'))
      || (entity && entity.entity_id);
    var soft = !!(window._casoraSoft && window._casoraSoft());
    // Runde 2: angetippte Kachel gleich beim Tippen merken – der Umweg über lovelace/config
    // dauerte sonst zu lang für das 2-s-Fenster, und der Weich-Kopf blieb ohne Ring.
    var lt0 = window._casoraLastTile, tile0 = lt0 && Date.now() - lt0.at < 2000 ? lt0.el : null;
    // Ohne Energiekachel (30.09.2026): eigenes kleines Popup statt der HA-Infos.
    var own = function () {
      if (!window.casoraPopup) return;
      if (!window._casoraUI || (!entity && !soft)) { window.casoraPopup.moreInfo(entity ? entity.entity_id : id); return; }
      var eid = entity ? entity.entity_id : null, house = id && id !== eid ? id : null;
      var src = JSON.stringify({ eid: eid, house: house });
      /* Ring im Weich-Kopf aus der angetippten Kachel (wie bei Popups über ll-custom). */
      var lt = window._casoraLastTile, pe = window.casoraPopup.element;
      if (pe && lt && Date.now() - lt.at < 2000) pe._src = lt.el;
      else if (pe && tile0) pe._src = tile0;
      window.casoraPopup.open({
        title: 'Solar-Tipp', dismissable: true, src: (pe && pe._src) || tile0 || undefined,
        content: {
          type: 'custom:button-card', entity: eid || house || undefined, triggers_update: (eid ? [eid] : []).concat(house ? [house] : []),
          tap_action: { action: 'none' }, hold_action: { action: 'none' },
          show_icon: false, show_name: false, show_label: false, show_state: false,
          card_mod: { style: ':host { --ha-card-background: transparent !important; --ha-card-box-shadow: none !important; } ha-card { background: transparent !important; border: none !important; box-shadow: none !important; } ha-ripple { display: none !important; } @media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }' },
          styles: { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: 'var(--casora-soft-card-top, 6px) 26px 22px 26px' }],
                    grid: [{ 'grid-template-areas': '"b"' }, { 'grid-template-columns': '1fr' }],
                    custom_fields: { b: [{ 'justify-self': 'stretch' }] } },
          custom_fields: { b: '[[[ return window._casoraSolar ? window._casoraSolar.card(' + src + ', states) : ""; ]]]' },
        },
      });
    };
    var more = own;
    /* Keine Kachel mit genau dieser Entität: eine Hausverbrauchs-Energiekachel
       nehmen (Energie-Popup), erst dann die HA-Infos. */
    var fallback = function () {
      var via = window._casoraNotifyOpenViaCard, h = hass && hass.callWS ? hass : (document.querySelector('home-assistant') || {}).hass;
      if (!via || !h || !h.callWS) return more();
      var seg = (location.pathname || '').split('/').filter(Boolean);
      h.callWS({ type: 'lovelace/config', url_path: seg[0] || 'lovelace' }).then(function (cfg) {
        var hit = null;
        var st = (h && h.states) || {};
        var HOUSE = /(^|_)(haus|house|home|gesamt|total|verbrauch|consumption|load|netz|grid)(_|$)/i;
        var houseWide = function (eid) {
          var s = st[eid]; if (!s) return false;
          var a = s.attributes || {};
          if (a.device_class !== 'power') return false;
          return HOUSE.test(eid.split('.').pop()) || HOUSE.test(String(a.friendly_name || '').replace(/\s+/g, '_'));
        };
        (cfg.views || []).forEach(function (view, vi) {
          (function walk(v) {
            if (hit || !v || typeof v !== 'object') return;
            if (Array.isArray(v)) { v.forEach(walk); return; }
            var t = [].concat(v.template || []);
            var isEnergy = v.type === 'custom:button-card' && v.entity && (t.indexOf('casora_energy') >= 0 || t.indexOf('casora_popup_energy') >= 0);
            // Nur eine Haus-Verbrauchskachel: auf der Startansicht oder hausweit benannt (kein E-Bike o. ä.).
            if (isEnergy && (houseWide(v.entity) || (vi === 0 && st[v.entity] && (st[v.entity].attributes || {}).device_class === 'power'))) { hit = v; return; }
            Object.keys(v).forEach(function (k) { walk(v[k]); });
          })(view);
        });
        if (!hit) return more();
        via(hit.entity, function (ok) { if (!ok) more(); }, hit);
      }).catch(more);
    };
    /* Die Kachel selbst trägt die Tipp-Entität – über sie zu öffnen hieße, diesen
       JavaScript-Tipp erneut auszulösen. Dann direkt zur Energiekachel. */
    if (Date.now() - (O._busy || 0) < 1500) return;
    O._busy = Date.now();
    /* Weich (Fix-Runde 1, B-09): nie der HA-Standarddialog – immer das eigene Popup. */
    if (soft) { own(); return; }
    if (window._casoraNotifyOpenViaCard && id && !(entity && id === entity.entity_id)) {
      window._casoraNotifyOpenViaCard(id, function (ok) { if (!ok) fallback(); });
    } else fallback();
  };
})();


// ── Allgemeines Entitäts-Popup (30.09.2026) ──────────────────────────────────
// Für Kacheln ohne eigenes Popup (Entität mit Knöpfen …): Zustand, die Knöpfe der
// Kachel, Werte desselben Geräts und „Weitere Einstellungen“ (HA-Infos).
(function () {
  if (window._casoraEntityPopup) return;
  window._casoraEntityPopup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    var id = entity && entity.entity_id;
    if (!UI || !id) return { type: 'vertical-stack', cards: [] };
    variables = variables || {};
    var st = states[id] || {};
    var fmt = function (s) {
      try { if (hass && hass.formatEntityState) return hass.formatEntityState(s); } catch (e) {}
      return String(s && s.state != null ? s.state : '—');
    };
    var name = (st.attributes && st.attributes.friendly_name) || id;
    var dead = !st.state || st.state === 'unavailable' || st.state === 'unknown';
    var reg = (hass && hass.entities) || {};
    var dev = reg[id] && reg[id].device_id;
    var sib = dev ? Object.keys(reg).filter(function (e) {
      var r = reg[e];
      return e !== id && r.device_id === dev && !r.hidden && !r.entity_category && states[e] && /^(sensor|binary_sensor)\./.test(e);
    }).slice(0, 10) : [];
    var watch = [id].concat(sib);

    var acts = [];
    for (var i = 1; i <= 6; i++) {
      var p = 'action_' + i + '_';
      if (!((p + 'action') in variables) || variables[p + 'enabled'] === false) continue;
      var a = variables[p + 'action'], ent = variables[p + 'entity'], lbl = variables[p + 'label'], svc = variables[p + 'service'];
      if (!ent && !svc) continue;
      if (ent && watch.indexOf(ent) < 0 && states[ent]) watch.push(ent);
      var icon = variables[p + 'icon'] ? String(variables[p + 'icon']) : 'mdi:gesture-tap-button';
      if (icon.indexOf(':') < 0) icon = 'mdi:' + icon;
      var row = { icon: icon, iconTone: 'accent', label: lbl || (ent && states[ent] && states[ent].attributes.friendly_name) || svc || ent };
      if (a === 'call-service' && svc && svc.indexOf('.') > 0) {
        row.svc = { domain: svc.split('.')[0], service: svc.split('.')[1], data: variables[p + 'service_data'] || {} };
      } else if (a === 'toggle' && ent) {
        row.svc = { domain: 'homeassistant', service: 'toggle', target: { entity_id: ent } };
      } else if (ent) {
        row.entity = ent;
        if (states[ent]) row.value = fmt(states[ent]);
      } else continue;
      acts.push(row);
    }

    var fields = {}, fstyle = {}, left = [], right = [];
    var add = function (k, html, side) { fields[k] = html; fstyle[k] = [{ 'justify-self': 'stretch' }]; if (side) (side === 'r' ? right : left).push(k); };
    add('hero', '[[[ const s = states[' + JSON.stringify(id) + ']; '
      + 'let v = s ? s.state : "—"; try { if (hass.formatEntityState && s) v = hass.formatEntityState(s); } catch (e) {} '
      + 'return window._casoraUI.hero({ label: ' + JSON.stringify(name) + ', value: (!s || s.state === "unavailable" || s.state === "unknown") ? "Nicht verfügbar" : v, center: true }); ]]]');
    if (acts.length) add('acts', UI.group(acts, 'Aktionen'), 'l');
    if (sib.length) {
      add('vals', '[[[ const ids = ' + JSON.stringify(sib) + '; const UI = window._casoraUI; '
        + 'return UI.group(ids.map((e) => { const s = states[e]; let v = s.state; try { if (hass.formatEntityState) v = hass.formatEntityState(s); } catch (x) {} '
        + 'return { icon: e.startsWith("binary_sensor.") ? "mdi:checkbox-blank-circle-outline" : "mdi:gauge", iconTone: "rgba(255,255,255,0.18)", '
        + 'label: (hass.entities[e] && hass.entities[e].name) || s.attributes.friendly_name || e, value: v, entity: e }; }), "Werte"); ]]]', 'r');
    }
    add('more', UI.group([{ icon: 'mdi:tune-variant', label: 'Weitere Einstellungen', sub: dead ? 'Gerät nicht erreichbar' : null, entity: id }], null), acts.length ? 'l' : 'r');
    var areas = ['hero'].concat(left, right).map(function (k) { return '"' + k + '"'; });
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }', 'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    ].join('\n');
    var card = {
      type: 'custom:button-card', entity: id, triggers_update: watch,
      card_mod: { style: wrapperStyle }, tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: 'var(--casora-soft-card-top, 6px) 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': areas.join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }, { 'align-items': 'start' }],
        custom_fields: fstyle,
      },
      custom_fields: fields,
    };
    return window._casoraStd && left.length && right.length ? window._casoraStd(card, { left: left, right: right }) : card;
  };
})();
