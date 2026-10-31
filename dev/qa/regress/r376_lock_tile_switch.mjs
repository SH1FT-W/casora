// @zustand: arbeit
// @parallel: ui
// T01 (26.10.70): the switch on a lock tile (casora_lock) unlocked a door without asking, and on a tile over
// several locks (variables.locks) it followed only the first lock while the state line showed the group
// ("1 entriegelt", switch off → tap unlocked the locked front door; "klemmt" never showed).
// Expected: the switch shows and acts on the whole group (lock all open ones at once, unlock all with one
// question naming the count), unlocking always asks (also a single lock, without "Ask before switching"),
// locking does not ask, a jammed lock reads "Klemmt". States and service calls only faked in the browser.
import { open, casoraDashboard, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const dash = (await casoraDashboard((d) => d.url === 'qa-arbeit')) || (await casoraDashboard());
await need('a Casora dashboard', dash);

const A = 'lock.qa_t01_front', B = 'lock.qa_t01_garage', C = 'lock.qa_t01_shed';
const lk = (state, name) => ({ state, attributes: { friendly_name: name, supported_features: 0 } });

const { page } = await open({ width: 1440, height: 900, dark: true, theme: 'Casora' });
usePage(page);
await dashboard(page, dash.url, 3);
await fakeStates(page, { [A]: lk('locked', 'Front door'), [B]: lk('locked', 'Garage'), [C]: lk('locked', 'Shed') }, { sticky: true });
await page.evaluate(() => {
  const conn = document.querySelector('home-assistant').hass.connection;
  window.__qaCalls = [];
  const orig = conn.sendMessagePromise.bind(conn);
  conn.sendMessagePromise = (m) => {
    if (m && m.type === 'call_service' && m.domain === 'lock') {
      window.__qaCalls.push({ svc: m.service, ids: [].concat((m.service_data || {}).entity_id || (m.target || {}).entity_id || []) });
      return Promise.resolve({ context: { id: 'qa' } });
    }
    return orig(m);
  };
});
// Two tiles, built in the browser: a group tile over three locks and a single-lock tile.
await page.evaluate(({ A, B, C }) => window.loadCardHelpers().then((h) => {
  const host = document.querySelector('home-assistant').shadowRoot;
  const make = (cls, cfg, top) => {
    const el = h.createCardElement({ type: 'custom:button-card', template: 'casora_lock', ...cfg });
    el.classList.add(cls); el.hass = document.querySelector('home-assistant').hass;
    el.style.cssText = `position:fixed;left:40px;top:${top}px;width:200px;height:110px;z-index:99999;`;
    host.appendChild(el);
  };
  make('qa-group', { entity: A, name: 'Locks', variables: { locks: [A, B, C] } }, 200);
  make('qa-one', { entity: A, name: 'Front door' }, 360);
}), { A, B, C });
await page.waitForTimeout(1800);

// The tiles were built here, outside a view: hand them the new hass after each faked state.
const put = async (patch) => {
  await fakeStates(page, patch, { sticky: true });
  await page.evaluate(() => { const ha = document.querySelector('home-assistant');
    ha.shadowRoot.querySelectorAll('.qa-group, .qa-one').forEach((el) => { el.hass = ha.hass; }); });
  await page.waitForTimeout(800);
};
const tile = (cls) => page.evaluate((cls) => {
  const el = document.querySelector('home-assistant').shadowRoot.querySelector('.' + cls);
  const sr = el && el.shadowRoot;
  const tg = sr && sr.querySelector('#toggle');
  const sw = tg && window.__pierce('svg', tg).find((s) => s.getBoundingClientRect().width > 10);
  const r = (sw || tg) && (sw || tg).getBoundingClientRect();
  const state = sr && sr.querySelector('#state');
  return { at: r && r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null,
    on: sw ? /toggle-on-fill/.test((sw.querySelector('rect') || {}).outerHTML || '') : null,
    svg: sw ? sw.outerHTML.slice(0, 400) : null,
    state: state ? state.textContent.replace(/\s+/g, ' ').trim() : null };
}, cls);
const ask = () => page.evaluate(() => { const h = document.querySelector('.casora-askfirst'); const r = h && (h.shadowRoot || h);
  return r ? { title: r.querySelector('h2').textContent, text: (r.querySelector('p') || {}).textContent || '', yes: r.querySelector('.yes').textContent } : null; });
const answer = (cls) => page.evaluate((cls) => { const h = document.querySelector('.casora-askfirst'); const b = h && (h.shadowRoot || h).querySelector('.' + cls); if (b) b.click(); return !!b; }, cls);
const calls = () => page.evaluate(() => window.__qaCalls.splice(0));
const tap = async (cls) => { const t = await tile(cls); await page.mouse.click(t.at.x, t.at.y); await page.waitForTimeout(700); };

// 1) All three locked: group tile reads locked, switch off; tap → one question naming the count.
let t = await tile('qa-group');
await need('group tile with a switch', t.at, t);
await check('all locked: switch off', t.on === false, t.svg);
await tap('qa-group');
let q = await ask();
await check('group, all locked: unlocking asks first', !!q, q);
await check('question names the count and the locks', q && q.title === '3 Schlösser entriegeln?' && /Front door, Garage, Shed/.test(q.text) && q.yes === 'Entriegeln', q);
await answer('no'); await page.waitForTimeout(500);
await check('Cancel: nothing sent', (await calls()).length === 0);
await tap('qa-group'); await answer('yes'); await page.waitForTimeout(600);
let c = await calls();
await check('Confirm: lock.unlock for all three locks at once', c.length === 1 && c[0].svc === 'unlock' && c[0].ids.sort().join() === [A, B, C].sort().join(), c);

// 2) The report's case: first lock locked, garage unlocked → "1 entriegelt", switch on, tap locks the garage.
await put({ [B]: lk('unlocked', 'Garage') });
t = await tile('qa-group');
await check('state line shows the group: „1 entriegelt“', t.state === '1 entriegelt', t.state);
await check('switch follows the group (on = something unlocked)', t.on === true, t.svg);
await tap('qa-group');
await check('locking does not ask', !(await ask()), await ask());
c = await calls();
await check('tap locks the open lock (not unlock the first one)', c.length === 1 && c[0].svc === 'lock' && c[0].ids.join() === B, c);

// 3) Jammed outranks the open count.
await put({ [C]: lk('jammed', 'Shed') });
t = await tile('qa-group');
await check('a jammed lock reads „Klemmt“', t.state === 'Klemmt', t.state);

// 4) Single lock without "Ask before switching": unlocking still asks.
await put({ [A]: lk('locked', 'Front door') });
await tap('qa-one');
q = await ask();
await check('single lock: unlocking asks („Wirklich entriegeln?“)', q && q.text === 'Wirklich entriegeln?' && q.yes === 'Entriegeln', q);
await answer('no'); await page.waitForTimeout(400);
await check('single lock, Cancel: nothing sent', (await calls()).length === 0);

await finish();
