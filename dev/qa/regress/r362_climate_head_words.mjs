// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json
// Issue #103: the climate popup's head line under „Klima“ showed „62 % Luftfeuchtigkeit“ for the temperature (the
// same value stood in the Messwerte list) and a bare „21,2 °C“ for the humidity. Owner: in every view the head is
// the same line of words, no numbers – the temperature's comfort word, then the humidity's (lower case after „ · “),
// e.g. „Angenehm · etwas feucht“. Desktop (badge tap) and phone (Klima hub › row).
import { open, casoraDashboard, dashboard, check, need, finish, usePage, fakeStates, shot } from './lib.mjs';

process.env.CASORA_THEME = 'Casora';
const dash = await casoraDashboard((d) => (d.config.views || []).length > 1);
await need('Casora dashboard with its phone counterpart', dash && dash.phone);

const head = (page) => page.evaluate(() => {
  const s = window.casoraPopup && window.casoraPopup.surface;
  if (!s) return null;
  const ln = window.__pierce('.hui-line', s).find((n) => n.getBoundingClientRect().height > 0);
  const cap = window.__pierce('.hui-dl-cap, .hui-st-trend', s).find((n) => n.getBoundingClientRect().height > 0);
  const pop = window.__pierce('casora-popup')[0];
  const sr = pop && pop.shadowRoot;
  return { line: ln ? ln.textContent.replace(/\s+/g, ' ').trim() : '', title: sr ? String((sr.querySelector('.header-title') || {}).textContent || '').trim() : '',
    rows: window.__pierce('.hui-row', s).filter((n) => n.getBoundingClientRect().height > 0).map((n) => n.textContent.replace(/\s+/g, ' ').trim()) };
});
// A badge with its template that is really on top (the closed groups' rows stack under the open one).
const badgeAt = (page, t) => page.evaluate((t) => {
  const top = (b) => {
    const r = b.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    let hit = document.elementFromPoint(x, y);
    while (hit && hit.shadowRoot) { const d = hit.shadowRoot.elementFromPoint(x, y); if (!d || d === hit) break; hit = d; }
    for (let n = hit; n; n = n.parentNode || n.host) if (n === b) return { x, y };
    return null;
  };
  for (const b of window.__pierce('button-card')) {
    if (![].concat((b._config || {}).template || []).includes(t) || b.getBoundingClientRect().width <= 20) continue;
    const p = top(b);
    if (p) return p;
  }
  return null;
}, t);
const close = async (page) => { await page.evaluate(() => window.casoraPopup && window.casoraPopup.close()); await page.waitForTimeout(900); };

// Invented readings in the browser: 21.2 °C (comfortable) and 62 % (slightly humid).
const pin = async (page) => {
  const ids = await page.evaluate(() => { const st = document.querySelector('home-assistant').hass.states;
    return Object.keys(st).filter((k) => /^sensor\./.test(k) && ['temperature', 'humidity'].includes(st[k].attributes.device_class)).map((k) => [k, st[k].attributes.device_class]); });
  const patch = {};
  ids.forEach(([k, dc]) => { patch[k] = { state: dc === 'temperature' ? '21.2' : '62' }; });
  await fakeStates(page, patch, { sticky: true });
};
const verify = async (label, p, kind) => {
  await check(`${label} ${kind}: popup „Klima“ open`, p && /Klima/.test(p.title), p);
  await check(`${label} ${kind}: head is words „Angenehm · etwas feucht“ (${p && p.line})`, p && /^Angenehm · etwas feucht( · |$)/.test(p.line), p);
  await check(`${label} ${kind}: no number in the head (${p && p.line})`, p && !/\d/.test(p.line), p);
};

// Desktop: the temperature and humidity badges open the climate popup.
const dk = await open({ width: 1440, height: 900, dark: false, theme: 'Casora' });
usePage(dk.page);
await dashboard(dk.page, dash.url + '/' + ((dash.config.views[0] || {}).path || '0'), 3);
await pin(dk.page);
for (const [kind, tpl] of [['temperature', 'casora_badge_temp'], ['humidity', 'casora_badge_humidity']]) {
  // The Klima badge opens its sub-badges, a sub-badge the popup.
  const grp = await badgeAt(dk.page, 'casora_badge_climate_group');
  await need('desktop has the Klima badge', grp);
  if (!(await badgeAt(dk.page, tpl))) { await dk.page.mouse.click(grp.x, grp.y); await dk.page.waitForTimeout(1500); }
  const b = await badgeAt(dk.page, tpl);
  await need(`desktop has a ${tpl} badge`, b);
  await dk.page.mouse.click(b.x, b.y);
  await dk.page.waitForTimeout(2600);
  const p = await head(dk.page);
  console.log('    desktop', kind, JSON.stringify(p));
  await verify('Desktop', p, kind);
  if (process.env.I103_SHOT) await shot('desktop_' + kind);
  await close(dk.page);
}

// Phone: Klima hub › Temperatur / Luftfeuchtigkeit rows open the same popup as a sub page.
const ph = await open({ width: 393, height: 852, mobile: true, safari: true, scale: 2, dark: false, theme: 'Casora' });
usePage(ph.page);
await dashboard(ph.page, dash.phone.url + '/home', 2);
await pin(ph.page);
for (const [kind, row] of [['temperature', 'Temperatur'], ['humidity', 'Luftfeuchtigkeit']]) {
  const hub = await badgeAt(ph.page, 'casora_badge_climate_group');
  await need('phone Home has the Klima badge', hub);
  await ph.page.touchscreen.tap(hub.x, hub.y);
  await ph.page.waitForTimeout(2500);
  const at = await ph.page.evaluate((label) => {
    const s = window.casoraPopup && window.casoraPopup.surface;
    const r = s && window.__pierce('.hui-row', s).find((n) => n.textContent.replace(/\s+/g, ' ').trim().startsWith(label));
    if (!r) return null;
    r.scrollIntoView({ block: 'center' });
    const q = r.getBoundingClientRect();
    return { x: q.x + q.width / 2, y: q.y + q.height / 2 };
  }, row);
  await need(`phone Klima hub has the row ${row}`, at);
  await ph.page.waitForTimeout(400);
  await ph.page.touchscreen.tap(at.x, at.y);
  await ph.page.waitForTimeout(2600);
  const p = await head(ph.page);
  console.log('    phone', kind, JSON.stringify(p));
  await verify('Phone', p, kind);
  if (process.env.I103_SHOT) await shot('phone_' + kind);
  await close(ph.page);
}

// English: each part of the line translated, the humidity word in lower case too.
const en = await open({ width: 1440, height: 900, dark: false, theme: 'Casora', lang: 'en' });
usePage(en.page);
await dashboard(en.page, dash.url + '/' + ((dash.config.views[0] || {}).path || '0'), 3);
await pin(en.page);
{
  const grp = await badgeAt(en.page, 'casora_badge_climate_group');
  await need('English: the Klima badge', grp);
  if (!(await badgeAt(en.page, 'casora_badge_temp'))) { await en.page.mouse.click(grp.x, grp.y); await en.page.waitForTimeout(1500); }
  const b = await badgeAt(en.page, 'casora_badge_temp');
  await need('English: the temperature badge', b);
  await en.page.mouse.click(b.x, b.y);
  await en.page.waitForTimeout(2600);
  const p = await head(en.page);
  console.log('    english', JSON.stringify(p));
  await check(`English: head „Comfortable · slightly humid“ (${p && p.line})`, p && p.line === 'Comfortable · slightly humid', p);
  if (process.env.I103_SHOT) await shot('desktop_en');
}
await finish();
