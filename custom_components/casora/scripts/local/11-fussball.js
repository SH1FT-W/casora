// ── Fußball-Kachel + Popup (07.10.2026) ─────────────────────────────────────
// Template casora_football (['casora_entity','casora_popup_football']) ruft nur
// window._casoraFootball auf. Quelle ist ein Team-Tracker-Sensor (HACS „teamtracker“):
// Team, Gegner, Anstoß, Spielstand und Liga stehen in seinen Attributen – die Kachel
// braucht keine Einstellungen. Tabelle und Form lädt das Popup bei ESPN (dieselbe
// Quelle wie Team Tracker): Ligatabelle über standings, sonst (Länderspiele,
// league_path „all“) die Gruppe aus der Spielübersicht des nächsten Spiels.
(function () {
  if (window._casoraFootball) return;
  var K = window._casoraFootball = { data: {}, busy: {}, full: false, _id: null };
  var API = 'https://site.api.espn.com/apis';
  var TTL = 10 * 60000, TTL_LIVE = 60000;

  var esc = function (t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; });
  };
  var DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var DAYL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var day0 = function (d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  var diffDays = function (d, now) { return Math.round((day0(d) - day0(now || new Date())) / 86400000); };
  var hm = function (d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  var dm = function (d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.'; };

  /* Team Tracker liefert ESPN-Namen auf Englisch. Bei deutscher Oberfläche die Länder auf Deutsch. */
  /* Datenliste, kein UI-Text: englischer ESPN-Name=deutscher Name, durch | getrennt. */
  var pairs = function (str) { var o = {}; str.split('|').forEach(function (p) { var n = p.indexOf('='); o[p.slice(0, n)] = p.slice(n + 1); }); return o; };
  var DE = pairs('Albania=Albanien|Algeria=Algerien|Argentina=Argentinien|Australia=Australien|Austria=Österreich|Belgium=Belgien|Bosnia-Herzegovina=Bosnien-Herzegowina|Brazil=Brasilien|Bulgaria=Bulgarien|Cameroon=Kamerun|Canada=Kanada|Colombia=Kolumbien|Croatia=Kroatien|Cyprus=Zypern|Czechia=Tschechien|Czech Republic=Tschechien|Denmark=Dänemark|Egypt=Ägypten|England=England|Estonia=Estland|Finland=Finnland|France=Frankreich|Georgia=Georgien|Germany=Deutschland|Greece=Griechenland|Hungary=Ungarn|Iceland=Island|Ireland=Irland|Republic of Ireland=Irland|Israel=Israel|Italy=Italien|Japan=Japan|Kazakhstan=Kasachstan|Kosovo=Kosovo|Latvia=Lettland|Lithuania=Litauen|Luxembourg=Luxemburg|Mexico=Mexiko|Moldova=Moldau|Montenegro=Montenegro|Morocco=Marokko|Netherlands=Niederlande|North Macedonia=Nordmazedonien|Northern Ireland=Nordirland|Norway=Norwegen|Poland=Polen|Portugal=Portugal|Romania=Rumänien|Russia=Russland|Saudi Arabia=Saudi-Arabien|Scotland=Schottland|Senegal=Senegal|Serbia=Serbien|Slovakia=Slowakei|Slovenia=Slowenien|South Korea=Südkorea|Spain=Spanien|Sweden=Schweden|Switzerland=Schweiz|Tunisia=Tunesien|Türkiye=Türkei|Turkey=Türkei|Ukraine=Ukraine|United States=USA|USA=USA|Uruguay=Uruguay|Wales=Wales|Internazionale=Inter');
  var german = function () {
    var ha = document.querySelector('home-assistant');
    var h = ha && ha.hass;
    var l = (h && ((h.locale && h.locale.language) || h.language)) || (typeof navigator !== 'undefined' ? navigator.language : '') || '';
    return /^de\b/i.test(l);
  };
  K.name = function (n) { return german() && DE[n] ? DE[n] : (n || ''); };
  /* Kürzel ohne Übersetzungstabelle (ein Buchstabe wäre dort für alle Texte gültig). */
  K.abbr = function () {
    return german() ? { W: 'S', D: 'U', L: 'N', gp: 'Sp', gd: 'TD', pts: 'Pkt' } : { W: 'W', D: 'D', L: 'L', gp: 'P', gd: 'GD', pts: 'Pts' };
  };
  var COMP = pairs("Club Friendly=Testspiel|Men's International Friendly=Testspiel|International Friendly=Testspiel|UEFA Nations League=Nations League|UEFA Champions League=Champions League|UEFA Europa League=Europa League|UEFA Conference League=Conference League|UEFA Europa Conference League=Conference League|Italian Serie A=Serie A|German Bundesliga=Bundesliga|Spanish LALIGA=LaLiga|Spanish LaLiga=LaLiga|English Premier League=Premier League|French Ligue 1=Ligue 1|Coppa Italia=Coppa Italia|German Cup=DFB-Pokal");
  K.comp = function (n) { return COMP[n] || String(n || '').replace(/^(UEFA|FIFA) /, ''); };

  /* Sensor → einheitliche Spieldaten. null, wenn es kein Team-Tracker-Sensor ist. */
  K.is = function (st) {
    var a = st && st.attributes;
    return !!(a && a.sport_path != null && 'team_abbr' in a && 'opponent_abbr' in a);
  };
  K.info = function (st) {
    if (!K.is(st)) return null;
    var a = st.attributes, s = String(a.state || st.state || '').toUpperCase();
    var d = a.date ? new Date(a.date) : null;
    if (d && isNaN(d)) d = null;
    var num = function (x) { return x == null || x === '' ? null : x; };
    return {
      id: st.entity_id, phase: s === 'IN' || s === 'POST' || s === 'PRE' ? s : (s === 'BYE' ? 'BYE' : 'NONE'),
      sport: a.sport_path || a.sport || '', league: a.league_path || '', leagueName: K.comp(a.league_name || ''),
      event: a.event_id || null, date: d, home: a.team_homeaway === 'home',
      team: { id: String(a.team_id || ''), name: a.team_name || a.team_long_name || '', abbr: a.team_abbr || '', logo: a.team_logo || '', score: num(a.team_score) },
      opp: { id: String(a.opponent_id || ''), name: a.opponent_name || a.opponent_long_name || '', abbr: a.opponent_abbr || '', logo: a.opponent_logo || '', score: num(a.opponent_score) },
      clock: a.clock || '', venue: a.venue || '', location: a.location || '', tv: a.tv_network || '',
      winner: a.team_winner === true ? 'W' : a.opponent_winner === true ? 'L' : null,
    };
  };
  /* „67'“, „HT“ … aus dem clock-Attribut; vor dem Spiel steht dort ein US-Datum. */
  K.minute = function (c) {
    c = String(c || '').trim();
    if (/^(HT|Halftime|Half ?time)$/i.test(c)) return 'Halbzeit';
    if (/^(FT|Full ?time|Final)/i.test(c)) return 'Abpfiff';
    var m = /^(\d+)'?(\+\d+)?'?$/.exec(c);
    return m ? m[1] + (m[2] || '') + '′' : '';
  };
  K.when = function (d, now) {
    if (!d) return '';
    var n = diffDays(d, now);
    if (n === 0) return 'Heute';
    if (n === 1) return 'Morgen';
    if (n > 1 && n < 7) return DAYS[d.getDay()];
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
    var n = diffDays(d, now);
    if (n <= 0) return 'Heute';
    if (n === 1) return 'Morgen';
    if (n < 14) return 'in ' + n + ' Tagen';
    if (n < 60) return 'in ' + Math.round(n / 7) + ' Wochen';
    return 'in ' + Math.round(n / 30) + ' Monaten';
  };
  var vs = function (i) { return (i.home ? 'gegen ' : 'bei ') + K.name(i.opp.name); };
  var sc = function (i) { return (i.team.score == null ? '–' : i.team.score) + ' : ' + (i.opp.score == null ? '–' : i.opp.score); };

  /* Kachel: Zustandszeile und Ecke rechts oben. */
  /* small: kleine Handy-Kachel ohne Ecke – die Spielminute steht dann im Text. */
  K.tile = function (st, now, small) {
    var i = K.info(st);
    if (!i) return st ? 'Kein Team-Tracker-Sensor' : '';
    if (i.phase === 'IN') return (small && K.minute(i.clock) ? K.minute(i.clock) + ' · ' : '') + sc(i) + ' ' + vs(i);
    if (i.phase === 'POST') return sc(i) + ' ' + vs(i);
    if (i.phase === 'PRE' && i.date) return K.when(i.date, now) + ' ' + hm(i.date) + ' · ' + vs(i);
    return 'Kein Spiel geplant';
  };
  K.corner = function (st, now) {
    var i = K.info(st);
    if (!i) return '';
    if (i.phase === 'IN') {
      var m = K.minute(i.clock);
      return '<span class="cfb-pill live"><i></i>' + esc(m || 'Live') + '</span>';
    }
    if (i.phase === 'POST') return '<span class="cfb-pill">Endstand</span>';
    if (i.phase === 'PRE' && i.date) return '<span class="cfb-pill">' + esc(K.until(i.date, now)) + '</span>';
    return '';
  };
  K.live = function (st) { var i = K.info(st); return !!(i && i.phase === 'IN'); };
  /* Sichtbarkeit (variables.show_when_match):
       always   – immer (Standard)
       week     – wenn in den nächsten 7 Tagen ein Spiel ist, während und bis Y Std. danach
       matchday – am Spieltag (ganzer Tag), während und bis Y Std. danach
       around   – ab X Std. vor Anpfiff bis Y Std. nach Spielende (hours_before / hours_after)
       live     – nur während des Spiels
     Spielende = Anpfiff + 2 Std. (Team Tracker meldet kein Abpfiff-Datum). Neu geprüft wird bei
     jeder Aktualisierung des Sensors (vor dem Spiel etwa alle 10 Min., live alle paar Sekunden). */
  var hrs = function (v, def) { var n = Number(v); return isFinite(n) && n >= 0 ? n : def; };
  K.shows = function (st, variables, now) {
    var mode = String((variables && variables.show_when_match) || 'always');
    if (mode === 'always') return true;
    var i = K.info(st);
    if (!i) return true;
    if (i.phase === 'IN') return true;
    if (mode === 'live' || !i.date) return false;
    now = now || new Date();
    var H = 3600000, kick = i.date.getTime(), end = kick + 2 * H;
    var after = hrs(variables.hours_after, 3) * H;
    if (i.phase === 'POST') return now.getTime() <= end + after;
    if (i.phase !== 'PRE') return false;
    if (mode === 'matchday') return diffDays(i.date, now) <= 0;
    if (mode === 'week') return diffDays(i.date, now) < 7;
    if (mode === 'around') return now.getTime() >= kick - hrs(variables.hours_before, 3) * H;
    return true;
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
  var ZONE = function (desc) {
    if (!desc) return null;
    if (/relegat|abstieg/i.test(desc)) return 'down';
    if (/champions/i.test(desc)) return 'cl';
    return 'eu';
  };
  K.zoneLabel = function (desc) {
    var d = String(desc || '');
    if (/^relegat/i.test(d)) return 'Abstieg';
    if (/relegation play/i.test(d)) return 'Relegation';
    if (/conference league/i.test(d)) return 'Conference League';
    return d.replace(/ qualifying| qualifiers/i, '');
  };
  /* Eine Zeile aus beiden Formen: standings (team als Objekt, stats per name) oder
     Spielübersicht (team als Name, id/logo daneben, stats per Abkürzung). */
  var rowOf = function (e) {
    var s = statOf(e), t = e.team && typeof e.team === 'object' ? e.team : null;
    var logo = t ? ((t.logos || [])[0] || {}).href : ((e.logo || [])[0] || {}).href;
    var note = e.note && e.note.description ? e.note.description : null;
    return {
      id: String(t ? t.id : e.id), name: t ? (t.shortDisplayName || t.displayName || t.name) : String(e.team || ''), logo: logo || '',
      rank: Number(s.rank || s.R) || 0, gp: s.gamesPlayed || s.GP || '0', gd: s.pointDifferential || s.GD || '0',
      pts: s.points || s.P || '0', w: s.wins || s.W, d: s.ties || s.D, l: s.losses || s.L, note: note, zone: ZONE(note),
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
    var gs = groupsOf(standings), g = pick(gs);
    if (!g) { gs = groupsOf(summary); g = pick(gs); }
    if (!g) return null;
    var rows = g.entries.map(rowOf).sort(function (a, b) { return (a.rank || 99) - (b.rank || 99); });
    rows.forEach(function (r, n) { if (!r.rank) r.rank = n + 1; });
    /* Gruppenname nur bei mehreren Gruppen („Group A“) – eine Liga heißt sonst „2026-2027 Italian Serie A“. */
    var nm = gs.length > 1 && !/standings|tabelle/i.test(g.name) ? g.name : '';
    return { name: nm, rows: rows };
  };
  K.form = function (summary, teamId) {
    var t = ((summary && summary.lastFiveGames) || []).filter(function (x) { return x.team && String(x.team.id) === String(teamId); })[0];
    if (!t) return [];
    return (t.events || []).map(function (ev) {
      var home = String(ev.homeTeamId) === String(teamId);
      var my = home ? ev.homeTeamScore : ev.awayTeamScore, their = home ? ev.awayTeamScore : ev.homeTeamScore;
      if (my == null || their == null) {
        var p = String(ev.score || '').split('-').map(Number), hi = Math.max(p[0], p[1]), lo = Math.min(p[0], p[1]);
        my = ev.gameResult === 'L' ? lo : hi; their = ev.gameResult === 'L' ? hi : lo;
      }
      var o = ev.opponent || {};
      return { res: ev.gameResult || '', my: my, their: their, home: ev.atVs !== '@', date: ev.gameDate ? new Date(ev.gameDate) : null,
        opp: o.displayName || o.abbreviation || '', logo: o.logo || ((o.logos || [])[0] || {}).href || '', comp: K.comp(ev.leagueName || ev.leagueAbbreviation || '') };
    }).reverse();
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
  K.key = function (i) { return i ? [i.sport, i.league, i.event, i.team.id].join('|') : ''; };
  K.load = function (i, force) {
    if (!i || !i.event || !i.sport || typeof fetch !== 'function') return;
    var key = K.key(i), d = K.data[key];
    if (K.busy[key] || (!force && d && Date.now() - d.ts < (i.phase === 'IN' ? TTL_LIVE : TTL))) return;
    K.busy[key] = true;
    var base = API + '/site/v2/sports/' + encodeURIComponent(i.sport) + '/' + encodeURIComponent(i.league || 'all');
    var sum = getJson(base + '/summary?event=' + encodeURIComponent(i.event)).catch(function () { return null; });
    /* „all“ (Länderspiele) hat keine eigene Tabelle – dort reicht die Spielübersicht. */
    var tab = i.league && i.league !== 'all'
      ? getJson(API + '/v2/sports/' + encodeURIComponent(i.sport) + '/' + encodeURIComponent(i.league) + '/standings').catch(function () { return null; })
      : Promise.resolve(null);
    Promise.all([sum, tab]).then(function (r) {
      K.data[key] = { ts: Date.now(), err: !r[0] && !r[1], table: K.table(r[1], r[0], i.team.id), form: K.form(r[0], i.team.id) };
    }).catch(function () { K.data[key] = { ts: Date.now(), err: true, table: null, form: [] }; })
      .then(function () { K.busy[key] = false; K.repaint(); });
  };

  /* ── Zeichnen ── */
  var find = function (root, sel, out) {
    out = out || [];
    if (!root || !root.querySelectorAll) return out;
    root.querySelectorAll(sel).forEach(function (n) { out.push(n); });
    root.querySelectorAll('*').forEach(function (n) { if (n.shadowRoot) find(n.shadowRoot, sel, out); });
    return out;
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
  };
  var UIT = function () { return (window._casoraUI && window._casoraUI.tokens) || { ink: '#fff', ink2: 'rgba(255,255,255,0.56)', ink3: 'rgba(255,255,255,0.42)', font: 'system-ui' }; };
  var SOFT = function () { return !!(window._casoraHH && window._casoraHH.on()); };
  var head = function (t, right) {
    var T = UIT();
    if (SOFT()) {
      return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 6px 10px;min-height:20px;">'
        + '<div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--casora-soft-label, var(--secondary-text-color));text-align:left;">'
        + t + '</div>' + (right || '') + '</div>';
    }
    return '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 0 10px;">'
      + '<div style="font-size:var(--casora-h15-fs,15px);font-weight:var(--casora-h15-fw,600);letter-spacing:var(--casora-h15-ls,-0.01em);text-transform:var(--casora-h15-tt,none);color:var(--casora-h15-c, ' + T.ink + ');text-align:left;">' + t + '</div>' + (right || '') + '</div>';
  };
  /* Weich: Sand-Pillen wie Kalender/Pflanze; sonst die Glas-Platten der anderen Popups. */
  var CSS = function () {
    var T = UIT(), soft = SOFT();
    var row = soft ? 'var(--casora-soft-row-fill, rgba(140,115,90,0.07))' : 'var(--casora-popup-row-fill, rgba(255,255,255,0.10))';
    var sub = soft ? 'var(--casora-soft-sub, ' + T.ink2 + ')' : T.ink2;
    var on = soft ? 'var(--casora-soft-seg-on, #FFFDF9)' : 'rgba(255,255,255,0.16)';
    var onSh = soft ? 'var(--casora-soft-seg-on-shadow, none)' : 'none';
    var rad = 'var(--casora-popup-row-radius, 24px)';
    var plate = soft ? '' : 'box-shadow:var(--casora-popup-plate-shadow, none);backdrop-filter:var(--casora-popup-plate-backdrop, none);-webkit-backdrop-filter:var(--casora-popup-plate-backdrop, none);';
    return '<style>'
      + '.cfb{font-family:' + T.font + ';text-align:left;color:' + T.ink + ';}'
      + '.cfb-m{background:' + row + ';border-radius:calc(' + rad + ' + 4px);padding:16px 20px 18px;' + plate + '}'
      + '.cfb-mr{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:12px;}'
      + '.cfb-sd{display:flex;flex-direction:column;align-items:center;gap:7px;min-width:0;text-align:center;}'
      + '.cfb-sd b{font-size:15px;font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.cfb-sd small{font-size:12px;font-weight:500;color:' + T.ink3 + ';}'
      + '.cfb-cr{width:60px;height:60px;border-radius:50%;background:#fff;display:grid;place-items:center;flex:none;box-shadow:0 0 0 1px rgba(58,50,43,0.06);}'
      + '.cfb-cr img{width:66%;height:66%;object-fit:contain;}'
      + '.cfb-mid{text-align:center;}'
      + '.cfb-big{font-size:clamp(28px,4vw,36px);font-weight:800;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;line-height:1.1;}'
      + '.cfb-big.live{color:var(--casora-color-red, #D35A4E);}'
      + '.cfb-sub{font-size:13.5px;color:' + sub + ';margin-top:3px;}'
      + '.cfb-meta{display:flex;justify-content:center;flex-wrap:wrap;gap:6px;margin-top:14px;}'
      + '.cfb-chip{font-size:12.5px;font-weight:500;color:' + sub + ';background:' + (soft ? 'var(--casora-soft-surface, #F8F5EF)' : 'rgba(255,255,255,0.08)') + ';padding:6px 11px;border-radius:999px;}'
      + '.cfb-t{display:flex;flex-direction:column;gap:6px;}'
      + '.cfb-r{position:relative;display:grid;grid-template-columns:26px 24px minmax(0,1fr) 28px 38px 34px;align-items:center;gap:8px;min-height:44px;padding:0 14px 0 10px;border-radius:' + rad + ';background:' + row + ';font-size:14.5px;font-variant-numeric:tabular-nums;}'
      + '.cfb-r.h{background:none;min-height:18px;font-size:11px;font-weight:600;letter-spacing:.04em;color:' + T.ink3 + ';}'
      + '.cfb-r.me{background:' + on + ';box-shadow:' + onSh + ';}'
      + '.cfb-r .k{color:' + sub + ';font-weight:600;text-align:center;}'
      + '.cfb-r img{width:22px;height:22px;object-fit:contain;}'
      + '.cfb-r .n{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}'
      + '.cfb-r .n em{font-style:normal;font-size:11px;font-weight:600;color:var(--primary-color, #B67A50);margin-left:7px;}'
      + '.cfb-r .c{text-align:right;color:' + sub + ';}.cfb-r .p{text-align:right;font-weight:700;}'
      + '.cfb-r[data-z]::before{content:"";position:absolute;left:3px;top:12px;bottom:12px;width:3px;border-radius:2px;}'
      + '.cfb-r[data-z=cl]::before,.cfb-lg i.cl{background:var(--casora-color-teal, #4E9E95);}'
      + '.cfb-r[data-z=eu]::before,.cfb-lg i.eu{background:var(--casora-color-orange, #DE8A4E);}'
      + '.cfb-r[data-z=down]::before,.cfb-lg i.down{background:var(--casora-color-red, #D35A4E);}'
      + '.cfb-gap{text-align:center;color:' + T.ink3 + ';font-size:16px;line-height:10px;height:12px;}'
      + '.cfb-more{align-self:flex-start;margin-top:4px;font-size:14px;font-weight:600;color:var(--primary-color, #B67A50);padding:8px 12px;cursor:pointer;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;}'
      + '.cfb-lg{display:flex;flex-wrap:wrap;gap:12px;margin:8px 8px 0;font-size:12px;color:' + T.ink3 + ';}'
      + '.cfb-lg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:5px;}'
      + '.cfb-f{display:grid;grid-template-columns:30px 24px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:52px;padding:6px 16px 6px 11px;border-radius:' + rad + ';background:' + row + ';font-size:14.5px;}'
      + '.cfb-f + .cfb-f{margin-top:6px;}'
      + '.cfb-res{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:700;font-size:12.5px;}'
      + '.cfb-res.W{background:var(--casora-color-green, #6AAE78);}.cfb-res.D{background:var(--casora-color-sand, #9A8672);}.cfb-res.L{background:var(--casora-color-red, #D35A4E);}'
      + '.cfb-f img{width:22px;height:22px;object-fit:contain;}'
      + '.cfb-f .o{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
      + '.cfb-f .o small{display:block;font-weight:500;font-size:12px;color:' + sub + ';}'
      + '.cfb-f .s{font-weight:700;font-variant-numeric:tabular-nums;}'
      + '.cfb-e{background:' + row + ';border-radius:' + rad + ';padding:16px;font-size:14px;font-weight:500;color:' + sub + ';}'
      + '</style>';
  };
  var crest = function (url) { return '<div class="cfb-cr">' + (url ? '<img src="' + esc(url) + '" alt="" loading="lazy">' : '') + '</div>'; };

  K.html = function (k, st) {
    var i = K.info(st);
    if (!i) return k === 'hero' ? '<div class="cfb-e">Kein Team-Tracker-Sensor</div>' : '';
    var d = K.data[K.key(i)], tab = d && d.table, me = tab && tab.rows.filter(function (r) { return r.id === i.team.id; })[0];
    var wait = !d ? '<div class="cfb-e">Wird geladen …</div>' : null;
    if (k === 'hero') {
      var UI = window._casoraUI;
      var line = me ? { value: 'Platz ' + me.rank, sub: [tab.name || i.leagueName, me.pts + ' Punkte'].filter(Boolean).join(' · ') }
        : { value: i.leagueName || K.name(i.team.name), sub: null };
      return UI && UI.hero ? UI.hero({ center: true, value: line.value, sub: line.sub }) : '';
    }
    if (k === 'match') {
      if (i.phase === 'BYE' || i.phase === 'NONE' || !i.date) return CSS() + '<div class="cfb"><div class="cfb-e">Kein Spiel geplant</div></div>';
      /* Wettbewerb als eigener Textteil, damit „Nächstes Spiel“ für sich übersetzt wird. */
      var lbl = esc({ PRE: 'Nächstes Spiel', IN: 'Live', POST: 'Letztes Spiel' }[i.phase]) + (i.leagueName ? '<span> · ' + esc(i.leagueName) + '</span>' : '');
      var hT = i.home ? i.team : i.opp, aT = i.home ? i.opp : i.team;
      var big, sub;
      if (i.phase === 'PRE') { big = hm(i.date); sub = K.day(i.date) + (diffDays(i.date) > 1 ? ' · ' + K.until(i.date) : ''); }
      else {
        big = (hT.score == null ? '–' : hT.score) + ' : ' + (aT.score == null ? '–' : aT.score);
        sub = i.phase === 'IN' ? (K.minute(i.clock) || 'Läuft') : 'Endstand · ' + K.day(i.date);
      }
      var where = [i.venue, (i.location || '').split(',')[0]].filter(function (x, n, a) { return x && a.indexOf(x) === n; }).join(', ');
      var meta = (where ? '<span class="cfb-chip">' + esc(where) + '</span>' : '') + (i.tv ? '<span class="cfb-chip">TV · ' + esc(i.tv.split('/')[0]) + '</span>' : '');
      return CSS() + '<div class="cfb">' + head(lbl) + '<div class="cfb-m"><div class="cfb-mr">'
        + '<div class="cfb-sd">' + crest(hT.logo) + '<b><span data-no-i18n>' + esc(K.name(hT.name)) + '</span></b><small>Heim</small></div>'
        + '<div class="cfb-mid"><div class="cfb-big' + (i.phase === 'IN' ? ' live' : '') + '">' + esc(big) + '</div><div class="cfb-sub">' + esc(sub) + '</div></div>'
        + '<div class="cfb-sd">' + crest(aT.logo) + '<b><span data-no-i18n>' + esc(K.name(aT.name)) + '</span></b><small>Gast</small></div>'
        + '</div>' + (meta ? '<div class="cfb-meta">' + meta + '</div>' : '') + '</div></div>';
    }
    if (k === 'table') {
      var t = 'Tabelle' + (tab && tab.name ? '<span> · ' + esc(tab.name) + '</span>' : '');
      var ab = K.abbr();
      if (wait) return CSS() + '<div class="cfb">' + head(t) + wait + '</div>';
      if (!tab) return CSS() + '<div class="cfb">' + head(t) + '<div class="cfb-e">' + (d.err ? 'Tabelle nicht erreichbar' : 'Keine Tabelle für diesen Wettbewerb') + '</div></div>';
      var rows = K.window(tab.rows, i.team.id, i.opp.id, K.full);
      var body = '<div class="cfb-r h"><span class="k">#</span><span></span><span>Team</span><span class="c">' + ab.gp + '</span><span class="c">' + ab.gd + '</span><span class="p">' + ab.pts + '</span></div>'
        + rows.map(function (r) {
          if (!r) return '<div class="cfb-gap">···</div>';
          var cls = 'cfb-r' + (r.id === i.team.id ? ' me' : '');
          var tag = r.id === i.opp.id && i.phase !== 'POST' && i.opp.id !== i.team.id ? '<em>' + (i.phase === 'IN' ? 'Gegner' : 'nächster Gegner') + '</em>' : '';
          return '<div class="' + cls + '"' + (r.zone ? ' data-z="' + r.zone + '"' : '') + '><span class="k">' + r.rank + '</span>'
            + (r.logo ? '<img src="' + esc(r.logo) + '" alt="" loading="lazy">' : '<span></span>')
            + '<span class="n"><span data-no-i18n>' + esc(K.name(r.name)) + '</span>' + tag + '</span><span class="c">' + esc(r.gp) + '</span><span class="c">' + esc(r.gd) + '</span><span class="p">' + esc(r.pts) + '</span></div>';
        }).join('');
      var more = tab.rows.length > 10 ? '<div class="cfb-more" data-cfb="full">' + (K.full ? 'Weniger zeigen' : 'Ganze Tabelle') + '</div>' : '';
      var seen = {}, lg = '';
      tab.rows.forEach(function (r) { if (r.zone && r.note && !seen[r.note]) { seen[r.note] = 1; lg += '<span><i class="' + r.zone + '"></i>' + esc(K.zoneLabel(r.note)) + '</span>'; } });
      return CSS() + '<div class="cfb">' + head(t) + '<div class="cfb-t">' + body + more + '</div>' + (lg ? '<div class="cfb-lg">' + lg + '</div>' : '') + '</div>';
    }
    if (k === 'form') {
      if (wait) return CSS() + '<div class="cfb">' + head('Form') + wait + '</div>';
      var f = d.form || [];
      if (!f.length) return CSS() + '<div class="cfb">' + head('Form') + '<div class="cfb-e">Keine Spiele gefunden</div></div>';
      var n = { W: 0, D: 0, L: 0 };
      f.forEach(function (x) { if (n[x.res] != null) n[x.res]++; });
      var ab2 = K.abbr();
      var sum = '<span data-no-i18n>' + n.W + ' ' + ab2.W + ' · ' + n.D + ' ' + ab2.D + ' · ' + n.L + ' ' + ab2.L + '</span>';
      return CSS() + '<div class="cfb">' + head('Form', '<div style="font-size:13px;font-weight:600;color:' + UIT().ink3 + ';">' + sum + '</div>')
        + f.map(function (x) {
          return '<div class="cfb-f"><span class="cfb-res ' + esc(x.res) + '" data-no-i18n>' + (ab2[x.res] || '–') + '</span>'
            + (x.logo ? '<img src="' + esc(x.logo) + '" alt="" loading="lazy">' : '<span></span>')
            + '<span class="o">' + (x.home ? 'gegen ' : 'bei ') + '<span data-no-i18n>' + esc(K.name(x.opp)) + '</span><small>' + esc([x.comp, x.date ? dm(x.date) : ''].filter(Boolean).join(' · ')) + '</small></span>'
            + '<span class="s">' + esc(x.my) + ' : ' + esc(x.their) + '</span></div>';
        }).join('') + '</div>';
    }
    return '';
  };
  /* Abschnitt für ein custom_field: Hülle mit Klasse, damit Laden/Antippen neu zeichnen kann. */
  K.sec = function (k, entity) {
    if (!entity) return '';
    K._id = entity.entity_id;
    K.load(K.info(entity));
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
      if (i && i.team.logo) return i.team.logo;
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
