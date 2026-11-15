// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js#slotLog,slotFamily,describe,prepare custom_components/casora/scripts/casora-core.js#collect,stackUp,popupNames
// Beta 26.11.28b4 (owner, phone): weather warning tile on Home and in the room „Terrasse“, both on „Warnung 1“ of
// „Wetter & Warnungen“. After Frost and Nebel had ended the bell listed „Terrasse Entwarnung · Wetterwarnung
// aufgehoben“ (2) and „Entwarnung · Wetterwarnung aufgehoben“ (2): one logbook stack per slot (the integration moves
// Frost from slot 1 to slot 2 when Nebel arrives and back when Nebel ends), the twin names with the room of slot 1 in
// front (#116). Expected (desktop and phone 393): one „Entwarnung“ row, plain name. The five slots, their room and
// their logbook are made up and live only in the browser (registry platform wetter, translation_key warning; logbook
// answered for these ids only); the tiles sit in copies of the test dashboards, removed at the end.
import { open, usePage, casoraDashboards, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';
import { ws } from '../ws.mjs';

const ID = (n) => 'binary_sensor.qa_wetter_warnung_' + n;

// ── Test dashboards: copies with two weather warning tiles on Warnung 1 (as r820) ──
const tplOf = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? [].concat(x.template || []) : []);
const withTiles = (cfg) => {
  const c = JSON.parse(JSON.stringify(cfg));
  let done = false;
  (function walk(x) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length && !done; i++) {
        if (x[i] && x[i].type === 'custom:button-card' && tplOf(x[i]).some((t) => /^casora_(light|switch|thermostat|cover|media|recipe|battery)/.test(t))) {
          x.splice(i, 0, ...[0, 1].map(() => ({ type: 'custom:button-card', template: 'casora_weather_warning', entity: ID(1), variables: { sensors: [] } })));
          done = true;
          return;
        }
        walk(x[i]);
      }
      return;
    }
    Object.keys(x).forEach((k) => walk(x[k]));
  })(c.views[0]);
  return { config: c, view: c.views[0].path || 0, done };
};
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && withTiles(d.config).done);
const phone = all.find((d) => d.mobile && withTiles(d.config).done);
await need('Dashboards mit Platz für die Warn-Kacheln', desk && phone, all.map((d) => d.url));
const made = [];
const save = async (url, cfg, title) => {
  const c = await ws();
  try {
    const list = await c.cmd({ type: 'lovelace/dashboards/list' });
    if (!list.some((d) => d.url_path === url)) {
      await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
      made.push(url);
    }
    await c.cmd({ type: 'lovelace/config/save', url_path: url, config: cfg });
  } finally { c.close(); }
};
atFinish(async () => {
  const c = await ws();
  try {
    const list = await c.cmd({ type: 'lovelace/dashboards/list' });
    for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  } finally { c.close(); }
});
const D = withTiles(desk.config), M = withTiles(phone.config);
await save('qa-warn-once', D.config, 'QA Warnung einmal');
await save('qa-warn-once-mobile', M.config, 'QA Warnung einmal Handy');

// ── Made-up slots (all off now), slot 1 in the room „QA Terrasse“, and their logbook of the last day ──
const scenario = () => {
  const now = Date.now(), H = 3600000;
  const entities = {}, states = {};
  for (let n = 1; n <= 5; n++) {
    entities[ID(n)] = { entity_id: ID(n), platform: 'wetter', translation_key: 'warning', device_id: 'qa_wetter', area_id: n === 1 ? 'qa_terrasse' : null, labels: [], entity_category: null };
    const t = new Date(now - (n === 1 ? 0.5 : n === 2 ? 5.5 : 30) * H).toISOString();
    states[ID(n)] = { entity_id: ID(n), state: 'off', attributes: { friendly_name: 'QA Wetter Warnung ' + n, device_class: 'safety', region: 'Teststadt' },
      context: { id: 'qa' }, last_changed: t, last_updated: t };
  }
  // Frost in slot 1; Nebel takes slot 1 and pushes Frost to slot 2; Nebel ends, Frost back to slot 1; Frost ends.
  const ev = (n, state, h) => ({ entity_id: ID(n), state, when: (now - h * H) / 1000 });
  const log = [ev(1, 'on', 20), ev(2, 'on', 11), ev(2, 'off', 5.5), ev(1, 'off', 0.5)];
  return { entities, states, log, devices: { qa_wetter: { id: 'qa_wetter', name: 'QA Wetter', area_id: null, entry_type: 'service' } },
    areas: { qa_terrasse: { area_id: 'qa_terrasse', name: 'QA Terrasse' } } };
};
const inject = (pg) => pg.evaluate((sc) => {
  const ha = document.querySelector('home-assistant');
  const merge = (obj) => {
    if (!obj) return obj;
    const o = { ...obj };
    if (obj.entities) o.entities = { ...obj.entities, ...sc.entities };
    if (obj.devices) o.devices = { ...obj.devices, ...sc.devices };
    if (obj.areas) o.areas = { ...obj.areas, ...sc.areas };
    if (obj.states) o.states = { ...obj.states, ...sc.states };
    return o;
  };
  const orig = ha.__qaOnceOrig || ha._updateHass;
  ha.__qaOnceOrig = orig;
  ha._updateHass = function (obj) { return orig.call(this, merge(obj)); };
  // The logbook answers for the made-up slots (HA knows nothing of them).
  const conn = ha.hass.connection;
  const send = conn.__qaOnceSend || conn.sendMessagePromise.bind(conn);
  conn.__qaOnceSend = send;
  const mine = (id) => Object.prototype.hasOwnProperty.call(sc.entities, id);
  conn.sendMessagePromise = (msg) => {
    if (!msg || msg.type !== 'logbook/get_events' || !(msg.entity_ids || []).some(mine)) return send(msg);
    const rest = msg.entity_ids.filter((id) => !mine(id));
    const from = Date.parse(msg.start_time) / 1000;
    const own = sc.log.filter((e) => e.when >= from && msg.entity_ids.includes(e.entity_id));
    return (rest.length ? send({ ...msg, entity_ids: rest }) : Promise.resolve([]))
      .then((r) => (r || []).concat(own).sort((a, b) => a.when - b.when));
  };
  const h = ha.hass;
  orig.call(ha, merge({ entities: h.entities, devices: h.devices, areas: h.areas, states: h.states }));
}, scenario());

const refresh = (pg) => pg.evaluate(() => window._casoraNotify && window._casoraNotify.refresh());
const BELL = () => { const r = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight);
  return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const MENU = () => window.__pierce('.casora-notify-menu .hui-srow').filter((r) => r.getBoundingClientRect().height > 0)
  .map((r) => r.textContent.replace(/\s+/g, ' ').trim());
const tap = (pg, mobile, at) => (mobile ? pg.touchscreen.tap(at.x, at.y) : pg.mouse.click(at.x, at.y));

const VIEWS = [
  ['Desktop', { width: 1440, height: 1000, scale: 1, dark: false }, 'qa-warn-once', D.view, false],
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false }, 'qa-warn-once-mobile', M.view, true],
];
for (const [tag, o, url, view, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url + '/' + view, 3);
  await inject(page);
  await refresh(page);
  const at = await page.evaluate(BELL);
  await need(tag + ': Glocke gefunden', at);
  await tap(page, mobile, at);
  const shown = await stable(page, MENU, null, { max: 8000, quiet: 800, until: (l) => l && l.some((t) => /Entwarnung/.test(t)) });
  const clear = (shown || []).filter((t) => /Entwarnung/.test(t));
  await check(tag + ': Glocke mit genau einer „Entwarnung“ für das Warngerät', clear.length === 1, shown);
  await check(tag + ': ohne Raum davor („QA Terrasse Entwarnung“)', !clear.some((t) => /QA Terrasse/.test(t)), clear);
  await page.context().browser().close().catch(() => {});
}
await finish();
