// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Issue 119 (26.11.9): „Tap on badges“ (Studio › Controls › Tiles, badge_tap). Default („Open popup“, as before): a
// tap on a lamp chip opens its popup, holding switches it. „Switch the light“ (badge_tap: toggle): a tap switches,
// holding opens the popup. Second round (owner, „Variante 1“): the collective badge „Beleuchtung“ with lamps of its own
// opens their sub-row on a tap in that mode too (as by default; before, the single lamps were out of reach), a lamp
// chip there switches only its lamp; a badge without a row (one lamp) switches on a tap. Desktop 1440 (room page,
// Home) and phone 393 (Home light badge: by default its popup with the lamps). The setting and the badge's lamps go
// into the open dashboard's config in the browser only (nothing saved); light calls are caught and not sent, so no
// lamp switches (the sub-row helper input_select.casora_expanded_row goes through).
import { open, dashboard, casoraDashboards, fakeStates, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === (process.env.CASORA_QA_DASH || 'qa-arbeit')) || all.find((d) => !d.mobile);
const phone = all.find((d) => d.mobile && desk && d.url === desk.url + '-mobile') || all.find((d) => d.mobile);
await need('Casora-Dashboard mit Handy-Gegenstück', desk && phone, all.map((d) => d.url));
const room = desk.config.views.find((v, i) => i > 0 && ((v.cards || [])[0] || {}).template === 'casora_room'
  && (v.cards[0].variables || {}).light_entity_1 && v.path);
await need('Raum mit Licht-Badge', room, desk.config.views.map((v) => v.path));

// Catch call_service messages (answered, never sent) and put badge_tap into the open dashboard's config.
const prep = (page) => page.evaluate(() => {
  const ha = document.querySelector('home-assistant');
  const conn = ha.hass.connection;
  window.__calls = [];
  if (!conn.__qaPatched) {
    const orig = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => {
      if (m && (m.type === 'call_service' || m.type === 'execute_script') && window.__qaCatch) {
        window.__calls.push(m);
        // The sub-row's helper is no lamp: let it through, so a tap can open the row.
        if (m.domain !== 'input_select') return Promise.resolve({ context: {} });
      }
      return orig(m);
    };
    conn.__qaPatched = true;
  }
  window.__qaCatch = true;
});
// lights: { path, vars } puts made-up lamps on the light badge of that view's casora_room card (desktop) or of the
// phone's Home badge row (casora_mobile_filter_badges, path null).
const NO_LIGHTS = { light_group_entity: null, light_rooms_auto: false, ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['light_entity_' + (i + 1), null])) };
const setMode = (page, mode, lights = null) => page.evaluate(({ mode, lights }) => {
  // On the panel, not on hui-root: ha-panel-lovelace hands its own lovelace down again on every render.
  const root = window.__pierce('ha-panel-lovelace')[0];
  const ll = root && root.lovelace;
  if (!ll || !ll.config) return false;
  const cfg = JSON.parse(JSON.stringify(ll.config));
  const put = (o, d, view) => {
    if (!o || typeof o !== 'object' || d > 14) return;
    if (Array.isArray(o)) { o.forEach((x) => put(x, d + 1, view)); return; }
    const t = [].concat(o.template || []);
    if (t.includes('casora_room') || t.includes('casora_mobile_bg')) {
      o.variables = o.variables || {};
      if (mode) o.variables.badge_tap = mode; else delete o.variables.badge_tap;
    }
    if (lights && ((lights.path && view && (view.path || '0') === lights.path && t.includes('casora_room'))
      || (!lights.path && t.includes('casora_mobile_filter_badges')))) o.variables = { ...(o.variables || {}), ...lights.vars };
    Object.keys(o).forEach((k) => { if (k !== 'variables') put(o[k], d + 1, view); });
  };
  cfg.views.forEach((v) => put(v, 0, v));
  // The phone's Home badges also read the desktop overview room (casoraPhoneRoom.home): the made-up lamps there too.
  if (lights && !lights.path && window.casoraPhoneRoom && window.casoraPhoneRoom.home) {
    const P = window.casoraPhoneRoom;
    if (!P.__qaHome) P.__qaHome = P.home;
    P.home = function () { const h = P.__qaHome.apply(this, arguments); return h ? { ...h, ...lights.vars } : h; };
  }
  root.lovelace = Object.assign(Object.create(Object.getPrototypeOf(ll)), ll, { config: cfg });
  return true;
}, { mode, lights });
const calls = (page) => page.evaluate(() => (window.__calls || []).map((m) => (m.domain || '') + '.' + (m.service || '')));
const callData = (page) => page.evaluate(() => (window.__calls || []).filter((m) => m.domain !== 'input_select').map((m) => m.service_data || {}));
const lightCalls = (cs) => cs.filter((c) => /^(light|casora)\./.test(c));
const rowState = (page) => page.evaluate(() => document.querySelector('home-assistant').hass.states['input_select.casora_expanded_row']?.state);
const setRow = async (page, option) => {
  await page.evaluate((option) => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
    { entity_id: 'input_select.casora_expanded_row', option }).catch(() => {}), option);
  await page.waitForTimeout(1500);
};
const LAMPS = {
  'light.qa_tap_lamp_1': { state: 'off', attributes: { friendly_name: 'QA Lampe 1' } },
  'light.qa_tap_lamp_2': { state: 'off', attributes: { friendly_name: 'QA Lampe 2' } },
};
const TWO = { ...NO_LIGHTS, light_entity_1: 'light.qa_tap_lamp_1', light_entity_2: 'light.qa_tap_lamp_2' };
const ONE = { ...NO_LIGHTS, light_entity_1: 'light.qa_tap_lamp_1' };
const popupOpen = (page) => page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface));
const closePopup = async (page) => { await page.evaluate(() => window.casoraPopup && window.casoraPopup.close && window.casoraPopup.close()); await page.waitForTimeout(900); };
const at = (page, pred) => page.evaluate((pred) => {
  const ok = new Function('b', 'return ' + pred);
  const b = window.__pierce('button-card').find((x) => { const r = x.getBoundingClientRect(); return r.width > 10 && r.height > 10 && ok(x); });
  if (!b) return null;
  b.scrollIntoView({ block: 'center', inline: 'center' });
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: (b._config || {}).entity || '' };
}, pred);
const tap = async (page, p) => { await page.mouse.click(p.x, p.y); await page.waitForTimeout(1800); };
const hold = async (page, p) => { await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForTimeout(1100); await page.mouse.up(); await page.waitForTimeout(1800); };
const CHIP = "[].concat((b._config || {}).template || []).includes('casora_badge_light') && /^light\\.qa_tap_lamp_/.test((b._config || {}).entity || '')";
const GROUP = "[].concat((b._config || {}).template || []).includes('casora_badge_light_group')";

// ── Desktop: room page, lamp chip and collective badge ─────────────────────────
{
  const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, desk.url + '/' + room.path);
  // The room's light badge as a group of two made-up lamps (a fresh test house may hold other lights there).
  const grpId = room.cards[0].variables.light_entity_1;
  await fakeStates(page, {
    'light.qa_tap_lamp_1': { state: 'off', attributes: { friendly_name: 'QA Lampe 1' } },
    'light.qa_tap_lamp_2': { state: 'off', attributes: { friendly_name: 'QA Lampe 2' } },
    [grpId]: { state: 'off', attributes: { entity_id: ['light.qa_tap_lamp_1', 'light.qa_tap_lamp_2'], friendly_name: 'QA Raum' } },
  }, { sticky: true });
  await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
    { entity_id: 'input_select.casora_expanded_row', option: 'lights' }).catch(() => {}));
  await page.waitForTimeout(2500);
  await prep(page);
  for (const mode of [null, 'toggle']) {
    const label = mode ? 'Schalten' : 'Standard';
    await need(label + ': Einstellung im Dashboard gesetzt', await setMode(page, mode));
    await page.waitForTimeout(2500);
    await prep(page);
    const chip = await at(page, CHIP);
    await need(label + ': Lampen-Chip sichtbar', chip);
    await tap(page, chip);
    const tapCalls = await calls(page), tapPopup = await popupOpen(page);
    if (tapPopup) await closePopup(page);
    await prep(page);
    await hold(page, await at(page, CHIP));
    const holdCalls = await calls(page), holdPopup = await popupOpen(page);
    if (holdPopup) await closePopup(page);
    if (!mode) {
      await check('Standard: Tipp auf den Lampen-Chip öffnet das Popup und schaltet nicht', tapPopup && !tapCalls.some((c) => /light/.test(c)), { tapCalls });
      await check('Standard: Halten schaltet die Lampe', holdCalls.includes('casora.light_smart_toggle') && !holdPopup, { holdCalls, holdPopup });
    } else {
      await check('Schalten: Tipp schaltet die Lampe, kein Popup', tapCalls.includes('casora.light_smart_toggle') && !tapPopup, { tapCalls, tapPopup });
      await check('Schalten: Halten öffnet das Popup', holdPopup && !holdCalls.some((c) => /light/.test(c)), { holdCalls });
      // The room's badge has a row of two lamps (its group's members): a tap opens that row.
      await setRow(page, 'none');
      await prep(page);
      const grp = await at(page, GROUP);
      await need('Schalten: Badge „Beleuchtung“ sichtbar', grp);
      await tap(page, grp);
      const gCalls = await calls(page), gRow = await rowState(page), gPopup = await popupOpen(page);
      if (gPopup) await closePopup(page);
      await check('Schalten, Raum mit zwei Lampen: Tipp auf „Beleuchtung“ klappt die Lampen auf, schaltet nicht',
        gRow === 'lights' && !lightCalls(gCalls).length && !gPopup, { gCalls, gRow, gPopup });
    }
  }
  // A room with one lamp: no row to open, so the tap switches that lamp (the room's, never the whole house).
  await need('Schalten, eine Lampe: Einstellung im Dashboard gesetzt', await setMode(page, 'toggle', { path: room.path, vars: ONE }));
  await page.waitForTimeout(2500);
  await setRow(page, 'none');
  await prep(page);
  const one = await at(page, GROUP);
  await need('Schalten, eine Lampe: Badge „Beleuchtung“ sichtbar', one);
  await tap(page, one);
  {
    const oCalls = await calls(page), ids = (await callData(page)).map((d) => [].concat(d.entity_id || d.light_entity || [])).flat();
    await check('Schalten, eine Lampe: Tipp auf „Beleuchtung“ schaltet sie', lightCalls(oCalls).length > 0
      && !oCalls.includes('input_select.select_option'), { oCalls });
    await check('Schalten, eine Lampe: nur diese Lampe, nicht das ganze Haus', ids.length > 0
      && ids.every((x) => x === 'light.qa_tap_lamp_1'), { ids });
  }
  await page.evaluate(() => { window.__qaCatch = false; });
  await setRow(page, 'none');
  await page.context().close();
}

// ── Desktop: Home, collective badge with two lamps of its own ─────────────────────
{
  const { page } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
  usePage(page);
  const home = desk.config.views[0];
  await dashboard(page, desk.url + '/' + (home.path || '0'));
  await fakeStates(page, LAMPS, { sticky: true });
  await need('Home: Einstellung und Lampen im Dashboard gesetzt', await setMode(page, 'toggle', { path: home.path || '0', vars: TWO }));
  await page.waitForTimeout(2500);
  await setRow(page, 'none');
  await prep(page);
  const g = await at(page, GROUP);
  await need('Home: Badge „Beleuchtung“ sichtbar', g);
  await tap(page, g);
  const gCalls = await calls(page), gRow = await rowState(page), gPopup = await popupOpen(page);
  if (gPopup) await closePopup(page);
  await check('Home Schalten: Tipp auf „Beleuchtung“ klappt die Lampen auf, kein Licht-Aufruf',
    gRow === 'lights' && gCalls.includes('input_select.select_option') && !lightCalls(gCalls).length && !gPopup, { gCalls, gRow, gPopup });
  await prep(page);
  const chip = await at(page, CHIP + " && (b._config || {}).entity === 'light.qa_tap_lamp_2'");
  await need('Home Schalten: Lampen-Chip in der Unter-Reihe sichtbar', chip);
  await tap(page, chip);
  const cCalls = await calls(page), ids = (await callData(page)).map((d) => [].concat(d.entity_id || d.light_entity || [])).flat();
  const cPopup = await popupOpen(page);
  if (cPopup) await closePopup(page);
  await check('Home Schalten: Tipp auf eine Lampe der Reihe schaltet nur diese', lightCalls(cCalls).length === 1
    && cCalls.includes('casora.light_smart_toggle') && ids.length === 1 && ids[0] === 'light.qa_tap_lamp_2' && !cPopup, { cCalls, ids, cPopup });
  await prep(page);
  await hold(page, await at(page, GROUP));
  const hCalls = await calls(page), holdPopup = await popupOpen(page);
  await check('Home Schalten: Halten auf „Beleuchtung“ öffnet das Licht-Popup', holdPopup && !lightCalls(hCalls).length, { hCalls });
  if (holdPopup) await closePopup(page);
  await page.evaluate(() => { window.__qaCatch = false; });
  await setRow(page, 'none');
  await page.context().close();
}

// ── Phone: Home light badge ─────────────────────────────────────────────────────
{
  const { page } = await open({ width: 393, height: 852, mobile: true, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, phone.url + '/' + (phone.config.views[0].path || '0'), 3);
  await fakeStates(page, LAMPS, { sticky: true });
  // Default and switch mode with two lamps on the Home badge, then the switch mode with one (no lamps to show).
  for (const [mode, vars] of [[null, TWO], ['toggle', TWO], ['toggle', ONE]]) {
    const label = 'Handy ' + (mode ? 'Schalten' : 'Standard') + (vars === ONE ? ', eine Lampe' : ', zwei Lampen');
    await need(label + ': Einstellung im Dashboard gesetzt', await setMode(page, mode, { path: null, vars }));
    await page.waitForTimeout(3000);
    await prep(page);
    const g = await at(page, GROUP);
    await need(label + ': Badge „Beleuchtung“ sichtbar', g);
    await tap(page, g);
    const tapCalls = await calls(page), tapPopup = await popupOpen(page);
    // The popup's lamp rows (each opens its lamp's own page with the lamp's switch).
    const rows = await page.evaluate(() => { const P = window.casoraPopup; return P && P.surface
      ? window.__pierce('.lps-row', P.surface).map((r) => r.getAttribute('data-lps-tap') || '') : []; });
    if (tapPopup) await closePopup(page);
    if (vars === TWO) {
      // By default and with lamps of its own in the switch mode too: the light popup with those lamps.
      await check(label + ': Tipp öffnet das Licht-Popup, schaltet nicht', tapPopup && !lightCalls(tapCalls).length, { tapCalls });
      await check(label + ': das Popup zeigt beide Lampen einzeln', ['light.qa_tap_lamp_1', 'light.qa_tap_lamp_2']
        .every((id) => rows.some((r) => r.includes('"id":"' + id + '"'))), { rows });
    } else {
      const ids = (await callData(page)).map((d) => [].concat(d.entity_id || d.light_entity || [])).flat();
      await check(label + ': Tipp schaltet die Lampe, kein Popup', !tapPopup && lightCalls(tapCalls).length > 0
        && ids.every((x) => x === 'light.qa_tap_lamp_1'), { tapCalls, tapPopup, ids });
      await prep(page);
      await hold(page, await at(page, GROUP));
      const holdPopup = await popupOpen(page);
      await check(label + ': Halten öffnet das Licht-Popup', holdPopup, { calls: await calls(page) });
      if (holdPopup) await closePopup(page);
    }
  }
  await page.evaluate(() => { window.__qaCatch = false; });
  await page.context().close();
}
await finish();
