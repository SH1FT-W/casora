// @zustand: arbeit
// @parallel: ui
// Owner (03.11.2026, prod 26.11.8): a device row in the Pulse popup opened the device's status page as „WASCHKÜCHE /
// Pulse-Status“ – the device's name was nowhere. Handbook §3: label = room, title = the device's name without the
// room; the kind of value („Pulse-Status“, „Leistung“) stays on the stage. Same for a number sensor of a device.
// Made-up device and entities, only in the browser; desktop and phone.
import { open, dashboard, casoraDashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('ein Casora-Dashboard', dash);
const P = 'sensor.qa_washer_pulse_status', W = 'sensor.qa_washer_power';
for (const [label, size] of [['Desktop', { width: 1440, height: 1000 }], ['Handy', { width: 393, height: 852, mobile: true }]]) {
  const { page } = await open({ ...size, dark: false, theme: 'Casora' });
  usePage(page);
  await dashboard(page, dash.url);
  await fakeStates(page, {
    [P]: { state: 'check', attributes: { friendly_name: 'Waschmaschine Pulse-Status', device_class: 'enum' } },
    [W]: { state: '412', attributes: { friendly_name: 'Waschmaschine Leistung', unit_of_measurement: 'W', state_class: 'measurement', device_class: 'power' } },
  }, { sticky: true });
  const room = await page.evaluate(({ P, W }) => {
    const ha = document.querySelector('home-assistant'), h = ha.hass;
    const area = Object.keys(h.areas || {})[0];
    const devices = { ...h.devices, qa_washer: { id: 'qa_washer', name: 'Waschmaschine', area_id: area } };
    const ents = { ...h.entities };
    ents[P] = { ...(ents[P] || {}), entity_id: P, platform: 'pulse', device_id: 'qa_washer' };
    ents[W] = { ...(ents[W] || {}), entity_id: W, platform: 'qa', device_id: 'qa_washer' };
    ha._updateHass({ devices, entities: ents });
    return area ? h.areas[area].name : null;
  }, { P, W });
  await need(label + ': ein Bereich im Test-HA', room);
  for (const [id, kind] of [[P, 'Pulse-Status'], [W, 'Leistung']]) {
    const r = await page.evaluate(async (id) => {
      const Z = window._casoraZiele;
      if (!Z || !Z.openMeasure(id, '24h', null)) return { err: 'open failed' };
      await new Promise((res) => setTimeout(res, 2500));
      const p = window.casoraPopup, e = p.element, t = (el) => String((el && el.textContent) || '').replace(/\u200B/g, '').replace(/\s+/g, ' ').trim();
      const stage = window.__pierce('.hui-dl-t, .hui-dl-w2, .hui-dl-cap, .hui-st-cap, .hui-st-val', p.surface).map(t).join(' | ');
      return { title: t(e && e._headerTitle), eyebrow: t(e && e._headerEyebrow), stage };
    }, id);
    await need(`${label} ${kind}: Seite offen`, r && !r.err, r);
    await check(`${label} ${kind}: Titel = Gerät („Waschmaschine“)`, r.title === 'Waschmaschine', r);
    await check(`${label} ${kind}: Etikett = Raum`, r.eyebrow.toLowerCase() === String(room).toLowerCase(), { r, room });
    await check(`${label} ${kind}: Art steht auf der Bühne`, r.stage.includes(kind), r.stage);
    await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  }
  await page.context().close();
}
await finish();
