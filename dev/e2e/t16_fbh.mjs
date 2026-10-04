// Fußbodenheizung: Bosch über translation_keys gegen Registry-Erwartung (Gerät/Bereich); Hauptschalter + Heizdauer ohne feste IDs.
import { open, ready } from './harness.mjs';
const { browser, page, errors } = await open();
await ready(page, '/dashboard-hemma/home', () => !!(window._casoraFbh && window.casoraDevice), 60000); // Adresse des Test-Dashboards
await page.waitForTimeout(4000);
const r = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass, S = h.states, F = window._casoraFbh;
  const grp = Object.keys(S).find((k) => k.startsWith('climate.') && Array.isArray(S[k].attributes.member_entities));
  const out = { gruppe: grp, raeume: [] };
  const CD = window.casoraDevice, reg = h.entities || {}, D = h.devices || {};
  // Erwartung unabhängig von F.info aus der Registry: Raumklima-Geschwister per translation_key,
  // Wandthermostat = anderes Gerät im selben Bereich mit child_lock (keine festen IDs, keine Namensmuster).
  const onDev = (d) => Object.keys(reg).filter((e) => reg[e].device_id === d && S[e]);
  const byKey = (ents, tk, dom) => ents.find((e) => reg[e].translation_key === tk && e.startsWith(dom + '.'));
  const byDc = (ents, dc) => ents.find((e) => e.startsWith('sensor.') && S[e].attributes.device_class === dc);
  const KEYS = { cfh: ['call_for_heat', 'binary_sensor'], next: ['next_setpoint_temperature', 'sensor'], dip: ['temperature_drop_enabled', 'switch'],
    dipVal: ['temperature_drop_value', 'number'], override: ['schedule_override_active', 'binary_sensor'], pause: ['summer_mode', 'binary_sensor'], air: ['ventilation_mode', 'binary_sensor'] };
  let bosch = 0;
  S[grp].attributes.member_entities.forEach((m) => {
    const neu = F.info(m, S, h);
    const dev = reg[m] && reg[m].device_id, sib = dev ? onDev(dev).filter((e) => e !== m) : [];
    const soll = {};
    if (byKey(sib, 'call_for_heat', 'binary_sensor')) {
      bosch++;
      Object.keys(KEYS).forEach((k) => { const e = byKey(sib, KEYS[k][0], KEYS[k][1]); if (e) soll[k] = e; });
      const me = D[dev] || {};
      const wall = me.area_id && Object.keys(D).find((d) => d !== dev && D[d].area_id === me.area_id && D[d].manufacturer === me.manufacturer
        && byKey(onDev(d), 'child_lock', 'switch') && byDc(onDev(d), 'temperature'));
      if (wall) { const w = onDev(wall); soll.lock = byKey(w, 'child_lock', 'switch'); soll.temp = byDc(w, 'temperature'); const hu = byDc(w, 'humidity'); if (hu) soll.hum = hu; }
      else soll.lock = 'Wandthermostat FEHLT';
    }
    const diff = Object.keys(soll).filter((k) => soll[k] !== neu[k]).map((k) => k + ': erwartet ' + soll[k] + ', gefunden ' + neu[k]);
    out.raeume.push(neu.name + (neu.trv ? ' (Heizkörper)' : '') + ' · ' + ['cfh', 'next', 'lock', 'temp', 'hum'].filter((k) => neu[k]).length + '/5'
      + (diff.length ? ' · ABWEICHUNG ' + diff.join('; ') : ' · identisch (' + Object.keys(soll).length + ' geprüft)'));
  });
  if (!bosch) out.raeume.push('Bosch-Raumklima FEHLT (kein call_for_heat in den Testdaten)');
  out.hauptschalter = CD.map(h, grp, { m: { keys: ['main_switch'], domain: 'switch' } }).m;
  const cfhs = S[grp].attributes.member_entities.map((m) => F.info(m, S, h).cfh).filter(Boolean);
  CD.onHours(cfhs, 7);
  out.cfhs = cfhs.length;
  return out;
});
await page.waitForTimeout(3000);
r.heizdauer7 = await page.evaluate(() => { const h = document.querySelector('home-assistant').hass, S = h.states;
  const grp = Object.keys(S).find((k) => k.startsWith('climate.') && Array.isArray(S[k].attributes.member_entities));
  return window.casoraDevice.onHours(S[grp].attributes.member_entities.map((m) => window._casoraFbh.info(m, S, h).cfh).filter(Boolean), 7); });
console.log('FBH:', JSON.stringify(r, null, 1));
console.log('Browser-Fehler:', errors.filter((e) => !/addEventListener|404/.test(e)).slice(0, 6));
await browser.close();
