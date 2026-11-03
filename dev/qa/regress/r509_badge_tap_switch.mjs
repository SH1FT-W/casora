// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Issue 119 (26.11.9): „Tap on badges“ (Studio › Controls › Tiles, badge_tap). Default („Open popup“, as before): a
// tap on a lamp chip opens its popup, holding switches it. „Switch the light“ (badge_tap: toggle): a tap switches,
// holding opens the popup; the collective badge „Beleuchtung“ switches its lamps on a tap. Desktop 1440 (room page
// lamp chip, collective badge) and phone 393 (Home light badge). The setting goes into the open dashboard's config
// in the browser only (nothing saved); service calls are caught and not sent, so no lamp switches.
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
      if (m && (m.type === 'call_service' || m.type === 'execute_script') && window.__qaCatch) { window.__calls.push(m); return Promise.resolve({ context: {} }); }
      return orig(m);
    };
    conn.__qaPatched = true;
  }
  window.__qaCatch = true;
});
const setMode = (page, mode) => page.evaluate((mode) => {
  // On the panel, not on hui-root: ha-panel-lovelace hands its own lovelace down again on every render.
  const root = window.__pierce('ha-panel-lovelace')[0];
  const ll = root && root.lovelace;
  if (!ll || !ll.config) return false;
  const cfg = JSON.parse(JSON.stringify(ll.config));
  const put = (o, d) => {
    if (!o || typeof o !== 'object' || d > 14) return;
    if (Array.isArray(o)) { o.forEach((x) => put(x, d + 1)); return; }
    const t = [].concat(o.template || []);
    if (t.includes('casora_room') || t.includes('casora_mobile_bg')) {
      o.variables = o.variables || {};
      if (mode) o.variables.badge_tap = mode; else delete o.variables.badge_tap;
    }
    Object.keys(o).forEach((k) => { if (k !== 'variables') put(o[k], d + 1); });
  };
  put(cfg.views, 0);
  root.lovelace = Object.assign(Object.create(Object.getPrototypeOf(ll)), ll, { config: cfg });
  return true;
}, mode);
const calls = (page) => page.evaluate(() => (window.__calls || []).map((m) => (m.domain || '') + '.' + (m.service || '')));
const callData = (page) => page.evaluate(() => (window.__calls || []).map((m) => m.service_data || {}));
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
      await prep(page);
      const grp = await at(page, GROUP);
      await need('Schalten: Badge „Beleuchtung“ sichtbar', grp);
      await tap(page, grp);
      const gCalls = await calls(page), gData = await callData(page);
      const ids = gData.map((d) => [].concat(d.entity_id || d.light_entity || [])).flat();
      await check('Schalten: Tipp auf „Beleuchtung“ schaltet die Lampen des Raums', gCalls.some((c) => /^(light\.turn_(on|off)|casora\.light_smart_toggle)$/.test(c))
        && !gCalls.includes('input_select.select_option'), { gCalls });
      await check('Schalten: nur die Lampen dieses Raums, nicht das ganze Haus', ids.length > 0
        && ids.every((x) => x === grpId || /^light\.qa_tap_lamp_/.test(x)), { ids });
    }
  }
  await page.evaluate(() => { window.__qaCatch = false; });
  await page.evaluate(() => document.querySelector('home-assistant').hass.callService('input_select', 'select_option',
    { entity_id: 'input_select.casora_expanded_row', option: 'none' }).catch(() => {}));
  await page.context().close();
}

// ── Phone: Home light badge ─────────────────────────────────────────────────────
{
  const { page } = await open({ width: 393, height: 852, mobile: true, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, phone.url + '/' + (phone.config.views[0].path || '0'), 3);
  for (const mode of [null, 'toggle']) {
    const label = 'Handy ' + (mode ? 'Schalten' : 'Standard');
    await need(label + ': Einstellung im Dashboard gesetzt', await setMode(page, mode));
    await page.waitForTimeout(3000);
    await prep(page);
    const g = await at(page, GROUP);
    await need(label + ': Badge „Beleuchtung“ sichtbar', g);
    await tap(page, g);
    const tapCalls = await calls(page), tapPopup = await popupOpen(page);
    if (tapPopup) await closePopup(page);
    if (!mode) {
      await check(label + ': Tipp öffnet das Licht-Popup', tapPopup && !tapCalls.some((c) => /^(light|casora)\./.test(c)), { tapCalls });
    } else {
      await check(label + ': Tipp schaltet, kein Popup', !tapPopup && tapCalls.some((c) => /^(light\.turn_(on|off)|casora\.light_smart_toggle)$/.test(c)), { tapCalls, tapPopup });
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
