// @zustand: arbeit
// #39 follow-up (fresh install): Home without security entries of its own. The security badge counted the
// house's doors and windows only on the phone; on a tablet/desktop it stayed hidden, and a tap led nowhere
// (desktop: empty row, phone: a filter with nothing in it). Expected: the badge on every device, a tap
// opens „Türen & Fenster“ of the whole house. Copies of the arbeit dashboards without security entries
// on Home (qa-sicher-leer, deleted at the end); door and window states only faked in the browser.
import { open, casoraDashboard, dashboard, fakeStates, stable, check, need, finish, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Desktop dashboard with its phone counterpart', dash && dash.phone);
const SEC = /^(security_(entity_\d+|locks|lock_entity(_2)?|cameras|label_\d+)|alarm_entity|lock_entity(_2)?)$/;
const homeIdx = (cfg) => Math.max(0, (cfg.views || []).findIndex((v) => v.path === 'home'));
const strip = (cfg) => {
  const c = JSON.parse(JSON.stringify(cfg));
  (function walk(x) {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    Object.keys(x).forEach((k) => { if (SEC.test(k)) delete x[k]; else walk(x[k]); });
  })(c.views[homeIdx(c)]);
  return c;
};
const c = await ws();
const made = [];
const save = async (url, cfg, title) => {
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  if (!list.some((d) => d.url_path === url)) {
    await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
  }
  await c.cmd({ type: 'lovelace/config/save', url_path: url, config: cfg });
  made.push(url);
};
const D = strip(dash.config), M = strip(dash.phone.config);
await save('qa-sicher-leer', D, 'QA Sicherheit leer');
await save('qa-sicher-leer-mobile', M, 'QA Sicherheit leer Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});
c.close();

const badge = () => window.__pierce('button-card')
  .filter((b) => [].concat((b._config || {}).template || []).includes('casora_badge_security_group'))
  .map((b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width,
    text: ((b.shadowRoot && b.shadowRoot.querySelector('ha-card')) || {}).innerText || '' }; })
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
  return out.join(' ').slice(0, 200);
};
const openAll = async (page) => {
  const ids = await page.evaluate(() => { const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((e) => e.startsWith('binary_sensor.') && ['door', 'window'].includes(S[e].attributes.device_class)); });
  await need('Doors or windows in the house', ids.length, ids);
  await fakeStates(page, Object.fromEntries(ids.map((e) => [e, { state: 'on' }])), { sticky: true });
};

for (const dev of [
  { name: 'Desktop', url: 'qa-sicher-leer', idx: homeIdx(D), o: { width: 1440, height: 900, theme: 'Casora' } },
  { name: 'Tablet quer', url: 'qa-sicher-leer', idx: homeIdx(D), o: { width: 1024, height: 768, theme: 'Casora' } },
  { name: 'Handy', url: 'qa-sicher-leer-mobile', idx: homeIdx(M), o: { width: 393, height: 852, mobile: true, theme: 'Casora' } },
]) {
  const { page } = await open(dev.o);
  const views = (dev.url.endsWith('-mobile') ? M : D).views;
  await dashboard(page, dev.url + '/' + (views[dev.idx].path || String(dev.idx)));
  await openAll(page);
  const b = await stable(page, badge);
  await check(`${dev.name}: security badge on Home without entries`, b.length === 1, b);
  if (!b.length) continue;
  if (dev.o.mobile) await page.touchscreen.tap(b[0].x, b[0].y); else await page.mouse.click(b[0].x, b[0].y);
  const p = await stable(page, popup);
  await check(`${dev.name}: tap opens „Türen & Fenster“`, !!p && /Türen & Fenster/.test(p), p);
  const filter = await page.evaluate(() => (document.querySelector('home-assistant').hass.states['input_select.casora_mobile_filter'] || {}).state);
  if (dev.o.mobile) await check(`${dev.name}: no filter set instead`, filter !== 'security', filter);
}
await finish();
