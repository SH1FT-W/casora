// ── Kaffeevollautomat: Kachel + Popup (Community-Karte) ──────────────────────────
// Eine Kachel für Kaffeevollautomaten verschiedener Integrationen. Gewählt wird eine Entität des Geräts
// (Status-Sensor, Strom-Schalter oder Getränke-Auswahl), den Rest findet das Rollenmodell am selben Gerät:
// über translation_key + Integration (platform), die Entity-ID nur als Rückfall. Unterstützt:
//   Home Connect (home_connect, homeconnect_ws, home_connect_alt), Miele, De'Longhi (delonghi_primadonna,
//   delonghi_coffee, delonghi_coffeelink), Jura, Melitta/Nivona (melitta_barista), La Marzocco und als
//   Rückfall eine Steckdose mit Leistungsmessung (> 50 W bezieht/heizt, < 3 W aus).
// Im Testhaus läuft alles unter casora_mock – die Familie ergibt sich dann aus den Schlüsseln.
//   window._casoraCoffee.items(hass, id)          → Entitäten des Geräts [{entity_id, key, platform, domain, dc, unit, options, state}]
//   window._casoraCoffee.roles(items, anchor)     → Rollen (rein, ohne hass): {fam, power, status, sel, start, stop, warns, pre, counters, …}
//   window._casoraCoffee.find(hass, id)           → roles(items(hass, id)) mit Zwischenspeicher
//   window._casoraCoffee.status(c, states, now)   → {st, label, drink, phase, pct, remain, warns[], pre[], total, perDrink[], …}
//   window._casoraCoffee.tileText / active / color / ring / iconService – Kachel casora_coffee
//   window._casoraCoffee.popup(entity, states, hass)    – Popup casora_popup_coffee
//   window._casoraCoffee.sec(part, c, states, hass, el) – Live-Bereiche (hero, ring, drinks, run, warn, care, stats)
(function () {
  if (window._casoraCoffee) return;
  var K = window._casoraCoffee = {};

  var COLOR = {
    on: 'var(--casora-color-teal, #4E9E95)',
    warn: 'var(--casora-color-orange, #DE8A4E)',
    bad: 'var(--casora-color-red, #D35A4E)',
  };
  K.COLOR = COLOR;
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  // Schlüssel vergleichen: klein, ohne „_“, „.“, Leer- und Bindestriche (Core: consumer_products_coffee_maker_…,
  // homeconnect_ws: consumerproducts_coffeemaker_…, home_connect_alt: ConsumerProducts.CoffeeMaker.…).
  var nk = function (x) { return String(x == null ? '' : x).toLowerCase().replace(/[\s_.\-]/g, ''); };
  K.nk = nk;
  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };
  var T = function (x) { return window.casoraT ? window.casoraT(x) : x; };
  var loc = function () { return window.casoraLocale ? window.casoraLocale() : undefined; };

  // ── Familien ──────────────────────────────────────────────────────────────
  var PLATFORM = { home_connect: 'hc', homeconnect_ws: 'hcws', home_connect_alt: 'hcalt', miele: 'miele',
    delonghi_primadonna: 'dlbt', delonghi_coffee: 'dlwifi', delonghi_coffeelink: 'dllink', jura: 'jura',
    melitta_barista: 'melitta', lamarzocco: 'lamarzocco' };
  K.PLATFORM = PLATFORM;
  var HC = { hc: 1, hcws: 1, hcalt: 1 };

  // ── Getränke ──────────────────────────────────────────────────────────────
  // Schlüssel normalisiert (nk) nach dem Abschneiden der Programm-Vorsilbe → [Name, Symbol].
  var CUP = 'mdi:coffee-outline', MUG = 'mdi:coffee', TALL = 'mdi:glass-mug-variant', MILK = 'mdi:cup', GLASS = 'mdi:glass-pint-outline';
  var DRINK = {
    ristretto: ['Ristretto', CUP], espresso: ['Espresso', CUP], espressodoppio: ['Espresso doppio', CUP], doppio: ['Doppio', CUP],
    doubleespresso: ['Doppio', CUP], coffee: ['Kaffee', MUG], caffecrema: ['Caffè Crema', MUG], crema: ['Caffè Crema', MUG],
    regular: ['Kaffee', MUG], coffeepot: ['Kaffeekanne', 'mdi:coffee-maker-outline'], pot: ['Kaffeekanne', 'mdi:coffee-maker-outline'],
    xlcoffee: ['XL-Kaffee', TALL], caffegrande: ['Caffè Grande', TALL], longcoffee: ['Lungo', TALL], lungo: ['Lungo', TALL],
    long: ['Lungo', TALL], americano: ['Americano', MUG], espressomacchiato: ['Espresso Macchiato', MILK],
    cappuccino: ['Cappuccino', MILK], cappuccinomix: ['Cappuccino', MILK], flatwhite: ['Flat White', MILK], cortado: ['Cortado', MILK],
    galao: ['Galão', GLASS], lattemacchiato: ['Latte Macchiato', GLASS], caffelatte: ['Caffè Latte', GLASS], lattecoffee: ['Caffè Latte', GLASS],
    cafeaulait: ['Milchkaffee', GLASS], milchkaffee: ['Milchkaffee', GLASS], cafeconleche: ['Café con leche', GLASS],
    kaffeeverkehrt: ['Kaffee verkehrt', GLASS], coffeewithmilk: ['Kaffee mit Milch', GLASS], warmemilch: ['Warme Milch', 'mdi:cup-outline'],
    milkfroth: ['Milchschaum', 'mdi:cloud-outline'], milkfoam: ['Milchschaum', 'mdi:cloud-outline'], frothymilk: ['Milchschaum', 'mdi:cloud-outline'],
    warmmilk: ['Warme Milch', 'mdi:cup-outline'], hotmilk: ['Warme Milch', 'mdi:cup-outline'], milk: ['Warme Milch', 'mdi:cup-outline'],
    hotwater: ['Heißwasser', 'mdi:kettle-steam-outline'], water: ['Heißwasser', 'mdi:kettle-steam-outline'], tea: ['Tee', 'mdi:tea-outline'],
    redeye: ['Red Eye', MUG], blackeye: ['Black Eye', MUG], deadeye: ['Dead Eye', MUG], cafecortado: ['Café cortado', MILK],
    icedcoffee: ['Eiskaffee', GLASS], coldbrew: ['Cold Brew', GLASS],
  };
  // Pflegeprogramme (nicht ins Getränke-Raster): Home Connect cleaning_modes, Miele, De'Longhi.
  var CARE = /^(cleaning|rinse|rinsing|appliancerinse|descal|decalc|calcnclean|brewunit|milksystem|clean|spuel|entkalk|reinig)/;
  // Programm-Schlüssel → normalisierter Kern: Vorsilben der Integrationen ab, Pflege erkannt.
  K.progKey = function (raw) {
    var k = nk(raw);
    if (!k) return { k: '', care: false, my: null };
    k = k.replace(/^.*?coffeemaker(program)?/, '').replace(/^program/, '');
    var care = /^cleaningmodes/.test(k);
    k = k.replace(/^(beverage|coffeeworld|cleaningmodes)/, '');
    var my = /^mycoffee(?:mycoffee)?(\d*)$/.exec(k);
    if (my) return { k: 'mycoffee' + my[1], care: false, my: my[1] };
    return { k: k, care: care || CARE.test(k), my: null };
  };
  var pretty = function (raw) {
    var s = String(raw || '');
    var last = s.split(/[.]/).pop();
    last = last.replace(/^.*_program_(beverage|coffee_world|cleaning_modes)_/, '').replace(/^consumer_?products_?coffee_?maker_?/i, '');
    last = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
    return last ? last.charAt(0).toUpperCase() + last.slice(1) : s;
  };
  K.drink = function (raw) {
    if (bad(raw) || /^(none|noprogram|no_program|off)$/i.test(String(raw))) return null;
    var p = K.progKey(raw);
    if (p.my != null) return { key: p.k, raw: raw, label: 'Mein Kaffee' + (p.my ? ' ' + p.my : ''), icon: 'mdi:star-outline', care: false };
    var d = DRINK[p.k];
    var careLabel = /descal|decalc|entkalk/.test(p.k) ? 'Entkalken' : /calcnclean/.test(p.k) ? 'Entkalken & Reinigen'
      : /rinse|spuel/.test(p.k) ? 'Spülen' : 'Reinigen';
    return { key: p.k, raw: raw, label: d ? d[0] : (p.care ? careLabel : pretty(raw)), icon: d ? d[1] : (p.care ? 'mdi:spray-bottle' : MUG), care: p.care && !d };
  };

  // ── Entitäten des Geräts ──────────────────────────────────────────────────
  K.items = function (hass, id) {
    var R = (hass && hass.entities) || {}, S = (hass && hass.states) || {};
    var me = R[id];
    var out = [];
    var dev = me && me.device_id;
    var ids = dev ? Object.keys(R).filter(function (eid) { var e = R[eid]; return e && e.device_id === dev && !e.hidden; }) : [id];
    ids.sort().forEach(function (eid) {
      var e = R[eid] || {}, st = S[eid];
      if (!st) return;
      var a = st.attributes || {};
      out.push({ entity_id: eid, key: e.translation_key || null, platform: e.platform || null, domain: eid.split('.')[0],
        dc: a.device_class || null, unit: a.unit_of_measurement || null, options: Array.isArray(a.options) ? a.options : null,
        name: a.friendly_name || '', device_id: dev || null, state: st.state });
    });
    return out;
  };

  // ── Rollenmodell (rein) ───────────────────────────────────────────────────
  // Warnungen: [Art, Muster (normalisiert, Ende des Schlüssels), Untertyp]
  var WARN = [
    ['wasser', 'watertankempty'], ['wasser', 'alertfillwater'], ['wasser', 'fillwater'], ['wasser', 'emptywatertank'],
    ['wasser', 'watertank', 'level'],
    ['bohnen', 'beancontainerempty'], ['bohnen', 'coffeebeansempty'], ['bohnen', 'beansempty'], ['bohnen', 'fillbeans'],
    ['schale', 'driptrayfull'], ['schale', 'driptray', 'tray'], ['schale', 'alertemptytray'], ['schale', 'emptydriptray'],
    ['schale', 'alertinserttray', 'missing'], ['schale', 'traymissing', 'missing'],
    ['satz', 'alertemptygrounds'], ['satz', 'wastecontainerfull'], ['satz', 'coffeewastecontainerfull'], ['satz', 'groundscontainerfull'],
    ['milch', 'keepmilktankcool', 'cool'], ['milch', 'alertcappurinsealert', 'system'], ['milch', 'alertcappucleanalert', 'system'],
    ['milch', 'frothercleanwarning', 'system'],
    ['entkalken', 'devicedescalingoverdue', 'overdue'], ['entkalken', 'devicedescalingblockage', 'blockage'],
    ['entkalken', 'deviceshouldbedescaled'], ['entkalken', 'decalcificationneeded'], ['entkalken', 'descalewarning'],
    ['entkalkenreinigen', 'devicecalcncleanoverdue', 'overdue'], ['entkalkenreinigen', 'deviceshouldbecalcncleaned'],
    ['reinigen', 'devicecleaningoverdue', 'overdue'], ['reinigen', 'deviceshouldbecleaned'], ['reinigen', 'alertcleaningalert'],
    ['reinigen', 'brewunitcleanwarning'],
    ['filter', 'filterchangeneeded'], ['filter', 'alertfilteralert'], ['filter', 'filterwarning'], ['filter', 'replacewaterfilter'],
  ];
  // De'Longhi WLAN (delonghi_coffee): Alarm-Nummern.
  var DL_ALARM = { 0: 'wasser', 1: 'satz', 2: 'entkalken', 3: 'filter', 5: 'bohnen', 11: ['schale', 'missing'], 16: 'reinigen' };
  // Vorwarnungen in Tassen: Home Connect „descaling_in_10_cups“ (enum present), homeconnect_ws „countdown_*“ (Zahl).
  var PRE = [['entkalkenreinigen', /calcnclean(in)?(\d+)cups$/], ['entkalken', /descalingin(\d+)cups$/]];
  var COUNTDOWN = { countdowndescaling: 'entkalken', countdowncleaning: 'reinigen', countdowncalcnclean: 'entkalkenreinigen', countdownwaterfilter: 'filter' };
  // Zähler (Tassen) → Name. Endung des Schlüssels; ml-Zähler zählen nicht als Getränke.
  var COUNT = [
    [/powder_?coffee/, 'Pulverkaffee', MUG], [/ristretto_?espresso/, 'Ristretto & Espresso', CUP],
    [/coffee_?(and|with)_?milk/, 'Kaffee mit Milch', MILK],
    [/(^|_)(coffee_counter|coffees|coffee_cups)$|^coffeecounter$|countcoffee$/, 'Kaffee', MUG],
    [/frothy_?milk/, 'Milchschaum', 'mdi:cloud-outline'], [/hot_?milk/, 'Warme Milch', 'mdi:cup-outline'],
    [/(^|_)milk_?cups?$|^milk_counter$|countmilk$/, 'Milchgetränke', MILK],
    [/hot_?water_?cups/, 'Heißwasser', 'mdi:kettle-steam-outline'],
  ];

  var tail = function (it) { var t = String(it.entity_id || '').split('.')[1] || ''; return nk(t); };
  // Schlüssel passt (translation_key, sonst – nur ohne Schlüssel – das Ende der Entity-ID).
  var hit = function (it, pats, exact) {
    var k = nk(it.key), tl = tail(it);
    for (var i = 0; i < pats.length; i++) {
      var p = pats[i];
      if (k && (k === p || (!exact && k.length > p.length && k.slice(-p.length) === p))) return true;
      if (!k && tl && (tl === p || tl.slice(-p.length) === p)) return true;
    }
    return false;
  };

  K.family = function (items) {
    var fam = null;
    items.forEach(function (it) { if (!fam && it.platform && PLATFORM[it.platform]) fam = PLATFORM[it.platform]; });
    if (fam) return fam;
    var keys = items.map(function (it) { return nk(it.key); });
    var has = function (re) { return keys.some(function (k) { return re.test(k); }); };
    var opt = items.some(function (it) { return (it.options || []).some(function (o) { return /coffeemaker/.test(nk(o)); }); });
    if (has(/^sensoroperationstate$|^switchpowerstate$|^selectprogram$/)) return 'hcws';
    if (has(/^operationstate$/) && (opt || has(/beanamount|coffeecounter|beancontainer/))) return 'hc';
    if (has(/bshcommonstatusoperationstate/)) return 'hcalt';
    if (has(/^programid$/) && has(/^status$/)) return 'miele';
    if (has(/^(machinestatus|devicestatus)$/) && has(/^beverage$/)) return 'dlbt';
    if (has(/^alarm\d+$/) || has(/^brew/)) return 'dlwifi';
    if (has(/^(machinestatus)$/) && has(/^(decalcificationneeded|wastecontainerfull)$/)) return 'dllink';
    if (has(/^alert/) || (has(/^product$/) && has(/^make$/))) return 'jura';
    if (has(/^recipe$/) || has(/^actionrequired$/)) return 'melitta';
    if (has(/^brewingactive$/) || has(/^totalcoffeesmade$/)) return 'lamarzocco';
    return null;
  };

  // Ist das Gerät ein Kaffeevollautomat? (Home Connect und Miele bauen auch Waschmaschinen.)
  K.isCoffeeItems = function (items) {
    var fam = K.family(items);
    if (!fam) return false;
    if (HC[fam]) {
      return items.some(function (it) {
        return /coffee|beanamount|beancontainer|espresso/.test(nk(it.key) + ' ' + tail(it))
          || (it.options || []).some(function (o) { return /coffeemaker/.test(nk(o)); });
      });
    }
    if (fam === 'miele') {
      return items.some(function (it) {
        return (it.options || []).concat([it.state]).some(function (o) { return /espresso|cappuccino|lattemacchiato|ristretto/.test(nk(o)); })
          || /coffee/.test(nk(it.key));
      });
    }
    return true;
  };

  K.roles = function (items, anchor) {
    items = items || [];
    var fam = K.family(items);
    var c = { fam: fam, anchor: anchor || null, device: null, power: null, powerOff: null, status: null, activity: null, phase: null,
      program: null, actSel: null, sel: null, start: null, stop: null, pause: null, brew: [], progress: null, remaining: null, finish: null,
      remote: null, dispensing: null, opts: {}, warns: [], pre: [], counters: [], total: null, plugW: null, careSel: null };
    var by = function (dom, pats, exact) {
      for (var i = 0; i < items.length; i++) if (items[i].domain === dom && hit(items[i], pats, exact)) return items[i].entity_id;
      return null;
    };
    items.forEach(function (it) { if (!c.device && it.device_id) c.device = it.device_id; });
    // Strom: Schalter der Maschine (Jura „connection“ = Bluetooth, nie als Strom; La Marzocco „main“).
    c.power = by('switch', ['powerstate', 'power'], true) || by('switch', ['powerstate'])
      || (fam === 'lamarzocco' ? by('switch', ['main'], true) : null)
      || (fam === 'dlbt' || fam === 'dllink' ? by('switch', ['power']) : null);
    c.powerOff = by('button', ['switchoff', 'turnoff', 'poweroff']);
    // Status
    c.status = by('sensor', ['operationstate'])
      || (fam === 'miele' ? by('sensor', ['status'], true) : null)
      || by('sensor', ['machinestatus', 'devicestatus'], true)
      || (fam === 'melitta' || fam === 'jura' ? by('sensor', ['state', 'status'], true) : null);
    c.activity = fam === 'melitta' ? by('sensor', ['activity'], true) : null;
    c.phase = by('sensor', ['programphase'], true);
    c.program = by('sensor', ['programid', 'activeprogram'], true);
    // Getränke: HC „active_program“ startet sofort (nur mit Fernstart), „selected_program“ wählt nur.
    c.actSel = HC[fam] ? by('select', ['activeprogram']) : null;
    c.sel = by('select', ['selectedprogram', 'selectprogram'], true) || by('select', ['selectedprogram'])
      || by('select', ['beverage', 'product', 'recipe', 'drink'], true);
    if (!c.sel && (fam === 'hcws' || fam === 'hcalt')) {
      items.forEach(function (it) { if (!c.sel && it.domain === 'select' && it.entity_id !== c.actSel && hit(it, ['program', 'programs'])) c.sel = it.entity_id; });
    }
    c.start = by('button', ['startprogram', 'buttonstartprogram', 'make', 'brew', 'start'], true) || by('button', ['startprogram']);
    c.stop = by('button', ['stopprogram', 'abortprogram', 'buttonabortprogram', 'cancel', 'stop'], true) || by('button', ['abortprogram', 'stopprogram']);
    c.pause = by('button', ['pauseprogram', 'pause'], true);
    items.forEach(function (it) {
      if (it.domain !== 'button' || it.entity_id === c.start || it.entity_id === c.stop) return;
      var k = String(it.key || '').toLowerCase(), m = /^(brew|start)_(.+)$/.exec(k);
      if (!m && !it.key) m = /_(brew|start)_([a-z_]+)$/.exec(String(it.entity_id));
      if (m && m[2] !== 'program') c.brew.push({ id: it.entity_id, prog: m[2] });
    });
    c.progress = by('sensor', ['programprogress', 'progress'], true) || by('sensor', ['programprogress']);
    c.remaining = by('sensor', ['remainingtime', 'remainingprogramtime'], true);
    c.finish = by('sensor', ['programfinishtime', 'finishtime'], true);
    c.remote = by('binary_sensor', ['remotestart', 'remotestartallowed', 'binaryremotestartallowed', 'remotecontrolstartallowed'], true)
      || by('binary_sensor', ['remotestartallowed', 'remotecontrolstartallowed']);
    c.dispensing = by('binary_sensor', ['dispensing', 'brewingactive', 'brewing'], true);
    // Optionen (nur Home Connect liefert sie als eigene Entitäten).
    c.opts.strength = by('select', ['beanamount']);
    c.opts.temp = by('select', ['coffeetemperature']);
    c.opts.amount = by('number', ['fillquantity']);
    // Warnungen
    var seen = {};
    var addW = function (id, art, sub, how) { if (!id || seen[id]) return; seen[id] = 1; c.warns.push({ id: id, art: art, sub: sub || null, how: how }); };
    items.forEach(function (it) {
      if (it.domain !== 'binary_sensor' && it.domain !== 'sensor') return;
      var k = nk(it.key) || tail(it), m;
      if (fam === 'dlwifi' && (m = /alarm(\d+)$/.exec(k)) && DL_ALARM[m[1]] != null) {
        var x = DL_ALARM[m[1]];
        addW(it.entity_id, Array.isArray(x) ? x[0] : x, Array.isArray(x) ? x[1] : null, 'bin');
        return;
      }
      // De'Longhi BT: binäre „descaling“ / „filter“ melden Pflege nötig.
      if (fam === 'dlbt' && it.domain === 'binary_sensor' && /^(descaling|filter)$/.test(k)) { addW(it.entity_id, k === 'filter' ? 'filter' : 'entkalken', null, 'bin'); return; }
      for (var i = 0; i < WARN.length; i++) {
        var p = WARN[i][1];
        if (k === p || (k.length > p.length && k.slice(-p.length) === p)) {
          // homeconnect_ws: Wassertank/Schale als enum-Sensor (empty, nearly_empty, not_inserted, full, ok)
          addW(it.entity_id, WARN[i][0], WARN[i][2] || null, it.domain === 'binary_sensor' ? 'bin' : (WARN[i][2] === 'level' || WARN[i][2] === 'tray') ? WARN[i][2] : 'enum');
          return;
        }
      }
      // Melitta: action_required (fill_water, empty_trays, trays_missing …)
      if (k === 'actionrequired') { addW(it.entity_id, 'aktion', null, 'melitta'); return; }
      for (var j = 0; j < PRE.length; j++) {
        var mm = PRE[j][1].exec(k);
        if (mm) { c.pre.push({ id: it.entity_id, art: PRE[j][0], cups: Number(mm[mm.length - 1]), how: 'enum' }); return; }
      }
      var cd = Object.keys(COUNTDOWN).filter(function (x) { return k.slice(-x.length) === x; })[0];
      if (cd && it.domain === 'sensor') { c.pre.push({ id: it.entity_id, art: COUNTDOWN[cd], cups: null, how: 'count' }); return; }
    });
    // Zähler
    items.forEach(function (it) {
      if (it.domain !== 'sensor') return;
      var key = String(it.key || '').toLowerCase(), t = String(it.entity_id).split('.')[1] || '', k = nk(key) || nk(t);
      var ml = /^(ml|l)$/i.test(String(it.unit || '')) || /hotwatercounter$|totalwater$/.test(k);
      if (/^(totalbeverages|totalproduct|totalcoffeesmade|totalcoffee|counttotal|beveragecounter|totalcups)$/.test(k) || (!key && /total_(beverages|product|coffees_made)$/.test(t))) {
        if (k === 'totalcoffee' && fam === 'dlbt') { c.counters.push({ id: it.entity_id, label: 'Kaffee', icon: MUG, ml: false }); return; }
        if (!c.total) c.total = it.entity_id;
        return;
      }
      var m1 = /^product_?(.+)$/.exec(key) || (/^sensor_count_(.+)$/.exec(key)) || (fam === 'hcws' ? /^count_(.+)$/.exec(key) : null);
      if (m1 && !/total/.test(m1[1])) {
        var d = K.drink(m1[1]);
        c.counters.push({ id: it.entity_id, label: d ? d.label : pretty(m1[1]), icon: d ? d.icon : MUG, ml: ml });
        return;
      }
      var src = key || t;
      for (var i = 0; i < COUNT.length; i++) {
        if (COUNT[i][0].test(src)) { c.counters.push({ id: it.entity_id, label: COUNT[i][1], icon: COUNT[i][2], ml: ml }); return; }
      }
      if (fam === 'dlbt' && /^totalwater$/.test(k)) c.counters.push({ id: it.entity_id, label: 'Heißwasser', icon: 'mdi:kettle-steam-outline', ml: ml });
    });
    // Rückfall Steckdose: Schalter + Leistung am Gerät.
    if (!fam) {
      var sw = items.filter(function (it) { return it.domain === 'switch'; })[0];
      var pw = items.filter(function (it) { return it.domain === 'sensor' && (it.dc === 'power' || it.unit === 'W'); })[0];
      if (sw && pw) { c.fam = 'plug'; c.power = sw.entity_id; c.plugW = pw.entity_id; }
    }
    return c;
  };

  var cache = {};
  K.find = function (hass, id) {
    var R = (hass && hass.entities) || null;
    var hitc = cache[id];
    if (hitc && hitc.R === R && R) return hitc.c;
    var c = K.roles(K.items(hass, id), id);
    cache[id] = { R: R, c: c };
    return c;
  };
  K.is = function (hass, id) {
    if (!id || !hass) return false;
    return K.isCoffeeItems(K.items(hass, id));
  };
  K.watch = function (c) {
    var out = [c.anchor, c.power, c.powerOff, c.status, c.activity, c.phase, c.program, c.actSel, c.sel, c.start, c.stop, c.pause,
      c.progress, c.remaining, c.finish, c.remote, c.dispensing, c.opts.strength, c.opts.temp, c.opts.amount, c.total, c.plugW];
    c.brew.forEach(function (b) { out.push(b.id); });
    c.warns.forEach(function (w) { out.push(w.id); });
    c.pre.forEach(function (w) { out.push(w.id); });
    c.counters.forEach(function (w) { out.push(w.id); });
    return out.filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  };

  // ── Zustand ───────────────────────────────────────────────────────────────
  var WARN_TXT = {
    wasser: ['Wasser nachfüllen', 'Wassertank ist leer', 'mdi:cup-water'], bohnen: ['Bohnen nachfüllen', 'Bohnenbehälter ist leer', 'mdi:seed-outline'],
    schale: ['Schale leeren', 'Tropfschale ist voll', 'mdi:tray-alert'], satz: ['Satzbehälter leeren', 'Kaffeesatz ist voll', 'mdi:delete-variant'],
    milch: ['Milch kühlen', 'Milch in den Kühlschrank stellen', 'mdi:cow'], entkalken: ['Entkalken', 'Entkalkungsprogramm starten', 'mdi:water-alert'],
    entkalkenreinigen: ['Entkalken & Reinigen', 'Pflegeprogramm starten', 'mdi:spray-bottle'], reinigen: ['Reinigen', 'Reinigungsprogramm starten', 'mdi:spray-bottle'],
    filter: ['Filter wechseln', 'Wasserfilter ist verbraucht', 'mdi:filter-outline'],
  };
  K.WARN_TXT = WARN_TXT;
  var ORDER = ['wasser', 'bohnen', 'schale', 'satz', 'milch', 'entkalkenreinigen', 'entkalken', 'reinigen', 'filter'];
  var MELITTA_ACT = { fill_water: 'wasser', empty_trays: 'schale', empty_tray: 'schale', trays_missing: ['schale', 'missing'],
    tray_missing: ['schale', 'missing'], fill_beans: 'bohnen', empty_grounds: 'satz', insert_brew_unit: ['reinigen', 'unit'] };
  // Ein Wert aus dem Status-Sensor kann ein Alarm sein (De'Longhi BT: „empty_water_tank“).
  var STATUS_ALARM = { emptywatertank: 'wasser', watertankempty: 'wasser', nowater: 'wasser', coffeewastecontainerfull: 'satz',
    groundscontainerfull: 'satz', wastecontainerfull: 'satz', descalealarm: 'entkalken', descalingalarm: 'entkalken', replacewaterfilter: 'filter',
    coffeebeansempty: 'bohnen', beansempty: 'bohnen', emptydriptray: 'schale', driptrayfull: 'schale', driptraymissing: ['schale', 'missing'],
    insertdriptray: ['schale', 'missing'], watertankmissing: ['wasser', 'missing'] };
  // Aktiv: present/on, enum ∉ {off, none, ok, full, confirmed}; „confirmed“ = quittiert.
  var warnOn = function (w, v) {
    var s = String(v == null ? '' : v).toLowerCase();
    if (bad(s)) return null;
    if (w.how === 'bin') return s === 'on' ? {} : null;
    if (w.how === 'level') {
      if (/^(empty|nearlyempty|nearly_empty|low)$/.test(s)) return { soft: s !== 'empty' };
      if (/^(notinserted|not_inserted|missing)$/.test(s)) return { sub: 'missing' };
      return null;
    }
    if (w.how === 'tray') {
      if (/^(full)$/.test(s)) return {};
      if (/^(notinserted|not_inserted|missing)$/.test(s)) return { sub: 'missing' };
      return null;
    }
    if (w.how === 'melitta') {
      var x = MELITTA_ACT[s];
      if (!x || /^(none|ok|no)$/.test(s)) return null;
      return Array.isArray(x) ? { art: x[0], sub: x[1] } : { art: x };
    }
    if (s === 'on' || s === 'present' || s === 'true') return {};
    if (/^(off|none|ok|full|confirmed|false|no|inactive|normal)$/.test(s)) return null;
    return {};
  };
  var warnLabel = function (art, sub, soft) {
    if (art === 'wasser' && sub === 'missing') return ['Wassertank einsetzen', 'Wassertank fehlt'];
    if (art === 'wasser' && soft) return ['Wasser bald leer', 'Wassertank ist fast leer'];
    if (art === 'schale' && sub === 'missing') return ['Schale einsetzen', 'Tropfschale fehlt'];
    if (art === 'reinigen' && sub === 'unit') return ['Brühgruppe einsetzen', 'Brühgruppe fehlt'];
    if (sub === 'overdue') return [WARN_TXT[art][0] + ' überfällig', WARN_TXT[art][1]];
    if (sub === 'blockage') return ['Entkalken blockiert', 'Entkalken an der Maschine fortsetzen'];
    if (art === 'milch' && sub === 'system') return ['Milchsystem reinigen', 'Milchsystem spülen und reinigen'];
    return WARN_TXT[art] ? [WARN_TXT[art][0], WARN_TXT[art][1]] : null;
  };

  // Status-Wörter je Familie → normalisiert: aus · bereit · heizt · bezieht · pflege · aktion_noetig · fehler · fertig · offline
  var ST = {
    // Home Connect (alle drei; home_connect_alt: letztes Glied von BSH.Common.EnumType.OperationState.Run)
    inactive: 'aus', ready: 'bereit', delayedstart: 'bereit', run: 'bezieht', pause: 'bezieht', actionrequired: 'aktion_noetig',
    finished: 'fertig', error: 'fehler', aborting: 'bezieht',
    // Miele
    off: 'aus', on: 'bereit', programmed: 'bereit', waitingtostart: 'bereit', inuse: 'bezieht', programended: 'fertig',
    failure: 'fehler', idle: 'bereit', service: 'aktion_noetig', autocleaning: 'pflege', notconnected: 'offline',
    // De'Longhi, Melitta, Jura, Texte
    turnedoff: 'aus', standby: 'aus', heating: 'heizt', heatingup: 'heizt', warmingup: 'heizt', preheating: 'heizt',
    brewing: 'bezieht', preparing: 'bezieht', dispensing: 'bezieht', grinding: 'bezieht', delivering: 'bezieht',
    deliveringhotwater: 'bezieht', deliveringmilk: 'bezieht', deliveringsteam: 'bezieht', busy: 'bezieht', making: 'bezieht', product: 'bezieht',
    washing: 'pflege', rinsing: 'pflege', rinse: 'pflege', cleaning: 'pflege', descaling: 'pflege', decalcification: 'pflege',
    calcnclean: 'pflege', milkcleaning: 'pflege', ok: 'bereit', alarm: 'aktion_noetig', blocked: 'aktion_noetig',
  };
  var PHASE = { heatingup: 'Heizt auf', grinding: 'Mahlt', prebrewing: 'Brüht vor', espresso: 'Brüht', brewing: 'Brüht', dispensing: 'Läuft ein',
    hotmilk: 'Milch', milkfoam: 'Milchschaum', rinse: 'Spült', rinsing: 'Spült', heating: 'Heizt auf', preparing: 'Bereitet vor',
    deliveringmilk: 'Milch', deliveringhotwater: 'Heißwasser', making: 'Brüht' };
  var careLabelOf = function (k) {
    return /descal|decalc/.test(k) ? 'Entkalkt' : /rins|wash/.test(k) ? 'Spült' : /calcnclean/.test(k) ? 'Pflege läuft' : 'Reinigt';
  };
  var lastSeg = function (v) { var s = String(v == null ? '' : v); return nk(s.indexOf('.') > -1 ? s.split('.').pop() : s); };
  var mins = function (sensorState, unit) {
    var n = num(sensorState);
    if (n == null) return null;
    var u = String(unit || 'min');
    return u === 'h' ? n * 60 : u === 's' ? n / 60 : n;
  };

  K.status = function (c, states, now) {
    var S = states || {}, t = now || Date.now();
    var g = function (id) { return id && S[id] ? S[id] : null; };
    var v = function (id) { var x = g(id); return x ? x.state : null; };
    var s = { st: 'offline', label: 'Nicht verfügbar', tone: null, dead: true, power: null, drink: null, phase: null, pct: null, remain: null,
      finish: null, warns: [], pre: [], remote: null, total: null, perDrink: [], plugW: null, paused: false, aborting: false, fam: c.fam };
    var pw = g(c.power);
    s.power = pw && !bad(pw.state) ? pw.state === 'on' : null;
    var raw = v(c.status), key = lastSeg(raw);
    var anyAlive = [c.status, c.power, c.sel, c.anchor].some(function (id) { return id && S[id] && !bad(S[id].state); });
    if (!anyAlive) return s;
    s.dead = false;
    var st = ST[key] || null;
    // Home Connect „inactive“ mit eingeschaltetem Strom = wartet (Bereit).
    if (key === 'inactive' && s.power === true) st = 'bereit';
    var careRun = false;
    // Getränk/Programm: Miele program_id, HC aktives Programm, sonst die Auswahl (nur während des Bezugs).
    var prog = v(c.program);
    if (bad(prog) || /^(noprogram|no_program|none)$/i.test(String(prog))) prog = v(c.actSel);
    // homeconnect_ws / home_connect_alt: ohne aktives Programm läuft das gewählte.
    if (bad(prog) && (c.fam === 'hcws' || c.fam === 'hcalt')) prog = v(c.sel);
    // Status-Sensor mit Alarmwert (De'Longhi BT) → Warnung, Maschine braucht dich.
    var alarm = STATUS_ALARM[key];
    if (alarm) st = 'aktion_noetig';
    if (c.fam === 'plug') {
      var w = num(v(c.plugW));
      s.plugW = w;
      st = s.power === false ? 'aus' : w == null ? 'bereit' : w > 50 ? 'bezieht' : w < 3 ? 'aus' : 'bereit';
    } else if (!st) {
      if (c.fam === 'lamarzocco' || !c.status) {
        st = s.power === false ? 'aus' : 'bereit';
        if (v(c.dispensing) === 'on') st = 'bezieht';
      } else st = s.power === false ? 'aus' : 'bereit';
    }
    if (c.fam === 'dlbt' && v(c.dispensing) === 'on' && st === 'bereit') st = 'bezieht';
    if (s.power === false && st !== 'offline') st = 'aus';
    if (key === 'pause') s.paused = true;
    if (key === 'aborting') s.aborting = true;
    var d = (st === 'bezieht' || st === 'pflege' || st === 'heizt') ? K.drink(prog) : null;
    if (d && d.care && st === 'bezieht') { st = 'pflege'; careRun = true; }
    if (st === 'pflege' && !careRun && d && !d.care) st = 'bezieht';
    s.drink = st === 'bezieht' ? d : null;
    // Phase (Miele program_phase, Melitta activity, De'Longhi Status-Text)
    var ph = lastSeg(v(c.phase) || v(c.activity));
    if (ph === 'heatingup' && st === 'bezieht' && !s.drink) st = 'heizt';
    s.phase = PHASE[ph] || (st === 'bezieht' && PHASE[key] && key !== 'brewing' ? PHASE[key] : null);
    s.st = st;
    var pct = num(v(c.progress));
    s.pct = (st === 'bezieht' || st === 'pflege') && pct != null ? Math.max(0, Math.min(100, pct)) : null;
    var rem = g(c.remaining);
    if (rem && (st === 'bezieht' || st === 'pflege')) s.remain = mins(rem.state, (rem.attributes || {}).unit_of_measurement);
    var fin = v(c.finish), fms = fin ? Date.parse(fin) : NaN;
    if (isFinite(fms) && (st === 'bezieht' || st === 'pflege')) { s.finish = fms; if (s.remain == null) s.remain = Math.max(0, (fms - t) / 60000); }
    s.label = {
      aus: 'Aus', bereit: 'Bereit', heizt: 'Heizt auf', bezieht: s.paused ? 'Pausiert' : s.aborting ? 'Wird abgebrochen' : (s.drink ? s.drink.label : 'Läuft'),
      pflege: careRun && d ? careLabelOf(d.key) : careLabelOf(key), aktion_noetig: 'Eingriff nötig', fehler: 'Fehler', fertig: 'Fertig', offline: 'Nicht verfügbar',
    }[st];
    // Warnungen
    var add = function (art, sub, soft, id) {
      var l = warnLabel(art, sub, soft);
      if (!l) return;
      if (s.warns.some(function (x) { return x.art === art && x.label === l[0]; })) return;
      var sev = sub === 'overdue' || sub === 'blockage' ? 'bad' : 'warn';
      s.warns.push({ art: art, label: l[0], sub: l[1], sev: sev, id: id || null, icon: WARN_TXT[art][2], soft: !!soft });
    };
    c.warns.forEach(function (w) {
      var on = warnOn(w, v(w.id));
      if (!on) return;
      var art = on.art || w.art;
      if (art === 'aktion') return;
      add(art, on.sub || w.sub, on.soft, w.id);
    });
    if (alarm) add(Array.isArray(alarm) ? alarm[0] : alarm, Array.isArray(alarm) ? alarm[1] : null, false, c.status);
    s.warns.sort(function (a, b) { return (a.sev === 'bad' ? 0 : 1) - (b.sev === 'bad' ? 0 : 1) || ORDER.indexOf(a.art) - ORDER.indexOf(b.art); });
    // Vorwarnungen (Tassen bis zur Pflege)
    c.pre.forEach(function (p) {
      var x = v(p.id);
      if (p.how === 'count') {
        var n = num(x);
        if (n == null) return;
        if (n <= 0) { add(p.art, null, false, p.id); return; }
        s.pre.push({ art: p.art, cups: Math.round(n), id: p.id });
      } else if (warnOn(p, x)) s.pre.push({ art: p.art, cups: p.cups, id: p.id });
    });
    // Je Art nur die nächste Vorwarnung, und keine neben einer fälligen Warnung derselben Art.
    var best = {};
    s.pre.forEach(function (p) { if (!best[p.art] || p.cups < best[p.art].cups) best[p.art] = p; });
    s.pre = Object.keys(best).map(function (k) { return best[k]; })
      .filter(function (p) { return !s.warns.some(function (w) { return w.art === p.art; }); })
      .sort(function (a, b) { return a.cups - b.cups; });
    // Fernstart
    var rm = v(c.remote);
    s.remote = bad(rm) ? null : rm === 'on';
    // Zähler: Gesamt aus dem Gesamtzähler, sonst die Summe der Tassen-Zähler.
    var per = c.counters.filter(function (x) { return !x.ml; }).map(function (x) { return { label: x.label, icon: x.icon, n: num(v(x.id)), id: x.id }; })
      .filter(function (x) { return x.n != null; });
    var merged = {};
    per.forEach(function (x) {
      if (merged[x.label]) { merged[x.label].n += x.n; merged[x.label].ids.push(x.id); } else merged[x.label] = { label: x.label, icon: x.icon, n: x.n, ids: [x.id] };
    });
    s.perDrink = Object.keys(merged).map(function (k) { return merged[k]; }).sort(function (a, b) { return b.n - a.n; });
    var tot = num(v(c.total));
    s.total = tot != null ? tot : per.length ? per.reduce(function (a, x) { return a + x.n; }, 0) : null;
    s.tone = st === 'fehler' ? 'bad' : s.warns.length ? (s.warns[0].sev === 'bad' ? 'bad' : 'warn') : st === 'aktion_noetig' ? 'warn' : null;
    return s;
  };
  K.of = function (entity, hass, states) {
    var id = entity && entity.entity_id;
    if (!id) return null;
    return K.status(K.find(hass, id), states || (hass && hass.states) || {});
  };

  // ── Kachel ────────────────────────────────────────────────────────────────
  var pctTxt = function (p) { return Math.round(p) + ' %'; };
  K.tileText = function (s) {
    if (!s) return '';
    if (s.st === 'offline') return s.label;
    if (s.st === 'fehler') return s.warns.length ? s.warns[0].label : 'Fehler';
    // Warnung hat Vorrang (in Warnfarbe: Symbol orange/rot, Kachel hinterlegt); „bald leer“ erst in Ruhe.
    var hard = s.warns.filter(function (w) { return !w.soft; })[0];
    if (hard) return hard.label;
    if (s.st === 'bezieht') return s.pct != null && !s.paused ? s.label + ' · ' + pctTxt(s.pct) : s.label;
    if (s.st === 'pflege') return s.pct != null ? s.label + ' · ' + pctTxt(s.pct) : s.label;
    if (s.warns.length) return s.warns[0].label;
    return s.label;
  };
  K.active = function (s) { return !!(s && !s.dead && (/^(bezieht|heizt|pflege|aktion_noetig|fehler)$/.test(s.st) || s.warns.length)); };
  K.color = function (s) {
    if (!s) return COLOR.on;
    if (s.tone === 'bad') return COLOR.bad;
    if (s.tone === 'warn') return COLOR.warn;
    return COLOR.on;
  };
  // Kreis oben rechts: Fortschritt beim Bezug (nur mit Prozent).
  K.ring = function (s) { return s && (s.st === 'bezieht' || s.st === 'pflege') && s.pct != null ? s.pct : null; };
  // Icon antippen: Strom an/aus, wenn die Maschine einen Schalter hat; sonst nichts (Tipp wie auf die Kachel).
  K.iconService = function (c, s) {
    if (!c || !c.power || !s || s.dead || s.power == null) return null;
    return s.power ? 'switch.turn_off' : 'switch.turn_on';
  };

  // Kopf-Kachel: Zustandsfarbe (DP-15), aus = Sand.
  (window._casoraRingHueHooks = window._casoraRingHueHooks || []).push(function (src, key) {
    if (!/\bcasora_coffee\b/.test(key) || !src || !src._stateObj) return null;
    var ha = document.querySelector('home-assistant');
    var s = K.of(src._stateObj, ha && ha.hass);
    if (!s) return null;
    return { hue: K.color(s), off: s.st === 'aus' || s.st === 'offline' };
  });
  // Hauptschalter im Kopf = Strom der Maschine.
  (window._casoraHeadSwitchHooks = window._casoraHeadSwitchHooks || []).push(function (src, hass) {
    var tpl = [].concat((src && src._config && src._config.template) || []).join(' ');
    if (!/\bcasora_coffee\b/.test(tpl)) return null;
    var id = src._stateObj && src._stateObj.entity_id;
    if (!id) return false;
    var c = K.find(hass, id);
    return c.power ? [c.power] : false;
  });

  // ── Heute (Differenz der Zähler seit Mitternacht aus HAs Verlauf) ─────────────
  var day0 = function (ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  var todayC = {};
  K.today = function (hass, c, el) {
    var ids = c.total ? [c.total] : c.counters.filter(function (x) { return !x.ml; }).map(function (x) { return x.id; });
    ids = ids.filter(function (id) { return hass && hass.states && hass.states[id]; });
    if (!ids.length) return null;
    var S = hass.states, d0 = day0(Date.now());
    var key = d0 + '|' + ids.map(function (id) { return S[id].state; }).join('|');
    var hit0 = todayC[c.anchor];
    if (hit0 && hit0.key === key) { if (el && hit0.busy) hit0.wait.push(el); return hit0.val; }
    var job = todayC[c.anchor] = { key: key, val: hit0 && hit0.d0 === d0 ? hit0.val : null, d0: d0, busy: true, wait: el ? [el] : [] };
    if (!hass.callApi) { job.busy = false; return job.val; }
    hass.callApi('GET', 'history/period/' + new Date(d0).toISOString() + '?filter_entity_id=' + ids.join(',')
      + '&minimal_response&no_attributes&end_time=' + encodeURIComponent(new Date().toISOString()))
      .then(function (r) {
        var sum = 0, ok = false;
        (r || []).forEach(function (rows) {
          if (!rows || !rows.length) return;
          var id = rows[0].entity_id || ids[(r || []).indexOf(rows)];
          var first = null;
          for (var i = 0; i < rows.length && first == null; i++) first = num(rows[i].state);
          var cur = num(S[id] && S[id].state);
          if (first != null && cur != null) { sum += Math.max(0, cur - first); ok = true; }
        });
        if (todayC[c.anchor] !== job) return;
        job.val = ok ? sum : null;
      })
      .catch(function () { /* kein Verlauf – „heute“ fehlt einfach */ })
      .then(function () {
        job.busy = false;
        job.wait.forEach(function (w) { try { if (typeof window.casoraKick === 'function') window.casoraKick(w); } catch (e) { /* zu */ } });
        job.wait = [];
      });
    return job.val;
  };

  // ── Getränkeliste und Start ───────────────────────────────────────────────
  // [{raw, label, icon, care, btn}] in der Reihenfolge der Integration; Pflegeprogramme getrennt.
  K.drinks = function (c, states) {
    var S = states || {}, out = [];
    var selSt = S[c.sel] || S[c.actSel];
    var opts = selSt && Array.isArray((selSt.attributes || {}).options) ? selSt.attributes.options : [];
    if (c.actSel && S[c.actSel] && Array.isArray((S[c.actSel].attributes || {}).options) && (!c.sel || !opts.length)) opts = S[c.actSel].attributes.options;
    opts.forEach(function (o) {
      var d = K.drink(o);
      if (d) out.push({ raw: o, label: d.label, icon: d.icon, care: d.care, key: d.key });
    });
    if (!out.length) {
      c.brew.forEach(function (b) {
        var d = K.drink(b.prog);
        if (d) out.push({ raw: b.prog, label: d.label, icon: d.icon, care: d.care, key: d.key, btn: b.id });
      });
    }
    return out;
  };
  var pick = {};
  K.picked = function (c, states) {
    var p = pick[c.anchor];
    if (p) return p;
    // Home Connect: das an der Maschine gewählte Programm ist vorgewählt.
    var S = states || {};
    var cur = c.sel && S[c.sel] && HC[c.fam] ? S[c.sel].state : null;
    var d = K.drink(cur);
    return d && !d.care ? cur : null;
  };
  // Startet das Getränk raw – je Integration anders (Rückgabe: Promise).
  K.start = function (hass, c, raw) {
    if (!hass || !c || !raw) return Promise.resolve(false);
    var call = function (d, sv, data) { return Promise.resolve(hass.callService(d, sv, data || {})); };
    var S = hass.states || {};
    var list = K.drinks(c, S);
    var item = list.filter(function (x) { return x.raw === raw; })[0];
    var on = c.power && S[c.power] && S[c.power].state === 'off' ? call('switch', 'turn_on', { entity_id: c.power }) : Promise.resolve();
    return on.then(function () {
      if (item && item.btn) return call('button', 'press', { entity_id: item.btn });
      var svc = hass.services || {};
      // Home Connect (Core): Programm samt Optionen in einem Aufruf starten.
      if (c.fam === 'hc' && c.device && svc.home_connect && svc.home_connect.set_program_and_options) {
        var data = { device_id: c.device, affects_to: 'active_program', program: raw };
        var o = function (id, opt) { if (id && S[id] && !bad(S[id].state)) data[opt] = /^number\./.test(id) ? Number(S[id].state) : S[id].state; };
        o(c.opts.strength, 'consumer_products_coffee_maker_option_bean_amount');
        o(c.opts.temp, 'consumer_products_coffee_maker_option_coffee_temperature');
        o(c.opts.amount, 'consumer_products_coffee_maker_option_fill_quantity');
        return call('home_connect', 'set_program_and_options', data);
      }
      if (c.actSel) return call('select', 'select_option', { entity_id: c.actSel, option: raw });
      if (c.sel && c.start) {
        var same = S[c.sel] && S[c.sel].state === raw;
        return (same ? Promise.resolve() : call('select', 'select_option', { entity_id: c.sel, option: raw }))
          .then(function () { return call('button', 'press', { entity_id: c.start }); });
      }
      if (c.sel) return call('select', 'select_option', { entity_id: c.sel, option: raw });
      return false;
    }).then(function () { return true; }, function () { return false; });
  };
  // Fernstart nötig und nicht erlaubt? (Home Connect)
  K.blocked = function (c, s) {
    if (!s || s.dead) return 'Nicht verfügbar';
    if (s.st === 'bezieht' || s.st === 'pflege' || s.st === 'heizt') return null;
    if (HC[c.fam] && s.remote === false) return 'Fernstart an der Maschine erlauben';
    return null;
  };

  // ── Klicks im Popup: Schein-Entitäten coffee-pick:/coffee-start:/coffee-more:/coffee-go: ─────
  var more = {}, els = {};
  var redraw = function (anchor) {
    (els[anchor] || []).forEach(function (w) {
      if (!w || !w.isConnected) return;
      try { if (typeof window.casoraKick === 'function') window.casoraKick(w); } catch (e) { /* zu */ }
    });
  };
  var keep = function (anchor, el) {
    if (!el) return;
    els[anchor] = (els[anchor] || []).filter(function (w) { return w.isConnected; });
    if (els[anchor].indexOf(el) < 0) els[anchor].push(el);
  };
  var busy = {};
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var m = /^coffee-(pick|start|more|go):(.*)$/.exec(String(mid || ''));
    if (!m) return false;
    var ha = document.querySelector('home-assistant'), hass = ha && ha.hass;
    var p = m[2].split('|');
    if (m[1] === 'go') {
      try { if (window.casoraPopup) window.casoraPopup.close(); } catch (e) { /* zu */ }
      history.pushState(null, '', m[2]);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return true;
    }
    if (m[1] === 'more') { more[p[0]] = !more[p[0]]; redraw(p[0]); return true; }
    var c = hass ? K.find(hass, p[0]) : null;
    if (!c) return true;
    if (m[1] === 'pick') {
      pick[p[0]] = pick[p[0]] === p[1] ? null : p[1];
      // Home Connect: Auswahl auch an der Maschine vorwählen – dann gelten deren Optionen (Stärke, Menge …).
      if (pick[p[0]] && HC[c.fam] && c.sel && hass.states[c.sel] && hass.states[c.sel].state !== p[1]) {
        try { hass.callService('select', 'select_option', { entity_id: c.sel, option: p[1] }); } catch (e) { /* bleibt lokal */ }
      }
      redraw(p[0]);
      return true;
    }
    if (m[1] === 'start') {
      if (busy[p[0]] && Date.now() - busy[p[0]] < 3000) return true;
      busy[p[0]] = Date.now();
      K.start(hass, c, p[1]).then(function () { pick[p[0]] = null; busy[p[0]] = 0; redraw(p[0]); });
      return true;
    }
    return false;
  });

  // ── Popup ─────────────────────────────────────────────────────────────────
  K.popup = function (entity, states, hass) {
    var KIT = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    var id = entity && entity.entity_id;
    if (!KIT || !UI || !id) return empty;
    var c = K.find(hass, id);
    var watch = K.watch(c);
    var call = function (part) {
      return 'return window._casoraCoffee ? window._casoraCoffee.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, this) : "";';
    };
    var f = {};
    // Je Spalte nur Bereiche, die immer etwas zeigen (leere Karten ließen eine Lücke, die Spalten fluchteten nicht):
    // Kopf + Ring zusammen (die Statuszeile wandert in den Kopf), Hinweise + Pflege zusammen.
    var parts = ['hero', 'drinks'];
    if (c.warns.length || c.pre.length || c.fam === 'hc' || c.status) parts.push('info');
    if (c.total || c.counters.length) parts.push('stats');
    parts.forEach(function (k) { f[k] = { card: KIT.secCard(watch, call(k), states) }; });
    return KIT.layout({ fields: f, top: ['hero'], left: ['drinks'], right: ['info', 'stats'], // Handy: Hinweise nur dann vor den Getränken, wenn beim Öffnen etwas fehlt (sonst zuerst bedienen).
      narrowOrder: K.status(c, states).warns.length ? ['info', 'drinks', 'stats'] : ['drinks', 'info', 'stats'] });
  };

  var LBL = 'font-family:var(--primary-font-family, system-ui);';
  // Großer Ring (Bezug): Spur in Sand, Bogen in Gerätefarbe, Prozent in der Mitte.
  var ringHtml = function (s) {
    var p = Math.max(0, Math.min(100, s.pct || 0)), r = 52, L = 2 * Math.PI * r;
    var under = s.remain != null && s.remain > 0 ? (s.remain < 1 ? 'noch ' + Math.max(1, Math.round(s.remain * 60)) + ' s' : 'noch ' + Math.round(s.remain) + ' Min.')
      : s.phase || (s.paused ? 'Pausiert' : '');
    return '<div style="' + LBL + 'display:flex;justify-content:center;padding:0 0 4px;">'
      + '<div role="img" aria-label="' + esc(T(pctTxt(p))) + '" style="position:relative;width:var(--casora-coffee-ring, 140px);height:var(--casora-coffee-ring, 140px);">'
      + '<svg viewBox="0 0 120 120" style="display:block;width:100%;height:100%;transform:rotate(-90deg);">'
      + '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--casora-soft-control-fill, rgba(140,115,90,0.10))" stroke-width="10"/>'
      + '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--casora-popup-accent, var(--casora-color-teal, #4E9E95))" stroke-width="10"'
      + ' stroke-linecap="round" stroke-dasharray="' + L.toFixed(2) + '" stroke-dashoffset="' + (L * (1 - p / 100)).toFixed(2) + '"'
      + ' style="transition:stroke-dashoffset .6s var(--casora-ease-slide, ease);"/></svg>'
      + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;">'
      + '<div style="font-size:var(--casora-fs-title, 28px);font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));">'
      + esc(pctTxt(p)) + '</div>'
      + (under ? '<div style="font-size:var(--casora-fs-sub, 13px);font-weight:600;color:var(--casora-soft-sub, var(--secondary-text-color));white-space:nowrap;">' + esc(under) + '</div>' : '')
      + '</div></div></div>';
  };
  // Getränke-Raster: Sand-Kacheln mit Symbol und Name; die gewählte hell wie das aktive Segment.
  var GRID_CSS = '<style>'
    + '.cof-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(104px, 1fr));gap:var(--casora-space-2, 8px);}'
    + '.cof-d{position:relative;box-sizing:border-box;min-height:84px;padding:var(--casora-space-3, 12px) var(--casora-space-2, 8px);display:flex;flex-direction:column;'
    + 'align-items:center;justify-content:center;gap:var(--casora-space-2, 8px);border-radius:var(--casora-r-element, 18px);cursor:pointer;user-select:none;'
    + '-webkit-user-select:none;-webkit-tap-highlight-color:transparent;background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));'
    + 'color:var(--casora-soft-sub, var(--secondary-text-color));transition:background-color var(--casora-dur-feedback, 160ms) ease, box-shadow var(--casora-dur-feedback, 160ms) ease;}'
    + '.cof-d > *{pointer-events:none;}'
    + '.cof-d .n{font-size:var(--casora-fs-sub, 13px);font-weight:700;line-height:1.2;text-align:center;color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));'
    + 'white-space:normal;overflow-wrap:anywhere;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:100%;}'
    + '.cof-d ha-icon{--mdc-icon-size:26px;width:26px;height:26px;display:flex;color:var(--casora-popup-ui-action, var(--casora-color-teal, #4E9E95));}'
    + '.cof-d.on{background:var(--casora-soft-seg-on, #FFFDF9);box-shadow:var(--casora-soft-seg-on-shadow, none);}'
    + '.cof-d.on .n{color:var(--casora-soft-seg-on-ink, var(--casora-popup-tiles-text-primary, var(--primary-text-color)));}'
    + '.cof-d.dis{opacity:.45;cursor:default;}'
    + '@media (hover:hover){.cof-d:not(.on):not(.dis):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
    + '.cof-d:not(.dis):active{transform:scale(var(--casora-press-scale, .97));}'
    + '.cof-go{margin-top:var(--casora-space-3, 12px);}'
    + '.cof-go .hh-pill{width:100%;justify-content:center;min-height:48px;font-size:var(--casora-fs-row, 15px);font-weight:700;}'
    + '.cof-go .hh-pill > *{flex:none;margin:0;}'
    + '@media (prefers-reduced-motion:reduce){.cof-d{transition:none;}}'
    + '</style>';
  // Stärke (bean_amount) – gängige Stufen; die eingestellte kommt immer dazu.
  var BEAN = [['verymild', 'Sehr mild'], ['mild', 'Mild'], ['normal', 'Normal'], ['strong', 'Stark'], ['verystrong', 'Sehr stark'],
    ['extrastrong', 'Extra stark'], ['doubleshot', 'Doppio']];
  var BEAN_SHOW = ['mild', 'normal', 'strong', 'verystrong', 'extrastrong'];
  var optKey = function (o) { return nk(o).replace(/^.*beanamount/, '').replace(/^.*coffeetemperature/, ''); };
  K.strengths = function (st) {
    var opts = (st && st.attributes && st.attributes.options) || [];
    var cur = st ? optKey(st.state) : '';
    return opts.filter(function (o) { var k = optKey(o); return BEAN_SHOW.indexOf(k) > -1 || k === cur; }).map(function (o) {
      var k = optKey(o), b = BEAN.filter(function (x) { return x[0] === k; })[0];
      return { raw: o, label: b ? b[1] : pretty(k), on: k === cur };
    });
  };
  K.temps = function (st) {
    var opts = (st && st.attributes && st.attributes.options) || [];
    return opts.map(function (o) {
      var m = /(\d{2,3})c$/.exec(optKey(o));
      var k = optKey(o);
      return { raw: o, label: m ? m[1] + '°' : /normal/.test(k) ? 'Normal' : /high/.test(k) ? 'Hoch' : /max/.test(k) ? 'Max' : pretty(k), on: st.state === o };
    });
  };
  K.amounts = function (st) {
    if (!st) return [];
    var a = st.attributes || {}, mn = num(a.min), mx = num(a.max), stp = num(a.step) || 10, cur = num(st.state);
    if (mn == null || mx == null || mx <= mn) return [];
    var out = [], n = 5;
    for (var i = 0; i < n; i++) {
      var x = Math.round((mn + (mx - mn) * i / (n - 1)) / stp) * stp;
      if (out.indexOf(x) < 0) out.push(x);
    }
    if (cur != null && out.indexOf(Math.round(cur)) < 0) { out.push(Math.round(cur)); out.sort(function (x, y) { return x - y; }); }
    return out.map(function (x) { return { v: x, label: x + ' ml', on: cur != null && Math.round(cur) === x }; });
  };

  K.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var S = states || {};
    var s = K.status(c, S, Date.now());
    var HH = window._casoraHH;
    if (part === 'hero') {
      var rest = [];
      if (s.st === 'bezieht') {
        if (s.phase && !s.paused) rest.push(s.phase);
        else if (s.drink && !s.paused && !s.aborting) rest.push('Läuft');
        if (s.pct != null) rest.push(pctTxt(s.pct));
      } else if (s.st === 'pflege' && s.pct != null) rest.push(pctTxt(s.pct));
      s.warns.slice(0, 2).forEach(function (w) { rest.push({ text: w.label, tone: w.sev }); });
      if (!s.warns.length && s.pre.length && /^(bereit|fertig|aus)$/.test(s.st)) rest.push(preText(s.pre[0]));
      if (c.fam === 'plug' && s.plugW != null) rest.push(fmtW(s.plugW));
      return UI.line(s.label, rest, { tone: s.st === 'fehler' ? 'bad' : null }) + (K.ring(s) != null ? ringHtml(s) : '');
    }
    if (part === 'info') {
      var wh = K.sec('warn', c, states, hass, el), ch = K.sec('care', c, states, hass, el);
      return wh + (wh && ch ? '<div style="height:var(--casora-popup-sec-gap, 22px)"></div>' : '') + ch;
    }
    if (part === 'drinks') {
      keep(c.anchor, el);
      if (s.dead) return '';
      // Läuft ein Bezug: was gerade läuft und „Abbrechen“ (zweistufig) statt der Auswahl.
      if (s.st === 'bezieht' || s.st === 'pflege' || s.st === 'heizt') {
        var rows = [];
        var d = s.drink;
        var sub = [s.phase, s.remain != null && s.remain > 0 ? (s.remain < 1 ? 'noch ' + Math.max(1, Math.round(s.remain * 60)) + ' s' : 'noch ' + Math.round(s.remain) + ' Min.') : null]
          .filter(Boolean).join(' · ');
        rows.push({ icon: d ? d.icon : s.st === 'pflege' ? 'mdi:spray-bottle' : 'mdi:coffee-maker-outline', iconTone: 'accent', label: s.label, sub: sub || null,
          value: s.pct != null ? pctTxt(s.pct) : null, bar: s.pct != null ? s.pct / 100 : null, barTone: 'accent' });
        var out = UI.group(rows, s.st === 'pflege' ? 'Pflege' : 'Gerade');
        var stopOk = c.stop && S[c.stop] && S[c.stop].state !== 'unavailable' && !s.aborting;
        if (stopOk) {
          var svc = { domain: 'button', service: 'press', target: { entity_id: c.stop } };
          out += '<div style="height:var(--casora-space-3, 12px)"></div>' + (HH && HH.pill ? HH.pill({ label: 'Abbrechen', icon: 'mdi:stop', svc: svc, confirm: 'Abbrechen' })
            : UI.group([{ icon: 'mdi:stop', iconTone: 'bad', label: 'Abbrechen', svc: svc, confirm: 'Abbrechen' }], null));
        }
        return out;
      }
      var list = K.drinks(c, S);
      var bev = list.filter(function (x) { return !x.care; });
      if (!bev.length) {
        // Steckdose oder Maschine ohne Getränkeauswahl: nur Hinweis, wie gestartet wird.
        return c.fam === 'plug' ? UI.group([{ icon: 'mdi:power-plug-outline', iconTone: s.power ? 'accent' : null, label: s.power ? 'Steckdose an' : 'Steckdose aus',
          sub: s.plugW != null ? 'Leistung ' + fmtW(s.plugW) : null }], 'Maschine') : '';
      }
      var why = K.blocked(c, s);
      var chosen = K.picked(c, S);
      var max = more[c.anchor] ? 99 : 9;
      var shown = bev.slice(0, max);
      if (chosen && !shown.some(function (x) { return x.raw === chosen; })) {
        var ch = bev.filter(function (x) { return x.raw === chosen; })[0];
        if (ch) shown[shown.length - 1] = ch;
      }
      var grid = GRID_CSS + '<div class="cof-grid">' + shown.map(function (x) {
        var on = x.raw === chosen;
        return '<div class="cof-d' + (on ? ' on' : '') + (why ? ' dis' : '') + '" role="button" aria-pressed="' + (on ? 'true' : 'false') + '"'
          + (why ? '' : ' data-casora-mi="' + esc('coffee-pick:' + c.anchor + '|' + x.raw) + '"') + '>'
          + '<ha-icon icon="' + esc(x.icon) + '"></ha-icon><div class="n">' + esc(T(x.label)) + '</div></div>';
      }).join('') + '</div>';
      var html = (UI.label ? UI.label('Getränke') : '') + grid;
      if (bev.length > 9) {
        html += '<div role="button" tabindex="0" data-casora-mi="' + esc('coffee-more:' + c.anchor) + '" style="' + LBL + 'box-sizing:border-box;width:100%;margin-top:var(--casora-space-2, 8px);'
          + 'min-height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;cursor:pointer;'
          + 'background:var(--casora-soft-mehr-fill, var(--casora-soft-control-fill, rgba(140,115,90,0.10)));color:var(--casora-soft-mehr-ink, var(--casora-popup-tiles-text-primary, #3A322B));">'
          + '<span style="pointer-events:none;">' + esc(T(more[c.anchor] ? 'Weniger anzeigen' : 'Alle Getränke (' + bev.length + ')')) + '</span></div>';
      }
      if (why) html += '<div style="height:var(--casora-space-2, 8px)"></div>' + UI.group([{ icon: 'mdi:remote-off', iconTone: 'warn', label: why,
        sub: 'Erst dann startet Casora Getränke aus der Ferne' }], null);
      // Optionen der gewählten Sorte (Home Connect)
      if (chosen && !why) {
        var sw = function (id, items, label, svcOf) {
          if (!id || !S[id] || !items.length) return '';
          return '<div style="height:var(--casora-space-4, 16px)"></div>' + UI.segments(items.map(function (it) {
            return { label: it.label, active: it.on, svc: it.on ? null : svcOf(it) };
          }), label);
        };
        html += sw(c.opts.strength, K.strengths(S[c.opts.strength]), 'Stärke', function (it) { return { domain: 'select', service: 'select_option', data: { option: it.raw }, target: { entity_id: c.opts.strength } }; });
        html += sw(c.opts.amount, K.amounts(S[c.opts.amount]), 'Menge', function (it) { return { domain: 'number', service: 'set_value', data: { value: it.v }, target: { entity_id: c.opts.amount } }; });
        html += sw(c.opts.temp, S[c.opts.temp] ? K.temps(S[c.opts.temp]) : [], 'Temperatur', function (it) { return { domain: 'select', service: 'select_option', data: { option: it.raw }, target: { entity_id: c.opts.temp } }; });
        var dsel = K.drink(chosen);
        var go = (s.power === false ? 'Einschalten und ' : '') + (dsel ? dsel.label : 'Getränk') + ' starten';
        html += '<div class="cof-go">' + (HH && HH.pillCss ? HH.pillCss : '') + '<div class="hh-pills"><div class="hh-pill pri" role="button" data-casora-mi="'
          + esc('coffee-start:' + c.anchor + '|' + chosen) + '"><ha-icon icon="mdi:play" style="--mdc-icon-size:20px;width:20px;height:20px;display:block;pointer-events:none;"></ha-icon>'
          + '<span style="pointer-events:none;">' + esc(T(go)) + '</span></div></div></div>';
      } else if (!why) html += UI.note ? UI.note('Getränk antippen, dann starten.') : '';
      return html;
    }
    if (part === 'warn') {
      if (s.dead) return '';
      var wr = s.warns.map(function (w) {
        return { icon: w.icon, iconTone: w.sev === 'bad' ? 'bad' : 'warn', label: w.label, sub: w.sub, entity: w.id && /^(sensor|binary_sensor)\./.test(w.id) ? w.id : null };
      });
      if (s.st === 'fehler' && !wr.length) wr.push({ icon: 'mdi:alert-circle-outline', iconTone: 'bad', label: 'Maschine meldet einen Fehler', sub: 'Hinweis im Display der Maschine ansehen' });
      if (s.st === 'aktion_noetig' && !wr.length) wr.push({ icon: 'mdi:hand-back-right-outline', iconTone: 'warn', label: 'Eingriff nötig', sub: 'Hinweis im Display der Maschine ansehen' });
      return wr.length ? UI.group(wr, 'Hinweise') : '';
    }
    if (part === 'care') {
      if (s.dead) return '';
      var cr = [];
      var arts = {};
      c.warns.forEach(function (w) { if (/^(entkalken|entkalkenreinigen|reinigen|filter)$/.test(w.art)) arts[w.art] = 1; });
      c.pre.forEach(function (p) { arts[p.art] = 1; });
      ['entkalken', 'entkalkenreinigen', 'reinigen', 'filter'].forEach(function (a) {
        if (!arts[a]) return;
        var due = s.warns.filter(function (w) { return w.art === a; })[0];
        var pre = s.pre.filter(function (p) { return p.art === a; })[0];
        var name = { entkalken: 'Entkalken', entkalkenreinigen: 'Entkalken & Reinigen', reinigen: 'Reinigen', filter: 'Wasserfilter' }[a];
        cr.push({ icon: WARN_TXT[a][2], iconTone: due ? (due.sev === 'bad' ? 'bad' : 'warn') : pre && pre.cups <= 10 ? 'warn' : 'good', label: name,
          sub: due ? due.sub : pre ? null : 'Nichts fällig',
          value: due ? (due.sev === 'bad' ? 'Überfällig' : 'Fällig') : pre ? 'In ' + pre.cups + (pre.cups === 1 ? ' Tasse' : ' Tassen') : 'OK',
          valueTone: due ? due.sev : pre && pre.cups <= 10 ? 'warn' : null });
      });
      // Home Connect (Core): Warnungen sind ab Werk aus – dann hier sagen, wie man sie bekommt.
      if (c.fam === 'hc' && !c.warns.length && !c.pre.length) {
        cr.push({ icon: 'mdi:bell-off-outline', iconTone: null, label: 'Warnungen in Home Assistant aktivieren',
          sub: 'Home Connect legt Wassertank, Bohnen, Schale und Entkalken ausgeschaltet an. Am Gerät unter Entitäten einschalten, dann meldet die Kachel sie.',
          subWrap: true, entity: c.device ? 'coffee-go:/config/devices/device/' + c.device : null });
      }
      return cr.length ? UI.group(cr, 'Pflege') : '';
    }
    if (part === 'stats') {
      keep(c.anchor, el);
      if (s.total == null && !s.perDrink.length) return '';
      var sr = [];
      var today = K.today(hass, c, el);
      if (s.total != null) sr.push({ icon: 'mdi:counter', iconTone: 'accent', label: 'Getränke gesamt', sub: today != null ? 'Heute ' + Math.round(today) : null,
        value: Math.round(s.total).toLocaleString(loc()), entity: c.total || null });
      var top = s.perDrink.slice(0, 3), mx = top.length ? top[0].n : 0;
      top.forEach(function (x) {
        sr.push({ icon: x.icon || MUG, iconTone: 'accent', label: x.label, value: Math.round(x.n).toLocaleString(loc()),
          bar: mx ? x.n / mx : null, barTone: 'accent', entity: x.ids && x.ids.length === 1 ? x.ids[0] : null });
      });
      return UI.group(sr, 'Statistik');
    }
    return '';
  };
  var preText = function (p) {
    var n = { entkalken: 'Entkalken', entkalkenreinigen: 'Pflege', reinigen: 'Reinigen', filter: 'Filterwechsel' }[p.art] || 'Pflege';
    return n + ' in ' + p.cups + (p.cups === 1 ? ' Tasse' : ' Tassen');
  };
  K.preText = preText;
  var fmtW = function (w) { return (w < 10 ? w.toLocaleString(loc(), { maximumFractionDigits: 1 }) : Math.round(w).toLocaleString(loc())) + ' W'; };
})();
