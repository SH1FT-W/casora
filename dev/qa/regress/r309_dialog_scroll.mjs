// @zustand: arbeit
// @parallel: ui
// Reported: the Community page could not be scrolled, on the phone and on a small desktop. The dialog sat
// centered in a fixed pane without overflow, so the title, "Request a card…" and "Close" were cut off and
// swiping or the mouse wheel moved nothing. Expected: the dialog fits the screen and its card scrolls
// (touch on the phone, wheel on the desktop) down to the last button; a short dialog stays as it was.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora dashboard for the Studio', dash);

const measure = (page) => page.evaluate(() => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  const a = ps[ps.length - 1];
  if (!a) return null;
  const card = a.querySelector('.askcard');
  const r = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
  const last = a.querySelector('.askacts button:last-child');
  const lr = r(last);
  const hit = window.__panel().shadowRoot.elementFromPoint(lr.x, lr.y);
  return { vh: innerHeight, content: card.scrollHeight, client: card.clientHeight, scrollTop: Math.round(card.scrollTop),
    stack: r(a.querySelector('.askstack')), title: r(card.querySelector('h3')), last: lr,
    lastHit: !!(hit && (hit === last || last.contains(hit))), card: r(card) };
});
const closeAsk = (page) => page.evaluate(() => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  const a = ps[ps.length - 1];
  if (a) a.querySelector('.askacts button:last-child').click();
});

for (const [name, o] of [
  ['phone', { width: 390, height: 844, mobile: true, scale: 3 }],
  ['desktop', { width: 1280, height: 720 }],
]) {
  const { page } = await open(o);
  usePage(page);
  await studio(page, dash);
  // Without await: the page stays open until the test closes it.
  page.evaluate(() => window.__panel()._comCatalog()).catch(() => {});
  await page.waitForTimeout(2500);
  let m = await measure(page);
  await need(`${name}: Community page taller than the screen`, m && m.content > m.vh, m);
  await check(`${name}: dialog fits the screen`, m.stack.top >= 0 && m.stack.bottom <= m.vh, m.stack);
  await check(`${name}: title visible at the start`, m.title.top >= 0 && m.title.bottom <= m.vh, m.title);

  // Scroll the way a user does: swipe on the phone, wheel on the desktop.
  const scroll = async () => {
    if (o.mobile) {
      const c = await page.context().newCDPSession(page);
      await c.send('Input.synthesizeScrollGesture', { x: m.card.x, y: m.card.y, yDistance: -Math.round(m.vh * 0.6), gestureSourceType: 'touch', speed: 1500 });
      await c.detach();
    } else {
      await page.mouse.move(m.card.x, m.card.y);
      await page.mouse.wheel(0, Math.round(m.vh * 0.6));
    }
    await page.waitForTimeout(500);
  };
  await scroll();
  const first = await measure(page);
  await check(`${name}: card scrolls (${o.mobile ? 'touch' : 'wheel'})`, first.scrollTop > 0, { scrollTop: first.scrollTop });
  for (let i = 0; i < 12 && m.scrollTop < m.content - m.client - 2; i++) { await scroll(); m = await measure(page); }
  m = await measure(page);
  await check(`${name}: "Close" reachable at the end and tappable`, m.last.top >= 0 && m.last.bottom <= m.vh && m.lastHit,
    { last: m.last, hit: m.lastHit, scrollTop: m.scrollTop, max: m.content - m.client });

  // A short dialog keeps its look: no scrolling, centered.
  await closeAsk(page);
  await page.waitForTimeout(600);
  page.evaluate(() => window.__panel()._ask({ title: 'QA', message: 'Short dialog' })).catch(() => {});
  await page.waitForTimeout(800);
  const s = await measure(page);
  await check(`${name}: short dialog does not scroll and stays centered`, s && s.content <= s.client + 1
    && Math.abs((s.stack.top + s.stack.bottom) / 2 - s.vh / 2) <= 2, s);
  await closeAsk(page);
}
await finish();
