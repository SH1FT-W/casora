// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/16-maeher.js dev/casora_mock/maeher.py
// Robot lawn mower with the top integrations (source table SOURCES in 16-maeher.js), at the three made-up mock mowers
// (dev/casora_mock/maeher.py): Gardena-like "Testmäher", Husqvarna-like "Rasenpilot", Landroid-like "Grasfuchs".
// For each: tile state, popup rows the integration has (and none it lacks), then one real command from the popup:
//   Gardena    – "Mähen" → lawn_mower.start_mowing → mowing
//   Husqvarna  – "Parken" → switch.turn_off on the schedule switch (park until further notice)
//   Landroid   – segment "Zone 2" → select.select_option → zone 2
// At the end every mower goes back to the station and the switches/selects back to their start values.
// MAEHER_BILDER=<folder>: tile + popup per mower, desktop dark and phone.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish, stable, call } from './lib.mjs';
import { tokens } from '../ws.mjs';

const MOWERS = [
  { id: 'lawn_mower.testmaeher_lawn_mower', tag: 'gardena', tile: /Parkt bis zum nächsten Zeitplan/,
    rows: ['Akku', 'Verbindung', 'Betriebsstunden'], not: ['Nächster Start', 'Schnitthöhe', 'Zone', 'Messer'],
    cmd: { sel: '"start_mowing"', check: (s) => s['lawn_mower.testmaeher_lawn_mower'].state === 'mowing', what: 'Mähen startet (lawn_mower.start_mowing)' } },
  { id: 'lawn_mower.rasenpilot', tag: 'husqvarna', tile: /Lädt · 87/,
    rows: ['Akku', 'Nächster Start', 'Modus', 'Hauptbereich', 'Bereich', 'Vorgarten', 'Messer', 'Betriebsstunden', 'Schnitthöhe'], not: ['Zone', 'Regen'],
    cmd: { sel: '"switch.rasenpilot_enable_schedule"', check: (s) => s['switch.rasenpilot_enable_schedule'].state === 'off', what: 'Parken schaltet den Zeitplan aus' } },
  { id: 'lawn_mower.grasfuchs', tag: 'landroid', tile: /In der Station/,
    rows: ['Akku', 'Verbindung', '-67 dBm', 'Nächster Start', 'Regen', 'Messer', 'Betriebsstunden', 'Schnitthöhe', 'Zone 1', 'Zone 4'], not: ['Modus', 'Bereich'],
    cmd: { sel: '"option":"2"', check: (s) => s['select.grasfuchs_zone'].state === '2', what: 'Zone 2 wählt die Zone (select.select_option)' } },
];
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const OUT = process.env.MAEHER_BILDER;

const reset = async () => {
  const tok = await tokens();
  for (const m of MOWERS) await call(tok.access_token, 'lawn_mower', 'dock', { entity_id: m.id }).catch(() => {});
  await call(tok.access_token, 'switch', 'turn_on', { entity_id: 'switch.rasenpilot_enable_schedule' }).catch(() => {});
  await call(tok.access_token, 'select', 'select_option', { entity_id: 'select.grasfuchs_zone', option: '1' }).catch(() => {});
};
atFinish(reset);

const popText = () => {
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  if (!pop) return null;
  const parts = [];
  const walk = (n) => n.childNodes.forEach((c) => {
    if (c.nodeType === 3) { if (c.parentNode && c.parentNode.nodeName !== 'STYLE') parts.push(c.textContent); return; }
    if (c.nodeType !== 1 || c.nodeName === 'STYLE') return;
    if (c.shadowRoot) walk(c.shadowRoot);
    walk(c);
  });
  walk(pop.shadowRoot);
  return parts.join(' ').replace(/\s+/g, ' ');
};

const run = async (view, dark, act) => {
  const { page } = await open(Object.assign({ theme: 'Casora', dark }, view));
  await dashboard(page, dash.url, 3);
  const tag = view.mobile ? 'handy' : 'desktop';
  for (const m of MOWERS) {
    await need(m.id + ' im Testhaus (Mock)', await page.evaluate((id) => !!document.querySelector('home-assistant').hass.states[id], m.id));
    await page.evaluate((id) => {
      const ha = document.querySelector('home-assistant');
      ha.shadowRoot.querySelectorAll('.qa-r325').forEach((x) => x.remove());
      return window.loadCardHelpers().then((h) => {
        const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_lawn_mower', entity: id });
        el.classList.add('qa-r325');
        el.hass = ha.hass;
        const phone = window.innerWidth < 600;
        el.style.cssText = 'position:fixed;left:' + (phone ? 16 : 400) + 'px;top:' + (phone ? 120 : 300) + 'px;width:' + (phone ? 170 : 220) + 'px;height:' + (phone ? 64 : 140) + 'px;z-index:99990;';
        ha.shadowRoot.appendChild(el);
        clearInterval(window.__r325);
        window.__r325 = setInterval(() => { if (el.hass !== ha.hass) el.hass = ha.hass; }, 200);
      });
    }, m.id);
    const t = await stable(page, () => {
      const el = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r325');
      const st = el && el.shadowRoot && el.shadowRoot.querySelector('#state');
      return st ? st.textContent.trim() : null;
    }, null, { max: 8000, quiet: 800 });
    await check(`${tag}: ${m.tag} Kachel ${m.tile}`, t && m.tile.test(t), t);
    if (OUT) await page.screenshot({ path: `${OUT}/${m.tag}-kachel-${tag}${dark ? '-dunkel' : ''}.png` });
    const at = await page.evaluate(() => { const r = document.querySelector('home-assistant').shadowRoot.querySelector('.qa-r325').getBoundingClientRect();
      return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.75 }; });
    await page.mouse.click(at.x, at.y);
    const txt = await stable(page, popText, null, { max: 10000, quiet: 1200 });
    const miss = m.rows.filter((r) => !(txt || '').includes(r));
    const extra = m.not.filter((r) => (txt || '').includes(r));
    await check(`${tag}: ${m.tag} Popup-Zeilen da`, txt && !miss.length, { miss, txt: (txt || '').slice(0, 600) });
    await check(`${tag}: ${m.tag} keine Zeilen ohne Entität`, txt && !extra.length, extra);
    if (OUT) await page.screenshot({ path: `${OUT}/${m.tag}-popup-${tag}${dark ? '-dunkel' : ''}.png` });
    if (act) {
      const clicked = await page.evaluate((sel) => {
        const pop = window.__pierce('casora-popup').find((x) => x.hasAttribute('open'));
        const b = window.__pierce('[data-casora-svc]', pop.shadowRoot).find((x) => (x.getAttribute('data-casora-svc') || '').includes(sel));
        if (!b) return false;
        b.click();
        return true;
      }, m.cmd.sel);
      await check(`${tag}: ${m.tag} Knopf gefunden`, clicked);
      await page.waitForTimeout(1500);
      const ok = await page.evaluate(() => {
        const S = document.querySelector('home-assistant').hass.states;
        return Object.fromEntries(Object.keys(S).filter((k) => /testmaeher|rasenpilot|grasfuchs/.test(k)).map((k) => [k, { state: S[k].state }]));
      });
      await check(`${tag}: ${m.tag} ${m.cmd.what}`, m.cmd.check(ok), Object.fromEntries(Object.entries(ok).filter(([k]) => /lawn_mower|enable_schedule|zone/.test(k))));
    }
    await page.evaluate(() => window.__pierce('casora-popup').forEach((p) => p.hasAttribute('open') && p.close()));
    await page.waitForTimeout(600);
  }
  await page.context().close();
};

await reset();
await run({ width: 1440, height: 1000 }, true, true);
await reset();
await run({ width: 393, height: 852, mobile: true }, true, false);
await finish();
