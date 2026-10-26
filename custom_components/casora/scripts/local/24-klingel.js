// ── Reolink-Türklingel: Kachel + Popup (Community-Karte, aus Kartenwunsch #23) ──────
// Für Reolink-Türklingeln (camera.<gerät>_sub bzw. _main der Reolink-Integration). Die Kachel ist die
// Casora-Kamera-Kachel (Standbild, Offline, Alter) und sagt dazu, ob geklingelt wurde („Hat geklingelt“,
// „Geklingelt vor 2 Min.“) oder wer vor der Tür steht („Person erkannt“). Das Popup zeigt das Live-Bild mit
// Ton-Knopf (und, wenn im Studio eingeschaltet, einem Sprechen-Versuch), Schnellantworten, Sirene, den
// Verlauf (Klingeldrücke und Erkennungen aus HAs Verlauf) und die Einstellungen der Klingel.
// Entitäten am Gerät der Kamera über translation_key (sprachunabhängig, nie über erratene IDs):
//   camera sub/main/snapshots_* · binary_sensor visitor (Klingeldruck, nur Sekunden an), person, vehicle,
//   pet/animal, package, face, motion (ohne translation_key, device_class motion) · select
//   play_quick_reply_message, auto_quick_reply_message, doorbell_led · number volume, volume_speak,
//   volume_doorbell, auto_quick_reply_time · switch doorbell_button_sound, record_audio, privacy_mode,
//   ir_lights · siren · sensor wifi_signal, day_night_state, Akku (device_class battery).
// Es gibt keine event-Entität für den Klingeldruck: „Hat geklingelt“ hält das Modul selbst (HOLD) und nimmt
// den Zeitpunkt aus HAs Verlauf bzw. aus dem, was es selbst gesehen hat – nach einem Neustart steht visitor
// frisch auf „off“, das ist kein Klingeln.
//   window._casoraKlingel.is(hass, id)                 → Reolink-Klingel (Kamera an einem Gerät mit visitor)?
//   window._casoraKlingel.find(hass, id)               → {cam, visitor, det{}, quick, sw{}, vol{}, led, siren, …}
//   window._casoraKlingel.status(c, states, now)       → {dead, privacy, ring, live[], …}
//   window._casoraKlingel.tileText(s, now, short)           → Text der Kachel oder null (dann wie die Kamera-Kachel)
//   window._casoraKlingel.popup(entity, states, hass, variables) – Popup casora_popup_reolink_doorbell
//   window._casoraKlingel.sec(part, c, states, hass, el) – Live-Bereiche (hero, say, hist, more)
//   window._casoraKlingel.hold(hass, id)               – Einträge fürs Halten-Menü (22-halten.js)
//   window._casoraKlingel.opts(variables)              → {talk, big, cam2} aus den Studio-Feldern
//   window._casoraKlingel.camName(hass, id)            → Name der zweiten Kamera im Umschalter
//   window._casoraKlingel.view(cfg, idx, states)       → was das Live-Bild gerade zeigt (Klingel 0 / zweite Kamera 1)
//   <casora-klingel-live> – Live-Bild mit Ton und Sprechen (Karte im Popup), großes Bild, Umschalter zweite Kamera
(function () {
  // Nur das eigene Modul zählt: ein fremdes Skript, das denselben Namen bloß als Marker setzt, sperrte Casora sonst aus.
  if (window._casoraKlingel && typeof window._casoraKlingel.of === 'function') return;
  var KL = window._casoraKlingel = {};

  var HOLD = 10 * 60000;          // so lange heißt die Kachel „Hat geklingelt“ (in Akzent)
  var DAYS = 3;                   // Verlauf im Popup (Text „In den letzten 3 Tagen“ mitändern)
  var TALK_MAX = 90000;           // Sprechen endet spätestens nach 90 s (Klingel bleibt sonst im Sprechmodus)
  var FRESH = 2 * 60000;          // so lange heißt es „Hat geklingelt“, danach „Geklingelt · 14:23“ (bis HOLD)
  var HIST_TTL = 15 * 60000;      // Verlauf ohne Änderung höchstens so oft neu fragen
  var SIREN_REST = 3000;
  var DAY_H = 16;                 // Höhe des Tagesetiketts über der Uhrzeit im Verlauf (Zeile 14 + 2 Abstand)          // nach dem Stoppen so lange „Gestoppt“ statt „Sirene auslösen“
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var tr = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };
  var notice = function (msg) {
    var ha = document.querySelector('home-assistant');
    if (!ha) return;
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = { message: tr(msg) };
    ha.dispatchEvent(ev);
  };
  var COLOR = { alert: 'var(--casora-color-red, #D35A4E)' };
  KL.COLOR = COLOR;

  // Erkennungen der Klingel (translation_key → Objekt), deutsch wie in der Frigate-Karte.
  var DET = { person: 'person', vehicle: 'vehicle', pet: 'pet', animal: 'pet', package: 'package', face: 'face',
    'non-motor_vehicle': 'bicycle' };
  var LABEL = { person: 'Person', vehicle: 'Fahrzeug', pet: 'Tier', package: 'Paket', face: 'Gesicht', bicycle: 'Fahrrad' };
  var ICON = { person: 'mdi:walk', vehicle: 'mdi:car', pet: 'mdi:paw', package: 'mdi:package-variant-closed',
    face: 'mdi:face-recognition', bicycle: 'mdi:bicycle', ring: 'mdi:doorbell' };
  var ORDER = ['person', 'package', 'vehicle', 'bicycle', 'pet', 'face'];
  KL.label = function (o) { return LABEL[o] || 'Bewegung'; };
  KL.icon = function (o) { return ICON[o] || 'mdi:motion-sensor'; };
  // Status-LED der Klingel (select doorbell_led): Optionen wie die Integration, Wörter wie die Wortliste.
  var LED = { stayoff: 'Aus', auto: 'Automatisch', alwaysonatnight: 'Nachts an', always: 'Immer an', alwayson: 'Immer an' };

  // ── Reolink-Klingel? ──────────────────────────────────────────────────────
  // Kamera an einem Gerät, das einen Klingelknopf (binary_sensor visitor) hat. Ohne Registry: nein.
  KL.is = function (hass, id) {
    if (!id || !/^camera\./.test(id) || !hass) return false;
    var R = hass.entities || {}, me = R[id];
    if (!me || !me.device_id) return false;
    if (me.platform && me.platform !== 'reolink' && me.platform !== 'casora_mock') return false;
    for (var eid in R) {
      var e = R[eid];
      if (e && e.device_id === me.device_id && e.translation_key === 'visitor' && /^binary_sensor\./.test(eid)) return true;
    }
    return false;
  };
  // Live-Kamera fürs Studio (Geräteliste, casora-panel-b-ux.js): je Gerät eine – sub (Fluent) vor main (Clear),
  // main nur ohne sub; Schnappschuss-Kameras nie.
  KL.liveCam = function (hass, id) {
    var R = (hass && hass.entities) || {}, me = R[id] || {}, tk = String(me.translation_key || '');
    if (!/^(sub|main)$/.test(tk) || !KL.is(hass, id)) return false;
    if (tk === 'sub') return true;
    var S = (hass && hass.states) || {};
    return !Object.keys(R).some(function (x) {
      var e = R[x];
      return x !== id && e && e.device_id === me.device_id && e.translation_key === 'sub' && /^camera\./.test(x) && S[x] && !e.hidden && !e.disabled_by;
    });
  };

  // ── Entitäten am Gerät ────────────────────────────────────────────────────
  var cache = {};
  KL.find = function (hass, id) {
    var R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {}, S = (hass && hass.states) || {};
    var hit = cache[id];
    if (hit && hit.R === R && hit.D === D) return hit.c;
    var me = R[id] || {}, dev = me.device_id ? D[me.device_id] : null;
    var c = { cam: id, device: me.device_id || null, name: dev ? String(dev.name_by_user || dev.name || '') : '',
      visitor: null, motion: null, det: {}, order: [], snap: null, quick: null, autoReply: null, autoTime: null,
      vol: {}, sw: {}, led: null, ledLight: null, dayMode: null, siren: null, battery: null, wifi: null, dayNight: null, reolink: me.platform === 'reolink' };
    if (me.device_id) {
      Object.keys(R).forEach(function (eid) {
        var e = R[eid];
        if (!e || eid === id || e.device_id !== me.device_id || !S[eid] || e.hidden) return;
        var dom = eid.split('.')[0], k = String(e.translation_key || ''), at = S[eid].attributes || {};
        if (dom === 'binary_sensor') {
          if (k === 'visitor') c.visitor = eid;
          else if (DET[k]) { var o = DET[k]; if (!c.det[o]) { c.det[o] = eid; c.order.push(o); } }
          else if (!k && at.device_class === 'motion' && !c.motion) c.motion = eid;
        } else if (dom === 'camera') {
          if (/^snapshots_(main|sub)$/.test(k) && (!c.snap || k === 'snapshots_main')) c.snap = eid;
        } else if (dom === 'select') {
          if (k === 'play_quick_reply_message') c.quick = eid;
          else if (k === 'auto_quick_reply_message') c.autoReply = eid;
          else if (k === 'doorbell_led') c.led = eid;
          else if (k === 'day_night' || k === 'day_night_mode') c.dayMode = eid;  // Reolink: day_night_mode
        } else if (dom === 'number') {
          if (k === 'volume') c.vol.spk = eid;
          else if (k === 'volume_speak') c.vol.speak = eid;
          else if (k === 'volume_doorbell') c.vol.bell = eid;
          else if (k === 'auto_quick_reply_time') c.autoTime = eid;
        } else if (dom === 'switch') {
          if (k === 'doorbell_button_sound') c.sw.bell = eid;
          else if (k === 'record_audio') c.sw.audio = eid;
          else if (k === 'privacy_mode') c.sw.privacy = eid;
          else if (k === 'ir_lights') c.sw.ir = eid;
        } else if (dom === 'light' && k === 'status_led') c.ledLight = eid;
        else if (dom === 'siren' && k === 'siren') c.siren = eid;
        else if (dom === 'sensor') {
          if (k === 'wifi_signal') c.wifi = eid;
          else if (k === 'day_night_state') c.dayNight = eid;
          else if (at.device_class === 'battery' && !c.battery) c.battery = eid;
        }
      });
    }
    c.order.sort(function (x, y) { return ORDER.indexOf(x) - ORDER.indexOf(y); });
    // Nur merken, wenn die Zustände schon da sind: beim HA-Start kommt die Registry vor den Zuständen –
    // ein so gemerktes Ergebnis ohne Klingelknopf hätte nie wieder „Hat geklingelt“ gemeldet.
    if (S[id] && c.visitor) cache[id] = { R: R, D: D, c: c };
    else delete cache[id];
    return c;
  };
  KL.watch = function (c) {
    var out = [c.cam, c.visitor, c.motion, c.snap, c.quick, c.autoReply, c.autoTime, c.led, c.ledLight, c.siren, c.battery, c.wifi, c.dayNight, c.dayMode];
    c.order.forEach(function (o) { out.push(c.det[o]); });
    ['spk', 'speak', 'bell'].forEach(function (k) { out.push(c.vol[k]); });
    ['bell', 'audio', 'privacy', 'ir'].forEach(function (k) { out.push(c.sw[k]); });
    return out.filter(Boolean);
  };

  // ── Verlauf (HAs Recorder) und selbst Gesehenes ───────────────────────────
  // Klingeldrücke und Erkennungen der letzten Tage aus history/history_during_period. Was das Modul selbst
  // „an“ gesehen hat (seen), zählt auch – der Recorder schreibt mit etwas Verzug.
  var seen = {}, hc = {};
  var look = function (c, S) {
    var list = seen[c.cam] = seen[c.cam] || [];
    var add = function (kind, id) {
      var st = id && S[id];
      if (!st || st.state !== 'on') return;
      var at = Date.parse(st.last_changed);
      if (!isFinite(at) || list.some(function (x) { return x.kind === kind && Math.abs(x.at - at) < 5000; })) return;
      list.unshift({ kind: kind, at: at });
      if (list.length > 40) list.length = 40;
    };
    add('ring', c.visitor);
    c.order.forEach(function (o) { add(o, c.det[o]); });
  };
  // Antwort von history_during_period (minimal, ohne Attribute) → [{kind, at}] neueste zuerst.
  // Der erste Eintrag je Entität ist der Zustand zum Beginn des Zeitraums, kein Ereignis.
  KL.parse = function (raw, c, start) {
    var out = [];
    var kinds = [['ring', c.visitor]].concat(c.order.map(function (o) { return [o, c.det[o]]; }));
    kinds.forEach(function (k) {
      var rows = raw && k[1] ? raw[k[1]] : null;
      if (!Array.isArray(rows)) return;
      var prev = null;
      rows.forEach(function (r, i) {
        var s = r.s != null ? r.s : r.state;
        var ts = r.lc != null ? r.lc * 1000 : r.lu != null ? r.lu * 1000 : Date.parse(r.last_changed || r.last_updated);
        if (s === 'on' && prev !== 'on' && !(i === 0 && start && ts <= start + 1000)) out.push({ kind: k[0], at: ts });
        prev = s;
      });
    });
    return out.filter(function (e) { return isFinite(e.at); }).sort(function (x, y) { return y.at - x.at; });
  };
  // Verlauf und Gesehenes zusammen; Erkennungen derselben Art innerhalb einer Minute nur einmal.
  // Reihenfolge: neueste zuerst; in derselben Minute (gleiche Uhrzeit in der Zeitleiste) Klingeln vor Erkennung.
  var minute = function (ms) { return Math.floor(ms / 60000); };
  KL.events = function (c, now) {
    var h = hc[c.cam], all = ((h && h.list) || []).concat(seen[c.cam] || []);
    all.sort(function (x, y) {
      return minute(y.at) - minute(x.at) || (x.kind === 'ring' ? 0 : 1) - (y.kind === 'ring' ? 0 : 1) || y.at - x.at;
    });
    var out = [];
    all.forEach(function (e) {
      if (e.at > (now || Date.now()) + 60000) return;
      var dup = out.some(function (x) { return x.kind === e.kind && Math.abs(x.at - e.at) < (e.kind === 'ring' ? 5000 : 60000); });
      if (!dup) out.push(e);
    });
    return out;
  };
  var kickAll = function (list) {
    (list || []).forEach(function (w) {
      try {
        if (!w || w.isConnected === false) return;
        if (typeof window.casoraKick === 'function') window.casoraKick(w);
        else if (typeof w.requestUpdate === 'function') w.requestUpdate('_config', undefined);
      } catch (e) { /* schon weg */ }
    });
  };
  // Neu fragen nur, wenn sich der Klingelknopf (visitor) ändert, sonst höchstens alle 15 Min. – Erkennungen
  // kommen live über „seen“ dazu (jede Personen-Erkennung fragte vorher den ganzen Verlauf neu); danach neu zeichnen.
  KL.history = function (hass, c, el) {
    var S = (hass && hass.states) || {};
    var ids = [c.visitor].concat(c.order.map(function (o) { return c.det[o]; })).filter(Boolean);
    var vs = c.visitor && S[c.visitor];
    var key = vs ? vs.last_changed + vs.state : '';
    var hit = hc[c.cam];
    if (hit && el && hit.wait.indexOf(el) < 0) hit.wait.push(el);
    var fresh = hit && hit.key === key && Date.now() - hit.at < HIST_TTL;
    var busy = hit && hit.busy && Date.now() - hit.at < 15000;
    if (fresh || busy || !ids.length) return hit ? hit.list : (ids.length ? null : []);
    var job = hc[c.cam] = { key: key, at: Date.now(), list: hit ? hit.list : null, err: false, busy: true,
      wait: (hit ? hit.wait : []).filter(function (w) { return w && w.isConnected !== false; }) };
    if (el && job.wait.indexOf(el) < 0) job.wait.push(el);
    if (!hass || !hass.callWS) { job.busy = false; job.list = job.list || []; return job.list; }
    var end = new Date(), start = new Date(end.getTime() - DAYS * 86400000);
    var ask = function () {
      return hass.callWS({ type: 'history/history_during_period', start_time: start.toISOString(), end_time: new Date().toISOString(),
        entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false });
    };
    ask().then(function (raw) { job.list = KL.parse(raw, c, start.getTime()); job.err = false; })
      .catch(function () { job.list = job.list || []; job.err = true; })
      .then(function () {
        job.busy = false;
        kickAll(job.wait);
        // Der Recorder schreibt mit Verzug (Standard alle 5 s): änderte sich gerade etwas, nach 7 s noch einmal fragen.
        var recent = !!(vs && Date.now() - Date.parse(vs.last_changed) < 12000);
        if (recent && !job.again) {
          job.again = true;
          setTimeout(function () {
            ask().then(function (raw) { job.list = KL.parse(raw, c, start.getTime()); kickAll(job.wait); }).catch(function () {});
          }, 7000);
        }
      });
    return job.list;
  };
  KL.forget = function (cam) { delete hc[cam]; delete seen[cam]; };

  // ── Zustand ───────────────────────────────────────────────────────────────
  var on = function (S, id) { return !!(id && S[id] && S[id].state === 'on'); };
  var swState = function (S, id) { return id && S[id] && !bad(S[id].state) ? S[id].state === 'on' : null; };
  KL.status = function (c, states, now) {
    var S = states || {}, t = now || Date.now();
    var st = S[c.cam];
    look(c, S);
    var s = { dead: !st || bad(st.state), off: !!(st && st.state === 'off'), privacy: swState(S, c.sw.privacy) === true,
      audio: swState(S, c.sw.audio), live: [], ring: null, lastRing: null, motion: on(S, c.motion) };
    c.order.forEach(function (o) { if (on(S, c.det[o])) s.live.push(o); });
    var ev = KL.events(c, t);
    for (var i = 0; i < ev.length; i++) if (ev[i].kind === 'ring') { s.lastRing = ev[i].at; break; }
    if (on(S, c.visitor)) s.lastRing = Math.max(s.lastRing || 0, Date.parse(S[c.visitor].last_changed) || t);
    if (s.lastRing && t - s.lastRing < HOLD) s.ring = s.lastRing;
    var b = c.battery && S[c.battery] ? num(S[c.battery].state) : null;
    s.battery = b;
    return s;
  };
  // Geschützte Leerzeichen: „vor 5 Min.“ bricht im Popup-Kopf am Handy nicht mitten durch.
  KL.ago = function (ms, now) {
    var F = window._casoraFrigate;
    if (F && F.ago) return F.ago(ms, now);
    var m = Math.max(0, Math.floor(((now || Date.now()) - ms) / 60000));
    if (m < 1) return 'gerade eben';
    if (m < 60) return 'vor ' + m + ' Min.';
    if (m < 1440) return 'vor ' + Math.round(m / 60) + ' Std.';
    var d = window.casoraDaysAgo ? window.casoraDaysAgo(m) : Math.floor(m / 1440);
    return d === 1 ? 'gestern' : 'vor ' + d + ' Tagen';
  };
  var who = function (list) {
    if (list.length === 1) return KL.label(list[0]) + ' erkannt';
    if (list.length === 2) return KL.label(list[0]) + ' und ' + KL.label(list[1]) + ' erkannt';
    return list.length + ' Objekte erkannt';
  };
  // Kachel: Privatsphäre · geklingelt (HOLD lang) · jetzt erkannt – sonst null (Kamera-Text: Bereit bzw. Alter
  // des Bildes). Geklingelt: die ersten 2 Min. „Hat geklingelt“, danach „Geklingelt · vor 4 Min.“; schmal (Handy)
  // mit Uhrzeit „Geklingelt 14:23“ – nur „Geklingelt“ fiel am Handy nicht auf (Nutzertests). Schmal ohne „ · “:
  // passt es knapp nicht, kürzte casoraStateFit sonst zu „Geklingelt +1“.
  KL.tileText = function (s, now, short) {
    if (!s) return null;
    if (s.privacy) return 'Privatsphäre an';
    if (s.dead || s.off) return null;
    var t = now || Date.now();
    if (s.ring) return t - s.ring < FRESH ? 'Hat geklingelt' : (short ? 'Geklingelt ' + clock(s.ring) : 'Geklingelt · ' + KL.ago(s.ring, t));
    if (s.live.length) return short && s.live.length > 1 ? KL.label(s.live[0]) + ' erkannt' : who(s.live);
    return null;
  };
  // Hervorheben (Punkt, Kopf rot): geklingelt oder gerade jemand vor der Tür.
  KL.hot = function (s) { return !!(s && !s.privacy && !s.dead && (s.ring || s.live.length)); };
  KL.of = function (entity, hass, states, el) {
    var id = entity && entity.entity_id;
    if (!KL.is(hass, id)) return null;
    var c = KL.find(hass, id);
    // Die Kachel fragt den Verlauf selbst (Klingeln vor dem Laden der Seite), Ergebnis zeichnet sie neu.
    KL.history(hass, c, el || null);
    return KL.status(c, states || (hass && hass.states) || {});
  };

  // ── Zeitangaben ───────────────────────────────────────────────────────────
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : undefined; };
  // Deutsch „09:05“ zweistellig, sonst hour 'numeric': Englisch „9:05 AM“ statt „09:05 AM“.
  var clock = function (ms) {
    var l = loc();
    return new Date(ms).toLocaleTimeString(l, { hour: !l || /^de/i.test(String(l)) ? '2-digit' : 'numeric', minute: '2-digit' });
  };
  var dayWord = function (ms, now) {
    var a = new Date(now || Date.now()); a.setHours(0, 0, 0, 0);
    var b = new Date(ms); b.setHours(0, 0, 0, 0);
    var d = Math.round((a - b) / 86400000);
    if (d === 0) return null;
    if (d === 1) return 'Gestern';
    return b.toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'numeric' });
  };

  // ── Popup-Rahmen: Kopf rot bei Klingeln/Erkennung, kein Hauptschalter ─────
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_reolink_doorbell\b/.test(key) || !src || !src._stateObj) return null;
    var s = KL.of(src._stateObj, hassNow());
    return KL.hot(s) ? { hue: COLOR.alert, off: false } : null;
  });
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src) {
    var tpl = [].concat((src && src._config && src._config.template) || []).join(' ');
    return /\bcasora_reolink_doorbell\b/.test(tpl) ? false : null;
  });
  // Kopf-Symbol immer das der Kachel (Klingel): offline zeigte der Kopf sonst das Kamera-Symbol.
  var prevRingUrl = window.casoraRingUrl;
  window.casoraRingUrl = function (src, key) {
    if (/\bcasora_reolink_doorbell\b/.test(key) && typeof window.casoraIconUrl === 'function') {
      var vi = src && src._config && src._config.variables && src._config.variables.icon;
      return window.casoraIconUrl(typeof vi === 'string' && /^[\w-]+$/.test(vi) ? vi : 'doorbell');
    }
    return typeof prevRingUrl === 'function' ? prevRingUrl(src, key) : null;
  };

  // Zeilen tragen Schein-Entitäten (data-casora-mi): klingel-more:<kamera> (Verlauf länger), klingel-go:<pfad>.
  var more = {}, els = {};
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var m = /^klingel-(more|go):(.*)$/.exec(String(mid || ''));
    if (!m) return false;
    if (m[1] === 'more') { more[m[2]] = !more[m[2]]; kickAll(els[m[2]]); return true; }
    try { if (window.casoraPopup) window.casoraPopup.close(); } catch (e) { /* schon zu */ }
    history.pushState(null, '', m[2]);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    return true;
  });
  // Aufnahmen der Klingel (SD-Karte/Hub) in HAs Medien, wenn es die Reolink-Medienquelle gibt.
  KL.media = function (hass, c) {
    var comp = (hass && hass.config && hass.config.components) || [];
    return c && c.reolink && comp.indexOf('reolink') !== -1 && comp.indexOf('media_source') !== -1
      ? '/media-browser/browser/' + encodeURIComponent('app,media-source://reolink') : null;
  };

  // ── Studio-Optionen, zweite Kamera ───────────────────────────────────────
  // talk: Sprechen (Standard aus) · big: großes Bild beim Mithören/Sprechen (Standard an) · cam2: zweite Kamera (optional).
  var yes = function (x, def) { return x === undefined || x === null || x === '' ? def : x === true || x === 'true' || x === 1; };
  KL.opts = function (variables, id) {
    var v = variables || {}, c2 = typeof v.camera2 === 'string' ? v.camera2.trim() : '';
    return { talk: yes(v.talk, false), big: yes(v.big_on_audio, true),
      cam2: /^camera\.[a-z0-9_]+$/.test(c2) && c2 !== id ? c2 : null };
  };
  // Name im Umschalter wie im Popup-Kopf: friendly_name ohne den Gerätenamen davor; bleibt dann nur der Stream
  // („Entrada Fluent“ → „Fluent“), gilt der Gerätename („Entrada“).
  var STREAM_WORD = /^(fluent|clear|klar|flüssig|sub|main|haupt|neben|stream|live|kamera|camera|hd|sd)$/i;
  KL.camName = function (hass, id) {
    var S = (hass && hass.states) || {}, R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {};
    var st = S[id], me = R[id] || {}, dev = me.device_id ? D[me.device_id] : null;
    var fn = String((st && st.attributes && st.attributes.friendly_name) || '').trim().replace(/\s+/g, ' ');
    var dn = dev ? String(dev.name_by_user || dev.name || '').trim() : '';
    var rest = fn;
    if (dn && fn.toLowerCase().indexOf(dn.toLowerCase()) === 0) rest = fn.slice(dn.length).trim();
    var w = rest.split(' ').filter(function (x) { return x && !STREAM_WORD.test(x); });
    if (w.length) return w.join(' ');
    return dn || fn.split(' ').filter(function (x) { return !STREAM_WORD.test(x); }).join(' ') || fn || String(id || '').replace(/^camera\./, '');
  };
  // Was das Live-Bild zeigt: idx 0 = Klingel, 1 = zweite Kamera (nur wenn gesetzt und in HA vorhanden).
  // Privatsphäre und „Ton aufnehmen“ gehören zur Klingel; Sprechen geht nur über die Klingel.
  KL.view = function (cfg, idx, states) {
    var S = states || {}, C = cfg || {};
    var i = idx === 1 && C.cam2 && S[C.cam2] ? 1 : 0;
    var id = i ? C.cam2 : C.entity, st = S[id];
    var privacy = !i && !!(C.privacy && S[C.privacy] && S[C.privacy].state === 'on');
    var dead = !st || bad(st.state) || privacy;
    var stream = streamOf(st);
    var audioOff = !i && !!(C.audio && S[C.audio] && S[C.audio].state === 'off');
    return { idx: i, id: id, privacy: privacy, dead: dead, stream: stream, audioOff: audioOff, bell: !i, two: !!(C.cam2 && S[C.cam2]),
      key: i + (dead ? (privacy ? 'p' : 'x') : 'o') + (stream ? 's' : 'i') };
  };

  // ── Popup ─────────────────────────────────────────────────────────────────
  KL.popup = function (entity, states, hass, variables) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    if (!K || !UI) return empty;
    var id = entity && entity.entity_id;
    if (!id) return empty;
    var c = KL.find(hass, id), S = states || {};
    var watch = KL.watch(c);
    var call = function (part) {
      return 'return window._casoraKlingel ? window._casoraKlingel.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, this) : "";';
    };
    var o = KL.opts(variables, id);
    var live = { type: 'custom:casora-klingel-live', entity: id, audio: c.sw.audio || null, privacy: c.sw.privacy || null,
      talk: o.talk, big: o.big, cam2: o.cam2, cam2Name: o.cam2 ? KL.camName(hass, o.cam2) : null };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, live: { card: live },
      hist: { card: K.secCard(watch, call('hist'), states) } };
    var opts = c.quick && S[c.quick] ? (S[c.quick].attributes || {}).options : null;
    if ((Array.isArray(opts) && opts.length) || c.siren) f.say = { card: K.secCard(watch, call('say'), states) };
    if (KL.sec('more', c, S, hass)) f.more = { card: K.secCard(watch, call('more'), states) };
    // Live-Bild links über den Schnellantworten (volle Breite wäre 16:9 über 850 px), rechts der Verlauf,
    // darunter über beide Spalten die Einstellungen („Mehr“).
    return K.layout({ fields: f, top: ['hero'], left: ['live', 'say'], right: ['hist', 'more'],
      narrowOrder: ['live', 'say', 'hist', 'more'], settings: id });
  };
  // Blueprint v2 (rule 9): „Ganzer Verlauf ›“ opens the whole list (30 entries) as a sub page with ‹.
  (window._casoraPages || (window._casoraPages = {}))['klingel-hist'] = function (camId) {
    var K = window._casoraSoftKit, ha = document.querySelector('home-assistant'), h = ha && ha.hass;
    if (!K || !h || !window.casoraPopup || !window.casoraPopup.sub) return;
    var id = Object.keys(h.states).filter(function (x) { return x === camId; })[0] || camId;
    var c = KL.find(h, id);
    var code = 'return window._casoraKlingel ? window._casoraKlingel.sec("histall", ' + JSON.stringify(c) + ', states, hass, this) : "";';
    window.casoraPopup.sub({ title: 'Verlauf', content: K.layout({ fields: { h: { card: K.secCard(KL.watch(c), code, h.states) } }, top: [], left: ['h'], right: [] }) });
  };

  var pill = function (text, mid) {
    return '<div role="button" tabindex="0" data-casora-mi="' + esc(mid) + '" style="box-sizing:border-box;width:100%;margin-top:10px;height:46px;min-height:46px;'
      + 'border-radius:999px;display:flex;align-items:center;justify-content:center;font-family:var(--primary-font-family, system-ui);font-size:14px;font-weight:700;'
      + 'cursor:pointer;background:var(--casora-soft-mehr-fill, var(--casora-soft-control-fill, rgba(140,115,90,0.10)));'
      + 'color:var(--casora-soft-mehr-ink, var(--casora-popup-tiles-text-primary, #3A322B));">'
      + '<span style="pointer-events:none;">' + esc(text) + '</span></div>';
  };
  var swRow = function (S, id, icon, label, ask, sub) {
    if (!id || !S[id] || S[id].state === 'unavailable') return null;
    var isOn = S[id].state === 'on';
    // Aus = Sand-Symbol wie ausgeschaltete Zeilen (ohne Ton färbte hueFor das Symbol trotzdem).
    // Domain aus der Entität (Status-LED ist light.*, nicht switch.*). ask: true = Ausschalten fragt,
    // 'both' = beide Richtungen fragen (Privatsphäre: an und aus mit derselben Logik).
    return { icon: icon, iconTone: isOn ? 'accent' : 'rgba(0,0,0,0)', label: label, sub: sub || null, value: isOn ? 'An' : 'Aus',
      svc: { domain: id.split('.')[0], service: isOn ? 'turn_off' : 'turn_on', target: { entity_id: id } },
      confirm: ask && (ask === 'both' || isOn) ? (isOn ? 'Ausschalten' : 'Einschalten') : null };
  };
  var slider = function (UI, S, id, label) {
    var st = id && S[id];
    if (!st || bad(st.state)) return '';
    var a = st.attributes || {}, mn = num(a.min), mx = num(a.max), stp = num(a.step), v = num(st.state);
    if (mn == null) mn = 0;
    if (mx == null || mx <= mn) mx = 100;
    var pct = v == null ? 0 : Math.round((v - mn) / (mx - mn) * 100);
    return '<div style="margin-top:8px;">' + UI.slider({ value: pct, softHeight: 46, bar: true, small: true, label: label,
      svc: { domain: 'number', service: 'set_value', field: 'value', scale: [mn, mx, stp || 1], target: { entity_id: id } } }) + '</div>';
  };

  KL.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var S = states || {}, now = Date.now();
    var s = KL.status(c, S, now);
    if (part === 'hero') {
      var main, rest = [], tone = null;
      if (s.privacy) main = 'Privatsphäre an';
      else if (s.dead) main = 'Offline';
      else if (s.ring) { main = 'Hat geklingelt'; tone = 'bad'; rest.push(KL.ago(s.ring, now)); }
      else if (s.live.length) { main = who(s.live); tone = 'bad'; }
      else {
        main = 'Bereit';
        if (s.lastRing) rest.push('Geklingelt ' + KL.ago(s.lastRing, now));
      }
      // „Ton aus“ steht nicht im Kopf: der Hinweis unter dem Bild sagt es (mit „Einschalten“) – doppelt
      // brach der Kopf am Handy zweizeilig um.
      if (s.battery != null && s.battery <= 20) rest.push({ text: 'Akku ' + Math.round(s.battery) + ' %', tone: 'warn' });
      return UI.line(main, rest, { tone: tone });
    }
    if (part === 'say') {
      var out = '';
      var q = c.quick && S[c.quick], opts = q ? (q.attributes || {}).options : null;
      // Privatsphäre an: Kamera und Lautsprecher der Klingel sind aus – Schnellantworten und Sirene ruhen.
      var hush = s.privacy || s.dead;
      if (Array.isArray(opts) && opts.length) {
        var gone = q.state === 'unavailable' || hush;
        // Antippen: Rückfrage in der Zeile („Abspielen“), dann spielt die Klingel die Nachricht ab; die Meldung
        // nennt sie. Nachrichten sind selbst gewählte Texte – nicht übersetzen (labelLit).
        out += UI.group(opts.map(function (o) {
          return { icon: 'mdi:message-reply-text-outline', iconTone: gone ? 'rgba(0,0,0,0)' : 'accent', label: String(o), labelLit: true,
            svc: gone ? null : { domain: 'select', service: 'select_option', target: { entity_id: c.quick }, data: { option: o }, done: 'Spielt ab: ' + o },
            confirm: gone ? null : 'Abspielen' };
        }), 'Schnellantworten');
      }
      if (c.siren && S[c.siren] && S[c.siren].state !== 'unavailable') {
        var sOn = S[c.siren].state === 'on';
        // Eben gestoppt (bzw. abgelaufen): kurz „Gestoppt“ ohne Auslösen – der Tipp zum Stoppen landete sonst
        // gleich auf „Sirene auslösen“. Nach SIREN_REST zeichnet sich die Zeile selbst neu.
        var since = now - (Date.parse(S[c.siren].last_changed) || 0);
        var rest = !sOn && !hush && since >= 0 && since < SIREN_REST;
        if (rest && el) setTimeout(function () { kickAll([el]); }, SIREN_REST - since + 60);
        var siren = sOn
          ? { icon: 'mdi:alarm-light', iconTone: 'bad', label: 'Sirene', sub: 'Antippen zum Stoppen', value: 'Läuft',
            valueTone: 'var(--casora-color-red-text, var(--casora-color-red))', svc: { domain: 'siren', service: 'turn_off', target: { entity_id: c.siren } } }
          : hush
            ? { icon: 'mdi:alarm-light-outline', iconTone: 'rgba(0,0,0,0)', label: 'Sirene', sub: s.privacy ? 'Bei Privatsphäre aus' : 'Klingel nicht erreichbar' }
            : rest
            ? { icon: 'mdi:alarm-light-outline', iconTone: 'rgba(0,0,0,0)', label: 'Sirene', sub: 'Gestoppt', value: 'Aus' }
            : { icon: 'mdi:alarm-light-outline', iconTone: 'bad', label: 'Sirene', sub: 'Laut an der Tür, 10 Sekunden',
              svc: { domain: 'siren', service: 'turn_on', target: { entity_id: c.siren }, data: { duration: 10 }, done: 'Sirene läuft' }, confirm: 'Auslösen' };
        out += (out ? '<div style="height:8px"></div>' : '') + UI.group([siren], out ? null : 'An der Tür');
      }
      return out;
    }
    if (part === 'hist' || part === 'histall') {
      if (el) { els[c.cam] = (els[c.cam] || []).filter(function (w) { return w.isConnected; }); if (els[c.cam].indexOf(el) < 0) els[c.cam].push(el); }
      var got = KL.history(hass, c, el);
      var job = hc[c.cam] || {};
      var list = KL.events(c, now);
      var head = 'Verlauf';
      var o2;
      if (got == null && !list.length) o2 = UI.group([{ icon: 'mdi:timer-sand', label: 'Wird geladen …' }], head);
      else if (!list.length) {
        o2 = UI.group([{ icon: job.err ? 'mdi:alert-circle-outline' : 'mdi:check', iconTone: job.err ? 'warn' : null,
          label: job.err ? 'Verlauf nicht abrufbar' : 'Niemand hat geklingelt', sub: job.err ? null : 'In den letzten 3 Tagen' }], head);
      } else {
        var max = part === 'histall' ? 30 : 8;
        var newest = list.filter(function (e) { return e.kind === 'ring'; })[0];
        // Zeitleiste wie Person/Schloss (15-person.js): Uhrzeit | Punkt mit Linie zum nächsten | Was, darunter wie lange her.
        // Klingeln als Punkt in Gerätefarbe, Erkennungen ruhig – beim ersten Eintrag eines früheren Tags steht der Tag über der Uhrzeit.
        var sub = 'var(--casora-soft-sub, rgba(58,50,43,.6))', ink = 'var(--casora-popup-tiles-text-primary, #3A322B)',
          rowBg = 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))', dim = 'var(--casora-soft-icon-off, rgba(140,115,90,0.18))',
          ringHue = 'var(--casora-popup-accent, var(--casora-color-teal))', detHue = 'var(--casora-soft-sub, rgba(58,50,43,.45))';
        var items = list.slice(0, max);
        var body = items.map(function (e, i) {
          var dw = dayWord(e.at, now), prev = items[i - 1];
          // Tagesetikett kurz wie im Person-Verlauf („Gestern“, sonst Wochentag „Mi“) – das Datum machte die Spalte breiter.
          var day = dw && (!prev || dayWord(prev.at, now) !== dw)
            ? (dw === 'Gestern' ? dw : new Date(e.at).toLocaleDateString(loc(), { weekday: 'short' }).replace(/\.$/, '')) : '';
          var ring = e.kind === 'ring', last = i === items.length - 1;
          var isNew = e === newest && now - e.at < HOLD;
          var what = ring ? 'Hat geklingelt' : KL.label(e.kind) + ' erkannt';
          // Tagesetikett („Gestern“) steht über der Uhrzeit: Punkt, Text und „Neu“ rücken um seine Höhe (DAY_H) nach
          // unten, damit sie auf einer Linie mit der Uhrzeit bleiben (der Punkt saß vorher beim Etikett).
          var off = day ? DAY_H : 0;
          return '<div class="kl-ev" style="display:grid;grid-template-columns:64px 22px minmax(0,1fr) auto;align-items:start;column-gap:8px;position:relative;padding:9px 0;">'
            + '<div style="font-size:13px;font-weight:600;color:' + sub + ';font-variant-numeric:tabular-nums;padding-top:2px;white-space:nowrap;">'
            + (day ? '<div class="kl-day" style="font-size:12px;font-weight:700;line-height:' + (DAY_H - 2) + 'px;margin:0 0 2px;">' + esc(tr(day)) + '</div>' : '') + esc(clock(e.at)) + '</div>'
            + '<div style="position:relative;height:100%;display:flex;justify-content:center;">'
            // Mit Tagesetikett sitzt der Punkt tiefer: die Linie vom Eintrag darüber bis zum Punkt weiterführen.
            + (off && i ? '<div style="position:absolute;top:0;height:' + (6 + off) + 'px;width:2px;background:' + dim + ';"></div>' : '')
            + (last ? '' : '<div style="position:absolute;top:' + (16 + off) + 'px;bottom:-18px;width:2px;border-radius:2px;background:' + dim + ';"></div>')
            + '<div class="kl-dot" style="position:relative;width:12px;height:12px;border-radius:50%;margin-top:' + (4 + off) + 'px;background:' + (ring ? ringHue : detHue) + ';box-shadow:0 0 0 3px ' + rowBg + ';"></div></div>'
            + '<div style="min-width:0;padding-top:' + off + 'px;"><div style="font-size:15px;font-weight:' + (ring ? 700 : 600) + ';color:' + ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(tr(what)) + '</div>'
            + (dw ? '' : '<div style="font-size:13px;font-weight:500;color:' + sub + ';margin-top:1px;white-space:nowrap;">' + esc(tr(KL.ago(e.at, now))) + '</div>') + '</div>'
            // Letztes Klingeln, solange die Kachel es meldet (HOLD, 10 Min.): rechts „Neu“ in Schrift-Rot.
            + (isNew ? '<div style="font-size:13px;font-weight:700;padding-top:' + (2 + off) + 'px;color:var(--casora-color-red-text, var(--casora-color-red));">' + esc(tr('Neu')) + '</div>' : '<div></div>')
            + '</div>';
        }).join('');
        o2 = (UI.label && part === 'hist' ? UI.label(head) : '')
          + '<div class="kl-verlauf" style="font-family:var(--primary-font-family, system-ui);background:' + rowBg + ';border-radius:var(--casora-popup-row-radius, 24px);padding:8px 16px 8px 12px;">' + body + '</div>';
        // The last 8 here, the rest on its own page (was: „Mehr anzeigen“ unfolding in place).
        if (list.length > 8 && part === 'hist') o2 += '<div style="height:8px"></div>' + UI.group([{ icon: 'mdi:history', iconTone: 'rgba(0,0,0,0)',
          label: 'Ganzer Verlauf', value: String(Math.min(list.length, 30)), page: 'klingel-hist|' + c.cam }], null);
      }
      var media = part === 'hist' ? KL.media(hass, c) : null;
      if (media) o2 += '<div style="height:8px"></div>' + UI.group([{ icon: 'mdi:filmstrip-box-multiple', iconTone: 'accent', label: 'Aufnahmen',
        sub: 'In den Medien von Home Assistant', entity: 'klingel-go:' + media }], null);
      return o2;
    }
    if (part === 'more') {
      var secs = [];
      var vols = slider(UI, S, c.vol.bell, 'Klingelton') + slider(UI, S, c.vol.speak, 'Sprechen') + slider(UI, S, c.vol.spk, 'Lautsprecher');
      var names = [];
      if (vols) { secs.push(UI.label('Lautstärke') + vols.replace('<div style="margin-top:8px;">', '<div>')); names.push('Lautstärke'); }
      var rows = [
        swRow(S, c.sw.bell, 'mdi:bell-ring-outline', 'Klingelton an der Tür', false),
        swRow(S, c.sw.audio, 'mdi:microphone-outline', 'Ton aufnehmen', true, 'Ohne Ton hörst du die Tür nicht'),
        // Drei Reolink-Entitäten, drei eindeutige Namen (16.10., Daten aus #23): Schalter ir_lights „Infrarot-LEDs nachts“,
        // Auswahl day_night „Tag/Nacht-Modus“ (Segmente unten), Sensor day_night_state „Bild gerade“ (unter „Gerät“).
        swRow(S, c.sw.ir, 'mdi:lightbulb-night-outline', 'Infrarot-LEDs nachts', false),
        swRow(S, c.ledLight, 'mdi:led-on', 'Status-LED', false),
        swRow(S, c.sw.privacy, 'mdi:eye-off-outline', 'Privatsphäre', 'both', 'Kamera und Ton aus'),
      ].filter(Boolean);
      // Status-LED als Segmente (wenige Optionen), gleiche Wörter zusammengefasst („always“/„alwayson“).
      var led = c.led && S[c.led] && !bad(S[c.led].state) ? S[c.led] : null;
      var segs = '';
      if (led) {
        var lo = (led.attributes || {}).options || [], words = [];
        lo.forEach(function (o) {
          var w = LED[o] || String(o);
          if (words.some(function (x) { return x.label === w; })) { if (o === led.state) words.forEach(function (x) { if (x.label === w) x.active = true; }); return; }
          words.push({ label: w, active: o === led.state, svc: { domain: 'select', service: 'select_option', target: { entity_id: c.led }, data: { option: o } } });
        });
        if (words.length > 1 && words.length <= 5) segs = UI.segments(words, 'Licht am Klingelknopf');
      }
      if (rows.length) { secs.push(UI.group(rows, 'Klingel')); names.push('Klingel'); }
      if (segs) { secs.push(segs); names.push('LED'); }
      var dm = c.dayMode && S[c.dayMode] && !bad(S[c.dayMode].state) ? S[c.dayMode] : null;
      if (dm) {
        var DM = { auto: 'Automatisch', color: 'Farbe', blackwhite: 'Schwarz-Weiß', blackandwhite: 'Schwarz-Weiß' };
        var dw2 = ((dm.attributes || {}).options || []).map(function (o) {
          return { label: DM[String(o).toLowerCase().replace(/[^a-z]/g, '')] || String(o), active: o === dm.state,
            svc: { domain: 'select', service: 'select_option', target: { entity_id: c.dayMode }, data: { option: o } } };
        });
        if (dw2.length > 1 && dw2.length <= 4) { secs.push(UI.segments(dw2, 'Tag/Nacht-Modus')); names.push('Tag/Nacht'); }
      }
      var ar = c.autoReply && S[c.autoReply] && !bad(S[c.autoReply].state) ? S[c.autoReply] : null;
      var dev = [];
      if (ar) {
        var at2 = c.autoTime && S[c.autoTime] ? num(S[c.autoTime].state) : null;
        dev.push({ icon: 'mdi:message-badge-outline', iconTone: ar.state !== 'off' ? 'accent' : null, label: 'Automatische Antwort',
          sub: ar.state !== 'off' && at2 ? 'Nach ' + Math.round(at2) + ' s ohne Antwort' : null, value: ar.state === 'off' ? 'Aus' : String(ar.state),
          valueLit: ar.state !== 'off', entity: c.autoReply });
      }
      if (c.battery && S[c.battery] && !bad(S[c.battery].state)) {
        var bv = Math.round(num(S[c.battery].state));
        dev.push({ icon: bv <= 20 ? 'mdi:battery-20' : 'mdi:battery-high', iconTone: bv <= 20 ? 'warn' : null, label: 'Akku', value: bv + ' %', valueTone: bv <= 20 ? 'warn' : null, entity: c.battery });
      }
      if (c.wifi && S[c.wifi] && !bad(S[c.wifi].state)) {
        var wv = num(S[c.wifi].state), unit = (S[c.wifi].attributes || {}).unit_of_measurement;
        // dBm (Reolink): gut ab −60, schwach unter −70; Stufen 0–4 (ältere Fassungen) wie angezeigt.
        var word = unit === 'dBm' ? (wv >= -60 ? 'Gut' : wv >= -70 ? 'Mittel' : 'Schwach') : (wv >= 3 ? 'Gut' : wv >= 2 ? 'Mittel' : 'Schwach');
        // Echtes Minuszeichen (U+2212) statt Bindestrich: „−58 dBm“.
        dev.push({ icon: 'mdi:wifi', iconTone: word === 'Schwach' ? 'warn' : null, label: 'WLAN', sub: unit === 'dBm' ? String(Math.round(wv)).replace('-', '\u2212') + ' dBm' : null,
          value: word, valueTone: word === 'Schwach' ? 'warn' : null, entity: c.wifi });
      }
      if (c.dayNight && S[c.dayNight] && !bad(S[c.dayNight].state)) {
        var dn = S[c.dayNight].state;
        // Ruhiges Symbol (kein Gelb): eine Info, kein Licht, das an ist. „Bild gerade · Farbe“ statt „Nachtsicht · Aus“ –
        // das las sich neben „Infrarot · An“ als Widerspruch (tagsüber ist beides richtig).
        dev.push({ icon: dn === 'night' ? 'mdi:weather-night' : 'mdi:white-balance-sunny', iconTone: 'rgba(0,0,0,0)', label: 'Bild gerade',
          value: dn === 'night' ? 'Schwarz-Weiß' : dn === 'led_day' ? 'Farbe mit Licht' : 'Farbe' });
      }
      if (dev.length) { secs.push(UI.group(dev, 'Gerät')); names.push(dev.some(function (r) { return r.label === 'Akku'; }) ? 'Akku' : 'Gerät'); }
      // Blueprint v2 (rule 9): the shared „Mehr (n) ⌄“; its sub line names what is inside (was „Einstellungen ⌄“).
      return secs.length ? UI.more('klingel', secs.map(function (x) { return '<div>' + x + '</div>'; }).join(''),
        { count: secs.length, hint: names.map(tr).join(', ') }) : '';
    }
    return '';
  };

  // ── Halten-Menü (22-halten.js): Ton hören, Schnellantworten ───────────────
  KL.hold = function (hass, id) {
    if (!KL.is(hass, id)) return [];
    var S = hass.states || {}, c = KL.find(hass, id), s = KL.status(c, S), out = [];
    // Mithören nur mit Live-Bild (Standbild-Kamera hat keinen Ton).
    if (!s.dead && !s.privacy && s.audio !== false && streamOf(S[id])) {
      out.push({ key: 'fn', t: 'Mithören', ic: 'mdi:volume-high', fn: function () { KL.listen(id); } });
    }
    // Schnellantworten: die Nachricht selbst ist die Beschriftung (vorher „Schnellantwort“ + abgeschnittene Nachricht),
    // Rückfrage und Meldung nennen sie; selbst gewählter Text – nicht übersetzen (lit). Bei Privatsphäre keine.
    var q = c.quick && S[c.quick], opts = q && q.state !== 'unavailable' && !s.privacy && !s.dead ? (q.attributes || {}).options : null;
    (Array.isArray(opts) ? opts.slice(0, 3) : []).forEach(function (o) {
      out.push({ key: 'act', t: String(o), lit: true, ic: 'mdi:message-reply-text-outline', svc: 'select.select_option',
        entity: c.quick, data: { option: o }, ask: '„' + o + '“ an der Tür abspielen?', yes: 'Abspielen', done: 'Spielt ab: ' + o });
    });
    return out;
  };
  // Popup öffnen und den Ton gleich einschalten (der Tipp im Halten-Menü erlaubt dem Browser den Ton).
  KL.listen = function (id) {
    KL._want = { id: id, at: Date.now() };
    var open = window._casoraNotifyOpenViaCard;
    if (open) open(id, function (ok) { if (!ok && window.casoraPopup) window.casoraPopup.nativeMoreInfo(id); });
  };

  // ── Live-Bild mit Ton und Sprechen ────────────────────────────────────────
  // Karte im Popup (custom:casora-klingel-live). Das Bild kommt aus HAs eigenem Player (ha-camera-stream,
  // bei Reolink über HAs go2rtc mit Ton, wenn „Ton aufnehmen“ an ist), ohne Stream als Standbild (dann ohne
  // Mithören-Knopf). Stumm eingebunden wählt HA WebRTC und verwirft dabei die Tonspur (ha-web-rtc-player
  // _addTrack); „Mithören“ bindet den Player darum ohne „stumm“ neu ein – der Tipp erlaubt dem Browser den Ton.
  // HA setzt „stumm“ bei Updates neu, darum folgt das <video> jede Sekunde dem gewünschten Zustand.
  // Sprechen (Versuch, Studio-Feld „Sprechen“): eigene WebRTC-Verbindung über camera/webrtc/offer mit der
  // Mikrofonspur. Ob die Klingel sie annimmt, sagt die Antwort (Audio „recvonly/sendrecv“) – sonst eine
  // freundliche Meldung. Die Spur wird immer gestoppt und die Verbindung geschlossen (Popup zu, 90 s, Fehler).
  var CSS = ':host{display:block;text-align:left;font-family:var(--primary-font-family, system-ui, sans-serif);}'
    + '.fr{position:relative;width:100%;aspect-ratio:var(--ar, 4 / 3);border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:#000;}'
    + '.mt{position:absolute;inset:0;}'
    + '.mt>*{width:100%;height:100%;display:block;}'
    + '.ov{position:absolute;inset:0;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;text-align:center;'
    +   'padding:20px;background:rgba(0,0,0,0.45);color:rgba(255,255,255,0.86);font-size:15px;}'
    + '.ov[hidden]{display:none;}'
    + '.ov b{font-weight:700;}.ov small{font-size:13px;opacity:.75;max-width:340px;}'
    + '.ov ha-icon{--mdc-icon-size:34px;color:rgba(255,255,255,0.55);}'
    // Knopf im dunklen Overlay: helle Pille wie ein aktives Segment (vorher Glas – auf Schwarz kaum zu sehen).
    + '.ob{margin-top:6px;min-height:44px;padding:0 20px;display:inline-flex;align-items:center;gap:8px;border-radius:999px;cursor:pointer;border:0;'
    +   'font:inherit;font-size:14px;font-weight:700;background:var(--casora-soft-seg-on, #FFFDF9);'
    +   'color:var(--casora-soft-seg-on-ink, var(--casora-popup-tiles-text-primary, #3A322B));}'
    + '.ob:active{transform:scale(var(--casora-press-scale, .97));}'
    + '.bar[hidden]{display:none;}.b[hidden]{display:none;}'
    + '.bar{display:grid;grid-template-columns:repeat(var(--n,1),minmax(0,1fr));gap:10px;margin-top:10px;}'
    + '.b{box-sizing:border-box;min-height:46px;padding:0 12px;border:0;border-radius:var(--casora-r-pill, 999px);cursor:pointer;'
    +   'display:flex;align-items:center;justify-content:center;gap:8px;font:inherit;font-size:14px;font-weight:700;white-space:nowrap;'
    +   'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));color:var(--casora-popup-tiles-text-primary, var(--primary-text-color, #3A322B));'
    +   'transition:background-color var(--casora-dur-feedback, 160ms) var(--casora-ease-feedback, ease), box-shadow var(--casora-dur-feedback, 160ms) var(--casora-ease-feedback, ease);'
    +   '-webkit-tap-highlight-color:transparent;touch-action:manipulation;}'
    + '.b ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;pointer-events:none;}'
    + '.b span{pointer-events:none;overflow:hidden;text-overflow:ellipsis;}'
    + '.b:active{transform:scale(var(--casora-press-scale, .97));}'
    + '@media (hover:hover){.b:not(.on):not(.talk):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
    + '.b.on{background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, var(--casora-popup-tiles-text-primary, #3A322B));'
    +   'box-shadow:var(--casora-soft-seg-on-shadow, none);}'
    + '.b.talk{background:var(--casora-color-red, #D35A4E);color:#fff;}'
    + '.b.busy{opacity:.7;cursor:progress;}'
    + '.b:disabled{opacity:.45;cursor:default;transform:none;}'
    + '.nt{display:flex;align-items:center;gap:12px;margin-top:10px;padding:8px 8px 8px 16px;min-height:46px;box-sizing:border-box;'
    +   'border-radius:var(--casora-popup-row-radius, 24px);background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));'
    +   'font-size:13px;font-weight:500;line-height:1.35;color:var(--casora-soft-sub, var(--secondary-text-color));}'
    + '.nt[hidden]{display:none;}.nt span{flex:1;min-width:0;}'
    // Aktion im Hinweis in der Bedien-Farbe des Popups (wie „Bestätigen“), 36 hoch + 4 px unsichtbar = 44 Trefferfläche.
    + '.nb{flex:none;min-height:36px;padding:0 16px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;'
    +   'background:var(--casora-popup-ui-action, #276B64);color:var(--casora-popup-ui-on-action, #fff);position:relative;}'
    + '.nb::before{content:"";position:absolute;inset:-4px;}'
    + '.nb:active{transform:scale(var(--casora-press-scale, .97));}'
    + '.nb[hidden]{display:none;}'
    // Knöpfe auf dem Bild (Groß-Knopf oben rechts, Umschalter oben links): dunkles Glas wie Kamera-Overlays,
    // 36 sichtbar + unsichtbar auf 44 Trefferfläche.
    + '.fs{position:absolute;top:8px;right:8px;z-index:2;width:36px;height:36px;padding:0;border:0;border-radius:50%;cursor:pointer;'
    +   'display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.42);color:#fff;'
    +   '-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);-webkit-tap-highlight-color:transparent;touch-action:manipulation;}'
    + '.fs::before{content:"";position:absolute;inset:-4px;}.fs:focus:not(:focus-visible),.x:focus:not(:focus-visible),.sgb:focus:not(:focus-visible){outline:none;}'
    + '.fs ha-icon{--mdc-icon-size:22px;display:flex;pointer-events:none;}'
    + '.fs:active,.sgb:active,.x:active{transform:scale(var(--casora-press-scale, .97));}'
    + '@media (hover:hover){.fs:hover{background:rgba(0,0,0,0.58);}}'
    + '.fs[hidden],.sg[hidden],.x[hidden]{display:none;}'
    + '.sg{position:absolute;top:8px;left:8px;z-index:2;max-width:calc(100% - 68px);display:flex;gap:2px;padding:2px;box-sizing:border-box;border-radius:999px;'
    +   'background:rgba(0,0,0,0.42);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);}'
    + '.sgb{position:relative;min-width:0;height:32px;padding:0 12px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;'
    +   'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:transparent;color:rgba(255,255,255,0.86);-webkit-tap-highlight-color:transparent;'
    +   'transition:background-color var(--casora-dur-feedback, 160ms) var(--casora-ease-feedback, ease);}'
    + '.sgb::before{content:"";position:absolute;inset:-6px 0;}'
    + '.sgb[aria-pressed="true"]{background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, var(--casora-popup-tiles-text-primary, #3A322B));}'
    // Großes Bild: dieselbe Bühne (Bild, Knöpfe, Hinweis) als Popover in der obersten Ebene – kein Umhängen,
    // Player und Ton laufen weiter. Ohne Popover-API: fest über allem.
    + '.st{--kl-reserve:196px;}'
    + '.st.big{position:fixed;inset:0;z-index:2147483000;width:auto;height:auto;max-width:none;max-height:none;margin:0;border:0;'
    +   'box-sizing:border-box;padding:max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));'
    +   'display:flex;align-items:center;justify-content:center;overflow:hidden;background:rgb(0,0,0);color:#fff;'
    +   'font-family:var(--primary-font-family, system-ui, sans-serif);overscroll-behavior:contain;touch-action:none;}'
    + '.st.big::backdrop{background:transparent;}'
    + '.in{width:100%;}'
    + '.st.big .in{width:min(100%, 1600px, calc((100vh - var(--kl-reserve)) * var(--ar, 1.3333)));'
    +   'width:min(100%, 1600px, calc((100dvh - var(--kl-reserve)) * var(--ar, 1.3333)));'
    +   'animation:kl-big-in var(--casora-dur-enter, 320ms) var(--casora-ease-enter, cubic-bezier(.2,.8,.3,1)) both;}'
    + '@keyframes kl-big-in{from{opacity:0;transform:scale(.96);}}'
    + '.st.big .b:not(.on):not(.talk){background:rgba(255,255,255,0.14);color:#fff;}'
    + '@media (hover:hover){.st.big .b:not(.on):not(.talk):not(:disabled):hover{background:rgba(255,255,255,0.22);}}'
    + '.st.big .nt{background:rgba(255,255,255,0.10);color:rgba(255,255,255,0.78);}'
    + '.x{position:absolute;top:max(12px, env(safe-area-inset-top));right:max(12px, env(safe-area-inset-right));z-index:3;width:44px;height:44px;padding:0;border:0;'
    +   'border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.16);color:#fff;'
    +   '-webkit-tap-highlight-color:transparent;touch-action:manipulation;}'
    + '.x ha-icon{--mdc-icon-size:24px;display:flex;pointer-events:none;}'
    + '@media (hover:hover){.x:hover{background:rgba(255,255,255,0.24);}}'
    // Handy quer: Knöpfe neben das Bild, sonst bliebe für das Bild kaum Höhe.
    + '@media (orientation:landscape) and (max-height:500px){'
    +   '.st.big .in{display:grid;grid-template-columns:minmax(0,1fr) 200px;column-gap:12px;align-items:center;'
    +     'width:min(100%, calc((100vh - 32px) * var(--ar, 1.3333) + 212px));width:min(100%, calc((100dvh - 32px) * var(--ar, 1.3333) + 212px));}'
    +   '.st.big .fr{grid-row:1 / span 2;}.st.big .bar{grid-template-columns:1fr;margin-top:0;align-self:end;}.st.big .nt{align-self:start;}}'
    + '@media (prefers-reduced-motion:reduce){.b{transition:none;}.b:active,.ob:active,.nb:active,.fs:active,.sgb:active,.x:active{transform:none;}.st.big .in{animation:none;}}';

  var findVideo = function (root, d) {
    if (!root || d > 12) return null;
    var v = root.querySelector && root.querySelector('video');
    if (v) return v;
    var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].shadowRoot) { var x = findVideo(all[i].shadowRoot, d + 1); if (x) return x; }
    }
    return null;
  };
  // Richtung der Audio-Spur in der Antwort (aus Sicht der Klingel): nimmt sie unser Mikrofon an?
  KL.talkAccepted = function (sdp) {
    var parts = String(sdp || '').split(/\r?\nm=/);
    for (var i = 1; i < parts.length; i++) {
      var p = parts[i];
      if (!/^audio /.test(p)) continue;
      if (/^audio 0 /.test(p)) return false;
      if (/\na=(recvonly|sendrecv)\b/.test('\n' + p)) return true;
      if (/\na=(sendonly|inactive)\b/.test('\n' + p)) return false;
      return true;  // ohne Angabe gilt sendrecv
    }
    return false;
  };
  // #23: audio bytes received on a connection (inbound-rtp), null when unknown.
  // #23 diagnostics: audio of a talk connection – bytes and level received from the doorbell, bytes sent and level
  // of the microphone (levels 0…1, null when the browser does not report them).
  KL.audioStats = function (pc) {
    var out = { inBytes: null, inLevel: null, outBytes: null, micLevel: null };
    if (!pc || typeof pc.getStats !== 'function') return Promise.resolve(out);
    var audio = function (r) { return r.kind === 'audio' || r.mediaType === 'audio'; };
    return pc.getStats().then(function (rep) {
      rep.forEach(function (r) {
        if (!r) return;
        if (r.type === 'inbound-rtp' && audio(r)) {
          out.inBytes = (out.inBytes || 0) + (Number(r.bytesReceived) || 0);
          if (r.audioLevel != null) out.inLevel = Number(r.audioLevel);
        } else if (r.type === 'outbound-rtp' && audio(r)) {
          out.outBytes = (out.outBytes || 0) + (Number(r.bytesSent) || 0);
        } else if (r.type === 'media-source' && audio(r) && r.audioLevel != null) {
          out.micLevel = Number(r.audioLevel);
        }
      });
      return out;
    }, function () { return out; });
  };
  KL.levelLine = function (a) {
    var r = function (x) { return x == null ? null : Math.round(x * 1000) / 1000; };
    return { klingel_bytes: a.inBytes, klingel_pegel: r(a.inLevel), mikro_bytes: a.outBytes, mikro_pegel: r(a.micLevel) };
  };
  KL.audioIn = function (pc) { return KL.audioStats(pc).then(function (a) { return a.inBytes; }); };
  // Is sound flowing? Growing bytes = yes; no growth for 2.5 s = no (back to the player's sound).
  // #23 (vitidron 24.10.): data kept arriving although he heard nothing – silence packets. The talk connection takes
  // over only once real sound came through it (level above KL.SOUND); pauses between words do not switch back.
  // Without a level from the browser (null), growing bytes decide as before.
  KL.SOUND = 0.003;
  // #23 (vitidron 24.10., levels): a failed session carries pure silence (level exactly 0, bytes growing) while the
  // microphone sends – the doorbell serves the previous two-way session still. After SILENT ms of that, the card ends
  // the session and starts it once more by itself (one retry per press). Returns true when that is due.
  KL.SILENT = 6000;
  KL.silentStep = function (t, level, bytes, now) {
    if (level == null || level > 0 || !(bytes > 0)) { t.silentSince = null; return false; }
    if (!t.silentSince) t.silentSince = now;
    return now - t.silentSince >= KL.SILENT;
  };
  // The retry after silence: once per press, never on the second camera (it has no talk); and it starts only while
  // the card is still on a visible page – a hidden tab must not open the microphone by itself.
  KL.retryWanted = function (card) { return !card._talkRetried && !(card._v && card._v.idx); };
  KL.retryGo = function (card, doc) {
    return !card._t && !!card.isConnected && !!doc && doc.visibilityState === 'visible';
  };
  KL.flowStep = function (t, bytes, now, level) {
    if (bytes != null && bytes > (t.lastBytes || 0)) { t.lastBytes = bytes; t.lastFlow = now; }
    if (level != null && level > KL.SOUND) t.heard = true;
    var flowing = !!(t.lastFlow && now - t.lastFlow < 2500);
    return flowing && (level == null || !!t.heard);
  };
  // Kandidat aus HAs WebRTC-Antwort (go2rtc: nur Text bzw. ohne sdpMid) → RTCIceCandidateInit.
  KL.candidate = function (x) {
    if (typeof x === 'string') return { candidate: x, sdpMid: '0' };
    var o = Object.assign({}, x || {});
    if (o.sdpMid == null && o.sdpMLineIndex == null) o.sdpMid = '0';
    return o;
  };
  var streamOf = function (st) { return !!((Number(((st || {}).attributes || {}).supported_features) || 0) & 2); };
  KL.canTalk = function () {
    return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection);
  };

  var lives = new Set();
  if (window.customElements && !customElements.get('casora-klingel-live')) {
    class KLive extends HTMLElement {
      setConfig(cfg) { this._cfg = cfg || {}; }
      getCardSize() { return 5; }
      get hass() { return this._hass; }
      set hass(h) {
        this._hass = h;
        if (!this._root) this._build();
        this._sync();
      }
      connectedCallback() { lives.add(this); if (this._hass) this._sync(); }
      disconnectedCallback() {
        lives.delete(this);
        this._setBig(false, true);
        this._talkStop(true);
        this._teardown();
        this._key = null;
      }
    }
    var P = KLive.prototype;
    P._build = function () {
      var r = this._root = this.attachShadow({ mode: 'open' });
      // Sprechen im Studio eingeschaltet: Knopf immer zeigen – ohne HTTPS/Mikrofon gesperrt mit Hinweis statt still weg.
      var cfg = this._cfg || {}, talk = !!cfg.talk;
      // Bühne .st: im Popup normal, groß als Popover (gleiche Elemente, gleicher Player). Umschalter nur mit zweiter Kamera.
      r.innerHTML = '<style>' + CSS + '</style>'
        + '<div class="st"><button class="x" type="button" hidden><ha-icon icon="mdi:close"></ha-icon></button><div class="in">'
        + '<div class="fr"><div class="mt"></div><div class="ov" role="status" aria-live="polite" hidden></div>'
        + (cfg.cam2 ? '<div class="sg" role="group" hidden><button class="sgb" type="button" data-i="0"></button><button class="sgb" type="button" data-i="1"></button></div>' : '')
        + '<button class="fs" type="button" hidden><ha-icon icon="mdi:arrow-expand"></ha-icon></button></div>'
        + '<div class="bar">'
        + '<button class="b snd" type="button" aria-pressed="false"><ha-icon icon="mdi:volume-off"></ha-icon><span></span></button>'
        + (talk ? '<button class="b tlk" type="button"><ha-icon icon="mdi:microphone-outline"></ha-icon><span></span></button>' : '')
        + '</div>'
        + '<div class="nt" role="status" aria-live="polite" hidden><span></span><button class="nb" type="button" hidden></button></div>'
        + '</div></div>';
      var self = this;
      this._view = 0;
      r.querySelector('.fs').addEventListener('click', function (ev) { ev.stopPropagation(); self._setBig(!self._big); });
      r.querySelector('.x').addEventListener('click', function (ev) { ev.stopPropagation(); self._setBig(false); });
      r.querySelectorAll('.sgb').forEach(function (b) {
        b.addEventListener('click', function (ev) { ev.stopPropagation(); self._switch(Number(b.getAttribute('data-i'))); });
      });
      this._bindSwipe(r.querySelector('.st'));
      // Popups schließen am Handy beim Wischen über touchstart – Knöpfe handeln auf click, Wischen bleibt beim Popup.
      r.querySelector('.snd').addEventListener('click', function (ev) { ev.stopPropagation(); self._toggleSound(); });
      var tb = r.querySelector('.tlk');
      if (tb) tb.addEventListener('click', function (ev) { ev.stopPropagation(); self._talk(); });
      r.querySelector('.nb').addEventListener('click', function (ev) { ev.stopPropagation(); if (self._nbFn) self._nbFn(); });
      r.querySelector('.ov').addEventListener('click', function (ev) {
        var b = ev.target && ev.target.closest && ev.target.closest('.ob');
        if (b) { ev.stopPropagation(); if (self._obFn) self._obFn(); }
      });
      this._muted = true;
      var w = KL._want;
      // Mithören aus dem Halten-Menü: Ton gleich an – und, wie beim Tipp auf „Mithören“, groß (Studio-Option).
      if (w && w.id === cfg.entity && Date.now() - w.at < 8000) { this._muted = false; KL._want = null; if (cfg.big) this._wantBig = true; }
      this._paint();
    };
    P._st = function (id) { var h = this._hass; return id && h && h.states ? h.states[id] : null; };
    P._call = function (dom, svc, id, data) {
      var h = this._hass;
      if (!h || !id) return Promise.resolve();
      if (window.casoraHaptic) window.casoraHaptic('light');
      return h.callService(dom, svc, data || {}, { entity_id: id });
    };
    P._sync = function () {
      var cfg = this._cfg || {}, S = (this._hass && this._hass.states) || {};
      if (!S[cfg.entity] || !this._root || !this.isConnected) return;
      var v = this._v = KL.view(cfg, this._view, S);
      var st = S[v.id], dead = v.dead, privacy = v.privacy;
      var stream = this._stream = v.stream;
      // Neu einbinden nur, wenn sich Kamera, Erreichbarkeit oder Stream-Art ändert (nicht bei jedem Token-Wechsel).
      if (v.key !== this._key) {
        this._key = v.key;
        this._teardown();
        if (!dead) this._mount(stream);
      }
      // Privatsphäre an / Klingel weg: Sprechen beenden (sonst hinge die Verbindung bis zu 90 s). Gilt für die Klingel,
      // auch wenn gerade die zweite Kamera zu sehen ist.
      var bell = v.idx ? KL.view(cfg, 0, S) : v;
      if (bell.dead && this._t) { this._talkStop(); this._note(bell.privacy ? 'Sprechen beendet – Privatsphäre an' : 'Sprechen beendet – Klingel nicht erreichbar', 6000); }
      if (this._card) {
        this._card.hass = this._hass;
        if (this._native && this._card.stateObj !== st) this._card.stateObj = st;
      }
      this._overlay(dead, privacy, v.idx);
      if (this._wantBig && !dead) {
        this._wantBig = false;
        var self = this;
        // Erst wenn das Popup steht (Auftritt 320 ms), sonst läge das große Bild unter dessen Einblendung.
        setTimeout(function () { if (self.isConnected) self._setBig(true); }, 380);
      }
      this._applyAudio();
      this._paint();
    };
    P._mount = function (stream) {
      var self = this, mt = this._root.querySelector('.mt');
      var camId = (this._v && this._v.id) || (this._cfg || {}).entity;
      var st = this._st(camId);
      if (stream && customElements.get('ha-camera-stream')) {
        var el = document.createElement('ha-camera-stream');
        el.controls = false;
        el.allowExoPlayer = false;
        // Stumm eingebunden wählt HA WebRTC ohne Tonspur; zum Mithören ohne „stumm“ (siehe _toggleSound).
        el.muted = this._muted !== false;
        this._mountedMuted = el.muted;
        el.hass = this._hass;
        el.stateObj = st;
        mt.appendChild(el);
        this._card = el;
        this._native = true;
      } else if (window.loadCardHelpers) {
        var mine = this._mountId = (this._mountId || 0) + 1;
        window.loadCardHelpers().then(function (h) {
          return h.createCardElement({ type: 'picture-entity', entity: camId, camera_view: stream ? 'live' : 'auto',
            show_name: false, show_state: false, tap_action: { action: 'none' }, hold_action: { action: 'none' },
            card_mod: { style: 'ha-card { border-radius: 0 !important; border: none !important; background: #000 !important; box-shadow: none !important; height: 100%; }' } });
        }).then(function (card) {
          if (mine !== self._mountId || !self.isConnected || self._card) return;
          card.hass = self._hass;
          mt.appendChild(card);
          self._card = card;
          self._native = false;
        }).catch(function () {});
      }
      // HA setzt „stumm“ immer wieder – der Wunsch gilt.
      this._pump = setInterval(function () {
        if (!self.isConnected) { self._teardown(); return; }
        self._applyAudio();
        self._fit();
      }, 1000);
    };
    P._teardown = function () {
      if (this._pump) { clearInterval(this._pump); this._pump = null; }
      this._mountId = (this._mountId || 0) + 1;
      if (this._card) { try { this._card.remove(); } catch (e) { /* weg */ } this._card = null; }
    };
    P._overlay = function (dead, privacy, idx) {
      var ov = this._root.querySelector('.ov'), self = this, cfg = this._cfg || {};
      var want = dead ? (privacy ? 'p' : idx ? 'c' : 'x') : '';
      if (ov._k === want) return;
      ov._k = want;
      if (!dead) { ov.hidden = true; ov.innerHTML = ''; this._obFn = null; return; }
      ov.hidden = false;
      if (privacy) {
        ov.innerHTML = '<ha-icon icon="mdi:eye-off-outline"></ha-icon><b>' + esc(tr('Privatsphäre an')) + '</b><small>'
          + esc(tr('Kamera und Ton der Klingel sind aus.')) + '</small><button class="ob" type="button">' + esc(tr('Ausschalten')) + '</button>';
        this._obFn = function () { self._call('switch', 'turn_off', cfg.privacy); };
      } else if (idx) {
        ov.innerHTML = '<ha-icon icon="mdi:cctv"></ha-icon><b>' + esc(tr('Kamera nicht erreichbar')) + '</b>';
        this._obFn = null;
      } else {
        ov.innerHTML = '<ha-icon icon="mdi:doorbell-video"></ha-icon><b>' + esc(tr('Klingel nicht erreichbar')) + '</b><small>'
          + esc(tr('Prüfe Strom und WLAN der Klingel.')) + '</small>';
        this._obFn = null;
      }
    };
    // Seitenverhältnis des Bildes übernehmen (Reolink-Klingeln 4:3, Akku-Klingeln hochkant 3:4), begrenzt.
    P._fit = function () {
      var m = this._video(), w = m && m.videoWidth, h = m && m.videoHeight;
      if (!w && this._card) {
        var img = null;
        (function walk(r, d) {
          if (!r || d > 10 || img) return;
          var i = r.querySelector && r.querySelector('img');
          if (i && i.naturalWidth) { img = i; return; }
          (r.querySelectorAll ? r.querySelectorAll('*') : []).forEach(function (x) { if (x.shadowRoot) walk(x.shadowRoot, d + 1); });
        })(this._card.shadowRoot || this._card, 0);
        if (img) { w = img.naturalWidth; h = img.naturalHeight; }
      }
      if (!w || !h) return;
      var ar = Math.max(0.75, Math.min(16 / 9, w / h)).toFixed(3);
      // An der Bühne: das große Bild rechnet seine Breite daraus.
      var fr = this._root.querySelector('.st');
      if (fr && fr.style.getPropertyValue('--ar') !== ar) fr.style.setProperty('--ar', ar);
    };
    P._video = function () { return this._card ? findVideo(this._card.shadowRoot || this._card, 0) || findVideo(this._card, 0) : null; };
    // Issue #23: only a real "no sound without a tap" (NotAllowedError) mutes; a play() interrupted by HA reloading
    // the stream (AbortError) used to switch listening off by itself a few seconds in.
    var blocked = function (err) { return !err || err.name === 'NotAllowedError'; };
    // A player HA built while muted has no audio track (WebRTC); unmuting it plays silence.
    var silent = function (v) {
      var so = v && v.srcObject;
      return !!(so && so.getAudioTracks && so.getTracks && so.getTracks().length && !so.getAudioTracks().length);
    };
    P._applyAudio = function () {
      var want = this._muted !== false;
      // #23: while the talk connection plays the doorbell, the player's video stays silent (no double sound); HA's
      // player itself stays unmuted so it keeps its audio track.
      var ear = this._t && this._t.hearing ? this._t.ear : null;
      if (ear && ear.muted !== want) ear.muted = want;
      if (this._native && this._card && this._card.muted !== want) {
        this._card.muted = want;
        // HA rebuilds its player muted and drops the audio track: the next "listen" has to mount a new one.
        if (want) this._mountedMuted = true;
      }
      var v = this._video();
      if (!v) return;
      if (ear) { if (!v.muted) v.muted = true; return; }
      if (v.muted !== want) v.muted = want;
      if (!want) {
        if (v.hasAttribute('muted')) v.removeAttribute('muted');
        if (!v.volume) v.volume = 0.9;
        if (v.paused && !this._playing) {
          var self = this, p = v.play();
          this._playing = true;
          // Browser lässt den Ton nicht zu (kein Tipp erkannt): zurück auf stumm statt eines Knopfs, der lügt.
          if (p && p.then) p.then(function () { self._playing = false; }, function (err) {
            self._playing = false;
            if (!blocked(err)) return;
            self._muted = true; self._applyAudio(); self._paint();
          });
          else this._playing = false;
        }
      }
    };
    // „Ton aufnehmen“ aus gilt nur, solange die Klingel zu sehen ist (zweite Kamera: eigener Ton).
    P._audioOff = function () {
      if (this._v && this._v.idx) return false;
      var a = this._st((this._cfg || {}).audio);
      return !!(a && a.state === 'off');
    };
    P._toggleSound = function () {
      if (this._audioOff() || !this._stream) return;
      if (window.casoraHaptic) window.casoraHaptic('light');
      this._muted = this._muted === false;
      // Mithören an: groß (Studio-Option, Standard an) – derselbe Player, nur in der obersten Ebene.
      if (!this._muted && (this._cfg || {}).big && !this._big) this._setBig(true);
      // Stumm eingebundener Player hat keine Tonspur: ohne „stumm“ neu einbinden (Tipp = Nutzeraktivierung).
      if (!this._muted && this._native && (this._mountedMuted || silent(this._video())) && this._v && !this._v.dead) {
        this._teardown();
        this._mount(this._stream);
      } else {
        var v = this._video();
        if (v && !this._muted) {
          v.muted = false;
          var self = this, p = v.play();
          // Browser lässt den Ton nicht zu (kein Tipp erkannt): zurück auf stumm statt eines Knopfs, der lügt.
          if (p && p.catch) p.catch(function (err) { if (blocked(err)) { self._muted = true; self._applyAudio(); self._paint(); } });
        }
      }
      this._applyAudio();
      this._paint();
    };
    P._note = function (text, ms) {
      this._msg = text ? { text: text, until: ms ? Date.now() + ms : 0 } : null;
      var self = this;
      if (this._msgT) clearTimeout(this._msgT);
      if (ms) this._msgT = setTimeout(function () { self._msg = null; self._paint(); }, ms);
      this._paint();
    };
    P._paint = function () {
      var r = this._root;
      if (!r) return;
      var off = this._muted !== false, cfg = this._cfg || {};
      var snd = r.querySelector('.snd'), bar = r.querySelector('.bar');
      // Ohne Bild (Privatsphäre, nicht erreichbar) gibt es nichts zu hören und nichts zu sagen: Leiste weg.
      var v = this._v || { dead: true, idx: 0, two: false };
      var dead = !this._key || v.dead;
      var audioOff = this._audioOff();
      // Groß-Knopf nur mit Bild; Umschalter (zweite Kamera) immer, auch über „nicht erreichbar“.
      var fs = r.querySelector('.fs');
      fs.hidden = dead || !!this._big;
      fs.setAttribute('aria-label', tr('Groß anzeigen'));
      fs.title = tr('Groß anzeigen');
      var x = r.querySelector('.x');
      x.hidden = !this._big;
      x.setAttribute('aria-label', tr('Schließen'));
      var sg = r.querySelector('.sg');
      if (sg) {
        sg.hidden = !v.two;
        sg.setAttribute('aria-label', tr('Kamera'));
        var names = [tr('Klingel'), cfg.cam2Name || ''];
        sg.querySelectorAll('.sgb').forEach(function (b, i) {
          if (b.textContent !== names[i]) b.textContent = names[i];
          b.setAttribute('aria-pressed', i === v.idx ? 'true' : 'false');
        });
      }
      // „Mithören“ feste Beschriftung, Zustand über aria-pressed, Symbol und helle Fläche. Ohne Stream (Standbild)
      // kein Knopf; Ton an der Klingel aus: gesperrt (der Hinweis darunter schaltet ihn ein).
      snd.hidden = !this._stream;
      snd.disabled = dead || audioOff;
      snd.classList.toggle('on', !off && !audioOff);
      snd.setAttribute('aria-pressed', off || audioOff ? 'false' : 'true');
      snd.querySelector('ha-icon').setAttribute('icon', off || audioOff ? 'mdi:volume-off' : 'mdi:volume-high');
      snd.querySelector('span').textContent = tr('Mithören');
      var tb = r.querySelector('.tlk'), canTalk = KL.canTalk();
      var shown = (snd.hidden ? 0 : 1) + (tb ? 1 : 0);
      bar.hidden = (dead && !this._t) || !shown;
      bar.style.setProperty('--n', String(Math.max(1, shown)));
      // Sprechen geht nur über die Klingel: bei der zweiten Kamera gesperrt (läuft es schon, bleibt „Beenden“).
      var away = !!v.idx && !this._t;
      if (tb) {
        tb.disabled = (dead && !this._t) || !canTalk || away;
        var t = this._t, st = t ? t.state : null;
        tb.classList.toggle('talk', st === 'on');
        tb.classList.toggle('busy', st === 'connecting');
        tb.setAttribute('aria-pressed', st === 'on' ? 'true' : 'false');
        tb.querySelector('ha-icon').setAttribute('icon', st === 'on' ? 'mdi:microphone' : 'mdi:microphone-outline');
        tb.querySelector('span').textContent = tr(st === 'on' ? 'Beenden' : st === 'connecting' ? 'Verbindet …' : 'Sprechen');
      }
      // Hinweiszeile: Meldung (Sprechen) vor „Ton ist an der Klingel aus“.
      var nt = r.querySelector('.nt'), nb = r.querySelector('.nb'), self = this;
      if (this._msg) {
        nt.hidden = false; nt.querySelector('span').textContent = tr(this._msg.text); nb.hidden = true; this._nbFn = null;
      } else if (audioOff && !dead && this._stream) {
        nt.hidden = false; nt.querySelector('span').textContent = tr('Ton ist an der Klingel aus');
        nb.hidden = false; nb.textContent = tr('Einschalten');
        this._nbFn = function () { self._call('switch', 'turn_on', cfg.audio); };
      } else if (tb && away && canTalk && !dead) {
        nt.hidden = false; nb.hidden = true; this._nbFn = null;
        nt.querySelector('span').textContent = tr('Sprechen geht nur über die Klingel');
      } else if (tb && !canTalk && !dead) {
        // Sprechen braucht das Mikrofon im Browser – das gibt es nur über HTTPS (bzw. localhost).
        nt.hidden = false; nb.hidden = true; this._nbFn = null;
        nt.querySelector('span').textContent = tr(window.isSecureContext ? 'Sprechen geht in diesem Browser nicht' : 'Sprechen braucht HTTPS');
      } else { nt.hidden = true; this._nbFn = null; }
    };

    // Großes Bild an/aus. Die Bühne (.st) bleibt, wo sie ist, und kommt als Popover in die oberste Ebene:
    // nichts wird umgehängt, darum laufen Player, Ton und Sprechen ohne Unterbrechung weiter. Esc (vor dem
    // Popup abgefangen), × und Wischen nach unten schließen nur das große Bild.
    P._setBig = function (on, quiet) {
      var r = this._root;
      on = !!on;
      if (!r || on === !!this._big || (on && !this.isConnected)) return;
      var st = r.querySelector('.st'), self = this;
      this._big = on;
      if (on) {
        st.classList.add('big');
        st.setAttribute('role', 'dialog');
        st.setAttribute('aria-modal', 'true');
        st.setAttribute('aria-label', tr('Live-Bild'));
        st.setAttribute('data-casora-esc', '');
        if (typeof st.showPopover === 'function') {
          try { st.setAttribute('popover', 'manual'); st.showPopover(); } catch (e) { st.removeAttribute('popover'); }
        }
        this._onKeyBig = function (ev) {
          if (ev.key !== 'Escape' && ev.key !== 'Esc') return;
          ev.preventDefault();
          ev.stopPropagation();
          self._setBig(false);
        };
        window.addEventListener('keydown', this._onKeyBig, true);
      } else {
        if (this._onKeyBig) window.removeEventListener('keydown', this._onKeyBig, true);
        this._onKeyBig = null;
        if (st.hasAttribute('popover')) {
          try { if (st.matches(':popover-open')) st.hidePopover(); } catch (e) { /* schon zu */ }
          st.removeAttribute('popover');
        }
        st.classList.remove('big');
        ['role', 'aria-modal', 'aria-label', 'data-casora-esc'].forEach(function (a) { st.removeAttribute(a); });
        var inn = st.querySelector('.in');
        inn.style.removeProperty('transform'); inn.style.removeProperty('transition'); st.style.removeProperty('background');
      }
      this._paint();
      if (quiet) return;
      if (window.casoraHaptic) window.casoraHaptic('light');
      try { r.querySelector(on ? '.x' : '.fs').focus({ preventScroll: true }); } catch (e) { /* ohne Fokus */ }
    };
    // Umschalter Klingel | zweite Kamera: anderes Bild in derselben Bühne; Ton-Wunsch bleibt (Tipp erlaubt den Ton).
    P._switch = function (i) {
      i = i === 1 ? 1 : 0;
      if (i === this._view) return;
      if (window.casoraHaptic) window.casoraHaptic('light');
      this._view = i;
      this._sync();
    };
    // Wischen nach unten schließt das große Bild (Handy). Berührungen im großen Bild gehen nicht ans Popup
    // darunter – dessen Wischen nach unten schlösse sonst das ganze Popup.
    P._bindSwipe = function (st) {
      var self = this, y0 = 0, x0 = 0, dy = 0, on = false, drag = false;
      var inn = function () { return st.querySelector('.in'); };
      var calm = function () {
        var el = inn();
        el.style.removeProperty('transform'); el.style.removeProperty('transition'); st.style.removeProperty('background');
      };
      st.addEventListener('touchstart', function (ev) {
        if (!self._big) return;
        ev.stopPropagation();
        var t = ev.touches && ev.touches[0];
        on = !!t && ev.touches.length === 1; drag = false; dy = 0;
        if (on) { y0 = t.clientY; x0 = t.clientX; }
      }, { passive: true });
      st.addEventListener('touchmove', function (ev) {
        if (!self._big) return;
        ev.stopPropagation();
        var t = ev.touches && ev.touches[0];
        if (!on || !t) return;
        var d = t.clientY - y0, dx = t.clientX - x0;
        if (!drag) {
          if (d < -8 || Math.abs(dx) > 16) { on = false; return; }
          if (d < 10 || Math.abs(dx) > d) return;
          drag = true;
        }
        dy = Math.max(0, d);
        if (ev.cancelable) ev.preventDefault();
        var el = inn();
        el.style.transition = 'none';
        el.style.transform = 'translateY(' + dy + 'px)';
        st.style.background = 'rgba(0,0,0,' + Math.max(0.4, 1 - dy / 500).toFixed(3) + ')';
      }, { passive: false });
      var end = function (ev) {
        if (!self._big) return;
        ev.stopPropagation();
        if (!on) return;
        on = false;
        if (!drag) return;
        drag = false;
        if (dy > 90) { calm(); self._setBig(false); return; }
        var el = inn();
        el.style.transition = 'transform 240ms var(--casora-ease-enter, cubic-bezier(.2,.8,.3,1))';
        el.style.transform = 'translateY(0)';
        st.style.removeProperty('background');
        setTimeout(function () { if (!drag) calm(); }, 260);
      };
      st.addEventListener('touchend', end);
      st.addEventListener('touchcancel', end);
    };

    // Sprechen (Versuch).
    P._talk = function (again) {
      if (this._t) { this._talkStop(); return; }
      var self = this, h = this._hass, id = (this._cfg || {}).entity;
      if (!h || !id || !KL.canTalk() || (this._v && this._v.idx)) return;
      if (!again) { this._talkRetried = false; if (window.casoraHaptic) window.casoraHaptic('medium'); }
      // Sprechen an: groß (Studio-Option, Standard an).
      if ((this._cfg || {}).big && !this._big) this._setBig(true);
      var t = this._t = { state: 'connecting', sid: null, queue: [] };
      this._note(null);
      this._paint();
      var fail = function (why, text) {
        if (self._t !== t) return;
        try { console.info('casora klingel: Sprechen geht nicht –', why); } catch (e) { /* still */ }
        self._talkStop(true);
        self._note(text || (self._stream ? 'Sprechen klappt mit dieser Klingel nicht – Mithören geht weiter' : 'Sprechen klappt mit dieser Klingel nicht'), 9000);
      };
      h.callWS({ type: 'camera/capabilities', entity_id: id }).catch(function () { return null; }).then(function (caps) {
        if (self._t !== t) return null;
        var types = (caps && caps.frontend_stream_types) || [];
        if (types.indexOf('web_rtc') < 0) { fail('webrtc-fehlt'); return null; }
        // #23 (26.10.62b5): Home Assistant 2026.11 talks itself (camera capability two_way_audio, its player's
        // toggleMicrophone). Then HA's way: it closes its stream and opens one session with picture and microphone.
        if (caps && caps.two_way_audio === true && self._native && self._card && typeof self._card.toggleMicrophone === 'function') {
          self._talkNative(t, fail);
          return null;
        }
        return h.callWS({ type: 'camera/webrtc/get_client_config', entity_id: id }).catch(function () { return {}; });
      }).then(function (conf) {
        if (!conf || self._t !== t) return null;
        t.conf = conf;
        // #23: no automatic gain, it pumped the level up and down mid-sentence.
        return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false })
          .catch(function (e) { fail('Mikrofon: ' + (e && e.name), e && /NotAllowed|Security/.test(e.name) ? 'Kein Zugriff aufs Mikrofon – im Browser erlauben' : null); return null; });
      }).then(function (mic) {
        if (!mic) return null;
        if (self._t !== t) { mic.getTracks().forEach(function (x) { x.stop(); }); return null; }
        t.mic = mic;
        // Zeitlimit erst ab hier: die Mikrofon-Frage des Browsers darf dauern, ohne dass Sprechen abbricht.
        t.timer = setTimeout(function () { if (t.state !== 'on') fail('zeit-abgelaufen'); }, 12000);
        // #23 (26.10.62b5): like Home Assistant's own talk – the player's stream closes and one session carries picture
        // and microphone. A second connection next to the player kept go2rtc's back channel to the doorbell busy: the
        // first try talked, later ones only got silence (go2rtc frees it only when the stream with it closes).
        if (self._native) { t.own = true; self._teardown(); }
        var pc = t.pc = new RTCPeerConnection((t.conf && t.conf.configuration) || {});
        pc.addTransceiver(mic.getAudioTracks()[0], { direction: 'sendrecv', streams: [mic] });
        if (t.own) pc.addTransceiver('video', { direction: 'recvonly' });
        if (t.conf && t.conf.dataChannel) { try { pc.createDataChannel(t.conf.dataChannel); } catch (e) { /* ohne */ } }
        // #23: while talking, hear the doorbell through this connection. Opening the back channel can restart the
        // doorbell's stream and take the sound out of the player; the talk connection carries it the whole time.
        pc.ontrack = function (ev) {
          if (self._t !== t || !ev.track) return;
          // The picture of the shared session, where the player was (muted: the sound runs through t.ear).
          if (ev.track.kind === 'video' && t.own && !t.eye) {
            var vid = t.eye = document.createElement('video');
            vid.autoplay = true; vid.muted = true; vid.playsInline = true;
            vid.setAttribute('playsinline', '');
            vid.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
            vid.srcObject = new MediaStream([ev.track]);
            var mt = self._root && self._root.querySelector('.mt');
            if (mt) mt.appendChild(vid);
            var pv = vid.play(); if (pv && pv.catch) pv.catch(function () {});
            return;
          }
          if (t.ear || ev.track.kind !== 'audio') return;
          var a = t.ear = document.createElement('audio');
          a.autoplay = true;
          a.setAttribute('playsinline', '');
          a.style.display = 'none';
          a.muted = self._muted !== false;
          a.srcObject = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
          try { self._root.appendChild(a); } catch (e) { /* without */ }
          // Only while sound really arrives on the talk connection (bytes received grow): otherwise the player's
          // own sound stays (#23, 26.10.56 muted the player as soon as the talk connection stood, silent or not).
          var on = function () {
            if (self._t !== t || t.flowT) return;
            t.hearing = false;
            var tick = 0;
            t.flowT = setInterval(function () {
              if (self._t !== t) return;
              KL.audioStats(pc).then(function (a) {
                if (self._t !== t) return;
                var flowing = KL.flowStep(t, a.inBytes, Date.now(), a.inLevel);
                if (flowing !== t.hearing) {
                  t.hearing = flowing;
                  try { console.info('casora klingel: Ton über die Sprechverbindung', flowing ? 'an' : 'aus', a.inBytes); } catch (e) { /* quiet */ }
                  self._applyAudio();
                }
                // Every 2 s: is it real sound or silence, and does the microphone send?
                if (++tick % 2 === 0) {
                  try { console.info('casora klingel: Pegel', JSON.stringify(KL.levelLine(a))); } catch (e) { /* quiet */ }
                }
                // Silent session: once more, by itself (first camera only – the second one cannot talk).
                if (KL.retryWanted(self) && KL.silentStep(t, a.inLevel, a.inBytes, Date.now())) {
                  self._talkRetried = true;
                  try { console.info('casora klingel: Sprechverbindung bleibt still – neuer Versuch'); } catch (e) { /* quiet */ }
                  self._talkStop(true);
                  self._note('Kein Ton von der Klingel – neuer Versuch …', 4000);
                  setTimeout(function () { if (KL.retryGo(self, document)) self._talk(true); }, 1500);
                }
              });
            }, 1000);
          };
          var p = a.play();
          // Browser refuses: the player's own sound stays.
          if (p && p.then) p.then(on, function () {}); else on();
        };
        pc.onicecandidate = function (ev) {
          if (!ev.candidate || self._t !== t) return;
          var cand = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
          if (t.sid) h.callWS({ type: 'camera/webrtc/candidate', entity_id: id, session_id: t.sid, candidate: cand }).catch(function () {});
          else t.queue.push(cand);
        };
        pc.onconnectionstatechange = function () {
          if (self._t !== t) return;
          var cs = pc.connectionState;
          try { console.info('casora klingel: Sprechen', cs); } catch (e) { /* quiet */ }
          if (cs === 'connected' && t.state !== 'on') {
            t.state = 'on';
            clearTimeout(t.timer);
            t.timer = setTimeout(function () { if (self._t === t) { self._talkStop(); self._note('Sprechen nach 90 Sekunden beendet', 6000); } }, TALK_MAX);
            if (window.casoraHaptic) window.casoraHaptic('success');
            self._paint();
          } else if (cs === 'failed' || cs === 'closed' || (cs === 'disconnected' && t.state === 'on')) {
            if (t.state === 'on') { self._talkStop(); self._note('Verbindung zur Klingel beendet', 6000); }
            else fail('Verbindung ' + cs);
          }
        };
        return pc.createOffer().then(function (offer) {
          return pc.setLocalDescription(offer).then(function () { return offer; });
        }).then(function (offer) {
          if (self._t !== t) return null;
          return h.connection.subscribeMessage(function (msg) {
            if (self._t !== t || !msg) return;
            if (msg.type === 'session') {
              t.sid = msg.session_id;
              t.queue.splice(0).forEach(function (cand) {
                h.callWS({ type: 'camera/webrtc/candidate', entity_id: id, session_id: t.sid, candidate: cand }).catch(function () {});
              });
            } else if (msg.type === 'answer') {
              if (!KL.talkAccepted(msg.answer)) { fail('ohne-rueckkanal'); return; }
              pc.setRemoteDescription({ type: 'answer', sdp: msg.answer }).catch(function (e) { fail('Antwort: ' + (e && e.message)); });
            } else if (msg.type === 'candidate' && msg.candidate) {
              // go2rtc schickt Kandidaten ohne sdpMid/sdpMLineIndex – wie HAs Frontend der ersten Spur zuordnen.
              var cc = KL.candidate(msg.candidate);
              pc.addIceCandidate(cc).catch(function () {});
            } else if (msg.type === 'error') fail('HA: ' + (msg.code || '') + ' ' + (msg.message || ''));
          }, { type: 'camera/webrtc/offer', entity_id: id, offer: offer.sdp });
        }).then(function (unsub) {
          if (!unsub) return;
          if (self._t !== t) { try { unsub(); } catch (e) { /* zu */ } return; }
          t.unsub = unsub;
        });
      }).catch(function (e) { fail(e && e.message); });
    };
    // HA 2026.11: talk through HA's own player (ha-camera-stream.toggleMicrophone, event microphone-changed with
    // state off | connecting | on | denied). The doorbell's sound comes with the player, so it plays unmuted.
    P._talkNative = function (t, fail) {
      var self = this, card = this._card;
      t.native = true;
      if (this._muted !== false) { this._muted = false; this._applyAudio(); }
      t.onMic = function (ev) {
        if (self._t !== t) return;
        var st = (ev && ev.detail && ev.detail.state) || card.microphoneState;
        if (st === 'denied') { fail('Mikrofon: denied', 'Kein Zugriff aufs Mikrofon – im Browser erlauben'); return; }
        if (st === 'on' && t.state !== 'on') {
          t.state = 'on';
          clearTimeout(t.timer);
          t.timer = setTimeout(function () { if (self._t === t) { self._talkStop(); self._note('Sprechen nach 90 Sekunden beendet', 6000); } }, TALK_MAX);
          if (window.casoraHaptic) window.casoraHaptic('success');
          try { console.info('casora klingel: Sprechen über Home Assistant'); } catch (e) { /* quiet */ }
          self._paint();
        } else if (st === 'off' && t.state === 'on') { self._talkStop(); }
      };
      card.addEventListener('microphone-changed', t.onMic);
      t.timer = setTimeout(function () { if (t.state !== 'on') fail('zeit-abgelaufen'); }, 12000);
      Promise.resolve(card.toggleMicrophone()).catch(function (e) { fail('HA: ' + (e && e.message)); });
    };
    // Immer alles freigeben: Spur stoppen (Mikrofon-Anzeige aus), Verbindung schließen, Abo beenden.
    P._talkStop = function (quiet) {
      var t = this._t;
      if (!t) return;
      this._t = null;
      clearTimeout(t.timer);
      if (t.flowT) clearInterval(t.flowT);
      if (t.mic) t.mic.getTracks().forEach(function (x) { try { x.stop(); } catch (e) { /* schon aus */ } });
      if (t.pc) { try { t.pc.getSenders().forEach(function (s) { if (s.track) s.track.stop(); }); } catch (e) { /* zu */ } try { t.pc.close(); } catch (e) { /* zu */ } }
      if (t.unsub) { var u = t.unsub; Promise.resolve(u).then(function (fn) { try { if (typeof fn === 'function') fn(); } catch (e) { /* zu */ } }); }
      if (t.ear) { try { t.ear.pause(); t.ear.srcObject = null; t.ear.remove(); } catch (e) { /* gone */ } }
      if (t.eye) { try { t.eye.pause(); t.eye.srcObject = null; t.eye.remove(); } catch (e) { /* gone */ } }
      if (t.native && this._card) {
        if (t.onMic) this._card.removeEventListener('microphone-changed', t.onMic);
        try { if (this._card.microphoneState && this._card.microphoneState !== 'off') this._card.toggleMicrophone(); } catch (e) { /* gone */ }
      }
      // #23: the session with the back channel ends with the stream – the player comes back fresh (shared session,
      // HA's own talk), and while listening also after the talk connection had the sound.
      var fresh = t.own || t.native || (t.hearing && this._muted === false && this._native);
      if (fresh && this.isConnected && this._v && !this._v.dead) {
        this._teardown();
        this._mount(this._stream);
      }
      this._applyAudio();
      if (!quiet && window.casoraHaptic) window.casoraHaptic('light');
      this._paint();
    };
    customElements.define('casora-klingel-live', KLive);
    // Seite im Hintergrund (Handy gesperrt): Sprechen beenden – sonst bliebe die Klingel im Sprechmodus.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') lives.forEach(function (n) { if (n._t) n._talkStop(true); });
    });
  }
})();
