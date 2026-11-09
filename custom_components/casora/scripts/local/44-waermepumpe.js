// ── Heat pump (tile casora_heat_pump, issue 132) ────────────────────────────────────────────────────────────────────
// Tile and popup on a climate entity; everything else is optional (Studio fields, else casoraHeatPumpFind in
// 00-finder.js finds it on the climate's device). The tile says program · hot water · whether the compressor runs;
// a plain thermostat tile is untouched (template casora_heat_pump = casora_thermostat + casora_popup_heat_pump).
// Popup v3 „Bühne“ (popup-richtlinien-v3.md §4 S2, §4.8): the target on the dial, the presets as moons, right the hot
// water (now, target with − / +, one-time charge) and the values (outdoor, supply, return, COP, compressor), the supply
// temperature as the Verlauf under the dial.
// A climate without current_temperature (ViCare): the dial shows the target only, an optional sensor adds „Jetzt“.
//   window._casoraHeatPump.model(hass, id, vars)      → the pump's values
//   window._casoraHeatPump.tileText(st, hass, vars, narrow) → { full, short } for casoraStateFit
//   window._casoraHeatPump.tileOn(st, hass, vars)     → the circle: true = coloured
//   window._casoraHeatPump.active(st, hass, vars)     → highlighted tile (true/false; null = unknown, thermostat rule)
//   window._casoraHeatPump.popup(entity, hass, vars)  – the popup's cards
//   window._casoraHeatPump.sec(part, c, states, hass) – the v3 parts (hero, stage, water, values)
(function () {
  if (window._casoraHeatPump) return;
  var H = window._casoraHeatPump = {};
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var usable = function (st) { return !!st && st.state !== 'unavailable' && st.state !== 'unknown'; };
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var nf = function (n, d) { return window.casoraNum ? window.casoraNum(n, 0, d == null ? 1 : d) : String(Math.round(n * 10) / 10).replace('.', ','); };
  var nf1 = function (n) { return window.casoraNum ? window.casoraNum(n, 1, 1) : (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); };
  var esc = function (t) {
    return window.casoraEsc ? window.casoraEsc(t) : String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var varId = function (v, k) { var x = v && v[k]; return typeof x === 'string' && x && x !== 'None' ? x : null; };

  var PRESET = { comfort: 'Komfort', eco: 'Eco', home: 'Zuhause', sleep: 'Schlafen', away: 'Abwesend', boost: 'Boost', activity: 'Aktiv' };
  var PRESET_ICON = { comfort: 'mdi:sofa-outline', eco: 'mdi:leaf', home: 'mdi:home-outline', sleep: 'mdi:power-sleep', away: 'mdi:airplane',
    boost: 'mdi:rocket-launch-outline', activity: 'mdi:walk' };
  // Casora's word first (the same in every popup), HA's translation for anything else, the raw word last.
  H.presetWord = function (hass, st, p) {
    if (p == null || p === '' || p === 'none') return '';
    var w = PRESET[String(p).toLowerCase()];
    if (w) return T(w);
    var f = hass && st && hass.formatEntityAttributeValue ? hass.formatEntityAttributeValue(st, 'preset_mode', p) : null;
    return f && f !== p ? f : String(p).replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); });
  };
  var isTemp = function (s) {
    var a = (s && s.attributes) || {}, u = String(a.unit_of_measurement || '');
    return !!s && (a.device_class === 'temperature' || /°|^K$/.test(u));
  };

  H.model = function (hass, id, vars) {
    var S = (hass && hass.states) || {}, v = vars || {}, st = S[id], F = window.casoraHeatPumpFind, a = (st && st.attributes) || {};
    var f = F && hass ? F.find(hass, id) : {};
    var ent = function (varName, key) { var x = varId(v, varName); return x ? (S[x] ? x : null) : (f[key] || null); };
    var m = { id: id, st: st, dead: !usable(st), off: !!st && st.state === 'off', mode: st ? st.state : null, action: a.hvac_action || null };
    m.presets = (Array.isArray(a.preset_modes) ? a.preset_modes : []).filter(function (p) { return p !== 'none'; });
    m.preset = a.preset_mode != null && a.preset_mode !== 'none' ? a.preset_mode : null;
    m.target = num(a.temperature);
    m.min = num(a.min_temp); m.max = num(a.max_temp);
    m.step = num(a.target_temp_step) || 0.5;
    m.unit = String(a.temperature_unit || (hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature) || '°C');
    // „Jetzt“: the optional sensor, else the climate's own – ViCare's is null, then the dial shows the target only.
    m.sensor = varId(v, 'temp_sensor');
    var ss = m.sensor && S[m.sensor];
    m.current = usable(ss) && isTemp(ss) && num(ss.state) != null ? num(ss.state) : usable(st) ? num(a.current_temperature) : null;
    m.water = ent('water_heater_entity', 'water');
    var ws = m.water && S[m.water], wa = (ws && ws.attributes) || {};
    m.waterOk = usable(ws);
    m.waterNow = m.waterOk ? num(wa.current_temperature) : null;
    m.waterTarget = m.waterOk ? num(wa.temperature) : null;
    m.waterMin = num(wa.min_temp); m.waterMax = num(wa.max_temp);
    m.waterStep = num(wa.target_temp_step) || 1;
    m.waterUnit = String(wa.temperature_unit || m.unit);
    m.charge = ent('charge_button', 'charge');
    m.charging = f.charging && S[f.charging] && S[f.charging].state === 'on' ? f.charging : null;
    m.compressor = ent('compressor_entity', 'compressor');
    var cs = m.compressor && S[m.compressor];
    m.running = usable(cs) ? cs.state === 'on' : null;
    m.outdoor = ent('outdoor_entity', 'outdoor');
    m.supply = ent('supply_entity', 'supply');
    m.ret = ent('return_entity', 'return');
    m.cop = ent('cop_entity', 'cop');
    m.power = ent('power_entity', 'power');
    m.watchStage = [id, m.sensor].filter(Boolean);
    m.watchWater = [id, m.water, m.charge, f.charging, m.compressor].filter(Boolean);
    m.watchValues = [id, m.outdoor, m.supply, m.ret, m.cop, m.power, m.compressor].filter(Boolean);
    m.watch = m.watchStage.concat(m.watchWater, m.watchValues).filter(function (x, i, l) { return l.indexOf(x) === i; });
    return m;
  };

  H.word = function (m) {
    if (!m.st || m.st.state === 'unavailable') return T('Nicht verfügbar');
    if (m.st.state === 'unknown') return T('Unbekannt');
    if (m.off) return T('Aus');
    if (m.action === 'heating' || m.action === 'preheating') return T('Heizt');
    if (m.action === 'cooling') return T('Kühlt');
    if (m.action === 'defrosting') return T('Taut ab');
    if (m.action === 'idle' || m.action === 'off') return T('Bereit');
    return m.mode === 'heat' ? T('Heizen') : m.mode === 'cool' ? T('Kühlen') : T('Automatik');
  };
  var deg = function (n) { return n == null ? '–' : nf(n) + '°'; };

  // Tile: program · hot water · compressor; short for a narrow tile (the circle carries the compressor there).
  H.tileText = function (st, hass, vars, narrow) {
    if (!st) return { full: '', short: '' };
    var m = H.model(hass, st.entity_id, vars);
    if (m.dead) return { full: H.word(m), short: H.word(m) };
    var lead = m.off ? T('Aus') : H.presetWord(hass, m.st, m.preset) || H.word(m);
    var run = m.running == null || m.off ? '' : T(m.running ? 'Läuft' : 'Aus');
    if (m.waterNow == null && m.waterTarget == null) {
      var t = run ? lead + ' · ' + run : lead;
      return { full: t, short: t };
    }
    var w = deg(m.waterNow) + ' / ' + deg(m.waterTarget);
    // Short („Zuhause 43/50°“); a phone tile holds about ten characters (the program alone then: the circle carries the
    // compressor, the popup the temperatures).
    var rd = function (n) { return n == null ? '–' : nf(Math.round(n), 0); };
    var sh = lead + ' ' + rd(m.waterNow) + '/' + rd(m.waterTarget) + '°';
    return { full: [lead, T('Wasser') + ' ' + w, run].filter(Boolean).join(' · '), short: narrow && sh.length > 11 ? lead : sh };
  };
  // Coloured circle: the compressor runs; with no compressor known, every mode but off (the thermostat's rule).
  H.tileOn = function (st, hass, vars) {
    var m = H.model(hass, st.entity_id, vars);
    if (m.dead) return false;
    return m.running != null ? m.running && !m.off : !m.off;
  };
  H.tileCool = function (st) { return !!st && (st.state === 'cool' || (st.attributes || {}).hvac_action === 'cooling'); };
  H.active = function (st, hass, vars) {
    if (!st) return null;
    var m = H.model(hass, st.entity_id, vars);
    return m.dead || m.running == null ? null : m.running && !m.off;
  };

  // ── Popup ────────────────────────────────────────────────────────────────────────────────────────────────────
  H.v3 = function () {
    var UI = window._casoraUI;
    if (!(UI && UI.stage && UI.soft && UI.soft() && window._casoraSoftKit)) return false;
    try { var v = localStorage.getItem('casora_popup_variant'); return !v || v === 'v3'; } catch (e) { return true; }
  };
  // Popup accent: the compressor's state, as on the tile (DP-15).
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_heat_pump\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var on = ha && ha.hass ? H.tileOn(src._stateObj, ha.hass, src._config && src._config.variables) : false;
    return { hue: 'var(--casora-puck-heat-color, var(--casora-color-orange, #DE8A4E))', off: !on };
  });

  var stepBtnHtml = function (m, dir) {
    var t = m.waterTarget, lo = m.waterMin, hi = m.waterMax, step = m.waterStep;
    var at = t == null || (dir < 0 ? (lo != null && t <= lo) : (hi != null && t >= hi));
    var v = t == null ? null : Math.round((t + dir * step) * 100) / 100;
    if (v != null && lo != null) v = Math.max(lo, v);
    if (v != null && hi != null) v = Math.min(hi, v);
    var svc = at || !m.waterOk ? null : { domain: 'water_heater', service: 'set_temperature', data: { temperature: v }, target: { entity_id: m.water } };
    return '<div role="button" aria-label="' + esc(T(dir > 0 ? 'Mehr' : 'Weniger')) + '"' + (svc ? '' : ' aria-disabled="true"')
      + (svc ? ' data-casora-svc="' + esc(JSON.stringify(svc)) + '" data-casora-step="' + (dir * step) + '"'
        + (lo != null ? ' data-casora-min="' + esc(lo) + '"' : '') + (hi != null ? ' data-casora-max="' + esc(hi) + '"' : '') : '')
      + ' style="position:relative;width:40px;height:40px;border-radius:50%;flex:none;display:grid;place-items:center;cursor:pointer;'
      + 'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));' + (svc ? '' : 'opacity:.4;pointer-events:none;') + '">'
      + '<ha-icon icon="' + (dir > 0 ? 'mdi:plus' : 'mdi:minus') + '" style="--mdc-icon-size:20px;width:20px;height:20px;display:flex;pointer-events:none;"></ha-icon></div>';
  };
  var targetCtl = function (m) {
    // The class pair .hp-st-v .n is the number the shared − / + handler counts up while a tap is on its way (casora-core).
    return '<div style="display:flex;align-items:center;gap:8px;">' + stepBtnHtml(m, -1)
      + '<span class="hp-st-v" style="min-width:64px;text-align:center;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;">'
      + '<span class="n">' + esc(m.waterTarget == null ? '–' : nf1(m.waterTarget)) + '</span>'
      + (m.waterTarget == null ? '' : ' ' + esc(m.waterUnit)) + '</span>' + stepBtnHtml(m, 1) + '</div>';
  };
  var valueRow = function (hass, id, icon, label, digits) {
    var st = id && hass.states[id];
    if (!st) return null;
    var a = st.attributes || {}, n = num(st.state);
    var val = !usable(st) ? T('Nicht verfügbar') : n == null ? String(st.state)
      : nf(n, digits) + (a.unit_of_measurement ? ' ' + a.unit_of_measurement : '');
    return { entity: id, icon: icon, label: label, value: val, valueTone: usable(st) ? null : 'warn' };
  };

  // The v3 parts, drawn live (secCard): c = { id, vars }.
  H.sec = function (part, c, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !c || !hass) return '';
    var h = states && states !== hass.states ? Object.assign({}, hass, { states: states }) : hass;
    var m = H.model(h, c.id, c.vars), S = h.states || {};
    if (part === 'hero') {
      var rest = m.dead || m.running == null ? [] : [T(m.running ? 'Verdichter läuft' : 'Verdichter aus')];
      return UI.line(H.word(m), rest, { tone: m.dead ? 'bad' : null });
    }
    if (part === 'stage') {
      var moons = m.dead ? [] : m.presets.map(function (p) {
        return { icon: PRESET_ICON[String(p).toLowerCase()] || 'mdi:tune-variant', text: H.presetWord(h, m.st, p), active: m.preset === p,
          svc: { domain: 'climate', service: 'set_preset_mode', data: { preset_mode: p }, target: { entity_id: c.id } } };
      });
      var foot = m.current != null ? T('Jetzt') + ' ' + nf(m.current) + ' ' + m.unit : null;
      var base = { caption: 'Ziel', label: 'Zieltemperatur', unit: m.target != null ? m.unit : '', digits: m.step < 1 ? 1 : 0,
        step: m.step, min: m.min, max: m.max, heat: true, current: m.current, foot: foot,
        moons: moons.length >= 2 ? function () { return UI.quick(moons, 'Programm'); } : [] };
      if (m.dead || m.off || m.target == null) {
        return UI.stage('value', Object.assign(base, { value: m.target != null ? m.target : '–', state: m.dead ? 'na' : 'off' }));
      }
      var pm = function (dir) {
        var v = Math.round((m.target + dir * m.step) * 100) / 100;
        return { svc: { domain: 'climate', service: 'set_temperature', data: { temperature: v }, target: { entity_id: c.id } },
          step: m.step, min: m.min, max: m.max, dis: dir < 0 ? (m.min != null && m.target <= m.min) : (m.max != null && m.target >= m.max) };
      };
      return UI.stage('value', Object.assign(base, { value: m.target, minus: pm(-1), plus: pm(1) }));
    }
    if (part === 'water') {
      if (!m.water) return '';
      var ws = S[m.water], rows = [];
      if (!usable(ws)) rows.push({ entity: m.water, icon: 'mdi:water-thermometer-outline', label: 'Warmwasser', value: T('Nicht verfügbar'), valueTone: 'warn' });
      else {
        rows.push({ entity: m.water, icon: 'mdi:water-thermometer-outline', iconTone: m.running ? 'accent' : null, label: 'Jetzt',
          value: m.waterNow == null ? '–' : nf(m.waterNow) + ' ' + m.waterUnit });
        rows.push({ icon: 'mdi:thermostat', label: 'Ziel', endHtml: targetCtl(m), noChev: true });
      }
      if (m.charge && S[m.charge]) {
        var free = S[m.charge].state !== 'unavailable';
        rows.push({ icon: 'mdi:water-boiler', iconTone: m.charging ? 'accent' : null, label: 'Einmal aufheizen', sub: m.charging ? 'Läuft …' : null,
          action: m.charging ? null : 'Starten', svc: m.charging || !free ? null : { domain: 'button', service: 'press', target: { entity_id: m.charge }, done: 'Aufheizen gestartet' }, noChev: true });
      }
      return UI.group(rows, 'Warmwasser');
    }
    if (part === 'values') {
      var list = [valueRow(h, m.outdoor, 'mdi:home-thermometer-outline', 'Außen'), valueRow(h, m.supply, 'mdi:thermometer-chevron-up', 'Vorlauf'),
        valueRow(h, m.ret, 'mdi:thermometer-chevron-down', 'Rücklauf'), valueRow(h, m.cop, 'mdi:gauge', 'Leistungszahl', 1), valueRow(h, m.power, 'mdi:flash-outline', 'Verdichterleistung')].filter(Boolean);
      if (m.compressor && S[m.compressor]) {
        var on = m.running === true, cs = S[m.compressor];
        list.push({ entity: m.compressor, icon: 'mdi:heat-pump-outline', iconTone: on ? 'accent' : null, label: 'Verdichter',
          value: !usable(cs) ? T('Nicht verfügbar') : T(on ? 'Läuft' : 'Aus'), valueTone: usable(cs) ? null : 'warn' });
      }
      return list.length ? UI.group(list, 'Werte') : '';
    }
    return '';
  };

  // The popup's cards: v3 (Casora look) its own; other looks HA's rows.
  H.popup = function (entity, hass, vars) {
    var id = entity && entity.entity_id;
    if (!id || !hass) return { type: 'vertical-stack', cards: [] };
    var m = H.model(hass, id, vars), S = hass.states || {};
    if (H.v3()) {
      var KIT = window._casoraSoftKit;
      var keep = {};
      ['temp_sensor', 'water_heater_entity', 'charge_button', 'compressor_entity', 'outdoor_entity', 'supply_entity', 'return_entity', 'cop_entity', 'power_entity'].forEach(function (k) {
        var v = varId(vars, k); if (v) keep[k] = v;
      });
      var cj = JSON.stringify({ id: id, vars: keep });
      var call = function (p) { return 'return window._casoraHeatPump ? window._casoraHeatPump.sec(' + JSON.stringify(p) + ', ' + cj + ', states, hass) : "";'; };
      var f = { hero: { card: KIT.secCard(m.watch, call('hero'), S) }, stage: { card: KIT.secCard(m.watchStage, call('stage'), S) } };
      if (m.water) f.water = { card: KIT.secCard(m.watchWater, call('water'), S) };
      if (m.watchValues.length > 1) f.values = { card: KIT.secCard(m.watchValues, call('values'), S) };
      // The Verlauf under the dial (§7.1: 120 high, temperature orange): the supply, else the outdoor temperature.
      var hist = m.supply && S[m.supply] ? m.supply : m.outdoor && S[m.outdoor] ? m.outdoor : null;
      if (hist) f.chart = { card: { type: 'custom:casora-chart', kind: 'line', span: '24h', source: 'history', title: 'Temperatur · 24 Std.',
        series: [{ entity: hist, name: hist === m.supply ? 'Vorlauf' : 'Außen', unit: /F/.test(m.unit) ? '°F' : '°C', color: 'var(--casora-color-orange, #FF9F0A)' }],
        height: 120, readout: 'own', plate: true }, do_not_eval: true };
      return KIT.layout({ fields: f, top: ['hero'], stage: 'stage', left: [], right: ['water', 'values'], entity: id });
    }
    var ents = [id].concat(m.watch).filter(function (x, i, a) { return S[x] && a.indexOf(x) === i; });
    return { type: 'vertical-stack', cards: [{ type: 'entities', entities: ents }] };
  };
})();
