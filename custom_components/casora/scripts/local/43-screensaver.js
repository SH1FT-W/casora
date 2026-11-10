// Wall-panel screensaver. A dashboard turns it on under Settings › Tapping & tablet › Wall tablet
// (casora_screensaver on the room hero, same place as casora_idle_home). After that many minutes
// without a tap the dashboard is covered by a large clock, a photo and, when configured, the
// weather forecast and one calendar. A tap or a key brings the dashboard back. The photo follows
// the weather (sun, rain, snow, fog, night) unless the background is set to rotating photos.
(function () {
  if (typeof window === 'undefined') return;
  if (window._casoraScreensaver && window._casoraScreensaver._booted) return;

  var ROTATE_MS = 15 * 60 * 1000;
  var ICONS = {
    sunny: 'mdi:weather-sunny',
    'clear-night': 'mdi:weather-night',
    cloudy: 'mdi:weather-cloudy',
    partlycloudy: 'mdi:weather-partly-cloudy',
    rainy: 'mdi:weather-rainy',
    pouring: 'mdi:weather-pouring',
    lightning: 'mdi:weather-lightning',
    'lightning-rainy': 'mdi:weather-lightning-rainy',
    snowy: 'mdi:weather-snowy',
    'snowy-rainy': 'mdi:weather-snowy-rainy',
    fog: 'mdi:weather-fog',
    hail: 'mdi:weather-hail',
    windy: 'mdi:weather-windy',
    'windy-variant': 'mdi:weather-windy-variant',
  };
  // Online pictures are opt-in (mode "unsplash"). Otherwise the clock sits on a
  // dark ground, or on photos already stored in this Home Assistant.
  var UNSPLASH = {
    sunny: [
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1920&q=80',
    ],
    rainy: [
      'https://images.unsplash.com/photo-1428592953211-077101b2021b?auto=format&fit=crop&w=1920&q=80',
      'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1920&q=80',
    ],
    snowy: [
      'https://images.unsplash.com/photo-1491002052546-bf38f186af56?auto=format&fit=crop&w=1920&q=80',
      'https://images.unsplash.com/photo-1483664852095-d6cc6870702d?auto=format&fit=crop&w=1920&q=80',
    ],
    fog: [
      'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80',
      'https://images.unsplash.com/photo-1485236715568-263c8c6d4a0e?auto=format&fit=crop&w=1920&q=80',
    ],
    cloudy: [
      'https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1920&q=80',
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1920&q=80',
    ],
    night: [
      'https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?auto=format&fit=crop&w=1920&q=80',
      'https://images.unsplash.com/photo-1507400492013-162706c8c05e?auto=format&fit=crop&w=1920&q=80',
    ],
  };

  function minutes(v) {
    var n = parseFloat(v);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.min(n, 240);
  }

  function bucket(state) {
    var s = String(state || '').toLowerCase().replace(/[_\s-]/g, '');
    if (/snow/.test(s)) return 'snowy';
    if (/lightning|pouring|rain|hail/.test(s)) return 'rainy';
    if (/fog/.test(s)) return 'fog';
    if (/clearnight|night/.test(s)) return 'night';
    if (/sunny|clear/.test(s)) return 'sunny';
    return 'cloudy';
  }

  function photo(kind, seed, mode, localList) {
    var list = mode === 'unsplash' ? (UNSPLASH[kind] || UNSPLASH.cloudy) : localList;
    if (!list || !list.length) return '';
    var n = Math.abs(Number(seed) || 0) % list.length;
    return list[n];
  }

  function upcoming(events, now, limit) {
    var t = now instanceof Date ? now.getTime() : Number(now);
    if (!isFinite(t)) t = 0;
    return (events || []).map(function (ev) {
      var start = ev.start instanceof Date ? ev.start.getTime() : Date.parse(ev.start);
      var end = ev.end instanceof Date ? ev.end.getTime() : Date.parse(ev.end);
      if (!isFinite(start)) return null;
      if (isFinite(end) && end <= t) return null;
      if (!ev.allDay && !isFinite(end) && start < t) return null;
      return { summary: ev.summary || ev.name || '', start: start, end: isFinite(end) ? end : null, allDay: !!ev.allDay };
    }).filter(Boolean).sort(function (a, b) { return a.start - b.start; }).slice(0, limit || 6);
  }

  var api = window._casoraScreensaver || {};
  api.minutes = minutes;
  api.bucket = bucket;
  api.photo = photo;
  api.upcoming = upcoming;
  window._casoraScreensaver = api;
  if (!window.document || window.document.nodeType !== 9) return;
  if (api._booted) return;
  api._booted = true;

  var esc = window.casoraEsc || function (v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function word(key) {
    var de = key === 'allday' ? 'Ganztägig' : 'Keine Termine';
    return (typeof window.casoraTr === 'function' && window.casoraTr(de)) || de;
  }
  function use24(hass) {
    var fmt = hass && hass.locale && hass.locale.time_format;
    return fmt !== '12';
  }
  function localeOf(hass) {
    return (hass && (hass.language || (hass.locale && hass.locale.language))) || undefined;
  }

  var rootEl = null;
  var lookedAt = 0;
  function deep(root, tag, depth) {
    if (!root || depth > 10 || !root.querySelector) return null;
    var hit = root.querySelector(tag);
    if (hit) return hit;
    var kids = root.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].shadowRoot) {
        var found = deep(kids[i].shadowRoot, tag, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }
  function huiRoot() {
    if (rootEl && rootEl.isConnected) return rootEl;
    var lp = typeof location !== 'undefined' ? location.pathname : '';
    if (/^\/(casora-studio|config|developer-tools|profile|hassio|history|logbook|energy|map|media-browser|todo|calendar)(\/|$)/.test(lp)) return null;
    if (Date.now() - lookedAt < 4000 && !rootEl) return null;
    lookedAt = Date.now();
    rootEl = deep(document, 'hui-root', 0);
    return rootEl;
  }
  function dash() {
    var root = huiRoot();
    var ll = root && root.lovelace;
    if (!ll || ll.editMode) return null;
    return { hass: root.hass, config: ll.config || null };
  }
  function readVars(cfg) {
    var out = {};
    var views = (cfg && cfg.views) || [];
    var keys = ['casora_screensaver', 'casora_screensaver_calendar', 'casora_screensaver_bg', 'weather_entity'];
    for (var i = 0; i < views.length; i++) {
      var vars = ((((views[i].cards || [])[0]) || {}).variables) || {};
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if ((out[key] == null || out[key] === '') && vars[key] != null && vars[key] !== '') out[key] = vars[key];
      }
    }
    return out;
  }

  var lastAct = Date.now();
  var shown = false;
  var layer = null;
  var clockT = 0;
  var forecast = [];
  var forecastUnsub = null;
  var forecastFor = '';
  var events = [];
  var eventsFor = '';
  var eventsAt = 0;
  var wake = null;

  function bump() { lastAct = Date.now(); }

  function ensure() {
    if (layer) return layer;
    var style = document.createElement('style');
    style.textContent = [
      '.cs-ss{position:fixed;inset:0;z-index:2147483000;background:#101010;color:#FFF4C4;',
      'font-family:var(--primary-font-family,var(--ha-font-family,system-ui,sans-serif));',
      'display:none !important;flex-direction:column;cursor:pointer;touch-action:none;',
      '-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}',
      '.cs-ss.cs-ss-on{display:flex !important;}',
      '.cs-ss-photo{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;}',
      '.cs-ss-scrim{position:absolute;inset:0;background:rgba(0,0,0,.28);pointer-events:none;}',
      '.cs-ss-clock{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'text-shadow:0 8px 24px rgba(0,0,0,.55);font-variant-numeric:tabular-nums;}',
      '.cs-ss-time{font-weight:300;font-size:min(26vw,34vh);letter-spacing:-.03em;line-height:.9;}',
      '.cs-ss-sec{font-size:.28em;margin-left:.12em;font-weight:300;vertical-align:super;}',
      '.cs-ss-date{margin-top:10px;font-size:min(3.4vw,28px);font-weight:600;}',
      '.cs-ss-bar{position:relative;z-index:1;display:flex;gap:18px;min-height:26vh;max-height:42vh;',
      'padding:16px 28px calc(22px + env(safe-area-inset-bottom,0px));box-sizing:border-box;',
      'background:linear-gradient(to bottom,transparent,rgba(18,18,18,.82) 30%,rgba(18,18,18,.88));}',
      '.cs-ss-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;}',
      '.cs-ss-cal{flex:1.6;}',
      '.cs-ss-rule{width:1px;align-self:stretch;background:rgba(255,255,255,.18);}',
      '.cs-ss-now{display:flex;align-items:center;gap:12px;}',
      '.cs-ss-now ha-icon{--mdc-icon-size:42px;color:#FFF4C4;}',
      '.cs-ss-temp{font-size:28px;font-weight:600;line-height:1;}',
      '.cs-ss-cond{font-size:13px;color:rgba(255,244,196,.8);}',
      '.cs-ss-hours{display:flex;gap:8px;}',
      '.cs-ss-hour{flex:1;min-width:0;text-align:center;font-size:11px;color:rgba(255,244,196,.8);}',
      '.cs-ss-hour ha-icon{--mdc-icon-size:22px;color:#FFF4C4;}',
      '.cs-ss-hour b{display:block;color:#FFF4C4;font-weight:500;font-size:12px;}',
      '.cs-ss-ev{display:flex;gap:10px;font-size:14px;}',
      '.cs-ss-when{width:88px;flex:none;font-size:12px;color:rgba(255,244,196,.8);}',
      '.cs-ss-what{min-width:0;}',
      '.cs-ss-what b{display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.cs-ss-span{font-size:12px;color:rgba(255,244,196,.8);}',
      '.cs-ss-empty{color:rgba(255,244,196,.8);font-size:14px;}',
    ].join('');
    document.head.appendChild(style);
    layer = document.createElement('div');
    layer.className = 'cs-ss';
    layer.hidden = true;
    layer.style.setProperty('display', 'none', 'important');
    layer.innerHTML = '<img class="cs-ss-photo" alt="" draggable="false">'
      + '<div class="cs-ss-scrim"></div>'
      + '<div class="cs-ss-clock"><div class="cs-ss-time"></div><div class="cs-ss-date"></div></div>'
      + '<div class="cs-ss-bar"><div class="cs-ss-col cs-ss-wx" data-cs-entity=""></div><div class="cs-ss-rule"></div><div class="cs-ss-col cs-ss-cal" data-cs-entity=""></div></div>';
    document.body.appendChild(layer);
    return layer;
  }

  function iconEl(name) {
    var el = document.createElement('ha-icon');
    el.icon = name;
    el.setAttribute('icon', name);
    return el;
  }

  function paintClock(hass) {
    var now = new Date();
    var h = now.getHours();
    if (!use24(hass)) h = ((h + 11) % 12) + 1;
    var hh = use24(hass) ? String(h).padStart(2, '0') : String(h);
    var mm = String(now.getMinutes()).padStart(2, '0');
    var ss = String(now.getSeconds()).padStart(2, '0');
    var time = layer.querySelector('.cs-ss-time');
    time.textContent = '';
    time.appendChild(document.createTextNode(hh + ':' + mm));
    var sec = document.createElement('span');
    sec.className = 'cs-ss-sec';
    sec.textContent = ss;
    time.appendChild(sec);
    var date = new Intl.DateTimeFormat(localeOf(hass), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    layer.querySelector('.cs-ss-date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
  }

  function paintWeather(hass, entityId) {
    var col = layer.querySelector('.cs-ss-wx');
    var st = hass && entityId && hass.states && hass.states[entityId];
    col.textContent = '';
    if (!st || st.state === 'unavailable' || st.state === 'unknown') { col.hidden = true; return; }
    col.hidden = false;
    var temp = st.attributes && st.attributes.temperature;
    var unit = (st.attributes && st.attributes.temperature_unit) || '°';
    var cond = '';
    try { cond = hass.formatEntityState ? hass.formatEntityState(st) : st.state; } catch (e) { cond = st.state; }
    var nowRow = document.createElement('div');
    nowRow.className = 'cs-ss-now';
    nowRow.appendChild(iconEl(ICONS[st.state] || 'mdi:weather-partly-cloudy'));
    var text = document.createElement('div');
    var t = document.createElement('div');
    t.className = 'cs-ss-temp';
    t.textContent = (temp == null || temp === '' ? '—' : Math.round(Number(temp))) + (String(unit).indexOf('°') === 0 ? unit : '°');
    var c = document.createElement('div');
    c.className = 'cs-ss-cond';
    c.textContent = cond || '';
    text.appendChild(t);
    text.appendChild(c);
    nowRow.appendChild(text);
    col.appendChild(nowRow);
    if (!forecast.length) return;
    var hours = document.createElement('div');
    hours.className = 'cs-ss-hours';
    var loc = localeOf(hass);
    forecast.slice(0, 6).forEach(function (item) {
      var cell = document.createElement('div');
      cell.className = 'cs-ss-hour';
      var when = item.datetime ? new Date(item.datetime) : null;
      var label = when && !isNaN(when.getTime())
        ? new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit' }).format(when) : '';
      cell.appendChild(document.createTextNode(label));
      cell.appendChild(iconEl(ICONS[item.condition] || 'mdi:weather-partly-cloudy'));
      var b = document.createElement('b');
      var lo = item.templow;
      var hi = item.temperature;
      b.textContent = lo != null && hi != null
        ? Math.round(lo) + '°/' + Math.round(hi) + '°'
        : (hi != null ? Math.round(hi) + '°' : '–');
      cell.appendChild(b);
      hours.appendChild(cell);
    });
    col.appendChild(hours);
  }

  function paintCalendar(hass) {
    var col = layer.querySelector('.cs-ss-cal');
    var rule = layer.querySelector('.cs-ss-rule');
    var wx = layer.querySelector('.cs-ss-wx');
    col.textContent = '';
    if (!eventsFor) { col.hidden = true; rule.hidden = true; return; }
    col.hidden = false;
    rule.hidden = !!wx.hidden;
    var rows = upcoming(events, new Date(), 6);
    if (!rows.length) {
      var empty = document.createElement('div');
      empty.className = 'cs-ss-empty';
      empty.textContent = word('none');
      col.appendChild(empty);
      return;
    }
    var loc = localeOf(hass);
    var hour = { hour: '2-digit', minute: '2-digit' };
    rows.forEach(function (ev) {
      var row = document.createElement('div');
      row.className = 'cs-ss-ev';
      var when = document.createElement('div');
      when.className = 'cs-ss-when';
      when.textContent = new Intl.DateTimeFormat(loc, { weekday: 'short', day: 'numeric', month: 'short' }).format(ev.start);
      var what = document.createElement('div');
      what.className = 'cs-ss-what';
      var title = document.createElement('b');
      title.textContent = ev.summary || '—';
      var span = document.createElement('div');
      span.className = 'cs-ss-span';
      if (ev.allDay) span.textContent = word('allday');
      else {
        var a = new Intl.DateTimeFormat(loc, hour).format(ev.start);
        span.textContent = ev.end ? a + ' – ' + new Intl.DateTimeFormat(loc, hour).format(ev.end) : a;
      }
      what.appendChild(title);
      what.appendChild(span);
      row.appendChild(when);
      row.appendChild(what);
      col.appendChild(row);
    });
  }

  var localPhotos = [];
  var photosAt = 0;
  function loadPhotos(hass) {
    if (!hass || !hass.callWS || Date.now() - photosAt < 300000) return;
    photosAt = Date.now();
    hass.callWS({ type: 'casora/photos' }).then(function (msg) {
      var map = (msg && msg.photos) || {};
      localPhotos = Object.keys(map).map(function (k) { return map[k]; }).filter(function (u) {
        return typeof u === 'string' && u.indexOf('/api/casora/photo/') === 0;
      });
    }).catch(function () { localPhotos = []; });
  }
  function paintPhoto(state, mode) {
    var img = layer.querySelector('.cs-ss-photo');
    var url = '';
    if (mode === 'unsplash' || mode === 'photo') {
      url = photo(bucket(state), Math.floor(Date.now() / ROTATE_MS), mode, localPhotos);
    }
    if (!url) { img.removeAttribute('src'); img.hidden = true; return; }
    img.hidden = false;
    if (img.getAttribute('src') !== url) img.setAttribute('src', url);
  }

  function dropForecast() {
    var unsub = forecastUnsub;
    forecastUnsub = null;
    forecastFor = '';
    if (typeof unsub === 'function') { try { unsub(); } catch (e) { /* already gone */ } }
  }

  function takeForecast(hass, entityId) {
    if (!entityId || !hass || !hass.connection || !hass.connection.subscribeMessage) return;
    if (forecastFor === entityId && forecastUnsub) return;
    dropForecast();
    forecast = [];
    forecastFor = entityId;
    hass.connection.subscribeMessage(function (msg) {
      var list = msg && (msg.forecast || msg);
      forecast = Array.isArray(list) ? list : [];
      if (shown) paintWeather(hass, entityId);
    }, { type: 'weather/subscribe_forecast', entity_id: entityId, forecast_type: 'hourly' }).then(function (unsub) {
      if (forecastFor !== entityId) { try { unsub(); } catch (e) { /* replaced */ } return; }
      forecastUnsub = unsub;
    }).catch(function () { forecastFor = ''; });
  }

  function takeEvents(hass, entityId) {
    if (!entityId) { events = []; eventsFor = ''; return; }
    if (eventsFor === entityId && Date.now() - eventsAt < 300000) return;
    eventsFor = entityId;
    var start = new Date();
    var end = new Date(start.getTime() + 8 * 86400000);
    var q = '?start=' + encodeURIComponent(start.toISOString()) + '&end=' + encodeURIComponent(end.toISOString());
    hass.callApi('GET', 'calendars/' + entityId + q).then(function (rows) {
      if (eventsFor !== entityId) return;
      events = (rows || []).map(function (ev) {
        var all = !(ev.start && ev.start.dateTime);
        return {
          summary: ev.summary || '',
          allDay: all,
          start: all ? ev.start.date : ev.start.dateTime,
          end: ev.end ? (all ? ev.end.date : ev.end.dateTime) : null,
        };
      });
      eventsAt = Date.now();
      if (shown) paintCalendar(hass);
    }).catch(function () { events = []; });
  }

  function holdWake() {
    if (wake || !navigator.wakeLock || !navigator.wakeLock.request) return;
    navigator.wakeLock.request('screen').then(function (lock) { wake = lock; }).catch(function () { wake = null; });
  }
  function releaseWake() {
    var lock = wake;
    wake = null;
    if (lock && lock.release) lock.release().catch(function () {});
  }

  function show(view) {
    var vars = readVars(view.config);
    ensure();
    layer.style.removeProperty('display');
    layer.hidden = false;
    layer.classList.add('cs-ss-on');
    shown = true;
    var wx = vars.weather_entity || '';
    paintClock(view.hass);
    if ((vars.casora_screensaver_bg || '') === 'photo') loadPhotos(view.hass);
    paintPhoto(view.hass.states[wx] && view.hass.states[wx].state, vars.casora_screensaver_bg || '');
    paintWeather(view.hass, wx);
    paintCalendar(view.hass);
    takeForecast(view.hass, wx);
    takeEvents(view.hass, vars.casora_screensaver_calendar || '');
    holdWake();
    if (!clockT) clockT = setInterval(function () { if (shown) paintClock(dash() && dash().hass); }, 1000);
  }

  function hide() {
    shown = false;
    if (layer) {
      layer.classList.remove('cs-ss-on');
      layer.hidden = true;
      // Inline, so a stylesheet display never keeps the cover on screen.
      layer.style.setProperty('display', 'none', 'important');
    }
    dropForecast();
    releaseWake();
    bump();
  }

  // A tap on the weather or the calendar stays. Anywhere else on the cover (clock, photo)
  // closes it at once. The whole gesture is swallowed, so the dashboard underneath never
  // sees it and does not navigate or reload.
  var eatUntil = 0;
  function onEntity(ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (!n || n === layer) return false;
      if (n.getAttribute && n.hasAttribute('data-cs-entity')) return true;
    }
    return false;
  }
  function block(ev) {
    ev.stopPropagation();
    if (ev.cancelable) ev.preventDefault();
  }
  function onGesture(ev) {
    if (shown) {
      if (onEntity(ev)) { block(ev); return; }
      hide();
      eatUntil = Date.now() + 900;
      block(ev);
      return;
    }
    if (Date.now() < eatUntil) { block(ev); return; }
    if (ev.type === 'pointerdown' || ev.type === 'touchstart' || ev.type === 'keydown') bump();
  }
  ['pointerdown', 'pointerup', 'pointercancel', 'touchstart', 'touchend', 'touchcancel', 'click', 'auxclick', 'contextmenu'].forEach(function (t) {
    window.addEventListener(t, onGesture, true);
  });
  window.addEventListener('keydown', onGesture, true);

  setInterval(function () {
    var view = dash();
    if (!view) { if (shown) hide(); return; }
    var mins = minutes(readVars(view.config).casora_screensaver);
    if (!mins) { if (shown) hide(); bump(); return; }
    if (window.casoraPopup && window.casoraPopup.surface) { bump(); if (shown) hide(); return; }
    if (shown) {
      var vars = readVars(view.config);
      var wx = vars.weather_entity || '';
      if ((vars.casora_screensaver_bg || '') === 'photo') loadPhotos(view.hass);
      paintPhoto(view.hass.states[wx] && view.hass.states[wx].state, vars.casora_screensaver_bg || '');
      paintWeather(view.hass, wx);
      if (Date.now() - eventsAt > 300000) takeEvents(view.hass, vars.casora_screensaver_calendar || '');
      return;
    }
    if (Date.now() - lastAct >= mins * 60000) show(view);
  }, 1000);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) bump();
  });
})();
