// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/51-smart-heating.js custom_components/casora/scripts/local/00-finder.js#casoraShcFind dev/casora_mock/smart_heating.py
// New (issue #240): the community card "Smart Heating Control" – a room of the HACS integration (domain advanced_climate)
// on its Decision sensor. The test house has a made-up room "Testheizraum" with the integration's entities under the
// platform advanced_climate, its services and its profile select (dev/casora_mock/smart_heating.py).
// Expected:
//   - Studio: with the card added, "Smart Heating Control" suggests the test room's Decision sensor as the sure first match
//   - tile (copies qa-shc / qa-shc-mobile on the home page): "20,4° · Heizt auf 21°" or "20,4° · Ziel …"
//   - tap → v3 popup: the target on the dial with − / +, the moons Automatik · Zuhause · Eco · Mehr; the section
//     "Smart Heating" with "Zeitplan ›", "Modus" and "Entscheidung"; desktop two columns (list right of the dial), phone
//     one column (below the dial)
//   - desktop: the moon "Eco" sets a manual change (advanced_climate.set_override preset eco), the row "Manuell · Eco"
//     appears, "Automatik" ends it (clear_override); "+" sets a manual change 0,5° above the target
//   - "Zeitplan ›" opens the week as a sub page: "Tagesprofile", "Woche" (7 days) and the day's slots; "Aktivieren" on the
//     profile home_office turns it on (select.select_option on the room's profile select); editing Monday's 06:00 slot one
//     level warmer and "Speichern" sends set_schedule (workday 06:00 → comfort)
//   Everything changed is put back at the end (casora_mock.smart_heating_reset).
// Pictures: CASORA_SHC_BILDER=<folder> stores Studio, tile, popup, week and editor per view (preview images of the card).
import fs from 'node:fs';
import { open, studio, casoraDashboards, dashboard, check, need, finish, atFinish, stable, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_SHC_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const DEC = 'sensor.testheizraum_decision';

const c = await ws();
const attrsOf = async () => ((await c.cmd({ type: 'get_states' })).find((s) => s.entity_id === DEC) || {}).attributes || null;
const reset = async (cc) => cc.cmd({ type: 'call_service', domain: 'casora_mock', service: 'smart_heating_reset', service_data: {} });
await need('test room of Smart Heating Control in the house', await attrsOf(), DEC);
await reset(c);
atFinish(async () => { const c2 = await ws(); await reset(c2); c2.close(); });
const a0 = await attrsOf();
await need('Decision sensor with schedule and levels', a0 && a0.schedule && a0.schedule.workday && a0.levels, a0 && Object.keys(a0));
const waitAttrs = async (ok, n = 24) => {
  let a = null;
  for (let i = 0; i < n; i++) { a = await attrsOf(); if (a && ok(a)) return a; await new Promise((r) => setTimeout(r, 300)); }
  return a;
};

// ── Studio: the card suggests the room ──
const all = await casoraDashboards();
const anchored = (d) => /"template":(?:\[[^\]]*)?"casora_(?:recipe|battery)"/.test(JSON.stringify((d.config.views || [])[0] || {}));
const desk = all.find((d) => !d.mobile && (d.config.views || []).length > 1 && anchored(d));
const phone = all.find((d) => d.mobile && anchored(d));
await need('Casora dashboards', desk && phone, all.map((d) => d.url));
{
  const o = await open({ width: 1600, height: 1000, dark: true });
  usePage(o.page);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await studio(o.page, desk.url);
  const cand = await H(() => {
    window.casoraCommunityOn = new Set([...(window.casoraCommunityOn || []), 'casora_smart_heating']);
    const p = window.__panel(), I = window.__casoraPanelInternals;
    const type = I.TILE_TYPES.find((t) => t.id === 'casora_smart_heating');
    if (!type) return null;
    return { offered: !type.onlyIf || type.onlyIf(p._hass),
      list: p._tileCandidates(type, p._state.compact.rooms[0]).map((x) => ({ id: x.id, sure: x.sure })) };
  });
  await check('Studio: Smart Heating Control is offered (platform advanced_climate in the registry)', cand && cand.offered, cand);
  await check('Studio: the test room\'s Decision sensor is the sure first match', cand && cand.list[0] && cand.list[0].id === DEC && cand.list[0].sure, cand);
  if (BILDER) { await o.page.waitForTimeout(800); await o.page.screenshot({ path: BILDER + '/studio.png' }); }
  await o.browser.close().catch(() => {});
}

// ── Dashboards: copies with the tile on the home page ──
const TILES = [{ type: 'custom:button-card', template: 'casora_smart_heating', entity: DEC, name: 'Heizraum', variables: {} }];
const withTiles = (cfg) => {
  const o = JSON.parse(JSON.stringify(cfg));
  let done = false;
  (function walk(x) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      const i = x.findIndex((y) => y && typeof y === 'object' && [].concat(y.template || []).some((n) => n === 'casora_recipe' || n === 'casora_battery'));
      if (i >= 0) { x.splice(i + 1, 0, ...JSON.parse(JSON.stringify(TILES))); done = true; return; }
      x.forEach(walk);
      return;
    }
    Object.keys(x).forEach((k) => walk(x[k]));
  })(o.views[0]);
  return done ? o : null;
};
const made = [];
const save = async (url, cfg, title) => {
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  if (!list.some((d) => d.url_path === url)) {
    await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
  }
  await c.cmd({ type: 'lovelace/config/save', url_path: url, config: cfg });
  made.push(url);
};
const D = withTiles(desk.config), M = withTiles(phone.config);
await need('tiles inserted', D && M);
await save('qa-shc', D, 'QA Smart Heating');
await save('qa-shc-mobile', M, 'QA Smart Heating Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});

const TILE = (ent) => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).join(' ') === 'casora_smart_heating'
  && (b._config || {}).entity === ent && b.getBoundingClientRect().width > 20).map((b) => {
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width * 0.5, y: r.y + r.height * 0.6, w: r.width, h: r.height, left: r.x, top: r.y,
    state: ((b.shadowRoot && b.shadowRoot.querySelector('#state')) || {}).textContent || '' };
})[0] || null;
const POPUP = () => {
  const vis = (n) => n.getBoundingClientRect().height > 0;
  const box = (n) => { const r = n.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; };
  return {
    line: ((window.__pierce('.hui-line').filter(vis)[0] || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    labels: window.__pierce('.hui-slbl').filter(vis).map((n) => Object.assign({ t: n.textContent.replace(/\s+/g, ' ').trim() }, box(n))),
    rows: window.__pierce('.hui-srow').filter(vis).map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    days: window.__pierce('[data-casora-mi^="shc-day:"]').filter(vis).length,
    editable: window.__pierce('[data-casora-mi^="shc-edit:"]').filter(vis).length,
    moons: window.__pierce('.hui-stage .hui-moon').filter(vis).map((n) => n.getAttribute('aria-label') || ''),
    stage: (() => { const n = window.__pierce('.hui-stage').find(vis); return n ? box(n) : null; })(),
  };
};
const lab = (p, t) => p.labels.find((l) => l.t === t || l.t.indexOf(t) === 0);
const VIEWS = [
  ['Desktop dunkel', { width: 1440, height: 1000, scale: 1, dark: true }, 'qa-shc', false, true],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true }, 'qa-shc-mobile', true, false],
];
if (BILDER) VIEWS.push(['Desktop hell', { width: 1440, height: 1000, scale: 2, dark: false }, 'qa-shc', false, false]);
for (const [tag, o, url, mobile, act] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url, 3);
  const file = (n) => BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '-' + n + '.png';
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  const tapAt = async (pt) => { if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y); };
  const tapSel = async (sel, text) => {
    const pt = await page.evaluate(([s, t]) => {
      const n = window.__pierce(s).find((x) => x.getBoundingClientRect().height > 0 && (!t || new RegExp(t).test((x.getAttribute('aria-label') || '') + ' ' + x.textContent.replace(/\s+/g, ' ').trim())));
      if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, [sel, text || null]);
    if (!pt) return false;
    await page.waitForTimeout(500);
    await tapAt(pt);
    return true;
  };
  const tapMi = (prefix) => tapSel('[data-casora-mi^="' + prefix + '"]');

  const tile = await stable(page, TILE, DEC, { until: (v) => v && v.state });
  await check(tag + ': tile shows room temperature and target', tile && /^\d+(,\d)?° · (Heizt auf|Ziel) \d+(,\d)?°$/.test(tile.state.trim()), tile && tile.state);
  if (BILDER && tile) {
    await page.waitForTimeout(600);
    await page.screenshot({ path: file('kachel'), clip: { x: Math.max(0, tile.left - 40), y: Math.max(0, tile.top - 30), width: tile.w + 80, height: tile.h + 60 } });
  }
  for (let t = 0; t < 4 && !(await offen()); t++) {
    await tapAt(tile);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': popup opens', await offen());
  const p = await stable(page, POPUP, null, { until: (v) => v && v.rows.some((r) => /^Zeitplan/.test(r)) && v.moons.length >= 3, max: 12000 });
  await check(tag + ': moons Automatik, Zuhause, Eco and „Mehr“', p && ['Automatik', 'Zuhause', 'Eco'].every((m) => p.moons.includes(m)) && p.moons.some((m) => /^Mehr/.test(m)), p && p.moons);
  await check(tag + ': "Smart Heating" with Zeitplan, Modus and Entscheidung', p && lab(p, 'Smart Heating') && p.rows.some((r) => /^Zeitplan/.test(r))
    && p.rows.some((r) => /^Modus.*Automatik/.test(r)) && p.rows.some((r) => /^Entscheidung/.test(r)), p && p.rows);
  await check(tag + ': head says the word, not the dial\'s number', p && /^(Heizt|Bereit|Manuell)/.test(p.line), p && p.line);
  if (mobile) await check(tag + ': one column (list below the dial)', p && p.stage && lab(p, 'Smart Heating') && lab(p, 'Smart Heating').y > p.stage.y + 200, p && { stage: p.stage, labels: p.labels });
  else await check(tag + ': two columns (list right of the dial)', p && p.stage && lab(p, 'Smart Heating') && lab(p, 'Smart Heating').x > p.stage.x + 200, p && { stage: p.stage, labels: p.labels });
  if (BILDER) { await page.waitForTimeout(700); await page.screenshot({ path: file('popup') }); }

  if (act) {
    // A level as a manual change, then back to automatic.
    await page.waitForTimeout(700);
    await tapSel('.hui-stage .hui-moon', '^Eco');
    let a = await waitAttrs((x) => x.override && x.override.preset === 'eco');
    await check(tag + ': moon "Eco" → set_override preset eco', a && a.override && a.override.preset === 'eco', a && a.override);
    const p2 = await stable(page, POPUP, null, { until: (v) => v && v.rows.some((r) => /^Manuell · Eco/.test(r)), max: 6000 });
    await check(tag + ': row „Manuell · Eco“ with „Automatik“', p2 && p2.rows.some((r) => /^Manuell · Eco.*Automatik/.test(r)), p2 && p2.rows);
    await page.waitForTimeout(700);
    await tapSel('.hui-stage .hui-moon', '^Automatik');
    a = await waitAttrs((x) => !x.override);
    await check(tag + ': moon "Automatik" → clear_override', a && !a.override, a && a.override);
    // + : a manual change half a degree above the target.
    const t0 = (await attrsOf()).target_temperature;
    await page.waitForTimeout(700);
    await tapSel('.hui-stage [aria-label="Mehr"]');
    a = await waitAttrs((x) => x.override && x.override.temperature != null);
    await check(tag + ': "+" → set_override temperature +0,5°', a && a.override && Math.abs(a.override.temperature - (t0 + 0.5)) < 0.01, { t0, override: a && a.override });
    await reset(c);
    await waitAttrs((x) => !x.override);
  }

  // „Zeitplan ›“ opens the week as a sub page.
  await page.waitForTimeout(700);
  await need(tag + ': row „Zeitplan ›“', await tapSel('.hui-srow', '^Zeitplan'));
  const w = await stable(page, POPUP, null, { until: (v) => v && v.days === 7 && v.editable >= 1, max: 8000 });
  await check(tag + ': the week page: "Tagesprofile", "Woche" with 7 days, today\'s slots', w && lab(w, 'Tagesprofile') && lab(w, 'Woche') && w.days === 7
    && lab(w, 'Heute') && w.editable >= 1, w && { labels: w.labels, days: w.days, editable: w.editable });
  await check(tag + ': profiles with their days', w && w.rows.some((r) => /^workday.*Werktage.*Aktiv/.test(r)) && w.rows.some((r) => /^home_office.*Mi.*Aktivieren/.test(r)), w && w.rows);
  if (BILDER) { await page.waitForTimeout(700); await page.screenshot({ path: file('woche') }); }

  if (act) {
    // Switch the profile on (the room's profile select).
    await page.waitForTimeout(700);
    await tapSel('.hui-srow', '^home_office');
    let a = await waitAttrs((x) => x.profile_days && x.profile_days.home_office && x.profile_days.home_office.enabled);
    await check(tag + ': „Aktivieren“ → select.select_option turns home_office on', a && a.profile_days.home_office.enabled, a && a.profile_days);
    // Edit Monday's 06:00 slot one level warmer (home → comfort) and save.
    await page.waitForTimeout(700);
    await tapMi('shc-day:' + DEC + '|0');
    await page.waitForTimeout(700);
    await tapMi('shc-edit:' + DEC + '|workday|1');
    const e = await stable(page, POPUP, null, { until: (v) => v && v.labels.some((l) => /^Zeitfenster bearbeiten/.test(l.t)), max: 5000 });
    await check(tag + ': the editor opens', e && e.labels.some((l) => /^Zeitfenster bearbeiten · workday/.test(l.t)), e && e.labels);
    await tapMi('shc-step:' + DEC + '|level|+');
    await page.waitForTimeout(600);
    if (BILDER) { await page.waitForTimeout(500); await page.screenshot({ path: file('bearbeiten') }); }
    await tapMi('shc-save:' + DEC);
    a = await waitAttrs((x) => x.schedule && x.schedule.workday && x.schedule.workday[1] && x.schedule.workday[1].preset === 'comfort');
    await check(tag + ': „Speichern“ → set_schedule (workday 06:00 comfort, other slots kept)', a && a.schedule.workday[1].preset === 'comfort'
      && a.schedule.workday[1].time === '06:00' && a.schedule.workday.length === a0.schedule.workday.length
      && JSON.stringify(a.schedule.weekend) === JSON.stringify(a0.schedule.weekend), a && a.schedule);
    const p3 = await stable(page, POPUP, null, { until: (v) => v && !v.labels.some((l) => /^Zeitfenster bearbeiten/.test(l.t)) && v.editable >= 1, max: 6000 });
    await check(tag + ': back to the day after saving', p3 && !p3.labels.some((l) => /^Zeitfenster bearbeiten/.test(l.t)), p3 && p3.labels);
    await reset(c);
  }
}
c.close();
await finish();
