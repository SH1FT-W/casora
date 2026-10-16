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
    // Warnfläche mit weißem Symbol: Tieforange hält 3:1 (Orange war zu hell, Design-Prüfung D6).
    warn: 'var(--casora-color-deep-orange, #C8693F)',
    bad: 'var(--casora-color-red, #D35A4E)',
  };
  K.COLOR = COLOR;
  var bad = function (s) { return s == null || s === 'unknown' || s === 'unavailable' || s === ''; };
  var num = function (v) { var n = parseFloat(v); return isFinite(n) ? n : null; };
  // Schlüssel vergleichen: klein, ohne „_“, „.“, Leer- und Bindestriche (Core: consumer_products_coffee_maker_…,
  // homeconnect_ws: consumerproducts_coffeemaker_…, home_connect_alt: ConsumerProducts.CoffeeMaker.…).
  // Akzente fallen weg (Melitta: „Café Crème“, „Caffè Latte“).
  var nk = function (x) {
    var t = String(x == null ? '' : x).toLowerCase();
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.replace(/[\s_.\-()]/g, '');
  };
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
  // Eine Symbol-Familie (Umriss, eigene SVGs unter assets/icons, per Maske gezeichnet): kleine Tasse, zwei Tassen, Tasse,
  // Tasse mit Schaumhaube, Glas mit Schichten, hoher Becher, Wasser, Milch, Tee.
  var CUP = 'coffee-espresso', DOP = 'coffee-doppio', MUG = 'coffee-cup', TALL = 'coffee-tall', MILK = 'coffee-cappuccino', GLASS = 'coffee-latte',
    WATER = 'coffee-water', MILKJ = 'coffee-milk', TEA = 'coffee-tea', POT = 'mdi:coffee-maker-outline';
  var DRINK = {
    ristretto: ['Ristretto', CUP], espresso: ['Espresso', CUP], espressocoffee: ['Espresso', CUP], espressodoppio: ['Espresso doppio', DOP],
    doppio: ['Doppio', DOP], dopio: ['Doppio', DOP], espresso2: ['Espresso doppio', DOP], doppioplus: ['Doppio+', DOP], doubleespresso: ['Doppio', DOP],
    ristrettodoppio: ['Ristretto doppio', DOP], coffee: ['Kaffee', MUG], caffecrema: ['Caffè Crema', MUG], crema: ['Caffè Crema', MUG], cream: ['Caffè Crema', MUG],
    cafecreme: ['Caffè Crema', MUG], cafecremedoppio: ['Caffè Crema doppio', DOP], regular: ['Kaffee', MUG],
    coffeepot: ['Kaffeekanne', POT], pot: ['Kaffeekanne', POT], xlcoffee: ['XL-Kaffee', TALL], caffegrande: ['Caffè Grande', TALL], longcoffee: ['Lungo', TALL],
    lungo: ['Lungo', TALL], long: ['Lungo', TALL], americano: ['Americano', TALL], caffeamericano: ['Americano', TALL], americanoextra: ['Americano extra', TALL],
    longblack: ['Long Black', TALL], travelmug: ['Kaffee to go', TALL], espressomacchiato: ['Espresso Macchiato', MILK],
    cappuccino: ['Cappuccino', MILK], cappuccinomix: ['Cappuccino', MILK], cappuccinoitaliano: ['Cappuccino Italiano', MILK], cappuccinodoppio: ['Cappuccino doppio', MILK],
    flatwhite: ['Flat White', MILK], cortado: ['Cortado', MILK], macchiato: ['Macchiato', MILK],
    galao: ['Galão', GLASS], lattemacchiato: ['Latte Macchiato', GLASS], lattemacchiatoextra: ['Latte Macchiato extra', GLASS],
    lattemacchiatotriple: ['Latte Macchiato triple', GLASS], caffelatte: ['Caffè Latte', GLASS], lattecoffee: ['Caffè Latte', GLASS],
    cafeaulait: ['Milchkaffee', GLASS], milchkaffee: ['Milchkaffee', GLASS], cafeconleche: ['Café con leche', GLASS],
    kaffeeverkehrt: ['Kaffee verkehrt', GLASS], coffeewithmilk: ['Kaffee mit Milch', GLASS], coffeemilk: ['Kaffee mit Milch', GLASS],
    warmemilch: ['Warme Milch', MILKJ], milkfroth: ['Milchschaum', MILKJ], milkfoam: ['Milchschaum', MILKJ], frothymilk: ['Milchschaum', MILKJ],
    warmmilk: ['Warme Milch', MILKJ], hotmilk: ['Warme Milch', MILKJ], milk: ['Warme Milch', MILKJ], coldmilk: ['Kalte Milch', MILKJ], steam: ['Dampf', MILKJ],
    hotwater: ['Heißwasser', WATER], water: ['Heißwasser', WATER], veryhotwater: ['Sehr heißes Wasser', WATER],
    tea: ['Tee', TEA], blacktea: ['Schwarzer Tee', TEA], herbaltea: ['Kräutertee', TEA], fruittea: ['Früchtetee', TEA], greentea: ['Grüner Tee', TEA],
    whitetea: ['Weißer Tee', TEA], japanesetea: ['Japanischer Tee', TEA], chailatte: ['Chai Latte', GLASS], choco: ['Kakao', MILKJ], chocolate: ['Kakao', MILKJ],
    redeye: ['Red Eye', TALL], blackeye: ['Black Eye', TALL], deadeye: ['Dead Eye', TALL], cafecortado: ['Café cortado', MILK],
    icedcoffee: ['Eiskaffee', GLASS], coldbrew: ['Cold Brew', GLASS], brewoverice: ['Kaffee auf Eis', GLASS],
  };
  // Keine Getränke (Miele „Barista-Assistent“, Einstellungen …): nicht ins Raster.
  var NOT_DRINK = /^(checkappliance|appliancesettings|baristaassistant|custom\d*|profile\d*)$/;
  // Pflegeprogramme (nicht ins Getränke-Raster): Home Connect cleaning_modes, Miele, De'Longhi.
  // La Marzocco „start_backflush“ ist Pflege (nie ins Getränke-Raster); Miele Zwischenspülen, Wartung, Milchleitung.
  var CARE = /^(cleaning|rinse|rinsing|appliancerinse|descal|decalc|calcnclean|brewunit|brewingunit|milksystem|milkpipework|clean|spuel|entkalk|reinig|backflush|intermediaterins|automaticmaint|easyclean|intensiveclean|evaporat)/;
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
    if (NOT_DRINK.test(p.k)) return null;
    if (p.my != null) return { key: p.k, raw: raw, label: 'Mein Kaffee' + (p.my ? ' ' + p.my : ''), icon: 'mdi:star-outline', care: false };
    var d = DRINK[p.k];
    var careLabel = /descal|decalc|entkalk/.test(p.k) ? 'Entkalken' : /calcnclean/.test(p.k) ? 'Entkalken & Reinigen'
      : /backflush/.test(p.k) ? 'Rückspülen' : /rins|spuel/.test(p.k) ? 'Spülen' : /^filter/.test(p.k) ? 'Filter' : 'Reinigen';
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
    ['milch', 'frothercleanwarning', 'system'], ['milch', 'frotherrinseneeded', 'system'],
    ['entkalken', 'devicedescalingoverdue', 'overdue'], ['entkalken', 'devicedescalingblockage', 'blockage'],
    ['entkalken', 'deviceshouldbedescaled'], ['entkalken', 'decalcificationneeded'], ['entkalken', 'descalewarning'],
    ['entkalkenreinigen', 'devicecalcncleanoverdue', 'overdue'], ['entkalkenreinigen', 'devicecalcncleanblockage', 'blockage'],
    ['entkalkenreinigen', 'deviceshouldbecalcncleaned'],
    ['reinigen', 'devicecleaningoverdue', 'overdue'], ['reinigen', 'deviceshouldbecleaned'], ['reinigen', 'alertcleaningalert'],
    ['reinigen', 'brewunitcleanwarning'],
    ['filter', 'filterchangeneeded'], ['filter', 'alertfilteralert'], ['filter', 'filterwarning'], ['filter', 'replacewaterfilter'],
  ];
  // De'Longhi WLAN (delonghi_coffee): Alarm-Nummern.
  // 13 und 17 melden fehlende Teile (13 ist in der Integration umgedreht: an = Tank fehlt), 15 = zweiter Bohnenbehälter leer.
  var DL_ALARM = { 0: 'wasser', 1: 'satz', 2: 'entkalken', 3: 'filter', 5: 'bohnen', 6: ['reinigen', 'service'], 11: ['schale', 'missing'],
    13: ['wasser', 'missing'], 14: ['milch', 'system'], 15: 'bohnen', 16: 'reinigen', 17: ['bohnen', 'missing'] };
  // Vorwarnungen in Tassen: Home Connect „descaling_in_10_cups“ (enum present), homeconnect_ws „countdown_*“ (Zahl).
  var PRE = [['entkalkenreinigen', /calcnclean(in)?(\d+)cups$/], ['entkalken', /descalingin(\d+)cups$/]];
  var COUNTDOWN = { countdowndescaling: 'entkalken', countdowncleaning: 'reinigen', countdowncalcnclean: 'entkalkenreinigen', countdownwaterfilter: 'filter' };
  // Zähler (Tassen) → Name. Endung des Schlüssels; ml-Zähler zählen nicht als Getränke.
  var COUNT = [
    [/powder_?coffee/, 'Pulverkaffee', MUG], [/ristretto_?espresso/, 'Ristretto & Espresso', CUP],
    [/coffee_?(and_|with_)?milk/, 'Kaffee mit Milch', MILK],
    [/(^|_)(coffee_counter|coffees|coffee_cups)$|^coffeecounter$|countcoffee$|^coffee$/, 'Kaffee', MUG],
    [/frothy_?milk/, 'Milchschaum', MILKJ, 'milkpart'], [/hot_?milk/, 'Warme Milch', MILKJ, 'milkpart'],
    [/(^|_)milk_?(cups?|counter)$|^milkcounter$|countmilk$/, 'Milchgetränke', MILK, 'milkall'],
    [/hot_?water_?cups/, 'Heißwasser', WATER],
  ];

  var tail = function (it) { var t = String(it.entity_id || '').split('.')[1] || ''; return nk(t); };
  // home_connect_alt gibt allen Entitäten einer Art denselben Schlüssel (statuses, settings, options, programs) –
  // dann zählt das Ende der Entity-ID (…_bsh_common_status_operationstate), wie bei Integrationen ohne Schlüssel (Jura, Melitta).
  var GENERIC = { statuses: 1, settings: 1, options: 1, programs: 1, homeconnectstatus: 1 };
  var keyOf = function (it) { var k = nk(it.key); return GENERIC[k] ? '' : k; };
  K.keyOf = keyOf;
  // Schlüssel passt (translation_key, sonst – nur ohne Schlüssel – das Ende der Entity-ID).
  var hit = function (it, pats, exact) {
    var k = keyOf(it), tl = tail(it);
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
    var keys = items.map(function (it) { return keyOf(it); });
    var has = function (re) { return keys.some(function (k) { return re.test(k); }); };
    // Ohne Schlüssel (Jura, Melitta, home_connect_alt): Ende der Entity-ID.
    var tails = items.filter(function (it) { return !keyOf(it); }).map(tail);
    var hasT = function (re) { return tails.some(function (t) { return re.test(t); }); };
    var opt = items.some(function (it) { return (it.options || []).some(function (o) { return /coffeemaker/.test(nk(o)); }); });
    if (has(/^sensoroperationstate$|^switchpowerstate$|^selectprogram$/)) return 'hcws';
    if (has(/^operationstate$/) && (opt || has(/beanamount|coffeecounter|beancontainer/))) return 'hc';
    if (has(/bshcommonstatusoperationstate/) || hasT(/bshcommonstatusoperationstate$/)) return 'hcalt';
    if (has(/^programid$/) && has(/^status$/)) return 'miele';
    if (has(/^(machinestatus|devicestatus)$/) && has(/^(beverage|makebeverage)$/)) return 'dlbt';
    if (has(/^alarm\d+$/) || has(/^brew(?!active|ingactive)/) || has(/^cancelbrew$/)) return 'dlwifi';
    if (has(/^(machinestatus)$/) && has(/^(decalcificationneeded|wastecontainerfull)$/)) return 'dllink';
    if (has(/^alert/) || (has(/^product$/) && has(/^make$/)) || hasT(/alertfillwater$/) || (hasT(/product$/) && hasT(/make$/))) return 'jura';
    if (has(/^recipe$/) || has(/^actionrequired$/) || hasT(/actionrequired$/) || hasT(/recipeselect$|recipe$/)) return 'melitta';
    if (has(/^(brewingactive|brewactive|startbackflush)$/) || has(/^totalcoffeesmade$/)) return 'lamarzocco';
    return null;
  };

  // Ist das Gerät ein Kaffeevollautomat? (Home Connect und Miele bauen auch Waschmaschinen.)
  K.isCoffeeItems = function (items) {
    var fam = K.family(items);
    if (!fam) return false;
    if (HC[fam]) {
      return items.some(function (it) {
        return /coffee|beanamount|beancontainer|espresso/.test(keyOf(it) + ' ' + tail(it))
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
      remote: null, dispensing: null, conn: null, opts: {}, warns: [], pre: [], counters: [], total: null, plugW: null, careSel: null };
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
    c.phase = by('sensor', ['programphase'], true) || by('sensor', ['coffeemakerprocessphase']);
    c.program = by('sensor', ['programid', 'activeprogram'], true);
    // Getränke: HC „active_program“ startet sofort (nur mit Fernstart), „selected_program“ wählt nur.
    c.actSel = HC[fam] ? by('select', ['activeprogram']) : null;
    c.sel = by('select', ['selectedprogram', 'selectprogram'], true) || by('select', ['selectedprogram'])
      || by('select', ['makebeverage', 'beverage', 'product', 'recipe', 'drink'], true);
    if (!c.sel && (fam === 'hcws' || fam === 'hcalt')) {
      items.forEach(function (it) { if (!c.sel && it.domain === 'select' && it.entity_id !== c.actSel && hit(it, ['program', 'programs'])) c.sel = it.entity_id; });
    }
    c.start = by('button', ['startprogram', 'buttonstartprogram', 'make', 'brew', 'start'], true) || by('button', ['startprogram']);
    c.stop = by('button', ['stopprogram', 'abortprogram', 'buttonabortprogram', 'cancelbrew', 'cancel', 'stop'], true) || by('button', ['abortprogram', 'stopprogram']);
    c.pause = by('button', ['pauseprogram', 'pause'], true);
    items.forEach(function (it) {
      if (it.domain !== 'button' || it.entity_id === c.start || it.entity_id === c.stop) return;
      var k = String(it.key || '').toLowerCase(), m = /^(brew|start)_(.+)$/.exec(k);
      // Ohne Schlüssel nur bei De'Longhi WLAN (Melitta „brew_freestyle“ ist kein Getränk).
      if (!m && !it.key && fam === 'dlwifi') m = /_(brew|start)_([a-z_]+)$/.exec(String(it.entity_id));
      if (m && m[2] !== 'program') c.brew.push({ id: it.entity_id, prog: m[2] });
    });
    c.progress = by('sensor', ['programprogress', 'progress'], true) || by('sensor', ['programprogress']);
    c.remaining = by('sensor', ['remainingtime', 'remainingprogramtime'], true) || by('sensor', ['remainingprogramtime']);
    c.finish = by('sensor', ['programfinishtime', 'finishtime'], true);
    c.remote = by('binary_sensor', ['remotestart', 'remotestartallowed', 'binaryremotestartallowed', 'remotecontrolstartallowed'], true)
      || by('binary_sensor', ['remotestartallowed', 'remotecontrolstartallowed']);
    c.dispensing = by('binary_sensor', ['dispensing', 'brewingactive', 'brewactive', 'brewing'], true);
    // Verbindung (Jura Bluetooth, Melitta „Connection“): getrennt = „Nicht verbunden“ statt „Bereit“.
    items.forEach(function (it) {
      if (c.conn) return;
      if (it.domain === 'binary_sensor' && it.dc === 'connectivity' && /connection|connected$/.test(tail(it))) c.conn = it.entity_id;
      else if (fam === 'melitta' && it.domain === 'sensor' && /connection$/.test(tail(it))) c.conn = it.entity_id;
    });
    // Optionen (nur Home Connect liefert sie als eigene Entitäten).
    c.opts.strength = by('select', ['beanamount']);
    c.opts.temp = by('select', ['coffeetemperature']);
    c.opts.amount = by('number', ['fillquantity']);
    // Warnungen
    var seen = {};
    var addW = function (id, art, sub, how) { if (!id || seen[id]) return; seen[id] = 1; c.warns.push({ id: id, art: art, sub: sub || null, how: how }); };
    items.forEach(function (it) {
      if (it.domain !== 'binary_sensor' && it.domain !== 'sensor') return;
      var k = keyOf(it) || tail(it), m;
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
      // Melitta: „Action Required“ (Anzeigetexte „Fill Water“, „Empty Trays“, „Trays Missing“ …)
      if (k === 'actionrequired' || (fam === 'melitta' && /actionrequired$/.test(k))) { addW(it.entity_id, 'aktion', null, 'melitta'); return; }
      for (var j = 0; j < PRE.length; j++) {
        var mm = PRE[j][1].exec(k);
        if (mm) { c.pre.push({ id: it.entity_id, art: PRE[j][0], cups: Number(mm[mm.length - 1]), how: 'enum' }); return; }
      }
      var cd = Object.keys(COUNTDOWN).filter(function (x) { return k.slice(-x.length) === x; })[0];
      if (cd && it.domain === 'sensor') { c.pre.push({ id: it.entity_id, art: COUNTDOWN[cd], cups: null, how: 'count' }); return; }
    });
    // Zähler
    var NOCOUNT = /(daily|weekly|countstarted|countcompleted|descal|clean|filterreplace|filterchange|rinse|flush|grinding|reserve|singlecup|doublecup|viaapp|viakanne|percent|computedtotal|totalespressos|degreas|milkcleaning)/;
    items.forEach(function (it) {
      if (it.domain !== 'sensor') return;
      var key = (keyOf(it) ? String(it.key) : '').toLowerCase(), t = String(it.entity_id).split('.')[1] || '', k = nk(key) || nk(t);
      if (NOCOUNT.test(k)) return;
      // homeconnect_ws „sensor_count_hot_water“ zählt ml (ohne Einheit).
      var ml = /^(ml|l)$/i.test(String(it.unit || '')) || /hotwatercounter$|totalwater(ml)?$|counthotwater$/.test(k);
      if (/^(totalbeverages|totalproduct|totalcoffeesmade|totalcoffee|counttotal|beveragecounter|totalcups)$/.test(k) || (!key && /total_(beverages|product|coffees_made|cups)$/.test(t))) {
        if (k === 'totalcoffee' && fam === 'dlbt') { c.counters.push({ id: it.entity_id, label: 'Kaffee', icon: MUG, ml: false }); return; }
        if (!c.total) c.total = it.entity_id;
        return;
      }
      // Name des Zählers: homeconnect_ws „sensor_count_<x>“, Jura „<mac>_product_<x>“, home_connect_alt „…_beveragecounter<x>“.
      var m1 = /^product_?(.+)$/.exec(key) || /^sensor_count_(.+)$/.exec(key) || (fam === 'hcws' ? /^count_(.+)$/.exec(key) : null)
        || (!key ? /_product_(.+)$/.exec(t) : null) || (!key ? /statusbeveragecounter(.+)$/.exec(k) : null)
        || (fam === 'dlbt' ? /^total_(tea|choco|cold_milk)$/.exec(key) : null);
      var src = m1 ? m1[1] : key || t;
      for (var i = 0; i < COUNT.length; i++) {
        if (COUNT[i][0].test(src)) { c.counters.push({ id: it.entity_id, label: COUNT[i][1], icon: COUNT[i][2], ml: ml, key: COUNT[i][3] || null }); return; }
      }
      if (m1 && !/total/.test(m1[1])) {
        var d = K.drink(m1[1]);
        c.counters.push({ id: it.entity_id, label: d ? d.label : pretty(m1[1]), icon: d ? d.icon : MUG, ml: ml });
        return;
      }
      // De'Longhi WLAN, Nivona: Zähler heißen wie das Getränk (espresso, long_coffee …).
      if (key && (fam === 'dlwifi' || fam === 'melitta') && DRINK[nk(key)]) { c.counters.push({ id: it.entity_id, label: DRINK[nk(key)][0], icon: DRINK[nk(key)][1], ml: ml }); return; }
      if (fam === 'dlbt' && /^totalwater$/.test(k)) c.counters.push({ id: it.entity_id, label: 'Heißwasser', icon: WATER, ml: ml });
    });
    // Annahme: Home Connect zählt Milchgetränke einmal gesamt (milk_counter) und zusätzlich je Art (warme Milch,
    // Milchschaum) – gibt es die Einzelzähler, fällt der Sammelzähler weg (sonst doppelt in der Summe).
    if (c.counters.some(function (x) { return x.key === 'milkpart'; })) c.counters = c.counters.filter(function (x) { return x.key !== 'milkall'; });
    // Rückfall Steckdose: Schalter + Leistung am Gerät.
    if (!fam) {
      var sw = items.filter(function (it) { return it.domain === 'switch'; })[0];
      var pw = items.filter(function (it) { return it.domain === 'sensor' && (it.dc === 'power' || it.unit === 'W'); })[0];
      if (sw && pw) { c.fam = 'plug'; c.power = sw.entity_id; c.plugW = pw.entity_id; }
    }
    return c;
  };

  // Zwischenspeicher je Anker: gilt nur, solange Registry und die Zahl der Entitäten des Geräts mit Zustand gleich sind –
  // beim HA-Start kommen die Zustände nach und nach, die Rollen dürfen nicht auf dem ersten halben Stand stehen bleiben.
  var cache = {};
  var devIds = function (hass, id) {
    var R = (hass && hass.entities) || {}, dev = R[id] && R[id].device_id;
    return dev ? Object.keys(R).filter(function (eid) { return R[eid] && R[eid].device_id === dev && !R[eid].hidden; }) : [id];
  };
  var liveCount = function (hass, ids) { var S = (hass && hass.states) || {}; return ids.filter(function (x) { return S[x]; }).length; };
  K.find = function (hass, id) {
    var R = (hass && hass.entities) || null;
    var hitc = cache[id];
    if (hitc && hitc.R === R && R && liveCount(hass, hitc.ids) === hitc.n) return hitc.c;
    var c = K.roles(K.items(hass, id), id);
    var ids = devIds(hass, id);
    cache[id] = { R: R, c: c, ids: ids, n: liveCount(hass, ids) };
    return c;
  };
  K.is = function (hass, id) {
    if (!id || !hass) return false;
    return K.isCoffeeItems(K.items(hass, id));
  };
  K.watch = function (c) {
    var out = [c.anchor, c.power, c.powerOff, c.status, c.activity, c.phase, c.program, c.actSel, c.sel, c.start, c.stop, c.pause,
      c.progress, c.remaining, c.finish, c.remote, c.dispensing, c.conn, c.opts.strength, c.opts.temp, c.opts.amount, c.total, c.plugW];
    c.brew.forEach(function (b) { out.push(b.id); });
    c.warns.forEach(function (w) { out.push(w.id); });
    c.pre.forEach(function (w) { out.push(w.id); });
    c.counters.forEach(function (w) { out.push(w.id); });
    return out.filter(function (x, i, a) { return x && a.indexOf(x) === i; });
  };

  // ── Zustand ───────────────────────────────────────────────────────────────
  // [Popup-Wort, kurze Anleitung (Unterzeile), Symbol, Kachel-Kurzwort]
  var WARN_TXT = {
    wasser: ['Wasser nachfüllen', 'Tank herausnehmen, füllen, einsetzen', 'mdi:cup-water', 'Wasser leer'],
    bohnen: ['Bohnen nachfüllen', 'Bohnen in den Behälter füllen', 'mdi:seed-outline', 'Bohnen leer'],
    schale: ['Schale leeren', 'Tropfschale herausnehmen und leeren', 'mdi:tray-alert', 'Schale voll'],
    satz: ['Satzbehälter leeren', 'Behälter herausnehmen und leeren', 'mdi:delete-variant', 'Satz voll'],
    milch: ['Milch kühlen', 'Milch in den Kühlschrank stellen', 'mdi:cow', 'Milch kühlen'],
    entkalken: ['Entkalken fällig', 'Entkalkungsprogramm an der Maschine starten', 'mdi:water-alert', 'Entkalken fällig'],
    entkalkenreinigen: ['Entkalken & Reinigen fällig', 'Pflegeprogramm an der Maschine starten', 'mdi:spray-bottle', 'Pflege fällig'],
    reinigen: ['Reinigen fällig', 'Reinigungsprogramm an der Maschine starten', 'mdi:spray-bottle', 'Reinigen fällig'],
    filter: ['Filter wechseln', 'Wasserfilter an der Maschine tauschen', 'mdi:filter-outline', 'Filter wechseln'],
  };
  // Name der Pflege-Art (Pflege-Zeile, „… überfällig“).
  var CARE_NAME = { entkalken: 'Entkalken', entkalkenreinigen: 'Entkalken & Reinigen', reinigen: 'Reinigen', filter: 'Wasserfilter' };
  K.WARN_TXT = WARN_TXT;
  var ORDER = ['wasser', 'bohnen', 'schale', 'satz', 'milch', 'entkalkenreinigen', 'entkalken', 'reinigen', 'filter'];
  // Melitta „Action Required“: Anzeigetexte („Fill Water“, „Brew Unit Removed“), normalisiert verglichen (nk).
  var MELITTA_ACT = { fillwater: 'wasser', emptytrays: 'schale', emptytray: 'schale', traysmissing: ['schale', 'missing'],
    traymissing: ['schale', 'missing'], fillbeans: 'bohnen', emptygrounds: 'satz', insertbrewunit: ['reinigen', 'unit'],
    brewunitremoved: ['reinigen', 'unit'], flushrequired: ['milch', 'system'] };
  // Ein Wert aus dem Status-Sensor kann ein Alarm sein (De'Longhi BT: „empty_water_tank“).
  var STATUS_ALARM = { emptywatertank: 'wasser', watertankempty: 'wasser', nowater: 'wasser', coffeewastecontainerfull: 'satz',
    groundscontainerfull: 'satz', wastecontainerfull: 'satz', descalealarm: 'entkalken', descalingalarm: 'entkalken', replacewaterfilter: 'filter',
    coffeebeansempty: 'bohnen', beansempty: 'bohnen', emptydriptray: 'schale', driptrayfull: 'schale', driptraymissing: ['schale', 'missing'],
    insertdriptray: ['schale', 'missing'], watertankmissing: ['wasser', 'missing'],
    // De'Longhi BT (device_status): zweiter Bohnenbehälter, Behälter fehlt, Kundendienst, Milch-Drehknopf.
    coffeebeansemptytwo: 'bohnen', beanhopperabsent: ['bohnen', 'missing'], machinetoservice: ['reinigen', 'service'], cleanknob: ['milch', 'system'] };
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
      var x = MELITTA_ACT[nk(s)];
      if (!x || /^(none|ok|no)$/.test(s)) return null;
      return Array.isArray(x) ? { art: x[0], sub: x[1] } : { art: x };
    }
    if (s === 'on' || s === 'present' || s === 'true') return {};
    // Nivona-Merker sind Zahlen 0/1: nur > 0 ist aktiv.
    if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s) > 0 ? {} : null;
    if (/^(off|none|ok|full|confirmed|false|no|inactive|normal)$/.test(s)) return null;
    return {};
  };
  // → [Popup-Wort, Anleitung, Kachel-Kurzwort]
  var warnLabel = function (art, sub, soft) {
    if (art === 'wasser' && sub === 'missing') return ['Wassertank einsetzen', 'Tank einsetzen, bis er einrastet', 'Tank fehlt'];
    if (art === 'wasser' && soft) return ['Wasser bald leer', 'Tank bei Gelegenheit füllen', 'Wasser bald leer'];
    if (art === 'schale' && sub === 'missing') return ['Schale einsetzen', 'Tropfschale einsetzen', 'Schale fehlt'];
    if (art === 'bohnen' && sub === 'missing') return ['Bohnenbehälter einsetzen', 'Bohnenbehälter einsetzen, bis er einrastet', 'Behälter fehlt'];
    if (art === 'reinigen' && sub === 'unit') return ['Brühgruppe einsetzen', 'Brühgruppe einsetzen, bis sie einrastet', 'Brühgruppe fehlt'];
    if (sub === 'overdue' && CARE_NAME[art]) return [(art === 'filter' ? 'Filterwechsel' : CARE_NAME[art]) + ' überfällig', WARN_TXT[art][1], (art === 'filter' ? 'Filterwechsel' : CARE_NAME[art]) + ' überfällig'];
    if (sub === 'blockage') return ['Entkalken blockiert', 'Entkalken an der Maschine fortsetzen', 'Entkalken blockiert'];
    if (art === 'milch' && sub === 'system') return ['Milchsystem reinigen', 'Milchsystem an der Maschine spülen', 'Milchsystem reinigen'];
    if (art === 'reinigen' && sub === 'service') return ['Service nötig', 'Maschine vom Kundendienst prüfen lassen', 'Service nötig'];
    return WARN_TXT[art] ? [WARN_TXT[art][0], WARN_TXT[art][1], WARN_TXT[art][3]] : null;
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
    // De'Longhi BT (device_status): „tank_is_in_position“/„grid_presence“ sind Merker ohne Alarm.
    cleaningmilkspout: 'pflege', changingfilter: 'pflege', tankisinposition: 'bereit', gridpresence: 'bereit',
    // De'Longhi WLAN (Texte)
    turningon: 'heizt', goingtosleep: 'aus', preparingmilk: 'bezieht', preparingmilkalt: 'bezieht', dispensinghotwater: 'bezieht',
    preparingchocolate: 'bezieht', cleaningmilksystem: 'pflege', rinsingwaterfilter: 'pflege',
    // Melitta/Nivona (Anzeigetexte)
    easyclean: 'pflege', intensiveclean: 'pflege', evaporating: 'pflege', filterinsert: 'pflege', filterreplace: 'pflege', filterremove: 'pflege',
    // Miele
    reserved: 'bereit', rinsehold: 'pflege', programinterrupted: 'aktion_noetig', superheating: 'heizt',
  };
  var PHASE = { heatingup: 'Heizt auf', grinding: 'Mahlt', prebrewing: 'Brüht vor', espresso: 'Brüht', brewing: 'Brüht', dispensing: 'Läuft ein',
    hotmilk: 'Milch', milkfoam: 'Milchschaum', rinse: 'Spült', rinsing: 'Spült', heating: 'Heizt auf', preparing: 'Bereitet vor',
    deliveringmilk: 'Milch', deliveringhotwater: 'Heißwasser', making: 'Brüht',
    // Miele 2. Durchgang, Melitta „activity“, homeconnect_ws „coffeemaker_process_phase“
    '2ndespresso': 'Brüht', '2ndprebrewing': 'Brüht vor', '2ndgrinding': 'Mahlt', extracting: 'Brüht', steaming: 'Milchschaum', dispensingwater: 'Heißwasser',
    coffeebrewing: 'Brüht', brewingunitmovesup: 'Bereitet vor', brewingunitmovesdown: 'Läuft ein', milkfroth: 'Milchschaum', warmmilk: 'Milch',
    hotwaterdispensing: 'Heißwasser', preliminary: 'Bereitet vor', startphase: 'Bereitet vor', lattemacpause: 'Milch', coldbrew: 'Brüht', dripbrew: 'Brüht',
    cleaningmilksystem: 'Spült', rinsephase: 'Spült', descalephase: 'Entkalkt', cleanphase: 'Reinigt', specialrinsing: 'Spült' };
  var careLabelOf = function (k) {
    return /descal|decalc/.test(k) ? 'Entkalkt' : /rins|wash/.test(k) ? 'Spült' : /calcnclean/.test(k) ? 'Pflege läuft' : 'Reinigt';
  };
  // Rohtext einer Integration lesbar („unknown_state“ → „Unknown state“, „Close Powder Lid“ bleibt).
  var prettyState = function (raw) {
    var t = String(raw == null ? '' : raw);
    if (t.indexOf('.') > -1 && !/\s/.test(t)) t = t.split('.').pop();
    t = t.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
  };
  K.prettyState = prettyState;
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
    // homeconnect_ws / home_connect_alt, Melitta, Jura, De'Longhi BT: ohne aktives Programm läuft das gewählte
    // (De'Longhi BT setzt seine Auswahl nie – dort hilft das eben gestartete Getränk, withPick im Popup).
    var fromSel = false;
    if (bad(prog) && /^(hcws|hcalt|melitta|jura|dlbt)$/.test(c.fam || '')) { prog = v(c.sel); fromSel = true; }
    // Status-Sensor mit Alarmwert (De'Longhi BT) → Warnung, Maschine braucht dich.
    var alarm = STATUS_ALARM[key];
    if (alarm || key === 'unknownalarm') st = 'aktion_noetig';
    // Unbekannter Statuswert: nicht als „Bereit“ ausgeben, sondern den Text der Integration lesbar zeigen.
    var other = null;
    if (!st && c.status && raw != null && !bad(raw) && c.fam !== 'plug' && c.fam !== 'lamarzocco') {
      other = /^unknown/.test(key) ? 'Unbekannt' : prettyState(raw);
      st = 'sonst';
    }
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
    if (c.fam === 'dlbt' && v(c.dispensing) === 'on' && (st === 'bereit' || st === 'sonst')) st = 'bezieht';
    if (s.power === false && st !== 'offline') st = 'aus';
    // Verbindung getrennt (Jura Bluetooth, Melitta): der letzte Zustand gilt nicht mehr.
    var cv = v(c.conn);
    var noConn = !!(c.conn && cv != null && (cv === 'off' || nk(cv) === 'disconnected'));
    if (noConn) st = 'offline';
    if (key === 'pause') s.paused = true;
    if (key === 'aborting') s.aborting = true;
    var d = (st === 'bezieht' || st === 'pflege' || st === 'heizt') ? K.drink(prog) : null;
    if (d && d.care && st === 'bezieht') { st = 'pflege'; careRun = true; }
    // Pflege bleibt Pflege, wenn das „Getränk“ nur die (stehen gebliebene) Auswahl ist.
    if (st === 'pflege' && !careRun && d && !d.care && !fromSel) st = 'bezieht';
    s.drink = st === 'bezieht' ? d : null;
    // Phase (Miele program_phase, Melitta activity, De'Longhi Status-Text)
    var ph = lastSeg(v(c.phase) || v(c.activity));
    if (ph === 'heatingup' && st === 'bezieht' && !s.drink) st = 'heizt';
    s.phase = PHASE[ph] || (st === 'bezieht' && PHASE[key] && key !== 'brewing' ? PHASE[key] : null);
    s.st = st;
    var pct = num(v(c.progress));
    // De'Longhi BT: Fortschritt steht am Sensor „Gibt aus“ (Attribut percentage).
    if (pct == null && c.fam === 'dlbt' && v(c.dispensing) === 'on') pct = num((g(c.dispensing).attributes || {}).percentage);
    s.pct = (st === 'bezieht' || st === 'pflege') && pct != null ? Math.max(0, Math.min(100, pct)) : null;
    var rem = g(c.remaining);
    if (rem && (st === 'bezieht' || st === 'pflege')) s.remain = mins(rem.state, (rem.attributes || {}).unit_of_measurement);
    var fin = v(c.finish), fms = fin ? Date.parse(fin) : NaN;
    if (isFinite(fms) && (st === 'bezieht' || st === 'pflege')) { s.finish = fms; if (s.remain == null) s.remain = Math.max(0, (fms - t) / 60000); }
    s.label = {
      aus: 'Aus', bereit: 'Bereit', heizt: 'Heizt auf', bezieht: s.paused ? 'Pausiert' : s.aborting ? 'Wird abgebrochen' : (s.drink ? s.drink.label : 'Läuft'),
      pflege: careRun && d ? careLabelOf(d.key) : careLabelOf(key), aktion_noetig: 'Eingriff nötig', fehler: 'Fehler', fertig: 'Fertig',
      offline: noConn ? 'Nicht verbunden' : 'Nicht verfügbar', sonst: other,
    }[st];
    // Warnungen
    var add = function (art, sub, soft, id) {
      var l = warnLabel(art, sub, soft);
      if (!l) return;
      if (s.warns.some(function (x) { return x.art === art && x.label === l[0]; })) return;
      var sev = sub === 'overdue' || sub === 'blockage' ? 'bad' : 'warn';
      s.warns.push({ art: art, label: l[0], sub: l[1], short: l[2], sev: sev, id: id || null, icon: WARN_TXT[art][2], soft: !!soft });
    };
    c.warns.forEach(function (w) {
      var wv = v(w.id), on = warnOn(w, wv);
      // Melitta: unbekannte Aufforderung („Close Powder Lid“) → Eingriff nötig mit dem Text der Maschine.
      if (!on && w.how === 'melitta' && wv != null && !bad(wv) && !/^(none|ok|no)$/i.test(String(wv))) { s.need = prettyState(wv); return; }
      if (!on) return;
      var art = on.art || w.art;
      if (art === 'aktion') return;
      add(art, on.sub || w.sub, on.soft, w.id);
    });
    if (alarm) add(Array.isArray(alarm) ? alarm[0] : alarm, Array.isArray(alarm) ? alarm[1] : null, false, c.status);
    s.warns.sort(function (a, b) { return (a.sev === 'bad' ? 0 : 1) - (b.sev === 'bad' ? 0 : 1) || ORDER.indexOf(a.art) - ORDER.indexOf(b.art); });
    if (s.need && /^(bereit|fertig|sonst)$/.test(s.st)) { s.st = 'aktion_noetig'; s.label = 'Eingriff nötig'; }
    // Mit bekanntem Grund steht der Grund vorn („Wasser nachfüllen“), „Eingriff nötig“ nur ohne (D9).
    if (s.st === 'aktion_noetig' && s.warns.length) s.label = s.warns[0].label;
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
    // Gesamtzähler vorhanden, aber gerade ohne Wert: keine Ersatzsumme (die läge unter dem echten Stand).
    s.total = tot != null ? tot : c.total ? null : per.length ? per.reduce(function (a, x) { return a + x.n; }, 0) : null;
    s.tone = st === 'fehler' ? 'bad' : s.warns.length ? (s.warns[0].sev === 'bad' ? 'bad' : 'warn') : st === 'aktion_noetig' ? 'warn' : null;
    return s;
  };
  K.of = function (entity, hass, states) {
    var id = entity && entity.entity_id;
    if (!id) return null;
    var c = K.find(hass, id);
    return withPick(c, K.status(c, states || (hass && hass.states) || {}));
  };

  // ── Kachel ────────────────────────────────────────────────────────────────
  var pctTxt = function (p) { return Math.round(p) + ' %'; };
  K.tileText = function (s) {
    if (!s) return '';
    if (s.st === 'offline') return s.label;
    if (s.st === 'fehler') return s.warns.length ? s.warns[0].short : 'Fehler';
    // Warnung hat Vorrang (in Warnfarbe: Symbol orange/rot, Kachel hinterlegt) – als kurzes Wort („Wasser leer“);
    // „bald leer“ erst in Ruhe.
    var hard = s.warns.filter(function (w) { return !w.soft; })[0];
    if (hard) return hard.short;
    // Beim Bezug die Zahl zuerst („40 % · Cappuccino“): am Handy bleibt sie stehen, wenn der Name gekürzt wird.
    if (s.st === 'bezieht') return s.pct != null && !s.paused ? pctTxt(s.pct) + ' · ' + s.label : s.label;
    if (s.st === 'pflege') return s.pct != null ? pctTxt(s.pct) + ' · ' + s.label : s.label;
    if (s.warns.length) return s.warns[0].short;
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
  var pick = {}, started = {}, pending = {}, stopped = {};
  K.picked = function (c, states) {
    var p = pick[c.anchor];
    if (p) return p;
    // Home Connect: das an der Maschine gewählte Programm ist vorgewählt.
    var S = states || {};
    var cur = c.sel && S[c.sel] && HC[c.fam] ? S[c.sel].state : null;
    var d = K.drink(cur);
    return d && !d.care ? cur : null;
  };
  // Zuletzt gestartete Getränke je Maschine (Halten-Menü), nur in diesem Browser.
  var recentKey = function (a) { return 'casora_coffee_recent:' + a; };
  K.recent = function (anchor) {
    try { var x = JSON.parse(window.localStorage.getItem(recentKey(anchor)) || '[]'); return Array.isArray(x) ? x : []; } catch (e) { return []; }
  };
  var remember = function (anchor, raw) {
    try {
      var l = K.recent(anchor).filter(function (r) { return r !== raw; });
      l.unshift(raw);
      window.localStorage.setItem(recentKey(anchor), JSON.stringify(l.slice(0, 6)));
    } catch (e) { /* ohne Merkliste */ }
  };
  var hassNow = function () { var ha = typeof document !== 'undefined' && document.querySelector('home-assistant'); return ha && ha.hass; };
  // Startbereit: Status „bereit“ (bzw. „fertig“) und – falls die Maschine einen Start-Knopf hat – der Knopf verfügbar.
  K.readyNow = function (c, S) {
    var s = K.status(c, S || {});
    if (s.dead || !/^(bereit|fertig)$/.test(s.st)) return false;
    return !(c.start && S[c.start] && S[c.start].state === 'unavailable');
  };
  // Wartet nach dem Einschalten bzw. beim Aufheizen, bis die Maschine bereit ist (Promise<true|false>).
  K.waitReady = function (c, getS, ms, step) {
    return new Promise(function (res) {
      var t0 = Date.now();
      var tick = function () {
        if (K.readyNow(c, getS() || {})) return res(true);
        if (Date.now() - t0 >= ms) return res(false);
        setTimeout(tick, step);
      };
      setTimeout(tick, step);
    });
  };
  // Startet das Getränk raw – je Integration anders. Promise: true = gestartet, 'on' = nur eingeschaltet (nicht
  // rechtzeitig bereit), false = kein Weg, { error } = Dienst abgelehnt.
  // o.wait (ms, Standard 90 s) / o.step / o.states (Getter für frische Zustände) / o.onWait (wartet jetzt).
  K.start = function (hass, c, raw, o) {
    o = o || {};
    if (!hass || !c || !raw) return Promise.resolve(false);
    var call = function (d, sv, data) { return Promise.resolve(hass.callService(d, sv, data || {})); };
    var get = o.states || function () { var h = hassNow(); return (h && h.states) || hass.states || {}; };
    var S = hass.states || {};
    var s0 = K.status(c, S);
    var off = !!(c.power && S[c.power] && S[c.power].state === 'off');
    // Ein Getränk lässt sich erst starten, wenn die Maschine bereit ist: nach dem Einschalten bzw. beim Aufheizen warten.
    var needWait = off || s0.st === 'heizt';
    var on = off ? call('switch', 'turn_on', { entity_id: c.power }) : Promise.resolve();
    return on.then(function () {
      if (!needWait) return true;
      if (o.onWait) o.onWait();
      return K.waitReady(c, get, o.wait != null ? o.wait : 90000, o.step || 1000);
    }).then(function (ready) {
      if (!ready) return 'on';
      S = get() || S;
      var item = K.drinks(c, S).filter(function (x) { return x.raw === raw; })[0];
      if (item && item.btn) return call('button', 'press', { entity_id: item.btn }).then(function () { return true; });
      var svc = hass.services || {};
      // Home Connect (Core): Programm samt Optionen in einem Aufruf starten.
      if (c.fam === 'hc' && c.device && svc.home_connect && svc.home_connect.set_program_and_options) {
        var data = { device_id: c.device, affects_to: 'active_program', program: raw };
        var opt = function (id, key) { if (id && S[id] && !bad(S[id].state)) data[key] = /^number\./.test(id) ? Number(S[id].state) : S[id].state; };
        opt(c.opts.strength, 'consumer_products_coffee_maker_option_bean_amount');
        opt(c.opts.temp, 'consumer_products_coffee_maker_option_coffee_temperature');
        opt(c.opts.amount, 'consumer_products_coffee_maker_option_fill_quantity');
        return call('home_connect', 'set_program_and_options', data).then(function () { return true; });
      }
      if (c.actSel) return call('select', 'select_option', { entity_id: c.actSel, option: raw }).then(function () { return true; });
      if (c.sel && c.start) {
        var same = S[c.sel] && S[c.sel].state === raw;
        return (same ? Promise.resolve() : call('select', 'select_option', { entity_id: c.sel, option: raw }))
          .then(function () { return call('button', 'press', { entity_id: c.start }); }).then(function () { return true; });
      }
      // De'Longhi BT (make_beverage) u. a.: die Auswahl startet sofort.
      if (c.sel) return call('select', 'select_option', { entity_id: c.sel, option: raw }).then(function () { return true; });
      return false;
    }).then(function (r) { if (r === true) remember(c.anchor, raw); return r; }, function (e) { return { error: e || {} }; });
  };
  // Bezug abbrechen (Taste der Integration). Promise<true|false>.
  K.stop = function (hass, c) {
    if (!hass || !c || !c.stop) return Promise.resolve(false);
    return Promise.resolve(hass.callService('button', 'press', { entity_id: c.stop })).then(function () { return true; }, function () { return false; });
  };
  // Fernstart nötig und nicht erlaubt? (Home Connect)
  K.blocked = function (c, s) {
    if (!s || s.dead) return 'Nicht verfügbar';
    if (s.st === 'offline') return s.label;
    if (s.st === 'bezieht' || s.st === 'pflege') return null;
    if (HC[c.fam] && s.remote === false) return 'Fernstart an der Maschine erlauben';
    return null;
  };
  // Warnung, die einen Bezug verhindert (Rückfrage vor dem Start).
  var STOP_ASK = { wasser: 'Wasser ist leer', bohnen: 'Bohnen sind leer', schale: 'Schale ist voll', satz: 'Satzbehälter ist voll' };
  K.startWarn = function (s) {
    var w = (s && s.warns || []).filter(function (x) { return !x.soft && STOP_ASK[x.art]; })[0];
    if (!w) return null;
    if (w.art === 'wasser' && /einsetzen/.test(w.label)) return 'Wassertank fehlt';
    if (w.art === 'schale' && /einsetzen/.test(w.label)) return 'Schale fehlt';
    return STOP_ASK[w.art];
  };
  // Während des Bezugs: Getränk aus der Auswahl bzw. dem eben gestarteten, wenn die Integration es nicht meldet.
  var withPick = function (c, s) {
    if (!s || s.st !== 'bezieht' || s.drink) return s;
    var p = started[c.anchor];
    var d = p && Date.now() - p.t < 15 * 60000 ? K.drink(p.raw) : null;
    if (d && !d.care) { s.drink = d; if (!s.paused && !s.aborting) s.label = d.label; }
    return s;
  };

  // ── Rückmeldung (HA-Hinweis unten) ─────────────────────────────────────────
  var notice = function (msg) {
    var ha = typeof document !== 'undefined' && document.querySelector('home-assistant');
    if (!ha) return;
    var ev = new Event('hass-notification', { bubbles: true, composed: true });
    ev.detail = { message: msg };
    ha.dispatchEvent(ev);
  };
  var errText = function (r) { var m = r && r.error && r.error.message; return T('Start hat nicht geklappt') + (m ? ': ' + m : ''); };

  // ── Klicks im Popup: Schein-Entitäten coffee-pick:/coffee-start:/coffee-stop:/coffee-more:/coffee-go: ─────
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
  // Nach „Abbrechen“ kurz keine Tipps im Getränke-Raster (der Aufbau wechselt vom Ring zurück zum Raster).
  var LOCK_MS = 1200, STOP_SHOW_MS = 1800;
  var locked = function (a) { return stopped[a] && Date.now() - stopped[a] < LOCK_MS; };
  // Start mit Rückfrage bei leerem Wasser/Bohnen bzw. voller Schale; Fehler melden, Auswahl bleibt.
  K.go = function (hass, c, raw, ask) {
    var a = c.anchor;
    if (busy[a] && Date.now() - busy[a] < 3000) return Promise.resolve(null);
    var s = K.status(c, hass.states || {});
    var d = K.drink(raw);
    var run = function () {
      busy[a] = Date.now();
      pending[a] = s.power === false || s.st === 'heizt' ? 'wait' : 'go';
      redraw(a);
      return K.start(hass, c, raw, { onWait: function () { pending[a] = 'wait'; busy[a] = Date.now() + 90000; redraw(a); } }).then(function (r) {
        busy[a] = 0; pending[a] = null;
        if (r === true) { pick[a] = null; started[a] = { raw: raw, t: Date.now() }; }
        else if (r === 'on') notice(T('Eingeschaltet, aber noch nicht bereit – Getränk an der Maschine starten'));
        else notice(errText(r));
        redraw(a);
        return r;
      });
    };
    var why = K.startWarn(s);
    var title = d ? T(d.label) : '';
    if (why && window.casoraAsk) {
      return window.casoraAsk({ title: title, text: T(why) + ' – ' + T('trotzdem starten?'), yes: T('Trotzdem starten'), stack: true })
        .then(function (ok) { return ok ? run() : null; });
    }
    if (ask && window.casoraAsk) {
      return window.casoraAsk({ title: title, text: T((d ? d.label : 'Getränk') + ' starten?'), yes: T('Starten') })
        .then(function (ok) { return ok ? run() : null; });
    }
    return run();
  };
  K.cancel = function (hass, c) {
    var a = c.anchor;
    stopped[a] = Date.now();
    redraw(a);
    setTimeout(function () { redraw(a); }, LOCK_MS + 50);
    setTimeout(function () { redraw(a); }, STOP_SHOW_MS + 50);
    return K.stop(hass, c).then(function (ok) { if (!ok) { stopped[a] = 0; notice(T('Abbrechen hat nicht geklappt')); redraw(a); } return ok; });
  };
  (window._casoraMiHooks = window._casoraMiHooks || []).push(function (mid) {
    var m = /^coffee-(pick|start|stop|more|go):(.*)$/.exec(String(mid || ''));
    if (!m) return false;
    var hass = hassNow();
    // Nur am ersten „|“ trennen: Programmnamen dürfen selbst „|“ enthalten.
    var cut = m[2].indexOf('|');
    var p = cut < 0 ? [m[2]] : [m[2].slice(0, cut), m[2].slice(cut + 1)];
    if (m[1] === 'go') {
      try { if (window.casoraPopup) window.casoraPopup.close(); } catch (e) { /* zu */ }
      history.pushState(null, '', m[2]);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return true;
    }
    if (m[1] === 'more') { more[p[0]] = !more[p[0]]; redraw(p[0]); return true; }
    var c = hass ? K.find(hass, p[0]) : null;
    if (!c) return true;
    if (m[1] === 'stop') { K.cancel(hass, c); return true; }
    if (locked(p[0])) return true;
    if (m[1] === 'pick') {
      pick[p[0]] = pick[p[0]] === p[1] ? null : p[1];
      // Home Connect: Auswahl auch an der Maschine vorwählen – dann gelten deren Optionen (Stärke, Menge …).
      if (pick[p[0]] && HC[c.fam] && c.sel && hass.states[c.sel] && hass.states[c.sel].state !== p[1]) {
        try {
          Promise.resolve(hass.callService('select', 'select_option', { entity_id: c.sel, option: p[1] })).catch(function () { /* bleibt lokal gewählt */ });
        } catch (e) { /* bleibt lokal */ }
      }
      redraw(p[0]);
      return true;
    }
    if (m[1] === 'start') { K.go(hass, c, p[1]); return true; }
    return false;
  });

  // ── Halten-Menü (22-halten.js): An/Aus, zwei Getränke direkt starten (mit Rückfrage), Abbrechen beim Bezug ──
  K.hold = function (hass, id) {
    if (!hass || !id || !K.is(hass, id)) return [];
    var S = hass.states || {}, c = K.find(hass, id), s = withPick(c, K.status(c, S)), out = [];
    if (s.dead) return out;
    // An/Aus – nur, wenn die Kachel nicht selbst der Schalter ist (dann schaltet schon der Haupteintrag des Menüs).
    if (c.power && c.power !== id && S[c.power] && !bad(S[c.power].state)) {
      var on = S[c.power].state === 'on';
      out.push({ key: 'act', t: on ? 'Ausschalten' : 'Einschalten', ic: 'mdi:power', svc: on ? 'switch.turn_off' : 'switch.turn_on', entity: c.power });
    }
    if (s.st === 'bezieht' || s.st === 'pflege') {
      if (c.stop && S[c.stop] && S[c.stop].state !== 'unavailable') {
        out.push({ key: 'fn', t: 'Abbrechen', ic: 'mdi:stop', fn: function () { K.cancel(hass, c); } });
      }
      return out;
    }
    if (K.blocked(c, s)) return out;
    var bev = K.drinks(c, S).filter(function (x) { return !x.care; });
    if (!bev.length) return out;
    // Zuletzt gestartete zuerst, dann die meistgetrunkenen (Zähler mit gleichem Namen), dann die ersten der Liste.
    var top = [];
    var addRaw = function (raw) { var x = bev.filter(function (b) { return b.raw === raw; })[0]; if (x && top.indexOf(x) < 0 && top.length < 2) top.push(x); };
    K.recent(c.anchor).forEach(addRaw);
    s.perDrink.forEach(function (pd) { var x = bev.filter(function (b) { return b.label === pd.label; })[0]; if (x) addRaw(x.raw); });
    bev.forEach(function (b) { addRaw(b.raw); });
    top.forEach(function (x) {
      out.push({ key: 'fn', t: x.label + ' starten', ic: iconOf(x.icon), fn: function () { var h = hassNow() || hass; K.go(h, K.find(h, id), x.raw, true); } });
    });
    return out;
  };
  // Eigene Getränke-Symbole sind Masken (Name ohne „mdi:“); das Halten-Menü kann nur mdi-Symbole.
  var iconOf = function (ic) { return /:/.test(ic) ? ic : 'mdi:coffee-outline'; };

  // ── Popup ─────────────────────────────────────────────────────────────────
  K.popup = function (entity, states, hass) {
    var KIT = window._casoraSoftKit, UI = window._casoraUI;
    var empty = { type: 'vertical-stack', cards: [] };
    var id = entity && entity.entity_id;
    if (!KIT || !UI || !id) return empty;
    var c = K.find(hass, id);
    // Beim Öffnen immer die kurze Getränkeliste (D18).
    more[c.anchor] = false;
    var watch = K.watch(c);
    var call = function (part) {
      return 'return window._casoraCoffee ? window._casoraCoffee.sec(' + JSON.stringify(part) + ', ' + JSON.stringify(c) + ', states, hass, this) : "";';
    };
    var f = {};
    // Je Spalte nur Bereiche, die immer etwas zeigen (leere Karten ließen eine Lücke, die Spalten fluchteten nicht).
    // Der Kopf (hero) ist nur die Statuszeile – der Rahmen holt sie in den Kopf und blendet ihr Feld aus; der Ring
    // des Bezugs steht darum links bei den Getränken (sonst fehlte er, wenn das Popup vor dem Bezug geöffnet war).
    var parts = ['hero', 'drinks'];
    if (c.warns.length || c.pre.length || c.fam === 'hc' || c.status) parts.push('info');
    if (c.total || c.counters.length) parts.push('stats');
    parts.forEach(function (k) { f[k] = { card: KIT.secCard(watch, call(k), states) }; });
    return KIT.layout({ fields: f, top: ['hero'], left: ['drinks'], right: ['info', 'stats'], // Handy: Hinweise nur dann vor den Getränken, wenn beim Öffnen etwas fehlt (sonst zuerst bedienen).
      narrowOrder: K.status(c, states).warns.some(function (w) { return !w.soft && !CARE_NAME[w.art]; }) ? ['info', 'drinks', 'stats'] : ['drinks', 'info', 'stats'] });
  };

  var LBL = 'font-family:var(--primary-font-family, system-ui);';
  var remainTxt = function (s) {
    return s.remain != null && s.remain > 0 ? (s.remain < 1 ? 'noch ' + Math.max(1, Math.round(s.remain * 60)) + ' s' : 'noch ' + Math.round(s.remain) + ' Min.') : null;
  };
  // Großer Ring (Bezug): Spur in Sand, Bogen in Gerätefarbe, Prozent in der Mitte (nur hier, nicht im Kopf).
  var ringHtml = function (s) {
    var p = Math.max(0, Math.min(100, s.pct || 0)), r = 52, L = 2 * Math.PI * r;
    var under = (s.paused ? 'Pausiert' : s.phase) || remainTxt(s) || '';
    return '<div style="' + LBL + 'display:flex;justify-content:center;padding:var(--casora-space-1, 4px) 0 0;">'
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
    + '.cof-grid{display:grid;grid-template-columns:repeat(auto-fill, minmax(104px, 1fr));grid-auto-rows:1fr;gap:var(--casora-space-2, 8px);}'
    + '.cof-d{position:relative;box-sizing:border-box;min-height:84px;padding:var(--casora-space-4, 16px) var(--casora-space-2, 8px) var(--casora-space-3, 12px);display:flex;flex-direction:column;'
    + 'align-items:center;justify-content:flex-start;gap:var(--casora-space-2, 8px);border-radius:var(--casora-r-element, 18px);cursor:pointer;user-select:none;'
    + '-webkit-user-select:none;-webkit-tap-highlight-color:transparent;background:var(--casora-soft-control-fill, rgba(140,115,90,0.10));'
    + 'color:var(--casora-soft-sub, var(--secondary-text-color));transition:background-color var(--casora-dur-feedback, 160ms) ease, box-shadow var(--casora-dur-feedback, 160ms) ease;}'
    + '.cof-d > *{pointer-events:none;}'
    + '.cof-d .n{font-size:var(--casora-fs-sub, 13px);font-weight:700;line-height:1.2;text-align:center;color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));'
    + 'white-space:normal;overflow-wrap:anywhere;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;max-width:100%;}'
    + '.cof-d .ic{flex:none;width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:var(--casora-popup-ui-action, var(--casora-color-teal, #4E9E95));}'
    + '.cof-d .ic ha-icon{--mdc-icon-size:26px;width:26px;height:26px;display:flex;color:inherit;}'
    + '.cof-d .ic i{display:block;width:28px;height:28px;background-color:currentColor;-webkit-mask:var(--m) center / contain no-repeat;mask:var(--m) center / contain no-repeat;}'
    + '.cof-d.on{background:var(--casora-soft-seg-on, #FFFDF9);box-shadow:var(--casora-soft-seg-on-shadow, none);}'
    // Gewählt: Symbol und Name in der Schriftfarbe der hellen Fläche (dunkel war Petrol auf Creme 1,54:1, D1).
    + '.cof-d.on .n,.cof-d.on .ic{color:var(--casora-soft-seg-on-ink, var(--casora-popup-tiles-text-primary, var(--primary-text-color)));}'
    + '.cof-d.dis{opacity:.45;cursor:default;}'
    + '@media (hover:hover){.cof-d:not(.on):not(.dis):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
    + '.cof-d:not(.dis):active{transform:scale(var(--casora-press-scale, .97));}'
    + '.cof-go{margin-top:var(--casora-space-3, 12px);}'
    + '.cof-go .hh-pill{width:100%;justify-content:center;min-height:48px;font-size:var(--casora-fs-row, 15px);font-weight:700;}'
    + '.cof-go .hh-pill > *{flex:none;margin:0;}'
    + '.cof-go .hh-pill.wait{opacity:.7;cursor:default;}'
    + '.cof-stop{display:flex;align-items:center;justify-content:center;gap:var(--casora-space-2, 8px);min-height:48px;box-sizing:border-box;padding:0 22px;'
    + 'border-radius:999px;cursor:pointer;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-size:var(--casora-fs-row, 15px);font-weight:700;'
    + 'color:var(--casora-popup-tiles-text-primary, var(--primary-text-color));background:var(--casora-soft-row-fill, rgba(140,115,90,0.07));'
    + 'transition:background-color var(--casora-dur-feedback, 160ms) ease;}'
    + '.cof-stop > *{pointer-events:none;}'
    + '.cof-stop ha-icon{--mdc-icon-size:18px;width:18px;height:18px;display:flex;color:var(--casora-soft-sub, var(--secondary-text-color));}'
    + '.cof-stop.done{cursor:default;color:var(--casora-soft-sub, var(--secondary-text-color));}'
    + '@media (hover:hover){.cof-stop:not(.done):hover{background:var(--casora-soft-row-hover, rgba(140,115,90,0.11));}}'
    + '.cof-stop:not(.done):active{transform:scale(var(--casora-press-scale, .97));}'
    + '.cof-run{display:flex;flex-direction:column;gap:var(--casora-space-4, 16px);}'
    + '@media (prefers-reduced-motion:reduce){.cof-d,.cof-stop{transition:none;}}'
    + '</style>';
  var iconHtml = function (ic) {
    if (/:/.test(ic)) return '<span class="ic"><ha-icon icon="' + esc(ic) + '"></ha-icon></span>';
    var url = typeof window.casoraIconUrl === 'function' ? window.casoraIconUrl(ic) : '/casora_assets/icons/' + ic + '.svg';
    return '<span class="ic"><i style="--m:url(\'' + esc(url) + '\')"></i></span>';
  };
  // Stärke (bean_amount): höchstens vier Stufen (am Handy drei) – die eingestellte ist immer dabei.
  var BEAN = [['verymild', 'Sehr mild'], ['mild', 'Mild'], ['normal', 'Normal'], ['strong', 'Stark'], ['verystrong', 'Sehr stark'],
    ['extrastrong', 'Extra stark'], ['doubleshot', 'Doppio']];
  var BEAN_SHOW = ['mild', 'normal', 'strong', 'verystrong'];
  var optKey = function (o) { return nk(o).replace(/^.*beanamount/, '').replace(/^.*coffeetemperature/, ''); };
  var beanIdx = function (k) { var i = BEAN.map(function (x) { return x[0]; }).indexOf(k.replace(/plus+$/, '')); return i < 0 ? 99 : i + (/plus/.test(k) ? 0.5 : 0); };
  K.strengths = function (st, max) {
    var opts = (st && st.attributes && st.attributes.options) || [];
    var cur = st ? optKey(st.state) : '';
    var lim = max || 4;
    var list = opts.filter(function (o) { return BEAN_SHOW.indexOf(optKey(o)) > -1; });
    var curO = opts.filter(function (o) { return optKey(o) === cur; })[0];
    // Eingestellte Stufe fehlt in der Auswahl: sie ersetzt die nächstgelegene.
    if (curO && list.indexOf(curO) < 0) {
      var ci = beanIdx(cur), near = 0;
      list.forEach(function (o, i) { if (Math.abs(beanIdx(optKey(o)) - ci) < Math.abs(beanIdx(optKey(list[near])) - ci)) near = i; });
      if (list.length >= lim) list[near] = curO; else list.push(curO);
      list.sort(function (a, b) { return beanIdx(optKey(a)) - beanIdx(optKey(b)); });
    }
    // Zu viele (Handy): die von der eingestellten am weitesten entfernte fällt weg.
    while (list.length > lim) {
      var ref = curO ? beanIdx(cur) : beanIdx('normal'), far = 0;
      list.forEach(function (o, i) { if (Math.abs(beanIdx(optKey(o)) - ref) > Math.abs(beanIdx(optKey(list[far])) - ref)) far = i; });
      list.splice(far, 1);
    }
    return list.map(function (o) {
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
  // Menge: runde 50er-Schritte im erlaubten Bereich (höchstens fünf), die eingestellte kommt dazu.
  K.amounts = function (st, max) {
    if (!st) return [];
    var a = st.attributes || {}, mn = num(a.min), mx = num(a.max), cur = num(st.state);
    if (mn == null || mx == null || mx <= mn) return [];
    var all = [];
    for (var x = Math.ceil(mn / 50) * 50; x <= mx; x += 50) all.push(x);
    if (!all.length) all = [Math.round(mn), Math.round(mx)];
    var lim = max || 5, out = all;
    if (all.length > lim) { out = []; for (var i = 0; i < lim; i++) { var v = all[Math.round(i * (all.length - 1) / (lim - 1))]; if (out.indexOf(v) < 0) out.push(v); } }
    if (cur != null && out.indexOf(Math.round(cur)) < 0) { out.push(Math.round(cur)); out.sort(function (p, q) { return p - q; }); }
    return out.map(function (v) { return { v: v, label: v + ' ml', on: cur != null && Math.round(cur) === v }; });
  };
  // Pflege-Arten, die die Pflege-Zeilen zeigen (dort, nicht noch einmal unter „Hinweise“).
  var careArts = function (c, s) {
    var arts = {};
    c.warns.forEach(function (w) { if (CARE_NAME[w.art]) arts[w.art] = 1; });
    c.pre.forEach(function (p) { arts[p.art] = 1; });
    s.warns.forEach(function (w) { if (CARE_NAME[w.art] && isCare(w)) arts[w.art] = 1; });
    return arts;
  };
  var isCare = function (w) { return CARE_NAME[w.art] && !/einsetzen|Service/.test(w.label); };
  // „Hinweise“ der Kaffeemaschine heißen englisch „Alerts“ (die übrigen Popups sagen „Notes“): eigener Schlüssel
  // mit unsichtbarem Wortverbinder (U+2060).
  var ALERTS = 'Hinweise⁠';

  K.sec = function (part, c, states, hass, el) {
    var UI = window._casoraUI;
    if (!UI || !c) return '';
    var S = states || {};
    var s = withPick(c, K.status(c, S, Date.now()));
    var HH = window._casoraHH;
    var a = c.anchor;
    if (part === 'hero') {
      // Kopf: höchstens eine Warnung (+N); mit bekanntem Grund steht die Warnung vorn („Wasser nachfüllen“).
      var main = s.label, tone = s.st === 'fehler' ? 'bad' : null, rest = [];
      var ws = s.warns.slice();
      if (s.st === 'bezieht' || s.st === 'pflege') {
        var rt = remainTxt(s);
        if (s.paused) { /* „Pausiert“ steht schon vorn */ } else if (rt) rest.push(rt); else if (s.phase) rest.push(s.phase);
      } else if (ws.length && /^(bereit|fertig|aktion_noetig)$/.test(s.st)) {
        main = ws[0].label; tone = ws[0].sev; ws = ws.slice(1);
        if (ws.length) rest.push('+' + ws.length);
        ws = [];
      }
      if (ws.length) {
        rest.push({ text: ws[0].label, tone: ws[0].sev });
        if (ws.length > 1) rest.push({ text: '+' + (ws.length - 1), tone: ws[0].sev });
      }
      if (c.fam === 'plug' && s.plugW != null) rest.push(fmtW(s.plugW));
      return UI.line(main, rest, { tone: tone });
    }
    if (part === 'info') {
      var wh = K.sec('warn', c, states, hass, el), ch = K.sec('care', c, states, hass, el);
      return wh + (wh && ch ? '<div style="height:var(--casora-popup-sec-gap, 22px)"></div>' : '') + ch;
    }
    if (part === 'drinks') {
      keep(a, el);
      if (s.dead) return '';
      var stopRecent = stopped[a] && Date.now() - stopped[a] < STOP_SHOW_MS;
      // Läuft ein Bezug: Ring (bzw. eine Zeile ohne Prozent) und darunter direkt „Abbrechen“ – einstufig, wirkt sofort.
      if (s.st === 'bezieht' || s.st === 'pflege') {
        var run = GRID_CSS + '<div class="cof-run">';
        if (K.ring(s) != null) run += ringHtml(s);
        else {
          var d = s.drink;
          run += UI.group([{ icon: d && /:/.test(d.icon) ? d.icon : s.st === 'pflege' ? 'mdi:spray-bottle' : 'mdi:coffee-maker-outline', iconTone: 'accent', label: s.label,
            sub: [s.paused ? null : s.phase, remainTxt(s)].filter(Boolean).join(' · ') || null }], null);
        }
        if (stopRecent) run += '<div class="cof-stop done" role="status"><ha-icon icon="mdi:check"></ha-icon><span>' + esc(T('Abgebrochen')) + '</span></div>';
        else if (c.stop && S[c.stop] && S[c.stop].state !== 'unavailable' && !s.aborting) {
          run += '<div class="cof-stop" role="button" tabindex="0" data-casora-mi="' + esc('coffee-stop:' + a) + '"><ha-icon icon="mdi:stop"></ha-icon><span>'
            + esc(T('Abbrechen')) + '</span></div>';
        }
        return run + '</div>';
      }
      var list = K.drinks(c, S);
      var bev = list.filter(function (x) { return !x.care; });
      if (!bev.length) {
        // Steckdose oder Maschine ohne Getränkeauswahl: nur Hinweis, wie gestartet wird.
        return c.fam === 'plug' ? UI.group([{ icon: 'mdi:power-plug-outline', iconTone: s.power ? 'accent' : null, label: s.power ? 'Steckdose an' : 'Steckdose aus',
          sub: s.plugW != null ? 'Leistung ' + fmtW(s.plugW) : null }], 'Maschine') : '';
      }
      var why = K.blocked(c, s);
      var lock = locked(a);
      var chosen = K.picked(c, S);
      var narrow = typeof window !== 'undefined' && window.innerWidth <= 760;
      // Handy: zwei Reihen, damit „Starten“ ohne Scrollen erreichbar bleibt (U2).
      var base = narrow ? 6 : 9;
      var shown = bev.slice(0, more[a] ? 99 : base);
      if (chosen && !shown.some(function (x) { return x.raw === chosen; })) {
        var chx = bev.filter(function (x) { return x.raw === chosen; })[0];
        if (chx) shown[shown.length - 1] = chx;
      }
      var html = GRID_CSS + (UI.label ? UI.label('Getränke') : '');
      // Fernstart aus: Hinweis über dem Raster (umbrechend), dann 16 px Abstand.
      if (why) html += UI.group([s.st === 'offline' ? { icon: 'mdi:bluetooth-off', iconTone: 'warn', label: why, sub: 'Verbindung zur Maschine prüfen', subWrap: true }
        : { icon: 'mdi:remote-off', iconTone: 'warn', label: why, sub: 'Erst dann startet Casora Getränke aus der Ferne', subWrap: true }], null)
        + '<div style="height:var(--casora-space-4, 16px)"></div>';
      html += '<div class="cof-grid">' + shown.map(function (x) {
        var on = x.raw === chosen, off = why || lock;
        return '<div class="cof-d' + (on ? ' on' : '') + (off ? ' dis' : '') + '" role="button" aria-pressed="' + (on ? 'true' : 'false') + '"'
          + (off ? '' : ' data-casora-mi="' + esc('coffee-pick:' + a + '|' + x.raw) + '"') + '>'
          + iconHtml(x.icon) + '<div class="n">' + esc(T(x.label)) + '</div></div>';
      }).join('') + '</div>';
      if (bev.length > base) {
        html += '<div role="button" tabindex="0" data-casora-mi="' + esc('coffee-more:' + a) + '" style="' + LBL + 'box-sizing:border-box;width:100%;margin-top:var(--casora-space-2, 8px);'
          + 'min-height:44px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;cursor:pointer;'
          + 'background:var(--casora-soft-mehr-fill, var(--casora-soft-control-fill, rgba(140,115,90,0.10)));color:var(--casora-soft-mehr-ink, var(--casora-popup-tiles-text-primary, #3A322B));">'
          + '<span style="pointer-events:none;">' + esc(T(more[a] ? 'Weniger anzeigen' : 'Alle Getränke (' + bev.length + ')')) + '</span></div>';
      }
      if (stopRecent) html += '<div style="height:var(--casora-space-2, 8px)"></div>' + (UI.note ? UI.note('Abgebrochen') : '');
      if (chosen && !why) {
        // Start direkt unter dem Raster (am Handy ohne Scrollen erreichbar), die Optionen der Sorte darunter.
        var dsel = K.drink(chosen);
        var nm = dsel ? dsel.label : 'Getränk';
        var pend = pending[a];
        var go = pend === 'wait' ? 'Startet, sobald bereit' : pend === 'go' ? 'Startet …' : (s.power === false ? 'Einschalten und ' + nm + ' starten' : nm + ' starten');
        html += '<div class="cof-go">' + (HH && HH.pillCss ? HH.pillCss : '') + '<div class="hh-pills"><div class="hh-pill pri' + (pend ? ' wait' : '') + '" role="button"'
          + (pend || lock ? '' : ' data-casora-mi="' + esc('coffee-start:' + a + '|' + chosen) + '"') + '>'
          + '<ha-icon icon="' + (pend ? 'mdi:timer-sand' : 'mdi:play') + '" style="--mdc-icon-size:20px;width:20px;height:20px;display:block;pointer-events:none;"></ha-icon>'
          + '<span style="pointer-events:none;">' + esc(T(go)) + '</span></div></div></div>';
        var sw = function (id, items, label, svcOf) {
          if (!id || !S[id] || !items.length) return '';
          return '<div style="height:var(--casora-space-4, 16px)"></div>' + UI.segments(items.map(function (it) {
            return { label: it.label, active: it.on, svc: it.on ? null : svcOf(it) };
          }), label);
        };
        html += sw(c.opts.strength, K.strengths(S[c.opts.strength], narrow ? 3 : 4), 'Stärke', function (it) { return { domain: 'select', service: 'select_option', data: { option: it.raw }, target: { entity_id: c.opts.strength } }; });
        html += sw(c.opts.amount, K.amounts(S[c.opts.amount], narrow ? 4 : 5), 'Menge', function (it) { return { domain: 'number', service: 'set_value', data: { value: it.v }, target: { entity_id: c.opts.amount } }; });
        html += sw(c.opts.temp, S[c.opts.temp] ? K.temps(S[c.opts.temp]) : [], 'Temperatur', function (it) { return { domain: 'select', service: 'select_option', data: { option: it.raw }, target: { entity_id: c.opts.temp } }; });
      } else if (!why && !stopRecent) html += UI.note ? UI.note('Getränk antippen, dann starten.') : '';
      return html;
    }
    if (part === 'warn') {
      if (s.dead) return '';
      // Was die Pflege-Zeilen zeigen, steht nicht noch einmal hier (D8). Zeilen nicht antippbar: die Anleitung steht darin (U3).
      var arts = careArts(c, s);
      var wr = s.warns.filter(function (w) { return !(arts[w.art] && isCare(w)); }).map(function (w) {
        return { icon: w.icon, iconTone: w.sev === 'bad' ? 'bad' : 'warn', label: w.label, sub: w.sub, subWrap: true };
      });
      if (s.st === 'fehler' && !s.warns.length) wr.push({ icon: 'mdi:alert-circle-outline', iconTone: 'bad', label: 'Maschine meldet einen Fehler', sub: 'Hinweis im Display der Maschine ansehen' });
      if (s.st === 'aktion_noetig' && !s.warns.length) wr.push({ icon: 'mdi:hand-back-right-outline', iconTone: 'warn', label: 'Eingriff nötig', sub: 'Hinweis im Display der Maschine ansehen' });
      return wr.length ? UI.group(wr, ALERTS) : '';
    }
    if (part === 'care') {
      if (s.dead) return '';
      var cr = [];
      var ca = careArts(c, s);
      ['entkalken', 'entkalkenreinigen', 'reinigen', 'filter'].forEach(function (k) {
        if (!ca[k]) return;
        var due = s.warns.filter(function (w) { return w.art === k && isCare(w); })[0];
        var pre = s.pre.filter(function (p) { return p.art === k; })[0];
        // Eine Unterzeile nur, wenn sie etwas sagt: bei „Fällig“ die Anleitung, sonst keine (D15).
        cr.push({ icon: WARN_TXT[k][2], iconTone: due ? (due.sev === 'bad' ? 'bad' : 'warn') : pre && pre.cups <= 10 ? 'warn' : 'good', label: CARE_NAME[k],
          sub: due ? due.sub : null, subWrap: !!due,
          value: due ? (due.sev === 'bad' ? 'Überfällig' : 'Fällig') : pre ? 'In ' + cupsTxt(pre.cups) : 'OK',
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
      keep(a, el);
      if (s.total == null && !s.perDrink.length) return '';
      var sr = [];
      var today = K.today(hass, c, el);
      if (s.total != null) sr.push({ icon: 'mdi:counter', iconTone: 'accent', label: 'Getränke gesamt', sub: today != null ? 'Heute ' + Math.round(today) : null,
        value: Math.round(s.total).toLocaleString(loc()), entity: c.total || null });
      var top = s.perDrink.slice(0, 3), mx = top.length ? top[0].n : 0;
      top.forEach(function (x) {
        sr.push({ icon: x.icon && /:/.test(x.icon) ? x.icon : MUG, iconTone: 'accent', label: x.label, value: Math.round(x.n).toLocaleString(loc()),
          bar: mx ? x.n / mx : null, barTone: 'accent', entity: x.ids && x.ids.length === 1 ? x.ids[0] : null });
      });
      return UI.group(sr, 'Statistik');
    }
    return '';
  };
  // „10 Tassen“ mit geschütztem Leerzeichen (bricht nie zwischen Zahl und Wort um).
  var cupsTxt = function (n) { return n + (n === 1 ? ' Tasse' : ' Tassen'); };
  var preText = function (p) {
    var n = { entkalken: 'Entkalken', entkalkenreinigen: 'Pflege', reinigen: 'Reinigen', filter: 'Filterwechsel' }[p.art] || 'Pflege';
    return n + ' in ' + cupsTxt(p.cups);
  };
  K.preText = preText;
  var fmtW = function (w) { return (w < 10 ? w.toLocaleString(loc(), { maximumFractionDigits: 1 }) : Math.round(w).toLocaleString(loc())) + ' W'; };
})();
