// @zustand: arbeit
// @parallel: ui
// Neues Studio – mehr Bedienung (06.10.2026). Erwartet: Suchfeld „Suchen … ⌘K“ sichtbar, ⌘K öffnet die
// Suche, „Verlauf“ findet die Zeitreise (mit Weg im Ergebnis), Enter auf einer Kachel öffnet ihren
// Editor; „Bearbeitet · N Änderungen“ am Titel öffnet die Liste in Klartext; Rückgängig, dann ⌘⇧Z
// stellt die Änderung wieder her; Raummenü „Raum ausblenden“ – in „Räume ordnen“ grau mit
// „Einblenden“; Kachel-Editor zeigt „Wer sieht das?“ (Auswahl der HA-Benutzer) und bei Kacheln mit
// An/Aus-Schalter „Vor dem Schalten fragen“; Titelmenü „Auf Handy öffnen …“ zeigt einen QR-Code ohne
// Zugangsdaten; die Zeitreise bietet Benennen/Anheften; die Mobil-Vorschau zeigt „Aktuelle Wiedergabe“
// wie das Handy auch ohne den Desktop-Schalter (F-13). Es wird nichts gespeichert.
import { open, studio, casoraDashboard, fakeStates, check, need, finish } from './lib.mjs';

const dash = await casoraDashboard();
await need('Casora-Dashboard', dash);
const { page } = await open({ width: 1440, height: 900, dark: false, studio: 'b' });
await studio(page, dash.url);
const H = (fn, a) => page.evaluate(fn, a);
const R = (sel) => H((s) => { const e = window.__panel().shadowRoot.querySelector(s); return e ? e.innerText : null; }, sel);
await H(() => window.__panel()._bClose());
await page.waitForTimeout(500);

// Suche
const field = await H(() => { const b = window.__panel().shadowRoot.getElementById('msearch'); return b && b.getClientRects().length ? b.innerText : null; });
await check('Suchfeld „Suchen … ⌘K“ in der Werkzeugleiste', !!field && /Such/.test(field), field);
await page.keyboard.press('Meta+k');
await page.waitForTimeout(400);
await check('⌘K öffnet die Suche', !!(await R('.msearch')));
await page.keyboard.type('Verlauf');
await page.waitForTimeout(300);
const first = await R('.msearch .mrow');
await check('„Verlauf“ findet die Zeitreise mit Weg', /Zeitreise/.test(first || '') && /Rückgängig/.test(first || ''), first);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const tileName = await H(() => { const p = window.__panel(); const r = p._state.compact.rooms.find((x) => (x.tiles || []).some((t) => t.name)); const t = r && r.tiles.find((x) => x.name); return t ? t.name : null; });
await need('Kachel mit Namen', tileName);
await page.keyboard.press('Meta+k');
await page.waitForTimeout(300);
await page.keyboard.type(tileName);
await page.waitForTimeout(300);
await page.keyboard.press('Enter');
await page.waitForTimeout(1200);
const sel = await H(() => { const p = window.__panel(); return { sel: p._sel, open: !!p.shadowRoot.querySelector('.msearch') }; });
await check('Enter öffnet den Editor der gefundenen Kachel', sel.sel && sel.sel.group === 'tiles' && !sel.open, sel);

// Kachel-Editor: Wer sieht das?
const who = await R('#pane .tile.sel .mwho');
await check('Kachel-Editor zeigt „Wer sieht das?“ mit „Alle“', /Wer sieht das\?/.test(who || '') && /Alle/.test(who || ''), who);
await H(() => window.__panel().shadowRoot.querySelector('#pane .tile.sel .mwho button').click());
await page.waitForTimeout(900);
const sheet = await R('.askcard.mwhosheet');
await check('Auswahl nennt die HA-Benutzer und dass Admins alles sehen', /Admins sehen im Studio immer alles/.test(sheet || '') && /Casora Test|Test/.test(sheet || ''), (sheet || '').slice(0, 160));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
// Kachel mit An/Aus-Schalter: Rückfrage
const ask = await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms;
  for (let i = 0; i < rs.length; i++) for (const t of rs[i].tiles || []) if (/^light\./.test(t.entity || '')) {
    p._room = i; p._renderTabs(); p._renderForm(); p._bOpen = true; p._select({ group: 'tiles', key: p._tileKey(t), label: t.name || '' }); return true; }
  return false; });
await page.waitForTimeout(900);
if (ask) {
  const row = await R('#pane .tile.sel .mask');
  await check('Licht-Kachel: Schalter „Vor dem Schalten fragen“', /Vor dem Schalten fragen/.test(row || ''), row);
}

// Änderungsliste am Titel, Wiederholen
await H(() => { const p = window.__panel(); p._bClose(); const r = p._state.compact.rooms[p._state.compact.rooms.length - 1]; r.name = r.name + ' QA'; p._markDirty(); p._renderTabs(); });
await page.waitForTimeout(600);
const ed = await R('.toprow > .bedited');
await check('Titel zeigt „Bearbeitet · 1 Änderung“', /Bearbeitet · 1 Änderung/.test(ed || ''), ed);
await H(() => window.__panel().shadowRoot.querySelector('.toprow > .bedited').click());
await page.waitForTimeout(500);
const pop = await R('.mpop');
await check('Klick öffnet die Liste in Klartext', /Raum umbenannt: .+ → .+ QA/.test(pop || ''), pop);
await page.keyboard.press('Escape');
await H(() => window.__panel()._undo());
await page.waitForTimeout(300);
await page.keyboard.press('Meta+Shift+z');
await page.waitForTimeout(500);
const redo = await H(() => { const p = window.__panel(); const rs = p._state.compact.rooms; return rs[rs.length - 1].name; });
await check('⌘⇧Z stellt die zurückgenommene Änderung wieder her', / QA$/.test(redo), redo);
await H(() => { const p = window.__panel(); while ((p._undoStack || []).length) p._undo(); });

// Raum ausblenden
await H(() => { const p = window.__panel(); p._room = 1; p._renderTabs(); p._renderForm(); p._bClose(); });
await page.waitForTimeout(400);
await page.locator('[data-b="rooms"]').first().click();
await page.waitForTimeout(500);
const hideItem = await H(() => [...window.__panel().shadowRoot.querySelectorAll('.combo-opt')].map((e) => e.innerText).find((t) => /Raum ausblenden/.test(t)) || null);
await check('Raummenü bietet „Raum ausblenden“', !!hideItem, hideItem);
await H(() => { const o = [...window.__panel().shadowRoot.querySelectorAll('.combo-opt')].find((e) => /Raum ausblenden/.test(e.innerText)); o.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
await page.waitForTimeout(600);
const hid = await H(() => !!window.__panel()._state.compact.rooms[1].variables.casora_hidden);
await H(() => window.__panel()._bRoomsOpen());
await page.waitForTimeout(600);
const grey = await R('#pane .brow.mhid');
await check('Ausgeblendeter Raum steht grau in „Räume ordnen“ mit „Einblenden“', hid && /Einblenden/.test(grey || ''), grey);
await H(() => window.__panel().shadowRoot.querySelector('#pane .brow.mhid .mshow').click());
await page.waitForTimeout(400);
await check('„Einblenden“ holt den Raum zurück', await H(() => !window.__panel()._state.compact.rooms[1].variables.casora_hidden));

// QR-Code
await H(() => { window.__panel()._mQr(); });
await page.waitForTimeout(800);
const qr = await H(() => { const q = window.__panel().shadowRoot.querySelector('.mqr'); return q && { svg: !!q.querySelector('svg path'), url: q.querySelector('.murl').textContent }; });
await check('„Auf Handy öffnen“ zeigt QR-Code und Adresse ohne Zugangsdaten', qr && qr.svg && /^https?:\/\/[^?#]+$/.test(qr.url) && !/token|auth/i.test(qr.url), qr);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// Zeitreise: Benennen/Anheften
await H(() => { const p = window.__panel(); p._bOpen = true; p._cvFromMenu(); });
await page.waitForTimeout(1500);
const tags = await R('.cv-tags');
await check('Zeitreise bietet Benennen und Anheften', /Benennen|Umbenennen/.test(tags || '') && /Anheften|Lösen/.test(tags || ''), tags);
await H(() => { const p = window.__panel(); if (p._cvClose) p._cvClose(); p._bClose(); });

// F-13: Mobil-Vorschau zeigt „Aktuelle Wiedergabe“ wie das Handy
const mp = await H(() => { const p = window.__panel(); const m = p._pair && p._pair.mobile && p._pair.mobile.chrome;
  const c = ((m && m.items) || []).map((i) => i.card).find((c) => c && [].concat(c.template || []).includes('casora_mobile_now_playing'));
  return c && (c.variables || {}).media_player_1; });
if (mp) {
  await fakeStates(page, { [mp]: { state: 'playing', attributes: { media_title: 'QA Lied', media_artist: 'QA', friendly_name: 'QA Player', supported_features: 16437 } } }, { sticky: true });
  await H(() => { const p = window.__panel(); p._miniSize = 'phone'; p._bSyncSize && p._bSyncSize(); p._rebuildPreview(); });
  await page.waitForTimeout(1500);
  const np = await H(() => !!window.__panel().shadowRoot.querySelector('.card.map .mp-np'));
  await check('Mobil-Vorschau zeigt „Aktuelle Wiedergabe“ (F-13)', np);
} else await check('Handy-Layout mit „Aktuelle Wiedergabe“ (Testhaus)', false);
await finish();
