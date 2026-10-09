// @zustand: arbeit
// Gemeldet 03.10.2026: (1) Die Badges standen in der Studio-Vorschau anders als im Dashboard,
// (2) die Szenen-Badge fehlte in der Badge-Reihenfolge, (3) eine umbenannte Übersicht hieß in der
// Handy-Leiste weiter „Zuhause“. Erwartet: Dashboard-Reihe = Vorschau-Reihe (gleicher Schlüssel),
// Szenen steht in der Liste und lässt sich ziehen, die Handy-Leiste zeigt home_label.
// Es wird nichts gespeichert.
import { open, usePage, studio, casoraDashboard, dashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const view = dash.config.views[0];
const saved = ((view.cards[0] || {}).variables || {}).badge_order;
const { page } = await open({ width: 1600, height: 1000 });
usePage(page);

// ── Dashboard: Reihenfolge der oberen Badge-Reihe ─────────────────────────────
await dashboard(page, dash.url + '/' + (view.path || '0'));
const row = await page.evaluate(() => {
  const ID = { casora_badge_security_group: 'security', casora_badge_climate_group: 'climate', casora_badge_temp: 'climate',
    casora_badge_humidity: 'climate', casora_badge_air_quality: 'climate', casora_badge_light_group: 'lights',
    casora_badge_presence_group: 'people', casora_badge_presence: 'people', casora_badge_media_group: 'media',
    casora_badge_energy_group: 'energy', casora_badge_scene_group: 'scenes',
    // Sicherheit einzeln (show_security_inline): Unter-Badge-Vorlagen in der oberen Reihe.
    casora_badge_lock_group: 'security', casora_badge_camera_group: 'security', casora_badge_security: 'security',
    casora_badge_contact_group: 'security' };
  const all = window.__pierce('button-card').map((b) => {
    const t = [].concat((b._config || {}).template || []).find((x) => ID[x]);
    const r = b.getBoundingClientRect();
    return t && r.width > 0 && r.height > 0 ? { id: ID[t], x: r.x, y: r.y } : null;
  }).filter(Boolean);
  if (!all.length) return [];
  const top = Math.min(...all.map((c) => c.y));
  return all.filter((c) => c.y - top < 20).sort((a, b) => a.x - b.x).map((c) => c.id)
    .filter((id, i, L) => L.indexOf(id) === i);
});
const want = await page.evaluate(async (s) => {
  const I = window.__casoraPanelInternals;
  if (I && I.badgeOrderOf) return I.badgeOrderOf(s);
  const D = ['security', 'climate', 'lights', 'people', 'energy', 'scenes', 'media'];
  const o = (Array.isArray(s) ? s : []).filter((x) => D.includes(x)); D.forEach((x) => { if (!o.includes(x)) o.push(x); });
  return o;
}, saved);
const wantShown = want.filter((id) => row.includes(id));
await check('Dashboard: Badge-Reihe folgt badge_order (Standard: Sicherheit … Szenen)',
  row.length >= 2 && JSON.stringify(row) === JSON.stringify(wantShown), { row, want: wantShown, saved });

// ── Handy-Leiste: Name der Übersicht ─────────────────────────────────────────
const names = await page.evaluate(async () => {
  if (!customElements.get('casora-mobile-nav')) return { own: 'nicht geladen', std: null };
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(host);
  const read = (cfg) => {
    const el = document.createElement('casora-mobile-nav');
    el.setConfig(cfg);
    host.appendChild(el);
    const sp = el._bHome && el._bHome.querySelector(':scope > span:not(.hmn-bic)'); // erster span ist der Symbolkreis
    const t = sp ? sp.textContent : null;
    el.remove(); if (el._bar) el._bar.remove();
    return t;
  };
  const out = { own: read({ type: 'custom:casora-mobile-nav', home_label: 'Unser Haus', rooms: [] }),
    std: read({ type: 'custom:casora-mobile-nav', rooms: [] }) };
  host.remove();
  return out;
});
await check('Handy-Leiste: eigener Name der Übersicht (home_label)', names.own === 'Unser Haus', names);
await check('Handy-Leiste: ohne eigenen Namen Standard „Zuhause“/„Home“', /^(Zuhause|Home)$/.test(names.std || ''), names);

// ── Studio: Szenen in der Reihenfolge-Liste, ziehbar, Vorschau folgt ─────────
await studio(page, dash.url);
await page.evaluate(async () => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const rooms = p._state.compact.rooms;
  p._room = rooms.findIndex((r) => I.isHomeRoom(r, rooms));
  if (rooms[p._room] === rooms[0]) I.sceneBadgeOn(rooms, true);
  delete rooms[p._room].variables.badge_order;
  p._sel = null; p._renderTabs(); p._renderForm();
  await new Promise((r) => setTimeout(r, 700));
});
const pt = await page.evaluate(() => {
  const p = window.__panel();
  // Eigener Text „Badges“ (darunter kann ein erklärender Halbsatz stehen, V-08).
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const h = [...p.shadowRoot.querySelectorAll('*')].find((e) => own(e) === 'Badges'
    && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().x > 500);
  if (!h) return null;
  // Der Abschnitt liegt je nach Inhalt (z. B. Wiedergabe-Liste) unterhalb des Fensters – ein Klick
  // dorthin ginge ins Leere (09.10.2026: im Gate je nach Vorgeschichte grün, einzeln rot).
  h.scrollIntoView({ block: 'center' });
  const b = h.getBoundingClientRect(); return [b.x + 20, b.y + b.height / 2];
});
await need('Badges-Abschnitt der Übersicht', pt);
// Aufklappen, bis die Ziehgriffe der Liste da sind (der Kopf klappt auch zu – nie blind zweimal).
const gripsShown = () => page.evaluate(() => { const col = window.__panel().shadowRoot.querySelector('.badgecol');
  return !!col && [...col.querySelectorAll('.grip')].some((g) => g.getBoundingClientRect().width > 0); });
if (!(await gripsShown())) {
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForFunction(() => { const col = window.__panel().shadowRoot.querySelector('.badgecol');
    return !!col && [...col.querySelectorAll('.grip')].some((g) => g.getBoundingClientRect().width > 0); }, null, { timeout: 8000 }).catch(() => {});
}
await page.evaluate(() => { const col = window.__panel().shadowRoot.querySelector('.badgecol'); col && col.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(400);
const list = await page.evaluate(() => {
  const col = window.__panel().shadowRoot.querySelector('.badgecol');
  return col ? [...col.children].filter((c) => c.dataset && c.dataset.bid).map((c) => c.dataset.bid) : [];
});
await check('Studio: Szenen steht in der Badge-Reihenfolge (Standard nach Energie, vor Medien)', list.includes('scenes')
  && (!list.includes('energy') || list.indexOf('scenes') > list.indexOf('energy'))
  && (!list.includes('media') || list.indexOf('scenes') < list.indexOf('media')), list);
// Ohne gespeichertes badge_order (oben entfernt): Standard, wie das Dashboard ihn zeichnet.
const DEF = ['security', 'climate', 'lights', 'people', 'energy', 'scenes', 'media'];
await check('Studio: Liste in Dashboard-Standardreihenfolge', JSON.stringify(list) === JSON.stringify(DEF.filter((id) => list.includes(id))), { list, DEF });

// Szenen per Ziehgriff ganz nach oben.
const drag = await page.evaluate(() => {
  const col = window.__panel().shadowRoot.querySelector('.badgecol');
  const cards = [...col.children].filter((c) => c.dataset && c.dataset.bid);
  const sc = cards.find((c) => c.dataset.bid === 'scenes');
  const g = sc && sc.querySelector('.grip');
  if (!g) return null;
  const a = g.getBoundingClientRect(), b = cards[0].getBoundingClientRect();
  return { x: a.x + a.width / 2, y: a.y + a.height / 2, to: b.y + 4 };
});
await need('Ziehgriff an der Szenen-Zeile', drag);
await page.mouse.move(drag.x, drag.y);
await page.mouse.down();
for (let i = 1; i <= 12; i++) await page.mouse.move(drag.x, drag.y + (drag.to - drag.y) * i / 12);
await page.mouse.up();
await page.waitForTimeout(1500);
const after = await page.evaluate(() => {
  const p = window.__panel(), I = window.__casoraPanelInternals;
  const rooms = p._state.compact.rooms;
  const room = rooms.find((r) => I.isHomeRoom(r, rooms));
  const pills = [...p.shadowRoot.querySelectorAll('.pbadge')].filter((e) => e.getBoundingClientRect().width > 0
    && !e.classList.contains('ghost') && !e.closest('.subs'));
  return { order: room.variables.badge_order, first: pills[0] && pills[0].dataset.mk, firstText: pills[0] && pills[0].textContent.trim() };
});
await check('Studio: Szenen nach oben gezogen → badge_order beginnt mit „scenes“',
  Array.isArray(after.order) && after.order[0] === 'scenes', after);
await check('Studio: Vorschau zeigt Szenen danach vorn', /Szenen|Scenes/.test(after.firstText || ''), after);

await finish();
