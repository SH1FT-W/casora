// @zustand: arbeit
// @deckt: custom_components/casora/scripts/local/38-search.js
// Room search (variant A, 01.11.2026): a field under the title of the phone's Home opens a sheet; typing lists rooms,
// devices and scenes. Expected on the phone (WebKit, 393 wide): the field sits between the title and the badges, a tap
// opens the sheet with the keyboard's field focused, "kuche" finds the kitchen (no umlaut), a room opens its page,
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
const { page } = await open({ width: 393, height: 852, mobile: true, safari: true });
usePage(page);
await page.addInitScript(() => { try { localStorage.removeItem('casora.search.recent'); localStorage.setItem('casora_mobile_filter', 'all'); } catch (e) { /* none */ } });
await dashboard(page, phoneUrl);
const field = await page.evaluate(() => {
  const f = window.__pierce('[data-casora-search]')[0];
  if (!f) return null;
  const r = f.getBoundingClientRect();
  const title = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_mobile_weather'));
  const name = title && title.shadowRoot.querySelector('#name').getBoundingClientRect();
  const badges = window.__pierce('button-card').find((b) => [].concat(b._config?.template || []).includes('casora_mobile_filter_badges'));
  const br = badges && badges.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, text: f.textContent.trim(), nameBottom: name && name.bottom, badgesTop: br && br.top };
});
await check('Suchfeld auf der Startseite', field && field.h >= 40 && field.w > 300, field);
await check('Suchfeld unter dem Titel, über den Badges', field && field.y >= field.nameBottom - 1 && (!field.badgesTop || field.y + field.h <= field.badgesTop + 1), field);
await check('Platzhalter „Räume, Geräte, Szenen“', field && /Räume, Geräte, Szenen/.test(field.text), field && field.text);
await shot('handy-start');

await page.mouse.click(field.x + field.w / 2, field.y + field.h / 2);
await page.waitForTimeout(500);
let r = await results(page);
await check('Tipp öffnet die Suche, Feld hat den Fokus', r && r.focus, r);

r = await typeIn(page, 'kuche');
const kitchen = rowsOf(r, 'room').find((x) => /Küche/.test(x.name));
await check('„kuche“ findet den Raum „Küche“ (ohne Umlaut), Treffer markiert', kitchen && /^Küche$/i.test(kitchen.mark || ''), r && r.groups);
await check('Gruppen höchstens 8 Einträge', (r.groups || []).every((g) => g.rows.length <= 8), r.groups.map((g) => g.rows.length));
await shot('handy-treffer');

// Room opens its page
await page.evaluate(() => [...document.querySelectorAll('.cs-row[data-kind="room"] .cs-main')].find((b) => /Küche/.test(b.textContent))?.click());
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
const f2 = await page.evaluate(() => { const f = window.__pierce('[data-casora-search]')[0]; const r = f.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.click(f2.x, f2.y);
await page.waitForTimeout(400);
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
  await page.mouse.click(f2.x, f2.y);
  await page.waitForTimeout(400);
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
await page.mouse.click(f2.x, f2.y);
await page.waitForTimeout(400);
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
