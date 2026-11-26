// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#_casoraRow
// u05-09 (review 26.11.2026, owner: remember the open badge row per device): the badges' sub-rows hung on the helper
// input_select.casora_expanded_row, one value for the house – a tap on one device opened the row on every screen, and
// a fresh page showed what someone else had left open. Two browsers (two devices) on Home: a tap on „Sicherheit“ in
// the first opens its row there only; the second, also after a reload, stays closed. The helper is still written.
import { open, dashboard, casoraDashboards, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));

const E = 'input_select.casora_expanded_row';
const size = { width: 1440, height: 900, dark: false, theme: 'Casora' };
const A = (await open(size)).page;
const B = (await open(size)).page;
usePage(A);
for (const p of [A, B]) await dashboard(p, desk.url);
// Both start closed (each device's own pick).
for (const p of [A, B]) {
  await p.evaluate((e) => document.querySelector('home-assistant').hass.callService('input_select', 'select_option', { entity_id: e, option: 'none' }).catch(() => {}), E);
}
await A.waitForTimeout(1500);

// What a device shows: the state its Home header (casora_room) reads, and whether the security sub-row is open.
const seen = (p) => p.evaluate((e) => {
  const room = window.__pierce('button-card').find((b) => b._config && [].concat(b._config.template || []).includes('casora_room')
    && b.getBoundingClientRect().width > 0);
  const st = room && room._hass && room._hass.states[e] ? room._hass.states[e].state : null;
  const row = room && room.shadowRoot && room.shadowRoot.querySelector('#badges_security');
  const cs = row ? getComputedStyle(row) : null;
  const open = !!(row && cs.visibility !== 'hidden' && parseFloat(cs.maxHeight || '0') > 0 && row.getBoundingClientRect().height > 4);
  return { st, open, raw: document.querySelector('home-assistant').hass.states[e]?.state };
}, E);

const at = await A.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => x._config && [].concat(x._config.template || []).includes('casora_badge_security_group')
    && x.getBoundingClientRect().width > 0);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Sicherheits-Badge auf Zuhause', at);
await A.mouse.click(at.x, at.y);
await A.waitForTimeout(2500);
const a1 = await seen(A), b1 = await seen(B);
await check('Gerät A: Tipp klappt die Sicherheits-Reihe auf', a1.st === 'security' && a1.open, a1);
await check('Gerät A: der Helfer wird weiter geschrieben', a1.raw === 'security', a1);
await check('Gerät B: bleibt zu', b1.st === 'none' && !b1.open, b1);

await B.reload();
await dashboard(B, desk.url);
const b2 = await seen(B);
await check('Gerät B nach Neuladen: bleibt zu', b2.st === 'none' && !b2.open, b2);

// A tap on B changes B only.
await B.evaluate((e) => document.querySelector('home-assistant').hass.callService('input_select', 'select_option', { entity_id: e, option: 'lights' }).catch(() => {}), E);
await B.waitForTimeout(2000);
const a3 = await seen(A), b3 = await seen(B);
await check('Gerät B: eigene Wahl „lights“', b3.st === 'lights', b3);
await check('Gerät A: behält „security“', a3.st === 'security' && a3.open, a3);

await A.evaluate((e) => document.querySelector('home-assistant').hass.callService('input_select', 'select_option', { entity_id: e, option: 'none' }).catch(() => {}), E);
await A.context().close();
await B.context().close();
await finish();
