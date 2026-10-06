// @zustand: arbeit
// @parallel: allein
// Ablauf „Kachel“ im neuen Studio Ende zu Ende (Desktop, Chromium): Im Inspektor „Kachel
// hinzufügen“ → Kachelart „Licht“ wählen (bei mehreren Lampen das vorgeschlagene Gerät
// übernehmen), die neue Kachel umbenennen, eine andere Kachel über „Kachel entfernen“ löschen
// und mit ⌘S sichern. Erwartet: In HA stehen die umbenannte Kachel (Desktop und Mobil-Layout)
// und die gelöschte nicht mehr; nach neuem Laden zeigt das Dashboard die neue Kachel in der
// Kachelreihe, ohne Fehlerkarte. Schreibt ins Prüf-Dashboard – am Ende wird der vorherige
// Stand beider Dashboards zurückgeschrieben.
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
  const NAME = 'QA Licht rf01';
  const o = await open({ width: 1600, height: 1000, dark: false });
  usePage(o.page);
  const H = (fn, a) => o.page.evaluate(fn, a);
  await studio(o.page, dash.url);

  // Raum (nicht „Zuhause“) mit mindestens zwei Kacheln wählen.
  const room = await H(async () => {
    const p = window.__panel(), I = window.__casoraPanelInternals, rooms = p._state.compact.rooms;
    for (let i = 0; i < rooms.length; i++) {
      if (I.isHomeRoom(rooms[i], rooms) || (rooms[i].tiles || []).length < 2) continue;
      p._room = i; p._sel = null; p._renderTabs(); p._syncPreview();
      await new Promise((r) => setTimeout(r, 900));
      return { i, path: rooms[i].path, n: rooms[i].tiles.length, names: rooms[i].tiles.map((t) => t.name) };
    }
    return null;
  });
  await need('Raum mit zwei Kacheln', room);
  const tiles = () => H(() => { const p = window.__panel(); return p._state.compact.rooms[p._room].tiles.map((t) => ({ name: t.name, tpl: t.template })); });

  // „Kachel hinzufügen“ im Inspektor (Bereich Kacheln aufgeklappt) → Kachelart „Licht“.
  await H(async () => { const p = window.__panel(); p._sel = null; p._bOpen = true; p._stackOpenReq = 'tiles'; p._renderForm();
    await new Promise((r) => setTimeout(r, 1200));
    const b = [...p.shadowRoot.querySelectorAll('#pane button')].find((x) => x.getClientRects().length && /Kachel hinzufügen|Add tile/.test(x.textContent));
    if (b) b.setAttribute('data-qa', 'kachel-neu'); });
  await need('Knopf „Kachel hinzufügen“ im Inspektor', await o.page.locator('[data-qa=kachel-neu]').count());
  await o.page.locator('[data-qa=kachel-neu]').click();
  await o.page.waitForTimeout(900);
  await o.page.locator('.combo-menu:visible').getByText(/^(Licht|Light)$/).first().click();
  await o.page.waitForTimeout(1500);
  // Mehrere Lampen: Auswahl-Dialog – vorgeschlagenes Gerät übernehmen.
  const take = o.page.getByRole('button', { name: /^(Übernehmen|Apply)$/ });
  if (await take.count()) { await take.last().click(); await o.page.waitForTimeout(1500); }
  const t1 = await tiles();
  const added = t1.length === room.n + 1 && t1[t1.length - 1].tpl === 'casora_light';
  await check('Kachelart „Licht“ hinzugefügt (am Ende der Reihe)', added, t1.slice(-2));

  // Neue Kachel im Editor umbenennen (Namensfeld trägt den bisherigen Namen).
  // Auswahl über die Vorschau: Kachel mit dem Namen der neuen Kachel anklicken.
  const oldName = t1[t1.length - 1].name;
  const pos = await H((name) => { const p = window.__panel();
    const e = [...p.shadowRoot.querySelectorAll('[data-mk^="t:"]')].reverse().find((x) => x.getClientRects().length && x.textContent.includes(name));
    if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, oldName);
  await need('Neue Kachel in der Vorschau', pos, oldName);
  await o.page.mouse.click(pos.x, pos.y);
  await o.page.waitForTimeout(1300);
  const nameField = await H((v) => { const p = window.__panel();
    const i = [...p.shadowRoot.querySelectorAll('#pane input')].find((x) => x.getClientRects().length && x.value === v);
    if (i) i.setAttribute('data-qa', 'kname'); return !!i; }, oldName);
  await need('Namensfeld der neuen Kachel', nameField);
  await o.page.locator('[data-qa=kname]').fill(NAME);
  await o.page.locator('[data-qa=kname]').press('Tab');
  await o.page.waitForTimeout(900);
  const t2 = await tiles();
  await check('Kachel umbenannt', t2.some((t) => t.name === NAME), t2.map((t) => t.name));

  // Erste Kachel des Raums über „Kachel entfernen“ löschen.
  const victim = t2[0].name;
  const vpos = await H((name) => { const p = window.__panel();
    const e = [...p.shadowRoot.querySelectorAll('[data-mk^="t:"]')].find((x) => x.getClientRects().length && x.textContent.includes(name));
    if (!e) return null; e.scrollIntoView({ block: 'nearest', inline: 'center' }); const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, victim);
  await need('Zu löschende Kachel in der Vorschau', vpos, victim);
  await o.page.mouse.click(vpos.x, vpos.y);
  await o.page.waitForTimeout(1200);
  await o.page.getByRole('button', { name: /^(Kachel entfernen|Remove tile)$/ }).click();
  await o.page.waitForTimeout(1200);
  const t3 = await tiles();
  const sameName = t2.filter((t) => t.name === victim).length;
  await check('„Kachel entfernen“ löscht die Kachel', t3.length === t2.length - 1 && t3.filter((t) => t.name === victim).length === sameName - 1,
    { vorher: t2.length, nachher: t3.length, victim });

  // Sichern mit ⌘S.
  await H(() => { const p = window.__panel(); p._bClose(); document.activeElement && document.activeElement.blur(); });
  await o.page.keyboard.press('Meta+s');
  const ok = await o.page.waitForFunction(() => !window.__panel()._isDirty() && !window.__panel()._saving, null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  await check('⌘S sichert', ok);

  // In HA: Desktop-Ansicht und Mobil-Layout.
  const desk = await cfgOf(dash.url);
  const view = (desk.views || []).find((v) => v.path === room.path);
  const vs = JSON.stringify(view || {});
  await check('HA: umbenannte Licht-Kachel im Raum gespeichert', vs.includes('"template":"casora_light"') && vs.includes(JSON.stringify(NAME)));
  const cnt = (s, name) => (s.match(new RegExp('"name":' + JSON.stringify(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  await check('HA: gelöschte Kachel steht nicht mehr im Raum', cnt(vs, victim) < cnt(JSON.stringify((saved0[dash.url].views || []).find((v) => v.path === room.path)), victim));
  if (dash.phone) {
    const ph = JSON.stringify(await cfgOf(dash.phone.url));
    await check('HA: Mobil-Layout kennt die umbenannte Kachel', ph.includes(JSON.stringify(NAME)));
  }

  // Dashboard neu laden: Kachel sichtbar, keine Fehlerkarte.
  await dashboard(o.page, dash.url + '/' + room.path);
  const shown = await H((name) => {
    const row = window.__pierce('casora-smart-row')[0];
    const names = row ? [...(row.shadowRoot || row).querySelectorAll('button-card')].map((k) => (k.shadowRoot && k.shadowRoot.querySelector('#name') || {}).textContent || '') : [];
    return { has: names.some((n) => n.trim() === name), errors: window.__pierce('hui-error-card').length };
  }, NAME);
  await check('Dashboard zeigt die neue Kachel in der Kachelreihe', shown.has, shown);
  await check('Dashboard ohne Fehlerkarte', shown.errors === 0, shown);
} catch (e) {
  await check('Ablauf ohne Abbruch', false, String(e && e.message || e).split('\n')[0]);
}
await finish();
