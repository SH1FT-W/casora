// @zustand: arbeit
// @parallel: allein
// Nutzertest 4 (07.10.2026). Erwartet: Tippen direkt nach dem Klick auf die Suche landet im Suchfeld,
// HA-Kürzel (a = Assist, e = Schnellsuche) öffnen im Studio nichts, ⌘K öffnet die Studio-Suche;
// „Raum umbenannt“ lässt sich zurücknehmen, auch wenn danach im selben Raum anderes geändert wurde;
// ein ausgeblendeter Raum steht im Hinweis „N ausgeblendet“ (antippen = einblenden) und ist am Raumknopf
// und in der Vorschau-Leiste markiert; nach dem Einschalten der Rückfrage öffnet „Ausprobieren“ im
// Toast das Popup; die Werkzeugleiste am iPad (quer/hochkant) überlappt nicht und hängt nicht vom
// Raumnamen ab. Handy: Einstellungen-Leiste nach dem Speichern zurückgesetzt (Lüften-Empfänger wird
// dafür kurz gesetzt und wieder entfernt), Uhr-Hinweis sichtbar, Räume-Menü „… · Einblenden“.
// Das Dashboard wird nicht gespeichert.
import { open, studio, casoraDashboard, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard((d) => ((d.config || {}).views || []).length > 3);
await need('Casora-Dashboard', dash);

const { page } = await open({ width: 1600, height: 1000, dark: false });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
await H(() => window.__panel()._bClose && window.__panel()._bClose());
await page.waitForTimeout(600);
// HA-Dialoge offen? (Schnellsuche, Assist)
const haOpen = () => H(() => { const r = document.querySelector('home-assistant').shadowRoot;
  return [...r.querySelectorAll('ha-quick-bar, ha-voice-command-dialog')].filter((e) => e._opened || (e.shadowRoot && e.shadowRoot.querySelector('[open]'))).map((e) => e.tagName.toLowerCase()); });
const search = () => H(() => { const r = window.__panel().shadowRoot; const i = r.querySelector('.msearch input'); return i ? { val: i.value, focus: r.activeElement === i } : null; });

// 1) Suche: sofort tippen, Buchstaben-Kürzel, ⌘K
await page.click('#msearch');
await page.keyboard.type('ae');
await page.waitForTimeout(400);
const s1 = await search();
await check('Getippt direkt nach dem Klick landet im Suchfeld', s1 && s1.val === 'ae' && s1.focus, s1);
await check('Dabei öffnet HA weder Assist noch Schnellsuche', !(await haOpen()).length, await haOpen());
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.mouse.click(8, 990);
await page.keyboard.type('aecdm');
await page.waitForTimeout(500);
await check('Buchstaben ohne Eingabefeld lösen im Studio keine HA-Kürzel aus', !(await haOpen()).length, await haOpen());
await page.keyboard.press('Meta+k');
await page.waitForTimeout(500);
const s2 = await search();
await check('⌘K öffnet die Studio-Suche, nicht HAs Schnellsuche', s2 && s2.focus && !(await haOpen()).length, [s2, await haOpen()]);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// 2) Umbenennen + Kachel + Badge im selben Raum → Umbenennung einzeln zurücknehmbar
const ri = await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms;
  const i = rs.findIndex((r, k) => k > 0 && r.path && (r.tiles || []).length); if (i < 0) return -1;
  p._room = i; p._renderTabs(); p._renderForm();
  p._undoStack.push(p._snap()); rs[i].name = rs[i].name + ' QA'; p._markDirty();
  p._undoStack.push(p._snap()); rs[i].tiles[0].variables = { ...(rs[i].tiles[0].variables || {}), enabled: false }; p._markDirty();
  p._undoStack.push(p._snap()); rs[i].variables = rs[i].variables || {}; rs[i].variables.climate_title = 'Luft'; p._markDirty();
  return i; });
await need('Raum mit Kacheln', ri > 0);
await page.waitForTimeout(500);
await H(() => window.__panel().shadowRoot.querySelector('.toprow > .bedited').click());
await page.waitForTimeout(500);
const rows = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.mpop li.mline')].map((li) => [li.querySelector('.mtxt').textContent, li.querySelector('.mback').disabled]));
const ren = rows.find((r) => /umbenannt/.test(r[0]) && / QA/.test(r[0]));
await check('„Raum umbenannt“ ist trotz Änderungen im selben Raum zurücknehmbar', ren && ren[1] === false, rows);
await H(() => { const li = [...window.__panel().shadowRoot.querySelectorAll('.mpop li.mline')].find((x) => / QA/.test(x.querySelector('.mtxt').textContent) && /umbenannt/.test(x.textContent)); li.querySelector('.mback').click(); });
await page.waitForTimeout(500);
const left = await H((i) => { const p = window.__panel(); const r = p._state.compact.rooms[i]; return { name: r.name, n: p._mChanges().length, badge: (r.variables || {}).climate_title }; }, ri);
await check('Name zurück, die beiden anderen Änderungen bleiben', !/ QA$/.test(left.name) && left.n === 2 && left.badge === 'Luft', left);
await page.keyboard.press('Escape');
await H(() => { const p = window.__panel(); while (p._undoStack.length && p._isDirty()) p._undo(); });
await page.waitForTimeout(400);

// 3) Ausgeblendeter Raum: Hinweis, Markierung, wieder einblenden
await H((i) => window.__panel()._mHideRoom(i, true), ri);
await page.waitForTimeout(1200);
const mark = await H(() => { const r = window.__panel().shadowRoot;
  return { chip: (r.querySelector('.bhid') || {}).textContent || '', btn: !!r.querySelector('.btools [data-b="rooms"].bhidroom'), tab: !!r.querySelector('.mini-tab.on.hid') }; });
await check('Raumknopf und Vorschau-Leiste markieren den ausgeblendeten Raum', mark.btn && mark.tab, mark);
await H(() => window.__panel().shadowRoot.querySelector('.bhid').click());
await page.waitForTimeout(500);
const menu = await H(() => [...window.__panel().shadowRoot.querySelectorAll('[role=menu] [role=menuitem], [role=menu] button')].map((b) => b.textContent.trim()).join(' | '));
const rname = await H((i) => window.__panel()._roomLabel(window.__panel()._state.compact.rooms[i]), ri);
await check('„N ausgeblendet“ nennt den Raum mit „Einblenden“', menu.includes(rname + ' · Einblenden'), menu);
const at = await H((n) => { const b = [...window.__panel().shadowRoot.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => x.textContent.includes(n + ' · '));
  if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, rname);
if (at) await page.mouse.click(at[0], at[1]);
await page.waitForTimeout(600);
await check('Antippen blendet den Raum wieder ein', await H((i) => !(window.__panel()._state.compact.rooms[i].variables || {}).casora_hidden, ri));

// 4) Rückfrage einschalten → Toast „Ausprobieren“ öffnet das Popup
const sw = await H(async () => { const p = window.__panel(); const rs = p._state.compact.rooms;
  for (let i = 0; i < rs.length; i++) for (const t of rs[i].tiles || []) {
    p._room = i; p._renderTabs(); p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t), label: '' });
    await new Promise((r) => setTimeout(r, 250));
    const lab = [...p.shadowRoot.querySelectorAll('#pane .mgroup label')].find((l) => /Vor dem Schalten fragen/.test(l.textContent));
    if (lab) { const s = lab.parentElement.querySelector('[role=switch], button, input'); if (s && s.getAttribute('aria-checked') !== 'true') { s.click(); return true; } }
  }
  return false; });
await need('Kachel mit Rückfrage-Schalter', sw);
await page.waitForTimeout(500);
const act = await H(() => { const b = [...window.__panel().shadowRoot.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Ausprobieren' && x.getClientRects().length); if (b) b.click(); return !!b; });
await check('Toast bietet „Ausprobieren“ an', act);
await page.waitForTimeout(2500);
await check('„Ausprobieren“ öffnet das Popup der Vorschau', await H(() => !!window.__panel()._cpLayer));
await H(() => { const p = window.__panel(); p._cpClose && p._cpClose(true); while (p._undoStack.length && p._isDirty()) p._undo(); });

// 5) Werkzeugleiste am iPad: keine Überlappung, gleich für kurzen und langen Raumnamen
for (const [w, h] of [[1024, 768], [768, 1024]]) {
  const o = await open({ width: w, height: h, dark: false, touch: true, scale: 1 });
  const pg = o.page;
  await studio(pg, dash.url);
  await pg.evaluate(() => window.__panel()._bClose && window.__panel()._bClose());
  const seen = [];
  for (const pick of ['short', 'long']) {
    await pg.evaluate((pick) => { const p = window.__panel(); const rs = p._state.compact.rooms.map((r, i) => [p._roomLabel(r).length, i]).sort((a, b) => a[0] - b[0]);
      p._room = (pick === 'short' ? rs[0] : rs[rs.length - 1])[1]; p._renderTabs(); p._renderForm(); }, pick);
    await pg.waitForTimeout(1200);
    seen.push(await pg.evaluate(() => { const p = window.__panel(); const r = p.shadowRoot;
      const els = [...r.querySelectorAll('.toprow > *, .toprow .btools > *, .toprow .navpill > *')].filter((e) => e.getClientRects().length
        && !e.classList.contains('btools') && !e.classList.contains('navpill') && !e.classList.contains('bedited') && e.getBoundingClientRect().width > 2 && getComputedStyle(e).visibility !== 'hidden');
      const R = els.map((e) => { const b = e.getBoundingClientRect(); return { n: e.id || e.dataset.b || e.className, l: b.left, r: b.right, t: b.top, b: b.bottom }; });
      const ov = [];
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], c = R[j];
        if (a.l < c.r - 1 && c.l < a.r - 1 && a.t < c.b - 1 && c.t < a.b - 1) ov.push(a.n + '×' + c.n); }
      const lab = r.querySelector('#roomtitle .rt-label');
      return { ov, cut: !!(lab && lab.scrollWidth > lab.clientWidth + 1), cls: [...p.classList].filter((c) => /^uxs|^btight$/.test(c)).sort().join(' ') }; }));
  }
  await check(`${w}×${h}: nichts überlappt, Titel nicht abgeschnitten`, seen.every((x) => !x.ov.length && !x.cut), seen);
  await check(`${w}×${h}: Beschriftungen hängen nicht vom Raumnamen ab`, seen[0].cls === seen[1].cls, seen);
}

// 6) Handy (Gruppe E): Einstellungen-Leiste nach dem Speichern, Uhr-Hinweis, Räume-Menü „Einblenden“
{
  const o = await open({ width: 390, height: 844, mobile: true, dark: false, scale: 2 });
  const pg = o.page;
  const P = (fn, a) => pg.evaluate(fn, a);
  await studio(pg, dash.url);
  await P(() => window.__panel()._bClose());
  await P(() => window.__panel()._csOpenPage('vent'));
  await pg.waitForTimeout(1500);
  const tapOn = async (sel) => { const at = await P((s) => { const e = window.__panel().shadowRoot.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); if (at) await pg.touchscreen.tap(at[0], at[1]); return !!at; };
  const had = await tapOn('.casora-chip');
  await pg.waitForTimeout(400);
  if (had) {
    await tapOn('.cs-save');
    await pg.waitForTimeout(3500);
    const bar = await P(() => { const r = window.__panel().shadowRoot; return { st: r.querySelector('.cs-state').textContent, cls: r.querySelector('.cs-bar').className }; });
    await check('Handy: nach „Einstellungen speichern“ keine „Ungespeicherten Änderungen“ mehr', /cs-clean/.test(bar.cls) && !/Ungespeichert/.test(bar.st), bar);
    // zurück auf den Anfangszustand
    await tapOn('.casora-chip');
    await pg.waitForTimeout(300);
    await P(() => window.__panel()._csSave());
    await pg.waitForTimeout(2500);
  }
  await P(() => { const p = window.__panel(); p._bClose(); p._bOpen = true; p._select({ group: 'rooms', key: 'Time', label: 'Time' }); });
  await pg.waitForTimeout(1000);
  await check('Handy: Uhr-Hinweis „Handy-Layout hat keine Uhr“ sichtbar', await P(() => [...window.__panel().shadowRoot.querySelectorAll('.hint')]
    .some((h) => /keine Uhr/.test(h.textContent) && h.getBoundingClientRect().height > 0)));
  await P(() => { const p = window.__panel(); p._bClose(); const i = p._state.compact.rooms.findIndex((r, k) => k > 0 && r.path); p._mHideRoom(i, true); p._room = 0; p._renderTabs(); p._renderForm(); });
  await pg.waitForTimeout(800);
  await tapOn('.bbar [data-b="rooms"]');
  await pg.waitForTimeout(600);
  const show = await P(() => { const b = [...window.__panel().shadowRoot.querySelectorAll('[role=menu] [role=menuitem]')].find((x) => / · Einblenden/.test(x.textContent));
    if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  if (show) await pg.touchscreen.tap(show[0], show[1]);
  await pg.waitForTimeout(600);
  await check('Handy: Räume-Menü blendet den Raum mit einem Tipp wieder ein', !!show && await P(() => !window.__panel()._state.compact.rooms.some((r) => (r.variables || {}).casora_hidden)));
}

await finish();
