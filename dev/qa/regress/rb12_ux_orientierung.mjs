// @zustand: arbeit
// @parallel: ui
// Neues Studio – Orientierung und Wege (UX-Runde 06.10.2026, V-01 … V-14). Erwartet:
// Werkzeugleiste „Inhalt“ (nicht „Elemente“) mit Untertitel beim Zeigen; Dashboard-Menü beginnt mit
// „Gilt für: dieses Dashboard“, Einstellungen mit „Gilt für: alle Dashboards“; der Kachel-Editor
// nennt den Weg („… › Kacheln · Gilt für: diesen Raum“); „+“ öffnet „Was soll auf das Dashboard?“,
// ein Gerät aus einem anderen Raum fragt „Wohin?“ und landet dort mit der passenden Kachelart;
// „…“ heißt „Hilfe & Extras“ ohne Zeitreise (die steht im Titelmenü). Am Handy: Rückgängig und
// Zeitreise oben sichtbar. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page, browser } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
const menuText = () => H(() => { const m = [...window.__panel().shadowRoot.querySelectorAll('.combo-menu')].pop(); return m ? m.innerText : ''; });
const tool = (id) => H((id) => window.__panel().shadowRoot.querySelector('.btools [data-b="' + id + '"]').click(), id);
await H(() => window.__panel()._bClose());
await page.waitForTimeout(500);

// V-02: „Inhalt“ mit Untertitel
const list = await H(() => { const b = window.__panel().shadowRoot.querySelector('.btools [data-b="list"]'); return { t: b.innerText, tip: b.title }; });
await check('Werkzeugleiste: „Inhalt“ mit Untertitel', /Inhalt/.test(list.t) && /Foto, Badges, Kacheln und Popups/.test(list.tip), list);

// V-01: Gilt für
await tool('dash');
await page.waitForTimeout(500);
const dm = await menuText();
await check('Dashboard-Menü: „Gilt für: dieses Dashboard“, Design gilt für alle', /^Gilt für: dieses Dashboard/.test(dm) && /Design gilt für alle Dashboards/.test(dm), dm.slice(0, 120));
await page.keyboard.press('Escape');
await tool('home');
await page.waitForTimeout(500);
const hm = await menuText();
await check('Einstellungen-Menü: „Gilt für: alle Dashboards“', /^Gilt für: alle Dashboards/.test(hm), hm.slice(0, 80));
await page.keyboard.press('Escape');

// V-07: Weg im Kachel-Editor
const tileRoom = await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms;
  for (let i = 0; i < rs.length; i++) for (const t of rs[i].tiles || []) if (t.entity) {
    p._room = i; p._renderTabs(); p._renderForm(); p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t), label: t.name || '' }); return p._roomLabel(rs[i]); }
  return null; });
await page.waitForTimeout(900);
const path = await H(() => { const e = window.__panel().shadowRoot.querySelector('.inspector .insphead .uxpath'); return e ? e.textContent : null; });
await check('Kachel-Editor nennt den Weg', !!tileRoom && path === tileRoom + ' › Kacheln · Gilt für: diesen Raum', path);

// V-04: vom Gerät her hinzufügen (in die Übersicht geöffnet, Gerät eines anderen Raums)
const target = await H(() => { const p = window.__panel(); p._bClose(); p._room = 0; p._renderTabs(); p._renderForm();
  const c = p._uxDevices().find((x) => x.fresh && x.roomIndex > 0 && x.type === 'light');
  return c ? { entity: c.entity, name: c.name, room: c.roomIndex, n: (p._state.compact.rooms[c.roomIndex].tiles || []).length } : null; });
await need('Licht ohne Kachel in einem Raum', target);
await page.locator('.btools [data-b="add"]').first().click().catch(() => tool('add'));
await page.waitForTimeout(600);
const sheet = await H(() => { const s = window.__panel().shadowRoot.querySelector('.uxadd'); return s ? s.innerText : null; });
await check('„+“ öffnet „Was soll auf das Dashboard?“ mit „Andere Kachelart …“', /Was soll auf das Dashboard\?/.test(sheet || '') && /Andere Kachelart/.test(sheet || ''), (sheet || '').slice(0, 100));
await page.keyboard.type(target.name);
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
const ask = await H(() => { const a = window.__panel().shadowRoot.querySelector('.askcard'); return a ? a.innerText : null; });
await check('Gerät aus anderem Raum: „Wohin soll die Kachel?“', /Wohin soll die Kachel\?/.test(ask || ''), (ask || '').slice(0, 80));
await H(() => { const b = [...window.__panel().shadowRoot.querySelectorAll('.askacts button')].pop(); if (b) b.click(); });
await page.waitForTimeout(1200);
const added = await H((t) => { const p = window.__panel(); const r = p._state.compact.rooms[t.room]; const last = (r.tiles || [])[r.tiles.length - 1] || {};
  return { room: p._room, n: r.tiles.length, entity: last.entity, tpl: last.template, dirty: p._isDirty(), sel: p._sel && p._sel.group }; }, target);
await check('Kachel im Raum des Geräts, Licht-Vorlage, Editor offen', added.room === target.room && added.n === target.n + 1
  && added.entity === target.entity && /casora_light/.test(JSON.stringify(added.tpl)) && added.dirty && added.sel === 'tiles', added);
await H(() => window.__panel()._undo());
await page.waitForTimeout(400);

// V-09: „…“ = Hilfe & Extras, Zeitreise im Titelmenü
await H(() => window.__panel()._bClose());
const more = await H(() => window.__panel().shadowRoot.getElementById('more').title);
await check('„…“ heißt „Hilfe & Extras“', more === 'Hilfe & Extras', more);
await page.locator('#more').click();
await page.waitForTimeout(500);
const mm = await menuText();
await check('„…“ mit Tastenkürzel, ohne Zeitreise', /Tastenkürzel/.test(mm) && !/Zeitreise/.test(mm), mm.slice(0, 160));
await page.keyboard.press('Escape');
await H(() => window.__panel()._dashSwitchMenu(window.__panel().shadowRoot.getElementById('roomtitle')));
await page.waitForTimeout(500);
await check('Titelmenü führt die Zeitreise', /Zeitreise/.test(await menuText()));
await page.keyboard.press('Escape');
await browser.close();

// Handy: Rückgängig und Zeitreise oben
{
  const o = await open({ width: 390, height: 844, mobile: true, dark: false, studio: 'b' });
  await studio(o.page, dash.url);
  await o.page.evaluate(() => window.__panel()._bClose());
  await o.page.waitForTimeout(600);
  const top = await o.page.evaluate(() => { const r = window.__panel().shadowRoot; const v = (id) => { const e = r.getElementById(id); return !!(e && e.getClientRects().length); };
    return { undo: v('undo'), rewind: v('brewind') }; });
  await check('Handy: Rückgängig und Zeitreise oben sichtbar', top.undo && top.rewind, top);
  await o.browser.close();
}
await finish();
