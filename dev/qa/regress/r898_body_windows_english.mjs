// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/scripts/casora-i18n.js#watchWindow,watchBody,rescan custom_components/casora/scripts/casora-core.js#openMenu,tlEntries
// Issue #175 (daxy01, 17.11.2026): in the English bell, an open stack's timeline showed „Aus“, „Aktiv · Zuhause“,
// „Gestern“, „vor 2 Std.“. The bell hangs on <body>, outside the tiles and popups the translation watches (r151
// was the same for the ⋯ menu). Casora's windows on <body> now carry data-casora-window and are watched.
// Expected (English, desktop 1440):
//   1. The open bell carries the mark.
//   2. German text put into the open bell later (as the timeline does) turns English: „Gestern“ → „Yesterday“,
//      „vor 2 Std.“ → „2 h ago“; an own name (data-no-i18n) stays.
//   3. An element on <body> without the mark is left alone.
import { open, usePage, casoraDashboard, check, need, finish, ready } from './lib.mjs';

const dash = await casoraDashboard((d) => !d.mobile);
await need('ein Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, lang: 'en' });
usePage(page);
await ready(page, '/' + dash.url + '/' + (dash.config.views[0].path || '0'), () => !!window._casoraNotify && !!window._casoraLocalLoaded, 60000);
const bellAt = await page.evaluate(() => {
  const q = window.__pierce('.casora-bell').map((e) => e.getBoundingClientRect()).find((r) => r.width > 0 && r.top >= 0 && r.bottom <= innerHeight);
  return q && { x: q.x + q.width / 2, y: q.y + q.height / 2 };
});
await need('Glocke in der Kopfleiste', bellAt, bellAt);
await page.mouse.click(bellAt.x, bellAt.y);
await page.waitForTimeout(1200);
const marked = await page.evaluate(() => {
  const m = document.querySelector('body > .casora-notify-menu');
  return m ? m.hasAttribute('data-casora-window') : null;
});
await need('Glocke offen', marked !== null);
await check('1. offene Glocke trägt die Markierung', marked === true);

const got = await page.evaluate(async () => {
  const m = document.querySelector('body > .casora-notify-menu');
  const box = document.createElement('div');
  box.innerHTML = '<div class="qa-a">Gestern</div><small class="qa-b">vor 2 Std.</small><span class="qa-c" data-no-i18n>Aus</span>';
  m.appendChild(box);
  const plain = document.createElement('div');
  plain.className = 'qa-plain'; plain.textContent = 'Gestern';
  document.body.appendChild(plain);  // casora-window: none, the test's own unmarked probe
  await new Promise((r) => setTimeout(r, 600));
  const out = { a: box.querySelector('.qa-a').textContent, b: box.querySelector('.qa-b').textContent, c: box.querySelector('.qa-c').textContent, plain: plain.textContent };
  box.remove(); plain.remove();
  return out;
});
await check('2. später eingesetzter Text wird englisch („' + got.a + '“, „' + got.b + '“)', got.a === 'Yesterday' && got.b === '2 h ago', got);
await check('2. eigener Name (data-no-i18n) bleibt', got.c === 'Aus', got);
await check('3. Element ohne Markierung bleibt unberührt', got.plain === 'Gestern', got);
await finish();
