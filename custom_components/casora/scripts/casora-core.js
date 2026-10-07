// Casora Studio „Wer sieht das?“ (06.10.2026): Badges und Räume nur für bestimmte HA-Benutzer.
// casoraSeen(vars, badge, user, wert) – liefert false, wenn die Badge für diesen Benutzer
// ausgeblendet ist, sonst den Wert unverändert (in den Vorlagen statt variables.show_<badge>).
(function () {
  var hassUser = function () {
    try { var h = document.querySelector('home-assistant'); return (h && h.hass && h.hass.user) || null; }
    catch (e) { return null; }
  };
  var allowed = function (list, user) {
    if (!Array.isArray(list) || !list.length) return true;
    var u = user || hassUser();
    return !!(u && u.id && list.indexOf(u.id) !== -1);
  };
  window.casoraSeen = function (vars, badge, user, val) {
    if (window.casoraEntityUsersFrom) window.casoraEntityUsersFrom(vars);
    var m = vars && vars.casora_badge_users;
    var l = m && typeof m === 'object' ? m[badge] : null;
    return allowed(l, user) ? val : false;
  };
  window.casoraSeesRoute = function (route) { return !route || allowed(route.users, null); };
  // „Wer sieht das?“ einer Kachel gilt auch für Badges und Summen: casora_entity_users (vom
  // Studio beim Speichern in jeden Raum geschrieben) sagt je Entität, wer ihre Kachel sieht.
  // Gemerkt wird dashboardweit – die Raumkarte zeichnet vor ihren Badges.
  var entityUsers = {};
  window.casoraEntityUsersFrom = function (vars) {
    if (!vars || typeof vars !== 'object') return entityUsers;
    // Raumvariablen (casora_room / Handy-Raumseite) tragen beide Listen immer, wenn es welche gibt –
    // fehlen sie dort, sind sie leer (nach dem Abschalten nicht veraltet weiter wirken).
    var room = 'show_security' in vars || 'show_climate' in vars;
    var m = vars.casora_entity_users;
    if (m && typeof m === 'object') entityUsers = m; else if (room) entityUsers = {};
    // Entitäten mit „Vor dem Schalten fragen“ (Rückfrage auch im Popup, unten).
    var c = vars.casora_confirm_entities;
    if (Array.isArray(c)) window.__casoraConfirmIds = c; else if (room) window.__casoraConfirmIds = [];
    // Eigene Kachelnamen dazu: der Dialog im Popup nennt die Kachel, nicht das Gerät.
    var cn = vars.casora_confirm_names;
    if (cn && typeof cn === 'object') window.__casoraConfirmNames = cn; else if (room) window.__casoraConfirmNames = {};
    return entityUsers;
  };
  window.casoraSeesEntity = function (id, user, vars) {
    var m = (vars && vars.casora_entity_users) || entityUsers;
    return allowed(m && m[id], user);
  };
  // Hat der Raum (für diesen Benutzer) etwas für das Sicherheits-Badge?
  window.casoraHasSec = function (v, user) {
    if (!v) return false;
    window.casoraEntityUsersFrom(v);
    var sees = function (id) { return !!id && window.casoraSeesEntity(id, user, v); };
    if (sees(v.security_lock_entity) || sees(v.security_lock_entity_2)) return true;
    for (var i = 1; i <= 8; i++) if (sees(v['security_entity_' + i])) return true;
    if ((v.security_locks || []).some(sees)) return true;
    return (v.security_cameras || []).some(sees);
  };
})();

// Rückfrage vor dem Schalten je Kachel (Studio: „Vor dem Schalten fragen“, variables.confirm_toggle).
// Fängt die Aktion des Schalters ab (hass-action, wie button-card sie schickt), fragt in einem
// ruhigen Dialog und schickt sie erst nach „Ausschalten“/„Einschalten“ weiter. Popups, Mehr-Infos
// und Casoras feste Rückfragen bleiben unberührt. dev/unit/rueckfrage_kachel.mjs
(function () {
  if (window.__casoraAskFirst) return;
  window.__casoraAskFirst = true;
  var T = function (x) { return window.casoraTr ? window.casoraTr(x) : x; };
  var passed = typeof WeakSet === 'function' ? new WeakSet() : null;
  var asksFirst = function (ev) {
    var path = ev.composedPath ? ev.composedPath() : [];
    for (var i = 0; i < path.length && i < 40; i++) {
      var c = path[i] && path[i]._config;
      if (c && c.variables && c.variables.confirm_toggle === true) return c;
    }
    var d = (ev.detail && ev.detail.config) || {};
    return d.variables && d.variables.confirm_toggle === true ? d : null;
  };
  // Nur echtes Schalten: toggle, Dienstaufruf (nicht „none“) – kein Popup, keine Mehr-Infos.
  var switching = function (d) {
    var cfg = (d && d.config) || {};
    var act = cfg[((d && d.action) || 'tap') + '_action'] || {};
    if (act.casora_popup) return null;
    var a = String(act.action || '');
    if (a === 'toggle') return act;
    if (a !== 'call-service' && a !== 'perform-action') return null;
    var svc = String(act.perform_action || act.service || '');
    return svc && svc !== 'none' ? act : null;
  };
  var word = function (act, cfg) {
    var h = document.querySelector('home-assistant');
    var states = (h && h.hass && h.hass.states) || {};
    var tgt = act.target || act.data || act.service_data || {};
    var id = [].concat(tgt.entity_id || act.entity || cfg.entity || [])[0] || '';
    var st = states[id];
    // Kachelname vor Gerätename (note4 Frage 4): eigener Name der Kachel, sonst der Name der Kachel
    // mit Rückfrage für diese Entität (casora_confirm_names – Popup-Schalter), sonst das Gerät.
    var names = window.__casoraConfirmNames || {};
    var own = cfg.name && typeof cfg.name === 'string' && cfg.name.indexOf('[[[') < 0 && cfg.name;
    var name = (cfg.__byId ? (typeof names[id] === 'string' && names[id]) || own : own || (typeof names[id] === 'string' && names[id]))
      || (st && st.attributes && st.attributes.friendly_name) || id;
    var svc = String(act.perform_action || act.service || '');
    var s = st ? String(st.state) : '';
    // Position (Regler, „25 %“ … im Cover-Popup): kleiner als jetzt = schließen, sonst öffnen.
    var pos = /\.set_(cover|valve)_position$/.test(svc) ? Number((act.data || act.service_data || {}).position) : NaN;
    var cur = st && st.attributes ? Number(st.attributes.current_position) : NaN;
    var verb = !isNaN(pos) ? (pos === 0 || (!isNaN(cur) && pos < cur) ? 'Ausschalten' : 'Einschalten')
      : /\.turn_on$|\.open_cover$|\.open_valve$/.test(svc) ? 'Einschalten'
      : /\.turn_off$|\.close_cover$|\.close_valve$/.test(svc) ? 'Ausschalten'
      : /\.unlock$/.test(svc) ? 'Aufschließen' : /\.lock$/.test(svc) ? 'Abschließen'
      : (s === 'on' || s === 'open' || s === 'playing' || s === 'unlocked') ? 'Ausschalten' : 'Einschalten';
    if (/^(cover|valve)\./.test(id) && verb === 'Einschalten') verb = 'Öffnen';
    if (/^(cover|valve)\./.test(id) && verb === 'Ausschalten') verb = 'Schließen';
    return { name: name, verb: verb };
  };
  var ask = function (w) {
    return new Promise(function (resolve) {
      var host = document.createElement('div');
      host.className = 'casora-askfirst';
      var ha = document.querySelector('home-assistant');
      if (ha && ha.hass && ha.hass.themes && ha.hass.themes.darkMode) host.classList.add('dark');
      var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
      root.innerHTML = '<style>'
        + ':host{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;'
        + 'background:rgba(0,0,0,.28);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);'
        + 'font-family:var(--casora-font, var(--ha-font-family-body, Inter, system-ui, sans-serif));animation:af .16s ease-out}'
        + '@keyframes af{from{opacity:0}to{opacity:1}}'
        + '.box{width:min(320px,100%);padding:22px 20px 16px;border-radius:24px;text-align:center;'
        // Deckend (Casoras Karten sind oft Glas): hell/dunkel wie HA.
        + 'background:var(--casora-askfirst-bg,#fff);color:var(--casora-askfirst-ink,#1c1c1e);'
        + 'box-shadow:0 18px 48px rgba(0,0,0,.24)}'
        + 'h2{margin:0 0 4px;font-size:17px;font-weight:650;line-height:1.3;overflow-wrap:anywhere}'
        + 'p{margin:0 0 18px;font-size:14px;line-height:1.4;opacity:.7}'
        + ':host(.dark){--casora-askfirst-bg:#2a2a2e;--casora-askfirst-ink:#f2f2f4}'
        + '.row{display:flex;gap:10px}button{flex:1 1 0;min-height:44px;border:0;border-radius:14px;font:inherit;font-size:15px;'
        + 'font-weight:600;cursor:pointer}'
        // Lange Knopftexte („Trotzdem scharf schalten“): untereinander, Bestätigen oben.
        + '.row.stack{flex-direction:column-reverse}'
        + '.no{background:rgba(127,127,127,.16);color:inherit}'
        + '.yes{background:var(--casora-accent,var(--primary-color,#94603B));color:#fff}'
        + 'button:focus-visible{outline:2px solid var(--casora-accent,var(--primary-color,#94603B));outline-offset:2px}'
        + '</style><div class="box" role="alertdialog" aria-modal="true"><h2></h2><p></p>'
        + '<div class="row"><button type="button" class="no"></button><button type="button" class="yes"></button></div></div>';
      // w.title/w.text/w.yes: eigener Wortlaut (Alarm scharf schalten), sonst „Wirklich …?“.
      root.querySelector('h2').textContent = w.title || w.name;
      // w.text === '': nur Titel und Knöpfe (die Frage steht schon im Titel).
      if (w.text === '') { root.querySelector('p').remove(); root.querySelector('h2').style.marginBottom = '18px'; }
      else root.querySelector('p').textContent = w.text || T('Wirklich ' + w.verb.toLowerCase() + '?');
      root.querySelector('.no').textContent = T('Abbrechen');
      root.querySelector('.yes').textContent = w.yes || T(w.verb);
      if (w.stack) root.querySelector('.row').classList.add('stack');
      var done = function (ok) {
        document.removeEventListener('keydown', key, true);
        host.remove();
        resolve(ok);
      };
      var key = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      };
      document.addEventListener('keydown', key, true);
      host.addEventListener('click', function (e) { if (e.composedPath()[0] === host) done(false); });
      root.querySelector('.no').onclick = function () { done(false); };
      root.querySelector('.yes').onclick = function () { done(true); };
      document.body.appendChild(host);
      // Fokus auf „Abbrechen“: ein versehentliches Enter schaltet nicht (Nutzertest).
      setTimeout(function () { var n = root.querySelector('.no'); if (n) n.focus(); }, 30);
    });
  };
  // Mehrere Geräte auf einmal („Zu“ für beide Jalousien, Nutzertest 7): Titel = Name der Sammelkachel
  // (casora_confirm_names unter „id1,id2“), sonst „2 Geräte“; darunter die Geräte (bis drei, dann „+N“).
  var several = function (ids, w) {
    ids = (ids || []).filter(function (x, i, a) { return typeof x === 'string' && x && a.indexOf(x) === i; });
    if (ids.length < 2) return w;
    var h = document.querySelector('home-assistant');
    var states = (h && h.hass && h.hass.states) || {};
    var names = window.__casoraConfirmNames || {};
    var key = ids.slice().sort().join(',');
    var fn = function (x) { var st = states[x]; return (st && st.attributes && st.attributes.friendly_name) || x; };
    var list = ids.slice(0, 3).map(fn).join(', ') + (ids.length > 3 ? ' +' + (ids.length - 3) : '');
    return { name: w.name, verb: w.verb, title: (typeof names[key] === 'string' && names[key]) || T(ids.length + ' Geräte'),
      text: list + ' – ' + T('Wirklich ' + w.verb.toLowerCase() + '?') };
  };
  // Entität einer Aktion (Ziel, Daten oder Karte).
  var entityOf = function (act, cfg) {
    var tgt = act.target || act.data || act.service_data || {};
    return [].concat(tgt.entity_id || act.entity || (cfg && cfg.entity) || [])[0] || '';
  };
  // Auch ohne Kachel im Pfad (Popup-Schalter, Knöpfe im Popup): Entität einer Kachel mit Rückfrage.
  var confirmIds = function () { return Array.isArray(window.__casoraConfirmIds) ? window.__casoraConfirmIds : []; };
  window.casoraAsksFirst = function (id) { return !!id && confirmIds().indexOf(id) !== -1; };
  // Eigene Rückfrage im selben Stil (07.10.2026, „Alles aus“ im Haus-Licht-Popup):
  // { title, text?, yes } – Promise<true> bei „Ja“; Fokus auf „Abbrechen“.
  window.casoraAsk = function (w) { return ask(w || {}); };
  // Für Popups, die direkt schalten: Promise<true>, wenn geschaltet werden darf.
  window.casoraConfirmSwitch = function (id, service) {
    if (!window.casoraAsksFirst(id)) return Promise.resolve(true);
    var act = { action: 'perform-action', perform_action: service || 'homeassistant.toggle', target: { entity_id: id } };
    return ask(word(act, { entity: id }));
  };
  // Knöpfe und Regler der Popups (data-casora-svc, data-casora-slider: Auf/Zu/25 %, Position …):
  // nur echtes Schalten/Fahren fragt nach, Anhalten nie (Nutzertest 5: Garagentor).
  var SWITCH_SVC = /^(turn_on|turn_off|toggle|open_cover|close_cover|set_cover_position|open_valve|close_valve|set_valve_position|lock|unlock|open|press)$/;
  window.casoraConfirmSpec = function (spec) {
    if (!spec || !spec.domain || !SWITCH_SVC.test(String(spec.service || ''))) return Promise.resolve(true);
    var ids = [].concat((spec.target && spec.target.entity_id) || (spec.data && spec.data.entity_id) || []);
    var id = ids.filter(function (x) { return window.casoraAsksFirst(x); })[0];
    if (!id) return Promise.resolve(true);
    // Licht/Lüfter, die schon an sind, nur verstellen (Helligkeit, Stufe) – das ist kein Schalten.
    var h = document.querySelector('home-assistant');
    var st = h && h.hass && h.hass.states && h.hass.states[id];
    if (spec.service === 'turn_on' && st && st.state === 'on') return Promise.resolve(true);
    var act = { action: 'perform-action', perform_action: spec.domain + '.' + spec.service,
      target: { entity_id: id }, data: spec.data || {} };
    return ask(several(ids, word(act, { entity: id })));
  };
  window.addEventListener('hass-action', function (ev) {
    if (passed && passed.has(ev)) return;
    var d = ev.detail || {};
    var act = switching(d);
    if (!act) return;
    var owner = asksFirst(ev);
    if (!owner && window.casoraAsksFirst(entityOf(act, d.config || {}))) owner = { entity: entityOf(act, d.config || {}), __byId: true };
    if (!owner) return;
    ev.stopImmediatePropagation();
    var target = (ev.composedPath && ev.composedPath()[0]) || ev.target;
    ask(word(act, Object.assign({}, owner, d.config || {}, owner.__byId ? { __byId: true } : {}))).then(function (ok) {
      if (!ok || !target) return;
      var again = new CustomEvent('hass-action', { detail: d, bubbles: true, composed: true });
      if (passed) passed.add(again);
      target.dispatchEvent(again);
    });
  }, true);
  // Studio (Nutzertest 6, P-T5): Kacheln ohne eigenes Popup (Pumpe) – die Rückfrage ansehen, ohne zu schalten.
  window.casoraAskFirstTry = function (id, name) {
    return ask(word({ action: 'toggle', target: { entity_id: id } }, { entity: id, name: name || '' }));
  };
  window.__casoraAskFirstParts = { switching: switching, word: word };

  // ── Alarm scharf schalten: Rückfrage, wenn etwas offen ist (07.10.2026) ──────────────
  // Sind Fenster/Türen offen oder ist ein Schloss entriegelt, fragt Casora vor dem Scharfschalten
  // („Achtung: 2 Fenster offen, Haustür entriegelt“ – „Trotzdem scharf schalten?“). Gezählt wird
  // wie im Sicherheits-Badge der Räume (casora_badge_security_group): Schlösser und Öffnungen aus
  // security_lock_entity(_2), security_locks und security_entity_1…8 jedes Raums des Dashboards,
  // Gruppen-Helfer über ihre Mitglieder, Kontakt + Kippsensor als eine Öffnung (casoraOpenings).
  // Ausgeblendete Räume, „Wer sieht das?“ und eine abgeschaltete Sicherheit-Badge zählen nicht.
  // Die Rückfrage hängt am Dienstaufruf selbst (hass.connection), damit Kachel, Popup, Badge und
  // Mehr-Infos gleich fragen. Unscharf schalten fragt nie. dev/unit/alarm_rueckfrage.mjs
  var ARM_SVC = /^alarm_arm_/;
  var str = function (x) { return typeof x === 'string' && x.indexOf('.') > 0 && x.indexOf('[[[') < 0; };
  // Raumvariablen mit Sicherheits-Geräten aus dem Dashboard (Desktop: casora_room, Handy: Filter-Badges).
  var armRooms = function (cfg) {
    var out = [];
    (function walk(o, d) {
      if (!o || typeof o !== 'object' || d > 14) return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, d + 1); }); return; }
      var v = o.variables;
      if (v && typeof v === 'object' && !Array.isArray(v)
        && (v.security_locks || v.security_lock_entity || v.security_entity_1)) out.push(v);
      Object.keys(o).forEach(function (k) { if (k !== 'button_card_templates' && k !== 'variables') walk(o[k], d + 1); });
    })(cfg, 0);
    return out;
  };
  window.casoraArmIds = function (cfg, user) {
    var ids = [];
    armRooms(cfg).forEach(function (v) {
      if (v.casora_hidden === true || v.show_security === false) return;
      if (Array.isArray(v.casora_users) && v.casora_users.length && window.casoraSeesRoute
        && !window.casoraSeesRoute({ users: v.casora_users })) return;
      if (window.casoraSeen && window.casoraSeen(v, 'security', user, true) === false) return;
      var list = [v.security_lock_entity, v.security_lock_entity_2].concat(Array.isArray(v.security_locks) ? v.security_locks : []);
      for (var i = 1; i <= 8; i++) list.push(v['security_entity_' + i]);
      list.forEach(function (id) {
        if (!str(id) || ids.indexOf(id) >= 0) return;
        if (window.casoraSeesEntity && !window.casoraSeesEntity(id, user, v)) return;
        ids.push(id);
      });
    });
    return ids;
  };
  // Was beim Scharfschalten offen ist, als deutsche Teile („2 Fenster offen“, „Haustür entriegelt“).
  window.casoraArmWarnings = function (hass, ids) {
    var S = (hass && hass.states) || {};
    var flat = [];
    (ids || []).forEach(function (id) {
      var m = ((S[id] || {}).attributes || {}).entity_id;
      (id.indexOf('binary_sensor.') === 0 && Array.isArray(m) ? m : [id]).forEach(function (x) {
        if (str(x) && flat.indexOf(x) < 0) flat.push(x);
      });
    });
    var locks = [], gates = 0, doors = 0, windows = 0, doorsT = 0, windowsT = 0;
    // Namen der Öffnungen je Art (bis drei Öffnungen nennt die Rückfrage sie beim Namen, 07.10.2026).
    var nm = { d: [], g: [], w: [], wt: [], dt: [] };
    var nameOf = function (id) { return String(((S[id] || {}).attributes || {}).friendly_name || id).trim(); };
    flat.forEach(function (id) {
      var e = S[id] || {}, s = String(e.state || '').toLowerCase(), a = e.attributes || {};
      var dom = id.split('.')[0];
      if (dom === 'lock') { if (s === 'unlocked' || s === 'unlocking' || s === 'open' || s === 'opening') locks.push(a.friendly_name || id); }
      else if (dom === 'cover') {
        if (['garage', 'gate', 'door'].indexOf(String(a.device_class || '').toLowerCase()) >= 0 && (s === 'open' || s === 'opening')) { gates++; nm.g.push(nameOf(id)); }
      }
    });
    var bs = flat.filter(function (id) { return id.indexOf('binary_sensor.') === 0; });
    var units = window.casoraOpenings ? window.casoraOpenings(hass, bs) : [];
    units.forEach(function (u) {
      var win = u.kind === 'window';
      if (u.state === 'open') { if (win) windows++; else doors++; nm[win ? 'w' : 'd'].push(nameOf(u.main)); }
      else if (u.state === 'tilted') { if (win) windowsT++; else doorsT++; nm[win ? 'wt' : 'dt'].push(nameOf(u.main)); }
    });
    var n = function (c, one, many) { return c + ' ' + (c === 1 ? one : many); };
    var out = [];
    // Bis drei Öffnungen mit Namen („Küchenfenster offen“, „Bad Fenster gekippt“), mehr als Zahl.
    var all = nm.d.concat(nm.g, nm.w, nm.wt, nm.dt);
    // Gleiche Namen („Fenster“, „Fenster“) sagen nichts – dann wie bisher die Anzahl.
    if (all.length <= 3 && all.every(function (x, i) { return all.indexOf(x) === i; })) {
      nm.d.concat(nm.g, nm.w).forEach(function (x) { out.push(x + ' offen'); });
      nm.wt.concat(nm.dt).forEach(function (x) { out.push(x + ' gekippt'); });
      doors = gates = windows = windowsT = doorsT = 0;
    }
    if (doors) out.push(n(doors, 'Tür offen', 'Türen offen'));
    if (gates) out.push(n(gates, 'Tor offen', 'Tore offen'));
    if (windows) out.push(n(windows, 'Fenster offen', 'Fenster offen'));
    if (windowsT) out.push(n(windowsT, 'Fenster gekippt', 'Fenster gekippt'));
    if (doorsT) out.push(n(doorsT, 'Tür gekippt', 'Türen gekippt'));
    // Bis zwei Schlösser mit Namen („Haustür entriegelt“), mehr als Zahl.
    if (locks.length > 2) out.push(locks.length + ' Schlösser entriegelt');
    else locks.forEach(function (nm) { out.push(nm + ' entriegelt'); });
    return out;
  };
  // Promise<true>, wenn scharf geschaltet werden darf (nichts offen oder „Trotzdem scharf schalten“).
  window.casoraConfirmArm = function (hass, cfg) {
    var parts = window.casoraArmWarnings(hass, window.casoraArmIds(cfg, hass && hass.user));
    if (!parts.length) return Promise.resolve(true);
    return ask({ title: T('Achtung') + ': ' + parts.map(T).join(', '), text: T('Trotzdem scharf schalten?'),
      yes: T('Trotzdem scharf schalten'), stack: true });
  };
  // Dienstaufrufe abfangen: hass.callService und callWS laufen beide über connection.sendMessagePromise.
  var guard = function (conn) {
    if (!conn || conn.__casoraArmGuard || typeof conn.sendMessagePromise !== 'function') return;
    conn.__casoraArmGuard = true;
    var orig = conn.sendMessagePromise;
    conn.sendMessagePromise = function (msg) {
      var self = this, args = arguments;
      if (!msg || msg.type !== 'call_service' || msg.domain !== 'alarm_control_panel' || !ARM_SVC.test(String(msg.service || ''))) {
        return orig.apply(self, args);
      }
      var cfg = window._casoraLovelaceCfg ? window._casoraLovelaceCfg() : null;
      var ha = document.querySelector('home-assistant');
      // Nur auf einem Casora-Dashboard (Räume mit Sicherheits-Geräten); sonst wie bisher.
      if (!cfg || !ha || !ha.hass) return orig.apply(self, args);
      return window.casoraConfirmArm(ha.hass, cfg).then(function (ok) {
        // Abbrechen: kein Fehler (sonst zeigte HA „Aktion fehlgeschlagen“ bzw. das Code-Feld „Code falsch“).
        return ok ? orig.apply(self, args) : { context: null, casora_cancelled: true };
      });
    };
  };
  var watch = function () {
    try {
      var ha = document.querySelector('home-assistant');
      guard(ha && ha.hass && ha.hass.connection);
    } catch (e) { /* später erneut */ }
  };
  window.__casoraArmGuard = guard;
  // Verbindung kommt erst nach dem Laden (und neu nach einem Neuanmelden): regelmäßig nachsehen.
  if (typeof window.setInterval === 'function') window.setInterval(watch, 3000);
})();

// Casoras Schriften (Inter, Hanken Grotesk) einmal fürs ganze Frontend:
// Designs und die Schriftwahl setzen nur den Namen, die Dateien kommen von hier.
(function () {
  if (document.getElementById('casora-font-faces')) return;
  var l = document.createElement('link');
  l.id = 'casora-font-faces';
  l.rel = 'stylesheet';
  l.href = '/casora_assets/fonts/hanken-grotesk.css';
  (document.head || document.documentElement).appendChild(l);
})();

// casora-battery:start
// Akku-Stufen (05.10.2026): eine Regel für Kachel, Popup, Glocke, Unter-Symbol, Schloss,
// Aquarium, Saugroboter und Thermostat. Stufen: ok | low (Schwach) | crit (Fast leer)
// | charging (Lädt) | unknown. Schwellen: Schwach ≤ LOW (Benachrichtigungs-Schwelle,
// Standard 20 %), Fast leer ≤ CRIT (10 %). Binärsensoren (battery, battery_low): on = Schwach.
// Textzustände einiger Integrationen: low = Schwach, critical/empty = Fast leer, sonst OK.
(function () {
  if (window.casoraBattery) return;
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  var B = {
    get LOW() { var n = Number(window.CASORA_NOTIFY_BATTERY); return isFinite(n) && n > 0 ? n : 20; },
    get CRIT() { return Math.min(10, B.LOW); },
    WORD: { ok: 'OK', low: 'Schwach', crit: 'Fast leer', charging: 'Lädt', unknown: 'Unbekannt' },
    // Farbe der Stufe: OK bleibt ruhig (kein Akzent), nur Schwach/Fast leer färben.
    TONE: { ok: null, low: 'warn', crit: 'bad', charging: 'var(--casora-ton-ink, #94603B)', unknown: null },
    COLOR: {
      ok: 'var(--casora-battery-ok, var(--casora-color-green, #6AAE78))',
      low: 'var(--casora-battery-low, var(--casora-color-orange, #DE8A4E))',
      crit: 'var(--casora-battery-crit, var(--casora-color-red, #D35A4E))',
      charging: 'var(--casora-battery-charging, var(--casora-ton-ink, #94603B))',
      unknown: 'var(--casora-text-3, rgba(128,128,128,0.6))',
    },
    pct: function (st) {
      if (st == null) return null;
      if (typeof st === 'number') return isFinite(st) ? st : null;
      if (typeof st === 'string') return num(st);
      return String(st.entity_id || '').indexOf('binary_sensor.') === 0 ? null : num(st.state);
    },
    // level(Zustand | Zahl, {charging, low}) – low überschreibt die Schwelle (z. B. Kartenvariable).
    level: function (st, o) {
      o = o || {};
      if (o.charging) return 'charging';
      var low = isFinite(Number(o.low)) && o.low !== null && o.low !== '' ? Number(o.low) : B.LOW;
      var crit = Math.min(B.CRIT, low);
      var n = B.pct(st);
      if (n != null) return n <= crit ? 'crit' : n <= low ? 'low' : 'ok';
      var raw = String(st && typeof st === 'object' ? st.state : st || '').trim().toLowerCase();
      var bin = st && typeof st === 'object' && String(st.entity_id || '').indexOf('binary_sensor.') === 0;
      if (bin) return raw === 'on' ? 'low' : raw === 'off' ? 'ok' : 'unknown';
      if (raw === 'critical' || raw === 'empty') return 'crit';
      if (raw === 'low') return 'low';
      if (raw === 'charging') return 'charging';
      if (raw === 'normal' || raw === 'high' || raw === 'medium' || raw === 'full' || raw === 'ok') return 'ok';
      return 'unknown';
    },
    word: function (lv) { return B.WORD[lv] || B.WORD.unknown; },
    tone: function (lv) { return B.TONE[lv] === undefined ? null : B.TONE[lv]; },
    color: function (lv) { return B.COLOR[lv] || B.COLOR.unknown; },
    // „Akku 45 %“ bzw. das Stufenwort, wenn es keine Zahl gibt.
    text: function (st, o) {
      var n = B.pct(st);
      return n != null ? Math.round(n) + ' %' : B.word(B.level(st, o));
    },
    icon: function (lv, n) {
      if (lv === 'charging') return 'mdi:battery-charging';
      if (lv === 'crit') return 'mdi:battery-alert-variant-outline';
      if (lv === 'low') return 'mdi:battery-low';
      if (n == null) return 'mdi:battery';
      return n >= 95 ? 'mdi:battery' : 'mdi:battery-' + Math.max(10, Math.round(n / 10) * 10);
    },
    // Alle Akkus der Batterien-Kachel/-Popups (gleiche Auswahl wie bisher: persönliche Geräte
    // und der Solarspeicher bleiben draußen, eine Kartenliste hat Vorrang). → {all, low, crit, min}
    scan: function (states, vars, hass) {
      var S = states || {};
      var v = vars || {};
      var PERSONAL = /iphone|ipad|\bwatch\b|ebike|e-bike|drive_unit|performance_line/i;
      var dcOf = function (e) { return e && e.attributes && e.attributes.device_class; };
      var given = v.batteries || v.entity_filter;
      var list = Array.isArray(given) && given.some(function (id) { return dcOf(S[id]) === 'battery'; }) ? given : null;
      var ex = window.casoraDevice && hass ? window.casoraDevice.byKey(hass, 'anker_solix', 'state_of_charge', 'sensor') : null;
      var all = (list ? list.map(function (id) { return S[id]; }).filter(Boolean)
        : Object.keys(S).map(function (id) { return S[id]; }).filter(function (e) {
          return e.entity_id !== ex && !PERSONAL.test(e.entity_id + ' ' + ((e.attributes || {}).friendly_name || ''));
        })).filter(function (e) {
        return dcOf(e) === 'battery' && e.state !== 'unavailable' && e.state !== 'unknown' && num(e.state) != null;
      });
      var low = all.filter(function (e) { return B.level(e) !== 'ok'; });
      var crit = low.filter(function (e) { return B.level(e) === 'crit'; });
      var min = all.reduce(function (m, e) { return !m || num(e.state) < num(m.state) ? e : m; }, null);
      return { all: all, low: low, crit: crit, min: min, worst: crit.length ? 'crit' : low.length ? 'low' : 'ok' };
    },
  };
  window.casoraBattery = B;
})();
// casora-battery:end

// casora-battery-hints:start
// Akku-Hinweise auf Geräte-Kacheln (06.10.2026): ein schwacher Fühler-Akku soll eine Kachel
// (z. B. Aquarium) nicht orange/aktiv machen, wenn dieselbe Seite (Ansicht) schon eine
// Batterien-Kachel hat – sonst steht dieselbe Meldung zweimal. In Räumen ohne Batterien-Kachel bleibt der Hinweis.
// Kachel-Variable battery_hints: auto (Standard) | always | never.
//   on(mode, cfg) → true = Akku-Hinweise zählen für Unterzeile und Aktiv-Zustand.
//   hasTile(cfg, view) → steht auf dieser Ansicht eine Batterien-Kachel (casora_battery)? Ohne view: ganzes Dashboard.
// Im Popup bleibt der Akkuwert immer sichtbar; andere Hinweise (Leck, Temperatur) bleiben.
(function () {
  if (window.casoraBatteryHints) return;
  var TILE = 'casora_battery';
  var cache = { cfg: null, view: null, hit: false };
  var H = {
    mode: function (v) {
      var m = String(v == null ? '' : v).trim().toLowerCase();
      return m === 'always' || m === 'never' ? m : 'auto';
    },
    // Aktuelle Ansicht aus der Adresse (/<dashboard>/<ansicht>): Pfad oder Index, sonst die erste.
    view: function (cfg, path) {
      var views = (cfg && cfg.views) || [];
      var seg = String(path == null ? (window.location && window.location.pathname) || '' : path).split('/').filter(Boolean)[1];
      for (var i = 0; i < views.length; i++) if (seg != null && (views[i].path === seg || String(i) === seg)) return views[i];
      return views[0] || null;
    },
    hasTile: function (cfg, view) {
      if (!cfg || typeof cfg !== 'object') return false;
      if (cache.cfg === cfg && cache.view === (view || null)) return cache.hit;
      var hit = false;
      (function walk(x, d) {
        if (hit || !x || typeof x !== 'object' || d > 16) return;
        if (Array.isArray(x)) { for (var i = 0; i < x.length && !hit; i++) walk(x[i], d + 1); return; }
        var tpl = [].concat(x.template || []);
        if (tpl.indexOf(TILE) > -1 && !(x.variables && x.variables.enabled === false)) { hit = true; return; }
        // Vorlagen-Sammlung des Dashboards nicht durchsuchen – dort steht die Vorlage selbst.
        for (var k in x) if (k !== 'button_card_templates' && x[k] && typeof x[k] === 'object') walk(x[k], d + 1);
      })(view || cfg.views || cfg, 0);
      cache = { cfg: cfg, view: view || null, hit: hit };
      return hit;
    },
    on: function (mode, cfg) {
      var m = H.mode(mode);
      if (m === 'always') return true;
      if (m === 'never') return false;
      if (cfg === undefined) cfg = window._casoraLovelaceCfg ? window._casoraLovelaceCfg() : null;
      return !H.hasTile(cfg, cfg && cfg.views ? H.view(cfg) : null);
    },
  };
  window.casoraBatteryHints = H;
})();
// casora-battery-hints:end

// casora-room-name:start
// Name der Übersicht (04.10.2026): Übersetzt wird nur ein Name, den Casora selbst angelegt hat
// (variables.casora_auto_name, z. B. 'home') und der noch unverändert ist ('Home'/'Zuhause'/leer).
// Jeder andere Name steht genau so da, wie er gespeichert ist – auch „Home“ auf Deutsch, auch
// ohne Markierung (ältere Dashboards). Eine Regel für Leiste, Raumtitel, Handy-Leiste und
// Handy-Kopf; das Studio rechnet mit derselben Regel (casora-panel.js, isDefaultHome).
// Rückgabe {text, literal, auto}: literal = casora-i18n darf den Text nicht übersetzen.
(function () {
  if (window.casoraRoomName) return;
  var WORDS = { home: ['Home', 'Zuhause'] };
  var norm = function (x) { return String(x == null ? '' : x).trim().toLowerCase(); };
  var isWord = function (n) {
    return Object.keys(WORDS).some(function (k) { return WORDS[k].some(function (w) { return norm(w) === norm(n); }); });
  };
  window.casoraRoomName = function (name, vars, lang) {
    var v = vars || {};
    var n = String(name == null ? '' : name).trim();
    var w = WORDS[v.casora_auto_name];
    if (w && v.name_literal !== true && (!n || w.some(function (x) { return norm(x) === norm(n); }))) {
      var text = lang ? (String(lang).indexOf('de') === 0 ? w[1] : w[0])
        : (window.casoraTr ? window.casoraTr(w[0]) : w[0]);
      return { text: text, literal: false, auto: true };
    }
    return { text: n, literal: v.name_literal === true || (!!n && isWord(n)), auto: false };
  };
})();
// casora-room-name:end

// casora-webkit-blur:start
// Unschärfe auf älteren iPhones (07.10.2026): HA 2026.10 hat bei ha-card, ha-dialog und dem
// Bottom-Sheet die Safari-Schreibweise -webkit-backdrop-filter gestrichen. Safari bis iOS 17
// kennt nur diese – ohne sie fehlt dort die Unschärfe hinter Kacheln und Popups, die die
// Casora-Designs über --ha-card-backdrop-filter / --ha-dialog-surface-backdrop-filter setzen.
// Hier kommt die Zeile mit denselben Variablen wie vor 2026.10 zurück. Ohne gesetzte Variable
// bleibt es bei „none“; unter 2026.9 steht sie doppelt (gleicher Wert, keine Wirkung).
(function () {
  if (window.__casoraWebkitBlur || !window.customElements) return;
  window.__casoraWebkitBlur = true;
  var CSS = {
    'ha-card': ':host{-webkit-backdrop-filter:var(--ha-card-backdrop-filter,none)}',
    'ha-dialog': 'wa-dialog::part(dialog){-webkit-backdrop-filter:var(--ha-dialog-surface-backdrop-filter,none)}'
      + 'wa-dialog::part(dialog)::backdrop{-webkit-backdrop-filter:var(--ha-dialog-scrim-backdrop-filter,var(--dialog-backdrop-filter,none))}',
    'ha-bottom-sheet': 'wa-drawer::part(body){-webkit-backdrop-filter:var(--ha-bottom-sheet-surface-backdrop-filter,var(--ha-dialog-surface-backdrop-filter,none))}'
      + 'wa-drawer::part(dialog)::backdrop{-webkit-backdrop-filter:var(--ha-bottom-sheet-scrim-backdrop-filter,var(--ha-dialog-scrim-backdrop-filter,var(--dialog-backdrop-filter,none)))}'
  };
  var add = function (tag) {
    customElements.whenDefined(tag).then(function () {
      try {
        var C = customElements.get(tag);
        var list = C && C.elementStyles;
        if (!Array.isArray(list) || list.__casoraWebkit) return;
        var sh = new CSSStyleSheet();
        sh.replaceSync(CSS[tag]);
        // Lit übernimmt elementStyles beim Anlegen jedes neuen Elements (adoptStyles).
        list.push(sh);
        list.__casoraWebkit = true;
        window.__casoraWebkitSheets = window.__casoraWebkitSheets || {};
        window.__casoraWebkitSheets[tag] = sh;
        // Schon gezeichnete Elemente (Modul kam später als das Dashboard): einmal nachreichen.
        setTimeout(function () {
          var n = 0;
          (function walk(root) {
            var all = root.querySelectorAll('*');
            for (var i = 0; i < all.length && n < 20000; i++, n++) {
              var el = all[i], sr = el.shadowRoot;
              if (!sr) continue;
              if (el.localName === tag && sr.adoptedStyleSheets.indexOf(sh) < 0) sr.adoptedStyleSheets = sr.adoptedStyleSheets.concat([sh]);
              walk(sr);
            }
          })(document);
        }, 1500);
      } catch (e) { /* ohne Constructable Stylesheets: wie bisher */ }
    });
  };
  Object.keys(CSS).forEach(add);
})();
// casora-webkit-blur:end

// Gefüllte Symbolfamilie in Menüs (Fix-Runde 1, A-21): Setzt ein Design
// --casora-menu-icons-filled: 1, zeigen die Menüs Kontur-Symbole in ihrer gefüllten Form
// (mdi: …-outline → ohne Suffix; eigene Sätze wie ios: …-fill bzw. …-inverse, nur wenn es
// das Symbol gibt). Ohne Token bleibt jedes Symbol, wie es ist.
(function () {
  if (window.casoraFilledIcon) return;
  var lists = {};
  var load = function (set) {
    if (lists[set] !== undefined) return;
    lists[set] = null;
    try {
      var src = window.customIcons && window.customIcons[set];
      if (!src || typeof src.getIconList !== 'function') return;
      Promise.resolve(src.getIconList()).then(function (l) {
        lists[set] = new Set((l || []).map(function (x) { return x && x.name ? x.name : x; }));
      }, function () {});
    } catch (e) {}
  };
  window.casoraFilledIcon = function (icon) {
    if (typeof icon !== 'string') return icon;
    try {
      var on = getComputedStyle(document.documentElement).getPropertyValue('--casora-menu-icons-filled').trim();
      if (on !== '1') return icon;
    } catch (e) { return icon; }
    var m = /^([a-z0-9_-]+):(.+)$/i.exec(icon);
    if (!m) return icon;
    if (m[1] === 'mdi') return /-outline$/.test(m[2]) ? 'mdi:' + m[2].replace(/-outline$/, '') : icon;
    if (/-(fill|inverse)$/.test(m[2])) return icon;
    load(m[1]);
    var l = lists[m[1]];
    if (!l) return icon;
    if (l.has(m[2] + '-fill')) return m[1] + ':' + m[2] + '-fill';
    if (l.has(m[2] + '-inverse')) return m[1] + ':' + m[2] + '-inverse';
    return icon;
  };  // Vorladen, damit schon das erste Menü die gefüllten Symbole zeigt.
  setTimeout(function () {
    try {
      if (getComputedStyle(document.documentElement).getPropertyValue('--casora-menu-icons-filled').trim() !== '1') return;
      Object.keys(window.customIcons || {}).forEach(load);
    } catch (e) {}
  }, 3000);
})();

// Unbekannter Symbolsatz (dashfix 25, 07.10.2026): Ein Symbol wie „ios:lamp-floor“ aus einem Satz,
// der nicht installiert ist, zeichnet HAs ha-icon leer (iron-icon ohne Satz) – Szenen zeigten leere
// Kreise. Erst wenn die Seite fertig geladen ist und noch etwas Zeit verging (langsam ladende Sätze
// melden sich in dieser Zeit selbst an), gilt der Satz als fehlend: dann liefert ein Ersatz-Satz
// unter diesem Namen ein neutrales Standardsymbol. Meldet sich der echte Satz später doch noch,
// geht er vor (window.customIcons wird vor customIconsets gefragt) und die Symbole laden neu.
(function () {
  if (window._casoraIconFallback) return;
  window._casoraIconFallback = true;
  var BUILTIN = ['mdi', 'hass', 'hassio', 'hademo'];
  var GRACE = 6000;
  // mdi:shape-outline
  var PATH = 'M11,13.5V21.5H3V13.5H11M9,15.5H5V19.5H9V15.5M12,2L17.5,11H6.5L12,2M12,5.86L10.08,9H13.92L12,5.86M17.5,13C20,13 22,15 22,17.5C22,20 20,22 17.5,22C15,22 13,20 13,17.5C13,15 15,13 17.5,13M17.5,15A2.5,2.5 0 0,0 15,17.5A2.5,2.5 0 0,0 17.5,20A2.5,2.5 0 0,0 20,17.5A2.5,2.5 0 0,0 17.5,15Z';
  var seen = {}, fake = {};
  var known = function (p) {
    if (BUILTIN.indexOf(p) > -1) return true;
    var ci = window.customIcons || {}, cs = window.customIconsets || {};
    if (ci[p] || (cs[p] && !fake[p])) return true;
    // Alter Weg (iron-iconset-svg) zeichnet über iron-icon – nicht ersetzen.
    try { if (document.querySelector('iron-iconset-svg[name="' + p + '"]')) return true; } catch (e) {}
    return false;
  };
  var icons = function (p) {
    var out = [];
    (function walk(r) {
      if (!r || !r.querySelectorAll) return;
      r.querySelectorAll('ha-icon').forEach(function (e) { if (String(e.icon || '').indexOf(p + ':') === 0) out.push(e); });
      r.querySelectorAll('*').forEach(function (e) { if (e.shadowRoot) walk(e.shadowRoot); });
    })(document);
    return out;
  };
  var reload = function (p) {
    icons(p).forEach(function (e) { try { e._legacy = false; e._loadIcon(); } catch (x) {} });
  };
  // Echter Satz kam doch noch: Ersatz entfernen, Symbole neu laden.
  var watch = function (p) {
    var n = 0, iv = setInterval(function () {
      n++;
      if ((window.customIcons || {})[p]) { clearInterval(iv); delete window.customIconsets[p]; delete fake[p]; reload(p); }
      else if (n > 60) clearInterval(iv);
    }, 2000);
  };
  var decide = function (p) {
    var wait = Math.max(0, GRACE - performance.now());
    if (document.readyState !== 'complete' || wait > 0) { setTimeout(function () { decide(p); }, Math.max(wait, 500)); return; }
    // Satz kam während der Wartezeit: schon gezeichnete (leere) Symbole einmal nachladen.
    if (known(p)) { reload(p); return; }
    window.customIconsets = window.customIconsets || {};
    fake[p] = true;
    window.customIconsets[p] = function () { return Promise.resolve({ path: PATH }); };
    reload(p);
    watch(p);
  };
  customElements.whenDefined('ha-icon').then(function () {
    var C = customElements.get('ha-icon'), proto = C && C.prototype;
    if (!proto || typeof proto._loadIcon !== 'function' || proto._casoraFallback) return;
    proto._casoraFallback = true;
    var orig = proto._loadIcon;
    proto._loadIcon = function () {
      var r = orig.apply(this, arguments);
      try {
        var m = /^([a-z0-9_-]+):./i.exec(String(this.icon || ''));
        if (m && this._legacy && !seen[m[1]] && !known(m[1])) { seen[m[1]] = true; decide(m[1]); }
      } catch (e) {}
      return r;
    };
    // Symbole, die schon vor diesem Skript gezeichnet wurden.
    setTimeout(function () {
      var all = [];
      (function walk(r) {
        if (!r || !r.querySelectorAll) return;
        r.querySelectorAll('ha-icon').forEach(function (e) { if (e._legacy) all.push(e); });
        r.querySelectorAll('*').forEach(function (e) { if (e.shadowRoot) walk(e.shadowRoot); });
      })(document);
      all.forEach(function (e) {
        var m = /^([a-z0-9_-]+):./i.exec(String(e.icon || ''));
        if (m && !seen[m[1]] && !known(m[1])) { seen[m[1]] = true; decide(m[1]); }
      });
    }, Math.max(0, GRACE - performance.now()));
  });
})();

// Grundschrift (Fix-Runde 1, A-01): HA setzt body fest auf Roboto, alles mit font: inherit
// (Raumleiste, ⋯-Menü, Kamera-Fehler, HA-Seitenleiste) erbte das. Ein Design kann über
// --casora-body-font seine Schrift setzen (Weich: Inter); ohne Token bleibt
// genau HAs Wert – Standard und Glas ändern sich nicht.
(function () {
  if (document.getElementById('casora-body-font')) return;
  var st = document.createElement('style');
  st.id = 'casora-body-font';
  st.textContent = 'html body{font-family:var(--casora-body-font, Roboto, Noto, sans-serif);}';
  (document.head || document.documentElement).appendChild(st);
})();

window.casoraMenuGlass = {
  radius: 'var(--casora-menu-radius, var(--ha-card-border-radius, 28px))',

  _ensure: function () {
    if (document.getElementById('casora-menu-radius-style')) return;
    var st = document.createElement('style');
    st.id = 'casora-menu-radius-style';
    st.textContent = '.casora-menu-glass,.casora-menu-glass *{'
      + 'scrollbar-width:none;-ms-overflow-style:none;}'
      + '.casora-menu-glass ::-webkit-scrollbar{display:none;width:0;height:0;}'
      // The panel's menus, not the card radius: a dropdown is chrome and reads as
      // a different object from the cards it floats over.
      + '.casora-menu-glass{--casora-menu-radius:'
      + ' var(--casora-menu-radius-desktop, 16px);'
      + '--casora-menu-pane-auto: rgba(30,33,38,0.30);'
      + '--casora-popup-chev-opacity: .35;'
      + '--casora-menu-shadow: var(--casora-elevation-floating, 0 8px 20px rgba(0,0,0,0.13));}'
      + '@media (max-width: 767px), (max-height: 500px){'
      + '.casora-menu-glass{--casora-menu-radius:'
      + ' var(--casora-tile-radius-phone, 26px);'
      + '--casora-menu-pane-auto: rgba(30,33,38,0.44);'
      + '--casora-popup-chev-opacity: .55;'
      // The phone floats over a busy photo and needs a little more.
      + '--casora-menu-shadow: var(--casora-elevation-floating-phone, 0 10px 26px rgba(0,0,0,0.18));}}'
      // Symbolkreis der Menüzeilen (Fix-Runde 1, Farbsystem): ohne Design-Token display:contents,
      // also wie bisher nur das Symbol; Weich setzt Kreisgröße, Füllung und Ton.
      + '.casora-mi{display:var(--casora-menu-ic-display, contents);flex:none;box-sizing:border-box;'
      + 'width:var(--casora-menu-ic-size, 30px);height:var(--casora-menu-ic-size, 30px);border-radius:50%;'
      + 'align-items:center;justify-content:center;place-self:center;'
      + 'background:color-mix(in srgb, var(--casora-mi-tone, transparent) var(--casora-menu-ic-fill, 0%), transparent);}';
    (document.head || document.documentElement).appendChild(st);
  },

  // Farbsystem der Menüsymbole (Fix-Runde 1, 01.10.2026) – feste Bedeutung je Ton:
  //   light = Licht, Szenen, Stimmung (Gelb) · general = Bedienung, Allgemeines, Räume (Türkis)
  //   energy = Energie, Pflanzen, OK, Versionen (Grün) · heat = Heizung, Wetter, Uhrzeit (Orange)
  //   alert = Sicherheit, Alarm, Mitteilungen (Rot) · media = Netzwerk, Medien, Updates (Blau)
  //   settings = Einstellungen, Design, Darstellung (Sand)
  // Die Töne kommen aus --casora-tone-<name> (theme_weich.yaml). Nur wenn ein Design
  // --casora-menu-tone-mix setzt, färbt sich das Symbol; sonst bleibt base (bisherige Farbe).
  // glyph: Symbol-Element; mask: true, wenn das Symbol per mask gezeichnet wird (background statt color).
  icon: function (glyph, tone, base, mask) {
    this._ensure();
    var wrap = document.createElement('span');
    wrap.className = 'casora-mi';
    if (tone) wrap.style.setProperty('--casora-mi-tone', 'var(--casora-tone-' + tone + ', transparent)');
    var ink = 'color-mix(in srgb, var(--casora-mi-tone, transparent) var(--casora-menu-tone-mix, 0%), ' + base + ')';
    if (mask) glyph.style.background = ink; else glyph.style.color = ink;
    wrap.appendChild(glyph);
    return wrap;
  },
  // Gleiches als HTML-Text (Menüs, die per innerHTML gebaut werden).
  iconHtml: function (inner, tone) {
    this._ensure();
    return '<span class="casora-mi"' + (tone ? ' style="--casora-mi-tone:var(--casora-tone-' + tone + ', transparent)"' : '')
      + '>' + inner + '</span>';
  },

  _vars: ['--casora-menu-pane', '--casora-menu-edge', '--casora-menu-rim-top',
    '--casora-menu-rim-bottom', '--ha-card-border-radius',
    '--casora-tile-radius-phone',
    '--casora-popup-ui-good', '--casora-popup-ui-warn', '--casora-popup-ui-bad',
    '--casora-elevation-floating', '--casora-elevation-floating-phone',
    '--casora-popup-ui-action', '--casora-color-teal', '--casora-color-blue',
    '--casora-color-green', '--casora-color-purple', '--casora-color-yellow',
    '--casora-u'],

  _theme: function (el) {
    var src = document.querySelector('home-assistant');
    if (!src) return;
    try {
      var cs = window.getComputedStyle(src);
      this._vars.forEach(function (n) {
        var v = cs.getPropertyValue(n);
        if (v && v.trim()) el.style.setProperty(n, v.trim());
      });
    } catch (e) {}
  },

  apply: function (el) {
    var b = 'blur(40px) saturate(170%)';
    this._ensure();
    el.classList.add('casora-menu-glass');
    this._theme(el);
    el.style.borderRadius = this.radius;
    el.style.color = 'var(--casora-menu-fg, #fff)';
    el.style.backgroundColor = 'var(--casora-menu-pane,'
      + ' var(--casora-menu-pane-auto, rgba(30,33,38,0.30)))';
    /* WebKit am Handy (30.09.2026): dort greift backdrop-filter nicht zuverlässig (vgl.
       Popup-Regel @supports (font: -apple-system-body)) – der 30-%-Glaston ließ Kacheln und
       Namen durchscheinen. Nur dort praktisch deckend; Desktop (auch Safari/Mac-App)
       behält das Glas mit Blur wie im Original. */
    try {
      if (window.CSS && CSS.supports && CSS.supports('font', '-apple-system-body')
        && window.matchMedia && window.matchMedia('(max-width: 600px)').matches) {
        el.style.backgroundColor = 'var(--casora-menu-pane-webkit, rgba(24,23,27,0.96))';
      }
    } catch (e) {}
    el.style.backgroundImage = 'none';
    el.style.backdropFilter = b;
    el.style.webkitBackdropFilter = b;
    var edge = 'var(--casora-menu-edge, rgba(0,0,0,0.11))';
    var rimT = 'var(--casora-menu-rim-top, rgba(255,255,255,0.26))';
    var rimB = 'var(--casora-menu-rim-bottom, rgba(255,255,255,0.16))';
    el.style.boxShadow = 'inset 0 1px 0 ' + rimT + ','
      + ' inset 0 -1px 0 ' + rimB + ','
      + ' inset 1px 0 0 ' + edge + ','
      + ' inset -1px 0 0 ' + edge + ','
      + ' var(--casora-menu-shadow, 0 8px 20px rgba(0,0,0,0.13))';
  },

  enter: function (el) {
    el.style.opacity = '0';
    el.style.transformOrigin = 'top right';
    el.style.transform = 'scale(0.92) translateY(-8px)';
    requestAnimationFrame(function () {
      el.style.transition = 'opacity 200ms cubic-bezier(0.32,0.72,0,1),'
        + ' transform 260ms cubic-bezier(0.32,0.72,0,1)';
      el.style.transform = 'scale(1) translateY(0)';
      el.style.opacity = '1';
    });
  },

  exit: function (el, done) {
    el.style.transition = 'opacity 150ms cubic-bezier(0.4,0,1,1),'
      + ' transform 170ms cubic-bezier(0.4,0,1,1)';
    el.style.transform = 'scale(0.95) translateY(-6px)';
    el.style.opacity = '0';
    setTimeout(function () { if (done) done(); }, 190);
  },

  dropTop: function (rect, gap) {
    var y = rect.bottom;
    var bar = this._navRow();
    if (bar) {
      var r = bar.getBoundingClientRect();
      if (r.height && r.top <= rect.bottom) y = Math.max(y, r.bottom);
    }
    return Math.round(y + (gap == null ? 10 : gap));
  },

  _navRow: function () {
    if (this._row && this._row.isConnected) return this._row;
    this._row = null;
    var walk = function (root, depth) {
      if (!root || depth > 12 || !root.querySelectorAll) return null;
      var hit = root.querySelector('casora-nav-bar');
      if (hit && hit.shadowRoot) return hit.shadowRoot.querySelector('.bar');
      var kids = root.querySelectorAll('*');
      for (var i = 0; i < kids.length; i++) {
        if (kids[i].shadowRoot) {
          var f = walk(kids[i].shadowRoot, depth + 1);
          if (f) return f;
        }
      }
      return null;
    };
    try { this._row = walk(document, 0); } catch (e) {}
    return this._row;
  },

  lockScroll: function (panel, list) {
    if (!panel || panel._casoraScrollLocked) return;
    panel._casoraScrollLocked = true;
    panel.style.overscrollBehavior = 'contain';

    var y = 0;
    panel.addEventListener('touchstart', function (ev) {
      y = ev.touches && ev.touches[0] ? ev.touches[0].clientY : 0;
    }, { passive: true });

    // Non-passive: the whole point is to be able to preventDefault.
    panel.addEventListener('touchmove', function (ev) {
      if (!ev.touches || ev.touches.length !== 1) return;
      var dy = ev.touches[0].clientY - y;
      y = ev.touches[0].clientY;

      if (!list || !list.contains(ev.target)) { ev.preventDefault(); return; }

      var over = list.scrollHeight - list.clientHeight;
      if (over <= 0) { ev.preventDefault(); return; }

      var atTop = list.scrollTop <= 0;
      var atEnd = list.scrollTop >= over - 1;
      if ((dy > 0 && atTop) || (dy < 0 && atEnd)) ev.preventDefault();
    }, { passive: false });
  },
};


(function () {
  if (window._casoraSidebarSurface) return;
  window._casoraSidebarSurface = true;

  var ID = 'casora-sidebar-surface';

  var FILL = 'var(--casora-sidebar-fill, rgba(0,0,0,0.42))';
  var BLUR = 'var(--casora-sidebar-backdrop, blur(20px) saturate(1.2))';
  var SCRIM = 'var(--casora-sidebar-scrim, rgba(0,0,0,0.24))';

  var SURFACE = [
    '  background-color: ' + FILL + ' !important;',
    '  -webkit-backdrop-filter: ' + BLUR + ';',
    '  backdrop-filter: ' + BLUR + ';',
    '  border: none !important;',
    '  box-shadow: none !important;',
  ].join('\n');

  var DRAWER_CSS = [
    '.sidebar-shell {', SURFACE, '}',
    'wa-drawer::part(dialog) {', SURFACE, '}',
  ].join('\n');

  /* The element that actually paints the modal panel. */
  var PANEL_CSS = [
    '.drawer {', SURFACE, '}',
    '.drawer::backdrop { background-color: ' + SCRIM + '; }',
  ].join('\n');

  function sheet(root, css) {
    if (!root) return false;
    var el = root.querySelector('#' + ID);
    if (el) { if (el.textContent !== css) el.textContent = css; return true; }
    var s = document.createElement('style');
    s.id = ID;
    s.textContent = css;
    root.appendChild(s);
    return true;
  }

  function findDeep(root, tag, depth) {
    if (!root || depth > 10 || !root.querySelector) return null;
    var hit = root.querySelector(tag);
    if (hit) return hit;
    var kids = root.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].shadowRoot) {
        var f = findDeep(kids[i].shadowRoot, tag, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  var _observed = null;

  function apply() {
    var drawer = findDeep(document, 'ha-drawer', 0);
    if (!drawer || !drawer.shadowRoot) return false;
    sheet(drawer.shadowRoot, DRAWER_CSS);

    if (_observed !== drawer.shadowRoot) {
      _observed = drawer.shadowRoot;
      new MutationObserver(function () { apply(); })
        .observe(drawer.shadowRoot, { childList: true, subtree: true });
    }

    var wa = drawer.shadowRoot.querySelector('wa-drawer');
    if (wa) {
      wa.style.setProperty('--wa-color-surface-raised', FILL);
      wa.style.setProperty('--wa-color-overlay-modal', SCRIM);
      if (wa.shadowRoot) sheet(wa.shadowRoot, PANEL_CSS);
    }
    return true;
  }

  var tries = 0;
  (function tick() {
    apply();
    if (++tries < 20) setTimeout(tick, tries < 6 ? 250 : 1500);
  })();
  window.addEventListener('hass-drawer-opened', apply, true);
  window.addEventListener('location-changed', apply, true);
})();

(function () {
  if (window._casoraHeaderHide) return;
  window._casoraHeaderHide = true;

  var ID = 'casora-header-hide';
  var CSS = '.header { display: none !important; }';
  var OFF = /[?&](casora_header=1|disable_km)/.test(location.search);
  // kiosk-mode's breakpoint, so one dashboard reads the same under either.
  var NARROW = window.matchMedia('(max-width: 812px)');

  function findDeep(root, tag, depth) {
    if (!root || depth > 10 || !root.querySelector) return null;
    var hit = root.querySelector(tag);
    if (hit) return hit;
    var kids = root.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].shadowRoot) {
        var f = findDeep(kids[i].shadowRoot, tag, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  var _root = null;
  function huiRoot() {
    if (_root && _root.isConnected && _root.shadowRoot) return _root;
    _root = findDeep(document, 'hui-root', 0);
    return _root;
  }

  function wanted(cfg) {
    var km = cfg && cfg.kiosk_mode;
    if (!km) return false;
    var m = km.mobile_settings;
    if (m && m.hide_header !== undefined && NARROW.matches) return !!m.hide_header;
    return !!km.hide_header;
  }

  var _sr = null;
  var _head = null;

  function apply() {
    var root = huiRoot();
    var sr = root && root.shadowRoot;
    if (!sr) return false;

    if (_sr !== sr) {
      _sr = sr;
      new MutationObserver(function () { apply(); }).observe(sr, { childList: true });
    }
    var head = sr.querySelector('.header');
    if (head && _head !== head) {
      _head = head;
      new MutationObserver(function () { apply(); }).observe(head, { childList: true, subtree: true });
    }

    var ll = root.lovelace || {};
    var on = !OFF && !ll.editMode && wanted(ll.config);
    var el = sr.querySelector('#' + ID);
    if (on === !!el) return true;
    if (!on) { el.remove(); return true; }
    var st = document.createElement('style');
    st.id = ID;
    st.textContent = CSS;
    sr.appendChild(st);
    return true;
  }

  function kick() {
    var n = 0;
    (function tick() {
      apply();
      if (++n < 12) setTimeout(tick, n < 5 ? 200 : 1200);
    })();
  }
  kick();
  window.addEventListener('location-changed', kick, true);
  window.addEventListener('popstate', kick, true);
  NARROW.addEventListener('change', apply);
})();

(function () {
  if (window._casoraEnergyOn) return;
  window._casoraEnergyOn = function (V) {
    if (!V || V.show_energy === false) return false;
    if (V.energy_power_entity) return true;
    // Ohne Raumsensor: Summe mehrerer Geräte (energy_entities).
    if (Array.isArray(V.energy_entities) && V.energy_entities.some(Boolean)) return true;
    if (V.energy_usage_today || V.energy_usage_month
      || V.energy_cost_today || V.energy_cost_month) return true;
    for (var i = 1; i <= 6; i++) if (V['energy_entity_' + i]) return true;
    return false;
  };
})();

// 06.10.2026: Leistung eines Raums aus mehreren Sensoren – eine Rechnung für Badge, Popup
// und Studio. Die Liste (energy_entities) gilt; nur das Altfeld energy_power_entity zählt als
// Liste mit einem Eintrag. Doppelte entity_ids einmal, energy_exclude nie, ein Sensor hinter
// einer Messsteckdose der Liste (energy_parent: {sensor: steckdose}) nicht doppelt. Nur
// Leistung (device_class power oder W/kW/mW/MW), kW → W; unknown/unavailable werden
// übersprungen und gezählt. items: {id, w, skip} mit skip '' | 'off' | 'nopower' | 'parent'.
(function () {
  if (window._casoraPowerSum) return;
  var FACTOR = { W: 1, kW: 1000, MW: 1e6, mW: 0.001 };
  window._casoraPowerIds = function (V) {
    V = V || {};
    var arr = function (v) { return Array.isArray(v) ? v.filter(Boolean) : (v ? [v] : []); };
    var list = arr(V.energy_entities);
    if (!list.length) list = arr(V.energy_power_entity);
    var ex = arr(V.energy_exclude);
    var seen = {};
    return list.filter(function (id) {
      if (seen[id] || ex.indexOf(id) >= 0) return false;
      seen[id] = 1;
      return true;
    });
  };
  window._casoraPowerSum = function (V, states) {
    V = V || {}; states = states || {};
    var ids = window._casoraPowerIds(V);
    var parent = (V.energy_parent && typeof V.energy_parent === 'object' && !Array.isArray(V.energy_parent)) ? V.energy_parent : {};
    var sum = 0, used = 0, skipped = 0;
    var items = ids.map(function (id) {
      var s = states[id], a = (s && s.attributes) || {};
      var unit = String(a.unit_of_measurement || (a.device_class === 'power' ? 'W' : ''));
      var it = { id: id, w: null, skip: '', unit: unit, raw: s ? s.state : null };
      if (parent[id] && parent[id] !== id && ids.indexOf(parent[id]) >= 0) { it.skip = 'parent'; it.parent = parent[id]; }
      else if (s && a.device_class && a.device_class !== 'power') it.skip = 'nopower';
      else if (s && !a.device_class && !FACTOR[unit]) it.skip = 'nopower';
      else {
        var n = s ? parseFloat(s.state) : NaN;
        if (!s || !isFinite(n)) it.skip = 'off';
        else it.w = n * (FACTOR[unit] || 1);
      }
      if (it.skip) skipped++;
      else { sum += it.w; used++; }
      return it;
    });
    return { ids: ids, items: items, sum: used ? sum : NaN, used: used, skipped: skipped };
  };
})();

// 07.10.2026: Größte Verbraucher fürs Energie-Popup, wenn im Studio keine zugeordnet sind.
// Regeln wie die Raum-Energie im Studio (casora-panel-basis.js): Leistungssensoren (device_class
// power oder W/kW/mW/MW), nie ausgeblendet/versteckt/Diagnose, nie Solar, Akku, Netz/Zähler,
// Tretleistung, Haus-/Raum-Summen oder Gruppen; je Gerät eine Messung (Geräte-Gesamtsensor, sonst
// der Last-Kanal mit dem höchsten Wert, Eigenverbrauch von powercalc nur ohne anderen Kanal; nie
// Mittel/Max). Nur gültige Werte über 0 W, kW → W, sortiert nach Leistung.
// o: { exclude: [ids], area: Bereich oder null, max: 5, visible: fn(ids) → ids }.
// Rückgabe: { top: [{ id, w }], ids: alle Kandidaten (zum Beobachten) }.
(function () {
  if (window._casoraAutoConsumers) return;
  var FACTOR = { W: 1, kW: 1000, MW: 1e6, mW: 0.001 };
  var NOT_POWER = /solar|pv\d?\b|photovolt|akku|batter|einspeis|netz|grid|smart.?meter|stromz(ä|ae)hler|z(ä|ae)hler|meter|phase|wechselrichter|inverter/i;
  var NOT_ELECTRIC = /rider|fahrer|trett?leistung|cadence|trittfrequenz|drive.?unit|watt.?bike|ergometer/i;
  var HOUSE = /gesamt|total|summe|(^|_)sum(_|$)|haus.?(leistung|verbrauch|last|bedarf)|(^|_)(bedarf|demand)(_|$)|house.?(power|load|consumption)|home.?(power|load|consumption)|wohnung.?(leistung|verbrauch)|raum.?(leistung|verbrauch)|room.?(power|consumption)|zimmer.?(leistung|verbrauch)|(^|_)(bezug|import|export)(_|$)/i;
  var POWER_STAT = /mittel|durchschnitt|average|\bavg|_avg|mean|maxim|minim|(^|[_\s.])(max|min)([_\s]|$)|peak|spitze/i;
  var DEVICE_TOTAL = /device.?power|total.?power|power.?total|ger(ä|ae)t.?(leistung|gesamt)|gesamt.?leistung/i;
  window._casoraAutoConsumers = function (hass, states, o) {
    o = o || {}; states = states || {};
    var R = (hass && hass.entities) || {}, D = (hass && hass.devices) || {};
    var ex = (o.exclude || []).filter(Boolean);
    var areaOf = function (e) { return e.area_id || (e.device_id && D[e.device_id] && D[e.device_id].area_id) || null; };
    var watt = function (id) {
      var s = states[id], a = (s && s.attributes) || {};
      var unit = String(a.unit_of_measurement || (a.device_class === 'power' ? 'W' : ''));
      if (a.device_class && a.device_class !== 'power') return null;
      if (!a.device_class && !FACTOR[unit]) return null;
      if (a.device_class === 'power' && unit && !FACTOR[unit]) return null;
      var n = s ? parseFloat(s.state) : NaN;
      return isFinite(n) ? n * (FACTOR[unit] || 1) : null;
    };
    var groups = {}, order = [];
    Object.keys(states).forEach(function (id) {
      if (id.indexOf('sensor.') !== 0 || ex.indexOf(id) >= 0) return;
      var s = states[id], a = s.attributes || {};
      if (a.device_class !== 'power' && !/^(m|k|M)?W$/.test(String(a.unit_of_measurement || ''))) return;
      if (a.device_class && a.device_class !== 'power') return;
      var e = R[id];
      if (!e || e.hidden || e.entity_category) return;
      if (Array.isArray(a.entity_id) || e.platform === 'group' || e.platform === 'min_max') return;
      var dv = (e.device_id && D[e.device_id]) || {};
      var own = id + ' ' + (a.friendly_name || '');
      var label = own + ' ' + (dv.name_by_user || '') + ' ' + (dv.name || '');
      if (NOT_POWER.test(label) || NOT_ELECTRIC.test(label)) return;
      // Haus-/Raumsummen: ohne Gerät mit solchem Namen, oder am Gerät, aber kein Geräte-Gesamtsensor.
      if (HOUSE.test(own.replace(/[\s.]+/g, '_')) && !(e.device_id && DEVICE_TOTAL.test(own))) return;
      if (o.area && areaOf(e) !== o.area) return;
      var key = e.device_id || ('\u0000' + id);
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(id);
    });
    var ids = [];
    var picks = order.map(function (k) {
      var list = groups[k];
      ids = ids.concat(list);
      var base = list.filter(function (id) { return !POWER_STAT.test(id + ' ' + ((states[id].attributes || {}).friendly_name || '')); });
      if (!base.length) return null;
      var load = base.filter(function (id) { return (R[id] || {}).platform !== 'powercalc'; });
      var c = load.length ? load : base;
      var total = c.filter(function (id) { return DEVICE_TOTAL.test(id + ' ' + ((states[id].attributes || {}).friendly_name || '')); })[0];
      var best = null;
      (total ? [total] : c).forEach(function (id) {
        var w = watt(id);
        if (w != null && (!best || w > best.w)) best = { id: id, w: w };
      });
      return best;
    }).filter(function (x) { return x && x.w > 0; });
    if (typeof o.visible === 'function') {
      var vis = o.visible(picks.map(function (x) { return x.id; })) || [];
      picks = picks.filter(function (x) { return vis.indexOf(x.id) >= 0; });
    }
    picks.sort(function (a, b) { return b.w - a.w; });
    return { top: picks.slice(0, o.max || 5), ids: ids };
  };
})();

// ── Performance mode ─────────────────────────────────────────────────────────
(function () {
  if (window._casoraPerf) return;

  var ID = 'casora-perf-style';
  var KEY = 'casora_perf';
  var MODES = { off: 1, on: 1, auto: 1 };

  var DKEY = 'casora_perf_dash';
  // Seeded from the last resolved Studio setting: it only reaches us when
  // casora_room renders, by which time the entrance has already started.
  var dashboard = (function () {
    try { return clean(localStorage.getItem(DKEY)) || 'off'; } catch (e) { return 'off'; }
  })();
  var device = null;

  // A backdrop blur costs a full-screen readback per layer per frame. Nulling the
  // variables reaches every card: a document stylesheet cannot cross a shadow
  // boundary, but custom properties inherit through it.
  // Performance mode is about what is on screen the whole time. Popups and
  // dialogs keep their blur: they paint only while open, and the lights
  // popup has no plate, so its rows rely on that blur to read as a layer.
  var CSS = 'html{'
    + '--app-header-backdrop-filter:none!important;'
    + '--ha-card-backdrop-filter:none!important;'
    + '--casora-toolbar-backdrop:none!important;'
    + '--casora-glass-backdrop:none!important;'
    + '--casora-pill-backdrop:none!important;'
    + '--casora-pill-highlight:none!important;'
    + '--casora-sidebar-backdrop:none!important;'
    + '--casora-scene-chip-backdrop:none!important;'
    + '--badge-blur:0px!important;'
    + '--casora-badge-media-backdrop:none!important;'
    + '--casora-badge-ring-backdrop:none!important;'
    // The room photo is the one full-screen filter, and it repaints on every swap.
    + '--casora-view-photo-filter:none!important;'
    + '--hero-img-blur:0px!important;'
    + '--hero-img-blur-mobile:0px!important;'
    + '--casora-mobile-hero-blur:0px!important;'
    + '--casora-card-will-change:auto!important;'
    // Entrances stay. Every one of them animates transform and opacity only,
    // which the compositor handles without a repaint, so they cost nothing once
    // the blur above is gone. Suppressing them raced with the delays smart-row
    // writes inline per tile and left a half-played entrance that read as a bug.
    // Opaque stand-ins, or every surface above turns into clear glass.
    + '--casora-glass-background:var(--casora-perf-glass-fill,rgb(44,46,52))!important;'
    + '--casora-pill-fill:var(--casora-perf-pill-fill,rgb(38,40,46))!important;'
    + '--casora-sidebar-fill:var(--casora-perf-sidebar-fill,rgb(18,20,24))!important;'
    + '--badge-background:var(--casora-perf-badge-fill,rgb(10,12,14))!important;'
    // The tiles. rgba(0,0,0,0.40) was a tint on a blurred photo; with the
    // blur gone it is a window onto the lawn.
    + '--casora-entity-background:var(--casora-perf-tile-fill,rgb(32,34,38))!important;'
    + '--ha-card-background:var(--casora-perf-card-fill,rgb(32,34,38))!important;'
    + '}';

  function clean(v) {
    v = String(v == null ? '' : v).trim().toLowerCase();
    return MODES[v] ? v : '';
  }

  // Fully Kiosk and the companion app each get one start URL, so ?casora_perf=on
  // has to stick to the device. Every other screen in the house keeps the glass.
  function pinned() {
    var m = /[?&]casora_perf=([a-z]+)/.exec(location.search || '');
    var v = m ? clean(m[1]) : '';
    if (v) { try { localStorage.setItem(KEY, v); } catch (e) {} return v; }
    try { return clean(localStorage.getItem(KEY)); } catch (e) { return ''; }
  }

  function weak() {
    var n = navigator || {};
    // iPhone/iPad (auch iPadOS mit Mac-Kennung): Safari meldet absichtlich zu wenige
    // Kerne. Apples Geräte sind schnell genug – ein altes Wandtablet stellt man fest ein.
    var ua = n.userAgent || '';
    if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (n.maxTouchPoints || 0) > 1)) return false;
    var mem = n.deviceMemory, cpu = n.hardwareConcurrency;
    if (mem && mem <= 4) return true;
    if (cpu && cpu <= 4) return true;
    return false;
  }

  function resolve() {
    var v = pinned() || dashboard || 'off';
    if (v === 'auto') {
      if (device === null) device = weak();
      return device;
    }
    return v === 'on';
  }

  function apply() {
    var head = document.head || document.documentElement;
    var el = document.getElementById(ID);
    var want = resolve();
    if (want === !!el) return;
    if (!want) { el.remove(); return; }
    el = document.createElement('style');
    el.id = ID;
    el.textContent = CSS;
    head.appendChild(el);
  }

  window._casoraPerf = {
    // Called from casora_room's variable block so the Studio setting lands too.
    // The device pin still wins: the tablet is the one that knows it is slow.
    dashboard: function (v) {
      var next = clean(v) || 'off';
      try { localStorage.setItem(DKEY, next); } catch (e) {}
      if (next !== dashboard) { dashboard = next; apply(); }
      return resolve() ? '1' : '0';
    },
    on: function () { return resolve(); }
  };

  apply();
})();

// ── Now Playing collector ────────────────────────────────────────────────────
(function () {
  if (!window.CASORA_ACTIVE_STATES) {
    window.CASORA_ACTIVE_STATES = new Set([
      'on', 'open', 'opening', 'playing', 'unlocked', 'unlocking',
      'cleaning', 'returning', 'cool', 'heat', 'washing', 'rinsing',
      'spinning', 'drying', 'running', 'active', 'problem',
    ]);
  }

  if (!window.CASORA_TEMPLATE_SIZES) {
    window.CASORA_TEMPLATE_SIZES = {};
  }

  window.casoraDeviceId = function () {
    try {
      var k = 'casora_device_id';
      var v = localStorage.getItem(k);
      if (!v) {
        v = Math.random().toString(36).slice(2, 8);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) {
      return 'nostore';
    }
  };

  window.casoraOverlayKey = function (eid) {
    return window.casoraDeviceId() + '|' + String(eid || '');
  };

  // A card can render before its variables resolve, so the weather entity is
  // remembered - but per dashboard, and never on a Casora-managed one, where
  // the config is the whole truth. The unscoped key this replaces was shared
  // by every dashboard, so a second dashboard with no weather inherited the
  // first one's sensors.
  var wxDash = function () {
    return (window.location.pathname || '').split('/').filter(Boolean)[0] || '';
  };
  window.casoraWx = function (variables, which) {
    var v = variables || {};
    var name = which === 'temp' ? 'weather_temp_sensor' : 'weather_entity';
    var val = v[name] || '';
    var key = 'casora_' + name + ':' + wxDash();
    try {
      if (val) localStorage.setItem(key, val);
      else if (v.casora_ui_managed) localStorage.removeItem(key);
    } catch (e) { /* private mode */ }
    if (val) return val;
    if (v.casora_ui_managed) return '';
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  };
  // Cards saved before the scoping still read the shared key, so it is cleared
  // on every load and the window cache is dropped whenever the dashboard changes.
  try {
    localStorage.removeItem('casora_weather_entity');
    localStorage.removeItem('casora_weather_temp_sensor');
  } catch (e) { /* private mode */ }
  setInterval(function () {
    var d = wxDash();
    if (window._casoraWxDash === d) return;
    window._casoraWxDash = d;
    window._casoraWx = null;
    window._casoraWxTemp = null;
    try {
      localStorage.removeItem('casora_weather_entity');
      localStorage.removeItem('casora_weather_temp_sensor');
    } catch (e) { /* private mode */ }
  }, 1000);

  window.CASORA_DOMAIN_GLYPH = {
    light: 'light', switch: 'plug', input_boolean: 'plug',
    fan: 'fan', climate: 'thermostat', humidifier: 'humidifier',
    media_player: 'speaker', lock: 'lock-fill', cover: 'curtain-open',
    vacuum: 'vacuum', script: 'scenes', scene: 'scenes',
    automation: 'scenes', button: 'power_on', input_button: 'power_on',
    binary_sensor: 'motion', remote: 'tv', water_heater: 'hot_water',
    valve: 'curtain-open', siren: 'motion',
  };

  window.casoraDomainGlyph = function (eid) {
    var dom = String(eid || '').split('.')[0];
    return window.CASORA_DOMAIN_GLYPH[dom] || 'default';
  };

  window.CASORA_MDI = {
    alert: 'mdi:alert', automation: 'mdi:robot', binary_sensor: 'mdi:radiobox-blank',
    button: 'mdi:gesture-tap-button', calendar: 'mdi:calendar', camera: 'mdi:video',
    climate: 'mdi:thermostat', cover: 'mdi:window-shutter', fan: 'mdi:fan',
    humidifier: 'mdi:air-humidifier', input_boolean: 'mdi:check-circle-outline',
    input_button: 'mdi:gesture-tap-button', input_number: 'mdi:ray-vertex',
    input_select: 'mdi:format-list-bulleted', input_text: 'mdi:form-textbox',
    lawn_mower: 'mdi:robot-mower', light: 'mdi:lightbulb', lock: 'mdi:lock',
    media_player: 'mdi:cast', number: 'mdi:ray-vertex', person: 'mdi:account',
    remote: 'mdi:remote', scene: 'mdi:palette', script: 'mdi:script-text',
    select: 'mdi:format-list-bulleted', sensor: 'mdi:eye', siren: 'mdi:bullhorn',
    switch: 'mdi:toggle-switch-variant', text: 'mdi:form-textbox',
    todo: 'mdi:clipboard-list', vacuum: 'mdi:robot-vacuum', valve: 'mdi:pipe-valve',
    water_heater: 'mdi:water-boiler',
  };

  function mdiDefault(states, eid) {
    var dom = String(eid || '').split('.')[0];
    var st = states && states[eid];
    var a = (st && st.attributes) || {};
    var on = st && st.state === 'on';
    var dc = a.device_class;

    if (dom === 'switch') {
      if (dc === 'outlet') return on ? 'mdi:power-plug' : 'mdi:power-plug-off';
      return on ? 'mdi:toggle-switch-variant' : 'mdi:toggle-switch-variant-off';
    }
    if (dom === 'input_boolean') {
      return on ? 'mdi:check-circle-outline' : 'mdi:close-circle-outline';
    }
    if (dom === 'automation') return on ? 'mdi:robot' : 'mdi:robot-off';
    if (dom === 'lock') {
      var ls = st && st.state;
      if (ls === 'unlocked') return 'mdi:lock-open';
      if (ls === 'jammed') return 'mdi:lock-alert';
      return 'mdi:lock';
    }
    if (dom === 'media_player') {
      if (dc === 'tv') return 'mdi:television';
      if (dc === 'speaker') return 'mdi:speaker';
      if (dc === 'receiver') return 'mdi:audio-video';
      return st && st.state === 'playing' ? 'mdi:cast-connected' : 'mdi:cast';
    }
    return window.CASORA_MDI[dom] || 'mdi:bookmark';
  }

  window.CASORA_ICON_TR = window.CASORA_ICON_TR || {};
  var _trCards = [];
  var TR_KEY = 'casora_icon_tr_v1';

  function trStore() {
    try { return JSON.parse(localStorage.getItem(TR_KEY) || '{}') || {}; }
    catch (e) { return {}; }
  }

  function trVersion(hass) {
    return (hass && hass.config && hass.config.version) || '';
  }

  function trLoad(hass, integration) {
    var all = trStore();
    var hit = all[integration];
    if (hit && hit.v === trVersion(hass)) return hit.icons;
    return undefined;
  }

  function trSave(hass, integration, icons) {
    try {
      var all = trStore();
      all[integration] = { v: trVersion(hass), icons: icons };
      localStorage.setItem(TR_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  function fetchIconTr(hass, integration) {
    if (window.CASORA_ICON_TR[integration] !== undefined) return;
    window.CASORA_ICON_TR[integration] = null;
    var send = hass.callWS
      ? function (m) { return hass.callWS(m); }
      : function (m) { return hass.connection.sendMessagePromise(m); };
    try {
      send({ type: 'frontend/get_icons', category: 'entity', integration: integration })
        .then(function (res) {
          var r = res && res.resources;
          var icons = (r && r[integration]) || null;
          window.CASORA_ICON_TR[integration] = icons;
          if (icons) trSave(hass, integration, icons);
          _trCards.forEach(function (c) {
            try { if (c && c.requestUpdate) c.requestUpdate(); } catch (e) {}
          });
        }, function () {});
    } catch (e) {}
  }

  window.casoraIconCardSeen = function (card) {
    if (card && _trCards.indexOf(card) === -1) _trCards.push(card);
  };

  window.casoraEntityIcon = function (hass, states, eid) {
    if (!eid) return 'mdi:bookmark';
    var reg = hass && hass.entities && hass.entities[eid];
    if (reg && reg.icon) return reg.icon;

    if (hass && reg && reg.platform && reg.translation_key) {
      var tr = window.CASORA_ICON_TR[reg.platform];
      if (tr === undefined) {
        var cached = trLoad(hass, reg.platform);
        if (cached) {
          tr = window.CASORA_ICON_TR[reg.platform] = cached;
          // Refreshed in the background, in case the integration changed.
          setTimeout(function () {
            window.CASORA_ICON_TR[reg.platform] = undefined;
            fetchIconTr(hass, reg.platform);
            if (!window.CASORA_ICON_TR[reg.platform]) window.CASORA_ICON_TR[reg.platform] = cached;
          }, 0);
        } else {
          fetchIconTr(hass, reg.platform);
        }
      }
      if (tr) {
        var dom = String(eid).split('.')[0];
        var node = tr[dom] && tr[dom][reg.translation_key];
        if (node) {
          var st = states && states[eid];
          var byState = node.state && st && node.state[st.state];
          if (byState) return byState;
          if (node.default) return node.default;
        }
      }
    }
    return mdiDefault(states, eid);
  };

  // Set outside the guard: a first-wins init would freeze this map at load.
  window.CASORA_TEMPLATE_SIZES.casora_entity_actions = 'large';

  // Works off the RAW config: both callers run before button-card merges templates.
  if (typeof window.casoraCardSize !== 'function') {
    window.casoraCardSize = function (cfg) {
      if (!cfg) return 'small';
      const direct = cfg.variables?.size;
      if (direct) return String(direct).toLowerCase() === 'large' ? 'large' : 'small';
      const tmpl = cfg.template;
      const list = Array.isArray(tmpl) ? tmpl : (tmpl ? [tmpl] : []);
      const sizes = window.CASORA_TEMPLATE_SIZES || {};
      for (const t of list) {
        if (sizes[t] === 'large') return 'large';
      }
      return 'small';
    };
  }

  window._casoraActions = (function () {
    var OFF = ['false', '0', 'no', 'off', 'disabled'];
    var ON_STATES = [
      'on', 'open', 'opening', 'unlocked', 'unlocking',
      'playing', 'buffering', 'home', 'connected', 'online',
      'cooling', 'heating', 'cleaning', 'running', 'active',
    ];
    var DEAD = ['unknown', 'unavailable', 'none', ''];

    function esc(v) {
      return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function enabled(variables, idx) {
      var v = variables['action_' + idx + '_enabled'];
      var ok = (v === undefined || v === null) ? true
        : (typeof v === 'boolean') ? v
        : (typeof v === 'number') ? v !== 0
        : OFF.indexOf(String(v).trim().toLowerCase()) === -1;
      return ok && !!variables['action_' + idx + '_entity'];
    }

    function order(variables) {
      return [1, 2].filter(function (i) { return enabled(variables, i); });
    }

    function any(variables) {
      return enabled(variables, 1) || enabled(variables, 2);
    }

    // Counted from the end, so slot 0 is always the bottom pill.
    function slot(variables, idx) {
      var o = order(variables);
      var p = o.indexOf(idx);
      return p < 0 ? 0 : (o.length - 1 - p);
    }

    function stateClass(states, eid) {
      if (!eid || !states[eid]) return 'unavailable';
      var st = String(states[eid].state || '').toLowerCase().replace(/_/g, ' ');
      if (DEAD.indexOf(st) !== -1) return 'unavailable';
      return ON_STATES.indexOf(st) !== -1 ? 'active' : 'normal';
    }

    function glyph(variables, idx, states, cls, hass) {
      var eid = variables['action_' + idx + '_entity'];
      var attrs = (states[eid] && states[eid].attributes) || {};
      var raw = String(variables['action_' + idx + '_icon'] || attrs.icon || '').trim();

      if (!raw && window.casoraEntityIcon) raw = window.casoraEntityIcon(hass, states, eid);
      if (!raw) raw = 'mdi:bookmark';

      if (raw.indexOf(':') !== -1) {
        return '<ha-icon class="casora-act-icon casora-act-ha-icon ' + cls + '"'
          + ' icon="' + esc(raw) + '"></ha-icon>';
      }

      var src;
      if (/^(\/|https?:\/\/)/.test(raw) || /\.(svg|png|webp)$/.test(raw)) {
        src = raw;
      } else {
        var base = String(variables.svg_path || '/casora_assets/icons').replace(/\/$/, '');
        src = base + '/' + raw + '.svg';
      }
      return '<img class="casora-act-icon casora-act-svg ' + cls + '" src="' + esc(src) + '" alt="">';
    }

    function label(variables, idx, states, prefix) {
      var explicit = variables['action_' + idx + '_label'];
      if (explicit) return String(explicit);

      var eid = variables['action_' + idx + '_entity'];
      var attrs = (states[eid] && states[eid].attributes) || {};
      var name = String(attrs.friendly_name || eid || '');
      var p = String(prefix || '').trim();

      if (p && name.toLowerCase().indexOf(p.toLowerCase() + ' ') === 0) {
        var rest = name.slice(p.length).trim();
        if (rest) name = rest.charAt(0).toUpperCase() + rest.slice(1);
      }
      return name;
    }

    var FIT_REF_PX = 12;
    var fitCtx = null;
    var fitFam = null;

    function fitEm(text, weight) {
      if (!fitCtx) {
        if (!document.createElement) return 0;
        fitCtx = document.createElement('canvas').getContext('2d');
      }
      if (!fitFam) {
        fitFam = getComputedStyle(document.documentElement)
          .getPropertyValue('--primary-font-family').trim() || 'system-ui, sans-serif';
      }
      fitCtx.font = (weight || 500) + ' ' + FIT_REF_PX + 'px ' + fitFam;
      return (fitCtx.measureText(String(text)).width / FIT_REF_PX) * 1.015;
    }

    function fitStyle(variables, states, prefix) {
      var em = 0;
      try {
        order(variables).forEach(function (i) {
          var w = fitEm(label(variables, i, states, prefix), 500);
          if (w > em) em = w;
        });
      } catch (e) { return ''; }
      if (!(em > 0)) return '';
      return ' style="font-size:clamp(var(--casora-actions-label-min, 12px),'
        + ' calc((100cqi - var(--casora-actions-label-inset, 0px)) / ' + em.toFixed(3) + '),'
        + ' var(--casora-actions-label-size, 15px))"';
    }

    function markup(variables, idx, states, prefix, hass) {
      if (!enabled(variables, idx)) return '';
      var cls = stateClass(states, variables['action_' + idx + '_entity']);
      var text = label(variables, idx, states, prefix);
      return '<div class="casora-act-hit casora-act-pill ' + cls + '" data-action-index="' + idx + '">'
        + '<span class="casora-act-glyphbox">' + glyph(variables, idx, states, cls, hass) + '</span>'
        + '<span class="casora-act-label"' + fitStyle(variables, states, prefix)
        + '>' + esc(text) + '</span></div>';
    }

    var TOGGLE_SCRIPT = 'script.casora_actions_overlay_toggle';

    function moreMarkup(variables, eid) {
      if (!any(variables)) return '';
      return '<div class="casora-act-hit casora-act-more" role="button" aria-label="Actions"'
        + ' data-more-key="' + esc(openKey(eid)) + '">'
        + '<svg class="casora-act-dots" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
        + '<circle cx="3" cy="12" r="2.5"></circle>'
        + '<circle cx="12" cy="12" r="2.5"></circle>'
        + '<circle cx="21" cy="12" r="2.5"></circle>'
        + '</svg></div>';
    }

    function run(card, variables, idx, fallbackHass) {
      var eid = variables['action_' + idx + '_entity'];
      if (!eid) return;

      var H = (card && card._hass) || fallbackHass;
      if (!H) return;

      var action = variables['action_' + idx + '_action'] || 'more-info';

      if (action === 'more-info') {
        card.dispatchEvent(new CustomEvent('hass-more-info', {
          bubbles: true, composed: true, detail: { entityId: eid },
        }));
        return;
      }

      if (action === 'toggle') {
        var domain = String(eid).split('.')[0];
        if (!domain) return;
        var go = function () { H.callService(domain, 'toggle', { entity_id: eid }); };
        if (window.casoraConfirmSwitch) window.casoraConfirmSwitch(eid, domain + '.toggle').then(function (ok) { if (ok) go(); });
        else go();
        return;
      }

      if (action === 'call-service') {
        var full = variables['action_' + idx + '_service'];
        if (!full || String(full).indexOf('.') === -1) return;
        var parts = String(full).split('.');
        var data = Object.assign({}, variables['action_' + idx + '_service_data'] || {});
        if (!data.entity_id) data.entity_id = eid;
        var run = function () { H.callService(parts[0], parts[1], data); };
        if (window.casoraConfirmSwitch) window.casoraConfirmSwitch(data.entity_id, full).then(function (ok) { if (ok) run(); });
        else run();
        return;
      }

      if (action === 'navigate') {
        var path = variables['action_' + idx + '_navigation_path'];
        if (!path) return;
        history.pushState(null, '', path);
        window.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
      }
    }

    function armRelease() {
      if (window._casoraActReleaseArmed) return;
      window._casoraActReleaseArmed = true;
      var clear = function () {
        var held = window._casoraActHeld;
        window._casoraActHeld = null;
        if (held && held.classList) held.classList.remove('pressed');
      };
      ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'blur']
        .forEach(function (t) { window.addEventListener(t, clear, true); });
    }

    function press(el, on) {
      if (!el || !el.classList) return;
      if (on) {
        var prev = window._casoraActHeld;
        if (prev && prev !== el && prev.classList) prev.classList.remove('pressed');
        window._casoraActHeld = el;
        el.classList.add('pressed');
      } else {
        if (window._casoraActHeld === el) window._casoraActHeld = null;
        el.classList.remove('pressed');
      }
    }

    function bind(card, variables, hass) {
      armRelease();
      // So a late icon-translation answer can ask this card to redraw.
      if (window.casoraIconCardSeen) window.casoraIconCardSeen(card);
      setTimeout(function () {
        try {
          var root = card && card.shadowRoot;
          if (!root) return;
          root.querySelectorAll('.casora-act-hit').forEach(function (el) {
            if (el._casoraActBound) return;
            el._casoraActBound = true;

            el.addEventListener('click', function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              var key = el.getAttribute('data-more-key');
              if (key) {
                var H = (card && card._hass) || hass;
                if (H) H.callService('script', 'turn_on', {
                  entity_id: TOGGLE_SCRIPT, variables: { actions_entity_id: key },
                });
                return;
              }
              run(card, variables, el.getAttribute('data-action-index'), hass);
            });

            el.addEventListener('pointerdown', function (ev) {
              ev.stopPropagation();
              press(el, true);
              try {
                window.dispatchEvent(new CustomEvent('haptic', { detail: 'light' }));
              } catch (e) {}
            });
            ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
              el.addEventListener(t, function () { press(el, false); });
            });

            ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (t) {
              el.addEventListener(t, function (ev) { ev.stopPropagation(); }, { passive: true });
            });
          });
        } catch (e) {}
      }, 0);
    }

    function repeat(term, n) {
      var out = '';
      for (var i = 0; i < n; i++) out += term;
      return out;
    }

    function deviceId() { return window.casoraDeviceId(); }
    function openKey(eid) { return window.casoraOverlayKey(eid); }

    function isOpen(variables, states, eid) {
      var t = states[variables.actions_toggle_helper];
      var a = states[variables.actions_active_helper];
      return !!(t && t.state === 'on' && a && a.state === openKey(eid));
    }

    // Safari cannot evaluate calc() over a clamp(), so every length is a sum of whole variables.
    function cornerWidth(variables, entityState) {
      if (variables.show_progress) {
        var active = variables.progress_active_states || [];
        var st = String(entityState || '').toLowerCase();
        if (active.indexOf(st) !== -1) return 'var(--casora-progress-size-mq)';
      }
      if (variables.show_toggle) return 'var(--casora-toggle-width)';
      return null;
    }

    function moreGeom(variables, entityState) {
      var corner = cornerWidth(variables, entityState);
      var lineTop = 'var(--casora-icon-center-y) - var(--casora-actions-hit) / 2';
      return {
        top: corner
          ? 'calc(' + lineTop + ')'
          : 'calc(' + lineTop + ' - var(--casora-actions-more-inset))',
        right: corner
          ? 'calc(var(--casora-actions-pad) + ' + corner
            + ' + var(--casora-actions-corner-gap) - var(--casora-actions-more-inset))'
          : 'calc(var(--casora-actions-pad) - var(--casora-actions-more-inset))',
        width: 'var(--casora-actions-hit)',
        height: 'var(--casora-actions-hit)',
      };
    }

    function pillGeom(variables, idx) {
      var s = slot(variables, idx);
      var n = Math.max(1, order(variables).length);
      var h = 'max(24px, min(var(--casora-actions-pill-h), calc((100% - var(--casora-actions-pad)'
        + ' - var(--casora-icon-circle-size, 44px) - var(--casora-actions-pill-clear, 10px)'
        + ' - var(--casora-actions-pill-bottom)' + repeat(' - var(--casora-actions-pill-gap)', n - 1)
        + ') / ' + n + ')))';
      return {
        top: 'calc(100% - var(--casora-actions-pill-bottom)'
          + repeat(' - ' + h, s + 1)
          + repeat(' - var(--casora-actions-pill-gap)', s) + ')',
        right: 'var(--casora-actions-pad)',
        width: 'calc(100% - var(--casora-actions-pad) - var(--casora-actions-pad))',
        height: h,
      };
    }

    function motion(variables, states, eid, idx) {
      var open = isOpen(variables, states, eid);
      var s = slot(variables, idx);
      var step = open ? s : (order(variables).length - 1 - s);
      return {
        opacity: open ? '1' : '0',
        transform: open
          ? 'scale(1) translateY(0)'
          : 'scale(var(--casora-actions-pill-scale, 0.94)) translateY(var(--casora-actions-pill-rise, 6px))',
        pointerEvents: open ? 'auto' : 'none',
        duration: open
          ? 'var(--casora-actions-dur-in, 0.30s)'
          : 'var(--casora-actions-dur-out, 0.14s)',
        easing: open
          ? 'var(--casora-actions-ease-in, cubic-bezier(0.32, 0.72, 0, 1))'
          : 'var(--casora-actions-ease-out, cubic-bezier(0.4, 0, 0.7, 1))',
        delay: open ? (60 + step * 40) + 'ms' : (step * 25) + 'ms',
      };
    }

    return {
      enabled: enabled, any: any, order: order, slot: slot, stateClass: stateClass,
      markup: markup, moreMarkup: moreMarkup, run: run, bind: bind, esc: esc,
      isOpen: isOpen, motion: motion,
      deviceId: deviceId, openKey: openKey,
      cornerWidth: cornerWidth, moreGeom: moreGeom, pillGeom: pillGeom,
    };
  }());

  if (typeof window.casoraStateFit !== 'function') {
    const emCache = new Map();
    let ctx = null;
    let fam = null;

    window.casoraTextEm = function (text, weight) {
      const w = weight || 500;
      const key = w + '|' + text;
      const hit = emCache.get(key);
      if (hit !== undefined) return hit;
      if (!ctx) ctx = document.createElement('canvas').getContext('2d');
      if (!fam) {
        fam = getComputedStyle(document.documentElement)
          .getPropertyValue('--primary-font-family').trim() || 'system-ui, sans-serif';
      }
      // Measured at 100px and divided back down, so the result is a ratio.
      ctx.font = w + ' 100px ' + fam;
      // 5% slack for letter-spacing, sub-pixel rounding and Safari's wider text run
      // (2% still cut „Wetterwarnung“/„Fußbodenheizung“ on the phone by one letter).
      const em = (ctx.measureText(String(text)).width / 100) * 1.05;
      // Before the web font has loaded the canvas measures the fallback font: don't keep that.
      let loaded = true;
      try { loaded = !document.fonts || document.fonts.check(ctx.font, String(text)); } catch (e) { /* keep */ }
      if (loaded) emCache.set(key, em);
      return em;
    };

    window.casoraStateFit = function (text, weight) {
      const t = text == null ? '' : String(text);
      if (!t) return '';
      const em = window.casoraTextEm(t, weight);
      if (!(em > 0)) return t;
      const esc = t.replace(/[&<>"]/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
      ));
      /* Handy (01.10.2026): einheitliche Schriftgröße auf allen Kacheln – kein Schrumpfen je Kachel
         mehr; passt ein Wert nicht, endet er mit „…“. Eigenes Attribut, damit casoraFitFix ihn nicht
         nachträglich doch verkleinert. Desktop unverändert (siehe unten). */
      let phone = false;
      try { phone = window.matchMedia('(max-width: 767px), (max-height: 600px)').matches; } catch (e) { /* Desktop */ }
      if (phone) {
        return '<span data-casora-clip style="display:inline-block;vertical-align:top;max-width:calc(100cqi - '
          + 'var(--casora-tile-state-inset, 0px));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
          + esc + '</span>';
      }
      /* Untergrenze 0,72em (30.09.2026): lange Namen („Hauswirtschaftsraum“) schrumpften auf dem
         Handy auf ~7 px. Reicht auch die Untergrenze nicht, bricht der Text auf höchstens zwei Zeilen um. */
      return '<span data-casora-fit style="display:-webkit-inline-box;-webkit-box-orient:vertical;'
        + '-webkit-line-clamp:2;line-clamp:2;overflow:hidden;max-width:100%;vertical-align:top;'
        + 'white-space:nowrap;hyphens:auto;overflow-wrap:break-word;font-size:max(0.72em,min(1em,'
        + 'calc((100cqi - var(--casora-tile-state-inset, 0px)) / ' + em.toFixed(3) + ')))">'
        + esc + '</span>';
    };

    // Nachmessen nach dem Zeichnen: Die Canvas-Messung bei 100 px unterschätzt kleine Schrift
    // (Inter mit optischer Größe, Safari um bis zu 10 %) – dann blieb doch ein „…“ stehen.
    window.casoraFitFix = function (root) {
      if (!root || !root.querySelectorAll) return;
      root.querySelectorAll('span[data-casora-fit]').forEach((sp) => {
        const box = sp.parentElement;
        const avail = box ? box.clientWidth : 0;
        if (sp.style.whiteSpace === 'normal') return;
        // Mit max-width:100% ist die Box nie breiter als der Platz – der Text darin schon.
        const w = Math.max(sp.getBoundingClientRect().width, sp.scrollWidth);
        if (!avail || !w || w <= avail + 0.5) return;
        const fs = parseFloat(getComputedStyle(sp).fontSize);
        const pfs = box ? parseFloat(getComputedStyle(box).fontSize) : 0;
        const min = pfs > 0 ? pfs * 0.72 : 0;
        let next = fs * avail / w * 0.985;
        /* Unter der Untergrenze nicht weiter schrumpfen, sondern zweizeilig umbrechen. */
        if (min && next < min) { next = min; sp.style.whiteSpace = 'normal'; sp.style.textAlign = 'start'; }
        if (fs > 0) sp.style.fontSize = next.toFixed(2) + 'px';
      });
    };
  }

  if (typeof window.casoraPsnStateTitle !== 'function') {
    const PSN_NOT_A_TITLE = new Set([
      'playing', 'paused', 'idle', 'on', 'off', 'home', 'away', 'online',
      'offline', 'standby', 'unavailable', 'unknown', 'none', 'null', '',
    ]);
    window.casoraPsnStateTitle = (st) => !PSN_NOT_A_TITLE.has(String(st || '').trim());
  }

  if (typeof window.casoraOptimistic !== 'function') {
    const PENDING = (window._casoraIntent = window._casoraIntent || {});
    const TTL = 1500;

    window.casoraIntend = (key, value) => {
      PENDING[key] = { value: value, at: Date.now() };
    };

    window.casoraKick = (el) => {
      if (!el) return;
      try {
        const h = el._hass || el.hass;
        if (h) el.hass = Object.assign({}, h);
        if (typeof el.requestUpdate === 'function') el.requestUpdate('_config', undefined);
      } catch (e) { /* the next state push will do it */ }
    };

    window.casoraOptimistic = (key, state, actual) => {
      const p = PENDING[key];
      if (!p) return actual;
      const age = Date.now() - p.at;
      if (age > TTL) { delete PENDING[key]; return actual; }
      const changed = state && state.last_changed ? Date.parse(state.last_changed) : 0;
      if (changed && changed >= p.at) { delete PENDING[key]; return actual; }
      return p.value;
    };
  }

  if (!window.CASORA_FILTER_CATEGORIES) {
    window.CASORA_FILTER_CATEGORIES = {
      casora_thermostat:    'climate',
      casora_air_purifier:  'climate',
      // Jalousien sind kein Klima-Gerät: kein Badge-Filter, im Raum-Popup unter „Sonstiges“.
      casora_cover:         'unfiltered',
      casora_fan:           'climate',
      casora_humidifier:    'climate',
      casora_light:         'lights',
      casora_media:         'media',
      casora_game:          'media',
      casora_energy:        'energy',
      casora_lock:          'security',
      casora_camera:        'security',
      casora_doorbell:      'security',   // deprecated alias for casora_camera
      casora_cameras:       'security',
      casora_vacuum:        'unfiltered',
      casora_plant:         'unfiltered',
    };
  }

  if (typeof window._casoraSameGame !== 'function') {
    window._casoraSameGame = function (x, y) {
      const flat = (v) => String(v || '').toLowerCase()
        .replace(/[™®©]/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      const a = flat(x), b = flat(y);
      if (!a || !b) return false;
      if (a === b) return true;
      const [short, long] = a.length <= b.length ? [a, b] : [b, a];
      if (!long.startsWith(short + ' ')) return false;
      return !/[0-9]/.test(long.slice(short.length));
    };
  }

  if (typeof window._casoraPCSources !== 'function') {
    window._casoraPCSources = function (states, V) {
      const norm = (x) => String(x ?? '').trim();
      const low = (x) => norm(x).toLowerCase();
      const dead = (v, extra) => !v ||
        ['unknown', 'unavailable', ''].concat(extra || []).includes(low(v));
      const url = (key) => {
        const s = key && states[key];
        const raw = s?.attributes?.entity_picture || s?.state;
        return (raw && String(raw).startsWith('http')) ? String(raw) : null;
      };

      const dcResolve = () => {
        const u = V.discord_user && states[V.discord_user];
        const a = (u && u.attributes) || {};
        const pick = (...xs) => xs.find((x) => x && String(x).startsWith('http')) || null;
        return {
          status: V.discord_online ? states[V.discord_online]?.state : u?.state,
          game: V.discord_game ? states[V.discord_game]?.state : a.game,
          details: V.discord_details ? states[V.discord_details]?.state
            : (a.game_details || a.game_state),
          img: V.discord_image ? url(V.discord_image)
            : pick(a.game_image_large, a.game_image_header, a.game_image_hero_capsule),
        };
      };

      // Discord: presence must not be offline (DND and idle are normal in-game).
      let discord = null;
      if (V.discord_user || (V.discord_online && V.discord_game)) {
        const d = dcResolve();
        const status = low(d.status);
        const game = norm(d.game);
        if (!dead(status, ['offline', 'none']) && !dead(game)) {
          const details = norm(d.details);
          discord = {
            game: game,
            details: dead(details) ? '' : details,
            img: d.img,
            label: norm(V.discord_label) || 'PC',
          };
        }
      }

      const stResolve = () => {
        const u = V.steam_account && states[V.steam_account];
        const a = (u && u.attributes) || {};
        const pick = (...xs) => xs.find((x) => x && String(x).startsWith('http')) || null;
        return {
          status: V.steam_online ? states[V.steam_online]?.state : u?.state,
          game: V.steam_game ? states[V.steam_game]?.state : a.game,
          img: V.steam_image ? url(V.steam_image)
            : pick(a.game_image_main, a.game_image_header, a.game_icon),
        };
      };

      let steam = null;
      if (V.steam_account || V.steam_game) {
        const t = stResolve();
        const status = low(t.status);
        const game = norm(t.game);
        const guard = !(V.steam_account || V.steam_online)
          || !dead(status, ['offline', 'none']);
        if (guard && !dead(game, ['none'])) {
          steam = {
            game: game,
            details: '',
            img: t.img,
            label: norm(V.steam_label) || 'Steam',
          };
        }
      }

      if (discord && steam && window._casoraSameGame(discord.game, steam.game)) {
        const policy = low(V.duplicate_game) || 'discord';
        if (policy !== 'both') {
          const keepSteam = policy === 'steam';
          const win = keepSteam ? steam : discord;
          const lose = keepSteam ? discord : steam;
          if (!win.img) win.img = lose.img;
          if (!win.details) win.details = lose.details;
          if (keepSteam) discord = null; else steam = null;
        }
      }

      return { discord: discord, steam: steam };
    };
  }

  // casora-paused-since:start
  // Seit wann ein Player wirklich pausiert (04.10.2026). Nach einem HA-Neustart geht ein Player
  // paused → unavailable → paused, last_changed beginnt neu. Die Integration merkt sich den echten
  // Zeitpunkt (sensor.casora_media_paused, Attribut players); gilt er für denselben Titel, zählt
  // die Ausblende-Zeit ab dort. Ohne Eintrag (neue Installation, anderer Titel): last_changed.
  if (typeof window._casoraPausedSince !== 'function') {
    window._casoraPausedSince = function (s, states) {
      if (!s) return undefined;
      try {
        const all = states || (document.querySelector('home-assistant') || {}).hass?.states || {};
        const map = all['sensor.casora_media_paused']?.attributes?.players;
        const e = map && s.entity_id ? map[s.entity_id] : null;
        const a = s.attributes || {};
        const key = String(a.media_title || a.media_content_id || '').trim();
        if (e && e.since && String(s.state) === 'paused' && String(e.title ?? '') === key
            && Number.isFinite(Date.parse(e.since))) return e.since;
      } catch (err) { /* fällt auf last_changed zurück */ }
      return s.last_changed;
    };
  }
  // casora-paused-since:end

  // Die Handy-Vorlage (casora_mobile_now_playing, casora_np_init) bringt Ersatzfassungen von
  // _casoraNPSources/_casoraNPView/_casoraNP/_casoraNPPlan mit, falls dieses Skript fehlt. Rendert
  // sie vor diesem Skript, setzte sich bisher IHRE ältere Fassung durch (eine Merkliste für alle
  // Karten, keine Pausen-Frist, kein Ausblenden; 05.10.2026 am Handy gesehen). Die Fassungen hier
  // sind die gültigen: eine Ersatzfassung wird ersetzt, die eigene (Merker _casoraCore) bleibt.
  window._casoraNPOwn = function (n) { const f = window[n]; return typeof f !== 'function' || !f._casoraCore; };
  const npFallbackSeen = ['_casoraNPSources', '_casoraNPView', '_casoraNP', '_casoraNPPlan']
    .some((n) => typeof window[n] === 'function' && !window[n]._casoraCore);

  if (window._casoraNPOwn('_casoraNPSources')) {
    window._casoraNPSources = function (states, V) {
      const norm = (x) => String(x ?? '').trim();
      const low  = (x) => norm(x).toLowerCase();
      const abs  = (u) => {
        if (!u) return null;
        const s = String(u);
        const full = s.startsWith('/') ? (location.origin + s) : s;
        // Strip cache-busting ?refresh= so images don't flash on each poll.
        try {
          const p = new URL(full, location.origin);
          // authSig signs the exact param list, so editing the query of a signed URL 401s it.
          if (p.searchParams.has('authSig')) return full;
          p.searchParams.delete('refresh');
          return p.toString();
        } catch (e) { return full; }
      };
      const ms = (t) => { const n = t ? Date.parse(t) : NaN; return Number.isFinite(n) ? n : 0; };
      const sameGame = (x, y) => {
        const flat = (v) => String(v || '').toLowerCase()
          .replace(/[\u2122\u00ae\u00a9]/g, ' ')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        const a = flat(x), b = flat(y);
        if (!a || !b) return false;
        if (a === b) return true;
        const [short, long] = a.length <= b.length ? [a, b] : [b, a];
        if (!long.startsWith(short + ' ')) return false;
        return !/[0-9]/.test(long.slice(short.length));
      };

      const pauseTimeout = Number(V.pause_timeout_minutes ?? 10);
      const out = [];

      for (let i = 1; i <= 10; i++) {
        if (!V['show_media_player_' + i]) continue;
        const eid = V['media_player_' + i];
        const s = eid && states[eid];
        if (!s) continue;

        const st = low(s.state);
        const a  = s.attributes || {};
        const rawTitle = norm(a.media_title);
        let artist = norm(a.media_artist || a.artist || a.media_album_artist);
        const hasContent = !!(rawTitle || artist);

        const feats = Number(a.supported_features || 0);
        const controls = {
          toggle: !!(feats & 16385),
          next: !!(feats & 32),
          prev: !!(feats & 16),
        };
        const hasControls = !!(controls.toggle || controls.next || controls.prev);

        let active = false;
        let pauseUntil = 0;
        if (st === 'playing' || st === 'buffering') active = true;
        else if (st === 'paused' && hasContent && hasControls) {
          if (pauseTimeout <= 0) active = true;
          else {
            pauseUntil = ms(window._casoraPausedSince(s, states)) + (pauseTimeout * 60000);
            active = Date.now() <= pauseUntil;
          }
        }
        if (!active) continue;

        // Same title/artist derivation as the media player badge, to stay in sync.
        let title = rawTitle;
        if (!artist && a.media_content_type === 'tvshow') {
          const series  = norm(a.media_series_title);
          const season  = a.media_season  ? 'S' + String(a.media_season).padStart(2, '0')  : '';
          const episode = a.media_episode ? 'E' + String(a.media_episode).padStart(2, '0') : '';
          artist = [series, [season, episode].filter(Boolean).join('')].filter(Boolean).join(' · ');
        }
        if (!artist) {
          const parts = rawTitle.split(/\s+[-–—]\s+/);
          if (parts.length >= 3) {
            title = parts[parts.length - 1];
            artist = parts.slice(0, -1).join(' – ');
          }
        }

        let art = abs(a.entity_picture || a.media_image_url || a.media_album_cover_url || a.image_url);
        if (!art) {
          const app = low(a.app_name || a.source) + ' ' + low(a.app_id);
          if (app.includes('youtube')) art = '/casora_assets/icons/youtube.png';
          else if (app.includes('netflix')) art = '/casora_assets/icons/netflix.png?v=4';
          else if (app.includes('dazn')) art = '/casora_assets/icons/dazn.png?v=1';
        }

        out.push({
          key: 'mp' + i,
          kind: 'player',
          entity: eid,
          art: art,
          title: title || norm(a.friendly_name) || 'Medien',
          // Echter Medientitel (ohne Ersatz durch den Gerätenamen) – Weich gruppiert danach.
          mtitle: title,
          subtitle: artist,
          source: norm(a.app_name || a.source || a.friendly_name),
          started: ms(s.last_changed),
          state: st,
          playing: st === 'playing' || st === 'buffering',
          controls: controls,
          pauseUntil: pauseUntil,
          pos: Number(a.media_position),
          dur: Number(a.media_duration),
          posAt: ms(a.media_position_updated_at),
        });
      }

      for (let i = 1; i <= 2; i++) {
        if (!V['show_psn_' + i]) continue;
        const eid = V['psn_' + i];
        const s = eid && states[eid];
        if (!s) continue;
        const st = low(s.state);
        if (['unavailable', 'unknown', 'off', 'standby', 'none', ''].includes(st)) continue;
        const a = s.attributes || {};
        // The integration's own sensor carries the game in its STATE.
        const notATitle = (window.CASORA_PSN_NOT_A_TITLE || (window.CASORA_PSN_NOT_A_TITLE =
          new Set(['playing', 'paused', 'idle', 'on', 'off', 'home', 'away',
            'online', 'offline', 'standby', 'unavailable', 'unknown',
            'none', 'null', ''])));
        const attrTitle = norm(a.full_title || a.media_title || a.title);
        const stateIsTitle = !attrTitle && !notATitle.has(st);
        const title = attrTitle || (stateIsTitle ? norm(s.state) : '');
        if (!title) continue;
        out.push({
          key: 'psn' + i,
          kind: 'activity',
          entity: eid,
          art: abs(a.entity_picture_local || a.entity_picture || a.image_url
            || a.media_image_url
            || (function () {
              const iid = String(eid).replace(/^sensor\./, 'image.');
              const im = states[iid];
              const iat = (im && im.attributes) || {};
              if (iat.entity_picture_local || iat.entity_picture) {
                return iat.entity_picture_local || iat.entity_picture;
              }
              if (!im || !iat.access_token) return '';
              return '/api/image_proxy/' + iid + '?token=' + iat.access_token;
            })()),
          title: title,
          subtitle: norm(a.user),
          // Friendly name ("PS5"), not a.source (verbose "PlayStation Network").
          source: norm(a.friendly_name) || norm(a.source) || 'PlayStation',
          started: ms(s.last_changed),
          state: stateIsTitle ? 'playing' : st,
          playing: stateIsTitle ? true : st === 'playing',
          controls: { toggle: false, next: false, prev: false },
        });
      }

      const dcOnline = V.discord_online;
      const dcGame = V.discord_game;
      const dcImage = V.discord_image;
      const dcDetails = V.discord_details;
      const dcU = V.discord_user && states[V.discord_user];
      const dcA = (dcU && dcU.attributes) || {};
      const dcHttp = (...xs) => xs.find((x) => x && String(x).startsWith('http')) || null;
      if (V.show_discord && (V.discord_user || (dcOnline && dcGame))) {
        // Any presence but offline counts - DND and idle are normal while gaming.
        const status = low(dcOnline ? states[dcOnline]?.state : dcU?.state);
        const live = !!status && !['offline', 'unknown', 'unavailable', 'none'].includes(status);
        const game = norm(dcGame ? states[dcGame]?.state : dcA.game);
        const dead = !game || ['unknown', 'unavailable'].includes(game.toLowerCase());
        if (live && !dead) {
          const imgS = dcImage && states[dcImage];
          const ia = (imgS && imgS.attributes) || {};
          const dcSub = dcDetails ? states[dcDetails]?.state : (dcA.game_details || dcA.game_state);
          out.push({
            key: 'discord',
            kind: 'activity',
            entity: dcImage || dcGame || V.discord_user,
            art: dcImage
              ? abs(ia.entity_picture_local || ia.entity_picture || ia.image_url
                || (function(){ const v = String(states[dcImage]?.state || ''); return /^(https?:)?\/\//.test(v) || v.charAt(0) === '/' ? v : ''; })())
              : abs(dcHttp(dcA.game_image_large, dcA.game_image_header, dcA.game_image_hero_capsule)),
            title: game,
            subtitle: norm(dcSub).replace(/^(unknown|unavailable)$/i, ''),
            source: norm(V.discord_label) || 'PC',
            started: ms((dcGame ? states[dcGame] : dcU)?.last_changed),
            state: 'playing',
            playing: true,
            controls: { toggle: false, next: false, prev: false },
          });
        }
      }

      if (V.show_steam && (V.steam_account || V.steam_game)) {
        const stU = V.steam_account && states[V.steam_account];
        const stA = (stU && stU.attributes) || {};
        const stStatus = low(V.steam_online ? states[V.steam_online]?.state : stU?.state);
        const stLive = !(V.steam_account || V.steam_online) ||
          (!!stStatus && !['offline', 'unknown', 'unavailable', 'none'].includes(stStatus));
        const game = norm(V.steam_game ? states[V.steam_game]?.state : stA.game);
        const dead = !game || ['none', 'unknown', 'unavailable'].includes(game.toLowerCase());
        if (stLive && !dead) {
          const imgS = V.steam_image && states[V.steam_image];
          const ia = (imgS && imgS.attributes) || {};
          // An override entity may be a template sensor whose STATE is the URL.
          const raw = V.steam_image
            ? (ia.entity_picture_local || ia.entity_picture || ia.image_url ||
               (String(imgS?.state || '').startsWith('http') ? imgS.state : null))
            : [stA.game_image_main, stA.game_image_header, stA.game_icon]
                .find((x) => x && String(x).startsWith('http'));
          out.push({
            key: 'steam',
            kind: 'activity',
            entity: V.steam_image || V.steam_game || V.steam_account,
            art: abs(raw),
            title: game,
            subtitle: '',
            source: norm(V.steam_label) || 'Steam',
            started: ms(states[V.steam_game || V.steam_account]?.last_changed),
            state: 'playing',
            playing: true,
            controls: { toggle: false, next: false, prev: false },
          });
        }
      }

      const dcRow = out.find((r) => r.key === 'discord');
      const stRow = out.find((r) => r.key === 'steam');
      if (dcRow && stRow && sameGame(dcRow.title, stRow.title)) {
        const policy = low(V.duplicate_game) || 'discord';
        if (policy !== 'both') {
          const win = policy === 'steam' ? stRow : dcRow;
          const lose = win === dcRow ? stRow : dcRow;
          if (!win.art) win.art = lose.art;
          if (!win.subtitle) win.subtitle = lose.subtitle;
          out.splice(out.indexOf(lose), 1);
        }
      }

      const rank = (r) => {
        const c = r.controls;
        const hasCtl = !!(c && (c.toggle || c.next || c.prev));
        const isMedia = r.kind !== 'activity';
        return (hasCtl ? 4 : 0) + (r.playing ? 2 : 0) + (isMedia ? 1 : 0);
      };
      out.sort((x, y) => (rank(y) - rank(x)) || (y.started - x.started));

      // No stability/hysteresis here by design - hold_src covers that.

      // Manual pin overrides ranking; ignored if that source is no longer active.
      const pin = String(V.pinned_key || '').trim();
      if (pin) {
        const i = out.findIndex(r => r.key === pin);
        if (i > 0) out.unshift(out.splice(i, 1)[0]);
      }
      return out;
    };
    window._casoraNPSources._casoraCore = true;
  }

  if (typeof window._casoraNPCfgKey !== 'function') {
    window._casoraNPCfgKey = function (V) {
      const v = V || {};
      const out = [];
      for (let i = 1; i <= 10; i++) out.push(v['media_player_' + i] || '');
      for (let i = 1; i <= 2; i++) out.push(v['psn_' + i] || '');
      out.push(v.discord_user || '', v.discord_game || '', v.discord_online || '',
        v.discord_image || '', v.steam_account || '', v.steam_game || '',
        v.steam_online || '', v.steam_image || '');
      return out.join('|');
    };
  }

  if (typeof window._casoraNPStore !== 'function') {
    window._casoraNPStore = function (V, name) {
      const all = window._casoraNPStores = window._casoraNPStores || {};
      const k = window._casoraNPCfgKey(V) + '|' + name;
      return all[k] = all[k] || {};
    };
  }

  if (window._casoraNPOwn('_casoraNPView')) {
    window._casoraNPView = function (states, V) {
      const live = window._casoraNP(states, V);
      const st = window._casoraNPStore(V, 'hold');
      if (live.length) { st.last = live; st.emptyAt = 0; return live; }
      if (st.last && st.last.length) {
        if (!st.emptyAt) st.emptyAt = Date.now();
        // Comfortably past the 420ms exit animation; overshoot costs nothing.
        if (Date.now() - st.emptyAt < 900) return st.last;
      }
      return live;
    };
    window._casoraNPView._casoraCore = true;
  }

  // Memoised per render pass - avoids re-running the sweep for every consumer.
  if (window._casoraNPOwn('_casoraNP')) {
    window._casoraNP = function (states, V) {
      const artSig = (u) => {
        const t = String(u || '');
        const q = t.indexOf('?');
        if (q < 0) return t;
        const rest = t.slice(q + 1).split('&')
          .filter((p) => p.slice(0, 6) !== 'token=' && p.slice(0, 8) !== 'authSig=')
          .sort().join('&');
        return t.slice(0, q) + (rest ? '?' + rest : '');
      };
      const parts = [];
      // Echter Pausen-Beginn (sensor.casora_media_paused): verschiebt die Ausblende-Frist, gehört
      // also in die Signatur – und wird so auch von button-card mitverfolgt.
      const pausedMap = states['sensor.casora_media_paused']?.attributes?.players || null;
      parts.push('pt:' + String(V.pause_timeout_minutes ?? ''));
      for (let i = 1; i <= 10; i++) {
        const e = V['show_media_player_' + i] && V['media_player_' + i];
        if (e) {
          const s = states[e]; const a = s?.attributes || {};
          const ps = pausedMap && pausedMap[e];
          parts.push(e + s?.state + (a.media_title || '') + '\u0001' + (a.media_artist || a.artist || '') +
            (a.media_position_updated_at || '') + (ps ? '\u0001' + (ps.since || '') + (ps.title ?? '') : '') +
            artSig(a.entity_picture || a.media_image_url || a.media_album_cover_url || a.image_url));
        }
      }
      for (let i = 1; i <= 2; i++) {
        const p = V['show_psn_' + i] && V['psn_' + i];
        if (p) {
          const pa = states[p]?.attributes || {};
          const pim = states[String(p).replace(/^sensor\./, 'image.')];
          const pia = (pim && pim.attributes) || {};
          parts.push(p + states[p]?.state + (pa.full_title || '') +
            artSig(pa.entity_picture_local || pa.entity_picture || pa.image_url || pa.media_image_url) +
            artSig(pia.entity_picture_local || pia.entity_picture) +
            String(pim?.state || ''));
        }
      }
      if (V.show_steam) {
        const si = states[V.steam_image];
        const sa = states[V.steam_account];
        const saa = sa?.attributes || {};
        parts.push(String(states[V.steam_online]?.state) + String(states[V.steam_game]?.state) +
          String(sa?.state || '') + String(saa.game || '') +
          artSig(si?.attributes?.entity_picture || si?.state || '') +
          artSig(saa.game_image_main || saa.game_image_header || saa.game_icon || ''));
      }
      if (V.show_discord) {
        const ia = (V.discord_image && states[V.discord_image]?.attributes) || {};
        const dcSt = String(states[V.discord_image]?.state || '');
        parts.push(String(states[V.discord_user]?.state) +
          String(states[V.discord_user]?.attributes?.game) +
          String(states[V.discord_user]?.attributes?.game_details));
        parts.push(String(states[V.discord_online]?.state) +
          String(states[V.discord_game]?.state) +
          artSig(ia.entity_picture_local || ia.entity_picture || ia.image_url || dcSt));
      }
      parts.push('pin:' + String(V.pinned_key || ''));
      const sig = parts.join('|');
      const c = window._casoraNPStore(V, 'memo');
      // Die Liste hängt auch von der Uhr ab: ein pausierter Player fällt nach der Frist heraus,
      // ohne dass sich ein Zustand ändert. Früher hielt der Memo ihn dann bis zur nächsten
      // Zustandsänderung fest (05.10.2026: beendete Player blieben stehen) – jetzt verfällt
      // der Memo zur Frist, und ein Wecker lässt die Karten genau dann neu rechnen.
      if (c.sig !== sig || (c.until && Date.now() >= c.until)) {
        c.sig = sig;
        c.list = window._casoraNPSources(states, V);
        c.until = 0;
        c.list.forEach((r) => { if (r && r.pauseUntil > 0 && (!c.until || r.pauseUntil < c.until)) c.until = r.pauseUntil; });
        if (c.until && typeof window._casoraNPArm === 'function') window._casoraNPArm(c.until);
        c.vis = null;
      }
      // Weich: auf diesem Gerät ausgeblendete Wiedergaben weglassen – für jede Ansicht gleich
      // (Welle und ihre Sichtbarkeit, Menü, Handy-Liste, Raum-Zeile).
      const H = window._casoraNPHidden;
      if (!H || !(typeof window._casoraSoft === 'function' && window._casoraSoft())) return c.list;
      const vk = H.ver();
      if (c.vis && c.visKey === vk) return c.vis;
      c.vis = H.filter(c.list, V);
      c.visKey = H.ver();
      return c.vis;
    };
    window._casoraNP._casoraCore = true;
  }

  // casora-np-hidden:start
  // Weich (05.10.2026): Wiedergaben „ausblenden“ – nur auf diesem Gerät (localStorage), je Player
  // mit dem Titel, der gerade lief. Spielt der Player etwas anderes oder endet die Wiedergabe
  // (fällt aus der Liste), gilt der Eintrag nicht mehr. Ereignis „casora-np-changed“ an window:
  // die Ansichten rechnen neu (auch, wenn eine Pausen-Frist abläuft – _casoraNPArm).
  if (typeof window._casoraNPHidden !== 'object' || !window._casoraNPHidden) {
    const KEY = 'casora.np.hidden';
    const DAY = 86400000;
    let map = null, ver = 0;
    const load = () => {
      if (map) return map;
      map = {};
      try {
        const raw = JSON.parse(window.localStorage.getItem(KEY) || '{}');
        if (raw && typeof raw === 'object') map = raw;
      } catch (e) { map = {}; }
      return map;
    };
    const save = () => {
      ver++;
      try {
        if (Object.keys(map).length) window.localStorage.setItem(KEY, JSON.stringify(map));
        else window.localStorage.removeItem(KEY);
      } catch (e) { /* privates Fenster: gilt bis zum Neuladen */ }
    };
    // Was „dieselbe Wiedergabe“ ist: Titel und Interpret.
    const what = (r) => String((r && r.title) || '').trim().toLowerCase() + '\u0001'
      + String((r && r.subtitle) || '').trim().toLowerCase();
    const ident = (r) => String((r && (r.entity || r.key)) || '');
    // Entitäten, die diese Einstellung überhaupt liefern kann: nur für die darf ein fehlender
    // Eintrag „Wiedergabe beendet“ heißen (andere Karten haben andere Player).
    const scope = (V) => {
      const s = new Set();
      if (!V) return s;
      for (let i = 1; i <= 10; i++) if (V['show_media_player_' + i] && V['media_player_' + i]) s.add(V['media_player_' + i]);
      for (let i = 1; i <= 2; i++) if (V['show_psn_' + i] && V['psn_' + i]) s.add(V['psn_' + i]);
      if (V.show_discord) [V.discord_image, V.discord_game, V.discord_user].forEach((x) => { if (x) s.add(x); });
      if (V.show_steam) [V.steam_image, V.steam_game, V.steam_account].forEach((x) => { if (x) s.add(x); });
      return s;
    };
    window._casoraNPHidden = {
      ver: () => ver,
      // list ohne Ausgeblendetes; räumt dabei Einträge ab, deren Wiedergabe vorbei ist.
      filter(list, V) {
        const m = load();
        const ids = Object.keys(m);
        if (!ids.length) return list;
        const now = Date.now();
        const inScope = scope(V);
        let dirty = false;
        const out = [];
        const seen = new Set();
        (list || []).forEach((r) => {
          const id = ident(r);
          const h = m[id];
          if (!h) { out.push(r); return; }
          seen.add(id);
          if (h.w !== what(r)) { delete m[id]; dirty = true; out.push(r); return; }
        });
        ids.forEach((id) => {
          const h = m[id];
          if (!h) return;
          if ((inScope.has(id) && !seen.has(id)) || !(now - (h.at || 0) < 7 * DAY)) { delete m[id]; dirty = true; }
        });
        if (dirty) save();
        return out;
      },
      // recs: Einträge aus _casoraNP (bei einer Gruppe alle Player der Gruppe).
      hide(recs) {
        const m = load();
        [].concat(recs || []).forEach((r) => { const id = ident(r); if (id) m[id] = { w: what(r), at: Date.now() }; });
        save();
        window._casoraNPChanged && window._casoraNPChanged('hide');
      },
      clear() { load(); map = {}; save(); window._casoraNPChanged && window._casoraNPChanged('hide'); },
      _reset() { map = null; ver++; },
    };
  }

  if (typeof window._casoraNPChanged !== 'function') {
    window._casoraNPChanged = function (why) {
      try { window.dispatchEvent(new CustomEvent('casora-np-changed', { detail: { why: why || '' } })); } catch (e) { /* egal */ }
    };
  }

  // Ein Wecker für die früheste Pausen-Frist: dann rechnen alle Wiedergabe-Ansichten neu.
  if (typeof window._casoraNPArm !== 'function') {
    const A = { at: 0, id: 0 };
    window._casoraNPArm = function (t) {
      const now = Date.now();
      if (!(t > now - 1000)) return;
      if (A.id && A.at && A.at <= t) return;
      if (A.id) clearTimeout(A.id);
      A.at = t;
      A.id = setTimeout(() => { A.id = 0; A.at = 0; window._casoraNPChanged('expire'); }, Math.max(50, t - now + 250));
    };
  }
  // casora-np-hidden:end

  // Ersatzfassungen der Handy-Vorlage abgelöst: Karten, die schon damit gerechnet haben, neu rechnen.
  if (npFallbackSeen) setTimeout(() => window._casoraNPChanged('core'), 0);



    if (typeof window._casoraNPSyncMobileRow !== 'function') {
      window._casoraNPSyncMobileRow = function (cardEl, states) {
        const root = cardEl && cardEl.getRootNode && cardEl.getRootNode();
        const rowHost = root && root.host;
        if (!rowHost || !rowHost.shadowRoot) return;
        // Cached so a later recheck can re-run without a live slot element.
        window._casoraNPMobileRowHostCache = rowHost;
        const shadow = rowHost.shadowRoot;

        const flipIds = ['media1','media2','media3','media4','media5','media6','media7','media8','media9'];
        const slotState = window._casoraNPSlotState || {};
        const settled = flipIds.map(id => slotState[id]?._npHoldSrc || null);
        const activeCount = settled.filter(Boolean).length;

        const outerRoot = rowHost.getRootNode && rowHost.getRootNode();
        const outerHost = outerRoot && outerRoot.host;
        const outerTpl  = outerHost && outerHost._config && outerHost._config.template;
        const isNpCard  = outerTpl === 'casora_mobile_now_playing'
          || (Array.isArray(outerTpl) && outerTpl.includes('casora_mobile_now_playing'));
        if (outerHost && isNpCard) {
          const shown = activeCount > 0;
          if (outerHost._npAnyActive !== shown) {
            outerHost._npAnyActive = shown;
            const ov = shown ? 'visible' : 'hidden';
            outerHost.style.setProperty('display', 'grid', 'important');
            outerHost.style.setProperty('overflow', ov, 'important');
            outerHost.style.setProperty('grid-template-rows', shown ? '1fr' : '0fr', 'important');
            outerHost.style.setProperty('grid-template-columns', 'minmax(0,1fr)', 'important');
            outerHost.style.setProperty('opacity', shown ? '1' : '0');
            outerHost.style.setProperty('pointer-events', shown ? 'auto' : 'none');
            outerHost.style.setProperty(
              'transition',
              `grid-template-rows .5s cubic-bezier(0.32,0.72,0,1), opacity ${shown ? '.35s ease .12s' : '.25s ease'}`
            );
            const aspectRatio = outerHost.shadowRoot?.getElementById('aspect-ratio');
            if (aspectRatio) aspectRatio.style.setProperty('overflow', ov, 'important');
            const haCard = outerHost.shadowRoot?.querySelector('ha-card.button-card-main');
            if (haCard) {
              haCard.style.setProperty('min-height', '0', 'important');
              haCard.style.setProperty('overflow', ov, 'important');
            }
          }
        }

        const filter = states?.['input_select.casora_mobile_filter']?.state ?? 'all';
        const inColumn = filter === 'media';
        const usesPeek = !inColumn && activeCount > 1;

        const gutters = '(max(var(--casora-measured-safe-left, 0px), var(--casora-rail-left, 16px)) + var(--casora-rail-left, 16px))';
        const activeW = usesPeek
          ? `calc(100vw - ${gutters} - var(--np-peek, 26px))`
          : `calc(100vw - ${gutters})`;
        const activeGap = usesPeek ? 'var(--np-gap, 10px)' : '0px';

        const prevPeek = rowHost._npRowUsesPeek;
        const firstRun = prevPeek === undefined;
        rowHost._npRowUsesPeek = usesPeek;

        const curKeys = flipIds.map((_, i) => settled[i]?.key || null);
        const prevKeys = rowHost._npSlotKeys || [];
        const slotKeyChanged = new Set();
        curKeys.forEach((k, i) => { if (prevKeys[i] !== k) slotKeyChanged.add(flipIds[i]); });
        rowHost._npSlotKeys = curKeys;

        if (firstRun || prevPeek === usesPeek) {
          rowHost.style.setProperty('--np-active-w', activeW);
          rowHost.style.setProperty('--np-active-gap', activeGap);
          return;
        }

        if (rowHost._npFlipPending) {
          rowHost.style.setProperty('--np-active-w', activeW);
          rowHost.style.setProperty('--np-active-gap', activeGap);
          return;
        }
        rowHost._npFlipPending = true;

        const beforeRects = {};
        for (const id of flipIds) {
          const el = shadow.getElementById(id);
          if (el) beforeRects[id] = el.getBoundingClientRect();
        }

        rowHost.style.setProperty('--np-active-w', activeW);
        rowHost.style.setProperty('--np-active-gap', activeGap);

        const reduceMotion = window.matchMedia
          && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduceMotion) { rowHost._npFlipPending = false; return; }

        requestAnimationFrame(() => {
          rowHost._npFlipPending = false;
          for (const id of flipIds) {
            if (slotKeyChanged.has(id)) continue;
            const el = shadow.getElementById(id);
            if (!el) continue;
            const before = beforeRects[id];
            if (!before || before.width < 2) continue;
            const after = el.getBoundingClientRect();
            if (after.width < 2) continue;
            if (Math.abs(before.width - after.width) < 1) continue;
            const ratio = before.width / after.width;
            el.style.transformOrigin = 'left center';
            try { el._npWidthFlip?.cancel(); } catch (e) {}
            el._npWidthFlip = el.animate(
              [{ transform: `scaleX(${ratio})` }, { transform: 'scaleX(1)' }],
              { duration: 460, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
            );
          }
        });
      };
    }

    if (!window._casoraNPResizeGuardInstalled) {
      window._casoraNPResizeGuardInstalled = true;
      window.addEventListener('resize', () => {
        const slots = window._casoraNPSlotState || {};
        for (const key of Object.keys(slots)) {
          const s = slots[key];
          try { s._npChipAnim?.cancel(); } catch (e) {}
          try { s._npShiftAnim?.cancel(); } catch (e) {}
        }
      });
    }

    if (typeof window._casoraNPMobileRecheck !== 'function') {
      window._casoraNPMobileRecheck = function (states) {
        const rowHost = window._casoraNPMobileRowHostCache;
        if (!rowHost || !rowHost.isConnected) return;
        window._casoraNPSyncMobileRow({ getRootNode: () => ({ host: rowHost }) }, states);
      };
    }

    if (typeof window._casoraNPDesktopSettle !== 'function') {
      window._casoraNPDesktopSettle = function (states, V) {
        const DEPART_HOLD_MS = 500;

        const raw = window._casoraNP(states, V);
        const rawByKey = new Map(raw.map(r => [r.key, r]));
        const rawKeys = raw.map(r => r.key);

        // Keys here are slot names (psn1, mp3), which every card shares.
        const state = window._casoraNPStore(V, 'desktop');
        state.keys = state.keys || {};

        for (const key of rawKeys) {
          const k = state.keys[key] = state.keys[key] || {};
          k.lastRecord = rawByKey.get(key);
          k.departedAt = null;
        }

        let anyPending = false;
        for (const key of Object.keys(state.keys)) {
          if (rawByKey.has(key)) continue;
          const k = state.keys[key];
          if (!k.departedAt) k.departedAt = Date.now();
          if (Date.now() - k.departedAt >= DEPART_HOLD_MS) { delete state.keys[key]; continue; }
          anyPending = true;
        }

        const departingKeys = Object.keys(state.keys).filter(k => !rawByKey.has(k));
        const orderedKeys = rawKeys.concat(departingKeys);

        for (const key of rawKeys) {
          if (rawByKey.get(key)?.state === 'paused') { anyPending = true; break; }
        }

        return { list: orderedKeys.map(k => state.keys[k].lastRecord), pending: anyPending };
      };
    }


    if (window._casoraNPOwn('_casoraNPPlan')) {
      window._casoraNPPlan = function (states, V) {
        const EXIT_MS = 480;
        // Cap on waiting for artwork before opening an arrival anyway.
        const ART_CAP = 400;
        const OPEN_MIN = 60;
        const ANCHOR = 4;
        // Per card, like every other Now Playing store.
        const S = window._casoraNPStore(V, 'plan');
        if (!S.order) Object.assign(S, {
          order: [], pos: {}, slotKeys: [], exits: [], exitSrc: {}, lastRec: {},
          changed: {}, done: {}, pending: {}, aliveN: -1, sig: null, timer: 0, gen: 0,
        });

        const live = (typeof window._casoraNPView === 'function')
          ? window._casoraNPView(states, V) : [];
        const now = Date.now();
        const liveKeys = live.map((x) => x && x.key).filter(Boolean);
        const sig = liveKeys.join(',');

        live.forEach((r) => {
          if (!r || !r.key) return;
          S.lastRec[r.key] = r;
          delete S.done[r.key];
        });

        const forceRender = () => {
          const targets = [window._casoraNPRowCard, window._casoraNPShell]
            .filter((t) => t && t.isConnected);
          for (const t of targets) {
            try {
              const h = t._hass || t.hass;
              if (h) t.hass = Object.assign({}, h);
              if (typeof t.requestUpdate === 'function') t.requestUpdate('_config', undefined);
            } catch (err) {}
          }
        };

        const alive = [];
        for (const e of S.exits) {
          if ((now - e.at) < EXIT_MS) alive.push(e);
          else S.done[e.key] = 1;
        }

        if (S.sig !== sig || alive.length !== S.aliveN) {
          S.exits = alive;
          const liveSet = {};
          liveKeys.forEach((k) => { liveSet[k] = 1; });
          const exiting = {};
          S.exits.forEach((e) => { exiting[e.key] = 1; });

          const prevOrder = S.order.slice();

          for (const k of prevOrder) {
            if (!k || liveSet[k] || exiting[k] || S.done[k]) continue;
            if (!S.lastRec[k]) continue;
            S.exits.push({ key: k, at: now });
            S.exitSrc[k] = S.lastRec[k];
            exiting[k] = 1;
          }

          // Existing sources hold their relative order; only genuinely new keys are placed.
          const order = prevOrder.filter((k) => liveSet[k] || exiting[k]);
          const fresh = [];
          for (const k of liveKeys) {
            if (order.indexOf(k) !== -1) continue;
            const rk = liveKeys.indexOf(k);
            let at = order.length;
            for (let i = 0; i < order.length; i++) {
              const oi = liveKeys.indexOf(order[i]);
              if (oi !== -1 && oi > rk) { at = i; break; }
            }
            order.splice(at, 0, k);
            fresh.push(k);
          }

          let base = ANCHOR;
          if (order.length) {
            const head = order[0];
            if (S.pos[head] !== undefined) base = S.pos[head];
            else {
              const prevHead = prevOrder.filter((k) => S.pos[k] !== undefined)[0];
              base = (prevHead !== undefined) ? (S.pos[prevHead] - 1) : ANCHOR;
            }
          }
          if (base + order.length > 9) base = 9 - order.length;
          if (base < 0) base = 0;

          const next = new Array(9).fill(null);
          const pos = {};
          order.forEach((k, i) => {
            const idx = base + i;
            if (idx >= 0 && idx < 9) { next[idx] = k; pos[k] = idx; }
          });

          const changed = {};
          for (let i = 0; i < 9; i++) {
            if ((S.slotKeys[i] || null) !== (next[i] || null)) changed['media' + (i + 1)] = true;
          }

          for (const k of Object.keys(S.exitSrc)) if (!exiting[k]) delete S.exitSrc[k];
          for (const k of Object.keys(S.pending)) if (!liveSet[k]) delete S.pending[k];

          const rowWasEmpty = !prevOrder.length;
          for (const k of fresh) {
            if (rowWasEmpty) continue;
            S.pending[k] = 1;
            const rec = S.lastRec[k];
            const art = rec && rec.art;
            let fired = false;
            const open = () => {
              if (fired) return;
              fired = true;
              setTimeout(() => {
                if (!S.pending[k]) return;
                delete S.pending[k];
                forceRender();
              }, OPEN_MIN);
            };
            if (art) {
              try {
                const img = new Image();
                img.decoding = 'async';
                img.src = art;
                if (img.decode) img.decode().then(open).catch(open);
                else { img.onload = open; img.onerror = open; }
              } catch (err) { open(); }
              setTimeout(open, ART_CAP);
            } else {
              open();
            }
          }

          S.order = order;
          S.pos = pos;
          S.slotKeys = next;
          S.changed = changed;
          S.sig = sig;
          S.aliveN = S.exits.length;
          S.gen = (S.gen || 0) + 1;

          try { clearTimeout(S.timer); } catch (err) {}
          if (S.exits.length) {
            const due = Math.min.apply(null, S.exits.map((e) => e.at + EXIT_MS));
            const delay = Math.max(30, (due - Date.now()) + 40);
            if (window._casoraNPDebug === true) {
              console.log('%c[NP release scheduled]', 'color:#fa0', delay + 'ms');
            }
            S.timer = setTimeout(() => {
              forceRender();
              if (window._casoraNPDebug === true) {
                console.log('%c[NP release fired]', 'color:#fa0');
              }
            }, delay);
          }
        }

        const byKey = {};
        live.forEach((r) => { if (r && r.key) byKey[r.key] = r; });
        return S.slotKeys.map((k) => (k ? (byKey[k] || S.exitSrc[k] || null) : null));
      };
      window._casoraNPPlan._casoraCore = true;
    }


})();

// ── Mobile wallpaper ─────────────────────────────────────────────────────────
(function () {
  const MOBILE_MQ = window.matchMedia('(max-width: 767px), (max-height: 500px)');
  const MOBILE_RE = /^\/[^/]*[-_]mobile(\/|$)/i;
  const WALLPAPER_JS = 3;
  if ((window.__casoraWallpaperJs || 0) >= WALLPAPER_JS) return;
  window.__casoraWallpaperJs = WALLPAPER_JS;
  try {
    document.documentElement.style.setProperty(
      '--casora-wallpaper-js', String(WALLPAPER_JS));
  } catch (e) {}

  // Phone landscape needs its own query: MOBILE_MQ matches 393x852 and 852x393 alike.
  const LANDSCAPE_MQ = window.matchMedia('(orientation: landscape) and (max-height: 500px)');

  // ── Background injection ─────────────────────────────────────────────────────

  const SAFE = 'env(safe-area-inset-top, 0px)';
  const off = (v) => `calc(${v} + ${SAFE})`;

  const BG = {
    image:
      'linear-gradient(to bottom,'
      + ' var(--casora-mobile-hero-tint-top, rgba(170,170,170,0.30)) 0%,'
      + ' var(--casora-mobile-hero-tint-bot, rgba(170,170,170,0.12))'
      + ` ${off('var(--casora-mobile-hero-wash-mid, 34%)')},`
      + ` transparent ${off('var(--casora-mobile-hero-wash-end, 70%)')}),`
      // Same order as the card's ::before, or the two meshes disagree.
      + ' radial-gradient('
      + ' var(--casora-mobile-hero-mesh-a-size, 120% 46%) at'
      + ' var(--casora-mobile-hero-mesh-a-pos, 18% 58%),'
      + ' var(--casora-mobile-hero-mesh-a, transparent) 0%,'
      + ' transparent 72%),'
      + ' radial-gradient('
      + ' var(--casora-mobile-hero-mesh-b-size, 130% 50%) at'
      + ' var(--casora-mobile-hero-mesh-b-pos, 88% 92%),'
      + ' var(--casora-mobile-hero-mesh-b, transparent) 0%,'
      + ' transparent 70%),'
      + ' linear-gradient(var(--casora-mobile-hero-angle, 190deg),'
      + ` transparent ${off('var(--casora-mobile-hero-fade-start, 0%)')},`
      + ' var(--casora-mobile-hero-c-handoff, #967f67)'
      + ` ${off('var(--casora-mobile-hero-p-handoff, 33%)')},`
      + ' var(--casora-mobile-hero-c-upper, #7e6d59)'
      + ` ${off('var(--casora-mobile-hero-p-upper, 43%)')},`
      + ' var(--casora-mobile-hero-c-mid, #685a4b)'
      + ` ${off('var(--casora-mobile-hero-p-mid, 63%)')},`
      + ' var(--casora-mobile-hero-c-lower, #51473d)'
      + ` ${off('var(--casora-mobile-hero-p-lower, 83%)')},`
      + ' var(--casora-mobile-hero-c-base, #3b352e)'
      + ` ${off('var(--casora-mobile-hero-p-base, 100%)')}),`
      + ' var(--casora-mobile-hero-img, url("/casora_assets/rooms/home-demo.jpg"))',
    sizePortrait: '100% 100%, 100% 100%, 100% 100%, 100% 100%, auto '
      + off('var(--casora-mobile-hero-height, 36.5%)'),
    sizeLandscape: '100% 100%, 100% 100%, 100% 100%, 100% 100%, 100% auto',
    position: '0 0, 0 0, 0 0, 0 0, '
      + 'var(--casora-mobile-hero-x, 50%) var(--casora-mobile-hero-y, 0%)',
    color: 'var(--casora-mobile-hero-floor, #3b352e)',
  };

  // casora-local-patch: Foto-Höhe in echten Pixeln (sichtbarer Viewport), nicht CSS-% –
  // % auf <html> bezieht sich auf die ganze scrollbare Seite, das Foto wirkt dann zu kurz.
  function sizePortraitPx() {
    const raw = parseFloat(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--casora-mobile-hero-height'));
    const frac = Number.isFinite(raw) ? raw / 100 : 0.365;
    const vh = (window.visualViewport && window.visualViewport.height)
      || window.innerHeight;
    const px = Math.round(vh * frac);
    return '100% 100%, 100% 100%, 100% 100%, 100% 100%, auto '
      + `calc(${px}px + ${SAFE})`;
  }

  function applyHtmlBackground() {
    if (!MOBILE_MQ.matches) return;
    const h = document.documentElement;
    if (!MOBILE_RE.test(window.location.pathname)) {
      h.style.backgroundImage = 'none';
      h.style.backgroundColor = 'var(--primary-background-color, #0d1117)';
      return;
    }
    h.style.backgroundImage    = BG.image;
    h.style.backgroundSize     = LANDSCAPE_MQ.matches ? BG.sizeLandscape : sizePortraitPx(); // casora-local-patch
    h.style.backgroundPosition = BG.position;
    h.style.backgroundRepeat   = 'no-repeat';
    h.style.backgroundColor    = BG.color;
  }

  // ── Gradient sampling ────────────────────────────────────────────────────────
  const SAMPLE_KEYS = ['handoff', 'upper', 'mid', 'lower', 'base'];
  // VERSIONED: bump this whenever paletteFrom's shape changes, or a cached palette wins forever.
  const CACHE_PREFIX = 'casora-hero-sample:v2:';
  const CACHE_ROOT = 'casora-hero-sample:';

  const CACHE_FIELDS = SAMPLE_KEYS.concat(['meshA', 'meshB']);

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_ROOT) && !k.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}

  const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const hex = (c) => '#' + c.map((v) => clamp8(v).toString(16).padStart(2, '0')).join('');
  const mute = (c, k) => { const l = lum(c); return c.map((v) => v + (l - v) * k); };
  const atLum = (c, target) => { const l = lum(c) || 1; return c.map((v) => v * target / l); };
  const warmth = (c) => c[0] - c[2];

  function readVarUrl(name) {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    const m = raw && raw.match(/url\(\s*['"]?([^'")]+)['"]?\s*\)/);
    return m ? m[1] : null;
  }

  function handoffRow() {
    const cs = getComputedStyle(document.documentElement);
    const pct = (name, dflt) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(v) ? v / 100 : dflt;
    };
    const photoFrac = pct('--casora-mobile-hero-height', 0.31);
    const pHandoff = pct('--casora-mobile-hero-p-handoff', 0.30);
    if (!Number.isFinite(photoFrac) || photoFrac <= 0) return 0.85;
    return Math.max(0.05, Math.min(1, pHandoff / photoFrac));
  }

  function paletteFrom(img, slot) {
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!iw || !ih) return null;
    const w = 64, h = Math.max(8, Math.round(w * ih / iw));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    let data;
    try { data = ctx.getImageData(0, 0, w, h).data; } catch (e) { return null; }

    const band = (y0, y1) => {
      const a = Math.max(0, Math.floor(y0 * h));
      const b = Math.min(h, Math.max(a + 1, Math.ceil(y1 * h)));
      let r = 0, g = 0, bl = 0, n = 0;
      for (let y = a; y < b; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          r += data[i]; g += data[i + 1]; bl += data[i + 2]; n++;
        }
      }
      return n ? [r / n, g / n, bl / n] : [128, 128, 128];
    };

    const row = Math.min(handoffRow(), 0.92);
    const handoff = band(row - 0.06, row + 0.02);
    // The subject: the house fills the middle of a home photo.
    const body = band(0.30, 0.75);

    const cs = getComputedStyle(document.documentElement);
    const num = (name, dflt) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return Number.isFinite(v) ? v : dflt;
    };
    const lift = num('--casora-mobile-hero-sample-lift', 0.86);
    const depth = num('--casora-mobile-hero-sample-depth-' + slot, slot === 'night' ? 0.47 : 0.60);
    const muteTop = num('--casora-mobile-hero-sample-mute-top', 0.41);
    const muteBase = num('--casora-mobile-hero-sample-mute-base', 0.63);

    const anchor = (slot === 'night')
      ? (warmth(handoff) <= warmth(body) ? handoff : body)
      : (warmth(body) >= warmth(handoff) ? body : handoff);

    const lStart = lift * (lum(handoff) + lum(body)) / 2;
    const lEnd = Math.max(16, lStart * depth);

    let meshOut = null;

    // ── Mesh fields ──────────────────────────────────────────────────────
    const cell = (x0, x1, y0, y1) => {
      const a = Math.max(0, Math.floor(y0 * h)), b = Math.min(h, Math.ceil(y1 * h));
      const c = Math.max(0, Math.floor(x0 * w)), d = Math.min(w, Math.ceil(x1 * w));
      let r = 0, g = 0, bl = 0, n = 0;
      for (let y = a; y < b; y++) {
        for (let x = c; x < d; x++) {
          const i = (y * w + x) * 4;
          r += data[i]; g += data[i + 1]; bl += data[i + 2]; n++;
        }
      }
      return n ? [r / n, g / n, bl / n] : null;
    };
    const mTop = num('--casora-mobile-hero-mesh-sample-top', 55) / 100;
    const mBot = num('--casora-mobile-hero-mesh-sample-bottom', 94) / 100;
    const ROWS = 3, COLS = 6;
    const span = Math.max(0.01, (mBot - mTop) / ROWS);
    const cells = [];
    for (let gy = 0; gy < ROWS; gy++) {
      for (let gx = 0; gx < COLS; gx++) {
        const c = cell(gx / COLS, (gx + 1) / COLS, mTop + gy * span, mTop + (gy + 1) * span);
        if (c) cells.push(c);
      }
    }
    if (cells.length >= 2) {
      cells.sort((p, q) => warmth(p) - warmth(q));
      const half = Math.max(1, Math.floor(cells.length / 2));
      const meanOf = (arr) => [0, 1, 2].map((i) =>
        arr.reduce((t, c) => t + c[i], 0) / arr.length);
      const cooler = meanOf(cells.slice(0, half));
      const warmer = meanOf(cells.slice(-half));

      const lMesh = lum(body) * num('--casora-mobile-hero-mesh-lum', 0.95);
      const kMesh = num('--casora-mobile-hero-mesh-mute', 0.45);
      const aA = num('--casora-mobile-hero-mesh-a-alpha-' + slot, 0.46);
      const aB = num('--casora-mobile-hero-mesh-b-alpha-' + slot, 0.42);
      const asRgba = (c, alpha) => {
        const v = mute(atLum(c, lMesh), kMesh).map(clamp8);
        return `rgba(${v[0]},${v[1]},${v[2]},${alpha})`;
      };
      meshOut = { a: asRgba(warmer, aA), b: asRgba(cooler, aB) };
    }

    const pal = {};
    if (meshOut) { pal.meshA = meshOut.a; pal.meshB = meshOut.b; }
    SAMPLE_KEYS.forEach((k, i) => {
      const t = i / (SAMPLE_KEYS.length - 1);
      pal[k] = hex(mute(atLum(anchor, lStart + (lEnd - lStart) * t),
                        muteTop + (muteBase - muteTop) * t));
    });
    return pal;
  }

  function publish(slot, pal) {
    if (!pal) return;
    const h = document.documentElement;
    SAMPLE_KEYS.forEach((k) => h.style.setProperty(`--casora-sampled-${slot}-${k}`, pal[k]));
    if (pal.meshA) h.style.setProperty(`--casora-sampled-${slot}-mesh-a`, pal.meshA);
    if (pal.meshB) h.style.setProperty(`--casora-sampled-${slot}-mesh-b`, pal.meshB);
  }

  function sampleInto(slot, url) {
    if (!url) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const key = `${CACHE_PREFIX}${url}|${slot}|${handoffRow().toFixed(2)}`;
      let pal = null;
      try {
        const hit = JSON.parse(localStorage.getItem(key) || 'null');
        if (hit && CACHE_FIELDS.every((f) => typeof hit[f] === 'string')) pal = hit;
      } catch (e) {}
      if (!pal) {
        pal = paletteFrom(img, slot);
        try { if (pal) localStorage.setItem(key, JSON.stringify(pal)); } catch (e) {}
      }
      publish(slot, pal);
    };
    img.onerror = () => {};
    img.src = url;
  }

  let _sampledFor = null;
  function sampleWallpapers(attempt) {
    if (!MOBILE_MQ.matches) return;
    const day = readVarUrl('--casora-mobile-hero-img-day');
    const night = readVarUrl('--casora-mobile-hero-img-night');
    if (!day && !night) {
      if ((attempt || 0) < 20) setTimeout(() => sampleWallpapers((attempt || 0) + 1), 250);
      return;
    }
    const sig = `${day}|${night}|${handoffRow().toFixed(2)}`;
    if (sig === _sampledFor) return;
    _sampledFor = sig;
    sampleInto('day', day);
    sampleInto('night', night);
  }

  // ── Boot ─────────────────────────────────────────────────────────────────────
  function init() {
    applyHtmlBackground();
    sampleWallpapers();
  }

  function waitForHA() {
    if (document.querySelector('home-assistant')) {
      init();
    } else {
      requestAnimationFrame(waitForHA);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForHA);
  } else {
    waitForHA();
  }

  // casora_mobile_bg setzt das Foto der Übersicht (image/image_night) über das Theme-Bild:
  // dann neu zeichnen und die Verlaufsfarben aus dem neuen Foto ziehen.
  window.casoraWallpaperRefresh = () => { applyHtmlBackground(); sampleWallpapers(); };

  window.addEventListener('location-changed', () => setTimeout(applyHtmlBackground, 50), true);
  window.addEventListener('popstate', () => setTimeout(applyHtmlBackground, 50), true);
  MOBILE_MQ.addEventListener('change', () => { applyHtmlBackground(); sampleWallpapers(); });
  window.addEventListener('orientationchange', () => setTimeout(() => {
    applyHtmlBackground();
    sampleWallpapers();
  }, 120));
  LANDSCAPE_MQ.addEventListener('change', applyHtmlBackground);
  // The wallpaper is keyed on dark mode, so repaint when the OS flips it.
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', applyHtmlBackground);
})();


// ── Navigation ───────────────────────────────────────────────────────────────
(function () {
  if (customElements.get('casora-nav')) return;

  const CHEVRON =
    "data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%2024%2024'%3E" +
    "%3Cpath%20d%3D'M8.59%2C16.58L13.17%2C12L8.59%2C7.41L10%2C6L16%2C12L10%2C18L8.59%2C16.58Z'%2F%3E%3C%2Fsvg%3E";

  const MENU_CSS = `
    .casora-nav-menu > button { background: transparent; transition: background .12s ease; }
    .casora-nav-menu > button:hover { background: var(--casora-menu-hover, rgba(255,255,255,0.14)); }
    @media (prefers-reduced-motion: reduce) {
      .casora-nav-menu > button { transition: none; }
    }
  `;

  function ensureMenuCss() {
    if (document.getElementById('casora-nav-menu-css')) return;
    const el = document.createElement('style');
    el.id = 'casora-nav-menu-css';
    el.textContent = MENU_CSS;
    document.head.appendChild(el);
  }

  const tplCache = new Map();

  function isTpl(v) {
    return typeof v === 'string' && v.trim().slice(0, 3) === '[[[';
  }

  function compile(src) {
    if (tplCache.has(src)) return tplCache.get(src);
    let fn = null;
    try {
      const body = String(src).trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, '');
      fn = new Function('hass', 'states', 'entity', 'variables', body);
    } catch (_) {}
    tplCache.set(src, fn);
    return fn;
  }

  function evalTpl(src, hass, fallback) {
    const fn = compile(src);
    if (!fn) return fallback;
    try {
      const r = fn(hass, hass && hass.states, null, {});
      return r === undefined ? fallback : r;
    } catch (_) {
      return fallback;
    }
  }

  function resolve(v, hass, fallback) {
    return isTpl(v) ? evalTpl(v, hass, fallback) : (v === undefined ? fallback : v);
  }

  function normalize(p) {
    return String(p || '').replace(/\/+$/, '') || '/';
  }

  function navigate(url) {
    if (!url) return;
    if (normalize(url) === normalize(location.pathname)) return;
    history.pushState(null, '', url);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
  }

  function fire(node, type, detail) {
    node.dispatchEvent(new CustomEvent(type, {
      detail: detail, bubbles: true, composed: true,
    }));
  }

  // Eingabeart für Fokus-Zeichen (D-09): Tab/Pfeile = Tastatur, Maus/Finger setzt zurück.
  if (!window._casoraKbdWatch) {
    window._casoraKbdWatch = true;
    window.addEventListener('keydown', (ev) => { if (/^(Tab|Arrow)/.test(ev.key || '')) window._casoraKbd = true; }, true);
    window.addEventListener('pointerdown', () => { window._casoraKbd = false; }, true);
  }

  class CasoraNavBar extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._hass    = null;
      this._config  = null;
      this._routes  = [];
      this._els     = [];
      this._built   = false;
      this._path    = normalize(location.pathname);
      this._menu    = null;
      this._onRoute  = () => this._syncRoute();
      this._onResize = () => { this._syncHeaderOffset(); this._placeIndicator(true); };
    }

    static getStubConfig() { return { variant: 'desktop', routes: [] }; }

    setConfig(config) {
      if (!config || !Array.isArray(config.routes)) {
        throw new Error('casora-nav: routes array required');
      }
      this._config  = config;
      this._variant = config.variant === 'tablet' ? 'tablet' : 'desktop';
      // „Wer sieht das?“ im Studio: Räume nur für bestimmte HA-Benutzer (route.users).
      this._routes  = config.routes.filter(window.casoraSeesRoute || function () { return true; });
      this._sig     = JSON.stringify([this._variant, this._routes]);
      this._built   = false;
      this.shadowRoot.innerHTML = '';
      if (this.isConnected) this._build();
    }

    updateConfig(config) {
      if (!config || !Array.isArray(config.routes)) return;
      const sig = JSON.stringify([
        config.variant === 'tablet' ? 'tablet' : 'desktop', config.routes,
      ]);
      if (sig === this._sig) return;
      this.setConfig(config);
      if (this.isConnected && !this._built) this._build();
      this._syncRoute();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._built) return;
      this._syncBadges();
      if (this._menu) this._menu._refresh && this._menu._refresh();
    }

    get hass() { return this._hass; }

    getCardSize() { return 1; }

    connectedCallback() {
      window.addEventListener('location-changed', this._onRoute, true);
      window.addEventListener('popstate', this._onRoute, true);
      window.addEventListener('resize', this._onResize);
      if (this._config && !this._built) this._build();
      this._syncRoute();
      this._syncHeaderOffset();
      requestAnimationFrame(() => {
        if (!this.isConnected) return;
        this._syncHeaderOffset();
        this._placeIndicator();
      });
      if (document.fonts && document.fonts.ready && !CasoraNavBar._fontsReady) {
        document.fonts.ready.then(() => {
          CasoraNavBar._fontsReady = true;
          this._placeIndicator(true);
        }).catch(() => {});
      }
    }

    disconnectedCallback() {
      window.removeEventListener('location-changed', this._onRoute, true);
      window.removeEventListener('popstate', this._onRoute, true);
      window.removeEventListener('resize', this._onResize);
      this._closeMenu();
    }


    _build() {
      const root = this.shadowRoot;
      root.innerHTML = '';

      const style = document.createElement('style');
      style.textContent = this._css();
      root.appendChild(style);

      const bar = document.createElement('div');
      bar.className = 'bar';
      // The glass is a SIBLING of the routes, never their ancestor: an ancestor kills backdrop-filter.
      const glass = document.createElement('div');
      glass.className = 'glass';
      bar.appendChild(glass);
      if (this._variant === 'tablet') {
        const rim = document.createElement('div');
        rim.className = 'rim';
        bar.appendChild(rim);
      }
      const scroller = document.createElement('div');
      scroller.className = 'scroller';
      bar.appendChild(scroller);
      /* Scroll-Hinweis bei Überlänge (01.10.2026): kleiner Pfeil über dem Rand, Geschwister
         der Liste (kein Vorfahre) – beeinflusst weder Blur noch Maske. Tippen blättert weiter. */
      ['l', 'r'].forEach((side) => {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'more more-' + side;
        more.tabIndex = -1;
        more.setAttribute('aria-hidden', 'true');
        more.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const sc = this._scroller;
          if (!sc) return;
          const by = Math.max(120, sc.clientWidth * 0.6) * (side === 'r' ? 1 : -1);
          try { sc.scrollBy({ left: by, behavior: 'smooth' }); } catch (_) { sc.scrollLeft += by; }
        });
        bar.appendChild(more);
      });
      if (this._variant === 'tablet') {
        const flash = document.createElement('div');
        flash.className = 'flash';
        bar.appendChild(flash);
        bar.addEventListener('pointerdown', (ev) => this._flash(ev), true);
        this._flashEl = flash;
      }
      root.appendChild(bar);

      const indicator = document.createElement('div');
      indicator.className = 'indicator instant';
      const fill = document.createElement('div');
      fill.className = 'fill';
      indicator.appendChild(fill);
      scroller.appendChild(indicator);
      this._fill = fill;

      this._bar       = bar;
      this._scroller  = scroller;
      scroller.addEventListener('scroll', () => this._syncFade(), { passive: true });
      this._indicator = indicator;
      this._els       = [];
      if (this._revealRO) { this._revealRO.disconnect(); this._revealRO = null; }

      this._routes.forEach((route, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'route';
        btn.setAttribute('role', 'link');

        const label = document.createElement('span');
        label.className = 'label';
        // Name der Übersicht nach casoraRoomName: übersetzt nur mit route.auto (von Casora angelegt,
        // unverändert); „Home“ ohne Markierung steht wie gespeichert – wie Raumtitel und Handy-Leiste.
        const nm = window.casoraRoomName
          ? window.casoraRoomName(route.label, { casora_auto_name: route.auto, name_literal: route.literal === true }) : null;
        const lit = nm ? nm.literal : !!route.literal;
        if (lit) label.setAttribute('data-no-i18n', '');
        label.textContent = nm && nm.auto ? nm.text
          : (window.casoraTr && !lit ? window.casoraTr(route.label || '') : (route.label || ''));
        btn.appendChild(label);

        const badge = document.createElement('span');
        badge.className = 'badge';
        btn.appendChild(badge);

        if (this._isMenuRoute(route)) btn.setAttribute('data-has-popup', '');

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this._activate(route, btn);
        });

        // D-09: mit der Tastatur angesprungenen Raum in Sicht holen (stand sonst außerhalb der Leiste).
        // Fokus-Zeichen nur bei echter Tastatur (Tab/Pfeile, window._casoraKbd) – nach Klick oder Tippen
        // nie, auch nicht, wenn danach eine Taste gedrückt wird (Chrome zeigt :focus-visible dann trotzdem).
        btn.addEventListener('focus', () => {
          const kb = !!window._casoraKbd;
          btn.classList.toggle('kbd', kb);
          if (kb) btn.scrollIntoView({ inline: 'nearest', block: 'nearest' });
        });
        btn.addEventListener('blur', () => btn.classList.remove('kbd'));

        scroller.appendChild(btn);
        this._els.push({ btn: btn, label: label, badge: badge, route: route });
      });

      this._built = true;
      this._syncRoute();
      this._syncBadges();
    }

    _isMenuRoute(route) {
      if (route.menu) return true;
      const ta = route.tap_action;
      return !!(ta && ta.action === 'open-popup');
    }

    _activate(route, btn) {
      if (this._isMenuRoute(route)) {
        if (this._menu && this._menu._owner === btn) { this._closeMenu(); return; }
        this._closeMenu();
        this._openMenu(route, btn);
        return;
      }
      const ta = route.tap_action;
      const to = route.url || (ta && ta.action === 'navigate' && ta.navigation_path) || null;
      if (!to) return;
      if (this._variant !== 'tablet') { navigate(to); return; }
      const idx = this._els.findIndex((el) => el.btn === btn);
      if (idx >= 0 && idx !== this._activeIdx) {
        this._els.forEach((el, i) => el.btn.classList.toggle('active', i === idx));
        this._activeIdx = idx;
        this._placeIndicator();
      }
      requestAnimationFrame(() => requestAnimationFrame(() => navigate(to)));
    }

    // The phone capsule's tap: light blooms from the thumb, rises fast and leaves slowly.
    _flash(ev) {
      const f = this._flashEl;
      if (!f || !this._bar || !f.animate) return;
      const r = this._bar.getBoundingClientRect();
      const x = r.width ? Math.max(0, Math.min(100, ((ev.clientX - r.left) / r.width) * 100)) : 50;
      f.style.background = 'radial-gradient(90px circle at ' + x.toFixed(1) + '% 50%,'
        + ' rgba(255,255,255,0.30) 0%, rgba(255,255,255,0.12) 55%, rgba(255,255,255,0) 100%)';
      f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25, easing: 'cubic-bezier(0.4,0,0.6,1)' }, { opacity: 0 }],
        { duration: 560, easing: 'ease-out' });
    }

    _syncRoute() {
      if (!this._built) return;
      const path = normalize(location.pathname);
      this._path = path;

      let bestIdx = -1;
      let bestLen = -1;
      this._els.forEach((el, i) => {
        const u = el.route.url ? normalize(el.route.url) : null;
        if (!u) return;
        if (path === u || path.indexOf(u + '/') === 0) {
          if (u.length > bestLen) { bestLen = u.length; bestIdx = i; }
        }
      });

      this._els.forEach((el, i) => {
        el.btn.classList.toggle('active', i === bestIdx);
      });

      this._activeIdx = bestIdx;
      this._syncHeaderOffset();
      this._placeIndicator();
    }

    _syncHeaderOffset() {
      let view = null;
      // The bar lives in ha-app-layout, inside hui-root's shadow root.
      try {
        const near = this.getRootNode();
        if (near && near.querySelector) {
          view = near.querySelector('hui-view, hui-view-container');
        }
      } catch (_) {}

      const walk = (root, depth) => {
        if (!root || depth > 12 || view || !root.querySelectorAll) return;
        const hit = root.querySelector('hui-view, hui-view-container');
        if (hit) { view = hit; return; }
        root.querySelectorAll('*').forEach((el) => {
          if (!view && el.shadowRoot) walk(el.shadowRoot, depth + 1);
        });
      };
      if (!view) { try { walk(document, 0); } catch (_) {} }
      /* Seitlich verschobene Seite (30.09.2026): hui-view ist overflow-x:hidden und lässt sich
         trotzdem per Skript/Fokus seitwärts scrollen, wenn eine aufgeklappte Badge-Zeile breiter
         ist – dann stand die ganze Seite links versetzt. Eine Ansicht scrollt nie seitwärts. */
      [view, view && view.querySelector && view.querySelector('hui-view'), view && view.closest && view.closest('hui-view-container')].forEach((v) => {
        if (!v || v._casoraNoSideScroll) return;
        v._casoraNoSideScroll = true;
        v.addEventListener('scroll', () => { if (v.scrollLeft) v.scrollLeft = 0; }, { passive: true });
      });

      let px = 0;
      if (view) {
        const t = view.getBoundingClientRect().top;
        if (isFinite(t) && t > 0 && t < 240) px = Math.round(t);
      }
      if (px !== this._headerPx) {
        this._headerPx = px;
        this.style.setProperty('--casora-nav-header-offset', px + 'px');
        this._placeIndicator(true);
      }
    }

    _labelBox(idx) {
      const el = this._els[idx];
      const sc = this._scroller;
      if (!el || !sc) return null;
      const sRect = sc.getBoundingClientRect();
      const lRect = el.label.getBoundingClientRect();
      if (!lRect.width || !sRect.width) return null;
      return { left: lRect.left - sRect.left + sc.scrollLeft, width: lRect.width };
    }

    _placeIndicator(instant) {
      const ind  = this._indicator;
      const fill = this._fill;
      if (!ind || !fill || !this._scroller) return;

      if (this._activeIdx < 0 || !this._els[this._activeIdx]) {
        ind.classList.remove('on');
        return;
      }

      const to = this._labelBox(this._activeIdx);
      if (!to) return;
      this._revealActive(to, instant);

      const from = this._from;
      if (!instant && from && from.left === to.left && from.width === to.width
          && ind.classList.contains('on')) return;

      ind.classList.remove('to-right', 'to-left');

      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // No travel on any surface. The underline has nothing to move alongside:
      // the tap replaces the whole view, so a journey competing with that
      // rebuild lands late however it is eased. It leaves one name and arrives
      // under the other instead, which is what a sidebar selection does.
      if (!instant && from && ind.classList.contains('on') && ind.animate && !still) {
        const ghost = ind.cloneNode(true);
        ghost.classList.add('instant');
        ghost.classList.remove('on');
        ghost.style.opacity = '1';
        this._scroller.insertBefore(ghost, ind);
        const gone = () => ghost.remove();
        ghost.animate([{ opacity: 1 }, { opacity: 0 }],
          { duration: 110, easing: 'ease-out', fill: 'forwards' }).finished.then(gone, gone);
        ind.classList.add('instant');
        ind.style.width = to.width + 'px';
        ind.style.transform = 'translateX(' + to.left + 'px)';
        fill.style.transform = 'scaleX(1)';
        void ind.offsetWidth;
        ind.classList.remove('instant');
        // A whisper of width on the way in, so it reads as arriving rather than
        // being switched on. Anchored center: from the left edge it looks like
        // a short slide, which is the thing being removed.
        ind.animate(
          [{ opacity: 0, transform: ind.style.transform + ' scaleX(0.88)' },
           { opacity: 1, transform: ind.style.transform + ' scaleX(1)' }],
          { duration: 150, easing: 'cubic-bezier(0.2,0.8,0.2,1)' });
        this._from = to;
        return;
      }

      ind.style.width = to.width + 'px';

      if (instant || !from) {
        ind.classList.add('instant');
        ind.style.transform  = 'translateX(' + to.left + 'px)';
        fill.style.transform = 'scaleX(1)';
        ind.classList.add('on');
        void ind.offsetWidth;
        ind.classList.remove('instant');
      } else {
        ind.classList.add('instant');
        ind.style.transform  = 'translateX(' + from.left + 'px)';
        fill.style.transform = 'scaleX(' + (from.width / to.width) + ')';
        ind.classList.add('on');
        void ind.offsetWidth;
        ind.classList.remove('instant');

        if (to.left !== from.left) {
          ind.classList.add(to.left > from.left ? 'to-right' : 'to-left');
        }
        ind.style.transform  = 'translateX(' + to.left + 'px)';
        fill.style.transform = 'scaleX(1)';
      }

      this._from = to;
    }

    // Zu viele Räume für die Leiste: den aktiven Raum in die Mitte holen (einmal je
    // Wechsel, damit Wischen von Hand nicht zurückspringt) und die Ränder ausblenden.
    _revealActive(to, instant) {
      const sc = this._scroller;
      if (!sc) return;
      // Die Namen werden erst nach Schrift/Aufbau endgültig breit – dann neu ausrichten.
      if (!this._revealRO && window.ResizeObserver) {
        this._revealRO = new ResizeObserver(() => { if (this.isConnected) this._placeIndicator(true); });
        this._revealRO.observe(sc);
        this._els.forEach((el) => this._revealRO.observe(el.label));
      }
      const over = sc.scrollWidth - sc.clientWidth > 2;
      const key = this._activeIdx + '|' + sc.scrollWidth + '|' + sc.clientWidth + '|' + Math.round(to.left) + '|' + Math.round(to.width);
      if (over && this._revealKey !== key) {
        this._revealKey = key;
        const left = Math.max(0, Math.min(sc.scrollWidth - sc.clientWidth, to.left + to.width / 2 - sc.clientWidth / 2));
        const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        try { sc.scrollTo({ left, behavior: instant || still || !this._revealedOnce ? 'auto' : 'smooth' }); } catch (_) { sc.scrollLeft = left; }
        this._revealedOnce = true;
      }
      this._syncFade();
    }

    _syncFade() {
      const sc = this._scroller;
      if (!sc) return;
      const max = sc.scrollWidth - sc.clientWidth;
      sc.classList.toggle('fade-l', max > 2 && sc.scrollLeft > 2);
      sc.classList.toggle('fade-r', max > 2 && sc.scrollLeft < max - 2);
      if (this._bar) {
        this._bar.classList.toggle('more-l-on', max > 2 && sc.scrollLeft > 2);
        this._bar.classList.toggle('more-r-on', max > 2 && sc.scrollLeft < max - 2);
      }
      // D-14 (Weich, --casora-nav-fade-clear-l gesetzt): die linke Kante sitzt am Anfang des ersten
      // ganz sichtbaren Raums – auch am Ende der Leiste, wo das Einrasten nicht mehr greift (sonst „r“ von „Flur“).
      let edge = 0;
      try { edge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--casora-nav-fade-clear-l')) || 0; } catch (e) { edge = 0; }
      if (edge > 0 && this._els) {
        const x0 = sc.getBoundingClientRect().left;
        const first = this._els.map((el) => el.btn.getBoundingClientRect().left - x0).filter((x) => x >= edge - 1)[0];
        const at = first != null && sc.scrollLeft > 2 ? Math.max(edge, Math.round(first)) : null;
        if (at != null) { sc.style.setProperty('--casora-nav-fade-clear-l', at + 'px'); sc.style.setProperty('--casora-nav-fade-solid-l', (at + 1) + 'px'); }
        else { sc.style.removeProperty('--casora-nav-fade-clear-l'); sc.style.removeProperty('--casora-nav-fade-solid-l'); }
      }
    }

    _syncBadges() {
      const hass = this._hass;
      this._els.forEach((el) => {
        const cfg = el.route.badge;
        let show = false;
        if (cfg && hass) show = !!resolve(cfg.show, hass, false);
        el.badge.style.display = show ? 'block' : 'none';
        if (show && cfg.color) el.badge.style.background = cfg.color;
      });
    }

    // ── Scenes menu ──────────────────────────────────────────────────────────
    _menuItems(route) {
      const hass = this._hass;
      const SC = window._casoraSC;

      if (route.menu === 'scenes' || !route.popup) {
        if (SC && SC.list) {
          const ids = SC.list(hass.states, hass, this._config || {});
          if (SC.noteColors) SC.noteColors((this._config || {}).scene_colors);
          if (SC.prefetch) { try { SC.prefetch(ids, hass.states); } catch (_) {} }
          return ids.map((id) => ({
            id: id,
            label: (hass.states[id].attributes || {}).friendly_name
              || id.replace('scene.', '').replace(/_/g, ' '),
            icon: window.casoraFilledIcon((hass.states[id].attributes || {}).icon || 'mdi:layers'),
            active: SC.isActive ? !!SC.isActive(id, hass.states) : false,
            // Studio-Farbe der Szene fürs Symbol (B-SZENE); Weich färbt Menüsymbole über --casora-mi-tone.
            color: window.casoraSceneColor ? window.casoraSceneColor(id) : null,
            run: () => SC.apply(id, this._transition()),
          }));
        }
        return this._sceneFallback();
      }

      const items = evalTpl(route.popup, hass, []) || [];
      return items.map((it) => ({
        id: it.entity || null,
        label: it.label || '',
        icon: it.icon || 'mdi:layers',
        active: false,
        run: () => {
          const ta = it.tap_action || {};
          if (ta.action === 'call-service' || ta.action === 'perform-action') {
            const svc = String(ta.service || ta.perform_action || '');
            const dot = svc.indexOf('.');
            if (dot > 0) {
              hass.callService(svc.slice(0, dot), svc.slice(dot + 1),
                ta.service_data || ta.data || {});
            }
          } else if (ta.action === 'navigate' && ta.navigation_path) {
            navigate(ta.navigation_path);
          }
        },
      }));
    }

    _transition() {
      const t = (this._config || {}).scene_transition;
      return t === undefined ? 3 : t;
    }

    _sceneFallback() {
      const hass = this._hass;
      const states = hass.states || {};
      const reg = hass.entities || {};
      const getReg = (id) => reg[id] || (reg.get && reg.get(id)) || null;
      return Object.keys(states)
        .filter((id) => id.indexOf('scene.') === 0 && id.indexOf('scene.casora') !== 0)
        .filter((id) => {
          const e = getReg(id);
          return e && !(e.hidden || e.hidden_by || e.disabled || e.disabled_by);
        })
        .map((id) => ({
          id: id,
          label: (states[id].attributes || {}).friendly_name
            || id.replace('scene.', '').replace(/_/g, ' '),
          icon: (states[id].attributes || {}).icon || 'mdi:layers',
          active: false,
          run: () => hass.callService('scene', 'turn_on',
            { entity_id: id, transition: this._transition() }),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    _openMenu(route, btn) {
      const hass = this._hass;
      if (!hass) return;

      const menu = document.createElement('div');
      menu.className = 'casora-nav-menu';
      menu._owner = btn;
      Object.assign(menu.style, {
        position: 'fixed', zIndex: '99999', boxSizing: 'border-box',
        padding: '6px',
        maxHeight: 'calc(100vh - 140px)', overflowY: 'auto', overflowX: 'hidden',
        width: 'max-content', maxWidth: 'calc(100vw - 24px)',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', rowGap: '2px',
        scrollbarWidth: 'none',
      });
      window.casoraMenuGlass.apply(menu);

      const build = () => {
        const items = this._menuItems(route);
        const sig = items.map((i) => [i.id, i.label, i.icon, i.active, i.color || ''].join('\u0001')).join('\u0002');
        if (sig === menu._sig) return;
        menu._sig = sig;
        menu.textContent = '';
        items.forEach((it) => {
          const row = document.createElement('button');
          row.type = 'button';
          row.setAttribute('role', 'menuitem');
          Object.assign(row.style, {
            display: 'grid', gridTemplateColumns: 'var(--casora-menu-ic-col, 20px) 1fr', alignItems: 'center',
            justifyItems: 'start', columnGap: 'var(--casora-menu-ic-gap, 15px)', width: '100%',
            minHeight: 'var(--casora-menu-row-h, 46px)', padding: 'var(--casora-menu-row-pad, 0 16px 0 13px)',
            borderRadius: 'var(--casora-menu-item-radius, calc(var(--casora-menu-radius, 28px) - 6px))',
            border: '0', textAlign: 'left',
            font: 'inherit', fontSize: 'var(--casora-popup-label-size, 15px)',
            // 600 blanks these on re-render; 500 is the heaviest safe weight.
            fontWeight: it.active ? '500' : '400',
            color: 'var(--casora-menu-fg, #fff)', opacity: it.active ? '1' : 'var(--casora-menu-item-dim, .86)',
            cursor: 'default', outline: 'none', boxSizing: 'border-box',
            // Aktive Szene hinterlegt wie im Handy-Menü (Weich: --casora-mnav-on-fill); ohne Token wie bisher.
            background: it.active ? 'var(--casora-mnav-on-fill, transparent)' : 'transparent',
          });

          const ico = document.createElement('ha-icon');
          ico.setAttribute('icon', it.icon);
          Object.assign(ico.style, {
            width: '20px', height: '20px', color: 'currentColor',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            placeSelf: 'center',
          });
          // Object.assign cannot set a custom property; it fails silently.
          ico.style.setProperty('--mdc-icon-size', '18px');

          const txt = document.createElement('span');
          txt.textContent = window.casoraTr ? window.casoraTr(it.label) : it.label;
          Object.assign(txt.style, {
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            maxWidth: '100%',
          });

          const mi = window.casoraMenuGlass.icon(ico,
            (route.menu === 'scenes' || !route.popup) ? 'light' : 'general', 'currentColor');
          if (it.color) mi.style.setProperty('--casora-mi-tone', it.color);
          row.appendChild(mi);
          row.appendChild(txt);

          row.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            try { it.run(); } catch (_) {}
            // Rückmeldung (Nutzertest 06.10.2026: Menü schloss, nichts sichtbar): die getippte Zeile kurz
            // hinterlegen, dann schließen.
            if (route.menu === 'scenes' || !route.popup) {
              row.style.background = 'var(--casora-mnav-on-fill, transparent)';
              row.style.opacity = '1';
              setTimeout(close, 350);
              return;
            }
            close();
          };
          menu.appendChild(row);
        });
      };

      ensureMenuCss();
      build();
      menu._refresh = build;
      document.body.appendChild(menu);

      const place = () => {
        const r = btn.getBoundingClientRect();
        const w = menu.offsetWidth;
        const cx = r.left + r.width / 2;
        menu.style.top = window.casoraMenuGlass.dropTop(r, 10) + 'px';
        menu.style.left = Math.round(
          Math.max(12, Math.min(cx - w / 2, window.innerWidth - w - 12))
        ) + 'px';
      };
      place();

      window.casoraMenuGlass.enter(menu);

      btn.setAttribute('data-popup-open', '');

      const onKey = (e) => { if (e.key === 'Escape') close(); };
      const onAway = (e) => {
        const t = e.composedPath ? e.composedPath()[0] : e.target;
        if (!menu.contains(t) && t !== btn && !btn.contains(t)) close();
      };
      const close = () => {
        if (menu._closing) return;
        menu._closing = true;
        btn.removeAttribute('data-popup-open');
        window.removeEventListener('keydown', onKey, true);
        document.removeEventListener('pointerdown', onAway, true);
        window.removeEventListener('resize', close);
        window.removeEventListener('location-changed', close, true);
        window.casoraMenuGlass.exit(menu, () => {
          if (menu.parentNode) menu.remove();
        });
        if (this._menu === menu) this._menu = null;
      };
      menu._close = close;

      setTimeout(() => {
        window.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', onAway, true);
        window.addEventListener('resize', close);
        window.addEventListener('location-changed', close, true);
      }, 0);

      this._menu = menu;
    }

    _closeMenu() {
      if (this._menu && this._menu._close) this._menu._close();
      this._menu = null;
    }

    _css() {
      const shared = `
        :host {
          position: fixed;
          left: 0;
          right: 0;
          height: 0;
          z-index: 50;
          display: block;
          pointer-events: none;
          text-size-adjust: 100%;
          -webkit-text-size-adjust: 100%;
        }

        .bar {
          position: relative;
          pointer-events: auto;
          box-sizing: border-box;
        }

        .glass {
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          pointer-events: none;
        }

        .scroller {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: row;
          align-items: center;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          touch-action: pan-x;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }

        .scroller::-webkit-scrollbar { height: 0; width: 0; }
        /* D-14: Weich rastet auf Raumanfänge ein (neben dem Pfeil keine Wortreste); sonst wie bisher. */
        .scroller { scroll-snap-type: var(--casora-nav-snap, none); scroll-padding-inline: var(--casora-nav-snap-pad, 0px); }
        .route { scroll-snap-align: var(--casora-nav-snap-align, none); }

        /* Überlänge: Namen laufen weich aus statt hart abgeschnitten (JS setzt die Klassen).
           01.10.2026: Verlauf breiter (72 px, vorher 48) – am Rand war kaum zu sehen, dass es
           weitergeht; dazu der Pfeil (.more) über dem Rand. Die Maske sitzt nur auf der Liste,
           die Glasfläche (.glass) ist ein Geschwister und behält ihren Blur. */
        /* Fix-Runde 1 (A-09): Breite des Verlaufs per Design (--casora-nav-fade-solid/-clear),
           Weich lässt den Text vor dem Pfeil enden statt darunter weiterlaufen. */
        .scroller.fade-r {
          -webkit-mask-image: linear-gradient(to right, black 0, black calc(100% - var(--casora-nav-fade-solid, 72px)), transparent calc(100% - var(--casora-nav-fade-clear, 8px)));
          mask-image: linear-gradient(to right, black 0, black calc(100% - var(--casora-nav-fade-solid, 72px)), transparent calc(100% - var(--casora-nav-fade-clear, 8px)));
        }
        .scroller.fade-l {
          -webkit-mask-image: linear-gradient(to right, transparent var(--casora-nav-fade-clear-l, var(--casora-nav-fade-clear, 8px)), black var(--casora-nav-fade-solid-l, var(--casora-nav-fade-solid, 72px)), black 100%);
          mask-image: linear-gradient(to right, transparent var(--casora-nav-fade-clear-l, var(--casora-nav-fade-clear, 8px)), black var(--casora-nav-fade-solid-l, var(--casora-nav-fade-solid, 72px)), black 100%);
        }
        .scroller.fade-l.fade-r {
          -webkit-mask-image: linear-gradient(to right, transparent var(--casora-nav-fade-clear-l, var(--casora-nav-fade-clear, 8px)), black var(--casora-nav-fade-solid-l, var(--casora-nav-fade-solid, 72px)), black calc(100% - var(--casora-nav-fade-solid, 72px)), transparent calc(100% - var(--casora-nav-fade-clear, 8px)));
          mask-image: linear-gradient(to right, transparent var(--casora-nav-fade-clear-l, var(--casora-nav-fade-clear, 8px)), black var(--casora-nav-fade-solid-l, var(--casora-nav-fade-solid, 72px)), black calc(100% - var(--casora-nav-fade-solid, 72px)), transparent calc(100% - var(--casora-nav-fade-clear, 8px)));
        }
        .more {
          position: absolute;
          top: 50%;
          z-index: 2;
          width: 28px;
          height: 28px;
          margin: -14px 0 0;
          padding: 0;
          border: 0;
          border-radius: 50%;
          background: var(--casora-nav-more-fill, rgba(255, 255, 255, 0.16));
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }
        .more::before {
          content: "";
          position: absolute;
          inset: 4px;
          background-color: var(--casora-nav-more-ink, rgba(255, 255, 255, 0.85));
          -webkit-mask: url("${CHEVRON}") no-repeat center / contain;
          mask: url("${CHEVRON}") no-repeat center / contain;
        }
        .more-r { right: 8px; }
        .more-l { left: 8px; }
        .more-l::before { transform: scaleX(-1); }
        .bar.more-r-on .more-r, .bar.more-l-on .more-l { opacity: 1; pointer-events: auto; }
        @media (hover: hover) { .more:hover { background: var(--casora-nav-more-hover, rgba(255, 255, 255, 0.26)); } }

        /* Placed by TRANSFORM, a compositor property: left/right are layout, and
           on tablet they also re-blur the glass pill behind it. */
        .indicator {
          position: absolute;
          left: 0;
          z-index: 0;
          opacity: 0;
          pointer-events: none;
          transform-origin: left center;
          will-change: transform;
          transition:
            transform var(--casora-nav-indicator-duration, 0.42s) var(--casora-nav-indicator-ease, cubic-bezier(0.32, 0.72, 0, 1)),
            opacity 0.2s ease;
        }

        .indicator .fill {
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          transform-origin: left center;
          will-change: transform;
          transition: transform var(--casora-nav-indicator-duration, 0.42s) var(--casora-nav-indicator-ease, cubic-bezier(0.32, 0.72, 0, 1));
        }

        .indicator.on { opacity: 1; }

        .indicator.to-right       { transition-delay: var(--casora-nav-indicator-lead, 0.07s), 0s; }
        .indicator.to-left .fill  { transition-delay: var(--casora-nav-indicator-lead, 0.07s); }

        .indicator.instant,
        .indicator.instant .fill  { transition: none; }

        @media (prefers-reduced-motion: reduce) {
          .indicator,
          .indicator .fill { transition: opacity 0.2s ease !important; }
        }

        .route {
          position: relative;
          z-index: 1;
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
          border: 0;
          background: transparent;
          box-shadow: none;
          font: inherit;
          color: inherit;
          cursor: pointer;
          overflow: visible;
          -webkit-tap-highlight-color: transparent;
        }

        .route:focus-visible { outline: none; }
        /* D-09 (06.10.2026 neu): kein Ring um den Raum – nur bei Tastatur (.kbd) ist die Schrift unterstrichen
           und der Raum leicht hinterlegt (Weich: --casora-nav-focus-line/-fill; sonst wie bisher ohne). */
        .route.kbd:focus-visible { background: var(--casora-nav-focus-fill, transparent); border-radius: 999px; }
        .route.kbd:focus-visible .label { text-decoration: underline; text-decoration-color: var(--casora-nav-focus-line, transparent);
          text-decoration-thickness: 2px; text-underline-offset: 5px; }

        .label {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
          white-space: nowrap;
          color: var(--casora-nav-label-color, #fff);
          /* Per variant, not shared: how far an unselected label drops depends
             on how much work the indicator is doing. */
          opacity: var(--casora-nav-label-inactive-opacity, 0.82);
        }

        .route.active .label { opacity: 1; }

        .route[data-has-popup] .label::after {
          content: "";
          display: inline-block;
          flex: none;
          width: 20px;
          height: 20px;
          margin-left: 2px;
          background-color: var(--casora-nav-chevron, rgba(255,255,255,0.42));
          -webkit-mask: url("${CHEVRON}") no-repeat center / contain;
          mask: url("${CHEVRON}") no-repeat center / contain;
          transform: rotate(0deg);
          transition: transform 0.34s cubic-bezier(0.32, 0.72, 0, 1);
        }

        .route[data-has-popup][data-popup-open] .label::after {
          transform: rotate(90deg);
        }

        @keyframes casora-badge-pulse {
          0%, 100% { opacity: .9; transform: scale(1); }
          50%      { opacity: 0;  transform: scale(0.85); }
        }

        .badge {
          position: absolute;
          display: none;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: #ffd700;
          pointer-events: none;
          animation: casora-badge-pulse 3s ease-in-out infinite;
        }
      `;

      if (this._variant === 'tablet') {
        return shared + `
          /* The clock and chrome buttons are custom fields of the room card, whose
             position:fixed is captured by a transformed ancestor, so they ride
             down under HA's header. This bar hangs off the viewport and would
             not - hence the offset. */
          :host {
            /* Centred over the panel, not the screen: beside a docked HA sidebar. */
            left: var(--casora-content-left, 0px);
            top: calc(var(--casora-chrome-row-top-tablet, 30px)
              + var(--casora-nav-header-offset, var(--casora-header-offset, 0px)));
            --casora-nav-reserve-current: var(--casora-chrome-side-reserve-tablet, 188px);
          }

          /* Both orientation-dependent values ride the one block that is known
             to match here. A second bar rule in its own media query is the same
             cascade on paper and was not worth the doubt. */
          @media (orientation: portrait) {
            :host {
              top: calc(var(--casora-chrome-row-top-tablet-portrait, 32px)
                + var(--casora-nav-header-offset, var(--casora-header-offset, 0px)));
              --casora-nav-reserve-current:
                var(--casora-chrome-side-reserve-tablet-portrait, 96px);
            }
          }

          .bar {
            width: fit-content;
            max-width: min(
              calc(75vw - 35px),
              calc(100vw - var(--casora-content-left, 0px)
                - 2 * (var(--hero-gutter, 23px)
                + var(--casora-nav-reserve-current, 188px)))
            );
            margin: 0 auto;
            height: var(--casora-nav-pill-height-tablet, 46px);
            padding: 0 var(--casora-nav-pill-inset-x-tablet, 4px);
            border-radius: 9999px;
            overflow: hidden;
          }

          /* The capsule the phone dashboard and the panel share, from the same theme variables. */
          .glass {
            background: var(--casora-pill-fill, rgba(255,255,255,0.10));
            -webkit-backdrop-filter: var(--casora-pill-backdrop, blur(12px) saturate(1.4));
            backdrop-filter: var(--casora-pill-backdrop, blur(12px) saturate(1.4));
            box-shadow: var(--casora-pill-rim, inset 0 0.5px 0 rgba(255,255,255,0.10), inset 0 -0.5px 0 rgba(255,255,255,0.10)),
              inset 1px 0 0 var(--casora-pill-edge, rgba(0,0,0,0.50)), inset -1px 0 0 var(--casora-pill-edge, rgba(0,0,0,0.50));
          }

          .rim {
            position: absolute;
            inset: 0;
            z-index: 0;
            border-radius: inherit;
            pointer-events: none;
            -webkit-backdrop-filter: var(--casora-pill-highlight, brightness(1.45));
            backdrop-filter: var(--casora-pill-highlight, brightness(1.45));
            padding: 1px;
            box-sizing: border-box;
            -webkit-mask: linear-gradient(to bottom, #000 0, rgba(0,0,0,.45) 13%, transparent 31%, transparent 69%, rgba(0,0,0,.45) 87%, #000 100%), linear-gradient(#000 0 0), linear-gradient(#000 0 0) content-box;
            -webkit-mask-composite: source-in, source-out;
            mask: linear-gradient(to bottom, #000 0, rgba(0,0,0,.45) 13%, transparent 31%, transparent 69%, rgba(0,0,0,.45) 87%, #000 100%), linear-gradient(#000 0 0), linear-gradient(#000 0 0) content-box;
            mask-composite: intersect, subtract;
          }

          .flash {
            position: absolute;
            inset: 0;
            z-index: 2;
            border-radius: inherit;
            opacity: 0;
            pointer-events: none;
          }

          .scroller { height: 100%; }

          .route + .route { margin-left: var(--casora-nav-route-gap-tablet, 4px); }

          .label {
            box-sizing: border-box;
            height: calc(var(--casora-nav-pill-height-tablet, 46px)
              - 2 * var(--casora-nav-pill-inset-y-tablet, 4px));
            padding: 0 var(--casora-nav-label-pad-x-tablet, 16px);
            border-radius: 9999px;
            font-size: var(--casora-nav-label-size-tablet, 16px);
            font-weight: var(--casora-chrome-font-weight, 500);
            /* The pill fill is the selection cue, so the labels barely drop. */
            opacity: var(--casora-nav-label-inactive-opacity, 0.84);
            background: transparent;
            transition: opacity .18s ease;
          }

          .indicator {
            top: var(--casora-nav-pill-inset-y-tablet, 4px);
            height: calc(var(--casora-nav-pill-height-tablet, 46px)
              - 2 * var(--casora-nav-pill-inset-y-tablet, 4px));
          }

          .indicator .fill {
            background: var(--casora-nav-active-fill, rgba(200,200,200,0.25));
          }

          .route[data-has-popup] .label::after {
            margin-left: -1px;
            margin-right: -6px;
          }

          .badge { top: 8px; right: 12px; }
        `;
      }

      return shared + `
        :host {
          top: calc(var(--casora-chrome-row-center-desktop, 56px)
            - var(--casora-nav-label-pad-top, 8px)
            - (var(--casora-chrome-font-size, 18px) / 2)
            + var(--casora-nav-header-offset, var(--casora-header-offset, 0px)));
        }

        .bar {
          display: flex;
          justify-content: center;
          width: fit-content;
          max-width: calc(100vw - 2 * var(--casora-nav-margin-current, 8vw));
          margin: 0 auto;
        }

        @supports (animation-timeline: scroll()) {
          .scroller {
            animation: casora-fade-mask linear;
            animation-timeline: scroll(self inline);
          }
        }

        @keyframes casora-fade-mask {
          0% {
            -webkit-mask-image: linear-gradient(to right, transparent 0px, black 0px, black calc(100% - 80px), transparent 100%);
            mask-image: linear-gradient(to right, transparent 0px, black 0px, black calc(100% - 80px), transparent 100%);
          }
          100% {
            -webkit-mask-image: linear-gradient(to right, transparent 0px, black 80px, black 100%, transparent calc(100% + 80px));
            mask-image: linear-gradient(to right, transparent 0px, black 80px, black 100%, transparent calc(100% + 80px));
          }
        }

        .route { padding: 0 20px; }

        .label {
          box-sizing: border-box;
          height: calc(var(--casora-chrome-font-size, 18px)
            + var(--casora-nav-label-pad-top, 8px) + 14px);
          padding: var(--casora-nav-label-pad-top, 8px) 0 14px;
          font-size: var(--casora-chrome-font-size, 18px);
          font-weight: var(--casora-chrome-font-weight, 500);
          letter-spacing: var(--casora-chrome-letter-spacing, 0.2px);
          /* Only a 2px underline marks the active room, so unselected labels
             carry more of the contrast than they do on the tablet pill. */
          opacity: var(--casora-nav-label-inactive-opacity, 0.74);
        }

        .indicator {
          bottom: var(--casora-nav-underline-gap, 4px);
          height: var(--casora-nav-underline-thickness, 2px);
        }

        .indicator .fill { background: rgba(255,255,255,0.85); }

        .badge { top: 6px; right: 10px; }
      `;
    }
  }

  customElements.define('casora-nav-bar', CasoraNavBar);

  function walkFind(root, selector, out, depth) {
    if (!root || depth > 20 || !root.querySelectorAll) return;
    root.querySelectorAll(selector).forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) walkFind(el.shadowRoot, selector, out, depth + 1);
    });
  }

  function persistentHost() {
    const found = [];
    walkFind(document, 'ha-app-layout', found, 0);
    for (const el of found) if (el.isConnected) return el;
    return document.body;
  }

  class CasoraNav extends HTMLElement {
    static getStubConfig() { return { variant: 'desktop', routes: [] }; }

    setConfig(config) {
      if (!config || !Array.isArray(config.routes)) {
        throw new Error('casora-nav: routes array required');
      }
      this._config = config;
      this._adopt();
    }

    set hass(hass) {
      this._hass = hass;
      if (this._bar) this._bar.hass = hass;
    }

    get hass() { return this._hass; }

    getCardSize() { return 0; }

    connectedCallback() {
      this.style.display = 'none';
      (CasoraNav._live || (CasoraNav._live = new Set())).add(this);
      this._adopt();
    }

    disconnectedCallback() {
      if (CasoraNav._live) CasoraNav._live.delete(this);
      requestAnimationFrame(() => {
        if (CasoraNav._live && CasoraNav._live.size) return;
        if (CasoraNav._bar) { CasoraNav._bar.remove(); CasoraNav._bar = null; }
      });
    }

    _adopt() {
      if (!this._config || !this.isConnected) return;
      const variant = this._config.variant === 'tablet' ? 'tablet' : 'desktop';

      let bar = CasoraNav._bar;
      if (bar && bar._variant !== variant) { bar.remove(); bar = null; }

      if (!bar) {
        bar = document.createElement('casora-nav-bar');
        bar.setConfig(this._config);
        CasoraNav._bar = bar;
      } else {
        bar.updateConfig(this._config);
      }

      const host = persistentHost();
      if (bar.parentNode !== host) host.appendChild(bar);

      this._bar = bar;
      if (this._hass) bar.hass = this._hass;
    }
  }

  customElements.define('casora-nav', CasoraNav);

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: 'casora-nav',
    name: 'Casora Navigation',
    description: 'Casora navigation bar — desktop labels or tablet glass pill',
  });
})();

(function () {
  if (window.casoraPopup) return;

  var SHEET_MAX = 768;

  function flagOn() {
    if (typeof window.CASORA_POPUP === 'boolean') return window.CASORA_POPUP;
    try {
      var q = new URLSearchParams(location.search).get('casora_popup');
      if (q === '1') return true;
      if (q === '0') return false;
      return localStorage.getItem('casora_popup') !== '0';
    } catch (e) { return true; }
  }

  var CHART_WAIT_MAX = 1600;

  var FOREIGN = /([^\w.#-]|^)(ha-adaptive-dialog|ha-bottom-sheet|ha-dialog|wa-dialog|wa-drawer)(?![\w-])/g;
  function retarget(css) { return String(css == null ? '' : css).replace(FOREIGN, '$1.surface'); }

  var BASE_CSS = `
    :host {
      position: fixed;
      inset: 0;
      z-index: var(--casora-popup-z, 2147483000);
      display: none;
      color: var(--primary-text-color, #fff);
      --casora-popup-grain-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    :host([open]) { display: block; }

    .scrim {
      position: absolute;
      inset: 0;
      background: var(--casora-popup-scrim, var(--mdc-dialog-scrim-color, rgba(0, 0, 0, 0.40)));
      backdrop-filter: var(--casora-popup-scrim-backdrop, var(--casora-scrim-backdrop, blur(6px) saturate(1.35)));
      -webkit-backdrop-filter: var(--casora-popup-scrim-backdrop, var(--casora-scrim-backdrop, blur(6px) saturate(1.35)));
      opacity: 0;
      /* Deliberately slower than the pane and on its own curve: the panel
         arrives, then the room settles back behind it. Sharing the pane's
         260ms is what made the blur read as a snap. */
      transition: opacity var(--casora-popup-scrim-enter, 480ms)
                  var(--casora-popup-scrim-ease, cubic-bezier(0.25, 0.6, 0.3, 1));
    }
    :host([shown]) .scrim { opacity: 1; }
    /* Out faster than in, and inside the 400ms teardown or it gets cut off. */
    :host([closing]) .scrim {
      transition-duration: var(--casora-popup-scrim-exit, 200ms);
      transition-timing-function: ease-in;
    }

    .layer {
      position: absolute;
      inset: 0;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      pointer-events: none;
    }

    .surface {
      pointer-events: auto;
      position: relative;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: var(--popup-min-width, 580px);
      max-width: min(var(--popup-max-width, 600px), calc(100vw - 16px));
      margin-top: var(--casora-popup-top, 112px);
      max-height: calc(100svh - var(--casora-popup-top, 112px) - 8px - var(--safe-area-inset-bottom, 0px));
      border-radius: var(--casora-popup-radius, 38px);
      background: transparent;
      overflow: hidden;
    }
    /* A sheet may size itself to its content - see casora_popup_recently_added,
       where two shelves of two tiles must not sit in a sheet built for three.
       Below the two-column breakpoint the shelves go fluid and have no
       intrinsic width, so a popup that opts in names what to use instead. */
    @media (max-width: 900px) {
      .surface { width: var(--popup-min-width-narrow, var(--popup-min-width, 580px)); }
    }
    /* A landscape tablet is wide but short: 112px above the sheet plus the
       header was 22% of the screen gone before any content. The offset follows
       the height it has to fit into, not the width. */
    @media (max-height: 900px) and (min-width: 601px) {
      :host { --casora-popup-top: 64px; }
    }
    @media (max-height: 720px) and (min-width: 601px) {
      :host { --casora-popup-top: 40px; }
    }

    /* The frost is a sibling of the content, not a wrapper around it. As an
       ancestor it would make every backdrop-filter inside the popup a silent
       no-op, which is what pinned --casora-glass-pill-backdrop to none. */
    .glass {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      animation: casora-popup-fade var(--casora-popup-enter, 260ms) ease-out;
      isolation: isolate;
      box-shadow: var(--casora-popup-shadow,
        0 40px 90px -32px rgba(0, 0, 0, 0.78),
        0 10px 28px -14px rgba(0, 0, 0, 0.55));
      background: var(--casora-popup-tint,
        var(--ha-dialog-surface-background, var(--ha-dialog-background, rgba(0, 0, 5, 0.5))));
    }
    :host(:not([flat])) .glass {
      backdrop-filter: var(--casora-popup-backdrop,
        var(--casora-surface-backdrop, blur(28px) saturate(200%)));
      -webkit-backdrop-filter: var(--casora-popup-backdrop,
        var(--casora-surface-backdrop, blur(28px) saturate(200%)));
    }
    :host([flat]) .glass { background: var(--casora-popup-tint-flat, rgba(8, 8, 12, 0.24)); }
    /* Casora (30.09.2026): Nur WebKit am Handy. Dort malt backdrop-filter hier nicht
       zuverlässig (Playwright-WebKit gar nicht, iOS je nach Ebene) – dann schimmern
       weiße Kacheln und Texte durch und überlagern den Popup-Inhalt. Die Abfrage trifft
       nur WebKit (-apple-system-body kennt Chromium nicht); dort bekommt das Sheet eine
       praktisch deckende Grundfläche (Ton wie das geblurrte Ergebnis). Desktop und
       Chromium behalten den Original-Glaslook. */
    @media (max-width: 600px) {
      @supports (font: -apple-system-body) {
        :host(:not([flat])) .glass {
          background:
            linear-gradient(var(--casora-popup-tint, var(--ha-dialog-surface-background, var(--ha-dialog-background, rgba(0, 0, 5, 0.5)))),
              var(--casora-popup-tint, var(--ha-dialog-surface-background, var(--ha-dialog-background, rgba(0, 0, 5, 0.5))))),
            var(--casora-popup-phone-base-webkit, rgb(24, 23, 27));
        }
      }
    }

    /* A mix-blend-mode layer makes the browser read the backdrop back and
       composite the subtree as one group, and zero opacity does not remove it -
       an invisible grain costs exactly what a visible one costs. Every widget
       popup runs at grain 0, so the layer has to be able to go entirely. */
    .glass::before, .glass::after {
      content: var(--casora-popup-grain-content, "");
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      background-image: var(--casora-popup-grain-image);
      background-size: 180px 180px;
    }
    /* overlay is midpoint-relative and goes weak on dark ground; screen falls
       off the opposite way, so the pair holds roughly flat across the ramp. */
    .glass::before { mix-blend-mode: overlay; opacity: var(--casora-popup-grain, 0.10); }
    .glass::after  { mix-blend-mode: screen;  opacity: var(--casora-popup-grain-dark, 0.04); }

    /* Decoration, off by default - the popups read flat now, matching HA's
       dialogs. Set --casora-popup-rim to a box-shadow to bring it back. */
    .rim {
      display: var(--casora-popup-rim-display, none);
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      animation: casora-popup-fade var(--casora-popup-enter, 260ms) ease-out;
      box-shadow: var(--casora-popup-rim,
        inset 0 1px 0 -0.5px rgba(255, 255, 255, 0.34),
        inset 0 8px 14px -12px rgba(255, 255, 255, 0.22),
        inset 0 -1px 0 -0.5px rgba(255, 255, 255, 0.11),
        inset 1px 0 0 -0.5px rgba(255, 255, 255, 0.13),
        inset -1px 0 0 -0.5px rgba(255, 255, 255, 0.13));
    }

    :host([closing]) .surface { animation: casora-popup-out 140ms ease-in forwards; }

    @keyframes casora-popup-fade {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes casora-popup-out {
      from { opacity: 1; }
      to   { opacity: 0; }
    }
    /* Transform, deliberately - a margin slide relayouts every frame and drops
       them. No opacity here: opacity below 1 makes the surface a backdrop root
       and kills the frost inside it, which is what HA's own drawer does wrong. */
    @keyframes casora-sheet-in {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
    @keyframes casora-sheet-out {
      from { transform: translateY(0); }
      to   { transform: translateY(100%); }
    }

    /* The entrance starts off-screen, so anything that stalls the animation
       clock would strand the surface there. Opting out restores the resting
       state, which is the laid-out one. */
    @media (prefers-reduced-motion: reduce) {
      .surface, .glass, .rim, .content { animation: none !important; }
      .scrim { transition: none !important; }
    }

    .grab { display: none; }

    /* .glass is absolutely positioned, so it paints above in-flow siblings.
       .content escapes that only because animating opacity makes it paint in
       the positioned step; the header has no animation, so it needs this or
       the frost fades in over the title. */
    /* The header was never part of the entrance. .content animates, and in a
       widget popup even that is off because each plate animates itself - so the
       close, the actions and the title were simply present on frame one while
       everything under them faded in. They arrive with the first plate now. */
    /* The same depth entrance the plates use, so the chrome arrives as part of
       the popup rather than ahead of it. */
    @keyframes casora-popup-chrome-in {
      from { opacity: 0; transform: perspective(900px) translateZ(-70px); }
      to   { opacity: 1; transform: perspective(900px) translateZ(0); }
    }
    .header {
      flex: 0 0 auto;
      position: relative;
      z-index: 1;
    }
    /* On each control, never on .header. An animated opacity on an ANCESTOR
       paints the subtree into its own layer and every backdrop-filter inside it
       has nothing left to sample - animating the bar would flatten the close
       button's frost for the length of its own entrance. */
    .header-close,
    .header-content,
    .header-actions {
      animation: var(--casora-popup-chrome-enter, none);
    }
    @media (prefers-reduced-motion: reduce) {
      .header-close, .header-content, .header-actions { animation: none; }
    }
    .header[hidden] { display: none; }
    .header-bar {
      position: relative;
      display: flex;
      flex-direction: row;
      align-items: center;
      /* The close glyph's ink sits on the same left margin as the body content
         (8px container + 26px card gutter = 34px), so the popup has one left
         edge instead of three. Measured, not derived: the glyph's ink starts
         5/24 into its own box, so 17px of bar padding is what lands it on 34. */
      /* The SAME gutter the content pads by. These were two independent
         numbers, so every popup that padded its content differently put the
         close button somewhere else, and each one had to be found and tuned by
         hand. One value, read by both, cannot disagree. */
      padding: 0 var(--casora-popup-gutter, 26px);
      box-sizing: border-box;
    }
    /* Room under the row, so the close control is not against the edge of the
       header and the title has somewhere to breathe. */
    .header { padding-bottom: var(--casora-popup-header-gap, 10px); }
    .header-nav, .header-actions {
      flex: none;
      min-width: 0;
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 4px;
    }
    /* The close glyph sits 25px in because a 24px icon is centered in a 48px
       target. An action pill has no such target, so without this it lands 8px
       from the edge and crowds the 28px corner radius. */
    .header-actions { padding-right: var(--casora-popup-header-actions-pad, 12px); }
    /* Centered on the BAR, not between the nav and the actions - those are
       different widths, so centering between them is off by half the difference.
       Absolute, so the actions cannot push it; pointer-events off so it never
       eats a tap meant for the close control. */
    .header-content {
      position: absolute;
      /* Centered with auto margins, NOT a translate. The chrome entrance
         animates transform, and its final keyframe replaced a centering
         translateX(-50%) outright - which shifted the title right by half its
         own width once the animation settled. Nothing here may use transform. */
      left: 0;
      right: 0;
      margin-inline: auto;
      width: fit-content;
      max-width: calc(100% - 132px);
      padding: 10px 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: center;
      pointer-events: none;
    }
    /* .header-content is out of the flow now, so the actions need to be told
       to hold the trailing edge rather than sliding up against the close. */
    .header-actions { margin-left: auto; }
    .header-eyebrow {
      font-size: var(--ha-font-size-m, 14px);
      line-height: 16px;
      color: var(--casora-popup-header-subtitle-color,
        var(--secondary-text-color, rgba(255, 255, 255, 0.55)));
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-title {
      font-size: var(--casora-popup-header-title-size, 22px);
      line-height: var(--ha-line-height-condensed, 1.2);
      font-weight: var(--ha-font-weight-medium, 500);
      color: var(--casora-popup-header-title-color,
        var(--primary-text-color, #fff));
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .header-eyebrow:empty, .header-title:empty { display: none; }
    /* A circle and a rectangle set to the same x do not read as aligned: the
       circle's edge is a tangent and only its widest point reaches the margin,
       so it looks further left than the flat edge beside it. A few pixels of
       indent is what makes them read as one gutter. */
    /* One gutter, two widths. A popup sets the desktop value; the phone value
       is the same for all of them because the content cards narrow together. */
    :host { --casora-popup-gutter: var(--casora-popup-gutter-wide, 26px);
            --casora-popup-value-gap: var(--casora-popup-value-gap-wide, 0px); }
    @media (max-width: 600px) {
      :host { --casora-popup-gutter: var(--casora-popup-gutter-phone, 14px);
              --casora-popup-value-gap: 0px; }
    }
    /* Parked chart cards. Off screen but connected, so apexcharts keeps the
       chart it already drew instead of fetching and drawing it again. */
    .keep { position: absolute; left: -99999px; top: 0; width: 1px; height: 1px;
            overflow: hidden; pointer-events: none; }
    .header-close {
      transition: opacity 0.16s ease;
      appearance: none;
      -webkit-appearance: none;
      background: none;
      border: 0;
      margin: 0;
      padding: 0;
      width: 48px;
      height: 48px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      cursor: pointer;
      position: relative;
      isolation: isolate;
      color: var(--casora-popup-header-title-color,
        var(--primary-text-color, #fff));
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
    }
    .header-close[hidden] { display: none; }
    .header-close svg {
      width: 24px;
      height: 24px;
      display: block;
      fill: currentColor;
    }
    /* HA's ha-icon-button: a currentColor disc at opacity 0 that comes up to
       0.1 on hover. Never visible at rest, so it never shows on a phone. */
    .header-close::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background-color: currentColor;
      opacity: 0;
      pointer-events: none;
      z-index: -1;
    }
    @media (hover: hover) {
      .header-close:hover:not([disabled])::after { opacity: 0.1; }
    }

    /* A chart fetches history first, so the shell is hidden and cross-dissolves
       in. The rule cannot live here - a popup's chart sits inside a
       button-card's shadow root, so this selector matches nothing. What stays
       is the safety net below, which walks shadow roots. */

    .content {
      /* Every ha-card inherits the theme's --ha-card-backdrop-filter and lays a
         SECOND one over .glass - the haze under the header. Null the VARIABLE,
         not the property: it is what ha-card's own :host rule reads, and it
         inherits through shadow boundaries to nested cards. */
      --ha-card-backdrop-filter: none;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
      outline: none !important;
      scrollbar-width: none;
      -ms-overflow-style: none;
      animation: casora-popup-fade var(--casora-popup-enter, 260ms) ease-out;
    }
    .content::-webkit-scrollbar { display: none; }
    /* Scroll-Hinweis (01.10.2026): liegt unter dem Sheet-Rand noch Inhalt, blendet ein
       weicher Rand aus. Eigene Ebene ÜBER dem Inhalt statt mask-image auf .content –
       eine Maske am Vorfahren schaltet den Blur der Platten darin ab. */
    .more {
      position: absolute;
      left: 0; right: 0; bottom: 0;
      height: var(--casora-popup-more-height, 44px);
      pointer-events: none;
      z-index: 2;
      background: linear-gradient(to bottom, rgba(0, 0, 0, 0),
        var(--casora-popup-more-fade, rgba(0, 0, 0, 0.42)));
      opacity: 0;
      transition: opacity 200ms ease;
    }
    :host([more-below]) .more { opacity: 1; }
    .content .container {
      /* Unten Luft bis zur Sheet-Kante, damit die letzte Zeile (samt Schatten) beim
         Ende des Scrollens nicht an der Kante klebt (Weich-Audit M3: 36px). */
      padding: 8px 8px var(--casora-popup-content-pad-bottom, 20px) 8px;
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
      outline: none !important;
    }

    /* The tile's own cards (variables.popup_extra_cards), below the popup's
       content: same gutter as the popup's rows, each card on a row plate. */
    .extra {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 calc(8px + var(--casora-popup-gutter, 26px)) 24px;
      --ha-card-background: var(--casora-popup-row-fill, rgba(255, 255, 255, 0.10));
      --card-background-color: var(--casora-popup-row-fill, rgba(255, 255, 255, 0.10));
      --ha-card-border-radius: var(--casora-popup-row-radius, 20px);
      --ha-card-border-width: 0px;
      --ha-card-box-shadow: var(--casora-popup-plate-shadow, none);
      --ha-card-backdrop-filter: var(--casora-popup-plate-backdrop, none);
    }
    .extra[hidden] { display: none; }
    .extra-title {
      padding: 0 4px;
      margin-bottom: -4px;
      font-family: var(--primary-font-family, system-ui);
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--casora-popup-tiles-text-primary, #fff);
    }

    casora-popup-hass { display: none; }

    @media (max-width: 768px) {
      .layer { align-items: flex-end; }

      /* The sheet's top edge IS the line the popup is cut off at, and the header
         bar has no vertical padding - so the close control sits hard against
         it. A negative value moves the clearance above the button instead. */
      .header-bar { padding-top: var(--casora-popup-header-top-mobile, 10px); }
      .surface {
        width: 100%;
        max-width: none;
        margin-top: 0;
        /* Full height on every popup, the way more-info sizes its mobile sheet.
           Detents were tried and rejected: a sheet that is sometimes short and
           sometimes tall reads as a bug, and the hero needs the room. */
        height: var(--casora-sheet-height, calc(100dvh - env(safe-area-inset-top, 0px)));
        min-height: var(--casora-sheet-min, calc(100dvh - env(safe-area-inset-top, 0px)));
        max-height: calc(100dvh - env(safe-area-inset-top, 0px));
        border-radius: var(--casora-sheet-radius, 24px) var(--casora-sheet-radius, 24px) 0 0;
        box-shadow: none;
        animation: casora-sheet-in 300ms cubic-bezier(0.32, 0.72, 0, 1);
      }
      .glass, .rim, .content { animation: none; }

      :host([closing]) .surface {
        animation: casora-sheet-out 220ms ease-in forwards;
      }
      /* A swipe has already put the sheet where the keyframe would end. */
      :host([swipe-out]) .surface { animation: none !important; }
      .grab {
        display: block;
        flex: 0 0 auto;
        padding: 10px 0 2px;
        touch-action: none;
      }
      .grab span {
        display: block;
        width: 36px;
        height: 4px;
        margin: 0 auto;
        border-radius: 2px;
        background: var(--casora-popup-grabber, rgba(255, 255, 255, 0.28));
      }
    }

    /* ── Weich (01.10.2026): Attribut soft, gesetzt beim Öffnen, wenn das Theme
       --casora-popup-layout: soft trägt. Creme-Fläche, weicher Schatten, runder
       Schließen-Knopf oben rechts, mittig Ring in Gerätefarbe und großer Titel.
       Steht am Ende und über :host([soft]), damit es die popup_styles der Vorlagen
       (:host { … }) übertrifft. Ohne Attribut greift nichts davon. */
    .header-ring[hidden] { display: none; }
    :host([soft]) {
      --casora-popup-row-fill: var(--casora-soft-row-fill, rgba(140, 115, 90, 0.07));
      --casora-popup-chart-fill: var(--casora-soft-row-fill, rgba(140, 115, 90, 0.07));
      --casora-popup-plate-shadow: none;
      --casora-popup-plate-backdrop: none;
      --casora-popup-gutter-wide: var(--casora-soft-gutter, 30px);
      --casora-popup-gutter-phone: var(--casora-soft-gutter-phone, 18px);
      /* Fix-Runde 1 (B-01/B-03/B-05): ein Rahmen für alle Weich-Popups – Spaltenabstand,
         Zeilen- und Schieber-Radius kommen aus diesen Werten statt aus jeder Vorlage. */
      --casora-popup-col-gap: var(--casora-soft-col-gap, 24px);
      --casora-popup-sec-gap: var(--casora-soft-sec-gap, 20px);
      --casora-soft-card-top: 0px;
      /* B-02: ein Etiketten-System – Abschnittsköpfe, die noch als 15/600-Satzschrift gebaut
         werden, lesen diese Werte (Fallback = bisherige Optik in Standard und Glas). */
      --casora-h15-fs: 12px;
      --casora-h15-fw: 700;
      --casora-h15-ls: 0.1em;
      --casora-h15-tt: uppercase;
      --casora-h15-c: var(--casora-soft-label, var(--secondary-text-color));
      --casora-lbl15: none;
      --casora-lbl12: block;
      /* Ein Schalter für alle Popups (wie das Licht-Popup): 44×26, Ton-Spur, weißer Knopf. */
      --casora-sw-w: 44px;
      --casora-sw-h: 26px;
      --casora-sw-pad: 3px;
      --casora-sw-k: 20px;
      --casora-sw-x: 18px;
      --casora-sw-on: var(--casora-lps-switch-on, #B67A50);
      --casora-sw-off: var(--casora-lps-switch-off, rgba(58, 50, 43, 0.38));
      --casora-sw-ks: 0 1px 3px rgba(0, 0, 0, 0.2);
      /* B-04: Größen auf die Skala (16 → 15, 24/600 → 17/700). */
      --casora-fs16: 15px;
      --casora-fs24: 17px;
      --casora-fw24: 700;
      --casora-popup-row-radius: var(--casora-soft-row-radius, 24px);
      --casora-popup-more-fade: var(--casora-soft-more-fade, rgba(0, 0, 0, 0.12));
      --casora-popup-grabber: var(--casora-soft-grabber, rgba(120, 100, 80, 0.30));
    }
    :host([soft]) .glass {
      font-family: var(--primary-font-family, inherit);
      background: var(--casora-soft-surface, var(--casora-dialog-bg, rgb(250, 246, 240)));
      box-shadow: var(--casora-soft-shadow, var(--dialog-box-shadow, none));
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    :host([soft]) .glass::before, :host([soft]) .glass::after { content: none; }
    :host([soft]) .header { padding-top: var(--casora-soft-header-top, 26px); padding-bottom: 0; }
    :host([soft]) .header-bar {
      flex-direction: column;
      align-items: center;
      padding: 0 76px;
    }
    :host([soft]) .header-nav { position: absolute; top: 0; right: 26px; z-index: 1; }
    :host([soft]) .header-actions {
      position: absolute; top: 0; left: 26px; margin: 0; padding-right: 0; z-index: 1;
    }
    :host([soft]) .header-content {
      position: static;
      overflow: visible;
      width: auto;
      max-width: 100%;
      margin: 0;
      padding: 0;
      min-height: 38px;
      gap: 0;
    }
    :host([soft]) .header-ring {
      order: 0;
      width: 78px;
      height: 78px;
      flex: none;
      border-radius: 50%;
      display: grid;
      place-items: center;
      margin: 0 0 16px;
      background: var(--ring, var(--casora-color-teal, #4E9E95));
      color: var(--casora-soft-glyph, #fff);
      box-shadow:
        0 0 0 10px color-mix(in srgb, var(--ring, #4E9E95) var(--casora-soft-ring-halo, 16%), transparent),
        0 14px 30px -10px color-mix(in srgb, var(--ring, #4E9E95) var(--casora-soft-ring-glow, 55%), transparent);
    }
    :host([soft]) .header-ring[hidden] { display: none; }
    /* Leeres Popup („Noch kein Gerät zugeordnet“): ebenfalls Sand, keine Gerätefarbe ohne Gerät. */
    :host([soft]) .header-ring[off], :host([soft][soft-empty]) .header-ring {
      background: var(--casora-lps-ring-off, rgba(140,115,90,0.12));
      color: var(--casora-lps-ring-off-ink, rgba(58,50,43,0.45));
      box-shadow: 0 0 0 10px var(--casora-lps-ring-off-halo, rgba(140,115,90,0.06));
    }
    :host([soft]) .header-ring .g {
      width: 34px; height: 34px; background-color: currentColor;
      -webkit-mask: var(--g) center / contain no-repeat; mask: var(--g) center / contain no-repeat;
    }
    :host([soft]) .header-ring ha-icon { --mdc-icon-size: 34px; display: flex; }
    :host([soft]) .header-title {
      order: 1;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.025em;
      line-height: 1.2;
      color: var(--casora-popup-tiles-text-primary, var(--primary-text-color, #3A322B));
      max-width: 100%;
    }
    :host([soft]) .header-eyebrow {
      order: 2;
      font-size: 15px;
      line-height: 1.35;
      font-weight: 500;
      margin-top: 2px;
      color: var(--casora-soft-sub, var(--secondary-text-color));
    }
    :host([soft]) .header-close {
      width: 38px;
      height: 38px;
      background: var(--casora-soft-control-fill, rgba(140, 115, 90, 0.10));
      color: var(--casora-soft-close-ink, var(--secondary-text-color));
      box-shadow: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }
    :host([soft]) .header-close svg { width: 18px; height: 18px; }
    /* D-02: sichtbar 38 px, Trefferfläche 44 px (unsichtbarer Rand rundum) */
    :host([soft]) .header-close::before { content: ""; position: absolute; inset: -3px; border-radius: 50%; }
    .soft-empty[hidden] { display: none; }
    /* Gerät der Kachel fehlt (Entität gibt es nicht mehr): nur der Hinweis, kein halber Inhalt. */
    :host([missing]) .content .container, :host([missing]) .extra { display: none !important; }
    :host(:not([soft])) .soft-empty { position: relative; z-index: 3; padding: 4px 18px 22px; font-family: var(--primary-font-family, inherit); }
    :host(:not([soft])) .se-row {
      display: flex; align-items: center; gap: 12px; min-height: 56px; box-sizing: border-box;
      padding: 10px 14px 10px 10px; border-radius: var(--casora-popup-row-radius, 18px);
      background: var(--casora-popup-row-fill, rgba(127, 127, 127, 0.14)); cursor: pointer; text-align: left;
    }
    :host(:not([soft])) .se-ic {
      width: 38px; height: 38px; flex: none; border-radius: 50%; display: grid; place-items: center;
      background: rgba(127, 127, 127, 0.22); color: var(--secondary-text-color); --mdc-icon-size: 19px;
    }
    :host(:not([soft])) .se-tx { flex: 1; min-width: 0; }
    :host(:not([soft])) .se-tx b { display: block; font-size: 14.5px; font-weight: 700;
      color: var(--casora-popup-tiles-text-primary, var(--primary-text-color)); }
    :host(:not([soft])) .se-tx small { display: block; font-size: 12.5px; margin-top: 1px;
      color: var(--casora-popup-tiles-text-secondary, var(--secondary-text-color)); }
    :host(:not([soft])) .se-chev { flex: none; opacity: .4; color: var(--casora-popup-tiles-text-primary, var(--primary-text-color)); }
    :host([missing]) .header-actions { display: none !important; }
    :host([soft][soft-empty]) .content .container { padding-bottom: 0; }
    :host([soft]) .soft-empty { position: relative; z-index: 1; padding: 16px calc(var(--casora-soft-inset, 10px) + 26px) 30px; font-family: var(--primary-font-family, inherit); }
    :host([soft]) .se-row {
      display: flex; align-items: center; gap: 12px; min-height: 58px; box-sizing: border-box;
      padding: 10px 14px 10px 10px; border-radius: var(--casora-popup-row-radius, 24px);
      background: var(--casora-soft-row-fill, rgba(140, 115, 90, 0.07)); cursor: pointer; text-align: left;
      transition: background-color .18s ease; -webkit-tap-highlight-color: transparent;
    }
    @media (hover: hover) { :host([soft]) .se-row:hover { background: var(--casora-soft-row-hover, rgba(140, 115, 90, 0.11)); } }
    :host([soft]) .se-ic {
      width: 38px; height: 38px; flex: none; border-radius: 50%; display: grid; place-items: center;
      background: var(--casora-soft-icon-off, rgba(140, 115, 90, 0.12)); color: var(--casora-soft-glyph-off, rgba(58, 50, 43, 0.55));
      --mdc-icon-size: 19px;
    }
    :host([soft]) .se-tx { flex: 1; min-width: 0; }
    :host([soft]) .se-tx b { display: block; font-size: 14.5px; font-weight: 700; letter-spacing: -0.01em;
      color: var(--casora-popup-tiles-text-primary, var(--primary-text-color)); }
    :host([soft]) .se-tx small { display: block; font-size: 12.5px; font-weight: 500; margin-top: 1px;
      color: var(--casora-soft-sub, var(--secondary-text-color)); }
    :host([soft]) .se-chev { flex: none; opacity: .4; color: var(--casora-popup-tiles-text-primary, var(--primary-text-color)); }
    /* Fix-Runde 1 (B-01): Inhalt 36 px vom Rand (Container 10 + Kartenrand 26). */
    :host([soft]) .content .container { padding: 8px var(--casora-soft-inset, 10px) 30px; }
    @media (max-width: 768px) {
      /* Fix-Runde 1 (B-14): echtes Bottom-Sheet – oben bleibt ein Streifen Abdunklung,
         die Rundung und der Greifer sind sichtbar. */
      :host([soft]) { --casora-soft-sheet-gap: var(--casora-soft-sheet-top, 44px); }
      :host([soft]) .surface {
        border-radius: var(--casora-soft-sheet-radius, 32px) var(--casora-soft-sheet-radius, 32px) 0 0;
        /* K9 (Weich-Audit): Höhe nach Inhalt, höchstens bis unter den Streifen oben. Ein Popup
           mit festem Wunsch (--casora-sheet-height/-min) behält ihn. !important, weil viele Vorlagen
           in ihrem Popup-CSS die volle Höhe (100svh …) für .surface setzen. */
        height: var(--casora-sheet-height, auto) !important;
        min-height: min(var(--casora-sheet-min, 0px), calc(100dvh - env(safe-area-inset-top, 0px) - var(--casora-soft-sheet-gap)));
        max-height: calc(100dvh - env(safe-area-inset-top, 0px) - var(--casora-soft-sheet-gap));
      }
      /* K9: dieselben Vorlagen strecken den Inhalt per min-height (100svh …) auf volle Höhe. */
      :host([soft]) .content .container { min-height: 0 !important; }
      /* Runde 2: Die Fläche (.glass) ist absolut positioniert und lag über dem statischen Greifer. */
      :host([soft]) .grab { padding: 8px 0 0; position: relative; z-index: 1; }
      :host([soft]) .grab span { width: 36px; height: 5px; border-radius: 3px; }
      :host([soft]) .header { padding-top: 14px; }
      :host([soft]) .header-bar { padding: 0 60px; }
      :host([soft]) .header-nav { right: 16px; }
      :host([soft]) .header-actions { left: 16px; }
      :host([soft]) .header-ring { width: 66px; height: 66px; margin-bottom: 12px; }
      :host([soft]) .header-ring[hidden] { display: none; }
    :host([soft]) .header-ring .g { width: 29px; height: 29px; }
      :host([soft]) .header-ring ha-icon { --mdc-icon-size: 29px; }
      :host([soft]) .header-title { font-size: 24px; }
    }
  `;

  // Ring im Weich-Kopf: Symbol der Kachel, die das Popup geöffnet hat, Farbe nach Gerät.
  // Die Farbe kommt aus der Kachel selbst (Symbolkreis, Maske, Symbolfarbe, Kachel-Variablen);
  // die Schlüsselwortliste greift nur, wenn die Kachel gerade keine Farbe zeigt (z. B. aus).
  // Ersatzfarbe, wenn die Kachel keine eigene Gerätefarbe zeigt – feste Zuordnung (Fix-Runde 1):
  // Gelb Licht/Szenen, Grün Energie/Pflanzen, Orange Heizung/Wetter, Türkis Klima/Jalousie/Allgemein,
  // Rot Sicherheit/Alarm, Blau Netzwerk/Medien/Updates.
  var RING_HUES = [
    [/thermostat|fbh|heiz|heat/, 'var(--casora-color-orange, #DE8A4E)'],
    [/light|licht|lamp|scene|szene/, 'var(--casora-color-yellow, #E8B04A)'],
    [/energy|energie|solar|power|battery|plant|pflanze/, 'var(--casora-color-green, #6AAE78)'],
    [/weather|wetter|nina/, 'var(--casora-color-orange, #DE8A4E)'],
    [/security|alarm|camera|kamera/, 'var(--casora-color-red, #D35A4E)'],
    [/network|netz|update|media|music|tv/, 'var(--casora-color-blue, #5B8FC9)'],
    [/climate|temp|humid|air|vent|klima|cover|blind|shade|jalousie|calendar/, 'var(--casora-color-teal, #4E9E95)'],
  ];
  // „rgb(…)“, „rgba(…)“ oder „#rgb/#rrggbb“ → [r, g, b, a]; sonst null.
  function rgbaOf(c) {
    c = String(c || '').trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(c);
    if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
    if (p.length < 3 || p.slice(0, 3).some(isNaN)) return null;
    return [p[0], p[1], p[2], p.length > 3 && !isNaN(p[3]) ? p[3] : 1];
  }
  // Eine Gerätefarbe ist deckend und bunt – Sand, Grau, Weiß und Transparenz zählen nicht.
  function deviceHue(src) {
    var sr = src && src.shadowRoot;
    if (!sr) return null;
    var cands = [];
    try {
      var cell = sr.querySelector('#img-cell');
      var icon = sr.querySelector('#icon');
      if (cell) {
        cands.push(getComputedStyle(cell).backgroundColor);
        cands.push(getComputedStyle(cell, '::before').backgroundColor);
      }
      if (icon) cands.push(getComputedStyle(icon).color);
      var card = sr.querySelector('ha-card');
      if (card) {
        var cs = getComputedStyle(card);
        cands.push(cs.getPropertyValue('--casora-icon-color-current'));
        cands.push(cs.getPropertyValue('--casora-badge-icon-color'));
      }
    } catch (e) { return null; }
    for (var i = 0; i < cands.length; i++) {
      var v = rgbaOf(cands[i]);
      if (!v || v[3] < 0.5) continue;
      var hi = Math.max(v[0], v[1], v[2]), lo = Math.min(v[0], v[1], v[2]);
      if (hi - lo < 56) continue;   // Sand/Ton der ausgeschalteten Kachel (z. B. 120,100,80) ist keine Gerätefarbe
      return 'rgb(' + Math.round(v[0]) + ',' + Math.round(v[1]) + ',' + Math.round(v[2]) + ')';
    }
    return null;
  }
  // Zweitonige Symbole (Apple-Stil, Zweitfläche mit geringer Deckkraft) zeigt der Ring
  // einfarbig: als Maske wurde die blasse Zweitfläche sonst ein Quadrat im Kreis.
  var MONO = {};
  // Grober Rahmen (x0,y0,x1,y1) einer Liste von Pfaden aus den Zahlen ihrer d-Attribute.
  function monoBox(tags) {
    var b = null;
    tags.forEach(function (t) {
      var d = /\bd="([^"]*)"/.exec(t);
      var n = d ? (d[1].match(/-?\d*\.?\d+/g) || []).map(parseFloat) : [];
      for (var i = 0; i + 1 < n.length; i += 2) {
        if (!b) b = [n[i], n[i + 1], n[i], n[i + 1]];
        b[0] = Math.min(b[0], n[i]); b[1] = Math.min(b[1], n[i + 1]);
        b[2] = Math.max(b[2], n[i]); b[3] = Math.max(b[3], n[i + 1]);
      }
    });
    return b;
  }
  function monoSvg(txt) {
    var low = 0, all = (txt.match(/<(path|circle|rect|ellipse|polygon)\b/g) || []).length;
    // Liegt die blasse Zweitfläche neben statt hinter der Hauptfläche (Saugroboter beim Reinigen:
    // Gerät blass, nur das Richtungsdreieck kräftig), ist sie Teil des Symbols und bleibt deckend.
    // Sonst blieb im Ring nur das kleine Dreieck stehen.
    var tags = txt.match(/<(path|circle|rect|ellipse|polygon)\b[^>]*>/g) || [];
    var lowOf = function (t) { var m = /\b(?:fill-opacity|opacity)="([0-9.]+)"/.exec(t); var n = m ? parseFloat(m[1]) : 1; return n > 0 && n < 0.5; };
    var bl = monoBox(tags.filter(lowOf));
    var bh = monoBox(tags.filter(function (t) { return !lowOf(t) && !/\bopacity="0"/.test(t); }));
    var apart = bl && bh && (bh[3] <= bl[1] || bl[3] <= bh[1] || bh[2] <= bl[0] || bl[2] <= bh[0]);
    var out = txt.replace(/\b(fill-opacity|opacity)="([0-9.]+)"/g, function (m, k, v) {
      var n = parseFloat(v);
      if (n > 0 && n < 0.5) { low++; return k + (apart ? '="0.85"' : '="0"'); }
      return m;
    });
    // Nur Zweitflächen ausblenden – bleibt nichts Deckendes übrig, das Original behalten.
    var zero = (txt.match(/\bopacity="0"/g) || []).length;
    return low && low + zero < all ? out : null;
  }
  function monoUrl(url, done) {
    if (!url) return url;
    if (MONO[url] !== undefined) return MONO[url] || url;
    var m = /^data:image\/svg\+xml(;base64)?,(.*)$/i.exec(url);
    if (m) {
      var txt;
      try { txt = m[1] ? atob(m[2]) : decodeURIComponent(m[2]); } catch (e) { MONO[url] = ''; return url; }
      var mono = monoSvg(txt);
      MONO[url] = mono ? 'data:image/svg+xml,' + encodeURIComponent(mono) : '';
      return MONO[url] || url;
    }
    if (/\.svg(\?|$)/i.test(url) && typeof fetch === 'function') {
      MONO[url] = '';
      fetch(url).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
        var mono = t && monoSvg(t);
        if (!mono) return;
        MONO[url] = 'data:image/svg+xml,' + encodeURIComponent(mono);
        if (done) done(MONO[url]);
      }).catch(function () {});
    }
    return url;
  }
  function ringFor(src, onGlyph) {
    if (!src || !src._config) return null;
    var tpl = [].concat(src._config.template || []).join(' ');
    var ent = (src._stateObj && src._stateObj.entity_id) || '';
    var key = (tpl + ' ' + ent).toLowerCase();
    // Heizung immer in Wärme-Orange (Farbsystem) – die Kachel trägt teils die Klima-Domänenfarbe.
    var hue = /thermostat|fbh|heiz|heat/.test(key) ? null : deviceHue(src);
    if (!hue) {
      hue = 'var(--casora-color-teal, #4E9E95)';
      for (var i = 0; i < RING_HUES.length; i++) {
        if (RING_HUES[i][0].test(key)) { hue = RING_HUES[i][1]; break; }
      }
    }
    // B-16: Der Ring zeigt einen Fehler (Druck fehlgeschlagen …) in Alarmfarbe statt in Gerätefarbe.
    var stv = String((src._stateObj && src._stateObj.state) || '').toLowerCase();
    if (/^(failed|failure|error|fault|fehler|fehlgeschlagen|problem)$/.test(stv)) hue = 'var(--casora-color-red, #D35A4E)';
    var ic = src.shadowRoot && src.shadowRoot.querySelector('#icon');
    var glyph = null;
    // Kachel, die ihr sichtbares Symbol selbst zeichnet (Kalender: Rahmen mit heutiger Tageszahl
    // als Maske, #icon ist nur der schlichte Rahmen): ein Popup-Modul nennt dafür eine Bild-URL,
    // damit der Ring dasselbe Symbol zeigt wie die Kachel.
    var ru = typeof window.casoraRingUrl === 'function' ? window.casoraRingUrl(src, key) : null;
    if (typeof ru === 'string' && ru) {
      ic = null;
      glyph = '<span class="g" style="--g:url(\'' + monoUrl(ru, onGlyph).replace(/['"\\]/g, '') + '\')"></span>';
    }
    var isrc = ic && ic.tagName === 'IMG' ? String(ic.getAttribute('src') || '') : '';
    // Nur Vektor-Symbole taugen als Maske – ein Foto (Albumcover der Medienkachel) wäre ein Rechteck.
    if (isrc && !/^data:image\/svg|\.svg(\?|$)/i.test(isrc)) {
      var vi = src._config.variables && src._config.variables.icon;
      isrc = (typeof vi === 'string' && /^[\w-]+$/.test(vi) && typeof window.casoraIconUrl === 'function') ? window.casoraIconUrl(vi) : '';
      if (!isrc && /^media_player\./.test(ent) && typeof window.casoraIconUrl === 'function') isrc = window.casoraIconUrl('media');
    }
    if (isrc) {
      var u = monoUrl(isrc, onGlyph);
      glyph = '<span class="g" style="--g:url(\'' + u.replace(/['"\\]/g, '') + '\')"></span>';
    } else if (ic && typeof ic.icon === 'string' && ic.icon) {
      glyph = '<ha-icon icon="' + ic.icon.replace(/[^\w:-]/g, '') + '"></ha-icon>';
    } else if (!glyph && src._config.icon && typeof src._config.icon === 'string' && src._config.icon.indexOf('[[[') < 0) {
      glyph = '<ha-icon icon="' + src._config.icon.replace(/[^\w:-]/g, '') + '"></ha-icon>';
    }
    // Kachel ohne eigenes Symbol (z. B. Now-Playing-Karte): Symbol aus variables.icon bzw. Medien-Symbol.
    if (!glyph && typeof window.casoraIconUrl === 'function') {
      var vi2 = src._config.variables && src._config.variables.icon;
      var nm = (typeof vi2 === 'string' && /^[\w-]+$/.test(vi2)) ? vi2 : (/media|now_playing/.test(key) ? 'media' : null);
      if (nm) glyph = '<span class="g" style="--g:url(\'' + monoUrl(window.casoraIconUrl(nm), onGlyph).replace(/['"\\]/g, '') + '\')"></span>';
    }
    // Kacheln ohne #icon (Thermostat-Puck): ein Popup-Modul darf ein Symbol nennen.
    if (!glyph && typeof window.casoraRingGlyph === 'function') {
      var rg = window.casoraRingGlyph(src, key);
      if (typeof rg === 'string' && rg) glyph = '<ha-icon icon="' + rg.replace(/[^\w:-]/g, '') + '"></ha-icon>';
    }
    // Thermostat-Kachel ohne Symbol (Puck): Thermometer wie im Entwurf, damit jeder Kopf einen Ring hat.
    if (!glyph && /thermostat|climate\./.test(key)) glyph = '<ha-icon icon="mdi:thermometer"></ha-icon>';
    // D-10: Alarm-Kopf in derselben Stufe wie die aktive Modus-Zeile (scharf = ok mit Schild-Haken,
    // nur ausgelöst = Gefahr) – vorher pauschal Rot mit „!“. Gleiche Entität wie das Popup.
    if (/\bcasora_alarm\b|alarm_control_panel\./.test(key) && window.casoraSecurityLevel && window.casoraSecurityColor
        && typeof window.casoraIconUrl === 'function') {
      var hA = src._hass || (document.querySelector('home-assistant') || {}).hass;
      var SA = (hA && hA.states) || {};
      var vA = src._config.variables && src._config.variables.alarm_entity;
      var aid = /^alarm_control_panel\./.test(ent) ? ent
        : (typeof vA === 'string' && SA[vA] ? vA : (SA['alarm_control_panel.alarmo'] ? 'alarm_control_panel.alarmo' : null));
      if (aid && SA[aid]) {
        var AIC = { disarmed: 'shield_off', armed_home: 'shield_check', armed_away: 'shield_lock', armed_night: 'shield_moon',
          armed_vacation: 'shield_vacation', armed_custom_bypass: 'shield_bypass', triggered: 'shield_alarm' };
        return { hue: window.casoraSecurityColor(window.casoraSecurityLevel(hA, [aid])),
          html: '<span class="g" style="--g:url(\'' + monoUrl(window.casoraIconUrl(AIC[SA[aid].state] || 'shield_marked'), onGlyph).replace(/['"\\]/g, '') + '\')"></span>',
          off: false };
      }
    }
    if (!glyph) return null;
    // Kachel meldet selbst Ruhe (z. B. NINA „Keine Warnung“ setzt _casoraRingQuiet): Sand wie die Kachel.
    var idle = src._casoraRingQuiet === true;
    return { hue: hue, html: glyph, off: idle || ringOff(src) };
  }
  // Aus-Zustand (Heizung aus, Gerät aus, nicht erreichbar …): Sand-Ring wie „Alle aus“ im Licht-Popup.
  function ringOff(src, hass) {
    // Sicherheits-Badges (05.10.2026): der Ring trägt immer die Stufenfarbe der Badge (Grün auch bei
    // verriegelt/geschlossen, Orange bei offline) statt Sand – sonst zeigte das Popup eine andere Farbe.
    if (src && src._config && /casora_badge_(security|contact_group|camera_group|lock_group)\b/.test([].concat(src._config.template || []).join(' '))
      && window.casoraSecurityLevel) return false;
    var so = src && src._stateObj;
    var id = so && so.entity_id;
    if (!id) return false;
    var h = hass || src._hass;
    var st = (h && h.states && h.states[id]) || so;
    // Ruhezustände, in denen auch die Kachel grau ist (Medien bereit, Sauger in der Station, zu, verriegelt).
    return /^(off|unavailable|unknown|standby|idle|docked|closed|locked)$/.test(String(st.state || ''));
  }

  var LIVE_SCAN_MS = 2000;

  function collectLive(root, out) {
    var nodes;
    try { nodes = root.querySelectorAll('[data-casora-live]'); } catch (e) { return out; }
    for (var i = 0; i < nodes.length; i++) out.push(nodes[i]);
    var kids;
    try { kids = root.querySelectorAll('*'); } catch (e) { return out; }
    for (var j = 0; j < kids.length; j++) {
      if (kids[j].shadowRoot) collectLive(kids[j].shadowRoot, out);
    }
    return out;
  }

  function refreshLive(root, hass, cache) {
    if (!root || !hass) return;
    // A popup with no live markers in its config never scans at all.
    if (cache && cache.none) return;
    var now = Date.now();
    if (!cache) {
      cache = { nodes: null, at: 0 };
    }
    if (!cache.nodes || now - cache.at > LIVE_SCAN_MS) {
      cache.nodes = collectLive(root, []);
      cache.at = now;
    }
    paintLive(cache.nodes, hass);
  }

  function paintLive(nodes, hass) {
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var st = hass.states[el.dataset.casoraEnt];
      if (!st && el.dataset.casoraLive !== 'fill' && el.dataset.casoraLive !== 'seg') continue;
      if (el.dataset.casoraLive === 'seg') { // Weich: aktives Segment folgt dem Mittelwert
        var gIds;
        try { gIds = JSON.parse(el.dataset.casoraEnts || '[]'); } catch (e) { continue; }
        var gAttr = el.dataset.casoraAttr || 'current_position', gSum = 0, gN = 0;
        for (var gi = 0; gi < gIds.length; gi++) {
          var gSt = hass.states[gIds[gi]];
          var gv = gSt ? Number((gSt.attributes || {})[gAttr]) : NaN;
          if (!isNaN(gv)) { gSum += gv; gN++; }
        }
        if (!gN) continue;
        var gAvg = String(Math.round(gSum / gN));
        var gKids = el.querySelectorAll('.hui-sg[data-v]');
        for (var gk = 0; gk < gKids.length; gk++) gKids[gk].classList.toggle('on', gKids[gk].dataset.v === gAvg);
        continue;
      }
      if (el.dataset.casoraLive === 'share') {
        var shSt = hass.states[el.dataset.casoraEnt];
        var shTot = hass.states[el.dataset.casoraTotal];
        if (!shSt || !shTot) continue;
        var shV = Number(shSt.state);
        var shT = Number(shTot.state);
        if (isNaN(shV) || isNaN(shT) || shT <= 0) { el.textContent = ''; continue; }
        var shPct = Math.round((shV / shT) * 100);
        el.textContent = shPct > 0
          ? shPct + (el.dataset.casoraSuffix || '%') : '';
        continue;
      }
      if (el.dataset.casoraLive === 'fill') {
        var fIds;
        try { fIds = JSON.parse(el.dataset.casoraEnts || '[]'); } catch (e) { continue; }
        var fAttr = el.dataset.casoraAttr || 'current_position';
        var fVals = [];
        for (var f = 0; f < fIds.length; f++) {
          var fSt = hass.states[fIds[f]];
          if (!fSt) continue;
          var fv = Number((fSt.attributes || {})[fAttr]);
          if (!isNaN(fv)) fVals.push(fv);
        }
        if (!fVals.length) continue;
        var fAvg = 0;
        for (var g = 0; g < fVals.length; g++) fAvg += fVals[g];
        fAvg = Math.max(0, Math.min(100, Math.round(fAvg / fVals.length)));
        if (el.dataset.casoraAxis === 'x') {
          if (el.parentNode && el.parentNode.classList.contains('drag')) continue;
          el.style.width = fAvg + '%';
          if (el.parentNode) {
            el.parentNode.querySelectorAll('.hui-sl-val').forEach(function (n) { n.textContent = fAvg + ' %'; });
            var fInk = el.parentNode.querySelector('.hui-sl-ink');
            if (fInk) fInk.style.clipPath = 'inset(0 ' + (100 - fAvg) + '% 0 0)';
          }
          continue;
        }
        el.style.height = (el.dataset.casoraInvert === '1' ? 100 - fAvg : fAvg) + '%';
        continue;
      }
      if (el.dataset.casoraLive === 'act') {
        var aspec;
        try { aspec = JSON.parse(el.dataset.casoraAct || '{}'); } catch (e) { continue; }
        var arules = aspec.rules || [];
        var atest = function (c) {
          var v = c.attr === 'state' ? st.state : (st.attributes || {})[c.attr];
          if (c.has !== undefined) {
            return String(v == null ? '' : v).toLowerCase()
              .indexOf(String(c.has).toLowerCase()) !== -1;
          }
          if (c.eq !== undefined) return v === c.eq;
          return !!v;
        };
        var apick = null;
        for (var ai = 0; ai < arules.length && !apick; ai++) {
          var ar = arules[ai];
          if (atest(ar) && (ar.and || []).every(atest)) apick = ar;
        }
        if (!apick) apick = aspec;
        var atxt = apick.text != null ? apick.text : '';
        var aat = el.querySelector('.hui-at');
        if (aat) {
          // 1.0.5: Knopf-Variante (.hui-actx) – Text, Symbol und Vorlese-Text getrennt setzen.
          aat.textContent = atxt;
          var aic = el.querySelector('.hui-ab ha-icon');
          if (aic) aic.setAttribute('icon', apick.icon || aspec.icon || '');
          el.setAttribute('aria-label', typeof window.casoraTr === 'function' ? window.casoraTr(atxt) : atxt);
        } else el.textContent = atxt;
        if (apick.color) el.style.color = apick.color;
        el.classList.toggle('hui-busy', !!apick.busy);
        el.style.display = apick.text === '' ? 'none' : '';
        continue;
      }
      if (el.dataset.casoraLive === 'prop') { // casora-local-patch: Live-CSS-Variable je Zustand
        var pspec;
        try { pspec = JSON.parse(el.dataset.casoraMap || '{}'); } catch (e) { continue; }
        var pval = pspec.state && Object.prototype.hasOwnProperty.call(pspec.state, st.state)
          ? pspec.state[st.state] : pspec.fallback;
        if (pval !== undefined && el.dataset.casoraProp) el.style.setProperty(el.dataset.casoraProp, pval);
        continue;
      }
      if (el.dataset.casoraLive === 'word') {
        var spec;
        try { spec = JSON.parse(el.dataset.casoraWords || '{}'); } catch (e) { continue; }
        var sw = spec.state && spec.state[st.state];
        if (sw) { el.textContent = sw; continue; }
        var av = Number((st.attributes || {})[spec.attr]);
        if (isNaN(av)) {
          var fw = spec.fallbackState && spec.fallbackState[st.state];
          if (fw) el.textContent = fw;
          continue;
        }
        av = Math.round(av);
        var ex = spec.exact && spec.exact[String(av)];
        el.textContent = ex != null ? ex
          : String(spec.tpl || '{n}').replace('{n}', String(av));
        continue;
      }
      var raw = el.dataset.casoraAttr === 'state'
        ? st.state : (st.attributes || {})[el.dataset.casoraAttr];
      var n = Number(raw);
      if (isNaN(n)) continue;
      if (el.dataset.casoraLive === 'bar') {
        el.style.width = Math.max(0, Math.min(100, n)) + '%';
      } else {
        el.textContent = Math.round(n) + (el.dataset.casoraSuffix || '');
      }
    }
  }

  class CasoraPopupHass extends HTMLElement {
    set hass(h) {
      this._hass = h;
      var t = this._targets || [];
      for (var i = 0; i < t.length; i++) { if (t[i]) t[i].hass = h; }
      var host = this.getRootNode && this.getRootNode();
      if (host) refreshLive(host, h, this._liveCache || (this._liveCache = {}));
      // Trennpunkte an Zeilenumbrüchen: nach dem Neuzeichnen der Karten nachmessen.
      if (host && window._casoraSepScan && !this._sepT) {
        this._sepT = setTimeout(() => { this._sepT = null; window._casoraSepScan(host); }, 250);
      }
      // Ring folgt dem Zustand, solange das Popup offen ist (Heizen ↔ Aus).
      var pop = host && host.host;
      if (pop && pop._ringSrc && pop._paintSoft && pop.hasAttribute('open')
        && ringOff(pop._ringSrc, h) !== !!pop._ringStOff) {
        pop._paintSoft(false);
        // Die Kachel rendert den neuen Zustand erst danach – Farbe/Leerlauf kurz darauf noch einmal lesen.
        setTimeout(function () { if (pop.hasAttribute('open')) pop._paintSoft(false); }, 700);
      }
    }
    get hass() { return this._hass; }
    set target(el) { this._targets = el ? [el] : []; }
    get target() { return (this._targets || [])[0] || null; }
    set targets(list) { this._targets = list || []; }
  }
  customElements.define('casora-popup-hass', CasoraPopupHass);

  class CasoraPopup extends HTMLElement {
    constructor() {
      super();
      var root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' + BASE_CSS + '</style><style id="dyn"></style>' +
        '<div class="scrim" part="scrim"></div>' +
        '<div class="layer">' +
          '<div class="surface" part="surface">' +
            '<div class="glass" part="glass"></div>' +
            '<div class="grab"><span></span></div>' +
            '<div class="header" hidden>' +
              '<div class="header-bar">' +
                '<section class="header-nav">' +
                  '<button class="header-close" type="button" aria-label="Schließen">' +
                    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
                      '<path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"></path>' +
                    '</svg>' +
                  '</button>' +
                '</section>' +
                '<section class="header-content">' +
                  '<div class="header-ring" hidden></div>' +
                  '<div class="header-eyebrow"></div>' +
                  '<div class="header-title"></div>' +
                '</section>' +
                '<section class="header-actions"></section>' +
              '</div>' +
            '</div>' +
            '<div class="content" tabindex="-1"><div class="container"></div>' +
              '<div class="extra" hidden></div><div class="soft-empty" hidden></div></div>' +
            '<div class="more" aria-hidden="true"></div>' +
            '<div class="rim" part="rim"></div>' +
            '<div class="keep" aria-hidden="true"></div>' +
            '<casora-popup-hass></casora-popup-hass>' +
          '</div>' +
        '</div>';

      this.scrim = root.querySelector('.scrim');
      this.surface = root.querySelector('.surface');
      this.container = root.querySelector('.container');
      this._extra = root.querySelector('.extra');
      this._softEmpty = root.querySelector('.soft-empty');
      this._softEmpty.addEventListener('click', () => {
        // Leerzustand: ins Casora Studio, dort wird der Kachel ein Gerät zugeordnet (nur Admins).
        if (!window.casoraIsAdmin()) return;
        this.close();
        history.pushState(null, '', '/casora-studio');
        window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      });
      this._extraCards = [];
      this.content = root.querySelector('.content');
      this._header = root.querySelector('.header');
      this._headerTitle = root.querySelector('.header-title');
      this._headerEyebrow = root.querySelector('.header-eyebrow');
      this._headerActions = root.querySelector('.header-actions');
      this._headerClose = root.querySelector('.header-close');
      this._headerContent = root.querySelector('.header-content');
      this._headerRing = root.querySelector('.header-ring');
      this._dyn = root.querySelector('#dyn');
      this._keep = root.querySelector('.keep');
      this._parked = new Map();
      this._bridge = root.querySelector('casora-popup-hass');

      this._dismissable = true;

      this._onKey = (e) => {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        e.stopPropagation();
        this.dismiss();
      };
      this._onNav = () => {
        if (location.pathname === this._navPath) return;
        var ha = document.querySelector('home-assistant');
        if (ha && ha.shadowRoot && ha.shadowRoot.querySelector('ha-more-info-dialog')) return;
        if (Date.now() - (this._miOpenedAt || 0) < 1000) return;
        this.close();
      };

      // Only a gesture that BEGAN on the scrim dismisses. A tap on a tile can
      // finish on the scrim: the tile re-renders while the tap is dispatching,
      // so the click lands on whatever is underneath. Timing flags have to win
      // that race; where the finger went down does not.
      this.scrim.addEventListener('pointerdown', () => { this._scrimDown = true; }, true);
      document.addEventListener('pointerdown', (e) => {
        if (e.target !== this.scrim) this._scrimDown = false;
      }, true);
      this.scrim.addEventListener('click', () => {
        var began = this._scrimDown;
        this._scrimDown = false;
        if (began) this.dismiss();
      });

      this.content.addEventListener('pointerdown', (e) => {
        this._bgTap = { x: e.clientX, y: e.clientY,
                        slop: e.pointerType === 'mouse' ? 10 : 24 };
      }, true);
      this.content.addEventListener('click', (e) => {
        if (!this._bgDismiss || !this._dismissable) return;
        var d = this._bgTap;
        this._bgTap = null;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > (d.slop || 10)) return;
        if (this._overWidget(e)) return;
        this.dismiss();
      });
      var closeTap = (e) => {
        var now = Date.now();
        if (now - (this._lastClose || 0) < 400) return;
        this._lastClose = now;
        e.preventDefault();
        e.stopPropagation();
        this.close();
      };
      this._headerClose.addEventListener('click', closeTap);
      this._headerClose.addEventListener('touchend', closeTap, { passive: false });
      this._bindSheetDrag(this.surface, root.querySelector('.grab'), this.content);

      /* Scroll-Hinweis: Attribut more-below nur, solange unten noch Inhalt liegt. */
      var moreCheck = () => {
        var c = this.content;
        if (!c || !this.hasAttribute('open')) return;
        var more = c.scrollHeight - c.scrollTop - c.clientHeight > 12;
        if (more !== this.hasAttribute('more-below')) this.toggleAttribute('more-below', more);
      };
      this._moreCheck = moreCheck;
      this.content.addEventListener('scroll', moreCheck, { passive: true });
      if (typeof ResizeObserver === 'function') {
        this._moreRO = new ResizeObserver(moreCheck);
        this._moreRO.observe(this.content);
        this._moreRO.observe(this.container);
      }
    }

    async open(data) {
      var cfg = data || {};
      var wasOpen = this.hasAttribute('open');
      // Gerät fehlt: Inhalt gar nicht erst bauen (bleibt ohnehin verborgen) – sonst melden Karten
      // ohne Entität Konfigurationsfehler in der Konsole (z. B. Diagramme ohne Datenreihe).
      if (this._src && missingEntityOf(this._src) && cfg.content && typeof cfg.content === 'object') {
        cfg = Object.assign({}, cfg, { content: { type: 'vertical-stack', cards: [] } });
      }

      this._dismissable = cfg.dismissable !== false;
      this._bgDismiss = cfg.dismiss_on_background === true;
      // Mehr-Baustein (UI.more): jedes Öffnen beginnt zugeklappt.
      window._casoraMoreOpen = {};

      var isCard = !!cfg.content && typeof cfg.content === 'object';
      this.toggleAttribute('card', isCard);
      this.toggleAttribute('flat', cfg.flat === true);
      var hasHeader = !!(cfg.title || cfg.eyebrow);
      this._headerTitle.textContent = cfg.title || '';
      this._headerEyebrow.textContent = cfg.eyebrow || '';
      this._headerClose.hidden = cfg.close === false;
      /* D-02: Bildschirmleser-Name in der Oberflächensprache (war fest „Close“) */
      this._headerClose.setAttribute('aria-label', window.casoraTr ? window.casoraTr('Schließen') : 'Schließen');
      // Weich: Ring aus der auslösenden Kachel. Gemerkt wird die Kachel, nicht das Ergebnis –
      // Farbe und Symbol werden bei jedem Öffnen und nach einem Theme-Wechsel neu gelesen.
      // Ein neues Popup ohne angetippte Kachel bekommt keinen fremden Ring.
      if (this._src) { this._ringSrc = this._src; this._ringLast = null; }
      else if (!wasOpen) { this._ringSrc = null; this._ringLast = null; }
      // Gerät fehlt: Die Kachel nennt eine Entität, die es (nicht mehr) gibt – z. B. nach einem Umzug
      // mit umbenannten Geräten. Dann zeigt jedes Popup statt Leere einen Hinweis (_checkEmpty).
      this._missingId = this._src ? missingEntityOf(this._src) : null;
      this._src = null;
      this._hasHeader = hasHeader;
      this._paintSoft(true);
      this._headerActions.textContent = '';
      this._dyn.textContent = this._dynamicCss(cfg);

      this.container.textContent = '';
      this._bridge.target = null;
      this.removeAttribute('data-casora-charts-ready');
      if (this._chartPoll) { clearTimeout(this._chartPoll); this._chartPoll = null; }

      if (!wasOpen) {
        this.setAttribute('open', '');
        requestAnimationFrame(() => { this.setAttribute('shown', ''); if (this._moreCheck) this._moreCheck(); });
        if (this._moreCheck) setTimeout(this._moreCheck, 700);
        // Pinned invisible, entrance replayed below once the cards are in.
        this._holdChrome();
        document.addEventListener('keydown', this._onKey, true);
        this._navPath = location.pathname;
        window.addEventListener('location-changed', this._onNav, true);
        window.addEventListener('popstate', this._onNav, true);
        this._prevOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
      }

      if (hasHeader && cfg.header_actions && typeof cfg.header_actions === 'object') {
        await this._buildCard(cfg.header_actions, this._headerActions);
      }

      if (isCard) await this._buildCard(cfg.content);
      else if (cfg.content) this.container.textContent = String(cfg.content);
      await this._buildExtra(isCard ? cfg.extra : null);

      if (!wasOpen) this._replayChrome();

      setTimeout(() => this._probe(), 900);   // after card_mod has landed
      // Trennpunkte an Zeilenumbrüchen (Statuszeile, Unterzeilen): sobald die Karten stehen.
      if (window._casoraSepScan) {
        var sr = this.shadowRoot;
        [0, 200, 700, 1600, 3200].forEach(function (ms) { setTimeout(function () { window._casoraSepScan(sr); }, ms); });
      }
      this._checkEmpty(true);

      this._gateOnCharts(isCard ? cfg.content : null);
    }


    // Fix-Runde 1 (B-10): Weich-Popup ohne Inhalt (Kachel ohne Gerät) zeigt eine Leerzeile in
    // Zeilenoptik statt nur des Kopfes. Geprüft kurz nach dem Aufbau und noch einmal später.
    _checkEmpty(fresh) {
      var box = this._softEmpty;
      if (!box) return;
      var tr = function (t) { return window.casoraTr ? window.casoraTr(t) : t; };
      var row = function (title, sub) {
        // Nicht-Admins: keine Zeile, die ins Studio führt (sie können es nicht öffnen) – ohne Pfeil.
        var admin = window.casoraIsAdmin();
        box.innerHTML = '<div class="se-row"' + (admin ? ' role="button" tabindex="0"' : ' style="cursor:default;"') + '>'
          + '<div class="se-ic"><ha-icon icon="mdi:link-variant-off"></ha-icon></div>'
          + '<div class="se-tx"><b></b><small></small></div>'
          + (admin ? '<svg class="se-chev" width="7" height="12" viewBox="0 0 7 12" aria-hidden="true"><path d="M1 1L6 6L1 11" fill="none" '
          + 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') + '</div>';
        box.querySelector('b').textContent = tr(title);
        box.querySelector('small').textContent = tr(sub);
        box._kind = title;
      };
      if (this._missingId) {
        // Gerät fehlt: sofort und in jedem Design (nicht nur Weich), der Inhalt bleibt verborgen.
        clearTimeout(this._emptyT1); clearTimeout(this._emptyT2);
        // Studio-Hinweis nur für Admins – andere können dort nichts zuordnen.
        row('Gerät fehlt', window.casoraIsAdmin() ? 'Im Casora Studio neu zuordnen' : 'Gerade nicht verfügbar');
        box.title = this._missingId;
        box.hidden = false;
        this.setAttribute('missing', '');
        this.setAttribute('soft-empty', '');
        return;
      }
      this.removeAttribute('missing');
      box.removeAttribute('title');
      var emptyKind = window.casoraIsAdmin() ? 'Noch kein Gerät zugeordnet' : 'Noch nicht eingerichtet';
      if (box._kind && box._kind !== emptyKind) { box.textContent = ''; box._kind = null; }
      if (fresh) {
        clearTimeout(this._emptyT1); clearTimeout(this._emptyT2);
        box.hidden = true; this.removeAttribute('soft-empty');
        this._emptyT1 = setTimeout(() => this._checkEmpty(false), 1200);
        this._emptyT2 = setTimeout(() => this._checkEmpty(false), 3500);
        return;
      }
      if (!this.hasAttribute('open')) return;
      var c = this.container, ex = this._extra;
      var used = 0;
      try {
        var kids = c ? c.children : [];
        for (var i = 0; i < kids.length; i++) used = Math.max(used, kids[i].getBoundingClientRect().height);
        if (ex && !ex.hidden) used += ex.getBoundingClientRect().height;
      } catch (e) { used = 99; }
      var empty = this.hasAttribute('soft') && used < 12;
      if (empty && !box.firstChild) row(emptyKind, emptyKind === 'Noch nicht eingerichtet' ? '' : 'Im Casora Studio dieser Kachel ein Gerät zuweisen');
      box.hidden = !empty;
      this.toggleAttribute('soft-empty', empty);
    }

    // Weich-Rahmen und Ring passend zum aktuellen Theme (beim Öffnen und bei Theme-Wechseln).
    _paintSoft(fresh) {
      var sf = !!(window._casoraSoft && window._casoraSoft(fresh));
      this.toggleAttribute('soft', sf);
      var ring = null;
      if (sf && this._ringSrc) {
        var self = this, src = this._ringSrc;
        ring = ringFor(src, function () { if (self._ringSrc === src) self._paintSoft(false); });
        if (ring) this._ringLast = ring;
        else ring = this._ringLast || null;
      }
      this._headerRing.hidden = !ring;
      var rh = ring ? ring.html : '';
      if (this._ringHtml !== rh) { this._ringHtml = rh; this._headerRing.innerHTML = rh; }
      if (ring) this._headerRing.style.setProperty('--ring', ring.hue);
      else this._headerRing.style.removeProperty('--ring');
      this._ringOffNow = !!(ring && ring.off);
      this._ringStOff = !!(ring && this._ringSrc && ringOff(this._ringSrc));
      this._headerRing.toggleAttribute('off', this._ringOffNow);
      this._header.hidden = !this._hasHeader && !ring;
    }

    _gateOnCharts(config) {
      if (this.hasAttribute('open')) this.setAttribute('data-casora-charts-ready', '');
      var hasChart = false;
      try { hasChart = JSON.stringify(config || '').indexOf('custom:apexcharts-card') > -1; }
      catch (e) { hasChart = false; }
      if (!hasChart) return;
      if (this._chartPoll) clearTimeout(this._chartPoll);
      this._chartPoll = setTimeout(() => {
        this._chartPoll = null;
        if (!this.hasAttribute('open')) return;
        (function walk(node) {
          if (!node || !node.querySelectorAll) return;
          node.querySelectorAll('*').forEach((el) => {
            if (el.tagName === 'APEXCHARTS-CARD' && !el.hasAttribute('data-casora-ready')) {
              el.setAttribute('data-casora-ready', 'timeout');
            }
            if (el.shadowRoot) walk(el.shadowRoot);
          });
        })(this.shadowRoot);
      }, CHART_WAIT_MAX);
    }

    _probe() {
      if (!/[?&]casoraprobe=1/.test(location.search)) return;
      var rows = [];
      var seen = new Set();
      var walk = (root, depth) => {
        if (!root || depth > 12 || seen.has(root)) return;
        seen.add(root);
        var els;
        try { els = root.querySelectorAll('*'); } catch (e) { return; }
        els.forEach((el) => {
          var cs, r;
          try { cs = getComputedStyle(el); r = el.getBoundingClientRect(); }
          catch (e) { return; }
          if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
          if (r.width * r.height < 20000) return;
          var bg = cs.backgroundColor || '';
          var bd = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
          var bl = cs.mixBlendMode || 'normal';
          var wc = cs.willChange || 'auto';
          var op = cs.opacity;
          var painted = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
          if (!painted && bd === 'none' && bl === 'normal' && wc === 'auto' && op === '1') return;
          rows.push([
            el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
              + (typeof el.className === 'string' && el.className.trim()
                  ? '.' + el.className.trim().split(/\s+/).join('.') : ''),
            Math.round(r.width) + 'x' + Math.round(r.height)
              + '@' + Math.round(r.left) + ',' + Math.round(r.top),
            painted ? 'bg=' + bg : '',
            bd !== 'none' ? 'backdrop=' + bd : '',
            bl !== 'normal' ? 'blend=' + bl : '',
            wc !== 'auto' ? 'wc=' + wc : '',
            op !== '1' ? 'opacity=' + op : '',
          ].filter(Boolean).join('  '));
        });
      };
      walk(this.shadowRoot, 0);
      var box = document.createElement('div');
      box.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;max-height:62vh;'
        + 'overflow:auto;z-index:2147483647;background:#000;color:#0f0;'
        + 'font:10px/1.35 ui-monospace,Menlo,monospace;padding:8px;white-space:pre-wrap;');
      box.textContent = 'CASORA PROBE  (' + rows.length + ' painting elements, tap to dismiss)\n\n'
        + rows.join('\n');
      box.addEventListener('click', function () { box.remove(); });
      document.body.appendChild(box);
    }

    // Positional, not path-based: composedPath fails on a retargeted event.
    _overWidget(ev) {
      var x = ev.clientX, y = ev.clientY;
      if (typeof x !== 'number' || typeof y !== 'number') return false;
      var box;
      try { box = this.content.getBoundingClientRect(); } catch (e) { return true; }
      if (!box || !box.width || !box.height) return true;
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) return true;
      var hit = false;
      (function walk(root) {
        if (hit || !root || !root.querySelectorAll) return;
        var all;
        try { all = root.querySelectorAll('*'); } catch (e) { return; }
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el.shadowRoot) walk(el.shadowRoot);
          if (hit) return;
          var r;
          try { r = el.getBoundingClientRect(); } catch (e) { continue; }
          if (!r.width || !r.height) continue;
          if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
          if (el.dataset && el.dataset.casoraNodismiss !== undefined) { hit = true; return; }
          if (el.classList && el.classList.contains('hui-plate')) { hit = true; return; }
          var cs;
          try { cs = window.getComputedStyle(el); } catch (e) { continue; }
          if (!cs || cs.visibility === 'hidden' || cs.display === 'none') continue;
          var bd = cs.backdropFilter || cs.webkitBackdropFilter;
          if (bd && bd !== 'none') { hit = true; return; }
          var m = /^rgba?\(([^)]+)\)/.exec(cs.backgroundColor || '');
          if (!m) continue;
          var parts = m[1].split(',');
          if ((parts.length > 3 ? parseFloat(parts[3]) : 1) > 0.01) { hit = true; return; }
        }
      })(this.content);
      return hit;
    }

    _parkedHas(el) {
      var found = false;
      this._parked.forEach(function (v) { if (v === el) found = true; });
      return found;
    }

    // animation-name before opacity, never the other way round.
    _holdChrome() {
      var els = [this._headerClose, this._headerContent, this._headerActions];
      for (var i = 0; i < els.length; i++) {
        if (!els[i]) continue;
        els[i].style.animationName = 'none';
        els[i].style.opacity = '0';
      }
    }

    _replayChrome() {
      var els = [this._headerClose, this._headerContent, this._headerActions];
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (!el) continue;
        el.style.animationName = 'none';
        el.style.opacity = '';
        // Read it back, or the two writes coalesce and nothing restarts.
        void el.offsetWidth;
        el.style.animationName = '';
      }
    }

    dismiss() {
      if (Date.now() < (window._casoraSuppressDismiss || 0)) return;
      if (this._dismissable) this.close();
    }

    close() {
      if (!this.hasAttribute('open') || this.hasAttribute('closing')) return;
      window._casoraMoreOpen = {};
      document.removeEventListener('keydown', this._onKey, true);
      window.removeEventListener('location-changed', this._onNav, true);
      window.removeEventListener('popstate', this._onNav, true);
      document.documentElement.style.overflow = this._prevOverflow || '';

      this.removeAttribute('shown');
      this.setAttribute('closing', '');

      var done = false;
      var finish = () => {
        if (done) return;
        done = true;
        this.removeAttribute('closing');
        this.removeAttribute('swipe-out');
        this.removeAttribute('open');
        this.removeAttribute('data-casora-charts-ready');
        this.removeAttribute('more-below');
        if (this._chartPoll) { clearTimeout(this._chartPoll); this._chartPoll = null; }
        this.surface.style.removeProperty('transform');
        this.surface.style.removeProperty('transition');
        var live = this.container.firstElementChild;
        if (live && this._keep && this._parkedHas(live)) this._keep.appendChild(live);
        this.container.textContent = '';
        this._extraTok = (this._extraTok || 0) + 1;
        this._extra.textContent = '';
        this._extra.hidden = true;
        this._extraCards = [];
        this._bridge.target = null;
        this._dyn.textContent = '';
        this.dispatchEvent(new CustomEvent('casora-popup-closed', { bubbles: true, composed: true }));
      };
      this.surface.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, 400);
    }

    _dynamicCss(cfg) {
      var out = ':host {\n' + (cfg.style || '') + '\n}\n';
      var list = Array.isArray(cfg.popup_styles) ? cfg.popup_styles : [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        if (!e || !e.styles) continue;
        var sel = (!e.style || e.style === 'all') ? ':host' : ':host([' + e.style + '])';
        out += sel + ' {\n' + retarget(e.styles) + '\n}\n';
      }
      return out;
    }

    async _buildCard(config, host) {
      var target = host || this.container;
      if (this._bridge) {
        var hasLive = false;
        try { hasLive = JSON.stringify(config || '').indexOf('data-casora-live') > -1; }
        catch (e) { hasLive = true; }
        this._bridge._liveCache = { none: !hasLive, nodes: null, at: 0 };
      }
      var key = null;
      try {
        var cfgStr = JSON.stringify(config || '');
        if (cfgStr.indexOf('custom:apexcharts-card') > -1) key = target === this.container ? cfgStr : null;
      } catch (e) { key = null; }
      if (key && this._parked.has(key)) {
        var kept = this._parked.get(key);
        if (kept && kept.isConnected) {
          kept.hass = (this._bridge.hass || (document.querySelector('home-assistant') || {}).hass);
          target.textContent = '';
          target.appendChild(kept);
          this._syncTargets();
          return;
        }
        this._parked.delete(key);
      }

      var helpers = await cardHelpers();
      if (!helpers || !this.hasAttribute('open')) return;

      var el;
      try {
        el = await helpers.createCardElement(config);
      } catch (err) {
        console.error('casora-popup: could not build the popup card', err);
        return;
      }
      if (!this.hasAttribute('open')) return;

      var ha = document.querySelector('home-assistant');
      if (ha && !this._bridge._provided) {
        this._bridge._provided = true;
        try { ha.provideHass(this._bridge); } catch (e) { this._bridge._provided = false; }
      }
      el.hass = (this._bridge.hass || (ha && ha.hass));

      el.addEventListener('ll-rebuild', () => {
        if (this.hasAttribute('open')) this._buildCard(config, target);
      }, { once: true });

      target.textContent = '';
      target.appendChild(el);
      this._syncTargets();
      if (key) {
        this._parked.set(key, el);
        // Two is enough to cover going back and forth between two popups.
        while (this._parked.size > 2) {
          var oldest = this._parked.keys().next().value;
          var drop = this._parked.get(oldest);
          this._parked.delete(oldest);
          if (drop && drop.parentNode) drop.parentNode.removeChild(drop);
        }
      }

      if (!customElements.get(el.localName)) {
        customElements.whenDefined(el.localName).then(() => {
          if (this.hasAttribute('open')) this._buildCard(config, target);
        });
      }
    }

    _syncTargets() {
      var list = [];
      var a = this.container.firstElementChild;
      var b = this._headerActions && this._headerActions.firstElementChild;
      if (a) list.push(a);
      if (b) list.push(b);
      (this._extraCards || []).forEach(function (c) { if (c) list.push(c); });
      this._bridge.targets = list;
    }

    // The tile's own cards under the popup (cfg.extra = {title, cards} from
    // window.casoraPopupExtras). Each is built on its own, so one broken card
    // shows HA's error card instead of taking the popup with it.
    async _buildExtra(extra) {
      var box = this._extra;
      if (!box) return;
      var tok = (this._extraTok = (this._extraTok || 0) + 1);
      box.textContent = '';
      box.hidden = true;
      this._extraCards = [];
      var cards = (extra && Array.isArray(extra.cards) ? extra.cards : [])
        .filter(function (c) { return c && typeof c === 'object' && !Array.isArray(c) && c.type; });
      if (!cards.length) { this._syncTargets(); return; }
      var helpers = await cardHelpers();
      if (!helpers || tok !== this._extraTok || !this.hasAttribute('open')) return;
      var ha = document.querySelector('home-assistant');
      var hass = this._bridge.hass || (ha && ha.hass);
      if (extra.title) {
        var h = document.createElement('div');
        h.className = 'extra-title';
        h.textContent = String(extra.title);
        box.appendChild(h);
      }
      var self = this;
      var build = async function (config, slot, i) {
        var el;
        try { el = await helpers.createCardElement(JSON.parse(JSON.stringify(config))); }
        catch (err) { console.error('casora-popup: could not build an extra card', err); return; }
        if (!el || tok !== self._extraTok || !self.hasAttribute('open')) return;
        el.hass = self._bridge.hass || hass;
        el.addEventListener('ll-rebuild', function () {
          if (tok === self._extraTok && self.hasAttribute('open')) build(config, slot, i);
        }, { once: true });
        slot.textContent = '';
        slot.appendChild(el);
        self._extraCards[i] = el;
        self._syncTargets();
      };
      cards.forEach(function (config, i) {
        var slot = document.createElement('div');
        slot.className = 'extra-card';
        box.appendChild(slot);
        build(config, slot, i);
      });
      box.hidden = false;
    }

    _isSheet() {
      try { return window.matchMedia('(max-width: ' + SHEET_MAX + 'px)').matches; }
      catch (e) { return window.innerWidth <= SHEET_MAX; }
    }

    _bindSheetDrag(surface, grab, content) {
      var y0 = 0, dy = 0, tracking = false, dragging = false;

      var start = (e) => {
        if (!this._isSheet() || !this._dismissable) return;
        var t = e.touches ? e.touches[0] : e;
        y0 = t.clientY;
        dy = 0;
        dragging = false;
        var onGrab = e.composedPath && e.composedPath().indexOf(grab) !== -1;
        tracking = onGrab || content.scrollTop <= 0;
      };

      var move = (e) => {
        if (!tracking) return;
        var t = e.touches ? e.touches[0] : e;
        var d = t.clientY - y0;
        if (!dragging) {
          if (d < -4) { tracking = false; return; }
          if (d < 8) return;
          dragging = true;
          surface.style.transition = 'none';
        }
        dy = Math.max(0, d);
        if (e.cancelable) e.preventDefault();
        surface.style.transform = 'translateY(' + dy + 'px)';
      };

      var end = () => {
        if (!tracking) return;
        var moved = dragging, traveled = dy;
        tracking = false;
        dragging = false;
        if (!moved) return;

        if (traveled > Math.min(120, surface.offsetHeight * 0.25)) {
          this.setAttribute('swipe-out', '');
          surface.style.transition = 'transform 200ms ease-in';
          surface.style.transform = 'translateY(100%)';
          setTimeout(() => this.close(), 170);
          return;
        }
        surface.style.transition = 'transform 240ms cubic-bezier(0.32, 0.72, 0, 1)';
        surface.style.transform = 'translateY(0)';
        setTimeout(() => {
          surface.style.removeProperty('transform');
          surface.style.removeProperty('transition');
        }, 260);
      };

      surface.addEventListener('touchstart', start, { passive: true });
      surface.addEventListener('touchmove', move, { passive: false });
      surface.addEventListener('touchend', end);
      surface.addEventListener('touchcancel', end);
    }
  }
  customElements.define('casora-popup', CasoraPopup);

  async function cardHelpers() {
    for (var i = 0; i < 120 && !window.loadCardHelpers; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return window.loadCardHelpers ? window.loadCardHelpers() : null;
  }

  function popupHost() {
    var ha = document.querySelector('home-assistant');
    return (ha && ha.shadowRoot) || document.body;
  }

  // Entität einer Kachel (button-card), die es in HA nicht gibt – sonst null. Nur echte IDs
  // („light.beispiel“), keine Vorlagen; ohne geladene Zustände nichts melden.
  function missingEntityOf(tile) {
    try {
      var cfg = tile && tile._config;
      var id = cfg && cfg.entity;
      if (typeof id !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(id)) return null;
      var ha = document.querySelector('home-assistant');
      var st = ha && ha.hass && ha.hass.states;
      if (!st || !Object.keys(st).length) return null;
      return st[id] ? null : id;
    } catch (e) { return null; }
  }

  var _el = null;
  function instance() {
    if (!_el) _el = document.createElement('casora-popup');
    var host = popupHost();
    if (_el.parentNode !== host) host.appendChild(_el);
    return _el;
  }

  // Hinweise „im Casora Studio zuordnen“ nur für Admins (nur sie öffnen das Studio). Unbekannt: wie bisher.
  window.casoraIsAdmin = function () {
    var ha = document.querySelector('home-assistant');
    var u = ha && ha.hass && ha.hass.user;
    return !u || u.is_admin !== false;
  };

  window.casoraPopupAction = function () {
    return window.casoraPopup ? 'fire-dom-event' : 'more-info';
  };

  // Every popup template carries extra: [[[ return window.casoraPopupExtras?.(this) ]]].
  // Read from the card's RAW config, not from `variables`: button-card evaluates a
  // variable deeply, so a pasted button-card's own [[[ ]]] would run in the tile's
  // context instead of its own.
  window.casoraPopupExtras = function (card) {
    var v = card && card._config && card._config.variables;
    var list = v && v.popup_extra_cards;
    if (!Array.isArray(list)) return null;
    var cards = list.filter(function (c) {
      return c && typeof c === 'object' && !Array.isArray(c) && typeof c.type === 'string';
    });
    if (!cards.length) return null;
    var title = typeof v.popup_extra_title === 'string' ? v.popup_extra_title.trim() : '';
    try { cards = JSON.parse(JSON.stringify(cards)); } catch (e) { return null; }
    return { title: title, cards: cards };
  };

  window.casoraPopup = {
    // src (optional): auslösende Kachel für den Weich-Ring, auch wenn das Popup-Element erst jetzt entsteht.
    open: function (data) {
      var el = instance();
      if (data && data.src) { el._src = data.src; data = Object.assign({}, data); delete data.src; }
      return el.open(data || {});
    },
    close: function () { if (_el) _el.close(); },
    moreInfo: function (entityId, view) {
      var ha = document.querySelector('home-assistant');
      if (!ha || !entityId) return;
      ha.dispatchEvent(new CustomEvent('hass-more-info', {
        bubbles: true, composed: true, detail: { entityId: entityId, view: view },
      }));
    },
    get element() { return _el; },
    get surface() { return _el && _el.hasAttribute('open') ? _el.surface : null; },
    get enabled() { return flagOn(); },
    setEnabled: function (on) {
      window.CASORA_POPUP = !!on;
      try { localStorage.setItem('casora_popup', on ? '1' : '0'); } catch (e) {}
    },
  };

  window.addEventListener('ll-custom', function (ev) {
    if (!flagOn()) return;
    var cfg = ev.detail && ev.detail.casora_popup;
    if (!cfg) return;
    // A tap that sets the mobile filter is not a tap that opens a popup. The
    // badge inherits its popup from casora_popup_base, and button-card merges a
    // card's tap_action over the template's rather than replacing it, so one
    // event can carry both intentions.
    if (ev.detail.casora_filter !== undefined) return;
    ev.stopPropagation();
    // Kachel, die das Popup öffnet – liefert im Weich-Design Symbol und Farbe des Rings.
    // button-card feuert ll-custom an home-assistant, die Kachel steht daher nicht im
    // Pfad; gemerkt wird die zuletzt angetippte Kachel (siehe unten).
    var lt = window._casoraLastTile;
    instance()._src = (lt && Date.now() - lt.at < 2000) ? lt.el : null;
    window.casoraPopup.open(cfg);
  }, true);
  // Gerät fehlt: Kacheln, die HAs eigenen Dialog öffnen (Bewegung, Person …), zeigten für eine
  // Entität, die es nicht gibt, einen leeren HA-Dialog. Stattdessen das Casora-Popup mit dem Hinweis.
  window.addEventListener('hass-more-info', function (ev) {
    if (!flagOn()) return;
    var id = ev.detail && ev.detail.entityId;
    var lt = window._casoraLastTile;
    if (!id || !lt || Date.now() - lt.at > 2000 || missingEntityOf(lt.el) !== id) return;
    ev.stopPropagation();
    var nameEl = lt.el.shadowRoot && lt.el.shadowRoot.querySelector('#name');
    var title = (nameEl && nameEl.textContent.trim()) || '';
    instance()._src = lt.el;
    window.casoraPopup.open({ title: title, content: { type: 'vertical-stack', cards: [] } });
  }, true);
  var noteTile = function (ev) {
    var path = (ev.composedPath && ev.composedPath()) || [];
    for (var i = 0; i < path.length; i++) {
      if (path[i] && path[i].tagName === 'BUTTON-CARD') {
        window._casoraLastTile = { el: path[i], at: Date.now() };
        return;
      }
    }
  };
  document.addEventListener('pointerdown', noteTile, { capture: true, passive: true });
  document.addEventListener('click', noteTile, { capture: true, passive: true });
})();

(function () {
  if (window._casoraDialogChrome) return;
  window._casoraDialogChrome = true;

  var MARK = '_casoraChrome';

  var SHEET_RADIUS =
    ':host([placement="bottom"]) dialog {' +
    '  border-start-start-radius: var(--casora-sheet-radius, 24px) !important;' +
    '  border-start-end-radius: var(--casora-sheet-radius, 24px) !important;' +
    '}';

  var GRAIN = `
    dialog { isolation: isolate; }
    dialog::before, dialog::after {
      content: var(--casora-dialog-grain-content, none); position: absolute; inset: 0; border-radius: inherit;
      pointer-events: none; background-size: 180px 180px;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='discrete' tableValues='1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    dialog::before { mix-blend-mode: overlay; opacity: var(--casora-popup-grain, 0.10); }
    dialog::after  { mix-blend-mode: screen;  opacity: var(--casora-popup-grain-dark, 0.04); }
  `;

  var NO_ENTRANCE =
    'dialog::backdrop { animation: none !important; transition: none !important; }';

  var STACKED_SCRIM =
    ':host([casora-stacked]) dialog::backdrop {' +
    '  background-color: var(--casora-stacked-scrim, transparent) !important;' +
    '  background-image: none !important;' +
    '  backdrop-filter: var(--casora-stacked-scrim-backdrop, none) !important;' +
    '  -webkit-backdrop-filter: var(--casora-stacked-scrim-backdrop, none) !important;' +
    '}';

  var DRAWER_SLIDE =
    '@keyframes casora-drawer-in { from { translate: 0 100%; } to { translate: 0 0; } }' +
    ':host([placement="bottom"]) dialog { animation-name: casora-drawer-in !important; }';

  var CSS_BY_HOST = {
    'wa-dialog':
      'dialog {' +
      '  margin-block-start: var(--casora-popup-top, 112px) !important;' +
      '  max-block-size: calc(100dvh - var(--casora-popup-top, 112px)' +
      '                  - var(--casora-dialog-bottom-gap, 16px)) !important;' +
      '}' + NO_ENTRANCE + STACKED_SCRIM + GRAIN,
    'wa-drawer': NO_ENTRANCE + STACKED_SCRIM + DRAWER_SLIDE + SHEET_RADIUS + GRAIN,
  };

  // The sidebar is a wa-drawer too; only the bottom sheet counts as a dialog.
  function isDialogHost(el) {
    if (!el || !CSS_BY_HOST[el.localName]) return false;
    return el.localName !== 'wa-drawer' || el.getAttribute('placement') === 'bottom';
  }

  function injectInto(el) {
    if (!el || el[MARK] || !el.shadowRoot) return false;
    if (!isDialogHost(el)) return false;
    el[MARK] = true;
    var css = CSS_BY_HOST[el.localName];
    var st = document.createElement('style');
    st.textContent = css;
    el.shadowRoot.appendChild(st);
    return true;
  }

  function inject(root, depth) {
    if (!root || depth > 12 || !root.querySelectorAll) return;
    root.querySelectorAll('*').forEach(function (el) {
      if (CSS_BY_HOST[el.localName]) injectInto(el);
      if (el.shadowRoot) inject(el.shadowRoot, depth + 1);
    });
  }

  function sweep() { inject(document, 0); }

  function patchShowModal() {
    var P = window.HTMLDialogElement && HTMLDialogElement.prototype;
    if (!P || P._casoraPatched) return;
    P._casoraPatched = true;
    var orig = P.showModal;
    P.showModal = function () {
      try {
        var root = this.getRootNode();
        if (root && root.host && isDialogHost(root.host)) {
          injectInto(root.host);
          var hp = window.casoraPopup && window.casoraPopup.element;
          root.host.toggleAttribute('casora-stacked', !!(hp && hp.hasAttribute('open')));
        }
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }

  function patchClass() {
    if (!window.customElements || !customElements.whenDefined) return;
    customElements.whenDefined('wa-dialog').then(function () {
      var C = customElements.get('wa-dialog');
      if (!C || C.prototype._casoraPatched) return;
      C.prototype._casoraPatched = true;
      var orig = C.prototype.connectedCallback;
      C.prototype.connectedCallback = function () {
        if (orig) orig.apply(this, arguments);
        var self = this;
        if (injectInto(self)) return;
        requestAnimationFrame(function () { injectInto(self); });
        [0, 8, 30, 120].forEach(function (d) {
          setTimeout(function () { injectInto(self); }, d);
        });
      };
    }).catch(function () {});
  }

  function boot() {
    var ha = document.querySelector('home-assistant');
    if (!ha || !ha.shadowRoot) { setTimeout(boot, 200); return; }
    new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        for (var j = 0; j < recs[i].addedNodes.length; j++) {
          var n = recs[i].addedNodes[j];
          if (n.localName && /-dialog$/.test(n.localName)) {
            [0, 30, 120, 300].forEach(function (d) { setTimeout(sweep, d); });
            return;
          }
        }
      }
    }).observe(ha.shadowRoot, { childList: true });
    patchShowModal();
    patchClass();
    sweep();
  }

  // A backdrop-filter's first paint builds its texture, so it cannot be animated from nothing.
  var WARM = ['--casora-scrim-backdrop, blur(6px) saturate(1.35)'];

  function warmFilter() {
    try {
      WARM.forEach(function (f, i) {
        var w = document.createElement('div');
        w.style.cssText =
          'position:fixed;left:' + i + 'px;bottom:0;width:1px;height:1px;'
          + 'z-index:0;pointer-events:none;'
          + 'backdrop-filter:var(' + f + ');'
          + '-webkit-backdrop-filter:var(' + f + ');';
        document.body.appendChild(w);
        w.getBoundingClientRect();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { w.remove(); });
        });
      });
    } catch (e) {}
  }

  patchShowModal();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { boot(); warmFilter(); });
  } else {
    boot();
    warmFilter();
  }
})();

(function () {
  if (window._casoraUI) return;

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var T = {
    ink:  'var(--casora-popup-tiles-text-primary, #fff)',
    ink2: 'var(--casora-popup-tiles-text-secondary, rgba(255,255,255,0.56))',
    ink3: 'var(--casora-popup-ui-tertiary, rgba(255,255,255,0.42))',
    fill: 'var(--casora-popup-ui-fill, rgba(255,255,255,0.06))',
    fill2:'var(--casora-popup-ui-fill-2, rgba(255,255,255,0.10))',
    div:  'var(--casora-popup-ui-divider, rgba(255,255,255,0.08))',
    blue: 'var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0))',
    green:'var(--casora-popup-ui-good, #30D158)',
    amber:'var(--casora-popup-ui-warn, #FF9F0A)',
    red:  'var(--casora-popup-ui-bad, #FF453A)',
    accent: 'var(--casora-popup-ui-accent, var(--casora-color-teal, #00C3D0))',
    font: 'var(--primary-font-family, system-ui)',
    controlH: 314,
    controlW: 120,
  };

  var tone = function (t) {
    return t === 'good' ? T.green : t === 'warn' ? T.amber : t === 'bad' ? T.red
      : t === 'accent' ? T.accent : null;
  };

  // ── Weich-Bausteine (01.10.2026) ──────────────────────────────────────────
  // Das Theme schaltet die Gestaltung um: --casora-popup-layout: soft (theme_weich.yaml).
  // Ohne den Wert liefern alle Bausteine exakt das bisherige HTML. Gelesen wird höchstens
  // alle 400 ms (ein Render baut viele Bausteine kurz hintereinander).
  var softAt = 0, softOn = false;
  function soft(fresh) {
    var now = Date.now();
    if (fresh || now - softAt > 400) {
      softAt = now;
      try {
        softOn = getComputedStyle(document.documentElement)
          .getPropertyValue('--casora-popup-layout').trim() === 'soft';
      } catch (e) { softOn = false; }
    }
    return softOn;
  }
  window._casoraSoft = soft;
  // Theme-Wechsel bei offenem Popup: Rahmen (soft) und Ring sofort nachziehen, statt den
  // Ring des vorigen Themes stehen zu lassen. HA setzt Themes als Stil auf <html>.
  if (typeof MutationObserver === 'function' && !window._casoraSoftWatch) {
    window._casoraSoftWatch = true;
    var softT = null;
    new MutationObserver(function () {
      if (softT) clearTimeout(softT);
      softT = setTimeout(function () {
        softT = null;
        soft(true);
        var el = window.casoraPopup && window.casoraPopup.element;
        if (el && el.hasAttribute('open') && el._paintSoft) el._paintSoft(false);
      }, 120);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  }
  var S = {
    label: 'var(--casora-soft-label, ' + T.ink2 + ')',
    sub: 'var(--casora-soft-sub, ' + T.ink2 + ')',
    row: 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))',
    rowHover: 'var(--casora-soft-row-hover, rgba(140,115,90,0.11))',
    rowPress: 'var(--casora-soft-row-press, rgba(140,115,90,0.16))',
    ctl: 'var(--casora-soft-control-fill, rgba(140,115,90,0.10))',
    iconOff: 'var(--casora-soft-icon-off, rgba(140,115,90,0.12))',
    glyphOff: 'var(--casora-soft-glyph-off, rgba(58,50,43,0.55))',
    glyph: 'var(--casora-soft-glyph, #fff)',
    radius: 'var(--casora-popup-row-radius, 24px)',
  };
  // Abschnitts-Etikett: klein, Großbuchstaben, Laufweite (HELLIGKEIT, LEUCHTEN IM RAUM).
  function softLabel(text, action) {
    var out = '<div class="hui-slbl" style="font-family:' + T.font + ';display:flex;align-items:baseline;'
      + 'justify-content:space-between;gap:12px;margin:0 6px 10px;">'
      + '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;'
      + 'color:' + S.label + ';">' + esc(text) + '</div>';
    if (action && action.text) {
      out += '<div class="hui-ga" style="font-size:13px;font-weight:600;'
        + 'color:' + (tone(action.tone) || T.blue) + ';cursor:pointer;white-space:nowrap;"'
        + (action.svc ? ' data-casora-svc="' + esc(JSON.stringify(action.svc)) + '"' : '')
        + '>' + esc(action.text) + '</div>';
    }
    return out + '</div>';
  }

  // Fix-Runde 1 (B-01): genau eine Statuszeile unter dem Titel – Zustand 17/700 in Text 1
  // (Farbe nur bei Warnung/Fehler), dahinter Meta 15/500 in Text 2, durch „·“ getrennt.
  function softHeadline(o) {
    var rest = o.caption ? [o.caption] : (o.meta ? [o.meta] : []);
    var lineO = { tone: o.stateTone, slotId: (o.captionSlot && !o.caption) ? o.captionId : null };
    if (o.barTitle) return softLine(o.state, rest, lineO);
    var out = '<div style="font-family:' + T.font + ';text-align:center;'
      + 'padding:' + (o.padTop != null ? o.padTop : 0) + 'px 8px 8px;">'
      + '<div style="font-size:28px;font-weight:800;letter-spacing:-0.025em;line-height:1.15;'
      + 'color:' + T.ink + ';">' + esc(o.title || '') + '</div></div>';
    return out + (o.state || rest.length ? softLine(o.state, rest, lineO) : '');
  }

  // Weich: Farbe nur für Warnung und Fehler (B-16), „gut“/Akzent bleiben neutral.
  function alertTone(t) { return (t === 'warn' || t === 'bad') ? tone(t) : null; }

  // Statuszeile: Zustand fett und dunkel, Rest gedämpft, dicht unter dem Titel.
  // rest: Texte oder { text, tone } (Ton nur für Warnung/Fehler).
  function softLine(main, rest, o) {
    o = o || {};
    var bits = (Array.isArray(rest) ? rest : [rest]).filter(function (x) {
      return x != null && x !== '' && !(typeof x === 'object' && !x.text);
    });
    var out = '<div class="hui-line" style="font-family:' + T.font + ';text-align:center;'
      + 'padding:0 8px var(--casora-soft-line-gap, 4px);margin-top:-4px;'
      + 'font-size:15px;font-weight:500;line-height:1.45;text-wrap:balance;overflow-wrap:anywhere;color:' + S.sub + ';">'
      + (main ? '<span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;color:' + (alertTone(o.tone) || T.ink) + ';">' + esc(main) + '</span>' : '');
    bits.forEach(function (b, i) {
      var txt = typeof b === 'object' ? b.text : b;
      var ink = typeof b === 'object' ? alertTone(b.tone) : null;
      var open = '<span' + (ink ? ' style="color:' + ink + ';"' : '') + '>';
      /* Jeder Trennpunkt ist ein eigenes Element (auch „ · “ innerhalb eines Textes): bricht
         die Zeile daran um, blendet sepFix ihn aus und setzt dort einen Zeilenumbruch –
         weder Zeilenende noch Zeilenanfang zeigen „·“ (03.10.2026, ersetzt das geschützte
         Leerzeichen vor dem Punkt). */
      out += ((main || i) ? SEP : '')
        // „ · “ im Text bleibt in Textfarbe (nicht gedämpft) – wie bisher.
        + String(txt).split(' · ').map(function (t) { return open + esc(t) + '</span>'; })
          .join('<span class="hui-sep"' + (ink ? ' style="color:' + ink + ';"' : '') + '> · </span>');
    });
    if (o.slotId || o.slotClass) {
      out += '<span class="hui-lslot' + (o.slotClass ? ' ' + esc(o.slotClass) : '') + '"'
        + (o.slotId ? ' id="' + esc(o.slotId) + '"' : '') + '>' + esc(o.slotText || '') + '</span>';
    }
    (o.after || []).forEach(function (b) {
      if (b) out += SEP + '<span>' + esc(b) + '</span>';
    });
    if (o.chip && o.chip.text) {
      out += '<div><span style="display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;'
        + 'font-weight:600;padding:7px 13px;border-radius:999px;background:' + S.row + ';color:'
        + (tone(o.chip.tone) || T.ink2) + ';"><span style="width:7px;height:7px;border-radius:50%;'
        + 'background:currentColor;"></span>' + esc(o.chip.text) + '</span></div>';
    }
    return '<style>.hui-lslot:not(:empty)::before{content:"\\00a0· ";opacity:.6;}' + SEP_CSS + '</style>' + out + '</div>';
  }
  var SEP = '<span class="hui-sep" style="opacity:.6;"> · </span>';
  var SEP_CSS = '.hui-sep.hui-cut,.hui-lslot.hui-cut::before{display:none!important;content:none!important;}'
    + '.hui-sub2.hui-cut{display:block!important;}.hui-sub2.hui-cut::before{content:none!important;}';

  // Trennpunkte an Zeilenumbrüchen (03.10.2026): Bricht eine Statuszeile (.hui-line, Licht-Popup
  // .lps-s) an einem „·“ um, verschwindet der Punkt und an seiner Stelle steht ein echter
  // Zeilenumbruch – so springt das nächste Wort nicht in die erste Zeile zurück. Unterzeilen in
  // Zeilen (.hui-sub2, Punkt per ::before): rutscht sie in eine neue Zeile, fällt der Punkt weg
  // und sie steht als eigener Block darunter. Gemessen wird der Punkt selbst (Range) gegen das
  // Ende des Textes davor und den Anfang danach – in Chrome und WebKit gleich. Die Popup-Hülle
  // ruft sepScan beim Öffnen und nach Zustandswechseln; je Zeile misst ein ResizeObserver nach.
  function rectsOf(node) {
    try {
      if (node.nodeType === 3) { var r = document.createRange(); r.selectNodeContents(node); return r.getClientRects(); }
      return node.getClientRects();
    } catch (e) { return []; }
  }
  function edgeRect(el, last) {
    // Erstes bzw. letztes sichtbares Stück Text neben dem Trenner (Leerzeichen zählen nicht).
    var n = el;
    while (n) {
      if (n.nodeType === 3 ? /\S/.test(n.nodeValue) : !(n.classList && n.classList.contains('hui-cut'))
        && n.nodeName !== 'BR' && n.nodeName !== 'STYLE') {
        var rs = rectsOf(n);
        if (rs.length) return rs[last ? rs.length - 1 : 0];
      }
      n = last ? n.previousSibling : n.nextSibling;
    }
    return null;
  }
  function dotRect(sep) {
    var t = sep.firstChild;
    if (!t || t.nodeType !== 3) return null;
    var i = t.nodeValue.indexOf('·');
    if (i < 0) return null;
    try { var r = document.createRange(); r.setStart(t, i); r.setEnd(t, i + 1); var rs = r.getClientRects(); return rs.length ? rs[0] : null; } catch (e) { return null; }
  }
  function sepFixLine(el) {
    var old = el.querySelectorAll('br.hui-sepbr');
    for (var i = 0; i < old.length; i++) old[i].remove();
    var cut = el.querySelectorAll('.hui-cut');
    for (var j = 0; j < cut.length; j++) cut[j].classList.remove('hui-cut');
    if (!el.getClientRects().length) return;
    var seps = el.querySelectorAll('.hui-sep, .hui-lslot');
    for (var k = 0; k < seps.length; k++) {
      var sp = seps[k], cutIt = false, d, p, n;
      if (sp.classList.contains('hui-lslot')) {
        if (!sp.textContent) continue;
        // Punkt per ::before vor dem Slot-Text: Steht der Slot-Anfang (Punkt) nicht in der Zeile
        // des Textes davor oder nicht in der Zeile des Slot-Textes, liegt der Umbruch am Punkt.
        var srs = sp.getClientRects();
        p = edgeRect(sp.previousSibling, true);
        n = edgeRect(sp.firstChild, false);
        d = srs.length ? srs[0] : null;
        if (d && p && n) cutIt = Math.abs(d.top - p.top) > d.height / 2 || Math.abs(n.top - d.top) > d.height / 2;
        if (cutIt) { sp.classList.add('hui-cut'); sp.before(Object.assign(document.createElement('br'), { className: 'hui-sepbr' })); }
        continue;
      }
      d = dotRect(sp);
      p = edgeRect(sp.previousSibling, true);
      n = edgeRect(sp.nextSibling, false);
      if (!d || !p || !n) continue;
      if (Math.abs(d.top - p.top) > d.height / 2 || Math.abs(n.top - d.top) > d.height / 2) {
        sp.classList.add('hui-cut');
        sp.after(Object.assign(document.createElement('br'), { className: 'hui-sepbr' }));
      }
    }
  }
  function sepFixSubs(box) {
    var subs = box.querySelectorAll(':scope > .hui-sub2');
    for (var i = 0; i < subs.length; i++) subs[i].classList.remove('hui-cut');
    for (var j = 0; j < subs.length; j++) {
      var s = subs[j], prev = s.previousElementSibling;
      if (!prev || !/\bhui-sub\b/.test(prev.className)) continue;
      // Nur wo der Punkt überhaupt gezeichnet wird (Handy-Zeilen stehen ohnehin untereinander).
      if (getComputedStyle(s, '::before').content === 'none' || getComputedStyle(s).display === 'block') continue;
      var a = prev.getBoundingClientRect(), b = s.getBoundingClientRect();
      if (b.height && Math.abs(b.top - a.top) > b.height / 2) s.classList.add('hui-cut');
    }
  }
  function sepSig(el) { return el.clientWidth + '|' + el.textContent; }
  function sepFix(el) {
    var sig = sepSig(el);
    if (el._casoraSepSig === sig) return;
    if (el.classList.contains('hui-subs')) sepFixSubs(el); else sepFixLine(el);
    el._casoraSepSig = sepSig(el);
  }
  function sepWire(el) {
    if (!el._casoraSepRO && typeof ResizeObserver === 'function') {
      el._casoraSepRO = new ResizeObserver(function () { sepFix(el); });
      el._casoraSepRO.observe(el);
    }
    sepFix(el);
  }
  function sepScan(root) {
    if (!root || !root.querySelectorAll) return;
    var all;
    try { all = root.querySelectorAll('*'); } catch (e) { return; }
    for (var i = 0; i < all.length; i++) {
      var e = all[i];
      if (e.shadowRoot) sepScan(e.shadowRoot);
      var c = e.classList;
      if (!c) continue;
      if ((c.contains('hui-line') || c.contains('lps-s')) && e.querySelector('.hui-sep, .hui-lslot')) sepWire(e);
      else if (c.contains('hui-sub2') && e.parentElement && !e.parentElement._casoraSepSubs) {
        e.parentElement._casoraSepSubs = true;
        e.parentElement.classList.add('hui-subs');
        sepWire(e.parentElement);
      } else if (c.contains('hui-sub2') && e.parentElement) sepFix(e.parentElement);
    }
  }
  window._casoraSepScan = sepScan;

  // Mittiger Hero = dieselbe Statuszeile: Wert (+ Einheit) fett, dann Unterzeile, dann das
  // Etikett (meist der Raum) als Meta – kein zweites Format mit VERSALIEN-Raum und 19er-Wert.
  function softHero(o) {
    var main = (o.value == null ? '' : String(o.value)) + (o.unit ? ' ' + o.unit : '');
    var rest = [];
    if (o.sub) rest.push({ text: o.sub, tone: o.subTone });
    if (!o.line && o.label) rest.push(o.label);
    return softLine(main, rest, { tone: o.valueTone, chip: o.chip });
  }

  function headline(o) {
    o = o || {};
    if (o.barTitle && !o.state) return '';
    if (soft()) return softHeadline(o);
    var out = '<div style="font-family:' + T.font + ';text-align:center;'
      + 'padding:' + (o.padTop != null ? o.padTop : 2) + 'px 8px '
      + (o.barTitle ? ((o.caption != null || o.captionSlot) ? 3 : 10) : 18)
      + 'px;">';
    if (!o.barTitle) {
      out += '<div style="font-size:clamp(28px, 4.2vw, 38px);font-weight:700;'
        + 'letter-spacing:-0.02em;line-height:1.1;color:' + T.ink + ';">'
        + esc(o.title || '') + '</div>';
    }
    if (o.state) {
      var sheet = o.measure === 'sheet';
      out += '<div style="font-size:' + (sheet ? '22px' : 'clamp(17px, 2.1vw, 21px)')
        + ';font-weight:400;letter-spacing:' + (sheet ? '-0.5px' : '-0.01em')
        + ';margin-top:3px;color:'
        + (tone(o.stateTone) || (sheet ? T.ink : T.ink2)) + ';">'
        + esc(o.state) + '</div>';
    }
    if (o.caption != null || o.captionSlot) {
      out += '<div' + (o.captionId ? ' id="' + esc(o.captionId) + '"' : '')
        + ' style="font-size:' + (o.measure === 'sheet' ? '15px' : '14px')
        + ';font-weight:400;letter-spacing:-0.006em;'
        + 'margin-top:5px;min-height:18px;color:' + T.ink3 + ';'
        + 'transition:opacity .3s ease;opacity:' + (o.caption ? '1' : '0') + ';">'
        + esc(o.caption || '') + '</div>';
    }
    return out + '</div>';
  }

  function hero(o) {
    o = o || {};
    if (o.center && !o.compact && soft()) return softHero(o);
    if (o.compact) {
      var cInk = tone(o.subTone);
      var out = '<div style="font-family:' + T.font + ';text-align:left;'
        + 'display:flex;align-items:flex-start;justify-content:space-between;'
        + 'gap:12px;padding:2px 2px 10px;">'
        + '<div style="display:flex;flex-direction:column;gap:1px;min-width:0;">';
      // Weich: Etikett in Großbuchstaben, Wert fett – wie die Abschnitts-Etiketten.
      var cs = soft();
      if (o.label) {
        out += '<div style="font-size:' + (cs ? '12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px;'
            : 'var(--casora-popup-hero-label-size, 13px);letter-spacing:-0.01em;')
          + 'color:' + (cs ? S.label : T.ink2) + ';">'
          + esc(o.label) + '</div>';
      }
      out += '<div style="font-size:var(--casora-popup-hero-value-size,'
        + ' clamp(21px, 3.4vw, 28px));font-weight:' + (cs ? '700' : '600') + ';letter-spacing:-0.02em;'
        + 'line-height:1.1;min-width:0;color:' + T.ink + ';">' + esc(o.value);
      if (o.unit) {
        out += '<span style="font-size:var(--casora-popup-hero-unit-size,'
          + ' clamp(13px, 1.9vw, 17px));font-weight:400;letter-spacing:0;'
          + 'color:' + T.ink2 + ';"> ' + esc(o.unit) + '</span>';
      }
      out += '</div>';
      if (o.sub) {
        out += '<div style="font-size:13px;margin-top:2px;color:'
          + (cInk || T.ink2) + ';">' + esc(o.sub) + '</div>';
      }
      out += '</div>';
      if (o.trailing) {
        out += '<div style="flex:none;text-align:right;white-space:nowrap;'
          + 'display:flex;flex-direction:column;gap:1px;">';
        if (o.trailingLabel) {
          out += '<div style="font-size:' + (cs ? '12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:3px;'
              : 'var(--casora-popup-hero-label-size, 13px);letter-spacing:-0.01em;')
            + 'color:' + (cs ? S.label : T.ink3) + ';">'
            + esc(o.trailingLabel) + '</div>';
        }
        out += '<div style="font-size:17px;font-weight:600;letter-spacing:-0.01em;'
          + 'color:' + T.ink2 + ';">' + esc(o.trailing) + '</div></div>';
      }
      return out + '</div>';
    }
    var c = !!o.center;
    var left = '<div style="display:flex;flex-direction:column;min-width:0;max-width:100%;'
      + 'gap:' + (c ? '6px' : '2px') + ';'
      + (c ? 'align-items:center;text-align:center;' : '') + '">';
    if (o.label) {
      left += '<div style="font-size:15px;font-weight:400;letter-spacing:-0.01em;'
        + 'color:' + T.ink2 + ';">' + esc(o.label) + '</div>';
    }
    var big = String(o.value == null ? '' : o.value).length <= 6;
    left += '<div style="font-size:' + (c ? '36px' : big ? '40px' : '28px') + ';'
      + 'font-weight:' + (c ? '400' : '600') + ';'
      + 'letter-spacing:' + (c ? '-0.01em' : '-0.025em') + ';line-height:1.08;'
      + 'font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:7px;'
      + (c ? 'justify-content:center;' : '') + 'color:' + T.ink + ';">'
      + esc(o.value);
    if (o.unit) {
      left += '<span style="font-size:19px;font-weight:400;letter-spacing:0;color:' + T.ink2 + ';">'
        + esc(o.unit) + '</span>';
    }
    left += '</div>';
    if (o.sub) {
      // Wraps rather than runs off: centered and nowrap, a long job name spilled out of both edges.
      left += '<div style="font-size:' + (c ? '16px' : '14px') + ';'
        + 'white-space:normal;text-wrap:balance;overflow-wrap:anywhere;line-height:1.35;'
        + 'color:' + (tone(o.subTone) || (c ? T.ink : T.ink2)) + ';">'
        + esc(o.sub) + '</div>';
    }
    left += '</div>';

    var right = '';
    if (o.chip && o.chip.text) {
      var chipInk = tone(o.chip.tone) || T.ink2;
      right = '<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;'
        + 'font-weight:500;padding:5px 11px;border-radius:999px;background:' + T.fill + ';color:' + chipInk + ';">'
        + '<span style="width:7px;height:7px;border-radius:50%;background:currentColor;"></span>'
        + esc(o.chip.text) + '</span>';
    }

    return '<div style="font-family:' + T.font + ';display:flex;'
      + (c
          ? 'flex-direction:column;align-items:center;justify-content:center;gap:10px;'
            + 'padding:2px 4px 18px;text-align:center;'
          : 'align-items:flex-end;justify-content:space-between;gap:20px;'
            + 'padding:6px 4px 2px;text-align:left;')
      + '">' + left + right + '</div>';
  }

  var ICON_HUE = {
    light: 'var(--casora-color-yellow, #FFCC00)',
    lamp: 'var(--casora-color-yellow, #FFCC00)',
    bulb: 'var(--casora-color-yellow, #FFCC00)',
    battery: 'var(--casora-color-green, #30D158)',
    plant: 'var(--casora-color-green, #30D158)',
    leaf: 'var(--casora-color-green, #30D158)',
    energy: 'var(--casora-color-green, #30D158)',
    power: 'var(--casora-color-green, #30D158)',
    motion: 'var(--casora-color-purple, #9333ea)',
    occupancy: 'var(--casora-color-purple, #9333ea)',
    presence: 'var(--casora-color-purple, #9333ea)',
    cellphone: 'var(--casora-color-blue, #0A84FF)',
    phone: 'var(--casora-color-blue, #0A84FF)',
    tablet: 'var(--casora-color-blue, #0A84FF)',
    sunny: 'var(--casora-color-yellow, #FFCC00)',
    beaker: 'var(--casora-color-purple, #9333ea)',
  };

  function hueFor(name) {
    var n = String(name || '').toLowerCase();
    var keys = Object.keys(ICON_HUE);
    for (var i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) !== -1) return ICON_HUE[keys[i]];
    }
    return T.accent;
  }

  function icon(name, t) {
    if (!name) return '';
    var literal = (typeof t === 'string' && /^(var\(|#|rgb|hsl)/.test(t)) ? t : null;
    var fill = tone(t) || literal || hueFor(name);
    // Gedimmte bzw. leere Kachel: Themes können Fläche und Glyphe tauschen (helles Weich).
    var bare = fill === 'rgba(0,0,0,0)';
    if (fill === 'rgba(255,255,255,0.18)') fill = 'var(--casora-popup-ui-dim, rgba(255,255,255,0.18))';
    var glyph = bare ? 'var(--casora-popup-ui-bare-glyph, #fff)' : '#fff';
    if (soft()) return softIcon(name, fill, bare || fill === 'var(--casora-popup-ui-dim, rgba(255,255,255,0.18))');
    var tsz = 'var(--casora-popup-icon-tile, 29px)';
    var tile = 'width:' + tsz + ';height:' + tsz + ';border-radius:7px;background:' + fill + ';flex:none;'
      + 'display:flex;align-items:center;justify-content:center;line-height:0;pointer-events:none;';
    if (String(name).indexOf(':') !== -1) {
      return '<div style="' + tile + '"><ha-icon icon="' + esc(name) + '" style="--mdc-icon-size:calc(' + tsz + ' * .62);'
        + 'width:calc(' + tsz + ' * .62);height:calc(' + tsz + ' * .62);color:' + glyph + ';display:flex;align-items:center;justify-content:center;'
        + 'line-height:0;"></ha-icon></div>';
    }
    var url = (typeof window.casoraIconUrl === 'function')
      ? window.casoraIconUrl(name) : '/casora_assets/icons/' + name + '.svg';
    return '<div style="' + tile + '"><div style="width:calc(' + tsz + ' * .586);height:calc(' + tsz + ' * .586);'
      + 'background-color:' + glyph + ';'
      + "-webkit-mask:url('" + url + "') center / contain no-repeat;"
      + "mask:url('" + url + "') center / contain no-repeat;\"></div></div>";
  }

  // Kreis in Gerätefarbe mit weißem Glyph; aus/leer: Sand-Kreis mit gedämpftem Glyph.
  // Fix-Runde 1 (B-07): Zeilensymbole in denselben Gerätefarben wie Ring und Kachel – die
  // Aktions-/Zustandsfarben (Petrol, Dunkelgrün …) bleiben Text und Knöpfen vorbehalten.
  var SOFT_HUE = [
    [T.blue, 'var(--casora-soft-icon-on, var(--casora-color-teal, #4E9E95))'],
    [T.accent, 'var(--casora-soft-icon-on, var(--casora-color-teal, #4E9E95))'],
    [T.green, 'var(--casora-color-green, #6AAE78)'],
    [T.amber, 'var(--casora-color-orange, #DE8A4E)'],
    [T.red, 'var(--casora-color-red, #D35A4E)'],
    ['var(--casora-color-purple, #9333ea)', 'var(--casora-color-teal, #4E9E95)'],
    ['var(--casora-color-pink, #D16E7E)', 'var(--casora-color-blue, #5B8FC9)'],
  ];
  // iOS-Neon und kaltes Grau aus Daten und Vorlagen (Tonnen, Diagramme, Apple Music …) → Weich-Palette.
  var NEON = {
    '#30d158': '#6AAE78', '#34c759': '#6AAE78', '#32d74b': '#6AAE78',
    // Klima „angenehm“ (Temperatur-Symbol/-Linie im Klima-Popup, 03.10.2026: „so grell“).
    '#67f5a0': '#6AAE78',
    '#64d2ff': '#5B8FC9', '#5ac8fa': '#5B8FC9', '#0a84ff': '#5B8FC9', '#007aff': '#5B8FC9',
    '#ff9f0a': '#DE8A4E', '#ff9500': '#DE8A4E',
    '#ffd60a': '#E8B04A', '#ffcc00': '#E8B04A', '#ffd600': '#E8B04A',
    '#ff9230': '#DE8A4E', '#ff4245': '#D35A4E',
    '#bf5af2': '#4E9E95', '#af52de': '#4E9E95', '#9333ea': '#4E9E95', '#5e5ce6': '#4E9E95', '#00c3d0': '#4E9E95',
    '#ff453a': '#D35A4E', '#ff3b30': '#D35A4E', '#fa2d48': '#FA2D48', '#ff375f': '#5B8FC9',
  };
  // Kaltes iOS-Grau → Grau des Looks (--casora-soft-grey-mark: Weich warm, Nebel kühl). Als
  // fertiger Farbwert, nicht var(): ApexCharts (SVG) löst keine CSS-Variablen auf.
  var greyAt = 0, greyVal = 'rgba(120,100,80,0.8)';
  function softGrey() {
    var now = Date.now();
    if (now - greyAt > 400) {
      greyAt = now;
      try {
        greyVal = getComputedStyle(document.documentElement)
          .getPropertyValue('--casora-soft-grey-mark').trim() || 'rgba(120,100,80,0.8)';
      } catch (e) { greyVal = 'rgba(120,100,80,0.8)'; }
    }
    return greyVal;
  }
  function softColor(c) {
    if (typeof c !== 'string') return c;
    var k = c.trim().toLowerCase();
    if (k === '#8e8e93' || k === '#636366') return softGrey();
    return NEON[k] || c;
  }
  window._casoraSoftColor = softColor;
  function softHue(fill) {
    for (var i = 0; i < SOFT_HUE.length; i++) if (fill === SOFT_HUE[i][0]) return SOFT_HUE[i][1];
    var m = /^var\(--casora-color-[a-z-]+,\s*(#[0-9a-f]{3,6})\)$/i.exec(String(fill || ''));
    return m ? fill : softColor(fill);
  }
  function softIcon(name, fill, off) {
    var sz = 'var(--casora-soft-icon-size, 38px)';
    var bg = off ? S.iconOff : softHue(fill);
    var ink = off ? S.glyphOff : S.glyph;
    var tile = 'width:' + sz + ';height:' + sz + ';border-radius:50%;background:' + bg + ';flex:none;'
      + 'display:flex;align-items:center;justify-content:center;line-height:0;pointer-events:none;';
    if (String(name).indexOf(':') !== -1) {
      return '<div style="' + tile + '"><ha-icon icon="' + esc(name) + '" style="--mdc-icon-size:calc(' + sz + ' * .5);'
        + 'width:calc(' + sz + ' * .5);height:calc(' + sz + ' * .5);color:' + ink + ';display:flex;'
        + 'align-items:center;justify-content:center;line-height:0;"></ha-icon></div>';
    }
    var url = (typeof window.casoraIconUrl === 'function')
      ? window.casoraIconUrl(name) : '/casora_assets/icons/' + name + '.svg';
    return '<div style="' + tile + '"><div style="width:calc(' + sz + ' * .5);height:calc(' + sz + ' * .5);'
      + 'background-color:' + ink + ';'
      + "-webkit-mask:url('" + url + "') center / contain no-repeat;"
      + "mask:url('" + url + "') center / contain no-repeat;\"></div></div>";
  }

  // Funktion der Zeilen (Bestätigen-Knopf, Wischen zum Bestätigen) – gleich in beiden Gestaltungen.
  var ROW_FN_CSS = '.hui-row{overflow:hidden;position:relative;--cf-w:88px;}'
      /* Laufender Zustand einer Zeilen-Aktion (z. B. „Wird aktualisiert“, 04.10.2026): Zweitfarbe
         mit kleinem, ruhig drehendem Kreis davor (actionLive-Regel mit busy: true). */
      + '.hui-busy{display:inline-flex!important;align-items:center;gap:7px;font-weight:600!important;}'
      + '.hui-busy::before{content:"";width:11px;height:11px;flex:none;box-sizing:border-box;border-radius:50%;'
      +   'border:2px solid currentColor;border-right-color:transparent;opacity:.75;animation:hui-busy-spin 1.1s linear infinite;}'
      + '@keyframes hui-busy-spin{to{transform:rotate(360deg);}}'
      + '@media (prefers-reduced-motion:reduce){.hui-busy::before{animation:none;}}'
      + '.hui-cf{position:absolute;top:12px;bottom:12px;right:8px;width:var(--cf-w);'
      +   'border-radius:calc(var(--casora-popup-row-radius, 20px) - 9px);'
      +   'background:' + T.blue + ';color:var(--casora-popup-ui-on-action, #fff);font-size:14px;'
      +   'font-weight:560;display:grid;place-items:center;cursor:pointer;'
      +   'transform:translateX(calc(var(--cf-w) + 16px));'
      +   'transition:transform .36s cubic-bezier(.36,0,.16,1);}'
      // It is a button, so it answers the pointer like one.
      + '@media (hover:hover){.hui-cf:hover{filter:brightness(1.12);}}'
      + '.hui-cf:active{filter:brightness(0.94);}'
      + '.hui-row:not(.armed) .hui-cf{pointer-events:none;}'
      + '.hui-row.armed .hui-cf{transform:none;}'
      + '.hui-inner{display:flex;align-items:center;gap:12px;flex:1;min-width:0;'
      +   '--armed-x:0px;transform:translateX(var(--armed-x));'
      +   'transition:transform .36s cubic-bezier(.36,0,.16,1);}'
      + '.hui-row.armed .hui-inner{--armed-x:calc((var(--cf-w) + 16px) * -1);}'
      + '@media (prefers-reduced-motion:reduce){.hui-cf,.hui-inner{transition:none;}}'
      /* 1.0.5: Aktion/Wert mit Knopf-Symbol (actionIcon/valueIcon, z. B. Updates): am Handy runder
         Knopf statt Text, damit Name und Unterzeile Platz haben. Desktop/Tablet zeigen den Text. */
      + '.hui-ab{display:none;}'
      + '@media (max-width:760px){'
      +   '.hui-actx{padding:0!important;margin:0!important;gap:0!important;flex:none;}'
      +   '.hui-actx .hui-at,.hui-actx.hui-busy::before{display:none!important;}'
      +   '.hui-actx .hui-ab{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;flex:none;}'
      +   '.hui-actx .hui-ab ha-icon{--mdc-icon-size:20px;width:20px;height:20px;display:flex;}'
      +   '.hui-actx.hui-busy .hui-ab ha-icon,.hui-actx .hui-ab ha-icon[icon=""]{display:none;}'
      +   '.hui-actx.hui-busy .hui-ab::before{content:"";width:16px;height:16px;box-sizing:border-box;border-radius:50%;'
      +     'border:2px solid currentColor;border-right-color:transparent;opacity:.8;animation:hui-busy-spin 1.1s linear infinite;}'
      + '}'
      + '@media (prefers-reduced-motion:reduce){.hui-actx .hui-ab::before{animation:none!important;}}';

  // Inhalt einer Aktion/eines Werts mit Knopf-Symbol: Text (Desktop) + runder Knopf (Handy).
  function actxInner(text, iconName, bg) {
    return '<span class="hui-at">' + esc(text) + '</span>'
      + '<span class="hui-ab" aria-hidden="true" style="background:' + bg + ';">'
      + '<ha-icon icon="' + esc(iconName || '') + '"></ha-icon></span>';
  }
  function actxLabel(text) {
    var t = (typeof window.casoraTr === 'function') ? window.casoraTr(String(text)) : String(text);
    return ' aria-label="' + esc(t) + '"';
  }

  // Zeilen als einzelne Sand-Pillen statt einer Platte mit Trennlinien. Daten-Attribute,
  // Live-Felder und Klassen (hui-row/hui-tap/hui-cf …) wie im bisherigen group().
  function softGroup(rows, label, labelAction) {
    var out = label ? softLabel(label, labelAction) : '';
    out += '<style>'
      + 'ha-card.disabled{pointer-events:auto!important;}'
      + '@keyframes casora-plate-hold{from,to{opacity:0;}}'
      + '@keyframes casora-plate-in{'
      + 'from{opacity:0;transform:perspective(900px) translateZ(-70px);}'
      + 'to{opacity:1;transform:perspective(900px) translateZ(0);}}'
      + '.hui-plate{animation:var(--casora-popup-plate-enter, none);'
      + 'animation-delay:var(--casora-popup-plate-delay, 0ms);}'
      + '.hui-srow{background:' + S.row + ';border-radius:' + S.radius + ';'
      +   'transition:background-color .18s ease;}'
      + '.hui-srow.hui-tap:active{background:' + S.rowPress + ';}'
      // Aktive Zeile (z. B. Gerät lädt) wie eine aktive Kachel im Raum: heller Grund, dunkle Schrift, Zustand in Ton.
      + '.hui-srow.hui-act{background:var(--casora-entity-background-active, ' + S.row + ');'
      +   'box-shadow:var(--button-card-box-shadow-active-mobile, none);}'
      + '.hui-srow.hui-act div{color:var(--casora-entity-name-active, inherit)!important;}'
      + '.hui-srow.hui-act .hui-sub{color:var(--casora-entity-state-active-color, ' + S.sub + ')!important;}'
      + '@media (hover:hover){.hui-srow.hui-tap:hover{background:' + S.rowHover + ';}}'
      + '.hui-chev{opacity:.4;flex:none;pointer-events:none;}'
      + '@media (min-width: 340px){'
      +   '.hui-sub{display:inline-block;max-width:100%;vertical-align:bottom;'
      +     'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      +   '.hui-sub2::before{content:"\\00a0\\00b7\\0020";opacity:.6}'
      + '}' + SEP_CSS
      + ROW_FN_CSS
      + '.hui-cf{font-weight:600;}'
      /* B-15: am Handy jede Unterzeile einzeilig mit Auslassung – gleich hohe Zeilen. */
      + '@media (max-width: 600px){.hui-srow .hui-sub{display:block!important;-webkit-line-clamp:1!important;white-space:nowrap!important;text-overflow:ellipsis!important;overflow:hidden!important;}.hui-srow .hui-sub2::before{content:none!important;}}'
      /* Hinweis-Zeilen (r.subWrap, z. B. „Noch keine Tageswerte“): ganzer Satz statt „…“ (07.10.2026). */
      + '.hui-srow .hui-sub.hui-wrap{display:block!important;white-space:normal!important;overflow:visible!important;-webkit-line-clamp:unset!important;text-overflow:clip!important;}'
      + '</style>';
    out += '<div class="hui-plate" style="display:flex;flex-direction:column;gap:8px;">';
    rows.forEach(function (r) {
      var arming = !!(r.svc && r.confirm);
      var armOnAction = !!(arming && r.entity && r.action);
      var tap = armOnAction
        ? ' data-casora-mi="' + esc(r.entity) + '"'
        : arming
          ? ' data-casora-arm=""'
          : (r.svc ? ' data-casora-svc="' + esc(JSON.stringify(r.svc)) + '"'
                   : (r.entity ? ' data-casora-mi="' + esc(r.entity) + '"' : ''));
      var tappable = arming || r.svc || r.entity || r.tappable;

      var lead;
      if (r.image !== undefined) {
        var plate = tone(r.iconTone)
          || ((typeof r.iconTone === 'string' && /^(var\(|#|rgb|hsl)/.test(r.iconTone))
                ? softHue(r.iconTone) : null)
          || S.iconOff;
        if (plate === 'rgba(0,0,0,0)') plate = S.iconOff;
        lead = '<div style="width:38px;height:38px;border-radius:50%;flex:none;background:' + plate + ';'
          + 'display:grid;place-items:center;overflow:hidden;">'
          + (r.image
              ? '<img src="' + esc(r.image) + '" alt="" style="width:'
                + (r.imageFit === 'cover' ? '38px;height:38px;object-fit:cover;' : '28px;height:28px;object-fit:contain;'
                  /* 04.10.2026: eckige Markenbilder (Updates) rund wie der Kreis dahinter, mittig. */
                  + 'border-radius:50%;')
                + 'display:block;">'
              : '<ha-icon icon="mdi:package-variant" style="--mdc-icon-size:19px;'
                + 'width:19px;height:19px;color:' + S.glyphOff + ';"></ha-icon>')
          + '</div>';
      } else {
        lead = icon(r.icon, r.iconTone);
      }

      out += '<div class="hui-row hui-srow' + (tappable ? ' hui-tap' : '') + (r.selected ? ' hui-sel' : '') + (r.active ? ' hui-act' : '') + '"' + tap
        + ' style="' + (tappable ? 'cursor:pointer;' : '')
        + (r.selected ? 'background:var(--casora-soft-row-selected, var(--casora-lps-seg-on, #FFFDF9));'
          + 'box-shadow:var(--casora-soft-row-selected-shadow, var(--casora-lps-seg-on-shadow, 0 6px 16px -10px rgba(90,70,50,0.45)));' : '')
        + 'display:flex;align-items:center;gap:12px;min-height:58px;box-sizing:border-box;'
        + 'padding:10px 16px 10px 10px;">'
        + '<div class="hui-inner">'
        + lead
        + '<div style="flex:1;min-width:0;pointer-events:none;white-space:normal;">'
        + '<div style="font-size:14.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.3;color:'
        + (tone(r.labelTone) || T.ink) + ';overflow:hidden;'
        + 'text-overflow:ellipsis;white-space:nowrap;">' + esc(r.label) + '</div>';

      if (r.sub) {
        var subs = Array.isArray(r.sub) ? r.sub : [r.sub];
        subs.forEach(function (line, si) {
          var sLive = '';
          if (si === 0 && r.subLive && r.entity && r.subLive.total) {
            sLive = ' data-casora-live="share" data-casora-ent="' + esc(r.entity) + '"'
              + ' data-casora-total="' + esc(r.subLive.total) + '"'
              + ' data-casora-suffix="' + esc(r.subLive.suffix || '%') + '"';
          }
          var one = subs.length === 1;
          out += '<div class="hui-sub' + (si ? ' hui-sub2' : '') + (r.subWrap ? ' hui-wrap' : '') + '"' + sLive
            + ' style="font-size:12.5px;font-weight:500;line-height:1.3;'
            // subTone: nur die erste Unterzeile einfärben (z. B. „Lädt“ grün, der Raum bleibt gedämpft).
            + 'color:' + ((si === 0 && r.subTone && (tone(r.subTone) || r.subTone)) || S.sub) + ';overflow:hidden;'
            + (one
                ? 'white-space:normal;overflow-wrap:anywhere;display:-webkit-box;'
                  + '-webkit-box-orient:vertical;-webkit-line-clamp:2;'
                : 'text-overflow:ellipsis;white-space:nowrap;')
            + '">' + esc(line) + '</div>';
        });
      }
      if (r.bar != null) {
        var bt = tone(r.barTone) || T.ink2;
        var pct = Math.max(0, Math.min(1, r.bar)) * 100;
        var live = r.liveAttr && r.entity
          ? ' data-casora-live="bar" data-casora-ent="' + esc(r.entity)
            + '" data-casora-attr="' + esc(r.liveAttr) + '"'
          : '';
        out += '<div style="height:5px;border-radius:999px;background:' + S.ctl
          + ';margin-top:7px;overflow:hidden;">'
          + '<div' + live + ' style="height:100%;width:' + pct.toFixed(1) + '%;'
          + 'border-radius:999px;background:' + bt + ';'
          + 'transition:width .3s cubic-bezier(.36,0,.16,1);"></div></div>';
      }
      out += '</div>';

      if (r.action) {
        var aLive = '';
        if (r.actionLive && r.entity) {
          aLive = ' data-casora-live="act" data-casora-ent="' + esc(r.entity) + '"'
            + ' data-casora-act="' + esc(JSON.stringify(r.actionLive)) + '"';
        }
        var aCls = (r.actionBusy ? 'hui-busy' : '') + (r.actionIcon ? (r.actionBusy ? ' ' : '') + 'hui-actx' : '');
        out += '<div' + aLive + (armOnAction ? ' data-casora-arm=""' : '') + (aCls ? ' class="' + aCls + '"' : '')
          + (r.actionIcon ? (armOnAction ? ' role="button"' : '') + actxLabel(r.action) : '')
          + ' style="font-size:14px;font-weight:700;color:'
          + (r.actionBusy ? S.sub : (tone(r.actionTone) || T.blue)) + ';white-space:nowrap;'
          + (armOnAction
              ? 'pointer-events:auto;cursor:pointer;padding:8px 10px;margin:-8px -10px;'
              : 'pointer-events:none;')
          + '">' + (r.actionIcon ? actxInner(r.action, r.actionIcon, S.iconOff) : esc(r.action)) + '</div>';
      }
      if (r.value != null && r.value !== '') {
        var vlive = '';
        if (r.liveWords && r.entity) {
          vlive = ' data-casora-live="word" data-casora-ent="' + esc(r.entity)
            + '" data-casora-words="' + esc(JSON.stringify(r.liveWords)) + '"';
        } else if (r.liveAttr && r.entity) {
          vlive = ' data-casora-live="text" data-casora-ent="' + esc(r.entity)
            + '" data-casora-attr="' + esc(r.liveAttr) + '"'
            + ' data-casora-suffix="' + esc(r.liveSuffix || '') + '"';
        }
        out += '<div' + vlive + (r.valueIcon ? ' class="hui-actx"' + actxLabel(r.value) : '') + ' style="font-size:14px;font-weight:600;'
          + 'font-variant-numeric:tabular-nums;color:' + (alertTone(r.valueTone) || T.ink2)
          + ';white-space:nowrap;pointer-events:none;">'
          + (r.valueIcon ? actxInner(r.value, r.valueIcon, S.iconOff) : esc(r.value)) + '</div>';
      }
      if ((r.entity || r.tappable) && (!r.svc || armOnAction)) {
        out += '<svg class="hui-chev" width="7" height="12" viewBox="0 0 7 12" aria-hidden="true">'
          + '<path d="M1 1L6 6L1 11" fill="none" stroke="' + T.ink3 + '" stroke-width="2" '
          + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      out += '</div>';   // .hui-inner
      if (arming) {
        out += '<div class="hui-cf" data-casora-cf="' + esc(JSON.stringify(r.svc)) + '">'
          + esc(r.confirm === true ? 'Bestätigen' : r.confirm) + '</div>';
      }
      out += '</div>';   // .hui-row
    });
    out += '</div>';
    return '<div style="font-family:' + T.font + ';text-align:left;">' + out + '</div>';
  }

  function group(rows, label, labelAction, opts) {
    rows = rows || [];
    if (soft()) return softGroup(rows, label, labelAction);
    var inside = !!(opts && opts.labelInside);
    var out = '';
    if (label && !inside) {
      out += '<div style="display:flex;align-items:baseline;justify-content:space-between;'
        + 'gap:12px;padding:0 4px 8px;">'
        + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);'
        + 'color:var(--casora-h15-c, ' + T.ink + ');">' + esc(label) + '</div>';
      if (labelAction && labelAction.text) {
        out += '<div class="hui-ga" style="font-size:15px;font-weight:500;'
          + 'color:' + (tone(labelAction.tone) || T.blue) + ';'
          + 'cursor:pointer;white-space:nowrap;letter-spacing:-0.01em;"'
          + (labelAction.svc ? ' data-casora-svc="' + esc(JSON.stringify(labelAction.svc)) + '"' : '')
          + '>' + esc(labelAction.text) + '</div>';
      }
      out += '</div>';
    }
    out += '<style>'
      + 'ha-card.disabled{pointer-events:auto!important;}'
      + '.hui-row{transition:background-color .18s ease;}'
      + '@keyframes casora-plate-hold{from,to{opacity:0;}}'
      + '@keyframes casora-plate-in{'
      + 'from{opacity:0;transform:perspective(900px) translateZ(-70px);}'
      + 'to{opacity:1;transform:perspective(900px) translateZ(0);}}'
      + '.hui-plate{animation:var(--casora-popup-plate-enter, none);'
      + 'animation-delay:var(--casora-popup-plate-delay, 0ms);}'
      + '.hui-div{transition:opacity .18s ease;}'
      + '.hui-tap:active{background:' + T.fill2 + ';}'
      + '.hui-tap:active + .hui-div{opacity:0;}'
      + '.hui-div:has(+ .hui-tap:active){opacity:0;}'
      + '@media (hover:hover){'
      +   '.hui-tap:hover{background:var(--casora-popup-row-hover, rgba(255,255,255,0.045));}'
      +   '.hui-tap:hover + .hui-div{opacity:0;}'
      +   '.hui-div:has(+ .hui-tap:hover){opacity:0;}'
      + '}'
      + '.hui-chev{opacity:var(--casora-popup-chev-opacity, .35);'
      +   'flex:none;pointer-events:none;'
      +   'margin-inline-start:var(--casora-popup-chev-gap, 0px);}'
      + '@media (min-width: 340px){'
      +   '.hui-sub{display:inline-block;max-width:100%;vertical-align:bottom;'
      +     'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      +   '.hui-sub2::before{content:"\\00a0\\00b7\\0020";opacity:.6}'
      + '}' + SEP_CSS
      + ROW_FN_CSS
      + '</style>';
    out += '<div class="hui-plate" style="background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));'
      + 'border-radius:var(--casora-popup-row-radius, 20px);overflow:hidden;'
      + 'box-shadow:var(--casora-popup-plate-shadow, none);'
      + 'backdrop-filter:var(--casora-popup-plate-backdrop, none);'
      + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);">';
    if (label && inside) {
      out += '<div style="padding:var(--casora-popup-row-pad-y, 8px)'
        + ' var(--casora-popup-row-pad-x, 16px)'
        + ' var(--casora-popup-group-label-gap, 10px);'
        + 'font-size:var(--casora-popup-group-label-size, 15px);font-weight:600;'
        + 'letter-spacing:-0.01em;color:' + T.ink + ';">' + esc(label) + '</div>';
    }
    rows.forEach(function (r, i) {
      if (i) {
        out += '<div class="hui-div" style="height:1px;background:' + T.div
          + ';margin-left:calc(var(--casora-popup-row-pad-x, 16px)'
          + ' + var(--casora-popup-divider-inset, 0px));'
          + 'margin-right:var(--casora-popup-row-pad-x, 16px);"></div>';
      }

      var arming = !!(r.svc && r.confirm);
      var armOnAction = !!(arming && r.entity && r.action);
      var tap = armOnAction
        ? ' data-casora-mi="' + esc(r.entity) + '"'
        : arming
          ? ' data-casora-arm=""'
          : (r.svc ? ' data-casora-svc="' + esc(JSON.stringify(r.svc)) + '"'
                   : (r.entity ? ' data-casora-mi="' + esc(r.entity) + '"' : ''));
      var tappable = arming || r.svc || r.entity || r.tappable;

      var lead;
      if (r.image !== undefined) {
        var plate = tone(r.iconTone)
          || ((typeof r.iconTone === 'string' && /^(var\(|#|rgb|hsl)/.test(r.iconTone))
                ? r.iconTone : null)
          || T.fill2;
        var psz = 'var(--casora-popup-lead-plate, 32px)';
        lead = '<div style="width:' + psz + ';height:' + psz + ';border-radius:9px;flex:none;'
          + 'background:' + plate + ';display:grid;place-items:center;overflow:hidden;">'
          + (r.image
              ? '<img src="' + esc(r.image) + '" alt="" '
                + 'style="' + (r.imageFit === 'cover'
                    ? 'width:calc(' + psz + ' * .875);height:calc(' + psz + ' * .875);'
                      + 'border-radius:7px;object-fit:cover;'
                    : 'width:calc(' + psz + ' * .875);height:calc(' + psz + ' * .875);'
                      + 'object-fit:contain;')
                + 'display:block;">'
              : '<ha-icon icon="mdi:package-variant" style="--mdc-icon-size:19px;'
                + 'width:19px;height:19px;color:' + T.ink3 + ';"></ha-icon>')
          + '</div>';
      } else {
        lead = icon(r.icon, r.iconTone);
      }

      out += '<div class="hui-row' + (tappable ? ' hui-tap' : '') + '"' + tap
        + ' style="' + (tappable ? 'cursor:pointer;' : '')
        + 'display:flex;align-items:center;gap:12px;'
        + 'min-height:var(--casora-popup-row-min, 52px);'
        + 'padding:var(--casora-popup-row-pad-y, 8px) var(--casora-popup-row-pad-x, 16px);">'
        + '<div class="hui-inner">'
        + lead
        // white-space:normal: button-card vererbt nowrap, dann brach die zweite
        // Unterzeile (Messwerte) nie um und lief unter den Wert rechts.
        + '<div style="flex:1;min-width:0;pointer-events:none;white-space:normal;">'
        + '<div style="font-size:var(--casora-popup-row-label-size, 17px);'
        + 'font-weight:var(--casora-popup-row-label-weight, 400);'
        + 'letter-spacing:-0.022em;color:'
        + (tone(r.labelTone) || T.ink) + ';overflow:hidden;'
        + 'text-overflow:ellipsis;white-space:nowrap;">' + esc(r.label) + '</div>';

      if (r.sub) {
        var subs = Array.isArray(r.sub) ? r.sub : [r.sub];
        subs.forEach(function (line, si) {
          var sLive = '';
          if (si === 0 && r.subLive && r.entity && r.subLive.total) {
            sLive = ' data-casora-live="share" data-casora-ent="' + esc(r.entity) + '"'
              + ' data-casora-total="' + esc(r.subLive.total) + '"'
              + ' data-casora-suffix="' + esc(r.subLive.suffix || '%') + '"';
          }
          // Eine einzelne Unterzeile darf auf zwei Zeilen umbrechen statt mitten
          // im Satz abzubrechen („Fenster weit auf, nach Außentemp…“).
          var one = subs.length === 1;
          out += '<div class="hui-sub' + (si ? ' hui-sub2' : '') + (r.subWrap ? ' hui-wrap' : '') + '"' + sLive
            + ' style="font-size:var(--casora-popup-sub-size, 13px);'
            + 'color:var(--casora-popup-sub-color, ' + T.ink3 + ');overflow:hidden;'
            + (one
                ? 'white-space:normal;overflow-wrap:anywhere;display:-webkit-box;'
                  + '-webkit-box-orient:vertical;-webkit-line-clamp:2;line-height:1.3;'
                : 'text-overflow:ellipsis;white-space:nowrap;')
            + '">'
            + esc(line) + '</div>';
        });
      }
      if (r.bar != null) {
        var bt = tone(r.barTone) || T.ink2;
        var pct = Math.max(0, Math.min(1, r.bar)) * 100;
        var live = r.liveAttr && r.entity
          ? ' data-casora-live="bar" data-casora-ent="' + esc(r.entity)
            + '" data-casora-attr="' + esc(r.liveAttr) + '"'
          : '';
        out += '<div style="height:4px;border-radius:999px;background:' + T.fill2
          + ';margin-top:7px;overflow:hidden;">'
          + '<div' + live + ' style="height:100%;width:' + pct.toFixed(1) + '%;'
          + 'border-radius:999px;background:' + bt + ';'
          + 'transition:width .3s cubic-bezier(.36,0,.16,1);"></div></div>';
      }
      out += '</div>';

      if (r.action) {
        var aLive = '';
        if (r.actionLive && r.entity) {
          aLive = ' data-casora-live="act" data-casora-ent="' + esc(r.entity) + '"'
            + ' data-casora-act="' + esc(JSON.stringify(r.actionLive)) + '"';
        }
        var aCls = (r.actionBusy ? 'hui-busy' : '') + (r.actionIcon ? (r.actionBusy ? ' ' : '') + 'hui-actx' : '');
        out += '<div' + aLive + (armOnAction ? ' data-casora-arm=""' : '') + (aCls ? ' class="' + aCls + '"' : '')
          + (r.actionIcon ? (armOnAction ? ' role="button"' : '') + actxLabel(r.action) : '')
          + ' style="font-size:var(--casora-popup-row-action-size, 16px);'
          + 'font-weight:500;color:'
          + (r.actionBusy ? T.ink2 : (tone(r.actionTone) || T.blue)) + ';white-space:nowrap;'
          + (armOnAction
              ? 'pointer-events:auto;cursor:pointer;padding:8px 10px;margin:-8px -10px;'
              : 'pointer-events:none;')
          + '">' + (r.actionIcon ? actxInner(r.action, r.actionIcon, T.fill2) : esc(r.action)) + '</div>';
      }
      if (r.value != null && r.value !== '') {
        var vlive = '';
        if (r.liveWords && r.entity) {
          vlive = ' data-casora-live="word" data-casora-ent="' + esc(r.entity)
            + '" data-casora-words="' + esc(JSON.stringify(r.liveWords)) + '"';
        } else if (r.liveAttr && r.entity) {
          vlive = ' data-casora-live="text" data-casora-ent="' + esc(r.entity)
            + '" data-casora-attr="' + esc(r.liveAttr) + '"'
            + ' data-casora-suffix="' + esc(r.liveSuffix || '') + '"';
        }
        out += '<div' + vlive + (r.valueIcon ? ' class="hui-actx"' + actxLabel(r.value) : '') + ' style="font-size:var(--casora-popup-row-value-size, 17px);'
          + 'letter-spacing:-0.022em;color:'
          + (tone(r.valueTone) || T.ink2)
          + ';margin-inline-start:var(--casora-popup-value-gap, 0px)'
          + ';white-space:nowrap;pointer-events:none;">'
          + (r.valueIcon ? actxInner(r.value, r.valueIcon, T.fill2) : esc(r.value)) + '</div>';
      }
      if ((r.entity || r.tappable) && (!r.svc || armOnAction)) {
        out += '<svg class="hui-chev" width="7" height="12" viewBox="0 0 7 12" aria-hidden="true">'
          + '<path d="M1 1L6 6L1 11" fill="none" stroke="' + T.ink3 + '" stroke-width="2" '
          + 'stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      out += '</div>';   // .hui-inner

      if (arming) {
        out += '<div class="hui-cf" data-casora-cf="' + esc(JSON.stringify(r.svc)) + '">'
          + esc(r.confirm === true ? 'Bestätigen' : r.confirm) + '</div>';
      }
      out += '</div>';   // .hui-row
    });
    out += '</div>';

    return '<div style="font-family:' + T.font + ';text-align:left;">' + out + '</div>';
  }

  // series: [{ color, value, label }]
  function legend(series) {
    if (soft()) {
      // Runde Pillen mit Farbpunkt statt loser Einträge.
      // Eine Reihe: am Handy schrumpfen die Pillen (Bezeichnung mit „…“) statt untereinander zu rutschen.
      var so = '<style>.hui-lg{display:flex;flex-wrap:nowrap;gap:8px;padding:12px 0 0;min-width:0;}'
        + '.hui-lgp{display:inline-flex;align-items:center;gap:7px;min-width:0;flex:0 1 auto;font-size:13px;font-weight:600;'
        +   'padding:7px 13px;border-radius:999px;background:' + S.row + ';color:' + S.sub + ';'
        +   'font-variant-numeric:tabular-nums;white-space:nowrap;box-sizing:border-box;}'
        + '.hui-lgp i{width:8px;height:8px;border-radius:50%;flex:none;}'
        + '.hui-lgp b{color:' + T.ink + ';font-weight:700;flex:none;}'
        + '.hui-lgp span{min-width:0;overflow:hidden;text-overflow:ellipsis;}'
        + '@media (max-width: 480px){.hui-lg{gap:5px;}.hui-lgp{font-size:11.5px;gap:4px;padding:5px 9px;letter-spacing:-0.01em;}}'
        + '</style><div class="hui-lg" style="font-family:' + T.font + ';">';
      (series || []).forEach(function (s) {
        so += '<div class="hui-lgp"><i style="background:' + softColor(s.color) + ';"></i>'
          + '<b>' + esc(s.value) + '</b><span>' + esc(s.label) + '</span></div>';
      });
      return so + '</div>';
    }
    var out = '<div style="font-family:' + T.font + ';display:flex;gap:16px;padding:8px 4px 0;">';
    (series || []).forEach(function (s) {
      out += '<div style="display:flex;align-items:center;gap:6px;font-size:13px;color:' + T.ink2 + ';'
        + 'font-variant-numeric:tabular-nums;">'
        + '<span style="width:8px;height:8px;border-radius:2px;background:' + s.color + ';"></span>'
        + '<b style="color:' + T.ink + ';font-weight:500;">' + esc(s.value) + '</b> ' + esc(s.label) + '</div>';
    });
    return out + '</div>';
  }

  // ── Mehr-Baustein (01.10.2026) ────────────────────────────────────────────
  // UI.more(id, html, opts) – zugeklappter Bereich unten in der rechten Spalte bzw.
  // am Handy ganz unten. Kopfzeile „Mehr“/„Weniger“ mit Chevron und optionaler Anzahl.
  //   id     eindeutig je Popup (z. B. 'net'); merkt sich den Zustand, solange das
  //          Popup offen ist – ein Neuzeichnen per triggers_update klappt nicht zu.
  //   html   Inhalt (fertiges HTML, z. B. UI.group(...)).
  //   opts   { count: Zahl, label: 'Mehr', less: 'Weniger', remember: true
  //            (Zustand pro Gerät in localStorage), sub: true (eingerückte Unter-Variante) }
  // Beim Öffnen eines Popups ist er immer zu (casora-popup leert window._casoraMoreOpen),
  // außer remember ist gesetzt. Umschalten läuft über den gemeinsamen Tipp-Handler
  // (data-casora-more-tg, Touch-Schutz wie bei den Zeilen) und ändert nur eine Klasse.
  var MORE_LS = 'casora_more_';
  function moreState(id, remember) {
    var reg = window._casoraMoreOpen || (window._casoraMoreOpen = {});
    if (Object.prototype.hasOwnProperty.call(reg, id)) return !!reg[id];
    if (remember) {
      try { return localStorage.getItem(MORE_LS + id) === '1'; } catch (e) { return false; }
    }
    return false;
  }
  function moreToggle(head) {
    var box = head.closest ? head.closest('.hui-more') : null;
    if (!box) return;
    var id = box.getAttribute('data-casora-more') || '';
    var open = !box.classList.contains('open');
    box.classList.toggle('open', open);
    head.setAttribute('aria-expanded', open ? 'true' : 'false');
    (window._casoraMoreOpen || (window._casoraMoreOpen = {}))[id] = open;
    if (box.hasAttribute('data-casora-more-rem')) {
      try { localStorage.setItem(MORE_LS + id, open ? '1' : '0'); } catch (e) {}
    }
    window._casoraSuppressDismiss = Date.now() + 400;
  }
  var MORE_CSS = '.hui-more{font-family:' + T.font + ';text-align:left;}'
    + '.hui-mhd{display:flex;align-items:center;gap:10px;min-height:46px;box-sizing:border-box;'
    +   'padding:8px 16px 8px 18px;border-radius:999px;cursor:pointer;pointer-events:auto;'
    +   'background:' + S.row + ';'
    +   '-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;'
    +   'transition:background-color .18s ease;}'
    + '@media (hover:hover){.hui-mhd:hover{background:' + S.rowHover + ';}}'
    + '.hui-mhd:active{background:' + S.rowPress + ';}'
    + '.hui-mlb{flex:1;min-width:0;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;'
    +   'color:var(--casora-soft-mehr-ink, ' + S.label + ');pointer-events:none;}'
    + '.hui-mlb .l{display:none;}'
    + '.hui-more.open>.hui-mhd .hui-mlb .m{display:none;}'
    + '.hui-more.open>.hui-mhd .hui-mlb .l{display:inline;}'
    + '.hui-mct{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;min-width:22px;height:22px;'
    +   'padding:0 7px;box-sizing:border-box;border-radius:999px;display:inline-flex;align-items:center;'
    +   'justify-content:center;pointer-events:none;color:var(--casora-soft-mehr-ink, ' + S.label + ');'
    +   'background:var(--casora-soft-mehr-count-fill, ' + S.ctl + ');}'
    + '.hui-more.open>.hui-mhd .hui-mct{visibility:hidden;}'
    + '.hui-mch{flex:none;pointer-events:none;transition:transform .25s cubic-bezier(.36,0,.16,1);}'
    + '.hui-more.open>.hui-mhd .hui-mch{transform:rotate(180deg);}'
    + '.hui-mbd{display:none;padding-top:14px;}'
    + '.hui-more.open>.hui-mbd{display:flex;flex-direction:column;gap:18px;animation:hui-more-in .22s ease-out both;}'
    + '.hui-more.sub>.hui-mhd{min-height:38px;padding:6px 12px 6px 14px;}'
    + '.hui-more.sub>.hui-mbd{padding-top:10px;gap:10px;}'
    + '@keyframes hui-more-in{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}'
    + '@media (prefers-reduced-motion:reduce){.hui-mch{transition:none;}.hui-more.open>.hui-mbd{animation:none;}}';
  function more(id, html, opts) {
    opts = opts || {};
    id = String(id || 'more');
    var open = moreState(id, !!opts.remember);
    var cnt = opts.count != null && opts.count !== '' && Number(opts.count) > 0
      ? '<span class="hui-mct">' + esc(opts.count) + '</span>' : '';
    return '<style>' + MORE_CSS + '</style>'
      + '<div class="hui-more' + (open ? ' open' : '') + (opts.sub ? ' sub' : '') + '" data-casora-more="' + esc(id) + '"'
      + (opts.remember ? ' data-casora-more-rem=""' : '') + '>'
      + '<div class="hui-mhd" data-casora-more-tg="" data-casora-nodismiss="" role="button" aria-expanded="' + (open ? 'true' : 'false') + '">'
      + '<span class="hui-mlb"><span class="m">' + esc(opts.label || 'Mehr') + '</span>'
      + '<span class="l">' + esc(opts.less || 'Weniger') + '</span></span>'
      + cnt
      + '<svg class="hui-mch" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">'
      + '<path d="M1 1.5L6 6.5L11 1.5" fill="none" stroke="var(--casora-soft-mehr-ink, ' + S.label + ')" stroke-width="2" '
      + 'stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</div>'
      + '<div class="hui-mbd">' + (html || '') + '</div>'
      + '</div>';
  }

  if (!window._casoraUIBound) {
    window._casoraUIBound = true;
    var closeMediaOverlay = function (ov) {
      if (!ov || ov.hidden) return;
      if (ov._casoraHidX) {
        ov._casoraHidX.style.removeProperty('visibility');
        ov._casoraHidX = null;
      }
      ov.classList.add('hui-closing');
      setTimeout(function () {
        ov.hidden = true;
        ov.classList.remove('hui-closing');
      }, 190);
    };
    var fire = function (ev) {
      if (Date.now() - (window._casoraLastScrollTs || 0) < 400) return;
      var path = (ev.composedPath && ev.composedPath()) || [ev.target];
      for (var i = 0; i < path.length; i++) {
        var t = path[i];
        // Mehr-Baustein: nur die Klasse umschalten, kein Neuzeichnen (Caches/Live-Felder bleiben).
        if (t && t.dataset && t.dataset.casoraMoreTg !== undefined) {
          if (Date.now() - (window._casoraUILastTap || 0) < 400) return;
          window._casoraUILastTap = Date.now();
          moreToggle(t);
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        if (t && t.classList && t.classList.contains('hui-cf')) {
          if (Date.now() - (window._casoraUILastTap || 0) < 400) return;
          window._casoraUILastTap = Date.now();
          try {
            var cs = JSON.parse(t.dataset.casoraCf);
            var ha3 = document.querySelector('home-assistant');
            if (ha3 && ha3.hass && cs && cs.domain) {
              ha3.hass.callService(cs.domain, cs.service, cs.data || {}, cs.target || undefined);
            }
          } catch (err) { console.error('casora: bad confirm row', err); }
          if (t.parentNode && t.parentNode.classList) t.parentNode.classList.remove('armed');
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        if (t && t.dataset && t.dataset.casoraMedia !== undefined) {
          if (Date.now() - (window._casoraUILastTap || 0) < 400) return;
          window._casoraUILastTap = Date.now();
          window._casoraSuppressDismiss = Date.now() + 600;
          var shelf = t.closest && t.closest('.hui-mrow');
          var wrapM = shelf && shelf.parentElement;
          var ov = wrapM && wrapM.querySelector && wrapM.querySelector('.hui-mov');
          if (ov) {
            var vv = window.visualViewport;
            var vw = (vv && vv.width) || window.innerWidth;
            var vh = (vv && vv.height) || window.innerHeight;
            var place = function () {
              ov.style.left = '0px'; ov.style.top = '0px';
              ov.style.right = 'auto'; ov.style.bottom = 'auto';
              ov.style.width = vw + 'px';
              ov.style.height = vh + 'px';
              var r0 = ov.getBoundingClientRect();
              ov.style.left = (r0.left ? -r0.left : 0) + 'px';
              ov.style.top = (r0.top ? -r0.top : 0) + 'px';
              var host = ov.getRootNode && ov.getRootNode().host;
              var pop = host;
              while (pop && !(pop.shadowRoot
                     && pop.shadowRoot.querySelector('.header-close'))) {
                pop = pop.parentElement
                  || (pop.getRootNode && pop.getRootNode().host);
              }
              var cls = pop && pop.shadowRoot.querySelector('.header-close');
              if (cls) {
                var cr = cls.getBoundingClientRect();
                if (cr.height) {
                  ov.style.paddingTop = Math.max(0, cr.top) + 'px';
                  var bk = ov.querySelector('.hui-mback');
                  var col = ov.querySelector('.hui-movin');
                  if (bk && col) {
                    bk.style.marginLeft = '0px';
                    var br = col.getBoundingClientRect();
                    bk.style.marginLeft = (cr.left - br.left) + 'px';
                  }
                  ov._casoraHidX = cls;
                  cls.style.visibility = 'hidden';
                }
              }
            };
            ov.hidden = false;
            place();
            requestAnimationFrame(place);
            if (ov._casoraPlace) window.removeEventListener('resize', ov._casoraPlace);
            ov._casoraPlace = function () {
              if (ov.hidden) return;
              vw = (vv && vv.width) || window.innerWidth;
              vh = (vv && vv.height) || window.innerHeight;
              place();
            };
            window.addEventListener('resize', ov._casoraPlace);
            var want = t.dataset.casoraMedia;
            ov.querySelectorAll('.hui-mdet').forEach(function (d) {
              d.hidden = d.dataset.i !== want;
              if (!d.hidden) { d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; }
            });
            ov.hidden = false;
          }
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        if (t && t.classList && t.classList.contains('hui-mback')) {
          window._casoraSuppressDismiss = Date.now() + 600;
          closeMediaOverlay(t.closest ? t.closest('.hui-mov') : null);
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        // Anywhere on the overlay that is not the detail itself closes it.
        if (t && t.classList && t.classList.contains('hui-mov')) {
          window._casoraSuppressDismiss = Date.now() + 600;
          closeMediaOverlay(t);
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        if (t && t.dataset && t.dataset.casoraArm !== undefined) {
          if (Date.now() - (window._casoraUILastTap || 0) < 400) return;
          window._casoraUILastTap = Date.now();
          // The marker may sit on the row or on its action label.
          var armRow = (t.classList && t.classList.contains('hui-row')) ? t
            : (t.closest ? t.closest('.hui-row') : null);
          if (!armRow) return;
          var rt = t.getRootNode && t.getRootNode();
          if (rt && rt.querySelectorAll) {
            rt.querySelectorAll('.hui-row.armed').forEach(function (o) {
              if (o !== armRow) o.classList.remove('armed');
            });
          }
          armRow.classList.toggle('armed');
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        if (t && t.dataset && t.dataset.casoraSvc) {
          if (Date.now() - (window._casoraUILastTap || 0) < 400) return;
          window._casoraUILastTap = Date.now();
          try {
            var spec = JSON.parse(t.dataset.casoraSvc);
            var ha2 = document.querySelector('home-assistant');
            if (ha2 && ha2.hass && spec && spec.domain && spec.service) {
              // „Vor dem Schalten fragen“ der Kachel gilt auch für die Knöpfe im Popup.
              var go2 = function () { ha2.hass.callService(spec.domain, spec.service, spec.data || {}, spec.target || undefined); };
              if (window.casoraConfirmSpec) window.casoraConfirmSpec(spec).then(function (ok) { if (ok) go2(); });
              else go2();
            }
          } catch (err) { console.error('casora: bad service row', err); }
          ev.preventDefault(); ev.stopPropagation();
          return;
        }
        if (t && t.dataset && t.dataset.casoraMi) {
          if (Date.now() - (window._casoraUILastTap || 0) < 400) return;
          window._casoraUILastTap = Date.now();
          var ha = document.querySelector('home-assistant');
          if (ha) {
            var el = window.casoraPopup && window.casoraPopup.element;
            if (el) el._miOpenedAt = Date.now();
            ha.dispatchEvent(new CustomEvent('hass-more-info', {
              bubbles: true, composed: true, detail: { entityId: t.dataset.casoraMi },
            }));
          }
          return;
        }
      }
    };
    var TAP_SLOP = 10;
    var tp = null;
    document.addEventListener('touchstart', function (ev) {
      var t0 = ev.touches && ev.touches[0];
      tp = t0 ? { x: t0.clientX, y: t0.clientY, moved: false } : null;
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', function (ev) {
      if (!tp) return;
      var t1 = ev.touches && ev.touches[0];
      if (!t1) return;
      if (Math.abs(t1.clientX - tp.x) > TAP_SLOP
        || Math.abs(t1.clientY - tp.y) > TAP_SLOP) {
        tp.moved = true;
        window._casoraLastScrollTs = Date.now();
      }
    }, { capture: true, passive: true });
    document.addEventListener('touchcancel', function () { tp = null; },
      { capture: true, passive: true });
    document.addEventListener('click', fire, true);
    document.addEventListener('touchend', function (ev) {
      var moved = !!(tp && tp.moved);
      tp = null;
      if (moved) return;
      fire(ev);
    }, true);

    var drag = null;
    // Weich: waagerechter Balken (data-casora-axis="x") misst von links.
    var pctFrom = function (el, clientY, clientX) {
      var b = el.getBoundingClientRect();
      var p;
      if (el.dataset.casoraAxis === 'x') {
        if (!b.width) return 0;
        p = (clientX - b.left) / b.width * 100;
      } else {
        if (!b.height) return 0;
        p = (b.bottom - clientY) / b.height * 100;
      }
      return Math.max(0, Math.min(100, Math.round(p)));
    };
    // Angezeigter Stand des Reglers (für „Abbrechen“ in der Rückfrage).
    var shown = function (el) {
      var fill = el.querySelector('.hui-sl-fill');
      if (!fill) return null;
      var inv = false;
      try { inv = !!JSON.parse(el.dataset.casoraSlider).invert; } catch (e) {}
      if (el.dataset.casoraAxis === 'x') { var w = parseFloat(fill.style.width); return isNaN(w) ? null : w; }
      var hgt = parseFloat(fill.style.height);
      return isNaN(hgt) ? null : (inv ? 100 - hgt : hgt);
    };
    var paint = function (el, pct) {
      var fill = el.querySelector('.hui-sl-fill');
      if (!fill) return;
      var inv = false;
      try { inv = !!JSON.parse(el.dataset.casoraSlider).invert; } catch (e) {}
      if (el.dataset.casoraAxis === 'x') {
        fill.style.width = pct + '%';
        el.querySelectorAll('.hui-sl-val').forEach(function (n) { n.textContent = pct + ' %'; });
        var ink = el.querySelector('.hui-sl-ink');
        if (ink) ink.style.clipPath = 'inset(0 ' + (100 - pct) + '% 0 0)';
        return;
      }
      fill.style.height = (inv ? 100 - pct : pct) + '%';
    };
    document.addEventListener('pointerdown', function (ev) {
      var path = (ev.composedPath && ev.composedPath()) || [ev.target];
      for (var i = 0; i < path.length; i++) {
        var el = path[i];
        if (el && el.dataset && el.dataset.casoraSlider !== undefined) {
          drag = { el: el, pct: pctFrom(el, ev.clientY, ev.clientX), from: shown(el) };
          el.classList.add('drag');
          paint(el, drag.pct);
          ev.preventDefault();
          return;
        }
      }
    }, true);
    document.addEventListener('pointermove', function (ev) {
      if (!drag) return;
      drag.pct = pctFrom(drag.el, ev.clientY, ev.clientX);
      paint(drag.el, drag.pct);
      ev.preventDefault();
    }, true);
    var endDrag = function () {
      if (!drag) return;
      var d = drag; drag = null;
      d.el.classList.remove('drag');
      try {
        var spec = JSON.parse(d.el.dataset.casoraSlider);
        var ha = document.querySelector('home-assistant');
        if (ha && ha.hass && spec && spec.domain) {
          var data = {};
          data[spec.field || 'position'] = d.pct;
          var go = function () { ha.hass.callService(spec.domain, spec.service, data, spec.target || undefined); };
          // Mit Rückfrage: erst nach „Öffnen“/„Schließen“ fahren, sonst zurück auf den alten Stand.
          if (window.casoraConfirmSpec) {
            window.casoraConfirmSpec({ domain: spec.domain, service: spec.service, target: spec.target, data: data })
              .then(function (ok) { if (ok) go(); else if (d.from != null) paint(d.el, d.from); });
          } else go();
        }
      } catch (err) { console.error('casora: bad slider', err); }
    };
    document.addEventListener('pointerup', endDrag, true);
    document.addEventListener('pointercancel', endDrag, true);
  }

  function shelf(items, label) {
    items = items || [];
    var out = '';
    var sf = soft();
    if (label && sf) {
      out += softLabel(label);
    } else if (label) {
      out += '<div style="font-size:15px;font-weight:600;letter-spacing:-0.01em;color:'
        + T.ink + ';padding:0 4px 10px;">' + esc(label) + '</div>';
    }
    out += '<style>'
      + (sf ? '.hui-art .p{border-radius:20px !important;box-shadow:var(--casora-soft-art-shadow, 0 10px 24px -14px rgba(90,70,50,.35)) !important;}'
          + '.hui-art .p::after{box-shadow:none !important;}'
          + '.hui-art .t{font-weight:700 !important;font-size:14.5px !important;}'
          + '.hui-pill{background:' + S.row + ' !important;padding:3px 9px !important;}' : '')
      + '.hui-shelf{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x proximity;'
      +   '-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:2px 4px 4px;}'
      + '.hui-shelf::-webkit-scrollbar{display:none;}'
      + '.hui-art{flex:0 0 auto;width:136px;scroll-snap-align:start;}'
      + '.hui-art .p{position:relative;width:136px;height:204px;border-radius:12px;'
      +   'overflow:hidden;background:' + T.fill + ';'
      +   'box-shadow:0 8px 22px -10px rgba(0,0,0,.75);'
      +   'transition:transform .2s cubic-bezier(.36,0,.16,1);}'
      + '.hui-art .p::after{content:"";position:absolute;inset:0;border-radius:inherit;'
      +   'box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);pointer-events:none;}'
      + '.hui-art img{width:100%;height:100%;object-fit:cover;display:block;}'
      + '.hui-art .t{font-size:15px;font-weight:500;color:' + T.ink + ';margin-top:9px;'
      +   'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.hui-cap{display:flex;align-items:center;gap:6px;margin-top:4px;}'
      + '.hui-pill{font-size:11px;font-weight:600;letter-spacing:.02em;padding:2px 7px;'
      +   'border-radius:999px;white-space:nowrap;flex:none;background:' + T.fill2 + ';'
      +   'color:' + T.ink2 + ';font-variant-numeric:tabular-nums;}'
      + '.hui-when{font-size:13px;color:' + T.ink3 + ';overflow:hidden;'
      +   'text-overflow:ellipsis;white-space:nowrap;}'
      + '.hui-art .n{position:absolute;top:8px;right:8px;width:10px;height:10px;'
      +   'border-radius:50%;background:' + T.blue + ';box-shadow:0 0 0 2px rgba(0,0,0,.45);}'
      + '@media (hover:hover){.hui-art:hover .p{transform:scale(1.035);}}'
      + '@media (prefers-reduced-motion:reduce){.hui-art .p{transition:none;}}'
      + '</style>';
    out += '<div class="hui-shelf">';
    items.forEach(function (it) {
      out += '<div class="hui-art"><div class="p">'
        + (it.image
            ? '<img src="' + esc(it.image) + '" loading="lazy" alt=""/>'
            : '<div style="width:100%;height:100%;display:flex;align-items:center;'
              + 'justify-content:center;color:' + T.ink3 + ';font-size:24px;">\u25b6</div>')
        + (it.unwatched ? '<div class="n"></div>' : '')
        + '</div>'
        + '<div class="t">' + esc(it.title) + '</div>';
      if (it.badge || it.meta) {
        out += '<div class="hui-cap">';
        if (it.badge) out += '<span class="hui-pill">' + esc(it.badge) + '</span>';
        if (it.meta) out += '<span class="hui-when">' + esc(it.meta) + '</span>';
        out += '</div>';
      }
      out += '</div>';
    });
    out += '</div>';
    return '<div style="font-family:' + T.font + ';text-align:left;">' + out + '</div>';
  }

  function prime(urls) {
    var seen = window._casoraImgPrimed || (window._casoraImgPrimed = new Set());
    var todo = [];
    (urls || []).forEach(function (u) {
      if (!u || seen.has(u)) return;
      seen.add(u);
      todo.push(u);
    });
    if (!todo.length) return;
    var go = function () {
      todo.forEach(function (u) {
        var im = new Image();
        try { im.fetchPriority = 'low'; } catch (e) {}
        im.decoding = 'async';
        im.src = u;
      });
    };
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1200);
  }

  function mediaRow(items, label, opts) {
    items = items || [];
    opts = opts || {};
    var base = opts.base == null ? 0.08 : Number(opts.base);
    var step = opts.step == null ? 0.028 : Number(opts.step);
    var first = Number(opts.index) || 0;
    var delay = function (i) { return (base + (first + i) * step).toFixed(3) + 's'; };
    var out = '';
    if (label) {
      out += '<div class="hui-mlabel" style="--hui-d:' + delay(0) + ';">'
        + esc(label) + '</div>';
    }
    out += '<style>'
      + '.hui-mrow{display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));'
      +   'gap:26px 30px;padding:2px var(--hui-gutter, var(--casora-popup-gutter, 26px)) 4px;}'
      + '@media (max-width: 900px){.hui-mrow{grid-template-columns:repeat(2, minmax(0, 1fr));}}'
      + '@media (max-width: 640px){.hui-mrow{grid-template-columns:minmax(0, 1fr);'
      +   'gap:var(--hui-mrow-gap-phone, 32px);}}'
      + '.hui-m{min-width:0;padding:0;border-radius:18px;}'
      + '.hui-m .fa{position:relative;width:100%;aspect-ratio:16/9;border-radius:14px;'
      +   'overflow:hidden;background:' + T.fill + ';'
      +   'box-shadow:0 10px 26px -12px rgba(0,0,0,.8);}'
      + '.hui-m .fa::after{content:"";position:absolute;inset:0;border-radius:inherit;'
      +   'box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);pointer-events:none;}'
      + '.hui-m img{width:100%;height:100%;object-fit:cover;display:block;}'
      + '.hui-m .w{font-size:11px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;'
      +   'color:' + T.ink3 + ';margin-top:10px;overflow:hidden;'
      +   'text-overflow:ellipsis;white-space:nowrap;}'
      + '.hui-m .h,.hui-m .hm{font-size:16px;font-weight:600;letter-spacing:-0.01em;'
      +   'color:' + T.ink + ';margin-top:2px;overflow:hidden;'
      +   'text-overflow:ellipsis;white-space:nowrap;}'
      + '.hui-m .e{font-size:13px;color:' + T.ink2 + ';margin-top:2px;overflow:hidden;'
      +   'text-overflow:ellipsis;white-space:nowrap;}'
      + '.hui-m .hm,.hui-m .e{display:none;}'
      + '.hui-m .s{font-size:14px;line-height:1.42;color:' + T.ink2 + ';margin-top:4px;'
      +   'white-space:normal !important;overflow-wrap:anywhere;'
      +   'display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;'
      +   'overflow:hidden;max-height:calc(1.42em * 5);}'
      + '.hui-m .ck{position:absolute;top:8px;right:8px;width:26px;height:26px;'
      +   'border-radius:50%;background:rgba(0,0,0,.64);display:grid;'
      +   'place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.30),'
      +   'inset 0 0 0 0.5px rgba(255,255,255,.18);}'
      + '.hui-m .ck svg{width:15px;height:15px;display:block;}'
      + '@media (max-width: 640px){'
      +   '.hui-m.split .h{display:none;}'
      +   '.hui-m .hm,.hui-m .e{display:block;}'
      +   '.hui-m .s{display:none;}'
      +   '.hui-mlabel{--hui-label-size:24px;--hui-label-gap:10px;'
      +     '--hui-label-weight:700;--hui-label-track:-0.02em;}}'
      + '@media (max-width: 640px){.hui-mlabel{--hui-label-size:17px;}}'
      + '@keyframes hui-m-in{from{opacity:0;transform:translateY(10px) scale(0.986);}'
      +   'to{opacity:1;transform:none;}}'
      + '@keyframes hui-tx-in{from{opacity:0.2;transform:scale(0.972) translateY(5px);}'
      +   'to{opacity:1;transform:none;}}'
      + '.hui-mlabel{font-size:var(--hui-label-size, 17px);'
      +   'font-weight:var(--hui-label-weight, 600);'
      +   'letter-spacing:var(--hui-label-track, -0.01em);color:' + T.ink + ';'
      +   'padding:0 var(--hui-gutter, var(--casora-popup-gutter, 26px)) var(--hui-label-gap, 10px);'
      +   'transform-origin:0% 40%;'
      +   'animation:hui-tx-in var(--hui-tx-dur, .28s) cubic-bezier(0.32, 0.72, 0, 1) both;'
      +   'animation-delay:var(--hui-d, 0s);}'
      + '.hui-m{animation:hui-m-in var(--hui-cell-dur, .28s) cubic-bezier(0.16, 1, 0.3, 1) backwards;'
      +   'animation-delay:var(--hui-d, 0s);}'
      + '.hui-m .w,.hui-m .h,.hui-m .hm,.hui-m .e,.hui-m .s{transform-origin:0% 40%;'
      +   'animation:hui-tx-in var(--hui-tx-dur, .28s) cubic-bezier(0.32, 0.72, 0, 1) both;}'
      + '.hui-m .w{animation-delay:calc(var(--hui-d, 0s) + .03s);}'
      + '.hui-m .h,.hui-m .hm{animation-delay:calc(var(--hui-d, 0s) + .045s);}'
      + '.hui-m .e,.hui-m .s{animation-delay:calc(var(--hui-d, 0s) + .06s);}'
      + '.hui-m .fa img{opacity:0;transition:opacity .24s ease;}'
      + '.hui-m .fa.rdy img{opacity:1;}'
      + '@media (prefers-reduced-motion:reduce){'
      +   '.hui-mlabel,.hui-m,.hui-m .w,.hui-m .h,.hui-m .hm,.hui-m .e,'
      +   '.hui-m .s{animation:none;}'
      +   '.hui-m .fa img{transition:none;}}'
      + (opts.tiles
          ? '.hui-m{position:relative;border-radius:var(--casora-popup-row-radius, 20px);'
          +   'overflow:hidden;box-shadow:var(--casora-popup-plate-shadow, none);'
          +   'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));}'
          + '.hui-m .fa{position:relative;width:100%;aspect-ratio:16/9;'
          +   'border-radius:0;margin:0;overflow:hidden;}'
          + '.hui-m .fa img{width:100%;height:100%;object-fit:cover;display:block;}'
          + '.hui-m .ph{width:100%;height:100%;display:flex;align-items:center;'
          +   'justify-content:center;color:' + T.ink3 + ';font-size:26px;}'
          + '.hui-m .sc{position:absolute;inset:auto 0 0 0;height:48%;'
          +   'background:linear-gradient(to top,'
          +     'rgba(0,0,0,0.72) 0%,rgba(0,0,0,0.44) 38%,'
          +     'rgba(0,0,0,0.16) 70%,rgba(0,0,0,0) 100%);'
          +   'pointer-events:none;}'
          + '.hui-m .cap{position:absolute;left:0;right:0;bottom:0;'
          +   'padding:0 14px 12px;pointer-events:none;}'
          + '.hui-m .cap .t{font-size:16px;font-weight:600;letter-spacing:-0.01em;'
          +   'color:#fff;text-shadow:0 1px 4px rgba(0,0,0,0.5);'
          +   'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
          + '.hui-m .cap .yr{font-weight:400;color:rgba(255,255,255,0.72);}'
          + '.hui-m .cap .l2{font-size:13px;margin-top:1px;'
          +   'color:rgba(255,255,255,0.62);text-shadow:0 1px 3px rgba(0,0,0,0.5);'
          +   'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
          + '.hui-m .rt{position:absolute;top:10px;left:10px;'
          +   'font-size:12px;font-weight:600;color:#fff;'
          +   'padding:4px 9px;border-radius:999px;'
          +   'background:rgba(0,0,0,0.55);'
          +   'backdrop-filter:var(--casora-popup-tile-backdrop, none);'
          +   '-webkit-backdrop-filter:var(--casora-popup-tile-backdrop, none);}'
          + '.hui-m .ck{top:10px;right:10px;}'
          + '.hui-m{transition:transform .2s ease, box-shadow .2s ease;'
          +   'transform:scale(1);}'
          + '@media (hover:hover){'
          +   '.hui-m:hover{transform:scale(1.014);'
          +     'box-shadow:var(--casora-popup-plate-shadow-hover,'
          +     ' 0 22px 48px -20px rgba(0,0,0,0.58), 0 3px 10px -5px rgba(0,0,0,0.34));}'
          + '}'
          + '@media (hover:hover){.hui-m:hover .fa img{transform:scale(1.022);}}'
          + '.hui-m .fa img{transition:transform .3s cubic-bezier(0.16, 1, 0.3, 1);}'
          + '.hui-m:active{transform:scale(0.99);}'
          + '.hui-m{cursor:pointer;}'
          + '.hui-mov{position:fixed;inset:0;z-index:20;display:grid;'
          +   'align-items:start;justify-items:center;padding:24px;'
          +   'box-sizing:border-box;'
          // Blur only - the darkening read as a scrim on top of the popup's own.
          +   'backdrop-filter:var(--casora-media-overlay-backdrop,blur(18px));'
          +   '-webkit-backdrop-filter:var(--casora-media-overlay-backdrop,blur(18px));}'
          + '.hui-mov[hidden]{display:none;}'
          + '.hui-mov{transition:opacity .19s ease,'
          +   'backdrop-filter .19s ease,-webkit-backdrop-filter .19s ease;}'
          + '.hui-mov.hui-closing{opacity:0;'
          +   'backdrop-filter:var(--casora-media-overlay-backdrop,blur(0px));'
          +   '-webkit-backdrop-filter:var(--casora-media-overlay-backdrop,blur(0px));}'
          + '.hui-mdet{transition:transform .19s cubic-bezier(0.4, 0, 1, 1);}'
          + '.hui-mov.hui-closing .hui-mdet{transform:scale(0.97);}'
          + '.hui-mdet[hidden]{display:none;}'
          + '.hui-movin{width:min(760px, 100%);max-height:100%;min-height:0;'
          +   'display:flex;flex-direction:column;align-items:flex-start;gap:18px;}'
          + '.hui-mback{width:48px;height:48px;border-radius:50%;position:relative;'
          +   'flex:none;display:flex;align-items:center;justify-content:center;'
          +   'cursor:pointer;pointer-events:auto;transition:transform .15s ease;'
          +   'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));'
          +   'backdrop-filter:var(--casora-popup-plate-backdrop, none);'
          +   '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);'
          +   'box-shadow:var(--casora-popup-plate-shadow, none);}'
          + '.hui-mback:active{transform:scale(0.94);}'
          + '.hui-mdet{width:100%;flex:1 1 auto;min-height:0;overflow:auto;'
          +   'scrollbar-width:none;'
          +   'border-radius:var(--casora-popup-row-radius, 20px);'
          +   'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));'
          +   'box-shadow:var(--casora-popup-detail-shadow,'
          +   ' 0 10px 30px -22px rgba(0,0,0,0.45));'
          // The same depth entrance everything else uses.
          +   'animation:casora-plate-in 320ms cubic-bezier(0.2,0.8,0.3,1) both;}'
          + '.hui-mdet::-webkit-scrollbar{display:none;}'
          + '.hui-mdet .fa{width:100%;aspect-ratio:16/9;overflow:hidden;'
          +   'border-radius:var(--casora-popup-row-radius, 20px)'
          +   ' var(--casora-popup-row-radius, 20px) 0 0;}'
          + '.hui-mdet .fa img{width:100%;height:100%;object-fit:cover;display:block;}'
          + '.hui-mdet .meta{padding:18px 22px 22px;}'
          + '.hui-mdet .t{font-size:24px;font-weight:700;letter-spacing:-0.02em;'
          +   'color:' + T.ink + ';}'
          + '.hui-mdet .yr{font-weight:400;color:' + T.ink2 + ';}'
          + '.hui-mdet .chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;}'
          + '.hui-mdet .c{font-size:12px;font-weight:600;color:' + T.ink2 + ';'
          +   'background:' + T.fill2 + ';border-radius:999px;padding:5px 10px;}'
          + '.hui-mdet .t,.hui-mdet .s,.hui-mdet .c{white-space:normal;'
          +   'overflow:visible;text-overflow:clip;}'
          + '.hui-mdet .s{overflow-wrap:anywhere;'
          +   'font-size:15px;line-height:1.45;margin-top:14px;'
          +   'color:' + T.ink2 + ';}'
          + '@keyframes casora-plate-in{'
          +   'from{opacity:0;transform:perspective(900px) translateZ(-70px);}'
          +   'to{opacity:1;transform:perspective(900px) translateZ(0);}}'
          + '.hui-m{animation:casora-plate-in var(--hui-cell-dur, .42s) '
          +   'cubic-bezier(0.16, 1, 0.3, 1) backwards;animation-delay:0s;}'
          + '.hui-mlabel{animation-delay:0s;}'
          + '.hui-m,.hui-mrow,.hui-mov{pointer-events:auto;}'
          + '.hui-mrow{grid-template-columns:'
          +   'repeat(var(--hui-cols, 3), var(--hui-tile-w, min(381px, (min(1260px, 94vw) - 116px) / 3)));}'
          + '@media (max-width: 900px){.hui-mrow{'
          +   'grid-template-columns:repeat(2, minmax(0, 1fr));}}'
          + '@media (max-width: 640px){.hui-mrow{'
          +   'grid-template-columns:minmax(0, 1fr);}}'
          + '@media (max-width: 640px){'
          +   '.hui-mrow{grid-template-columns:minmax(0, 1fr);}'
          +   '.hui-m,.hui-m:first-child{grid-column:auto;}}'
          : '')
      // Weich (01.10.2026): Etikett in Großbuchstaben, große runde Bild-Ecken, Sand statt Glas.
      + (soft() ? '.hui-mlabel{font-size:12px !important;font-weight:700 !important;letter-spacing:.1em !important;'
          +   'text-transform:uppercase;color:' + S.label + ' !important;}'
          + '.hui-m .fa{border-radius:24px !important;background:' + S.ctl + ' !important;'
          +   'box-shadow:var(--casora-soft-art-shadow, 0 10px 24px -14px rgba(90,70,50,.35)) !important;}'
          + '.hui-m .fa::after{box-shadow:none !important;}'
          + '.hui-m .w{font-weight:700 !important;letter-spacing:.1em !important;color:' + S.label + ' !important;}'
          + '.hui-m .h,.hui-m .hm{font-weight:700 !important;font-size:15px !important;}'
          + '.hui-m .e,.hui-m .s{color:' + S.sub + ' !important;font-weight:500;}'
          + '.hui-mback{background:' + S.ctl + ' !important;box-shadow:none !important;}'
          + '.hui-mback path{stroke:' + T.ink + ';}'
          + '.hui-mdet{border-radius:28px !important;background:var(--casora-soft-surface, ' + T.fill + ') !important;'
          +   'box-shadow:var(--casora-soft-shadow, 0 18px 40px -24px rgba(90,70,50,.45)) !important;}'
          + '.hui-mdet .fa{border-radius:28px 28px 0 0 !important;}'
          + '.hui-mdet .t{font-weight:800 !important;}'
          + '.hui-mdet .c{background:' + S.ctl + ' !important;color:' + S.sub + ' !important;padding:6px 12px !important;}'
          + '.hui-mdet .s{color:' + S.sub + ' !important;}' : '')
      + '</style>';
    var nT = items.length;
    out += '<div class="hui-mrow"'
      + (opts.tiles ? ' style="--hui-cols:' + Math.min(nT, 3) + ';"' : '')
      + '>';
    if (opts.tiles) {
      items.forEach(function (it, i) {
        out += '<div class="hui-m" data-casora-media="' + i + '"'
          + ' style="--hui-d:' + delay(i + 1) + ';">'
          + '<div class="fa">'
          + (it.image
              ? '<img src="' + esc(it.image) + '" alt="" decoding="async" '
                + 'onload="this.parentNode.classList.add(\'rdy\')" '
                + 'onerror="this.onerror=null;this.style.display=\'none\'"/>'
              : '<div class="ph">\u25b6</div>')
          + '<div class="sc"></div>'
          + (it.rating ? '<div class="rt">' + esc(it.rating) + '</div>' : '')
          + (it.watched
              ? '<div class="ck"><svg viewBox="0 0 24 24" aria-hidden="true">'
                + '<path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" fill="none" stroke="#fff" '
                + 'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
                + '</svg></div>'
              : '')
          + '<div class="cap">'
          + (it.title ? '<div class="t">' + esc(it.title)
              + (it.year ? '<span class="yr"> \u00b7 ' + esc(it.year) + '</span>' : '')
              + '</div>' : '')
          + (it.line2 ? '<div class="l2">' + esc(it.line2) + '</div>' : '')
          + '</div></div></div>';
      });
      out += '</div>';
      out += '<div class="hui-mov" hidden><div class="hui-movin">'
        + '<div class="hui-mback" role="button" aria-label="Back">'
        +   '<svg width="14" height="24" viewBox="0 0 14 24" fill="none"'
        +   ' style="margin-right:2px;pointer-events:none;">'
        +   '<path d="M12 2.5 L2.8 12 L12 21.5" stroke="#fff" stroke-width="3"'
        +   ' stroke-linecap="round" stroke-linejoin="round"/></svg>'
        + '</div>';
      items.forEach(function (it, i) {
        out += '<div class="hui-mdet" data-i="' + i + '" hidden>'
          + '<div class="fa">'
          + (it.image ? '<img src="' + esc(it.image) + '" alt=""/>' : '')
          + '</div>'
          + '<div class="meta">'
          + (it.title ? '<div class="t">' + esc(it.title)
              + (it.year ? '<span class="yr"> \u00b7 ' + esc(it.year) + '</span>' : '')
              + '</div>' : '')
          + '<div class="chips">'
          +   (it.rating ? '<span class="c">' + esc(it.rating) + '</span>' : '')
          +   (it.line2 ? '<span class="c">' + esc(it.line2) + '</span>' : '')
          +   (it.runtime ? '<span class="c">' + esc(it.runtime) + '</span>' : '')
          +   (it.added ? '<span class="c">' + esc(it.added) + '</span>' : '')
          + '</div>'
          + (it.summary ? '<div class="s">' + esc(it.summary) + '</div>' : '')
          + '</div></div>';
      });
      out += '</div></div>';
      return '<div style="font-family:' + T.font + ';text-align:left;">'
        + out + '</div>';
    }

    items.forEach(function (it, i) {
      var tm = it.titleMobile && it.titleMobile !== it.title ? it.titleMobile : null;
      out += '<div class="hui-m' + (tm ? ' split' : '')
        + '" style="--hui-d:' + delay(i + 1) + ';"><div class="fa">'
        + (it.image
            ? '<img src="' + esc(it.image) + '" alt="" decoding="async" '
              + 'onload="this.parentNode.classList.add(\'rdy\')" '
              + 'onerror="this.onerror=null;this.style.display=\'none\'"/>'
            : '<div style="width:100%;height:100%;display:flex;align-items:center;'
              + 'justify-content:center;color:' + T.ink3 + ';font-size:26px;">\u25b6</div>')
        + (it.watched
            ? '<div class="ck"><svg viewBox="0 0 24 24" aria-hidden="true">'
              + '<path d="M4.5 12.5 L9.5 17.5 L19.5 6.5" fill="none" stroke="#fff" '
              + 'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
              + '</svg></div>'
            : '')
        + '</div>';
      if (it.when)    out += '<div class="w">' + esc(it.when) + '</div>';
      if (it.title)   out += '<div class="h">' + esc(it.title) + '</div>';
      if (tm)         out += '<div class="hm">' + esc(tm) + '</div>';
      if (it.sub)     out += '<div class="e">' + esc(it.sub) + '</div>';
      if (it.summary) out += '<div class="s">' + esc(it.summary) + '</div>';
      out += '</div>';
    });
    out += '</div>';
    if (opts.plate) {
      return '<div class="hui-plate" style="font-family:' + T.font + ';text-align:left;'
        + 'background:var(--casora-popup-row-fill, rgba(255,255,255,0.10));'
        + 'border-radius:var(--casora-popup-row-radius, 20px);'
        + 'box-shadow:var(--casora-popup-plate-shadow, none);'
        + 'backdrop-filter:var(--casora-popup-plate-backdrop, none);'
        + '-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);'
        + 'padding:var(--casora-popup-shelf-pad, 18px 0 22px);">' + out + '</div>';
    }
    return '<div style="font-family:' + T.font + ';text-align:left;">' + out + '</div>';
  }

  // A row of preset pills. items: [{ label, svc, active }]
  // opts.live = { entities: [...], attr: 'current_position' } (nur Weich): das aktive Feld
  // folgt dem Mittelwert live – Felder mit value, z. B. Jalousie auf 30 % → keins aktiv.
  function segments(items, label, opts) {
    items = items || [];
    var out = '';
    if (soft()) {
      // Segment-Umschalter wie „Warm / Neutral / Kalt“: gleich breite Sand-Felder in EINER
      // Reihe (Raster statt Umbruch – am Handy stand „Öffnen“ sonst allein darunter),
      // das aktive hell mit weichem Schatten. Erst ab 7 Feldern wird umbrochen.
      var n = items.length;
      var many = n >= 5;
      var cols = n >= 7 ? 'repeat(auto-fill, minmax(88px, 1fr))' : 'repeat(' + Math.max(1, n) + ', minmax(0, 1fr))';
      var lv = opts && opts.live && opts.live.entities && opts.live.entities.length ? opts.live : null;
      if (label) out += softLabel(label);
      out += '<style>'
        + 'ha-card.disabled{pointer-events:auto!important;}'
        + '.hui-seg{display:grid;gap:' + (many ? 8 : 10) + 'px;}'
        + '.hui-sg{min-width:0;box-sizing:border-box;text-align:center;'
        +   'font-size:13px;font-weight:600;min-height:46px;padding:0 ' + (many ? 6 : 12) + 'px;'
        +   'display:flex;align-items:center;justify-content:center;'
        +   'border-radius:var(--casora-soft-seg-radius, 18px);background:' + S.ctl + ';'
        +   'color:' + S.sub + ';cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
        +   'transition:background-color .16s ease, box-shadow .16s ease;}'
        + '.hui-sg.on{background:var(--casora-soft-seg-on, #FFFDF9);color:var(--casora-soft-seg-on-ink, ' + T.ink + ');'
        +   'box-shadow:var(--casora-soft-seg-on-shadow, none);}'
        + (many ? '@media (max-width: 480px){.hui-seg{gap:6px;}.hui-sg{font-size:12.5px;padding:0 2px;letter-spacing:-0.01em;}}' : '')
        + '@media (hover:hover){.hui-sg:not(.on):hover{background:' + S.rowHover + ';}}'
        + '@media (prefers-reduced-motion:reduce){.hui-sg{transition:none;}}'
        + '</style><div class="hui-seg" style="grid-template-columns:' + cols + ';"'
        + (lv ? ' data-casora-live="seg" data-casora-ents="' + esc(JSON.stringify(lv.entities)) + '"'
            + ' data-casora-attr="' + esc(lv.attr || 'current_position') + '"' : '')
        + '>';
      items.forEach(function (it) {
        out += '<div class="hui-sg' + (it.active ? ' on' : '') + '"'
          + (lv && it.value != null ? ' data-v="' + esc(it.value) + '"' : '')
          + (it.svc ? ' data-casora-svc="' + esc(JSON.stringify(it.svc)) + '"' : '')
          + '>' + esc(it.label) + '</div>';
      });
      return '<div style="font-family:' + T.font + ';text-align:left;">' + out + '</div></div>';
    }
    if (label) {
      out += '<div style="font-size:15px;font-weight:600;letter-spacing:-0.01em;color:'
        + T.ink + ';padding:0 4px 8px;">' + esc(label) + '</div>';
    }
    out += '<style>'
      + 'ha-card.disabled{pointer-events:auto!important;}'
      + '.hui-seg{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;}'
      + '.hui-sg{flex:0 1 auto;text-align:center;'
      +   'font-size:14px;font-weight:500;'
      +   'padding:11px 13px;border-radius:var(--casora-popup-seg-radius, 999px);'
      // Trefferfläche 44 px (sichtbar 37 px): unsichtbarer Rand oben/unten, Fläche nur im Innern, Lage
      // unverändert. Kein ::before – overflow:hidden (Auslassung) schnitte ihn ab.
      +   'border-block:3.5px solid transparent;background-clip:padding-box;margin-block:-3.5px;'
      +   'background:var(--casora-popup-seg-fill, rgba(255,255,255,0.16));'
      +   'color:' + T.ink + ';'
      +   'cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
      +   'transition:background-color .16s ease;}'
      + '.hui-sg.on{background:' + T.ink + ';color:var(--casora-popup-ui-on-ink, #000);}'
      + '@media (hover:hover){.hui-sg:not(.on):hover{background:var(--casora-popup-seg-fill-hover, rgba(255,255,255,0.24));}}'
      + '@media (prefers-reduced-motion:reduce){.hui-sg{transition:none;}}'
      + '</style>';
    out += '<div class="hui-seg">';
    items.forEach(function (it) {
      out += '<div class="hui-sg' + (it.active ? ' on' : '') + '"'
        + (it.svc ? ' data-casora-svc="' + esc(JSON.stringify(it.svc)) + '"' : '')
        + '>' + esc(it.label) + '</div>';
    });
    out += '</div>';
    return '<div style="font-family:' + T.font + ';text-align:left;">' + out + '</div>';
  }

  function slider(o) {
    o = o || {};
    var v = Math.max(0, Math.min(100, Number(o.value) || 0));
    var inv = !!o.invert;
    var h = o.height || T.controlH;
    var w = o.width || T.controlW;
    var fillPct = inv ? (100 - v) : v;
    var payload = esc(JSON.stringify(Object.assign({ invert: inv }, o.svc || {})));

    var glyph = '';
    if (o.icon) {
      var url = (typeof window.casoraIconUrl === 'function')
        ? window.casoraIconUrl(o.icon) : '/casora_assets/icons/' + o.icon + '.svg';
      glyph = '<div class="hui-sl-ic" style="-webkit-mask:url(\'' + url + '\') center / contain no-repeat;'
        + 'mask:url(\'' + url + '\') center / contain no-repeat;"></div>';
    }

    var live = '';
    if (o.live && o.live.entities && o.live.entities.length) {
      live = ' data-casora-live="fill"'
        + ' data-casora-ents="' + esc(JSON.stringify(o.live.entities)) + '"'
        + ' data-casora-attr="' + esc(o.live.attr || 'current_position') + '"'
        + (inv ? ' data-casora-invert="1"' : '');
    }

    if (soft()) {
      // Breiter, runder Balken mit Verlaufsfüllung; der Wert steht in der Füllung.
      // Gleiche Daten-Attribute wie senkrecht, data-casora-axis="x" schaltet Ziehen und
      // Live-Füllung auf die Breite um. Die Füllung zeigt immer den Wert (bei Jalousien die
      // Öffnung), invert gilt hier nicht – sonst stünde „100 %“ neben einem leeren Balken.
      var hx = o.softHeight || 66;
      var sOut = '<style>'
        + 'ha-card.disabled{pointer-events:auto!important;}'
        + '.hui-sl{position:relative;width:100%;height:' + hx + 'px;box-sizing:border-box;'
        +   'border-radius:var(--casora-popup-row-radius, 24px);overflow:hidden;background:' + S.ctl + ';'
        +   'cursor:ew-resize;touch-action:none;user-select:none;-webkit-user-select:none;}'
        + '.hui-sl-fill{position:absolute;top:0;bottom:0;' + 'left:0;'
        +   'border-radius:inherit;'
        +   'background:linear-gradient(' + '90deg' + ','
        +     ' color-mix(in srgb, var(--casora-popup-slider-fill, var(--casora-color-teal, #00C3D0))'
        +     ' var(--casora-soft-slider-mix, 55%), var(--casora-soft-slider-light, #fff)),'
        +     ' var(--casora-popup-slider-fill, var(--casora-color-teal, #00C3D0)));'
        +   'transition:width .18s cubic-bezier(.36,0,.16,1);}'
        + '.hui-sl.drag .hui-sl-fill{transition:none;}'
        // Wert und Symbol zweilagig: gedämpft auf der Spur, darüber dieselbe Zeile in Füllschrift,
        // auf die Füllbreite zugeschnitten (.hui-sl-ink) – lesbar bei jedem Wert, hell und dunkel.
        + '.hui-sl-val{position:absolute;left:22px;top:50%;transform:translateY(-50%);pointer-events:none;'
        +   'font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;color:' + S.sub + ';}'
        + '.hui-sl-ic{position:absolute;right:22px;top:50%;transform:translateY(-50%);'
        +   'width:24px;height:24px;pointer-events:none;background-color:' + S.sub + ';}'
        + '.hui-sl-ink{position:absolute;inset:0;pointer-events:none;transition:clip-path .18s cubic-bezier(.36,0,.16,1);}'
        + '.hui-sl-ink .hui-sl-val{color:var(--casora-soft-slider-ink, ' + T.ink + ');}'
        + '.hui-sl-ink .hui-sl-ic{background-color:var(--casora-soft-slider-ink, ' + T.ink + ');}'
        + '.hui-sl.drag .hui-sl-ink{transition:none;}'
        + '@media (prefers-reduced-motion:reduce){.hui-sl-fill,.hui-sl-ink{transition:none;}}'
        + '</style>'
        + '<div class="hui-sl" data-casora-axis="x" data-casora-slider="' + payload + '">'
        +   '<div class="hui-sl-fill"' + live.replace(' data-casora-invert="1"', '')
        +     (live ? ' data-casora-axis="x"' : '') + ' style="width:' + v + '%"></div>'
        +   '<div class="hui-sl-val">' + v + ' %</div>'
        +   glyph
        +   '<div class="hui-sl-ink" aria-hidden="true" style="clip-path:inset(0 ' + (100 - v) + '% 0 0)">'
        +     '<div class="hui-sl-val">' + v + ' %</div>' + glyph + '</div>'
        + '</div>';
      return '<div style="font-family:' + T.font + ';">' + sOut + '</div>';
    }
    var out = '<style>'
      + 'ha-card.disabled{pointer-events:auto!important;}'
      + '.hui-sl-wrap{display:flex;justify-content:center;}'
      + '.hui-sl{position:relative;width:' + w + 'px;height:' + h + 'px;'
      +   'border-radius:var(--casora-popup-control-radius, 37px);overflow:hidden;'
      +   'background:var(--casora-popup-slider-track, rgba(0,0,0,0.34));'
      +   'cursor:ns-resize;touch-action:none;user-select:none;-webkit-user-select:none;}'
      + '.hui-sl-fill{position:absolute;left:0;right:0;'
      +   (inv ? 'top:0;' : 'bottom:0;')
      +   'background:var(--casora-popup-slider-fill, var(--casora-color-teal, #00C3D0));'
      +   'transition:height .18s cubic-bezier(.36,0,.16,1);}'
      + '.hui-sl.drag .hui-sl-fill{transition:none;}'
      + '.hui-sl-ic{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);'
      +   'width:30px;height:30px;pointer-events:none;'
      +   'background-color:var(--casora-popup-slider-icon, #ffffff);}'
      + '@media (prefers-reduced-motion:reduce){.hui-sl-fill{transition:none;}}'
      + '</style>'
      + '<div class="hui-sl-wrap"><div class="hui-sl" data-casora-slider="' + payload + '">'
      +   '<div class="hui-sl-fill"' + live + ' style="height:' + fillPct + '%"></div>'
      +   glyph
      + '</div></div>';
    return '<div style="font-family:' + T.font + ';">' + out + '</div>';
  }

  function note(text) {
    if (soft()) {
      return '<div style="font-family:' + T.font + ';font-size:13px;font-weight:500;line-height:1.4;color:' + S.sub
        + ';padding:4px 6px 0;text-align:left;">' + esc(text) + '</div>';
    }
    return '<div style="font-family:' + T.font + ';font-size:13px;color:' + T.ink3
      + ';padding:2px 4px 0;text-align:left;">' + esc(text) + '</div>';
  }

  // KI-Karte im Weich-Stil (Lüftungs-Coach, Pflanzen-/Aquarium-Doktor): Etikett darüber,
  // Sand-Platte, runder Knopf mit Funkel-Symbol. Nur Weich – sonst null, der Aufrufer
  // baut seine bisherige Karte. body/foot sind fertiges HTML, btnSvc ein fertiges Attribut.
  function kiCard(o) {
    if (!soft()) return null;
    o = o || {};
    var out = o.title ? softLabel(o.title) : '';
    out += '<div style="background:' + S.row + ';border-radius:' + S.radius + ';padding:18px 20px 20px;">'
      + (o.body || '')
      + (o.foot ? '<div style="font-size:12.5px;font-weight:500;color:' + S.sub + ';margin-top:10px;">' + o.foot + '</div>' : '')
      + (o.btnText
          ? '<span' + (o.btnSvc || '') + ' style="display:inline-flex;align-items:center;gap:7px;cursor:pointer;'
            + 'font-size:13px;font-weight:700;padding:11px 18px;border-radius:999px;margin-top:16px;'
            + (o.primary
                ? 'color:var(--casora-soft-ki-ink, #fff);background:var(--casora-soft-ki, var(--casora-color-teal, #4E9E95));'
                  + 'box-shadow:var(--casora-soft-ki-shadow, none);'
                : 'color:' + T.ink + ';background:' + S.ctl + ';')
            + '"><ha-icon icon="mdi:creation" style="--mdc-icon-size:16px;width:16px;height:16px;display:flex;'
            + 'align-items:center;justify-content:center;color:inherit;pointer-events:none;"></ha-icon>'
            + '<span style="pointer-events:none;">' + esc(o.btnText) + '</span></span>'
          : '')
      + '</div>';
    return '<div style="font-family:' + T.font + ';text-align:left;' + (o.wrapStyle || '') + '">' + out + '</div>';
  }

  // Rollo, Fensterladen und Fenster-Behang sind im Popup alle „Jalousien“ (07.10.2026): vorher stand
  // eine Jalousie mit Geräteklasse shutter unter „Fensterläden“, Titel und Kachel sagten „Jalousie“.
  // Eine Gruppe, dieselben Lamellen-Symbole wie die Kachel (cover_open/cover_closed – vorher zeigte ein
  // Popup Lamellen im Kopf, Vorhang am Regler und Fenster in den Zeilen, Audit M2).
  // Vorhang, Markise, Tür, Garage und Tor bleiben eigene Gruppen. Reihenfolge = Namens-Raten unten.
  var BLIND = { key: 'blind', label: 'Jalousien', open: 'cover_open', closed: 'cover_closed' };
  var COVER_KINDS = {
    curtain: { key: 'curtain', label: 'Vorhänge',     open: 'curtain-open',         closed: 'curtain-closed' },
    blind:   BLIND,
    shade:   BLIND,
    shutter: BLIND,
    awning:  { key: 'awning',  label: 'Markisen',     open: 'window-shade-open',    closed: 'window-shade-closed' },
    window:  BLIND,
    door:    { key: 'door',    label: 'Türen',        open: 'door-open',            closed: 'door-closed' },
    garage:  { key: 'garage',  label: 'Garage',       open: 'door-open',            closed: 'door-closed' },
    gate:    { key: 'gate',    label: 'Tore',         open: 'door-open',            closed: 'door-closed' },
  };
  // device_class first, then a guess from the entity_id, then curtain.
  window.casoraCoverKind = function (dc, id) {
    var k = String(dc == null ? '' : dc).toLowerCase();
    if (COVER_KINDS[k]) return COVER_KINDS[k];
    var n = String(id == null ? '' : id).toLowerCase();
    var keys = Object.keys(COVER_KINDS);
    for (var i = 0; i < keys.length; i++) {
      if (n.indexOf(keys[i]) !== -1) return COVER_KINDS[keys[i]];
    }
    // Ohne Geräteklasse und ohne Hinweis im Namen: Jalousie wie die Kachel (vorher Vorhang).
    return COVER_KINDS.blind;
  };


  var PLANT_CACHE_V = 1;
  function plantWater(node, entityId, dryPct) {
    if (!node || !entityId) return;
    var hass = (document.querySelector('home-assistant') || {}).hass;
    if (!hass || !hass.callWS) return;
    var key = 'v' + PLANT_CACHE_V + ':' + entityId;
    window._casoraPlantW = window._casoraPlantW || {};
    var hit = window._casoraPlantW[key];
    if (hit && Date.now() - hit.at < 300000) { paintPlant(node, hit.txt); return; }

    var end = new Date();
    var start = new Date(end.getTime() - 14 * 86400000);
    var stat = hass.callWS({
      type: 'recorder/statistics_during_period',
      start_time: start.toISOString(), end_time: end.toISOString(),
      statistic_ids: [entityId], period: 'hour', types: ['mean'],
    }).then(function (r) {
      var pts = (r && r[entityId]) || [];
      return pts.map(function (p) { return { t: p.start, v: p.mean }; });
    }).catch(function () { return []; });

    stat.then(function (pts) {
      if (pts.length >= 6) return pts;
      // Statistics are not being kept for this sensor - take what history has.
      return hass.callWS({
        type: 'history/history_during_period',
        start_time: start.toISOString(), end_time: end.toISOString(),
        entity_ids: [entityId], minimal_response: true, no_attributes: true,
      }).then(function (r) {
        var raw = (r && r[entityId]) || [];
        return raw.map(function (p) {
          return { t: (p.lu != null ? p.lu * 1000 : p.last_updated), v: parseFloat(p.s || p.state) };
        }).filter(function (p) { return isFinite(p.v); });
      }).catch(function () { return []; });
    }).then(function (pts) {
      var txt = readPlant(pts, dryPct);
      window._casoraPlantW[key] = { at: Date.now(), txt: txt };
      paintPlant(node, txt);
    });
  }

  function paintPlant(node, txt) {
    if (!node) return;
    node.textContent = txt || '';
    node.style.opacity = txt ? '1' : '0';
  }

  function readPlant(pts, dryPct) {
    pts = (pts || []).filter(function (p) { return p && isFinite(p.v) && p.t; })
      .sort(function (a, b) { return new Date(a.t) - new Date(b.t); });
    if (pts.length < 4) return '';
    var ms = function (p) { return new Date(p.t).getTime(); };
    var watered = null;
    for (var i = pts.length - 1; i > 0; i--) {
      if (pts[i].v - pts[i - 1].v >= 8) { watered = pts[i]; break; }
    }
    var bits = [];
    if (watered) {
      var d0 = new Date(); d0.setHours(0, 0, 0, 0);
      var dw = new Date(ms(watered)); dw.setHours(0, 0, 0, 0);
      var days = Math.round((d0 - dw) / 86400000);
      bits.push(days <= 0 ? 'Heute gegossen'
        : days === 1 ? 'Gestern gegossen' : 'Vor ' + days + ' Tagen gegossen');
    }
    // Drying rate from the tail since the last watering, in points per day.
    var tail = watered ? pts.filter(function (p) { return ms(p) >= ms(watered); }) : pts;
    if (tail.length >= 4) {
      var first = tail[0], last = tail[tail.length - 1];
      var spanD = (ms(last) - ms(first)) / 86400000;
      var drop = first.v - last.v;
      if (spanD >= 0.4 && drop > 0.5) {
        var perDay = drop / spanD;
        var floorPct = isFinite(dryPct) ? dryPct : 20;
        var left = (last.v - floorPct) / perDay;
        if (left >= 1 && left < 60) {
          bits.push('trocken in etwa ' + Math.round(left)
            + (Math.round(left) === 1 ? ' Tag' : ' Tagen'));
        }
      }
    }
    return bits.join(' · ');
  }

  window._casoraUI = { line: softLine, hero: hero, headline: headline, group: group, legend: legend, note: note, kiCard: kiCard, shelf: shelf, mediaRow: mediaRow, segments: segments, slider: slider, icon: icon, esc: esc, prime: prime, plantWater: plantWater, soft: soft, label: softLabel, tokens: T, v: 148 };
  window._casoraUI.more = more;
})();
// Zustandstext für die Oberfläche – nie ein roher englischer HA-Zustand („Unavailable“,
// „Jammed“ …). Reihenfolge: eigene Liste der Vorlage (map) → Casoras Liste je Domäne →
// hass.formatEntityState (Sprache des Nutzers) → roher Zustand mit großem Anfangsbuchstaben.
// Die deutschen Texte übersetzt casora-i18n wie jeden anderen Vorlagentext.
//   window._casoraStateText(hass, stateObj, { unavailable: 'Offline' })
(function () {
  if (window._casoraStateText) return;
  var ALL = { unavailable: 'Nicht verfügbar', unknown: 'Unbekannt' };
  var DOM = {
    lock: { locked: 'Verriegelt', unlocked: 'Entriegelt', locking: 'Wird verriegelt…',
      unlocking: 'Wird entriegelt…', jammed: 'Klemmt', open: 'Geöffnet', opening: 'Wird geöffnet…' },
    cover: { open: 'Geöffnet', closed: 'Geschlossen', opening: 'Öffnet', closing: 'Schließt', stopped: 'Gestoppt' },
  };
  var BOOL = { on: 'An', off: 'Aus' };
  window._casoraStateText = function (hass, e, map) {
    var s = String((e && e.state) == null ? '' : e.state).toLowerCase();
    var own = map || {};
    if (!e) return own.unknown || ALL.unknown;
    if (Object.prototype.hasOwnProperty.call(own, s)) return own[s];
    var dom = String(e.entity_id || '').split('.')[0];
    var d = DOM[dom];
    if (d && d[s]) return d[s];
    if (ALL[s]) return ALL[s];
    try {
      var f = hass && typeof hass.formatEntityState === 'function' ? hass.formatEntityState(e) : '';
      if (f && String(f).toLowerCase() !== s) return String(f);
    } catch (err) { /* Entität halb geladen */ }
    if (BOOL[s]) return BOOL[s];
    return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : ALL.unknown;
  };
})();
/* Sicherheits-Symbole an einer Stelle (03.10.2026): Kontakt-/Schloss-/Alarm-Unter-Badges
   (casora_badge_contact_group) und das Mitteilungszentrum nehmen dasselbe Symbol für denselben
   Zustand. Alarm-Modi wie im Alarm-Popup (casora_badge_security: Zuhause/Abwesend/Nacht/Urlaub/
   Bypass), unscharf und ausgelöst wie die Alarm-Unter-Badge. Tor/Garage = Tür wie in den Badges.
   id = Entität, s = Zustand, attrs = Attribute (device_class, friendly_name). */
window.casoraSecurityIcon = window.casoraSecurityIcon || function (id, s, attrs) {
  var dom = String(id || '').split('.')[0];
  var st = String(s == null ? '' : s).toLowerCase();
  var a = attrs || {};
  var dcl = String(a.device_class || '').toLowerCase();
  var nm = String(a.friendly_name || '').toLowerCase();
  if (!st || st === 'unknown' || st === 'unavailable') return 'default';
  if (dom === 'lock') return st === 'locked' ? 'lock-fill' : 'lock-open-fill';
  if (dom === 'alarm_control_panel') {
    var MODE = { armed_home: 'shield_check', armed_away: 'shield_lock', armed_night: 'shield_moon',
      armed_vacation: 'shield_vacation', armed_custom_bypass: 'shield_bypass' };
    /* Weich (05.10.2026): unscharf = durchgestrichenes Schild wie die Alarm-Kachel. */
    if (st === 'disarmed' && window._casoraSoft && window._casoraSoft()) return 'shield_off';
    return MODE[st] || ((st === 'disarmed' || st === 'triggered') ? 'shield_alarm' : 'shield_check');
  }
  if (dom === 'binary_sensor' || dom === 'cover') {
    var isWindow = dcl === 'window' || nm.indexOf('fenster') > -1 || nm.indexOf('window') > -1;
    var open = st === 'on' || st === 'open' || st === 'opening';
    return isWindow ? (open ? 'window-open' : 'window-closed') : (open ? 'door-open' : 'door-closed');
  }
  return 'lock';
};
(function () {
  if (window._casoraNotify) return;

  var HOURS = 24;
  var MAX_ROWS = 40;
  var DEDUPE_MS = 5 * 60 * 1000;
  // One flapping device must not be able to fill the panel on its own.
  var PER_ENTITY_MAX = 3;
  var POLL_MS = 60000;
  // A battery has to read low for this long before it counts; devices glitch.
  var BATTERY_HOLD_MIN = 30;
  var KEY = 'casora_notify_read_v1';
  var COUNT_IN_BADGE = true;

  // Tür/Fenster nur dem Namen der Geräteklasse nach (Tankerkönig-Status …): window.casoraNotAnOpening
  // aus 00-finden.js; lädt das (noch) nicht, wenigstens die bekannten Plattformen.
  function notAnOpening(hass, id) {
    if (typeof window.casoraNotAnOpening === 'function') {
      try { return !!window.casoraNotAnOpening(hass, id); } catch (e) { return false; }
    }
    var e = hass && hass.entities && hass.entities[id];
    return !!(e && e.platform === 'tankerkoenig');
  }

  function iconUrl(name) {
    return (typeof window.casoraIconUrl === 'function')
      ? window.casoraIconUrl(name) : '/casora_assets/icons/' + name + '.svg';
  }

  function ha() { return document.querySelector('home-assistant'); }
  function hassOf() { var h = ha(); return h && h.hass; }

  var READ_ENTITY = 'input_datetime.casora_notifications_read';

  function readEntityId() {
    if (window.CASORA_NOTIFY_READ_ENTITY) return window.CASORA_NOTIFY_READ_ENTITY;
    var h = hassOf();
    if (h && h.states && h.states[READ_ENTITY]) return READ_ENTITY;
    return null;
  }

  function sharedRead() {
    var id = readEntityId();
    if (!id) return null;
    var h = hassOf();
    var st = h && h.states && h.states[id];
    if (!st) return null;
    var ms;
    if (id.indexOf('input_datetime.') === 0) {
      var ts = st.attributes && Number(st.attributes.timestamp);
      ms = isFinite(ts) ? ts * 1000 : NaN;
    } else {
      ms = parseFloat(st.state);
    }
    if (!isFinite(ms)) return null;
    if (ms < Date.now() - 90 * 864e5) return null;
    return ms;
  }

  function writeShared(ts) {
    var id = readEntityId();
    if (!id) return false;
    var h = hassOf();
    if (!h || !h.callWS) return false;
    // Beim Herunterfahren von HA schlägt das Schreiben fehl – callService machte daraus
    // einen Fehler-Toast. Darum getrennt prüfen und über callWS still schreiben
    // (übernommen aus Hemma 2.2.0, MIT).
    if (h.connection && h.connection.connected === false) return false;
    var dom = String(id).split('.')[0];
    var service, data;
    if (dom === 'input_datetime') {
      service = 'set_datetime';
      data = { entity_id: id, timestamp: Math.round(ts / 1000) };
    } else if (dom === 'input_text') {
      service = 'set_value';
      data = { entity_id: id, value: String(ts) };
    } else if (dom === 'input_number') {
      service = 'set_value';
      data = { entity_id: id, value: ts };
    } else {
      return false;
    }
    try {
      Promise.resolve(h.callWS({ type: 'call_service', domain: dom, service: service, service_data: data }))
        .catch(function () {
          try { localStorage.setItem(KEY, String(ts)); } catch (e) {}
        });
    } catch (e) { return false; }
    return true;
  }

  var _sealedAt = 0;

  function watermark() {
    var shared = sharedRead();
    if (shared !== null) return Math.max(shared, _sealedAt);
    if (_sealedAt) return _sealedAt;
    try {
      var v = parseFloat(localStorage.getItem(KEY));
      if (isFinite(v)) return v;
    } catch (e) {}
    // A first run must not open on 24 hours of red.
    var now = Date.now();
    try { localStorage.setItem(KEY, String(now)); } catch (e) {}
    return now;
  }

  function setWatermark(ts) {
    _sealedAt = ts;
    if (writeShared(ts)) return;
    try { localStorage.setItem(KEY, String(ts)); } catch (e) {}
  }

  function nameOf(st) {
    return (st && st.attributes && st.attributes.friendly_name) || (st && st.entity_id) || '';
  }

  function tidyName(n) {
    var s = String(n || '').trim().replace(/\s+/g, ' ');
    var out = s.replace(/\s+(sensor|contact)$/i, '');
    var w = out.split(' ');
    while (w.length > 1
      && w[w.length - 1].toLowerCase() === w[w.length - 2].toLowerCase()) {
      w.pop();
    }
    out = w.join(' ');
    return out || s;
  }

  function dc(st) {
    return (st && st.attributes && st.attributes.device_class) || '';
  }

  /* Kalendertage seit „vor m Minuten“ (#11): vor 36 Stunden ist gestern, nicht „vor 2 Tagen“.
     Für alle „vor X T.“/„vor X Tagen“ der Module (statt Math.round(m / 1440)). */
  window.casoraDaysAgo = function (m) {
    var now = new Date(Date.now()), then = new Date(Date.now() - Math.max(0, Number(m) || 0) * 60000);
    return Math.max(1, Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate())
      - new Date(then.getFullYear(), then.getMonth(), then.getDate())) / 86400000));
  };
  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'Gerade eben';
    var m = Math.round(s / 60);
    if (m < 60) return 'vor ' + m + ' Min.';
    var h = Math.round(m / 60);
    // Kalendertage statt 24-h-Blöcke: vor 36 Stunden ist noch „Gestern“ (#11).
    var d = Math.round((new Date(new Date().setHours(0, 0, 0, 0)) - new Date(new Date(ms).setHours(0, 0, 0, 0))) / 86400000);
    if (h < 24 || d < 1) return 'vor ' + h + ' Std.';
    return d === 1 ? 'Gestern' : 'vor ' + d + ' Tagen';
  }


  var ALARM_WORD = {
    armed_home: 'Alarm scharf – Zuhause',
    armed_away: 'Alarm scharf – Abwesend',
    armed_night: 'Alarm scharf – Nacht',
    armed_vacation: 'Alarm scharf – Urlaub',
    armed_custom_bypass: 'Alarm scharf – Bypass',
    disarmed: 'Alarm deaktiviert',
    triggered: 'Alarm ausgelöst',
  };

  var VACUUM_BUSY = { cleaning: 1, returning: 1 };
  var VACUUM_DONE = { docked: 1, idle: 1 };

  // ── Saugroboter: Zwischenstopp oder fertig? (1.0.7) ───────────────────────────────────────
  // Viele Sauger fahren mitten in der Reinigung zur Station (Mopp waschen, absaugen, laden) und
  // melden dabei „docked“. Früher war jedes Andocken nach „cleaning“ ein „fertig“. Jetzt gilt für
  // alle Hersteller dieselbe Regel, live wie beim Rückbau aus dem Logbuch:
  //   1. Verrät die Integration einen Zwischenstopp (Status „washing_the_mop“, „emptying“,
  //      „drying“, „charging“ bei Fortschritt unter 100 % …), ist das kein Ende, sondern eine
  //      laufende Zeile „Pause · wäscht Mopp“.
  //   2. Eindeutiges Ende (Fortschritt 100 % aus dieser Reinigung, „Letztes Reinigungsende“ nach
  //      dem Beginn, Status „completed/finished“) zählt sofort.
  //   3. Sonst ist der Sauger erst nach VAC_QUIET_MS Ruhe an der Station fertig. Fährt er vorher
  //      wieder los, bleibt es dieselbe Reinigung. Meldezeit ist das Andocken.
  var VAC_QUIET_MS = 10 * 60 * 1000;
  // Ein Zwischenstopp hält höchstens so lange, danach gilt die Ruhe-Regel (Status hängt fest).
  var VAC_PAUSE_MAX_MS = 3 * 3600 * 1000;
  var VAC_PAUSE_KEY = 'casora_notify_vacpause_v1';
  var VAC_FINISHED = /^(complete|completed|finished|done|task_complete|clean(ing)?_(complete|completed|finished|done))$/;

  function vacNorm(x) {
    return String(x == null ? '' : x).trim().toLowerCase().replace(/[\s-]+/g, '_');
  }

  // Grund des Zwischenstopps aus einem Status-Text oder null. charging nur mit Fortschritt < 100.
  function vacPauseWord(s, partial) {
    if (!s || VAC_FINISHED.test(s)) return null;
    if (/wash|mop_?clean|self_?clean/.test(s)) return 'wäscht Mopp';
    if (/empt|evacuat|dust_?collect|collecting_dust/.test(s)) return 'saugt ab';
    if (/dry/.test(s)) return 'trocknet';
    if (/charg/.test(s) && !/complete|problem|error|disconnect/.test(s)) return partial ? 'lädt' : null;
    if (/^(returning|going|back)_to_(dock_)?(wash|empty|base)|remote|manual|^(cleaning|spot|zoned|segment|room|mopping|sweeping|vacuuming)/.test(s)) return 'an der Station';
    return null;
  }

  // Zugehörige Sensoren: Saugroboter-Popup (translation_keys, Station als Geschwister-Gerät),
  // sonst gleiches Gerät oder gleicher Entitäts-Präfix.
  function vacSide(hass, id) {
    var S = hass.states || {};
    var out = { status: null, progress: null, lastEnd: null };
    try {
      var VC = window._casoraVac;
      if (VC && VC.resolve && S[id]) {
        var c = VC.resolve(S[id], {}, S, hass);
        out.status = c.status || null; out.progress = c.progress || null; out.lastEnd = c.lastEnd || null;
      }
    } catch (e) { /* Rückfall unten */ }
    if (out.status && out.progress && out.lastEnd) return out;
    var reg = hass.entities || {};
    var dev = reg[id] && reg[id].device_id;
    var base = id.replace(/^vacuum\./, '');
    var mine = Object.keys(S).filter(function (e) {
      if (e.indexOf('sensor.') !== 0) return false;
      if (dev && reg[e] && reg[e].device_id === dev) return true;
      return e.indexOf('sensor.' + base + '_') === 0;
    });
    var pick = function (re, test) {
      return mine.filter(function (e) {
        var r = reg[e] || {};
        return re.test(e + ' ' + (r.translation_key || '')) && (!test || test(S[e]));
      })[0] || null;
    };
    var isTime = function (st) { return isFinite(Date.parse(st && st.state)); };
    var isNum = function (st) { return st && isFinite(parseFloat(st.state)); };
    out.lastEnd = out.lastEnd || pick(/last_clean(ing)?_end|clean(ing)?_end_time|letztes_reinigungsende/, isTime);
    out.progress = out.progress || pick(/clean_percent|clean(ing)?_progress|progress|fortschritt/, isNum);
    out.status = out.status || pick(/(^|_)(status|state|task_status|zustand)(\s|$)|_status\s/, function (st) {
      return st && !isNum(st) && !isTime(st);
    });
    return out;
  }

  function vacPauseMemo() {
    try {
      var v = JSON.parse(localStorage.getItem(VAC_PAUSE_KEY) || '{}');
      return v && typeof v === 'object' ? v : {};
    } catch (e) { return {}; }
  }

  // Zustand jetzt: { done, pause, word, partial }.
  function vacNow(hass, id, start) {
    var S = hass.states || {};
    var side = vacSide(hass, id);
    var st = S[id] || {};
    var a = st.attributes || {};
    var fresh = function (e) {
      var t = Date.parse((S[e] || {}).last_changed || '');
      return isFinite(t) && t >= start - 60000;
    };
    var pct = side.progress && S[side.progress] ? parseFloat(S[side.progress].state) : NaN;
    var pctFresh = isFinite(pct) && fresh(side.progress);
    var end = side.lastEnd && S[side.lastEnd] ? Date.parse(S[side.lastEnd].state) : NaN;
    var texts = [side.status && S[side.status] && S[side.status].state, a.status, a.task_status, a.state_detail]
      .map(vacNorm).filter(function (s) { return s && !DEAD.test(s); });
    var finished = (pctFresh && pct >= 100)
      || (isFinite(end) && end >= start - 60000)
      || texts.some(function (s) { return VAC_FINISHED.test(s); });
    if (finished) return { done: true };
    // 0 % heißt meist „zurückgesetzt“ (auch nach einem Neustart frisch), kein halber Lauf.
    var partial = pctFresh && pct > 0 && pct < 100;
    var word = null;
    texts.some(function (s) { word = vacPauseWord(s, partial); return !!word; });
    if (!word && partial) word = 'an der Station';
    return { done: false, pause: !!word, word: word, pct: pctFresh ? pct : null };
  }

  // timeline: [{ when (ms), state }] eines Saugers, aufsteigend, ohne unavailable/unknown.
  // Liefert { done: [{ when, start }], pause: { when, start, word } | null, paused: [Andockzeiten] }.
  function vacuumRuns(hass, id, timeline, now) {
    var memo = (vacPauseMemo()[id] || []);
    var res = { done: [], pause: null, paused: [] };
    var run = null;
    (timeline || []).forEach(function (e) {
      var s = e.state;
      if (VACUUM_BUSY[s]) {
        if (!run) { run = { start: e.when, dock: null }; return; }
        if (run.dock == null) return;
        // Wieder los: innerhalb der Ruhezeit oder bei gemerktem Zwischenstopp dieselbe Reinigung.
        if (e.when - run.dock < VAC_QUIET_MS || memo.indexOf(run.dock) !== -1) { run.dock = null; return; }
        res.done.push({ when: run.dock, start: run.start });
        run = { start: e.when, dock: null };
      } else if (VACUUM_DONE[s]) {
        if (run && run.dock == null) run.dock = e.when;
      }
    });
    if (!run || run.dock == null) return res;
    var last = timeline[timeline.length - 1];
    if (!last || !VACUUM_DONE[last.state]) return res;
    var info = vacNow(hass, id, run.start);
    if (info.done) { res.done.push({ when: run.dock, start: run.start }); return res; }
    if (info.pause && now - run.dock < VAC_PAUSE_MAX_MS) {
      res.pause = { when: run.dock, start: run.start, word: info.word };
      res.paused.push(run.dock);
      return res;
    }
    if (now - run.dock >= VAC_QUIET_MS) res.done.push({ when: run.dock, start: run.start });
    return res;
  }

  // Every category is on unless a dashboard turns it off.
  function on(type) {
    var t = window.CASORA_NOTIFY_TYPES;
    return !t || t[type] !== false;
  }

  function appliances() {
    var list = window.CASORA_NOTIFY_APPLIANCES;
    if (!Array.isArray(list)) return [];
    return list.filter(Boolean).map(function (a) {
      return typeof a === 'string' ? { entity: a } : a;
    }).filter(function (a) { return a && a.entity; });
  }

  function applianceFor(id) {
    var all = appliances();
    for (var i = 0; i < all.length; i++) if (all[i].entity === id) return all[i];
    return null;
  }

  function minutesLeft(st) {
    if (!st) return null;
    var a = st.attributes || {};
    if (a.device_class === 'timestamp') {
      var t = Date.parse(st.state);
      if (!isFinite(t)) return null;
      return Math.max(0, Math.round((t - Date.now()) / 60000));
    }
    var n = parseFloat(st.state);
    if (!isFinite(n)) return null;
    var u = String(a.unit_of_measurement || '').toLowerCase();
    if (u === 's' || u === 'sec' || u === 'seconds') return Math.round(n / 60);
    if (u === 'h' || u === 'hr' || u === 'hours') return Math.round(n * 60);
    return Math.round(n);
  }

  var PLANT_WORD = {
    'moisture:Low': 'braucht Wasser',
    'moisture:High': 'steht zu nass',
    'conductivity:Low': 'braucht Dünger',
    'conductivity:High': 'ist überdüngt',
    'illuminance:Low': 'braucht mehr Licht',
    'illuminance:High': 'bekommt zu viel Sonne',
    'dli:Low': 'braucht mehr Licht',
    'dli:High': 'bekommt zu viel Sonne',
    'temperature:Low': 'steht zu kalt',
    'temperature:High': 'steht zu warm',
    'humidity:Low': 'steht in zu trockener Luft',
    'humidity:High': 'steht in zu feuchter Luft',
  };

  var APPLIANCE_DONE = /^(off|idle|finished|complete|completed|standby|end|ready)$/i;
  var APPLIANCE_BUSY = /^(on|run|running|active|washing|rinsing|spinning|drying|printing|busy)$/i;

  function isDoorbell(id, st) {
    if (id.indexOf('event.') === 0) return dc(st) === 'doorbell';
    if (id.indexOf('binary_sensor.') === 0) {
      return dc(st) === 'occupancy' && /doorbell|ding|chime/i.test(id);
    }
    return false;
  }

  // Entities whose past matters. Everything else is read from current state.
  // Custom notification sources, so a letterbox or a bin collection does not
  // mean patching this file and merging it again on every update. See #71.
  function exts() {
    var x = window.CASORA_NOTIFY_EXTENSIONS;
    return Array.isArray(x) ? x : [];
  }

  function extApi() {
    return { on: on, nameOf: nameOf, tidyName: tidyName, dc: dc };
  }

  function eachExt(name, fn) {
    exts().forEach(function (e) {
      if (!e || typeof e[name] !== 'function') return;
      try { fn(e); } catch (err) {
        console.warn('Casora notify extension (' + name + '):', err);
      }
    });
  }

  function watched(hass) {
    var out = [];
    var appl = appliances().map(function (a) { return a.entity; });
    Object.keys(hass.states).forEach(function (id) {
      var st = hass.states[id];
      if (on('locks') && id.indexOf('lock.') === 0) return void out.push(id);
      if (on('alarm') && id.indexOf('alarm_control_panel.') === 0) return void out.push(id);
      if (on('vacuum') && id.indexOf('vacuum.') === 0) return void out.push(id);
      if (on('doorbell') && isDoorbell(id, st)) return void out.push(id);
      if (on('people') && id.indexOf('person.') === 0) return void out.push(id);
      if (on('appliances') && appl.indexOf(id) !== -1) return void out.push(id);
    });
    eachExt('watch', function (e) {
      (e.watch(hass, extApi()) || []).forEach(function (id) {
        if (out.indexOf(id) === -1) out.push(id);
      });
    });
    return out;
  }

  // entry: a logbook row. prev: that entity's previous state in the window.
  function describe(entry, st, prev) {
    // undefined means "not mine", so the built-in rules still run. null means
    // "mine, and deliberately not a row".
    var ex = exts();
    for (var xi = 0; xi < ex.length; xi++) {
      if (!ex[xi] || typeof ex[xi].describe !== 'function') continue;
      try {
        var xr = ex[xi].describe(entry, st, prev, extApi());
        if (xr !== undefined) return xr;
      } catch (err) { console.warn('Casora notify extension (describe):', err); }
    }
    var id = entry.entity_id || '';
    var s = String(entry.state == null ? '' : entry.state);
    var name = entry.name || nameOf(st);
    // Neustart oder kurzer Ausfall: unavailable/unknown → alter Zustand ist keine Neuigkeit
    // (sonst nach jedem HA-Neustart „Schloss verriegelt“, „… hat das Haus verlassen“ usw.).
    if (prev !== undefined && (/^(unavailable|unknown)$/.test(prev) || prev === s)) return null;

    if (id.indexOf('lock.') === 0) {
      var lk = { opens: ['casora_badge_lock_group', 'casora_popup_lock'] };
      // Symbole wie die Schloss-Unter-Badge (window.casoraSecurityIcon); sec = ruhiges Farbsystem.
      if (s === 'locked') return { label: name + ' verriegelt', icon: window.casoraSecurityIcon(id, s, st && st.attributes), tone: 'good', sec: true, opens: lk.opens };
      if (s === 'unlocked') return { label: name + ' entriegelt', icon: window.casoraSecurityIcon(id, s, st && st.attributes), tone: 'warn', sec: true, opens: lk.opens };
      if (s === 'jammed') return { label: name + ' klemmt', icon: 'exclamation', tone: 'bad', sec: true, opens: lk.opens };
      return null;
    }

    if (id.indexOf('person.') === 0) {
      var AWAY = 'var(--casora-color-blue, #0A84FF)';
      var pic = st && st.attributes && st.attributes.entity_picture;
      var who = {
        once: 'person:' + name, icon: 'person',
        image: pic || undefined, imageFit: 'cover',
      };
      if (s === 'home') {
        return { label: name + ' ist angekommen', tone: 'good', icon: who.icon,
          image: who.image, imageFit: who.imageFit, once: who.once };
      }
      if (s === 'not_home') {
        return { label: name + ' hat das Haus verlassen', tone: AWAY, icon: who.icon,
          image: who.image, imageFit: who.imageFit, once: who.once };
      }
      if (s && s !== 'unknown' && s !== 'unavailable') {
        return { label: name + ' ist bei ' + s, tone: AWAY, icon: who.icon,
          image: who.image, imageFit: who.imageFit, once: who.once };
      }
      return null;
    }

    if (id.indexOf('alarm_control_panel.') === 0) {
      var word = ALARM_WORD[s];
      if (!word) return null;
      /* Weich: dieselben Wörter wie Kachel, Badge und Popup (casoraSecurityWord, 00-finden.js). */
      if (window._casoraSoft && window._casoraSoft() && window.casoraSecurityWord && window.casoraSecurityWord(id, s))
        word = 'Alarm ' + window.casoraSecurityWord(id, s).replace(/^./, function (c) { return c.toLowerCase(); });
      return {
        label: word,
        icon: window.casoraSecurityIcon(id, s, st && st.attributes),
        tone: s === 'triggered' ? 'bad' : s === 'disarmed' ? 'warn' : 'good',
        sec: true,
      };
    }

    if (id.indexOf('vacuum.') === 0) {
      // Fertig entscheidet vacuumRuns() über den ganzen Ablauf (Zwischenstopps), nicht das Andocken.
      if (s === 'error') return { label: name + ' braucht Aufmerksamkeit', icon: 'vacuum', tone: 'bad' };
      return null;
    }

    if (isDoorbell(id, st)) {
      // "Front Door Ding" is the entity, "Front Door" is the thing that rang.
      var who = name.replace(/\s+(ding|doorbell|chime|button)$/i, '');
      return { label: (who || name) + ' hat geklingelt', icon: 'doorbell', tone: 'accent' };
    }

    var appl = applianceFor(id);
    if (appl) {
      var done = appl.done ? new RegExp('^' + appl.done + '$', 'i') : APPLIANCE_DONE;
      if (done.test(s) && APPLIANCE_BUSY.test(prev || '')) {
        return { label: (appl.name || name) + ' fertig', icon: 'default', tone: 'good', done: true };
      }
      return null;
    }

    return null;
  }


  // Offen seit (1.0.5): die Integration merkt sich je Kontakt den echten Öffnungszeitpunkt
  // (sensor.casora_media_paused, Attribut contacts) über Neustarts hinweg. Ohne Eintrag,
  // bei geschlossenem Kontakt oder einem Merkwert nach last_changed zählt last_changed.
  function openSince(st, states) {
    if (!st) return undefined;
    try {
      var all = states || (hassOf() || {}).states || {};
      var memo = all['sensor.casora_media_paused'];
      var map = memo && memo.attributes && memo.attributes.contacts;
      var e = map && st.entity_id ? map[st.entity_id] : null;
      var t = e && e.since ? Date.parse(e.since) : NaN;
      var lc = Date.parse(st.last_changed || '');
      if (String(st.state) === 'on' && isFinite(t) && (!isFinite(lc) || t <= lc + 1000)) return e.since;
    } catch (err) { /* fällt auf last_changed zurück */ }
    return st.last_changed;
  }
  window._casoraOpenSince = openSince;

  var _lowSince = {};

  // Stehende Einträge über HA-Neustarts (1.0.5): Updates, Akku, Sicherheit, Pflanzen … nahmen
  // last_changed als Zeitpunkt. Nach einem Neustart beginnt das neu, „2 Updates verfügbar“ stand
  // wieder unter „Neu“. Zeilen mit `seen` (Liste von Inhaltsschlüsseln, je Schlüssel optional mit
  // eigenem Zeitpunkt { k, t }) bekommen als Zeitpunkt den ersten Sichtungszeitpunkt ihres
  // jüngsten Schlüssels. Gleicher Inhalt bleibt gelesen, ein neuer Schlüssel (neues Update, neue
  // Version) macht die Zeile wieder neu. Verschwundene Schlüssel bleiben SEEN_GONE_MS gemerkt,
  // damit Entitäten, die nach dem Neustart erst später laden, nicht als neu zählen.
  var SEEN_KEY = 'casora_notify_seen_v1';
  var SEEN_GONE_MS = 2 * 3600 * 1000;

  function settleSeen(rows) {
    var memo;
    try { memo = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch (e) { memo = {}; }
    if (!memo || typeof memo !== 'object' || Array.isArray(memo)) memo = {};
    var before = JSON.stringify(memo);
    var now = Date.now();
    var live = {};
    rows.forEach(function (r) {
      if (!r || !r.id || !Array.isArray(r.seen) || !r.seen.length) return;
      var m = memo[r.id];
      if (!m || typeof m !== 'object') m = memo[r.id] = {};
      var natural = Math.min(Number(r.when) || now, now);
      var t = 0;
      r.seen.forEach(function (x) {
        var k = String(x && typeof x === 'object' ? x.k : x);
        var own = x && typeof x === 'object' ? Number(x.t) : NaN;
        live[r.id + '\n' + k] = 1;
        var e = m[k];
        if (!e || !isFinite(e.t)) e = m[k] = { t: isFinite(own) && own > 0 ? Math.min(own, now) : natural };
        delete e.g;
        if (e.t > t) t = e.t;
      });
      if (t) r.when = t;
    });
    Object.keys(memo).forEach(function (id) {
      var m = memo[id];
      if (!m || typeof m !== 'object') { delete memo[id]; return; }
      Object.keys(m).forEach(function (k) {
        if (live[id + '\n' + k]) return;
        var e = m[k];
        if (!e || !isFinite(e.t)) { delete m[k]; return; }
        if (!e.g) e.g = now;
        else if (now - e.g > SEEN_GONE_MS) delete m[k];
      });
      if (!Object.keys(m).length) delete memo[id];
    });
    var after = JSON.stringify(memo);
    if (after !== before) {
      try { localStorage.setItem(SEEN_KEY, after); } catch (e) { /* privat/voll */ }
    }
    return rows;
  }

  function standing(hass) {
    var rows = [];
    var S = hass.states;
    var ids = Object.keys(S);

    var updates = [];
    var restarts = [];
    ids.forEach(function (id) {
      if (id.indexOf('update.') !== 0) return;
      var st = S[id];
      var a = st.attributes || {};
      if (st.state === 'on' && !a.in_progress) { updates.push(st); return; }
      var rs = String(a.release_summary || '').toLowerCase();
      if (rs.indexOf('restart') !== -1 && st.state === 'off'
        && a.installed_version && a.installed_version === a.latest_version) {
        restarts.push(st);
      }
    });

    var newest = function (list) {
      return list.reduce(function (t, st) {
        var v = Date.parse(st.last_changed || '') || 0;
        return v > t ? v : t;
      }, 0);
    };

    if (updates.length && on('updates')) {
      rows.push({
        id: 'casora:updates',
        when: newest(updates) || Date.now(),
        label: updates.length === 1
          ? nameOf(updates[0]).replace(/\s+Update$/i, '') + ' Update verfügbar'
          : updates.length + ' Updates verfügbar',
        icon: 'updates',
        tone: 'accent',
        entity: updates[0].entity_id,
        opens: ['casora_updates', 'casora_popup_updates'],
        // Neue Version ändert nur last_updated, nicht last_changed.
        seen: updates.map(function (st) {
          return { k: st.entity_id + '@' + String((st.attributes || {}).latest_version || ''),
            t: Date.parse(st.last_updated || st.last_changed || '') };
        }),
      });
    }

    if (restarts.length && on('restart')) {
      rows.push({
        id: 'casora:restart',
        when: newest(restarts) || Date.now(),
        label: 'Neustart ausstehend',
        sub: restarts.length === 1
          ? 'Schließt das ' + nameOf(restarts[0]).replace(/\s+Update$/i, '') + '-Update ab'
          : 'Schließt ' + restarts.length + ' Updates ab',
        icon: 'exclamation',
        tone: 'warn',
        entity: restarts[0].entity_id,
        opens: ['casora_updates', 'casora_popup_updates'],
        seen: restarts.map(function (st) {
          return st.entity_id + '@' + String((st.attributes || {}).installed_version || '');
        }),
      });
    }

    var lowPct = Number(window.CASORA_NOTIFY_BATTERY);
    if (!isFinite(lowPct)) lowPct = 20;
    var holdMin = Number(window.CASORA_NOTIFY_BATTERY_HOLD);
    if (!isFinite(holdMin) || holdMin < 0) holdMin = BATTERY_HOLD_MIN;
    var nowMs = Date.now();
    var low = [];
    ids.forEach(function (id) {
      var st = S[id];
      if (dc(st) !== 'battery') return;
      var pct = null;
      var isLow;
      if (id.indexOf('sensor.') === 0) {
        pct = parseFloat(st.state);
        // Unavailable is no news: hold the clock rather than start it over.
        if (!isFinite(pct)) return;
        isLow = window.casoraBattery ? window.casoraBattery.level(pct) !== 'ok' : pct <= lowPct;
      } else if (id.indexOf('binary_sensor.') === 0) {
        if (st.state !== 'on' && st.state !== 'off') return;
        isLow = st.state === 'on';
      } else {
        return;
      }
      if (!isLow) { delete _lowSince[id]; return; }
      // 19 -> 18 moves last_changed, so only the first sighting starts the clock.
      if (!_lowSince[id]) {
        _lowSince[id] = Math.min(Date.parse(st.last_changed || '') || nowMs, nowMs);
      }
      if (nowMs - _lowSince[id] >= holdMin * 60000) low.push({ st: st, pct: pct });
    });
    if (low.length && on('battery')) {
      low.sort(function (a, b) { return (a.pct == null ? -1 : a.pct) - (b.pct == null ? -1 : b.pct); });
      rows.push({
        id: 'casora:battery',
        when: newest(low.map(function (x) { return x.st; })) || Date.now(),
        // Akku-Stufen (05.10.2026): Wort und Farbe nach der schwächsten Batterie.
        label: low.length === 1
          ? nameOf(low[0].st).replace(/\s+Battery$/i, '') + (low[0].pct != null && low[0].pct <= (window.casoraBattery ? window.casoraBattery.CRIT : 10) ? ' Akku fast leer' : ' Akku schwach')
          : low.length + ' Akkus schwach',
        value: low.length === 1 && low[0].pct != null ? Math.round(low[0].pct) + ' %' : null,
        icon: 'battery',
        tone: low.some(function (x) { return x.pct != null && x.pct <= (window.casoraBattery ? window.casoraBattery.CRIT : 10); }) ? 'bad' : 'warn',
        entity: low.length === 1 ? low[0].st.entity_id : null,
        opens: ['casora_battery', 'casora_popup_battery'],
        seen: low.map(function (x) {
          return { k: x.st.entity_id, t: Date.parse(x.st.last_changed || '') };
        }),
      });
    }

    var SAFETY = {
      moisture: { word: 'Wasser erkannt', icon: 'exclamation' },
      smoke: { word: 'Rauch erkannt', icon: 'exclamation' },
      gas: { word: 'Gas erkannt', icon: 'gas' },
      carbon_monoxide: { word: 'Kohlenmonoxid erkannt', icon: 'exclamation' },
      safety: { word: 'Sicherheitswarnung', icon: 'exclamation' },
    };
    if (on('safety')) {
      ids.forEach(function (id) {
        if (id.indexOf('binary_sensor.') !== 0) return;
        var st = S[id];
        if (st.state !== 'on') return;
        var kind = SAFETY[dc(st)];
        if (!kind) return;
        rows.push({
          id: 'casora:safety:' + id,
          when: Date.parse(st.last_changed || '') || Date.now(),
          label: kind.word,
          sub: nameOf(st),
          icon: kind.icon,
          tone: 'bad',
          entity: id,
          rank: 1,
          seen: [id + '|' + dc(st)],
        });
      });
    }

    var OPEN_OPENS = ['casora_badge_contact_group', 'casora_popup_contacts'];
    var openMins = Number(window.CASORA_NOTIFY_OPEN_MINUTES);
    if (!isFinite(openMins)) openMins = 10;
    if (on('doors') && openMins > 0) {
      // Nur Personen mit bekanntem Ort zählen – „unbekannt“ ist keine Abwesenheit.
      var people = ids.filter(function (id) {
        return id.indexOf('person.') === 0 && !/^(unknown|unavailable)?$/.test(String(S[id].state || ''));
      });
      var away = ids.some(function (id) {
        return id.indexOf('alarm_control_panel.') === 0 && /^armed_(away|vacation)$/.test(S[id].state);
      }) || (people.length > 0 && !people.some(function (id) { return S[id].state === 'home'; }));
      // Schloss mit eigenem Türsensor + Kontaktsensor an derselben Tür meldeten doppelt
      // (Hemma 2.2.0): eine Öffnung = eine Meldung. Sammeln, dann zusammenfassen (1.0.5).
      var openList = [];
      ids.forEach(function (id) {
        if (id.indexOf('binary_sensor.') !== 0) return;
        var st = S[id];
        if (st.state !== 'on') return;
        var kind = dc(st);
        if (kind !== 'door' && kind !== 'window' && kind !== 'garage_door'
          && kind !== 'opening') return;
        // Nur technisch „Tür“ (Tankerkönig-Status je Tankstelle …): keine Meldung (00-finden.js).
        if (notAnOpening(hass, id)) return;
        // Echter Öffnungszeitpunkt aus der Integration (1.0.5): nach einem HA-Neustart beginnt
        // last_changed neu, die Glocke zeigte „Seit 10 Min.“ als neue Mitteilung. `when` ist
        // zugleich der Gelesen-Schlüssel (Wasserstand), darum bleibt Gelesenes gelesen.
        var since = Date.parse(openSince(st, S) || '');
        if (!isFinite(since)) return;
        var mins = Math.round((Date.now() - since) / 60000);
        if (mins < openMins) return;
        // Raum: Bereich der Entität, sonst des Geräts, sonst Raum im Dashboard. Verglichen wird
        // immer der Raumname (vorher Bereichs-ID gegen Dashboard-Raumnamen: „wohnzimmer“ ≠
        // „Wohnzimmer“, dieselbe Tür kam doppelt).
        var openReg = (hass.entities || {})[id] || {};
        var openDev = (hass.devices || {})[openReg.device_id] || null;
        var openArea = openReg.area_id || (openDev && openDev.area_id) || '';
        var openRoom = openArea ? (((hass.areas || {})[openArea] || {}).name || '') : '';
        if (!openRoom && typeof window._casoraRoomOf === 'function') {
          try { openRoom = window._casoraRoomOf(id) || ''; } catch (e) { openRoom = ''; }
        }
        openList.push({ id: id, st: st, since: since, mins: mins, name: tidyName(nameOf(st)),
          room: openRoom, dev: openDev ? String(openDev.name_by_user || openDev.name || '') : '' });
      });
      // Kontakt + Kippsensor + Kombi-Sensor derselben Öffnung (00-finden.js, casoraOpenings):
      // nur der Hauptsensor meldet, egal ob sie im selben Bereich liegen.
      if (typeof window.casoraOpenings === 'function' && openList.length > 1) {
        try {
          var drop = {};
          window.casoraOpenings(hass, openList.map(function (o) { return o.id; })).forEach(function (u) {
            var mine = openList.filter(function (o) { return u.ids.indexOf(o.id) !== -1; });
            if (mine.length < 2) return;
            var keep = mine.filter(function (o) { return o.id === u.main; })[0] || mine[0];
            mine.forEach(function (o) { if (o !== keep) drop[o.id] = true; });
          });
          openList = openList.filter(function (o) { return !drop[o.id]; });
        } catch (e) { /* ohne Zusammenfassung weiter */ }
      }
      // Gleicher Name, gleicher (oder ein unbekannter) Raum und fast gleich lange offen: dieselbe
      // Öffnung über zwei Sensoren (Schloss-Türsensor + Kontakt, Vorlage + Kontakt).
      var SAME_OPENING_MS = 2 * 60000;
      var merged = [];
      openList.forEach(function (o) {
        var twin = merged.filter(function (m) {
          return m.name === o.name && Math.abs(m.since - o.since) <= SAME_OPENING_MS
            && (!m.room || !o.room || m.room.toLowerCase() === o.room.toLowerCase());
        })[0];
        if (!twin) { merged.push(o); return; }
        if (!twin.room && o.room) twin.room = o.room;
      });
      openList = merged;
      // Raum vor den Namen („Schlafzimmer Fenster ist offen“), wenn der Name allein nichts sagt
      // („Fenster“, „Tür“, „Tor“) oder zwei offene Kontakte gleich heißen. Bisher hängte das nur
      // das lokale Modul an, das beim ersten Sammeln nach dem Laden noch fehlen kann: dann stand
      // unter „Neu“ zweimal „Fenster ist offen“ (1.0.5).
      var openNames = {};
      openList.forEach(function (o) { openNames[o.name] = (openNames[o.name] || 0) + 1; });
      openList.forEach(function (o) {
        var title = o.name;
        if (o.room && (openNames[o.name] > 1 || /^(Fenster|Tür|Tor)$/i.test(o.name))
          && title.toLowerCase().indexOf(o.room.toLowerCase()) === -1) {
          title = o.room + ' ' + title;
        }
        o.title = title;
      });
      // Gleicher Titel bleibt doch (gleicher Raum, verschiedene Öffnungen): Gerätename dahinter,
      // sonst eine Nummer. Zwei gleiche Zeilen darf es nie geben.
      var openTitles = {};
      openList.forEach(function (o) { (openTitles[o.title] = openTitles[o.title] || []).push(o); });
      Object.keys(openTitles).forEach(function (t) {
        var same = openTitles[t];
        if (same.length < 2) return;
        var devs = same.map(function (o) { return o.dev; });
        var byDev = devs.every(function (d, i) {
          return d && d.toLowerCase() !== t.toLowerCase() && devs.indexOf(d) === i;
        });
        same.forEach(function (o, i) { o.title = byDev ? t + ' (' + o.dev + ')' : t + ' ' + (i + 1); });
      });
      openList.forEach(function (o) {
        var st = o.st, id = o.id, mins = o.mins;
        var title = o.title;
        rows.push({
          id: 'casora:open:' + id,
          when: o.since,
          label: title + ' ist offen',
          sub: 'Seit ' + (mins < 60 ? mins + ' Min.'
            : Math.round(mins / 60) + ' Std.'),
          ongoing: true,
          icon: window.casoraSecurityIcon(id, st.state, st.attributes),
          // Offen, während niemand da ist (bzw. Alarm auf Abwesend/Urlaub): Gefahr statt Hinweis.
          tone: away ? 'bad' : 'warn',
          sec: true,
          entity: id,
          // Fenster/Türen gehören ins Popup „Türen & Fenster“ (Kontakte), nicht ins
          // Schloss-Popup (04.10.2026: Klick auf „Fenster ist offen“ öffnete die Schlösser).
          opens: OPEN_OPENS,
        });
      });
    }

    var co2Limit = Number(window.CASORA_NOTIFY_CO2);
    if (!isFinite(co2Limit)) co2Limit = 1800;
    if (on('air') && co2Limit > 0) {
      var CO2_KEY = 'casora_co2_since';
      var co2Since = {};
      try { co2Since = JSON.parse(localStorage.getItem(CO2_KEY) || '{}') || {}; }
      catch (e) { co2Since = {}; }
      var co2Now = {};
      var plants = ids.filter(function (id) { return id.indexOf('plant.') === 0; })
        .map(function (id) { return id.slice(6); });
      ids.forEach(function (id) {
        if (id.indexOf('sensor.') !== 0) return;
        var st = S[id];
        if (dc(st) !== 'carbon_dioxide') return;
        var bare = id.slice(7);
        if (plants.some(function (n) { return bare.indexOf(n) === 0; })) return;
        var ppm = parseFloat(st.state);
        // Nicht verfügbar (Neustart): Merker behalten, sonst begann der Wert danach als neu.
        if (!isFinite(ppm)) {
          if (isFinite(Number(co2Since[id]))) co2Now[id] = Number(co2Since[id]);
          return;
        }
        if (ppm < co2Limit) return;
        var bad = ppm >= 2000;
        var crossed = Number(co2Since[id]);
        if (!isFinite(crossed)) crossed = Date.now();
        co2Now[id] = crossed;
        rows.push({
          id: 'casora:co2:' + id,
          when: crossed,
          label: 'CO₂-Wert hoch',
          sub: (function () {
            var where = nameOf(st)
              .replace(/\s*(carbon dioxide|co2)\s*/gi, ' ')
              .replace(/\s+/g, ' ').trim();
            return Math.round(ppm) + ' ppm' + (where ? ' in ' + where : '');
          })(),
          icon: 'co2-fill',
          tone: bad ? 'bad' : 'warn',
          entity: id,
          opens: ['casora_badge_air_quality'],
          rank: bad ? 1 : 0,
        });
      });
      try {
        if (JSON.stringify(co2Now) !== JSON.stringify(co2Since)) {
          localStorage.setItem(CO2_KEY, JSON.stringify(co2Now));
        }
      } catch (e) {}
    }

    if (on('plants')) {
      var midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      ids.forEach(function (id) {
        if (id.indexOf('plant.') !== 0) return;
        var st = S[id];
        if (st.state !== 'problem') return;
        var probs = (st.attributes || {}).problems;
        if (!Array.isArray(probs) || !probs.length) return;
        // Watering is the one you can act on standing there, so it leads.
        var first = probs.filter(function (x) { return x.sensor_type === 'moisture'; })[0]
          || probs[0];
        var word = PLANT_WORD[first.sensor_type + ':' + first.status];
        if (!word) return;
        var soil = parseFloat(first.current);
        rows.push({
          id: 'casora:plant:' + id,
          when: Math.max(Date.parse(st.last_changed || '') || 0, midnight.getTime()),
          label: nameOf(st) + ' ' + word,
          sub: (first.sensor_type === 'moisture' && isFinite(soil))
            ? 'Boden bei ' + Math.round(soil) + '%' : null,
          icon: 'plant',
          tone: 'warn',
          entity: id,
          opens: ['casora_plant', 'casora_popup_plant'],
          // Tag im Schlüssel: jeden Morgen wieder neu, wie bisher.
          seen: [id + '|' + first.sensor_type + ':' + first.status + '|' + midnight.getTime()],
        });
      });
    }

    if (on('appliances')) {
      appliances().forEach(function (a) {
        var st = S[a.entity];
        if (!st) return;
        var done = a.done ? new RegExp('^' + a.done + '$', 'i') : APPLIANCE_DONE;
        if (done.test(st.state)) return;
        var left = a.remaining ? minutesLeft(S[a.remaining]) : null;
        if (left == null) return;
        rows.push({
          id: 'casora:appliance:' + a.entity,
          // Start des Laufs statt „jetzt“: mit Date.now() war die Zeile bei jedem Sammeln neuer als
          // der Gelesen-Stand und sprang nach dem Lesen sofort wieder unter „Neu“ (1.0.5).
          when: Date.parse(st.last_changed || '') || Date.now(),
          label: (a.name || nameOf(st)) + (left > 0 ? ' läuft' : ' ist gleich fertig'),
          sub: left > 0
            ? (left < 60 ? left + ' Min. übrig'
               : Math.floor(left / 60) + ' Std. ' + (left % 60) + ' Min. übrig')
            : 'Fast fertig',
          icon: 'default',
          tone: 'accent',
          entity: a.entity,
          seen: [a.entity],
        });
      });
    }

    eachExt('standing', function (e) {
      var next = e.standing(hass, rows, extApi());
      if (Array.isArray(next)) rows = next;
    });

    return settleSeen(rows);
  }

  // ── Collection ─────────────────────────────────────────────────────────────

  var _rows = [];
  var _busy = null;

  // Vorlauf vor dem Zeitfenster nur für den Vorzustand (1.0.5): der erste Logbuch-Eintrag im
  // Fenster hatte sonst keinen, „cleaning → docked“ um die Fenstergrenze ging verloren.
  var LOOKBACK_H = 6;
  // Abgeschlossene Vorgänge (Sauger, Waschmaschine … fertig) bleiben stehen, bis das Zeitfenster
  // abläuft, auch wenn ein späterer Neuaufbau sie nicht mehr herleitet (1.0.5).
  var DONE_KEY = 'casora_notify_done_v1';
  var DEAD = /^(unavailable|unknown)$/;

  // Der Lader der lokalen Module (casora-local.js) läuft, ist aber noch nicht fertig: deren
  // Erweiterungen (z. B. Saugroboter-Ende) fehlen dann noch.
  function localPending() {
    return !!window._casoraBootErrorGuard && !window._casoraLocalLoaded;
  }

  function doneMemo() {
    try {
      var v = JSON.parse(localStorage.getItem(DONE_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function collect() {
    var hass = hassOf();
    if (!hass) return Promise.resolve(_rows);
    if (_busy) return _busy;

    var live = standing(hass);
    var ids = watched(hass);
    var sinceMs = Date.now() - HOURS * 3600 * 1000;
    var from = new Date(sinceMs - LOOKBACK_H * 3600 * 1000).toISOString();

    var fetch = (ids.length && hass.callWS)
      ? hass.callWS({ type: 'logbook/get_events', start_time: from, entity_ids: ids })
      : Promise.resolve([]);

    _busy = fetch.catch(function () { return []; }).then(function (entries) {
      var prev = {};
      var real = {};
      var events = [];
      var asked = {};
      var vacLine = {};
      ids.forEach(function (id) { asked[id] = 1; });
      (entries || []).forEach(function (e) {
        var id = e.entity_id;
        if (!id || !asked[id]) return;
        // Logbuch-Meldungen ohne Zustand (logbook.log, Automationen mit entity_id) sind kein
        // Zustandswechsel. Bisher wurden sie zum Vorzustand '' und „cleaning → docked“ fiel aus.
        if (e.state === undefined || e.state === null) return;
        var st = hass.states[id];
        var was = prev[id];
        var cur = String(e.state);
        prev[id] = cur;
        // Kurzer Ausfall (unavailable/unknown) mitten im Ablauf: der letzte echte Zustand zählt.
        // Gleich wie vorher = Neustart, keine Neuigkeit; anders = echter Wechsel im Ausfall
        // (Sauger „returning → unavailable → docked“ ist fertig).
        if (was !== undefined && DEAD.test(was) && real[id] !== undefined && !DEAD.test(cur)) {
          was = real[id];
        }
        if (!DEAD.test(cur)) real[id] = cur;
        // `when` is epoch seconds, and float on some HA versions.
        var when = Math.round(Number(e.when) * 1000);
        if (!isFinite(when)) return;
        if (id.indexOf('vacuum.') === 0 && !DEAD.test(cur)) (vacLine[id] = vacLine[id] || []).push({ when: when, state: cur });
        if (when < sinceMs) return;
        var d = describe(e, st, was);
        if (!d) return;
        events.push({
          id: id + '@' + when,
          when: when,
          label: d.label,
          sub: d.sub || null,
          icon: d.icon,
          tone: d.tone,
          sec: !!d.sec,
          image: d.image,
          imageFit: d.imageFit,
          entity: id,
          opens: d.opens || null,
          once: d.once || null,
          done: !!d.done,
        });
      });

      // Saugroboter: Ablauf als Ganzes (Zwischenstopps), siehe vacuumRuns().
      var vacPause = {};
      var vacOld = vacPauseMemo();
      Object.keys(vacLine).forEach(function (id) {
        var line = vacLine[id].slice().sort(function (a, b) { return a.when - b.when; });
        var cur = hass.states[id];
        var lc = Date.parse((cur && cur.last_changed) || '');
        // Der Live-Zustand kann neuer sein als das Logbuch.
        if (cur && !DEAD.test(cur.state) && isFinite(lc) && line.length
          && line[line.length - 1].state !== cur.state && lc > line[line.length - 1].when) {
          line.push({ when: lc, state: String(cur.state) });
        }
        var r = vacuumRuns(hass, id, line, Date.now());
        var name = nameOf(cur);
        r.done.forEach(function (d) {
          if (d.when < sinceMs) return;
          events.push({ id: id + '@' + d.when, when: d.when, label: name + ' hat fertig gereinigt',
            sub: null, icon: 'vacuum-charge', tone: 'good', sec: false, entity: id, opens: null, once: null, done: true });
        });
        if (r.pause) {
          live.push({ id: 'casora:vacuum:' + id, when: r.pause.start, label: name + ' reinigt',
            sub: 'Pause · ' + r.pause.word, icon: 'vacuum', tone: 'accent', entity: id });
        }
        var keep = (vacOld[id] || []).filter(function (t) { return t >= sinceMs - LOOKBACK_H * 3600 * 1000; });
        r.paused.forEach(function (t) { if (keep.indexOf(t) === -1) keep.push(t); });
        if (keep.length) vacPause[id] = keep.slice(-20);
      });
      try {
        if (Object.keys(vacLine).length || Object.keys(vacOld).length) {
          Object.keys(vacOld).forEach(function (id) { if (!vacLine[id] && !vacPause[id]) vacPause[id] = vacOld[id]; });
          localStorage.setItem(VAC_PAUSE_KEY, JSON.stringify(vacPause));
        }
      } catch (e) { /* privat/voll */ }

      // Gemerkte „fertig“-Einträge, die der Neuaufbau nicht mehr liefert, bleiben im Fenster.
      // Sauger nicht, wenn das Logbuch den Beginn dieser Reinigung noch enthält: dann ist der
      // Ablauf oben neu bewertet (alte „fertig“ von Zwischenstopps fallen damit weg).
      var have = {};
      events.forEach(function (e) { have[e.id] = 1; });
      doneMemo().forEach(function (m) {
        if (!m || !m.id || have[m.id] || !(m.when >= sinceMs) || !asked[m.entity]) return;
        if ((vacLine[m.entity] || []).some(function (x) { return VACUUM_BUSY[x.state] && x.when < m.when; })) return;
        have[m.id] = 1;
        events.push(m);
      });
      if (!localPending()) {
        try {
          var memo = events.filter(function (e) { return e.done; })
            .sort(function (a, b) { return b.when - a.when; });
          localStorage.setItem(DONE_KEY, JSON.stringify(memo.slice(0, 20)));
        } catch (e) { /* privat/voll */ }
      }

      // Gleiche Zeit: feste Reihenfolge (Kennung), sonst tauschten Zeilen beim Neuaufbau.
      events.sort(function (a, b) { return (b.when - a.when) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });

      // Saugroboter: je Reinigung nur ein „fertig“ (1.0.8). Ein Zwischenstopp, der einmal als
      // fertig galt (z. B. gemerkter Eintrag), stand sonst neben dem echten Ende – zweimal
      // „hat fertig gereinigt“ im Abstand weniger Minuten. Verschiedene Reinigungen liegen nur
      // vor, wenn der Sauger dazwischen mindestens VAC_QUIET_MS an der Station stand.
      var vacNewer = {};
      events = events.filter(function (e) {
        if (!e.done || String(e.entity).indexOf('vacuum.') !== 0) return true;
        var newer = vacNewer[e.entity];
        vacNewer[e.entity] = e.when;
        if (newer == null) return true;
        var line = (vacLine[e.entity] || []).slice().sort(function (a, b) { return a.when - b.when; });
        var gap = line.some(function (x, i) {
          if (!VACUUM_DONE[x.state] || x.when < e.when || x.when >= newer) return false;
          var next = line.slice(i + 1).filter(function (y) { return VACUUM_BUSY[y.state]; })[0];
          return !next || next.when - x.when >= VAC_QUIET_MS;
        });
        if (!gap) vacNewer[e.entity] = newer;
        return gap;
      });

      var kept = [];
      var perEntity = {};
      var onlyOnce = {};
      events.forEach(function (e) {
        if (e.once) {
          if (onlyOnce[e.once]) return;
          onlyOnce[e.once] = 1;
          kept.push(e);
          return;
        }
        var n = (perEntity[e.entity] || 0);
        if (n >= PER_ENTITY_MAX) return;
        var dupe = kept.some(function (k) {
          return k.label === e.label && Math.abs(k.when - e.when) < DEDUPE_MS;
        });
        if (dupe) return;
        perEntity[e.entity] = n + 1;
        kept.push(e);
      });

      var room = Math.max(0, MAX_ROWS - live.length);
      _rows = live.concat(kept.slice(0, room))
        .sort(function (a, b) {
          return ((b.rank || 0) - (a.rank || 0)) || (b.when - a.when)
            || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
        });
      _busy = null;
      announce();
      return _rows;
    });

    return _busy;
  }

  function unread() {
    var w = watermark();
    return _rows.filter(function (r) { return r.when > w; }).length;
  }


  var _bells = [];
  var _lastCount = -1;

  function mountCount(glyph) {
    var root = glyph.getRootNode();
    if (!root || !root.querySelector || !root.appendChild) return null;
    var have = root.querySelector('.casora-bell-count');
    if (have) return have;
    var span = document.createElement('span');
    span.className = 'casora-bell-count';
    span.style.display = 'none';
    root.appendChild(span);
    return span;
  }

  function findBells() {
    var out = [];
    (function walk(root, depth) {
      if (!root || depth > 14 || !root.querySelectorAll) return;
      root.querySelectorAll('.casora-bell').forEach(function (glyph) {
        var el = mountCount(glyph);
        if (el && out.indexOf(el) === -1) out.push(el);
      });
      root.querySelectorAll('*').forEach(function (el) {
        if (el.shadowRoot) walk(el.shadowRoot, depth + 1);
      });
    })(document, 0);
    return out;
  }

  function bells() {
    _bells = _bells.filter(function (el) { return el.isConnected; });
    if (!_bells.length) _bells = findBells();
    return _bells;
  }

  function announce() {
    var n = unread();
    var text = n > 99 ? '99+' : String(n);
    // Weich (--casora-bell-dot: 1): schlichte Glocke + eigener Punkt statt bell-badge –
    // sonst zeigt die Glocke zwei Punkte (den aus der Grafik und den eigenen).
    var dotMode = false;
    try { dotMode = getComputedStyle(document.documentElement).getPropertyValue('--casora-bell-dot').trim() === '1'; } catch (e) { /* ohne Stil eben bell-badge */ }
    // D-21: in Weich überall derselbe Punkt (Desktop zeigte eine schwer lesbare Zahl, das Handy einen Punkt).
    var inBadge = COUNT_IN_BADGE && !isPhone() && !dotMode;
    var show = (n > 0 && inBadge) ? 'grid' : 'none';
    var badged = !inBadge && n > 0;
    var src = iconUrl(badged && !dotMode ? 'bell-badge' : 'bell');
    bells().forEach(function (el) {
      if (el.textContent !== text) el.textContent = text;
      if (el.style.display !== show) el.style.display = show;
      var glyph = el.parentNode && el.parentNode.querySelector('.casora-bell');
      if (glyph && glyph.getAttribute('src') !== src) glyph.setAttribute('src', src);
      if (glyph) glyph.classList.toggle('badged', badged && !dotMode);
      var dot = el.parentNode && el.parentNode.querySelector('.casora-bell-dot');
      if (dotMode && badged && !dot && glyph) {
        dot = document.createElement('span');
        dot.className = 'casora-bell-dot';
        glyph.insertAdjacentElement('afterend', dot);
      }
      if (dot) dot.style.display = dotMode && badged ? '' : 'none';
    });
    if (n !== _lastCount) {
      _lastCount = n;
      window.dispatchEvent(new CustomEvent('casora-notify-count', { detail: { count: n } }));
    }
  }

  // ── Panel body ─────────────────────────────────────────────────────────────

  function ordered() {
    var w = watermark();
    return {
      fresh: _rows.filter(function (r) { return r.when > w; }),
      old: _rows.filter(function (r) { return r.when <= w; }),
    };
  }

  function configure(cfg) {
    cfg = cfg || {};
    if (cfg.types !== undefined) window.CASORA_NOTIFY_TYPES = cfg.types;
    if (cfg.appliances !== undefined) window.CASORA_NOTIFY_APPLIANCES = cfg.appliances;
    if (cfg.battery !== undefined) window.CASORA_NOTIFY_BATTERY = cfg.battery;
    if (cfg.battery_hold !== undefined) window.CASORA_NOTIFY_BATTERY_HOLD = cfg.battery_hold;
    if (cfg.open_minutes !== undefined) window.CASORA_NOTIFY_OPEN_MINUTES = cfg.open_minutes;
    if (cfg.co2 !== undefined) window.CASORA_NOTIFY_CO2 = cfg.co2;
    if (cfg.read_entity !== undefined) {
      window.CASORA_NOTIFY_READ_ENTITY = cfg.read_entity || null;
    }
    return true;
  }

  function sections() {
    var UI = window._casoraUI;
    if (!UI) return '';
    var g = ordered();

    if (!_rows.length) {
      return '<div style="font-family:' + UI.tokens.font + ';text-align:center;'
        + 'padding:34px 16px 38px;color:' + UI.tokens.ink3 + ';font-size:15px;">'
        + 'Nichts Neues</div>';
    }

    /* Farbsystem (Fix-Runde 1, A-19): Setzt das Design --casora-tone-*, bekommt jede Mitteilung den
       Ton ihrer Bedeutung statt der Statusfarbe (Pflanze grün, Updates blau, Fehler rot …). */
    var toned = false;
    try { toned = !!getComputedStyle(document.documentElement).getPropertyValue('--casora-tone-general').trim(); } catch (e) {}
    var toneOf = function (r) {
      if (!toned) return r.tone;
      var ic = String(r.icon || '');
      /* Sicherheit ruhig (Variante 1): nur was Aufmerksamkeit braucht hat Farbe –
         Rot = Gefahr (ausgelöst, offen bei Abwesenheit), Orange = Hinweis (offen, entriegelt,
         unscharf); Erledigtes (verriegelt, scharf) neutral in Sand statt durchgehend Rot. */
      /* 05.10.2026: dieselben Stufenfarben wie Badges, Kacheln und Popups (--casora-security-*,
         00-finden.js); ohne diese Variablen wie bisher. */
      if (r.sec) {
        return r.tone === 'bad' ? 'var(--casora-notify-sec-alert, var(--casora-security-alarm-color, var(--casora-tone-alert)))'
          : r.tone === 'warn' ? 'var(--casora-notify-sec-warn, var(--casora-security-warn-color, var(--casora-color-orange, #DE8A4E)))'
          : 'var(--casora-notify-sec-neutral, var(--casora-security-ok-color, var(--casora-tone-settings, var(--casora-color-sand))))';
      }
      var t = r.tone === 'bad' ? 'alert'
        : /^plant/.test(ic) ? 'energy'
        : /^battery/.test(ic) ? 'energy'
        : /^updates/.test(ic) || r.id === 'casora:restart' ? 'media'
        : /^(doorbell|gas|exclamation|smoke|lock|door|window|garage|gate|shield|camera|alarm)/.test(ic) ? 'alert'
        : 'general';
      return 'var(--casora-tone-' + t + ')';
    };
    var toRow = function (r) {
      return {
        icon: r.icon,
        iconTone: toneOf(r),
        label: r.label,
        // Something still happening says how long, not when it started as well.
        // Weich (Runde 2): Detail und Zeit als ein Fließtext – bei langem Detail brach die Zeit sonst
        // mit führendem „·“ in eine eigene Zeile.
        sub: r.ongoing ? r.sub : (r.sub ? (toned ? [r.sub, ago(r.when)].filter(Boolean).join(' · ') : [r.sub, ago(r.when)]) : ago(r.when)),
        value: r.value || null,
        entity: r.entity || null,
        image: r.image,
        imageFit: r.imageFit,
        tappable: !!(r.entity || r.opens),
      };
    };

    var opts = { labelInside: true };
    var out = '';
    if (g.fresh.length) out += UI.group(g.fresh.map(toRow), g.old.length ? 'Neu' : null, null, opts);
    // Weich: „Früher“ klebte ohne Abstand an der letzten neuen Zeile – Abschnitte brauchen Luft davor.
    if (g.old.length && g.fresh.length && toned) out += '<div style="height:16px"></div>';
    if (g.old.length) out += UI.group(g.old.map(toRow), g.fresh.length ? 'Früher' : null, null, opts);
    return out;
  }

  function paint(root) {
    if (!root) return;
    var g = ordered();
    var list = g.fresh.concat(g.old);
    var els = root.querySelectorAll('.hui-row');
    for (var i = 0; i < els.length && i < list.length; i++) {
      els[i]._casoraRow = list[i];
      if (!list[i].opens) continue;
      els[i].removeAttribute('data-casora-mi');
      els[i].dataset.casoraOpen = list[i].opens;
    }
  }

  function templatesOf(cfg) {
    var t = cfg && cfg.template;
    return Array.isArray(t) ? t : (t ? [t] : []);
  }

  function wants(cfg, names, entityId) {
    var list = templatesOf(cfg);
    var hit = names.some(function (n) { return list.indexOf(n) !== -1; });
    if (!hit) return false;
    if (!entityId) return true;
    var v = cfg.variables || {};
    // Auch Listen in Variablen (locks: [...] einer Schloss-Gruppe) zählen (B-NOTI).
    return cfg.entity === entityId
      || Object.keys(v).some(function (k) { return v[k] === entityId || (Array.isArray(v[k]) && v[k].indexOf(entityId) !== -1); });
  }

  // ── „Wer sieht das?“ auch auf Umwegen (R-01) ─────────────────────────────
  // Die Einschränkung ist HAs Bedingung „user“ (bzw. view.visible) – nur Ausblenden. Casora holt
  // eine so ausgeblendete Kachel aber nicht selbst wieder hervor (Glocke, Sammel-Popups): Steht die
  // Entität im Dashboard nur in Karten/Ansichten, die für diesen Benutzer ausgeblendet sind, gilt sie
  // als verborgen. Kommt sie gar nicht vor, ist sie nicht eingeschränkt.
  // rooms (07.10.2026, „Alles aus“ fürs ganze Haus): auch vorübergehend ausgeblendete Räume
  // (Ansicht visible: false, Handy users: []) zählen als nicht sichtbar.
  function hiddenForUser(cfg, entityId, uid, rooms) {
    if (!cfg || !entityId) return false;
    var hides = function (x) {
      return Array.isArray(x.visibility) && x.visibility.some(function (v) {
        // users: [] = für alle ausgeblendet (Raum vorübergehend weg) – keine Frage, wer es sieht.
        return v && v.condition === 'user' && Array.isArray(v.users) && (v.users.length > 0 || rooms) && !(uid && v.users.indexOf(uid) !== -1);
      });
    };
    var names = function (c) {
      if (c.entity === entityId || (c.entity && c.entity.entity === entityId)) return true;
      var v = c.variables || {};
      if (Object.keys(v).some(function (k) { return v[k] === entityId || (Array.isArray(v[k]) && v[k].indexOf(entityId) !== -1); })) return true;
      return Array.isArray(c.entities) && c.entities.some(function (e) { return e === entityId || (e && e.entity === entityId); });
    };
    var seen = false, open = false;
    (cfg.views || []).forEach(function (view) {
      var off = !!view && ((Array.isArray(view.visible) && view.visible.length > 0
        && !view.visible.some(function (u) { return u && uid && u.user === uid; })) || (!!rooms && view.visible === false));
      (function walk(v, hid) {
        if (open || !v || typeof v !== 'object') return;
        if (Array.isArray(v)) { v.forEach(function (x) { walk(x, hid); }); return; }
        hid = hid || hides(v);
        if (v.type && names(v)) { seen = true; if (!hid) { open = true; return; } }
        Object.keys(v).forEach(function (k) { if (k !== 'visibility' && k !== 'variables') walk(v[k], hid); });
      })(view, off);
    });
    return seen && !open;
  }
  function hiddenNote() {
    var ha = document.querySelector('home-assistant');
    if (!ha) return;
    var t = 'Dieses Gerät ist für dich ausgeblendet';
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = { message: typeof window.casoraTr === 'function' ? window.casoraTr(t) : t };
    ha.dispatchEvent(ev);
  }
  // go() öffnet wie gewohnt; ist die Entität für diesen Benutzer ausgeblendet, nur ein Hinweis
  // (kein Popup, kein HA-Dialog) und blocked().
  function userGuard(entityId, go, blocked) {
    var h = hassOf();
    if (!entityId || !h || !h.callWS) return go();
    var seg = (location.pathname || '').split('/').filter(Boolean);
    h.callWS({ type: 'lovelace/config', url_path: seg[0] || 'lovelace' }).then(function (cfg) {
      return hiddenForUser(cfg, entityId, h.user && h.user.id);
    }, function () { return false; }).then(function (hid) {
      if (!hid) return go();
      hiddenNote();
      if (blocked) blocked();
    });
  }
  window.casoraUserGuard = userGuard;

  // 07.10.2026: „Wer sieht das?“ für Listen, die Casora selbst zusammenstellt („Alles aus“ im
  // Licht-Popup, Verbraucher im Energie-Popup). Die Dashboard-Konfiguration wird je Dashboard
  // einmal geholt und eine Minute gemerkt. visibleIds: Promise der sichtbaren IDs.
  // visibleIdsNow: sofort – null, solange die Konfiguration noch nicht da ist (lädt sie dann).
  var cfgMemo = { url: null, at: 0, cfg: null, p: null };
  function dashCfg() {
    var h = hassOf();
    var seg = (location.pathname || '').split('/').filter(Boolean);
    var url = seg[0] || 'lovelace';
    if (cfgMemo.url === url && (cfgMemo.p || Date.now() - cfgMemo.at < 60000)) return cfgMemo.p || Promise.resolve(cfgMemo.cfg);
    if (!h || !h.callWS) return Promise.resolve(null);
    cfgMemo.url = url; cfgMemo.cfg = null;
    cfgMemo.p = h.callWS({ type: 'lovelace/config', url_path: url }).then(function (cfg) {
      if (cfgMemo.url === url) { cfgMemo.cfg = cfg; cfgMemo.at = Date.now(); cfgMemo.p = null; }
      return cfg;
    }, function () { cfgMemo.p = null; cfgMemo.at = Date.now(); return null; });
    return cfgMemo.p;
  }
  // opts.rooms: ausgeblendete Räume zählen auch als nicht sichtbar (siehe hiddenForUser).
  function visibleOf(cfg, ids, opts) {
    var h = hassOf(), uid = h && h.user && h.user.id, rooms = !!(opts && opts.rooms);
    return (ids || []).filter(function (id) { return !cfg || !hiddenForUser(cfg, id, uid, rooms); });
  }
  window.casoraVisibleIds = function (ids, opts) {
    return dashCfg().then(function (cfg) { return visibleOf(cfg, ids, opts); });
  };
  window.casoraVisibleIdsNow = function (ids, opts) {
    var seg = (location.pathname || '').split('/').filter(Boolean);
    var fresh = cfgMemo.url === (seg[0] || 'lovelace') && cfgMemo.at && !cfgMemo.p;
    if (!fresh || Date.now() - cfgMemo.at >= 60000) dashCfg();
    return fresh ? visibleOf(cfgMemo.cfg, ids, opts) : null;
  };
  // Für Benutzer ohne Admin-Rechte schon beim Laden bzw. Wechsel des Dashboards holen, damit das
  // Energie-Popup die Verbraucher gleich beim ersten Öffnen zeigen kann.
  var warm = function () {
    setTimeout(function () { if (window.casoraIsAdmin && !window.casoraIsAdmin()) window.casoraVisibleIdsNow([]); }, 2500);
  };
  window.addEventListener('location-changed', warm);
  warm();

  // ── Glocke = Kachel (B-NOTI, 06.10.2026) ──────────────────────────────────
  // Die Kachel, die man für diese Entität antippen würde: sichtbare button-card mit genau dieser
  // Entität und eigenem Casora-Popup, eine Kachel vor einer Badge. So öffnet die Glocke dasselbe
  // Popup (mit Ring und Kopf) wie der Tipp auf die Kachel.
  function tileFor(entityId) {
    if (!entityId) return null;
    var best = null, bestRank = 99;
    (function walk(root, depth) {
      if (!root || depth > 14 || !root.querySelectorAll) return;
      root.querySelectorAll('button-card').forEach(function (el) {
        var c = el._config;
        if (!c || !c.tap_action || !c.tap_action.casora_popup) return;
        // Eigene Entität vor Variable (alarm_entity der Alarm-Kachel) vor Liste (locks einer Gruppe).
        var v = c.variables || {}, how = c.entity === entityId ? 0 : -1;
        if (how < 0) Object.keys(v).forEach(function (k) {
          if (v[k] === entityId) how = how < 0 || how > 1 ? 1 : how;
          else if (Array.isArray(v[k]) && v[k].indexOf(entityId) !== -1 && how < 0) how = 2;
        });
        if (how < 0) return;
        var badge = templatesOf(c).some(function (n) { return /badge|chip/.test(n); });
        var shown = el.getClientRects && el.getClientRects().length > 0;
        var rank = how + (badge ? 3 : 0) + (shown ? 0 : 6);
        if (rank < bestRank) { best = el; bestRank = rank; }
      });
      root.querySelectorAll('*').forEach(function (el) { if (el.shadowRoot) walk(el.shadowRoot, depth + 1); });
    })(document, 0);
    return best;
  }
  // Geräte, die ihre eigene Kachel haben: ohne passende Kachel nie das Popup irgendeiner anderen
  // Karte gleicher Vorlage öffnen (vorher: Schloss-Eintrag → Popup einer anderen Tür).
  var OWN_TILE = /^(lock|alarm_control_panel|vacuum|lawn_mower|cover|climate|media_player|camera|light|fan|humidifier|water_heater)\./;

  function cardWithTemplate(names, entityId) {
    var out = null;
    var scan = function (id) {
      (function walk(root, depth) {
        if (!root || out || depth > 14 || !root.querySelectorAll) return;
        root.querySelectorAll('button-card').forEach(function (el) {
          if (!out && wants(el._config, names, id)) out = el;
        });
        root.querySelectorAll('*').forEach(function (el) {
          if (!out && el.shadowRoot) walk(el.shadowRoot, depth + 1);
        });
      })(document, 0);
    };
    if (entityId) scan(entityId);
    if (!out && !OWN_TILE.test(entityId || '')) scan(null);
    return out;
  }

  function cardFromConfig(names, entityId) {
    var h = hassOf();
    if (!h || !h.callWS) return Promise.resolve(null);
    var seg = (location.pathname || '').split('/').filter(Boolean);
    var url = seg[0] || 'lovelace';
    return h.callWS({ type: 'lovelace/config', url_path: url }).then(function (cfg) {
      var found = null;
      (function walk(cards) {
        (cards || []).forEach(function (c) {
          if (found || !c || typeof c !== 'object') return;
          if (wants(c, names, entityId)) { found = c; return; }
          walk(c.cards);
        });
      })((cfg.views || []).reduce(function (a, v) {
        return a.concat(v.cards || []);
      }, []));
      if (!found && entityId && !OWN_TILE.test(entityId)) {
        (function walk(cards) {
          (cards || []).forEach(function (c) {
            if (found || !c || typeof c !== 'object') return;
            if (wants(c, names, null)) { found = c; return; }
            walk(c.cards);
          });
        })((cfg.views || []).reduce(function (a, v) {
          return a.concat(v.cards || []);
        }, []));
      }
      if (!found) return null;
      var el = document.createElement('button-card');
      try { el.setConfig(JSON.parse(JSON.stringify(found))); } catch (e) { return null; }
      el.hass = h;
      el.style.cssText = 'position:fixed;left:-9999px;top:0;'
        + 'width:1px;height:1px;opacity:0;pointer-events:none;';
      document.body.appendChild(el);
      return el;
    }).catch(function () { return null; });
  }

  function cardSynth(names, entityId) {
    var h = hassOf();
    var tpl = (names || []).filter(function (n) { return !/badge|chip/.test(n); })[0];
    if (!h || !tpl || !entityId || !h.states[entityId]) return null;
    var el = document.createElement('button-card');
    try { el.setConfig({ type: 'custom:button-card', template: tpl, entity: entityId }); } catch (e) { return null; }
    el.hass = h;
    el.style.cssText = 'position:fixed;left:-9999px;top:0;'
      + 'width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(el);
    return el;
  }

  function tapCard(card, done) {
    if (!card || typeof card._handleAction !== 'function' || !card._config) {
      return done(false);
    }
    if (typeof card._isActionDoingSomething === 'function') {
      try {
        if (!card._isActionDoingSomething(card._stateObj, card._config.tap_action)) {
          return done(false);
        }
      } catch (e) {}
    }
    var settled = false;
    var take = function (ev) {
      var cfg = ev.detail && ev.detail.config;
      var act = cfg && cfg[((ev.detail && ev.detail.action) || 'tap') + '_action'];
      if (act && act.casora_popup && window.casoraPopup) {
        // Only ours gets intercepted; anything else stays HA's to handle.
        ev.stopPropagation();
        // src: die Kachel liefert im Weich-Look Ring und Kopf – wie beim echten Antippen.
        window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: card }));
        return finish(true);
      }
      finish(false);
    };
    var finish = function (ok) {
      if (settled) return;
      settled = true;
      card.removeEventListener('hass-action', take, true);
      done(ok);
    };
    card.addEventListener('hass-action', take, true);
    try {
      card._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
    } catch (e) { return finish(false); }
    // hass-action arrives a microtask later, so the miss cannot be decided yet.
    setTimeout(function () { finish(false); }, 400);
  }

  // Für 01-basis (Einträge ohne opens): erst die sichtbare Kachel, wie beim Antippen.
  window._casoraTapTile = function (entityId, done) {
    var t = tileFor(entityId);
    if (!t) return done(false);
    tapCard(t, done);
  };

  function openTarget(what, fallbackEntity) {
    userGuard(fallbackEntity, function () { openTargetNow(what, fallbackEntity); });
  }
  function openTargetNow(what, fallbackEntity) {
    // dataset stringifies an array, so a retagged row arrives comma-joined.
    var names = Array.isArray(what) ? what
      : (what ? String(what).split(',').map(function (n) { return n.trim(); })
                .filter(Boolean)
              : []);
    var fall = function () {
      if (fallbackEntity && window.casoraPopup) window.casoraPopup.moreInfo(fallbackEntity);
    };
    var own = tileFor(fallbackEntity);
    if (!names.length && !own) return fall();
    tapCard(own || cardWithTemplate(names, fallbackEntity), function (hit) {
      if (hit) return;
      cardFromConfig(names, fallbackEntity).then(function (el) {
        // Keine Kachel im Dashboard (z. B. Pflanze ohne Pflanzen-Kachel): eine unsichtbare Kachel der
        // ersten Vorlage für genau diese Entität – dasselbe Casora-Popup statt HAs Dialog („problem“).
        if (!el) el = cardSynth(names, fallbackEntity);
        if (!el) return fall();
        // One frame for button-card to evaluate its config before the tap.
        setTimeout(function () {
          tapCard(el, function (ok) {
            if (!ok) fall();
            setTimeout(function () { if (el.parentNode) el.remove(); }, 1500);
          });
        }, 80);
      });
    });
  }

  function bindOpens(root, close) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      var path = (e.composedPath && e.composedPath()) || [e.target];
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (n && n.dataset && n.dataset.casoraOpen) {
          e.preventDefault();
          e.stopPropagation();
          var row = n._casoraRow;
          if (close) close();
          openTarget(n.dataset.casoraOpen, row && row.entity);
          return;
        }
      }
    }, true);
  }

  // ── Presentation ───────────────────────────────────────────────────────────

  function isPhone() {
    try {
      return window.matchMedia('(max-width: 767px), (max-height: 500px)').matches;
    } catch (e) { return false; }
  }

  function seal() {
    setWatermark(Date.now());
    announce();
  }

  function lift(anchor, on) {
    if (!anchor || !anchor.style) return;
    if (isPhone()) return;
    if (on) {
      anchor.style.setProperty('--casora-bell-fill', '#fff');
      anchor.style.setProperty('--casora-bell-filter', 'brightness(0)');
    } else {
      anchor.style.removeProperty('--casora-bell-fill');
      anchor.style.removeProperty('--casora-bell-filter');
    }
  }

  function openSheet(anchor) {
    if (!window.casoraPopup) return;
    lift(anchor, true);
    window.casoraPopup.open({
      title: 'Benachrichtigungen',
      dismissable: true,
      popup_styles: [{
        style: 'all',
        styles: '--casora-popup-gutter-wide: 40px;'
          + '--casora-popup-row-fill: transparent;'
          + '--casora-popup-row-radius: 0px;'
          + '.header { padding-top: var(--casora-popup-header-gap, 10px);'
          + ' padding-bottom: var(--casora-popup-header-gap, 10px); }'
          + '.header-title { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }'
          + '.content .container { padding-top: 6px !important; }',
      }],
      content: {
        type: 'custom:button-card',
        tap_action: { action: 'none' },
        show_icon: false, show_name: false, show_label: false, show_state: false,
        card_mod: {
          style: ':host { --ha-card-box-shadow: none !important;'
            + ' --button-card-box-shadow: none !important; }\n'
            + 'ha-card { background: transparent !important; border: none !important;'
            + ' box-shadow: none !important; backdrop-filter: none !important;'
            + ' -webkit-backdrop-filter: none !important; cursor: default !important; }\n'
            + 'ha-ripple { display: none !important; }',
        },
        styles: {
          card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' },
                 { padding: '0 10px 22px 10px' }],
          grid: [{ 'grid-template-areas': '"list"' }, { 'grid-template-columns': '1fr' }],
          custom_fields: { list: [{ 'justify-self': 'stretch' }] },
        },
        custom_fields: { list: sections() },
      },
    });

    var el = window.casoraPopup.element;
    // The sheet builds its card asynchronously, so the retag waits for it.
    setTimeout(function () {
      var surface = window.casoraPopup.surface;
      paint(surface);
      if (surface && !surface._casoraNotifyBound) {
        surface._casoraNotifyBound = true;
        bindOpens(surface, function () { window.casoraPopup.close(); });
      }
    }, 260);

    var watch = setInterval(function () {
      if (el && el.hasAttribute('open')) return;
      clearInterval(watch);
      lift(anchor, false);
      seal();
    }, 300);
  }

  var _menu = null;


  function openMenu(anchor) {
    var GLASS = window.casoraMenuGlass;
    var card = anchor && anchor.shadowRoot && anchor.shadowRoot.querySelector('ha-card');
    var r = (card || anchor).getBoundingClientRect();
    for (var up = anchor, i = 0; up && i < 6; i++) {
      var rootNode = up.getRootNode && up.getRootNode();
      up = rootNode && rootNode.host;
      var tpl = up && up._config && up._config.template;
      if (tpl && [].concat(tpl).indexOf('casora_mobile_chrome') >= 0) {
        var cap = up.shadowRoot && up.shadowRoot.querySelector('ha-card');
        if (cap) r = cap.getBoundingClientRect();
        break;
      }
    }

    var menu = document.createElement('div');
    _menu = menu;
    lift(anchor, true);
    menu.className = 'casora-notify-menu';
    menu.setAttribute('role', 'dialog');
    Object.assign(menu.style, {
      position: 'fixed', zIndex: '99999', boxSizing: 'border-box',
      width: 'max-content',
      minWidth: '256px',
      maxWidth: 'min(392px, calc(100vw - 24px))',
      padding: '0',
      overflow: 'hidden',
    });
    GLASS.apply(menu);
    /* Weich (03.10.2026): ohne Glas-Rand – die hellen Rim-Linien oben/unten wirkten wie eine
       3D-Kante. Ein Design setzt --casora-notify-shadow (weicher Schatten wie seine Karten);
       ohne Token bleibt der Glas-Schatten unverändert. */
    menu.style.boxShadow = 'var(--casora-notify-shadow, ' + menu.style.boxShadow + ')';

    var inner = document.createElement('div');
    // Safari lets a descendant's background paint past a rounded parent's radius.
    Object.assign(inner.style, {
      opacity: '0', willChange: 'opacity',
      borderRadius: 'inherit', overflow: 'hidden',
      clipPath: 'inset(0 round ' + GLASS.radius + ')',
    });

    var head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      gap: '12px', padding: '15px 16px 9px',
      fontFamily: 'var(--primary-font-family, system-ui)',
    });
    var clear = document.createElement('button');
    clear.type = 'button';
    clear.textContent = window.casoraTr ? window.casoraTr('Alles gelesen') : 'Alles gelesen';
    Object.assign(clear.style, {
      border: '0', background: 'transparent', font: 'inherit', fontSize: '14px',
      fontWeight: '500', letterSpacing: '-0.01em', cursor: 'pointer', padding: '0',
      color: 'var(--casora-notify-action, var(--casora-popup-ui-action, var(--casora-color-teal, #00C3D0)))',
    });
    clear.onclick = function (e) { e.stopPropagation(); seal(); menu._close(); };
    clear.style.display = unread() ? 'block' : 'none';
    head.appendChild(clear);
    head.style.justifyContent = 'flex-end';
    head.style.padding = '11px calc(var(--casora-popup-row-pad-x, 16px) + 8px) 5px';
    /* Weich (D-03/D-21): Kopfzeile „Benachrichtigungen“ links, „Alles gelesen“ rechts mit
       44 px Trefferfläche (vorher reiner Textlink, 17 px hoch). Standard/Glas unverändert. */
    var softBell = false;
    try { softBell = getComputedStyle(document.documentElement).getPropertyValue('--casora-popup-layout').trim() === 'soft'; } catch (e) {}
    if (softBell) {
      var ttl = document.createElement('div');
      ttl.textContent = window.casoraTr ? window.casoraTr('Benachrichtigungen') : 'Benachrichtigungen';
      Object.assign(ttl.style, { marginRight: 'auto', fontSize: '15px', fontWeight: '700', letterSpacing: '-0.01em',
        color: 'var(--casora-popup-tiles-text-primary, var(--primary-text-color))' });
      head.insertBefore(ttl, clear);
      Object.assign(clear.style, { minHeight: '44px', padding: '0 12px', margin: '0 -12px', display: unread() ? 'inline-flex' : 'none',
        alignItems: 'center', borderRadius: '999px', fontWeight: '600' });
      head.style.alignItems = 'center';
      head.style.padding = '6px calc(var(--casora-popup-row-pad-x, 16px) + 8px) 0';
    }
    if (unread() || softBell) inner.appendChild(head);

    var body = document.createElement('div');
    Object.assign(body.style, {
      maxHeight: 'min(62vh, 560px)', overflowY: 'auto', overscrollBehavior: 'contain',
    });
    var fade = function () {
      var over = body.scrollHeight - body.clientHeight;
      var top = over > 4 && body.scrollTop > 1;
      var bot = over > 4 && body.scrollTop < over - 1;
      var v = (top || bot)
        ? 'linear-gradient(to bottom, '
          + (top ? 'transparent 0, #000 26px' : '#000 0')
          + ', '
          + (bot ? '#000 calc(100% - 26px), transparent 100%' : '#000 100%')
          + ')'
        : '';
      if (body.style.webkitMaskImage !== v) {
        body.style.webkitMaskImage = v;
        body.style.maskImage = v;
      }
    };
    body.addEventListener('scroll', fade, { passive: true });
    GLASS.lockScroll(menu, body);
    // Custom properties never land through Object.assign.
    body.style.setProperty('--casora-popup-row-fill', 'transparent');
    body.style.setProperty('--casora-popup-row-hover', 'var(--casora-menu-hover, rgba(255,255,255,0.10))');
    body.style.setProperty('--casora-popup-chev-gap', '16px');
    body.style.setProperty('--casora-popup-group-label-gap', '4px');
    var U_MIN = 10, U_VW = 0.575, U_MAX = 11.5;
    body.style.setProperty('--casora-popup-row-label-weight', '600');
    body.style.setProperty('--casora-popup-sub-color', 'var(--casora-menu-fg-sub, rgba(255,255,255,0.62))');
    [['--casora-popup-row-label-size', 1.53],
     ['--casora-popup-sub-size', 1.25],
     ['--casora-popup-row-min', 4.68],
     ['--casora-popup-icon-tile', 2.61],
     ['--casora-popup-lead-plate', 2.88],
     ['--casora-popup-group-label-size', 1.35]].forEach(function (p) {
      var k = p[1];
      body.style.setProperty(p[0], 'clamp(' + (U_MIN * k).toFixed(2) + 'px, '
        + (U_VW * k).toFixed(4) + 'vw, ' + (U_MAX * k).toFixed(2) + 'px)');
    });
    body.style.setProperty('--casora-popup-row-radius', 'var(--casora-notify-row-radius, 0px)');
    /* Weich (A-19): Zeilen als eigene Flächen mit Rundung und Rand statt Bändern über die volle Breite. */
    body.style.padding = 'var(--casora-notify-pad, 0px)';
    /* Ohne Kopfzeile („Alles gelesen“ fällt weg, wenn alles gelesen ist) oben derselbe Abstand wie seitlich. */
    if (!unread()) body.style.paddingTop = 'var(--casora-notify-pad-solo-top, 0px)';
    body.style.boxSizing = 'border-box';
    body.innerHTML = (window.casoraTr || function (x) { return x; })(sections());
    inner.appendChild(body);
    menu.appendChild(inner);
    document.body.appendChild(menu);
    fade();
    paint(body);
    bindOpens(body, null);

    var w = menu.offsetWidth;
    menu.style.top = GLASS.dropTop(r, 10) + 'px';
    menu.style.left = Math.round(
      Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12))
    ) + 'px';

    inner.style.opacity = '1';
    inner.style.willChange = 'auto';
    GLASS.enter(menu);

    var onKey = function (e) { if (e.key === 'Escape') menu._close(); };
    var onAway = function (e) {
      var path = (e.composedPath && e.composedPath()) || [e.target];
      if (path.indexOf(menu) !== -1) return;
      // contains() cannot cross a shadow boundary.
      if (anchor && path.indexOf(anchor) !== -1) return;
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        var tag = (n && n.tagName) ? String(n.tagName).toLowerCase() : '';
        // A more-info opened FROM a row is not somewhere else.
        if (tag === 'dialog' || /-dialog$/.test(tag) || tag === 'casora-popup') return;
      }
      menu._close();
    };
    var idle = setTimeout(function () { menu._idle = true; menu._close(); }, 20000);

    menu._close = function () {
      if (_menu !== menu) return;
      _menu = null;
      clearTimeout(idle);
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onAway, true);
      window.removeEventListener('resize', menu._close);
      lift(anchor, false);
      if (!menu._idle) seal();
      GLASS.exit(menu, function () { if (menu.parentNode) menu.remove(); });
    };

    setTimeout(function () {
      window.addEventListener('keydown', onKey, true);
      document.addEventListener('pointerdown', onAway, true);
      window.addEventListener('resize', menu._close);
    }, 0);
  }

  function open(anchor) {
    if (_menu) { _menu._close(); return; }
    var pop = window.casoraPopup && window.casoraPopup.element;
    if (pop && pop.hasAttribute('open')) { window.casoraPopup.close(); return; }

    var show = function () { openMenu(anchor); };
    // Opening waits on the network only the very first time.
    if (_rows.length) { show(); collect(); } else { collect().then(show); }
  }

  // The categories a dashboard can switch off, as the panel writes them.
  var TYPES = ['safety', 'air', 'locks', 'alarm', 'doorbell', 'doors', 'people',
    'vacuum', 'appliances', 'plants', 'battery', 'updates', 'restart'];

  function configureFrom(V) {
    V = V || {};
    var types = {};
    TYPES.forEach(function (k) {
      if (V['notify_' + k] === false) types[k] = false;
    });

    var list = Array.isArray(V.notification_appliances) ? V.notification_appliances : [];
    var timers = (V.notification_appliance_timers
      && typeof V.notification_appliance_timers === 'object')
      ? V.notification_appliance_timers : {};

    var num = function (x) {
      if (x === null || x === undefined || x === '') return undefined;
      var n = Number(x);
      return isFinite(n) ? n : undefined;
    };

    return configure({
      types: types,
      appliances: list.filter(Boolean).map(function (e) {
        return { entity: e, remaining: timers[e] || undefined };
      }),
      battery: num(V.notification_battery_threshold),
      battery_hold: num(V.notification_battery_hold_minutes),
      open_minutes: num(V.notification_open_minutes),
      co2: num(V.notification_co2_ppm),
      read_entity: V.notification_read_entity || null,
    });
  }

  if (window._casoraNotifyCfg) {
    try { configureFrom(window._casoraNotifyCfg); } catch (e) {}
  }

  window._casoraNotify = {
    open: open,
    close: function () { if (_menu) _menu._close(); },
    refresh: collect,
    configure: configure,
    configureFrom: configureFrom,
    markAll: seal,
    get count() { return unread(); },
    get rows() { return _rows.slice(); },
  };

  function boot() {
    var tick = function () { if (!document.hidden) collect(); };
    var t0 = Date.now();
    // Kommen die lokalen Module erst nach dem ersten Sammeln (langsames Laden, > 15 s), gleich
    // neu sammeln statt bis zum nächsten Takt (60 s) zu warten: ohne 00-finden/01-basis stand
    // eine Tür mit Kontakt + Kippsensor doppelt in der Glocke („… ist offen“ und „… Kippsensor
    // ist offen“ statt einmal „… ist gekippt“). Läuft gerade ein Sammeln, danach.
    window.addEventListener('casora-local-loaded', function () {
      if (!hassOf()) return;
      Promise.resolve(_busy).then(function () { return collect(); }).catch(function () {});
    });
    var wait = setInterval(function () {
      if (!hassOf()) return;
      // Erst sammeln, wenn die lokalen Erweiterungen da sind (höchstens 15 s warten): sonst
      // stand z. B. „Saugroboter hat fertig gereinigt“ nach der Grundregel kurz in der Glocke
      // und verschwand beim nächsten Sammeln mit Erweiterung wieder (1.0.5). Auch warten, wenn
      // der Lader (casora-local.js) noch gar nicht gestartet ist – HA lädt die Ressourcen ohne
      // feste Reihenfolge, dann fehlte sein Merker und die Glocke sammelte sofort (P2-01).
      if (!window._casoraLocalLoaded && Date.now() - t0 < 15000) return;
      clearInterval(wait);
      tick();
      setInterval(tick, POLL_MS);
      // A new bell arrives with every view change and starts out empty.
      window.addEventListener('location-changed', function () {
        _bells = [];
        setTimeout(announce, 120);
      }, true);
      setInterval(announce, 2000);
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

// HACS serves button-card cached, so some cards render before this file runs.
(function () {
  var waiting = window._casoraCoreWaiters;
  window._casoraCoreWaiters = null;
  // Retained so a sibling resource landing after this flush can re-kick them.
  window._casoraKicked = waiting;
  if (!waiting || typeof window.casoraKick !== 'function') return;
  setTimeout(function () {
    waiting.forEach(function (el) { window.casoraKick(el); });
  }, 0);
})();

// Return to Home after a spell without input, for wall tablets. Off unless a
// dashboard asks for it in Casora Studio under General > Dashboard.
(function () {
  if (window._casoraIdleHome) return;
  window._casoraIdleHome = true;

  var POLL_MS = 10000;
  var OFF = /[?&]casora_idle=0/.test(location.search);
  // The tablet navbar's own test, so one dashboard reads the same under either.
  var TABLET = window.matchMedia
    ? window.matchMedia('(hover: none) and (pointer: coarse) and (min-width: 600px)')
    : null;

  var last = Date.now();
  function bump() { last = Date.now(); }

  ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'].forEach(function (t) {
    window.addEventListener(t, bump, { capture: true, passive: true });
  });
  window.addEventListener('location-changed', bump, true);

  function deep(root, tag, depth) {
    if (!root || depth > 10 || !root.querySelector) return null;
    var hit = root.querySelector(tag);
    if (hit) return hit;
    var kids = root.querySelectorAll('*');
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].shadowRoot) {
        var f = deep(kids[i].shadowRoot, tag, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }

  var _root = null;
  function huiRoot() {
    if (_root && _root.isConnected) return _root;
    _root = deep(document, 'hui-root', 0);
    return _root;
  }

  function config() {
    var root = huiRoot();
    var ll = (root && root.lovelace) || {};
    return ll.editMode ? null : (ll.config || null);
  }

  // The setting is a room variable, like every other dashboard-scoped one, so
  // it rides along in the hero card of each view.
  function minutes(cfg) {
    var views = (cfg && cfg.views) || [];
    for (var i = 0; i < views.length; i++) {
      var card = ((views[i].cards || [])[0]) || {};
      var v = (card.variables || {}).casora_idle_home;
      if (v !== undefined && v !== null && v !== '') return parseFloat(v) || 0;
    }
    return 0;
  }

  // Never hard-code the path: dashboards get renamed and people run more than one.
  function homePath(cfg) {
    var views = (cfg && cfg.views) || [];
    if (!views.length) return null;
    var home = null;
    for (var i = 0; i < views.length; i++) {
      if (views[i].path === 'home') { home = views[i]; break; }
    }
    if (!home) home = views[0];
    var parts = String(location.pathname).split('/').filter(Boolean);
    if (!parts.length) return null;
    return '/' + parts[0] + '/' + (home.path || '');
  }

  function norm(p) { return String(p || '').replace(/\/+$/, '') || '/'; }

  function check() {
    if (OFF || !TABLET || !TABLET.matches) return bump();
    var cfg = config();
    if (!cfg) return bump();
    var mins = minutes(cfg);
    if (!mins) return bump();
    var home = homePath(cfg);
    if (!home || norm(location.pathname) === norm(home)) return bump();
    // Never pull the view out from under someone reading a popup.
    if (window.casoraPopup && window.casoraPopup.surface) return bump();
    if (Date.now() - last < mins * 60000) return;
    history.pushState(null, '', home);
    window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
    bump();
  }

  setInterval(check, POLL_MS);
  // A tablet coming back from sleep has been idle the whole time.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) check();
  });
})();

// The mobile filter, per device. It lives in an input_select so the button-card
// templates re-render when it changes, but an entity is one value for the whole
// house, so two phones open at once drove each other. Each device now keeps its
// own and the entity is rewritten on the way to the cards, which leaves the
// templates untouched and the helper still correct for automations.
(function () {
  if (window._casoraFilter) return;

  var ENTITY = 'input_select.casora_mobile_filter';
  var KEY = 'casora_mobile_filter';
  var listeners = [];
  var current = null;

  function get() {
    if (current !== null) return current;
    try { current = localStorage.getItem(KEY) || 'all'; } catch (e) { current = 'all'; }
    return current;
  }

  // Raumseite am Handy (05.10.2026): aufgeklappte Unter-Reihe einer Sammel-Badge („security“,
  // „climate“ …) – wie input_select.casora_expanded_row am Desktop, aber je Gerät. Dazu ein
  // Zähler, der steigt, wenn neue Raum-Badges vom Server da sind (casoraPhoneRoom). Beides
  // reist als Attribut des Filter-Helfers (casora_row, casora_tok) zu den Karten – die
  // Handy-Badges hängen an diesem Helfer und zeichnen so neu.
  var row = null, tok = 0;
  // Wechsel seit dem Laden der Seite (P-01: ein später Startwert darf eine frühe Wahl nicht überschreiben).
  var picks = 0;

  function notify(v) {
    listeners.slice().forEach(function (fn) { try { fn(v); } catch (e) {} });
  }

  function set(v) {
    v = String(v == null ? 'all' : v) || 'all';
    if (get() === v) return v;
    current = v;
    row = null;
    picks++;
    try { localStorage.setItem(KEY, v); } catch (e) {}
    notify(v);
    return v;
  }

  function setRow(r) {
    r = r ? String(r) : null;
    if (row === r) return row;
    row = r;
    notify(get());
    return row;
  }

  function bump() { tok++; notify(get()); }

  // One hass object arrives per update and is handed to every card, so the
  // rewrite is memoised on it rather than repeated down the tree. Der umgeschriebene
  // Zustand selbst bleibt dasselbe Objekt, solange sich nichts daran ändert – sonst zeichneten
  // alle Karten am Filter-Helfer bei jedem Update im Haus neu.
  var lastIn = null, lastVal = null, lastOut = null, lastRow = null, lastTok = 0;
  var entIn = null, entKey = null, entOut = null;

  function apply(hass) {
    if (!hass || !hass.states) return hass;
    var ent = hass.states[ENTITY];
    if (!ent) return hass;                    // no helper: nothing to stand in for
    var v = get();
    if (ent.state === v && !row && !tok) return hass;
    if (hass === lastIn && v === lastVal && row === lastRow && tok === lastTok) return lastOut;
    var key = v + '|' + (row || '') + '|' + tok;
    if (ent !== entIn || key !== entKey) {
      var next = Object.assign({}, ent, { state: v });
      if (row || tok) next.attributes = Object.assign({}, ent.attributes, { casora_row: row, casora_tok: tok });
      entIn = ent; entKey = key; entOut = next;
    }
    var states = Object.assign({}, hass.states);
    states[ENTITY] = entOut;
    var out = Object.assign({}, hass);
    out.states = states;
    lastIn = hass; lastVal = v; lastOut = out; lastRow = row; lastTok = tok;
    return out;
  }

  // Keeps the helper current for anyone automating on it. The other devices
  // ignore it, because each one rewrites it with its own value on the way in.
  function share(hass, v) {
    if (!hass || typeof hass.callWS !== 'function') return;
    // Während HA neu startet still bleiben (kein Fehler-Toast; Hemma 2.2.0).
    if (hass.connection && hass.connection.connected === false) return;
    var ent = hass.states && hass.states[ENTITY];
    if (!ent || ent.state === v) return;
    // Raum-Schlüssel, die der Helfer noch nicht kennt (neues oder importiertes
    // Dashboard), erst ergänzen – sonst lehnt HA die Auswahl mit Fehler ab.
    var opts = (ent.attributes && ent.attributes.options) || [];
    var call = function (service, data) {
      return hass.callWS({ type: 'call_service', domain: 'input_select', service: service, service_data: data });
    };
    var pick = function () {
      return call('select_option', { entity_id: ENTITY, option: v });
    };
    try {
      var p = opts.indexOf(v) === -1
        ? Promise.resolve(call('set_options', { entity_id: ENTITY, options: opts.concat([v]) })).then(pick)
        : pick();
      Promise.resolve(p).catch(function () {});
    } catch (e) {}
  }

  // The badge row and the room headers tap through this, since a button-card
  // tap_action cannot call a function directly.
  window.addEventListener('ll-custom', function (ev) {
    var d = ev.detail || {};
    // Sammel-Badge auf der Raumseite am Handy: Unter-Reihe auf/zu (nur dieses Gerät).
    if (d.casora_phone_row) {
      ev.stopPropagation();
      // Öffnet derselbe Tipp ein Popup (Beleuchtung erbt es von casora_popup_light), bleibt die
      // Unter-Reihe zu: sie klappte sonst unsichtbar hinter dem Popup auf, und nach dem Schließen
      // war der ganze Inhalt ~110 px nach unten gerutscht (07.10.2026).
      if (d.casora_popup && window.casoraPopup && window.casoraPopup.enabled) return;
      setRow(row === d.casora_phone_row ? null : d.casora_phone_row);
      return;
    }
    if (!('casora_filter' in d)) return;
    ev.stopPropagation();
    var v = set(d.casora_filter);
    var ha = document.querySelector('home-assistant');
    share(ha && ha.hass, v);
  }, true);

  window._casoraFilter = {
    ENTITY: ENTITY,
    get: get,
    set: set,
    row: function () { return row; },
    picked: function () { return picks > 0; },
    setRow: setRow,
    bump: bump,
    apply: apply,
    share: share,
    onChange: function (fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (x) { return x !== fn; });
      };
    },
  };
  // Karten, die vor diesem Skript Zustände bekamen, melden sich jetzt am Filter an (P-01).
  try { window.dispatchEvent(new Event('casora-filter-ready')); } catch (e) {}
})();

// Raum-Badges am Handy wie im Raum-Kopf am Desktop/Tablet (05.10.2026). Die Raumseite am Handy
// (casora_mobile_sensor_chips, rooms_row) zeichnet dieselbe Badge-Reihe wie casora_room; die
// Variablen dazu stehen nur im Desktop-Dashboard des Paars. Sie kommen zur Laufzeit vom Server
// (WS casora/phone_room_badges, phone_badges.py) – so gilt das auch für nie im Studio gespeicherte
// und aus Hemma umgezogene Dashboards, ohne dass jemand speichern muss. Ohne Antwort (älterer
// Server, Desktop-Dashboard fehlt, Raum nicht zugeordnet) bleibt der Auszug, den das Studio beim
// Speichern in room_chips schreibt (Klima, Licht, Sicherheit), in Desktop-Form gebracht.
// Eigene Einstellungen fürs Handy: Schalter in room_chips[<raum>] (PHONE_OVERRIDE) gehen vor.
// Gleiche Regeln im Studio (casora-panel.js, phoneRoomBadgeVars) – dev/unit/handy_raum_badges.mjs
// vergleicht beide.
(function () {
  if (window.casoraPhoneRoom) return;
  var OVERRIDE = ['show_climate', 'show_lights', 'show_people', 'show_media', 'show_security', 'show_energy',
    'show_climate_inline', 'show_security_inline', 'show_people_inline', 'badge_order'];
  var AQI = ['aqi_entity_pm25', 'aqi_entity_pm10', 'aqi_entity_voc', 'aqi_entity_co2'];
  var LS = 'casora.phoneRooms.';
  var cache = {}, busy = {}, subscribed = false;

  // room_chips-Auszug (Studio bis 1.0.9) → Variablen wie casora_room.
  function legacy(c) {
    var o = {};
    if (!c || typeof c !== 'object') return o;
    if (c.temp_entity) o.temp_sensor_1 = c.temp_entity;
    if (c.humidity_entity) o.humidity_sensor = c.humidity_entity;
    if (c.entity_quality) o.quality_sensor = c.entity_quality;
    (Array.isArray(c.aqi_sensors) ? c.aqi_sensors : []).slice(0, 4).forEach(function (e, i) { if (e) o[AQI[i]] = e; });
    if (c.lights_entity) o.light_group_entity = c.lights_entity;
    if (Array.isArray(c.security_locks) && c.security_locks.length) o.security_locks = c.security_locks.slice();
    ['security_locks_label', 'security_door_sensors', 'security_lock_batteries'].forEach(function (k) {
      if (c[k] != null && c[k] !== '') o[k] = c[k];
    });
    for (var n = 1; n <= 8; n++) {
      if (c['security_entity_' + n]) o['security_entity_' + n] = c['security_entity_' + n];
      if (c['security_label_' + n]) o['security_label_' + n] = c['security_label_' + n];
    }
    // „Name auf dem Badge“ (Studio, 06.10.2026)
    ['climate_title', 'lights_title', 'people_title', 'media_title', 'security_title', 'energy_title'].forEach(function (k) {
      if (c[k]) o[k] = c[k];
    });
    return o;
  }

  function anyBadge(o) {
    var some = function (p, n) { for (var i = 1; i <= n; i++) if (o[p + i]) return true; return false; };
    var list = function (v) { return Array.isArray(v) && v.some(Boolean); };
    var energy = typeof window._casoraEnergyOn === 'function' ? window._casoraEnergyOn(o)
      : (o.show_energy !== false && (!!o.energy_power_entity || list(o.energy_entities)));
    return (o.show_climate !== false && !!(o.climate_entity_1 || o.temp_sensor_1 || o.humidity_sensor || o.quality_sensor))
      || (o.show_lights !== false && !!(o.light_entity_1 || o.light_group_entity))
      || (o.show_people !== false && !!o.presence_entity_1)
      || (o.show_security !== false && (window.casoraHasSec ? window.casoraHasSec(o) : !!(o.security_lock_entity || some('security_entity_', 8)
        || list(o.security_locks) || list(o.security_cameras))))
      || !!energy
      || (o.show_media !== false && !o.show_now_playing && !!o.media_player_1);
  }

  // desk: Variablen des Desktop-Raums (oder null), chip: room_chips[<raum>], name: Raumname.
  function merge(desk, chip, name) {
    var o = Object.assign({}, desk || legacy(chip));
    if (chip && typeof chip === 'object') {
      OVERRIDE.forEach(function (k) { if (chip[k] !== undefined && chip[k] !== null) o[k] = chip[k]; });
    }
    // Szenen haben auf der Raumseite am Handy einen eigenen Bereich (keine Badge).
    o.show_scenes = false;
    o._name = name || (chip && (chip.room_name || chip.aqi_room_name)) || o.room_name || o.aqi_room_name || '';
    o._any = anyBadge(o) || !!(chip && chip.motion_entity);
    return o;
  }

  function urlNow() {
    var seg = String(location.pathname || '').split('/').filter(Boolean)[0] || '';
    return /[-_]mobile$/i.test(seg) ? seg : null;
  }
  function hassOf() { var ha = document.querySelector('home-assistant'); return ha && ha.hass; }
  function readLS(u) {
    try { var r = JSON.parse(localStorage.getItem(LS + u) || 'null'); return r && typeof r === 'object' ? { rooms: r, at: 0 } : null; }
    catch (e) { return null; }
  }
  function writeLS(u, rooms) { try { localStorage.setItem(LS + u, JSON.stringify(rooms)); } catch (e) {} }

  function subscribe(h) {
    if (subscribed || !h || !h.connection || typeof h.connection.subscribeEvents !== 'function') return;
    subscribed = true;
    try {
      // Desktop im Studio gespeichert: gleich neu holen, nicht erst nach einer Minute.
      Promise.resolve(h.connection.subscribeEvents(function () {
        var u = urlNow();
        if (u) load(u);
      }, 'lovelace_updated')).catch(function () {});
    } catch (e) {}
  }

  function load(u) {
    var h = hassOf();
    if (!u || busy[u] || !h || typeof h.callWS !== 'function') return;
    if (h.connection && h.connection.connected === false) return;
    busy[u] = true;
    subscribe(h);
    Promise.resolve(h.callWS({ type: 'casora/phone_room_badges', url_path: u })).then(function (r) {
      var rooms = (r && r.rooms && typeof r.rooms === 'object') ? r.rooms : {};
      var was = JSON.stringify((cache[u] || {}).rooms || null);
      cache[u] = { rooms: rooms, at: Date.now() };
      writeLS(u, rooms);
      if (was !== JSON.stringify(rooms) && window._casoraFilter && window._casoraFilter.bump) window._casoraFilter.bump();
    }, function () {
      // Älterer Server ohne den Befehl: beim room_chips-Auszug bleiben, nicht dauernd fragen.
      cache[u] = cache[u] || { rooms: null };
      cache[u].at = Date.now();
    }).then(function () { busy[u] = false; });
  }

  function ensure(u) {
    if (!u) return;
    if (!cache[u]) cache[u] = readLS(u) || { rooms: null, at: 0 };
    if (Date.now() - (cache[u].at || 0) > 60000) load(u);
  }

  document.addEventListener('visibilitychange', function () {
    var u = urlNow();
    if (!document.hidden && u && cache[u]) cache[u].at = 0;
  });

  window.casoraPhoneRoom = {
    OVERRIDE: OVERRIDE,
    legacy: legacy,
    merge: merge,
    // Variablen der Raumseite <key> (Filterwert „room_…“) oder null.
    vars: function (key, chips) {
      if (typeof key !== 'string' || key.indexOf('room_') !== 0) return null;
      var u = urlNow();
      ensure(u);
      var rooms = u && cache[u] ? cache[u].rooms : null;
      var e = rooms && rooms[key] ? rooms[key] : null;
      var chip = chips && typeof chips === 'object' && chips[key] && typeof chips[key] === 'object' ? chips[key] : null;
      if (!e && !chip) return null;
      return merge(e ? (e.vars || {}) : null, chip, e ? e.name : null);
    },
    refresh: function () { var u = urlNow(); if (u) load(u); },
    // Was der Server liefert (rooms aus casora/phone_room_badges), z. B. für Prüfungen ohne Speichern.
    prime: function (rooms) {
      var u = urlNow();
      if (!u) return;
      cache[u] = { rooms: rooms || {}, at: Date.now() };
      if (window._casoraFilter && window._casoraFilter.bump) window._casoraFilter.bump();
    },
  };
})();

// „Casora wurde aktualisiert“ (1.0.5): Nach einem Update liefen offene Tabs, Wand-Tablets und
// Handys weiter mit dem alten Code, bis jemand von Hand neu lud – teils aus dem Cache sogar danach.
// Der Lader casora-local.js trägt ?v=<jüngste Änderung aller Casora-Skripte> (window.casoraLoadedStamp),
// die Integration kennt den aktuellen Stand (WS casora/version, frontend_version.py). Geprüft wird
// beim Wiederverbinden nach einem HA-Neustart, wenn der Tab sichtbar wird, und alle 10 Minuten.
// Weicht der Stand ab, erscheint unten mittig ein ruhiger Hinweis mit „Neu laden“ – einmal je
// neuem Stand, wegklickbar. „Neu laden“ (auch im ⋯-Menü) löscht vorher Casoras Dateien aus dem
// Cache Storage der Seite; HAs Service Worker und seine übrigen Einträge bleiben unberührt.
// casora-update-check:start
(function () {
  if (window.casoraUpdateNeeded) return;
  var DIGITS = /^\d+$/;
  // loaded: Stempel aus der Lader-URL; server: Antwort von casora/version; dismissed: weggeklickter Stand.
  window.casoraUpdateNeeded = function (loaded, server, dismissed) {
    var now = server && server.stamp != null ? String(server.stamp) : '';
    var was = loaded != null ? String(loaded) : '';
    if (!DIGITS.test(now) || !DIGITS.test(was)) return false;   // alter Server, yaml-Modus, Lader ohne ?v=
    if (now === was) return false;
    if (dismissed != null && String(dismissed) === now) return false;
    return true;
  };
  // Nur Casoras eigene Adressen: /casora_scripts, /casora_assets, /casora_panel … und /local/casora.
  window.casoraIsOwnUrl = function (url) {
    var path;
    try { path = new URL(url, 'http://x').pathname; } catch (e) { return false; }
    return /^\/(casora_[a-z0-9_]+|local\/casora)\//i.test(path);
  };
})();
// casora-update-check:end
(function () {
  if (window.casoraHardReload) return;
  var KEY = 'casora.updateDismissed';
  var EVERY = 10 * 60000;

  window.casoraHardReload = function () {
    var gone = false;
    var go = function () { if (gone) return; gone = true; try { window.location.reload(); } catch (e) {} };
    setTimeout(go, 3000);   // ein hängender Cache darf das Neuladen nicht aufhalten
    var p = Promise.resolve();
    try {
      if (window.caches && typeof caches.keys === 'function') {
        p = caches.keys().then(function (names) {
          return Promise.all(names.map(function (n) {
            return caches.open(n).then(function (c) {
              return c.keys().then(function (reqs) {
                return Promise.all(reqs.filter(function (r) { return window.casoraIsOwnUrl(r.url); })
                  .map(function (r) { return c.delete(r); }));
              });
            });
          }));
        });
      }
    } catch (e) { /* ohne Cache Storage einfach neu laden */ }
    p.catch(function () {}).then(go);
  };

  var tr = function (s) { return window.casoraTr ? window.casoraTr(s) : s; };
  var dismissed = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var shownFor = null;

  function hide(el) {
    if (!el || !el.parentNode) return;
    el.style.transition = 'opacity 160ms ease, transform 180ms ease';
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, 8px)';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
  }

  function show(stamp) {
    if (shownFor === stamp && document.getElementById('casora-update-hint')) return;
    var old = document.getElementById('casora-update-hint');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    shownFor = stamp;
    var el = document.createElement('div');
    el.id = 'casora-update-hint';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    Object.assign(el.style, {
      position: 'fixed', left: '50%', zIndex: '99998', boxSizing: 'border-box',
      bottom: 'calc(16px + var(--casora-mobile-nav-space, env(safe-area-inset-bottom, 0px)))',
      display: 'flex', alignItems: 'center', gap: '6px', width: 'max-content',
      maxWidth: 'calc(100vw - 32px)', padding: '6px 6px 6px 18px', minHeight: '52px',
      font: 'inherit', fontSize: '14px', lineHeight: '1.3',
      opacity: '0', transform: 'translate(-50%, 8px)',
    });
    if (window.casoraMenuGlass) window.casoraMenuGlass.apply(el);
    el.style.borderRadius = '26px';
    var fg = 'var(--casora-menu-fg, #fff)';

    var txt = document.createElement('span');
    txt.textContent = tr('Casora wurde aktualisiert');
    Object.assign(txt.style, { flex: '1 1 auto', minWidth: '0', fontWeight: '500', marginRight: '6px', color: fg,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = tr('Neu laden');
    Object.assign(btn.style, {
      flex: 'none', border: '0', cursor: 'pointer', font: 'inherit', fontSize: '14px', fontWeight: '600',
      height: '40px', padding: '0 16px', borderRadius: '20px', color: fg,
      background: 'color-mix(in srgb, ' + fg + ' 14%, transparent)',
    });
    btn.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      btn.disabled = true; btn.style.opacity = '.6';
      window.casoraHardReload();
    };

    var x = document.createElement('button');
    x.type = 'button';
    x.setAttribute('aria-label', tr('Schließen'));
    Object.assign(x.style, {
      flex: 'none', border: '0', cursor: 'pointer', width: '40px', height: '40px', borderRadius: '20px',
      display: 'grid', placeItems: 'center', background: 'transparent', color: fg, opacity: '.7', padding: '0',
    });
    var ico = document.createElement('ha-icon');
    ico.setAttribute('icon', 'mdi:close');
    ico.style.setProperty('--mdc-icon-size', '20px');
    x.appendChild(ico);
    x.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      try { localStorage.setItem(KEY, stamp); } catch (err) { /* dann nur für diesen Tab */ }
      hide(el);
    };

    el.appendChild(txt); el.appendChild(btn); el.appendChild(x);
    document.body.appendChild(el);
    requestAnimationFrame(function () {
      el.style.transition = 'opacity 220ms cubic-bezier(0.32,0.72,0,1), transform 260ms cubic-bezier(0.32,0.72,0,1)';
      el.style.opacity = '1';
      el.style.transform = 'translate(-50%, 0)';
    });
  }

  var busy = false, last = 0, conn = null;
  function hass() { var h = document.querySelector('home-assistant'); return h && h.hass; }

  function check(force) {
    var h = hass();
    watch(h);
    if (busy || !h || typeof h.callWS !== 'function') return;
    if (h.connection && h.connection.connected === false) return;
    if (!force && Date.now() - last < 30000) return;
    var loaded = window.casoraLoadedStamp;
    if (!loaded) return;
    busy = true; last = Date.now();
    Promise.resolve(h.callWS({ type: 'casora/version' })).then(function (r) {
      if (window.casoraUpdateNeeded(loaded, r, dismissed())) show(String(r.stamp));
    }, function () { /* ältere Integration oder HA startet noch */ }).then(function () { busy = false; });
  }

  // Nach einem HA-Neustart verbindet sich die Seite neu; die Integration ist dann evtl. noch nicht
  // fertig eingerichtet – darum zweimal nachsehen.
  function watch(h) {
    var c = h && h.connection;
    if (!c || c === conn || typeof c.addEventListener !== 'function') return;
    conn = c;
    c.addEventListener('ready', function () {
      setTimeout(function () { check(true); }, 5000);
      setTimeout(function () { check(true); }, 45000);
    });
  }

  setTimeout(function () { check(true); }, 15000);
  setInterval(function () { check(true); }, EVERY);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) check(false); });
  window.casoraUpdateCheck = function () { check(true); };
})();
