// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/02-devices.js
// Owner (03.11.2026, 26.11.9): the tank popup's light channels were saturated gradient pills („sehen billig aus“);
// now one list with a slim track per channel (design A, handbook §6.1). A tank with a dosing pump (Studio dosing_*)
// showed no dosing at all in the v3 popup – v3 had lost the row of v2. Now: one row „Dosierung“ (warning below 20 %
// container or under 7 days left), a sub page with a short line per channel, and a channel page with the dose volume
// (± and quick picks) and „Jetzt dosieren“ behind a confirm. A tank without a pump stays as it was.
// Water temperature (owner's history, 03.11.2026): a probe stepping between two values 0.2 °C apart every 10–15 min,
// with short unavailable gaps, drew a zigzag over the whole chart height – the v3 tank set its chart again without the
// hourly means of the other temperature charts, on a 0.4 °C scale. Now hourly means and at least 2 °C of scale.
// Tiles mounted in the browser (made-up tank variables over the test house's aquarium mock), extra pump sensors faked
// in the browser (qa_ ids), service calls caught – nothing is switched in HA. Desktop 1440 and phone 393.
import { open, casoraDashboards, dashboard, check, need, finish, fakeStates, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const P = 'testdosierpumpe_pumpe_';
const btn = [1, 2, 3, 4].map((n) => `button.${P}${n}_dosieren`);
const by = (to, end) => Object.fromEntries(btn.map((b) => [b, b.replace('button.', to + '.').replace('_dosieren', end)]));
const qa = (end) => Object.fromEntries(btn.map((b, i) => [b, `sensor.qa_dosierer_${i + 1}_${end}`]));
const RIFF = { entity: 'sensor.testriff_temperatur_temperature', name: 'Testriff', variables: { tank_name: 'Testriff',
  light_entity: 'light.testriff_lampe_licht', light_reachable: 'binary_sensor.testriff_lampe_erreichbar' } };
const PUMP = { entity: 'sensor.testpflanzen_temperatur_temperature', name: 'Testpflanzenbecken', variables: { tank_name: 'Testpflanzenbecken',
  light_entity: 'light.testpflanzen_lampe_licht', devices: [{ entity: 'switch.testpflanzen_technik', label: 'Pumpe & Technik', icon: 'mdi:pump' }],
  dosing_buttons: btn, dosing_volume: by('number', '_dosiermenge'), dosing_today: by('sensor', '_heute'), dosing_total: by('sensor', '_gesamt'),
  dosing_remaining: qa('rest'), dosing_capacity: qa('groesse'), dosing_days_left: qa('tage'),
  dosing_names: Object.fromEntries(btn.map((b, i) => [b, ['Calcium', 'Magnesium', 'Spurenelemente', 'Dünger'][i]])) } };
const NOPUMP = { entity: PUMP.entity, name: PUMP.name, variables: { tank_name: 'Testpflanzenbecken', light_entity: 'light.testpflanzen_lampe_licht',
  devices: PUMP.variables.devices } };
const pump = (rest, days) => Object.fromEntries([1, 2, 3, 4].flatMap((n, i) => [
  [`sensor.qa_dosierer_${n}_rest`, { state: String(rest[i]), attributes: { unit_of_measurement: 'mL' } }],
  [`sensor.qa_dosierer_${n}_groesse`, { state: '500', attributes: { unit_of_measurement: 'mL' } }],
  [`sensor.qa_dosierer_${n}_tage`, { state: String(days[i]), attributes: { unit_of_measurement: 'd' } }]]));

const mount = (pg, t) => pg.evaluate(async (t) => {
  const ha = document.querySelector('home-assistant');
  const conn = ha.hass.connection;
  if (!conn.__qaSend) {
    conn.__qaSend = conn.sendMessagePromise.bind(conn);
    conn.sendMessagePromise = (m) => {
      if (m && m.type === 'call_service') { window.__qaCalls.push({ domain: m.domain, service: m.service, data: m.service_data || {}, target: m.target || {} }); return Promise.resolve({}); }
      return conn.__qaSend(m);
    };
  }
  window.__qaCalls = [];
  if (window.casoraPopup) window.casoraPopup.close();
  if (window.__qaTile) window.__qaTile.remove();
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_aquarium_tank', entity: t.entity, name: t.name, variables: t.variables });
  el.hass = ha.hass; document.body.appendChild(el); window.__qaTile = el;
  await new Promise((r) => setTimeout(r, 1000));
  el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
    if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
  el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  return true;
}, t);
const waitPopup = async (pg) => { for (let i = 0; i < 40; i++) { if (await pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface))) break; await pg.waitForTimeout(250); } await pg.waitForTimeout(1800); };
const rows = (pg) => pg.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return [];
  return window.__pierce('.hui-row', s).filter((r) => r.getBoundingClientRect().width > 0).map((r) => ({ t: r.textContent.replace(/\s+/g, ' ').trim(), page: r.dataset.casoraPage || '' })); });
const tapRow = (pg, re) => pg.evaluate((src) => { const s = window.casoraPopup && window.casoraPopup.surface; const rx = new RegExp(src);
  const r = window.__pierce('.hui-row', s).find((x) => x.getBoundingClientRect().width > 0 && rx.test(x.textContent.replace(/\s+/g, ' ')));
  if (!r) return false; r.scrollIntoView({ block: 'center' }); r.click(); return true; }, re.source);

for (const [label, size] of [['Desktop', { width: 1440, height: 900 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, desk.url);
  await fakeStates(page, { 'number.testriff_lampe_purple': { state: '0' }, 'number.testriff_lampe_cold_white': { state: '20' },
    ...pump([420, 310, 400, 300], [61, 44, 30, 37]) }, { sticky: true });

  // 1) Channels: one list, a slider line per channel, no gradient pill; dragging sets the channel.
  await mount(page, RIFF); await waitPopup(page);
  const ch = await page.evaluate(() => { const s = window.casoraPopup.surface;
    const lines = window.__pierce('.aq-cr', s).filter((e) => e.getBoundingClientRect().width > 0);
    const fills = window.__pierce('.aq-cr .hui-sl-fill', s).map((f) => getComputedStyle(f).backgroundImage);
    const pills = window.__pierce('.hui-sl', s).filter((e) => e.getBoundingClientRect().width > 0).length;
    const knob = lines[0] ? getComputedStyle(window.__pierce('.hui-sl-fill', lines[0])[0] || lines[0].querySelector('.hui-sl-fill'), '::after').width : null;
    return { n: lines.length, names: lines.map((l) => l.textContent.replace(/\s+/g, ' ').trim()), grad: fills.filter((b) => b && b !== 'none').length, pills, knob }; });
  await check(label + ': fünf Kanäle als Liste mit Spur (kein Verlauf, keine Pillen)', ch.n === 5 && ch.grad === 0 && ch.pills === 0 && ch.knob === '16px', ch);
  await check(label + ': Kanal bei 0 % steht da („UV 0 %“)', ch.names.some((t) => /UV|Violett/.test(t) && /0\s*%/.test(t)), ch.names);
  const box = await page.evaluate(() => { const l = window.__pierce('.aq-cr', window.casoraPopup.surface).filter((e) => e.getBoundingClientRect().width > 0)[0];
    l.scrollIntoView({ block: 'center' }); const r = l.getBoundingClientRect(); return { x: r.x, y: r.y + r.height - 12, w: r.width }; });
  await page.mouse.move(box.x + box.w * 0.9, box.y); await page.mouse.down();
  await page.mouse.move(box.x + box.w * 0.5, box.y, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(900);
  const set = await page.evaluate(() => window.__qaCalls.filter((c) => c.domain === 'number' && c.service === 'set_value'));
  await check(label + ': Ziehen stellt den Kanal (number.set_value um 50)', set.length >= 1 && Math.abs(Number(set[set.length - 1].data.value) - 50) <= 3, set);

  // 2) Dosing row: everything fine.
  await mount(page, PUMP); await waitPopup(page);
  let r = await rows(page);
  const okRow = r.find((x) => /^Dosierung/.test(x.t));
  await check(label + ': Becken mit Pumpe zeigt „Dosierung · 4 Kanäle · alles in Ordnung“', !!okRow && /4 Kanäle · alles in Ordnung/.test(okRow.t) && /heute 4,5 ml/.test(okRow.t) && /^aqDose\|/.test(okRow.page), r.map((x) => x.t));
  // Warning: a container below 20 % and one channel with 3 days left – the channel with the fewest days is named.
  await fakeStates(page, pump([420, 99, 400, 300], [61, 44, 3, 37]), { sticky: true });
  r = await rows(page);
  const warn = r.find((x) => /^Dosierung/.test(x.t));
  const tone = await page.evaluate(() => { const row = window.__pierce('.hui-row', window.casoraPopup.surface).find((x) => /^\s*Dosierung/.test(x.textContent));
    const sub = row && [...row.querySelectorAll('div')].find((d) => /reicht noch/.test(d.textContent) && d.children.length === 0);
    return sub ? getComputedStyle(sub).color : null; });
  await check(label + ': Warnung nennt den dringendsten Kanal („Spurenelemente reicht noch 3 T.“) im Warnton', !!warn && /Spurenelemente reicht noch 3 T\./.test(warn.t) && !!tone && tone !== 'rgb(0, 0, 0)', { row: warn && warn.t, tone });

  // 3) Sub page: one row per channel with the short line and a container bar; then a channel page.
  await check(label + ': Zeile öffnet die Unterseite', await tapRow(page, /^Dosierung/));
  await page.waitForTimeout(1800);
  r = await rows(page);
  const chans = r.filter((x) => /^aqDoseCh\|/.test(x.page));
  await check(label + ': Unterseite „Dosierung“ mit vier Kanälen und kurzer Zeile', chans.length === 4 && chans.some((x) => /Calcium.*heute 1,5 ml · noch 61 T\./.test(x.t)) && chans.every((x) => x.t.length < 60), chans.map((x) => x.t));
  await check(label + ': Kanal öffnet seine Seite', await tapRow(page, /Calcium/));
  await page.waitForTimeout(1800);
  const chPage = await page.evaluate(() => { const s = window.casoraPopup.surface;
    const text = window.__pierce('.hui-row, .hui-slbl', s).filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent).join(' | ').replace(/\s+/g, ' ');
    return { text, segs: window.__pierce('.hui-sg', s).map((e) => e.textContent.trim()) }; });
  await check(label + ': Kanalseite mit Behälter, Reicht noch, Dosiermenge ± und Schnellwahl', /Behälter/.test(chPage.text) && /noch 420,0 von 500,0 ml/.test(chPage.text)
    && /Reicht noch/.test(chPage.text) && /Dosiermenge · 1,0 ml/.test(chPage.text) && ['−0,1', '+0,1', '−0,5', '+0,5'].every((x) => chPage.segs.includes(x)) && chPage.segs.includes('2,0 ml'), chPage);
  await page.evaluate(() => { window.__qaCalls = []; });
  const plus = await page.evaluate(() => { const b = window.__pierce('.hui-sg', window.casoraPopup.surface).find((e) => e.textContent.trim() === '+0,1'); if (!b) return false; b.click(); return true; });
  await page.waitForTimeout(700);
  const vol = await page.evaluate(() => window.__qaCalls.find((c) => c.domain === 'number'));
  await check(label + ': +0,1 setzt die Dosiermenge (1,0 → 1,1 ml)', plus && !!vol && Math.abs(Number(vol.data.value) - 1.1) < 0.01 && vol.target.entity_id === 'number.testdosierpumpe_pumpe_1_dosiermenge', vol);
  // „Jetzt dosieren“ asks first (the row arms its confirm button): nothing before it, the button press after it.
  await page.evaluate(() => { window.__qaCalls = []; });
  await tapRow(page, /Jetzt dosieren/);
  await page.waitForTimeout(700);
  const armed = await page.evaluate(() => { const r = window.__pierce('.hui-row', window.casoraPopup.surface).find((x) => /Jetzt dosieren/.test(x.textContent));
    const cf = r && r.querySelector('.hui-cf');
    return { armed: !!r && r.classList.contains('armed'), cf: cf ? cf.textContent.replace(/\s+/g, ' ').trim() : null, calls: window.__qaCalls.length }; });
  await page.evaluate(() => { const r = window.__pierce('.hui-row', window.casoraPopup.surface).find((x) => /Jetzt dosieren/.test(x.textContent));
    const cf = r && r.querySelector('.hui-cf'); if (cf) cf.click(); });
  await page.waitForTimeout(900);
  const dosed = await page.evaluate(() => window.__qaCalls.filter((c) => c.domain === 'button'));
  await check(label + ': „Jetzt dosieren“ fragt („1,0 ml dosieren“) und drückt dann den Knopf', armed.armed && /1,0 ml dosieren/.test(String(armed.cf)) && armed.calls === 0
    && dosed.length === 1 && dosed[0].target.entity_id === btn[0], { armed, dosed });

  // 5) Water temperature chart: hourly means and at least 2 °C of scale – a 0.2 °C toggle with gaps draws calm.
  await mount(page, RIFF); await waitPopup(page);
  for (let i = 0; i < 30; i++) { if (await page.evaluate(() => !!window.__pierce('casora-chart', window.casoraPopup.surface)[0])) break; await page.waitForTimeout(250); }
  const chart = await page.evaluate(async (eid) => {
    const el = window.__pierce('casora-chart', window.casoraPopup.surface)[0];
    if (!el) return null;
    const now = Date.now(), pts = [];
    for (let t = now - 24 * 36e5, k = 0; t < now; t += 12 * 6e4, k++) pts.push([t, k % 17 === 5 ? 'unavailable' : k % 23 === 9 ? 'unknown' : (k % 2 ? '25.3' : '25.1')]);
    el._data = { raw: { [eid]: pts }, src: 'history' };
    el._draw(); // measured right away: a hass update may fetch the real history again
    const svg = el.shadowRoot.querySelector('svg');
    const line = [...el.shadowRoot.querySelectorAll('path')].find((p) => getComputedStyle(p).fill === 'none' && parseFloat(getComputedStyle(p).strokeWidth) >= 1.5);
    const ys = line ? (line.getAttribute('d').match(/-?\d+(\.\d+)?/g) || []).map(Number).filter((v, i) => i % 2 === 1) : [];
    const h = svg ? svg.getBoundingClientRect().height : 0;
    let turns = 0; for (let i = 2; i < ys.length; i++) if ((ys[i] - ys[i - 1]) * (ys[i - 1] - ys[i - 2]) < 0) turns++;
    return { bucket: el._c && el._c.bucket, span: el._c && el._c.y && el._c.y.span, swing: ys.length ? (Math.max(...ys) - Math.min(...ys)) / h : null, turns, n: ys.length };
  }, RIFF.entity);
  await check(label + ': Wassertemperatur mit Stundenmitteln und mindestens 2 °C Skala (25,1 ↔ 25,3 °C ruhig, Lücken ohne Absturz)',
    !!chart && chart.bucket === '1h' && chart.span === 2 && chart.swing != null && chart.swing < 0.2 && chart.turns <= 8, chart);

  // 4) Without a pump: no dosing row, the right column as before.
  await mount(page, NOPUMP); await waitPopup(page);
  r = await rows(page);
  await check(label + ': Becken ohne Pumpe ohne „Dosierung“', !r.some((x) => /Dosierung/.test(x.t) || /^aqDose/.test(x.page)) && r.some((x) => /Pumpe & Technik/.test(x.t)), r.map((x) => x.t));
  await page.context().close();
}
await finish();
