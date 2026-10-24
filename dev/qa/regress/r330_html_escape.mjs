// @zustand: arbeit
// @deckt: custom_components/casora/scripts/casora-core.js custom_components/casora/scripts/local/04-navigation.js custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/local/06-kalender.js tools/html-escape-check.mjs
// HTML escaping (HACS review hacs/default#12143, point 4): entity names and config strings went into innerHTML
// unescaped. A device or integration can name an entity "<img src=x onerror=…>". Here a light, a person, a scene,
// a calendar, the room's area and the room's name in the dashboard get markup as their names (calendar event
// text and a media title as well, in this browser only). Expected on Home, the room page, the light, presence and
// calendar popups, the scene menu and in the Studio: the names show as plain characters, no element or attribute
// from them exists in the DOM, no page error. Renames on the test HA only, restored at the end.
import { open, usePage, casoraDashboard, dashboard, cards, stable, check, need, finish, atFinish, studio, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const H = (what) => 'QA' + what + '<xss-a>" xss-e="1\' xss-f=\'1 &amp;';
const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard', dash);
const c = await ws();
const reg = await c.cmd({ type: 'config/entity_registry/list' });
const areas = await c.cmd({ type: 'config/area_registry/list' });
const statesNow = await c.cmd({ type: 'get_states' });
c.close();
const regOf = (id) => reg.find((e) => e.entity_id === id);
const has = (id) => statesNow.some((s) => s.entity_id === id);

// A room view with a light badge; its first light, its area, a person, a scene and a calendar of the house.
const d0 = JSON.parse(JSON.stringify(dash.config));
// The Studio (opened below) writes the phone layout from the desktop one, hostile room name included: restore it too.
const m0 = dash.phone ? JSON.parse(JSON.stringify(dash.phone.config)) : null;
const d = JSON.parse(JSON.stringify(d0));
const view = d.views.slice(1).find((v) => { const x = ((v.cards || [])[0] || {}).variables || {}; return x.light_entity_1 && regOf(x.light_entity_1); });
await need('Room with a light badge', view);
const RV = view.cards[0].variables;
const light = RV.light_entity_1;
const area = (regOf(light) || {}).area_id || (areas[0] || {}).area_id;
const person = (statesNow.find((s) => s.entity_id.startsWith('person.') && regOf(s.entity_id)) || {}).entity_id;
const scene = (statesNow.find((s) => s.entity_id.startsWith('scene.') && regOf(s.entity_id)) || {}).entity_id;
const calendar = (statesNow.find((s) => s.entity_id.startsWith('calendar.') && regOf(s.entity_id)) || {}).entity_id;
const renames = [[light, H('Licht')], [person, H('Person')], [scene, H('Szene')], [calendar, H('Kalender')]].filter(([id]) => id && regOf(id));
await need('Entities to rename', renames.length >= 2, renames);

const old = { names: renames.map(([id]) => [id, regOf(id).name]), area: areas.find((a) => a.area_id === area) };
const roomName0 = view.cards[0].name;
const save = async (cfg) => { const k = await ws(); await k.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); k.close(); };
let restored = false;
atFinish(async () => {
  if (restored) return;
  restored = true;
  const k = await ws();
  for (const [id, name] of old.names) await k.cmd({ type: 'config/entity_registry/update', entity_id: id, name: name || null }).catch(() => {});
  if (old.area) await k.cmd({ type: 'config/area_registry/update', area_id: old.area.area_id, name: old.area.name }).catch(() => {});
  k.close();
  await save(d0);
  if (m0) { const k2 = await ws(); await k2.cmd({ type: 'lovelace/config/save', url_path: dash.phone.url, config: m0 }); k2.close(); }
});
{
  const k = await ws();
  for (const [id, name] of renames) await k.cmd({ type: 'config/entity_registry/update', entity_id: id, name });
  if (old.area) await k.cmd({ type: 'config/area_registry/update', area_id: old.area.area_id, name: H('Bereich') });
  k.close();
}
// The room's own name and a badge title from the dashboard config.
if (typeof roomName0 === 'string' || roomName0 == null) view.cards[0].name = H('Raum');
RV.lights_title = H('Badge');
// A light tile, a presence badge and a calendar tile on the room page (the house has no such card there).
view.cards.push({ type: 'custom:button-card', template: 'casora_light', entity: light });
if (person) view.cards.push({ type: 'custom:button-card', template: 'casora_badge_presence', entity: person });
if (calendar) view.cards.push({ type: 'custom:button-card', template: 'casora_calendar', entity: calendar });
await save(d);

// Injected elements or attributes anywhere in the page (through all shadow roots), and literal text found.
const scan = (pg) => pg.evaluate(() => {
  const els = window.__pierce('*');
  const inj = els.filter((e) => e.localName === 'xss-a');
  const tags = inj.length;
  // Where: host chain and the markup around the first injected element.
  const at = inj.slice(0, 2).map((e) => {
    const hosts = [];
    for (let n = e; n; n = (n.getRootNode && n.getRootNode().host) || null) {
      if (n !== e) hosts.push(n.localName + (n._config && n._config.template ? '[' + [].concat(n._config.template).join(',') + ']' : ''));
      if (hosts.length > 5) break;
    }
    return hosts.join(' < ') + ' :: ' + (e.parentElement ? e.parentElement.outerHTML.slice(0, 220) : '');
  });
  const attrs = els.filter((e) => e.hasAttribute && (e.hasAttribute('xss-e') || e.hasAttribute('xss-f'))).length;
  const text = els.some((e) => e.shadowRoot && /QA\w+<xss-a>/.test(e.shadowRoot.textContent || ''))
    || /QA\w+<xss-a>/.test(document.body.innerText || '');
  // Escaped twice: the name would read "&lt;xss-a&gt;".
  const twice = els.some((e) => e.shadowRoot && /&lt;xss-a/.test(e.shadowRoot.textContent || '')) || /&lt;xss-a/.test(document.body.innerText || '');
  return { tags, attrs, text, twice, at };
});
const popupOpen = (pg) => pg.evaluate(() => window.__pierce('casora-popup').some((x) => { const b = x.getBoundingClientRect(); return b.width > 0 && b.height > 0; })
  || !!document.querySelector('home-assistant').shadowRoot.querySelector('ha-more-info-dialog'));
// Tap a card the way the user does, also when another layer covers its centre.
const tap = (pg, c) => pg.evaluate((i) => {
  const b = window.__pierce('button-card').map((x, k) => [x, k]).find(([, k]) => k === i);
  const card = b && b[0].shadowRoot && b[0].shadowRoot.querySelector('ha-card');
  if (card) card.click();
}, c.i);
const clean = (r) => r.tags === 0 && r.attrs === 0 && !r.twice;
const errors = [];
const watchErrors = (pg) => {
  pg.on('pageerror', (e) => errors.push(String(e && e.message || e)));
  pg.on('console', (m) => { if (m.type() === 'error' && /xss|Unexpected token|SyntaxError|Invalid or unexpected/i.test(m.text())) errors.push(m.text()); });
};

const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
watchErrors(page);
await dashboard(page, dash.url + '/' + view.path, 2);
// Calendar event text and a media title in this browser only (the mock has no event to rename).
const patch = {};
if (calendar) patch[calendar] = { state: 'on', attributes: { message: H('Termin'), description: H('Text'), location: H('Ort'), all_day: false,
  start_time: new Date(Date.now() - 600000).toISOString().slice(0, 19).replace('T', ' '), end_time: new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ') } };
const mp = (statesNow.find((s) => s.entity_id.startsWith('media_player.')) || {}).entity_id;
if (person) patch[person] = { state: 'home', attributes: {} };
if (mp) patch[mp] = { state: 'playing', attributes: { media_title: H('Titel'), media_artist: H('Kuenstler') } };
await fakeStates(page, patch, { sticky: true });
let s = await stable(page, () => window.__pierce('button-card').length, null, { max: 8000 });
void s;
let r = await scan(page);
await check('Room page: no element or attribute from names', clean(r), r);
await check('Room page: the names show as plain characters', r.text, r);

// Light, presence and calendar popups (cards added to the room page above).
for (const [tpl, label] of [['casora_light', 'Light popup'], ['casora_badge_presence', 'Presence popup'], ['casora_calendar', 'Calendar popup']]) {
  if ((tpl === 'casora_badge_presence' && !person) || (tpl === 'casora_calendar' && !calendar)) continue;
  await dashboard(page, dash.url + '/' + view.path, 2);
  await fakeStates(page, patch, { sticky: true });
  const c0 = (await cards(page, tpl))[0];
  await check(label + ': card on the page', !!c0);
  if (!c0) continue;
  await tap(page, c0);
  await page.waitForTimeout(2000);
  await check(label + ' open', await popupOpen(page));
  r = await scan(page);
  await check(label + ': nothing injected', clean(r), r);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}
// Home.
await dashboard(page, dash.url + '/' + (d.views[0].path || 'home'), 2);
await fakeStates(page, patch, { sticky: true });
r = await scan(page);
await check('Home: nothing injected', clean(r), r);
// Scene menu of the phone navigation (04-navigation.js) – the reviewer's example.
const ph = await open({ width: 393, height: 852, mobile: true, dark: true });
usePage(ph.page);
watchErrors(ph.page);
if (dash.phone) {
  await dashboard(ph.page, dash.phone.url + '/home', 2);
  await ph.page.evaluate(() => { const n = window.__pierce('casora-mobile-nav')[0]; if (n && n._openMenu) try { n._openMenu('scenes'); } catch (e) { /* other menu API */ } });
  await ph.page.waitForTimeout(1500);
  r = await scan(ph.page);
  await check('Phone: nothing injected', clean(r), r);
}
usePage(page);

// Studio with the same dashboard.
await studio(page, dash.url);
await page.waitForTimeout(2000);
r = await scan(page);
await check('Studio: nothing injected', clean(r), r);

await check('No page error', errors.length === 0, errors.slice(0, 5));
await finish();
