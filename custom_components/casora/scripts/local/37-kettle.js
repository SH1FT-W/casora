// ── Kettle (community card „Wasserkocher“, issue #87) ──────────────────────────────────────────────────────────
// The kettle's entities come from casoraKettleFind (00-finder.js): the water temperature, whether it heats (Xiaomi BLE's
// power binary_sensor), and where the integration has them a water_heater (target temperature, modes), a number for
// the target or keep-warm temperature and a keep-warm switch. This module holds what does not depend on a popup design;
// the popup (casora_popup_kettle) shows HA's entity rows and the temperature history until popup v3 draws Casora's own
// (.qa/v3/issue-popups-fuer-v3.md, source: popup-rework-varianten 09a89957).
//   window._casoraKettle.model(hass, id, vars) → the kettle's values
//   window._casoraKettle.word(m)               – Heizt, Warmhalten, Heiß/Warm/Kalt, Aus
//   window._casoraKettle.tileState(st, hass, vars) – tile casora_kettle („92° · Heizt“, „24° · Aus“)
//   window._casoraKettle.popup(entity, hass, vars) – the popup's cards
(function () {
  if (window._casoraKettle) return;
  var K = window._casoraKettle = {};
  var clean = function (n) { return window.casoraCleanName ? window.casoraCleanName(n) : String(n || ''); };
  var fmt = function (x) { return x == null || !isFinite(Number(x)) ? '–' : String(Math.round(Number(x))); };
  var usable = function (st) { return !!st && st.state !== 'unavailable' && st.state !== 'unknown'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var pickVar = function (v, k) { var x = v && v[k]; return typeof x === 'string' && x && x !== 'None' ? x : null; };

  K.model = function (hass, id, vars) {
    var S = (hass && hass.states) || {}, v = vars || {};
    var F = window.casoraKettleFind, k = (F && F.of(hass, id)) || {};
    var dom = String(id || '').split('.')[0];
    var m = { id: id, temp: dom === 'sensor' ? id : k.temp || null, heater: pickVar(v, 'heater_entity') || (dom === 'water_heater' ? id : k.heater || null),
      power: pickVar(v, 'power_entity') || k.power || null, target: pickVar(v, 'target_entity') || k.target || null,
      warm: pickVar(v, 'keep_warm_entity') || k.warm || null, device: k.device || ((hass.entities || {})[id] || {}).device_id || null };
    var ts = S[m.temp], hs = S[m.heater], ps = S[m.power], ws = S[m.warm], gs = S[m.target];
    var main = S[id];
    m.dead = !usable(main);
    m.t = usable(ts) ? num(ts.state) : hs ? num((hs.attributes || {}).current_temperature) : null;
    var unit = String(((ts || {}).attributes || {}).unit_of_measurement || ((hass.config || {}).unit_system || {}).temperature || '°C');
    m.f = /F/.test(unit);
    m.heating = usable(ps) ? ps.state === 'on' : null;
    m.keepWarm = usable(ws) ? ws.state === 'on' : null;
    // Target: the water_heater's, else the number's.
    if (usable(hs) && num((hs.attributes || {}).temperature) != null) {
      var ha = hs.attributes;
      m.goal = { value: num(ha.temperature), min: num(ha.min_temp), max: num(ha.max_temp), step: num(ha.target_temp_step) || 1,
        spec: { domain: 'water_heater', service: 'set_temperature', target: { entity_id: m.heater }, field: 'temperature' } };
    } else if (usable(gs) && num(gs.state) != null) {
      var ga = gs.attributes || {};
      m.goal = { value: num(gs.state), min: num(ga.min), max: num(ga.max), step: num(ga.step) || 1,
        spec: { domain: 'number', service: 'set_value', target: { entity_id: m.target }, field: 'value' } };
    }
    m.modes = usable(hs) && Array.isArray((hs.attributes || {}).operation_list) ? hs.attributes.operation_list : [];
    m.mode = usable(hs) ? hs.state : null;
    // Heating without a power sensor: a water_heater that is not off.
    if (m.heating == null && usable(hs)) m.heating = hs.state !== 'off';
    var d = m.device && (hass.devices || {})[m.device];
    m.name = String(v.room_name || '').trim() || clean((d && (d.name_by_user || d.name)) || ((main || {}).attributes || {}).friendly_name || 'Wasserkocher');
    m.since = ps ? Date.parse(ps.last_changed) : NaN;
    m.watch = [id, m.temp, m.heater, m.power, m.target, m.warm].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
    return m;
  };
  // The word for the state: heating, keeping warm, else how hot the water still is (°F: the same points converted).
  K.word = function (m) {
    if (m.dead) return 'Nicht erreichbar';
    if (m.heating) return 'Heizt';
    if (m.keepWarm) return 'Warmhalten';
    if (m.t == null) return m.heating === false ? 'Aus' : '';
    var c = m.f ? (m.t - 32) * 5 / 9 : m.t;
    return c >= 80 ? 'Heiß' : c >= 45 ? 'Warm' : m.heating === false ? 'Aus' : 'Kalt';
  };
  K.tileState = function (st, hass, vars) {
    if (!st || !hass) return '';
    var m = K.model(hass, st.entity_id, vars);
    if (m.dead) return 'Nicht erreichbar';
    var w = m.heating ? 'Heizt' : m.keepWarm ? 'Warmhalten' : m.heating === false ? 'Aus' : '';
    return [m.t != null ? fmt(m.t) + '°' : null, w].filter(Boolean).join(' · ');
  };
  K.active = function (st, hass, vars) { if (!st || !hass) return false; var m = K.model(hass, st.entity_id, vars); return !!(m.heating || m.keepWarm); };

  // The popup's cards: HA's rows for the kettle's entities (target and keep warm can be set there) and the
  // temperature of the last 24 hours.
  K.popup = function (entity, hass, vars) {
    var id = entity && entity.entity_id;
    if (!id || !hass) return { type: 'vertical-stack', cards: [] };
    var m = K.model(hass, id, vars), S = hass.states || {};
    var ents = [m.temp, m.power, m.heater, m.target, m.warm].filter(function (x, i, a) { return x && S[x] && a.indexOf(x) === i; });
    if (!ents.length) ents = [id];
    var cards = [{ type: 'entities', entities: ents }];
    if (m.temp && S[m.temp]) cards.push({ type: 'history-graph', hours_to_show: 24, entities: [m.temp] });
    return { type: 'vertical-stack', cards: cards };
  };
})();
