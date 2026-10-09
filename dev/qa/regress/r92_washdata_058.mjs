// @zustand: arbeit
// @parallel: ui
// Gewünscht (09.10.2026, 1.2.1): WashData 0.5.8 unterstützen, ohne 0.5.7 zu brechen.
// 0.5.8 bringt eigene Wartungsarten je Gerätetyp (Geschirrspüler: Salz, Klarspüler; Trockner: Flusensieb,
// Kondensator), eigene Wartungsaufgaben (custom_…, Intervall in Durchgängen und/oder Tagen, Antwort
// get_maintenance_log mit status) und den Zustand paused mit cycle_anomaly „stalled“ (Maschine steht
// auf Standby, z. B. Unwucht). Vorher zeigte Casora beim Trockner nur filter_clean (bei 0.5.8 also gar
// keine Pflege mehr), beim Spüler fehlten Salz/Klarspüler, eigene Aufgaben fehlten ganz und ein
// Stillstand hieß nur „Pausiert“.
// Erwartet (Casora hell, Desktop 1440): Trockner zeigt „Flusensieb reinigen“ und „Kondensator reinigen“,
// die eigene Aufgabe mit ihrem Namen (fällig nach Tagen), „Erledigt“ schickt add_maintenance_event mit
// event_type = Kennung der Aufgabe; Kachel „… fällig“ auch für neue Arten, eigene mit Namen. Spüler-Antwort
// zeigt „Salz nachfüllen“/„Klarspüler nachfüllen“. Stalled: „Angehalten“ + „steht still, evtl. Unwucht“.
// idle: „Bereit“, nicht aktiv, keine Fortschrittsleiste. 0.5.7-Antwort ohne status: Zeilen wie bisher.
// Die WashData-Antworten werden im Browser untergeschoben (Verbindung abgefangen), Zustände per fakeStates.
import { open, casoraDashboards, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';

const all = await casoraDashboards();
const has = (d, t) => JSON.stringify(d.config).includes('"' + t + '"');
const desk = all.find((d) => !d.mobile && has(d, 'casora_trockner') && has(d, 'casora_waschmaschine'));
await need('Dashboard mit Waschmaschine und Trockner', desk, all.map((d) => d.url));

const CUSTOM = 'custom_ab12cd';
// Antworten von ha_washdata/get_maintenance_log je Fall (Form wie WashData 0.5.8 bzw. 0.5.7).
const LOGS = {
  dry058: {
    log: [], due: ['lint_filter', CUSTOM], event_types: ['lint_filter', 'condenser_clean', 'other'],
    reminders: { lint_filter: 10, condenser_clean: 30 }, cycles_since: { lint_filter: 12, condenser_clean: 5 },
    custom_tasks: [{ id: CUSTOM, name: 'Türdichtung abwischen', cycles: 0, days: 30, since: '2026-08-29T10:00:00+00:00', since_cycle_count: 111 }],
    status: [
      { id: 'lint_filter', custom: false, name: null, cycles_interval: 10, days_interval: 0, cycles_since: 12, days_since: 3 },
      { id: 'condenser_clean', custom: false, name: null, cycles_interval: 30, days_interval: 0, cycles_since: 5, days_since: 3 },
      { id: CUSTOM, custom: true, name: 'Türdichtung abwischen', cycles_interval: 0, days_interval: 30, cycles_since: 9, days_since: 41 },
    ],
    lifetime_cycle_count: 120, limits: {},
  },
  dish058: {
    log: [], due: ['salt'], event_types: ['salt', 'rinse_aid', 'filter_clean', 'descale', 'other'],
    reminders: { salt: 30, rinse_aid: 40, filter_clean: 50 }, cycles_since: { salt: 31, rinse_aid: 12, filter_clean: 12 }, custom_tasks: [],
    status: [
      { id: 'salt', custom: false, name: null, cycles_interval: 30, days_interval: 0, cycles_since: 31, days_since: 20 },
      { id: 'rinse_aid', custom: false, name: null, cycles_interval: 40, days_interval: 0, cycles_since: 12, days_since: 8 },
      { id: 'filter_clean', custom: false, name: null, cycles_interval: 50, days_interval: 0, cycles_since: 12, days_since: 8 },
    ],
    lifetime_cycle_count: 300, limits: {},
  },
  wash057: { log: [], due: ['descale'], event_types: ['descale', 'filter_clean', 'drum_clean', 'bearing_service', 'other'],
    reminders: { descale: 30, filter_clean: 50, drum_clean: 100 }, cycles_since: { descale: 31, filter_clean: 10, drum_clean: 20 } },
  dry057: { log: [], due: ['filter_clean'], event_types: ['descale', 'filter_clean', 'drum_clean', 'bearing_service', 'other'],
    reminders: { descale: 30, filter_clean: 50 }, cycles_since: { descale: 3, filter_clean: 52 } },
};

const { page } = await open({ width: 1440, height: 900, scale: 1, theme: 'Casora', dark: false });
const viewOf = (tpl) => (desk.config.views || []).find((v) => v.path !== 'home' && JSON.stringify(v).includes('"' + tpl + '"'))
  || desk.config.views.find((v) => JSON.stringify(v).includes('"' + tpl + '"'));

// WashData-Befehle an der Verbindung abfangen (die Verbindung bleibt, hass-Objekte wechseln).
const intercept = () => page.evaluate((LOGS) => {
  const h = document.querySelector('home-assistant').hass;
  const conn = h.connection;
  window.__qaWD = window.__qaWD || { mode: 'dry058', calls: [] };
  if (conn.__qaWD) return;
  const orig = conn.sendMessagePromise.bind(conn);
  conn.sendMessagePromise = (msg) => {
    const q = window.__qaWD;
    if (msg && msg.type === 'ha_washdata/get_maintenance_log') return Promise.resolve(JSON.parse(JSON.stringify(LOGS[q.mode])));
    if (msg && msg.type === 'ha_washdata/get_device_cycles') return Promise.resolve({ cycles: [], total: 0 });
    if (msg && msg.type === 'ha_washdata/add_maintenance_event') { q.calls.push(msg); return Promise.resolve({ success: true, event: { id: 'x' } }); }
    return orig(msg);
  };
  conn.__qaWD = true;
}, LOGS);

// Kachel-Konfiguration auflösen (Zustand, Eintrag) – keine festen IDs.
const resolve = (tpl) => page.evaluate((t) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t) && x.getBoundingClientRect().width > 20);
  if (!b) return null;
  const h = document.querySelector('home-assistant').hass;
  const cfg = b._config || {};
  const c = window._casoraLaundry.resolve(cfg.entity ? h.states[cfg.entity] : null, cfg.variables || {}, h.states, h);
  return { st: c.st, entry: c.entry, dryer: c.dryer, progress: c.progress, remaining: c.remaining, running: c.running, program: c.program };
}, tpl);
// Platteninhalt als Text (alle Pflege-Zeilen, unabhängig von „Mehr“).
const innerText = (tpl, kind) => page.evaluate(({ t, kind }) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t) && x.getBoundingClientRect().width > 20);
  const h = document.querySelector('home-assistant').hass;
  const cfg = b._config || {};
  const c = window._casoraLaundry.resolve(cfg.entity ? h.states[cfg.entity] : null, cfg.variables || {}, h.states, h);
  const d = document.createElement('div');
  d.innerHTML = window._casoraLaundry.inner(kind, c, h.states);
  return [...d.querySelectorAll('.hui-row')].map((r) => r.textContent.replace(/\s+/g, ' ').trim());
}, { t: tpl, kind });
const tileInfo = (tpl) => page.evaluate((t) => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t) && x.getBoundingClientRect().width > 20);
  const h = document.querySelector('home-assistant').hass;
  const cfg = b._config || {};
  const ent = cfg.entity ? h.states[cfg.entity] : null;
  const L = window._casoraLaundry;
  return { tile: L.tile(ent, cfg.variables || {}, h.states), active: L.tileActive(ent, cfg.variables || {}, h.states),
    due: L.due(ent, cfg.variables || {}, h.states) };
}, tpl);

const offen = () => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface)).catch(() => false);
const findTile = async (tpl) => {
  await page.evaluate((t) => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes(t)); b && b.scrollIntoView({ block: 'center' }); }, tpl);
  await page.waitForTimeout(400);
  return (await cards(page, tpl))[0] || null;
};
const openPopup = async (tpl) => {
  let t = await findTile(tpl);
  for (let i = 0; i < 4 && t && !(await offen()); i++) {
    await page.mouse.click(t.x + t.w / 2, t.y + t.h / 2);
    for (let w = 0; w < 24 && !(await offen()); w++) await page.waitForTimeout(250);
    t = (await findTile(tpl)) || t;
  }
  await page.waitForTimeout(2600);
  return offen();
};
const closePopup = async () => { await page.evaluate(() => { try { window.casoraPopup && window.casoraPopup.close(); } catch (e) { /* zu */ } }); await page.keyboard.press('Escape'); await page.waitForTimeout(700); };
const popupInfo = () => page.evaluate(() => {
  const pop = window.__pierce('casora-popup').find((p) => { const r = p.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
  if (!pop) return null;
  const root = pop.shadowRoot || pop;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const leaves = window.__pierce('*', root).filter((e) => e.children.length === 0 && vis(e));
  const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
  const sub = leaves.find((e) => /steht still/.test(txt(e)));
  return {
    rows: window.__pierce('.hui-row', root).filter(vis).map(txt),
    texts: leaves.map(txt).filter(Boolean),
    track: window.__pierce('.hh-pbar-track', root).filter(vis).length,
    subColor: sub ? getComputedStyle(sub).color : null,
    done: window.__pierce('[data-hw-maint]', root).filter(vis).map((e) => { const r = e.getBoundingClientRect(); return { k: e.dataset.hwMaint, x: r.x + r.width / 2, y: r.y + r.height / 2 }; }),
  };
});
const fresh = (st) => page.evaluate((s) => { const L = window._casoraLaundry; delete L.data[s]; L.busy[s] = false; }, st);
const mode = (m) => page.evaluate((x) => { window.__qaWD.mode = x; }, m);

// ── Trockner, WashData 0.5.8, idle ───────────────────────────────────────────
await dashboard(page, desk.url + '/' + (viewOf('casora_trockner').path || '0'), 3);
await closePopup();
await intercept();
const dry = await resolve('casora_trockner');
await need('Trockner mit WashData-Eintrag', dry && dry.entry && dry.dryer, dry);
const idleP = { [dry.st]: { state: 'idle', attributes: { maintenance_due: ['lint_filter', CUSTOM], cycle_anomaly: null } } };
if (dry.progress) idleP[dry.progress] = { state: '0' };
if (dry.remaining) idleP[dry.remaining] = { state: '0' };
await fresh(dry.st);
await mode('dry058');
await fakeStates(page, idleP, { sticky: true });
await page.waitForTimeout(800);
let ti = await tileInfo('casora_trockner');
await check('Trockner idle: Kachel „Bereit · Flusensieb reinigen fällig +1“', ti.tile === 'Bereit · Flusensieb reinigen fällig +1', ti);
await check('Trockner idle: Kachel nicht aktiv', ti.active === false, ti);
await check('Trockner: eigene Aufgabe ohne geladenes Protokoll neutral „Pflege“', ti.due[1] === 'Pflege', ti.due);
await check('Trockner: Popup offen', await openPopup('casora_trockner'));
let pi = await popupInfo();
await check('Trockner idle: keine Fortschrittsleiste', pi && pi.track === 0, pi && pi.track);
await check('Trockner idle: kein Durchgang („Läuft seit“)', pi && !pi.rows.some((r) => /^Läuft seit/.test(r)), pi && pi.rows);
await check('Trockner: fällige Pflege sichtbar (Flusensieb, eigene Aufgabe mit Namen)',
  pi && pi.rows.some((r) => /^Flusensieb reinigen/.test(r)) && pi.rows.some((r) => /^Türdichtung abwischen/.test(r)), pi && pi.rows);
let rows = await innerText('casora_trockner', 'maint');
await check('Trockner: alle Pflege-Zeilen aus status (Flusensieb, Kondensator, eigene Aufgabe)',
  rows.some((r) => /^Flusensieb reinigen.*Fällig · 12 Durchgänge seit dem letzten Mal/.test(r))
  && rows.some((r) => /^Kondensator reinigen.*In 25 Durchgängen fällig/.test(r))
  && rows.some((r) => /^Türdichtung abwischen.*Fällig · 41 Tage seit dem letzten Mal/.test(r))
  && !rows.some((r) => /^Filter & Kondensator/.test(r)), rows);
ti = await tileInfo('casora_trockner');
await check('Trockner: Kachel-Pflege nennt die eigene Aufgabe nach dem Laden beim Namen', ti.due.join('|') === 'Flusensieb reinigen|Türdichtung abwischen', ti.due);
// „Erledigt“ an der eigenen Aufgabe: zweistufig, dann add_maintenance_event mit ihrer Kennung.
const btn = pi && pi.done.find((d) => d.k.split('|')[1] === CUSTOM);
await check('Trockner: „Erledigt“ an der eigenen Aufgabe', !!btn, pi && pi.done);
if (btn) {
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(500);
  await page.mouse.click(btn.x, btn.y);
  await page.waitForTimeout(1200);
  const calls = await page.evaluate(() => window.__qaWD.calls);
  await check('Trockner: Erledigt schickt add_maintenance_event mit event_type = Kennung der Aufgabe',
    calls.some((m) => m.type === 'ha_washdata/add_maintenance_event' && m.event_type === CUSTOM && m.entry_id === dry.entry), calls);
}
await closePopup();

// ── Trockner, WashData 0.5.7 (ohne status): wie bisher nur Filter & Kondensator ──
await fresh(dry.st);
await mode('dry057');
await fakeStates(page, { [dry.st]: { state: 'idle', attributes: { maintenance_due: ['filter_clean'] } } }, { sticky: true });
await page.waitForTimeout(600);
await page.evaluate((s) => { const L = window._casoraLaundry; const h = document.querySelector('home-assistant').hass; L.fetch(L._cfg[s], h, true); }, dry.st);
await page.waitForTimeout(1200);
rows = await innerText('casora_trockner', 'maint');
await check('Trockner 0.5.7: nur „Filter & Kondensator reinigen“ (fällig, 52 Durchgänge), kein Entkalken',
  rows.length === 1 && /^Filter & Kondensator reinigen.*Fällig · 52 Durchgänge seit dem letzten Mal/.test(rows[0]), rows);
ti = await tileInfo('casora_trockner');
await check('Trockner 0.5.7: Kachel „Bereit · Filter reinigen fällig“', ti.tile === 'Bereit · Filter reinigen fällig', ti);

// ── Waschmaschine: Spüler-Antwort (0.5.8), 0.5.7-Antwort, Stillstand ─────────
await dashboard(page, desk.url + '/' + (viewOf('casora_waschmaschine').path || '0'), 3);
await closePopup();
await intercept();
const wash = await resolve('casora_waschmaschine');
await need('Waschmaschine mit WashData-Eintrag', wash && wash.entry, wash);
await fresh(wash.st);
await mode('dish058');
await fakeStates(page, { [wash.st]: { state: 'off', attributes: { maintenance_due: ['salt'] } } }, { sticky: true });
await page.waitForTimeout(800);
ti = await tileInfo('casora_waschmaschine');
await check('Spüler-Pflege: Kachel „Aus · Salz nachfüllen fällig“', ti.tile === 'Aus · Salz nachfüllen fällig', ti);
await check('Spüler-Pflege: Popup offen', await openPopup('casora_waschmaschine'));
rows = await innerText('casora_waschmaschine', 'maint');
await check('Spüler-Pflege: „Salz nachfüllen“ fällig, „Klarspüler nachfüllen“ und Filter mit Rest',
  rows.some((r) => /^Salz nachfüllen.*Fällig · 31 Durchgänge/.test(r)) && rows.some((r) => /^Klarspüler nachfüllen.*In 28 Durchgängen fällig/.test(r))
  && rows.some((r) => /^Filter reinigen.*In 38 Durchgängen fällig/.test(r)), rows);
await closePopup();

await fresh(wash.st);
await mode('wash057');
await fakeStates(page, { [wash.st]: { state: 'off', attributes: { maintenance_due: ['descale'] } } }, { sticky: true });
await page.waitForTimeout(600);
await check('Waschmaschine 0.5.7: Popup offen', await openPopup('casora_waschmaschine'));
rows = await innerText('casora_waschmaschine', 'maint');
await check('Waschmaschine 0.5.7: Zeilen wie bisher (Entkalken fällig, Filter, Trommelreinigung)',
  rows.length === 3 && /^Entkalken.*Fällig · 31 Durchgänge seit dem letzten Mal/.test(rows[0])
  && /^Filter reinigen.*In 40 Durchgängen fällig/.test(rows[1]) && /^Trommelreinigung.*In 80 Durchgängen fällig/.test(rows[2]), rows);
pi = await popupInfo();
await check('Waschmaschine 0.5.7: „Erledigt“ für Entkalken', pi && pi.done.some((d) => d.k.split('|')[1] === 'descale'), pi && pi.done);
await closePopup();

// Stillstand: paused + cycle_anomaly stalled
const stP = { [wash.st]: { state: 'paused', attributes: { cycle_anomaly: 'stalled', maintenance_due: null } } };
if (wash.progress) stP[wash.progress] = { state: '61' };
if (wash.remaining) stP[wash.remaining] = { state: '23' };
if (wash.running) stP[wash.running] = { state: 'on' };
await fakeStates(page, stP, { sticky: true });
await page.waitForTimeout(800);
ti = await tileInfo('casora_waschmaschine');
await check('Stillstand: Kachel „Angehalten“, aktiv', ti.tile === 'Angehalten' && ti.active === true, ti);
await check('Stillstand: Popup offen', await openPopup('casora_waschmaschine'));
pi = await popupInfo();
const warm = (rgb) => { const m = String(rgb).match(/(\d+)\D+(\d+)\D+(\d+)/); return !!m && +m[1] > +m[3] + 60; };
await check('Stillstand: Kopf „Angehalten · steht still, evtl. Unwucht“ in Warnfarbe',
  pi && pi.texts.some((t) => /Angehalten/.test(t)) && pi.texts.some((t) => /steht still, evtl\. Unwucht/.test(t)) && warm(pi.subColor),
  pi && { sub: pi.texts.filter((t) => /Angehalten|steht still/.test(t)), color: pi.subColor });
await check('Stillstand: nicht mehr „Pausiert“', pi && !pi.texts.some((t) => /Pausiert/.test(t)), pi && pi.texts.filter((t) => /Pausiert/.test(t)));
await closePopup();
// Normale Pause (ohne Stillstand) bleibt „Pausiert“.
await fakeStates(page, { [wash.st]: { state: 'paused', attributes: { cycle_anomaly: null, maintenance_due: null } } }, { sticky: true });
await page.waitForTimeout(600);
ti = await tileInfo('casora_waschmaschine');
await check('Pause ohne Stillstand: Kachel „Pausiert“', ti.tile === 'Pausiert', ti);

await finish();
