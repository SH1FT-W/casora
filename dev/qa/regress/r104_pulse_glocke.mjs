// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/14-pulse.js
// Neu (09.10.2026, Casora 1.2.x): Pulse in der Glocke. Das Testhaus hat kein Pulse – Pulse-Entitäten werden
// im Browser künstlich eingespielt (wie r101; Registry mit platform 'pulse' + translation_key, alles erfunden).
// Erwartet am Desktop und Handy (hell + dunkel, Theme Casora):
//   - Probleme (prüfen/ausgefallen) stehen in der Glocke: „Rauchmelder Dachboden antwortet nicht“,
//     „Fenster Atelier braucht eine neue Batterie“; „bald fällig“ nicht
//   - keine Doppelmeldung: die Akku-Zeile lässt das von Pulse gemeldete Gerät aus, nennt aber den
//     Akku, den Pulse nur als „bald fällig“ führt
//   - Tipp auf einen Pulse-Eintrag öffnet das Pulse-Popup
//   - Schalter aus (notify_pulse): keine Pulse-Einträge, die Akku-Zeile nennt das Gerät wieder
//   - Studio › Dashboard › Benachrichtigungen: Schalter „Pulse“ (an) nur mit Pulse
// Bilder fürs Ergebnis: CASORA_PULSE_BILDER=<ordner>.
import fs from 'node:fs';
import { open, usePage, studio, casoraDashboards, dashboard, check, need, finish, atFinish, stable } from './lib.mjs';
import { ws } from '../ws.mjs';

const BILDER = process.env.CASORA_PULSE_BILDER || '';
if (BILDER) fs.mkdirSync(BILDER, { recursive: true });

// ── Prüf-Dashboards: Kopie mit Pulse-Kachel (wie r101) ──
const ANCHOR = ['casora_recipe', 'casora_battery'];
const tplOf = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? [].concat(x.template || []) : []);
const has = (d) => (d.config.views || []).some((v) => ANCHOR.some((a) => JSON.stringify(v).includes('"' + a + '"')));
const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && has(d));
const phone = all.find((d) => d.mobile && has(d));
await need('Dashboards mit Rezept- oder Batterien-Kachel', desk && phone, all.map((d) => d.url));

const PROBLEMS = 'sensor.pulse_qa_probleme';
const withPulse = (cfg) => {
  const c = JSON.parse(JSON.stringify(cfg));
  let done = false;
  (function walk(x) {
    if (done || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length && !done; i++) {
        if (tplOf(x[i]).some((t) => ANCHOR.includes(t))) {
          const card = JSON.parse(JSON.stringify(x[i]));
          card.template = 'casora_pulse'; card.entity = PROBLEMS; card.name = 'Pulse';
          card.variables = { icon: 'pulse' };
          x.splice(i + 1, 0, card);
          done = true;
          return;
        }
        walk(x[i]);
      }
      return;
    }
    Object.keys(x).forEach((k) => walk(x[k]));
  })(c.views);
  return { config: c, view: c.views[0].path || 0, done };
};
const c = await ws();
const made = [];
const save = async (url, cfg, title) => {
  const list = await c.cmd({ type: 'lovelace/dashboards/list' });
  if (!list.some((d) => d.url_path === url)) {
    await c.cmd({ type: 'lovelace/dashboards/create', url_path: url, title, mode: 'storage', show_in_sidebar: false, require_admin: false });
  }
  await c.cmd({ type: 'lovelace/config/save', url_path: url, config: cfg });
  made.push(url);
};
const D = withPulse(desk.config), M = withPulse(phone.config);
await need('Pulse-Kachel eingesetzt', D.done && M.done);
await save('qa-pglocke', D.config, 'QA Pulse Glocke');
await save('qa-pglocke-mobile', M.config, 'QA Pulse Glocke Handy');
atFinish(async () => {
  const c2 = await ws();
  const list = await c2.cmd({ type: 'lovelace/dashboards/list' });
  for (const u of made) { const d = list.find((x) => x.url_path === u); if (d) await c2.cmd({ type: 'lovelace/dashboards/delete', dashboard_id: d.id }); }
  c2.close();
});
c.close();

// ── Künstliches Pulse ──
const NOW = Date.now();
const iso = (h) => new Date(NOW - h * 3600000).toISOString();
const DEV = [
  // [id, Name, Status, reason_key, Stille seit (Std.), kritisch, Batterie %]
  ['qa_g1', 'Rauchmelder Dachboden', 'failed', 'silent', 50, true, 80],
  ['qa_g2', 'Fenster Atelier', 'check', 'battery_low', null, false, 7],
  ['qa_g3', 'Thermometer Wintergarten', 'watch', 'battery_soon', null, false, 12],
  ['qa_g4', 'Tür Geräteschuppen', 'ok', 'ok_rhythm', null, false, 64],
];
const scenario = () => {
  const entities = {}, devices = {}, states = {};
  const put = (id, platform, key, dev, state, attributes, since) => {
    entities[id] = { entity_id: id, platform, translation_key: key, device_id: dev, area_id: null, labels: [],
      entity_category: platform === 'pulse' && key !== 'problems' && key !== 'monitored' ? 'diagnostic' : null };
    const t = since || new Date().toISOString();
    states[id] = { entity_id: id, state, attributes: attributes || {}, context: { id: 'qa' }, last_changed: t, last_updated: t };
  };
  DEV.forEach(([id, name, st, rk, since, crit, bat]) => {
    devices[id] = { id, name, name_by_user: null, area_id: null, entry_type: null, via_device_id: null, disabled_by: null };
    put('sensor.' + id + '_pulse_status', 'pulse', 'status', id, st, { device_class: 'enum', reason_key: rk,
      silent_since: since ? iso(since) : null, typical_interval: since ? 4 * 3600 : null, critical: crit, snoozed_until: null }, iso(3));
    put('binary_sensor.' + id + '_pulse_problem', 'pulse', 'problem', id, st === 'check' || st === 'failed' ? 'on' : 'off', { device_class: 'problem' });
    // Akku seit Stunden so (Haltezeit der Akku-Quelle ist vorbei).
    put('sensor.' + id + '_batterie', 'qa_mock', null, id, String(bat), { device_class: 'battery', unit_of_measurement: '%', friendly_name: name + ' Batterie' }, iso(5));
  });
  devices.qa_pulse_hub = { id: 'qa_pulse_hub', name: 'Pulse', entry_type: 'service', area_id: null };
  put(PROBLEMS, 'pulse', 'problems', 'qa_pulse_hub', '2', { devices: [], unit_of_measurement: 'Geräte' });
  put('sensor.pulse_qa_ueberwacht', 'pulse', 'monitored', 'qa_pulse_hub', String(DEV.length), { unit_of_measurement: 'Geräte' });
  return { entities, devices, states };
};
const inject = (pg) => pg.evaluate((sc) => {
  const ha = document.querySelector('home-assistant');
  const merge = (obj) => {
    if (!obj) return obj;
    const o = { ...obj };
    if (obj.entities) o.entities = { ...obj.entities, ...sc.entities };
    if (obj.devices) o.devices = { ...obj.devices, ...sc.devices };
    if (obj.states) o.states = { ...obj.states, ...sc.states };
    return o;
  };
  const orig = ha.__qaPulseOrig || ha._updateHass;
  ha.__qaPulseOrig = orig;
  ha._updateHass = function (obj) { return orig.call(this, merge(obj)); };
  const h = ha.hass;
  orig.call(ha, merge({ entities: h.entities, devices: h.devices, states: h.states }));
}, scenario());

const ROWS = () => (window._casoraNotify ? window._casoraNotify.rows : []).map((r) => ({ id: r.id, label: r.label,
  keys: (r.seen || []).map((x) => (x && typeof x === 'object' ? x.k : x)) }));
const refresh = (pg) => pg.evaluate(() => window._casoraNotify && window._casoraNotify.refresh());
const BELL = () => { const r = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top < 200);
  return r && { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const MENU = () => window.__pierce('.casora-notify-menu .hui-srow').filter((r) => r.getBoundingClientRect().height > 0)
  .map((r) => r.textContent.replace(/\s+/g, ' ').trim());

const VIEWS = [
  ['Desktop hell', { width: 1440, height: 1000, scale: 1, dark: false }, 'qa-pglocke', D.view, false],
  ['Desktop dunkel', { width: 1440, height: 1000, scale: 1, dark: true }, 'qa-pglocke', D.view, false],
  ['Handy hell', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false }, 'qa-pglocke-mobile', M.view, true],
  ['Handy dunkel', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true }, 'qa-pglocke-mobile', M.view, true],
];
for (const [tag, o, url, view, mobile] of VIEWS) {
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await dashboard(page, url + '/' + view, 3);
  const file = (n) => BILDER + '/glocke-' + tag.toLowerCase().replace(/\s+/g, '-') + '-' + n + '.png';
  await inject(page);
  await refresh(page);
  const rows = await stable(page, ROWS);
  const pulse = rows.filter((r) => /^casora:pulse/.test(r.id)).map((r) => r.label).sort();
  await check(tag + ': Pulse-Probleme in der Glocke', JSON.stringify(pulse) === JSON.stringify(['Fenster Atelier braucht eine neue Batterie', 'Rauchmelder Dachboden antwortet nicht']), pulse);
  const bat = rows.find((r) => r.id === 'casora:battery');
  await check(tag + ': Akku-Zeile ohne das von Pulse gemeldete Gerät', bat && !bat.keys.includes('sensor.qa_g2_batterie') && bat.keys.includes('sensor.qa_g3_batterie'), bat);

  // Glocke öffnen.
  const at = await page.evaluate(BELL);
  await need(tag + ': Glocke gefunden', at);
  if (mobile) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(1300);
  const shown = await stable(page, MENU);
  await check(tag + ': offene Glocke zeigt beide Pulse-Einträge', shown.some((t) => /Rauchmelder Dachboden antwortet nicht/.test(t)) && shown.some((t) => /Fenster Atelier braucht eine neue Batterie/.test(t)), shown);
  await check(tag + ': „bald fällig“ nicht in der Glocke', !shown.some((t) => /Thermometer Wintergarten braucht/.test(t)), shown);
  if (BILDER) await page.screenshot({ path: file('offen') });

  // Tipp auf einen Pulse-Eintrag → Pulse-Popup.
  if (/hell/.test(tag)) {
    const row = await page.evaluate(() => {
      const r = window.__pierce('.casora-notify-menu .hui-srow').find((x) => /Rauchmelder Dachboden/.test(x.textContent) && x.getBoundingClientRect().height > 0);
      if (!r) return null;
      const q = r.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    });
    await need(tag + ': Pulse-Eintrag sichtbar', row);
    if (mobile) await page.touchscreen.tap(row.x, row.y); else await page.mouse.click(row.x, row.y);
    let pop = null;
    for (let w = 0; w < 30 && !(pop && pop.open && pop.prob); w++) {
      await page.waitForTimeout(250);
      pop = await page.evaluate(() => ({ open: !!(window.casoraPopup && window.casoraPopup.surface),
        prob: window.__pierce('.hui-slbl').some((n) => /Aufmerksamkeit/.test(n.textContent)) }));
    }
    await check(tag + ': Tipp öffnet das Pulse-Popup', pop && pop.open && pop.prob, pop);
    if (BILDER) await page.screenshot({ path: file('popup') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  }

  // Schalter aus (wie notify_pulse: false im Dashboard).
  if (tag === 'Desktop hell') {
    await page.evaluate(() => window._casoraNotify.configure({ types: Object.assign({}, window.CASORA_NOTIFY_TYPES || {}, { pulse: false }) }));
    await refresh(page);
    const off = await stable(page, ROWS);
    const b2 = off.find((r) => r.id === 'casora:battery');
    await check('Pulse aus: keine Pulse-Einträge', !off.some((r) => /^casora:pulse/.test(r.id)), off.map((r) => r.label));
    await check('Pulse aus: Akku-Zeile nennt das Gerät wieder', b2 && b2.keys.includes('sensor.qa_g2_batterie'), b2);
  }
  await page.context().browser().close().catch(() => {});
}

// ── Studio: Schalter „Pulse“ unter Benachrichtigungen ──
const STUDIO = [
  ['Studio Desktop hell', { width: 1440, height: 1000, dark: false }],
  ['Studio Desktop dunkel', { width: 1440, height: 1000, dark: true }],
  ['Studio Handy hell', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false }],
  ['Studio Handy dunkel', { width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: true }],
];
const SW = () => {
  const root = window.__panel().shadowRoot;
  const t = [...root.querySelectorAll('label.swlabel')].find((e) => e.textContent.trim() === 'Pulse' && e.getClientRects().length);
  if (!t) return null;
  let row = t.parentElement;
  for (let i = 0; i < 3 && row && !row.querySelector('input[type=checkbox], [role=switch], ha-switch'); i++) row = row.parentElement;
  const sw = row && row.querySelector('input[type=checkbox], [role=switch], ha-switch');
  t.scrollIntoView({ block: 'center' });
  return { on: sw ? !!(sw.checked || sw.getAttribute('aria-checked') === 'true') : null, html: sw ? null : (row || t).outerHTML.slice(0, 400) };
};
const openNotify = async (page, mobile) => {
  if (mobile) {
    // Handy-Studio: Abschnitte als Liste, „Benachrichtigungen“ antippen klappt ihn auf.
    const at = await page.evaluate(() => {
      const c = window.__panel().shadowRoot.querySelector('section[data-k="Notifications"] .chead');
      if (!c) return null;
      c.scrollIntoView({ block: 'center' });
      const q = c.getBoundingClientRect();
      return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
    });
    if (at) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(1500); }
    return;
  }
  const btn = page.locator('.btool[data-b=dash]');
  if (await btn.count() && await btn.first().isVisible()) {
    await btn.first().click();
    await page.waitForTimeout(600);
    await page.locator('.combo-opt', { hasText: 'Benachrichtigungen' }).first().click();
  }
  await page.waitForTimeout(1500);
};
for (const [tag, o] of STUDIO) {
  const mobile = !!o.mobile;
  const { page } = await open({ ...o, theme: 'Casora' });
  usePage(page);
  await studio(page, desk.url);
  if (tag === 'Studio Desktop hell') {
    await openNotify(page, mobile);
    const none = await page.evaluate(SW);
    await check(tag + ': ohne Pulse kein Schalter „Pulse“', !none, none);
    await page.evaluate(() => window.__panel()._bClose && window.__panel()._bClose());
    await page.waitForTimeout(600);
  }
  await inject(page);
  await page.waitForTimeout(600);
  await openNotify(page, mobile);
  const sw = await page.evaluate(SW);
  await check(tag + ': Schalter „Pulse“ sichtbar, Standard an', sw && sw.on === true, sw);
  if (BILDER) { await page.waitForTimeout(500); await page.screenshot({ path: BILDER + '/' + tag.toLowerCase().replace(/\s+/g, '-') + '.png' }); }
  await page.context().browser().close().catch(() => {});
}
await finish();
