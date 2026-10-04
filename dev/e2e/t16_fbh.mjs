// Fußbodenheizung: Bosch über translation_keys vs. alte Namensmuster; Hauptschalter + Heizdauer ohne feste IDs.
import { open, ready } from './harness.mjs';
const { browser, page, errors } = await open();
await ready(page, '/dashboard-hemma/home', () => !!(window._casoraFbh && window.casoraDevice), 60000); // Adresse des Test-Dashboards
await page.waitForTimeout(4000);
const r = await page.evaluate(() => {
  const h = document.querySelector('home-assistant').hass, S = h.states, F = window._casoraFbh;
  const grp = Object.keys(S).find((k) => k.startsWith('climate.') && Array.isArray(S[k].attributes.member_entities));
  const out = { gruppe: grp, raeume: [] };
  const CD = window.casoraDevice;
  S[grp].attributes.member_entities.forEach((m) => {
    const neu = F.info(m, S, h);
    window.casoraDevice = null; const alt = F.info(m, S, h); window.casoraDevice = CD;
    const diff = Object.keys(Object.assign({}, alt, neu)).filter((k) => JSON.stringify(alt[k]) !== JSON.stringify(neu[k]))
      .map((k) => k + ': ' + alt[k] + ' → ' + neu[k]);
    out.raeume.push(neu.name + (neu.trv ? ' (Heizkörper)' : '') + ' · ' + ['cfh', 'next', 'lock', 'temp', 'hum'].filter((k) => neu[k]).length + '/5' + (diff.length ? ' · ABWEICHUNG ' + diff.join('; ') : ' · identisch'));
  });
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
