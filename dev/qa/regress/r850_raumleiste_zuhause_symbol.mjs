// @zustand: arbeit
// @parallel: allein
// @deckt: custom_components/casora/scripts/casora-core.js#navNamesOf,_syncNames,_setHomeIcon custom_components/casora/panel/casora-panel-settings.js custom_components/casora/panel/casora-panel.js#nav_names
// Room bar "Show names" (owner, 14.11.2026): Settings › Look & feel gets a block "Room bar" (only this dashboard)
// right before "Clock" with two segments, "All" (default, as before) and "Without Home text" (Home only as its round
// house icon, the rooms keep their names). Expected:
//  1. nothing stored: the bar as before (Home with its text)
//  2. Studio: block before Clock, badge, exactly two choices, "All" chosen; picking the other draws the preview's
//     Home as a house circle; "Save settings" stores nav_names "rooms" on this dashboard only
//  3. desktop and tablet, light and dark: Home a round 38 px button without text, aria-label "Zuhause", the rooms
//     with their names; the phone is unchanged; another dashboard keeps its text
//  4. reloaded Studio shows the stored choice; "All" again removes the value and the text is back
process.env.CASORA_THEME = process.env.CASORA_THEME || 'Casora';
import { open, usePage, studio, casoraDashboards, casoraDashboard, dashboard, cards, check, need, finish, atFinish, shot } from './lib.mjs';
import { ws } from '../ws.mjs';

const d = await casoraDashboard((x) => x.url === 'qa-arbeit');
await need('qa-arbeit with a phone twin', d && d.phone, d && d.url);
const other = (await casoraDashboards()).find((x) => !x.mobile && x.url !== d.url);
const SHOT = process.env.CASORA_SHOT_DIR;
const c = await ws();
const cfg = (url) => c.cmd({ type: 'lovelace/config', url_path: url });
const [desk0, phone0] = [await cfg(d.url), await cfg(d.phone.url)];
const other0 = other ? JSON.stringify(await cfg(other.url)) : null;
atFinish(async () => { const c2 = await ws(); await c2.cmd({ type: 'lovelace/config/save', url_path: d.url, config: desk0 });
  await c2.cmd({ type: 'lovelace/config/save', url_path: d.phone.url, config: phone0 }); c2.close(); });
const heroes = (conf) => (conf.views || []).map((v) => (((v.cards || [])[0] || {}).variables || {}).nav_names);
await need('nothing stored at the start', heroes(desk0).every((x) => x === undefined), heroes(desk0));

const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const DEVICES = [
  ['Desktop light', { width: 1440, height: 900, dark: false }],
  ['Desktop dark', { width: 1440, height: 900, dark: true }],
  ['Tablet light', { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA, dark: false }],
  ['Tablet dark', { width: 1024, height: 768, mobile: true, touch: true, userAgent: IPAD_UA, dark: true }],
];
const home = (dash) => dash.url + '/' + ((dash.config.views[0] || {}).path || '0');

// The visible bar: Home's box and text, its aria-label, the rooms' names.
const measure = (pg) => pg.evaluate(() => {
  const nav = window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length)[0];
  if (!nav) return null;
  const sr = nav.shadowRoot, h = sr.querySelector('.route.home'), htx = h && h.querySelector('.htx');
  if (!h) return { noHome: true };
  const r = h.getBoundingClientRect(), tr = htx ? htx.getBoundingClientRect() : { width: 0 };
  const bar = sr.querySelector('.rooms').getBoundingClientRect();
  const rooms = [...sr.querySelectorAll('.rooms .route')].map((b) => ({ t: b.textContent.trim(), r: b.getBoundingClientRect() }))
    .filter((x) => x.r.width > 0 && x.r.left >= bar.left - 1 && x.r.right <= bar.right + 1);
  return { w: Math.round(r.width), h: Math.round(r.height), text: !!htx && getComputedStyle(htx).display !== 'none' && tr.width > 0,
    aria: h.getAttribute('aria-label'), icon: sr.querySelector('.bar').classList.contains('homeicon'),
    rooms: rooms.length, named: rooms.filter((x) => x.t.length > 1 && x.r.width > 30).length };
});
const view = async (label, url, o, file) => {
  const { page: pp, browser } = await open({ ...o, theme: 'Casora' });
  usePage(pp);
  await dashboard(pp, url, 3);
  await pp.waitForFunction(() => window.__pierce('casora-nav-bar').some((e) => e.shadowRoot && e.shadowRoot.querySelector('.route.home')), null, { timeout: 15000 }).catch(() => {});
  await pp.waitForTimeout(800);
  const m = await measure(pp);
  if (SHOT && file) await pp.screenshot({ path: `${SHOT}/${file}.png` });
  await browser.close();
  return m;
};
const phoneTexts = async () => {
  const { page: pp, browser } = await open({ width: 393, height: 852, mobile: true, touch: true, dark: false, theme: 'Casora' });
  usePage(pp);
  await dashboard(pp, home(d.phone), 3);
  const t = (await cards(pp)).filter((x) => x.y < 852).map((x) => x.text).join(' | ');
  const bar = await pp.evaluate(() => window.__pierce('casora-nav-bar').filter((e) => e.getClientRects().length).length);
  await browser.close();
  return { t, bar };
};

// ── 1. default ────────────────────────────────────────────────────────────────
const before = {};
for (const [label, o] of DEVICES) {
  const m = before[label] = await view(label, home(d), o, label === 'Desktop light' ? 'vorher_desktop_hell' : label === 'Tablet dark' ? 'vorher_tablet_dunkel' : null);
  // A very narrow tablet row may already show Home as the circle (tight); the setting must not be needed there.
  await check(`default ${label}: Home as before, no homeicon`, m && !m.icon && (m.text ? m.w > 60 : label.startsWith('Tablet')), m);
}
await check('default Desktop: Home with its text', before['Desktop light'].text, before['Desktop light']);
const phoneBefore = await phoneTexts();

// ── 2. Studio ─────────────────────────────────────────────────────────────────
const { page } = await open({ width: 1440, height: 1000, dark: false, theme: 'Casora' });
usePage(page);
await studio(page, d.url);
const block = () => page.evaluate(() => {
  const p = window.__panel(), sr = p.shadowRoot, b = sr.querySelector('[data-pkey="nb-navbar"]');
  if (!b) return null;
  const opts = [...b.querySelectorAll('.seg.fieldseg .segopt')];
  const mini = sr.querySelector('.mini-tab.home');
  return { next: b.nextElementSibling && b.nextElementSibling.dataset.pkey, title: b.querySelector('.cn-bhead b').firstChild.textContent.trim(),
    badge: (b.querySelector('.cn-only') || {}).textContent, opts: opts.map((o) => o.textContent.trim()), on: opts.filter((o) => o.classList.contains('on')).map((o) => o.dataset.v),
    label: (b.querySelector('.row[data-key="nav_names"] > label') || {}).textContent, hint: [...b.querySelectorAll('.hint')].map((h) => h.textContent).join(' '),
    mini: mini ? { icon: mini.classList.contains('homeicon'), text: mini.textContent, aria: mini.getAttribute('aria-label') } : null };
});
await page.evaluate(() => window.__panel()._csShow('n-look', 'nb-navbar'));
await page.waitForTimeout(1500);
let b = await block();
await check('Studio: block "Raumleiste" right before "Uhr", only this dashboard', b && b.title === 'Raumleiste' && b.next === 'nb-time' && /Nur dieses Dashboard/.test(b.badge || ''), b);
await check('Studio: "Namen zeigen" with exactly "Alle" and "Ohne Zuhause-Text", "Alle" chosen', b && b.label === 'Namen zeigen'
  && JSON.stringify(b.opts) === JSON.stringify(['Alle', 'Ohne Zuhause-Text']) && JSON.stringify(b.on) === '[""]'
  && /Ohne den Text passt ein Raum mehr in die Leiste/.test(b.hint), b);
await check('Studio preview: Home with its text', b && b.mini && !b.mini.icon && b.mini.text.length > 1, b && b.mini);
await page.evaluate(() => window.__panel().shadowRoot.querySelector('[data-pkey="nb-navbar"] .segopt[data-v="rooms"]').click());
await page.waitForTimeout(1200);
b = await block();
await check('Studio preview follows: Home as a house circle, name kept as aria-label', b && b.mini && b.mini.icon && !b.mini.text && /Zuhause|Home/.test(b.mini.aria || ''), b && b.mini);
await check('Studio: "Ohne Zuhause-Text" chosen', b && JSON.stringify(b.on) === '["rooms"]', b && b.on);
if (SHOT) {
  await page.evaluate(() => window.__panel().shadowRoot.querySelector('[data-pkey="nb-navbar"]').scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT}/studio_block.png` });
}
const save = () => page.evaluate(async () => {
  const p = window.__panel(), btn = p.shadowRoot.querySelector('.cs-save:not([disabled])');
  if (!btn) return 'no button';
  btn.click();
  for (let i = 0; i < 60 && (p._csDirty() || (p._cs || {}).busy); i++) await new Promise((r) => setTimeout(r, 250));
  return p._csDirty() ? 'still dirty' : 'ok';
});
await need('saved', (await save()) === 'ok');
await page.waitForTimeout(1500);
const desk1 = await cfg(d.url);
await check('stored on every room view of this dashboard', heroes(desk1).every((x) => x === 'rooms'), heroes(desk1));
if (other) await check('another dashboard untouched', JSON.stringify(await cfg(other.url)) === other0, other.url);

// ── 3. dashboards ─────────────────────────────────────────────────────────────
for (const [label, o] of DEVICES) {
  const file = label === 'Desktop light' ? 'nachher_desktop_hell' : label === 'Tablet dark' ? 'nachher_tablet_dunkel' : null;
  const m = await view(label, home(d), o, file);
  await check(`${label}: Home round (38 px), no text`, m && m.icon && !m.text && m.w >= 34 && m.w <= 42 && Math.abs(m.w - m.h) <= 4, m);
  await check(`${label}: Home keeps its aria-label`, m && m.aria === 'Zuhause', m && m.aria);
  await check(`${label}: rooms keep their names`, m && m.rooms >= 1 && m.named === m.rooms, m);
  const b0 = before[label];
  // Desktop: the 77 px of the text make room for another name; a tablet row that was tight already stays as it was.
  await check(`${label}: ${b0 && b0.text ? 'more' : 'as many'} rooms fit`, m && b0 && (b0.text ? m.rooms > b0.rooms : m.rooms === b0.rooms),
    { now: m && m.rooms, before: b0 && b0.rooms });
}
const phoneAfter = await phoneTexts();
await check('phone unchanged (no room bar, same cards)', phoneAfter.bar === 0 && phoneAfter.t === phoneBefore.t, { before: phoneBefore, after: phoneAfter });
if (other) {
  const m = await view('other dashboard', home(other), DEVICES[0][1]);
  await check('another dashboard keeps Home with its text', m && (m.noHome || (m.text && !m.icon)), m);
}

// ── 4. reload, back to default ────────────────────────────────────────────────
usePage(page);
await page.reload();
await studio(page, d.url);
await page.evaluate(() => window.__panel()._csShow('n-look', 'nb-navbar'));
await page.waitForTimeout(1500);
b = await block();
await check('after reload: "Ohne Zuhause-Text" still chosen, preview with the house circle', b && JSON.stringify(b.on) === '["rooms"]' && b.mini && b.mini.icon, b);
await page.evaluate(() => window.__panel().shadowRoot.querySelector('[data-pkey="nb-navbar"] .segopt[data-v=""]').click());
await page.waitForTimeout(800);
await need('saved', (await save()) === 'ok');
await page.waitForTimeout(1500);
const desk2 = await cfg(d.url);
await check('"Alle" removes the value again', heroes(desk2).every((x) => x === undefined), heroes(desk2));
const back = await view('Desktop light', home(d), DEVICES[0][1]);
await check('"Alle": Home with its text again', back && back.text && !back.icon && back.w > 60, back);
c.close();
await finish();
