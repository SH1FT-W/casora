// @zustand: arbeit
// Gemeldet: Die Sicherheit-Badge meldete „Gesichert“, obwohl ein Schloss offen war
// (Schlossliste wurde nicht mitgezählt). Erwartet: ist ein Schloss entriegelt, steht auf
// keiner Sicherheit-Badge „Gesichert“. Zustände werden nur im Browser untergeschoben.
import { open, casoraDashboards, dashboard, cards, fakeStates, check, need, finish } from './lib.mjs';

// Das feste Prüf-Dashboard „qa-arbeit“ zuerst: Importierte Test-Kopien haben das Badge zwar in
// der Konfiguration, zeigen es aber mangels Geräten nicht – je nach Reihenfolge fiel der Test sonst um.
const dash = (await casoraDashboards())
  .filter((d) => !d.mobile && /casora_badge_security/.test(JSON.stringify(d.config)))
  .sort((a, b) => (b.url === 'qa-arbeit') - (a.url === 'qa-arbeit'))[0] || null;
await need('Casora-Dashboard mit Sicherheit-Badge', dash);
const { page } = await open();
await dashboard(page, dash.url + '/' + (dash.config.views[0].path || '0'));

const locks = await page.evaluate(() => Object.keys(document.querySelector('home-assistant').hass.states).filter((e) => e.startsWith('lock.')));
await need('Schlösser im Haus', locks.length, locks);

// Untergeschobene Zustände „klebend“ und aufsummiert: Im parallelen Gate schalten andere Tests auf
// derselben Test-HA echte Geräte – ein echtes state_changed überschrieb sonst binnen der 1,2 s
// Wartezeit die Schlösser wieder auf offen („zu“ las dann schon „Schloss offen“, Gate 07.10.2026).
const fake = {};
const put = (patch) => fakeStates(page, Object.assign(fake, patch), { sticky: true });
const read = async () => (await cards(page)).filter((c) => c.t.some((x) => /^casora_badge_security/.test(x)) && c.y < 900);
// 1) Alle Schlösser zu → Gegenprobe, dass die Badge überhaupt reagiert.
await put(Object.fromEntries(locks.map((e) => [e, { state: 'locked' }])));
const zu = await read();
await need('sichtbare Sicherheit-Badge', zu.length, (await cards(page)).map((c) => c.t.join('+')).slice(0, 12));
// 2) Schlösser offen. Nicht nur locks[0]: das muss nicht das Schloss der Badge sein (ein im
// Studio angelegtes Dashboard nimmt z. B. nur die Schlösser seiner Räume) – dann änderte
// sich zu Recht nichts. Deshalb die Schlösser der Badge, sonst alle.
const own = await page.evaluate(() => {
  const ids = new Set();
  window.__pierce('button-card').forEach((b) => {
    if (![].concat((b._config || {}).template || []).some((t) => /^casora_badge_security/.test(t))) return;
    (JSON.stringify(b._config).match(/lock\.[a-z0-9_]+/g) || []).forEach((x) => ids.add(x));
  });
  return [...ids].filter((e) => document.querySelector('home-assistant').hass.states[e]);
});
const opened = own.length ? own : locks;
await put(Object.fromEntries(opened.map((e) => [e, { state: 'unlocked' }])));
const auf = await read();
const bad = auf.filter((c) => /Gesichert|Alles sicher|All secure|Secured?\b/i.test(c.text));
await check(`kein „Gesichert“ bei offenem Schloss (${opened.join(', ')})`, !bad.length, bad.map((c) => c.t.join('+') + ': ' + c.text));
await check('Badge ändert sich, wenn ein Schloss aufgeht', JSON.stringify(zu.map((c) => c.text)) !== JSON.stringify(auf.map((c) => c.text)),
  { zu: zu.map((c) => c.text), auf: auf.map((c) => c.text) });
// 3) Schloss offen + ein Fenster offen (30.09.2026 gemeldet: „1 Schloss · Geöffnet“ – ein
// Fenster-Gruppenhelfer ohne Geräteklasse landete als „Geöffnet“). Erwartet wie im
// Produktiv-Dashboard: „Schloss offen · Fenster offen“ (bzw. „N Schlösser offen · … Fenster offen“;
// bis 06.10.2026 „1 Schloss“). Weich zeigt im Standard „Kurz“ Symbole – dann greift die Prüfung nicht.
const win = await page.evaluate(() => {
  const S = document.querySelector('home-assistant').hass.states;
  return Object.keys(S).filter((e) => e.startsWith('binary_sensor.') && S[e].attributes.device_class === 'window'
    && !/kipp|tilt/i.test(e + ' ' + (S[e].attributes.friendly_name || '')));
});
if (win.length) {
  // Alle Fenster zu, eines auf; Kipp-/Kombi-Sensoren zu, damit nur „offen“ übrig bleibt.
  const tilts = await page.evaluate(() => {
    const S = document.querySelector('home-assistant').hass.states;
    return Object.keys(S).filter((e) => e.startsWith('binary_sensor.')
      && ('tilt' in S[e].attributes || /kipp|tilt/i.test(e + ' ' + (S[e].attributes.friendly_name || ''))));
  });
  const patch = Object.fromEntries(win.concat(tilts).map((e) => [e, { state: 'off' }]));
  patch[win[0]] = { state: 'on' };
  await put(patch);
  const grp = (await read()).filter((c) => c.t.includes('casora_badge_security_group'));
  await check('kein „Geöffnet“ in der Sicherheit-Badge', !grp.some((c) => /Geöffnet/.test(c.text)), grp.map((c) => c.text));
  await check('Wortlaut „Schloss · Fenster offen“ (wie Produktiv)',
    !grp.length || grp.every((c) => !/Fenster/.test(c.text) || !/Schl(oss|össer)/.test(c.text) || /Schl(oss|össer)( offen)?( · [^·]+)* · (\d+ )?Fenster offen/.test(c.text)),
    grp.map((c) => c.text));
}
await finish();
