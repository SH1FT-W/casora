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
    cache[id] = { R: R, D: D, c: c };
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
  F.ago = function (ms, now) {
    var m = Math.max(0, Math.floor(((now || Date.now()) - ms) / 60000));
    if (m < 1) return 'gerade eben';
    if (m < 60) return 'vor ' + m + ' Min.';
    var d = window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.floor(m / 1440);
    if (m < 1440 || d < 1) return 'vor ' + Math.round(m / 60) + ' Std.';
    return d === 1 ? 'gestern' : 'vor ' + d + ' Tagen';
  };
  var who = function (list) {
    if (list.length === 1) return F.label(list[0]) + ' erkannt';
    if (list.length === 2) return F.label(list[0]) + ' und ' + F.label(list[1]) + ' erkannt';
    return list.length + ' Objekte erkannt';
  };
  // Kachel: Erkennung aus · jetzt erkannt · letzte Erkennung (bis 24 Std.) – sonst null (Kamera-Text).
  F.tileText = function (s, now) {
    if (!s || s.dead || s.off) return null;
    if (s.detectOff) return 'Erkennung aus';
    if (s.live.length) return who(s.live);
    if (s.last && (now || Date.now()) - s.last.at < 86400000) return F.label(s.last.o) + ' · ' + F.ago(s.last.at, now);
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
    if (fresh || (hit && hit.busy)) { if (el && hit.busy) hit.wait.push(el); return hit.list; }
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
  var clock = function (ms) {
    return new Date(ms).toLocaleTimeString(window.casoraLocale ? window.casoraLocale() : undefined, { hour: '2-digit', minute: '2-digit' });
  };
  var dayWord = function (ms, now) {
    var a = new Date(now || Date.now()); a.setHours(0, 0, 0, 0);
    var b = new Date(ms); b.setHours(0, 0, 0, 0);
    var d = Math.round((a - b) / 86400000);
    if (d === 0) return null;
    if (d === 1) return 'Gestern';
    return b.toLocaleDateString(window.casoraLocale ? window.casoraLocale() : undefined, { weekday: 'short', day: 'numeric', month: 'numeric' });
  };
  var zoneName = function (z) { var t = String(z || '').replace(/_/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); };
  F.detail = function (cam, evId, back) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    var P = window.casoraPopup, UI = window._casoraUI, K = window._casoraSoftKit;
    if (!hass || !P || !UI || !K || !F.is(hass, cam)) return false;
    var c = F.find(hass, cam), e = F.eventById(cam, evId);
    if (!e) return false;
    var snapP = F.sign(hass, F.path(c, 'snap', e.id));
    var clipP = e.clip ? F.sign(hass, F.path(c, 'clip', e.id)) : Promise.resolve(null);
    Promise.all([snapP, clipP]).then(function (u) {
      var snap = u[0] || e.thumb || '', clip = u[1];
      var dur = e.end ? Math.max(1, Math.round((e.end - e.start) / 1000)) : null;
      var day = dayWord(e.start);
      var rows = [{ icon: F.icon(e.o), iconTone: 'accent', label: F.label(e.o) + (e.sub ? ' · ' + e.sub : ''),
        sub: (day ? day + ', ' : '') + clock(e.start) + (dur ? ' · ' + (dur < 60 ? dur + ' s' : Math.round(dur / 60) + ' Min.') : ' · läuft noch'),
        value: e.score != null ? Math.round(e.score * 100) + ' %' : null }];
      if (e.zones.length) rows.push({ icon: 'mdi:vector-square', iconTone: 'accent', label: 'Zonen', value: e.zones.map(zoneName).join(', ') });
      // Clip mit dem Schnappschuss als Vorschaubild; ohne Clip (oder wenn er nicht lädt) nur der Schnappschuss.
      var media = '<div style="position:relative;width:100%;aspect-ratio:16/9;border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:#000;">'
        + (clip
          ? '<video controls playsinline preload="metadata" poster="' + esc(snap) + '" style="width:100%;height:100%;object-fit:contain;display:block;background:#000;">'
            + '<source src="' + esc(clip) + '" type="video/mp4" onerror="var v=this.parentNode;v.style.display=\'none\';v.nextElementSibling.style.display=\'block\';"></video>'
            + '<img src="' + esc(snap) + '" alt="" style="width:100%;height:100%;object-fit:contain;display:none;">'
          : '<img src="' + esc(snap) + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block;">')
        + '</div>';
      var card = K.bare();
      card.styles = { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0 26px 24px 26px' }],
        grid: [{ 'grid-template-areas': '"m" "i"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': 'var(--casora-popup-sec-gap, 22px)' }],
        custom_fields: { m: [{ 'justify-self': 'stretch' }], i: [{ 'justify-self': 'stretch' }, { 'text-align': 'left' }, { overflow: 'visible' }] } };
      card.custom_fields = { m: media, i: UI.group(rows, null) };
      P.open({ title: F.label(e.o) + ' · ' + clock(e.start), back: back || null, dismiss_on_background: true, content: card,
        style: '--popup-min-width: min(900px, 92vw); --popup-max-width: min(900px, 92vw);',
        popup_styles: (P.current || {}).popup_styles });
    });
    return true;
  };
  // Letzter Schnappschuss eines Objekts (Bild-Entität), wenn es keine Ereignisliste gibt.
  F.snapshot = function (imgId, back) {
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass, P = window.casoraPopup, K = window._casoraSoftKit;
    var st = hass && hass.states[imgId];
    if (!st || !P || !K || !st.attributes.entity_picture) return false;
    var card = K.bare();
    card.styles = { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0 26px 24px 26px' }] };
    card.custom_fields = { m: '<div style="width:100%;aspect-ratio:16/9;border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:#000;">'
      + '<img src="' + esc(st.attributes.entity_picture) + '" alt="" style="width:100%;height:100%;object-fit:contain;display:block;"></div>' };
    P.open({ title: String(st.attributes.friendly_name || 'Schnappschuss'), back: back || null, dismiss_on_background: true, content: card,
      style: '--popup-min-width: min(900px, 92vw); --popup-max-width: min(900px, 92vw);', popup_styles: (P.current || {}).popup_styles });
    return true;
  };
  // Zeilen im Popup tragen eine Schein-Entität (data-casora-mi): frigate-ev:<kamera>|<id>, frigate-img:<bild>, frigate-go:<wohin>.
  var backHere = function () {
    var cur = window.casoraPopup && window.casoraPopup.current;
    return cur ? function () { window.casoraPopup.open(cur); } : null;
  };
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var m = /^frigate-(ev|img|go):(.*)$/.exec(String(mid || ''));
    if (!m) return false;
    if (m[1] === 'ev') { var p = m[2].split('|'); return F.detail(p[0], p.slice(1).join('|'), backHere()); }
    if (m[1] === 'img') return F.snapshot(m[2], backHere());
    var w = m[2];
    go(/^https?:\/\//.test(w) ? { url: w } : { path: w });
    return true;
  });

  // Kopf-Kachel: Rot, solange etwas erkannt wird (Sicherheit), sonst wie die Kamera-Kachel.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_frigate\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var s = F.of(src._stateObj, ha && ha.hass);
    return s && s.live.length ? { hue: COLOR.alert, off: false } : null;
  });
  // Hauptschalter im Kopf = Objekterkennung (switch.<cam>_detect).
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src, hass) {
    var tpl = [].concat((src && src._config && src._config.template) || []).join(' ');
    if (!/\bcasora_frigate\b/.test(tpl)) return null;
    var id = src._stateObj && src._stateObj.entity_id;
    if (!F.is(hass, id)) return null;
    var d = F.find(hass, id).sw.detect;
    return d ? [d] : false;
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
      ctl: { card: K.secCard(watch, call('ctl'), states) }, objs: { card: K.secCard(watch, call('objs'), states) },
      ev: { card: K.secCard(watch, call('ev'), states) }, sys: { card: K.secCard(watch, call('sys'), states) } };
    // Live-Bild links über den Schaltern (volle Breite wäre 16:9 über 850 px – die Erkennungen lägen unter dem Rand).
    return K.layout({ fields: f, top: ['hero'], left: ['live', 'ctl', 'objs'], right: ['ev', 'sys'],
      narrowOrder: ['live', 'ctl', 'ev', 'objs', 'sys'] });
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
      if (!s.dead && s.rec != null) rest.push(s.rec ? 'Aufnahme an' : 'Aufnahme aus');
      if (s.server && s.server !== 'running' && !bad(s.server)) rest.push(s.server === 'starting' ? 'Frigate startet' : 'Frigate meldet Fehler');
      return UI.line(main, rest, { tone: tone });
    }
    if (part === 'ctl') {
      // Objekterkennung steht als Hauptschalter im Kopf; hier, was Frigate je Kamera sonst schaltet.
      var rows = [
        swRow(S, c.sw.recordings, 'mdi:record-rec', 'Aufnahme', true),
        swRow(S, c.sw.snapshots, 'mdi:image-multiple-outline', 'Schnappschüsse', false),
        swRow(S, c.sw.motion, 'mdi:motion-sensor', 'Bewegungserkennung', true),
        swRow(S, c.sw.audio, 'mdi:ear-hearing', 'Geräuscherkennung', false),
        swRow(S, c.sw.ptz, 'mdi:target-account', 'Automatisch folgen', false),
      ].filter(Boolean);
      return rows.length ? UI.group(rows, 'Frigate') : '';
    }
    if (part === 'objs') {
      if (!c.order.length) return '';
      var ev = (evc[c.cam] && evc[c.cam].list) || null, start = new Date(now); start.setHours(0, 0, 0, 0);
      var orows = c.order.map(function (o) {
        var x = s.objs[o] || {}, today = ev ? ev.filter(function (e) { return e.o === o && e.start >= start.getTime(); }).length : null;
        var sub = x.live ? (x.n > 1 ? x.n + ' im Bild' : 'Gerade im Bild') : x.at ? 'Zuletzt ' + F.ago(x.at, now) : 'Noch nicht erkannt';
        var img = c.objs[o].img;
        return { icon: F.icon(o), iconTone: x.live ? 'bad' : x.at ? 'accent' : null, label: F.label(o), sub: sub, subTone: x.live ? 'bad' : null,
          active: !!x.live, value: today ? today + '× heute' : null,
          entity: img && S[img] && S[img].attributes.entity_picture && x.at ? 'frigate-img:' + img : null };
      });
      return UI.group(orows, 'Objekte');
    }
    if (part === 'ev') {
      var list = F.events(hass, c, el);
      var job = evc[c.cam] || {};
      var head = 'Letzte Erkennungen';
      var out;
      if (!list) out = UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], head);
      else if (!list.length) {
        out = UI.group([{ icon: job.err ? 'mdi:alert-circle-outline' : 'mdi:check', iconTone: job.err ? 'warn' : null,
          label: job.err ? 'Frigate antwortet nicht' : 'Keine Erkennungen in den letzten 7 Tagen',
          sub: job.err ? 'Liste über die Frigate-Integration nicht abrufbar' : null }], head);
      } else {
        var erows = list.slice(0, 8).map(function (e) {
          var dw = dayWord(e.start, now);
          var sub = [(dw ? dw + ', ' : '') + clock(e.start)];
          if (e.zones.length) sub.push(e.zones.map(zoneName).join(', '));
          if (e.score != null) sub.push(Math.round(e.score * 100) + ' %');
          return { image: e.thumb || '', imageFit: 'cover', iconTone: null, label: F.label(e.o) + (e.sub ? ' · ' + e.sub : ''),
            sub: sub.join(' · '), value: e.end == null ? 'läuft' : F.ago(e.start, now), valueTone: e.end == null ? 'bad' : null,
            entity: 'frigate-ev:' + c.cam + '|' + e.id };
        });
        out = UI.group(erows, head);
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
      var word = { running: 'Läuft', starting: 'Startet', error: 'Fehler' }[v] || (bad(v) ? 'Nicht erreichbar' : v);
      var tn = v === 'running' ? null : v === 'starting' ? 'warn' : 'bad';
      return UI.group([{ icon: 'mdi:server', iconTone: tn || 'accent', label: 'Frigate', value: word, valueTone: tn, entity: c.server }], 'System');
    }
    return '';
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
    tog(c.sw.detect, 'Erkennung an', 'Erkennung aus', 'mdi:motion-sensor', 'Erkennung ausschalten?');
    tog(c.sw.recordings, 'Aufnahme an', 'Aufnahme aus', 'mdi:record-rec', 'Aufnahme ausschalten?');
    if (s.last && c.objs[s.last.o] && c.objs[s.last.o].img && S[c.objs[s.last.o].img]) {
      var img = c.objs[s.last.o].img;
      out.push({ key: 'fn', t: 'Letzte Erkennung', ic: 'mdi:image-outline', fn: function () { F.snapshot(img, null); } });
    }
    var ui = F.ui(hass, c);
    if (ui) out.push({ key: 'fn', t: 'In Frigate öffnen', ic: 'mdi:open-in-new', fn: function () { go(ui); } });
    return out;
  };
})();
