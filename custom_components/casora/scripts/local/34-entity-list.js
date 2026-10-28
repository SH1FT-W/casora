// ── Entity list and "Mehr" (card request #59) ─────────────────────────────────────
// Entity list: a tile with a title and a list icon; the popup lists many settings (switches, times, numbers,
// choices) as Casora popup rows, each with its control on the right, in one or two columns, with optional
// section headings. Entries come from a group (in the group's order), a hand-picked list or an HA label.
// "Mehr": one tile for lists and charts that need no tile of their own – the popup lists groups (each shown as an
// entity list) and sensors (each shown as the chart card's popup, 27-chart.js); a tap opens the target in the same
// popup with ‹ back.
//   window._casoraEntityList.cfg(V)                         → {source, group, entities[], label, layout, sections[]}
//   window._casoraEntityList.resolve(hass, states, C)        → entity ids in list order (group order, pick order,
//                                                             label entries by name)
//   window._casoraEntityList.kind(st)                        → 'toggle' | 'time' | 'date' | 'number' | 'select' | 'state'
//   window._casoraEntityList.count(states, ids)              → {n, on, toggles}
//   window._casoraEntityList.countWord(n) / summary(c)       → "26 Einstellungen" / ["26 Einstellungen", "3 An"]
//   window._casoraEntityList.tileState(hass, states, V)      – tile casora_entity_list ("3 An" or "26 Einstellungen")
//   window._casoraEntityList.tileActive(hass, states, V)     – something on: the tile is highlighted
//   window._casoraEntityList.split(ids, sections)            → [{title, ids}] (a heading starts before its entity)
//   window._casoraEntityList.cols(layout)                    → '1' | '2' | 'auto' (CSS decides auto: phone 1, else 2)
//   window._casoraEntityList.width(V)                        → popup width in px (552 one column, else 900)
//   window._casoraEntityList.row(hass, st, id)               → row for _casoraUI.group with its control (endHtml)
//   window._casoraEntityList.popup(V, states, hass)          – popup casora_popup_entity_list
//   window._casoraEntityList.sec(part, C, states, hass)      – live parts (hero, list)
//   window._casoraEntityList.moreCfg(V) / moreTile(hass, states, V) / morePopup(V, states, hass) / moreSec(…)
//                                                           – tile and popup casora_more
//   window._casoraEntityList.input(el) / pick(ev, el)        – a time, date or choice changed / tapped in a row
// Rows read every state through the `states` handed in by button-card, so the card tracks exactly those entities.
(function () {
  if (window._casoraEntityList) return;
  var L = window._casoraEntityList = {};

  var TOGGLE = /^(switch|input_boolean|light|fan)$/;
  var SOURCES = { '': 'group', group: 'group', pick: 'pick', label: 'label' };
  var LAYOUTS = { '': 'auto', auto: 'auto', '1': '1', '2': '2' };
  var MAX = 200;

  var esc = window.casoraEsc || function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var T = function (x) { return typeof window.casoraTr === 'function' ? window.casoraTr(x) : x; };
  var loc = function () { return typeof window.casoraLocale === 'function' ? window.casoraLocale() : 'de-DE'; };
  var isId = function (v) { return typeof v === 'string' && /^[a-z_]+\.[a-z0-9_]+$/.test(v); };
  var dom = function (id) { return String(id || '').split('.')[0]; };
  var bad = function (s) { return s == null || s === '' || s === 'unknown' || s === 'unavailable'; };
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return ha && ha.hass; };
  var uniq = function (a) { return a.filter(function (x, i) { return a.indexOf(x) === i; }); };
  var two = function (n) { return (n < 10 ? '0' : '') + n; };

  // ── Studio settings ─────────────────────────────────────────────────────────
  L.cfg = function (V) {
    V = V || {};
    var src = SOURCES[String(V.list_source == null ? '' : V.list_source)] || 'group';
    var ents = (Array.isArray(V.list_entities) ? V.list_entities : []).filter(isId);
    var secs = (Array.isArray(V.list_sections) ? V.list_sections : []).filter(function (s) {
      return s && typeof s === 'object' && isId(s.before) && String(s.title == null ? '' : s.title).trim();
    }).map(function (s) { return { title: String(s.title).trim(), before: s.before }; });
    return { source: src, group: isId(V.list_group) ? V.list_group : null, entities: uniq(ents),
      label: typeof V.list_label === 'string' && V.list_label.trim() ? V.list_label.trim() : null,
      layout: LAYOUTS[String(V.list_layout == null ? '' : V.list_layout)] || 'auto', sections: secs };
  };

  // Display name: a leading number used to sort a group or label ("1 - Januar", "03. März") is dropped.
  L.nameOf = function (st, id) {
    var n = String((st && st.attributes && st.attributes.friendly_name) || id || '').trim();
    var m = /^\d{1,3}\s*[-–.:)]\s*(\S.*)$/.exec(n);
    return m ? m[1] : n;
  };

  // ── Entries ─────────────────────────────────────────────────────────────────
  // states: button-card's states (a proxy that records what a template reads) – every entry is read through it.
  L.resolve = function (hass, states, C) {
    var S = states || (hass && hass.states) || {};
    C = C || L.cfg({});
    var ids = [];
    if (C.source === 'group') {
      var g = C.group && S[C.group];
      var m = g && g.attributes && g.attributes.entity_id;
      ids = Array.isArray(m) ? m.filter(isId) : [];
    } else if (C.source === 'pick') {
      ids = C.entities.slice();
    } else if (C.source === 'label' && C.label) {
      var R = (hass && hass.entities) || {};
      ids = Object.keys(R).filter(function (id) {
        var e = R[id];
        return e && !e.hidden && Array.isArray(e.labels) && e.labels.indexOf(C.label) > -1;
      });
      var coll = typeof Intl !== 'undefined' ? new Intl.Collator(loc(), { numeric: true, sensitivity: 'base' }) : null;
      var nm = function (id) { var st = S[id]; return String((st && st.attributes && st.attributes.friendly_name) || id); };
      ids.sort(function (a, b) { return coll ? coll.compare(nm(a), nm(b)) : (nm(a) < nm(b) ? -1 : 1); });
    }
    return uniq(ids).filter(function (id) { return !!S[id]; }).slice(0, MAX);
  };

  // ── Kind of row ─────────────────────────────────────────────────────────────
  L.kind = function (st) {
    if (!st || bad(st.state)) return 'state';
    var d = dom(st.entity_id), a = st.attributes || {};
    if (TOGGLE.test(d)) return 'toggle';
    if (d === 'group') return st.state === 'on' || st.state === 'off' ? 'toggle' : 'state';
    if (d === 'input_datetime') {
      if (a.has_time && !a.has_date) return 'time';
      if (a.has_date && !a.has_time) return 'date';
      return 'state';
    }
    if (d === 'time') return 'time';
    if (d === 'date') return 'date';
    if (d === 'input_number' || d === 'number') return isFinite(parseFloat(st.state)) ? 'number' : 'state';
    if ((d === 'input_select' || d === 'select') && Array.isArray(a.options) && a.options.length) return 'select';
    return 'state';
  };
  L.isOn = function (st) { return !!(st && L.kind(st) === 'toggle' && st.state === 'on'); };

  L.count = function (states, ids) {
    var S = states || {}, on = 0, tg = 0;
    (ids || []).forEach(function (id) {
      var st = S[id];
      if (L.kind(st) !== 'toggle') return;
      tg++;
      if (st.state === 'on') on++;
    });
    return { n: (ids || []).length, on: on, toggles: tg };
  };
  L.countWord = function (n) { return n === 1 ? '1 Einstellung' : n + ' Einstellungen'; };
  // "26 Einstellungen · 3 An"; with switches all off "· Aus"; without switches the count only.
  L.summary = function (c) {
    if (!c || !c.n) return ['Keine Einträge'];
    var out = [L.countWord(c.n)];
    if (c.on) out.push(c.on + ' An');
    else if (c.toggles) out.push('Aus');
    return out;
  };

  L.tileState = function (hass, states, V) {
    var C = L.cfg(V);
    var c = L.count(states, L.resolve(hass, states, C));
    if (!c.n) return 'Keine Einträge';
    return c.on ? c.on + ' An' : L.countWord(c.n);
  };
  L.tileActive = function (hass, states, V) {
    return L.count(states, L.resolve(hass, states, L.cfg(V))).on > 0;
  };

  // ── Sections and columns ────────────────────────────────────────────────────
  L.split = function (ids, sections) {
    ids = ids || [];
    var head = {};
    (sections || []).forEach(function (s) {
      var t = s && String(s.title == null ? '' : s.title).trim();
      if (t && s.before && ids.indexOf(s.before) > -1 && !head[s.before]) head[s.before] = t;
    });
    var out = [{ title: null, ids: [] }];
    ids.forEach(function (id) {
      if (head[id]) out.push({ title: head[id], ids: [] });
      out[out.length - 1].ids.push(id);
    });
    return out.filter(function (s) { return s.ids.length; });
  };
  L.cols = function (layout) { return LAYOUTS[String(layout == null ? '' : layout)] || 'auto'; };
  L.width = function (V) { return L.cfg(V).layout === '1' ? 552 : 900; };

  // ── Rows ────────────────────────────────────────────────────────────────────
  var ICON = { input_boolean: 'mdi:toggle-switch-outline', input_number: 'mdi:numeric', input_select: 'mdi:format-list-bulleted',
    input_text: 'mdi:form-textbox', group: 'mdi:format-list-group', time: 'mdi:clock-outline', date: 'mdi:calendar' };
  L.iconOf = function (st) {
    var a = (st && st.attributes) || {}, d = dom(st && st.entity_id);
    if (a.icon) return a.icon;
    if (d === 'input_datetime') return a.has_time && !a.has_date ? 'mdi:clock-outline' : 'mdi:calendar';
    if (ICON[d]) return ICON[d];
    var Z = window._casoraZiele;
    return Z && Z.iconOf ? Z.iconOf(st) : 'mdi:circle-small';
  };
  L.word = function (hass, st) {
    var F = window._casoraFree;
    if (F && F.word) return F.word(hass, st);
    if (!st || st.state === 'unavailable') return 'Nicht verfügbar';
    if (st.state === 'unknown' || st.state === '') return 'Unbekannt';
    if (st.state === 'on') return 'An';
    if (st.state === 'off') return 'Aus';
    return String(st.state);
  };
  // "20:15" from "20:15:00" in the user's format; "" when it is no time.
  L.timeText = function (s) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(s || ''));
    if (!m) return '';
    var d = new Date(2000, 0, 1, +m[1], +m[2]);
    try { return d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' }); } catch (e) { return two(+m[1]) + ':' + m[2]; }
  };
  L.dateText = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return '';
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    try { return d.toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return m[3] + '.' + m[2] + '.' + m[1]; }
  };
  // Number step for − / +: the entity's step, at least one hundredth.
  L.stepOf = function (st) {
    var a = (st && st.attributes) || {};
    var s = parseFloat(a.step);
    return isFinite(s) && s > 0 ? s : 1;
  };
  L.stepTo = function (st, dir) {
    var a = (st && st.attributes) || {}, cur = parseFloat(st && st.state), step = L.stepOf(st);
    if (!isFinite(cur)) return null;
    var dec = (String(step).split('.')[1] || '').length;
    var v = Math.round((cur + dir * step) * Math.pow(10, dec)) / Math.pow(10, dec);
    var lo = parseFloat(a.min), hi = parseFloat(a.max);
    if (isFinite(lo) && v < lo) v = lo;
    if (isFinite(hi) && v > hi) v = hi;
    return v === cur ? null : v;
  };

  // Controls. Colours only from the popup tokens (switch in the popup accent like every popup switch).
  var PILL = 'position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:56px;height:32px;'
    + 'padding:0 12px;box-sizing:border-box;border-radius:999px;background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));'
    + 'font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;';
  // The real field lies invisible over the pill: a tap opens the system's picker (time wheel, choice list);
  // 16 px so Safari does not zoom in.
  var OVER = 'position:absolute;inset:0;width:100%;height:100%;opacity:0;margin:0;padding:0;border:0;font-size:16px;cursor:pointer;'
    + '-webkit-appearance:none;appearance:none;';
  // Touch stays with the field (#85): the popup section is a button-card whose action handler cancels the touchend,
  // so Android never got the click that opens the choice list or the time wheel. Same guard as the dishwasher's time.
  var TOUCH = ' ontouchstart="event.stopPropagation();" ontouchend="event.stopPropagation();"';
  var switchHtml = function (on) {
    return '<div role="switch" aria-checked="' + (on ? 'true' : 'false') + '" style="position:relative;width:44px;height:26px;'
      + 'border-radius:999px;flex:none;pointer-events:none;transition:background .2s ease;background:'
      + (on ? 'var(--casora-sw-on, var(--casora-lps-switch-on, #B67A50))' : 'var(--casora-sw-off, rgba(58,50,43,0.38))') + ';">'
      + '<div style="position:absolute;top:3px;left:' + (on ? '21px' : '3px') + ';width:20px;height:20px;border-radius:50%;'
      + 'background:var(--casora-lps-knob, #fff);box-shadow:var(--casora-sw-ks, 0 1px 3px rgba(0,0,0,0.2));transition:left .2s ease;"></div></div>';
  };
  var fieldHtml = function (id, type, shown, value, aria) {
    return '<label data-casora-elpill="" style="' + PILL + '"><span data-no-i18n>' + esc(shown) + '</span>'
      + '<input type="' + esc(type) + '" data-casora-el="' + esc(id) + '" value="' + esc(value) + '" aria-label="' + esc(aria) + '" style="' + OVER + '"'
      + TOUCH + ' onclick="window._casoraEntityList&&window._casoraEntityList.pick(event,this)"'
      + ' onchange="window._casoraEntityList&&window._casoraEntityList.input(this)"></label>';
  };
  var selectHtml = function (id, st) {
    var a = st.attributes || {}, cur = String(st.state);
    var optsHtml = (a.options || []).map(function (o) {
      return '<option value="' + esc(o) + '"' + (String(o) === cur ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('');
    return '<label data-casora-elpill="" style="' + PILL + 'max-width:min(180px, 40vw);"><span data-no-i18n style="overflow:hidden;text-overflow:ellipsis;">'
      + esc(cur) + '</span><select data-casora-el="' + esc(id) + '" data-no-i18n style="' + OVER + '"' + TOUCH
      + ' onclick="event.stopPropagation();window._casoraSuppressDismiss=Date.now()+800;"'
      + ' onchange="window._casoraEntityList&&window._casoraEntityList.input(this)">' + optsHtml + '</select></label>';
  };
  var stepHtml = function (id, st, dir) {
    var d = dom(id), v = L.stepTo(st, dir), svc = null;
    if (v != null) {
      svc = d === 'input_number'
        ? { domain: 'input_number', service: dir > 0 ? 'increment' : 'decrement', target: { entity_id: id } }
        : { domain: 'number', service: 'set_value', data: { value: v }, target: { entity_id: id } };
    }
    return '<div role="button" aria-label="' + (dir > 0 ? 'Plus' : 'Minus') + '" data-casora-elbtn=""'
      + (svc ? ' data-casora-svc="' + esc(JSON.stringify(svc)) + '"' + (d === 'input_number' ? ' data-casora-step="' + (dir * L.stepOf(st)) + '"' : '') : '')
      + ' style="position:relative;width:32px;height:32px;border-radius:50%;flex:none;display:grid;place-items:center;cursor:pointer;'
      + 'background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));' + (svc ? '' : 'opacity:.4;pointer-events:none;') + '">'
      + '<ha-icon icon="' + (dir > 0 ? 'mdi:plus' : 'mdi:minus') + '" style="--mdc-icon-size:18px;width:18px;height:18px;display:flex;pointer-events:none;"></ha-icon></div>';
  };

  L.row = function (hass, st, id) {
    var k = L.kind(st);
    var r = { icon: L.iconOf(st), iconTone: 'rgba(0,0,0,0)', label: L.nameOf(st, id), labelLit: true };
    if (!st || bad(st.state)) {
      r.entity = id; r.value = L.word(hass, st); r.valueTone = 'warn';
      return r;
    }
    var a = st.attributes || {};
    if (k === 'toggle') {
      var on = st.state === 'on';
      r.iconTone = on ? 'accent' : 'rgba(0,0,0,0)';
      r.active = on;
      r.svc = { domain: 'homeassistant', service: 'toggle', target: { entity_id: id } };
      r.endHtml = switchHtml(on);
    } else if (k === 'time') {
      var hm = /^(\d{1,2}):(\d{2})/.exec(String(st.state));
      r.endHtml = fieldHtml(id, 'time', L.timeText(st.state), hm ? two(+hm[1]) + ':' + hm[2] : '', r.label);
    } else if (k === 'date') {
      r.endHtml = fieldHtml(id, 'date', L.dateText(st.state), String(st.state).slice(0, 10), r.label);
    } else if (k === 'number') {
      r.endHtml = '<div style="display:flex;align-items:center;gap:8px;">' + stepHtml(id, st, -1)
        + '<span style="min-width:44px;text-align:center;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;">'
        + esc(T(L.word(hass, st))) + '</span>' + stepHtml(id, st, 1) + '</div>';
    } else if (k === 'select') {
      r.endHtml = selectHtml(id, st);
    } else {
      r.entity = id;
      r.value = L.word(hass, st);
    }
    return r;
  };

  // Two columns: every section a grid; a lone last row spans both. Auto: one column up to the phone width.
  var LIST_CSS = '<style>'
    + '[data-casora-cols="2"] .hui-plate{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));}'
    + '[data-casora-cols="2"] .hui-plate>.hui-row:last-child:nth-child(odd){grid-column:1 / -1;}'
    + '@media (min-width:761px){[data-casora-cols="auto"] .hui-plate{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));}'
    + '[data-casora-cols="auto"] .hui-plate>.hui-row:last-child:nth-child(odd){grid-column:1 / -1;}}'
    + '[data-casora-elbtn]::before{content:"";position:absolute;inset:-4px;border-radius:50%;}'
    + '[data-casora-elbtn]:active,[data-casora-elpill]:active{transform:scale(var(--casora-press-scale, .97));}'
    + '@media (hover:hover){[data-casora-elbtn]:hover,[data-casora-elpill]:hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11))!important;}}'
    + '[data-casora-elpill]::before{content:"";position:absolute;inset:-4px -2px;}'
    + '</style>';
  L.listHtml = function (hass, states, ids, C) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var S = states || {};
    var secHtml = L.split(ids, C.sections).map(function (s) {
      return UI.group(s.ids.map(function (id) { return L.row(hass, S[id], id); }), s.title);
    }).join('');
    return LIST_CSS + '<div data-casora-cols="' + esc(L.cols(C.layout)) + '" style="display:flex;flex-direction:column;gap:18px;">'
      + secHtml + '</div>';
  };

  // ── Popup: entity list ──────────────────────────────────────────────────────
  L.popup = function (V, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    if (!K || !UI) return { type: 'vertical-stack', cards: [] };
    var S = states || {};
    var C = L.cfg(V);
    var ids = L.resolve(hass, S, C);
    var watch = ids.concat(C.group ? [C.group] : []);
    var call = function (part) {
      return 'return window._casoraEntityList ? window._casoraEntityList.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(C) + ', states, hass) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), S) } };
    if (ids.length) f.list = { card: K.secCard(watch, call('list'), S) };
    return K.layout({ fields: f, top: ['hero', 'list'], left: [], right: [] });
  };
  L.sec = function (part, C, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !C) return '';
    var ids = L.resolve(hass, states, C);
    if (part === 'hero') {
      var s = L.summary(L.count(states, ids));
      var out = UI.line(s[0], s.slice(1));
      if (!ids.length && UI.note) {
        out += UI.note(C.source === 'group' && C.group && !(states || {})[C.group] ? T('Die Gruppe gibt es nicht mehr. Wähle im Studio eine andere.')
          : T('Wähle im Studio eine Gruppe, Geräte oder ein Label.'));
      }
      return out;
    }
    if (part === 'list') return L.listHtml(hass, states, ids, C);
    return '';
  };

  // ── Inputs in the rows (time, date, choice) ─────────────────────────────────
  // A tap on the invisible field: the browser's picker where there is one; a mouse without one (Firefox has no
  // time picker) gets Home Assistant's dialog. On touch the field itself opens the system wheel.
  L.pick = function (ev, el) {
    window._casoraSuppressDismiss = Date.now() + 800;
    if (ev && ev.stopPropagation) ev.stopPropagation();
    try { if (typeof el.showPicker === 'function') { el.showPicker(); return true; } } catch (e) { /* no picker */ }
    var hover = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
    if (hover && window.casoraPopup) { window.casoraPopup.nativeMoreInfo(el.getAttribute('data-casora-el')); return true; }
    return false;
  };
  // Service for a changed field: {domain, service, data} or null.
  L.serviceFor = function (id, kind, v) {
    var d = dom(id);
    if (!isId(id) || v == null || v === '') return null;
    if (kind === 'time') {
      if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) return null;
      var t = v.length === 5 ? v + ':00' : v;
      if (d === 'input_datetime') return { domain: 'input_datetime', service: 'set_datetime', data: { time: t } };
      if (d === 'time') return { domain: 'time', service: 'set_value', data: { time: t } };
      return null;
    }
    if (kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
      if (d === 'input_datetime') return { domain: 'input_datetime', service: 'set_datetime', data: { date: v } };
      if (d === 'date') return { domain: 'date', service: 'set_value', data: { date: v } };
      return null;
    }
    if (kind === 'select' && (d === 'input_select' || d === 'select')) return { domain: d, service: 'select_option', data: { option: v } };
    return null;
  };
  L.input = function (el) {
    var h = hassNow();
    if (!el || !h) return;
    var id = el.getAttribute('data-casora-el');
    var kind = el.tagName === 'SELECT' ? 'select' : el.type === 'date' ? 'date' : 'time';
    var s = L.serviceFor(id, kind, el.value);
    if (!s) return;
    window._casoraSuppressDismiss = Date.now() + 800;
    if (window.casoraHaptic) window.casoraHaptic('selection');
    // The pill shows the new value at once; the row redraws when Home Assistant reports it.
    var span = el.parentNode && el.parentNode.querySelector && el.parentNode.querySelector('span');
    if (span) span.textContent = kind === 'time' ? L.timeText(el.value) : kind === 'date' ? L.dateText(el.value) : el.value;
    h.callService(s.domain, s.service, s.data, { entity_id: id });
  };

  // ── Mehr ────────────────────────────────────────────────────────────────────
  var labelsOf = function (m) { return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; };
  L.moreCfg = function (V) {
    V = V || {};
    var lists = uniq((Array.isArray(V.more_lists) ? V.more_lists : []).filter(isId));
    var charts = uniq((Array.isArray(V.more_charts) ? V.more_charts : []).filter(isId));
    var tiles = uniq((Array.isArray(V.more_tiles) ? V.more_tiles : []).filter(isId));
    var own = function (m, ids) {
      var src = labelsOf(m), out = {};
      ids.forEach(function (id) { if (typeof src[id] === 'string' && src[id].trim()) out[id] = src[id].trim(); });
      return out;
    };
    return { lists: lists, charts: charts, tiles: tiles, listNames: own(V.more_list_labels, lists), chartNames: own(V.more_chart_labels, charts),
      tileNames: own(V.more_tile_labels, tiles) };
  };
  L.moreWord = function (lists, charts, tiles) {
    var out = [];
    if (lists) out.push(lists === 1 ? '1 Liste' : lists + ' Listen');
    if (charts) out.push(charts === 1 ? '1 Diagramm' : charts + ' Diagramme');
    if (tiles) out.push(tiles === 1 ? '1 Kachel' : tiles + ' Kacheln');
    return out.length ? out.join(' · ') : 'Nichts gewählt';
  };
  L.moreTile = function (hass, states, V) {
    var M = L.moreCfg(V), S = states || {};
    var have = function (id) { return !!S[id]; };
    return L.moreWord(M.lists.filter(have).length, M.charts.filter(have).length, M.tiles.filter(have).length);
  };
  // Entity list settings for a group listed in Mehr.
  L.groupCfg = function (gid) { return L.cfg({ list_source: 'group', list_group: gid }); };
  L.morePopup = function (V, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI;
    if (!K || !UI) return { type: 'vertical-stack', cards: [] };
    var S = states || {};
    var M = L.moreCfg(V);
    var watch = M.lists.concat(M.charts, M.tiles);
    M.lists.forEach(function (g) { watch = watch.concat(L.resolve(hass, S, L.groupCfg(g))); });
    var call = function (part) {
      return 'return window._casoraEntityList ? window._casoraEntityList.moreSec(' + JSON.stringify(part) + ', ' + JSON.stringify(M) + ', states, hass) : "";';
    };
    var f = { hero: { card: K.secCard(watch, call('hero'), S) } };
    if (M.lists.length) f.lists = { card: K.secCard(watch, call('lists'), S) };
    if (M.charts.length) f.charts = { card: K.secCard(M.charts, call('charts'), S) };
    if (M.tiles.length) f.tiles = { card: K.secCard(M.tiles, call('tiles'), S) };
    var ui = K.layout({ fields: f, top: ['hero', 'lists', 'charts', 'tiles'].filter(function (k) { return k === 'hero' || f[k]; }), left: [], right: [] });
    // Marks the popup as Mehr for the row tap (moreHook): which groups and sensors open in it, and their names.
    ui.variables = Object.assign({}, ui.variables, { casora_more: M });
    return ui;
  };
  L.moreSec = function (part, M, states, hass) {
    var UI = window._casoraUI;
    if (!UI || !M) return '';
    var S = states || {};
    if (part === 'hero') {
      var has = function (id) { return !!S[id]; };
      var out = UI.line(L.moreWord(M.lists.filter(has).length, M.charts.filter(has).length, (M.tiles || []).filter(has).length), []);
      if (!M.lists.length && !M.charts.length && !(M.tiles || []).length && UI.note) out += UI.note(T('Wähle im Studio Gruppen und Sensoren für diese Kachel.'));
      return out;
    }
    if (part === 'lists') {
      var rows = M.lists.filter(function (g) { return !!S[g]; }).map(function (g) {
        var ids = L.resolve(hass, S, L.groupCfg(g)), c = L.count(S, ids), st = S[g];
        var a = st.attributes || {};
        return { entity: g, icon: a.icon || 'list', iconTone: c.on ? 'accent' : 'rgba(0,0,0,0)', label: M.listNames[g] || L.nameOf(st, g),
          labelLit: true, sub: L.summary(c).join(' · ') };
      });
      return rows.length ? UI.group(rows, 'Einstellungen') : '';
    }
    if (part === 'charts') {
      var CH = window._casoraChartCard;
      var span = CH && CH.LABEL ? CH.LABEL['24h'] : '24 Std.';
      var rows2 = M.charts.filter(function (id) { return !!S[id]; }).map(function (id) {
        var st = S[id];
        var v = CH && CH.value ? CH.value(st, hass) : L.word(hass, st);
        return { entity: id, icon: L.iconOf(st), iconTone: 'rgba(0,0,0,0)', label: M.chartNames[id] || L.nameOf(st, id), labelLit: true,
          sub: span + ' · ' + v };
      });
      return rows2.length ? LIST_CSS + '<div data-casora-cols="auto">' + UI.group(rows2, 'Diagramme') + '</div>' : '';
    }
    if (part === 'tiles') {
      // Tiles of the dashboard (#59): a tap opens that tile's own popup (moreHook → openTile).
      var rows3 = (M.tiles || []).filter(function (id) { return !!S[id]; }).map(function (id) {
        var st = S[id];
        return { entity: id, icon: L.iconOf(st), iconTone: 'rgba(0,0,0,0)', label: (M.tileNames || {})[id] || L.nameOf(st, id), labelLit: true, sub: L.word(hass, st) };
      });
      return rows3.length ? LIST_CSS + '<div data-casora-cols="auto">' + UI.group(rows3, 'Kacheln') + '</div>' : '';
    }
    return '';
  };

  // Mehr: a tapped row opens its list or chart in the same popup, ‹ back to Mehr.
  var openPage = function (title, content, width) {
    var P = window.casoraPopup, prev = P && P.current;
    if (!P) return false;
    P.open({ title: title, content: content, back: prev ? function () { P.open(prev); } : null,
      dismiss_on_background: prev ? prev.dismiss_on_background !== false : true,
      style: '--popup-min-width: min(' + width + 'px, 92vw); --popup-max-width: min(' + width + 'px, 92vw);',
      popup_styles: prev && prev.popup_styles });
    return true;
  };
  L.openList = function (gid, name) {
    var h = hassNow();
    if (!h || !h.states[gid]) return false;
    var V = { list_source: 'group', list_group: gid };
    return openPage(name || L.nameOf(h.states[gid], gid), L.popup(V, h.states, h), L.width(V));
  };
  L.openChart = function (id, name) {
    var h = hassNow(), CH = window._casoraChartCard;
    if (!h || !h.states[id] || !CH) return false;
    return openPage(name || L.nameOf(h.states[id], id), CH.popup(h.states[id], h.states, h, name ? { label_1: name } : {}), 900);
  };
  L.moreHook = function (id) {
    var P = window.casoraPopup, cur = P && P.current;
    var M = cur && cur.content && cur.content.variables && cur.content.variables.casora_more;
    if (!M || !id) return false;
    window._casoraSuppressDismiss = Date.now() + 600;
    if ((M.lists || []).indexOf(id) > -1) return L.openList(id, (M.listNames || {})[id]);
    if ((M.charts || []).indexOf(id) > -1) return L.openChart(id, (M.chartNames || {})[id]);
    if ((M.tiles || []).indexOf(id) > -1) return L.openTile(id);
    return false;
  };
  // A tile of the dashboard: its own popup (the bell's way, 01-basis.js openViaCard: the tile's config found by its
  // entity), with ‹ back to Mehr – the next popup that opens within 3 s takes the back.
  var backNext = null;
  L.openTile = function (id) {
    var P = window.casoraPopup, prev = P && P.current, open = window._casoraNotifyOpenViaCard;
    if (!P || !open) return false;
    if (!P._casoraMoreBack) {
      var o = P.open;
      P.open = function (data) {
        if (backNext && Date.now() < backNext.until && data && data.back === undefined) { data = Object.assign({}, data, { back: backNext.fn }); }
        backNext = null;
        return o.call(this, data);
      };
      P._casoraMoreBack = true;
    }
    backNext = prev ? { fn: function () { P.open(prev); }, until: Date.now() + 3000 } : null;
    open(id, function (ok) { if (!ok && P.moreInfo) P.moreInfo(id); }, null, true);
    return true;
  };
  (window._casoraMiHooks = window._casoraMiHooks || []).push(L.moreHook);
})();
