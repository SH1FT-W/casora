// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/local/24-klingel.js#KL.status,KL.ago,KL.tileText,KL.hot,KL.timeCheck,KL.of,KL.sec,KL.drawSec,HOLD,FRESH
// Visible output ages without camera images or camera state changes.
import { open, casoraDashboard, dashboard, check, need, finish, atFinish } from './lib.mjs';
import { OUT } from '../../e2e/harness.mjs';

const started = Date.now(), id = 'camera.testklingel_sub';
const dash = await casoraDashboard();
await need('a Casora dashboard', dash);
const { page } = await open({ width: 1440, height: 1000, theme: 'Casora', lang: 'nl' });
let blocked = 0;
const historyIds = new Set(), replies = new Set();
let latestHistoryEnd = 0;
page.on('websocket', (socket) => {
  socket.on('framesent', ({ payload }) => {
    try {
      const m = JSON.parse(String(payload));
      if (m.type === 'history/history_during_period' && m.entity_ids?.includes('binary_sensor.testklingel_visitor')) {
        historyIds.add(m.id); latestHistoryEnd = Math.max(latestHistoryEnd, Date.parse(m.end_time));
      }
    } catch {}
  });
  socket.on('framereceived', ({ payload }) => {
    try { const m = JSON.parse(String(payload)); if (historyIds.has(m.id)) replies.add(m.id); } catch {}
  });
});
await page.route(/\/api\/camera_proxy(?:_stream)?\//, async (route) => { blocked++; await route.abort(); });
await dashboard(page, dash.url, 1);
await page.evaluate(async (id) => {
  const ha = document.querySelector('home-assistant');
  const helpers = await window.loadCardHelpers();
  const tile = helpers.createCardElement({ type: 'custom:button-card',
    template: 'casora_reolink_doorbell', entity: id, name: 'Testklingel' });
  tile.classList.add('qa-doorbell-time');
  tile.style.cssText = 'position:fixed;left:400px;top:300px;width:360px;height:220px;z-index:100;';
  tile.hass = ha.hass;
  ha.shadowRoot.appendChild(tile);
  window.__doorbellTime = { tile, forward: setInterval(() => {
    const visitor = ha.hass.states['binary_sensor.testklingel_visitor'];
    if (visitor?.state === 'on') window.__doorbellTime.rangAt = Date.parse(visitor.last_changed);
    tile.hass = ha.hass;
  }, 200) };
}, id);
atFinish(() => page.evaluate(() => {
  const q = window.__doorbellTime;
  if (q.realNow) Date.now = q.realNow;
  clearInterval(q.forward); q.unsubscribe?.(); q.tile.remove();
  window.casoraPopup?.close(); delete window.__doorbellTime;
}));
await page.evaluate(() => document.querySelector('home-assistant').hass.callService(
  'casora_mock', 'klingel_druecken', { dauer: 2, person: 2 }));
await page.waitForFunction(() => ['visitor', 'person', 'motion'].every((k) =>
  document.querySelector('home-assistant').hass.states['binary_sensor.testklingel_' + k]?.state === 'off'));
await page.screenshot({ path: OUT + '/before-tile-nl.png' });
await page.locator('button-card.qa-doorbell-time').click();
await page.waitForFunction(() => window.__pierce('casora-popup').some((p) => p.hasAttribute('open')));
// Both the initial recorder request and its delayed retry must have completed.
const recorderDeadline = Date.now() + 20000;
const releasedAt = await page.evaluate(() => Date.parse(document.querySelector('home-assistant').hass.states['binary_sensor.testklingel_visitor'].last_changed));
const recorderDone = () => latestHistoryEnd >= releasedAt + 7000 && replies.size === historyIds.size;
while (!recorderDone() && Date.now() < recorderDeadline) await page.waitForTimeout(100);
await need('recorder retry after release completed', recorderDone());
const requestsBefore = historyIds.size;
await page.evaluate(async (id) => {
  const q = window.__doorbellTime, ha = document.querySelector('home-assistant');
  clearInterval(q.forward);
  q.camera = JSON.stringify(ha.hass.states[id]); q.changes = 0;
  q.unsubscribe = await ha.hass.connection.subscribeEvents((e) => {
    if (e.data.entity_id === id) q.changes++;
  }, 'state_changed');
  q.realNow = Date.now; q.offset = 0;
  Date.now = () => q.realNow() + q.offset;
}, id);
const words = await page.evaluate(() => ['Hat geklingelt', 'Geklingelt · vor 2 Min.',
  'Geklingelt · vor 9 Min.', 'vor 2 Min.', 'vor 9 Min.', 'vor 10 Min.', 'Neu', 'Kein Bild']
  .map((s) => (window.casoraTr ? window.casoraTr(s) : s).replace(/\s+/g, ' ').trim()));
const read = () => {
  const q = window.__doorbellTime, norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const state = q.tile.shadowRoot.querySelector('#state');
  const pop = window.__pierce('casora-popup').find((p) => p.hasAttribute('open'));
  const cards = window.__pierce('button-card').filter((b) => {
    let n = b; while (n) { if (n === pop) return true; n = n.parentNode || n.host; } return false;
  });
  const history = cards.map((b) => b.shadowRoot?.querySelector('.kl-verlauf')).find(Boolean);
  return { tile: norm((state.querySelector('.sf-f') || state).textContent),
    dot: !!state.querySelector('span[aria-hidden="true"]'),
    header: norm(pop?.shadowRoot?.querySelector('.header-status')?.textContent),
    history: norm(history?.textContent),
    rows: Array.from(history?.querySelectorAll('.kl-ev') || [], (row) => ({
      clock: norm(row.children[0]?.textContent),
      what: norm(row.children[2]?.children[0]?.textContent),
      age: norm(row.children[2]?.children[1]?.textContent),
      mark: norm(row.children[3]?.textContent)
    })), ringClock: norm(new Date(q.rangAt).toLocaleTimeString(window.casoraLocale?.(), { hour: 'numeric', minute: '2-digit' })) };
};
const ringRow = (v) => v.rows.find((r) => r.clock === v.ringClock && r.what === words[0]);
await page.screenshot({ path: OUT + '/before-popup-nl.png' });
await need('observed real ring timestamp and visible popup output', await page.evaluate(read).then((v) =>
   v.dot && v.header.includes(words[0]) && ringRow(v)?.mark === words[6])
   && await page.evaluate(() => Number.isFinite(window.__doorbellTime.rangAt)));
let previousRows = (await page.evaluate(read)).rows;
for (const [minutes, tileWord, ago, hot] of [[2.5, words[1], words[3], true],
  [9.5, words[2], words[4], true], [10.5, null, words[5], false]]) {
  await page.evaluate((m) => {
    const q = window.__doorbellTime; q.offset = q.rangAt + m * 60000 - q.realNow();
  }, minutes);
  let value;
  const until = Date.now() + 11500;
  do {
    value = await page.evaluate(read);
    if ((tileWord ? value.tile === tileWord : value.tile === words[7])
      && value.dot === hot && value.header.includes(ago) && ringRow(value)?.age === ago
      && (ringRow(value)?.mark === words[6]) === hot) break;
    await page.waitForTimeout(100);
  } while (Date.now() < until);
  await check(`+${minutes}: tile text and dot`, value.tile === (tileWord || words[7]) && value.dot === hot, value);
  await check(`+${minutes}: popup header age`, value.header.includes(ago) && value.header.includes(words[0]) === hot, value);
  await check(`+${minutes}: newly pressed history row age and new mark`, ringRow(value)?.age === ago && ringRow(value)?.mark === (hot ? words[6] : ''), value);
  // Older hour/day labels need not change at each minute checkpoint.
  await check(`+${minutes}: every visible minute history age advances`, value.rows.filter((r) => r.age === 'zojuist' || / min geleden$/.test(r.age)).every((r) => {
    const before = previousRows.find((p) => p.clock === r.clock && p.what === r.what);
    return before && r.age !== before.age;
  }) && value.rows.some((r) => r.age), value.rows);
  previousRows = value.rows;
  await check(`+${minutes}: camera unchanged`, await page.evaluate((id) => {
    const q = window.__doorbellTime;
    return q.changes === 0 && JSON.stringify(document.querySelector('home-assistant').hass.states[id]) === q.camera;
  }, id));
  console.log('  observation', JSON.stringify({ minutes, ...value, elapsedMs: Date.now() - started }));
  await page.screenshot({ path: OUT + '/after-' + minutes + '-popup-nl.png' });
}
await page.evaluate(() => window.casoraPopup.close());
await page.waitForFunction(() => !window.__pierce('casora-popup').some((p) => p.hasAttribute('open')));
await page.screenshot({ path: OUT + '/after-tile-nl.png' });
await check('camera images blocked from start', blocked > 0, { blocked });
await check('clock redraws reuse history within 15 minutes', historyIds.size === requestsBefore, { before: requestsBefore, after: historyIds.size });
console.log('  recorder requests', JSON.stringify({ before: requestsBefore, after: historyIds.size, replies: replies.size }));
await check('under two minutes', Date.now() - started < 120000, { elapsedMs: Date.now() - started });
console.log('  total elapsedMs', Date.now() - started);
await finish();
