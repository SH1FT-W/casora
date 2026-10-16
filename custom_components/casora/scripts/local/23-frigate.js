// ── Frigate: Kamera-Kachel + Popup (Community-Karte, aus Kartenwunsch #22) ──────
// Für Kameras der Frigate-Integration (camera.<cam> mit Attributen camera_name/client_id). Die Kachel ist
// die Casora-Kamera-Kachel (Standbild, Offline, Alter) und sagt dazu, was Frigate zuletzt erkannt hat
// („Person erkannt“, „2 neue Alarme“, „Person · vor 3 Min.“), auf Wunsch mit Live-Bild. Das Popup zeigt das
// Live-Bild, die Reviews (Alarme/Erkennungen, Frigate ≥ 0.14; sonst die Ereignisliste) mit Filtern, die
// Aufnahmen der letzten Tage mit Wiedergabe und Zeitleiste, Erkennungen je Objekt und die Schalter.
// Alles läuft über die Frigate-Integration (WebSocket frigate/…, Proxy /api/frigate/<instanz>/…, Adressen
// signiert) und HAs eigene Player (ha-hls-player, ha-camera-stream) – keine Fremdbibliothek.
// Die Integration setzt keine translation_key: Entitäten am Gerät der Kamera werden über Domain,
// Einheit „objects“, device_class und das Ende der Entity-ID gefunden (Rückfall: Name ohne Gerätenamen,
// Symbol der Integration) – die IDs bildet Frigate aus englischen Namen, unabhängig von der HA-Sprache.
//   window._casoraFrigate.is(hass, id)                    → Frigate-Kamera?
//   window._casoraFrigate.find(hass, id)                  → {cam, name, inst, objs{o:{occ,count,active,img}}, all, motion, sw{}, review, server}
//   window._casoraFrigate.status(c, states, now)          → {dead, detectOff, live[], last{o, at}, rec, unseen, …}
//   window._casoraFrigate.tileText(s, now)                → Text der Kachel oder null (dann wie die Kamera-Kachel)
//   window._casoraFrigate.tileWatch(host, entity, hass, variables) – Kachel: Live-Bild, Abo, Reviews (sichtbar)
//   window._casoraFrigate.popup(entity, states, hass)     – Popup casora_popup_frigate
//   window._casoraFrigate.sec(part, c, states, hass, el)  – Live-Bereiche (hero, ctl, objs, ev, rec, sys)
//   window._casoraFrigate.events/reviews/favs/recSummary(hass, c, el) – Listen (Cache, signierte Bildadressen)
//   window._casoraFrigate.detail(cam, id, back) · recView(cam, day, hour, back) – Detail, Aufnahmen
//   window._casoraFrigate.hold(hass, id)                  – Einträge fürs Halten-Menü (22-halten.js)
(function () {
  if (window._casoraFrigate) return;
  var F = window._casoraFrigate = {};

  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var slug = function (t) { return String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); };
  var T = function (x) { return window.casoraT ? window.casoraT(x) : x; };
  // Übersetzen für eigene Elemente (Schatten-DOM: dort übersetzt die Laufzeit nicht von selbst).
  var tr = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  // Die Integration antwortet mit Frigates JSON-Text (decode_json=False).
  var jparse = function (raw) {
    if (typeof raw !== 'string') return raw;
    try { return JSON.parse(raw); } catch (e) { return null; }
  };
  var uniq = function (x, i, a) { return x && a.indexOf(x) === i; };
  var haptic = function (k) { try { if (window.casoraHaptic) window.casoraHaptic(k || 'light'); } catch (e) { /* egal */ } };
  var COLOR = { alert: 'var(--casora-color-red, #D35A4E)' };
  F.COLOR = COLOR;
  var RED_TEXT = 'var(--casora-color-red-text, var(--casora-color-red))';

  // Objekte, die Frigate erkennt (Labelmap von Frigate+ und COCO), deutsch; Unbekanntes lesbar gemacht.
  var LABEL = {
    person: 'Person', car: 'Auto', cat: 'Katze', dog: 'Hund', bird: 'Vogel', bicycle: 'Fahrrad', motorcycle: 'Motorrad',
    bus: 'Bus', truck: 'Lkw', boat: 'Boot', horse: 'Pferd', cow: 'Kuh', sheep: 'Schaf', bear: 'Bär', deer: 'Reh',
    fox: 'Fuchs', rabbit: 'Kaninchen', raccoon: 'Waschbär', squirrel: 'Eichhörnchen', package: 'Paket', face: 'Gesicht',
    license_plate: 'Kennzeichen', waste_bin: 'Mülltonne', umbrella: 'Schirm', robot_lawnmower: 'Mähroboter',
    amazon: 'Amazon', dhl: 'DHL', ups: 'UPS', fedex: 'FedEx', usps: 'USPS', dpd: 'DPD', gls: 'GLS', motion: 'Bewegung',
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
  // Mehrere Objekte in einem Review: „Person, Auto“ (sprachneutral, die Labels sind schon übersetzt).
  var objLabel = function (it) {
    var l = (it.objs && it.objs.length ? it.objs : [it.o]).filter(uniq);
    return l.slice(0, 2).map(F.label).join(', ') + (l.length > 2 ? ' +' + (l.length - 2) : '');
  };

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
  var cache = {}, info = {};
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
    info[id] = { name: c.name, inst: c.inst };
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
      motion: on(S, c.motion), server: c.server && S[c.server] ? String(S[c.server].state || '') : null,
      unseen: F.unseen(c.cam, t) };
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
    var pre = short ? '' : 'vor ';
    if (m < 1) return short ? 'jetzt' : 'gerade eben';
    if (m < 60) return pre + m + ' Min.';
    var d = window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.floor(m / 1440);
    if (m < 1440 || d < 1) return pre + Math.round(m / 60) + ' Std.';
    return d === 1 ? (short ? 'Gestern' : 'gestern') : pre + d + ' Tagen';
  };
  var who = function (list) {
    if (list.length === 1) return F.label(list[0]) + ' erkannt';
    if (list.length === 2) return F.label(list[0]) + ' und ' + F.label(list[1]) + ' erkannt';
    return list.length + ' Objekte erkannt';
  };
  var newAlerts = function (n) { return n === 1 ? '1 neuer Alarm' : n + ' neue Alarme'; };
  F.newAlerts = newAlerts;
  // Kachel: Erkennung aus · jetzt erkannt · ungesehene Alarme · letzte Erkennung (bis 24 Std.) – sonst null (Kamera-Text).
  // Trenner „ · “ wie in der Liste; schmal (Handy) mit Uhrzeit „Person 14:23“ ohne Trenner – casoraStateFit kürzte an
  // „ · “ zu „Person +1“ – und keine Dauer-Verwechslung wie bei „Auto, 1 Min.“ (Nutzerprüfung Runde 2).
  F.tileText = function (s, now, short) {
    if (!s || s.dead || s.off) return null;
    if (s.detectOff) return short ? 'Erkennung aus' : 'Objekterkennung aus';
    if (s.live.length) return short && s.live.length > 1 ? s.live.length + ' Objekte erkannt' : who(s.live);
    // Schmale Handy-Kachel: „2 Alarme“ (sonst „1 neuer Al…“).
    if (s.unseen) return short ? (s.unseen === 1 ? '1 Alarm' : s.unseen + ' Alarme') : newAlerts(s.unseen);
    if (s.last && (now || Date.now()) - s.last.at < 86400000) return F.label(s.last.o) + (short ? ' ' + clock(s.last.at) : ' · ' + F.ago(s.last.at, now));
    return null;
  };
  F.of = function (entity, hass, states) {
    var id = entity && entity.entity_id;
    if (!F.is(hass, id)) return null;
    return F.status(F.find(hass, id), states || (hass && hass.states) || {});
  };

  // ── Adressen (signiert) ───────────────────────────────────────────────────
  // Frigates Bilder und Videos liegen hinter HAs Anmeldung (/api/frigate/<instanz>/…); ein <img>/<video> schickt kein
  // Token – darum signiert (auth/sign_path), wie HAs eigene Medien. Bilder für 10 Min. (neu nach 8), Videos (ttl 3600)
  // für 1 Std. (neu nach 48 Min.). Fehlschläge (null) werden nicht gemerkt; der Speicher bleibt klein (≤ 300 Adressen).
  var signed = {};
  var SIGN_MAX = 300;
  F.sign = function (hass, path, ttl, force) {
    var life = ttl || 600, x = signed[path];
    if (!force && x && Date.now() - x.at < life * 800) return x.p;
    if (!hass || !hass.callWS) return Promise.resolve(null);
    var keys = Object.keys(signed);
    if (keys.length >= SIGN_MAX) {
      var t0 = Date.now();
      keys.forEach(function (k) { if (t0 - signed[k].at > signed[k].life * 800) delete signed[k]; });
      keys = Object.keys(signed);
      // Immer noch voll: die ältesten weg.
      if (keys.length >= SIGN_MAX) keys.sort(function (a, b) { return signed[a].at - signed[b].at; }).slice(0, keys.length - SIGN_MAX + 1).forEach(function (k) { delete signed[k]; });
    }
    var job = { at: Date.now(), life: life, p: null };
    job.p = hass.callWS({ type: 'auth/sign_path', path: path, expires: life })
      .then(function (r) { return r && r.path ? r.path : null; }).catch(function () { return null; })
      .then(function (u) { if (!u && signed[path] === job) delete signed[path]; return u; });
    signed[path] = job;
    return job.p;
  };
  // Alter der gemerkten Signatur in ms (null = keine) – für „einmal neu signieren“ vor einem Rückfall.
  F.signAge = function (path) { var x = signed[path]; return x ? Date.now() - x.at : null; };
  F._signedN = function () { return Object.keys(signed).length; };
  var VOD_TTL = 3600;
  var sec0 = function (ms) { return Math.floor(ms / 1000); };
  // vod/rec: F.path(c, 'vod', start, end) in Sekunden.
  F.path = function (c, kind, id, a) {
    var base = '/api/frigate/' + encodeURIComponent(c.inst), cam = encodeURIComponent(c.name);
    if (kind === 'thumb') return base + '/thumbnail/' + encodeURIComponent(id);
    if (kind === 'snap') return base + '/snapshot/' + encodeURIComponent(id);
    if (kind === 'rthumb') return base + '/notifications/' + encodeURIComponent(id) + '/' + cam + '/review_thumbnail.webp';
    if (kind === 'nhls') return base + '/notifications/' + encodeURIComponent(id) + '/master.m3u8';
    if (kind === 'vodev') return base + '/vod/event/' + encodeURIComponent(id) + '/master.m3u8';
    if (kind === 'vod') return base + '/vod/' + cam + '/start/' + id + '/end/' + a + '/master.m3u8';
    if (kind === 'rec') return base + '/recording/' + cam + '/start/' + id + '/end/' + a;
    return base + '/notifications/' + encodeURIComponent(id) + '/clip.mp4';
  };
  // Absolute Adresse: HAs HLS-Player löst die Unter-Wiedergabeliste mit new URL(…, url) auf.
  var abs = function (hass, p) {
    if (!p) return p;
    try { if (/^https?:\/\//.test(p)) return p; if (hass && hass.hassUrl) return hass.hassUrl(p); } catch (e) { /* weiter */ }
    try { return new URL(p, window.location.href).href; } catch (e) { return p; }
  };
  F.abs = abs;
  // HLS: HA signiert pfadgenau, Frigates master.m3u8 verweist aber auf eine Unter-Liste (index-v1.m3u8) – deren
  // Abruf bekäme die Signatur des Masters nicht (401, VodProxyView verlangt Anmeldung). Darum wie Sightline: den Master
  // selbst laden, die Zeile nach #EXT-X-STREAM-INF auflösen, genau deren Pfad signieren und diese Adresse an den Player
  // geben; Frigates nginx hängt die Signatur an die Segmente, VodSegmentProxyView prüft das Verzeichnis.
  // Antwortet der Master mit 401/403, einmal neu signieren. Ergebnis: absolute Adresse oder Fehler.
  F.childList = function (text) {
    var lines = String(text || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;
      for (var j = i + 1; j < lines.length; j++) if (lines[j].charAt(0) !== '#') return lines[j];
    }
    return null;
  };
  F.hlsUrl = function (hass, path, force0) {
    var get = function (force) {
      return F.sign(hass, path, VOD_TTL, force).then(function (u) {
        if (!u) throw new Error('nicht signiert');
        var url = abs(hass, u);
        if (typeof fetch !== 'function') return { url: url, res: null };
        return fetch(url, { credentials: 'same-origin', cache: 'no-store' }).then(function (res) { return { url: url, res: res }; });
      });
    };
    return get(!!force0).then(function (x) {
      if (!force0 && x.res && (x.res.status === 401 || x.res.status === 403)) { force0 = true; return get(true); }
      return x;
    }).then(function (x) {
      if (!x.res) return x.url;
      if (!x.res.ok) throw new Error('HLS ' + x.res.status);
      return x.res.text().then(function (text) {
        var line = F.childList(text);
        if (!line) return x.url;
        var child = new URL(line, x.url);
        return F.sign(hass, child.pathname, VOD_TTL, !!force0).then(function (cu) {
          if (!cu) throw new Error('Unter-Liste nicht signiert');
          return abs(hass, cu);
        });
      });
    });
  };
  // Lesbarer Dateiname: „Hofkamera 2026-10-15 16-22.mp4“ (Ortszeit, ohne Zeichen, die Dateisysteme nicht mögen).
  F.fileName = function (cam, ms, ext) {
    var d = new Date(ms || Date.now()), z = function (n) { return String(n).padStart(2, '0'); };
    var nm = String(cam || 'Frigate').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Frigate';
    return nm + ' ' + d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + '-' + z(d.getMinutes()) + '.' + (ext || 'mp4');
  };
  // Datei holen (signiert, ?download=true): als Blob, damit der Dateiname gilt (Frigates Content-Disposition nennt nur
  // die ID); ohne fetch/Blob über einen Link wie bisher.
  F.fetchBlob = function (hass, path) {
    var p = path + (path.indexOf('?') < 0 ? '?' : '&') + 'download=true';
    var go = function (force) {
      return F.sign(hass, p, VOD_TTL, force).then(function (u) {
        if (!u) throw new Error('nicht signiert');
        return fetch(abs(hass, u), { credentials: 'same-origin' });
      });
    };
    return go(false).then(function (res) { return res.status === 401 || res.status === 403 ? go(true) : res; }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    });
  };
  F.saveBlob = function (blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name || ''; a.rel = 'noopener'; a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    setTimeout(function () { try { a.remove(); URL.revokeObjectURL(url); } catch (e) { /* weg */ } }, 4000);
    return true;
  };
  F.download = function (hass, path, name) {
    if (typeof fetch === 'function' && typeof URL !== 'undefined' && URL.createObjectURL) {
      return F.fetchBlob(hass, path).then(function (b) { return F.saveBlob(b, name); }).catch(function () { return false; });
    }
    var p = path + (path.indexOf('?') < 0 ? '?' : '&') + 'download=true';
    return F.sign(hass, p).then(function (u) {
      if (!u) return false;
      var a = document.createElement('a');
      a.href = abs(hass, u); a.download = name || ''; a.rel = 'noopener'; a.style.display = 'none';
      (document.body || document.documentElement).appendChild(a);
      a.click();
      setTimeout(function () { try { a.remove(); } catch (e) { /* weg */ } }, 1000);
      return true;
    });
  };
  // Teilen (Handy): nur, wenn der Browser Dateien teilen kann.
  F.canShare = function () {
    try {
      return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
        && typeof File === 'function' && navigator.canShare({ files: [new File([''], 'x.mp4', { type: 'video/mp4' })] });
    } catch (e) { return false; }
  };

  // ── Listen der Integration ────────────────────────────────────────────────
  var face = function (x) { return Array.isArray(x) ? (x[0] != null ? String(x[0]) : null) : (x ? String(x) : null); };
  // Ereignisse (JSON-Text von Frigates /api/events) → [{id, o, start, end, score, zones, clip, snap, sub, fav}].
  F.parse = function (raw) {
    var list = jparse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(function (e) { return e && e.id && e.label; }).map(function (e) {
      var d = e.data || {};
      return { id: String(e.id), o: String(e.label), sub: face(e.sub_label), start: num(e.start_time) * 1000,
        end: e.end_time != null ? num(e.end_time) * 1000 : null, score: num(d.top_score != null ? d.top_score : (e.top_score != null ? e.top_score : d.score)),
        zones: Array.isArray(e.zones) ? e.zones : [], clip: !!e.has_clip, snap: !!e.has_snapshot, fav: !!e.retain_indefinitely };
    }).filter(function (e) { return isFinite(e.start); }).sort(function (x, y) { return y.start - x.start; });
  };
  // Reviews (Frigate ≥ 0.14, /api/review) → [{id, kind 'review', sev, seen, o, objs, subs, zones, dets, start, end}].
  // Ohne „severity“ ist es keine Review-Antwort (ältere Version) → null, damit die Ereignisliste übernimmt.
  F.parseReviews = function (raw) {
    var list = jparse(raw);
    if (!Array.isArray(list)) return null;
    var ok = list.filter(function (r) { return r && r.id && r.severity && isFinite(num(r.start_time)); });
    if (list.length && !ok.length) return null;
    return ok.map(function (r) {
      var d = r.data || {};
      var objs = (d.objects || []).map(function (o) { return String(o).replace(/-verified$/, ''); }).filter(uniq);
      var audio = (d.audio || []).map(String);
      var subs = (d.sub_labels || []).map(face).filter(uniq);
      var o = objs.indexOf('person') >= 0 ? 'person' : objs[0] || audio[0] || 'motion';
      return { kind: 'review', id: String(r.id), o: o, objs: objs.length ? objs : [o], sub: subs[0] || null, subs: subs,
        start: num(r.start_time) * 1000, end: r.end_time != null ? num(r.end_time) * 1000 : null,
        zones: Array.isArray(d.zones) ? d.zones : [], sev: r.severity === 'alert' ? 'alert' : 'detection',
        seen: !!r.has_been_reviewed, dets: (d.detections || []).map(String), clip: true, snap: true };
    }).sort(function (x, y) { return y.start - x.start; });
  };
  // Aufnahmen-Übersicht (/api/<kamera>/recordings/summary) → [{day 'YYYY-MM-DD', n, hours:[{h, dur, n}]}], neueste zuerst.
  F.parseSummary = function (raw) {
    var list = jparse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter(function (d) { return d && /^\d{4}-\d{2}-\d{2}$/.test(String(d.day || '')); }).map(function (d) {
      // Nur Stunden mit Aufnahme im Hauptstream (sub_only: nur der Unterstream – die Wiedergabe hätte nichts).
      // Doppelte Stunde (Zeitumstellung im Herbst): zusammengelegt, die Wiedergabe deckt dann beide ab (F.hourSpan).
      var by = {};
      (d.hours || []).forEach(function (h) {
        var x = { h: parseInt(h.hour, 10), dur: num(h.duration) || 0, n: num(h.events) || 0 };
        if (h.sub_only || !(x.h >= 0 && x.h < 24) || x.dur <= 0) return;
        if (by[x.h]) { by[x.h].dur += x.dur; by[x.h].n += x.n; } else by[x.h] = x;
      });
      var hours = Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return x.h - y.h; });
      return { day: String(d.day), n: num(d.events) || hours.reduce(function (s, h) { return s + h.n; }, 0), hours: hours };
    }).filter(function (d) { return d.hours.length; }).sort(function (x, y) { return x.day < y.day ? 1 : -1; });
  };
  // Segmente (/api/<kamera>/recordings) → [{s, e}] in Sekunden, aufsteigend.
  F.parseSegments = function (raw) {
    var list = jparse(raw);
    if (!Array.isArray(list)) return [];
    return list.map(function (r) { return { s: num(r && r.start_time), e: num(r && r.end_time) }; })
      .filter(function (r) { return r.s != null && r.e != null && r.e > r.s; }).sort(function (x, y) { return x.s - y.s; });
  };

  // ── Zeitleiste (rein rechnerisch, ohne DOM) ───────────────────────────────
  // Lückenlose Bereiche aus den Segmenten (Lücken unter gap s zählen als durchgehend).
  F.recRanges = function (segs, gap) {
    var out = [], g = gap == null ? 2 : gap;
    (segs || []).forEach(function (r) {
      var l = out[out.length - 1];
      if (l && r.s - l.e <= g) l.e = Math.max(l.e, r.e); else out.push({ s: r.s, e: r.e });
    });
    return out;
  };
  // Frigates Wiedergabe (VOD) reiht nur aufgenommene Segmente aneinander: Wandzeit t → Stelle im Video.
  // In einer Lücke springt es an den Anfang des nächsten Segments ({off, t} = tatsächliche Zeit).
  F.recOffset = function (segs, t) {
    var off = 0;
    for (var i = 0; i < (segs || []).length; i++) {
      var r = segs[i];
      if (t < r.s) return { off: off, t: r.s };
      if (t <= r.e) return { off: off + (t - r.s), t: t };
      off += r.e - r.s;
    }
    var last = segs && segs[segs.length - 1];
    return last ? { off: off, t: last.e } : null;
  };
  // Umgekehrt: Stelle im Video → Wandzeit.
  F.recAt = function (segs, off) {
    var left = Math.max(0, off || 0);
    for (var i = 0; i < (segs || []).length; i++) {
      var d = segs[i].e - segs[i].s;
      if (left <= d) return segs[i].s + left;
      left -= d;
    }
    var last = segs && segs[segs.length - 1];
    return last ? last.e : null;
  };
  F.recDur = function (segs) { return (segs || []).reduce(function (s, r) { return s + (r.e - r.s); }, 0); };
  // Anteil 0…1 einer Zeit auf der Leiste [a, b]; und zurück (Antippen/Ziehen).
  F.tlFrac = function (t, a, b) { return b > a ? Math.max(0, Math.min(1, (t - a) / (b - a))) : 0; };
  F.tlTime = function (f, a, b) { return a + Math.max(0, Math.min(1, f)) * (b - a); };
  // Tastatur auf der Zeitleiste: ←/→ 10 s, mit Umschalt 1 Min., Bild ↑/↓ 5 Min., Pos1/Ende.
  F.tlKey = function (key, shift, t, a, b) {
    var d = { ArrowLeft: -10, ArrowRight: 10, ArrowDown: -10, ArrowUp: 10, PageDown: -300, PageUp: 300 }[key];
    if (key === 'Home') return a;
    if (key === 'End') return b;
    if (d == null) return null;
    return Math.max(a, Math.min(b, t + d * (shift && Math.abs(d) === 10 ? 6 : 1)));
  };

  // ── Laden mit Cache (je Kamera) ───────────────────────────────────────────
  // Ohne Abo: einmal je neuem Schnappschuss/Review-Status bzw. höchstens alle 30 s neu fragen. Mit Abo
  // (frigate/reviews/subscribe) nur, wenn Frigate etwas meldet (spätestens nach 5 Min.) – Bewegung und Belegung zählen
  // nicht (sie wechseln ständig). Dazwischen höchstens alle 5 s; „new“/„end“ aus dem Abo sofort. Danach die offenen
  // Bereiche neu zeichnen (wie Personen-/Mäher-Popup).
  var kick = function (w) {
    try {
      if (typeof window.casoraKick === 'function') window.casoraKick(w);
      else if (w && typeof w.requestUpdate === 'function') w.requestUpdate('_config', undefined);
    } catch (e) { /* Popup schon zu */ }
  };
  var evc = {}, rvc = {}, fvc = {}, recc = {};
  var keyOf = function (hass, c) {
    if (subOn(c.inst)) return 'abo';
    var S = (hass && hass.states) || {};
    return F.watch(c).filter(function (x) { return /^image\./.test(x) || x === c.review; })
      .map(function (x) { return S[x] ? S[x].last_changed : ''; }).join('|');
  };
  F.keyOf = keyOf;
  var MIN_GAP = 5000;
  var load = function (store, cam, key, el, maxAge, run, failList) {
    var hit = store[cam];
    var fresh = hit && !hit.stale && hit.key === key && Date.now() - hit.at < maxAge;
    // Hängt eine Anfrage (keine Antwort), nach 15 s neu fragen – sonst bliebe „Wird geladen …“ für immer.
    var busy = hit && hit.busy && Date.now() - hit.at < 15000;
    if (fresh || busy) { if (el && busy && hit.wait.indexOf(el) < 0) hit.wait.push(el); return hit.list; }
    // Gerade erst gefragt: später nachholen statt sofort (außer „new“/„end“ aus dem Abo).
    if (hit && !hit.force && hit.list != null && Date.now() - hit.at < MIN_GAP) {
      hit.later = hit.later || [];
      if (el && hit.later.indexOf(el) < 0) hit.later.push(el);
      if (!hit.laterT) {
        hit.laterT = setTimeout(function () { hit.laterT = null; var w = hit.later; hit.later = []; w.forEach(kick); }, MIN_GAP - (Date.now() - hit.at) + 50);
      }
      return hit.list;
    }
    var job = store[cam] = { key: key, at: Date.now(), list: hit ? hit.list : null, err: hit ? hit.err : false, busy: true, wait: el ? [el] : [], later: [] };
    if (hit && hit.laterT) { clearTimeout(hit.laterT); hit.laterT = null; }
    var pr;
    try { pr = Promise.resolve(run()); } catch (e) { pr = Promise.reject(e); }
    pr.then(function (list) { job.list = list; job.err = false; })
      .catch(function (e) { job.list = job.list != null ? job.list : failList; job.err = e || true; })
      .then(function () {
        job.busy = false;
        job.wait.forEach(kick);
        job.wait = [];
      });
    return job.list;
  };
  F._calls = function (cam) { return { ev: evc[cam] && evc[cam].at, rv: rvc[cam] && rvc[cam].at }; };
  var age = function (inst) { return subOn(inst) ? 300000 : 30000; };
  var thumbs = function (hass, c, list) {
    return Promise.all(list.slice(0, 30).map(function (e) {
      if (e.thumb) return null;
      return F.sign(hass, F.path(c, 'thumb', e.id)).then(function (u) { e.thumb = u; });
    })).then(function () { return list; });
  };
  F.events = function (hass, c, el) {
    if (!hass || !hass.callWS) { evc[c.cam] = { key: '', at: Date.now(), list: (evc[c.cam] && evc[c.cam].list) || [], busy: false, wait: [] }; return evc[c.cam].list; }
    return load(evc, c.cam, keyOf(hass, c), el, age(c.inst), function () {
      var after = Math.floor(Date.now() / 1000) - 7 * 86400;
      return hass.callWS({ type: 'frigate/events/get', instance_id: c.inst, cameras: [c.name], limit: 40, after: after })
        .then(function (raw) { return thumbs(hass, c, F.parse(raw)); });
    }, []);
  };
  // Reviews: false = nicht verfügbar (ältere Frigate-/Integrationsversion, Fehler) → Ereignisliste wie bisher.
  // Vorschaubild über review_thumbnail.webp; ist der Notification-Proxy aus (Integrations-Option), das Bild der Erkennung.
  var proxyOk = {};
  var probe = function (hass, c, list) {
    var p = proxyOk[c.inst];
    if (p && Date.now() - p.at < 600000) return p.p;
    var r = list.filter(function (x) { return x.dets.length; })[0] || list[0];
    if (!r || typeof fetch !== 'function') return Promise.resolve(true);
    var job = F.sign(hass, F.path(c, 'rthumb', r.id)).then(function (u) {
      if (!u) return false;
      return fetch(abs(hass, u), { cache: 'no-store' }).then(function (res) { return !!res.ok; }).catch(function () { return false; });
    });
    var rec = proxyOk[c.inst] = { at: Date.now(), p: job, v: null };
    job.then(function (v) { rec.v = v; });
    return job;
  };
  F.reviews = function (hass, c, el) {
    if (!hass || !hass.callWS) return false;
    return load(rvc, c.cam, keyOf(hass, c), el, age(c.inst), function () {
      var after = Math.floor(Date.now() / 1000) - 7 * 86400;
      return hass.callWS({ type: 'frigate/reviews/get', instance_id: c.inst, cameras: [c.name], after: after, limit: 100 })
        .then(function (raw) {
          var list = F.parseReviews(raw);
          if (!list) throw new Error('keine Reviews');
          return probe(hass, c, list).then(function (ok) {
            return Promise.all(list.slice(0, 30).map(function (r) {
              var p = ok || !r.dets.length ? F.path(c, 'rthumb', r.id) : F.path(c, 'thumb', r.dets[0]);
              return F.sign(hass, p).then(function (u) { r.thumb = u; });
            }));
          }).then(function () { return list; });
        });
    }, false);
  };
  // „Behalten“: Ereignisse mit retain_indefinitely (Frigate-Favoriten), auch älter als 7 Tage.
  F.favs = function (hass, c, el) {
    if (!hass || !hass.callWS) return [];
    return load(fvc, c.cam, '', el, age(c.inst), function () {
      return hass.callWS({ type: 'frigate/events/get', instance_id: c.inst, cameras: [c.name], favorites: true, limit: 50 })
        .then(function (raw) { return thumbs(hass, c, F.parse(raw)); });
    }, []);
  };
  // Aufnahmen je Tag/Stunde in der Zeitzone des Browsers (die Stunden-Chips rechnen in Ortszeit).
  F.recSummary = function (hass, c, el) {
    if (!hass || !hass.callWS) return false;
    var tz = 'UTC';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || (hass.config && hass.config.time_zone) || 'UTC'; } catch (e) { /* UTC */ }
    return load(recc, c.cam, '', el, 300000, function () {
      return hass.callWS({ type: 'frigate/recordings/summary', instance_id: c.inst, camera: c.name, timezone: tz })
        .then(function (raw) { return F.parseSummary(raw); });
    }, false);
  };
  F.forget = function (cam) { delete evc[cam]; delete rvc[cam]; delete fvc[cam]; delete recc[cam]; };
  var stale = function (cam, force) { [evc, rvc, fvc].forEach(function (s) { if (s[cam]) { s[cam].stale = true; if (force) s[cam].force = true; } }); };

  // ── Filter (Chips) und Einträge ───────────────────────────────────────────
  // kind: '' | 'alert' | 'detection' | 'unseen' (oben, eine Reihe); im Bereich „Filter“: range 'week' | 'today',
  // fav (nur Favoriten), o/zone/face: ein Wert oder null (face NOFACE = Person ohne erkanntes Gesicht).
  var flts = {}, more = {}, els = {}, fopen = {};
  var NOFACE = '\u2205';
  F.NOFACE = NOFACE;
  var F0 = function () { return { kind: '', range: 'week', fav: false, o: null, zone: null, face: null }; };
  var flt = function (cam) { return flts[cam] || (flts[cam] = F0()); };
  F.filter = function (cam) { return (flts[cam] && flts[cam].o) || null; };
  F.filters = function (cam) { return Object.assign({}, flt(cam)); };
  // Wie viele Filter im Bereich „Filter“ gesetzt sind (Zähler an der Pille, „2 Filter aktiv“).
  F.fcount = function (f) { f = f || {}; return (f.range === 'today' ? 1 : 0) + (f.fav ? 1 : 0) + (f.o ? 1 : 0) + (f.zone ? 1 : 0) + (f.face ? 1 : 0); };
  var evItem = function (e) { return Object.assign({ kind: 'event', objs: [e.o], subs: e.sub ? [e.sub] : [], dets: [e.id], sev: null, seen: null }, e); };
  // Alle Einträge der Kamera: Reviews (mit dem Ereignis der ersten Erkennung: Treffer, Gesicht, Favorit) oder Ereignisse.
  // all: ohne den Filter „Nur Favoriten“ (Kopf, Objekte, Halten).
  F.items = function (cam, all) {
    var r = rvc[cam], ev = (evc[cam] && evc[cam].list) || null, f = all ? F0() : flt(cam);
    var mode = r && Array.isArray(r.list) ? 'review' : (!r || r.list === false) && ev ? 'event' : null;
    if (f.fav) { var fl = fvc[cam] && fvc[cam].list; return { mode: mode || 'event', list: fl ? fl.map(evItem) : null, fav: true }; }
    if (mode === 'review') {
      var by = {};
      (ev || []).concat((fvc[cam] && fvc[cam].list) || []).forEach(function (e) { if (!by[e.id] || e.fav) by[e.id] = e; });
      return { mode: mode, list: r.list.map(function (x) {
        var e0 = by[x.dets[0]] || null;
        return Object.assign({}, x, { ev: e0, score: e0 ? e0.score : null, sub: x.sub || (e0 && e0.sub) || null,
          fav: x.dets.some(function (d) { return by[d] && by[d].fav; }), thumb: x.thumb || (e0 && e0.thumb) || '' });
      }) };
    }
    if (mode === 'event') return { mode: mode, list: ev.map(evItem) };
    return { mode: null, list: null };
  };
  F.pick = function (list, f, now) {
    var d0 = new Date(now || Date.now()); d0.setHours(0, 0, 0, 0);
    f = f || {};
    return (list || []).filter(function (it) {
      if (f.kind === 'alert' && it.sev !== 'alert') return false;
      if (f.kind === 'detection' && it.sev !== 'detection') return false;
      // „Neu“ = ungesehene Alarme (dieselbe Zahl wie Kopf und Kachel).
      if (f.kind === 'unseen' && !(it.seen === false && it.sev === 'alert')) return false;
      if (f.range === 'today' && it.start < d0.getTime()) return false;
      if (f.o && (it.objs || [it.o]).indexOf(f.o) < 0) return false;
      if (f.zone && (it.zones || []).indexOf(f.zone) < 0) return false;
      var names = [it.sub].concat(it.subs || []).filter(Boolean);
      if (f.face === NOFACE) { if (names.length || (it.objs || [it.o]).indexOf('person') < 0) return false; }
      else if (f.face && names.indexOf(f.face) < 0) return false;
      return true;
    });
  };
  var shown = function (cam) { return F.pick(F.items(cam).list || [], flt(cam)); };
  F.shown = shown;
  // Neue (ungesehene) Alarme der geladenen 7 Tage – Kachel, Kopf und Chip „Neu“ zählen gleich.
  F.unseen = function (cam) {
    var l = rvc[cam] && Array.isArray(rvc[cam].list) ? rvc[cam].list : [];
    return l.filter(function (r) { return r.sev === 'alert' && r.seen === false; }).length;
  };
  var redraw = function (cam) {
    (els[cam] || []).forEach(function (w) { if (w && w.isConnected) kick(w); });
    tiles.forEach(function (h) { if (h._frig && h._frig.id === cam && h.isConnected) kick(h); });
  };
  F.eventById = function (cam, id) {
    var l = [].concat((evc[cam] && evc[cam].list) || [], (fvc[cam] && fvc[cam].list) || []);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  };
  var itemById = function (cam, id) {
    var l = (F.items(cam).list || []).concat(F.items(cam, true).list || []);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    var r = rvc[cam] && Array.isArray(rvc[cam].list) ? rvc[cam].list : [];
    for (var k = 0; k < r.length; k++) if (r[k].id === id) return r[k];
    var e = F.eventById(cam, id);
    return e ? evItem(e) : null;
  };
  // Gesehen: Review beim Öffnen markieren (frigate/reviews/viewed), sofort in der Liste und auf der Kachel.
  // „Gesehen“ speichert Frigate je Frigate-Benutzer – hier ist das der Benutzer, mit dem die Integration angemeldet ist;
  // alle in Home Assistant teilen sich also denselben Stand (Hinweis auch im Studio). Scheitert es, gilt es wieder als neu.
  F.mark = function (hass, c, ids, viewed) {
    var l = rvc[c.cam] && Array.isArray(rvc[c.cam].list) ? rvc[c.cam].list : [];
    var hit = l.filter(function (x) { return ids.indexOf(x.id) >= 0 && x.seen !== !!viewed; });
    if (!hit.length) return Promise.resolve(false);
    hit.forEach(function (r) { r.seen = !!viewed; });
    redraw(c.cam);
    if (!hass || !hass.callWS) return Promise.resolve(false);
    var back = function () { hit.forEach(function (r) { r.seen = !viewed; }); redraw(c.cam); return false; };
    return hass.callWS({ type: 'frigate/reviews/viewed', instance_id: c.inst, ids: hit.map(function (r) { return r.id; }), viewed: !!viewed })
      .then(function (raw) { var r = jparse(raw); return r && r.success === false ? back() : true; }, back);
  };
  F.seen = function (hass, c, rid) { return F.mark(hass, c, [rid], true); };
  // Alle als gesehen (Power-User, mit Rückfrage im Popup): alle ungesehenen der geladenen 7 Tage.
  F.seenAll = function (hass, c) {
    var l = rvc[c.cam] && Array.isArray(rvc[c.cam].list) ? rvc[c.cam].list : [];
    return F.mark(hass, c, l.filter(function (r) { return r.seen === false; }).map(function (r) { return r.id; }), true);
  };
  // Favorit (Frigate: retain_indefinitely, wird nicht automatisch gelöscht) an/aus; die Listen übernehmen es sofort,
  // „Favoriten“ fragt neu.
  F.retain = function (hass, c, evId, want) {
    if (!hass || !hass.callWS || !evId) return Promise.resolve(false);
    return hass.callWS({ type: 'frigate/event/retain', instance_id: c.inst, event_id: evId, retain: !!want }).then(function (raw) {
      var r = jparse(raw);
      if (r && r.success === false) return false;
      [evc, fvc].forEach(function (s) { ((s[c.cam] && s[c.cam].list) || []).forEach(function (e) { if (e.id === evId) e.fav = !!want; }); });
      var hit = F.eventById(c.cam, evId);
      if (want && !hit && fvc[c.cam] && fvc[c.cam].list) fvc[c.cam].stale = true;
      if (fvc[c.cam]) fvc[c.cam].stale = true;
      redraw(c.cam);
      return true;
    }).catch(function () { return false; });
  };

  // ── Abo (frigate/reviews/subscribe, sonst events/subscribe) ───────────────
  // Nur solange ein Popup offen bzw. eine Kachel sichtbar ist (und die Seite im Vordergrund); sonst abgemeldet.
  // Ohne Abo (Fehler, ältere Integration) bleibt es bei der Abfrage wie bisher.
  var subs = {}, holders = [], tiles = new Set(), sweepT = null;
  var subOn = function (inst) { return !!(subs[inst] && subs[inst].on); };
  F.subOn = subOn;
  var bump = {};
  var onMsg = function (inst, payload) {
    var m = jparse(payload) || {};
    var x = m.after || m.before || m;
    var name = x && x.camera;
    // „update“ kommt laufend (Zonen, Treffer) – höchstens alle 5 s neu fragen; Beginn und Ende sofort.
    var now = m.type === 'new' || m.type === 'end';
    Object.keys(info).forEach(function (cam) {
      if (info[cam].inst !== inst || (name && info[cam].name !== name)) return;
      stale(cam, now);
      // Mehrere Meldungen kurz hintereinander (update, update, end): einmal neu fragen.
      clearTimeout(bump[cam]);
      bump[cam] = setTimeout(function () { redraw(cam); }, 600);
    });
  };
  var subStart = function (hass, inst) {
    var s = subs[inst] = { on: false, busy: true, unsub: null, kind: null, at: Date.now() };
    var conn = hass && hass.connection;
    if (!conn || typeof conn.subscribeMessage !== 'function') { s.busy = false; s.failed = Date.now(); return; }
    var go = function (type) {
      return conn.subscribeMessage(function (p) { onMsg(inst, p); }, { type: type, instance_id: inst });
    };
    go('frigate/reviews/subscribe').then(function (u) { return { u: u, k: 'reviews' }; }, function () {
      return go('frigate/events/subscribe').then(function (u) { return { u: u, k: 'events' }; });
    }).then(function (r) {
      s.busy = false;
      if (subs[inst] !== s || s.drop) { try { r.u(); } catch (e) { /* weg */ } return; }
      s.on = true; s.unsub = r.u; s.kind = r.k;
    }).catch(function () { s.busy = false; s.failed = Date.now(); });
  };
  var subStop = function (inst) {
    var s = subs[inst];
    if (!s) return;
    if (s.busy) { s.drop = true; delete subs[inst]; return; }
    if (s.unsub) { try { s.unsub(); } catch (e) { /* Verbindung weg */ } }
    delete subs[inst];
  };
  var hidden = function () { return typeof document !== 'undefined' && document.hidden === true; };
  // Halter: Popup-Bereiche (el) und sichtbare Kacheln (host); je Instanz ein Abo, solange einer gilt.
  var hold = function (el, c, hass, kind) {
    if (!el) return;
    for (var i = 0; i < holders.length; i++) if (holders[i].el === el) { holders[i].hass = hass; holders[i].inst = c.inst; return; }
    holders.push({ el: el, inst: c.inst, cam: c.cam, hass: hass, kind: kind || 'pop' });
    sweepSoon();
  };
  var unhold = function (el) { holders = holders.filter(function (h) { return h.el !== el; }); };
  var sweep = function () {
    var want = {};
    holders = holders.filter(function (h) { return h.el && h.el.isConnected; });
    // Geschlossene Popup-Bereiche nicht festhalten.
    Object.keys(els).forEach(function (cam) { els[cam] = els[cam].filter(function (w) { return w && w.isConnected; }); if (!els[cam].length) delete els[cam]; });
    holders.forEach(function (h) {
      var ok = !hidden() && (h.kind !== 'tile' || (h.el._frig && h.el._frig.vis));
      if (ok) want[h.inst] = h.hass;
    });
    Object.keys(want).forEach(function (inst) {
      var s = subs[inst];
      if (!s && !(subFail[inst] && Date.now() - subFail[inst] < 300000)) subStart(want[inst], inst);
      else if (s && s.failed) { subFail[inst] = s.failed; delete subs[inst]; }
    });
    Object.keys(subs).forEach(function (inst) { if (!want[inst]) subStop(inst); });
    tiles.forEach(function (h) { if (!h.isConnected) tileDrop(h); else tileSync(h); });
    if (!holders.length && !tiles.size && sweepT) { clearInterval(sweepT); sweepT = null; }
  };
  var subFail = {};
  var sweepSoon = function () {
    if (!sweepT && typeof setInterval === 'function') sweepT = setInterval(sweep, 2000);
    setTimeout(sweep, 0);
  };
  F.sweep = sweep;
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', function () {
      sweep();
      // Zurück im Vordergrund: offene Bereiche neu zeichnen (Abo war ab, es kann etwas fehlen).
      if (!hidden()) Object.keys(els).forEach(function (cam) { stale(cam); redraw(cam); });
    });
  }
  // Für Tests: was gerade läuft (Abos, Halter, Kacheln, Live-Bilder).
  F._dbg = function () {
    var live = 0;
    tiles.forEach(function (h) { if (h._frig && h._frig.layer) live++; });
    return { subs: Object.keys(subs).filter(function (k) { return subs[k].on; }), subKind: Object.keys(subs).map(function (k) { return subs[k].kind; }),
      holders: holders.length, tiles: tiles.size, live: live, timer: !!sweepT };
  };

  // ── Kachel: sichtbar? Live-Bild, Abo, Reviews ─────────────────────────────
  // Aufgerufen aus state_display der Kachel (casora_frigate). Live-Bild nur mit Studio-Feld „Live auf der Kachel“,
  // nur sichtbar (IntersectionObserver) und im Vordergrund, nur mit Stream-Funktion (supported_features & 2);
  // HAs ha-camera-stream stumm über dem Standbild, erst eingeblendet, wenn es wirklich läuft. Scheitert es, bleibt
  // das Standbild (5 Min. kein neuer Versuch). Weg von der Seite/aus dem Bild: abgebaut.
  var findVideo = function (root, d) {
    if (!root || d > 12) return null;
    var v = root.querySelector && root.querySelector('video');
    if (v) return v;
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) { var x = findVideo(all[i].shadowRoot, d + 1); if (x) return x; }
    return null;
  };
  F.liveWanted = function (v) { return !!(v && (v.live_tile === true || v.live_tile === 'true')); };
  F.tileWatch = function (host, entity, hass, variables) {
    try {
      var id = entity && entity.entity_id;
      if (!host || !id || !F.is(hass, id)) return;
      var st = host._frig || (host._frig = { vis: false, id: id });
      st.id = id; st.hass = hass; st.want = F.liveWanted(variables);
      if (!st.io && typeof IntersectionObserver === 'function') {
        st.io = new IntersectionObserver(function (en) {
          st.vis = en.some(function (x) { return x.isIntersecting; });
          tileSync(host);
          sweep();
        }, { rootMargin: '80px' });
        st.io.observe(host);
      } else if (!st.io) st.vis = true;
      if (!tiles.has(host)) { tiles.add(host); sweepSoon(); }
      var c = F.find(hass, id);
      hold(host, c, hass, 'tile');
      if (st.vis && !hidden()) F.reviews(hass, c, host);
      tileSync(host);
    } catch (e) { /* Kachel zeichnet trotzdem */ }
  };
  F.tilePlaying = function (host) { return !!(host && host._frig && host._frig.playing); };
  var tileSync = function (host) {
    var st = host._frig;
    if (!st) return;
    var S = (st.hass && st.hass.states) || {}, cs = S[st.id];
    var stream = !!(cs && (Number((cs.attributes || {}).supported_features) || 0) & 2);
    var ok = st.want && st.vis && !hidden() && host.isConnected && stream && cs && !bad(cs.state) && cs.state !== 'off'
      && !(st.fail && Date.now() - st.fail < 300000) && (liveFails[st.id] || 0) < 2 && typeof customElements !== 'undefined' && !!customElements.get('ha-camera-stream');
    if (ok && !st.layer) liveMount(host, st);
    else if (!ok && st.layer) liveDrop(host, st);
    else if (st.layer && st.cam) { st.cam.hass = st.hass; if (st.cam.stateObj !== cs) st.cam.stateObj = cs; liveCheck(host, st); }
  };
  // Zweimal kein Bild: für diese Sitzung aufgeben (Standbild), statt alle 5 Min. neu zu versuchen.
  var liveFails = {};
  var findImg = function (root, d) {
    if (!root || d > 12) return null;
    var im = root.querySelector && root.querySelector('img');
    if (im) return im;
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) { var x = findImg(all[i].shadowRoot, d + 1); if (x) return x; }
    return null;
  };
  var liveMount = function (host, st) {
    var root = host.shadowRoot, card = root && root.querySelector('ha-card');
    if (!card) return;
    var layer = document.createElement('div');
    layer.className = 'casora-frigate-live';
    // Unter Name/Zustand (die liegen im Raster darüber), über dem Standbild; erst sichtbar, wenn es läuft.
    layer.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit;opacity:0;'
      + 'transition:opacity var(--casora-dur-feedback, 160ms) var(--casora-ease-feedback, ease);';
    var el = document.createElement('ha-camera-stream');
    el.muted = true; el.controls = false; el.allowExoPlayer = false; el.fitMode = 'cover';
    el.setAttribute('muted', '');
    el.style.cssText = 'display:block;width:100%;height:100%;--video-max-height:100%;';
    el.hass = st.hass; el.stateObj = (st.hass.states || {})[st.id];
    layer.appendChild(el);
    // Kleines „Live“-Zeichen oben rechts, sobald das Bild läuft (mit der Ebene eingeblendet).
    var tag = document.createElement('span');
    tag.className = 'casora-frigate-live-tag';
    tag.setAttribute('aria-hidden', 'true');
    tag.style.cssText = 'position:absolute;top:var(--casora-space-3, 12px);right:var(--casora-space-3, 12px);display:inline-flex;align-items:center;gap:6px;'
      + 'padding:4px 10px;border-radius:999px;background:rgba(0,0,0,0.55);color:#fff;font:600 var(--casora-fs-label, 12px)/1.2 var(--primary-font-family, system-ui);';
    tag.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:var(--casora-color-red, #D35A4E);"></span><span></span>';
    tag.lastChild.textContent = tr('Live');
    layer.appendChild(tag);
    card.insertBefore(layer, card.firstChild);
    st.layer = layer; st.cam = el; st.at = Date.now(); st.playing = false;
  };
  var liveDrop = function (host, st) {
    if (st.layer) { try { st.layer.remove(); } catch (e) { /* weg */ } }
    var was = st.playing;
    st.layer = null; st.cam = null; st.playing = false;
    if (was) kick(host);
  };
  // Läuft das Video? Dann einblenden (Text „Live“); nach 20 s ohne Bild oder bei Abbruch zurück aufs Standbild.
  var liveCheck = function (host, st) {
    var v = st.cam && findVideo(st.cam.shadowRoot || st.cam, 0);
    // Ohne HLS/WebRTC zeigt ha-camera-stream MJPEG als <img> – läuft auch.
    var im = !v && st.cam ? findImg(st.cam.shadowRoot || st.cam, 0) : null;
    var ok = !!(v && v.readyState >= 2 && !v.error) || !!(im && im.complete && im.naturalWidth > 0);
    if (ok) {
      st.okAt = Date.now();
      if (!st.playing) { st.playing = true; st.layer.style.opacity = '1'; kick(host); }
      try { if (v) { v.muted = true; if (v.style.objectFit !== 'cover') v.style.objectFit = 'cover'; } else if (im.style.objectFit !== 'cover') im.style.objectFit = 'cover'; } catch (e) { /* egal */ }
      return;
    }
    if (Date.now() - (st.okAt || st.at) > 20000) { st.fail = Date.now(); liveFails[st.id] = (liveFails[st.id] || 0) + 1; liveDrop(host, st); }
  };
  var tileDrop = function (host) {
    var st = host._frig;
    if (st) {
      liveDrop(host, st);
      if (st.io) { try { st.io.disconnect(); } catch (e) { /* weg */ } }
    }
    unhold(host);
    tiles.delete(host);
    delete host._frig;
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

  // ── Zeit und Tage ─────────────────────────────────────────────────────────
  // Deutsch „09:05“ zweistellig, sonst hour 'numeric': Englisch „9:05 AM“ statt „09:05 AM“.
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : undefined; };
  var clock = function (ms, secs) {
    var l = loc();
    var o = { hour: !l || /^de/i.test(String(l)) ? '2-digit' : 'numeric', minute: '2-digit' };
    if (secs) o.second = '2-digit';
    return new Date(ms).toLocaleTimeString(l, o);
  };
  F.clock = clock;
  var dayWord = function (ms, now) {
    var a = new Date(now || Date.now()); a.setHours(0, 0, 0, 0);
    var b = new Date(ms); b.setHours(0, 0, 0, 0);
    var d = Math.round((a - b) / 86400000);
    if (d === 0) return null;
    if (d === 1) return 'Gestern';
    return b.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'numeric' });
  };
  // Zeitpunkt mit Tag, wenn nicht heute: „Gestern · 23:30“, „Mi., 14.10. · 22:47“ (Trenner wie überall „ · “).
  var stamp = function (ms) { var dw = dayWord(ms); return (dw ? dw + ' · ' : '') + clock(ms); };
  // Tag 'YYYY-MM-DD' (Ortszeit) → Beginn in ms; Name „Heute“ / „Gestern“ / „Mi., 14.10.“.
  var dayStart = function (day, h) { var p = String(day).split('-'); return new Date(+p[0], +p[1] - 1, +p[2], h || 0, 0, 0, 0).getTime(); };
  F.dayStart = dayStart;
  var dayName = function (day, now) { var dw = dayWord(dayStart(day, 12), now); return dw || 'Heute'; };
  F.dayName = dayName;
  // Stunde ohne führende Null: „9 Uhr“, Englisch „9 AM“ (de-DE schriebe „09 Uhr“).
  var hourName = function (day, h) {
    if (deUI()) return h + '\u00a0Uhr';
    return new Date(dayStart(day, h)).toLocaleTimeString(loc(), { hour: 'numeric' });
  };
  F.hourName = hourName;
  // Zeitraum einer Stunde für den Kopf: „10–11 Uhr“, Englisch „10–11 AM“ bzw. „11 AM–12 PM“.
  var hourRange = function (a, b) {
    var x = new Date(a * 1000), y = new Date(b * 1000);
    if (deUI()) return x.getHours() + '–' + y.getHours() + '\u00a0Uhr';
    var o = { hour: 'numeric' }, p = x.toLocaleTimeString(loc(), o), q = y.toLocaleTimeString(loc(), o);
    var sx = p.replace(/^[\d\s\u202f\u00a0]+/, ''), sy = q.replace(/^[\d\s\u202f\u00a0]+/, '');
    return sx && sx === sy ? p.replace(sx, '').trim() + '–' + q : p + '–' + q;
  };
  F.hourRange = hourRange;
  // Länge einer Ortszeit-Stunde in s (Zeitumstellung: die doppelte Stunde dauert 2 Std.).
  F.hourSpan = function (day, h) {
    var a = dayStart(day, h), b = dayStart(day, h + 1);
    var d = Math.round((b - a) / 1000);
    return d >= 1800 && d <= 7200 ? d : 3600;
  };
  var hrs = function (s) {
    var m = Math.round(s / 60);
    if (m < 60) return m + '\u00a0Min.';
    return Math.round(m / 60) + '\u00a0Std.';
  };
  F.hrs = hrs;

  // ── Wiedergabe: MP4 oder HLS über HAs Player ──────────────────────────────
  // HLS über HAs ha-hls-player (lädt HA mit seinen Kamera-Karten; sonst einmal eine anlegen lassen), ohne ihn Safari
  // nativ. Jede Quelle bekommt 12 s; dann die nächste (Clip: MP4 → HLS → Hinweis; Aufnahme: HLS → MP4 → Hinweis).
  var hlsReady = function () {
    if (typeof customElements === 'undefined') return Promise.resolve(false);
    if (customElements.get('ha-hls-player')) return Promise.resolve(true);
    try {
      if (window.loadCardHelpers) window.loadCardHelpers().then(function (h) { return h.createCardElement({ type: 'picture-entity', entity: 'camera.casora_frigate_laden', camera_view: 'live' }); }).catch(function () {});
    } catch (e) { /* ohne */ }
    return Promise.race([customElements.whenDefined('ha-hls-player').then(function () { return true; }),
      new Promise(function (r) { setTimeout(function () { r(false); }, 4000); })]);
  };
  var playable = function (v, ms) {
    return new Promise(function (res, rej) {
      if (!v) { rej(new Error('kein Video')); return; }
      if (v.readyState >= 1 && !v.error) { res(v); return; }
      var done = false, t = setTimeout(function () { fin(false); }, ms);
      var fin = function (ok) {
        if (done) return; done = true; clearTimeout(t);
        v.removeEventListener('loadedmetadata', yes); v.removeEventListener('error', no);
        if (ok) res(v); else rej(new Error('lädt nicht'));
      };
      var yes = function () { fin(true); }, no = function () { fin(false); };
      v.addEventListener('loadedmetadata', yes); v.addEventListener('error', no);
    });
  };
  var mountMp4 = function (holder, url, o) {
    var v = document.createElement('video');
    v.controls = o.controls !== false; v.playsInline = true; v.muted = !!o.muted; v.preload = 'metadata';
    v.setAttribute('playsinline', '');
    if (o.poster) v.poster = o.poster;
    v.style.cssText = 'width:100%;height:100%;object-fit:contain;display:block;background:#000;';
    v.src = url;
    holder.appendChild(v);
    if (o.autoplay) { var p = v.play && v.play(); if (p && p.catch) p.catch(function () {}); }
    return playable(v, 12000);
  };
  var mountHls = function (holder, hass, url, o) {
    return hlsReady().then(function (ok) {
      if (!ok) {
        var nv = document.createElement('video');
        if (!nv.canPlayType || !nv.canPlayType('application/vnd.apple.mpegurl')) throw new Error('kein HLS');
        return mountMp4(holder, url, o);
      }
      var p = document.createElement('ha-hls-player');
      p.hass = hass; p.controls = o.controls !== false; p.muted = true; p.autoPlay = !!o.autoplay; p.playsInline = true; p.allowExoPlayer = false;
      if (o.poster) p.posterUrl = o.poster;
      p.setAttribute('playsinline', '');
      if (p.controls) p.setAttribute('controls', '');
      p.style.cssText = 'display:block;width:100%;height:100%;--video-max-height:100%;';
      holder.appendChild(p);
      p.url = url;
      // Fehler sofort erkennen: HAs Player zeigt dann ein ha-alert (401, Stream nie gestartet) – zweimal hintereinander
      // gesehen (300 ms) gilt als gescheitert, statt bis zum Zeitlimit zu warten (A4).
      return new Promise(function (res, rej) {
        var t0 = Date.now(), alerts = 0, done = false;
        var fin = function (ok, v) { if (done) return; done = true; if (ok) res(v); else rej(new Error(v || 'HLS-Fehler')); };
        p.addEventListener('streams', function () { setTimeout(look, 50); });
        var look = function () {
          if (done) return;
          if (!p.isConnected) { fin(false, 'weg'); return; }
          var r = p.shadowRoot;
          if (r && r.querySelector('ha-alert')) { if (++alerts >= 2) { fin(false, 'HLS-Fehler'); return; } } else alerts = 0;
          var v = findVideo(r || p, 0);
          if (v && v.error) { fin(false, 'Videofehler'); return; }
          if (v && v.readyState >= 1) { fin(true, v); return; }
          if (Date.now() - t0 > 12000) { fin(false, 'lädt nicht'); return; }
          setTimeout(look, 300);
        };
        look();
      });
    });
  };
  // sources: [{k:'mp4'|'hls', path}] – nacheinander versuchen; Ergebnis {video, k, path} oder Fehler. HLS über die
  // signierte Unter-Liste (F.hlsUrl). Scheitert eine Quelle mit einer älteren Signatur, einmal frisch signiert neu
  // versuchen, bevor der Rückfall greift (A6).
  F.playChain = function (holder, hass, sources, o, alive) {
    var i = 0;
    var one = function (s, force) {
      var urlP = s.k === 'hls' ? F.hlsUrl(hass, s.path, force)
        : F.sign(hass, s.path, VOD_TTL, force).then(function (u) { if (!u) throw new Error('nicht signiert'); return abs(hass, u); });
      return urlP.then(function (url) {
        if (alive && !alive()) throw new Error('weg');
        while (holder.firstChild) holder.removeChild(holder.firstChild);
        return (s.k === 'hls' ? mountHls(holder, hass, url, o) : mountMp4(holder, url, o)).then(function (v) { return { video: v, k: s.k, path: s.path }; });
      });
    };
    var next = function () {
      if (alive && !alive()) return Promise.reject(new Error('weg'));
      var s = sources[i++];
      if (!s) return Promise.reject(new Error('keine Quelle'));
      var age0 = F.signAge(s.path);
      return one(s, false).catch(function () {
        if (alive && !alive()) throw new Error('weg');
        if (age0 != null && age0 > 60000) return one(s, true);
        throw new Error('weiter');
      }).catch(function () { return next(); });
    };
    return next();
  };

  var PCSS = ':host{display:block;text-align:left;font-family:var(--primary-font-family, system-ui, sans-serif);}'
    // Höchstens 56 % der Fensterhöhe (Querformat/Tablet), das Bild bleibt ganz (contain).
    + '.fr{position:relative;width:100%;aspect-ratio:16/9;max-height:56vh;border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:#000;}'
    + '.mt{position:absolute;inset:0;}.mt>*{width:100%;height:100%;display:block;}'
    + '.po{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;display:block;}'
    + '.po[hidden]{display:none;}'
    + '.ov{position:absolute;left:12px;bottom:12px;padding:6px 12px;border-radius:999px;font-size:var(--casora-fs-sub, 13px);font-weight:600;'
    +   'background:rgba(0,0,0,0.55);color:rgba(255,255,255,0.92);pointer-events:none;}'
    + '.ov[hidden]{display:none;}'
    + '.ar{position:absolute;top:50%;width:44px;height:44px;margin-top:-22px;border-radius:50%;display:grid;place-items:center;cursor:pointer;'
    +   'background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, #3A322B);box-shadow:var(--casora-shadow-raised, none);'
    +   'transition:opacity var(--casora-dur-feedback, 160ms) var(--casora-ease-feedback, ease);}'
    // Beim Abspielen keine Blätter-Pfeile über dem Video (Bedienleiste des Videos bleibt frei).
    + '.fr.playing .ar{opacity:0;pointer-events:none;}'
    + '.ar ha-icon{--mdc-icon-size:24px;pointer-events:none;}'
    + '.ar:active{transform:scale(var(--casora-press-scale, .97));}'
    + '.bar{display:grid;grid-template-columns:repeat(var(--n,2),minmax(0,1fr));gap:var(--casora-space-3, 12px);margin-top:var(--casora-space-3, 12px);}'
    + '.b{box-sizing:border-box;min-height:46px;padding:0 12px;border:0;border-radius:var(--casora-r-pill, 999px);cursor:pointer;'
    +   'display:flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-size:14px;font-weight:700;white-space:nowrap;min-width:0;'
    +   'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));color:var(--casora-popup-tiles-text-primary, var(--primary-text-color, #3A322B));'
    +   'transition:background-color var(--casora-dur-feedback, 160ms) var(--casora-ease-feedback, ease);-webkit-tap-highlight-color:transparent;touch-action:manipulation;}'
    + '.b ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;flex:none;pointer-events:none;}'
    + '.b span{pointer-events:none;overflow:hidden;text-overflow:ellipsis;}'
    + '.b:active{transform:scale(var(--casora-press-scale, .97));}'
    + '@media (hover:hover){.b:not(.on):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
    + '.b.on{background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, var(--casora-popup-tiles-text-primary, #3A322B));box-shadow:var(--casora-soft-seg-on-shadow, none);}'
    + '.b.on ha-icon{color:var(--casora-popup-accent, currentColor);}'
    + '.b:disabled{opacity:.45;cursor:default;transform:none;}'
    + '.b[hidden]{display:none;}'
    + '.nt{margin-top:var(--casora-space-2, 8px);font-size:var(--casora-fs-sub, 13px);font-weight:500;text-align:center;'
    +   'color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));}'
    + '.nt[hidden]{display:none;}'
    + '@media (prefers-reduced-motion:reduce){.b,.ar{transition:none;}.b:active,.ar:active{transform:none;}}';

  // Rückmeldung an einem Knopf: Text kurz tauschen („Wird geladen …“ → „Gespeichert“), dann zurück.
  var btnSay = function (b, text, ms) {
    var sp = b && b.querySelector('span');
    if (!sp) return;
    if (b._txt == null) b._txt = sp.textContent;
    clearTimeout(b._sayT);
    sp.textContent = tr(text);
    if (ms) b._sayT = setTimeout(function () { sp.textContent = b._txt; b._txt = null; }, ms);
  };
  var btnBack = function (b) { var sp = b && b.querySelector('span'); clearTimeout(b && b._sayT); if (sp && b._txt != null) { sp.textContent = b._txt; b._txt = null; } };
  // Herunterladen mit Rückmeldung (Datei als Blob mit lesbarem Namen, F.download).
  var dlWith = function (b, hass, path, name) {
    if (!b || b.disabled) return Promise.resolve(false);
    haptic('light');
    b.disabled = true;
    btnSay(b, 'Wird geladen …');
    return F.download(hass, path, name).then(function (ok) {
      b.disabled = false;
      btnSay(b, ok ? 'Gespeichert' : 'Nicht geladen', 2200);
      return ok;
    });
  };

  // ── Detail einer Erkennung: Clip, Herunterladen, Teilen, Favorit, Blättern ──
  // Review: der ganze Review-Zeitraum aus den Aufnahmen (vod/<kamera>/start/end), sonst der Clip des Ereignisses
  // (MP4 über den Notification-Proxy → HLS notifications/<id>/master.m3u8 → HLS vod/event); erst dann „Kein Clip“.
  // Favorit und Herunterladen bleiben am Ereignis.
  F.clipSources = function (c, cfg) {
    var src = [];
    if (cfg.rv && cfg.start) {
      var end = cfg.end || Date.now();
      src.push({ k: 'hls', path: F.path(c, 'vod', sec0(cfg.start), Math.max(sec0(cfg.start) + 1, Math.ceil(end / 1000))) });
    }
    if (cfg.ev && cfg.clip) src.push({ k: 'mp4', path: F.path(c, 'clip', cfg.ev) }, { k: 'hls', path: F.path(c, 'nhls', cfg.ev) }, { k: 'hls', path: F.path(c, 'vodev', cfg.ev) });
    else if (!cfg.rv && !cfg.ev && cfg.start) src.push({ k: 'hls', path: F.path(c, 'vod', sec0(cfg.start), Math.ceil((cfg.end || cfg.start + 30000) / 1000)) });
    return src;
  };
  var clips = new Set();
  if (typeof customElements !== 'undefined' && !customElements.get('casora-frigate-clip')) {
    class FClip extends HTMLElement {
      setConfig(cfg) { this._cfg = cfg || {}; }
      getCardSize() { return 5; }
      set hass(h) { this._hass = h; if (!this._root) this._build(); }
      get hass() { return this._hass; }
      connectedCallback() { clips.add(this); this._gone = false; if (this._hass && !this._root) this._build(); }
      disconnectedCallback() { clips.delete(this); this._gone = true; }
    }
    var CP = FClip.prototype;
    CP._build = function () {
      var cfg = this._cfg || {}, self = this, nav = cfg.nav || {};
      var r = this._root = this.attachShadow({ mode: 'open' });
      var arrow = function (side, id, label) {
        if (!id) return '';
        return '<div class="ar" role="button" tabindex="0" aria-label="' + esc(tr(label)) + '" data-casora-mi="frigate-' + (nav.rv ? 'rv' : 'ev') + ':'
          + esc(cfg.entity + '|' + id + '|' + (nav.back ? 'b' : '')) + '" style="' + side + ':12px;"><ha-icon icon="mdi:chevron-' + side + '"></ha-icon></div>';
      };
      var share = F.canShare();
      var hasClip = F.clipSources(this._c(), cfg).length > 0;
      var n = 1 + (share ? 1 : 0) + (cfg.ev ? 1 : 0);
      r.innerHTML = '<style>' + PCSS + '</style>'
        + '<div class="fr" data-frigate-swipe="' + esc(cfg.entity) + '"><img class="po" alt="" hidden><div class="mt"></div>'
        + '<div class="ov frig-noclip" hidden>' + esc(tr('Kein Clip vorhanden')) + '</div>'
        + arrow('left', nav.newer, 'Neuere Erkennung') + arrow('right', nav.older, 'Ältere Erkennung') + '</div>'
        + '<div class="bar" style="--n:' + n + ';"><button class="b dl" type="button"><ha-icon icon="mdi:download"></ha-icon><span>'
        + esc(tr(hasClip ? 'Herunterladen' : 'Bild herunterladen')) + '</span></button>'
        + (share ? '<button class="b sh" type="button"><ha-icon icon="mdi:share-variant-outline"></ha-icon><span>' + esc(tr('Teilen')) + '</span></button>' : '')
        + '<button class="b fv" type="button" aria-pressed="false"><ha-icon icon="mdi:star-outline"></ha-icon><span>' + esc(tr('Favorit')) + '</span></button></div>'
        + '<div class="nt fvn" hidden>' + esc(tr('Wird nicht automatisch gelöscht')) + '</div>';
      r.querySelector('.dl').addEventListener('click', function (ev) { ev.stopPropagation(); self._download(ev.currentTarget); });
      if (share) r.querySelector('.sh').addEventListener('click', function (ev) { ev.stopPropagation(); self._share(ev.currentTarget); });
      r.querySelector('.fv').addEventListener('click', function (ev) { ev.stopPropagation(); self._fav(); });
      var fv = r.querySelector('.fv');
      if (!cfg.ev) fv.hidden = true;
      this._paintFav();
      var po = r.querySelector('.po');
      if (cfg.poster) F.sign(this._hass, cfg.poster).then(function (u) { if (u) { po.src = abs(self._hass, u); po.hidden = false; } });
      this._play();
    };
    CP._c = function () { var cfg = this._cfg || {}; return { cam: cfg.entity, inst: cfg.inst, name: cfg.name }; };
    CP._play = function () {
      var cfg = this._cfg || {}, self = this, r = this._root, c = this._c();
      var mt = r.querySelector('.mt'), ov = r.querySelector('.ov'), po = r.querySelector('.po'), fr = r.querySelector('.fr');
      var src = F.clipSources(c, cfg);
      if (!src.length) { ov.hidden = false; this.setAttribute('data-src', 'none'); return; }
      this.setAttribute('data-src', 'lädt');
      (cfg.poster ? F.sign(this._hass, cfg.poster) : Promise.resolve(null)).then(function (pu) {
        return F.playChain(mt, self._hass, src, { poster: pu ? abs(self._hass, pu) : null, controls: true }, function () { return !self._gone; });
      }).then(function (res) {
        self._src = res.k; self._srcPath = res.path;
        self.setAttribute('data-src', res.k);
        po.hidden = true;
        var v = res.video;
        var pl = function () { fr.classList.toggle('playing', !v.paused && !v.ended); };
        ['play', 'playing', 'pause', 'ended'].forEach(function (k) { v.addEventListener(k, pl); });
        pl();
      }).catch(function () {
        while (mt.firstChild) mt.removeChild(mt.firstChild);
        self._src = null;
        self.setAttribute('data-src', 'none');
        ov.hidden = false;
        // Ohne Clip: herunterladen heißt das Bild.
        if (cfg.ev) { var sp = r.querySelector('.dl span'); if (sp) sp.textContent = tr('Bild herunterladen'); }
      });
    };
    CP._paintFav = function () {
      var b = this._root && this._root.querySelector('.fv');
      if (!b) return;
      var e = F.eventById((this._cfg || {}).entity, (this._cfg || {}).ev);
      var onv = this._favOn != null ? this._favOn : !!(e ? e.fav : (this._cfg || {}).fav);
      b.classList.toggle('on', onv);
      b.setAttribute('aria-pressed', onv ? 'true' : 'false');
      b.querySelector('ha-icon').setAttribute('icon', onv ? 'mdi:star' : 'mdi:star-outline');
      b.querySelector('span').textContent = tr(onv ? 'Favorit ✓' : 'Favorit');
      var nt = this._root.querySelector('.fvn');
      if (nt) nt.hidden = !onv;
    };
    CP._fav = function () {
      var cfg = this._cfg || {}, self = this, b = this._root.querySelector('.fv');
      if (b.disabled) return;
      haptic('light');
      var want = b.getAttribute('aria-pressed') !== 'true';
      b.disabled = true;
      F.retain(this._hass, this._c(), cfg.ev, want).then(function (ok) {
        b.disabled = false;
        if (ok) self._favOn = want;
        self._paintFav();
      });
    };
    // Was „Herunterladen“/„Teilen“ holt: der Clip des Ereignisses (MP4), ohne Notification-Proxy derselbe Abschnitt aus
    // den Aufnahmen; ohne Clip der Schnappschuss.
    CP._file = function () {
      var cfg = this._cfg || {}, c = this._c();
      var at = cfg.start || Date.now(), nm = function (ext) { return F.fileName(cfg.camName || c.name, at, ext); };
      var noProxy = proxyOk[c.inst] && proxyOk[c.inst].v === false;
      if (cfg.ev && cfg.clip && this._src !== null && !noProxy) return { path: F.path(c, 'clip', cfg.ev), name: nm('mp4'), type: 'video/mp4', alt: this._rec() };
      var rec = this._src !== null ? this._rec() : null;
      if (rec) return rec;
      if (cfg.ev) return { path: F.path(c, 'snap', cfg.ev), name: nm('jpg'), type: 'image/jpeg' };
      return null;
    };
    CP._rec = function () {
      var cfg = this._cfg || {}, c = this._c();
      if (!cfg.start) return null;
      var a = sec0(cfg.start), b = Math.max(a + 1, Math.ceil((cfg.end || cfg.start + 30000) / 1000));
      return { path: F.path(c, 'rec', a, Math.min(b, a + 3600)), name: F.fileName(cfg.camName || c.name, cfg.start, 'mp4'), type: 'video/mp4' };
    };
    CP._download = function (b) {
      var f = this._file(), h = this._hass;
      if (!f) return Promise.resolve(false);
      return dlWith(b, h, f.path, f.name).then(function (ok) { return ok || !f.alt ? ok : dlWith(b, h, f.alt.path, f.alt.name); });
    };
    // Teilen: Datei holen, dann navigator.share. Geht die Freigabe des Tippens beim Laden verloren (Safari), liegt die
    // Datei bereit: „Jetzt teilen“ teilt sofort.
    CP._share = function (b) {
      var self = this, f = this._file();
      if (!f || b.disabled) return;
      haptic('light');
      var go = function (file) {
        return navigator.share({ files: [file] }).then(function () { btnBack(b); self._ready = null; }, function (e) {
          if (e && e.name === 'NotAllowedError') { self._ready = file; btnSay(b, 'Jetzt teilen'); } else btnBack(b);
        });
      };
      if (this._ready) { go(this._ready); return; }
      b.disabled = true;
      btnSay(b, 'Wird geladen …');
      F.fetchBlob(this._hass, f.path).then(function (blob) {
        b.disabled = false;
        return go(new File([blob], f.name, { type: f.type }));
      }).catch(function () { b.disabled = false; btnSay(b, 'Nicht geladen', 2200); });
    };
    customElements.define('casora-frigate-clip', FClip);
  }

  // Öffnet sich aus der Liste im Popup (‹ zurück) oder aus dem Halten-Menü. ref = Eintrags-ID oder Eintrag.
  var lastBack = null;
  // Blättern im Detail mit Pfeiltasten und Wischen über dem Bild (navNow = offenes Detail).
  var navNow = null;
  var navGo = function (dir) {
    var P = window.casoraPopup, n = navNow && navNow.nav;
    if (!n || !P || !P.current || P.current !== navNow.cfg) return false;
    var id = dir < 0 ? n.newer : n.older;
    if (!id) return false;
    F.detail(n.cam, id, n.back ? lastBack : null);
    return true;
  };
  F.navGo = navGo;
  var recs = new Set();
  var listen = typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document.addEventListener.bind(document) : function () {};
  // Tasten: ←/→ blättern im Detail, Leertaste hält die Aufnahme an. Ziel ist das innerste Element (composedPath) –
  // Video-Bedienelemente, Zeitleiste und Eingabefelder behalten ihre Tasten.
  F.keyTarget = function (ev) {
    var path = ev && ev.composedPath ? ev.composedPath() : [];
    var t0 = path[0] || (ev && ev.target);
    var tag = t0 && t0.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t0 && t0.isContentEditable)) return 'input';
    for (var i = 0; i < path.length; i++) {
      var x = path[i];
      if (!x || !x.tagName) continue;
      if (/^(VIDEO|HA-HLS-PLAYER|HA-CAMERA-STREAM)$/.test(x.tagName) || (x.getAttribute && x.getAttribute('role') === 'slider')) return 'media';
      if (x.tagName === 'BUTTON' || (x.getAttribute && x.getAttribute('role') === 'button')) return 'button';
    }
    return null;
  };
  listen('keydown', function (ev) {
    var k = F.keyTarget(ev);
    if (k === 'input') return;
    if (ev.key === ' ' && k !== 'button') {
      var cur = window.casoraPopup && window.casoraPopup.current;
      var rec = null;
      recs.forEach(function (x) { if (x.isConnected) rec = x; });
      if (rec && cur && cur._frigView === 'rec') { ev.preventDefault(); rec.toggle(); }
      return;
    }
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    if (k === 'media') return;
    if (navGo(ev.key === 'ArrowLeft' ? -1 : 1)) ev.preventDefault();
  });
  var sw0 = null;
  listen('touchstart', function (ev) {
    var path = ev.composedPath ? ev.composedPath() : [];
    var hit = path.some(function (x) { return x && x.hasAttribute && x.hasAttribute('data-frigate-swipe'); });
    sw0 = hit && ev.touches.length === 1 ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY, t: Date.now() } : null;
  }, { passive: true, capture: true });
  listen('touchend', function (ev) {
    if (!sw0 || !ev.changedTouches.length) return;
    var dx = ev.changedTouches[0].clientX - sw0.x, dy = ev.changedTouches[0].clientY - sw0.y, quick = Date.now() - sw0.t < 600;
    sw0 = null;
    if (quick && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) navGo(dx > 0 ? -1 : 1);
  }, { passive: true, capture: true });
  var zoneName = function (z) { var t = String(z || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
  F.zoneName = zoneName;
  // Name der Kamera für Etikett und Dateinamen (wie im Kamera-Popup).
  var camName = function (hass, cam) {
    var st = hass && hass.states && hass.states[cam];
    return String((st && st.attributes && st.attributes.friendly_name) || (info[cam] && info[cam].name) || cam || '');
  };
  F.camName = camName;
  // Zurück zum Kamera-Popup, wenn etwas aus dem Halten-Menü geöffnet wurde: die Kachel antippen (gleiches Popup).
  var camBack = function (cam) {
    if (typeof window._casoraTapTile !== 'function') return null;
    return function () { window._casoraTapTile(cam, function (ok) { if (!ok && window.casoraPopup) window.casoraPopup.close(); }); };
  };
  F.camBack = camBack;
  var WIDE = '--popup-min-width: min(900px, 92vw); --popup-max-width: min(900px, 92vw);';
  // Unterseiten (Detail, Aufnahmen, Laden) im Rahmen des Kamera-Popups: gleiche Ränder wie dessen Inhalt (K.layout),
  // Tippen ins Leere schließt nicht (Weg zurück über ‹ bzw. X).
  var subPage = function (o) {
    var P = window.casoraPopup;
    return Object.assign({ dismiss_on_background: false, head_switch: false, style: WIDE, popup_styles: (P.current || {}).popup_styles }, o);
  };
  var oneCol = function (K, fields) {
    var keys = Object.keys(fields).filter(function (k) { return fields[k] != null && fields[k] !== ''; });
    var f = {};
    keys.forEach(function (k) { f[k] = fields[k]; });
    return K.layout({ fields: f, top: keys, left: [], right: [] });
  };
  // Sofort öffnen mit „Wird geladen …“; der echte Inhalt ersetzt es nur, solange genau dieses Popup noch offen ist.
  var loading = function (title, back, eyebrow) {
    var P = window.casoraPopup, UI = window._casoraUI, K = window._casoraSoftKit;
    if (!P || !UI || !K) return null;
    var tok = { at: Date.now() };
    P.open(subPage({ title: title, eyebrow: eyebrow || '', back: back || null, _frigLoad: tok,
      content: oneCol(K, { l: UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], null) }) }));
    return tok;
  };
  var still = function (tok) { var cur = window.casoraPopup && window.casoraPopup.current; return !tok || !!(cur && cur._frigLoad === tok); };
  F.still = still;
  F.detail = function (cam, ref, back) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    var P = window.casoraPopup, UI = window._casoraUI, K = window._casoraSoftKit;
    if (!hass || !P || !UI || !K || !F.is(hass, cam)) return false;
    var c = F.find(hass, cam);
    var it = typeof ref === 'object' && ref ? (ref.kind ? ref : evItem(ref)) : itemById(cam, ref);
    if (!it) return false;
    if (!back) back = camBack(cam);
    // Blättern wie in Frigate: neuere/ältere Erkennung derselben Liste (Filter gelten mit).
    var all = shown(cam), at = -1;
    for (var k = 0; k < all.length; k++) if (all[k].id === it.id) at = k;
    var isRv = it.kind === 'review';
    if (isRv) F.seen(hass, c, it.id);
    var evId = isRv ? (it.dets[0] || null) : it.id;
    var e0 = evId ? F.eventById(cam, evId) : null;
    var score = it.score != null ? it.score : e0 ? e0.score : null;
    var dur = it.end ? Math.max(1, Math.round((it.end - it.start) / 1000)) : null;
    // Kopf: Titel = Objekt, Statuszeile = Zeitpunkt · Dauer bzw. „Live“ · Art (Alarm/Erkennung). Der Treffer steht unten.
    var kindWord = isRv ? (it.sev === 'alert' ? (deUI() ? 'Alarm' : 'Alert') : 'Erkennung') : null;
    var line = UI.line(stamp(it.start), [dur ? (dur < 60 ? dur + ' s' : Math.round(dur / 60) + ' Min.') : 'Live', kindWord].filter(Boolean));
    var rows = [];
    if (it.zones && it.zones.length) rows.push({ icon: 'mdi:vector-square', iconTone: 'accent', label: it.zones.length > 1 ? 'Zonen' : 'Zone', value: it.zones.map(zoneName).join(', ') });
    var faces = [it.sub].concat(it.subs || []).filter(uniq);
    if (faces.length) rows.push({ icon: 'mdi:face-recognition', iconTone: 'accent', label: 'Gesicht', value: faces.join(', '), valueLit: true });
    // Für Laien: „Sicher erkannt“ statt „Treffer 86 %“; der Wert klein rechts.
    if (score != null) rows.push({ icon: 'mdi:check-decagram-outline', iconTone: 'accent', label: score >= 0.8 ? 'Sicher erkannt' : 'Erkannt', value: Math.round(score * 100) + ' %' });
    if (isRv) rows.push({ icon: 'mdi:email-mark-as-unread', iconTone: 'accent', label: 'Als neu markieren', entity: 'frigate-new:' + cam + '|' + it.id });
    var nb = at > 0 ? all[at - 1] : null, ob = at >= 0 && at < all.length - 1 ? all[at + 1] : null;
    var navRow = function (x, label) {
      return { image: x.thumb || '', imageFit: 'cover', label: label, sub: objLabel(x) + ' · ' + stamp(x.start),
        entity: 'frigate-' + (x.kind === 'review' ? 'rv' : 'ev') + ':' + cam + '|' + x.id + '|' + (back ? 'b' : '') };
    };
    var nav = [];
    if (nb) nav.push(navRow(nb, 'Neuere Erkennung'));
    if (ob) nav.push(navRow(ob, 'Ältere Erkennung'));
    var nm = camName(hass, cam);
    var clipOk = isRv ? !!evId : !!it.clip;
    var media = { type: 'custom:casora-frigate-clip', entity: cam, inst: c.inst, name: c.name, camName: nm, ev: evId, clip: clipOk,
      rv: isRv ? it.id : null, fav: !!it.fav, start: it.start, end: it.end, poster: evId ? F.path(c, 'snap', evId) : null,
      nav: { newer: nb ? nb.id : null, older: ob ? ob.id : null, back: !!back, rv: isRv } };
    var infoHtml = (rows.length ? UI.group(rows, null) : '') + (nav.length ? (rows.length ? '<div style="height:8px"></div>' : '') + UI.group(nav, null) : '');
    lastBack = back || null;
    var cfg = subPage({ title: objLabel(it) + (it.sub ? ' · ' + it.sub : ''), eyebrow: nm, back: back || null, _frigView: 'detail',
      content: oneCol(K, { h: line, m: { card: media }, i: infoHtml }) });
    P.open(cfg);
    navNow = { cfg: P.current || cfg, nav: { cam: cam, newer: nb ? nb.id : null, older: ob ? ob.id : null, back: !!back } };
    return true;
  };
  // Letzter Schnappschuss eines Objekts (Bild-Entität), wenn es keine Ereignisliste gibt.
  F.snapshot = function (imgId, back, title, cam) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass, P = window.casoraPopup, K = window._casoraSoftKit;
    var st = hass && hass.states[imgId];
    if (!st || !P || !K || !st.attributes.entity_picture) return false;
    var m = '<div style="width:100%;aspect-ratio:16/9;max-height:56vh;border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:#000;">'
      + '<img src="' + esc(st.attributes.entity_picture) + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block;"></div>';
    P.open(subPage({ title: title || 'Schnappschuss', eyebrow: cam ? camName(hass, cam) : '', back: back || null, content: oneCol(K, { m: m }) }));
    return true;
  };

  // ── Aufnahmen: Stunde abspielen, Zeitleiste, Ausschnitt herunterladen ─────
  // <casora-frigate-rec> spielt eine Stunde (vod/<kamera>/start/end über HAs HLS-Player mit signierter Unter-Liste;
  // nur als letzter Rückfall MP4 recording/… – das kann nicht springen, die Leiste sagt das dann). Die Leiste zeigt
  // aufgenommene Abschnitte (recordings/get) und Erkennungen (events/get) dieser Stunde; Antippen, Ziehen (Touch,
  // 44 px hoch), Pfeiltasten und die Erkennungs-Punkte springen. Eigene Bedienung (Play/Pause, Leertaste) statt der
  // Leiste des Videos; am Ende geht es in der nächsten Stunde weiter. „Herunterladen“: ab hier 1/5/10 Min.
  var RCSS = PCSS
    + '.ld{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;text-align:center;'
    +   'padding:20px;background:rgba(0,0,0,0.45);color:rgba(255,255,255,0.88);font-size:15px;font-weight:600;}'
    + '.ld[hidden]{display:none;}.ld small{font-size:13px;font-weight:500;opacity:.8;}'
    + '.tl{position:relative;height:44px;margin-top:var(--casora-space-3, 12px);cursor:pointer;touch-action:none;outline:none;'
    +   '-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;}'
    + '.tl.off{cursor:default;}'
    + '.tl:focus-visible .trk{box-shadow:0 0 0 2px var(--casora-popup-accent, var(--casora-color-teal, #4E9E95));}'
    // Lücken als gestreifte Spur, Aufgenommenes deckend in der Bedien-Farbe (≥ 3 : 1).
    + '.trk{position:absolute;left:0;right:0;top:14px;height:16px;border-radius:999px;overflow:hidden;'
    +   'background:repeating-linear-gradient(135deg, var(--casora-soft-control-fill, rgba(140,115,90,0.10)) 0 4px, transparent 4px 8px),'
    +   'var(--casora-soft-row-fill, rgba(140,115,90,0.07));}'
    + '.sg{position:absolute;top:0;bottom:0;background:var(--casora-popup-ui-action, var(--casora-color-teal, #276B64));}'
    + '.dts{position:absolute;inset:0;pointer-events:none;}'
    // Erkennungs-Punkt: 10 px sichtbar, 44 px Tippfläche.
    + '.dt{position:absolute;top:0;width:44px;height:44px;margin-left:-22px;padding:0;border:0;background:none;cursor:pointer;pointer-events:auto;'
    +   '-webkit-tap-highlight-color:transparent;}'
    + '.dt::after{content:"";position:absolute;left:17px;top:5px;width:10px;height:10px;border-radius:50%;'
    +   'background:var(--casora-popup-tiles-text-primary, #3A322B);box-shadow:0 0 0 2px var(--casora-soft-seg-on, #FFFDF9);}'
    + '.dt.al::after{background:var(--casora-color-red, #D35A4E);}'
    + '.tl.off .dt{cursor:default;}'
    + '.ph{position:absolute;top:8px;width:4px;height:28px;margin-left:-2px;border-radius:999px;pointer-events:none;'
    +   'background:var(--casora-popup-tiles-text-primary, var(--primary-text-color, #3A322B));'
    +   'box-shadow:0 0 0 2px var(--casora-soft-seg-on, #FFFDF9);outline:1px solid var(--casora-popup-tiles-text-secondary, rgba(58,50,43,0.6));outline-offset:2px;}'
    + '.tk{display:flex;justify-content:space-between;margin-top:2px;font-size:var(--casora-fs-label, 12px);font-weight:600;'
    +   'font-variant-numeric:tabular-nums;color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));}'
    + '.rw{display:flex;align-items:center;gap:var(--casora-space-3, 12px);margin-top:var(--casora-space-3, 12px);}'
    + '.now{flex:1;min-width:0;font-size:var(--casora-fs-row, 15px);font-weight:700;font-variant-numeric:tabular-nums;'
    +   'color:var(--casora-popup-tiles-text-primary, var(--primary-text-color, #3A322B));}'
    + '.now small{display:block;font-size:var(--casora-fs-sub, 13px);font-weight:500;color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));}'
    + '.rw .b{flex:none;padding:0 20px;}'
    + '.rw .pp{width:46px;padding:0;}'
    + '.cut{display:flex;flex-wrap:wrap;align-items:center;gap:var(--casora-space-2, 8px);margin-top:var(--casora-space-3, 12px);}'
    + '.cut[hidden]{display:none;}'
    + '.cut .lb{font-size:var(--casora-fs-sub, 13px);font-weight:600;margin-right:4px;color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));}'
    + '.cut .b{min-height:40px;padding:0 16px;}';
  if (typeof customElements !== 'undefined' && !customElements.get('casora-frigate-rec')) {
    class FRec extends HTMLElement {
      setConfig(cfg) { this._cfg = cfg || {}; }
      getCardSize() { return 6; }
      set hass(h) { this._hass = h; if (!this._root) this._build(); }
      get hass() { return this._hass; }
      connectedCallback() { this._gone = false; recs.add(this); if (this._hass && !this._root) this._build(); }
      disconnectedCallback() { this._gone = true; recs.delete(this); }
    }
    var RP = FRec.prototype;
    RP._build = function () {
      var cfg = this._cfg || {}, self = this;
      var a = this._a = cfg.start, b = this._b = cfg.start + (cfg.len || 3600);
      var r = this._root = this.attachShadow({ mode: 'open' });
      var tk = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return '<span>' + esc(clock((a + f * (b - a)) * 1000)) + '</span>'; }).join('');
      r.innerHTML = '<style>' + RCSS + '</style>'
        + '<div class="fr"><div class="mt"></div><div class="ld" role="status" aria-live="polite"><span>' + esc(tr('Wird geladen …')) + '</span></div></div>'
        + '<div class="tl" role="slider" tabindex="0" aria-label="' + esc(tr('Zeitleiste')) + '" aria-valuemin="' + a + '" aria-valuemax="' + b
        + '" aria-valuenow="' + a + '" aria-valuetext="' + esc(clock(a * 1000)) + '">'
        + '<div class="trk"><div class="sgs"></div></div><div class="dts"></div><div class="ph" hidden></div></div>'
        + '<div class="tk" aria-hidden="true">' + tk + '</div>'
        + '<div class="rw"><button class="b pp" type="button" aria-label="' + esc(tr('Abspielen')) + '" disabled><ha-icon icon="mdi:play"></ha-icon></button>'
        + '<span class="now"></span>'
        + '<button class="b dl" type="button" aria-expanded="false" disabled><ha-icon icon="mdi:download"></ha-icon><span>' + esc(tr('Herunterladen')) + '</span></button></div>'
        + '<div class="cut" hidden><span class="lb">' + esc(tr('Ab hier:')) + '</span>'
        + [1, 5, 10].map(function (m) { return '<button class="b" type="button" data-min="' + m + '"><span>' + esc(tr(m + ' Min.')) + '</span></button>'; }).join('') + '</div>';
      var tl = r.querySelector('.tl');
      var frac = function (ev) { var rc = tl.getBoundingClientRect(); return rc.width ? (ev.clientX - rc.left) / rc.width : 0; };
      // Popups schließen am Handy beim Wischen – auf der Leiste gehört das Ziehen ihr.
      ['touchstart', 'touchmove'].forEach(function (k) { tl.addEventListener(k, function (ev) { ev.stopPropagation(); }, { passive: true }); });
      tl.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        if (!self._segs || !self._segs.length || self._noSeek) return;
        if (ev.target && ev.target.classList && ev.target.classList.contains('dt')) return;
        self._drag = true;
        try { tl.setPointerCapture(ev.pointerId); } catch (e) { /* egal */ }
        self._head(F.tlTime(frac(ev), a, b));
      });
      tl.addEventListener('pointermove', function (ev) { if (self._drag) self._head(F.tlTime(frac(ev), a, b)); });
      var up = function (ev) {
        if (!self._drag) return;
        self._drag = false;
        window._casoraSuppressDismiss = Date.now() + 400;
        haptic('selection');
        self.seek(F.tlTime(frac(ev), a, b));
      };
      tl.addEventListener('pointerup', up);
      tl.addEventListener('pointercancel', function () { self._drag = false; });
      tl.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var d = ev.target && ev.target.closest && ev.target.closest('.dt');
        if (d && !self._noSeek) { haptic('selection'); self.seek(Number(d.getAttribute('data-t'))); }
      });
      tl.addEventListener('keydown', function (ev) {
        if (self._noSeek) return;
        var t = F.tlKey(ev.key, ev.shiftKey, self._t != null ? self._t : a, a, b);
        if (t == null) return;
        ev.preventDefault(); ev.stopPropagation();
        self._head(t);
        clearTimeout(self._kt);
        self._kt = setTimeout(function () { self.seek(t); }, 250);
      });
      r.querySelector('.pp').addEventListener('click', function (ev) { ev.stopPropagation(); self.toggle(); });
      r.querySelector('.dl').addEventListener('click', function (ev) {
        ev.stopPropagation();
        var cut = r.querySelector('.cut'), open = cut.hidden;
        cut.hidden = !open;
        ev.currentTarget.setAttribute('aria-expanded', open ? 'true' : 'false');
        haptic('light');
      });
      r.querySelectorAll('.cut .b').forEach(function (btn) {
        btn.addEventListener('click', function (ev) { ev.stopPropagation(); self._download(Number(btn.getAttribute('data-min')), btn); });
      });
      this._load();
    };
    RP._c = function () { var cfg = this._cfg || {}; return { cam: cfg.entity, inst: cfg.inst, name: cfg.name }; };
    RP._load = function () {
      var self = this, h = this._hass, c = this._c(), a = this._a, b = this._b;
      if (!h || !h.callWS) return;
      var segP = h.callWS({ type: 'frigate/recordings/get', instance_id: c.inst, camera: c.name, after: a, before: b })
        .then(F.parseSegments).catch(function () { return null; });
      var evP = h.callWS({ type: 'frigate/events/get', instance_id: c.inst, cameras: [c.name], after: a, before: b, limit: 100 })
        .then(F.parse).catch(function () { return []; });
      Promise.all([segP, evP]).then(function (x) {
        if (self._gone && !self.isConnected) return;
        var segs = self._segs = (x[0] || []).map(function (s) { return { s: Math.max(a, s.s), e: Math.min(b, s.e) }; }).filter(function (s) { return s.e > s.s; });
        self._evs = (x[1] || []).filter(function (e) { return e.start / 1000 >= a && e.start / 1000 < b; }).sort(function (p, q) { return p.start - q.start; });
        self._draw();
        if (x[0] == null) { self._msg('Aufnahme nicht abrufbar', 'Frigate antwortet nicht'); return; }
        if (!segs.length) { self._msg('Keine Aufnahme in dieser Stunde'); return; }
        self.seek(F.recStart(self._cfg, segs, self._evs, a, b));
      });
    };
    RP._msg = function (t, sub) {
      var ld = this._root.querySelector('.ld');
      ld.hidden = false;
      ld.innerHTML = '<span>' + esc(tr(t)) + '</span>' + (sub ? '<small>' + esc(tr(sub)) + '</small>' : '');
      this.setAttribute('data-src', 'none');
    };
    RP._draw = function () {
      var r = this._root, a = this._a, b = this._b;
      var pct = function (t) { return (F.tlFrac(t, a, b) * 100).toFixed(3) + '%'; };
      r.querySelector('.sgs').innerHTML = F.recRanges(this._segs).map(function (x) {
        return '<div class="sg" style="left:' + pct(x.s) + ';width:calc(' + pct(x.e) + ' - ' + pct(x.s) + ');"></div>';
      }).join('');
      var al = {};
      var rv = rvc[(this._cfg || {}).entity];
      ((rv && Array.isArray(rv.list) && rv.list) || []).forEach(function (x) { if (x.sev === 'alert') x.dets.forEach(function (d) { al[d] = 1; }); });
      r.querySelector('.dts').innerHTML = (this._evs || []).map(function (e) {
        var lb = F.label(e.o) + ' · ' + clock(e.start);
        return '<button type="button" class="dt' + (al[e.id] ? ' al' : '') + '" data-t="' + (e.start / 1000) + '" aria-label="' + esc(tr(lb)) + '" title="' + esc(tr(lb))
          + '" style="left:' + pct(e.start / 1000) + ';"></button>';
      }).join('');
      var ok = !!(this._segs && this._segs.length);
      r.querySelector('.dl').disabled = !ok;
    };
    // Wiedergabe-Kopf und Uhrzeit (ohne zu springen – das macht seek).
    RP._head = function (t) {
      var r = this._root, ph = r.querySelector('.ph'), tl = r.querySelector('.tl');
      this._t = t;
      ph.hidden = false;
      ph.style.left = (F.tlFrac(t, this._a, this._b) * 100).toFixed(3) + '%';
      var txt = clock(t * 1000, true);
      var now = r.querySelector('.now');
      now.textContent = txt;
      if (this._noSeek) { var sm = document.createElement('small'); sm.textContent = tr('Springen nicht möglich'); now.appendChild(sm); }
      tl.setAttribute('aria-valuenow', String(Math.round(t)));
      tl.setAttribute('aria-valuetext', txt);
    };
    RP.toggle = function () {
      var v = this._video;
      if (!v) return;
      haptic('light');
      try { if (v.paused || v.ended) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); } catch (e) { /* egal */ }
    };
    RP._paintPP = function () {
      var v = this._video, b = this._root.querySelector('.pp');
      var playing = !!(v && !v.paused && !v.ended);
      b.disabled = !v;
      b.querySelector('ha-icon').setAttribute('icon', playing ? 'mdi:pause' : 'mdi:play');
      b.setAttribute('aria-label', tr(playing ? 'Anhalten' : 'Abspielen'));
    };
    RP.seek = function (t) {
      var segs = this._segs || [], self = this;
      var o = F.recOffset(segs, t);
      if (!o) return;
      if (this._noSeek && this._video) return;
      this._head(o.t);
      this.setAttribute('data-t', String(Math.round(o.t)));
      if (this._video) { try { this._video.currentTime = o.off; var p = this._video.play && this._video.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* lädt noch */ } return; }
      if (this._busy) { this._want = o; return; }
      this._busy = true;
      this._want = o;
      var c = this._c(), a = Math.floor(segs[0].s), b = Math.ceil(segs[segs.length - 1].e);
      var r = this._root, ld = r.querySelector('.ld');
      ld.hidden = false;
      this.setAttribute('data-src', 'lädt');
      F.playChain(r.querySelector('.mt'), this._hass, [{ k: 'hls', path: F.path(c, 'vod', a, b) }, { k: 'mp4', path: F.path(c, 'rec', a, b) }],
        { controls: false, muted: true, autoplay: true }, function () { return self.isConnected; })
        .then(function (res) {
          self._busy = false;
          self._video = res.video; self._src = res.k;
          self.setAttribute('data-src', res.k);
          ld.hidden = true;
          var v = res.video;
          v.muted = true;
          try { v.controls = false; } catch (e) { /* egal */ }
          // MP4-Rückfall (Frigate liefert recording/… ohne Bereichsabruf): spielt von vorn, springen geht nicht.
          if (res.k === 'mp4') {
            self._noSeek = true;
            var tl = r.querySelector('.tl');
            tl.classList.add('off'); tl.setAttribute('aria-disabled', 'true');
            self._head(segs[0].s);
          } else { try { v.currentTime = self._want.off; } catch (e) { /* gleich */ } }
          var p = v.play && v.play(); if (p && p.catch) p.catch(function () {});
          v.addEventListener('timeupdate', function () {
            if (self._drag) return;
            var w = F.recAt(self._segs, v.currentTime);
            if (w != null) self._head(w);
          });
          ['play', 'playing', 'pause', 'ended'].forEach(function (k) { v.addEventListener(k, function () { self._paintPP(); }); });
          // Am Ende in der nächsten Stunde weiter (wie ein durchgehendes Video).
          v.addEventListener('ended', function () {
            var nx = (self._cfg || {}).next;
            if (nx && self.isConnected && window.casoraPopup && window.casoraPopup.current && window.casoraPopup.current._frigView === 'rec') {
              F.recView(self._cfg.entity, nx.day, nx.h, recBack, null, { at: 'start' });
            }
          });
          self._paintPP();
        }).catch(function () {
          self._busy = false;
          self._msg('Aufnahme nicht abrufbar', 'Frigate liefert dieses Video nicht');
        });
    };
    // Ausschnitt ab der aktuellen Stelle (1/5/10 Min., höchstens bis zum Ende der Aufnahme) als MP4 aus recording/….
    RP._download = function (min, btn) {
      var segs = this._segs || [], c = this._c(), cfg = this._cfg || {};
      if (!segs.length) return;
      var t = F.cut(segs, this._t != null ? this._t : segs[0].s, min);
      if (!t) return;
      dlWith(btn, this._hass, F.path(c, 'rec', t.a, t.b), F.fileName(cfg.camName || c.name, t.a * 1000, 'mp4'));
    };
    customElements.define('casora-frigate-rec', FRec);
  }
  // Ausschnitt [a, b] in s ab t für min Minuten, in den aufgenommenen Bereich gelegt.
  F.cut = function (segs, t, min) {
    if (!segs || !segs.length) return null;
    var first = Math.floor(segs[0].s), last = Math.ceil(segs[segs.length - 1].e);
    var a = Math.max(first, Math.min(Math.floor(t), last - 1));
    return { a: a, b: Math.min(last, a + Math.max(1, min) * 60) };
  };
  // Startstelle der Aufnahmen-Ansicht: ausdrücklich (at = Sekunde), „end“ = jetzt (Ende der Aufnahme − 60 s), „start“ =
  // Anfang; sonst die erste Erkennung der Stunde (3 s davor), ohne Erkennung in der laufenden Stunde jetzt, sonst der Anfang.
  F.recStart = function (cfg, segs, evs, a, b, now) {
    cfg = cfg || {};
    var s0 = segs[0].s, e1 = segs[segs.length - 1].e;
    if (typeof cfg.at === 'number' && cfg.at >= a && cfg.at < b) return cfg.at;
    if (cfg.at === 'end') return Math.max(s0, e1 - 60);
    if (cfg.at === 'start') return s0;
    if (evs && evs.length) return Math.max(s0, evs[0].start / 1000 - 3);
    var t = (now || Date.now()) / 1000;
    if (t >= a && t < b + 60) return Math.max(s0, e1 - 60);
    return s0;
  };

  // Chip (Filter, Tag, Stunde): Pille 36 hoch + unsichtbar 4 px = 44 Trefferfläche, aktiv hell hinterlegt.
  // o.lit: selbst gewählter Name (Gesicht) – nicht übersetzen; o.icon: Symbol davor; o.expanded: aufklappende Pille.
  var chip = function (mid, label, onc, count, o) {
    o = o || {};
    return '<div role="button" tabindex="0" aria-pressed="' + (onc ? 'true' : 'false') + '" data-casora-mi="' + esc(mid) + '"'
      + (o.expanded != null ? ' aria-expanded="' + (o.expanded ? 'true' : 'false') + '"' : '')
      + ' style="flex:none;position:relative;min-height:36px;padding:0 14px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;'
      + 'font-size:var(--casora-fs-sub, 13px);font-weight:700;white-space:nowrap;margin-block:4px;'
      + (onc ? 'background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, #3A322B);box-shadow:var(--casora-soft-seg-on-shadow, none);'
        : 'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));color:var(--casora-popup-tiles-text-primary, #3A322B);') + '">'
      + (o.icon ? '<ha-icon icon="' + esc(o.icon) + '" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;pointer-events:none;"></ha-icon>' : '')
      + (o.lit ? '<span data-no-i18n style="pointer-events:none;">' + esc(label) + '</span>' : '<span style="pointer-events:none;">' + esc(T(label)) + '</span>')
      + (count ? '<span style="pointer-events:none;min-width:20px;height:20px;padding:0 6px;box-sizing:border-box;border-radius:999px;display:inline-flex;'
        + 'align-items:center;justify-content:center;font-size:var(--casora-fs-label, 12px);font-variant-numeric:tabular-nums;'
        + 'background:' + (o.countBg || 'var(--casora-popup-ui-action, #276B64)') + ';color:var(--casora-popup-ui-on-action, #fff);">' + esc(count) + '</span>' : '')
      + '</div>';
  };
  var CHIP_CSS = '<style>.frig-chips{display:flex;flex-wrap:nowrap;gap:var(--casora-space-2, 8px);overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;'
    + 'margin:0;padding:0 2px;font-family:var(--primary-font-family, system-ui);min-width:0;'
    // Weicher Auslauf rechts: man sieht, dass es weitergeht (keine harte Kante).
    + '-webkit-mask-image:linear-gradient(to right, black calc(100% - 24px), transparent);mask-image:linear-gradient(to right, black calc(100% - 24px), transparent);}'
    + '.frig-chips::-webkit-scrollbar{display:none;}'
    + '.frig-chips>[role=button]::before,.frig-fx::before{content:"";position:absolute;inset:-4px 0;}'
    + '.frig-head{display:flex;align-items:flex-start;gap:var(--casora-space-3, 12px);}'
    + '.frig-head>.frig-fx{margin-top:-7px !important;}'
    // Auslauf rechts nur, solange dort noch etwas verborgen ist (F.fixChips setzt .ov).
    + '.frig-chips:not(.ov){-webkit-mask-image:none;mask-image:none;}'
    + '@media (max-width:760px){.frig-chips>[role=button]{padding:0 12px !important;}}'
    + '.frig-fg{margin-top:var(--casora-space-2, 8px);}'
    + '.frig-fl{font-size:var(--casora-fs-label, 12px);font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin:0 2px 2px;'
    +   'color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));}'
    + '.frig-act{display:flex;align-items:center;gap:6px;margin:var(--casora-space-2, 8px) 2px 0;font-size:var(--casora-fs-sub, 13px);font-weight:600;'
    +   'color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));}'
    + '.frig-act [role=button]{position:relative;cursor:pointer;font-weight:700;color:var(--casora-popup-ui-action, #276B64);}'
    + '.frig-act [role=button]::before{content:"";position:absolute;inset:-12px -8px;}'
    + '.frig-note{margin:var(--casora-space-2, 8px) 2px 0;font-size:var(--casora-fs-sub, 13px);font-weight:500;line-height:1.35;'
    +   'color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));}'
    + '.frig-strip{display:flex;gap:2px;}'
    + '.frig-strip>div{flex:1;position:relative;height:44px;min-width:0;}'
    + '.frig-strip>[role=button]{cursor:pointer;-webkit-tap-highlight-color:transparent;}'
    + '.frig-strip i{position:absolute;left:0;right:0;top:14px;bottom:14px;border-radius:999px;background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));}'
    + '.frig-strip b{position:absolute;left:50%;top:4px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--casora-popup-tiles-text-primary, #3A322B);}'
    + '.frig-strip [aria-pressed=true] i{outline:2px solid var(--casora-popup-tiles-text-primary, #3A322B);outline-offset:1px;}'
    + '.frig-ticks{display:flex;justify-content:space-between;font-size:var(--casora-fs-label, 12px);font-weight:600;font-variant-numeric:tabular-nums;'
    +   'color:var(--casora-popup-tiles-text-secondary, var(--secondary-text-color));margin:0 0 var(--casora-space-2, 8px);}'
    + '</style>';
  var chipRow = function (groups, row) {
    var g = groups.filter(function (x) { return x && x.length; });
    if (!g.length) return '';
    // Eine Reihe, waagerecht scrollbar, ohne Leiste; Stand je Reihe bleibt beim Neuzeichnen (data-row, F.fixChips).
    return '<div class="frig-chips" data-row="' + esc(row || '') + '" data-casora-nodismiss="">' + g.map(function (x) { return x.join(''); }).join('') + '</div>';
  };
  F.chipRow = chipRow;
  // Reihen-Stand merken/wiederherstellen und den aktiven Chip ins Bild holen (nur waagerecht, ohne die Seite zu bewegen).
  var rowPos = {};
  var findAll = function (root, sel, d, out) {
    out = out || [];
    if (!root || d > 10) return out;
    if (root.querySelectorAll) root.querySelectorAll(sel).forEach(function (x) { out.push(x); });
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) findAll(all[i].shadowRoot, sel, d + 1, out);
    return out;
  };
  var chipRoots = function () {
    var P = window.casoraPopup, el = P && P.element;
    return el && el.shadowRoot ? findAll(el.shadowRoot, '.frig-chips', 0) : [];
  };
  F.saveChips = function () { chipRoots().forEach(function (r) { var k = r.getAttribute('data-row'); if (k) rowPos[k] = r.scrollLeft; }); };
  F.fixChips = function () {
    chipRoots().forEach(function (r) {
      var k = r.getAttribute('data-row');
      if (k && rowPos[k] != null) r.scrollLeft = rowPos[k];
      var more = function () { r.classList.toggle('ov', r.scrollLeft + r.clientWidth < r.scrollWidth - 2); };
      if (!r._frigS) { r._frigS = true; r.addEventListener('scroll', more, { passive: true }); }
      more();
      var on = r.querySelector('[aria-pressed="true"]');
      if (!on || r.scrollWidth <= r.clientWidth) return;
      var l = on.offsetLeft - r.offsetLeft, w = on.offsetWidth;
      if (l < r.scrollLeft) r.scrollLeft = Math.max(0, l - 8);
      else if (l + w > r.scrollLeft + r.clientWidth - 24) r.scrollLeft = l + w - r.clientWidth + 32;
      more();
    });
  };
  var fixSoon = function () { [30, 120, 300, 700].forEach(function (ms) { setTimeout(F.fixChips, ms); }); };

  // Aufnahmen-Ansicht: Kopf (Tag · Stunde), Wiedergabe mit Zeitleiste, Tagesstreifen, Tage und Stunden als Chips.
  // o: { now: true } = Halten „Aufnahmen“ (jetzt), { at } = Startstelle. Ohne Übersicht sofort „Wird geladen …“ (A8).
  var recBack = null;
  F.recDefault = function (d, hour, now) {
    if (!d || !d.hours.length) return null;
    var h = d.hours.filter(function (x) { return x.h === hour; })[0];
    if (h) return h;
    if (now) return d.hours[d.hours.length - 1];
    var withDet = d.hours.filter(function (x) { return x.n > 0; });
    return withDet.length ? withDet[withDet.length - 1] : d.hours[d.hours.length - 1];
  };
  F.recView = function (cam, day, hour, back, tries, o) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    var P = window.casoraPopup, UI = window._casoraUI, K = window._casoraSoftKit;
    if (!hass || !P || !UI || !K || !F.is(hass, cam)) return false;
    o = o || {};
    var c = F.find(hass, cam);
    var nm = camName(hass, cam);
    var sum = recc[cam] && recc[cam].list;
    if (!Array.isArray(sum) && !(recc[cam] && recc[cam].list === false && !recc[cam].busy) && (tries || 0) <= 24) {
      if (!tries) o.tok = loading('Aufnahmen', back, nm);
      else if (!still(o.tok)) return false;
      F.recSummary(hass, c, null);
      setTimeout(function () { F.recView(cam, day, hour, back, (tries || 0) + 1, o); }, 250);
      return true;
    }
    if (o.tok && !still(o.tok)) return false;
    var days = Array.isArray(sum) ? sum : [];
    var d = days.filter(function (x) { return x.day === day; })[0] || days[0];
    var f = {};
    if (!d) {
      f.h = UI.line('Keine Aufnahmen', []);
      f.d = UI.group([{ icon: 'mdi:filmstrip-box-multiple', label: 'Frigate hat keine Aufnahmen dieser Kamera',
        sub: Array.isArray(sum) ? 'Aufnahme in den Einstellungen einschalten' : 'Liste über die Frigate-Integration nicht abrufbar' }], null);
    } else {
      var hr = F.recDefault(d, hour, o.now);
      var len = F.hourSpan(d.day, hr.h);
      var a = sec0(dayStart(d.day, hr.h));
      f.h = UI.line(dayName(d.day) + ' · ' + hourRange(a, a + len),
        [hrs(hr.dur), hr.n ? (hr.n === 1 ? '1 Erkennung' : hr.n + ' Erkennungen') : null].filter(Boolean));
      // Nächste Stunde mit Aufnahme (auch am nächsten Tag) – die Wiedergabe läuft dort weiter.
      var ix = d.hours.indexOf(hr), next = null;
      if (ix >= 0 && ix < d.hours.length - 1) next = { day: d.day, h: d.hours[ix + 1].h };
      else {
        var di = days.indexOf(d);
        if (di > 0 && days[di - 1].hours.length) next = { day: days[di - 1].day, h: days[di - 1].hours[0].h };
      }
      var at = o.now ? 'end' : o.at != null ? o.at : null;
      f.m = { card: { type: 'custom:casora-frigate-rec', entity: cam, inst: c.inst, name: c.name, camName: nm, start: a, len: len, at: at, next: next } };
      var dayChips = days.slice(0, 7).map(function (x) { return chip('frigate-rec:' + cam + '|' + x.day, dayName(x.day), x.day === d.day); });
      // Tagesstreifen: 24 Stunden, Aufnahme deckend (je nach Anteil), Punkt = Erkennungen; Antippen wählt die Stunde.
      var byH = {};
      d.hours.forEach(function (x) { byH[x.h] = x; });
      var cells = [];
      for (var h = 0; h < 24; h++) {
        var x = byH[h];
        var fill = x ? 'background:var(--casora-popup-ui-action, #276B64);opacity:' + Math.max(0.45, Math.min(1, x.dur / 3600)).toFixed(2) + ';' : '';
        cells.push(x ? '<div role="button" tabindex="0" aria-pressed="' + (h === hr.h ? 'true' : 'false') + '" aria-label="' + esc(T(hourName(d.day, h))) + '"'
          + ' data-casora-mi="frigate-rec:' + esc(cam + '|' + d.day + '|' + h) + '"><i style="' + fill + '"></i>' + (x.n ? '<b></b>' : '') + '</div>'
          : '<div aria-hidden="true"><i></i></div>');
      }
      var ticks = [0, 6, 12, 18, 24].map(function (h2) { return '<span>' + esc(h2 === 24 ? '24' : String(h2)) + '</span>'; }).join('');
      var strip = '<div class="frig-strip" role="group" aria-label="' + esc(T(dayName(d.day))) + '" data-casora-nodismiss="">' + cells.join('') + '</div>'
        + '<div class="frig-ticks" aria-hidden="true">' + ticks + '</div>';
      // Stunden aufsteigend in einer Reihe; die gewählte wird ins Bild geholt.
      var hourChips = d.hours.map(function (x) { return chip('frigate-rec:' + cam + '|' + d.day + '|' + x.h, hourName(d.day, x.h), x.h === hr.h, x.n || null); });
      f.d = CHIP_CSS + (UI.label ? UI.label('Tag') : '') + chipRow([dayChips], 'rec-day') + '<div style="height:12px"></div>'
        + (UI.label ? UI.label(deUI() ? 'Stunde' : 'Hour') : '') + strip + chipRow([hourChips], 'rec-hour');
    }
    recBack = back || null;
    P.open(subPage({ title: 'Aufnahmen', eyebrow: nm, back: back || null, _frigView: 'rec', content: oneCol(K, f) }));
    fixSoon();
    return true;
  };

  // Zeilen im Popup tragen eine Schein-Entität (data-casora-mi): frigate-ev:<kamera>|<id>, frigate-rv:<kamera>|<review>,
  // frigate-img:<bild>, frigate-go:<wohin>, frigate-flt/-f (Filter, Werte mit encodeURIComponent), frigate-fx (Filter
  // auf/zu), frigate-more, frigate-rec:<kamera>|<tag>[|<stunde>], frigate-new (als neu), frigate-seenall.
  var backHere = function () {
    var cur = window.casoraPopup && window.casoraPopup.current;
    return cur ? function () { window.casoraPopup.open(cur); } : null;
  };
  var setF = function (cam, key, val) {
    var f = flt(cam);
    if (key === 'reset') { flts[cam] = F0(); return; }
    // „Zurücksetzen“ unter den Chips: nur, was im Bereich „Filter“ steht (die Art oben bleibt sichtbar gewählt).
    if (key === 'clear') { Object.assign(f, { range: 'week', fav: false, o: null, zone: null, face: null }); return; }
    if (key === 'kind') f.kind = f.kind === val ? '' : (val || '');
    else if (key === 'range') f.range = val === 'today' ? 'today' : 'week';
    else if (key === 'fav') f.fav = !f.fav;
    else if (key === 'o' || key === 'zone' || key === 'face') f[key] = f[key] === val || !val ? null : val;
  };
  F.setFilter = setF;
  var afterFilter = function (cam, scroll) {
    more[cam] = false;
    F.saveChips();
    redraw(cam);
    fixSoon();
    // Am Handy steht die Liste über „Objekte“: nach dem Filtern über die Objekt-Zeile dorthin.
    if (scroll && window.innerWidth <= 760) setTimeout(function () { var w = (els[cam] || []).filter(function (x) { return x.isConnected; })[0]; if (w && w.scrollIntoView) w.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 120);
  };
  var dec = function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } };
  F.enc = function (x) { return encodeURIComponent(String(x == null ? '' : x)); };
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var m = /^frigate-(ev|rv|img|go|flt|fx|f|more|rec|new|seenall):(.*)$/.exec(String(mid || ''));
    if (!m) return false;
    var p = m[2].split('|');
    // Blättern im Detail: dasselbe „zurück“ wie das erste Detail (nicht Detail für Detail zurück).
    if (m[1] === 'ev' || m[1] === 'rv') return F.detail(p[0], p[1], p[2] === 'b' ? lastBack : (p.length > 2 ? null : backHere()));
    if (m[1] === 'img') return F.snapshot(m[2], backHere());
    if (m[1] === 'flt') { setF(p[0], 'o', dec(p[1] || '') || null); afterFilter(p[0], true); return true; }
    if (m[1] === 'fx') { fopen[p[0]] = !fopen[p[0]]; F.saveChips(); redraw(p[0]); fixSoon(); return true; }
    if (m[1] === 'f') { setF(p[0], p[1], dec(p[2] || '')); afterFilter(p[0]); return true; }
    if (m[1] === 'more') { more[p[0]] = !more[p[0]]; redraw(p[0]); return true; }
    if (m[1] === 'rec') {
      // Aus dem Kamera-Popup: ‹ zurück dorthin; innerhalb der Aufnahmen bleibt dasselbe Zurück.
      var cur = window.casoraPopup && window.casoraPopup.current;
      var inRec = cur && cur._frigView === 'rec';
      if (inRec) F.saveChips();
      return F.recView(p[0], p[1], p.length > 2 ? parseInt(p[2], 10) : null, inRec ? recBack : backHere());
    }
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    if (m[1] === 'new') {
      if (!hass || !F.is(hass, p[0])) return false;
      F.mark(hass, F.find(hass, p[0]), [p[1]], false);
      // Zurück in die Liste (dort steht es wieder als „Neu“).
      if (lastBack) lastBack(); else if (window.casoraPopup) window.casoraPopup.close();
      return true;
    }
    if (m[1] === 'seenall') {
      if (!hass || !F.is(hass, p[0])) return false;
      var c = F.find(hass, p[0]);
      var ask = window.casoraAsk ? window.casoraAsk({ title: T('Alle als gesehen markieren?'), text: T('Danach steht nichts mehr als „Neu“ da.'), yes: T('Markieren') })
        : Promise.resolve(window.confirm(T('Alle als gesehen markieren?')));
      ask.then(function (ok) { if (ok) { haptic('light'); F.seenAll(hass, c); } });
      return true;
    }
    var w = m[2];
    go(/^https?:\/\//.test(w) ? { url: w } : { path: w });
    return true;
  });

  // Kopf-Kachel: Rot, solange etwas erkannt wird (Sicherheit), sonst Sand (Ruhe) – vorher blieb der Kopf rot,
  // weil die Kamera „recording“ meldet. In den Aufnahmen immer Ruhe (dort geht es nicht um „jetzt“).
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_frigate\b/.test(key) || !src || !src._stateObj) return null;
    var cur = window.casoraPopup && window.casoraPopup.current;
    if (cur && cur._frigView === 'rec') return { off: true };
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
    var cur = window.casoraPopup && window.casoraPopup.current;
    if (cur && cur._frigView) return false;
    var id = src._stateObj && src._stateObj.entity_id;
    if (!F.is(hass, id)) return null;
    var d = F.find(hass, id).sw.detect;
    if (!d) return false;
    return { entities: [d], label: 'Objekterkennung', color: 'var(--casora-popup-ui-action, #276B64)',
      toggle: function (onv, ids, h) {
        var run = function () { return h.callService('switch', onv ? 'turn_off' : 'turn_on', {}, { entity_id: d }); };
        if (!onv) { run(); return; }
        var ask = window.casoraAsk ? window.casoraAsk({ title: T('Objekterkennung'), text: T('Objekterkennung ausschalten?'), yes: T('Ausschalten') })
          : Promise.resolve(window.confirm(T('Objekterkennung ausschalten?')));
        ask.then(function (ok) { if (ok) run(); });
      } };
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  F.popup = function (entity, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var id = entity && entity.entity_id;
    if (!id) return empty;
    // Jedes Öffnen beginnt bei „Alle · 7 Tage“ (ein hängender Filter versteckte sonst neue Alarme).
    flts[id] = F0(); fopen[id] = false; more[id] = false;
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
      rec: { card: K.secCard(watch, call('rec'), states) },
      objs: { card: K.secCard(watch, call('objs'), states) },
      ev: { card: K.secCard(watch, call('ev'), states) }, sys: { card: K.secCard(watch, call('sys'), states) } };
    if (F.sec('ctl', c, states || {}, hass)) f.more = { card: K.secCard(watch, call('ctl'), states) };
    // Live-Bild links, darunter die Aufnahmen der letzten Tage und die Objekte; rechts gleich die Alarme/Erkennungen
    // (mit Filtern); die Technik-Schalter stehen unten über beide Spalten unter „Einstellungen“.
    return K.layout({ fields: f, top: ['hero'], left: ['live', 'rec', 'objs'], right: ['ev', 'sys', 'more'],
      narrowOrder: ['live', 'ev', 'rec', 'objs', 'sys', 'more'] });
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
  var reg = function (c, el, hass) {
    if (!el) return;
    els[c.cam] = (els[c.cam] || []).filter(function (w) { return w.isConnected; });
    if (els[c.cam].indexOf(el) < 0) els[c.cam].push(el);
    hold(el, c, hass, 'pop');
  };
  // Neuester Eintrag der Liste (ohne Filter) – Kopf und Objekt-Zeiten passen so zur Liste.
  var newest = function (cam, o) {
    var l = F.items(cam, true).list || [];
    for (var i = 0; i < l.length; i++) if (!o || (l[i].objs || [l[i].o]).indexOf(o) >= 0) return l[i];
    return null;
  };
  F.newest = newest;

  F.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var S = states || {}, now = Date.now();
    var s = F.status(c, S, now);
    if (part === 'hero') {
      var main, rest = [], tone = null;
      var nw = newest(c.cam);
      if (s.dead) main = 'Offline';
      else if (s.off) main = 'Kamera aus';
      else if (s.detectOff) { main = 'Objekterkennung aus'; tone = 'warn'; }
      else if (s.live.length) { main = who(s.live); tone = 'bad'; }
      else if (s.unseen) {
        main = newAlerts(s.unseen); tone = 'bad';
        var na = (rvc[c.cam] && Array.isArray(rvc[c.cam].list) ? rvc[c.cam].list : []).filter(function (r) { return r.sev === 'alert' && r.seen === false; })[0];
        if (na) rest.push(F.ago(na.start, now));
      }
      // Wie die Liste: „Auto · vor 4 Min.“ (der neueste Eintrag), sonst der letzte Schnappschuss.
      else if (nw) { main = objLabel(nw); rest.push(F.ago(nw.start, now)); }
      else if (s.last) { main = F.label(s.last.o); rest.push(F.ago(s.last.at, now)); }
      else main = 'Keine Erkennung';
      // Nur die Ausnahme: „Aufnahme aus“ (an ist der Normalfall; am Handy brach der Kopf sonst dreizeilig um).
      if (!s.dead && s.rec === false) rest.push('Aufnahme aus');
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
      var ilist = F.items(c.cam, true).list, start = new Date(now); start.setHours(0, 0, 0, 0);
      var orows = c.order.map(function (o) {
        var x = s.objs[o] || {};
        var today = ilist ? ilist.filter(function (e) { return (e.objs || [e.o]).indexOf(o) >= 0 && e.start >= start.getTime(); }).length : null;
        var nwo = newest(c.cam, o);
        var at = nwo ? nwo.start : x.at;
        var sub = x.live ? (x.n > 1 ? x.n + ' im Bild' : 'Gerade im Bild') : at ? 'Zuletzt ' + F.ago(at, now) : 'Noch nicht erkannt';
        var img = c.objs[o].img;
        // Antippen filtert die Liste auf dieses Objekt (sichtbar: „1 Filter aktiv · Zurücksetzen“); ohne Liste der letzte
        // Schnappschuss.
        var tap = ilist && ilist.length ? 'frigate-flt:' + c.cam + '|' + F.enc(o) : (img && S[img] && S[img].attributes.entity_picture && x.at ? 'frigate-img:' + img : null);
        return { icon: F.icon(o), iconTone: x.live ? 'bad' : at ? 'accent' : null, label: F.label(o), sub: sub,
          selected: flt(c.cam).o === o, value: today ? today + ' heute' : null, entity: tap };
      });
      return UI.group(orows, 'Objekte');
    }
    if (part === 'ev') return secEv(UI, c, S, hass, el, now);
    if (part === 'rec') return secRec(UI, c, S, hass, el, now);
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

  // Alarme/Erkennungen (Reviews) bzw. Ereignisse: oben EINE Reihe mit der Art (Alle · Alarme · Erkennungen · Neu n),
  // dahinter die Pille „Filter“ (mit Zähler), die die übrigen Filter aufklappt – je Gruppe eine beschriftete Reihe:
  // Zeitraum, Favoriten, Objekte, Zonen, Gesichter. Gesetzte Filter stehen sichtbar über der Liste („2 Filter aktiv ·
  // Zurücksetzen“), auch wenn der Bereich zu ist.
  var secEv = function (UI, c, S, hass, el, now) {
    reg(c, el, hass);
    var cam = c.cam, f = flt(cam);
    var rv = F.reviews(hass, c, el);
    F.events(hass, c, el);
    if (f.fav) F.favs(hass, c, el);
    var x = F.items(cam), mode = x.mode;
    // Reviews noch unterwegs: einen Moment „Wird geladen …“ (nicht erst die Ereignisse, dann umspringen).
    if (rv == null && rvc[cam] && rvc[cam].busy) { x = { mode: null, list: null }; mode = null; }
    var all = x.list, list = all ? F.pick(all, f, now) : null;
    var src = F.items(cam, true).list || all || [];
    var kinds = [], zones = [], faces = [], noFace = false;
    src.forEach(function (it) {
      (it.objs || [it.o]).forEach(function (o) { if (kinds.indexOf(o) < 0) kinds.push(o); });
      (it.zones || []).forEach(function (z) { if (zones.indexOf(z) < 0) zones.push(z); });
      var nn = [it.sub].concat(it.subs || []).filter(Boolean);
      nn.forEach(function (n) { if (faces.indexOf(n) < 0) faces.push(n); });
      if (!nn.length && (it.objs || [it.o]).indexOf('person') >= 0) noFace = true;
    });
    var base = 'frigate-f:' + cam + '|';
    var nNew = mode === 'review' ? F.unseen(cam) : 0;
    var nF = F.fcount(f);
    var chips = '', head = UI.label ? UI.label('Letzte Erkennungen') : '';
    if (all || nF || f.kind) {
      var kindG = [];
      if (mode === 'review' || f.kind) {
        kindG.push(chip(base + 'kind|', 'Alle', !f.kind), chip(base + 'kind|alert', 'Alarme', f.kind === 'alert'),
          chip(base + 'kind|detection', 'Erkennungen', f.kind === 'detection'),
          chip(base + 'kind|unseen', 'Neu', f.kind === 'unseen', nNew || null, { countBg: 'var(--casora-color-red-text, var(--casora-color-red, #D35A4E))' }));
      }
      var fx = chip('frigate-fx:' + cam, nF ? 'Filter · ' + nF : 'Filter', !!fopen[cam], null, { icon: 'mdi:filter-variant', expanded: !!fopen[cam] })
        .replace('style="flex:none;position:relative;', 'class="frig-fx" style="flex:none;position:relative;');
      // Pille „Filter“ rechts neben der Überschrift – so hat die Art-Reihe am Handy die ganze Breite (Neu bleibt sichtbar).
      head = '<div class="frig-head"><div style="flex:1;min-width:0;">' + (UI.label ? UI.label('Letzte Erkennungen') : '') + '</div>' + fx + '</div>';
      chips = kindG.length ? chipRow([kindG], 'kind') : '';
      if (fopen[cam]) {
        var grp = function (label, row, items) { return items.length ? '<div class="frig-fg"><div class="frig-fl">' + esc(T(label)) + '</div>' + chipRow([items], row) + '</div>' : ''; };
        chips += grp('Zeitraum', 'range', [chip(base + 'range|today', 'Heute', f.range === 'today'), chip(base + 'range|week', '7 Tage', f.range !== 'today')])
          + grp('Favoriten', 'fav', [chip(base + 'fav|', 'Nur Favoriten', !!f.fav, null, { icon: f.fav ? 'mdi:star' : 'mdi:star-outline' })])
          + grp('Objekte', 'o', kinds.length > 1 || f.o ? kinds.map(function (o) { return chip('frigate-flt:' + cam + '|' + F.enc(o), F.label(o), f.o === o); }) : [])
          + grp('Zonen', 'zone', zones.map(function (z) { return chip(base + 'zone|' + F.enc(z), zoneName(z), f.zone === z); }))
          + grp('Gesichter', 'face', faces.length ? faces.map(function (n) { return chip(base + 'face|' + F.enc(n), n, f.face === n, null, { lit: true }); })
            .concat(noFace ? [chip(base + 'face|' + F.enc(NOFACE), 'Unbekannt', f.face === NOFACE)] : []) : []);
      }
      if (nF) {
        chips += '<div class="frig-act"><span>' + esc(T(nF === 1 ? '1 Filter aktiv' : nF + ' Filter aktiv')) + '</span><span aria-hidden="true">·</span>'
          + '<span role="button" tabindex="0" data-casora-mi="' + esc(base + 'clear|') + '">' + esc(T('Zurücksetzen')) + '</span></div>';
      }
      // Was „Alarme“ heißt (für Laien), solange der Chip gewählt ist.
      if (f.kind === 'alert') chips += '<div class="frig-note">' + esc(T('Alarme: wichtige Erkennungen, z. B. eine Person in einer Zone')) + '</div>';
      chips = CHIP_CSS + chips;
    }
    var top = head + (chips ? chips + '<div style="height:8px"></div>' : '');
    var job = (mode === 'event' ? evc[cam] : f.fav ? fvc[cam] : rvc[cam]) || {};
    var out;
    if (!list) out = top + UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], null);
    else if (!list.length) {
      var any = f.kind || nF;
      var err = job.err && !(job.list && job.list.length) && mode === 'event';
      var empty = err ? 'Frigate antwortet nicht'
        : f.fav && !f.kind && nF === 1 ? 'Keine Favoriten'
          : f.o && !f.kind && nF === 1 + (f.range === 'today' ? 1 : 0) ? 'Keine ' + F.label(f.o) + (f.range === 'today' ? ' heute' : ' in den letzten 7 Tagen')
            : f.kind === 'unseen' && !nF ? 'Nichts Neues'
              : any ? 'Nichts gefunden' : 'Keine Erkennungen in den letzten 7 Tagen';
      out = top + UI.group([{ icon: err ? 'mdi:alert-circle-outline' : any ? 'mdi:filter-off-outline' : 'mdi:check', iconTone: err ? 'warn' : null, label: empty,
        sub: err ? 'Liste über die Frigate-Integration nicht abrufbar' : f.fav && nF === 1 && !f.kind ? 'Im Detail einer Erkennung „Favorit“ antippen' : any ? 'Filter ändern oder zurücksetzen' : null }], null);
      if (any && !err) out += pill('Filter zurücksetzen', base + 'reset|');
    } else {
      var max = more[cam] ? 30 : 8;
      var erows = list.slice(0, max).map(function (it) {
        var dw = dayWord(it.start, now);
        // Treffer-Prozent nur im Detail – am Handy verdrängte es die Zone.
        var sub = dw ? [dw, clock(it.start)] : [clock(it.start), F.ago(it.start, now)];
        if (it.zones && it.zones.length) sub.push(it.zones.map(zoneName).join(', '));
        var liveNow = it.end == null;
        // „Neu“ nur für ungesehene Alarme (zählt wie Chip, Kopf und Kachel), in einer Farbe: Schrift-Rot wie die Klingel.
        var fresh = it.seen === false && it.sev === 'alert';
        return { image: it.thumb || '', imageFit: 'cover', iconTone: null,
          label: objLabel(it) + (it.sub ? ' · ' + it.sub : '') + (it.fav ? ' ★' : ''),
          sub: sub.join(' · '), value: liveNow ? 'Live' : fresh ? 'Neu' : null,
          valueTone: liveNow || fresh ? RED_TEXT : null,
          entity: 'frigate-' + (it.kind === 'review' ? 'rv' : 'ev') + ':' + cam + '|' + it.id };
      });
      out = top + UI.group(erows, null);
      // „Mehr anzeigen“ als Pille unter der Liste wie „Ganzer Verlauf“ im Mähroboter-Popup.
      if (list.length > 8) out += pill(more[cam] ? 'Weniger anzeigen' : 'Mehr anzeigen', 'frigate-more:' + cam);
    }
    // Power-User: alle ungesehenen auf einmal als gesehen (mit Rückfrage).
    var anyNew = mode === 'review' && rvc[cam] && Array.isArray(rvc[cam].list) && rvc[cam].list.some(function (r) { return r.seen === false; });
    if (anyNew && list && list.length) out += pill('Alle als gesehen markieren', 'frigate-seenall:' + cam);
    // Weg zur Frigate-Oberfläche (die Aufnahmen stehen im eigenen Abschnitt).
    var ui = F.ui(hass, c);
    var links = [];
    if (ui) links.push({ icon: 'mdi:open-in-new', iconTone: 'accent', label: 'In Frigate öffnen', entity: 'frigate-go:' + (ui.url || ui.path) });
    if (el) setTimeout(F.fixChips, 30);
    return out + (links.length ? '<div style="height:8px"></div>' + UI.group(links, null) : '');
  };

  // Aufnahmen der letzten Tage (recordings/summary): je Tag eine Zeile, Antippen öffnet Wiedergabe und Zeitleiste;
  // darunter wie bisher der Weg in HAs Medien.
  var secRec = function (UI, c, S, hass, el, now) {
    reg(c, el, hass);
    var sum = F.recSummary(hass, c, el);
    var media = F.media(hass);
    var foot = media ? [{ icon: 'mdi:folder-play-outline', iconTone: 'accent', label: 'Alle Aufnahmen', sub: 'In den Medien von Home Assistant', entity: 'frigate-go:' + media }] : [];
    var rows = [];
    if (Array.isArray(sum)) {
      rows = sum.slice(0, 3).map(function (d) {
        var dur = d.hours.reduce(function (x, h) { return x + h.dur; }, 0);
        return { icon: 'mdi:filmstrip-box-multiple', iconTone: 'accent', label: dayName(d.day, now),
          sub: hrs(dur) + ' aufgenommen' + (d.n ? ' · ' + (d.n === 1 ? '1 Erkennung' : d.n + ' Erkennungen') : ''),
          entity: 'frigate-rec:' + c.cam + '|' + d.day };
      });
      if (!rows.length) rows = [{ icon: 'mdi:filmstrip-box-multiple', label: 'Keine Aufnahmen', sub: c.sw.recordings ? 'Aufnahme unter „Einstellungen“ einschalten' : null }];
    } else if (sum == null && recc[c.cam] && recc[c.cam].busy) {
      rows = [{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }];
    }
    if (!rows.length && !foot.length) return '';
    return UI.group(rows.concat(foot), 'Aufnahmen');
  };

  // Letzte Erkennung groß (Halten-Menü): die neueste Review (bevorzugt mit dem zuletzt erkannten Objekt) – geöffnet gilt
  // sie als gesehen; ohne Reviews das Ereignis, ohne Liste der Schnappschuss der Bild-Entität („Auto · 23:30“).
  // Öffnet sofort mit „Wird geladen …“ und ersetzt es nur, solange es noch offen ist (A8).
  F.whenLoaded = function (hass, c, ms) {
    var t0 = Date.now();
    F.reviews(hass, c, null); F.events(hass, c, null);
    return new Promise(function (res) {
      var look = function () {
        var busy = (rvc[c.cam] && rvc[c.cam].busy) || (evc[c.cam] && evc[c.cam].busy);
        if (!busy || Date.now() - t0 > (ms || 8000)) { res(); return; }
        setTimeout(look, 120);
      };
      look();
    });
  };
  F.latest = function (hass, c, o, img, at) {
    var back = camBack(c.cam);
    var fall = function () { if (!(img && F.snapshot(img, back, F.label(o) + ' · ' + stamp(at), c.cam)) && window.casoraPopup) window.casoraPopup.close(); };
    if (!hass || !hass.callWS) { fall(); return; }
    var tok = loading('Letzte Erkennung', back, camName(hass, c.cam));
    F.whenLoaded(hass, c).then(function () {
      if (!still(tok)) return;
      var it = (o && newest(c.cam, o)) || newest(c.cam);
      if (!it || !F.detail(c.cam, it.kind === 'review' ? it.id : it, back)) fall();
    });
  };

  // ── Halten-Menü (22-halten.js): Objekterkennung/Aufnahme schalten, letzte Erkennung, Aufnahmen, Frigate ───────
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
    // Befehle statt Zustandswörter, überall dasselbe Wort wie der Kopfschalter („Objekterkennung“).
    tog(c.sw.detect, 'Objekterkennung einschalten', 'Objekterkennung ausschalten', 'mdi:eye-outline', 'Objekterkennung ausschalten?');
    tog(c.sw.recordings, 'Aufnahme einschalten', 'Aufnahme ausschalten', 'mdi:record-rec', 'Aufnahme ausschalten?');
    var nw = newest(id);
    if (nw || (s.last && c.objs[s.last.o] && c.objs[s.last.o].img && S[c.objs[s.last.o].img])) {
      var lo = s.last ? s.last.o : nw.o, lat = s.last ? s.last.at : nw.start;
      var img = s.last && c.objs[s.last.o] ? c.objs[s.last.o].img : null;
      out.push({ key: 'fn', t: 'Letzte Erkennung', ic: 'mdi:image-outline', fn: function () { F.latest(hass, c, lo, img, lat); } });
    }
    // Aufnahmen ab jetzt (Ende der Aufnahme − 1 Min.) – nur, wenn die Kamera aufnehmen kann.
    if (c.sw.recordings && S[c.sw.recordings]) out.push({ key: 'fn', t: 'Aufnahmen', ic: 'mdi:filmstrip-box-multiple', fn: function () { F.recView(id, null, null, camBack(id), 0, { now: true }); } });
    var ui = F.ui(hass, c);
    if (ui) out.push({ key: 'fn', t: 'In Frigate öffnen', ic: 'mdi:open-in-new', fn: function () { go(ui); } });
    return out;
  };
})();
