// @zustand: arbeit
// Gewünscht (07.10.2026): Die Kurzfassung des Sicherheits-Badges (Symbole mit Zahl) passt auf die
// Startseite, in Räumen gibt es meist nur ein Fenster oder eine Tür – dort soll es ausgeschrieben
// bleiben („Tür offen“). Standard „Automatisch“: Startseite kurz, Raum in Worten. Zustände werden
// nur im Browser untergeschoben (alle Tür-/Fensterkontakte offen), Theme „Casora“.
import { open, casoraDashboards, dashboard, fakeStates, stable, check, need, finish } from './lib.mjs';

const hasSec = (V) => Object.keys(V || {}).some((k) => /^security_(entity_\d|locks|lock_entity)/.test(k) && V[k] && (!Array.isArray(V[k]) || V[k].length));
const dash = (await casoraDashboards()).find((d) => !d.mobile && (d.config.views || []).length > 1
  && (d.config.views || []).filter((v) => hasSec(((v.cards || [])[0] || {}).variables)).length >= 2);
await need('Desktop-Dashboard mit Sicherheit auf Startseite und in einem Raum', dash);
const views = dash.config.views;
const homeIdx = Math.max(0, views.findIndex((v) => v.path === 'home'));
const roomIdx = views.findIndex((v, i) => i !== homeIdx && hasSec(((v.cards || [])[0] || {}).variables)
  && !(((v.cards || [])[0] || {}).variables || {}).security_summary);
await need('Raum mit Sicherheit auf „Automatisch“', roomIdx >= 0);

const { page } = await open({ width: 1600, height: 1000, dark: false, theme: 'Casora' });
const badge = () => window.__pierce('button-card')
  .filter((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group') && b.getBoundingClientRect().width > 0)
  .map((b) => ({ sym: b.shadowRoot.innerHTML.includes('cs-sum'), text: b.shadowRoot.querySelector('ha-card').innerText.replace(/\s+/g, ' ').trim(),
    home: window.casoraOnHomeView ? window.casoraOnHomeView(b) : null }));
const openAll = async () => {
  const ids = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((e) => e.startsWith('binary_sensor.') && ['door', 'window', 'opening'].includes(S[e].attributes.device_class)); });
  await fakeStates(page, Object.fromEntries(ids.map((e) => [e, { state: 'on' }])), { sticky: true });
};
const at = (v, i) => dash.url + '/' + (v.path || String(i));

await dashboard(page, at(views[homeIdx], homeIdx));
await openAll();
const soft = await page.evaluate(() => !!(window._casoraSoft && window._casoraSoft()));
await need('Theme „Casora“ aktiv', soft);
const home = await stable(page, badge);
await check('Startseite: Sicherheit erkennt die Startseite', home.length && home.every((b) => b.home === true), home);
await check('Startseite: Kurzfassung mit Symbolen', home.length && home.every((b) => b.sym || /Alles sicher|Aktiv|Alarm/.test(b.text)), home);

await dashboard(page, at(views[roomIdx], roomIdx));
await openAll();
const room = await stable(page, badge);
await check(`Raum (${views[roomIdx].path}): kein Startseiten-Treffer`, room.length && room.every((b) => b.home === false), room);
await check(`Raum (${views[roomIdx].path}): ausgeschrieben, keine Symbole`, room.length && room.every((b) => !b.sym), room);
await check(`Raum (${views[roomIdx].path}): Worte wie „offen“`, room.some((b) => /offen|Alles sicher|gekippt|offline/.test(b.text)), room);
await finish();
