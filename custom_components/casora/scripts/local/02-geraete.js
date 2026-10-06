// ── Aquarium: Dosierpumpe und Lichtsteuerung aus den Kachelfeldern (1.0.3) ──────
// Neu: frei gewählte Entitäten – dosing_buttons (Dosier-Knopf je Kanal) mit den Zuordnungen
// dosing_volume / dosing_today / dosing_total / dosing_names (je Knopf), light_profile (select)
// und light_schedule_switch (switch: an = HA-Zeitplan). Ältere Kacheln mit den Präfixen
// dosing_prefix und helialux laufen unverändert weiter; ein gewähltes Feld geht vor.
(function () {
  if (window._casoraAqParts) return;
  window._casoraAqParts = function (variables, states) {
    const V = variables || {}, S = states || {};
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    const vol = obj(V.dosing_volume), today = obj(V.dosing_today), total = obj(V.dosing_total), names = obj(V.dosing_names);
    const labels = Array.isArray(V.dosing_labels) ? V.dosing_labels : [];
    const dp = V.dosing_prefix || null;
    let dose = [];
    const btns = (Array.isArray(V.dosing_buttons) ? V.dosing_buttons : []).filter((b) => typeof b === 'string' && b);
    if (btns.length) {
      dose = btns.map((btn, i) => {
        /* Ein Knopf im alten Muster (button.<präfix>_dose_pump_<n>) findet seine Werte wie früher. */
        const m = /^button\.(.+)_dose_pump_(\d+)$/.exec(btn);
        const old = m ? { today: 'sensor.' + m[1] + '_pump_' + m[2] + '_dosed_today',
          total: 'sensor.dosierpumpe_' + m[1] + '_pump_' + m[2] + '_total_ml', vol: 'number.' + m[1] + '_pump_' + m[2] + '_dose_volume' } : {};
        const has = (id) => (id && S[id] ? id : null);
        return { n: i + 1, btn: btn, today: today[btn] || has(old.today), total: total[btn] || has(old.total),
          vol: vol[btn] || has(old.vol), label: names[btn] || labels[i] || null };
      });
    } else if (dp) {
      dose = [1, 2, 3, 4].map((n) => ({
        n: n,
        today: 'sensor.' + dp + '_pump_' + n + '_dosed_today',
        total: 'sensor.dosierpumpe_' + dp + '_pump_' + n + '_total_ml',
        vol: 'number.' + dp + '_pump_' + n + '_dose_volume',
        btn: 'button.' + dp + '_dose_pump_' + n,
      })).filter((c) => S[c.btn]);
      /* Wie bisher: dosing_labels zählen über die vorhandenen Kanäle. */
      dose.forEach((c, i) => { c.label = labels[i] || null; });
    }
    const hx = V.helialux || null;
    const sw = V.light_schedule_switch || (hx ? 'switch.' + hx + '_manual_color_simulation' : null);
    const sel = V.light_profile || (hx ? 'select.' + hx + '_profil' : null);
    return { dose: dose, light: sw || sel ? { sw: sw, sel: sel, legacy: !!hx && !V.light_schedule_switch && !V.light_profile } : null };
  };
})();

// ── Aquarium-Kacheln (casora_aquarium_tank) ────────────────────────────────
// Logik für Kachelstatus und Popup liegt hier statt im Dashboard, damit sie
// Casora-Updates und Studio-Speichern übersteht. Die Templates rufen nur auf.
(function () {

  window._casoraAqWrap = function (html) {
    return '<style>.hui-row.hp-sel{background:var(--casora-popup-row-hover, rgba(255,255,255,0.08));}</style>'
      + '<div ontouchstart="window._hpPlantTap&&window._hpPlantTap(event,\'s\');window._casoraAqTap(event,\'s\')"'
      + ' ontouchend="window._hpPlantTap&&window._hpPlantTap(event,\'t\');window._casoraAqTap(event,\'t\')"'
      + ' onclick="window._hpPlantTap&&window._hpPlantTap(event,\'c\');window._casoraAqTap(event,\'c\')">'
      + html + '</div>';
  };
  /* Lichtzeile (data-aq-light) öffnet das Casora-Einzellampen-Popup über denselben Weg wie das Licht-Gruppen-Popup. */
  window._casoraAqTap = function (ev, kind) {
    if (kind === 's') { const t0 = ev.touches && ev.touches[0]; window._aqTy = t0 ? t0.clientY : 0; window._aqTx = t0 ? t0.clientX : 0; return; }
    if (kind === 't') {
      const t = ev.changedTouches && ev.changedTouches[0];
      if (t && (Math.abs(t.clientY - (window._aqTy || 0)) > 10 || Math.abs(t.clientX - (window._aqTx || 0)) > 10)) return;
      window._aqT = Date.now();
    } else if (Date.now() - (window._aqT || 0) < 700) return;
    const p = (ev.composedPath && ev.composedPath()) || [ev.target];
    let id = null, dose = null;
    for (let i = 0; i < p.length; i++) {
      const ds = p[i] && p[i].dataset;
      if (!ds) continue;
      if (ds.aqDose) { dose = ds.aqDose; break; }
      if (ds.aqLight) { id = ds.aqLight; break; }
    }
    if (!id && !dose) return;
    /* Der „Dosieren“-Knopf in der Zeile bleibt eigenständig (Bestätigung) */
    for (let i = 0; i < p.length; i++) { if (p[i] && p[i].dataset && (p[i].dataset.casoraArm !== undefined || (p[i].classList && p[i].classList.contains('hui-cf')))) return; }
    ev.stopPropagation(); if (ev.cancelable) ev.preventDefault();
    window._casoraSuppressDismiss = Date.now() + 600;
    if (dose) { try { window._casoraAqDoseOpen(JSON.parse(decodeURIComponent(dose))); } catch (e) { console.error('casora aquarium dose', e); } return; }
    window.dispatchEvent(new CustomEvent('ll-custom', { detail: { casora_light_more_info: id } }));
  };

  /* Eigenes Casora-Popup je Dünger-Kanal (Sheet-Stil, Bedienung). */
  window._casoraAqDoseOpen = function (d) {
    if (!window.casoraPopup || !d || !d.vol) return;
    const _d = JSON.stringify(d);
    const field = (name, code) => [name, code];
    const fields = {}, areas = [], fstyle = {};
    [
      field('hero', `[[[
        const d = ${_d};
        const v = parseFloat(states[d.vol]?.state);
        return window._casoraUI.hero({ value: isNaN(v) ? '—' : v.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
          unit: 'ml', sub: 'Dosiermenge je Stoß', center: true });
      ]]]`),
      field('adjust', `[[[
        const d = ${_d};
        const st = states[d.vol];
        const v = parseFloat(st?.state);
        const mn = Number(st?.attributes?.min ?? 0.2), mx = Number(st?.attributes?.max ?? 999);
        const set = (x) => ({ domain: 'number', service: 'set_value', data: { value: Math.round(Math.min(mx, Math.max(mn, x)) * 10) / 10 }, target: { entity_id: d.vol } });
        const f = (x) => x.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        if (isNaN(v)) return '';
        let out = window._casoraUI.segments([
          { label: '−0,5', svc: set(v - 0.5) }, { label: '−0,1', svc: set(v - 0.1) },
          { label: '+0,1', svc: set(v + 0.1) }, { label: '+0,5', svc: set(v + 0.5) },
        ], 'Anpassen');
        out += '<div style="height:16px"></div>' + window._casoraUI.segments([0.5, 1, 2, 3, 5].map((x) => ({
          label: f(x) + ' ml', active: Math.abs(v - x) < 0.01, svc: set(x) })), 'Schnellwahl');
        return out;
      ]]]`),
      field('rows', `[[[
        const d = ${_d};
        const num = (e) => { const n = parseFloat(states[e]?.state); return isNaN(n) ? null : n; };
        const f = (x) => x.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
        const v = num(d.vol), t = num(d.today), g = num(d.total);
        return window._casoraUI.group([
          d.today ? { icon: 'mdi:calendar-today', iconTone: 'rgba(255,255,255,0.18)', label: 'Heute dosiert', value: t == null ? '—' : f(t) + ' ml' } : null,
          d.total ? { icon: 'mdi:sigma', iconTone: 'rgba(255,255,255,0.18)', label: 'Gesamt', value: g == null ? '—' : f(g) + ' ml' } : null,
          { icon: 'mdi:beaker-outline', label: 'Jetzt dosieren', sub: v == null ? null : f(v) + ' ml',
            svc: { domain: 'button', service: 'press', target: { entity_id: d.btn } },
            confirm: (v == null ? '' : f(v) + ' ml ') + 'dosieren' },
        ].filter(Boolean), null);
      ]]]`),
      field('chart', { card: {
        type: 'custom:apexcharts-card', graph_span: '7d', header: { show: false },
        yaxis: [{ show: true, decimals: 1, apex_config: { tickAmount: 2, forceNiceScale: true, floating: true,
          labels: { offsetX: 4, offsetY: -8, align: 'left', style: { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px' } } } }],
        series: [{ entity: d.today, name: 'Dosiert', color: '#BF5AF2', type: 'column',
                   group_by: { func: 'max', duration: '1d', fill: 'zero', start_with_last: true } }],
        apex_config: {
          chart: { height: 130, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
          theme: { mode: 'dark' }, dataLabels: { enabled: false }, legend: { show: false },
          plotOptions: { bar: { borderRadius: 5, columnWidth: '55%' } },
          grid: { borderColor: 'var(--casora-chart-grid, rgba(255,255,255,0.10))', xaxis: { lines: { show: false } }, padding: { left: 0, right: 0, top: -6, bottom: -4 } },
          xaxis: { labels: { datetimeUTC: false, format: 'ddd', style: { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px' } }, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
          tooltip: { theme: 'dark', x: { format: 'dd.MM.' } },
        },
        card_mod: { style: 'ha-card { background: var(--casora-popup-row-fill, rgba(255,255,255,0.10)) !important; border-radius: var(--casora-popup-row-radius, 20px) !important;'
          + ' border: none !important; box-shadow: none !important; padding: 12px 8px 4px !important; }' },
      } }),
    ].filter((x) => x[0] !== 'chart' || d.today).forEach((x) => { areas.push('"' + x[0] + '"'); fields[x[0]] = x[1]; fstyle[x[0]] = [{ 'justify-self': 'stretch' }]; });
    window.casoraPopup.open({
      title: d.label || 'Dünger',
      dismissable: true,
      content: {
        type: 'custom:button-card',
        entity: d.vol,
        triggers_update: [d.vol, d.today, d.total, d.btn],
        tap_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: ':host { --ha-card-box-shadow: none !important; } ha-card { background: transparent !important; border: none !important; box-shadow: none !important; backdrop-filter: none !important; cursor: default !important; } ha-ripple { display: none !important; }' },
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: 'var(--casora-soft-card-top, 6px) 26px 22px 26px' }],
          grid: [{ 'grid-template-areas': areas.join(' ') }, { 'grid-template-columns': '1fr' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
          custom_fields: fstyle,
        },
        custom_fields: fields,
      },
    });
  };

  /* Farbfelder (Tag/Abend/Voll) als HTML-Block; wird in die Licht-Platte eingehängt. */
  window._casoraAqSwatches = function (presets, light, states) {
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const cur = JSON.stringify(states[light]?.attributes?.rgbw_color || null);
    const swatch = (rgbw) => {
      const w = (rgbw[3] || 0) / 255 * 0.6;
      const mix = [0, 1, 2].map((k) => (rgbw[k] || 0) * (1 - w) + 255 * w);
      const mx = Math.max.apply(null, mix) || 1;
      return 'rgb(' + mix.map((v) => Math.round(v * 255 / mx)).join(',') + ')';
    };
    const items = presets.map((pr) => {
      const on = JSON.stringify(pr.rgbw) === cur;
      const svc = { domain: 'light', service: 'turn_on', data: { rgbw_color: pr.rgbw }, target: { entity_id: light } };
      return '<div class="aq-sw" data-casora-svc="' + esc(JSON.stringify(svc)) + '">'
        + '<div class="aq-dot' + (on ? ' on' : '') + '" style="background:' + swatch(pr.rgbw) + ';">' + (on ? '<span>✓</span>' : '') + '</div>'
        + '<div class="aq-lbl">' + esc(pr.label) + '</div></div>';
    }).join('');
    /* Weich (01.10.2026): Segmente wie „Warm / Neutral / Kalt“ – Farbpunkt + Name, aktiv hell. */
    if (window._casoraSoft && window._casoraSoft()) {
      return '<style>'
        + '.aq-ssw{display:flex;gap:10px;font-family:var(--primary-font-family,system-ui);}'
        + '.aq-ssg{flex:1 1 0;min-width:0;height:46px;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:7px;'
        +   'cursor:pointer;font-size:13px;font-weight:600;white-space:nowrap;background:var(--casora-lps-seg, rgba(140,115,90,0.10));'
        +   'color:var(--casora-lps-seg-ink, var(--secondary-text-color));transition:background .2s ease;}'
        + '.aq-ssg.on{background:var(--casora-lps-seg-on, #FFFDF9);color:var(--casora-lps-seg-on-ink, #2E2721);box-shadow:var(--casora-lps-seg-on-shadow, none);}'
        + '.aq-ssg i{width:10px;height:10px;border-radius:50%;flex:none;pointer-events:none;box-shadow:inset 0 0 0 1px var(--casora-lps-dot-ring, transparent);}'
        + '.aq-ssg span{pointer-events:none;}'
        + '</style><div class="aq-ssw">'
        + presets.map((pr) => {
          const on = JSON.stringify(pr.rgbw) === cur;
          const svc = { domain: 'light', service: 'turn_on', data: { rgbw_color: pr.rgbw }, target: { entity_id: light } };
          return '<div class="aq-ssg' + (on ? ' on' : '') + '" data-casora-svc="' + esc(JSON.stringify(svc)) + '">'
            + '<i style="background:' + swatch(pr.rgbw) + ';"></i><span>' + esc(pr.label) + '</span></div>';
        }).join('') + '</div>';
    }
    return '<style>'
      + '.aq-sws{display:flex;justify-content:space-around;gap:8px;padding:14px 12px 14px;font-family:var(--primary-font-family,system-ui);}'
      + '.aq-sw{display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;min-width:64px;}'
      + '.aq-dot{width:46px;height:46px;border-radius:50%;display:grid;place-items:center;'
      +   'box-shadow:inset 0 0 0 1px rgba(0,0,0,0.25), 0 4px 14px -6px rgba(0,0,0,0.6);transition:transform .16s ease, box-shadow .16s ease;}'
      + '.aq-dot.on{box-shadow:0 0 0 2px rgba(0,0,0,0.35), 0 0 0 4px #fff, 0 4px 14px -6px rgba(0,0,0,0.6);}'
      + '.aq-dot span{color:rgba(0,0,0,0.72);font-size:20px;font-weight:700;line-height:1;}'
      + '.aq-sw:active .aq-dot{transform:scale(0.94);}'
      + '.aq-lbl{font-size:14px;font-weight:500;color:var(--casora-popup-tiles-text-primary,#fff);letter-spacing:-0.01em;}'
      + '</style>'
      /* Trennlinie wie zwischen Casora-Zeilen (T.div, eingerückt um das Zeilen-Padding) */
      + '<div style="height:1px;background:var(--casora-popup-ui-divider, rgba(255,255,255,0.08));'
      + 'margin:0 var(--casora-popup-row-pad-x, 16px);"></div>'
      + '<div class="aq-sws">' + items + '</div>';
  };

  /* Hängt die Farbfelder in die Licht-Platte ein (vor dem Schließen von Platte + Hülle, die UI.group liefert). */
  window._casoraAqMergeSwatches = function (groupHtml, c, states) {
    /* c.hx: {sw, sel} aus window._casoraAqParts (früher der Präfix als Text). */
    const sw = c.hx && (typeof c.hx === 'string' ? 'switch.' + c.hx + '_manual_color_simulation' : c.hx.sw);
    const on = sw && Array.isArray(c.presets) && c.presets.length && states[sw]?.state === 'on';
    const tail = '</div></div>';
    if (!on || groupHtml.slice(-tail.length) !== tail) return groupHtml;
    return groupHtml.slice(0, -tail.length) + window._casoraAqSwatches(c.presets, c.light, states) + tail;
  };
  window._casoraAqEval = function (entity, variables, states, hass) {
  /* Drei Zustände: Alles ok / Prüfen (orange) / Alarm (rot), dahinter der wichtigste Grund. */
  const num = (e) => { const n = parseFloat(states[e]?.state); return isNaN(n) ? null : n; };
  const dead = (e) => !!e && (!states[e] || ['unavailable', 'unknown'].includes(states[e].state));
  const reg = (hass && hass.entities) || {};
  const powerOf = (eid) => {
    const dev = reg[eid] && reg[eid].device_id;
    if (!dev) return null;
    let p = null;
    Object.values(reg).forEach((e) => {
      if (!p && e.device_id === dev && e.entity_id.startsWith('sensor.')
          && states[e.entity_id]?.attributes?.unit_of_measurement === 'W') p = e.entity_id;
    });
    return p;
  };
  const V = variables || {};
  const alarm = [], warn = [];
  if (V.leak_entity && states[V.leak_entity]?.state === 'on') alarm.push('Wasser erkannt');
  (V.devices || []).forEach((d) => {
    if (!d || !states[d.entity]) return;
    const s = states[d.entity].state;
    if (s === 'unavailable') { warn.push(d.label + ' offline'); return; }
    if (!d.alarm) return;
    if (s === 'off') { alarm.push(d.label + ' aus'); return; }
    const pw = num(powerOf(d.entity));
    // Unter 2 W gilt ein eingeschaltetes Gerät als stromlos (kleine Pumpen ziehen 2–3 W).
    if (s === 'on' && pw != null && pw < 2) alarm.push(d.label + ' ohne Strom');
  });
  const st = String(states[V.status_entity]?.state || '').toLowerCase();
  if (st.includes('kritisch')) alarm.push('Temperatur kritisch');
  else if (st.includes('warnung')) warn.push('Temperaturwarnung');
  if (dead(entity?.entity_id)) warn.push('Temperaturfühler offline');
  if (dead(V.leak_entity)) warn.push('Lecksensor offline');
  [[V.leak_battery, 'Akku Lecksensor'], [V.temp_battery, 'Akku Temperaturfühler']].forEach((b) => {
    const n = num(b[0]);
    // Akku-Stufen (casoraBattery): Schwach und Fast leer sind ein Hinweis, kein Aquarium-Alarm.
    const lv = n == null ? 'ok' : (window.casoraBattery ? window.casoraBattery.level(n) : (n) <= 10 ? 'crit' : (n) <= 20 ? 'low' : 'ok');
    if (lv === 'low' || lv === 'crit') warn.push(b[1] + ' ' + Math.round(n) + ' %');
  });
  /* Bluetooth-Lampen fallen ständig kurz aus (Fluval: ~20×/Tag, meist < 5 min, max. ~19 min).
     Erst nach 7 min am Stück zählt es als Problem (23.09., vorher 5 min); gleiche Schwelle im Helfer *_prufen. */
  const BT_TOL_MS = 30 * 60 * 1000;
  const rs = V.light_reachable && states[V.light_reachable];
  if (rs && rs.state === 'off' && Date.now() - new Date(rs.last_changed).getTime() > BT_TOL_MS) warn.push('Licht nicht erreichbar');
  else if (dead(V.light_entity)) warn.push('Licht offline');
  const all = alarm.concat(warn);
  if (!all.length) return { level: 0, text: 'Alles ok', reasons: [] };
  const level = alarm.length ? 2 : 1;
  return { level: level, reasons: all,
    text: (level === 2 ? 'Alarm · ' : 'Prüfen · ') + all[0] + (all.length > 1 ? ' +' + (all.length - 1) : '') };
  };
  /* Aquarium-Doktor (Casora-KI, ki.py): Ergebnis in sensor.casora_aquarium_ki (Attribut becken, je
     Temperaturfühler). Ältere eigene Pakete schrieben nach sensor.hemma_aquarium_ki – das gilt als Rückfall. */
  const AQ_KI = ['sensor.casora_aquarium_ki', 'sensor.hemma_aquarium_ki'];
  window._casoraAqAiItem = function (temp, states) {
    for (let i = 0; i < AQ_KI.length; i++) {
      const raw = states[AQ_KI[i]] && states[AQ_KI[i]].attributes.becken;
      const hit = (Array.isArray(raw) ? raw : []).filter((x) => x && x.id === temp)[0];
      if (hit) return hit;
    }
    return null;
  };
  /* Knopf nur, wenn eine KI-Aufgabe eingerichtet ist (Einstellungen → KI-Aufgaben). */
  window._casoraAiReady = function (states) {
    return Object.keys(states || {}).some((k) => k.indexOf('ai_task.') === 0);
  };
  window._casoraAqAi = function (a, states) {
    const UI = window._casoraUI; if (!UI) return '';
    const T = UI.tokens;
    const it = window._casoraAqAiItem(a.temp, states);
    const ready = window._casoraAiReady(states);
    if (!ready && !it) return '';
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const ago = (ts) => { const t = Date.parse(ts); if (isNaN(t)) return ''; const m = Math.max(0, Math.round((Date.now() - t) / 60000));
      return m < 1 ? 'gerade eben' : m < 60 ? 'vor ' + m + ' Min.' : m < 1440 ? 'vor ' + Math.round(m / 60) + ' Std.' : 'vor ' + Math.round(m / 1440) + ' T.'; };
    const Z = { gut: ['Alles im grünen Bereich', 'var(--casora-popup-ui-good, #30D158)', 'mdi:check-circle'],
                beobachten: ['Beobachten', 'var(--casora-popup-ui-warn, #FF9F0A)', 'mdi:eye-outline'],
                handeln: ['Handeln', 'var(--casora-popup-ui-bad, #FF453A)', 'mdi:alert'] };
    const running = it && it.status === 'running';
    const z = it && Z[it.zustand];
    const svc = ' data-casora-svc="' + esc(JSON.stringify(window.casoraSvc('casora_aquarium_doktor', a))) + '"';
    let body = '';
    if (running) body = '<div style="font-size:15px;color:' + T.ink + ';">Claude wertet die letzten 7 Tage aus …</div>';
    else if (it && it.status === 'error') body = '<div style="font-size:15px;color:' + T.ink + ';">Auswertung fehlgeschlagen.</div>';
    else if (it && z) {
      body = '<div style="display:flex;align-items:center;justify-content:flex-start;gap:8px;text-align:left;">'
        + '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 20px;width:20px;height:20px;"><ha-icon icon="' + z[2] + '" style="--mdc-icon-size:20px;width:20px;height:20px;display:flex;align-items:center;justify-content:center;line-height:0;color:' + z[1] + ';"></ha-icon></span>'
        + '<span style="flex:1 1 auto;min-width:0;text-align:left;font-size:var(--casora-fs16,16px);font-weight:600;color:' + z[1] + ';">' + z[0] + '</span></div>'
        + '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink + ';margin-top:8px;white-space:normal;">' + esc(it.fazit) + '</div>'
        + (it.punkte && it.punkte.length ? '<ul style="margin:10px 0 0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink2 + ';white-space:normal;">' + it.punkte.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '')
        + (it.tipps && it.tipps.length ? '<div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:' + T.ink3 + ';margin:12px 0 3px;">Tipps</div>'
          + '<ul style="margin:0;padding-left:18px;font-size:13.5px;line-height:1.5;color:' + T.ink + ';white-space:normal;">' + it.tipps.map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>' : '');
    } else body = '<div style="font-size:14.5px;line-height:1.45;color:' + T.ink2 + ';white-space:normal;">Claude prüft Temperaturverlauf, Technik und Lecksensor der letzten 7 Tage und sagt, ob alles passt.</div>';
    const btn = running || !ready ? '' : '<span' + svc + ' style="display:inline-flex;cursor:pointer;font-size:14px;font-weight:600;padding:9px 14px;border-radius:999px;margin-top:14px;'
      + (it ? 'color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));background:var(--casora-popup-ui-action-tint, rgba(0,195,208,0.14));' : 'color:#000;background:var(--casora-color-teal, #00C3D0);') + '">'
      + (it ? 'Neu prüfen' : 'Jetzt prüfen') + '</span>';
    /* Weich (01.10.2026): KI-Karte mit Etikett und rundem Knopf aus den Bausteinen. */
    const kc = UI.kiCard && UI.kiCard({ title: 'Aquarium-Doktor', body: body,
      foot: it && !running && it.at ? 'KI-Einschätzung · ' + ago(it.at) : '',
      btnSvc: svc, btnText: running || !ready ? '' : (it ? 'Neu prüfen' : 'Jetzt prüfen'), primary: !it });
    if (kc) return kc;
    return '<div style="font-family:' + T.font + ';text-align:left;">'
      + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 4px 8px;display:flex;align-items:center;justify-content:flex-start;gap:6px;text-align:left;">'
      + '<span style="display:inline-flex;align-items:center;justify-content:center;line-height:0;flex:0 0 16px;width:16px;height:16px;"><ha-icon icon="mdi:creation" style="--mdc-icon-size:16px;width:16px;height:16px;display:flex;align-items:center;justify-content:center;line-height:0;color:var(--casora-color-teal, #00C3D0);"></ha-icon></span>'
      + '<span style="flex:1 1 auto;text-align:left;">Aquarium-Doktor</span></div>'
      + '<div style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);padding:16px 18px;'
      + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);">'
      + body + (it && !running && it.at ? '<div style="font-size:12px;color:' + T.ink3 + ';margin-top:10px;">KI-Einschätzung · ' + ago(it.at) + '</div>' : '')
      + btn + '</div></div>';
  };

  window._casoraAqPopup = function (entity, variables, states, hass) {

  const UI = window._casoraUI;
  if (!UI || !entity) return { type: 'vertical-stack', cards: [] };
  const reg = (hass && hass.entities) || {};
  const powerOf = (eid) => {
    const dev = reg[eid] && reg[eid].device_id;
    if (!dev) return null;
    let p = null;
    Object.values(reg).forEach((e) => {
      if (!p && e.device_id === dev && e.entity_id.startsWith('sensor.')
          && states[e.entity_id]?.attributes?.unit_of_measurement === 'W') p = e.entity_id;
    });
    return p;
  };
  const meterOf = (eid, re) => {
    const dev = reg[eid] && reg[eid].device_id;
    if (!dev) return null;
    let m = null;
    Object.values(reg).forEach((e) => {
      if (!m && e.device_id === dev && e.entity_id.startsWith('sensor.') && re.test(e.entity_id)) m = e.entity_id;
    });
    return m;
  };
  const devs = (variables.devices || []).filter((d) => d && d.entity && states[d.entity])
    .map((d) => Object.assign({}, d, { power: powerOf(d.entity),
      today: meterOf(d.entity, /_energy_today$/), month: meterOf(d.entity, /_energy_month$/) }));
  /* Dosierpumpe und Lichtsteuerung: gewählte Entitäten, sonst die alten Präfixe (window._casoraAqParts). */
  const parts = window._casoraAqParts(variables, states);
  const dose = parts.dose.filter((c) => states[c.btn]);
  const cfg = {
    temp: entity.entity_id, status: variables.status_entity || null,
    light: variables.light_entity || null, reach: variables.light_reachable || null,
    leak: variables.leak_entity || null, leakBat: variables.leak_battery || null,
    tempBat: variables.temp_battery || null, devs: devs, dose: dose,
    lightOn: variables.light_on_data || null,
    hx: parts.light, presets: variables.light_presets || null,
    /* Für die Status-Zeile unter der Temperatur (gleiche Bewertung wie die Kachel) */
    V: { status_entity: variables.status_entity || null, leak_entity: variables.leak_entity || null,
         leak_battery: variables.leak_battery || null, temp_battery: variables.temp_battery || null,
         light_entity: variables.light_entity || null, light_reachable: variables.light_reachable || null,
         devices: (variables.devices || []).map((d) => ({ entity: d.entity, label: d.label, alarm: !!d.alarm })) },
    labels: dose.map((d) => d.label),
  };
  const _c = JSON.stringify(cfg);
  const watch = [cfg.temp, cfg.status, cfg.light, cfg.reach, cfg.leak, cfg.leakBat, cfg.tempBat]
    .concat(devs.map((d) => d.entity), devs.map((d) => d.power), devs.map((d) => d.today), devs.map((d) => d.month),
            dose.map((d) => d.today), dose.map((d) => d.total), dose.map((d) => d.vol))
    .concat(cfg.hx ? [cfg.hx.sw, cfg.hx.sel] : [])
    .filter(Boolean);

  const areas = [], fields = {}, fstyle = {};
  const add = (name, v) => { areas.push('"' + name + '"'); fields[name] = v; fstyle[name] = [{ 'justify-self': 'stretch' }]; };

  add('hero', `[[[
    const c = ${_c};
    const n = parseFloat(states[c.temp]?.state);
    /* Unter der Temperatur steht, was los ist (alle Gründe, Schwerstes zuerst), sonst der Temperaturstatus. */
    const ev = window._casoraAqEval ? window._casoraAqEval(states[c.temp], c.V, states, hass) : { level: 0, reasons: [] };
    const okText = 'Temperatur im Normalbereich';
    return window._casoraUI.hero({
      value: isNaN(n) ? '—' : n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      unit: (states[c.temp]?.attributes?.unit_of_measurement) || '°C', /* Einheit des Fühlers (°C/°F) */
      sub: ev.level ? ev.reasons.join(' · ') : okText,
      subTone: ev.level === 2 ? 'bad' : ev.level === 1 ? 'warn' : 'good',
      center: true,
    });
  ]]]`);

  /* Weich (04.10.2026): ruhiges Türkis statt des grellen Cyan (#00C3D0), wie die Weich-Kacheln. */
  /* Weich: die grellen iOS-Farben (auch aus Hemma übernommene) in ruhige Weich-Töne übersetzen. */
  const _aqCalm = { '#00c3d0': '#5E9E96', '#57fffc': '#5E9E96', '#64d2ff': '#5E9E96', '#30d158': '#6FA77A',
    '#ff9230': '#DE8A4E', '#ff9f0a': '#DE8A4E', '#0a84ff': '#5B8FC9', '#bf5af2': '#9B7BB8' };
  const _aqRaw = String(variables.chart_color || '#30D158');
  const chartColor = (window._casoraSoft && window._casoraSoft())
    ? (_aqCalm[_aqRaw.toLowerCase()] || _aqRaw) : _aqRaw;
  /* Verlauf im 2.1-Muster: Zeilen mit data-hp-metric schalten dieses Diagramm um (statt HA-More-Info). */
  const hpOk = typeof window._hpChartCfg === 'function';
  const reg1 = (eid, label, span, color) => {
    if (!hpOk || !eid || !states[eid]) return;
    window._hpChartCfg(eid, label, span, color, 150);
    if (window._hpSmooth) window._hpSmooth(eid);
  };
  reg1(cfg.temp, 'Wassertemperatur', '24h', chartColor);
  reg1(cfg.leakBat, 'Akku Lecksensor', '30d', '#30D158');
  reg1(cfg.tempBat, 'Akku Temperaturfühler', '30d', '#30D158');
  const plate = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
    + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
    + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);padding:14px 10px 6px;';
  /* Weich (01.10.2026): Diagrammtitel als Etikett (Großbuchstaben, Laufweite) wie bei Klima. */
  const _aqSoft = !!(window._casoraSoft && window._casoraSoft());
  if (hpOk) {
    add('chart', '<div style="' + plate + (_aqSoft ? 'padding:16px 10px 6px;' : '') + '">'
      + '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);'
      + (_aqSoft ? 'font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--casora-soft-label, var(--casora-popup-tiles-text-secondary));padding:0 8px;'
                 : 'font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary,#fff));padding:0 6px;')
      + 'text-align:left;">'
      + window._hpChartTitle(cfg.temp) + '</div>'
      + '<div class="hp-chart-slot" style="min-height:150px;margin:6px 0 0;"></div></div>');
    if (typeof window._hpChartInit === 'function') window._hpChartInit(cfg.temp);
  }

  if (cfg.light && states[cfg.light]) add('glight', `[[[
    const c = ${_c};
    const s = states[c.light];
    const dead = !s || s.state === 'unavailable';
    const on = s && s.state === 'on';
    const pct = on && s.attributes.brightness != null ? Math.round(s.attributes.brightness / 2.55) : null;
    const rsx = c.reach && states[c.reach];
    const offMs = rsx && rsx.state === 'off' ? Date.now() - new Date(rsx.last_changed).getTime() : 0;
    const far = offMs > 30 * 60 * 1000;        // erst nach 30 min als Problem (wie Kachel/Helfer)
    const blip = offMs > 0 && !far;            // kurzer BT-Aussetzer, nur neutraler Hinweis
    return window._casoraAqWrap(window._casoraAqMergeSwatches(window._casoraUI.group([
      { icon: 'mdi:lightbulb', iconTone: on ? null : 'rgba(255,255,255,0.18)', label: 'Beckenlicht',
        sub: far ? 'Per Bluetooth nicht erreichbar' : blip ? 'Bluetooth-Verbindung kurz unterbrochen' : (dead ? 'Nicht verfügbar' : null),
        value: dead ? '—' : on ? (pct != null ? pct + ' %' : 'An') : 'Aus',
        valueTone: far ? 'warn' : null,
        /* Einschalten mit Farbwerten (light_on_data): ein nacktes turn_on ließ die Juwel-Lampe dunkel. */
        svc: dead ? null : (on ? { domain: 'light', service: 'turn_off', target: { entity_id: c.light } }
                               : { domain: 'light', service: 'turn_on', data: c.lightOn || {}, target: { entity_id: c.light } }),
        /* Ausschalten nur nach Bestätigung, wie bei Pumpe/Abschäumer. */
        confirm: on ? 'Ausschalten' : null },
    ].concat(c.hx ? [] : [{ icon: 'mdi:tune-variant', iconTone: 'rgba(255,255,255,0.18)', label: 'Lichtsteuerung', entity: c.light }]), 'Licht')
      .replace('data-casora-mi="' + c.light + '"', 'data-aq-light="' + c.light + '"'), c, states));
  ]]]`);

  /* Lichtsteuerung (z. B. Juwel HeliaLux): Schalter HA-Zeitplan vs. Geräteprofil (light_schedule_switch)
     und Profilwahl (light_profile); ältere Kacheln über den Präfix helialux. */
  if (cfg.hx && ((cfg.hx.sw && states[cfg.hx.sw]) || (cfg.hx.sel && states[cfg.hx.sel]))) add('glightx', `[[[
    const c = ${_c};
    const UI = window._casoraUI;
    const sw = c.hx.sw && states[c.hx.sw] ? c.hx.sw : null;
    const sel = c.hx.sel;
    const manual = !!sw && states[sw]?.state === 'on';
    const esc = (t) => String(t == null ? '' : t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    const svcAttr = (o) => ' data-casora-svc="' + esc(JSON.stringify(o)) + '"';
    /* Steuerung: Auswahlliste, aktive Zeile hinterlegt (window._casoraSelRows) statt Haken. */
    const steer = !sw ? '' : window._casoraSelRows(UI.group([
      { icon: 'mdi:calendar-clock', iconTone: manual ? 'accent' : 'rgba(255,255,255,0.18)', label: 'HA-Zeitplan',
        sub: 'Farben nach deiner Automation',
        svc: manual ? null : { domain: 'switch', service: 'turn_on', target: { entity_id: sw } } },
      { icon: 'mdi:tune-vertical', iconTone: !manual ? 'accent' : 'rgba(255,255,255,0.18)', label: 'Geräteprofil',
        sub: 'Eigenes Tagesprofil der Lampe',
        svc: !manual ? null : { domain: 'switch', service: 'turn_off', target: { entity_id: sw } } },
    ], 'Steuerung'), manual ? 'HA-Zeitplan' : 'Geräteprofil');
    /* Reihenfolge: Farbe bzw. Profil direkt unter „Licht“, danach die Steuerung. */
    let out = '';
    if (!manual && sel && states[sel]) {
      const opts = Array.from(new Set(states[sel].attributes?.options || []));
      out += window._casoraSelRows(UI.group(opts.map((o) => ({
        icon: 'mdi:palette-outline', iconTone: states[sel].state === o ? 'accent' : 'rgba(255,255,255,0.18)', label: o,
        svc: states[sel].state === o ? null : { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: sel } },
      })), 'Profil'), states[sel].state);
      /* Nur ältere Kacheln (helialux): dort setzt die eigene Automation morgens zurück. */
      if (c.hx.legacy && sw) out += '<div style="height:6px"></div>' + UI.note('Gilt bis morgen 9:00, dann übernimmt wieder der HA-Zeitplan.');
    }
    return out + (out && steer ? '<div style="height:18px"></div>' : '') + steer;
  ]]]`);

  if (devs.length) add('gtech', `[[[
    const c = ${_c};
    const f = (n) => n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { maximumFractionDigits: n < 10 ? 1 : 0 });
    const rows = c.devs.map((d) => {
      const s = states[d.entity]?.state;
      const on = s === 'on';
      const dead = s === 'unavailable' || s == null;
      const p = d.power ? parseFloat(states[d.power]?.state) : NaN;
      const nopow = d.alarm && on && !isNaN(p) && p < 2;
      return {
        icon: d.icon || 'mdi:power-plug',
        iconTone: on ? (nopow ? 'bad' : 'good') : (d.alarm ? 'bad' : 'rgba(255,255,255,0.18)'),
        label: d.label,
        sub: !isNaN(p) ? f(p) + ' W' + (nopow ? ' · keine Leistung' : '') : null,
        value: dead ? 'Nicht verfügbar' : on ? 'An' : 'Aus',
        valueTone: (!on && d.alarm) || nopow ? 'bad' : null,
        svc: dead ? null : { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: d.entity } },
        confirm: on && d.confirm ? 'Ausschalten' : null,
      };
    });
    return window._casoraUI.group(rows, 'Technik');
  ]]]`);

  /* Energie: Summe über alle Steckdosen des Beckens (Leistung jetzt, heute, Monat). */
  if (devs.some((d) => d.power || d.today || d.month)) add('genergy', `[[[
    const c = ${_c};
    const num = (e) => { if (!e || !states[e]) return null; const n = parseFloat(states[e].state); return isNaN(n) ? null : n; };
    const sum = (key) => {
      let t = 0, n = 0; const miss = [];
      /* Geräte hinter einer gemessenen Steckdose (sub: true) sind dort schon enthalten. */
      c.devs.forEach((d) => { if (d.sub) return; const v = num(d[key]); if (v == null) miss.push(d.label); else { t += v; n++; } });
      return { t: t, n: n, miss: miss };
    };
    const fW = (n) => n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { maximumFractionDigits: n < 10 ? 1 : 0 }) + ' W';
    const fK = (n, d) => n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: d, maximumFractionDigits: d }) + ' kWh';
    const p = sum('power'), t = sum('today'), m = sum('month');
    const without = (s) => s.miss.length && s.n ? 'ohne ' + s.miss.join(', ') : null;
    const rows = [];
    if (p.n) rows.push({ icon: 'mdi:flash', iconTone: 'good', label: 'Leistung jetzt', sub: without(p), value: fW(p.t) });
    if (t.n) rows.push({ icon: 'mdi:lightning-bolt-outline', iconTone: 'good', label: 'Heute', sub: without(t), value: fK(t.t, 2) });
    if (m.n) rows.push({ icon: 'mdi:calendar-month-outline', iconTone: 'good', label: 'Dieser Monat', sub: without(m), value: fK(m.t, 1) });
    return rows.length ? window._casoraUI.group(rows, 'Energie') : '';
  ]]]`);

  add('gsafe', `[[[
    const c = ${_c};
    const rows = [];
    const tn = parseFloat(states[c.temp]?.state);
    rows.push({ icon: 'mdi:thermometer-water', iconTone: 'accent', label: 'Wassertemperatur',
      value: isNaN(tn) ? '—' : tn.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' ' + ((states[c.temp]?.attributes?.unit_of_measurement) || '°C'), entity: c.temp });
    if (c.leak && states[c.leak]) {
      const ls = states[c.leak].state;
      const wet = ls === 'on';
      const b = c.leakBat ? parseFloat(states[c.leakBat]?.state) : NaN;
      rows.push({ icon: 'mdi:water-alert', iconTone: wet ? 'bad' : 'good', label: 'Lecksensor',
        sub: !isNaN(b) ? 'Akku ' + Math.round(b) + ' %' : null,
        value: ls === 'unavailable' ? 'Offline' : wet ? 'Wasser erkannt!' : 'Trocken',
        valueTone: wet ? 'bad' : (!isNaN(b) ? (window.casoraBattery ? window.casoraBattery.tone((window.casoraBattery ? window.casoraBattery.level(b) : (b) <= 10 ? 'crit' : (b) <= 20 ? 'low' : 'ok')) : null) : null), entity: c.leakBat || c.leak });
    }
    if (c.tempBat && states[c.tempBat]) {
      const b = parseFloat(states[c.tempBat].state);
      rows.push({ icon: 'mdi:thermometer', iconTone: 'accent', label: 'Temperaturfühler',
        value: isNaN(b) ? '—' : 'Akku ' + Math.round(b) + ' %', valueTone: !isNaN(b) ? (window.casoraBattery ? window.casoraBattery.tone((window.casoraBattery ? window.casoraBattery.level(b) : (b) <= 10 ? 'crit' : (b) <= 20 ? 'low' : 'ok')) : null) : null, entity: c.tempBat });
    }
    return rows.length ? window._casoraAqWrap(window._casoraUI.group(rows, 'Sensoren').replace(/data-casora-mi="/g, 'data-hp-metric="')) : '';
  ]]]`);

  if (dose.length) add('gdose', `[[[
    const c = ${_c};
    const num = (e) => { const n = parseFloat(states[e]?.state); return isNaN(n) ? null : n; };
    const f = (n) => n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const rows = c.dose.map((d, i) => {
      const t = num(d.today), g = num(d.total), v = num(d.vol);
      /* Ohne gewählte Zähler (dosing_today/dosing_total) fällt der Teil weg. */
      const sub = [d.today ? 'Heute ' + (t == null ? '—' : f(t)) + ' ml' : null, d.total ? 'gesamt ' + (g == null ? '—' : f(g)) + ' ml' : null]
        .filter(Boolean).join(' · ');
      return { icon: 'mdi:beaker-outline', label: c.labels[i] || ('Kanal ' + d.n),
        sub: sub || null,
        value: v == null ? null : f(v) + ' ml', action: 'Dosieren', entity: d.today || d.btn,
        svc: { domain: 'button', service: 'press', target: { entity_id: d.btn } },
        confirm: (v == null ? '' : f(v) + ' ml ') + 'dosieren' };
    });
    /* Kanal antippen -> eigenes Dosier-Popup (Menge, Dosieren, Verlauf) */
    let out = window._casoraAqWrap(window._casoraUI.group(rows, 'Düngeanlage'));
    c.dose.forEach((d, i) => {
      const payload = encodeURIComponent(JSON.stringify({ vol: d.vol, today: d.today, total: d.total, btn: d.btn,
        label: c.labels[i] || ('Kanal ' + d.n) }));
      if (d.vol) out = out.replace('data-casora-mi="' + (d.today || d.btn) + '"', 'data-aq-dose="' + payload + '"');
    });
    return out;
  ]]]`);

  const wrapperStyle = [
    ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
    'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
    'ha-card:hover { box-shadow: none !important; }',
    'ha-ripple { display: none !important; }',
    '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
    ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
    'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
    'ha-card { will-change: auto !important; }',
    '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
  ].join('\n');

  /* Festes Raster: oben Temperatur + Verlauf über volle Breite, darunter links Bedienen
     (Licht, Steuerung, Technik), rechts Ablesen (Energie, Sensoren, Düngeanlage). Jede Spalte
     ist ein eigener Stapel, damit unterschiedlich hohe Platten keine Lücken reißen. */
  const colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
    + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
    + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
    + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
    + ' #container { background: transparent !important; }';
  const makeCol = (keys) => {
    const cf = {}, cs = {};
    keys.forEach((k) => { cf[k] = fields[k]; cs[k] = fstyle[k]; });
    return {
      type: 'custom:button-card',
      entity: cfg.temp,
      triggers_update: watch,
      tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      card_mod: { style: colStyle },
      extra_styles: window._casoraColGap(keys),
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
        grid: [{ 'grid-template-areas': keys.map((k) => '"' + k + '"').join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'row-gap': '0' }, { 'align-content': 'start' }],
        custom_fields: cs,
      },
      custom_fields: cf,
    };
  };
  /* Aquarium-Doktor (Dienst casora.aquarium_doktor): bekommt die Entitäten dieses Beckens mit.
     Bereich nur mit eingerichteter KI-Aufgabe oder vorhandener Einschätzung. */
  const _ai = JSON.stringify({ temp: cfg.temp, name: variables.tank_name || entity.attributes.friendly_name || 'Aquarium',
    devices: devs.map((d) => ({ label: d.label || d.entity, entity: d.entity, power: d.power || null })),
    light: cfg.light, leak: cfg.leak, status: cfg.status, leak_battery: cfg.leakBat, temp_battery: cfg.tempBat });
  if (window._casoraAiReady(states) || window._casoraAqAiItem(cfg.temp, states)) {
    AQ_KI.forEach((k) => { if (states[k]) watch.push(k); });
    add('gai', '[[[ return window._casoraAqAi ? window._casoraAqAi(' + _ai + ', states) : ""; ]]]');
  }
  /* Weich (Entschlacken 01.10.2026): Kopf mit Temperatur, Verlauf, links Licht und Technik, rechts
     Aquarium-Doktor und Lecksensor; Profil/Steuerung (HeliaLux), Düngeanlage, Energie und die
     Akkus der Fühler unter „Mehr“. Die Zeile „Wassertemperatur“ fällt weg (steht im Kopf). */
  const HH = window._casoraHH;
  if (HH && HH.on() && HH.layout) {
    const f2 = { hero: fields.hero, chart: fields.chart, glight: fields.glight, gtech: fields.gtech, gai: fields.gai };
    if (cfg.leak && states[cfg.leak]) f2.gleak = `[[[
      const c = ${_c};
      const ls = states[c.leak] && states[c.leak].state, wet = ls === 'on';
      return window._casoraUI.group([{ icon: 'mdi:water-alert', iconTone: wet ? 'bad' : 'good', label: 'Lecksensor',
        value: ls === 'unavailable' ? 'Offline' : wet ? 'Wasser erkannt!' : 'Trocken', valueTone: wet ? 'bad' : ls === 'unavailable' ? 'warn' : null,
        entity: c.leak, active: wet }], 'Sicherheit');
    ]]]`;
    const parts = [];
    if (fields.glightx) parts.push(fields.glightx.replace(/^\[\[\[|\]\]\]$/g, ''));
    if (fields.gdose) parts.push(fields.gdose.replace(/^\[\[\[|\]\]\]$/g, ''));
    if (fields.genergy) parts.push(fields.genergy.replace(/^\[\[\[|\]\]\]$/g, ''));
    parts.push(`
    const c = ${_c};
    const rows = [];
    [[c.leakBat, 'Akku Lecksensor'], [c.tempBat, 'Akku Temperaturfühler']].forEach((x) => {
      if (!x[0] || !states[x[0]]) return;
      const b = parseFloat(states[x[0]].state);
      const lv = isNaN(b) ? 'unknown' : (window.casoraBattery ? window.casoraBattery.level(b) : (b) <= 10 ? 'crit' : (b) <= 20 ? 'low' : 'ok');
      const tn = (window.casoraBattery ? window.casoraBattery.tone(lv) : null);
      rows.push({ icon: window.casoraBattery ? window.casoraBattery.icon(lv, isNaN(b) ? null : b) : 'mdi:battery-outline', iconTone: tn || 'good', label: x[1],
        value: isNaN(b) ? '—' : Math.round(b) + ' %', valueTone: tn, entity: x[0] });
    });
    return rows.length ? window._casoraAqWrap(window._casoraUI.group(rows, 'Sensoren').replace(/data-casora-mi="/g, 'data-hp-metric="')) : '';`);
    /* Jeder Teil läuft als eigene Funktion; H.more fasst sie zusammen. */
    f2.more = HH.moreCard(watch, 'const __p = [' + parts.map((p) => '(() => {' + p + '\n})()').join(',\n') + '];\n'
      + 'return window._casoraHH ? window._casoraHH.more("aquarium", __p) : "";', cfg.temp);
    return HH.layout({ entity: cfg.temp, watch: watch, fields: f2, top: ['hero', 'chart'], left: ['glight', 'gtech'], right: ['gai', 'gleak', 'more'] });
  }
  /* Popup-Standard (24.09.2026): links Bedienung (Licht, Technik, Düngeanlage), rechts Infos (Sicherheit, Verbrauch, KI-Doktor). */
  const _sp = ((l, r) => window._casoraSplit ? window._casoraSplit('aquarium', l, r) : { left: l, right: r })(
    ['glight', 'glightx', 'gtech', 'gdose'].filter((k) => fields[k] !== undefined), ['gsafe', 'genergy', 'gai'].filter((k) => fields[k] !== undefined));
  const leftKeys = _sp.left, rightKeys = _sp.right;
  const top = {}, topStyle = {}, topAreas = [];
  ['hero', 'chart'].forEach((k) => { if (fields[k] !== undefined) { top[k] = fields[k]; topStyle[k] = fstyle[k]; topAreas.push(k); } });
  if (leftKeys.length) { top.left = { card: makeCol(leftKeys) }; topStyle.left = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }]; }
  if (rightKeys.length) { top.right = { card: makeCol(rightKeys) }; topStyle.right = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }]; }
  const narrow = topAreas.concat(leftKeys.length ? ['left'] : [], rightKeys.length ? ['right'] : []).map((k) => '"' + k + '"').join(' ');
  const wide = topAreas.map((k) => '"' + k + ' ' + k + '"').join(' ') + ' "' + (leftKeys.length ? 'left' : 'right') + ' ' + (rightKeys.length ? 'right' : 'left') + '"';

  return {
    type: 'custom:button-card',
    entity: cfg.temp,
    triggers_update: watch,
    card_mod: { style: wrapperStyle + '\nha-card.disabled { pointer-events: auto !important; }' },
    /* Ab 761 px (Desktop/Tablet): zwei Spalten; darunter (iPhone) alles untereinander. */
    extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: ' + wide + ' !important;'
      + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, 20px) !important; } }',
    tap_action: { action: 'none' },
    show_icon: false, show_name: false, show_label: false, show_state: false,
    styles: {
      card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: 'var(--casora-soft-card-top, 6px) 26px 22px 26px' }],
      grid: [{ 'grid-template-areas': narrow }, { 'grid-template-columns': 'minmax(0, 1fr)' },
             { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
      custom_fields: topStyle,
    },
    custom_fields: top,
  };

  };
})();


// ── Haushalt-Popups in Weich (01.10.2026) ──────────────────────────────────
// Gemeinsame Teile für Wäsche, Geschirrspüler, Drucker, Saugroboter, Auto, eBike,
// Rezept, Kalender, Lüften und Fußbodenheizung im Weich-Design (Vorbild: Licht-Popup).
// Nur aktiv, wenn _casoraSoft() an ist – die Aufrufer behalten sonst ihr bisheriges HTML.
(function () {
  if (window._casoraHH) return;
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var FONT = 'var(--primary-font-family, system-ui)';
  var SUB = 'var(--casora-soft-sub, var(--secondary-text-color))';
  var H = window._casoraHH = { esc: esc };
  H.on = function () { return !!(window._casoraSoft && window._casoraSoft()); };
  /* Etikett in Großbuchstaben (HELLIGKEIT, LEUCHTEN IM RAUM). */
  H.label = function (text, action) {
    var UI = window._casoraUI;
    return UI && UI.label ? UI.label(text, action) : '';
  };
  /* Diagramm-Platte: Titel als Etikett; 01-basis tauscht später nur den Text von .hp-ct. */
  H.chart = function (title, plate) {
    return '<div style="' + plate + 'padding:18px 14px 8px;">'
      + '<div class="hp-ct" style="font-family:' + FONT + ';font-size:12px;font-weight:700;letter-spacing:.1em;'
      + 'text-transform:uppercase;color:var(--casora-soft-label, var(--secondary-text-color));text-align:left;padding:0 6px;">'
      + title + '</div>'
      + '<div class="hp-chart-slot" style="min-height:150px;margin:8px 0 0;"></div></div>';
  };
  /* Fortschritt als breiter runder Balken wie der Helligkeitsregler: Wert links, Wort rechts. */
  var TONE = {
    accent: 'var(--casora-hh-bar-fill, var(--casora-popup-ui-accent, #276B64))',
    good: 'var(--casora-popup-ui-good, #30D158)', warn: 'var(--casora-popup-ui-warn, #FF9F0A)', bad: 'var(--casora-popup-ui-bad, #FF453A)',
  };
  H.bar = function (o) {
    var p = Math.max(0, Math.min(100, Number(o.pct) || 0));
    var c = TONE[o.tone] || o.tone || TONE.accent;
    /* Schrift zweilagig: gedämpft auf der Spur, darüber dieselbe Zeile in Balkenschrift,
       auf die Füllung zugeschnitten – lesbar, egal wie weit der Balken reicht (hell und dunkel). */
    var txt = function (ink) {
      return '<div style="position:absolute;left:22px;top:50%;transform:translateY(-50%);font-size:17px;font-weight:700;'
        + 'font-variant-numeric:tabular-nums;white-space:nowrap;color:' + ink + ';">' + esc(o.text) + '</div>'
        + (o.word ? '<div style="position:absolute;right:22px;top:50%;transform:translateY(-50%);font-size:14px;font-weight:600;'
          + 'white-space:nowrap;max-width:60%;overflow:hidden;text-overflow:ellipsis;color:' + ink + ';">' + esc(o.word) + '</div>' : '');
    };
    return '<div style="font-family:' + FONT + ';position:relative;height:' + (o.h || 66) + 'px;box-sizing:border-box;'
      + 'border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;pointer-events:none;'
      + 'background:var(--casora-hh-bar-track, var(--casora-soft-control-fill, rgba(140,115,90,0.10)));">'
      + '<div style="position:absolute;left:0;top:0;bottom:0;width:' + p.toFixed(1) + '%;border-radius:inherit;'
      + 'background:linear-gradient(90deg, color-mix(in srgb, ' + c + ' var(--casora-soft-slider-mix, 55%), var(--casora-soft-slider-light, #fff)), ' + c + ');'
      + 'transition:width .3s cubic-bezier(.36,0,.16,1);"></div>'
      + txt(SUB)
      + '<div style="position:absolute;inset:0;clip-path:inset(0 ' + (100 - p).toFixed(1) + '% 0 0);">'
      + txt('var(--casora-hh-bar-ink, #173C38)') + '</div>'
      + '</div>';
  };
  /* Viele Segmente (Startzeit, Saugstufe): Breite nach Text statt gleich breit, damit nichts abgeschnitten wird. */
  H.dense = function (html, wrap) {
    /* wrap: Umbruch statt gleich breiter Spalten (Saugroboter: „Saugen & wischen“ wurde sonst abgeschnitten). */
    if (wrap) return '<style>.hh-wrap .hui-seg{grid-template-columns:repeat(auto-fill, minmax(124px, 1fr))!important;}'
      + '.hh-wrap .hui-sg{padding:0 10px;}</style><div class="hh-wrap">' + html + '</div>';
    return '<style>.hh-dense .hui-sg{flex:0 1 auto;min-width:0;padding:0 16px;}</style><div class="hh-dense">' + html + '</div>';
  };
  /* Weiße Glas-Töne (rgba(255,255,255,…)) wären auf Creme unsichtbar: im Weich-Design als gedimmter Kreis. */
  H.tone = function (t) {
    return (H.on() && typeof t === 'string' && /^rgba\(255,\s*255,\s*255,/.test(t) && t !== 'rgba(255,255,255,0.18)')
      ? 'rgba(255,255,255,0.18)' : t;
  };
  /* Auswahlliste (_casoraSelRows, Klasse fb-sel): aktive Zeile hell mit weichem Schatten wie das aktive Segment. */
  H.sel = function (html) {
    return H.on() ? '<style>.hui-row.fb-sel.hui-srow{background:var(--casora-soft-seg-on, #FFFDF9);'
      + 'box-shadow:var(--casora-soft-seg-on-shadow, none);}'
      /* Dunkel ist die helle Fläche hell: Schrift folgt dem aktiven Segment. */
      + '.hui-row.fb-sel.hui-srow .hui-inner div{color:var(--casora-soft-seg-on-ink, inherit) !important;}</style>' + html : html;
  };
  /* Runde Pillen-Knöpfe (Aktionen); primary = gefüllt in Akzentfarbe. */
  H.pillCss = '<style>.hh-pills{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;}'
    + '.hh-pill{display:inline-flex;align-items:center;gap:7px;min-height:44px;box-sizing:border-box;padding:0 18px;border-radius:999px;'
    + 'font-family:' + FONT + ';font-size:14px;font-weight:600;white-space:nowrap;cursor:pointer;user-select:none;-webkit-user-select:none;'
    + 'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));color:var(--casora-popup-tiles-text-primary, #2E2721);'
    + 'transition:background-color .16s ease, filter .16s ease;-webkit-tap-highlight-color:transparent;}'
    + '.hh-pill.pri{background:var(--casora-soft-primary, var(--casora-popup-ui-action, #276B64));color:var(--casora-soft-primary-ink, var(--casora-popup-ui-on-action, #fff));}'
    + '.hh-pill.dis{opacity:.4;cursor:default;}'
    + '@media (hover:hover){.hh-pill:not(.dis):not(.pri):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}'
    + '.hh-pill.pri:not(.dis):hover{filter:brightness(1.08);}}'
    + '.hh-pill:not(.dis):active{filter:brightness(.94);}'
    + '@media (max-width: 420px){.hh-pills{gap:6px;}.hh-pill{padding:0 12px;font-size:13.5px;gap:5px;}}</style>';

  // ── Entschlacken (01.10.2026): schlanker Aufbau mit „Mehr“ ─────────────────
  // Nur Weich. Die Geräte-Popups (Drucker, Sauger, Geschirrspüler, Wäsche, Aquarium …)
  // übergeben ihre fertigen Felder (Vorlagen-Strings bzw. { card }) und bekommen den
  // Aufbau wie das Licht-Popup: Kopfzeile volle Breite, links Bedienung, rechts Infos,
  // unten rechts „Mehr“. Jede Spalte und der Mehr-Bereich sind eigene button-cards mit
  // triggers_update – das Gerüst selbst wird nur beim Öffnen gebaut.
  var COL_CSS = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
    + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
    + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
    + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
    + ' #container { background: transparent !important; }';
  var WRAP_CSS = [
    ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
    'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
    'ha-card:hover { box-shadow: none !important; }',
    'ha-ripple { display: none !important; }',
    '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
    ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
    'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
    'ha-card { will-change: auto !important; }',
    '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
    'ha-card.disabled { pointer-events: auto !important; }',
  ].join('\n');
  /* Spalte: Felder untereinander, Abstand nur zwischen nicht leeren Feldern (_casoraColGap). */
  H.col = function (keys, fields, watch, entity, extra) {
    var cf = {}, cs = {};
    keys.forEach(function (k) { cf[k] = fields[k]; cs[k] = [{ 'justify-self': 'stretch' }, { 'min-width': '0' }]; });
    return {
      type: 'custom:button-card', entity: entity || undefined, triggers_update: watch || [], tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      card_mod: { style: COL_CSS },
      extra_styles: (window._casoraColGap ? window._casoraColGap(keys) : '').replace('margin-top: 18px', 'margin-top: 20px') + (extra || ''),
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
        grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
               { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }, { 'align-content': 'start' }],
        custom_fields: cs,
      },
      custom_fields: cf,
    };
  };
  /* o = { entity, watch, fields, top: ['hero'], left: [...], right: [...], colExtra } – fehlende Felder fallen weg. */
  H.layout = function (o) {
    var f = o.fields, has = function (k) { return f[k] !== undefined && f[k] !== null && f[k] !== ''; };
    var top = (o.top || ['hero']).filter(has), L = (o.left || []).filter(has), R = (o.right || []).filter(has);
    if (!L.length && R.length > 1) { L = R.slice(0, 1); R = R.slice(1); }
    /* B-11: Steht rechts nur „Mehr“, wird das Popup einspaltig und „Mehr“ ist die letzte Zeile –
       statt einer fast leeren rechten Spalte mit „Mehr“ oben. */
    var one = false;
    if (L.length && R.length === 1 && R[0] === 'more') { L = L.concat(R); R = []; one = true; }
    /* Auch einspaltig (Waschmaschine/Trockner aus) verteilt sich das aufgeklappte „Mehr“ am breiten
       Popup auf zwei Spalten – sonst liefen Statistik und Verbrauch als Zeilen über die volle Breite. */
    if (one && f.more && f.more.card) {
      f = Object.assign({}, f, { more: { card: Object.assign({}, f.more.card, {
        extra_styles: (f.more.card.extra_styles || '') + MORE_WIDE_CSS }) } });
    }
    /* „Mehr“ unter beiden Spalten über die volle Breite; aufgeklappt verteilen sich die Abschnitte
       gleichmäßig auf zwei Spalten statt alles rechts zu stapeln (Wunsch 02.10.2026). */
    var wideMore = !one && R.length > 1 && R[R.length - 1] === 'more';
    if (wideMore) R = R.slice(0, -1);
    var cf = {}, cs = {};
    top.forEach(function (k) {
      /* Vorlagen (live) in eine eigene Karte; festes HTML (Diagramm-Platte) direkt, damit es nie neu gezeichnet wird. */
      cf[k] = (typeof f[k] === 'string' && f[k].indexOf('[[[') > -1) ? { card: H.col([k], f, o.watch, o.entity) } : f[k];
      cs[k] = [{ 'justify-self': 'stretch' }, { 'min-width': '0' }];
    });
    cf.left = { card: H.col(L, f, o.watch, o.entity, o.colExtra) };
    if (!one) cf.right = { card: H.col(R, f, o.watch, o.entity, o.colExtra) };
    cs.left = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
    if (!one) cs.right = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }, { 'min-width': '0' }];
    if (wideMore) {
      var mc = f.more && f.more.card ? Object.assign({}, f.more.card) : null;
      if (mc) mc.extra_styles = (mc.extra_styles || '') + MORE_WIDE_CSS;
      cf.more = mc ? { card: mc } : f.more;
      cs.more = [{ 'justify-self': 'stretch' }, { 'min-width': '0' }];
    }
    var keys = top.concat(one ? ['left'] : ['left', 'right']).concat(wideMore ? ['more'] : []);
    var narrow = keys.map(function (k) { return '"' + k + '"'; }).join(' ');
    var wide = top.map(function (k) { return '"' + k + ' ' + k + '"'; }).join(' ') + (one ? ' "left left"' : ' "left right"')
      + (wideMore ? ' "more more"' : '');
    return {
      type: 'custom:button-card', entity: o.entity || undefined, triggers_update: [],
      card_mod: { style: WRAP_CSS },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: ' + wide + ' !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, 26px) !important; } }',
      tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0 26px 24px 26px' }],
        grid: [{ 'grid-template-areas': narrow }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 22px)' }],
        custom_fields: cs,
      },
      custom_fields: cf,
    };
  };
  /* Breites „Mehr“: aufgeklappt zwei ausgeglichene Spalten (Abschnitte brechen nicht um).
     Abstand als padding statt margin (04.10.2026): Safari nahm den Außenabstand des letzten
     Abschnitts links mit an den Kopf der rechten Spalte, die rechte Überschrift stand 18 px tiefer. */
  var MORE_WIDE_CSS = '\n@media (min-width: 761px) {'
    /* column-gap mit !important: UI.more setzt gap:18px (Kurzform) und gewann sonst – die Mehr-Spalten
       standen 3 px versetzt zu den Spalten darüber. */
    + ' .hui-more.open > .hui-mbd { display: block !important; column-count: 2; column-gap: var(--casora-popup-col-gap, 26px) !important; }'
    + ' .hui-more.open > .hui-mbd > * { break-inside: avoid; -webkit-column-break-inside: avoid; display: block; margin: 0; padding-bottom: 18px; }'
    + ' .hui-more.open > .hui-mbd > style { display: none; margin: 0; } }';
  /* Mehr-Bereich als eigene button-card mit triggers_update; code = Rumpf (… return html). */
  H.moreCard = function (watch, code, entity) {
    return { card: H.col(['m'], { m: '[[[\n' + code + '\n]]]' }, watch, entity) };
  };
  /* Teile (fertiges HTML) zu einem „Mehr“ zusammenfassen; leere Teile zählen nicht. */
  var vis = function (p) { return !!String(p || '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, '').trim(); };
  H.more = function (id, parts, opts) {
    var UI = window._casoraUI;
    /* Nachgeladene Platten (L.slot, data-hw-slot) bleiben auch leer im Baum – L.paint füllt sie
       später; leer sind sie unsichtbar und zählen nicht mit. */
    parts = (parts || []).filter(function (p) { return p && (vis(p) || String(p).indexOf('data-hw-slot') > -1); });
    var n = parts.filter(vis).length;
    if (!n || !UI || !UI.more) return '';
    return UI.more(id, '<style>.hui-mbd > [data-hw-slot]:empty{display:none;}</style>'
      + parts.map(function (p) { return /^<div data-hw-slot=/.test(p) ? p : '<div>' + p + '</div>'; }).join(''),
      Object.assign({ count: n }, opts || {}));
  };
  /* KI-Blick als Knopf unter einem Kamerabild: nutzt das Kamera-Modul (_casoraCamAi) –
     data-cam-ai löst die Beschreibung aus, .cam-ai-inline/.cam-ai-box füllt das Modul selbst.
     Die Glas-Farben seiner Beschreibung werden hier nur auf die Weich-Töne umgefärbt. */
  H.aiButton = function (camId, label) {
    var id = esc(camId);
    return H.pillCss + '<style>'
      + '.cam-ai-inline .cam-ai-box>div{background:var(--casora-soft-row-fill, rgba(140,115,90,0.07))!important;border-radius:var(--casora-popup-row-radius, 24px)!important;padding:14px 16px!important;}'
      + '.cam-ai-inline .cam-ai-box [style*="rgba(255,255,255,0.92)"]{color:var(--casora-popup-tiles-text-primary, #3A322B)!important;}'
      + '.cam-ai-inline .cam-ai-box [style*="rgba(255,255,255,0.5)"],.cam-ai-inline .cam-ai-box [style*="rgba(255,255,255,0.6)"]{color:var(--casora-soft-sub, rgba(58,50,43,0.6))!important;}'
      + '.cam-ai-inline .hh-pill > *{pointer-events:none;}</style>'
      + '<div class="cam-ai-inline" data-cam="' + id + '" style="font-family:' + FONT + ';display:flex;flex-direction:column;gap:12px;text-align:left;">'
      + '<div class="hh-pills" style="justify-content:flex-start;"><div class="hh-pill" data-cam-ai="' + id + '">'
      + '<ha-icon icon="mdi:creation" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;color:var(--casora-popup-ui-action, #276B64);"></ha-icon>'
      + '<span>' + esc(label) + '</span></div></div>'
      + '<div class="cam-ai-box" style="display:none;"></div></div>';
  };
  /* Zeilen, die im Standard-Design das Diagramm umschalten (data-hp-metric), öffnen im
     schlanken Aufbau ohne Diagramm den HA-Dialog; reine Diagramm-Schlüssel (hwd7: …) nichts. */
  H.mi = function (html) {
    return String(html || '').replace(/data-hp-metric="hwd\d+:[^"]*"/g, '').replace(/data-hp-metric="/g, 'data-casora-mi="');
  };
})();


// ── Waschmaschine / Trockner (casora_laundry) ─────────────────────────────────
// Quellen (03.10.2026): zuerst die offizielle Integration des Herstellers (Home Connect,
// Miele, SmartThings, LG ThinQ, Whirlpool …), sonst WashData (ha_washdata), sonst nur der
// Zwischenstecker – window.casoraLaundryFind in 00-finden.js. Kachelstatus und Popup
// liegen hier (update-sicher); die Templates rufen nur window._casoraLaundry.tile() /
// .popup() auf. Nachladen per WS: Verbrauch Heute/Woche/Monat (Recorder-Statistik),
// letzte Durchgänge + Wartung (WashData).
(function () {
  if (window._casoraLaundry) return;
  var L = window._casoraLaundry = { data: {}, busy: {} };

  // [Text, Ton, aktiv, Art] – Art: off | idle | delay | run | pause | attn | done | clean | error
  var STATE = {
    /* WashData */
    off: ['Aus', null, false, 'off'], idle: ['Bereit', 'good', false, 'idle'], starting: ['Startet', 'accent', true, 'run'],
    running: ['Läuft', 'accent', true, 'run'], paused: ['Pausiert', 'warn', true, 'pause'], user_paused: ['Pausiert', 'warn', true, 'pause'],
    ending: ['Endet gleich', 'accent', true, 'run'], finished: ['Fertig', 'good', false, 'done'], anti_wrinkle: ['Knitterschutz', 'accent', true, 'run'],
    delay_wait: ['Startet später', 'accent', true, 'delay'], interrupted: ['Unterbrochen', 'bad', false, 'error'],
    force_stopped: ['Beendet', null, false, 'done'], rinse: ['Spülen', 'accent', true, 'run'],
    /* „clean“: Durchgang fertig, Wäsche noch in der Maschine (bis Tür auf bzw. „Ausgeräumt“). */
    clean: ['Fertig', 'good', false, 'clean'],
    unknown: ['Unbekannt', null, false, 'off'], unavailable: ['Nicht verfügbar', 'bad', false, 'error'],
    /* Home Connect (auch Geschirrspüler) */
    inactive: ['Aus', null, false, 'off'], ready: ['Bereit', 'good', false, 'idle'], delayedstart: ['Startet später', 'accent', true, 'delay'],
    run: ['Läuft', 'accent', true, 'run'], pause: ['Pausiert', 'warn', true, 'pause'], actionrequired: ['Eingriff nötig', 'bad', true, 'attn'],
    error: ['Fehler', 'bad', false, 'error'], aborting: ['Wird abgebrochen', 'bad', true, 'run'],
    /* Miele */
    on: ['An', null, false, 'idle'], programmed: ['Programm gewählt', null, false, 'idle'], waiting_to_start: ['Startet später', 'accent', true, 'delay'],
    in_use: ['Läuft', 'accent', true, 'run'], program_ended: ['Fertig', 'good', false, 'done'], failure: ['Störung', 'bad', false, 'error'],
    program_interrupted: ['Unterbrochen', 'bad', false, 'error'], rinse_hold: ['Spülstopp', 'warn', true, 'pause'],
    service: ['Wartung nötig', 'warn', false, 'error'], not_connected: ['Nicht verbunden', 'bad', false, 'error'],
    /* SmartThings (Maschinenzustand) */
    stop: ['Bereit', null, false, 'idle'],
    /* Whirlpool */
    standby: ['Bereit', null, false, 'idle'], setting: ['Bereit', null, false, 'idle'], system_initialize: ['Startet', 'accent', true, 'run'],
    running_maincycle: ['Läuft', 'accent', true, 'run'], running_postcycle: ['Endet gleich', 'accent', true, 'run'],
    cycle_filling: ['Läuft', 'accent', true, 'run'], cycle_rinsing: ['Läuft', 'accent', true, 'run'], cycle_sensing: ['Läuft', 'accent', true, 'run'],
    cycle_soaking: ['Läuft', 'accent', true, 'run'], cycle_spinning: ['Läuft', 'accent', true, 'run'], cycle_washing: ['Läuft', 'accent', true, 'run'],
    complete: ['Fertig', 'good', false, 'done'], delay_countdown: ['Startet später', 'accent', true, 'delay'], smart_delay: ['Startet später', 'accent', true, 'delay'],
    delay_paused: ['Pausiert', 'warn', true, 'pause'], power_failure: ['Stromausfall', 'bad', false, 'error'], hard_stop_or_error: ['Fehler', 'bad', false, 'error'],
    /* LG ThinQ */
    power_off: ['Aus', null, false, 'off'], initial: ['Bereit', null, false, 'idle'], detecting: ['Läuft', 'accent', true, 'run'],
    rinsing: ['Läuft', 'accent', true, 'run'], spinning: ['Läuft', 'accent', true, 'run'], drying: ['Läuft', 'accent', true, 'run'],
    cooling: ['Läuft', 'accent', true, 'run'], cool_down: ['Läuft', 'accent', true, 'run'], soaking: ['Läuft', 'accent', true, 'run'],
    refreshing: ['Läuft', 'accent', true, 'run'], wrinkle_care: ['Knitterschutz', 'accent', true, 'run'], end: ['Fertig', 'good', false, 'done'],
    done: ['Fertig', 'good', false, 'done'], reservation: ['Startet später', 'accent', true, 'delay'],
  };
  /* WashData-Phasen (Phasenkatalog, englisch) und übliche Herstellerwerte */
  var PHASE = {
    'pre-wash': 'Vorwäsche', prewash: 'Vorwäsche', 'pre-rinse': 'Vorspülen', wash: 'Waschen', rinse: 'Spülen', spin: 'Schleudern',
    soak: 'Einweichen', 'anti-crease': 'Knitterschutz', 'anti-wrinkle': 'Knitterschutz', drying: 'Trocknen', dry: 'Trocknen',
    'cool-down': 'Abkühlen', cooldown: 'Abkühlen', 'heat-up': 'Aufheizen', heating: 'Aufheizen', heat: 'Aufheizen', drain: 'Abpumpen',
    'drain-&-switch': 'Abpumpen', 'sensor-check': 'Prüfung', sanitize: 'Hygiene',
  };
  /* Kein Programm/keine Phase, nur der Gerätezustand (WashData füllt die Phase sonst damit). */
  var NOPROG = { off: 1, none: 1, unknown: 1, unavailable: 1, 'detecting...': 1, detecting: 1, starting: 1, running: 1, idle: 1,
    paused: 1, user_paused: 1, ending: 1, finished: 1, clean: 1, auto_detect: 1 };
  var MAINT = {
    descale: ['Entkalken', 'mdi:water-opacity'], filter_clean: ['Filter reinigen', 'mdi:air-filter'],
    drum_clean: ['Trommelreinigung', 'mdi:washing-machine'], bearing_service: ['Lagerwartung', 'mdi:cog-outline'],
    other: ['Sonstige Wartung', 'mdi:wrench-outline'],
  };
  var DIM = 'rgba(255,255,255,0.18)';

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var num = function (states, e) {
    if (!e || !states[e]) return null;
    var n = parseFloat(states[e].state);
    return isNaN(n) ? null : n;
  };
  var str = function (states, e) {
    var s = e && states[e] && states[e].state;
    return !s || s === 'unknown' || s === 'unavailable' || s === 'none' || s === 'off' ? null : s;
  };
  var f = function (n, d) { return n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var kwh = function (n) { return f(n, n < 10 ? 2 : 1) + ' kWh'; };
  /* Währung von Home Assistant (CHF, USD …), sonst Euro. */
  var eur = function (n) {
    var ha = document.querySelector('home-assistant'), cur = (ha && ha.hass && ha.hass.config && ha.hass.config.currency) || 'EUR';
    try { return n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { style: 'currency', currency: cur }); }
    catch (e) { return n.toLocaleString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { style: 'currency', currency: 'EUR' }); }
  };
  var dur = function (min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + ' Std.' + (m ? ' ' + m + ' Min.' : '') : m + ' Min.';
  };
  var clock = function (d) { return d.toLocaleTimeString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { hour: '2-digit', minute: '2-digit' }); };
  var day = function (d) {
    var t0 = new Date(); t0.setHours(0, 0, 0, 0);
    var diff = Math.round((t0 - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (diff === 0) return 'Heute';
    if (diff === 1) return 'Gestern';
    return d.toLocaleDateString((window.casoraLocale ? window.casoraLocale() : 'de-DE'), { weekday: 'short', day: '2-digit', month: '2-digit' });
  };
  var ago = function (d) {
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return 'gerade eben';
    if (m < 60) return 'vor ' + m + ' Min.';
    var h = Math.round(m / 60);
    if (h < 24) return 'vor ' + h + ' Std.';
    var dd = Math.round(h / 24);
    return dd === 1 ? 'gestern' : 'vor ' + dd + ' Tagen';
  };
  var HASS = function () { var h = document.querySelector('home-assistant'); return (h && h.hass) || null; };
  /* Zustandstext, wie HA ihn übersetzt (Programme und Phasen der Hersteller-Integrationen). */
  var fmt = function (states, e) {
    var st = e && states[e];
    if (!st || NOPROG[String(st.state).toLowerCase()]) return null;
    var h = HASS();
    try { if (h && typeof h.formatEntityState === 'function') return h.formatEntityState(st); } catch (x) { /* roh */ }
    return st.state;
  };
  /* Minuten aus einer Dauer (s/min/h) oder einem Zeitpunkt (bis dahin, mit past: seitdem). */
  var mins = function (states, e, past) {
    var st = e && states[e];
    if (!st) return null;
    var a = st.attributes || {};
    if (a.device_class === 'timestamp' || /^\d{4}-\d\d-\d\dT/.test(String(st.state))) {
      var t = Date.parse(st.state);
      if (isNaN(t)) return null;
      return (past ? Date.now() - t : t - Date.now()) / 60000;
    }
    var n = parseFloat(st.state);
    if (isNaN(n)) return null;
    var u = a.unit_of_measurement;
    return u === 's' ? n / 60 : u === 'h' ? n * 60 : u === 'd' ? n * 1440 : n;
  };
  /* Energie eines Durchgangs (WashData speichert Wh, ältere Einträge kWh). */
  var kwhOf = function (x) { return x ? (x.energy_wh != null ? x.energy_wh / 1000 : Number(x.energy_kwh) || 0) : 0; };
  var phaseName = function (s) {
    if (!s || NOPROG[String(s).toLowerCase()]) return null;
    var k = String(s).toLowerCase().replace(/\s+/g, '-');
    return PHASE[k] || s;
  };
  var progName = function (s) { return s === 'auto_detect' ? 'Automatisch erkennen' : s; };
  var ok = function (states, e) { return !!(e && states[e] && states[e].state !== 'unavailable'); };
  var btn = function (e) { return { domain: 'button', service: 'press', target: { entity_id: e } }; };

  /* Zustand der Maschine: [Text, Ton, aktiv, Art]. Nur Zwischenstecker: Leistung > 5 W = läuft. */
  L.state = function (states, id) {
    var st = states[id];
    var raw = String((st && st.state) || 'unknown').toLowerCase();
    var a = (st && st.attributes) || {};
    if (st && raw !== 'unavailable' && /^sensor\./.test(id) && a.device_class === 'power') {
      var w = parseFloat(st.state);
      return !isNaN(w) && w > 5 ? STATE.running : STATE.idle;
    }
    if (st && /^switch\./.test(id) && raw !== 'unavailable') return raw === 'on' ? STATE.on : STATE.off;
    if (STATE[raw]) return STATE[raw];
    var h = HASS(), txt = raw;
    try { if (st && h && typeof h.formatEntityState === 'function') txt = h.formatEntityState(st); } catch (x) { /* roh */ }
    return [txt, null, false, 'other'];
  };

  /* Alle Entitäten: feste Kartenvariablen vor dem Finder (casoraLaundryFind), Stecker per companionPlug. */
  L.resolve = function (entity, V, states, hass) {
    V = V || {};
    var reg = (hass && hass.entities) || {};
    var st = V.appliance_state || (entity && entity.entity_id);
    var LF = window.casoraLaundryFind;
    var src = (LF && hass && st) ? LF.forEntity(hass, st) : null;
    var F = (src && src.f) || {};
    var devOf = function (eid) { return reg[eid] && reg[eid].device_id; };
    /* Messwert am Stecker-Gerät über die Einheit (W, V, A, kWh) bzw. die Endung des Schalters. */
    var onDev = function (eid, re, dom, unit) {
      var dev = devOf(eid);
      if (!dev) return null;
      var hit = null;
      Object.keys(reg).forEach(function (k) {
        var e = reg[k];
        if (hit || e.device_id !== dev || !states[e.entity_id]) return;
        if (dom && e.entity_id.indexOf(dom + '.') !== 0) return;
        if (e.platform === 'powercalc') return;          // geschätzte Werte, nicht die Messung
        if (re && !re.test(e.entity_id)) return;
        if (unit && (states[e.entity_id].attributes || {}).unit_of_measurement !== unit) return;
        hit = e.entity_id;
      });
      return hit;
    };
    var CD = window.casoraDevice;
    var plugF = (!V.plug_entity && CD && st && !(src && src.source === 'plug')) ? (CD.companionPlug(hass, st) || {}) : {};
    var plug = V.plug_entity || F.plug || plugF.switch || null;
    var dryer = V.device_type ? V.device_type === 'dryer' : !!(src && src.role === 'dryer');
    return {
      st: st, name: V.room_name || 'Gerät', dryer: dryer,
      source: src ? src.source : null, official: !!(src && src.rank === 0),
      entry: V.washdata_entry || (src && src.entry) || null,
      price: window.casoraPriceKwh ? window.casoraPriceKwh(V.price_kwh) : null,
      color: V.chart_color || '#00C3D0',
      program: F.program || null, phase: F.phase || null,
      remaining: V.appliance_remaining || F.remaining || null, progress: V.appliance_progress || F.progress || null,
      elapsed: F.elapsed || null, total: F.total || null, count: F.count || null, running: F.running || null,
      select: F.select || null, pause: F.pause || null, resume: F.resume || null, force: F.force || null,
      stop: F.stop || null, unload: F.unload || null, door: F.door || null, suggest: F.suggest || null,
      plug: plug,
      power: (plug && onDev(plug, null, 'sensor', 'W')) || plugF.power || F.power || null,
      volt: plug ? (onDev(plug, null, 'sensor', 'V') || plugF.voltage || null) : null,
      amp: plug ? (onDev(plug, null, 'sensor', 'A') || plugF.current || null) : null,
      energy: (plug && onDev(plug, null, 'sensor', 'kWh')) || plugF.energy || F.energy || null,
      lock: plug ? onDev(plug, /_kindersicherung$/, 'switch') : null,
    };
  };
  L.watch = function (c) {
    return [c.st, c.program, c.phase, c.remaining, c.progress, c.elapsed, c.total, c.count, c.running, c.select,
      c.pause, c.resume, c.force, c.stop, c.unload, c.door, c.suggest, c.plug, c.power, c.volt, c.amp, c.energy, c.lock]
      .filter(Boolean);
  };

  /* Werte, die mehrere Platten brauchen */
  var progOf = function (c, states) {
    var p = fmt(states, c.program);
    if (p) return p;
    var g = ((states[c.st] || {}).attributes || {}).current_program_guess;
    return g && !NOPROG[String(g).toLowerCase()] ? g : null;
  };
  var phaseOf = function (c, states) {
    if (!c.phase) return null;
    return c.source === 'washdata' ? phaseName(str(states, c.phase)) : fmt(states, c.phase);
  };
  var remOf = function (c, states) { var r = mins(states, c.remaining); return r != null && r > 0.5 ? r : null; };
  var elOf = function (c, states) { var e = mins(states, c.elapsed, true); return e != null && e > 0 ? e : null; };
  var pctOf = function (c, states) {
    var p = num(states, c.progress);
    if (p != null) return Math.max(0, Math.min(100, p));
    var r = remOf(c, states), e = elOf(c, states);
    return r != null && e != null && r + e > 0 ? e / (r + e) * 100 : null;
  };
  var doorOpen = function (c, states) {
    var d = c.door && states[c.door];
    return !!(d && (d.state === 'on' || d.state === 'open'));
  };
  /* Durchgänge, die zählen: länger als 10 Minuten. */
  var realCycles = function (d) { return (d.cycles || []).filter(function (x) { return x && x.duration > 600; }); };

  /* ── Nachladen (Statistik + WashData), höchstens alle 2 Minuten ── */
  var find = function (root, sel) {
    var out = [];
    (function walk(n) {
      if (!n || !n.querySelectorAll) return;
      n.querySelectorAll(sel).forEach(function (x) { out.push(x); });
      n.querySelectorAll('*').forEach(function (x) { if (x.shadowRoot) walk(x.shadowRoot); });
    })(root);
    return out;
  };
  L.fetch = function (c, hass, force) {
    if (!c || !hass || typeof hass.callWS !== 'function') return;
    var d = L.data[c.st] || (L.data[c.st] = {});
    if (L.busy[c.st]) return;
    if (!force && d.ts && Date.now() - d.ts < 120000) return;
    L.busy[c.st] = true;
    d.ts = Date.now();
    var jobs = [];
    if (c.energy) {
      ['day', 'week', 'month'].forEach(function (p) {
        jobs.push(hass.callWS({ type: 'recorder/statistic_during_period', statistic_id: c.energy,
          calendar: { period: p }, types: ['change'] })
          .then(function (r) { d[p] = r && r.change != null ? r.change : null; }).catch(function () {}));
      });
    }
    if (c.entry) {
      jobs.push(hass.callWS({ type: 'ha_washdata/get_device_cycles', entry_id: c.entry, limit: 50 })
        .then(function (r) { d.cycles = (r && r.cycles) || []; d.total = r && r.total; }).catch(function () {}));
      jobs.push(hass.callWS({ type: 'ha_washdata/get_maintenance_log', entry_id: c.entry })
        .then(function (r) { d.maint = r || null; }).catch(function () {}));
    }
    Promise.all(jobs).then(function () {
      L.busy[c.st] = false;
      d.ready = true;
      L.paint(c);
    });
  };
  /* Nachgeladene Platten im offenen Popup neu zeichnen (ohne auf ein hass-Update zu warten). */
  L.paint = function (c) {
    var ha = document.querySelector('home-assistant');
    var states = (ha && ha.hass && ha.hass.states) || {};
    find(ha && ha.shadowRoot ? ha.shadowRoot : document, '[data-hw-slot]').forEach(function (el) {
      if (el.getAttribute('data-hw-key') !== c.st) return;
      el.innerHTML = (window.casoraTr || function (x) { return x; })(L.inner(el.getAttribute('data-hw-slot'), c, states));
    });
  };
  var slot = function (kind, c, states) {
    return '<div data-hw-slot="' + kind + '" data-hw-key="' + esc(c.st) + '">' + L.inner(kind, c, states) + '</div>';
  };

  /* Tipps: Diagramm-Zeilen (data-hp-metric) und „Erledigt“ bei Wartung (zweistufig). */
  L.wrap = function (html) {
    return '<style>.hui-row.hp-sel{background:var(--casora-popup-row-hover, rgba(255,255,255,0.08));}'
      + '.hw-done{display:inline-block;pointer-events:auto;cursor:pointer;padding:8px 10px;margin:-8px -10px;white-space:nowrap;'
      + 'font-size:16px;font-weight:500;color:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));}'
      + '.hw-done.armed{color:#fff;background:var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0));border-radius:11px;}'
      + '</style>'
      + '<div ontouchstart="window._hpPlantTap&&window._hpPlantTap(event,\'s\');window._casoraLaundry.tap(event,\'s\')"'
      + ' ontouchend="window._hpPlantTap&&window._hpPlantTap(event,\'t\');window._casoraLaundry.tap(event,\'t\')"'
      + ' onclick="window._hpPlantTap&&window._hpPlantTap(event,\'c\');window._casoraLaundry.tap(event,\'c\')">'
      + html + '</div>';
  };
  L.tap = function (ev, kind) {
    if (kind === 's') { var t0 = ev.touches && ev.touches[0]; L._ty = t0 ? t0.clientY : 0; L._tx = t0 ? t0.clientX : 0; return; }
    if (kind === 't') {
      var t = ev.changedTouches && ev.changedTouches[0];
      if (t && (Math.abs(t.clientY - (L._ty || 0)) > 10 || Math.abs(t.clientX - (L._tx || 0)) > 10)) return;
      L._t = Date.now();
    } else if (Date.now() - (L._t || 0) < 700) return;
    var p = (ev.composedPath && ev.composedPath()) || [ev.target];
    var b = null;
    for (var i = 0; i < p.length; i++) { if (p[i] && p[i].dataset && p[i].dataset.hwMaint) { b = p[i]; break; } }
    if (!b) return;
    ev.stopPropagation(); if (ev.cancelable) ev.preventDefault();
    window._casoraSuppressDismiss = Date.now() + 600;
    if (!b.classList.contains('armed')) {
      b.classList.add('armed');
      b.textContent = 'Bestätigen';
      clearTimeout(b._hwT);
      b._hwT = setTimeout(function () { b.classList.remove('armed'); b.textContent = 'Erledigt'; }, 4000);
      return;
    }
    clearTimeout(b._hwT);
    var parts = b.dataset.hwMaint.split('|');
    var hass = HASS();
    if (!hass) return;
    b.textContent = '…';
    hass.callWS({ type: 'ha_washdata/add_maintenance_event', entry_id: parts[0], event_type: parts[1] })
      .then(function () {
        var c = L._cfg[parts[2]];
        if (c) L.fetch(c, hass, true);
      })
      .catch(function (e) { console.error('casora laundry maintenance', e); b.textContent = 'Fehler'; });
  };
  L._cfg = {};

  /* Programme aus den Durchgängen (WashData): wie oft, wie lange, wie viel Strom. */
  var programs = function (d) {
    var by = {};
    realCycles(d).forEach(function (x) {
      if (!x.profile_name || x.status === 'interrupted') return;
      var p = by[x.profile_name] || (by[x.profile_name] = { name: x.profile_name, n: 0, dur: 0, e: 0, en: 0, last: 0 });
      p.n++; p.dur += x.duration || 0;
      var e = kwhOf(x);
      if (e > 0) { p.e += e; p.en++; }
      p.last = Math.max(p.last, Date.parse(x.start_time) || 0);
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n || b.last - a.last; });
  };

  /* ── Inhalte der Platten ── */
  L.inner = function (kind, c, states) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var SF = !!(window._casoraHH && window._casoraHH.on());
    var d = L.data[c.st] || {};
    var s = L.state(states, c.st);
    var active = c.print && window._casoraPrint ? window._casoraPrint.state(c, states)[2] : s[2];
    var raw = String((states[c.st] || {}).state || '').toLowerCase();
    var stObj = states[c.st] || {};
    var mIcon = c.dryer ? 'mdi:tumble-dryer' : 'mdi:washing-machine';

    if (kind === 'hero') {
      var at = stObj.attributes || {};
      var prog = progOf(c, states);
      var ph = phaseOf(c, states);
      var rem = remOf(c, states);
      var sub = [], value = s[0], unit = null, tone = s[1];
      if (active) {
        if (rem != null) {
          var h = Math.floor(rem / 60), m = Math.round(rem % 60);
          if (m === 60) { h++; m = 0; }
          value = h ? h + ':' + (m < 10 ? '0' : '') + m : String(m);
          unit = h ? 'Std. übrig' : 'Min. übrig';
          sub.push(s[0]);
        }
        if (prog) sub.push(prog);
        if (ph && ph !== s[0] && ph !== prog) sub.push(ph);
        if (at.cycle_anomaly === 'overrun') { sub.push('dauert länger als üblich'); tone = 'warn'; }
      } else if (s[3] === 'clean') {
        /* „Wäsche ist noch drin“ steht darunter mit „Ausgeräumt“ – hier nur seit wann. */
        if (stObj.last_changed) sub.push('seit ' + clock(new Date(stObj.last_changed)) + ' Uhr');
        tone = 'good';
      } else {
        var last = realCycles(d)[0];
        if (s[3] === 'done' && stObj.last_changed) sub.push(SF ? ago(new Date(stObj.last_changed)) : 'seit ' + clock(new Date(stObj.last_changed)) + ' Uhr');
        else if (last && last.end_time) sub.push('Zuletzt ' + ago(new Date(last.end_time)));
        tone = s[3] === 'done' ? 'good' : s[1] === 'bad' ? 'bad' : null;
      }
      if (doorOpen(c, states)) sub.push('Tür offen');
      return UI.hero({ value: value, unit: unit, sub: sub.join(' · ') || null, subTone: tone, center: true });
    }

    /* Laufender Durchgang: Fortschritt, Programm, Phase, Laufzeit (mit üblicher Dauer). */
    if (kind === 'run' || kind === 'prog') {
      if (!active) return '';
      var rows = [];
      var pct = pctOf(c, states);
      var remM = remOf(c, states);
      var el = elOf(c, states);
      var tot = c.source === 'washdata' ? mins(states, c.total) : null;
      var pr = progOf(c, states);
      var phn = phaseOf(c, states);
      var endTxt = remM != null ? 'Fertig gegen ' + clock(new Date(Date.now() + remM * 60000)) + ' Uhr' : null;
      if (pct == null && remM != null) rows.push({ icon: 'mdi:timer-sand', iconTone: 'accent', label: 'Restzeit', sub: endTxt, value: dur(remM) });
      rows.push({ icon: mIcon, iconTone: 'accent', label: 'Programm',
        value: pr || (c.source === 'washdata' ? 'Wird erkannt …' : '—') });
      if (phn) rows.push({ icon: c.dryer ? 'mdi:weather-windy' : 'mdi:water-sync', iconTone: 'accent', label: 'Phase', value: phn });
      if (el != null) rows.push({ icon: 'mdi:timer-outline', iconTone: 'accent', label: 'Läuft seit',
        sub: tot != null && tot > 0 ? 'Üblich sind ' + dur(tot) : null, value: dur(el) });
      if (pct != null) {
        if (SF) {
          var HH = window._casoraHH;
          return HH.label('Durchgang') + HH.bar({ pct: pct, text: Math.round(pct) + ' %', word: endTxt })
            + '<div style="height:8px"></div>' + UI.group(rows);
        }
        rows.unshift({ icon: 'mdi:progress-clock', iconTone: 'accent', label: 'Fortschritt', sub: endTxt,
          value: Math.round(pct) + ' %', bar: pct / 100, barTone: 'accent' });
      }
      return UI.group(rows, 'Durchgang');
    }

    /* Programm unbekannt, während es läuft: WashData fragen lassen, welches es ist. */
    if (kind === 'pick') {
      var sel = c.select && states[c.select];
      if (!active || !sel || progOf(c, states)) return '';
      var opts = ((sel.attributes || {}).options || []);
      if (opts.length < 2) return '';
      return (window._casoraHH ? window._casoraHH.sel : String)(window._casoraSelRows(UI.group(opts.map(function (o) {
        var on = sel.state === o;
        return { icon: o === 'auto_detect' ? 'mdi:auto-fix' : 'mdi:tshirt-crew-outline', iconTone: on ? 'accent' : DIM,
          label: progName(o),
          svc: on ? null : { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.select } } };
      }), 'Welches Programm läuft?'), progName(sel.state)));
    }

    /* Bedienen: Hersteller-Integration hält die Maschine an bzw. bricht ab; WashData nur die Erkennung. */
    if (kind === 'act') {
      var rowsA = [];
      var paused = s[3] === 'pause';
      if (c.official) {
        if (active && !paused && ok(states, c.pause)) rowsA.push({ icon: 'mdi:pause', iconTone: 'warn', label: 'Pausieren', svc: btn(c.pause) });
        if (paused && ok(states, c.resume)) rowsA.push({ icon: 'mdi:play', iconTone: 'good', label: 'Fortsetzen', svc: btn(c.resume) });
        if (active && ok(states, c.stop)) rowsA.push({ icon: 'mdi:stop', iconTone: 'bad', label: 'Programm abbrechen', svc: btn(c.stop), confirm: 'Abbrechen' });
      } else if (raw === 'user_paused' && ok(states, c.resume)) {
        rowsA.push({ icon: 'mdi:play', iconTone: 'good', label: 'Erkennung fortsetzen', sub: 'Die Erkennung ist angehalten', svc: btn(c.resume) });
      }
      return rowsA.length ? UI.group(rowsA) : '';
    }

    /* Fertig, aber die Wäsche ist noch drin (WashData „clean“): ein Tipp sagt, dass sie raus ist. */
    if (kind === 'unload') {
      if (s[3] !== 'clean') return '';
      var since = stObj.last_changed ? 'Wartet seit ' + dur((Date.now() - Date.parse(stObj.last_changed)) / 60000) : null;
      var canUnload = ok(states, c.unload);
      return UI.group([{ icon: 'mdi:basket-outline', iconTone: 'warn', label: c.dryer ? 'Wäsche ist noch im Trockner' : 'Wäsche ist noch drin',
        sub: canUnload ? since : [since, 'Wird beim Öffnen der Tür erkannt'].filter(Boolean),
        action: canUnload ? 'Ausgeräumt' : null, svc: canUnload ? btn(c.unload) : null }]);
    }

    /* Letzter Durchgang (gerade fertig): Programm, Dauer, Strom und Kosten. */
    if (kind === 'last') {
      if (active || (s[3] !== 'clean' && s[3] !== 'done')) return '';
      var lc = realCycles(d)[0];
      if (!lc) return '';
      var e1 = kwhOf(lc), t1 = new Date(lc.start_time);
      var rowsL = [{ icon: mIcon, iconTone: DIM, label: lc.profile_name || 'Unbekanntes Programm',
        sub: day(t1) + ', ' + clock(t1) + ' Uhr', value: dur((lc.duration || 0) / 60) }];
      if (e1 > 0) rowsL.push({ icon: 'mdi:lightning-bolt-outline', iconTone: DIM, label: 'Verbrauch', sub: c.price != null ? eur(e1 * c.price) : null, value: kwh(e1) });
      return UI.group(rowsL, 'Letzter Durchgang');
    }

    /* Hersteller-Integration ohne laufendes Programm: gewähltes Programm und Tür. */
    if (kind === 'dev') {
      if (!c.official) return '';
      var rowsD = [];
      if (!active) {
        var chosen = fmt(states, c.select) || progOf(c, states);
        if (chosen) rowsD.push({ icon: mIcon, iconTone: DIM, label: 'Programm', sub: 'An der Maschine gewählt', value: chosen });
      }
      if (c.door && states[c.door] && states[c.door].state !== 'unavailable') {
        var dop = doorOpen(c, states);
        rowsD.push({ icon: dop ? 'mdi:door-open' : 'mdi:door-closed', iconTone: dop ? 'warn' : DIM, label: 'Tür',
          value: dop ? 'Offen' : 'Geschlossen', valueTone: dop ? 'warn' : null });
      }
      return rowsD.length ? UI.group(rowsD, 'Gerät') : '';
    }

    /* Mehr: Erkennung (WashData) und Programm festlegen. */
    if (kind === 'ctrl') {
      var out = '';
      var pausedW = raw === 'paused' || raw === 'user_paused';
      var rowsC = [];
      if (!c.official) {
        if (active && !pausedW && ok(states, c.pause)) rowsC.push({ icon: 'mdi:pause', iconTone: 'warn', label: 'Erkennung anhalten',
          sub: 'Wenn die Maschine kurz unterbrochen wird', svc: btn(c.pause) });
        if (pausedW && raw !== 'user_paused' && ok(states, c.resume)) rowsC.push({ icon: 'mdi:play', iconTone: 'good', label: 'Erkennung fortsetzen', svc: btn(c.resume) });
        if (active && ok(states, c.force)) rowsC.push({ icon: 'mdi:flag-checkered', iconTone: 'bad', label: 'Als beendet markieren',
          sub: 'Falls das Ende nicht erkannt wird', svc: btn(c.force), confirm: 'Beenden' });
      }
      if (rowsC.length) out += UI.group(rowsC, 'Erkennung');
      var sel2 = c.select && states[c.select];
      /* Läuft ein unbekanntes Programm, steht die Liste schon oben (pick). */
      if (sel2 && c.source === 'washdata' && !(active && !progOf(c, states))) {
        var opts2 = (sel2.attributes && sel2.attributes.options) || [];
        if (opts2.length > 1) {
          if (out) out += '<div style="height:18px"></div>';
          out += (window._casoraHH ? window._casoraHH.sel : String)(window._casoraSelRows(UI.group(opts2.map(function (o) {
            var on = sel2.state === o;
            return { icon: o === 'auto_detect' ? 'mdi:auto-fix' : 'mdi:tshirt-crew-outline', iconTone: on ? 'accent' : DIM,
              label: progName(o),
              svc: on ? null : { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.select } } };
          }), active ? 'Programm festlegen' : 'Nächstes Programm'), progName(sel2.state)));
        }
      }
      return out;
    }

    /* WashData hat Einstellungen gelernt, die die Erkennung verbessern (Details in WashData). */
    if (kind === 'tips') {
      var n = num(states, c.suggest);
      if (!n || n < 1) return '';
      return UI.group([{ icon: 'mdi:lightbulb-on-outline', iconTone: 'accent', label: 'Erkennung verbessern',
        sub: (n === 1 ? '1 Einstellung' : Math.round(n) + ' Einstellungen') + ' empfohlen, in WashData übernehmen', entity: c.suggest }]);
    }

    if (kind === 'plug') {
      var rowsP = [];
      var sw = c.plug && states[c.plug];
      if (sw) {
        var on = sw.state === 'on';
        var dead = sw.state === 'unavailable';
        rowsP.push({ icon: 'mdi:power-plug', iconTone: on ? 'good' : DIM, label: 'Strom',
          sub: dead ? 'Steckdose nicht erreichbar' : (on && active ? (c.print ? 'Druck läuft gerade' : 'Maschine läuft gerade') : null),
          value: dead ? 'Offline' : on ? 'An' : 'Aus', valueTone: dead ? 'bad' : null,
          svc: dead ? null : { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: c.plug } },
          confirm: on ? (active ? 'Trotzdem aus' : 'Ausschalten') : null });
      }
      /* Weich (Entschlacken): nur die Schalter (Strom, Tastensperre), keine Messwerte. */
      var pw = SF ? null : num(states, c.power), v = SF ? null : num(states, c.volt), a = SF ? null : num(states, c.amp);
      if (pw != null) rowsP.push({ icon: 'mdi:flash', iconTone: pw > 5 ? 'good' : DIM, label: 'Leistung',
        value: f(pw, pw < 10 ? 1 : 0) + ' W', entity: c.power });
      if (v != null) rowsP.push({ icon: 'mdi:sine-wave', iconTone: DIM, label: 'Spannung', value: f(v, 0) + ' V', entity: c.volt });
      if (a != null) rowsP.push({ icon: 'mdi:current-ac', iconTone: DIM, label: 'Stromstärke', value: f(a, 2) + ' A', entity: c.amp });
      var lk = c.lock && states[c.lock];
      if (lk && lk.state !== 'unavailable') rowsP.push({ icon: 'mdi:lock-outline', iconTone: lk.state === 'on' ? 'accent' : DIM,
        label: 'Tastensperre', sub: 'Taste an der Steckdose', value: lk.state === 'on' ? 'An' : 'Aus',
        svc: { domain: 'switch', service: lk.state === 'on' ? 'turn_off' : 'turn_on', target: { entity_id: c.lock } } });
      if (SF) return rowsP.length ? UI.group(rowsP, 'Steckdose') : '';
      return rowsP.length ? L.wrap(UI.group(rowsP, 'Steckdose').replace(/data-casora-mi="/g, 'data-hp-metric="')) : '';
    }

    if (kind === 'energy') {
      /* Wäsche ohne Zähler: nichts (Geschirrspüler, Drucker, Sauger zeigen weiter „—“). */
      if (!c.energy && !c.dish && !c.print && !c.vac) return '';
      var rowsE = [];
      /* Weich (Entschlacken): ohne Diagramm-Umschaltung und ohne Zählerstand. */
      var row = function (lbl, icon, val, key) {
        rowsE.push({ icon: icon, iconTone: 'good', label: lbl, sub: val != null && c.price != null ? eur(val * c.price) : null,
          value: val != null ? kwh(val) : (d.ready ? '—' : '…'), entity: SF ? null : key });
      };
      row('Heute', 'mdi:calendar-today', d.day, 'hwd7:' + c.energy);
      row('Diese Woche', 'mdi:calendar-week', d.week, 'hwd7:' + c.energy);
      row('Dieser Monat', 'mdi:calendar-month-outline', d.month, 'hwd30:' + c.energy);
      var tot2 = SF ? null : num(states, c.energy);
      if (tot2 != null) rowsE.push({ icon: 'mdi:counter', iconTone: DIM, label: 'Zählerstand', value: kwh(tot2) });
      if (SF) return UI.group(rowsE, 'Verbrauch');
      return L.wrap(UI.group(rowsE, 'Verbrauch').replace(/data-casora-mi="/g, 'data-hp-metric="'));
    }

    if (kind === 'stats') {
      var cy = realCycles(d);
      var rowsS = [];
      var cnt = num(states, c.count);
      if (cnt != null) rowsS.push({ icon: 'mdi:counter', iconTone: 'accent', label: 'Durchgänge insgesamt', value: String(Math.round(cnt)) });
      if (cy.length) {
        var withE = cy.filter(function (x) { return kwhOf(x) > 0; });
        var eAvg = withE.length ? withE.reduce(function (t, x) { return t + kwhOf(x); }, 0) / withE.length : 0;
        var dAvg = cy.reduce(function (t, x) { return t + (x.duration || 0); }, 0) / cy.length / 60;
        if (eAvg > 0) rowsS.push({ icon: 'mdi:lightning-bolt-outline', iconTone: 'accent', label: 'Ø pro Durchgang', sub: c.price != null ? eur(eAvg * c.price) : null, value: kwh(eAvg) });
        rowsS.push({ icon: 'mdi:timer-sand', iconTone: 'accent', label: 'Ø Dauer', value: dur(dAvg) });
        var since30 = Date.now() - 30 * 86400000;
        var n30 = cy.filter(function (x) { return new Date(x.start_time).getTime() > since30; }).length;
        rowsS.push({ icon: 'mdi:calendar-range', iconTone: 'accent', label: 'Letzte 30 Tage', value: n30 + (n30 === 1 ? ' Durchgang' : ' Durchgänge') });
      }
      return rowsS.length ? UI.group(rowsS, 'Statistik') : '';
    }

    /* Deine Programme: wie oft, wie lange und wie viel Strom (aus den gelernten Durchgängen). */
    if (kind === 'progs') {
      var pl = programs(d).slice(0, SF ? 4 : 6);
      if (!pl.length) return '';
      return UI.group(pl.map(function (p) {
        var avgE = p.en ? p.e / p.en : 0;
        return { icon: 'mdi:tshirt-crew-outline', iconTone: DIM, label: p.name,
          sub: 'Ø ' + dur(p.dur / p.n / 60) + (avgE > 0 ? ' · ' + kwh(avgE) : ''),
          value: p.n + '×' };
      }), 'Programme');
    }

    if (kind === 'cycles') {
      var list = realCycles(d).slice(0, SF ? 3 : 5);
      if (!list.length) return d.ready || !c.entry ? '' : UI.group([{ icon: 'mdi:history', iconTone: DIM, label: 'Wird geladen …' }], 'Letzte Durchgänge');
      return UI.group(list.map(function (x) {
        var t = new Date(x.start_time);
        var e = kwhOf(x);
        var guess = !x.profile_name && x.match_ranking_top5 && x.match_ranking_top5[0] && x.match_ranking_top5[0].name;
        var bad = x.status === 'interrupted';
        return { icon: mIcon, iconTone: bad ? 'warn' : DIM,
          label: x.profile_name || (guess ? guess + ' ?' : 'Unbekanntes Programm'),
          sub: day(t) + ', ' + clock(t) + ' · ' + (bad ? 'Unterbrochen' : dur((x.duration || 0) / 60)),
          value: e > 0 ? kwh(e) : null };
      }), 'Letzte Durchgänge');
    }

    if (kind === 'maint' || kind === 'maint_due' || kind === 'maint_rest') {
      var ml = d.maint;
      if (!ml || !c.entry) return '';
      var due = ml.due || [];
      var rem2 = ml.reminders || {};
      var since2 = ml.cycles_since || {};
      /* Trockner: nur Filter/Kondensator (Entkalken, Trommelreinigung gibt es dort nicht) */
      var keys = Object.keys(rem2).filter(function (k) { return rem2[k] > 0 && MAINT[k] && (!c.dryer || k === 'filter_clean'); });
      /* Weich (Entschlacken): fällige Pflege sichtbar (maint_due), der Rest unter „Mehr“ (maint_rest). */
      if (kind !== 'maint') keys = keys.filter(function (k) {
        var dk = due.indexOf(k) !== -1 || (since2[k] || 0) >= rem2[k];
        return kind === 'maint_due' ? dk : !dk;
      });
      if (!keys.length) return '';
      L._cfg[c.st] = c;
      var rowsM = keys.map(function (k) {
        var every = rem2[k], done = since2[k] || 0;
        var isDue = due.indexOf(k) !== -1 || done >= every;
        var lbl = k === 'filter_clean' && c.dryer ? 'Filter & Kondensator reinigen' : MAINT[k][0];
        return { icon: MAINT[k][1], iconTone: isDue ? 'warn' : DIM, label: lbl,
          sub: isDue ? 'Fällig · ' + done + ' Durchgänge seit dem letzten Mal' : 'In ' + (every - done) + ' Durchgängen fällig',
          bar: Math.min(1, done / every), barTone: isDue ? 'warn' : 'good', value: 'HWMAINT' + k + 'X' };
      });
      /* „Erledigt“-Knopf an die Stelle des Werts (zweistufig, siehe L.tap) */
      var html = UI.group(rowsM, kind === 'maint_due' ? 'Pflege fällig' : 'Pflege');
      keys.forEach(function (k) {
        html = html.replace('HWMAINT' + k + 'X', '<span class="hw-done" data-hw-maint="' + esc(c.entry + '|' + k + '|' + c.st) + '">Erledigt</span>');
      });
      return L.wrap(html);
    }
    return '';
  };

  /* Fällige Pflege laut WashData (Attribut maintenance_due am Zustand); Trockner nur Filter/Kondensator. */
  L.due = function (entity, V, states) {
    var st = (V && V.appliance_state) || (entity && entity.entity_id);
    var dryer = !!(V && V.device_type === 'dryer');
    var list = ((states[st] && states[st].attributes) || {}).maintenance_due;
    if (!Array.isArray(list)) return [];
    return list.filter(function (k) { return MAINT[k] && (!dryer || k === 'filter_clean'); })
      .map(function (k) { return k === 'filter_clean' && dryer ? 'Filter reinigen' : MAINT[k][0]; });
  };
  L.dueTile = function (entity, V, states) {
    var st = (V && V.appliance_state) || (entity && entity.entity_id);
    return !L.state(states, st)[2] && L.due(entity, V, states).length > 0;
  };

  /* ── Kachel: Status, Wäsche noch drin, im Ruhezustand ggf. fällige Pflege ── */
  L.tile = function (entity, V, states) {
    var st = (V && V.appliance_state) || (entity && entity.entity_id);
    var s = L.state(states, st);
    if (s[3] === 'clean') return 'Fertig · Wäsche drin';
    if (!s[2]) {
      var due = L.due(entity, V, states);
      return due.length ? s[0] + ' · ' + due[0] + ' fällig' + (due.length > 1 ? ' +' + (due.length - 1) : '') : s[0];
    }
    // Keine Restzeit in der Kachel (23.09.) – die steht im Popup.
    return s[0];
  };
  /* Kachel hervorheben: läuft, pausiert, wartet auf Start – oder Wäsche noch drin.
     Sprachunabhängig über L.state, damit auch Home Connect („run“) und Miele („in_use“) leuchten. */
  L.tileActive = function (entity, V, states) {
    var st = (V && V.appliance_state) || (entity && entity.entity_id);
    if (!st || !states[st]) return null;
    var s = L.state(states, st);
    return s[2] || s[3] === 'clean';
  };

  /* ── Popup ── */
  L.popup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !entity) return { type: 'vertical-stack', cards: [] };
    var c = L.resolve(entity, variables, states, hass);
    L._cfg[c.st] = c;
    var d0 = L.data[c.st];
    L.fetch(c, hass, !d0 || !d0.ts || Date.now() - d0.ts > 10000);
    var _c = JSON.stringify(c);
    var watch = L.watch(c);
    var fields = {}, fstyle = {};
    var add = function (k, v) { fields[k] = v; fstyle[k] = [{ 'justify-self': 'stretch' }]; };
    var tpl = function (kind, async) {
      return '[[[ const c = ' + _c + '; return window._casoraLaundry ? window._casoraLaundry.' + (async ? 'slot' : 'inner')
        + "('" + kind + "', c, states) : ''; ]]]";
    };
    L.slot = function (kind, cc, st) { return slot(kind, cc, st); };
    var WD = c.source === 'washdata' || !!c.entry;

    add('hero', tpl('hero', true));

    /* Verlauf: Leistung (4 h beim Laufen, sonst 24 h); Zeilen schalten auf Spannung/Strom bzw. Tagesverbrauch um. */
    var hpOk = typeof window._hpChartCfg === 'function';
    var active = L.state(states, c.st)[2];
    if (hpOk && c.power) {
      window._hpChartCfg(c.power, 'Leistung', active ? '4h' : '24h', c.color, 150);
      if (c.volt) window._hpChartCfg(c.volt, 'Spannung', '24h', '#8E8E93', 150);
      if (c.amp) window._hpChartCfg(c.amp, 'Stromstärke', active ? '4h' : '24h', '#0A84FF', 150);
      if (c.energy) {
        var LBL = { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px', fontFamily: 'var(--primary-font-family, system-ui)' };
        [['hwd7:', '7d', 'ddd'], ['hwd30:', '30d', 'dd.']].forEach(function (x) {
          var key = x[0] + c.energy;
          window._hpPlantMeta[key] = ['Verbrauch pro Tag', x[1], '#30D158'];
          window._hpPlantCfg[key] = {
            type: 'custom:apexcharts-card', graph_span: x[1], span: { end: 'day' }, header: { show: false },
            yaxis: [{ show: true, decimals: 1, apex_config: { tickAmount: 2, forceNiceScale: true, floating: true,
              labels: { offsetX: 4, offsetY: -8, align: 'left', style: LBL } } }],
            series: [{ entity: c.energy, name: 'Verbrauch', color: '#30D158', type: 'column', unit: 'kWh',
                       statistics: { type: 'change', period: 'day', align: 'start' } }],
            apex_config: {
              chart: { height: 150, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
              theme: { mode: 'dark' }, dataLabels: { enabled: false }, legend: { show: false },
              plotOptions: { bar: { borderRadius: 4, columnWidth: x[1] === '7d' ? '50%' : '70%' } },
              grid: { show: true, borderColor: 'var(--casora-chart-grid, rgba(255,255,255,0.10))', xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } },
                      padding: { left: 0, right: 0, top: -6, bottom: -4 } },
              xaxis: { labels: { datetimeUTC: false, format: x[2], hideOverlappingLabels: true, rotate: 0, style: LBL },
                       axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
              tooltip: { theme: 'dark', x: { format: 'dd.MM.' } },
            },
          };
        });
      }
      var plate = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
        + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
        + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);padding:14px 10px 6px;';
      add('chart', window._casoraHH && window._casoraHH.on()
        ? window._casoraHH.chart(window._hpChartTitle(c.power), plate.replace('padding:14px 10px 6px;', ''))
        : '<div style="' + plate + '">'
        + '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);font-size:15px;font-weight:600;'
        + 'letter-spacing:-0.01em;color:var(--casora-popup-tiles-text-primary,#fff);text-align:left;padding:0 6px;">'
        + window._hpChartTitle(c.power) + '</div>'
        + '<div class="hp-chart-slot" style="min-height:150px;margin:6px 0 0;"></div></div>');
      if (typeof window._hpChartInit === 'function') window._hpChartInit(c.power);
    }

    add('unload', tpl('unload', false));
    add('run', tpl('run', false));
    add('pick', tpl('pick', false));
    add('act', tpl('act', false));
    add('dev', tpl('dev', false));
    add('ctrl', tpl('ctrl', false));
    add('plug', tpl('plug', false));
    add('energy', tpl('energy', true));
    if (WD) {
      add('last', tpl('last', true));
      add('stats', tpl('stats', true));
      add('progs', tpl('progs', true));
      add('cycles', tpl('cycles', true));
      add('maint', tpl('maint', true));
    }

    /* Weich (03.10.2026): Kopf mit Restzeit. Läuft etwas: links Durchgang (Fortschritt, Programm,
       Phase, Laufzeit), ggf. „Welches Programm läuft?“ und Pause/Abbrechen; rechts letzte Durchgänge
       und fällige Pflege. Fertig mit Wäsche drin: oben links „Ausgeräumt“. Sonst links die letzten
       Durchgänge, rechts die eigenen Programme. Unter „Mehr“: Erkennung und Programm festlegen,
       Programme, Statistik, Verbrauch, übrige Pflege, Empfehlungen, Steckdose. Kein Diagramm. */
    if (window._casoraHH && window._casoraHH.on() && window._casoraHH.layout) {
      var HH = window._casoraHH;
      /* Fällige Pflege nur, wenn WashData sie meldet (maintenance_due). Schon beim Aufbau geprüft,
         damit eine leere Spalte nicht „Mehr“ allein nach rechts oben stellt (B-11). */
      var _dueNow = WD && !!L.due({ entity_id: c.st }, { appliance_state: c.st, device_type: c.dryer ? 'dryer' : null }, states).length;
      var f2 = { hero: fields.hero, unload: fields.unload, run: fields.run, pick: fields.pick, act: fields.act, dev: fields.dev,
        cycles: fields.cycles, progs: fields.progs,
        maint: _dueNow ? '[[[ const c = ' + _c + '; const L = window._casoraLaundry; return L && L.due({ entity_id: c.st }, { appliance_state: c.st, device_type: c.dryer ? "dryer" : null }, states).length'
          + " ? L.slot('maint_due', c, states) : ''; ]]]" : undefined };
      var run0 = L.state(states, c.st)[2];
      var moreKeys = WD ? ['ctrl'].concat(run0 ? ['progs'] : []).concat(['stats', 'energy', 'maint_rest', 'tips', 'plug']) : ['energy', 'plug'];
      f2.more = HH.moreCard(watch, 'const c = ' + _c + ';\nconst L = window._casoraLaundry, H = window._casoraHH;\n'
        + 'return L && H ? H.more("laundry", ' + JSON.stringify(moreKeys) + '.map(function (k) {'
        + ' return (k === "ctrl" || k === "plug" || k === "tips") ? L.inner(k, c, states) : L.slot(k, c, states); })) : "";', c.st);
      var left, right;
      if (!WD) { left = ['run', 'act', 'dev']; right = ['more']; }
      else if (run0) { left = ['unload', 'run', 'pick', 'act']; right = ['cycles', 'maint', 'more']; }
      else { left = ['unload', 'act', 'cycles']; right = ['progs', 'maint', 'more']; }
      return HH.layout({ entity: c.st, watch: watch, fields: f2, left: left, right: right });
    }

    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = fields[k]; cs[k] = fstyle[k]; });
      return {
        type: 'custom:button-card', entity: c.st, triggers_update: watch, tap_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle },
        extra_styles: window._casoraColGap(keys),
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
                 { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    /* Links: was gerade passiert + Bedienen; rechts: Verbrauch und Verlauf. */
    var L0 = ['unload', 'run', 'pick', 'act', 'last', 'dev', 'ctrl', 'plug'].filter(function (k) { return fields[k] !== undefined; });
    var R0 = ['energy', 'progs', 'stats', 'cycles', 'maint'].filter(function (k) { return fields[k] !== undefined; });
    var _sp = window._casoraSplit ? window._casoraSplit('laundry', L0, R0) : { left: L0, right: R0 };
    var leftKeys = _sp.left;
    var rightKeys = _sp.right;
    var top = {}, topStyle = {}, topAreas = [];
    ['hero', 'chart'].forEach(function (k) { if (fields[k] !== undefined) { top[k] = fields[k]; topStyle[k] = fstyle[k]; topAreas.push(k); } });
    /* Die Hero-Zeile muss live bleiben: eigene Unterkarte mit triggers_update. */
    top.hero = { card: makeCol(['hero']) };
    top.left = { card: makeCol(leftKeys) }; topStyle.left = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    top.right = { card: makeCol(rightKeys) }; topStyle.right = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    var narrow = topAreas.concat(['left', 'right']).map(function (k) { return '"' + k + '"'; }).join(' ');
    var wide = topAreas.map(function (k) { return '"' + k + ' ' + k + '"'; }).join(' ') + ' "left right"';

    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }',
      'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
      'ha-card.disabled { pointer-events: auto !important; }',
    ].join('\n');

    return {
      type: 'custom:button-card', entity: c.st, triggers_update: [],
      card_mod: { style: wrapperStyle },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: ' + wide + ' !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, 20px) !important; } }',
      tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': narrow }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: topStyle,
      },
      custom_fields: top,
    };
  };
  /* Beim Re-Render der Spalten regelmäßig nachladen (Durchgang fertig → Liste/Statistik aktualisieren). */
  var _inner = L.inner;
  L.inner = function (kind, c, states) {
    if (kind === 'hero') {
      var hass = HASS();
      if (hass) L.fetch(c, hass, false);
    }
    return _inner(kind, c, states);
  };
  L.slot = function (kind, c, states) { return slot(kind, c, states); };
  L.util = { esc: esc, num: num, str: str, f: f, kwh: kwh, eur: eur, dur: dur, clock: clock, day: day, ago: ago, find: find, DIM: DIM,
    mins: mins, fmt: fmt };
})();


// ── Geschirrspüler (casora_dishwasher: Home Connect + Zwischenstecker) ─────────
// Nutzt die Bausteine von window._casoraLaundry (Verbrauch, Steckdose, Nachladen).
(function () {
  if (window._casoraDish || !window._casoraLaundry) return;
  var L = window._casoraLaundry;
  var U = L.util;
  var D = window._casoraDish = {};
  var DIM = U.DIM;

  var PROG = {
    favorite_001: ['Favorit', 'mdi:star-outline'], dishcare_dishwasher_program_auto2: ['Auto 45–65°', 'mdi:auto-fix'],
    dishcare_dishwasher_program_eco50: ['Eco 50°', 'mdi:leaf'], dishcare_dishwasher_program_intensiv70: ['Intensiv 70°', 'mdi:fire'],
    dishcare_dishwasher_program_machinecare: ['Maschinenpflege', 'mdi:spray-bottle'], dishcare_dishwasher_program_prerinse: ['Vorspülen', 'mdi:water-outline'],
    dishcare_dishwasher_program_quick45: ['Schnell 45°', 'mdi:clock-fast'], dishcare_dishwasher_program_quick65: ['Schnell 65°', 'mdi:clock-fast'],
  };
  var PHASE = { prerinse: 'Vorspülen', mainwash: 'Hauptspülen', finalrinse: 'Klarspülen', drying: 'Trocknen' };
  var LEVEL = { full: ['Voll', null, 1], nearly_empty: ['Fast leer', 'warn', 0.25], empty: ['Leer', 'bad', 0] };
  var REMOTE = { monitoring: 'Nur Anzeige', manualremotestart: 'Einmalig erlaubt', permanentremotestart: 'Immer erlaubt' };
  var PROBLEMS = [
    [/_aquastop_aufgetreten$/, 'AquaStop ausgelöst', 'mdi:water-alert', 'binary_sensor_aqua_stop'],
    [/_ablaufpumpe_blockiert$/, 'Ablaufpumpe blockiert', 'mdi:pump-off', 'binary_sensor_drainpumpblocked'],
    [/_abpumpen_nicht_moglich$/, 'Abpumpen nicht möglich', 'mdi:pump-off', 'binary_sensor_drainingnotpossible'],
    [/_niedriger_wasserdruck$/, 'Niedriger Wasserdruck', 'mdi:water-minus', 'binary_sensor_low_water_pressure'],
    [/_wasserheizung_verkalkt$/, 'Wasserheizung verkalkt', 'mdi:water-boiler-alert', 'binary_sensor_waterheatercalcified'],
    [/_programm_abgebrochen$/, 'Programm abgebrochen', 'mdi:cancel', 'binary_sensor_program_aborted'],
  ];
  var progName = function (p) { return p ? (PROG[p] ? PROG[p][0] : p) : null; };
  var minutes = function (states, e) {
    var n = U.num(states, e);
    if (n == null) return null;
    var u = ((states[e] || {}).attributes || {}).unit_of_measurement;
    return u === 'h' ? n * 60 : u === 's' ? n / 60 : n;
  };

  D.resolve = function (entity, V, states, hass) {
    V = V || {};
    var reg = (hass && hass.entities) || {};
    var st = V.appliance_state || (entity && entity.entity_id);
    var devOf = function (eid) { return reg[eid] && reg[eid].device_id; };
    // Nachbar-Entität auf demselben Gerät: zuerst über den sprachunabhängigen
    // translation_key der Integration, sonst über die (deutsche) Namensendung.
    var sib = function (eid, re, dom, unit, key) {
      var dev = devOf(eid);
      if (!dev) return null;
      var hit = null;
      if (key) {
        Object.keys(reg).forEach(function (k) {
          var e = reg[k];
          if (hit || e.device_id !== dev || !states[e.entity_id] || e.translation_key !== key) return;
          if (dom && e.entity_id.indexOf(dom + '.') !== 0) return;
          hit = e.entity_id;
        });
        if (hit) return hit;
      }
      Object.keys(reg).forEach(function (k) {
        var e = reg[k];
        if (hit || e.device_id !== dev || !states[e.entity_id]) return;
        if (dom && e.entity_id.indexOf(dom + '.') !== 0) return;
        if (e.platform === 'powercalc') return;
        if (re && !re.test(e.entity_id)) return;
        if (unit && (states[e.entity_id].attributes || {}).unit_of_measurement !== unit) return;
        hit = e.entity_id;
      });
      return hit;
    };
    var CD = window.casoraDevice;
    var plugF = (!V.plug_entity && CD) ? (CD.companionPlug(hass, st) || {}) : {};
    var plug = V.plug_entity || plugF.switch || null;
    var probs = [];
    PROBLEMS.forEach(function (p) { var id = sib(st, p[0], 'binary_sensor', null, p[3]); if (id) probs.push([id, p[1], p[2]]); });
    return {
      st: st, dish: true, name: V.room_name || 'Geschirrspüler', entry: null, dryer: false,
      price: window.casoraPriceKwh ? window.casoraPriceKwh(V.price_kwh) : null, color: V.chart_color || '#00C3D0',
      program: V.entity_program || sib(st, /_aktives_programm$/, 'sensor', null, 'sensor_active_program'),
      sel: sib(st, /_ausgewahltes_programm$/, 'select', null, 'select_program'),
      phase: V.entity_phase || sib(st, /_programmphase$/, 'sensor', null, 'sensor_program_phase'),
      progress: V.appliance_progress || sib(st, /_programmfortschritt$/, 'sensor', null, 'sensor_program_progress'),
      remaining: V.appliance_remaining || sib(st, /_verbleibende_programmlaufzeit$/, 'sensor', null, 'sensor_remaining_program_time'),
      energyEst: V.entity_energy_est || sib(st, /_energieverbrauch_schatzung$/, 'sensor', null, 'sensor_energy_forecast'),
      waterEst: V.entity_water_est || sib(st, /_wasserverbrauch_schatzung$/, 'sensor', null, 'sensor_water_forecast'),
      salt: V.entity_salt || sib(st, /_salz$/, 'sensor', null, 'sensor_salt'),
      rinse: V.entity_rinse_aid || sib(st, /_klarspuler$/, 'sensor', null, 'sensor_rinse_aid'),
      door: V.entity_door || sib(st, /_tur$/, 'binary_sensor', null, 'binary_sensor_door_state'),
      care: sib(st, /_maschinenpflege_erinnerung$/, 'sensor', null, 'sensor_machine_care_reminder'),
      starts: sib(st, /_startanzahl$/, 'sensor', null, 'sensor_count_started'),
      conn: sib(st, /_verbindung$/, 'binary_sensor', null, 'connection'),
      remote: sib(st, /_fernbedienung$/, 'select', null, 'select_remote_control_level'),
      startIn: sib(st, /_start_in$/, 'number', null, 'number_start_in'),
      power_sw: sib(st, /_einschalter$/, 'switch', null, 'switch_power_state'),
      light: sib(st, /_info_licht$/, 'switch', null, 'switch_info_light'),
      smartFilter: sib(st, /_smarte_filterreinigung$/, 'binary_sensor', null, 'binary_sensor_smartfiltercleaningreminder'),
      filterCheck: V.entity_filter || sib(st, /_filtersystem_prufen$/, 'binary_sensor', null, 'binary_sensor_checkfiltersystem'),
      machineCare: sib(st, /_maschinenreinigung$/, 'binary_sensor', null, 'binary_sensor_machinecarereminder'),
      machineFilter: sib(st, /_maschinenreinigung_filter$/, 'binary_sensor', null, 'binary_sensor_machinecareandfiltercleaningreminder'),
      probs: probs,
      opts: [[V.sw_extra_dry || sib(st, /_extra_trocken$/, 'switch', null, 'switch_extra_dry'), 'Extra Trocken', 'mdi:weather-sunny'],
             [V.sw_half_load || sib(st, /_halbe_ladung$/, 'switch', null, 'switch_half_load'), 'Halbe Ladung', 'mdi:circle-half-full'],
             [V.sw_speed || sib(st, /_speed_on_demand$/, 'switch', null, 'switch_speed_on_demand'), 'Schneller fertig', 'mdi:clock-fast'],
             [V.sw_silence || sib(st, /_silence_on_demand$/, 'switch', null, 'switch_silence_on_demand'), 'Leiser', 'mdi:volume-low']].filter(function (o) { return o[0]; }),
      start: V.btn_start || sib(st, /_start$/, 'button', null, 'button_start_program'),
      stop: V.btn_stop || sib(st, /_abbrechen$/, 'button', null, 'button_abort_program'),
      plug: plug,
      power: plug ? sib(plug, null, 'sensor', 'W') : V.entity_power || null,
      volt: plug ? sib(plug, null, 'sensor', 'V') : null,
      amp: plug ? sib(plug, null, 'sensor', 'A') : null,
      energy: (plug && sib(plug, null, 'sensor', 'kWh')) || V.entity_energy || null,
      lock: null,
    };
  };
  D.watch = function (c) {
    return [c.st, c.program, c.sel, c.phase, c.progress, c.remaining, c.energyEst, c.waterEst, c.salt, c.rinse, c.door, c.care, c.starts,
      c.conn, c.remote, c.startIn, c.power_sw, c.light, c.smartFilter, c.filterCheck, c.machineCare, c.machineFilter,
      c.start, c.stop, c.plug, c.power, c.volt, c.amp, c.energy]
      .concat(c.probs.map(function (p) { return p[0]; }), c.opts.map(function (o) { return o[0]; })).filter(Boolean);
  };

  /* Was nachgefüllt / gepflegt werden muss (für Kachel und Popup) */
  D.todo = function (c, states) {
    var out = [];
    var on = function (e) { return e && states[e] && states[e].state === 'on'; };
    c.probs.forEach(function (p) { if (on(p[0])) out.push([p[1], 'bad']); });
    var lv = function (e, what) { var s = e && states[e] && states[e].state; if (s === 'empty' || s === 'nearly_empty') out.push([what + ' nachfüllen', s === 'empty' ? 'bad' : 'warn']); };
    lv(c.salt, 'Salz');
    lv(c.rinse, 'Klarspüler');
    if (on(c.smartFilter) || on(c.filterCheck)) out.push(['Filter reinigen', 'warn']);
    if (on(c.machineCare) || on(c.machineFilter) || U.num(states, c.care) === 0) out.push(['Maschinenpflege fällig', 'warn']);
    return out;
  };

  /* Letzter Lauf: Verbrauch aus der Statistik des Zwischensteckers (Start/Ende aus der Startanzahl) */
  D.fetchLast = function (c, hass) {
    var a = (c.starts && hass.states[c.starts] && hass.states[c.starts].attributes) || {};
    var s0 = a['Last Start'], s1 = a['Last End'];
    var d = L.data[c.st] || (L.data[c.st] = {});
    if (!c.energy || !s0 || !s1 || d.lastKey === s0 + s1 || typeof hass.callWS !== 'function') return;
    d.lastKey = s0 + s1;
    hass.callWS({ type: 'recorder/statistic_during_period', statistic_id: c.energy,
      fixed_period: { start_time: s0, end_time: s1 }, types: ['change'] })
      .then(function (r) { d.lastKwh = r && r.change != null ? r.change : null; L.paint(c); })
      .catch(function () {});
  };

  D.inner = function (kind, c, states) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var s = L.state(states, c.st);
    var active = s[2];
    var raw = String((states[c.st] || {}).state || '');
    var d = L.data[c.st] || {};
    var rem = minutes(states, c.remaining);
    var doorOpen = c.door && states[c.door] && states[c.door].state === 'on';

    if (kind === 'd_hero') {
      var prog = progName(U.str(states, c.program)) || progName(U.str(states, c.sel));
      var ph = PHASE[U.str(states, c.phase)] || null;
      var sub = [], value = s[0], unit = null, tone = s[1];
      if (active && rem != null && rem > 0) {
        var h = Math.floor(rem / 60), m = Math.round(rem % 60);
        value = h ? h + ':' + (m < 10 ? '0' : '') + m : String(m);
        unit = h ? 'Std. übrig' : 'Min. übrig';
        sub.push(ph || s[0]);
        if (prog) sub.push(prog);
      } else if (active) {
        if (ph) sub.push(ph);
        if (prog) sub.push(prog);
      } else if (raw === 'finished') {
        var lc = (states[c.st] || {}).last_changed;
        if (lc) sub.push('seit ' + U.clock(new Date(lc)) + ' Uhr');
        tone = 'good';
      } else {
        if (prog) sub.push(prog + (rem ? ' · ca. ' + U.dur(rem) : ''));
        tone = null;
      }
      if (doorOpen) sub.push('Tür offen');
      var todo = D.todo(c, states);
      if (!active && todo.length) { sub.push(todo.map(function (t) { return t[0]; }).join(', ')); tone = todo.some(function (t) { return t[1] === 'bad'; }) ? 'bad' : 'warn'; }
      return UI.hero({ value: value, unit: unit, sub: sub.join(' · ') || null, subTone: tone, center: true });
    }

    if (kind === 'd_run') {
      if (!active) return '';
      var rows = [];
      var pct = U.num(states, c.progress);
      if (pct != null) rows.push({ icon: 'mdi:progress-clock', iconTone: 'accent', label: 'Fortschritt',
        sub: rem != null && rem > 0 ? 'Fertig gegen ' + U.clock(new Date(Date.now() + rem * 60000)) + ' Uhr' : null,
        value: Math.round(pct) + ' %', bar: Math.max(0, Math.min(1, pct / 100)), barTone: 'accent' });
      var phn = PHASE[U.str(states, c.phase)];
      if (phn) rows.push({ icon: 'mdi:water-sync', iconTone: 'accent', label: 'Phase', value: phn });
      var pr = U.str(states, c.program);
      rows.push({ icon: (PROG[pr] || [0, 'mdi:dishwasher'])[1], iconTone: 'accent', label: 'Programm', value: progName(pr) || '—' });
      [[c.energyEst, 'Energiebedarf', 'mdi:lightning-bolt-outline'], [c.waterEst, 'Wasserbedarf', 'mdi:water-outline']].forEach(function (x) {
        var n = U.num(states, x[0]);
        if (n != null) rows.push({ icon: x[2], iconTone: 'accent', label: x[1], sub: 'Prognose für dieses Programm', value: Math.round(n) + ' %', bar: n / 100, barTone: 'good' });
      });
      if (c.stop && states[c.stop] && states[c.stop].state !== 'unavailable') rows.push({ icon: 'mdi:stop', iconTone: 'bad', label: 'Programm abbrechen',
        svc: { domain: 'button', service: 'press', target: { entity_id: c.stop } }, confirm: 'Abbrechen' });
      /* Weich: Fortschritt als breiter Balken über den Zeilen. */
      if (pct != null && window._casoraHH && window._casoraHH.on()) {
        var HH = window._casoraHH;
        return HH.label('Durchgang') + HH.bar({ pct: pct, text: Math.round(pct) + ' %', word: rows[0].sub })
          + '<div style="height:8px"></div>' + UI.group(rows.slice(1));
      }
      return UI.group(rows, 'Durchgang');
    }

    if (kind === 'd_prog' || kind === 'd_start') {
      if (active) return '';
      var out = '';
      /* Runde 2 (Spaltenbalance): Im Weich-Layout steht die Programmliste links allein, Startzeit
         und Start kommen als eigener Block „d_start“ in die rechte, sonst fast leere Spalte. */
      var splitStart = !!(window._casoraHH && window._casoraHH.on());
      var sel = (kind === 'd_start') ? null : c.sel && states[c.sel];
      if (kind === 'd_prog' && splitStart) {
        if (!sel) return '';
        return (window._casoraHH ? window._casoraHH.sel : String)(window._casoraSelRows(UI.group(((sel.attributes || {}).options || []).map(function (o) {
          var on = sel.state === o;
          return { icon: (PROG[o] || [0, 'mdi:dishwasher'])[1], iconTone: on ? 'accent' : DIM, label: progName(o),
            svc: on ? null : { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.sel } } };
        }), 'Programm'), progName(sel.state)));
      }
      if (sel) {
        out += (window._casoraHH ? window._casoraHH.sel : String)(window._casoraSelRows(UI.group(((sel.attributes || {}).options || []).map(function (o) {
          var on = sel.state === o;
          return { icon: (PROG[o] || [0, 'mdi:dishwasher'])[1], iconTone: on ? 'accent' : DIM, label: progName(o),
            svc: on ? null : { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.sel } } };
        }), 'Programm'), progName(sel.state)));
      }
      var remote = c.remote && states[c.remote] ? states[c.remote].state : null;
      var startOk = c.start && states[c.start] && states[c.start].state !== 'unavailable';
      var delay = U.num(states, c.startIn) || 0;
      if (c.startIn && states[c.startIn]) {
        var set = function (h) { return { domain: 'number', service: 'set_value', data: { value: h * 3600 }, target: { entity_id: c.startIn } }; };
        /* Wie Saugroboter „Reinigungsmodus“ (25.09.): Tasten in einer Karte statt lose in der Luft. */
        var segS = UI.segments([0, 1, 2, 3, 4, 6].map(function (h) {
          return { label: h ? h + ' Std.' : 'Sofort', active: Math.round(delay / 3600) === h, svc: set(h) };
        }));
        /* Weich: Etikett + Segmente frei, ohne eigene Karte (wie Lichtfarbe im Licht-Popup). */
        if (window._casoraHH && window._casoraHH.on()) out += (out ? '<div style="height:18px"></div>' : '') + window._casoraHH.label('Startzeit') + window._casoraHH.dense(segS);
        else out += '<div style="height:18px"></div>'
          + '<div style="font-family:var(--primary-font-family, system-ui);font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);'
          + 'color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary, #fff));text-align:left;padding:0 4px 8px;">Startzeit</div>'
          + '<style>.hd-card .hui-seg{justify-content:flex-start;}</style>'
          + '<div class="hd-card" style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
          + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
          + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);padding:14px;">'
          + segS + '</div>';
      }
      if (startOk) {
        var why = remote === 'monitoring' ? 'Fernstart am Gerät nicht erlaubt' : doorOpen ? 'Tür ist offen' : null;
        var sp = progName(U.str(states, c.sel));
        out += (out ? '<div style="height:18px"></div>' : '') + UI.group([{ icon: 'mdi:play', iconTone: why ? DIM : 'good', label: delay ? 'Zeitversetzt starten' : 'Jetzt starten',
          sub: why || [sp, delay ? 'startet in ' + U.dur(delay / 60) : null].filter(Boolean).join(' · '),
          svc: why ? null : { domain: 'button', service: 'press', target: { entity_id: c.start } }, confirm: why ? null : 'Starten' }], null);
      }
      return out;
    }

    if (kind === 'd_opts') {
      var ro = c.opts.filter(function (o) { return states[o[0]] && states[o[0]].state !== 'unavailable'; }).map(function (o) {
        var on = states[o[0]].state === 'on';
        return { icon: o[2], iconTone: on ? 'accent' : DIM, label: o[1], value: on ? 'An' : 'Aus',
          svc: { domain: 'switch', service: on ? 'turn_off' : 'turn_on', target: { entity_id: o[0] } } };
      });
      return ro.length ? UI.group(ro, 'Optionen') : '';
    }

    if (kind === 'd_alerts') {
      var al = c.probs.filter(function (p) { return states[p[0]] && states[p[0]].state === 'on'; })
        .map(function (p) { return { icon: p[2], iconTone: 'bad', label: p[1], value: 'Prüfen', valueTone: 'bad' }; });
      return al.length ? UI.group(al, 'Hinweise') : '';
    }

    if (kind === 'd_care') {
      var rc = [];
      [[c.salt, 'Regeneriersalz', 'mdi:shaker-outline'], [c.rinse, 'Klarspüler', 'mdi:water-opacity']].forEach(function (x) {
        var v = x[0] && states[x[0]] && LEVEL[states[x[0]].state];
        if (v) rc.push({ icon: x[2], iconTone: v[1] || 'good', label: x[1], sub: v[1] ? 'Bitte nachfüllen' : null,
          value: v[0], valueTone: v[1], bar: v[2], barTone: v[1] || 'good' });
      });
      var onB = function (e) { return e && states[e] && states[e].state === 'on'; };
      if (c.smartFilter || c.filterCheck) {
        var fdue = onB(c.smartFilter) || onB(c.filterCheck);
        rc.push({ icon: 'mdi:air-filter', iconTone: fdue ? 'warn' : 'good', label: 'Filter', sub: fdue ? 'Herausnehmen und ausspülen' : null,
          value: fdue ? 'Reinigen' : 'Sauber', valueTone: fdue ? 'warn' : null });
      }
      var cr = U.num(states, c.care);
      var mdue = onB(c.machineCare) || onB(c.machineFilter) || cr === 0;
      if (cr != null || c.machineCare) rc.push({ icon: 'mdi:spray-bottle', iconTone: mdue ? 'warn' : 'good', label: 'Maschinenpflege',
        sub: mdue ? 'Programm „Maschinenpflege“ mit Reiniger starten' : (cr != null ? 'In ' + Math.round(cr) + ' Durchgängen' : null),
        value: mdue ? 'Fällig' : null, valueTone: mdue ? 'warn' : null });
      /* Weich (Entschlacken): nur Fälliges zeigen, sonst ein Satz. */
      if (window._casoraHH && window._casoraHH.on() && rc.length) {
        var dueR = rc.filter(function (r) { return r.valueTone; });
        return UI.group(dueR.length ? dueR : [{ icon: 'mdi:check-circle-outline', iconTone: 'good', label: 'Alles aufgefüllt',
          sub: 'Salz, Klarspüler und Pflege sind in Ordnung' }], 'Nachfüllen & Pflege');
      }
      return rc.length ? UI.group(rc, 'Nachfüllen & Pflege') : '';
    }

    if (kind === 'd_stats') {
      var rs = [];
      var a = (c.starts && states[c.starts] && states[c.starts].attributes) || {};
      var n = U.num(states, c.starts);
      if (a['Last Start']) {
        var t0 = new Date(a['Last Start']), t1 = a['Last End'] ? new Date(a['Last End']) : null;
        var lk = d.lastKwh;
        rs.push({ icon: 'mdi:history', iconTone: DIM, label: 'Letzter Durchgang',
          sub: U.day(t0) + ', ' + U.clock(t0) + ' Uhr' + (t1 && t1 > t0 ? ' · ' + U.dur((t1 - t0) / 60000) : ''),
          value: lk != null && lk > 0 ? U.kwh(lk) : null });
        if (lk != null && lk > 0 && c.price != null) rs.push({ icon: 'mdi:currency-eur', iconTone: DIM, label: 'Kosten letzter Durchgang', value: U.eur(lk * c.price) });
      }
      if (n != null) rs.push({ icon: 'mdi:counter', iconTone: 'accent', label: 'Starts insgesamt', value: String(Math.round(n)) });
      return rs.length ? UI.group(rs, 'Statistik') : '';
    }

    if (kind === 'd_device') {
      var rd = [];
      var SFd = window._casoraHH && window._casoraHH.on();
      /* Weich (Entschlacken): Tür steht im Kopf; Verbindung/Fernstart fallen weg, die Schalter bleiben (unter „Mehr“). */
      if (c.door && states[c.door] && !SFd) rd.push({ icon: doorOpen ? 'mdi:door-open' : 'mdi:door-closed', iconTone: doorOpen ? 'warn' : DIM,
        label: 'Tür', value: doorOpen ? 'Geöffnet' : 'Geschlossen', valueTone: doorOpen ? 'warn' : null });
      if (c.conn && states[c.conn] && !SFd) { var cn = states[c.conn].state === 'on';
        rd.push({ icon: cn ? 'mdi:wifi' : 'mdi:wifi-off', iconTone: cn ? DIM : 'bad', label: 'Verbindung', value: cn ? 'Verbunden' : 'Getrennt', valueTone: cn ? null : 'bad' }); }
      if (c.remote && states[c.remote] && !SFd) rd.push({ icon: 'mdi:remote', iconTone: DIM, label: 'Fernstart', value: REMOTE[states[c.remote].state] || states[c.remote].state });
      if (c.power_sw && states[c.power_sw] && states[c.power_sw].state !== 'unavailable') { var ps = states[c.power_sw].state === 'on';
        rd.push({ icon: 'mdi:power', iconTone: ps ? 'good' : DIM, label: 'Eingeschaltet', value: ps ? 'An' : 'Aus',
          svc: { domain: 'switch', service: ps ? 'turn_off' : 'turn_on', target: { entity_id: c.power_sw } }, confirm: ps && active ? 'Ausschalten' : null }); }
      if (c.light && states[c.light] && states[c.light].state !== 'unavailable') { var li = states[c.light].state === 'on';
        rd.push({ icon: 'mdi:led-on', iconTone: li ? 'accent' : DIM, label: 'Info-Licht am Boden', value: li ? 'An' : 'Aus',
          svc: { domain: 'switch', service: li ? 'turn_off' : 'turn_on', target: { entity_id: c.light } } }); }
      return rd.length ? UI.group(rd, 'Gerät') : '';
    }
    return '';
  };

  /* Nachgeladene Platten (d_hero/d_stats) laufen über L.paint → L.inner */
  var prevInner = L.inner;
  L.inner = function (kind, c, states) { return kind.indexOf('d_') === 0 ? D.inner(kind, c, states) : prevInner(kind, c, states); };

  /* ── Kachel ── */
  D.tile = function (entity, V, states, hass) {
    var c = D.resolve(entity, V, states, hass);
    var s = L.state(states, c.st);
    if (s[2]) {
      // Keine Restzeit in der Kachel (23.09.) – die steht im Popup.
      return PHASE[U.str(states, c.phase)] || s[0];
    }
    var todo = D.todo(c, states);
    return todo.length ? s[0] + ' · ' + todo[0][0] + (todo.length > 1 ? ' +' + (todo.length - 1) : '') : s[0];
  };
  D.level = function (entity, V, states, hass) {
    var c = D.resolve(entity, V, states, hass);
    if (L.state(states, c.st)[2]) return 0;
    var todo = D.todo(c, states);
    return todo.some(function (t) { return t[1] === 'bad'; }) ? 2 : todo.length ? 1 : 0;
  };

  /* ── Popup ── */
  D.popup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !entity) return { type: 'vertical-stack', cards: [] };
    var c = D.resolve(entity, variables, states, hass);
    var d0 = L.data[c.st];
    L.fetch(c, hass, !d0 || !d0.ts || Date.now() - d0.ts > 10000);
    D.fetchLast(c, hass);
    var _c = JSON.stringify(c);
    var watch = D.watch(c);
    var fields = {}, fstyle = {};
    var add = function (k, v) { fields[k] = v; fstyle[k] = [{ 'justify-self': 'stretch' }]; };
    var tpl = function (kind, async) {
      return '[[[ const c = ' + _c + '; return window._casoraLaundry ? window._casoraLaundry.' + (async ? 'slot' : 'inner')
        + "('" + kind + "', c, states) : ''; ]]]";
    };
    add('hero', tpl('d_hero', true));

    var active = L.state(states, c.st)[2];
    if (typeof window._hpChartCfg === 'function' && c.power) {
      window._hpChartCfg(c.power, 'Leistung', active ? '4h' : '24h', c.color, 150);
      if (c.volt) window._hpChartCfg(c.volt, 'Spannung', '24h', '#8E8E93', 150);
      if (c.amp) window._hpChartCfg(c.amp, 'Stromstärke', active ? '4h' : '24h', '#0A84FF', 150);
      if (c.energy) {
        var LBL = { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px', fontFamily: 'var(--primary-font-family, system-ui)' };
        [['hwd7:', '7d', 'ddd'], ['hwd30:', '30d', 'dd.']].forEach(function (x) {
          var key = x[0] + c.energy;
          window._hpPlantMeta[key] = ['Verbrauch pro Tag', x[1], '#30D158'];
          window._hpPlantCfg[key] = {
            type: 'custom:apexcharts-card', graph_span: x[1], span: { end: 'day' }, header: { show: false },
            yaxis: [{ show: true, decimals: 1, apex_config: { tickAmount: 2, forceNiceScale: true, floating: true,
              labels: { offsetX: 4, offsetY: -8, align: 'left', style: LBL } } }],
            series: [{ entity: c.energy, name: 'Verbrauch', color: '#30D158', type: 'column', unit: 'kWh',
                       statistics: { type: 'change', period: 'day', align: 'start' } }],
            apex_config: {
              chart: { height: 150, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
              theme: { mode: 'dark' }, dataLabels: { enabled: false }, legend: { show: false },
              plotOptions: { bar: { borderRadius: 4, columnWidth: x[1] === '7d' ? '50%' : '70%' } },
              grid: { show: true, borderColor: 'var(--casora-chart-grid, rgba(255,255,255,0.10))', xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } },
                      padding: { left: 0, right: 0, top: -6, bottom: -4 } },
              xaxis: { labels: { datetimeUTC: false, format: x[2], hideOverlappingLabels: true, rotate: 0, style: LBL },
                       axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
              tooltip: { theme: 'dark', x: { format: 'dd.MM.' } },
            },
          };
        });
      }
      var plate = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
        + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
        + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);padding:14px 10px 6px;';
      add('chart', window._casoraHH && window._casoraHH.on()
        ? window._casoraHH.chart(window._hpChartTitle(c.power), plate.replace('padding:14px 10px 6px;', ''))
        : '<div style="' + plate + '">'
        + '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);font-size:15px;font-weight:600;'
        + 'letter-spacing:-0.01em;color:var(--casora-popup-tiles-text-primary,#fff);text-align:left;padding:0 6px;">'
        + window._hpChartTitle(c.power) + '</div>'
        + '<div class="hp-chart-slot" style="min-height:150px;margin:6px 0 0;"></div></div>');
      if (typeof window._hpChartInit === 'function') window._hpChartInit(c.power);
    }

    add('run', tpl('d_run', false));
    add('prog', tpl('d_prog', false));
    if (window._casoraHH && window._casoraHH.on()) add('start', tpl('d_start', false));
    add('opts', tpl('d_opts', false));
    add('plug', tpl('plug', false));
    add('alerts', tpl('d_alerts', false));
    add('care', tpl('d_care', false));
    add('energy', tpl('energy', true));
    add('stats', tpl('d_stats', true));
    add('device', tpl('d_device', false));

    /* Weich (Entschlacken 01.10.2026): Kopf mit Restzeit, links Programm/Startzeit/Start bzw.
       Durchgang, rechts Hinweise und Nachfüllen (nur Fälliges); Optionen, Verbrauch, Statistik,
       Geräteschalter und Steckdose unter „Mehr“. Kein Leistungsdiagramm. */
    if (window._casoraHH && window._casoraHH.on() && window._casoraHH.layout) {
      var HH = window._casoraHH;
      var f2 = { hero: fields.hero, run: fields.run, prog: fields.prog, start: fields.start, alerts: fields.alerts, care: fields.care };
      f2.more = HH.moreCard(watch, 'const c = ' + _c + ';\nconst L = window._casoraLaundry, H = window._casoraHH;\n'
        + 'return L && H ? H.more("dish", ["d_opts", "energy", "d_stats", "d_device", "plug"].map(function (k) {'
        + ' return (k === "energy" || k === "d_stats") ? L.slot(k, c, states) : L.inner(k, c, states); })) : "";', c.st);
      return HH.layout({ entity: c.st, watch: watch, fields: f2, left: ['run', 'prog'], right: ['start', 'alerts', 'care', 'more'] });
    }

    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = fields[k]; cs[k] = fstyle[k]; });
      return {
        type: 'custom:button-card', entity: c.st, triggers_update: watch, tap_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle },
        extra_styles: window._casoraColGap(keys),
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
                 { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    /* Links: Durchgang bzw. Programmwahl + Start, Optionen, Steckdose; rechts: Hinweise, Pflege, Verbrauch, Statistik, Gerät. */
    var top = {}, topStyle = {}, topAreas = ['hero'];
    top.hero = { card: makeCol(['hero']) }; topStyle.hero = fstyle.hero;
    if (fields.chart !== undefined) { top.chart = fields.chart; topStyle.chart = fstyle.chart; topAreas.push('chart'); }
    var _sp = window._casoraSplit ? window._casoraSplit('dish', ['run', 'prog', 'opts', 'plug'], ['alerts', 'care', 'energy', 'stats', 'device'], { leftMovable: ['plug'] }) : { left: ['run', 'prog', 'opts', 'plug'], right: ['alerts', 'care', 'energy', 'stats', 'device'] };
    top.left = { card: makeCol(_sp.left) }; topStyle.left = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    top.right = { card: makeCol(_sp.right) }; topStyle.right = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    var narrow = topAreas.concat(['left', 'right']).map(function (k) { return '"' + k + '"'; }).join(' ');
    var wide = topAreas.map(function (k) { return '"' + k + ' ' + k + '"'; }).join(' ') + ' "left right"';
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }',
      'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
      'ha-card.disabled { pointer-events: auto !important; }',
    ].join('\n');
    return {
      type: 'custom:button-card', entity: c.st, triggers_update: [],
      card_mod: { style: wrapperStyle },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: ' + wide + ' !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, 20px) !important; } }',
      tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': narrow }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: topStyle,
      },
      custom_fields: top,
    };
  };
})();


// ── 3D-Drucker (casora_popup_3d_printer: Bambu Lab + Zwischenstecker) ─────────
// Nutzt die Bausteine von window._casoraLaundry (Verbrauch, Steckdose, Nachladen, Diagramm-Zeilen).
(function () {
  if (window._casoraPrint || !window._casoraLaundry) return;
  var L = window._casoraLaundry;
  var U = L.util;
  var P = window._casoraPrint = {};
  var DIM = U.DIM;

  var STATUS = {
    running: ['Druckt', 'accent', true], pause: ['Pausiert', 'warn', true], prepare: ['Vorbereitung', 'accent', true],
    init: ['Vorbereitung', 'accent', true], slicing: ['Slicen', 'accent', true], finish: ['Fertig', 'good', false],
    failed: ['Fehlgeschlagen', 'bad', false], idle: ['Bereit', null, false], offline: ['Offline', 'bad', false],
    unknown: ['Unbekannt', null, false], unavailable: ['Nicht verfügbar', 'bad', false],
  };
  var STEP = {
    printing: 'Druckt', heatbed_preheating: 'Druckbett heizt vor', heating_hotend: 'Düse heizt auf', auto_bed_leveling: 'Bett wird nivelliert',
    bed_level_phase_1: 'Bett wird nivelliert', bed_level_phase_2: 'Bett wird nivelliert', bed_level_high_temperature: 'Bett wird nivelliert',
    scanning_bed_surface: 'Druckbett wird gescannt', inspecting_first_layer: 'Erste Schicht wird geprüft', changing_filament: 'Filamentwechsel',
    filament_loading: 'Filament wird geladen', filament_unloading: 'Filament wird entladen', calibrating_extrusion: 'Extrusion wird kalibriert',
    calibrating_extrusion_flow: 'Fluss wird kalibriert', calibrating_motor_noise: 'Motor wird kalibriert', cleaning_nozzle_tip: 'Düse wird gereinigt',
    homing_toolhead: 'Referenzfahrt', cooling_nozzle: 'Düse kühlt ab', heated_bedcooling: 'Druckbett kühlt ab', waiting_for_heatbed_temperature: 'Wartet auf Druckbett',
    preparing_ams: 'AMS wird vorbereitet', check_material: 'Material wird geprüft', identifying_build_plate_type: 'Druckplatte wird erkannt',
    paused_user: 'Von dir pausiert', paused_filament_runout: 'Filament leer', paused_nozzle_clog: 'Düse verstopft', paused_first_layer_error: 'Fehler in der ersten Schicht',
    paused_front_cover_falling: 'Frontabdeckung prüfen', paused_ams_lost: 'AMS getrennt', paused_nozzle_temperature_malfunction: 'Düsentemperatur gestört',
    paused_heat_bed_temperature_malfunction: 'Betttemperatur gestört', paused_low_fan_speed_heat_break: 'Lüfter zu langsam', paused_skipped_step: 'Schrittverlust',
  };
  var SPEED = { silent: 'Leise', standard: 'Standard', sport: 'Sport', ludicrous: 'Turbo' };
  var NOZZLE = { stainless_steel: 'Edelstahl', hardened_steel: 'Gehärteter Stahl', brass: 'Messing' };
  var PLATE = { textured_plate: 'Texturiert (PEI)', cool_plate: 'Cool Plate', engineering_plate: 'Engineering', hot_plate: 'High Temp', smooth_plate: 'Glatt (PEI)' };
  var stepName = function (s) {
    if (!s || s === 'idle' || s === 'unknown' || s === 'offline') return null;
    return STEP[s] || s.replace(/^paused_/, 'Pausiert: ').replace(/_/g, ' ');
  };
  var hexRgb = function (h) {
    h = String(h || '').replace('#', '');
    if (h.length < 6) return null;
    return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); });
  };
  /* Kachelfarbe = Filamentfarbe; sehr helle Farben leicht abdunkeln, sonst verschwindet das weiße Symbol. */
  var swatch = function (h) {
    var c = hexRgb(h);
    if (!c) return DIM;
    var lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
    var k = lum > 0.8 ? 0.72 : 1;
    return 'rgb(' + c.map(function (v) { return Math.round(v * k); }).join(',') + ')';
  };

  // Entitäten des Druckers: feste Variable → Geräte-Finder (translation_key, sprachunabhängig).
  var FIND = {
    status: { keys: ['print_status'], domain: 'sensor' }, stage: { keys: ['stage'], domain: 'sensor' },
    progress: { keys: ['print_progress'], domain: 'sensor' }, remaining: { keys: ['remaining_time'], domain: 'sensor' },
    layer: { keys: ['current_layer'], domain: 'sensor' }, layers: { keys: ['total_layers'], domain: 'sensor' },
    task: { keys: ['subtask_name'], domain: 'sensor' }, start: { keys: ['start_time'], domain: 'sensor' },
    end: { keys: ['end_time'], domain: 'sensor' }, weight: { keys: ['print_weight'], domain: 'sensor' },
    length: { keys: ['print_length'], domain: 'sensor' },
    noz: { keys: ['nozzle_temp'], domain: 'sensor' }, nozT: { keys: ['target_nozzle_temp'], domain: 'sensor' },
    bed: { keys: ['bed_temp'], domain: 'sensor' }, bedT: { keys: ['target_bed_temp'], domain: 'sensor' },
    slots: { keys: ['tray'], domain: 'sensor', all: true }, ext: { keys: ['external_spool'], domain: 'sensor' },
    activeSlot: { keys: ['active_tray'], domain: 'sensor' },
    amsHum: { keys: ['humidity'], domain: 'sensor' }, amsIdx: { keys: ['humidity_index'], domain: 'sensor' },
    amsTemp: { keys: ['ams_temp'], domain: 'sensor' },
    speedSel: { keys: ['printing_speed'], domain: 'select' }, speed: { keys: ['speed_profile'], domain: 'sensor' },
    auxFan: { keys: ['aux_fan'], domain: 'fan' }, coolFan: { keys: ['cooling_fan'], domain: 'fan' },
    chamberFan: { keys: ['chamber_fan'], domain: 'fan' },
    usage: { keys: ['total_usage_hours'], domain: 'sensor' }, nozSize: { keys: ['nozzle_diameter'], domain: 'sensor' },
    nozType: { keys: ['nozzle_type'], domain: 'sensor' }, plate: { keys: ['print_bed_type'], domain: 'sensor' },
    fw: { keys: ['firmware_update'], domain: 'update' }, online: { keys: ['online'], domain: 'binary_sensor' },
    hms: { keys: ['hms_errors'], domain: 'binary_sensor' }, err: { keys: ['print_error'], domain: 'binary_sensor' },
    cam: { keys: ['camera'], domain: 'camera' }, camSw: { keys: ['camera'], domain: 'switch' },
    light: { keys: ['chamber_light'], domain: 'light' },
    pause: { keys: ['pause'], domain: 'button' }, resume: { keys: ['resume'], domain: 'button' }, stop: { keys: ['stop'], domain: 'button' },
  };

  /* Druckername ohne eigene Angabe (printer_name): der Name des Geräts in HA (vom Nutzer
     umbenannt zuerst), sonst „3D-Drucker“. Früher stand in der Vorlage fest „Bambu P1S“. */
  var devName = function (hass, eid) {
    var e = eid && hass && hass.entities && hass.entities[eid];
    var d = e && e.device_id && hass.devices && hass.devices[e.device_id];
    return (d && (d.name_by_user || d.name)) || null;
  };
  P.name = function (entity, V, hass) {
    if (V && V.printer_name) return V.printer_name;
    var r = null;
    try { r = P.resolve(entity, V, (hass && hass.states) || {}, hass); } catch (e) { r = null; }
    return (r && r.name) || '3D-Drucker';
  };

  P.resolve = function (entity, V, states, hass) {
    V = V || {};
    var st = V.entity_state || (entity && entity.entity_id);
    // Anker fürs Gerät: der Zustand-Sensor oder die Kachel-Entität (Template-Helfer haben kein Gerät).
    var CD = window.casoraDevice;
    var anchor = [st, entity && entity.entity_id].filter(function (x) { return x && CD && CD.deviceOf(hass, x); })[0];
    // Kachel an einem Template-Helfer ohne Gerät: den Drucker
    // im Haus über seinen Status-Schlüssel suchen.
    if (!anchor && CD && hass && hass.entities) {
      anchor = Object.keys(hass.entities).filter(function (k) {
        var e = hass.entities[k];
        return e && e.device_id && (e.translation_key === 'print_status' || e.translation_key === 'stage') && states[k];
      }).sort()[0];
    }
    var F = (anchor && CD) ? CD.map(hass, anchor, FIND) : {};
    var plugF = (anchor && CD) ? (CD.companionPlug(hass, anchor) || {}) : {};
    var f = function (varName, key) { return V[varName] || F[key] || null; };
    var fanList = [[f('_', 'auxFan'), 'Bauteillüfter'],
                   [f('_', 'coolFan'), 'Druckkopflüfter'],
                   [f('_', 'chamberFan'), 'Druckraumlüfter']]
      .filter(function (x) { return x[0] && states[x[0]]; });
    var slots = [V.entity_ams_slot_1, V.entity_ams_slot_2, V.entity_ams_slot_3, V.entity_ams_slot_4].filter(Boolean);
    if (!slots.length && F.slots) slots = F.slots.filter(function (x) { return states[x]; });
    var plug = V.plug_entity || plugF.switch || null;
    // Eigene Steckdose aus der Variable: Messwerte desselben Geräts.
    if (V.plug_entity && CD && hass) {
      var pm = CD.map(hass, V.plug_entity, { power: { dc: 'power', domain: 'sensor' }, voltage: { dc: 'voltage', domain: 'sensor' },
        current: { dc: 'current', domain: 'sensor' }, energy: { dc: 'energy', domain: 'sensor' } });
      plugF = { switch: V.plug_entity, power: pm.power, voltage: pm.voltage, current: pm.current, energy: pm.energy };
    }
    // Zustand (Arbeitsschritt): feste Variable, sonst der „stage“-Sensor des Geräts.
    if (!V.entity_state && F.stage) st = F.stage;
    return {
      st: st, print: true, name: V.printer_name || devName(hass, anchor) || '3D-Drucker', entry: null, dryer: false,
      price: window.casoraPriceKwh ? window.casoraPriceKwh(V.price_kwh) : null, color: V.chart_color || '#00C3D0',
      status: f('_', 'status'),
      progress: f('entity_progress', 'progress'),
      remaining: f('_', 'remaining'),
      layer: f('entity_layer', 'layer'), layers: f('entity_layers_total', 'layers'),
      task: f('entity_task_name', 'task'), start: f('entity_start_time', 'start'), end: f('entity_end_time', 'end'),
      weight: f('entity_weight', 'weight'), length: f('_', 'length'),
      noz: f('entity_nozzle_temp', 'noz'), nozT: f('entity_nozzle_target', 'nozT'),
      bed: f('entity_bed_temp', 'bed'), bedT: f('entity_bed_target', 'bedT'),
      slots: slots,
      ext: f('_', 'ext'),
      activeSlot: f('entity_active_slot', 'activeSlot'),
      amsHum: f('_', 'amsHum'),
      amsIdx: f('_', 'amsIdx'),
      amsTemp: f('_', 'amsTemp'),
      speedSel: f('_', 'speedSel'),
      speed: f('_', 'speed'),
      fans: fanList,
      usage: f('_', 'usage'), nozSize: f('_', 'nozSize'),
      nozType: f('_', 'nozType'),
      plate: f('_', 'plate'), fw: f('_', 'fw'),
      online: f('_', 'online'), hms: f('_', 'hms'),
      err: f('entity_error', 'err'),
      cam: f('entity_camera', 'cam'), camSw: f('_', 'camSw'), light: f('entity_light', 'light'),
      pause: f('btn_pause', 'pause'), resume: f('btn_resume', 'resume'), stop: f('btn_stop', 'stop'),
      plug: plug,
      power: V.entity_power || plugF.power || null,
      volt: plugF.voltage || null,
      amp: plugF.current || null,
      energy: plugF.energy || null, lock: null,
    };
  };
  // Für die Kachel-Vorlage: Entitäten ohne Kartenvariablen, zwischengespeichert je
  // Registry-Stand (die Vorlage fragt pro Zeichnen rund 30 Felder ab).
  var autoCache = { reg: null, map: {} };
  P.auto = function (entity, hass) {
    if (!hass) return null;
    var id = (entity && entity.entity_id) || '';
    if (autoCache.reg !== hass.entities) autoCache = { reg: hass.entities, map: {} };
    // Erst zwischenspeichern, wenn der Geräte-Finder geladen ist – sonst bliebe ein
    // leeres Ergebnis vom ersten Zeichnen hängen, bis sich die Registry ändert.
    if (!autoCache.map[id] || !autoCache.map[id]._finder) {
      var c = P.resolve(entity, {}, hass.states || {}, hass);
      c._finder = !!window.casoraDevice;
      // Tagesverbrauch der Steckdose (nur Kachel)
      var CD = window.casoraDevice, today = null;
      if (c.plug && CD) {
        var pl = CD.entities(hass, c.plug, { children: false });
        today = (pl.filter(function (e) { return e.dc === 'energy' && /_today$/.test(e.entity_id); })[0] || {}).entity_id || null;
      }
      c.energyToday = today;
      autoCache.map[id] = c;
    }
    return autoCache.map[id];
  };
  P.watch = function (c) {
    return [c.st, c.status, c.progress, c.remaining, c.layer, c.layers, c.task, c.start, c.end, c.weight, c.length, c.noz, c.nozT, c.bed, c.bedT,
      c.ext, c.activeSlot, c.amsHum, c.amsIdx, c.amsTemp, c.speedSel, c.speed, c.usage, c.fw, c.online, c.hms, c.err, c.camSw, c.light,
      c.pause, c.resume, c.stop, c.plug, c.power, c.volt, c.amp, c.energy]
      .concat(c.slots, c.fans.map(function (f) { return f[0]; })).filter(Boolean);
  };
  P.state = function (c, states) {
    var s = (c.status && states[c.status] && states[c.status].state) || 'unknown';
    return STATUS[s] || [s, null, false];
  };

  P.inner = function (kind, c, states) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var s = P.state(c, states);
    var active = s[2];
    var raw = (c.status && states[c.status] && states[c.status].state) || '';
    var rem = U.num(states, c.remaining);
    if (rem != null) rem = rem * 60;   // Stunden → Minuten
    var step = stepName(U.str(states, c.st));
    var task = U.str(states, c.task);
    var errOn = (c.err && states[c.err] && states[c.err].state === 'on') || (c.hms && states[c.hms] && states[c.hms].state === 'on');

    if (kind === 'p_hero') {
      /* Weich (Entschlacken): Fortschritt als Hauptwert, Unterzeile „noch 1:20 · Schicht 120/300 · PETG“. */
      if (window._casoraHH && window._casoraHH.on()) {
        var pc = U.num(states, c.progress), sl = U.num(states, c.layer), st2 = U.num(states, c.layers);
        var fil = null, actS = U.str(states, c.activeSlot);
        c.slots.concat(c.ext ? [c.ext] : []).forEach(function (id) {
          var a2 = (states[id] && states[id].attributes) || {};
          if (!fil && (a2.active === true || (actS && String(actS) === String(a2.slot || ''))) && a2.type && a2.type !== '?') fil = a2.type;
        });
        var sb = [];
        if (active) {
          if (rem != null && rem > 0) sb.push('noch ' + Math.floor(rem / 60) + ':' + ('0' + Math.round(rem % 60)).slice(-2));
          if (step && step !== 'Druckt') sb.push(step);
          if (st2) sb.push('Schicht ' + Math.round(sl || 0) + '/' + Math.round(st2));
          if (fil) sb.push(fil);
          if (raw === 'pause') sb.unshift('Pausiert');
        } else {
          if (task) sb.push('Zuletzt: ' + task);
          if (raw === 'finish' && c.end && U.str(states, c.end)) sb.push('seit ' + U.clock(new Date(states[c.end].state)) + ' Uhr');
        }
        if (errOn) sb.push('Fehler gemeldet');
        /* Runde 2 (B-16): Der Fehler steht im Zustand (rot), die Meta-Zeile bleibt ruhig. */
        return UI.hero({ value: active && pc != null ? Math.round(pc) + ' %' : s[0], sub: sb.join(' · ') || null,
          valueTone: errOn || s[1] === 'bad' ? 'bad' : null, subTone: raw === 'pause' ? 'warn' : null, center: true });
      }
      var sub = [], value = s[0], unit = null, tone = s[1];
      if (active && rem != null && rem > 0) {
        var h = Math.floor(rem / 60), m = Math.round(rem % 60);
        value = h ? h + ':' + (m < 10 ? '0' : '') + m : String(m);
        unit = h ? 'Std. übrig' : 'Min. übrig';
        sub.push(step && step !== 'Druckt' ? step : s[0]);
      } else if (active && step) sub.push(step);
      if (task) sub.push(active ? task : 'Zuletzt: ' + task);
      if (!active && raw === 'finish' && c.end && U.str(states, c.end)) sub.push('seit ' + U.clock(new Date(states[c.end].state)) + ' Uhr');
      if (errOn) { sub.push('Fehler gemeldet'); tone = 'bad'; }
      return UI.hero({ value: value, unit: unit, sub: sub.join(' · ') || null, subTone: tone, center: true });
    }

    if (kind === 'p_cam') {
      if (!c.cam || !states[c.cam]) return '';
      return '';
    }

    if (kind === 'p_job') {
      var rows = [];
      var pct = U.num(states, c.progress);
      var ly = U.num(states, c.layer), lt = U.num(states, c.layers);
      if (active) {
        if (pct != null) rows.push({ icon: 'mdi:progress-clock', iconTone: 'accent', label: 'Fortschritt',
          sub: rem != null && rem > 0 ? 'Fertig gegen ' + U.clock(new Date(Date.now() + rem * 60000)) + ' Uhr' : null,
          value: Math.round(pct) + ' %', bar: Math.max(0, Math.min(1, pct / 100)), barTone: 'accent' });
        if (lt) rows.push({ icon: 'mdi:layers-triple-outline', iconTone: 'accent', label: 'Schicht', value: Math.round(ly || 0) + ' von ' + Math.round(lt),
          bar: Math.min(1, (ly || 0) / lt), barTone: 'accent' });
        var st0 = U.str(states, c.start);
        if (st0) { var t0 = new Date(st0); rows.push({ icon: 'mdi:clock-start', iconTone: 'accent', label: 'Gestartet', value: U.clock(t0) + ' Uhr',
          sub: 'läuft seit ' + U.dur((Date.now() - t0.getTime()) / 60000) }); }
      }
      if (task) rows.push({ icon: 'mdi:file-outline', iconTone: active ? 'accent' : DIM, label: active ? 'Aufgabe' : 'Letzte Aufgabe', sub: task });
      var w = U.num(states, c.weight), le = U.num(states, c.length);
      if (w != null && w > 0) rows.push({ icon: 'mdi:weight-gram', iconTone: active ? 'accent' : DIM, label: 'Filament',
        sub: le != null && le > 0 ? U.f(le, 1) + ' m' : null, value: U.f(w, 1) + ' g' });
      /* Weich (Entschlacken): Fortschritt und Schicht stehen im Kopf – hier nur Ende, Start, Aufgabe, Filament. */
      if (window._casoraHH && window._casoraHH.on()) {
        rows = rows.filter(function (r) { return r.label !== 'Fortschritt' && r.label !== 'Schicht'; });
        if (active && rem != null && rem > 0) rows.unshift({ icon: 'mdi:flag-checkered', iconTone: 'accent', label: 'Fertig gegen',
          value: U.clock(new Date(Date.now() + rem * 60000)) + ' Uhr' });
        return rows.length ? UI.group(rows, active ? 'Druck' : 'Zuletzt gedruckt') : '';
      }
      return rows.length ? UI.group(rows, active ? 'Druck' : 'Zuletzt gedruckt') : '';
    }

    if (kind === 'p_ctrl') {
      var ok = function (e) { return e && states[e] && states[e].state !== 'unavailable'; };
      var rc = [];
      if (raw === 'pause' && ok(c.resume)) rc.push({ icon: 'mdi:play', iconTone: 'good', label: 'Fortsetzen', svc: { domain: 'button', service: 'press', target: { entity_id: c.resume } } });
      else if (active && ok(c.pause)) rc.push({ icon: 'mdi:pause', iconTone: 'warn', label: 'Pausieren', svc: { domain: 'button', service: 'press', target: { entity_id: c.pause } } });
      if (active && ok(c.stop)) rc.push({ icon: 'mdi:stop', iconTone: 'bad', label: 'Druck abbrechen', sub: 'Lässt sich nicht fortsetzen',
        svc: { domain: 'button', service: 'press', target: { entity_id: c.stop } }, confirm: 'Abbrechen' });
      if (c.light && states[c.light]) { var lo = states[c.light].state === 'on';
        rc.push({ icon: 'mdi:led-strip-variant', iconTone: lo ? 'accent' : DIM, label: 'Druckraumlicht', value: lo ? 'An' : 'Aus',
          svc: { domain: 'light', service: lo ? 'turn_off' : 'turn_on', target: { entity_id: c.light } } }); }
      if (c.camSw && states[c.camSw] && states[c.camSw].state !== 'unavailable') { var co = states[c.camSw].state === 'on';
        rc.push({ icon: 'mdi:video-outline', iconTone: co ? 'accent' : DIM, label: 'Kamera', value: co ? 'An' : 'Aus',
          svc: { domain: 'switch', service: co ? 'turn_off' : 'turn_on', target: { entity_id: c.camSw } } }); }
      var out = rc.length ? UI.group(rc, 'Steuerung') : '';
      var sp = c.speedSel && states[c.speedSel];
      /* Weich: Geschwindigkeit steht unter „Mehr“ (p_speed). */
      if (sp && sp.state !== 'unavailable' && !(window._casoraHH && window._casoraHH.on())) {
        var spSeg = UI.segments(((sp.attributes || {}).options || []).map(function (o) {
          return { label: SPEED[o] || o, active: sp.state === o, svc: { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.speedSel } } };
        }), 'Geschwindigkeit');
        out += '<div style="height:18px"></div>' + (window._casoraHH && window._casoraHH.on() ? window._casoraHH.dense(spSeg) : spSeg);
      }
      return out;
    }

    if (kind === 'p_speed') {
      var sp2 = c.speedSel && states[c.speedSel];
      if (!sp2 || sp2.state === 'unavailable') return '';
      return window._casoraHH.dense(UI.segments(((sp2.attributes || {}).options || []).map(function (o) {
        return { label: SPEED[o] || o, active: sp2.state === o, svc: { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.speedSel } } };
      }), 'Geschwindigkeit'));
    }

    if (kind === 'p_temp') {
      var rt = [];
      /* Einheit des Sensors (°C/°F), sonst °C. */
      var tu = function (id) { return (states[id] && states[id].attributes && states[id].attributes.unit_of_measurement) || '°C'; };
      var trow = function (id, tid, label, icon) {
        var v = U.num(states, id);
        if (v == null) return;
        var tg = U.num(states, tid);
        var heating = tg != null && tg > 0;
        rt.push({ icon: icon, iconTone: heating ? (Math.abs(tg - v) > 2 ? 'warn' : 'bad') : DIM, label: label,
          sub: heating ? 'Ziel ' + Math.round(tg) + ' ' + tu(tid) : null, value: Math.round(v) + ' ' + tu(id),
          bar: heating ? Math.max(0, Math.min(1, v / tg)) : null, barTone: 'warn', entity: id });
      };
      trow(c.noz, c.nozT, 'Düse', 'mdi:printer-3d-nozzle-heat-outline');
      trow(c.bed, c.bedT, 'Druckbett', 'mdi:radiator');
      var fanRows = c.fans.map(function (f) {
        var st = states[f[0]], on = st.state === 'on', p = (st.attributes || {}).percentage;
        return { icon: 'mdi:fan', iconTone: on ? 'accent' : DIM, label: f[1], value: on && p != null ? p + ' %' : 'Aus' };
      });
      var SFt = window._casoraHH && window._casoraHH.on();
      var out2 = rt.length ? (SFt ? UI.group(rt, 'Temperaturen') : L.wrap(UI.group(rt, 'Temperaturen').replace(/data-casora-mi="/g, 'data-hp-metric="'))) : '';
      if (active || fanRows.some(function (r) { return r.value !== 'Aus'; })) out2 += (out2 ? '<div style="height:18px"></div>' : '') + UI.group(fanRows, 'Lüfter');
      return out2;
    }

    if (kind === 'p_ams') {
      var act = U.str(states, c.activeSlot);
      var rows2 = c.slots.concat(c.ext ? [c.ext] : []).map(function (id, i) {
        var st = states[id];
        if (!st) return null;
        var a = st.attributes || {};
        if (a.empty && id === c.ext) return null;
        var on = a.active === true || (act && String(act) === String(a.slot || ''));
        var r = typeof a.remain === 'number' && a.remain >= 0 ? a.remain : null;
        var lbl = a.empty ? 'Leer' : (a.name || st.state);
        return { icon: on ? 'mdi:printer-3d-nozzle' : 'mdi:circle-slice-8', iconTone: a.empty ? DIM : swatch(a.color),
          label: (id === c.ext ? 'Extern · ' : 'Slot ' + (a.slot || i + 1) + ' · ') + lbl,
          sub: [a.type && a.type !== '?' ? a.type : null, on ? 'wird gerade genutzt' : null].filter(Boolean).join(' · ') || null,
          value: r != null ? r + ' %' : null, valueTone: r != null && r <= 15 ? 'warn' : null,
          bar: r != null ? r / 100 : null, barTone: r != null && r <= 15 ? 'warn' : 'good' };
      }).filter(Boolean);
      var hum = U.num(states, c.amsHum), idx = U.num(states, c.amsIdx), at = U.num(states, c.amsTemp);
      if (hum != null) rows2.push({ icon: 'mdi:water-percent', iconTone: idx != null && idx <= 2 ? 'warn' : 'accent', label: 'Luftfeuchtigkeit im AMS',
        sub: idx != null ? 'Stufe ' + Math.round(idx) + ' von 5' + (idx <= 2 ? ' · Trockenmittel tauschen' : '') : null,
        value: Math.round(hum) + ' %', entity: c.amsHum });
      if (at != null) rows2.push({ icon: 'mdi:thermometer', iconTone: DIM, label: 'Temperatur im AMS', value: U.f(at, 1) + ' ' + ((states[c.amsTemp] && states[c.amsTemp].attributes.unit_of_measurement) || '°C') });
      if (window._casoraHH && window._casoraHH.on()) return rows2.length ? UI.group(rows2, 'Filament') : '';
      return rows2.length ? L.wrap(UI.group(rows2, 'Filament').replace(/data-casora-mi="/g, 'data-hp-metric="')) : '';
    }

    if (kind === 'p_alerts') {
      var al = [];
      if (c.online && states[c.online] && states[c.online].state !== 'on') al.push({ icon: 'mdi:wifi-off', iconTone: 'bad', label: 'Drucker offline' });
      if (c.err && states[c.err] && states[c.err].state === 'on') al.push({ icon: 'mdi:alert-circle-outline', iconTone: 'bad', label: 'Druckfehler' });
      if (c.hms && states[c.hms] && states[c.hms].state === 'on') {
        var n = (states[c.hms].attributes || {}).Count;
        al.push({ icon: 'mdi:alert-outline', iconTone: 'bad', label: 'Gerätemeldung (HMS)', sub: 'Details in der Bambu-App', value: n ? String(n) : null, valueTone: 'bad' });
      }
      if (c.fw && states[c.fw] && states[c.fw].state === 'on' && !(window._casoraHH && window._casoraHH.on())) al.push({ icon: 'mdi:update', iconTone: 'warn', label: 'Firmware-Update verfügbar',
        value: (states[c.fw].attributes || {}).latest_version || null });
      return al.length ? UI.group(al, 'Hinweise') : '';
    }

    if (kind === 'p_info') {
      var ri = [];
      var us = U.num(states, c.usage);
      if (us != null) ri.push({ icon: 'mdi:timer-outline', iconTone: DIM, label: 'Druckzeit insgesamt', value: U.f(us, 0) + ' Std.' });
      var ns = U.num(states, c.nozSize), nt = U.str(states, c.nozType);
      if (ns != null) ri.push({ icon: 'mdi:printer-3d-nozzle-outline', iconTone: DIM, label: 'Düse', value: U.f(ns, 1) + ' mm' + (nt ? ' · ' + (NOZZLE[nt] || nt) : '') });
      var pl = U.str(states, c.plate);
      if (pl) ri.push({ icon: 'mdi:square-outline', iconTone: DIM, label: 'Druckplatte', value: PLATE[pl] || pl });
      var spd = U.str(states, c.speed);
      if (spd && !active) ri.push({ icon: 'mdi:speedometer', iconTone: DIM, label: 'Geschwindigkeit', value: SPEED[spd] || spd });
      if (c.fw && states[c.fw] && !(window._casoraHH && window._casoraHH.on())) ri.push({ icon: 'mdi:chip', iconTone: DIM, label: 'Firmware', value: (states[c.fw].attributes || {}).installed_version || '—' });
      return ri.length ? UI.group(ri, 'Drucker') : '';
    }
    return '';
  };

  var prevInner = L.inner;
  L.inner = function (kind, c, states) { return kind.indexOf('p_') === 0 ? P.inner(kind, c, states) : prevInner(kind, c, states); };

  P.popup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !entity) return { type: 'vertical-stack', cards: [] };
    var c = P.resolve(entity, variables, states, hass);
    /* Steckdose/Verbrauch nutzen L.state(c.st) für „läuft gerade“ → Druckerzustand an L weiterreichen */
    c.st_active = P.state(c, states)[2];
    var d0 = L.data[c.st];
    L.fetch(c, hass, !d0 || !d0.ts || Date.now() - d0.ts > 10000);
    var _c = JSON.stringify(c);
    var watch = P.watch(c);
    var fields = {}, fstyle = {};
    var add = function (k, v) { fields[k] = v; fstyle[k] = [{ 'justify-self': 'stretch' }]; };
    var tpl = function (kind, async) {
      return '[[[ const c = ' + _c + '; return window._casoraLaundry ? window._casoraLaundry.' + (async ? 'slot' : 'inner')
        + "('" + kind + "', c, states) : ''; ]]]";
    };
    add('hero', tpl('p_hero', false));
    var active = c.st_active;

    if (typeof window._hpChartCfg === 'function' && c.power) {
      window._hpChartCfg(c.power, 'Leistung', active ? '4h' : '24h', c.color, 150);
      if (c.volt) window._hpChartCfg(c.volt, 'Spannung', '24h', '#8E8E93', 150);
      if (c.amp) window._hpChartCfg(c.amp, 'Stromstärke', active ? '4h' : '24h', '#0A84FF', 150);
      if (c.noz) window._hpChartCfg(c.noz, 'Düse', active ? '4h' : '24h', '#FF9F0A', 150);
      if (c.bed) window._hpChartCfg(c.bed, 'Druckbett', active ? '4h' : '24h', '#FF453A', 150);
      if (c.amsHum) { window._hpChartCfg(c.amsHum, 'Luftfeuchtigkeit im AMS', '7d', '#0A84FF', 150); if (window._hpSmooth) window._hpSmooth(c.amsHum); }
      if (c.energy) {
        var LBL = { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px', fontFamily: 'var(--primary-font-family, system-ui)' };
        [['hwd7:', '7d', 'ddd'], ['hwd30:', '30d', 'dd.']].forEach(function (x) {
          var key = x[0] + c.energy;
          window._hpPlantMeta[key] = ['Verbrauch pro Tag', x[1], '#30D158'];
          window._hpPlantCfg[key] = {
            type: 'custom:apexcharts-card', graph_span: x[1], span: { end: 'day' }, header: { show: false },
            yaxis: [{ show: true, decimals: 1, apex_config: { tickAmount: 2, forceNiceScale: true, floating: true,
              labels: { offsetX: 4, offsetY: -8, align: 'left', style: LBL } } }],
            series: [{ entity: c.energy, name: 'Verbrauch', color: '#30D158', type: 'column', unit: 'kWh',
                       statistics: { type: 'change', period: 'day', align: 'start' } }],
            apex_config: {
              chart: { height: 150, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
              theme: { mode: 'dark' }, dataLabels: { enabled: false }, legend: { show: false },
              plotOptions: { bar: { borderRadius: 4, columnWidth: x[1] === '7d' ? '50%' : '70%' } },
              grid: { show: true, borderColor: 'var(--casora-chart-grid, rgba(255,255,255,0.10))', xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } },
                      padding: { left: 0, right: 0, top: -6, bottom: -4 } },
              xaxis: { labels: { datetimeUTC: false, format: x[2], hideOverlappingLabels: true, rotate: 0, style: LBL },
                       axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
              tooltip: { theme: 'dark', x: { format: 'dd.MM.' } },
            },
          };
        });
      }
    }
    var plate = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
      + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
      + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);';
    if (c.power && typeof window._hpChartTitle === 'function') {
      add('chart', window._casoraHH && window._casoraHH.on() ? window._casoraHH.chart(window._hpChartTitle(c.power), plate)
        : '<div style="' + plate + 'padding:14px 10px 6px;">'
        + '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);font-size:15px;font-weight:600;'
        + 'letter-spacing:-0.01em;color:var(--casora-popup-tiles-text-primary,#fff);text-align:left;padding:0 6px;">'
        + window._hpChartTitle(c.power) + '</div>'
        + '<div class="hp-chart-slot" style="min-height:150px;margin:6px 0 0;"></div></div>');
      if (typeof window._hpChartInit === 'function') window._hpChartInit(c.power);
    }
    /* Kamerabild wie im bisherigen Popup (16:9, abgerundet); picture-entity aktualisiert sich selbst. */
    if (c.cam && states[c.cam]) {
      add('cam', { card: { type: 'picture-entity', entity: c.cam, camera_view: 'auto', show_name: false, show_state: false, tap_action: { action: 'none' }, hold_action: { action: 'none' },
        aspect_ratio: '16:9',
        card_mod: { style: 'ha-card { border-radius: var(--casora-popup-row-radius, 20px) !important; overflow: hidden !important; border: none !important;'
          + ' box-shadow: var(--casora-popup-plate-shadow, none) !important; background: var(--casora-soft-placeholder, rgba(0,0,0,0.35)) !important; }' } } });
    }

    /* KI-Blick auf den Druck (✦): gleiches Modul wie im Kamera-Popup, eigener Bereich. */
    if (c.cam && states[c.cam] && window._casoraCamAi && window._casoraCamAi.inline) add('camai', window._casoraCamAi.inline(c.cam, 'KI-Blick auf den Druck', 'Druck prüfen'));
    add('job', tpl('p_job', false));
    add('ctrl', tpl('p_ctrl', false));
    add('temp', tpl('p_temp', false));
    add('plug', tpl('plug', false));
    add('alerts', tpl('p_alerts', false));
    add('ams', tpl('p_ams', false));
    add('energy', tpl('energy', true));
    add('info', tpl('p_info', false));

    /* Weich (Entschlacken 01.10.2026): Kopf mit Fortschritt, links Steuerung und Druck, rechts
       Kamera mit KI-Blick-Knopf darunter; Filament, Temperaturen, Tempo, Verbrauch, Gerät und
       Steckdose unter „Mehr“. Kein Leistungsdiagramm, keine Messwerte der Steckdose. */
    if (window._casoraHH && window._casoraHH.on() && window._casoraHH.layout) {
      var HH = window._casoraHH;
      var f2 = { hero: fields.hero, alerts: fields.alerts, ctrl: fields.ctrl, job: fields.job };
      if (fields.cam) {
        f2.camlbl = HH.label('Kamera');
        f2.cam = fields.cam;
        if (window._casoraCamAi) f2.camai = HH.aiButton(c.cam, 'KI-Blick: Druck prüfen');
      }
      f2.more = HH.moreCard(watch, 'const c = ' + _c + ';\nconst L = window._casoraLaundry, H = window._casoraHH;\n'
        + 'return L && H ? H.more("printer", ["p_ams", "p_temp", "p_speed", "energy", "p_info", "plug"].map(function (k) {'
        + ' return k === "energy" ? L.slot(k, c, states) : L.inner(k, c, states); })) : "";', c.st);
      return HH.layout({ entity: c.st, watch: watch, fields: f2, left: ['alerts', 'ctrl', 'job'], right: ['camlbl', 'cam', 'camai', 'more'],
        colExtra: ' #container > #cam { margin-top: 0 !important; } #container > #camai:not(:empty) { margin-top: 12px !important; }' });
    }

    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = fields[k]; cs[k] = fstyle[k]; });
      return {
        type: 'custom:button-card', entity: c.st, triggers_update: watch, tap_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle },
        /* KI-Blick ist die Überschrift des Kamerabilds: kein Abschnittsabstand dazwischen. */
        extra_styles: window._casoraColGap(keys) + (keys[0] === 'camai' ? ' #container > #cam { margin-top: 0 !important; } #container > #camai { overflow: visible !important; }' : ''),
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
                 { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    /* Popup-Standard (24.09.2026): Status oben, Verlauf volle Breite; links Bedienung
       (Hinweise, Druck, Steuerung, Temperaturen, Steckdose), rechts Infos (Kamera + KI, Filament, Verbrauch, Gerät). */
    var has = function (k) { return fields[k] !== undefined; };
    var top = {}, topStyle = {};
    top.hero = { card: makeCol(['hero']) }; topStyle.hero = fstyle.hero;
    var pair = [];
    if (fields.chart) { top.chart = fields.chart; topStyle.chart = [{ 'justify-self': 'stretch' }, { 'align-self': 'stretch' }]; pair.push('chart'); }
    var _sp = (function (l, r) { return window._casoraSplit ? window._casoraSplit('printer', l, r, { pinRight: ['camai', 'cam'] }) : { left: l, right: r }; })(['alerts', 'job', 'ctrl', 'temp', 'plug'].filter(has), ['camai', 'cam', 'ams', 'energy', 'info'].filter(has));
    top.left = { card: makeCol(_sp.left) }; topStyle.left = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    top.right = { card: makeCol(_sp.right) };  /* KI-Blick als Überschrift über dem Kamerabild (24.09.) */ topStyle.right = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    var narrow = ['hero'].concat(pair, ['left', 'right']).map(function (k) { return '"' + k + '"'; }).join(' ');
    var wide = '"hero hero"' + (pair.length ? ' "chart chart"' : '') + ' "left right"';
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }',
      'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
      'ha-card.disabled { pointer-events: auto !important; }',
    ].join('\n');
    return {
      type: 'custom:button-card', entity: c.st, triggers_update: [],
      card_mod: { style: wrapperStyle },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: ' + wide + ' !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, 20px) !important; } }',
      tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': narrow }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: topStyle,
      },
      custom_fields: top,
    };
  };
})();

// ── Popup-Tippschutz (23.09.2026) ───────────────────────────────────────────
// 1) Direkt nach dem Öffnen eines Popups (600 ms) lösen data-casora-svc-Elemente nichts aus –
//    der Finger, der das Popup geöffnet hat, darf nicht gleich „Heizen“ o. Ä. treffen.
// 2) Klima-GRUPPEN (member_entities, z. B. eine Fußbodenheizungs-Gruppe): Einschalten (Heizen/Auto)
//    braucht einen zweiten Tipp „Bestätigen“ innerhalb von 4 s. „Aus“ bleibt ein Tipp.
// Läuft im Capture auf window, also vor casora-cores document-Listener.
(function () {
  if (window._casoraSvcGuard) return;
  window._casoraSvcGuard = true;
  var OPEN_LOCK = 600, ARM_MS = 4000, SLOP = 10;
  var wrap = function () {
    var P = window.casoraPopup;
    if (!P) return false;
    if (P._hgWrapped) return true;
    var o = P.open;
    P.open = function () { window._casoraPopupOpenedAt = Date.now(); return o.apply(this, arguments); };
    P._hgWrapped = true;
    return true;
  };
  if (!wrap()) { var n = 0, iv = setInterval(function () { if (wrap() || ++n > 240) clearInterval(iv); }, 250); }

  var tp = null, lastTouch = 0, armed = null;
  window.addEventListener('touchstart', function (ev) {
    var t = ev.touches && ev.touches[0];
    tp = t ? { x: t.clientX, y: t.clientY, moved: false } : null;
  }, { capture: true, passive: true });
  window.addEventListener('touchmove', function (ev) {
    var t = ev.touches && ev.touches[0];
    if (tp && t && (Math.abs(t.clientX - tp.x) > SLOP || Math.abs(t.clientY - tp.y) > SLOP)) tp.moved = true;
  }, { capture: true, passive: true });

  var svcEl = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [ev.target];
    for (var i = 0; i < path.length; i++) {
      var t = path[i];
      if (t && t.dataset && t.dataset.casoraSvc) return t;
    }
    return null;
  };
  var disarm = function () {
    if (!armed) return;
    var el = armed; armed = null;
    clearTimeout(el._hgT);
    if (el._hgLabel != null) el.textContent = el._hgLabel;
    el.style.removeProperty('background'); el.style.removeProperty('color');
    el._hgArmed = 0;
  };
  var arm = function (el) {
    disarm();
    armed = el;
    el._hgArmed = Date.now();
    el._hgLabel = el.textContent;
    el.textContent = 'Bestätigen';
    el.style.setProperty('background', 'var(--casora-color-orange, #FF9F0A)');
    el.style.setProperty('color', '#000');
    el._hgT = setTimeout(disarm, ARM_MS);
  };
  var guard = function (ev) {
    var moved = ev.type === 'touchend' && !!(tp && tp.moved);
    if (ev.type === 'touchend') tp = null;
    var el = svcEl(ev);
    if (!el) return;
    var block = function () { ev.stopImmediatePropagation(); ev.stopPropagation(); if (ev.cancelable) ev.preventDefault(); };
    if (Date.now() - (window._casoraPopupOpenedAt || 0) < OPEN_LOCK) { block(); return; }
    if (moved) return;   // Scrollgeste – casora-core ignoriert sie ohnehin
    var spec;
    try { spec = JSON.parse(el.dataset.casoraSvc); } catch (e) { return; }
    if (!spec || spec.domain !== 'climate' || spec.service !== 'set_hvac_mode') return;
    var mode = spec.data && spec.data.hvac_mode;
    var eid = spec.target && spec.target.entity_id;
    var ha = document.querySelector('home-assistant');
    var st = ha && ha.hass && ha.hass.states[eid];
    if (!st || !Array.isArray((st.attributes || {}).member_entities) || mode === 'off') return;
    if (st.state === mode) { block(); return; }
    if (ev.type === 'click' && Date.now() - lastTouch < 700) { block(); return; }   // Maus-Klick nach dem Touch
    if (ev.type === 'touchend') lastTouch = Date.now();
    if (armed === el && Date.now() - el._hgArmed < ARM_MS) { disarm(); return; }     // zweiter Tipp → durchlassen
    block();
    arm(el);
  };
  window.addEventListener('touchend', guard, true);
  window.addEventListener('click', guard, true);
})();


// ── Saugroboter (casora_vacuum: Roborock + Dock-Steckdose) — 23.09.2026 ─────────
// Popup im Geräte-Stil (wie Geschirrspüler/3D-Drucker). Nutzt die Bausteine von window._casoraLaundry.
(function () {
  if (window._casoraVac || !window._casoraLaundry) return;
  var L = window._casoraLaundry;
  var U = L.util;
  var V = window._casoraVac = {};
  var DIM = U.DIM;

  var STATUS = {
    starting: 'Startet', charger_disconnected: 'Dock getrennt', idle: 'Bereit', remote_control_active: 'Fernsteuerung aktiv',
    cleaning: 'Reinigt', returning_home: 'Kehrt zurück', manual_mode: 'Manueller Modus', charging: 'Lädt',
    charging_problem: 'Ladefehler', paused: 'Pausiert', spot_cleaning: 'Punktreinigung', error: 'Fehler',
    shutting_down: 'Fährt herunter', updating: 'Aktualisiert', docking: 'Fährt zum Dock', going_to_target: 'Fährt zum Ziel',
    zoned_cleaning: 'Zonenreinigung', segment_cleaning: 'Raumreinigung', emptying_the_bin: 'Leert Staubbehälter',
    washing_the_mop: 'Moppwäsche', washing_the_mop_2: 'Moppwäsche', going_to_wash_the_mop: 'Fährt zur Moppwäsche',
    in_call: 'Im Anruf', mapping: 'Kartierung', egg_attack: 'Spaßmodus', patrol: 'Patrouille',
    attaching_the_mop: 'Mopp wird angebracht', detaching_the_mop: 'Mopp wird entfernt', charging_complete: 'Vollständig geladen',
    device_offline: 'Getrennt', locked: 'Kindersicherung aktiv', air_drying_stopping: 'Trocknung endet',
    robot_status_mopping: 'Wischt', clean_mop_cleaning: 'Saugt & wischt', clean_mop_mopping: 'Wischt',
    segment_mopping: 'Wischt Raum', segment_clean_mop_cleaning: 'Saugt & wischt Raum', segment_clean_mop_mopping: 'Wischt Raum',
    zoned_mopping: 'Wischt Zone', zoned_clean_mop_cleaning: 'Saugt & wischt Zone', zoned_clean_mop_mopping: 'Wischt Zone',
    back_to_dock_washing_duster: 'Kehrt zurück & Moppwäsche',
  };
  var CLEAN = ['cleaning', 'returning', 'returning_home', 'docking', 'spot_cleaning', 'zoned_cleaning', 'segment_cleaning',
    'going_to_target', 'mapping', 'patrol', 'remote_control_active', 'manual_mode', 'robot_status_mopping', 'clean_mop_cleaning',
    'clean_mop_mopping', 'segment_mopping', 'segment_clean_mop_cleaning', 'segment_clean_mop_mopping', 'zoned_mopping',
    'zoned_clean_mop_cleaning', 'zoned_clean_mop_mopping'];
  var DOCKWORK = ['emptying_the_bin', 'washing_the_mop', 'washing_the_mop_2', 'going_to_wash_the_mop', 'attaching_the_mop',
    'detaching_the_mop', 'back_to_dock_washing_duster', 'air_drying_stopping'];
  var ERRORS = {
    none: null, lidar_blocked: 'Lidar blockiert', bumper_stuck: 'Stoßfänger klemmt', wheels_suspended: 'Räder hängen in der Luft',
    cliff_sensor_error: 'Absturzsensor verschmutzt', main_brush_jammed: 'Hauptbürste blockiert', side_brush_jammed: 'Seitenbürste blockiert',
    wheels_jammed: 'Räder blockiert', robot_trapped: 'Roboter steckt fest', no_dustbin: 'Staubbehälter fehlt',
    low_battery: 'Akku schwach', charging_error: 'Ladefehler', battery_error: 'Akkufehler', filter_blocked: 'Filter verstopft',
    vertical_bumper_pressed: 'Oberer Stoßfänger gedrückt', robot_tilted: 'Roboter gekippt', clean_tank_empty: 'Frischwassertank leer',
    dirty_tank_full: 'Schmutzwassertank voll', water_box_empty: 'Wasserbehälter leer', no_mop: 'Mopp fehlt',
    strainer_error: 'Schmutzfänger prüfen', dock: 'Dock-Fehler', mop_washing_error: 'Moppwäsche gestört',
  };
  var MODE = {
    smart_mode: 'Smart', custom: 'Eigene', off: 'Aus', quiet: 'Leise', balanced: 'Ausgewogen', turbo: 'Turbo', max: 'Max',
    max_plus: 'Max+', gentle: 'Sanft', standard: 'Standard', strong: 'Stark', low: 'Gering', mild: 'Gering', medium: 'Mittel',
    moderate: 'Mittel', high: 'Hoch', intense: 'Intensiv', extreme: 'Extrem', deep: 'Gründlich', deep_plus: 'Gründlich+',
    fast: 'Schnell', vacuum: 'Saugen', mop: 'Wischen', vacuum_and_mop: 'Saugen & wischen', vac_then_mop: 'Erst saugen, dann wischen',
    vac_followed_by_mop: 'Erst saugen, dann wischen', smart: 'Smart', light: 'Leicht', auto: 'Auto',
    vac_and_mop: 'Saugen & wischen', unknown: 'Unbekannt', custom_water_flow: 'Eigene Wassermenge', min: 'Minimal',
    slight: 'Leicht', off_raise_main_brush: 'Aus (Bürste angehoben)', silent: 'Leise', mop_only: 'Nur wischen',
  };
  var modeName = function (o) { return MODE[o] || String(o).replace(/_/g, ' ').replace(/^\w/, function (x) { return x.toUpperCase(); }); };
  /* Verschleißteile: [translation_key des Sensors, Name, Icon, Nennlaufzeit in Std. oder null, translation_key der Reset-Taste] */
  var PARTS = [
    ['main_brush_time_left', 'Hauptbürste', 'mdi:brush', 300, 'reset_main_brush_consumable'],
    ['side_brush_time_left', 'Seitenbürste', 'mdi:broom', 200, 'reset_side_brush_consumable'],
    ['filter_time_left', 'Filter', 'mdi:air-filter', 150, 'reset_air_filter_consumable'],
    ['sensor_time_left', 'Sensoren reinigen', 'mdi:eye-outline', 30, 'reset_sensor_consumable'],
    ['strainer_time_left', 'Schmutzfänger (Station)', 'mdi:filter-outline', null, null],
  ];

  var VFIND = {
    status: { keys: ['status'], domain: 'sensor' }, room: { keys: ['current_room'], domain: 'sensor' },
    progress: { keys: ['clean_percent'], domain: 'sensor' }, area: { keys: ['cleaning_area'], domain: 'sensor' },
    battery: { dc: 'battery', domain: 'sensor' }, charging: { dc: 'battery_charging', domain: 'binary_sensor' },
    time: { keys: ['cleaning_time'], domain: 'sensor' }, dnd: { keys: ['dnd_switch'], domain: 'switch' },
    dndStart: { keys: ['dnd_start_time'], domain: 'time' }, dndEnd: { keys: ['dnd_end_time'], domain: 'time' },
    drying: { keys: ['mop_drying'], domain: 'switch' }, dryLeft: { keys: ['mop_drying_remaining_time'], domain: 'sensor' },
    empty: { keys: ['dust_emptying'], domain: 'switch' }, wash: { keys: ['mop_washing'], domain: 'switch' },
    cleanMode: { keys: ['cleaning_mode'], domain: 'select' }, mopInt: { keys: ['mop_intensity'], domain: 'select' },
    mopMode: { keys: ['mop_mode'], domain: 'select' }, emptyMode: { keys: ['dust_collection_mode'], domain: 'select' },
    lock: { keys: ['child_lock'], domain: 'switch' }, volume: { keys: ['volume'], domain: 'number' },
    err: { keys: ['vacuum_error'], domain: 'sensor' }, dockErr: { keys: ['dock_error'], domain: 'sensor' },
    water: { keys: ['water_shortage'], domain: 'binary_sensor' }, dirty: { keys: ['dirty_box_full'], domain: 'binary_sensor' },
    clean: { keys: ['clean_box_empty'], domain: 'binary_sensor' }, mopOn: { keys: ['mop_attached'], domain: 'binary_sensor' },
    boxOn: { keys: ['water_box_attached'], domain: 'binary_sensor' }, lastStart: { keys: ['last_clean_start'], domain: 'sensor' },
    lastEnd: { keys: ['last_clean_end'], domain: 'sensor' }, total: { keys: ['total_cleaning_count'], domain: 'sensor' },
    totalTime: { keys: ['total_cleaning_time'], domain: 'sensor' }, totalArea: { keys: ['total_cleaning_area'], domain: 'sensor' },
  };
  var VOWN = { status: 'entity_status', room: 'entity_room', progress: 'entity_progress', area: 'entity_area',
    battery: 'entity_battery', dnd: 'entity_dnd', drying: 'entity_drying' };

  V.resolve = function (entity, VV, states, hass) {
    VV = VV || {};
    var id = entity && entity.entity_id;
    var base = String(id || '').replace(/^vacuum\./, '');
    var ex = function (e) { return e && states[e] ? e : null; };
    var plug = ex(VV.plug_entity);
    var c = {
      st: id, vac: true, name: VV.robot_name || 'Saugroboter', entry: null, dryer: false,
      price: window.casoraPriceKwh ? window.casoraPriceKwh(VV.price_kwh) : null, color: VV.chart_color || '#00C3D0',
      status: VV.entity_status || null, room: VV.entity_room || null, progress: VV.entity_progress || null,
      area: VV.entity_area || null, battery: VV.entity_battery || null, charging: null, time: null,
      map: VV.entity_map || null, dnd: VV.entity_dnd || null, dndStart: null, dndEnd: null,
      drying: VV.entity_drying || null, dryLeft: null, empty: null, wash: null, cleanMode: null, mopInt: null,
      mopMode: null, emptyMode: null, lock: null, volume: null, err: null, dockErr: null, water: null, dirty: null,
      clean: null, mopOn: null, boxOn: null, lastStart: null, lastEnd: null, total: null, totalTime: null,
      totalArea: null, dayBase: VV.entity_day_base || null, routines: [], parts: [], plug: plug,
      power: null, volt: null, amp: null, energy: null,
      activeStates: VV.active_states || [],
    };
    /* Casora: sprachunabhängig über translation_keys der Roborock-Integration
       (Roboter + Station als Geschwister-Gerät). Feste Variablen haben Vorrang. */
    var CD = window.casoraDevice;
    if (CD && id && hass) {
      var F = CD.map(hass, id, VFIND, { siblings: true });
      Object.keys(VFIND).forEach(function (key) {
        if (VOWN[key] && VV[VOWN[key]]) return;
        if (F[key] && states[F[key]]) c[key] = F[key];
      });
      /* Akku und Ladestatus tragen bei Roborock keinen eigenen Schlüssel und sind Diagnose-
         Entitäten (der Finder lässt die bei device_class aus): am Roboter selbst nachsehen. */
      var own = CD.entities(hass, id, { children: false });
      [['battery', 'battery', 'sensor'], ['charging', 'battery_charging', 'binary_sensor']].forEach(function (b) {
        if (c[b[0]]) return;
        var hit = own.filter(function (e) { return e.dc === b[1] && e.domain === b[2] && states[e.entity_id]; })[0];
        if (hit) c[b[0]] = hit.entity_id;
      });
      var spec = {};
      PARTS.forEach(function (p) { spec['s_' + p[0]] = { keys: [p[0]], domain: 'sensor' }; if (p[4]) spec['r_' + p[0]] = { keys: [p[4]], domain: 'button' }; });
      var FP = CD.map(hass, id, spec, { siblings: true });
      var parts = PARTS.map(function (p) {
        var s = FP['s_' + p[0]];
        return s && states[s] ? [s, p[1], p[2], p[3], FP['r_' + p[0]] || null] : null;
      }).filter(Boolean);
      if (parts.length) c.parts = parts;
      // Routinen: Tasten am Roboter/an der Station ohne eigenen Schlüssel (vom Nutzer angelegt).
      var rt = CD.entities(hass, id, { siblings: true }).filter(function (e) {
        return e.domain === 'button' && !e.key && !e.category && states[e.entity_id];
      }).map(function (e) { return e.entity_id; });
      if (rt.length && !c.routines.length) c.routines = rt;
      if (c.plug) {
        var pm = CD.map(hass, c.plug, { power: { dc: 'power', domain: 'sensor' }, volt: { dc: 'voltage', domain: 'sensor' },
          amp: { dc: 'current', domain: 'sensor' }, energy: { dc: 'energy', domain: 'sensor' } });
        ['power', 'volt', 'amp', 'energy'].forEach(function (k) { if (pm[k] && states[pm[k]]) c[k] = pm[k]; });
      } else {
        var pl = CD.companionPlug(hass, id);
        if (pl) { c.plug = pl.switch; c.power = pl.power; c.volt = pl.voltage; c.amp = pl.current; c.energy = pl.energy; }
      }
    }
    return c;

  };
  V.watch = function (c) {
    return [c.st, c.status, c.room, c.progress, c.area, c.battery, c.charging, c.time, c.map, c.dnd, c.dndStart, c.dndEnd, c.drying,
      c.dryLeft, c.empty, c.wash, c.cleanMode, c.mopInt, c.mopMode, c.emptyMode, c.lock, c.volume, c.err, c.dockErr, c.water,
      c.dirty, c.clean, c.mopOn, c.boxOn, c.lastStart, c.lastEnd, c.total, c.dayBase, c.plug, c.power, c.energy]
      .concat(c.parts.map(function (p) { return p[0]; })).filter(Boolean);
  };

  /* Zustand: { label, run (fährt/reinigt), paused, dock (Station arbeitet), error, dead } */
  V.state = function (c, states) {
    var raw = String((states[c.st] && states[c.st].state) || '').toLowerCase();
    var status = String(U.str(states, c.status) || '').toLowerCase();
    var drying = c.drying && states[c.drying] && states[c.drying].state === 'on';
    var run = CLEAN.indexOf(raw) !== -1 || CLEAN.indexOf(status) !== -1;
    var paused = raw === 'paused' || status === 'paused';
    var dock = !run && (DOCKWORK.indexOf(status) !== -1 || drying);
    var error = raw === 'error' || status === 'error';
    var label = drying && !run && DOCKWORK.indexOf(status) === -1 ? 'Trocknet Mopp'
      : STATUS[status] || (raw === 'docked' ? 'Angedockt' : raw === 'idle' ? 'Bereit' : raw === 'unavailable' ? 'Nicht verfügbar' : raw || 'Unbekannt');
    return { label: label, run: run, paused: paused, dock: dock, error: error, dead: raw === 'unavailable',
      busy: run || paused || (c.activeStates || []).indexOf(status) !== -1 };
  };

  /* Fällige Pflege: Teile unter 0,5 Std. (wie die Wartungs-Automation) + Station/Tanks */
  V.todo = function (c, states) {
    var out = [];
    c.parts.forEach(function (p) {
      var h = U.num(states, p[0]);
      if (h != null && h < 0.5) out.push({ label: p[1].replace(' (Station)', ''), level: 1 });
    });
    var on = function (e) { return e && states[e] && states[e].state === 'on'; };
    if (on(c.dirty)) out.unshift({ label: 'Schmutzwasser leeren', level: 2 });
    if (on(c.clean) || on(c.water)) out.unshift({ label: 'Frischwasser auffüllen', level: 2 });
    var e = U.str(states, c.err);
    if (e && ERRORS[e] !== null) out.unshift({ label: ERRORS[e] || e.replace(/_/g, ' '), level: 2 });
    var de = U.str(states, c.dockErr);
    if (de && de !== 'ok') out.unshift({ label: 'Station: ' + (ERRORS[de] || de.replace(/_/g, ' ')), level: 2 });
    return out;
  };
  V.level = function (entity, VV, states, hass) {
    if (!entity) return 0;
    var c = V.resolve(entity, VV, states, hass);
    if (V.state(c, states).busy) return 0;
    return V.todo(c, states).reduce(function (m, t) { return Math.max(m, t.level); }, 0);
  };
  /* Kachel-Zusatz im Ruhezustand: „Sensoren reinigen +1“ */
  V.hint = function (entity, VV, states, hass) {
    if (!entity) return '';
    var c = V.resolve(entity, VV, states, hass);
    if (V.state(c, states).busy) return '';
    var t = V.todo(c, states);
    return t.length ? t[0].label + (t.length > 1 ? ' +' + (t.length - 1) : '') : '';
  };

  /* Karte: transparente Ränder abschneiden und zentrieren (wie bisher, nur als Funktion) */
  V.fit = function (i) {
    var p = i.parentNode;
    if (!p) return;
    var W = p.clientWidth, H = p.clientHeight;
    try {
      var n = i.naturalWidth, h = i.naturalHeight, k = Math.min(1, 240 / n), cv = document.createElement('canvas');
      cv.width = Math.round(n * k); cv.height = Math.round(h * k);
      var g = cv.getContext('2d');
      g.drawImage(i, 0, 0, cv.width, cv.height);
      var d = g.getImageData(0, 0, cv.width, cv.height).data, x0 = cv.width, y0 = cv.height, x1 = -1, y1 = -1;
      for (var y = 0; y < cv.height; y++) for (var z = 0; z < cv.width; z++) {
        if (d[(y * cv.width + z) * 4 + 3] > 8) { if (z < x0) x0 = z; if (z > x1) x1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      if (x1 < x0) return;
      var bx = x0 / k, by = y0 / k, bw = (x1 - x0 + 1) / k, bh = (y1 - y0 + 1) / k, s = Math.min(W / bw, H / bh) * 0.92;
      var css = 'position:absolute;max-width:none;width:' + (n * s) + 'px;height:' + (h * s) + 'px;left:' + (W / 2 - (bx + bw / 2) * s)
        + 'px;top:' + (H / 2 - (by + bh / 2) * s) + 'px;display:block;';
      i.style.cssText = css;
      V._mapCss = css; V._mapW = W;
    } catch (e) {}
  };

  /* Raumauswahl bleibt über Re-Render erhalten */
  V.sel = V.sel || {};
  V.roomTap = function (el, ev, kind) {
    if (kind === 's') { var t0 = ev.touches && ev.touches[0]; V._ty = t0 ? t0.clientY : 0; V._tx = t0 ? t0.clientX : 0; return; }
    if (kind === 't') {
      var t = ev.changedTouches && ev.changedTouches[0];
      if (t && (Math.abs(t.clientY - (V._ty || 0)) > 10 || Math.abs(t.clientX - (V._tx || 0)) > 10)) return;
      if (ev.cancelable) ev.preventDefault();
      V._t = Date.now();
    } else if (Date.now() - (V._t || 0) < 700) return;
    ev.stopPropagation();
    var box = el.closest('.hv-rooms');
    if (!box) return;
    var vid = box.getAttribute('data-vac');
    var sel = V.sel[vid] || (V.sel[vid] = []);
    if (el.classList.contains('hv-go')) {
      if (!sel.length) return;
      var ha = document.querySelector('home-assistant');
      if (ha && ha.hass) ha.hass.callService('vacuum', 'clean_area', { cleaning_area_id: sel.slice() }, { entity_id: vid });
      V.sel[vid] = [];
      box.querySelectorAll('.hv-room.on').forEach(function (r) { r.classList.remove('on'); });
      el.classList.add('dis'); el.textContent = 'Reinigung gestartet';
      return;
    }
    var a = el.getAttribute('data-area');
    var i = sel.indexOf(a);
    if (i === -1) sel.push(a); else sel.splice(i, 1);
    el.classList.toggle('on', i === -1);
    var go = box.querySelector('.hv-go');
    go.classList.toggle('dis', !sel.length);
    go.textContent = V.goLabel(sel.length);
  };
  V.goLabel = function (n) { return n ? (n === 1 ? '1 Raum reinigen' : n + ' Räume reinigen') : 'Räume auswählen'; };
  V.areas = {};

  V.inner = function (kind, c, states) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var s = V.state(c, states);
    var esc = UI.esc, T = UI.tokens;
    var on = function (e) { return e && states[e] && states[e].state === 'on'; };
    var ok = function (e) { return e && states[e] && states[e].state !== 'unavailable'; };
    var pct = U.num(states, c.progress), bat = U.num(states, c.battery), area = U.num(states, c.area), mins = U.num(states, c.time);
    var room = U.str(states, c.room);
    var HH = window._casoraHH, SF = !!(HH && HH.on());

    if (kind === 'v_hero') {
      var ha = document.querySelector('home-assistant');
      if (ha && ha.hass) L.fetch(c, ha.hass, false);
      var sub = [], tone = s.error ? 'bad' : null;
      if (s.run || s.paused) {
        if (room) sub.push(room);
        if (area != null) sub.push(U.f(area, 1) + ' m²');
        if (mins != null) sub.push(U.dur(mins));
      } else {
        if (bat != null) sub.push('Akku ' + Math.round(bat) + ' %' + (on(c.charging) ? ' · lädt' : ''));
        var le = U.str(states, c.lastEnd);
        if (le) sub.push('zuletzt ' + U.day(new Date(le)).replace(/^(Heute|Gestern)$/, function (x) { return x.toLowerCase(); }) + ', ' + U.clock(new Date(le)) + ' Uhr');
      }
      var todo = V.todo(c, states);
      if (!s.run && todo.length && todo[0].level === 2) { sub.push(todo[0].label); tone = 'bad'; }
      var value = s.label, unit = null;
      if ((s.run || s.paused) && pct != null) { value = String(Math.round(pct)); unit = '% · ' + s.label; }
      /* Weich (Entschlacken): „Akku 93 % · zuletzt Sa. 11:18, 20 m²“ – die Fläche der letzten Reinigung gehört dazu. */
      if (SF && !(s.run || s.paused) && area != null && sub.length && /^zuletzt /.test(sub[sub.length - 1])) sub[sub.length - 1] += ', ' + U.f(area, 1) + ' m²';
      var out = UI.hero({ value: value, unit: unit, sub: sub.join(' · ') || null, subTone: tone, center: true });
      /* Große Tasten: Zum Dock · Start/Pause · Orten */
      var svc = function (service) { return esc(JSON.stringify({ domain: 'vacuum', service: service, data: {}, target: { entity_id: c.st } })); };
      var mdi = function (n, sz, col) { return '<ha-icon icon="' + n + '" style="--mdc-icon-size:' + sz + 'px;width:' + sz + 'px;height:' + sz + 'px;display:block;color:' + (col || 'currentColor') + ';"></ha-icon>'; };
      var docked = !s.run && !s.paused;
      var main = s.run ? { s: svc('pause'), i: 'mdi:pause', l: 'Pause' } : { s: svc('start'), i: 'mdi:play', l: s.paused ? 'Weiter' : 'Start' };
      /* Weich: drei runde Pillen mit Symbol und Text, die Hauptaktion gefüllt. */
      if (SF) {
        var pill = function (cls, s0, ic, l) {
          return '<div class="hh-pill' + cls + '"' + (cls.indexOf('dis') > -1 ? '' : ' data-casora-svc="' + s0 + '"') + '>' + mdi(ic, 20) + '<span style="pointer-events:none;">' + l + '</span></div>';
        };
        return out + HH.pillCss + '<style>.hh-pill > *{pointer-events:none;}</style><div class="hh-pills" style="margin-top:12px;">'
          + pill(s.dead || docked ? ' dis' : '', svc('return_to_base'), 'mdi:home-import-outline', 'Zum Dock')
          + pill(' pri' + (s.dead ? ' dis' : ''), main.s, main.i, main.l)
          + pill(s.dead ? ' dis' : '', svc('locate'), 'mdi:map-marker-radius-outline', 'Orten')
          + '</div>';
      }
      out += '<style>.hv-ctl{display:flex;align-items:center;justify-content:center;gap:22px;margin-top:14px;color:' + T.ink + ';font-family:' + T.font + ';}'
        + '.hv-b{border-radius:999px;display:grid;place-items:center;cursor:pointer;line-height:0;flex:none;width:52px;height:52px;'
        + 'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));transition:background-color .16s ease, transform .12s ease;user-select:none;-webkit-user-select:none;}'
        + '.hv-b > *{pointer-events:none;}.hv-b.lg{width:68px;height:68px;background:' + T.ink + ';color:var(--casora-popup-ui-on-ink, #000);}'
        + '.hv-b.dis{opacity:.3;pointer-events:none;}.hv-b:active{transform:scale(.92);}'
        + '.hv-cap{display:flex;justify-content:center;gap:22px;margin-top:6px;font-size:12px;color:' + T.ink3 + ';font-family:' + T.font + ';}'
        + '.hv-cap span{width:52px;display:flex;justify-content:center;white-space:nowrap;overflow:visible;}.hv-cap span.lg{width:68px;}</style>'
        + '<div class="hv-ctl">'
        + '<div class="hv-b' + (s.dead || docked ? ' dis' : '') + '" data-casora-svc="' + svc('return_to_base') + '">' + mdi('mdi:home-import-outline', 24) + '</div>'
        + '<div class="hv-b lg' + (s.dead ? ' dis' : '') + '" data-casora-svc="' + main.s + '">' + mdi(main.i, 32, '#000') + '</div>'
        + '<div class="hv-b' + (s.dead ? ' dis' : '') + '" data-casora-svc="' + svc('locate') + '">' + mdi('mdi:map-marker-radius-outline', 24) + '</div>'
        + '</div><div class="hv-cap"><span>Zum Dock</span><span class="lg">' + main.l + '</span><span>Orten</span></div>';
      return out;
    }

    if (kind === 'v_map') {
      var url = c.map && states[c.map] && (states[c.map].attributes || {}).entity_picture;
      if (!url) return '';
      var mapCss = V._mapCss || 'width:100%;height:100%;object-fit:contain;display:block;';
      /* Überschrift wie bei allen Abschnitten (24.09.: sonst sitzt die Karte höher als links die erste Überschrift). */
      return (SF ? HH.label('Karte') : '<div style="font-family:var(--primary-font-family,system-ui);font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);'
        + 'color:var(--casora-h15-c, var(--casora-popup-tiles-text-primary,#fff));text-align:left;padding:0 4px 8px;">Karte</div>')
        + '<div style="position:relative;width:100%;aspect-ratio:16/10;border-radius:var(--casora-popup-row-radius, 20px);overflow:hidden;'
        + 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));box-shadow:var(--casora-popup-plate-shadow, none);">'
        + '<img src="' + esc(url) + '" alt="" style="' + mapCss + '" onload="window._casoraVac&&window._casoraVac.fit(this)" onerror="this.remove()"></div>';
    }

    if (kind === 'v_attn') {
      /* Weich (Entschlacken): nur, was gerade etwas braucht – Fehler, Station/Tanks, Mopp/Wasserkasten
         und Verschleißteile unter 20 %. Alles Weitere steht unter „Mehr“ (Pflege). */
      var at = V.todo(c, states).filter(function (t) { return t.level === 2; }).map(function (t) {
        return { icon: 'mdi:alert-circle-outline', iconTone: 'bad', label: t.label };
      });
      if (c.mopOn && states[c.mopOn] && states[c.mopOn].state === 'off') at.push({ icon: 'mdi:water-off-outline', iconTone: 'warn', label: 'Mopp nicht angebracht' });
      if (c.boxOn && states[c.boxOn] && states[c.boxOn].state === 'off') at.push({ icon: 'mdi:cup-off-outline', iconTone: 'warn', label: 'Wasserkasten fehlt' });
      c.parts.forEach(function (p) {
        var h3 = U.num(states, p[0]);
        if (h3 == null) return;
        var due3 = h3 < 0.5, left3 = p[3] ? Math.max(0, Math.min(1, h3 / p[3])) : null;
        if (!due3 && !(left3 != null && left3 < 0.2)) return;
        var r3 = { icon: p[2], iconTone: 'warn', label: p[1], sub: due3 ? null : 'noch ' + (h3 >= 10 ? U.f(Math.round(h3), 0) + ' Betriebsstd.' : U.dur(h3 * 60)),
          value: due3 ? (h3 < -1 ? 'Überfällig' : 'Fällig') : Math.round(left3 * 100) + ' %', valueTone: 'warn' };
        if (due3 && ok(p[4])) { r3.action = 'Erledigt'; r3.confirm = 'Zurücksetzen'; r3.svc = { domain: 'button', service: 'press', target: { entity_id: p[4] } }; r3.value = null; }
        at.push(r3);
      });
      return at.length ? UI.group(at, 'Braucht Aufmerksamkeit') : '';
    }

    if (kind === 'v_alerts') {
      var al = V.todo(c, states).filter(function (t) { return t.level === 2; }).map(function (t) {
        return { icon: 'mdi:alert-circle-outline', iconTone: 'bad', label: t.label };
      });
      if (c.mopOn && states[c.mopOn] && states[c.mopOn].state === 'off') al.push({ icon: 'mdi:water-off-outline', iconTone: 'warn', label: 'Mopp nicht angebracht' });
      if (c.boxOn && states[c.boxOn] && states[c.boxOn].state === 'off') al.push({ icon: 'mdi:cup-off-outline', iconTone: 'warn', label: 'Wasserkasten fehlt' });
      return al.length ? UI.group(al, 'Hinweise') : '';
    }

    /* Popup-Aufbau (24.09.2026): Tasten-Gruppen in Glaskarten wie alle Abschnitte, Überschrift darüber (Bedien-Popup). */
    var PL = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
      + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
      + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);padding:14px;';
    var HEAD = function (t) { return '<div style="font-family:' + T.font + ';font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');text-align:left;padding:0 4px 8px;">' + t + '</div>'; };
    var CAP = function (t) { return '<div style="font-family:' + T.font + ';font-size:13px;color:' + T.ink3 + ';text-align:left;padding:0 2px 8px;">' + t + '</div>'; };
    var CARD = function (inner) { return '<style>.hv-card .hui-seg{justify-content:flex-start;}</style><div class="hv-card" style="' + PL + '">' + inner + '</div>'; };
    /* Weich: Etiketten in Großbuchstaben, Segmente frei ohne Karte, Unterzeilen gedämpft. */
    if (SF) {
      HEAD = function (t) { return HH.label(t); };
      CAP = function (t) { return '<div style="font-family:' + T.font + ';font-size:13px;font-weight:600;color:var(--casora-soft-sub, ' + T.ink2 + ');text-align:left;padding:0 6px 8px;">' + t + '</div>'; };
      CARD = function (inner) { return HH.dense(inner, true); };
    }

    if (kind === 'v_run') {
      var rows = [];
      if (s.run || s.paused) {
        if (pct != null) rows.push({ icon: 'mdi:progress-clock', iconTone: 'accent', label: 'Fortschritt', value: Math.round(pct) + ' %',
          bar: Math.max(0, Math.min(1, pct / 100)), barTone: 'accent', entity: c.progress });
        if (room) rows.push({ icon: 'mdi:map-marker-outline', iconTone: 'accent', label: 'Aktueller Raum', value: room });
        if (area != null) rows.push({ icon: 'mdi:floor-plan', iconTone: 'accent', label: 'Gereinigte Fläche', value: U.f(area, 1) + ' m²' });
        var ls = U.str(states, c.lastStart);
        if (mins != null) rows.push({ icon: 'mdi:timer-outline', iconTone: 'accent', label: 'Läuft seit', value: U.dur(mins) });
        else if (ls) rows.push({ icon: 'mdi:clock-start', iconTone: 'accent', label: 'Gestartet', value: U.clock(new Date(ls)) + ' Uhr' });
        /* Weich: Fortschritt als breiter Balken über den Zeilen. */
        if (SF) return UI.group(rows.filter(function (r) { return r.label !== 'Fortschritt'; }), 'Reinigung');
        if (SF && pct != null) return HH.label('Reinigung') + HH.bar({ pct: pct, text: Math.round(pct) + ' %', word: room || s.label })
          + (rows.length > 1 ? '<div style="height:8px"></div>' + UI.group(rows.slice(1)) : '');
        return UI.group(rows, 'Reinigung');
      }
      var a0 = U.str(states, c.lastStart), e0 = U.str(states, c.lastEnd);
      if (a0 && e0) {
        var ta = new Date(a0), te = new Date(e0);
        rows.push({ icon: 'mdi:calendar-check-outline', iconTone: DIM, label: U.day(te), sub: U.clock(ta) + '–' + U.clock(te) + ' Uhr',
          value: U.dur((te - ta) / 60000) });
      }
      if (area != null) rows.push({ icon: 'mdi:floor-plan', iconTone: DIM, label: 'Fläche', value: U.f(area, 1) + ' m²' });
      return rows.length ? UI.group(rows, 'Letzte Reinigung') : '';
    }

    if (kind === 'v_rooms') {
      var ids = V.areas[c.st] || [];
      var hass = (document.querySelector('home-assistant') || {}).hass;
      ids = ids.filter(function (a) { return hass && hass.areas && hass.areas[a]; });
      if (!ids.length) return '';
      var sel = (V.sel[c.st] || []).filter(function (a) { return ids.indexOf(a) !== -1; });
      V.sel[c.st] = sel;
      var h = 'window._casoraVac.roomTap(this,event,';
      var btn = function (cls, inner, extra) {
        return '<div class="' + cls + '"' + (extra || '') + ' ontouchstart="' + h + '\'s\')" ontouchend="' + h + '\'t\')" onclick="' + h + '\'c\')">' + inner + '</div>';
      };
      return '<style>.hv-rooms{font-family:' + T.font + ';text-align:left;}'
        + '.hv-rl{font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');padding:0 4px 8px;}'
        + '.hv-rw{display:flex;flex-wrap:wrap;gap:7px;}'
        + '.hv-room{font-size:14px;font-weight:500;padding:10px 14px;border-radius:999px;cursor:pointer;user-select:none;-webkit-user-select:none;'
        + 'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));color:' + T.ink + ';transition:background-color .16s ease, color .16s ease;}'
        + '.hv-room.on{background:' + T.ink + ';color:var(--casora-popup-ui-on-ink, #000);}'
        + '.hv-go{margin-top:12px;text-align:center;font-size:16px;font-weight:600;padding:14px;border-radius:var(--casora-popup-row-radius, 20px);cursor:pointer;'
        + 'background:var(--casora-color-teal, #00C3D0);color:#fff;transition:opacity .16s ease;user-select:none;-webkit-user-select:none;}'
        + '.hv-go.dis{opacity:.35;pointer-events:none;}</style>'
        /* Weich: Raum-Chips wie die Szenen-Chips im Licht-Popup, Start als runde Pille. */
        + (SF ? '<style>.hv-rw{gap:8px;}.hv-room{font-size:13px;font-weight:600;padding:10px 16px;background:var(--casora-lps-chip, var(--casora-soft-row-fill));'
          + 'color:var(--casora-lps-chip-ink, var(--casora-soft-sub));}.hv-room.on{background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, ' + T.ink + ');'
          + 'box-shadow:var(--casora-soft-seg-on-shadow, none);}.hv-go{border-radius:999px;font-size:14px;padding:13px;background:var(--casora-popup-ui-action, #276B64);'
          + 'color:var(--casora-popup-ui-on-action, #fff);}</style>' : '')
        + '<div class="hv-rooms" data-vac="' + esc(c.st) + '">' + (SF ? HH.label('Räume reinigen') + '<div><div class="hv-rw">'
          : '<div class="hv-rl">Räume reinigen</div><div style="' + PL + '"><div class="hv-rw">')
        + ids.map(function (a) { return btn('hv-room' + (sel.indexOf(a) !== -1 ? ' on' : ''), esc(hass.areas[a].name), ' data-area="' + esc(a) + '"'); }).join('')
        + '</div>' + btn('hv-go' + (sel.length ? '' : ' dis'), V.goLabel(sel.length)) + '</div></div>';
    }

    if (kind === 'v_mode') {
      /* Eine Karte „Reinigungsmodus“ mit Unterzeilen je Einstellung statt loser Tasten-Blöcke. */
      var part = function (items, cap) { return (cap ? CAP(cap) : '') + UI.segments(items); };
      var seg = function (e, cap) {
        var st = e && states[e];
        if (!st || st.state === 'unavailable') return '';
        var opts = (st.attributes || {}).options || [];
        if (opts.length < 2) return '';
        return part(opts.map(function (o) {
          return { label: modeName(o), active: st.state === o, svc: { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: e } } };
        }), cap);
      };
      var bits = [];
      var m0 = seg(c.cleanMode, null); if (m0) bits.push(m0);
      var smart = c.cleanMode && states[c.cleanMode] && states[c.cleanMode].state === 'smart_mode';
      if (!smart) {
        var va = (states[c.st] || {}).attributes || {};
        var speeds = Array.isArray(va.fan_speed_list) ? va.fan_speed_list : [];
        if (speeds.length > 1) bits.push(part(speeds.map(function (o) {
          return { label: modeName(o), active: va.fan_speed === o, svc: { domain: 'vacuum', service: 'set_fan_speed', data: { fan_speed: o }, target: { entity_id: c.st } } };
        }), 'Saugstärke'));
        var w1 = seg(c.mopInt, 'Wasserstärke'); if (w1) bits.push(w1);
        var w2 = seg(c.mopMode, 'Wischmodus'); if (w2) bits.push(w2);
      } else if (bits.length) {
        bits.push(SF ? UI.note('Smart wählt Saugstärke und Wischen je Raum selbst.')
          : '<div style="font-family:' + T.font + ';font-size:13px;color:' + T.ink3 + ';text-align:left;padding:0 2px;">Smart wählt Saugstärke und Wischen je Raum selbst.</div>');
      }
      var outM = bits.length ? HEAD('Reinigungsmodus') + CARD(bits.join('<div style="height:16px"></div>')) : '';
      var rt = c.routines.filter(ok).map(function (b) {
        var nm = String((states[b].attributes || {}).friendly_name || b);
        /* Gerätenamen vorn weglassen: „<Roboter> Intensiv“ → „Intensiv“. */
        var bd = hass && hass.entities && hass.entities[b] && hass.devices && hass.devices[hass.entities[b].device_id];
        [bd && bd.name_by_user, bd && bd.name].forEach(function (dn) {
          if (dn && nm.length > dn.length && nm.toLowerCase().indexOf(String(dn).toLowerCase() + ' ') === 0) nm = nm.slice(dn.length + 1);
        });
        return { icon: 'mdi:play-circle-outline', iconTone: 'accent', label: nm, sub: 'Programm aus der Roborock-App',
          svc: { domain: 'button', service: 'press', target: { entity_id: b } }, confirm: 'Starten' };
      });
      if (rt.length && !s.run) outM += (outM ? '<div style="height:18px"></div>' : '') + UI.group(rt, 'Programme');
      return outM;
    }

    if (kind === 'v_dock') {
      var rd = [];
      var act = function (e, icon, label, runLabel, sub) {
        if (!ok(e)) return;
        var o = on(e);
        rd.push({ icon: icon, iconTone: o ? 'accent' : DIM, label: label, sub: o ? runLabel : sub || null, value: o ? 'Läuft' : '',
          valueTone: 'accent', svc: { domain: 'switch', service: o ? 'turn_off' : 'turn_on', target: { entity_id: e } } });
      };
      var docked2 = !s.run && !s.paused;
      if (docked2) {
        act(c.empty, 'mdi:delete-empty-outline', 'Staubbehälter leeren', 'Wird geleert');
        act(c.wash, 'mdi:water-sync', 'Mopp waschen', 'Wird gewaschen');
        var dl = U.num(states, c.dryLeft);
        act(c.drying, 'mdi:weather-windy', 'Mopp trocknen', dl != null && dl > 0 ? 'noch ' + U.dur(dl * 60) : 'Trocknet');
      }
      var em = c.emptyMode && states[c.emptyMode];
      var out3 = rd.length ? UI.group(rd, 'Station') : '';
      if (em && em.state !== 'unavailable') {
        out3 += (out3 ? '<div style="height:18px"></div>' : '') + HEAD('Automatisch leeren') + CARD(UI.segments(((em.attributes || {}).options || []).map(function (o) {
          return { label: modeName(o), active: em.state === o, svc: { domain: 'select', service: 'select_option', data: { option: o }, target: { entity_id: c.emptyMode } } };
        })));
      }
      return out3;
    }

    if (kind === 'v_power') {
      var rb = [];
      /* Weich (Entschlacken): Akku steht im Kopf, Leistung fällt weg – nur der Schalter der Station bleibt. */
      if (SF) {
        var sw0 = c.plug && states[c.plug];
        if (!sw0) return '';
        var po0 = sw0.state === 'on', dead0 = sw0.state === 'unavailable';
        return UI.group([{ icon: 'mdi:power-plug', iconTone: po0 ? 'good' : DIM, label: 'Station', sub: dead0 ? 'Steckdose nicht erreichbar' : (po0 ? null : 'Roboter lädt nicht'),
          value: dead0 ? 'Offline' : po0 ? 'An' : 'Aus', valueTone: dead0 || !po0 ? 'bad' : null,
          svc: dead0 ? null : { domain: 'switch', service: po0 ? 'turn_off' : 'turn_on', target: { entity_id: c.plug } }, confirm: po0 ? 'Ausschalten' : null }], 'Strom');
      }
      // Akku-Stufen (casoraBattery): ≤ 10 % rot, ≤ 20 % orange – auch beim Laden bleibt der Balken ehrlich.
      var blv = (window.casoraBattery ? window.casoraBattery.level(bat) : (bat) <= 10 ? 'crit' : (bat) <= 20 ? 'low' : 'ok'), btn = (window.casoraBattery ? window.casoraBattery.tone(blv) : null);
      if (bat != null) rb.push({ icon: on(c.charging) ? 'mdi:battery-charging' : 'mdi:battery', iconTone: btn || 'good', label: 'Akku',
        sub: on(c.charging) ? 'Lädt' : null, value: Math.round(bat) + ' %', valueTone: btn, bar: bat / 100, barTone: btn || 'good', entity: c.battery });
      var sw = c.plug && states[c.plug];
      if (sw) {
        var po = sw.state === 'on', dead = sw.state === 'unavailable';
        rb.push({ icon: 'mdi:power-plug', iconTone: po ? 'good' : DIM, label: 'Station', sub: dead ? 'Steckdose nicht erreichbar' : (po ? null : 'Roboter lädt nicht'),
          value: dead ? 'Offline' : po ? 'An' : 'Aus', valueTone: dead || !po ? 'bad' : null,
          svc: dead ? null : { domain: 'switch', service: po ? 'turn_off' : 'turn_on', target: { entity_id: c.plug } }, confirm: po ? 'Ausschalten' : null });
      }
      var pw = U.num(states, c.power);
      if (pw != null) rb.push({ icon: 'mdi:flash', iconTone: pw > 5 ? 'good' : DIM, label: 'Leistung', value: U.f(pw, pw < 10 ? 1 : 0) + ' W', entity: c.power });
      return rb.length ? L.wrap(UI.group(rb, 'Akku & Strom').replace(/data-casora-mi="/g, 'data-hp-metric="')) : '';
    }

    if (kind === 'v_care') {
      /* Restzeiten sind Betriebsstunden des Roboters, keine Kalenderzeit */
      var span = function (h) { return h >= 10 ? U.f(Math.round(h), 0) + ' Betriebsstd.' : U.dur(h * 60); };
      var rc = c.parts.map(function (p) {
        var h2 = U.num(states, p[0]);
        if (h2 == null) return null;
        var due = h2 < 0.5;
        var left = p[3] ? Math.max(0, Math.min(1, h2 / p[3])) : null;
        var warn = !due && left != null && left < 0.15;
        var row = { icon: p[2], iconTone: due ? 'warn' : warn ? 'warn' : 'accent', label: p[1],
          sub: due ? null : 'noch ' + span(h2),
          value: due ? (h2 < -1 ? 'Überfällig' : 'Fällig') : left != null ? Math.round(left * 100) + ' %' : null, valueTone: due ? 'warn' : null,
          bar: left != null ? left : null, barTone: due || warn ? 'warn' : 'good' };
        if (due && ok(p[4])) { row.action = 'Erledigt'; row.confirm = 'Zurücksetzen'; row.svc = { domain: 'button', service: 'press', target: { entity_id: p[4] } }; }
        return row;
      }).filter(Boolean);
      if (!rc.length) return '';
      var dueN = rc.filter(function (r) { return r.valueTone === 'warn' && !r.bar; }).length + rc.filter(function (r) { return /fällig/i.test(r.value || ''); }).length;
      var out4 = UI.group(rc, 'Pflege');
      if (dueN && !rc.some(function (r) { return r.action; })) out4 += '<div style="font-family:' + T.font + ';font-size:13px;color:' + T.ink3
        + ';padding:8px 4px 0;text-align:left;">Nach dem Reinigen in der Roborock-App zurücksetzen.</div>';
      return out4;
    }

    if (kind === 'v_settings') {
      var rs = [];
      if (ok(c.dnd)) {
        var dOn = on(c.dnd);
        var ds = U.str(states, c.dndStart), de = U.str(states, c.dndEnd);
        rs.push({ icon: 'mdi:moon-waning-crescent', iconTone: dOn ? 'accent' : DIM, label: 'Nicht stören',
          sub: ds && de ? ds.slice(0, 5) + '–' + de.slice(0, 5) + ' Uhr' : null, value: dOn ? 'An' : 'Aus',
          svc: { domain: 'switch', service: dOn ? 'turn_off' : 'turn_on', target: { entity_id: c.dnd } } });
      }
      if (ok(c.lock)) {
        var lOn = on(c.lock);
        rs.push({ icon: 'mdi:lock-outline', iconTone: lOn ? 'accent' : DIM, label: 'Kindersicherung', sub: 'Tasten an der Station', value: lOn ? 'An' : 'Aus',
          svc: { domain: 'switch', service: lOn ? 'turn_off' : 'turn_on', target: { entity_id: c.lock } } });
      }
      var vol = U.num(states, c.volume);
      if (vol != null) rs.push({ icon: 'mdi:volume-medium', iconTone: DIM, label: 'Lautstärke', value: Math.round(vol) + ' %', entity: c.volume });
      rs.push({ icon: 'mdi:tune-variant', label: 'Weitere Einstellungen', entity: c.st });
      return UI.group(rs, 'Einstellungen');
    }

    if (kind === 'v_stats') {
      var rs2 = [];
      var tot = U.num(states, c.total), base0 = U.num(states, c.dayBase);
      // Ohne eigenen Tageszähler: Stand um Mitternacht aus dem Verlauf (Casora).
      if (base0 == null && c.total && window.casoraDevice && window.casoraDevice.dayStart) base0 = window.casoraDevice.dayStart(c.total);
      if (tot != null && base0 != null) {
        var today = Math.max(0, Math.round(tot - base0));
        rs2.push({ icon: 'mdi:calendar-today', iconTone: 'accent', label: 'Heute', value: today === 1 ? '1 Reinigung' : today + ' Reinigungen' });
      }
      if (tot != null) rs2.push({ icon: 'mdi:counter', iconTone: 'accent', label: 'Reinigungen insgesamt', value: String(Math.round(tot)) });
      var tt = U.num(states, c.totalTime), ta2 = U.num(states, c.totalArea);
      if (tt != null) rs2.push({ icon: 'mdi:timer-sand', iconTone: 'accent', label: 'Laufzeit insgesamt', value: U.f(tt, 0) + ' Std.' });
      if (ta2 != null) rs2.push({ icon: 'mdi:floor-plan', iconTone: 'accent', label: 'Fläche insgesamt', value: U.f(ta2, 0) + ' m²' });
      if (tot && ta2) rs2.push({ icon: 'mdi:vector-square', iconTone: 'accent', label: 'Ø pro Reinigung',
        value: U.f(ta2 / tot, 1) + ' m²' + (tt ? ' · ' + U.dur(tt * 60 / tot) : '') });
      return rs2.length ? UI.group(rs2, 'Statistik') : '';
    }
    return '';
  };

  var prevInner = L.inner;
  L.inner = function (kind, c, states) { return kind.indexOf('v_') === 0 ? V.inner(kind, c, states) : prevInner(kind, c, states); };

  var hasMapS = function (c, states) { return !!(c.map && states[c.map]); };
  V.popup = function (entity, variables, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !entity) return { type: 'vertical-stack', cards: [] };
    var c = V.resolve(entity, variables, states, hass);
    var d0 = L.data[c.st];
    L.fetch(c, hass, !d0 || !d0.ts || Date.now() - d0.ts > 10000);
    /* Räume: Bereichs-Zuordnung aus der Registry (vacuum.clean_area) */
    if (hass && hass.callWS && !V.areas['_req_' + c.st]) {
      V.areas['_req_' + c.st] = 1;
      hass.callWS({ type: 'config/entity_registry/get', entity_id: c.st }).then(function (r) {
        var m = r && r.options && r.options.vacuum && r.options.vacuum.area_mapping;
        if (m) V.areas[c.st] = Object.keys(m);
      }).catch(function () {});
    }
    if (!V.areas[c.st] && Array.isArray(variables && variables.clean_areas)) V.areas[c.st] = variables.clean_areas;
    var _c = JSON.stringify(c);
    var watch = V.watch(c);
    var s = V.state(c, states);
    var fields = {}, fstyle = {};
    var add = function (k, v) { fields[k] = v; fstyle[k] = [{ 'justify-self': 'stretch' }]; };
    var tpl = function (kind, async) {
      return '[[[ const c = ' + _c + '; return window._casoraLaundry ? window._casoraLaundry.' + (async ? 'slot' : 'inner')
        + "('" + kind + "', c, states) : ''; ]]]";
    };
    add('hero', tpl('v_hero', false));
    add('map', tpl('v_map', false));

    /* Verlauf: Akku (48 h); Zeilen schalten auf Fortschritt, Leistung der Station bzw. Tagesverbrauch um. */
    if (typeof window._hpChartCfg === 'function' && c.battery) {
      window._hpChartCfg(c.battery, 'Akku', '48h', '#30D158', 150);
      if (c.progress) window._hpChartCfg(c.progress, 'Fortschritt', '24h', c.color, 150);
      if (c.power) window._hpChartCfg(c.power, 'Leistung der Station', '24h', '#FF9F0A', 150);
      if (c.energy) {
        var LBL = { colors: 'var(--casora-chart-label, rgba(255,255,255,0.42))', fontSize: '11px', fontFamily: 'var(--primary-font-family, system-ui)' };
        [['hwd7:', '7d', 'ddd'], ['hwd30:', '30d', 'dd.']].forEach(function (x) {
          var key = x[0] + c.energy;
          window._hpPlantMeta[key] = ['Verbrauch pro Tag', x[1], '#30D158'];
          window._hpPlantCfg[key] = {
            type: 'custom:apexcharts-card', graph_span: x[1], span: { end: 'day' }, header: { show: false },
            yaxis: [{ show: true, decimals: 2, apex_config: { tickAmount: 2, forceNiceScale: true, floating: true,
              labels: { offsetX: 4, offsetY: -8, align: 'left', style: LBL } } }],
            series: [{ entity: c.energy, name: 'Verbrauch', color: '#30D158', type: 'column', unit: 'kWh',
                       statistics: { type: 'change', period: 'day', align: 'start' } }],
            apex_config: {
              chart: { height: 150, background: 'transparent', toolbar: { show: false }, zoom: { enabled: false } },
              theme: { mode: 'dark' }, dataLabels: { enabled: false }, legend: { show: false },
              plotOptions: { bar: { borderRadius: 4, columnWidth: x[1] === '7d' ? '50%' : '70%' } },
              grid: { show: true, borderColor: 'var(--casora-chart-grid, rgba(255,255,255,0.10))', xaxis: { lines: { show: false } }, yaxis: { lines: { show: true } },
                      padding: { left: 0, right: 0, top: -6, bottom: -4 } },
              xaxis: { labels: { datetimeUTC: false, format: x[2], hideOverlappingLabels: true, rotate: 0, style: LBL },
                       axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
              tooltip: { theme: 'dark', x: { format: 'dd.MM.' } },
            },
          };
        });
      }
      var plate = 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));border-radius:var(--casora-popup-row-radius, 20px);'
        + 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);'
        + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);';
      if (typeof window._hpChartTitle === 'function') {
        add('chart', window._casoraHH && window._casoraHH.on() ? window._casoraHH.chart(window._hpChartTitle(c.battery), plate + 'height:100%;box-sizing:border-box;')
          : '<div style="' + plate + 'padding:14px 10px 6px;height:100%;box-sizing:border-box;">'
          + '<div class="hp-ct" style="font-family:var(--primary-font-family,system-ui);font-size:15px;font-weight:600;'
          + 'letter-spacing:-0.01em;color:var(--casora-popup-tiles-text-primary,#fff);text-align:left;padding:0 6px;">'
          + window._hpChartTitle(c.battery) + '</div>'
          + '<div class="hp-chart-slot" style="min-height:150px;margin:6px 0 0;"></div></div>');
        if (typeof window._hpChartInit === 'function') window._hpChartInit(c.battery);
      }
    }
    add('alerts', tpl('v_alerts', false));
    add('run', tpl('v_run', false));
    add('rooms', tpl('v_rooms', false));
    add('mode', tpl('v_mode', false));
    add('dock', tpl('v_dock', false));
    add('power', tpl('v_power', false));
    add('care', tpl('v_care', false));
    add('energy', tpl('energy', true));
    add('stats', tpl('v_stats', false));
    add('settings', tpl('v_settings', false));

    /* Weich (Entschlacken 01.10.2026): Kopf mit Tasten, links Modus/Programme und Räume, rechts
       Karte und „Braucht Aufmerksamkeit“; Station-Aktionen, Automatisch leeren, Einstellungen,
       Pflege, Statistik, Reinigung und der Schalter der Station unter „Mehr“. Kein Akku-Diagramm,
       kein „Akku & Strom“, kein Verbrauch. */
    if (window._casoraHH && window._casoraHH.on() && window._casoraHH.layout) {
      var HH = window._casoraHH;
      var f2 = { hero: fields.hero, mode: fields.mode, rooms: fields.rooms, map: hasMapS(c, states) ? fields.map : null,
        /* B-11: „Braucht Aufmerksamkeit“ nur, wenn gerade etwas ansteht – sonst stünde „Mehr“ allein rechts oben. */
        attn: (function () {
          try {
            var h = window._casoraLaundry && window._casoraLaundry.inner('v_attn', c, states);
            return String(h || '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, '').trim() ? tpl('v_attn', false) : undefined;
          } catch (e) { return tpl('v_attn', false); }
        })() };
      f2.more = HH.moreCard(watch, 'const c = ' + _c + ';\nconst L = window._casoraLaundry, H = window._casoraHH;\n'
        + 'return L && H ? H.more("vacuum", ["v_dock", "v_settings", "v_care", "v_stats", "v_run", "v_power"].map(function (k) {'
        + ' return L.inner(k, c, states); })) : "";', c.st);
      return HH.layout({ entity: c.st, watch: watch, fields: f2, left: ['mode', 'rooms'], right: ['map', 'attn', 'more'] });
    }

    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var makeCol = function (keys) {
      var cf = {}, cs = {};
      keys.forEach(function (k) { cf[k] = fields[k]; cs[k] = fstyle[k]; });
      return {
        type: 'custom:button-card', entity: c.st, triggers_update: watch, tap_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: { style: colStyle },
        extra_styles: window._casoraColGap(keys),
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
          grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') },
                 { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'row-gap': '0' }, { 'align-content': 'start' }],
          custom_fields: cs,
        },
        custom_fields: cf,
      };
    };
    /* Popup-Standard (24.09.2026): Status + Tasten oben, Verlauf volle Breite; links Bedienung
       (Hinweise, Reinigung, Räume, Modus, Station, Einstellungen), rechts Infos (Karte, Akku, Pflege, Verbrauch, Statistik). */
    var top = {}, topStyle = {};
    top.hero = { card: makeCol(['hero']) }; topStyle.hero = fstyle.hero;
    var pair = [];
    var hasMap = !!(c.map && states[c.map]);
    if (fields.chart) { top.chart = fields.chart; topStyle.chart = [{ 'justify-self': 'stretch' }, { 'align-self': 'stretch' }]; pair.push('chart'); }
    var _sp = window._casoraSplit ? window._casoraSplit('vacuum', ['alerts', 'rooms', 'mode', 'dock', 'settings'], (hasMap ? ['map'] : []).concat(['run', 'power', 'care', 'energy', 'stats']), { pinRight: ['map'] }) : { left: ['alerts', 'rooms', 'mode', 'dock', 'settings'], right: (hasMap ? ['map'] : []).concat(['run', 'power', 'care', 'energy', 'stats']) };
    top.left = { card: makeCol(_sp.left) }; topStyle.left = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    top.right = { card: makeCol(_sp.right) }; topStyle.right = [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }];
    var narrow = ['hero'].concat(pair, ['left', 'right']).map(function (k) { return '"' + k + '"'; }).join(' ');
    var wide = '"hero hero"' + (pair.length ? ' "chart chart"' : '') + ' "left right"';
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; }',
      'ha-card:hover { box-shadow: none !important; }',
      'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      'ha-card { will-change: auto !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
      'ha-card.disabled { pointer-events: auto !important; }',
    ].join('\n');
    return {
      type: 'custom:button-card', entity: c.st, triggers_update: [],
      card_mod: { style: wrapperStyle },
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: ' + wide + ' !important;'
        + ' grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important; column-gap: var(--casora-popup-col-gap, 20px) !important; } }',
      tap_action: { action: 'none' },
      show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: window._casoraHH && window._casoraHH.on() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': narrow }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: topStyle,
      },
      custom_fields: top,
    };
  };
})();


// ── Benachrichtigungen: Zeilenumbruch (23.09.2026) ───────────────────────────────
// Titel in der Glocke dürfen zwei Zeilen haben statt mit „…“ abgeschnitten zu werden.
// Ob ein Saugroboter fertig ist oder nur zwischendurch an der Station steht, entscheidet seit
// 1.0.7 die Glocke selbst für alle Hersteller (vacuumRuns in casora-core.js).
(function () {
  if (window._casoraNotifyVac) return;
  window._casoraNotifyVac = true;

  var css = document.createElement('style');
  css.id = 'casora-notify-wrap';
  css.textContent = '.casora-notify-menu .hui-inner > div[style*="flex:1"] > div:first-child {'
    + ' white-space: normal !important; display: -webkit-box !important; -webkit-box-orient: vertical !important;'
    + ' -webkit-line-clamp: 2 !important; line-clamp: 2 !important; overflow-wrap: anywhere; line-height: 1.22 !important; }';
  if (!document.getElementById(css.id)) (document.head || document.documentElement).appendChild(css);
})();

