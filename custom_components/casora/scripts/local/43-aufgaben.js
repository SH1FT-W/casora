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
  var T = window._casoraTasks = { vars: null, sel: 'all', showDone: false };
  var KEY = 'casora_tasks_filter', DONE_MAX = 20;
  // TodoListEntityFeature: create 1, delete 2, update 4, due date 16, description 64.
  var FEAT = { create: 1, remove: 2, update: 4, due: 16, desc: 64 };
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
  // As the recipe card's shopping list: the item's symbol left, then the text, X and tick on the right; done ones struck through.
  var CSS = '<style>.trl{display:flex;flex-direction:column;gap:8px}'
    + '.trr{display:flex;align-items:center;gap:12px;min-height:var(--casora-soft-row-h,58px);box-sizing:border-box;padding:var(--casora-soft-row-pad,10px 8px 10px 10px);border-radius:var(--casora-popup-row-radius,24px);background:var(--casora-soft-row-fill,rgba(140,115,90,.07))}'
    + '.tri{width:var(--casora-soft-icon-size,38px);height:var(--casora-soft-icon-size,38px);flex:none;border-radius:var(--casora-soft-icon-radius,50%);display:grid;place-items:center}'
    + '.trt{flex:1;min-width:0}.trn{font-size:var(--casora-soft-row-fs,14.5px);font-weight:700;letter-spacing:-.01em;line-height:1.3;overflow-wrap:anywhere;color:var(--casora-popup-tiles-text-primary,var(--primary-text-color))}'
    + '.trs{font-size:var(--casora-soft-sub-fs,12.5px);font-weight:500;margin-top:1px;color:var(--casora-soft-sub,var(--secondary-text-color));overflow-wrap:anywhere}.trs.bad{color:var(--casora-color-red-text,#B3372E)}'
    + '.trd .trn{text-decoration:line-through;opacity:.6}.trd .tri{opacity:.45}'
    + '.trb{all:unset;box-sizing:border-box;flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;cursor:pointer;pointer-events:auto;color:var(--casora-soft-glyph-off,rgba(127,127,127,.75))}'
    + '.trb ha-icon{--mdc-icon-size:26px;width:26px;height:26px;display:flex;pointer-events:none}.trb.x ha-icon{--mdc-icon-size:20px;width:20px;height:20px}'
    + '.trb.on{color:var(--casora-popup-ui-good,#30D158)}@media (hover:hover){.trb:hover{background:var(--casora-soft-row-hover,rgba(140,115,90,.11))}}'
    + '.trb:focus-visible{outline:2px solid var(--casora-popup-ui-action,var(--casora-accent,#276B64));outline-offset:-2px}'
    + '.trm{cursor:pointer;pointer-events:auto}.trm>*{pointer-events:none}</style>';
  var rowHtml = function (states, id, it, isDone) {
    var due = isDone ? null : T.dueWord(it.due), s = Sh(), UI = window._casoraUI;
    var R = window._casoraRecipe, f = R && R.foodLook ? R.foodLook(it.summary, true) : [null];
    var icon = f[0] ? f[1] : 'mdi:clipboard-text-outline', color = f[0] ? f[2] : 'var(--casora-tone-general,var(--casora-color-green,#30D158))';
    var ink = 'var(--casora-popup-tiles-text-primary,var(--primary-text-color))';
    var dueHtml = due ? '<div class="trs' + (due.over ? ' bad' : '') + '">' + esc(due.text) + '</div>' : '';
    var noteHtml = it.description ? '<div class="trs">' + esc(it.description) + '</div>' : '';
    var delHtml = has(states[id], FEAT.remove) && s ? '<button type="button" class="trb x" aria-label="' + esc('Löschen') + '" data-casora-svc="' + esc(JSON.stringify(T.removeSvc(id, it))) + '"><ha-icon icon="mdi:close"></ha-icon></button>' : '';
    var tickHtml = has(states[id], FEAT.update) && s ? '<button type="button" class="trb' + (isDone ? ' on' : '') + '" aria-label="' + esc(isDone ? 'Wieder öffnen' : 'Abhaken') + '" data-casora-svc="' + esc(JSON.stringify(s.toggleSvc(id, it, isDone))) + '"><ha-icon icon="' + (isDone ? 'mdi:check-circle' : 'mdi:check-circle-outline') + '"></ha-icon></button>' : '';
    return '<div class="trr' + (isDone ? ' trd' : '') + '"><div class="tri" style="background:color-mix(in srgb, ' + esc(color) + ' 22%, transparent);"><ha-icon icon="' + esc(icon) + '" style="--mdc-icon-size:19px;width:19px;height:19px;display:flex;color:color-mix(in srgb, ' + esc(color) + ' 65%, ' + esc(ink) + ');"></ha-icon></div>'
      + '<div class="trt"><div class="trn">' + esc(it.summary) + '</div>' + dueHtml + noteHtml + '</div>' + delHtml + tickHtml + '</div>';
  };
  // Deleting cannot be undone from here, so it asks; ticking off can, so it does not.
  T.removeSvc = function (id, it) { return { domain: 'todo', service: 'remove_item', target: { entity_id: id }, data: { item: it.uid || it.summary }, confirm: 'Eintrag löschen?' }; };
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
      var chipHtml = function (key, label, count) {
        return '<div class="tchip' + (sel === key ? ' on' : '') + '" role="button" tabindex="0" aria-pressed="' + (sel === key) + '" data-tasks="sel:' + esc(key) + '"><span>' + esc(label) + '</span><b>' + esc(count) + '</b></div>';
      };
      var restHtml = ids.map(function (id) { return chipHtml(id, T.nameOf(st, id), T.count(st[id])); }).join('');
      var chipsHtml = ids.length > 1 ? '<div class="tchips">' + chipHtml('all', 'Alle', T.total(st, ids)) + restHtml + '</div>' : '';
      var addHtml = writable(st, ids).length ? '<div class="hui-st-act pri" role="button" tabindex="0" aria-label="Hinzufügen" data-tasks="add">'
        + '<ha-icon icon="mdi:plus" style="--mdc-icon-size:20px;width:20px;height:20px;display:flex;"></ha-icon><span>Hinzufügen</span></div>' : '';
      return UI.stage('content', { html: '<style>.hui-stage{--casora-pv-stack-fill:transparent;}'
        + '.tchips{display:flex;flex-wrap:wrap;gap:8px}.tchip{display:flex;align-items:center;gap:8px;min-height:44px;box-sizing:border-box;padding:0 16px;border-radius:999px;cursor:pointer;pointer-events:auto;font-size:14px;font-weight:600;background:var(--casora-popup-row-fill,rgba(127,127,127,.14));white-space:nowrap}'
        + '.tchip>*{pointer-events:none}.tchip b{font-weight:700;opacity:.65}.tchip.on{background:var(--casora-popup-ui-action,var(--casora-accent,#276B64));color:var(--casora-popup-ui-on-action,#fff)}.tchip.on b{opacity:.9}'
        + '.tchip:focus-visible{outline:2px solid var(--casora-popup-ui-action,var(--casora-accent,#276B64));outline-offset:2px}'
        + '@media (max-width:600px){.tchips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -4px;padding:2px 4px}.tchips::-webkit-scrollbar{display:none}.tchip{flex:none}}</style>'
        + '<div style="display:flex;flex-direction:column;gap:14px;">' + addHtml + chipsHtml + '</div>' });
    }
    if (part === 'list') {
      if (!ids.length) return UI.empty({ icon: 'mdi:format-list-checks', text: 'Keine To-do-Listen gefunden' });
      var loading = shown.some(function (id) { return !data[id]; });
      var groupsHtml = shown.map(function (id) {
        var d = data[id];
        if (!d || !d.open.length) return '';
        var itemsHtml = T.sortOpen(d.open).map(function (it) { return rowHtml(st, id, it, false); }).join('');
        return UI.label(T.nameOf(st, id)) + '<div class="trl">' + itemsHtml + '</div>';
      }).filter(Boolean);
      var allHtml = groupsHtml.join('');
      if (allHtml) return CSS + '<div style="display:flex;flex-direction:column;gap:10px;">' + allHtml + '</div>';
      return UI.empty({ icon: 'mdi:check-all', text: loading ? 'Liste wird geladen …' : 'Neue Einträge erscheinen hier' });
    }
    if (part === 'done') {
      var doneN = doneOf(shown);
      if (!doneN) return '';
      var headHtml = '<div class="trr trm" role="button" tabindex="0" aria-expanded="' + T.showDone + '" data-tasks="done"><div class="tri" style="background:rgba(127,127,127,.14);"><ha-icon icon="' + (T.showDone ? 'mdi:chevron-up' : 'mdi:chevron-down') + '" style="--mdc-icon-size:19px;width:19px;height:19px;display:flex;"></ha-icon></div>'
        + '<div class="trt"><div class="trn" style="opacity:.7">' + esc(doneN + ' erledigt') + '</div></div><div class="trs" style="padding-right:10px;">' + esc(T.showDone ? 'Ausblenden' : 'Anzeigen') + '</div></div>';
      if (!T.showDone) return CSS + '<div class="trl">' + headHtml + '</div>';
      var listHtml = '', shownN = 0;
      shown.forEach(function (id) { if (data[id]) data[id].done.forEach(function (it) { if (shownN++ < DONE_MAX) listHtml += rowHtml(st, id, it, true); }); });
      var moreHtml = doneN > DONE_MAX ? '<div class="trs" style="padding:4px 14px;">' + esc('+' + (doneN - DONE_MAX) + ' weitere') + '</div>' : '';
      // „Erledigte löschen“ names one list: with all lists showing it would clear more than the eye can check.
      var clearHtml = sel !== 'all' && s.clearSvc && has(st[sel], FEAT.remove) ? UI.group([{ icon: 'mdi:delete-sweep-outline', label: 'Erledigte löschen', svc: s.clearSvc(sel), confirm: 'Löschen', noChev: true }]) : '';
      return CSS + '<div class="trl">' + headHtml + listHtml + moreHtml + clearHtml + '</div>';
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
      var partHtml = tr(T.innerHtml(n.getAttribute('data-tasks-box')));
      n.innerHTML = partHtml;
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
    var f = function (id, label, html) { return '<div class="f" id="' + esc(id) + '"><label>' + esc(Tr(label)) + '</label>' + html + '</div>'; };
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
    if (a === 'done') { T.showDone = !T.showDone; T.paint(); return; }
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
