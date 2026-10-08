// casora-chart.js – Casoras eigene Diagramm-Karte (ersetzt apexcharts-card, 1.2).
// Lovelace-Karte custom:casora-chart, SVG, ohne Fremdbibliothek. Richtung A „Still“:
// 2-px-Linie, Fläche 12 % → 0, gepunktete Hilfslinien, Skala rechts, Ablesen über die
// große Zahl (eigene oder die Hero-Zahl des Popups) statt schwebendem Fenster.
//   { type: 'custom:casora-chart', kind: 'line'|'bar'|'spark', span: '48h',
//     series: [{ entity, name, color, unit, decimals, map }], source: 'auto'|'history'|'stats'|'change',
//     agg: 'mean'|'max', bucket: '1h', height, y: { min, max, labels }, step, readout: 'own'|'hero'|'none', legend,
//     read_as: Entität, deren Hero-Zahl ([data-casora-read]) beim Ablesen mitliest (z. B. Säulen im Energie-Popup) }
(function () {
  'use strict';
  var H = 36e5, MIN = 6e4, DAY = 864e5, NS = 'http://www.w3.org/2000/svg';
  var C = {};
  C.ms = function (s) {
    var m = /^(\d+(?:\.\d+)?)\s*(min|h|d)$/.exec(String(s || '').trim());
    return m ? m[1] * (m[2] === 'min' ? MIN : m[2] === 'h' ? H : DAY) : 0;
  };
  /* „Schöne“ Skala mit n Schritten; flache Linie (21,3999… gegen 21,4) bekommt ±1. */
  C.nice = function (lo, hi, n, min0) {
    if (min0 && lo > 0) lo = 0;
    if (!(hi - lo > 1e-9 * Math.max(1, Math.abs(hi)))) { if (min0 && lo >= 0) hi = hi > 0 ? hi * 2 : 1; else { lo -= 1; hi += 1; } }
    var raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    var step = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
    var a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, t = [];
    for (var i = 0, v = a; v <= b + step / 2 && i < 50; i++, v = a + i * step) t.push(+v.toFixed(10) || 0);
    return { lo: a, hi: b, ticks: t, step: step };
  };
  /* Zusammenfassen: Mittel (oder Höchstwert) je Fenster, leere Fenster tragen den letzten Wert weiter. */
  C.bucket = function (pts, t0, t1, ms, agg) {
    var out = [], i = 0, last = null;
    while (i < pts.length && pts[i][0] < t0) last = pts[i++][1];
    for (var k = t0; k < t1; k += ms) {
      var s = 0, n = 0, mx = -Infinity;
      while (i < pts.length && pts[i][0] < k + ms) { var v = pts[i++][1]; s += v; n++; if (v > mx) mx = v; last = v; }
      var val = n ? (agg === 'max' ? mx : s / n) : last;
      if (val != null) out.push([Math.min(k + ms / 2, t1), val]);
    }
    if (last != null && out.length) out[out.length - 1] = [t1, out[out.length - 1][1]];
    return out;
  };
  /* Tagesanfänge (lokal, 23/25-Stunden-Tage bei Zeitumstellung richtig), letzter = heute. */
  C.days = function (now, n) {
    var d = new Date(now), out = [];
    for (var i = n - 1; i >= 0; i--) out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime());
    return out;
  };
  C.mono = function (p) {
    var n = p.length, f = function (v) { return Math.round(v * 10) / 10; };
    if (!n) return '';
    var s = 'M' + f(p[0][0]) + ',' + f(p[0][1]);
    if (n < 3) return n === 2 ? s + 'L' + f(p[1][0]) + ',' + f(p[1][1]) : s;
    var dx = [], m = [], t = [], i;
    for (i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0] || 1e-6; m[i] = (p[i + 1][1] - p[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : 3 * (dx[i - 1] + dx[i]) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
    for (i = 0; i < n - 1; i++) {
      var h = dx[i] / 3;
      s += 'C' + f(p[i][0] + h) + ',' + f(p[i][1] + t[i] * h) + ',' + f(p[i + 1][0] - h) + ',' + f(p[i + 1][1] - t[i + 1] * h) + ',' + f(p[i + 1][0]) + ',' + f(p[i + 1][1]);
    }
    return s;
  };
  C.stepPath = function (p) {
    return p.map(function (q, i) { return (i ? 'H' + q[0].toFixed(1) + 'V' : 'M' + q[0].toFixed(1) + ',') + q[1].toFixed(1); }).join('');
  };
  /* Zeitachse: Schritt so, dass Beschriftungen ≥ 64 px auseinander liegen; ganze Stunden/Tage lokal. */
  C.xTicks = function (t0, t1, w) {
    var st = [15 * MIN, 30 * MIN, H, 2 * H, 3 * H, 6 * H, 12 * H, DAY, 2 * DAY, 7 * DAY], step = st[st.length - 1], out = [];
    for (var i = 0; i < st.length; i++) if (w / ((t1 - t0) / st[i]) >= Math.max(72, w / 6)) { step = st[i]; break; }
    if (step >= DAY) {
      var n = step / DAY, d = new Date(t0); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
      for (; d.getTime() < t1 - step * 0.3; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)) out.push({ t: d.getTime(), day: true });
      return out;
    }
    var off = new Date(t0).getTimezoneOffset() * MIN;
    for (var t = Math.ceil((t0 - off) / step) * step + off; t < t1 - step * 0.3; t += step) {
      var dd = new Date(t), mid = dd.getHours() === 0 && dd.getMinutes() === 0;
      out.push({ t: t, day: mid && step >= 6 * H });
    }
    return out;
  };
  C.lang = function () { try { return (window.casoraLocale && window.casoraLocale()) || 'de'; } catch (e) { return 'de'; } };
  C.tr = function (s) { try { return window.casoraTr ? window.casoraTr(s) : s; } catch (e) { return s; } };
  C.nf = function (v, d) {
    if (Math.abs(v) < 0.5 * Math.pow(10, -d)) v = 0;
    return v.toLocaleString(C.lang(), { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  C.hm = function (t, h12) {
    var o = { hour: '2-digit', minute: '2-digit' }; if (h12 != null) o.hour12 = h12;
    return new Date(t).toLocaleTimeString(C.lang(), o);
  };
  C.wd = function (t) { return new Date(t).toLocaleDateString(C.lang(), { weekday: 'short' }).replace('.', ''); };
  C.dm = function (t) { return new Date(t).toLocaleDateString(C.lang(), { day: 'numeric', month: 'numeric' }); };
  C.dayLong = function (t) { return new Date(t).toLocaleDateString(C.lang(), { weekday: 'long', day: 'numeric', month: 'long' }); };
  C.uhr = function (s) { return /^de/.test(C.lang()) ? s + ' Uhr' : s; };
  C.when = function (t, now, h12) {
    var a = new Date(t), b = new Date(now), same = a.toDateString() === b.toDateString();
    return C.uhr((same ? C.tr('Heute') : C.wd(t)) + ', ' + C.hm(t, h12));
  };
  /* Gerätefarben (iOS-Töne aus den Aufrufern) → eine der vier geprüften Diagrammstufen. */
  C.color = function (c) {
    c = String(c || '').trim();
    if (!c) return 'var(--cc1)';
    if (/^c[1-4]$/.test(c)) return 'var(--c' + c + ')';
    if (c === 'accent') return 'var(--cacc)';
    // D9 (1.2): Sparklines auf Kacheln neutral im gedeckten Text-Ton; Farbe nur im Popup-Diagramm.
    if (c === 'spark') return 'var(--casora-chart-spark, var(--cink3))';
    var m = /^#([0-9a-f]{6})$/i.exec(c);
    if (!m) return c;
    var r = parseInt(m[1].slice(0, 2), 16) / 255, g = parseInt(m[1].slice(2, 4), 16) / 255, b = parseInt(m[1].slice(4), 16) / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d < 0.12) return 'var(--cink3)';
    h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return 'var(--cc' + (h < 42 || h >= 330 ? 2 : h < 70 ? 4 : h < 175 ? 3 : 1) + ')';
  };
  window.casoraChart = C;
  if (typeof customElements === 'undefined' || customElements.get('casora-chart')) return;

  var CSS = ':host{display:block;position:relative;--cc1:var(--casora-chart-c1,#4A7DBA);--cc2:var(--casora-chart-c2,#C8743A);'
    + '--cc3:var(--casora-chart-c3,#008A7E);--cc4:var(--casora-chart-c4,#A88327);--cacc:var(--casora-chart-accent,var(--primary-color,#B67A50));'
    + '--cink:var(--casora-popup-tiles-text-primary,var(--primary-text-color));--cink2:var(--casora-popup-tiles-text-secondary,var(--secondary-text-color));'
    + '--cink3:var(--casora-chart-label,var(--secondary-text-color));--cgrid:var(--casora-chart-grid,rgba(127,127,127,.16));'
    + '--cplate:var(--casora-chart-plate,var(--casora-popup-row-fill,var(--card-background-color,#fff)));font-family:var(--primary-font-family,system-ui);}'
    + ':host([dark]){--cc1:var(--casora-chart-c1,#5C93D6);--cc2:var(--casora-chart-c2,#CF7840);--cc3:var(--casora-chart-c3,#16A394);--cc4:var(--casora-chart-c4,#B08C2C);}'
    + ':host([plate]){background:var(--cplate);border-radius:var(--casora-popup-row-radius,24px);padding:16px 10px 8px}'
    + '.ro{display:flex;align-items:baseline;gap:8px;min-height:34px;padding:0 var(--casora-chart-inset,6px);font-variant-numeric:tabular-nums}'
    + '.v{font-size:28px;font-weight:600;letter-spacing:-.02em;color:var(--cink)}.u{font-size:15px;font-weight:500;color:var(--cink2);margin-left:-4px}'
    + '.w{font-size:13px;font-weight:500;color:var(--cink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.sw{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:2px;padding:2px;border-radius:12px;margin:2px var(--casora-chart-inset,6px) 8px;background:var(--casora-soft-control-fill,rgba(127,127,127,.12))}'
    + '.sw button{all:unset;box-sizing:border-box;min-height:36px;border-radius:10px;padding:0 8px;display:flex;align-items:center;justify-content:center;gap:6px;'
    + 'font-size:13px;font-weight:600;color:var(--cink2);cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-tap-highlight-color:transparent}'
    + '.sw button[aria-selected=true]{background:var(--casora-soft-seg-on,var(--cplate));color:var(--cink);box-shadow:0 1px 3px rgba(0,0,0,.12)}'
    + '.sw button:focus-visible,svg:focus-visible{outline:2px solid var(--cacc);outline-offset:2px}'
    + 'i{width:8px;height:8px;border-radius:50%;flex:none}.lg{display:flex;gap:14px;padding:0 var(--casora-chart-inset,6px) 6px;font-size:12px;color:var(--cink2)}.lg span{display:flex;align-items:center;gap:6px}'
    + 'svg{display:block;width:100%;overflow:visible;touch-action:pan-y;outline:none;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}'
    + 'text{font-size:11px;font-weight:500;fill:var(--cink3);font-variant-numeric:tabular-nums}.no{font-size:13px;fill:var(--cink3)}'
    + '.srt{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}'
    + '@media (forced-colors:active){path,line,circle{stroke:CanvasText}}';
  var cache = new Map();

  var el = function (tag, a, txt) {
    var e = document.createElementNS(NS, tag);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    if (txt != null) e.textContent = txt;
    return e;
  };
  var roundTop = function (x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h));
    return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r)
      + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z';
  };

  class CasoraChart extends HTMLElement {
    static getStubConfig() { return { kind: 'line', span: '24h', series: [] }; }
    setConfig(c) {
      if (!c) throw new Error('casora-chart: keine Konfiguration');
      var s = Array.isArray(c.series) ? c.series : c.entity ? [{ entity: c.entity, color: c.color, attribute: c.attribute }] : [];
      this._c = Object.assign({ kind: 'line', span: '24h', source: 'auto' }, c, { series: s.filter(function (x) { return x && x.entity; }) });
      this._sel = 0; this._data = null; this._key = null;
      this.toggleAttribute('plate', !!c.plate);
      if (!this.shadowRoot) {
        this.attachShadow({ mode: 'open' }).innerHTML = '<style>' + CSS + '</style><div id="b"></div><div class="srt" aria-live="polite"></div>';
      }
      this._load(true);
    }
    set hass(h) {
      var first = !this._h; this._h = h;
      this.toggleAttribute('dark', !!(h && h.themes && h.themes.darkMode));
      if (first || (this._c && !this._sub && Date.now() - (this._at || 0) > 5 * MIN)) this._load(first);
    }
    get hass() { return this._h; }
    getCardSize() { return 3; }
    connectedCallback() {
      var me = this;
      if (!this._ro && window.ResizeObserver) {
        this._ro = new ResizeObserver(function () { var r = me.shadowRoot, w = r ? r.getElementById('b').clientWidth : 0; if (w && Math.abs(w - (me._w || 0)) > 1) me._draw(); });
      }
      if (this._ro) this._ro.observe(this);
      if (this._c && !this._sub) this._load(false);
    }
    disconnectedCallback() {
      if (this._ro) this._ro.disconnect();
      this._unsub();
      this._release();
    }
    _unsub() { var u = this._sub; this._sub = null; if (u) Promise.resolve(u).then(function (f) { if (typeof f === 'function') f(); }).catch(function () {}); }
    _spanMs() { return C.ms(this._c.span) || DAY; }
    _src() {
      var c = this._c;
      if (c.source !== 'auto') return c.source;
      return c.kind === 'bar' ? 'change' : this._spanMs() > 2 * DAY && !c.series.some(function (s) { return s.attribute; }) ? 'stats' : 'history';
    }
    _load(force) {
      var c = this._c, h = this._h;
      if (!c || !h || !h.connection || !c.series.length || !this.isConnected) { this._draw(); return; }
      var src = this._src(), ids = c.series.map(function (s) { return s.entity; });
      var key = ids.join(',') + '|' + c.span + '|' + src + '|' + (c.agg || '');
      if (!force && key === this._key && (this._sub || Date.now() - this._at < 5 * MIN)) return;
      this._key = key; this._at = Date.now();
      var hit = cache.get(key);
      if (hit && Date.now() - hit.at < 60000) { this._data = hit.data; this._draw(); if (src !== 'history') return; }
      this._unsub();
      var me = this, now = Date.now(), span = this._spanMs();
      var start = c.kind === 'bar' ? C.days(now, Math.round(span / DAY))[0] : now - span;
      var put = function (data) { if (me._key !== key) return; me._data = data; cache.set(key, { at: Date.now(), data: data }); me._draw(); };
      var hist = function () {
        var acc = {}, la = {}, at = {};
        c.series.forEach(function (s) { acc[s.entity] = []; if (s.attribute) at[s.entity] = s.attribute; });
        me._sub = h.connection.subscribeMessage(function (msg) {
          var st = (msg && msg.states) || {};
          Object.keys(st).forEach(function (e) {
            (st[e] || []).forEach(function (x) {
              // Attribut (z. B. current_temperature des Thermostats): fehlt es, gilt das letzte.
              if (x.a) la[e] = x.a;
              if (acc[e]) acc[e].push([(x.lu || x.lc || 0) * 1000, at[e] ? (la[e] || {})[at[e]] : x.s]);
            });
          });
          put({ src: 'history', raw: acc });
        }, { type: 'history/stream', entity_ids: ids, start_time: new Date(start).toISOString(),
             minimal_response: !Object.keys(at).length, no_attributes: !Object.keys(at).length, significant_changes_only: false });
        me._sub.catch(function () { put({ src: 'history', raw: acc }); });
      };
      if (src === 'history') { hist(); return; }
      var change = src === 'change';
      h.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(start).toISOString(),
        statistic_ids: ids, period: change ? 'day' : 'hour', types: change ? ['change'] : ['mean', 'min', 'max', 'state'] })
        .then(function (r) {
          var any = ids.some(function (e) { return r && r[e] && r[e].length; });
          if (!any) return change ? put({ src: src, stats: r || {} }) : hist();
          put({ src: src, stats: r });
        }).catch(hist);
    }
    /* Punkte je Reihe: [[t, Zahl], …] aus Verlauf (mit map für Textzustände) oder Statistik. */
    _points(s) {
      var d = this._data;
      if (!d) return [];
      var map = s.map, num = function (v) {
        if (map && Object.prototype.hasOwnProperty.call(map, String(v).toLowerCase())) return map[String(v).toLowerCase()];
        var n = parseFloat(v); return isFinite(n) ? n : null;
      };
      var out = [];
      if (d.raw) (d.raw[s.entity] || []).forEach(function (p) { var v = num(p[1]); if (v != null) out.push([p[0], v]); });
      else (d.stats[s.entity] || []).forEach(function (p) {
        var v = d.src === 'change' ? p.change : p.mean != null ? p.mean : p.state;
        var t = typeof p.start === 'number' ? p.start : Date.parse(p.start);
        if (v != null && isFinite(v)) out.push([d.src === 'change' ? t : t + 30 * MIN, +v]);
      });
      return out.sort(function (a, b) { return a[0] - b[0]; });
    }
    _unit(s) {
      var st = this._h && this._h.states[s.entity];
      return s.unit != null ? s.unit : (st && st.attributes.unit_of_measurement) || '';
    }
    _dec(s, v) {
      var y = this._c.y || {};
      if (y.decimals != null) return y.decimals;
      if (s.decimals != null) return s.decimals;
      return /°|kWh|^V$|^A$|pH/.test(this._unit(s)) || Math.abs(v) < 10 ? 1 : 0;
    }
    _h12() {
      var f = this._h && this._h.locale && this._h.locale.time_format;
      return f === '12' ? true : f === '24' ? false : undefined;
    }
    _draw() {
      var c = this._c, root = this.shadowRoot;
      if (!c || !root) return;
      var box = root.getElementById('b'), W = box.clientWidth;
      if (!W) return;
      this._w = W;
      box.textContent = '';
      this._release();
      if (c.kind === 'bar') return this._bars(box, W);
      return this._line(box, W);
    }
    _head(box, name, unit) {
      var c = this._c, me = this;
      if (c.kind !== 'spark' && c.series.length > 1 && c.switch !== false) {
        var sw = document.createElement('div'); sw.className = 'sw'; sw.setAttribute('role', 'tablist');
        c.series.forEach(function (s, i) {
          var b = document.createElement('button');
          b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(i === me._sel));
          b.innerHTML = '<i style="background:' + C.color(s.color) + '"></i>';
          b.appendChild(document.createTextNode(C.tr(s.name || s.entity)));
          b.addEventListener('click', function (ev) { ev.stopPropagation(); me._sel = i; me._draw(); });
          sw.appendChild(b);
        });
        box.appendChild(sw);
      }
      if ((c.readout || 'own') !== 'own' || c.kind === 'spark') return null;
      var ro = document.createElement('div'); ro.className = 'ro';
      ro.innerHTML = '<span class="v"></span><span class="u"></span><span class="w"></span>';
      box.appendChild(ro);
      return ro;
    }
    _say(ro, v, u, w, name, ser) {
      if (ro) { ro.children[0].textContent = v; ro.children[1].textContent = u; ro.children[2].textContent = w; }
      else if (this._c.readout === 'hero' && ser) this._hero(ser, w);
      var live = this.shadowRoot.querySelector('.srt');
      if (live && w !== this._def) live.textContent = (name ? name + ' ' : '') + v + ' ' + u + ', ' + w;
    }
    /* Hero-Zahl des Popups liest mit: [data-casora-read="<entity>"] bekommt den Wert,
       [data-casora-read-when] die Zeit. Loslassen stellt den Text wieder her. */
    _hero(vals, w) {
      var t = this._tg, me = this;
      if (!t || t.some(function (n) { return !n.isConnected; })) {
        t = [];
        var deep = function (r) {
          r.querySelectorAll('[data-casora-read],[data-casora-read-when]').forEach(function (n) { t.push(n); });
          r.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot && n !== me) deep(n.shadowRoot); });
        };
        for (var r = this.getRootNode(), i = 0; r && r.querySelectorAll && !t.length && i < 6; i++) { deep(r); r = r.host ? r.host.getRootNode() : null; }
        this._tg = t;
      }
      t.forEach(function (n) {
        var e = n.getAttribute('data-casora-read'), txt = w;
        if (e != null) txt = vals.filter(function (x) { return e === '*' || x.entity === e || me._c.read_as === e; }).map(function (x) { return n.hasAttribute('data-casora-read-bare') ? x.num : x.text; }).join(' · ');
        if (!txt) return;
        if (n._casoraOrig == null) { n._casoraOrig = n.innerHTML; me._touched.push(n); }
        n.setAttribute('data-casora-reading', '');
        n.textContent = txt;
      });
    }
    _release() {
      (this._touched || []).forEach(function (n) {
        if (n._casoraOrig != null) n.innerHTML = n._casoraOrig;
        n._casoraOrig = null; n.removeAttribute('data-casora-reading');
      });
      this._touched = []; this._tg = null;
    }
    _svg(box, W, Hh, label) {
      var spark = this._c.kind === 'spark';
      var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + Hh, height: Hh, role: spark ? null : 'img', tabindex: spark ? null : 0,
        'aria-label': spark ? null : label, 'aria-hidden': spark ? 'true' : null });
      if (spark) svg.style.pointerEvents = 'none';
      box.appendChild(svg);
      return svg;
    }
    _grid(svg, sc, Y, W, padR, fmt) {
      return sc.ticks.map(function (v, i) {
        var y = Y(v);
        svg.appendChild(el('line', { x1: 2, x2: W - padR + 6, y1: y, y2: y, style: 'stroke:var(--cgrid);stroke-width:1' + (i ? ';stroke-dasharray:2 3' : '') }));
        return svg.appendChild(el('text', { x: W - padR + 10, y: y + 4 }, fmt(v)));
      });
    }
    _bind(svg, n, show, hide) {
      var me = this, idx = -1;
      if (!n) return;
      var at = function (ev) { var r = svg.getBoundingClientRect(); return me._near((ev.clientX - r.left) * me._w / (r.width || 1)); };
      var go = function (i) { idx = Math.max(0, Math.min(n - 1, i)); svg.setAttribute('data-casora-esc', ''); show(idx); };
      var off = function () { idx = -1; svg.removeAttribute('data-casora-esc'); hide(); };
      svg.addEventListener('pointerdown', function (ev) { window._casoraSuppressDismiss = Date.now() + 600; go(at(ev)); });
      svg.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse' || ev.buttons) go(at(ev)); });
      svg.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') off(); });
      svg.addEventListener('click', function (ev) { ev.stopPropagation(); });
      svg.addEventListener('blur', function () { if (idx > -1 && !svg.matches(':hover')) off(); });
      svg.addEventListener('keydown', function (ev) {
        var k = ev.key;
        if (k === 'ArrowLeft' || k === 'ArrowRight') go((idx < 0 ? n : idx) + (k === 'ArrowLeft' ? -1 : 1));
        else if (k === 'Home') go(0); else if (k === 'End') go(n - 1);
        else if (k === 'Escape' && idx > -1) off(); else return;
        ev.preventDefault(); ev.stopPropagation();
      });
    }
    _empty(svg, W, Hh) {
      svg.appendChild(el('line', { x1: 2, x2: W - 2, y1: Hh - 24, y2: Hh - 24, style: 'stroke:var(--cgrid)' }));
      if (this._data) svg.appendChild(el('text', { x: W / 2, y: Hh / 2, 'text-anchor': 'middle', class: 'no' }, C.tr('Keine Daten')));
    }
    _line(box, W) {
      var c = this._c, me = this, spark = c.kind === 'spark', now = Date.now(), span = this._spanMs(), t0 = now - span;
      var multi = c.series.length > 1 && c.switch !== false;
      var list = multi ? [c.series[this._sel] || c.series[0]] : c.series;
      var s0 = list[0] || {}, unit = s0.entity ? this._unit(s0) : '', name = C.tr(s0.name || '');
      var ro = this._head(box, name, unit);
      var Hh = c.height || (spark ? 38 : 150), y = c.y || {};
      var bms = Math.max(C.ms(c.bucket) || 0, span / Math.max(8, W / 3), (this._data && this._data.stats) ? H : 0);
      var B = list.map(function (s) { return C.bucket(me._points(s), t0, now, bms, c.agg); });
      var all = [].concat.apply([], B), vals = all.map(function (p) { return p[1]; });
      var padR = spark ? 4 : 40, padT = spark ? 4 : 10, padB = spark ? 4 : 24, padL = spark ? 3 : 2;
      var dec = this._dec(s0, vals.length ? vals[vals.length - 1] : 0);
      var lab = y.labels, fmt = function (v) { return lab ? C.tr(lab[Math.round(v)] || '') : C.nf(v, v % 1 ? 1 : 0); };
      if (lab && !spark) padR = 12 + 6.5 * Math.max.apply(null, lab.map(function (l) { return C.tr(l).length; }));
      var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
      var sc = lab ? { lo: y.min || 0, hi: y.max != null ? y.max : lab.length - 1, ticks: lab.map(function (l, i) { return i; }) }
        : C.nice(y.min != null ? Math.min(y.min, lo) : lo, y.max != null ? Math.max(y.max, hi) : hi, 2, y.min === 0);
      if (spark && vals.length) sc = { lo: lo - (hi - lo < 1e-9 ? 1 : 0), hi: hi + (hi - lo < 1e-9 ? 1 : 0), ticks: [] };
      var X = function (t) { return padL + (t - t0) / span * (W - padL - padR); };
      var Y = function (v) { return padT + (1 - (v - sc.lo) / (sc.hi - sc.lo || 1)) * (Hh - padT - padB); };
      var cs = this._h && s0.entity && !s0.map && !s0.attribute && this._h.states[s0.entity], cv = cs ? parseFloat(cs.state) : NaN;
      var lastV = isFinite(cv) ? cv : vals.length ? B[0][B[0].length - 1][1] : null;
      var spanTxt = C.tr(({ '2h': 'letzte 2 Stunden', '4h': 'letzte 4 Stunden', '6h': 'letzte 6 Stunden', '24h': 'letzte 24 Stunden', '48h': 'letzte 48 Stunden', '7d': 'letzte 7 Tage', '30d': 'letzte 30 Tage' })[c.span] || c.span);
      var svg = this._svg(box, W, Hh, vals.length ? name + ', ' + spanTxt + ', ' + C.nf(lo, dec) + ' ' + C.tr('bis') + ' ' + C.nf(hi, dec) + ' ' + unit
        + ', ' + C.tr('jetzt') + ' ' + C.nf(lastV, dec) + ' ' + unit : name + ', ' + C.tr('Keine Daten'));
      if (c.legend !== false && !multi && list.length > 1) {
        var lg = document.createElement('div'); lg.className = 'lg';
        lg.innerHTML = list.map(function (s) { return '<span><i style="background:' + C.color(s.color) + '"></i>' + C.tr(s.name || s.entity) + '</span>'; }).join('');
        box.insertBefore(lg, svg);
      }
      this._def = C.tr('Jetzt');
      if (!vals.length) { if (!spark) this._empty(svg, W, Hh); this._say(ro, '–', unit, this._data ? C.tr('Keine Daten') : '', null); return; }
      if (!spark) {
        this._grid(svg, sc, Y, W, padR, fmt);
        C.xTicks(t0, now, W - padL - padR).forEach(function (k) {
          var x = X(k.t); if (x < 14 || x > W - padR - 14) return;
          svg.appendChild(el('text', { x: x, y: Hh - 6, 'text-anchor': 'middle' }, k.day ? (span > 2 * DAY ? (span > 8 * DAY ? C.dm(k.t) : C.wd(k.t)) : C.wd(k.t)) : C.hm(k.t, me._h12())));
        });
      }
      var P = B.map(function (b) { return b.map(function (p) { return [X(p[0]), Y(p[1])]; }); });
      var uid = 'g' + Math.random().toString(36).slice(2, 8), defs = el('defs');
      svg.appendChild(defs);
      list.forEach(function (s, i) {
        var pts = P[i], col = C.color(s.color);
        if (pts.length < 1) return;
        var d = c.step ? C.stepPath(pts) : C.mono(pts);
        if (!spark) {
          var gr = el('linearGradient', { id: uid + i, x1: 0, y1: 0, x2: 0, y2: 1 });
          gr.appendChild(el('stop', { offset: 0, style: 'stop-color:' + col + ';stop-opacity:.12' }));
          gr.appendChild(el('stop', { offset: 1, style: 'stop-color:' + col + ';stop-opacity:0' }));
          defs.appendChild(gr);
          svg.appendChild(el('path', { d: d + 'L' + pts[pts.length - 1][0] + ',' + (Hh - padB) + 'L' + pts[0][0] + ',' + (Hh - padB) + 'Z', style: 'fill:url(#' + uid + i + ')' }));
        }
        svg.appendChild(el('path', { d: d, style: 'fill:none;stroke:' + col + ';stroke-width:' + (spark ? 1.75 : 2) + ';stroke-linecap:round;stroke-linejoin:round' }));
        var l = pts[pts.length - 1];
        svg.appendChild(el('circle', { cx: l[0], cy: l[1], r: spark ? 3 : 4, style: 'fill:' + col + ';stroke:var(--cplate);stroke-width:2' }));
      });
      var txt = function (s, v) { return lab ? C.tr(lab[Math.round(v)] || '') : C.nf(v, me._dec(s, v)) + (me._unit(s) ? ' ' + me._unit(s) : ''); };
      var cur = function (i) { return list.map(function (s, j) { var p = B[j][Math.min(i, B[j].length - 1)]; return p ? { entity: s.entity, text: txt(s, p[1]), num: lab ? txt(s, p[1]) : C.nf(p[1], me._dec(s, p[1])) } : null; }).filter(Boolean); };
      var split = function (t) { var m = /^(.*?)\s+(\S+)$/.exec(t); return lab || !m || !unit ? [t, ''] : [m[1], m[2]]; };
      var dflt = function () { var t = split(txt(s0, lastV)); me._say(ro, t[0], t[1], me._def, null); };
      dflt();
      if (spark) return;
      var g = el('g', { style: 'opacity:0;pointer-events:none' });
      var hair = el('line', { y1: padT - 4, y2: Hh - padB, style: 'stroke:var(--cink3);stroke-width:1' });
      var dots = list.map(function (s) { return el('circle', { r: 5, style: 'fill:' + C.color(s.color) + ';stroke:var(--cplate);stroke-width:2.5' }); });
      g.appendChild(hair); dots.forEach(function (d) { g.appendChild(d); }); svg.appendChild(g);
      this._near = function (x) { var b = 0; P[0].forEach(function (p, i) { if (Math.abs(p[0] - x) < Math.abs(P[0][b][0] - x)) b = i; }); return b; };
      this._bind(svg, P[0].length, function (i) {
        var p = P[0][i];
        g.style.opacity = 1; hair.setAttribute('x1', p[0]); hair.setAttribute('x2', p[0]);
        dots.forEach(function (d, j) { var q = P[j][Math.min(i, P[j].length - 1)]; if (q) { d.setAttribute('cx', q[0]); d.setAttribute('cy', q[1]); } });
        var t = split(txt(s0, B[0][i][1])), w = i === P[0].length - 1 ? me._def : C.when(B[0][i][0], now, me._h12());
        me._say(ro, t[0], t[1], w, name, cur(i));
      }, function () { g.style.opacity = 0; me._release(); dflt(); });
    }
    _bars(box, W) {
      var c = this._c, me = this, now = Date.now(), n = Math.round(this._spanMs() / DAY) || 7;
      var s0 = c.series[0] || {}, unit = s0.entity ? this._unit(s0) : '', name = C.tr(s0.name || '');
      var ro = this._head(box, name, unit), Hh = c.height || 150, padT = 10, padB = 24, padR = 40, padL = 2;
      var starts = C.days(now, n), pts = this._points(s0), d = this._data;
      var days = starts.map(function (t, i) {
        var end = i < n - 1 ? starts[i + 1] : now + 1, v = null;
        pts.forEach(function (p) {
          if (p[0] < t || p[0] >= end) return;
          v = d && d.src === 'change' ? (v || 0) + p[1] : c.agg === 'mean' ? p[1] : Math.max(v == null ? -Infinity : v, p[1]);
        });
        return { t: t, v: v };
      });
      var have = days.filter(function (x) { return x.v != null; }), dec = s0.decimals != null ? s0.decimals : 1;
      var prev = have.filter(function (x) { return x.t !== starts[n - 1]; });
      var avg = prev.length ? prev.reduce(function (a, x) { return a + x.v; }, 0) / prev.length : null;
      var hi = have.length ? Math.max.apply(null, have.map(function (x) { return x.v; })) : 0, sc = C.nice(0, hi, 2, true);
      var Y = function (v) { return padT + (1 - v / (sc.hi || 1)) * (Hh - padT - padB); }, base = Y(0);
      var slot = (W - padL - padR) / n, bw = Math.max(2, Math.min(26, slot * 0.56));
      var spanTxt = C.tr(n > 7 ? 'letzte 30 Tage' : 'letzte 7 Tage');
      var svg = this._svg(box, W, Hh, have.length ? name + ', ' + spanTxt + ', ' + C.nf(Math.min.apply(null, have.map(function (x) { return x.v; })), dec)
        + ' ' + C.tr('bis') + ' ' + C.nf(hi, dec) + ' ' + unit + (avg != null ? ', Ø ' + C.nf(avg, dec) + ' ' + unit : '') : name + ', ' + C.tr('Keine Daten'));
      this._def = C.tr('Ø pro Tag');
      var dflt = function () { me._say(ro, avg != null ? C.nf(avg, dec) : '–', unit, me._def, null); };
      if (!have.length) { this._empty(svg, W, Hh); dflt(); return; }
      var tl = this._grid(svg, sc, Y, W, padR, function (v) { return C.nf(v, v % 1 ? 1 : 0); });
      var every = n > 7 ? Math.ceil(44 / slot) : 1, bars = [];
      days.forEach(function (x, i) {
        var cx = padL + slot * (i + 0.5), today = i === n - 1, y = Y(x.v || 0);
        var b = el('path', { d: roundTop(cx - bw / 2, y, bw, Math.max(0, base - y), Math.min(4, bw / 2)), style: 'fill:var(--cacc);opacity:' + (today ? 1 : 0.45) });
        if (x.v) svg.appendChild(b);
        bars.push(b);
        if (today || (n - 1 - i) % every === 0 && i < n - 1 - every / 2) {
          svg.appendChild(el('text', { x: cx, y: Hh - 6, 'text-anchor': 'middle', style: today ? 'fill:var(--cink);font-weight:600' : null },
            today ? C.tr('Heute') : n > 7 ? C.dm(x.t) : C.wd(x.t)));
        }
      });
      if (avg != null) {
        var ya = Y(avg);
        // „Ø“ hat Vorrang vor einer Skalenzahl auf gleicher Höhe.
        tl.forEach(function (t) { if (Math.abs(t.getAttribute('y') - ya - 4) < 12) t.remove(); });
        svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: ya, y2: ya, style: 'stroke:var(--cink2);stroke-width:1.25;stroke-dasharray:4 4' }));
        svg.appendChild(el('text', { x: W - padR + 10, y: ya + 4, style: 'fill:var(--cink2);font-weight:600' }, 'Ø'));
      }
      dflt();
      this._near = function (x) { return Math.max(0, Math.min(n - 1, Math.floor((x - padL) / slot))); };
      this._bind(svg, n, function (i) {
        var x = days[i];
        bars.forEach(function (b, j) { b.style.opacity = j === i ? 1 : j === n - 1 ? 0.6 : 0.3; });
        var w = i === n - 1 ? C.uhr(C.tr('Heute bis') + ' ' + C.hm(Math.floor(now / H) * H, me._h12())) : C.dayLong(x.t);
        if (d && d.raw && i === n - 1) w = C.tr('Heute');
        me._say(ro, x.v == null ? '–' : C.nf(x.v, dec), unit, w, name, [{ entity: s0.entity, text: x.v == null ? '–' : C.nf(x.v, dec) + ' ' + unit, num: x.v == null ? '–' : C.nf(x.v, dec) }]);
      }, function () { bars.forEach(function (b, j) { b.style.opacity = j === n - 1 ? 1 : 0.45; }); me._release(); dflt(); });
    }
  }
  customElements.define('casora-chart', CasoraChart);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'casora-chart', name: 'Casora Chart', description: 'Casora history chart (line, bars, sparkline).' });
})();
