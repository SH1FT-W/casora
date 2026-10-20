// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel-community.js
// Reported: the Community page could not be scrolled, on the phone and on a small desktop. The dialog sat
// centered in a fixed pane without overflow, so the title, "Request a card…" and "Close" were cut off and
// swiping or the mouse wheel moved nothing. Then: the entries sat in a frame (Studio's .card style), and on
// the phone Community was only reachable through "Add tile".
// Expected: the dialog fits the screen, its head (title, text, request, list label) and "Close" stay in place,
// only the list scrolls (touch on the phone, wheel on the desktop); entries without a frame; on the phone
// the "…" menu opens Community. A short dialog stays as it was.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora dashboard for the Studio', dash);

const measure = (page) => page.evaluate(() => {
  const root = window.__panel().shadowRoot;
  const ps = root.querySelectorAll('.askpane');
  const a = ps[ps.length - 1];
  if (!a) return null;
  const card = a.querySelector('.askcard');
  const body = card.querySelector(':scope > .askbody') || card;
  const r = (e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
  const last = a.querySelector('.askacts button:last-child');
  const lr = r(last);
  const hit = root.elementFromPoint(lr.x, lr.y);
  const row = card.querySelector('.comrow');
  return { vh: innerHeight, content: body.scrollHeight, client: body.clientHeight, scrollTop: Math.round(body.scrollTop),
    stack: r(a.querySelector('.askstack')), title: r(card.querySelector('h3')), last: lr,
    lastHit: !!(hit && (hit === last || last.contains(hit))), body: r(body), hasBody: body !== card,
    rowBg: row ? getComputedStyle(row).backgroundColor : null };
});
const closeAsk = (page) => page.evaluate(() => {
  const ps = window.__panel().shadowRoot.querySelectorAll('.askpane');
  const a = ps[ps.length - 1];
  if (a) a.querySelector('.askacts button:last-child').click();
});
const visibleBox = (m, b) => b.top >= 0 && b.bottom <= m.vh;

for (const [name, o] of [
  ['phone', { width: 390, height: 844, mobile: true, scale: 3 }],
  ['desktop', { width: 1280, height: 720 }],
]) {
  const { page } = await open(o);
  usePage(page);
  await studio(page, dash);
  if (o.mobile) {
    // Phone: Community from the "…" menu.
    // The sheet the test frame opened covers the bar; closed, the "…" button is free as for a user.
    await page.evaluate(() => { const p = window.__panel(); p._bOpen = false; p._renderForm(); });
    await page.waitForTimeout(900);
    await page.locator('#more').first().click();
    await page.waitForTimeout(700);
    const opt = page.locator('.combo-opt', { hasText: 'Community-Karten' }).first();
    const picked = (await opt.count()) > 0;
    if (picked) await opt.click();
    await check('phone: "…" menu offers Community', picked);
    if (!picked) page.evaluate(() => window.__panel()._comCatalog()).catch(() => {});
  } else {
    // Without await: the page stays open until the test closes it.
    page.evaluate(() => window.__panel()._comCatalog()).catch(() => {});
  }
  await page.waitForTimeout(2500);
  let m = await measure(page);
  await need(`${name}: Community page open`, m && /Community/.test(await page.evaluate(() => [...window.__panel().shadowRoot.querySelectorAll('.askpane h3')].pop().textContent)), m);
  await need(`${name}: list longer than its space`, m.content > m.client + 40, m);
  await check(`${name}: dialog fits the screen`, visibleBox(m, m.stack), m.stack);
  await check(`${name}: title visible at the start`, visibleBox(m, m.title), m.title);
  await check(`${name}: "Close" visible and tappable at the start`, visibleBox(m, m.last) && m.lastHit, m.last);
  await check(`${name}: only the list scrolls (.askbody)`, m.hasBody, m);
  await check(`${name}: entries without a frame`, m.rowBg === 'rgba(0, 0, 0, 0)' || m.rowBg === 'transparent', m.rowBg);

  // Scroll the way a user does: swipe on the phone, wheel on the desktop.
  const title0 = m.title.top;
  const scroll = async () => {
    if (o.mobile) {
      const c = await page.context().newCDPSession(page);
      await c.send('Input.synthesizeScrollGesture', { x: m.body.x, y: m.body.y, yDistance: -Math.round(m.client * 0.6), gestureSourceType: 'touch', speed: 1500 });
      await c.detach();
    } else {
      await page.mouse.move(m.body.x, m.body.y);
      await page.mouse.wheel(0, Math.round(m.client * 0.6));
    }
    await page.waitForTimeout(500);
  };
  await scroll();
  const first = await measure(page);
  await check(`${name}: list scrolls (${o.mobile ? 'touch' : 'wheel'})`, first.scrollTop > 0, { scrollTop: first.scrollTop });
  await check(`${name}: head stays in place while scrolling`, first.title.top === title0, { before: title0, after: first.title.top });
  for (let i = 0; i < 20 && m.scrollTop < m.content - m.client - 2; i++) { await scroll(); m = await measure(page); }
  m = await measure(page);
  await check(`${name}: list reaches its end, "Close" still tappable`, m.scrollTop >= m.content - m.client - 2 && visibleBox(m, m.last) && m.lastHit,
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
