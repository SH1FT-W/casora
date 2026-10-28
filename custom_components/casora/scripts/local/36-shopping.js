// ── Shopping list (community card „Bring! Einkaufsliste“, card request #82) ────────────────────────────────────
// Any HA to-do list (Bring!, Local To-do, Google Tasks …). This module holds what does not depend on a popup design:
// the tile word and the list's items from HA's to-do API (todo/item/subscribe, else todo/item/list); Bring's
// specification is the item's description. The popup (casora_popup_shopping) shows HA's own to-do list card until
// popup v3 draws Casora's own (.qa/v3/issue-popups-fuer-v3.md, source: popup-rework-varianten dddd8473).
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
