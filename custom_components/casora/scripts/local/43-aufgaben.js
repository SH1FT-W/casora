// ── Tasks (tile casora_tasks): several HA to-do lists on one tile ───────────────────────────────────────────────────
// Lists come from variables.lists, else every todo.* in the home. Items come from _casoraShopping's subscription, so the
// tile and popup stay live. Popup v3 (popup-richtlinien-v3.md §4 S8, §6): filter chips and „Hinzufügen“ in the stage, the
// open items by due date, „Erledigt“ with undo. The filter is this browser's: it is a way of looking, not a house state.
//   window._casoraTasks.tile(states, vars)     – the tile's word
//   window._casoraTasks.active(states, vars)   – something open
//   window._casoraTasks.popup(states, hass, v) – the popup's cards
//   window._casoraTasks.box(part, hass)        – a part, redrawn when a list changes
(function () {
  if (window._casoraTasks) return;
  var T = window._casoraTasks = { vars: null, sel: 'all' };
  var KEY = 'casora_tasks_filter', DONE_MAX = 20;
  // TodoListEntityFeature: create 1, update 4, due date 16, description 64.
  var FEAT = { create: 1, update: 4, due: 16, desc: 64 };
  try { T.sel = localStorage.getItem(KEY) || 'all'; } catch (e) { /* the default */ }
  var esc = function (t) { return (window.casoraEsc || String)(t); };
  var Sh = function () { return window._casoraShopping; };
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return (ha && ha.hass) || null; };
  var has = function (st, bit) { return !!(Number(((st || {}).attributes || {}).supported_features) & bit); };
  T.nameOf = function (states, id) { var s = states && states[id]; return (s && s.attributes && s.attributes.friendly_name) || id; };
  T.ids = function (states, vars) {
    var S = states || {}, own = vars && vars.lists;
    if (Array.isArray(own) && own.length) return own.filter(function (id, i) { return S[id] && own.indexOf(id) === i; });
    return Object.keys(S).filter(function (id) { return id.indexOf('todo.') === 0; })
      .sort(function (a, b) { return T.nameOf(S, a).localeCompare(T.nameOf(S, b)); });
  };
  T.count = function (st) { var n = st ? parseInt(st.state, 10) : NaN; return isFinite(n) ? n : 0; };
  T.total = function (states, ids) { return ids.reduce(function (n, id) { return n + T.count(states[id]); }, 0); };
  T.active = function (states, vars) { return T.total(states || {}, T.ids(states, vars)) > 0; };
  T.tile = function (states, vars) {
    var ids = T.ids(states, vars);
    if (!ids.length) return 'Keine Listen';
    var n = T.total(states, ids);
    return n ? n + ' offen' : 'Alles erledigt';
  };
  // Loads the lists with the tile: the subscription keeps its word and the popup's content current.
  T.load = function (hass, vars) {
    var s = Sh();
    if (!s || !hass) return;
    T.vars = vars || T.vars;
    T.ids(hass.states, vars).forEach(function (id) { s.items(hass, id); });
  };
  var day0 = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  // A due date as a word: { text, over }, or null without one. A date alone is that whole day.
  T.dueWord = function (due, now) {
    if (!due) return null;
    var str = String(due), dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(str), p = str.split('-');
    var d = dateOnly ? new Date(+p[0], +p[1] - 1, +p[2]) : new Date(str);
    if (isNaN(d.getTime())) return null;
    var at = now || new Date(), days = Math.round((day0(d) - day0(at)) / 86400000);
    var two = function (n) { return String(n).padStart(2, '0'); };
    var clock = dateOnly ? '' : ' ' + two(d.getHours()) + ':' + two(d.getMinutes());
    var over = dateOnly ? days < 0 : d.getTime() < at.getTime();
    var word = days === 0 ? 'Heute' : days === 1 ? 'Morgen' : d.getDate() + '.' + (d.getMonth() + 1) + '.';
    return { text: over && days !== 0 ? 'Überfällig · ' + word : word + clock, over: over };
  };
  // Due ones first, soonest on top; the rest keep the list's own order.
  T.sortOpen = function (items) {
    var at = function (it) { var t = it.due ? Date.parse(String(it.due)) : NaN; return isFinite(t) ? t : Infinity; };
    return items.map(function (it, i) { return { it: it, i: i, t: at(it) }; })
      .sort(function (a, b) { return a.t === b.t ? a.i - b.i : a.t - b.t; }).map(function (x) { return x.it; });
  };
  T.selected = function (ids) { return ids.indexOf(T.sel) >= 0 ? T.sel : 'all'; };
  T.itemData = function (f) {
    var name = String(f.title || '').trim(), d = { item: name };
    if (!name) return { error: 'Bitte gib eine Aufgabe ein.' };
    var note = String(f.note || '').trim();
    if (note && f.canNote) d.description = note;
    if (f.due && f.canDue) d.due_date = f.due;
    return { data: d };
  };
  var row = function (states, id, it, isDone) {
    var due = isDone ? null : T.dueWord(it.due), s = Sh();
    var sub = [due && due.text, it.description].filter(Boolean).join(' · ');
    var r = { icon: isDone ? 'mdi:check-circle-outline' : 'mdi:checkbox-blank-circle-outline', iconTone: isDone ? null : 'accent', label: it.summary, sub: sub || null, noChev: true };
    if (due && due.over) r.subTone = 'bad';
    if (has(states[id], FEAT.update) && s) r.svc = s.toggleSvc(id, it, isDone);
    return r;
  };
  var writable = function (states, ids) { return ids.filter(function (id) { return has(states[id], FEAT.create); }); };
  T.innerHtml = function (part, hass) {
    var UI = window._casoraUI, h = hass || hassNow(), s = Sh();
    if (!UI || !h || !s) return '';
    var st = h.states, ids = T.ids(st, T.vars), sel = T.selected(ids), shown = sel === 'all' ? ids : [sel];
    var data = {};
    ids.forEach(function (id) { data[id] = s.items(h, id); });
    var doneOf = function (list) { return list.reduce(function (n, id) { return n + (data[id] ? data[id].done.length : 0); }, 0); };
    if (part === 'line') {
      var n = T.total(st, ids), dn = doneOf(ids);
      return UI.line(n ? n + ' offen' : 'Alles erledigt', dn ? [dn + ' erledigt'] : []);
    }
    if (part === 'stage') {
      var chip = function (key, label, count) {
        return '<div class="tchip' + (sel === key ? ' on' : '') + '" role="button" tabindex="0" aria-pressed="' + (sel === key) + '" data-tasks="sel:' + esc(key) + '"><span>' + esc(label) + '</span><b>' + count + '</b></div>';
      };
      var chips = ids.length > 1 ? '<div class="tchips">' + chip('all', 'Alle', T.total(st, ids))
        + ids.map(function (id) { return chip(id, T.nameOf(st, id), T.count(st[id])); }).join('') + '</div>' : '';
      var add = writable(st, ids).length ? '<div class="hui-st-act pri" role="button" tabindex="0" aria-label="Hinzufügen" data-tasks="add">'
        + '<ha-icon icon="mdi:plus" style="--mdc-icon-size:20px;width:20px;height:20px;display:flex;"></ha-icon><span>Hinzufügen</span></div>' : '';
      return UI.stage('content', { html: '<style>.hui-stage{--casora-pv-stack-fill:transparent;}'
        + '.tchips{display:flex;flex-wrap:wrap;gap:8px}.tchip{display:flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;padding:0 16px;border-radius:999px;cursor:pointer;pointer-events:auto;font-size:14px;font-weight:600;background:var(--casora-popup-row-fill,rgba(127,127,127,.14));white-space:nowrap}'
        + '.tchip>*{pointer-events:none}.tchip b{font-weight:700;opacity:.65}.tchip.on{background:var(--casora-popup-ui-action,var(--casora-accent,#276B64));color:var(--casora-popup-ui-on-action,#fff)}.tchip.on b{opacity:.9}'
        + '.tchip:focus-visible{outline:2px solid var(--casora-popup-ui-action,var(--casora-accent,#276B64));outline-offset:2px}'
        + '@media (max-width:600px){.tchips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -4px;padding:2px 4px}.tchips::-webkit-scrollbar{display:none}.tchip{flex:none}}</style>'
        + '<div style="display:flex;flex-direction:column;gap:14px;">' + add + chips + '</div>' });
    }
    if (part === 'list') {
      if (!ids.length) return UI.empty({ icon: 'mdi:format-list-checks', text: 'Keine To-do-Listen gefunden' });
      var loading = shown.some(function (id) { return !data[id]; });
      var groups = shown.map(function (id) {
        var d = data[id];
        return d && d.open.length ? UI.group(T.sortOpen(d.open).map(function (it) { return row(st, id, it, false); }), T.nameOf(st, id)) : '';
      }).filter(Boolean);
      if (groups.length) return '<div style="display:flex;flex-direction:column;gap:var(--casora-popup-sec-gap,18px);">' + groups.join('') + '</div>';
      return UI.empty({ icon: 'mdi:check-all', text: loading ? 'Liste wird geladen …' : 'Neue Einträge erscheinen hier' });
    }
    if (part === 'done') {
      var rows = [], extra = 0;
      shown.forEach(function (id) { if (data[id]) data[id].done.forEach(function (it) { if (rows.length < DONE_MAX) rows.push(row(st, id, it, true)); else extra++; }); });
      if (!rows.length) return '';
      if (extra) rows.push({ icon: 'mdi:dots-horizontal', label: '+' + extra + ' weitere', noChev: true });
      // „Erledigte löschen“ names one list: with all lists showing it would clear more than the eye can check.
      if (sel !== 'all' && s.clearSvc && has(st[sel], 2)) rows.push({ icon: 'mdi:delete-sweep-outline', label: 'Erledigte löschen', svc: s.clearSvc(sel), confirm: 'Löschen', noChev: true });
      return UI.group(rows, 'Erledigt');
    }
    return '';
  };
  T.box = function (part, hass) { return '<div data-tasks-box="' + esc(part) + '">' + T.innerHtml(part, hass) + '</div>'; };
  T.popup = function (states, hass, vars) {
    var KIT = window._casoraSoftKit, UI = window._casoraUI, S = states || {};
    T.vars = vars || null;
    var ids = T.ids(S, vars);
    if (!KIT || !UI || !UI.stage) return { type: 'vertical-stack', cards: [] };
    T.load(hass, vars);
    var card = function (part) { return { card: KIT.secCard(ids, 'return window._casoraTasks ? window._casoraTasks.box(' + JSON.stringify(part) + ', hass) : "";', S) }; };
    return KIT.layout({ fields: { line: card('line'), stage: card('stage'), list: card('list'), done: card('done') }, top: ['line'], stage: 'stage', left: [], right: ['list', 'done'] });
  };
  var deep = function (root, sel, out) {
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, sel, out); });
    return out;
  };
  T.paint = function () {
    var pop = window.casoraPopup && window.casoraPopup.shown;
    if (!pop) return;
    var tr = window.casoraTr || function (x) { return x; };
    deep(pop.shadowRoot, '[data-tasks-box]', deep(pop, '[data-tasks-box]', [])).forEach(function (n) {
      var c = n.querySelector('.tchips'), left = c ? c.scrollLeft : 0;
      n.innerHTML = tr(T.innerHtml(n.getAttribute('data-tasks-box')));
      var c2 = n.querySelector('.tchips');
      if (c2) c2.scrollLeft = left;
    });
  };
  // A changed list redraws the open popup and the tile's word.
  var hook = function () {
    var s = Sh();
    if (!s || !s.onChange) { setTimeout(hook, 500); return; }
    s.onChange(function () {
      T.paint();
      var ha = document.querySelector('home-assistant');
      deep(ha && ha.shadowRoot, 'button-card', []).forEach(function (el) {
        var c = el._config;
        if (c && typeof c.state_display === 'string' && c.state_display.indexOf('_casoraTasks') !== -1 && window.casoraKick) window.casoraKick(el);
      });
    });
  };
  hook();
  T.addDialog = function () {
    var h = hassNow(), Tr = window.casoraTr || function (x) { return x; };
    if (!h || !window._casoraFormDialog) return;
    var st = h.states, ids = writable(st, T.ids(st, T.vars)), sel = T.selected(T.ids(st, T.vars));
    if (!ids.length) return;
    var pick = ids.indexOf(sel) >= 0 ? sel : ids[0];
    var f = function (id, label, html) { return '<div class="f" id="' + id + '"><label>' + esc(Tr(label)) + '</label>' + html + '</div>'; };
    var api = window._casoraFormDialog({ title: 'Neue Aufgabe', cls: 'casora-taskform', first: 'title', enter: ['title'], failText: 'Die Aufgabe konnte nicht gespeichert werden.',
      html: f('fT', 'Aufgabe', '<input id="title" type="text" autocomplete="off">')
        + (ids.length > 1 ? f('fL', 'Liste', '<select id="list">' + ids.map(function (id) { return '<option value="' + esc(id) + '"' + (id === pick ? ' selected' : '') + '>' + esc(T.nameOf(st, id)) + '</option>'; }).join('') + '</select>') : '')
        + f('fN', 'Notiz (optional)', '<textarea id="note" rows="2"></textarea>')
        + f('fD', 'Fällig (optional)', '<input id="due" type="date">'),
      save: function (a) {
        var id = a.$('list') ? a.$('list').value : pick;
        var r = T.itemData({ title: a.$('title').value, note: a.$('note').value, due: a.$('due').value, canNote: has(st[id], FEAT.desc), canDue: has(st[id], FEAT.due) });
        if (r.error) { a.error(r.error); return null; }
        var now = hassNow() || h;
        return Promise.resolve(now.callService('todo', 'add_item', r.data, { entity_id: id })).then(function () { if (window.casoraHaptic) window.casoraHaptic('success'); });
      } });
    var fit = function () {
      var id = api.$('list') ? api.$('list').value : pick;
      api.$('fN').style.display = has(st[id], FEAT.desc) ? '' : 'none';
      api.$('fD').style.display = has(st[id], FEAT.due) ? '' : 'none';
    };
    if (api.$('list')) api.$('list').onchange = fit;
    fit();
  };
  var targetOf = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < p.length; i++) if (p[i] && p[i].getAttribute && p[i].getAttribute('data-tasks')) return p[i].getAttribute('data-tasks');
    return null;
  };
  var run = function (a) {
    if (window.casoraHaptic) window.casoraHaptic('selection');
    if (a === 'add') { T.addDialog(); return; }
    T.sel = a.slice(4);
    try { localStorage.setItem(KEY, T.sel); } catch (e) { /* this session only */ }
    T.paint();
  };
  // Own capture like the other popup buttons (onclick in the popup's HTML is unreliable on phones).
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('click', function (ev) { var a = targetOf(ev); if (!a) return; ev.preventDefault(); ev.stopPropagation(); run(a); }, true);
    window.addEventListener('keydown', function (ev) { if (ev.key !== 'Enter' && ev.key !== ' ') return; var a = targetOf(ev); if (!a) return; ev.preventDefault(); ev.stopPropagation(); run(a); }, true);
  }
})();
