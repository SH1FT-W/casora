// @zustand: arbeit
// @parallel: ui
// Nutzertest 3 (07.10.2026). Erwartet: ⌘K findet ein Gerät ohne Kachel und legt es im Raum des Geräts
// an; das Popup der Studio-Vorschau fragt bei „Vor dem Schalten fragen“ nach (auch ungespeichert);
// nach „Zurücknehmen“ einer Zeile ist „Wiederholen“ bedienbar und die Knöpfe der Liste bleiben stehen;
// „…“ trägt „Auf Handy öffnen“, das Raummenü nennt ausgeblendete Räume oben; der Szenen-Dialog
// hat eine Farbe; „Ansehen als“ zählt im Sicherheits-Badge nur Sichtbares; lange Menüs klappen
// nach oben, wenn sie nur dort ganz hinpassen. Es wird nichts gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);

const { page, browser } = await open({ width: 1600, height: 1000, dark: false });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
const R0 = (s) => H((x) => { const e = window.__panel().shadowRoot.querySelector(x); return e ? e.innerText : null; }, s);
await H(() => window.__panel()._bClose && window.__panel()._bClose());
await page.waitForTimeout(600);

// ⌘K: Gerät ohne Kachel (ein Schalter, damit danach das Popup schalten kann)
const dev = await H(() => { const p = window.__panel(); const d = (p._uxDevices() || []).filter((c) => c.fresh && c.roomIndex > 0);
  const c = d.find((x) => /^switch\./.test(x.entity)) || d[0]; return c ? { name: c.name, entity: c.entity, ri: c.roomIndex } : null; });
await need('Gerät ohne Kachel', dev);
await page.keyboard.press('Meta+k');
await page.waitForTimeout(300);
await page.keyboard.type(dev.name);
await page.waitForTimeout(400);
const row = await R0('.msearch .mrow');
await check('⌘K bietet „Kachel für … hinzufügen“ an', /Kachel für .* hinzufügen/.test(row || '') && /noch ohne Kachel/.test(row || ''), row);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
const added = await H((e) => { const p = window.__panel(); const t = (p._state.compact.rooms[p._room].tiles || []).find((x) => x.entity === e); return { room: p._room, ok: !!t }; }, dev.entity);
await check('Kachel liegt im Raum des Geräts', added.ok && added.room === dev.ri, [added, dev.ri]);

// Popup der Vorschau fragt nach (nur Schalter: Licht-Popups sind in der Vorschau nicht bedienbar)
if (/^switch\./.test(dev.entity)) {
  await H((e) => { const p = window.__panel(); const t = p._state.compact.rooms[p._room].tiles.find((x) => x.entity === e);
    t.variables = { ...(t.variables || {}), confirm_toggle: true }; p._markDirty(); p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t), label: t.name || '' }); }, dev.entity);
  await page.waitForTimeout(900);
  await H(() => { const b = window.__panel().shadowRoot.querySelector('.cp-show'); if (b) b.click(); });
  await page.waitForTimeout(3500);
  const ids = await H(() => window.__casoraConfirmIds || []);
  await check('Vorschau kennt die Rückfrage (ungespeichert)', ids.indexOf(dev.entity) >= 0, ids);
  // Schaltaktion wie button-card sie schickt, aus dem Popup heraus
  await H((e) => { const pop = window.__panel().shadowRoot.querySelector('casora-popup');
    (pop || document.body).dispatchEvent(new CustomEvent('hass-action', { bubbles: true, composed: true,
      detail: { action: 'tap', config: { entity: e, tap_action: { action: 'toggle' } } } })); }, dev.entity);
  await page.waitForTimeout(500);
  await check('Schalten im Vorschau-Popup fragt nach', await H(() => !!document.querySelector('.casora-askfirst')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await H(() => window.__panel()._cpClose && window.__panel()._cpClose(true));
}

// Änderungsliste: Zurücknehmen → Wiederholen, Knöpfe bleiben stehen
await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms;
  const a = rs.findIndex((r, i) => i > 0 && r.path); p._undoStack.push(p._snap()); rs[a].name = rs[a].name + ' QA'; p._markDirty();
  const b = rs.findIndex((r, i) => i > 0 && i !== a); p._undoStack.push(p._snap()); rs[b].variables = rs[b].variables || {}; rs[b].variables.climate_title = 'Luft'; p._markDirty(); });
await page.waitForTimeout(500);
await H(() => window.__panel().shadowRoot.querySelector('.toprow > .bedited').click());
await page.waitForTimeout(500);
const pos = () => H(() => [...window.__panel().shadowRoot.querySelectorAll('.mpop .macts button')].map((b) => [b.innerText.split('\n')[0], Math.round(b.getBoundingClientRect().top), b.disabled]));
const before = await pos();
const n0 = await H(() => window.__panel()._mChanges().length);
await H(() => window.__panel().shadowRoot.querySelectorAll('.mpop li.mline .mback')[0].click());
await page.waitForTimeout(600);
const after = await pos();
await check('Knöpfe der Liste rutschen nicht', JSON.stringify(before.map((x) => x[1])) === JSON.stringify(after.map((x) => x[1])), [before, after]);
await check('Zurückgenommene Zeile bleibt als Platzhalter', /Zurückgenommen/.test(await R0('.mpop') || ''), await R0('.mpop'));
const redo = after.find((x) => /Wiederholen/.test(x[0]));
await check('„Wiederholen“ ist nach „Zurücknehmen“ bedienbar', redo && redo[2] === false, after);
await H(() => [...window.__panel().shadowRoot.querySelectorAll('.mpop .macts button')].find((b) => /Wiederholen/.test(b.innerText)).click());
await page.waitForTimeout(500);
await check('„Wiederholen“ holt die Zeile zurück', (await H(() => window.__panel()._mChanges().length)) === n0);

// „…“: Auf Handy öffnen
await H(() => window.__panel().shadowRoot.getElementById('more').click());
await page.waitForTimeout(500);
const more = await H(() => [...window.__panel().shadowRoot.querySelectorAll('[role=menu]')].map((m) => m.innerText).join(' | '));
await check('„…“ enthält „Auf Handy öffnen“', /Auf Handy öffnen/.test(more || ''), (more || '').slice(0, 200));
await page.keyboard.press('Escape');

// Raummenü: Hinweis auf ausgeblendete Räume
await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms; const i = rs.length - 1; rs[i].variables = rs[i].variables || {}; rs[i].variables.casora_hidden = true; p._markDirty(); });
await H(() => window.__panel()._roomTitleMenu(window.__panel().shadowRoot.getElementById('roomtitle')));
await page.waitForTimeout(500);
const rm = await H(() => [...window.__panel().shadowRoot.querySelectorAll('[role=menu] .combo-opt, [role=menu] [role=menuitem]')].map((e) => e.innerText.trim()).join(' | '));
await check('Raummenü nennt ausgeblendete Räume', /· Einblenden/.test(rm), rm.slice(0, 200));
await page.keyboard.press('Escape');

// Szenen-Dialog: Farbe wählbar
await H(() => window.__panel()._bSceneFromState());
await page.waitForTimeout(600);
const col = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.bsfs .bscol option')].length);
await check('Szenen-Dialog hat eine Farbauswahl', col > 3, col);
await H(() => window.__panel()._bSceneClose());

// Ansehen als: Sicherheits-Badge zählt nur, was dieser Mensch sieht
const sec = await H(async () => { const p = window.__panel(); const rs = p._state.compact.rooms;
  const i = rs.findIndex((r) => ((r.variables || {}).security_locks || []).length);
  if (i < 0) return null;
  const lock = rs[i].variables.security_locks[0];
  rs[i].tiles = (rs[i].tiles || []).concat([{ type: 'custom:button-card', template: 'lock', entity: lock, name: 'Tür', visibility: [{ condition: 'user', users: [p._hass.user.id] }] }]);
  p._room = i; p._renderTabs(); p._renderForm(); p._markDirty(); p._rebuildPreview();
  await new Promise((r) => setTimeout(r, 1200));
  const txt = () => [...p.shadowRoot.querySelectorAll('.pbadge')].map((b) => b.innerText).find((t) => /Sicherheit/.test(t)) || '';
  const me = txt();
  p._uxAs = 'qa-niemand'; p._rebuildPreview();
  await new Promise((r) => setTimeout(r, 1200));
  const other = txt();
  p._uxAs = null; p._rebuildPreview();
  return { me, other, lock };
});
if (sec) await check('„Ansehen als“: Badge zählt das ausgeblendete Schloss nicht', !/Schloss/.test(sec.other), sec);

// Menü klappt nach oben, wenn es nur dort ganz hinpasst
const flip = await H(async () => { const p = window.__panel(); const a = document.createElement('button'); a.textContent = 'x';
  a.style.cssText = 'position:fixed;left:200px;top:' + (window.innerHeight - 220) + 'px'; p.shadowRoot.appendChild(a);
  const items = Array.from({ length: 14 }, (_, k) => ({ id: 'f' + k, label: 'Farbe ' + k }));
  p._menuAt(a, items, () => {});
  await new Promise((r) => setTimeout(r, 400));
  const m = [...p.shadowRoot.querySelectorAll('[role=menu]')].pop(); const r = m.getBoundingClientRect();
  const res = { top: Math.round(r.top), bottom: Math.round(r.bottom), full: m.scrollHeight <= m.clientHeight + 1, up: r.bottom <= a.getBoundingClientRect().top + 1 };
  if (p._openCombo) p._openCombo(); a.remove(); return res; });
await check('Lange Liste unten: klappt nach oben und ist ganz zu sehen', flip.up && flip.full && flip.top >= 0, flip);

await H(() => { const p = window.__panel(); p._undoStack = []; p._resetUndo && p._resetUndo(); });
await browser.close();
await finish();
