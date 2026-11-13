// ── Media popup grouping and the camera timeline (13.11.2026) ─────────────────────────────────────────────
// Two additions to existing popups, each only when the device can do it (otherwise nothing changes):
//   window._casoraMediaGroup    speaker grouping in the media popup (MediaPlayerEntityFeature.GROUPING = 524288)
//     .can(st)                  → whether a player groups
//     .list(hass, playerId)     → [{ id, name, area, on }] other groupable players of the same integration
//     .html(hass, playerId)     → section „Zusammen abspielen“ (selection list, join/unjoin per row)
//   window._casoraCamTimeline   today's motion, person and doorbell events in the general camera popup
//     .sources(hass, camId)     → [{ id, kind }] binary_sensor (motion/occupancy/presence) and event (doorbell) of the
//                               camera's own device; none → no timeline
//     .parse(raw, sources, start) → [{ kind, at, id }] newest first (history/history_during_period answer)
//     .media(hass, camId)       → media browser path with the camera's recordings, or null
//     .mount(img)               fills the placeholder before the <img> (asks the history sparingly)
//   window._casoraMediaExtra.sec(entity, hass) → the speaker section for the popup's right column
//   window._casoraMediaExtraHtml / window._casoraCamTimelineHtml – the same for the card templates
(function () {
  if (window._casoraMediaExtra && window._casoraMediaExtra.v === 1) return;
  var X = window._casoraMediaExtra = { v: 1 };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  };
  var reg = function (hass, id) { return (hass && hass.entities && hass.entities[id]) || {}; };
  var nameOf = function (hass, id) {
    var s = hass && hass.states && hass.states[id];
    var n = (s && s.attributes && s.attributes.friendly_name) || String(id).split('.').pop().replace(/_/g, ' ');
    return window.casoraCleanName ? (window.casoraCleanName(n) || n) : n;
  };
  var areaOf = function (hass, id) {
    var e = reg(hass, id);
    var a = e.area_id || (e.device_id && hass.devices && hass.devices[e.device_id] ? hass.devices[e.device_id].area_id : null);
    return a && hass.areas && hass.areas[a] ? String(hass.areas[a].name || '') : '';
  };
  var bad = function (s) { return !s || s.state === 'unavailable' || s.state === 'unknown'; };

  var T = function (s) { return window.casoraTr ? window.casoraTr(s) : s; };

  // ── Grouping ────────────────────────────────────────────────────────────────────────────────────────────
  var G = window._casoraMediaGroup = {};
  G.FLAG = 524288;  // MediaPlayerEntityFeature.GROUPING
  G.can = function (st) {
    if (!st || !st.attributes) return false;
    return (Number(st.attributes.supported_features || 0) & G.FLAG) !== 0 || Array.isArray(st.attributes.group_members);
  };
  G.members = function (st) {
    var m = st && st.attributes && st.attributes.group_members;
    return Array.isArray(m) ? m.filter(function (x) { return typeof x === 'string'; }) : [];
  };
  // Other groupable players of the same integration (grouping never crosses integrations), at most 12.
  G.list = function (hass, playerId) {
    var S = (hass && hass.states) || {};
    var me = S[playerId];
    if (!G.can(me) || bad(me)) return [];
    var plat = reg(hass, playerId).platform;
    var mine = G.members(me);
    var ids = Object.keys(hass.entities || {}).filter(function (id) {
      if (id === playerId || id.indexOf('media_player.') !== 0) return false;
      var e = hass.entities[id];
      if (!e || e.hidden || (plat && e.platform && e.platform !== plat)) return false;
      return G.can(S[id]) && !bad(S[id]);
    });
    return ids.map(function (id) {
      return { id: id, name: nameOf(hass, id), area: areaOf(hass, id), on: mine.indexOf(id) > -1, playing: S[id].state === 'playing' };
    }).sort(function (a, b) { return (b.on - a.on) || a.name.localeCompare(b.name); }).slice(0, 12);
  };
  G.rowSvc = function (playerId, r) {
    return r.on
      ? { domain: 'media_player', service: 'unjoin', target: { entity_id: r.id } }
      : { domain: 'media_player', service: 'join', data: { group_members: [r.id] }, target: { entity_id: playerId } };
  };
  G.html = function (hass, playerId) {
    var UI = window._casoraUI;
    var list = G.list(hass, playerId);
    if (!UI || !list.length) return '';
    var n = list.filter(function (r) { return r.on; }).length;
    var rows = list.map(function (r) {
      // Selection list without ticks: the joined row is highlighted (hui-sel) and its symbol in the device colour.
      return { icon: 'mdi:speaker', iconTone: r.on ? 'accent' : 'rgba(0,0,0,0)', label: r.name, labelLit: true, sub: r.area || undefined,
        selected: r.on, noChev: true, tappable: true, svc: G.rowSvc(playerId, r) };
    });
    return UI.group(rows, n ? 'Zusammen abspielen · ' + (n + 1) + ' Lautsprecher' : 'Zusammen abspielen');
  };

  // The speaker section for the media popup (right column); '' when the player does not group.
  X.ids = function (hass, playerId) {
    var out = [playerId];
    G.list(hass, playerId).forEach(function (r) { out.push(r.id); });
    return out;
  };
  X.sec = function (entity, hass) {
    var id = entity && entity.entity_id;
    if (!id || !hass) return '';
    var parts = [G.html(hass, id)].filter(Boolean);
    // ha-card.disabled: the card has no tap action of its own; without this rule nothing inside could be tapped.
    // Desktop, two columns (§2 symmetry, maintainer 13.11.2026): the card fills the row the wheel sets and the list's
    // plate grows into it, its rows at their usual height with room below, so the right column does not end far above
    // the left one. One column (phone): everything at its own height.
    return parts.length ? '<style>ha-card.disabled{pointer-events:auto!important;}:host{height:100%;}#aspect-ratio{display:block!important;height:100%!important;}ha-card{height:100%!important;}#container{grid-template-rows:1fr!important;height:100%!important;}#body{align-self:stretch!important;height:100%!important;}'
      + '.mx{display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap, 24px);height:100%;}'
      + '.mx > .mx-s:last-child{flex:1 1 auto;display:flex;flex-direction:column;}'
      + '.mx > .mx-s:last-child > div:last-child{flex:1 1 auto;display:flex;flex-direction:column;}'
      + '.mx > .mx-s:last-child .hui-plate{flex:1 1 auto;}'
      + '.mx > .mx-s:last-child .hui-plate{justify-content:flex-start;}'
      + '</style><div class="mx">'
      + parts.map(function (partHtml) { return '<div class="mx-s">' + partHtml + '</div>'; }).join('') + '</div>' : '';
  };
  // Global markup builders for the templates (tools/html-escape-check.mjs counts window._casora…Html as markup).
  window._casoraMediaExtraHtml = function (entity, hass) { return X.sec(entity, hass); };
  X.has = function (hass, id) { return G.list(hass, id).length > 0; };

  // ── Camera timeline ─────────────────────────────────────────────────────────────────────────────────────
  var C = window._casoraCamTimeline = {};
  var MOTION_DC = ['motion', 'occupancy', 'presence'];
  var kindOf = function (hass, id) {
    var e = reg(hass, id), s = hass.states[id], dc = s && s.attributes ? s.attributes.device_class : null;
    if (id.indexOf('event.') === 0) return dc === 'doorbell' ? 'ring' : null;
    if (id.indexOf('binary_sensor.') !== 0 || MOTION_DC.indexOf(dc) < 0) return null;
    return e.translation_key === 'person' ? 'person' : 'motion';
  };
  C.sources = function (hass, camId) {
    if (!hass || !hass.states || !hass.entities) return [];
    var ce = reg(hass, camId), ents = hass.entities;
    var pick = function (match) {
      return Object.keys(ents).filter(function (id) { return hass.states[id] && match(ents[id]) && kindOf(hass, id); })
        .map(function (id) { return { id: id, kind: kindOf(hass, id) }; });
    };
    // Only the camera's own device (maintainer, 13.11.2026): a room's motion sensor says nothing about this picture.
    var out = ce.device_id ? pick(function (e) { return e.device_id === ce.device_id; }) : [];
    return out;
  };
  // history_during_period (minimal, no attributes) → events newest first. The first row of each entity is its state
  // at the start of the period, not an event. Binary sensors: every change to „on“; doorbell events: every new
  // timestamp. Same kind within a minute (ring: 5 s) counts once.
  C.parse = function (raw, sources, start) {
    var all = [];
    (sources || []).forEach(function (src) {
      var rows = raw && raw[src.id];
      if (!Array.isArray(rows)) return;
      var prev = null;
      rows.forEach(function (r, i) {
        var s = r.s != null ? r.s : r.state;
        var ts = r.lc != null ? r.lc * 1000 : r.lu != null ? r.lu * 1000 : Date.parse(r.last_changed || r.last_updated);
        var first = i === 0 && start && ts <= start + 1000;
        if (src.kind === 'ring') {
          var at = Date.parse(s);
          if (!first && isFinite(at) && s !== prev) all.push({ kind: 'ring', at: at >= (start || 0) ? at : ts, id: src.id });
        } else if (s === 'on' && prev !== 'on' && !first) all.push({ kind: src.kind, at: ts, id: src.id });
        prev = s;
      });
    });
    all = all.filter(function (e) { return isFinite(e.at) && (!start || e.at >= start); }).sort(function (a, b) { return b.at - a.at; });
    // One moment, one mark: a ring or a person within a minute stands for the motion around it (rank ring > person
    // > motion); the same kind within a minute (ring: 5 s) counts once.
    var rank = { ring: 3, person: 2, motion: 1 };
    var out = [];
    all.slice().sort(function (a, b) { return (rank[b.kind] - rank[a.kind]) || (b.at - a.at); }).forEach(function (e) {
      var win = e.kind === 'ring' ? 5000 : 60000;
      var dup = out.some(function (x) {
        return (x.kind === e.kind && Math.abs(x.at - e.at) < win) || (rank[x.kind] > rank[e.kind] && Math.abs(x.at - e.at) < 60000);
      });
      if (!dup) out.push(e);
    });
    return out.sort(function (a, b) { return b.at - a.at; });
  };
  // Recordings in HA's media browser: integrations whose media source holds the camera's clips.
  C.MEDIA = { reolink: 'reolink', unifiprotect: 'unifiprotect', frigate: 'frigate', motioneye: 'motioneye' };
  C.media = function (hass, camId) {
    var comp = (hass && hass.config && hass.config.components) || [];
    var src = C.MEDIA[reg(hass, camId).platform];
    return src && comp.indexOf(src) > -1 && comp.indexOf('media_source') > -1
      ? '/media-browser/browser/' + encodeURIComponent('app,media-source://' + src) : null;
  };
  C.dayStart = function (now) { var d = new Date(now || Date.now()); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var WORD = { motion: 'Bewegung', person: 'Person erkannt', ring: 'Hat geklingelt' };
  C.word = function (kind) { return WORD[kind] || WORD.motion; };
  var clock = function (ms) {
    var d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };
  C.ago = function (ms, now) {
    var m = Math.max(0, Math.floor(((now || Date.now()) - ms) / 60000));
    return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : 'vor ' + Math.round(m / 60) + ' Std.';
  };
  C.head = function (n) { return n === 1 ? 'Heute · 1 Ereignis' : 'Heute · ' + n + ' Ereignisse'; };

  // Cache per camera: asked again only when a source changed since, or after 10 minutes.
  var cache = {};
  var TTL = 600000;
  C.keyOf = function (hass, sources) {
    return sources.map(function (s) { var x = hass.states[s.id]; return x ? x.last_changed + x.state : ''; }).join('|');
  };
  C.load = function (hass, camId, done) {
    var sources = C.sources(hass, camId);
    if (!sources.length) { done(null); return; }
    var key = C.keyOf(hass, sources), hit = cache[camId], start = C.dayStart();
    if (hit && hit.key === key && hit.start === start && Date.now() - hit.at < TTL) { done(hit); return; }
    if (hit && hit.busy && Date.now() - hit.at < 15000) { hit.wait.push(done); return; }
    var job = cache[camId] = { key: key, start: start, at: Date.now(), busy: true, list: hit ? hit.list : null, sources: sources, wait: [done] };
    var fin = function () { job.busy = false; var w = job.wait; job.wait = []; w.forEach(function (f) { try { f(job); } catch (e) { /* gone */ } }); };
    hass.callWS({ type: 'history/history_during_period', start_time: new Date(start).toISOString(), end_time: new Date().toISOString(),
      entity_ids: sources.map(function (s) { return s.id; }), minimal_response: true, no_attributes: true, significant_changes_only: false })
      .then(function (raw) { job.list = C.parse(raw, sources, start); job.err = false; })
      .catch(function () { job.list = job.list || []; job.err = true; })
      .then(fin);
  };

  C.css = function () {
    return '<style>'
      + '.ctl{font-family:var(--primary-font-family, system-ui);background:var(--casora-popup-row-fill, rgba(140,115,90,.07));'
      +   'border-radius:var(--casora-popup-row-radius, 20px);padding:16px 16px 14px;color:var(--casora-popup-tiles-text-primary, #3A322B);}'
      + '.ctl-strip{position:relative;height:34px;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;outline:none;}'
      + '.ctl-track{position:absolute;left:0;right:0;top:10px;height:14px;border-radius:7px;background:var(--casora-soft-control-fill, rgba(140,115,90,.12));}'
      + '.ctl-m{position:absolute;top:17px;transform:translate(-50%,-50%);border-radius:999px;pointer-events:none;transition:box-shadow .16s ease;}'
      + '.ctl-m.motion{width:4px;height:14px;background:var(--casora-soft-sub, rgba(58,50,43,.55));}'
      + '.ctl-m.person{width:10px;height:10px;background:var(--casora-popup-tiles-text-primary, #3A322B);}'
      + '.ctl-m.ring{width:16px;height:16px;background:var(--casora-popup-accent, var(--casora-color-teal, #30B0C7));box-shadow:0 0 0 3px var(--casora-popup-row-fill, rgba(255,255,255,.6));}'
      + '.ctl-m.sel{box-shadow:0 0 0 3px var(--casora-popup-row-fill, #fff), 0 0 0 5px var(--casora-popup-accent, #B67A50);}'
      + '.ctl-ax{position:relative;height:16px;margin-top:2px;font-size:12px;font-weight:600;color:var(--casora-soft-sub, rgba(58,50,43,.6));font-variant-numeric:tabular-nums;}'
      + '.ctl-ax span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;}'
      + '.ctl-ax span:first-child{transform:none;}.ctl-ax span:last-child{transform:translateX(-100%);}'
      + '.ctl-r{display:flex;align-items:baseline;gap:8px;margin-top:12px;min-height:20px;}'
      + '.ctl-w{font-size:15px;font-weight:700;}.ctl-t{font-size:13px;font-weight:500;color:var(--casora-soft-sub, rgba(58,50,43,.6));font-variant-numeric:tabular-nums;}'
      + '.ctl-go{margin-left:auto;font-size:13px;font-weight:600;color:var(--casora-soft-sub, rgba(58,50,43,.6));}'
      + '</style>';
  };
  C.render = function (job, camId, hass, now) {
    var UI = window._casoraUI;
    now = now || Date.now();
    var start = C.dayStart(now), span = Math.max(1, now - start);
    var labelHtml = function (t) { return UI && UI.label ? UI.label(t) : '<div>' + esc(T(t)) + '</div>'; };
    if (!job) return '';
    var list = job.list;
    if (list == null) {
      return labelHtml('Heute') + '<div class="ctl" aria-busy="true"><div class="ctl-strip"><div class="ctl-track"></div></div><div class="ctl-ax"></div><div class="ctl-r"></div></div>';
    }
    if (!list.length) {
      return labelHtml('Heute') + (UI && UI.group ? UI.group([{ icon: job.err ? 'mdi:alert-circle-outline' : 'mdi:check', iconTone: job.err ? 'warn' : null,
        label: job.err ? 'Verlauf nicht abrufbar' : 'Heute keine Bewegung' }], null) : '');
    }
    var media = C.media(hass, camId);
    var pct = function (at) { return Math.max(0, Math.min(100, (at - start) / span * 100)); };
    var marksHtml = list.slice().reverse().map(function (e) {
      return '<i class="ctl-m ' + esc(e.kind) + '" data-at="' + Number(e.at) + '" data-k="' + esc(e.kind) + '" style="left:' + pct(e.at).toFixed(2) + '%"></i>';
    }).join('');
    var ticksHtml = [0, 6, 12, 18].map(function (h) { return start + h * 3600000; }).filter(function (t) { return t < now - span * 0.12; })
      .map(function (t) { return '<span style="left:' + pct(t).toFixed(2) + '%">' + esc(clock(t)) + '</span>'; }).join('')
      + '<span style="left:100%">' + esc(T('Jetzt')) + '</span>';
    var top = list[0];
    var sum = T(C.head(list.length));
    return labelHtml(C.head(list.length))
      + '<div class="ctl" data-cam="' + esc(camId) + '"' + (media ? ' data-media="' + esc(media) + '"' : '') + '>'
      + '<div class="ctl-strip" role="slider" tabindex="0" aria-label="' + esc(sum) + '" aria-valuemin="0" aria-valuemax="' + (list.length - 1)
      +   '" aria-valuenow="' + (list.length - 1) + '" onclick="window._casoraCamTimeline.tap(event,this)">'
      + '<div class="ctl-track"></div>' + marksHtml + '</div>'
      + '<div class="ctl-ax">' + ticksHtml + '</div>'
      + '<div class="ctl-r" aria-live="polite"><span class="ctl-w">' + esc(T(C.word(top.kind))) + '</span>'
      +   '<span class="ctl-t">' + esc(clock(top.at) + ' · ' + T(C.ago(top.at, now))) + '</span>'
      +   (media ? '<span class="ctl-go">' + esc(T('Aufnahmen')) + ' ↗</span>' : '') + '</div>'
      + '</div>';
  };
  // Nearest event to the tap: with recordings, open them; otherwise only show its time.
  C.nearest = function (marks, x) {
    var best = null, d = Infinity;
    marks.forEach(function (m) { var dd = Math.abs(m.x - x); if (dd < d) { d = dd; best = m; } });
    return best;
  };
  C.tap = function (ev, strip) {
    if (ev) { ev.stopPropagation(); }
    var box = strip.getBoundingClientRect();
    var els = Array.prototype.slice.call(strip.querySelectorAll('.ctl-m'));
    var hit = C.nearest(els.map(function (el) { var r = el.getBoundingClientRect(); return { el: el, x: r.left + r.width / 2 }; }),
      ev && ev.clientX != null ? ev.clientX : box.left + box.width);
    if (!hit) return;
    if (window.casoraHaptic) window.casoraHaptic('selection');
    els.forEach(function (el) { el.classList.toggle('sel', el === hit.el); });
    var at = Number(hit.el.getAttribute('data-at')), plate = strip.parentNode;
    var r = plate.querySelector('.ctl-r');
    if (r) {
      r.querySelector('.ctl-w').textContent = T(C.word(hit.el.getAttribute('data-k')));
      r.querySelector('.ctl-t').textContent = clock(at) + ' · ' + T(C.ago(at));
    }
    var media = plate.getAttribute('data-media');
    if (media) {
      try { if (window.casoraPopup) window.casoraPopup.close(); } catch (e) { /* closed */ }
      history.pushState(null, '', media);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    }
  };
  // The camera popup's markup is cached per camera state, so the timeline fills itself in: a placeholder and an
  // <img> whose onload calls mount(this). It redraws every minute while the popup is open (from the cache).
  C.mount = function (img) {
    var box = img && img.previousElementSibling;
    var ha = typeof document !== 'undefined' && document.querySelector('home-assistant');
    var hass = ha && ha.hass;
    if (!box || !hass) return;
    var camId = box.getAttribute('data-cam-tl');
    if (!C.sources(hass, camId).length) { box.innerHTML = ''; return; }
    var draw = function () {
      if (!box.isConnected) { clearInterval(box._ctlT); return; }
      var h = (document.querySelector('home-assistant') || {}).hass || hass;
      C.load(h, camId, function (job) { if (box.isConnected) { var tlHtml = C.css() + C.render(job, camId, h); box.innerHTML = tlHtml; } });
    };
    var waitHtml = C.css() + C.render({ list: null }, camId, hass);
    box.innerHTML = waitHtml;
    draw();
    clearInterval(box._ctlT);
    box._ctlT = setInterval(draw, 60000);
  };
  window._casoraCamTimelineHtml = function (camId) { return C.slot(camId); };
  C.slot = function (camId) {
    return '<div class="cam-tl" data-cam-tl="' + esc(camId) + '"></div>'
      + '<img alt="" style="display:none" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="'
      + ' onload="window._casoraCamTimeline&amp;&amp;window._casoraCamTimeline.mount(this)">';
  };
})();
