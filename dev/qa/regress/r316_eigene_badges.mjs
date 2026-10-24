// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/27-eigene-badges.js tools/phone_room_badges.py
// Own badges (#53): a room gets two badges of its own – one from a device (its state), one from a Jinja
// template (its text, rendered live over the WebSocket). Expected: both in the room header on the desktop and
// on the phone room page, the template's text as text (HTML in a result stays visible characters, never
// markup), a tap on the device badge opens its popup, and with "Wrap badges onto more lines" the row becomes a
// wrapping flex row without the sideways scroll. Writes the desktop dashboard (test HA only) and restores it.
import { open, usePage, casoraDashboard, dashboard, cards, stable, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);
const d0 = JSON.parse(JSON.stringify(dash.config));
const d = JSON.parse(JSON.stringify(d0));
// A room (not Home) with a light badge: its first light becomes the device badge.
const view = d.views.slice(1).find((v) => ((v.cards || [])[0] || {}).variables && (v.cards[0].variables.light_entity_1 || v.cards[0].variables.light_group_entity));
await need('Room with a light in its badges', view);
const RV = view.cards[0].variables;
const light = RV.light_entity_1 || RV.light_group_entity;
const BADGES = [
  { name: 'QA Lampe', entity: light, tap: 'popup', color: 'var(--casora-color-orange, #FF9230)' },
  { name: 'QA Vorlage', template: "{{ '<b>Sonne</b> ' ~ states('sun.sun') }}", icon: 'default' },
];
RV.custom_badges = BADGES;
const save = async (cfg) => { const c = await ws(); await c.cmd({ type: 'lovelace/config/save', url_path: dash.url, config: cfg }); c.close(); };
await save(d);
let restored = false;
atFinish(async () => { if (!restored) { restored = true; await save(d0); } });

const { page } = await open({ width: 1440, height: 900, dark: true });
usePage(page);
await dashboard(page, dash.url + '/' + view.path, 2);
await stable(page, () => window.__pierce('button-card')
  .filter((x) => [].concat((x._config || {}).template || []).includes('casora_badge_custom') && x.getBoundingClientRect().width > 0).length,
  null, { max: 15000, until: (n) => n >= 2 });
const own = await cards(page, 'casora_badge_custom');
const texts = own.map((c) => c.text);
await check('Desktop: two own badges in the room header', own.length === 2, texts);
await check('Device badge shows name and state', texts.some((t) => /QA Lampe/.test(t) && /(An|Aus|On|Off|%)/.test(t)), texts);
const tplText = await stable(page, () => {
  const txt = (x) => { const c = x.shadowRoot && x.shadowRoot.querySelector('ha-card'); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; };
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_custom') && /QA Vorlage/.test(txt(x)));
  return b ? txt(b) : null;
}, null, { max: 12000, until: (t) => !!t && /horizon/.test(t) });
await check('Template badge shows the rendered text', /QA Vorlage .*<b>Sonne<\/b> (above|below)_horizon/.test(tplText || ''), tplText);
const markup = await page.evaluate(() => window.__pierce('button-card')
  .filter((x) => [].concat((x._config || {}).template || []).includes('casora_badge_custom'))
  .some((x) => !!x.shadowRoot.querySelector('#name b')));
await check('HTML in a template result stays text (no <b> element)', !markup);
// Own badges stand after the built-in ones.
const all = await cards(page);
const lastBuiltIn = Math.max(...all.filter((c) => c.t.some((t) => /^casora_badge_(?!custom)/.test(t)) && Math.abs(c.y - own[0].y) < 30).map((c) => c.x), 0);
await check('Own badges come after the built-in badges', own.every((c) => c.x > lastBuiltIn), { lastBuiltIn, own: own.map((c) => c.x) });
// Tap on the device badge opens a popup (Casora light popup or HA's dialog).
const lamp = own.find((c) => /QA Lampe/.test(c.text));
await page.mouse.click(lamp.x + lamp.w / 2, lamp.y + lamp.h / 2);
await page.waitForTimeout(1500);
const popup = await page.evaluate(() => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (p) return 'casora';
  const h = document.querySelector('home-assistant');
  return h && h.shadowRoot.querySelector('ha-more-info-dialog') ? 'ha' : null;
});
await check('Tap on the device badge opens a popup', !!popup, popup);
await page.keyboard.press('Escape');

// Wrap option: a flex row that wraps, no sideways scroll attribute.
d.views.forEach((v) => { const c0 = (v.cards || [])[0]; if (c0 && c0.variables && [].concat(c0.template || []).includes('casora_room')) c0.variables.badges_wrap = true; });
await save(d);
await dashboard(page, dash.url + '/' + view.path, 2);
const layout = await stable(page, () => {
  const room = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_room') && b.getBoundingClientRect().width > 0);
  const row = room && room.shadowRoot.querySelector('#badges');
  const under = (el) => { let n = el; while (n) { if (n === row) return true; n = n.parentNode || n.host; } return false; };
  const grid = row && window.__pierce('grid-layout').find(under);
  const root = grid && grid.shadowRoot && grid.shadowRoot.querySelector('#root');
  if (!root) return null;
  const cs = getComputedStyle(root);
  return { display: cs.display, wrap: cs.flexWrap, scroll: row.hasAttribute('data-cs-scroll') };
}, null, { max: 10000, until: (v) => !!v && v.display === 'flex' });
await check('Wrap option: the badge row is a wrapping flex row without sideways scroll', !!layout && layout.display === 'flex' && layout.wrap === 'wrap' && !layout.scroll, layout);

// Phone room page: the same two badges.
const ph = await open({ width: 393, height: 852, mobile: true, dark: true });
usePage(ph.page);
await dashboard(ph.page, dash.phone.url + '/home', 2);
await ph.page.evaluate(() => window.casoraPhoneRoom && window.casoraPhoneRoom.refresh && window.casoraPhoneRoom.refresh());
await ph.page.waitForTimeout(1500);
const key = 'room_' + String(view.cards[0].name || view.title || view.path).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
await ph.page.evaluate((k) => window._casoraFilter.set(k), key);
// Only the room page's row (the start page's row with Home's own badges stays in the DOM).
const pown = await stable(ph.page, () => {
  const chips = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  const row = chips && chips.shadowRoot.querySelector('#rooms_row');
  if (!row) return null;
  const r = row.getBoundingClientRect();
  return window.__pierce('button-card')
    .filter((x) => [].concat((x._config || {}).template || []).includes('casora_badge_custom') && x.getBoundingClientRect().width > 0)
    .filter((x) => { const q = x.getBoundingClientRect(); return q.y >= r.y - 4 && q.bottom <= r.bottom + 4; })
    .map((x) => x.shadowRoot.querySelector('ha-card').innerText.replace(/\s+/g, ' ').trim());
}, null, { max: 15000, until: (v) => Array.isArray(v) && v.filter((t) => /QA /.test(t)).length >= 2 });
const mine = (pown || []).filter((t) => /QA /.test(t));
await check('Phone room page: both own badges', mine.length === 2 && mine.some((t) => /QA Lampe/.test(t)) && mine.some((t) => /QA Vorlage/.test(t)), pown);
const prow = await ph.page.evaluate(() => {
  const chips = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_sensor_chips'));
  const row = chips && chips.shadowRoot.querySelector('#rooms_row');
  const under = (el) => { let n = el; while (n) { if (n === row) return true; n = n.parentNode || n.host; } return false; };
  const grid = row && window.__pierce('grid-layout').find(under);
  const root = grid && grid.shadowRoot && grid.shadowRoot.querySelector('#root');
  return root ? getComputedStyle(root).display : null;
});
await check('Phone room page wraps as well', prow === 'flex', prow);

await finish();
