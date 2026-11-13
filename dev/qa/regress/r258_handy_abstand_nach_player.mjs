// @zustand: arbeit
// Gemeldet (11.10.2026): Am Handy war der Abstand vom Player bis „Favoriten“ zu groß (47 px statt wie
// Badges → „Aktuelle Wiedergabe“ 14 px). Erwartet: beide Abstände gleich (±2 px). Player nur im Browser.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish } from './lib.mjs';
const dash = await casoraDashboard();
const { page } = await open({ width: 393, height: 852, mobile: true, theme: 'Casora', dark: false });
await dashboard(page, dash.phone.url);
// A player the phone's Now Playing card lists (it takes up to 8; since 26.11.27 the test speakers push the house's
// first player out of that list), else the house's first.
const mp = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_mobile_now_playing'));
  const v = (b && b._config.variables) || {};
  return v.media_player_1 || Object.keys(document.querySelector('home-assistant').hass.states).filter((id) => id.startsWith('media_player.'))[0];
});
await fakeStates(page, { [mp]: { state: 'playing', attributes: { media_title: 'Testlied', media_artist: 'Band', friendly_name: 'Wohnzimmer' } } }, { sticky: true });
await page.waitForTimeout(4000);
const m = await page.evaluate(() => {
  const txt = (re) => window.__pierce('*').filter((e) => { let o = ''; for (const c of e.childNodes) if (c.nodeType === 3) o += c.textContent; return re.test(o.trim()) && e.getBoundingClientRect().height > 0; })[0];
  // Where the heading sits in the layout: a heading may carry extra padding for its halo (r396), taken back by a
  // negative margin, so its box starts that much higher than the heading itself.
  const textTop = (e) => e.getBoundingClientRect().top - Math.min(0, parseFloat(getComputedStyle(e).marginTop) || 0);
  const badges = window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).some((t) => /^casora_badge/.test(t)) && b.getBoundingClientRect().height > 0);
  const bb = Math.max(...badges.map((b) => { const c = b.shadowRoot.querySelector('ha-card'); return (c || b).getBoundingClientRect().bottom; }));
  // sichtbare Player-Zeile: größtes Element mit Text „Testlied“ im Vorfahren mit Hintergrund
  let row = txt(/^Testlied$/); for (let i = 0; i < 8 && row; i++) { const cs = getComputedStyle(row); if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && row.getBoundingClientRect().height > 50) break; row = row.parentElement || (row.parentNode && row.parentNode.host); }
  return { badges_bis_Wiedergabe: Math.round(textTop(txt(/^Aktuelle Wiedergabe$/)) - bb), player_bis_Favoriten: Math.round(textTop(txt(/^Favoriten$/)) - row.getBoundingClientRect().bottom) };
});
await check('Player → „Favoriten“ wie Badges → „Aktuelle Wiedergabe“', Math.abs(m.player_bis_Favoriten - m.badges_bis_Wiedergabe) <= 2, { badges: m.badges_bis_Wiedergabe, player: m.player_bis_Favoriten });
await finish();
