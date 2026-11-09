// Names Casora shows instead of the Home Assistant name. Stored in Casora settings
// (names.entities / names.devices). Nothing here renames an entity or a device.
// Tiles read window.casoraDisplayName. Badges are rewritten when their title is
// still the real name.
(function () {
  if (typeof window === 'undefined') return;

  function bucket(settings) {
    var n = settings && settings.names;
    return {
      entities: (n && n.entities) || {},
      devices: (n && n.devices) || {},
    };
  }

  function label(hass, id) {
    if (!id) return '';
    var names = bucket(window.CASORA_SETTINGS);
    if (names.entities[id]) return String(names.entities[id]);
    var reg = hass && hass.entities && hass.entities[id];
    var dev = reg && reg.device_id && names.devices[reg.device_id];
    return dev ? String(dev) : '';
  }

  // entity: a state object or an entity id.
  function displayName(entity) {
    var id = entity && entity.entity_id ? entity.entity_id : entity;
    if (!id) return '';
    var ha = document.querySelector && document.querySelector('home-assistant');
    return label(ha && ha.hass, id);
  }

  var api = window._casoraDisplayNames || {};
  api.label = label;
  api.bucket = bucket;
  window._casoraDisplayNames = api;
  window.casoraDisplayName = displayName;
  if (!window.document || window.document.nodeType !== 9) return;
  if (api._booted) return;
  api._booted = true;

  function hass() {
    var ha = document.querySelector('home-assistant');
    return ha && ha.hass;
  }

  function realNames(h, id) {
    var out = [];
    var st = h && h.states && h.states[id];
    var fn = st && st.attributes && st.attributes.friendly_name;
    if (fn) {
      out.push(String(fn).trim());
      var first = String(fn).trim().split(/\s+/)[0];
      if (first && first !== fn) out.push(first);
    }
    var reg = h && h.entities && h.entities[id];
    var dev = reg && h.devices && h.devices[reg.device_id];
    if (dev) {
      if (dev.name) out.push(String(dev.name).trim());
      if (dev.name_by_user) out.push(String(dev.name_by_user).trim());
    }
    return out.filter(Boolean);
  }

  function paintCard(card, h) {
    var id = card._config && card._config.entity;
    var shown = label(h, id);
    if (!shown || !card.shadowRoot) return;
    var reals = realNames(h, id);
    var nodes = card.shadowRoot.querySelectorAll('#name, .badge-title');
    for (var i = 0; i < nodes.length; i++) {
      var text = (nodes[i].textContent || '').trim();
      if (reals.indexOf(text) !== -1 && text !== shown) nodes[i].textContent = shown;
    }
  }

  function pass() {
    if (/^\/casora-studio/.test(location.pathname)) return;
    var h = hass();
    if (!h) return;
    var seen = [];
    var walk = function (root, d) {
      if (!root || d > 12 || !root.querySelectorAll) return;
      var cards = root.querySelectorAll('button-card');
      for (var i = 0; i < cards.length; i++) {
        if (seen.indexOf(cards[i]) !== -1) continue;
        seen.push(cards[i]);
        paintCard(cards[i], h);
      }
      var all = root.querySelectorAll('*');
      for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) walk(all[j].shadowRoot, d + 1);
    };
    walk(document, 0);
  }

  function load() {
    var h = hass();
    if (!h || !h.callWS) return;
    h.callWS({ type: 'casora/settings/get' }).then(function (r) {
      var cur = (r && r.settings) || {};
      window.CASORA_SETTINGS = Object.assign({}, window.CASORA_SETTINGS || {}, cur);
      pass();
    }).catch(function () {});
  }

  setInterval(pass, 3000);
  window.addEventListener('location-changed', function () { setTimeout(pass, 400); });
  window.addEventListener('casora-names', pass);
  setTimeout(load, 600);
})();
