// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/02-devices.js#_casoraLaundry, custom_components/casora/scripts/local/00-finder.js#casoraLaundryFind, dev/casora_mock/waesche.py
// Owner 04.11.2026 (washer and dryer popups, v3): „Die Popups sind langweilig, da fehlt Inhalt! Wann Wartung etc., die
// Sensoren von WashData und Hersteller-Sensoren liefern sowas doch.“ Before: at rest only the dial and „Letzte
// Durchgänge“ (every row „Unbekanntes Programm“), care only while WashData flagged it, statistics, programmes of the
// counters, detection and recommendations hidden (v3 has no „Mehr“).
// Expected for the test house's WashData washer (dev/casora_mock/waesche.py, WashData answers taken over in the browser):
//  - off: „Pflege“ with the due task and „Erledigt“ (two steps → ha_washdata/add_maintenance_event, event_type = task),
//    „Weitere Pflege“ › sub page with the other tasks; „Letzte Durchgänge“ say „Programm nicht erkannt“; „Programme“ from
//    the per-programme counters; „Statistik“; „Erkennung“ with „Nächstes Programm“, „Programme beibringen“ (WashData
//    panel of the device), „Erkennung verbessern“
//  - running: „Durchgang“ with power and expected consumption, „Programm festlegen“ when nothing was recognised
//  - finished, laundry inside: „Wäsche ist noch drin“ with „Ausgeräumt“ → button.press on WashData's mark_unloaded
//  - phone 393: nothing sticks out of the sheet.
import { open, casoraDashboards, dashboard, fakeStates, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const isWasher = (d) => !d.mobile && JSON.stringify(d.config).includes('"casora_waschmaschine"');
const desk = all.find(isWasher);
await need('Dashboard mit Waschmaschine', desk, all.map((d) => d.url));

const now = Date.now(), D = 86400e3;
const iso = (ms) => new Date(ms).toISOString();
const CYCLES = [0, 1, 2, 3].map((i) => ({ id: 'c' + i, start_time: iso(now - (2 + i * 2) * D), end_time: iso(now - (2 + i * 2) * D + 6600e3),
  duration: 6600, status: 'completed', profile_name: null, energy_wh: 900 + i * 40 }));
const LOG = { log: [], due: ['filter_clean'], event_types: ['descale', 'filter_clean', 'drum_clean', 'other'],
  reminders: { descale: 60, filter_clean: 20, drum_clean: 30 }, cycles_since: { descale: 41, filter_clean: 23, drum_clean: 12 }, custom_tasks: [],
  status: [
    { id: 'filter_clean', custom: false, name: null, cycles_interval: 20, days_interval: 0, cycles_since: 23, days_since: 61 },
    { id: 'drum_clean', custom: false, name: null, cycles_interval: 30, days_interval: 0, cycles_since: 12, days_since: 30 },
    { id: 'descale', custom: false, name: null, cycles_interval: 60, days_interval: 0, cycles_since: 41, days_since: 95 }],
  lifetime_cycle_count: 214, limits: {} };

// WashData answers and service calls at the connection (it stays; hass objects change).
const intercept = (page) => page.evaluate(({ CYCLES, LOG }) => {
  const conn = document.querySelector('home-assistant').hass.connection;
  window.__qaWD = window.__qaWD || { calls: [], svc: [] };
  if (conn.__qaWD557) return;
  const orig = conn.sendMessagePromise.bind(conn);
  conn.sendMessagePromise = (msg) => {
    const q = window.__qaWD;
    if (msg && msg.type === 'ha_washdata/get_maintenance_log') return Promise.resolve(JSON.parse(JSON.stringify(LOG)));
    if (msg && msg.type === 'ha_washdata/get_device_cycles') return Promise.resolve({ cycles: JSON.parse(JSON.stringify(CYCLES)), total: CYCLES.length });
    if (msg && msg.type === 'ha_washdata/add_maintenance_event') { q.calls.push(msg); return Promise.resolve({ success: true, event: {} }); }
    if (msg && msg.type === 'call_service') { q.svc.push(msg); return Promise.resolve({ context: { id: 'qa' } }); }
    return orig(msg);
  };
  conn.__qaWD557 = true;
}, { CYCLES, LOG });

// The washer with WashData's keys (no fixed ids): source washdata, unload button, maintenance-due sensor.
const resolve = (page) => page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass;
  for (const b of window.__pierce('button-card')) {
    const cfg = b._config || {};
    if (![].concat(cfg.template || []).includes('casora_waschmaschine')) continue;
    const c = window._casoraLaundry.resolve(cfg.entity ? h.states[cfg.entity] : null, cfg.variables || {}, h.states, h);
    if (c.source === 'washdata' && !c.dryer && c.unload && c.maintdue && c.profiles.length) return c;
  }
  return null;
});

const offen = (page) => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
// Open like a tap on the tile (also when the tile sits on a closed room page of the phone).
const openPopup = async (page, st) => {
  await page.evaluate((st) => new Promise((res) => {
    const el = window.__pierce('button-card').find((x) => (x._config || {}).entity === st);
    if (!el) return res(false);
    el.addEventListener('hass-action', (ev) => {
      const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); res(true); } else res(false);
    }, { capture: true, once: true });
    try { el._handleAction({ detail: { action: 'tap' } }, { isIcon: false }); } catch (e) { res(false); }
    setTimeout(() => res(false), 1500);
  }), st);
  for (let w = 0; w < 24 && !(await offen(page)); w++) await page.waitForTimeout(250);
  await page.waitForTimeout(2600);
  return offen(page);
};
const closePopup = async (page) => { await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* closed */ } }); await page.waitForTimeout(700); };
const info = (page) => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => { const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!pop) return null;
  const root = pop.shadowRoot || pop;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
  const leaves = window.__pierce('*', root).filter((e) => e.children.length === 0 && vis(e));
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const surf = (window.casoraPopup.surface && window.casoraPopup.surface.getBoundingClientRect()) || pop.getBoundingClientRect();
  const out = window.__pierce('.hui-row', root).filter(vis).map((r) => r.getBoundingClientRect())
    .filter((r) => r.right > Math.min(surf.right, innerWidth) + 1 || r.left < Math.max(surf.left, 0) - 1).length;
  const cut = leaves.filter((e) => { const cs = getComputedStyle(e); return e.scrollWidth > e.clientWidth + 1 && /hidden|clip/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && !(cs.webkitLineClamp > 0); }).map(txt);
  return {
    rows: window.__pierce('.hui-row', root).filter(vis).map(txt),
    texts: leaves.map(txt).filter(Boolean),
    done: window.__pierce('[data-hw-maint]', root).filter(vis).map((e) => ({ k: e.dataset.hwMaint, ...box(e) })),
    unloaded: (() => { const e = leaves.find((x) => txt(x) === 'Ausgeräumt'); return e ? box(e) : null; })(),
    more: (() => { const e = window.__pierce('.hui-row', root).filter(vis).find((r) => /^Weitere Pflege/.test(txt(r))); return e ? box(e) : null; })(),
    out, cut, docOver: document.documentElement.scrollWidth - innerWidth,
  };
});
const has = (pi, re) => !!pi && pi.rows.some((r) => re.test(r));
const head = (pi, w) => !!pi && pi.texts.some((t) => t.toUpperCase() === w.toUpperCase());

for (const [mode, w, h] of [['desk', 1440, 1000], ['phone', 393, 852]]) {
  const { page } = await open({ width: w, height: h, scale: 1, theme: 'Casora', dark: false, mobile: mode === 'phone' });
  const dash = mode === 'phone' ? (all.find((d) => d.url === desk.url + '-mobile') || desk) : desk;
  // The washer's view (desktop: its room; phone: the start page holds every room's tiles).
  let c = null;
  const views = (dash.config.views || []).map((v, i) => ({ v, i })).filter(({ v }) => JSON.stringify(v).includes('"casora_waschmaschine"'));
  for (const { v, i } of views) {
    await dashboard(page, dash.url + '/' + (v.path || String(i)), 3);
    c = await resolve(page);
    if (c) break;
  }
  await intercept(page);
  await need(mode + ': WashData-Waschmaschine des Testhauses (Wartung fällig, Zähler je Programm)', c, c);
  const reset = () => page.evaluate((st) => { const L = window._casoraLaundry; delete L.data[st]; L.busy[st] = false; }, c.st);
  const set = (p) => fakeStates(page, p, { sticky: true });

  // ── Off ──
  await reset();
  await set({ [c.st]: { state: 'off', attributes: { current_program_guess: 'off', cycle_anomaly: null } },
    ...(c.program ? { [c.program]: { state: 'off' } } : {}), ...(c.progress ? { [c.progress]: { state: '0' } } : {}),
    ...(c.remaining ? { [c.remaining]: { state: 'unknown' } } : {}), ...(c.select ? { [c.select]: { state: 'auto_detect' } } : {}),
    ...(c.unload ? { [c.unload]: { state: 'unavailable' } } : {}) });
  await check(mode + ' aus: Popup offen', await openPopup(page, c.st));
  let pi = await info(page);
  await check(mode + ' aus: „Pflege“ mit fälligem „Filter reinigen“ und „Erledigt“',
    head(pi, 'Pflege') && has(pi, /^Filter reinigen.*Fällig · 23 Durchgänge/) && pi.done.some((d) => d.k.split('|')[1] === 'filter_clean'), pi && pi.rows);
  await check(mode + ' aus: „Weitere Pflege“ nennt die nächste Pflege', has(pi, /^Weitere Pflege.*Entkalken · In 19 Durchgängen fällig/), pi && pi.rows);
  await check(mode + ' aus: „Letzte Durchgänge“ sagen „Programm nicht erkannt“',
    has(pi, /^Programm nicht erkannt/) && !has(pi, /Unbekanntes Programm/), pi && pi.rows);
  await check(mode + ' aus: „Programme“ aus den Zählern je Programm', head(pi, 'Programme') && has(pi, /^Baumwolle 40.*96×/), pi && pi.rows);
  await check(mode + ' aus: „Statistik“ mit Durchgängen insgesamt und Verbrauch', head(pi, 'Statistik')
    && has(pi, /^Durchgänge insgesamt.*214/) && has(pi, /^Verbrauch insgesamt/) && has(pi, /^Ø pro Durchgang/), pi && pi.rows);
  await check(mode + ' aus: „Erkennung“ mit nächstem Programm, Programme beibringen, Empfehlungen', head(pi, 'Erkennung')
    && has(pi, /^Nächstes Programm.*Automatisch/) && has(pi, /^Programme beibringen/) && has(pi, /^Erkennung verbessern.*2 Einstellungen empfohlen/), pi && pi.rows);
  await check(mode + ' aus: nichts ragt aus dem Popup', pi && pi.out === 0 && !pi.cut.length && pi.docOver <= 0, pi && { out: pi.out, cut: pi.cut, docOver: pi.docOver });
  if (mode === 'desk') {
    // „Erledigt“: two steps, then WashData's maintenance event for this task and device.
    const b = pi.done.find((d) => d.k.split('|')[1] === 'filter_clean');
    await page.mouse.click(b.x, b.y); await page.waitForTimeout(500);
    await page.mouse.click(b.x, b.y); await page.waitForTimeout(1200);
    const calls = await page.evaluate(() => window.__qaWD.calls);
    await check('Erledigt → ha_washdata/add_maintenance_event (filter_clean, Eintrag des Geräts)',
      calls.some((m) => m.event_type === 'filter_clean' && m.entry_id === c.entry), calls);
    // „Weitere Pflege“ › sub page with every task.
    pi = await info(page);
    if (pi && pi.more) { await page.mouse.click(pi.more.x, pi.more.y); await page.waitForTimeout(1500); }
    const sub = await info(page);
    await check('„Weitere Pflege“ öffnet die Pflege-Seite mit allen Aufgaben',
      has(sub, /^Trommelreinigung.*In 18 Durchgängen fällig/) && has(sub, /^Entkalken/), sub && sub.rows);
  }
  await closePopup(page);

  // ── Running, programme not recognised ──
  await reset();
  await set({ [c.st]: { state: 'running', attributes: { current_program_guess: 'detecting...' } },
    ...(c.program ? { [c.program]: { state: 'unknown' } } : {}),
    ...(c.progress ? { [c.progress]: { state: '58', attributes: { projected_energy_kwh: 0.82, projected_cost: 0.29 } } } : {}),
    ...(c.remaining ? { [c.remaining]: { state: '41' } } : {}), ...(c.power ? { [c.power]: { state: '160' } } : {}) });
  await check(mode + ' läuft: Popup offen', await openPopup(page, c.st));
  pi = await info(page);
  await check(mode + ' läuft: „Durchgang“ mit Leistung und voraussichtlichem Verbrauch',
    has(pi, /^Leistung.*160 W/) && has(pi, /^Verbrauch.*Voraussichtlich.*0,82 kWh/), pi && pi.rows);
  await check(mode + ' läuft: „Programm festlegen“, Programm nicht erkannt', has(pi, /^Programm festlegen.*Programm nicht erkannt/), pi && pi.rows);
  await check(mode + ' läuft: nichts ragt aus dem Popup', pi && pi.out === 0 && !pi.cut.length && pi.docOver <= 0, pi && { out: pi.out, cut: pi.cut });
  await closePopup(page);

  // ── Finished, laundry still inside ──
  await reset();
  await set({ [c.st]: { state: 'clean', attributes: { current_program_guess: 'off' }, last_changed: iso(now - 85 * 60e3) },
    ...(c.progress ? { [c.progress]: { state: '100' } } : {}), [c.unload]: { state: 'unknown' } });
  await check(mode + ' fertig: Popup offen', await openPopup(page, c.st));
  pi = await info(page);
  await check(mode + ' fertig: „Wäsche ist noch drin“ mit „Ausgeräumt“', has(pi, /^Wäsche ist noch drin.*Wartet seit/) && !!pi.unloaded, pi && pi.rows);
  await check(mode + ' fertig: nichts ragt aus dem Popup', pi && pi.out === 0 && !pi.cut.length && pi.docOver <= 0, pi && { out: pi.out, cut: pi.cut });
  if (mode === 'desk' && pi && pi.unloaded) {
    await page.mouse.click(pi.unloaded.x, pi.unloaded.y);
    await page.waitForTimeout(1200);
    const svc = await page.evaluate(() => window.__qaWD.svc);
    await check('Ausgeräumt → button.press auf WashData „mark_unloaded“', svc.some((m) => m.domain === 'button' && m.service === 'press'
      && [].concat((m.target || {}).entity_id || (m.service_data || {}).entity_id || []).includes(c.unload)), svc);
  }
  await closePopup(page);
}
await finish();
