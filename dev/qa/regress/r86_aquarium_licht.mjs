// @zustand: arbeit
// @parallel: ui
// Neu (08.10.2026, 1.1.2, Entscheidungen zur Aquarium-Sichtung): Das Becken-Popup bedient das Licht selbst –
// An/Aus, Helligkeit, je Farbkanal ein Regler (number-Entitäten der Lampe bzw. rgbw der Leuchte) und die
// eigenen Modi/Profile der Lampe zum Antippen; kein Sprung mehr ins allgemeine Licht-Popup, keine eigenen
// Farbvorgaben. Der Zeitplan-Schalter markiert je nach Lampe die richtige Zeile (HeliaLux „manuelle
// Farbsimulation“ an = Home Assistant, Chihiros „Auto-Modus“ an = Programm der Lampe). Die Kachel zeigt die
// Wassertemperatur vorn und warnt aus dem Soll-Bereich (temp_min/temp_max).
// Testbecken A/B aus dev/casora_mock/aquarium.py; die Kacheln entstehen nur im Browser, Dienstaufrufe werden
// abgefangen (nichts wird in HA geschaltet).
import { open, casoraDashboards, dashboard, check, need, finish, fakeStates } from './lib.mjs';

const A = { entity: 'sensor.testbecken_a_wassertemperatur', name: 'Testbecken A', variables: { tank_name: 'Testbecken A',
  light_entity: 'light.testbecken_a_lampe', light_schedule_switch: 'switch.testbecken_a_manuelle_farbsimulation',
  light_profile: 'select.testbecken_a_profil', temp_min: 24, temp_max: 26,
  light_presets: [{ label: 'Tag', rgbw: [140, 76, 102, 178] }] } };
const B = { entity: 'sensor.testbecken_b_wassertemperatur', name: 'Testbecken B', variables: { tank_name: 'Testbecken B',
  light_entity: 'light.testbecken_b_lampe', light_schedule_switch: 'switch.testbecken_b_auto_modus',
  light_profile: 'select.testbecken_b_modus', temp_min: 24, temp_max: 26 } };

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
const phone = all.find((d) => d.mobile && d.url === (desk && desk.url) + '-mobile') || all.find((d) => d.mobile);
await need('Casora-Dashboards (Desktop + Handy)', desk && phone, all.map((d) => d.url));

// Kachel im Browser anlegen (über die erste sichtbare Kachel der Ansicht); Dienstaufrufe abfangen.
const mount = (pg, t) => pg.evaluate(async (t) => {
  const ha = document.querySelector('home-assistant');
  const conn = ha.hass.connection;
  if (!conn.__qaSend) {
    conn.__qaSend = conn.sendMessagePromise.bind(conn);
    window.__qaCalls = [];
    conn.sendMessagePromise = (m) => {
      if (m && m.type === 'call_service') { window.__qaCalls.push({ domain: m.domain, service: m.service, data: m.service_data || {}, target: m.target || {} }); return Promise.resolve({}); }
      return conn.__qaSend(m);
    };
  }
  if (window.__qaTile) { window.__qaTile.remove(); window.__qaTile = null; }
  const old = window.__pierce('button-card').find((b) => { const r = b.getBoundingClientRect(); return r.width > 120 && r.width < 420 && r.height > 60 && r.top > 100; });
  const el = document.createElement('button-card');
  el.setConfig({ type: 'custom:button-card', template: 'casora_aquarium_tank', entity: t.entity, name: t.name, variables: t.variables });
  el.hass = ha.hass;
  if (old) old.parentNode.insertBefore(el, old); else document.body.appendChild(el);
  window.__qaTile = el;
  el.scrollIntoView({ block: 'center' });
  await new Promise((r) => setTimeout(r, 1200));
  return !!el.shadowRoot;
}, t);
const tileText = (pg) => pg.evaluate(async () => {
  const el = window.__qaTile; el.hass = document.querySelector('home-assistant').hass;
  await new Promise((r) => setTimeout(r, 600));
  const s = el.shadowRoot && el.shadowRoot.querySelector('#state');
  return s ? s.textContent.replace(/\s+/g, ' ').trim() : '';
});
const openPopup = async (pg) => {
  await pg.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => {
    const el = window.__qaTile;
    el.addEventListener('hass-action', (ev) => { const act = ev.detail && ev.detail.config && ev.detail.config.tap_action;
      if (act && act.casora_popup && window.casoraPopup) { ev.stopPropagation(); window.casoraPopup.open(act.casora_popup); } }, { capture: true, once: true });
    el._handleAction({ detail: { action: 'tap' } }, { isIcon: false });
  });
  for (let i = 0; i < 30; i++) {
    const ok = await pg.evaluate(() => !!(window.casoraPopup && window.casoraPopup.surface) && window.__pierce('.hui-sl', window.casoraPopup.surface).length > 0);
    if (ok) break;
    await pg.waitForTimeout(250);
  }
  await pg.waitForTimeout(800);
};
const popup = (pg) => pg.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const P = (q) => window.__pierce(q, s);
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  return {
    text: P('.hui-row, .hui-slbl, .aq-chip, .hui-sl-val').map((e) => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '),
    sliders: P('.hui-sl').map((e) => ({ label: e.dataset.casoraLabel || '', box: box(e) })),
    chips: P('.aq-chip').map((e) => ({ t: e.textContent.trim(), on: e.classList.contains('on'), h: e.getBoundingClientRect().height })),
    sel: P('.hui-row.fb-sel').map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
    jump: P('[data-aq-light]').length,
    title: (s.querySelector('.header-title') || {}).textContent || '',
    hero: P('div').some((e) => /Soll-Bereich 24–26 °C/.test(e.textContent || '')),
  };
});
const calls = (pg) => pg.evaluate(() => { const c = window.__qaCalls.slice(); window.__qaCalls.length = 0; return c; });
const tapText = async (pg, sel, text) => {
  const at = await pg.evaluate(({ sel, text }) => {
    const e = window.__pierce(sel, window.casoraPopup.surface).find((x) => x.textContent.replace(/\s+/g, ' ').trim().includes(text));
    if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, { sel, text });
  if (!at) return false;
  await pg.waitForTimeout(400);
  await pg.mouse.click(at.x, at.y);
  await pg.waitForTimeout(700);
  return true;
};
const drag = async (pg, label, frac) => {
  const b = await pg.evaluate((label) => {
    const e = window.__pierce('.hui-sl', window.casoraPopup.surface).find((x) => (x.dataset.casoraLabel || '') === label);
    if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, label);
  if (!b) return false;
  await pg.waitForTimeout(400);
  const y = b.y + b.h / 2;
  await pg.mouse.move(b.x + b.w * 0.5, y);
  await pg.mouse.down();
  await pg.mouse.move(b.x + b.w * frac, y, { steps: 4 });
  await pg.mouse.up();
  await pg.waitForTimeout(700);
  return true;
};

// ── Desktop ───────────────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 1440, height: 1000, scale: 1, dark: false, theme: 'Casora' });
  await dashboard(page, desk.url + '/0', 3);
  await need('Testbecken im Testhaus (Mock)', await page.evaluate(() => !!document.querySelector('home-assistant').hass.states['light.testbecken_b_lampe']));

  // Becken B: Fluval-/Chihiros-Muster.
  await need('Kachel B angelegt', await mount(page, B));
  let t = await tileText(page);
  await check('Kachel B: alles ok ohne Temperatur („Alles ok“)', /^Alles ok/.test(t), t);
  await fakeStates(page, { 'sensor.testbecken_b_wassertemperatur': { state: '26.8' } });
  t = await tileText(page);
  await check('Kachel B: über dem Soll-Bereich → „Prüfen · Temperatur zu hoch“', /^26,8° · Prüfen · Temperatur zu hoch/.test(t), t);
  await fakeStates(page, { 'sensor.testbecken_b_wassertemperatur': { state: '28.4' } });
  t = await tileText(page);
  await check('Kachel B: mehr als 2 °C daneben → Alarm', /^28,4° · Alarm · Temperatur zu hoch/.test(t), t);
  await fakeStates(page, { 'sensor.testbecken_b_wassertemperatur': { state: '23.5' } });
  t = await tileText(page);
  await check('Kachel B: unter dem Soll-Bereich → „Temperatur zu niedrig“', /Temperatur zu niedrig/.test(t), t);
  await fakeStates(page, { 'sensor.testbecken_b_wassertemperatur': { state: '25.9' } });
  await tileText(page);

  await openPopup(page);
  let p = await popup(page);
  await need('Becken-Popup B offen', p && p.sliders.length, p);
  await check('B: Kopf zeigt den Soll-Bereich („Soll-Bereich 24–26 °C“)', p.hero, p.text.slice(0, 200));
  const labels = p.sliders.map((s) => s.label);
  await check('B: Helligkeitsregler + 4 Kanalregler aus den number-Entitäten', p.sliders.length === 5
    && ['Rot', 'Grün', 'Blau', 'Weiß'].every((n) => labels.includes(n)), labels);
  const rot = p.sliders.find((s) => s.label === 'Rot'), gruen = p.sliders.find((s) => s.label === 'Grün');
  await check('B: Kanäle zweispaltig (Rot und Grün in einer Reihe)', rot && gruen && Math.abs(rot.box.y - gruen.box.y) < 2 && gruen.box.x > rot.box.x, { rot, gruen });
  await check('B: Lampen-Modi aus der effect_list (ohne „off“, mit „Ohne Effekt“)', ['Ohne Effekt', 'Sunrise', 'Clouds', 'Moonlight'].every((x) => p.chips.some((c) => c.t === x))
    && !p.chips.some((c) => c.t === 'off'), p.chips);
  await check('B: Profil-Optionen übersetzt (Manuell aktiv)', p.chips.some((c) => c.t === 'Manuell' && c.on) && !p.chips.some((c) => c.t === 'manual'), p.chips);
  await check('B: Felder mit Trefferfläche ≥ 44 px', p.chips.every((c) => c.h >= 44), p.chips.map((c) => c.h));
  await check('B: Auto-Modus an → „Programm der Lampe“ markiert', p.sel.length === 1 && /Programm der Lampe/.test(p.sel[0]), p.sel);
  await check('B: kein Sprung ins Licht-Popup, keine Zeile „Lichtsteuerung“', !p.jump && !/Lichtsteuerung/.test(p.text), p.jump);

  await calls(page);
  await tapText(page, '.aq-chip', 'Sunrise');
  let c = await calls(page);
  await check('B: Modus antippen → light.turn_on effect', c.some((x) => x.domain === 'light' && x.service === 'turn_on' && x.data.effect === 'Sunrise'
    && [].concat(x.target.entity_id)[0] === 'light.testbecken_b_lampe'), c);
  await tapText(page, '.aq-chip', 'Automatisch');
  c = await calls(page);
  await check('B: Profil antippen → select.select_option', c.some((x) => x.domain === 'select' && x.service === 'select_option' && x.data.option === 'automatic'), c);
  await drag(page, 'Rot', 0.2);
  c = await calls(page);
  const nv = c.find((x) => x.domain === 'number' && x.service === 'set_value');
  await check('B: Kanalregler Rot → number.set_value am Rot-Kanal (~20)', nv && [].concat(nv.target.entity_id)[0] === 'number.testbecken_b_kanal_red'
    && Math.abs(nv.data.value - 20) <= 3, c);
  await tapText(page, '.hui-row', 'Home Assistant');
  c = await calls(page);
  await check('B: „Home Assistant“ antippen schaltet den Auto-Modus aus', c.some((x) => x.domain === 'switch' && x.service === 'turn_off'
    && [].concat(x.target.entity_id)[0] === 'switch.testbecken_b_auto_modus'), c);
  p = await popup(page);
  await check('B: nach dem Bedienen weiter im Becken-Popup', p && /Testbecken B/.test(p.title + p.text) && p.sliders.length === 5, p && p.title);

  // Becken A: HeliaLux-Muster (RGBW-Leuchte, Schalter manuelle Farbsimulation an).
  await mount(page, A);
  t = await tileText(page);
  await check('Kachel A: „Alles ok“ ohne Temperatur', /^Alles ok/.test(t), t);
  await openPopup(page);
  p = await popup(page);
  await need('Becken-Popup A offen', p && p.sliders.length, p);
  await check('A: Kanalregler aus rgbw der Leuchte', ['Rot', 'Grün', 'Blau', 'Weiß'].every((n) => p.sliders.some((s) => s.label === n)), p.sliders.map((s) => s.label));
  await check('A: manuelle Farbsimulation an → „Home Assistant“ markiert', p.sel.length === 1 && /Home Assistant/.test(p.sel[0]), p.sel);
  await check('A: keine eigenen Farbvorgaben (light_presets) mehr', !/\b(Tag|Abend|Voll)\b/.test(p.text), p.text.slice(0, 300));
  await check('A: Profil ausgeblendet, solange Home Assistant steuert', !p.chips.some((c) => /Standard|Pflanzen/.test(c.t)), p.chips);
  await calls(page);
  await drag(page, 'Weiß', 0.5);
  c = await calls(page);
  const lw = c.find((x) => x.domain === 'light' && x.data.rgbw_color);
  await check('A: Weiß-Regler → light.turn_on rgbw_color, nur Kanal 4 geändert', lw && lw.data.rgbw_color.slice(0, 3).join() === '140,76,102'
    && Math.abs(lw.data.rgbw_color[3] - 128) <= 8, c);
  await drag(page, '', 0.3);
  c = await calls(page);
  await check('A: Helligkeitsregler → light.turn_on brightness_pct', c.some((x) => x.domain === 'light' && x.service === 'turn_on' && Math.abs((x.data.brightness_pct || 0) - 30) <= 3), c);
  await tapText(page, '.hui-row', 'Programm der Lampe');
  c = await calls(page);
  await check('A: „Programm der Lampe“ antippen schaltet die Farbsimulation aus', c.some((x) => x.domain === 'switch' && x.service === 'turn_off'
    && [].concat(x.target.entity_id)[0] === 'switch.testbecken_a_manuelle_farbsimulation'), c);
  // Studio-Wahl dreht die Bedeutung um.
  await mount(page, { ...A, variables: { ...A.variables, light_schedule_on: 'lamp' } });
  await openPopup(page);
  p = await popup(page);
  await check('A mit „an = Lampe“ aus dem Studio → „Programm der Lampe“ markiert', p && p.sel.length === 1 && /Programm der Lampe/.test(p.sel[0]), p && p.sel);
  await check('A mit „an = Lampe“ → Lampen-Profil übersetzt zum Antippen', p && p.chips.some((c) => c.t === 'Standard' && c.on) && p.chips.some((c) => c.t === 'Pflanzen'), p && p.chips);
  await page.evaluate(() => { if (window.casoraPopup) window.casoraPopup.close(); });
}

// ── Handy ─────────────────────────────────────────────────────────────────────
{
  const { page } = await open({ width: 393, height: 852, mobile: true, scale: 2, dark: true, theme: 'Casora' });
  await dashboard(page, phone.url + '/0', 3);
  await mount(page, B);
  const t = await tileText(page);
  await check('Handy: Kachel ohne Temperatur, wenn alles ok', /^Alles ok/.test(t), t);
  await openPopup(page);
  const p = await popup(page);
  await need('Handy: Becken-Popup offen', p && p.sliders.length, p);
  const r = p.sliders.find((s) => s.label === 'Rot'), g = p.sliders.find((s) => s.label === 'Grün');
  await check('Handy: Kanäle zweispaltig', r && g && Math.abs(r.box.y - g.box.y) < 2 && r.box.w < 200, { r, g });
  await check('Handy: Kanalregler im Fenster (nicht abgeschnitten)', p.sliders.every((s) => s.box.x >= 0 && s.box.x + s.box.w <= 393), p.sliders.map((s) => s.box));
}
await finish();
