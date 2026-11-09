// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/06-kalender.js#K.addDialog,K.writable,K.eventData
// Issue #146: the calendar popup offers "Add event" when a calendar can take one. The form validates, sends
// calendar.create_event with what was entered, and closes; a failing service keeps the form open and says so.
import { open, casoraDashboard, ready, check, need, finish, fakeStates, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard', dash);
const SHOT = process.env.CASORA_SHOT_DIR;
for (const [tag, o] of [['Desktop', { width: 1280, height: 860, dark: false }], ['Phone', { width: 393, height: 852, mobile: true, scale: 3, dark: true }]]) {
  const { page } = await open(o);
  usePage(page);
  await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraCalendar && !!window.casoraPopup, 60000);
  await fakeStates(page, { 'calendar.qa_rw': { state: 'off', attributes: { friendly_name: 'QA', supported_features: 7 } }, 'calendar.qa_second': { state: 'off', attributes: { friendly_name: 'QA 2', supported_features: 1 } }, 'calendar.qa_ro': { state: 'off', attributes: { friendly_name: 'Read only' } } }, { sticky: true });
  const E = (src, arg) => page.evaluate(([src, arg]) => new Function('arg', 'return (async () => {' + src + '})()')(arg), [src, arg]);
  await E(`const K = window._casoraCalendar; K._vars = { calendars: [{ entity: 'calendar.qa_ro', name: 'Read only', color: '#888' }, { entity: 'calendar.qa_rw', name: 'QA', color: '#4A9D98' }, { entity: 'calendar.qa_second', name: 'QA 2', color: '#D35A4E' }] };
    const ha = document.querySelector('home-assistant'), h = ha.hass;
    window.__calls = []; window.__fail = false;
    window.__origCall = h.callService;
    h.callService = (d, s, data, target) => { window.__calls.push({ d, s, data, target }); return window.__fail ? Promise.reject(new Error('no')) : Promise.resolve(); };`);
  const offered = await E(`return window._casoraCalendar.html('day', window._casoraCalendar._vars);`);
  await check(tag + ': the day section offers Add event', /data-hcal="add:/.test(offered) && /Termin hinzufügen|Add event/.test(offered));
  const dayHtml = offered.slice(offered.lastIndexOf('</style>'));
  await check(tag + ': the button comes before the day heading (#146)', dayHtml.indexOf('data-hcal="add:') >= 0 && dayHtml.indexOf('data-hcal="add:') < dayHtml.search(/Heute|Today|, \d/), dayHtml.slice(0, 300));
  const none = await E(`return window._casoraCalendar.html('day', { calendars: [{ entity: 'calendar.qa_ro', name: 'Read only', color: '#888' }] });`);
  await check(tag + ': a read-only calendar gets no button', !/data-hcal="add:/.test(none));

  // In the real popup the button's symbol and word sit together (a user test saw them pushed apart).
  await E(`const K = window._casoraCalendar, h = document.querySelector('home-assistant').hass; await window.casoraPopup.open({ title: 'Kalender', variant: 'v3', dismissable: true, content: K.popup(null, K._vars, h.states, h) });`);
  await page.waitForTimeout(2200);
  const gap = await E(`const b = window.__pierce('.hcal-add').find((x) => x.getClientRects().length); if (!b) return null; return b.querySelector('span').getBoundingClientRect().left - b.querySelector('ha-icon').getBoundingClientRect().right;`);
  await check(tag + ': symbol and word stay together', gap != null && gap >= 0 && gap <= 14, gap);
  if (SHOT) await page.screenshot({ path: SHOT + '/cal-btn-' + tag + '.png' });
  await E(`window.casoraPopup.close();`);
  await page.waitForTimeout(600);
  await E(`window._casoraCalendar._vars = { calendars: [{ entity: 'calendar.qa_ro', name: 'Read only', color: '#888' }, { entity: 'calendar.qa_rw', name: 'QA', color: '#4A9D98' }, { entity: 'calendar.qa_second', name: 'QA 2', color: '#D35A4E' }] };`);
  await E(`window._casoraCalendar.addDialog('2026-11-16');`);
  await page.waitForTimeout(400);
  const R = 'document.querySelector(".casora-calform").shadowRoot';
  const opts = await E(`return [...${R}.querySelectorAll('#cal option')].map((x) => x.value);`);
  await check(tag + ': only writable calendars to choose', opts.join() === 'calendar.qa_rw,calendar.qa_second', opts);
  const fits = await E(`const b = ${R}.querySelector('.box').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;`);
  await check(tag + ': the form fits the screen', fits);
  await E(`${R}.querySelector('.yes').click();`);
  const err = await E(`return ${R}.querySelector('#err').textContent;`);
  await check(tag + ': no title: it says so and sends nothing', /Titel|title/.test(err) && (await E('return window.__calls.length;')) === 0, err);
  if (SHOT) await page.screenshot({ path: SHOT + '/cal-' + tag + '.png' });
  await E(`const r = ${R}; const set = (id, v) => { const e = r.getElementById(id); e.value = v; e.dispatchEvent(new Event('change')); };
    set('title', 'QA event'); set('loc', 'Town'); set('desc', 'Bring card'); set('cal', 'calendar.qa_second'); set('sD', '2026-11-16'); set('sT', '10:30');`);
  const endFollows = await E(`return ${R}.getElementById('eD').value + ' ' + ${R}.getElementById('eT').value;`);
  await check(tag + ': the end follows the start', endFollows === '2026-11-16 11:30', endFollows);
  await E(`window.__fail = true; ${R}.querySelector('.yes').click(); await new Promise((r) => setTimeout(r, 200));`);
  const failed = await E(`const h = document.querySelector('.casora-calform'); return { open: !!h, err: h && h.shadowRoot.querySelector('#err').textContent, on: h && !h.shadowRoot.querySelector('.yes').disabled };`);
  await check(tag + ': a failing service keeps the form and says so', failed.open && /gespeichert|saved/.test(failed.err) && failed.on, failed);
  await E(`window.__fail = false; window.__calls = []; ${R}.querySelector('.yes').click(); await new Promise((r) => setTimeout(r, 300));`);
  const sent = await E('return window.__calls[0];');
  await check(tag + ': the event is sent to the chosen calendar', sent && sent.d === 'calendar' && sent.s === 'create_event' && sent.target.entity_id === 'calendar.qa_second'
    && sent.data.summary === 'QA event' && sent.data.location === 'Town' && sent.data.description === 'Bring card' && sent.data.start_date_time === '2026-11-16 10:30:00' && sent.data.end_date_time === '2026-11-16 11:30:00', sent);
  await check(tag + ': the form closes', await E(`return !document.querySelector('.casora-calform');`));
  await E(`const ha = document.querySelector('home-assistant'); ha.hass.callService = window.__origCall;`);
  await page.context().browser().close();
}
await finish();
