// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/00-finder.js#contacts,awayOnly,contactsShared custom_components/casora/panel/casora-panel-personal.js
// Issue #141 (wish): an alarm panel leaves bedroom windows out while someone is home (open for air) and watches them all
// when everyone is away; Casora's security badge called such a window "not secure" all evening. Settings › Doors and
// windows › "Nur bei Abwesenheit" (contacts.away_only). Expected on Home: with a person home the open window is not in
// the security summary; when everyone leaves it shows up (the badge redraws by itself). Studio: the rows "Nur bei
// Abwesenheit" and „Tür oder Fenster nur bei Abwesenheit zählen“ in "Türen und Fenster", the search finds it by
// "lüften". Writes Casora's settings (test HA only) and restores them; states are faked in the browser only.
import { open, casoraDashboard, dashboard, studio, stable, check, need, finish, usePage, atFinish, fakeStates } from './lib.mjs';
import { ws } from '../ws.mjs';

const c = await ws();
const S = await c.cmd({ type: 'get_states' });
const R = await c.cmd({ type: 'config/entity_registry/list' });
const hiddenReg = new Set(R.filter((e) => e.hidden_by || e.disabled_by || e.entity_category).map((e) => e.entity_id));
const dc = (s) => String(s.attributes.device_class || '');
const contacts = S.filter((s) => s.entity_id.startsWith('binary_sensor.') && ['door', 'window', 'garage_door', 'opening'].includes(dc(s)));
const win = contacts.find((s) => dc(s) === 'window' && !hiddenReg.has(s.entity_id) && !Array.isArray(s.attributes.entity_id)
  && !/kipp|tilt/i.test(s.entity_id));
const persons = S.filter((s) => s.entity_id.startsWith('person.')).map((s) => s.entity_id);
const alarms = S.filter((s) => s.entity_id.startsWith('alarm_control_panel.')).map((s) => s.entity_id);
await need('a window and a person in the test house', win && persons.length, { win: win && win.entity_id, persons });
const WIN = win.entity_id;

const r0 = await c.cmd({ type: 'casora/settings/get' });
const before = r0.stored ? r0.settings : null;
let restored = false;
atFinish(async () => {
  if (restored) return;
  restored = true;
  const c2 = await ws();
  await c2.cmd({ type: 'casora/settings/set', settings: before || {} });
  c2.close();
});
const base = before || {};
await c.cmd({ type: 'casora/settings/set', settings: { ...base, contacts: { ...(base.contacts || {}), away_only: [WIN] } } });
const r1 = await c.cmd({ type: 'casora/settings/get' });
await check('integration stores contacts.away_only', JSON.stringify(((r1.settings.contacts || {}).away_only)) === JSON.stringify([WIN]), r1.settings.contacts);
c.close();

// Every door/window closed but this one, which is open; nobody's alarm armed.
const now = new Date().toISOString();
const shut = Object.fromEntries(contacts.map((s) => [s.entity_id, { state: s.entity_id === WIN ? 'on' : 'off', attributes: s.attributes, last_changed: now }]));
const people = (state) => Object.fromEntries(persons.map((p) => [p, { state, attributes: { friendly_name: p } }]));
const disarmed = Object.fromEntries(alarms.map((a) => [a, { state: 'disarmed', attributes: {} }]));
const look = () => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).includes('casora_badge_security_group') && x.getBoundingClientRect().width > 20);
  const hass = document.querySelector('home-assistant').hass;
  const counted = window.casoraHouseContacts ? window.casoraHouseContacts(hass) : null;
  if (!b) return { badge: null, counted };
  const sub = b.shadowRoot && b.shadowRoot.querySelector('.badge-sub');
  return { badge: sub ? sub.textContent.replace(/\s+/g, ' ').trim() : '', counted };
};

const dk = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
usePage(dk.page);
const dash = await casoraDashboard((d) => !d.mobile);
await need('Casora dashboard', dash);
await dashboard(dk.page, dash.url + '/home', 3);
let cur = { ...shut, ...disarmed, ...people('home'), 'input_select.casora_expanded_row': { state: 'security', attributes: {} } };
await fakeStates(dk.page, cur, { sticky: true });
const home = await stable(dk.page, look, WIN, { max: 12000, until: (v) => v && v.counted && !v.counted.includes(WIN) });
await check('someone home: the airing window does not count', home && home.counted && !home.counted.includes(WIN), home);
// The summary reads „N offen“ (plus icons): count what it says is open.
const openN = (v) => { const m = /(\d+) offen/.exec((v && v.badge) || ''); return m ? Number(m[1]) : 0; };
await check('someone home: the security badge is there', home && home.badge !== null, home);
cur = { ...cur, ...people('not_home') };
await fakeStates(dk.page, cur, { sticky: true });
const away = await stable(dk.page, look, WIN, { max: 12000, until: (v) => v && v.counted && v.counted.includes(WIN) && openN(v) === openN(home) + 1 });
await check('everyone away: the window counts again', away && away.counted && away.counted.includes(WIN), away);
await check('everyone away: the badge counts the open window by itself (one more open)', away && openN(away) === openN(home) + 1, { home, away });

// ── Studio: Home & devices › Doors and windows ──
await studio(dk.page, dash.url);
const H = (fn, a) => dk.page.evaluate(fn, a);
await H(() => window.__panel()._bOpenSettings && window.__panel()._bOpenSettings());
await dk.page.waitForTimeout(1000);
await dk.page.locator('.cs-hubsearch input').fill('lüften');
await dk.page.waitForTimeout(500);
const hits = await H(() => [...window.__panel().shadowRoot.querySelectorAll('#pane .frow b')].filter((b) => b.getClientRects().length).map((b) => b.textContent.trim()));
await check('Studio: search „lüften“ finds „Türen und Fenster“', hits.includes('Türen und Fenster'), hits);
await dk.page.locator('.frow').filter({ has: dk.page.locator('b', { hasText: /^Türen und Fenster$/ }) }).first().click();
await dk.page.waitForTimeout(2200);
const st = await H(() => {
  const r = window.__panel().shadowRoot;
  const g = r.querySelector('#pane [data-pkey="contacts"]');
  const text = g ? g.textContent.replace(/\s+/g, ' ') : '';
  return { group: !!g, label: text.includes('Nur bei Abwesenheit'), add: text.includes('Tür oder Fenster nur bei Abwesenheit zählen'),
    help: text.includes('nur, wenn niemand zu Hause ist'), draft: (((window.__panel()._cs || {}).S || {}).contacts || {}).away_only };
}, null);
await check('Studio: row „Nur bei Abwesenheit“ with the picked window and its help', st.group && st.label && st.help, st);
await check('Studio: „Tür oder Fenster nur bei Abwesenheit zählen“ adds one', st.add, st);
await check('Studio: the draft holds the stored list', JSON.stringify(st.draft) === JSON.stringify([WIN]), st);
await dk.browser.close();
await finish();
