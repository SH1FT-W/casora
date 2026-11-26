// ── Assist shows the matching popup (wow/assist-popups) ─────────────────────────────────────────────────────────
// After an answer in Casora's Assist chat (01-basis.js window._casoraAssist, text and voice) the chat asks the
// integration for the target of that request (websocket casora/assist/take, assist_show.py: sentence triggers for
// HA's own agent, LLM tool casora_show) and opens the popup that fits – only what the open dashboard shows (the
// search's index, 38-search.js), otherwise the answer alone. Studio: Controls › Screen › „Assist shows the matching
// popup“ (variables.assist_popups on Home, false = off). The chat stays one tap away: the popup's ‹ goes back to it.
//   window._casoraAssistShow.plan(target, idx, hass) → { how: device|route|room|lights|weather|contacts, … } or null
//   window._casoraAssistShow.enabled(cfg)            → false when the dashboard switched it off
//   window._casoraAssistShow.after()                 – called by the chat after each answer
(function () {
  if (window._casoraAssistShow) return;
  var X = window._casoraAssistShow = {};
  var hassNow = function () { var h = document.querySelector('home-assistant'); return h && h.hass; };
  var fold = function (s) {
    var S = window._casoraSearch;
    if (S && S.fold) return S.fold(s).s.replace(/[^a-z0-9]+/g, ' ').trim();
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
  };
  var areaOf = function (hass, id) {
    var e = hass && hass.entities && hass.entities[id];
    if (!e) return null;
    if (e.area_id) return e.area_id;
    var d = e.device_id && hass.devices && hass.devices[e.device_id];
    return (d && d.area_id) || null;
  };
  var deviceOf = function (hass, id) { var e = hass && hass.entities && hass.entities[id]; return (e && e.device_id) || null; };
  var dom = function (id) { return String(id || '').split('.')[0]; };
  // A room's name goes into a card config: a leading "[[[" must not run as a template.
  var noEval = function (v) { return window.casoraNoEval ? window.casoraNoEval(v) : (typeof v === 'string' && /^\s*\[\[\[/.test(v) ? '\u200b' + v : v); };

  X.enabled = function (cfg) {
    var off = false;
    (function walk(o, d) {
      if (off || !o || typeof o !== 'object' || d > 9) return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, d + 1); }); return; }
      var t = [].concat(o.template || []);
      if ((t.indexOf('casora_room') >= 0 || t.indexOf('casora_mobile_weather') >= 0) && o.variables && o.variables.assist_popups === false) { off = true; return; }
      ['views', 'cards', 'card', 'sections'].forEach(function (k) { if (o[k]) walk(o[k], d + 1); });
    })(cfg, 0);
    return !off;
  };

  // What to open for a target ({ view, area_id?, area?, entity_id? }) on the dashboard idx stands for.
  X.plan = function (t, idx, hass) {
    if (!t || !idx) return null;
    var devices = idx.devices || [], rooms = idx.rooms || [];
    var dev = function (id) { return devices.filter(function (d) { return d.id === id; })[0] || null; };
    var inArea = function (d) {
      if (!t.area_id && !t.area) return true;
      return (t.area_id && areaOf(hass, d.id) === t.area_id) || (!!t.area && !!d.room && fold(d.room) === fold(t.area));
    };
    var room = t.area ? rooms.filter(function (r) { return fold(r.name) === fold(t.area); })[0] || null : null;
    switch (t.view) {
      case 'room':
        return room ? { how: 'room', item: room } : null;
      case 'lights': {
        var lights = devices.filter(function (d) { return dom(d.id) === 'light' && inArea(d); }).map(function (d) { return d.id; });
        return lights.length ? { how: 'lights', lights: lights, room: t.area || null } : null;
      }
      case 'climate': {
        var th = devices.filter(function (d) { return dom(d.id) === 'climate' && inArea(d); })[0];
        if (th) return { how: 'device', item: th };
        if (t.entity_id && dev(t.entity_id)) return { how: 'device', item: dev(t.entity_id) };
        if (t.entity_id && room) return { how: 'route', id: t.entity_id };
        return room ? { how: 'room', item: room } : null;
      }
      case 'camera':
        return t.entity_id && dev(t.entity_id) ? { how: 'device', item: dev(t.entity_id) } : null;
      // The weather has no tile (it sits in the room's head): its popup is the casora_weather template's – for the
      // weather entity this dashboard shows (HA may have several; the answer names the first).
      case 'weather': {
        var w = (t.entity_id && dev(t.entity_id)) || devices.filter(function (d) { return dom(d.id) === 'weather'; })[0];
        return w ? { how: 'weather', id: w.id } : null;
      }
      case 'energy': {
        if (!t.entity_id) return null;
        if (dev(t.entity_id)) return { how: 'device', item: dev(t.entity_id) };
        var did = deviceOf(hass, t.entity_id);
        return did && devices.some(function (d) { return deviceOf(hass, d.id) === did; }) ? { how: 'route', id: t.entity_id } : null;
      }
      case 'security': {
        var alarm = devices.filter(function (d) { return dom(d.id) === 'alarm_control_panel'; })[0];
        return alarm ? { how: 'device', item: alarm } : { how: 'contacts' };
      }
    }
    return null;
  };

  X.run = function (p) {
    var P = window.casoraPopup, S = window._casoraSearch, A = window._casoraAssist;
    if (!p || !P) return false;
    // The popup's ‹ goes back to the chat (the conversation stays).
    var back = function () { if (A && A.open) window._casoraBackNext = { fn: function () { A.open(); }, at: Date.now() }; };
    if (p.how === 'room') {
      try { P.close(); } catch (e) { /* closed already */ }
      if (S && S._actions) S._actions.openRoom(p.item);
      return true;
    }
    back();
    if (p.how === 'device' && S && S._actions) { S._actions.openDevice(p.item); return true; }
    if (p.how === 'route' && window.casoraRoute) return !!window.casoraRoute(p.id);
    var open = window._casoraNotifyOpenViaCard;
    if (p.how === 'lights' && open) {
      open(null, function () {}, { type: 'custom:button-card', template: 'casora_light', entity: p.lights[0],
        variables: { lights: p.lights.slice(), room_name: p.room ? noEval(p.room) : null } }, true, true);
      return true;
    }
    if (p.how === 'weather' && open) {
      open(null, function (ok) { if (!ok && window.casoraRoute) window.casoraRoute(p.id); },
        { type: 'custom:button-card', template: 'casora_weather', entity: p.id }, true, true);
      return true;
    }
    if (p.how === 'contacts' && open) {
      open(null, function () {}, { type: 'custom:button-card', template: 'casora_popup_contacts' }, true, true);
      return true;
    }
    return false;
  };

  X.after = function () {
    var h = hassNow(), S = window._casoraSearch;
    if (!h || !h.connection || !S || !S._configNow) return;
    var cfg = S._configNow();
    if (!cfg || !S.isCasoraCfg(cfg) || !X.enabled(cfg)) return;
    var asked = Date.now();
    h.connection.sendMessagePromise({ type: 'casora/assist/take' }).then(function (r) {
      var t = r && r.target;
      if (!t) return;
      var idx;
      try { idx = S.index(cfg, h, h.user, { url: (String(location.pathname || '').split('/').filter(Boolean)[0]) || '' }); } catch (e) { return; }
      var p = X.plan(t, idx, h);
      if (!p) return;
      // A moment to read the answer before the popup takes the screen.
      setTimeout(function () { try { X.run(p); } catch (e) { /* the answer stays */ } }, Math.max(0, 900 - (Date.now() - asked)));
    }, function () { /* older integration without the command: the answer alone */ });
  };
})();
