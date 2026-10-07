// Fußball-Kachel (07.10.2026): Team-Tracker-Sensor → Kachel, Sichtbarkeit, Tabelle und Form aus
// ESPN (Liga-Tabelle und Gruppe aus der Spielübersicht), Popup-Aufbau, Studio-Erkennung.
// Ohne Browser und ohne Netz – die ESPN-Antworten sind gekürzte echte Antworten.
//   node dev/unit/fussball.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';

globalThis.window = globalThis;
globalThis.document = { querySelector: () => null };
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
assert.equal(K.tile(live), '2 : 1 bei Cagliari', 'live: Spielstand aus Sicht des eigenen Teams');
assert.equal(K.tile(live, null, true), '67′ · 2 : 1 bei Cagliari', 'kleine Handy-Kachel: Minute im Text');
assert.match(K.corner(live), /cfb-pill live.*67′/);
assert.equal(K.minute('HT'), 'Halbzeit');
assert.equal(K.minute("90'+3'"), '90+3′');
assert.equal(K.minute('10/11 - 2:45 PM EDT'), '', 'US-Datum vor dem Spiel ist keine Minute');
const post = sensor({ state: 'POST', attrs: { team_score: '1', opponent_score: '1', date: at(0, 15, 0).toISOString() } });
assert.equal(K.tile(post), '1 : 1 bei Cagliari');
assert.match(K.corner(post), /Endstand/);
assert.match(K.corner(sensor()), /in 3 Tagen/);
assert.equal(K.tile(sensor({ state: 'BYE', attrs: { date: null } })), 'Kein Spiel geplant');
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
assert.equal(K.shows(postAt(6), V('matchday', 3, 3)), false);
assert.equal(K.shows(postAt(6), V('matchday', 3, 5)), true);
assert.equal(K.hidden(sensor({ state: 'BYE', attrs: { date: null } }), V('week')), true, 'kein Spiel: ausgeblendet');
assert.equal(K.hidden({ entity_id: 'sensor.x', state: '1', attributes: {} }, V('live')), false, 'falscher Sensor: nicht verstecken');

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
assert.equal(tab.rows[5].zone, 'eu');
assert.equal(K.zoneLabel('Relegated'), 'Abstieg');
assert.equal(K.zoneLabel('Conference League qualifying'), 'Conference League');

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
assert.deepEqual(g.rows.map((r) => r.id), ['478', '162', '459', '465']);
assert.equal(g.name, '', '„… Standings“ ist kein Gruppenname');
assert.equal(g.rows[1].pts, '7');
assert.equal(K.table(null, summary, '999'), null, 'Team nicht in der Tabelle: keine');
const f = K.form(summary, '162');
assert.equal(f.length, 3);
assert.equal(f[0].opp, 'Türkiye', 'neuestes Spiel zuerst');
assert.deepEqual([f[0].my, f[0].their], ['3', '1']);
assert.deepEqual([f[1].res, f[1].my, f[1].their], ['L', '0', '2'], 'Niederlage aus eigener Sicht');
assert.equal(f[2].comp, 'Testspiel');
assert.equal(f[2].home, false);

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
const tHtml = K.html('table', S);
assert.match(tHtml, /class="cfb-r me"[^>]*><span class="k">7</);
assert.match(tHtml, /Cagliari<\/span><em>nächster Gegner<\/em>/);
assert.match(tHtml, /data-cfb="full">Ganze Tabelle/);
assert.match(tHtml, /data-z="down"/);
const mHtml = K.html('match', S);
assert.match(mHtml, /Nächstes Spiel<span> · Serie A<\/span>/);
assert.ok(mHtml.indexOf('Cagliari') < mHtml.indexOf('Juventus'), 'Auswärtsspiel: Gegner links (Heim)');
assert.match(mHtml, /20:45/);
assert.match(K.html('form', S), /cfb-res L" data-no-i18n>N/);
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
assert.equal(run(T.casora_football.entity_picture, { entity: S, variables: {} }), S.attributes.team_logo);

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
