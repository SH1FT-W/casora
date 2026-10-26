// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/14-pulse.js
// Neu (09.10.2026, Casora 1.2.x): Pulse-Kachel (casora_pulse) und Pulse-Popup (casora_popup_pulse) aus den
// Entitäten der Integration „Pulse“. Das Testhaus hat kein Pulse – die Pulse-Entitäten werden im Browser
// künstlich eingespielt (Registry-Einträge mit platform 'pulse' + translation_key, Geräte, Zustände; alles
// erfunden). Auf Kopien der Casora-Dashboards (qa-pulse, qa-pulse-mobile) steht die Kachel auf der Startseite.
// Erwartet am Desktop und Handy (hell + dunkel, Theme Casora):
//   - alles ok: Kachel „Alles ok“, nicht hinterlegt; nur „bald fällig“: „N bald fällig“, hinterlegt (1.4)
//   - Probleme: „3 Probleme · 1 Batterie bald fällig · 1 beobachten“ (seit 1.4.2 Batterie getrennt), hinterlegt, Symbol rot
//   - Popup (restyle 26.10.): short subline „3 Probleme · 2 ok“ on one line, thin bar without legend,
//     „Ausgefallen 1“/„Prüfen 2“/„Beobachten 2“ stacked with count pills centred on the heading, entries of a
//     section side by side on the desktop (one column on the phone), the time in the subline („seit 2 Tagen“),
//     battery as a badge at the icon's bottom right, „Alles ok“ collapsed (count centred), „In Pulse öffnen“ as a link
//   - ✓ „Batterie gewechselt“ → Bestätigen → pulse.mark_replaced mit der device_id des Geräts, danach ein Hinweis
// Bilder fürs Ergebnis: CASORA_PULSE_BILDER=<ordner> legt dort je Ansicht Kachel- und Popup-Bilder ab.
import fs from 'node:fs';
import { open, casoraDashboards, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_PULSE_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

// ── Prüf-Dashboards: Kopie mit Pulse-Kachel direkt hinter einer Haus-Kachel der Startseite ──
// (Rezept, sonst Batterien – das Testhaus hat keine eigene Batterien-Kachel.)
const ANCHOR = ['casora_recipe', 'casora_battery'];
const tplOf = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? [].concat(x.template || []) : []);
const has = (d) => (d.config.views || []).some((v) => ANCHOR.some((a) => JSON.stringify(v).includes('"' + a + '"')));
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && has(d));
const phone = all.find((d) => d.mobile && has(d));
await need('Dashboards mit Rezept- oder Batterien-Kachel', desk && phone, all.map((d) => d.url));

const PROBLEMS = 'sensor.pulse_qa_probleme';
const withPulse = (cfg) => {
  const c = JSON.parse(JSON.stringify(cfg));
  let done = false, view = null;
  (function walk(x, vi) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length && !done; i++) {
        if (tplOf(x[i]).some((t) => ANCHOR.includes(t))) {
          const card = JSON.parse(JSON.stringify(x[i]));
          card.template = 'casora_pulse'; card.entity = PROBLEMS; card.name = 'Pulse';
          card.variables = { icon: 'pulse' };
          x.splice(i + 1, 0, card);
          done = true; view = vi;
          return;
        }
        walk(x[i], vi);
      }
      return;
    }
    Object.keys(x).forEach((k) => walk(x[k], vi));
  })(c.views, null);
  c.views.forEach((v, i) => { if (view === null && JSON.stringify(v).includes('casora_pulse')) view = v.path || i; });
  return { config: c, view };
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
const D = withPulse(desk.config), M = withPulse(phone.config);
await need('Pulse-Kachel eingesetzt', D.view !== null && M.view !== null);
await save('qa-pulse', D.config, 'QA Pulse');
await save('qa-pulse-mobile', M.config, 'QA Pulse Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});
c.close();

// ── Künstliches Pulse: Geräte, Registry-Einträge, Zustände (Fantasienamen) ──
const NOW = Date.now();
const iso = (h) => new Date(NOW - h * 3600000).toISOString();
const DEV = [
  // [id, Name, Status, reason_key, Stille seit (Std.), Takt (s), kritisch, Batterie %]
  ['qa_p1', 'Rauchmelder Dachboden', 'failed', 'silent', 50, 4 * 3600, true, 80],
  ['qa_p2', 'Fenster Atelier', 'check', 'battery_low', null, null, false, 7],
  ['qa_p3', 'Bewegung Treppe', 'check', 'silent', 9, 3600, false, null],
  ['qa_p4', 'Thermometer Wintergarten', 'watch', 'battery_soon', null, null, false, 18],
  ['qa_p5', 'Wassermelder Waschküche', 'watch', 'waiting_first', null, null, true, 100],
  ['qa_p6', 'Tür Geräteschuppen', 'ok', 'ok_rhythm', null, 2 * 86400, false, 64],
  ['qa_p7', 'Taster Leseecke', 'learning', 'learning', null, null, false, 92],
];
const scenario = (kind) => {
  const entities = {}, devices = {}, states = {};
  const put = (id, platform, key, dev, state, attributes) => {
    entities[id] = { entity_id: id, platform, translation_key: key, device_id: dev, area_id: null, labels: [],
      entity_category: platform === 'pulse' && key !== 'problems' && key !== 'monitored' ? 'diagnostic' : null };
    states[id] = { entity_id: id, state, attributes: attributes || {}, context: { id: 'qa' },
      last_changed: new Date().toISOString(), last_updated: new Date().toISOString() };
  };
  let problems = 0;
  DEV.forEach(([id, name, st0, rk0, since, every, crit, bat], i) => {
    const st = kind === 'ok' ? (i < 5 ? 'ok' : st0) : kind === 'watch' ? (st0 === 'watch' ? st0 : i < 3 ? 'ok' : st0) : st0;
    const rk = st === st0 ? rk0 : 'ok_rhythm';
    if (st === 'check' || st === 'failed') problems++;
    devices[id] = { id, name, name_by_user: null, area_id: null, entry_type: null, via_device_id: null, disabled_by: null };
    put('sensor.' + id + '_pulse_status', 'pulse', 'status', id, st, { device_class: 'enum', reason_key: rk,
      silent_since: st === st0 && since ? iso(since) : null, typical_interval: every, critical: crit, snoozed_until: null });
    put('binary_sensor.' + id + '_pulse_problem', 'pulse', 'problem', id, st === 'check' || st === 'failed' ? 'on' : 'off', { device_class: 'problem' });
    put('sensor.' + id + '_pulse_zuletzt_gemeldet', 'pulse', 'last_report', id, iso(1), { device_class: 'timestamp' });
    if (bat != null) put('sensor.' + id + '_batterie', 'qa_mock', null, id, String(st === st0 || bat > 20 ? bat : 70), { device_class: 'battery', unit_of_measurement: '%' });
  });
  devices.qa_pulse_hub = { id: 'qa_pulse_hub', name: 'Pulse', entry_type: 'service', area_id: null };
  put(PROBLEMS, 'pulse', 'problems', 'qa_pulse_hub', String(problems), { devices: [], unit_of_measurement: 'Geräte' });
  put('sensor.pulse_qa_ueberwacht', 'pulse', 'monitored', 'qa_pulse_hub', String(DEV.length), { unit_of_measurement: 'Geräte' });
  return { entities, devices, states };
};
// Im Browser: bei jeder hass-Verteilung die künstlichen Einträge dazumischen (wie fakeStates sticky).
const inject = (pg, kind) => pg.evaluate((sc) => {
  const ha = document.querySelector('home-assistant');
  const merge = (obj) => {
    if (!obj) return obj;
    const o = { ...obj };
    if (obj.entities) o.entities = { ...obj.entities, ...sc.entities };
    if (obj.devices) o.devices = { ...obj.devices, ...sc.devices };
    if (obj.states) o.states = { ...obj.states, ...sc.states };
    return o;
  };
  const orig = ha.__qaPulseOrig || ha._updateHass;
  ha.__qaPulseOrig = orig;
  ha._updateHass = function (obj) { return orig.call(this, merge(obj)); };
  const h = ha.hass;
  orig.call(ha, merge({ entities: h.entities, devices: h.devices, states: h.states }));
}, scenario(kind));

const TILE = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_pulse')
    && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  b.scrollIntoView({ block: 'center' });
  const sr = b.shadowRoot, r = b.getBoundingClientRect();
  const st = sr.querySelector('#state'), cell = sr.querySelector('#img-cell');
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, box: { l: r.left, t: r.top, w: r.width, h: r.height },
    state: st ? st.textContent.trim() : '', icon: cell ? getComputedStyle(cell).backgroundColor : null,
    active: getComputedStyle(sr.querySelector('ha-card')).getPropertyValue('--casora-active-overlay-opacity').trim() === '1' };
};
const red = (c) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return !!m && +m[1] > 150 && +m[1] > +m[2] + 50; };
const green = (c) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return !!m && +m[2] > +m[1] && +m[2] > +m[3]; };

const VIEWS = [
  ['Desktop hell', { width: 1440, height: 1000, scale: 1, dark: false }, 'qa-pulse', D.view, false],
  ['Desktop dunkel', { width: 1440, height: 1000, scale: 1, dark: true }, 'qa-pulse', D.view, false],
  ['Handy hell', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false }, 'qa-pulse-mobile', M.view, true],
  ['Handy dunkel', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true }, 'qa-pulse-mobile', M.view, true],
];
for (const [tag, o, url, view, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  await dashboard(page, url + '/' + view, 3);
  const file = (n) => BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '-' + n + '.png';
  const tileShot = async (n) => {
    if (!BILDER) return;
    const t = await page.evaluate(TILE);
    if (t) await page.screenshot({ path: file(n), clip: { x: Math.max(0, t.box.l - 16), y: Math.max(0, t.box.t - 16), width: t.box.w + 32, height: t.box.h + 32 } });
  };

  await inject(page, 'ok');
  let m = await stable(page, TILE);
  await need(tag + ': Pulse-Kachel gefunden', m);
  await check(tag + ': alles ok – „Alles ok“', /Alles ok/.test(m.state), m.state);
  await check(tag + ': alles ok – nicht hinterlegt', !m.active, m.active);
  await tileShot('kachel-ok');

  await inject(page, 'watch');
  m = await stable(page, TILE);
  await check(tag + ': nur bald fällig – hinterlegt, „bald fällig“', m.active && /bald fällig/.test(m.state), m);

  await inject(page, 'many');
  m = await stable(page, TILE);
  await check(tag + ': Probleme – „3 Probleme · 1 Batterie bald fällig · 1 beobachten“', /3 Probleme/.test(m.state) && /1 Batterie bald fällig/.test(m.state) && /1 beobachten/.test(m.state), m.state);
  await check(tag + ': Probleme – hinterlegt', m.active, m.active);
  await check(tag + ': Probleme – Symbol rot (ausgefallen)', red(m.icon), m.icon);
  await tileShot('kachel-probleme');
  if (BILDER && !mobile) await page.screenshot({ path: file('dashboard') });

  // Popup öffnen (unter Last bis zu 4 Mal, wie r81).
  const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
  for (let t = 0; t < 4 && !(await offen()); t++) {
    const at = (await page.evaluate(TILE)) || m;
    if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
  }
  await need(tag + ': Popup geöffnet', await offen());
  const p = await stable(page, () => {
    const box = (n) => { if (!n) return null; const q = n.getBoundingClientRect(); return { l: q.left, r: q.right, t: q.top, b: q.bottom, cy: (q.top + q.bottom) / 2 }; };
    const heads = window.__pierce('.pls-h').filter((h) => h.getBoundingClientRect().height > 0).map((h) => {
      const t = h.querySelector('.pls-ht'), n = h.querySelector('.pls-n');
      return { t: t ? t.textContent.trim() : '', n: n ? n.textContent.trim() : '', dy: t && n ? box(n).cy - box(t).cy : null, x: box(h).l };
    });
    const rows = window.__pierce('.hui-srow').filter((r) => r.getBoundingClientRect().height > 0);
    const row = (re) => rows.find((r) => re.test(r.textContent));
    const more = window.__pierce('.hui-more')[0];
    const mhd = more && more.querySelector('.hui-mhd'), mct = more && more.querySelector('.hui-mct'), mlb = more && more.querySelector('.hui-mlb');
    const link = window.__pierce('[data-casora-link="/pulse"]')[0];
    const bar = window.__pierce('.pls-bar span').length;
    const leg = window.__pierce('.pls-leg').length;
    const status = window.__pierce('.header-status').find((n) => !n.hidden && n.getBoundingClientRect().height > 0);
    const line = (status || window.__pierce('.hui-line')[0] || {}).textContent || '';
    const ring = window.__pierce('.header-ring')[0];
    const win = row(/Fenster Atelier/), stairs = row(/Bewegung Treppe/), smoke = row(/Rauchmelder Dachboden/);
    const pct = win && win.querySelector('.pls-pct'), ic = pct && pct.parentElement.firstElementChild;
    const tagEl = smoke && smoke.querySelector('.pls-tag');
    const lh = status ? parseFloat(getComputedStyle(status).lineHeight) || parseFloat(getComputedStyle(status).fontSize) * 1.4 : null;
    // Not ready yet (header line not mirrored, sections missing): null keeps stable() waiting.
    if (!status || heads.length < 3) return null;
    return { heads, rows: rows.length, line: line.replace(/\s+/g, ' ').trim(), bar, leg,
      lineH: status ? status.getBoundingClientRect().height : null, lh,
      win: box(win), stairs: box(stairs), single: smoke && win ? box(smoke).r - box(smoke).l - (box(win).r - box(win).l) : null,
      smokeSub: smoke ? (smoke.querySelector('.hui-sub') || {}).textContent : '',
      pct: pct ? { t: pct.textContent.trim(), dr: box(pct).r - box(ic).r, db: box(pct).b - box(ic).b, top: box(pct).t - box(ic).t, icH: box(ic).b - box(ic).t } : null,
      right: win ? [...win.querySelectorAll('.hui-end')].filter((n) => n.getBoundingClientRect().width > 0).map((n) => (n.innerText || "").trim()) : null,
      moreOpen: more ? more.classList.contains('open') : null, moreTxt: more ? more.textContent.replace(/\s+/g, ' ').trim() : '',
      moreDy: mct && mhd ? box(mct).cy - box(mhd).cy : null, moreLbDy: mct && mlb ? box(mct).cy - box(mlb).cy : null,
      link: !!link, linkRow: !!(link && link.closest('.hui-srow')),
      // Tag beside the name, not cut by the name's ellipsis.
      chip: !!tagEl && /Wichtig/i.test(tagEl.textContent) && tagEl.getBoundingClientRect().width > 20
        && tagEl.getBoundingClientRect().right <= tagEl.parentElement.getBoundingClientRect().right + 1,
      ring: ring && !ring.hidden ? getComputedStyle(ring).backgroundColor : null };
  }, undefined, { max: 9000 });
  await need(tag + ': Popup-Inhalt vollständig', p, p);
  await check(tag + ': Unterzeile kurz „3 Probleme · 2 ok“', /3 Probleme/.test(p.line) && /2 ok/.test(p.line) && !/beobachten/.test(p.line), p.line);
  await check(tag + ': Unterzeile auf einer Zeile', p.lineH !== null && p.lineH < p.lh * 1.6, { h: p.lineH, lh: p.lh });
  await check(tag + ': Übersichtsleiste mit 4 Teilen, ohne Legende', p.bar === 4 && p.leg === 0, p);
  await check(tag + ': Abschnitte „Ausgefallen 1“, „Prüfen 2“, „Beobachten 2“ untereinander', JSON.stringify(p.heads.map((h) => h.t + ' ' + h.n)) === JSON.stringify(['Ausgefallen 1', 'Prüfen 2', 'Beobachten 2'])
    && p.heads.every((h) => Math.abs(h.x - p.heads[0].x) < 1), p.heads);
  await check(tag + ': Zahl mittig zur Überschrift (±1 px)', p.heads.every((h) => h.dy !== null && Math.abs(h.dy) <= 1), p.heads.map((h) => h.dy));
  await check(tag + ': 5 sichtbare Zeilen (3 Probleme, 2 beobachten), „In Pulse öffnen“ keine Zeile', p.rows === 5 && !p.linkRow, p.rows);
  await check(tag + ': Zeit im Satz („Antwortet seit 2 Tagen nicht“)', /Antwortet seit 2 Tagen nicht/.test(p.smokeSub || ''), p.smokeSub);
  await check(tag + ': rechts nur ✓ und › (kein Text)', p.right && p.right.every((t) => !t), p.right);
  await check(tag + ': Akku-Schild „7 %“ unten rechts am Symbol (6 px Versatz, unter der Glyphe)', p.pct && /^7\s?%$/.test(p.pct.t.replace(/[  ]/g, ' '))
    && Math.abs(p.pct.dr - 6) <= 1 && Math.abs(p.pct.db - 6) <= 1 && p.pct.top >= p.pct.icH * 0.75 - 1, p.pct);
  await check(tag + ': „Alles ok“ eingeklappt, Zahl mittig', p.moreOpen === false && /Alles ok/i.test(p.moreTxt) && Math.abs(p.moreDy) <= 1 && Math.abs(p.moreLbDy) <= 1, p);
  await check(tag + ': „In Pulse öffnen“ führt ins Pulse-Panel', p.link, p.link);
  await check(tag + ': „Wichtig“ neben dem Namen', p.chip, p.chip);
  await check(tag + ': Ring in Alarmfarbe', red(p.ring), p.ring);
  if (mobile) await check(tag + ': Handy einspaltig', p.win && p.stairs && Math.abs(p.win.l - p.stairs.l) < 2 && p.win.t > p.stairs.b, p);
  else await check(tag + ': Desktop: Einträge eines Abschnitts nebeneinander, ein einzelner über die volle Breite', p.win && p.stairs
    && Math.abs(p.win.t - p.stairs.t) < 2 && p.win.l > p.stairs.r && p.single > 200, p);
  // Gemeldet 11.10.2026: aufgeklappt stand „Alles ok“ am Desktop nur in der linken Hälfte, einspaltig.
  if (!mobile) {
    for (let i = 0; i < 3; i++) {
      const closed = await page.evaluate(() => { const h = window.__pierce('.hui-more:not(.open) > .hui-mhd').find((x) => x.getBoundingClientRect().height > 0);
        if (!h) return false; h.click(); return true; });
      if (!closed) break;
      await page.waitForTimeout(500);
    }
    const ok = await page.evaluate(() => { const box = window.__pierce('.hui-more.open').filter((m) => /Meldet|ok/i.test(m.textContent)).pop();
      if (!box) return null; const rows = [...box.querySelectorAll('.hui-srow')].filter((r) => r.getBoundingClientRect().height > 0);
      const pop = box.getBoundingClientRect();
      return { lefts: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left)))], rights: Math.max(...rows.map((r) => r.getBoundingClientRect().right)), boxR: pop.right, n: rows.length }; });
    await check(tag + ': „Alles ok“ aufgeklappt zweispaltig über die volle Breite', ok && ok.n >= 2 && ok.lefts.length >= 2 && ok.rights > ok.boxR - 40, ok);
  }
  if (BILDER) {
    await page.waitForTimeout(500);
    await page.screenshot({ path: file('popup'), fullPage: false });
  }

  // ✓ „Batterie gewechselt“ → Bestätigen → Dienst (abgefangen, nichts wird wirklich aufgerufen) → Hinweis.
  if (tag === 'Desktop hell' || tag === 'Handy hell') {
    await page.evaluate(() => {
      const ha = document.querySelector('home-assistant');
      window.__qaCalls = []; window.__qaNotes = [];
      const h = ha.hass;
      h.callService = (d, s, data) => { window.__qaCalls.push({ d, s, data }); return Promise.resolve({}); };
      ha.addEventListener('hass-notification', (e) => window.__qaNotes.push(e.detail && e.detail.message), { capture: true });
    });
    const at = await page.evaluate(() => {
      const row = window.__pierce('.hui-srow').find((r) => /Fenster Atelier/.test(r.textContent));
      const act = row && [...row.querySelectorAll('[data-casora-arm]')].find((n) => /Batterie gewechselt/.test(n.getAttribute('aria-label') || ''));
      if (!act) return null;
      act.scrollIntoView({ block: 'center' });
      const q = act.getBoundingClientRect(), ab = act.querySelector('.hui-ab'), b = { width: ab.offsetWidth, height: ab.offsetHeight };
      return { x: q.x + q.width / 2, y: q.y + q.height / 2, w: act.offsetWidth, h: act.offsetHeight, round: Math.round(b.width) === Math.round(b.height) && b.width >= 32,
        title: act.getAttribute('title') };
    });
    await check(tag + ': runder ✓-Knopf „Batterie gewechselt“ (Tooltip, Fläche ≥ 40 px)', at && at.round && /Batterie gewechselt/.test(at.title || '') && at.w >= 40 && at.h >= 40, at);
    if (at) {
      if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      await page.waitForTimeout(600);
      const cf = await page.evaluate(() => {
        const row = window.__pierce('.hui-srow.armed').find((r) => /Fenster Atelier/.test(r.textContent));
        const b = row && row.querySelector('.hui-cf');
        if (!b) return null;
        const q = b.getBoundingClientRect();
        return { x: q.x + q.width / 2, y: q.y + q.height / 2, t: b.textContent.trim() };
      });
      await check(tag + ': Rückfrage „Batterie gewechselt“', cf && /Batterie gewechselt/.test(cf.t), cf);
      if (BILDER && cf) await page.screenshot({ path: file('rueckfrage') });
      if (cf) {
        // Dienst erst direkt vor dem Bestätigen abfangen (hass wird bei jeder Änderung neu verteilt).
        await page.evaluate(() => { document.querySelector('home-assistant').hass.callService = (d, s, data) => { window.__qaCalls.push({ d, s, data }); return Promise.resolve({}); }; });
        if (mobile) await page.touchscreen.tap(cf.x, cf.y); else await page.mouse.click(cf.x, cf.y);
        await page.waitForTimeout(700);
      }
      const r = await page.evaluate(() => ({ calls: window.__qaCalls, notes: window.__qaNotes }));
      await check(tag + ': pulse.mark_replaced mit device_id', r.calls.length === 1 && r.calls[0].d === 'pulse' && r.calls[0].s === 'mark_replaced'
        && r.calls[0].data && r.calls[0].data.device_id === 'qa_p2', r.calls);
      await check(tag + ': Rückmeldung als Hinweis', r.notes.some((n) => /Batteriewechsel/.test(n || '')), r.notes);
    }
  }
  await page.context().browser().close().catch(() => {});
}
await finish();
