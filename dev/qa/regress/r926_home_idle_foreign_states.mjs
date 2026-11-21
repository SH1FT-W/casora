// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-core.js#__casoraLazyHass custom_components/casora/scripts/smart-row.js#_hassMatters,hass
// #227: a notebook showing Casora Home idle drew ~10 W more than with a standard dashboard. Measured (Chromium, probe
// HA): a quiet page costs the same as a standard one; the difference is what every state change in the house sets off.
// Per change of an entity nothing on Home shows, every button-card ran an update cycle (176 on this Home, button-card
// copies hass twice per card) and every tile row re-checked itself in the next frame and three more times.
// Now: at most a few button-card cycles per foreign change, no row check per change (one calm look after 5 s), while
// a card still answers with the newest hass and a watched entity still redraws its card at once.
// Sets a test sensor per REST (states only, nothing stored) and an extra attribute on one shown entity, taken back.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { tokens } from '../ws.mjs';

const BASE = process.env.CASORA_URL || 'http://localhost:8124';
const { access_token } = await tokens();
const put = (id, body) => fetch(BASE + '/api/states/' + id, { method: 'POST',
  headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const FOREIGN = 'sensor.casora_qa_foreign';
const CHANGES = 20, MAX_CYCLES_PER_CHANGE = 10, MAX_ROW_CHECKS = 2;

const d = await casoraDashboard((x) => /casora_room/.test(JSON.stringify(x.config.views || [])));
await need('Casora dashboard with rooms', d, null);
const v0 = (d.config.views || [])[0];

const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
await put(FOREIGN, { state: '1', attributes: { unit_of_measurement: 'W' } });
await dashboard(page, d.url + '/' + (v0.path || '0'));
// Past the rows' load phase (10 s after they were built), in which every update still checks the row.
await page.waitForTimeout(12000);

const setup = await page.evaluate(() => {
  const C = customElements.get('button-card'), R = customElements.get('casora-smart-row');
  const Q = window.__qa926 = { cycles: 0, by: new Map(), rows: 0 };
  const pu = C.prototype.performUpdate;
  C.prototype.performUpdate = function () { if (this.isUpdatePending) { Q.cycles++; Q.by.set(this, (Q.by.get(this) || 0) + 1); } return pu.apply(this, arguments); };
  const viz = R.prototype._updateWrapperVisibility;
  R.prototype._updateWrapperVisibility = function () { if (this.isConnected) Q.rows++; return viz.apply(this, arguments); };
  return { cards: window.__pierce('button-card').length, rows: window.__pierce('casora-smart-row').filter((r) => r._initialized).length };
});
await need('button-cards and a tile row on Home', setup.cards > 20 && setup.rows > 0, setup);

// ── Foreign state changes ──
for (let i = 0; i < CHANGES; i++) { await put(FOREIGN, { state: String(100 + i), attributes: { unit_of_measurement: 'W' } }); await page.waitForTimeout(150); }
await page.waitForTimeout(1500);
const a = await page.evaluate((id) => {
  const Q = window.__qa926, ha = document.querySelector('home-assistant').hass;
  // Cards on the dashboard whose hass was kept aside (a helper card Casora parks at document.body gets its hass
  // from its owner when needed, not with every update).
  const cards = window.__pierce('button-card').filter((c) => c.isConnected && c.getRootNode() !== document && c.__casoraHassLazy);
  const stale = cards.filter((c) => (c._hass.states[id] || {}).state !== ha.states[id].state).length;
  return { cycles: Q.cycles, rows: Q.rows, seen: ha.states[id].state, stale, cards: cards.length };
}, FOREIGN);
await need('the foreign changes arrived in the page', a.seen === String(100 + CHANGES - 1), a);
const per = Math.round(a.cycles / CHANGES * 10) / 10;
await check(`at most ${MAX_CYCLES_PER_CHANGE} button-card update cycles per change of an entity nothing shows (${per}, ${setup.cards} cards)`, per <= MAX_CYCLES_PER_CHANGE, a);
await check(`no row check per foreign change (${a.rows} checks, ${setup.rows} rows, ${CHANGES} changes)`, a.rows <= MAX_ROW_CHECKS * setup.rows, a);
await check(`every card that kept the hass aside answers with the newest one (${a.stale} of ${a.cards} stale)`, a.cards > 20 && a.stale === 0, a);

// The calm look: 5 s after the first foreign change each row checks itself once.
await page.waitForTimeout(5500);
const rowsLater = await page.evaluate(() => window.__qa926.rows);
await check(`the rows take one calm look afterwards (${rowsLater} checks, ${setup.rows} rows)`, rowsLater >= 1 && rowsLater <= MAX_ROW_CHECKS * setup.rows, rowsLater);

// ── No card watches the whole house ──
// button-card notes every state a template reads through its hass. A template that searches all states that way
// (the fridge tile without an entity did) makes its card redraw on every state change anywhere.
const watch = await page.evaluate(() => { const all = Object.keys(document.querySelector('home-assistant').hass.states).length;
  const worst = window.__pierce('button-card').map((c) => ({ n: (c._monitoredEntities || []).length, template: [].concat((c._config || {}).template || ['?'])[0] })).sort((x, y) => y.n - x.n)[0];
  return { all, worst }; });
await check(`no card on Home watches more than a quarter of the house (most: ${watch.worst.template}, ${watch.worst.n} of ${watch.all})`, watch.worst.n <= watch.all / 4, watch);

// ── A watched entity still redraws its card at once ──
const pick = await page.evaluate(() => {
  const ha = document.querySelector('home-assistant').hass;
  for (const c of window.__pierce('button-card')) {
    const tpl = [].concat((c._config || {}).template || []);
    if (!tpl.some((t) => /^casora_/.test(t)) || c.getBoundingClientRect().width < 20) continue;
    const id = (c._monitoredEntities || []).find((e) => /^(sensor|binary_sensor|light|switch)\./.test(e) && ha.states[e]);
    if (!id) continue;
    window.__qa926.card = c; window.__qa926.by.delete(c);
    return { id, state: ha.states[id].state, attributes: ha.states[id].attributes, template: tpl[0] };
  }
  return null;
});
await need('a Casora card that watches an entity', pick, null);
atFinish(() => put(pick.id, { state: pick.state, attributes: pick.attributes }));
await put(pick.id, { state: pick.state, attributes: { ...pick.attributes, qa_r926: 1 } });
await page.waitForTimeout(1500);
const w = await page.evaluate((id) => { const Q = window.__qa926, c = Q.card;
  return { cycles: Q.by.get(c) || 0, attr: ((c._hass.states[id] || {}).attributes || {}).qa_r926, stored: !c.__casoraHassLazy }; }, pick.id);
await check(`a watched entity (${pick.template}) goes to button-card and the card runs its update`, w.cycles >= 1 && w.attr === 1 && w.stored, w);

await finish();
