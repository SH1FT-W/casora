// @zustand: arbeit
// @parallel: ui
// @deckt: dev/casora_mock/oven.py custom_components/casora/scripts/local/02-devices.js#_casoraOven,D.popup,D.progPick,_casoraApplianceStage
// Owner 04.11.2026 (screenshot of a Home Connect oven, Home Connect Local): „Backofen-Popup – wurde das gar nicht mit
// überarbeitet?“ – every programme its own card, every device value its own card, no stage. Casora knew no oven: on a
// dishwasher tile it fell into the dishwasher's popup (raw programme ids, a start moon although the oven does not allow
// remote start, door/lock/connection gone), on the appliance tile only a lone stage.
// Expected with the test ovens (dev/casora_mock/oven.py: „Testofen“ as Home Connect Local, „Testbackofen“ as Home
// Connect in HA core), desktop 1440 light/dark and phone 393:
//   1. One stage (S4 dial); off: „Aus“ with the chosen programme; running: the cavity temperature with the target.
//   2. Programmes as ONE row „Programm“ (16 resp. 10 programmes behind it), never one row per programme, no raw id.
//   3. The device values (door, child lock, remote start, connection) in ONE plate under „Gerät“.
//   4. The oven's power in the head (main switch); no start moon while the oven does not allow remote start.
//   5. Phone 393: nothing wider than the window.
import { open, casoraDashboards, dashboard, check, need, finish, usePage, fakeStates } from './lib.mjs';

const WS = 'sensor.testofen_betriebszustand';
const HC = 'sensor.testbackofen_betriebszustand';
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const phone = all.find((d) => d.url === desk.url + '-mobile') || desk;

// Mounts a tile (template) on the oven above the first visible tile and opens its popup.
const openOven = (page, st, tpl) => page.evaluate(async ([st, tpl]) => {
  if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close();
  await new Promise((res) => setTimeout(res, 700));
  const ha = document.querySelector('home-assistant');
  const old = window.__pierce('button-card').find((b) => { const x = b.getBoundingClientRect(); return x.width > 100 && x.height > 50 && x.top > 40; });
  if (!old) return false;
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: tpl, entity: st, name: 'Backofen', variables: {} });
  el.hass = ha.hass;
  el.style.cssText = 'display:block;width:' + Math.round(old.getBoundingClientRect().width) + 'px';
  old.parentNode.insertBefore(el, old);
  await new Promise((res) => setTimeout(res, 1200));
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(Object.assign({}, act.casora_popup, { src: el })); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  const S = () => window.casoraPopup && window.casoraPopup.surface;
  for (let i = 0; i < 40 && !(S() && window.__pierce('[data-casora-stage]', S()).length); i++) await new Promise((res) => setTimeout(res, 200));
  await new Promise((res) => setTimeout(res, 1500));
  return !!S();
}, [st, tpl]);

const look = (page) => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const stages = window.__pierce('[data-casora-stage]', s).filter(vis).map((e) => ({ code: e.getAttribute('data-casora-stage'), t: txt(e) }));
  const rows = window.__pierce('.hui-row', s).filter(vis);
  const rowT = rows.map(txt);
  // Plate of each device row (rows of one group share one .hui-plate).
  const plateOf = (re) => { const r = rows.find((e) => re.test(txt(e))); return r ? r.closest('.hui-plate') : null; };
  const dev = [/^Tür/, /^Kindersicherung/, /^Fernstart/].map(plateOf);
  const pop = window.casoraPopup.element || document.querySelector('casora-popup');
  const hs = pop && pop.shadowRoot && pop.shadowRoot.querySelector('.header-switch');
  const vw = window.innerWidth;
  const wide = window.__pierce('*', s).filter((e) => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; })
    .slice(0, 3).map((e) => (e.className && String(e.className).slice(0, 40)) || e.tagName);
  return { stages, rowT, progRows: rowT.filter((t) => /Heißluft|Unterhitze|Warmhalten|Pizzastufe|Auftauen/.test(t)).length,
    devOne: dev.every(Boolean) && dev.every((p) => p === dev[0]), devFound: dev.map(Boolean),
    heads: window.__pierce('div', s).filter((e) => vis(e) && e.children.length === 0 && /^(Programm|Gerät)$/.test(txt(e))).map(txt),
    goMoon: window.__pierce('.hui-stage .hui-moon.go', s).filter(vis).length,
    // Shadow roots: the texts of the stage and the rows (the surface's textContent does not reach into them).
    headSwitch: !!(hs && !hs.hidden), raw: /cooking[ _]oven|heatingmode|heating mode/i.test(stages.map((x) => x.t).concat(rowT).join(' | ')),
    wide, text: stages.map((x) => x.t).concat(rowT).join(' | ').slice(0, 400) };
});

const VIEWS = [
  ['Desktop hell', { width: 1440, height: 900, dark: false }, desk.url],
  ['Desktop dunkel', { width: 1440, height: 900, dark: true }, desk.url],
  ['Handy', { width: 393, height: 852, mobile: true, safari: true, dark: false }, phone.url],
];
for (const [tag, opts, url] of VIEWS) {
  const { page } = await open(opts);
  usePage(page);
  await dashboard(page, url, 3);
  const have = await page.evaluate((ids) => ids.map((id) => !!document.querySelector('home-assistant').hass.states[id]), [WS, HC]);
  await need(tag + ': Testöfen im Testhaus', have.every(Boolean), have);

  // Home Connect Local oven on a dishwasher tile, off, remote start not allowed.
  await need(tag + ': Popup Testofen offen', await openOven(page, WS, 'casora_geschirrspueler'));
  let L = await look(page);
  await check(tag + ': genau eine Bühne (S4)', L.stages.length === 1 && L.stages[0].code === 'S4', L.stages);
  await check(tag + ': aus → Bühne „Aus“ mit dem gewählten Programm', /Aus/.test(L.stages[0] && L.stages[0].t) && /Heißluft/.test(L.stages[0].t), L.stages);
  await check(tag + ': Programme als eine Zeile „Programm“ (nicht je Programm eine Karte)', L.progRows === 1 && L.heads.includes('Programm')
    && L.rowT.some((t) => /16 Programme/.test(t)), { progRows: L.progRows, rows: L.rowT });
  await check(tag + ': keine rohe Programm-Kennung', !L.raw, L.text);
  await check(tag + ': Gerätewerte in einer Platte „Gerät“', L.devOne && L.heads.includes('Gerät'), { found: L.devFound, heads: L.heads });
  await check(tag + ': Einschalter im Kopf', L.headSwitch);
  await check(tag + ': kein Start-Mond ohne Fernstart', L.goMoon === 0);
  if (opts.mobile) await check(tag + ': nichts breiter als 393', !L.wide.length, L.wide);

  // Running: cavity temperature against the target, progress.
  await fakeStates(page, { [WS]: { state: 'run' }, 'select.testofen_betriebszustand': { state: 'on' }, 'sensor.testofen_aktuelle_temperatur': { state: '152' },
    'sensor.testofen_programmfortschritt': { state: '40' }, 'sensor.testofen_aktives_programm': { state: 'cooking_oven_program_heatingmode_hotair' } }, { sticky: true });
  L = await look(page);
  await check(tag + ': läuft → Garraum 152 °C, „Heizt auf 180 °C“, 40 %', L.stages.length === 1 && /152/.test(L.stages[0].t) && /Heizt auf 180/.test(L.stages[0].t)
    && /40 %/.test(L.stages[0].t), L.stages);

  // Home Connect in HA core on the appliance tile, ready, remote start allowed.
  await need(tag + ': Popup Testbackofen offen', await openOven(page, HC, 'casora_appliance'));
  L = await look(page);
  await check(tag + ' (HA-Kern, Gerät mit Ablauf): eine Bühne, eine Programmzeile, Gerät als Platte', L.stages.length === 1 && L.rowT.some((t) => /10 Programme/.test(t))
    && L.progRows === 1 && L.devOne, { stages: L.stages, rows: L.rowT, found: L.devFound });
  await check(tag + ' (HA-Kern): Start-Mond, weil Fernstart erlaubt', L.goMoon === 1);
  if (opts.mobile) await check(tag + ' (HA-Kern): nichts breiter als 393', !L.wide.length, L.wide);
  await page.context().browser().close().catch(() => {});
}
await finish();
