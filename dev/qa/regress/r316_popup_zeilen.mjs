// @zustand: arbeit
// #54: a room climate tile (casora_vent) on a room page opened the house popup – in the garden the indoor
// rooms with their temperatures. Expected: the popup follows the page (garden = outdoor air only, a room =
// its own row, Home = the house) and rows switched off in the Studio (variables.popup_hide) stay out of the
// popup, the tile and show as „off“ in the Studio list „Im Popup zeigen“. Copies of the arbeit dashboards
// with three room climate tiles (qa-popupzeilen-r, deleted at the end); nothing else is saved.
import { open, studio, casoraDashboard, dashboard, stable, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => d.url === 'qa-arbeit' || (d.config.views || []).some((v) => v.path === 'garten'));
await need('Desktop dashboard with a garden room and its phone counterpart', dash && dash.phone && dash.config.views.some((v) => v.path === 'garten'));
const URL = 'qa-popupzeilen-r';
const vent = (extra) => ({ type: 'custom:button-card', template: 'casora_vent', name: 'Raumklima', ...(extra || {}) });
const D = JSON.parse(JSON.stringify(dash.config)), M = JSON.parse(JSON.stringify(dash.phone.config));
const row = (view) => view && view.cards.find((x) => x.type === 'custom:casora-smart-row');
const wz = D.views.find((v) => v.path === 'wohnzimmer');
await need('Rooms garten and wohnzimmer with a tile row', row(D.views.find((v) => v.path === 'garten')) && row(wz) && row(D.views[0]));
row(D.views.find((v) => v.path === 'garten')).cards.unshift(vent());
row(wz).cards.unshift(vent());
row(D.views[0]).cards.unshift(vent({ variables: { popup_hide: ['kuche'] } }));
const sr = M.views[0].cards.find((x) => x.type === 'custom:casora-smart-row');
const gi = sr ? sr.cards.findIndex((x) => [].concat(x.template || []).includes('casora_mobile_header') && x.name === 'Garten') : -1;
await need('Phone dashboard with a Garten header', gi >= 0);
// The room page (casora-filter-overlay) takes the tiles of the smart-row right after the room's header.
const nx = sr.cards[gi + 1];
if (nx && nx.type === 'custom:casora-smart-row') (nx.cards = nx.cards || []).unshift(vent({ variables: { casora_from_room: true } }));
else sr.cards.splice(gi + 1, 0, { type: 'custom:casora-smart-row', cards: [vent({ variables: { casora_from_room: true } })] });

const c = await ws();
const made = [];
for (const [u, cfg, title] of [[URL, D, 'QA Popupzeilen'], [URL + '-mobile', M, 'QA Popupzeilen Handy']]) {
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  if (!list.some((d) => d.url_path === u)) await c.cmd({ type: 'lovelace/dashboards/create', url_path: u, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
  await c.cmd({ type: 'lovelace/config/save', url_path: u, config: cfg });
  made.push(u);
}
const rooms = ((await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === 'sensor.casora_lueften') || { attributes: {} }).attributes.rooms || [];
c.close();
await need('sensor.casora_lueften knows indoor rooms incl. Küche and Wohnzimmer', rooms.some((r) => r.k === 'kuche') && rooms.some((r) => r.k === 'wohnzimmer'), rooms.map((r) => r.k));
const others = rooms.map((r) => r.n).filter((n) => n !== 'Wohnzimmer');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});

const tile = () => window.__pierce('button-card')
  .filter((b) => [].concat((b._config || {}).template || []).includes('casora_vent'))
  .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width,
    text: (((b.shadowRoot && b.shadowRoot.querySelector('ha-card')) || {}).innerText || '').replace(/\s+/g, ' ').trim() }; })
  .filter((b) => b.w > 0);
const popup = () => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const out = [];
  const walk = (root) => root.childNodes.forEach((n) => {
    if (n.nodeType === 3) { if (n.data.trim()) out.push(n.data.trim()); return; }
    if (n.nodeType !== 1 || n.localName === 'style' || n.localName === 'script') return;
    if (n.shadowRoot) walk(n.shadowRoot);
    walk(n);
  });
  walk(p.shadowRoot || p);
  return out.join(' ');
};
const hasAny = (txt, names) => names.filter((n) => new RegExp('(^|\\s)' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(txt || ''));

const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
const openPopup = async (url, mobile) => {
  await dashboard(page, url);
  const t = await stable(page, tile);
  await need('Room climate tile on ' + url, t.length, t);
  if (mobile) await page.touchscreen.tap(t[0].x, t[0].y); else await page.mouse.click(t[0].x, t[0].y);
  const txt = await stable(page, popup, undefined, { max: 9000, quiet: 900 });
  await page.keyboard.press('Escape');
  return { tile: t[0].text, txt: txt || '' };
};
let r = await openPopup(URL + '/garten');
await check('Desktop garden: no indoor room in the popup', !hasAny(r.txt, rooms.map((x) => x.n)).length && !/Räume/.test(r.txt), r.txt.slice(0, 200));
await check('Desktop garden: the outdoor air is there', /Außenluft/.test(r.txt), r.txt.slice(0, 200));
await check('Desktop garden: the tile does not count the rooms', !/Räume/.test(r.tile), r.tile);
r = await openPopup(URL + '/wohnzimmer');
await check('Desktop living room: only its own row', /Wohnzimmer/.test(r.txt) && !hasAny(r.txt, others).length, r.txt.slice(0, 200));
r = await openPopup(URL + '/home');
await check('Desktop Home: the house without the hidden Küche', /Räume/.test(r.txt) && /Wohnzimmer/.test(r.txt) && !hasAny(r.txt, ['Küche']).length, r.txt.slice(0, 200));

// Phone: the room page of the garden (filter room_garten).
const ph = await open({ width: 393, height: 852, mobile: true, theme: 'Casora' });
await dashboard(ph.page, URL + '-mobile/home');
await ph.page.evaluate(() => window._casoraFilter && window._casoraFilter.set('room_garten'));
await ph.page.waitForTimeout(600);
const pt = await stable(ph.page, tile);
await check('Phone garden page: room climate tile shown', pt.length, pt);
if (pt.length) {
  await ph.page.touchscreen.tap(pt[0].x, pt[0].y);
  const txt = (await stable(ph.page, popup, undefined, { max: 9000, quiet: 900 })) || '';
  await check('Phone garden: no indoor room in the popup', !hasAny(txt, rooms.map((x) => x.n)).length && /Außenluft/.test(txt), txt.slice(0, 200));
}

// Studio: „Im Popup zeigen“ on the Home tile (Küche off), nothing to hide in the garden.
await studio(page, URL);
const form = async (path) => page.evaluate(async (p0) => {
  const p = window.__panel();
  const ri = p._state.compact.rooms.findIndex((r) => r.path === p0);
  const t = (p._state.compact.rooms[ri].tiles || []).find((x) => x.template === 'casora_vent');
  if (!t) return { err: 'no tile in ' + p0 };
  p._room = ri; p._sel = null;
  p._select({ group: 'tiles', key: p._tileKey(t) });
  await new Promise((r) => setTimeout(r, 800));
  const pop = [...p.shadowRoot.querySelectorAll('#pane .advsum')].find((b) => /^Popup/.test(b.textContent.trim()));
  if (!pop) return { err: 'no popup fold' };
  if (pop.getAttribute('aria-expanded') !== 'true') pop.click();
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 300));
    const rows = [...p.shadowRoot.querySelectorAll('#pane .advbody .row')].map((r) => {
      const l = r.querySelector('label'), sw = r.querySelector('.sw');
      return { label: (l ? l.textContent : '').replace(/\s+/g, ' ').trim(), on: sw ? sw.getAttribute('aria-checked') : null, text: r.textContent.replace(/\s+/g, ' ').trim() };
    });
    if (!rows.some((r) => /Lädt|Loading/.test(r.text))) return { rows };
  }
  return { err: 'still loading' };
}, path);
let f = await form('home');
await check('Studio Home: list „Im Popup zeigen“', f.rows && f.rows.some((r) => /Im Popup zeigen|Shown in the popup/.test(r.label)), f.err || f.rows);
if (f.rows) {
  const ku = f.rows.find((r) => r.label.startsWith('Küche')), wo = f.rows.find((r) => r.label.startsWith('Wohnzimmer'));
  await check('Studio Home: Küche off, Wohnzimmer on', ku && ku.on === 'false' && wo && wo.on === 'true', { ku, wo });
}
f = await form('garten');
await check('Studio garden: nothing to hide (no indoor rows)', f.rows && !f.rows.some((r) => /^(Küche|Wohnzimmer|Schlafzimmer)/.test(r.label))
  && f.rows.some((r) => /Im Popup zeigen|Shown in the popup/.test(r.label)), f.err || f.rows);
await finish();
