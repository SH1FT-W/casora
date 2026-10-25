// @zustand: arbeit
// @parallel: allein   (timings: other tests on the same HA would slow the page down)
// @deckt: custom_components/casora/scripts/casora-theme.js custom_components/casora/scripts/local/00-finder.js custom_components/casora/scripts/local/03-popups.js custom_components/casora/scripts/casora-core.js
// Owner report after 26.10.60b2: the dashboard lags when switching rooms and in general. Guards:
//   1. No _updateHass loop: casora-theme.js hands its designs to HA's theme list with _updateHass, which redraws the
//      whole frontend. During 10 s idle and during 5 room switches: no themes update at all, and only HA's own calls
//      (panelUrl per switch, states).
//   2. No card is subscribed to the whole house: button-card subscribes a card to every entity its templates read
//      through the state proxy. securityAway (security/lock/contact badges), the door/window list (casoraContacts)
//      and the e-bike scan read every state – those cards redrew on every change in the house and each further read
//      searched a list of thousands of ids. Now none watches more than a tenth of the states.
//   3. A door opening still redraws the contact badge that lists it (it subscribes to its members).
//   4. Room switch: desktop (view change) and phone (room filter) settle within a sane bound.
//   5. Phone: a change of an entity no card shows redraws (almost) nothing. The room filter rewrote its helper
//      (input_select.casora_mobile_filter) twice per update – filter overlay, then the smart row inside it – and with
//      a badge row token (casora_tok) made a new entity object each time: every card at the helper redrew on every
//      change in the house (12 room headers, weather, badges: ~27 redraws per change, now ≤ 4).
import { open, casoraDashboard, dashboard, check, need, finish, fakeStates, BASE } from './lib.mjs';
import { tokens } from '../ws.mjs';

const MAX_SWITCH = 2500;   // ms until no card redraws any more, per switch (measured ~60–160 ms on the test house)
const MAX_MEDIAN = 1200;
const MAX_PHONE_DRAWS = 4; // button-card redraws per change of an entity no card shows (phone)

const d = await casoraDashboard((x) => (x.config.views || []).length >= 3);
await need('Casora dashboard with rooms', d, null);
const views = (d.config.views || []).map((v, i) => v.path || String(i));

const instrument = () => {
  const L = window.__qaLag = { uh: 0, themes: 0, keys: {}, last: 0, draws: 0 };
  const hook = () => {
    const H = customElements.get('home-assistant');
    if (H && !H.prototype.__qaLag) {
      H.prototype.__qaLag = true;
      const o = H.prototype._updateHass;
      H.prototype._updateHass = function (obj) {
        L.uh++;
        for (const k of Object.keys(obj || {})) L.keys[k] = (L.keys[k] || 0) + 1;
        if (obj && obj.themes) L.themes++;
        return o.apply(this, arguments);
      };
    }
    const B = customElements.get('button-card');
    if (B && !B.prototype.__qaLag) {
      B.prototype.__qaLag = true;
      const u = B.prototype.update;
      B.prototype.update = function (ch) { try { return u.call(this, ch); } finally { L.last = performance.now(); L.draws++; } };
    }
  };
  customElements.whenDefined('home-assistant').then(hook);
  customElements.whenDefined('button-card').then(hook);
};
const snap = (pg) => pg.evaluate(() => ({ uh: window.__qaLag.uh, themes: window.__qaLag.themes, keys: { ...window.__qaLag.keys } }));
const extra = (a, b) => { const o = {}; for (const k in b.keys) { const n = b.keys[k] - (a.keys[k] || 0); if (n && k !== 'panelUrl' && k !== 'states') o[k] = n; } return o; };
// Switch, then wait until no button-card redrew for 600 ms.
const settle = (pg, t0) => pg.evaluate(async (t0) => {
  const L = window.__qaLag, st = performance.now();
  while (performance.now() - st < 15000) {
    await new Promise((r) => setTimeout(r, 50));
    const last = Math.max(L.last, t0);
    if (performance.now() - last > 600) return Math.round(last - t0);
  }
  return 15000;
}, t0);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ── Desktop ──
{
  const { page, context } = await open({ width: 1440, height: 900 });
  await context.addInitScript(instrument);
  await dashboard(page, d.url + '/' + views[0]);
  await page.waitForTimeout(3000);

  let a = await snap(page);
  await page.waitForTimeout(10000);
  let b = await snap(page);
  await check(`idle 10 s: no theme list handed to HA (${b.themes - a.themes})`, b.themes === a.themes, b.keys);
  await check(`idle 10 s: no other _updateHass than HA's states (${JSON.stringify(extra(a, b))})`, !Object.keys(extra(a, b)).length);
  const reg = await page.evaluate(() => window.casoraTheme && window.casoraTheme.registerStats && window.casoraTheme.registerStats());
  await check(`designs handed to HA at most 3 times since loading (${JSON.stringify(reg)})`, !!reg && reg.updates <= 3, reg);

  const targets = views.slice(1, 5).concat([views[0]]);
  a = await snap(page);
  const ms = [];
  for (const t of targets) {
    const t0 = await page.evaluate((u) => {
      const s = performance.now();
      history.pushState(null, '', u);
      window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } }));
      return s;
    }, '/' + d.url + '/' + t);
    ms.push(await settle(page, t0));
  }
  b = await snap(page);
  await check(`desktop: ${targets.length} room switches settle within ${MAX_SWITCH} ms each, median < ${MAX_MEDIAN} ms (${ms.join(', ')})`,
    ms.every((x) => x < MAX_SWITCH) && median(ms) < MAX_MEDIAN, ms);
  await check(`room switches: no theme list handed to HA (${b.themes - a.themes})`, b.themes === a.themes);
  await check(`room switches: _updateHass only HA's own (${b.uh - a.uh} calls, other: ${JSON.stringify(extra(a, b))})`,
    !Object.keys(extra(a, b)).length && b.uh - a.uh <= targets.length + 5, b.keys);

  // Back on the first view: no card watches a large part of the house.
  const wide = await page.evaluate(() => {
    const n = Object.keys(document.querySelector('home-assistant').hass.states).length;
    const cards = window.__pierce('button-card').map((x) => ({ t: [].concat((x._config || {}).template || []).join('+'), m: (x._monitoredEntities || []).length }));
    return { n, top: cards.sort((p, q) => q.m - p.m).slice(0, 3) };
  });
  await check(`no card subscribed to more than a tenth of the ${wide.n} states (most: ${JSON.stringify(wide.top)})`,
    wide.top.length > 0 && wide.top[0].m <= wide.n / 10, wide.top);

  // A door that opens still redraws the contact badge that lists it.
  const door = await page.evaluate(() => {
    const S = document.querySelector('home-assistant').hass.states;
    for (const x of window.__pierce('button-card')) {
      const v = (x._config || {}).variables || {};
      const t = [].concat((x._config || {}).template || []);
      if (!t.includes('casora_badge_contact_group') || !Array.isArray(v.contacts)) continue;
      const id = v.contacts.find((c) => S[c] && S[c].state === 'off');
      if (id && x.getBoundingClientRect().width > 0) { x.__qaDraws = 0; const u = x.update; x.update = function (ch) { x.__qaDraws++; return u.call(this, ch); }; window.__qaDoor = x; return id; }
    }
    return null;
  });
  if (door) {
    await fakeStates(page, { [door]: { state: 'on' } });
    const draws = await page.evaluate(() => window.__qaDoor.__qaDraws);
    await check(`door ${door} opens: its contact badge redraws (${draws})`, draws > 0);
    await fakeStates(page, { [door]: { state: 'off' } });
  } else console.log('  (no contact badge with a closed door on this view – door check skipped)');
  await context.browser().close();
}

// ── Phone: room filter ──
if (d.phone) {
  const { page, context } = await open({ width: 393, height: 852, mobile: true });
  await context.addInitScript(instrument);
  await dashboard(page, d.phone.url);
  await page.waitForTimeout(3000);
  const rooms = await page.evaluate(() => {
    // The room pages of the phone: casora-filter-overlay with filter_category room_<slug>.
    const ids = new Set();
    window.__pierce('casora-filter-overlay').forEach((x) => { const c = String((x._config || {}).filter_category || ''); if (/^room_/.test(c) && c !== 'room_scenes') ids.add(c); });
    return [...ids].slice(0, 4);
  });
  const ok = await page.evaluate(() => !!(window._casoraFilter && window._casoraFilter.set));
  if (ok && rooms.length) {
    const a = await snap(page);
    const ms = [];
    for (const t of rooms.concat(['all'])) {
      const t0 = await page.evaluate((t) => { const s = performance.now(); window._casoraFilter.set(t); return s; }, t);
      ms.push(await settle(page, t0));
    }
    const b = await snap(page);
    await check(`phone: ${ms.length} room switches settle within ${MAX_SWITCH} ms each, median < ${MAX_MEDIAN} ms (${ms.join(', ')})`,
      ms.every((x) => x < MAX_SWITCH) && median(ms) < MAX_MEDIAN, ms);
    await check(`phone room switches: no theme list handed to HA, no other _updateHass (${JSON.stringify(extra(a, b))})`,
      b.themes === a.themes && !Object.keys(extra(a, b)).length);
  } else console.log('  (phone dashboard without room filter – phone part skipped)');

  // Foreign changes: the badge rows' token set (as when the server's room badges arrive), then 5 changes of an
  // entity no card shows.
  if (ok) {
    await page.evaluate(() => window._casoraFilter.bump && window._casoraFilter.bump());
    await page.waitForTimeout(1500);
    const tok = (await tokens()).access_token;
    const d0 = await page.evaluate(() => window.__qaLag.draws);
    for (let i = 0; i < 5; i++) {
      await fetch(BASE + '/api/states/sensor.casora_qa_foreign', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: String(100 + i), attributes: { unit_of_measurement: 'W' } }) });
      await page.waitForTimeout(800);
    }
    const per = ((await page.evaluate(() => window.__qaLag.draws)) - d0) / 5;
    await check(`phone: at most ${MAX_PHONE_DRAWS} redraws per change of an entity no card shows (${per})`, per <= MAX_PHONE_DRAWS, per);
  }
}

await finish();
