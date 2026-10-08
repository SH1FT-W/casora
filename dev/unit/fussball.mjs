// Fußball-Kachel (07.10.2026): Team-Tracker-Sensor → Kachel, Sichtbarkeit, Tabelle und Form aus
// ESPN (Liga-Tabelle und Gruppe aus der Spielübersicht), Popup-Aufbau, Studio-Erkennung.
// Ohne Browser und ohne Netz – die ESPN-Antworten sind gekürzte echte Antworten.
//   node dev/unit/fussball.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
// Sprache der Oberfläche fest (sonst gälte die des Rechners): Deutsch, für einzelne Prüfungen Englisch.
let LANG = 'de';
globalThis.document = { querySelector: (q) => (q === 'home-assistant' ? { hass: { locale: { language: LANG } } } : null) };
globalThis.addEventListener = () => {};
globalThis.customElements = { whenDefined: () => new Promise(() => {}), get: () => null };
const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
new Function(src('custom_components/casora/scripts/local/11-fussball.js'))();
const K = window._casoraFootball;
window._casoraUI = { hero: (o) => '<hero>' + o.value + '|' + (o.sub || '') + '</hero>', tokens: { ink: '#000', ink2: '#333', ink3: '#666', font: 'x' } };

// ── Sensor wie von Team Tracker (Attribute gekürzt) ──
const at = (d, h, m) => { const x = new Date(); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() + d); x.setHours(h, m); return x; };
const sensor = (o = {}) => ({
  entity_id: 'sensor.team_a', state: o.state || 'PRE',
  attributes: Object.assign({
    state: o.state || 'PRE', sport_path: 'soccer', league_path: 'ita.1', league_name: 'Italian Serie A',
    event_id: '401874764', date: at(3, 20, 45).toISOString(), team_homeaway: 'away',
    team_abbr: 'JUV', team_id: '111', team_name: 'Juventus', team_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/111.png',
    team_score: null, opponent_abbr: 'CAG', opponent_id: '2925', opponent_name: 'Cagliari',
    opponent_logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/2925.png', opponent_score: null,
    clock: '10/11 - 2:45 PM EDT', venue: 'Unipol Domus', location: 'Cagliari, Italy', tv_network: 'Paramount+/Paramount+',
  }, o.attrs || {}),
});

// Erkennung: nur Team-Tracker-Sensoren.
assert.equal(K.is(sensor()), true);
assert.equal(K.is({ entity_id: 'sensor.temp', state: '21', attributes: { unit_of_measurement: '°C' } }), false);
assert.equal(K.info({ entity_id: 'sensor.x', state: '1', attributes: {} }), null);
const i0 = K.info(sensor());
assert.equal(i0.phase, 'PRE');
assert.equal(i0.home, false);
assert.equal(i0.leagueName, 'Serie A', 'ESPN-Liganame gekürzt');
assert.equal(i0.team.id, '111');

// ── Kachel-Text ──
assert.match(K.tile(sensor()), /^[A-Z][a-z] 20:45 · bei Cagliari$/, 'vor dem Spiel: Tag, Anpfiff, bei Gegner');
assert.equal(K.tile(sensor({ attrs: { date: at(0, 20, 45).toISOString(), team_homeaway: 'home' } })), 'Heute 20:45 · gegen Cagliari');
assert.equal(K.tile(sensor({ attrs: { date: at(1, 18, 0).toISOString() } })), 'Morgen 18:00 · bei Cagliari');
const live = sensor({ state: 'IN', attrs: { team_score: '2', opponent_score: '1', clock: "67'" } });
assert.equal(K.tile(live), 'führt 2:1 bei Cagliari', 'live: kicker-Stil, eigenes Team zuerst nur mit „führt“');
assert.equal(K.tile(sensor({ state: 'IN', attrs: { team_score: '0', opponent_score: '1', clock: "12'" } })), 'liegt 0:1 zurück bei Cagliari');
assert.equal(K.tile(live, null, true), '67′ · 1:2', 'kleine Handy-Kachel: Minute, Heim:Gast');
assert.match(K.tile(sensor(), null, true), /^[A-Z][a-z] 20:45$/, 'klein vor dem Spiel: nur Tag und Anstoß (Gegner als Wappen)');
assert.equal(K.tile(sensor(), null, false, true).endsWith(' · bei CAG'), true, 'Handy groß vor dem Spiel: Kürzel');
assert.equal(K.tile(live, null, false, true), 'führt 2:1 bei CAG', 'Handy groß: Kürzel statt Name');
// Zustandszeile einzeilig (Name bleibt auf der Höhe der anderen Kacheln); zu lang → Kürzel.
const itaPre = sensor({ attrs: { opponent_name: 'Bosnia-Herzegovina', opponent_abbr: 'BIH', date: at(20, 20, 45).toISOString() } });
assert.match(K.state(itaPre, false, false), /white-space:nowrap/);
assert.match(K.state(itaPre, false, false), /bei BIH</, 'Desktop, langer Text: Kürzel');
assert.match(K.state(sensor(), false, false), /bei Cagliari</, 'Desktop, kurz: voller Name');
assert.match(K.corner(live), /cfb-pill live.*67′/);
assert.equal(K.minute('HT'), 'Halbzeit');
assert.equal(K.minute('FT-Pens'), 'Elfmeterschießen');
assert.equal(K.minute('ET'), 'Verlängerung');
assert.equal(K.minute("45'+2'"), '45+2′');
assert.equal(K.minute("90'+3'"), '90+3′');
assert.equal(K.minute('10/11 - 2:45 PM EDT'), '', 'US-Datum vor dem Spiel ist keine Minute');
const post = sensor({ state: 'POST', attrs: { team_score: '1', opponent_score: '1', date: at(0, 15, 0).toISOString() } });
assert.equal(K.tile(post), '1:1 bei Cagliari');
assert.match(K.corner(post), /Endstand/, 'Endstand am Spieltag');
assert.match(K.corner(sensor({ state: 'POST', attrs: { team_score: '1', opponent_score: '1', date: at(-2, 15, 0).toISOString() } })), />[A-Z][a-z]</, 'danach der Tag');
const fin = (a) => sensor({ state: 'POST', attrs: Object.assign({ date: at(0, 15, 0).toISOString() }, a) });
assert.equal(K.tile(fin({ team_score: '2', opponent_score: '1' })), '2:1-Sieg bei Cagliari');
assert.equal(K.tile(fin({ team_score: '0', opponent_score: '2', team_homeaway: 'home' })), '0:2-Niederlage gegen Cagliari');
assert.equal(K.tile(fin({ team_score: '2', opponent_score: '1', clock: 'AET' })), '2:1-Sieg n. V. bei Cagliari');
// Elfmeterschießen: Team Tracker hängt es an („1(3)“).
const pens = fin({ team_score: '1(3)', opponent_score: '1(4)', clock: 'FT-Pens' });
assert.equal(K.info(pens).team.score, '1');
assert.equal(K.tile(pens), 'Niederlage i. E. bei Cagliari');
assert.match(K.html('match', pens), /1 : 1<\/div><div class="cfb-sub"><span>Endstand<\/span><span>i\. E\. 4:3<\/span><span>Heute<\/span>/, 'Heim:Gast, Elfmeter Heim zuerst');
// Verschoben/abgesagt: ESPN meldet „post“ mit 0:0.
const ppd = sensor({ state: 'POST', attrs: { team_score: '0', opponent_score: '0', clock: 'Postponed' } });
assert.equal(K.info(ppd).phase, 'OFF');
assert.equal(K.tile(ppd), 'Verschoben · bei Cagliari');
assert.match(K.corner(ppd), /Verschoben/);
assert.equal(K.tile(sensor({ state: 'POST', attrs: { clock: 'Canceled' } })), 'Abgesagt · bei Cagliari');
// Anstoßzeit noch offen.
const tbd = sensor({ attrs: { clock: 'TBD', date: at(9, 20, 0).toISOString() } });
assert.ok(!/20:00/.test(K.tile(tbd)), 'TBD: keine Platzhalter-Uhrzeit');
assert.match(K.corner(tbd), /Uhrzeit offen/);
assert.match(K.corner(sensor()), /in 4 Tagen|in 3 Tagen/);
const noon = at(0, 12, 0);
assert.match(K.corner(sensor({ attrs: { date: new Date(noon.getTime() + 3 * 3600000).toISOString() } }), noon), /in 3 Std\./, 'Spieltag: Countdown');
assert.match(K.corner(sensor({ attrs: { date: new Date(noon.getTime() + 25 * 60000).toISOString() } }), noon), /in 25 Min\./);
assert.equal(K.tile(sensor({ state: 'BYE', attrs: { date: null } })), 'Kein Spiel angesetzt');
assert.equal(K.until(at(20, 12, 0)), 'in 3 Wochen');

// ── Sichtbarkeit ──
const V = (m, b, a) => ({ show_when_match: m, hours_before: b, hours_after: a });
const now = new Date();
const inH = (h) => sensor({ attrs: { date: new Date(now.getTime() + h * 3600000).toISOString() } });
assert.equal(K.shows(inH(500), {}), true, 'Standard: immer');
assert.equal(K.shows(inH(500), V('always')), true);
assert.equal(K.shows(live, V('live')), true, 'live: während des Spiels');
assert.equal(K.shows(inH(1), V('live')), false);
assert.equal(K.shows(inH(2), V('around', 3)), true, 'rund ums Spiel: 2 Std. vorher bei 3 Std.');
assert.equal(K.shows(inH(5), V('around', 3)), false);
assert.equal(K.shows(inH(5), V('around', 6)), true);
assert.equal(K.shows(inH(5), V('around')), false, 'Vorgabe 3 Std.');
assert.equal(K.shows(sensor({ attrs: { date: at(0, 23, 0).toISOString() } }), V('matchday')), true, 'Spieltag');
assert.equal(K.shows(sensor({ attrs: { date: at(1, 20, 0).toISOString() } }), V('matchday')), false);
assert.equal(K.shows(sensor({ attrs: { date: at(5, 20, 0).toISOString() } }), V('week')), true);
assert.equal(K.shows(sensor({ attrs: { date: at(9, 20, 0).toISOString() } }), V('week')), false);
const postAt = (h) => sensor({ state: 'POST', attrs: { date: new Date(now.getTime() - h * 3600000).toISOString() } });
assert.equal(K.shows(postAt(4), V('matchday', 3, 3)), true, 'nach dem Spiel: Anpfiff+2 Std.+3 Std.');
globalThis.fetch = () => Promise.reject(new Error('kein Netz'));
assert.equal(K.shows(postAt(6), V('matchday', 3, 3)), false);
assert.equal(K.shows(postAt(6), V('matchday', 3, 5)), true);
// Ohne Stundenangabe: Ergebnis bis 12 Uhr am Tag nach dem Spiel.
const eve = sensor({ state: 'POST', attrs: { date: at(-1, 20, 45).toISOString() } });
const nextDay = (h) => { const x = new Date(); x.setHours(h, 0, 0, 0); return x; };
assert.equal(K.shows(eve, { show_when_match: 'matchday' }, nextDay(8)), true, 'beim Frühstück noch da');
assert.equal(K.shows(eve, { show_when_match: 'matchday' }, nextDay(13)), false);
// Spielende = Wechsel auf POST (last_changed), wenn plausibel.
const lc = Object.assign(postAt(5), { last_changed: new Date(now.getTime() - 1.2 * 3600000).toISOString() });
assert.equal(K.shows(lc, V('matchday', 3, 2)), true, 'Abpfiff vor 1,2 Std. (Verlängerung), 2 Std. Nachlauf: noch da');
assert.equal(K.shows(postAt(5), V('matchday', 3, 2)), false, 'ohne last_changed: Anpfiff + 2 Std. + 2 Std. vorbei');
// Nach dem Ergebnis: nächstes Spiel aus ESPNs Teamseite (Team Tracker bleibt auf POST).
const old = sensor({ state: 'POST', attrs: { date: at(-3, 15, 0).toISOString() } });
K.next['soccer|ita.1|111'] = { ts: Date.now(), date: at(4, 20, 45) };
assert.equal(K.shows(old, V('week')), true, 'Spielwoche: nächstes Spiel in 4 Tagen');
assert.equal(K.shows(old, V('matchday')), false);
K.next['soccer|ita.1|111'] = { ts: Date.now(), date: at(10, 20, 45) };
assert.equal(K.shows(old, V('week')), false);
assert.equal(K.hidden(sensor({ state: 'BYE', attrs: { date: null } }), V('week')), true, 'kein Spiel: ausgeblendet');
assert.equal(K.hidden({ entity_id: 'sensor.x', state: '1', attributes: {} }, V('live')), false, 'falscher Sensor: nicht verstecken');

// ── Aktive Kachel am Spieltag (variables.active_override) ──
const kick = at(0, 20, 45), clockAt = (d, h, m) => { const x = new Date(kick); x.setDate(x.getDate() + d); x.setHours(h, m, 0, 0); return x; };
const pre = sensor({ attrs: { date: kick.toISOString() } });
assert.equal(K.active(pre, {}, clockAt(-1, 21, 0)), false, 'Vortag: nicht aktiv');
assert.equal(K.active(pre, {}, clockAt(0, 0, 5)), true, 'Spieltag 0:05 vor dem Anstoß: aktiv');
assert.equal(K.active(pre, {}, clockAt(0, 20, 0)), true, 'Spieltag kurz vor dem Anstoß: aktiv');
assert.equal(K.active(sensor({ state: 'IN', attrs: { date: kick.toISOString(), team_score: '1', opponent_score: '0', clock: "30'" } }), {}, clockAt(0, 21, 15)), true, 'live: aktiv');
const ended = sensor({ state: 'POST', attrs: { date: kick.toISOString(), team_score: '1', opponent_score: '0', clock: 'FT' } });
assert.equal(K.active(ended, {}, clockAt(0, 23, 0)), true, 'kurz nach Abpfiff: aktiv');
assert.equal(K.active(ended, {}, clockAt(1, 13, 0)), false, 'Tag danach (nach 12 Uhr): nicht mehr aktiv');
assert.equal(K.active(ended, { hours_after: 1 }, clockAt(0, 23, 50)), false, 'Stunden-Einstellung: 1 Std. nach Spielende (22:45) vorbei');
assert.equal(K.active(ended, { hours_after: 1 }, clockAt(0, 23, 30)), true);
assert.equal(K.active(sensor({ state: 'POST', attrs: { date: kick.toISOString(), clock: 'Postponed', team_score: '0', opponent_score: '0' } }), {}, clockAt(0, 19, 0)), false, 'verschoben: nicht aktiv');
assert.equal(K.active(sensor({ state: 'BYE', attrs: { date: null } }), {}, clockAt(0, 12, 0)), false, 'spielfrei: nicht aktiv');

// ── ESPN: Liga-Tabelle (v2 standings, mit Zonen) ──
const team = (id, name) => ({ id, displayName: name, shortDisplayName: name, logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png' }] });
const st = (rank, gp, gd, pts) => [['rank', rank], ['gamesPlayed', gp], ['pointDifferential', gd], ['points', pts]].map(([name, v]) => ({ name, displayValue: String(v) }));
const NAMES = ['AS Roma', 'Internazionale', 'Lazio', 'Cagliari', 'AC Milan', 'Frosinone', 'Juventus', 'Como', 'Napoli', 'Sassuolo',
  'Atalanta', 'Lecce', 'Udinese', 'Torino', 'Parma', 'Monza', 'Fiorentina', 'Bologna', 'Genoa', 'Venezia'];
const IDS = ['104', '110', '112', '2925', '103', '4057', '111', '2572', '114', '3997', '105', '113', '118', '239', '115', '4007', '109', '107', '3263', '17530'];
const note = (r) => (r <= 4 ? 'Champions League' : r === 5 ? 'Europa League' : r === 6 ? 'Conference League qualifying' : r >= 18 ? 'Relegated' : null);
const standings = { children: [{ name: '2026-2027 Italian Serie A', standings: { entries: NAMES.map((n, k) => ({
  team: team(IDS[k], n), stats: st(k + 1, 5, 10 - k, 20 - k), ...(note(k + 1) ? { note: { description: note(k + 1), color: '#81D6AC' } } : {}),
})).reverse() } }] };
const tab = K.table(standings, null, '111');
assert.equal(tab.rows.length, 20);
assert.equal(tab.rows[0].name, 'AS Roma', 'nach Rang sortiert');
assert.equal(tab.rows[6].id, '111');
assert.equal(tab.rows[0].zone, 'cl');
assert.equal(tab.rows[19].zone, 'down');
assert.equal(tab.rows[4].zone, 'eu');
assert.equal(tab.rows[5].zone, 'ecl', 'Conference League eigene Farbe');
assert.equal(K.zone('Championship playoffs', 6), 'adv', '„Championship“ ist keine Champions League');
assert.equal(K.zone('Eliminated', 12), null);
assert.equal(K.zone('Relegation playoff', 1), 'rpo');
assert.equal(K.zone('Relegation playoffs', 6), null, 'Abstiegsrunde (AUT/BEL): keine rote halbe Liga');
assert.equal(K.zone('Promotion', 2), 'up');
assert.equal(K.zone('Something new', 1), null, 'Unbekanntes ohne Farbe');
assert.equal(K.zoneLabel('down'), 'Abstieg');
assert.equal(K.zoneLabel('rpo'), 'Relegation');
assert.equal(K.zoneLabel('adv', 'Round of 16'), 'Achtelfinale');
LANG = 'en';
assert.equal(K.zoneLabel('down'), 'Relegation', 'englische Oberfläche');
assert.equal(K.comp("Men's International Friendly"), "Men's International Friendly");
assert.equal(K.name('Italy'), 'Italy');
assert.equal(K.abbr().gd, 'GD');
LANG = 'de';
assert.equal(K.comp('UEFA Champions League, League Phase'), 'Champions League');
assert.equal(K.comp('FIFA World Cup Qualifying - UEFA'), 'WM-Quali');
assert.equal(K.comp("Women's International Friendly"), 'Testspiel (Frauen)');
assert.equal(K.abbr().gd, 'Diff.');

// Ausschnitt: Spitze, um Platz 7, Gegner (Platz 4), Ende – mit Lücken.
const win = K.window(tab.rows, '111', '2925', false);
const ranks = win.map((r) => (r ? r.rank : '…')).join(' ');
assert.equal(ranks, '1 2 3 4 5 6 7 8 9 … 19 20');
assert.equal(K.window(tab.rows, '111', '2925', true).length, 20, 'ausgeklappt: alles');
assert.equal(K.window(tab.rows.slice(0, 4), '111', '2925', false).length, 4, 'kurze Tabelle: komplett');
const low = K.window(tab.rows, '107', '104', false).map((r) => (r ? r.rank : '…')).join(' ');
assert.equal(low, '1 2 3 … 16 17 18 19 20');

// ── ESPN: Spielübersicht (Länderspiel, league_path „all“): Gruppe + Form ──
const sumStats = (gp, gd, p, r) => [['GP', gp], ['GD', gd], ['P', p], ['R', r]].map(([abbreviation, v]) => ({ abbreviation, displayValue: String(v) }));
const summary = {
  standings: { groups: [{ header: 'UEFA Nations League Standings', standings: { entries: [
    { team: 'France', id: '478', logo: [{ href: 'https://a.espncdn.com/i/teamlogos/countries/500/fra.png' }], stats: sumStats(4, '+5', 10, 1) },
    { team: 'Italy', id: '162', logo: [{ href: 'https://a.espncdn.com/i/teamlogos/countries/500/ita.png' }], stats: sumStats(4, '+3', 7, 2) },
    { team: 'Belgium', id: '459', logo: [], stats: sumStats(4, '+1', 6, 3) },
    { team: 'Türkiye', id: '465', logo: [], stats: sumStats(4, '-9', 0, 4) },
  ] } }] },
  lastFiveGames: [{ team: { id: '162' }, events: [
    { gameResult: 'W', score: '1-0', homeTeamId: '1', awayTeamId: '162', homeTeamScore: '0', awayTeamScore: '1', atVs: '@', gameDate: '2026-06-07T18:45Z', leagueName: "Men's International Friendly", opponent: { displayName: 'Greece', logo: 'g.png' } },
    { gameResult: 'L', score: '2-0', homeTeamId: '162', awayTeamId: '459', homeTeamScore: '0', awayTeamScore: '2', atVs: 'vs', gameDate: '2026-09-25T18:45Z', leagueName: 'UEFA Nations League', opponent: { displayName: 'Belgium' } },
    { gameResult: 'W', score: '3-1', homeTeamId: '162', awayTeamId: '465', homeTeamScore: '3', awayTeamScore: '1', atVs: 'vs', gameDate: '2026-10-05T18:45Z', leagueName: 'UEFA Nations League', opponent: { displayName: 'Türkiye' } },
  ] }],
};
const g = K.table(null, summary, '162');
const ita = sensor({ attrs: { team_id: '162', team_logo: 'https://a.espncdn.com/i/teamlogos/countries/500/ita.png', opponent_id: '478',
  opponent_logo: 'https://a.espncdn.com/i/teamlogos/countries/500/fra.png', league_path: 'all', event_id: '9' } });
K.data[K.key(K.info(ita))] = { ts: Date.now(), table: g, form: [] };
const gHtml = K.html('table', ita);
assert.match(gHtml, /<img class="fl" src="\/casora_assets\/flags\/rect\/it\.svg"/, 'Tabelle: rechteckige Flagge');
assert.match(K.html('match', ita), /class="cfb-cr fl"><img src="\/casora_assets\/flags\/round\/it\.svg"/, 'Spielkasten: runde Flagge im Kreis');
assert.deepEqual(g.rows.map((r) => r.id), ['478', '162', '459', '465']);
assert.equal(g.name, '', '„… Standings“ ist kein Gruppenname');
assert.equal(K.groupName('2026-2027 Italian Serie A'), '');
assert.equal(K.groupName('Group A1'), 'Gruppe A1');
assert.equal(K.groupName('League Phase'), 'Ligaphase');
// Nations League: Hinweis der eigenen Liga.
assert.equal(K.noteFor('A: Qualifies for QFs; B-D: Promotion playoffs', 'A'), 'Qualifies for QFs');
assert.equal(K.noteFor('A: Qualifies for QFs; B-D: Promotion playoffs', 'C'), 'Promotion playoffs');
assert.equal(K.noteFor('A, B: Relegation playoffs', 'A'), 'Relegation playoffs');
assert.equal(K.noteFor('A, B: Relegation playoffs', 'C'), null);
assert.equal(K.noteFor('Champions League', 'A'), 'Champions League', 'normaler Hinweis bleibt');
assert.equal(g.rows[1].pts, '7');
assert.equal(K.table(null, summary, '999'), null, 'Team nicht in der Tabelle: keine');
const f = K.form(summary, '162');
assert.equal(f.length, 3, 'nur 2 Pflichtspiele: Testspiel bleibt');
assert.equal(f[0].opp, 'Türkiye', 'neuestes Spiel zuerst');
assert.deepEqual([f[0].my, f[0].their], ['3', '1']);
assert.deepEqual([f[1].res, f[1].my, f[1].their], ['L', '0', '2'], 'Niederlage aus eigener Sicht');
assert.equal(f[2].friendly, true);
assert.equal(f[2].comp, 'Testspiel');
assert.equal(f[2].home, false);

// ── Letzte Duelle (ESPN seasonseries, gekürzt aus Cagliari – Juventus, Oktober 2026) ──
const cmp = (home, id, ab, score, winner) => ({ homeAway: home ? 'home' : 'away', winner, score,
  team: { id, abbreviation: ab, displayName: ab === 'CAG' ? 'Cagliari' : 'Juventus', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/' + id + '.png' } });
const h2h = { seasonseries: [{ type: 'head-to-head', title: 'Cagliari vs. Juventus', events: [
  { date: '2026-01-17T19:45:00Z', status: 'post', competitionName: '2025-26 Italian Serie A', competitors: [cmp(true, '2925', 'CAG', '1', true), cmp(false, '111', 'JUV', '0', false)] },
  { date: '2025-11-29T17:00:00Z', status: 'post', competitionName: '2025-26 Italian Serie A', competitors: [cmp(true, '111', 'JUV', '2', true), cmp(false, '2925', 'CAG', '1', false)] },
  { date: '2024-12-17T20:00:00Z', status: 'post', competitionName: '2024-25 Coppa Italia', competitors: [cmp(true, '111', 'JUV', '1', true), cmp(false, '2925', 'CAG', '1', false)] },
  { date: '2024-10-06T10:30:00Z', status: 'post', competitionName: '2024-25 Italian Serie A', competitors: [cmp(true, '111', 'JUV', '1', false), cmp(false, '2925', 'CAG', '1', false)] },
  { date: '2027-01-10T19:45:00Z', status: 'pre', competitionName: '2026-27 Italian Serie A', competitors: [cmp(true, '111', 'JUV', '0', false), cmp(false, '2925', 'CAG', '0', false)] },
] }] };
const du = K.duels(h2h, '111');
assert.equal(du.length, 4, 'nur beendete Spiele');
assert.deepEqual([du[0].res, du[0].my, du[0].their, du[0].home], ['L', '0', '1', false], 'aus eigener Sicht: 0:1 auswärts verloren');
assert.deepEqual([du[1].res, du[1].home], ['W', true]);
assert.equal(du[0].comp, 'Serie A', 'Saison vor dem Wettbewerb weg');
assert.deepEqual([du[0].opp, du[0].logo], ['Cagliari', 'https://a.espncdn.com/i/teamlogos/soccer/500/2925.png'], 'Gegner mit Wappen');
assert.equal(du[2].comp, 'Coppa Italia');
assert.deepEqual([du[2].res, du[2].pens], ['W', true], 'Remis mit Sieger: Elfmeterschießen');
assert.deepEqual([du[3].res, du[3].pens], ['D', false]);
assert.deepEqual(K.duels(h2h, '2925').map((x) => x.res), ['W', 'L', 'L', 'D'], 'Gegenseite');
assert.deepEqual(K.duels({}, '111'), [], 'keine Duelle bei ESPN: leer');
const dHtml = K.duelsHtml({ duels: du });
assert.match(dHtml, /class="cfb-x"/);
assert.match(dHtml, /class="cfb-f d" data-fit>/, 'Zeilen wie die Form');
assert.match(dHtml, /<img src="https:\/\/a\.espncdn\.com\/combiner\/i\?img=\/i\/teamlogos\/soccer\/500\/2925\.png&amp;w=128&amp;h=128"/, 'Gegnerwappen (verkleinert)');
assert.match(dHtml, /Letzte Duelle<span data-no-i18n> · 2 S · 1 U · 1 N<\/span>/, 'Kopf mit Bilanz');
assert.match(dHtml, /bei <span data-no-i18n>Cagliari<\/span><small>Serie A · 17\.01\.26<\/small>/, 'aus eigener Sicht, Datum mit Jahr');
assert.match(dHtml, /1 : 1<small>i\. E\.<\/small>/);
assert.equal((dHtml.match(/data-fit/g) || []).length, 4);
assert.equal(K.duelsHtml({ duels: [] }), '', 'ohne Duelle kein Abschnitt');

// ── Länderflaggen statt ESPN-Länderbildern (mitgeliefert, rund im Kreis / rechteckig in Listen) ──
// Wappen schnell (08.10.2026): ESPN-Wappen verkleinert, einmal geladen aus dem Browser-Speicher; anderes bleibt.
assert.equal(K.small('https://a.espncdn.com/i/teamlogos/soccer/500/111.png'), 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/111.png&w=128&h=128');
assert.equal(K.small('data:image/png;base64,AA'), 'data:image/png;base64,AA');
assert.equal(K.logo('/local/x.png'), '/local/x.png');
{
  const store = {}; const old = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } };
  store['casora-fb-logo:https://a.espncdn.com/i/teamlogos/soccer/500/999.png'] = 'data:image/png;base64,QQ==';
  assert.equal(K.logo('https://a.espncdn.com/i/teamlogos/soccer/500/999.png'), 'data:image/png;base64,QQ==', 'gemerktes Wappen sofort');
  globalThis.localStorage = old;
}
assert.equal(K.flag('https://a.espncdn.com/i/teamlogos/countries/500/ita.png'), 'it');
assert.equal(K.flag('https://a.espncdn.com/i/teamlogos/countries/500/eng.png'), 'gb-eng');
assert.equal(K.flag('https://a.espncdn.com/i/teamlogos/countries/500/rom.png'), 'ro', 'ESPN-Eigenname (rom) → ro');
assert.equal(K.flag('https://a.espncdn.com/i/teamlogos/soccer/500/111.png'), null, 'Vereinswappen bleibt');
assert.equal(K.img('https://a.espncdn.com/i/teamlogos/countries/500/fra.png', 'round'), '/casora_assets/flags/round/fr.svg');
assert.equal(K.img('https://a.espncdn.com/i/teamlogos/countries/500/fra.png', 'rect'), '/casora_assets/flags/rect/fr.svg');
assert.equal(K.img('https://a.espncdn.com/i/teamlogos/soccer/500/111.png', 'round'), 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/soccer/500/111.png&w=128&h=128');
assert.equal(K.img('https://a.espncdn.com/i/teamlogos/countries/500/xyz.png', 'round'), 'https://a.espncdn.com/combiner/i?img=/i/teamlogos/countries/500/xyz.png&w=128&h=128', 'unbekanntes Land: ESPN-Bild (verkleinert)');
// Jede zugeordnete Flagge liegt in beiden Formen bei.
const modSrc = src('custom_components/casora/scripts/local/11-fussball.js');
const isos = [...new Set(/var FLAG = pairs\('([^']+)'\)/.exec(modSrc)[1].split('|').map((p) => p.split('=')[1]))];
assert.ok(isos.length > 150, 'Flaggenliste');
for (const iso of isos) for (const shape of ['round', 'rect']) {
  assert.ok(fs.existsSync(new URL('../../custom_components/casora/assets/flags/' + shape + '/' + iso + '.svg', import.meta.url)), shape + '/' + iso + '.svg fehlt');
}
const itaHtml = K.html('table', sensor());  // ohne Daten: lädt noch
assert.match(itaHtml, /Wird geladen/);

// ── Popup ──
const S = sensor();
K.data[K.key(K.info(S))] = { ts: Date.now(), table: tab, form: f };
globalThis.fetch = () => { throw new Error('kein Netz im Test'); };
const cfg = K.popup(S);
assert.deepEqual(Object.keys(cfg.custom_fields), ['hero', 'match', 'left', 'right']);
assert.deepEqual(Object.keys(cfg.custom_fields.left.card.custom_fields), ['table']);
assert.deepEqual(Object.keys(cfg.custom_fields.right.card.custom_fields), ['form']);
assert.match(cfg.extra_styles, /"hero hero" "match match" "left right"/);
assert.match(K.html('hero', S), /Platz 7\|Serie A · 14 Punkte/);
assert.ok(!/TV/.test(K.html('match', S)), 'kein US-TV-Sender');
const tHtml = K.html('table', S);
assert.match(tHtml, /class="cfb-r me"[^>]*><span class="k">7</);
assert.match(tHtml, /class="cfb-r opp"/);
assert.match(tHtml, /Cagliari<\/span><em>nächster Gegner<\/em>/);
assert.match(tHtml, /data-cfb="full">Ganze Tabelle/);
assert.match(tHtml, /data-z="down"/);
const mHtml = K.html('match', S);
assert.match(mHtml, /class="cfb-m"><div[^>]*><div[^>]*>Nächstes Spiel<span> · Serie A<\/span>/, 'Etikett im Spielkasten');
assert.ok(mHtml.indexOf('Cagliari') < mHtml.indexOf('Juventus'), 'Auswärtsspiel: Gegner links (Heim)');
assert.match(mHtml, /20:45/);
assert.match(K.html('form', S), /cfb-res L" data-no-i18n>N/);
assert.ok(!/class="cfb-x"/.test(K.html('form', S)), 'ohne Duelle nur die Form');
K.data[K.key(K.info(S))].duels = du;
assert.ok(K.html('form', S).indexOf('class="cfb-x"') > K.html('form', S).lastIndexOf('cfb-f"'), 'Duelle unter der Form');
// Laden: Fehler im Netz → Hinweis statt Absturz.
K.data = {};
assert.match(K.html('table', S), /Wird geladen/);

// Vorlage: Popup-Ausdruck und Kachel-Ausdrücke laufen.
const T = JSON.parse(src('dashboards/casora/button_card_templates.json'));
const run = (expr, args) => new Function(...Object.keys(args), expr.trim().replace(/^\[\[\[/, '').replace(/\]\]\]$/, ''))(...Object.values(args));
assert.equal(run(T.casora_popup_football.tap_action.casora_popup.content, { entity: S }).type, 'custom:button-card');
assert.equal(run(T.casora_football.hidden, { entity: live, variables: V('live') }), false);
assert.equal(run(T.casora_football.hidden, { entity: inH(1), variables: V('live') }), true);
assert.equal(run(T.casora_football.hidden, { entity: S, variables: { enabled: false } }), true);
assert.equal(run(T.casora_football.entity_picture, { entity: S, variables: {} }), K.img(S.attributes.team_logo, 'round'));
{ // Modul noch nicht geladen: gemerktes Wappen aus dem Browser, sonst das Standard-Symbol.
  const keepK = globalThis._casoraFootball, keepLS = globalThis.localStorage, keepIcon = globalThis.casoraIconUrl;
  globalThis._casoraFootball = undefined; globalThis.casoraIconUrl = () => 'icon';
  globalThis.localStorage = { getItem: (k) => (k === 'casora-fb-logo:' + S.attributes.team_logo ? 'data:image/png;base64,QQ==' : null) };
  assert.equal(run(T.casora_football.entity_picture, { entity: S, variables: {} }), 'data:image/png;base64,QQ==', 'Wappen sofort, bevor das Modul lädt');
  globalThis.localStorage = { getItem: () => null };
  assert.equal(run(T.casora_football.entity_picture, { entity: S, variables: {} }), 'icon');
  globalThis._casoraFootball = keepK; globalThis.localStorage = keepLS; globalThis.casoraIconUrl = keepIcon;
}
assert.equal(run(T.casora_football.variables.active_override, { entity: live, variables: {} }), true, 'Vorlage: live aktiv');
assert.equal(run(T.casora_football.variables.active_override, { entity: sensor({ attrs: { date: at(3, 20, 45).toISOString() } }), variables: {} }), false, 'Vorlage: Spiel in 3 Tagen nicht aktiv');

// ── Studio-Assistent: Team-Tracker-Sensoren (ohne Gerät) werden Fußball-Kacheln auf der Startseite ──
new Function(src('custom_components/casora/panel/casora-panel-assist.js'))();
const hass = { states: { 'sensor.team_a': S, 'sensor.temp': { entity_id: 'sensor.temp', state: '20', attributes: {} } },
  entities: { 'sensor.team_a': { entity_id: 'sensor.team_a', platform: 'teamtracker' }, 'sensor.temp': { entity_id: 'sensor.temp' } },
  devices: {}, areas: {} };
const rooms = [{ name: 'Zuhause', path: 'home', tiles: [] }, { name: 'Küche', path: 'kueche', tiles: [] }];
const types = [{ id: 'casora_football', label: 'Football' }];
const sug = window.casoraAssist.suggest(hass, rooms, types);
assert.deepEqual(sug.map((x) => [x.entity, x.type, x.room]), [['sensor.team_a', 'casora_football', 'Zuhause']]);
// Schon auf einer Kachel: kein Vorschlag.
const used = [{ name: 'Zuhause', path: 'home', tiles: [{ entity: 'sensor.team_a' }] }];
assert.equal(window.casoraAssist.suggest(hass, used, types).length, 0);

console.log('fussball: ok');
