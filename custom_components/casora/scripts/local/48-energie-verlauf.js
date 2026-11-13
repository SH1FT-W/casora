// ── Energy: consumption per device over a day, a week or a month (13.11.2026) ───────────────────────────────
// A page of the house's energy popup („Verbrauch je Gerät ›“): the period's total big, under it stacked bars per
// hour (day) or per day (week, month) by device with an average line, the range as a segment, then the devices with
// kWh and share; tapping one shows it alone in the chart, tapping it again shows all.
// Source: the "individual devices" of HA's energy settings (energy/get_prefs device_consumption, read through
// casoraEnergyPrefs in 00-finder.js) and their long-term statistics (recorder/statistics_during_period, change in
// kWh) – one request for all devices per range, kept 5 minutes; nothing is fetched on a state change. A device that
// HA marks as part of another (included_in_stat) counts once: the other keeps only what is left.
// Without devices in the settings, or without any statistics for them, neither the row nor the page appear.
//   EV.devices(hass, prefs)            → [{ id, name, parent }] the devices of the settings (no source meters)
//   EV.plan(range, now, firstDay)      → { range, per, starts, end, cur } buckets of today / this week / this month
//   EV.aggregate(rows, devs, plan)     → { devs: [{ id, name, parent, vals, sum }], totals, total, has }
//   EV.series(agg, n)                  → { series: [{ name, color, ids, vals, sum }], ofId } top n − 1 and „Sonstige“
//   EV.shares(sums)                    → whole percentages adding up to 100
//   EV.average(vals, plan)             → mean of the whole buckets before the running one, or null
//   EV.load(hass, range, el)           → aggregate (cached), 'wait' while the first answer is out, null on an error
//   EV.sec(part, C, states, hass, el)  → live parts: 'entry' (row in the energy popup), 'hero', 'stage', 'list'
// Pure parts are tested in dev/unit/energy_history.mjs.
(function () {
  if (window._casoraEnergyHistory) return;
  var EV = window._casoraEnergyHistory = {};
  var H = 36e5;
  var RANGES = ['day', 'week', 'month'];
  var LABEL = { day: 'Tag', week: 'Woche', month: 'Monat' };
  // The chart's checked colour steps (casora-chart.js); outside its shadow root the same theme variables.
  var STEPS = ['c1', 'c2', 'c3', 'c4'];
  var STEP_VAR = { c1: 'var(--casora-chart-c1, #4A7DBA)', c2: 'var(--casora-chart-c2, #C8743A)',
    c3: 'var(--casora-chart-c3, #008A7E)', c4: 'var(--casora-chart-c4, #A88327)' };
  // „Sonstige“ and a device inside it: neutral, like the chart's labels.
  var OTHER = 'var(--cink3)', OTHER_ROW = 'var(--casora-popup-ui-dim, rgba(58,50,43,0.25))';
  var READ = 'casora_energy_history';
  var CHART = 'ev:stack';
  var LIST_MAX = 12;
  EV.RANGES = RANGES;

  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var CC = function () { return window.casoraChart || null; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : 'de-DE'; };
  var nf = function (v, d) {
    var c = CC();
    if (c && c.nf) return c.nf(v, d);
    return Number(v).toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  var tOf = function (p) { return typeof p.start === 'number' ? p.start : Date.parse(p.start); };
  // kWh as Casora writes energy elsewhere (owner, 27.10.2026): under 1 kWh in Wh, from 100 kWh without decimals.
  EV.fmt = function (v) {
    if (v == null || !isFinite(v)) return { n: '—', u: '' };
    if (v > 0 && v < 1) return { n: String(Math.max(1, Math.round(v * 1000))), u: 'Wh' };
    return { n: nf(v, v >= 100 ? 0 : 1), u: 'kWh' };
  };
  var fmtS = function (v) { var f = EV.fmt(v); return f.u ? f.n + ' ' + f.u : f.n; };

  // ── Devices from HA's energy settings ───────────────────────────────────────
  var NAME_TAIL = /(\s+(energie|energy|verbrauch|consumption|gesamt|total|kwh))+$/i;
  var meters = function (p) {
    var out = [];
    var add = function (x) { ['stat_energy_from', 'stat_energy_to'].forEach(function (k) { if (x && typeof x[k] === 'string') out.push(x[k]); }); };
    ((p && p.energy_sources) || []).forEach(function (s) {
      add(s);
      (Array.isArray(s.flow_from) ? s.flow_from : []).concat(Array.isArray(s.flow_to) ? s.flow_to : []).forEach(add);
    });
    return out;
  };
  EV.devices = function (hass, prefs) {
    var p = prefs !== undefined ? prefs : (window.casoraEnergyPrefs ? window.casoraEnergyPrefs(hass) : null);
    var dc = p && Array.isArray(p.device_consumption) ? p.device_consumption : [];
    if (!dc.length) return [];
    var S = (hass && hass.states) || {}, R = (hass && hass.entities) || {}, own = meters(p), seen = {}, out = [];
    // Names as the popup's consumer list writes them (00-finder.js), else the settings' name or the entity's.
    var cons = {};
    try { (window.casoraEnergyConsumers ? window.casoraEnergyConsumers(hass, p) || [] : []).forEach(function (x) { cons[x.id] = x.name; }); } catch (e) { /* names only */ }
    dc.forEach(function (d) {
      var id = d && typeof d.stat_consumption === 'string' ? d.stat_consumption : '';
      if (!id || seen[id] || own.indexOf(id) > -1) return;
      // A meter disabled in HA stays in the settings but counts nothing any more.
      if (R[id] && R[id].disabled_by) return;
      seen[id] = true;
      var fr = String(((S[id] || {}).attributes || {}).friendly_name || '').trim();
      var name = cons[id] || String(d.name || '').trim() || (fr ? fr.replace(NAME_TAIL, '').trim() || fr : '')
        || id.replace(/^[^.:]*[.:]/, '').replace(/_/g, ' ');
      out.push({ id: id, name: name, parent: typeof d.included_in_stat === 'string' && d.included_in_stat ? d.included_in_stat : null });
    });
    // Only a parent that is in the list itself takes its children's share off.
    var ids = out.map(function (x) { return x.id; });
    out.forEach(function (x) { if (x.parent && (ids.indexOf(x.parent) < 0 || x.parent === x.id)) x.parent = null; });
    return out;
  };

  // The house's consumption from the same settings (owner, 13.11.2026): the energy dashboard's sources – grid import
  // minus export, plus solar, plus battery discharge minus charge (HA's signs, as casoraEnergyHouse adds the powers,
  // 00-finder.js). Meters read like the energy coach (ki.py energy_context): the grid's own meters or its legacy
  // flow_from/flow_to lists. Only when it is whole: a grid import meter, and every solar and battery source with its
  // meters (one missing would leave the house short). Else null – the page sums the devices as before.
  EV.house = function (p) {
    var plus = [], minus = [], grid = false, whole = true;
    var add = function (list, id) { if (typeof id === 'string' && id && list.indexOf(id) < 0) list.push(id); };
    ((p && p.energy_sources) || []).forEach(function (s) {
      if (!s) return;
      if (s.type === 'grid') {
        var from = [s.stat_energy_from].concat((Array.isArray(s.flow_from) ? s.flow_from : []).map(function (f) { return f && f.stat_energy_from; }));
        var to = [s.stat_energy_to].concat((Array.isArray(s.flow_to) ? s.flow_to : []).map(function (f) { return f && f.stat_energy_to; }));
        from.forEach(function (id) { if (typeof id === 'string' && id) { grid = true; add(plus, id); } });
        to.forEach(function (id) { add(minus, id); });
      } else if (s.type === 'solar') {
        if (typeof s.stat_energy_from === 'string' && s.stat_energy_from) add(plus, s.stat_energy_from); else whole = false;
      } else if (s.type === 'battery') {
        if (typeof s.stat_energy_from === 'string' && s.stat_energy_from && typeof s.stat_energy_to === 'string' && s.stat_energy_to) {
          add(plus, s.stat_energy_from); add(minus, s.stat_energy_to);
        } else whole = false;
      }
    });
    return grid && whole ? { plus: plus, minus: minus } : null;
  };
  var UNTRACKED = '__untracked';
  EV.UNTRACKED = UNTRACKED;

  // ── Buckets ───────────────────────────────────────────────────────────────
  // firstDay: 0 = Sunday … 6 = Saturday (HA's locale.first_weekday as a number), default Monday.
  var DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  EV.firstDay = function (hass) {
    var f = hass && hass.locale && hass.locale.first_weekday;
    if (f in DAYS) return DAYS[f];
    try {
      var wi = new Intl.Locale((hass && hass.locale && hass.locale.language) || loc());
      var info = wi.getWeekInfo ? wi.getWeekInfo() : wi.weekInfo;
      if (info && info.firstDay) return info.firstDay % 7;
    } catch (e) { /* older browsers */ }
    return 1;
  };
  // Day: the local hours of today (23 or 25 around the clock change); week: its 7 days; month: its days. cur: the
  // bucket holding now. Hours step in real time, days by the calendar.
  EV.plan = function (range, now, firstDay) {
    now = now == null ? Date.now() : now;
    var d = new Date(now), y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    var starts = [], end, per;
    if (range === 'week' || range === 'month') {
      per = 'day';
      var first = range === 'month' ? 1 : day - ((d.getDay() - (firstDay == null ? 1 : firstDay) + 7) % 7);
      var count = range === 'month' ? new Date(y, m + 1, 0).getDate() : 7;
      for (var i = 0; i < count; i++) starts.push(new Date(y, m, first + i).getTime());
      end = new Date(y, m, first + count).getTime();
    } else {
      range = 'day'; per = 'hour';
      var a = new Date(y, m, day).getTime();
      end = new Date(y, m, day + 1).getTime();
      for (var t = a; t < end; t += H) starts.push(t);
    }
    var cur = -1;
    for (var k = 0; k < starts.length; k++) if (now >= starts[k]) cur = k;
    if (now >= end) cur = starts.length;
    return { range: range, per: per, starts: starts, end: end, cur: cur };
  };
  var indexOf = function (plan, t) {
    if (!isFinite(t) || t < plan.starts[0] || t >= plan.end) return -1;
    var i = plan.starts.length - 1;
    while (i > 0 && plan.starts[i] > t) i--;
    return i;
  };

  // ── Sums ──────────────────────────────────────────────────────────────────
  // rows: the answer of recorder/statistics_during_period (id → [{ start, change }]). A negative change (a meter
  // reset HA did not catch) is no consumption. A device included in another counts only once: the parent keeps
  // its own value minus its children's (never below 0), so the stacked total is the top devices' total.
  EV.aggregate = function (rows, devs, plan, house) {
    var n = plan.starts.length, raw = {};
    var list = (devs || []).map(function (dv) {
      var vals = []; for (var i = 0; i < n; i++) vals.push(null);
      (((rows || {})[dv.id]) || []).forEach(function (p) {
        var k = indexOf(plan, tOf(p)), v = Number(p && p.change);
        if (k < 0 || p == null || p.change == null || !isFinite(v)) return;
        vals[k] = (vals[k] || 0) + Math.max(0, v);
      });
      raw[dv.id] = vals.slice();
      return { id: dv.id, name: dv.name, parent: dv.parent || null, vals: vals };
    });
    list.forEach(function (ch) {
      var par = ch.parent && list.filter(function (x) { return x.id === ch.parent; })[0];
      if (!par) return;
      for (var i = 0; i < n; i++) {
        if (par.vals[i] != null && raw[ch.id][i] != null) par.vals[i] = Math.max(0, par.vals[i] - raw[ch.id][i]);
      }
    });
    var totals = [], has = false;
    for (var i = 0; i < n; i++) {
      var s = null;
      list.forEach(function (x) { if (x.vals[i] != null) s = (s || 0) + x.vals[i]; });
      totals.push(s);
      if (s != null) has = true;
    }
    list.forEach(function (x) {
      var s = null;
      x.vals.forEach(function (v) { if (v != null) s = (s || 0) + v; });
      x.sum = s;
    });
    var total = null;
    totals.forEach(function (v) { if (v != null) total = (total || 0) + v; });
    // The house per bucket and what the devices leave of it: „Nicht erfasst“. Per bucket the house is the larger of its
    // meters and the devices' sum (owner, 13.11.2026): devices reading more than the house (meters a moment apart, a
    // device behind its own meter) raise it, so the big number, the Ø line and the shares never fall below the devices.
    // Only when the house meters have a row at all; else no house, as without its meters.
    var hv = null, unt = null, metered = false;
    if (house && house.plus && house.plus.length) {
      var sumOf = function (ids, i) {
        var s2 = null;
        ids.forEach(function (id) {
          (((rows || {})[id]) || []).forEach(function (p) {
            var v = Number(p && p.change);
            if (p && p.change != null && isFinite(v) && indexOf(plan, tOf(p)) === i) s2 = (s2 || 0) + Math.max(0, v);
          });
        });
        return s2;
      };
      hv = []; unt = [];
      for (var j = 0; j < n; j++) {
        var pl = sumOf(house.plus, j), mi = sumOf(house.minus, j) || 0;
        var hj = pl == null ? null : Math.max(0, pl - mi);
        if (hj != null) metered = true;
        if (totals[j] != null) hj = Math.max(hj || 0, totals[j]);
        hv.push(hj);
        unt.push(hj == null ? null : hj - (totals[j] || 0));
      }
    }
    var sumV = function (a) { var s3 = null; (a || []).forEach(function (v) { if (v != null) s3 = (s3 || 0) + v; }); return s3; };
    var out = { devs: list, totals: totals, total: total, has: has, plan: plan, house: null, untracked: null };
    if (metered) {
      out.house = { vals: hv, sum: sumV(hv) };
      out.untracked = { id: UNTRACKED, name: 'Nicht erfasst', vals: unt, sum: sumV(unt) };
    }
    return out;
  };
  // Devices by their sum, largest first; without a value last (keeping the settings' order).
  EV.sorted = function (devs) {
    return (devs || []).map(function (x, i) { return { x: x, i: i }; }).sort(function (a, b) {
      var va = a.x.sum, vb = b.x.sum;
      if ((va == null) !== (vb == null)) return va == null ? 1 : -1;
      return (vb || 0) - (va || 0) || a.i - b.i;
    }).map(function (o) { return o.x; });
  };
  // The chart's series: up to n devices each in a colour step of its own; with more, the largest n − 1 and one
  // „Sonstige“ holding the rest (the design rules allow four series with a legend, richtlinien §7.1). A single
  // device left over keeps its name. ofId: device id → series index.
  EV.series = function (agg, n) {
    n = n || 4;
    var all = EV.sorted(agg && agg.devs).filter(function (x) { return x.sum != null; });
    var top = all.length <= n ? all : all.slice(0, n - 1), rest = all.length <= n ? [] : all.slice(n - 1);
    var out = top.map(function (x, i) { return { name: x.name, color: STEPS[i], ids: [x.id], vals: x.vals.slice(), sum: x.sum }; });
    if (rest.length) {
      var len = rest[0].vals.length, vals = [], sum = 0;
      for (var i = 0; i < len; i++) {
        var s = null;
        rest.forEach(function (x) { if (x.vals[i] != null) s = (s || 0) + x.vals[i]; });
        vals.push(s);
      }
      rest.forEach(function (x) { sum += x.sum || 0; });
      out.push({ name: rest.length === 1 ? rest[0].name : 'Sonstige', color: 'other', ids: rest.map(function (x) { return x.id; }), vals: vals, sum: sum });
    }
    var ofId = {};
    out.forEach(function (s, i) { s.ids.forEach(function (id) { ofId[id] = i; }); });
    return { series: out, ofId: ofId };
  };
  // Whole percentages adding up to exactly 100 (largest remainder); all 0 without a total.
  EV.shares = function (sums) {
    var v = (sums || []).map(function (x) { return x > 0 ? x : 0; }), all = v.reduce(function (a, x) { return a + x; }, 0);
    if (!(all > 0)) return v.map(function () { return 0; });
    var raw = v.map(function (x) { return x / all * 100; }), out = raw.map(Math.floor);
    var rest = 100 - out.reduce(function (a, x) { return a + x; }, 0);
    raw.map(function (x, i) { return [x - out[i], i]; }).sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; })
      .slice(0, rest).forEach(function (r) { out[r[1]]++; });
    return out;
  };
  // Average per whole bucket: the hours (days) before the running one that have a value. Without one: null.
  EV.average = function (vals, plan) {
    var s = 0, k = 0, upto = Math.min(plan.cur, (vals || []).length);
    for (var i = 0; i < upto; i++) if (vals[i] != null) { s += vals[i]; k++; }
    return k ? s / k : null;
  };

  // ── Loading (one request per range for all devices, kept 5 minutes) ─────────
  var cache = {};
  var kick = function (el) {
    try { if (typeof window.casoraKick === 'function') window.casoraKick(el); } catch (e) { /* popup closed */ }
  };
  EV.load = function (hass, range, el) {
    if (!hass || typeof hass.callWS !== 'function') return null;
    var devs = EV.devices(hass);
    if (!devs.length) return null;
    var plan = EV.plan(range, Date.now(), EV.firstDay(hass));
    var house = EV.house(window.casoraEnergyPrefs ? window.casoraEnergyPrefs(hass) : null);
    var ids = devs.map(function (x) { return x.id; });
    var all = ids.concat(house ? house.plus.concat(house.minus).filter(function (id) { return ids.indexOf(id) < 0; }) : []);
    var ck = (house ? house.plus.join(',') + '-' + house.minus.join(',') + '|' : '') + plan.range + '|' + plan.starts[0] + '|' + ids.join(',') + '|' + devs.map(function (x) { return x.parent || ''; }).join(',');
    var key = Math.floor(Date.now() / 300000), hit = cache[ck];
    if (hit && (hit.key === key || hit.busy)) {
      if (el && hit.busy && hit.wait.indexOf(el) < 0) hit.wait.push(el);
      return hit.data || (hit.busy ? 'wait' : null);
    }
    var cell = cache[ck] = { key: key, busy: true, data: hit ? hit.data : null, wait: el ? [el] : [] };
    hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(plan.starts[0]).toISOString(),
      end_time: new Date(plan.end).toISOString(), statistic_ids: all, period: plan.per, types: ['change'], units: { energy: 'kWh' } })
      .then(function (r) { cell.data = EV.aggregate(r || {}, devs, EV.plan(range, Date.now(), EV.firstDay(hass)), house); },
        // A hiccup keeps what is on screen; only without anything the error shows.
        function () { if (!cell.data) cell.data = { error: true, devs: [], totals: [], total: null, has: false, plan: plan }; })
      .then(function () {
        cell.busy = false;
        var ws = cell.wait; cell.wait = [];
        ws.forEach(kick);
        parts = parts.filter(function (x) { return x && x.isConnected; });
        parts.forEach(function (x) { if (ws.indexOf(x) < 0) kick(x); });
      });
    return cell.data || 'wait';
  };
  // Start the request early (the energy popup's row), so the page opens with its numbers.
  EV.prefetch = function (hass) { try { EV.load(hass, EV.range()); } catch (e) { /* only a head start */ } };

  // ── Choice (range, highlighted device) for the session ──────────────────────
  // Owner, 13.11.2026: the page opens on the week (early in the morning the day is nearly empty).
  var choice = { range: 'week', focus: null }, parts = [];
  EV.range = function () { return choice.range; };
  EV.focus = function () { return choice.focus; };
  var remember = function (el) {
    if (!el) return;
    parts = parts.filter(function (x) { return x && x.isConnected; });
    if (parts.indexOf(el) < 0) parts.push(el);
  };
  var redraw = function () {
    parts = parts.filter(function (x) { return x && x.isConnected; });
    parts.forEach(kick);
  };
  EV.setRange = function (r) { if (RANGES.indexOf(r) < 0 || r === choice.range) return; choice.range = r; redraw(); };
  // A second tap on the highlighted device shows all again.
  EV.toggle = function (id) { choice.focus = choice.focus === id ? null : id; redraw(); };

  // Taps on a range segment or a device row. A finger tap is taken on touchend (button-card cancels it on a phone, no
  // click follows, #58), the click after it is dropped; a touch that moved (scrolling the sheet) is no tap.
  var SLOP = 10, touch = null, touchAt = 0;
  var hitOf = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) {
      var n = p[i];
      if (n && n.hasAttribute && (n.hasAttribute('data-casora-evr') || n.hasAttribute('data-casora-evd'))) return n;
    }
    return null;
  };
  EV.pick = function (ev) {
    var n = hitOf(ev);
    if (!n) return false;
    ev.preventDefault(); ev.stopPropagation();
    if (ev.type === 'touchend') touchAt = Date.now();
    else if (Date.now() - touchAt < 700) return false;
    if (window.casoraHaptic) window.casoraHaptic('selection');
    window._casoraSuppressDismiss = Date.now() + 600;
    if (n.hasAttribute('data-casora-evr')) EV.setRange(n.getAttribute('data-casora-evr'));
    else EV.toggle(n.getAttribute('data-casora-evd'));
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
      EV.pick(ev);
    }, true);
    document.addEventListener('click', EV.pick, true);
  }

  // ── What the page shows (pure, for the tests) ───────────────────────────────
  // { total, avg, chart: { series, avg }, rows: [{ id, name, sum, pct, color, selected }], focus } for an aggregate.
  // With the house: its total big, „Nicht erfasst“ as the last series (grey) and the last row; the devices then get three
  // series, so the chart keeps four at most (richtlinien §7.1).
  EV.view = function (agg, focus) {
    var U = agg.untracked && agg.untracked.sum != null ? agg.untracked : null;
    var S = EV.series(agg, U ? 3 : 4), devs = EV.sorted(agg.devs);
    if (U) {
      S.ofId[U.id] = S.series.length;
      S.series.push({ name: U.name, color: 'untracked', ids: [U.id], vals: U.vals.slice(), sum: U.sum });
      devs = devs.concat([U]);
    }
    var withSum = devs.filter(function (x) { return x.sum != null; });
    var pcts = EV.shares(withSum.map(function (x) { return x.sum; }));
    var pctOf = {};
    withSum.forEach(function (x, i) { pctOf[x.id] = pcts[i]; });
    var f = focus && devs.filter(function (x) { return x.id === focus && x.sum != null; })[0] || null;
    var colorOf = function (id) { var i = S.ofId[id]; var s = i != null ? S.series[i] : null; return s && s.color !== 'other' ? s.color : 'other'; };
    var whole = U ? agg.house.sum : agg.total;
    var series = f ? [{ name: f.name, color: colorOf(f.id), vals: f.vals.slice(), sum: f.sum }] : S.series;
    return {
      focus: f ? f.id : null,
      total: f ? f.sum : whole,
      avg: EV.average(f ? f.vals : U ? agg.house.vals : agg.totals, agg.plan),
      series: series,
      rows: devs.map(function (x) {
        return { id: x.id, name: x.name, sum: x.sum, pct: x.sum != null ? pctOf[x.id] : null, raw: x.sum != null && whole > 0 ? x.sum / whole : null, untracked: x.id === UNTRACKED,
          color: colorOf(x.id), selected: !!f && f.id === x.id };
      }),
    };
  };

  // ── Live parts ──────────────────────────────────────────────────────────────
  var segHtml = function (UI, range) {
    var k = 0;
    return UI.segments(RANGES.map(function (r) { return { label: LABEL[r], active: r === range }; }), null)
      .replace(/<div class="hui-sg/g, function () { return '<div data-casora-evr="' + UI.esc(RANGES[k++]) + '" class="hui-sg'; });
  };
  var periodText = function (plan) {
    var c = CC();
    if (plan.range === 'week') return T('Diese Woche');
    if (plan.range === 'month') return c && c.monLong ? c.monLong(plan.starts[0]) : T('Dieser Monat');
    // Statistics come by the hour: today up to the last whole hour.
    var hm = c && c.hm ? c.hm(Math.floor(Date.now() / H) * H) : '';
    return c && c.uhr && hm ? c.uhr(T('Heute bis') + ' ' + hm) : T('Heute');
  };
  var avgText = function (v, plan) {
    if (v == null) return '';
    return 'Ø ' + fmtS(v) + ' ' + T(plan.per === 'hour' ? 'pro Stunde' : 'pro Tag');
  };
  var colVar = function (c) { return STEP_VAR[c] || OTHER_ROW; };

  EV.sec = function (part, C, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI) return '';
    if (part === 'entry') {
      // Row in the house's energy popup: only with devices that have statistics (an empty answer hides it).
      var devs = EV.devices(hass);
      var d0 = devs.length ? EV.load(hass, EV.range(), el) : null;
      if (!devs.length || (d0 && d0 !== 'wait' && !d0.error && !d0.has)) return '';
      return UI.group([{ icon: 'mdi:chart-bar-stacked', iconTone: 'accent', label: 'Verbrauch je Gerät',
        sub: devs.length === 1 ? '1 Gerät' : devs.length + ' Geräte', page: 'energy-history' }], 'Verlauf');
    }
    if (part === 'hero') {
      // Status line (lifted into the head, richtlinien §3): how many devices are measured – never the stage's total.
      var nd = EV.devices(hass).length;
      return UI.line ? UI.line(nd === 1 ? '1 Gerät' : nd + ' Geräte', []) : '';
    }
    remember(el);
    var range = EV.range(), data = EV.load(hass, range, el);
    var plan = data && data !== 'wait' && data.plan ? data.plan : EV.plan(range, Date.now(), EV.firstDay(hass));
    var ready = data && data !== 'wait' && !data.error && data.has;
    var V = ready ? EV.view(data, EV.focus()) : null;
    if (part === 'stage') {
      var h = window.innerWidth <= 760 ? 140 : 160;
      var empty = null;
      if (data && data !== 'wait' && data.error) empty = { icon: 'mdi:chart-bar-stacked', text: 'Statistik nicht abrufbar' };
      else if (data && data !== 'wait' && !data.has) empty = { icon: 'mdi:chart-bar-stacked', text: 'Noch keine Werte' };
      if (V && window._hpPlantCfg) {
        window._hpPlantCfg[CHART] = { type: 'custom:casora-chart', kind: 'stack', height: h, readout: 'hero',
          stack: { per: plan.per, starts: plan.starts, cur: plan.cur, unit: 'kWh', decimals: plan.per === 'hour' ? 2 : 1, avg: V.avg,
            read: READ, label: 'Verbrauch je Gerät',
            series: V.series.map(function (s) {
              var grey = s.color === 'other' || s.color === 'untracked';
              // „Sonstige“ grey, „Nicht erfasst“ paler still: the two never read alike. „Nicht erfasst“'s legend dot is a
              // ring around the grid's pale grey: at 24 % its dot all but vanished on a dark popup (owner, 13.11.2026).
              return { name: s.name, color: grey ? OTHER : s.color, opacity: s.color === 'other' ? 0.55 : s.color === 'untracked' ? 0.24 : null,
                dot: s.color === 'untracked' ? 'ring' : null, vals: s.vals };
            }) } };
        if (window._hpStageChart) window._hpStageChart(el, CHART);
      }
      var f = EV.fmt(V ? V.total : null);
      var focusRow = V && V.focus ? V.rows.filter(function (r) { return r.selected; })[0] : null;
      var trend = !V ? periodText(plan)
        : focusRow ? [focusRow.name, focusRow.pct != null ? (focusRow.pct === 0 && focusRow.sum > 0 ? '< 1' : focusRow.pct) + ' %' : null, avgText(V.avg, plan)].filter(Boolean).join(' · ')
          : [periodText(plan), avgText(V.avg, plan)].filter(Boolean).join(' · ');
      return UI.stage('chart', { value: f.n, unit: f.u, trend: trend, read: V ? READ : null,
        chart: empty ? UI.empty(empty) : '<div class="hp-chart-slot" style="min-height:' + UI.esc(h + 26) + 'px;pointer-events:auto;"></div>',
        extra: segHtml(UI, range) });
    }
    if (part === 'list') {
      var head = 'Geräte';
      if (!V) {
        if (data && data !== 'wait') return '';
        return UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], head);
      }
      var maxRaw = 0;
      V.rows.forEach(function (r) { if (r.raw > maxRaw) maxRaw = r.raw; });
      var rows = V.rows.map(function (r) {
        var tone = r.sum == null ? OTHER_ROW : colVar(r.color);
        return { id: r.id, icon: r.untracked ? 'mdi:help-circle-outline' : 'plug', iconTone: tone, label: r.name, tappable: r.sum != null, noChev: true, selected: r.selected,
          sub: r.sum == null ? 'Noch keine Werte' : (r.pct === 0 && r.sum > 0 ? '< 1' : r.pct) + ' %',
          value: r.sum == null ? '—' : fmtS(r.sum),
          bar: r.raw != null && maxRaw > 0 ? r.raw / maxRaw : null, barTone: tone };
      });
      var mark = function (list) {
        var k = 0;
        return UI.group(list).replace(/<div class="hui-row hui-srow/g, function () {
          var r = list[k++];
          return r && r.tappable ? '<div data-casora-evd="' + UI.esc(r.id) + '" aria-pressed="' + (r.selected ? 'true' : 'false') + '" class="hui-row hui-srow' : '<div class="hui-row hui-srow';
        });
      };
      // The first twelve, the rest behind „Alle n anzeigen“ (richtlinien §6). UI.group/UI.label escape their texts.
      var nDev = rows.filter(function (r) { return r.id !== UNTRACKED; }).length;
      var top = [UI.label(head + ' · ' + nDev), mark(rows.slice(0, LIST_MAX))];
      if (rows.length > LIST_MAX) {
        top.push('<div style="margin-top:var(--casora-space-2, 8px);">');
        top.push(UI.more('energy-history', mark(rows.slice(LIST_MAX)), { label: 'Alle ' + rows.length + ' anzeigen', less: 'Weniger anzeigen', keep: true }));
        top.push('</div>');
      }
      return top.join('');
    }
    return '';
  };

  // ── The page in the energy popup ────────────────────────────────────────────
  EV.build = function () {
    var K = window._casoraSoftKit;
    if (!K) return null;
    var call = function (part) {
      return 'return window._casoraEnergyHistory ? window._casoraEnergyHistory.sec(' + JSON.stringify(part) + ', null, states, hass, this) : "";';
    };
    // The cards watch nothing: a new state never redraws them (the chart stays mounted); range, highlight and the
    // statistics' answer do (EV.sec remembers them).
    var f = { hero: { card: K.secCard([], call('hero'), {}) }, stage: { card: K.secCard([], call('stage'), {}) },
      list: { card: K.secCard([], call('list'), {}) } };
    // One column (552): the chart over the full width, then the devices (richtlinien §2, one list).
    var lay = K.layout({ fields: f, top: ['hero', 'stage'], left: [], right: ['list'], narrowOrder: ['list'] });
    Object.defineProperty(lay, '_casoraNarrow', { value: true, enumerable: false });
    return lay;
  };
  (window._casoraPages || (window._casoraPages = {}))['energy-history'] = function () {
    var ha = document.querySelector('home-assistant'), h = ha && ha.hass;
    if (!h || !window.casoraPopup || !window.casoraPopup.sub) return;
    var card = EV.build();
    if (!card) return;
    var prev = window.casoraPopup.current;
    // Label: „Energie“ in the dashboard's language, not the tile's own name of the page before (an English „Energy“
    // stood over the German title, 13.11.2026).
    window.casoraPopup.sub({ title: 'Verbrauch je Gerät', eyebrow: T('Energie'), content: card, popup_styles: prev && prev.popup_styles,
      style: '--popup-min-width: min(552px, calc(100vw - 16px)); --popup-max-width: min(552px, calc(100vw - 16px));' });
  };
})();
