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
//   <casora-klingel-live> – Live-Bild mit Ton und Sprechen (Karte im Popup)
(function () {
  if (window._casoraKlingel) return;
  var KL = window._casoraKlingel = {};

  var HOLD = 10 * 60000;          // so lange heißt die Kachel „Hat geklingelt“ (in Akzent)
  var DAYS = 3;                   // Verlauf im Popup (Text „In den letzten 3 Tagen“ mitändern)
  var TALK_MAX = 90000;           // Sprechen endet spätestens nach 90 s (Klingel bleibt sonst im Sprechmodus)
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var tr = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
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
  var CAM_KEYS = /^(telephoto_)?(sub|main|ext|snapshots_sub|snapshots_main)(_lens_\d+)?$/;
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
  // Live-Kamera fürs Studio: sub (Fluent) vor main (Clear); Schnappschuss-Kameras nie.
  KL.liveCam = function (hass, id) {
    var R = (hass && hass.entities) || {}, tk = String((R[id] || {}).translation_key || '');
    return KL.is(hass, id) && /^(sub|main)$/.test(tk);
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
      vol: {}, sw: {}, led: null, ledLight: null, siren: null, battery: null, wifi: null, dayNight: null, reolink: me.platform === 'reolink' };
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
    cache[id] = { R: R, D: D, c: c };
    return c;
  };
  KL.watch = function (c) {
    var out = [c.cam, c.visitor, c.motion, c.snap, c.quick, c.autoReply, c.autoTime, c.led, c.ledLight, c.siren, c.battery, c.wifi, c.dayNight];
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
  KL.events = function (c, now) {
    var h = hc[c.cam], all = ((h && h.list) || []).concat(seen[c.cam] || []);
    all.sort(function (x, y) { return y.at - x.at; });
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
  // Einmal je Änderung an Klingel/Erkennungen bzw. höchstens jede Minute neu fragen; danach neu zeichnen.
  KL.history = function (hass, c, el) {
    var S = (hass && hass.states) || {};
    var ids = [c.visitor].concat(c.order.map(function (o) { return c.det[o]; })).filter(Boolean);
    var key = ids.map(function (x) { return S[x] ? S[x].last_changed + S[x].state : ''; }).join('|');
    var hit = hc[c.cam];
    if (hit && el && hit.wait.indexOf(el) < 0) hit.wait.push(el);
    var fresh = hit && hit.key === key && Date.now() - hit.at < 60000;
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
        var recent = ids.some(function (x) { return S[x] && Date.now() - Date.parse(S[x].last_changed) < 12000; });
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
  // Kachel: Privatsphäre · geklingelt (HOLD lang, ohne „ · “ – casoraStateFit kürzte sonst zu „… +1“) ·
  // jetzt erkannt – sonst null (Kamera-Text: Bereit bzw. Alter des Bildes).
  // short (schmale Handy-Kachel): „Geklingelt“ ohne Zeit, sonst endete es als „Hat gekli…“.
  KL.tileText = function (s, now, short) {
    if (!s) return null;
    if (s.privacy) return 'Privatsphäre an';
    if (s.dead || s.off) return null;
    var t = now || Date.now();
    if (s.ring) return short ? 'Geklingelt' : t - s.ring < 60000 ? 'Hat geklingelt' : 'Geklingelt ' + KL.ago(s.ring, t);
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
  var clock = function (ms) { return new Date(ms).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }); };
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
    var v = variables || {};
    var live = { type: 'custom:casora-klingel-live', entity: id, audio: c.sw.audio || null, privacy: c.sw.privacy || null,
      talk: v.talk === true || v.talk === 'true' };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, live: { card: live },
      hist: { card: K.secCard(watch, call('hist'), states) } };
    var opts = c.quick && S[c.quick] ? (S[c.quick].attributes || {}).options : null;
    if ((Array.isArray(opts) && opts.length) || c.siren) f.say = { card: K.secCard(watch, call('say'), states) };
    if (KL.sec('more', c, S, hass)) f.more = { card: K.secCard(watch, call('more'), states) };
    // Live-Bild links über den Schnellantworten (volle Breite wäre 16:9 über 850 px), rechts der Verlauf,
    // darunter über beide Spalten die Einstellungen („Mehr“).
    return K.layout({ fields: f, top: ['hero'], left: ['live', 'say'], right: ['hist', 'more'],
      narrowOrder: ['live', 'say', 'hist', 'more'] });
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
    return { icon: icon, iconTone: isOn ? 'accent' : 'rgba(0,0,0,0)', label: label, sub: sub || null, value: isOn ? 'An' : 'Aus',
      svc: { domain: 'switch', service: isOn ? 'turn_off' : 'turn_on', target: { entity_id: id } },
      confirm: ask && (ask === 'on' ? !isOn : isOn) ? (isOn ? 'Ausschalten' : 'Einschalten') : null };
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
      if (!s.dead && s.audio === false) rest.push('Ton aus');
      if (s.battery != null && s.battery <= 20) rest.push({ text: 'Akku ' + Math.round(s.battery) + ' %', tone: 'warn' });
      return UI.line(main, rest, { tone: tone });
    }
    if (part === 'say') {
      var out = '';
      var q = c.quick && S[c.quick], opts = q ? (q.attributes || {}).options : null;
      if (Array.isArray(opts) && opts.length) {
        var gone = q.state === 'unavailable';
        // Antippen: Rückfrage in der Zeile („Abspielen“), dann spielt die Klingel die Nachricht ab.
        out += UI.group(opts.map(function (o) {
          return { icon: 'mdi:message-reply-text-outline', iconTone: 'accent', label: String(o),
            svc: gone ? null : { domain: 'select', service: 'select_option', target: { entity_id: c.quick }, data: { option: o }, done: 'Spielt ab' },
            confirm: gone ? null : 'Abspielen' };
        }), 'Schnellantworten');
      }
      if (c.siren && S[c.siren] && S[c.siren].state !== 'unavailable') {
        var sOn = S[c.siren].state === 'on';
        var siren = sOn
          ? { icon: 'mdi:alarm-light', iconTone: 'bad', label: 'Sirene', sub: 'Antippen zum Stoppen', value: 'Läuft',
            valueTone: 'var(--casora-color-red-text, var(--casora-color-red))', svc: { domain: 'siren', service: 'turn_off', target: { entity_id: c.siren } } }
          : { icon: 'mdi:alarm-light-outline', iconTone: 'rgba(0,0,0,0)', label: 'Sirene', sub: 'Laut an der Tür, 10 Sekunden',
            svc: { domain: 'siren', service: 'turn_on', target: { entity_id: c.siren }, data: { duration: 10 }, done: 'Sirene läuft' }, confirm: 'Auslösen' };
        out += (out ? '<div style="height:8px"></div>' : '') + UI.group([siren], out ? null : 'An der Tür');
      }
      return out;
    }
    if (part === 'hist') {
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
        var max = more[c.cam] ? 30 : 8;
        var newest = list.filter(function (e) { return e.kind === 'ring'; })[0];
        o2 = UI.group(list.slice(0, max).map(function (e) {
          var dw = dayWord(e.at, now);
          var sub = dw ? dw + ', ' + clock(e.at) : clock(e.at) + ' · ' + KL.ago(e.at, now);
          var ring = e.kind === 'ring';
          // Klingeln in Gerätefarbe, Erkennungen ruhig (Sand) – so springen die Klingeldrücke ins Auge.
          return { icon: ICON[ring ? 'ring' : e.kind] || 'mdi:motion-sensor', iconTone: ring ? 'accent' : 'rgba(0,0,0,0)',
            label: ring ? 'Hat geklingelt' : KL.label(e.kind) + ' erkannt', sub: sub,
            // Letztes Klingeln, solange die Kachel es meldet (HOLD): rechts „Neu“ in Schrift-Rot.
            value: e === newest && now - e.at < HOLD ? 'Neu' : null,
            valueTone: e === newest && now - e.at < HOLD ? 'var(--casora-color-red-text, var(--casora-color-red))' : null };
        }), head);
        if (list.length > 8) o2 += pill(more[c.cam] ? 'Weniger anzeigen' : 'Mehr anzeigen', 'klingel-more:' + c.cam);
      }
      var media = KL.media(hass, c);
      if (media) o2 += '<div style="height:8px"></div>' + UI.group([{ icon: 'mdi:filmstrip-box-multiple', iconTone: 'accent', label: 'Aufnahmen',
        sub: 'In den Medien von Home Assistant', entity: 'klingel-go:' + media }], null);
      return o2;
    }
    if (part === 'more') {
      var secs = [];
      var vols = slider(UI, S, c.vol.bell, 'Klingelton') + slider(UI, S, c.vol.speak, 'Sprechen') + slider(UI, S, c.vol.spk, 'Lautsprecher');
      if (vols) secs.push(UI.label('Lautstärke') + vols.replace('<div style="margin-top:8px;">', '<div>'));
      var rows = [
        swRow(S, c.sw.bell, 'mdi:bell-ring-outline', 'Klingelton an der Tür', false),
        swRow(S, c.sw.audio, 'mdi:microphone-outline', 'Ton aufnehmen', true, 'Ohne Ton hörst du die Tür nicht'),
        swRow(S, c.sw.ir, 'mdi:weather-night', 'Infrarot bei Nacht', false),
        swRow(S, c.ledLight, 'mdi:led-on', 'Status-LED', false),
        swRow(S, c.sw.privacy, 'mdi:eye-off-outline', 'Privatsphäre', 'on', 'Kamera und Ton aus'),
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
      if (rows.length) secs.push(UI.group(rows, 'Klingel'));
      if (segs) secs.push(segs);
      var ar = c.autoReply && S[c.autoReply] && !bad(S[c.autoReply].state) ? S[c.autoReply] : null;
      var dev = [];
      if (ar) {
        var at2 = c.autoTime && S[c.autoTime] ? num(S[c.autoTime].state) : null;
        dev.push({ icon: 'mdi:message-badge-outline', iconTone: ar.state !== 'off' ? 'accent' : null, label: 'Automatische Antwort',
          sub: ar.state !== 'off' && at2 ? 'Nach ' + Math.round(at2) + ' s ohne Antwort' : null, value: ar.state === 'off' ? 'Aus' : String(ar.state), entity: c.autoReply });
      }
      if (c.battery && S[c.battery] && !bad(S[c.battery].state)) {
        var bv = Math.round(num(S[c.battery].state));
        dev.push({ icon: bv <= 20 ? 'mdi:battery-20' : 'mdi:battery-high', iconTone: bv <= 20 ? 'warn' : null, label: 'Akku', value: bv + ' %', valueTone: bv <= 20 ? 'warn' : null, entity: c.battery });
      }
      if (c.wifi && S[c.wifi] && !bad(S[c.wifi].state)) {
        var wv = num(S[c.wifi].state), unit = (S[c.wifi].attributes || {}).unit_of_measurement;
        // dBm (Reolink): gut ab −60, schwach unter −70; Stufen 0–4 (ältere Fassungen) wie angezeigt.
        var word = unit === 'dBm' ? (wv >= -60 ? 'Gut' : wv >= -70 ? 'Mittel' : 'Schwach') : (wv >= 3 ? 'Gut' : wv >= 2 ? 'Mittel' : 'Schwach');
        dev.push({ icon: 'mdi:wifi', iconTone: word === 'Schwach' ? 'warn' : null, label: 'WLAN', sub: unit === 'dBm' ? Math.round(wv) + ' dBm' : null,
          value: word, valueTone: word === 'Schwach' ? 'warn' : null, entity: c.wifi });
      }
      if (c.dayNight && S[c.dayNight] && !bad(S[c.dayNight].state)) {
        var dn = S[c.dayNight].state;
        dev.push({ icon: dn === 'night' ? 'mdi:weather-night' : 'mdi:white-balance-sunny', label: 'Bild',
          value: dn === 'night' ? 'Schwarz-Weiß' : dn === 'led_day' ? 'Farbe mit Licht' : 'Farbe' });
      }
      if (dev.length) secs.push(UI.group(dev, 'Gerät'));
      return secs.length ? UI.more('klingel', secs.map(function (x) { return '<div>' + x + '</div>'; }).join(''), { count: secs.length, label: 'Einstellungen' }) : '';
    }
    return '';
  };

  // ── Halten-Menü (22-halten.js): Ton hören, Schnellantworten ───────────────
  KL.hold = function (hass, id) {
    if (!KL.is(hass, id)) return [];
    var S = hass.states || {}, c = KL.find(hass, id), s = KL.status(c, S), out = [];
    if (!s.dead && !s.privacy && s.audio !== false) {
      out.push({ key: 'fn', t: 'Ton hören', ic: 'mdi:volume-high', fn: function () { KL.listen(id); } });
    }
    var q = c.quick && S[c.quick], opts = q && q.state !== 'unavailable' ? (q.attributes || {}).options : null;
    (Array.isArray(opts) ? opts.slice(0, 3) : []).forEach(function (o) {
      out.push({ key: 'act', t: 'Schnellantwort', sub: String(o), ic: 'mdi:message-reply-text-outline', svc: 'select.select_option',
        entity: c.quick, data: { option: o }, ask: 'An der Tür abspielen?', yes: 'Abspielen', done: 'Spielt ab' });
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
  // bei Reolink über go2rtc mit Ton, wenn „Ton aufnehmen“ an ist), ohne Stream als Standbild. Der Ton ist
  // aus, bis man ihn antippt (Browser spielen Ton erst nach einem Tipp); HA setzt „stumm“ bei jedem Update
  // neu, darum folgt das <video> jede Sekunde dem gewünschten Zustand (wie das Kamera-Popup).
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
    + '.ob{margin-top:6px;min-height:44px;padding:0 20px;display:inline-flex;align-items:center;gap:8px;border-radius:999px;cursor:pointer;border:0;'
    +   'font:inherit;font-size:14px;font-weight:600;background:var(--casora-glass-pill-fill, rgba(255,255,255,0.16));color:rgba(255,255,255,0.94);}'
    + '.bar{display:grid;grid-template-columns:repeat(var(--n,1),minmax(0,1fr));gap:10px;margin-top:10px;}'
    + '.b{box-sizing:border-box;min-height:46px;padding:0 12px;border:0;border-radius:var(--casora-soft-seg-radius, 18px);cursor:pointer;'
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
    + '.nb{flex:none;min-height:32px;padding:0 16px;border:0;border-radius:999px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;'
    +   'background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, var(--casora-popup-tiles-text-primary, #3A322B));'
    +   'box-shadow:var(--casora-soft-seg-on-shadow, none);position:relative;}'
    + '.nb::before{content:"";position:absolute;inset:-4px -4px;}'
    + '.nb[hidden]{display:none;}'
    + '@media (prefers-reduced-motion:reduce){.b{transition:none;}.b:active{transform:none;}}';

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
        this._talkStop(true);
        this._teardown();
        this._key = null;
      }
    }
    var P = KLive.prototype;
    P._build = function () {
      var r = this._root = this.attachShadow({ mode: 'open' });
      var talk = !!(this._cfg && this._cfg.talk) && KL.canTalk();
      r.innerHTML = '<style>' + CSS + '</style>'
        + '<div class="fr"><div class="mt"></div><div class="ov" hidden></div></div>'
        + '<div class="bar" style="--n:' + (talk ? 2 : 1) + '">'
        + '<button class="b snd" type="button"><ha-icon icon="mdi:volume-off"></ha-icon><span></span></button>'
        + (talk ? '<button class="b tlk" type="button"><ha-icon icon="mdi:microphone-outline"></ha-icon><span></span></button>' : '')
        + '</div>'
        + '<div class="nt" hidden><span></span><button class="nb" type="button" hidden></button></div>';
      var self = this;
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
      if (w && w.id === (this._cfg || {}).entity && Date.now() - w.at < 8000) { this._muted = false; KL._want = null; }
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
      var cfg = this._cfg || {}, st = this._st(cfg.entity);
      if (!st || !this._root || !this.isConnected) return;
      var priv = this._st(cfg.privacy);
      var privacy = !!(priv && priv.state === 'on');
      var dead = bad(st.state) || privacy;
      var stream = !!((Number((st.attributes || {}).supported_features) || 0) & 2);
      // Neu einbinden nur, wenn sich Erreichbarkeit oder Stream-Art ändert (nicht bei jedem Token-Wechsel).
      var key = (dead ? (privacy ? 'p' : 'x') : 'ok') + (stream ? 's' : 'i');
      if (key !== this._key) {
        this._key = key;
        this._teardown();
        if (!dead) this._mount(stream);
      }
      if (this._card) {
        this._card.hass = this._hass;
        if (this._native && this._card.stateObj !== st) this._card.stateObj = st;
      }
      this._overlay(dead, privacy);
      this._applyAudio();
      this._paint();
    };
    P._mount = function (stream) {
      var self = this, cfg = this._cfg || {}, mt = this._root.querySelector('.mt');
      var st = this._st(cfg.entity);
      if (stream && customElements.get('ha-camera-stream')) {
        var el = document.createElement('ha-camera-stream');
        el.controls = false;
        el.allowExoPlayer = false;
        // Stumm einbinden: HA wählt dann WebRTC (kurze Verzögerung, bei Reolink über go2rtc mit Ton);
        // den Ton schaltet das <video> selbst frei.
        el.muted = true;
        el.hass = this._hass;
        el.stateObj = st;
        mt.appendChild(el);
        this._card = el;
        this._native = true;
      } else if (window.loadCardHelpers) {
        var mine = this._mountId = (this._mountId || 0) + 1;
        window.loadCardHelpers().then(function (h) {
          return h.createCardElement({ type: 'picture-entity', entity: cfg.entity, camera_view: stream ? 'live' : 'auto',
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
    P._overlay = function (dead, privacy) {
      var ov = this._root.querySelector('.ov'), self = this, cfg = this._cfg || {};
      var want = dead ? (privacy ? 'p' : 'x') : '';
      if (ov._k === want) return;
      ov._k = want;
      if (!dead) { ov.hidden = true; ov.innerHTML = ''; this._obFn = null; return; }
      ov.hidden = false;
      if (privacy) {
        ov.innerHTML = '<ha-icon icon="mdi:eye-off-outline"></ha-icon><b>' + esc(tr('Privatsphäre an')) + '</b><small>'
          + esc(tr('Kamera und Ton der Klingel sind aus.')) + '</small><button class="ob" type="button">' + esc(tr('Ausschalten')) + '</button>';
        this._obFn = function () { self._call('switch', 'turn_off', cfg.privacy); };
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
      var fr = this._root.querySelector('.fr');
      if (fr && fr.style.getPropertyValue('--ar') !== ar) fr.style.setProperty('--ar', ar);
    };
    P._video = function () { return this._card ? findVideo(this._card.shadowRoot || this._card, 0) || findVideo(this._card, 0) : null; };
    P._applyAudio = function () {
      var v = this._video();
      if (!v) return;
      var want = this._muted !== false;
      if (v.muted !== want) v.muted = want;
      if (!want) {
        if (v.hasAttribute('muted')) v.removeAttribute('muted');
        if (!v.volume) v.volume = 0.9;
        if (v.paused) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      }
    };
    P._audioOff = function () {
      var a = this._st((this._cfg || {}).audio);
      return !!(a && a.state === 'off');
    };
    P._toggleSound = function () {
      if (window.casoraHaptic) window.casoraHaptic('light');
      this._muted = this._muted === false;
      var v = this._video();
      if (v && !this._muted) {
        v.muted = false;
        var self = this, p = v.play();
        // Browser lässt den Ton nicht zu (kein Tipp erkannt): zurück auf stumm statt eines Knopfs, der lügt.
        if (p && p.catch) p.catch(function () { self._muted = true; self._applyAudio(); self._paint(); });
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
      var snd = r.querySelector('.snd');
      // Ohne Bild (Privatsphäre, nicht erreichbar) gibt es nichts zu hören und nichts zu sagen.
      var dead = !this._key || this._key.charAt(0) !== 'o';
      snd.disabled = dead;
      snd.classList.toggle('on', !off);
      snd.setAttribute('aria-pressed', off ? 'false' : 'true');
      snd.querySelector('ha-icon').setAttribute('icon', off ? 'mdi:volume-off' : 'mdi:volume-high');
      snd.querySelector('span').textContent = tr(off ? 'Ton an' : 'Ton aus');
      var tb = r.querySelector('.tlk');
      if (tb) {
        tb.disabled = dead && !this._t;
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
      } else if (this._audioOff() && this._key && this._key.charAt(0) === 'o') {
        nt.hidden = false; nt.querySelector('span').textContent = tr('Ton ist an der Klingel aus');
        nb.hidden = false; nb.textContent = tr('Einschalten');
        this._nbFn = function () { self._call('switch', 'turn_on', cfg.audio); };
      } else { nt.hidden = true; this._nbFn = null; }
    };

    // Sprechen (Versuch).
    P._talk = function () {
      if (this._t) { this._talkStop(); return; }
      var self = this, h = this._hass, id = (this._cfg || {}).entity;
      if (!h || !id || !KL.canTalk()) return;
      if (window.casoraHaptic) window.casoraHaptic('medium');
      var t = this._t = { state: 'connecting', sid: null, queue: [] };
      this._note(null);
      this._paint();
      var fail = function (why, text) {
        if (self._t !== t) return;
        try { console.info('casora klingel: Sprechen geht nicht –', why); } catch (e) { /* still */ }
        self._talkStop(true);
        self._note(text || 'Sprechen klappt mit dieser Klingel nicht – Ton hören geht weiter', 9000);
      };
      t.timer = setTimeout(function () { if (t.state !== 'on') fail('zeit-abgelaufen'); }, 12000);
      h.callWS({ type: 'camera/capabilities', entity_id: id }).catch(function () { return null; }).then(function (caps) {
        if (self._t !== t) return null;
        var types = (caps && caps.frontend_stream_types) || [];
        if (types.indexOf('web_rtc') < 0) { fail('webrtc-fehlt'); return null; }
        return h.callWS({ type: 'camera/webrtc/get_client_config', entity_id: id }).catch(function () { return {}; });
      }).then(function (conf) {
        if (!conf || self._t !== t) return null;
        t.conf = conf;
        return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
          .catch(function (e) { fail('Mikrofon: ' + (e && e.name), e && /NotAllowed|Security/.test(e.name) ? 'Kein Zugriff aufs Mikrofon – im Browser erlauben' : null); return null; });
      }).then(function (mic) {
        if (!mic) return null;
        if (self._t !== t) { mic.getTracks().forEach(function (x) { x.stop(); }); return null; }
        t.mic = mic;
        var pc = t.pc = new RTCPeerConnection((t.conf && t.conf.configuration) || {});
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver(mic.getAudioTracks()[0], { direction: 'sendrecv', streams: [mic] });
        if (t.conf && t.conf.dataChannel) { try { pc.createDataChannel(t.conf.dataChannel); } catch (e) { /* ohne */ } }
        pc.onicecandidate = function (ev) {
          if (!ev.candidate || self._t !== t) return;
          var cand = ev.candidate.toJSON ? ev.candidate.toJSON() : ev.candidate;
          if (t.sid) h.callWS({ type: 'camera/webrtc/candidate', entity_id: id, session_id: t.sid, candidate: cand }).catch(function () {});
          else t.queue.push(cand);
        };
        pc.onconnectionstatechange = function () {
          if (self._t !== t) return;
          var cs = pc.connectionState;
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
              var cc = typeof msg.candidate === 'string' ? { candidate: msg.candidate, sdpMLineIndex: 0 } : msg.candidate;
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
    // Immer alles freigeben: Spur stoppen (Mikrofon-Anzeige aus), Verbindung schließen, Abo beenden.
    P._talkStop = function (quiet) {
      var t = this._t;
      if (!t) return;
      this._t = null;
      clearTimeout(t.timer);
      if (t.mic) t.mic.getTracks().forEach(function (x) { try { x.stop(); } catch (e) { /* schon aus */ } });
      if (t.pc) { try { t.pc.getSenders().forEach(function (s) { if (s.track) s.track.stop(); }); } catch (e) { /* zu */ } try { t.pc.close(); } catch (e) { /* zu */ } }
      if (t.unsub) { var u = t.unsub; Promise.resolve(u).then(function (fn) { try { if (typeof fn === 'function') fn(); } catch (e) { /* zu */ } }); }
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
