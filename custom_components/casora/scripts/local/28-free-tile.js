// ── Universal tile: tile + popup assembled in the Studio (issue #52, forum wish) ──────────────
// One tile for any entity (or none): title, icon, the entity's state as the subline; the icon toggles
// lights, switches, fans, covers and locks like the other tiles. The popup is put together in the
// Studio from sections: "Werte" (up to 8 entities as rows), "Verlauf" (24 h chart of the main or a
// chosen numeric entity), "Schalten" (the main entity's own control) and the shared "own cards"
// mechanism (popup_extra_cards, casoraPopupExtras). Nothing configured → a calm state line (the Studio preview
// adds its hint), never an empty popup. Formatting and controls reuse the core (_casoraStateText, _casoraHold.model, UI).
//   window._casoraFree.cfg(variables)                 → {values[], labels{}, chart, chartEntity, controls}
//   window._casoraFree.word(hass, st)                 → state text ("An", "21,5 °C", "Geöffnet", "Nicht verfügbar")
//   window._casoraFree.tileState(entity, hass, states) – tile casora_free (subline)
//   window._casoraFree.switchable(entity)             – icon tap toggles (casora_entity show_toggle)
//   window._casoraFree.color(st) / .on(st)            – circle and ring colour by domain, highlighted states
//   window._casoraFree.popup(entity, states, hass, variables) – popup casora_popup_free
//   window._casoraFree.sec(part, C, states, hass)     – live parts (hero, ctl, vals, more)
// The same popup serves own badges with the tap "Own popup" (#60, 29-eigene-badges.js, casora_popup_own_badge):
// the badge hands its popup settings in as the same variables; a template badge without an entity adds
// free_template, whose last result (window._casoraTemplates) is the status line.
(function () {
  if (window._casoraFree) return;
  var F = window._casoraFree = {};

  var TOGGLE = /^(light|switch|input_boolean|fan|humidifier)$/;
  var SWITCHABLE = /^(light|switch|input_boolean|fan|humidifier|cover|lock|media_player|vacuum)$/;
  var CONTROL = /^(light|switch|input_boolean|fan|humidifier|cover|lock|media_player|vacuum|lawn_mower|climate|valve)$/;
  var MEAS_ONLY = /^(binary_sensor|input_select|select|input_text|text|person|device_tracker|zone|weather|sun|event|update|camera|image|calendar|todo)$/;
  // Domains whose non-numeric state is free text, not an on/off word.
  var TEXTUAL = /^(sensor|input_text|text|select|input_select)$/;
  var ON = ['on', 'open', 'opening', 'unlocked', 'unlocking', 'playing', 'cleaning', 'returning', 'mowing', 'cool', 'heat',
    'heating', 'cooling', 'washing', 'rinsing', 'spinning', 'drying', 'running', 'active', 'home', 'armed_home', 'armed_away',
    'armed_night', 'armed_vacation', 'armed_custom_bypass', 'triggered'];
  var MAX_VALUES = 8;

  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = function (x) { return typeof window.casoraTr === 'function' ? window.casoraTr(x) : x; };
  var bad = function (s) { return s == null || s === '' || s === 'unknown' || s === 'unavailable'; };
  var dom = function (id) { return String(id || '').split('.')[0]; };
  var isId = function (v) { return typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v); };
  var loc = function () { return typeof window.casoraLocale === 'function' ? window.casoraLocale() : undefined; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };

  // Colour of the circle by domain: the tone system of the theme (design-regeln.md § 5).
  var TONE = {
    light: 'var(--casora-tone-light, var(--casora-color-yellow, #FFCC00))',
    scene: 'var(--casora-tone-light, var(--casora-color-yellow, #FFCC00))',
    climate: 'var(--casora-tone-heat, var(--casora-color-orange, #DE8A4E))',
    water_heater: 'var(--casora-tone-heat, var(--casora-color-orange, #DE8A4E))',
    media_player: 'var(--casora-tone-media, var(--casora-color-blue, #5B8FC9))',
    update: 'var(--casora-tone-media, var(--casora-color-blue, #5B8FC9))',
    lock: 'var(--casora-tone-alert, var(--casora-color-red, #D35A4E))',
    alarm_control_panel: 'var(--casora-tone-alert, var(--casora-color-red, #D35A4E))',
  };
  var GENERAL = 'var(--casora-tone-general, var(--casora-color-teal, #4E9E95))';
  F.color = function (st) {
    var d = dom(st && st.entity_id);
    return TONE[d] || GENERAL;
  };
  F.on = function (st) {
    if (!st || bad(st.state)) return false;
    return ON.indexOf(String(st.state).toLowerCase()) > -1;
  };

  // ── Studio settings (tile variables) ──────────────────────────────────────
  F.cfg = function (variables) {
    var v = variables || {};
    var values = (Array.isArray(v.free_values) ? v.free_values : []).filter(isId)
      .filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, MAX_VALUES);
    var labels = v.free_value_labels && typeof v.free_value_labels === 'object' && !Array.isArray(v.free_value_labels) ? v.free_value_labels : {};
    var on = function (x, def) { return x === undefined || x === null || x === '' ? def : !(x === false || x === 'false' || x === 0 || x === '0'); };
    return { values: values, labels: labels, chart: on(v.free_chart, false),
      chartEntity: isId(v.free_chart_entity) ? v.free_chart_entity : null, controls: on(v.free_controls, true) };
  };

  // ── State text ────────────────────────────────────────────────────────────
  F.isNumeric = function (st) {
    if (!st || bad(st.state)) return false;
    var a = st.attributes || {};
    if (MEAS_ONLY.test(dom(st.entity_id)) && !a.unit_of_measurement) return false;
    if (a.unit_of_measurement || a.state_class) return /^-?\d+(\.\d+)?$/.test(String(st.state));
    return /^-?\d+(\.\d+)?$/.test(String(st.state)) && /^(sensor|number|input_number|counter)$/.test(dom(st.entity_id));
  };
  // Number with unit in the user's locale ("21,5 °C", "1.234 kWh", "62 %"); the registry's display precision
  // wins, else one decimal under 100, none for whole numbers.
  F.fmt = function (hass, st) {
    var n = num(st.state), a = st.attributes || {};
    if (n == null) return String(st.state);
    var e = ((hass && hass.entities) || {})[st.entity_id] || {};
    var p = e.display_precision != null ? e.display_precision : (e.options && e.options.sensor && e.options.sensor.display_precision);
    if (p == null) p = Math.abs(n) >= 100 || Math.round(n) === n ? 0 : 1;
    var txt = n.toLocaleString(loc(), { minimumFractionDigits: p, maximumFractionDigits: p });
    return a.unit_of_measurement ? txt + ' ' + a.unit_of_measurement : txt;
  };
  F.word = function (hass, st) {
    if (!st) return 'Nicht verfügbar';
    var s = String(st.state == null ? '' : st.state).toLowerCase();
    if (s === 'unknown' || s === '') return 'Unbekannt';
    if (s === 'unavailable') return 'Nicht verfügbar';
    if (F.isNumeric(st)) return F.fmt(hass, st);
    if (dom(st.entity_id) === 'binary_sensor' && window._casoraZiele && window._casoraZiele.binWords) {
      var w = window._casoraZiele.binWords(st);
      return s === 'on' ? w[0] : w[1];
    }
    // Text domains keep the state as the device wrote it ("iPhone 15", "WLAN_5G"), translated by HA when it can
    // (enum sensors, select options); the core's word list would mangle the case.
    if (TEXTUAL.test(dom(st.entity_id))) {
      try {
        var f = hass && typeof hass.formatEntityState === 'function' ? hass.formatEntityState(st) : '';
        // HA had no word for it (a raw „ready“): Casora's word (review 2, DH-14).
        if (f != null && String(f) !== '') return String(f) === String(st.state) && window._casoraRawWord ? window._casoraRawWord(String(f)) : String(f);
      } catch (e) { /* entity half loaded */ }
      return window._casoraRawWord ? window._casoraRawWord(String(st.state)) : String(st.state);
    }
    // Casora's words before HA's ("Ein"): the core would take hass.formatEntityState first.
    if (s === 'on') return 'An';
    if (s === 'off') return 'Aus';
    if (typeof window._casoraStateText === 'function') return window._casoraStateText(hass, st);
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');
  };
  F.tileState = function (entity, hass, states) {
    if (!entity || !entity.entity_id) return '';
    var st = (states && states[entity.entity_id]) || entity;
    return F.word(hass, st);
  };
  // Icon tap toggles only what the house switches (blaupause-kachel.md, decided 13.10.2026).
  F.switchable = function (entity) {
    return !!(entity && entity.entity_id && SWITCHABLE.test(dom(entity.entity_id)) && !bad(entity.state));
  };
  // Service behind the icon tap, as casora_entity does it: lock/unlock, media on/off, vacuum start/back, else toggle.
  F.iconService = function (entity) {
    if (!F.switchable(entity)) return 'none';
    var d = dom(entity.entity_id), s = String(entity.state).toLowerCase(), a = entity.attributes || {};
    if (d === 'lock') return s === 'locked' ? 'lock.unlock' : s === 'unlocked' ? 'lock.lock' : 'none';
    if (d === 'media_player') {
      var feats = Number(a.supported_features || 0);
      if (s === 'off') return (feats & 128) ? 'media_player.turn_on' : 'none';
      return (feats & 256) ? 'media_player.turn_off' : 'none';
    }
    if (d === 'vacuum') return (s === 'cleaning' || s === 'returning' || s === 'paused') ? 'vacuum.return_to_base' : 'vacuum.start';
    return 'homeassistant.toggle';
  };
  F.hasControls = function (st) {
    if (!(st && !bad(st.state) && CONTROL.test(dom(st.entity_id)))) return false;
    /* Blueprint v2 (decision 2): a pure switch is switched by the header's main switch only – nothing left to show here.
       A light keeps its brightness, fans and humidifiers their modes. */
    var d = dom(st.entity_id), a = st.attributes || {};
    if (/^(switch|input_boolean)$/.test(d)) return false;
    if (d === 'light') return (Array.isArray(a.supported_color_modes) ? a.supported_color_modes : []).some(function (m) { return m !== 'onoff'; });
    return true;
  };

  // Elapsed time for the status line ("seit 5 Min.", "seit 3 Std.", "seit 2 Tagen").
  var since = function (ts) {
    var t = Date.parse(ts); if (!isFinite(t)) return null;
    var m = (window.casoraAgoMin ? window.casoraAgoMin(Date.now() - t) : Math.max(0, Math.round((Date.now() - t) / 60000)));
    if (m < 1) return 'gerade eben';
    if (m < 60) return 'seit ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'seit ' + h + ' Std.';
    var d = Math.round(h / 24);
    return 'seit ' + d + (d === 1 ? ' Tag' : ' Tagen');
  };
  // The same as a fact on the stage, word first („Seit 8 Min.“ – „Zustand seit 8 Min.“ read twice, prod test 01.11.2026).
  var sinceFact = function (ts) {
    var t = since(ts);
    if (!t) return null;
    return /^seit /.test(t) ? { label: 'Seit', value: t.slice(5) } : { label: 'Zuletzt', value: t };
  };
  var iconOf = function (st) {
    var Z = window._casoraZiele;
    if (Z && Z.iconOf) return Z.iconOf(st);
    var a = (st && st.attributes) || {};
    return a.icon || 'mdi:circle-small';
  };
  var nameOf = function (st, id) {
    return String((st && st.attributes && st.attributes.friendly_name) || id || '');
  };

  // Popup header: circle in the domain tone, sand when off (DP-15).
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_free\b/.test(String(key || '')) || !src || !src._stateObj) return null;
    var st = src._stateObj;
    return { hue: F.color(st), off: !F.on(st) };
  });
  // Main switch in the header for entities the house toggles.
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src) {
    var tpl = [].concat((src && src._config && src._config.template) || []).join(' ');
    if (!/\bcasora_(free|popup_own_badge)\b/.test(tpl)) return null;
    var id = src._stateObj && src._stateObj.entity_id;
    return id && TOGGLE.test(dom(id)) ? [id] : false;
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  // C: what the sections need – id, values, labels, chart entity (numeric), controls flag.
  F.plan = function (entity, states, hass, variables) {
    var S = states || {};
    var cfg = F.cfg(variables);
    var id = entity && entity.entity_id ? entity.entity_id : null;
    var st = id ? S[id] : null;
    var values = cfg.values.filter(function (x) { return !!S[x]; });
    var chartWant = cfg.chart ? (cfg.chartEntity || id) : null;
    var v = variables || {};
    var tpl = !id && typeof v.free_template === 'string' && v.free_template.trim() ? v.free_template : null;
    var chart = chartWant && S[chartWant] && F.isNumeric(S[chartWant]) ? chartWant : null;
    // Own cards / entities below the popup (casoraPopupExtras): content of its own, a device stays optional (issue 128).
    var own = (Array.isArray(v.popup_extra_cards) && v.popup_extra_cards.length > 0)
      || (Array.isArray(v.popup_extra_entities) && v.popup_extra_entities.length > 0);
    return { id: id, tpl: tpl, values: values, labels: cfg.labels, controls: !!(cfg.controls && st && F.hasControls(st)),
      chart: chart, chartMissing: !!(chartWant && !chart), chartWant: chartWant, own: own,
      empty: !values.length && !chart && !(cfg.controls && st && F.hasControls(st)) };
  };
  F.wide = function (entity, states, variables) {
    var C = F.plan(entity, states, null, variables);
    // Popup v3 (richtlinien §2): the stage stands left and values/chart right – any right column needs 900, else the
    // wheel and the rows were squeezed into 552 (maintainer review 31.10.2026).
    var UI = window._casoraUI;
    if (UI && UI.v3 && UI.v3() && UI.stage) return !!(C.values.length || C.chart);
    return !!(C.controls && C.values.length);
  };
  // GitHub issue 125: "Im Studio kannst du … ergänzen" is a setup hint for the admin – only in the Studio preview.
  // Issue 128: the same for "Wähle im Studio ein Gerät …" – the device is optional, live nothing asks for one.
  var inStudio = function () { return !!(window.casoraInStudio && window.casoraInStudio()); };
  var noDevice = function (C) { return !C.id && !C.tpl; };
  var hasContent = function (C) { return !!(C.values.length || C.chart || C.own); };
  var NOT_SET = 'Noch nicht eingerichtet';
  F.popup = function (entity, states, hass, variables) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var S = states || {};
    var C = F.plan(entity, S, hass, variables);
    var watch = [C.id].concat(C.values, C.chart ? [C.chart] : []).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var call = function (part) {
      return 'return window._casoraFree ? window._casoraFree.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(C) + ', states, hass) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), S) } };
    var top = ['hero'];
    // Popup v3 (richtlinien §4.7 fallback, §7, §8): a status stage S7 with the tile's state, the controls under it, right
    // the values and the chart as the section „Verlauf“ (120); no settings.
    if (UI.v3 && UI.v3() && UI.stage) {
      // The status line is the popup's own (the frame's fallback said HA's „Ein“ beside „An“ on the stage, prod test 01.11.).
      var fv = { line: { card: K.secCard(watch, call('line'), S) } };
      // No device but values, history or own cards (issue 128, the device is optional): live the content stands alone.
      if (!(noDevice(C) && hasContent(C) && !inStudio())) fv.stage = { card: K.secCard(watch, call('stage'), S) };
      if (C.controls) fv.ctl = { card: K.secCard([C.id], call('ctl'), S) };
      if (C.values.length) fv.vals = { card: K.secCard(C.values, call('vals'), S) };
      // The series' name and unit come from its entity while the chart draws (entity_name): no text from HA in the
      // card config, where the popup's button-card would evaluate one shaped "[[[ … ]]]" (HACS review 5).
      if (C.chart) {
        fv.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: '24h', source: 'history',
          series: [{ entity: C.chart, entity_name: true, color: 'accent' }],
          height: 120, readout: 'own', plate: true, title: T('Verlauf') }, do_not_eval: true };
      }
      return K.layout({ fields: fv, top: ['line'], stage: 'stage', left: ['ctl'], right: ['vals', 'chart'], narrowOrder: ['ctl', 'vals', 'chart'] });
    }
    if (C.chart) {
      f.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: '24h', source: 'history',
        series: [{ entity: C.chart, entity_name: true }], height: 160, readout: 'own', plate: true }, do_not_eval: true };
      top.push('chart');
    }
    // Controls and the settings row follow the main entity only, the value rows their own entities: a power
    // sensor ticking in "Werte" must not rebuild the brightness slider mid-drag.
    if (C.controls) f.ctl = { card: K.secCard([C.id], call('ctl'), S) };
    if (C.values.length) f.vals = { card: K.secCard(C.values, call('vals'), S) };
    if (C.id && S[C.id]) f.more = { card: K.secCard([C.id], call('more'), S) };
    return K.layout({ fields: f, top: top, left: ['ctl'], right: ['vals', 'more'], narrowOrder: ['ctl', 'vals', 'more'] });
  };

  // Controls of the main entity: toggle as segments (plus brightness for lights), the hold menu's model
  // (22-halten.js) for everything else – cover buttons, position, lock, media, climate target, vacuum.
  var svcOf = function (id, x) {
    var p = String(x.svc || '').split('.');
    return { domain: p[0], service: p[1], data: x.data || {}, target: { entity_id: id } };
  };
  var controls = function (UI, st, states, hass) {
    var id = st.entity_id, d = dom(id), s = String(st.state || ''), a = st.attributes || {}, out = '';
    var tgt = { entity_id: id }, gap = '<div style="height:18px"></div>';
    if (TOGGLE.test(d)) {
      // On/off is the header's main switch (blueprint v2, decision 2) – here only what it cannot do.
      var modes = Array.isArray(a.supported_color_modes) ? a.supported_color_modes : [];
      if (d === 'light' && modes.some(function (m) { return m !== 'onoff'; }) && UI.slider) {
        out += (UI.label ? UI.label('Helligkeit') : '') + UI.slider({ value: s === 'on' && a.brightness != null ? Math.round(a.brightness / 2.55) : 0,
          softHeight: 58, bar: true, icon: 'light', svc: { domain: 'light', service: 'turn_on', field: 'brightness_pct', target: tgt } });
      }
    }
    var H = window._casoraHold;
    var m = H && H.model ? H.model(st, { states: states, tapPopup: true }) : null;
    if (!m) return out;
    var hadButtons = false;
    (m.quick || []).forEach(function (q) {
      if (q.kind === 'pills' || q.kind === 'buttons') {
        if (q.kind === 'buttons') hadButtons = true;
        var label = (q.label || (q.kind === 'buttons' ? 'Bedienung' : '')) + (q.value || '');
        out += (out ? gap : '') + UI.segments((q.items || []).map(function (it) {
          return { label: it.t, active: !!it.on, svc: svcOf(id, it) };
        }), label.trim() || null);
      } else if (q.kind === 'step' && q.value != null) {
        var step = q.step || 0.5, cur = Math.round(q.value / step) * step;
        var vals = [cur - 2 * step, cur - step, cur, cur + step, cur + 2 * step].filter(function (v) {
          return (q.min == null || v >= q.min) && (q.max == null || v <= q.max);
        });
        out += (out ? gap : '') + UI.segments(vals.map(function (v) {
          var t = (Math.round(v * 10) / 10).toLocaleString(loc()) + '°';
          return { label: t, active: Math.abs(v - q.value) < step / 2, svc: { domain: 'climate', service: 'set_temperature', data: { temperature: Math.round(v * 10) / 10 }, target: tgt } };
        }), (q.label || 'Zieltemperatur') + ' · ' + (Math.round(q.value * 10) / 10).toLocaleString(loc()) + '°');
      }
    });
    // Main action (lock, cover without buttons, media, vacuum …) as one row; risky ones ask first.
    if (m.main && m.main.svc && !TOGGLE.test(d) && !hadButtons) {
      out += (out ? gap : '') + UI.group([{ icon: m.main.ic || 'mdi:gesture-tap', iconTone: 'accent', label: m.main.t,
        svc: svcOf(id, m.main), confirm: m.main.ask || null }], 'Bedienung');
    }
    return out;
  };

  F.sec = function (part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !C) return '';
    var S = states || {}, st = C.id ? S[C.id] : null;
    if (part === 'stage') {
      // The tile's state as the sentence, its symbol in the traffic light (on/active green, off grey, unknown orange);
      // a template badge without an entity: its text. Hints of the Studio as notes under it.
      var n3 = [];
      // DD-30 (test 2): no technical note in the popup (popup-richtlinien-v3 §8 "clean") – a chart sensor without
      // numbers just shows no chart.
      if (C.empty && inStudio()) n3.push(T('Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten ergänzen.'));
      // white-space normal: under the wheel the note ran out of the popup in one line (button-card's nowrap).
      var noteHtml = UI.note ? n3.map(function (n) { return UI.note(n); }).join('') : '';
      var notesHtml = noteHtml ? '<div style="white-space:normal;">' + noteHtml + '</div>' : '';
      if (!C.id && C.tpl) {
        var TP3 = window._casoraTemplates, tx3 = TP3 && TP3.text ? TP3.text(C.tpl) : null;
        return UI.stage('status', { dial: false, tone: 'good', icon: 'mdi:text-box-outline', text: tx3 == null ? '…' : (String(tx3).trim() || '—'), extra: notesHtml });
      }
      if (!C.id && inStudio()) return UI.stage('status', { empty: { icon: 'mdi:shape-outline', studio: true, text: T('Wähle im Studio ein Gerät oder ergänze Werte, Verlauf und eigene Karten.') } });
      // Live without a device: the content stands alone (F.popup leaves the stage out); nothing at all – a calm word.
      if (!C.id) return hasContent(C) ? '' : UI.stage('status', { empty: { icon: 'mdi:shape-outline', text: T(NOT_SET) } });
      if (!st) return UI.stage('status', { dial: false, tone: 'warn', icon: 'mdi:help-circle-outline', text: 'Gerät fehlt', facts: [{ label: 'Status', value: C.id }] });
      var ago3 = !bad(st.state) ? sinceFact(st.last_changed) : null;
      // A ring only when it measures something (prod test 01.11.2026): a percentage fills it like a level (S6 with its
      // range); a switch, a word or a reading without a range keep the plate – a full green ring said nothing.
      var a3 = st.attributes || {};
      if (F.isNumeric(st) && a3.unit_of_measurement === '%') {
        // The value is on the wheel – the status line says since when (§3: it never repeats the stage's value).
        return UI.stage('chart', { value: F.fmt(hass, st).replace(/\s*%$/, ''), unit: '%', ring: { min: 0, max: 100 }, extra: notesHtml });
      }
      return UI.stage('status', { dial: false, tone: bad(st.state) ? 'warn' : F.on(st) ? 'good' : 'off', icon: iconOf(st), text: F.word(hass, st),
        // One fact read as a phrase („Seit 8 Min.“) – the plate sets value over label, which read „8 Min. / Seit“.
        state: st.state === 'unavailable' ? 'na' : null, facts: ago3 ? [{ label: '', value: ago3.label + ' ' + ago3.value }] : [], extra: notesHtml });
    }
    if (part === 'line') {
      // v3 status line: the same word as the stage (word list „An“/„Aus“), the hints stand in the stage.
      if (!C.id && C.tpl) {
        var TPl = window._casoraTemplates, txl = TPl && TPl.text ? TPl.text(C.tpl) : null;
        return UI.line(txl == null ? '…' : (String(txl).trim() || '—'), []);
      }
      if (!C.id) return UI.line(inStudio() ? 'Kein Gerät gewählt' : '', []);
      if (!st) return UI.line('Gerät fehlt', []);
      if (F.isNumeric(st) && (st.attributes || {}).unit_of_measurement === '%') {
        var agoL = sinceFact(st.last_changed);
        return UI.line(agoL ? agoL.label + ' ' + agoL.value : '', []);
      }
      return UI.line(F.word(hass, st), []);
    }
    if (part === 'hero') {
      var notes = [];
      if (!C.id && C.tpl) {
        // Template badge: its text as the status line, "…" until the first result.
        var TP = window._casoraTemplates;
        var txt = TP && TP.text ? TP.text(C.tpl) : null;
        var line = UI.line(txt == null ? '…' : (String(txt).trim() || '—'), []);
        if (C.empty && inStudio()) notes.push(T('Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten ergänzen.'));
        return line + (UI.note ? notes.map(function (n) { return UI.note(n); }).join('') : '');
      }
      if (!C.id && inStudio()) {
        notes.push(T('Wähle im Studio ein Gerät oder ergänze Werte, Verlauf und eigene Karten.'));
        return UI.line('Kein Gerät gewählt', []) + (UI.note ? UI.note(notes[0]) : '');
      }
      if (!C.id) return UI.line(hasContent(C) ? '' : NOT_SET, []);
      if (!st) return UI.line('Gerät fehlt', [C.id]);
      var rest = [];
      var ago = !bad(st.state) ? since(st.last_changed) : null;
      if (ago) rest.push(ago);
      var out = UI.line(F.word(hass, st), rest);
      if (C.empty && inStudio()) notes.push(T('Im Studio kannst du Werte, Verlauf, Bedienung und eigene Karten ergänzen.'));
      if (notes.length && UI.note) out += notes.map(function (n) { return UI.note(n); }).join('');
      return out;
    }
    if (part === 'ctl') return st && F.hasControls(st) ? controls(UI, st, S, hass) : '';
    if (part === 'vals') {
      var rows = C.values.map(function (id) {
        var x = S[id];
        var own = C.labels && typeof C.labels[id] === 'string' ? C.labels[id].trim() : '';
        return { entity: id, icon: iconOf(x), iconTone: 'accent', label: own || nameOf(x, id), value: F.word(hass, x),
          valueTone: x && bad(x.state) ? 'warn' : null };
      });
      return rows.length ? UI.group(rows, 'Werte') : '';
    }
    if (part === 'more') return st && UI.settings ? UI.settings(C.id) : '';
    return '';
  };
})();
