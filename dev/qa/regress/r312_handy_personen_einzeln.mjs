// @zustand: arbeit
// @parallel: ui
// Reported (#40, 26.10.50): on the phone's start page, "Separate people badges" or a single person
// showed the person's name, but a tap set the People filter instead of opening the person popup.
// Expected as on the desktop (casora_room): the People filter badge only for two or more people
// without show_people_inline, otherwise one badge per person, and a tap opens the person popup.
// Nothing is saved: people and the desktop switch only in the browser (setConfig, fakeStates,
// casoraPhoneRoom.prime).
import { open, casoraDashboards, dashboard, fakeStates, check, need, finish, usePage } from './lib.mjs';

const phone = (await casoraDashboards()).find((d) => d.mobile && JSON.stringify(d.config).includes('casora_mobile_filter_badges'));
await need('Phone dashboard with the start badge row', phone);

const A = 'person.casora_test', B = 'person.qa_second';
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true, theme: 'Casora' });
usePage(page);
await dashboard(page, phone.url + '/' + (phone.config.views[0].path || '0'), 3);
await page.evaluate(() => window._casoraFilter.set('all'));
await fakeStates(page, {
  [A]: { state: 'not_home', attributes: { friendly_name: 'Alex Example' } },
  [B]: { state: 'home', attributes: { friendly_name: 'Billie Example' } },
}, { sticky: true });
const server = await page.evaluate((u) => document.querySelector('home-assistant').hass
  .callWS({ type: 'casora/phone_room_badges', url_path: u }), phone.url);
await need('Server answers casora/phone_room_badges', server && server.rooms, server);

// People on the start row and the desktop's switch, then the visible people badges.
const setup = async (people, inline) => {
  await page.evaluate(({ people, inline, rooms, home }) => {
    const el = window.__pierce('button-card').find((b) => [].concat((b._config || {}).template || []).includes('casora_mobile_filter_badges'));
    const cfg = JSON.parse(JSON.stringify(el._config));
    [1, 2, 3, 4].forEach((n) => { cfg.variables['presence_entity_' + n] = people[n - 1] || null; });
    el.setConfig(cfg);
    el.hass = document.querySelector('home-assistant').hass;
    window.casoraPhoneRoom.prime(rooms, { ...(home || {}), show_people: true, show_people_inline: inline });
  }, { people, inline, rooms: server.rooms, home: server.home });
  await page.waitForTimeout(1500);
  return page.evaluate(() => window.__pierce('button-card')
    // The template list is resolved (casora_badge_base first; since 26.10.63 the phone's group badge adds its popup).
    .map((b) => ({ b, t: [].concat(b._config?.template || []).find((x) => /^casora_badge_presence/.test(String(x))) }))
    .filter(({ b, t }) => t && b.getBoundingClientRect().width > 0)
    .map(({ b, t }) => t + (b._config.entity ? ':' + b._config.entity : '')))
    // setConfig in the browser repeats the row's cards (only here, the dashboard never does this).
    .then((xs) => [...new Set(xs)]);
};

const group = await setup([A, B], false);
await check('two people: one People filter badge', group.length === 1 && group[0].startsWith('casora_badge_presence_group'), group);
const both = await setup([A, B], true);
await check('two people, separate: one badge each', JSON.stringify(both) === JSON.stringify(['casora_badge_presence:' + A, 'casora_badge_presence:' + B]), both);
const one = await setup([A], false);
await check('one person: own badge without the switch', JSON.stringify(one) === JSON.stringify(['casora_badge_presence:' + A]), one);

// Tap: the person popup opens, the filter stays.
await page.evaluate((id) => {
  const b = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_badge_presence')
    && b._config.entity === id && b.getBoundingClientRect().width > 0);
  b.scrollIntoView({ block: 'nearest', inline: 'center' });
}, A);
await page.waitForTimeout(600);
const at = await page.evaluate((id) => {
  const b = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_badge_presence')
    && b._config.entity === id && b.getBoundingClientRect().width > 0
    && b.getBoundingClientRect().left >= 0 && b.getBoundingClientRect().right <= innerWidth);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}, A);
await need('person badge in view', at);
await page.mouse.click(at.x, at.y);
let opened = false;
for (let i = 0; i < 12 && !opened; i++) {
  await page.waitForTimeout(400);
  opened = await page.evaluate(() => !!(window.casoraPopup && window.casoraPopup.element && window.casoraPopup.element.hasAttribute('open')));
}
await check('tap opens the person popup', opened);
await check('tap leaves the filter alone', (await page.evaluate(() => window._casoraFilter.get())) === 'all');

await finish();
