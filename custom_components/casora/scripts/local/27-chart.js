// ── Chart: tile + popup (community card, card request #50) ─────────────────────
// One tile for any numeric sensor with a state class (CPU load of System Monitor, temperature, power, energy …).
// The tile shows the current value with its unit and a 24 h sparkline; the popup draws Casora's own chart
// (casora-chart.js) over 24 h / 7 days / 30 days with up to four sensors (Studio fields entity_2…4 with label and
// color), a legend, and the main sensor's lowest, highest and average – or, for counters (total_increasing), today's
// and the range's consumption – from the recorder's long-term statistics (recorder/statistics_during_period:
// hourly for 24 h, daily for 7/30 days). The 24 h line itself comes from the history (casora-chart does that).
//   window._casoraChartCard.kind(st)                         → 'measurement' | 'total' | null (not numeric)
//   window._casoraChartCard.value(st, hass)                  → "23 %", "21,5 °C", "Nicht verfügbar"
//   window._casoraChartCard.series(entity, V, hass)          → [{entity, name, color, unit}] main + entity_2…4
//   window._casoraChartCard.chartCfg(series, span, kind)     → casora-chart card config
//   window._casoraChartCard.summarize(rows, kind, span, now) → {min, max, mean} | {sum, today, perDay} from a WS answer
//   window._casoraChartCard.stats(hass, id, span, el)        → the same, fetched once per range (null while loading)
//   window._casoraChartCard.popup(entity, states, hass, V)   – popup casora_popup_chart
//   window._casoraChartCard.sec(part, C, states, hass, el)   – live parts (hero, range, series, stats)
(function () {
  if (window._casoraChartCard) return;
  var M = window._casoraChartCard = {};

  var SPANS = ['24h', '7d', '30d'];
  var MS = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5 };
  var LABEL = { '24h': '24 Std.', '7d': '7 Tage', '30d': '30 Tage' };
  var HEAD = { '24h': 'Letzte 24 Std.', '7d': 'Letzte 7 Tage', '30d': 'Letzte 30 Tage' };
  // casora-chart's checked colour steps (blue, orange, teal, gold) for series without a Studio colour; the same
  // tones as theme variables for rows outside the chart's shadow root.
  var STEPS = ['c1', 'c2', 'c3', 'c4'];
  var STEP_VAR = { c1: 'var(--casora-chart-c1, #4A7DBA)', c2: 'var(--casora-chart-c2, #C8743A)',
    c3: 'var(--casora-chart-c3, #008A7E)', c4: 'var(--casora-chart-c4, #A88327)' };
  M.SPANS = SPANS;
  M.LABEL = LABEL;

  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };
  // Strictly a number ("23", "-1.5"): parseFloat would read 2026 out of a timestamp.
  var numOf = function (s) { s = String(s == null ? '' : s).trim(); return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var hm = function (ms) { var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); };
  var dayStart = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var kick = function (el) {
    try {
      if (typeof window.casoraKick === 'function') window.casoraKick(el);
      else if (el && typeof el.requestUpdate === 'function') el.requestUpdate('_config', undefined);
    } catch (e) { /* popup already closed */ }
  };

  // ── Kind and value ──────────────────────────────────────────────────────────
  // measurement: a reading (CPU load, temperature, power) – lowest/highest/average. total: a counter
  // (energy, total_increasing/total) – consumption per range. null: nothing to chart.
  M.kind = function (st) {
    if (!st) return null;
    var a = st.attributes || {}, sc = a.state_class;
    if (sc === 'total' || sc === 'total_increasing') return 'total';
    if (sc === 'measurement') return 'measurement';
    // No state class: a plain number with a unit still draws a line (statistics stay empty).
    return a.unit_of_measurement && isFinite(numOf(st.state)) ? 'measurement' : null;
  };
  // Number with unit. Decimals: the registry's display precision, else those of the sensor's own state (at most
  // two) – CPU "23" stays "23 %", a temperature "48.5" keeps one decimal; values from 100 on have none, derived
  // values (average, consumption) at least one when the sensor has any.
  M.precision = function (hass, id) {
    var e = ((hass && hass.entities) || {})[id] || {};
    var p = e.display_precision != null ? e.display_precision : (e.options && e.options.sensor && e.options.sensor.display_precision);
    if (p != null && isFinite(p)) return Math.max(0, Math.min(4, +p));
    var st = (hass && hass.states && hass.states[id]) || {};
    var m = /\.(\d+)$/.exec(String(st.state == null ? '' : st.state).trim());
    return m ? Math.min(2, m[1].replace(/0+$/, '').length) : 0;
  };
  M.fmt = function (hass, id, v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return String(v == null ? '' : v);
    var st = (hass && hass.states && hass.states[id]) || {}, a = st.attributes || {};
    var d = Math.abs(n) >= 100 ? 0 : M.precision(hass, id);
    return n.toLocaleString(loc(), { minimumFractionDigits: Math.min(d, 1), maximumFractionDigits: d }) + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
  };
  M.value = function (st, hass) {
    if (!st) return 'Nicht verfügbar';
    if (bad(st.state)) return st.state === 'unknown' ? 'Unbekannt' : 'Nicht verfügbar';
    if (!isFinite(numOf(st.state))) return String(st.state);
    return M.fmt(hass || { states: {} }, st.entity_id, st.state);
  };

  // ── Series: the tile's sensor plus entity_2…4 from the Studio ───────────────
  M.series = function (entity, V, hass) {
    V = V || {};
    var S = (hass && hass.states) || {};
    var out = [];
    var add = function (eid, name, color, i) {
      if (!eid || !S[eid] || out.some(function (x) { return x.entity === eid; })) return;
      var a = S[eid].attributes || {};
      out.push({ entity: eid, name: String(name || a.friendly_name || eid).trim(), color: String(color || '').trim() || STEPS[i % 4],
        unit: String(a.unit_of_measurement || '') });
    };
    add(entity && entity.entity_id, null, V.chart_color, 0);
    [2, 3, 4].forEach(function (n, i) { add(V['entity_' + n], V['label_' + n], V['color_' + n], i + 1); });
    return out;
  };
  M.sameUnit = function (series) { return (series || []).every(function (s) { return s.unit === series[0].unit; }); };
  // Colour as a theme value for rows and legend outside the chart.
  M.tone = function (color) { return STEP_VAR[color] || color || STEP_VAR.c1; };

  // Chart per range: 24 h live from the history (15-min means), 7/30 days from the statistics; a single counter
  // over 7/30 days as bars per day (consumption), otherwise lines. Same unit: one chart with a legend;
  // different units: casora-chart's own switch between the series. The hero reads the value while scrubbing.
  M.chartCfg = function (series, span, kind) {
    var cfg = { type: 'custom:casora-chart', kind: 'line', span: span, height: 190, readout: 'hero', plate: true,
      series: (series || []).map(function (s) { return { entity: s.entity, name: s.name, color: s.color }; }) };
    if (kind === 'total' && series.length === 1 && span !== '24h') { cfg.kind = 'bar'; cfg.source = 'change'; return cfg; }
    cfg.source = span === '24h' ? 'history' : 'stats';
    // Coarser means over days like the device popups (01-basis.js _hpSmooth): hourly means over a week drew spikes.
    cfg.bucket = span === '24h' ? '15min' : span === '7d' ? '6h' : '1d';
    if (series.length > 1 && M.sameUnit(series)) cfg.switch = false;
    return cfg;
  };
  M.key = function (id, span) { return 'casora_chart:' + id + '|' + span; };

  // ── Statistics (one request per sensor and range, refreshed every 5 minutes) ─
  // rows: recorder/statistics_during_period answer for one sensor (hourly for 24 h, daily for 7/30 days).
  M.summarize = function (rows, kind, span, now) {
    now = now || Date.now();
    var pts = (rows || []).map(function (p) {
      var t = typeof p.start === 'number' ? p.start : Date.parse(p.start);
      return { t: t, mean: p.mean, min: p.min, max: p.max, change: p.change };
    }).filter(function (p) { return isFinite(p.t); });
    var ok = function (v) { return v != null && isFinite(v); };
    var out = { kind: kind, span: span, n: 0, empty: true };
    if (kind === 'total') {
      var midnight = dayStart(now), sum = 0, today = 0, n = 0, full = 0;
      pts.forEach(function (p) {
        if (!ok(p.change)) return;
        n++; sum += p.change;
        if (p.t >= midnight) today += p.change; else if (span !== '24h') full++;
      });
      out.n = n; out.empty = !n; out.sum = n ? sum : null; out.today = n ? today : null;
      // Average per whole day (today is still running).
      out.perDay = full ? (sum - today) / full : null;
      return out;
    }
    var mn = null, mx = null, s = 0, k = 0;
    pts.forEach(function (p) {
      if (ok(p.min) && (!mn || p.min < mn.v)) mn = { v: p.min, t: p.t };
      if (ok(p.max) && (!mx || p.max > mx.v)) mx = { v: p.max, t: p.t };
      if (ok(p.mean)) { s += p.mean; k++; }
    });
    out.n = k; out.empty = !k && !mn && !mx; out.min = mn; out.max = mx; out.mean = k ? s / k : null;
    return out;
  };
  var cache = {};
  M.stats = function (hass, id, span, el) {
    var st = hass && hass.states && hass.states[id];
    if (!st || typeof hass.callWS !== 'function') return null;
    span = MS[span] ? span : '24h';
    var kind = M.kind(st) || 'measurement';
    var ck = id + '|' + span, key = ck + '|' + Math.floor(Date.now() / 300000);
    var hit = cache[ck];
    if (hit && hit.key === key) { if (el && hit.busy && hit.wait.indexOf(el) < 0) hit.wait.push(el); return hit.data; }
    var cell = cache[ck] = { key: key, data: hit ? hit.data : null, busy: true, wait: el ? [el] : [] };
    var now = Date.now(), day = span !== '24h';
    hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(now - MS[span]).toISOString(),
      statistic_ids: [id], period: day ? 'day' : 'hour', types: kind === 'total' ? ['change'] : ['mean', 'min', 'max'] })
      .then(function (r) { cell.data = M.summarize((r && r[id]) || [], kind, span, Date.now()); },
        function () { cell.data = { kind: kind, span: span, n: 0, empty: true, error: true }; })
      .then(function () {
        cell.busy = false;
        var ws = cell.wait; cell.wait = [];
        ws.forEach(kick);
      });
    return cell.data;
  };

  // ── Range per sensor, shared by all live parts of the popup ─────────────────
  var spanOf = {}, parts = {};
  M.span = function (id) { return spanOf[id] || '24h'; };
  M.setSpan = function (id, span) {
    if (!MS[span]) return;
    spanOf[id] = span;
    // The chart in the open popup (01-basis.js keeps the configs per key and swaps the mounted chart).
    if (typeof window._hpPlantShow === 'function') window._hpPlantShow(M.key(id, span), null, true);
    // Hero, range and statistics redraw; the chart card itself is static (a redraw would drop the chart).
    var els = (parts[id] || []).filter(function (e) { return e && e.isConnected; });
    parts[id] = els;
    els.forEach(kick);
  };
  var remember = function (id, el) {
    if (!el) return;
    var list = parts[id] = (parts[id] || []).filter(function (e) { return e && e.isConnected; });
    if (list.indexOf(el) < 0) list.push(el);
  };
  // Tapping a range segment.
  document.addEventListener('click', function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (!n || !n.getAttribute || !n.hasAttribute('data-casora-cspan')) continue;
      ev.preventDefault(); ev.stopPropagation();
      var v = n.getAttribute('data-casora-cspan').split('|');
      if (window.casoraHaptic) window.casoraHaptic('selection');
      window._casoraSuppressDismiss = Date.now() + 600;
      M.setSpan(v[0], v[1]);
      return;
    }
  }, true);

  // ── Popup ───────────────────────────────────────────────────────────────────
  M.popup = function (entity, states, hass, V) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var id = entity && entity.entity_id;
    if (!id || !states[id]) return empty;
    var series = M.series(entity, V, hass);
    var kind = M.kind(states[id]);
    var C = { id: id, kind: kind, series: series };
    // One chart config per range; the popup mounts the current one, the segments swap it.
    if (window._hpPlantCfg) {
      SPANS.forEach(function (sp) {
        window._hpPlantCfg[M.key(id, sp)] = M.chartCfg(series, sp, kind);
        if (window._hpPlantMeta) window._hpPlantMeta[M.key(id, sp)] = [series[0].name, sp, series[0].color];
      });
    }
    var watch = series.map(function (s) { return s.entity; });
    var call = function (part) {
      return 'return window._casoraChartCard ? window._casoraChartCard.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(C) + ', states, hass, this) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, range: { card: K.secCard([id], call('range'), states) } };
    if (kind) {
      // Static card: the chart element lives in this slot and must not be redrawn with the live parts.
      var chart = K.bare();
      chart.styles = { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
        grid: [{ 'grid-template-areas': '"c"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }],
        custom_fields: { c: [{ 'justify-self': 'stretch' }, { overflow: 'visible' }] } };
      chart.custom_fields = { c: '<div class="hp-chart-slot" style="min-height:230px;pointer-events:auto;"></div>' };
      f.chart = { card: chart };
      if (typeof window._hpChartInit === 'function') window._hpChartInit(M.key(id, M.span(id)), false);
    }
    if (series.length > 1) f.series = { card: K.secCard(watch, call('series'), states) };
    f.stats = { card: K.secCard([id], call('stats'), states) };
    return K.layout({ fields: f, top: ['hero', 'range', 'chart'], left: series.length > 1 ? ['series'] : [], right: ['stats'],
      narrowOrder: ['series', 'stats'] });
  };

  // Time of a statistics bucket: hour → "14:00" / "Gestern 14:00", day → "Heute" / "Gestern" / weekday.
  var at = function (t, span, now) {
    var dd = Math.round((dayStart(now) - dayStart(t)) / 864e5);
    if (span === '24h') return dd <= 0 ? hm(t) : T('Gestern') + ' ' + hm(t);
    if (dd <= 0) return T('Heute');
    if (dd === 1) return T('Gestern');
    return new Date(t).toLocaleDateString(loc(), span === '30d' ? { day: 'numeric', month: 'numeric' } : { weekday: 'short' }).replace(/\.$/, '');
  };

  M.sec = function (part, C, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !C || !C.id) return '';
    var st = states && states[C.id];
    var span = M.span(C.id), now = Date.now();
    if (part !== 'series') remember(C.id, el);
    if (part === 'hero') {
      var rest = [];
      var s = st && C.kind ? M.stats(hass, C.id, span, el) : null;
      if (s && !s.empty) {
        if (C.kind === 'total') { if (s.today != null) rest.push(T('Heute') + ' ' + M.fmt(hass, C.id, s.today)); }
        else if (s.mean != null) rest.push('Ø ' + M.fmt(hass, C.id, s.mean) + ' · ' + LABEL[span]);
      }
      return UI.hero({ center: true, value: M.value(st, hass), sub: rest.join(' · ') || null, read: C.id,
        valueTone: st && bad(st.state) ? 'warn' : null });
    }
    if (part === 'range') {
      // Segments like the mode switch; each carries its range (click handler above).
      var i = 0;
      var out = UI.segments(SPANS.map(function (sp) { return { label: LABEL[sp], active: sp === span }; }), null);
      return out.replace(/<div class="hui-sg/g, function () { return '<div data-casora-cspan="' + esc(C.id + '|' + SPANS[i++]) + '" class="hui-sg'; });
    }
    if (part === 'series') {
      var rows = (C.series || []).map(function (x) {
        var sx = states[x.entity];
        return { entity: x.entity, icon: 'mdi:chart-line', iconTone: M.tone(x.color), label: x.name, value: M.value(sx, hass),
          valueTone: sx && bad(sx.state) ? 'warn' : null };
      });
      return rows.length ? UI.group(rows, 'Linien') : '';
    }
    if (part === 'stats') {
      var head = HEAD[span];
      if (!st || !C.kind) return UI.group([{ icon: 'mdi:chart-line-variant', label: 'Kein Zahlenwert', sub: 'Dieser Sensor liefert keine Zahl.' }], head);
      var d = M.stats(hass, C.id, span, el);
      if (d == null) return UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], head);
      if (d.empty) {
        return UI.group([{ icon: 'mdi:chart-line-variant', label: d.error ? 'Statistik nicht abrufbar' : 'Noch keine Statistik',
          sub: d.error ? null : 'Home Assistant sammelt sie stündlich.' }], head);
      }
      var r = [];
      if (C.kind === 'total') {
        if (d.today != null) r.push({ icon: 'calendar-day', iconTone: 'accent', label: 'Heute', value: M.fmt(hass, C.id, d.today) });
        if (span !== '24h' && d.sum != null) r.push({ icon: 'calendar', iconTone: 'accent', label: HEAD[span], value: M.fmt(hass, C.id, d.sum) });
        if (d.perDay != null) r.push({ icon: 'mdi:approximately-equal', iconTone: 'accent', label: 'Ø pro Tag', value: M.fmt(hass, C.id, d.perDay) });
      } else {
        if (d.max) r.push({ icon: 'mdi:arrow-up-bold-outline', iconTone: 'bad', label: 'Höchster Wert', sub: at(d.max.t, span, now), value: M.fmt(hass, C.id, d.max.v) });
        if (d.min) r.push({ icon: 'mdi:arrow-down-bold-outline', iconTone: 'accent', label: 'Tiefster Wert', sub: at(d.min.t, span, now), value: M.fmt(hass, C.id, d.min.v) });
        if (d.mean != null) r.push({ icon: 'mdi:approximately-equal', iconTone: 'accent', label: 'Durchschnitt', value: M.fmt(hass, C.id, d.mean) });
      }
      return r.length ? UI.group(r, head) : '';
    }
    return '';
  };
})();
