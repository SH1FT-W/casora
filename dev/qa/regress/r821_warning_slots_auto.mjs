// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/01-basis.js#casoraWarnings,sources,siblings,pickedSources,isWarnSource,isWarning custom_components/casora/scripts/casora-core.js#wants dashboards/casora/button_card_templates.json#casora_weather_warning,casora_popup_weather_warning
// Issue #196 (auto). A weather warning tile set to „Warnung 1“ of „Wetter & Warnungen“ alone (no „Warnungs-Sensoren“),
// Warnung 1 (Windböen), 2 (Frost) and 3 (Glätte) active: the tile said „Windböen“ only, the popup listed Windböen only,
// the bell had no row for Frost and Glätte. Expected (desktop and phone 393): the tile says „Windböen · 2 weitere“, the
// popup lists all three, the bell has „Wetterwarnung: Windböen/Frost/Glätte“ and no „Sicherheitswarnung“, each row opens
// the warning popup with its warning. The slots are made up and live only in the browser (registry platform wetter,
// translation_key warning, one device; plus a connectivity binary_sensor of the device that must stay out); the tile
// sits in copies of the test dashboards, removed at the end. Pictures: WARN196_BILDER=<folder>.
import fs from 'node:fs';
import { open, usePage, casoraDashboards, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.WARN196_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const ID = (n) => 'binary_sensor.qa_wetter_warnung_' + n;
const CONN = 'binary_sensor.qa_wetter_verbindung';

// ── Test dashboards: copies with a weather warning tile (as r104) ──
const tplOf = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? [].concat(x.template || []) : []);
const withTile = (cfg, sensors) => {
  const c = JSON.parse(JSON.stringify(cfg));
  let done = false;
  (function walk(x) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length && !done; i++) {
        if (x[i] && x[i].type === 'custom:button-card' && tplOf(x[i]).some((t) => /^casora_(light|switch|thermostat|cover|media|recipe|battery)/.test(t))) {
          x.splice(i, 0, { type: 'custom:button-card', template: 'casora_weather_warning', entity: ID(1), variables: { sensors } });
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
const desk = all.find((d) => !d.mobile && withTile(d.config, []).done);
const phone = all.find((d) => d.mobile && withTile(d.config, []).done);
await need('Dashboards mit Platz für die Warn-Kachel', desk && phone, all.map((d) => d.url));
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
const D = withTile(desk.config, []), M = withTile(phone.config, []);
await save('qa-warn196a', D.config, 'QA Warnungen 196 auto');
await save('qa-warn196a-mobile', M.config, 'QA Warnungen 196 auto Handy');

// ── Made-up slots of „Wetter & Warnungen“ ──
const scenario = () => {
  const now = Date.now(), iso = (h) => new Date(now + h * 3600000).toISOString();
  const entities = {}, states = {};
  const W = {
    1: { severity: 'Moderate', headline: 'Amtliche WARNUNG vor WINDBÖEN', event: 'WINDBÖEN', description: 'Es treten Windböen bis 60 km/h auf.' },
    2: { severity: 'Minor', headline: 'Amtliche WARNUNG vor FROST', event: 'FROST', description: 'Es tritt leichter Frost bis -2 °C auf.' },
    3: { severity: 'Minor', headline: 'Amtliche WARNUNG vor GLÄTTE', event: 'GLÄTTE', description: 'Es tritt Glätte auf.' },
  };
  for (let n = 1; n <= 5; n++) {
    entities[ID(n)] = { entity_id: ID(n), platform: 'wetter', translation_key: 'warning', device_id: 'qa_wetter', area_id: null, labels: [], entity_category: null };
    const a = { friendly_name: 'QA Wetter Warnung ' + n, device_class: 'safety', region: 'Teststadt' };
    if (W[n]) Object.assign(a, W[n], { sent: iso(-2), expires: iso(10) });
    states[ID(n)] = { entity_id: ID(n), state: W[n] ? 'on' : 'off', attributes: a, context: { id: 'qa' }, last_changed: iso(-1), last_updated: iso(-1) };
  }
  // Another binary_sensor of the same device: no warning, must stay out of tile and bell.
  entities[CONN] = { entity_id: CONN, platform: 'wetter', translation_key: 'connected', device_id: 'qa_wetter', area_id: null, labels: [], entity_category: 'diagnostic' };
  states[CONN] = { entity_id: CONN, state: 'on', attributes: { friendly_name: 'QA Wetter Verbindung', device_class: 'safety' }, context: { id: 'qa' }, last_changed: iso(-1), last_updated: iso(-1) };
  return { entities, devices: { qa_wetter: { id: 'qa_wetter', name: 'QA Wetter', area_id: null, entry_type: 'service' } }, states };
};
const inject = (pg) => pg.evaluate((sc) => {
  const ha = document.querySelector('home-assistant');
  const merge = (obj) => {
    if (!obj) return obj;
    const o = { ...obj };
    if (obj.entities) o.entities = { ...obj.entities, ...sc.entities };
    if (obj.devices) o.devices = { ...obj.devices, ...sc.devices };
    if (obj.states) o.states = { ...obj.states, ...sc.states };
    return o;
  };
  const orig = ha.__qa196aOrig || ha._updateHass;
  ha.__qa196aOrig = orig;
  ha._updateHass = function (obj) { return orig.call(this, merge(obj)); };
  const h = ha.hass;
  orig.call(ha, merge({ entities: h.entities, devices: h.devices, states: h.states }));
}, scenario());

const refresh = (pg) => pg.evaluate(() => window._casoraNotify && window._casoraNotify.refresh());
const BELL = () => { const r = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight);
  return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const MENU = () => window.__pierce('.casora-notify-menu .hui-srow').filter((r) => r.getBoundingClientRect().height > 0)
  .map((r) => r.textContent.replace(/\s+/g, ' ').trim());
const POPUP = () => {
  const p = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
  if (!p) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(p.shadowRoot);
  return parts.join(' ').replace(/\s+/g, ' ').slice(0, 4000);
};
const closePopup = async (pg) => {
  await pg.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
  await pg.waitForTimeout(700);
};
// Pictures only: let the popup's opening animation end first.
const settle = (pg) => (BILDER ? pg.waitForTimeout(1600) : null);
const tap = (pg, mobile, at) => (mobile ? pg.touchscreen.tap(at.x, at.y) : pg.mouse.click(at.x, at.y));
const openBell = async (pg, mobile, tag) => {
  const at = await pg.evaluate(BELL);
  await need(tag + ': Glocke gefunden', at);
  await tap(pg, mobile, at);
  return stable(pg, MENU, null, { max: 8000, quiet: 800, until: (l) => l && l.length > 0 });
};

const VIEWS = [
  ['Desktop', { width: 1440, height: 1000, scale: 1, dark: false }, 'qa-warn196a', D.view, false],
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false }, 'qa-warn196a-mobile', M.view, true],
];
for (const [tag, o, url, view, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url + '/' + view, 3);
  const file = (n) => BILDER + '/' + tag.toLowerCase() + '-' + n + '.png';
  await inject(page);
  await refresh(page);

  // 1. The tile names the most severe warning plus „2 weitere“; its popup lists all three.
  {
    const at = await stable(page, () => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_weather_warning') && x.getClientRects().length);
      if (!b) return null;
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width * 0.7), y: Math.round(r.y + r.height * 0.75), text: (() => {
        const parts = [];
        const walk = (n) => n.childNodes.forEach((c) => {
          if (c.nodeType === 3) { parts.push(c.textContent); return; }
          if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
          if (c.shadowRoot) walk(c.shadowRoot);
          walk(c);
        });
        if (b.shadowRoot) walk(b.shadowRoot);
        return parts.join(' ').replace(/\s+/g, ' ').trim();
      })() };
    }, null, { max: 8000, quiet: 600 });
    await need(tag + ': Warn-Kachel sichtbar', at);
    await page.waitForTimeout(800);
    if (BILDER) await page.screenshot({ path: file('kachel') });
    await check(tag + ': Kachel zeigt „Windböen · 2 weitere“', /Windböen · 2 weitere/.test(at.text), at.text);
    await tap(page, mobile, at);
    const pop = await stable(page, POPUP, null, { max: 12000, quiet: 1200, until: (t) => !!t && /FROST|WINDBÖEN/.test(t) });
    await check(tag + ': Kachel-Popup zeigt Windböen (Warnung 1, Entität der Kachel)', pop && /WARNUNG vor WINDBÖEN/.test(pop), pop);
    await check(tag + ': Kachel-Popup zeigt Frost und Glätte (Warnung 2 und 3, nur über das Gerät)', pop && /WARNUNG vor FROST/.test(pop) && /WARNUNG vor GLÄTTE/.test(pop), pop);
    await settle(page);
    if (BILDER) await page.screenshot({ path: file('popup') });
    await closePopup(page);
  }

  // 2. The bell: one row per warning, no generic „Sicherheitswarnung“.
  const shown = await openBell(page, mobile, tag);
  await settle(page);
  if (BILDER) await page.screenshot({ path: file('glocke') });
  await check(tag + ': Glocke ohne „Sicherheitswarnung“ der Warnplätze', !shown.some((t) => /Sicherheitswarnung.*QA Wetter Warnung/.test(t)), shown);
  await check(tag + ': Glocke mit „Wetterwarnung: Windböen“, „… Frost“ und „… Glätte“',
    ['Windböen', 'Frost', 'Glätte'].every((k) => shown.some((t) => new RegExp('Wetterwarnung: ' + k).test(t))), shown);
  await check(tag + ': Verbindungs-Sensor des Geräts nicht als Warnung', !shown.some((t) => /Wetterwarnung.*QA Wetter Verbindung|QA Wetter Verbindung.*Wetterwarnung/.test(t)), shown);

  // 3. Each row opens the warning popup with its own warning.
  let first = true;
  for (const [kind, head] of [['Windböen', /WARNUNG vor WINDBÖEN/], ['Frost', /WARNUNG vor FROST/], ['Glätte', /WARNUNG vor GLÄTTE/]]) {
    if (!first) await openBell(page, mobile, tag);
    first = false;
    const row = await page.evaluate((k) => {
      const r = window.__pierce('.casora-notify-menu .hui-srow').find((x) => new RegExp('Wetterwarnung: ' + k).test(x.textContent) && x.getBoundingClientRect().height > 0);
      if (!r) return null;
      const q = r.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    }, kind);
    await check(tag + ': Glocken-Zeile „Wetterwarnung: ' + kind + '“ da', row);
    if (!row && BILDER) {
      // Before the fix (pictures only): the generic row of this slot and where it leads.
      const alt = await page.evaluate((n) => {
        const r = window.__pierce('.casora-notify-menu .hui-srow').find((x) => new RegExp('QA Wetter Warnung ' + n).test(x.textContent) && x.getBoundingClientRect().height > 0);
        if (!r) return null;
        const q = r.getBoundingClientRect();
        return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
      }, { 'Windböen': 1, 'Frost': 2, 'Glätte': 3 }[kind]);
      if (alt) {
        await tap(page, mobile, alt);
        await page.waitForTimeout(3500);
        await page.screenshot({ path: file('glocke-' + kind.toLowerCase().replace('ö', 'oe').replace('ä', 'ae')) });
        await closePopup(page);
      }
    }
    if (!row) continue;
    await tap(page, mobile, row);
    const pop = await stable(page, POPUP, null, { max: 12000, quiet: 1200, until: (t) => !!t && head.test(t) });
    await check(tag + ': Tipp auf „' + kind + '“ öffnet das Warn-Popup mit allen drei Warnungen', pop && head.test(pop) && /WINDBÖEN/.test(pop) && /FROST/.test(pop) && /GLÄTTE/.test(pop), pop);
    await settle(page);
    if (BILDER) await page.screenshot({ path: file('glocke-' + kind.toLowerCase().replace('ö', 'oe').replace('ä', 'ae')) });
    await closePopup(page);
  }
  await page.context().browser().close().catch(() => {});
}

await finish();
