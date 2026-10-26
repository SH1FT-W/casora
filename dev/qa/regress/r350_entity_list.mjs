// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/34-entity-list.js custom_components/casora/scripts/casora-core.js custom_components/casora/panel/casora-panel-types.js
// Card request #59: an entity list (settings of a group as popup rows, each with its control: switch, time, − / +,
// choice; one or two columns, section headings) and "Mehr" (lists and charts without a tile of their own, opened in
// the same popup with ‹ back). Entries come from the test house (mock helpers: input_boolean, time, input_number,
// select); the group exists only in the browser (fakeStates), the two tiles too – nothing is saved and nothing is
// switched (callService is caught in the browser). Desktop (Chromium) and phone (WebKit, touch):
//   - tile: "N Einstellungen", or "k An" and highlighted when a switch of the list is on
//   - popup: one row per entry; layout "Auto": desktop two columns, phone one; the heading before its entry; a switch per
//     input_boolean (the row toggles), a time field per time entity (a tap keeps the popup open; a new time calls
//     time.set_value), − / + for the number, a choice field for the select
//   - Mehr: the group as a list and a sensor as a chart; a tap opens it with ‹, ‹ returns to Mehr
// R350_SHOTS=<dir>: store screenshots.
import { open, casoraDashboard, dashboard, check, need, finish, stable, fakeStates } from './lib.mjs';

const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const OUT = process.env.R350_SHOTS;
const GROUP = 'group.qa_r350';

const POPUP = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const vis = (n) => n.getBoundingClientRect().height > 0;
  const rows = window.__pierce('.hui-srow', pop.shadowRoot).filter(vis);
  const back = pop.shadowRoot.querySelector('.header-back');
  return { title: ((pop.shadowRoot.querySelector('.header-title') || {}).textContent || '').trim(), rows: rows.length,
    cols: new Set(rows.map((r) => Math.round(r.getBoundingClientRect().left))).size,
    text: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()),
    labels: window.__pierce('.hui-slbl', pop.shadowRoot).filter(vis).map((n) => n.textContent.trim()),
    times: window.__pierce('input[type="time"][data-casora-el]', pop.shadowRoot).length,
    selects: window.__pierce('select[data-casora-el]', pop.shadowRoot).length,
    switches: window.__pierce('.hui-srow [role="switch"]', pop.shadowRoot).filter(vis).length,
    steps: window.__pierce('[data-casora-elbtn]', pop.shadowRoot).filter(vis).length,
    chart: window.__pierce('casora-chart', pop.shadowRoot).some(vis), back: !!(back && !back.hidden) };
};

const run = async (view) => {
  const tag = view.mobile ? 'Phone WebKit' : 'Desktop';
  const { page } = await open(Object.assign({ theme: 'Casora', dark: true }, view));
  await dashboard(page, dash.url, 3);
  await need(tag + ': module loaded', await page.evaluate(() => !!window._casoraEntityList));
  // Entries from the house: two input_booleans, two time entities, a number helper, a select (not Casora's own helpers).
  const E = await page.evaluate(() => {
    const S = document.querySelector('home-assistant').hass.states, ids = Object.keys(S).sort();
    const live = (id) => S[id] && !['unavailable', 'unknown', ''].includes(String(S[id].state));
    const own = (id) => /\.(casora|hemma)_/.test(id);
    const pick = (f, n) => ids.filter((id) => live(id) && !own(id) && f(id)).slice(0, n);
    return { bools: pick((id) => id.startsWith('input_boolean.') && ['on', 'off'].includes(S[id].state), 2),
      times: pick((id) => id.startsWith('time.') && /^\d{2}:\d{2}/.test(S[id].state), 2),
      num: pick((id) => id.startsWith('input_number.') && isFinite(parseFloat(S[id].state)), 1)[0],
      sel: pick((id) => id.startsWith('select.') && (S[id].attributes.options || []).length > 1, 1)[0],
      temp: pick((id) => id.startsWith('sensor.') && S[id].attributes.device_class === 'temperature' && !!S[id].attributes.state_class
        && isFinite(parseFloat(S[id].state)), 1)[0],
    };
  });
  await need(tag + ': helpers in the test house (2 input_boolean, 2 time, input_number, select, temperature)',
    E.bools.length === 2 && E.times.length === 2 && E.num && E.sel && E.temp, E);
  const members = [...E.times, ...E.bools, E.num, E.sel];
  const onNow = await page.evaluate((b) => b.filter((id) => document.querySelector('home-assistant').hass.states[id].state === 'on').length, E.bools);
  await fakeStates(page, { [GROUP]: { state: onNow ? 'on' : 'off', attributes: { entity_id: members, friendly_name: 'QA Liste' } } }, { sticky: true });
  // Both tiles only in this browser (like r335), fixed on top of the page.
  await page.evaluate(async ([g, bool, temp]) => {
    const ha = document.querySelector('home-assistant');
    const h = await window.loadCardHelpers();
    const phone = window.innerWidth < 600;
    const add = (cfg, cls, i) => {
      const el = h.createCardElement(cfg);
      el.classList.add(cls);
      el.hass = ha.hass;
      el.style.cssText = 'position:fixed;left:' + (phone ? 16 + i * 186 : 400 + i * 240) + 'px;top:' + (phone ? 120 : 300) + 'px;width:'
        + (phone ? 170 : 220) + 'px;height:' + (phone ? 64 : 140) + 'px;z-index:99990;';
      ha.shadowRoot.appendChild(el);
      setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
    };
    add({ type: 'custom:button-card', template: 'casora_entity_list', name: 'QA Liste',
      variables: { list_group: g, list_layout: '', list_sections: [{ title: 'Schalter', before: bool }] } }, 'qa-r350-list', 0);
    add({ type: 'custom:button-card', template: 'casora_more', name: 'Mehr',
      variables: { more_lists: [g], more_charts: [temp], more_chart_labels: { [temp]: 'Temperatur' } } }, 'qa-r350-more', 1);
  }, [GROUP, E.bools[0], E.temp]);
  await page.waitForTimeout(1500);
  const shot = (n) => OUT && page.screenshot({ path: OUT + '/' + n + '-' + tag.replace(/ /g, '-') + '.png' });
  // State text (the long form of casoraStateFit), place and highlight of a tile added above.
  const TILE = (c) => { const b = document.querySelector('home-assistant').shadowRoot.querySelector('.' + c);
    const sr = b && b.shadowRoot, r = b.getBoundingClientRect();
    if (!sr || !sr.querySelector('ha-card')) return null;
    const st = sr.querySelector('#state');
    const sf = st && st.querySelector('.sf-s');
    return { state: ((st || {}).textContent || '').replace(sf ? sf.textContent : '\u0000', '').trim(), x: r.x + r.width * 0.7, y: r.y + r.height * 0.75,
      active: getComputedStyle(sr.querySelector('ha-card')).getPropertyValue('--casora-active-overlay-opacity').trim() === '1' }; };
  const tile = (cls) => page.evaluate(TILE, cls);
  const tap = async (at) => { if (view.mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y); };
  // Centre of the first visible element in the open popup matching sel (and text), scrolled into view.
  const spot = async (sel, re) => {
    const find = ([s, r]) => { const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
      return pop && window.__pierce(s, pop.shadowRoot).find((n) => n.getBoundingClientRect().height > 0 && (!r || new RegExp(r).test(n.textContent))); };
    const ok = await page.evaluate(([s, r, f]) => { const el = new Function('a', 'return (' + f + ')(a)')([s, r]); if (el) el.scrollIntoView({ block: 'center' }); return !!el; }, [sel, re || '', find.toString()]);
    if (!ok) return null;
    await page.waitForTimeout(400);
    return page.evaluate(([s, r, f]) => { const el = new Function('a', 'return (' + f + ')(a)')([s, r]); const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, [sel, re || '', find.toString()]);
  };
  const info = (until, max = 12000) => stable(page, POPUP, null, { max, quiet: 900, until });
  // Service calls are caught in the browser: nothing in the house changes.
  await page.evaluate(() => {
    const ha = document.querySelector('home-assistant');
    window.__qaCalls = [];
    const stub = (d, s, data, target) => { window.__qaCalls.push([d, s, data || {}, target || {}]); return Promise.resolve(); };
    const put = () => { if (ha.hass && ha.hass.callService !== stub) ha.hass.callService = stub; };
    put(); setInterval(put, 50);
  });

  // ── Tile ──
  const want = onNow ? onNow + ' An' : members.length + ' Einstellungen';
  let t = await stable(page, TILE, 'qa-r350-list', { until: (v) => v && v.state === want });
  await check(tag + ': entity list tile says „' + want + '“', t && t.state === want, t);
  await check(tag + ': highlighted exactly when a switch is on', t && t.active === (onNow > 0), t);
  const m = await tile('qa-r350-more');
  await check(tag + ': Mehr tile says „1 Liste · 1 Diagramm“', /^1 Liste · 1 Diagramm/.test(m.state), m.state);

  // ── Entity list popup ──
  await tap(t);
  let p = await info((v) => v && v.rows === members.length);
  await need(tag + ': popup opens with one row per entry', p && p.rows === members.length, p);
  await check(tag + (view.mobile ? ': one column on the phone' : ': two columns on the desktop'), p.cols === (view.mobile ? 1 : 2), p.cols);
  await check(tag + ': heading „Schalter“ before its entry', p.labels.includes('Schalter'), p.labels);
  await check(tag + ': controls – 2 switches, 2 time fields, − / +, a choice field',
    p.switches === 2 && p.times === 2 && p.steps === 2 && p.selects === 1, p);
  await shot('1-liste');
  // Time: a tap on the field keeps the popup open; a new time goes to time.set_value.
  const tp = await spot('[data-casora-elpill]');
  await tap(tp);
  await page.waitForTimeout(800);
  if (!view.mobile) await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  const stillOpen = await page.evaluate(() => !!window.__pierce('casora-popup').find((x) => x.hasAttribute('open')));
  if (view.mobile) await check(tag + ': tapping the time keeps the popup open', stillOpen, stillOpen);
  if (!stillOpen) { await tap(t); await info((v) => v && v.rows === members.length); }
  await page.evaluate((id) => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const el = window.__pierce('input[data-casora-el="' + id + '"]', pop.shadowRoot)[0];
    el.value = '07:45'; el.dispatchEvent(new Event('change')); }, E.times[0]);
  let calls = await page.evaluate(() => window.__qaCalls.slice());
  await check(tag + ': new time → time.set_value 07:45:00', calls.some((c) => c[0] === 'time' && c[1] === 'set_value' && c[2].time === '07:45:00'
    && c[3].entity_id === E.times[0]), calls);
  // A switch row toggles its helper.
  const b0 = await page.evaluate((id) => { const s = document.querySelector('home-assistant').hass.states[id];
    return String((s.attributes || {}).friendly_name || id).replace(/^\d{1,3}\s*[-–.:)]\s*/, ''); }, E.bools[0]);
  const sw = await spot('.hui-srow', '^' + b0.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  await tap(sw);
  await page.waitForTimeout(700);
  calls = await page.evaluate(() => window.__qaCalls.slice());
  await check(tag + ': tapping a switch row toggles it', calls.some((c) => c[0] === 'homeassistant' && c[1] === 'toggle' && c[3].entity_id === E.bools[0]), calls);
  await page.evaluate(() => window.casoraPopup.close());
  await page.waitForTimeout(900);

  // ── Mehr ──
  await tap(m);
  p = await info((v) => v && v.rows === 2);
  await need(tag + ': Mehr opens with a list and a chart', p && p.rows === 2, p);
  await check(tag + ': list row with its count', p.text.some((x) => /^QA Liste/.test(x) && /Einstellungen/.test(x)), p.text);
  await shot('2-mehr');
  await tap(await spot('.hui-srow', '^QA Liste'));
  p = await info((v) => v && v.back && v.rows === members.length);
  await check(tag + ': the list opens in the same popup with ‹', p && p.back && p.title === 'QA Liste' && p.rows === members.length, p);
  await shot('3-unterseite');
  await tap(await page.evaluate(() => { const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
    const b = pop.shadowRoot.querySelector('.header-back').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }));
  p = await info((v) => v && !v.back && v.rows === 2);
  await check(tag + ': ‹ returns to Mehr', p && !p.back && p.rows === 2 && p.title === 'Mehr', p);
  await tap(await spot('.hui-srow', '^Temperatur'));
  p = await info((v) => v && v.back && v.chart);
  await check(tag + ': the chart opens with ‹', p && p.back && p.chart && p.title === 'Temperatur', p);
  await page.evaluate(() => window.casoraPopup.close());
  await page.context().browser().close();
};

await run({ width: 1440, height: 900, scale: 1 });
await run({ width: 390, height: 844, mobile: true, safari: true, scale: 2 });
await finish();
