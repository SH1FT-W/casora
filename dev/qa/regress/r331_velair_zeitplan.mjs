// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/31-velair.js custom_components/casora/scripts/local/00-finder.js dev/casora_mock/velair.py
// New (issue #32): the community card "Velair" – the thermostat tile with Velair's schedule in its popup. The test
// house has a made-up air conditioner planned by a Velair-like scheduler (dev/casora_mock/velair.py: entities under
// the platform velair, Velair's WebSocket commands and services).
// Expected:
//   - Studio: with the card added, "Velair" suggests the test air conditioner as the sure first match
//   - dashboard (copies qa-velair / qa-velair-mobile with a Velair tile and a plain thermostat tile on the home page):
//     tap → popup with "Modus", "Lüfter", "Zeitplan" (on), "Woche" (7 days) and today's slots; desktop two columns
//     (schedule right), phone one column (schedule below the controls)
//   - editing: a slot of today +0,5° → Speichern → velair.set_daily_schedule changed that block; the toggle pauses
//     the schedule (velair.pause_zone) and resumes it
//   - Velair is optional: the plain thermostat's popup has no schedule (no "Zeitplan", no "Woche", no Velair taps)
//   Everything changed is put back at the end (casora_mock.velair_reset).
// Pictures: CASORA_VELAIR_BILDER=<folder> stores Studio, Velair popup (with editor) and the plain thermostat per view.
import fs from 'node:fs';
import { open, studio, casoraDashboards, dashboard, check, need, finish, atFinish, stable, usePage } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_VELAIR_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });
const AC = 'climate.testklimaanlage';
const PLAIN = 'climate.testklima';
const WD = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const c = await ws();
const S0 = await c.cmd({ type: 'get_states' });
const st0 = (id) => S0.find((s) => s.entity_id === id);
await need('test air conditioner and plain thermostat in the house', st0(AC) && st0(PLAIN), [AC, PLAIN].map((x) => !!st0(x)));
const reset = async (cc) => cc.cmd({ type: 'call_service', domain: 'casora_mock', service: 'velair_reset', service_data: {} });
await reset(c);
atFinish(async () => { const c2 = await ws(); await reset(c2); c2.close(); });
const sched = async () => c.cmd({ type: 'velair/get_schedule' });
const s0 = await sched();
await need('Velair answers velair/get_schedule', s0 && s0.zones && s0.zones[AC], s0 && Object.keys(s0));

// ── Studio: the card suggests the air conditioner ──
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && (d.config.views || []).length > 1);
const phone = all.find((d) => d.mobile);
await need('Casora dashboards', desk && phone, all.map((d) => d.url));
{
  const o = await open({ width: 1600, height: 1000, dark: true });
  usePage(o.page);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await studio(o.page, desk.url);
  const cand = await H(async () => {
    window.casoraCommunityOn = new Set([...(window.casoraCommunityOn || []), 'casora_velair']);
    const p = window.__panel(), I = window.__casoraPanelInternals;
    const type = I.TILE_TYPES.find((t) => t.id === 'casora_velair');
    if (!type) return null;
    if (window.casoraVelairFind) await window.casoraVelairFind.load(p._hass);
    return { offered: !type.onlyIf || type.onlyIf(p._hass),
      list: p._tileCandidates(type, p._state.compact.rooms[0]).map((x) => ({ id: x.id, sure: x.sure })) };
  });
  await check('Studio: Velair is offered (platform velair in the registry)', cand && cand.offered, cand);
  await check('Studio: the air conditioner is the sure first match', cand && cand.list[0] && cand.list[0].id === AC && cand.list[0].sure, cand);
  if (BILDER) {
    const asked = H(async () => {
      const p = window.__panel(), I = window.__casoraPanelInternals;
      p._room = 0; p._sel = null; p._renderTabs(); p._syncPreview();
      await new Promise((r) => setTimeout(r, 600));
      window.__qaVelairDone = await p._addTileAsk(p._state.compact.rooms[0], I.TILE_TYPES.find((t) => t.id === 'casora_velair'));
    });
    await o.page.waitForTimeout(1500);
    await o.page.screenshot({ path: BILDER + '/studio-vorschlag.png' });
    const take = o.page.getByRole('button', { name: /^(Übernehmen|Use)$/ });
    if (await take.count()) await take.last().click();
    await asked.catch(() => {});
    await o.page.waitForTimeout(1200);
    await H(() => { const p = window.__panel(); const ts = p._state.compact.rooms[0].tiles; p._sel = { tile: ts.length - 1 }; p._renderForm && p._renderForm(); });
    await o.page.waitForTimeout(900);
    await o.page.screenshot({ path: BILDER + '/studio.png' });
  }
  await o.browser.close().catch(() => {});
}

// ── Dashboards: copies with a Velair tile and a plain thermostat on the home page ──
const TILES = [
  { type: 'custom:button-card', template: 'casora_velair', entity: AC, name: 'Klimaanlage', variables: {} },
  { type: 'custom:button-card', template: 'casora_thermostat', entity: PLAIN, name: 'Thermostat', variables: {} },
];
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
await save('qa-velair', D, 'QA Velair');
await save('qa-velair-mobile', M, 'QA Velair Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});

const TILE = (tpl) => window.__pierce('button-card').filter((b) => [].concat((b._config || {}).template || []).join(' ') === tpl
  && b.getBoundingClientRect().width > 20).map((b) => {
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  // Left half of the tile: the thermostat's +/- rail and its icon have taps of their own.
  return { x: r.x + r.width * 0.3, y: r.y + r.height * 0.75, state: ((b.shadowRoot && b.shadowRoot.querySelector('#state')) || {}).textContent || '' };
})[0] || null;
const POPUP = () => {
  const vis = (n) => n.getBoundingClientRect().height > 0;
  const box = (n) => { const r = n.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top) }; };
  return {
    line: ((window.__pierce('.hui-line').filter(vis)[0] || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    labels: window.__pierce('.hui-slbl').filter(vis).map((n) => Object.assign({ t: n.textContent.replace(/\s+/g, ' ').trim() }, box(n))),
    rows: window.__pierce('.hui-srow').filter(vis).map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    days: window.__pierce('[data-casora-mi^="velair-day:"]').filter(vis).length,
    velairTaps: window.__pierce('[data-casora-mi^="velair-"]').length,
    editable: window.__pierce('[data-casora-mi^="velair-edit:"]').filter(vis).length,
  };
};
const lab = (p, t) => p.labels.find((l) => l.t === t || l.t.indexOf(t) === 0);
const today = WD[(new Date().getDay() + 6) % 7];
const VIEWS = [
  ['Desktop dunkel', { width: 1440, height: 1000, scale: 1, dark: true }, 'qa-velair', false, true],
  ['Handy dunkel', { width: 390, height: 844, mobile: true, safari: true, scale: 2, dark: true }, 'qa-velair-mobile', true, false],
];
// Pictures only: light desktop (preview images of the community card).
if (BILDER) VIEWS.push(['Desktop hell', { width: 1440, height: 1000, scale: 2, dark: false }, 'qa-velair', false, false]);
for (const [tag, o, url, mobile, act] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url, 3);
  const file = (n) => BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '-' + n + '.png';
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  const openTile = async (tpl) => {
    for (let t = 0; t < 10 && (await offen()); t++) {
      await page.evaluate(() => { try { window.casoraPopup.close(); } catch (e) { /* closed */ } });
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(600);
    const at = await stable(page, TILE, tpl, { until: (v) => v && v.state });
    if (!at) return false;
    await page.waitForTimeout(400);
    for (let t = 0; t < 4 && !(await offen()); t++) {
      if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
    }
    return offen();
  };
  const tapMi = async (sel) => {
    const pt = await page.evaluate((s) => { const n = window.__pierce('[data-casora-mi]').find((x) => x.getAttribute('data-casora-mi').indexOf(s) === 0
      && x.getBoundingClientRect().height > 0); if (!n) return null; n.scrollIntoView({ block: 'center' }); const b = n.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, sel);
    if (!pt) return false;
    await page.waitForTimeout(500);
    if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
    return true;
  };

  if (BILDER) {
    const box = await page.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).join(' ') === 'casora_velair'
      && x.getBoundingClientRect().width > 20); if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    await page.waitForTimeout(600);
    if (box) await page.screenshot({ path: file('kachel'), clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 30), width: box.w + 80, height: box.h + 60 } });
  }
  await need(tag + ': Velair popup opens', await openTile('casora_velair'));
  await stable(page, POPUP, null, { until: (v) => v && v.days === 7 && v.rows.length >= 3, max: 12000 });
  // Then until nothing moves (the plates fly in).
  const p = await stable(page, POPUP, null, { quiet: 900 });
  await check(tag + ': "Modus" and "Lüfter" from the climate', lab(p, 'Modus') && lab(p, 'Lüfter'), p.labels);
  await check(tag + ': "Zeitplan" on', lab(p, 'Zeitplan') && p.rows.some((r) => /^Zeitplan.*An$/.test(r)), p.rows);
  await check(tag + ': "Woche" with 7 days', lab(p, 'Woche') && p.days === 7, p.days);
  await check(tag + ': today\'s slots with times and temperatures', lab(p, 'Heute') && p.rows.some((r) => /^\d\d:\d\d–\d\d:\d\d.*\d°$/.test(r)) && p.editable >= 1, p.rows);
  await check(tag + ': status line names the next slot', /ab \d\d:\d\d|Zeitplan/.test(p.line), p.line);
  if (mobile) await check(tag + ': one column (schedule below the controls)', lab(p, 'Zeitplan').y > lab(p, 'Lüfter').y && Math.abs(lab(p, 'Zeitplan').x - lab(p, 'Modus').x) < 4, p.labels);
  else await check(tag + ': two columns (schedule right)', lab(p, 'Zeitplan').x > lab(p, 'Modus').x + 200 && Math.abs(lab(p, 'Zeitplan').y - lab(p, 'Modus').y) < 4, p.labels);
  if (BILDER) { await page.waitForTimeout(700); await page.screenshot({ path: file('velair-popup'), fullPage: false }); }

  if (act) {
    // Edit: the first own slot of today, +0,5°, save.
    const before = (s0.zones[AC].schedule[today] || []).slice();
    await need(tag + ': today has slots in the test week', before.length >= 1, before);
    const idx = 0;
    await tapMi('velair-edit:' + AC + '|' + idx);
    const e = await stable(page, POPUP, null, { until: (v) => v && v.labels.some((l) => /^Zeitfenster bearbeiten/.test(l.t)), max: 5000 });
    await check(tag + ': the editor opens', e && e.labels.some((l) => /^Zeitfenster bearbeiten/.test(l.t)), e && e.labels);
    await tapMi('velair-step:' + AC + '|temperature|+');
    await page.waitForTimeout(600);
    if (BILDER) { await page.waitForTimeout(500); await page.screenshot({ path: file('velair-bearbeiten') }); }
    await tapMi('velair-save:' + AC);
    let after = null;
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(300);
      const s = await sched();
      after = s.zones[AC].schedule[today];
      if (after && after[idx] && after[idx].temperature !== before[idx].temperature) break;
    }
    await check(tag + ': Speichern sends set_daily_schedule (+0,5° on that slot)', after && after[idx] && after[idx].temperature === before[idx].temperature + 0.5
      && after.length === before.length, { before: before[idx], after: after && after[idx] });
    const p2 = await stable(page, POPUP, null, { until: (v) => v && !v.labels.some((l) => /^Zeitfenster bearbeiten/.test(l.t)) && v.editable >= 1, max: 6000 });
    await check(tag + ': back to the day after saving', p2 && !p2.labels.some((l) => /^Zeitfenster bearbeiten/.test(l.t)), p2 && p2.labels);
    // Schedule off (Velair's zone pause) and on again.
    const row = await page.evaluate(() => { const r = window.__pierce('.hui-srow').find((n) => /^Zeitplan/.test(n.textContent.replace(/\s+/g, ' ').trim())
      && n.getBoundingClientRect().height > 0); if (!r) return null; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    await need(tag + ': schedule row', row);
    await page.waitForTimeout(700);
    await page.mouse.click(row.x, row.y);
    let rs = null;
    for (let i = 0; i < 20 && rs !== 'paused'; i++) { await page.waitForTimeout(300); rs = ((await sched()).zone_runtime[AC] || {}).state; }
    await check(tag + ': tapping "Zeitplan" pauses it (velair.pause_zone)', rs === 'paused', rs);
    const p3 = await stable(page, POPUP, null, { until: (v) => v && v.rows.some((r) => /^Zeitplan.*Aus$/.test(r)), max: 6000 });
    await check(tag + ': popup shows the schedule off', p3 && p3.rows.some((r) => /^Zeitplan.*Aus$/.test(r)), p3 && p3.rows);
    await page.waitForTimeout(700);
    await page.mouse.click(row.x, row.y);
    for (let i = 0; i < 20 && rs === 'paused'; i++) { await page.waitForTimeout(300); rs = ((await sched()).zone_runtime[AC] || {}).state; }
    await check(tag + ': tapping again resumes it (velair.resume_zone)', rs !== 'paused', rs);
  }

  // Velair is optional: the plain thermostat keeps its popup without any schedule.
  await need(tag + ': plain thermostat popup opens', await openTile('casora_thermostat'));
  const q = await stable(page, POPUP, null, { until: (v) => v && v.labels.length >= 1, max: 8000 });
  await check(tag + ': plain thermostat: no "Zeitplan"/"Woche", no Velair taps', q && !lab(q, 'Zeitplan') && !lab(q, 'Woche') && q.velairTaps === 0, q);
  await check(tag + ': plain thermostat: its own sections', q && lab(q, 'Einstellungen'), q && q.labels);
  if (BILDER) { await page.waitForTimeout(700); await page.screenshot({ path: file('thermostat-ohne-velair') }); }
}
c.close();
await finish();
