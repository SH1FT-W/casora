// @zustand: arbeit
// @parallel: allein
// Ablauf „Raum“ im neuen Studio Ende zu Ende (Desktop, Chromium), alles über das Raum-Menü der
// Werkzeugleiste: „Raum hinzufügen …“ (Name eintippen), „Umbenennen …“, „Symbol ändern …“
// (Konsole), „Nach vorne“, sichern. Erwartet: In HA gibt es die neue Ansicht mit neuem Namen und
// Symbol eine Stelle weiter vorn, das Mobil-Layout kennt den Raum, das Dashboard zeigt den Namen
// in der Navigation. Danach „Raum löschen“ + sichern: Ansicht und Mobil-Abschnitt sind weg.
// Schreibt ins Prüf-Dashboard – am Ende wird der vorherige Stand beider Dashboards zurückgeschrieben.
import { open, studio, casoraDashboard, dashboard, check, need, finish, usePage, atFinish } from './lib.mjs';
import { ws } from '../ws.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const URLS = [dash.url, dash.phone && dash.phone.url].filter(Boolean);
const saved0 = {};
{ const c = await ws(); for (const u of URLS) saved0[u] = await c.cmd({ type: 'lovelace/config', url_path: u }); c.close(); }
atFinish(async () => { const c = await ws();
  for (const u of URLS) await c.cmd({ type: 'lovelace/config/save', url_path: u, config: saved0[u] }); c.close(); });
const cfgOf = async (u) => { const c = await ws(); try { return await c.cmd({ type: 'lovelace/config', url_path: u }); } finally { c.close(); } };

// Abbruch (Element fehlt, Zeitüberschreitung) zählt als Fehler; atFinish stellt trotzdem zurück.
try {
  const NEU = 'Qa Raum rf02', NAME = 'Qa Werkstatt rf02';
  const o = await open({ width: 1600, height: 1000, dark: false });
  usePage(o.page);
  const pg = o.page;
  const H = (fn, a) => pg.evaluate(fn, a);
  await studio(pg, dash.url);
  await H(() => { const p = window.__panel(); p._sel = null; p._bClose(); });
  await pg.waitForTimeout(800);

  // Menüpunkt im offenen Raum-Menü wählen (Text ohne Haken).
  const menu = async () => { await pg.locator('button.broom').click(); await pg.waitForTimeout(800); };
  const pick = async (re) => {
    const r = await H((src) => { const rx = new RegExp(src);
      const e = window.__pierce('.combo-opt').find((x) => x.getClientRects().length && rx.test(x.textContent.replace('✓', '').trim()));
      if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const b = e.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, re.source);
    if (!r) return false;
    await pg.mouse.click(r.x, r.y);
    await pg.waitForTimeout(1200);
    return true;
  };
  const cur = () => H(() => { const p = window.__panel(); const r = p._state.compact.rooms[p._room];
    return { i: p._room, name: r.name, path: r.path, icon: (r.variables || {}).room_icon, n: p._state.compact.rooms.length }; });

  // Raum hinzufügen
  const n0 = (await cur()).n;
  await menu();
  await need('Menüpunkt „Raum hinzufügen …“', await pick(/^(Raum hinzufügen …|Add Room…)$/));
  await pg.locator('input:visible').first().fill(NEU);
  await pg.getByRole('button', { name: /^(Hinzufügen|Add)$/ }).last().click();
  await pg.waitForTimeout(1500);
  const a = await cur();
  await check('Neuer Raum angelegt und gewählt', a.name === NEU && a.n === n0 + 1, a);

  // Umbenennen
  await menu();
  await need('Menüpunkt „Umbenennen …“', await pick(/^(Umbenennen …|Rename…)$/));
  await pg.locator('input:visible').first().fill(NAME);
  await pg.keyboard.press('Enter');
  await pg.waitForTimeout(1200);
  const b = await cur();
  await check('Raum umbenannt', b.name === NAME, b);

  // Symbol ändern
  await menu();
  await need('Menüpunkt „Symbol ändern …“', await pick(/^(Symbol ändern …|Change Icon…)$/));
  await pick(/^(Konsole|Console)$/);
  const c1 = await cur();
  await check('Raumsymbol gesetzt', c1.icon === 'console', c1);

  // Nach vorne
  await menu();
  await pick(/^(Nach vorne|Move earlier)$/);
  const d = await cur();
  await check('„Nach vorne“ rückt den Raum eine Stelle vor', d.i === b.i - 1, { vorher: b.i, nachher: d.i });

  // Sichern
  const save = async () => {
    await H(() => { const p = window.__panel(); p._bClose(); document.activeElement && document.activeElement.blur(); });
    await pg.keyboard.press('Meta+s');
    return pg.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 }).then(() => true).catch(() => false);
  };
  await check('⌘S sichert', await save());
  const desk = await cfgOf(dash.url);
  const vi = desk.views.findIndex((v) => v.path === d.path);
  const v = desk.views[vi] || {};
  const roomCard = (v.cards || []).find((x) => [].concat(x.template || []).includes('casora_room')) || {};
  await check('HA: Ansicht mit neuem Namen und Symbol', roomCard.name === NAME && (roomCard.variables || {}).room_icon === 'console', { name: roomCard.name, icon: (roomCard.variables || {}).room_icon });
  await check('HA: Ansicht steht an der neuen Stelle', vi === d.i, { vi, erwartet: d.i });
  if (dash.phone) await check('HA: Mobil-Layout kennt den Raum', JSON.stringify(await cfgOf(dash.phone.url)).includes('"room":' + JSON.stringify(NAME)));

  await dashboard(pg, dash.url + '/' + d.path);
  const nav = await H((name) => window.__pierce('a, button, [role=tab], .route, .item').some((e) => e.getClientRects().length && e.textContent.trim() === name), NAME);
  await check('Dashboard: neuer Name in der Navigation', nav);

  // Raum löschen
  await studio(pg, dash.url);
  await H((path) => { const p = window.__panel(); p._room = p._state.compact.rooms.findIndex((r) => r.path === path); p._sel = null; p._bClose(); p._renderTabs(); p._syncPreview(); }, d.path);
  await pg.waitForTimeout(1200);
  await menu();
  await need('Menüpunkt „Raum löschen“', await pick(/^(Raum löschen|Delete Room)$/));
  await pg.getByRole('button', { name: /^(Löschen|Delete)$/ }).last().click();
  await pg.waitForTimeout(1200);
  await check('Raum aus dem Studio entfernt', !(await H((path) => window.__panel()._state.compact.rooms.some((r) => r.path === path), d.path)));
  await check('⌘S sichert das Löschen', await save());
  const desk2 = await cfgOf(dash.url);
  await check('HA: Ansicht gelöscht', !desk2.views.some((x) => x.path === d.path));
  if (dash.phone) await check('HA: Mobil-Abschnitt gelöscht', !JSON.stringify(await cfgOf(dash.phone.url)).includes('"room":' + JSON.stringify(NAME)));
} catch (e) {
  await check('Ablauf ohne Abbruch', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
