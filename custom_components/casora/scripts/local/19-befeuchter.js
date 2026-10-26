// ── Luftbefeuchter: Popup (Casora 1.5) ─────────────────────────────────────────
// Kachel casora_humidifier öffnet dieses Popup statt HAs Dialog, Aufbau wie beim Luftreiniger:
// oben Raum + Zustand, darunter Verlauf der Luftfeuchte, links Betrieb/Modus/Zielfeuchte und
// Einstellungen, rechts Status. Bedient wird über HAs eigene Dienste (humidifier.*). Entitäten am
// selben Gerät (Luftfeuchte, Wassertank, Leistung) werden über Geräteklasse und Einheit gesucht.
//   window._casoraHumid.find(hass, id)              → {hum, humidity, water, waterLow, power}
//   window._casoraHumid.status(c, states, hass)     → {on, dead, label, mode, target, current, …}
//   window._casoraHumid.steps(min, max, target)     – Zielfeuchte-Felder
//   window._casoraHumid.popup(entity, states, hass) – Popup casora_humidifier
//   window._casoraHumid.sec(part, C, states, hass)  – Live-Bereiche (hero, ctrl, info, set)
(function () {
  if (window._casoraHumid) return;
  var H = window._casoraHumid = {};
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable'; };

  H.find = function (hass, id) {
    var c = { hum: id, humidity: null, water: null, waterLow: null, power: null };
    var reg = (hass && hass.entities) || {}, S = (hass && hass.states) || {};
    var dev = reg[id] && reg[id].device_id;
    if (!dev) return c;
    Object.keys(reg).sort().forEach(function (eid) {
      var e = reg[eid];
      if (!e || e.device_id !== dev || eid === id || e.hidden_by || e.disabled_by) return;
      var dom = eid.split('.')[0], a = (S[eid] && S[eid].attributes) || {}, key = (e.translation_key || '') + ' ' + eid;
      if (dom === 'sensor') {
        if (a.device_class === 'humidity') c.humidity = c.humidity || eid;
        else if (/water|wasser|tank/i.test(key) && a.unit_of_measurement === '%') c.water = c.water || eid;
        else if (a.unit_of_measurement === 'W') c.power = c.power || eid;
      } else if (dom === 'binary_sensor' && /water|wasser|tank/i.test(key)) c.waterLow = c.waterLow || eid;
    });
    return c;
  };

  // Modus-Namen wie in HA (Übersetzung der Integration), sonst die gängigen auf Deutsch.
  var DE = { normal: 'Normal', eco: 'Eco', away: 'Abwesend', boost: 'Boost', comfort: 'Komfort', home: 'Zuhause',
    sleep: 'Schlaf', auto: 'Auto', baby: 'Baby', manual: 'Manuell', low: 'Niedrig', medium: 'Mittel', high: 'Hoch' };
  H.modeLabel = function (hass, st, m) {
    var t = m;
    try { if (hass && hass.formatEntityAttributeValue) t = hass.formatEntityAttributeValue(st, 'mode', m) || m; } catch (e) { t = m; }
    if (String(t) !== String(m)) return t;
    var s = String(m || '');
    return DE[s.toLowerCase()] || (s.charAt(0).toUpperCase() + s.slice(1));
  };

  H.status = function (c, states, hass) {
    var st = states[c.hum], a = (st && st.attributes) || {};
    var dead = !st || bad(st.state), on = !dead && st.state === 'on';
    var current = num(a.current_humidity);
    if (current == null && c.humidity && states[c.humidity] && !bad(states[c.humidity].state)) current = num(states[c.humidity].state);
    var water = c.water && states[c.water] ? num(states[c.water].state) : null;
    var low = c.waterLow && states[c.waterLow] ? states[c.waterLow].state === 'on' : null;
    var label = dead ? 'Nicht verfügbar' : !on ? 'Aus' : a.action === 'humidifying' ? 'Befeuchtet' : a.action === 'drying' ? 'Entfeuchtet'
      : a.action === 'idle' ? 'Bereit' : 'An';
    return { on: on, dead: dead, label: label, mode: on ? a.mode || null : null, modes: Array.isArray(a.available_modes) ? a.available_modes : [],
      target: num(a.humidity), min: num(a.min_humidity), max: num(a.max_humidity), current: current, water: water, waterLow: low,
      dehum: a.device_class === 'dehumidifier' };
  };

  // Feste 5er-Schritte 40–60 im Bereich des Geräts; liegt das Ziel daneben, kommt es dazu.
  H.steps = function (min, max, target) {
    min = min == null ? 0 : min; max = max == null ? 100 : max;
    var out = [40, 45, 50, 55, 60].filter(function (v) { return v >= min && v <= max; });
    if (out.length < 3) {
      out = [];
      var lo = Math.ceil(min / 5) * 5, hi = Math.floor(max / 5) * 5, step = Math.max(5, Math.ceil((hi - lo) / 4 / 5) * 5);
      for (var v = lo; v <= hi && out.length < 5; v += step) out.push(v);
    }
    if (target != null && out.indexOf(Math.round(target)) === -1) {
      out.push(Math.round(target));
      out.sort(function (x, y) { return x - y; });
    }
    return out;
  };

  H.popup = function (entity, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    var id = entity && entity.entity_id;
    if (!K || !UI || !id) return empty;
    var c = H.find(hass, id);
    var watch = [c.hum, c.humidity, c.water, c.waterLow, c.power].filter(Boolean);
    var call = function (part) {
      return 'return window._casoraHumid ? window._casoraHumid.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), states) }, ctrl: { card: K.secCard(watch, call('ctrl'), states) },
      info: { card: K.secCard(watch, call('info'), states) } };
    var top = ['hero'];
    if (c.humidity) {
      f.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: '24h', source: 'history',
        series: [{ entity: c.humidity, name: 'Luftfeuchte', unit: '%' }], height: 160, readout: 'own', plate: true } };
      top.push('chart');
    }
    /* Blueprint v2: „Einstellungen“ last – right column bottom on the desktop, the end on the phone (both orders alike). */
    return K.layout({ fields: f, top: top, left: ['ctrl'], right: ['info'], narrowOrder: ['ctrl', 'info'], settings: id });
  };

  H.sec = function (part, c, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var s = H.status(c, states, hass), st = states[c.hum], tgt = { entity_id: c.hum };
    if (part === 'hero') {
      var reg = (hass && hass.entities) || {}, r = reg[c.hum] || {};
      var area = r.area_id || (r.device_id && hass.devices && hass.devices[r.device_id] ? hass.devices[r.device_id].area_id : null);
      // Ohne Raum kein Etikett – sonst stünde „Luftbefeuchter“ unter dem gleichnamigen Titel.
      var room = (area && hass.areas && hass.areas[area] && hass.areas[area].name) || null;
      // The room is the label above the title (frame, blueprint v2 rule 1), not part of the status line.
      void room;
      return UI.hero({ value: s.mode ? H.modeLabel(hass, st, s.mode) : s.label,
        sub: s.on && s.target != null ? 'Ziel ' + Math.round(s.target) + ' %' : null, center: true });
    }
    if (part === 'ctrl') {
      if (s.dead) return '';
      /* Blueprint v2 (decision 2): on/off is only the main switch in the header – no „Betrieb Aus | An“ any more.
         While off, a mode switches the humidifier on. */
      var out = '';
      if (s.modes.length) {
        out += UI.segments(s.modes.map(function (m) {
          return { label: H.modeLabel(hass, st, m), active: s.on && s.mode === m,
            svc: s.on ? { domain: 'humidifier', service: 'set_mode', data: { mode: m }, target: tgt } : { domain: 'humidifier', service: 'turn_on', target: tgt } };
        }), 'Modus');
      }
      if (s.target != null) {
        out += (out ? '<div style="height:18px"></div>' : '') + UI.segments(H.steps(s.min, s.max, s.target).map(function (v) {
          return { label: v + ' %', active: Math.round(s.target) === v, svc: { domain: 'humidifier', service: 'set_humidity', data: { humidity: v }, target: tgt } };
        }), 'Zielfeuchte');
      }
      return out;
    }
    if (part === 'info') {
      var rows = [];
      if (s.current != null) rows.push({ entity: c.humidity || null, icon: 'mdi:water-percent', iconTone: 'accent', label: 'Luftfeuchte', value: Math.round(s.current) + ' %' });
      if (s.water != null) rows.push({ entity: c.water, icon: 'mdi:cup-water', iconTone: s.water < 15 ? 'warn' : 'accent', label: 'Wassertank',
        value: Math.round(s.water) + ' %', bar: s.water / 100, barTone: s.water < 15 ? 'bad' : s.water < 30 ? 'warn' : 'good' });
      else if (s.waterLow != null) rows.push({ entity: c.waterLow, icon: 'mdi:cup-water', iconTone: s.waterLow ? 'bad' : 'accent', label: 'Wassertank',
        value: s.waterLow ? 'Leer' : 'OK', valueTone: s.waterLow ? 'bad' : null });
      var pw = c.power && states[c.power] ? num(states[c.power].state) : null;
      if (pw != null) rows.push({ entity: c.power, icon: 'mdi:flash', iconTone: 'good', label: 'Leistung', value: (pw < 10 ? pw.toFixed(1).replace('.', ',') : Math.round(pw)) + ' W' });
      return rows.length ? UI.group(rows, 'Status') : '';
    }
    if (part === 'set') return UI.settings ? UI.settings(c.hum) : '';
    return '';
  };
})();
