// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/37-kettle.js#K.popup,K.sec,K.v3,K.switchOf,K.model,K.modeLabel dev/casora_mock/kettle.py
// Audit 04.11.2026 (popup v3, „schau ob wir noch mehr Popups vergessen haben“): the kettle popup (casora_popup_kettle,
// issue #87) still showed HA's entity rows and HA's history card – no stage, the rows as HA's card. Expected (popup
// rules v3 §4 S2/S7, §6, §7): the kettle with a target temperature (Testwasserkocher: number + keep warm + start
// switch, dev/casora_mock/kettle.py) has the S2 dial, the start switch in the head, keep warm and „Heizen“ in one plate
// and the temperature as casora-chart; the BLE-like kettle without a target (Testkocher) the water temperature as the
// S6 level ring in the heat colours of the target dial (coordinator 04.11.: not the green/grey traffic light). No HA
// entities or history card; at 393 nothing sticks out of the popup. Desktop 1440 and phone 393, light.
// Layout (coordinator 04.11.): the first opening has the same layout as the second – before, the short plate stood in a
// right column of a 900 popup on the first opening and only the next one was one column (rule B waits for a measurement).
// Pictures: R555_SHOTS=<folder> stores desktop/phone, light and dark.
import fs from 'node:fs';
import { open, casoraDashboard, dashboard, check, need, finish, stable, usePage } from './lib.mjs';

const SHOTS = process.env.R555_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const PLUS = 'sensor.testwasserkocher_temperature', BLE = 'sensor.testkocher_temperature';
const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);

const look = () => {
  const p = window.casoraPopup && window.casoraPopup.element;
  if (!p || !p.hasAttribute('open')) return { open: false };
  const R = p.shadowRoot, all = window.__pierce('*', R);
  const stage = all.filter((n) => n.getAttribute && n.getAttribute('data-casora-stage')).map((n) => n.getAttribute('data-casora-stage'));
  const rows = all.filter((n) => n.classList && n.classList.contains('hui-srow') && n.getClientRects().length);
  const plates = new Set(rows.map((r) => r.parentElement));
  const W = window.innerWidth, surf = p.surface;
  const out = all.filter((n) => n.getClientRects && n.getClientRects().length && n.nodeName !== 'STYLE').map((n) => {
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (r.right > W + 0.5 || r.left < -0.5) ? (n.className || n.nodeName) + ' ' + Math.round(r.left) + '–' + Math.round(r.right) : null;
  }).filter(Boolean).slice(0, 6);
  return { open: true, stage, rows: rows.length, plates: plates.size, rowText: rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()).slice(0, 6),
    haCards: all.filter((n) => /^HUI-(ENTITIES|HISTORY-GRAPH)-CARD$/.test(n.nodeName)).length, chart: all.filter((n) => n.nodeName === 'CASORA-CHART').length,
    headSwitch: !!(p._headerSwitch && !p._headerSwitch.hidden), out, wide: surf ? surf.scrollWidth - surf.clientWidth : 0,
    ring: all.filter((n) => n.nodeName === 'path' && n.getAttribute('stroke-width') === '26').map((n) => n.getAttribute('stroke') || n.getAttribute('style') || ''),
    layout: (() => {
      const st = all.find((n) => n.getAttribute && n.getAttribute('data-casora-stage')), r0 = rows[0];
      if (!st || !r0 || !surf) return null;
      const a = st.getBoundingClientRect(), b = r0.getBoundingClientRect();
      return { width: Math.round(surf.getBoundingClientRect().width), beside: b.left >= a.right - 1 };
    })() };
};

for (const [label, size] of [['Desktop', { width: 1440, height: 1000 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  for (const dark of SHOTS ? [false, true] : [false]) {
    const { page } = await open({ ...size, dark, theme: 'Casora' });
    usePage(page);
    await dashboard(page, dash.url, 3);
    const have = await page.evaluate(([a, b]) => { const S = document.querySelector('home-assistant').hass.states; return !!(S[a] && S[b]); }, [PLUS, BLE]);
    await need(`${label}: Test-Wasserkocher im Mock`, have);
    for (const [id, want, nm] of [[PLUS, 'S2', 'mit Ziel'], [BLE, 'S6', 'BLE']]) {
      await page.evaluate(async (id) => {
        const ha = document.querySelector('home-assistant'); const h = await window.loadCardHelpers();
        ha.shadowRoot.getElementById('qa-r555')?.remove();
        const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_kettle', entity: id, name: 'Wasserkocher' });
        el.id = 'qa-r555'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:20px;top:300px;width:200px;height:140px;z-index:99990;';
        ha.shadowRoot.appendChild(el);
      }, id);
      await page.waitForTimeout(1500);
      // A real tap: the frame takes the head switch from the tapped tile (_casoraLastTile).
      await page.mouse.click(120, 370);
      const s = await stable(page, look, null, { max: 9000, quiet: 1200, until: (v) => v && v.open && v.stage.length });
      const tag = `${label}${dark ? ' dunkel' : ''} ${nm}`;
      if (SHOTS) {
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${SHOTS}/${label === 'Desktop' ? 'desktop' : 'handy'}-${dark ? 'dunkel' : 'hell'}-${id === PLUS ? 'ziel' : 'ble'}.png` });
      }
      if (!dark) {
        await need(`${tag}: Popup offen`, s && s.open, s);
        await check(`${tag}: Bühne ${want} (eine)`, s.stage.length === 1 && s.stage[0] === want, s.stage);
        await check(`${tag}: keine HA-Karten (Zeilen, Verlauf)`, s.haCards === 0, s.haCards);
        await check(`${tag}: Zeilen in einer Platte`, s.rows >= 1 && s.plates === 1, { rows: s.rowText, plates: s.plates });
        await check(`${tag}: Temperatur als Casora-Verlauf`, s.chart === 1, s.chart);
        if (id === BLE) await check(`${tag}: Füllring in den Wärmefarben (kein Ampel-Grün/Grau)`, s.ring.length && s.ring.some((x) => /^url\(/.test(x)), s.ring);
        if (id === PLUS) {
          await check(`${tag}: Warmhalten in der Platte`, s.rowText.some((t) => /Warmhalten/.test(t)), s.rowText);
          await check(`${tag}: Startschalter im Kopf`, s.headSwitch, s.headSwitch);
        }
        if (label === 'Handy') await check(`${tag}: nichts ragt aus dem Popup (393)`, !s.out.length && s.wide <= 1, { out: s.out, wide: s.wide });
      }
      await page.evaluate(() => window.casoraPopup.close());
      await page.waitForTimeout(800);
    }
    await page.context().close();
  }
}
// First opening = second opening (fresh browser: nothing measured yet), desktop.
{
  const { page } = await open({ width: 1440, height: 1000, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url, 3);
  for (const [id, nm] of [[PLUS, 'mit Ziel'], [BLE, 'BLE']]) {
    const seen = [];
    for (let n = 0; n < 2; n++) {
      await page.evaluate(async (id) => {
        const ha = document.querySelector('home-assistant'); const h = await window.loadCardHelpers();
        ha.shadowRoot.getElementById('qa-r555')?.remove();
        const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_kettle', entity: id, name: 'Wasserkocher' });
        el.id = 'qa-r555'; el.hass = ha.hass; el.style.cssText = 'position:fixed;left:20px;top:300px;width:200px;height:140px;z-index:99990;';
        ha.shadowRoot.appendChild(el);
      }, id);
      await page.waitForTimeout(1500);
      await page.mouse.click(120, 370);
      await stable(page, look, null, { max: 9000, quiet: 1200, until: (v) => v && v.open && v.layout });
      // Long enough for the column balance to measure twice and act (casora-core balance()).
      await page.waitForTimeout(4000);
      seen.push((await page.evaluate(look)).layout);
      await page.evaluate(() => window.casoraPopup.close());
      await page.waitForTimeout(900);
    }
    await check(`Desktop ${nm}: erstes Öffnen = gleiches Layout wie zweites`, seen[0] && seen[1] && seen[0].width === seen[1].width && seen[0].beside === seen[1].beside, seen);
  }
  await page.context().close();
}
await finish();
