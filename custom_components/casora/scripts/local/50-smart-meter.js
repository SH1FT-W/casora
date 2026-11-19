// ── Smart meter (community card „Smart Meter“, card request 208) ───────────────────────────────────────────────────
// For homes with a smart meter and no solar (Hildebrand Glow, Octopus Energy): today's electricity and gas on the tile,
// the popup with the totals of a day, a week or a month – usage and cost of electricity and gas apart – and a chart.
// The integrations give daily counters that reset at midnight (consumption, cost, standing charge, the day's total);
// week and month come from the long-term statistics of those sensors (recorder/statistics_during_period, one request
// per range, kept 5 minutes), built like the energy popup's consumption per device (48-energie-verlauf.js: its buckets
// EV.plan, first weekday EV.firstDay, average EV.average). A day of a daily counter is its last state of that day (a
// standing charge never rises, its change is 0); a running meter (never resets) counts its change instead – told apart
// by its states (SM.mode). Today always comes from the sensors themselves.
// Sensors: the Studio fields, else casoraSmartMeterFind (00-finder.js) on the tile's integration.
// Popup v3 „Bühne“ (popup-richtlinien-v3.md §4 S6, §7): S6 with the range's total (cost, else usage) over stacked bars
// (electricity, gas, standing charge), Tag · Woche · Monat as the segment; right electricity and gas, each with usage
// and cost (tapping a row switches the chart between cost and usage, v2 rule 9), then standing charge and total.
//   SM.model(hass, id, vars)              → { id, slots: { elecUse, elecCost, gasUse, gasCost, standing, total }, ids, cur, … }
//   SM.live(hass, m)                      → today's values from the sensors (kWh, currency)
//   SM.tileState(st, hass, vars)          → tile text („Strom 1,20 £ · Gas 1,21 £“), SM.tileShort → „heute 2,41 £“
//   SM.mode(rows)                         → 'daily' (resets at midnight) | 'total' (a running meter)
//   SM.aggregate(rows, m, plan, live)     → { plan, vals: { slot: [per bucket] }, sums: { slot: total }, has }
//   SM.view(agg, m, metric)               → { total, unit, avg, series } for the stage
//   SM.load(hass, m, range, el)           → statistics answer (cached), 'wait' while it is out, null without statistics
//   SM.sec(part, c, states, hass, el)     → live parts: 'hero', 'stage', 'elec', 'gas', 'sum'
// Pure parts are tested in dev/unit/smart_meter.mjs.
(function () {
  if (window._casoraSmartMeter) return;
  var SM = window._casoraSmartMeter = {};
  var RANGES = ['day', 'week', 'month'];
  var LABEL = { day: 'Tag', week: 'Woche', month: 'Monat' };
  var SLOTS = ['elecUse', 'elecCost', 'gasUse', 'gasCost', 'standing', 'total'];
  var VARS = { elecUse: 'elec_energy_entity', elecCost: 'elec_cost_entity', gasUse: 'gas_energy_entity',
    gasCost: 'gas_cost_entity', standing: 'standing_entity', total: 'total_cost_entity' };
  var READ = 'casora_smart_meter';
  var CHART = 'sm:stack';
  // The chart's colour steps (casora-chart.js) like the consumption per device; the standing charge neutral.
  var COLOR = { elec: 'c1', gas: 'c2', standing: 'var(--cink3)' };
  SM.SLOTS = SLOTS;
  SM.VARS = VARS;
  SM.RANGES = RANGES;

  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var EVh = function () { return window._casoraEnergyHistory || null; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var usable = function (st) { return !!st && st.state !== 'unavailable' && st.state !== 'unknown'; };
  var varId = function (v, k) { var x = v && v[k]; return typeof x === 'string' && x && x !== 'None' ? x : null; };
  var tOf = function (p) { return typeof p.start === 'number' ? p.start : Date.parse(p.start); };
  var nf = function (v, d) {
    try { return Number(v).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d }); } catch (e) { return Number(v).toFixed(d); }
  };

  // ── Units ─────────────────────────────────────────────────────────────────
  // Energy in kWh (the statistics are asked in kWh too); gas in m³ stays as it is.
  var KWH = { Wh: 0.001, kWh: 1, MWh: 1000, GWh: 1e6 };
  SM.kwh = function (v, unit) { var f = KWH[String(unit || 'kWh')]; return v == null ? null : f ? v * f : v; };
  SM.useUnit = function (unit) { return KWH[String(unit || '')] ? 'kWh' : String(unit || 'kWh'); };
  // Money in the sensor's currency (HA: an ISO code like GBP): Intl writes it („1,20 £“, „£1.20“); another unit after the number.
  SM.money = function (v, cur) {
    if (v == null || !isFinite(v)) return '—';
    var c = String(cur || '');
    if (/^[A-Z]{3}$/.test(c)) {
      try { return Number(v).toLocaleString(loc(), { style: 'currency', currency: c }); } catch (e) { /* unknown code */ }
    }
    return nf(v, 2) + (c ? ' ' + c : '');
  };
  // The currency's sign for the chart's unit („£“), else the unit itself.
  SM.symbol = function (cur) {
    var c = String(cur || '');
    if (!/^[A-Z]{3}$/.test(c)) return c;
    try {
      var p = new Intl.NumberFormat(loc(), { style: 'currency', currency: c, currencyDisplay: 'narrowSymbol' }).formatToParts(0);
      for (var i = 0; i < p.length; i++) if (p[i].type === 'currency') return p[i].value;
    } catch (e) { /* unknown code */ }
    return c;
  };
  SM.energy = function (v, unit) {
    if (v == null || !isFinite(v)) return '—';
    return nf(v, v >= 100 ? 0 : v >= 10 ? 1 : v > 0 && v < 1 ? 2 : 1) + ' ' + (unit || 'kWh');
  };

  // ── The sensors of the tile ─────────────────────────────────────────────────
  SM.model = function (hass, id, vars) {
    var S = (hass && hass.states) || {}, F = window.casoraSmartMeterFind;
    var met = F && hass ? F.of(hass, id) : null, k = F && hass ? F.kind(hass, id) : null;
    var m = { id: id, slots: {} };
    SLOTS.forEach(function (s) {
      var x = varId(vars, VARS[s]);
      m.slots[s] = x ? (S[x] ? x : null) : (met && met[s]) || null;
    });
    // The tile's own sensor holds its slot even when the finder grouped it elsewhere.
    if (k) {
      var own = k.fuel === 'standing' || k.fuel === 'total' ? k.fuel : k.fuel + (k.metric === 'use' ? 'Use' : 'Cost');
      if (!varId(vars, VARS[own]) && !m.slots[own]) m.slots[own] = id;
    }
    m.ids = SLOTS.map(function (s) { return m.slots[s]; }).filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    var costId = m.slots.elecCost || m.slots.gasCost || m.slots.total || m.slots.standing;
    m.cur = costId ? String(((S[costId] || {}).attributes || {}).unit_of_measurement || '') : '';
    var u = function (s) { var x = m.slots[s]; return x ? String(((S[x] || {}).attributes || {}).unit_of_measurement || '') : ''; };
    m.unitElec = SM.useUnit(u('elecUse') || 'kWh');
    m.unitGas = SM.useUnit(u('gasUse') || 'kWh');
    m.raw = { elecUse: u('elecUse'), gasUse: u('gasUse') };
    m.elec = !!(m.slots.elecUse || m.slots.elecCost);
    m.gas = !!(m.slots.gasUse || m.slots.gasCost);
    m.hasCost = !!(m.slots.elecCost || m.slots.gasCost || m.slots.standing || m.slots.total);
    m.hasUse = !!(m.slots.elecUse || m.slots.gasUse);
    return m;
  };
  // Today, straight from the daily counters. null: no sensor or no number.
  SM.live = function (hass, m) {
    var S = (hass && hass.states) || {}, out = {};
    SLOTS.forEach(function (s) {
      var x = m.slots[s], st = x && S[x];
      var v = usable(st) ? num(st.state) : null;
      if (v != null && (s === 'elecUse' || s === 'gasUse')) v = SM.kwh(v, m.raw[s]);
      out[s] = v;
    });
    return out;
  };
  // Cost of a period: electricity + gas + standing charge; without any of them the total sensor.
  SM.costOf = function (v) {
    var parts = ['elecCost', 'gasCost', 'standing'].filter(function (s) { return v[s] != null; });
    if (!parts.length) return v.total != null ? v.total : null;
    return parts.reduce(function (a, s) { return a + v[s]; }, 0);
  };
  SM.useOf = function (v, m) {
    if (m && m.slots.elecUse && m.slots.gasUse && m.unitElec !== m.unitGas) return v.elecUse;
    var parts = ['elecUse', 'gasUse'].filter(function (s) { return v[s] != null; });
    return parts.length ? parts.reduce(function (a, s) { return a + v[s]; }, 0) : null;
  };

  // ── Tile ──────────────────────────────────────────────────────────────────
  // Studio „On the tile“: cost (default, with a cost sensor) or usage.
  var tileMetric = function (m, vars) {
    return (vars && vars.tile_value === 'usage') || !m.hasCost ? 'use' : 'cost';
  };
  SM.tileState = function (st, hass, vars) {
    if (!st || !hass) return '';
    var m = SM.model(hass, st.entity_id, vars), L = SM.live(hass, m), use = tileMetric(m, vars) === 'use';
    var parts = [];
    var f = function (s, unit) { return use ? SM.energy(L[s], unit) : SM.money(L[s], m.cur); };
    var es = use ? 'elecUse' : 'elecCost', gs = use ? 'gasUse' : 'gasCost';
    if (L[es] != null) parts.push('Strom ' + f(es, m.unitElec));
    if (L[gs] != null) parts.push('Gas ' + f(gs, m.unitGas));
    if (!parts.length && !use && L.total != null) parts.push(SM.money(L.total, m.cur));
    if (parts.length) return parts.join(' · ');
    if (st.state === 'unavailable') return 'Nicht verfügbar';
    return 'Unbekannt';
  };
  // Short form when both do not fit: today's sum („heute 2,41 £“).
  SM.tileShort = function (st, hass, vars) {
    if (!st || !hass) return '';
    var m = SM.model(hass, st.entity_id, vars), L = SM.live(hass, m), use = tileMetric(m, vars) === 'use';
    var v = use ? SM.useOf(L, m) : SM.costOf(L);
    if (v == null) return '';
    return 'heute ' + (use ? SM.energy(v, m.unitElec) : SM.money(v, m.cur));
  };

  // ── Statistics ────────────────────────────────────────────────────────────
  // rows of one sensor, period day: [{ start, state, change }]. A running meter: its states only rise, and its last
  // state is far above a day's change. A daily counter falls back at midnight or stays (a standing charge).
  SM.mode = function (rows) {
    var st = (rows || []).filter(function (p) { return p && p.state != null && isFinite(p.state); });
    if (st.length < 2) return 'daily';
    for (var i = 1; i < st.length; i++) if (st[i].state < st[i - 1].state - 1e-9) return 'daily';
    var first = st[0].state, last = st[st.length - 1].state;
    var ch = (rows || []).reduce(function (a, p) { var c = p && num(p.change); return c != null && c > a ? c : a; }, 0);
    return last > first && last > 3 * ch ? 'total' : 'daily';
  };
  var indexOf = function (plan, t) {
    if (!isFinite(t) || t < plan.starts[0] || t >= plan.end) return -1;
    var i = plan.starts.length - 1;
    while (i > 0 && plan.starts[i] > t) i--;
    return i;
  };
  // Buckets per slot: hours (day) from the change per hour; days (week, month) from a day's value (SM.mode), today from
  // the sensors (live). sums: the period's totals – the day's are today's values themselves.
  SM.aggregate = function (rows, m, plan, live) {
    var n = plan.starts.length, out = { plan: plan, vals: {}, sums: {}, has: false };
    live = live || {};
    SLOTS.forEach(function (s) {
      var id = m.slots[s];
      if (!id) return;
      var list = ((rows || {})[id] || []).slice().sort(function (a, b) { return tOf(a) - tOf(b); });
      var vals = [];
      for (var i = 0; i < n; i++) vals.push(null);
      if (plan.per === 'hour') {
        list.forEach(function (p) {
          var k = indexOf(plan, tOf(p)), c = p ? num(p.change) : null;
          if (k < 0 || c == null) return;
          vals[k] = (vals[k] || 0) + Math.max(0, c);
        });
      } else {
        var mode = SM.mode(list);
        list.forEach(function (p) {
          var k = indexOf(plan, tOf(p));
          if (k < 0 || k === plan.cur) return;
          var v = mode === 'daily' && p.state != null && isFinite(p.state) ? num(p.state) : num(p.change);
          if (v != null) vals[k] = Math.max(0, v);
        });
        if (plan.cur >= 0 && plan.cur < n) {
          var today = live[s];
          if (mode === 'total') {
            var row = list.filter(function (p) { return indexOf(plan, tOf(p)) === plan.cur; })[0];
            today = row ? num(row.change) : null;
          }
          if (today != null) vals[plan.cur] = Math.max(0, today);
        }
      }
      out.vals[s] = vals;
      var sum = null;
      vals.forEach(function (v) { if (v != null) sum = (sum || 0) + v; });
      out.sums[s] = plan.per === 'hour' ? (live[s] != null ? live[s] : sum) : sum;
      if (out.sums[s] != null) out.has = true;
    });
    return out;
  };
  // What the stage shows for cost or usage: the stacked series, the total and the average per whole bucket.
  SM.view = function (agg, m, metric) {
    var plan = agg.plan, n = plan.starts.length, list;
    if (metric === 'use') {
      list = [{ key: 'elecUse', name: 'Stromzähler', color: COLOR.elec }, { key: 'gasUse', name: 'Gaszähler', color: COLOR.gas }];
      // Gas in m³ beside electricity in kWh does not add up: then electricity alone.
      if (m.slots.elecUse && m.slots.gasUse && m.unitElec !== m.unitGas) list = list.slice(0, 1);
    } else {
      list = [{ key: 'elecCost', name: 'Stromzähler', color: COLOR.elec }, { key: 'gasCost', name: 'Gaszähler', color: COLOR.gas }];
      // The standing charge has no hours (it does not rise during the day).
      if (plan.per !== 'hour') list.push({ key: 'standing', name: 'Grundgebühr', color: COLOR.standing, opacity: 0.55 });
      if (!m.slots.elecCost && !m.slots.gasCost && !m.slots.standing) list = [{ key: 'total', name: 'Gesamtkosten', color: COLOR.elec }];
    }
    var series = list.filter(function (x) { return m.slots[x.key] && agg.vals[x.key]; }).map(function (x) {
      return { key: x.key, name: x.name, color: x.color, opacity: x.opacity || null, vals: agg.vals[x.key].slice() };
    });
    var totals = [];
    for (var i = 0; i < n; i++) {
      var s = null;
      series.forEach(function (x) { if (x.vals[i] != null) s = (s || 0) + x.vals[i]; });
      totals.push(s);
    }
    var total = metric === 'use' ? SM.useOf(agg.sums, m) : SM.costOf(agg.sums);
    var E = EVh();
    var avg = E && E.average ? E.average(totals, plan) : null;
    return { total: total, avg: avg, series: series, totals: totals,
      unit: metric === 'use' ? m.unitElec || 'kWh' : SM.symbol(m.cur), decimals: metric === 'use' ? (plan.per === 'hour' ? 2 : 1) : 2 };
  };

  // ── Loading (one request per range for all sensors, kept 5 minutes) ─────────
  var cache = {}, parts = [];
  var kick = function (el) {
    try { if (typeof window.casoraKick === 'function') window.casoraKick(el); } catch (e) { /* popup closed */ }
  };
  SM.plan = function (hass, range, now) {
    var E = EVh();
    return E && E.plan ? E.plan(range, now == null ? Date.now() : now, E.firstDay ? E.firstDay(hass) : 1) : null;
  };
  SM.load = function (hass, m, range, el) {
    if (!hass || typeof hass.callWS !== 'function' || !m.ids.length) return null;
    var plan = SM.plan(hass, range);
    if (!plan) return null;
    var ck = plan.range + '|' + plan.starts[0] + '|' + m.ids.join(',');
    var key = Math.floor(Date.now() / 300000), hit = cache[ck];
    if (hit && (hit.key === key || hit.busy)) {
      if (el && hit.busy && hit.wait.indexOf(el) < 0) hit.wait.push(el);
      return hit.data || (hit.busy ? 'wait' : null);
    }
    var cell = cache[ck] = { key: key, busy: true, data: hit ? hit.data : null, wait: el ? [el] : [] };
    hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(plan.starts[0]).toISOString(),
      end_time: new Date(plan.end).toISOString(), statistic_ids: m.ids, period: plan.per,
      types: plan.per === 'hour' ? ['change'] : ['state', 'change'], units: { energy: 'kWh' } })
      .then(function (r) { cell.data = { rows: r || {}, plan: plan }; },
        // A hiccup keeps what is on screen; only without anything the error shows.
        function () { if (!cell.data) cell.data = { error: true, rows: {}, plan: plan }; })
      .then(function () {
        cell.busy = false;
        var ws = cell.wait; cell.wait = [];
        ws.forEach(kick);
        parts = parts.filter(function (x) { return x && x.isConnected; });
        parts.forEach(function (x) { if (ws.indexOf(x) < 0) kick(x); });
      });
    return cell.data || 'wait';
  };

  // ── Choice (range, cost or usage) for the session ───────────────────────────
  // Opens on the week like the consumption per device (early in the morning the day is nearly empty).
  var choice = { range: 'week', metric: null };
  SM.range = function () { return choice.range; };
  SM.metric = function (m) { return choice.metric === 'use' && m.hasUse ? 'use' : m.hasCost ? 'cost' : 'use'; };
  var remember = function (el) {
    if (!el) return;
    parts = parts.filter(function (x) { return x && x.isConnected; });
    if (parts.indexOf(el) < 0) parts.push(el);
  };
  var redraw = function () {
    parts = parts.filter(function (x) { return x && x.isConnected; });
    parts.forEach(kick);
  };
  SM.setRange = function (r) { if (RANGES.indexOf(r) < 0 || r === choice.range) return; choice.range = r; redraw(); };
  SM.setMetric = function (k) { if ((k !== 'use' && k !== 'cost') || k === choice.metric) return; choice.metric = k; redraw(); };

  // Taps on a range segment or a usage/cost row, like the consumption per device (a finger tap on touchend, the
  // click after it dropped; a touch that moved is no tap).
  var SLOP = 10, touch = null, touchAt = 0;
  var hitOf = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (n && n.hasAttribute && (n.hasAttribute('data-casora-smr') || n.hasAttribute('data-casora-smm'))) return n;
    }
    return null;
  };
  SM.pick = function (ev) {
    var n = hitOf(ev);
    if (!n) return false;
    ev.preventDefault(); ev.stopPropagation();
    if (ev.type === 'touchend') touchAt = Date.now();
    else if (Date.now() - touchAt < 700) return false;
    if (window.casoraHaptic) window.casoraHaptic('selection');
    window._casoraSuppressDismiss = Date.now() + 600;
    if (n.hasAttribute('data-casora-smr')) SM.setRange(n.getAttribute('data-casora-smr'));
    else SM.setMetric(n.getAttribute('data-casora-smm'));
    return true;
  };
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('touchstart', function (ev) {
      var t = ev.touches && ev.touches.length === 1 && ev.touches[0];
      if (t && hitOf(ev)) touch = { x: t.clientX, y: t.clientY, id: t.identifier };
      else if (!t || !touch || touch.id !== t.identifier) touch = null;
    }, { capture: true, passive: true });
    document.addEventListener('touchend', function (ev) {
      var s = touch, t = ev.changedTouches && ev.changedTouches[0];
      touch = null;
      if (!s || !t || Math.abs(t.clientX - s.x) > SLOP || Math.abs(t.clientY - s.y) > SLOP) return;
      SM.pick(ev);
    }, true);
    document.addEventListener('click', SM.pick, true);
  }

  // ── Live parts ──────────────────────────────────────────────────────────────
  var segHtml = function (UI, range) {
    var k = 0;
    return UI.segments(RANGES.map(function (r) { return { label: LABEL[r], active: r === range }; }), null)
      .replace(/<div class="hui-sg/g, function () { return '<div data-casora-smr="' + UI.esc(RANGES[k++]) + '" class="hui-sg'; });
  };
  var periodText = function (plan) {
    var c = window.casoraChart || null;
    if (plan.range === 'week') return T('Diese Woche');
    if (plan.range === 'month') return c && c.monLong ? c.monLong(plan.starts[0]) : T('Dieser Monat');
    var hm = c && c.hm ? c.hm(Math.floor(Date.now() / 36e5) * 36e5) : '';
    return c && c.uhr && hm ? c.uhr(T('Heute bis') + ' ' + hm) : T('Heute');
  };
  var ago = function (t, now) {
    var min = Math.max(0, Math.round((now - t) / 60000));
    if (min < 60) return min < 1 ? 'gerade eben' : 'vor ' + min + ' Min.';
    var c = window.casoraChart || null;
    return 'seit ' + (c && c.hm ? c.hm(t) : new Date(t).toTimeString().slice(0, 5));
  };
  // The data for the parts: today's values for the day, else the statistics. → { agg, wait, error } (agg null while loading).
  var dataOf = function (hass, m, el) {
    var range = SM.range(), L = SM.live(hass, m);
    var data = SM.load(hass, m, range, el);
    var plan = data && data !== 'wait' && data.plan ? data.plan : SM.plan(hass, range);
    if (!plan) return { agg: null, plan: null, error: true, live: L };
    if (range === 'day') {
      // The day's totals are the sensors themselves; the hours wait for the statistics.
      var rows = data && data !== 'wait' && !data.error ? data.rows : {};
      return { agg: SM.aggregate(rows, m, plan, L), plan: plan, hoursReady: !!(data && data !== 'wait'), error: !!(data && data.error), live: L };
    }
    if (!data || data === 'wait') return { agg: null, plan: plan, wait: true, live: L };
    return { agg: SM.aggregate(data.rows, m, plan, L), plan: plan, error: !!data.error, live: L };
  };

  SM.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c || !hass) return '';
    var h = states && states !== hass.states ? Object.assign({}, hass, { states: states }) : hass;
    var m = SM.model(h, c.id, c.vars), S = h.states || {};
    if (part === 'hero') {
      // Status line: what the meter measures and how fresh it is – never the stage's total.
      var word = m.elec && m.gas ? 'Strom und Gas' : m.gas ? 'Gaszähler' : 'Stromzähler';
      var newest = 0, dead = true;
      m.ids.forEach(function (x) {
        var st = S[x];
        if (usable(st)) dead = false;
        var t = st ? Date.parse(st.last_updated || st.last_changed) : NaN;
        if (isFinite(t) && t > newest) newest = t;
      });
      if (dead) return UI.line('Nicht verfügbar', []);
      return UI.line(word, newest ? [ago(newest, Date.now())] : []);
    }
    remember(el);
    var d = dataOf(h, m, el), metric = SM.metric(m), V = d.agg ? SM.view(d.agg, m, metric) : null;
    if (part === 'stage') {
      var range = SM.range(), plan = d.plan, ht = window.innerWidth <= 760 ? 140 : 160;
      var empty = null;
      if (d.error && !(d.agg && d.agg.has)) empty = { icon: 'mdi:chart-bar-stacked', text: 'Statistik nicht abrufbar' };
      else if (d.agg && !d.agg.has && !d.wait) empty = { icon: 'mdi:chart-bar-stacked', text: 'Noch keine Werte' };
      var bars = V && V.series.some(function (s) { return s.vals.some(function (v) { return v != null; }); });
      if (V && bars && window._hpPlantCfg && plan) {
        window._hpPlantCfg[CHART] = { type: 'custom:casora-chart', kind: 'stack', height: ht, readout: 'hero',
          stack: { per: plan.per, starts: plan.starts, cur: plan.cur, unit: V.unit, decimals: V.decimals, avg: V.avg,
            read: READ, label: metric === 'use' ? 'Verbrauch' : 'Kosten',
            series: V.series.map(function (s) { return { name: s.name, color: s.color, opacity: s.opacity, vals: s.vals }; }) } };
        if (window._hpStageChart) window._hpStageChart(el, CHART);
      } else if (V && !bars && !empty && range === 'day' && d.hoursReady) empty = { icon: 'mdi:chart-bar-stacked', text: 'Noch keine Werte' };
      var val = !V || V.total == null ? '—' : metric === 'use' ? nf(V.total, V.total >= 100 ? 0 : 1) : nf(V.total, 2);
      var avgT = V && V.avg != null ? 'Ø ' + (metric === 'use' ? SM.energy(V.avg, V.unit) : SM.money(V.avg, m.cur)) + ' '
        + T(plan && plan.per === 'hour' ? 'pro Stunde' : 'pro Tag') : '';
      var trend = [plan ? periodText(plan) : '', avgT].filter(Boolean).join(' · ');
      var slot = V && bars ? '<div class="hp-chart-slot" style="min-height:' + UI.esc(ht + 26) + 'px;pointer-events:auto;"></div>'
        : empty ? UI.empty(empty) : '<div style="min-height:' + UI.esc(ht + 26) + 'px;"></div>';
      return UI.stage('chart', { value: val, unit: V && V.total != null ? V.unit : '', trend: trend, read: V && bars ? READ : null,
        chart: slot, extra: segHtml(UI, range) });
    }
    var sums = d.agg ? d.agg.sums : (SM.range() === 'day' ? d.live : null);
    var load = function (head) { return UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], head); };
    var mark = function (rows, head) {
      var k = 0;
      return UI.group(rows, head).replace(/<div class="hui-row hui-srow/g, function () {
        var r = rows[k++];
        return r && r.pick ? '<div data-casora-smm="' + UI.esc(r.pick) + '" aria-pressed="' + (r.selected ? 'true' : 'false') + '" class="hui-row hui-srow' : '<div class="hui-row hui-srow';
      });
    };
    var two = function (useKey, costKey, icon, head, unit) {
      if (!m.slots[useKey] && !m.slots[costKey]) return '';
      if (!sums) return load(head);
      var rows = [];
      if (m.slots[useKey]) rows.push({ icon: icon, iconTone: metric === 'use' ? 'accent' : null, label: 'Verbrauch', value: SM.energy(sums[useKey], unit),
        pick: m.hasCost ? 'use' : null, tappable: m.hasCost, noChev: true, selected: m.hasCost && metric === 'use' });
      if (m.slots[costKey]) rows.push({ icon: 'mdi:cash', iconTone: metric === 'cost' ? 'accent' : null, label: 'Kosten', value: SM.money(sums[costKey], m.cur),
        pick: m.hasUse ? 'cost' : null, tappable: m.hasUse, noChev: true, selected: m.hasUse && metric === 'cost' });
      return mark(rows, head);
    };
    if (part === 'elec') return two('elecUse', 'elecCost', 'mdi:lightning-bolt', 'Stromzähler', m.unitElec);
    if (part === 'gas') return two('gasUse', 'gasCost', 'mdi:fire', 'Gaszähler', m.unitGas);
    if (part === 'sum') {
      if (!m.hasCost) return '';
      if (!sums) return load('Gesamt');
      var rows = [];
      if (m.slots.standing) rows.push({ icon: 'mdi:calendar-today', label: 'Grundgebühr', value: SM.money(sums.standing, m.cur) });
      // The total only when it adds something: two parts at least, or the total sensor alone.
      var nCost = ['elecCost', 'gasCost', 'standing'].filter(function (s) { return m.slots[s]; }).length;
      if (nCost >= 2 || (!nCost && m.slots.total)) rows.push({ icon: 'mdi:sigma', label: 'Gesamtkosten', value: SM.money(SM.costOf(sums), m.cur) });
      return rows.length ? UI.group(rows, 'Gesamt') : '';
    }
    return '';
  };

  // ── Popup ─────────────────────────────────────────────────────────────────
  SM.v3 = function () {
    var UI = window._casoraUI;
    if (!(UI && UI.stage && UI.soft && UI.soft() && window._casoraSoftKit)) return false;
    try { var v = localStorage.getItem('casora_popup_variant'); return !v || v === 'v3'; } catch (e) { return true; }
  };
  // The popup's cards: v3 (Casora look) its own; other looks HA's rows of the sensors.
  SM.popup = function (entity, hass, vars) {
    var id = entity && entity.entity_id;
    if (!id || !hass) return { type: 'vertical-stack', cards: [] };
    var m = SM.model(hass, id, vars), S = hass.states || {};
    if (SM.v3()) {
      var KIT = window._casoraSoftKit, keep = {};
      Object.keys(VARS).forEach(function (s) { var x = varId(vars, VARS[s]); if (x) keep[VARS[s]] = x; });
      var cj = JSON.stringify({ id: id, vars: keep });
      var call = function (p) { return 'return window._casoraSmartMeter ? window._casoraSmartMeter.sec(' + JSON.stringify(p) + ', ' + cj + ', states, hass, this) : "";'; };
      // The stage watches nothing: a new reading never remounts the chart; range, cost/usage and the statistics'
      // answer redraw it (SM.sec remembers it). The lists follow the sensors.
      var f = { hero: { card: KIT.secCard(m.ids, call('hero'), S) }, stage: { card: KIT.secCard([], call('stage'), S) } };
      if (m.elec) f.elec = { card: KIT.secCard(m.ids, call('elec'), S) };
      if (m.gas) f.gas = { card: KIT.secCard(m.ids, call('gas'), S) };
      if (m.hasCost && (m.slots.standing || m.slots.total || (m.slots.elecCost && m.slots.gasCost))) f.sum = { card: KIT.secCard(m.ids, call('sum'), S) };
      return KIT.layout({ fields: f, top: ['hero'], stage: 'stage', left: [], right: ['elec', 'gas', 'sum'], entity: id });
    }
    return { type: 'vertical-stack', cards: [{ type: 'entities', entities: m.ids.filter(function (x) { return S[x]; }) }] };
  };
})();
