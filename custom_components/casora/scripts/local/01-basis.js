/* Spalten in Popups: Abstand nur zwischen Bereichen, die etwas anzeigen.
   Ein fester row-gap ließ leere Bereiche (z. B. "Hinweise" ohne Meldung)
   trotzdem 18 px belegen, dadurch standen die Überschriften links und
   rechts nicht auf einer Höhe (23.09.). */
/* Zahlen für die Anzeige (30.09.2026): Dezimalkomma in deutscher Oberfläche statt toFixed-Punkt.
   casoraNum(v, min[, max]) – min/max Nachkommastellen (max fehlt = genau min). Nur für Text,
   nie für Breiten/Stile. Vorlagen rufen das mit eigenem Ersatz auf (Studio-Vorschau lädt
   die lokalen Module nicht). */
window.casoraNum = function (v, min, max) {
  var n = Number(v);
  if (v == null || v === '' || !isFinite(n)) return String(v == null ? '' : v);
  var a = Math.max(0, Math.min(20, Number(min) || 0));
  var b = max == null ? a : Math.max(a, Math.min(20, Number(max) || 0));
  var loc = window.casoraLocale ? window.casoraLocale() : 'de-DE';
  try { return n.toLocaleString(loc, { minimumFractionDigits: a, maximumFractionDigits: b }); }
  catch (e) { return n.toLocaleString('de-DE', { minimumFractionDigits: a, maximumFractionDigits: b }); }
};
/* Auswahllisten (23.09.2026): statt Haken die aktive Zeile hinterlegen wie im Netzwerk-Popup.
   html = UI.group(...), labels = Beschriftungen der aktiven Zeile(n). */
window._casoraSelRows = function (html, labels) {
  var e = (window._casoraUI && window._casoraUI.esc) || function (t) { return t; };
  [].concat(labels || []).forEach(function (l) {
    if (l == null) return;
    var at = html.indexOf('>' + e(String(l)) + '<');
    var rs = at > -1 ? html.lastIndexOf('class="hui-row', at) : -1;
    if (rs > -1) html = html.slice(0, rs) + 'class="fb-sel ' + html.slice(rs + 7);
  });
  return '<style>.hui-row.fb-sel{background:var(--casora-popup-row-hover, rgba(255,255,255,0.08));}</style>' + html;
};
/* Popup-Titel einer Kachel (30.09.2026): eigener Popup-Titel (room_name) → Name der Kachel →
   Standard des Typs. Aus Hemma übernommene Kacheln tragen in room_name den Raum („Home“) –
   ein room_name, der genau ein Raumname dieses Dashboards ist, gilt darum nicht als Titel.
   card = die button-card (this im Template), def = Standardtitel des Typs. */
window._casoraLovelaceCfg = function () {
  var ll = window._casoraLLEl;
  if (!ll || !ll.isConnected) {
    ll = null;
    (function find(root, d) {
      if (ll || !root || d > 8) return;
      var hit = root.querySelector && root.querySelector('ha-panel-lovelace');
      if (hit) { ll = hit; return; }
      var all = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (var i = 0; i < all.length && !ll; i++) if (all[i].shadowRoot) find(all[i].shadowRoot, d + 1);
    })(document.querySelector('home-assistant') && document.querySelector('home-assistant').shadowRoot, 0);
    window._casoraLLEl = ll;
  }
  return (ll && ll.lovelace && ll.lovelace.config) || null;
};
/* Szenenfarbe aus dem Studio (06.10.2026, B-SZENE): das Studio schreibt sie beim Speichern in
   casora_scene_row.variables.scene_colors des Dashboards – die gilt (auch nach Zurücksetzen).
   Ohne diese Vorlage (YAML-Dashboards): was Leiste/Szenenreihe gemeldet haben (_casoraSC.iconColors).
   Ergebnis ist ein CSS-Wert (meist var(--casora-color-…, #hex)) oder null. */
window.casoraSceneColor = function (id) {
  if (!id) return null;
  var map = null;
  try {
    var cfg = window._casoraLovelaceCfg && window._casoraLovelaceCfg();
    var row = cfg && cfg.button_card_templates && cfg.button_card_templates.casora_scene_row;
    if (row && row.variables && 'scene_colors' in row.variables) map = row.variables.scene_colors || {};
  } catch (e) { map = null; }
  if (Array.isArray(map)) map = Object.assign.apply(null, [{}].concat(map.filter(function (x) { return x && typeof x === 'object'; })));
  if (!map) map = (window._casoraSC && window._casoraSC.iconColors) || {};
  var c = map[id];
  return c ? String(c).replace(/["<>;{}]/g, '') : null;
};
/* Leistung fürs Energie-Badge, wenn die Badge selbst keinen Sensor bekommt (03.10.2026):
   Handy-Badge-Reihe und Räume, in denen Energie nur über Verbrauch/Kosten/Geräte an ist,
   zeigten nur „Energie“ ohne Wert und waren dadurch niedriger. Reihenfolge: die
   Energie-Kachel (casora_energy) der aktuellen Ansicht – dieselbe Zahl wie dort –, auf Home
   bzw. am Handy sonst der Hausverbrauch wie beim Einrichten (hausbedarf → gesamt → Netz). */
window._casoraHousePower = function () {
  try {
    var ha = document.querySelector('home-assistant');
    var hass = ha && ha.hass; if (!hass) return null;
    var S = hass.states || {}, R = hass.entities || {};
    var isPower = function (id) {
      var s = id && S[id]; if (!s) return false;
      var a = s.attributes || {};
      if (!(a.device_class === 'power' || /^[kMG]?W$/.test(String(a.unit_of_measurement || '')))) return false;
      return isFinite(parseFloat(s.state));
    };
    var cfg = window._casoraLovelaceCfg && window._casoraLovelaceCfg();
    var views = (cfg && Array.isArray(cfg.views)) ? cfg.views : [];
    var seg = decodeURIComponent(String(location.pathname || '').split('/').filter(Boolean)[1] || '');
    var vi = views.findIndex(function (v) { return v && String(v.path || '') === seg; });
    if (vi < 0 && /^\d+$/.test(seg)) vi = Number(seg);
    if (vi < 0 || !views[vi]) vi = 0;
    var key = vi + '|' + views.length;
    if (window._casoraHPCfg !== cfg || window._casoraHPKey !== key) {
      var tiles = [];
      (function walk(x, d) {
        if (!x || typeof x !== 'object' || d > 10) return;
        if (Array.isArray(x)) { x.forEach(function (y) { walk(y, d + 1); }); return; }
        if ([].concat(x.template || []).indexOf('casora_energy') > -1) {
          var V = x.variables || {};
          [V.entity_power, x.entity].forEach(function (id) { if (typeof id === 'string' && id.indexOf('[[[') < 0) tiles.push(id); });
        }
        walk(x.cards, d + 1); walk(x.card, d + 1); walk(x.sections, d + 1);
      })(views[vi], 0);
      window._casoraHPCfg = cfg; window._casoraHPKey = key; window._casoraHPTiles = tiles;
    }
    var hit = (window._casoraHPTiles || []).find(isPower);
    if (hit) return hit;
    // Hausverbrauch nur für Home (erste Ansicht) bzw. das Handy (eine Ansicht), nicht für Räume.
    if (cfg && vi !== 0 && views.length > 1) return null;
    var c = window._casoraHPGuess;
    if (c && Date.now() - c.t < 60000 && (c.id === null || isPower(c.id))) return c.id;
    var HOUSE = [/hausbedarf|hausverbrauch|haus.?leistung|house.?(power|consumption)|home.?(power|consumption)/i,
      /gesamt|total/i, /netzbezug|grid|smart.?meter|stromz(ä|ae)hler/i];
    var powers = Object.keys(S).filter(function (id) {
      return id.indexOf('sensor.') === 0 && ((S[id].attributes || {}).device_class) === 'power'
        && isFinite(parseFloat(S[id].state)) && !((R[id] || {}).entity_category);
    });
    var id = null;
    for (var i = 0; i < HOUSE.length && !id; i++) {
      id = powers.find(function (p) { return HOUSE[i].test(p + ' ' + ((S[p].attributes || {}).friendly_name || '')); }) || null;
    }
    window._casoraHPGuess = { t: Date.now(), id: id };
    return id;
  } catch (e) { return null; }
};
window._casoraRoomNames = function () {
  try {
    var cfg = window._casoraLovelaceCfg();
    if (!cfg || !Array.isArray(cfg.views)) return [];
    if (window._casoraRoomNamesCfg === cfg) return window._casoraRoomNamesList;
    var out = [];
    cfg.views.forEach(function (v) {
      if (v && v.title) out.push(String(v.title).trim());
      (function walk(x, d) {
        if (!x || typeof x !== 'object' || d > 6) return;
        if (Array.isArray(x)) { x.forEach(function (y) { walk(y, d + 1); }); return; }
        if ([].concat(x.template || []).indexOf('casora_room') > -1 && typeof x.name === 'string' && x.name.indexOf('[[[') < 0) out.push(x.name.trim());
        walk(x.cards, d + 1);
      })(v && v.cards, 0);
    });
    window._casoraRoomNamesCfg = cfg;
    window._casoraRoomNamesList = out.filter(Boolean);
    return window._casoraRoomNamesList;
  } catch (e) { return []; }
};
/* defaults = Vorgaben der Vorlagen für room_name (z. B. „Waschmaschine“): kein eigener Titel,
   aber besser als der allgemeine Standard, wenn die Kachel keinen Namen hat. */
/* Raum einer Kachel-Entität laut Dashboard (nicht laut HA-Bereich): ein im Studio umbenannter
   Raum („Kochecke“, Bereich „Küche“) soll auch im Popup so heißen. Nur eindeutige Treffer
   (Entität liegt in genau einem Raum); Home und „Favoriten“ zählen nicht als Raum. */
window._casoraRoomOf = function (eid) {
  if (!eid) return null;
  try {
    var cfg = window._casoraLovelaceCfg();
    if (!cfg || !Array.isArray(cfg.views)) return null;
    if (window._casoraRoomOfCfg !== cfg) {
      var map = {};
      var skip = /^(home|favoriten|favorites|zuhause)$/i;
      var add = function (room, e) {
        if (!room || skip.test(room) || typeof e !== 'string') return;
        (map[e] = map[e] || []).indexOf(room) < 0 && map[e].push(room);
      };
      var tpl = function (x) { return [].concat((x && x.template) || []); };
      cfg.views.forEach(function (v, vi) {
        // Desktop: die erste Ansicht ist Home. Handy: eine Ansicht, Räume stehen unter Kopfzeilen.
        if (!v || (vi === 0 && cfg.views.length > 1)) return;
        var hero = null;
        (function findHero(x, d) {
          if (hero || !x || typeof x !== 'object' || d > 6) return;
          if (Array.isArray(x)) { x.forEach(function (y) { findHero(y, d + 1); }); return; }
          if (tpl(x).indexOf('casora_room') > -1 && typeof x.name === 'string' && x.name.indexOf('[[[') < 0) { hero = x.name.trim(); return; }
          findHero(x.cards, d + 1);
        })(v.cards, 0);
        (function walk(list, room, d) {
          if (!Array.isArray(list) || d > 8) return;
          var cur = room;
          list.forEach(function (c) {
            if (!c || typeof c !== 'object') return;
            if (tpl(c).indexOf('casora_mobile_header') > -1 && typeof c.name === 'string') { cur = (c.variables && c.variables.favorites === true) ? 'Favorites' : c.name.trim(); return; }
            if (c.type === 'custom:button-card' && tpl(c).indexOf('casora_room') < 0) add(cur, c.entity);
            walk(c.cards, cur, d + 1);
          });
        })(v.cards, hero, 0);
      });
      window._casoraRoomOfCfg = cfg;
      window._casoraRoomOfMap = map;
    }
    var hit = window._casoraRoomOfMap[eid];
    return hit && hit.length === 1 ? hit[0] : null;
  } catch (e) { return null; }
};
window.casoraPopupTitle = function (card, variables, def, defaults) {
  var V = variables || {};
  var own = String(V.room_name || '').trim();
  if (own && own.indexOf('[[[') === 0) own = '';
  var typeDef = '';
  if (own && (own === def || [].concat(defaults || []).indexOf(own) > -1)) { typeDef = own; own = ''; }
  if (own && window._casoraRoomNames().indexOf(own) > -1) own = '';
  /* Umzug aus Hemma: room_name blieb der alte Raumname („Living Room“), die Ansicht heißt
     jetzt „Wohnzimmer“, ihr Pfad aber noch living-room – auch das ist ein Raum, kein Titel. */
  if (own) {
    var slug = own.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var cfg = window._casoraLovelaceCfg && window._casoraLovelaceCfg();
    if (/^(home|zuhause)$/.test(slug) || (cfg && Array.isArray(cfg.views) && cfg.views.some(function (v) { return v && String(v.path || '') === slug; }))) own = '';
  }
  if (own) return own;
  var n = String((card && card._config && card._config.name) || '').trim();
  if (n && n.indexOf('[[[') < 0) return n;
  return typeDef || def || '';
};
/* Kann die Kamera wirklich streamen? (30.09.2026) Manche melden STREAM in supported_features,
   liefern aber keinen Stream („does not support play stream service“) – das Video blieb schwarz.
   Nur HLS lässt sich vorab prüfen (camera/stream); WebRTC gilt als ok. Ergebnis 5 Min. gemerkt. */
window._casoraStreamOk = function (hass, id) {
  var c = window._casoraStreamCache || (window._casoraStreamCache = {});
  if (c[id] && Date.now() - c[id].t < 300000) return c[id].p;
  var p = !hass || !hass.callWS ? Promise.resolve(true) : hass.callWS({ type: 'camera/capabilities', entity_id: id }).then(function (r) {
    var t = (r && r.frontend_stream_types) || [];
    if (t.indexOf('web_rtc') > -1) return true;
    if (t.indexOf('hls') < 0) return false;
    return hass.callWS({ type: 'camera/stream', entity_id: id }).then(function () { return true; }, function () { return false; });
  }, function () { return true; });
  c[id] = { t: Date.now(), p: p };
  return p;
};
/* Liefert die Kamera überhaupt ein Bild? Nur noch als Antwort für das Popup (Hinweis statt leerer
   grauer Fläche), nicht mehr für „offline“ (05.10.2026): langsame Kameras (Reolink E1 Zoom: Standbild
   2–10 s, sonst bricht HA mit 500 ab) standen sonst immer wieder als offline da, obwohl sie liefen.
   Offline ist eine Kamera jetzt nur, wenn Home Assistant sie als nicht verfügbar meldet.
   _casoraCamDead bleibt als leere Liste für Karten, die es noch abfragen. */
window._casoraCamDead = {};
try { localStorage.removeItem('casora.camDead'); } catch (e) {}
window._casoraCamReachable = function (hass, id) {
  var c = window._casoraCamCache || (window._casoraCamCache = {});
  if (c[id] && Date.now() - c[id].t < 60000) return c[id].p;
  var st = hass && hass.states && hass.states[id];
  var pic = st && st.attributes && st.attributes.entity_picture;
  /* Ein einfarbiges Mini-Bild (wenige KB) ist der Platzhalter des Kamera-Dienstes, kein Bild. */
  var flat = function (blob) {
    if (!blob || blob.size > 6000 || typeof createImageBitmap !== 'function') return Promise.resolve(false);
    return createImageBitmap(blob).then(function (bm) {
      var cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
      var x = cv.getContext('2d'); x.drawImage(bm, 0, 0, 16, 16);
      var d = x.getImageData(0, 0, 16, 16).data, mn = 765, mx = 0;
      for (var i = 0; i < d.length; i += 4) { var v = d[i] + d[i + 1] + d[i + 2]; if (v < mn) mn = v; if (v > mx) mx = v; }
      return mx - mn < 4;
    }, function () { return false; });
  };
  var p = !pic ? Promise.resolve(false) : fetch(pic, { credentials: 'same-origin', cache: 'no-store' }).then(function (r) {
    if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) return false;
    return r.blob().then(function (b) { return flat(b).then(function (f) { return !f; }); });
  }, function () { return false; });
  c[id] = { t: Date.now(), p: p };
  return p;
};
window._casoraColGap = window._casoraColGap || function (keys) {
  var css = '';
  for (var b = 1; b < keys.length; b++) {
    for (var a = 0; a < b; a++) {
      css += ' #container > #' + keys[a] + ':not(:empty) ~ #' + keys[b] + ':not(:empty)';
      css += (a === b - 1 && b === keys.length - 1) ? '' : ',';
    }
  }
  css = css ? css.replace(/,$/, '') + ' { margin-top: 18px; }' : '';
  // Runde 2: Ein reines Etikett-Feld (…lbl) gehört zum folgenden Block – Weich setzt den
  // Abstand dort über --casora-col-lbl-gap auf 0 (das Etikett bringt seinen eigenen mit),
  // sonst stand z. B. der Schloss-Schalter 18 px tiefer als die Liste daneben.
  for (var i = 1; i < keys.length; i++) {
    if (/lbl$/.test(keys[i - 1])) css += ' #container > #' + keys[i - 1] + ':not(:empty) ~ #' + keys[i] + ':not(:empty) { margin-top: var(--casora-col-lbl-gap, 18px); }';
  }
  return css;
};

// ═══════════════════════════════════════════════════════════════════════════
// Casora – lokale Erweiterung des Benachrichtigungscenters
// Post (Briefkasten), Müllabfuhr und NINA-Wetterwarnungen.
//
// Hängt sich über window.CASORA_NOTIFY_EXTENSIONS in die Notify-Engine aus
// casora-core.js ein, damit Upstream-Updates von casora-core.js diese Logik
// nicht überschreiben. Einstellungen per window.CASORA_NOTIFY_LOCAL
// überschreibbar (gleiche Schlüssel wie DEFAULTS).
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  if (window._casoraNotifyLocal) return;
  window._casoraNotifyLocal = true;

  // Neutrale Standards. Persönliches (Zonen-Namen, Briefkasten, Akku-Ausnahmen,
  // Kombi-Kontakte, Geräte-Pflege …) kommt aus CASORA_SETTINGS.notify in
  // /config/www/casora/einstellungen.js (früher: window.CASORA_NOTIFY_LOCAL).
  var DEFAULTS = {
    zone_phrases: {},
    post: true,
    waste: true,
    warnings: true,
    mail: null,
    warn_prefix: 'binary_sensor.nina_warning_',
    waste_sensors: null,   // {entity_id: Name}; leer = Tonnen über den Finder (Waste Collection Schedule)
    waste_duty: null,      // Dienst-Sensor (on = man ist dran); leer = CASORA_SETTINGS.waste
    waste_from_hour: 16,   // "morgen"-Hinweis ab dieser Uhrzeit am Vortag
    waste_until_hour: 12,  // "heute"-Hinweis bis zu dieser Uhrzeit
    // Akku-Hinweise: diese Entitäten nie melden (Tablet, Stromspeicher, ...)
    battery_exclude: [],
    // Kombi-Sensor -> Einzelsensoren, die er zusammenfasst. Solange der
    // Kombi-Sensor existiert, erscheinen die Einzelsensoren nicht separat.
    contact_merged: {},
    // Geräte-Pflege: [Hinweis-Binärsensor, Geräte-Zustand, Name, Symbol]
    appliance_care: [],
  };

  // Akku-Zeile der Engine ohne ausgeschlossene Entitäten neu bilden (gleiche
  // Regeln: Sensor <= Schwelle bzw. Binärsensor "on", Haltezeit gegen Fehlsprünge).
  var _batHeld = {};
  function fixBattery(hass, rows, api, c) {
    var ex = c.battery_exclude || [];
    var idx = -1;
    rows.forEach(function (r, i) { if (r && r.id === 'casora:battery') idx = i; });
    if (idx < 0) return rows;
    var S = hass.states;
    var lowPct = Number(window.CASORA_NOTIFY_BATTERY); if (!isFinite(lowPct)) lowPct = 20;
    var holdMin = Number(window.CASORA_NOTIFY_BATTERY_HOLD); if (!isFinite(holdMin)) holdMin = 30;
    var now = Date.now();
    var dcOf = function (st) { return String((st.attributes || {}).device_class || ''); };
    // Geräte mit echtem Prozent-Sensor: dessen Wert zählt, ein zusätzlicher
    // "Batterie schwach"-Binärsensor desselben Geräts wird ignoriert.
    var reg = hass.entities || {};
    var pctDev = {};
    Object.keys(S).forEach(function (id) {
      if (id.indexOf('sensor.') !== 0 || dcOf(S[id]) !== 'battery' || !isFinite(parseFloat(S[id].state))) return;
      var dv = reg[id] && reg[id].device_id; if (dv) pctDev[dv] = 1;
    });
    var low = [];
    Object.keys(S).forEach(function (id) {
      if (ex.indexOf(id) !== -1) return;
      var st = S[id], n = null, isLow = false;
      if (id.indexOf('sensor.') === 0 && dcOf(st) === 'battery') { n = parseFloat(st.state); isLow = isFinite(n) && n <= lowPct; if (!isFinite(n)) n = null; }
      else if (id.indexOf('binary_sensor.') === 0 && dcOf(st) === 'battery') {
        var bd = reg[id] && reg[id].device_id;
        if (bd && pctDev[bd]) return;
        isLow = st.state === 'on';
      }
      else return;
      if (!isLow) { delete _batHeld[id]; return; }
      var since = Date.parse(st.last_changed || '') || now;
      if (!_batHeld[id] && now - since < holdMin * 60000) return;
      _batHeld[id] = 1;
      low.push({ st: st, pct: n });
    });
    var out = rows.slice();
    if (!low.length) { out.splice(idx, 1); return out; }
    low.sort(function (a, b) { return (a.pct == null ? -1 : a.pct) - (b.pct == null ? -1 : b.pct); });
    var nm = function (st) { return (api && api.nameOf ? api.nameOf(st) : ((st.attributes || {}).friendly_name || st.entity_id)); };
    var r = Object.assign({}, out[idx]);
    // Akku-Stufen (05.10.2026, window.casoraBattery): ≤ 10 % „fast leer“ und rot, sonst „schwach“ und orange.
    var crit = window.casoraBattery ? window.casoraBattery.CRIT : 10;
    var isCrit = function (x) { return x.pct != null && x.pct <= crit; };
    r.label = low.length === 1 ? nm(low[0].st).replace(/\s+Battery$/i, '') + (isCrit(low[0]) ? ' Akku fast leer' : ' Akku schwach') : low.length + ' Akkus schwach';
    r.value = low.length === 1 && low[0].pct != null ? Math.round(low[0].pct) + ' %' : null;
    r.tone = low.some(isCrit) ? 'bad' : 'warn';
    r.entity = low.length === 1 ? low[0].st.entity_id : null;
    // Stabiler Inhaltsschlüssel (casora-core settleSeen): Neustart macht den Eintrag nicht neu.
    r.seen = low.map(function (x) { return { k: x.st.entity_id, t: Date.parse(x.st.last_changed || '') }; });
    out[idx] = r;
    return out;
  }

  // ── Einträge ohne eigenes Popup-Ziel: passende Casora-Karte suchen ──────────
  // Die Engine öffnet für Einträge ohne `opens` (Alarm, Saugroboter, Geräte …)
  // das native More-Info. Hier wird stattdessen die Dashboard-Karte mit dieser
  // Entität gesucht (auch hinter conditional/auto-entities) und deren
  // 2.1-Popup geöffnet. Keine Karte gefunden -> Engine-Verhalten bleibt.
  function findCardCfg(cfg, entityId) {
    var hit = null, badge = null;
    var hasPopup = function (c) {
      var t = c && c.template;
      return !!(c && c.type === 'custom:button-card' && t && c.entity === entityId);
    };
    var isBadge = function (c) { return [].concat(c.template || []).some(function (n) { return /badge|chip/.test(String(n)); }); };
    (function walk(o) {
      if (hit || !o || typeof o !== 'object') return;
      if (Array.isArray(o)) { o.forEach(walk); return; }
      // Eine Kachel vor einer Badge derselben Entität (wie beim Antippen der Kachel, B-NOTI).
      if (hasPopup(o)) { if (!isBadge(o)) { hit = o; return; } if (!badge) badge = o; }
      // Auch Filter-Overlays (sections) und Karten in custom_fields.
      ['cards', 'card', 'filter', 'include', 'options', 'sections'].forEach(function (k) { if (o[k]) walk(o[k]); });
      if (o.custom_fields && typeof o.custom_fields === 'object') walk(Object.keys(o.custom_fields).map(function (k) { return o.custom_fields[k]; }));
    })((cfg && cfg.views) || []);
    return hit || badge;
  }

  function openViaCard(entityId, done, explicitCfg, noTile, checked) {
    var ha = document.querySelector('home-assistant');
    var h = ha && ha.hass;
    if (!h || !h.callWS || !window.casoraPopup) return done(false);
    // „Wer sieht das?“ (R-01): für diesen Benutzer ausgeblendete Geräte nicht über Glocke oder
    // Sammel-Popup öffnen – auch nicht als HA-Dialog (done(true), der Aufrufer fällt nicht zurück).
    if (!checked && window.casoraUserGuard) {
      return window.casoraUserGuard(entityId, function () { openViaCard(entityId, done, explicitCfg, noTile, true); },
        function () { done(true); });
    }
    // Glocke = Kachel (B-NOTI): steht die Kachel im Dashboard, genau sie antippen – gleiches Popup,
    // gleicher Ring und Kopf. Sonst wie bisher über die Konfiguration.
    if (!explicitCfg && !noTile && window._casoraTapTile) {
      return window._casoraTapTile(entityId, function (ok) { if (ok) done(true); else openViaCard(entityId, done, null, true, true); });
    }
    var seg = (location.pathname || '').split('/').filter(Boolean);
    h.callWS({ type: 'lovelace/config', url_path: seg[0] || 'lovelace' }).then(function (cfg) {
      var found = explicitCfg || findCardCfg(cfg, entityId);
      // Keine eigene Karte (Alarm/Schloss stecken oft nur als Badge in der Raumkarte): die Kachel-Vorlage
      // der Domäne – dasselbe Popup wie deren Kachel statt HAs Dialog (B-NOTI).
      var tpl = !found && { lock: 'casora_lock', alarm_control_panel: 'casora_alarm', vacuum: 'casora_vacuum',
        cover: 'casora_cover', climate: 'casora_thermostat', media_player: 'casora_media', light: 'casora_light' }[String(entityId).split('.')[0]];
      if (tpl && cfg && cfg.button_card_templates && cfg.button_card_templates[tpl] && h.states[entityId]) {
        found = { type: 'custom:button-card', template: tpl, entity: entityId,
          name: (h.states[entityId].attributes && h.states[entityId].attributes.friendly_name) || entityId };
      }
      if (!found) return done(false);
      var el = document.createElement('button-card');
      try { el.setConfig(JSON.parse(JSON.stringify(found))); } catch (e) { return done(false); }
      el.hass = h;
      el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(el);
      setTimeout(function () {
        var settled = false;
        var fin = function (ok) {
          if (settled) return; settled = true;
          el.removeEventListener('hass-action', take, true);
          setTimeout(function () { if (el.parentNode) el.remove(); }, 1500);
          done(ok);
        };
        var take = function (ev) {
          var c = ev.detail && ev.detail.config;
          var act = c && c.tap_action;
          if (act && act.casora_popup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); return fin(true); }
          fin(false);
        };
        el.addEventListener('hass-action', take, true);
        try { el._handleAction({ detail: { action: 'tap' } }, { isIcon: false }); } catch (e) { return fin(false); }
        setTimeout(function () { fin(false); }, 500);
      }, 120);
    }).catch(function () { done(false); });
  }

  // ── Licht-Gruppen-Popup: Tipp auf eine Einzellampe -> 2.1-Einzellampen-Popup ─
  // Das Licht-Modul feuert dafür ll-custom {casora_light_more_info} und öffnet
  // sonst das native More-Info. Untergruppen bleiben beim Modul.
  window.addEventListener('ll-custom', function (e) {
    var d = (e.detail && e.detail.event_data) ? e.detail.event_data : (e.detail || {});
    var id = d && d.casora_light_more_info;
    if (!id || typeof id !== 'string' || id.indexOf('light.') !== 0) return;
    var h = document.querySelector('home-assistant');
    var st = h && h.hass && h.hass.states[id];
    if (!st || Array.isArray((st.attributes || {}).entity_id)) return;
    if (Date.now() - (window._casoraLastScrollTs || 0) < 400) return;
    e.stopPropagation();
    window._casoraSuppressDismiss = Date.now() + 600;
    openViaCard(id, function (ok) {
      if (!ok && window.casoraPopup) window.casoraPopup.moreInfo(id);
    }, { type: 'custom:button-card', template: 'casora_light', entity: id,
         name: (st.attributes && st.attributes.friendly_name) || id, variables: { icon: 'light' } });
  }, true);

  // ── Popup-Verlaufsdiagramme (Pflanzen, Luftreiniger, Batterien …) ─────────
  // Zeilen mit data-hp-metric="<entity>" schalten das eingebettete
  // apexcharts-card im offenen Casora-Popup um. Konfigurationen legen die
  // Popups in window._hpPlantCfg[entity] / _hpPlantMeta[entity] ab.
  (function () {
    window._hpPlantCfg = window._hpPlantCfg || {};
    window._hpPlantMeta = window._hpPlantMeta || {};
    var SPAN = { '2h': '2 Stunden', '4h': '4 Stunden', '24h': '24 Stunden', '48h': '48 Stunden', '7d': '7 Tage', '30d': '30 Tage' };
    var find = function (root, sel) {
      var out = [];
      (function walk(n) {
        if (!n || !n.querySelectorAll) return;
        n.querySelectorAll(sel).forEach(function (x) { out.push(x); });
        n.querySelectorAll('*').forEach(function (x) { if (x.shadowRoot) walk(x.shadowRoot); });
      })(root);
      return out;
    };
    window._hpChartCfg = function (eid, label, span, color, height) {
      var grp = span === '4h' ? '5min' : span === '24h' ? '15min' : span === '48h' ? '30min' : span === '7d' ? '2h' : '12h';
      window._hpPlantMeta[eid] = [label, span, color];
      var LBL = { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px', fontFamily: 'var(--primary-font-family, system-ui)' };
      window._hpPlantCfg[eid] = {
        type: 'custom:apexcharts-card', graph_span: span, header: { show: false },
        yaxis: [{ show: true, decimals: 0, apex_config: { tickAmount: 2, forceNiceScale: true, floating: true,
          labels: { offsetX: 4, offsetY: -8, align: 'left', style: LBL } } }],
        series: [{ entity: eid, color: color, type: 'area', curve: 'smooth', stroke_width: 2.5, extend_to: 'now', group_by: { func: 'avg', duration: grp, fill: 'last' } }],
        apex_config: {
          colors: [color],
          chart: { height: height || 150, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
          theme: { mode: 'dark' }, dataLabels: { enabled: false }, legend: { show: false },
          grid: { show: true, borderColor: 'var(--casora-chart-grid, rgba(255,255,255,0.10))', strokeDashArray: 0, xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } },
                  padding: { left: 14, right: 14, top: -6, bottom: -4 } },
          xaxis: { labels: { show: true, rotate: 0, hideOverlappingLabels: true, datetimeUTC: false, style: LBL }, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
          tooltip: { theme: 'dark', shared: true, intersect: false, x: { format: 'dd.MM. HH:mm' } },
          stroke: { curve: 'smooth', width: 2.5, lineCap: 'round' },
          fill: { type: 'gradient', gradient: { type: 'vertical', shadeIntensity: 0, opacityFrom: 0.6, opacityTo: 0, stops: [0, 100] } },
          markers: { size: 0, hover: { size: 5 } },
        },
      };
      return window._hpPlantCfg[eid];
    };
    /* Glättung wie im Energie-Diagramm: monotoneCubic + wenige, gemittelte Punkte. Fühler messen in
       kleinen Stufen, feine Mittel (15/30 min) ergaben Treppen und Ecken. dur optional, sonst nach Zeitraum. */
    window._hpSmooth = function (eid, dur) {
      var c = window._hpPlantCfg[eid];
      var ser = c && c.series && c.series[0];
      if (!ser) return;
      var span = c.graph_span;
      ser.curve = 'monotoneCubic';
      ser.group_by = Object.assign({}, ser.group_by, { func: 'avg', fill: 'last', start_with_last: true,
        duration: dur || (span === '4h' ? '15min' : span === '24h' ? '1h' : span === '48h' ? '1h' : span === '7d' ? '6h' : '1d') });
      if (c.apex_config && c.apex_config.stroke) c.apex_config.stroke.curve = 'monotoneCubic';
    };
    window._hpChartTitle = function (eid) {
      var m = window._hpPlantMeta[eid];
      var t = m ? m[0] + ' · ' + (SPAN[m[1]] || m[1]) : '';
      return window.casoraTr ? window.casoraTr(t) : t;
    };
    /* apexcharts-card setzt die y-Achse auf Minimum/Maximum der Daten. Bei einem
       konstanten Fühler liefert das Mitteln Rundungsrauschen (21,399999999999995
       gegen 21,4); ApexCharts teilt diese Winzspanne in Schritte unterhalb der
       Rechengenauigkeit, zählt endlos hoch und bricht mit „Invalid array length“
       ab – das Diagramm dreht dann ewig. Fast gleiche Grenzen auf einen Wert
       setzen, damit ApexCharts seinen eigenen Fall „min = max“ nimmt. */
    customElements.whenDefined('apexcharts-card').then(function () {
      var C = customElements.get('apexcharts-card');
      var P = C && C.prototype;
      if (!P || typeof P._computeYAxisAutoMinMax !== 'function' || P._casoraFlatFix) return;
      var orig = P._computeYAxisAutoMinMax;
      P._casoraFlatFix = true;
      P._computeYAxisAutoMinMax = function () {
        var res = orig.apply(this, arguments);
        var ys = this._config && this._config.apex_config && this._config.apex_config.yaxis;
        (Array.isArray(ys) ? ys : []).forEach(function (y) {
          if (!y || typeof y.min !== 'number' || typeof y.max !== 'number') return;
          if (y.max !== y.min && Math.abs(y.max - y.min) <= 1e-9 * Math.max(1, Math.abs(y.max))) y.min = y.max;
        });
        return res;
      };
    }).catch(function () {});
    /* Achsen in allen Casora-Diagrammen: Datumsformat wie im Deutschen („30.09.“,
       „Sep. 2026“ statt „30 Sep“ / „Sep '26“) und kein „-0“ an der y-Achse (Rundung
       kleiner negativer Werte). Nur ergänzt, wo eine Karte selbst nichts vorgibt. */
    window._casoraApexDefaults = function (cfg) {
      if (!cfg || typeof cfg !== 'object') return cfg;
      var clone = function (v) {
        if (Array.isArray(v)) return v.map(clone);
        if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = clone(v[k]); }); return o; }
        return v;
      };
      var c = clone(cfg);
      var ac = c.apex_config = c.apex_config || {};
      var xa = ac.xaxis = ac.xaxis || {};
      var lb = xa.labels = xa.labels || {};
      if (!lb.datetimeFormatter && !lb.formatter && !lb.format) {
        lb.datetimeFormatter = { year: 'yyyy', month: 'MMM yyyy', day: 'dd.MM.', hour: 'HH:mm', minute: 'HH:mm' };
      }
      // d = null: wie ApexCharts selbst – ganze Zahlen ohne Nachkomma, sonst eine Stelle.
      var fmt = function (d) {
        return 'EVAL:function (v) { if (typeof v !== "number" || !isFinite(v)) return v; var d = ' + d + ';'
          + ' var n = d == null ? 1 : d; if (Math.abs(v) < 0.5 * Math.pow(10, -n)) v = 0;'
          + ' var min = d == null ? (Math.round(v) === v ? 0 : 1) : d;'
          + ' return v.toLocaleString(window.casoraLocale ? window.casoraLocale() : undefined, { minimumFractionDigits: min, maximumFractionDigits: n }); }';
      };
      (Array.isArray(c.yaxis) ? c.yaxis : []).forEach(function (y) {
        if (!y || typeof y !== 'object') return;
        var ya = y.apex_config = y.apex_config || {};
        var yl = ya.labels = ya.labels || {};
        if (!yl.formatter) yl.formatter = fmt(typeof y.decimals === 'number' ? y.decimals : null);
      });
      if (window._casoraSoft && window._casoraSoft()) {
        try { c = window._casoraApexSoft(c); } catch (e) { /* Diagramm bleibt wie geliefert */ }
      }
      return c;
    };
    /* Weich (Fix-Runde 1, B-06/B-08): Diagramme in Gerätefarben statt iOS-Neon, flacher
       12-%-Verlauf ohne Leuchten, Achsen in Text 3 (11/500), warme Hilfslinien. ApexCharts
       zeichnet SVG und löst CSS-Variablen nicht auf – die Theme-Werte werden hier gelesen. */
    var softCol = function (v) {
      if (typeof v !== 'string') return v;
      var n = window._casoraSoftColor ? window._casoraSoftColor(v) : v;
      if (n !== v) return n;
      return /^var\(/.test(v.trim()) ? (cssColor(v) || v) : v;
    };
    var cssColor = function (expr) {
      try {
        var el = document.createElement('span');
        el.style.color = expr; el.style.display = 'none';
        (document.querySelector('home-assistant') || document.body).appendChild(el);
        var c = getComputedStyle(el).color; el.remove();
        return c && c !== 'rgba(0, 0, 0, 0)' ? c : null;
      } catch (e) { return null; }
    };
    var withAlpha = function (c, a) {
      var m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null;
      var p = m[1].split(',').map(function (x) { return parseFloat(x); });
      return 'rgba(' + p[0] + ',' + p[1] + ',' + p[2] + ',' + a + ')';
    };
    window._casoraApexSoft = function (c) {
      var ink = cssColor('var(--primary-text-color)');
      var lbl = withAlpha(ink, 0.5) || cssColor('var(--casora-chart-label)');
      var grid = cssColor('var(--casora-chart-grid, rgba(120,100,80,0.12))');
      (Array.isArray(c.series) ? c.series : []).forEach(function (s) { if (s && s.color) s.color = softCol(s.color); });
      var ac = c.apex_config = c.apex_config || {};
      if (Array.isArray(ac.colors)) ac.colors = ac.colors.map(softCol);
      var ch = ac.chart = ac.chart || {};
      ch.dropShadow = { enabled: false };
      var f = ac.fill;
      if (f && f.type === 'gradient') {
        var gr = f.gradient = f.gradient || {};
        gr.opacityFrom = 0.12; gr.opacityTo = 0; gr.shadeIntensity = 0;
        if (Array.isArray(gr.gradientToColors)) gr.gradientToColors = gr.gradientToColors.map(softCol);
      }
      var lblStyle = function (o) {
        o.style = Object.assign({}, o.style || {}, { fontSize: '11px', fontWeight: 500, fontFamily: 'var(--primary-font-family, system-ui)' });
        if (lbl) o.style.colors = lbl;
      };
      var xa = ac.xaxis = ac.xaxis || {}; xa.labels = xa.labels || {}; lblStyle(xa.labels);
      (Array.isArray(c.yaxis) ? c.yaxis : []).forEach(function (y) {
        if (!y || typeof y !== 'object') return;
        var ya = y.apex_config = y.apex_config || {}; ya.labels = ya.labels || {}; lblStyle(ya.labels);
      });
      if (ac.yaxis && !Array.isArray(ac.yaxis)) { ac.yaxis.labels = ac.yaxis.labels || {}; lblStyle(ac.yaxis.labels); }
      var g = ac.grid = ac.grid || {};
      if (grid) g.borderColor = grid;
      var pd = g.padding = g.padding || {};
      if ((pd.left || 0) < 18) pd.left = 18;
      if ((pd.right || 0) < 18) pd.right = 18;
      return c;
    };
    customElements.whenDefined('apexcharts-card').then(function () {
      var C = customElements.get('apexcharts-card');
      var P = C && C.prototype;
      if (!P || typeof P.setConfig !== 'function' || P._casoraAxisFix) return;
      var orig = P.setConfig;
      P._casoraAxisFix = true;
      P.setConfig = function (cfg) {
        var c = cfg;
        try { c = window._casoraApexDefaults(cfg); } catch (e) { c = cfg; }
        return orig.call(this, c);
      };
    }).catch(function () {});
    var popRoot = function () {
      var ha = document.querySelector('home-assistant');
      return find(ha && ha.shadowRoot ? ha.shadowRoot : document, 'casora-popup')[0] || null;
    };
    var mount = function (slot, cfg, tries, token) {
      var ha = document.querySelector('home-assistant');
      if (!window.loadCardHelpers) return;
      /* Erst einhängen, wenn der Platz Breite hat und die Karte geladen ist.
         Beim ersten Öffnen nach dem Neuladen baut sich das Popup noch auf,
         ApexCharts zeichnet dann in 0 px Breite und das Diagramm bleibt leer. */
      if (!tries) { tries = 0; token = slot._hpMountToken = (slot._hpMountToken || 0) + 1; }
      if (slot._hpMountToken !== token) return;
      var tag = String(cfg.type || '').indexOf('custom:') === 0 ? cfg.type.slice(7) : null;
      if (tries < 50 && (!slot.isConnected || slot.getBoundingClientRect().width < 40
          || (tag && !customElements.get(tag)))) {
        setTimeout(function () { mount(slot, cfg, tries + 1, token); }, 100);
        return;
      }
      window.loadCardHelpers().then(function (h) {
        if (slot._hpMountToken !== token) return;
        var el = h.createCardElement(cfg);
        el.addEventListener('ll-rebuild', function (ev) { ev.stopPropagation(); mount(slot, cfg); });
        el.hass = ha.hass;
        el.style.display = 'block';
        el.setAttribute('data-casora-ready', '');
        slot.setAttribute('data-casora-nodismiss', '');
        slot.innerHTML = '';
        slot.appendChild(el);
        clearInterval(slot._hpTick);
        slot._hpTick = setInterval(function () {
          if (!el.isConnected) { clearInterval(slot._hpTick); return; }
          el.hass = document.querySelector('home-assistant').hass;
        }, 60000);
        /* Ändert sich die Breite noch (Einblenden, Spaltenwechsel), neu zeichnen lassen. */
        if (window.ResizeObserver) {
          if (slot._hpRo) slot._hpRo.disconnect();
          var lastW = slot.getBoundingClientRect().width;
          slot._hpRo = new ResizeObserver(function () {
            if (!el.isConnected) { slot._hpRo.disconnect(); return; }
            var w = slot.getBoundingClientRect().width;
            if (Math.abs(w - lastW) < 2) return;
            lastW = w;
            clearTimeout(slot._hpRz);
            slot._hpRz = setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 150);
          });
          slot._hpRo.observe(slot);
        }
      }).catch(function () {});
    };
    window._hpPlantShow = function (eid, row, noScroll) {
      var pop = popRoot();
      if (!pop || !window._hpPlantCfg[eid]) return false;
      var cfg = JSON.parse(JSON.stringify(window._hpPlantCfg[eid]));
      cfg.card_mod = { style: 'ha-card { background: transparent !important; box-shadow: none !important; border: none !important; }' };
      var slot = find(pop.shadowRoot, '.hp-chart-slot')[0];
      if (!slot) return false;
      mount(slot, cfg);
      find(pop.shadowRoot, '.hp-ct').forEach(function (t) { t.textContent = window._hpChartTitle(eid); });
      find(pop.shadowRoot, '[data-hp-metric]').forEach(function (r) { r.classList.toggle('hp-sel', r.dataset.hpMetric === eid); });
      if (!noScroll) {
        var sc = pop.shadowRoot.querySelector('.content') || null;
        var head = find(pop.shadowRoot, '.hp-ct')[0] || slot;
        if (sc && head) {
          var hr = head.getBoundingClientRect(), sr = sc.getBoundingClientRect();
          if (hr.top < sr.top + 8 || slot.getBoundingClientRect().bottom > sr.bottom) {
            sc.scrollBy({ top: hr.top - sr.top - 12, behavior: 'smooth' });
          }
        }
      }
      return true;
    };
    // Erstes Diagramm einhängen, sobald der Platzhalter im Popup existiert.
    window._hpChartInit = function (eid) {
      var n = 0;
      var tick = function () {
        if (window._hpPlantShow(eid, null, true)) return;
        if (++n < 100) setTimeout(tick, 100);
      };
      setTimeout(tick, 60);
    };
    window._hpPlantTap = function (ev, kind) {
      if (kind === 's') { var t0 = ev.touches && ev.touches[0]; window._hpTy = t0 ? t0.clientY : 0; window._hpTx = t0 ? t0.clientX : 0; return; }
      if (kind === 't') {
        var t = ev.changedTouches && ev.changedTouches[0];
        if (t && (Math.abs(t.clientY - (window._hpTy || 0)) > 10 || Math.abs(t.clientX - (window._hpTx || 0)) > 10)) return;
        window._hpT = Date.now();
      } else if (Date.now() - (window._hpT || 0) < 700) return;
      var p = (ev.composedPath && ev.composedPath()) || [ev.target];
      var row = null;
      for (var i = 0; i < p.length; i++) { if (p[i] && p[i].dataset && p[i].dataset.hpMetric) { row = p[i]; break; } }
      if (!row) return;
      ev.stopPropagation(); if (ev.cancelable) ev.preventDefault();
      window._casoraSuppressDismiss = Date.now() + 600;
      window._hpPlantShow(row.dataset.hpMetric, row);
    };
    /* Live-Zahlen im offenen Popup: Elemente mit data-hp-live="<entity>"
       bekommen nur ihren Text ausgetauscht (eine Nachkommastelle unter 100,
       Suffix aus data-casora-suffix). Kein Neuzeichnen, kein Flackern. */
    if (!window._hpLiveTick) {
      var livePop = null, liveNodes = null, liveAt = 0, liveLook = 0;
      var liveFmt = function (v, lang) { return (v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString(lang || 'de'); };
      window._hpLiveTick = setInterval(function () {
        /* Die Suche nach dem Popup läuft durch den ganzen Baum, daher höchstens alle 5 s. */
        if ((!livePop || !livePop.isConnected) && Date.now() - liveLook > 5000) {
          liveLook = Date.now(); livePop = popRoot(); liveNodes = null;
        }
        if (!livePop || !livePop.hasAttribute('open')) { liveNodes = null; return; }
        var ha = document.querySelector('home-assistant');
        var hass = ha && ha.hass;
        if (!hass) return;
        var now = Date.now();
        if (!liveNodes || now - liveAt > 3000) { liveNodes = find(livePop.shadowRoot, '[data-hp-live],[data-hp-live-join]'); liveAt = now; }
        liveNodes.forEach(function (el) {
          /* Mehrere Werte in einer Zeile, z. B. Latenz "7 ms / 9 ms" (ganze Zahlen). */
          if (el.dataset.hpLiveJoin) {
            var parts = el.dataset.hpLiveJoin.split(',').map(function (id) {
              var s2 = hass.states[id];
              var v2 = s2 ? parseFloat(s2.state) : NaN;
              return (isNaN(v2) ? '\u2013' : Math.round(v2)) + (el.dataset.casoraSuffix || '');
            });
            var tj = parts.join(' / ');
            if (el.textContent !== tj) el.textContent = tj;
            return;
          }
          var st = hass.states[el.dataset.hpLive];
          var v = st ? parseFloat(st.state) : NaN;
          if (isNaN(v)) return;
          var t = liveFmt(v, hass.locale && hass.locale.language) + (el.dataset.casoraSuffix || '');
          if (el.textContent !== t) el.textContent = t;
        });
      }, 1000);
    }
  })();

  // ── Assist (Text-Chat über die bevorzugte Pipeline) ───────────────────────
  (function () {
    if (window._casoraAssist) return;
    var find = function (root, sel) {
      var out = [];
      (function walk(n) {
        if (!n || !n.querySelectorAll) return;
        n.querySelectorAll(sel).forEach(function (x) { out.push(x); });
        n.querySelectorAll('*').forEach(function (x) { if (x.shadowRoot) walk(x.shadowRoot); });
      })(root);
      return out;
    };
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var ha = function () { return document.querySelector('home-assistant'); };
    var A = window._casoraAssist = {
      msgs: [], convId: null, busy: false,
      /* Vorschläge aus dem eigenen Haus (D-ASSIST, 06.10.2026): casoraAssistIdeas (00-finden.js) nimmt
         nur Fragen zu Geräten, die es gibt – erst was zu tun ist, dann Tageszeit, dann Allgemeines.
         Handy 4, Desktop 6. Gewählt beim Öffnen des Popups. */
      suggest: function () {
        var h = ha(), hass = h && h.hass;
        var max = window.matchMedia && window.matchMedia('(max-width: 600px)').matches ? 4 : 6;
        try { return window.casoraAssistIdeas ? window.casoraAssistIdeas(hass, { max: max }) : []; } catch (e) { return []; }
      },
      el: function (sel) { var h = ha(); var p = find(h && h.shadowRoot ? h.shadowRoot : document, 'casora-popup')[0]; return p ? find(p.shadowRoot, sel)[0] : null; },
      paint: function () {
        var log = A.el('.has-log'); if (!log) return;
        var out = '';
        if (!A.msgs.length) out = '<div class="has-empty">Wie kann ich helfen?</div>';
        A.msgs.forEach(function (m) {
          out += '<div class="has-m ' + (m.me ? 'me' : 'ai') + (m.err ? ' err' : '') + '">' + esc(m.t) + '</div>';
        });
        if (A.busy) out += '<div class="has-m ai typing"><span></span><span></span><span></span></div>';
        log.innerHTML = (window.casoraTr || function (x) { return x; })(out);
        log.scrollTop = log.scrollHeight;
        var chips = A.el('.has-chips'); if (chips) chips.style.display = A.msgs.length ? 'none' : '';
      },
      send: function (text) {
        text = String(text || '').trim();
        var inp = A.el('.has-in');
        if (!text && inp) text = inp.value.trim();
        if (!text || A.busy) return;
        if (inp) inp.value = '';
        A.msgs.push({ me: true, t: text }); A.busy = true; A.paint();
        var h = ha(), conn = h && h.hass && h.hass.connection;
        if (!conn) { A.busy = false; A.msgs.push({ t: 'Keine Verbindung zu Home Assistant.', err: true }); A.paint(); return; }
        var done = false, unsub = null;
        var finish = function (t, err) {
          if (done) return; done = true; A.busy = false;
          A.msgs.push({ t: t || 'Keine Antwort erhalten.', err: !!err }); A.paint();
          if (unsub) { try { unsub(); } catch (e) {} }
        };
        var msg = { type: 'assist_pipeline/run', start_stage: 'intent', end_stage: 'intent', input: { text: text } };
        if (A.convId) msg.conversation_id = A.convId;
        conn.subscribeMessage(function (ev) {
          if (ev.type === 'intent-end') {
            var o = ev.data && ev.data.intent_output;
            if (o && o.conversation_id) A.convId = o.conversation_id;
            var sp = o && o.response && o.response.speech;
            finish((sp && sp.plain && sp.plain.speech) || '');
          } else if (ev.type === 'error') {
            finish((ev.data && ev.data.message) || 'Fehler bei der Anfrage.', true);
          } else if (ev.type === 'run-end') {
            if (!done) finish('');
          }
        }, msg).then(function (u) { unsub = u; if (done) { try { u(); } catch (e) {} } })
          .catch(function (e) { finish((e && e.message) || 'Fehler bei der Anfrage.', true); });
        setTimeout(function () { if (!done) finish('Zeitüberschreitung – bitte nochmal versuchen.', true); }, 45000);
      },
      /* Sprachaufnahme im Popup: Mikrofon → PCM16 über den HA-WebSocket an die Pipeline (STT → Intent → TTS) */
      voice: function () {
        if (A.rec) { A.stopRec(); return; }
        if (A.busy) return;
        var h = ha(), conn = h && h.hass && h.hass.connection;
        if (!conn) { A.msgs.push({ t: 'Keine Verbindung zu Home Assistant.', err: true }); A.paint(); return; }
        if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          /* HA-App ohne HTTPS: native Spracheingabe der App nutzen (Mikrofon läuft dort nativ, nicht im WebView) */
          var ext = h.hass.auth && h.hass.auth.external;
          if (ext && ext.config && ext.config.hasAssist && ext.fireMessage) {
            /* Bevorzugte Pipeline des Hauses (keine feste ID): aus assist_pipeline/pipeline/list,
               sonst ohne Angabe – dann nimmt die App selbst die bevorzugte. */
            try { window.casoraPopup && window.casoraPopup.close(); } catch (e) {}
            var show = function (pid) { ext.fireMessage({ type: 'assist/show', payload: pid ? { pipeline_id: pid, start_listening: true } : { start_listening: true } }); };
            conn.sendMessagePromise({ type: 'assist_pipeline/pipeline/list' })
              .then(function (r) { show(r && r.preferred_pipeline); }, function () { show(null); });
            return;
          }
          A.msgs.push({ t: 'Das Mikrofon funktioniert nur über HTTPS – bitte Home Assistant über eine https-Adresse öffnen.', err: true }); A.paint(); return;
        }
        /* Audio-Ausgabe im Tipp-Moment freischalten (iOS spielt sonst die Antwort nicht ab) */
        try {
          if (!A.audio) A.audio = new Audio();
          A.audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
          var pp = A.audio.play(); if (pp && pp.catch) pp.catch(function () {});
        } catch (e) {}
        var AC = window.AudioContext || window.webkitAudioContext;
        var ctx = new AC();
        var r = A.rec = { ctx: ctx, stream: null, node: null, src: null, handler: null, queue: [], ended: false, unsub: null, done: false };
        A.paintMic();
        var fail = function (t) {
          A.cleanupRec(); A.busy = false;
          A.msgs.push({ t: t, err: true }); A.paint();
        };
        navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
          if (A.rec !== r) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
          r.stream = stream;
          if (ctx.state === 'suspended') ctx.resume();
          r.src = ctx.createMediaStreamSource(stream);
          r.node = ctx.createScriptProcessor(4096, 1, 1);
          r.node.onaudioprocess = function (ev) {
            if (r.ended) return;
            var f = ev.inputBuffer.getChannelData(0), buf = new Uint8Array(1 + f.length * 2), dv = new DataView(buf.buffer);
            for (var i = 0; i < f.length; i++) { var v = Math.max(-1, Math.min(1, f[i])); dv.setInt16(1 + i * 2, v < 0 ? v * 0x8000 : v * 0x7FFF, true); }
            if (r.handler == null) { r.queue.push(buf); return; }
            buf[0] = r.handler; try { conn.socket.send(buf); } catch (e) {}
          };
          r.src.connect(r.node); r.node.connect(ctx.destination);
          var msg = { type: 'assist_pipeline/run', start_stage: 'stt', end_stage: 'tts', input: { sample_rate: ctx.sampleRate } };
          if (A.convId) msg.conversation_id = A.convId;
          var finish = r.finish = function (t, err) {
            if (r.done) return; r.done = true; A.busy = false;
            if (t) A.msgs.push({ t: t, err: !!err });
            A.paint();
          };
          conn.subscribeMessage(function (ev) {
            var d = ev.data || {};
            if (ev.type === 'run-start') {
              r.handler = d.runner_data && d.runner_data.stt_binary_handler_id;
              r.queue.forEach(function (b) { b[0] = r.handler; try { conn.socket.send(b); } catch (e) {} });
              r.queue = [];
              if (r.ended) A.sendEnd(r);
            } else if (ev.type === 'stt-end') {
              A.cleanupRec(r);
              var txt = d.stt_output && d.stt_output.text;
              if (txt) { A.msgs.push({ me: true, t: txt }); A.busy = true; A.paint(); }
              else finish('Ich habe nichts verstanden.', true);
            } else if (ev.type === 'intent-end') {
              var o = d.intent_output;
              if (o && o.conversation_id) A.convId = o.conversation_id;
              var sp = o && o.response && o.response.speech;
              finish((sp && sp.plain && sp.plain.speech) || 'Keine Antwort erhalten.');
            } else if (ev.type === 'tts-end') {
              var url = d.tts_output && d.tts_output.url;
              if (url && A.audio) { try { A.audio.src = url; var p2 = A.audio.play(); if (p2 && p2.catch) p2.catch(function () {}); } catch (e) {} }
            } else if (ev.type === 'error') {
              A.cleanupRec(r);
              var c = d.code || '';
              finish(c === 'stt-no-text-recognized' ? 'Ich habe nichts verstanden.' : (d.message || 'Fehler bei der Spracheingabe.'), true);
            } else if (ev.type === 'run-end') {
              A.cleanupRec(r); if (!r.done) finish('');
              if (r.unsub) { try { r.unsub(); } catch (e) {} }
            }
          }, msg).then(function (u) { r.unsub = u; if (r.done && !A.busy) { try { u(); } catch (e) {} } })
            .catch(function (e) { fail((e && e.message) || 'Spracheingabe fehlgeschlagen.'); });
          /* Sicherheitsnetz: nach 15 s Aufnahme automatisch beenden */
          setTimeout(function () { if (A.rec === r) A.stopRec(); }, 15000);
        }).catch(function (e) {
          fail(e && e.name === 'NotAllowedError' ? 'Kein Zugriff aufs Mikrofon – bitte in den Einstellungen erlauben.' : 'Mikrofon nicht verfügbar.');
        });
      },
      sendEnd: function (r) {
        var h = ha(), conn = h && h.hass && h.hass.connection;
        if (r.handler != null && conn && !r.sentEnd) { r.sentEnd = true; try { conn.socket.send(new Uint8Array([r.handler])); } catch (e) {} }
      },
      stopRec: function () {
        var r = A.rec; if (!r) return;
        r.ended = true; A.sendEnd(r);
        A.cleanupRec(r); A.busy = true; A.paint();
        /* Sicherheitsnetz wie beim Text-Weg: kommt keine Antwort (Verbindung neu, Agent hängt),
           bleibt die Eingabe nicht für immer gesperrt. */
        setTimeout(function () {
          if (r.done) return;
          if (r.finish) r.finish('Zeitüberschreitung – bitte nochmal versuchen.', true);
          else { r.done = true; A.busy = false; A.msgs.push({ t: 'Zeitüberschreitung – bitte nochmal versuchen.', err: true }); A.paint(); }
          if (r.unsub) { try { r.unsub(); } catch (e) {} }
        }, 45000);
      },
      cleanupRec: function (r) {
        r = r || A.rec; if (!r) return;
        r.ended = true;
        try { r.node && r.node.disconnect(); r.src && r.src.disconnect(); } catch (e) {}
        try { r.stream && r.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        try { r.ctx && r.ctx.state !== 'closed' && r.ctx.close(); } catch (e) {}
        if (A.rec === r) A.rec = null;
        A.paintMic();
      },
      /* Popup zu → laufende Aufnahme beenden */
      watchClose: function () {
        clearInterval(A._wc);
        A._wc = setInterval(function () { if (!A.el('.has-log')) { clearInterval(A._wc); if (A.rec) A.cleanupRec(); } }, 700);
      },
      paintMic: function () {
        var m = A.el('.has-mic'); if (m) m.classList.toggle('rec', !!A.rec);
        var i = A.el('.has-in'); if (i) i.placeholder = A.rec ? 'Hört zu …' : 'Frag Assist …';
      },
      reset: function () { if (A.rec) A.cleanupRec(); A.msgs = []; A.convId = null; A.busy = false; A.paint(); },
      open: function () {
        if (!window.casoraPopup) return false;
        var T = (window._casoraUI && window._casoraUI.tokens) || {};
        var ink = T.ink || '#fff', ink2 = T.ink2 || 'rgba(255,255,255,0.56)', ink3 = T.ink3 || 'rgba(255,255,255,0.42)';
        var soft = !!(window._casoraSoft && window._casoraSoft());
        var tr = window.casoraTr || function (x) { return x; };
        var ideas = A.suggest();
        var slot = window.casoraAssistIdeas ? window.casoraAssistIdeas.slot(new Date().getHours()) : '';
        var SLOT = { morgen: 'Vorschläge für den Morgen', tag: 'Vorschläge für heute', abend: 'Vorschläge für den Abend', nacht: 'Vorschläge für die Nacht' };
        var TONE = { light: 'var(--casora-tone-light, var(--casora-color-yellow, #FFCC00))', security: 'var(--casora-color-orange, #FF9F0A)',
          climate: 'var(--casora-color-teal, #00C3D0)', energy: 'var(--casora-tone-energy, var(--casora-color-green, #34C759))',
          media: 'var(--casora-tone-media, var(--casora-color-blue, #0A84FF))', general: 'var(--casora-color-sand, #9A8672)' };
        var tap = function (fn) {
          return ' ontouchstart="window._hasTy=event.touches[0].clientY;" ontouchend="if(Math.abs(event.changedTouches[0].clientY-(window._hasTy||0))>10)return;if(event.cancelable)event.preventDefault();event.stopPropagation();window._hasT=Date.now();' + fn + '"'
            + ' onclick="event.stopPropagation();if(Date.now()-(window._hasT||0)<700)return;' + fn + '"';
        };
        var html = '<style>ha-card.disabled{pointer-events:auto!important;}'
          + '.has{font-family:var(--primary-font-family,system-ui);color:' + ink + ';display:flex;flex-direction:column;gap:12px;text-align:left;pointer-events:auto;}'
          + '.has-log,.has-m{-webkit-user-select:text;user-select:text;}'
          + '.has-log{display:flex;flex-direction:column;gap:8px;min-height:180px;max-height:min(52vh,460px);overflow-y:auto;padding:4px 2px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;}'
          + '.has-empty{margin:auto;font-size:22px;font-weight:500;color:' + ink2 + ';text-align:center;padding:40px 0;}'
          + '.has-m{max-width:82%;padding:10px 14px;border-radius:20px;font-size:16px;line-height:1.35;white-space:pre-wrap;word-wrap:break-word;}'
          + '.has-m.me{align-self:flex-end;background:var(--casora-color-teal,#00C3D0);color:#fff;border-bottom-right-radius:6px;}'
          + '.has-m.ai{align-self:flex-start;background:var(--casora-popup-row-fill,rgba(255,255,255,0.10));border-bottom-left-radius:6px;}'
          + '.has-m.err{color:var(--casora-color-orange, #FF9F0A);}'
          + '.has-m.typing{display:flex;gap:5px;padding:14px 16px;}'
          + '.has-m.typing span{width:7px;height:7px;border-radius:50%;background:' + ink2 + ';animation:hasb 1.2s infinite ease-in-out;}'
          + '.has-m.typing span:nth-child(2){animation-delay:.15s}.has-m.typing span:nth-child(3){animation-delay:.3s}'
          + '@keyframes hasb{0%,80%,100%{opacity:.25;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}'
          + '.has-chips{display:flex;flex-wrap:wrap;gap:7px;}'
          /* Weich: Sand-Pille wie alle Knöpfe – die helle Segmentfläche war im hellen Design kaum zu sehen. */
          + '.has-chip{font-size:14px;padding:9px 13px;border-radius:999px;cursor:pointer;background:var(--casora-soft-control-fill,var(--casora-popup-seg-fill,rgba(255,255,255,0.16)));}'
          + '.has-chip > *{pointer-events:none;}.has-chip-i,.has-chips-l{display:none;}'
          /* D-ASSIST (Weich): 44 px hoch, 15 px/600 wie die übrigen Chips, Symbol im Farbkreis der Kategorie,
             darüber eine kleine Zeile „Vorschläge für den Abend“. Linksbündig wie das Eingabefeld darunter
             (06.10.2026: mittig wirkte unruhig, jede Pille begann woanders). */
          + (soft ? '.has-chips{justify-content:flex-start;gap:8px;}'
            + '.has-chips-l{display:block;flex:0 0 100%;text-align:left;padding-left:4px;font-size:13px;font-weight:600;color:' + ink2 + ';margin:0 0 2px;}'
            + '.has-chip{display:inline-flex;align-items:center;gap:9px;min-height:44px;box-sizing:border-box;padding:0 16px 0 6px;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:' + ink + ';}'
            + '.has-chip-i{display:grid;place-items:center;width:32px;height:32px;flex:none;border-radius:50%;background:var(--t);color:#fff;}'
            + '.has-chip:focus-visible{outline:2px solid var(--casora-ton-ink,currentColor);outline-offset:2px;}'
            + '@media (hover:hover){.has-chip:hover{background:var(--casora-soft-row-hover,rgba(140,115,90,0.11));}}' : '')
          + '.has-bar{display:flex;align-items:center;gap:8px;contain:layout style;}'
          + '.has-in{flex:1;min-width:0;height:48px;border:none;outline:none;border-radius:999px;padding:0 18px;font-size:16px;font-family:inherit;color:' + ink + ';'
          + '-webkit-user-select:text;user-select:text;pointer-events:auto;touch-action:manipulation;-webkit-appearance:none;appearance:none;'
          + 'transform:translateZ(0);will-change:transform;contain:layout paint style;isolation:isolate;'
          + 'background:var(--casora-popup-row-fill,rgba(255,255,255,0.10));}'
          + '.has-in::placeholder{color:' + ink3 + ';}'
          + '.has-b{width:48px;height:48px;flex:none;border-radius:999px;display:grid;place-items:center;cursor:pointer;line-height:0;}'
          + '.has-b > *{pointer-events:none;}'
          + '.has-send{background:var(--casora-color-teal,#00C3D0);color:#fff;}'
          + '.has-mic{background:var(--casora-soft-control-fill,var(--casora-popup-seg-fill,rgba(255,255,255,0.16)));color:' + ink + ';}'
          + '.has-mic.rec{background:var(--casora-color-red, #FF3B30);color:#fff;animation:hasp 1.4s infinite ease-out;}'
          + '@keyframes hasp{0%{box-shadow:0 0 0 0 rgba(255,59,48,.55)}100%{box-shadow:0 0 0 14px rgba(255,59,48,0)}}'
          + '.has-new{align-self:flex-end;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:500;color:' + ink + ';cursor:pointer;padding:8px 14px 8px 11px;border-radius:999px;background:var(--casora-soft-control-fill,var(--casora-popup-seg-fill,rgba(255,255,255,0.16)));line-height:1;}'
          + '.has-new > *{pointer-events:none;}'
          + (soft ? '.has-new{min-height:44px;box-sizing:border-box;padding:0 16px 0 12px;font-weight:600;}' : '')   /* D-03: 44 px */
          + '</style>'
          + '<div class="has" data-casora-nodismiss="">'
          + '<div class="has-new"' + tap('window._casoraAssist.reset()') + '><ha-icon icon="mdi:plus" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;"></ha-icon>Neues Gespräch</div>'
          + '<div class="has-log"></div>'
          + '<div class="has-chips">' + (ideas.length ? '<div class="has-chips-l">' + esc(tr(SLOT[slot] || '')) + '</div>' : '') + ideas.map(function (it) {
            var q = tr(it.q); /* Assist bekommt die Frage in der UI-Sprache */
            /* Frage als data-Attribut (voll maskiert), nicht als Code im Handler – Bereichsnamen sind frei wählbar */
            var send = 'window._casoraAssist.send(this.dataset.q)';
            return '<div class="has-chip" role="button" tabindex="0" data-q="' + esc(q) + '"' + tap(send)
              + ' onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();event.stopPropagation();' + send + '}">'
              + '<span class="has-chip-i" style="--t:' + (TONE[it.tone] || TONE.general) + ';"><ha-icon icon="' + esc(it.icon) + '" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;"></ha-icon></span>'
              + '<span>' + esc(q) + '</span></div>';
          }).join('') + '</div>'
          + '<div class="has-bar">'
          + '<input class="has-in" type="text" enterkeyhint="send" autocomplete="off" autocapitalize="sentences" placeholder="Frag Assist …"'
          + ' ontouchstart="event.stopPropagation();" ontouchend="event.stopPropagation();if(document.activeElement!==this&&this.getRootNode().activeElement!==this){this.focus();}"'
          /* Tasten nicht zur Karte durchreichen: button-card fängt sonst die Leertaste als „Tippen“ ab */
          + ' onkeydown="event.stopPropagation();if(event.key===\'Enter\'){event.preventDefault();window._casoraAssist.send();}" onkeyup="event.stopPropagation();" onkeypress="event.stopPropagation();">'
          /* Mikrofon-Knopf auf Wunsch ausgebaut (voice() bleibt als Funktion erhalten) */
          + '<div class="has-b has-send" title="Senden"' + tap('window._casoraAssist.send()') + '><svg width="20" height="20" viewBox="0 0 20 20"><path d="M10 16V4M4.5 9.5L10 4l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
          + '</div></div>';
        /* Popup-Rahmen wie die übrigen Casora-Popups: popup_styles einer vorhandenen Karte übernehmen */
        var styles = null;
        try {
          var h0 = ha();
          find(h0 && h0.shadowRoot ? h0.shadowRoot : document, 'button-card').some(function (c) {
            var ps = c._config && c._config.tap_action && c._config.tap_action.casora_popup && c._config.tap_action.casora_popup.popup_styles;
            if (Array.isArray(ps) && ps.length) { styles = JSON.parse(JSON.stringify(ps).replace(/--popup-(min|max)-width:[^;]*;/g, '--popup-$1-width: min(560px, 92vw);')); return true; }
            return false;
          });
        } catch (e) {}
        window.casoraPopup.open({
          title: 'Assist', dismissable: true, popup_styles: styles || undefined,
          content: { type: 'custom:button-card', tap_action: { action: 'none' }, hold_action: { action: 'none' },
            show_icon: false, show_name: false, show_label: false, show_state: false,
            card_mod: { style: ':host { --ha-card-background: transparent !important; --ha-card-box-shadow: none !important; } ha-card { background: transparent !important; border: none !important; box-shadow: none !important; } @media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }' },
            styles: { card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: 'var(--casora-soft-card-top, 6px) 26px 22px 26px' }],
                      grid: [{ 'grid-template-areas': '"b"' }, { 'grid-template-columns': '1fr' }],
                      custom_fields: { b: [{ 'justify-self': 'stretch' }] } },
            custom_fields: { b: html } },
        });
        var n = 0;
        (function tick() { if (A.el('.has-log')) { A.paint(); A.paintMic(); A.watchClose(); var i = A.el('.has-in'); if (i && window.matchMedia('(hover: hover)').matches) i.focus(); return; } if (++n < 40) setTimeout(tick, 80); })();
        return true;
      },
    };
  })();

  window._casoraNotifyOpenViaCard = openViaCard;

  (function bindRowOpen() {
    if (window._casoraNotifyRowOpen) return;
    window._casoraNotifyRowOpen = true;
    var ty = 0, tx = 0, moved = false, lastTouch = 0;
    window.addEventListener('touchstart', function (e) {
      var t = e.touches && e.touches[0]; if (!t) return; tx = t.clientX; ty = t.clientY; moved = false;
    }, { capture: true, passive: true });
    window.addEventListener('touchmove', function (e) {
      var t = e.touches && e.touches[0]; if (!t) return;
      if (Math.abs(t.clientX - tx) > 10 || Math.abs(t.clientY - ty) > 10) moved = true;
    }, { capture: true, passive: true });
    var handle = function (e) {
      if (e.type === 'touchend' && moved) return;
      if (e.type === 'click' && Date.now() - lastTouch < 700) return;
      var path = (e.composedPath && e.composedPath()) || [e.target];
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        var row = n && n._casoraRow;
        if (!row) continue;
        if (row.opens || !row.entity || !n.dataset || !n.dataset.casoraMi) return;
        var id = row.entity;
        if (/^(person|device_tracker|sensor\.post|input_boolean)\./.test(id)) return;
        e.preventDefault(); e.stopPropagation();
        if (e.type === 'touchend') lastTouch = Date.now();
        try { window._casoraNotify && window._casoraNotify.close(); } catch (x) {}
        openViaCard(id, function (ok) {
          if (!ok && window.casoraPopup) window.casoraPopup.moreInfo(id);
        });
        return;
      }
    };
    window.addEventListener('touchend', handle, true);
    window.addEventListener('click', handle, true);
  })();

  var WARN_LEVEL = {
    Minor: 'Hinweis', Moderate: 'Warnung', Severe: 'Unwetter', Extreme: 'Extremes Unwetter',
  };

  function cfg() {
    var own = (window.casoraSettings && window.casoraSettings('notify')) || {};
    return Object.assign({}, DEFAULTS, own, window.CASORA_NOTIFY_LOCAL || {});
  }

  function isWarning(id) {
    var p = cfg().warn_prefix;
    return !!p && id.indexOf(p) === 0;
  }

  function warningType(st) {
    var h = String((st && st.attributes && st.attributes.headline) || '');
    var m = h.match(/vor (.+)$/i);
    if (!m) return 'Wetterwarnung';
    var t = m[1].toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function hhmm(iso) {
    var t = Date.parse(iso || '');
    if (!isFinite(t)) return '';
    var d = new Date(t);
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  // "… ist offen" öffnet upstream das Schloss-Popup. Wir leiten auf das
  // Türen-&-Fenster-Popup um. Da keine sichtbare Karte dieses Template nutzt,
  // halten wir eine unsichtbare Auslöser-Karte vor, die openTarget() im DOM findet.
  var CONTACT_TPL = 'casora_badge_contact_group';
  var _contactCard = null;

  function ensureContactCard(hass) {
    if (!_contactCard) {
      try {
        var el = document.createElement('button-card');
        el.setConfig({ type: 'custom:button-card', template: CONTACT_TPL });
        el.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;'
          + 'opacity:0;pointer-events:none;';
        el.setAttribute('aria-hidden', 'true');
        document.body.appendChild(el);
        _contactCard = el;
      } catch (e) {
        return false;
      }
    }
    if (hass) _contactCard.hass = hass;
    return true;
  }

  // Zone → Ortsangabe mit passender Präposition. Feste Zuordnung in
  // CASORA_NOTIFY_LOCAL.zone_phrases, sonst Faustregel nach Wortende.
  function zonePhrase(z, c) {
    var map = c.zone_phrases || {};
    if (map[z]) return map[z];
    if (/arbeit$/i.test(z)) return 'auf der Arbeit';
    if (/(hof|platz|see|strand|hafen|meer|berg)$/i.test(z)) return 'am ' + z;
    if (/(schule|uni|kita|praxis|klinik|firma|stadt|halle|kirche|apotheke|bank)$/i.test(z)) return 'in der ' + z;
    if (/(büro|studio|haus|heim|zentrum|kino|hotel|restaurant|café|cafe|center|markt|park|werk|lager|amt)$/i.test(z)) return 'im ' + z;
    return 'bei ' + z;                               // Personen, Läden, Firmennamen
  }

  function areaName(hass, id) {
    var e = hass.entities && hass.entities[id];
    if (!e) return '';
    var aid = e.area_id || (e.device_id && hass.devices && hass.devices[e.device_id]
      && hass.devices[e.device_id].area_id);
    return (aid && hass.areas && hass.areas[aid] && hass.areas[aid].name) || '';
  }

  var ext = {
    // Verlauf: welche Entitäten aus dem Logbuch gelesen werden.
    watch: function (hass) {
      var c = cfg();
      var out = [];
      Object.keys(hass.states).forEach(function (id) {
        if (c.post && id === c.mail) out.push(id);
        else if (c.warnings && isWarning(id)) out.push(id);
      });
      return out;
    },

    // Verlauf: Logbuch-Eintrag -> Zeile. undefined = nicht unsere Entität.
    describe: function (entry, st, prev, api) {
      var c = cfg();
      var id = entry.entity_id || '';
      var s = String(entry.state == null ? '' : entry.state);

      // Alarmanlage (25.09.): "Alarmo umgeschaltet auf Abwesend" statt "Alarm scharf – Abwesend".
      if (id.indexOf('alarm_control_panel.') === 0) {
        var MODE = { armed_home: 'Zuhause', armed_away: 'Abwesend', armed_night: 'Nacht', armed_vacation: 'Urlaub', armed_custom_bypass: 'Bypass' };
        var an = entry.name || (api && api.nameOf ? api.nameOf(st) : '') || 'Alarm';
        // Symbole wie die Alarm-Badge je Zustand (03.10.2026), sec = ruhiges Farbsystem im Mitteilungszentrum.
        var ic = window.casoraSecurityIcon ? window.casoraSecurityIcon(id, s, st && st.attributes) : 'lock-fill';
        // Weich (05.10.2026): dieselben Wörter wie Kachel, Badge und Popup (casoraSecurityWord).
        var sw = window._casoraSoft && window._casoraSoft() && window.casoraSecurityWord ? window.casoraSecurityWord(id, s) : null;
        if (sw && s === 'triggered') sw = 'ausgelöst';
        if (sw) return { label: an + ' ' + sw.replace(/^./, function (c) { return c.toLowerCase(); }), icon: ic, tone: s === 'triggered' ? 'bad' : s === 'disarmed' ? 'warn' : 'good', sec: true };
        if (MODE[s]) return { label: an + ' umgeschaltet auf ' + MODE[s], icon: ic, tone: 'good', sec: true };
        if (s === 'disarmed') return { label: an + ' ausgeschaltet', icon: ic, tone: 'warn', sec: true };
        if (s === 'triggered') return { label: an + ' ausgelöst', icon: ic, tone: 'bad', sec: true };
        return null;
      }

      // Personen in einer Zone: "ist im Büro" statt "ist bei Büro".
      if (id.indexOf('person.') === 0 && s && !{ home: 1, not_home: 1, unknown: 1, unavailable: 1 }[s]) {
        var who = entry.name || (api && api.nameOf ? api.nameOf(st) : id);
        var pic = st && st.attributes && st.attributes.entity_picture;
        return { label: who + ' ist ' + zonePhrase(s, c), tone: 'var(--casora-color-blue, #0A84FF)',
          icon: 'person', image: pic || undefined, imageFit: 'cover', once: 'person:' + who };
      }

      if (id === c.mail) {
        if (s !== 'on' || prev === 'unavailable' || prev === 'unknown') return null;
        return { label: 'Neue Post im Briefkasten', icon: 'mdi:mailbox', tone: 'accent' };
      }

      if (isWarning(id)) {
        // Eine laufende Warnung steht schon als Live-Zeile mit Details oben.
        if (s === 'on' && st && st.state === 'on') return null;
        if (s === 'on') {
          return { label: 'Wetterwarnung', sub: 'Amtliche Warnung (NINA)', icon: 'exclamation', tone: 'warn' };
        }
        if (s === 'off' && prev === 'on') {
          return { label: 'Entwarnung', sub: 'Wetterwarnung aufgehoben', icon: 'exclamation', tone: 'good' };
        }
        return null;
      }

      return undefined;
    },

    // Live-Zeilen: NINA mit Details statt generischer "Sicherheitswarnung",
    // dazu Müllabfuhr heute/morgen.
    standing: function (hass, rows, api) {
      var c = cfg();
      var S = hass.states;
      rows = fixBattery(hass, rows, api, c);
      var out = rows.filter(function (r) {
        return !(r.entity && isWarning(r.entity) && String(r.id || '').indexOf('casora:safety:') === 0);
      });

      // Kombi-Sensoren: Einzelsensoren ausblenden, Kipp-Stellung als "gekippt".
      var merged = c.contact_merged || {};
      var hidden = {};
      Object.keys(merged).forEach(function (k) {
        if (S[k]) (merged[k] || []).forEach(function (id) { hidden[id] = true; });
      });
      out = out.filter(function (r) {
        return !(String(r.id || '').indexOf('casora:open:') === 0 && hidden[r.entity]);
      });
      // Ohne eingetragenen Kombi-Sensor: Kontakt + Kippsensor desselben Geräts
      // (z. B. Terrassentür) nur einmal melden – der Hauptkontakt gewinnt.
      var R = hass.entities || {}, mainDev = {};
      var isOpenRow = function (r) { return String(r.id || '').indexOf('casora:open:') === 0 && !!r.entity; };
      var devOf = function (id) { return R[id] && R[id].device_id; };
      var isTilt = function (id) {
        var a = (S[id] && S[id].attributes) || {};
        // Nur reine Kippsensoren; ein Kombi-Sensor mit tilt-Attribut ist der Hauptkontakt.
        return /kipp|tilt/i.test(id + ' ' + (a.friendly_name || ''));
      };
      // Gleicher Name ohne „Kippsensor/Kontakt“ zählt auch (zwei Sensoren, ein Kombi-Sensor daneben).
      var normName = function (id) {
        var a = (S[id] && S[id].attributes) || {};
        var n = String(a.friendly_name || '').toLowerCase().replace(/kipp\w*|tilt\w*|kontakt\w*|contact|sensor/g, '').replace(/\s+/g, '');
        return n ? 'n:' + n : 'x:' + id;
      };
      out.forEach(function (r) {
        if (!isOpenRow(r) || isTilt(r.entity)) return;
        if (devOf(r.entity)) mainDev[devOf(r.entity)] = true;
        mainDev[normName(r.entity)] = true;
      });
      out = out.filter(function (r) {
        return !(isOpenRow(r) && isTilt(r.entity) && (mainDev[devOf(r.entity)] || mainDev[normName(r.entity)]));
      });
      out.forEach(function (r) {
        if (String(r.id || '').indexOf('casora:open:') !== 0) return;
        var a = (S[r.entity] && S[r.entity].attributes) || {};
        if (a.tilt === true && typeof r.label === 'string') {
          r.label = r.label.replace(/ ist offen$/, ' ist gekippt');
          // Gekippt = offen: dasselbe Symbol wie die Fenster-/Tür-Badge.
          r.icon = window.casoraSecurityIcon ? window.casoraSecurityIcon(r.entity, 'on', a) : 'window-open';
        }
        // Nur "Fenster"/"Tür" im Namen → Raum davor ("Schlafzimmer Fenster ist offen").
        var m = typeof r.label === 'string' && r.label.match(/^(Fenster|Tür|Tor) (ist .*)$/);
        var room = m && areaName(hass, r.entity);
        if (room) r.label = room + ' ' + m[1] + ' ' + m[2];
      });

      if (c.contact_popup !== false && out.some(function (r) { return String(r.id || '').indexOf('casora:open:') === 0; })
        && ensureContactCard(hass)) {
        out.forEach(function (r) {
          if (String(r.id || '').indexOf('casora:open:') === 0) r.opens = [CONTACT_TPL];
        });
      }

      if (c.warnings) {
        Object.keys(S).forEach(function (id) {
          if (!isWarning(id)) return;
          var st = S[id];
          if (st.state !== 'on') return;
          var a = st.attributes || {};
          var until = hhmm(a.expires);
          out.push({
            id: 'casora:warning:' + id,
            when: Date.parse(st.last_changed || '') || Date.now(),
            label: 'Wetterwarnung: ' + warningType(st),
            sub: (WARN_LEVEL[a.severity] || 'Warnung') + (until ? ' · bis ' + until : ''),
            icon: 'exclamation',
            tone: (a.severity === 'Severe' || a.severity === 'Extreme') ? 'bad' : 'warn',
            entity: id,
            rank: 1,
            seen: [id + '|' + warningType(st) + '|' + String(a.severity || '') + '|' + String(a.expires || '')],
          });
        });
      }

      if (c.waste) {
        var now = new Date();
        var today = [];
        var tomorrow = [];
        var W = window.casoraDevice && window.casoraDevice.waste
          ? window.casoraDevice.waste(hass, c.waste_sensors ? { trash_sensors: c.waste_sensors, trash_duty_entity: c.waste_duty } : null)
          : { bins: [], duty: null };
        W.bins.forEach(function (b) {
          if (b.days === 0) today.push(b.label);
          else if (b.days === 1) tomorrow.push(b.label);
        });
        var day0 = new Date(now);
        day0.setHours(0, 0, 0, 0);
        var dutyText = W.duty === null ? null
          : (W.duty ? 'Du bist diesen Monat dran' : 'Du bist diesen Monat nicht dran');

        if (today.length && now.getHours() < c.waste_until_hour) {
          out.push({
            id: 'casora:waste:today:' + day0.getTime(),
            when: day0.getTime(),
            label: 'Abfall heute',
            sub: today.join(', '),
            icon: 'trash',
            tone: 'accent',
          });
        }
        if (tomorrow.length && now.getHours() >= c.waste_from_hour) {
          var from = new Date(day0);
          from.setHours(c.waste_from_hour);
          out.push({
            id: 'casora:waste:tomorrow:' + day0.getTime(),
            when: from.getTime(),
            label: 'Abfall morgen',
            sub: tomorrow.join(', ') + (dutyText ? ' · ' + dutyText : ''),
            icon: 'trash',
            tone: 'accent',
          });
        }
      }

      /* Haushaltsgeräte: fällige Pflege / Störungen (gleiche Helfer wie die Startseite).
         Tipp öffnet über die Dashboard-Karte das Geräte-Popup. */
      (c.appliance_care || [])
        .forEach(function (x) {
          var h = S[x[0]], dev = S[x[1]];
          if (!h || h.state !== 'on' || !dev) return;
          var items = [], bad = false;
          try {
            if (x[3] === 'dishwasher' && window._casoraDish) {
              var dc = window._casoraDish.resolve(dev, { appliance_state: x[1] }, S, hass);
              window._casoraDish.todo(dc, S).forEach(function (t) { items.push(t[0]); if (t[1] === 'bad') bad = true; });
            } else if (window._casoraLaundry) {
              items = window._casoraLaundry.due(dev, { appliance_state: x[1], device_type: x[3] === 'dryer' ? 'dryer' : null }, S)
                .map(function (t) { return t + ' fällig'; });
            }
          } catch (e) {}
          out.push({
            id: 'casora:care:' + x[0],
            when: Date.parse(h.last_changed || '') || Date.now(),
            label: x[2] + ': ' + (items[0] || 'Pflege fällig'),
            sub: items.length > 1 ? items.slice(1).join(', ') : 'Zum Öffnen tippen',
            icon: x[3],
            tone: bad ? 'bad' : 'warn',
            entity: x[1],
            seen: [x[0] + '|' + items.join(',')],
          });
        });

      return out;
    },
  };

  window.CASORA_NOTIFY_EXTENSIONS = (window.CASORA_NOTIFY_EXTENSIONS || []).concat([ext]);
})();

// ── Desktop: Tablet-Navbar (Glas-Pille) ausrichten ────────────────────────
// Die Pille hängt direkt am Dokument (persistentHost), erbt also nur globale
// Variablen. Nur für Maus-Geräte, das echte Tablet bleibt unverändert.
(function () {
  if (document.getElementById('casora-desktop-navpill')) return;
  var st = document.createElement('style');
  st.id = 'casora-desktop-navpill';
  st.textContent = '@media (hover: hover) and (pointer: fine) { html {'
    + ' --casora-chrome-row-top-tablet: 33px;'        /* mittig zu den runden Knöpfen oben rechts */
    + ' --casora-chrome-side-reserve-tablet: 265px;'  /* Platz für HA-Seitenleiste bzw. Knöpfe */
    + ' } }'
    /* Aktiv-Markierung: seitlich optisch gleicher Abstand wie oben/unten
       (an der runden Kappe wirken 4px enger als an der geraden Kante) */
    + ' html { --casora-nav-pill-inset-x-tablet: 6px; }';
  document.head.appendChild(st);
})();


// ── Desktop: Glas-Pille im Inhaltsbereich zentrieren (27.09.2026) ─────────────
// Die Pille hängt fest am Fenster und wurde über die volle Breite zentriert –
// mit offener HA-Seitenleiste lag sie links über der Leiste und rechts über den
// runden Knöpfen. Hier bekommt sie den Bereich neben der Seitenleiste, mit
// Platz für die Knöpfe; bei vielen Räumen scrollt sie in sich.
(function () {
  if (window._casoraPillPlace) return;
  window._casoraPillPlace = true;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 769px)');
  var RESERVE = 275;   // runde Knöpfe rechts (und gleich viel links, damit die Pille mittig bleibt)
  function walk(root, sel, out, d) {
    if (!root || d > 10 || !root.querySelectorAll) return;
    root.querySelectorAll(sel).forEach(function (e) { out.push(e); });
    root.querySelectorAll('*').forEach(function (e) { if (e.shadowRoot) walk(e.shadowRoot, sel, out, d + 1); });
  }
  var cache = { host: null, panel: null, at: 0 }, t0 = Date.now();
  setInterval(function () {
    if (document.hidden) return;
    /* Casora (06.10.2026): Die Suche durch den ganzen Baum samt Shadow-DOM lief alle 3 s
       auf jedem Gerät – am Handy der größte Leerlauf-Verbrauch. Ohne Maus wird nur eine
       schon gefundene Leiste zurückgesetzt (nie gesucht); mit Maus neu suchen, wenn die
       Leiste fehlt (in den ersten 20 s wie bisher sofort, danach höchstens alle 3 s) oder weg ist, sonst nur alle 30 s zur Sicherheit. */
    if (!fine.matches) {
      var h0 = cache.host, st0 = h0 && h0.shadowRoot && h0.shadowRoot.getElementById('casora-desk-pill');
      if (st0) { st0.remove(); h0.style.left = ''; h0.style.width = ''; h0.removeAttribute('data-casora-narrow'); }
      return;
    }
    var age = Date.now() - cache.at;
    if (age > 30000 || (!cache.host && (age > 3000 || Date.now() - t0 < 20000)) || (cache.host && !cache.host.isConnected)
        || (cache.panel && !cache.panel.isConnected)) {
      var h = [], p = [];
      walk(document, 'casora-nav-bar', h, 0);
      walk(document, 'ha-panel-lovelace', p, 0);
      cache = { host: h.filter(function (x) { return x.isConnected; })[0] || null, panel: p[0] || null, at: Date.now() };
    }
    var host = cache.host;
    if (!host || host._variant !== 'tablet' || !host.shadowRoot) return;
    var st = host.shadowRoot.getElementById('casora-desk-pill');
    var left = cache.panel ? Math.max(0, Math.round(cache.panel.getBoundingClientRect().left)) : 0;
    var w = window.innerWidth - left;
    var max = Math.max(240, w - 2 * RESERVE);
    /* Casora (30.09.2026): Schmaler Inhaltsbereich (Tablet-Breite 1024 mit offener
       Seitenleiste = 768 px): die symmetrische Reserve ließ nur die 240-px-Mindestbreite
       übrig – zwei bis drei Räume, Namen abgeschnitten („aschküche“). Rechts brauchen
       nur die runden Knöpfe Platz; links liegt die Uhr, die der Uhr-Wächter unten
       ausblendet, sobald die Pille über ihr liegt. Also rechts Knöpfe freihalten,
       links fast bis zum Rand, und die Pille in diesem Bereich zentrieren. */
    var narrow = w - 2 * RESERVE < 420;
    if (narrow) {
      var RIGHT = 232, LEFT = 20;
      left += LEFT;
      w = Math.max(240, w - LEFT - RIGHT);
      max = w;
    }
    if (!st) {
      st = document.createElement('style'); st.id = 'casora-desk-pill';
      st.textContent = '.bar { max-width: var(--casora-desk-pill-max, none) !important; overflow-x: auto !important; scrollbar-width: none; } .bar::-webkit-scrollbar { display: none; }'
        /* schmal: etwas engere Namen, damit mehr Räume in die Pille passen */
        + ' :host([data-casora-narrow]) .label { padding: 0 var(--casora-nav-label-pad-x-tablet-narrow, 12px) !important; font-size: 15px !important; }'
        + ' :host([data-casora-narrow]) .route + .route { margin-left: 2px !important; }';
      host.shadowRoot.appendChild(st);
    }
    if (host.hasAttribute('data-casora-narrow') !== narrow) host.toggleAttribute('data-casora-narrow', narrow);
    var L = left + 'px', W = w + 'px', M = max + 'px';
    if (host.style.left !== L) host.style.left = L;
    if (host.style.width !== W) host.style.width = W;
    if (host.style.getPropertyValue('--casora-desk-pill-max') !== M) host.style.setProperty('--casora-desk-pill-max', M);
  }, 400);
})();

// ── Desktop: Uhrzeit nicht unter der Glas-Pille (27.09.2026) ──────────────────
// Die Uhr sitzt links in derselben Zeile wie die Pille. Viele Räume machen die
// Pille so breit, dass sie über der Uhr liegt – dann die Uhr ausblenden, bis
// wieder Platz ist (breiteres Fenster, Seitenleiste zu).
(function () {
  if (window._casoraTimeGuard) return;
  window._casoraTimeGuard = true;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var els = { bar: null, times: [], at: 0 };
  function walk(root, sel, out, d) {
    if (!root || d > 14 || !root.querySelectorAll) return;
    root.querySelectorAll(sel).forEach(function (e) { out.push(e); });
    root.querySelectorAll('*').forEach(function (e) { if (e.shadowRoot) walk(e.shadowRoot, sel, out, d + 1); });
  }
  function find() {
    var bars = [], times = [];
    walk(document, 'casora-nav-bar', bars, 0);
    walk(document, '#time', times, 0);
    var host = bars.filter(function (b) { return b.isConnected; })[0];
    els = { bar: host && host.shadowRoot && host.shadowRoot.querySelector('.bar'), times: times, at: Date.now() };
  }
  setInterval(function () {
    if (!fine.matches || document.hidden) return;
    /* Neu suchen nur, wenn Leiste/Uhr fehlen oder weg sind (höchstens alle 4 s), sonst alle 30 s. */
    var age = Date.now() - els.at;
    if (age > 30000 || (els.bar && !els.bar.isConnected)
        || (age > 4000 && (!els.bar || !els.times.length || els.times.some(function (t) { return !t.isConnected; })))) find();
    var b = els.bar && els.bar.getBoundingClientRect();
    els.times.forEach(function (t) {
      if (!t.isConnected) return;
      var r = t.getBoundingClientRect();
      var hit = b && b.width > 0 && r.width > 0 && r.right + 12 > b.left && r.left < b.right + 12
        && r.bottom > b.top && r.top < b.bottom;
      var want = hit ? 'hidden' : '';
      if (t.style.visibility !== want) t.style.visibility = want;
    });
  }, 700);
})();

// ── HA-Kopfzeile ohne kiosk-mode ausblenden (27.09.2026) ──────────────────────
// Casora-Dashboards speichern kiosk_mode.hide_header (Standard: an). Ist das
// Zusatzmodul kiosk-mode nicht installiert, blendet Casora die Kopfzeile selbst
// aus – sonst liegen HA-Tabs und Knöpfe über der Glas-Navigation. Mit ?edit=1
// oder im Bearbeitungsmodus bleibt sie sichtbar.
(function () {
  if (window._casoraHeaderGuard) return;
  window._casoraHeaderGuard = true;
  var ID = 'casora-hide-header';
  var CSS = '.header, .toolbar { display: none !important; }'
    + ' #view { padding-top: env(safe-area-inset-top) !important; min-height: 100vh !important; }'
    + ' :host { --header-height: 0px !important; }';
  function root() {
    try {
      var r = document.querySelector('home-assistant').shadowRoot.querySelector('home-assistant-main').shadowRoot;
      var p = r.querySelector('partial-panel-resolver');
      var l = p && p.querySelector('ha-panel-lovelace');
      return l && l.shadowRoot && l.shadowRoot.querySelector('hui-root');
    } catch (e) { return null; }
  }
  function want(hr) {
    if (window.KioskMode) return false;                       // kiosk-mode übernimmt
    if (/[?&]edit=1/.test(location.search)) return false;
    var ll = hr.lovelace;
    if (!ll || !ll.config || ll.editMode) return false;
    var km = ll.config.kiosk_mode;
    if (!km) return false;
    var phone = window.matchMedia('(max-width: 767px)').matches;
    var ms = km.mobile_settings;
    return !!(phone && ms && ms.hide_header !== undefined ? ms.hide_header : km.hide_header);
  }
  setInterval(function () {
    var hr = root();
    if (!hr || !hr.shadowRoot) return;
    var st = hr.shadowRoot.getElementById(ID);
    var on = want(hr);
    if (on && !st) {
      st = document.createElement('style'); st.id = ID; st.textContent = CSS;
      hr.shadowRoot.appendChild(st);
    } else if (!on && st) st.remove();
  }, 300);
})();

// ── Übersetzung für den Popup-Baukasten (27.09.2026) ──────────────────────────
// Die Bausteine von window._casoraUI (hero, group, segments …) liefern fertiges
// HTML, das teils direkt ins Popup geschrieben wird. Ihre Ausgabe hier einmal
// durch window.casoraTr schicken (bei Deutsch ohne Wirkung).
(function () {
  if (window._casoraUITr) return;
  window._casoraUITr = true;
  var SKIP = { esc: 1, prime: 1, icon: 1, tokens: 1, v: 1 };
  function wrap(UI) {
    if (!UI || UI.__tr) return;
    Object.keys(UI).forEach(function (k) {
      var f = UI[k];
      if (SKIP[k] || typeof f !== 'function') return;
      UI[k] = function () {
        var out = f.apply(this, arguments);
        return typeof out === 'string' && window.casoraTr ? window.casoraTr(out) : out;
      };
    });
    UI.__tr = true;
  }
  (function tryWrap(n) {
    if (window._casoraUI) wrap(window._casoraUI);
    else if (n < 200) setTimeout(function () { tryWrap(n + 1); }, 50);
  })(0);
})();

// ── Popup-Tippschutz beim Drücken (24.09.2026) ─────────────────────────────
// Mit der Maus kommt der Klick beim Popup erst an, wenn die angeklickte Kachel
// (z. B. Lampen-Icon im Licht-Gruppen-Popup) schon neu gezeichnet wird – der
// Hintergrund-Test des Popups findet dann keine Kachel und schließt es. Darum
// schon beim Drücken prüfen: liegt der Zeiger auf einer Kachel, ist der folgende
// Klick kein Tipp auf den Hintergrund.
(function () {
  if (window._casoraDownGuard) return;
  window._casoraDownGuard = true;
  document.addEventListener('pointerdown', function (ev) {
    var pop = window.casoraPopup && window.casoraPopup.element;
    if (!pop || !pop.hasAttribute('open') || !pop.content || typeof pop._overWidget !== 'function') return;
    var p = (ev.composedPath && ev.composedPath()) || [];
    if (p.indexOf(pop.content) === -1) return;
    try {
      if (pop._overWidget(ev)) {
        window._casoraSuppressDismiss = Math.max(window._casoraSuppressDismiss || 0, Date.now() + 1500);
      }
    } catch (e) {}
  }, true);
})();

// Badge-Reihen der Raumkarte seitwärts blättern (30.09.2026): Eine aufgeklappte
// Unter-Badge-Reihe (Szenen, Beleuchtung, Klima …) war breiter als der Bildschirm und
// ließ sich nicht verschieben. Die Raumkarte ruft das bei jedem Zeichnen auf (einmal je
// Reihe verdrahtet). Reicht der Platz, bleibt die Reihe overflow:visible (die Einflug-
// Animation von oben bleibt ungeschnitten); ist sie zu breit, bekommt sie data-cs-scroll
// (CSS in casora_room: overflow-x:auto) und einen weichen Rand (data-cs-fade l/r) auf der
// Seite, auf der noch Badges liegen. Touch und Trackpad seitwärts bleiben nativ; das
// Mausrad (senkrecht) scrollt die Reihe, solange sie in diese Richtung kann, an den Enden
// wieder die Seite; Ziehen mit der Maus ab 6 px, der Klick danach wird geschluckt –
// wie die Kachelreihe in smart-row.js.
window._casoraBadgeRows = function (root) {
  if (!root || !root.querySelectorAll) return;
  var rows = root.querySelectorAll('#badges, #badges_climate, #badges_presence, #badges_media, '
    + '#badges_lights, #badges_security, #badges_energy, #badges_scenes, '
    // Handy (casora_mobile_filter_badges / casora_mobile_sensor_chips): dieselben weichen Ränder.
    + '#climate_row, #security_row, #energy_row, #rooms_row, '
    // Raumseite am Handy: Unter-Reihen der Sammel-Badges (wie am Desktop, 05.10.2026).
    + '#room_sub_climate, #room_sub_security, #room_sub_lights, #room_sub_presence, #room_sub_energy, #room_sub_media');
  if (!rows.length) {
    // Erstes Zeichnen: die Felder stehen erst nach dem Rendern im Schatten-DOM.
    // Höchstens 20 Versuche (6 s) – Karten ohne Badge-Reihen sollen nicht ewig nachfragen.
    if (!root._casoraBrWait && (root._casoraBrTries || 0) < 20) {
      root._casoraBrWait = true;
      root._casoraBrTries = (root._casoraBrTries || 0) + 1;
      setTimeout(function () { root._casoraBrWait = false; window._casoraBadgeRows(root); }, 300);
    }
    return;
  }
  root._casoraBrTries = 0;
  Array.prototype.forEach.call(rows, window._casoraFadeRow);
};

// Eine waagrecht scrollende Reihe verdrahten (weicher Rand data-cs-fade l/r, Mausrad,
// Ziehen mit der Maus). Mehrfach aufrufen ist unschädlich: ab dem zweiten Mal wird nur
// neu gemessen. Auch für die Raum-Chips im Licht-Popup (casora_popup_light, 03.10.2026);
// den Maskenverlauf liefert die jeweilige Karte per CSS.
window._casoraFadeRow = function (row) {
  if (!row || !row.addEventListener) return;
  if (row._casoraBr) { row._casoraBr(); return; }
  var max = function () { return row.scrollWidth - row.clientWidth; };
  // Was wirklich übersteht (03.10.2026): WebKit (Safari, HA-App am Mac) zählt bei den
  // Badges abgeschnittenen Inhalt (ha-card overflow:hidden) in scrollWidth mit – je Badge
  // bis ~9 px. Eine Reihe mit Platz bis zum Kartenrand galt so als zu breit und blieb rechts
  // ausgeblendet. Maßgeblich ist darum der rechte Rand der sichtbaren Kästen (button-card
  // als Ganzes, in abschneidende Kästen nicht hinein), Schatten-DOM eingeschlossen.
  var real = function () {
    var r = row.getBoundingClientRect();
    var right = -Infinity, n = 0;
    var walk = function (el, d) {
      var kids = (el.shadowRoot || el).children;
      for (var i = 0; i < kids.length && n < 400; i++) {
        var k = kids[i];
        n++;
        var b = k.getBoundingClientRect();
        if (b.width > 0 && b.right > right) right = b.right;
        if (d > 7 || k.localName === 'button-card') continue;
        if (k.shadowRoot || k.children.length) {
          var ov = getComputedStyle(k).overflowX;
          if (ov === 'visible' || k.shadowRoot) walk(k, d + 1);
        }
      }
    };
    walk(row, 0);
    if (right === -Infinity) return max();
    var pad = parseFloat(getComputedStyle(row).paddingRight) || 0;
    return Math.ceil(right - r.left - row.clientLeft + row.scrollLeft + pad - row.clientWidth);
  };
  var edges = function () {
    var m = max();
    // Nur wenn auch die Kästen überstehen (sonst Rundung/Phantom-Breite, s. real()).
    if (m > 2 && real() <= 2) m = 0;
    var over = m > 2 && row.clientWidth > 0;
    if (over !== row.hasAttribute('data-cs-scroll')) row.toggleAttribute('data-cs-scroll', over);
    if (!over && row.scrollLeft) row.scrollLeft = 0;
    var f = !over ? '' : ((row.scrollLeft > 2 ? 'l' : '') + (row.scrollLeft < m - 2 ? ' r' : '')).trim();
    if ((row.getAttribute('data-cs-fade') || '') !== f) {
      if (f) row.setAttribute('data-cs-fade', f); else row.removeAttribute('data-cs-fade');
    }
  };
  var queued = false;
  var now = function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; edges(); });
  };
  // Aufklappen: die Badges bekommen ihre Breite erst nach ein paar Bildern.
  var settle = null, settle2 = null;
  var ro = null;
  var later = function () {
    // Reihe aus dem DOM (Karte neu gezeichnet): Beobachter abmelden; kommt sie wieder,
    // meldet der nächste Aufruf der Raumkarte ihn neu an.
    if (!row.isConnected) {
      if (ro) { ro.disconnect(); ro = null; }
      clearTimeout(settle);
      clearTimeout(settle2);
      return;
    }
    if (!ro && window.ResizeObserver) { ro = new ResizeObserver(later); ro.observe(row); }
    now();
    clearTimeout(settle);
    clearTimeout(settle2);
    settle = setTimeout(now, 450);
    // Noch einmal nach der Einflug-Federung: deren Überschwinger (wenige px) darf nicht die
    // letzte Messung sein – danach meldet sich sonst nichts mehr (keine Größenänderung).
    settle2 = setTimeout(now, 1200);
  };
  row._casoraBr = later;
  var scrolls = function () { return row.hasAttribute('data-cs-scroll') && max() > 1; };
  row.addEventListener('wheel', function (e) {
    if (e.ctrlKey || !scrolls()) return;
    if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // Trackpad/Shift seitwärts: nativ
    var unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? row.clientWidth : 1;
    var dy = e.deltaY * unit;
    if ((dy > 0 && row.scrollLeft >= max() - 1) || (dy < 0 && row.scrollLeft <= 0)) return;
    e.preventDefault();
    row.scrollLeft += dy;
  }, { passive: false });
  var drag = null;
  var move = function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < 6) return;
    if (!drag.moved) { drag.moved = true; row.style.cursor = 'grabbing'; }
    e.preventDefault();
    row.scrollLeft = drag.left - dx;
  };
  var end = function () {
    if (!drag) return;
    var moved = drag.moved;
    drag = null;
    row.style.cursor = '';
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', end, true);
    window.removeEventListener('pointercancel', end, true);
    if (moved) {
      // Der Klick nach echtem Ziehen löst keine Badge aus.
      var eat = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', eat, { capture: true, once: true });
      setTimeout(function () { window.removeEventListener('click', eat, true); }, 0);
    }
  };
  row.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !scrolls()) return;
    drag = { x: e.clientX, left: row.scrollLeft, moved: false };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
  });
  row.addEventListener('dragstart', function (e) { if (drag && drag.moved) e.preventDefault(); });
  row.addEventListener('scroll', now, { passive: true });
  // Fenstergröße deckt der ResizeObserver ab (in later() angemeldet) – kein window-resize.
  setTimeout(later, 600);
  later();
};

// ── Handy-Startseite: Abstand Kopfleiste → „Zuhause“ nach langer Pause (05.10.2026) ─────────
// Gemeldet: Nach längerer Zeit im Hintergrund stand die Zeile „Zuhause / Wetter“ am Handy rund
// 150 px zu tief unter der Kopfleiste; Aktualisieren behob es. Im Test (WebKit: Viewport-
// Wechsel, verstecken/zeigen, pageshow, Verbindungsabbruch) ließ es sich nicht nachstellen.
// Darum hier robust: Den natürlichen Abstand des Kopfs zum Seitenanfang einmal merken; nach
// Rückkehr (pageshow, sichtbar nach ≥ 20 s im Hintergrund) neu messen; Größenwechsel merken nur neu. Ist der Kopf
// mehr als 40 px tiefer, erst alles neu berechnen lassen (resize-Ereignis), hilft das nicht,
// die Seite neu laden. Was dabei auffiel, steht in localStorage „casora.gapTrace“ (Diagnose).
(function () {
  if (window._casoraGapGuard) return;
  window._casoraGapGuard = true;
  var MQ = window.matchMedia('(max-width: 767px) and (orientation: portrait)');
  var natural = null, hiddenAt = 0, backAt = 0, busy = false;
  function isHead(e) {
    var t = e._config && e._config.template;
    return [].concat(t || []).indexOf('casora_mobile_weather') > -1;
  }
  function findHead() {
    var hit = null;
    (function walk(r, d) {
      if (hit || !r || d > 14 || !r.querySelectorAll) return;
      var list = r.querySelectorAll('button-card');
      for (var i = 0; i < list.length; i++) if (isHead(list[i])) { hit = list[i]; return; }
      var all = r.querySelectorAll('*');
      for (var j = 0; j < all.length && !hit; j++) if (all[j].shadowRoot) walk(all[j].shadowRoot, d + 1);
    })(document, 0);
    return hit;
  }
  function viewOf(el) {
    var n = el;
    for (var i = 0; i < 30 && n; i++) {
      if (n.tagName === 'HUI-VIEW') return n;
      n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
    }
    return null;
  }
  function measure() {
    if (!MQ.matches || !/-mobile\//.test(location.pathname)) return null;
    var h = findHead(), v = h && viewOf(h);
    if (!h || !v) return null;
    var hr = h.getBoundingClientRect(), vr = v.getBoundingClientRect();
    if (!hr.height || !vr.height) return null;
    return { gap: Math.round(hr.top - vr.top), head: h, view: v };
  }
  function trace(m, why) {
    try {
      var out = { at: new Date().toISOString(), why: why, natural: natural, gap: m.gap,
        ih: window.innerHeight, vv: window.visualViewport ? Math.round(window.visualViewport.height) : null, chain: [] };
      var n = m.head;
      for (var i = 0; i < 12 && n && n !== m.view; i++) {
        var s = n.previousElementSibling, sib = [];
        while (s) { var r = s.getBoundingClientRect(); if (r.height > 4) sib.push((s.tagName || '') + ':' + Math.round(r.height)); s = s.previousElementSibling; }
        var cs = getComputedStyle(n);
        out.chain.push((n.tagName || '') + ' mt=' + cs.marginTop + ' pt=' + cs.paddingTop + (sib.length ? ' vor=' + sib.join(',') : ''));
        n = n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
      }
      var all = JSON.parse(localStorage.getItem('casora.gapTrace') || '[]');
      all.push(out);
      localStorage.setItem('casora.gapTrace', JSON.stringify(all.slice(-5)));
    } catch (e) {}
  }
  function check(why) {
    if (busy) return;
    var m = measure();
    if (!m) return;
    if (natural == null) { natural = m.gap; return; }
    if (m.gap <= natural + 40) { if (m.gap < natural) natural = m.gap; return; }
    busy = true;
    trace(m, why);
    window.dispatchEvent(new Event('resize'));
    setTimeout(function () {
      var m2 = measure();
      busy = false;
      if (!m2 || m2.gap <= natural + 40) return;
      trace(m2, why + ':reload');
      // Nicht mitten in einer Bedienung: offenes Popup oder Raum lässt die Seite stehen.
      if (window.casoraPopup && window.casoraPopup.surface) return;
      // Nie in einer Schleife: höchstens ein Neuladen pro Minute.
      try { if (Date.now() - Number(sessionStorage.getItem('casora.gapReload') || 0) < 60000) return; } catch (e) {}
      try { sessionStorage.setItem('casora.gapReload', String(Date.now())); } catch (e) {}
      location.reload();
    }, 900);
  }
  // Erste Messung, wenn die Seite steht (einmal nach dem Laden, nur Startseite ohne Filter).
  var tries = 0;
  var iv = setInterval(function () {
    if (++tries > 40 || natural != null) { clearInterval(iv); return; }
    if (document.hidden) return;
    var m = measure();
    if (m) natural = m.gap;
  }, 1500);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= 20000) { backAt = Date.now(); setTimeout(function () { check('visible'); }, 1500); }
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) { backAt = Date.now(); setTimeout(function () { check('pageshow'); }, 1500); } });
  // Größe/Drehung ändern den Abstand zu Recht (Schriftgröße, Querformat): dann nur neu merken,
  // nie neu laden. Gilt für window- und visualViewport-resize, solange die Seite sichtbar ist.
  var rt = null;
  function remeasure() {
    if (document.hidden) return;
    clearTimeout(rt);
    rt = setTimeout(function () {
      // Kurz nach der Rückkehr entscheidet check(), nicht das Neu-Merken (iOS meldet dabei oft ein resize).
      if (busy || Date.now() - backAt < 6000) return;
      var m = measure(); if (m) natural = m.gap;
    }, 1500);
  }
  window.addEventListener('resize', remeasure);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', remeasure);
})();
