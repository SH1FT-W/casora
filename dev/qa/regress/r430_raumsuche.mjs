// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/38-search.js
// Room search (variant A, 01.11.2026): a field under the title of the phone's Home opens a sheet; typing lists rooms,
// devices and scenes. Expected on the phone (WebKit, 393 wide): the field sits between the title and the badges, a tap
// opens the sheet with the keyboard's field focused (a real finger tap: 26.11.2 did nothing in the Companion app),
// the field is hidden until one pulls down at the top, "kuche" finds the kitchen (no umlaut), a room opens its page,
// a device's switch switches it, a scene starts, Esc / "Abbrechen" close. Desktop: Cmd+K opens the same search as a
// dialog with the same results, Esc closes it.
import { open, usePage, casoraDashboard, dashboard, check, need, shot, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => true);
await need('Casora-Dashboard mit Handy-Gegenstück', dash && dash.phone);
const phoneUrl = dash.phone.url + '/' + (dash.phone.config.views[0].path || '0');

const results = (page) => page.evaluate(() => {
  const root = document.querySelector('.cs-root');
  if (!root) return null;
  const groups = [...root.querySelectorAll('.cs-group')].map((g) => ({
    head: g.querySelector('.cs-sec')?.textContent,
    rows: [...g.querySelectorAll('.cs-row')].map((r) => ({ kind: r.dataset.kind, id: r.dataset.id,
      name: r.querySelector('.cs-name')?.textContent, mark: r.querySelector('mark')?.textContent || null,
      sw: r.querySelector('.cs-sw')?.getAttribute('aria-checked') ?? null })),
  }));
  return { groups, focus: document.activeElement === root.querySelector('.cs-in'), empty: root.querySelector('.cs-empty')?.textContent || null };
});
const typeIn = async (page, q) => {
  await page.evaluate(() => { const i = document.querySelector('.cs-in'); i.value = ''; i.dispatchEvent(new Event('input')); });
  await page.keyboard.type(q, { delay: 30 });
  await page.waitForTimeout(250);
  return results(page);
};
const rowsOf = (r, kind) => ((r && r.groups) || []).flatMap((g) => g.rows).filter((x) => x.kind === kind);

// ── Phone (WebKit) ──────────────────────────────────────────────────────────────────────────────────────────
// As the Companion app on an iPhone (its user agent carries „Home Assistant/“).
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Home Assistant/2026.10 (io.robbie.HomeAssistant; build:1; iOS 18.0.0)' });
usePage(page);
await page.addInitScript(() => { try { localStorage.removeItem('casora.search.recent'); localStorage.setItem('casora_mobile_filter', 'all'); } catch (e) { /* none */ } });
await dashboard(page, phoneUrl);
await page.waitForFunction(() => window.__pierce('[data-casora-search]').length > 0, null, { timeout: 20000 }).catch(() => {});
// The field starts hidden (iOS style): pulling down at the top of Home shows it.
const fieldBox = () => page.evaluate(() => {
  const f = window.__pierce('[data-casora-search]')[0];
  if (!f) return null;
  const r = f.getBoundingClientRect(), c = f.parentElement.getBoundingClientRect();
  const title = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_mobile_weather'));
  const name = title && title.shadowRoot.querySelector('#name').getBoundingClientRect();
  const badges = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_mobile_filter_badges'));
  const br = badges && badges.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, shown: Math.round(c.height), op: Number(getComputedStyle(f.parentElement).opacity),
    text: f.textContent.trim(), nameBottom: name && name.bottom, badgesTop: br && br.top };
});
// A finger drag from y0 to y1 (WebKit's touchscreen only taps): touch events on the element under the finger.
// WebKit here has no Touch constructor: plain events carrying the touch lists the page reads.
const drag = (y0, y1) => page.evaluate(async ([y0, y1]) => {
  const x = 200, target = document.elementFromPoint(x, y0) || document.body;
  const ev = (type, y) => { const t = { identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y };
    const e = new Event(type, { bubbles: true, cancelable: true, composed: true });
    Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [t] });
    Object.defineProperty(e, 'changedTouches', { value: [t] });
    target.dispatchEvent(e); };
  ev('touchstart', y0);
  for (let i = 1; i <= 8; i++) { ev('touchmove', y0 + (y1 - y0) * i / 8); await new Promise((r) => setTimeout(r, 16)); }
  ev('touchend', y1);
}, [y0, y1]);
let field = await fieldBox();
await check('Suchfeld da, aber zuerst versteckt', field && field.shown <= 1, field);
await drag(320, 460);
await page.waitForTimeout(500);
field = await fieldBox();
await check('Herunterziehen oben zeigt das Suchfeld', field && field.shown >= 50 && field.op > 0.95 && field.h >= 40 && field.w > 300, field);
await check('Suchfeld unter dem Titel, über den Badges', field && field.y >= field.nameBottom - 1 && (!field.badgesTop || field.y + field.h <= field.badgesTop + 1), field);
await check('Platzhalter „Räume, Geräte, Szenen“', field && /Räume, Geräte, Szenen/.test(field.text), field && field.text);
await shot('handy-start');
await drag(460, 330);
await page.waitForTimeout(500);
await check('Hochschieben versteckt es wieder', (await fieldBox()).shown <= 1);

// A real finger tap (touch events, not a mouse click): the card's action handler cancels touchend, no click follows.
const openSheet = async () => {
  await page.evaluate(() => window._casoraSearch.reveal(true));
  await page.waitForTimeout(450);
  const b = await fieldBox();
  await page.touchscreen.tap(b.x + b.w / 2, b.y + b.h / 2);
  await page.waitForTimeout(500);
};
await openSheet();
let r = await results(page);
await check('Finger-Tipp öffnet die Suche, Feld hat den Fokus (Tastatur)', r && r.focus, r);
// Nothing typed, nothing opened yet: no extra bubble under the field (the placeholder says it already).
const bubble = await page.evaluate(() => { const p = document.querySelector('.cs-root .cs-panel'); return p ? { hidden: p.hidden, h: Math.round(p.getBoundingClientRect().height) } : null; });
await check('Leeres Feld ohne Verlauf: keine Blase unter dem Feld', bubble && bubble.hidden && bubble.h === 0, bubble);

r = await typeIn(page, 'kuche');
const kitchen = rowsOf(r, 'room').find((x) => /Küche/.test(x.name));
await check('„kuche“ findet den Raum „Küche“ (ohne Umlaut), Treffer markiert', kitchen && /^Küche$/i.test(kitchen.mark || ''), r && r.groups);
await check('Gruppen höchstens 8 Einträge', (r.groups || []).every((g) => g.rows.length <= 8), r.groups.map((g) => g.rows.length));
await shot('handy-treffer');
const look = await page.evaluate(() => {
  const root = document.querySelector('.cs-root');
  const alpha = (el) => { const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([^)]+)\)/); const p = m ? m[1].split(/[\s,/]+/).filter(Boolean).map(Number) : []; return p.length > 3 ? p[3] : (p.length ? 1 : 0); };
  const strip = getComputedStyle(root.querySelector('.cs-bar'), '::before');
  return {
    subs: [...root.querySelectorAll('.cs-row[data-kind="device"] .cs-sub')].map((x) => x.textContent),
    panel: alpha(root.querySelector('.cs-panel')),
    strip: strip.backgroundColor,
    cut: [...root.querySelectorAll('.cs-name')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
  };
});
// Words as everywhere in Casora (wortliste): no HA words like „Ein“/„Leerlauf“, no raw English states.
await check('Zustände in Casoras Worten (kein „Ein“, „Leerlauf“, Rohwert)', look.subs.every((t) => !/(^|· )(Ein|Leerlauf|ready|idle|on|off)$/.test(t)), look.subs);
await check('Blatt und Kopfzeile der Suche deckend', look.panel === 1 && /^rgb\(/.test(look.strip), look);
await check('Lange Namen umbrechen statt abgeschnitten', look.cut.length === 0, look.cut);

// Room opens its page
// With a finger too: the sheet's rows take a real tap.
const roomAt = await page.evaluate(() => { const b = [...document.querySelectorAll('.cs-row[data-kind="room"] .cs-main')].find((x) => /Küche/.test(x.textContent));
  const r = b && b.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; });
if (roomAt) await page.touchscreen.tap(roomAt.x, roomAt.y);
await page.waitForTimeout(1500);
const filt = await page.evaluate(() => ({ f: window._casoraFilter && window._casoraFilter.get(), open: !!document.querySelector('.cs-root') }));
await check('Raum öffnen: Raumseite „Küche“, Suche zu', /^room_k/.test(filt.f || '') && !filt.open, filt);
await page.evaluate(() => { window._casoraFilter.set('all'); });
await page.waitForTimeout(1200);

// A switchable device: switch in the row
const lamp = await page.evaluate(() => {
  const S = window._casoraSearch, h = document.querySelector('home-assistant').hass;
  const idx = S.index(S._configNow(), h, h.user, { url: location.pathname.split('/')[1] });
  const d = idx.devices.find((x) => S.canToggle(h, x.id));
  return d ? { id: d.id, name: d.name, state: h.states[d.id].state } : null;
});
await need('schaltbares Gerät im Handy-Dashboard', lamp);
await openSheet();
r = await typeIn(page, lamp.name.split(/\s+/)[0].slice(0, 5));
const row = rowsOf(r, 'device').find((x) => x.id === lamp.id);
await check('Gerät gefunden, mit Schalter', row && row.sw !== null, r && r.groups);
await page.evaluate((id) => document.querySelector('.cs-row[data-id="' + id + '"] .cs-sw')?.click(), lamp.id);
await page.waitForFunction((o) => document.querySelector('home-assistant').hass.states[o.id].state !== o.state, lamp, { timeout: 8000 }).catch(() => {});
const after = await page.evaluate((id) => ({ st: document.querySelector('home-assistant').hass.states[id].state,
  sw: document.querySelector('.cs-row[data-id="' + id + '"] .cs-sw')?.getAttribute('aria-checked') }), lamp.id);
await check('Schalter in der Zeile schaltet das Gerät', after.st !== lamp.state && after.sw === String(after.st === 'on'), { before: lamp.state, after });
// Back as it was (the next tests see the house unchanged).
await page.evaluate((id) => document.querySelector('home-assistant').hass.callService(id.split('.')[0], 'toggle', { entity_id: id }), lamp.id);

// Tapping the row opens the device's Casora popup
await page.evaluate((id) => document.querySelector('.cs-row[data-id="' + id + '"] .cs-main')?.click(), lamp.id);
const pop = await page.waitForFunction(() => window.casoraPopup && window.casoraPopup.current, null, { timeout: 8000 }).then(() => true, () => false);
await check('Tipp auf die Zeile öffnet das Casora-Popup', pop && !(await page.evaluate(() => !!document.querySelector('.cs-root'))));
await page.evaluate(() => window.casoraPopup && window.casoraPopup.close());
await page.waitForTimeout(800);

// Scene starts
const scene = await page.evaluate(() => {
  const S = window._casoraSearch, h = document.querySelector('home-assistant').hass;
  const idx = S.index(S._configNow(), h, h.user, { url: location.pathname.split('/')[1] });
  return idx.scenes[0] ? { id: idx.scenes[0].id, name: idx.scenes[0].name } : null;
});
if (scene) {
  await openSheet();
  // The sheet shows recently opened results while the field is empty.
  r = await results(page);
  await check('Leeres Feld: zuletzt Geöffnetes oben', rowsOf(r, 'device').some((x) => x.id === lamp.id), r && r.groups);
  r = await typeIn(page, scene.name);
  await check('Szene gefunden', rowsOf(r, 'scene').some((x) => x.id === scene.id), r && r.groups);
  const t0 = await page.evaluate((id) => document.querySelector('home-assistant').hass.states[id].state, scene.id);
  await page.evaluate((id) => document.querySelector('.cs-row[data-id="' + id + '"] .cs-main')?.click(), scene.id);
  const ran = await page.waitForFunction((o) => document.querySelector('home-assistant').hass.states[o.id].state !== o.t0, { id: scene.id, t0 }, { timeout: 8000 }).then(() => true, () => false);
  await check('Tipp startet die Szene', ran, { t0 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await check('Esc schließt die Suche', !(await page.evaluate(() => !!document.querySelector('.cs-root'))));
} else {
  await check('Szene im Dashboard', false, 'keine Szene');
}

// Cancel closes
await openSheet();
await page.evaluate(() => document.querySelector('.cs-cancel').click());
await page.waitForTimeout(300);
await check('„Abbrechen“ schließt die Suche', !(await page.evaluate(() => !!document.querySelector('.cs-root'))));

// ── Desktop: Cmd+K ──────────────────────────────────────────────────────────────────────────────────────────
const d = await open({ width: 1440, height: 900 });
usePage(d.page);
await dashboard(d.page, dash.url + '/' + (dash.config.views[0].path || 'home'));
await d.page.keyboard.press('Meta+k');
await d.page.waitForTimeout(500);
r = await results(d.page);
await check('⌘K öffnet die Suche als Dialog, Feld hat den Fokus', r && r.focus && await d.page.evaluate(() => document.querySelector('.cs-root').classList.contains('desk')), r);
r = await typeIn(d.page, 'kuche');
await check('Desktop: „kuche“ findet „Küche“', rowsOf(r, 'room').some((x) => /Küche/.test(x.name)), r && r.groups);
await shot('desktop-cmdk');
await d.page.keyboard.press('ArrowDown');
await d.page.keyboard.press('Enter');
await d.page.waitForTimeout(1500);
await check('Desktop: Pfeil + Enter öffnet den Raum', /k(ue|ü)che/i.test(decodeURIComponent(await d.page.evaluate(() => location.pathname))), await d.page.evaluate(() => location.pathname));
await d.page.keyboard.press('Control+k');
await d.page.waitForTimeout(400);
await d.page.keyboard.press('Escape');
await d.page.waitForTimeout(300);
await check('Desktop: Strg+K öffnet, Esc schließt', !(await d.page.evaluate(() => !!document.querySelector('.cs-root'))));
await finish();
