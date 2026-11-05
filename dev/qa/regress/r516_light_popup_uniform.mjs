// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/03-popups.js#S.placeOf,holds,S.headOf,lampRow,hero,S.fxMoon,v3Moons,v3SceneItems,roomBody,sceneScope,S.lampAlone
// Owner (03.11.2026, review sheet of every light popup before 26.11.8): the light popups looked different depending on
// the way they were opened. One rule now, whatever the path (house badge, house → room, room badge, Home's room chip,
// a lamp chip, a lamp from any list, a room of one lamp):
//   1. head: label = the room („Zuhause“ for the house), title = „Beleuchtung“; a lamp's page: label = its room, title =
//      the lamp's name without the room. No status line under the title (the count stands once, in the list heading),
//      so every page has the same head and the dial never jumps between room and lamp page.
//   2. rows: lamp names without the room, the sub-line short („Aus“, „An · 80 %“, never „zuletzt …“).
//   3. the word for the devices is „Lampen“: „Lampen im Raum · 1 von 3 an“.
//   4. beside the dial at most two round buttons: „Szenen“ (left, a menu with the room's scenes) and „Effekte“; a lamp's
//      page shows only its own „Effekte“, no „Szenen“ (owner, 05.11.2026, issue 126).
//   5. a lamp's page has its own main switch (top right) that switches that lamp.
//   6. a light group in a room („Spots“) is one row everywhere, also in the room's own popup; a lamp's page lists
//      nothing, however it is opened (issue 126, r586).
// The test house's living room gets made-up lamps in the browser (a lamp with effects, a lamp, a group of two spots),
// the hallway one lamp. Desktop 1440 and phone 393. Nothing is saved.
import { open, dashboard, casoraDashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const V = (p) => dash.config.views.find((v) => v.path === p && ((v.cards || [])[0] || {}).template === 'casora_room');
const wz = V('wohnzimmer'), fl = V('flur');
await need('Räume Wohnzimmer und Flur mit Licht-Badge', wz && fl && wz.cards[0].variables.light_entity_1 && fl.cards[0].variables.light_entity_1);
const WZ = wz.cards[0].name, FL = fl.cards[0].name;
const wzGroup = wz.cards[0].variables.light_entity_1, flGroup = fl.cards[0].variables.light_entity_1;
const ct = { supported_color_modes: ['color_temp', 'hs'], color_mode: 'color_temp', color_temp_kelvin: 2700, min_color_temp_kelvin: 2200, max_color_temp_kelvin: 6500 };
const L = { strip: 'light.qa_uni_strip', steh: 'light.qa_uni_steh', spots: 'light.qa_uni_spots', s1: 'light.qa_uni_spot_1', s2: 'light.qa_uni_spot_2', flur: 'light.qa_uni_flur' };
const FAKE = {
  [L.strip]: { state: 'off', attributes: { friendly_name: 'TV-Backlight ' + WZ, effect_list: ['Regenbogen', 'Kerze'], ...ct } },
  [L.steh]: { state: 'on', attributes: { friendly_name: 'Stehlampe ' + WZ, brightness: 204, ...ct } },
  [L.spots]: { state: 'off', attributes: { friendly_name: 'Spots ' + WZ, entity_id: [L.s1, L.s2], ...ct } },
  [L.s1]: { state: 'off', attributes: { friendly_name: 'Deckenspot ' + WZ + ' 1', ...ct } },
  [L.s2]: { state: 'off', attributes: { friendly_name: 'Deckenspot ' + WZ + ' 2', ...ct } },
  [L.flur]: { state: 'off', attributes: { friendly_name: 'Deckenlampe ' + FL, ...ct } },
  [wzGroup]: { state: 'on', attributes: { friendly_name: WZ, entity_id: [L.strip, L.steh, L.spots], ...ct } },
  [flGroup]: { state: 'off', attributes: { friendly_name: FL, entity_id: [L.flur], ...ct } },
};
const LAMPS = ['TV-Backlight', 'Stehlampe', 'Spots'];

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page: pg } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(pg);
  const go = async (url) => {
    await dashboard(pg, url, 2);
    await fakeStates(pg, FAKE, { sticky: true });
    await pg.waitForTimeout(1200);
  };
  const tap = async (p, hold) => {
    if (size.mobile) { await pg.touchscreen.tap(p.x, p.y); return; }
    if (hold) { await pg.mouse.move(p.x, p.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up(); return; }
    await pg.mouse.click(p.x, p.y);
  };
  // What the open popup shows.
  const info = () => pg.evaluate(() => {
    const e = window.casoraPopup && window.casoraPopup.element; if (!e || !e.hasAttribute('open')) return null;
    const vis = (x) => { if (!x) return false; const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(x).visibility !== 'hidden'; };
    const P = (s) => window.__pierce(s, e.shadowRoot).filter(vis);
    const t = (x) => (x.textContent || '').replace(/​/g, '').replace(/\s+/g, ' ').trim();
    const rows = P('.lps-row').map((r) => ({ name: t(r.querySelector('.lps-tx b') || r), sub: t(r.querySelector('.lps-tx small') || { textContent: '' }) }));
    const st = e._headerStatus;
    const dl = P('.hui-dl')[0], sf = e.surface;
    return { eyebrow: t(e._headerEyebrow || {}), title: t(e._headerTitle || {}), back: !!(e._headerBack && !e._headerBack.hidden),
      status: st && !st.hidden && vis(st) ? t(st) : '', sw: !!(e._headerSwitch && !e._headerSwitch.hidden && vis(e._headerSwitch)),
      lbl: P('.lps-lbl').map(t), rows, moons: P('.hui-moon').map((m) => m.getAttribute('aria-label') || t(m)),
      moonsOn: P('.hui-moon.on').map((m) => m.getAttribute('aria-label') || t(m)),
      dial: dl && sf ? Math.round(dl.getBoundingClientRect().top - sf.getBoundingClientRect().top) : null };
  });
  const until = async (fn, max = 28) => { let h = null; for (let i = 0; i < max; i++) { await pg.waitForTimeout(250); h = await info(); if (h && fn(h)) break; } await pg.waitForTimeout(600); return info(); };
  const close = () => pg.evaluate(async () => { if (window.casoraPopup && window.casoraPopup.close) window.casoraPopup.close(); await new Promise((r) => setTimeout(r, 900)); });
  // last: the lowest such card (a phone room page keeps Home's badge row, hidden, above its own).
  const cardAt = (tpl, ent, last) => pg.evaluate(([tpl, ent, last]) => {
    const all = window.__pierce('button-card').filter((x) => [].concat((x._config || {}).template || []).includes(tpl)
      && (!ent || (x._stateObj || {}).entity_id === ent) && x.getBoundingClientRect().width > 20 && getComputedStyle(x).display !== 'none');
    const b = last ? all.sort((p, q) => q.getBoundingClientRect().y - p.getBoundingClientRect().y)[0] : all[0];
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, [tpl, ent, !!last]);
  const rowAt = (pred) => pg.evaluate((pred) => {
    const e = window.casoraPopup.element; const vis = (x) => x && x.getBoundingClientRect().width > 0;
    const R = window.__pierce('.lps-row[data-lps-tap]', e.shadowRoot).filter(vis).map((r) => { let d = null; try { d = JSON.parse(r.getAttribute('data-lps-tap')); } catch (err) { /* none */ } return { r, d }; });
    const it = R.find((x) => x.d && new Function('d', 'return ' + pred)(x.d));
    if (!it) return null; it.r.scrollIntoView({ block: 'center' });
    const b = (it.r.querySelector('.lps-tx') || it.r).getBoundingClientRect();
    return { x: b.x + Math.min(30, b.width / 3), y: b.y + b.height / 2 };
  }, pred);
  // Taps a round button and reads the small menu it opens (texts, the marked row), then closes it.
  const moonMenu = async (word) => {
    const p = await pg.evaluate((word) => {
      const e = window.casoraPopup.element;
      const m = window.__pierce('.hui-moon', e.shadowRoot).find((x) => x.getBoundingClientRect().width > 0 && (x.getAttribute('aria-label') || '').indexOf(word) === 0);
      if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, word);
    if (!p) return null;
    await tap(p); await pg.waitForTimeout(700);
    const rows = await pg.evaluate(() => { const h = document.querySelector('[data-casora-moonmenu-pane]'); if (!h) return null;
      return [...h.shadowRoot.querySelectorAll('.row')].map((r) => (r.classList.contains('on') ? '*' : '') + r.textContent.trim()); });
    // Close it with a tap beside it (on its veil), the popup stays open.
    await pg.evaluate(() => { const h = document.querySelector('[data-casora-moonmenu-pane]'); const v = h && h.shadowRoot.querySelector('.veil'); if (v) v.click(); });
    await pg.waitForTimeout(400);
    return rows;
  };
  const views = [];
  // One view: the rules every light popup keeps.
  const judge = async (name, h, want) => {
    if (!h) { await check(label + ' ' + name + ': Popup offen', false); return; }
    views.push({ name, h });
    await check(`${label} ${name}: Kopf „${want.eyebrow} / ${want.title}“`, h.eyebrow.toLowerCase() === want.eyebrow.toLowerCase() && h.title === want.title, h);
    await check(`${label} ${name}: keine Statuszeile unter dem Titel`, !h.status, h.status);
    if (want.rows) {
      const names = h.rows.map((r) => r.name);
      await check(`${label} ${name}: Zeilen ohne Raumnamen, „Spots“ als eine Zeile`, want.rows.every((n) => names.includes(n))
        && !names.some((n) => n.includes(WZ) || /^Deckenspot/.test(n)), names);
      await check(`${label} ${name}: Unterzeilen kurz (ohne „zuletzt“)`, h.rows.every((r) => !/zuletzt/i.test(r.sub)), h.rows.map((r) => r.sub));
      await check(`${label} ${name}: Überschrift „Lampen im Raum · 1 von 3 an“`, h.lbl.some((x) => /^Lampen im Raum · 1 von 3 an$/i.test(x)), h.lbl);
    }
    await check(`${label} ${name}: höchstens zwei runde Knöpfe, nur „Szenen“ / „Effekte“`, h.moons.length <= 2
      && h.moons.every((m) => /^(Szenen|Effekte)/.test(m)), h.moons);
    if (want.scenes) await check(`${label} ${name}: Knopf „Szenen“`, h.moons.some((m) => /^Szenen/.test(m)), h.moons);
    if (want.alone) await check(`${label} ${name}: keine Liste der Lampen des Raums (Issue 126)`, !h.rows.length && !h.lbl.some((x) => /^Lampen/.test(x)), h);
    if (want.alone) await check(`${label} ${name}: kein Knopf „Szenen“ (nur Dinge der Lampe, Issue 126)`, !h.moons.some((m) => /^Szenen/.test(m)), h.moons);
    if (want.sw) await check(`${label} ${name}: eigener Schalter oben rechts`, h.sw, h);
  };

  // a) The house: Home's light badge.
  await go(size.mobile ? dash.phone.url + '/home' : dash.url);
  let at = await cardAt('casora_badge_light_group');
  await need(label + ': Licht-Badge auf Zuhause', at);
  await tap(at, !size.mobile);
  let h = await until((x) => x.rows.length > 2);
  await check(`${label} Haus: Kopf „Zuhause / Beleuchtung“`, h && /^zuhause$/i.test(h.eyebrow) && h.title === 'Beleuchtung', h);
  await check(`${label} Haus: keine Statuszeile unter dem Titel`, h && !h.status, h && h.status);
  // b) House → living room → a lamp; c) house → hallway (one lamp: its page straight away).
  let r = await rowAt(`d.a==='room' && d.name===${JSON.stringify(WZ)}`);
  await need(label + ': Zeile Wohnzimmer im Haus-Popup', r);
  await tap(r);
  h = await until((x) => x.back && x.rows.length >= 3);
  await judge('Haus → Raum', h, { eyebrow: WZ, title: 'Beleuchtung', rows: LAMPS, scenes: true });
  r = await rowAt(`d.a==='mi' && d.id===${JSON.stringify(L.steh)}`);
  if (r) { await tap(r); h = await until((x) => x.title === 'Stehlampe' || /Stehlampe/.test(x.title)); await judge('Haus → Raum → Lampe', h, { eyebrow: WZ, title: 'Stehlampe', alone: true, sw: true }); }
  else await check(label + ': Lampen-Zeile im Raum', false);
  await close();

  await go(size.mobile ? dash.phone.url + '/home' : dash.url);
  at = await cardAt('casora_badge_light_group');
  await tap(at, !size.mobile);
  await until((x) => x.rows.length > 2);
  r = await rowAt(`d.a==='room' && d.name===${JSON.stringify(FL)}`);
  if (r) { await tap(r); h = await until((x) => x.back && /Deckenlampe/.test(x.title)); await judge('Haus → Raum mit einer Lampe', h, { eyebrow: FL, title: 'Deckenlampe', alone: true, sw: true }); }
  else await check(label + ': Zeile Flur im Haus-Popup', false);
  await close();

  // c2) The house through a light group's tile (not a badge; r240, 03.11.2026): a room row opens the room's page with
  // the room's lamps – also a room listed by its own group whose members are missing (it is the room, not a lamp).
  await go(size.mobile ? dash.phone.url + '/' + (dash.phone.config.views[0].path || '0') : dash.url);
  const gt = await pg.evaluate(() => {
    const S = document.querySelector('home-assistant').hass.states;
    const b = window.__pierce('button-card').find((x) => { const e = (x._stateObj || {}).entity_id || '';
      return e.indexOf('light.') === 0 && Array.isArray(((S[e] || {}).attributes || {}).entity_id)
        && x._config.tap_action && x._config.tap_action.casora_popup && x.getBoundingClientRect().width > 100
        && ![].concat(x._config.template || []).some((t) => /badge|chip/.test(t)); });
    if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (gt) {
    await tap(gt);
    h = await until((x) => x.rows.length > 1);
    // A room of this house listed by a group without existing members.
    const bare = await pg.evaluate(() => { const c = window._casoraLightSoft.cur, S = document.querySelector('home-assistant').hass.states;
      const r = c && c.rooms && c.rooms.find((x) => (x.lights || []).length === 1 && S[x.lights[0]]
        && Array.isArray(S[x.lights[0]].attributes.entity_id) && !S[x.lights[0]].attributes.entity_id.some((y) => S[y]));
      return r ? r.name : null; });
    for (const nm of [WZ, bare].filter(Boolean)) {
      r = await rowAt(`d.a==='room' && d.name===${JSON.stringify(nm)}`);
      if (!r) { await check(`${label} Gruppen-Kachel: Zeile „${nm}“`, false, h); continue; }
      await tap(r);
      h = await until((x) => x.back && x.rows.length >= 1);
      const names = (h && h.rows || []).map((x) => x.name);
      await check(`${label} Gruppen-Kachel → „${nm}“: Kopf „${nm} / Beleuchtung“, Zeilen der Lampen (keine Räume)`,
        h && h.back && h.eyebrow.toLowerCase() === nm.toLowerCase() && h.title === 'Beleuchtung' && !h.lbl.some((x) => /^Räume/.test(x))
        && (nm !== WZ || LAMPS.every((n) => names.includes(n))), h);
      const bk = await pg.evaluate(() => { const b = window.casoraPopup.element._headerBack; if (!b || b.hidden) return null; const q = b.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
      if (bk) { await tap(bk); await until((x) => !x.back); }
    }
    await close();
  } else await check(label + ': Kachel einer Lichtgruppe', false);

  // d) The room's own light badge (desktop: holding it opens the popup, a tap opens the row of lamps; phone: the room
  // page of the one phone view, its filter key as the phone sets it).
  const roomPage = async (name, path) => {
    if (size.mobile) {
      await go(dash.phone.url + '/' + (dash.phone.config.views[0].path || '0'));
      // The phone's room keys as its navigation lists them (r243).
      await pg.evaluate(([name, path]) => { const n = window.__pierce('*').find((e) => e._rooms && typeof e._items === 'function');
        const r = n && (n._rooms.find((x) => (x.label || x.name) === name) || n._rooms.find((x) => x.key === 'room_' + path));
        if (r) window._casoraFilter.set(r.key); }, [name, path]);
      await pg.waitForTimeout(3000);
    } else await go(dash.url + '/' + path);
  };
  // Finding 3 (owner, 03.11.2026): a room whose light group holds one lamp opens that lamp's page from its badge too.
  await roomPage(FL, 'flur');
  at = await cardAt('casora_badge_light_group', null, size.mobile);
  if (at) { await tap(at, !size.mobile); h = await until((x) => /Deckenlampe/.test(x.title)); await judge('Raum-Badge mit einer Lampe', h, { eyebrow: FL, title: 'Deckenlampe', alone: true, sw: true }); await close(); }
  else await check(label + ': Licht-Badge im Flur', false);
  await roomPage(WZ, 'wohnzimmer');
  // The room's scene was set 10 min ago, a lamp of the room changed after it: no longer marked – on the room's page
  // and on the page of another lamp alike (review 03.11.2026: the lamp's page looked at itself only).
  const scene = await pg.evaluate((g) => { const h = document.querySelector('home-assistant').hass; const E = h.entities || {}, D = h.devices || {};
    const area = (x) => { const e = E[x] || {}; return e.area_id || (e.device_id && D[e.device_id] && D[e.device_id].area_id) || null; };
    return Object.keys(h.states).find((x) => x.startsWith('scene.') && area(x) && area(x) === area(g)) || null; }, wzGroup);
  if (scene) {
    const iso = (ms) => new Date(Date.now() - ms).toISOString();
    Object.assign(FAKE, { [scene]: { state: iso(600000), attributes: { friendly_name: 'Szene ' + WZ } },
      [L.steh]: Object.assign({}, FAKE[L.steh], { last_updated: iso(30000), last_changed: iso(30000) }) });
    await fakeStates(pg, FAKE, { sticky: true });
    await pg.waitForTimeout(1200);
  }
  at = await cardAt('casora_badge_light_group', null, size.mobile);
  await need(label + ': Licht-Badge im Wohnzimmer', at);
  await tap(at, !size.mobile);
  h = await until((x) => x.rows.length >= 3);
  await judge('Raum-Badge', h, { eyebrow: WZ, title: 'Beleuchtung', rows: LAMPS, scenes: true });
  if (scene) await check(`${label} Raum-Badge: Szene gilt nicht mehr (eine Lampe danach geändert) – „Szenen“ nicht markiert`, h && !h.moonsOn.some((m) => /^Szenen/.test(m)), h && h.moonsOn);
  const sm = await moonMenu('Szenen');
  await check(`${label} Raum-Badge: „Szenen“ öffnet ein Menü mit den Szenen des Raums, ohne Raumnamen`,
    Array.isArray(sm) && sm.length >= 2 && !sm.some((x) => x.includes(WZ)), sm);
  // e) A lamp from the room's popup: the lamp with effects (moon „Effekte“, no „Szenen“ – issue 126).
  r = await rowAt(`d.a==='mi' && d.id===${JSON.stringify(L.strip)}`);
  if (r) {
    await tap(r); h = await until((x) => /TV-Backlight/.test(x.title));
    await judge('Raum → Lampe', h, { eyebrow: WZ, title: 'TV-Backlight', alone: true, sw: true });
    await check(`${label} Raum → Lampe: Knopf „Effekte“ der Lampe`, h && h.moons.some((m) => /^Effekte/.test(m)), h && h.moons);
    // Esc with the menu open closes the menu, not the popup (review 03.11.2026).
    if (!size.mobile) {
      const p0 = await pg.evaluate(() => { const e = window.casoraPopup.element;
        const m = window.__pierce('.hui-moon', e.shadowRoot).find((x) => x.getBoundingClientRect().width > 0 && /^Effekte/.test(x.getAttribute('aria-label') || ''));
        if (!m) return null; const r = m.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      if (p0) {
        await tap(p0); await pg.waitForTimeout(600);
        await pg.keyboard.press('Escape'); await pg.waitForTimeout(700);
        const st = await pg.evaluate(() => ({ menu: !!document.querySelector('[data-casora-moonmenu-pane]'), open: !!(window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open')) }));
        await check(`${label} Raum → Lampe: Esc schließt nur das Menü, das Popup bleibt`, !st.menu && st.open, st);
      }
    }
    const fm = await moonMenu('Effekte');
    await check(`${label} Raum → Lampe: „Effekte“ öffnet das Menü der Effekte`, Array.isArray(fm) && fm.some((x) => /Regenbogen/.test(x)) && fm.some((x) => /Ohne Effekt/.test(x)), fm);
  } else await check(label + ': Lampen-Zeile im Raum-Popup', false);
  await close();

  // f) Desktop: a lamp chip of the room and Home's room chip.
  if (!size.mobile) {
    // A light tile of the room saved with an own room_name (older setups: the room's name): the head says the room once
    // (review 03.11.2026: „WOHNZIMMER / Wohnzimmer“).
    await go(dash.url + '/wohnzimmer');
    const tileOk = await pg.evaluate(([g, rn]) => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_light')
        && x._stateObj && x._stateObj.entity_id === g && x.getBoundingClientRect().width > 20);
      if (!b) return null;
      b.setConfig(Object.assign({}, b._config, { variables: Object.assign({}, b._config.variables || {}, { room_name: rn }) }));
      b.hass = document.querySelector('home-assistant').hass;
      return true;
    }, [wzGroup, WZ]);
    if (tileOk) {
      await pg.waitForTimeout(1500);
      const tp = await pg.evaluate((g) => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_light')
        && x._stateObj && x._stateObj.entity_id === g && (x._config.variables || {}).room_name && x.getBoundingClientRect().width > 20);
        if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, tpl: [].concat(b._config.template) }; }, wzGroup);
      await pg.waitForTimeout(500);
      await tap(tp); h = await until((x) => x.rows.length >= 3);
      await check(`${label} Licht-Kachel mit eigenem room_name: Kopf „${WZ} / Beleuchtung“`, h && h.eyebrow.toLowerCase() === WZ.toLowerCase() && h.title === 'Beleuchtung', h);
      await close();
    } else await check(label + ': Licht-Kachel des Wohnzimmers', false);
    await go(dash.url + '/wohnzimmer');
    at = await cardAt('casora_badge_light_group');
    await tap(at);
    await pg.waitForTimeout(1500);
    at = await cardAt('casora_badge_light', L.steh);
    if (at) { await tap(at); h = await until((x) => /Stehlampe/.test(x.title)); await judge('Lampen-Chip', h, { eyebrow: WZ, title: 'Stehlampe', alone: true, sw: true }); await close(); }
    else await check(label + ': Lampen-Chip Stehlampe sichtbar', false);
    await go(dash.url);
    await fakeStates(pg, { ...FAKE, 'input_select.casora_expanded_row': { state: 'lights', attributes: {} } }, { sticky: true });
    await pg.waitForTimeout(2000);
    // Home's row holds the rooms' chips (ten at most): the first one standing for a room's light group.
    const chip = await pg.evaluate((rooms) => {
      const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light')
        && x._stateObj && rooms[x._stateObj.entity_id] && x.getBoundingClientRect().width > 20 && getComputedStyle(x).display !== 'none');
      if (!b) return null; b.scrollIntoView({ block: 'center', inline: 'center' }); const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, room: rooms[b._stateObj.entity_id] };
    }, Object.fromEntries(dash.config.views.filter((v) => ((v.cards || [])[0] || {}).template === 'casora_room' && v.path !== 'home'
      && (v.cards[0].variables || {}).light_entity_1).map((v) => [v.cards[0].variables.light_entity_1, v.cards[0].name])));
    if (chip) { await tap(chip); h = await until((x) => x.rows.length >= 1); await judge('Raum-Chip auf Zuhause', h, { eyebrow: chip.room, title: 'Beleuchtung' }); await close(); }
    else await check(label + ': Raum-Chip auf Zuhause sichtbar', false);
  }
  // The dial stands at the same height on every page (same head everywhere).
  const ys = views.map((v) => v.h.dial).filter((y) => y != null);
  await check(`${label}: Rad überall auf gleicher Höhe`, ys.length >= 3 && Math.max(...ys) - Math.min(...ys) <= 2, views.map((v) => [v.name, v.h.dial]));
  await pg.context().close();
}
// English (review 03.11.2026): the head and the heading the light module writes in German are translated.
{
  const { page: pg } = await open({ width: 1440, height: 900, dark: false, theme: 'Casora', locale: 'en-US' });
  usePage(pg);
  await pg.addInitScript(() => { try { localStorage.setItem('selectedLanguage', '"en"'); } catch (e) { /* none */ } });
  await dashboard(pg, dash.url, 2);
  await fakeStates(pg, FAKE, { sticky: true });
  await pg.waitForTimeout(1200);
  const at = await pg.evaluate(() => { const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_light_group') && x.getBoundingClientRect().width > 20);
    if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await need('English: light badge on Home', at);
  await pg.mouse.move(at.x, at.y); await pg.mouse.down(); await pg.waitForTimeout(900); await pg.mouse.up();
  await pg.waitForTimeout(3000);
  const en = await pg.evaluate(() => { const e = window.casoraPopup.element; if (!e) return null;
    const lbl = window.__pierce('.lps-lbl', e.shadowRoot).filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.textContent.trim());
    return { lang: (document.querySelector('home-assistant').hass.locale || {}).language, eyebrow: e._headerEyebrow.textContent.trim(), title: e._headerTitle.textContent.replace(/\u200B/g, '').trim(), lbl }; });
  await check('English: head „Home / Lighting“, heading „Rooms · n of m lamps on“', en && en.eyebrow === 'Home' && en.title === 'Lighting'
    && en.lbl.some((x) => /^Rooms · \d+ of \d+ lamps on$/.test(x)), en);
  await pg.context().close();
}
await finish();
