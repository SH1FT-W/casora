// @zustand: arbeit
// @parallel: allein   (creates qa-ebike as a copy of the Casora desktop dashboard, deleted at the end)
// @deckt: custom_components/casora/scripts/local/03-popups.js dev/casora_mock/ebike.py
// Reported (forum, 24.10.2026): with the Bosch eBike integration 1.19 the e-bike tile and popup showed only
// „Diebstahl: Nicht gemeldet“ and an empty „Nächster Service“ – in a German HA the entity ids read
// sensor.<rad>_tage_seit_letzter_fahrt, the old prefix logic anchored on one English suffix and found just
// the theft sensor. Expected: the bike is found by its device (test house: „Testrad“, dev/casora_mock/ebike.py),
// the tile shows the last ride, the popup fills odometer, service (days and km computed from the date entity
// and the due odometer), range per mode with the assist modes, rides, battery, theft and last location –
// no „—“ anywhere and no note about the integration. Pictures: CASORA_OUT (tile, popup).
import { open, casoraDashboard, dashboard, stable, check, need, finish, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

const KM = 'sensor.testrad_kilometerstand';
const c0 = await ws();
const S = await c0.cmd({ type: 'get_states' });
c0.close();
const st = (id) => S.find((s) => s.entity_id === id);
await need('test house with the Testrad (Bosch eBike 1.19 style, German ids)', st(KM) && st('binary_sensor.testrad_theft_reported') && st('date.testrad_service_due_date'));
const km = Math.round(parseFloat(st(KM).state));
const dueKm = Math.round(parseFloat(st('number.testrad_service_due_odometer').state) - parseFloat(st(KM).state));
const today = new Date(); today.setHours(0, 0, 0, 0);
const [y, m, d] = st('date.testrad_service_due_date').state.split('-').map(Number);
const dueDays = Math.round((new Date(y, m - 1, d) - today) / 86400000);
const since = Math.round(parseFloat(st('sensor.testrad_tage_seit_letzter_fahrt').state));

// Copy of the Casora desktop dashboard with the e-bike tile first on the home page.
const dash = await casoraDashboard((x) => x.url === 'qa-arbeit' || (x.config.views || []).some((v) => (v.cards || []).some((k) => k.type === 'custom:casora-smart-row')));
await need('Casora desktop dashboard with a tile row on the home page', dash && dash.config.views && dash.config.views[0]);
const URL = 'qa-ebike';
const D = JSON.parse(JSON.stringify(dash.config));
const row = (view) => view && (view.cards || []).find((x) => x.type === 'custom:casora-smart-row');
await need('tile row on the home page', row(D.views[0]));
row(D.views[0]).cards.unshift({ type: 'custom:button-card', template: 'casora_ebike', name: 'Testrad', entity: KM, variables: { icon: 'ebike', size: 'auto' } });
const c = await ws();
const list = await c.cmd({ type: 'lovelace/dashboards/list' });
if (!list.some((x) => x.url_path === URL)) await c.cmd({ type: 'lovelace/dashboards/create', url_path: URL, title: 'QA E-Bike', mode: 'storage', show_in_sidebar: false, require_admin: false });
await c.cmd({ type: 'lovelace/config/save', url_path: URL, config: D });
c.close();
atFinish(async () => {
  const c2 = await ws();
  const l2 = await c2.cmd({ type: 'lovelace/dashboards/list' });
  const x = l2.find((q) => q.url_path === URL);
  if (x) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: x.id });
  c2.close();
});

const tile = () => window.__pierce('button-card')
  .filter((b) => [].concat((b._config || {}).template || []).includes('casora_ebike'))
  .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, l: r.x, t: r.y,
    text: (((b.shadowRoot && b.shadowRoot.querySelector('ha-card')) || {}).innerText || '').replace(/\s+/g, ' ').trim() }; })
  .filter((b) => b.w > 0);
// Every text of the open popup, hidden „Mehr“ parts included (they are in the tree, only folded).
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
const fmt = (n) => n.toLocaleString('de-DE');

const { page } = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
await dashboard(page, URL);
const t = await stable(page, tile);
await need('e-bike tile on the home page', t.length, t);
await check('tile: last ride instead of „Keine Daten“', new RegExp('Letzte Fahrt vor ' + since + ' T\\.|Heute gefahren|Gestern gefahren').test(t[0].text), t[0].text);
await page.screenshot({ path: `${process.env.CASORA_OUT || '/tmp/casora-qa'}/r323_kachel.png`, clip: { x: Math.max(0, t[0].l - 12), y: Math.max(0, t[0].t - 12), width: t[0].w + 24, height: t[0].h + 24 } });
await page.mouse.click(t[0].x, t[0].y);
let txt = (await stable(page, popup, undefined, { max: 9000, quiet: 900 })) || '';
await need('popup opens', txt.length > 0);
// Unfold „Mehr“ for the picture (the text check does not need it).
await page.evaluate(() => { const tg = window.__pierce('[data-casora-more-tg]').find((e) => e.getBoundingClientRect().width > 0); if (tg) tg.click(); });
await page.waitForTimeout(700);
await shot('popup');
txt = popup ? (await page.evaluate(popup)) || txt : txt;

await check('head: odometer ' + fmt(km) + ' km', txt.includes(fmt(km)) && /km/.test(txt), txt.slice(0, 300));
await check('next service: date with remaining days (computed from the date entity)', new RegExp('Nächster Service.{0,40}\\b\\d{2}\\.\\d{2}\\.\\d{4}\\b').test(txt) && txt.includes('in ' + fmt(dueDays) + ' Tagen'), txt.match(/Nächster Service.{0,80}/) || txt.slice(0, 200));
await check('service by distance: ' + dueKm + ' km (due odometer minus odometer)', txt.includes('in ' + fmt(dueKm) + ' km'), txt.match(/Service nach Strecke.{0,40}/) || '-');
await check('range per mode with names and the active assist modes', /Reichweite je Modus/.test(txt) && /Eco/.test(txt) && /84 km/.test(txt) && /Turbo/.test(txt) && /Unterstützungsmodi/.test(txt) && /Eco, Auto, Sport, Turbo/.test(txt), txt.match(/Reichweite je Modus.{0,160}/) || '-');
await check('rides: count, recorded km and total ride time', /Fahrten/.test(txt) && /58/.test(txt) && /aufgezeichnet/.test(txt) && /Fahrzeit gesamt/.test(txt) && /73 Std\./.test(txt), txt.match(/Fahrten.{0,120}/) || '-');
await check('battery: charge cycles with capacity and health', /Ladezyklen/.test(txt) && /9,7/.test(txt) && /PowerTube 750 Wh/.test(txt) && /Akku-Gesundheit/.test(txt) && /96[\s ]%/.test(txt), txt.match(/Ladezyklen.{0,120}/) || '-');
await check('last ride with title, distance and power', /Feierabendrunde/.test(txt) && /23,4 km/.test(txt) && /Eigene Leistung/.test(txt) && /112 W/.test(txt), txt.match(/Letzte Fahrt.{0,200}/) || '-');
await check('theft not reported and last location at home', /Diebstahl/.test(txt) && /Nicht gemeldet/.test(txt) && /Zuletzt gesehen/.test(txt) && /Zuhause/.test(txt), txt.match(/Diebstahl.{0,80}/) || '-');
await check('no empty value („—“) in the popup', !txt.includes('—') || /\d–\d/.test(txt) && !/—/.test(txt), (txt.match(/.{0,40}—.{0,40}/g) || []).slice(0, 3));
await check('no note about the integration (the bike was found)', !/Für Räder mit Bosch Smart System/.test(txt));
await page.keyboard.press('Escape');
await finish();
