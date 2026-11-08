// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/local/43-aufgaben.js#_casoraTasks dashboards/casora/button_card_templates.json#casora_popup_tasks
// Tasks tile: several to-do lists in one popup. Chips filter this browser's view, a tap ticks an item off, "Add" asks
// which list and sends only what that list supports; a long list name is not cut on the phone.
import { open, casoraDashboard, ready, check, need, finish, fakeStates, usePage } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora dashboard', dash);
const SHOT = process.env.CASORA_SHOT_DIR;
const LISTS = { 'todo.qa_shop': ['Milch', 'Nudeln', 'Käse'], 'todo.qa_house': ['Mow the lawn', 'Change the filter'], 'todo.qa_paper': ['Check the insurance'] };
const NAMES = { 'todo.qa_shop': 'Einkaufsliste', 'todo.qa_house': 'Haus & Garten', 'todo.qa_paper': 'Organisation & Verwaltung' };
for (const [tag, o] of [['Desktop', { width: 1280, height: 860, dark: false }], ['Phone', { width: 393, height: 852, mobile: true, touch: true, scale: 3, dark: true }]]) {
  const { page } = await open(o);
  usePage(page);
  await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraTasks && !!window.casoraPopup && !!window._casoraShopping, 60000);
  const patch = {};
  for (const id in LISTS) patch[id] = { state: String(LISTS[id].length), attributes: { friendly_name: NAMES[id], supported_features: id === 'todo.qa_paper' ? 1 : 87 } };
  await fakeStates(page, patch, { sticky: true });
  const E = (src, arg) => page.evaluate(([src, arg]) => new Function('arg', 'return (async () => {' + src + '})()')(arg), [src, arg]);
  await E(`const L = arg, S = window._casoraShopping, tail = S.items;
    const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    S.items = (h, id) => L[id] ? { open: L[id].map((s, i) => ({ summary: s, uid: id + i, status: 'needs_action', due: i === 0 && id === 'todo.qa_house' ? day(-1) : i === 1 && id === 'todo.qa_shop' ? day(1) : undefined, description: i === 0 && id === 'todo.qa_shop' ? '2 Liter' : undefined })), done: id === 'todo.qa_shop' ? [{ summary: 'Bread', uid: 'd1', status: 'completed' }] : [] } : tail(h, id);
    window._casoraTasks.sel = 'all';
    const h = document.querySelector('home-assistant').hass;
    window.__calls = []; window.__oc = h.callService;
    h.callService = (d, s, data, target) => { window.__calls.push({ d, s, data, target }); return Promise.resolve(); };
    const v = { lists: Object.keys(L) };
    await window.casoraPopup.open({ title: 'Aufgaben', variant: 'v3', dismissable: true, content: window._casoraTasks.popup(h.states, h, v) });`, LISTS);
  await page.waitForTimeout(2200);
  const P = 'window.__pierce';
  const chips = () => E(`return ${P}('.tchip').filter((c) => c.getClientRects().length).map((c) => ({ t: c.textContent, on: c.classList.contains('on'), cut: c.scrollWidth > c.clientWidth + 1 }));`);
  const texts = () => E(`return ${P}('[data-tasks-box="list"]').map((b) => b.textContent).join(' ');`);
  const c1 = await chips();
  await check(tag + ': a chip per list plus All, with counts', c1.length === 4 && /Alle.*6/.test(c1[0].t) && c1[0].on, c1);
  await check(tag + ': no chip is cut off', c1.every((c) => !c.cut), c1);
  const all = await texts();
  await check(tag + ': all lists with their items', /Milch/.test(all) && /Mow the lawn/.test(all) && /Check the insurance/.test(all) && /2 Liter/.test(all), all.slice(0, 200));
  await check(tag + ': a late item says so', /Überfällig|Overdue/.test(all), all.slice(0, 200));
  const doneText = () => E(`return ${P}('[data-tasks-box="done"]').map((b) => b.textContent).join(' ');`);
  await check(tag + ': done items start folded', /1 erledigt|1 done/.test(await doneText()) && !/Bread/.test(await doneText()), await doneText());
  await E(`${P}('[data-tasks="done"]')[0].click();`);
  await page.waitForTimeout(250);
  await check(tag + ': unfolded they are struck through', /Bread/.test(await doneText()) && (await E(`return ${P}('[data-tasks-box="done"] [style*="line-through"]').length;`)) === 1);
  if (SHOT) await page.screenshot({ path: SHOT + '/tasks-' + tag + '.png' });
  // Found by a user test: the tile's other list must not take over the open popup, and a finger must reach the chips.
  await check(tag + ': another tile with its own lists leaves the popup alone', await E(`const h = document.querySelector('home-assistant').hass; window._casoraTasks.load(h, { lists: ['todo.qa_paper'] }); return window._casoraTasks.vars.lists.length === 3;`));
  if (tag === 'Phone') {
    const at = await E(`const r = ${P}('.tchip')[1].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };`);
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    await check(tag + ': a finger on a chip filters', (await E('return window._casoraTasks.sel;')) === 'todo.qa_shop', await E('return window._casoraTasks.sel;'));
    await page.waitForTimeout(800); // the click that can follow a tap is ignored for 700 ms
    await E(`${P}('.tchip')[0].click();`);
    await page.waitForTimeout(250);
  }
  await E(`${P}('.tchip')[2].click();`);
  await page.waitForTimeout(300);
  const one = await texts();
  await check(tag + ': a chip shows that list only', /Mow the lawn/.test(one) && !/Milch/.test(one), one.slice(0, 200));
  await check(tag + ': the filter is kept in this browser', (await E(`return localStorage.getItem('casora_tasks_filter');`)) === 'todo.qa_house');
  const btns = await E(`return ${P}('[data-tasks-box="list"] .hui-srow').slice(0, 1).map((r) => [...r.querySelectorAll('.trb')].map((b) => ({ x: b.classList.contains('x'), s: JSON.parse(b.getAttribute('data-casora-svc')), w: b.getBoundingClientRect().width })))[0];`);
  await check(tag + ': X then tick on the right, big enough', btns && btns.length === 2 && btns[0].x && btns[0].s.service === 'remove_item' && !!btns[0].s.confirm && btns[1].s.service === 'update_item' && btns.every((b) => b.w >= 44), btns && btns.map((b) => [b.x, b.s.service, b.w]));
  await E(`${P}('.tchip')[0].click();`);
  await page.waitForTimeout(250);
  const icons = await E(`return ${P}('[data-tasks-box="list"] .hui-srow').map((r) => [r.textContent.trim(), r.querySelector('ha-icon').getAttribute('icon')]);`);
  await check(tag + ': an item has its symbol as on the shopping list', icons.some((x) => /Milch/.test(x[0]) && x[1] === 'mdi:cup'), icons);
  await E(`${P}('.tchip')[2].click();`);
  await page.waitForTimeout(250);
  await E(`${P}('[data-tasks-box="list"] .trb.x')[0].click(); await new Promise((x) => setTimeout(x, 350));`);
  const yes = await E(`const h = document.querySelector('.casora-askfirst'); const t = h && h.shadowRoot.querySelector('.yes').textContent; if (h) h.shadowRoot.querySelector('.no').click(); return t;`);
  await check(tag + ': the delete question says Delete', /Löschen|Delete/.test(yes || ''), yes);
  await page.waitForTimeout(200);
  await E(`${P}('[data-tasks-box="list"] .trb:not(.x)')[0].click(); await new Promise((x) => setTimeout(x, 350));`);
  const ticked = await E('return window.__calls[0];');
  await check(tag + ': tapping the row really ticks it off', ticked && ticked.d === 'todo' && ticked.s === 'update_item' && ticked.data.status === 'completed', ticked);
  await E('window.__calls = [];');
  await E(`${P}('[data-tasks="add"]')[0].click();`);
  await page.waitForTimeout(400);
  const R = 'document.querySelector(".casora-taskform").shadowRoot';
  await check(tag + ': the form starts on the shown list', (await E(`return ${R}.getElementById('list').value;`)) === 'todo.qa_house');
  await E(`${R}.querySelector('.yes').click();`);
  await check(tag + ': no text: it says so and sends nothing', /Aufgabe|task/.test(await E(`return ${R}.getElementById('err').textContent;`)) && (await E('return window.__calls.length;')) === 0);
  await E(`const r = ${R}; r.getElementById('list').value = 'todo.qa_paper'; r.getElementById('list').dispatchEvent(new Event('change'));`);
  await check(tag + ': a list without notes and dates hides those fields', await E(`const r = ${R}; return r.getElementById('fN').style.display === 'none' && r.getElementById('fD').style.display === 'none';`));
  await E(`const r = ${R}; r.getElementById('title').value = 'QA task'; r.querySelector('.yes').click(); await new Promise((x) => setTimeout(x, 250));`);
  const sent = await E('return window.__calls[0];');
  await check(tag + ': the item goes to the chosen list', sent && sent.d === 'todo' && sent.s === 'add_item' && sent.target.entity_id === 'todo.qa_paper' && sent.data.item === 'QA task' && !('description' in sent.data), sent);
  await check(tag + ': the form closes', await E(`return !document.querySelector('.casora-taskform');`));
  await E(`document.querySelector('home-assistant').hass.callService = window.__oc; localStorage.removeItem('casora_tasks_filter');`);
  await page.context().browser().close();
}
await finish();
