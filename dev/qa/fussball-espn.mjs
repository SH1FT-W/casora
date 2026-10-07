// Feste ESPN-Antworten für die Fußball-Kachel im Testhaus (Sensor aus dev/casora_mock/fussball.py).
// Das Popup lädt Tabelle und Form direkt bei ESPN – Tests sollen nicht vom Netz abhängen, deshalb
// fängt espnRoute(page|context) alle Aufrufe an site.api.espn.com ab und antwortet mit erfundenen
// Vereinen (18er-Liga, FC Nordhafen auf Platz 7, SV Lindenberg auf 11).
const TEAM = '990001', OPP = '990002';
const crest = (c, t) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
  + `<path d="M32 4 56 12v18c0 15-10 25-24 30C18 55 8 45 8 30V12z" fill="${c}"/>`
  + `<text x="32" y="38" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="#fff" text-anchor="middle">${t}</text></svg>`);
const NAMES = ['Borussia Talheim', 'FC Bergstadt', 'SC Weidenau', 'TSV Altmühl', 'Rot-Weiß Sandhafen', 'VfL Eichenried',
  'FC Nordhafen', 'SpVgg Mühlbach', 'Union Kranzfeld', 'SV Grünwalde', 'SV Lindenberg', 'FC Rosenau', 'Eintracht Seebach',
  'TuS Felsingen', 'VfB Hollerbach', 'SG Wiesental', 'FC Steinbrück', 'Viktoria Brachfeld'];
const COLORS = ['#C9A227', '#2E7D32', '#6A1B9A', '#00838F', '#C62828', '#558B2F', '#1F5FA8', '#EF6C00', '#AD1457',
  '#2E7D32', '#B8322A', '#5D4037', '#0277BD', '#455A64', '#283593', '#9E9D24', '#37474F', '#8E24AA'];
const NOTE = (r) => (r <= 4 ? 'Champions League' : r === 5 ? 'Europa League' : r === 6 ? 'Conference League Qualifying'
  : r === 16 ? 'Relegation Playoff' : r >= 17 ? 'Relegation' : null);
const idOf = (n) => (n === 6 ? TEAM : n === 10 ? OPP : String(990100 + n));
const abbr = (name) => name.split(' ').pop().slice(0, 3).toUpperCase();
const entries = NAMES.map((name, n) => {
  const rank = n + 1, pts = 18 - Math.round(n * 0.9);
  const e = { team: { id: idOf(n), displayName: name, shortDisplayName: name, logos: [{ href: crest(COLORS[n], abbr(name)) }] },
    stats: [{ name: 'rank', value: rank }, { name: 'gamesPlayed', abbreviation: 'GP', displayValue: '7' },
      { name: 'pointDifferential', abbreviation: 'GD', displayValue: String(9 - n) }, { name: 'points', abbreviation: 'P', displayValue: String(pts) }] };
  const note = NOTE(rank);
  if (note) e.note = { description: note };
  return e;
});
export const standings = { name: 'German Bundesliga', children: [{ name: 'German Bundesliga 2026-27', standings: { entries } }] };

const day = (d) => new Date(Date.now() - d * 86400000).toISOString();
const ev = (d, opp, home, my, their, res) => ({
  gameDate: day(d), homeTeamId: home ? TEAM : idOf(opp), awayTeamId: home ? idOf(opp) : TEAM,
  homeTeamScore: String(home ? my : their), awayTeamScore: String(home ? their : my), gameResult: res, atVs: home ? 'vs' : '@',
  leagueName: 'German Bundesliga', opponent: { displayName: NAMES[opp], abbreviation: abbr(NAMES[opp]), logo: crest(COLORS[opp], abbr(NAMES[opp])) },
});
// ESPN: älteste zuerst (K.form dreht um) – letztes Spiel ein Sieg.
export const summary = {
  header: { league: { slug: 'ger.1' } },
  lastFiveGames: [{ team: { id: TEAM }, events: [ev(35, 2, true, 1, 1, 'D'), ev(28, 13, false, 0, 2, 'L'),
    ev(21, 4, true, 3, 1, 'W'), ev(14, 8, false, 2, 2, 'D'), ev(7, 15, true, 2, 0, 'W')] }],
};
export const team = (next) => ({ team: { id: TEAM, nextEvent: next ? [{ date: next }] : [] } });

// Alle ESPN-Aufrufe abfangen. next: Anstoß des nächsten Spiels (ISO), sonst keins.
export async function espnRoute(target, { next = null } = {}) {
  const calls = [];
  await target.route(/https:\/\/site\.api\.espn\.com\//, (route) => {
    const u = route.request().url();
    calls.push(u);
    const body = /\/standings/.test(u) ? standings : /\/summary\?/.test(u) ? summary : /\/teams\//.test(u) ? team(next) : {};
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  return calls;
}
