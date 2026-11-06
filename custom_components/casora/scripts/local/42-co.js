// ── Carbon monoxide (community card „CO-Melder“, issue 124) ────────────────────────────────────────────────────────
// The tile's entity is a sensor with device_class carbon_monoxide (Matter: CarbonMonoxideConcentrationMeasurement, ppm).
// What else the detector has comes from the same device, by device_class and translation_key (Matter SmokeCoAlarm):
// the CO alarm (binary_sensor carbon_monoxide), smoke (binary_sensor smoke), battery (sensor battery %, else the
// binary_sensor battery_alert), the self-test (button self_test_request, binary_sensor test_in_progress) and faults
// (hardware_fault, end_of_service). Levels (agreed in the issue): from 100 ppm danger (red), from 50 warning (orange),
// from 30 slightly raised (yellow), else normal (green); a CO alarm of the detector counts as danger.
// Popup v3 „Bühne“ (popup-richtlinien-v3.md §4 S6, §4.8, §7): the value on an S6 dial with a range (0–150 ppm) in the
// colour of the level, the thresholds as marks, the Verlauf under the dial with 24 Std. · 7 Tage (casora-chart, reading
// on the number); right what to do, the four levels and the detector's other entities with „Zuletzt erhöht“.
//   window._casoraCo.level(ppm)                → 0 normal · 1 slightly raised · 2 warning · 3 danger
//   window._casoraCo.model(hass, id)           → the detector's values
//   window._casoraCo.tileState(st, hass)       – tile casora_co („12 ppm“)
//   window._casoraCo.tileColor(st, hass)       – the icon's colour (level)
//   window._casoraCo.lastHigh(rows, now)       – last raised value from the history rows
//   window._casoraCo.popup(entity, hass, vars) – the popup's cards
//   window._casoraCo.sec(part, c, states, hass, el) – the v3 parts (hero, stage, todo, levels, device)
(function () {
  if (window._casoraCo) return;
  var C = window._casoraCo = {};
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var usable = function (st) { return !!st && st.state !== 'unavailable' && st.state !== 'unknown'; };
  var fmt = function (v) { return window.casoraNum ? window.casoraNum(Math.round(v), 0) : String(Math.round(v)); };

  C.LIMITS = [30, 50, 100];
  C.MAX = 150;
  C.level = function (ppm) {
    var n = num(ppm);
    if (n == null) return null;
    return n >= C.LIMITS[2] ? 3 : n >= C.LIMITS[1] ? 2 : n >= C.LIMITS[0] ? 1 : 0;
  };
  // Theme colours (design-regeln §5); the fallbacks are the theme's values.
  C.COLOR = ['var(--casora-color-green, #6AAE78)', 'var(--casora-color-yellow, #E8B04A)',
    'var(--casora-color-orange, #DE8A4E)', 'var(--casora-color-red, #D35A4E)'];
  C.TONE = ['good', 'var(--casora-color-yellow, #E8B04A)', 'warn', 'bad'];
  C.WORD = ['Normal', 'Leicht erhöht', 'Warnung', 'Gefahr'];
  C.RANGE = ['unter 30 ppm', '30 bis 49 ppm', '50 bis 99 ppm', 'ab 100 ppm'];
  C.color = function (lv) { return lv == null ? 'var(--casora-text-3, rgba(128,128,128,0.6))' : C.COLOR[lv]; };

  // The detector's other entities on the same device (never by entity id).
  var pick = function (hass, ids, test) {
    var S = hass.states || {}, R = hass.entities || {};
    var hit = ids.filter(function (x) { return S[x] && test(x, R[x] || {}, (S[x].attributes || {}).device_class || ''); });
    return hit;
  };
  C.model = function (hass, id) {
    var S = (hass && hass.states) || {}, R = (hass && hass.entities) || {};
    var st = S[id], m = { id: id, ppm: null, lv: null, dead: !st || st.state === 'unavailable', unknown: !!st && st.state === 'unknown' };
    m.unit = String(((st || {}).attributes || {}).unit_of_measurement || 'ppm');
    if (usable(st)) { m.ppm = num(st.state); m.lv = C.level(m.ppm); }
    m.device = (R[id] || {}).device_id || null;
    var ids = m.device && window.casoraDeviceEntities ? window.casoraDeviceEntities(R, m.device).filter(function (x) {
      var e = R[x] || {};
      return x !== id && !e.hidden && !e.hidden_by && !e.disabled_by;
    }) : [];
    var bin = function (x) { return x.indexOf('binary_sensor.') === 0; };
    // The detector's own CO alarm before the one it hears from a linked detector (interconnected_co_alarm).
    var co = pick(hass, ids, function (x, e, dc) { return bin(x) && dc === 'carbon_monoxide'; })
      .sort(function (a, b) { return (/interconnect/.test(R[a].translation_key || '') ? 1 : 0) - (/interconnect/.test(R[b].translation_key || '') ? 1 : 0); });
    m.alarm = co[0] || null;
    m.smoke = pick(hass, ids, function (x, e, dc) { return bin(x) && dc === 'smoke' && !/interconnect/.test(e.translation_key || ''); })[0] || null;
    m.battery = pick(hass, ids, function (x, e, dc) { return x.indexOf('sensor.') === 0 && dc === 'battery'; })[0]
      || pick(hass, ids, function (x, e, dc) { return bin(x) && (dc === 'battery' || e.translation_key === 'battery_alert'); })[0] || null;
    m.test = pick(hass, ids, function (x, e) {
      var a = S[x].attributes || {};
      return x.indexOf('button.') === 0 && (e.translation_key === 'self_test_request' || /self.?test|selbsttest/i.test((a.friendly_name || '') + ' ' + (e.original_name || '')));
    })[0] || null;
    m.testRun = pick(hass, ids, function (x, e) { return bin(x) && e.translation_key === 'test_in_progress'; })[0] || null;
    m.faults = pick(hass, ids, function (x, e) { return bin(x) && /^(hardware_fault|end_of_service)$/.test(e.translation_key || ''); });
    m.alarmOn = !!(m.alarm && S[m.alarm] && S[m.alarm].state === 'on');
    // A CO alarm of the detector is danger, whatever the reading says.
    if (m.alarmOn) m.lv = 3;
    var d = m.device && (hass.devices || {})[m.device];
    m.devName = (d && (d.name_by_user || d.name)) || '';
    m.watch = [id, m.alarm, m.smoke, m.battery, m.test, m.testRun].concat(m.faults).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    return m;
  };

  // ── Tile ──────────────────────────────────────────────────────────────────
  C.tileState = function (st, hass) {
    if (!st) return '';
    if (st.state === 'unavailable') return 'Nicht verfügbar';
    if (st.state === 'unknown') return 'Unbekannt';
    var n = num(st.state);
    if (n == null) return String(st.state);
    return fmt(n) + ' ' + String((st.attributes || {}).unit_of_measurement || 'ppm');
  };
  C.tileLevel = function (st, hass) {
    if (!st || !hass) return null;
    return C.model(hass, st.entity_id).lv;
  };
  C.tileColor = function (st, hass) { return C.color(C.tileLevel(st, hass)); };
  // Highlighted from „Leicht erhöht“ on.
  C.active = function (st, hass) { var lv = C.tileLevel(st, hass); return lv != null && lv >= 1; };

  // ── History: the last raised value ────────────────────────────────────────
  // rows: [{ s, t }] in time order (18-ziele.js Z.history). → { now: true, since, max } while raised,
  // { t, max } for the end of the last raised stretch, null when nothing was raised in the rows.
  C.lastHigh = function (rows, now) {
    if (!rows || !rows.length) return null;
    var lim = C.LIMITS[0], end = null, max = null, i = rows.length - 1;
    var v = function (r) { return num(r.s); };
    if (v(rows[i]) != null && v(rows[i]) >= lim) {
      max = v(rows[i]);
      while (i > 0 && v(rows[i - 1]) != null && v(rows[i - 1]) >= lim) { i--; max = Math.max(max, v(rows[i])); }
      return { now: true, since: rows[i].t, max: max };
    }
    for (; i >= 0; i--) {
      var x = v(rows[i]);
      if (x != null && x >= lim) {
        if (end == null) end = rows[i + 1] ? rows[i + 1].t : (now || Date.now());
        max = max == null ? x : Math.max(max, x);
      } else if (end != null) break;
    }
    return end == null ? null : { t: end, max: max };
  };
  var ago = function (t, now) {
    var m = window.casoraAgoMin ? window.casoraAgoMin(now - t) : Math.round((now - t) / 60000);
    if (m < 1) return 'Gerade eben';
    if (m < 60) return 'vor ' + m + ' Min.';
    if (m < 24 * 60) return 'vor ' + Math.round(m / 60) + ' Std.';
    var d = window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.round(m / 1440);
    return d <= 1 ? 'Gestern' : 'vor ' + d + ' Tagen';
  };

  // What to do, short and plain (issue 124: ventilate, leave the room, from danger call 112).
  C.ADVICE = [
    { icon: 'mdi:check-circle-outline', label: 'Alles in Ordnung', sub: 'Bei erhöhtem Wert lüften, ab 50 ppm den Raum verlassen, ab 100 ppm Notruf 112.' },
    { icon: 'mdi:window-open-variant', label: 'Lüften', sub: 'Fenster öffnen und Gasgeräte, Kamin und Heizung prüfen.' },
    { icon: 'mdi:exit-run', label: 'Lüften und Raum verlassen', sub: 'Gasgeräte und offenes Feuer ausschalten, Fenster öffnen, den Raum verlassen.' },
    { icon: 'mdi:phone-alert', label: 'Haus verlassen, Notruf 112', sub: 'Alle nach draußen bringen, Türen offen lassen und erst wieder hinein, wenn die Feuerwehr es erlaubt.' },
  ];

  // ── Popup ─────────────────────────────────────────────────────────────────
  C.v3 = function () {
    var UI = window._casoraUI;
    if (!(UI && UI.stage && UI.soft && UI.soft() && window._casoraSoftKit)) return false;
    try { var v = localStorage.getItem('casora_popup_variant'); return !v || v === 'v3'; } catch (e) { return true; }
  };
  // Popup accent in the colour of the level (DP-15).
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_co\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var lv = C.tileLevel(src._stateObj, ha && ha.hass);
    return { hue: C.color(lv), off: false };
  });

  var SPANS = [['24h', '24 Std.'], ['7d', '7 Tage']];
  C.chartKey = function (id, span) { return 'co:' + id + '|' + span; };
  // The chart configs for the stage's slot (_hpChartCfg, 01-basis.js): the line in the air-quality teal (§7.3, traffic
  // light colours never as a series), reading on the stage's number.
  C.charts = function (id) {
    if (typeof window._hpChartCfg !== 'function') return false;
    SPANS.forEach(function (s) {
      var cfg = window._hpChartCfg(C.chartKey(id, s[0]), 'Kohlenmonoxid', s[0], 'var(--casora-color-teal, #4E9E95)', window.innerWidth <= 760 ? 140 : 160);
      cfg.series[0].entity = id;
      cfg.series[0].unit = 'ppm';
      cfg.source = s[0] === '24h' ? 'history' : 'auto';
      cfg.readout = 'hero';
      cfg.plate = false;
      if (s[0] !== '24h' && window._hpSmooth) window._hpSmooth(C.chartKey(id, s[0]));
    });
    return true;
  };
  // The range the stage shows: the one picked last in this popup (_hpPlantShow notes it), else 24 Std.
  C.span = function (id) {
    var s = String(window._hpShown || '');
    return s === C.chartKey(id, '7d') ? '7d' : '24h';
  };

  // The v3 parts, drawn live (secCard): c = { id }.
  C.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c || !hass) return '';
    var h = states && states !== hass.states ? Object.assign({}, hass, { states: states }) : hass;
    var m = C.model(h, c.id), S = h.states || {};
    if (part === 'hero') {
      if (m.dead) return UI.line('Nicht verfügbar', []);
      if (m.lv == null) return UI.line('Unbekannt', []);
      return UI.line(C.WORD[m.lv], m.alarmOn ? ['CO-Alarm'] : [], { tone: m.lv === 3 ? 'bad' : m.lv === 2 ? 'warn' : null });
    }
    if (part === 'stage') {
      var span = C.span(c.id), key = C.chartKey(c.id, span);
      if (el && window._hpStageChart && window._hpPlantCfg && window._hpPlantCfg[key]) window._hpStageChart(el, key);
      var slot = window._hpPlantCfg && window._hpPlantCfg[key]
        ? '<div class="hp-chart-slot" style="min-height:' + (window.innerWidth <= 760 ? 140 : 160) + 'px;pointer-events:auto;"></div>' : '';
      var range = slot ? SPANS.map(function (s) { return { label: s[1], active: s[0] === span, attrs: { 'data-hp-metric': C.chartKey(c.id, s[0]) } }; }) : null;
      var html = UI.stage('chart', { caption: 'Kohlenmonoxid', value: m.dead ? 'Nicht verfügbar' : m.ppm == null ? '–' : fmt(m.ppm),
        unit: m.ppm == null ? '' : m.unit, word: m.dead || null, trend: '', read: m.ppm == null ? null : c.id,
        state: m.dead ? 'na' : null, chart: slot || null, range: range,
        ring: { min: 0, max: C.MAX, color: C.color(m.lv), marks: C.LIMITS.slice() } });
      // Tapping a range segment switches the chart in the slot (_hpPlantTap → _hpPlantShow, as the printer's power).
      return slot ? '<div data-casora-nodismiss="" ontouchstart="window._hpPlantTap&&window._hpPlantTap(event,\'s\')"'
        + ' ontouchend="window._hpPlantTap&&window._hpPlantTap(event,\'t\')" onclick="window._hpPlantTap&&window._hpPlantTap(event,\'c\')">'
        + html + '</div>' : html;
    }
    if (part === 'todo') {
      if (m.lv == null) return '';
      var a = C.ADVICE[m.lv];
      return UI.group([{ icon: a.icon, iconTone: C.TONE[m.lv], label: a.label, sub: a.sub, subWrap: true }], 'Was tun');
    }
    if (part === 'levels') {
      return UI.group(C.WORD.map(function (w, i) {
        return { icon: 'mdi:circle', iconTone: C.TONE[i], label: w, value: C.RANGE[i], active: m.lv === i };
      }), 'Stufen');
    }
    if (part === 'device') {
      var rows = [];
      var now = Date.now();
      if (m.alarm && S[m.alarm]) {
        var as = S[m.alarm];
        rows.push({ entity: m.alarm, icon: 'mdi:alarm-light-outline', iconTone: m.alarmOn ? 'bad' : null, label: 'CO-Alarm',
          value: !usable(as) ? 'Nicht verfügbar' : m.alarmOn ? 'Ausgelöst' : 'Kein Alarm', valueTone: m.alarmOn ? 'bad' : null });
      }
      if (m.smoke && S[m.smoke]) {
        var ss = S[m.smoke], sOn = ss.state === 'on';
        rows.push({ entity: m.smoke, icon: 'mdi:smoke-detector-variant', iconTone: sOn ? 'bad' : null, label: 'Rauchalarm',
          value: !usable(ss) ? 'Nicht verfügbar' : sOn ? 'Ausgelöst' : 'Kein Alarm', valueTone: sOn ? 'bad' : null });
      }
      if (m.battery && S[m.battery]) {
        var B = window.casoraBattery, bs = S[m.battery], blv = B ? B.level(bs) : null;
        rows.push({ entity: m.battery, icon: B ? B.icon(blv, B.pct(bs)) : 'mdi:battery', iconTone: B ? B.tone(blv) : null, label: 'Batterie',
          value: !usable(bs) ? 'Nicht verfügbar' : B ? B.text(bs) : bs.state, valueTone: B ? B.tone(blv) : null });
      }
      m.faults.forEach(function (x) {
        if (!S[x] || S[x].state !== 'on') return;
        var eol = (((h.entities || {})[x]) || {}).translation_key === 'end_of_service';
        rows.push({ entity: x, icon: 'mdi:alert-circle-outline', iconTone: 'bad', label: eol ? 'Lebensdauer abgelaufen' : 'Gerätefehler',
          value: eol ? 'Melder tauschen' : 'Prüfen', valueTone: 'bad' });
      });
      if (m.test && S[m.test]) {
        var run = !!(m.testRun && S[m.testRun] && S[m.testRun].state === 'on');
        var pressed = Date.parse(S[m.test].state);
        rows.push({ icon: 'mdi:bell-ring-outline', label: 'Selbsttest', sub: run ? 'Läuft …' : isFinite(pressed) ? 'Letzter Test ' + ago(pressed, now) : null,
          action: run ? null : 'Starten', svc: run || !usable(S[m.test]) ? null : { domain: 'button', service: 'press', target: { entity_id: m.test }, done: 'Selbsttest gestartet' },
          confirm: 'Selbsttest starten? Der Melder piept laut.' });
      }
      // Last raised value, from the last 7 days (the same history the reading page loads, kicked when it is in).
      var Z = window._casoraZiele, rowsH = Z && Z.history && !m.dead ? Z.history(h, c.id, '7d', el) : null;
      if (rowsH) {
        var hi = C.lastHigh(rowsH, now);
        rows.push({ icon: 'mdi:history', label: 'Zuletzt erhöht',
          value: !hi ? 'Nicht in 7 Tagen' : hi.now ? 'Jetzt' : ago(hi.t, now) + ' · max. ' + fmt(hi.max) + ' ' + m.unit });
      }
      return rows.length ? UI.group(rows, 'Melder') : '';
    }
    return '';
  };

  // The popup's cards: v3 (Casora look) its own – the level in the head, the dial with the Verlauf, right what to do, the
  // levels and the detector; other looks HA's rows and the history of the last 24 hours.
  C.popup = function (entity, hass, vars) {
    var id = entity && entity.entity_id;
    if (!id || !hass) return { type: 'vertical-stack', cards: [] };
    var m = C.model(hass, id), S = hass.states || {};
    if (C.v3()) {
      var KIT = window._casoraSoftKit;
      C.charts(id);
      var cj = JSON.stringify({ id: id });
      var call = function (p) { return 'return window._casoraCo ? window._casoraCo.sec(' + JSON.stringify(p) + ', ' + cj + ', states, hass, this) : "";'; };
      var f = { hero: { card: KIT.secCard(m.watch, call('hero'), S) },
        stage: { card: KIT.secCard([id, m.alarm], call('stage'), S) },
        todo: { card: KIT.secCard([id, m.alarm], call('todo'), S) },
        levels: { card: KIT.secCard([id, m.alarm], call('levels'), S) },
        device: { card: KIT.secCard(m.watch, call('device'), S) } };
      return KIT.layout({ fields: f, top: ['hero'], stage: 'stage', left: [], right: ['todo', 'levels', 'device'], entity: id });
    }
    var ents = [id].concat(m.watch.filter(function (x) { return x !== id; })).filter(function (x) { return S[x]; });
    return { type: 'vertical-stack', cards: [{ type: 'entities', entities: ents }, { type: 'history-graph', hours_to_show: 24, entities: [id] }] };
  };
})();
