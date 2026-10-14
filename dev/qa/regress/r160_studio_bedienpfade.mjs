// @zustand: arbeit
// @parallel: ui
// @deckt: custom_components/casora/panel/casora-panel.js custom_components/casora/panel/casora-panel-b.js custom_components/casora/panel/casora-panel-b-plus.js custom_components/casora/panel/casora-panel-b-mehr.js custom_components/casora/panel/casora-panel-kachelart.js custom_components/casora/panel/casora-panel-updates.js
// Gefunden beim Durchspielen der Studio-Bedienpfade (d-studio, 10.10.2026), Desktop 1440 – gespeichert wird nichts:
//   ds-01 Dashboard erneut geladen (Zeitreise, gleiches Dashboard): Vorschau behielt alte Kachel-Schlüssel,
//         ein Klick auf eine Kachel wählte nichts. Erwartet: Schlüssel der Vorschau = Schlüssel im Stand, Klick wählt.
//   ds-02 Gerätefeld: ↓ + Enter wählte nie (Menü prüfte eine Klasse „open“, die niemand setzt); getippter Suchtext
//         wurde beim Verlassen (Tab) zur „Entität“ der Kachel; Esc ließ den Suchtext stehen.
//   ds-03 Inspektor-Kopf zeigte nach Umbenennen weiter den alten Kachelnamen.
//   ds-04 Kachel hinzufügen → Rückgängig → Inspektor zu: der Schleier über der Vorschau blieb stehen.
//   ds-05 Kachelart „Was soll anders sein?“: Text 16 px weiter eingerückt als das Namensfeld, andere Schrift.
//   ds-06 Updates (hell): „Nach Updates suchen“ hatte die Farbe der Karte – der Knopf war unsichtbar.
//   ds-10 Kachel entfernen bei offenem Inspektor: Schleier über den Kacheln blieb, Inspektor zeigte den Raum.
//   ds-11 „Raum löschen?“: Taste „Löschen“ dunkle Schrift auf Rot (~1,6:1). Erwartet ≥ 4,5:1.
//   ds-12 „Wer sieht das?“ 17 px/500 neben 15-px-Eingabefeldern. Erwartet: gleiche Schriftgröße.
import { open, usePage, studio, studioDashboard, check, need, finish } from './lib.mjs';

const dash = await studioDashboard();
await need('Casora-Dashboard fürs Studio', dash);
const { page } = await open({ width: 1440, height: 900, dark: false });
usePage(page);
await studio(page, dash);
const P = (src, a) => page.evaluate(([src, a]) => new Function('p', 'arg', 'return (async () => {' + src + '})()')(window.__panel(), a), [src, a]);
const wait = (ms) => page.waitForTimeout(ms);

// ds-01: noch einmal laden (gleiches Dashboard) → Vorschau trägt die neuen Schlüssel.
await P('await p._load();');
await wait(2500);
const keys = await P(`const room = p._state.compact.rooms[p._room];
  return { state: (room.tiles || []).map((t) => p._tileKey(t)), shown: [...p.shadowRoot.querySelectorAll('.mtile[data-mk]')].map((e) => e.dataset.mk.slice(2)) };`);
await need('Kacheln im ersten Raum', keys.state.length > 0, keys);
await check('ds-01 Vorschau-Schlüssel = Schlüssel im Stand nach erneutem Laden', keys.shown.length > 0 && keys.shown.every((k) => keys.state.includes(k)), keys);
const tileBox = async (i) => P(`const e = [...p.shadowRoot.querySelectorAll('.mtile[data-mk]')][arg]; e.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  await new Promise((r) => setTimeout(r, 300)); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, key: e.dataset.mk.slice(2) };`, i);
// Eine Kachel mit Gerätefeld suchen (erste, deren Inspektor ein „Gerät“-Feld hat).
let picked = null;
for (let i = 0; i < keys.shown.length && !picked; i++) {
  const b = await tileBox(i);
  await page.mouse.click(b.x, b.y);
  await wait(900);
  const sel = await P('return p._sel && p._sel.key;');
  if (i === 0) await check('ds-01 Klick auf eine Kachel wählt sie aus', sel === b.key, { sel, want: b.key });
  const hasEnt = await P(`return [...p.shadowRoot.querySelectorAll('label')].some((l) => /^(Gerät|Device)$/.test(l.textContent.trim()) && l.getBoundingClientRect().width > 0
    && l.closest('.row, .field, .frow, div').querySelector('input'));`);
  if (hasEnt) picked = b.key;
}
await need('Kachel mit Gerätefeld', picked);

const ent = () => P(`const room = p._state.compact.rooms[p._room]; const t = (room.tiles || []).find((t) => p._tileKey(t) === (p._sel && p._sel.key)); return t ? p._tileEnt(t) : null;`);
const field = async () => {
  await P(`const l = [...p.shadowRoot.querySelectorAll('label')].find((l) => /^(Gerät|Device)$/.test(l.textContent.trim()) && l.getBoundingClientRect().width);
    const row = l.closest('.row, .field, .frow, div'); row.querySelector('input').setAttribute('data-qa', 'ent');`);
  return page.locator('[data-qa="ent"]');
};
const ent0 = await ent();
// ds-02a: Freitext + Tab ändert die Entität nicht.
let f = await field();
await f.click(); await wait(200);
await page.keyboard.type('qa kein geraet xyz'); await wait(300);
await page.keyboard.press('Tab'); await wait(700);
await check('ds-02 Freitext im Gerätefeld wird beim Verlassen nicht zur Entität', (await ent()) === ent0, { vorher: ent0, nachher: await ent() });
// ds-02b: Esc leert den Suchtext.
f = await field();
await f.click(); await wait(200);
await page.keyboard.type('qa xyz'); await wait(300);
await page.keyboard.press('Escape'); await wait(300);
await check('ds-02 Esc verwirft den Suchtext im Gerätefeld', (await f.inputValue()) === '', await f.inputValue());
await page.mouse.click(1230, 860); await wait(400);
// ds-02c: ↓ + Enter wählt den nächsten Eintrag des Menüs. Beim Öffnen ist das aktuelle Gerät markiert
// (active = sein Platz); ↓ ↓ landete bei nur zwei Einträgen (arbeit-Haus: zwei Schlösser) wieder darauf.
f = await field();
const before = await ent();
await f.click(); await wait(500);
const opts = await P(`return [...p.shadowRoot.querySelectorAll('.combo-opt')].filter((e) => e.getBoundingClientRect().width).length;`);
await page.keyboard.press('ArrowDown'); await wait(120);
await page.keyboard.press('Enter'); await wait(800);
const after = await ent();
await check('ds-02 ↓ + Enter wählt ein Gerät aus dem Menü', opts > 1 && after && after !== before && after.indexOf('.') > 0, { before, after, opts });

// ds-03: Umbenennen → Kopf zeigt den neuen Namen.
await P(`const l = [...p.shadowRoot.querySelectorAll('label')].find((l) => /^Name$/.test(l.textContent.trim()) && l.getBoundingClientRect().width);
  const row = l.closest('.row, .field, .frow, div'); row.querySelector('input').setAttribute('data-qa', 'name');`);
const nm = page.locator('[data-qa="name"]');
await nm.click(); await nm.fill('');
await page.keyboard.type('Qa Neuer Kachelname'); await wait(600);
const head = await P(`const h = p.shadowRoot.querySelector('.detailbar h3'); return h ? h.textContent : null;`);
await check('ds-03 Inspektor-Kopf zeigt den neuen Kachelnamen', head === 'Qa Neuer Kachelname', head);

// ds-04: Kachel hinzufügen, Rückgängig, Inspektor schließen → kein Schleier.
await P('p._bClose();'); await wait(400);
const total = () => P(`return p._state.compact.rooms.reduce((n, r) => n + (r.tiles || []).length, 0);`);
const n0 = await total();
await page.locator('.btool.uxplus').click(); await wait(800);
await page.keyboard.press('Enter'); await wait(1000);
const where = page.getByRole('button', { name: /^(Hinzufügen|Add)$/ });
if (await where.isVisible().catch(() => false)) { await where.click(); await wait(1000); }
const n1 = await total();
await need('ds-04 Kachel hinzugefügt', n1 === n0 + 1, { n0, n1 });
await page.keyboard.press('Meta+z'); await page.keyboard.press('Control+z'); await wait(900);
await P('p._bClose();'); await wait(700);
const veil = await P(`const room = p.shadowRoot.querySelector('.miniroom'); const s = room && room.querySelector('.mzscrim');
  return { focusing: !!(room && room.classList.contains('focusing')), on: !!p._focusOn, op: s ? getComputedStyle(s).opacity : null, group: p._group };`);
await check('ds-04 Nach Rückgängig + Schließen kein Schleier über der Vorschau', !veil.focusing && !veil.on, veil);

// ds-10: Kachel entfernen bei offenem Inspektor → Raum, kein Schleier.
{
  await P('p._room = 0; p._sel = null; p._group = "rooms"; p._renderTabs(); p._renderForm(); p._rebuildPreview();'); await wait(1500);
  const b = await tileBox(0);
  await page.mouse.click(b.x, b.y); await wait(900);
  await P(`const b = [...p.shadowRoot.querySelectorAll('button')].find((x) => /Kachel entfernen|Remove Tile/i.test(x.textContent) && x.getBoundingClientRect().width); b.click();`);
  await wait(1200);
  const st = await P(`return { focus: !!p._focusOn, group: p._group, sel: p._sel, open: !!p._bOpen };`);
  await check('ds-10 Nach „Kachel entfernen“ (Inspektor offen) kein Schleier, Gruppe Raum', !st.focus && st.group === 'rooms', st);
  await page.keyboard.press('Meta+z'); await page.keyboard.press('Control+z'); await wait(800);
}

// ds-11: „Raum löschen?“ – Löschen-Taste lesbar.
{
  const res = await P(`const p2 = p; const ri = p2._state.compact.rooms.findIndex((r, i) => i > 0); p2._room = ri;
    const pr = p2._ask({ title: 'Qa', message: 'Qa', confirmLabel: 'Nur ausblenden', altLabel: 'Löschen',
      extend: ({ acts }) => { const a = acts.querySelector('.askalt'); if (a) a.classList.add('danger'); } });
    await new Promise((r) => setTimeout(r, 600));
    const b = [...p2.shadowRoot.querySelectorAll('.askpane button')].find((x) => x.textContent.trim() === 'Löschen');
    const s = getComputedStyle(b); const out = { color: s.color, bg: s.backgroundColor };
    const c = [...p2.shadowRoot.querySelectorAll('.askpane button')].find((x) => /Abbrechen|Cancel/.test(x.textContent)); if (c) c.click();
    return out;`);
  const rgb = (x) => x.match(/[\d.]+/g).slice(0, 3).map(Number);
  const L = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const a = L(rgb(res.color)), b2 = L(rgb(res.bg)); const k = (Math.max(a, b2) + 0.05) / (Math.min(a, b2) + 0.05);
  await check('ds-11 „Löschen“ auf Rot lesbar (Kontrast ≥ 4,5)', k >= 4.5, { ...res, kontrast: Math.round(k * 100) / 100 });
  await wait(400);
}

// ds-12: „Wer sieht das?“ wie die Eingabefelder.
{
  await P('p._bClose(); p._room = 1; p._renderTabs(); p._bOpen = true; p._group = "rooms"; p._sel = null; p._renderForm();'
    // 1.5: Räume starten zugeklappt – „Darstellung“ aufklappen.
    + ' if (p._folded && p._folded.has("Appearance")) { p._folded.delete("Appearance"); p._renderForm(); }'); await wait(1200);
  const fs = await P(`const v = [...p.shadowRoot.querySelectorAll('.mwho .mval')].find((x) => x.getBoundingClientRect().width);
    const i = [...p.shadowRoot.querySelectorAll('input')].find((x) => x.getBoundingClientRect().width && x.getBoundingClientRect().left > 900 && x.type !== 'checkbox');
    return v && i ? { wer: getComputedStyle(v).fontSize, feld: getComputedStyle(i).fontSize } : null;`);
  await need('„Wer sieht das?“ im Raum sichtbar', fs);
  await check('ds-12 „Wer sieht das?“ in der Schriftgröße der Eingabefelder', fs.wer === fs.feld, fs);
}

// ds-05: Kachelart – Wunschfeld fluchtet mit dem Namensfeld, gleiche Schrift.
await P(`const T = await p._previewTemplates(); await p._kaStart({}); await new Promise((r) => setTimeout(r, 600));
  const b = p.shadowRoot.querySelector('[data-base]'); const base = b ? b.dataset.base : Object.keys(T)[0];
  p._kaName({ room: null, tile: null, base, own: null, T, label: 'Qa', wish: 'Qa Wunsch', wishes: [], notes: [], current: null, switchTile: false, ai: null });`);
await wait(1200);
const ka = await P(`const i = p.shadowRoot.querySelector('input[data-ka=name]'), t = p.shadowRoot.querySelector('textarea[data-ka=wish]');
  if (!i || !t) return null; const si = getComputedStyle(i), st = getComputedStyle(t);
  return { nameX: i.getBoundingClientRect().left + parseFloat(si.paddingLeft), wishX: t.getBoundingClientRect().left + parseFloat(st.paddingLeft), fi: si.fontFamily, ft: st.fontFamily };`);
await need('Kachelart-Schritt „Name und Wunsch“', ka);
await check('ds-05 Wunschtext fluchtet mit dem Namen (±1 px)', Math.abs(ka.nameX - ka.wishX) <= 1, ka);
await check('ds-05 Wunschfeld in derselben Schrift wie das Namensfeld', ka.fi === ka.ft, ka);
await P('if (p._flowMode) p._exitFlow(false);'); await wait(500);

// ds-06: Updates (hell) – Zweitknopf hebt sich von der Karte ab.
await P('if (p._cuOpenPage) p._cuOpenPage(); else p._cuSheet();'); await wait(2500);
const up = await P(`const b = [...p.shadowRoot.querySelectorAll('.cu-acts button.ghost')].find((x) => x.getBoundingClientRect().width);
  if (!b) return null; const box = b.closest('.cu-box') || b.parentElement.parentElement;
  return { btn: getComputedStyle(b).backgroundColor, card: getComputedStyle(box).backgroundColor, txt: b.textContent.trim() };`);
await need('Updates mit Zweitknopf', up);
await check('ds-06 Zweitknopf in den Updates hat eine eigene Fläche (≠ Karte)', up.btn !== up.card && !/rgba\(0, 0, 0, 0\)/.test(up.btn), up);

await finish();
