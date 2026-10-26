// @zustand: arbeit
// @parallel: ui
// @deckt: dashboards/casora/button_card_templates.json custom_components/casora/scripts/local/03-popups.js
// Issue #73 (Westerloer, 26.10.2026): in the house lights popup (tile "Beleuchtung" on Home) choosing a room with its
// chip kept the header "Beleuchtung"; the room's own light popup is titled with the room. Expected: a room chip puts
// the room's name in the header, "Alle" brings back "Beleuchtung". Desktop 1440, theme Casora.
import { open, casoraDashboards, dashboard, check, need, finish, usePage } from './lib.mjs';

const all = await casoraDashboards();
const desk = all.find((d) => !d.mobile && d.url === 'qa-arbeit') || all.find((d) => !d.mobile);
await need('ein Casora-Dashboard', desk, all.map((d) => d.url));
const { page } = await open({ width: 1440, height: 900, theme: 'Casora' });
usePage(page);
await dashboard(page, desk.url);
await page.waitForTimeout(1500);
const tile = await page.evaluate(() => {
  const b = window.__pierce('button-card').find((x) => [].concat((x._config || {}).template || []).some((t) => /^casora_light/.test(t))
    && x.getBoundingClientRect().width > 200 && /^light\./.test((x._config || {}).entity || ''));
  if (!b) return null;
  b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await need('Kachel Beleuchtung', tile);
await page.mouse.click(tile.x, tile.y);
const chips = async () => page.evaluate(() => { const s = window.casoraPopup && window.casoraPopup.surface; if (!s) return [];
  return window.__pierce('button-card', s).filter((b) => { const t = (b._config || {}).tap_action || {}; return t.event_data && t.event_data.casora_lf_gid && b.getBoundingClientRect().width > 20; })
    .map((b) => { const r = b.getBoundingClientRect(), e = b._config.tap_action.event_data; return { x: r.x + r.width / 2, y: r.y + r.height / 2, a: e.casora_lf_action, i: e.casora_lf_idx, name: ((b.shadowRoot && b.shadowRoot.querySelector('#name')) || {}).textContent ? b.shadowRoot.querySelector('#name').textContent.trim() : '' }; }); });
let C = [];
for (let i = 0; i < 30 && C.length < 2; i++) { await page.waitForTimeout(250); C = await chips(); }
await need('Raum-Knöpfe im Popup', C.some((c) => c.a === 'toggle') && C.some((c) => c.a === 'all'), C);
const title = () => page.evaluate(() => { const e = window.casoraPopup.element; return e && e._headerTitle ? e._headerTitle.textContent.trim() : null; });
await check('zuerst „Beleuchtung“', (await title()) === 'Beleuchtung', await title());
const room = C.find((c) => c.a === 'toggle');
await page.mouse.click(room.x, room.y); await page.waitForTimeout(700);
const t1 = await title();
await check('#73: Raum gewählt → Raumname in der Überschrift', t1 === room.name, { t1, room: room.name });
const allChip = C.find((c) => c.a === 'all');
await page.mouse.click(allChip.x, allChip.y); await page.waitForTimeout(700);
await check('„Alle“ → wieder „Beleuchtung“', (await title()) === 'Beleuchtung', await title());
await finish();
