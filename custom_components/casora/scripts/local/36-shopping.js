// ── Shopping list (community card „Bring! Einkaufsliste“, card request #82) ────────────────────────────────────
// Any HA to-do list (Bring!, Local To-do, Google Tasks …). This module holds what does not depend on a popup design:
// the tile word and the list's items from HA's to-do API (todo/item/subscribe, else todo/item/list); Bring's
// specification is the item's description. Popup v3 (casora_popup_shopping) draws Casora's own list: the open items as
// the S8 plate with „Hinzufügen“, the ticked ones below; without v3 HA's own to-do list card.
//   window._casoraShopping.items(hass, id)   → { open: [...], done: [...] } | null until loaded (and loads)
//   window._casoraShopping.tileState(st)     – tile casora_shopping („4 offen“, „Alles eingekauft“)
//   window._casoraShopping.addItem(hass, id) – Casora's question with a text field, then todo.add_item
(function () {
  if (window._casoraShopping) return;
  var S = window._casoraShopping = {};
  var data = {}, subs = {}, listeners = [];
  // A loaded or changed list tells its listeners (a popup that draws from this cache redraws).
  S.onChange = function (fn) { if (typeof fn === 'function') listeners.push(fn); };
  var put = function (id, items) {
    var list = Array.isArray(items) ? items : [];
    data[id] = { at: Date.now(), open: list.filter(function (i) { return i.status !== 'completed'; }), done: list.filter(function (i) { return i.status === 'completed'; }) };
    listeners.forEach(function (fn) { try { fn(id, data[id]); } catch (e) { /* a listener's error stays its own */ } });
  };
  var load = function (hass, id) {
    if (!hass || !hass.connection || subs[id]) return;
    subs[id] = 'busy';
    var list = function () {
      return hass.callWS({ type: 'todo/item/list', entity_id: id }).then(function (r) { put(id, r && r.items); }, function () { put(id, []); });
    };
    // Live while Casora runs: HA sends the whole list on every change; without the subscription the list is read once.
    Promise.resolve(hass.connection.subscribeMessage(function (ev) { put(id, ev && ev.items); }, { type: 'todo/item/subscribe', entity_id: id }))
      .then(function (u) { subs[id] = u; }, function () { subs[id] = null; return list(); });
  };
  S.items = function (hass, id) {
    if (!data[id]) load(hass, id);
    return data[id] || null;
  };
  S.tileState = function (st) {
    if (!st || st.state === 'unavailable' || st.state === 'unknown') return 'Nicht erreichbar';
    var n = parseInt(st.state, 10);
    return !isFinite(n) ? '' : n === 0 ? 'Alles eingekauft' : n + ' offen';
  };
  // An item's food icon, as in the recipe card's shopping list (03-popups.js).
  S.food = function (name) {
    var R = window._casoraRecipe, f = R && R.foodOf ? R.foodOf(name) : null;
    return f ? f[1] : 'mdi:basket-outline';
  };
  // The services a popup row calls: tick off / put back, clear the ticked ones (asks first: confirm).
  S.svc = function (service, id, d) { return { domain: 'todo', service: service, target: { entity_id: id }, data: d || {} }; };
  S.toggleSvc = function (id, item, isDone) { return S.svc('update_item', id, { item: item.uid || item.summary, status: isDone ? 'needs_action' : 'completed' }); };
  S.clearSvc = function (id) { return Object.assign(S.svc('remove_completed_items', id), { confirm: 'Erledigte löschen?' }); };
  // „Hinzufügen“: Casora's question with a text field, then todo.add_item (Bring: the text after a comma is the
  // specification – „Milch, 1 l“ – as in the Bring app).
  S.parse = function (txt) {
    txt = typeof txt === 'string' ? txt.trim() : '';
    if (!txt) return null;
    var k = txt.indexOf(','), d = { item: k > 0 ? txt.slice(0, k).trim() : txt };
    if (k > 0 && txt.slice(k + 1).trim()) d.description = txt.slice(k + 1).trim();
    return d;
  };
  // ── Popup v3 (popup-richtlinien-v3.md §4 S8, §6): open items in the plate, a tap ticks one off; „Erledigt“ below,
  // a tap puts one back, „Erledigte löschen“ asks first. Redrawn from the subscription (S.onChange → paint).
  var hassNow = function () { var ha = document.querySelector('home-assistant'); return (ha && ha.hass) || null; };
  var row = function (id, it, isDone) {
    return { icon: isDone ? 'mdi:check-circle-outline' : S.food(it.summary), iconTone: isDone ? null : 'accent', label: it.summary,
      sub: it.description || null, svc: S.toggleSvc(id, it, isDone), noChev: true };
  };
  S.inner = function (part, id, hass) {
    var UI = window._casoraUI;
    if (!UI) return '';
    var d = S.items(hass || hassNow(), id);
    if (part === 'stage') {
      var add = '<div class="hui-st-act pri" role="button" tabindex="0" aria-label="Hinzufügen" data-shop-add="' + UI.esc(id) + '">'
        + '<ha-icon icon="mdi:plus" style="--mdc-icon-size:20px;width:20px;height:20px;display:flex;"></ha-icon><span>Hinzufügen</span></div>';
      var body = !d ? UI.empty({ icon: 'mdi:cart-outline', text: 'Liste wird geladen …' })
        : !d.open.length ? UI.empty({ icon: 'mdi:cart-check', text: 'Alles eingekauft', sub: d.done.length ? null : 'Neue Einträge erscheinen hier' })
        : UI.group(d.open.map(function (it) { return row(id, it, false); }), d.open.length === 1 ? '1 offen' : d.open.length + ' offen');
      return UI.stage('content', { html: '<style>.hui-stage{--casora-pv-stack-fill:transparent;}</style>'
        + '<div style="display:flex;flex-direction:column;gap:16px;">' + add + body + '</div>' });
    }
    if (part === 'done') {
      if (!d || !d.done.length) return '';
      var rows = d.done.map(function (it) { return row(id, it, true); });
      rows.push({ icon: 'mdi:delete-sweep-outline', label: 'Erledigte löschen', svc: S.clearSvc(id), confirm: 'Löschen', noChev: true });
      return UI.group(rows, 'Erledigt · ' + d.done.length);
    }
    return '';
  };
  // The parts sit in a box of their own, so a loaded or changed list redraws them without rebuilding the popup.
  S.box = function (part, id, hass) {
    return '<div data-shop-box="' + (window._casoraUI ? window._casoraUI.esc(id) : id) + '" data-shop-part="' + part + '">' + S.inner(part, id, hass) + '</div>';
  };
  S.popup = function (entity, states, hass) {
    var K = window._casoraSoftKit, UI = window._casoraUI, id = entity && entity.entity_id;
    if (!id) return { type: 'vertical-stack', cards: [] };
    if (!K || !UI || !UI.v3 || !UI.v3() || !UI.stage) return { type: 'todo-list', entity: id };
    var call = function (part) { return 'return window._casoraShopping ? window._casoraShopping.box(' + JSON.stringify(part) + ', ' + JSON.stringify(id) + ', hass) : "";'; };
    var f = { stage: { card: K.secCard([id], call('stage'), states || {}) }, done: { card: K.secCard([id], call('done'), states || {}) } };
    return K.layout({ fields: f, top: [], stage: 'stage', left: ['done'], right: [] });
  };
  var deep = function (root, out) {
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll('[data-shop-box]').forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) deep(n.shadowRoot, out); });
    return out;
  };
  S.onChange(function (id) {
    var pop = window.casoraPopup && window.casoraPopup.element;
    if (!pop) return;
    var tr = window.casoraTr || function (x) { return x; };
    deep(pop.shadowRoot, deep(pop, [])).forEach(function (n) {
      if (n.getAttribute('data-shop-box') === id) n.innerHTML = tr(S.inner(n.getAttribute('data-shop-part'), id));
    });
  });
  // „Hinzufügen“: own capture like the other popup buttons (onclick in the popup's HTML is unreliable on phones).
  var addOf = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < path.length; i++) if (path[i] && path[i].getAttribute && path[i].getAttribute('data-shop-add')) return path[i];
    return null;
  };
  var lastAdd = 0;
  var onAdd = function (ev) {
    var el = addOf(ev);
    if (!el || (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ')) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - lastAdd < 600) return;
    lastAdd = Date.now();
    window._casoraSuppressDismiss = Date.now() + 800;
    S.addItem(hassNow(), el.getAttribute('data-shop-add'));
  };
  window.addEventListener('click', onAdd, true);
  window.addEventListener('keydown', onAdd, true);

  S.addItem = function (hass, id) {
    if (!hass || !window.casoraAsk) return;
    // The question's texts in the viewer's language (casoraAsk shows them as given) and a text line, as 15-person.js.
    var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
    window.casoraAsk({ title: T('Zur Einkaufsliste'), text: '', yes: T('Hinzufügen'), input: { placeholder: T('z. B. Milch, 1 l') } }).then(function (t) {
      var d = S.parse(t);
      if (d) hass.callService('todo', 'add_item', d, { entity_id: id });
    });
  };
})();
