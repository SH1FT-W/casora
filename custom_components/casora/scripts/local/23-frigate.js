// ── Frigate: Kamera-Kachel + Popup (Community-Karte, aus Kartenwunsch #22) ──────
// Für Kameras der Frigate-Integration (camera.<cam> mit Attributen camera_name/client_id). Die Kachel ist
// die Casora-Kamera-Kachel (Standbild, Offline, Alter) und sagt dazu, was Frigate zuletzt erkannt hat
// („Person erkannt“, „Person · vor 3 Min.“). Das Popup zeigt das Live-Bild, die letzten Erkennungen mit
// Schnappschuss (WebSocket frigate/events/get der Integration), Erkennungen je Objekt und die Schalter.
// Die Integration setzt keine translation_key: Entitäten am Gerät der Kamera werden über Domain,
// Einheit „objects“, device_class und das Ende der Entity-ID gefunden (Rückfall: Name ohne Gerätenamen,
// Symbol der Integration) – die IDs bildet Frigate aus englischen Namen, unabhängig von der HA-Sprache.
//   window._casoraFrigate.is(hass, id)                    → Frigate-Kamera?
//   window._casoraFrigate.find(hass, id)                  → {cam, name, inst, objs{o:{occ,count,active,img}}, all, motion, sw{}, review, server}
//   window._casoraFrigate.status(c, states, now)          → {dead, detectOff, live[], last{o, at}, rec, …}
//   window._casoraFrigate.tileText(s, now)                → Text der Kachel oder null (dann wie die Kamera-Kachel)
//   window._casoraFrigate.popup(entity, states, hass)     – Popup casora_popup_frigate
//   window._casoraFrigate.sec(part, c, states, hass, el)  – Live-Bereiche (hero, ctl, objs, ev, sys)
//   window._casoraFrigate.events(hass, c, el)             – letzte Erkennungen (Cache, signierte Bildadressen)
//   window._casoraFrigate.hold(hass, id)                  – Einträge fürs Halten-Menü (22-halten.js)
(function () {
  if (window._casoraFrigate) return;
  var F = window._casoraFrigate = {};

  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var slug = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); };
  var T = function (x) { return window.casoraT ? window.casoraT(x) : x; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  var COLOR = { alert: 'var(--casora-color-red, #D35A4E)' };
  F.COLOR = COLOR;

  // Objekte, die Frigate erkennt (Labelmap von Frigate+ und COCO), deutsch; Unbekanntes lesbar gemacht.
  var LABEL = {
    person: 'Person', car: 'Auto', cat: 'Katze', dog: 'Hund', bird: 'Vogel', bicycle: 'Fahrrad', motorcycle: 'Motorrad',
    bus: 'Bus', truck: 'Lkw', boat: 'Boot', horse: 'Pferd', cow: 'Kuh', sheep: 'Schaf', bear: 'Bär', deer: 'Reh',
    fox: 'Fuchs', rabbit: 'Kaninchen', raccoon: 'Waschbär', squirrel: 'Eichhörnchen', package: 'Paket', face: 'Gesicht',
    license_plate: 'Kennzeichen', waste_bin: 'Mülltonne', umbrella: 'Schirm', robot_lawnmower: 'Mähroboter',
    amazon: 'Amazon', dhl: 'DHL', ups: 'UPS', fedex: 'FedEx', usps: 'USPS', dpd: 'DPD', gls: 'GLS',
  };
  var ICON = {
    person: 'mdi:walk', car: 'mdi:car', cat: 'mdi:cat', dog: 'mdi:dog-side', bird: 'mdi:bird', bicycle: 'mdi:bicycle',
    motorcycle: 'mdi:motorbike', bus: 'mdi:bus', truck: 'mdi:truck', boat: 'mdi:sail-boat', horse: 'mdi:horse',
    cow: 'mdi:cow', package: 'mdi:package-variant-closed', face: 'mdi:face-recognition', license_plate: 'mdi:card-text-outline',
    deer: 'mdi:deer', rabbit: 'mdi:rabbit', squirrel: 'mdi:squirrel', bear: 'mdi:teddy-bear', fox: 'mdi:dog-side',
  };
  // Englisch: Frigates eigenes Label („Car“) – „Auto“ hieße dort „Auto“ (Automatik) und ginge in der Übersetzung verloren.
  var deUI = function () { var l = window.casoraLocale ? String(window.casoraLocale() || '') : 'de'; return !l || /^de/i.test(l); };
  F.label = function (o) {
    var k = slug(o);
    if (LABEL[k] && deUI()) return LABEL[k];
    var t = k.replace(/_/g, ' ');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Objekt';
  };
  F.icon = function (o) { return ICON[slug(o)] || 'mdi:eye-outline'; };

  // Schalter der Integration (switch.<cam>_<art>); Rückfall über das Symbol, das die Integration setzt.
  var SW = { detect: 'detect', motion: 'motion', recordings: 'recordings', snapshots: 'snapshots', audio_detection: 'audio',
    audio: 'audio', improve_contrast: 'contrast', ptz_autotracker: 'ptz', review_alerts: 'alerts', review_detections: 'detections' };
  var SW_ICON = { 'mdi:filmstrip-box-multiple': 'recordings', 'mdi:image-multiple': 'snapshots', 'mdi:ear-hearing': 'audio',
    'mdi:contrast-circle': 'contrast', 'mdi:bell-alert': 'alerts', 'mdi:eye-check': 'detections' };

  // ── Frigate-Kamera? ───────────────────────────────────────────────────────
  F.is = function (hass, id) {
    if (!id || !/^camera\./.test(id) || !hass) return false;
    var e = (hass.entities || {})[id];
    if (e && e.platform === 'frigate') return true;
    var a = ((hass.states || {})[id] || {}).attributes || {};
    return !!(a.camera_name && a.client_id);
  };

  // ── Entitäten am Gerät der Kamera ─────────────────────────────────────────
  var cache = {};
  F.find = function (hass, id) {
    var R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {}, S = (hass && hass.states) || {};
    var hit = cache[id];
    if (hit && hit.R === R && hit.D === D) return hit.c;
    var a = (S[id] || {}).attributes || {};
    var oid = String(id || '').split('.')[1] || '';
    var me = R[id] || {}, dev = me.device_id ? D[me.device_id] : null;
    var devName = dev ? String(dev.name_by_user || dev.name || '') : '';
    var c = { cam: id, name: a.camera_name || oid, inst: String(a.client_id || 'frigate'), device: me.device_id || null,
      objs: {}, order: [], all: {}, motion: null, sw: {}, review: null, server: null, config: dev && dev.configuration_url || null };
    var obj = function (o) { if (!c.objs[o]) { c.objs[o] = {}; c.order.push(o); } return c.objs[o]; };
    // Ende der Entity-ID hinter dem Kameranamen; umbenannt: Name ohne Gerätenamen.
    var tail = function (eid) {
      var rest = eid.split('.')[1] || '';
      if (oid && rest.indexOf(oid + '_') === 0) return rest.slice(oid.length + 1);
      var fn = String(((S[eid] || {}).attributes || {}).friendly_name || '');
      if (devName && fn.toLowerCase().indexOf(devName.toLowerCase() + ' ') === 0) fn = fn.slice(devName.length + 1);
      return slug(fn);
    };
    if (me.device_id) {
      Object.keys(R).forEach(function (eid) {
        var e = R[eid];
        if (!e || eid === id || e.device_id !== me.device_id || !S[eid]) return;
        var dom = eid.split('.')[0], t = tail(eid), at = S[eid].attributes || {}, m;
        if (dom === 'binary_sensor' && (m = t.match(/^(.+)_occupancy$/))) {
          if (m[1] === 'all') c.all.occ = eid; else obj(m[1]).occ = eid;
        } else if (dom === 'binary_sensor' && (t === 'motion' || at.device_class === 'motion')) {
          if (!c.motion) c.motion = eid;
        } else if (dom === 'sensor' && at.unit_of_measurement === 'objects' && (m = t.match(/^(.+?)_(active_)?count$/))) {
          var slot = m[2] ? 'active' : 'count';
          if (m[1] === 'all') c.all[slot] = eid; else obj(m[1])[slot] = eid;
        } else if (dom === 'image' && t) {
          obj(t).img = eid;
        } else if (dom === 'switch') {
          var k = SW[t] || SW_ICON[at.icon];
          if (k && !c.sw[k]) c.sw[k] = eid;
        } else if (dom === 'sensor' && t === 'review_status') c.review = eid;
      });
    }
    // Frigate-Server (Status „running“): Gerät, an dem die Kamera hängt (via_device), sonst sensor.frigate_status.
    var via = dev && dev.via_device_id;
    Object.keys(R).forEach(function (eid) {
      if (c.server || !/^sensor\./.test(eid) || !S[eid]) return;
      var e = R[eid];
      if (via ? (e.device_id === via && /_status$/.test(eid)) : /^sensor\.frigate(_\w+)?_status$/.test(eid)) c.server = eid;
    });
    // Reihenfolge: Person, Auto … wie die Integration, Unbekanntes alphabetisch dahinter.
    var rank = Object.keys(LABEL);
    c.order.sort(function (x, y) {
      var ix = rank.indexOf(x), iy = rank.indexOf(y);
      return (ix < 0 ? 999 : ix) - (iy < 0 ? 999 : iy) || (x < y ? -1 : 1);
    });
    // Nur merken, wenn der Zustand der Kamera (mit camera_name) schon da ist: beim HA-Start kommt die Registry
    // vor den Zuständen – sonst blieben Entitäten und der Kameraname (Rückfall Entity-ID, falsch für
    // frigate/events/get) für immer so.
    if (S[id] && a.camera_name) cache[id] = { R: R, D: D, c: c };
    else delete cache[id];
    return c;
  };
  F.watch = function (c) {
    var out = [c.cam, c.motion, c.all.occ, c.all.count, c.review, c.server];
    Object.keys(c.sw).forEach(function (k) { out.push(c.sw[k]); });
    c.order.forEach(function (o) { var x = c.objs[o]; out.push(x.occ, x.count, x.active, x.img); });
    return out.filter(Boolean);
  };

  // ── Zustand ───────────────────────────────────────────────────────────────
  var on = function (S, id) { return !!(id && S[id] && S[id].state === 'on'); };
  var swState = function (S, id) { return id && S[id] && !bad(S[id].state) ? S[id].state === 'on' : null; };
  F.status = function (c, states, now) {
    var S = states || {}, t = now || Date.now();
    var st = S[c.cam];
    var s = { dead: !st || bad(st.state), off: !!(st && st.state === 'off'), live: [], last: null, objs: {},
      detect: swState(S, c.sw.detect), rec: swState(S, c.sw.recordings), snaps: swState(S, c.sw.snapshots),
      motion: on(S, c.motion), server: c.server && S[c.server] ? String(S[c.server].state || '') : null };
    s.detectOff = s.detect === false;
    c.order.forEach(function (o) {
      var x = c.objs[o], cnt = x.active && S[x.active] ? num(S[x.active].state) : null;
      if (cnt == null && x.count && S[x.count]) cnt = num(S[x.count].state);
      var live = on(S, x.occ) || (cnt != null && cnt > 0);
      // Zeitpunkt der letzten Erkennung: Schnappschuss (Zustand der Bild-Entität), sonst Beginn der laufenden Belegung.
      var at = x.img && S[x.img] ? Date.parse(S[x.img].state) : NaN;
      if (!isFinite(at) && live && x.occ && S[x.occ]) at = Date.parse(S[x.occ].last_changed);
      if (live && x.occ && S[x.occ] && S[x.occ].state === 'on') {
        var since = Date.parse(S[x.occ].last_changed);
        if (isFinite(since) && (!isFinite(at) || since > at)) at = since;
      }
      s.objs[o] = { live: live, n: cnt, at: isFinite(at) && at <= t + 60000 ? at : null };
      if (live) s.live.push(o);
      if (s.objs[o].at && (!s.last || s.objs[o].at > s.last.at)) s.last = { o: o, at: s.objs[o].at };
    });
    return s;
  };
  // Geschützte Leerzeichen: „vor 5 Min.“ bricht im Popup-Kopf am Handy nicht mitten durch.
  // short (schmale Handy-Kachel): ohne „vor“ – „Person · 5 Min.“ statt der Kürzung „Person +1“.
  F.ago = function (ms, now, short) {
    var m = Math.max(0, Math.floor(((now || Date.now()) - ms) / 60000));
    var pre = short ? '' : 'vor\u00a0';
    if (m < 1) return short ? 'jetzt' : 'gerade\u00a0eben';
    if (m < 60) return pre + m + '\u00a0Min.';
    var d = window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.floor(m / 1440);
    if (m < 1440 || d < 1) return pre + Math.round(m / 60) + '\u00a0Std.';
    return d === 1 ? (short ? 'Gestern' : 'gestern') : pre + d + '\u00a0Tagen';
  };
  var who = function (list) {
    if (list.length === 1) return F.label(list[0]) + ' erkannt';
    if (list.length === 2) return F.label(list[0]) + ' und ' + F.label(list[1]) + ' erkannt';
    return list.length + ' Objekte erkannt';
  };
  // Kachel: Erkennung aus · jetzt erkannt · letzte Erkennung (bis 24 Std.) – sonst null (Kamera-Text).
  // Trenner „ · “ wie in der Liste; schmal (Handy) mit Uhrzeit „Person 14:23“ ohne Trenner – casoraStateFit kürzte an
  // „ · “ zu „Person +1“ – und keine Dauer-Verwechslung wie bei „Auto, 1 Min.“ (Nutzerprüfung Runde 2).
  F.tileText = function (s, now, short) {
    if (!s || s.dead || s.off) return null;
    if (s.detectOff) return 'Erkennung aus';
    if (s.live.length) return short && s.live.length > 1 ? s.live.length + ' Objekte erkannt' : who(s.live);
    if (s.last && (now || Date.now()) - s.last.at < 86400000) return F.label(s.last.o) + (short ? ' ' + clock(s.last.at) : ' · ' + F.ago(s.last.at, now));
    return null;
  };
  F.of = function (entity, hass, states) {
    var id = entity && entity.entity_id;
    if (!F.is(hass, id)) return null;
    return F.status(F.find(hass, id), states || (hass && hass.states) || {});
  };

  // ── Bildadressen (signiert) und letzte Erkennungen ───────────────────────
  // Frigates Bilder liegen hinter HAs Anmeldung (/api/frigate/<instanz>/thumbnail/<id>); ein <img> schickt kein
  // Token – darum signiert (auth/sign_path), wie HAs eigene Medien. Signiert für 10 Min., neu nach 8.
  var signed = {};
  F.sign = function (hass, path) {
    var x = signed[path];
    if (x && Date.now() - x.at < 480000) return x.p;
    if (!hass || !hass.callWS) return Promise.resolve(null);
    var p = hass.callWS({ type: 'auth/sign_path', path: path, expires: 600 })
      .then(function (r) { return r && r.path ? r.path : null; }).catch(function () { return null; });
    signed[path] = { at: Date.now(), p: p };
    return p;
  };
  F.path = function (c, kind, id) {
    var b = '/api/frigate/' + encodeURIComponent(c.inst);
    if (kind === 'thumb') return b + '/thumbnail/' + encodeURIComponent(id);
    if (kind === 'snap') return b + '/snapshot/' + encodeURIComponent(id);
    return b + '/notifications/' + encodeURIComponent(id) + '/clip.mp4';
  };
  // Antwort der Integration (JSON-Text von Frigates /api/events) → [{id, o, start, end, score, zones, clip, snap}].
  F.parse = function (raw) {
    var list = raw;
    if (typeof raw === 'string') { try { list = JSON.parse(raw); } catch (e) { list = []; } }
    if (!Array.isArray(list)) return [];
    return list.filter(function (e) { return e && e.id && e.label; }).map(function (e) {
      var d = e.data || {};
      return { id: String(e.id), o: String(e.label), sub: e.sub_label || null, start: num(e.start_time) * 1000,
        end: e.end_time != null ? num(e.end_time) * 1000 : null, score: num(d.top_score != null ? d.top_score : (e.top_score != null ? e.top_score : d.score)),
        zones: Array.isArray(e.zones) ? e.zones : [], clip: !!e.has_clip, snap: !!e.has_snapshot };
    }).filter(function (e) { return isFinite(e.start); }).sort(function (x, y) { return y.start - x.start; });
  };
  var evc = {};
  // Einmal je Änderung an der Kamera (neuer Schnappschuss/Belegung) bzw. höchstens alle 30 s neu fragen;
  // danach die offenen Bereiche neu zeichnen (wie Personen-/Mäher-Popup).
  F.events = function (hass, c, el) {
    var S = (hass && hass.states) || {};
    var key = F.watch(c).filter(function (x) { return /^(image|binary_sensor)\./.test(x); })
      .map(function (x) { return S[x] ? S[x].last_changed : ''; }).join('|');
    var hit = evc[c.cam];
    var fresh = hit && hit.key === key && Date.now() - hit.at < 30000;
    // Hängt eine Anfrage (keine Antwort), nach 15 s neu fragen – sonst bliebe „Wird geladen …“ für immer.
    var busy = hit && hit.busy && Date.now() - hit.at < 15000;
    if (fresh || busy) { if (el && busy && hit.wait.indexOf(el) < 0) hit.wait.push(el); return hit.list; }
    var job = evc[c.cam] = { key: key, at: Date.now(), list: hit ? hit.list : null, err: hit ? hit.err : false, busy: true, wait: el ? [el] : [] };
    if (!hass || !hass.callWS) { job.busy = false; job.list = job.list || []; return job.list; }
    var after = Math.floor(Date.now() / 1000) - 7 * 86400;
    hass.callWS({ type: 'frigate/events/get', instance_id: c.inst, cameras: [c.name], limit: 40, after: after })
      .then(function (raw) {
        var list = F.parse(raw);
        return Promise.all(list.slice(0, 12).map(function (e) {
          return F.sign(hass, F.path(c, 'thumb', e.id)).then(function (u) { e.thumb = u; });
        })).then(function () { return list; });
      })
      .then(function (list) { job.list = list; job.err = false; })
      .catch(function () { job.list = job.list || []; job.err = true; })
      .then(function () {
        job.busy = false;
        job.wait.forEach(function (w) {
          try {
            if (typeof window.casoraKick === 'function') window.casoraKick(w);
            else if (typeof w.requestUpdate === 'function') w.requestUpdate('_config', undefined);
          } catch (e) { /* Popup schon zu */ }
        });
        job.wait = [];
      });
    return job.list;
  };
  // Filter nach Objekt (Antippen in „Objekte“) und „Mehr anzeigen“ je Kamera; offene Bereiche neu zeichnen.
  var flt = {}, more = {}, els = {};
  F.filter = function (cam) { return flt[cam] || null; };
  var shown = function (cam) {
    var l = (evc[cam] && evc[cam].list) || [];
    return flt[cam] ? l.filter(function (e) { return e.o === flt[cam]; }) : l;
  };
  F.shown = shown;
  var redraw = function (cam) {
    (els[cam] || []).forEach(function (w) {
      if (!w || !w.isConnected) return;
      try { if (typeof window.casoraKick === 'function') window.casoraKick(w); } catch (e) { /* zu */ }
    });
  };
  F.forget = function (cam) { delete evc[cam]; };
  F.eventById = function (cam, id) {
    var l = (evc[cam] && evc[cam].list) || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  };

  // ── Wege nach draußen: Frigate-Oberfläche, Aufnahmen (HAs Medien) ─────────
  // Frigate als App (Add-on mit Seitenleisten-Eintrag) bevorzugt, sonst die Adresse des Geräts.
  F.ui = function (hass, c) {
    var P = (hass && hass.panels) || {};
    var keys = Object.keys(P);
    for (var i = 0; i < keys.length; i++) {
      var p = P[keys[i]] || {};
      if (/frigate/i.test(String(p.url_path || '') + ' ' + String(p.title || ''))) return { path: '/' + p.url_path };
    }
    var u = c && c.config;
    if (!u && hass && c) {
      var R = hass.entities || {}, D = hass.devices || {}, me = R[c.cam], d = me && D[me.device_id];
      u = d && d.via_device_id && D[d.via_device_id] ? D[d.via_device_id].configuration_url : null;
    }
    return /^https?:\/\//.test(String(u || '')) ? { url: String(u) } : null;
  };
  F.media = function (hass) {
    var comp = (hass && hass.config && hass.config.components) || [];
    return comp.indexOf('frigate') !== -1 && comp.indexOf('media_source') !== -1
      ? '/media-browser/browser/' + encodeURIComponent('app,media-source://frigate') : null;
  };
  var go = function (where) {
    if (!where) return;
    if (where.url) { window.open(where.url, '_blank', 'noopener'); return; }
    try { if (window.casoraPopup) window.casoraPopup.close(); } catch (e) { /* schon zu */ }
    history.pushState(null, '', where.path);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  };
  F.go = go;

  // ── Erkennung im Detail (Schnappschuss, Clip) ─────────────────────────────
  // Öffnet sich aus der Liste im Popup (‹ zurück) oder aus dem Halten-Menü.
  // Deutsch „09:05“ zweistellig, sonst hour 'numeric': Englisch „9:05 AM“ statt „09:05 AM“.
  var clock = function (ms) {
    var l = window.casoraLocale ? window.casoraLocale() : undefined;
    return new Date(ms).toLocaleTimeString(l, { hour: !l || /^de/i.test(String(l)) ? '2-digit' : 'numeric', minute: '2-digit' });
  };
  var dayWord = function (ms, now) {
    var a = new Date(now || Date.now()); a.setHours(0, 0, 0, 0);
    var b = new Date(ms); b.setHours(0, 0, 0, 0);
    var d = Math.round((a - b) / 86400000);
    if (d === 0) return null;
    if (d === 1) return 'Gestern';
    return b.toLocaleDateString(window.casoraLocale ? window.casoraLocale() : undefined, { weekday: 'short', day: 'numeric', month: 'numeric' });
  };
  // Zeitpunkt mit Tag, wenn nicht heute: „Gestern · 23:30“, „Mi., 14.10. · 22:47“ (Trenner wie überall „ · “).
  var stamp = function (ms) { var dw = dayWord(ms); return (dw ? dw + ' · ' : '') + clock(ms); };
  var lastBack = null;
  // Blättern im Detail mit Pfeiltasten und Wischen über dem Bild (navNow = offenes Detail).
  var nav0 = null, navNow = null;
  var navGo = function (dir) {
    var P = window.casoraPopup, n = navNow && navNow.nav;
    if (!n || !P || !P.current || P.current !== navNow.cfg) return false;
    var id = dir < 0 ? n.newer : n.older;
    if (!id) return false;
    F.detail(n.cam, id, n.back === 'b' ? lastBack : null);
    return true;
  };
  F.navGo = navGo;
  var listen = typeof document.addEventListener === 'function' ? document.addEventListener.bind(document) : function () {};
  listen('keydown', function (ev) {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    var t = ev.target && ev.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'VIDEO') return;
    if (navGo(ev.key === 'ArrowLeft' ? -1 : 1)) ev.preventDefault();
  });
  var sw0 = null;
  listen('touchstart', function (ev) {
    var path = ev.composedPath ? ev.composedPath() : [];
    var on = path.some(function (x) { return x && x.getAttribute && x.hasAttribute && x.hasAttribute('data-frigate-swipe'); });
    sw0 = on && ev.touches.length === 1 ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() } : null;
  }, { passive: true, capture: true });
  listen('touchend', function (ev) {
    if (!sw0 || !ev.changedTouches.length) return;
    var dx = ev.changedTouches[0].clientX - sw0.x, dy = ev.changedTouches[0].clientY - sw0.y, quick = Date.now() - sw0.t < 600;
    sw0 = null;
    if (quick && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) navGo(dx > 0 ? -1 : 1);
  }, { passive: true, capture: true });
  var zoneName = function (z) { var t = String(z || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
  F.detail = function (cam, evId, back) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    var P = window.casoraPopup, UI = window._casoraUI, K = window._casoraSoftKit;
    if (!hass || !P || !UI || !K || !F.is(hass, cam)) return false;
    var c = F.find(hass, cam), e = typeof evId === 'object' ? evId : F.eventById(cam, evId);
    if (!e) return false;
    // Blättern wie in Frigate: neuere/ältere Erkennung derselben Liste (Filter nach Objekt gilt mit).
    var all = shown(cam), at = -1;
    for (var k = 0; k < all.length; k++) if (all[k].id === e.id) at = k;
    var snapP = F.sign(hass, F.path(c, 'snap', e.id));
    var clipP = e.clip ? F.sign(hass, F.path(c, 'clip', e.id)) : Promise.resolve(null);
    Promise.all([snapP, clipP]).then(function (u) {
      var snap = u[0] || e.thumb || '', clip = u[1];
      var dur = e.end ? Math.max(1, Math.round((e.end - e.start) / 1000)) : null;
      var day = dayWord(e.start);
      void day;
      // Kopf: Titel = Objekt, Statuszeile = Zeitpunkt · Dauer bzw. „Live“ · „Treffer 86 %“ (UI.line wandert in den Kopf).
      var line = UI.line(stamp(e.start), [dur ? (dur < 60 ? dur + ' s' : Math.round(dur / 60) + ' Min.') : 'Live',
        e.score != null ? 'Treffer ' + Math.round(e.score * 100) + ' %' : null].filter(Boolean));
      var rows = [];
      if (e.zones.length) rows.push({ icon: 'mdi:vector-square', iconTone: 'accent', label: e.zones.length > 1 ? 'Zonen' : 'Zone', value: e.zones.map(zoneName).join(', ') });
      var nav = [];
      if (at > 0) nav.push({ image: all[at - 1].thumb || '', imageFit: 'cover', label: 'Neuere Erkennung', sub: F.label(all[at - 1].o) + ' · ' + stamp(all[at - 1].start),
        entity: 'frigate-ev:' + cam + '|' + all[at - 1].id + '|' + (back ? 'b' : '') });
      if (at >= 0 && at < all.length - 1) nav.push({ image: all[at + 1].thumb || '', imageFit: 'cover', label: 'Ältere Erkennung', sub: F.label(all[at + 1].o) + ' · ' + stamp(all[at + 1].start),
        entity: 'frigate-ev:' + cam + '|' + all[at + 1].id + '|' + (back ? 'b' : '') });
      // Clip mit dem Schnappschuss als Vorschaubild; ohne Clip (oder wenn er nicht lädt) der Schnappschuss mit
      // Hinweis „Kein Clip vorhanden“ (vorher still nur das Bild). Pfeile über dem Bild blättern (auch Wischen,
      // Pfeiltasten) – am Handy lagen „Neuere/Ältere Erkennung“ unter dem Rand.
      var nb = at > 0 ? all[at - 1] : null, ob = at >= 0 && at < all.length - 1 ? all[at + 1] : null;
      var arrow = function (side, ev2, label) {
        if (!ev2) return '';
        return '<div role="button" tabindex="0" aria-label="' + esc(T(label)) + '" data-casora-mi="frigate-ev:' + esc(cam + '|' + ev2.id + '|' + (back ? 'b' : '')) + '"'
          + ' style="position:absolute;top:50%;' + side + ':12px;width:44px;height:44px;margin-top:-22px;border-radius:50%;display:grid;place-items:center;cursor:pointer;'
          + 'background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, #3A322B);box-shadow:var(--casora-shadow-raised, none);">'
          + '<ha-icon icon="mdi:chevron-' + (side === 'left' ? 'left' : 'right') + '" style="--mdc-icon-size:24px;pointer-events:none;"></ha-icon></div>';
      };
      var noClip = '<div class="frig-noclip" style="position:absolute;left:12px;bottom:12px;padding:6px 12px;border-radius:999px;font-family:var(--primary-font-family, system-ui);'
        + 'font-size:var(--casora-fs-sub, 13px);font-weight:600;background:rgba(0,0,0,0.55);color:rgba(255,255,255,0.92);display:' + (clip ? 'none' : 'block') + ';">' + esc(T('Kein Clip vorhanden')) + '</div>';
      var media = '<div data-frigate-swipe="' + esc(cam) + '" style="position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:#000;">'
        + (clip
          ? '<video controls playsinline preload="metadata" poster="' + esc(snap) + '" style="width:100%;height:100%;object-fit:contain;display:block;background:#000;">'
            + '<source src="' + esc(clip) + '" type="video/mp4" onerror="var v=this.parentNode;v.style.display=\'none\';v.nextElementSibling.style.display=\'block\';var n=v.parentNode.querySelector(\'.frig-noclip\');if(n)n.style.display=\'block\';"></video>'
            + '<img src="' + esc(snap) + '" alt="" style="width:100%;height:100%;object-fit:contain;display:none;">'
          : '<img src="' + esc(snap) + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block;">')
        + noClip + arrow('left', nb, 'Neuere Erkennung') + arrow('right', ob, 'Ältere Erkennung')
        + '</div>';
      nav0 = { cam: cam, newer: nb ? nb.id : null, older: ob ? ob.id : null, back: back ? 'b' : '' };
      var card = K.bare();
      card.styles = { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0 26px 24px 26px' }],
        grid: [{ 'grid-template-areas': '"h" "m" "i"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': 'var(--casora-popup-sec-gap, 22px)' }],
        custom_fields: { h: [{ 'justify-self': 'stretch' }], m: [{ 'justify-self': 'stretch' }], i: [{ 'justify-self': 'stretch' }, { 'text-align': 'left' }, { overflow: 'visible' }] } };
      var info = (rows.length ? UI.group(rows, null) : '') + (nav.length ? (rows.length ? '<div style="height:8px"></div>' : '') + UI.group(nav, null) : '');
      card.custom_fields = { h: line, m: media };
      if (info) card.custom_fields.i = info;
      else card.styles.grid[0] = { 'grid-template-areas': '"h" "m"' };
      lastBack = back || null;
      var cfg = { title: F.label(e.o) + (e.sub ? ' · ' + e.sub : ''), back: back || null, dismiss_on_background: true, content: card, head_switch: false,
        style: '--popup-min-width: min(900px, 92vw); --popup-max-width: min(900px, 92vw);',
        popup_styles: (P.current || {}).popup_styles };
      P.open(cfg);
      navNow = { cfg: P.current || cfg, nav: nav0 };
    });
    return true;
  };
  // Letzter Schnappschuss eines Objekts (Bild-Entität), wenn es keine Ereignisliste gibt.
  F.snapshot = function (imgId, back, title) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass, P = window.casoraPopup, K = window._casoraSoftKit;
    var st = hass && hass.states[imgId];
    if (!st || !P || !K || !st.attributes.entity_picture) return false;
    var card = K.bare();
    card.styles = { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0 26px 24px 26px' }] };
    card.custom_fields = { m: '<div style="width:100%;aspect-ratio:16/9;border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:#000;">'
      + '<img src="' + esc(st.attributes.entity_picture) + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block;"></div>' };
    P.open({ title: title || 'Schnappschuss', back: back || null, dismiss_on_background: true, content: card, head_switch: false,
      style: '--popup-min-width: min(900px, 92vw); --popup-max-width: min(900px, 92vw);', popup_styles: (P.current || {}).popup_styles });
    return true;
  };
  // Zeilen im Popup tragen eine Schein-Entität (data-casora-mi): frigate-ev:<kamera>|<id>, frigate-img:<bild>, frigate-go:<wohin>.
  var backHere = function () {
    var cur = window.casoraPopup && window.casoraPopup.current;
    return cur ? function () { window.casoraPopup.open(cur); } : null;
  };
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var m = /^frigate-(ev|img|go|flt|more):(.*)$/.exec(String(mid || ''));
    if (!m) return false;
    var p = m[2].split('|');
    // Blättern im Detail: dasselbe „zurück“ wie das erste Detail (nicht Detail für Detail zurück).
    if (m[1] === 'ev') return F.detail(p[0], p[1], p[2] === 'b' ? lastBack : (p.length > 2 ? null : backHere()));
    if (m[1] === 'img') return F.snapshot(m[2], backHere());
    if (m[1] === 'flt') {
      flt[p[0]] = flt[p[0]] === p[1] || !p[1] ? null : p[1]; more[p[0]] = false; redraw(p[0]);
      // Am Handy steht die Liste über „Objekte“: nach dem Filtern dorthin, sonst sah man die gefilterte Liste nicht.
      if (window.innerWidth <= 760) setTimeout(function () { var w = (els[p[0]] || []).filter(function (x) { return x.isConnected; })[0]; if (w && w.scrollIntoView) w.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
      return true;
    }
    if (m[1] === 'more') { more[p[0]] = !more[p[0]]; redraw(p[0]); return true; }
    var w = m[2];
    go(/^https?:\/\//.test(w) ? { url: w } : { path: w });
    return true;
  });

  // Kopf-Kachel: Rot, solange etwas erkannt wird (Sicherheit), sonst Sand (Ruhe) – vorher blieb der Kopf rot,
  // weil die Kamera „recording“ meldet.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_frigate\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var s = F.of(src._stateObj, ha && ha.hass);
    if (!s) return null;
    return s.live.length ? { hue: COLOR.alert, off: false } : { off: true };
  });
  // Hauptschalter im Kopf = Objekterkennung (switch.<cam>_detect), in der Bedien-Farbe (nicht Alarm-Rot), mit
  // Beschriftung; Ausschalten fragt nach wie „Aufnahme aus“.
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src, hass) {
    var tpl = [].concat((src && src._config && src._config.template) || []).join(' ');
    if (!/\bcasora_frigate\b/.test(tpl)) return null;
    var id = src._stateObj && src._stateObj.entity_id;
    if (!F.is(hass, id)) return null;
    var d = F.find(hass, id).sw.detect;
    if (!d) return false;
    return { entities: [d], label: 'Objekterkennung', color: 'var(--casora-popup-ui-action, #276B64)',
      toggle: function (on, ids, h) {
        var go = function () { return h.callService('switch', on ? 'turn_off' : 'turn_on', {}, { entity_id: d }); };
        if (!on) { go(); return; }
        var ask = window.casoraAsk ? window.casoraAsk({ title: T('Objekterkennung'), text: T('Objekterkennung ausschalten?'), yes: T('Ausschalten') })
          : Promise.resolve(window.confirm(T('Objekterkennung ausschalten?')));
        ask.then(function (ok) { if (ok) go(); });
      } };
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  F.popup = function (entity, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var id = entity && entity.entity_id;
    if (!id) return empty;
    var c = F.find(hass, id);
    var watch = F.watch(c);
    var call = function (part) {
      return 'return window._casoraFrigate ? window._casoraFrigate.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, this) : "";';
    };
    // Live-Bild wie Casoras Kamera-Vollbild (18-ziele.js openCamera); Antippen öffnet es groß.
    // Ohne Stream (Frigate ohne RTSP-Restream, supported_features ohne STREAM 2): Standbild im Takt statt Schwarz.
    var stream = !!(Number(((states[id] || {}).attributes || {}).supported_features || 0) & 2);
    var live = { type: 'picture-entity', entity: id, camera_view: stream ? 'live' : 'auto', show_name: false, show_state: false, aspect_ratio: '16:9',
      tap_action: { action: 'more-info' }, hold_action: { action: 'none' },
      card_mod: { style: 'ha-card { border-radius: var(--casora-popup-row-radius, 24px) !important; overflow: hidden !important;'
        + ' border: none !important; background: #000 !important; box-shadow: none !important; }' } };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, live: { card: live },
      objs: { card: K.secCard(watch, call('objs'), states) },
      ev: { card: K.secCard(watch, call('ev'), states) }, sys: { card: K.secCard(watch, call('sys'), states) } };
    if (F.sec('ctl', c, states || {}, hass)) f.more = { card: K.secCard(watch, call('ctl'), states) };
    // Live-Bild links über den Objekten, rechts gleich die letzten Erkennungen (mit Filter); die Technik-Schalter
    // stehen unten über beide Spalten unter „Einstellungen“ (Nutzertest: Erkennungen zuerst, Schalter zuletzt).
    return K.layout({ fields: f, top: ['hero'], left: ['live', 'objs'], right: ['ev', 'sys', 'more'],
      narrowOrder: ['live', 'ev', 'objs', 'sys', 'more'] });
  };

  var pill = function (text, mid) {
    return '<div role="button" tabindex="0" data-casora-mi="' + esc(mid) + '" style="box-sizing:border-box;width:100%;margin-top:10px;height:46px;min-height:46px;'
      + 'border-radius:999px;display:flex;align-items:center;justify-content:center;font-family:var(--primary-font-family, system-ui);font-size:14px;font-weight:700;'
      + 'cursor:pointer;background:var(--casora-soft-mehr-fill, var(--casora-soft-control-fill, rgba(140,115,90,0.10)));'
      + 'color:var(--casora-soft-mehr-ink, var(--casora-popup-tiles-text-primary, #3A322B));">'
      + '<span style="pointer-events:none;">' + esc(T(text)) + '</span></div>';
  };
  var swRow = function (S, id, icon, label, ask) {
    if (!id || !S[id] || S[id].state === 'unavailable') return null;
    var isOn = S[id].state === 'on';
    return { icon: icon, iconTone: isOn ? 'accent' : null, label: label, value: isOn ? 'An' : 'Aus',
      svc: { domain: 'switch', service: isOn ? 'turn_off' : 'turn_on', target: { entity_id: id } }, confirm: isOn && ask ? 'Ausschalten' : null };
  };

  F.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var S = states || {}, now = Date.now();
    var s = F.status(c, S, now);
    if (part === 'hero') {
      var main, rest = [], tone = null;
      if (s.dead) main = 'Offline';
      else if (s.off) main = 'Kamera aus';
      else if (s.detectOff) { main = 'Erkennung aus'; tone = 'warn'; }
      else if (s.live.length) { main = who(s.live); tone = 'bad'; }
      else if (s.last) { main = 'Zuletzt: ' + F.label(s.last.o); rest.push(F.ago(s.last.at, now)); }
      else main = 'Keine Erkennung';
      // Nur die Ausnahme: „Aufnahme aus“ (an ist der Normalfall; am Handy brach der Kopf sonst dreizeilig um).
      if (!s.dead && s.rec === false) rest.push('Aufnahme\u00a0aus');
      if (s.server && s.server !== 'running' && !bad(s.server)) rest.push(s.server === 'starting' ? 'Frigate startet' : 'Frigate meldet Fehler');
      return UI.line(main, rest, { tone: tone });
    }
    if (part === 'ctl') {
      // Objekterkennung steht als Hauptschalter im Kopf; hier, was Frigate je Kamera sonst schaltet.
      var rows = [
        swRow(S, c.sw.recordings, 'mdi:record-rec', 'Aufnahme', true),
        swRow(S, c.sw.snapshots, 'mdi:image-multiple-outline', 'Schnappschüsse', false),
        Object.assign(swRow(S, c.sw.motion, 'mdi:motion-sensor', 'Bewegungserkennung', true) || {}, c.sw.motion && S[c.sw.motion] && S[c.sw.motion].state !== 'unavailable' ? { sub: 'Löst die Objekterkennung aus' } : {}),
        swRow(S, c.sw.audio, 'mdi:ear-hearing', 'Geräuscherkennung', false),
        swRow(S, c.sw.ptz, 'mdi:target-account', 'Automatisch folgen', false),
      ].filter(function (r) { return r && r.label; });
      if (!rows.length) return '';
      // Zugeklappt wie in der Klingel; aufgeklappt bleibt „Einstellungen“ stehen (nur der Pfeil dreht).
      return UI.more ? UI.more('frigate', '<div>' + UI.group(rows, 'Aufnahme & Erkennung') + '</div>', { label: 'Einstellungen', less: 'Einstellungen' })
        : UI.group(rows, 'Aufnahme & Erkennung');
    }
    if (part === 'objs') {
      if (!c.order.length) return '';
      var ev = (evc[c.cam] && evc[c.cam].list) || null, start = new Date(now); start.setHours(0, 0, 0, 0);
      var orows = c.order.map(function (o) {
        var x = s.objs[o] || {}, today = ev ? ev.filter(function (e) { return e.o === o && e.start >= start.getTime(); }).length : null;
        var sub = x.live ? (x.n > 1 ? x.n + ' im Bild' : 'Gerade im Bild') : x.at ? 'Zuletzt ' + F.ago(x.at, now) : 'Noch nicht erkannt';
        var img = c.objs[o].img;
        // Antippen filtert „Letzte Erkennungen“ auf dieses Objekt (noch einmal: alle); ohne Liste der letzte Schnappschuss.
        var tap = ev && ev.length ? 'frigate-flt:' + c.cam + '|' + o : (img && S[img] && S[img].attributes.entity_picture && x.at ? 'frigate-img:' + img : null);
        return { icon: F.icon(o), iconTone: x.live ? 'bad' : x.at ? 'accent' : null, label: F.label(o), sub: sub,
          selected: flt[c.cam] === o, value: today ? today + '× heute' : null, entity: tap };
      });
      return UI.group(orows, 'Objekte');
    }
    if (part === 'ev') {
      if (el) { els[c.cam] = (els[c.cam] || []).filter(function (w) { return w.isConnected; }); if (els[c.cam].indexOf(el) < 0) els[c.cam].push(el); }
      var all0 = F.events(hass, c, el);
      var list = all0 ? shown(c.cam) : null;
      var job = evc[c.cam] || {};
      var head = 'Letzte Erkennungen';
      // Filter als Chips über der Liste (vorher nur über die Objekt-Zeilen – im Nutzertest nicht gefunden).
      var chips = '';
      var kinds = [];
      (all0 || []).forEach(function (e) { if (kinds.indexOf(e.o) < 0) kinds.push(e.o); });
      if (kinds.length > 1) {
        var chip = function (o, label) {
          var onc = (flt[c.cam] || '') === o;
          return '<div role="button" tabindex="0" aria-pressed="' + (onc ? 'true' : 'false') + '" data-casora-mi="' + esc('frigate-flt:' + c.cam + '|' + o) + '"'
            + ' style="flex:none;position:relative;min-height:36px;padding:0 14px;border-radius:999px;display:inline-flex;align-items:center;cursor:pointer;'
            + 'font-size:var(--casora-fs-sub, 13px);font-weight:700;white-space:nowrap;'
            + (onc ? 'background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, #3A322B);box-shadow:var(--casora-soft-seg-on-shadow, none);'
              : 'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));color:var(--casora-popup-tiles-text-primary, #3A322B);') + '">'
            + '<span style="pointer-events:none;">' + esc(T(label)) + '</span></div>';
        };
        chips = '<div style="display:flex;gap:var(--casora-space-2, 8px);overflow-x:auto;scrollbar-width:none;margin:0 0 var(--casora-space-3, 12px);padding:2px 2px 4px;'
          + 'font-family:var(--primary-font-family, system-ui);">' + chip('', 'Alle') + kinds.map(function (o) { return chip(o, F.label(o)); }).join('') + '</div>';
      }
      var out, top = (UI.label ? UI.label(head) : '') + chips;
      if (!list) out = top + UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], null);
      else if (!list.length) {
        out = top + UI.group([{ icon: job.err ? 'mdi:alert-circle-outline' : 'mdi:check', iconTone: job.err ? 'warn' : null,
          label: job.err ? 'Frigate antwortet nicht' : flt[c.cam] ? 'Keine ' + F.label(flt[c.cam]) + ' in den letzten 7 Tagen' : 'Keine Erkennungen in den letzten 7 Tagen',
          sub: job.err ? 'Liste über die Frigate-Integration nicht abrufbar' : null }], null);
      } else {
        var max = more[c.cam] ? 30 : 8;
        var erows = list.slice(0, max).map(function (e) {
          var dw = dayWord(e.start, now);
          // Treffer-Prozent nur im Detail – am Handy verdrängte es die Zone.
          var sub = dw ? [dw, clock(e.start)] : [clock(e.start), F.ago(e.start, now)];
          if (e.zones.length) sub.push(e.zones.map(zoneName).join(', '));
          return { image: e.thumb || '', imageFit: 'cover', iconTone: null, label: F.label(e.o) + (e.sub ? ' · ' + e.sub : ''),
            // Rechts nur „Live“ (Schrift-Rot, 4,9 : 1) – die Zeit steht schon in der Unterzeile (Handy schnitt sonst die Zone ab).
            sub: sub.join(' · '), value: e.end == null ? 'Live' : null, valueTone: e.end == null ? 'var(--casora-color-red-text, var(--casora-color-red))' : null,
            entity: 'frigate-ev:' + c.cam + '|' + e.id };
        });
        out = top + UI.group(erows, null);
        // „Mehr anzeigen“ / „Alle Objekte zeigen“ als Pille unter der Liste wie „Ganzer Verlauf“ im Mähroboter-Popup.
        if (list.length > 8) out += pill(more[c.cam] ? 'Weniger anzeigen' : 'Mehr anzeigen', 'frigate-more:' + c.cam);
      }
      // Wege: Aufnahmen in HAs Medien (Frigate-Medienquelle) und die Frigate-Oberfläche.
      var links = [], ui = F.ui(hass, c), media = F.media(hass);
      if (media) links.push({ icon: 'mdi:filmstrip-box-multiple', iconTone: 'accent', label: 'Aufnahmen', sub: 'In den Medien von Home Assistant', entity: 'frigate-go:' + media });
      if (ui) links.push({ icon: 'mdi:open-in-new', iconTone: 'accent', label: 'In Frigate öffnen', entity: 'frigate-go:' + (ui.url || ui.path) });
      return out + (links.length ? '<div style="height:8px"></div>' + UI.group(links, null) : '');
    }
    if (part === 'sys') {
      if (!c.server || !S[c.server]) return '';
      var v = String(S[c.server].state || '');
      // Läuft Frigate, steht hier nichts (der Kopf meldet Störungen ohnehin); nur bei Problemen ein Abschnitt.
      if (v === 'running') return '';
      var word = { running: 'Läuft', starting: 'Startet', error: 'Fehler' }[v] || (bad(v) ? 'Nicht erreichbar' : v);
      var tn = v === 'running' ? null : v === 'starting' ? 'warn' : 'bad';
      return UI.group([{ icon: 'mdi:server', iconTone: tn || 'accent', label: 'Frigate', value: word, valueTone: tn, entity: c.server }], 'System');
    }
    return '';
  };

  // Letzte Erkennung groß (Halten-Menü): das Ereignis aus der Frigate-Liste mit Clip und Blättern; ohne Liste der
  // Schnappschuss der Bild-Entität mit lesbarem Titel („Auto · 23:30“ statt des Entitätsnamens).
  F.latest = function (hass, c, o, img, at) {
    var fall = function () { F.snapshot(img, null, F.label(o) + ' · ' + stamp(at)); };
    var have = evc[c.cam] && evc[c.cam].list && evc[c.cam].list.length ? evc[c.cam].list : null;
    var pick = function (l) { return (l || []).filter(function (e) { return e.o === o; })[0] || (l || [])[0]; };
    if (have) { if (!F.detail(c.cam, pick(have), null)) fall(); return; }
    if (!hass || !hass.callWS) { fall(); return; }
    hass.callWS({ type: 'frigate/events/get', instance_id: c.inst, cameras: [c.name], limit: 40, after: Math.floor(Date.now() / 1000) - 7 * 86400 })
      .then(function (raw) {
        var l = F.parse(raw);
        evc[c.cam] = { key: '', at: 0, list: l, err: false, busy: false, wait: [] };
        var e = pick(l);
        if (!e) return fall();
        F.sign(hass, F.path(c, 'thumb', e.id)).then(function (u) { e.thumb = u; if (!F.detail(c.cam, e, null)) fall(); });
      }).catch(fall);
  };

  // ── Halten-Menü (22-halten.js): Erkennung/Aufnahme schalten, letzte Erkennung, Frigate ───────
  // Ausschalten fragt nach (die Kamera erkennt bzw. nimmt dann nichts mehr auf), Einschalten nicht.
  F.hold = function (hass, id) {
    if (!F.is(hass, id)) return [];
    var S = hass.states || {}, c = F.find(hass, id), s = F.status(c, S), out = [];
    var tog = function (sw, onT, offT, icon, ask) {
      var v = swState(S, sw);
      if (v == null) return;
      out.push({ key: 'act', t: v ? offT : onT, ic: icon, svc: v ? 'switch.turn_off' : 'switch.turn_on', entity: sw,
        ask: v ? ask : null, yes: 'Ausschalten' });
    };
    // Befehle statt Zustandswörter („Erkennung aus“ las sich wie der Zustand).
    tog(c.sw.detect, 'Erkennung einschalten', 'Erkennung ausschalten', 'mdi:eye-outline', 'Erkennung ausschalten?');
    tog(c.sw.recordings, 'Aufnahme einschalten', 'Aufnahme ausschalten', 'mdi:record-rec', 'Aufnahme ausschalten?');
    if (s.last && c.objs[s.last.o] && c.objs[s.last.o].img && S[c.objs[s.last.o].img]) {
      var img = c.objs[s.last.o].img;
      var lo = s.last.o, lat = s.last.at;
      out.push({ key: 'fn', t: 'Letzte Erkennung', ic: 'mdi:image-outline', fn: function () { F.latest(hass, c, lo, img, lat); } });
    }
    var ui = F.ui(hass, c);
    if (ui) out.push({ key: 'fn', t: 'In Frigate öffnen', ic: 'mdi:open-in-new', fn: function () { go(ui); } });
    return out;
  };
})();
