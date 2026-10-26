// @zustand: arbeit
// @parallel: ui
// @deckt: dev/casora_mock/dishwasher.py
// Issue #77: a dishwasher from Home Connect in HA core with German ids (sensor.…_betriebszustand,
// number.…_start_in_relativ, switch.…_hygiene, switch.…_intensivzone) showed only the program list and „Jetzt
// starten“ without a start time; Hygiene+ and Intensivzone were missing, the program list was long, „Jetzt starten“
// did not line up with the program, and the device data (manufacturer, model, integration) was only reachable by
// holding the tile.
// Expected with the test dishwasher „Testspüler“ (dev/casora_mock/dishwasher.py; service calls are caught in the
// browser, the answers pushed with fakeStates – nothing goes to HA), desktop 1440 dark and phone 393 light:
//   1. Program as one row that opens the list (8 programs); choosing one calls select_option and closes the list.
//   2. „Start“ on the right, its row level with the program row (desktop); headings „Programm“/„Start“ level.
//   3. Options Hygiene+ and Intensivzone (state shown) with the others, under the program, rows in line.
//   4. Start time as a clock time: 22:30 → number.set_value with the seconds until then (step 60), the start row
//      then says „Um 22:30 starten“ (or „Morgen um …“), the note „Startet … um 22:30 Uhr“; confirming starts with
//      home_connect.start_selected_program, the delay counted from now.
//   5. „Mehr“ has „Weitere Einstellungen“, which opens the device page (manufacturer Siemens, integration).
//   6. Remote start off on the appliance: no start, „Fernstart am Gerät nicht erlaubt“.
// DW77_BILDER=<folder>: pictures of tile and popup (desktop dark, phone light).
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const OUT = process.env.DW77_BILDER;
const ST = 'sensor.testspuler_betriebszustand';
const SEL = 'select.testspuler_ausgewahltes_programm';
const NUM = 'number.testspuler_start_in_relativ';
const REMOTE = 'binary_sensor.testspuler_fernstart';
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const phone = all.find((d) => d.url === desk.url + '-mobile');

const pic = async (page, name, clip) => { if (OUT) await page.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) }); };
const wait = (page, ms) => page.waitForTimeout(ms);

// Every service call stays in the browser: recorded in window.__dw77 (hass.callService is copied into every
// following hass object, so patching it once is enough).
const catchCalls = (page) => page.evaluate(() => {
  const ha = document.querySelector('home-assistant');
  window.__dw77 = [];
  ha.hass.callService = function (domain, service, data, target) {
    window.__dw77.push({ domain, service, data: data || {}, target: target || null });
    return Promise.resolve({ context: null });
  };
});
const calls = (page) => page.evaluate(() => window.__dw77.slice());

// Mounts a casora_geschirrspueler tile on the test dishwasher above the first visible tile.
const mount = (page) => page.evaluate(async (st) => {
  const ha = document.querySelector('home-assistant');
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 100 && x.height > 50 && x.top > 40; });
  if (!old) return { missing: 'a tile to mount next to' };
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_geschirrspueler', entity: st, name: 'Geschirrspüler', variables: {} });
  el.hass = ha.hass;
  el.style.cssText = 'display:block;width:' + Math.round(old.getBoundingClientRect().width) + 'px';
  old.parentNode.insertBefore(el, old);
  window.__dw77el = el;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  await new Promise((res) => setTimeout(res, 1200));
  const card = el.shadowRoot && el.shadowRoot.querySelector('ha-card');
  const b = el.getBoundingClientRect();
  return { text: card ? card.innerText.replace(/\s+/g, ' ').trim() : '', box: { x: b.x, y: b.y, width: b.width, height: b.height } };
}, ST);

const openPopup = (page) => page.evaluate(async () => {
  const el = window.__dw77el;
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  const S = () => window.casoraPopup && window.casoraPopup.surface;
  for (let i = 0; i < 40 && !(S() && window.__pierce('.hui-row', S()).length > 3); i++) await new Promise((res) => setTimeout(res, 200));
  await new Promise((res) => setTimeout(res, 1200));
  return !!S();
});

// What the popup shows: rows (text, box), headings, the program choice, the time input.
const look = (page) => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rows = window.__pierce('.hui-row', s).filter(vis).map((e) => {
    const sw = e.querySelector('[role=switch]');
    return { t: txt(e), sw: sw ? sw.getAttribute('aria-checked') : null, ...box(e) };
  });
  // Blueprint v2: the start is the action pill on top (UI.actions), not a row.
  const acts = window.__pierce('.hui-act-p', s).filter(vis).map((e) => ({ t: txt(e), pri: e.classList.contains('pri'), dis: e.classList.contains('dis'), ...box(e) }));
  const pick = window.__pierce('.dw-pick', s)[0];
  const heads = window.__pierce('div', s).filter((e) => vis(e) && e.children.length === 0 && /^(Programm|Start|Optionen|Startzeit)$/.test(txt(e))
    && !e.closest('.hui-row')).map((e) => ({ t: txt(e), ...box(e) }));
  const inp = window.__pierce('input.dw-time-in', s)[0];
  return { rows, acts, heads, pick: pick ? { open: pick.classList.contains('open'), list: window.__pierce('.dw-pbd .hui-row', pick).filter(vis).length } : null,
    input: inp ? { value: inp.value, ...box(inp) } : null, text: txt(s) };
});

// Taps the first visible element matching sel whose text matches re (scrolled into view first).
const tap = async (page, mobile, sel, re) => {
  const b = await page.evaluate(async ([sel, src]) => {
    const s = window.casoraPopup && window.casoraPopup.surface;
    const re = new RegExp(src);
    const el = window.__pierce(sel, s).find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && re.test(e.textContent.replace(/\s+/g, ' ').trim()); });
    if (!el) return null;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    // casora-core ignores taps within 400 ms of a scroll.
    await new Promise((res) => setTimeout(res, 650));
    const r = el.getBoundingClientRect();
    return { x: r.x + Math.min(r.width / 2, 60), y: r.y + r.height / 2 };
  }, [sel, re.source]);
  if (!b) return false;
  if (mobile) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  await wait(page, 500);
  return true;
};

// Seconds from now until the next hh:mm, on the number's 60 s step (like _casoraDish.delayFor).
const expectSecs = (page, hm) => page.evaluate((hm) => {
  const [h, m] = hm.split(':').map(Number), now = Date.now(), d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= now + 30000) d.setDate(d.getDate() + 1);
  return Math.round((d.getTime() - now) / 1000 / 60) * 60;
}, hm);

const VIEWS = [
  ['Desktop', { width: 1440, height: 900, dark: true }, desk.url, 'desktop-dunkel'],
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, dark: false }, phone && phone.url, 'handy-hell'],
];

for (const [tag, opts, url, name] of VIEWS) {
  if (!url) { await check(tag + ': Handy-Dashboard vorhanden', tag === 'Desktop', all.map((d) => d.url)); continue; }
  const mobile = !!opts.mobile;
  const { page } = await open(opts);
  usePage(page);
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + String(e && e.message || e)));
  await dashboard(page, url, 3);
  const have = await page.evaluate((ids) => ids.map((id) => !!document.querySelector('home-assistant').hass.states[id]), [ST, SEL, NUM]);
  await need(tag + ': Testspüler im Testhaus', have.every(Boolean), have);
  // A sticky patch replaces the previous one: keep them all in one.
  const patch = {};
  const fake = (p) => fakeStates(page, Object.assign(patch, p), { sticky: true });
  // Known start state, whatever ran before: ready, Eco 50, no delay, remote start on, door closed.
  await fake({ [ST]: { state: 'ready' }, [SEL]: { state: 'dishcare_dishwasher_program_eco_50' }, [NUM]: { state: '0' },
    [REMOTE]: { state: 'on' }, 'sensor.testspuler_tur': { state: 'closed' }, 'switch.testspuler_intensivzone': { state: 'on' },
    'switch.testspuler_hygiene': { state: 'off' } });
  await catchCalls(page);

  const tile = await mount(page);
  await need(tag + ': Kachel', tile && !tile.missing, tile);
  await check(tag + ': Kachel „Bereit“', /Bereit/.test(tile.text), tile.text);
  if (OUT) await pic(page, name + '-kachel', { x: Math.max(0, tile.box.x - 16), y: Math.max(0, tile.box.y - 16), width: tile.box.width + 32, height: tile.box.height + 32 });

  await need(tag + ': Popup offen', await openPopup(page));
  let L = await look(page);
  await pic(page, name + '-popup');
  // 1. Program choice.
  await check(tag + ': Programm als eine Zeile mit Auswahl', !!(L.pick && !L.pick.open && L.pick.list === 0), L.pick);
  const progRow = L.rows.find((r) => /^Eco 50°/.test(r.t));
  await check(tag + ': gewähltes Programm „Eco 50°“ steht in der Zeile', !!progRow, L.rows.map((r) => r.t));
  // 2. Blueprint v2 (rule 4): „Jetzt starten · Eco 50°“ is the main action on top, filled in the device colour.
  const startAct = L.acts.find((a) => /^Jetzt starten/.test(a.t));
  await check(tag + ': Hauptaktion „Jetzt starten · Eco 50°“', !!startAct && startAct.pri && /Eco 50°/.test(startAct.t), L.acts);
  await check(tag + ': Hauptaktion über dem Programm', !!startAct && !!progRow && startAct.y < progRow.y, { act: startAct, prog: progRow });
  await check(tag + ': Überschrift „Startzeit“', L.heads.some((h) => h.t === 'Startzeit'), L.heads);
  // 3. Options.
  const hyg = L.rows.find((r) => /^Hygiene\+/.test(r.t)), iz = L.rows.find((r) => /^Intensivzone/.test(r.t));
  // Real switches instead of the words An/Aus (blueprint v2, rule 6).
  await check(tag + ': Option Hygiene+ (Schalter aus)', !!hyg && hyg.sw === 'false', L.rows.map((r) => [r.t, r.sw]));
  await check(tag + ': Option Intensivzone (Schalter an)', !!iz && iz.sw === 'true', L.rows.map((r) => [r.t, r.sw]));
  const optRows = L.rows.filter((r) => /^(Extra Trocken|Halbe Ladung|Hygiene\+|Intensivzone)/.test(r.t));
  await check(tag + ': Optionen in einer Flucht mit dem Programm', optRows.length === 4 && progRow
    && optRows.every((r) => Math.abs(r.x - progRow.x) <= 1 && Math.abs(r.w - progRow.w) <= 1), optRows);
  await check(tag + ': Uhrzeit-Feld für die Startzeit', !!L.input, L.input);

  // 1b. Open the list, choose a program.
  await tap(page, mobile, '.dw-phd .hui-row', /Eco 50°/);
  L = await look(page);
  await check(tag + ': Liste offen mit 8 Programmen', !!(L.pick && L.pick.open && L.pick.list === 8), L.pick);
  await pic(page, name + '-programmwahl');
  await tap(page, mobile, '.dw-pbd .hui-row', /^Intensiv 70°/);
  let C = await calls(page);
  await check(tag + ': Programm gewählt über select_option', C.some((c) => c.domain === 'select' && c.service === 'select_option'
    && c.data.option === 'dishcare_dishwasher_program_intensiv_70' && JSON.stringify(c.target).includes(SEL)), C);
  await fake({ [SEL]: { state: 'dishcare_dishwasher_program_intensiv_70' } });
  await wait(page, 900);
  L = await look(page);
  await check(tag + ': nach der Wahl zu, Zeile zeigt „Intensiv 70°“', !!(L.pick && !L.pick.open) && L.rows.some((r) => /^Intensiv 70°/.test(r.t)), L.pick);

  // 4. Start time as a clock time.
  await page.evaluate(() => {
    const s = window.casoraPopup.surface, inp = window.__pierce('input.dw-time-in', s)[0];
    if (!inp) return;
    inp.scrollIntoView({ block: 'center', behavior: 'instant' });
    inp.value = '22:30';
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await wait(page, 1300);
  C = await calls(page);
  const want = await expectSecs(page, '22:30');
  const set = C.filter((c) => c.domain === 'number' && c.service === 'set_value').pop();
  await check(tag + ': 22:30 → Sekunden bis dahin', !!set && JSON.stringify(set.target).includes(NUM) && Math.abs(set.data.value - want) <= 60 && set.data.value % 60 === 0,
    { set, want });
  if (set) await fake({ [NUM]: { state: String(set.data.value) } });
  await wait(page, 900);
  L = await look(page);
  const sr = L.acts.find((a) => /starten/.test(a.t) && /22:30/.test(a.t));
  await check(tag + ': Hauptaktion „Um 22:30 starten“', !!sr && /^(Morgen u|U)m 22:30 starten/.test(sr.t), L.acts.map((a) => a.t));
  await check(tag + ': Hinweis „Startet … um 22:30 Uhr“', L.rows.some((r) => /^Uhrzeit\s*Startet (morgen )?um 22:30 Uhr/.test(r.t)), L.rows.map((r) => r.t));
  await check(tag + ': Feld zeigt 22:30', !!L.input && L.input.value === '22:30', L.input);
  await pic(page, name + '-startzeit');
  // Confirm the start (the pill asks „Starten?“): the action with the delay counted from now.
  await tap(page, mobile, '.hui-act-p', /^(Morgen u|U)m 22:30 starten/);
  await wait(page, 600);
  await page.evaluate(() => { const a = document.querySelector('.casora-askfirst'); const y = a && a.shadowRoot && a.shadowRoot.querySelector('.yes'); if (y) y.click(); });
  await wait(page, 800);
  C = await calls(page);
  const go = C.find((c) => c.domain === 'home_connect' && c.service === 'start_selected_program');
  const want2 = await expectSecs(page, '22:30');
  await check(tag + ': Start über home_connect.start_selected_program mit Verzögerung', !!go && !!go.data.device_id
    && Math.abs(go.data.b_s_h_common_option_start_in_relative - want2) <= 90, { go, want2 });

  // 6. Remote start off.
  await fake({ [REMOTE]: { state: 'off' }, [NUM]: { state: '0' } });
  await wait(page, 900);
  L = await look(page);
  await check(tag + ': Fernstart aus → kein Start', L.acts.some((a) => a.dis && /^Jetzt starten\s*· Fernstart am Gerät nicht erlaubt/.test(a.t)), L.acts);
  await fake({ [REMOTE]: { state: 'on' } });
  await wait(page, 600);

  // 5. „Weitere Einstellungen“ as the last section (blueprint v2, no longer inside „Mehr“) → device page.
  L = await look(page);
  await check(tag + ': „Weitere Einstellungen“ als letzter Abschnitt', L.rows.some((r) => /^Weitere Einstellungen/.test(r.t)), L.rows.map((r) => r.t));
  await page.evaluate(() => { const s = window.casoraPopup.surface; const r = window.__pierce('.hui-row', s).find((e) => /^Weitere Einstellungen/.test(e.textContent.trim()));
    if (r) r.scrollIntoView({ block: 'center', behavior: 'instant' }); });
  await wait(page, 300);
  await pic(page, name + '-mehr');
  await tap(page, mobile, '.hui-row', /^Weitere Einstellungen/);
  await wait(page, 1500);
  L = await look(page);
  await check(tag + ': Geräteseite mit Hersteller und Integration', !!L && L.rows.some((r) => /^Hersteller\s*Siemens/.test(r.t))
    && L.rows.some((r) => /^Integration/.test(r.t)), L && L.rows.map((r) => r.t));
  await pic(page, name + '-geraet');

  await check(tag + ': keine Fehler in der Konsole', errs.length === 0, errs);
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); if (window.__dw77el) window.__dw77el.remove(); });
}
await finish();
