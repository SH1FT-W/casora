// ── Chart: tile + popup (community card, card request #50) ─────────────────────
// One tile for any numeric sensor with a state class (CPU load of System Monitor, temperature, power, energy …).
// The tile shows the current value with its unit and a 24 h sparkline; the popup draws Casora's own chart
// (casora-chart.js) over 24 h / 7 days / 30 days / a year with up to four sensors (Studio fields entity_2…4 with
// label and color), a legend, and the main sensor's lowest, highest and average – or, for counters (total_increasing),
// today's and the range's consumption – from the recorder's long-term statistics (recorder/statistics_during_period:
// hourly for 24 h, daily for 7/30 days, monthly for the year). The 24 h line itself comes from the history.
// Shape (Studio "Display": automatic / line / bars, plus a switch in the popup remembered per sensor for the session):
// automatic draws bars for counters and a line for readings; bars have one bucket per hour (24 h), day (7/30 d)
// or month (year), several sensors side by side. Studio "Range when opening" picks the first range.
//   window._casoraChartCard.kind(st)                         → 'measurement' | 'total' | null (not numeric)
//   window._casoraChartCard.value(st, hass)                  → "23 %", "21,5 °C", "Nicht verfügbar"
//   window._casoraChartCard.series(entity, V, hass)          → [{entity, name, color, unit}] main + entity_2…4
//   window._casoraChartCard.autoShape(kind)                  → 'bar' for counters, 'line' for readings
//   window._casoraChartCard.chartCfg(series, span, kind, shape) → casora-chart card config
//   window._casoraChartCard.summarize(rows, kind, span, now) → {min, max, mean} | {sum, today, perDay} from a WS answer
//   window._casoraChartCard.stats(hass, id, span, el)        → the same, fetched once per range (null while loading)
//   window._casoraChartCard.span(id) / setSpan(id, span), shape(id) / setShape(id, shape) – session choice per sensor
//   window._casoraChartCard.popup(entity, states, hass, V)   – popup casora_popup_chart
//   window._casoraChartCard.sec(part, C, states, hass, el)   – live parts (hero, range, series, stats)
(function () {
  if (window._casoraChartCard) return;
  var M = window._casoraChartCard = {};

  var SPANS = ['24h', '7d', '30d', '1y'];
  var MS = { '24h': 864e5, '7d': 7 * 864e5, '30d': 30 * 864e5, '1y': 365 * 864e5 };
  var LABEL = { '24h': '24 Std.', '7d': '7 Tage', '30d': '30 Tage', '1y': 'Jahr' };
  var HEAD = { '24h': 'Letzte 24 Std.', '7d': 'Letzte 7 Tage', '30d': 'Letzte 30 Tage', '1y': 'Letzte 12 Monate' };
  // Statistics period = bar bucket per range.
  var PERIOD = { '24h': 'hour', '7d': 'day', '30d': 'day', '1y': 'month' };
  var SHAPES = ['line', 'bar'];
  var SHAPE_LABEL = { line: 'Linie', bar: 'Balken' };
  // casora-chart's checked colour steps (blue, orange, teal, gold) for series without a Studio colour; the same
  // tones as theme variables for rows outside the chart's shadow root.
  var STEPS = ['c1', 'c2', 'c3', 'c4'];
  var STEP_VAR = { c1: 'var(--casora-chart-c1, #4A7DBA)', c2: 'var(--casora-chart-c2, #C8743A)',
    c3: 'var(--casora-chart-c3, #008A7E)', c4: 'var(--casora-chart-c4, #A88327)' };
  M.SPANS = SPANS;
  M.LABEL = LABEL;
  M.SHAPES = SHAPES;

  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };
  // Strictly a number ("23", "-1.5"): parseFloat would read 2026 out of a timestamp.
  var numOf = function (s) { s = String(s == null ? '' : s).trim(); return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN; };
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };
  var hm = function (ms) { var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); };
  var dayStart = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var monthStart = function (ms, back) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth() - (back || 0), 1).getTime(); };
  // Start of the current bucket of a range: today (hours/days) or this month (year).
  var curStart = function (span, now) { return span === '1y' ? monthStart(now) : dayStart(now); };
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
  // two, three for small values under 0.1 so "0.004 A" does not read "0") – CPU "23" stays "23 %", a temperature
  // "48.5" keeps one decimal; values from 100 on have none, derived values (average, consumption) at least one
  // when the sensor has any.
  M.precision = function (hass, id, v) {
    var e = ((hass && hass.entities) || {})[id] || {};
    var p = e.display_precision != null ? e.display_precision : (e.options && e.options.sensor && e.options.sensor.display_precision);
    if (p != null && isFinite(p)) return Math.max(0, Math.min(4, +p));
    var st = (hass && hass.states && hass.states[id]) || {};
    var m = /\.(\d+)$/.exec(String(st.state == null ? '' : st.state).trim());
    var cap = v != null && isFinite(v) && Math.abs(v) < 0.1 ? 3 : 2;
    return m ? Math.min(cap, m[1].replace(/0+$/, '').length) : 0;
  };
  M.fmt = function (hass, id, v) {
    var n = parseFloat(v);
    if (!isFinite(n)) return String(v == null ? '' : v);
    var st = (hass && hass.states && hass.states[id]) || {}, a = st.attributes || {};
    var d = Math.abs(n) >= 100 ? 0 : M.precision(hass, id, n);
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

  // Automatic shape: counters (energy, water, rainfall – what counts up) as bars, readings as a line.
  M.autoShape = function (kind) { return kind === 'total' ? 'bar' : 'line'; };
  // Chart per range and shape. Line: 24 h live from the history (15-min means), 7/30 days from the daily statistics,
  // the year from monthly means. Bars: one bucket per hour / day / month – counters as consumption per bucket
  // (statistics change), readings as the bucket's mean (24 h from the history, so the current hour is in). Same
  // unit: one chart with a legend (bars side by side); different units: casora-chart's own switch between the
  // series. The hero reads the value while scrubbing.
  M.chartCfg = function (series, span, kind, shape) {
    series = series || [];
    shape = shape || M.autoShape(kind);
    var cfg = { type: 'custom:casora-chart', kind: shape === 'bar' ? 'bar' : 'line', span: span, height: 190, readout: 'hero', plate: true,
      series: series.map(function (s) { return { entity: s.entity, name: s.name, color: s.color }; }) };
    if (series.length > 1 && M.sameUnit(series)) cfg.switch = false;
    if (shape === 'bar') {
      cfg.period = PERIOD[span] || 'day';
      cfg.source = kind === 'total' ? 'change' : span === '24h' ? 'history' : 'stats';
      return cfg;
    }
    cfg.source = span === '24h' ? 'history' : 'stats';
    if (span === '1y') cfg.period = 'month';
    // Coarser means over days like the device popups (01-basis.js _hpSmooth): hourly means over a week drew spikes.
    cfg.bucket = span === '24h' ? '15min' : span === '7d' ? '6h' : span === '30d' ? '1d' : '30d';
    return cfg;
  };
  M.key = function (id, span, shape) { return 'casora_chart:' + id + '|' + span + (shape ? '|' + shape : ''); };

  // ── Statistics (one request per sensor and range, refreshed every 5 minutes) ─
  // rows: recorder/statistics_during_period answer for one sensor (hourly for 24 h, daily for 7/30 days, monthly
  // for the year). Counters: today (year: this month), the range's sum and the average per whole day / month.
  M.summarize = function (rows, kind, span, now) {
    now = now || Date.now();
    var pts = (rows || []).map(function (p) {
      var t = typeof p.start === 'number' ? p.start : Date.parse(p.start);
      return { t: t, mean: p.mean, min: p.min, max: p.max, change: p.change };
    }).filter(function (p) { return isFinite(p.t); });
    var ok = function (v) { return v != null && isFinite(v); };
    var out = { kind: kind, span: span, n: 0, empty: true };
    if (kind === 'total') {
      var cur = curStart(span, now), sum = 0, today = 0, n = 0, full = 0;
      pts.forEach(function (p) {
        if (!ok(p.change)) return;
        n++; sum += p.change;
        if (p.t >= cur) today += p.change; else if (span !== '24h') full++;
      });
      out.n = n; out.empty = !n; out.sum = n ? sum : null; out.today = n ? today : null;
      // Average per whole day or month (the current one is still running).
      out.perDay = full && span !== '1y' ? (sum - today) / full : null;
      out.perMonth = full && span === '1y' ? (sum - today) / full : null;
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
  // Units for recorder/statistics_during_period: the sensor's display unit by device class, so a counter stored
  // in Wh and shown in kWh sums in kWh. Keys and valid units as HA's UNIT_SCHEMA (recorder/websocket_api.py,
  // 2026.10); anything else is left out – an unknown unit would fail the whole request.
  var UNIT_CLASS = { apparent_power: 'apparent_power', area: 'area', blood_glucose_concentration: 'blood_glucose_concentration',
    carbon_monoxide: 'carbon_monoxide', absolute_humidity: 'concentration', volatile_organic_compounds: 'concentration',
    conductivity: 'conductivity', data_rate: 'data_rate', distance: 'distance', precipitation: 'distance', duration: 'duration',
    current: 'electric_current', energy: 'energy', energy_storage: 'energy', energy_distance: 'energy_distance',
    frequency: 'frequency', data_size: 'information', weight: 'mass', nitrogen_dioxide: 'nitrogen_dioxide',
    nitrogen_monoxide: 'nitrogen_monoxide', ozone: 'ozone', power: 'power', pressure: 'pressure', atmospheric_pressure: 'pressure',
    radon: 'radiation_concentration', reactive_energy: 'reactive_energy', reactive_power: 'reactive_power', speed: 'speed',
    wind_speed: 'speed', precipitation_intensity: 'speed', sulphur_dioxide: 'sulphur_dioxide', temperature: 'temperature',
    temperature_delta: 'temperature_delta', power_factor: 'unitless', volatile_organic_compounds_parts: 'unitless',
    voltage: 'voltage', volume: 'volume', volume_storage: 'volume', water: 'volume', gas: 'volume', volume_flow_rate: 'volume_flow_rate' };
  var UNITS = {
    apparent_power: 'VA|kVA|mVA', area: 'ac|cm²|ft²|ha|in²|km²|mi²|mm²|m²|yd²', blood_glucose_concentration: 'mg/dL|mmol/L',
    carbon_monoxide: 'mg/m³|ppb|ppm|μg/m³', concentration: 'g/m³|mg/m³|μg/m³', conductivity: 'S/cm|mS/cm|μS/cm',
    data_rate: 'B/s|GB/s|Gbit/s|GiB/s|KiB/s|MB/s|Mbit/s|MiB/s|bit/s|kB/s|kbit/s', distance: 'cm|ft|in|km|m|mi|mm|nmi|yd',
    duration: 'd|h|min|ms|s|w|μs', electric_current: 'A|mA|μA', energy: 'GJ|GWh|Gcal|J|MJ|MWh|Mcal|TWh|Wh|cal|kJ|kWh|kcal|mWh|thm',
    energy_distance: 'Wh/km|kWh/100km|km/kWh|mi/kWh', frequency: 'GHz|Hz|MHz|kHz|mHz',
    information: 'B|EB|EiB|GB|Gbit|GiB|KiB|MB|Mbit|MiB|PB|PiB|TB|TiB|YB|YiB|ZB|ZiB|bit|kB|kbit', mass: 'g|kg|lb|mg|oz|st|μg',
    nitrogen_dioxide: 'ppb|ppm|μg/m³', nitrogen_monoxide: 'ppb|μg/m³', ozone: 'ppb|ppm|μg/m³', power: 'BTU/h|GW|MW|TW|W|kW|mW',
    pressure: 'Pa|atm|bar|cbar|hPa|inHg|inH₂O|kPa|mPa|mbar|mmHg|psi', radiation_concentration: 'Bq/m³|pCi/L',
    reactive_energy: 'kvarh|varh', reactive_power: 'kvar|mvar|var', speed: 'Beaufort|ft/s|in/d|in/h|in/s|km/h|kn|m/min|m/s|mm/d|mm/h|mm/s|mph',
    sulphur_dioxide: 'ppb|μg/m³', temperature: 'K|°C|°F', temperature_delta: 'K|°C|°F', unitless: '%|ppb|ppm', voltage: 'MV|V|kV|mV|μV',
    volume: 'CCF|L|MCF|ft³|gal|mL|m³', volume_flow_rate: 'L/h|L/min|L/s|ft³/min|gal/d|gal/h|gal/min|mL/s|m³/h|m³/min|m³/s' };
  M.units = function (st) {
    var a = (st && st.attributes) || {}, key = UNIT_CLASS[a.device_class], u = a.unit_of_measurement;
    if (!key || !u || ('|' + UNITS[key] + '|').indexOf('|' + u + '|') < 0) return null;
    var out = {}; out[key] = u; return out;
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
    var now = Date.now(), per = PERIOD[span];
    // Day buckets start at local midnight, month buckets on the 1st: the range begins there too, so the first
    // bucket is whole – the year is this month plus the eleven before it.
    var from = per === 'month' ? monthStart(now, 11) : per === 'day' ? dayStart(now - MS[span]) : now - MS[span];
    var msg = { type: 'recorder/statistics_during_period', start_time: new Date(from).toISOString(),
      statistic_ids: [id], period: per, types: kind === 'total' ? ['change'] : ['mean', 'min', 'max'] };
    var units = M.units(st);
    if (units) msg.units = units;
    hass.callWS(msg)
      .then(function (r) { cell.data = M.summarize((r && r[id]) || [], kind, span, Date.now()); },
        // A hiccup must not wipe numbers already on screen; the error shows only when there is nothing yet.
        function () { if (!cell.data) cell.data = { kind: kind, span: span, n: 0, empty: true, error: true }; })
      .then(function () {
        cell.busy = false;
        var ws = cell.wait; cell.wait = [];
        ws.forEach(kick);
      });
    return cell.data;
  };

  // ── Range and shape per sensor, shared by all live parts of the popup ───────
  // Studio defaults (chart_span, chart_kind) are set when the popup opens; a tap in the popup wins for the
  // session (not saved to the dashboard). shape: 'line' | 'bar' – without a choice the Studio field, else automatic.
  var spanOf = {}, shapeOf = {}, dflt = {}, parts = {};
  M.span = function (id) { return spanOf[id] || (dflt[id] && dflt[id].span) || '24h'; };
  M.shape = function (id) {
    var d = dflt[id] || {};
    return shapeOf[id] || d.shape || M.autoShape(d.kind);
  };
  M.setDefaults = function (id, V, kind) {
    V = V || {};
    dflt[id] = { span: MS[V.chart_span] ? V.chart_span : '24h', shape: SHAPE_LABEL[V.chart_kind] ? V.chart_kind : null, kind: kind };
  };
  var show = function (id) {
    // The chart in the open popup (01-basis.js keeps the configs per key and swaps the mounted chart).
    if (typeof window._hpPlantShow === 'function') window._hpPlantShow(M.key(id, M.span(id), M.shape(id)), null, true);
    // Hero, range and statistics redraw; the chart card itself is static (a redraw would drop the chart).
    var els = (parts[id] || []).filter(function (e) { return e && e.isConnected; });
    parts[id] = els;
    els.forEach(kick);
  };
  M.setSpan = function (id, span) {
    if (!MS[span]) return;
    spanOf[id] = span;
    show(id);
  };
  M.setShape = function (id, shape) {
    if (!SHAPE_LABEL[shape]) return;
    shapeOf[id] = shape;
    show(id);
  };
  var remember = function (id, el) {
    if (!el) return;
    var list = parts[id] = (parts[id] || []).filter(function (e) { return e && e.isConnected; });
    if (list.indexOf(el) < 0) list.push(el);
  };
  // Tapping a range or shape segment.
  document.addEventListener('click', function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (!n || !n.getAttribute) continue;
      var span = n.hasAttribute('data-casora-cspan'), shape = !span && n.hasAttribute('data-casora-cshape');
      if (!span && !shape) continue;
      ev.preventDefault(); ev.stopPropagation();
      var v = n.getAttribute(span ? 'data-casora-cspan' : 'data-casora-cshape').split('|');
      if (window.casoraHaptic) window.casoraHaptic('selection');
      window._casoraSuppressDismiss = Date.now() + 600;
      if (span) M.setSpan(v[0], v[1]); else M.setShape(v[0], v[1]);
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
    M.setDefaults(id, V, kind);
    // One chart config per range and shape; the popup mounts the current one, the segments swap it.
    if (window._hpPlantCfg) {
      SPANS.forEach(function (sp) {
        SHAPES.forEach(function (sh) {
          window._hpPlantCfg[M.key(id, sp, sh)] = M.chartCfg(series, sp, kind, sh);
          if (window._hpPlantMeta) window._hpPlantMeta[M.key(id, sp, sh)] = [series[0].name, sp, series[0].color];
        });
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
      if (typeof window._hpChartInit === 'function') window._hpChartInit(M.key(id, M.span(id), M.shape(id)), false);
    }
    if (series.length > 1) f.series = { card: K.secCard(watch, call('series'), states) };
    f.stats = { card: K.secCard([id], call('stats'), states) };
    return K.layout({ fields: f, top: ['hero', 'range', 'chart'], left: series.length > 1 ? ['series'] : [], right: ['stats'],
      narrowOrder: ['series', 'stats'] });
  };

  // Time of a statistics bucket: hour → "14:00" / "Gestern 14:00", day → "Heute" / "Gestern" / weekday,
  // month → "Dieser Monat" / "Oktober 2026".
  var at = function (t, span, now) {
    var dd = Math.round((dayStart(now) - dayStart(t)) / 864e5);
    if (span === '24h') return dd <= 0 ? hm(t) : T('Gestern') + ' ' + hm(t);
    if (span === '1y') return t >= monthStart(now) ? T('Dieser Monat') : new Date(t).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
    if (dd <= 0) return T('Heute');
    if (dd === 1) return T('Gestern');
    return new Date(t).toLocaleDateString(loc(), span === '30d' ? { day: 'numeric', month: 'numeric' } : { weekday: 'short' }).replace(/\.$/, '');
  };

  M.sec = function (part, C, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !C || !C.id) return '';
    var st = states && states[C.id];
    var span = M.span(C.id), shape = M.shape(C.id), now = Date.now();
    if (part !== 'series') remember(C.id, el);
    if (part === 'hero') {
      var rest = [];
      var s = st && C.kind ? M.stats(hass, C.id, span, el) : null;
      if (s && !s.empty) {
        if (C.kind === 'total') { if (s.today != null) rest.push(T(span === '1y' ? 'Dieser Monat' : 'Heute') + ' ' + M.fmt(hass, C.id, s.today)); }
        else if (s.mean != null) rest.push('Ø ' + M.fmt(hass, C.id, s.mean) + ' · ' + LABEL[span]);
      }
      return UI.hero({ center: true, value: M.value(st, hass), sub: rest.join(' · ') || null, read: C.id,
        valueTone: st && bad(st.state) ? 'warn' : null });
    }
    if (part === 'range') {
      // Segments like the mode switch: the ranges, beside them the shape (line / bars); each carries its value
      // (click handler above). Narrow (phone) the shape row wraps under the ranges.
      var i = 0, j = 0;
      var out = UI.segments(SPANS.map(function (sp) { return { label: LABEL[sp], active: sp === span }; }), null)
        .replace(/<div class="hui-sg/g, function () { return '<div data-casora-cspan="' + esc(C.id + '|' + SPANS[i++]) + '" class="hui-sg'; });
      if (!C.kind) return out;
      var sw = UI.segments(SHAPES.map(function (sh) { return { label: SHAPE_LABEL[sh], active: sh === shape }; }), null)
        .replace(/<div class="hui-sg/g, function () { return '<div data-casora-cshape="' + esc(C.id + '|' + SHAPES[j++]) + '" class="hui-sg'; });
      return '<div style="display:flex;flex-wrap:wrap;gap:10px 24px;align-items:start;"><div style="flex:3 1 300px;min-width:0;">' + out
        + '</div><div style="flex:1 1 150px;min-width:0;">' + sw + '</div></div>';
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
        // Only a sensor with a state class ever gets long-term statistics.
        var collects = !!(st.attributes || {}).state_class;
        return UI.group([{ icon: 'mdi:chart-line-variant', label: d.error ? 'Statistik nicht abrufbar' : 'Noch keine Statistik',
          sub: d.error ? null : collects ? 'Home Assistant sammelt sie stündlich.' : 'Dieser Sensor hat keine Statistik.' }], head);
      }
      var r = [];
      if (C.kind === 'total') {
        if (d.today != null) r.push({ icon: 'calendar-day', iconTone: 'accent', label: span === '1y' ? 'Dieser Monat' : 'Heute', value: M.fmt(hass, C.id, d.today) });
        if (span !== '24h' && d.sum != null) r.push({ icon: 'calendar', iconTone: 'accent', label: HEAD[span], value: M.fmt(hass, C.id, d.sum) });
        if (d.perDay != null) r.push({ icon: 'mdi:approximately-equal', iconTone: 'accent', label: 'Ø pro Tag', value: M.fmt(hass, C.id, d.perDay) });
        if (d.perMonth != null) r.push({ icon: 'mdi:approximately-equal', iconTone: 'accent', label: 'Ø pro Monat', value: M.fmt(hass, C.id, d.perMonth) });
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
