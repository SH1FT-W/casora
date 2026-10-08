// ── Fußball-Kachel + Popup (07.10.2026) ─────────────────────────────────────
// Template casora_football (['casora_entity','casora_popup_football']) ruft nur
// window._casoraFootball auf. Quelle ist ein Team-Tracker-Sensor (HACS „teamtracker“):
// Team, Gegner, Anstoß, Spielstand und Liga stehen in seinen Attributen – die Kachel
// braucht keine Einstellungen. Tabelle und Form lädt das Popup bei ESPN (dieselbe
// Quelle wie Team Tracker): Ligatabelle über standings; bei league_path „all“
// (Länderspiele, Pokale) die Liga des nächsten Spiels aus der Spielübersicht.
(function () {
  if (window._casoraFootball) return;
  var K = window._casoraFootball = { data: {}, busy: {}, next: {}, full: false, _id: null };
  var API = 'https://site.api.espn.com/apis';
  var TTL = 10 * 60000, TTL_LIVE = 60000, TTL_NEXT = 60 * 60000, H = 3600000;

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var day0 = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  var diffDays = function (d, now) { return Math.round((day0(d) - day0(now || new Date())) / 86400000); };
  var hm = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  var dm = function (d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.'; };
  var dmy = function (d) { return dm(d) + String(d.getFullYear()).slice(-2); };

  /* Team Tracker liefert ESPN-Namen auf Englisch. Bei deutscher Oberfläche Länder und Wettbewerbe auf
     Deutsch; sonst bleiben die ESPN-Namen (gekürzt). Datenlisten, kein UI-Text: Name=Name, durch | getrennt. */
  var pairs = function (str, low) {
    var o = {};
    str.split('|').forEach(function (p) { var n = p.indexOf('='); o[low ? p.slice(0, n).toLowerCase() : p.slice(0, n)] = p.slice(n + 1); });
    return o;
  };
  var DE = pairs('Albania=Albanien|Algeria=Algerien|Argentina=Argentinien|Australia=Australien|Austria=Österreich|Belgium=Belgien|Bosnia-Herzegovina=Bosnien-Herzegowina|Brazil=Brasilien|Bulgaria=Bulgarien|Cameroon=Kamerun|Canada=Kanada|Colombia=Kolumbien|Croatia=Kroatien|Cyprus=Zypern|Czechia=Tschechien|Czech Republic=Tschechien|Denmark=Dänemark|Egypt=Ägypten|England=England|Estonia=Estland|Finland=Finnland|France=Frankreich|Georgia=Georgien|Germany=Deutschland|Greece=Griechenland|Hungary=Ungarn|Iceland=Island|Ireland=Irland|Republic of Ireland=Irland|Israel=Israel|Italy=Italien|Japan=Japan|Kazakhstan=Kasachstan|Kosovo=Kosovo|Latvia=Lettland|Lithuania=Litauen|Luxembourg=Luxemburg|Mexico=Mexiko|Moldova=Moldau|Montenegro=Montenegro|Morocco=Marokko|Netherlands=Niederlande|North Macedonia=Nordmazedonien|Northern Ireland=Nordirland|Norway=Norwegen|Paraguay=Paraguay|Poland=Polen|Portugal=Portugal|Romania=Rumänien|Russia=Russland|Saudi Arabia=Saudi-Arabien|Scotland=Schottland|Senegal=Senegal|Serbia=Serbien|Slovakia=Slowakei|Slovenia=Slowenien|South Korea=Südkorea|Spain=Spanien|Sweden=Schweden|Switzerland=Schweiz|Tunisia=Tunesien|Türkiye=Türkei|Turkey=Türkei|Ukraine=Ukraine|United States=USA|USA=USA|Uruguay=Uruguay|Wales=Wales|Internazionale=Inter');
  var COMP = pairs("club friendly=Testspiel|men's international friendly=Testspiel|international friendly=Testspiel|women's international friendly=Testspiel (Frauen)|uefa nations league=Nations League|uefa women's nations league=Nations League (Frauen)|uefa champions league=Champions League|uefa women's champions league=Champions League (Frauen)|uefa europa league=Europa League|uefa conference league=Conference League|uefa europa conference league=Conference League|uefa super cup=Supercup|fifa world cup=WM|fifa women's world cup=WM (Frauen)|fifa club world cup=Klub-WM|uefa european championship=EM|uefa women's european championship=EM (Frauen)|italian serie a=Serie A|german bundesliga=Bundesliga|german 2. bundesliga=2. Bundesliga|german frauen-bundesliga=Frauen-Bundesliga|german dfb pokal=DFB-Pokal|german cup=DFB-Pokal|german supercup=Supercup|spanish laliga=LaLiga|laliga=LaLiga|english premier league=Premier League|french ligue 1=Ligue 1|coppa italia=Coppa Italia|italian supercoppa=Supercoppa", true);
  var GEN = pairs('wcq=WM-Quali|wcqw=WM-Quali (Frauen)|ecq=EM-Quali|ecqw=EM-Quali (Frauen)|fr=Testspiel|frw=Testspiel (Frauen)|group=Gruppe|phase=Ligaphase');
  var german = function () {
    var ha = document.querySelector('home-assistant');
    var h = ha && ha.hass;
    var l = (h && ((h.locale && h.locale.language) || h.language)) || (typeof navigator !== 'undefined' ? navigator.language : '') || '';
    return /^de\b/i.test(l);
  };
  K.name = function (n) { return german() && DE[n] ? DE[n] : (n || ''); };
  /* Nationalteams: statt ESPNs Länderbild eigene Flaggen (mitgeliefert, MIT – assets/flags/LICENSE.md):
     rund im weißen Kreis (Kachel, Gegner, Spielkasten, Ring), rechteckig frei in Tabelle und Form.
     Erkannt am ESPN-Bildnamen (…/countries/500/ita.png) – Datenliste ESPN-Name=ISO-Code. */
  var FLAG = pairs('afg=af|aia=ai|alb=al|alg=dz|and=ad|ang=ao|arg=ar|aru=aw|atg=ag|aus=au|aut=at|aze=az|bah=bs|ban=bd|bdi=bi|bel=be|ben=bj|ber=bm|bhr=bh|bih=ba|bka=bf|blr=by|blz=bz|bol=bo|bot=bw|bra=br|brb=bb|bul=bg|bvr=vg|cam=kh|can=ca|cay=ky|cgo=cg|cha=td|chi=cl|chn=cn|civ=ci|col=co|com=km|cpv=cv|crc=cr|crm=cm|cro=hr|cub=cu|cyp=cy|cze=cz|den=dk|dji=dj|dma=dm|dom=do|ecu=ec|egy=eg|eng=gb-eng|eqg=gq|eri=er|esp=es|est=ee|eth=et|fin=fi|fra=fr|fro=fo|gab=ga|gam=gm|geo=ge|ger=de|gha=gh|gib=gi|gnb=gw|gre=gr|grn=gd|gui=gn|guy=gy|hai=ht|hkg=hk|hon=hn|hun=hu|idn=id|ind=in|irl=ie|irn=ir|irq=iq|isl=is|isr=il|ita=it|jam=jm|jor=jo|jpn=jp|kaz=kz|ken=ke|kgz=kg|korn=kp|kors=kr|kosovo=xk|ksa=sa|kuw=kw|lao=la|lbr=lr|lby=ly|lca=lc|les=ls|lib=lb|lie=li|ltu=lt|lux=lu|lva=lv|mac=mo|mad=mg|mas=my|mda=md|mdv=mv|mex=mx|mgl=mn|mkd=mk|mli=ml|mlt=mt|mor=ma|moz=mz|mri=mu|msr=ms|mtg=me|mtn=mr|mwi=mw|mya=mm|nam=na|nca=ni|ned=nl|nep=np|nga=ng|nig=ne|nir=gb-nir|nor=no|nzl=nz|oma=om|pak=pk|pal=ps|pan=pa|par=py|per=pe|phi=ph|pol=pl|por=pt|qat=qa|rdc=cd|rom=ro|rsa=za|rwa=rw|sba=rs|sco=gb-sct|sen=sn|sey=sc|sin=sg|skn=kn|sle=sl|slv=sv|smr=sm|som=so|sri=lk|sud=sd|sui=ch|sur=sr|svk=sk|svn=si|swe=se|swz=sz|syr=sy|tan=tz|tca=tc|tha=th|tjk=tj|tkm=tm|tmp=tl|tog=tg|tri=tt|tun=tn|tur=tr|uae=ae|uga=ug|ukr=ua|uru=uy|usa=us|uzb=uz|ven=ve|vie=vn|vin=vc|vir=vi|wal=gb-wls|yem=ye|zam=zm');
  K.flag = function (url) {
    var m = /\/countries\/500\/([a-z_-]+)\.png/i.exec(String(url || ''));
    return (m && FLAG[m[1].toLowerCase()]) || null;
  };
  K.img = function (url, shape) {
    var f = K.flag(url);
    return f ? '/casora_assets/flags/' + (shape === 'rect' ? 'rect' : 'round') + '/' + f + '.svg' : (url || '');
  };
  /* Wettbewerb: Teil vor dem Komma („UEFA Champions League, League Phase“), ohne UEFA/FIFA. */
  K.comp = function (n) {
    var s = String(n || '').split(',')[0].trim();
    if (german()) {
      var hit = COMP[s.toLowerCase()];
      if (hit) return hit;
      var w = /women/i.test(s) ? 'w' : '';
      if (/world cup qualifying/i.test(s)) return GEN['wcq' + w];
      if (/european championship qualifying|euro qualifying/i.test(s)) return GEN['ecq' + w];
      if (/friendly/i.test(s)) return GEN['fr' + w];
    }
    return s.replace(/^(UEFA|FIFA) /i, '');
  };
  /* Kürzel ohne Übersetzungstabelle (ein Buchstabe wäre dort für alle Texte gültig). */
  K.abbr = function () {
    return german() ? { W: 'S', D: 'U', L: 'N', gp: 'Sp.', gd: 'Diff.', pts: 'Pkt.' } : { W: 'W', D: 'D', L: 'L', gp: 'P', gd: 'GD', pts: 'Pts' };
  };

  /* Sensor → einheitliche Spieldaten. null, wenn es kein Team-Tracker-Sensor ist. */
  K.is = function (st) {
    var a = st && st.attributes;
    return !!(a && a.sport_path != null && 'team_abbr' in a && 'opponent_abbr' in a);
  };
  /* Team Tracker hängt das Elfmeterschießen an: „1(3)“. */
  var score = function (x) {
    if (x == null || x === '') return { g: null, p: null };
    var m = /^\s*(\d+)\s*\((\d+)\)\s*$/.exec(String(x));
    return m ? { g: m[1], p: m[2] } : { g: String(x), p: null };
  };
  K.info = function (st) {
    if (!K.is(st)) return null;
    var a = st.attributes, s = String(a.state || st.state || '').toUpperCase();
    var d = a.date ? new Date(a.date) : null;
    if (d && isNaN(d)) d = null;
    var clock = String(a.clock || '');
    var phase = s === 'IN' || s === 'POST' || s === 'PRE' ? s : (s === 'BYE' ? 'BYE' : 'NONE');
    /* Verschoben/abgesagt meldet ESPN als „post“ mit 0:0 – eigene Phase ohne Spielstand. */
    var off = (phase === 'POST' || phase === 'PRE') && /postpon|cancel|abandon|suspend|\bppd\b|\babd\b/i.test(clock)
      ? (/cancel|abandon|\babd\b/i.test(clock) ? 'cancel' : 'postpone') : null;
    if (off) phase = 'OFF';
    var ts = score(a.team_score), os = score(a.opponent_score);
    var lc = st.last_changed ? new Date(st.last_changed) : null;
    return {
      id: st.entity_id, phase: phase, off: off, tbd: phase === 'PRE' && /^\s*TBD\s*$/i.test(clock),
      sport: a.sport_path || a.sport || '', league: a.league_path || '', leagueName: K.comp(a.league_name || ''),
      event: a.event_id || null, date: d, home: a.team_homeaway === 'home', changed: lc && !isNaN(lc) ? lc : null,
      team: { id: String(a.team_id || ''), name: a.team_name || a.team_long_name || '', abbr: a.team_abbr || '', logo: a.team_logo || '', score: ts.g, pens: ts.p },
      opp: { id: String(a.opponent_id || ''), name: a.opponent_name || a.opponent_long_name || '', abbr: a.opponent_abbr || '', logo: a.opponent_logo || '', score: os.g, pens: os.p },
      clock: clock, venue: a.venue || '', location: a.location || '',
      aet: phase === 'POST' && /\bAET\b|extra time/i.test(clock),
    };
  };
  /* „67'“, „45'+2'“, „HT“ … aus dem clock-Attribut; vor dem Spiel steht dort ein US-Datum. */
  K.minute = function (c) {
    c = String(c || '').trim();
    if (/^(HT|Halftime|Half ?time)$/i.test(c)) return 'Halbzeit';
    if (/pen|shootout/i.test(c)) return 'Elfmeterschießen';
    if (/^ET\b|extra/i.test(c)) return 'Verlängerung';
    if (/delay|susp/i.test(c)) return 'Unterbrochen';
    if (/^(FT|Full ?time|Final)/i.test(c)) return 'Endstand';
    var m = /^(\d+)'?(\+\d+)?'?$/.exec(c);
    return m ? m[1] + (m[2] || '') + '′' : '';
  };
  K.when = function (d, now) {
    if (!d) return '';
    var n = diffDays(d, now);
    if (n === 0) return 'Heute';
    if (n === 1) return 'Morgen';
    if ((n > 1 && n < 7) || (n < 0 && n > -7)) return DAYS[d.getDay()];
    return DAYS[d.getDay()] + ' ' + dm(d);
  };
  /* Popup: immer mit Datum („So 11.10.“), nur heute/morgen als Wort. */
  K.day = function (d, now) {
    if (!d) return '';
    var n = diffDays(d, now);
    return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : DAYS[d.getDay()] + ' ' + dm(d);
  };
  K.until = function (d, now) {
    if (!d) return '';
    now = now || new Date();
    var n = diffDays(d, now), ms = d.getTime() - now.getTime();
    /* Am Spieltag zählt die Ecke herunter – „Heute“ steht schon im Text. */
    if (n <= 0) return ms <= 60000 ? 'Gleich' : ms < H ? 'in ' + Math.ceil(ms / 60000) + ' Min.' : 'in ' + Math.round(ms / H) + ' Std.';
    if (n === 1) return 'Morgen';
    if (n < 14) return 'in ' + n + ' Tagen';
    if (n < 60) return 'in ' + Math.round(n / 7) + ' Wochen';
    return 'in ' + Math.round(n / 30) + ' Monaten';
  };
  var vs = function (i, abbr) { return (i.home ? 'gegen ' : 'bei ') + (abbr ? i.opp.abbr : K.name(i.opp.name)); };
  var num = function (x) { return x == null ? '–' : x; };
  /* Heim zuerst – so steht ein Ergebnis im deutschen Fußball. */
  var homeAway = function (i) {
    var hT = i.home ? i.team : i.opp, aT = i.home ? i.opp : i.team;
    return { hT: hT, aT: aT, txt: num(hT.score) + ':' + num(aT.score) };
  };

  /* Kachel: Zustandszeile (kicker-Stil: eigenes Team zuerst nur mit Sieg/Niederlage/führt) und Ecke rechts oben.
     small: kleine Handy-Kachel ohne Ecke, nur Platz für ~15 Zeichen – Spielstand Heim:Gast (der Gegner
     steht als Wappen am Symbol), dazu Minute bzw. Endstand; vor dem Spiel nur Tag und Anstoß.
     short: Handy (auch „groß“ – dort doppelt so hoch, aber nicht breiter): Gegner als Kürzel. */
  K.tile = function (st, now, small, short) {
    short = short || small;
    var i = K.info(st);
    if (!i) return st ? 'Kein Team-Tracker-Sensor' : '';
    var my = Number(i.team.score), th = Number(i.opp.score), my2 = i.team.score + ':' + i.opp.score;
    if (i.phase === 'OFF') return (i.off === 'cancel' ? 'Abgesagt' : 'Verschoben') + ' · ' + vs(i, short);
    if (i.phase === 'IN' || i.phase === 'POST') {
      if (i.team.score == null || i.opp.score == null) return vs(i, short);
      if (small) {
        var ha = homeAway(i);
        if (i.phase === 'IN') return (K.minute(i.clock) ? K.minute(i.clock) + ' · ' : '') + ha.txt;
        return ha.txt + ' · ' + (diffDays(i.date, now) === 0 ? 'Endstand' : K.day(i.date, now));
      }
      var v = vs(i, short);
      if (i.phase === 'IN') return my > th ? 'führt ' + my2 + ' ' + v : my < th ? 'liegt ' + my2 + ' zurück ' + v : my2 + ' ' + v;
      if (i.team.pens != null && i.opp.pens != null) return (Number(i.team.pens) > Number(i.opp.pens) ? 'Sieg' : 'Niederlage') + ' i. E. ' + v;
      if (my === th) return my2 + ' ' + v;
      return my2 + (my > th ? '-Sieg ' : '-Niederlage ') + (i.aet ? 'n. V. ' : '') + v;
    }
    if (i.phase === 'PRE' && i.date) return K.when(i.date, now) + (i.tbd ? '' : ' ' + hm(i.date)) + (small ? '' : ' · ' + vs(i, short));
    return 'Kein Spiel angesetzt';
  };
  /* Zustandszeile der Kachel: immer einzeilig in der normalen Schriftgröße, damit der Name auf derselben
     Höhe steht wie bei Licht & Co. (casoraStateFit würde am Desktop schrumpfen und notfalls zweizeilig
     umbrechen – das schob den Namen nach oben). Zu lang: Gegner als Kürzel, sonst „…“. */
  K.state = function (st, small, phone, now) {
    var t = K.tile(st, now, small, phone);
    if (!phone && t.length > 26) t = K.tile(st, now, false, true);
    return '<span data-casora-clip style="display:inline-block;vertical-align:top;max-width:calc(100cqi - '
      + 'var(--casora-tile-state-inset, 0px));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(t) + '</span>';
  };
  K.corner = function (st, now) {
    var i = K.info(st);
    if (!i) return '';
    if (i.phase === 'IN') {
      var m = K.minute(i.clock);
      return '<span class="cfb-pill live"><i></i>' + esc(m || 'Live') + '</span>';
    }
    if (i.phase === 'OFF') return '<span class="cfb-pill">' + (i.off === 'cancel' ? 'Abgesagt' : 'Verschoben') + '</span>';
    /* Endstand nur am Spieltag, danach der Tag des Spiels. */
    if (i.phase === 'POST' && i.date) return '<span class="cfb-pill">' + esc(diffDays(i.date, now) === 0 ? 'Endstand' : K.when(i.date, now)) + '</span>';
    if (i.phase === 'PRE' && i.date) return '<span class="cfb-pill">' + esc(i.tbd ? 'Uhrzeit offen' : K.until(i.date, now)) + '</span>';
    return '';
  };
  K.live = function (st) { var i = K.info(st); return !!(i && i.phase === 'IN'); };

  /* Sichtbarkeit (variables.show_when_match):
       always   – immer (Standard)
       week     – ab 7 Tage vor dem Spiel
       matchday – am Spieltag
       around   – ab X Std. vor Anpfiff (hours_before, Standard 3)
       live     – nur während des Spiels
     Nach dem Spiel (außer „live“) bleibt das Ergebnis stehen: hours_after Std. nach Spielende, ohne
     Angabe bis 12 Uhr am Tag nach dem Spiel. Spielende = Wechsel auf POST (last_changed), sonst Anpfiff
     + 2 Std. (n. V./i. E. + 3 Std.). Team Tracker bleibt auf POST, bis das nächste Spiel keine 12 Std.
     mehr entfernt ist – das nächste Spiel kommt deshalb aus ESPNs Teamseite (K.nextDate, 1 Std. gemerkt). */
  var hrs = function (v, def) { var n = Number(v); return v !== '' && v != null && isFinite(n) && n >= 0 ? n : def; };
  K.ended = function (i) {
    var kick = i.date.getTime(), est = kick + ((i.aet || i.team.pens != null) ? 3 : 2) * H;
    var c = i.changed && i.changed.getTime();
    return c && c > kick + 1.5 * H && c < kick + 4 * H ? c : est;
  };
  var before = function (date, mode, variables, now) {
    if (mode === 'matchday') return diffDays(date, now) <= 0;
    if (mode === 'week') return diffDays(date, now) < 7;
    if (mode === 'around') return now.getTime() >= date.getTime() - hrs(variables.hours_before, 3) * H;
    return true;
  };
  K.shows = function (st, variables, now) {
    variables = variables || {};
    var mode = String(variables.show_when_match || 'always');
    if (mode === 'always') return true;
    var i = K.info(st);
    if (!i) return true;
    if (i.phase === 'IN') return true;
    if (mode === 'live' || !i.date) return false;
    now = now || new Date();
    if (i.phase === 'PRE') return before(i.date, mode, variables, now);
    if (i.phase === 'POST' || i.phase === 'OFF') {
      var end = i.phase === 'OFF' ? i.date.getTime() : K.ended(i);
      var noon = day0(i.date); noon.setDate(noon.getDate() + 1); noon.setHours(12);
      var until = variables.hours_after !== undefined && variables.hours_after !== '' && variables.hours_after !== null
        ? end + hrs(variables.hours_after, 3) * H : Math.max(noon.getTime(), end + H);
      if (now.getTime() <= until) return true;
      var nx = K.nextDate(i);
      return !!(nx && nx > now && before(nx, mode, variables, now));
    }
    return false;
  };
  K.hidden = function (st, variables, now) { return !K.shows(st, variables, now); };

  /* ── ESPN-Antworten → Tabelle und Form ── */
  var statOf = function (e) {
    var o = {};
    (e.stats || []).forEach(function (s) {
      var k = s.abbreviation || s.name, v = s.displayValue != null ? s.displayValue : s.value;
      o[k] = v; if (s.name) o[s.name] = v;
    });
    return o;
  };
  /* Zonen aus ESPNs note.description. Unbekanntes bekommt keine Farbe (nicht „Europa“).
     Relegation nur, wenn höchstens zwei Teams sie tragen – in Österreich/Belgien heißt so eine ganze Runde. */
  K.zone = function (desc, count) {
    var d = String(desc || '');
    if (!d || /eliminat/i.test(d)) return null;
    if (/champions league/i.test(d)) return 'cl';
    if (/europa league/i.test(d)) return 'eu';
    if (/conference/i.test(d)) return 'ecl';
    if (/relegation play/i.test(d)) return count > 2 ? null : 'rpo';
    if (/relegat/i.test(d)) return 'down';
    if (/promotion play/i.test(d)) return 'ppo';
    if (/promot/i.test(d)) return 'up';
    if (/championship/i.test(d)) return 'adv';
    if (/play-?off/i.test(d)) return 'po';
    if (/round of|quarter|semi|qualif|advance/i.test(d)) return 'adv';
    return null;
  };
  var ZL = { de: pairs('cl=Champions League|eu=Europa League|ecl=Conference League|rpo=Relegation|down=Abstieg|ppo=Aufstiegsrelegation|up=Aufstieg|po=Play-offs|adv=Weiter|r16=Achtelfinale|qf=Viertelfinale|ch=Meisterrunde'),
    en: pairs('cl=Champions League|eu=Europa League|ecl=Conference League|rpo=Relegation play-off|down=Relegation|ppo=Promotion play-off|up=Promotion|po=Play-offs|adv=Qualified|r16=Round of 16|qf=Quarter-finals|ch=Championship round') };
  K.zoneLabel = function (zone, desc) {
    var L = german() ? ZL.de : ZL.en, d = String(desc || '');
    if (zone === 'adv') {
      if (/round of 16/i.test(d)) return L.r16;
      if (/quarter|\bQFs?\b/i.test(d)) return L.qf;
      if (/championship/i.test(d)) return L.ch;
    }
    return L[zone] || '';
  };
  /* Nations League: ein Hinweis für alle Ligen („A: Qualifies for QFs; B-D: Promotion playoffs“) –
     nur der Teil der eigenen Liga (Buchstabe der Gruppe), sonst keiner. */
  K.noteFor = function (desc, letter) {
    var d = String(desc || '');
    if (!letter || !/^[A-Z](\s*[-,]\s*[A-Z])*\s*:/.test(d)) return d || null;
    var hit = null;
    d.split(';').forEach(function (part) {
      var m = /^\s*([A-Z](?:\s*[-,]\s*[A-Z])*)\s*:\s*(.+)$/.exec(part);
      if (!m || hit) return;
      m[1].split(',').forEach(function (r) {
        var x = r.trim().split('-'), a = x[0].trim(), b = (x[1] || a).trim();
        if (letter >= a && letter <= b) hit = m[2].trim();
      });
    });
    return hit;
  };
  /* Gruppenname ohne Saison/„Standings“; Gruppe/Ligaphase auf Deutsch. */
  K.groupName = function (n) {
    var s = String(n || '').trim();
    if (!s || /standings|tabelle|\d{4}/i.test(s)) return '';
    if (german()) s = s.replace(/^Group\b/i, GEN.group).replace(/^League Phase$/i, GEN.phase);
    return s;
  };
  /* Eine Zeile aus beiden Formen: standings (team als Objekt, stats per name) oder
     Spielübersicht (team als Name, id/logo daneben, stats per Abkürzung). */
  var rowOf = function (e) {
    var s = statOf(e), t = e.team && typeof e.team === 'object' ? e.team : null;
    var logo = t ? ((t.logos || [])[0] || {}).href : ((e.logo || [])[0] || {}).href;
    var note = e.note && e.note.description ? e.note.description : null;
    return {
      id: String(t ? t.id : e.id), name: t ? (t.displayName || t.shortDisplayName || t.name) : String(e.team || ''), logo: logo || '',
      rank: Number(s.rank || s.R) || 0, gp: s.gamesPlayed || s.GP || '0', gd: s.pointDifferential || s.GD || '0',
      pts: s.points || s.P || '0', note: note, zone: null,
      w: s.wins != null ? s.wins : s.W, t: s.ties != null ? s.ties : s.D, l: s.losses != null ? s.losses : s.L,
      gf: s.pointsFor != null ? s.pointsFor : null, ga: s.pointsAgainst != null ? s.pointsAgainst : null,
    };
  };
  var groupsOf = function (j) {
    if (!j) return [];
    if (j.children && j.children.length) return j.children.map(function (c) { return { name: c.name || c.abbreviation || '', entries: ((c.standings || {}).entries) || [] }; });
    if (j.standings && j.standings.entries) return [{ name: j.name || '', entries: j.standings.entries }];
    var sg = j.standings && j.standings.groups;
    if (sg) return sg.map(function (g) { return { name: g.header || '', entries: ((g.standings || {}).entries) || [] }; });
    return [];
  };
  /* Tabelle mit dem eigenen Team (bei mehreren Gruppen die Gruppe des Teams). */
  K.table = function (standings, summary, teamId) {
    var pick = function (gs) {
      gs = gs.filter(function (g) { return g.entries.length; });
      for (var n = 0; n < gs.length; n++) {
        if (gs[n].entries.some(function (e) { return rowOf(e).id === String(teamId); })) return gs[n];
      }
      return null;
    };
    var g = pick(groupsOf(standings)) || pick(groupsOf(summary));
    if (!g) return null;
    var rows = g.entries.map(rowOf).sort(function (a, b) { return (a.rank || 99) - (b.rank || 99); });
    var cnt = {}, letter = (/^Group ([A-Z])\d*$/i.exec(String(g.name).trim()) || [])[1];
    rows.forEach(function (r, n) {
      if (!r.rank) r.rank = n + 1;
      r.note = K.noteFor(r.note, letter && letter.toUpperCase());
      if (r.note) cnt[r.note] = (cnt[r.note] || 0) + 1;
    });
    rows.forEach(function (r) { r.zone = K.zone(r.note, cnt[r.note] || 0); });
    return { name: K.groupName(g.name), rows: rows };
  };
  /* Form: neueste zuerst. Testspiele nur, wenn sonst keine drei Pflichtspiele übrig bleiben. */
  K.form = function (summary, teamId) {
    var t = ((summary && summary.lastFiveGames) || []).filter(function (x) { return x.team && String(x.team.id) === String(teamId); })[0];
    if (!t) return [];
    var all = (t.events || []).map(function (ev) {
      var home = String(ev.homeTeamId) === String(teamId);
      var my = home ? ev.homeTeamScore : ev.awayTeamScore, their = home ? ev.awayTeamScore : ev.homeTeamScore;
      if (my == null || their == null) {
        var p = String(ev.score || '').split('-').map(Number), hi = Math.max(p[0], p[1]), lo = Math.min(p[0], p[1]);
        my = ev.gameResult === 'L' ? lo : hi; their = ev.gameResult === 'L' ? hi : lo;
      }
      var o = ev.opponent || {}, ln = ev.leagueName || ev.leagueAbbreviation || '';
      return { res: ev.gameResult || '', my: String(my), their: String(their), home: ev.atVs !== '@', date: ev.gameDate ? new Date(ev.gameDate) : null,
        pens: String(my) === String(their) && /^[WL]$/.test(ev.gameResult || ''), friendly: /friendly/i.test(ln),
        opp: o.displayName || o.abbreviation || '', logo: o.logo || ((o.logos || [])[0] || {}).href || '', comp: K.comp(ln) };
    }).reverse();
    var real = all.filter(function (x) { return !x.friendly; });
    return real.length >= 3 ? real : all;
  };
  /* Letzte direkte Duelle (ESPN seasonseries „head-to-head“, neueste zuerst), aus eigener Sicht.
     Nur beendete Spiele; Wettbewerb ohne Saison davor („2025-26 Italian Serie A“). */
  K.duels = function (summary, teamId) {
    var ser = ((summary && summary.seasonseries) || []).filter(function (x) { return /head/i.test(x.type || ''); })[0];
    if (!ser) return [];
    return (ser.events || []).map(function (ev) {
      var cs = ev.competitors || [], me = cs.filter(function (c) { return c.team && String(c.team.id) === String(teamId); })[0];
      var th = cs.filter(function (c) { return c !== me; })[0];
      var st = typeof ev.status === 'string' ? ev.status : ((ev.statusType || ev.status || {}).state || '');
      if (!me || !th || st !== 'post' || me.score == null || th.score == null) return null;
      var my = Number(me.score), their = Number(th.score);
      var res = my > their ? 'W' : my < their ? 'L' : me.winner ? 'W' : th.winner ? 'L' : 'D';
      var d = ev.date ? new Date(ev.date) : null;
      return { res: res, my: String(me.score), their: String(th.score), home: me.homeAway === 'home', pens: my === their && res !== 'D',
        date: d && !isNaN(d) ? d : null, comp: K.comp(String(ev.competitionName || '').replace(/^\d{4}(-\d{2,4})?\s+/, '')) };
    }).filter(Boolean);
  };
  /* Heim-/Auswärtsbilanz von ESPNs Teamseite (record.items[total].stats). */
  K.record = function (teamJson) {
    var it = ((((teamJson || {}).team || {}).record || {}).items || []).filter(function (x) { return x.type === 'total'; })[0];
    if (!it) return null;
    var o = {};
    (it.stats || []).forEach(function (x) { o[x.name] = x.value; });
    var part = function (p) {
      return o[p + 'GamesPlayed'] ? { w: o[p + 'Wins'] || 0, t: o[p + 'Ties'] || 0, l: o[p + 'Losses'] || 0, gf: o[p + 'PointsFor'], ga: o[p + 'PointsAgainst'] } : null;
    };
    return { home: part('home'), away: part('away') };
  };
  /* Tabellenausschnitt: Spitze (3), um das eigene Team (±2), Gegner, Ende (2); dazwischen Lücken. */
  K.window = function (rows, me, opp, full) {
    if (full || rows.length <= 10) return rows.slice();
    var mi = -1, oi = -1;
    rows.forEach(function (r, n) { if (r.id === String(me)) mi = n; if (r.id === String(opp)) oi = n; });
    var keep = {};
    [0, 1, 2, rows.length - 2, rows.length - 1, oi].forEach(function (n) { if (n >= 0) keep[n] = 1; });
    for (var k = mi - 2; k <= mi + 2; k++) if (k >= 0 && k < rows.length) keep[k] = 1;
    var out = [], gap = false;
    rows.forEach(function (r, n) {
      if (keep[n]) { out.push(r); gap = false; } else if (!gap) { out.push(null); gap = true; }
    });
    return out;
  };

  /* ── Laden (je Spiel gemerkt; während des Spiels öfter) ── */
  var getJson = function (url) {
    try { return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
    catch (e) { return Promise.reject(e); }
  };
  var path = function (x) { return encodeURIComponent(x); };
  K.key = function (i) { return i ? [i.sport, i.league, i.event, i.team.id].join('|') : ''; };
  K.load = function (i, force) {
    if (!i || !i.sport || !i.team.id || typeof fetch !== 'function') return;
    var key = K.key(i), d = K.data[key];
    if (K.busy[key] || (!force && d && Date.now() - d.ts < (i.phase === 'IN' ? TTL_LIVE : TTL))) return;
    K.busy[key] = true;
    var league = i.league || 'all';
    var sum = i.event ? getJson(API + '/site/v2/sports/' + path(i.sport) + '/' + path(league) + '/summary?event=' + path(i.event)).catch(function () { return null; })
      : Promise.resolve(null);
    /* Tabelle: eigene Liga; bei „all“ die Liga des Spiels (Nations League, Champions League …). */
    var tab = sum.then(function (s) {
      var slug = league !== 'all' ? league : (((s || {}).header || {}).league || {}).slug;
      return slug && slug !== 'all' ? getJson(API + '/v2/sports/' + path(i.sport) + '/' + path(slug) + '/standings').catch(function () { return null; }) : null;
    });
    /* Heim/Auswärts nur für die Saisonbilanz (Variante C) – eigene Liga, nicht bei „all“. */
    var rec = K.fill() === 'c' && league !== 'all' ? getJson(API + '/site/v2/sports/' + path(i.sport) + '/' + path(league) + '/teams/' + path(i.team.id)).catch(function () { return null; }) : null;
    Promise.all([sum, tab, rec]).then(function (r) {
      K.data[key] = { ts: Date.now(), err: !r[0] && !r[1] && !!i.event, table: K.table(r[1], r[0], i.team.id), form: K.form(r[0], i.team.id),
        duels: K.duels(r[0], i.team.id), oppForm: i.opp.id ? K.form(r[0], i.opp.id) : [], record: K.record(r[2]) };
    }).catch(function () { K.data[key] = { ts: Date.now(), err: true, table: null, form: [] }; })
      .then(function () { K.busy[key] = false; K.repaint(); });
  };
  /* Nächstes Spiel des Teams (für die Sichtbarkeit nach dem Spiel), 1 Std. gemerkt. Danach Kacheln neu zeichnen. */
  K.nextDate = function (i) {
    var key = i.sport + '|' + i.league + '|' + i.team.id, c = K.next[key];
    if (c && Date.now() - c.ts < TTL_NEXT) return c.date;
    if (c && c.busy) return c.date;
    if (typeof fetch !== 'function') return c ? c.date : null;
    K.next[key] = { ts: 0, busy: true, date: c ? c.date : null };
    getJson(API + '/site/v2/sports/' + path(i.sport) + '/' + path(i.league || 'all') + '/teams/' + path(i.team.id))
      .then(function (j) {
        var ev = (((j || {}).team || {}).nextEvent || [])[0], d = ev && ev.date ? new Date(ev.date) : null;
        K.next[key] = { ts: Date.now(), date: d && !isNaN(d) ? d : null };
      }).catch(function () { K.next[key] = { ts: Date.now(), date: null }; })
      .then(kickTiles);
    return c ? c.date : null;
  };

  /* ── Zeichnen ── */
  var find = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) find(n.shadowRoot, sel, out); });
    return out;
  };
  var kickTiles = function () {
    var ha = document.querySelector('home-assistant');
    if (!ha || !window.casoraKick) return;
    find(ha.shadowRoot, 'button-card').forEach(function (el) {
      var c = el._config;
      if (c && typeof c.hidden === 'string' && c.hidden.indexOf('_casoraFootball') !== -1) window.casoraKick(el);
    });
  };
  K.repaint = function () {
    var ha = document.querySelector('home-assistant');
    var S = ha && ha.hass && ha.hass.states;
    if (!S || !K._id || !S[K._id]) return;
    ['hero', 'match', 'table', 'form'].forEach(function (k) {
      find(ha.shadowRoot, '.cfb-' + k).forEach(function (n) {
        n.innerHTML = (window.casoraTr || function (x) { return x; })(K.html(k, S[K._id]));
      });
    });
    K.fitSoon();
  };
  var UIT = function () { return (window._casoraUI && window._casoraUI.tokens) || { ink: '#fff', ink2: 'rgba(255,255,255,0.56)', ink3: 'rgba(255,255,255,0.42)', font: 'system-ui' }; };
  var SOFT = function () { return !!(window._casoraHH && window._casoraHH.on()); };
  var head = function (t, right, inner) {
    var T = UIT();
    if (SOFT()) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:' + (inner ? '0 0 12px' : '0 6px 10px') + ';min-height:20px;">'
        + '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--casora-soft-label, var(--secondary-text-color));text-align:left;">'
        + t + '</div>' + (right || '') + '</div>';
    }
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 0 10px;">'
      + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');text-align:left;">' + t + '</div>' + (right || '') + '</div>';
  };
  /* Weich: Sand-Pillen wie Kalender/Pflanze; sonst die Glas-Platten der anderen Popups.
     Tabelle und Form im selben Raster: Zeilen 44 px, Abstand 6 px; die Form beginnt auf Höhe der ersten Tabellenzeile. */
  var CSS = function () {
    var T = UIT(), soft = SOFT();
    var row = soft ? 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))' : 'var(--casora-popup-row-fill, rgba(255,255,255,0.10))';
    var sub = soft ? 'var(--casora-soft-sub, ' + T.ink2 + ')' : T.ink2;
    var on = soft ? 'var(--casora-soft-seg-on, #FFFDF9)' : 'rgba(255,255,255,0.16)';
    var onSh = soft ? 'var(--casora-soft-seg-on-shadow, none)' : 'none';
    var onInk = soft ? 'var(--casora-soft-seg-on-ink, ' + T.ink + ')' : T.ink;
    var rad = 'var(--casora-popup-row-radius, 24px)';
    var crestBg = 'var(--casora-football-crest-bg, #fff)';
    var hair = 'var(--casora-football-flag-hair, rgba(0,0,0,0.14))';
    var plate = soft ? '' : 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);';
    return '<style>'
      + '.cfb{font-family:' + T.font + ';text-align:left;color:' + T.ink + ';}'
      + '.cfb-m{background:' + row + ';border-radius:calc(' + rad + ' + 4px);padding:18px 22px 20px;' + plate + '}'
      + '.cfb-mr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto) minmax(0,1fr);align-items:start;gap:10px;}'
      + '@media (min-width:761px){.cfb-mr{grid-template-columns:minmax(0,1fr) 200px minmax(0,1fr);}}'
      + '.cfb-sd{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;text-align:center;}'
      + '.cfb-sd b{font-size:15px;font-weight:600;line-height:1.2;max-width:100%;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:break-word;hyphens:auto;-webkit-hyphens:auto;}'
      + '.cfb-sd small{font-size:12px;font-weight:500;color:' + T.ink3 + ';}'
      + '.cfb-cr{width:60px;height:60px;border-radius:50%;background:' + crestBg + ';display:grid;place-items:center;flex:none;box-shadow:0 0 0 1px var(--casora-football-crest-ring, rgba(58,50,43,0.06));}'
      + '.cfb-cr img{width:66%;height:66%;object-fit:contain;}'
      + '.cfb-cr.fl img{width:73%;height:73%;border-radius:50%;box-shadow:0 0 0 .5px ' + hair + ';}'
      + '.cfb-mid{text-align:center;max-width:104px;align-self:center;}'
      + '@media (min-width:761px){.cfb-mid{max-width:none;}}'
      + '.cfb-big{font-size:clamp(28px,4vw,36px);font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;line-height:1.1;white-space:nowrap;}'
      + '.cfb-big.live{color:var(--casora-color-red, #D35A4E);}'
      + '.cfb-sub{font-size:13.5px;color:' + sub + ';margin-top:3px;}'
      + '.cfb-sub span+span::before{content:" · ";}'
      /* Schmal: Spielkasten mit weniger Rand, Unterzeile der Mitte untereinander statt „· Heute“ am Zeilenanfang. */
      + '@media (max-width:520px){.cfb-m{padding:16px 14px 18px;}.cfb-mr{gap:6px;}.cfb-sub span{display:block;}.cfb-sub span+span::before{content:none;}}'
      + '.cfb-meta{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:14px;}'
      + '.cfb-chip{font-size:12.5px;font-weight:500;color:' + sub + ';background:' + (soft ? 'var(--casora-soft-surface, #F8F5EF)' : 'rgba(255,255,255,0.08)') + ';padding:6px 11px;border-radius:999px;}'
      + '.cfb-t{display:flex;flex-direction:column;gap:6px;}'
      + '.cfb-r{position:relative;display:grid;grid-template-columns:24px 24px minmax(0,1fr) 30px 40px 36px;align-items:center;gap:8px;min-height:44px;padding:0 14px 0 16px;border-radius:' + rad + ';background:' + row + ';font-size:14.5px;font-variant-numeric:tabular-nums;}'
      + '.cfb-r.h{background:none;min-height:18px;font-size:11px;font-weight:600;letter-spacing:.04em;color:' + T.ink3 + ';}'
      + '.cfb-r.me{background:' + on + ';box-shadow:' + onSh + ';color:' + onInk + ';}'
      + '.cfb-r .k{color:' + sub + ';font-weight:600;text-align:center;}'
      + '.cfb-r.me .k,.cfb-r.me .c{color:inherit;opacity:.62;}'
      + '.cfb-r img{width:22px;height:22px;object-fit:contain;}'
      + '.cfb-r img.fl,.cfb-f img.fl{width:20px;height:15px;justify-self:center;object-fit:cover;border-radius:3px;box-shadow:0 0 0 .5px ' + hair + ';}'
      + '.cfb-r .n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '.cfb-r .n em{font-style:normal;font-size:11px;font-weight:600;color:var(--primary-color, #B67A50);margin-left:7px;}'
      /* Schmal: das Etikett „nächster Gegner“ würde den Namen abschneiden – dort ein Punkt vor dem Namen. */
      + '@media (max-width:520px){.cfb-r{grid-template-columns:20px 22px minmax(0,1fr) 22px 34px 28px;gap:6px;padding:0 12px 0 14px;}.cfb-r .n em{display:none;}.cfb-r.opp .n::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--primary-color, #B67A50);margin-right:6px;vertical-align:middle;}}'
      + '.cfb-r .c{text-align:right;color:' + sub + ';}.cfb-r .p{text-align:right;font-weight:700;}'
      + '.cfb-r[data-z]::before{content:"";position:absolute;left:7px;top:14px;bottom:14px;width:3px;border-radius:2px;}'
      + '.cfb-r[data-z=cl]::before,.cfb-lg i.cl{background:var(--casora-color-teal, #4E9E95);}'
      + '.cfb-r[data-z=eu]::before,.cfb-lg i.eu,.cfb-r[data-z=po]::before,.cfb-lg i.po{background:var(--casora-color-orange, #DE8A4E);}'
      + '.cfb-r[data-z=ecl]::before,.cfb-lg i.ecl{background:var(--casora-color-sand, #9A8672);}'
      + '.cfb-r[data-z=up]::before,.cfb-lg i.up,.cfb-r[data-z=adv]::before,.cfb-lg i.adv{background:var(--casora-color-green, #6AAE78);}'
      + '.cfb-r[data-z=ppo]::before,.cfb-lg i.ppo{background:color-mix(in srgb, var(--casora-color-green, #6AAE78) 55%, transparent);}'
      + '.cfb-r[data-z=rpo]::before,.cfb-lg i.rpo{background:var(--casora-color-deep-orange, #C8693F);}'
      + '.cfb-r[data-z=down]::before,.cfb-lg i.down{background:var(--casora-color-red, #D35A4E);}'
      + '.cfb-gap{text-align:center;color:' + T.ink3 + ';font-size:16px;line-height:10px;height:12px;}'
      + '.cfb-more{align-self:flex-start;margin:6px 0 0 6px;font-size:13.5px;font-weight:600;color:' + T.ink + ';background:' + row + ';border-radius:999px;display:inline-flex;align-items:center;box-sizing:border-box;min-height:44px;padding:0 18px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;transition:opacity .15s;}'
      /* Trefferfläche 44 px; Tipp-Rückmeldung wie die Zeilen. */
      + '.cfb-more:active{opacity:.6;}'
      + '.cfb-lg{display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 6px 0;font-size:12px;color:' + T.ink3 + ';}'
      + '.cfb-lg span{display:inline-flex;align-items:center;}'
      + '.cfb-lg i{display:inline-block;width:3px;height:10px;border-radius:2px;margin-right:6px;}'
      + '.cfb-fl{display:flex;flex-direction:column;gap:6px;}'
      + '@media (min-width:761px){.cfb-fl{padding-top:24px;}}'
      + '.cfb-f{display:grid;grid-template-columns:28px 22px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:44px;padding:4px 14px 4px 8px;border-radius:' + rad + ';background:' + row + ';font-size:14.5px;}'
      + '.cfb-res{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:12.5px;}'
      + '.cfb-res.W{background:var(--casora-color-green, #6AAE78);}.cfb-res.D{background:var(--casora-color-sand, #9A8672);}.cfb-res.L{background:var(--casora-color-red, #D35A4E);}'
      + '.cfb-f img{width:22px;height:22px;object-fit:contain;}'
      + '.cfb-f .o{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;}'
      + '.cfb-f .o small{display:block;font-weight:500;font-size:12px;color:' + sub + ';}'
      + '.cfb-f .s{font-weight:700;font-variant-numeric:tabular-nums;text-align:right;}'
      + '.cfb-f .s small{display:block;font-weight:500;font-size:11px;color:' + sub + ';}'
      + '.cfb-e{background:' + row + ';border-radius:' + rad + ';padding:16px;font-size:14px;font-weight:500;color:' + sub + ';}'
      /* Unter der Form: ein Kasten (wie der Spielkasten), der am Desktop bis zur Unterkante der Tabelle reicht (K.fit).
         Zeilen ohne eigene Fläche, mit Haarlinie; Kreise und Ergebnisse fluchten mit den Formzeilen (links 8, rechts 14 px). */
      + '.cfb-x{display:flex;flex-direction:column;box-sizing:border-box;margin-top:var(--casora-popup-sec-gap, 18px);background:' + row + ';border-radius:calc(' + rad + ' + 4px);padding:16px 14px 6px 8px;' + plate + '}'
      + '.cfb-x[hidden],.cfb-x [hidden]{display:none !important;}'
      + '.cfb-xh{padding-left:6px;}'
      + '.cfb-xb{display:flex;flex-direction:column;flex:1 1 auto;}'
      + '.cfb-xl{flex:1 1 auto;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;min-height:48px;font-size:14.5px;}'
      + '.cfb-xl.c{grid-template-columns:28px 22px minmax(0,1fr) auto;}'
      + '.cfb-xl.v{grid-template-columns:minmax(0,1fr) auto;padding-left:6px;}'
      + '.cfb-xl+.cfb-xl{border-top:1px solid var(--casora-popup-divider, ' + (soft ? 'rgba(120,100,80,0.10)' : 'rgba(255,255,255,0.08)') + ');}'
      + '.cfb-xl img{width:22px;height:22px;object-fit:contain;}'
      + '.cfb-xl .o{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;}'
      + '.cfb-xl .o small{display:block;font-weight:500;font-size:12px;color:' + sub + ';}'
      + '.cfb-xl .s{font-weight:700;font-variant-numeric:tabular-nums;text-align:right;}'
      + '.cfb-xl .s small{display:block;font-weight:500;font-size:11px;color:' + sub + ';}'
      + '</style>';
  };
  var crest = function (url) {
    var fl = !!K.flag(url);
    return '<div class="cfb-cr' + (fl ? ' fl' : '') + '">' + (url ? '<img src="' + esc(K.img(url, 'round')) + '" alt="" loading="lazy">' : '') + '</div>';
  };
  /* Kleines Bild in Tabelle und Form: Wappen frei, Flagge als Rechteck mit Haarlinie. */
  var mini = function (url) {
    if (!url) return '<span></span>';
    return '<img' + (K.flag(url) ? ' class="fl"' : '') + ' src="' + esc(K.img(url, 'rect')) + '" alt="" loading="lazy">';
  };

  K.html = function (k, st) {
    var i = K.info(st);
    if (!i) return k === 'hero' ? '<div class="cfb-e">Kein Team-Tracker-Sensor</div>' : '';
    var d = K.data[K.key(i)], tab = d && d.table, me = tab && tab.rows.filter(function (r) { return r.id === i.team.id; })[0];
    var wait = !d ? '<div class="cfb-e">Wird geladen …</div>' : null;
    if (k === 'hero') {
      var UI = window._casoraUI;
      var line = me ? { value: 'Platz ' + me.rank, sub: [i.leagueName, tab.name, me.pts + ' Punkte'].filter(Boolean).join(' · ') }
        : { value: i.leagueName || K.name(i.team.name), sub: null };
      return UI && UI.hero ? UI.hero({ center: true, value: line.value, sub: line.sub }) : '';
    }
    if (k === 'match') {
      if (i.phase === 'BYE' || i.phase === 'NONE' || !i.date) return CSS() + '<div class="cfb"><div class="cfb-e">Nächstes Spiel noch nicht angesetzt</div></div>';
      /* Wettbewerb als eigener Textteil, damit „Nächstes Spiel“ für sich übersetzt wird. */
      var lbl = esc({ PRE: 'Nächstes Spiel', IN: 'Live', POST: 'Letztes Spiel', OFF: 'Spiel' }[i.phase]) + (i.leagueName ? '<span> · ' + esc(i.leagueName) + '</span>' : '');
      var ha = homeAway(i), big, sub;
      if (i.phase === 'PRE') {
        big = i.tbd ? K.day(i.date) : hm(i.date);
        sub = i.tbd ? 'Uhrzeit offen' : K.day(i.date) + (diffDays(i.date) > 1 ? ' · ' + K.until(i.date) : '');
      } else if (i.phase === 'OFF') {
        big = i.off === 'cancel' ? 'Abgesagt' : 'Verschoben'; sub = K.day(i.date);
      } else {
        big = num(ha.hT.score) + ' : ' + num(ha.aT.score);
        var extra = ha.hT.pens != null && ha.aT.pens != null ? 'i. E. ' + ha.hT.pens + ':' + ha.aT.pens : i.aet ? 'n. V.' : '';
        sub = i.phase === 'IN' ? (K.minute(i.clock) || 'Live') : ['Endstand', extra, K.day(i.date)].filter(Boolean).join(' · ');
      }
      var where = [i.venue, (i.location || '').split(',')[0]].filter(function (x, n, a) { return x && a.indexOf(x) === n; }).join(', ');
      /* Kein TV-Sender: ESPN nennt nur US-Sender. */
      return CSS() + '<div class="cfb"><div class="cfb-m">' + head(lbl, '', true) + '<div class="cfb-mr">'
        + '<div class="cfb-sd">' + crest(ha.hT.logo) + '<b><span data-no-i18n>' + esc(K.name(ha.hT.name)) + '</span></b><small>Heim</small></div>'
        + '<div class="cfb-mid"><div class="cfb-big' + (i.phase === 'IN' ? ' live' : '') + '">' + esc(big) + '</div><div class="cfb-sub">' + String(sub).split(' · ').map(function (p) { return '<span>' + esc(p) + '</span>'; }).join('') + '</div></div>'
        + '<div class="cfb-sd">' + crest(ha.aT.logo) + '<b><span data-no-i18n>' + esc(K.name(ha.aT.name)) + '</span></b><small>Gast</small></div>'
        + '</div>' + (where ? '<div class="cfb-meta"><span class="cfb-chip">' + esc(where) + '</span></div>' : '') + '</div></div>';
    }
    if (k === 'table') {
      var t = 'Tabelle' + (tab && tab.name ? '<span> · ' + esc(tab.name) + '</span>' : '');
      var ab = K.abbr();
      if (wait) return CSS() + '<div class="cfb">' + head(t) + wait + '</div>';
      if (!tab) return CSS() + '<div class="cfb">' + head(t) + '<div class="cfb-e">' + (d.err ? 'Tabelle nicht erreichbar' : 'Keine Tabelle für diesen Wettbewerb') + '</div></div>';
      var rows = K.window(tab.rows, i.team.id, i.opp.id, K.full);
      var oppTag = i.phase === 'PRE' || i.phase === 'IN';
      var body = '<div class="cfb-r h"><span class="k">#</span><span></span><span>Team</span><span class="c">' + ab.gp + '</span><span class="c">' + ab.gd + '</span><span class="p">' + ab.pts + '</span></div>'
        + rows.map(function (r) {
          if (!r) return '<div class="cfb-gap">···</div>';
          var opp = oppTag && r.id === i.opp.id && i.opp.id !== i.team.id;
          var cls = 'cfb-r' + (r.id === i.team.id ? ' me' : '') + (opp ? ' opp' : '');
          var tag = opp ? '<em>' + (i.phase === 'IN' ? 'Gegner' : 'nächster Gegner') + '</em>' : '';
          return '<div class="' + cls + '"' + (r.zone ? ' data-z="' + r.zone + '"' : '') + '><span class="k">' + r.rank + '</span>'
            + mini(r.logo)
            + '<span class="n"><span data-no-i18n>' + esc(K.name(r.name)) + '</span>' + tag + '</span><span class="c">' + esc(r.gp) + '</span><span class="c">' + esc(r.gd) + '</span><span class="p">' + esc(r.pts) + '</span></div>';
        }).join('');
      var more = tab.rows.length > 10 ? '<div class="cfb-more" data-cfb="full">' + (K.full ? 'Weniger zeigen' : 'Ganze Tabelle') + '</div>' : '';
      var seen = {}, lg = '';
      tab.rows.forEach(function (r) {
        var l = r.zone && K.zoneLabel(r.zone, r.note);
        if (l && !seen[l]) { seen[l] = 1; lg += '<span><i class="' + r.zone + '"></i><span data-no-i18n>' + esc(l) + '</span></span>'; }
      });
      return CSS() + '<div class="cfb">' + head(t) + '<div class="cfb-t">' + body + more + '</div>' + (lg ? '<div class="cfb-lg">' + lg + '</div>' : '') + '</div>';
    }
    if (k === 'form') {
      if (wait) return CSS() + '<div class="cfb">' + head('Form') + wait + '</div>';
      var f = d.form || [];
      if (!f.length) return CSS() + '<div class="cfb">' + head('Form') + '<div class="cfb-e">Keine Spiele gefunden</div></div>';
      var n = { W: 0, D: 0, L: 0 };
      f.forEach(function (x) { if (!x.friendly && n[x.res] != null) n[x.res]++; });
      var ab2 = K.abbr();
      var sum = '<span data-no-i18n> · ' + n.W + ' ' + ab2.W + ' · ' + n.D + ' ' + ab2.D + ' · ' + n.L + ' ' + ab2.L + '</span>';
      return CSS() + '<div class="cfb">' + head('Form' + sum) + '<div class="cfb-fl">'
        + f.map(function (x) {
          return '<div class="cfb-f"><span class="cfb-res ' + esc(x.res) + '" data-no-i18n>' + (ab2[x.res] || '–') + '</span>'
            + mini(x.logo)
            + '<span class="o">' + (x.home ? 'gegen ' : 'bei ') + '<span data-no-i18n>' + esc(K.name(x.opp)) + '</span><small>' + esc([x.comp, x.date ? dm(x.date) : ''].filter(Boolean).join(' · ')) + '</small></span>'
            + '<span class="s">' + esc(x.my) + ' : ' + esc(x.their) + (x.pens ? '<small>i. E.</small>' : '') + '</span></div>';
        }).join('') + '</div>' + K.fillHtml(i, d, tab) + '</div>';
    }
    return '';
  };
  /* Zusatz unter der Form (Wunsch 08.10.2026: rechte Spalte endet sonst weit über der Tabelle).
     Varianten zum Vergleichen: window.CASORA_FB_FILL = a (letzte Duelle) | b (Form des Gegners) | c (Saisonbilanz) | none. */
  K.fill = function () { var v = window.CASORA_FB_FILL; return /^(a|b|c|none)$/.test(v || '') ? v : 'a'; };
  var tally = function (list) {
    var n = { W: 0, D: 0, L: 0 }, ab = K.abbr();
    list.forEach(function (x) { if (!x.friendly && n[x.res] != null) n[x.res]++; });
    return '<span data-no-i18n> · ' + n.W + ' ' + ab.W + ' · ' + n.D + ' ' + ab.D + ' · ' + n.L + ' ' + ab.L + '</span>';
  };
  var box = function (title, body) {
    return '<div class="cfb-x"><div class="cfb-xh">' + head(title, '', true) + '</div>' + body + '</div>';
  };
  K.fillHtml = function (i, d, tab) {
    var v = K.fill(), ab = K.abbr();
    if (!d || v === 'none') return '';
    if (v === 'a') {
      var du = (d.duels || []).slice(0, 5);
      if (!du.length) return '';
      return box('Letzte Duelle' + tally(du), '<div class="cfb-xb">' + du.map(function (x) {
        return '<div class="cfb-xl" data-fit><span class="cfb-res ' + esc(x.res) + '" data-no-i18n>' + (ab[x.res] || '–') + '</span>'
          + '<span class="o">' + (x.home ? 'Heimspiel' : 'Auswärtsspiel') + '<small>' + esc([x.comp, x.date ? dmy(x.date) : ''].filter(Boolean).join(' · ')) + '</small></span>'
          + '<span class="s">' + esc(x.my) + ' : ' + esc(x.their) + (x.pens ? '<small>i. E.</small>' : '') + '</span></div>';
      }).join('') + '</div>');
    }
    if (v === 'b') {
      var of = d.oppForm || [];
      if (!of.length || !i.opp.id || i.opp.id === i.team.id) return '';
      return box('Form <span data-no-i18n>' + esc(K.name(i.opp.name)) + '</span>' + tally(of), '<div class="cfb-xb">' + of.map(function (x) {
        return '<div class="cfb-xl c" data-fit><span class="cfb-res ' + esc(x.res) + '" data-no-i18n>' + (ab[x.res] || '–') + '</span>' + mini(x.logo)
          + '<span class="o">' + (x.home ? 'gegen ' : 'bei ') + '<span data-no-i18n>' + esc(K.name(x.opp)) + '</span><small>' + esc([x.comp, x.date ? dm(x.date) : ''].filter(Boolean).join(' · ')) + '</small></span>'
          + '<span class="s">' + esc(x.my) + ' : ' + esc(x.their) + (x.pens ? '<small>i. E.</small>' : '') + '</span></div>';
      }).join('') + '</div>');
    }
    /* c: Saisonbilanz aus der Tabelle (Siege, Tore), Heim/auswärts von der Teamseite – fehlt etwas, fehlt nur die Zeile. */
    var me = tab && tab.rows.filter(function (r) { return r.id === i.team.id; })[0];
    if (!me || me.w == null) return '';
    var line = function (lbl, val, small) {
      return '<div class="cfb-xl v" data-fit><span class="o">' + lbl + (small ? '<small data-no-i18n>' + esc(small) + '</small>' : '') + '</span><span class="s" data-no-i18n>' + esc(val) + '</span></div>';
    };
    var wtl = function (x) { return x.w + ' ' + ab.W + ' · ' + x.t + ' ' + ab.D + ' · ' + x.l + ' ' + ab.L; };
    var goals = function (x) { return x.gf != null && x.ga != null ? x.gf + ' : ' + x.ga : ''; };
    var rc = d.record || {}, gp = Number(me.gp) || 0, out = [line('Gesamt', wtl(me))];
    if (goals(me)) out.push(line('Tore', goals(me)));
    if (rc.home) out.push(line('Heim', wtl(rc.home), goals(rc.home) ? 'Tore ' + goals(rc.home) : ''));
    if (rc.away) out.push(line('Auswärts', wtl(rc.away), goals(rc.away) ? 'Tore ' + goals(rc.away) : ''));
    if (gp) out.push(line('Punkte pro Spiel', (Number(me.pts) / gp).toFixed(2).replace('.', german() ? ',' : '.')));
    return box('Saisonbilanz', '<div class="cfb-xb">' + out.join('') + '</div>');
  };

  /* Rechte Spalte (Form + Kasten) unten bündig mit der Tabelle: nur nebeneinander und bei eingeklappter Tabelle.
     Zu wenig Platz → Zeilen von unten weglassen (mindestens zwei, sonst ohne Kasten); Rest streckt den Kasten. */
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null, ro = null, fitT = [];
  var shown = function (n) { var q = n.getBoundingClientRect(); return q.width > 0 && q.height > 0; };
  K.fit = function () {
    var ha = document.querySelector('home-assistant');
    if (!ha) return;
    var L = find(ha.shadowRoot, '.cfb-table > .cfb').filter(shown)[0], R = find(ha.shadowRoot, '.cfb-form > .cfb').filter(shown)[0];
    if (!L || !R) return;
    if (seen && typeof ResizeObserver === 'function' && L.parentNode && !seen.has(L.parentNode)) {
      ro = ro || new ResizeObserver(function () { K.fitSoon(); });
      seen.add(L.parentNode); ro.observe(L.parentNode);
    }
    var X = R.querySelector('.cfb-x');
    if (!X) return;
    var lines = X.querySelectorAll('[data-fit]');
    X.style.minHeight = ''; X.hidden = false;
    lines.forEach(function (n) { n.hidden = false; });
    var lb = L.getBoundingClientRect(), rb = R.getBoundingClientRect();
    if (K.full || rb.left < lb.right || Math.abs(rb.top - lb.top) > 2) return;
    var target = lb.bottom, n = lines.length;
    while (n > 2 && X.getBoundingClientRect().bottom > target + 0.5) lines[--n].hidden = true;
    var xb = X.getBoundingClientRect();
    if (xb.bottom > target + 0.5) { X.hidden = true; return; }
    X.style.minHeight = (xb.height + target - xb.bottom) + 'px';
  };
  K.fitSoon = function () {
    fitT.forEach(clearTimeout);
    fitT = [0, 150, 500].map(function (ms) { return setTimeout(K.fit, ms); });
  };
  if (typeof window.addEventListener === 'function') window.addEventListener('resize', function () { if (K._id) K.fitSoon(); });

  /* Abschnitt für ein custom_field: Hülle mit Klasse, damit Laden/Antippen neu zeichnen kann. */
  K.sec = function (k, entity) {
    if (!entity) return '';
    K._id = entity.entity_id;
    K.load(K.info(entity));
    if (k === 'form' || k === 'table') K.fitSoon();
    return '<div class="cfb-' + k + '">' + K.html(k, entity) + '</div>';
  };

  /* Spalte aus Abschnitten, wie im Kalender-Popup. */
  var colCard = function (keys, entityId) {
    var colStyle = ':host { display: block; } ha-card { background: transparent !important; border: none !important;'
      + ' border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important;'
      + ' -webkit-backdrop-filter: none !important; padding: 0 !important; cursor: default !important; overflow: visible !important; }'
      + ' ha-card.disabled { pointer-events: auto !important; } ha-ripple { display: none !important; }'
      + ' #container { background: transparent !important; }';
    var cf = {}, cs = {};
    keys.forEach(function (k) {
      cf[k] = '[[[ return window._casoraFootball ? window._casoraFootball.sec(' + JSON.stringify(k) + ', entity) : ""; ]]]';
      cs[k] = [{ 'justify-self': 'stretch' }];
    });
    return {
      type: 'custom:button-card', entity: entityId, triggers_update: [entityId],
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      card_mod: { style: colStyle }, extra_styles: window._casoraColGap ? window._casoraColGap(keys) : '',
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: '0' }],
        grid: [{ 'grid-template-areas': keys.map(function (k) { return '"' + k + '"'; }).join(' ') }, { 'grid-template-columns': 'minmax(0, 1fr)' },
               { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }, { 'align-content': 'start' }],
        custom_fields: cs,
      },
      custom_fields: cf,
    };
  };
  K.popup = function (entity) {
    if (!entity) return { type: 'vertical-stack', cards: [] };
    K.full = false; K._id = entity.entity_id;
    K.load(K.info(entity), true);
    var id = entity.entity_id;
    var wrapperStyle = [
      ':host { --ha-card-box-shadow: none !important; --button-card-box-shadow: none !important; --button-card-box-shadow-hover: none !important; overflow: visible !important; }',
      'ha-card { background: transparent !important; border: none !important; border-radius: 0 !important; box-shadow: none !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; cursor: default !important; overflow: visible !important; will-change: auto !important; }',
      'ha-card:hover { box-shadow: none !important; }', 'ha-ripple { display: none !important; }',
      '@media (max-width: 600px) { ha-card { padding-left: 14px !important; padding-right: 14px !important; } }',
      ':host { --ha-card-backdrop-filter: none !important; --ha-card-background: transparent !important; --card-background-color: transparent !important; --ha-card-border-width: 0px !important; }',
      'ha-card::before, ha-card::after, #card::before, #card::after, #container::before, #container::after { display: none !important; }',
      '#container { background: transparent !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
      'ha-card.disabled { pointer-events: auto !important; }',
    ].join('\n');
    var fld = function (k) { return '[[[ return window._casoraFootball ? window._casoraFootball.sec(' + JSON.stringify(k) + ', entity) : ""; ]]]'; };
    return {
      type: 'custom:button-card', entity: id, triggers_update: [id],
      card_mod: { style: wrapperStyle },
      /* Breit: Tabelle links (breiter), Form rechts; Handy: alles untereinander. */
      extra_styles: '@media (min-width: 761px) { #container { grid-template-areas: "hero hero" "match match" "left right" !important;'
        + ' grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr) !important; column-gap: 20px !important; } }',
      tap_action: { action: 'none' }, show_icon: false, show_name: false, show_label: false, show_state: false,
      styles: {
        card: [{ background: 'transparent' }, { border: 'none' }, { 'box-shadow': 'none' }, { padding: SOFT() ? '0 26px 22px 26px' : '6px 26px 22px 26px' }],
        grid: [{ 'grid-template-areas': '"hero" "match" "left" "right"' }, { 'grid-template-columns': 'minmax(0, 1fr)' }, { 'align-items': 'start' }, { 'row-gap': 'var(--casora-popup-sec-gap, 18px)' }],
        custom_fields: { hero: [{ 'justify-self': 'stretch' }], match: [{ 'justify-self': 'stretch' }],
          left: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }], right: [{ 'justify-self': 'stretch' }, { 'align-self': 'start' }] },
      },
      custom_fields: { hero: fld('hero'), match: fld('match'), left: { card: colCard(['table'], id) }, right: { card: colCard(['form'], id) } },
    };
  };

  /* Popup-Ring (Weich): das Wappen in Farbe statt eines Symbols (casora-core: casoraRingImage). */
  var ringPrev = window.casoraRingImage;
  window.casoraRingImage = function (src, key) {
    if (/\bcasora_(popup_)?football\b/.test(key)) {
      var st = src && src._stateObj, i = K.info(st);
      if (i && i.team.logo) return K.img(i.team.logo, 'round');
    }
    return typeof ringPrev === 'function' ? ringPrev(src, key) : null;
  };

  /* Antippen „Ganze Tabelle“ (Capture, da Popups Klicks schlucken). */
  var target = function (ev) {
    var p = (ev.composedPath && ev.composedPath()) || [];
    for (var n = 0; n < p.length; n++) if (p[n] && p[n].getAttribute && p[n].hasAttribute('data-cfb')) return p[n].getAttribute('data-cfb');
    return null;
  };
  var act = function (a) { if (a === 'full') { K.full = !K.full; K.repaint(); } };
  var tS = null, tDone = 0;
  window.addEventListener('touchstart', function (ev) { var t = ev.touches && ev.touches[0]; tS = t ? { x: t.clientX, y: t.clientY } : null; }, { capture: true, passive: true });
  window.addEventListener('touchend', function (ev) {
    var a = target(ev); if (!a || !tS) return;
    var t = ev.changedTouches && ev.changedTouches[0];
    if (t && (Math.abs(t.clientX - tS.x) > 10 || Math.abs(t.clientY - tS.y) > 10)) return;
    tDone = Date.now(); if (ev.cancelable) ev.preventDefault(); ev.stopPropagation(); act(a);
  }, { capture: true, passive: false });
  window.addEventListener('click', function (ev) {
    var a = target(ev); if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    if (Date.now() - tDone >= 700) act(a);
  }, true);
})();
