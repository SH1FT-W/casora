// ── Kettle (community card „Wasserkocher“, issue #87) ──────────────────────────────────────────────────────────
// The kettle's entities come from casoraKettleFind (00-finder.js): the water temperature, whether it heats (Xiaomi BLE's
// power binary_sensor), and where the integration has them a water_heater (target temperature, modes), a number for
// the target or keep-warm temperature and a keep-warm switch; this module adds the switch that starts it (Tuya-like
// kettles: one more switch on the device). Popup v3 „Bühne“ (popup-richtlinien-v3.md §4 S2/S6/S7, §4.8, §7):
//   target temperature (water_heater or number) → S2 dial with − / +, the water now as the dot on the ring and „Jetzt“;
//   without a target → S6 with a range: the water temperature on the level ring (heat colours), the word in the head;
//   the water_heater's modes as moons, the power switch in the head, the rest as one plate, the temperature as Verlauf –
//   one column (552) from the first opening.
// Other looks (Standard, Glas): HA's entity rows and history as before.
//   window._casoraKettle.model(hass, id, vars) → the kettle's values
//   window._casoraKettle.word(m)               – Heizt, Warmhalten, Heiß/Warm/Kalt, Aus
//   window._casoraKettle.tileState(st, hass, vars) – tile casora_kettle („92° · Heizt“, „24° · Aus“)
//   window._casoraKettle.popup(entity, hass, vars) – the popup's cards
//   window._casoraKettle.sec(part, c, states, hass) – the v3 parts (hero, stage, rows)
(function () {
  if (window._casoraKettle) return;
  var K = window._casoraKettle = {};
  var clean = function (n) { return window.casoraCleanName ? window.casoraCleanName(n) : String(n || ''); };
  var fmt = function (x) { return x == null || !isFinite(Number(x)) ? '–' : String(Math.round(Number(x))); };
  var usable = function (st) { return !!st && st.state !== 'unavailable' && st.state !== 'unknown'; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var pickVar = function (v, k) { var x = v && v[k]; return typeof x === 'string' && x && x !== 'None' ? x : null; };

  // The switch that starts the kettle (the head's main switch): another switch on its device than keep warm, not a
  // setting (entity_category), named for boiling/power – or the only one there is (Tuya: the device's own switch).
  // Each of its entities carries the device's name, so only the switch's own words count (not „Wasserkocher“).
  var START = /boil|kochen|power|start|heat|heiz|bouill|hervir|bollire|koken|gotow|ferver/i;
  var WARM = /keep.?warm|warm.?halt|warmhalt|maintien|mantener|mantenere|warmhoud|podtrzym|manter/i;
  K.switchOf = function (hass, m) {
    var R = (hass && hass.entities) || {}, S = (hass && hass.states) || {};
    if (!m.device || !window.casoraDeviceEntities) return null;
    var c = window.casoraDeviceEntities(R, m.device).filter(function (x) {
      var e = R[x] || {};
      return /^switch\./.test(x) && x !== m.warm && S[x] && !e.entity_category && !e.hidden && !e.hidden_by && !e.disabled_by;
    });
    var words = function (x) { return x + ' ' + ((S[x].attributes || {}).friendly_name || '') + ' ' + ((R[x] || {}).translation_key || ''); };
    c = c.filter(function (x) { return !WARM.test(words(x)); });
    var named = c.filter(function (x) { return START.test(words(x)); });
    return named[0] || (c.length === 1 ? c[0] : null);
  };

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
    m.sw = pickVar(v, 'switch_entity') || K.switchOf(hass, m);
    m.modes = usable(hs) && Array.isArray((hs.attributes || {}).operation_list) ? hs.attributes.operation_list : [];
    m.mode = usable(hs) ? hs.state : null;
    // Heating without a power sensor: a water_heater that is not off.
    if (m.heating == null && usable(hs)) m.heating = hs.state !== 'off';
    // … or the start switch.
    if (m.heating == null && usable(S[m.sw])) m.heating = S[m.sw].state === 'on';
    var d =m.device && (hass.devices || {})[m.device];
    m.name = String(v.room_name || '').trim() || clean((d && (d.name_by_user || d.name)) || ((main || {}).attributes || {}).friendly_name || 'Wasserkocher');
    m.since = ps ? Date.parse(ps.last_changed) : NaN;
    m.watch = [id, m.temp, m.heater, m.power, m.target, m.warm, m.sw].filter(function (x, i, a) { return x && a.indexOf(x) === i; });
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

  // ── Popup ─────────────────────────────────────────────────────────────────
  K.v3 = function () {
    var UI = window._casoraUI;
    if (!(UI && UI.stage && UI.soft && UI.soft() && window._casoraSoftKit)) return false;
    try { var v = localStorage.getItem('casora_popup_variant'); return !v || v === 'v3'; } catch (e) { return true; }
  };
  // The start switch is the head's main switch; without one the head has none (never the keep-warm switch).
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src, hass) {
    var tpl = [].concat((src && src._config && src._config.template) || []).join(' ');
    if (!/\bcasora_kettle\b/.test(tpl)) return null;
    var id = src._stateObj && src._stateObj.entity_id;
    if (!id || !hass) return false;
    var m = K.model(hass, id, (src._config && src._config.variables) || {});
    return m.sw ? { entities: [m.sw] } : false;
  });

  // Mode names: the integration's translation (HA), else the common ones in German.
  var MODE = { off: 'Aus', boil: 'Kochen', heat: 'Heizen', keep_warm: 'Warmhalten', warm: 'Warmhalten', eco: 'Eco', electric: 'Elektrisch',
    performance: 'Leistung', tea: 'Tee', coffee: 'Kaffee', baby: 'Baby' };
  var MODE_ICON = { off: 'mdi:power', boil: 'mdi:kettle-steam-outline', heat: 'mdi:kettle-outline', keep_warm: 'mdi:thermometer',
    warm: 'mdi:thermometer', eco: 'mdi:leaf', electric: 'mdi:flash-outline', performance: 'mdi:rocket-launch-outline', tea: 'mdi:tea-outline',
    coffee: 'mdi:coffee-outline', baby: 'mdi:baby-bottle-outline' };
  K.modeLabel = function (hass, st, mode) {
    var t = null;
    try { if (hass && hass.formatEntityState && st) t = hass.formatEntityState(st, mode); } catch (e) { t = null; }
    if (t && String(t) !== String(mode)) return String(t);
    var k = String(mode || '').toLowerCase();
    return MODE[k] || (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, ' ');
  };
  var unitOf = function (m) { return m.f ? '°F' : '°C'; };

  // The v3 parts, drawn live (secCard): c = { id, vars }.
  K.sec = function (part, c, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !c || !hass) return '';
    var h = states && states !== hass.states ? Object.assign({}, hass, { states: states }) : hass;
    var m = K.model(h, c.id, c.vars), S = h.states || {};
    // Head: the word („Heizt“, „Warmhalten“, „Heiß“); the frame swaps it for „Seit …“ where the S7 wheel says it.
    if (part === 'hero') return UI.line(K.word(m) || (m.t != null ? fmt(m.t) + ' ' + unitOf(m) : 'Bereit'), []);
    if (part === 'stage') {
      var hs = S[m.heater];
      // Moons: the water_heater's modes (with a start switch the head switches it off, so no „Aus“ moon).
      var moons = m.dead ? [] : m.modes.filter(function (x) { return !(m.sw && String(x).toLowerCase() === 'off'); }).map(function (x) {
        return { icon: MODE_ICON[String(x).toLowerCase()] || 'mdi:kettle-outline', text: K.modeLabel(h, hs, x), active: m.mode === x,
          svc: { domain: 'water_heater', service: 'set_operation_mode', data: { operation_mode: x }, target: { entity_id: m.heater } } };
      });
      if (m.goal) {
        var g = m.goal, step = g.step || 1;
        var lo = g.min != null ? g.min : (m.f ? 104 : 40), hi = g.max != null ? g.max : (m.f ? 212 : 100);
        var at = function (v) { var o = {}; o[g.spec.field] = v; return { domain: g.spec.domain, service: g.spec.service, data: o, target: g.spec.target }; };
        var side = function (dir) {
          var v = Math.round((g.value + dir * step) * 100) / 100;
          return { dis: m.dead || (dir < 0 ? g.value <= lo : g.value >= hi), step: step, min: lo, max: hi, svc: at(Math.max(lo, Math.min(hi, v))) };
        };
        // Dial (§4.8 ring a): the target on the ring in the device's steps (heat colours), the water now as the dot.
        return UI.stage('value', { caption: 'Ziel', label: 'Zieltemperatur', value: g.value, unit: unitOf(m), digits: step < 1 ? 1 : 0,
          step: step, min: lo, max: hi, heat: true, current: m.t, foot: m.t != null ? 'Jetzt ' + fmt(m.t) + '°' : null,
          minus: side(-1), plus: side(1), state: m.dead ? 'na' : null, moons: moons });
      }
      // No target (Xiaomi BLE: it only shows): the water's temperature as S6 with a range – the level ring 0–100 °C
      // (32–212 °F) in the heat colours of the target dial, not a traffic light (coordinator 04.11.2026); the word stays
      // in the head. Without any temperature the fallback rule S7 (§4.7).
      if (m.t != null) {
        return UI.stage('chart', { icon: 'mdi:kettle-outline', caption: 'Wasser', value: fmt(m.t), unit: unitOf(m),
          ring: { min: m.f ? 32 : 0, max: m.f ? 212 : 100, heat: true }, state: m.dead ? 'na' : null, moons: moons });
      }
      return UI.stage('status', { tone: 'off', icon: 'mdi:kettle-outline', text: K.word(m) || 'Bereit', state: m.dead ? 'na' : null, moons: moons });
    }
    if (part === 'rows') {
      // The rest in one plate: keep warm (switch row), whether it heats, the mode when there are too many for moons.
      var rows = [];
      if (m.warm && S[m.warm] && UI.row && UI.row.entity) rows.push(UI.row.entity(S[m.warm], { icon: 'mdi:thermometer', label: 'Warmhalten' }));
      if (m.power && S[m.power]) {
        var ps = S[m.power], pOn = ps.state === 'on';
        rows.push({ entity: m.power, icon: 'mdi:fire', iconTone: pOn ? 'accent' : null, label: 'Heizen',
          value: !usable(ps) ? 'Nicht erreichbar' : pOn ? 'Heizt' : 'Aus' });
      }
      if (m.modes.length > 4 && m.mode) rows.push({ entity: m.heater, icon: 'mdi:tune-variant', label: 'Modus', value: K.modeLabel(h, S[m.heater], m.mode) });
      rows = rows.filter(Boolean);
      return rows.length ? UI.group(rows, 'Wasserkocher') : '';
    }
    return '';
  };

  // The popup's cards: v3 (Casora look) draws its own – hero, the stage, the rows, the temperature as Verlauf; else
  // HA's rows for the kettle's entities (target and keep warm can be set there) and the temperature of the last 24 hours.
  K.popup = function (entity, hass, vars) {
    var id = entity && entity.entity_id;
    if (!id || !hass) return { type: 'vertical-stack', cards: [] };
    var m = K.model(hass, id, vars), S = hass.states || {};
    if (K.v3()) {
      var KIT = window._casoraSoftKit;
      var cj = JSON.stringify({ id: id, vars: { heater_entity: pickVar(vars, 'heater_entity'), power_entity: pickVar(vars, 'power_entity'),
        target_entity: pickVar(vars, 'target_entity'), keep_warm_entity: pickVar(vars, 'keep_warm_entity'), switch_entity: pickVar(vars, 'switch_entity'),
        room_name: String((vars && vars.room_name) || '') } });
      var call = function (p) { return 'return window._casoraKettle ? window._casoraKettle.sec(' + JSON.stringify(p) + ', ' + cj + ', states, hass) : "";'; };
      var f = { hero: { card: KIT.secCard(m.watch, call('hero'), S) }, stage: { card: KIT.secCard(m.watch, call('stage'), S) },
        rows: { card: KIT.secCard(m.watch, call('rows'), S) } };
      if (m.temp && S[m.temp]) {
        // The Verlauf under the dial (§7.1, 120; temperature orange, §7.3).
        f.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: '24h', source: 'history', title: 'Temperatur · 24 Std.',
          series: [{ entity: m.temp, name: 'Temperatur', unit: unitOf(m), color: 'var(--casora-color-orange, #FF9F0A)' }],
          height: 120, readout: 'own', plate: true } };
      }
      // One column (552) from the first opening: the plate holds at most three rows, so the right column of a two-column
      // build is always short beside dial and Verlauf – rule B (§2) would make it one column, but the column balance
      // only does that from the next opening, after measuring (casora-core balance(), r523). The kettle knows it in
      // advance: stage → Verlauf → plate in reading order, the same on desktop and phone.
      return KIT.layout({ fields: f, top: ['hero', 'stage', 'chart', 'rows'], left: [], right: [], entity: id });
    }
    var ents = [m.temp, m.power, m.heater, m.target, m.warm].filter(function (x, i, a) { return x && S[x] && a.indexOf(x) === i; });
    if (!ents.length) ents = [id];
    var cards = [{ type: 'entities', entities: ents }];
    if (m.temp && S[m.temp]) cards.push({ type: 'history-graph', hours_to_show: 24, entities: [m.temp] });
    return { type: 'vertical-stack', cards: cards };
  };
})();
